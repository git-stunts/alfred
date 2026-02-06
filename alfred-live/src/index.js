/**
 * In-memory control plane primitives for Alfred.
 *
 * This package is intentionally platform-agnostic: no filesystem,
 * no stdin/stdout, no Node-only dependencies.
 *
 * @module
 */

// @ts-self-types="./index.d.ts"

export { Adaptive } from './adaptive.js';
export { ConfigRegistry } from './registry.js';
export { CommandRouter } from './router.js';
export { InMemoryAuditSink, ConsoleAuditSink, MultiAuditSink } from './audit.js';
export { allowAllAuth, opaqueTokenAuth } from './auth.js';
export {
  buildResultEnvelope,
  decodeCommandEnvelope,
  encodeCommandEnvelope,
  encodeResultEnvelope,
  executeCommandEnvelope,
  executeCommandLine,
  validateCommandEnvelope,
} from './command-envelope.js';
export { LivePolicyPlan, ControlPlane } from './policy.js';
export {
  ErrorCode,
  AlfredLiveError,
  InvalidPathError,
  NotFoundError,
  ValidationError,
  AlreadyRegisteredError,
  InvalidCommandError,
  AuthorizationError,
  InvalidCodecError,
  InvalidAdaptiveError,
} from './errors.js';
