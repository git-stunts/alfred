/**
 * Production-grade resilience patterns for async operations.
 *
 * Alfred provides composable policies for retry, circuit breaker, bulkhead,
 * timeout, and hedge patterns with telemetry support and TestClock for
 * deterministic testing.
 *
 * @example
 * ```ts
 * import { Policy } from "@git-stunts/alfred";
 *
 * const resilient = Policy.timeout(5_000)
 *   .wrap(Policy.retry({ retries: 3, backoff: "exponential" }))
 *   .wrap(Policy.circuitBreaker({ threshold: 5, duration: 60_000 }))
 *   .wrap(Policy.bulkhead({ limit: 10 }));
 *
 * const data = await resilient.execute(() => fetch("https://api.example.com"));
 * ```
 *
 * @module
 */

// @ts-self-types="./index.d.ts"

// Error types
export {
  RetryExhaustedError,
  CircuitOpenError,
  TimeoutError,
  BulkheadRejectedError,
} from './errors.js';

// Resilience policies
export { retry } from './policies/retry.js';
export { circuitBreaker } from './policies/circuit-breaker.js';
export { timeout } from './policies/timeout.js';
export { bulkhead } from './policies/bulkhead.js';
export { hedge } from './policies/hedge.js';

// Composition utilities
export { compose, fallback, race } from './compose.js';

// Base policy class
export { Policy, Policy as default } from './policy.js';

// Clock utilities
export { SystemClock, TestClock } from './utils/clock.js';

// Telemetry
export { InMemorySink, ConsoleSink, NoopSink, MultiSink, MetricsSink } from './telemetry.js';
