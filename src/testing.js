/**
 * Testing utilities for deterministic resilience policy tests.
 *
 * Provides TestClock for controlling time progression without real delays,
 * enabling fast and reliable tests for retry, timeout, and hedge policies.
 *
 * @example
 * ```ts
 * import { TestClock } from "@git-stunts/alfred/testing";
 * import { retry } from "@git-stunts/alfred";
 *
 * const clock = new TestClock();
 * const promise = retry(() => mightFail(), { retries: 3, delay: 1000, clock });
 *
 * await clock.advance(1000); // Triggers first retry instantly
 * await clock.advance(1000); // Triggers second retry
 * ```
 *
 * @module
 */

// @ts-self-types="./testing.d.ts"

export { TestClock } from './utils/clock.js';
