import { retry, circuitBreaker, timeout, Policy } from '../src/index.js';

const log = (msg) => console.log(`[SMOKE] ${msg}`);
const assert = (condition, msg) => {
  if (!condition) {
    console.error(`❌ FAIL: ${msg}`);
    process.exit(1);
  }
  log(`✅ PASS: ${msg}`);
};

async function main() {
  log('Starting platform smoke test...');

  // 1. Test Retry
  let attempts = 0;
  try {
    const result = await retry(
      async () => {
        attempts++;
        if (attempts < 3) throw new Error('fail');
        return 'success';
      },
      { retries: 3, delay: 10 }
    ); // Short delay for test
    assert(result === 'success', 'Retry result match');
    assert(attempts === 3, `Retry attempts (${attempts})`);
  } catch (e) {
    console.error(e);
    assert(false, 'Retry threw unexpected error');
  }

  // 2. Test Circuit Breaker
  const breaker = circuitBreaker({ threshold: 2, duration: 100 });
  try {
    await breaker.execute(() => Promise.reject(new Error('fail')));
    assert(false, 'Breaker should have thrown');
  } catch {
    // Expected
  }

  try {
    await breaker.execute(() => Promise.reject(new Error('fail')));
    assert(false, 'Breaker should have thrown');
  } catch {
    // Expected
  }

  try {
    await breaker.execute(() => Promise.resolve('ok'));
    assert(false, 'Breaker should be open');
  } catch (e) {
    assert(e.name === 'CircuitOpenError', 'Breaker is open');
  }

  // 3. Test Timeout
  try {
    await timeout(50, () => new Promise((resolve) => setTimeout(resolve, 100)));
    assert(false, 'Timeout should have thrown');
  } catch (e) {
    assert(e.name === 'TimeoutError', 'Timeout threw TimeoutError');
  }

  // 4. Test Composition
  const policy = Policy.retry({ retries: 1, delay: 10 }).wrap(Policy.timeout(100));

  const compResult = await policy.execute(() => Promise.resolve('composed'));
  assert(compResult === 'composed', 'Composition works');

  log('All smoke tests passed! 🚀');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
