<!-- AUTO-GENERATED: edit package CHANGELOGs instead. -->
# Changelog

Aggregated changelog for the Alfred package family.

## @git-stunts/alfred

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.10.1] - 2026-02-06 (@git-stunts/alfred)

### Changed

- Version bump to keep lockstep alignment with the Alfred package family (no API changes).

## [0.10.0] - 2026-02-04 (@git-stunts/alfred)

### Changed

- Version bump to keep lockstep alignment with the Alfred package family (no API changes).

## [0.9.1] - 2026-02-04 (@git-stunts/alfred)

### Changed

- Test suite no longer depends on real time (deterministic clocks only).

## [0.9.0] - 2026-02-04 (@git-stunts/alfred)

### Changed

- Bulkhead soft-shrink behavior documented and tested for live limit updates.

## [0.8.2] - 2026-02-04 (@git-stunts/alfred)

### Changed

- Release workflow updated for OIDC publishing (no API changes).

## [0.8.1] - 2026-02-04 (@git-stunts/alfred)

### Changed

- Version bump to keep lockstep alignment with the Alfred package family (no API changes).

## [0.8.0] - 2026-02-03 (@git-stunts/alfred)

### Changed

- Repository converted to a monorepo with `@git-stunts/alfred` as a workspace package.
- Release tooling updated; no API changes in the core package.

## [0.7.0] - 2026-02-02 (@git-stunts/alfred)

### Added

- **Rate-Limiting Policy**: New `rateLimit()` policy for throughput control using token bucket algorithm.
  - Configurable `rate` (requests/sec) and `burst` capacity
  - Optional `queueLimit` for backpressure (default: reject immediately)
  - `RateLimitExceededError` with `rate` and `retryAfter` properties
  - Full TestClock support for deterministic testing
  - Telemetry events: `rateLimit.acquire`, `rateLimit.queued`, `rateLimit.rejected`
- **Policy.rateLimit()**: Fluent API support for rate limiting

## [0.6.9] - 2026-02-02 (@git-stunts/alfred)

### Added

- **Cloudflare Workers Support**: Alfred now verified to work in Cloudflare Workers runtime via Miniflare tests.
- **Cloudflare Workers CI**: Docker-based Miniflare tests run in CI to ensure continued compatibility.

## [0.6.0] - 2026-02-02 (@git-stunts/alfred)

### Added

- **Browser Support**: Alfred now officially supports modern browsers (Chrome 85+, Firefox 79+, Safari 14+, Edge 85+).
- **Browser Demo**: Interactive "Flaky Fetch Lab" (`npm run demo:web`) demonstrates resilience policies running in a browser.
- **Playwright Tests**: Browser compatibility tests verify retry, timeout, bulkhead, and circuit breaker work in Chromium.
- **Resolution Timing Documentation**: New README section documenting when dynamic options (functions) are resolved for each policy—per attempt, per admission, per event, or per execute.
- **Resolution Timing Tests**: Comprehensive test suite verifying option resolution timing with call counters.
- **Hedge Safety Guardrails**: Documentation for safe hedge usage—idempotent operations only, AbortSignal handling, bulkhead composition.
- **Hedge Recipes**: `hedgeRead` pattern for database/cache operations, `happyEyeballsFetch` for multi-endpoint racing.
- **Full JSDoc Coverage**: All source files and TypeScript declarations now have complete documentation.

### Fixed

- **JSR Module Docs**: Entrypoints now use `@module` tag with examples for proper JSR documentation.
- **JSR Publish Config**: Fixed exclude list to only publish required files (was including examples, scripts, etc.).
- **TypeScript Declarations**: `testing.d.ts` updated with missing types (`HedgeOptions`, `MetricsSink`, `Resolvable`, `Policy.hedge`).
- **Example in index.d.ts**: Fixed incorrect compose example to use proper Policy fluent API.

### Changed

- **ROADMAP.md**: v0.5 and v0.6 milestones marked complete.

## [0.5.0] - 2026-02-02 (@git-stunts/alfred)

### Added

- **Policy Algebra Documentation**: New README section explaining `wrap`, `or`, and `race` composition operators with real-world examples.
- **README Smoke Tests**: `examples/readme-smoke.test.js` validates all README code snippets actually work.
- **Timeout Clock Injection**: `timeout()` now accepts `options.clock` for deterministic testing with `TestClock`.

### Fixed

- **README Quick Start**: Fixed invalid JS in quote, corrected compose/fallback/race examples to use Policy objects.

### Changed

- **ROADMAP.md**: Comprehensive milestone breakdown from v0.5 through v1.0 with user stories, requirements, and test specs.

## [0.4.0] - 2026-02-02 (@git-stunts/alfred)

### Added

- **Abortable Retries**: Pass an `AbortSignal` via the `signal` option to cancel retries and backoff sleeps early. The signal is also forwarded to the operation function.

## [0.3.0] - 2026-02-01 (@git-stunts/alfred)

### Added

- **MetricsSink**: A specialized telemetry sink for aggregating numerical metrics (latencies, counts).
- **Telemetry Metrics**: Added `metrics` property to `TelemetryEvent` for structured counter increments.

### Fixed

- **Bulkhead Telemetry**: Ensure queued executions emit success/failure metrics to match direct execution.
- **Hedge Cancellation**: Improved resource cleanup by implementing a strict cancellation check for scheduled hedges.

## [0.2.1] - 2026-01-31 (@git-stunts/alfred)

### Added

- Added GitHub Actions workflow for automated publishing with provenance.

### Fixed

- Improved JSR score by adding rich type documentation and metadata.

## [0.2.0] - 2026-01-30 (@git-stunts/alfred)

### Added

- **Bulkhead Policy**: Concurrency limiting with optional queueing to prevent resource exhaustion.
- **Telemetry System**: Composable sinks (`ConsoleSink`, `InMemorySink`, `MultiSink`) for observing policy events.
- **Cross-Platform Support**: Explicit support and testing for Node.js, Bun, and Deno.
- **TypeScript Definitions**: Official `index.d.ts` for type safety.
- **DevContainers**: Development environments for Node, Bun, and Deno.
- **Dockerized Testing**: BATS-orchestrated integration tests for multiple runtimes.

### Changed

- Refactored core policies into Classes for better state management and strict mode compliance.
- Improved `SystemClock` to support `unref()` across different runtimes for cleaner process exits.

### Fixed

- Various microtask timing issues in tests when using `TestClock`.

## [0.1.0] - 2026-01-20 (@git-stunts/alfred)

### Added

- Initial release with `retry`, `circuitBreaker`, `timeout`, and `compose`.
- `TestClock` for deterministic testing.

## @git-stunts/alfred-live

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.10.1] - 2026-02-06 (@git-stunts/alfred-live)

### Added

- JSONL command channel fuzz-style test for randomized junk input handling.
- `alfredctl` JSONL output integration test against the command channel.

## [0.10.0] - 2026-02-04 (@git-stunts/alfred-live)

### Added

- Canonical JSONL command envelope with strict validation helpers.
- Result envelope helpers plus JSONL encode/decode utilities.
- `alfredctl` CLI for emitting JSONL commands.
- JSONL command channel example and tests.

## [0.9.1] - 2026-02-04 (@git-stunts/alfred-live)

### Changed

- Test suite no longer depends on real time (deterministic clocks only).

## [0.9.0] - 2026-02-04 (@git-stunts/alfred-live)

### Added

- `LivePolicyPlan` builders for retry, bulkhead, circuit breaker, and timeout.
- `ControlPlane.registerLivePolicy` for binding live stacks to registry paths.
- Live policy examples and documentation.

### Changed

- Live policy execution now returns Result envelopes (registry-read failures surface as Result errors).

## [0.8.2] - 2026-02-04 (@git-stunts/alfred-live)

### Added

- Full JSDoc and TypeScript documentation for all public APIs.

### Changed

- Release workflow updated for OIDC publishing.

## [0.8.1] - 2026-02-04 (@git-stunts/alfred-live)

### Fixed

- Pin `@git-stunts/alfred` dependency to an exact version to avoid publishing `workspace:*`.

## [0.8.0] - 2026-02-03 (@git-stunts/alfred-live)

### Added

- `Adaptive<T>` live values with version and `updatedAt` metadata.
- `ConfigRegistry` with typed parsing/formatting and validation before apply.
- Command router for `read_config`, `write_config`, and `list_config`.

## [0.7.0] - 2026-02-03 (@git-stunts/alfred-live)

### Added

- Initial package scaffold.
