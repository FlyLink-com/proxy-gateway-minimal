# Admin usage summary and reconciliation

```yaml
document_metadata:
  doc_type: operational
  lifecycle: active
  authority_scope: admin_usage_ledger_slice
  superseded_by: null
  last_verified_at: 2026-10-18
  production_authority: false
```

## Intent and current stage

### Query03 follow-up, 2026-10-18 (local source work only)

The later [#790 query03 execution receipt](https://github.com/FlyLink-com/proxy-gateway-minimal/pull/790#issuecomment-6252043582)
supersedes the earlier pending-query notes below: source #790 merged and its
candidate was installed inactive; prepare/upload passed, but the single
readonly query stopped at 10,003 ms with `reader_killed_worker` and no DTO.
Cleanup and application/database file identity checks passed. No activation
or collector change occurred. No consumed record may be retried. The receipt
does not identify the precise failing callback, SQL phase or a collector outage.

This follow-up is Risk B source work, one PR, `control-plane-app`,
`identity_impact: false`; validation uses synthetic local fixtures only.
Production/provider impact: none. No schema/index, authentication, reader
deadline, one-million-row cap, caching or billing changes are included.

Local profiling of the exact #790 baseline found window aggregation to be the
largest remaining phase. The small repair removes the redundant global
sample-count/byte/latest aggregates: these fold the at-most-six disjoint source
category rows using BigInt. Global positive-account counts retain their own
four CASE/DISTINCT aggregates because accounts overlap categories; they must
not be summed. The original category SQL and its comparison semantics remain
unchanged. A separate local aggregate-FILTER experiment showed no additional
clear improvement over the fold-only variant and was not retained.
Whole-snapshot validation and reconciliation still run first, retaining
invalid-data and signed-64-bit overflow rejection before any result is exposed.

The synthetic profiler now pins #790 (`26b837e882af`) as its baseline and can
vary account/rollup cardinality and all four sample timestamps. This corrects
the previous fixed 61-account/181-rollup workload's coverage gap; it is not a
claim about the real population. The old results below retain their original
baseline and validity. This follow-up's source validation is recorded below;
production acceptance and activation have not been performed.

Validated query source (LF SHA-256):
`5ef2b026f24c96d0ae597ab8d9368ebf50732ead0dec6c5dce4b391164598569`,
implementation commit `f346b13d2d11135aad948b5f68f049a26ab63109`.
The earlier Windows measurement used CRLF SHA-256
`e5f85cb73f4e83cb74620e6d4223d85628a5833aaa8dbf7af3faf42b31ef4a86`;
reconstructing CRLF from the committed LF bytes reproduced that exact digest.
The 117 ledger tests and full Windows suite then passed on the LF source.

Fresh validation in this follow-up:

- Five new deterministic tests: one resource regression failed against #790
  (24 global window columns instead of four), then passed after the repair.
  The other four guard full DTO equality with overlapping accounts and six
  categories, NOCASE/CASE DISTINCT behavior, exact near-int64 byte totals,
  and cross-category overflow rejection.
- Windows Node 24.16.0: all 117 ledger tests passed; full `npm test` reported
  6,588 tests, 6,519 passed, 69 skipped and zero failures. Dependencies were
  reused only after matching the lockfile; this is not a clean-host full CI.
- WSL Node 22.23.1: 53 query/performance tests passed, zero skips/failures.
  This was an affected-boundary Linux run, not a full Linux suite. The exact
  committed source was exported into a fresh private directory with synthetic
  data and an isolated network namespace. The initial Windows-worktree path
  mismatch was corrected locally; both temporary directories were removed.
- One independent read-only generic Security Review fallback found no
  reportable issue on the exact query, test and profiler source hashes.
  Dedicated Security Review tooling was unavailable; no dedicated-tool or
  production-review result is claimed. The reviewer did not run benchmarks
  concurrently with the measurements.

Three profiled runs per version, median milliseconds, with distinct sample
timestamps and no competing test suite:

| Local fixture | Samples / accounts / rollups | #790 core | Repaired core | Repaired reader children |
| --- | ---: | ---: | ---: | ---: |
| Windows Node 24.16.0 | 550,000 / 50,000 / 150,000 | 6,504 | 5,714 | 5,769-5,953 |
| WSL Node 22.23.1 | 550,000 / 50,000 / 150,000 | 3,255 | 2,824 | 2,955-2,980 |
| WSL Node 22.23.1 | 1,000,000 / 61 / 181 | 4,193 | 3,688 | 3,681-3,808 |

All three fixture runs used SQLite 3.53.1, produced exactly the same DTO as
the pinned #790 baseline, preserved database bytes and completed all nine
actual reader children within the unchanged ten-second deadline. These are
warm local measurements after seeding/direct queries, not cold-cache or
production load tests. The one-million sample scenario does not combine the
largest account/rollup population or exercise every table at its cap.
Local core median reductions were about 12-13%; this is not a guarantee that
the production query now meets its deadline or proof of its failing phase.

Reproduce these synthetic fixtures with the pinned profiler:

```sh
node scripts/profile-admin-usage-ledger.mjs --rows 550000 --runs 3 --accounts 50000 --credentials 150000 --distinct-times --output output/profile-cardinality-550k.json
node scripts/profile-admin-usage-ledger.mjs --rows 1000000 --runs 3 --distinct-times --output output/profile-distinct-1000k.json
```

Local receipts live in this follow-up worktree's ignored `output/` directory:
`full-server-tests.log`, `targeted-tests.log`, `linux-validation-02.log`,
`profile-repaired-cardinality-550k.json`, `profile-linux-cardinality-550k.json`
and `profile-linux-distinct-1000k.json`. The last two receipt SHA-256 values are
`16aa93232d96be8f8eb3850ce48377d640f22ec01100e46d36469946b1408b5d`
and `368e4c9f1c9b91fe5223bdab753a22232f9a061d712b1f14ca5ba45cccbca9d0`.

Known environment gap: the retained Linux native module and recorded BWH
module are both better-sqlite3 12.10.0 / SQLite 3.53.1, but have different
binary digests. A local Linux run is same-version source evidence, not an
identical production-native or CPU/I/O/cgroup performance test. No production
database or native binary is copied as part of this local work. New production
acceptance and any activation remain separately gated. This follow-up has not
connected to production, retried query03, installed a candidate, changed a
collector or modified any production data. It remains a Draft source follow-up
until the operator's review/merge decision; no deployment is implied.

### Earlier source validation record (retained with its original cutoff)

Refs #559 and #437; neither issue is closed by this slice. The operator asked
to open one Draft implementation PR before beginning code changes. Draft #789
was opened with intent-only commit `5d6bc84d` before implementation began. The
source slices implement the query core, Admin frontend and protected
HTTP-to-database path. #789 merged on 2026-10-18; the current follow-up repairs
query cost locally. Local synthetic acceptance is not production acceptance.

- Original source-slice baseline: `37907d59c202775930fd015da6079956238b2d5d`.
  Performance follow-up baseline: fresh `origin/master` at
  `e41536d9d42c0fa5b66acbcdebfe2b39ce12ff09`.
- Risk: B source work inside an A production envelope. No auth-model change,
  migration, production query, host access, merge or deployment is authorized.
- Original release units: `control-plane-app` and `admin-static`;
  `frontend_surface: admin`; `identity_impact: false`. The performance follow-up
  changes only `control-plane-app`; no frontend source or auth changes.
- Validation environment: local synthetic SQLite fixtures and loopback-only
  Admin preview. No production database copies, subscriptions or customer rows.
- Source state: query core, formal Admin frontend, bounded child process and
  existing-session HTTP integration implemented and locally validated/reviewed.
  The formal frontend has no synthetic fallback.
- Last recorded production state: candidates installed inactive, actual query
  not accepted, no switch. See the [query02 execution note](https://github.com/FlyLink-com/proxy-gateway-minimal/pull/789#issuecomment-6251090348)
  at 2026-10-18 14:27 UTC. This follow-up has not refreshed production state.
  Authenticated new Admin reads remain unverified. Consumed query approvals
  are not reused.

## Query-performance follow-up (local only, 2026-10-18)

The recorded query02 failure returned no aggregate DTO. Its reader requested
SIGKILL before worker exit after 10,004 ms; cleanup and unchanged application
binding were confirmed. That proves reader-initiated termination, not the exact
failure callback or a specific SQL/I/O cause. It is not evidence of a collector
outage, and does not justify another production retry.

Local phase profiling on 550,000 synthetic samples identified timestamp
validation as the largest phase (about 48% of the initial Windows run), then
window aggregation (about 39%). The minimal repair:

- Retains canonical four-digit UTC timestamps but validates Gregorian calendar
  fields directly instead of allocating, parsing and serializing a Date for
  every stored timestamp. Leap years, year 0000, precision and time ranges
  remain strict; normalized dates and non-string values remain invalid.
- Uses one fixed-arity SQLite-to-JavaScript timestamp callback per sample or
  rollup. Reuses only exact timestamp values already validated in that same
  row, with no cross-row cache or assumption that the writer was valid.
- Leaves SQL aggregates, integer overflow checks, full-snapshot validation,
  reconciliation, window boundaries, source categories and account deduplication
  unchanged. The one-million-row cap, 10-second reader deadline, one-child
  limit, read-only transaction and response whitelist are unchanged.

The deterministic tests include an independent aggregate oracle, six-field
invalid-date/type matrices, early-year and century boundaries, invalid future
data, full-snapshot overflow and error precedence. These 13 behavior tests
passed against the baseline before the repair. A separate resource test first
failed with 12 SQLite/JS callbacks for two samples and two rollups, then passed
with four after the repair; no wall-clock assertion is part of CI.

Reproduce the local synthetic benchmark from this checkout:

```sh
node scripts/profile-admin-usage-ledger.mjs --rows 550000 --runs 3 --output output/admin-ledger-profile-550k.json
node scripts/profile-admin-usage-ledger.mjs --rows 1000000 --runs 3 --output output/admin-ledger-profile-1000k.json
```

The benchmark pins the original source by commit and SHA-256, constructs a
fresh temporary synthetic database using the actual usage-table/index DDL,
and compares baseline/current full DTOs, raw and instrumented runs, and actual
reader children. It accepts no existing database input. It verifies unchanged
database bytes, waits for spawned children to close and removes only its exact
temporary directory. `--baseline-source` supports a detached Linux fixture
only when that exported source matches the pinned baseline hash. Run outside
the normal suite and without competing load; timings are host/fixture-specific,
not proof of production latency or the production failure's root cause.

Final synthetic performance (three profiled runs per version; milliseconds,
median; actual reader-child ranges include process startup):

| Local environment | Samples | Baseline core | Repaired core | Repaired reader children |
| --- | ---: | ---: | ---: | ---: |
| Windows / Node 24.16.0 | 550,000 | 6,392 | 4,569 | 4,586-4,748 |
| Windows / Node 24.16.0 | 1,000,000 | 12,247 | 8,340 | 8,425-8,539 |
| WSL Linux / Node 22.23.1 | 550,000 | 3,548 | 2,128 | 2,279-2,450 |
| WSL Linux / Node 22.23.1 | 1,000,000 | 6,565 | 4,028 | 4,043-4,596 |

All four runs used SQLite 3.53.1, 181 rollups, 61 synthetic accounts, six source
categories and a 21-day spread with cutoff/window boundary rows. Full DTOs
matched the pinned original exactly; all 12 repaired reader children exited
zero within the unchanged deadline. Synthetic database hashes were unchanged.
The Windows raw diagnostic baseline exceeded 10 seconds at one million rows;
that direct local measurement does not bypass the application's reader limit.
The WSL fixture ran on ext4 in an isolated network namespace with verified
Node/native dependency artifacts, no package installation or rebuild; its exact
temporary directory was removed after both benchmarks and the targeted tests.

Recorded validation:

- Windows: all 112 ledger query/store/reader/response/HTTP/state tests passed.
- Fresh full Windows `npm test`: 6,583 tests, 6,514 passed, 69 skipped,
  zero failed (Node 24.16.0). Root dependencies reused only after matching
  lockfiles; this is local validation, not a clean-host full CI run.
- Document authority check passed for 430 metadata blocks. Working-tree and
  staged whitespace checks passed. No frontend files changed, so no new
  Admin build or browser acceptance is claimed by this follow-up.
- WSL Node 22: 48 query/boundary tests passed, no failures or skips. This is an
  affected-boundary Linux check, not a complete Linux suite or production test.
- Independent read-only generic Security Review fallback: zero actionable
  findings. Dedicated Security Review tooling was unavailable; the reviewer
  ran `git diff --check`, but did not run tests during performance measurement.
- Reviewed/profiled query working-copy SHA-256 (CRLF):
  `69e52c42bd137bde3ccef8298254cededfb79b6feaf092866f916772fc05a4c3`.
  Git-normalized LF blob SHA-256:
  `f3e9f0d0760806a12090860b961e10f075bedff0249b8b92af1c2d68cbfac059`.
  A byte-for-byte assertion proved that CRLF-to-LF normalization is the only
  difference; all 112 ledger tests were rerun successfully on the exact
  committed LF query. No logic change or new performance claim is inferred
  from line-ending normalization. Review/full-suite/profiling evidence above
  is reused for unchanged logic, with its original byte hashes retained.
  Benchmark: `3474aa017ef661105830b8399d26c075e5a60d6f2f9b2cd6055dd5de5c851fb5`.
  New tests: `ab215463e978aa0baecbe7020a357e869a50997b8a4d37648110eba528977dc4`.
- Raw local evidence (ignored output, SHA-256):
  - `output/admin-ledger-profile-windows-final-550k.json`:
    `f9fc6484cc20ab94eb2190d092b282c85d3fbcf73c375b08bff8319b6fda2f51`.
  - `output/admin-ledger-profile-windows-final-1000k.json`:
    `c94616b1b6810aa3839fc9d9b1525593733fc43930ca65f56d5df41a1901909c`.
  - `output/admin-ledger-profile-wsl-final-550000.json`:
    `df8785179ac165a0c7e788103e136706e26a0263e2724a046edf578186a8d70e`.
  - `output/admin-ledger-profile-wsl-final-1000000.json`:
    `25c613bb8ed02522422cff50583d180baf03867d1373121b78dbe6e499c0179e`.

Follow-up PR: [#790](https://github.com/FlyLink-com/proxy-gateway-minimal/pull/790),
Draft, not merged. For its initial source commit `7c30c025`, hosted advisory
run `39137513662` did not start because an Actions budget prevented execution;
CI run `39137513639` was skipped. These are not passing hosted checks.

No hosted CI success is claimed. No new production query, service restart,
configuration/schema change, accounting write or
deployment is part of this follow-up. Performance and hash equality do not
replace a new separately approved production-candidate query acceptance.

## Existing behavior and gap

The formal Admin `userManagement` page already calls authenticated user-monitor
routes and displays stored per-account traffic samples for up to 31 days.
`usageMonitor` projects subscription resources and historical observations;
neither is a whole-database reconciliation workbench. Existing functionality
must remain available without being redesigned.

The new read-only view will answer how much traffic is **recorded** across the
control ledger, which fixed time window it belongs to, and whether the aggregate
sample totals agree with the aggregate rollup totals. It will not label all
recorded traffic as verified real-customer consumption.

## First implementation scope

1. A protected aggregate-only GET at
   `/api/admin/platform/user-monitor/usage-ledger-summary`, requiring both
   `users.read` and `runtime.read`, existing Admin session/ingress protection
   and `no-store`.
   Browser input cannot supply SQL, paths, hostnames or arbitrary source keys.
2. Four fixed windows sharing one server-selected UTC cutoff: all recorded
   samples before that cutoff, the preceding 24 hours, preceding seven days,
   and current UTC calendar month. Time intervals are `[from, cutoff)` based
   on `observed_at`, not guessed database commit time.
3. Per-window recorded upload/download/total bytes, sample count, distinct
   accounts with positive recorded use and latest observation. Empty samples
   explicitly mean `not_collected`, not proven zero user consumption.
4. Fixed safe source categories and an explicit `other_sources` category.
   Classification is by exact known source/channel pairs, not prefixes or
   arbitrary strings. Unknown sources remain included in the all-source total;
   their names, account IDs and credential references never leave the server.
5. Separate sample and rollup totals and their differences, labelled as
   **aggregate reconciliation only**. Never add samples and rollups together.
   Equal totals do not prove per-account attribution, collection completeness
   or collector health. An orphan-account count may be returned without IDs.
6. A small formal Admin view with explicit manual refresh, window cards,
   source categories, comparison and explanatory text. No automatic full-ledger
   polling. Existing per-account lookup remains the detail entry.

## Data and execution constraints

- Owner: traffic-accounting control-store domain, not the UI or wallet domain.
  Sources: existing `platform_usage_samples`, `platform_usage_rollups` and only
  the account existence relation needed for orphan checks.
- No account/credential/node records, source URLs, raw config, env, SQL errors
  or raw source/channel strings in responses, logs, previews or evidence.
- No reliable real-user/test-user marker exists in the current contract.
  Show the population as all recorded accounts; do not silently exclude disabled
  accounts or claim a verified customer-only figure.
- Third-party unmetered distribution is outside this ledger. Missing intervals
  remain unknown. No estimate, backfill, backcharge or balance adjustment.
- Bytes have an explicit unit and exact integer representation. Reject invalid,
  negative or unsafe numeric data rather than silently rounding or coercing it.
- `latestObservedAt` is the observation timestamp. It is not the actual last
  commit timestamp or the latest successful collector execution.
- Full-history scans must not block the HTTP event loop. Use one bounded
  local read-only worker/child, one read transaction, a fixed concurrency limit,
  timeout and scan budget. The implementation has no cache or read queue.
  No Redis, queue, schema/index migration, background scheduling or new service.
- A scan budget is a resource safety boundary, never evidence of completeness:
  exceeding it returns unavailable, not a partial sum labelled as a total.
- Database path comes only from the existing trusted application composition;
  no implicit fallback to another database for injected/synthetic stores.
  Use `readonly` / `fileMustExist` and query-only behavior; do not construct the
  schema-initializing application store in the query worker.
- Failure, deadline, response mismatch or permission loss displays unavailable
  and clears stale data. Successful results retain their actual cutoff/age.
- A read-only SQLite connection may touch WAL/SHM coordination metadata. This
  is not permission to modify ledger rows or journal settings.

## Acceptance and dry-run checklist

- [x] Confirm the existing per-account UI/API mapping in a local synthetic flow.
- [x] TDD deterministic four-window boundaries including UTC month rollover.
- [x] Exact upload/download/total conservation and no sample/rollup double count.
- [x] Duplicate accounts counted once per window; no invented test-user filter.
- [x] Known/unknown sources conserve all-source totals without raw-key leakage.
- [x] Empty, mismatch, orphan, invalid numeric/time and unavailable core cases.
- [x] Unauthorized and capability-denied requests do not open the database;
  no-store applies to success/error; request path/query injection rejected.
- [x] Worker deadline, concurrency, read-only/no-schema and scan-budget behavior;
  timeout and partial failure do not publish a successful or truncated total.
- [x] Admin loading/error/empty/success/mismatch states, manual refresh,
  latest-response ownership, session loss and unchanged per-user entry.
- [x] Targeted server/Admin tests, full `npm test`, full `npm run admin:test`,
  `npm run admin:build`, frontend boundaries and `git diff --check`.
- [x] Independent Security Review fallback of the exact source files; hashes
  below bind the review. Hosted dedicated review was unavailable.
- [x] Frontend loopback synthetic browser acceptance and actual typed client
  through HTTP/worker/database acceptance; no production data in fixtures.
  HTTP tests use the existing session gateway with a synthetic verifier, not a
  real TOTP login. A real-session end-to-end browser check remains a later gate.

GitHub Actions billing failures are not passing CI. Apply the existing manual
validation policy when applicable; no protection bypass is approved by this PR.

## First source slice evidence

Implemented `server/services/platform/admin-usage-ledger-query.mjs` with
`readAdminUsageLedger({ dbPath, cutoff, scanLimit })`. It opens an existing
SQLite file read-only, verifies query-only/trusted-schema settings, physical
tables and required columns, then reads one transaction snapshot. It does not
initialize or migrate a store. The synchronous core is not wired into HTTP;
its eventual caller must enforce a child-process deadline and concurrency.

Bytes are exact decimal strings. Per-table row limits fail closed rather than
truncate aggregates. Source labels are fixed exact-pair categories plus
`other_sources`. The four windows exclude observations at or after the cutoff;
reconciliation compares the entire snapshot because cumulative rollups are
undated. Future and exactly-at-cutoff sample counts are reported separately.
Equal aggregate totals do not prove complete collection or correct attribution.

Local validation on 2026-10-16 (synthetic data only):

- TDD: missing query module produced the initial failing tests; implementation
  passed 35 new query/store tests. The store test uses the real application
  schema and writer, without production data.
- Combined new tests and existing user-monitor HTTP/service regressions:
  51 passed, zero failed.
- Full `npm test`: 6,506 tests, 6,437 passed, 69 skipped, zero failed.
- Existing Admin client/workspace/hook/shell regressions: four files,
  71 passed. Full Admin suite, build and browser acceptance remain pending;
  no Admin component has changed in this slice.
- Dependencies reused through local junctions after matching root/Admin
  lockfile hashes; Node 24.16.0. This is local validation, not clean-host CI.
- Independent read-only generic-agent security review found no concrete
  finding in this slice and independently passed the 35 new tests. The
  dedicated Security Review tool was unavailable; this is a fallback review,
  not a hosted review or full-feature approval. Query-core SHA-256:
  `f1916573f3335d23a8364846b626e3781890d7c481573b8063bc62910e41f438`.
- Initial-head hosted advisory run `38854403439` did not start because an
  Actions budget prevented execution. No hosted CI success is claimed.

At the end of that slice, trusted runtime-path composition, bounded child
execution/response validation, authenticated/no-store routing, full-path
acceptance and full-feature independent review were still pending. They are
covered by the later slices below. PR #789 remains Draft; none of this is
production acceptance.

## Frontend source slice evidence

The formal `usageMonitor` page now mounts `AdminUsageLedgerWorkspace` beside
the existing monitoring workspace. Existing per-user entry and baseline preview
are preserved. The client calls only the proposed fixed same-origin GET with
`no-store`, cookie credentials and redirect rejection. It does not bypass the
existing Admin auth boundary or supply database paths/query parameters. Until
the route exists, a read fails unavailable; it does not invent a result.

The view has four UTC window cards, per-window source totals, exact decimal
bytes alongside binary units, sample/rollup/difference comparison, orphan and
cutoff-boundary counts, and explicit population/coverage limitations. Missing
samples render unknown (`—`), distinct from sampled zero. Aggregate equality
is not presented as collector health. Refresh is manual-only. Pending/failed,
expired-session and changed-owner reads clear previous data; requests abort
after 15 seconds or unmount. Response parsing has a 262,144-byte streaming
limit, strict UTF-8, fixed field mapping and integer/conservation checks.

Implementation and validation on 2026-10-16 (local synthetic data only):

- Grok CLI produced the initial frontend; Codex performed final integration
  and acceptance. The initial Grok task was stopped after its source draft;
  no completed Grok self-test report is claimed.
- Controller TDD reproduced and fixed missing samples displaying `0 B`, a
  previous client owner's result appearing during the first replacement
  render, and a test factory lifecycle loop. The client boundary work used
  red tests for oversize streams, cleanup failure, encoding and cancellation.
  Initial TypeScript fixture/narrowing errors were corrected before build.
- Final frontend targeted tests: 4 files / 79 passed. Full Admin suite:
  103 files / 1,882 passed. After the last table-only accessibility/layout
  adjustment, reran the 79 targeted tests and Admin build/verify; unaffected
  full-suite results remain applicable.
- Full `npm test` rerun: 6,506 tests / 6,437 passed / 69 skipped / zero failed.
- `admin:build`, `admin:verify`, frontend source-boundary checks and local
  source-environment preflight passed. Vite retains a greater-than-500-kB
  chunk warning; the build is not a production rollout.
- Browser used the real frontend client/component and fixtures generated by
  the real query core from disposable synthetic SQLite files: normal, empty,
  sampled zero, mismatch/orphans and bytes above JS safe-integer range. Checked
  manual window selection, safe permission/invalid-response/timeout states,
  desktop and 390-pixel narrow layout, no page-level horizontal overflow and
  keyboard horizontal table scrolling. No API proxy or production calls.
- Local-only harness: `admin/output/usage-ledger-preview.html`, served on
  loopback port 4195. It is ignored output, not a published Admin route or
  authentication exception; fixture values are clearly marked synthetic.
- Independent read-only generic-agent Security Review fallback found no
  concrete findings, including the final table changes. Independently passed
  79 frontend tests and 21 existing auth tests; this is not hosted Security
  Review or full-feature approval. Reviewed SHA-256 values:
  - client: `57048c4a070ac6236609f78534a7d6df1d288885936ed2e34213d73812bb52a4`
  - hook: `3772146570c40a56e52bd97f18d778842391be2797fe75d345a750db181c4917`
  - workspace: `34ed1cd1a75cbcba9fba731f05b4985a52200580806e41a4cc89d5611d9b85fa`
  - CSS: `4761e085f2c3774e7f24aa5b16891e94697574cf52c0f5e318e07fa638656bbf`
  - shell: `afa2e57494c00522d21f32e744472d5289b3428e6e5c01d4debe39f1669c2f7c`

Frontend source validation does not prove a production ledger is readable.
At the end of that slice the next task was the bounded readonly worker and
protected HTTP route, now implemented below. No merge, deployment, production read,
collector change, schema change or financial/usage write occurred in this slice.

## Backend integration source slice evidence

Implementation on 2026-10-18 binds the service only to the file-backed control
store created by `createRuntimeState`. Injected or in-memory stores have no
implicit file fallback. Construction is lazy. Both synchronous and Commerce
asynchronous shutdown paths close the reader and reject subsequent requests.

The existing Admin session gateway still owns authentication. Both `users.read`
and `runtime.read` are required. Only GET is supported; HEAD, other methods,
query strings and request bodies do not start a scan. Existing ingress
middleware sets `no-store` before auth and parsing. Disconnects abort the read;
errors expose only a fixed unavailable result, not paths or SQLite diagnostics.

The reader starts the fixed worker with `process.execPath`, no shell, a minimal
environment and no inherited application credentials. Limits are 8 KiB input,
256 KiB output, one active child, a 10-second deadline and a 128 MiB V8 old-space
limit. That heap limit is not a whole-process RSS/native SQLite memory limit;
the actual Linux service resource envelope still requires validation. The core
rejects any of its three tables exceeding 1,000,000 rows rather than publishing
partial totals. Timeout, invalid output, abort or shutdown terminates the child;
the busy slot remains held until its close event even if termination fails.
The parent checks strict UTF-8, the exact server cutoff, fixed categories,
integer/conservation rules and coverage constants, then projects a fresh
aggregate-only whitelist. It never forwards raw worker JSON blindly.

Local evidence (synthetic data only):

- Grok CLI was given the bounded backend task but produced no implementation
  before it was stopped. Codex and scoped coding agents implemented the slice;
  no completed Grok backend validation is claimed.
- TDD first reproduced missing route/service/module failures. Final combined
  query/store/reader/response/HTTP/state tests: 98 passed, zero failed/skipped.
  Includes real readonly SQLite, no schema/file creation, single-child
  concurrency, late output/parse deadline, kill failure, abort/shutdown races,
  exact response validation, capability denials and no-store error responses.
- The real app/store writer and a real worker child verified empty then
  recorded values, a subsequent writer update and unchanged per-account totals.
  The actual typed Admin client also passed the loopback HTTP/worker/database
  flow, session-loss and closed-reader cases. Session verification was a
  synthetic fixture; no production cookie, credentials or customer data used.
- The ignored local harness is
  `output/usage-ledger-client-http-acceptance.mjs`; it cleans its temporary
  synthetic database and loopback listener on completion. It is not a new
  public route or an authentication exception.
- Fresh Admin client tests: 48 passed. The frontend source hashes listed above
  are unchanged, so the previous full Admin suite, build and browser visual
  evidence are reused; this backend slice does not claim a new browser run.
- Fresh full `npm test`: 6,569 tests, 6,500 passed, 69 skipped, zero failed.
  Document-authority check (430 blocks), frontend source-boundary check and
  working-tree/branch diff checks passed. Local Node 24.16.0 / Windows source
  preflight passed; this is not clean-host CI or Linux sandbox acceptance.
- Independent read-only generic-agent Security Review fallback found no
  concrete source findings and independently passed all 98 ledger tests. The
  dedicated Security Review tool remains unavailable. Reviewed SHA-256:
  - reader: `abac07737987b07d532b9a707e4ed8f46c435cd71a1fe7e87bfadd9a6594ae02`
  - worker: `5ac721c5b72a9581839c2a60be5de87343d7f1fe580cd9c4f130b7f715ba5b3e`
  - response validator: `cc4c3c254aea68a0a8446f030a2531cad5da19e4bcbf32ca55788c45ba3628b8`
  - route: `7d9ec14d5657e6bf523800a6726f1708f029898a3c23d638152ec8d43ef4d2fe`
  - runtime state: `aa3cc37894fde7f1c452016ecec2776b33993245336726ae19eefd775f488eaa`
  - query core unchanged: `f1916573f3335d23a8364846b626e3781890d7c481573b8063bc62910e41f438`.
  No hosted CI success or production readiness is implied.

Source implementation and local validation are complete for this slice. Merge
approval and production-specific dependency, sandbox and query-cost checks
remain separate. No merge, deployment or production read occurred.

## Separate production sequence and rollback

Source completion does not authorize production reads or writes. Before any
promotion: bind exact backend/Admin artifacts and their runtime compatibility,
fresh protected ingress/current-release inventory, production query cost limits,
backup and static/backend rollback targets, then obtain exact operator approval.
Do not publish this route or the Admin page through an unprotected ingress.

In particular, verify the worker/core/validator files are present in the exact
backend artifact and the `better-sqlite3` native module matches the target Node
ABI. Read back the actual service UID/GID, sandbox and resource settings; test
a disposable synthetic file under that same environment, including readonly
database/WAL access, child startup, deadline/kill/reap and no child leak. An
existing in-memory SQLite smoke or local Windows pass is not that evidence.
Check real ledger size against the row cap and expected query cost only within
a separately approved aggregate-only production read scope.

Validate anonymous denial, authorized aggregate-only response, same cutoff and
unit semantics, bounded resource use and unchanged metering behavior. Production
account access remains a separately scoped, privacy-preserving acceptance task.
No schema change is planned; rollback is the reviewed backend/static release
pointer rollback, not database restoration or rewriting accepted usage.

## Non-goals

No collector repair/start/stop, protocol identity or credential rotation,
provider/Nginx changes, entitlement/payment/Coins mutation, historical data
correction, ledger export, arbitrary BI queries or automatic reconciliation.
No expansion of this PR into the entire Admin or #437/#559 roadmap.
