/**
 * @fileoverview Bulkhead policy for concurrency limiting.
 *
 * Limits the number of concurrent executions of an operation,
 * optionally queuing excess requests up to a limit.
 *
 * @module @git-stunts/alfred/policies/bulkhead
 */

import { BulkheadRejectedError } from '../errors.js';
import { SystemClock } from '../utils/clock.js';
import { NoopSink } from '../telemetry.js';
import { resolve as resolveValue } from '../utils/resolvable.js';

/**
 * @typedef {Object} BulkheadOptions
 * @property {number} limit - Maximum concurrent executions
 * @property {number} [queueLimit=0] - Maximum pending requests in queue
 * @property {import('../telemetry.js').TelemetrySink} [telemetry] - Telemetry sink
 * @property {{ now(): number }} [clock] - Clock for timestamps
 */

/**
 * @typedef {Object} BulkheadStats
 * @property {number} active - Currently executing requests
 * @property {number} pending - Requests waiting in queue
 * @property {number} available - Remaining execution slots
 */

class BulkheadPolicy {
  constructor(options) {
    const {
      limit,
      queueLimit = 0,
      telemetry = new NoopSink(),
      clock = new SystemClock(),
    } = options;

    if (limit <= 0) {
      throw new Error('Bulkhead limit must be greater than 0');
    }

    this.limit = limit;
    this.queueLimit = queueLimit;
    this.telemetry = telemetry;
    this.clock = clock;

    this.active = 0;
    this.queue = [];
  }

  processQueue() {
    const limit = resolveValue(this.limit);
    if (this.active < limit && this.queue.length > 0) {
      const { fn, resolve: promiseResolve, reject } = this.queue.shift();
      this.active++;

      this.emitEvent('bulkhead.execute', {
        active: this.active,
        pending: this.queue.length,
      });

      Promise.resolve()
        .then(() => fn())
        .then(
          (result) => {
            this.emitEvent('bulkhead.complete', {
              active: this.active,
              pending: this.queue.length,
              metrics: { successes: 1 },
            });
            promiseResolve(result);
          },
          (error) => {
            this.emitEvent('bulkhead.complete', {
              active: this.active,
              pending: this.queue.length,
              metrics: { failures: 1 },
            });
            reject(error);
          }
        )
        .finally(() => {
          this.active--;
          this.processQueue();
        });
    }
  }

  emitEvent(type, data) {
    this.telemetry.emit({
      type,
      timestamp: this.clock.now(),
      ...data,
    });
  }

  async execute(fn) {
    const limit = resolveValue(this.limit);
    const queueLimit = resolveValue(this.queueLimit);

    if (this.active < limit) {
      this.active++;
      this.emitEvent('bulkhead.execute', {
        active: this.active,
        pending: this.queue.length,
      });

      try {
        const result = await fn();
        this.emitEvent('bulkhead.complete', {
          active: this.active,
          pending: this.queue.length,
          metrics: { successes: 1 },
        });
        return result;
      } catch (error) {
        this.emitEvent('bulkhead.complete', {
          active: this.active,
          pending: this.queue.length,
          metrics: { failures: 1 },
        });
        throw error;
      } finally {
        this.active--;
        this.processQueue();
      }
    }

    if (this.queue.length < queueLimit) {
      this.emitEvent('bulkhead.queued', {
        active: this.active,
        pending: this.queue.length + 1,
      });

      return new Promise((resolve, reject) => {
        this.queue.push({ fn, resolve, reject });
      });
    }

    this.emitEvent('bulkhead.reject', {
      active: this.active,
      pending: this.queue.length,
      metrics: { bulkheadRejections: 1 },
    });
    throw new BulkheadRejectedError(limit, queueLimit);
  }

  get stats() {
    return {
      active: this.active,
      pending: this.queue.length,
      available: Math.max(0, resolveValue(this.limit) - this.active),
    };
  }
}

/**
 * Creates a bulkhead policy.
 *
 * @param {BulkheadOptions} options - Bulkhead configuration
 * @returns {{ execute: <T>(fn: () => Promise<T>) => Promise<T>, stats: BulkheadStats }}
 */
export function bulkhead(options) {
  const policy = new BulkheadPolicy(options);

  return {
    execute: (fn) => policy.execute(fn),
    get stats() {
      return policy.stats;
    },
  };
}
