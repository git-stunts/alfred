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
