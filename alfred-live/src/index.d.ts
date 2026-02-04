/**
 * In-memory control plane primitives for Alfred.
 *
 * This package is intentionally platform-agnostic: no filesystem,
 * no stdin/stdout, no Node-only dependencies.
 *
 * @module
 */

import type { Policy as CorePolicy, TelemetrySink } from '@git-stunts/alfred';

/**
 * Error code catalog for control-plane failures.
 */
export const ErrorCode: {
  readonly INVALID_PATH: 'INVALID_PATH';
  readonly NOT_FOUND: 'NOT_FOUND';
  readonly VALIDATION_FAILED: 'VALIDATION_FAILED';
  readonly ALREADY_REGISTERED: 'ALREADY_REGISTERED';
  readonly INVALID_COMMAND: 'INVALID_COMMAND';
  readonly INVALID_CODEC: 'INVALID_CODEC';
  readonly INVALID_ADAPTIVE: 'INVALID_ADAPTIVE';
  readonly INTERNAL_ERROR: 'INTERNAL_ERROR';
};

/**
 * Union of all error code values.
 */
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * Serializable error payload returned by command execution.
 */
export interface ErrorShape {
  code: ErrorCode;
  message: string;
  details?: unknown;
}

/**
 * Result envelope for control-plane operations.
 */
export type Result<T> = { ok: true; data: T } | { ok: false; error: ErrorShape };

/**
 * Base error type for Alfred Live failures.
 */
export class AlfredLiveError extends Error {
  readonly code: ErrorCode;
  readonly details?: unknown;
  constructor(code: ErrorCode, message: string, details?: unknown);
}

/**
 * Error for invalid path expressions.
 */
export class InvalidPathError extends AlfredLiveError {
  constructor(message?: string, details?: unknown);
}

/**
 * Error when a registry entry is not found.
 */
export class NotFoundError extends AlfredLiveError {
  constructor(message?: string, details?: unknown);
}

/**
 * Error for validation or codec failures.
 */
export class ValidationError extends AlfredLiveError {
  constructor(message?: string, details?: unknown);
}

/**
 * Error when attempting to register a duplicate path.
 */
export class AlreadyRegisteredError extends AlfredLiveError {
  constructor(message?: string, details?: unknown);
}

/**
 * Error for malformed commands.
 */
export class InvalidCommandError extends AlfredLiveError {
  constructor(message?: string, details?: unknown);
}

/**
 * Error for invalid codec implementations.
 */
export class InvalidCodecError extends AlfredLiveError {
  constructor(message?: string, details?: unknown);
}

/**
 * Error for invalid Adaptive implementations.
 */
export class InvalidAdaptiveError extends AlfredLiveError {
  constructor(message?: string, details?: unknown);
}

/**
 * Live value wrapper with versioning and update timestamps.
 */
export class Adaptive<T> {
  /**
   * @param initialValue Initial value.
   */
  constructor(initialValue: T);
  /**
   * @returns Current value.
   */
  get(): T;
  /**
   * @param nextValue New value.
   */
  set(nextValue: T): void;
  /**
   * Update the value using a functional updater.
   * @param updater Function that returns the next value.
   */
  update(updater: (current: T) => T): void;
  /**
   * Monotonic version number, incremented on each update.
   */
  readonly version: number;
  /**
   * Unix epoch timestamp (ms) of the last update.
   */
  readonly updatedAt: number;
}

/**
 * Parser/formatter pair for a config entry.
 */
export interface ConfigCodec<T> {
  parse: (input: string) => T;
  format: (value: T) => string;
}

/**
 * Snapshot of a config entry after read/write.
 */
export interface ConfigSnapshot {
  path: string;
  value: unknown;
  formatted: string;
  version: number;
  updatedAt: number;
}

/**
 * Defaults for live retry configuration.
 */
export interface LiveRetryDefaults {
  retries?: number;
  delay?: number;
  maxDelay?: number;
  backoff?: 'constant' | 'linear' | 'exponential';
  jitter?: 'none' | 'full' | 'equal' | 'decorrelated';
  shouldRetry?: (error: Error) => boolean;
  onRetry?: (error: Error, attempt: number, delay: number) => void;
  telemetry?: TelemetrySink;
  clock?: any;
  signal?: AbortSignal;
}

/**
 * Defaults for live bulkhead configuration.
 */
export interface LiveBulkheadDefaults {
  limit?: number;
  queueLimit?: number;
  telemetry?: TelemetrySink;
  clock?: any;
}

/**
 * Defaults for live circuit breaker configuration.
 */
export interface LiveCircuitBreakerDefaults {
  threshold?: number;
  duration?: number;
  successThreshold?: number;
  shouldTrip?: (error: Error) => boolean;
  onOpen?: () => void;
  onClose?: () => void;
  onHalfOpen?: () => void;
  telemetry?: TelemetrySink;
  clock?: any;
}

/**
 * Defaults for live timeout configuration.
 */
export interface LiveTimeoutOptions {
  onTimeout?: (elapsed: number) => void;
  telemetry?: TelemetrySink;
  clock?: any;
}

export interface LiveTimeoutDefaults extends LiveTimeoutOptions {
  ms: number;
}

/**
 * Live policy wrapper that returns Result envelopes on execution.
 */
export interface LivePolicy {
  execute<T>(fn: () => Promise<T>): Promise<Result<T>>;
}

/**
 * Registry of live configuration entries.
 */
export class ConfigRegistry {
  /**
   * Register a new config entry.
   */
  register<T>(path: string, adaptive: Adaptive<T>, codec: ConfigCodec<T>): Result<{ path: string }>;
  /**
   * List registered keys. Supports path-style prefix matching.
   */
  keys(prefix?: string): Result<string[]>;
  /**
   * Read a config entry snapshot.
   */
  read(path: string): Result<ConfigSnapshot>;
  /**
   * Parse and apply a new value to a config entry.
   */
  write(path: string, value: string): Result<ConfigSnapshot>;
}

/**
 * Command to read a config entry.
 */
export type ReadConfigCommand = { type: 'read_config'; path: string };
/**
 * Command to write a config entry.
 */
export type WriteConfigCommand = { type: 'write_config'; path: string; value: string };
/**
 * Command to list config keys by prefix.
 */
export type ListConfigCommand = { type: 'list_config'; prefix?: string };
/**
 * All supported command shapes.
 */
export type Command = ReadConfigCommand | WriteConfigCommand | ListConfigCommand;
/**
 * Result of executing a command.
 */
export type CommandResult = Result<ConfigSnapshot> | Result<string[]>;

/**
 * JSONL command envelope.
 */
export type CommandEnvelope =
  | { id: string; cmd: 'read_config'; args: { path: string }; auth?: string }
  | {
      id: string;
      cmd: 'write_config';
      args: { path: string; value: string };
      auth?: string;
    }
  | { id: string; cmd: 'list_config'; args: { prefix?: string }; auth?: string };

/**
 * JSONL result envelope.
 */
export type ResultEnvelope =
  | { id: string; ok: true; data: ConfigSnapshot | string[] }
  | { id: string; ok: false; error: ErrorShape };

/**
 * Validate a command envelope.
 */
export function validateCommandEnvelope(envelope: unknown): Result<CommandEnvelope>;

/**
 * Decode a JSONL command envelope.
 */
export function decodeCommandEnvelope(line: string): Result<CommandEnvelope>;

/**
 * Encode a command envelope as JSONL.
 */
export function encodeCommandEnvelope(envelope: CommandEnvelope): Result<string>;

/**
 * Build a result envelope.
 */
export function buildResultEnvelope(
  id: string,
  result: Result<ConfigSnapshot | string[]>
): ResultEnvelope;

/**
 * Encode a result envelope as JSONL.
 */
export function encodeResultEnvelope(envelope: ResultEnvelope): Result<string>;

/**
 * Execute a command envelope using a router.
 */
export function executeCommandEnvelope(
  router: CommandRouter,
  envelope: CommandEnvelope
): ResultEnvelope;

/**
 * Decode and execute a JSONL command line.
 */
export function executeCommandLine(
  router: CommandRouter,
  line: string,
  options?: { fallbackId?: string }
): Result<string>;

/**
 * Executes control-plane commands against a ConfigRegistry.
 */
export class CommandRouter {
  constructor(registry: ConfigRegistry);
  /**
   * Execute a command and return a Result envelope.
   */
  execute(command: Command): CommandResult;
}

/**
 * Supported live policy kinds.
 */
export type LivePolicyKind = 'retry' | 'bulkhead' | 'circuitBreaker' | 'timeout';

/**
 * Resolved binding for a live policy entry.
 */
export interface LivePolicyBinding {
  binding: string;
  kind: LivePolicyKind;
  path: string;
}

/**
 * Declarative builder for live policy stacks.
 */
export class LivePolicyPlan {
  /**
   * Define a live retry policy binding.
   */
  static retry(binding: string, defaults?: LiveRetryDefaults): LivePolicyPlan;
  /**
   * Define a live bulkhead policy binding.
   */
  static bulkhead(binding: string, defaults?: LiveBulkheadDefaults): LivePolicyPlan;
  /**
   * Define a live circuit breaker policy binding.
   */
  static circuitBreaker(binding: string, defaults?: LiveCircuitBreakerDefaults): LivePolicyPlan;
  /**
   * Define a live timeout policy binding.
   */
  static timeout(binding: string, ms: number, options?: LiveTimeoutOptions): LivePolicyPlan;
  static timeout(binding: string, defaults: LiveTimeoutDefaults): LivePolicyPlan;
  /**
   * Wrap a static policy inside a live plan.
   */
  static static(
    policy: CorePolicy | { execute(fn: () => Promise<unknown>): Promise<unknown> }
  ): LivePolicyPlan;
  /**
   * Wrap another plan inside this one.
   */
  wrap(otherPlan: LivePolicyPlan): LivePolicyPlan;
  /**
   * Raw plan nodes.
   */
  readonly nodes: Array<{
    kind: LivePolicyKind | 'static';
    binding?: string;
    defaults?: Record<string, unknown>;
    policy?: CorePolicy | { execute(fn: () => Promise<unknown>): Promise<unknown> };
  }>;
}

/**
 * Control plane orchestrator for live policy bindings.
 */
export class ControlPlane {
  constructor(registry: ConfigRegistry);
  /**
   * Bind a live policy plan to a base path and return a live policy wrapper.
   *
   * The returned policy resolves live config on each execution and returns
   * Result envelopes. Registry read failures surface as Result errors.
   */
  registerLivePolicy(
    plan: LivePolicyPlan,
    basePath: string
  ): Result<{ policy: LivePolicy; bindings: LivePolicyBinding[]; paths: string[] }>;
}
