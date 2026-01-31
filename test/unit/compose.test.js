import { describe, it, expect, vi } from 'vitest';
import { compose, fallback, race } from '../../src/compose.js';

describe('compose', () => {
  describe('compose()', () => {
    it('returns pass-through policy when given no policies', async () => {
      const composed = compose();
      const fn = vi.fn().mockResolvedValue('result');

      const result = await composed.execute(fn);

      expect(result).toBe('result');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('executes single policy', async () => {
      const policy = {
        execute: vi.fn((fn) => fn())
      };
      const composed = compose(policy);
      const fn = vi.fn().mockResolvedValue('result');

      const result = await composed.execute(fn);

      expect(result).toBe('result');
      expect(policy.execute).toHaveBeenCalledTimes(1);
    });

    it('chains policies correctly (outer to inner)', async () => {
      const callOrder = [];

      const outerPolicy = {
        execute: async (fn) => {
          callOrder.push('outer-start');
          const result = await fn();
          callOrder.push('outer-end');
          return result;
        }
      };

      const innerPolicy = {
        execute: async (fn) => {
          callOrder.push('inner-start');
          const result = await fn();
          callOrder.push('inner-end');
          return result;
        }
      };

      const composed = compose(outerPolicy, innerPolicy);
      const fn = vi.fn(async () => {
        callOrder.push('fn');
        return 'result';
      });

      const result = await composed.execute(fn);

      expect(result).toBe('result');
      expect(callOrder).toEqual([
        'outer-start',
        'inner-start',
        'fn',
        'inner-end',
        'outer-end'
      ]);
    });

    it('chains three policies in correct order', async () => {
      const callOrder = [];

      const makePolicy = (name) => ({
        execute: async (fn) => {
          callOrder.push(`${name}-start`);
          const result = await fn();
          callOrder.push(`${name}-end`);
          return result;
        }
      });

      const composed = compose(
        makePolicy('first'),
        makePolicy('second'),
        makePolicy('third')
      );

      await composed.execute(async () => {
        callOrder.push('fn');
        return 'result';
      });

      expect(callOrder).toEqual([
        'first-start',
        'second-start',
        'third-start',
        'fn',
        'third-end',
        'second-end',
        'first-end'
      ]);
    });

    it('propagates errors through the chain', async () => {
      const outerPolicy = {
        execute: (fn) => fn()
      };

      const innerPolicy = {
        execute: (fn) => fn()
      };

      const composed = compose(outerPolicy, innerPolicy);
      const error = new Error('test error');
      const fn = vi.fn().mockRejectedValue(error);

      await expect(composed.execute(fn)).rejects.toThrow('test error');
    });

    it('allows outer policy to catch and handle inner errors', async () => {
      const outerPolicy = {
        execute: async (fn) => {
          try {
            return await fn();
          } catch {
            return 'fallback';
          }
        }
      };

      const innerPolicy = {
        execute: (fn) => fn()
      };

      const composed = compose(outerPolicy, innerPolicy);
      const fn = vi.fn().mockRejectedValue(new Error('fail'));

      const result = await composed.execute(fn);

      expect(result).toBe('fallback');
    });

    it('allows inner policy to transform result', async () => {
      const outerPolicy = {
        execute: (fn) => fn()
      };

      const innerPolicy = {
        execute: async (fn) => {
          const result = await fn();
          return result.toUpperCase();
        }
      };

      const composed = compose(outerPolicy, innerPolicy);
      const fn = vi.fn().mockResolvedValue('hello');

      const result = await composed.execute(fn);

      expect(result).toBe('HELLO');
    });
  });

  describe('fallback()', () => {
    it('returns primary result when primary succeeds', async () => {
      const primary = {
        execute: vi.fn((fn) => fn())
      };
      const secondary = {
        execute: vi.fn((fn) => fn())
      };

      const policy = fallback(primary, secondary);
      const fn = vi.fn().mockResolvedValue('primary-result');

      const result = await policy.execute(fn);

      expect(result).toBe('primary-result');
      expect(primary.execute).toHaveBeenCalledTimes(1);
      expect(secondary.execute).not.toHaveBeenCalled();
    });

    it('tries secondary on primary failure', async () => {
      const primary = {
        execute: vi.fn().mockRejectedValue(new Error('primary failed'))
      };
      const secondary = {
        execute: vi.fn((fn) => fn())
      };

      const policy = fallback(primary, secondary);
      const fn = vi.fn().mockResolvedValue('secondary-result');

      const result = await policy.execute(fn);

      expect(result).toBe('secondary-result');
      expect(primary.execute).toHaveBeenCalledTimes(1);
      expect(secondary.execute).toHaveBeenCalledTimes(1);
    });

    it('throws secondary error if both fail', async () => {
      const primary = {
        execute: vi.fn().mockRejectedValue(new Error('primary failed'))
      };
      const secondary = {
        execute: vi.fn().mockRejectedValue(new Error('secondary failed'))
      };

      const policy = fallback(primary, secondary);
      const fn = vi.fn();

      await expect(policy.execute(fn)).rejects.toThrow('secondary failed');
    });

    it('passes the same function to both policies', async () => {
      const capturedFns = [];

      const primary = {
        execute: (fn) => {
          capturedFns.push(fn);
          return Promise.reject(new Error('fail'));
        }
      };
      const secondary = {
        execute: (fn) => {
          capturedFns.push(fn);
          return fn();
        }
      };

      const policy = fallback(primary, secondary);
      const fn = vi.fn().mockResolvedValue('result');

      await policy.execute(fn);

      // Both policies should receive the same function
      expect(capturedFns[0]).toBe(capturedFns[1]);
    });
  });

  describe('race()', () => {
    it('returns first success', async () => {
      const policyA = {
        execute: () =>
          new Promise((resolve) => setTimeout(() => resolve('slow'), 100))
      };
      const policyB = {
        execute: () => Promise.resolve('fast')
      };

      const policy = race(policyA, policyB);
      const fn = vi.fn();

      const result = await policy.execute(fn);

      expect(result).toBe('fast');
    });

    it('returns policyA result if it wins', async () => {
      const policyA = {
        execute: () => Promise.resolve('A wins')
      };
      const policyB = {
        execute: () =>
          new Promise((resolve) => setTimeout(() => resolve('B'), 100))
      };

      const policy = race(policyA, policyB);
      const fn = vi.fn();

      const result = await policy.execute(fn);

      expect(result).toBe('A wins');
    });

    it('returns policyB result if it wins', async () => {
      const policyA = {
        execute: () =>
          new Promise((resolve) => setTimeout(() => resolve('A'), 100))
      };
      const policyB = {
        execute: () => Promise.resolve('B wins')
      };

      const policy = race(policyA, policyB);
      const fn = vi.fn();

      const result = await policy.execute(fn);

      expect(result).toBe('B wins');
    });

    it('returns success even if other fails', async () => {
      const policyA = {
        execute: () => Promise.reject(new Error('A failed'))
      };
      const policyB = {
        execute: () => Promise.resolve('B success')
      };

      const policy = race(policyA, policyB);
      const fn = vi.fn();

      const result = await policy.execute(fn);

      expect(result).toBe('B success');
    });

    it('returns success even if faster one fails', async () => {
      const policyA = {
        execute: () => Promise.reject(new Error('fast failure'))
      };
      const policyB = {
        execute: () =>
          new Promise((resolve) => setTimeout(() => resolve('slow success'), 50))
      };

      const policy = race(policyA, policyB);
      const fn = vi.fn();

      const result = await policy.execute(fn);

      expect(result).toBe('slow success');
    });

    it('throws first error if both fail', async () => {
      const policyA = {
        execute: () => Promise.reject(new Error('A failed'))
      };
      const policyB = {
        execute: () =>
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('B failed')), 50)
          )
      };

      const policy = race(policyA, policyB);
      const fn = vi.fn();

      await expect(policy.execute(fn)).rejects.toThrow('A failed');
    });

    it('both policies receive the same function', async () => {
      const capturedFns = [];

      const policyA = {
        execute: (fn) => {
          capturedFns.push(fn);
          return Promise.resolve('A');
        }
      };
      const policyB = {
        execute: (fn) => {
          capturedFns.push(fn);
          return Promise.resolve('B');
        }
      };

      const policy = race(policyA, policyB);
      const fn = vi.fn();

      await policy.execute(fn);

      expect(capturedFns[0]).toBe(capturedFns[1]);
    });

    it('executes both policies concurrently', async () => {
      const startTimes = [];
      const startTime = Date.now();

      const policyA = {
        execute: async () => {
          startTimes.push(Date.now() - startTime);
          await new Promise((resolve) => setTimeout(resolve, 50));
          return 'A';
        }
      };
      const policyB = {
        execute: async () => {
          startTimes.push(Date.now() - startTime);
          await new Promise((resolve) => setTimeout(resolve, 50));
          return 'B';
        }
      };

      const policy = race(policyA, policyB);
      const fn = vi.fn();

      await policy.execute(fn);

      // Both should start near simultaneously (within 20ms of each other)
      expect(Math.abs(startTimes[0] - startTimes[1])).toBeLessThan(20);
    });
  });
});
