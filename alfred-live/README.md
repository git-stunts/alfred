# @git-stunts/alfred-live

```text

      .o.       oooo   .o88o.                          .o8
     .888.      `888   888 `"                         "888
    .8"888.      888  o888oo  oooo d8b  .ooooo.   .oooo888
   .8' `888.     888   888    `888""8P d88' `88b d88' `888
  .88ooo8888.    888   888     888     888ooo888 888   888
 .8'     `888.   888   888     888     888    .o 888   888
o88o     o8888o o888o o888o   d888b    `Y8bod8P' `Y8bod88P"

       ,gggg,      ,a8a,  ,ggg,         ,gg ,ggggggg,
      d8" "8I     ,8" "8,dP""Y8a       ,8P,dP""""""Y8b
      88  ,dP     d8   8bYb, `88       d8'd8'    a  Y8
   8888888P"      88   88 `"  88       88 88     "Y8P'
      88          88   88     88       88 `8baaaa
      88          Y8   8P     I8       8I,d8P""""
 ,aa,_88          `8, ,8'     `8,     ,8'd8"
dP" "88P     8888  "8,8"       Y8,   ,8P Y8,
Yb,_,d88b,,_ `8b,  ,d8b,        Yb,_,dP  `Yba,,_____,
 "Y8P"  "Y88888"Y88P" "Y8        "Y8P"     `"Y8888888

```

In-memory control plane for Alfred. This package provides live configuration primitives and a command router that work across Node, Bun, Deno, and browsers.

## Install

```bash
pnpm add @git-stunts/alfred-live
```

```bash
npx jsr add @git-stunts/alfred-live
```

## Roadmap

See the ecosystem roadmap at [ROADMAP.md](https://github.com/git-stunts/alfred/blob/main/ROADMAP.md).

## Quick Start

```javascript
import { Adaptive, ConfigRegistry, CommandRouter } from '@git-stunts/alfred-live';

const retryCount = new Adaptive(3);

const registry = new ConfigRegistry();
registry.register('retry/count', retryCount, {
  parse: (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      throw new Error('retry/count must be a number');
    }
    return parsed;
  },
  format: (value) => value.toString(),
});

const router = new CommandRouter(registry);

router.execute({ type: 'read_config', path: 'retry/count' });
router.execute({ type: 'write_config', path: 'retry/count', value: '5' });
router.execute({ type: 'list_config', prefix: 'retry' });
```

## Live Policies

Live policies are described with a `LivePolicyPlan` and then bound to a registry
via a `ControlPlane`. Binding creates the config entries and returns an executable
policy stack.

```javascript
import { ConfigRegistry, ControlPlane, LivePolicyPlan } from '@git-stunts/alfred-live';
import { Policy } from '@git-stunts/alfred';

const registry = new ConfigRegistry();
const controlPlane = new ControlPlane(registry);

const livePlan = LivePolicyPlan.timeout('timeout', 5_000)
  .wrap(
    LivePolicyPlan.retry('retry', {
      retries: 3,
      delay: 150,
      maxDelay: 3_000,
      backoff: 'exponential',
      jitter: 'decorrelated',
    })
  )
  .wrap(
    LivePolicyPlan.static(
      Policy.circuitBreaker({
        threshold: 5,
        duration: 60_000,
      })
    )
  )
  .wrap(LivePolicyPlan.bulkhead('bulkhead', { limit: 10, queueLimit: 50 }));

const result = controlPlane.registerLivePolicy(livePlan, 'gateway/api');
if (!result.ok) throw new Error(result.error.message);

const { policy } = result.data;

await policy.execute(() => fetch('https://api.example.com'));

// Live update, no redeploy.
registry.write('gateway/api/retry/retries', '5');
```

## Path Semantics

- Paths are relative, slash-delimited (`bulkhead/api`).
- Prefix matching uses path semantics.
- Exact prefix: `bulkhead` matches `bulkhead` and `bulkhead/api`.
- Child-only wildcard: `bulkhead/*` matches children only (e.g. `bulkhead/api`), not `bulkhead` itself.
- Glob-style prefix: `bulkhead*` matches `bulkhead` and `bulkhead2`.

## Examples

- `alfred-live/examples/control-plane/basic.js` — in-process registry + command router usage.
- `alfred-live/examples/control-plane/live-policies.js` — live policy wrappers driven by registry state.

## Status

v0.9.0 live policies implemented:

- `Adaptive<T>` live values with version + updatedAt.
- `ConfigRegistry` for typed config and validation.
- Command router for `read_config`, `write_config`, `list_config`.
- `LivePolicyPlan` + `ControlPlane.registerLivePolicy` for live policy stacks.
