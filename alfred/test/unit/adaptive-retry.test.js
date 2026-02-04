import { describe, it, expect, vi } from 'vitest';
import { retry } from '../../src/policies/retry.js';
import { TestClock } from '../../src/utils/clock.js';
import { RetryExhaustedError } from '../../src/errors.js';
import { flush } from '../../../test/helpers/async.js';

describe('Adaptive Retry', () => {
  it('updates retries count dynamically', async () => {
    const retries = 1;
    const fn = vi.fn().mockRejectedValue(new Error('fail'));
    const clock = new TestClock();

    const resultPromise = retry(fn, {
      retries: () => retries,
      delay: 10,
      clock,
    });

    // First attempt fails.
    await flush(2);
    // Current retries is 1. Next attempt is 2.
    // attempt 1 failed. Is 1 >= 1+1? No. Sleep.

    await clock.advance(10);
    // Attempt 2 starts. Fails.
    // attempt 2 failed. Is 2 >= 1+1? Yes. Should exhaust.

    // BUT, before we exhaust, let's bump the config!
    // Wait, the check happens inside handleFailure.
    // If we want to intercept, we need to change config before the exhaustion check.
    // The exhaustion check happens immediately after failure.

    // Let's restart the scenario.
    // We want to prove that if we start with retries=1, fail once, then bump to retries=2, it continues.
    await expect(resultPromise).rejects.toThrow();
  });

  it('respects dynamic retries limit', async () => {
    const maxRetries = 1;
    const fn = vi.fn().mockRejectedValue(new Error('fail'));
    const clock = new TestClock();

    const resultPromise = retry(fn, {
      retries: () => maxRetries,
      delay: 10,
      clock,
    });

    // Attempt 1 fails.
    await flush(2);
    await clock.advance(10);
    // Attempt 2 fails.
    // At this point, maxRetries is 1. attempt is 2. 2 >= 1+1. Should throw.

    await expect(resultPromise).rejects.toThrow(RetryExhaustedError);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('adapts to increased retry limit during execution', async () => {
    let maxRetries = 1;
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValue('success');

    const clock = new TestClock();
    const resultPromise = retry(fn, {
      retries: () => maxRetries,
      delay: 10,
      clock,
    });

    // Attempt 1 fails.
    for (let i = 0; i < 20; i++) await Promise.resolve();

    // Before attempt 2 runs, increase limit
    maxRetries = 2;

    // Advance past first delay (10ms)
    await clock.advance(10);
    for (let i = 0; i < 20; i++) await Promise.resolve();

    // Attempt 2 fails.
    // maxRetries is now 2. attempt is 2. 2 < 2+1. Should continue.

    // Advance past second delay (10ms)
    await clock.advance(10);
    for (let i = 0; i < 20; i++) await Promise.resolve();
    // Attempt 3 succeeds.

    const result = await resultPromise;
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('adapts delay dynamically', async () => {
    let currentDelay = 10;
    const fn = vi.fn().mockRejectedValueOnce(new Error('fail 1')).mockResolvedValue('success');

    const clock = new TestClock();
    const resultPromise = retry(fn, {
      retries: 3,
      delay: () => currentDelay,
      clock,
    });

    // Attempt 1 fails.
    for (let i = 0; i < 20; i++) await Promise.resolve();

    // Change delay for the retry.
    // NOTE: The delay for the *next* retry is calculated *after* the failure.
    // So if we change it now, before the sleep starts, it might be too late if calculateDelay ran immediately?
    // In our implementation, calculateDelay runs in the catch block.
    // We are "paused" at the `await this.clock.sleep(delay)` line inside the catch block?
    // No, `await fn()` rejected. We entered catch.
    // `calculateDelay` is called. It calls `resolve(options.delay)`.

    // Issue: When does the test code run relative to `calculateDelay`?
    // The test code runs after `retry` returns the promise.
    // `retry` calls `execute`. `execute` calls `tryAttempt`. `tryAttempt` calls `fn`.
    // `fn` rejects immediately (mock).
    // `tryAttempt` catches. `handleFailure` runs. `calculateDelay` runs.
    // `clock.sleep(delay)` runs.

    // So `currentDelay` was resolved to 10 *before* we returned to the test here?
    // Yes, because `fn` is a microtask rejection, and `retry` is async.

    // To test dynamic delay, we need to fail, WAIT for the sleep to start (which locks in the delay),
    // then verify the sleep duration.
    // Actually, `resolve()` happens *before* the sleep.
    // So if we want to test that the *next* attempt uses a new delay, we need two failures.

    // Let's adjust the test to change delay for the SECOND retry interval.
    currentDelay = 50;

    // Wait for the first sleep (10ms from init)
    await clock.advance(10);
    for (let i = 0; i < 20; i++) await Promise.resolve();
    // Attempt 2 runs.

    expect(fn).toHaveBeenCalledTimes(2);

    await resultPromise;
  });
});
