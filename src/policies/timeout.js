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

/**
 * @typedef {Object} TimeoutOptions
 * @property {(elapsed: number) => void} [onTimeout] - Callback invoked when timeout occurs
 * @property {import('../telemetry.js').TelemetrySink} [telemetry] - Telemetry sink
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
 */
export async function timeout(ms, fn, options = {}) {
  const { onTimeout, telemetry = new NoopSink() } = options;
  const controller = new AbortController();
  const startTime = Date.now();

  let timeoutId;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      const elapsed = Date.now() - startTime;

      if (onTimeout) {
        onTimeout(elapsed);
      }
      
      telemetry.emit({
        type: 'timeout',
        timestamp: Date.now(),
        timeout: ms,
        elapsed
      });

      reject(new TimeoutError(ms, elapsed));
    }, ms);
  });

  try {
    // Check if fn expects an argument (signal)
    const fnAcceptsSignal = fn.length > 0;
    const operationPromise = fnAcceptsSignal ? fn(controller.signal) : fn();

    const result = await Promise.race([operationPromise, timeoutPromise]);
    return result;
  } finally {
    clearTimeout(timeoutId);
  }
}
