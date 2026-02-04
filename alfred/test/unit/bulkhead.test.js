import { describe, it, expect } from 'vitest';
import { bulkhead } from '../../src/policies/bulkhead.js';
import { BulkheadRejectedError } from '../../src/errors.js';
import { defer, flush, waitFor } from '../../../test/helpers/async.js';

describe('bulkhead', () => {
  it('limits concurrent execution', async () => {
    const policy = bulkhead({ limit: 1, queueLimit: 10 });
    let active = 0;
    let maxActive = 0;

    const gate1 = defer();
    const gate2 = defer();
    const gate3 = defer();

    const task = async (gate) => {
      active++;
      maxActive = Math.max(maxActive, active);
      await gate.promise;
      active--;
    };

    const p1 = policy.execute(() => task(gate1));
    const p2 = policy.execute(() => task(gate2));
    const p3 = policy.execute(() => task(gate3));

    await flush(2);
    expect(maxActive).toBe(1);

    gate1.resolve();
    await flush(2);
    gate2.resolve();
    await flush(2);
    gate3.resolve();
    await Promise.all([p1, p2, p3]);

    expect(maxActive).toBe(1);
  });

  it('allows concurrent execution up to limit', async () => {
    const policy = bulkhead({ limit: 2, queueLimit: 10 });
    let active = 0;
    let maxActive = 0;

    const gate1 = defer();
    const gate2 = defer();
    const gate3 = defer();

    const task = async (gate) => {
      active++;
      maxActive = Math.max(maxActive, active);
      await gate.promise;
      active--;
    };

    const p1 = policy.execute(() => task(gate1));
    const p2 = policy.execute(() => task(gate2));
    const p3 = policy.execute(() => task(gate3));

    await flush(2);
    expect(maxActive).toBe(2);

    gate1.resolve();
    gate2.resolve();
    await flush(2);
    gate3.resolve();
    await Promise.all([p1, p2, p3]);

    expect(maxActive).toBe(2);
  });

  it('queues requests when limit is reached', async () => {
    const policy = bulkhead({ limit: 1, queueLimit: 2 });
    const starts = [];

    const gate1 = defer();
    const gate2 = defer();
    const gate3 = defer();

    const p1 = policy.execute(async () => {
      starts.push('first');
      await gate1.promise;
    });
    const p2 = policy.execute(async () => {
      starts.push('second');
      await gate2.promise;
    });
    const p3 = policy.execute(async () => {
      starts.push('third');
      await gate3.promise;
    });

    await flush(2);
    expect(starts).toEqual(['first']);

    gate1.resolve();
    await waitFor(() => starts.length === 2);
    expect(starts).toEqual(['first', 'second']);

    gate2.resolve();
    await waitFor(() => starts.length === 3);
    expect(starts).toEqual(['first', 'second', 'third']);

    gate3.resolve();
    await Promise.all([p1, p2, p3]);
  });

  it('rejects when queue is full', async () => {
    const policy = bulkhead({ limit: 1, queueLimit: 0 });
    const gate = defer();

    // First takes the slot
    const p1 = policy.execute(() => gate.promise);

    // Second tries to queue but can't
    const p2 = policy.execute(() => Promise.resolve());

    await expect(p2).rejects.toThrow(BulkheadRejectedError);
    gate.resolve();
    await p1;
  });

  it('reports status', () => {
    const policy = bulkhead({ limit: 2, queueLimit: 2 });
    expect(policy.stats).toEqual({ active: 0, pending: 0, available: 2 });

    const gate1 = defer();
    const gate2 = defer();
    const gate3 = defer();

    policy.execute(() => gate1.promise);
    expect(policy.stats).toEqual({ active: 1, pending: 0, available: 1 });

    policy.execute(() => gate2.promise);
    expect(policy.stats).toEqual({ active: 2, pending: 0, available: 0 });

    policy.execute(() => gate3.promise);
    expect(policy.stats).toEqual({ active: 2, pending: 1, available: 0 });

    gate1.resolve();
    gate2.resolve();
    gate3.resolve();
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
    await waitFor(() => thirdStarted);
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
    await waitFor(() => secondStarted);
    expect(secondStarted).toBe(true);

    gate2.resolve();
    await waitFor(() => thirdStarted);
    expect(thirdStarted).toBe(true);

    gate3.resolve();
    await Promise.all([p1, p2, p3]);
  });
});
