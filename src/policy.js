/**
 * @typedef {(fn: () => Promise<T>) => Promise<T>} Executor
 * @template T
 */

/**
 * @typedef {Object} RetryOptions
 * @property {number} [retries=3] - Maximum retry attempts
 * @property {number} [delay=1000] - Base delay in milliseconds
 * @property {number} [maxDelay=30000] - Maximum delay cap
 * @property {'constant' | 'linear' | 'exponential'} [backoff='constant'] - Backoff strategy
 * @property {'none' | 'full' | 'equal' | 'decorrelated'} [jitter='none'] - Jitter strategy
 * @property {(error: Error) => boolean} [shouldRetry] - Predicate to filter retryable errors
 * @property {(error: Error, attempt: number, delay: number) => void} [onRetry] - Callback on each retry
 */

/**
 * @typedef {Object} CircuitBreakerOptions
 * @property {number} threshold - Failures before opening
 * @property {number} duration - How long to stay open (ms)
 * @property {number} [successThreshold=1] - Successes to close from half-open
 * @property {(error: Error) => boolean} [shouldTrip] - Which errors count as failures
 * @property {() => void} [onOpen] - Called when circuit opens
 * @property {() => void} [onClose] - Called when circuit closes
 * @property {() => void} [onHalfOpen] - Called when entering half-open
 */

/**
 * @typedef {Object} TimeoutOptions
 * @property {(elapsed: number) => void} [onTimeout] - Called when operation times out
 */

import { retry } from './policies/retry.js';
import { circuitBreaker } from './policies/circuit-breaker.js';
import { timeout } from './policies/timeout.js';
import { bulkhead } from './policies/bulkhead.js';
import { compose, fallback, race } from './compose.js';

/**
 * Fluent API for building resilience policies.
 *
 * Provides a chainable, immutable interface for composing retry, circuit breaker,
 * timeout, and other resilience patterns.
 *
 * @example
 * // Build a resilient policy with retry, timeout, and fallback
 * const policy = Policy.retry({ retries: 3, backoff: 'exponential' })
 *   .wrap(Policy.timeout(5000))
 *   .or(Policy.retry({ retries: 1, delay: 5000 }));
 *
 * const result = await policy.execute(() => fetch(url));
 *
 * @example
 * // Race two strategies
 * const policy = Policy.timeout(1000)
 *   .race(Policy.timeout(2000));
 *
 * // First to complete wins
 * const result = await policy.execute(() => fetch(url));
 */
export class Policy {
  /**
   * Creates a new Policy with the given executor function.
   * @param {Executor<any>} executor - Function that takes fn and returns promise
   * @private
   */
  constructor(executor) {
    this._executor = executor;
  }

  // ---------------------------------------------------------------------------
  // Static Factory Methods
  // ---------------------------------------------------------------------------

  /**
   * Creates a Policy that retries failed operations.
   *
   * @param {RetryOptions} [options={}] - Retry configuration
   * @returns {Policy} A new Policy wrapping retry behavior
   *
   * @example
   * const policy = Policy.retry({ retries: 3, backoff: 'exponential' });
   * await policy.execute(() => unstableOperation());
   */
  static retry(options = {}) {
    return new Policy((fn) => retry(fn, options));
  }

  /**
   * Creates a Policy that fails fast when a service is degraded.
   *
   * Note: Circuit breakers are stateful. Each call to this factory creates
   * a new circuit breaker instance with its own state.
   *
   * @param {CircuitBreakerOptions} options - Circuit breaker configuration
   * @returns {Policy} A new Policy wrapping circuit breaker behavior
   *
   * @example
   * const policy = Policy.circuitBreaker({ threshold: 5, duration: 60000 });
   * await policy.execute(() => callExternalService());
   */
  static circuitBreaker(options) {
    const breaker = circuitBreaker(options);
    return new Policy((fn) => breaker.execute(fn));
  }

  /**
   * Creates a Policy that enforces a time limit on operations.
   *
   * @param {number} ms - Timeout in milliseconds
   * @param {TimeoutOptions} [options={}] - Timeout configuration
   * @returns {Policy} A new Policy wrapping timeout behavior
   *
   * @example
   * const policy = Policy.timeout(5000);
   * await policy.execute(() => slowOperation());
   */
  static timeout(ms, options = {}) {
    return new Policy((fn) => timeout(ms, fn, options));
  }

  /**
   * Creates a Policy that limits concurrent executions.
   *
   * @param {import('./policies/bulkhead.js').BulkheadOptions} options - Bulkhead configuration
   * @returns {Policy} A new Policy wrapping bulkhead behavior
   *
   * @example
   * const policy = Policy.bulkhead({ limit: 10, queueLimit: 50 });
   * await policy.execute(() => heavyOperation());
   */
  static bulkhead(options) {
    const limiter = bulkhead(options);
    return new Policy((fn) => limiter.execute(fn));
  }

  /**
   * Creates a no-op Policy that passes through to the function directly.
   *
   * Useful as a starting point for building policies or for conditional
   * composition where you might want to skip certain policies.
   *
   * @returns {Policy} A pass-through Policy
   *
   * @example
   * const base = Policy.noop();
   * const withRetry = shouldRetry ? base.wrap(Policy.retry()) : base;
   */
  static noop() {
    return new Policy((fn) => fn());
  }

  // ---------------------------------------------------------------------------
  // Instance Methods (Immutable - return new Policy)
  // ---------------------------------------------------------------------------

  /**
   * Wraps this policy with another, creating sequential composition.
   *
   * The outer policy (this) wraps the inner policy (other). Execution flows
   * from outer to inner: this policy is applied first, and when it calls
   * the function, that function is actually the other policy's execution.
   *
   * Equivalent to the `+` operator in ninelives DSL.
   *
   * @param {Policy} otherPolicy - The inner policy to wrap
   * @returns {Policy} A new Policy representing the composition
   *
   * @example
   * // Retry wraps timeout: retries will include timeout behavior
   * const policy = Policy.retry({ retries: 3 })
   *   .wrap(Policy.timeout(5000));
   *
   * // Execution: retry -> timeout -> fn
   * await policy.execute(() => fetch(url));
   */
  wrap(otherPolicy) {
    const outer = this._executor;
    const inner = otherPolicy._executor;

    return new Policy((fn) => {
      // Compose: outer wraps inner
      // When outer calls its "fn", that fn is actually inner's execution
      return compose(
        { execute: outer },
        { execute: inner }
      ).execute(fn);
    });
  }

  /**
   * Creates a fallback composition with another policy.
   *
   * If this policy fails, the other policy is tried. This enables graceful
   * degradation strategies.
   *
   * Equivalent to the `|` operator in ninelives DSL.
   *
   * @param {Policy} otherPolicy - The fallback policy
   * @returns {Policy} A new Policy with fallback behavior
   *
   * @example
   * // Try fast, fall back to slow
   * const policy = Policy.timeout(1000)
   *   .or(Policy.timeout(10000));
   *
   * // If the first times out, try again with longer timeout
   * await policy.execute(() => fetch(url));
   */
  or(otherPolicy) {
    const primary = this._executor;
    const secondary = otherPolicy._executor;

    return new Policy((fn) => {
      return fallback(
        { execute: primary },
        { execute: secondary }
      ).execute(fn);
    });
  }

  /**
   * Races this policy against another, returning the first to complete.
   *
   * Both policies execute concurrently. The first successful result wins.
   * If both fail, the error from the primary (this) policy is thrown.
   *
   * Equivalent to the `&` operator in ninelives DSL.
   *
   * @param {Policy} otherPolicy - The policy to race against
   * @returns {Policy} A new Policy with race behavior
   *
   * @example
   * // Race two different strategies
   * const policy = Policy.retry({ retries: 2, delay: 100 })
   *   .race(Policy.timeout(500));
   *
   * // First to succeed wins
   * await policy.execute(() => fetch(url));
   */
  race(otherPolicy) {
    const first = this._executor;
    const second = otherPolicy._executor;

    return new Policy((fn) => {
      return race(
        { execute: first },
        { execute: second }
      ).execute(fn);
    });
  }

  /**
   * Executes a function through this policy chain.
   *
   * @template T
   * @param {() => Promise<T>} fn - The async function to execute
   * @returns {Promise<T>} The result of the function
   * @throws {Error} Any error from the function or policy (e.g., TimeoutError, CircuitOpenError)
   *
   * @example
   * const policy = Policy.retry({ retries: 3 });
   * const data = await policy.execute(async () => {
   *   const response = await fetch(url);
   *   return response.json();
   * });
   */
  execute(fn) {
    return this._executor(fn);
  }
}
