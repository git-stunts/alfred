/**
 * @module @git-stunts/alfred
 * @description Production-grade resilience patterns for async operations.
 * Includes Retry, Circuit Breaker, Timeout, Bulkhead, and Hedge policies.
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
 */

/**
 * A value that can be either static or resolved dynamically via a function.
 */
export type Resolvable<T> = T | (() => T);

/**
 * Options for the Retry policy.
 */
export interface RetryOptions {
  /** Maximum number of retry attempts. Default: 3 */
  retries?: Resolvable<number>;
  /** Base delay in milliseconds. Default: 1000 */
  delay?: Resolvable<number>;
  /** Maximum delay cap in milliseconds. Default: 30000 */
  maxDelay?: Resolvable<number>;
  /** Backoff strategy. Default: 'constant' */
  backoff?: Resolvable<'constant' | 'linear' | 'exponential'>;
  /** Jitter strategy to prevent thundering herd. Default: 'none' */
  jitter?: Resolvable<'none' | 'full' | 'equal' | 'decorrelated'>;
  /** Predicate to determine if an error is retryable. Default: always true */
  shouldRetry?: (error: Error) => boolean;
  /** Callback invoked before each retry. */
  onRetry?: (error: Error, attempt: number, delay: number) => void;
  /** Telemetry sink for observability. */
  telemetry?: TelemetrySink;
  /** Clock implementation for testing. */
  clock?: any;
  /** Abort signal to cancel retries. */
  signal?: AbortSignal;
}

/**
 * Options for the Circuit Breaker policy.
 */
export interface CircuitBreakerOptions {
  /** Number of failures before opening the circuit. */
  threshold: Resolvable<number>;
  /** Milliseconds to stay open before transitioning to half-open. */
  duration: Resolvable<number>;
  /** Consecutive successes required to close the circuit from half-open. Default: 1 */
  successThreshold?: Resolvable<number>;
  /** Predicate to determine if an error counts as a failure. Default: always true */
  shouldTrip?: (error: Error) => boolean;
  /** Callback when circuit opens. */
  onOpen?: () => void;
  /** Callback when circuit closes. */
  onClose?: () => void;
  /** Callback when circuit transitions to half-open. */
  onHalfOpen?: () => void;
  /** Telemetry sink for observability. */
  telemetry?: TelemetrySink;
  /** Clock implementation for testing. */
  clock?: any;
}

/**
 * Options for the Timeout policy.
 */
export interface TimeoutOptions {
  /** Callback invoked when timeout occurs. */
  onTimeout?: (elapsed: number) => void;
  /** Telemetry sink for observability. */
  telemetry?: TelemetrySink;
  /** Clock implementation for testing. */
  clock?: any;
}

/**
 * Options for the Bulkhead policy.
 */
export interface BulkheadOptions {
  /** Maximum concurrent executions. */
  limit: Resolvable<number>;
  /** Maximum pending requests in queue. Default: 0 */
  queueLimit?: Resolvable<number>;
  /** Telemetry sink for observability. */
  telemetry?: TelemetrySink;
  /** Clock implementation for testing. */
  clock?: any;
}

/**
 * Options for the Hedge policy.
 */
export interface HedgeOptions {
  /** Milliseconds to wait before spawning a hedge. */
  delay: Resolvable<number>;
  /** Maximum number of hedged attempts to spawn. Default: 1 */
  maxHedges?: Resolvable<number>;
  /** Telemetry sink for observability. */
  telemetry?: TelemetrySink;
  /** Clock implementation for testing. */
  clock?: any;
}

/**
 * Options for the Rate Limit policy.
 */
export interface RateLimitOptions {
  /** Maximum requests per second. */
  rate: Resolvable<number>;
  /** Maximum burst size (tokens in bucket). Default: rate */
  burst?: Resolvable<number>;
  /** Maximum pending requests in queue. Default: 0 */
  queueLimit?: Resolvable<number>;
  /** Clock implementation for testing. */
  clock?: any;
  /** Telemetry sink for observability. */
  telemetry?: TelemetrySink;
}

/**
 * A structured event emitted by the telemetry system.
 */
export interface TelemetryEvent {
  /** The type of event (e.g., 'retry.failure', 'circuit.open'). */
  type: string;
  /** Unix timestamp of the event. */
  timestamp: number;
  /** Metric increments (counters) to be aggregated by MetricsSink. */
  metrics?: Record<string, number>;
  /** Additional metadata (error, duration, attempts, etc.). */
  [key: string]: any;
}

/**
 * Interface for receiving telemetry events.
 */
export interface TelemetrySink {
  /**
   * Records a telemetry event.
   * @param event The structured event.
   */
  emit(event: TelemetryEvent): void;
}

/**
 * Stores telemetry events in an in-memory array. Useful for testing.
 */
export class InMemorySink implements TelemetrySink {
  events: TelemetryEvent[];
  emit(event: TelemetryEvent): void;
  clear(): void;
}

/**
 * Logs telemetry events to the console (stdout).
 */
export class ConsoleSink implements TelemetrySink {
  emit(event: TelemetryEvent): void;
}

/**
 * Discards all telemetry events.
 */
export class NoopSink implements TelemetrySink {
  emit(event: TelemetryEvent): void;
}

/**
 * Broadcasts telemetry events to multiple other sinks.
 */
export class MultiSink implements TelemetrySink {
  constructor(sinks?: TelemetrySink[]);
  emit(event: TelemetryEvent): void;
}

/**
 * Sink that aggregates metrics in memory.
 */
export class MetricsSink implements TelemetrySink {
  emit(event: TelemetryEvent): void;
  /** Returns a snapshot of the current metrics. */
  get stats(): {
    retries: number;
    failures: number;
    successes: number;
    circuitBreaks: number;
    circuitRejections: number;
    bulkheadRejections: number;
    timeouts: number;
    hedges: number;
    latency: {
      count: number;
      sum: number;
      min: number;
      max: number;
      avg: number;
    };
    [key: string]: number | { count: number; sum: number; min: number; max: number; avg: number };
  };
  /** Resets all metrics to zero. */
  clear(): void;
}

/**
 * Error thrown when all retry attempts are exhausted.
 */
export class RetryExhaustedError extends Error {
  attempts: number;
  cause: Error;
  constructor(attempts: number, cause: Error);
}

/**
 * Error thrown when the circuit breaker is open (OPEN state).
 */
export class CircuitOpenError extends Error {
  openedAt: Date;
  failureCount: number;
  constructor(openedAt: Date, failureCount: number);
}

/**
 * Error thrown when an operation exceeds its time limit.
 */
export class TimeoutError extends Error {
  timeout: number;
  elapsed: number;
  constructor(timeout: number, elapsed: number);
}

/**
 * Error thrown when the bulkhead limit and queue are both full.
 */
export class BulkheadRejectedError extends Error {
  limit: number;
  queueLimit: number;
  constructor(limit: number, queueLimit: number);
}

/**
 * Error thrown when the rate limit is exceeded.
 */
export class RateLimitExceededError extends Error {
  /** The configured rate limit (requests per second). */
  rate: number;
  /** Milliseconds until the next request can be made. */
  retryAfter: number;
  constructor(rate: number, retryAfter: number);
}

/**
 * Executes an async function with configurable retry logic.
 *
 * @param fn The async operation to execute.
 * @param options Retry configuration options.
 * @returns The result of the operation.
 * @throws {RetryExhaustedError} If all retries fail.
 */
export function retry<T>(
  fn: (signal?: AbortSignal) => Promise<T>,
  options?: RetryOptions
): Promise<T>;

/**
 * Represents a Circuit Breaker instance.
 */
export interface CircuitBreaker {
  /**
   * Executes a function with circuit breaker protection.
   */
  execute<T>(fn: () => Promise<T>): Promise<T>;
  /**
   * Current state of the circuit.
   */
  readonly state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
}

/**
 * Creates a Circuit Breaker policy.
 *
 * @param options Configuration options.
 */
export function circuitBreaker(options: CircuitBreakerOptions): CircuitBreaker;

/**
 * Executes a function with a time limit.
 *
 * @param ms Timeout duration in milliseconds.
 * @param fn The function to execute. Accepts an AbortSignal if defined.
 * @param options Configuration options.
 */
export function timeout<T>(
  ms: Resolvable<number>,
  fn: ((signal: AbortSignal) => Promise<T>) | (() => Promise<T>),
  options?: TimeoutOptions
): Promise<T>;

/**
 * Represents a Bulkhead instance.
 */
export interface Bulkhead {
  /**
   * Executes a function with concurrency limiting.
   */
  execute<T>(fn: () => Promise<T>): Promise<T>;
  /**
   * Current load statistics.
   */
  readonly stats: { active: number; pending: number; available: number };
}

/**
 * Creates a Bulkhead policy for concurrency limiting.
 *
 * @param options Configuration options.
 */
export function bulkhead(options: BulkheadOptions): Bulkhead;

/**
 * Represents a Hedge policy instance.
 */
export interface Hedge {
  execute<T>(fn: (signal?: AbortSignal) => Promise<T>): Promise<T>;
}

/**
 * Creates a Hedge policy for speculative execution.
 * @param options Configuration options.
 */
export function hedge(options: HedgeOptions): Hedge;

/**
 * Represents a Rate Limit instance.
 */
export interface RateLimit {
  /**
   * Executes a function with rate limiting.
   */
  execute<T>(fn: () => T | Promise<T>): Promise<T>;
  /**
   * Current rate limiter statistics.
   */
  readonly stats: { tokens: number; queued: number };
}

/**
 * Creates a Rate Limit policy using token bucket algorithm.
 *
 * @param options Configuration options.
 */
export function rateLimit(options: RateLimitOptions): RateLimit;

/**
 * Composes multiple policies into a single executable policy.
 * Policies execute from left to right (outermost to innermost).
 *
 * @param policies The policies to compose.
 */
export function compose(...policies: any[]): { execute<T>(fn: () => Promise<T>): Promise<T> };

/**
 * Creates a fallback policy. If the primary policy fails, the secondary is executed.
 */
export function fallback(
  primary: any,
  secondary: any
): { execute<T>(fn: () => Promise<T>): Promise<T> };

/**
 * Creates a race policy. Executes both policies concurrently; the first to succeed wins.
 */
export function race(
  primary: any,
  secondary: any
): { execute<T>(fn: () => Promise<T>): Promise<T> };

/**
 * Fluent API for building resilience policies.
 */
export class Policy {
  constructor(executor: (fn: () => Promise<any>) => Promise<any>);
  /** Creates a Retry policy wrapper. */
  static retry(options?: RetryOptions): Policy;
  /** Creates a Circuit Breaker policy wrapper. */
  static circuitBreaker(options: CircuitBreakerOptions): Policy;
  /** Creates a Timeout policy wrapper. */
  static timeout(ms: Resolvable<number>, options?: TimeoutOptions): Policy;
  /** Creates a Bulkhead policy wrapper. */
  static bulkhead(options: BulkheadOptions): Policy;
  /** Creates a Hedge policy wrapper. */
  static hedge(options: HedgeOptions): Policy;
  /** Creates a Rate Limit policy wrapper. */
  static rateLimit(options: RateLimitOptions): Policy;
  /** Creates a pass-through (no-op) policy. */
  static noop(): Policy;

  /** Wraps this policy with another (sequential composition). */
  wrap(otherPolicy: Policy): Policy;
  /** Falls back to another policy if this one fails. */
  or(otherPolicy: Policy): Policy;
  /** Races this policy against another. */
  race(otherPolicy: Policy): Policy;
  /** Executes the policy chain. */
  execute<T>(fn: () => Promise<T>): Promise<T>;
}

/**
 * System clock using real time.
 * Uses runtime-aware timer management for clean process exits.
 */
export class SystemClock {
  /** Returns current time in milliseconds since Unix epoch. */
  now(): number;
  /** Sleeps for the specified duration. */
  sleep(ms: number): Promise<void>;
}

/**
 * Test clock for deterministic tests.
 * Allows manual control of time progression without real delays.
 */
export class TestClock {
  /** Returns current virtual time in milliseconds. */
  now(): number;
  /** Creates a sleep promise that resolves when time is advanced. */
  sleep(ms: number): Promise<void>;
  /** Process any timers ready at current time. */
  tick(ms?: number): Promise<void>;
  /** Advances time and resolves any pending timers. */
  advance(ms: number): Promise<void>;
  /** Sets absolute time. */
  setTime(time: number): void;
  /** Returns number of pending timers. */
  readonly pendingCount: number;
  /** Clears all pending timers and resets time to 0. */
  reset(): void;
}
