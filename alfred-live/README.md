# @git-stunts/alfred-live

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

## Path Semantics

- Paths are relative, slash-delimited (`bulkhead/api`).
- Prefix matching uses path semantics.
- `bulkhead` matches `bulkhead` and `bulkhead/api`.
- `bulkhead/*` matches children only (e.g. `bulkhead/api`), not `bulkhead` itself.
- `bulkhead*` matches `bulkhead` and `bulkhead2`.

## Status

v0.8.0 kernel implemented:

- `Adaptive<T>` live values with version + updatedAt.
- `ConfigRegistry` for typed config and validation.
- Command router for `read_config`, `write_config`, `list_config`.
