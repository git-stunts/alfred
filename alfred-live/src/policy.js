import { Policy as CorePolicy, bulkhead, circuitBreaker, retry, timeout } from '@git-stunts/alfred';
import { Adaptive } from './adaptive.js';
import { ErrorCode, ValidationError, errorResult, okResult } from './errors.js';

const BACKOFF_VALUES = ['constant', 'linear', 'exponential'];
const JITTER_VALUES = ['none', 'full', 'equal', 'decorrelated'];

function assertRegistry(registry) {
  if (!registry || typeof registry.read !== 'function' || typeof registry.register !== 'function') {
    throw new Error('ConfigRegistry instance required for live policies.');
  }
}

function normalizeId(id) {
  if (typeof id !== 'string') {
    throw new Error('Live policy id must be a string.');
  }
  const trimmed = id.trim();
  if (!trimmed) {
    throw new Error('Live policy id cannot be empty.');
  }
  if (trimmed.startsWith('/')) {
    throw new Error('Live policy id must be relative (no leading "/").');
  }
  if (trimmed.endsWith('/')) {
    throw new Error('Live policy id cannot end with "/".');
  }
  if (trimmed.includes('*')) {
    throw new Error('Live policy id cannot include "*".');
  }
  return trimmed;
}

function buildPath(id, key) {
  return `${id}/${key}`;
}

function numberCodec(label) {
  return {
    parse: (value) => {
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) {
        throw new Error(`${label} must be a number`);
      }
      return parsed;
    },
    format: (value) => value.toString(),
  };
}

function enumCodec(label, allowed) {
  return {
    parse: (value) => {
      if (!allowed.includes(value)) {
        throw new Error(`${label} must be one of: ${allowed.join(', ')}`);
      }
      return value;
    },
    format: (value) => value.toString(),
  };
}

function validateNumberDefault(value, label) {
  if (!Number.isFinite(value)) {
    return new ValidationError(`${label} must be a number.`, { value });
  }
  return null;
}

function validateEnumDefault(value, label, allowed) {
  if (!allowed.includes(value)) {
    return new ValidationError(`${label} must be one of: ${allowed.join(', ')}.`, { value });
  }
  return null;
}

const RETRY_FIELDS = [
  {
    key: 'retries',
    defaultValue: 3,
    codec: numberCodec('retry/retries'),
    validate: (value) => validateNumberDefault(value, 'retry/retries'),
  },
  {
    key: 'delay',
    defaultValue: 1000,
    codec: numberCodec('retry/delay'),
    validate: (value) => validateNumberDefault(value, 'retry/delay'),
  },
  {
    key: 'maxDelay',
    defaultValue: 30000,
    codec: numberCodec('retry/maxDelay'),
    validate: (value) => validateNumberDefault(value, 'retry/maxDelay'),
  },
  {
    key: 'backoff',
    defaultValue: 'constant',
    codec: enumCodec('retry/backoff', BACKOFF_VALUES),
    validate: (value) => validateEnumDefault(value, 'retry/backoff', BACKOFF_VALUES),
  },
  {
    key: 'jitter',
    defaultValue: 'none',
    codec: enumCodec('retry/jitter', JITTER_VALUES),
    validate: (value) => validateEnumDefault(value, 'retry/jitter', JITTER_VALUES),
  },
];

const BULKHEAD_FIELDS = [
  {
    key: 'limit',
    codec: numberCodec('bulkhead/limit'),
    validate: (value) => validateNumberDefault(value, 'bulkhead/limit'),
    required: true,
  },
  {
    key: 'queueLimit',
    defaultValue: 0,
    codec: numberCodec('bulkhead/queueLimit'),
    validate: (value) => validateNumberDefault(value, 'bulkhead/queueLimit'),
  },
];

const CIRCUIT_FIELDS = [
  {
    key: 'threshold',
    codec: numberCodec('circuit/threshold'),
    validate: (value) => validateNumberDefault(value, 'circuit/threshold'),
    required: true,
  },
  {
    key: 'duration',
    codec: numberCodec('circuit/duration'),
    validate: (value) => validateNumberDefault(value, 'circuit/duration'),
    required: true,
  },
  {
    key: 'successThreshold',
    defaultValue: 1,
    codec: numberCodec('circuit/successThreshold'),
    validate: (value) => validateNumberDefault(value, 'circuit/successThreshold'),
  },
];

const TIMEOUT_FIELDS = [
  {
    key: 'ms',
    codec: numberCodec('timeout/ms'),
    validate: (value) => validateNumberDefault(value, 'timeout/ms'),
    required: true,
  },
];

function resolveDefaultValue(field, defaults) {
  if (defaults && Object.prototype.hasOwnProperty.call(defaults, field.key)) {
    return defaults[field.key];
  }
  if (Object.prototype.hasOwnProperty.call(field, 'defaultValue')) {
    return field.defaultValue;
  }
  return undefined;
}

function ensureEntry(registry, path, defaultValue, codec) {
  const existing = registry.read(path);
  if (existing.ok) {
    return okResult({ path });
  }
  if (existing.error?.code && existing.error.code !== ErrorCode.NOT_FOUND) {
    return existing;
  }

  const result = registry.register(path, new Adaptive(defaultValue), codec);
  if (result.ok) {
    return okResult({ path });
  }
  if (result.error?.code === ErrorCode.ALREADY_REGISTERED) {
    return okResult({ path });
  }
  return result;
}

function ensureEntries(registry, id, fields, defaults) {
  const keys = [];

  for (const field of fields) {
    const value = resolveDefaultValue(field, defaults);
    if (value === undefined) {
      if (field.required) {
        return errorResult(
          new ValidationError(`Missing default for ${field.key}.`, { id, key: field.key })
        );
      }
      continue;
    }

    const validationError = field.validate ? field.validate(value) : null;
    if (validationError) {
      return errorResult(validationError);
    }

    const path = buildPath(id, field.key);
    const result = ensureEntry(registry, path, value, field.codec);
    if (!result.ok) {
      return result;
    }
    keys.push(path);
  }

  return okResult({ id, keys });
}

function ensureEntriesExist(registry, id, fields) {
  for (const field of fields) {
    const path = buildPath(id, field.key);
    const result = registry.read(path);
    if (!result.ok) {
      throw new Error(`Live policy "${id}" missing config: ${path}`);
    }
  }
}

function readValue(registry, path) {
  const result = registry.read(path);
  if (!result.ok) {
    throw new Error(`Live config read failed for "${path}": ${result.error.message}`);
  }
  return result.data.value;
}

function readLiveValues(registry, id, fields) {
  const values = {};
  for (const field of fields) {
    values[field.key] = readValue(registry, buildPath(id, field.key));
  }
  return values;
}

function createLiveResolver(registry, path) {
  return () => readValue(registry, path);
}

function pickStaticOptions(defaults, liveKeys) {
  if (!defaults) return {};
  const staticOptions = {};
  for (const [key, value] of Object.entries(defaults)) {
    if (!liveKeys.includes(key)) {
      staticOptions[key] = value;
    }
  }
  return staticOptions;
}

/**
 * Register live retry defaults in the registry.
 * @param {import('./registry.js').ConfigRegistry} registry
 * @param {string} id
 * @param {object} [defaults]
 * @returns {{ ok: true, data: { id: string, keys: string[] } } | { ok: false, error: { code: string, message: string, details?: unknown } }}
 */
export function defineLiveRetry(registry, id, defaults = {}) {
  assertRegistry(registry);
  const normalizedId = normalizeId(id);
  return ensureEntries(registry, normalizedId, RETRY_FIELDS, defaults);
}

/**
 * Register live bulkhead defaults in the registry.
 * @param {import('./registry.js').ConfigRegistry} registry
 * @param {string} id
 * @param {object} [defaults]
 * @returns {{ ok: true, data: { id: string, keys: string[] } } | { ok: false, error: { code: string, message: string, details?: unknown } }}
 */
export function defineLiveBulkhead(registry, id, defaults = {}) {
  assertRegistry(registry);
  const normalizedId = normalizeId(id);
  return ensureEntries(registry, normalizedId, BULKHEAD_FIELDS, defaults);
}

/**
 * Register live circuit breaker defaults in the registry.
 * @param {import('./registry.js').ConfigRegistry} registry
 * @param {string} id
 * @param {object} [defaults]
 * @returns {{ ok: true, data: { id: string, keys: string[] } } | { ok: false, error: { code: string, message: string, details?: unknown } }}
 */
export function defineLiveCircuitBreaker(registry, id, defaults = {}) {
  assertRegistry(registry);
  const normalizedId = normalizeId(id);
  return ensureEntries(registry, normalizedId, CIRCUIT_FIELDS, defaults);
}

/**
 * Register live timeout defaults in the registry.
 * @param {import('./registry.js').ConfigRegistry} registry
 * @param {string} id
 * @param {object} [defaults]
 * @returns {{ ok: true, data: { id: string, keys: string[] } } | { ok: false, error: { code: string, message: string, details?: unknown } }}
 */
export function defineLiveTimeout(registry, id, defaults = {}) {
  assertRegistry(registry);
  const normalizedId = normalizeId(id);
  return ensureEntries(registry, normalizedId, TIMEOUT_FIELDS, defaults);
}

/**
 * Policy class with live-control helpers.
 */
export class Policy extends CorePolicy {
  static liveRetry(id, registry, defaults) {
    assertRegistry(registry);
    const normalizedId = normalizeId(id);

    if (defaults) {
      const result = defineLiveRetry(registry, normalizedId, defaults);
      if (!result.ok) {
        throw new Error(result.error.message);
      }
    } else {
      ensureEntriesExist(registry, normalizedId, RETRY_FIELDS);
    }

    const staticOptions = pickStaticOptions(
      defaults,
      RETRY_FIELDS.map((field) => field.key)
    );

    return new Policy((fn) => {
      const liveValues = readLiveValues(registry, normalizedId, RETRY_FIELDS);
      return retry(fn, { ...staticOptions, ...liveValues });
    });
  }

  static liveBulkhead(id, registry, defaults) {
    assertRegistry(registry);
    const normalizedId = normalizeId(id);

    if (defaults) {
      const result = defineLiveBulkhead(registry, normalizedId, defaults);
      if (!result.ok) {
        throw new Error(result.error.message);
      }
    } else {
      ensureEntriesExist(registry, normalizedId, BULKHEAD_FIELDS);
    }

    const staticOptions = pickStaticOptions(
      defaults,
      BULKHEAD_FIELDS.map((field) => field.key)
    );
    const limitPath = buildPath(normalizedId, 'limit');
    const queueLimitPath = buildPath(normalizedId, 'queueLimit');

    const livePolicy = bulkhead({
      ...staticOptions,
      limit: createLiveResolver(registry, limitPath),
      queueLimit: createLiveResolver(registry, queueLimitPath),
    });

    return new Policy((fn) => livePolicy.execute(fn));
  }

  static liveCircuitBreaker(id, registry, defaults) {
    assertRegistry(registry);
    const normalizedId = normalizeId(id);

    if (defaults) {
      const result = defineLiveCircuitBreaker(registry, normalizedId, defaults);
      if (!result.ok) {
        throw new Error(result.error.message);
      }
    } else {
      ensureEntriesExist(registry, normalizedId, CIRCUIT_FIELDS);
    }

    const staticOptions = pickStaticOptions(
      defaults,
      CIRCUIT_FIELDS.map((field) => field.key)
    );
    const thresholdPath = buildPath(normalizedId, 'threshold');
    const durationPath = buildPath(normalizedId, 'duration');
    const successThresholdPath = buildPath(normalizedId, 'successThreshold');

    const livePolicy = circuitBreaker({
      ...staticOptions,
      threshold: createLiveResolver(registry, thresholdPath),
      duration: createLiveResolver(registry, durationPath),
      successThreshold: createLiveResolver(registry, successThresholdPath),
    });

    return new Policy((fn) => livePolicy.execute(fn));
  }

  static liveTimeout(id, registry, defaults) {
    assertRegistry(registry);
    const normalizedId = normalizeId(id);

    if (defaults) {
      const result = defineLiveTimeout(registry, normalizedId, defaults);
      if (!result.ok) {
        throw new Error(result.error.message);
      }
    } else {
      ensureEntriesExist(registry, normalizedId, TIMEOUT_FIELDS);
    }

    const staticOptions = pickStaticOptions(
      defaults,
      TIMEOUT_FIELDS.map((field) => field.key)
    );

    return new Policy((fn) => {
      const { ms } = readLiveValues(registry, normalizedId, TIMEOUT_FIELDS);
      return timeout(ms, fn, staticOptions);
    });
  }
}
