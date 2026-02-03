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

export class AlfredLiveError extends Error {
  constructor(code, message, details) {
    super(message);
    this.code = code;
    this.details = details;
    this.name = this.constructor.name;
  }
}

export class InvalidPathError extends AlfredLiveError {
  constructor(message = 'Invalid path.', details) {
    super(ErrorCode.INVALID_PATH, message, details);
  }
}

export class NotFoundError extends AlfredLiveError {
  constructor(message = 'Path not found.', details) {
    super(ErrorCode.NOT_FOUND, message, details);
  }
}

export class ValidationError extends AlfredLiveError {
  constructor(message = 'Validation failed.', details) {
    super(ErrorCode.VALIDATION_FAILED, message, details);
  }
}

export class AlreadyRegisteredError extends AlfredLiveError {
  constructor(message = 'Path already registered.', details) {
    super(ErrorCode.ALREADY_REGISTERED, message, details);
  }
}

export class InvalidCommandError extends AlfredLiveError {
  constructor(message = 'Invalid command.', details) {
    super(ErrorCode.INVALID_COMMAND, message, details);
  }
}

export class InvalidCodecError extends AlfredLiveError {
  constructor(message = 'Invalid codec.', details) {
    super(ErrorCode.INVALID_CODEC, message, details);
  }
}

export class InvalidAdaptiveError extends AlfredLiveError {
  constructor(message = 'Invalid adaptive.', details) {
    super(ErrorCode.INVALID_ADAPTIVE, message, details);
  }
}

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

export function okResult(data) {
  return { ok: true, data };
}

export function errorResult(error) {
  return { ok: false, error: toErrorShape(error) };
}
