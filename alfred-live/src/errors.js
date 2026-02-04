/**
 * Error codes returned by the control plane.
 */
export const ErrorCode = Object.freeze({
  INVALID_PATH: 'INVALID_PATH',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  ALREADY_REGISTERED: 'ALREADY_REGISTERED',
  INVALID_COMMAND: 'INVALID_COMMAND',
  INVALID_CODEC: 'INVALID_CODEC',
  INVALID_ADAPTIVE: 'INVALID_ADAPTIVE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
});

/**
 * Base error for Alfred Live control-plane operations.
 */
export class AlfredLiveError extends Error {
  /**
   * @param {keyof typeof ErrorCode} code - Error code identifier.
   * @param {string} message - Human-readable error message.
   * @param {unknown} [details] - Optional structured error details.
   */
  constructor(code, message, details) {
    super(message);
    this.code = code;
    this.details = details;
    this.name = this.constructor.name;
  }
}

/**
 * Error for invalid path expressions.
 */
export class InvalidPathError extends AlfredLiveError {
  constructor(message = 'Invalid path.', details) {
    super(ErrorCode.INVALID_PATH, message, details);
  }
}

/**
 * Error for missing registry entries.
 */
export class NotFoundError extends AlfredLiveError {
  constructor(message = 'Path not found.', details) {
    super(ErrorCode.NOT_FOUND, message, details);
  }
}

/**
 * Error for validation and codec failures.
 */
export class ValidationError extends AlfredLiveError {
  constructor(message = 'Validation failed.', details) {
    super(ErrorCode.VALIDATION_FAILED, message, details);
  }
}

/**
 * Error for duplicate registry registrations.
 */
export class AlreadyRegisteredError extends AlfredLiveError {
  constructor(message = 'Path already registered.', details) {
    super(ErrorCode.ALREADY_REGISTERED, message, details);
  }
}

/**
 * Error for malformed commands.
 */
export class InvalidCommandError extends AlfredLiveError {
  constructor(message = 'Invalid command.', details) {
    super(ErrorCode.INVALID_COMMAND, message, details);
  }
}

/**
 * Error for invalid codec implementations.
 */
export class InvalidCodecError extends AlfredLiveError {
  constructor(message = 'Invalid codec.', details) {
    super(ErrorCode.INVALID_CODEC, message, details);
  }
}

/**
 * Error for invalid Adaptive implementations.
 */
export class InvalidAdaptiveError extends AlfredLiveError {
  constructor(message = 'Invalid adaptive.', details) {
    super(ErrorCode.INVALID_ADAPTIVE, message, details);
  }
}

/**
 * Normalize errors into a serializable error shape.
 * @param {unknown} error
 * @returns {{ code: string, message: string, details?: unknown }}
 */
export function toErrorShape(error) {
  if (error instanceof AlfredLiveError) {
    return {
      code: error.code,
      message: error.message,
      details: error.details,
    };
  }

  return {
    code: ErrorCode.INTERNAL_ERROR,
    message: 'Unexpected error.',
    details: { error: String(error) },
  };
}

/**
 * Build a successful result envelope.
 * @template T
 * @param {T} data
 * @returns {{ ok: true, data: T }}
 */
export function okResult(data) {
  return { ok: true, data };
}

/**
 * Build a failed result envelope.
 * @param {unknown} error
 * @returns {{ ok: false, error: { code: string, message: string, details?: unknown } }}
 */
export function errorResult(error) {
  return { ok: false, error: toErrorShape(error) };
}
