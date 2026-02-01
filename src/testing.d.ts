export interface RetryOptions {
  retries?: number;
  delay?: number;
  maxDelay?: number;
  backoff?: 'constant' | 'linear' | 'exponential';
  jitter?: 'none' | 'full' | 'equal' | 'decorrelated';
  shouldRetry?: (error: Error) => boolean;
  onRetry?: (error: Error, attempt: number, delay: number) => void;
  telemetry?: TelemetrySink;
  clock?: any;
}

export interface CircuitBreakerOptions {
  threshold: number;
  duration: number;
  successThreshold?: number;
  shouldTrip?: (error: Error) => boolean;
  onOpen?: () => void;
  onClose?: () => void;
  onHalfOpen?: () => void;
  telemetry?: TelemetrySink;
  clock?: any;
}

export interface TimeoutOptions {
  onTimeout?: (elapsed: number) => void;
  telemetry?: TelemetrySink;
}

export interface BulkheadOptions {
  limit: number;
  queueLimit?: number;
  telemetry?: TelemetrySink;
  clock?: any;
}

export interface TelemetryEvent {
  type: string;
  timestamp: number;
  metrics?: Record<string, number>;
  [key: string]: any;
}

export interface TelemetrySink {
  emit(event: TelemetryEvent): void;
}

export class InMemorySink implements TelemetrySink {
  events: TelemetryEvent[];
  emit(event: TelemetryEvent): void;
  clear(): void;
}

export class ConsoleSink implements TelemetrySink {
  emit(event: TelemetryEvent): void;
}

export class NoopSink implements TelemetrySink {
  emit(event: TelemetryEvent): void;
}

export class MultiSink implements TelemetrySink {
  constructor(sinks: TelemetrySink[]);
  emit(event: TelemetryEvent): void;
}

export class RetryExhaustedError extends Error {
  attempts: number;
  cause: Error;
  constructor(attempts: number, cause: Error);
}

export class CircuitOpenError extends Error {
  openedAt: Date;
  failureCount: number;
  constructor(openedAt: Date, failureCount: number);
}

export class TimeoutError extends Error {
  timeout: number;
  elapsed: number;
  constructor(timeout: number, elapsed: number);
}

export class BulkheadRejectedError extends Error {
  limit: number;
  queueLimit: number;
  constructor(limit: number, queueLimit: number);
}

export function retry<T>(fn: () => Promise<T>, options?: RetryOptions): Promise<T>;

export interface CircuitBreaker {
  execute<T>(fn: () => Promise<T>): Promise<T>;
  readonly state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
}

export function circuitBreaker(options: CircuitBreakerOptions): CircuitBreaker;

export function timeout<T>(
  ms: number,
  fn: ((signal: AbortSignal) => Promise<T>) | (() => Promise<T>),
  options?: TimeoutOptions
): Promise<T>;

export interface Bulkhead {
  execute<T>(fn: () => Promise<T>): Promise<T>;
  readonly stats: { active: number; pending: number; available: number };
}

export function bulkhead(options: BulkheadOptions): Bulkhead;

export function compose(...policies: any[]): { execute<T>(fn: () => Promise<T>): Promise<T> };
export function fallback(
  primary: any,
  secondary: any
): { execute<T>(fn: () => Promise<T>): Promise<T> };
export function race(
  primary: any,
  secondary: any
): { execute<T>(fn: () => Promise<T>): Promise<T> };

export class Policy {
  constructor(executor: (fn: () => Promise<any>) => Promise<any>);
  static retry(options?: RetryOptions): Policy;
  static circuitBreaker(options: CircuitBreakerOptions): Policy;
  static timeout(ms: number, options?: TimeoutOptions): Policy;
  static bulkhead(options: BulkheadOptions): Policy;
  static noop(): Policy;

  wrap(otherPolicy: Policy): Policy;
  or(otherPolicy: Policy): Policy;
  race(otherPolicy: Policy): Policy;
  execute<T>(fn: () => Promise<T>): Promise<T>;
}

export class SystemClock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export class TestClock {
  now(): number;
  sleep(ms: number): Promise<void>;
  tick(ms?: number): Promise<void>;
  advance(ms: number): Promise<void>;
}
