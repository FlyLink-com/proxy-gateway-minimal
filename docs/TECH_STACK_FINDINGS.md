```yaml
document_metadata:
  doc_type: evidence
  lifecycle: active
  authority_scope: tech_stack_findings
  superseded_by: null
  last_verified_at: 2026-08-18
  production_authority: false
```

# Tech Stack Findings Round 1

> Status:
> - Type: Tech-stack debt aggregation
> - Risk: C
> - Generated: 2026-08-18
> - Source of truth for: Aggregated tech-stack observations derived from
>   repository evidence, intended as input for follow-up Risk B/C PRs
> - Execution authority: None. This document records findings; it does not
>   authorize code, schema, runtime, deployment, provider, or production changes
> - Production impact: None

## Scope and method

This document aggregates findings from three rounds of structural inspection
performed against `master@1d6b60c`:

1. **Code quality scan** (C档, no code change)
2. **Deep structural analysis** (分层、协议、依赖、活动度)
3. **Runtime stability maturity analysis** (启动/关闭、事务、重试、限流、监管)

No finding in this document was generated from a live load test or production
metrics endpoint; concrete throughput / latency numbers are not available
because the codebase does not yet expose a metrics endpoint (see F-08).

## Risk-tier definitions used here

| Tier | Meaning |
|---|---|
| F-XX | Finding identifier (do not reorder) |
| Severity | observed impact on current production scale |
| Tier-to-fix | suggested risk tier for a follow-up PR addressing this finding |
| Status | new (this round) / known (already in existing docs) / unknown |

## Findings overview

| ID | Surface | Severity | Tier-to-fix | Status |
|---|---|---|---|---|
| F-01 | SQLite sync driver blocks event loop | medium | B | known |
| F-02 | In-memory rate limiter (single-process only) | low | C | known |
| F-03 | No HTTP server timeout / keep-alive tuning | medium | C | new |
| F-04 | No security headers middleware (helmet / CSP / X-Frame-Options) | medium | C | new |
| F-05 | No CORS policy explicit at app layer | low | C | new |
| F-06 | /api/health is shallow (does not probe DB / edge) | low | C | known |
| F-07 | No metrics endpoint (Prometheus / StatsD) | medium | B | known |
| F-08 | No circuit breaker in payment provider adapters | medium | B | new |
| F-09 | Daemon launcher does not write PID file | low | C | new |
| F-10 | Structured logging absent (console.* only) | low | C | new |
| F-11 | Process-level uncaughtException only logs, does not exit | informational | – | known |
| F-12 | No async DB driver option (no node:sqlite / libsql abstraction) | low | C | new |
| F-13 | Single-process architecture: cannot horizontally scale | architectural | – | known |
| F-14 | 11 separate SQLite DBs instead of one logical DB | low | C | known |
| F-15 | Documentation load: README takes on multiple roles | low | C | new |

## F-01 — SQLite sync driver blocks event loop

**Evidence** (`package.json:152`):
```json
"better-sqlite3": "^12.10.0"
```

better-sqlite3 is a synchronous driver. Every `db.prepare(...).get/all/run()`
call blocks the V8 event loop until the SQL execution completes.

**Impact** (推测 — not benchmarked):
- < 200 RPS: imperceptible
- 200–800 RPS: dominated by simple queries, controllable
- > 1000 RPS with complex joins / scans: P99 latency degrades sharply

**Counter-measures already in place**:
- WAL mode (configured per store, not validated in this scan)
- 11 separate SQLite files instead of one big DB reduces single-DB contention

**Possible follow-up**:
- Tier-to-fix: B
- Effort: 1-2 days (WAL + busy_timeout + short transaction discipline)
- Or: 2-3 weeks (migrate to `libsql` async, keep SQLite semantics)
- Or: 3-4 weeks (Postgres + `pg`, requires schema rewrite)

## F-02 — In-memory rate limiter

**Evidence** (`server/middleware/rate-limit.mjs:9`):
```js
const buckets = new Map();
```

Two rate-limiters wired in `server/app.mjs`:
- `/sub` → by client IP
- `/sub` (credential) → by artifact hash or token hash

**Impact**: All bucket state lives in process memory. Process restart clears all
buckets; a client can flood during the first minute after restart. Single-process
deployment makes this acceptable; multi-process would require Redis.

**Possible follow-up**: Tier-to-fix: C. Effort: 1 week to introduce Redis.

## F-03 — No HTTP server timeout / keep-alive tuning

**Evidence**: `grep "server.timeout|keepAliveTimeout|headersTimeout|requestTimeout"`
returns zero matches in `server/app.mjs` and `server/start.mjs`. Node defaults
apply: `timeout = 0` (no timeout), `keepAliveTimeout = 5000ms`,
`headersTimeout = 60000ms`.

**Impact** (推测):
- Slowloris-style attacks have no server-side mitigation beyond reverse proxy
  (nginx in front, per `ops/nginx/`)
- Long-lived keep-alive sockets accumulate if downstream backpressure not handled

**Possible follow-up**: Tier-to-fix: C. Effort: half-day to set explicit
`server.timeout`, `keepAliveTimeout`, `headersTimeout` in `server/start.mjs`
after `app.listen(...)`.

## F-04 — No security headers middleware

**Evidence**: `grep -i "helmet|csp|x-frame-options"` returns zero matches in
production server code. `server/app.mjs` mounts only auth / allowlist / rate-limit
middleware; no `helmet` / `hpp` / explicit CSP.

**Impact**:
- Responses do not include `X-Frame-Options`, `X-Content-Type-Options`,
  `Strict-Transport-Security`, `Content-Security-Policy`, `Referrer-Policy`
- Subscriptions rendered as YAML / JSON have no CSP guidance to the client
- Admin pages have no clickjacking protection at the Express layer (relies
  entirely on Nginx / browser defaults)

**Possible follow-up**: Tier-to-fix: C. Effort: 1 day. Add `helmet` middleware
or handcrafted header middleware; review CSP for subscription rendering path.

## F-05 — No explicit CORS policy

**Evidence**: No `cors` middleware import in `server/app.mjs`. API is consumed
by same-origin Admin / Portal frontends; cross-origin API access not formally
allowed or denied.

**Impact**:
- Browser default is "no Access-Control-Allow-Origin" → cross-origin browser
  requests blocked. This is safe by default but undocumented.
- Future portal / mobile clients using the API will hit opaque failures.

**Possible follow-up**: Tier-to-fix: C. Effort: half-day to formalize an
explicit CORS allowlist in `server/middleware/`.

## F-06 — /api/health is shallow

**Evidence** (`server/app.mjs:334-336`):
```js
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, ts: Date.now(), authRequired: true });
});
```

**Impact**: Reports `ok:true` regardless of SQLite readiness, edge agent
reachability, or coordinator state. Cannot be used for liveness/readiness
probes that distinguish healthy from degraded.

**Possible follow-up**: Tier-to-fix: C. Effort: 1 day. Probe
`SELECT 1` against key DBs, edge-agent socket reachability, active coordinator
count.

## F-07 — No metrics endpoint

**Evidence**: `grep -i "prometheus|statsd|opentelemetry"` returns zero matches.
No `/metrics` route, no Prometheus client library import.

**Impact**:
- Cannot observe live QPS, P50/P95/P99 latency, error rates, DB query duration
- Cannot confirm or refute F-01's suspected ceiling

**Possible follow-up**: Tier-to-fix: B. Effort: 1-2 weeks for `prom-client`
+ middleware timing + DB timing histograms.

## F-08 — No circuit breaker in payment provider adapters

**Evidence**: All three payment provider adapters (chaojipay, xsd, paypal) have
explicit `retryable: false` errors but no "open after N consecutive failures"
pattern visible. The provider-adapter-registry and routing-policy likely have
attempt-failover logic across providers (seen in
`payment-routing-policy.mjs:attemptChainIsConsistent`) but per-provider
circuit-open behavior is not visible.

**Impact** (推测): When one payment provider is degraded, every commerce order
will sequentially try it, fail, and only then move on — wasting latency budget
on a known-bad provider.

**Possible follow-up**: Tier-to-fix: B. Effort: 2-3 days. Add
provider-scoped failure counter + half-open / open / closed state per
`payment-routing-policy`.

## F-09 — Daemon launcher does not write PID file

**Evidence** (`server/services/daemon-launcher.mjs:19-29`):
```js
const child = spawnFn(nodePath, [serverEntry], {
  cwd: rootDir, detached: true, stdio: "ignore", windowsHide: true,
  env: { ...env, CONSOLE_TOKEN: token }
});
child.unref?.();
```

No `fs.writeFileSync(${pidFile}, child.pid)`. systemd's `Type=simple` tracks
the daemon via cgroup so this is fine under systemd, but standalone operators
using `npm run daemon` have no PID to kill.

**Impact**: Low — only matters outside systemd.

**Possible follow-up**: Tier-to-fix: C. Effort: 1 hour.

## F-10 — Structured logging absent

**Evidence**: `grep "pino|winston|bunyan"` returns zero matches in server
production code. 5 occurrences of `console.*` across the entire server
directory (`server/start.mjs`, `server/services/ss-local.mjs`,
`server/services/http-proxy.mjs`).

**Impact**: All log output is unstructured. Cannot parse / index / alert on
logs without regex extraction. Token-redaction in logs is ad-hoc.

**Possible follow-up**: Tier-to-fix: C. Effort: 1 week. Introduce a thin
structured logger (`pino` recommended for Node 20+) with secret-redaction
filter and a request-id middleware.

## F-11 — Process-level uncaughtException only logs

**Evidence** (`server/start.mjs:464-470`):
```js
processObject.on("uncaughtException", (err) => {
  logger.error("[uncaughtException]", err.message);
});
processObject.on("unhandledRejection", (err) => {
  logger.error("[unhandledRejection]", err);
});
```

**Impact**: An uncaught error does not crash the process. This is defensive
(avoid flap), but masks serious bugs.

**Trade-off**: documented and intentional. No action required.

## F-12 — No async DB driver abstraction

**Evidence**: Single DB driver in deps (`better-sqlite3`). No `node:sqlite`,
`libsql`, `pg`, `mysql2` fallback.

**Impact**: Cannot migrate one store to async without rewriting the store +
tests. Migration is all-or-nothing per store.

**Possible follow-up**: Tier-to-fix: C (only after F-01 is decided). Effort:
2-3 weeks to migrate one store to `libsql` as a proof-of-concept.

## F-13 — Single-process architecture

**Evidence**: One Node process via systemd `Type=simple`. No cluster module,
no PM2 / pm2-equivalent. All in-memory state (F-02) and uncaught handler
(F-11) are coupled to the single process.

**Impact**: Cannot horizontally scale by adding processes. Bottleneck is
single-CPU-bound event loop + SQLite.

**Possible follow-up**: This is architectural. Multi-process redesign is
Tier A (requires schema, state, and auth contract review).

## F-14 — 11 separate SQLite databases

**Evidence** (from `package.json` migration scripts + `.env.example`):
```
SUBSCRIPTION_DB_PATH
SUBSCRIPTION_CONTROL_DB_PATH
+ 9 platform-specific DBs (wallet, commerce, payment, etc.)
```

**Impact**:
- Pro: smaller per-DB contention, independent backup/restore per concern
- Con: cross-DB transactions impossible; data model has no referential
  integrity across DBs; more files to backup / monitor

**Possible follow-up**: Tier-to-fix: C (only as part of F-01/F-13 redesign).

## F-15 — README bears too much responsibility

**Evidence**: User-facing observation (not a code defect). The root `README.md`
covers overview, install, environment, deployment, troubleshooting, and links
into many subsystem docs.

**Impact**: Documentation is harder to navigate. New operators read one file
and get partial context. Suggested split:
- `README.md` — 30-second orientation + links
- `docs/INSTALL.md` — install procedure
- `docs/OPERATIONS.md` — runtime operations
- `docs/TROUBLESHOOTING.md` — common failure modes

**Possible follow-up**: Tier-to-fix: C. Effort: 1-2 days.

## Recommended ordering for follow-up PRs

| Priority | Finding | Tier | Effort |
|---|---|---|---|
| 1 | F-04 (security headers) | C | 1 day |
| 2 | F-03 (server timeouts) | C | half-day |
| 3 | F-06 (enriched /api/health) | C | 1 day |
| 4 | F-09 (PID file) | C | 1 hour |
| 5 | F-15 (README split) | C | 1-2 days |
| 6 | F-10 (structured logging) | C | 1 week |
| 7 | F-08 (circuit breaker) | B | 2-3 days |
| 8 | F-07 (metrics endpoint) | B | 1-2 weeks |
| 9 | F-01 (DB driver re-evaluation) | B | 1-4 weeks depending on path |
| 10 | F-13 (multi-process) | A | requires design |

## Known facts vs reasonable speculation vs information gaps

**Known facts** (direct repository evidence):
- All 15 findings are grounded in file/line evidence above
- F-01, F-02, F-06, F-11, F-13, F-14 are partially or fully documented in
  existing docs (CONVENTIONS, IDENTITY_LIFECYCLE, etc.)
- F-03, F-04, F-05, F-08, F-09, F-10, F-15 are new observations

**Reasonable speculation**:
- F-01 RPS ceilings (200 / 800 / 1000+) are educated guesses, not benchmarked
- F-08's "wasting latency" claim assumes the adapter registry tries the failing
  provider before moving on (consistent with code shape but not verified)

**Information gaps**:
- No live production metrics → cannot quantify F-01 / F-07 impact
- No load test harness in repo → cannot produce baseline numbers
- F-12's migration cost depends on chosen async driver and is unknown without
  spike work

## Out of scope

This document does not:
- Authorize any code, config, schema, runtime, deployment, provider, DNS,
  Nginx, systemd, credential, or production change
- Replace `docs/PROJECT_CONTEXT.md` or `docs/CURRENT_RELEASE_STATE.md`
- Supersede any existing Risk A operational runbook

## Cross-references

- `docs/CONVENTIONS.md` — coding & docs standards
- `docs/PROJECT_CONTEXT.md` — current project handoff
- `docs/CURRENT_RELEASE_STATE.md` — current release state
- `docs/CI_MANUAL_VALIDATION.md` — CI billing-blocker runbook
- `docs/IDENTITY_LIFECYCLE.md` — runtime principal & identity gate
- `docs/INFRASTRUCTURE_ACCESS_RULE.md` — provider access policy
- `docs/OPERATOR_CLI_PLATFORM_BOUNDARY.md` — CLI/platform separation