/**
 * @fileoverview Custom error types for resilience policy failures.
 *
 * Each error includes contextual metadata to aid debugging and
 * error handling in application code.
 *
 * @module @git-stunts/alfred/errors
 */

/**
 * Error thrown when all retry attempts are exhausted.
 */
export class RetryExhaustedError extends Error {
  /**
   * @param {number} attempts - Total attempts made
   * @param {Error} cause - The last error that caused the failure
   */
  constructor(attempts, cause) {
    super(`Retry exhausted after ${attempts} attempts: ${cause.message}`);
    this.name = 'RetryExhaustedError';
    this.attempts = attempts;
    this.cause = cause;
  }
}

/**
 * Error thrown when circuit breaker is open.
 */
export class CircuitOpenError extends Error {
  /**
   * @param {Date} openedAt - When the circuit opened
   * @param {number} failureCount - Number of failures that triggered opening
   */
  constructor(openedAt, failureCount) {
    super(`Circuit breaker is open (since ${openedAt.toISOString()}, ${failureCount} failures)`);
    this.name = 'CircuitOpenError';
    this.openedAt = openedAt;
    this.failureCount = failureCount;
  }
}

/**
 * Error thrown when an operation times out.
 */
export class TimeoutError extends Error {
  /**
   * @param {number} timeout - Configured timeout in ms
   * @param {number} elapsed - Actual elapsed time in ms
   */
  constructor(timeout, elapsed) {
    super(`Operation timed out after ${elapsed}ms (limit: ${timeout}ms)`);
    this.name = 'TimeoutError';
    this.timeout = timeout;
    this.elapsed = elapsed;
  }
}

/**
 * Error thrown when bulkhead queue is full.
 */
export class BulkheadRejectedError extends Error {
  /**
   * @param {number} limit - Max concurrent executions
   * @param {number} queueLimit - Max pending requests
   */
  constructor(limit, queueLimit) {
    super(`Bulkhead rejected: queue full (limit: ${limit}, queue: ${queueLimit})`);
    this.name = 'BulkheadRejectedError';
    this.limit = limit;
    this.queueLimit = queueLimit;
  }
}

/**
 * Error thrown when rate limit is exceeded.
 */
export class RateLimitExceededError extends Error {
  /**
   * @param {number} rate - Configured rate (tokens/sec)
   * @param {number} retryAfter - Suggested ms to wait before retry
   */
  constructor(rate, retryAfter) {
    super(`Rate limit exceeded: ${rate} req/s (retry after ${retryAfter}ms)`);
    this.name = 'RateLimitExceededError';
    this.rate = rate;
    this.retryAfter = retryAfter;
  }
}
