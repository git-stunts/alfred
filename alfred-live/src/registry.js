import {
  AlreadyRegisteredError,
  InvalidCodecError,
  InvalidPathError,
  InvalidAdaptiveError,
  NotFoundError,
  ValidationError,
  errorResult,
  okResult,
} from './errors.js';

function isString(value) {
  return typeof value === 'string';
}

function isInvalidSegment(segment, allowWildcard) {
  if (!segment) {
    return true;
  }
  if (segment === '.' || segment === '..') {
    return true;
  }
  if (!allowWildcard && segment.includes('*')) {
    return true;
  }
  if (segment.includes('\\')) {
    return true;
  }
  return false;
}

function validatePath(path, allowWildcard) {
  if (!isString(path)) {
    return new InvalidPathError('Path must be a string.', { path });
  }
  if (path.length === 0) {
    return new InvalidPathError('Path cannot be empty.', { path });
  }
  if (path.startsWith('/')) {
    return new InvalidPathError('Path must be relative (no leading "/").', { path });
  }
  if (path.endsWith('/')) {
    return new InvalidPathError('Path cannot end with "/".', { path });
  }
  if (path.includes('\\')) {
    return new InvalidPathError('Path must use "/" separators.', { path });
  }
  if (!allowWildcard && path.includes('*')) {
    return new InvalidPathError('Path cannot include "*".', { path });
  }

  const segments = path.split('/');
  for (const segment of segments) {
    if (isInvalidSegment(segment, allowWildcard)) {
      return new InvalidPathError('Path contains invalid segment.', { path, segment });
    }
  }

  return null;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function wildcardToRegExp(pattern) {
  const parts = pattern.split('*').map(escapeRegExp);
  return new RegExp(`^${parts.join('.*')}$`);
}

function matchesPrefix(path, prefix) {
  if (!prefix) {
    return true;
  }

  if (prefix.includes('*')) {
    return wildcardToRegExp(prefix).test(path);
  }

  return path === prefix || path.startsWith(`${prefix}/`);
}

function validateCodec(codec) {
  if (!codec || typeof codec !== 'object') {
    return new InvalidCodecError('Codec must be an object with parse/format.', { codec });
  }
  if (typeof codec.parse !== 'function') {
    return new InvalidCodecError('Codec.parse must be a function.');
  }
  if (typeof codec.format !== 'function') {
    return new InvalidCodecError('Codec.format must be a function.');
  }
  return null;
}

function validateAdaptive(adaptive) {
  if (!adaptive || typeof adaptive !== 'object') {
    return new InvalidAdaptiveError('Adaptive must be an object.');
  }
  if (typeof adaptive.get !== 'function') {
    return new InvalidAdaptiveError('Adaptive.get must be a function.');
  }
  if (typeof adaptive.set !== 'function') {
    return new InvalidAdaptiveError('Adaptive.set must be a function.');
  }
  if (typeof adaptive.update !== 'function') {
    return new InvalidAdaptiveError('Adaptive.update must be a function.');
  }
  if (typeof adaptive.version !== 'number') {
    return new InvalidAdaptiveError('Adaptive.version must be a number.');
  }
  if (typeof adaptive.updatedAt !== 'number') {
    return new InvalidAdaptiveError('Adaptive.updatedAt must be a number.');
  }
  return null;
}

function createSnapshot(path, entry) {
  try {
    const value = entry.adaptive.get();
    const formatted = entry.format(value);
    return okResult({
      path,
      value,
      formatted,
      version: entry.adaptive.version,
      updatedAt: entry.adaptive.updatedAt,
    });
  } catch (error) {
    return errorResult(
      new ValidationError('Failed to format value.', { path, error: String(error) })
    );
  }
}

/**
 * Registry of live configuration entries.
 *
 * Stores path -> Adaptive + codec mappings and provides typed read/write helpers.
 */
export class ConfigRegistry {
  #entries;

  constructor() {
    this.#entries = new Map();
  }

  /**
   * Register a new config entry.
   *
   * @template T
   * @param {string} path - Slash-delimited path (e.g. "bulkhead/limit").
   * @param {{ get(): T, set(value: T): void, update(updater: (current: T) => T): void, version: number, updatedAt: number }} adaptive
   * @param {{ parse(input: string): T, format(value: T): string }} codec
   * @returns {{ ok: true, data: { path: string } } | { ok: false, error: { code: string, message: string, details?: unknown } }}
   */
  register(path, adaptive, codec) {
    const pathError = validatePath(path, false);
    if (pathError) {
      return errorResult(pathError);
    }

    if (this.#entries.has(path)) {
      return errorResult(new AlreadyRegisteredError(undefined, { path }));
    }

    const adaptiveError = validateAdaptive(adaptive);
    if (adaptiveError) {
      return errorResult(adaptiveError);
    }

    const codecError = validateCodec(codec);
    if (codecError) {
      return errorResult(codecError);
    }

    this.#entries.set(path, {
      adaptive,
      parse: codec.parse,
      format: codec.format,
    });

    return okResult({ path });
  }

  /**
   * List registered keys. Supports path-style prefix matching.
   *
   * @param {string} [prefix]
   * @returns {{ ok: true, data: string[] } | { ok: false, error: { code: string, message: string, details?: unknown } }}
   */
  keys(prefix) {
    const hasPrefix = prefix !== undefined && prefix !== null && prefix !== '';

    if (hasPrefix) {
      const allowWildcard = prefix.includes('*');
      const pathError = validatePath(prefix, allowWildcard);
      if (pathError) {
        return errorResult(pathError);
      }
    }

    const keys = Array.from(this.#entries.keys())
      .filter((key) => matchesPrefix(key, hasPrefix ? prefix : null))
      .sort();

    return okResult(keys);
  }

  /**
   * Read a config entry snapshot.
   *
   * @param {string} path
   * @returns {{ ok: true, data: { path: string, value: unknown, formatted: string, version: number, updatedAt: number } } | { ok: false, error: { code: string, message: string, details?: unknown } }}
   */
  read(path) {
    const pathError = validatePath(path, false);
    if (pathError) {
      return errorResult(pathError);
    }

    const entry = this.#entries.get(path);
    if (!entry) {
      return errorResult(new NotFoundError(undefined, { path }));
    }

    return createSnapshot(path, entry);
  }

  /**
   * Parse and apply a new value to a config entry.
   *
   * @param {string} path
   * @param {string} valueString
   * @returns {{ ok: true, data: { path: string, value: unknown, formatted: string, version: number, updatedAt: number } } | { ok: false, error: { code: string, message: string, details?: unknown } }}
   */
  write(path, valueString) {
    const pathError = validatePath(path, false);
    if (pathError) {
      return errorResult(pathError);
    }

    if (!isString(valueString)) {
      return errorResult(
        new ValidationError('Value must be a string.', { path, value: valueString })
      );
    }

    const entry = this.#entries.get(path);
    if (!entry) {
      return errorResult(new NotFoundError(undefined, { path }));
    }

    let parsedValue;
    try {
      parsedValue = entry.parse(valueString);
    } catch (error) {
      return errorResult(
        new ValidationError('Failed to parse value.', {
          path,
          value: valueString,
          error: String(error),
        })
      );
    }

    try {
      entry.adaptive.set(parsedValue);
    } catch (error) {
      return errorResult(
        new ValidationError('Failed to apply value.', { path, error: String(error) })
      );
    }

    return createSnapshot(path, entry);
  }
}
