# Alfred Monorepo

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

---

This repository contains the **Alfred package ecosystem**. Each package is published independently, but **the entire ecosystem shares a single version number** so you never have to guess which versions are compatible.

Alfred is a **policy engine** for async resilience: composable, observable, testable — and eventually **operable** (live-tunable by ID without redeploy).

## Latest Release

`v0.10.2` (2026-02-06) — Audit-first command pipeline + auth hooks for the control plane.

## Package Badges

- `@git-stunts/alfred`: [![npm](https://img.shields.io/npm/v/@git-stunts/alfred?label=npm)](https://www.npmjs.com/package/@git-stunts/alfred) [![JSR](https://jsr.io/badges/@git-stunts/alfred)](https://jsr.io/@git-stunts/alfred)
- `@git-stunts/alfred-live`: [![npm](https://img.shields.io/npm/v/@git-stunts/alfred-live?label=npm)](https://www.npmjs.com/package/@git-stunts/alfred-live) [![JSR](https://jsr.io/badges/@git-stunts/alfred-live)](https://jsr.io/@git-stunts/alfred-live)

## Packages

- `@git-stunts/alfred` — Resilience policies and composition utilities for async operations.
- `@git-stunts/alfred-live` — Control plane primitives, live policy plans, and the `alfredctl` CLI.

## Versioning Policy

- **All packages use the same version** (for example, `0.8.0`).
- _A release bumps every package even if only one changed._
- The goal is zero version-mismatch ambiguity across the ecosystem.

## Release Flow

1. Run tests:

```bash
pnpm test
```

2. Bump the version across all packages:

```bash
pnpm release:patch
# or
pnpm release:minor
# or
pnpm release:major
```

3. Publish (runs changelog aggregation and preflight checks first):

```bash
pnpm release:publish
```

## Roadmap

See [ROADMAP.md](ROADMAP.md) for upcoming milestones and package ownership.

## Cookbook

See [COOKBOOK.md](COOKBOOK.md) for practical setup recipes.

## Preflight Checks

The publish flow runs `release:preflight`, which verifies:

- All package versions match.
- `jsr.json` versions match `package.json`.
- `package.json` exports exist on disk and are included in `files`.
- `jsr.json` exports match `package.json` exports.
- `pnpm install --frozen-lockfile` succeeds (lockfile matches specs).
- `npm pack --dry-run` succeeds for each published package.

## Repo Layout

- `alfred/` — Core package
- `alfred-live/` — Control plane package
- `scripts/release/` — Release tooling

---

## License

Apache-2.0 © 2026 by James Ross

<p align="center">
  <sub>Built by <a href="https://github.com/flyingrobots">FLYING•ROBOTS</a></sub>
</p>
