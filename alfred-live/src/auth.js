import { AuthorizationError, ValidationError, errorResult, okResult } from './errors.js';

/**
 * @param {unknown} value
 * @returns {value is Iterable<unknown>}
 */
function isIterable(value) {
  if (!value) {
    return false;
  }
  return typeof value[Symbol.iterator] === 'function';
}

/**
 * @param {unknown} result
 * @returns {import('./index.d.ts').Result<unknown>}
 */
function ensureAuthResult(result) {
  if (!result || typeof result !== 'object' || typeof result.ok !== 'boolean') {
    return errorResult(new ValidationError('Auth provider returned an invalid result.'));
  }
  return result;
}

/**
 * Auth provider that always allows commands.
 * @returns {{ authorize(context: unknown): { ok: true; data: { allowed: true } } }}
 */
export function allowAllAuth() {
  return {
    authorize() {
      return okResult({ allowed: true });
    },
  };
}

/**
 * Auth provider that checks for a matching opaque token string.
 * @param {Iterable<string> | string} tokens
 * @returns {{ authorize(context: { auth?: string }): { ok: true; data: { allowed: true } } | { ok: false; error: { code: string, message: string, details?: unknown } } }}
 */
export function opaqueTokenAuth(tokens) {
  if (
    tokens !== undefined &&
    tokens !== null &&
    typeof tokens !== 'string' &&
    !isIterable(tokens)
  ) {
    return {
      authorize() {
        return errorResult(new ValidationError('Auth tokens must be iterable or a string.'));
      },
    };
  }

  const tokenSet = typeof tokens === 'string' ? new Set([tokens]) : new Set(tokens ?? []);

  const provider = {
    authorize(context) {
      if (!context || typeof context !== 'object') {
        return errorResult(new AuthorizationError('Missing auth context.'));
      }
      const auth = context.auth;
      if (typeof auth !== 'string' || auth.trim().length === 0) {
        return errorResult(new AuthorizationError('Missing auth token.'));
      }
      if (!tokenSet.has(auth)) {
        return errorResult(new AuthorizationError('Invalid auth token.'));
      }
      return okResult({ allowed: true });
    },
  };

  return {
    authorize(context) {
      return ensureAuthResult(provider.authorize(context));
    },
  };
}
