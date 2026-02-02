# @git-stunts/alfred Roadmap

A JavaScript resilience library providing retry, circuit breaker, timeout, bulkhead, hedge, and composition patterns.

## Current State (v0.4.0)

- [x] `retry()` with backoff strategies (constant, linear, exponential) and jitter (none, full, equal, decorrelated)
- [x] `retry()` with abortable retries via `AbortSignal`
- [x] `circuitBreaker()` with CLOSED/OPEN/HALF_OPEN states
- [x] `timeout()` with AbortSignal passthrough
- [x] `bulkhead()` concurrency limiter with optional queue
- [x] `hedge()` speculative execution for tail latency reduction
- [x] `compose()`, `fallback()`, `race()` combinators
- [x] Fluent `Policy` class with `.wrap()`, `.or()`, `.race()`
- [x] `TestClock` for deterministic testing
- [x] Telemetry system with composable sinks (ConsoleSink, InMemorySink, MultiSink, MetricsSink, NoopSink)
- [x] Resolvable options for runtime-updatable config
- [x] Multi-runtime support (Node.js, Bun, Deno)
- [x] TypeScript definitions

---

## v1.0.0 - Production Ready

> **STABLE API MILESTONE** - No breaking changes after this release.

- [ ] **API freeze** - Public API locked, semantic versioning enforced
- [ ] **Comprehensive documentation** - API reference, guides, examples
- [ ] **Performance benchmarks** - Measured overhead, memory usage
- [ ] **Battle-tested** - Proven in production use
- [ ] **Security audit** - Dependency review, vulnerability scan

## v1.1.0+ - Nice to Have

> Post-stable enhancements. Cool but not essential.

- [ ] **Rate limiting** - Token bucket and leaky bucket algorithms
- [ ] **Policy registry** - Named policies for reuse across application
- [ ] **Presets** - `webService()`, `databaseClient()`, `fastCache()` ready-made configs
- [ ] **Control plane** - Runtime policy updates via API endpoint

## Future / Maybe

- [ ] **Distributed circuit breaker** - Redis-backed state for multi-instance coordination
- [ ] **OpenTelemetry integration** - Native OTEL spans and metrics
- [ ] **Browser bundle** - Zero Node.js dependencies for client-side use
