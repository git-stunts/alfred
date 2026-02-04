/**
 * In-memory control plane primitives for Alfred.
 *
 * This package is intentionally platform-agnostic: no filesystem,
 * no stdin/stdout, no Node-only dependencies.
 *
 * @module
 */

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
 * Executes control-plane commands against a ConfigRegistry.
 */
export class CommandRouter {
  constructor(registry: ConfigRegistry);
  /**
   * Execute a command and return a Result envelope.
   */
  execute(command: Command): CommandResult;
}
