import { describe, it, expect, vi } from 'vitest';
import { timeout } from '../../src/policies/timeout.js';
import { TimeoutError } from '../../src/errors.js';

describe('timeout', () => {
  describe('successful completion', () => {
    it('returns result if operation completes in time', async () => {
      const fn = vi.fn().mockResolvedValue('success');

      const result = await timeout(1000, fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('returns result from sync-looking but async function', async () => {
      const result = await timeout(1000, async () => {
        await Promise.resolve();
        return 'async result';
      });

      expect(result).toBe('async result');
    });

    it('handles immediate resolution', async () => {
      const result = await timeout(100, () => Promise.resolve(42));

      expect(result).toBe(42);
    });
  });

  describe('timeout behavior', () => {
    it('throws TimeoutError if operation exceeds limit', async () => {
      const fn = vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve('too late'), 200);
          })
      );

      await expect(timeout(50, fn)).rejects.toThrow(TimeoutError);
    });

    it('TimeoutError includes timeout and elapsed values', async () => {
      const fn = vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve('too late'), 200);
          })
      );

      try {
        await timeout(50, fn);
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(TimeoutError);
        expect(e.timeout).toBe(50);
        expect(e.elapsed).toBeGreaterThanOrEqual(50);
        expect(e.message).toContain('50ms');
      }
    });

    it('does not call function again after timeout', async () => {
      let callCount = 0;
      const fn = () =>
        new Promise((resolve) => {
          callCount++;
          setTimeout(() => resolve('done'), 200);
        });

      try {
        await timeout(50, fn);
      } catch {
        // Expected timeout
      }

      // Wait a bit to ensure no additional calls
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(callCount).toBe(1);
    });
  });

  describe('AbortSignal support', () => {
    it('passes AbortSignal to operation if it accepts it', async () => {
      let receivedSignal = null;

      const fn = (signal) => {
        receivedSignal = signal;
        return Promise.resolve('success');
      };

      await timeout(1000, fn);

      expect(receivedSignal).toBeInstanceOf(AbortSignal);
      expect(receivedSignal.aborted).toBe(false);
    });

    it('aborts signal when timeout occurs', async () => {
      let receivedSignal = null;

      const fn = (signal) => {
        receivedSignal = signal;
        return new Promise((resolve) => {
          setTimeout(() => resolve('too late'), 200);
        });
      };

      try {
        await timeout(50, fn);
      } catch {
        // Expected timeout
      }

      // Signal should be aborted
      expect(receivedSignal.aborted).toBe(true);
    });

    it('does not pass signal to zero-argument function', async () => {
      const fn = vi.fn().mockResolvedValue('success');

      await timeout(1000, fn);

      // fn should have been called with no arguments
      expect(fn).toHaveBeenCalledWith();
    });

    it('can be used with fetch-like operations', async () => {
      // Simulate a fetch-like operation that respects AbortSignal
      const mockFetch = (signal) => {
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => resolve({ data: 'response' }), 100);

          signal.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(new DOMException('Aborted', 'AbortError'));
          });
        });
      };

      // Should complete in time
      const result = await timeout(500, mockFetch);
      expect(result).toEqual({ data: 'response' });

      // Should timeout and abort
      await expect(timeout(50, mockFetch)).rejects.toThrow();
    });
  });

  describe('onTimeout callback', () => {
    it('is called when timeout occurs', async () => {
      const onTimeout = vi.fn();

      const fn = () =>
        new Promise((resolve) => {
          setTimeout(() => resolve('too late'), 200);
        });

      try {
        await timeout(50, fn, { onTimeout });
      } catch {
        // Expected timeout
      }

      expect(onTimeout).toHaveBeenCalledTimes(1);
    });

    it('receives elapsed time as argument', async () => {
      const onTimeout = vi.fn();

      const fn = () =>
        new Promise((resolve) => {
          setTimeout(() => resolve('too late'), 200);
        });

      try {
        await timeout(50, fn, { onTimeout });
      } catch {
        // Expected timeout
      }

      expect(onTimeout).toHaveBeenCalledWith(expect.any(Number));
      const elapsed = onTimeout.mock.calls[0][0];
      expect(elapsed).toBeGreaterThanOrEqual(50);
    });

    it('is not called when operation completes in time', async () => {
      const onTimeout = vi.fn();

      const fn = () => Promise.resolve('quick');

      await timeout(1000, fn, { onTimeout });

      expect(onTimeout).not.toHaveBeenCalled();
    });

    it('is called before TimeoutError is thrown', async () => {
      const callOrder = [];

      const fn = () =>
        new Promise((resolve) => {
          setTimeout(() => resolve('too late'), 200);
        });

      try {
        await timeout(50, fn, {
          onTimeout: () => callOrder.push('onTimeout'),
        });
      } catch {
        callOrder.push('catch');
      }

      expect(callOrder).toEqual(['onTimeout', 'catch']);
    });
  });

  describe('edge cases', () => {
    it('handles zero timeout', async () => {
      const fn = () =>
        new Promise((resolve) => {
          setTimeout(() => resolve('result'), 10);
        });

      await expect(timeout(0, fn)).rejects.toThrow(TimeoutError);
    });

    it('handles operation that throws synchronously', async () => {
      const fn = () => {
        throw new Error('sync error');
      };

      await expect(timeout(1000, fn)).rejects.toThrow('sync error');
    });

    it('handles operation that rejects', async () => {
      const fn = () => Promise.reject(new Error('async error'));

      await expect(timeout(1000, fn)).rejects.toThrow('async error');
    });

    it('clears timeout after successful completion', async () => {
      // This test verifies that the internal setTimeout is cleared
      // by checking that we don't get spurious timeout errors
      const results = [];

      for (let i = 0; i < 5; i++) {
        const result = await timeout(100, () => Promise.resolve(i));
        results.push(result);
      }

      expect(results).toEqual([0, 1, 2, 3, 4]);
    });

    it('preserves original error type on failure before timeout', async () => {
      class CustomError extends Error {
        constructor() {
          super('custom');
          this.name = 'CustomError';
        }
      }

      const fn = () => Promise.reject(new CustomError());

      try {
        await timeout(1000, fn);
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(CustomError);
      }
    });
  });
});
