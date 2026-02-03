import { describe, it, expect, vi } from 'vitest';
import { retry } from '../../src/policies/retry.js';
import { TestClock } from '../../src/utils/clock.js';
import { RetryExhaustedError } from '../../src/errors.js';

describe('retry', () => {
  describe('basic retry behavior', () => {
    it('succeeds on first attempt without retry', async () => {
      const fn = vi.fn().mockResolvedValue('success');

      const result = await retry(fn, { retries: 3 });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('succeeds after failures', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockResolvedValue('success');

      const clock = new TestClock();
      const resultPromise = retry(fn, { retries: 3, delay: 100, clock });

      // Yield to let the retry loop register sleep timers
      for (let i = 0; i < 20; i++) await Promise.resolve();
      // Advance time for first retry
      await clock.advance(100);
      for (let i = 0; i < 20; i++) await Promise.resolve();
      // Advance time for second retry
      await clock.advance(100);
      for (let i = 0; i < 20; i++) await Promise.resolve();

      const result = await resultPromise;

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('exhausts retries and throws RetryExhaustedError', async () => {
      const error = new Error('persistent failure');
      const fn = vi.fn().mockRejectedValue(error);

      const clock = new TestClock();
      const resultPromise = retry(fn, { retries: 2, delay: 100, clock });

      // Yield to let the retry loop register sleep timers
      for (let i = 0; i < 20; i++) await Promise.resolve();
      // Advance time for both retries
      await clock.advance(100);
      for (let i = 0; i < 20; i++) await Promise.resolve();
      await clock.advance(100);
      for (let i = 0; i < 20; i++) await Promise.resolve();

      await expect(resultPromise).rejects.toThrow(RetryExhaustedError);
    });

    it('RetryExhaustedError contains correct metadata', async () => {
      const error = new Error('persistent failure');
      const fn = vi.fn().mockRejectedValue(error);

      const clock = new TestClock();
      const resultPromise = retry(fn, { retries: 2, delay: 100, clock });

      for (let i = 0; i < 20; i++) await Promise.resolve();
      await clock.advance(100);
      for (let i = 0; i < 20; i++) await Promise.resolve();
      await clock.advance(100);
      for (let i = 0; i < 20; i++) await Promise.resolve();

      try {
        await resultPromise;
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(RetryExhaustedError);
        expect(e.attempts).toBe(3); // 1 initial + 2 retries
        expect(e.cause).toBe(error);
        expect(e.message).toContain('persistent failure');
      }
    });
  });

  describe('abort behavior', () => {
    it('passes AbortSignal to the operation', async () => {
      const controller = new AbortController();
      const fn = vi.fn(async (signal) => {
        expect(signal).toBe(controller.signal);
        return 'ok';
      });

      const result = await retry(fn, { signal: controller.signal });

      expect(result).toBe('ok');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('aborts during backoff sleep', async () => {
      const controller = new AbortController();
      const fn = vi.fn().mockRejectedValue(new Error('fail'));
      const clock = new TestClock();

      const resultPromise = retry(fn, {
        retries: 3,
        delay: 100,
        clock,
        signal: controller.signal,
      });

      for (let i = 0; i < 20; i++) await Promise.resolve();
      expect(fn).toHaveBeenCalledTimes(1);

      controller.abort();
      await expect(resultPromise).rejects.toMatchObject({ name: 'AbortError' });
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('aborts before first attempt', async () => {
      const controller = new AbortController();
      controller.abort();
      const fn = vi.fn().mockResolvedValue('ok');

      await expect(retry(fn, { signal: controller.signal })).rejects.toMatchObject({
        name: 'AbortError',
      });
      expect(fn).not.toHaveBeenCalled();
    });
  });

  describe('exponential backoff timing', () => {
    it('applies exponential backoff delays', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockRejectedValueOnce(new Error('fail'))
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('success');

      const clock = new TestClock();
      const delays = [];

      const resultPromise = retry(fn, {
        retries: 3,
        delay: 100,
        backoff: 'exponential',
        clock,
        onRetry: (error, attempt, delay) => {
          delays.push(delay);
        },
      });

      // Yield to let retry loop run first attempt
      for (let i = 0; i < 20; i++) await Promise.resolve();
      // First retry: 100 * 2^0 = 100ms
      await clock.advance(100);
      for (let i = 0; i < 20; i++) await Promise.resolve();
      // Second retry: 100 * 2^1 = 200ms
      await clock.advance(200);
      for (let i = 0; i < 20; i++) await Promise.resolve();
      // Third retry: 100 * 2^2 = 400ms
      await clock.advance(400);
      for (let i = 0; i < 20; i++) await Promise.resolve();

      const result = await resultPromise;

      expect(result).toBe('success');
      expect(delays).toEqual([100, 200, 400]);
    });

    it('respects maxDelay cap with exponential backoff', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('success');

      const clock = new TestClock();
      const delays = [];

      const resultPromise = retry(fn, {
        retries: 2,
        delay: 500,
        maxDelay: 600,
        backoff: 'exponential',
        clock,
        onRetry: (error, attempt, delay) => {
          delays.push(delay);
        },
      });

      for (let i = 0; i < 20; i++) await Promise.resolve();
      // First retry: 500 * 2^0 = 500ms (under cap)
      await clock.advance(500);
      for (let i = 0; i < 20; i++) await Promise.resolve();
      // Second retry: 500 * 2^1 = 1000ms, capped to 600ms
      await clock.advance(600);
      for (let i = 0; i < 20; i++) await Promise.resolve();

      const result = await resultPromise;

      expect(result).toBe('success');
      expect(delays[0]).toBe(500);
      expect(delays[1]).toBe(600); // Capped at maxDelay
    });
  });

  describe('linear backoff timing', () => {
    it('applies linear backoff delays', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockRejectedValueOnce(new Error('fail'))
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('success');

      const clock = new TestClock();
      const delays = [];

      const resultPromise = retry(fn, {
        retries: 3,
        delay: 100,
        backoff: 'linear',
        clock,
        onRetry: (error, attempt, delay) => {
          delays.push(delay);
        },
      });

      for (let i = 0; i < 20; i++) await Promise.resolve();
      // First retry: 100 * 1 = 100ms
      await clock.advance(100);
      for (let i = 0; i < 20; i++) await Promise.resolve();
      // Second retry: 100 * 2 = 200ms
      await clock.advance(200);
      for (let i = 0; i < 20; i++) await Promise.resolve();
      // Third retry: 100 * 3 = 300ms
      await clock.advance(300);
      for (let i = 0; i < 20; i++) await Promise.resolve();

      const result = await resultPromise;

      expect(result).toBe('success');
      expect(delays).toEqual([100, 200, 300]);
    });
  });

  describe('constant backoff', () => {
    it('applies constant delays', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('success');

      const clock = new TestClock();
      const delays = [];

      const resultPromise = retry(fn, {
        retries: 2,
        delay: 100,
        backoff: 'constant',
        clock,
        onRetry: (error, attempt, delay) => {
          delays.push(delay);
        },
      });

      for (let i = 0; i < 20; i++) await Promise.resolve();
      await clock.advance(100);
      for (let i = 0; i < 20; i++) await Promise.resolve();
      await clock.advance(100);
      for (let i = 0; i < 20; i++) await Promise.resolve();

      const result = await resultPromise;

      expect(result).toBe('success');
      expect(delays).toEqual([100, 100]);
    });
  });

  describe('jitter strategies', () => {
    describe('full jitter', () => {
      it('delays are within expected range [0, baseDelay]', async () => {
        const fn = vi
          .fn()
          .mockRejectedValueOnce(new Error('fail'))
          .mockRejectedValueOnce(new Error('fail'))
          .mockRejectedValueOnce(new Error('fail'))
          .mockRejectedValueOnce(new Error('fail'))
          .mockRejectedValueOnce(new Error('fail'))
          .mockResolvedValue('success');

        const clock = new TestClock();
        const delays = [];

        const resultPromise = retry(fn, {
          retries: 5,
          delay: 1000,
          backoff: 'constant',
          jitter: 'full',
          clock,
          onRetry: (error, attempt, delay) => {
            delays.push(delay);
          },
        });

        for (let i = 0; i < 20; i++) await Promise.resolve();
        // Advance time enough for all retries
        for (let i = 0; i < 5; i++) {
          await clock.advance(1000);
          for (let i = 0; i < 20; i++) await Promise.resolve();
        }

        await resultPromise;

        // Full jitter: delay is random between 0 and baseDelay
        for (const delay of delays) {
          expect(delay).toBeGreaterThanOrEqual(0);
          expect(delay).toBeLessThanOrEqual(1000);
        }
      });
    });

    describe('equal jitter', () => {
      it('delays are within expected range [baseDelay/2, baseDelay]', async () => {
        const fn = vi
          .fn()
          .mockRejectedValueOnce(new Error('fail'))
          .mockRejectedValueOnce(new Error('fail'))
          .mockRejectedValueOnce(new Error('fail'))
          .mockRejectedValueOnce(new Error('fail'))
          .mockRejectedValueOnce(new Error('fail'))
          .mockResolvedValue('success');

        const clock = new TestClock();
        const delays = [];

        const resultPromise = retry(fn, {
          retries: 5,
          delay: 1000,
          backoff: 'constant',
          jitter: 'equal',
          clock,
          onRetry: (error, attempt, delay) => {
            delays.push(delay);
          },
        });

        for (let i = 0; i < 20; i++) await Promise.resolve();
        // Advance time enough for all retries
        for (let i = 0; i < 5; i++) {
          await clock.advance(1000);
          for (let i = 0; i < 20; i++) await Promise.resolve();
        }

        await resultPromise;

        // Equal jitter: delay is random between baseDelay/2 and baseDelay
        for (const delay of delays) {
          expect(delay).toBeGreaterThanOrEqual(500);
          expect(delay).toBeLessThanOrEqual(1000);
        }
      });
    });

    describe('decorrelated jitter', () => {
      it('delays are within expected range [baseDelay, min(3*prevDelay, maxDelay)]', async () => {
        const fn = vi
          .fn()
          .mockRejectedValueOnce(new Error('fail'))
          .mockRejectedValueOnce(new Error('fail'))
          .mockRejectedValueOnce(new Error('fail'))
          .mockRejectedValueOnce(new Error('fail'))
          .mockRejectedValueOnce(new Error('fail'))
          .mockResolvedValue('success');

        const clock = new TestClock();
        const delays = [];

        const resultPromise = retry(fn, {
          retries: 5,
          delay: 100,
          maxDelay: 5000,
          backoff: 'constant', // Decorrelated jitter computes its own progression
          jitter: 'decorrelated',
          clock,
          onRetry: (error, attempt, delay) => {
            delays.push(delay);
          },
        });

        for (let i = 0; i < 20; i++) await Promise.resolve();
        // Advance time enough for all retries
        for (let i = 0; i < 5; i++) {
          await clock.advance(5000);
          for (let i = 0; i < 20; i++) await Promise.resolve();
        }

        await resultPromise;

        // Decorrelated jitter: delay is between baseDelay and min(3*prevDelay, maxDelay)
        // Each delay should be at least baseDelay
        for (const delay of delays) {
          expect(delay).toBeGreaterThanOrEqual(100);
          expect(delay).toBeLessThanOrEqual(5000);
        }

        // Verify delays form a random walk (values can increase or stay bounded)
        expect(delays.length).toBe(5);
      });
    });
  });

  describe('shouldRetry predicate', () => {
    it('retries when predicate returns true', async () => {
      const retryableError = new Error('retryable');
      retryableError.code = 'ECONNREFUSED';

      const fn = vi.fn().mockRejectedValueOnce(retryableError).mockResolvedValue('success');

      const clock = new TestClock();
      const resultPromise = retry(fn, {
        retries: 2,
        delay: 100,
        clock,
        shouldRetry: (error) => error.code === 'ECONNREFUSED',
      });

      for (let i = 0; i < 20; i++) await Promise.resolve();
      await clock.advance(100);
      for (let i = 0; i < 20; i++) await Promise.resolve();

      const result = await resultPromise;

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('throws immediately when predicate returns false', async () => {
      const nonRetryableError = new Error('not retryable');
      nonRetryableError.code = 'INVALID_INPUT';

      const fn = vi.fn().mockRejectedValue(nonRetryableError);

      await expect(
        retry(fn, {
          retries: 3,
          shouldRetry: (error) => error.code === 'ECONNREFUSED',
        })
      ).rejects.toThrow('not retryable');

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('does not wrap non-retryable error in RetryExhaustedError', async () => {
      const nonRetryableError = new Error('not retryable');

      const fn = vi.fn().mockRejectedValue(nonRetryableError);

      try {
        await retry(fn, {
          retries: 3,
          shouldRetry: () => false,
        });
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBe(nonRetryableError);
        expect(e).not.toBeInstanceOf(RetryExhaustedError);
      }
    });
  });

  describe('onRetry callback', () => {
    it('is called with attempt, error, and delay', async () => {
      const error1 = new Error('fail 1');
      const error2 = new Error('fail 2');
      const fn = vi
        .fn()
        .mockRejectedValueOnce(error1)
        .mockRejectedValueOnce(error2)
        .mockResolvedValue('success');

      const clock = new TestClock();
      const onRetry = vi.fn();

      const resultPromise = retry(fn, {
        retries: 2,
        delay: 100,
        backoff: 'constant',
        clock,
        onRetry,
      });

      for (let i = 0; i < 20; i++) await Promise.resolve();
      await clock.advance(100);
      for (let i = 0; i < 20; i++) await Promise.resolve();
      await clock.advance(100);
      for (let i = 0; i < 20; i++) await Promise.resolve();

      await resultPromise;

      expect(onRetry).toHaveBeenCalledTimes(2);
      expect(onRetry).toHaveBeenNthCalledWith(1, error1, 1, 100);
      expect(onRetry).toHaveBeenNthCalledWith(2, error2, 2, 100);
    });

    it('is not called when operation succeeds on first attempt', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const onRetry = vi.fn();

      await retry(fn, { retries: 3, onRetry });

      expect(onRetry).not.toHaveBeenCalled();
    });

    it('is not called when shouldRetry returns false', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('fail'));
      const onRetry = vi.fn();

      try {
        await retry(fn, {
          retries: 3,
          onRetry,
          shouldRetry: () => false,
        });
      } catch {
        // Expected
      }

      expect(onRetry).not.toHaveBeenCalled();
    });
  });
});
