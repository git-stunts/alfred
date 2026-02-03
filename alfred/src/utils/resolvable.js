/**
 * @fileoverview Utility for resolving static or dynamic configuration values.
 *
 * Enables live-tunable policy options by accepting either a value or a
 * function that returns a value. See "Resolution Timing" in README.
 *
 * @module @git-stunts/alfred/utils/resolvable
 */

/**
 * Resolves a value that might be dynamic.
 *
 * @template T
 * @param {T | (() => T)} value - The value or a function returning the value.
 * @returns {T} The resolved value.
 */
export function resolve(value) {
  return typeof value === 'function' ? value() : value;
}
