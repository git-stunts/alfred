import { describe, it, expect } from 'vitest';
import { ConfigRegistry, Policy } from '../../src/index.js';

describe('Policy.live*', () => {
  it('applies live bulkhead limits without canceling in-flight work', async () => {
    const registry = new ConfigRegistry();
    const policy = Policy.liveBulkhead('bulkhead/api', registry, {
      limit: 2,
      queueLimit: 5,
    });

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

    registry.write('bulkhead/api/limit', '1');

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

  it('uses latest retry config per execute', async () => {
    const registry = new ConfigRegistry();
    const policy = Policy.liveRetry('retry/api', registry, {
      retries: 1,
      delay: 0,
      maxDelay: 0,
      backoff: 'constant',
      jitter: 'none',
    });

    let attempts = 0;
    const fail = async () => {
      attempts += 1;
      throw new Error('fail');
    };

    await expect(policy.execute(fail)).rejects.toThrow('fail');
    expect(attempts).toBe(2);

    registry.write('retry/api/retries', '3');
    attempts = 0;

    await expect(policy.execute(fail)).rejects.toThrow('fail');
    expect(attempts).toBe(4);
  });
});

function defer() {
  let resolve;
  const promise = new Promise((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function flush() {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}
