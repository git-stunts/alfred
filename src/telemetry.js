/**
 * @fileoverview Telemetry system for observing resilience policy behavior.
 * Provides composable sinks for capturing events.
 */

/**
 * @typedef {Object} TelemetryEvent
 * @property {string} type - Event type (e.g. 'retry.failure', 'circuit.open')
 * @property {number} timestamp - Event timestamp
 * @property {Record<string, number>} [metrics] - Metric increments (counters)
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
 * Sink that aggregates metrics in memory based on the `metrics` field in events.
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
    const { duration, metrics } = event;

    // 1. Handle explicit metric increments attached to the event
    if (metrics && typeof metrics === 'object') {
      for (const [key, value] of Object.entries(metrics)) {
        if (typeof value === 'number') {
          this.metrics[key] = (this.metrics[key] || 0) + value;
        }
      }
    }

    // 2. Handle Latency (special case for histogram/stats)
    if (typeof duration === 'number') {
      this._updateLatency(duration);
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
    const { latency, ...rest } = this.metrics;
    const avg = latency.count > 0 ? latency.sum / latency.count : 0;
    
    return {
      ...rest,
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
      latency: { count: 0, sum: 0, min: Infinity, max: 0 }
    };
  }
}