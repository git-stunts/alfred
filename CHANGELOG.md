# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.0] - 2026-02-02

### Added

- **Policy Algebra Documentation**: New README section explaining `wrap`, `or`, and `race` composition operators with real-world examples.
- **README Smoke Tests**: `examples/readme-smoke.test.js` validates all README code snippets actually work.
- **Timeout Clock Injection**: `timeout()` now accepts `options.clock` for deterministic testing with `TestClock`.

### Fixed

- **README Quick Start**: Fixed invalid JS in quote, corrected compose/fallback/race examples to use Policy objects.

### Changed

- **ROADMAP.md**: Comprehensive milestone breakdown from v0.5 through v1.0 with user stories, requirements, and test specs.

## [0.4.0] - 2026-02-02

### Added

- **Abortable Retries**: Pass an `AbortSignal` via the `signal` option to cancel retries and backoff sleeps early. The signal is also forwarded to the operation function.

## [0.3.0] - 2026-02-01

### Added

- **MetricsSink**: A specialized telemetry sink for aggregating numerical metrics (latencies, counts).
- **Telemetry Metrics**: Added `metrics` property to `TelemetryEvent` for structured counter increments.

### Fixed

- **Bulkhead Telemetry**: Ensure queued executions emit success/failure metrics to match direct execution.
- **Hedge Cancellation**: Improved resource cleanup by implementing a strict cancellation check for scheduled hedges.

## [0.2.1] - 2026-01-31

### Added

- Added GitHub Actions workflow for automated publishing with provenance.

### Fixed

- Improved JSR score by adding rich type documentation and metadata.

## [0.2.0] - 2026-01-30

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

## [0.1.0] - 2026-01-20

### Added

- Initial release with `retry`, `circuitBreaker`, `timeout`, and `compose`.
- `TestClock` for deterministic testing.
