/**
 * Redact sensitive fields recursively.
 * @param {unknown} value
 * @returns {unknown}
 */
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

  /**
   * @param {import('./index.d.ts').CommandAuditEvent} event
   */
  record(event) {
    this.#events.push(event);
  }

  /**
   * @returns {import('./index.d.ts').CommandAuditEvent[]}
   */
  entries() {
    return [...this.#events];
  }

  /**
   * Clear all captured audit events.
   */
  clear() {
    this.#events.length = 0;
  }
}

/**
 * Console audit sink for command events.
 */
export class ConsoleAuditSink {
  #logger;

  /**
   * @param {{ log: (...args: unknown[]) => void }} [logger]
   */
  constructor(logger = console) {
    this.#logger = logger;
  }

  /**
   * @param {import('./index.d.ts').CommandAuditEvent} event
   */
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

  /**
   * @param {Array<{ record(event: import('./index.d.ts').CommandAuditEvent): void }>} sinks
   */
  constructor(sinks) {
    this.#sinks = Array.isArray(sinks) ? sinks : [];
  }

  /**
   * @param {import('./index.d.ts').CommandAuditEvent} event
   */
  record(event) {
    for (const sink of this.#sinks) {
      try {
        sink?.record?.(event);
      } catch {
        // Swallow to avoid one sink breaking fan-out.
      }
    }
  }
}
