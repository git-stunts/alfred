/**
 * @fileoverview Tests for Resolvable option resolution timing.
 *
 * These tests verify WHEN dynamic options (functions) are resolved for each policy.
 * This ensures predictable behavior for live-tuning scenarios.
 *
 * Resolution timing:
 * - "per execute": resolved once at the start of execute()
 * - "per attempt": resolved each time an attempt is made (retry-specific)
 * - "per admission": resolved when a request is admitted/queued (bulkhead-specific)
 * - "per event": resolved when an event occurs (circuit breaker-specific)
 */

import { describe, it, expect, vi } from 'vitest';
import { retry } from '../../src/policies/retry.js';
import { bulkhead } from '../../src/policies/bulkhead.js';
import { circuitBreaker } from '../../src/policies/circuit-breaker.js';
import { hedge } from '../../src/policies/hedge.js';
import { timeout } from '../../src/policies/timeout.js';
import { TestClock } from '../../src/utils/clock.js';

describe('Resolution Timing', () => {
  describe('retry - resolves options per attempt', () => {
    it('resolves retries per attempt (allows dynamic limit changes)', async () => {
      let maxRetries = 1;
      const retriesFn = vi.fn(() => maxRetries);
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockResolvedValue('success');

      const clock = new TestClock();
      const resultPromise = retry(fn, {
        retries: retriesFn,
        delay: 10,
        clock,
      });

      // Attempt 1 fails
      for (let i = 0; i < 20; i++) await Promise.resolve();
      expect(retriesFn).toHaveBeenCalled();
      const callsAfterAttempt1 = retriesFn.mock.calls.length;

      // Increase limit before attempt 2
      maxRetries = 2;

      await clock.advance(10);
      for (let i = 0; i < 20; i++) await Promise.resolve();
      // Attempt 2 fails, but now maxRetries=2 allows one more

      expect(retriesFn.mock.calls.length).toBeGreaterThan(callsAfterAttempt1);

      await clock.advance(10);
      for (let i = 0; i < 20; i++) await Promise.resolve();
      // Attempt 3 succeeds

      const result = await resultPromise;
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('resolves delay per attempt (allows dynamic delay changes)', async () => {
      let currentDelay = 100;
      const delayFn = vi.fn(() => currentDelay);
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockResolvedValue('success');

      const clock = new TestClock();
      const delays = [];

      const resultPromise = retry(fn, {
        retries: 3,
        delay: delayFn,
        clock,
        onRetry: (err, attempt, delay) => delays.push(delay),
      });

      // Attempt 1 fails, delay resolved for first retry
      for (let i = 0; i < 20; i++) await Promise.resolve();

      // Change delay for next retry
      currentDelay = 200;

      await clock.advance(100);
      for (let i = 0; i < 20; i++) await Promise.resolve();
      // Attempt 2 fails, delay resolved again

      await clock.advance(200);
      for (let i = 0; i < 20; i++) await Promise.resolve();

      await resultPromise;

      expect(delays[0]).toBe(100);
      expect(delays[1]).toBe(200);
      expect(delayFn.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it('resolves backoff strategy per attempt', async () => {
      let strategy = 'constant';
      const backoffFn = vi.fn(() => strategy);
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockResolvedValue('success');

      const clock = new TestClock();
      const delays = [];

      const resultPromise = retry(fn, {
        retries: 3,
        delay: 100,
        backoff: backoffFn,
        clock,
        onRetry: (err, attempt, delay) => delays.push(delay),
      });

      for (let i = 0; i < 20; i++) await Promise.resolve();

      // Switch to exponential before second delay calculation
      strategy = 'exponential';

      await clock.advance(100);
      for (let i = 0; i < 20; i++) await Promise.resolve();

      await clock.advance(200);
      for (let i = 0; i < 20; i++) await Promise.resolve();

      await resultPromise;

      expect(delays[0]).toBe(100); // constant
      expect(delays[1]).toBe(200); // exponential: 100 * 2^1
    });
  });

  describe('bulkhead - resolves options per admission', () => {
    it('resolves limit per admission attempt', async () => {
      let limit = 2;
      const limitFn = vi.fn(() => limit);

      const bh = bulkhead({ limit: limitFn, queueLimit: 0 });

      // Start two operations
      const op1 = bh.execute(() => new Promise((r) => setTimeout(r, 100)));
      const op2 = bh.execute(() => new Promise((r) => setTimeout(r, 100)));

      expect(limitFn).toHaveBeenCalled();
      const callsAfterFirstTwo = limitFn.mock.calls.length;

      // Third should check limit again
      const op3Promise = bh.execute(() => Promise.resolve('op3'));

      expect(limitFn.mock.calls.length).toBeGreaterThan(callsAfterFirstTwo);

      // Clean up
      await Promise.allSettled([op1, op2, op3Promise]);
    });

    it('resolves queueLimit per admission attempt', async () => {
      let queueLimit = 1;
      const queueLimitFn = vi.fn(() => queueLimit);

      const bh = bulkhead({ limit: 1, queueLimit: queueLimitFn });

      // Fill the slot
      const blocker = bh.execute(
        () => new Promise((resolve) => setTimeout(() => resolve('blocker'), 50))
      );
      for (let i = 0; i < 10; i++) await Promise.resolve();

      // This should queue (queueLimit=1)
      const queued = bh.execute(() => Promise.resolve('queued'));

      expect(queueLimitFn).toHaveBeenCalled();

      await Promise.all([blocker, queued]);
    });
  });

  describe('circuit breaker - resolves options per event', () => {
    it('resolves threshold per failure event', async () => {
      let threshold = 3;
      const thresholdFn = vi.fn(() => threshold);

      const cb = circuitBreaker({
        threshold: thresholdFn,
        duration: 1000,
      });

      // Record failures
      for (let i = 0; i < 2; i++) {
        try {
          await cb.execute(() => Promise.reject(new Error('fail')));
        } catch {
          // expected
        }
      }

      expect(thresholdFn.mock.calls.length).toBeGreaterThanOrEqual(2);

      // Lower threshold - next failure should trip
      threshold = 2;

      // Circuit should still be closed (2 failures, threshold was 3)
      expect(cb.state).toBe('CLOSED');

      // This failure should trip it (threshold now 2, we have 2 failures, next makes 3)
      // Actually the check is failureCount >= threshold, so with 2 failures and threshold=2, it trips
      try {
        await cb.execute(() => Promise.reject(new Error('fail 3')));
      } catch {
        // expected
      }

      expect(cb.state).toBe('OPEN');
    });

    it('resolves duration per reset check', async () => {
      let duration = 100;
      const durationFn = vi.fn(() => duration);
      const clock = new TestClock();

      const cb = circuitBreaker({
        threshold: 1,
        duration: durationFn,
        clock,
      });

      // Trip the circuit
      try {
        await cb.execute(() => Promise.reject(new Error('fail')));
      } catch {
        // expected
      }

      expect(cb.state).toBe('OPEN');

      // Advance less than duration
      // The duration is resolved when checking shouldAttemptReset
      try {
        await cb.execute(() => Promise.resolve('test'));
      } catch {
        // expected - circuit open
      }

      expect(durationFn).toHaveBeenCalled();
    });
  });

  describe('hedge - resolves options once per execute', () => {
    it('resolves delay once at start of execute', async () => {
      let delay = 50;
      const delayFn = vi.fn(() => delay);
      const clock = new TestClock();

      const h = hedge({ delay: delayFn, maxHedges: 2, clock });

      const executePromise = h.execute((signal) => {
        return clock.sleep(200).then(() => 'result');
      });

      // delay should be resolved immediately at execute start
      expect(delayFn).toHaveBeenCalledTimes(1);

      // Change delay - should NOT affect this execution
      delay = 500;

      // Advance past first hedge delay
      await clock.advance(50);
      for (let i = 0; i < 10; i++) await Promise.resolve();

      // delay should still only have been called once
      expect(delayFn).toHaveBeenCalledTimes(1);

      // Complete the operation
      await clock.advance(150);
      for (let i = 0; i < 10; i++) await Promise.resolve();

      await executePromise;
    });

    it('resolves maxHedges once at start of execute', async () => {
      let maxHedges = 2;
      const maxHedgesFn = vi.fn(() => maxHedges);
      const clock = new TestClock();

      const h = hedge({ delay: 50, maxHedges: maxHedgesFn, clock });

      const executePromise = h.execute((signal) => {
        return clock.sleep(200).then(() => 'result');
      });

      expect(maxHedgesFn).toHaveBeenCalledTimes(1);

      // Change maxHedges - should NOT affect this execution
      maxHedges = 0;

      await clock.advance(200);
      for (let i = 0; i < 10; i++) await Promise.resolve();

      await executePromise;

      // Still only called once
      expect(maxHedgesFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('timeout - resolves ms once per execute', () => {
    it('resolves timeout ms once at start of execute', async () => {
      let ms = 100;
      const msFn = vi.fn(() => ms);
      const clock = new TestClock();

      const executePromise = timeout(msFn, () => clock.sleep(50).then(() => 'result'), { clock });

      expect(msFn).toHaveBeenCalledTimes(1);

      // Change ms - should NOT affect this execution
      ms = 10;

      await clock.advance(50);
      for (let i = 0; i < 10; i++) await Promise.resolve();

      const result = await executePromise;
      expect(result).toBe('result');
      expect(msFn).toHaveBeenCalledTimes(1);
    });
  });
});
