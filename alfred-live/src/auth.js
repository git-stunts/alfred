import { AuthorizationError, ValidationError, errorResult, okResult } from './errors.js';

function validateAuthProvider(provider) {
  if (!provider || typeof provider !== 'object') {
    return new ValidationError('Auth provider must be an object.');
  }
  if (typeof provider.authorize !== 'function') {
    return new ValidationError('Auth provider must implement authorize().');
  }
  return null;
}

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
 * @param {Iterable<string>} tokens
 * @returns {{ authorize(context: { auth?: string }): { ok: true; data: { allowed: true } } | { ok: false; error: { code: string, message: string, details?: unknown } } }}
 */
export function opaqueTokenAuth(tokens) {
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

  const error = validateAuthProvider(provider);
  if (error) {
    return {
      authorize() {
        return errorResult(error);
      },
    };
  }

  return {
    authorize(context) {
      return ensureAuthResult(provider.authorize(context));
    },
  };
}
