import { describe, it, expect } from 'vitest';
import { Adaptive, ConfigRegistry, ErrorCode } from '../../src/index.js';

function createNumberCodec() {
  return {
    parse: (value) => {
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) {
        throw new Error('not a number');
      }
      return parsed;
    },
    format: (value) => value.toString(),
  };
}

describe('ConfigRegistry', () => {
  it('registers and reads values', () => {
    const registry = new ConfigRegistry();
    const adaptive = new Adaptive(3);

    const registerResult = registry.register('bulkhead/api', adaptive, createNumberCodec());
    expect(registerResult.ok).toBe(true);

    const readResult = registry.read('bulkhead/api');
    expect(readResult.ok).toBe(true);
    if (readResult.ok) {
      expect(readResult.data.value).toBe(3);
      expect(readResult.data.formatted).toBe('3');
      expect(readResult.data.path).toBe('bulkhead/api');
    }
  });

  it('writes values and preserves old value on invalid input', () => {
    const registry = new ConfigRegistry();
    const adaptive = new Adaptive(2);

    registry.register('retry/count', adaptive, createNumberCodec());

    const writeResult = registry.write('retry/count', '5');
    expect(writeResult.ok).toBe(true);
    expect(adaptive.get()).toBe(5);

    const invalidWrite = registry.write('retry/count', 'nope');
    expect(invalidWrite.ok).toBe(false);
    if (!invalidWrite.ok) {
      expect(invalidWrite.error.code).toBe(ErrorCode.VALIDATION_FAILED);
    }
    expect(adaptive.get()).toBe(5);
  });

  it('filters keys with path-aware prefix semantics', () => {
    const registry = new ConfigRegistry();
    registry.register('bulkhead', new Adaptive(1), createNumberCodec());
    registry.register('bulkhead/api', new Adaptive(2), createNumberCodec());
    registry.register('bulkhead/api/v2', new Adaptive(4), createNumberCodec());
    registry.register('bulkhead2', new Adaptive(3), createNumberCodec());

    const prefixResult = registry.keys('bulkhead');
    expect(prefixResult.ok).toBe(true);
    if (prefixResult.ok) {
      expect(prefixResult.data).toEqual(['bulkhead', 'bulkhead/api', 'bulkhead/api/v2']);
    }

    const wildcardResult = registry.keys('bulkhead*');
    expect(wildcardResult.ok).toBe(true);
    if (wildcardResult.ok) {
      expect(wildcardResult.data).toEqual([
        'bulkhead',
        'bulkhead/api',
        'bulkhead/api/v2',
        'bulkhead2',
      ]);
    }

    const childrenResult = registry.keys('bulkhead/*');
    expect(childrenResult.ok).toBe(true);
    if (childrenResult.ok) {
      expect(childrenResult.data).toEqual(['bulkhead/api', 'bulkhead/api/v2']);
    }
  });

  it('rejects invalid prefixes', () => {
    const registry = new ConfigRegistry();
    registry.register('valid/path', new Adaptive(1), createNumberCodec());

    const result = registry.keys('/invalid');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(ErrorCode.INVALID_PATH);
    }
  });
});
