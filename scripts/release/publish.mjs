import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { Policy, TimeoutError } from '@git-stunts/alfred';
import { getWorkspacePackageDirs, readJson, rootPath } from './workspace.mjs';

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, { stdio: 'inherit', ...options });
  if (result.status !== 0) {
    console.error(`Command failed: ${cmd} ${args.join(' ')}`);
    process.exit(result.status ?? 1);
  }
}

function runAsync(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit', ...options });
    let settled = false;

    const finalize = (err) => {
      if (settled) return;
      settled = true;
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    };

    const handleAbort = () => {
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 5_000).unref?.();
    };

    if (options.signal) {
      if (options.signal.aborted) {
        handleAbort();
      } else {
        options.signal.addEventListener('abort', handleAbort, { once: true });
      }
    }

    child.on('error', (error) => finalize(error));
    child.on('exit', (code, signal) => {
      if (code === 0) {
        finalize();
        return;
      }
      const reason = signal ? `signal ${signal}` : `exit code ${code}`;
      finalize(new Error(`Command failed (${reason}): ${cmd} ${args.join(' ')}`));
    });
  });
}

async function runWithTimeout(cmd, args, { timeoutMs, label, ...options }) {
  const policy = Policy.timeout(timeoutMs, {
    onTimeout: () => {
      console.error(`Command timed out after ${timeoutMs}ms: ${label ?? cmd}`);
    },
  });

  return policy.execute((signal) => runAsync(cmd, args, { ...options, signal }));
}

async function main() {
  run('node', [rootPath('scripts/release/aggregate.mjs'), '--write']);
  run('node', [rootPath('scripts/release/preflight.mjs')]);

  const packageDirs = getWorkspacePackageDirs();

  const npmToken = process.env.NODE_AUTH_TOKEN || process.env.NPM_TOKEN;
  const useOidc = process.env.GITHUB_ACTIONS === 'true';

  if (!useOidc && !npmToken) {
    console.log('Skipping npm publish (no token and not running in GitHub Actions).');
  } else {
    for (const dir of packageDirs) {
      const pkg = readJson(path.join(dir, 'package.json'));
      if (pkg.private) {
        continue;
      }

      if (useOidc) {
        run('npm', ['publish', '--access', 'public', '--provenance'], { cwd: dir });
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
    const timeoutMs = Number(process.env.JSR_PUBLISH_TIMEOUT_MS ?? 300_000);
    const maxRetries = Number(process.env.JSR_PUBLISH_RETRIES ?? 2);
    let attempt = 0;

    while (attempt <= maxRetries) {
      try {
        await runWithTimeout('npx', ['jsr', 'publish'], {
          cwd: dir,
          timeoutMs,
          label: `jsr publish (${path.basename(dir)})`,
        });
        break;
      } catch (error) {
        attempt += 1;
        const isTimeout = error instanceof TimeoutError;
        const exhausted = attempt > maxRetries;

        if (!isTimeout || exhausted) {
          console.error(`JSR publish failed for ${path.basename(dir)}.`);
          throw error;
        }

        console.warn(
          `JSR publish timed out for ${path.basename(
            dir
          )}. Retrying (${attempt}/${maxRetries})...`
        );
      }
    }
  }

  console.log('Publish complete.');
}

await main();
