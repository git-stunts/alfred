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

Live policies wrap core Alfred policies and read their configuration from the registry at runtime.

```javascript
import { ConfigRegistry, Policy, defineLiveBulkhead } from '@git-stunts/alfred-live';

const registry = new ConfigRegistry();

defineLiveBulkhead(registry, 'bulkhead/api', {
  limit: 10,
  queueLimit: 50,
});

const policy = Policy.liveBulkhead('bulkhead/api', registry);

await policy.execute(() => fetch('https://api.example.com'));

// Live update, no redeploy.
registry.write('bulkhead/api/limit', '2');
```

If you omit `defineLive*`, pass defaults into `Policy.live*` instead and the
registry entries will be created automatically.

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
- `Policy.live*` wrappers for retry/bulkhead/circuit/timeout.
