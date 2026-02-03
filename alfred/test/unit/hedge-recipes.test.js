/**
 * @fileoverview Tests for hedge policy recipes and guardrails.
 *
 * Verifies the patterns documented in README work correctly.
 */

import { describe, it, expect, vi } from 'vitest';
import { Policy } from '../../src/index.js';
import { TestClock } from '../../src/utils/clock.js';

describe('Hedge Recipes', () => {
  describe('Safe hedging with bulkhead + circuit breaker', () => {
    it('limits concurrency across hedges', async () => {
      const clock = new TestClock();
      let activeCalls = 0;
      let maxActive = 0;

      const safeHedge = Policy.hedge({ delay: 10, maxHedges: 2, clock }).wrap(
        Policy.bulkhead({ limit: 2 })
      );

      const fn = vi.fn().mockImplementation(async () => {
        activeCalls++;
        maxActive = Math.max(maxActive, activeCalls);
        await clock.sleep(100);
        activeCalls--;
        return 'result';
      });

      const resultPromise = safeHedge.execute(fn);

      // Advance past hedge delays
      await clock.advance(10);
      for (let i = 0; i < 20; i++) await Promise.resolve();
      await clock.advance(10);
      for (let i = 0; i < 20; i++) await Promise.resolve();

      // Finish the operation
      await clock.advance(100);
      for (let i = 0; i < 20; i++) await Promise.resolve();

      await resultPromise;

      // Bulkhead should limit to 2 concurrent calls despite 3 potential hedges
      expect(maxActive).toBeLessThanOrEqual(2);
    });

    it('honors AbortSignal on losing hedges', async () => {
      const clock = new TestClock();
      const abortedSignals = [];

      const safeHedge = Policy.hedge({ delay: 10, maxHedges: 1, clock });

      let resolveWinner;
      const fn = vi.fn().mockImplementation((signal) => {
        signal.addEventListener('abort', () => {
          abortedSignals.push(signal);
        });

        if (!resolveWinner) {
          // First call - will be resolved manually
          return new Promise((r) => (resolveWinner = r));
        }
        // Hedge - returns immediately
        return Promise.resolve('hedge-wins');
      });

      const resultPromise = safeHedge.execute(fn);

      // Trigger hedge
      await clock.advance(10);
      for (let i = 0; i < 20; i++) await Promise.resolve();

      // Hedge wins
      const result = await resultPromise;
      expect(result).toBe('hedge-wins');

      // Both attempts get aborted when winner is determined (cleanup)
      expect(abortedSignals.length).toBe(2);
    });
  });

  describe('hedgeRead pattern', () => {
    function createHedgedReader(options = {}) {
      const { delay = 50, maxHedges = 1, concurrencyLimit = 5, clock } = options;
      return Policy.hedge({ delay, maxHedges, clock }).wrap(
        Policy.bulkhead({ limit: concurrencyLimit })
      );
    }

    it('returns fast results without hedging', async () => {
      const clock = new TestClock();
      const hedgedRead = createHedgedReader({ delay: 50, clock });

      const fn = vi.fn().mockResolvedValue({ id: 1, name: 'user' });

      const result = await hedgedRead.execute(fn);

      expect(result).toEqual({ id: 1, name: 'user' });
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('hedges slow reads', async () => {
      const clock = new TestClock();
      const hedgedRead = createHedgedReader({ delay: 50, maxHedges: 1, clock });

      let callCount = 0;
      const fn = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          // First call is slow
          await clock.sleep(200);
          return 'slow';
        }
        // Hedge is fast
        return 'fast';
      });

      const resultPromise = hedgedRead.execute(fn);

      // Advance to trigger hedge
      await clock.advance(50);
      for (let i = 0; i < 20; i++) await Promise.resolve();

      const result = await resultPromise;

      expect(result).toBe('fast');
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('Happy Eyeballs pattern', () => {
    async function happyEyeballsFetch(urls, options = {}) {
      const { delay = 50, clock } = options;
      const racer = Policy.hedge({ delay, maxHedges: urls.length - 1, clock });

      let urlIndex = 0;
      return racer.execute((signal) => {
        const url = urls[urlIndex++ % urls.length];
        return options.fetcher(url, signal);
      });
    }

    it('returns first successful response', async () => {
      const clock = new TestClock();
      const responses = {
        primary: { delay: 100, data: 'primary-data' },
        replica: { delay: 20, data: 'replica-data' },
      };

      const fetcher = vi.fn().mockImplementation(async (url, _signal) => {
        const config = url.includes('primary') ? responses.primary : responses.replica;
        await clock.sleep(config.delay);
        return { ok: true, data: config.data };
      });

      const resultPromise = happyEyeballsFetch(
        ['https://api-primary.example.com', 'https://api-replica.example.com'],
        { delay: 30, clock, fetcher }
      );

      // Primary starts immediately
      expect(fetcher).toHaveBeenCalledTimes(1);

      // Advance to trigger hedge (replica)
      await clock.advance(30);
      for (let i = 0; i < 20; i++) await Promise.resolve();

      expect(fetcher).toHaveBeenCalledTimes(2);

      // Advance enough for replica to finish (it's faster)
      await clock.advance(20);
      for (let i = 0; i < 20; i++) await Promise.resolve();

      const result = await resultPromise;

      expect(result.data).toBe('replica-data');
    });

    it('falls back if first endpoint fails', async () => {
      const clock = new TestClock();

      const fetcher = vi.fn().mockImplementation(async (url, _signal) => {
        if (url.includes('primary')) {
          throw new Error('Primary down');
        }
        return { ok: true, data: 'replica-data' };
      });

      const resultPromise = happyEyeballsFetch(
        ['https://api-primary.example.com', 'https://api-replica.example.com'],
        { delay: 10, clock, fetcher }
      );

      // First call fails immediately
      await clock.advance(10);
      for (let i = 0; i < 20; i++) await Promise.resolve();

      const result = await resultPromise;

      expect(result.data).toBe('replica-data');
    });
  });
});
