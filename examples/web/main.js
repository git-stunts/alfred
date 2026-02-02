/**
 * Flaky Fetch Lab - Browser demo for @git-stunts/alfred
 *
 * Demonstrates that resilience policies work in the browser:
 * - Retry with exponential backoff + decorrelated jitter
 * - Timeout to kill hanging requests
 * - Bulkhead for concurrency control
 * - Circuit breaker for fail-fast behavior
 */

import {
  Policy,
  BulkheadRejectedError,
  CircuitOpenError,
  TimeoutError,
  RetryExhaustedError,
} from '../../src/index.js';

// DOM elements
const logEl = document.querySelector('#log');
const goBtn = document.querySelector('#go');
const clearBtn = document.querySelector('#clear');

const retriesSlider = document.querySelector('#retries');
const bulkheadSlider = document.querySelector('#bulkhead');
const timeoutSlider = document.querySelector('#timeout');
const circuitSlider = document.querySelector('#circuit');
const enableCheckbox = document.querySelector('#enable');

// Stats elements
const statSuccess = document.querySelector('#stat-success');
const statFail = document.querySelector('#stat-fail');
const statReject = document.querySelector('#stat-reject');
const statCircuit = document.querySelector('#stat-circuit');
const statTime = document.querySelector('#stat-time');

// Update slider display values
function setupSlider(slider, display) {
  const update = () => (display.textContent = slider.value);
  slider.addEventListener('input', update);
  update();
}

setupSlider(retriesSlider, document.querySelector('#retries-val'));
setupSlider(bulkheadSlider, document.querySelector('#bulkhead-val'));
setupSlider(timeoutSlider, document.querySelector('#timeout-val'));
setupSlider(circuitSlider, document.querySelector('#circuit-val'));

// Logging
function log(message, type = 'info') {
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  entry.textContent = `[${new Date().toISOString().slice(11, 23)}] ${message}`;
  logEl.insertBefore(entry, logEl.firstChild);
}

function clearLog() {
  logEl.innerHTML = '';
}

// Sleep helper
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Simulated flaky operation
// - Random latency 30-250ms
// - 30% failure rate
// - 10% chance to "hang" (2 seconds)
async function flakyOp(id, signal) {
  const latency = 30 + Math.random() * 220;
  await sleep(latency);

  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  // 30% fail rate
  if (Math.random() < 0.3) {
    throw new Error(`ECONNRESET (req ${id})`);
  }

  // 10% hang (timeout should kill this)
  if (Math.random() < 0.1) {
    log(`[${id}] Hanging...`, 'info');
    await sleep(2000);
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
  }

  return { ok: true, id, latency: Math.round(latency) };
}

// Build policy based on settings
function buildPolicy(opts) {
  const { enable, retries, bulkheadLimit, timeoutMs, circuitThreshold } = opts;

  if (!enable) {
    // Pass-through, no resilience
    return {
      execute: (fn) => fn(),
      circuitOpens: 0,
    };
  }

  let circuitOpens = 0;

  // Build the policy chain (outside-in execution order):
  // 1. Bulkhead (limit concurrency)
  // 2. Circuit breaker (fail fast when overwhelmed)
  // 3. Timeout (kill hangs)
  // 4. Retry (recover transient failures)
  const policy = Policy.bulkhead({ limit: bulkheadLimit, queueLimit: 0 })
    .wrap(
      Policy.circuitBreaker({
        threshold: circuitThreshold,
        duration: 5000,
        onOpen: () => {
          circuitOpens++;
          log('Circuit OPENED - failing fast', 'circuit');
        },
        onHalfOpen: () => log('Circuit HALF-OPEN - testing...', 'circuit'),
        onClose: () => log('Circuit CLOSED - recovered', 'circuit'),
      })
    )
    .wrap(Policy.timeout(timeoutMs))
    .wrap(
      Policy.retry({
        retries,
        backoff: 'exponential',
        jitter: 'decorrelated',
        delay: 50,
        maxDelay: 300,
        onRetry: (err, attempt, delay) => {
          log(`Retry #${attempt} in ${delay}ms: ${err.message}`, 'retry');
        },
      })
    );

  return {
    execute: (fn) => policy.execute(fn),
    get circuitOpens() {
      return circuitOpens;
    },
  };
}

// Run the burst test
async function runBurst() {
  const opts = {
    enable: enableCheckbox.checked,
    retries: Number(retriesSlider.value),
    bulkheadLimit: Number(bulkheadSlider.value),
    timeoutMs: Number(timeoutSlider.value),
    circuitThreshold: Number(circuitSlider.value),
  };

  log(`Starting 50 requests (resilience ${opts.enable ? 'ON' : 'OFF'})`, 'info');
  log(
    `Config: retries=${opts.retries}, bulkhead=${opts.bulkheadLimit}, timeout=${opts.timeoutMs}ms, circuit=${opts.circuitThreshold}`,
    'info'
  );

  const policy = buildPolicy(opts);

  let success = 0;
  let fail = 0;
  let rejected = 0;

  const start = performance.now();

  const tasks = Array.from({ length: 50 }, (_, i) =>
    policy
      .execute((signal) => flakyOp(i, signal))
      .then((result) => {
        success++;
        log(`[${i}] Success (${result.latency}ms)`, 'success');
      })
      .catch((err) => {
        if (err instanceof BulkheadRejectedError) {
          rejected++;
          log(`[${i}] Bulkhead rejected`, 'reject');
        } else if (err instanceof CircuitOpenError) {
          rejected++;
          log(`[${i}] Circuit open - rejected`, 'circuit');
        } else if (err instanceof TimeoutError) {
          fail++;
          log(`[${i}] Timeout after ${err.elapsed}ms`, 'timeout');
        } else if (err instanceof RetryExhaustedError) {
          fail++;
          log(`[${i}] Exhausted ${err.attempts} attempts: ${err.cause?.message}`, 'fail');
        } else if (err.name === 'AbortError') {
          // Aborted by timeout or other - count as timeout
          fail++;
          log(`[${i}] Aborted`, 'timeout');
        } else {
          fail++;
          log(`[${i}] Failed: ${err.message}`, 'fail');
        }
      })
  );

  await Promise.allSettled(tasks);

  const elapsed = Math.round(performance.now() - start);

  // Update stats
  statSuccess.textContent = success;
  statFail.textContent = fail;
  statReject.textContent = rejected;
  statCircuit.textContent = policy.circuitOpens || 0;
  statTime.textContent = elapsed;

  log(`Done: ${success} success, ${fail} failed, ${rejected} rejected in ${elapsed}ms`, 'info');
}

// Event listeners
goBtn.addEventListener('click', async () => {
  goBtn.disabled = true;
  try {
    await runBurst();
  } finally {
    goBtn.disabled = false;
  }
});

clearBtn.addEventListener('click', () => {
  clearLog();
  statSuccess.textContent = '0';
  statFail.textContent = '0';
  statReject.textContent = '0';
  statCircuit.textContent = '0';
  statTime.textContent = '-';
});

// Initial log
log('Flaky Fetch Lab ready. Click "Run 50 Requests" to start.', 'info');
log('Toggle "Enable Resilience Policies" to compare behavior.', 'info');
