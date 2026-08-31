# Control-Plane SQLite Snapshot and Restore Contract

Last updated: 2026-08-14, America/Los_Angeles.

```yaml
document_metadata:
  doc_type: operational
  lifecycle: active
  authority_scope: control_plane_database_snapshot_restore
  superseded_by: null
  last_verified_at: 2026-08-14
  production_authority: false
```

> Status:
> - Risk: A for any host snapshot, restore, service stop, service start, or
>   release switch.
> - This document and the local gate script do not authorize a production
>   action.
> - Scope: the shared Subscription Control SQLite database resolved from the
>   live control-plane service configuration. It is not the legacy
>   subscription-runtime database used by `scripts/backup-subscriptions.sh`.

## Purpose and boundary

`scripts/control-plane-db-snapshot-gate-cli.mjs` is the unconditional CLI
launcher for the import-only `control-plane-db-snapshot-gate-lib.mjs` library.
The historical `control-plane-db-snapshot-gate.mjs` path is an explicit
compatibility launcher, not an importable implementation; direct execution can
therefore never return a silent status-0 result.
The snapshot and restore implementations are module-private. Only the CLI
runner may reach them after parsing the exact `--apply` contract, and that path
always uses the real systemd reader. The public start-guard verifier rejects an
injected reader before invoking it. Local mutation and guard-race tests derive
an in-memory harness from the exact source; no stateful core, capability issuer,
or test harness is exported by the production module.
It creates and verifies a standalone, SQLite-consistent snapshot only while the
approved service is stopped. Its
snapshot action first performs a controlled WAL checkpoint/quiesce, takes an
exclusive SQLite lock, then copies the settled main database into a private
snapshot and normalizes that copy to a standalone journal mode. It is suitable
for the release boundary where starting a new control-plane build may perform
foundational DDL even when wallet-first flags remain disabled.

Code-pointer rollback alone does not roll back that shared database. A later
database restoration is a separate, explicit Risk A decision. The gate does
not stop or start systemd, select a release, apply a schema, change a feature
flag, or perform an automatic rollback. The snapshot action is nevertheless a
stateful operation because its checkpoint/quiesce touches SQLite journal state;
it needs its own exact approved command boundary.

The legacy subscription backup and restore shell scripts remain scoped to their
own `SUBSCRIPTION_DB_PATH` runtime database. Do not use them for this control
database.

## Safety properties

- Every database, snapshot, manifest, and directory argument must be an
  absolute path. Final path entries and protected directories reject symlinks.
- Snapshot and rollback directories must already exist and be owner-only
  (`0700` on Linux). Snapshot database and manifest files are published as
  `0600`.
- Snapshot and restore both require a systemd unit-state readback of exactly
  `ActiveState=inactive` plus an externally established, runtime-only systemd
  condition start guard. The guard is a root-owned runtime drop-in whose
  negative `ConditionPathExists` refers to an existing root-owned block file;
  systemd therefore refuses every service start while the block remains. The
  gate verifies the exact derived drop-in and block paths, their ownership and
  modes, the drop-in contents, the manager's `DropInPaths` readback, no pending
  manager reload, and the effective `ConditionPathExists` tuple. The script
  only reads this state; it never stops, starts, creates, removes, masks, or
  unmasks a unit.
- The gate re-reads the inactive start guard at entry, before source database
  access, before each snapshot publication, immediately before the restore
  rename sequence, and after restore publication. A missing guard or any
  pre-publication change fails closed before the restore rename sequence. A
  post-publication change returns `attention_required` and keeps the unit
  under the external recovery decision.
- Snapshot runs a controlled `wal_checkpoint(TRUNCATE)` and an exclusive lock
  only while the service is inactive and start-blocked. On Linux, the
  invoking principal must own the database file, so an operator cannot leave
  root-owned WAL/SHM files beside a service-owned database. Busy, ownership,
  cleanup, or state-readback uncertainty fails closed.
- The source WAL/SHM companions must be settled and removed before copying the
  main file. The published snapshot is normalized to `DELETE` journal mode;
  its temporary, published, verified, and restored paths must contain no
  WAL/SHM companion. Do not copy a live `-wal` or `-shm` sidecar.
- A snapshot is accepted only after `quick_check` and `foreign_key_check` pass
  on the standalone snapshot. Its manifest binds basename, SHA-256, byte size,
  creation time, and safe SQLite health facts. CLI output does not emit paths,
  database contents, raw errors, or configuration values.
- Restore independently re-reads the inactive runtime condition guard. It creates and
  verifies a new pre-restore snapshot before publishing the verified snapshot
  bytes, removes stale WAL/SHM companions only while the service remains
  stopped and start-blocked, and verifies the restored file before returning.

`inactive` plus the verified runtime condition guard is a necessary service
boundary, not proof that no unrelated process can hold the database. If any other
control-database consumer is possible, stop at the gate and establish
exclusive custody in a new approved operation; do not run snapshot or restore
based only on an operator assumption.

The Welcome Coins schema is a stricter caller of this contract. Its production
apply must be owned by a separately frozen one-shot transaction wrapper. The
outer orchestrator runs as root: it validates and durably consumes the exact
Risk A execution envelope, acts as the approved operator that establishes the
runtime start guard and stops the service, and binds a fresh root-observed
aggregate main/WAL/SHM external-holder count of zero to the database
object/content identity. It then starts exactly one closed custody child as the
verified non-root service principal that owns the database. The child imports
the exported `runWelcomeCoinsSchemaCustodyChildCli` through
`scripts/control-plane-welcome-coins-activation-transaction-custody-cli.mjs`.
That runner, its private child core, the private schema core, and the private
exclusive-custody primitive are co-located in
`scripts/control-plane-db-snapshot-gate-lib.mjs`; together they
keep the same SQLite connection in verified `locking_mode=EXCLUSIVE` custody for the whole
checkpoint, fresh standalone snapshot, exact dry-run, schema apply, final
validation, and post-commit activation/verification boundary. After schema
commit it immediately opens a second read-only `BEGIN EXCLUSIVE` hold on that
same connection. A hash-bound verified parent release is the only normal path
that may produce terminal schema success from that hold. The separate
`scripts/control-plane-welcome-coins-schema-custody-gate-lib.mjs` is only the
fail-closed inspection/apply/CLI facade and is not the closed child's
implementation.

Before the child can enter custody, it must re-read and exactly match all real,
effective, saved-set, and filesystem UID/GID slots, the sole supplementary
service group, all five Linux capability sets at zero, `NoNewPrivs=1`,
`TracerPid=0`, the parent PID/start-time identity, and the fixed FD3/FD4/FD5
objects and directions. The candidate now includes a fixed no-argument native
root broker and a post-exec bootstrap that establishes `PR_SET_DUMPABLE=0`
before the child receives its three custody descriptors. The outer controller
also performs independent host-root `/proc/<child>` identity and hardening
readback; namespace ambiguity or missing proof remains fail-closed. These are
locally tested source/build contracts only: until clean-Linux privileged
validation, final hash freeze and terminal review are complete, and a new exact
Risk A execution approval is granted, production remains NO-GO.

The private artifact binding covers the exact transaction CLI, activation and
snapshot libraries, holder observer, both migration modules, custody CLI,
static outer wrapper, native broker, both post-exec bootstraps, native build
receipt, the complete materialized `node_modules` tree, and `/usr/bin/node`.
Files are bound by content SHA-256 and opened-file identity; the dependency tree
is bound by digest, entry count, total bytes, ownership/mode/link rules, and
internal-symlink policy. Names and raw symlink targets containing the legacy
record delimiter fail closed. The root controller revalidates the whole binding
before spawn, after binding the live broker and child through `/proc/<pid>/exe`,
immediately before commit authorization, and on both sides of the private
activation callback. A pathname or dependency tree replaced between those
boundaries cannot satisfy the approved binding.

Acquiring the exclusive connection is not by itself commit authority. The
child first reports only a bounded `exclusive_acquired` aggregate and pauses
before schema mutation. While that connection remains held, the root
orchestrator performs a second aggregate holder observation bound to the same
database identity and requires zero external main/WAL/SHM holders other than
the exact approved custody child. The authorization callback accepts only the
exact service-principal child claim and its process/channel identity hashes;
the second observation must report exactly one approved child holder and the
same aggregate identities. Only that success may release the one-time
commit authorization to the child. A missing, malformed, changed-identity, or
nonzero second observation closes the child without authorizing a schema
commit. After commit and final schema validation, the child emits one exact
aggregate-only `schema_ready_custody_held` frame while the second EXCLUSIVE
transaction is still open. The root performs activation and verification with
the service inactive, guard identity unchanged, and the complete artifact
binding revalidated. It then sends exactly one
`release_after_activation_verified` frame bound to the SHA-256 of that held
frame. Any failure instead attempts the equally bound
`release_after_attention` path and the transaction remains
`attention_required`.

The native broker binds the unique custody child with `pidfd_open` immediately
after fork. Once it has received the complete `schema_ready_custody_held`
frame, it sends `SIGSTOP` through that pidfd, waits for the matching stopped
state, revalidates the same hardened `/proc` identity, and only then forwards
the held frame to root. Root must complete challenge-bound heartbeats in the
fixed order `pre_activation`, `post_activation`, `post_verify`, and
`post_terminal_guard`. The broker does not interpret the business stage; it
echoes the canonical heartbeat payload only while that same pidfd is live and
the child is still stopped. Before accepting the held-frame-bound release it
performs the same readback again. It then writes FD5, sends `SIGCONT` through
the pidfd, and waits for the terminal child result. A missing, reordered,
mismatched, or unverifiable heartbeat is `attention_required` and cannot
produce a successful Receipt.

`release_after_activation_verified` is the only normal release that may
produce matching terminal schema success; it is not the only physical reason
an operating-system lock can disappear. `SIGKILL`, OOM, root/broker/child
death, kernel fault, host failure, or power loss can terminate a holder without
a parent release. If the wrapper remains able to report, that outcome is
`attention_required`; otherwise there is no acceptable success Receipt. A
valid `activation_verified_guarded` Receipt is therefore post-hoc evidence
that custody survived through the verified release under the reviewed Linux
process/kernel model. It is not cross-resource atomicity: the schema commit and
`.env` publication are distinct durable mutations. Without a valid success
Receipt, no operator or automation may start or retry the service, restore the
database, rewrite configuration, or remove the start guard before a fresh
read-only identity inventory.

The aggregate transaction Receipt records only that exclusive custody was held
through activation verification, that two holder-observation phases ran, and
that the custody was identity-bound. It does not claim that an external-holder
count remained continuously zero between the two point-in-time observations;
the retained SQLite connection is the continuous primitive.

Once commit transmission may have started, controller or terminal uncertainty
is never downgraded to a pre-commit block. The held phase has no 120-second
child execution deadline: the stopped child retains custody while the broker
waits on the controller socket and pidfd, and every heartbeat frame exchange
has its own 30-second I/O deadline. The 120-second child bound starts only
after the broker accepts the bound release, writes FD5, and resumes the child.
The outer 155-second terminal bound covers that wait, at most 30 seconds of
broker cleanup, and a fixed 5-second scheduling grace before an
identity-rebound containment kill. It must not be used as an external watchdog
to kill a legitimately stopped held-phase broker or child. The final
transaction remains `attention_required`; it may retain only an allowlisted
aggregate `custodyCondition` from a canonical native launcher/child receipt,
never stderr, a PID, a path, or an object identifier.

The wrapper must pass the exact pre-observed database-object, parent-directory,
and logical-content identity hashes into the closed child boundary. The gate
rechecks those identities before checkpoint and again under the exclusive
transaction, copies the snapshot from a retained descriptor rather than a
re-resolved pathname,
and retains snapshot, manifest, and (on Linux) snapshot-directory descriptors.
It revalidates the complete snapshot artifact before and after schema commit.
A replaced main path, changed logical database, changed snapshot/manifest, or a
new/replaced WAL/SHM inode fails closed; a sidecar appearing after a committed
mutation is preserved for investigation and returns attention-required rather
than being unlinked.

On Linux the gate opens and verifies the protected snapshot directory before
copying any database byte, creates the artifact through that retained directory
descriptor, and keeps the protected dry-run root on a retained descriptor as
well. The schema dry-run receives `/proc/self/fd/<snapshot-fd>` for the retained
snapshot object, never the public snapshot pathname, so a temporary leaf or
directory swap cannot redirect validation to a substitute database. It also
snapshots the still-live process FD-to-object identity map immediately before
SQLite open, treats a reused FD number with a changed object identity as new,
requires the unique newly opened main-database FD to match the frozen inode,
and rechecks that exact FD while custody is active. Snapshot, manifest, guard,
database path, companion set, directory evidence, and the committed logical
database hash are checked once more after the mutation connection closes. The
final logical hash is computed inside a fresh `BEGIN EXCLUSIVE` transaction,
after the final guard readback and artifact/descriptor cleanup, as the last
synchronous database action before the safe receipt. Logical identity v2
includes the exact schema cookie, normalized journal mode, schema, declared
column values, and the accessible hidden SQLite `rowid`; `WITHOUT ROWID` tables
are explicitly distinguished, while a rowid
table that declares all three SQLite aliases (`_rowid_`, `rowid`, and `oid`)
fails closed because its hidden identity cannot be observed. A same-inode
DELETE-journal write, including a rowid-only write, during close or final guard
readback is therefore attention-required rather than a `schema_ready` receipt.
The terminal connection keeps its local ownership reference until rollback,
close (with one bounded retry), and Linux FD closure are all reconciled; any
observed cleanup fault still blocks the receipt. Loss of
snapshot or directory evidence takes precedence over a simultaneous operation
failure, including when the evidence readback itself raises a native filesystem
error; it is reported as `snapshot_unavailable` with the conservative mutation
state.

The standalone Welcome schema CLI launcher remains available for `validate` and
`dry-run`, but direct `--mode apply` returns `custody_gate_required` before
validation or database mutation. The legacy schema custody-gate facade and its
dedicated CLI launcher always return `execution_envelope_required`; they accept
no production arguments and expose no package apply script. They are distinct
from the activation transaction's closed custody-child launcher. A successful local test or
snapshot is not a production approval. Only the separately frozen transaction
envelope may bind the initial holder-zero observation, closed custody child,
second holder check, commit authorization, schema write, and configuration
activation as one Risk A operation. Service start, health validation, operator
canary, start-guard cleanup, and restore remain later independent Risk A
decisions; restore is never an automatic response to a custody failure.

The schema core, exclusive-custody primitive, and closed-child core are
co-located in `control-plane-db-snapshot-gate-lib.mjs` and remain
module-private. That module exports only the dedicated closed-child CLI runner
for this path; the activation transaction custody launcher imports it directly.
Tests derive an in-memory harness from the exact reviewed source; the checked-in
production modules expose neither that harness nor a generic mutator or
environment-variable capability.
Importing an implementation has no CLI side effect, even if `process.argv[1]`
aliases that module. The three dedicated `*-cli.mjs` launchers dispatch
unconditionally and never infer main-module identity from a symlink or
`process.argv[1]`; the custody launcher returns `execution_envelope_required`
before reading a guard or database path. The candidate outer root wrapper is a
fixed no-argument static-PIE entry invoked by its reviewed absolute path, not by
first starting `node`, `npm`, `/usr/bin/env`, a shell, or a `PATH` search. It
selects exact `/usr/bin/node`, synthesizes the permitted environment, and uses
the reviewed outer post-exec bootstrap to establish the non-dumpable root Node
image. Its read-only pre-import gate must bind FD3 and the complete candidate
closure before the activation library or package dependencies load. Only after
that gate does it validate and durably consume the exact FD3 execution envelope
and own the root-to-service-principal child capability. It composes the fixed
native launcher, inner post-exec bootstrap, aggregate-only holder observer, and
private in-module custody call; only that single child may reach the mutation
boundary.
The candidate is not production-executable merely because this source path now
exists: clean-Linux privileged validation, final freeze/review, and a new exact
Risk A approval remain mandatory. The three historical non-`-lib` script names are
also unconditional compatibility launchers, so invoking an old command emits
the same safe receipt and nonzero status instead of a false success.

## Required approval packet

Before any host command, the approval packet must bind:

- exact host, service unit, release candidate, and current release identity;
- the exact outer root wrapper as the approved operator that establishes the
  runtime condition start guard and stopped state, plus readback evidence of
  `ActiveState=inactive` and the exact runtime drop-in listed in
  `DropInPaths`;
- the exact non-root service-principal identity and closed custody-child
  executable, the initial holder-zero/database-identity tuple, the required
  `exclusive_acquired` handoff, the second root holder-zero observation, and
  the one-time commit-authorization channel;
- the live resolved control-database path, kept private;
- a pre-created protected snapshot directory and distinct protected rollback
  directory, kept private;
- exact commands below, expected service state, backup retention owner, and
  post-operation validation;
- the separate post-transaction decision and command authority for starting
  the unit, validating health and the operator canary, and removing the exact
  runtime block/drop-in; neither the snapshot gate nor the minimal wrapper has
  authority to do those later actions;
- a pointer/code rollback plan and a separate database-restore decision rule.

The packet must state that a failed new release may require two decisions:
first return the release pointer, then decide whether the verified pre-switch
database snapshot must be restored. It must not promise automatic database
rollback.

## Approved-command shape

The following are command shapes only. Replace shell variables privately from
fresh inventory; never paste the resolved database path or snapshot locations
into an issue, PR, chat, or Deploy Note.

All `guard`, `snapshot`, `verify`, and `restore` invocations must run as the
already verified service principal that owns the control database. The root
operator establishes or removes the runtime guard, but a direct root invocation
of the database gate is intentionally rejected. In the command shapes below,
`$SERVICE_PRINCIPAL`, `$NODE_BINARY`, and `$CANDIDATE_RELEASE` are bound
privately in the approval packet; `$NODE_BINARY` is an absolute trusted binary
and the service-principal invocation uses a minimal approved `PATH`.

For the Welcome Coins one-shot boundary, the outer wrapper is that approved
root operator, while the single closed child is the service-principal database
caller. The snapshot gate itself still only reads and verifies the guard; it
does not create, delete, or relax the block/drop-in. A successful minimal
wrapper ends at `activation_verified_guarded` with the service still inactive
and the exact guard retained. Start, health, canary, and guard cleanup are not
implicit continuation steps.

### Pre-switch start guard, quiesce, and snapshot

First use a separately approved systemd operation to establish both the
runtime-only systemd condition start guard and stopped state. For the Welcome
Coins transaction, the outer root wrapper is the approved operator; the
snapshot gate and custody child are not. The operation creates the block before
the runtime drop-in is loaded, so there is never a stopped-but-unguarded window;
the runtime guard is cleared by a host reboot, which invalidates this approval
packet and requires fresh inventory.

```bash
set -euo pipefail

SERVICE_UNIT=proxy-gateway-candidate.service
GUARD_ROOT=/run/control-plane-db-snapshot-gates
BLOCK_FILE="$GUARD_ROOT/$SERVICE_UNIT.block"
DROPIN_DIR="/run/systemd/system/$SERVICE_UNIT.d"
DROPIN_FILE="$DROPIN_DIR/zzzzzz-control-plane-db-snapshot-start-guard.conf"

install -d -o root -g root -m 0711 -- "$GUARD_ROOT"
install -d -o root -g root -m 0755 -- "$DROPIN_DIR"
install -o root -g root -m 0600 /dev/null "$BLOCK_FILE"
printf '[Unit]\nConditionPathExists=!%s\n' "$BLOCK_FILE" > "$DROPIN_FILE"
chown root:root "$DROPIN_FILE"
chmod 0644 "$DROPIN_FILE"
systemctl daemon-reload
sudo -u "$SERVICE_PRINCIPAL" -- env -i PATH=/usr/bin:/bin \
  "$NODE_BINARY" "$CANDIDATE_RELEASE/scripts/control-plane-db-snapshot-gate-cli.mjs" \
  --mode guard \
  --service-unit "$SERVICE_UNIT" \
  --expected-service-state active
systemctl stop -- "$SERVICE_UNIT"
sudo -u "$SERVICE_PRINCIPAL" -- env -i PATH=/usr/bin:/bin \
  "$NODE_BINARY" "$CANDIDATE_RELEASE/scripts/control-plane-db-snapshot-gate-cli.mjs" \
  --mode guard \
  --service-unit "$SERVICE_UNIT" \
  --expected-service-state inactive
```

The first guard readback must pass while the service is still `active`; otherwise
do not stop it. The second must return `guarded` with `ActiveState=inactive`.
Both checks require `LoadState=loaded`, `NeedDaemonReload=no`, the exact
runtime drop-in in `DropInPaths`, the effective condition tuple, and the exact
root-owned block/drop-in identities. Retain only the redacted results in the
private approval packet. The snapshot command re-reads the same guard at its
key boundaries, performs the approved WAL checkpoint/quiesce, then produces
the snapshot. It does not stop, start, create, remove, mask, or unmask the
guard. Production does not use a start probe; validate the condition behavior
first against a disposable Linux unit whose fragment is in `/etc/systemd/system`.

This is the only accepted start-guard form for this contract. An inactive unit,
a raw runtime mask, or a different runtime guard is not an equivalent state and
must fail closed. The gate also binds the exact drop-in and block-file identity
at entry; replacement of either during the boundary is a guard change.

```bash
sudo -u "$SERVICE_PRINCIPAL" -- env -i PATH=/usr/bin:/bin \
  "$NODE_BINARY" "$CANDIDATE_RELEASE/scripts/control-plane-db-snapshot-gate-cli.mjs" \
  --mode snapshot \
  --db-path "$CONTROL_DB_PATH" \
  --snapshot-dir "$CONTROL_DB_SNAPSHOT_DIR" \
  --service-unit proxy-gateway-candidate.service \
  --expected-service-state inactive \
  --apply
```

Immediately perform independent verification against the exact generated pair:

```bash
sudo -u "$SERVICE_PRINCIPAL" -- env -i PATH=/usr/bin:/bin \
  "$NODE_BINARY" "$CANDIDATE_RELEASE/scripts/control-plane-db-snapshot-gate-cli.mjs" \
  --mode verify \
  --snapshot-path "$SNAPSHOT_FILE" \
  --manifest-path "$SNAPSHOT_MANIFEST"
```

Record only the returned snapshot identity, size, health booleans, and result
state in the approval evidence. Do not record a path, raw hash input, or a
database row.

### Separate post-switch start and post-health cleanup

Only after the pointer switch has its own approval and the snapshot evidence is
accepted may the operator deliberately permit the first start. Keep the exact
runtime drop-in loaded through post-start health validation. The sole temporary
opening is removal of the block immediately before the approved `systemctl
start`; immediately after that command completes, the same block is recreated
before the active readback so future systemd starts remain blocked during health
validation. If any command
in this sequence fails, the error trap recreates the same root-owned block
before the command returns. Do not use a broad wildcard or remove any other
drop-in.

```bash
set -eEuo pipefail

reblock_on_start_failure() {
  local status=$?
  trap - ERR
  install -o root -g root -m 0600 /dev/null "$BLOCK_FILE"
  exit "$status"
}

trap reblock_on_start_failure ERR
rm -- "$BLOCK_FILE"
systemctl start -- "$SERVICE_UNIT"
install -o root -g root -m 0600 /dev/null "$BLOCK_FILE"
systemctl is-active --quiet -- "$SERVICE_UNIT"
trap - ERR
```

After the separately approved health window succeeds, cleanup is a distinct
post-start housekeeping action. It must not be attempted after a failed start
or failed health gate. A cleanup failure is an `attention_required` operator
event; it does not justify stopping, restarting, or bypassing the service
implicitly.

```bash
set -euo pipefail

test -f "$BLOCK_FILE"
systemctl is-active --quiet -- "$SERVICE_UNIT"
rm -- "$DROPIN_FILE"
systemctl daemon-reload
rm -- "$BLOCK_FILE"
rmdir --ignore-fail-on-non-empty -- "$DROPIN_DIR" "$GUARD_ROOT"
```

### Restore prerequisite and execution

Restore is not part of release-pointer rollback. It requires a fresh, separate
approval after the external systemd operation has established the inactive
runtime condition guard. The service must remain stopped and start-blocked for
the entire restore and verification sequence. The gate itself will reject
`active`, `failed`, `activating`, indeterminate, unavailable, unguarded, or
changed states before publication.

```bash
sudo -u "$SERVICE_PRINCIPAL" -- env -i PATH=/usr/bin:/bin \
  "$NODE_BINARY" "$CANDIDATE_RELEASE/scripts/control-plane-db-snapshot-gate-cli.mjs" \
  --mode restore \
  --db-path "$CONTROL_DB_PATH" \
  --snapshot-path "$VERIFIED_PRE_SWITCH_SNAPSHOT" \
  --manifest-path "$VERIFIED_PRE_SWITCH_MANIFEST" \
  --rollback-dir "$CONTROL_DB_PRE_RESTORE_DIR" \
  --service-unit proxy-gateway-candidate.service \
  --expected-service-state inactive \
  --apply
```

On success, the command leaves the service stopped and start-blocked and
returns a verified `preRestoreSnapshot` identity. It independently re-reads
the guard before the pre-restore snapshot, before publishing replacement
bytes, and afterward. Review that result before a separately approved removal
of the exact runtime block/drop-in, service start, and post-start release
validation. On a blocked or
`attention_required` result, do not remove the runtime block/drop-in, start the
service, or retry under the same approval; retain the evidence and open a new
exact Risk A gate.

## Production release sequence

1. Perform fresh read-only inventory and bind the real shared database to the
   approval packet.
2. Under a separate exact approval, establish the systemd runtime condition
   start guard and stopped state, confirm `inactive`, `LoadState=loaded`,
   `NeedDaemonReload=no`, and the exact drop-in readback, then create and
   verify the stateful pre-switch control-database snapshot. Retain the guard
   until a later separately approved removal/start decision.
3. Prepare and verify the candidate release, protected overlays, and previous
   pointer. Do not change database schema or feature flags in this step.
4. Only after explicit approval, carry out the bounded release switch. A
   separate approved condition-guard removal/start action is required before
   service validation.
5. If the release fails after possible startup DDL, re-establish the inactive
   runtime condition guard and decide explicitly: code-pointer rollback may be
   sufficient, or the separately approved restore above may be required.
   Revalidate the database and service before declaring recovery.

This sequence intentionally keeps default-off binary rollout, Portal release,
schema migration, wallet-first activation, and database restoration as
independent gates.
