import { describe, it, expect } from 'vitest';

import { CommandRouter } from '../../src/router.js';
import { ConfigRegistry } from '../../src/registry.js';
import { InMemoryAuditSink } from '../../src/audit.js';
import { opaqueTokenAuth } from '../../src/auth.js';
import { executeCommandLine } from '../../src/command-envelope.js';

describe('command pipeline', () => {
  it('audits invalid JSON lines', () => {
    const registry = new ConfigRegistry();
    const router = new CommandRouter(registry);
    const audit = new InMemoryAuditSink();

    const resultLine = executeCommandLine(router, '{"bad":', { audit });
    expect(resultLine.ok).toBe(true);

    const events = audit.entries();
    expect(events).toHaveLength(2);
    expect(events[0].phase).toBe('attempt');
    expect(events[1].phase).toBe('result');
    expect(events[1].ok).toBe(false);
  });

  it('auth denies before validation and is audited', () => {
    const registry = new ConfigRegistry();
    const router = new CommandRouter(registry);
    const audit = new InMemoryAuditSink();
    const auth = opaqueTokenAuth(['good-token']);

    const line = JSON.stringify({
      id: 'cmd-1',
      cmd: 'read_config',
      args: {},
      auth: 'bad-token',
    });

    const resultLine = executeCommandLine(router, line, { audit, auth });
    expect(resultLine.ok).toBe(true);
    if (!resultLine.ok) return;

    const result = JSON.parse(resultLine.data);
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('AUTH_DENIED');

    const events = audit.entries();
    expect(events).toHaveLength(2);
    expect(events[0].phase).toBe('attempt');
    expect(events[1].phase).toBe('result');
    expect(events[1].ok).toBe(false);
  });
});
