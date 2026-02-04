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
});
