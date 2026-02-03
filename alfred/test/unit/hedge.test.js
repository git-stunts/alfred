import { describe, it, expect, vi } from 'vitest';
import { hedge } from '../../src/policies/hedge.js';
import { TestClock } from '../../src/utils/clock.js';
import { InMemorySink } from '../../src/telemetry.js';

describe('Hedge Policy', () => {
  it('returns result from primary if fast enough', async () => {
    const fn = vi.fn().mockResolvedValue('primary');
    const clock = new TestClock();

    // Hedge after 100ms
    const policy = hedge({ delay: 100, clock });

    const result = await policy.execute(fn);

    expect(result).toBe('primary');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('spawns hedge if primary is slow', async () => {
    const clock = new TestClock();

    // We can't easily simulate "slow" vs "fast" using native timers mixed with TestClock
    // because TestClock freezes the world for the Policy but not for the native Promises.

    // Better approach: Use manual resolvers.

    const primaryPromise = new Promise(() => {});

    let hedgeResolve;
    const hedgePromise = new Promise((r) => (hedgeResolve = r));

    const fnPromises = [primaryPromise, hedgePromise];

    let callCount = 0;
    const task = vi.fn().mockImplementation(() => {
      return fnPromises[callCount++] || Promise.resolve('extra');
    });

    const policy = hedge({ delay: 100, clock });
    const resultPromise = policy.execute(task);

    // Initial state: primary started
    expect(task).toHaveBeenCalledTimes(1);

    // Advance time to trigger hedge
    await clock.advance(100);
    // Hedge should have started
    // We need to yield to microtasks
    for (let i = 0; i < 20; i++) await Promise.resolve();

    expect(task).toHaveBeenCalledTimes(2);

    // Resolve hedge first
    hedgeResolve('hedge-win');

    const result = await resultPromise;
    expect(result).toBe('hedge-win');
  });

  it('cancels pending attempts on success', async () => {
    const clock = new TestClock();
    const aborts = [];
    let resolveFirst;

    const fn = vi.fn().mockImplementation((signal) => {
      signal.addEventListener('abort', () => aborts.push(true));
      if (!resolveFirst) {
        return new Promise((r) => {
          resolveFirst = r;
        });
      }
      return new Promise(() => {}); // Hedge hangs
    });

    const policy = hedge({ delay: 10, clock });
    const p = policy.execute(fn);

    // Trigger hedge
    await clock.advance(10);
    for (let i = 0; i < 20; i++) await Promise.resolve();

    // Now resolve the first one
    resolveFirst('success');
    await p;

    // Expect the hedge to be aborted
    expect(aborts.length).toBeGreaterThan(0);
  });

  it('emits telemetry', async () => {
    const clock = new TestClock();
    const sink = new InMemorySink();

    const fn = vi
      .fn()
      .mockImplementationOnce(() => new Promise(() => {})) // Hangs
      .mockResolvedValue('success'); // Hedge succeeds

    const policy = hedge({ delay: 10, clock, telemetry: sink });
    const resultPromise = policy.execute(fn);

    await clock.advance(10);
    for (let i = 0; i < 20; i++) await Promise.resolve();

    await resultPromise;

    const types = sink.events.map((e) => e.type);
    const attemptCount = types.filter((t) => t === 'hedge.attempt').length;
    expect(attemptCount).toBe(2); // primary + hedge
    expect(types).toContain('hedge.success');
  });
});
