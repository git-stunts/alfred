import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { Adaptive } from '../../src/adaptive.js';
import { CommandRouter } from '../../src/router.js';
import { ConfigRegistry } from '../../src/registry.js';
import { executeCommandLine } from '../../src/command-envelope.js';

const alfredctlPath = fileURLToPath(new URL('../../bin/alfredctl.js', import.meta.url));

function runAlfredctl(args) {
  return spawnSync(process.execPath, [alfredctlPath, ...args], {
    encoding: 'utf8',
  });
}

describe('alfredctl', () => {
  it('emits JSONL commands executable by the command channel', () => {
    const output = runAlfredctl(['write', 'retry/count', '5', '--id', 'cmd-1']);

    expect(output.status).toBe(0);
    expect(output.stdout).not.toBe('');

    const line = output.stdout.trim();
    const envelope = JSON.parse(line);
    expect(envelope).toEqual({
      id: 'cmd-1',
      cmd: 'write_config',
      args: { path: 'retry/count', value: '5' },
    });

    const registry = new ConfigRegistry();
    const retryCount = new Adaptive(3);
    registry.register('retry/count', retryCount, {
      parse: (value) => {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) {
          throw new Error('retry/count must be numeric');
        }
        return parsed;
      },
      format: (value) => value.toString(),
    });

    const router = new CommandRouter(registry);
    const resultLine = executeCommandLine(router, line);
    expect(resultLine.ok).toBe(true);
    if (!resultLine.ok) return;
    const result = JSON.parse(resultLine.data);
    expect(result.ok).toBe(true);
    expect(result.data.path).toBe('retry/count');
    expect(result.data.formatted).toBe('5');
  });
});
