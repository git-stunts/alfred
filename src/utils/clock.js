/**
 * System clock using real time.
 */
export class SystemClock {
  now() {
    return Date.now();
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Test clock for deterministic tests.
 * Allows manual control of time progression.
 */
export class TestClock {
  constructor() {
    this._time = 0;
    this._pendingTimers = [];
  }

  now() {
    return this._time;
  }

  /**
   * Creates a sleep promise that resolves when time is advanced.
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise(resolve => {
      this._pendingTimers.push({
        triggerAt: this._time + ms,
        resolve
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
