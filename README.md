# @git-stunts/alfred

[![JSR](https://jsr.io/badges/@git-stunts/alfred)](https://jsr.io/@git-stunts/alfred)
[![NPM Version](https://img.shields.io/npm/v/@git-stunts/alfred)](https://www.npmjs.com/package/@git-stunts/alfred)
[![CI](https://github.com/git-stunts/alfred/actions/workflows/ci.yml/badge.svg)](https://github.com/git-stunts/alfred/actions/workflows/ci.yml)

```text
      .o.       oooo   .o88o.                          .o8
     .888.      `888   888 `"                         "888
    .8"888.      888  o888oo  oooo d8b  .ooooo.   .oooo888
   .8' `888.     888   888    `888""8P d88' `88b d88' `888
  .88ooo8888.    888   888     888     888ooo888 888   888
 .8'     `888.   888   888     888     888    .o 888   888
o88o     o8888o o888o o888o   d888b    `Y8bod8P' `Y8bod88P"
```

> _"Why do we fall, Bruce?"_
>
> _"So we can `retry({ backoff: 'exponential', jitter: 'decorrelated' })`."_

Resilience patterns for async operations. _Tuff 'nuff for most stuff._

Includes: retry - circuit breaker - bulkhead - timeout - hedge - composition - TestClock - telemetry sinks

---

## Install

### npm

```bash
npm install @git-stunts/alfred
```

### JSR (Deno, Bun, Node)

```bash
npx jsr add @git-stunts/alfred
```

---

## 20-second win

A realistic stack you'll actually ship: total timeout + retry (decorrelated jitter) + circuit breaker + bulkhead.

```javascript
import { Policy } from '@git-stunts/alfred';

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

const data = await resilient.execute(async () => {
  const res = await fetch('https://api.example.com/data');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
});
```

---

## Multi-runtime support

Alfred is designed to be platform-agnostic and tested against:

- **Node.js** (>= 20)
- **Bun** (>= 1)
- **Deno** (>= 1.35)

Uses standard Web APIs (AbortController, AbortSignal) and runtime-aware clock management to ensure clean process exits (e.g. timer unref where applicable).

---

## Quick start (functional helpers)

```javascript
import { retry, circuitBreaker, bulkhead, timeout } from '@git-stunts/alfred';

// 1) Simple retry with exponential backoff
const data = await retry(() => fetch('https://api.example.com/data'), {
  retries: 3,
  backoff: 'exponential',
  delay: 100,
});

// 2) Circuit breaker — fail fast when a service is down
const breaker = circuitBreaker({ threshold: 5, duration: 60_000 });
const result = await breaker.execute(() => callFlakeyService());

// 3) Bulkhead — limit concurrent executions
const limiter = bulkhead({ limit: 10, queueLimit: 20 });
await limiter.execute(() => heavyOperation());

// 4) Timeout — prevent operations from hanging
const fast = await timeout(5_000, () => slowOperation());
```

---

## Policy Algebra

Alfred provides three composition operators for building complex resilience strategies:

| Operator | Fluent          | Functional       | Semantics                             |
| -------- | --------------- | ---------------- | ------------------------------------- |
| **wrap** | `.wrap(policy)` | `compose(a, b)`  | Sequential: A wraps B (outer → inner) |
| **or**   | `.or(policy)`   | `fallback(a, b)` | Fallback: try A, if fails try B       |
| **race** | `.race(policy)` | `race(a, b)`     | Concurrent: first success wins        |

### Example 1: Production Stack (timeout + retry + circuit + bulkhead)

The classic resilience stack. Read execution order from **outside-in**: timeout wraps retry wraps circuit breaker wraps bulkhead.

```javascript
import { Policy } from '@git-stunts/alfred';

const resilient = Policy.timeout(5_000) // 1. Total deadline
  .wrap(
    Policy.retry({
      // 2. Retry transient failures
      retries: 3,
      backoff: 'exponential',
      jitter: 'decorrelated',
      delay: 100,
    })
  )
  .wrap(
    Policy.circuitBreaker({
      // 3. Fail fast when broken
      threshold: 5,
      duration: 30_000,
    })
  )
  .wrap(Policy.bulkhead({ limit: 10, queueLimit: 20 })); // 4. Limit concurrency

await resilient.execute(() => fetch('https://api.example.com/data'));
```

### Example 2: Fast/Slow Fallback

Try a fast strategy first; if it fails (or times out), fall back to a slower but more reliable approach.

```javascript
import { Policy } from '@git-stunts/alfred';

// Fast path: short timeout, no retries
const fast = Policy.timeout(500);

// Slow path: longer timeout with retries
const slow = Policy.timeout(5_000).wrap(
  Policy.retry({ retries: 3, backoff: 'exponential', delay: 200 })
);

// Try fast first, fall back to slow
const resilient = fast.or(slow);

await resilient.execute(() => fetch('https://api.example.com/data'));
```

### Example 3: Hedged Requests (Race Pattern)

Spawn parallel "hedge" requests to reduce tail latency. First success wins; losers are cancelled.

```javascript
import { Policy } from '@git-stunts/alfred';

// Hedge: if primary is slow, spawn backup attempts
const hedged = Policy.hedge({ delay: 100, maxHedges: 2 });

// Combine with bulkhead to prevent self-DDOS
const safe = hedged.wrap(Policy.bulkhead({ limit: 5 }));

// The operation receives an AbortSignal to enable cancellation
await safe.execute((signal) => fetch('https://api.example.com/data', { signal }));
```

> **Tip:** Only hedge idempotent operations. Non-idempotent operations (writes, payments) should not be hedged.

### Fluent vs Functional

Both styles produce equivalent results:

```javascript
// Fluent API
const policy1 = Policy.timeout(5_000)
  .wrap(Policy.retry({ retries: 3 }))
  .wrap(Policy.circuitBreaker({ threshold: 5, duration: 60_000 }));

// Functional API
const policy2 = compose(
  Policy.timeout(5_000),
  Policy.retry({ retries: 3 }),
  circuitBreaker({ threshold: 5, duration: 60_000 }) // functional returns policy object
);
```

The fluent API is recommended for readability. Use functional `compose()` when building policies dynamically.

---

## API

- [retry(fn, options)](#retryfn-options)
- [circuitBreaker(options)](#circuitbreakeroptions)
- [bulkhead(options)](#bulkheadoptions)
- [timeout(ms, fn, options)](#timeoutms-fn-options)
- [hedge(options)](#hedgeoptions)
- [Policy Algebra](#policy-algebra)
- [Policy (fluent API)](#policy-fluent-api)
- [compose(...policies)](#composepolicies)
- [fallback(primary, secondary)](#fallbackprimary-secondary)
- [race(primary, secondary)](#raceprimary-secondary)
- [Telemetry & Observability](#telemetry--observability)
- [Testing](#testing)
- [Error Types](#error-types)

---

## retry(fn, options)

Retries a failed operation with configurable backoff.

```javascript
import { retry } from '@git-stunts/alfred';

// Basic retry
await retry(() => mightFail(), { retries: 3 });

// Exponential backoff: 100ms, 200ms, 400ms...
await retry(() => mightFail(), {
  retries: 5,
  backoff: 'exponential',
  delay: 100,
  maxDelay: 10_000,
});

// Only retry specific errors
await retry(() => mightFail(), {
  retries: 3,
  shouldRetry: (err) => err?.code === 'ECONNREFUSED',
});

// With jitter to prevent thundering herd
await retry(() => mightFail(), {
  retries: 3,
  backoff: 'exponential',
  delay: 100,
  jitter: 'full', // or "equal" or "decorrelated"
});

// Abort retries early
const controller = new AbortController();
const promise = retry((signal) => fetch('https://api.example.com/data', { signal }), {
  retries: 3,
  backoff: 'exponential',
  delay: 100,
  signal: controller.signal,
});
controller.abort();
```

### Options

| Option        | Type                                            | Default      | Description                      |
| ------------- | ----------------------------------------------- | ------------ | -------------------------------- |
| `retries`     | `number`                                        | `3`          | Maximum retry attempts           |
| `delay`       | `number`                                        | `1000`       | Base delay (ms)                  |
| `maxDelay`    | `number`                                        | `30000`      | Maximum delay cap (ms)           |
| `backoff`     | `"constant" \| "linear" \| "exponential"`       | `"constant"` | Backoff strategy                 |
| `jitter`      | `"none" \| "full" \| "equal" \| "decorrelated"` | `"none"`     | Jitter strategy                  |
| `shouldRetry` | `(error) => boolean`                            | `() => true` | Filter retryable errors          |
| `onRetry`     | `(error, attempt, delay) => void`               | -            | Callback on each retry           |
| `signal`      | `AbortSignal`                                   | -            | Abort retries and backoff sleeps |

---

## circuitBreaker(options)

Fails fast when a service is degraded, preventing cascade failures.

```javascript
import { circuitBreaker } from '@git-stunts/alfred';

const breaker = circuitBreaker({
  threshold: 5, // Open after 5 failures
  duration: 60_000, // Stay open for 60 seconds
  onOpen: () => console.log('Circuit opened!'),
  onClose: () => console.log('Circuit closed!'),
  onHalfOpen: () => console.log('Testing recovery...'),
});

try {
  await breaker.execute(() => callService());
} catch (err) {
  if (err?.name === 'CircuitOpenError') {
    console.log('Service is down, failing fast');
  }
}
```

### Options

| Option             | Type                 | Default      | Description                       |
| ------------------ | -------------------- | ------------ | --------------------------------- |
| `threshold`        | `number`             | required     | Failures before opening           |
| `duration`         | `number`             | required     | How long to stay open (ms)        |
| `successThreshold` | `number`             | `1`          | Successes to close from half-open |
| `shouldTrip`       | `(error) => boolean` | `() => true` | Which errors count as failures    |
| `onOpen`           | `() => void`         | -            | Called when circuit opens         |
| `onClose`          | `() => void`         | -            | Called when circuit closes        |
| `onHalfOpen`       | `() => void`         | -            | Called when entering half-open    |

---

## bulkhead(options)

Limits the number of concurrent executions to prevent resource exhaustion.

```javascript
import { bulkhead } from '@git-stunts/alfred';

const limiter = bulkhead({
  limit: 10, // Max 10 concurrent executions
  queueLimit: 20, // Max 20 pending requests in queue
});

try {
  await limiter.execute(() => heavyOperation());
} catch (err) {
  if (err?.name === 'BulkheadRejectedError') {
    console.log('Too many concurrent requests, failing fast');
  }
}

console.log(`Load: ${limiter.stats.active} active`);
```

### Options

| Option       | Type     | Default  | Description                       |
| ------------ | -------- | -------- | --------------------------------- |
| `limit`      | `number` | required | Maximum concurrent executions     |
| `queueLimit` | `number` | `0`      | Maximum pending requests in queue |

---

## timeout(ms, fn, options)

Prevents operations from hanging indefinitely.

```javascript
import { timeout } from '@git-stunts/alfred';

// Simple timeout
const result = await timeout(5_000, () => slowOperation());

// With callback
const result2 = await timeout(5_000, () => slowOperation(), {
  onTimeout: (elapsed) => console.log(`Timed out after ${elapsed}ms`),
});
```

Throws `TimeoutError` if the operation exceeds the time limit.

---

## hedge(options)

Speculative execution: if the primary request is slow, spawn parallel "hedge" requests to race for the fastest response.

```javascript
import { hedge } from '@git-stunts/alfred';

const hedger = hedge({
  delay: 100, // Wait 100ms before spawning a hedge
  maxHedges: 2, // Spawn up to 2 additional requests
});

// If the first request takes > 100ms, a second request starts.
// If still slow after another 100ms, a third starts.
// First successful response wins; others are aborted.
const result = await hedger.execute((signal) => fetch('https://api.example.com/data', { signal }));
```

### Options

| Option      | Type     | Default  | Description                                  |
| ----------- | -------- | -------- | -------------------------------------------- |
| `delay`     | `number` | required | Milliseconds to wait before spawning a hedge |
| `maxHedges` | `number` | `1`      | Maximum number of hedge requests to spawn    |

---

## Policy (fluent API)

Building complex policies is easier with the chainable Policy class.

```javascript
import { Policy, ConsoleSink } from '@git-stunts/alfred';

const telemetry = new ConsoleSink();

const resilient = Policy.timeout(30_000)
  .wrap(Policy.retry({ retries: 3, backoff: 'exponential', telemetry }))
  .wrap(Policy.circuitBreaker({ threshold: 5, duration: 60_000, telemetry }))
  .wrap(Policy.bulkhead({ limit: 5, queueLimit: 10, telemetry }));

await resilient.execute(() => riskyOperation());
```

### Static Methods

| Method                           | Description                          |
| -------------------------------- | ------------------------------------ |
| `Policy.retry(options)`          | Create a retry policy                |
| `Policy.circuitBreaker(options)` | Create a circuit breaker policy      |
| `Policy.timeout(ms, options)`    | Create a timeout policy              |
| `Policy.bulkhead(options)`       | Create a bulkhead policy             |
| `Policy.hedge(options)`          | Create a hedge policy                |
| `Policy.noop()`                  | Create a pass-through (no-op) policy |

### Instance Methods

| Method          | Description                                       |
| --------------- | ------------------------------------------------- |
| `.wrap(policy)` | Wrap with another policy (sequential composition) |
| `.or(policy)`   | Fall back to another policy if this one fails     |
| `.race(policy)` | Race this policy against another                  |
| `.execute(fn)`  | Execute the policy chain                          |

```javascript
// Fallback example: try primary, fall back to cache on failure
const withFallback = Policy.retry({ retries: 2 }).or(Policy.noop()); // fallback policy

// Race example: use whichever responds first
const racing = Policy.timeout(1_000).race(Policy.timeout(2_000));
```

---

## compose(...policies)

Combines multiple policy objects. Policies execute left -> right (outermost -> innermost).

Policy objects must have an `.execute(fn)` method. Use `circuitBreaker()` and `bulkhead()` directly, or use the `Policy` class for `retry()` and `timeout()`.

```javascript
import { compose, circuitBreaker, bulkhead, Policy } from '@git-stunts/alfred';

const resilient = compose(
  Policy.timeout(30_000), // Total timeout
  Policy.retry({ retries: 3, backoff: 'exponential' }), // Retry failures
  circuitBreaker({ threshold: 5, duration: 60_000 }), // Fail fast if broken
  bulkhead({ limit: 5, queueLimit: 10 }) // Limit concurrency
);

await resilient.execute(() => riskyOperation());
```

---

## fallback(primary, secondary)

Executes the primary policy; if it fails, executes the secondary.

```javascript
import { fallback, circuitBreaker, Policy } from '@git-stunts/alfred';

const withFallback = fallback(
  Policy.retry({ retries: 3 }),
  circuitBreaker({ threshold: 5, duration: 60_000 })
);

await withFallback.execute(() => riskyOperation());
```

---

## race(primary, secondary)

Executes both policies concurrently; the first to succeed wins.

```javascript
import { race, Policy } from '@git-stunts/alfred';

const racing = race(Policy.timeout(1_000), Policy.timeout(2_000));

// Whichever completes first wins
await racing.execute(() => fetchFromMultipleSources());
```

---

## Telemetry & Observability

Alfred provides composable telemetry sinks to monitor policy behavior.

```javascript
import { Policy, ConsoleSink, InMemorySink, MultiSink } from '@git-stunts/alfred';

const sink = new MultiSink([new ConsoleSink(), new InMemorySink()]);

await Policy.retry({
  retries: 3,
  telemetry: sink,
}).execute(() => doSomething());
```

### Available Sinks

| Sink           | Description                                    |
| -------------- | ---------------------------------------------- |
| `ConsoleSink`  | Logs events to stdout                          |
| `InMemorySink` | Stores events in an array (useful for testing) |
| `MetricsSink`  | Aggregates metrics (counters, latency stats)   |
| `MultiSink`    | Broadcasts to multiple sinks                   |
| `NoopSink`     | Discards all events (disables telemetry)       |

### MetricsSink

Aggregates metrics for production monitoring.

```javascript
import { Policy, MetricsSink } from '@git-stunts/alfred';

const metrics = new MetricsSink();

const policy = Policy.retry({ retries: 3, telemetry: metrics }).wrap(
  Policy.circuitBreaker({ threshold: 5, duration: 60_000, telemetry: metrics })
);

await policy.execute(() => doSomething());

console.log(metrics.stats);
// {
//   retries: 2,
//   failures: 1,
//   successes: 1,
//   circuitBreaks: 0,
//   circuitRejections: 0,
//   bulkheadRejections: 0,
//   timeouts: 0,
//   hedges: 0,
//   latency: { count: 1, sum: 150, min: 150, max: 150, avg: 150 }
// }

metrics.clear(); // Reset all metrics
```

### Events

All policies emit events:

- **retry**: success, failure, scheduled, exhausted
- **circuit**: open, close, half-open, success, failure, reject
- **bulkhead**: execute, complete, queued, reject
- **timeout**: timeout
- **hedge**: spawn, success, failure

---

## Testing

Use `TestClock` for deterministic tests without real delays. All time-based policies (`retry`, `timeout`, `hedge`) support clock injection.

```javascript
import { retry, timeout, TestClock, TimeoutError } from '@git-stunts/alfred';

test('retries with exponential backoff', async () => {
  const clock = new TestClock();
  let attempts = 0;

  const operation = async () => {
    attempts++;
    if (attempts < 3) throw new Error('fail');
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
  expect(attempts).toBe(2);

  await clock.advance(2_000);
  expect(attempts).toBe(3);

  expect(await promise).toBe('success');
});

test('timeout triggers after virtual time', async () => {
  const clock = new TestClock();

  const slowOp = () => clock.sleep(10_000).then(() => 'done');
  const promise = timeout(5_000, slowOp, { clock });

  await clock.advance(5_000);

  await expect(promise).rejects.toThrow(TimeoutError);
});
```

---

## Error Types

```javascript
import {
  RetryExhaustedError,
  CircuitOpenError,
  TimeoutError,
  BulkheadRejectedError,
} from '@git-stunts/alfred';

try {
  await resilientOperation();
} catch (err) {
  if (err instanceof RetryExhaustedError) {
    console.log(`Failed after ${err.attempts} attempts`);
    console.log(`Last error: ${err.cause.message}`);
  } else if (err instanceof CircuitOpenError) {
    console.log(`Circuit open since ${err.openedAt}`);
  } else if (err instanceof TimeoutError) {
    console.log(`Timed out after ${err.elapsed}ms`);
  } else if (err instanceof BulkheadRejectedError) {
    console.log(`Bulkhead full: ${err.limit} active, ${err.queueLimit} queued`);
  }
}
```

| Error                   | Thrown When                       | Properties                 |
| ----------------------- | --------------------------------- | -------------------------- |
| `RetryExhaustedError`   | All retry attempts failed         | `attempts`, `cause`        |
| `CircuitOpenError`      | Circuit breaker is open           | `openedAt`, `failureCount` |
| `TimeoutError`          | Operation exceeded time limit     | `timeout`, `elapsed`       |
| `BulkheadRejectedError` | Bulkhead limit and queue are full | `limit`, `queueLimit`      |

---

## Resolution Timing (Dynamic Options)

All policy options can be passed as **functions** for dynamic/live-tunable behavior. This table documents **when** each option is resolved:

| Policy             | Option             | Resolution Timing | Description                                   |
| ------------------ | ------------------ | ----------------- | --------------------------------------------- |
| **retry**          | `retries`          | per attempt       | Checked after each failure                    |
| **retry**          | `delay`            | per attempt       | Calculated before each backoff sleep          |
| **retry**          | `maxDelay`         | per attempt       | Applied when calculating delay                |
| **retry**          | `backoff`          | per attempt       | Strategy resolved per delay calculation       |
| **retry**          | `jitter`           | per attempt       | Jitter type resolved per delay calculation    |
| **bulkhead**       | `limit`            | per admission     | Checked when request tries to execute         |
| **bulkhead**       | `queueLimit`       | per admission     | Checked when request tries to queue           |
| **circuitBreaker** | `threshold`        | per event         | Checked on each failure                       |
| **circuitBreaker** | `duration`         | per event         | Checked when testing for half-open transition |
| **circuitBreaker** | `successThreshold` | per event         | Checked on each success in half-open state    |
| **timeout**        | `ms`               | per execute       | Resolved once at start of timeout             |
| **hedge**          | `delay`            | per execute       | Resolved once at start of execute             |
| **hedge**          | `maxHedges`        | per execute       | Resolved once at start of execute             |

### Resolution Timing Semantics

- **per execute**: Option is resolved once when `execute()` is called. Changes during execution have no effect.
- **per attempt**: Option is resolved each time an attempt/retry occurs. Allows mid-execution tuning.
- **per admission**: Option is resolved each time a request attempts to enter the bulkhead.
- **per event**: Option is resolved when the relevant event (failure, success, state check) occurs.

### Example: Dynamic Retry Limit

```javascript
let maxRetries = 2;

// Pass a function to make it dynamic
await retry(operation, {
  retries: () => maxRetries, // Resolved per attempt
  delay: 100,
});

// In another part of your code, you can adjust:
maxRetries = 5; // Future failures will see the new limit
```

### Example: Dynamic Bulkhead Limit

```javascript
let concurrencyLimit = 10;

const bh = bulkhead({
  limit: () => concurrencyLimit, // Resolved per admission
  queueLimit: 20,
});

// Later, reduce concurrency (takes effect on next admission)
concurrencyLimit = 5;
```

---

## License

Apache-2.0 © 2026 by James Ross

<p align="center">
  <sub>Built by <a href="https://github.com/flyingrobots">FLYING•ROBOTS</a></sub>
</p>
