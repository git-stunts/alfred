# @git-stunts/alfred

```text
      .o.       oooo   .o88o.                          .o8
     .888.      `888   888 `"                         "888
    .8"888.      888  o888oo  oooo d8b  .ooooo.   .oooo888
   .8' `888.     888   888    `888""8P d88' `88b d88' `888
  .88ooo8888.    888   888     888     888ooo888 888   888
 .8'     `888.   888   888     888     888    .o 888   888
o88o     o8888o o888o o888o   d888b    `Y8bod8P' `Y8bod88P"
```

[![JSR](https://jsr.io/badges/@git-stunts/alfred)](https://jsr.io/@git-stunts/alfred)
[![NPM Version](https://img.shields.io/npm/v/@git-stunts/alfred)](https://www.npmjs.com/package/@git-stunts/alfred)
[![CI](https://github.com/git-stunts/alfred/actions/workflows/ci.yml/badge.svg)](https://github.com/git-stunts/alfred/actions/workflows/ci.yml)

> *"Why do we fall, Bruce?"*
>
> *"So we can `retry({ backoff: 'exponential', jitter: 'decorrelated' })`."*

Resilience patterns for async operations. *Tuff 'nuff for most stuff!*

## Installation

### NPM
```bash
npm install @git-stunts/alfred
```

### JSR (Deno, Bun, Node)
```bash
npx jsr add @git-stunts/alfred
```

## Multi-Runtime Support

Alfred is designed to be platform-agnostic and is tested against:
- **Node.js** (>= 20.0.0)
- **Bun** (>= 1.0.0)
- **Deno** (>= 1.35.0)

It uses standard Web APIs (AbortController, AbortSignal) and provides runtime-aware clock management to ensure clean process exits (unref) on all platforms.

## Quick Start

```javascript
import { retry, circuitBreaker, timeout, compose } from '@git-stunts/alfred';

// Simple retry with exponential backoff
const data = await retry(
  () => fetch('https://api.example.com/data'),
  { retries: 3, backoff: 'exponential', delay: 100 }
);

// Circuit breaker - fail fast when service is down
const breaker = circuitBreaker({ threshold: 5, duration: 60000 });
const result = await breaker.execute(() => callFlakeyService());

// Compose multiple policies
const resilient = compose(
  timeout(5000),
  retry({ retries: 3, backoff: 'exponential', jitter: 'full' }),
  circuitBreaker({ threshold: 5, duration: 60000 }),
  bulkhead({ limit: 10, queueLimit: 20 })
);

await resilient.execute(() => riskyOperation());
```

## API

### `retry(fn, options)`

Retries a failed operation with configurable backoff.

```javascript
import { retry } from '@git-stunts/alfred';

// Basic retry
await retry(() => mightFail(), { retries: 3 });

// Exponential backoff: 100ms, 200ms, 400ms, 800ms...
await retry(() => mightFail(), {
  retries: 5,
  backoff: 'exponential',
  delay: 100,
  maxDelay: 10000
});

// Only retry specific errors
await retry(() => mightFail(), {
  retries: 3,
  shouldRetry: (err) => err.code === 'ECONNREFUSED'
});

// With jitter to prevent thundering herd
await retry(() => mightFail(), {
  retries: 3,
  backoff: 'exponential',
  delay: 100,
  jitter: 'full' // or 'equal' or 'decorrelated'
});
```

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `retries` | `number` | `3` | Maximum retry attempts |
| `delay` | `number` | `1000` | Base delay in milliseconds |
| `maxDelay` | `number` | `30000` | Maximum delay cap |
| `backoff` | `'constant' \| 'linear' \| 'exponential'` | `'constant'` | Backoff strategy |
| `jitter` | `'none' \| 'full' \| 'equal' \| 'decorrelated'` | `'none'` | Jitter strategy |
| `shouldRetry` | `(error) => boolean` | `() => true` | Predicate to filter retryable errors |
| `onRetry` | `(error, attempt, delay) => void` | - | Callback on each retry |

### `circuitBreaker(options)`

Fails fast when a service is degraded, preventing cascade failures.

```javascript
import { circuitBreaker } from '@git-stunts/alfred';

const breaker = circuitBreaker({
  threshold: 5,      // Open after 5 failures
  duration: 60000,   // Stay open for 60 seconds
  onOpen: () => console.log('Circuit opened!'),
  onClose: () => console.log('Circuit closed!'),
  onHalfOpen: () => console.log('Testing recovery...')
});

// Circuit has three states:
// - CLOSED: Normal operation, failures counted
// - OPEN: All calls fail immediately with CircuitOpenError
// - HALF_OPEN: One test call allowed to check recovery

try {
  await breaker.execute(() => callService());
} catch (err) {
  if (err.name === 'CircuitOpenError') {
    console.log('Service is down, failing fast');
  }
}
```

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `threshold` | `number` | required | Failures before opening |
| `duration` | `number` | required | How long to stay open (ms) |
| `successThreshold` | `number` | `1` | Successes to close from half-open |
| `shouldTrip` | `(error) => boolean` | `() => true` | Which errors count as failures |
| `onOpen` | `() => void` | - | Called when circuit opens |
| `onClose` | `() => void` | - | Called when circuit closes |
| `onHalfOpen` | `() => void` | - | Called when entering half-open |

### `bulkhead(options)`

Limits the number of concurrent executions to prevent resource exhaustion.

```javascript
import { bulkhead } from '@git-stunts/alfred';

const limiter = bulkhead({
  limit: 10,       // Max 10 concurrent executions
  queueLimit: 20   // Max 20 pending requests in queue
});

// Returns an object with:
// - execute(fn): Method to run the operation
// - stats: { active, pending, available }
try {
  await limiter.execute(() => heavyOperation());
} catch (err) {
  if (err.name === 'BulkheadRejectedError') {
    console.log('Too many concurrent requests, failing fast');
  }
}

console.log(`Current load: ${limiter.stats.active} active tasks`);
```

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `limit` | `number` | required | Maximum concurrent executions |
| `queueLimit` | `number` | `0` | Maximum pending requests in queue |

### `timeout(ms, options)`

Prevents operations from hanging indefinitely.

```javascript
import { timeout } from '@git-stunts/alfred';

// Simple timeout
const result = await timeout(5000, () => slowOperation());

// With callback
const result = await timeout(5000, () => slowOperation(), {
  onTimeout: (elapsed) => console.log(`Timed out after ${elapsed}ms`)
});
```

Throws `TimeoutError` if the operation exceeds the time limit.

### `Policy` (Fluent API)

Building complex policies is easy with the chainable `Policy` class.

```javascript
import { Policy, ConsoleSink } from '@git-stunts/alfred';

const telemetry = new ConsoleSink();

const resilient = Policy.timeout(30000)
  .wrap(Policy.retry({ retries: 3, backoff: 'exponential', telemetry }))
  .wrap(Policy.circuitBreaker({ threshold: 5, duration: 60000, telemetry }))
  .wrap(Policy.bulkhead({ limit: 5, queueLimit: 10, telemetry }));

await resilient.execute(() => riskyOperation());
```

### `compose(...policies)`

Combines multiple policies. Policies execute from left to right (outermost to innermost).

```javascript
import { compose, retry, circuitBreaker, timeout } from '@git-stunts/alfred';

const resilient = compose(
  timeout(30000),                                    // Total timeout
  retry({ retries: 3, backoff: 'exponential' }),     // Retry failures
  circuitBreaker({ threshold: 5, duration: 60000 }), // Fail fast if broken
  bulkhead({ limit: 5, queueLimit: 10 })             // Limit concurrency
);

// Execution order:
// 1. Start 30s timeout
// 2. Try operation (retry up to 3x on failure)
// 3. Each attempt checks circuit breaker and bulkhead
await resilient.execute(() => riskyOperation());
```

### Telemetry & Observability

Alfred provides a composable telemetry system to monitor policy behavior.

```javascript
import {
  Policy,
  ConsoleSink,
  InMemorySink,
  MultiSink
} from '@git-stunts/alfred';

// 1. Create a sink (or multiple)
const sink = new MultiSink([
  new ConsoleSink(),
  new InMemorySink()
]);

// 2. Attach to policies
const policy = Policy.retry({
  retries: 3,
  telemetry: sink
});

// All policies emit events:
// - retry: success, failure, scheduled, exhausted
// - circuit: open, close, half-open, success, failure, reject
// - bulkhead: execute, complete, queued, reject
// - timeout: timeout
await policy.execute(() => doSomething());
```

## Testing

Use `TestClock` for deterministic tests without real delays:

```javascript
import { retry, TestClock } from '@git-stunts/alfred/testing';

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
    delay: 1000,
    clock
  });

  // First attempt fails immediately
  await clock.tick(0);
  expect(attempts).toBe(1);

  // Second attempt after 1s
  await clock.advance(1000);
  expect(attempts).toBe(2);

  // Third attempt after 2s (exponential)
  await clock.advance(2000);
  expect(attempts).toBe(3);

  expect(await promise).toBe('success');
});
```

## Error Types

```javascript
import {
  RetryExhaustedError,
  CircuitOpenError,
  TimeoutError
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
  }
}
```

---

## License

Apache-2.0 © 2026 by James Ross

---

<p align="center">
  <sub>Built by <a href="https://github.com/flyingrobots">FLYING•ROBOTS</a></sub>
</p>
