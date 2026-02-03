/**
 * Cloudflare Worker demonstrating Alfred resilience policies.
 *
 * Proves that retry, timeout, bulkhead, and circuit breaker
 * all work in the Cloudflare Workers V8 isolate runtime.
 */

import { Policy, TimeoutError, BulkheadRejectedError, CircuitOpenError } from './src/index.js';

// Simulated flaky operation
async function flakyFetch(shouldFail = false, delayMs = 10) {
  await new Promise((r) => setTimeout(r, delayMs));
  if (shouldFail) {
    throw new Error('ECONNRESET');
  }
  return { ok: true };
}

// Build a resilience policy stack
function buildPolicy() {
  return Policy.bulkhead({ limit: 5, queueLimit: 0 })
    .wrap(Policy.circuitBreaker({ threshold: 3, duration: 5000 }))
    .wrap(Policy.timeout(100))
    .wrap(Policy.retry({ retries: 2, delay: 10, backoff: 'exponential' }));
}

export default {
  async fetch() {
    const results = {
      runtime: 'Cloudflare Workers',
      tests: [],
    };

    // Test 1: Basic retry success
    try {
      const policy = Policy.retry({ retries: 3, delay: 5 });
      let attempts = 0;
      await policy.execute(async () => {
        attempts++;
        if (attempts < 2) {
          throw new Error('transient');
        }
        return 'ok';
      });
      results.tests.push({ name: 'retry-success', passed: true, attempts });
    } catch (e) {
      results.tests.push({ name: 'retry-success', passed: false, error: e.message });
    }

    // Test 2: Timeout fires
    try {
      const policy = Policy.timeout(20);
      await policy.execute(async () => {
        await new Promise((r) => setTimeout(r, 100));
        return 'too slow';
      });
      results.tests.push({ name: 'timeout-fires', passed: false, error: 'should have timed out' });
    } catch (e) {
      results.tests.push({
        name: 'timeout-fires',
        passed: e instanceof TimeoutError,
        errorType: e.constructor.name,
      });
    }

    // Test 3: Bulkhead rejects overflow
    try {
      const policy = Policy.bulkhead({ limit: 1, queueLimit: 0 });
      const slow = policy.execute(() => new Promise((r) => setTimeout(r, 50)));
      // Second call should be rejected immediately
      try {
        await policy.execute(() => Promise.resolve('overflow'));
        results.tests.push({
          name: 'bulkhead-rejects',
          passed: false,
          error: 'should have rejected',
        });
      } catch (e) {
        results.tests.push({
          name: 'bulkhead-rejects',
          passed: e instanceof BulkheadRejectedError,
          errorType: e.constructor.name,
        });
      }
      await slow;
    } catch (e) {
      results.tests.push({ name: 'bulkhead-rejects', passed: false, error: e.message });
    }

    // Test 4: Circuit breaker opens
    try {
      const policy = Policy.circuitBreaker({ threshold: 2, duration: 5000 });
      // Trip the circuit
      for (let i = 0; i < 2; i++) {
        try {
          await policy.execute(() => Promise.reject(new Error('fail')));
        } catch {
          // expected
        }
      }
      // Next call should be rejected by open circuit
      try {
        await policy.execute(() => Promise.resolve('should not run'));
        results.tests.push({ name: 'circuit-opens', passed: false, error: 'should have rejected' });
      } catch (e) {
        results.tests.push({
          name: 'circuit-opens',
          passed: e instanceof CircuitOpenError,
          errorType: e.constructor.name,
        });
      }
    } catch (e) {
      results.tests.push({ name: 'circuit-opens', passed: false, error: e.message });
    }

    // Test 5: Full policy stack
    try {
      const policy = buildPolicy();
      const result = await policy.execute(() => flakyFetch(false, 5));
      results.tests.push({ name: 'full-stack', passed: result.ok === true });
    } catch (e) {
      results.tests.push({ name: 'full-stack', passed: false, error: e.message });
    }

    // Summary
    const passed = results.tests.filter((t) => t.passed).length;
    const total = results.tests.length;
    results.summary = `${passed}/${total} tests passed`;
    results.allPassed = passed === total;

    return new Response(JSON.stringify(results, null, 2), {
      headers: { 'Content-Type': 'application/json' },
    });
  },
};
