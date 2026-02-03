<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- © 2026 James Ross Ω FLYING•ROBOTS -->

# ROADMAP — Alfred Ecosystem

This roadmap covers the Alfred monorepo and its packages. Alfred is a **policy engine** for async resilience: composable, observable, testable — and eventually **operable** (live-tunable by ID without redeploy).

## North Star

> "Need to adjust that bulkhead? No redeploy needed."

Alfred becomes a **runtime-controlled resilience layer**:

- **Policies are pure + composable**
- **Config is live + addressable by ID**
- **Telemetry is first-class**
- **Testing is deterministic** (no time-based flakiness)

## Guiding Principles

1. **Core stays dependency-free.** Heavy integrations live in satellites.
2. **Deterministic under TestClock.** No "sleep in tests" nonsense.
3. **No global state.** Control plane is an object you pass in.
4. **Validated updates only.** Parse/validate before apply; reject bad writes.
5. **Audit first.** Every config change attempt is recordable (even denied).
6. **Single-version ecosystem.** All packages bump together.
7. **Live stays out of core.** Control plane lives in `@git-stunts/alfred-live`, not core.

## Packages

- `@git-stunts/alfred` — Core policies + composition + telemetry + TestClock.
- `@git-stunts/alfred-live` — Control plane primitives + live policy wrappers + `alfredctl` CLI.
- `@git-stunts/alfred-transport-jsonl` — Telemetry sink adapter (JSONL logger, planned).

## Version Milestones

- [x] v0.5 — Correctness & Coherence (`@git-stunts/alfred`)
- [x] v0.6 — Typed Knobs & Stable Semantics (`@git-stunts/alfred`)
- [x] v0.7 — Rate Limiting (Throughput) Policy (`@git-stunts/alfred`)
- [ ] v0.8 — Control Plane Core (In-Memory) (`@git-stunts/alfred-live`)
- [ ] v0.9 — Live Policies by ID (No Redeploy) (`@git-stunts/alfred-live`)
- [ ] v0.10 — Control Plane Command Channel + Audit Ordering (`@git-stunts/alfred-live`)
- [ ] v1.0 — Production Contract Release (all packages)

## Control Plane Interfaces

The control plane is intentionally layered. Interfaces appear in this order:

1. **In-process API** (v0.8): `ConfigRegistry` + `CommandRouter` used directly in code.
2. **Live policy wrappers** (v0.9): `Policy.live*` helpers that wrap core policies, still in-process.
3. **Command channel + CLI** (v0.10): JSONL envelope + `alfredctl` for external control.

Telemetry transport packages (e.g. `@git-stunts/alfred-transport-*`) are a separate track and do not carry control plane commands.

---

## Milestone v0.5 — Correctness & Coherence

Goal: eliminate credibility leaks (docs inconsistencies, missing imports), and make the "algebra" obvious and documented.

### v0.5.1 — README: Fix copy/paste correctness + feature discovery

**Package(s)**
`@git-stunts/alfred`

**User story**
As a developer evaluating Alfred, I want the first example to run without edits so I can trust the library.

**Requirements**

- Quick Start imports match usage (bulkhead included).
- Quote uses valid, copy-safe JS (double quotes inside code).
- Add a minimal "What you get" line: retry/circuit/bulkhead/timeout/hedge + TestClock + telemetry.

**Acceptance criteria**

- README Quick Start runs as-is in Node 20.
- No missing import in any snippet.
- Hedge is mentioned at least once as a feature (even if not fully documented yet).

**Scope**

- README edits only.

**Out of scope**

- New API features.
- Major README restructure (save that for 0.5+).

**Test spec**

- Golden: copy/paste snippets into examples/readme-smoke.test.js and execute.
- Known failures: none acceptable.
- Fuzz/stress: N/A.

**Definition of done**

- CI includes a "README smoke" test that runs at least the Quick Start snippet.

---

### v0.5.2 — Docs: "Policy algebra" section (wrap/or/race semantics)

**Package(s)**
`@git-stunts/alfred`

**User story**
As a user, I want to understand composition quickly so I can build real stacks without reading source.

**Requirements**

- Document equivalences:
  - wrap ≈ sequential composition ("A wraps B")
  - or ≈ fallback
  - race/hedge ≈ concurrent first-success patterns
- Document precedence (or lack thereof) for fluent API vs functional compose.

**Acceptance criteria**

- README has an "Algebra" section with 3 examples:
  - timeout + retry + bulkhead stack
  - fast timeout fallback to slower stack
  - hedge/race pattern

**Scope**

- README + small examples folder if needed

**Out of scope**

- Adding new operators or parser for expressions (like A + B | C text)

**Test spec**

- Golden: examples run in Node 20 and Deno/Bun if you've got CI matrix.
- Known failures: none.
- Fuzz/stress: N/A.

**Definition of done**

- Docs merged + examples pass CI.

---

### v0.5.3 — Timeout determinism: allow optional clock injection

**Package(s)**
`@git-stunts/alfred`

**User story**
As a maintainer, I want deterministic timeout tests using TestClock so the test suite is fast and stable.

**Requirements**

- timeout(ms, fn, options) accepts options.clock (or options.timer) consistent with the rest of the library.
- Uses clock for scheduling and elapsed calculation (not Date.now()).
- Preserves current runtime behavior if no clock provided.

**Acceptance criteria**

- New tests prove timeout works without real delays.
- Existing timeout behavior remains unchanged in Node.

**Scope**

- timeout implementation + tests
- update testing exports if needed

**Out of scope**

- Deadline propagation across nested policies (that's later).

**Test spec**

- Golden:
  - timeout triggers after virtual time advance
  - timeout does not trigger if operation finishes before deadline
- Known failures:
  - ensure AbortError / cancellation doesn't report as timeout
- Fuzz/stress:
  - random operation durations under TestClock (100–500 iterations)
  - ensure no leaked timers / pending promises

**Definition of done**

- Timeout tests run in <1s total, no sleeps.
- No flakiness across 20 CI runs.

---

## Milestone v0.6 — Typed Knobs & Stable Semantics

Goal: normalize option resolution/snapshot timing so future "live edit" doesn't create chaos.

### v0.6.1 — Normalize Resolvable resolution rules across policies

**Package(s)**
`@git-stunts/alfred`

**User story**
As a user, I want predictable semantics when passing functions/handles for options (e.g. limit, retries).

**Requirements**

- Document and implement: which options resolve "per execute" vs "per attempt" vs "per admission".
- Standardize:
  - Retry: resolve most options once per execute (except maybe shouldRetry)
  - Bulkhead: resolve limit/queueLimit per admission
  - Circuit breaker: resolve thresholds per event
  - Hedge: resolve delay/maxHedges per execute

**Acceptance criteria**

- Behavior is explicit in docs.
- Tests assert resolution timing for each policy.

**Scope**

- Policy implementations + tests + docs

**Out of scope**

- Full control plane integration

**Test spec**

- Golden: "resolution timing" tests with counters (no real delays)
- Known failures: inconsistent resolution across policy constructors
- Fuzz/stress: randomized options functions; ensure no repeated unexpected calls

**Definition of done**

- A single doc section "Resolution timing" exists + tests cover it.

---

### v0.6.2 — Hedge docs + guardrails

**Package(s)**
`@git-stunts/alfred`

**User story**
As a user, I want to use hedged requests safely without accidentally DDOSing myself.

**Requirements**

- Docs include:
  - "Only hedge idempotent operations"
  - "Prefer hedge with bulkhead + circuit breaker"
  - "Use AbortSignal to cancel losing hedges"
- Provide 1–2 recipes:
  - hedgeRead (read-only)
  - happyEyeballsFetch (two endpoints)

**Acceptance criteria**

- README includes one hedge example that composes with bulkhead + timeout
- Mention Promise.any requirement for older runtimes.

**Scope**

- Docs + examples

**Out of scope**

- Implementing automatic idempotency detection (lol)

**Test spec**

- Golden: hedge cancels losing branch; no unhandled rejections
- Known failures: losing branch continues running after winner resolves
- Fuzz/stress: 1000 races under TestClock/simulated clock

**Definition of done**

- Docs land + one "hedge example" test runs in CI.

---

## Milestone v0.7 — Rate Limiting Policy

Goal: add throughput control (token bucket / GCRA). Bulkhead limits concurrency; rate limit limits requests per time.

### v0.7.1 — Implement rateLimit(options) policy

**Package(s)**
`@git-stunts/alfred`

**User story**
As a user, I need to limit request rate (RPS) without external infrastructure.

**Requirements**

- Token bucket or GCRA implementation
- Options:
  - rate (tokens/sec)
  - burst (max tokens)
  - optional clock (TestClock support)
- Failure mode: reject immediately with RateLimitExceededError (or optionally queue—default reject)

**Acceptance criteria**

- Deterministic tests for:
  - steady-state throughput
  - burst handling
  - refill over time
- Works in Node/Bun/Deno (no Node-only APIs)

**Scope**

- New policy + error type + d.ts + tests

**Out of scope**

- Distributed rate limiting
- Adaptive/autotuning

**Test spec**

- Golden:
  - allow N ops per second under TestClock
  - burst allows immediate spikes then throttles
- Known failures:
  - floating point drift (use integer math if possible)
- Fuzz/stress:
  - random request schedules (10k events) under TestClock
  - ensure no negative tokens / overflow

**Definition of done**

- New policy documented + covered + exports stable.

---

## Milestone v0.8 — Control Plane Core (In-Memory)

Goal: the minimum viable control plane, Nine Lives style: ReadConfig / WriteConfig against a registry.

### v0.8.1 — Implement Adaptive<T> + ConfigRegistry

**Package(s)**
`@git-stunts/alfred-live`

**User story**
As an operator/dev, I want to change policy parameters at runtime in-process, safely.

**Requirements**

- Adaptive<T>:
  - get(): T
  - set(next: T): void
  - update(fn): void
  - metadata: version, updatedAt
- ConfigRegistry:
  - register(path, adaptive, { parse, format })
  - keys(), read(path), write(path, valueString)
  - paths are relative and slash-delimited (e.g. `bulkhead/api`)
  - prefix semantics: `bulkhead` matches `bulkhead` + `bulkhead/*`; `bulkhead/*` matches children only; `bulkhead*` uses wildcard matching
  - Validate before apply: parsing failure rejects, old value preserved.

**Acceptance criteria**

- Registry supports:
  - list keys
  - read current values
  - write new values
  - write rejects invalid value and does not mutate config

**Scope**

- In-memory only

**Out of scope**

- Persistence
- Networking
- Auth

**Test spec**

- Golden:
  - write valid value updates version and updatedAt
  - write invalid value returns structured error and preserves old
- Known failures:
  - partial update leaving config in invalid state
- Fuzz/stress:
  - 10k random writes including invalid; assert invariants hold

**Definition of done**

- Registry is stable, documented, and unit tested heavily.

---

### v0.8.2 — Define command model (ReadConfig/WriteConfig/ListConfig)

**Package(s)**
`@git-stunts/alfred-live`

**User story**
As a tool author, I want a stable command API that can be transported over any protocol.

**Requirements**

- Command types:
  - read_config { path }
  - write_config { path, value }
  - list_config { prefix? }
- Result model:
  - ok: true, data
  - ok: false, error { code, message, details }

**Acceptance criteria**

- Router executes commands against registry and returns canonical results.

**Scope**

- Internal router API only

**Out of scope**

- Wire format
- Auth/audit (next milestones)

**Test spec**

- Golden: read/write/list flows
- Known failures: unknown key, invalid key path, invalid value
- Fuzz/stress: random paths/prefixes

**Definition of done**

- Commands are stable + used by at least one example script.

---

## Milestone v0.9 — Live Policies by ID

Goal: Policies become operable: "liveBulkhead('bulkhead.api')" etc.

### v0.9.1 — Add Policy.live\* constructors (retry/bulkhead/circuit/timeout)

**Package(s)**
`@git-stunts/alfred-live` (wraps `@git-stunts/alfred` policies)

**User story**
As an operator, I want to tune a live system without redeploying, using stable IDs.

**Requirements**

- Add constructors:
  - Policy.liveRetry(id, plane, defaults?)
  - Policy.liveBulkhead(id, plane, defaults?)
  - Policy.liveCircuitBreaker(id, plane, defaults?)
  - Policy.liveTimeout(id, plane, defaults?)
- Defaults:
  - if key missing, register defaults automatically OR require explicit plane.define (pick one; I recommend explicit)
- Snapshot semantics:
  - Retry/Timeout: per execute
  - Bulkhead: per admission
  - Circuit: per event

**Acceptance criteria**

- Demo: adjust bulkhead limit live and observe admission behavior change without restart.

**Scope**

- In-process control plane only

**Out of scope**

- Remote control protocols
- Auth/audit

**Test spec**

- Golden:
  - update bulkhead limit from 10→1 blocks new admissions
  - update retry retries from 3→6 changes future operations
- Known failures:
  - changing retry mid-operation causes inconsistent attempt schedule (avoid by per-execute snapshot)
- Fuzz/stress:
  - concurrent executions while config changes (1k iterations)

**Definition of done**

- Live policies are documented + tested + examples exist.

---

### v0.9.2 — Resizable bulkhead semantics (soft shrink)

**Package(s)**
`@git-stunts/alfred`

**User story**
As an operator, I want to reduce concurrency safely without killing in-flight operations.

**Requirements**

- Implement safe shrink:
  - decreasing limit prevents new admissions until active <= limit
  - never cancels running tasks
- Queue limit updates only affect new enqueues

**Acceptance criteria**

- A test proves:
  - start 10 ops, shrink to 2: no cancellations, but new admissions wait/reject correctly.

**Scope**

- Bulkhead internals + tests

**Out of scope**

- Preemptive cancellation
- Fairness guarantees beyond "reasonable FIFO" if queue exists

**Test spec**

- Golden:
  - grow behaves immediately
  - shrink is soft
- Known failures:
  - deadlocks under shrink pressure
- Fuzz/stress:
  - random limit changes under load for 5k ops

**Definition of done**

- No deadlocks, no leaked queued items, no incorrect stats.

---

## Milestone v0.10 — Control Plane Command Channel + Audit Ordering

Goal: make the control plane operable outside the process: command channel + canonical envelope + audit-first ordering.

### v0.10.1 — Canonical command envelope + JSONL codec + CLI

**Package(s)**
`@git-stunts/alfred-live`

**User story**
As a CLI/tooling user, I want to send commands to Alfred over stdin/stdout safely and predictably.

**Requirements**

- Envelope:
  - id, cmd, args, optional auth
- JSONL codec (for commands, not telemetry):
  - decode per line
  - encode per result
- Strict validation: reject unknown fields and malformed payloads
- `alfredctl` CLI shipped from `@git-stunts/alfred-live`

**Acceptance criteria**

- `alfredctl` can:
  - list keys
  - read config
  - write config

**Scope**

- JSONL only (command channel)

**Out of scope**

- HTTP/gRPC (future satellites)
- Telemetry transport packages (separate track)

**Test spec**

- Golden:
  - round-trip encode/decode
  - command execution via JSONL harness
- Known failures:
  - partial lines, invalid JSON, huge payload lines
- Fuzz/stress:
  - randomized JSONL lines and junk input (1k–5k lines)

**Definition of done**

- Transport is stable and exercised by CI integration tests.

---

### v0.10.2 — Audit-first pipeline + auth hooks

**Package(s)**
`@git-stunts/alfred-live`

**User story**
As an operator, I need a complete audit trail of config change attempts (even denied or invalid).

**Requirements**

- Pipeline order:
  1. Audit (attempt)
  2. Auth (optional)
  3. Validate + Execute
  4. Audit (result)
- Auth provider interface (pluggable):
  - start with allowAll / opaqueToken provider

**Acceptance criteria**

- Every command produces 2 audit events (attempt + result) OR one combined event with status.
- Invalid commands are audited too.

**Scope**

- Local audit sink(s): console + in-memory
- auth as hooks

**Out of scope**

- Real security claims (that's v1+ with threat model + external review)

**Test spec**

- Golden:
  - audit sees denied write
  - audit sees invalid JSON
  - audit sees successful write
- Known failures:
  - audit not firing on exceptions
- Fuzz/stress:
  - throw errors in handlers; ensure audit still records "failed"

**Definition of done**

- Audit is impossible to bypass accidentally (tests enforce it).

---

## Milestone v1.0 — Production Contract Release

Goal: stop moving cheese. API stability, deterministic tests, docs complete, and "operable" story is real.

---

## Telemetry Transport Packages (Separate Track)

Telemetry transports are **not** the same thing as the control plane command channel. Packages with `transport` in the name are telemetry sink adapters that plug into Alfred’s telemetry system.

Planned examples:

- `@git-stunts/alfred-transport-jsonl` — JSONL telemetry sink
- `@git-stunts/alfred-transport-datadog` — Datadog telemetry sink
- `@git-stunts/alfred-transport-otlp` — OTLP/OpenTelemetry telemetry sink

### v1.0.1 — API freeze + deprecation policy

**Package(s)**
All packages (`@git-stunts/alfred`, `@git-stunts/alfred-live`, `@git-stunts/alfred-transport-*`)

**User story**
As an adopter, I want confidence that upgrades won't silently break my system.

**Requirements**

- Declare public API surface:
  - exports and subpath exports
  - error types and event types
  - control plane command schema
- Deprecation policy in README/CONTRIBUTING:
  - how long deprecations live
  - what constitutes breaking change

**Acceptance criteria**

- A "Public API" section exists and matches actual exports.

**Scope**

- Docs + minor code guards

**Out of scope**

- Big refactors

**Test spec**

- Golden: export snapshot test (assert export keys stable)
- Known failures: none
- Fuzz/stress: N/A

**Definition of done**

- Export snapshot is enforced by CI.

---

### v1.0.2 — Deterministic test suite: no sleeps, no flakes

**Package(s)**
`@git-stunts/alfred`

**User story**
As a maintainer, I want tests that are fast and don't fail randomly in CI.

**Requirements**

- All time-based policies support TestClock (retry/backoff/jitter/timeout/rateLimit/hedge delays).
- No setTimeout-based tests except maybe one smoke test.

**Acceptance criteria**

- Full suite runs in <10s
- 50 consecutive CI runs show no flake

**Scope**

- tests + small refactors

**Out of scope**

- Benchmarking

**Test spec**

- Golden: deterministic virtual time assertions
- Known failures: none acceptable
- Fuzz/stress: stress suite that runs 5k randomized scenarios under TestClock

**Definition of done**

- "No sleeps" rule documented and enforced (lint/grep in CI).

---

### v1.0.3 — Operability proof: real example + control plane demo

**Package(s)**
`@git-stunts/alfred`, `@git-stunts/alfred-live`, `@git-stunts/alfred-transport-jsonl`

**User story**
As a user, I want an end-to-end example proving live editing works.

**Requirements**

- Provide examples/control-plane/:
  - starts a service with live policies
  - changes bulkhead/retry via JSONL control
  - prints telemetry events

**Acceptance criteria**

- One command changes live behavior demonstrably (throughput/latency/rejections).

**Scope**

- examples + docs

**Out of scope**

- hosted service, cloud infra

**Test spec**

- Golden: run example in CI and assert output contains "config version changed" and behavior changed
- Known failures: non-determinism (use scripted sequence)
- Fuzz/stress: N/A

**Definition of done**

- Example is runnable in <2 minutes by a new user.
