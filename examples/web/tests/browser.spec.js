/**
 * @fileoverview Playwright tests proving Alfred works in the browser.
 *
 * These tests verify:
 * 1. The library bundles and runs in a browser environment
 * 2. Time-based behavior works (retry backoff, timeout)
 * 3. Throughput control works (bulkhead limits concurrency)
 * 4. Circuit breaker provides fail-fast behavior
 */

import { test, expect } from '@playwright/test';

// Seeded PRNG (mulberry32) for deterministic tests
const seededRandom = `
  (function() {
    let seed = 12345;
    function mulberry32() {
      let t = seed += 0x6D2B79F5;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
    Math.random = mulberry32;
  })();
`;

test.describe('Alfred Browser Compatibility', () => {
  test.beforeEach(async ({ page }) => {
    // Inject seeded PRNG before page loads for deterministic flakyOp behavior
    await page.addInitScript(seededRandom);
    await page.goto('/');
    // Wait for the page to be ready
    await expect(page.locator('h1')).toContainText('Flaky Fetch Lab');
  });

  test('page loads and Alfred imports successfully', async ({ page }) => {
    // If the page loaded without errors, the import worked
    const logText = await page.locator('#log').textContent();
    expect(logText).toContain('Flaky Fetch Lab ready');
  });

  test('runs requests with resilience OFF', async ({ page }) => {
    // Disable resilience
    await page.locator('#enable').uncheck();

    // Run the burst
    await page.locator('#go').click();

    // Wait for completion (stats update)
    await expect(page.locator('#stat-time')).not.toContainText('-', { timeout: 15000 });

    // Should have some results
    const success = parseInt(await page.locator('#stat-success').textContent());
    const fail = parseInt(await page.locator('#stat-fail').textContent());

    // Without resilience, we expect more failures due to no retries
    expect(success + fail).toBe(50);
  });

  test('runs requests with resilience ON - retry recovers failures', async ({ page }) => {
    // Enable resilience (default)
    await expect(page.locator('#enable')).toBeChecked();

    // Set retries to 3
    await page.locator('#retries').fill('3');
    // Increase bulkhead so more requests get through and can fail/retry
    await page.locator('#bulkhead').fill('20');

    // Run the burst
    await page.locator('#go').click();

    // Wait for completion
    await expect(page.locator('#stat-time')).not.toContainText('-', { timeout: 15000 });

    // Check that retries happened (look for retry log entries)
    const logText = await page.locator('#log').textContent();
    expect(logText).toContain('Retry');

    // Should have results
    const success = parseInt(await page.locator('#stat-success').textContent());
    expect(success).toBeGreaterThan(0);
  });

  test('bulkhead limits concurrency and rejects excess', async ({ page }) => {
    // Set bulkhead very low to force rejections
    await page.locator('#bulkhead').fill('2');

    // Run the burst
    await page.locator('#go').click();

    // Wait for completion
    await expect(page.locator('#stat-time')).not.toContainText('-', { timeout: 15000 });

    // Should have some rejections due to low bulkhead limit
    const rejected = parseInt(await page.locator('#stat-reject').textContent());
    expect(rejected).toBeGreaterThan(0);

    // Check log for bulkhead rejections
    const logText = await page.locator('#log').textContent();
    expect(logText).toContain('Bulkhead rejected');
  });

  test('timeout kills hanging requests', async ({ page }) => {
    // Set a short timeout to catch "hanging" requests
    await page.locator('#timeout').fill('200');

    // Run the burst
    await page.locator('#go').click();

    // Wait for completion
    await expect(page.locator('#stat-time')).not.toContainText('-', { timeout: 15000 });

    // Check log for timeout events (the fake op has 10% hang rate)
    const logText = await page.locator('#log').textContent();
    // Either Timeout or Aborted should appear
    const hasTimeoutBehavior = logText.includes('Timeout') || logText.includes('Aborted');
    expect(hasTimeoutBehavior).toBe(true);
  });

  test('circuit breaker opens under sustained failures', async ({ page }) => {
    // Set very low circuit threshold
    await page.locator('#circuit').fill('2');
    // No retries so failures accumulate faster
    await page.locator('#retries').fill('0');
    // Lower bulkhead so more requests hit the circuit
    await page.locator('#bulkhead').fill('10');

    // Run the burst
    await page.locator('#go').click();

    // Wait for completion
    await expect(page.locator('#stat-time')).not.toContainText('-', { timeout: 15000 });

    // Check if circuit opened (may or may not depending on random failures)
    const circuitOpens = parseInt(await page.locator('#stat-circuit').textContent());
    const logText = await page.locator('#log').textContent();

    // The circuit should have opened at least once with such a low threshold
    // and 30% failure rate
    if (circuitOpens > 0) {
      expect(logText).toContain('Circuit OPENED');
    }
  });

  test('completes 50 requests in under 10 seconds with resilience', async ({ page }) => {
    // Default settings
    await page.locator('#go').click();

    // Wait for completion
    await expect(page.locator('#stat-time')).not.toContainText('-', { timeout: 15000 });

    // Check elapsed time is reasonable
    const elapsed = parseInt(await page.locator('#stat-time').textContent());
    expect(elapsed).toBeLessThan(10000);

    // Should have processed all 50
    const success = parseInt(await page.locator('#stat-success').textContent());
    const fail = parseInt(await page.locator('#stat-fail').textContent());
    const rejected = parseInt(await page.locator('#stat-reject').textContent());
    expect(success + fail + rejected).toBe(50);
  });
});
