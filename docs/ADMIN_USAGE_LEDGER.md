# Admin usage summary and reconciliation

```yaml
document_metadata:
  doc_type: operational
  lifecycle: active
  authority_scope: admin_usage_ledger_slice
  superseded_by: null
  last_verified_at: 2026-10-16
  production_authority: false
```

## Intent and current stage

Refs #559 and #437; neither issue is closed by this slice. The operator asked
to open one Draft implementation PR before beginning code changes. Draft #789
was opened with intent-only commit `5d6bc84d` before implementation began. The
source slices now implement the query core and Admin frontend, not the complete
HTTP-to-database feature.

- Source baseline: fresh `origin/master` at
  `37907d59c202775930fd015da6079956238b2d5d`.
- Risk: B source work inside an A production envelope. No auth-model change,
  migration, production query, host access, merge or deployment is authorized.
- Proposed release units: `control-plane-app` and `admin-static`;
  `frontend_surface: admin`; `identity_impact: false`.
- Validation environment: local synthetic SQLite fixtures and loopback-only
  Admin preview. No production database copies, subscriptions or customer rows.
- Source state: partial; read-only aggregate query core, formal Admin frontend
  and synthetic tests implemented. Bounded child process and authenticated HTTP
  integration remain pending. The formal frontend has no synthetic fallback.
- Production state: not deployed; authenticated live Admin reads not verified
  by this PR. Earlier read-only query approvals are not reused.

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

1. A protected aggregate-only GET, proposed as
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
  timeout and scan budget, and a short bounded in-memory cache if necessary.
  No Redis, queue, schema/index migration, background scheduling or new service.
- A scan budget is a resource safety boundary, never evidence of completeness:
  exceeding it returns unavailable, not a partial sum labelled as a total.
- Database path comes only from the existing trusted application composition;
  no implicit fallback to another database for injected/synthetic stores.
  Use `readonly` / `fileMustExist` and query-only behavior; do not construct the
  schema-initializing application store in the query worker.
- Failure, deadline, response mismatch or permission loss displays unavailable
  and clears stale data. A cached success must retain its actual cutoff/age.
- A read-only SQLite connection may touch WAL/SHM coordination metadata. This
  is not permission to modify ledger rows or journal settings.

## Acceptance and dry-run checklist

- [ ] Confirm the existing per-account UI/API mapping in a local synthetic flow.
- [x] TDD deterministic four-window boundaries including UTC month rollover.
- [x] Exact upload/download/total conservation and no sample/rollup double count.
- [x] Duplicate accounts counted once per window; no invented test-user filter.
- [x] Known/unknown sources conserve all-source totals without raw-key leakage.
- [x] Empty, mismatch, orphan, invalid numeric/time and unavailable core cases.
- [ ] Unauthorized and capability-denied requests do not open the database;
  no-store applies to success/error; request path/query injection rejected.
- [ ] Worker deadline, concurrency, read-only/no-schema and scan-budget behavior;
  timeout and partial failure do not publish a successful or truncated total.
- [x] Admin loading/error/empty/success/mismatch states, manual refresh,
  latest-response ownership, session loss and unchanged per-user entry.
- [x] Targeted server/Admin tests, full `npm test`, full `npm run admin:test`,
  `npm run admin:build`, frontend boundaries and `git diff --check`.
- [ ] Independent Security Review of the exact implementation head.
- [x] Frontend loopback synthetic browser acceptance; no production data in
  fixtures. Authenticated HTTP-to-database browser acceptance remains pending.

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

Remaining source gates are trusted runtime-path composition, bounded child
execution and response validation, authenticated/no-store routing, full-path
acceptance and full-feature independent review. PR #789 remains Draft; none of
this is production acceptance.

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
The next source task is the bounded readonly worker and protected HTTP route,
then authenticated full-path tests. No merge, deployment, production read,
collector change, schema change or financial/usage write occurred in this slice.

## Separate production sequence and rollback

Source completion does not authorize production reads or writes. Before any
promotion: bind exact backend/Admin artifacts and their runtime compatibility,
fresh protected ingress/current-release inventory, production query cost limits,
backup and static/backend rollback targets, then obtain exact operator approval.
Do not publish this route or the Admin page through an unprotected ingress.

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
