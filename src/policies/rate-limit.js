/**
 * @fileoverview Token bucket rate limiter for throughput control.
 *
 * Limits the rate of operations per time window. Unlike bulkhead which
 * limits concurrency (how many at once), rate limit controls throughput
 * (how many per second).
 *
 * @module @git-stunts/alfred/policies/rate-limit
 */

import { RateLimitExceededError } from '../errors.js';
import { resolve } from '../utils/resolvable.js';
import { SystemClock } from '../utils/clock.js';

/**
 * @typedef {Object} RateLimitOptions
 * @property {import('../utils/resolvable.js').Resolvable<number>} rate - Tokens per second
 * @property {import('../utils/resolvable.js').Resolvable<number>} [burst] - Max tokens (defaults to rate)
 * @property {import('../utils/resolvable.js').Resolvable<number>} [queueLimit=0] - Max queued requests (0 = reject)
 * @property {Object} [clock] - Clock for time (TestClock for testing)
 * @property {Object} [telemetry] - Telemetry sink
 */

/**
 * Execute a function and return a promise for its result.
 * @param {Function} fn - The function to execute
 * @returns {Promise<*>} Promise resolving to the function result
 */
function runFn(fn) {
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      return result;
    }
    return Promise.resolve(result);
  } catch (err) {
    return Promise.reject(err);
  }
}

/**
 * Create token bucket operations for rate limiting.
 * @param {RateLimitOptions} options - Rate limit options
 * @param {Object} clock - Clock instance for time
 * @returns {Object} Token bucket operations
 */
function createTokenBucket(options, clock) {
  let tokens = resolve(options.burst ?? options.rate);
  let lastRefill = clock.now();

  function refill() {
    const now = clock.now();
    const elapsed = now - lastRefill;
    if (elapsed <= 0) {
      return;
    }
    const rate = resolve(options.rate);
    const burst = resolve(options.burst ?? rate);
    const newTokens = (elapsed * rate) / 1000;
    tokens = Math.min(burst, tokens + newTokens);
    lastRefill = now;
  }

  function msUntilToken() {
    const rate = resolve(options.rate);
    if (rate <= 0) {
      return Infinity;
    }
    const needed = 1 - tokens;
    if (needed <= 0) {
      return 0;
    }
    return Math.ceil((needed * 1000) / rate);
  }

  function tryAcquire() {
    refill();
    if (tokens >= 1) {
      tokens -= 1;
      return true;
    }
    return false;
  }

  function getTokens() {
    return tokens;
  }

  return { refill, msUntilToken, tryAcquire, getTokens };
}

/**
 * @typedef {Object} TelemetryContext
 * @property {Object|undefined} telemetry - Telemetry sink
 * @property {Object} clock - Clock instance
 * @property {Function} getTokens - Function to get current token count
 * @property {Array} queue - Request queue
 */

/**
 * Create telemetry emitter functions.
 * @param {TelemetryContext} ctx - Telemetry context
 * @returns {Object} Telemetry emitter functions
 */
function createTelemetryEmitters(ctx) {
  const { telemetry, clock, getTokens, queue } = ctx;

  function emitAcquire() {
    if (!telemetry) {
      return;
    }
    telemetry.emit({
      type: 'rateLimit.acquire',
      timestamp: clock.now(),
      tokens: getTokens(),
      queued: queue.length,
    });
  }

  function emitQueued() {
    if (!telemetry) {
      return;
    }
    telemetry.emit({
      type: 'rateLimit.queued',
      timestamp: clock.now(),
      tokens: getTokens(),
      queued: queue.length,
    });
  }

  function emitRejected(retryAfter) {
    if (!telemetry) {
      return;
    }
    telemetry.emit({
      type: 'rateLimit.rejected',
      timestamp: clock.now(),
      tokens: getTokens(),
      queued: queue.length,
      retryAfter,
      metrics: { rateLimitRejections: 1 },
    });
  }

  return { emitAcquire, emitQueued, emitRejected };
}

/**
 * Create queue processor function.
 * @param {Array} queue - Request queue
 * @param {Object} bucket - Token bucket operations
 * @param {Object} clock - Clock instance
 * @returns {Function} Queue processor
 */
function createQueueProcessor(queue, bucket, clock) {
  function processQueue() {
    while (queue.length > 0 && bucket.tryAcquire()) {
      const { resolve: res, fn: queuedFn } = queue.shift();
      res(queuedFn);
    }
    if (queue.length > 0) {
      clock.sleep(bucket.msUntilToken()).then(processQueue);
    }
  }
  return processQueue;
}

/**
 * Creates a token bucket rate limiter.
 *
 * @param {RateLimitOptions} options
 * @returns {{ execute: <T>(fn: () => Promise<T>) => Promise<T>, stats: { tokens: number, queued: number } }}
 *
 * @example
 * // Allow 100 requests per second, burst up to 150
 * const limiter = rateLimit({ rate: 100, burst: 150 });
 * await limiter.execute(() => fetch('/api'));
 *
 * @example
 * // With queueing instead of immediate rejection
 * const limiter = rateLimit({ rate: 10, queueLimit: 50 });
 */
export function rateLimit(options) {
  const clock = options.clock || new SystemClock();
  const queue = [];
  const bucket = createTokenBucket(options, clock);
  const ctx = { telemetry: options.telemetry, clock, getTokens: bucket.getTokens, queue };
  const emitters = createTelemetryEmitters(ctx);
  const processQueue = createQueueProcessor(queue, bucket, clock);

  function execute(fn) {
    const rate = resolve(options.rate);
    const queueLimit = resolve(options.queueLimit ?? 0);

    if (bucket.tryAcquire()) {
      emitters.emitAcquire();
      return runFn(fn);
    }

    if (queue.length >= queueLimit) {
      const retryAfter = bucket.msUntilToken();
      emitters.emitRejected(retryAfter);
      return Promise.reject(new RateLimitExceededError(rate, retryAfter));
    }

    emitters.emitQueued();
    return new Promise((res, rej) => {
      queue.push({ resolve: res, reject: rej, fn });
      if (queue.length === 1) {
        clock.sleep(bucket.msUntilToken()).then(processQueue);
      }
    }).then((queuedFn) => {
      emitters.emitAcquire();
      return runFn(queuedFn);
    });
  }

  return {
    execute,
    get stats() {
      bucket.refill();
      return { tokens: Math.floor(bucket.getTokens()), queued: queue.length };
    },
  };
}
