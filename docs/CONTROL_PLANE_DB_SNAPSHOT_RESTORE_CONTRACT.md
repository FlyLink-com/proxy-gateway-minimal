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
  `ActiveState=inactive` and `UnitFileState=masked-runtime`. The latter is an
  externally established, runtime-only start guard: it prevents a service
  start during the database boundary. The script only reads this state; it
  never stops, starts, masks, or unmasks a unit.
- The gate re-reads the inactive runtime mask at entry, before source database
  access, before each snapshot publication, immediately before the restore
  rename sequence, and after restore publication. A missing guard or any
  pre-publication change fails closed before the restore rename sequence. A
  post-publication change returns `attention_required` and keeps the unit
  under the external recovery decision.
- Snapshot runs a controlled `wal_checkpoint(TRUNCATE)` and an exclusive lock
  only while the service is inactive and runtime-masked. On Linux, the
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
- Restore independently re-reads the inactive runtime mask. It creates and
  verifies a new pre-restore snapshot before publishing the verified snapshot
  bytes, removes stale WAL/SHM companions only while the service remains
  stopped and runtime-masked, and verifies the restored file before returning.

`inactive` plus `masked-runtime` is a necessary service boundary, not proof
that an unrelated process cannot hold the database. If any other
control-database consumer is possible, stop at the gate and establish
exclusive custody in a new approved operation; do not run snapshot or restore
based only on an operator assumption.

## Required approval packet

Before any host command, the approval packet must bind:

- exact host, service unit, release candidate, and current release identity;
- the separately approved external command that establishes the runtime mask
  and stopped state, plus readback evidence of
  `ActiveState=inactive` / `UnitFileState=masked-runtime`;
- the live resolved control-database path, kept private;
- a pre-created protected snapshot directory and distinct protected rollback
  directory, kept private;
- exact commands below, expected service state, backup retention owner, and
  post-operation validation;
- the separate post-gate decision and command authority for unmasking and
  starting the unit; the snapshot/restore gate has no authority to do either;
- a pointer/code rollback plan and a separate database-restore decision rule.

The packet must state that a failed new release may require two decisions:
first return the release pointer, then decide whether the verified pre-switch
database snapshot must be restored. It must not promise automatic database
rollback.

## Approved-command shape

The following are command shapes only. Replace shell variables privately from
fresh inventory; never paste the resolved database path or snapshot locations
into an issue, PR, chat, or Deploy Note.

### Pre-switch start guard, quiesce, and snapshot

First use a separately approved systemd operation to establish both the
runtime-only start guard and stopped state. This command is run by the
operator, not by the gate script:

```bash
systemctl mask --runtime --now -- "$SERVICE_UNIT"
systemctl show --property=ActiveState --property=UnitFileState -- "$SERVICE_UNIT"
```

Proceed only when the readback reports `ActiveState=inactive` and
`UnitFileState=masked-runtime`. Retain that evidence in the private approval
packet. The snapshot command below re-reads the same guard at its key
boundaries, performs the approved WAL checkpoint/quiesce, then produces the
snapshot. It does not stop, start, mask, or unmask the service.

```bash
node scripts/control-plane-db-snapshot-gate.mjs \
  --mode snapshot \
  --db-path "$CONTROL_DB_PATH" \
  --snapshot-dir "$CONTROL_DB_SNAPSHOT_DIR" \
  --service-unit proxy-gateway-candidate.service \
  --expected-service-state inactive \
  --apply
```

Immediately perform independent verification against the exact generated pair:

```bash
node scripts/control-plane-db-snapshot-gate.mjs \
  --mode verify \
  --snapshot-path "$SNAPSHOT_FILE" \
  --manifest-path "$SNAPSHOT_MANIFEST"
```

Record only the returned snapshot identity, size, health booleans, and result
state in the approval evidence. Do not record a path, raw hash input, or a
database row.

### Restore prerequisite and execution

Restore is not part of release-pointer rollback. It requires a fresh, separate
approval after the external systemd operation has established the inactive
runtime mask. The service must remain stopped and runtime-masked for the entire
restore and verification sequence. The gate itself will reject `active`,
`failed`, `activating`, indeterminate, unavailable, unmasked, or changed
states before publication.

```bash
node scripts/control-plane-db-snapshot-gate.mjs \
  --mode restore \
  --db-path "$CONTROL_DB_PATH" \
  --snapshot-path "$VERIFIED_PRE_SWITCH_SNAPSHOT" \
  --manifest-path "$VERIFIED_PRE_SWITCH_MANIFEST" \
  --rollback-dir "$CONTROL_DB_PRE_RESTORE_DIR" \
  --service-unit proxy-gateway-candidate.service \
  --expected-service-state inactive \
  --apply
```

On success, the command leaves the service stopped and runtime-masked and
returns a verified `preRestoreSnapshot` identity. It independently re-reads
the guard before the pre-restore snapshot, before publishing replacement
bytes, and afterward. Review that result before a separately approved unmask,
service start, and post-start release validation. On a blocked or
`attention_required` result, do not unmask, start the service, or retry under
the same approval; retain the evidence and open a new exact Risk A gate.

## Production release sequence

1. Perform fresh read-only inventory and bind the real shared database to the
   approval packet.
2. Under a separate exact approval, establish the systemd runtime mask and
   stopped state, confirm `inactive` / `masked-runtime`, then create and verify
   the stateful pre-switch control-database snapshot. Retain the guard until a
   later separately approved unmask/start decision.
3. Prepare and verify the candidate release, protected overlays, and previous
   pointer. Do not change database schema or feature flags in this step.
4. Only after explicit approval, carry out the bounded release switch. A
   separate approved unmask/start action is required before service validation.
5. If the release fails after possible startup DDL, re-establish the inactive
   runtime mask and decide explicitly: code-pointer rollback may be sufficient,
   or the separately approved restore above may be required. Revalidate the
   database and service before declaring recovery.

This sequence intentionally keeps default-off binary rollout, Portal release,
schema migration, wallet-first activation, and database restoration as
independent gates.
