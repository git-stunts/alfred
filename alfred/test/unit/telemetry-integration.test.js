import { describe, it, expect, vi } from 'vitest';
import { retry } from '../../src/policies/retry.js';
import { circuitBreaker } from '../../src/policies/circuit-breaker.js';
import { bulkhead } from '../../src/policies/bulkhead.js';
import { InMemorySink } from '../../src/telemetry.js';
import { TestClock } from '../../src/utils/clock.js';
import { defer } from '../../../test/helpers/async.js';

describe('Telemetry Integration', () => {
  describe('retry', () => {
    it('emits success event', async () => {
      const sink = new InMemorySink();
      const clock = new TestClock();

      await retry(() => Promise.resolve('ok'), {
        telemetry: sink,
        clock,
      });

      expect(sink.events).toHaveLength(1);
      expect(sink.events[0]).toMatchObject({
        type: 'retry.success',
        attempt: 1,
      });
    });

    it('emits failure, scheduled, and success events', async () => {
      const sink = new InMemorySink();
      const clock = new TestClock();
      const fn = vi.fn().mockRejectedValueOnce(new Error('fail')).mockResolvedValue('ok');

      const promise = retry(fn, {
        retries: 1,
        delay: 100,
        telemetry: sink,
        clock,
      });

      // Wait for first failure and schedule
      await Promise.resolve();
      await clock.tick(0);

      // Check intermediate state
      // We expect: failure (attempt 1), scheduled (attempt 1 -> 2)

      await clock.advance(100);
      await promise;

      expect(sink.events).toHaveLength(3);
      expect(sink.events[0]).toMatchObject({
        type: 'retry.failure',
        attempt: 1,
        error: expect.any(Error),
      });
      expect(sink.events[1]).toMatchObject({
        type: 'retry.scheduled',
        attempt: 1,
        delay: 100,
      });
      expect(sink.events[2]).toMatchObject({
        type: 'retry.success',
        attempt: 2,
      });
    });

    it('emits exhausted event', async () => {
      const sink = new InMemorySink();
      const clock = new TestClock();
      const fn = vi.fn().mockRejectedValue(new Error('fail'));

      const promise = retry(fn, {
        retries: 1,
        delay: 100,
        telemetry: sink,
        clock,
      });

      // Allow first attempt to fail and enter sleep
      await clock.tick(0);
      await clock.advance(100);

      try {
        await promise;
      } catch {
        // ignore
      }

      // events: failure(1), scheduled(1), failure(2), exhausted
      expect(sink.events).toHaveLength(4);
      expect(sink.events[3]).toMatchObject({
        type: 'retry.exhausted',
        attempts: 2,
      });
    });
  });

  describe('circuitBreaker', () => {
    it('emits failure, open, reject, half-open, close events', async () => {
      const sink = new InMemorySink();
      const clock = new TestClock();

      const breaker = circuitBreaker({
        threshold: 1,
        duration: 100,
        telemetry: sink,
        clock,
      });

      // 1. Failure -> Open
      const error = new Error('boom');
      await expect(breaker.execute(() => Promise.reject(error))).rejects.toThrow('boom');

      // failure event
      expect(sink.events[0]).toMatchObject({
        type: 'circuit.failure',
        error,
      });
      // open event
      expect(sink.events[1]).toMatchObject({
        type: 'circuit.open',
        failureCount: 1,
      });

      // 2. Reject while open
      await expect(breaker.execute(() => Promise.resolve('ok'))).rejects.toThrow(
        'Circuit breaker is open'
      );

      expect(sink.events[2]).toMatchObject({
        type: 'circuit.reject',
        failureCount: 1,
      });

      // 3. Half-open
      await clock.advance(100);
      await breaker.execute(() => Promise.resolve('ok'));

      // half-open event
      expect(sink.events[3]).toMatchObject({
        type: 'circuit.half-open',
      });
      // success event
      expect(sink.events[4]).toMatchObject({
        type: 'circuit.success',
        state: 'HALF_OPEN',
      });
      // close event
      expect(sink.events[5]).toMatchObject({
        type: 'circuit.close',
      });
    });
  });

  describe('bulkhead', () => {
    it('emits execute, complete, queued, reject events', async () => {
      const sink = new InMemorySink();
      const clock = new TestClock();

      const policy = bulkhead({
        limit: 1,
        queueLimit: 1,
        telemetry: sink,
        clock,
      });

      const gate1 = defer();
      const gate2 = defer();

      // 1. Execute immediately
      const p1 = policy.execute(() => gate1.promise);

      // execute event
      expect(sink.events[0]).toMatchObject({
        type: 'bulkhead.execute',
        active: 1,
        pending: 0,
      });

      // 2. Queue
      const p2 = policy.execute(() => gate2.promise);

      // queued event
      expect(sink.events[1]).toMatchObject({
        type: 'bulkhead.queued',
        active: 1,
        pending: 1,
      });

      // 3. Reject
      await expect(policy.execute(() => Promise.resolve())).rejects.toThrow('Bulkhead rejected');

      // reject event
      expect(sink.events[2]).toMatchObject({
        type: 'bulkhead.reject',
        active: 1,
        pending: 1,
      });

      gate1.resolve();
      gate2.resolve();
      await Promise.all([p1, p2]);

      // Check subsequent events
      const eventTypes = sink.events.map((e) => e.type);
      expect(eventTypes).toContain('bulkhead.complete');
      expect(eventTypes).toContain('bulkhead.execute'); // from queue
    });
  });
});
