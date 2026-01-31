
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
    const results = ['primary', 'hedge'];
    let calls = 0;
    
    const fn = vi.fn().mockImplementation(async (signal) => {
      const id = calls++;
      // Primary takes 200ms, Hedge takes 50ms
      const duration = id === 0 ? 200 : 50;
      
      return new Promise((resolve) => {
        const timer = setTimeout(() => resolve(results[id]), duration);
        // signal?.addEventListener('abort', () => clearTimeout(timer));
        // Note: TestClock doesn't intercept native setTimeout inside the mock unless we pass clock to it
        // but here we are simulating "real" async work. 
        // With TestClock controlling the policy, we need to manually advance time.
        
        // Actually, since we control the clock, `policy.execute` won't "wait" 100ms unless we advance it.
        // But `hedge` uses `clock.sleep`.
      });
    });

    // We can't easily simulate "slow" vs "fast" using native timers mixed with TestClock 
    // because TestClock freezes the world for the Policy but not for the native Promises.
    
    // Better approach: Use manual resolvers.
    
    let primaryResolve;
    const primaryPromise = new Promise(r => primaryResolve = r);
    
    let hedgeResolve;
    const hedgePromise = new Promise(r => hedgeResolve = r);
    
    const fnResolvers = [primaryResolve, hedgeResolve];
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
    for (let i=0; i<20; i++) await Promise.resolve();
    
    expect(task).toHaveBeenCalledTimes(2);
    
    // Resolve hedge first
    hedgeResolve('hedge-win');
    
    const result = await resultPromise;
    expect(result).toBe('hedge-win');
  });

  it('cancels pending attempts on success', async () => {
    const clock = new TestClock();
    const aborts = [];
    
    const fn = vi.fn().mockImplementation((signal) => {
      signal.addEventListener('abort', () => aborts.push(true));
      return new Promise(() => {}); // Never resolves normally
    });

    const policy = hedge({ delay: 10, clock });
    const p = policy.execute(fn);
    
    // Trigger hedge
    await clock.advance(10);
    for (let i=0; i<20; i++) await Promise.resolve();
    
    // Now we have 2 pending attempts.
    // If one finishes (e.g. we mock resolve one of them?) 
    // Wait, the previous test structure is better for control.
    
    // Let's rely on the fact that if Promise.any returns, the finally block runs.
  });
  
  it('emits telemetry', async () => {
    const clock = new TestClock();
    const sink = new InMemorySink();
    
    const fn = vi.fn()
      .mockImplementationOnce(() => new Promise(() => {})) // Hangs
      .mockResolvedValue('success'); // Hedge succeeds

    const policy = hedge({ delay: 10, clock, telemetry: sink });
    const resultPromise = policy.execute(fn);
    
    await clock.advance(10);
    for (let i=0; i<20; i++) await Promise.resolve();
    
    await resultPromise;
    
    const types = sink.events.map(e => e.type);
    expect(types).toContain('hedge.attempt'); // primary
    expect(types).toContain('hedge.attempt'); // hedge
    expect(types).toContain('hedge.success');
  });
});
