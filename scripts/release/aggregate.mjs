import fs from 'node:fs';
import path from 'node:path';
import { getWorkspacePackageDirs, readJson, rootPath } from './workspace.mjs';

function stripFirstHeading(content) {
  const lines = content.split('\n');
  if (lines.length === 0) return content;
  if (lines[0].startsWith('# ')) {
    return lines.slice(1).join('\n').replace(/^\n+/, '');
  }
  return content;
}

function buildRootChangelog(packages) {
  const header = [
    '<!-- AUTO-GENERATED: edit package CHANGELOGs instead. -->',
    '# Changelog',
    '',
    'Aggregated changelog for the Alfred package family.',
    '',
  ];

  const sections = packages.map((pkg) => {
    const changelogPath = path.join(pkg.dir, 'CHANGELOG.md');
    if (!fs.existsSync(changelogPath)) return null;
    const content = fs.readFileSync(changelogPath, 'utf8');
    const stripped = stripFirstHeading(content);
    return [`## ${pkg.name}`, '', stripped.trim(), ''].join('\n');
  });

  return [...header, ...sections.filter(Boolean)].join('\n');
}

function writeFile(filePath, content, mode) {
  if (mode === 'check') {
    if (!fs.existsSync(filePath)) {
      throw new Error(`${filePath} is missing; run with --write`);
    }
    const existing = fs.readFileSync(filePath, 'utf8');
    if (existing.trim() !== content.trim()) {
      throw new Error(`${filePath} is out of date; run with --write`);
    }
    return;
  }

  fs.writeFileSync(filePath, `${content.trim()}\n`);
}

const mode = process.argv.includes('--check') ? 'check' : 'write';

const packageDirs = getWorkspacePackageDirs();
const packages = packageDirs.map((dir) => {
  const packageJson = readJson(path.join(dir, 'package.json'));
  return {
    dir,
    name: packageJson.name ?? path.basename(dir),
    description: packageJson.description ?? '',
  };
});

const changelogContent = buildRootChangelog(packages);

writeFile(rootPath('CHANGELOG.md'), changelogContent, mode);

if (mode === 'check') {
  console.log('Aggregate CHANGELOG.md is up to date.');
} else {
  console.log('Wrote aggregate CHANGELOG.md.');
}
