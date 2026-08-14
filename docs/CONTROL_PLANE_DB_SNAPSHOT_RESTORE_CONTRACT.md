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

`scripts/control-plane-db-snapshot-gate.mjs` creates and verifies a standalone,
SQLite-consistent snapshot only while the approved service is stopped. Its
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

## Required approval packet

Before any host command, the approval packet must bind:

- exact host, service unit, release candidate, and current release identity;
- the separately approved external command that establishes the runtime
  condition start guard and stopped state, plus readback evidence of
  `ActiveState=inactive` and the exact runtime drop-in listed in
  `DropInPaths`;
- the live resolved control-database path, kept private;
- a pre-created protected snapshot directory and distinct protected rollback
  directory, kept private;
- exact commands below, expected service state, backup retention owner, and
  post-operation validation;
- the separate post-gate decision and command authority for removing the exact
  runtime block/drop-in and starting the unit; the snapshot/restore gate has no
  authority to do either;
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

### Pre-switch start guard, quiesce, and snapshot

First use a separately approved systemd operation to establish both the
runtime-only systemd condition start guard and stopped state. This command is
run by the operator, not by the gate script. It creates the block before the
runtime drop-in is loaded, so there is never a stopped-but-unguarded window;
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
  "$NODE_BINARY" "$CANDIDATE_RELEASE/scripts/control-plane-db-snapshot-gate.mjs" \
  --mode guard \
  --service-unit "$SERVICE_UNIT" \
  --expected-service-state active
systemctl stop -- "$SERVICE_UNIT"
sudo -u "$SERVICE_PRINCIPAL" -- env -i PATH=/usr/bin:/bin \
  "$NODE_BINARY" "$CANDIDATE_RELEASE/scripts/control-plane-db-snapshot-gate.mjs" \
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
  "$NODE_BINARY" "$CANDIDATE_RELEASE/scripts/control-plane-db-snapshot-gate.mjs" \
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
  "$NODE_BINARY" "$CANDIDATE_RELEASE/scripts/control-plane-db-snapshot-gate.mjs" \
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
  "$NODE_BINARY" "$CANDIDATE_RELEASE/scripts/control-plane-db-snapshot-gate.mjs" \
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
