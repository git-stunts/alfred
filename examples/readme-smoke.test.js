/**
 * @fileoverview Smoke tests for README examples.
 * These tests verify that all README code snippets run without errors.
 * If this file fails, the README has copy-paste bugs.
 */

import { describe, it, expect } from 'vitest';
import {
  Policy,
  retry,
  circuitBreaker,
  bulkhead,
  timeout,
  hedge,
  compose,
  fallback,
  race,
  TestClock,
  ConsoleSink,
  InMemorySink,
  MultiSink,
  MetricsSink,
  RetryExhaustedError,
  CircuitOpenError,
  TimeoutError,
  BulkheadRejectedError,
} from '@git-stunts/alfred';

describe('README: 20-second win', () => {
  it('Policy composition example compiles and runs', async () => {
    const resilient = Policy.timeout(5_000)
      .wrap(
        Policy.retry({
          retries: 3,
          backoff: 'exponential',
          jitter: 'decorrelated',
          delay: 150,
          maxDelay: 3_000,
          shouldRetry: (err) =>
            err?.name === 'TimeoutError' || err?.code === 'ECONNRESET' || err?.code === 'ETIMEDOUT',
        })
      )
      .wrap(
        Policy.circuitBreaker({
          threshold: 5,
          duration: 60_000,
        })
      )
      .wrap(Policy.bulkhead({ limit: 10, queueLimit: 20 }));

    // Execute with a mock operation
    const data = await resilient.execute(async () => {
      return { success: true };
    });

    expect(data).toEqual({ success: true });
  });
});

describe('README: Quick start (functional helpers)', () => {
  it('1) simple retry with exponential backoff', async () => {
    const clock = new TestClock();
    let attempts = 0;

    const promise = retry(
      () => {
        attempts++;
        if (attempts < 2) {
          throw new Error('fail');
        }
        return Promise.resolve({ data: 'success' });
      },
      {
        retries: 3,
        backoff: 'exponential',
        delay: 100,
        clock,
      }
    );

    // First attempt fails immediately
    await clock.tick(0);
    expect(attempts).toBe(1);

    // Advance time and tick to process the scheduled retry
    await clock.advance(100);
    await clock.tick(0);
    expect(attempts).toBe(2);

    const data = await promise;
    expect(data).toEqual({ data: 'success' });
  });

  it('2) circuit breaker fail fast', async () => {
    const breaker = circuitBreaker({ threshold: 5, duration: 60_000 });
    const result = await breaker.execute(() => Promise.resolve('ok'));
    expect(result).toBe('ok');
  });

  it('3) bulkhead limit concurrent executions', async () => {
    const limiter = bulkhead({ limit: 10, queueLimit: 20 });
    const result = await limiter.execute(() => Promise.resolve('limited'));
    expect(result).toBe('limited');
  });

  it('4) timeout prevent hanging', async () => {
    const result = await timeout(5_000, () => Promise.resolve('fast'));
    expect(result).toBe('fast');
  });
});

describe('README: Policy Algebra', () => {
  it('Example 1: Production Stack', async () => {
    const resilient = Policy.timeout(5_000)
      .wrap(
        Policy.retry({
          retries: 3,
          backoff: 'exponential',
          jitter: 'decorrelated',
          delay: 100,
        })
      )
      .wrap(
        Policy.circuitBreaker({
          threshold: 5,
          duration: 30_000,
        })
      )
      .wrap(Policy.bulkhead({ limit: 10, queueLimit: 20 }));

    const result = await resilient.execute(() => Promise.resolve('success'));
    expect(result).toBe('success');
  });

  it('Example 2: Fast/Slow Fallback', async () => {
    const fast = Policy.timeout(500);
    const slow = Policy.timeout(5_000).wrap(
      Policy.retry({ retries: 3, backoff: 'exponential', delay: 200 })
    );
    const resilient = fast.or(slow);

    const result = await resilient.execute(() => Promise.resolve('fast'));
    expect(result).toBe('fast');
  });

  it('Example 3: Hedged Requests', async () => {
    const hedged = Policy.hedge({ delay: 100, maxHedges: 2 });
    const safe = hedged.wrap(Policy.bulkhead({ limit: 5 }));

    const result = await safe.execute((_signal) => Promise.resolve('hedged'));
    expect(result).toBe('hedged');
  });

  it('Fluent vs Functional equivalence', async () => {
    const policy1 = Policy.timeout(5_000)
      .wrap(Policy.retry({ retries: 3 }))
      .wrap(Policy.circuitBreaker({ threshold: 5, duration: 60_000 }));

    const policy2 = compose(
      Policy.timeout(5_000),
      Policy.retry({ retries: 3 }),
      circuitBreaker({ threshold: 5, duration: 60_000 })
    );

    const result1 = await policy1.execute(() => Promise.resolve('fluent'));
    const result2 = await policy2.execute(() => Promise.resolve('functional'));

    expect(result1).toBe('fluent');
    expect(result2).toBe('functional');
  });
});

describe('README: compose(...policies)', () => {
  it('compose multiple policies', async () => {
    const resilient = compose(
      Policy.timeout(30_000),
      Policy.retry({ retries: 3, backoff: 'exponential' }),
      circuitBreaker({ threshold: 5, duration: 60_000 }),
      bulkhead({ limit: 5, queueLimit: 10 })
    );

    const result = await resilient.execute(() => Promise.resolve('composed'));
    expect(result).toBe('composed');
  });
});

describe('README: fallback(primary, secondary)', () => {
  it('fallback example', async () => {
    const withFallback = fallback(
      Policy.retry({ retries: 3 }),
      circuitBreaker({ threshold: 5, duration: 60_000 })
    );

    const result = await withFallback.execute(() => Promise.resolve('primary'));
    expect(result).toBe('primary');
  });
});

describe('README: race(primary, secondary)', () => {
  it('race example', async () => {
    const racing = race(Policy.timeout(1_000), Policy.timeout(2_000));

    const result = await racing.execute(() => Promise.resolve('winner'));
    expect(result).toBe('winner');
  });
});

describe('README: Telemetry & Observability', () => {
  it('MultiSink example', async () => {
    const inMemory = new InMemorySink();
    const sink = new MultiSink([new ConsoleSink(), inMemory]);

    await Policy.retry({
      retries: 3,
      telemetry: sink,
    }).execute(() => Promise.resolve('ok'));

    expect(inMemory.events.length).toBeGreaterThan(0);
  });

  it('MetricsSink example', async () => {
    const metrics = new MetricsSink();

    const policy = Policy.retry({ retries: 3, telemetry: metrics }).wrap(
      Policy.circuitBreaker({ threshold: 5, duration: 60_000, telemetry: metrics })
    );

    await policy.execute(() => Promise.resolve('ok'));

    expect(metrics.stats).toBeDefined();
    expect(metrics.stats.successes).toBeGreaterThanOrEqual(1);
  });
});

describe('README: Testing with TestClock', () => {
  it('retries with exponential backoff using TestClock', async () => {
    const clock = new TestClock();
    let attempts = 0;

    const operation = async () => {
      attempts++;
      if (attempts < 3) {
        throw new Error('fail');
      }
      return 'success';
    };

    const promise = retry(operation, {
      retries: 3,
      backoff: 'exponential',
      delay: 1_000,
      clock,
    });

    await clock.tick(0);
    expect(attempts).toBe(1);

    await clock.advance(1_000);
    await clock.tick(0);
    expect(attempts).toBe(2);

    await clock.advance(2_000);
    await clock.tick(0);
    expect(attempts).toBe(3);

    expect(await promise).toBe('success');
  });

  it('timeout triggers after virtual time', async () => {
    const clock = new TestClock();

    const slowOp = () => clock.sleep(10_000).then(() => 'done');
    const promise = timeout(5_000, slowOp, { clock });

    await clock.advance(5_000);

    await expect(promise).rejects.toThrow(TimeoutError);
  });
});

describe('README: Error Types', () => {
  it('RetryExhaustedError has correct properties', async () => {
    const clock = new TestClock();

    const promise = retry(
      () => {
        throw new Error('always fails');
      },
      { retries: 2, delay: 10, clock }
    );

    // First attempt
    await clock.tick(0);
    // First retry
    await clock.advance(10);
    await clock.tick(0);
    // Second retry
    await clock.advance(10);
    await clock.tick(0);

    try {
      await promise;
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(RetryExhaustedError);
      expect(err.attempts).toBe(3); // 1 initial + 2 retries
      expect(err.cause.message).toBe('always fails');
    }
  });

  it('CircuitOpenError has correct properties', async () => {
    const breaker = circuitBreaker({ threshold: 2, duration: 60_000 });

    // Trip the circuit
    for (let i = 0; i < 2; i++) {
      try {
        await breaker.execute(() => {
          throw new Error('fail');
        });
      } catch {
        // expected
      }
    }

    try {
      await breaker.execute(() => Promise.resolve('ok'));
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(CircuitOpenError);
      expect(err.openedAt).toBeInstanceOf(Date);
      expect(err.failureCount).toBe(2);
    }
  });

  it('BulkheadRejectedError has correct properties', async () => {
    const limiter = bulkhead({ limit: 1, queueLimit: 0 });

    // Fill the bulkhead (intentionally not awaited)
    void limiter.execute(() => new Promise((resolve) => setTimeout(resolve, 1000)));

    try {
      await limiter.execute(() => Promise.resolve('ok'));
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(BulkheadRejectedError);
      expect(err.limit).toBe(1);
      expect(err.queueLimit).toBe(0);
    }
  });
});

describe('README: Hedge policy', () => {
  it('hedge example compiles and runs', async () => {
    const hedger = hedge({
      delay: 100,
      maxHedges: 2,
    });

    const result = await hedger.execute(() => Promise.resolve('fast'));
    expect(result).toBe('fast');
  });
});

describe('README: Policy fluent API', () => {
  it('wrap composition', async () => {
    const telemetry = new ConsoleSink();

    const resilient = Policy.timeout(30_000)
      .wrap(Policy.retry({ retries: 3, backoff: 'exponential', telemetry }))
      .wrap(Policy.circuitBreaker({ threshold: 5, duration: 60_000, telemetry }))
      .wrap(Policy.bulkhead({ limit: 5, queueLimit: 10, telemetry }));

    const result = await resilient.execute(() => Promise.resolve('ok'));
    expect(result).toBe('ok');
  });

  it('fallback with .or()', async () => {
    const withFallback = Policy.retry({ retries: 2 }).or(Policy.noop());

    const result = await withFallback.execute(() => Promise.resolve('ok'));
    expect(result).toBe('ok');
  });

  it('race with .race()', async () => {
    const racing = Policy.timeout(1_000).race(Policy.timeout(2_000));

    const result = await racing.execute(() => Promise.resolve('ok'));
    expect(result).toBe('ok');
  });
});
