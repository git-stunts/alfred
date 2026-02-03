import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { getWorkspacePackageDirs, readJson } from './workspace.mjs';

function collectStringTargets(node, acc) {
  if (typeof node === 'string') {
    acc.add(node);
    return;
  }
  if (!node || typeof node !== 'object') return;
  for (const value of Object.values(node)) {
    collectStringTargets(value, acc);
  }
}

function pickDefaultTarget(node) {
  if (typeof node === 'string') return node;
  if (!node || typeof node !== 'object') return null;
  if (typeof node.default === 'string') return node.default;
  if (typeof node.import === 'string') return node.import;
  if (typeof node.require === 'string') return node.require;
  for (const value of Object.values(node)) {
    const found = pickDefaultTarget(value);
    if (found) return found;
  }
  return null;
}

function normalizePath(filePath) {
  return filePath.replace(/^\.\//, '');
}

function isPathIncluded(files, targetPath) {
  if (!Array.isArray(files) || files.length === 0) return true;
  const normalizedTarget = normalizePath(targetPath);

  return files.some((entry) => {
    const normalizedEntry = normalizePath(entry);
    if (normalizedEntry === normalizedTarget) return true;

    const isDirectory = normalizedEntry.endsWith('/') || !path.basename(normalizedEntry).includes('.');
    if (isDirectory) {
      const prefix = normalizedEntry.endsWith('/') ? normalizedEntry : `${normalizedEntry}/`;
      return normalizedTarget.startsWith(prefix);
    }
    return false;
  });
}

function getExportsMap(exportsField) {
  const map = new Map();

  if (!exportsField) return map;

  if (typeof exportsField === 'string') {
    map.set('.', {
      defaultTarget: pickDefaultTarget(exportsField),
      allTargets: new Set([exportsField].filter(Boolean)),
    });
    return map;
  }

  if (Array.isArray(exportsField)) {
    const targets = new Set();
    collectStringTargets(exportsField, targets);
    map.set('.', {
      defaultTarget: pickDefaultTarget(exportsField),
      allTargets: targets,
    });
    return map;
  }

  for (const [key, value] of Object.entries(exportsField)) {
    const targets = new Set();
    collectStringTargets(value, targets);
    map.set(key, {
      defaultTarget: pickDefaultTarget(value),
      allTargets: targets,
    });
  }

  return map;
}

function ensureFileExists(filePath, errors, label) {
  if (!fs.existsSync(filePath)) {
    errors.push(`${label} missing: ${filePath}`);
  }
}

function reportErrors(errors) {
  if (errors.length === 0) return;
  console.error('\nPreflight checks failed:\n');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  console.error('');
  process.exit(1);
}

const packageDirs = getWorkspacePackageDirs();
const errors = [];

let expectedVersion = null;

for (const dir of packageDirs) {
  const packageJsonPath = path.join(dir, 'package.json');
  const packageJson = readJson(packageJsonPath);
  const packageName = packageJson.name ?? path.basename(dir);
  const version = packageJson.version;

  if (!expectedVersion) {
    expectedVersion = version;
  } else if (version !== expectedVersion) {
    errors.push(`Version mismatch: ${packageName} is ${version}, expected ${expectedVersion}`);
  }

  const jsrPath = path.join(dir, 'jsr.json');
  if (fs.existsSync(jsrPath)) {
    const jsrJson = readJson(jsrPath);
    if (jsrJson.version !== version) {
      errors.push(`Version mismatch: ${packageName} jsr.json is ${jsrJson.version}, package.json is ${version}`);
    }

    const exportsMap = getExportsMap(packageJson.exports ?? {});
    const jsrExports = jsrJson.exports ?? {};
    const packageExportKeys = Array.from(exportsMap.keys()).filter((key) => key !== './package.json');
    const jsrExportKeys = Object.keys(jsrExports);

    const missingInJsr = packageExportKeys.filter((key) => !jsrExportKeys.includes(key));
    const extraInJsr = jsrExportKeys.filter((key) => !packageExportKeys.includes(key));

    if (missingInJsr.length > 0) {
      errors.push(`${packageName} jsr.json missing exports: ${missingInJsr.join(', ')}`);
    }
    if (extraInJsr.length > 0) {
      errors.push(`${packageName} jsr.json has extra exports: ${extraInJsr.join(', ')}`);
    }

    for (const key of jsrExportKeys) {
      const jsrTarget = jsrExports[key];
      const pkgTarget = exportsMap.get(key)?.defaultTarget;
      if (pkgTarget && jsrTarget && normalizePath(pkgTarget) !== normalizePath(jsrTarget)) {
        errors.push(`${packageName} export mismatch for ${key}: package.json=${pkgTarget}, jsr.json=${jsrTarget}`);
      }
    }
  }

  // Validate export targets exist and are included in files
  const exportsMap = getExportsMap(packageJson.exports ?? {});
  const filesList = packageJson.files ?? [];

  for (const [key, entry] of exportsMap.entries()) {
    for (const target of entry.allTargets) {
      if (typeof target !== 'string') continue;
      const targetPath = path.join(dir, target);
      ensureFileExists(targetPath, errors, `${packageName} export ${key}`);

      if (!isPathIncluded(filesList, target)) {
        errors.push(`${packageName} export ${key} target ${target} not included in files[]`);
      }
    }
  }

  if (packageJson.main) {
    ensureFileExists(path.join(dir, packageJson.main), errors, `${packageName} main`);
  }
  if (packageJson.types) {
    ensureFileExists(path.join(dir, packageJson.types), errors, `${packageName} types`);
  }

  const jsrPathForExists = path.join(dir, 'jsr.json');
  if (fs.existsSync(jsrPathForExists)) {
    const jsrJson = readJson(jsrPathForExists);
    for (const [key, value] of Object.entries(jsrJson.exports ?? {})) {
      const jsrTargetPath = path.join(dir, value);
      ensureFileExists(jsrTargetPath, errors, `${packageName} jsr export ${key}`);
    }
  }
}

reportErrors(errors);

const packResult = spawnSync('pnpm', ['-r', 'pack', '--dry-run'], { stdio: 'inherit' });
if (packResult.status !== 0) {
  process.exit(packResult.status ?? 1);
}

console.log('\nPreflight checks passed.');
