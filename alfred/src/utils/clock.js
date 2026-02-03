/**
 * @fileoverview Clock abstractions for time-based operations.
 *
 * Provides SystemClock for production use and TestClock for deterministic testing.
 * All time-based policies accept a clock option for testability.
 *
 * @module @git-stunts/alfred/utils/clock
 */

/**
 * System clock using real time.
 * Uses runtime-aware timer management (unref) to allow clean process exits.
 */
export class SystemClock {
  /**
   * Returns the current time in milliseconds since Unix epoch.
   * @returns {number}
   */
  now() {
    return Date.now();
  }

  /**
   * Sleeps for the specified duration.
   * Timer is unref'd to prevent blocking process exit.
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   */
  async sleep(ms) {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      if (typeof timer === 'object' && typeof timer.unref === 'function') {
        timer.unref();
      } else if (typeof Deno !== 'undefined' && typeof Deno.unrefTimer === 'function') {
        // Deno returns a number ID
        Deno.unrefTimer(timer);
      }
    });
  }
}

/**
 * Test clock for deterministic tests.
 * Allows manual control of time progression without real delays.
 */
export class TestClock {
  constructor() {
    /** @type {number} */
    this._time = 0;
    /** @type {Array<{triggerAt: number, resolve: () => void}>} */
    this._pendingTimers = [];
  }

  /**
   * Returns the current virtual time in milliseconds.
   * @returns {number}
   */
  now() {
    return this._time;
  }

  /**
   * Creates a sleep promise that resolves when time is advanced.
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise((resolve) => {
      this._pendingTimers.push({
        triggerAt: this._time + ms,
        resolve,
      });
      // Sort by trigger time
      this._pendingTimers.sort((a, b) => a.triggerAt - b.triggerAt);
    });
  }

  /**
   * Advances time and resolves any pending timers.
   * @param {number} ms - Milliseconds to advance
   * @returns {Promise<void>}
   */
  async advance(ms) {
    const targetTime = this._time + ms;

    while (this._pendingTimers.length > 0) {
      const next = this._pendingTimers[0];
      if (next.triggerAt > targetTime) {
        break;
      }

      this._time = next.triggerAt;
      this._pendingTimers.shift();
      next.resolve();

      // Yield to allow async code to run
      await Promise.resolve();
    }

    this._time = targetTime;
  }

  /**
   * Process any timers ready at current time.
   * @param {number} [ms=0] - Optional additional time to add
   * @returns {Promise<void>}
   */
  async tick(ms = 0) {
    await this.advance(ms);
  }

  /**
   * Sets absolute time.
   * @param {number} time - Time in milliseconds
   */
  setTime(time) {
    this._time = time;
  }

  /**
   * Returns number of pending timers.
   * @returns {number}
   */
  get pendingCount() {
    return this._pendingTimers.length;
  }

  /**
   * Clears all pending timers.
   */
  reset() {
    this._time = 0;
    this._pendingTimers = [];
  }
}
