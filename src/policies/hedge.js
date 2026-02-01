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

/**
 * Creates a Hedge policy.
 *
 * @param {HedgeOptions} options - Hedge configuration
 * @returns {{ execute: <T>(fn: () => Promise<T>) => Promise<T> }}
 */
export function hedge(options) {
  const { 
    delay, 
    maxHedges = 1,
    telemetry = new NoopSink(),
    clock = new SystemClock()
  } = options;

  async function execute(fn) {
    const resolvedDelay = resolve(delay);
    const resolvedMaxHedges = resolve(maxHedges);
    const attempts = [];
    const abortControllers = [];

    // Helper to create a cancellable attempt
    const createAttempt = (index) => {
      const controller = new AbortController();
      abortControllers.push(controller);
      
      const startTime = clock.now();
      telemetry.emit({
        type: 'hedge.attempt',
        timestamp: startTime,
        index,
        metrics: index > 0 ? { hedges: 1 } : {}
      });

      return fn(controller.signal)
        .then(result => {
          const endTime = clock.now();
          telemetry.emit({
            type: 'hedge.success',
            timestamp: endTime,
            index,
            duration: endTime - startTime,
            metrics: { successes: 1 }
          });
          return result;
        })
        .catch(error => {
          // If this was a real error (not abort), we log it
          if (error.name !== 'AbortError') {
            const endTime = clock.now();
            telemetry.emit({
              type: 'hedge.failure',
              timestamp: endTime,
              index,
              error,
              duration: endTime - startTime,
              metrics: { failures: 1 }
            });
          }
          throw error;
        });
    };

    // Start primary attempt
    attempts.push(createAttempt(0));

    // Schedule hedges
    for (let i = 1; i <= resolvedMaxHedges; i++) {
      const hedgePromise = new Promise((resolveResult, rejectResult) => {
        // We use a regular setTimeout here because we want to trigger *new* work
        // independently of the first promise blocking.
        // However, using the clock.sleep abstraction is tricky because we don't want to await it
        // in the main flow. We want to "fire and forget" the timer.
        
        // Since `clock` is an interface, let's assume `sleep` resolves after time.
        // We'll wrap it in an async IIFE.
        (async () => {
          await clock.sleep(resolvedDelay * i);
          // If we are already done, stop.
          // But `Promise.any` handles "first success".
          // We just need to check if we should still spawn.
          // For simplicity, we just spawn and let the race decide.
          // Optimization: Check a `done` flag?
          // Let's rely on Promise.any/race behavior for now.
          
          try {
            const result = await createAttempt(i);
            resolveResult(result);
          } catch (err) {
            rejectResult(err);
          }
        })();
      });
      attempts.push(hedgePromise);
    }

    try {
      // We want the first *successful* result.
      // Promise.any waits for the first fulfillment.
      const result = await Promise.any(attempts);
      return result;
    } catch (aggregateError) {
      // All attempts failed
      throw aggregateError;
    } finally {
      // Cancel pending attempts to save resources
      for (const controller of abortControllers) {
        controller.abort();
      }
    }
  }

  return { execute };
}
