/**
 * @fileoverview Telemetry system for observing resilience policy behavior.
 * Provides composable sinks for capturing events.
 */

/**
 * @typedef {Object} TelemetryEvent
 * @property {string} type - Event type (e.g. 'retry', 'circuit.open')
 * @property {number} timestamp - Event timestamp
 * @property {Object} [metadata] - Additional event data
 */

/**
 * @interface TelemetrySink
 * @method emit(event: TelemetryEvent) => void
 */

/**
 * Sink that stores events in memory. Useful for testing and debugging.
 * @implements {TelemetrySink}
 */
export class InMemorySink {
  constructor() {
    this.events = [];
  }

  emit(event) {
    this.events.push(event);
  }

  clear() {
    this.events = [];
  }
}

/**
 * Sink that logs events to console.
 * @implements {TelemetrySink}
 */
export class ConsoleSink {
  emit(event) {
    const { type, timestamp = Date.now(), ...rest } = event;
    // eslint-disable-next-line no-console
    console.log(`[${type}] ${new Date(timestamp).toISOString()}`, rest);
  }
}

/**
 * Sink that does nothing. Default.
 * @implements {TelemetrySink}
 */
export class NoopSink {
  emit(_event) {
    // No-op
  }
}

/**
 * Sink that broadcasts to multiple other sinks.
 * @implements {TelemetrySink}
 */
export class MultiSink {
  /**
   * @param {TelemetrySink[]} sinks
   */
  constructor(sinks = []) {
    this.sinks = sinks;
  }

  emit(event) {
    for (const sink of this.sinks) {
      sink.emit(event);
    }
  }
}
