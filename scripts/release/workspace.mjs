import fs from 'node:fs';
import path from 'node:path';

const ROOT_DIR = process.cwd();

function readWorkspacePatterns() {
  const workspacePath = path.join(ROOT_DIR, 'pnpm-workspace.yaml');
  if (!fs.existsSync(workspacePath)) {
    throw new Error('pnpm-workspace.yaml not found at repo root.');
  }

  const lines = fs.readFileSync(workspacePath, 'utf8').split('\n');
  const patterns = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('-')) continue;
    const raw = trimmed.replace(/^-\s*/, '').trim();
    if (!raw) continue;
    const unquoted = raw.replace(/^['"]/, '').replace(/['"]$/, '');
    patterns.push(unquoted);
  }

  return patterns;
}

function patternToRegex(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const withWildcards = escaped.replace(/\*/g, '.*');
  return new RegExp(`^${withWildcards}$`);
}

export function getWorkspacePackageDirs() {
  const patterns = readWorkspacePatterns();
  const entries = fs.readdirSync(ROOT_DIR, { withFileTypes: true });
  const directories = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => !name.startsWith('.') && name !== 'node_modules');

  const matched = new Set();

  for (const pattern of patterns) {
    if (!pattern.includes('*')) {
      matched.add(pattern);
      continue;
    }

    const regex = patternToRegex(pattern);
    for (const dir of directories) {
      if (regex.test(dir)) {
        matched.add(dir);
      }
    }
  }

  const packageDirs = Array.from(matched)
    .map((dir) => path.join(ROOT_DIR, dir))
    .filter((dir) => fs.existsSync(path.join(dir, 'package.json')))
    .sort();

  if (packageDirs.length === 0) {
    throw new Error('No workspace packages found. Check pnpm-workspace.yaml patterns.');
  }

  return packageDirs;
}

export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function writeJson(filePath, value) {
  const contents = `${JSON.stringify(value, null, 2)}\n`;
  fs.writeFileSync(filePath, contents);
}

export function rootPath(...segments) {
  return path.join(ROOT_DIR, ...segments);
}
