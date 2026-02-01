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

/**
 * Sink that aggregates metrics in memory.
 * @implements {TelemetrySink}
 */
export class MetricsSink {
  constructor() {
    this.metrics = {
      retries: 0,
      failures: 0,
      successes: 0,
      circuitBreaks: 0,
      bulkheadRejections: 0,
      timeouts: 0,
      hedges: 0,
      latency: {
        count: 0,
        sum: 0,
        min: Infinity,
        max: 0
      }
    };
  }

  emit(event) {
    const { type, duration } = event;

    // Track latency for any event with a duration
    if (typeof duration === 'number') {
      this.metrics.latency.count++;
      this.metrics.latency.sum += duration;
      this.metrics.latency.min = Math.min(this.metrics.latency.min, duration);
      this.metrics.latency.max = Math.max(this.metrics.latency.max, duration);
    }

    switch (type) {
      case 'retry.scheduled':
        this.metrics.retries++;
        break;
      case 'retry.failure':
      case 'circuit.failure':
      case 'hedge.failure':
        this.metrics.failures++;
        break;
      case 'retry.success':
      case 'circuit.success':
      case 'hedge.success':
        this.metrics.successes++;
        break;
      case 'circuit.open':
        this.metrics.circuitBreaks++;
        break;
      case 'bulkhead.reject':
        this.metrics.bulkheadRejections++;
        break;
      case 'timeout':
        this.metrics.timeouts++;
        break;
      case 'hedge.attempt':
        // Only count index > 0 as a hedge attempt
        if (event.index > 0) {
          this.metrics.hedges++;
        }
        break;
    }
  }

  get stats() {
    const { latency } = this.metrics;
    const avg = latency.count > 0 ? latency.sum / latency.count : 0;
    
    return {
      ...this.metrics,
      latency: {
        ...latency,
        avg
      }
    };
  }

  clear() {
    this.metrics = {
      retries: 0,
      failures: 0,
      successes: 0,
      circuitBreaks: 0,
      bulkheadRejections: 0,
      timeouts: 0,
      hedges: 0,
      latency: { count: 0, sum: 0, min: Infinity, max: 0 }
    };
  }
}