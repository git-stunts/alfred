/**
 * @fileoverview Retry policy for resilient async operations.
 *
 * Provides configurable retry logic with multiple backoff strategies
 * and jitter options to prevent thundering herd problems.
 *
 * @module @git-stunts/alfred/policies/retry
 */

import { SystemClock } from '../utils/clock.js';
import { createJitter } from '../utils/jitter.js';
import { RetryExhaustedError } from '../errors.js';

/**
 * @typedef {'constant' | 'linear' | 'exponential'} BackoffStrategy
 */

/**
 * @typedef {'none' | 'full' | 'equal' | 'decorrelated'} JitterStrategy
 */

/**
 * @typedef {Object} RetryOptions
 * @property {number} [retries=3] - Maximum number of retry attempts
 * @property {number} [delay=1000] - Base delay in milliseconds
 * @property {number} [maxDelay=30000] - Maximum delay cap in milliseconds
 * @property {BackoffStrategy} [backoff='constant'] - Backoff strategy
 * @property {JitterStrategy} [jitter='none'] - Jitter strategy
 * @property {(error: Error) => boolean} [shouldRetry] - Predicate to determine if error is retryable
 * @property {(error: Error, attempt: number, delay: number) => void} [onRetry] - Callback invoked before each retry
 * @property {{ now(): number, sleep(ms: number): Promise<void> }} [clock] - Clock for testing
 */

/**
 * Default options for retry policy.
 * @type {Required<Omit<RetryOptions, 'shouldRetry' | 'onRetry' | 'clock'>>}
 */
const DEFAULT_OPTIONS = {
  retries: 3,
  delay: 1000,
  maxDelay: 30000,
  backoff: 'constant',
  jitter: 'none'
};

/**
 * Calculates raw backoff delay based on strategy.
 *
 * @param {BackoffStrategy} strategy - Backoff strategy
 * @param {number} baseDelay - Base delay in milliseconds
 * @param {number} attempt - Current attempt number (1-indexed)
 * @returns {number} Raw delay before jitter and capping
 */
function calculateBackoff(strategy, baseDelay, attempt) {
  switch (strategy) {
    case 'linear':
      return baseDelay * attempt;
    case 'exponential':
      return baseDelay * Math.pow(2, attempt - 1);
    case 'constant':
    default:
      return baseDelay;
  }
}

/**
 * Executes an async function with configurable retry logic.
 *
 * The function will be retried up to `retries` times on failure. Between
 * retries, a delay is applied based on the backoff strategy, optionally
 * modified by jitter to prevent thundering herd problems.
 *
 * @template T
 * @param {() => Promise<T>} fn - Async function to execute
 * @param {RetryOptions} [options={}] - Retry configuration
 * @returns {Promise<T>} Result of the successful execution
 * @throws {RetryExhaustedError} When all retry attempts are exhausted
 * @throws {Error} When shouldRetry returns false for an error
 *
 * @example
 * // Basic retry with defaults
 * const data = await retry(() => fetch(url));
 *
 * @example
 * // Exponential backoff with jitter
 * const result = await retry(() => fetch(url), {
 *   retries: 5,
 *   delay: 100,
 *   backoff: 'exponential',
 *   jitter: 'full',
 *   shouldRetry: (err) => err.code === 'ECONNREFUSED'
 * });
 *
 * @example
 * // With retry callback for logging
 * const result = await retry(fetchData, {
 *   onRetry: (error, attempt, delay) => {
 *     console.log(`Retry ${attempt} after ${delay}ms: ${error.message}`);
 *   }
 * });
 */
export async function retry(fn, options = {}) {
  const {
    retries,
    delay: baseDelay,
    maxDelay,
    backoff,
    jitter: jitterStrategy
  } = { ...DEFAULT_OPTIONS, ...options };

  const { shouldRetry, onRetry, clock = new SystemClock() } = options;

  const applyJitter = createJitter(jitterStrategy);

  // Track previous delay for decorrelated jitter
  let prevDelay = baseDelay;
  let lastError;

  // Total attempts = initial + retries
  const totalAttempts = retries + 1;

  for (let attempt = 1; attempt <= totalAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Check if we should retry this error
      if (shouldRetry && !shouldRetry(error)) {
        throw error;
      }

      // If this was the last attempt, throw exhausted error
      if (attempt >= totalAttempts) {
        throw new RetryExhaustedError(attempt, error);
      }

      // Calculate delay with backoff
      const rawDelay = calculateBackoff(backoff, baseDelay, attempt);

      // Apply jitter (decorrelated needs previous delay and maxDelay)
      let actualDelay;
      if (jitterStrategy === 'decorrelated') {
        actualDelay = applyJitter(baseDelay, prevDelay, maxDelay);
        prevDelay = actualDelay;
      } else {
        actualDelay = Math.min(applyJitter(rawDelay), maxDelay);
      }

      // Invoke retry callback if provided
      if (onRetry) {
        onRetry(error, attempt, actualDelay);
      }

      // Wait before next attempt
      await clock.sleep(actualDelay);
    }
  }

  // This should be unreachable, but TypeScript likes it
  throw new RetryExhaustedError(totalAttempts, lastError);
}
