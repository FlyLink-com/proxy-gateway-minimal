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
`identity_impact: true`; `identity_gate.state: pending`;
`production_state: not_deployed`. Production/AWS impact of this source slice:
none. This document does not authorize SSH, host login, database/config/credential
reads, collector install, timer start, merge, or deployment.

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
| `scripts/lib/full-metering-new-activation-recovery.mjs` | `098ba4f4ad0dbeb037dd0db3643359da9407b622094a1df96460691fbf8736e7` |
| `scripts/traffic-full-metering-new-activation-recover.mjs` | `906765b3f7b0f4be4518a4ee6e3f81da97d14ccb59645b583bd68cb89f9447b8` |

Probe process bounds: 30s wall time, 256 MiB RSS, 32 MiB plain / 128 MiB
checkpoint / 256 MiB decoded payload, 10 000 identities, 5s systemctl and
SQLite timeouts. Recovery process bounds: 60s, 512 MiB RSS.

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
`098ba4f4ad0dbeb037dd0db3643359da9407b622094a1df96460691fbf8736e7`
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
The new journal path must still be absent.

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

### Step 7 — Point the sole collector at the new config

Command: operator-owned unit edit so the collector ExecStart uses the validated
candidate and the new config/digest only. Keep the old lane disabled. Do not
start a catch-up burst.

Expected receipt: exactly one writer; old unit still inactive; new timer not
yet enabled until Step 8; identity_gate still pending.

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

This source PR does not close them:

1. Fresh live inventory of BWH collector/timer/config/journal/DB identity.
2. Exact Risk A approval for Step 3, then separately for Step 6 and Step 7.
3. Artifact Gate for this recovery CLI and probe, separate from the reused
   PR #773 49-file collector archive.
4. Linux fsync/SQLite/CLI validation of this new recovery CLI on the target
   runtime.
5. Production Identity Gate before/after with retention state.
6. Deploy Note after actual completion.
