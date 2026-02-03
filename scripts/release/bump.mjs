import path from 'node:path';
import { getWorkspacePackageDirs, readJson, writeJson } from './workspace.mjs';

function parseVersion(version) {
  const match = /^([0-9]+)\.([0-9]+)\.([0-9]+)$/.exec(version);
  if (!match) {
    throw new Error(`Invalid version: ${version}`);
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function formatVersion({ major, minor, patch }) {
  return `${major}.${minor}.${patch}`;
}

function bumpVersion(current, bumpType) {
  const parsed = parseVersion(current);

  if (bumpType === 'major') {
    return formatVersion({ major: parsed.major + 1, minor: 0, patch: 0 });
  }
  if (bumpType === 'minor') {
    return formatVersion({ major: parsed.major, minor: parsed.minor + 1, patch: 0 });
  }
  if (bumpType === 'patch') {
    return formatVersion({ major: parsed.major, minor: parsed.minor, patch: parsed.patch + 1 });
  }

  throw new Error(`Unknown bump type: ${bumpType}`);
}

function resolveNextVersion(currentVersion, arg) {
  if (!arg) {
    throw new Error('Usage: node scripts/release/bump.mjs <patch|minor|major|x.y.z>');
  }

  if (['patch', 'minor', 'major'].includes(arg)) {
    return bumpVersion(currentVersion, arg);
  }

  parseVersion(arg);
  return arg;
}

const packageDirs = getWorkspacePackageDirs();
const versions = packageDirs.map((dir) => readJson(path.join(dir, 'package.json')).version);
const uniqueVersions = Array.from(new Set(versions));

if (uniqueVersions.length !== 1) {
  throw new Error(`Workspace versions are not aligned: ${uniqueVersions.join(', ')}`);
}

const currentVersion = uniqueVersions[0];
const nextVersion = resolveNextVersion(currentVersion, process.argv[2]);

for (const dir of packageDirs) {
  const packageJsonPath = path.join(dir, 'package.json');
  const packageJson = readJson(packageJsonPath);
  packageJson.version = nextVersion;
  writeJson(packageJsonPath, packageJson);

  const jsrPath = path.join(dir, 'jsr.json');
  try {
    const jsrJson = readJson(jsrPath);
    jsrJson.version = nextVersion;
    writeJson(jsrPath, jsrJson);
  } catch (err) {
    // ignore missing jsr.json
  }
}

console.log(`Bumped workspace version: ${currentVersion} -> ${nextVersion}`);
