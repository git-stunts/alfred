import { describe, it, expect } from 'vitest';
import { ConfigRegistry, ControlPlane, ErrorCode, LivePolicyPlan } from '../../src/index.js';
import { defer, flush } from '../../../test/helpers/async.js';

describe('ControlPlane.registerLivePolicy', () => {
  it('applies live bulkhead limits without canceling in-flight work', async () => {
    const registry = new ConfigRegistry();
    const controlPlane = new ControlPlane(registry);
    const livePlan = LivePolicyPlan.bulkhead('bulkhead', { limit: 2, queueLimit: 5 });
    const result = controlPlane.registerLivePolicy(livePlan, 'service/api');
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    const { policy } = result.data;
    expect(result.data.paths).toEqual(['service/api/bulkhead']);

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

    registry.write('service/api/bulkhead/limit', '1');

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
    const results = await Promise.all([p1, p2, p3]);
    for (const result of results) {
      expect(result.ok).toBe(true);
    }
  });

  it('uses latest retry config per execute', async () => {
    const registry = new ConfigRegistry();
    const controlPlane = new ControlPlane(registry);
    const livePlan = LivePolicyPlan.retry('retry', {
      retries: 1,
      delay: 0,
      maxDelay: 0,
      backoff: 'constant',
      jitter: 'none',
    });
    const result = controlPlane.registerLivePolicy(livePlan, 'service/api');
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    const { policy } = result.data;

    let attempts = 0;
    const fail = async () => {
      attempts += 1;
      throw new Error('fail');
    };

    const firstResult = await policy.execute(fail);
    expect(firstResult.ok).toBe(false);
    expect(attempts).toBe(2);

    registry.write('service/api/retry/retries', '3');
    attempts = 0;

    const secondResult = await policy.execute(fail);
    expect(secondResult.ok).toBe(false);
    expect(attempts).toBe(4);
  });

  it('returns a Result when policy construction fails', () => {
    const registry = new ConfigRegistry();
    const controlPlane = new ControlPlane(registry);
    const livePlan = LivePolicyPlan.static({ not: 'a policy' });

    const result = controlPlane.registerLivePolicy(livePlan, 'service/api');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(ErrorCode.INTERNAL_ERROR);
    }
  });

  it('returns a Result when registry reads fail during execution', async () => {
    const registry = {
      read: () => ({
        ok: false,
        error: {
          code: ErrorCode.NOT_FOUND,
          message: 'Path not found.',
          details: { path: 'service/api/bulkhead/limit' },
        },
      }),
      register: (path) => ({ ok: true, data: { path } }),
    };
    const controlPlane = new ControlPlane(registry);
    const livePlan = LivePolicyPlan.bulkhead('bulkhead', { limit: 1, queueLimit: 0 });

    const result = controlPlane.registerLivePolicy(livePlan, 'service/api');
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    const executeResult = await result.data.policy.execute(async () => 'ok');
    expect(executeResult.ok).toBe(false);
    if (!executeResult.ok) {
      expect(executeResult.error.code).toBe(ErrorCode.NOT_FOUND);
    }
  });
});
