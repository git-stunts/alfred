# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.9.1] - 2026-02-04

### Changed

- Test suite no longer depends on real time (deterministic clocks only).

## [0.9.0] - 2026-02-04

### Added

- `LivePolicyPlan` builders for retry, bulkhead, circuit breaker, and timeout.
- `ControlPlane.registerLivePolicy` for binding live stacks to registry paths.
- Live policy examples and documentation.

### Changed

- Live policy execution now returns Result envelopes (registry-read failures surface as Result errors).

## [0.8.2] - 2026-02-04

### Added

- Full JSDoc and TypeScript documentation for all public APIs.

### Changed

- Release workflow updated for OIDC publishing.

## [0.8.1] - 2026-02-04

### Fixed

- Pin `@git-stunts/alfred` dependency to an exact version to avoid publishing `workspace:*`.

## [0.8.0] - 2026-02-03

### Added

- `Adaptive<T>` live values with version and `updatedAt` metadata.
- `ConfigRegistry` with typed parsing/formatting and validation before apply.
- Command router for `read_config`, `write_config`, and `list_config`.

## [0.7.0] - 2026-02-03

### Added

- Initial package scaffold.
