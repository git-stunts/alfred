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
export {
  ErrorCode,
  AlfredLiveError,
  InvalidPathError,
  NotFoundError,
  ValidationError,
  AlreadyRegisteredError,
  InvalidCommandError,
  InvalidCodecError,
  InvalidAdaptiveError,
} from './errors.js';
