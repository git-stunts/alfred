import { describe, it, expect, vi } from 'vitest';
import { Policy } from '../../src/policy.js';
import { TestClock } from '../../src/utils/clock.js';
import { RetryExhaustedError, TimeoutError } from '../../src/errors.js';
import { flush } from '../../../test/helpers/async.js';

describe('Policy (fluent API)', () => {
  describe('Policy.retry()', () => {
    it('creates working retry policy', async () => {
      const fn = vi.fn().mockRejectedValueOnce(new Error('fail')).mockResolvedValue('success');

      const clock = new TestClock();
      const policy = Policy.retry({ retries: 2, delay: 100, clock });

      const resultPromise = policy.execute(fn);
      for (let i = 0; i < 20; i++) await Promise.resolve();
      await clock.advance(100);
      for (let i = 0; i < 20; i++) await Promise.resolve();

      const result = await resultPromise;

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('returns result on first success', async () => {
      const fn = vi.fn().mockResolvedValue('immediate');
      const policy = Policy.retry({ retries: 3 });

      const result = await policy.execute(fn);

      expect(result).toBe('immediate');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('throws RetryExhaustedError when exhausted', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('always fails'));
      const clock = new TestClock();
      const policy = Policy.retry({ retries: 2, delay: 100, clock });

      const resultPromise = policy.execute(fn);
      for (let i = 0; i < 20; i++) await Promise.resolve();
      await clock.advance(100);
      for (let i = 0; i < 20; i++) await Promise.resolve();
      await clock.advance(100);
      for (let i = 0; i < 20; i++) await Promise.resolve();

      await expect(resultPromise).rejects.toThrow(RetryExhaustedError);
    });
  });

  describe('Policy.timeout()', () => {
    it('creates working timeout policy', async () => {
      const fn = vi.fn().mockResolvedValue('fast');
      const policy = Policy.timeout(1000);

      const result = await policy.execute(fn);

      expect(result).toBe('fast');
    });

    it('throws TimeoutError when exceeded', async () => {
      const clock = new TestClock();
      const fn = () => clock.sleep(200).then(() => 'slow');
      const policy = Policy.timeout(50, { clock });

      const resultPromise = policy.execute(fn);
      await clock.advance(50);

      await expect(resultPromise).rejects.toThrow(TimeoutError);
    });
  });

  describe('Policy.circuitBreaker()', () => {
    it('creates working circuit breaker policy', async () => {
      const policy = Policy.circuitBreaker({ threshold: 2, duration: 1000 });
      const fn = vi.fn().mockResolvedValue('success');

      const result = await policy.execute(fn);

      expect(result).toBe('success');
    });
  });

  describe('Policy.bulkhead()', () => {
    it('creates working bulkhead policy', async () => {
      const policy = Policy.bulkhead({ limit: 1 });
      const fn = vi.fn().mockResolvedValue('success');

      const result = await policy.execute(fn);

      expect(result).toBe('success');
    });
  });

  describe('Policy.noop()', () => {
    it('passes through to function directly', async () => {
      const fn = vi.fn().mockResolvedValue('pass through');
      const policy = Policy.noop();

      const result = await policy.execute(fn);

      expect(result).toBe('pass through');
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('.wrap() composition', () => {
    it('composes sequentially (outer wraps inner)', async () => {
      const callOrder = [];

      // Create custom policies to track call order
      const outer = new Policy(async (fn) => {
        callOrder.push('outer-start');
        const result = await fn();
        callOrder.push('outer-end');
        return result;
      });

      const inner = new Policy(async (fn) => {
        callOrder.push('inner-start');
        const result = await fn();
        callOrder.push('inner-end');
        return result;
      });

      const composed = outer.wrap(inner);
      const fn = async () => {
        callOrder.push('fn');
        return 'result';
      };

      const result = await composed.execute(fn);

      expect(result).toBe('result');
      expect(callOrder).toEqual(['outer-start', 'inner-start', 'fn', 'inner-end', 'outer-end']);
    });

    it('retry wraps timeout correctly', async () => {
      const clock = new TestClock();
      const fn = vi
        .fn()
        .mockImplementationOnce(() => clock.sleep(200).then(() => 'slow'))
        .mockResolvedValue('fast');

      const policy = Policy.retry({ retries: 2, delay: 100, clock }).wrap(
        Policy.timeout(50, { clock })
      );

      // First attempt will timeout, then retry should succeed
      const resultPromise = policy.execute(fn);

      // Advance past first timeout
      await clock.advance(50);
      await flush(2);
      // Advance clock for retry delay
      await clock.advance(100);
      await flush(2);

      const result = await resultPromise;

      expect(result).toBe('fast');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('chains multiple wraps correctly', async () => {
      const callOrder = [];

      const makePolicy = (name) =>
        new Policy(async (fn) => {
          callOrder.push(`${name}-start`);
          const result = await fn();
          callOrder.push(`${name}-end`);
          return result;
        });

      const policy = makePolicy('A').wrap(makePolicy('B')).wrap(makePolicy('C'));

      await policy.execute(async () => {
        callOrder.push('fn');
        return 'result';
      });

      expect(callOrder).toEqual(['A-start', 'B-start', 'C-start', 'fn', 'C-end', 'B-end', 'A-end']);
    });
  });

  describe('.or() fallback', () => {
    it('provides fallback on failure', async () => {
      const primaryFn = vi.fn().mockRejectedValue(new Error('primary failed'));
      const primary = new Policy(() => primaryFn());

      const secondaryFn = vi.fn().mockResolvedValue('fallback result');
      const secondary = new Policy(() => secondaryFn());

      const policy = primary.or(secondary);
      const fn = vi.fn();

      const result = await policy.execute(fn);

      expect(result).toBe('fallback result');
    });

    it('returns primary result when successful', async () => {
      const primary = Policy.noop();
      const secondary = new Policy(() => Promise.resolve('should not reach'));

      const policy = primary.or(secondary);
      const fn = vi.fn().mockResolvedValue('primary result');

      const result = await policy.execute(fn);

      expect(result).toBe('primary result');
    });

    it('chains multiple fallbacks', async () => {
      const first = new Policy(() => Promise.reject(new Error('first failed')));
      const second = new Policy(() => Promise.reject(new Error('second failed')));
      const third = new Policy((fn) => fn());

      const policy = first.or(second).or(third);
      const fn = vi.fn().mockResolvedValue('third succeeds');

      const result = await policy.execute(fn);

      expect(result).toBe('third succeeds');
    });
  });

  describe('.race() concurrent execution', () => {
    it('runs concurrently and returns first success', async () => {
      const clock = new TestClock();
      const slow = new Policy(() => clock.sleep(100).then(() => 'slow'));
      const fast = new Policy(() => Promise.resolve('fast'));

      const policy = slow.race(fast);
      const fn = vi.fn();

      const result = await policy.execute(fn);
      await clock.advance(100);

      expect(result).toBe('fast');
    });

    it('returns success even if other fails', async () => {
      const clock = new TestClock();
      const failing = new Policy(() => Promise.reject(new Error('failed')));
      const succeeding = new Policy(() => clock.sleep(50).then(() => 'success'));

      const policy = failing.race(succeeding);
      const fn = vi.fn();

      const resultPromise = policy.execute(fn);
      await clock.advance(50);
      const result = await resultPromise;

      expect(result).toBe('success');
    });

    it('throws if both fail', async () => {
      const failing1 = new Policy(() => Promise.reject(new Error('fail 1')));
      const failing2 = new Policy(() => Promise.reject(new Error('fail 2')));

      const policy = failing1.race(failing2);
      const fn = vi.fn();

      await expect(policy.execute(fn)).rejects.toThrow('fail 1');
    });
  });

  describe('complex chains', () => {
    it('retry + timeout + fallback works correctly', async () => {
      const clock = new TestClock();

      // Primary: retry with timeout that will fail
      const primary = Policy.retry({ retries: 1, delay: 100, clock }).wrap(
        Policy.timeout(30, { clock })
      );

      // Fallback: simple noop
      const fallbackPolicy = Policy.noop();

      const policy = primary.or(fallbackPolicy);

      // Function that times out then succeeds on fallback
      let callCount = 0;
      const fn = vi.fn(() => {
        callCount++;
        if (callCount <= 2) {
          // First two calls (primary attempts) timeout
          return clock.sleep(200).then(() => 'too slow');
        }
        return Promise.resolve('fallback success');
      });

      const resultPromise = policy.execute(fn);

      // Wait for timeouts
      await clock.advance(30);
      await flush(2);
      await clock.advance(100);
      await flush(2);
      await clock.advance(30);
      await flush(2);

      const result = await resultPromise;

      expect(result).toBe('fallback success');
    });

    it('nested wraps maintain correct order', async () => {
      const trace = [];

      const makeTracingPolicy = (name) =>
        new Policy(async (fn) => {
          trace.push(`${name}:before`);
          try {
            const result = await fn();
            trace.push(`${name}:after`);
            return result;
          } catch (e) {
            trace.push(`${name}:error`);
            throw e;
          }
        });

      const policy = makeTracingPolicy('A')
        .wrap(makeTracingPolicy('B'))
        .wrap(makeTracingPolicy('C'));

      await policy.execute(async () => {
        trace.push('fn');
        return 'result';
      });

      expect(trace).toEqual([
        'A:before',
        'B:before',
        'C:before',
        'fn',
        'C:after',
        'B:after',
        'A:after',
      ]);
    });

    it('race between two retry policies', async () => {
      const clock1 = new TestClock();
      const clock2 = new TestClock();

      // Slow retry
      const slowRetry = Policy.retry({
        retries: 2,
        delay: 500,
        clock: clock1,
      });

      // Fast retry
      const fastRetry = Policy.retry({
        retries: 1,
        delay: 50,
        clock: clock2,
      });

      const policy = slowRetry.race(fastRetry);

      let callCount = 0;
      const fn = vi.fn(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error('first fail'));
        }
        return Promise.resolve('retry success');
      });

      const resultPromise = policy.execute(fn);

      // Fast retry should win
      await flush(2);
      await clock2.advance(50);
      await flush(2);

      const result = await resultPromise;

      expect(result).toBe('retry success');
    });

    it('immutability - wrap returns new policy', () => {
      const policy1 = Policy.retry({ retries: 1 });
      const policy2 = Policy.timeout(1000);

      const composed = policy1.wrap(policy2);

      expect(composed).not.toBe(policy1);
      expect(composed).not.toBe(policy2);
    });

    it('immutability - or returns new policy', () => {
      const policy1 = Policy.noop();
      const policy2 = Policy.noop();

      const composed = policy1.or(policy2);

      expect(composed).not.toBe(policy1);
      expect(composed).not.toBe(policy2);
    });

    it('immutability - race returns new policy', () => {
      const policy1 = Policy.noop();
      const policy2 = Policy.noop();

      const composed = policy1.race(policy2);

      expect(composed).not.toBe(policy1);
      expect(composed).not.toBe(policy2);
    });
  });

  describe('execute()', () => {
    it('passes function to executor', async () => {
      const executor = vi.fn((fn) => fn());
      const policy = new Policy(executor);
      const fn = vi.fn().mockResolvedValue('result');

      await policy.execute(fn);

      expect(executor).toHaveBeenCalledWith(fn);
    });

    it('returns promise from executor', async () => {
      const policy = new Policy(() => Promise.resolve('executor result'));
      const fn = vi.fn();

      const result = await policy.execute(fn);

      expect(result).toBe('executor result');
    });

    it('propagates errors from executor', async () => {
      const policy = new Policy(() => Promise.reject(new Error('executor error')));
      const fn = vi.fn();

      await expect(policy.execute(fn)).rejects.toThrow('executor error');
    });
  });
});
