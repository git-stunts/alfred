/**
 * @fileoverview Main entry point for @git-stunts/alfred resilience library.
 * Exports all public APIs for building resilient applications.
 */

// Error types
export { RetryExhaustedError, CircuitOpenError, TimeoutError } from './errors.js';

// Resilience policies
export { retry } from './policies/retry.js';
export { circuitBreaker } from './policies/circuit-breaker.js';
export { timeout } from './policies/timeout.js';

// Composition utilities
export { compose, fallback, race } from './compose.js';

// Base policy class
export { Policy, Policy as default } from './policy.js';

// Clock utilities
export { SystemClock, TestClock } from './utils/clock.js';
