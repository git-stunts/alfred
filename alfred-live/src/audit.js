function redactSensitive(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => redactSensitive(entry));
  }
  if (!value || typeof value !== 'object') {
    return value;
  }

  const redacted = {};
  for (const [key, entry] of Object.entries(value)) {
    if (/auth|token|password/i.test(key)) {
      redacted[key] = '[REDACTED]';
    } else {
      redacted[key] = redactSensitive(entry);
    }
  }
  return redacted;
}

/**
 * In-memory audit sink for command events.
 */
export class InMemoryAuditSink {
  #events = [];

  record(event) {
    this.#events.push(event);
  }

  entries() {
    return [...this.#events];
  }

  clear() {
    this.#events.length = 0;
  }
}

/**
 * Console audit sink for command events.
 */
export class ConsoleAuditSink {
  #logger;

  constructor(logger = console) {
    this.#logger = logger;
  }

  record(event) {
    const payload = redactSensitive(event);
    this.#logger.log('[alfred-live.audit]', payload);
  }
}

/**
 * Fan-out audit sink for multiple destinations.
 */
export class MultiAuditSink {
  #sinks;

  constructor(sinks) {
    this.#sinks = Array.isArray(sinks) ? sinks : [];
  }

  record(event) {
    for (const sink of this.#sinks) {
      sink?.record?.(event);
    }
  }
}
