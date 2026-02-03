# @git-stunts/alfred-live

In-memory control plane for Alfred. This package will house live configuration primitives
and command routing that work across Node, Bun, Deno, and browser runtimes.

## Install

```bash
pnpm add @git-stunts/alfred-live
```

```bash
npx jsr add @git-stunts/alfred-live
```

## Status

Early scaffolding. The first planned release will include:

- `Adaptive<T>` live values
- `ConfigRegistry` for parsing/validating runtime config
- Command router for `read_config`, `write_config`, `list_config`

If you want this wired up in this pass, say the word and I’ll implement it.
