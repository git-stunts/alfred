import { describe, it, expect } from 'vitest';

import { Adaptive } from '../../src/adaptive.js';
import { CommandRouter } from '../../src/router.js';
import { ConfigRegistry } from '../../src/registry.js';
import {
  decodeCommandEnvelope,
  encodeCommandEnvelope,
  executeCommandLine,
} from '../../src/command-envelope.js';

function parseJsonLine(line) {
  return JSON.parse(line);
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let result = Math.imul(state ^ (state >>> 15), 1 | state);
    result ^= result + Math.imul(result ^ (result >>> 7), 61 | result);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInt(rand, min, max) {
  return Math.floor(rand() * (max - min + 1)) + min;
}

function randomString(rand, length) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_/:.*';
  let value = '';
  for (let i = 0; i < length; i += 1) {
    value += alphabet[randomInt(rand, 0, alphabet.length - 1)];
  }
  return value;
}

function randomPath(rand) {
  const segments = randomInt(rand, 1, 4);
  const parts = [];
  for (let i = 0; i < segments; i += 1) {
    parts.push(randomString(rand, randomInt(rand, 1, 8)));
  }
  return parts.join('/');
}

describe('command envelope', () => {
  it('round-trips encode/decode', () => {
    const envelope = {
      id: 'cmd-1',
      cmd: 'read_config',
      args: { path: 'retry/count' },
    };

    const encoded = encodeCommandEnvelope(envelope);
    expect(encoded.ok).toBe(true);

    const decoded = decodeCommandEnvelope(encoded.data);
    expect(decoded.ok).toBe(true);
    expect(decoded.data).toEqual(envelope);
  });

  it('rejects unknown fields', () => {
    const line = JSON.stringify({
      id: 'cmd-2',
      cmd: 'list_config',
      args: {},
      extra: true,
    });

    const decoded = decodeCommandEnvelope(line);
    expect(decoded.ok).toBe(false);
    if (!decoded.ok) {
      expect(decoded.error.code).toBe('INVALID_COMMAND');
    }
  });

  it('executes JSONL commands and returns a result envelope', () => {
    const registry = new ConfigRegistry();
    const limit = new Adaptive(10);
    registry.register('bulkhead/limit', limit, {
      parse: (value) => Number(value),
      format: (value) => value.toString(),
    });

    const router = new CommandRouter(registry);

    const encoded = encodeCommandEnvelope({
      id: 'cmd-3',
      cmd: 'write_config',
      args: { path: 'bulkhead/limit', value: '5' },
    });

    if (!encoded.ok) throw new Error(encoded.error.message);

    const resultLine = executeCommandLine(router, encoded.data);
    expect(resultLine.ok).toBe(true);
    if (!resultLine.ok) return;

    const result = parseJsonLine(resultLine.data);
    expect(result.id).toBe('cmd-3');
    expect(result.ok).toBe(true);
    expect(result.data.path).toBe('bulkhead/limit');
    expect(result.data.formatted).toBe('5');
  });

  it('returns error envelopes for invalid JSON lines', () => {
    const registry = new ConfigRegistry();
    const router = new CommandRouter(registry);

    const resultLine = executeCommandLine(router, '{"bad":');
    expect(resultLine.ok).toBe(true);
    if (!resultLine.ok) return;

    const result = parseJsonLine(resultLine.data);
    expect(result.id).toBe('unknown');
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('INVALID_COMMAND');
  });

  it('handles randomized JSONL and junk input without throwing', () => {
    const registry = new ConfigRegistry();
    const counter = new Adaptive(1);
    registry.register('retry/count', counter, {
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

    const rand = mulberry32(0xade1f00d);
    const generators = [
      (i) =>
        JSON.stringify({
          id: `cmd-${i}`,
          cmd: 'read_config',
          args: { path: rand() > 0.6 ? 'retry/count' : randomPath(rand) },
        }),
      (i) =>
        JSON.stringify({
          id: `cmd-${i}`,
          cmd: 'write_config',
          args: { path: rand() > 0.6 ? 'retry/count' : randomPath(rand), value: '5' },
        }),
      (i) =>
        JSON.stringify({
          id: `cmd-${i}`,
          cmd: 'list_config',
          args: rand() > 0.5 ? { prefix: randomPath(rand) } : {},
        }),
      (i) =>
        JSON.stringify({
          id: '',
          cmd: 'read_config',
          args: { path: randomPath(rand) },
        }),
      (i) =>
        JSON.stringify({
          id: `cmd-${i}`,
          cmd: 'read_config',
          args: { path: 123 },
        }),
      (i) =>
        JSON.stringify({
          id: `cmd-${i}`,
          cmd: 'read_config',
          args: { path: 'retry/count', extra: true },
        }),
      (i) =>
        JSON.stringify({
          id: `cmd-${i}`,
          cmd: 'unknown',
          args: {},
        }),
      () => JSON.stringify({ foo: 'bar' }),
      () => JSON.stringify([1, 2, 3]),
      () => JSON.stringify(42),
      () => '{ "bad": ',
      () => '{',
      () => 'not-json',
      () => '',
      () => '   ',
    ];

    for (let i = 0; i < 1000; i += 1) {
      const generator = generators[randomInt(rand, 0, generators.length - 1)];
      const line = generator(i);
      const resultLine = executeCommandLine(router, line);
      expect(resultLine.ok).toBe(true);
      if (!resultLine.ok) continue;
      const result = parseJsonLine(resultLine.data);
      expect(typeof result.id).toBe('string');
      expect(result.id.length).toBeGreaterThan(0);
      expect(typeof result.ok).toBe('boolean');
    }
  });
});
