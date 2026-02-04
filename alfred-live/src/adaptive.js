/**
 * Live value wrapper with versioning and update timestamps.
 *
 * @template T
 * @example
 * const retries = new Adaptive(3);
 * retries.set(5);
 * retries.update((current) => current + 1);
 */
export class Adaptive {
  #value;
  #version;
  #updatedAt;

  /**
   * @param {T} initialValue - Initial value.
   */
  constructor(initialValue) {
    this.#value = initialValue;
    this.#version = 1;
    this.#updatedAt = Date.now();
  }

  /**
   * @returns {T} Current value.
   */
  get() {
    return this.#value;
  }

  /**
   * @param {T} nextValue - New value.
   */
  set(nextValue) {
    this.#value = nextValue;
    this.#version += 1;
    this.#updatedAt = Date.now();
  }

  /**
   * Update the value using a functional updater.
   * @param {(current: T) => T} updater - Function that returns the next value.
   */
  update(updater) {
    this.set(updater(this.#value));
  }

  /**
   * Monotonic version number, incremented on each update.
   */
  get version() {
    return this.#version;
  }

  /**
   * Unix epoch timestamp in milliseconds of the last update.
   */
  get updatedAt() {
    return this.#updatedAt;
  }
}
