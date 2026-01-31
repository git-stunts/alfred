# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
