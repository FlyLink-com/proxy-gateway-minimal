# A3-2 Production XFS Storage Remediation Design

> Status:
> - Type: Risk A design and runbook boundary
> - State: proposed; implementation and execution are not authorized
> - Design base: `master@e7bed98580e9e54dec316c211895f4f47927e448`
> - A3 source-contract commit: `b93577c99c1202d1f799e2da4e573c8ad7fcf13c`
> - Target role: `vultr-japan-control`
> - Production impact of this document: none
> - Execution authority: none

```yaml
document_metadata:
  doc_type: operational
  lifecycle: active
  authority_scope: a3_2_production_xfs_storage_remediation_design
  superseded_by: null
  last_verified_at: 2026-08-23
  production_authority: false
```

Refs: issue #636; PRs #654, #656, #658, and #659; A3-2 terminal
inventory receipt `#issuecomment-5385197978`.

## 1. Decision

The current production host must **not** be converted by formatting its system
disk, by placing a loopback XFS image on the ext4 root, or by mounting a new
filesystem over the complete deployment root under the current source
contract.

The preferred remediation is:

1. keep the active release, shared SQLite database, protected configuration,
   receipts, backups, and existing release history on the current ext4
   deployment filesystem;
2. attach a dedicated, previously unused block volume and create an XFS
   filesystem for an A3-only materialization workspace;
3. change the default-off A3 source contract so quota readback and untrusted
   artifact extraction target that fixed workspace rather than the complete
   deployment root;
4. copy the already bounded and recursively verified dependency tree into a
   same-device temporary directory under the candidate release, re-audit it,
   and only then atomically rename it to the candidate's `node_modules`;
5. keep production materialization, promotion, and A3 activation as later,
   separately approved Risk A gates.

This design intentionally adds a source prerequisite. The exact source merged
through PR #658 requires the complete fixed deployment root to be the XFS
project tree. Satisfying that requirement literally would place the live
database and all retained releases inside the same project quota as an A3
materialization attempt. That is technically compatible but is not the safest
production storage boundary.

## 2. Current evidence and terminal state

The consumed A3-2 read-only inventory established the following facts without
production mutation:

| Fact | Observed state |
| --- | --- |
| Live control-plane release | `control-plane-57d7ab751b9c-a5b2-20260816T002126Z-1786839686627` |
| Live service | loaded, active/running, result success, restart count 0 |
| A3 activation | absent |
| Deployment-root filesystem | ext4 |
| Project-quota mount option | absent |
| Project accounting/enforcement/report | unavailable |
| Deployment-root project ID | unavailable |
| Filesystem capacity | 180637249536 bytes total; 140537528320 bytes available; 19% used |
| Existing release directories | 94; no retention action authorized |
| Shared SQLite | regular mode-0600; read-only `quick_check` was `ok` |
| Candidate/assembly/dependency receipt/staging | absent for the bounded candidate |
| Production mutation | none |

The terminal decision remains `NO-GO` with condition
`production_storage_quota_boundary_unavailable`. This document does not change
that condition.

Two adjacent findings remain separate prerequisites:

- the protected proxy configuration was observed as mode `0644` and needs its
  own least-privilege review before it is copied into a future candidate;
- the inventory helper's command-presence booleans need a local source fix and
  test before another production inventory. Neither finding authorizes an
  additional host session.

## 3. Exact source-path truth

The storage choice must follow the implementation rather than the name of the
guard.

| Current source behavior | Consequence |
| --- | --- |
| Production runtime fixes `root` to `/opt/proxy-gateway-minimal-candidate`. | An operator cannot inject an alternate project root. |
| Production quota readback sets `projectRoot = supplied.root`. | The complete deployment root must currently resolve to XFS and project ID. |
| `xfs_io lsproj`, `xfs_quota project -c`, accounting, enforcement, and byte/inode hard-limit reports all target that root. | A subdirectory-only XFS mount does not satisfy the current receipt contract. |
| Artifact staging is created under `<root>/dependency-staging`. | Extraction presently occurs on the deployment filesystem. |
| Publication requires staging and candidate root to have the same device ID. | Cross-filesystem rename is intentionally rejected. |
| The extracted `node_modules` is renamed without replacement into the candidate root. | The atomic publish invariant must be preserved after storage separation. |
| Dependency artifacts allow at most 2 GiB tree bytes and 250000 entries, with 512 MiB and 4096-entry extraction reserves. | Quota admission can be derived from immutable manifest bounds rather than only requiring positive headroom. |

The older transient build worker uses systemd `StateDirectory` below
`/var/lib/private`, but that path is not the production artifact-materializer
write path activated by PR #658. Moving only that directory to XFS would not
fix A3-2.

## 4. Options considered

| Option | Current-code compatible | Risk | Decision |
| --- | --- | --- | --- |
| Remount or convert ext4 in place | No | Destructive conversion is unsupported; system disk and production data are at risk. | Rejected |
| Production loopback XFS image on ext4 | Superficially | Base ext4 exhaustion, loop-device lifecycle, boot ordering, and recovery make the quota proof circular. | Rejected |
| Repartition the current disk | Potentially | Destructive and unnecessary without separately proven unallocated capacity. | Rejected |
| New XFS volume mounted over the complete deployment root | Yes | Requires offline migration of active release, shared DB, protected files and 94 releases; one project quota can return EDQUOT to the live DB. | Not selected |
| New XFS volume for a fixed A3-only workspace plus source separation | Requires a reviewed source PR | Keeps durable production data outside the materialization quota while preserving bounded extraction and a same-device final publish. | Preferred |

The complete-root migration may be reconsidered only under a new design that
explicitly accepts database quota coupling, outage, full-tree migration, boot
mount dependency, and rollback retention. It is not a fallback authorized by
this document.

## 5. Preferred storage architecture

```text
current ext4 deployment filesystem
  /opt/proxy-gateway-minimal-candidate
    current -> releases/<active>
    releases/<candidate>/.node_modules-import-<run>  # bounded trusted copy
    releases/<candidate>/node_modules                # atomic local rename
    shared database / protected config / receipts

dedicated block-backed XFS filesystem
  /var/lib/control-plane-a3-materializer
    project/                                         # project ID + PROJINHERIT
      dependency-staging/<candidate>/<run>
        project/node_modules                         # extract, normalize, audit, smoke
```

The XFS mountpoint and project path are fixed source constants. CLI arguments
must not select arbitrary storage paths. The project tree is root-owned, has no
symlink or nested-mount components, and is assigned one reviewed positive
project ID with `PROJINHERIT` before any write.

The filesystem should use a stable block identity such as an approved
`/dev/disk/by-id/...` path and filesystem UUID. Receipts publish only hashes or
bounded logical identities, never raw serial numbers or provider credentials.

Required mount properties are:

- filesystem type `xfs`;
- project quota enabled with `prjquota` or the platform-equivalent `pquota`;
- `nodev` and `nosuid`;
- no `noexec` until a clean physical test proves the native `.node` smoke can
  load from that mount;
- a boot policy that preserves the existing service if the optional A3
  workspace is unavailable, while the materializer itself fails closed;
- no bind, overlay, loop, network, or device-mapper layer unless separately
  inventoried and approved.

The current control-plane service does not consume the workspace after a
successful local publish. Therefore a missing workspace must block only A3
materialization, not prevent the already active release from starting.

## 6. Source prerequisite

A separate source-only PR must remain default-off and complete all of these
changes before any production XFS mutation is proposed:

1. Introduce one fixed production A3 workspace root distinct from the fixed
   deployment root. Runtime injection cannot override either path.
2. Point production XFS/project/quota readback at the fixed A3 project tree.
3. Put artifact extraction, normalization, recursive audit, and prepublish
   service-native smoke entirely inside that project tree.
4. Admit an artifact only after deriving a conservative allocated-space upper
   bound from the fresh target filesystem block size and the already validated
   archive member sizes/types. Logical `tree.totalBytes` alone is forbidden as
   a quota budget. The frozen source formula must, at minimum:
   - round regular-file data to filesystem allocation blocks;
   - charge every entry at least one additional block for directory, symlink,
     per-file rounding, and metadata overhead;
   - add a separately fixed metadata safety reserve and the existing 512 MiB
     extraction reserve;
   - require fresh quota byte headroom at least that allocated-space upper
     bound and inode headroom at least manifest `tree.entryCount` plus the
     4096-inode reserve.
5. Replace the cross-device rename with a two-stage publication barrier:
   - before copying, require fresh target-ext4 available bytes and inodes to
     cover an independently calculated allocated-space upper bound using the
     ext4 block size, the inode reserve, and an operational low-water margin;
   - copy the normalized verified tree from XFS into a fresh root-owned
     temporary directory inside the candidate root;
   - enforce manifest byte/entry bounds while copying without following
     symlinks or accepting special files;
   - re-read target-ext4 availability before each bounded copy batch and stop
     before the next write if it would cross the fixed low-water threshold;
   - fsync files and directories;
   - recursively re-audit and require the exact normalized tree digest,
     entry count, and byte count;
   - atomically rename that same-device temporary directory to `node_modules`
     with no replacement;
   - fsync the candidate parent after rename;
   - require the final path to be a non-symlink directory whose inode is the
     captured temporary-directory inode;
   - recursively re-audit the final path and require the exact normalized tree
     digest, entry count, and byte count;
   - run the postpublish service-native smoke and re-read the unchanged quota
     boundary;
   - publish the materialization receipt only after all post-rename barriers
     succeed.
6. On failure, remove only inode-bound staging created by that attempt. Never
   remove an existing candidate tree, receipt, current pointer, shared DB, or
   unrelated workspace.
7. Keep quota evidence before extraction and after publication, but bind the
   receipt to the dedicated project-tree identity.
8. Add negative tests for missing mount, wrong filesystem, wrong project ID,
   missing inheritance, changed hard limits, insufficient quota headroom,
   cross-device source, copy truncation, symlink/special-file injection,
   digest drift, pre/post-rename fsync failure, final-inode drift, final-tree
   drift, postpublish-smoke failure, receipt-before-barrier ordering, rename
   collision, low-water crossing, and cleanup uncertainty. Admission tests must
   include a contract-limit synthetic 250000-entry member set dominated by
   zero/one-byte files so tiny-file allocation overhead cannot collapse back to
   logical bytes.

The source PR requires focused tests, the full server test baseline,
`git diff --check`, exact-head CI, and independent P0/P1 review. It authorizes
no provider, SSH, block-device, mount, quota, deployment, or production action.

After that source PR, the revised path must be physically tested in a clean
non-production XFS environment. The test must cover real byte and inode
`EDQUOT`, the new cross-filesystem copy barrier, pre/post service-native smoke,
receipt validation, cleanup, and negative mount/project-tree cases.

## 7. Capacity and quota admission

This design does not guess a provider volume size or hard limit before fresh
inventory. The execution proposal must bind exact integers.

Minimum inode admission follows the current artifact contract. Byte admission
must use the allocated-space upper bound from section 6 rather than logical
bytes:

```text
required_byte_headroom  = allocated_tree_upper_bound + 536870912
required_inode_headroom = artifact_tree_entry_count + 4096
```

`allocated_tree_upper_bound` is a reviewed deterministic calculation over the
validated archive member sizes/types and the destination filesystem's fresh
block size. At minimum it rounds regular-file data to allocation blocks,
charges every entry one additional block, and includes a fixed metadata safety
reserve. Calculate it independently for XFS quota admission and for the target
ext4 filesystem before and during the trusted copy; the block sizes need not
match. Passing XFS quota admission does not prove that the candidate filesystem
can safely receive the copy.

Upper-bound planning must accommodate 2147483648 logical tree bytes and 250000
entries. Therefore 2684354560 bytes is only the logical-data-plus-extraction
floor and is explicitly insufficient as an approval value until per-entry
allocation rounding and the fixed metadata safety reserve are added. The inode
floor is 254096. XFS metadata, log space, future cleanup workspace, and operator
reserve remain additional to the calculated project headroom.

The project hard limit must be lower than physical filesystem capacity by an
explicit emergency reserve. A quota limit equal to device capacity is not an
independent boundary. The proposal must also bind a low-water stop threshold;
crossing it disables new materialization but does not alter the active service.

No production EDQUOT exhaustion probe is allowed. Production validation uses
readback plus a bounded, non-exhausting write/delete probe inside the empty A3
project tree. Real EDQUOT behavior remains proven on the disposable physical
test environment.

## 8. Required read-only inventory

A new exact Risk A inventory Gate is required because the previous Gate was
consumed and did not inventory candidate block devices. It must be read-only
and target only `vultr-japan-control`.

### Provider inventory

- exact instance identity and region;
- attached block-volume count, logical IDs, attachment state, size, and delete
  policy;
- whether a new volume can be attached without restart;
- no create, attach, resize, snapshot, detach, or delete action.

### Host inventory

- `lsblk` topology with byte sizes, filesystem types, read-only/removable
  booleans, mountpoints, and stable-ID availability;
- `findmnt` topology, `/etc/fstab` identity hash, and existing mount-unit
  identities;
- `pvs`, `vgs`, and `lvs` aggregate capacity if LVM is present;
- XFS kernel/tool availability and versions;
- exact current deployment-root device and mount ID;
- absence of the proposed mountpoint and project tree, plus absence of a chosen
  project-ID collision on the new filesystem; existing `/etc/projects` and
  `/etc/projid` identities are read back but not modified by this design;
- filesystem byte/inode capacity;
- unchanged current pointer, active service identity/restart count, candidate
  absence, protected-file metadata, and aggregate SQLite `quick_check`;
- no raw environment, config, database row, credential, IP, device serial, or
  customer data in the durable receipt.

Any ambiguity about an existing block device is terminal. An apparently empty
device is not disposable merely because it has no mountpoint.

## 9. Execution gates and ordering

Each arrow below is a new gate. Approval from one step cannot be reused for
another.

```text
S0 design review/merge (this document)
  -> S1 default-off source separation PR + tests + independent review
  -> S2 clean non-production physical proof of the revised exact head
  -> A3-X1 production read-only block/storage inventory
  -> A3-X2 provider volume create/attach, if required
  -> A3-X3 host XFS format/mount/project-quota initialization
  -> A3-X4 source deployment with A3 still disabled
  -> A3-X5 production read-only quota/smoke dry-run
  -> A3-M1 exactly one dependency materialization attempt
  -> A3-P1 promotion decision and separately approved pointer/service action
  -> observation, readback, retention, and closeout
```

The host-mutation proposal must bind:

- exact merged source and artifact identities;
- exact target;
- exact stable block-device identity and expected size;
- exact filesystem UUID expected after formatting;
- exact mountpoint, options, project path, project ID, byte hard limit, inode
  hard limit, and low-water threshold;
- exact command whitelist;
- pre/post service and pointer identities;
- rollback plan and terminal conditions;
- credential handoff and cleanup under `docs/INFRASTRUCTURE_ACCESS_RULE.md`.

Formatting is allowed only after two independent observations prove that the
exact selected device is newly attached, has no filesystem signature, no
partition table, no holder, no mount, no swap use, and is not referenced by
fstab, systemd, LVM, mdraid, cryptsetup, or the running root filesystem.

## 10. Host initialization runbook boundary

This section defines ordering, not executable approval.

1. Re-read target, service, current pointer, DB check, device topology, and
   proposed path absence.
2. If a provider volume is needed, create and attach it under its own Gate;
   then stop and re-inventory before formatting.
3. Resolve the exact stable device path and prove all destructive-action
   preconditions from section 9.
4. Create XFS only on that exact device. Immediately record the filesystem UUID
   hash, size, and `xfs_info` aggregate features.
5. Mount first at a new temporary root-owned validation path with project quota
   enabled. Verify source device, filesystem, options, ownership, and absence
   of pre-existing content.
6. While the device is mounted at that temporary path, create the `project/`
   tree on XFS with the exact owner/mode and capture its filesystem UUID plus
   `st_dev:st_ino` identity.
7. On ext4 create only the empty final mountpoint, record its underlying
   `st_dev:st_ino`, and prove it has no child entry. Do not create `project/`
   below the unmounted final path.
8. Back up the exact pre-change fstab/mount-unit identity. Add only the reviewed
   mount entry, reload systemd, unmount the temporary path, and mount the same
   XFS device through the persistent unit at the final mountpoint.
9. Prove the same filesystem UUID is mounted and the captured XFS `project/`
   inode is visible at the final path. Before first use, unmount once, prove the
   underlying ext4 mountpoint retains its captured inode and remains empty,
   remount, and repeat the device/tree identity readback. This prevents hidden
   underlying entries.
10. Use explicit numeric
    `xfs_quota -x -c "project -s -p <project-path> <project-id>" <mount>` to set
    the project ID and `PROJINHERIT`. The preferred path does not add or change
    `/etc/projects` or `/etc/projid`; a future named-project consumer would need
    a separate reviewed justification and Gate.
11. Require the corresponding explicit numeric `project -c`, `xfs_io lsproj`,
    accounting/enforcement state, and exact byte/inode hard-limit reports to
    agree.
12. Perform only the approved non-exhausting write/fsync/read/delete probe, then
    require the project tree empty and quota usage returned to its accepted
    metadata-only baseline.
13. Reboot testing, if required, is a separate explicit operation. Without it,
    persistent-mount survival remains unverified and must be stated as such.
14. Re-read the active service, current pointer, restart count, database check,
    protected-file metadata, and A3-disabled state. They must be unchanged.

No existing deployment-root file is copied, moved, hidden by a mount, assigned
a project ID, or quota-limited in this initialization.

## 11. Rollback

Rollback is phase-specific.

### Before first materialization

- disable the new A3 source route if it was deployed;
- require the project tree empty;
- unmount only the exact A3 mount;
- restore the exact backed-up fstab/mount-unit; this preferred path created no
  `/etc/projects` or `/etc/projid` mapping to roll back;
- detach/delete the volume only under a separate provider Gate and only after
  mount, holder, and filesystem-custody readback;
- verify the previously active release and service were never changed.

### Materialization failed before promotion

- keep `current` unchanged;
- remove only the attempt-bound XFS staging and candidate-local import
  directory whose inode identities were recorded;
- retain or quarantine evidence when cleanup identity is uncertain;
- re-read project usage, candidate `node_modules` absence, receipt absence,
  service health, restart count, and database check;
- do not retry under the consumed approval.

### Failure after publication but before pointer change

- keep the active release unchanged;
- remove the exact unpublished candidate only under its own reviewed cleanup
  boundary, or quarantine it for evidence;
- preserve the materialization receipt and aggregate diagnostics as required by
  retention policy.

### Failure after promotion

- use the normal control-plane deployment rollback: restore the exact previous
  release pointer, restart only the approved unit, and verify PID/CWD/health and
  aggregate database identity;
- the A3 workspace remains independent and must not be detached until the
  materialization and rollback receipts are reconciled.

Unknown device identity, non-empty project tree, mount/holder presence,
database check failure, pointer drift, restart-count drift, or cleanup
uncertainty stops rollback automation and requires operator attention.

## 12. Acceptance criteria

The storage-remediation stage is complete only when all of the following are
true:

- the design and source-separation PRs are merged and independently reviewed;
- the revised exact head passed a clean physical XFS proof;
- a fresh production inventory identified an unambiguous safe backing device;
- the dedicated mount survives the approved persistence validation;
- XFS, project ID, inheritance, project tree, accounting, enforcement, hard
  limits, and minimum headroom all pass fresh readback;
- the project tree is empty before materialization;
- current release, service, restart count, database check, and protected files
  remain unchanged;
- no production EDQUOT exhaustion probe occurred;
- credentials and temporary access were cleaned and read back according to the
  exact Gate;
- the receipt contains only redacted aggregate-safe evidence.

Even then, the result is only `storage_ready`. It is not dependency
materialization, promotion, production A3 activation, or A3 closeout.

## 13. Mandatory stop conditions

Stop without mutation or retry when any of these is observed:

- exact source/artifact/target/device identity mismatch;
- current pointer, service identity, restart count, or DB check drift;
- candidate or workspace path unexpectedly present;
- selected device has any signature, partition, holder, mount, swap, LVM,
  mdraid, crypt, or persistent-config reference;
- filesystem is not XFS or project quota/accounting/enforcement is incomplete;
- project ID collides or `project -c` fails;
- hard limits or headroom do not meet the immutable artifact budget;
- protected configuration review remains unresolved for the candidate input;
- source still binds quota to the complete deployment root;
- cleanup/readback cannot prove the exact attempted scope returned to the
  expected state.
