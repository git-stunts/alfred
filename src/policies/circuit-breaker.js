import { CircuitOpenError } from '../errors.js';
import { SystemClock } from '../utils/clock.js';
import { NoopSink } from '../telemetry.js';
import { resolve } from '../utils/resolvable.js';

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
 * @property {import('../telemetry.js').TelemetrySink} [telemetry] - Telemetry sink
 */

/**
 * @typedef {Object} CircuitBreaker
 * @property {<T>(fn: () => Promise<T>) => Promise<T>} execute - Executes function with circuit breaker protection
 * @property {string} state - Current circuit state (CLOSED, OPEN, HALF_OPEN)
 */

class CircuitBreakerPolicy {
  constructor(options) {
    const {
      threshold,
      duration,
      successThreshold = 1,
      shouldTrip = () => true,
      onOpen,
      onClose,
      onHalfOpen,
      clock = new SystemClock(),
      telemetry = new NoopSink()
    } = options;

    if (threshold === undefined || threshold === null) {
      throw new Error('threshold is required');
    }
    if (duration === undefined || duration === null) {
      throw new Error('duration is required');
    }

    this.options = {
      threshold,
      duration,
      successThreshold,
      shouldTrip,
      onOpen,
      onClose,
      onHalfOpen,
      clock,
      telemetry
    };

    this._state = State.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.openedAt = null;
  }

  get state() {
    return this._state;
  }

  emitEvent(type, data) {
    this.options.telemetry.emit({
      type,
      timestamp: this.options.clock.now(),
      ...data
    });
  }

  open() {
    this._state = State.OPEN;
    this.openedAt = new Date(this.options.clock.now());
    this.options.onOpen?.();
    this.emitEvent('circuit.open', { failureCount: this.failureCount });
  }

  close() {
    this._state = State.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.openedAt = null;
    this.options.onClose?.();
    this.emitEvent('circuit.close');
  }

  halfOpen() {
    this._state = State.HALF_OPEN;
    this.successCount = 0;
    this.options.onHalfOpen?.();
    this.emitEvent('circuit.half-open');
  }

  shouldAttemptReset() {
    if (this._state !== State.OPEN || !this.openedAt) {
      return false;
    }
    const elapsed = this.options.clock.now() - this.openedAt.getTime();
    return elapsed >= resolve(this.options.duration);
  }

  recordSuccess() {
    this.emitEvent('circuit.success', { state: this._state });

    if (this._state === State.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= resolve(this.options.successThreshold)) {
        this.close();
      }
    } else if (this._state === State.CLOSED) {
      this.failureCount = 0;
    }
  }

  recordFailure(error) {
    if (!this.options.shouldTrip(error)) {
      return;
    }

    this.emitEvent('circuit.failure', {
      error,
      state: this._state
    });

    if (this._state === State.HALF_OPEN) {
      this.open();
    } else if (this._state === State.CLOSED) {
      this.failureCount++;
      if (this.failureCount >= resolve(this.options.threshold)) {
        this.open();
      }
    }
  }

  async execute(fn) {
    if (this.shouldAttemptReset()) {
      this.halfOpen();
    }

    if (this._state === State.OPEN) {
      this.emitEvent('circuit.reject', {
        openedAt: this.openedAt,
        failureCount: this.failureCount
      });
      throw new CircuitOpenError(this.openedAt, this.failureCount);
    }

    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure(error);
      throw error;
    }
  }
}

/**
 * Creates a circuit breaker that prevents cascading failures by failing fast
 * when a dependency is unhealthy.
 *
 * @param {CircuitBreakerOptions} options - Configuration options
 * @returns {CircuitBreaker} Circuit breaker instance
 */
export function circuitBreaker(options) {
  const policy = new CircuitBreakerPolicy(options);
  return {
    execute: (fn) => policy.execute(fn),
    get state() {
      return policy.state;
    }
  };
}