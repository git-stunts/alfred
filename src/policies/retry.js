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
import { NoopSink } from '../telemetry.js';
import { resolve } from '../utils/resolvable.js';

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
 * @property {import('../telemetry.js').TelemetrySink} [telemetry] - Telemetry sink
 */

const DEFAULT_OPTIONS = {
  retries: 3,
  delay: 1000,
  maxDelay: 30000,
  backoff: 'constant',
  jitter: 'none'
};

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

class RetryExecutor {
  constructor(fn, options) {
    this.fn = fn;
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.clock = options.clock || new SystemClock();
    this.telemetry = options.telemetry || new NoopSink();
    // this.applyJitter is now created dynamically in calculateDelay
    this.prevDelay = resolve(this.options.delay);
  }

  calculateDelay(attempt) {
    const backoff = resolve(this.options.backoff);
    const baseDelay = resolve(this.options.delay);
    const maxDelay = resolve(this.options.maxDelay);
    const jitter = resolve(this.options.jitter);

    const rawDelay = calculateBackoff(backoff, baseDelay, attempt);
    const applyJitter = createJitter(jitter);

    if (jitter === 'decorrelated') {
      const actual = applyJitter(baseDelay, this.prevDelay, maxDelay);
      this.prevDelay = actual;
      return actual;
    }
    
    return Math.min(applyJitter(rawDelay), maxDelay);
  }

  async execute() {
    // Loop condition: attempt <= (current_retries + 1)
    // We start at 1.
    for (let attempt = 1; attempt <= resolve(this.options.retries) + 1; attempt++) {
      const shouldStop = await this.tryAttempt(attempt);
      if (shouldStop) {
        return shouldStop.result;
      }
    }
    
    throw new Error('Unexpected retry loop termination');
  }

  async tryAttempt(attempt) {
    const startTime = this.clock.now();
    try {
      const result = await this.fn();
      this.emitSuccess(attempt, startTime);
      return { result };
    } catch (error) {
      this.handleFailure(error, attempt, startTime);
      // If we didn't throw in handleFailure, we need to wait
      // But we need to calculate delay first
      const delay = this.calculateDelay(attempt);
      this.emitScheduled(attempt, delay, error);
      
      if (this.options.onRetry) {
        this.options.onRetry(error, attempt, delay);
      }
      
      await this.clock.sleep(delay);
      return null; // Continue loop
    }
  }

  emitSuccess(attempt, startTime) {
    this.telemetry.emit({
      type: 'retry.success',
      timestamp: this.clock.now(),
      attempt,
      duration: this.clock.now() - startTime,
      metrics: { successes: 1 }
    });
  }

  emitScheduled(attempt, delay, error) {
    this.telemetry.emit({
      type: 'retry.scheduled',
      timestamp: this.clock.now(),
      attempt,
      delay,
      error,
      metrics: { retries: 1 }
    });
  }

  handleFailure(error, attempt, startTime) {
    this.telemetry.emit({
      type: 'retry.failure',
      timestamp: this.clock.now(),
      attempt,
      error,
      duration: this.clock.now() - startTime,
      metrics: { failures: 1 }
    });

    if (this.options.shouldRetry && !this.options.shouldRetry(error)) {
      throw error;
    }

    const totalAttempts = resolve(this.options.retries) + 1;
    if (attempt >= totalAttempts) {
      this.telemetry.emit({
        type: 'retry.exhausted',
        timestamp: this.clock.now(),
        attempts: attempt,
        error
      });
      throw new RetryExhaustedError(attempt, error);
    }
  }
}

/**
 * Executes an async function with configurable retry logic.
 *
 * @template T
 * @param {() => Promise<T>} fn - Async function to execute
 * @param {RetryOptions} [options={}] - Retry configuration
 * @returns {Promise<T>} Result of the successful execution
 */
export async function retry(fn, options = {}) {
  return new RetryExecutor(fn, options).execute();
}