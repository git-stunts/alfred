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

// Map event types to metric counters
const EVENT_MAP = {
  'retry.scheduled': 'retries',
  'retry.failure': 'failures',
  'retry.success': 'successes',
  'circuit.failure': 'failures',
  'circuit.success': 'successes',
  'circuit.open': 'circuitBreaks',
  'bulkhead.reject': 'bulkheadRejections',
  'timeout': 'timeouts',
  'hedge.failure': 'failures',
  'hedge.success': 'successes'
};

/**
 * Sink that aggregates metrics in memory.
 * @implements {TelemetrySink}
 */
export class MetricsSink {
  constructor() {
    this.clear();
  }

  /**
   * Processes a telemetry event and updates internal counters.
   * @param {TelemetryEvent} event 
   */
  emit(event) {
    const { type, duration } = event;

    if (typeof duration === 'number') {
      this._updateLatency(duration);
    }

    if (type === 'hedge.attempt' && event.index > 0) {
      this.metrics.hedges++;
      return;
    }

    const counter = EVENT_MAP[type];
    if (counter) {
      this.metrics[counter]++;
    }
  }

  _updateLatency(ms) {
    const { latency } = this.metrics;
    latency.count++;
    latency.sum += ms;
    latency.min = Math.min(latency.min, ms);
    latency.max = Math.max(latency.max, ms);
  }

  /**
   * Returns a snapshot of the current metrics.
   */
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

  /**
   * Resets all metrics to zero.
   */
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
