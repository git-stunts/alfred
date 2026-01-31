# @git-stunts/alfred Roadmap

A JavaScript resilience library providing retry, circuit breaker, timeout, and composition patterns.

## Current State (v0.1.0)

- [x] `retry()` with backoff strategies (constant, linear, exponential) and jitter (none, full, equal, decorrelated)
- [x] `circuitBreaker()` with CLOSED/OPEN/HALF_OPEN states
- [x] `timeout()` with AbortSignal passthrough
- [x] `compose()`, `fallback()`, `race()` combinators
- [x] Fluent `Policy` class with `.wrap()`, `.or()`, `.race()`
- [x] `TestClock` for deterministic testing
- [x] 97 tests passing

---

## v0.2.0 - Bulkhead & Observability

- [x] **Bulkhead policy** - Concurrency limiter using semaphore pattern to isolate failures
- [x] **Telemetry system** - Composable sinks architecture (NullSink, LogSink, MemorySink)
- [x] **Event hooks** - `onRetry`, `onCircuitStateChange` callbacks for monitoring
- [x] **TypeScript definitions** - Ship `index.d.ts` for type safety

## v0.3.0 - Adaptive & Hedge ("The Lucius Fox Upgrade")

- [ ] **Adaptive Configuration** - Runtime-updatable config (e.g., dynamic timeouts/retries) via `Ref` or `Getter`.
- [ ] **Hedge Policy** - Speculative execution to reduce tail latency (start second request if first is slow).
- [ ] **Metrics Sink** - Aggregated stats (p95 latency, success rates) built on the telemetry system.

## v1.0.0 - Production Ready

> **STABLE API MILESTONE** - No breaking changes after this release.

- [ ] **API freeze** - Public API locked, semantic versioning enforced
- [ ] **Comprehensive documentation** - API reference, guides, examples
- [ ] **Performance benchmarks** - Measured overhead, memory usage
- [ ] **Battle-tested** - Proven in `@git-stunts/empty-graph`
- [ ] **Security audit** - Dependency review, vulnerability scan

## v1.1.0+ - Nice to Have

> Post-stable enhancements. Cool but not essential.

- [ ] **Hedge policy** - Speculative execution with configurable delay
- [ ] **Rate limiting** - Token bucket and leaky bucket algorithms
- [ ] **Policy registry** - Named policies for reuse across application
- [ ] **Presets** - `webService()`, `databaseClient()`, `fastCache()` ready-made configs
- [ ] **Control plane** - Runtime policy updates via API endpoint

## Future / Maybe

- [ ] **Distributed circuit breaker** - Redis-backed state for multi-instance coordination
- [ ] **OpenTelemetry integration** - Native OTEL spans and metrics
- [ ] **Browser bundle** - Zero Node.js dependencies for client-side use
