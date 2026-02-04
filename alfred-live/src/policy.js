import { Policy as CorePolicy, bulkhead, circuitBreaker, retry, timeout } from '@git-stunts/alfred';
import { Adaptive } from './adaptive.js';
import {
  AlfredLiveError,
  ErrorCode,
  InvalidPathError,
  ValidationError,
  errorResult,
  okResult,
} from './errors.js';

const BACKOFF_VALUES = ['constant', 'linear', 'exponential'];
const JITTER_VALUES = ['none', 'full', 'equal', 'decorrelated'];

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

const POLICY_SPECS = {
  retry: { fields: RETRY_FIELDS },
  bulkhead: { fields: BULKHEAD_FIELDS },
  circuitBreaker: { fields: CIRCUIT_FIELDS },
  timeout: { fields: TIMEOUT_FIELDS },
};

function assertRegistry(registry) {
  if (!registry || typeof registry.read !== 'function' || typeof registry.register !== 'function') {
    throw new Error('ConfigRegistry instance required for live policies.');
  }
}

function isString(value) {
  return typeof value === 'string';
}

function isInvalidSegment(segment) {
  if (!segment) {
    return true;
  }
  if (segment === '.' || segment === '..') {
    return true;
  }
  if (segment.includes('*')) {
    return true;
  }
  if (segment.includes('\\')) {
    return true;
  }
  return false;
}

function validatePath(path) {
  if (!isString(path)) {
    return new InvalidPathError('Path must be a string.', { path });
  }
  const trimmed = path.trim();
  if (!trimmed) {
    return new InvalidPathError('Path cannot be empty.', { path });
  }
  if (trimmed.startsWith('/')) {
    return new InvalidPathError('Path must be relative (no leading "/").', { path });
  }
  if (trimmed.endsWith('/')) {
    return new InvalidPathError('Path cannot end with "/".', { path });
  }
  if (trimmed.includes('\\')) {
    return new InvalidPathError('Path must use "/" separators.', { path });
  }
  if (trimmed.includes('*')) {
    return new InvalidPathError('Path cannot include "*".', { path });
  }
  const segments = trimmed.split('/');
  for (const segment of segments) {
    if (isInvalidSegment(segment)) {
      return new InvalidPathError('Path contains invalid segment.', { path, segment });
    }
  }
  return null;
}

function validateBinding(binding) {
  if (!isString(binding)) {
    return new ValidationError('Binding must be a string.', { binding });
  }
  const trimmed = binding.trim();
  if (!trimmed) {
    return new ValidationError('Binding cannot be empty.', { binding });
  }
  if (trimmed.includes('/')) {
    return new ValidationError('Binding must be a single path segment.', { binding });
  }
  if (isInvalidSegment(trimmed)) {
    return new ValidationError('Binding contains invalid characters.', { binding });
  }
  return null;
}

function normalizePath(path) {
  return path.trim();
}

function normalizeBinding(binding) {
  return binding.trim();
}

function joinPath(basePath, segment) {
  if (!basePath) {
    return segment;
  }
  return `${basePath}/${segment}`;
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

function resolveDefaultValue(field, defaults) {
  if (defaults && Object.prototype.hasOwnProperty.call(defaults, field.key)) {
    return defaults[field.key];
  }
  if (Object.prototype.hasOwnProperty.call(field, 'defaultValue')) {
    return field.defaultValue;
  }
  return undefined;
}

function ensureEntry({ registry, path, defaultValue, codec }) {
  const result = registry.register(path, new Adaptive(defaultValue), codec);
  if (result.ok) {
    return okResult({ path });
  }
  if (result.error?.code === ErrorCode.ALREADY_REGISTERED) {
    return okResult({ path });
  }
  return result;
}

function ensureEntries({ registry, bindingPath, fields, defaults }) {
  const keys = [];

  for (const field of fields) {
    const value = resolveDefaultValue(field, defaults);
    if (value === undefined) {
      if (field.required) {
        return errorResult(
          new ValidationError(`Missing default for ${field.key}.`, { path: bindingPath })
        );
      }
      continue;
    }

    const validationError = field.validate ? field.validate(value) : null;
    if (validationError) {
      return errorResult(validationError);
    }

    const path = joinPath(bindingPath, field.key);
    const result = ensureEntry({ registry, path, defaultValue: value, codec: field.codec });
    if (!result.ok) {
      return result;
    }
    keys.push(path);
  }

  return okResult({ keys });
}

function readValue(registry, path) {
  const result = registry.read(path);
  if (!result.ok) {
    return result;
  }
  return okResult(result.data.value);
}

function createLiveResolver(registry, path) {
  return () => {
    const result = readValue(registry, path);
    if (!result.ok) {
      throw new AlfredLiveError(result.error.code, result.error.message, result.error.details);
    }
    return result.data;
  };
}

function createLiveOptions(registry, bindingPath, fields) {
  const liveOptions = {};
  for (const field of fields) {
    const path = joinPath(bindingPath, field.key);
    liveOptions[field.key] = createLiveResolver(registry, path);
  }
  return liveOptions;
}

function pickStaticOptions(defaults, liveKeys) {
  if (!defaults) {
    return {};
  }
  const staticOptions = {};
  for (const [key, value] of Object.entries(defaults)) {
    if (!liveKeys.includes(key)) {
      staticOptions[key] = value;
    }
  }
  return staticOptions;
}

function buildRetryPolicy(registry, bindingPath, defaults) {
  const liveOptions = createLiveOptions(registry, bindingPath, RETRY_FIELDS);
  const staticOptions = pickStaticOptions(
    defaults,
    RETRY_FIELDS.map((field) => field.key)
  );
  return new CorePolicy((fn) => retry(fn, { ...staticOptions, ...liveOptions }));
}

function buildBulkheadPolicy(registry, bindingPath, defaults) {
  const liveOptions = createLiveOptions(registry, bindingPath, BULKHEAD_FIELDS);
  const staticOptions = pickStaticOptions(
    defaults,
    BULKHEAD_FIELDS.map((field) => field.key)
  );
  const livePolicy = bulkhead({ ...staticOptions, ...liveOptions });
  return new CorePolicy((fn) => livePolicy.execute(fn));
}

function buildCircuitPolicy(registry, bindingPath, defaults) {
  const liveOptions = createLiveOptions(registry, bindingPath, CIRCUIT_FIELDS);
  const staticOptions = pickStaticOptions(
    defaults,
    CIRCUIT_FIELDS.map((field) => field.key)
  );
  const livePolicy = circuitBreaker({ ...staticOptions, ...liveOptions });
  return new CorePolicy((fn) => livePolicy.execute(fn));
}

function buildTimeoutPolicy(registry, bindingPath, defaults) {
  const { ms } = createLiveOptions(registry, bindingPath, TIMEOUT_FIELDS);
  const staticOptions = pickStaticOptions(defaults, ['ms']);
  return new CorePolicy((fn) => timeout(ms, fn, staticOptions));
}

function normalizeStaticPolicy(policy) {
  if (policy instanceof CorePolicy) {
    return policy;
  }
  if (policy && typeof policy.execute === 'function') {
    return new CorePolicy((fn) => policy.execute(fn));
  }
  throw new Error('Static policy must expose an execute(fn) method.');
}

function buildPolicyFromNode(node, registry, basePath) {
  if (node.kind === 'static') {
    return normalizeStaticPolicy(node.policy);
  }

  const bindingPath = joinPath(basePath, normalizeBinding(node.binding));
  const defaults = node.defaults ?? {};

  switch (node.kind) {
    case 'retry':
      return buildRetryPolicy(registry, bindingPath, defaults);
    case 'bulkhead':
      return buildBulkheadPolicy(registry, bindingPath, defaults);
    case 'circuitBreaker':
      return buildCircuitPolicy(registry, bindingPath, defaults);
    case 'timeout':
      return buildTimeoutPolicy(registry, bindingPath, defaults);
    default:
      throw new Error(`Unsupported live policy kind: ${node.kind}`);
  }
}

function resolveBindingInfo(node, bindingNames) {
  const spec = POLICY_SPECS[node.kind];
  if (!spec) {
    return errorResult(new ValidationError('Unsupported live policy kind.', { kind: node.kind }));
  }

  const bindingError = validateBinding(node.binding);
  if (bindingError) {
    return errorResult(bindingError);
  }

  const normalizedBinding = normalizeBinding(node.binding);
  if (bindingNames.has(normalizedBinding)) {
    return errorResult(
      new ValidationError('Duplicate live policy binding.', { binding: normalizedBinding })
    );
  }
  bindingNames.add(normalizedBinding);

  const defaults = node.defaults ?? {};
  if (defaults === null || typeof defaults !== 'object') {
    return errorResult(
      new ValidationError('Live policy defaults must be an object.', {
        binding: normalizedBinding,
      })
    );
  }

  return okResult({ spec, normalizedBinding, defaults });
}

function ensureLiveBindings({ registry, nodes, basePath }) {
  const bindings = [];
  const bindingNames = new Set();

  for (const node of nodes) {
    if (node.kind === 'static') {
      continue;
    }

    const infoResult = resolveBindingInfo(node, bindingNames);
    if (!infoResult.ok) {
      return infoResult;
    }

    const { spec, normalizedBinding, defaults } = infoResult.data;
    const bindingPath = joinPath(basePath, normalizedBinding);
    const result = ensureEntries({
      registry,
      bindingPath,
      fields: spec.fields,
      defaults,
    });
    if (!result.ok) {
      return result;
    }

    bindings.push({
      binding: normalizedBinding,
      kind: node.kind,
      path: bindingPath,
    });
  }

  return okResult({ bindings });
}

function buildPolicyStack(nodes, registry, basePath) {
  let policy;
  for (const node of nodes) {
    const nodePolicy = buildPolicyFromNode(node, registry, basePath);
    policy = policy ? policy.wrap(nodePolicy) : nodePolicy;
  }
  return policy;
}

function wrapPolicyWithResult(policy, basePath) {
  return {
    execute: async (fn) => {
      try {
        const data = await policy.execute(fn);
        return okResult(data);
      } catch (error) {
        if (error instanceof AlfredLiveError) {
          return errorResult(error);
        }
        return errorResult(
          new AlfredLiveError(ErrorCode.INTERNAL_ERROR, 'Live policy execution failed.', {
            path: basePath,
            error: String(error),
          })
        );
      }
    },
  };
}

/**
 * Declarative builder for live policy stacks.
 *
 * Live policy plans describe the shape of a policy stack without
 * binding it to a registry. Plans become executable policies once
 * registered with a ControlPlane.
 */
export class LivePolicyPlan {
  #nodes;

  constructor(nodes) {
    this.#nodes = nodes;
  }

  /**
   * Define a live retry policy binding.
   * @param {string} binding
   * @param {object} [defaults]
   * @returns {LivePolicyPlan}
   */
  static retry(binding, defaults = {}) {
    return new LivePolicyPlan([{ kind: 'retry', binding, defaults }]);
  }

  /**
   * Define a live bulkhead policy binding.
   * @param {string} binding
   * @param {object} defaults
   * @returns {LivePolicyPlan}
   */
  static bulkhead(binding, defaults = {}) {
    return new LivePolicyPlan([{ kind: 'bulkhead', binding, defaults }]);
  }

  /**
   * Define a live circuit breaker policy binding.
   * @param {string} binding
   * @param {object} defaults
   * @returns {LivePolicyPlan}
   */
  static circuitBreaker(binding, defaults = {}) {
    return new LivePolicyPlan([{ kind: 'circuitBreaker', binding, defaults }]);
  }

  /**
   * Define a live timeout policy binding.
   * @param {string} binding
   * @param {number | object} msOrDefaults
   * @param {object} [options]
   * @returns {LivePolicyPlan}
   */
  static timeout(binding, msOrDefaults, options = {}) {
    const defaults =
      typeof msOrDefaults === 'number' ? { ms: msOrDefaults, ...options } : msOrDefaults;
    return new LivePolicyPlan([{ kind: 'timeout', binding, defaults }]);
  }

  /**
   * Wrap a static policy inside a live plan.
   * @param {CorePolicy | { execute(fn: () => Promise<unknown>): Promise<unknown> }} policy
   * @returns {LivePolicyPlan}
   */
  static static(policy) {
    return new LivePolicyPlan([{ kind: 'static', policy }]);
  }

  /**
   * Wrap another live plan inside this one.
   * @param {LivePolicyPlan} otherPlan
   * @returns {LivePolicyPlan}
   */
  wrap(otherPlan) {
    if (!(otherPlan instanceof LivePolicyPlan)) {
      throw new Error('wrap() expects a LivePolicyPlan.');
    }
    return new LivePolicyPlan([...this.#nodes, ...otherPlan.#nodes]);
  }

  get nodes() {
    return [...this.#nodes];
  }
}

function validatePlan(plan) {
  if (!(plan instanceof LivePolicyPlan)) {
    return errorResult(new ValidationError('LivePolicyPlan instance required.'));
  }
  const nodes = plan.nodes;
  if (nodes.length === 0) {
    return errorResult(new ValidationError('LivePolicyPlan cannot be empty.'));
  }
  return okResult({ nodes });
}

/**
 * Control plane orchestrator for live policy bindings.
 */
export class ControlPlane {
  #registry;

  /**
   * @param {import('./registry.js').ConfigRegistry} registry
   */
  constructor(registry) {
    assertRegistry(registry);
    this.#registry = registry;
  }

  /**
   * Bind a live policy plan to a base path.
   *
   * The returned policy resolves live config at runtime. If a registry read
   * fails during execution, the policy returns a Result envelope with the
   * registry error code/message instead of throwing.
   *
   * @param {LivePolicyPlan} plan
   * @param {string} basePath
   * @returns {{ ok: true, data: { policy: { execute(fn: () => Promise<unknown>): Promise<{ ok: true, data: unknown } | { ok: false, error: { code: string, message: string, details?: unknown } }> }, bindings: Array<{ binding: string, kind: string, path: string }>, paths: string[] } } | { ok: false, error: { code: string, message: string, details?: unknown } }}
   */
  registerLivePolicy(plan, basePath) {
    const planResult = validatePlan(plan);
    if (!planResult.ok) {
      return planResult;
    }

    const pathError = validatePath(basePath);
    if (pathError) {
      return errorResult(pathError);
    }
    const normalizedPath = normalizePath(basePath);

    const bindingsResult = ensureLiveBindings({
      registry: this.#registry,
      nodes: planResult.data.nodes,
      basePath: normalizedPath,
    });
    if (!bindingsResult.ok) {
      return bindingsResult;
    }

    let policy;
    try {
      policy = buildPolicyStack(planResult.data.nodes, this.#registry, normalizedPath);
    } catch (error) {
      return errorResult(
        new AlfredLiveError(ErrorCode.INTERNAL_ERROR, 'Failed to build live policy.', {
          path: normalizedPath,
          error: String(error),
        })
      );
    }
    const { bindings } = bindingsResult.data;
    const livePolicy = wrapPolicyWithResult(policy, normalizedPath);

    return okResult({
      policy: livePolicy,
      bindings,
      paths: bindings.map((binding) => binding.path),
    });
  }
}
