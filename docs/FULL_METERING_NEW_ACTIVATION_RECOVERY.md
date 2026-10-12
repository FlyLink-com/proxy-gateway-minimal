# Full metering pause recovery: new activation and new journal

```yaml
document_metadata:
  doc_type: operational
  lifecycle: active
  authority_scope: full_metering_new_activation_recovery
  superseded_by: null
  last_verified_at: 2026-10-12
  production_authority: false
```

Risk: A envelope / B source core. One implementation PR; no separate spec PR.
Expected PR count: 1. Refs #437; does not close that Epic.
Release unit: `control-plane-app` (collector component).
`identity_impact: true`. The source slice was authored as
`identity_gate.state: pending` and `production_state: not_deployed`.
The 2026-10-12 BWH execution is the Deploy Note below:
`production_state: deployed` for that local-three collector recovery only,
and `identity_gate.state` is `degraded` because stale retained bindings remain
after the recorded 2026-10-12 aggregate read; before counts were not captured.
Production/AWS impact of the original source slice:
none. This document does not authorize SSH, host login, database/config/credential
reads, further collector or timer changes, cleanup, merge, or another deployment.

## Approved intent

Ethan approved a zero-charge recovery boundary for the paused local-three lane
starting about 2026-10-11 14:11 PT: do not bill the paused interval; recover with
a **new activation**, a **new absent journal**, and current protocol counters as
a zero-sample baseline. Keep the old journal read-only. Preserve accepted SQLite
usage, entitlements and SGP history. Do not invent a process generation, restart
protocols, erase the old journal, or resume the old timer into a catch-up debit.

This is the stepwise operator plan for that boundary. Each step has its own
command, expected receipt and stop condition. There is no all-in-one executor.

## Source tools

| Path | Role |
| --- | --- |
| `scripts/traffic-full-metering-proof-readonly.mjs` | Single-purpose aggregate commercial-proof probe. `main()` is Linux/root/Node 22.23.1 only. Tests import `analyze`, `decodeCheckpoint` and `candidateWorkingDirectoryMatchesApp` only. |
| `scripts/lib/full-metering-new-activation-recovery.mjs` | Precheck plus new-journal initialize. Old journal is read-only. |
| `scripts/traffic-full-metering-new-activation-recover.mjs` | One-step CLI: `--precheck` or `--initialize-new-journal`. Never `--collect`. |
| `scripts/traffic-full-metering-collect.mjs` | Existing collector. Later natural `--collect` against the **new** config only. |

Pinned file SHA-256, exact bytes of this source slice. These pins are separate
from the frozen 49-file collector archive:

| Path | SHA-256 |
| --- | --- |
| `scripts/traffic-full-metering-proof-readonly.mjs` | `39842f92e358ab19f90023ff5a220bfa8d05de36cd158dcc69c67f0827829827` |
| `scripts/lib/full-metering-new-activation-recovery.mjs` | `028cfc1a47e0e5002775473f873b780964bd57d3f8d6b0fd8664b270d0945f04` |
| `scripts/traffic-full-metering-new-activation-recover.mjs` | `906765b3f7b0f4be4518a4ee6e3f81da97d14ccb59645b583bd68cb89f9447b8` |

Probe process bounds: 30s wall time, 256 MiB RSS, 32 MiB plain / 128 MiB
checkpoint / 256 MiB decoded payload, 10 000 identities, 5s systemctl and
SQLite timeouts. Recovery process bounds: 60s, 512 MiB RSS. Initialize hashes
the SQLite backup in reused 1 MiB chunks and does not retain a backup-sized
buffer, so that RSS bound is not spent on the backup itself.

## Non-goals

- Connecting to any production host from this workstation.
- Reading live database, config, checkpoint, material or credential bodies.
- Installing a collector, changing a systemd pointer, starting a timer.
- Billing, reversing, or estimating paused bytes.
- Cleaning identity maps, expanding SGP, mutating rights or Coins.
- Closing Epic #437 or touching Issue #763.

## Stepwise operations

Record the exact command, SHA-256 of every pinned input, UTC timestamp and
aggregate receipt after each step. A later step may start only when the previous
receipt matches the expected shape. On any mismatch, stop.

### Step 1 — Bind exact source and candidate identity

Command: operator-owned read of the already validated collector archive, the 49
file hashes, Node 22.23.1 identity, candidate directory absence, disk/inodes,
and the stopped collector/timer unit names. Do not change pins.

Expected receipt: archive SHA-256
`b68e7d6ecf62535a2f0dd92ed8c68190dadcab9f7d0689858eec148e8ddba8bf`; 49 ordinary
files; candidate path absent; collector service inactive or failed; timer dead;
old `pending.json` and `writer.lock` absent.

Stop: any hash, count, path, unit or pending/lock mismatch. Do not create the
candidate directory in this step.

### Step 2 — Place the reviewed collector candidate

Command: copy the already validated public-source archive into a new root-private
candidate directory. Verify the archive and all 49 files. Do not overwrite a
live pointer.

Expected receipt: every path/hash/byte pin matches `FILES` in
`scripts/traffic-full-metering-proof-readonly.mjs`; no extra files; no live
service or timer change.

Stop: extra file, hash drift, overwrite, or any pointer/service mutation.

### Step 3 — Read-only commercial proof probe

The probe is this PR's source. It is not one of the frozen 49 collector files.
Transfer it as a separate root-private file and bind SHA-256
`39842f92e358ab19f90023ff5a220bfa8d05de36cd158dcc69c67f0827829827`.
Do not add it to the 49-file candidate directory.

`proxy-gateway-candidate.service` `WorkingDirectory` may be the pinned release
directory, or `/opt/proxy-gateway-minimal-candidate/current` when that symlink
resolves to the same release. `/proc/<MainPID>/cwd` must still resolve to that
release. Any other working directory stops as `app_changed`.

Command, on the target host only after a new exact Risk A approval:

```text
timeout 30s /usr/bin/node --max-old-space-size=256 \
  <root-private-probe>/traffic-full-metering-proof-readonly.mjs
```

The probe still verifies the 49-file candidate at its pinned ROOT. Clean
environment: no `NODE_OPTIONS`, no `NODE_PATH`. Bound time and memory as above.

Expected receipt (aggregate only):

```text
ok=true
readonlyDatabase=true
mutated=false
rawReturned=false
runtimeCountersRead=false
protocolConfigRead=false
materialFileRead=false
usageRowsRead=false
recoveryReady=false
productionWritesAuthorized=false
proof.admissionPassed is a boolean
proof.historyCountsOnly=true
proof.counterStateValidated=false
```

`ok` means the diagnostic finished. `proof.admissionPassed` is narrower
commercial admission. `recoveryReady` must remain false.

Stop: `ok=false`; any identity/category hidden; missing/retained/otherChanged
non-zero without a separate disposition; history remaining 0; snapshot drift;
raw identifiers in the receipt; RSS or time limit; recoveryReady true.

### Step 4 — Recovery precheck against the old journal

The recovery CLI is this PR's source. It is not the frozen 49-file collector.
Transfer it separately and bind SHA-256
`906765b3f7b0f4be4518a4ee6e3f81da97d14ccb59645b583bd68cb89f9447b8`
for `scripts/traffic-full-metering-new-activation-recover.mjs` and
`028cfc1a47e0e5002775473f873b780964bd57d3f8d6b0fd8664b270d0945f04`
for `scripts/lib/full-metering-new-activation-recovery.mjs`.

Prepare a private request JSON that names the old journal, old activation, old
context, new activation, new config path/digest, `oldWriterStopped: true`,
`activationUnused: true` and `knownActivationIds` containing every already used
activation and not the new one. Then:

```text
timeout 60s /usr/bin/node --max-old-space-size=512 \
  <root-private-recovery>/traffic-full-metering-new-activation-recover.mjs \
  --precheck --request <abs-request> --request-sha256 <sha256>
```

Expected receipt:

```text
type=full_metering_new_activation_recovery
ok=true
status=precheck_passed
historicalDebits=false
oldJournalMutated=false
rawReturned=false
recoveryReady=false
productionWritesAuthorized=false
sampleCount=0
recordedBytes=0
```

Unchanged identities need no proof. Billing-only changes must be admitted.
The new journal path must still be absent. A non-zero global retained-binding
count does not block precheck. Only `retainedMatched` must be 0: a retained
binding whose key (`channelRef` + `edgeCredentialRef`) and `materialDigest`
match an old checkpoint identity still fails
`full_metering_identity_unresolved`. Retained bindings that do not match any
old identity are allowed. `missing` and `otherChanged` must still be 0.

Stop: `full_metering_old_writer_active`, `full_metering_old_writer_lock`,
`full_metering_pending_recovery_required`, `full_metering_activation_reused`,
`full_metering_activation_not_unique`, `full_metering_identity_unresolved`,
`full_metering_plan_switch_unproven`, `full_metering_new_journal_exists`, or any
account/order/credential in the receipt. Do not initialize.

### Step 5 — Protected backups

Command: operator-owned online SQLite backup via the existing reviewed
`createTrafficRecoveryOnlineBackup` helper, plus copies of the old journal,
old config, unit files and the exact old checkpoint digest/sequence. Verify
readability, integrity and free space. Bind those hashes to this activation.

Expected receipt: backup SHA-256 matches the new config `backup.sha256`;
quick_check ok; old journal tree digest unchanged; no collector start.

Stop: backup identity mismatch, failed integrity, insufficient space, or any
write to the old journal. Do not initialize.

### Step 6 — Initialize the new absent journal

After a new exact approval bound to this source, request, config digest, new
activation, new journal path and backup:

```text
timeout 60s /usr/bin/node --max-old-space-size=512 \
  <root-private-recovery>/traffic-full-metering-new-activation-recover.mjs \
  --initialize-new-journal --request <abs-request> --request-sha256 <sha256>
```

Expected receipt:

```text
ok=true
status=baseline_initialized
sampleCount=0
recordedBytes=0
historicalDebits=false
oldJournalMutated=false
recoveryReady=false
newSequence=0
```

Accepted SQLite sample/rollup totals must equal the pre-initialize totals.
The old journal tree digest must be unchanged. The new checkpoint activation
must be the new ID.

Stop: any sample or recorded byte; old journal mutation; existing new
directory; pending/lock on the old journal; dual activation. Do not delete a
partial new directory. A leftover empty directory is a stop, not an automatic
retry.

Post-write failure: if initialize returns `status=blocked` after
`checkpoint.json` already exists — for example
`errorCode=full_metering_recovery_memory_limit` from the final bound check —
do not delete the new journal and do not retry initialize. The final RSS check
runs only after the new checkpoint has been written. Run this read-only
verification, then Ethan decides acceptance:

- `readFullMeteringJournal` with the new context succeeds. That context is the
  new config digest, the current database identity, and meteringScope
  `local-three-v1`.
- `activationId` is the new activation, `sequence` is 0, and `meteringScope`
  is `local-three-v1`.
- `lastSummary.sampleCount` is 0, `lastSummary.recordedBytes` is 0, and
  `lastSummary.historicalDebits` is false.
- Checkpoint identities match the current read-only inventory: the same set of
  `channelRef`, `edgeCredentialRef`, `materialDigest`, and billing binding, with
  no extra archived identity. Do not copy raw account, order, or credential
  values into the acceptance note.
- The new journal directory mode is `0700` and `checkpoint.json` mode is `0600`.
- The new journal has no `.tmp` file, no `pending.json`, and no `writer.lock`.
- SQLite sample and rollup totals equal the pre-initialize totals.
- The old journal tree digest is unchanged.

Acceptance is Ethan's decision on that receipt. It is not a second initialize.

### Step 7 — Point the sole collector at the new config

Command: operator-owned unit edit so the collector ExecStart uses the validated
candidate and the new config/digest only. Keep the old lane disabled. Do not
start a catch-up burst.

Expected receipt: exactly one writer; old unit still inactive; new timer not
yet enabled until Step 8; identity_gate state is `degraded` because stale
retained bindings remain and before counts were not captured.

Stop: both old and new writers enabled; old `--collect` still referenced; SGP
expansion; protocol restart.

### Step 8 — Natural collection and recovery claim

Enable the new timer. Observe at least two natural cycles with
`traffic-full-metering-collect.mjs --collect` against the new config only.

Expected receipt: new-boundary increments only; no duplicate samples; accepted
history preserved; unchanged account/plan/issuance/SGP sidecar; aggregate
identity gate recorded per `docs/IDENTITY_LIFECYCLE.md`. Only then claim
recovered and append a Deploy Note.

Stop: pause-interval debit; identity `missing`/`stale`/`changed`/`missing_material`
non-zero called healthy; old lane resumed; historical database restore.

## Rollback

Before any new journal write: restore the old collector pointer and keep the
old journal. After the new checkpoint exists or any new samples are written:
stop only this collector, retain ledger and both journals, and forward-correct.
Never restore a historical database over newer writes, never resume the old
checkpoint into the paused interval, and never clear counters.

## Remaining production gates

The source PR did not close them. The Deploy Note below closes item 6 for the
2026-10-12 BWH run only. Items 1–5 stay open. Item 5 was not satisfied, so
Step 8's recovered claim remains unmade.

1. Fresh live inventory of BWH collector/timer/config/journal/DB identity.
2. Exact Risk A approval for Step 3, then separately for Step 6 and Step 7.
3. Artifact Gate for this recovery CLI and probe, separate from the reused
   PR #773 49-file collector archive.
4. Linux fsync/SQLite/CLI validation of this new recovery CLI on the target
   runtime.
5. Production Identity Gate before/after with retention state.
6. Deploy Note for the 2026-10-12 BWH run: recorded below.

## Deploy Note: BWH full-metering new-activation recovery (2026-10-12)

Times are Pacific Time (PDT, UTC-7). This records the BWH local-three collector
recovery that already ran. It grants no further host action. Aggregate identity
counts were not taken, so the gate stays `pending` and this note does not call
identity healthy. Epic #437 and Issue #763 stay open. SGP and the other deferred
sources stay paused.

**Deployment Metadata:**

- **deployed_at**: 2026-10-12T03:28:07-07:00 (new timer enabled)
- **release_unit**: control-plane-app (collector component)
- **source_commit**: `a13495cd802de484e7948891e4aa064dc0e5ecb1` (PR #774 merge).
  The BWH recovery tools are those bytes. PR #775 merge
  `e4a8d08daf7c0860ce00d878b32f160c2d70ec48` (2026-10-12 3:30 AM PT) streams the
  backup digest and records the post-write-failure procedure; that merge was
  not the tool copy used on this BWH run.
- **artifact_or_release**: reused 49-file collector archive SHA-256
  `b68e7d6ecf62535a2f0dd92ed8c68190dadcab9f7d0689858eec148e8ddba8bf` at
  `/opt/gccwebos-runtime/collector-plan-e834185cca07` (plan source
  `e834185cca073455d8ac314cdf908ec8fc4c5e8d`). Probe SHA-256
  `39842f92e358ab19f90023ff5a220bfa8d05de36cd158dcc69c67f0827829827`.
  Recovery CLI SHA-256
  `906765b3f7b0f4be4518a4ee6e3f81da97d14ccb59645b583bd68cb89f9447b8`.
  Recovery lib SHA-256
  `028cfc1a47e0e5002775473f873b780964bd57d3f8d6b0fd8664b270d0945f04`.
  Recovery command module SHA-256 prefix `5ff14a17`.
- **target**: BWH `gccgw-full-metering-collect` for metering scope
  `local-three-v1`. Drop-in
  `gccgw-full-metering-collect.service.d/20-new-activation-20261012.conf`
  points `WorkingDirectory` and `ExecStart` at `collector-plan-e834185cca07`
  and the new config. OnFailure `gccgw-full-metering-collect-stop.service`
  stays in place. No IP, config body, or credential is recorded here.
- **backup**: online SQLite backup at 2026-10-12 2:22 AM PT, about 386 MiB,
  SHA-256 prefix `f50f306e`, `quick_check` ok. Samples 483,835, rollups 180,
  cursors 68. Journal, config, and unit backups kept under root-private
  `/root/recovery-20261012/`. No database restore.

**Cause and decision:**

PR #772 (`63dd535428a2c58e2f39f02af3ec2b673cd50b7e`) changed plan bindings.
The collector stopped on `full_metering_binding_changed`, and OnFailure
`gccgw-full-metering-collect-stop.service` stopped the timer at
2026-10-11 2:11:03 PM PT. Ethan decided the paused interval is not billed.
Recovery starts from a new zero-sample activation and a new absent journal.
The old journal stays read-only. Old activation
`bwh-local-three-20261009-01`, old sequence 6879, old config SHA-256
`682ced6e0c8e9c685f814f5a67b707e884953bcbd23689cace0def7af02d5b41`.

**Validation Results recorded at execution time:**

- Step 3 read-only probe ok. Aggregate admission: eligible 96, billingChanged
  3 admitted, newEligible 3.
- Step 4 and step 5b precheck returned `precheck_passed`.
- New config SHA-256 prefix `80a6cbac` at
  `/opt/proxy-gateway-minimal-candidate/full-metering-bwh-local-20261012/config.json`.
  Bound request is `request-v2.json`, SHA-256 prefix `dc1672dc`. The earlier
  `request.json` is void. Old journal digest prefix `04aa0673` stayed unchanged
  through the run.
- Step 6 initialize at 2026-10-12 2:25:48 AM PT created activation
  `bwh-local-three-20261012-01`. The process returned blocked
  `full_metering_recovery_memory_limit` (exit 2) at the final RSS bound check
  after `checkpoint.json` (120,800 B, sequence 0) was atomically written.
  The host tool read the whole backup into one Buffer. PR #775 fixes that
  path; this run did not use those bytes.
- Read-only acceptance passed and Ethan accepted it: new-context read;
  activation, sequence 0, and scope `local-three-v1`; zero samples and zero
  recorded bytes; checkpoint identities matched the read-only inventory;
  directory mode `0700` and `checkpoint.json` mode `0600`; no `.tmp`,
  `pending.json`, or `writer.lock`; SQLite totals unchanged from the
  pre-initialize totals; old journal digest unchanged. No account, order, or
  credential value is copied here.
- Step 7 kept the previous unit files as backups. Manual sequence 1 wrote 13
  samples and 1,292,893,590 B. The timer was enabled at 2026-10-12 3:28:07 AM
  PT. Natural sequence 2 wrote 9 samples and 67,370,899 B. Natural sequence 3
  wrote 7 samples and 16,460,236 B. Pause-interval debit is absent.
- Root-private files left on BWH: `/root/recovery-20261012/` (database backup
  with full business data, journal/config/unit backups, void `request.json`,
  `request-v2.json`, `units-pre7`), `/root/step4-recovery-a13495cd/` (recovery
  tools from the #774 bytes), read-only old journal
  `full-metering-bwh-local-20261009/`, old collector directory
  `collector-reset-fa492bd93c09`, and earlier staging/probe directories.
  Cleanup of those private directories is a separate approval.

**Identity gate:**

```yaml
identity_impact: true
identity_gate:
  surface: bwh-local-three   # japan-vless / japan-hy2 / japan-tuic
  before: not_captured
  after:
    japan-vless: {runtime_count: 32, mapped_count: 32, missing: 0, stale: 89, changed: 0, missing_material: 0}
    japan-hy2:   {runtime_count: 32, mapped_count: 32, missing: 0, stale: 76, changed: 0, missing_material: 0}
    japan-tuic:  {runtime_count: 32, mapped_count: 32, missing: 0, stale: 88, changed: 0, missing_material: 0}
  retention_state: pending
  state: degraded
```

Aggregate-only Identity Gate read on 2026-10-12 against a fresh read-only online snapshot of the control DB (sha256 a3deacdcda4afc90f316aaf655f87965cf36875867a626f191e1d9d83d70e89e, taken 2026-10-12 05:48 PT / 12:48 UTC, PRAGMA quick_check ok, sha unchanged after, no -wal/-shm), not the production DB; checker scripts/identity-gate-check.mjs from PR #777 (tip 4c787e37da1eefb04546c4344b09db6060b91374, merged as b610aac7d741cd64986f26cfb5d983e818e37e1e), script sha256 9653b2fff7449af3cb73cf1ca2ab2411838cef221252c09a939de7b230375319; both equalities held on all three surfaces; before counts were not captured before the recovery and cannot be reconstructed; state is degraded only because stale retained bindings remain resolvable per docs/IDENTITY_LIFECYCLE.md; stale entries are NOT deletion candidates, and any retirement needs a separate read-only retention inventory and separate Risk A approval; the former Hy2/TUIC missing keys from 2026-09-23 are 0 in this read.

**Risk Classification:** the host action was Risk A. This note is the record
of that completed run.
**Rollback Boundary:** the new checkpoint and new samples already exist, so
rollback is forward-only: stop this collector, keep the ledger and both
journals, and do not restore the database or resume the old checkpoint into
the paused interval. No restore was performed.

**Follow-ups:**

- Separate approval before deleting the BWH private recovery directories or
  backups.
- The BWH recovery tool copy predates PR #775.
- Production identity gate record, aggregate only, per
  `docs/IDENTITY_LIFECYCLE.md`.
- Issue #763 redeploy waits on a read-only look at `unknown_extra_member`.
- Keep observing later natural cycles.
- SGP and the other deferred sources remain paused.
