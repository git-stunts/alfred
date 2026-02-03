export class Adaptive {
  #value;
  #version;
  #updatedAt;

  constructor(initialValue) {
    this.#value = initialValue;
    this.#version = 1;
    this.#updatedAt = Date.now();
  }

  get() {
    return this.#value;
  }

  set(nextValue) {
    this.#value = nextValue;
    this.#version += 1;
    this.#updatedAt = Date.now();
  }

  update(updater) {
    this.set(updater(this.#value));
  }

  get version() {
    return this.#version;
  }

  get updatedAt() {
    return this.#updatedAt;
  }
}
