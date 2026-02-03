import { describe, it, expect } from 'vitest';
import { Adaptive, CommandRouter, ConfigRegistry, ErrorCode } from '../../src/index.js';

const codec = {
  parse: (value) => Number(value),
  format: (value) => value.toString(),
};

describe('CommandRouter', () => {
  it('executes read/write/list commands', () => {
    const registry = new ConfigRegistry();
    registry.register('retry/count', new Adaptive(1), codec);

    const router = new CommandRouter(registry);

    const readResult = router.execute({ type: 'read_config', path: 'retry/count' });
    expect(readResult.ok).toBe(true);

    const writeResult = router.execute({ type: 'write_config', path: 'retry/count', value: '2' });
    expect(writeResult.ok).toBe(true);

    const listResult = router.execute({ type: 'list_config', prefix: 'retry' });
    expect(listResult.ok).toBe(true);
    if (listResult.ok) {
      expect(listResult.data).toEqual(['retry/count']);
    }
  });

  it('rejects unknown commands', () => {
    const registry = new ConfigRegistry();
    const router = new CommandRouter(registry);

    const result = router.execute({ type: 'unknown' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(ErrorCode.INVALID_COMMAND);
    }
  });
});
