/**
 * @fileoverview Timeout policy for async operations.
 *
 * Provides time-limited execution with AbortSignal support for
 * cooperative cancellation of in-flight operations.
 *
 * @module @git-stunts/alfred/policies/timeout
 */

import { TimeoutError } from '../errors.js';
import { NoopSink } from '../telemetry.js';
import { SystemClock } from '../utils/clock.js';
import { resolve } from '../utils/resolvable.js';

/**
 * @typedef {Object} TimeoutOptions
 * @property {(elapsed: number) => void} [onTimeout] - Callback invoked when timeout occurs
 * @property {import('../telemetry.js').TelemetrySink} [telemetry] - Telemetry sink
 * @property {{ now(): number, sleep(ms: number): Promise<void> }} [clock] - Clock for testing
 */

/**
 * Executes a function with a timeout limit.
 *
 * If the function accepts an argument, an AbortSignal is passed to allow
 * cooperative cancellation of in-flight operations (e.g., fetch requests).
 *
 * @template T
 * @param {number} ms - Timeout duration in milliseconds
 * @param {((signal: AbortSignal) => Promise<T>) | (() => Promise<T>)} fn - Function to execute
 * @param {TimeoutOptions} [options={}] - Optional configuration
 * @returns {Promise<T>} - Result of the function if it completes in time
 * @throws {TimeoutError} - If the operation exceeds the timeout
 *
 * @example
 * // Simple usage
 * const result = await timeout(5000, () => slowOperation());
 *
 * @example
 * // With AbortSignal for fetch
 * const result = await timeout(5000, (signal) => fetch(url, { signal }));
 *
 * @example
 * // With onTimeout callback
 * const result = await timeout(5000, () => slowOperation(), {
 *   onTimeout: (elapsed) => console.log(`Timed out after ${elapsed}ms`)
 * });
 *
 * @example
 * // With TestClock for deterministic tests
 * const clock = new TestClock();
 * const promise = timeout(5000, () => slowOperation(), { clock });
 * await clock.advance(5000); // Triggers timeout
 */
export async function timeout(ms, fn, options = {}) {
  const { onTimeout, telemetry = new NoopSink(), clock = new SystemClock() } = options;
  const timeoutMs = resolve(ms);
  const controller = new AbortController();
  const startTime = clock.now();

  let completed = false;

  const timeoutPromise = new Promise((_, reject) => {
    clock.sleep(timeoutMs).then(() => {
      if (completed) {
        return;
      }

      controller.abort();
      const elapsed = clock.now() - startTime;

      if (onTimeout) {
        onTimeout(elapsed);
      }

      telemetry.emit({
        type: 'timeout',
        timestamp: clock.now(),
        timeout: timeoutMs,
        elapsed,
        metrics: { timeouts: 1, failures: 1 },
      });

      reject(new TimeoutError(timeoutMs, elapsed));
    });
  });

  try {
    // Check if fn expects an argument (signal)
    const fnAcceptsSignal = fn.length > 0;
    const operationPromise = fnAcceptsSignal ? fn(controller.signal) : fn();

    const result = await Promise.race([operationPromise, timeoutPromise]);
    completed = true;
    return result;
  } catch (error) {
    completed = true;
    throw error;
  }
}
