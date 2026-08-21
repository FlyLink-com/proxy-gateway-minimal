```yaml
document_metadata:
  doc_type: evidence
  lifecycle: active
  authority_scope: tech_stack_findings
  superseded_by: null
  last_verified_at: 2026-08-18
  production_authority: false
```

# Tech Stack Findings Rounds 1 + 2 + 3 (Round 3 amendment)

> Status:
> - Type: Tech-stack debt aggregation
> - Risk: C
> - Generated: 2026-08-18
> - Source of truth for: Aggregated tech-stack observations derived from
>   repository evidence; canonical F-XX tracking ledger for follow-up Issues
>   and Risk A / B / C PR planning
> - Execution authority: None. This document records findings; it does not
>   authorize code, schema, runtime, deployment, provider, or production
>   changes. Mentioning a future Risk A piece of work here does **not**
>   authorize that work.
> - Production impact: None

## Scope and method

This document aggregates findings from three rounds of structural inspection
performed against `master@1d6b60c`:

1. **Code quality scan** (C档, no code change)
2. **Deep structural analysis** (分层、协议、依赖、活动度)
3. **Runtime stability maturity analysis** (启动/关闭、事务、重试、限流、监管)

No finding in this document was generated from a live load test or production
metrics endpoint; concrete throughput / latency numbers are not available
because the codebase does not yet expose a metrics endpoint (see F-07).

## Risk-tier definitions used here

Two **orthogonal** axes. They were collapsed into a single `Follow-up`
column in the original Round 3 (commit `22a603d`); Round 3 amendment
restores the orthogonal split.

| Axis | Meaning |
|---|---|
| F-XX | Finding identifier (do not reorder) |
| Severity | observed impact on current production scale |
| Risk tier | **process tier** for a follow-up PR — `C` (docs-only) / `B` (server small refactor, tests, small runtime behavior fixes) / `A` (Nginx / systemd / production / SQLite schema migration / deploy-rollback). Per `AGENTS.md`. |
| Status | new (this round) / known (already in existing docs) / unknown |
| Follow-up | **tracking channel only** — `Issue only` / `Issue + planned PR` / `Skipped (R-N retracted)` / `Skipped (informational)` / `Architectural — Issue only` |
| Depends on | F-XX dependency identifiers; not encoded into Follow-up |

The two are not the same concept. A finding may be `Issue only` (no
code change) at any risk tier, or `Issue + planned PR` at risk tier B.
`Follow-up` says *what work we will do*, `Risk tier` says *what process
gates that work must clear*.

### Repo risk-tier definitions (from `AGENTS.md`)

| Tier | Process | Required gates |
|---|---|---|
| C | docs-only / README / runbook / status record | `git diff --check` |
| B | server small refactor / tests / small runtime behavior fixes | `git diff --check` + `npm test` (targeted or full) |
| A | Nginx / systemd / production / SQLite schema migration / deploy-rollback | spec + dry-run + read-only inventory + operator approval + staging / clean validation + rollback plan + production gate + closeout |

## Findings overview

| ID | Surface | Severity | Risk tier | Status | Follow-up | Depends on |
|---|---|---|---|---|---|---|
| F-01 | SQLite sync driver blocks event loop | medium | B | known | Issue only | – |
| F-02 | In-memory rate limiter (single-process only) | low | A | known | Issue only | F-13 |
| F-03 | No HTTP server timeout / keep-alive tuning | medium | B | new | Issue + planned PR | – |
| F-04 | No security headers middleware (helmet / CSP / X-Frame-Options) | medium | B | new | Issue + planned PR | – |
| F-05 | No CORS policy explicit at app layer | low | – | new | Skipped (R-1 retracted) | – |
| F-06 | /api/health is shallow (does not probe DB / edge) | low | B | known | Issue + planned PR | – |
| F-07 | No metrics endpoint (Prometheus / StatsD) | medium | B | known | Issue only | – |
| F-08 | No circuit breaker in payment provider adapters | medium | B | new | Issue + planned PR | – |
| F-09 | Daemon launcher does not write PID file | low | B | new | Issue + planned PR | – |
| F-10 | Structured logging absent (console.* only) | low | B | new | Issue + planned PR | – |
| F-11 | Process-level uncaughtException only logs, does not exit | informational | – | known | Skipped (informational) | – |
| F-12 | No async DB driver option (no node:sqlite / libsql abstraction) | low | B | new | Issue only | F-01 |
| F-13 | Single-process architecture: cannot horizontally scale | architectural | A | known | Architectural — Issue only | – |
| F-14 | 11 separate SQLite DBs instead of one logical DB | low | A | known | Issue only | – |
| F-15 | Documentation load: README takes on multiple roles | low | C | new | Issue + planned PR | – |

## F-01 — SQLite sync driver blocks event loop

**Evidence** (`package.json:152`):
```json
"better-sqlite3": "^12.10.0"
```

better-sqlite3 is a synchronous driver. Every `db.prepare(...).get/all/run()`
call blocks the V8 event loop until the SQL execution completes.

**Impact**: Quantitative event-loop and P99 impact is unknown until
benchmarked. The repo does not expose a metrics endpoint (see F-07)
and no local benchmark harness was run for this scan.

**Counter-measures already in place**:
- WAL mode (configured per store, not validated in this scan)
- 11 separate SQLite files instead of one big DB reduces single-DB contention

**Possible follow-up**:
- Risk tier: **B** (WAL tuning) or **A** (driver migration)
- Effort: 1-2 days (WAL + busy_timeout + short transaction discipline, B)
- Or: 2-3 weeks (migrate to `libsql` async, keep SQLite semantics, A)
- Or: 3-4 weeks (Postgres + `pg`, requires schema rewrite, A)
- Depends on: –. Follow-up: `Issue only`.

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

**Possible follow-up**: Risk tier: **A** (architectural — introducing Redis
cross-cuts deployment topology and runtime). Tracking Issue only;
implementation must wait for F-13 multi-process design and the spec / dry-run
/ inventory / staging gate sequence. Not a C-tier "1 week" PR as the
original Round 1 wording implied.

## F-03 — No HTTP server timeout / keep-alive tuning

**Evidence**: `grep "server.timeout|keepAliveTimeout|headersTimeout|requestTimeout"`
returns zero matches in `server/app.mjs` and `server/start.mjs`. Node defaults
apply: `timeout = 0` (no timeout), `keepAliveTimeout = 5000ms`,
`headersTimeout = 60000ms`.

**Impact** (推测 — not benchmarked):
- Node already provides implicit defaults (`headersTimeout = 60000ms`,
  `keepAliveTimeout = 5000ms`); the real gap is that the contract is
  implicit and version-dependent, with no explicit boundary test
- Long-lived keep-alive sockets accumulate if downstream backpressure is
  not handled; nginx in front provides some Slowloris mitigation but is
  not a substitute for explicit server-side timeout values

**Possible follow-up**: Risk tier: **B**. Effort: half-day to set explicit
`server.timeout`, `keepAliveTimeout`, `headersTimeout` in `server/start.mjs`
after `app.listen(...)`. Depends on: –. Follow-up: `Issue + planned PR`.

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

**Note on cookie attributes**: `HttpOnly; Secure; SameSite=Strict` cookie
attributes (G-01) govern **cookie attachment behavior**. They do not replace
browser enforcement response headers (`X-Frame-Options`, `frame-ancestors`,
`X-Content-Type-Options`, `Referrer-Policy`, `Strict-Transport-Security`).
These are separate browser surfaces and need explicit headers.

**Possible follow-up**: Risk tier: **B**. Effort: 1-2 days. Add Express-level
header middleware (e.g. `helmet`, scoped) for `X-Content-Type-Options`,
`X-Frame-Options`, `Referrer-Policy`. **HSTS and CSP** involve Nginx / TLS
configuration and are out of scope; they belong to a separate A-tier PR
if attempted.

## F-05 — No explicit CORS policy

**Evidence**: No `cors` middleware import in `server/app.mjs`. API is consumed
by same-origin Admin / Portal frontends; cross-origin API access not formally
allowed or denied.

**Impact**:
- Browser default is "no Access-Control-Allow-Origin" → cross-origin browser
  requests blocked. This is safe by default but undocumented.
- Future portal / mobile clients using the API will hit opaque failures.

**Possible follow-up**: Risk tier: **–** (retracted in R-1, see R-1 below).
Effort: n/a. Follow-up: `Skipped (R-1 retracted)`.

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

**Possible follow-up**: Risk tier: **B**. Effort: 1 day. Probe
`SELECT 1` against key DBs, edge-agent socket reachability, active coordinator
count. Depends on: –. Follow-up: `Issue + planned PR`.

## F-07 — No metrics endpoint

**Evidence**: `grep -i "prometheus|statsd|opentelemetry"` returns zero matches.
No `/metrics` route, no Prometheus client library import.

**Impact**:
- Cannot observe live QPS, P50/P95/P99 latency, error rates, DB query duration
- Cannot confirm or refute F-01's suspected ceiling

**Possible follow-up**: Risk tier: **B**. Effort: 1-2 weeks for `prom-client`
+ middleware timing + DB timing histograms. Depends on: –. Follow-up: `Issue only`.

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

**Possible follow-up**: Risk tier: **B**. Effort: 2-3 days. Add
provider-scoped failure counter + half-open / open / closed state per
`payment-routing-policy`. Depends on: –. Follow-up: `Issue + planned PR`.

## F-09 — Daemon launcher does not write PID file

**Evidence** (`server/services/daemon-launcher.mjs:19-29`):
```js
const child = spawnFn(nodePath, [serverEntry], {
  cwd: rootDir, detached: true, stdio: "ignore", windowsHide: true,
  env: { ...env, CONSOLE_TOKEN: token }
});
child.unref?.();
```

No `fs.writeFileSync(${pidFile}, child.pid)`. The launcher does print and
return the child PID via the existing `LaunchResult.pid` field, so the
in-process caller can capture it. systemd's `Type=simple` tracks the
daemon via cgroup so this is fine under systemd, but standalone
operators using `npm run daemon` whose terminal output is lost, or
whose parent process has exited, lack a persistent on-disk discovery
target and a stale-PID contract.

**Impact**: Low — only matters for non-systemd operators without persistent
process discovery.

**Possible follow-up**: Risk tier: **B**. Effort: ~1 hour. Write a PID file
in the daemon launcher; add a stale-PID contract for non-systemd operators.
Depends on: –. Follow-up: `Issue + planned PR`.

## F-10 — Structured logging absent

**Evidence**: `grep "pino|winston|bunyan"` returns zero matches in server
production code. 5 occurrences of `console.*` across the entire server
directory (`server/start.mjs`, `server/services/ss-local.mjs`,
`server/services/http-proxy.mjs`).

**Impact**: All log output is unstructured. Cannot parse / index / alert on
logs without regex extraction. Token-redaction in logs is ad-hoc.

**Possible follow-up**: Risk tier: **B**. Effort: ~1 week. Introduce a thin
structured logger (`pino` recommended for Node 20+) with secret-redaction
filter and a request-id middleware. Depends on: –. Follow-up: `Issue + planned PR`.

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

**Possible follow-up**: Risk tier: **B** (depends on F-01 spike first).
Effort: 2-3 weeks to migrate one store to `libsql` as a proof-of-concept.
Depends on: **F-01**. Follow-up: `Issue only`.

## F-13 — Single-process architecture

**Evidence**: One Node process via systemd `Type=simple`. No cluster module,
no PM2 / pm2-equivalent. All in-memory state (F-02) and uncaught handler
(F-11) are coupled to the single process.

**Impact**: Cannot horizontally scale by adding processes. Bottleneck is
single-CPU-bound event loop + SQLite.

**Possible follow-up**: Risk tier: **A** (architectural — multi-process
redesign requires schema, state, and auth contract review).
Depends on: –. Follow-up: `Architectural — Issue only`.

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

**Possible follow-up**: Risk tier: **A** (SQLite schema consolidation is a
schema migration, see `AGENTS.md` tier definitions). Depends on: **F-01, F-13**.
Follow-up: `Issue only`.

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

**Possible follow-up**: Risk tier: **C**. Effort: 1-2 days. Split
`README.md` into role-specific docs (`docs/INSTALL.md`, `docs/OPERATIONS.md`,
`docs/TROUBLESHOOTING.md`). Depends on: –. Follow-up: `Issue + planned PR`.

## Known facts vs reasonable speculation vs information gaps

**Known facts** (direct repository evidence):
- All 15 findings are grounded in file/line evidence above
- F-01, F-02, F-06, F-11, F-13, F-14 are partially or fully documented in
  existing docs (CONVENTIONS, IDENTITY_LIFECYCLE, etc.)
- F-03, F-04, F-05, F-08, F-09, F-10, F-15 are new observations

**Reasonable speculation**:
- F-08's "wasting latency" claim assumes the adapter registry tries the failing
  provider before moving on (consistent with code shape but not verified)
- F-01 quantitative event-loop / P99 impact is unknown until benchmarked;
  no specific RPS ceiling is asserted by this document

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

---

# Round 2 — 2026-08-18

> Round 2 inspected 8 additional dimensions: sync I/O in production hot paths,
> dependency hygiene, Cookie / Session security, CSRF surface, input validation,
> migration rollback discipline, test coverage breadth, and IP trust policy.
>
> All Round 2 observations are derived from `master@1d6b60c` against the
> exact same source state as Round 1. No code, schema, runtime, or production
> change occurred between Round 1 and Round 2.

## Round 2 new findings

| ID | Surface | Severity | Risk tier | Status | Follow-up | Depends on |
|---|---|---|---|---|---|---|
| F-16 | spawnSync in edge adapters blocks event loop | medium | B | new | Issue + planned PR | – |
| F-17 | migration dry-run SQLite integrity hashing uses readFileSync (Round 3 review-corrected across 4 source-DB + 4 snapshot-pair contracts) | low | A | new | Issue + planned PR | – |
| F-18 | express.json() default 100kb; few routes override | low | B | new | Issue + planned PR | – |
| F-19 | Migration rollback support is partial (1 of 11 modules) | low | A | new | Issue + planned PR | – |
| F-20 | Lock file read with readFileSync on hot path candidate | low | B | new | Issue only | F-13 |

## F-16 — spawnSync in edge adapters blocks event loop

**Evidence** (5 production edge adapters, all use spawnSync to call the runtime binary):
```
server/services/edge/hysteria2-runtime-adapter.mjs:13, 83
server/services/edge/mihomo-tuic-host-runtime-adapter.mjs:13, 70
server/services/edge/sing-box-ss-runtime-adapter.mjs:11, 59
server/services/edge/xray-vless-reality-runtime-adapter.mjs:13, 100
server/services/edge/xray-stats-cli-usage-reader.mjs:1, 71
```

Shape:
```js
const result = spawnSync(command, args, { ... });
```

**Impact** (推测 — not benchmarked): every CLI call into xray / hysteria2 /
mihomo / sing-box binary blocks the V8 main thread until the process exits.
This stacks with F-01 (better-sqlite3 synchronous driver), producing a
"double-block" pattern on any code path that touches both DB and a runtime
binary in the same request.

**Possible follow-up**: Risk tier: **B**. Replace with `execFile` + Promise
wrapper, or isolate the call in `worker_threads`. Note: this changes the
edge-adapter call contract; the surrounding factory / startup code paths
must be re-reviewed for any implicit sync ordering they relied on.

## F-17 — migration dry-run SQLite integrity hashing uses readFileSync

**Evidence** (8 of 11 migration modules; call sites reviewed in Round 3
and re-confirmed in Round 3 review). The 8 cited modules split into
**two distinct contracts**:

**Contract A — source SQLite DB file hash before / after dry-run (4 modules):**
```
server/services/platform/account-resource-authority-migrations.mjs:843, 865
server/services/platform/coin-commerce-migrations.mjs:1368, 1386
server/services/platform/coin-wallet-migrations.mjs:868, 882
server/services/platform/coin-wallet-reference-index-migrations.mjs:788, 811
```

These modules check whether the source SQLite database file contents
have changed during the dry-run window. Pattern:
```js
const sourceHash = sha256File(dbPath);
await source.backup(snapshotPath);
... // applies migrations to snapshotPath
const after = sourceState(source);
if (sha256File(dbPath) !== sourceHash) {
  throw internalError("xxx_source_changed_during_dry_run", token);
}
```

`snapshotPath` exists (used for backup) but is **not** hashed.

**Contract B — backup snapshot vs verification snapshot hash (4 modules):**
```
server/services/platform/portal-registration-welcome-bonus-migrations.mjs:1251, 1273
server/services/platform/wallet-first-deferred-checkout-migrations.mjs:457, 473
server/services/platform/wallet-first-setup-delivery-handoffs-migrations.mjs:423, 439
server/services/platform/wallet-first-resource-effect-runtime-claims-migrations.mjs:385, 401
```

These modules hash the `.sqlite` snapshot files produced by
`source.backup(snapshot)` / `verification.backup(verificationSnapshot)`.
Pattern:
```js
await source.backup(snapshotPath);
const sourceSnapshotHash = sha256File(snapshotPath);
await verification.backup(verificationSnapshotPath);
sourceSnapshotUnchanged = sha256File(verificationSnapshotPath) === sourceSnapshotHash;
```

Shared helper (identical in all 8 modules):
```js
function sha256File(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}
```

Both contracts are **migration dry-run SQLite integrity checks** under
the same fail-closed gate family, but the hashes protect different
files. A streaming-hash implementation must therefore cover **both**
contracts, not just the snapshot pair.

```text
Object:  source SQLite DB file (contract A)
       OR backup / verification .sqlite snapshots (contract B)
Use:     migration dry-run integrity gate (fail-closed)
Risk:    depends on file size (grows with production DB)
```

**Impact**: SQLite DB sizes today are not measured in this document.
The forward-looking concern is memory pressure if the SQLite file
grows large: `readFileSync` materialises the whole file in memory
and holds it for the hash computation. The actual size of the source
DB files and the snapshot files at production scale is **not yet
quantified** by the evidence in this round.

**Possible follow-up**: Risk tier: **A** (touches migration dry-run
integrity contract, which `AGENTS.md` treats as A-tier SQLite
schema/migration gate territory). Switching to streaming hash is correct
in principle, but the work must:

1. Define a new migration dry-run contract that supports streaming or
   memory-bounded hashing for **both** contracts.
2. Keep byte-equality verification (not just file-size / first-byte
   checksums).
3. Re-validate all eight call sites after the contract change; the
   `sha256File(dbPath) !== sourceHash` and `sourceSnapshotUnchanged` gates are
   both fail-closed.
4. Add tests asserting the new contract on at least one large
   representative SQLite file for each contract class.
5. Distinguish tests by contract class — do not assume all 8 modules
   share the same `sourceSnapshotUnchanged` semantics.

Do **not** open a B-tier streaming-hash PR. The correct branch name
(per the canonical mapping) is `feat/migration-integrity-sha-streaming`
and it is an A-tier change because it crosses the migration integrity
gate boundary. The Issue title should be:

```text
F-17: stream SHA-256 for migration dry-run SQLite integrity files
```

## F-18 — express.json() default 100kb; few routes override

**Evidence**:
```text
server/app.mjs:332: app.use(express.json())            # default 100kb
server/routes/portal-coin-commerce.mjs:1087: strictJsonParser  # custom
server/routes/portal-coin-recharge.mjs:282: json({ limit: "32kb" })
server/routes/portal-coin-recharge.mjs:344: raw({ limit: "1mb" })
```

Only 3 routes apply an explicit body limit; the global `app.use(express.json())`
at `server/app.mjs:332` uses the default 100kb for every other write endpoint
(admin routes, subscription creation, etc.).

**Impact**: 100kb default is generous for an admin/subscription API. Larger
JSON bodies pass through silently. Defense-in-depth is uneven.

**Possible follow-up**: Risk tier: **B**. Set explicit global limit in
`server/app.mjs:332` (suggest `32kb`) and document per-route overrides.

## F-19 — Migration rollback policy is undecided, and tooling is partial

**Evidence**:
- `server/services/platform/account-resource-authority-migrations.mjs:947`
  exports `rollbackAccountResourceAuthorityMigration` (the only module
  with an exported schema-revert function).
- 4 migration modules use `source.exec("rollback")` which is a
  better-sqlite3 transaction rollback, not a schema down-migration.
- No migration module exports a `down()` or equivalent schema-revert
  function for the other 10 modules.
- No project convention document explicitly states whether migrations
  are forward-only or reversible.

**Impact**: Schema errors in production can only be fixed by writing
another forward migration. There is no test infrastructure to exercise
schema rollback for the 10 non-account-authority migrations. More
fundamentally, the project has **not yet decided** whether `down()`
exports are intended for production use, for staging / test fixtures
only, or not at all. The "forward-only" assumption and the "we should
add rollback exports" assumption are not made compatible by sequencing
alone — they are two different policy choices.

**Possible follow-up**: the two PRs below are **mutually gated** on a
policy decision, not just on schedule. The canonical mapping splits
this into two tracking rows (`F-19a` / `F-19b`), but the dependency
between them is a **policy decision**, not a delivery-order question.
The canonical mapping captures this in the `Gate` column.

1. **F-19a (C tier)**: decide and document the migration rollback
   policy in `docs/CONVENTIONS.md`. Recommended wording: "Production
   schema migrations are forward-only. `down()` exports are allowed
   only as disposable reverse fixtures for staging / test validation."
   Branch `docs/migration-forward-only`, ~half-day. Risk C; no schema
   change.
2. **F-19b (A tier)**: **only if F-19a policy requires schema
   reverts in any environment**, add `down()` exports to the
   migration modules covered by that policy, with rollback tests.
   Branch `feat/migration-rollback-exports`, ~1 day. Full A-tier gate
   sequence: spec / dry-run / read-only inventory / operator approval
   / staging / rollback plan / production gate.

**Two-policy alternatives** (explicit, both currently valid):

- **A**: Keep production forward-only. `F-19b` becomes `Issue only`
  (kept as a research item); no `down()` work is queued.
- **B**: Adopt a reversible migration contract. `F-19a` records the
  policy decision and `F-19b` is unblocked with the chosen scope.

Until the policy decision is made, do not create the F-19b Issue
(planned A-tier PR). F-19a must land first as the governance basis;
F-19b's Gate is "F-19a policy decision selects reversible / down
migrations", not simply "F-19a lands".

## F-20 — Lock file read with readFileSync on hot path candidate

**Evidence** (`server/services/platform/wallet-first-setup-delivery-escrow.mjs`):
```js
// readLockOwner (line ~575)
return normalizeLockOwner(JSON.parse(readFileSync(lockPath, "utf8")));
// releaseLock / recoverDeadWriterLock also call readLockOwner to compare
// against the owner PID / nonce before unlinking or renaming the marker.
```

**Impact**: The read is on the lock release path and on the stale-lock
recovery path (`releaseLock`, `recoverDeadWriterLock`). It is **not**
escrow state read; it is owner-marker read. Runtime frequency and
event-loop impact have **not been measured**; the "rarely" wording
from earlier rounds is not supported by code evidence and is removed.
Whether the lock owner marker is on a hot path is a profiling
question, not a code-reading conclusion.

**Possible follow-up**: **Issue only** (canonical). The "conditional"
qualifier is recorded in the `Gate / opening condition` column of the
canonical mapping, not in the Follow-up enum. Do not queue a PR. There
is no measured hot-path or event-loop delay evidence today.
"Switch to `readFile` (async) if/when lock reads become hot" is **not
an implementation commitment** — it is a gate condition. Any future PR
must clear:

1. Profiling or event-loop delay evidence (benchmark or production trace)
2. Full B-tier scope: lifecycle of `readLockOwner` / `openExclusiveLock` /
   `releaseLock` / `recoverDeadWriterLock` / factory call chain
3. Async-propagation boundary decision (per-helper or whole-trio)
4. Stale-owner recovery semantics preserved under async
5. Concurrent-writer race analysis (the create-then-immediately-read invariant
   of `releaseLock` line ~628 and `recoverDeadWriterLock` line ~649)
6. Live-owner non-eviction preserved under async
7. Malformed / broken lock fail-closed behavior preserved
8. `releaseLock` must not delete another process's marker
9. `createWalletFirstSetupDeliveryEscrow` factory / API contract decision
   (sync vs async — affects every caller)

Until the gate is cleared, F-20 stays an **Issue only** with F-13 as
its dependency. A previously opened intent-capture draft PR was
reviewed in Round 2 and closed / superseded; F-20 does not currently
have an anchor PR.

## Round 2 positive observations (baseline evidence)

These are not findings — they record what is already correct at
`master@1d6b60c` and should serve as the baseline when proposing changes.

| ID | Dimension | Evidence | Verdict |
|---|---|---|---|
| G-01 | Admin cookie security | `server/services/platform/admin-auth.mjs:128` — `HttpOnly; Secure; SameSite=Strict; Max-Age=...` | strong |
| G-02 | IP trust is allowlist-based | `server/app.mjs:368` (resolver assembly) + `server/tests/ip-address.test.mjs:40` — `resolveClientIp` ignores X-Forwarded-For unless direct peer is explicitly trusted | strong |
| G-03 | Admin allowlist IP | `server/tests/admin-allowlist.test.mjs:81` — "uses X-Forwarded-For only for configured trusted proxies" | strong |
| G-04 | Dependency hygiene | `npm audit` — 119 deps total, 0 vulnerabilities | strong |
| G-05 | Test-to-source ratio | 279 test files vs 216 source files = 1.29 | strong |
| G-06 | Migration form | 11 `*-migrations.mjs` modules; no raw `.sql`; each migration has a dedicated `.test.mjs` | strong |
| G-07 | Token storage | `pgsub_*` / `pgtmp_*` tokens — only URL path; storage uses `token_hash` (`token_prefix` retained for diagnostics) | strong |
| G-08 | Server-side template rendering | 0 matches for `res.render\|escapeHtml\|sanitizeHtml` in production server code; subscriptions return YAML / JSON only | narrow positive (server-side only) — gap: `public/` and `admin/` frontend XSS surface not audited |

## Round 2 retracted or re-scoped judgments

Three Round 1 judgments need to be revised after Round 2 evidence:

### R-1 — F-05 "No explicit CORS policy" is retracted

Round 1 said "no CORS policy explicit at app layer". Round 2 evidence shows:

- The project has no `cors` middleware import.
- The Admin / Portal frontends are same-origin.
- No CORS middleware means browsers default-deny cross-origin requests.

This is a safe default, not an undocumented gap. F-05 is **retracted**.

A future portal / mobile API consumer will need an explicit allowlist; that
should be recorded in `docs/OPERATOR_CLI_PLATFORM_BOUNDARY.md` as a "to-do
before public API" item rather than as a current vulnerability.

### R-2 — F-04 "No security headers middleware" is re-scoped

Round 1 said "no helmet / CSP / X-Frame-Options / Strict-Transport-Security".
Round 2 evidence shows that the Admin API relies on `SameSite=Strict`
cookies (G-01) plus same-origin consumption (G-02).

Re-scope rationale (Round 3 review correction): `SameSite=Strict`
addresses **cookie attachment behavior**. It does not replace the
browser enforcement response headers (`X-Frame-Options`, `frame-ancestors`,
`X-Content-Type-Options`, `Referrer-Policy`, `Strict-Transport-Security`).
These are separate browser surfaces and remain a real gap for HTML
pages hosting subscription download buttons and admin login.

F-04 severity stays **medium** (was already medium in Round 1; the
"low → low" wording in the prior Round 2 was an editing mistake and
is corrected here). The Round 1 priority list is unchanged in intent;
the priority table is regenerated against the orthogonal Risk-tier
model (see Round 3 amendment).

### R-3 — F-13 "Single-process architecture" status

Round 1 marked F-13 as "architectural — no fix recommended". Round 2 did not
find new evidence. Status unchanged.

## Updated recommended ordering for follow-up PRs

**This Round 2 ordering table is superseded by the Round 3 amendment
ordering table**, which now reflects the orthogonal Risk-tier model,
the F-20 Issue-only + Gate reclassification, the F-17 fact correction
(migration snapshot SQLite files, not migration source files), and the
F-19a / F-19b sub-deliverable split.

## Round 2 known facts vs reasonable speculation vs information gaps

**Known facts**: All 5 new findings (F-16 ~ F-20) and all 8 positive
observations (G-01 ~ G-08) are grounded in file/line evidence listed above.

**Reasonable speculation**: F-16's "double-block" framing depends on the
relative cost of `better-sqlite3` vs `spawnSync(xray)` and is not benchmarked.

**Information gaps**: Unit test vs integration test ratio within the 279
test files is not yet quantified (Round 3 candidate).

---

# Round 3 — 2026-08-18

> Round 3 inspects 1 cross-cutting dimension introduced after Round 2:
> how to convert the 20 findings above from a fact ledger into a tracking
> ledger that downstream Issue / PR work can consume without re-reading this
> document.
>
> All Round 3 observations are derived from the same source state
> `master@1d6b60c` and the merged Round 2 commit `bf56272`. No code, schema,
> runtime, or production change occurred between Round 2 and Round 3.

## Round 3 scope

This round does **not** introduce F-21+ findings. It only:

1. Adds a `Follow-up` column to both overview tables (Round 1 + Round 2).
2. Locks the column semantics so the rest of the project can rely on it.
3. Provides a 1:1 mapping from F-XX to Issue / PR intent, without yet
   opening the Issues or PRs themselves.

F-21+ candidates (supply-chain / control-plane linkage, hardening.md
cross-reference) are explicitly **deferred** to a separate docs-only PR.
This Risk C aggregation already references several Risk A items
(F-02 / F-13 / F-14 / F-19b), so the round-3 review-1 claim that
"Risk A cross-references cannot appear in a Risk C document" is no
longer accurate. The actual boundary is:

> A Risk C evidence document may **describe** Risk A future work,
> but does not **authorize** it. Authorizing Risk A work still
> requires the full `AGENTS.md` A-tier process (spec, dry-run,
> read-only inventory, operator approval, staging, rollback plan,
> production gate, closeout).

## Follow-up column semantics (canonical, 5-value closed enum)

This is the single source of truth for the `Follow-up` column. The
deprecated `Issue + small PR` value present in earlier drafts is removed.

| Value | Meaning |
|---|---|
| `Issue only` | Tracking Issue, no immediate code change. Architectural / cross-cutting / blocked. |
| `Issue + planned PR` | Tracking Issue + a planned PR whose scope already exists. The actual risk tier is in the separate Risk-tier column; PR may be C / B / or A. |
| `Architectural — Issue only` | Same as `Issue only`, but explicitly requires design before any code. |
| `Skipped (R-N retracted)` | Withdrawn by a Round N retraction (see R-1, R-2, R-3). |
| `Skipped (informational)` | Documented for awareness only; no fix intended. |

The Risk-tier column is **orthogonal** to Follow-up. A `Issue only` entry
can sit at any Risk tier (e.g. F-02 is Risk A; F-01 spike is Risk B/A).
The two columns must agree with the canonical overview tables above and
with the Issue creation order / PR execution order below.

## F-XX canonical mapping (single source of truth)

This table replaces both the Round 1 `Recommended ordering for follow-up
PRs` table and the older Round 3 F-XX mapping. It is the only F-XX
tracking ledger in this document.

`Risk tier` carries only the process tier (per `AGENTS.md`: C / B / A).
Conditionality and path choices live in the `Gate / opening condition`
column. F-19 is split into two sub-deliverables (F-19a, F-19b), each
tracked as its own row with its own Risk tier.

| ID | Risk tier | Follow-up | Depends on | Intended Issue title | Intended PR scope | Gate / opening condition |
|---|---|---|---|---|---|---|
| F-01 | B | Issue only | – | F-01: evaluate async DB driver path (better-sqlite3 vs node:sqlite vs libsql) | – | Spike must choose B (WAL / busy_timeout) vs A (driver migration) path |
| F-02 | A | Issue only | F-13 | F-02: in-memory rate limiter cannot scale across processes | – | F-13 design + Redis decision |
| F-03 | B | Issue + planned PR | – | F-03: add HTTP server timeout / keep-alive tuning | `fix/http-server-timeouts` (B, ~half-day) | – |
| F-04 | B | Issue + planned PR | – | F-04: add security headers middleware (re-scoped; HSTS/CSP excluded as A) | `fix/security-headers-reduced-scope` (B, ~1 day) | – |
| F-05 | – | Skipped (R-1 retracted) | – | – | – | – |
| F-06 | B | Issue + planned PR | – | F-06: enrich /api/health to probe DB and edge | `fix/health-probe-db-and-edge` (B, ~1 day) | – |
| F-07 | B | Issue only | – | F-07: metrics endpoint (Prometheus / StatsD) | – | Infra decision + B-tier PR scope |
| F-08 | B | Issue + planned PR | – | F-08: circuit breaker in payment provider adapters | `feat/payment-circuit-breaker` (B, ~2-3 days) | – |
| F-09 | B | Issue + planned PR | – | F-09: daemon launcher PID file (with stale-PID contract) | `fix/daemon-pid-file` (B, ~1 hour) | – |
| F-10 | B | Issue + planned PR | – | F-10: structured logging | `feat/structured-logging` (B, ~1 week) | – |
| F-11 | – | Skipped (informational) | – | – | – | – |
| F-12 | B | Issue only | F-01 | F-12: async DB driver abstraction layer | – | F-01 spike result |
| F-13 | A | Architectural — Issue only | – | F-13: multi-process / horizontal scale design | – | Design must land before any code |
| F-14 | A | Issue only | F-01, F-13 | F-14: consolidate 11 SQLite DBs into one logical schema | – | F-01 + F-13 must land |
| F-15 | C | Issue + planned PR | – | F-15: split README into role-specific docs | `docs/readme-split` (C, ~1-2 days) | – |
| F-16 | B | Issue + planned PR | – | F-16: replace spawnSync with async execFile in edge adapters | `refactor/edge-spawn-async` (B, ~2-3 days) | – |
| F-17 | A | Issue + planned PR | – | F-17: stream SHA-256 for migration dry-run SQLite integrity files | `feat/migration-integrity-sha-streaming` (A, ~1 day) | – |
| F-18 | B | Issue + planned PR | – | F-18: explicit body limit on global json parser | `fix/express-json-limit` (B, ~half-day) | – |
| F-19a | C | Issue + planned PR | – | F-19a: record migration forward-only policy in docs | `docs/migration-forward-only` (C, ~half-day) | – |
| F-19b | A | Issue + planned PR | F-19a | F-19b: add per-migration `down()` exports and tests | `feat/migration-rollback-exports` (A, ~1 day) | F-19a policy decision selects reversible / down migrations |
| F-20 | B | Issue only | F-13 | F-20: lock file async read on hot path | – | F-13 design + profiling / event-loop evidence |

### F-19 sub-deliverable split (two tracking rows, two PRs)

F-19 was originally one finding, but the work it implies crosses two
risk tiers. To keep Risk tier a single axis and to allow each
deliverable to gate independently, F-19 is tracked as two rows:

| Row | Title | Risk tier | PR scope | Gate |
|---|---|---|---|---|
| F-19a | migration forward-only policy in docs | C | `docs/migration-forward-only` (C, ~half-day) | – |
| F-19b | per-migration `down()` exports + tests | A | `feat/migration-rollback-exports` (A, ~1 day) | F-19a must land first so the forward-only policy is the governance basis |

F-19b is a SQLite schema/migration gate change, so it follows the full
`AGENTS.md` A-tier process (spec, dry-run, read-only inventory,
operator approval, staging validation, rollback plan).

### F-20 conditional Issue only (now: Issue only + Gate)

F-20 is tracked as `Issue only`. The conditionality ("do not queue a
PR until evidence + design exist") lives in the `Gate / opening
condition` column, not in the Follow-up enum. No PR is queued until
both gates are cleared:

1. Profiling or event-loop evidence shows lock reads are on a hot path
2. F-13 multi-process design lands (because asyncifying the lock
   lifecycle is part of that larger redesign)

When/if a B-tier implementation PR is opened, its scope must cover all
of:

- profiling / event-loop evidence
- lock lifecycle scope (acquire / read / release / recover)
- async propagation boundary
- stale-owner semantics
- concurrent-writer race analysis (the create-then-immediately-read
  invariant in factory + capture path)
- live-owner non-eviction
- malformed / broken lock fail-closed
- release must not delete foreign marker
- factory / API sync-vs-async decision

A PR titled "convert readFileSync to readFile in lock helpers" or any
similar narrow asyncification is **not** acceptable as F-20 closure.

## Tracking invariants (canonical, hand-checked)

These invariants must hold for any reader of this document. They are
checked by hand against the overview tables, the F-XX canonical mapping,
the Issue creation order, and the PR execution order.

1. **Closed enum**: every `Follow-up` value is exactly one of the 5
   canonical values above. Parenthetical overrides (e.g. `Issue only
   (depends on F-01)`) are not allowed.
2. **PR scope coupling**: a row's `Intended PR scope` cell is **non-
   empty** **iff** `Follow-up` is exactly `Issue + planned PR`. Any other
   Follow-up value (including `Issue only`, `Architectural — Issue only`,
   and any `Skipped (*)`) MUST have an empty PR scope cell.
3. **Queue separation**: items with `Issue only` / `Architectural —
   Issue only` / `Skipped (*)` are **excluded** from the PR execution
   order. Only items with `Issue + planned PR` appear there.
4. **Skipped closure**: any row with `Skipped (R-N retracted)` or
   `Skipped (informational)` has both `Intended Issue title` and
   `Intended PR scope` empty.

## Issue creation order (canonical, 19 review-ready)

Issue titles are stable across the next batch Issue creation step. They
will be opened in a single batch with the body format documented below
this table. Issues are not opened until the user explicitly confirms.

The columns below are byte-for-byte copies of the canonical mapping
columns. `Depends on` and `Gate / opening condition` are kept
distinct; one is the F-XX dependency identifier, the other is the
opening condition for the next concrete PR.

| # | Issue title | Risk tier | Follow-up | Depends on | Gate / opening condition |
|---|---|---|---|---|---|
| 1 | F-13: multi-process / horizontal scale design | A | Architectural — Issue only | – | Design must land before any code PR |
| 2 | F-20: lock file async read on hot path | B | Issue only | F-13 | F-13 design + profiling / event-loop evidence |
| 3 | F-01: evaluate async DB driver path | B | Issue only | – | Spike must choose B (WAL / busy_timeout) vs A (driver migration) path |
| 4 | F-02: in-memory rate limiter cannot scale across processes | A | Issue only | F-13 | F-13 design + Redis decision |
| 5 | F-12: async DB driver abstraction layer | B | Issue only | F-01 | F-01 spike result |
| 6 | F-14: consolidate 11 SQLite DBs into one logical schema | A | Issue only | F-01, F-13 | F-01 + F-13 must land |
| 7 | F-07: metrics endpoint (Prometheus / StatsD) | B | Issue only | – | Infra decision + B-tier PR scope |
| 8 | F-03: add HTTP server timeout / keep-alive tuning | B | Issue + planned PR | – | – |
| 9 | F-04: add security headers middleware (re-scoped) | B | Issue + planned PR | – | – |
| 10 | F-06: enrich /api/health to probe DB and edge | B | Issue + planned PR | – | – |
| 11 | F-08: circuit breaker in payment provider adapters | B | Issue + planned PR | – | – |
| 12 | F-09: daemon launcher PID file (with stale-PID contract) | B | Issue + planned PR | – | – |
| 13 | F-10: structured logging | B | Issue + planned PR | – | – |
| 14 | F-16: replace spawnSync with async execFile in edge adapters | B | Issue + planned PR | – | – |
| 15 | F-17: stream SHA-256 for migration dry-run SQLite integrity files | A | Issue + planned PR | – | – |
| 16 | F-18: explicit body limit on global json parser | B | Issue + planned PR | – | – |
| 17 | F-19a: decide and document migration rollback policy | C | Issue + planned PR | – | – |
| 18 | F-19b: add per-migration `down()` exports and tests | A | Issue + planned PR | F-19a | F-19a policy decision selects reversible / down migrations |
| 19 | F-15: split README into role-specific docs | C | Issue + planned PR | – | – |

**F-19b special semantics**: per the F-19 section, the F-19b Issue
body must record the policy decision outcome from F-19a. If F-19a
chooses "production forward-only", the F-19b Issue body must convert
F-19b to `Issue only` (research item) and **not** open an A-tier PR.
If F-19a chooses a reversible migration contract, F-19b's planned A-tier
PR is unblocked in the spec scope selected by F-19a.

Issue batch is **not** opened until the user explicitly confirms this
title list. Each Issue body uses the format:

```
## Source finding
F-XX — <one-line from PR #629>

## Evidence
<file:line pointers from PR #629>

## Risk tier
<C / B / A — from PR #629 canonical mapping>

## Follow-up
<from PR #629 canonical mapping>

## Depends on
<from PR #629 canonical mapping>

## Gate / opening condition
<from PR #629 canonical mapping; "—" if none>

## Proposed scope
- If Follow-up = "Issue + planned PR": describe PR outline and branch name
- If Follow-up = "Issue only": describe the next concrete gate that must
  be cleared before any PR can be opened
- If Follow-up = "Architectural — Issue only": describe the design
  questions that need answers before code
- If Follow-up = "Skipped": N/A — Issue is informational only

## Out of scope
- Risk A changes (production / Nginx / systemd / credential / schema
  migration) unless this finding is itself A
```

## PR execution order (canonical, only Issue + planned PR items)

PRs are **not** opened in the Issue batch. Each PR requires its own
scope confirmation and Risk-tier process gates (per `AGENTS.md`).
Items in `Issue only`, `Architectural — Issue only`, and `Skipped (*)`
do not appear here. By construction this table is exactly the rows
whose `Follow-up = Issue + planned PR` in the canonical mapping.

| # | Branch | Finding | Risk tier | Effort | Notes |
|---|---|---|---|---|---|
| 1 | `docs/readme-split` | F-15 | C | 1-2 days | Doc-only gate. |
| 2 | `fix/express-json-limit` | F-18 | B | ~half-day | Smallest B-tier server PR. |
| 3 | `fix/daemon-pid-file` | F-09 | B | ~1 hour | Plus stale-PID contract. |
| 4 | `fix/http-server-timeouts` | F-03 | B | ~half-day | Server `start.mjs` only. |
| 5 | `fix/health-probe-db-and-edge` | F-06 | B | ~1 day | `/api/health` enrichment. |
| 6 | `fix/security-headers-reduced-scope` | F-04 | B | ~1 day | Express middleware; HSTS/CSP excluded as A. |
| 7 | `feat/migration-integrity-sha-streaming` | F-17 | A | ~1 day | Migration dry-run source-integrity contract. Full A-tier gate. |
| 8 | `refactor/edge-spawn-async` | F-16 | B | ~2-3 days | execFile + Promise; call contract change. |
| 9 | `feat/payment-circuit-breaker` | F-08 | B | ~2-3 days | Per-provider open/half-open. |
| 10 | `feat/structured-logging` | F-10 | B | ~1 week | Pino + secret-redaction. |
| 11 | `docs/migration-forward-only` | F-19a | C | ~half-day | Forward-only policy in docs. |
| 12 | `feat/migration-rollback-exports` | F-19b | A | ~1 day | Per-migration `down` exports + tests. Full A-tier gate. |

`F-05`, `F-11` do not appear (Skipped). `F-13`, `F-20`, `F-01`, `F-02`,
`F-07`, `F-12`, `F-14` are `Issue only` / `Architectural — Issue only`
and do **not** appear here; they live in `Deferred work / gate
ordering` below.

## Deferred work / gate ordering (Issue only / Architectural — Issue only)

These items have no PR queued yet. Their ordering matters for sequencing
the next batch of work but they are not part of the PR execution order
above.

| # | Finding | Risk tier | Gate / opening condition |
|---|---|---|---|
| 1 | F-13 | A | Multi-process design must land before any code PR can be opened. |
| 2 | F-20 | B | F-13 design + profiling / event-loop evidence required before a B-tier async-lock PR. |
| 3 | F-01 | B | Spike output chooses B (WAL/busy_timeout) vs A (driver migration) path. |
| 4 | F-02 | A | F-13 design + Redis decision. |
| 5 | F-12 | B | F-01 spike result. |
| 6 | F-07 | B | Infra decision + B-tier PR scope. |
| 7 | F-14 | A | F-01 + F-13 must land first. |

## Round 3 amendment known facts vs reasonable speculation vs information gaps

**Known facts**:
- All 20 findings have Follow-up, Risk tier, and Depends on values
- Follow-up is now a closed 5-value enum; dependencies are in their own
  column, not parenthetical in the Follow-up value
- F-20 is `Issue only` (no PR queued); its conditionality is recorded
  in the `Gate / opening condition` column, not in the Follow-up enum
- F-17 was fact-corrected: hashed object is the SQLite `.sqlite`
  snapshot/verification file used in dry-run source integrity, not the
  migration source file; tier raised to **A** (touches migration
  integrity gate)
- F-19 is split into two Issues / two PRs as F-19a (C) + F-19b (A)
- PR execution order contains exactly the rows with `Follow-up =
  Issue + planned PR`; `Issue only` / `Architectural — Issue only` rows
  live in `Deferred work / gate ordering`
- Issue creation order and PR execution order are separate lists

**Reasonable speculation**:
- "Intended PR scope" branch names are working titles
- Effort estimates are working estimates
- The PR execution order above is a working priority; each PR still
  needs its own scope confirmation

**Information gaps**:
- Unit test vs integration test ratio within the 279 test files is not
  yet quantified
- F-21+ supply-chain cross-references (deferred, see Round 3 scope)
- Benchmark / profiling evidence for F-20 (gating the eventual B-tier PR)
