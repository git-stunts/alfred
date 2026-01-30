import { CircuitOpenError } from '../errors.js';
import { SystemClock } from '../utils/clock.js';

/**
 * Circuit breaker states.
 * @readonly
 * @enum {string}
 */
const State = {
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN'
};

/**
 * @typedef {Object} CircuitBreakerOptions
 * @property {number} threshold - Number of failures before opening circuit (required)
 * @property {number} duration - Milliseconds to stay open before transitioning to half-open (required)
 * @property {number} [successThreshold=1] - Consecutive successes in half-open to close circuit
 * @property {(error: Error) => boolean} [shouldTrip] - Predicate to determine if error should count as failure
 * @property {() => void} [onOpen] - Callback when circuit opens
 * @property {() => void} [onClose] - Callback when circuit closes
 * @property {() => void} [onHalfOpen] - Callback when circuit transitions to half-open
 * @property {{ now(): number }} [clock] - Clock implementation for testing
 */

/**
 * @typedef {Object} CircuitBreaker
 * @property {<T>(fn: () => Promise<T>) => Promise<T>} execute - Executes function with circuit breaker protection
 * @property {string} state - Current circuit state (CLOSED, OPEN, HALF_OPEN)
 */

/**
 * Creates a circuit breaker that prevents cascading failures by failing fast
 * when a dependency is unhealthy.
 *
 * The circuit breaker has three states:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Fail fast, requests immediately throw CircuitOpenError
 * - HALF_OPEN: Testing state, allows limited requests to check if dependency recovered
 *
 * @param {CircuitBreakerOptions} options - Configuration options
 * @returns {CircuitBreaker} Circuit breaker instance
 * @throws {Error} If required options are missing
 *
 * @example
 * const breaker = circuitBreaker({ threshold: 5, duration: 60000 });
 * const result = await breaker.execute(() => callService());
 *
 * @example
 * // With all options
 * const breaker = circuitBreaker({
 *   threshold: 3,
 *   duration: 30000,
 *   successThreshold: 2,
 *   shouldTrip: (err) => err.status >= 500,
 *   onOpen: () => console.log('Circuit opened'),
 *   onClose: () => console.log('Circuit closed'),
 *   onHalfOpen: () => console.log('Circuit half-open')
 * });
 */
export function circuitBreaker(options) {
  const {
    threshold,
    duration,
    successThreshold = 1,
    shouldTrip = () => true,
    onOpen,
    onClose,
    onHalfOpen,
    clock = new SystemClock()
  } = options;

  if (threshold === undefined || threshold === null) {
    throw new Error('threshold is required');
  }
  if (duration === undefined || duration === null) {
    throw new Error('duration is required');
  }

  let state = State.CLOSED;
  let failureCount = 0;
  let successCount = 0;
  let openedAt = null;

  /**
   * Transitions to OPEN state.
   */
  function open() {
    state = State.OPEN;
    openedAt = new Date(clock.now());
    onOpen?.();
  }

  /**
   * Transitions to CLOSED state.
   */
  function close() {
    state = State.CLOSED;
    failureCount = 0;
    successCount = 0;
    openedAt = null;
    onClose?.();
  }

  /**
   * Transitions to HALF_OPEN state.
   */
  function halfOpen() {
    state = State.HALF_OPEN;
    successCount = 0;
    onHalfOpen?.();
  }

  /**
   * Checks if the circuit should transition from OPEN to HALF_OPEN.
   * @returns {boolean}
   */
  function shouldAttemptReset() {
    if (state !== State.OPEN || !openedAt) {
      return false;
    }
    const elapsed = clock.now() - openedAt.getTime();
    return elapsed >= duration;
  }

  /**
   * Records a successful execution.
   */
  function recordSuccess() {
    if (state === State.HALF_OPEN) {
      successCount++;
      if (successCount >= successThreshold) {
        close();
      }
    } else if (state === State.CLOSED) {
      failureCount = 0;
    }
  }

  /**
   * Records a failed execution.
   * @param {Error} error - The error that occurred
   */
  function recordFailure(error) {
    if (!shouldTrip(error)) {
      return;
    }

    if (state === State.HALF_OPEN) {
      open();
    } else if (state === State.CLOSED) {
      failureCount++;
      if (failureCount >= threshold) {
        open();
      }
    }
  }

  /**
   * Executes the provided function with circuit breaker protection.
   *
   * @template T
   * @param {() => Promise<T>} fn - Async function to execute
   * @returns {Promise<T>} Result of the function
   * @throws {CircuitOpenError} When circuit is open
   * @throws {Error} When the function throws and circuit is not tripped
   */
  async function execute(fn) {
    // Check if we should transition from OPEN to HALF_OPEN
    if (shouldAttemptReset()) {
      halfOpen();
    }

    // If circuit is open, fail fast
    if (state === State.OPEN) {
      throw new CircuitOpenError(openedAt, failureCount);
    }

    try {
      const result = await fn();
      recordSuccess();
      return result;
    } catch (error) {
      recordFailure(error);
      throw error;
    }
  }

  return {
    execute,
    /**
     * Gets the current circuit state.
     * @type {string}
     */
    get state() {
      return state;
    }
  };
}
