# Full metering recovery: existing identities, future usage only

```yaml
document_metadata:
  doc_type: canonical
  lifecycle: active
  authority_scope: full_metering_recovery_runbook
  superseded_by: null
  last_verified_at: 2026-09-08
  production_authority: false
```

Risk: A envelope / B source core. One implementation PR; no separate spec PR.
Related work: traffic-accounting Epic #437. This does not close that Epic.
Pause-interval zero-charge recovery (new activation + new journal) is
`docs/FULL_METERING_NEW_ACTIVATION_RECOVERY.md`. This runbook remains the
collector recovery contract; that document does not replace it or authorize
production.
Release units: `control-plane-app`, `japan-runtime-config`, `sgp-runtime-config`.
`identity_impact: true`; production identity gate remains pending until live
readback. No frontend, payment, wallet, order, schema or entitlement mutation.

## Approved intent and current stop condition

The operator approved completing the VLESS pending-start baseline, independent
JP/SGP Hy2 statistics, and Japan TUIC connection-delta collection, followed by a
coordinated recovery. Preserve existing identities and historical accounting;
do not debit unassignable historical traffic or change plan rights. The existing
Singapore TUIC sidecar, its cursor/state, and its timer are separate and must be
preserved.

The 2026-09-08 read-only inventory found:

- Japan Hy2 and TUIC have no statistics/controller interface enabled yet.
- Singapore Hy2 already has authenticated loopback statistics, but its old
  executor restarts the same healthy configuration about every 32 seconds.
  The minimal adapter fix skips replacement/restart only after same-content,
  loaded-file, process, config-test and listener proofs. Changed/unhealthy
  configurations still follow the existing apply path.
- Four Japan TUIC missing map entries can be reconstructed uniquely from
  existing material and current durable bindings. No new credential is needed.
- Two Japan Hy2 and two Japan TUIC runtime identities belong to still-valid
  orders but are outside those orders' current explicit channel set. They are
  **not expired identities**. Material exists, but the normal resolver correctly
  refuses their old derived references. Do not fabricate billing bindings,
  silently bill their accounts, call them healthy retention, or remove/disable
  their live access as part of a statistics-only change. This needs a bounded
  operator disposition before production full-collection activation.

The dated evidence is aggregate-only and retained outside Git in the task's
execution record. These findings are not a perpetual assertion about live state.

## Source design

- `traffic-full-metering-collect.mjs` has explicit `--preflight`, `--initialize`
  and `--collect` modes; no implicit collect or generic retry mode. Each requires
  an absolute protected config path plus its exact SHA-256.
- The default five fixed sources are Japan/Singapore VLESS and Hy2, and Japan TUIC.
  Main-lane Singapore TUIC is rejected. Normal storefront runtime composition is
  not loaded; no commerce worker or unrelated authentication initializer runs.
- The host reader checks a live process, its actual config argument, loaded
  config timestamps, executable hash and owned loopback socket before and after
  a bounded read. Hy2 uses `/traffic` without `clear`; TUIC uses `/connections`.
  Runtime material fingerprints must agree with existing protected material and
  the strict DB binding inspector. Unknown/partial/duplicate inputs fail the
  whole batch before any accounting write.
- The TUIC reader accepts an explicit `connections: null` as an empty active
  connection list, as emitted by Mihomo's idle native snapshot. It does not
  accept a missing field, an invalid list/row, or failed HTTP/JSON validation.
  Envelope `uploadTotal`/`downloadTotal` are never user usage observations;
  they can remain nonzero while idle. This preserves first-observation baselines,
  prior accounting and unknown closed-connection tails, not a zero-usage claim.
  Upstream contract: [Mihomo v1.19.27 snapshot](https://github.com/MetaCubeX/mihomo/blob/v1.19.27/tunnel/statistic/manager.go#L79-L89)
  and [connections route](https://github.com/MetaCubeX/mihomo/blob/v1.19.27/hub/route/connections.go#L23-L27).
  Source regression coverage composes the real reader, source driver, journal
  and sample recorder with synthetic inputs; it is not live protocol or
  production acceptance. A corrected artifact still needs its own promotion
  decision before resuming a failed production activation.
- First missing counters remain `pending_start`; first real paired readings
  establish a baseline without billing their nonzero accumulated values.
  TUIC tracks each connection separately, so a closed connection does not hide
  another connection's positive delta. New connections are baseline-only on
  first sight; closed-connection tail bytes unavailable from polling are not
  invented. This is not a claim of packet-perfect TUIC billing.
- Current identity ownership/material is rechecked. Newly verified normal
  identities enter pending; expired/disabled identities are archived without
  deleting prior evidence. Reactivating retained identities needs separate
  admission. Source generations are derived from boot/process/executable proof;
  an independently verified new generation archives old cursors and starts a
  fresh baseline, retaining already-recorded totals and exposing the unknown
  restart gap rather than guessing historical bytes.
- A protected filesystem intent precedes one `BEGIN IMMEDIATE` transaction over
  existing sample/rollup tables. Stable sample IDs and exact collision checks
  make replay idempotent. The checkpoint advances only after synchronous commit;
  directory/file fsync protects the journal on Linux. No new schema is needed.
  Production uses a dedicated connection with `synchronous=FULL` readback.
- Intervals crossing a billing-cycle boundary are explicitly unassigned rather
  than charged to an uncertain period. Counters advance and the summary exposes
  the omitted bytes. Entitlement/quota lifecycle mutation is not performed.
- Missing/corrupt checkpoints never turn into initialization. A hard process
  exit may leave an exclusive writer lock: do not automatically delete it.
  Recover the same pending intent only after establishing exclusive custody.

## Explicit local-three source scope (source-only, 2026-10-07)

Risk: A envelope / B source core. Process: one implementation PR with intent,
targeted tests and this runbook; no production execution by source validation.
Expected PR count: 1, `Refs #437` (not closing that Epic).
`identity_impact: true`; `identity_gate.state: pending`;
`production_state: not_deployed`. Production/AWS impact in this source slice:
none. Deployment remains a separate exact-approved migration step.

An absent `meteringScope` keeps the existing five-source config, context,
checkpoint and sample encoding. Explicit `full-five-v1` selects the same scope.
The only other admitted value is `local-three-v1`, which requires exactly:

- `channel-vultr-a-vless-reality-tcp`, local Xray;
- `channel-vultr-a-hy2`, local Hysteria2;
- `channel-vultr-a-tuic`, local TUIC.

These are internal business references, not the physical country or subscription
display name. A host migration must not rename them. Missing, duplicate, foreign,
wrong-host or wrong-protocol sources are rejected; there is no arbitrary source
array, ignore-errors option, cache substitution or zero substitution.

The three-source protected config adds `"meteringScope":"local-three-v1"`
and replaces the `sgp` connection object with exactly
`{"status":"paused","usage":"unknown"}`. No SGP SSH target, key, known-hosts
or reader path is accepted or read in that mode. The aggregate result identifies
the explicit scope and `deferredSources` (`paused`, `unknown`, two main-lane
sources). Its sidecar field only states that this collector does not enable the
separate SGP TUIC sidecar; it is not a claim about a remote service's actual
state. Success applies only to the three selected sources and does not establish
SGP health, completeness or zero usage.

Before activation:

1. Bind exact reviewed source/artifact, protected config digest, new activation
   ID and a **new, absent journal directory** in the migration record. Preserve
   the old five-source journal, pending intent and sidecar state; never edit,
   copy, relabel, delete or replay them under the three-source scope. An old
   pending intent needs its own accounting disposition before cutover, not
   silent discard. Initialization refuses an existing directory.
2. Freeze the approved old writers and prove unique accounting custody. Confirm
   the target DB identity and fresh online backup. There is no global automatic
   activation-ID registry: the operator must prove the new ID was not reused.
3. The new context and checkpoint both bind `local-three-v1`. Scope/config/DB
   drift blocks before pending replay; pending next-checkpoints and samples
   retain scope and activation checks. Same-scope recovery still replays an
   already-durable batch before new reads, so a later source failure does not
   imply that no previously approved pending samples were recovered.
4. Run `--preflight`, then `--initialize` on all three real sources and verify
   zero new samples. All existing identity/material/retention checks remain.
   Observe at least two natural cycles with new-baseline-only increments, no
   duplicates, unchanged financial/account/entitlement state and preserved SGP
   history. Any selected source failure prevents the current new batch, not
   just that source. Continue-material and continue-billing-window approvals
   must bind the same scope, context, activation and exact previous checkpoint.
5. Defer SGP without erasing credentials, accounting or checkpoint evidence.
   Bringing it back later is a new approved scope/activation transition with
   fresh observations; missing intervals stay unknown and are not backcharged.

Rollback stops the newly introduced accounting lane and preserves its durable
intent and ledger. Do not restore an old DB over newer application/usage writes,
re-enable an unsafe legacy collector, or revert scope by editing a checkpoint.
The JP-to-BWH migration runbook separately owns transfer, single-writer cutover,
target activation and reverse restoration; source tests authorize none of them.

Validation covers legacy five-source compatibility, strict three-source config,
canonical read order, scope drift/old pending rejection, zero initialization,
new increments, source-failure atomicity, material/billing-window continuation,
and real SQLite plus injected protocol-reader crash recovery with unchanged SGP
history. Injected process/network reads are not physical protocol validation.
Run the focused `full-metering-*.test.mjs` tests, the full `npm test` baseline,
exact-source independent security review and whitespace checks before source
promotion. Linux fsync/SQLite/CLI and actual target tests remain distinct gates.

## Validation and promotion checklist

1. Preserve root checkout dirty files. Use one clean source worktree and exact
   master base. Run focused tests, `npm run validation:environment:source`,
   `npm test`, and `git diff --check`. Native dependencies come from `npm ci`
   under that validation Node runtime.
2. Validate the new source boundary on Linux: the full test suite, especially
   real SQLite/child-process crash replay and directory fsync. Existing Linux
   validation of unchanged code remains valid; it is not evidence for new code.
   Tests using injected systemctl/stat/socket responses are contract tests, not
   proof that a production interface exists or that an endpoint is reachable.
3. Before promotion, resolve the explicit-channel runtime residuals above.
   Re-read exact PR head/checks, immutable artifact identity and fresh target
   process/config/material/map identities. No already-consumed execution packet
   is replayed. Source/merge readiness does not imply production readiness.
4. Obtain a new protected online SQLite backup with the existing reviewed
   `createTrafficRecoveryOnlineBackup` helper. Keep the sidecar running when
   possible. Bind backup hash/integrity and source DB identity to this activation;
   separately back up exact runtime config, source wiring, map and unit files.
5. Prepare candidate loopback statistics config and metadata without applying.
   Derive maps only from verified existing material. Preserve old maps as backup;
   perform the retention review required by `IDENTITY_LIFECYCLE.md` before any
   stale entry retirement. Candidate validity and rollback targets must be known
   before the approved runtime change. No public statistics ports or Nginx/DNS
   changes; no further Japan Xray configuration or restart is required.
6. Preserve statistics fields in normal runtime rendering, apply only the
   remaining approved source configuration, and install the complete required
   helper modules. The Singapore adapter import must not be deployed alone
   without its new helper. The private SSH reader is not a public API and must
   never have its raw output copied into deployment logs.
7. Run fresh read-only `--preflight` under actual collection custody. It must
   observe all five source processes, complete eligible identity coverage, and
   valid retention before initialization. Then initialize exactly one new
   journal directory (never overwrite an old activation), and enable the new
   collector only after the returned baseline is verified to have zero debits.
8. Verify two natural timer cycles: source reachability, pending versus observed
   counts, delta/sample agreement, no duplicate samples, unchanged account/plan/
   issuance state, unchanged sidecar identity, local/public application health.
   Report missing statistics, unassigned gaps and unmapped identities truthfully;
   zero observed traffic is not proof of full traffic coverage.

## Controlled failure / rollback

Keep the old main collector isolated until successful activation. If the new
lane fails, stop that lane, preserve its pending intent/checkpoint and keep the
existing sidecar and application serving. Restore only changed runtime/source
configuration or application pointer according to its backed-up exact target;
do not re-enable the unsafe old collector as an automatic fallback. Restore
timer state according to the recorded pre-state, not a presumed default.

Do **not** restore the whole SQLite snapshot over newer sidecar/application
writes to undo collection. Recorded samples are immutable usage facts; resolve
pending intent through deterministic replay. No counter clear, historical
debit, new resource issuance or entitlement repair is part of this recovery.

After actual production completion, append a concise Deploy Note with the
exact release/source/artifact/target/backup, validation and aggregate identity
gate before/after plus retention state. Until then, state `not_deployed`.
