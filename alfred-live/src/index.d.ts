/**
 * In-memory control plane primitives for Alfred.
 *
 * This package is intentionally platform-agnostic: no filesystem,
 * no stdin/stdout, no Node-only dependencies.
 *
 * @module
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

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface ErrorShape {
  code: ErrorCode;
  message: string;
  details?: unknown;
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: ErrorShape };

export class AlfredLiveError extends Error {
  readonly code: ErrorCode;
  readonly details?: unknown;
  constructor(code: ErrorCode, message: string, details?: unknown);
}

export class InvalidPathError extends AlfredLiveError {
  constructor(message?: string, details?: unknown);
}

export class NotFoundError extends AlfredLiveError {
  constructor(message?: string, details?: unknown);
}

export class ValidationError extends AlfredLiveError {
  constructor(message?: string, details?: unknown);
}

export class AlreadyRegisteredError extends AlfredLiveError {
  constructor(message?: string, details?: unknown);
}

export class InvalidCommandError extends AlfredLiveError {
  constructor(message?: string, details?: unknown);
}

export class InvalidCodecError extends AlfredLiveError {
  constructor(message?: string, details?: unknown);
}

export class InvalidAdaptiveError extends AlfredLiveError {
  constructor(message?: string, details?: unknown);
}

export class Adaptive<T> {
  constructor(initialValue: T);
  get(): T;
  set(nextValue: T): void;
  update(updater: (current: T) => T): void;
  readonly version: number;
  readonly updatedAt: number;
}

export interface ConfigCodec<T> {
  parse: (input: string) => T;
  format: (value: T) => string;
}

export interface ConfigSnapshot {
  path: string;
  value: unknown;
  formatted: string;
  version: number;
  updatedAt: number;
}

export class ConfigRegistry {
  register<T>(path: string, adaptive: Adaptive<T>, codec: ConfigCodec<T>): Result<{ path: string }>;
  keys(prefix?: string): Result<string[]>;
  read(path: string): Result<ConfigSnapshot>;
  write(path: string, value: string): Result<ConfigSnapshot>;
}

export type ReadConfigCommand = { type: 'read_config'; path: string };
export type WriteConfigCommand = { type: 'write_config'; path: string; value: string };
export type ListConfigCommand = { type: 'list_config'; prefix?: string };
export type Command = ReadConfigCommand | WriteConfigCommand | ListConfigCommand;
export type CommandResult = Result<ConfigSnapshot> | Result<string[]>;

export class CommandRouter {
  constructor(registry: ConfigRegistry);
  execute(command: Command): CommandResult;
}
