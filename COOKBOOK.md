# Alfred Cookbook

Practical recipes for common setups. Each recipe lists the packages you need.

---

## Recipe: Core policy stack (pure Alfred)

**Goal**
Build a resilient policy stack with retry + timeout + circuit breaker + bulkhead.

**Packages**
- `@git-stunts/alfred`

**Example**

```javascript
import { Policy } from '@git-stunts/alfred';

const resilient = Policy.timeout(5_000)
  .wrap(Policy.retry({ retries: 3, backoff: 'exponential', jitter: 'decorrelated' }))
  .wrap(Policy.circuitBreaker({ threshold: 5, duration: 60_000 }))
  .wrap(Policy.bulkhead({ limit: 10, queueLimit: 20 }));

const result = await resilient.execute(async () => {
  const res = await fetch('https://api.example.com');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
});
```

---

## Recipe: Live config in-process (registry + adaptive)

**Goal**
Update configuration at runtime without redeploy, inside the same process.

**Packages**
- `@git-stunts/alfred`
- `@git-stunts/alfred-live`

**Example**

```javascript
import { Policy } from '@git-stunts/alfred';
import { Adaptive, ConfigRegistry } from '@git-stunts/alfred-live';

const retries = new Adaptive(3);
const registry = new ConfigRegistry();

registry.register('retry/count', retries, {
  parse: (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) throw new Error('retry/count must be a number');
    return parsed;
  },
  format: (value) => value.toString(),
});

const policy = Policy.retry({ retries: () => retries.get() });

await policy.execute(async () => {
  // ...
});

registry.write('retry/count', '5');
```

---

## Recipe: Command router (no transport)

**Goal**
Standardize config changes through commands in-memory.

**Packages**
- `@git-stunts/alfred-live`

**Example**

```javascript
import { Adaptive, ConfigRegistry, CommandRouter } from '@git-stunts/alfred-live';

const bulkheadLimit = new Adaptive(10);
const registry = new ConfigRegistry();
registry.register('bulkhead/limit', bulkheadLimit, {
  parse: (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      throw new Error('bulkhead/limit must be a number');
    }
    return parsed;
  },
  format: (value) => value.toString(),
});

const router = new CommandRouter(registry);

router.execute({ type: 'read_config', path: 'bulkhead/limit' });
router.execute({ type: 'write_config', path: 'bulkhead/limit', value: '5' });
router.execute({ type: 'list_config', prefix: 'bulkhead' });
```

---

## Recipe: Control plane CLI (JSONL)

**Goal**
Send control plane commands from a CLI.

**Packages**
- `@git-stunts/alfred-live`

**Example**

```bash
alfredctl list retry
alfredctl read retry/count
alfredctl write retry/count 5
```
