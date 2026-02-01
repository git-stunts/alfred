/**
 * @fileoverview Hedge policy for speculative execution.
 *
 * Starts concurrent "hedged" attempts if the primary attempt takes too long,
 * helping to reduce tail latency in distributed systems.
 *
 * @module @git-stunts/alfred/policies/hedge
 */

import { SystemClock } from '../utils/clock.js';
import { NoopSink } from '../telemetry.js';
import { resolve } from '../utils/resolvable.js';

/**
 * @typedef {Object} HedgeOptions
 * @property {number} delay - Milliseconds to wait before spawning a hedge.
 * @property {number} [maxHedges=1] - Maximum number of hedged attempts to spawn.
 * @property {import('../telemetry.js').TelemetrySink} [telemetry] - Telemetry sink.
 * @property {{ now(): number, sleep(ms: number): Promise<void> }} [clock] - Clock for testing.
 */

class HedgeExecutor {
  constructor(fn, options) {
    this.fn = fn;
    this.options = {
      telemetry: new NoopSink(),
      clock: new SystemClock(),
      maxHedges: 1,
      ...options,
    };
    this.abortControllers = [];
    this._finished = false;
  }

  async execute() {
    const delay = resolve(this.options.delay);
    const maxHedges = resolve(this.options.maxHedges);
    const attempts = [];

    // Start primary attempt
    attempts.push(this.createAttempt(0));

    // Schedule hedges
    for (let i = 1; i <= maxHedges; i++) {
      attempts.push(this.scheduleHedge(i, delay * i));
    }

    try {
      return await Promise.any(attempts);
    } finally {
      this.cancelAll();
    }
  }

  createAttempt(index) {
    const controller = new AbortController();
    this.abortControllers.push(controller);
    const { clock, telemetry } = this.options;

    const startTime = clock.now();
    telemetry.emit({
      type: 'hedge.attempt',
      timestamp: startTime,
      index,
      metrics: index > 0 ? { hedges: 1 } : {},
    });

    return this.fn(controller.signal)
      .then((result) => {
        const endTime = clock.now();
        telemetry.emit({
          type: 'hedge.success',
          timestamp: endTime,
          index,
          duration: endTime - startTime,
          metrics: { successes: 1 },
        });
        return result;
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          const endTime = clock.now();
          telemetry.emit({
            type: 'hedge.failure',
            timestamp: endTime,
            index,
            error,
            duration: endTime - startTime,
            metrics: { failures: 1 },
          });
        }
        throw error;
      });
  }

  scheduleHedge(index, delayMs) {
    return this.options.clock.sleep(delayMs).then(() => {
      if (this._finished) {
        return new Promise(() => {}); // Never resolve if we are done
      }
      return this.createAttempt(index);
    });
  }

  cancelAll() {
    this._finished = true;
    for (const controller of this.abortControllers) {
      controller.abort();
    }
  }
}

/**
 * Creates a Hedge policy.
 *
 * @param {HedgeOptions} options - Hedge configuration
 * @returns {{ execute: <T>(fn: () => Promise<T>) => Promise<T> }}
 */
export function hedge(options) {
  return {
    execute: (fn) => new HedgeExecutor(fn, options).execute(),
  };
}
