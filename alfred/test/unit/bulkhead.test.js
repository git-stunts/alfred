import { describe, it, expect } from 'vitest';
import { bulkhead } from '../../src/policies/bulkhead.js';
import { BulkheadRejectedError } from '../../src/errors.js';
import { defer, flush } from '../../../test/helpers/async.js';

describe('bulkhead', () => {
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  it('limits concurrent execution', async () => {
    const policy = bulkhead({ limit: 1, queueLimit: 10 });
    let active = 0;
    let maxActive = 0;

    const task = async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await delay(20);
      active--;
    };

    await Promise.all([policy.execute(task), policy.execute(task), policy.execute(task)]);

    expect(maxActive).toBe(1);
  });

  it('allows concurrent execution up to limit', async () => {
    const policy = bulkhead({ limit: 2, queueLimit: 10 });
    let active = 0;
    let maxActive = 0;

    const task = async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await delay(20);
      active--;
    };

    await Promise.all([policy.execute(task), policy.execute(task), policy.execute(task)]);

    expect(maxActive).toBe(2);
  });

  it('queues requests when limit is reached', async () => {
    const policy = bulkhead({ limit: 1, queueLimit: 2 });
    const start = Date.now();
    const timestamps = [];

    const task = async () => {
      timestamps.push(Date.now() - start);
      await delay(50);
    };

    await Promise.all([policy.execute(task), policy.execute(task), policy.execute(task)]);

    // First starts immediately (0-10ms)
    // Second waits 50ms
    // Third waits 100ms
    expect(timestamps[0]).toBeLessThan(20);
    expect(timestamps[1]).toBeGreaterThan(40);
    expect(timestamps[2]).toBeGreaterThan(90);
  });

  it('rejects when queue is full', async () => {
    const policy = bulkhead({ limit: 1, queueLimit: 0 });

    // First takes the slot
    const p1 = policy.execute(() => delay(50));

    // Second tries to queue but can't
    const p2 = policy.execute(() => delay(50));

    await expect(p2).rejects.toThrow(BulkheadRejectedError);
    await p1;
  });

  it('reports status', () => {
    const policy = bulkhead({ limit: 2, queueLimit: 2 });
    expect(policy.stats).toEqual({ active: 0, pending: 0, available: 2 });

    policy.execute(() => delay(50));
    expect(policy.stats).toEqual({ active: 1, pending: 0, available: 1 });

    policy.execute(() => delay(50));
    expect(policy.stats).toEqual({ active: 2, pending: 0, available: 0 });

    policy.execute(() => delay(50));
    expect(policy.stats).toEqual({ active: 2, pending: 1, available: 0 });
  });

  it('soft-shrinks without canceling in-flight work', async () => {
    let limit = 2;
    const policy = bulkhead({ limit: () => limit, queueLimit: 5 });

    const gate1 = defer();
    const gate2 = defer();
    const gate3 = defer();
    let thirdStarted = false;

    const p1 = policy.execute(async () => {
      await gate1.promise;
    });
    const p2 = policy.execute(async () => {
      await gate2.promise;
    });

    limit = 1;

    const p3 = policy.execute(async () => {
      thirdStarted = true;
      await gate3.promise;
    });

    await flush();
    expect(thirdStarted).toBe(false);

    gate1.resolve();
    await flush();
    expect(thirdStarted).toBe(false);

    gate2.resolve();
    await flush();
    expect(thirdStarted).toBe(true);

    gate3.resolve();
    await Promise.all([p1, p2, p3]);
  });

  it('applies queue limit updates only to new enqueues', async () => {
    const limit = 1;
    let queueLimit = 2;
    const policy = bulkhead({ limit: () => limit, queueLimit: () => queueLimit });

    const gate1 = defer();
    const gate2 = defer();
    const gate3 = defer();
    let secondStarted = false;
    let thirdStarted = false;

    const p1 = policy.execute(async () => {
      await gate1.promise;
    });
    const p2 = policy.execute(async () => {
      secondStarted = true;
      await gate2.promise;
    });
    const p3 = policy.execute(async () => {
      thirdStarted = true;
      await gate3.promise;
    });

    queueLimit = 0;

    await expect(policy.execute(async () => {})).rejects.toThrow(BulkheadRejectedError);

    gate1.resolve();
    await flush();
    expect(secondStarted).toBe(true);

    gate2.resolve();
    await flush();
    expect(thirdStarted).toBe(true);

    gate3.resolve();
    await Promise.all([p1, p2, p3]);
  });
});
