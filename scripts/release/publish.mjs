import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { getWorkspacePackageDirs, readJson, rootPath } from './workspace.mjs';

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, { stdio: 'inherit', ...options });
  if (result.status !== 0) {
    console.error(`Command failed: ${cmd} ${args.join(' ')}`);
    process.exit(result.status ?? 1);
  }
}

run('node', [rootPath('scripts/release/aggregate.mjs'), '--write']);
run('node', [rootPath('scripts/release/preflight.mjs')]);

const packageDirs = getWorkspacePackageDirs();

const npmToken = process.env.NODE_AUTH_TOKEN || process.env.NPM_TOKEN;

if (!npmToken) {
  console.log('Skipping npm publish (NODE_AUTH_TOKEN/NPM_TOKEN not set).');
} else {
  for (const dir of packageDirs) {
    const pkg = readJson(path.join(dir, 'package.json'));
    if (pkg.private) {
      continue;
    }
    run('pnpm', ['publish', '--access', 'public', '--no-git-checks'], { cwd: dir });
  }
}

for (const dir of packageDirs) {
  const jsrPath = path.join(dir, 'jsr.json');
  if (!fs.existsSync(jsrPath)) {
    continue;
  }
  run('npx', ['jsr', 'publish'], { cwd: dir });
}

console.log('Publish complete.');
