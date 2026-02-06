import {
  AlfredLiveError,
  ErrorCode,
  InvalidCommandError,
  ValidationError,
  errorResult,
  okResult,
} from './errors.js';

const COMMANDS = Object.freeze({
  read_config: {
    required: ['path'],
    optional: [],
  },
  write_config: {
    required: ['path', 'value'],
    optional: [],
  },
  list_config: {
    required: [],
    optional: ['prefix'],
  },
});

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeId(value, fallbackId) {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }
  return fallbackId;
}

function parseCommandLine(line) {
  if (typeof line !== 'string' || line.trim().length === 0) {
    return errorResult(new InvalidCommandError('Command line must be a JSON object.'));
  }

  try {
    return okResult(JSON.parse(line));
  } catch (error) {
    return errorResult(
      new InvalidCommandError('Command line is not valid JSON.', { error: String(error) })
    );
  }
}

function hasOnlyKeys(value, allowed) {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function validateString(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return new ValidationError(`${label} must be a non-empty string.`, { value });
  }
  return null;
}

function validateCommandArgs(cmd, args) {
  const spec = COMMANDS[cmd];
  if (!spec) {
    return new InvalidCommandError('Unknown command.', { cmd });
  }

  if (!isPlainObject(args)) {
    return new ValidationError('args must be an object.', { args });
  }

  const allowed = [...spec.required, ...spec.optional];
  if (!hasOnlyKeys(args, allowed)) {
    return new InvalidCommandError('Unknown args provided.', { cmd, args });
  }

  for (const key of spec.required) {
    const error = validateString(args[key], `args.${key}`);
    if (error) {
      return error;
    }
  }

  for (const key of spec.optional) {
    if (args[key] !== undefined) {
      const error = validateString(args[key], `args.${key}`);
      if (error) {
        return error;
      }
    }
  }

  return null;
}

function normalizeEnvelope(envelope) {
  return {
    id: envelope.id,
    cmd: envelope.cmd,
    args: envelope.args ?? {},
    auth: envelope.auth,
  };
}

function buildAuditPreview(payload, fallbackId) {
  if (!isPlainObject(payload)) {
    return { id: fallbackId, raw: payload };
  }

  return {
    id: normalizeId(payload.id, fallbackId),
    cmd: typeof payload.cmd === 'string' ? payload.cmd : undefined,
    args: payload.args,
    auth: typeof payload.auth === 'string' ? payload.auth : undefined,
    raw: payload,
  };
}

function buildAuditEvent(phase, preview, result) {
  const event = {
    phase,
    timestamp: Date.now(),
    id: preview.id,
    cmd: preview.cmd,
    args: preview.args,
    auth: preview.auth,
    raw: preview.raw,
  };

  if (result) {
    event.ok = result.ok;
    if (!result.ok) {
      event.error = result.error;
    }
  }

  return event;
}

function recordAuditEvent(audit, event) {
  if (!audit) {
    return okResult(null);
  }
  if (typeof audit.record !== 'function') {
    return errorResult(new ValidationError('Audit sink must implement record().'));
  }
  try {
    audit.record(event);
  } catch (error) {
    return errorResult(
      new AlfredLiveError(ErrorCode.INTERNAL_ERROR, 'Audit sink failed.', {
        error: String(error),
      })
    );
  }
  return okResult(null);
}

function authorizeCommand(auth, context) {
  if (!auth) {
    return okResult({ allowed: true });
  }
  if (typeof auth.authorize !== 'function') {
    return errorResult(new ValidationError('Auth provider must implement authorize().'));
  }

  let result;
  try {
    result = auth.authorize(context);
  } catch (error) {
    return errorResult(
      new AlfredLiveError(ErrorCode.INTERNAL_ERROR, 'Auth provider threw.', {
        error: String(error),
      })
    );
  }

  if (!result || typeof result !== 'object' || typeof result.ok !== 'boolean') {
    return errorResult(new ValidationError('Auth provider returned an invalid result.'));
  }

  return result;
}

function buildAuthContext(preview) {
  return {
    id: preview.id,
    cmd: preview.cmd,
    args: preview.args,
    auth: preview.auth,
    raw: preview.raw,
  };
}

function encodeAuditedResult(preview, audit, resultEnvelope) {
  const resultAudit = recordAuditEvent(audit, buildAuditEvent('result', preview, resultEnvelope));
  if (!resultAudit.ok) {
    return encodeResultEnvelope(buildResultEnvelope(preview.id, resultAudit));
  }
  return encodeResultEnvelope(resultEnvelope);
}

function encodeFailure(preview, audit, result) {
  const resultEnvelope = buildResultEnvelope(preview.id, result);
  return encodeAuditedResult(preview, audit, resultEnvelope);
}

/**
 * Validate a command envelope.
 * @param {unknown} envelope
 * @returns {{ ok: true, data: import('./index.d.ts').CommandEnvelope } | { ok: false, error: { code: string, message: string, details?: unknown } }}
 */
export function validateCommandEnvelope(envelope) {
  if (!isPlainObject(envelope)) {
    return errorResult(new InvalidCommandError('Envelope must be an object.'));
  }

  const allowedKeys = ['id', 'cmd', 'args', 'auth'];
  if (!hasOnlyKeys(envelope, allowedKeys)) {
    return errorResult(new InvalidCommandError('Unknown envelope fields.', { envelope }));
  }

  const idError = validateString(envelope.id, 'id');
  if (idError) {
    return errorResult(idError);
  }

  const cmdError = validateString(envelope.cmd, 'cmd');
  if (cmdError) {
    return errorResult(cmdError);
  }

  if (!COMMANDS[envelope.cmd]) {
    return errorResult(new InvalidCommandError('Unknown command.', { cmd: envelope.cmd }));
  }

  const args = envelope.args ?? {};
  const argsError = validateCommandArgs(envelope.cmd, args);
  if (argsError) {
    return errorResult(argsError);
  }

  if (envelope.auth !== undefined) {
    const authError = validateString(envelope.auth, 'auth');
    if (authError) {
      return errorResult(authError);
    }
  }

  return okResult(
    normalizeEnvelope({
      id: envelope.id,
      cmd: envelope.cmd,
      args,
      auth: envelope.auth,
    })
  );
}

/**
 * Decode a JSONL command envelope.
 * @param {string} line
 * @returns {{ ok: true, data: import('./index.d.ts').CommandEnvelope } | { ok: false, error: { code: string, message: string, details?: unknown } }}
 */
export function decodeCommandEnvelope(line) {
  const parsed = parseCommandLine(line);
  if (!parsed.ok) {
    return parsed;
  }
  return validateCommandEnvelope(parsed.data);
}

/**
 * Encode a command envelope as JSONL.
 * @param {import('./index.d.ts').CommandEnvelope} envelope
 * @returns {{ ok: true, data: string } | { ok: false, error: { code: string, message: string, details?: unknown } }}
 */
export function encodeCommandEnvelope(envelope) {
  const validation = validateCommandEnvelope(envelope);
  if (!validation.ok) {
    return validation;
  }

  return okResult(JSON.stringify(validation.data));
}

function commandFromEnvelope(envelope) {
  switch (envelope.cmd) {
    case 'read_config':
      return { type: 'read_config', path: envelope.args.path };
    case 'write_config':
      return { type: 'write_config', path: envelope.args.path, value: envelope.args.value };
    case 'list_config':
      return { type: 'list_config', prefix: envelope.args.prefix };
    default:
      return null;
  }
}

function validateResultEnvelopeShape(envelope) {
  if (!isPlainObject(envelope)) {
    return new InvalidCommandError('Result envelope must be an object.');
  }

  const allowedKeys = ['id', 'ok', 'data', 'error'];
  if (!hasOnlyKeys(envelope, allowedKeys)) {
    return new InvalidCommandError('Unknown result envelope fields.', { envelope });
  }

  const idError = validateString(envelope.id, 'id');
  if (idError) {
    return idError;
  }

  if (typeof envelope.ok !== 'boolean') {
    return new ValidationError('ok must be a boolean.', { ok: envelope.ok });
  }

  return null;
}

function validateOkResultEnvelope(envelope) {
  if (Object.prototype.hasOwnProperty.call(envelope, 'error')) {
    return new ValidationError('error must be omitted when ok is true.');
  }
  if (
    !Object.prototype.hasOwnProperty.call(envelope, 'data') ||
    envelope.data === null ||
    envelope.data === undefined
  ) {
    return new ValidationError('data is required when ok is true.');
  }
  return null;
}

function validateErrorResultEnvelope(envelope) {
  if (Object.prototype.hasOwnProperty.call(envelope, 'data')) {
    return new ValidationError('data must be omitted when ok is false.');
  }
  if (!isPlainObject(envelope.error)) {
    return new ValidationError('error must be an object when ok is false.');
  }
  const codeError = validateString(envelope.error.code, 'error.code');
  if (codeError) {
    return codeError;
  }
  const messageError = validateString(envelope.error.message, 'error.message');
  if (messageError) {
    return messageError;
  }
  return null;
}

function validateResultEnvelope(envelope) {
  const baseError = validateResultEnvelopeShape(envelope);
  if (baseError) {
    return baseError;
  }

  if (envelope.ok) {
    return validateOkResultEnvelope(envelope);
  }

  return validateErrorResultEnvelope(envelope);
}

/**
 * Build a result envelope for JSONL output.
 * @param {string} id
 * @param {{ ok: true, data: unknown } | { ok: false, error: { code: string, message: string, details?: unknown } }} result
 * @returns {{ id: string, ok: true, data: unknown } | { id: string, ok: false, error: { code: string, message: string, details?: unknown } }}
 */
export function buildResultEnvelope(id, result) {
  if (result.ok) {
    return { id, ok: true, data: result.data };
  }
  return {
    id,
    ok: false,
    error: result.error ?? { code: ErrorCode.INTERNAL_ERROR, message: 'Unexpected error.' },
  };
}

/**
 * Encode a result envelope as JSONL.
 * @param {{ id: string, ok: true, data: unknown } | { id: string, ok: false, error: { code: string, message: string, details?: unknown } }} envelope
 * @returns {{ ok: true, data: string } | { ok: false, error: { code: string, message: string, details?: unknown } }}
 */
export function encodeResultEnvelope(envelope) {
  const error = validateResultEnvelope(envelope);
  if (error) {
    return errorResult(error);
  }
  return okResult(JSON.stringify(envelope));
}

/**
 * Execute a validated command envelope using a router.
 * @param {import('./router.js').CommandRouter} router
 * @param {import('./index.d.ts').CommandEnvelope} envelope
 * @returns {import('./index.d.ts').ResultEnvelope}
 */
export function executeCommandEnvelope(router, envelope) {
  let command;
  try {
    command = commandFromEnvelope(envelope);
  } catch (error) {
    return buildResultEnvelope(envelope.id, errorResult(error));
  }

  if (!command) {
    return buildResultEnvelope(
      envelope.id,
      errorResult(new InvalidCommandError('Unknown command.', { cmd: envelope.cmd }))
    );
  }

  let result;
  try {
    result = router.execute(command);
  } catch (error) {
    result = errorResult(error);
  }

  return buildResultEnvelope(envelope.id, result);
}

/**
 * Decode, validate, and execute a JSONL command line.
 * @param {import('./router.js').CommandRouter} router
 * @param {string} line
 * @param {{ fallbackId?: string, audit?: { record(event: import('./index.d.ts').CommandAuditEvent): void }, auth?: { authorize(context: import('./index.d.ts').CommandAuthContext): { ok: true, data: unknown } | { ok: false, error: { code: string, message: string, details?: unknown } } } }} [options]
 * @returns {{ ok: true, data: string } | { ok: false, error: { code: string, message: string, details?: unknown } }}
 */
export function executeCommandLine(router, line, options = {}) {
  const fallbackId = options.fallbackId ?? 'unknown';
  const parsed = parseCommandLine(line);
  const preview = buildAuditPreview(parsed.ok ? parsed.data : line, fallbackId);

  const attemptAudit = recordAuditEvent(options.audit, buildAuditEvent('attempt', preview));
  if (!attemptAudit.ok) {
    return encodeResultEnvelope(buildResultEnvelope(preview.id, attemptAudit));
  }

  if (!parsed.ok) {
    return encodeFailure(preview, options.audit, parsed);
  }

  const authResult = authorizeCommand(options.auth, buildAuthContext(preview));
  if (!authResult.ok) {
    return encodeFailure(preview, options.audit, authResult);
  }

  const decoded = validateCommandEnvelope(parsed.data);
  if (!decoded.ok) {
    return encodeFailure(preview, options.audit, decoded);
  }

  const resultEnvelope = executeCommandEnvelope(router, decoded.data);
  return encodeAuditedResult(preview, options.audit, resultEnvelope);
}
