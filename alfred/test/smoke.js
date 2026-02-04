import { retry, circuitBreaker, timeout, Policy } from '../src/index.js';
import { TestClock } from '../src/utils/clock.js';

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
  const clock = new TestClock();

  // 1. Test Retry
  let attempts = 0;
  try {
    const resultPromise = retry(
      async () => {
        attempts++;
        if (attempts < 3) throw new Error('fail');
        return 'success';
      },
      { retries: 3, delay: 10, clock }
    ); // Short delay for test
    await clock.advance(10);
    await clock.advance(10);
    const result = await resultPromise;
    assert(result === 'success', 'Retry result match');
    assert(attempts === 3, `Retry attempts (${attempts})`);
  } catch (e) {
    console.error(e);
    assert(false, 'Retry threw unexpected error');
  }

  // 2. Test Circuit Breaker
  const breaker = circuitBreaker({ threshold: 2, duration: 100, clock });
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
    const timeoutPromise = timeout(50, () => clock.sleep(100), { clock });
    await clock.advance(50);
    await timeoutPromise;
    assert(false, 'Timeout should have thrown');
  } catch (e) {
    assert(e.name === 'TimeoutError', 'Timeout threw TimeoutError');
  }

  // 4. Test Composition
  const policy = Policy.retry({ retries: 1, delay: 10, clock }).wrap(
    Policy.timeout(100, { clock })
  );

  const compResult = await policy.execute(() => Promise.resolve('composed'));
  assert(compResult === 'composed', 'Composition works');
  await clock.advance(100);

  log('All smoke tests passed! 🚀');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
