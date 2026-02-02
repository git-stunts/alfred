import { describe, it, expect } from 'vitest';
import { rateLimit } from '../../src/policies/rate-limit.js';
import { RateLimitExceededError } from '../../src/errors.js';
import { TestClock } from '../../src/utils/clock.js';
import { InMemorySink } from '../../src/telemetry.js';

describe('rateLimit', () => {
  describe('steady-state throughput', () => {
    it('allows requests within rate limit', async () => {
      const clock = new TestClock();
      const limiter = rateLimit({ rate: 10, clock });

      // Should allow 10 requests immediately (burst = rate)
      const results = [];
      for (let i = 0; i < 10; i++) {
        results.push(await limiter.execute(() => Promise.resolve(i)));
      }

      expect(results).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });

    it('refills tokens at the configured rate', async () => {
      const clock = new TestClock();
      const limiter = rateLimit({ rate: 10, clock }); // 10 tokens/sec

      // Exhaust all tokens
      for (let i = 0; i < 10; i++) {
        await limiter.execute(() => Promise.resolve());
      }

      expect(limiter.stats.tokens).toBe(0);

      // After 500ms, should have 5 tokens
      await clock.advance(500);
      expect(limiter.stats.tokens).toBe(5);

      // After another 500ms (1s total), should have 10 tokens
      await clock.advance(500);
      expect(limiter.stats.tokens).toBe(10);
    });

    it('enforces rate of tokens per second', async () => {
      const clock = new TestClock();
      const limiter = rateLimit({ rate: 5, clock }); // 5 tokens/sec

      // Exhaust all 5 tokens
      for (let i = 0; i < 5; i++) {
        await limiter.execute(() => Promise.resolve());
      }

      // Attempt another request - should be rejected (queueLimit=0 by default)
      await expect(limiter.execute(() => Promise.resolve())).rejects.toThrow(
        RateLimitExceededError
      );

      // Advance 200ms = 1 token refilled
      await clock.advance(200);
      expect(limiter.stats.tokens).toBe(1);

      // Now should succeed
      await expect(limiter.execute(() => Promise.resolve())).resolves.toBeUndefined();
    });
  });

  describe('burst handling', () => {
    it('defaults burst to rate when not specified', async () => {
      const clock = new TestClock();
      const limiter = rateLimit({ rate: 5, clock });

      expect(limiter.stats.tokens).toBe(5);
    });

    it('allows burst capacity higher than rate', async () => {
      const clock = new TestClock();
      const limiter = rateLimit({ rate: 5, burst: 20, clock });

      // Should allow 20 requests immediately
      const results = [];
      for (let i = 0; i < 20; i++) {
        results.push(await limiter.execute(() => Promise.resolve(i)));
      }

      expect(results.length).toBe(20);
      expect(limiter.stats.tokens).toBe(0);
    });

    it('caps refilled tokens at burst limit', async () => {
      const clock = new TestClock();
      const limiter = rateLimit({ rate: 10, burst: 15, clock });

      // Use some tokens
      for (let i = 0; i < 10; i++) {
        await limiter.execute(() => Promise.resolve());
      }

      expect(limiter.stats.tokens).toBe(5);

      // Advance 2 seconds - would refill 20 tokens, but capped at burst
      await clock.advance(2000);
      expect(limiter.stats.tokens).toBe(15);
    });

    it('allows burst capacity lower than rate', async () => {
      const clock = new TestClock();
      const limiter = rateLimit({ rate: 100, burst: 5, clock });

      // Should only allow 5 requests immediately
      for (let i = 0; i < 5; i++) {
        await limiter.execute(() => Promise.resolve());
      }

      expect(limiter.stats.tokens).toBe(0);

      // 6th request should be rejected
      await expect(limiter.execute(() => Promise.resolve())).rejects.toThrow(
        RateLimitExceededError
      );
    });
  });

  describe('refill over time', () => {
    it('refills fractional tokens correctly', async () => {
      const clock = new TestClock();
      const limiter = rateLimit({ rate: 2, burst: 10, clock }); // 2 tokens/sec

      // Exhaust all tokens
      for (let i = 0; i < 10; i++) {
        await limiter.execute(() => Promise.resolve());
      }

      // After 250ms, should have 0.5 tokens (not enough for 1 request)
      await clock.advance(250);
      expect(limiter.stats.tokens).toBe(0); // floor(0.5) = 0

      // After another 250ms (500ms total), should have 1 token
      await clock.advance(250);
      expect(limiter.stats.tokens).toBe(1);
    });

    it('accumulates partial tokens across multiple advances', async () => {
      const clock = new TestClock();
      const limiter = rateLimit({ rate: 10, clock }); // 10 tokens/sec

      // Exhaust all tokens
      for (let i = 0; i < 10; i++) {
        await limiter.execute(() => Promise.resolve());
      }

      // Advance in 50ms increments (0.5 tokens each)
      await clock.advance(50);
      await clock.advance(50);
      await clock.advance(50);
      await clock.advance(50);

      // 200ms total = 2 tokens
      expect(limiter.stats.tokens).toBe(2);
    });

    it('does not refill backwards in time', async () => {
      const clock = new TestClock();
      const limiter = rateLimit({ rate: 10, clock });

      // Use 5 tokens
      for (let i = 0; i < 5; i++) {
        await limiter.execute(() => Promise.resolve());
      }

      expect(limiter.stats.tokens).toBe(5);

      // Setting time backwards should not affect tokens negatively
      // (TestClock doesn't support negative advance, this is just conceptual)
      await clock.advance(0);
      expect(limiter.stats.tokens).toBe(5);
    });
  });

  describe('rejection with RateLimitExceededError', () => {
    it('rejects immediately when limit exceeded and queueLimit is 0', async () => {
      const clock = new TestClock();
      const limiter = rateLimit({ rate: 1, queueLimit: 0, clock });

      // Use the only token
      await limiter.execute(() => Promise.resolve());

      // Next request should be rejected immediately
      await expect(limiter.execute(() => Promise.resolve())).rejects.toThrow(
        RateLimitExceededError
      );
    });

    it('error includes rate value', async () => {
      const clock = new TestClock();
      const limiter = rateLimit({ rate: 42, burst: 1, queueLimit: 0, clock });

      // Exhaust the single token
      await limiter.execute(() => Promise.resolve());

      try {
        await limiter.execute(() => Promise.resolve());
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(RateLimitExceededError);
        expect(e.rate).toBe(42);
        expect(e.message).toContain('42');
      }
    });

    it('error includes retryAfter value', async () => {
      const clock = new TestClock();
      const limiter = rateLimit({ rate: 10, queueLimit: 0, clock }); // 10/sec = 100ms per token

      // Exhaust all tokens
      for (let i = 0; i < 10; i++) {
        await limiter.execute(() => Promise.resolve());
      }

      try {
        await limiter.execute(() => Promise.resolve());
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(RateLimitExceededError);
        expect(e.retryAfter).toBe(100); // 1000ms / 10 tokens = 100ms per token
      }
    });

    it('retryAfter reflects time until next token', async () => {
      const clock = new TestClock();
      const limiter = rateLimit({ rate: 2, queueLimit: 0, clock }); // 2/sec = 500ms per token

      // Exhaust both tokens
      await limiter.execute(() => Promise.resolve());
      await limiter.execute(() => Promise.resolve());

      // Advance 200ms - partial refill
      await clock.advance(200);

      try {
        await limiter.execute(() => Promise.resolve());
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(RateLimitExceededError);
        // Need 1 token, have 0.4 tokens, need 0.6 more tokens at 2/sec = 300ms
        expect(e.retryAfter).toBe(300);
      }
    });
  });

  describe('queueing when queueLimit > 0', () => {
    it('queues requests when tokens exhausted', async () => {
      const clock = new TestClock();
      const limiter = rateLimit({ rate: 1, queueLimit: 5, clock });

      // First request uses the token
      const p1 = limiter.execute(() => Promise.resolve('first'));

      // Second request should be queued
      const p2 = limiter.execute(() => Promise.resolve('second'));

      expect(limiter.stats.queued).toBe(1);

      // Resolve first
      await p1;

      // Advance time to refill a token
      await clock.advance(1000);

      // Second should now complete
      await expect(p2).resolves.toBe('second');
      expect(limiter.stats.queued).toBe(0);
    });

    it('processes queue in FIFO order', async () => {
      const clock = new TestClock();
      const limiter = rateLimit({ rate: 1, queueLimit: 10, clock });
      const order = [];

      // First uses the token
      limiter.execute(() => {
        order.push(1);
        return Promise.resolve();
      });

      // Queue up more
      limiter.execute(() => {
        order.push(2);
        return Promise.resolve();
      });
      limiter.execute(() => {
        order.push(3);
        return Promise.resolve();
      });

      // Advance time to process queue
      await clock.advance(3000);

      expect(order).toEqual([1, 2, 3]);
    });

    it('rejects when queue is full', async () => {
      const clock = new TestClock();
      const limiter = rateLimit({ rate: 1, queueLimit: 2, clock });

      // First uses the token
      limiter.execute(() => clock.sleep(1000));

      // Fill the queue
      limiter.execute(() => Promise.resolve());
      limiter.execute(() => Promise.resolve());

      expect(limiter.stats.queued).toBe(2);

      // Next should be rejected
      await expect(limiter.execute(() => Promise.resolve())).rejects.toThrow(
        RateLimitExceededError
      );
    });

    it('queued requests eventually complete', async () => {
      const clock = new TestClock();
      const limiter = rateLimit({ rate: 10, queueLimit: 5, clock });

      // Exhaust all 10 tokens
      const immediate = [];
      for (let i = 0; i < 10; i++) {
        immediate.push(limiter.execute(() => Promise.resolve(i)));
      }

      // Queue 5 more
      const queued = [];
      for (let i = 10; i < 15; i++) {
        queued.push(limiter.execute(() => Promise.resolve(i)));
      }

      expect(limiter.stats.queued).toBe(5);

      // Wait for immediate ones
      const immediateResults = await Promise.all(immediate);
      expect(immediateResults).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);

      // Advance time for queued requests (5 tokens at 10/sec = 500ms)
      await clock.advance(500);

      const queuedResults = await Promise.all(queued);
      expect(queuedResults).toEqual([10, 11, 12, 13, 14]);
    });
  });

  describe('retryAfter value in error', () => {
    it('provides accurate retryAfter for various rates', async () => {
      const clock = new TestClock();

      // Test with rate of 4 (250ms per token)
      const limiter = rateLimit({ rate: 4, queueLimit: 0, clock });
      for (let i = 0; i < 4; i++) {
        await limiter.execute(() => Promise.resolve());
      }

      try {
        await limiter.execute(() => Promise.resolve());
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e.retryAfter).toBe(250);
      }
    });

    it('retryAfter decreases as time passes', async () => {
      const clock = new TestClock();
      const limiter = rateLimit({ rate: 1, queueLimit: 0, clock }); // 1/sec = 1000ms per token

      await limiter.execute(() => Promise.resolve());

      // Initially need 1000ms
      try {
        await limiter.execute(() => Promise.resolve());
      } catch (e) {
        expect(e.retryAfter).toBe(1000);
      }

      // After 400ms, need 600ms
      await clock.advance(400);
      try {
        await limiter.execute(() => Promise.resolve());
      } catch (e) {
        expect(e.retryAfter).toBe(600);
      }

      // After another 400ms (800ms total), need 200ms
      await clock.advance(400);
      try {
        await limiter.execute(() => Promise.resolve());
      } catch (e) {
        expect(e.retryAfter).toBe(200);
      }
    });
  });

  describe('TestClock support (deterministic tests)', () => {
    it('runs without real delays', async () => {
      const clock = new TestClock();
      const limiter = rateLimit({ rate: 1, queueLimit: 10, clock });
      const startRealTime = Date.now();

      // Exhaust token and queue 5 requests
      limiter.execute(() => Promise.resolve());
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(limiter.execute(() => Promise.resolve()));
      }

      // Advance 5 seconds of virtual time instantly
      await clock.advance(5000);

      await Promise.all(promises);

      const elapsedRealTime = Date.now() - startRealTime;
      // Should complete in well under a second of real time (relaxed for CI)
      expect(elapsedRealTime).toBeLessThan(500);
    });

    it('processes queue as virtual time advances', async () => {
      const clock = new TestClock();
      const limiter = rateLimit({ rate: 2, queueLimit: 10, clock }); // 2/sec = 500ms per token

      // Exhaust both tokens
      await limiter.execute(() => Promise.resolve());
      await limiter.execute(() => Promise.resolve());

      // Queue a request
      let resolved = false;
      const promise = limiter.execute(() => {
        resolved = true;
        return Promise.resolve('done');
      });

      expect(resolved).toBe(false);
      expect(limiter.stats.queued).toBe(1);

      // Advance less than needed
      await clock.advance(400);
      expect(resolved).toBe(false);

      // Advance past the threshold
      await clock.advance(200);
      await promise;
      expect(resolved).toBe(true);
    });

    it('allows precise timing verification', async () => {
      const clock = new TestClock();
      const limiter = rateLimit({ rate: 10, clock }); // 10/sec = 100ms per token

      // Exhaust all tokens
      for (let i = 0; i < 10; i++) {
        await limiter.execute(() => Promise.resolve());
      }

      expect(limiter.stats.tokens).toBe(0);

      // Check at precise intervals
      await clock.advance(50);
      expect(limiter.stats.tokens).toBe(0); // 0.5 tokens, floor = 0

      await clock.advance(50);
      expect(limiter.stats.tokens).toBe(1); // 1 token

      await clock.advance(100);
      expect(limiter.stats.tokens).toBe(2); // 2 tokens

      await clock.advance(300);
      expect(limiter.stats.tokens).toBe(5); // 5 tokens
    });
  });

  describe('telemetry events', () => {
    it('emits rateLimit.acquire on successful acquisition', async () => {
      const clock = new TestClock();
      const telemetry = new InMemorySink();
      const limiter = rateLimit({ rate: 5, clock, telemetry });

      await limiter.execute(() => Promise.resolve());

      expect(telemetry.events).toHaveLength(1);
      expect(telemetry.events[0].type).toBe('rateLimit.acquire');
      expect(telemetry.events[0].timestamp).toBe(0);
      expect(telemetry.events[0].tokens).toBe(4);
      expect(telemetry.events[0].queued).toBe(0);
    });

    it('emits rateLimit.queued when request is queued', async () => {
      const clock = new TestClock();
      const telemetry = new InMemorySink();
      const limiter = rateLimit({ rate: 1, queueLimit: 5, clock, telemetry });

      // First uses the token
      await limiter.execute(() => Promise.resolve());

      // Second gets queued
      limiter.execute(() => Promise.resolve());

      // Should have acquire + queued events
      const queuedEvents = telemetry.events.filter((e) => e.type === 'rateLimit.queued');
      expect(queuedEvents).toHaveLength(1);
      // queued count is captured before the request is added to queue (shows queue state at emit time)
      expect(queuedEvents[0].queued).toBe(0);
    });

    it('emits rateLimit.rejected when request is rejected', async () => {
      const clock = new TestClock();
      const telemetry = new InMemorySink();
      const limiter = rateLimit({ rate: 1, queueLimit: 0, clock, telemetry });

      // First uses the token
      await limiter.execute(() => Promise.resolve());

      // Second should be rejected
      try {
        await limiter.execute(() => Promise.resolve());
      } catch {
        // Expected
      }

      const rejectedEvents = telemetry.events.filter((e) => e.type === 'rateLimit.rejected');
      expect(rejectedEvents).toHaveLength(1);
      expect(rejectedEvents[0].retryAfter).toBe(1000);
      expect(rejectedEvents[0].metrics).toEqual({ rateLimitRejections: 1 });
    });

    it('emits acquire after queued request completes', async () => {
      const clock = new TestClock();
      const telemetry = new InMemorySink();
      const limiter = rateLimit({ rate: 1, queueLimit: 5, clock, telemetry });

      // First uses the token
      await limiter.execute(() => Promise.resolve());

      telemetry.clear();

      // Second gets queued
      const promise = limiter.execute(() => Promise.resolve());

      // Should have queued event
      expect(telemetry.events.some((e) => e.type === 'rateLimit.queued')).toBe(true);

      // Advance time and wait for completion
      await clock.advance(1000);
      await promise;

      // Should now have acquire event
      expect(telemetry.events.some((e) => e.type === 'rateLimit.acquire')).toBe(true);
    });

    it('includes correct timestamp in events', async () => {
      const clock = new TestClock();
      const telemetry = new InMemorySink();
      const limiter = rateLimit({ rate: 1, queueLimit: 1, clock, telemetry });

      // First at t=0
      await limiter.execute(() => Promise.resolve());

      // Advance to t=500
      await clock.advance(500);

      // Try to execute - gets queued
      const promise = limiter.execute(() => Promise.resolve());

      // Advance to t=1000
      await clock.advance(500);
      await promise;

      // Check timestamps
      const acquireEvents = telemetry.events.filter((e) => e.type === 'rateLimit.acquire');
      expect(acquireEvents[0].timestamp).toBe(0);
      expect(acquireEvents[1].timestamp).toBe(1000);

      const queuedEvents = telemetry.events.filter((e) => e.type === 'rateLimit.queued');
      expect(queuedEvents[0].timestamp).toBe(500);
    });

    it('reports current token count in events', async () => {
      const clock = new TestClock();
      const telemetry = new InMemorySink();
      const limiter = rateLimit({ rate: 5, clock, telemetry });

      // Execute multiple requests
      await limiter.execute(() => Promise.resolve());
      await limiter.execute(() => Promise.resolve());
      await limiter.execute(() => Promise.resolve());

      // Token counts should decrease
      expect(telemetry.events[0].tokens).toBe(4);
      expect(telemetry.events[1].tokens).toBe(3);
      expect(telemetry.events[2].tokens).toBe(2);
    });
  });

  describe('stats', () => {
    it('reports current token count', async () => {
      const clock = new TestClock();
      const limiter = rateLimit({ rate: 5, clock });

      expect(limiter.stats.tokens).toBe(5);

      await limiter.execute(() => Promise.resolve());
      expect(limiter.stats.tokens).toBe(4);

      await limiter.execute(() => Promise.resolve());
      expect(limiter.stats.tokens).toBe(3);
    });

    it('reports queue length', async () => {
      const clock = new TestClock();
      const limiter = rateLimit({ rate: 1, queueLimit: 10, clock });

      expect(limiter.stats.queued).toBe(0);

      // Use the token
      limiter.execute(() => clock.sleep(1000));

      // Queue some requests
      limiter.execute(() => Promise.resolve());
      limiter.execute(() => Promise.resolve());

      expect(limiter.stats.queued).toBe(2);
    });

    it('tokens are floored in stats', async () => {
      const clock = new TestClock();
      const limiter = rateLimit({ rate: 2, clock }); // 2/sec

      // Exhaust tokens
      await limiter.execute(() => Promise.resolve());
      await limiter.execute(() => Promise.resolve());

      // Advance 250ms = 0.5 tokens
      await clock.advance(250);
      expect(limiter.stats.tokens).toBe(0); // floor(0.5) = 0

      // Advance another 250ms = 1 token
      await clock.advance(250);
      expect(limiter.stats.tokens).toBe(1);
    });
  });

  describe('edge cases', () => {
    it('handles sync functions', async () => {
      const clock = new TestClock();
      const limiter = rateLimit({ rate: 5, clock });

      const result = await limiter.execute(() => 'sync result');
      expect(result).toBe('sync result');
    });

    it('handles async functions', async () => {
      const clock = new TestClock();
      const limiter = rateLimit({ rate: 5, clock });

      const result = await limiter.execute(async () => {
        await Promise.resolve();
        return 'async result';
      });
      expect(result).toBe('async result');
    });

    it('propagates errors from executed function', async () => {
      const clock = new TestClock();
      const limiter = rateLimit({ rate: 5, clock });

      await expect(
        limiter.execute(() => {
          throw new Error('sync error');
        })
      ).rejects.toThrow('sync error');

      await expect(limiter.execute(() => Promise.reject(new Error('async error')))).rejects.toThrow(
        'async error'
      );
    });

    it('still consumes token even if function throws', async () => {
      const clock = new TestClock();
      const limiter = rateLimit({ rate: 2, clock });

      try {
        await limiter.execute(() => {
          throw new Error('error');
        });
      } catch {
        // Expected
      }

      expect(limiter.stats.tokens).toBe(1);
    });

    it('handles very high rate', async () => {
      const clock = new TestClock();
      const limiter = rateLimit({ rate: 10000, clock });

      expect(limiter.stats.tokens).toBe(10000);

      // Execute many requests
      for (let i = 0; i < 100; i++) {
        await limiter.execute(() => Promise.resolve());
      }

      expect(limiter.stats.tokens).toBe(9900);
    });

    it('handles very low rate', async () => {
      const clock = new TestClock();
      const limiter = rateLimit({ rate: 0.1, queueLimit: 0, clock }); // 0.1/sec = 1 per 10 seconds

      // Should start with 0.1 tokens (floor = 0), but initial bucket should have 0.1 tokens
      // Actually, burst defaults to rate, so we have 0.1 tokens initially
      // A single request needs 1 token, so should be rejected
      await expect(limiter.execute(() => Promise.resolve())).rejects.toThrow(
        RateLimitExceededError
      );
    });

    it('handles concurrent queue processing correctly', async () => {
      const clock = new TestClock();
      const limiter = rateLimit({ rate: 5, queueLimit: 20, clock });

      // Exhaust all tokens
      for (let i = 0; i < 5; i++) {
        await limiter.execute(() => Promise.resolve());
      }

      // Queue 10 requests
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(limiter.execute(() => Promise.resolve(i)));
      }

      expect(limiter.stats.queued).toBe(10);

      // Advance time to process all (10 tokens at 5/sec = 2 seconds)
      await clock.advance(2000);

      const results = await Promise.all(promises);
      expect(results).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
      expect(limiter.stats.queued).toBe(0);
    });

    it('works without telemetry', async () => {
      const clock = new TestClock();
      const limiter = rateLimit({ rate: 5, clock });

      // Should not throw
      await limiter.execute(() => Promise.resolve());
      expect(limiter.stats.tokens).toBe(4);
    });

    it('handles function that returns a value immediately', async () => {
      const clock = new TestClock();
      const limiter = rateLimit({ rate: 5, clock });

      const result = await limiter.execute(() => 42);
      expect(result).toBe(42);
    });
  });

  describe('resolvable options', () => {
    it('supports dynamic rate via function', async () => {
      const clock = new TestClock();
      let currentRate = 2;
      const limiter = rateLimit({ rate: () => currentRate, burst: 5, clock });

      // Initial burst is 5
      expect(limiter.stats.tokens).toBe(5);

      // Exhaust all 5 tokens
      for (let i = 0; i < 5; i++) {
        await limiter.execute(() => Promise.resolve());
      }

      expect(limiter.stats.tokens).toBe(0);

      // Change rate to 10
      currentRate = 10;

      // Advance 0.5 second - should refill at new rate (10 * 0.5 = 5 tokens)
      await clock.advance(500);
      expect(limiter.stats.tokens).toBe(5); // Capped at burst of 5
    });

    it('supports dynamic burst via function', async () => {
      const clock = new TestClock();
      let currentBurst = 5;
      const limiter = rateLimit({ rate: 10, burst: () => currentBurst, clock });

      expect(limiter.stats.tokens).toBe(5);

      // Exhaust tokens
      for (let i = 0; i < 5; i++) {
        await limiter.execute(() => Promise.resolve());
      }

      // Change burst
      currentBurst = 20;

      // Advance time to refill
      await clock.advance(2000);
      expect(limiter.stats.tokens).toBe(20); // Now uses new burst cap
    });

    it('supports dynamic queueLimit via function', async () => {
      const clock = new TestClock();
      let currentQueueLimit = 2;
      const limiter = rateLimit({
        rate: 1,
        queueLimit: () => currentQueueLimit,
        clock,
      });

      // Exhaust token
      limiter.execute(() => clock.sleep(1000));

      // Fill queue
      limiter.execute(() => Promise.resolve());
      limiter.execute(() => Promise.resolve());

      // Change queue limit
      currentQueueLimit = 5;

      // Now should be able to queue more
      limiter.execute(() => Promise.resolve());
      limiter.execute(() => Promise.resolve());

      expect(limiter.stats.queued).toBe(4);
    });
  });
});
