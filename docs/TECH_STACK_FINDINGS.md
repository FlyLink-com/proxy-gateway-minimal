```yaml
document_metadata:
  doc_type: evidence
  lifecycle: active
  authority_scope: tech_stack_findings
  superseded_by: null
  last_verified_at: 2026-08-18
  production_authority: false
```

# Tech Stack Findings Rounds 1 + 2 + 3

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

No `fs.writeFileSync(${pidFile}, child.pid)`. The launcher does print and
return the child PID via the existing `LaunchResult.pid` field, so the
in-process caller can capture it. systemd's `Type=simple` tracks the
daemon via cgroup so this is fine under systemd, but standalone
operators using `npm run daemon` whose terminal output is lost, or
whose parent process has exited, lack a persistent on-disk discovery
target and a stale-PID contract.

**Impact**: Low — only matters for non-systemd operators without persistent
process discovery.

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
| F-17 | SHA-256 of migration files uses readFileSync | low | B | new | Issue + planned PR | – |
| F-18 | express.json() default 100kb; few routes override | low | B | new | Issue + planned PR | – |
| F-19 | Migration rollback support is partial (1 of 11 modules) | low | A (docs policy: C) | new | Issue + planned PR | – |
| F-20 | Lock file read with readFileSync on hot path candidate | low | B (gated by F-13) | new | Issue only | F-13 |

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

## F-17 — SHA-256 of migration files uses readFileSync

**Evidence** (8 of 11 migration modules):
```
server/services/platform/account-resource-authority-migrations.mjs:801
server/services/platform/coin-commerce-migrations.mjs:1327
server/services/platform/coin-wallet-migrations.mjs:826
server/services/platform/coin-wallet-reference-index-migrations.mjs:736
server/services/platform/portal-registration-welcome-bonus-migrations.mjs:1183
server/services/platform/wallet-first-deferred-checkout-migrations.mjs:409
server/services/platform/wallet-first-setup-delivery-handoffs-migrations.mjs:372
server/services/platform/wallet-first-resource-effect-runtime-claims-migrations.mjs:334
```

Shape:
```js
return createHash("sha256").update(readFileSync(filePath)).digest("hex");
```

**Impact**: Migration apply is a cold-start path so this is not a hot-path
problem today. The concern is forward-looking: if migrations ever run in a
hot path or grow large, this pattern adds another sync I/O on top of F-01.

**Possible follow-up**: Risk tier: **B**. Switch to streaming hash via
`createReadStream` + `pipeline(createReadStream, hash)` once migration files
exceed a few MB. Note: if the hash check becomes a migration gate, the
implementation is **A** tier (it would touch schema/data migration flow).

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

## F-19 — Migration rollback support is partial

**Evidence**:
- `server/services/platform/account-resource-authority-migrations.mjs:947`
  exports `rollbackAccountResourceAuthorityMigration` (only migration with
  an exported schema-revert function)
- 4 migration modules use `source.exec("rollback")` which is a
  better-sqlite3 transaction rollback, not a schema down-migration
- No migration module exports a `down()` or equivalent schema-revert function
  for the other 10 modules

**Impact**: Once a forward migration is applied, schema errors can only be
fixed by writing another forward migration. There is no test infrastructure
to exercise schema rollback for the 10 non-account-authority migrations.

**Possible follow-up**: Risk tier for **docs-only policy recording** is **C**;
risk tier for **adding rollback / down-migration code** is **A** (SQLite
schema migration). Split into two Issues / two PRs if both are pursued:

1. **C tier PR**: record forward-only policy in `docs/CONVENTIONS.md`
2. **A tier PR**: add `down()` exports to all 11 migration modules with
   rollback tests (must clear the schema-migration gate sequence:
   spec / dry-run / inventory / operator approval / staging / rollback plan)

Do **not** bundle both into one C-tier "1 day" PR.

## F-20 — Lock file read with readFileSync on hot path candidate

**Evidence** (`server/services/platform/wallet-first-setup-delivery-escrow.mjs:575`):
```js
return normalizeLockOwner(JSON.parse(readFileSync(lockPath, "utf8")));
```

**Impact**: Today the lock file is read rarely (escrow state read), so this
is informational. If the lock becomes a per-checkout hot read, it adds to
F-01 / F-16.

**Possible follow-up**: **Conditional Issue only**. Do not queue a PR.
There is no measured hot-path or event-loop delay evidence today.
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
its dependency. The companion intent-capture PR (separate branch
`fix/lock-file-intentional-sync-trio`, PR #630) pins the current
synchronous trio so the gate does not get silently bypassed.

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
ordering table**, which now reflects the orthogonal Risk-tier model
and the F-20 conditional-Issue-only reclassification.

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
cross-reference) are explicitly **deferred** to a separate docs-only PR
because mixing Risk A cross-references into this Risk C aggregation would
violate the tier separation.

## Follow-up column semantics

| Value | Meaning |
|---|---|
| `Issue only` | Tracking Issue, no immediate code change. Architectural / cross-cutting / blocked. |
| `Issue + small PR` | Tracking Issue + an open-source PR (C tier) to land the change. Owner not yet assigned. |
| `Issue + planned PR` | Tracking Issue + a B tier PR whose outline already exists. |
| `Architectural — Issue only` | Same as `Issue only`, but explicitly requires design before any code. |
| `Skipped (R-N retracted)` | Withdrawn by a Round 2 retraction (see R-1, R-2, R-3). |
| `Skipped (informational)` | Documented for awareness only; no fix intended. |

## F-XX → Follow-up mapping

| ID | Follow-up | Intended Issue title | Intended PR scope |
|---|---|---|---|
| F-01 | Issue only | F-01: evaluate async DB driver path (better-sqlite3 vs node:sqlite vs libsql) | None yet — requires spike |
| F-02 | Issue only | F-02: in-memory rate limiter cannot scale across processes | None yet — depends on F-13 |
| F-03 | Issue + small PR | F-03: add HTTP server timeout / keep-alive tuning | `fix/http-server-timeouts` (C tier, ~half-day) |
| F-04 | Issue + small PR | F-04: add security headers middleware (re-scoped) | `fix/security-headers-reduced-scope` (C tier, ~1 day) |
| F-05 | Skipped (R-1 retracted) | — | — |
| F-06 | Issue + small PR | F-06: enrich /api/health to probe DB and edge | `fix/health-probe-db-and-edge` (C tier, ~1 day) |
| F-07 | Issue only | F-07: metrics endpoint (Prometheus / StatsD) | None yet — depends on infra |
| F-08 | Issue + planned PR | F-08: circuit breaker in payment provider adapters | `feat/payment-circuit-breaker` (B tier, ~2-3 days) |
| F-09 | Issue + small PR | F-09: daemon launcher PID file | `fix/daemon-pid-file` (C tier, ~1 hour) |
| F-10 | Issue + small PR | F-10: structured logging | `feat/structured-logging` (C tier, ~1 week) |
| F-11 | Skipped (informational) | — | — |
| F-12 | Issue only (depends on F-01) | F-12: async DB driver abstraction layer | None yet — depends on F-01 spike |
| F-13 | Architectural — Issue only | F-13: multi-process / horizontal scale design | None yet — requires design |
| F-14 | Issue only | F-14: consolidate 11 SQLite DBs into one logical schema | None yet — large surface |
| F-15 | Issue + small PR | F-15: split README into role-specific docs | `docs/readme-split` (C tier, ~1-2 days) |
| F-16 | Issue + planned PR | F-16: replace spawnSync with async execFile in edge adapters | `refactor/edge-spawn-async` (B tier, ~2-3 days) |
| F-17 | Issue + small PR | F-17: stream SHA-256 of migration files | `fix/migration-sha-streaming` (C tier, ~1 day) |
| F-18 | Issue + small PR | F-18: explicit body limit on global json parser | `fix/express-json-limit` (C tier, ~half-day) |
| F-19 | Issue + small PR | F-19: migration rollback policy decision + exports | `fix/migration-rollback-exports` (C tier, ~1 day) |
| F-20 | Issue + small PR | F-20: lock file async read on hot path | `fix/lock-file-async-read` (C tier, ~1 hour) |

## Issue / PR draft titles (review-ready)

The titles above are stable across the next batch Issue creation step.
They will be opened in a single batch with the body format:

```
## Source finding
F-XX — <one-line from PR #629>

## Evidence
<file:line pointers from PR #629>

## Risk tier
<C / B / A — from PR #629 amended Follow-up table>

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

No Issue / PR body is opened until the user explicitly confirms the
title list. The Issue batch and PR execution queue are tracked under
"Issue creation order" and "PR execution order" in the Round 3
amendment above. PRs are **not** part of the Issue batch; each PR
requires its own scope confirmation and Risk-tier process gates.

## Round 3 amendment known facts vs reasonable speculation vs information gaps

**Known facts**:
- All 20 findings have Follow-up, Risk tier, and Depends on values
- Follow-up is now a closed 5-value enum; dependencies are in their own
  column, not parenthetical in the Follow-up value
- F-20 is conditional Issue only (no PR queued) until profiling /
  event-loop evidence exists and F-13 multi-process design lands
- Issue creation order and PR execution order are separate lists
- Issue batch and PR execution are separate batches; PRs are not opened
  in the Issue batch

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