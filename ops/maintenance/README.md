# Storage maintenance: read-only planning first

```yaml
document_metadata:
  doc_type: operational
  lifecycle: active
  authority_scope: storage_maintenance_planning
  superseded_by: null
  last_verified_at: 2026-09-24
  production_authority: false
```

## Intent and scope

This source-only change supplies a metadata-only edge configuration backup
retention planner, offline tests, and **inert proposed** journald templates.
It does not delete files, install a timer, rotate logs, open a database, modify
runtime adapters, restart services, or establish production remediation.

Risk: A for the eventual host operation; B for this isolated source core.
Release units, when separately promoted: `japan-runtime-config` and/or
`sgp-runtime-config`. `identity_impact: false`: this planner never reads or
changes runtime principals, material maps, counters, or subscription identity.
No application release switch is needed merely to inspect backup metadata.

The 2026-09-24 07:42 UTC approved metadata inventory observed substantial free
disk/inode space on both nodes, successful ordinary log rotation, and an edge
backup tree that reached its 500,000-entry scan budget. That is a **partial
inventory**, not a deletion manifest, growth-rate measurement, or proof that
every backup is obsolete. Candidate service auto-restart and certificate job
failure are separate diagnostic items, not reasons to delete state or logs.

## First priority: edge runtime configuration backups

The Xray, Hy2 and TUIC adapters create timestamped `.bak` files before actual
configuration replacement. They already have unchanged/healthy no-op paths;
the existence of many files does not prove that every current reconciliation
poll creates a backup. Deployed adapter byte identity must be checked before
attributing current growth to source code. Do not add an inline deletion hook
to runtime reconciliation: a failed apply may still need its backup.

`edge_backup_retention.py` is **plan-only**, even for a complete scan. It has
no `apply`, `unlink`, service-control, network, or automatic scheduling path.

Planner rules:

- Explicit approved root/subdirectory and configuration basename selection;
  no broad scan of `/var`, `/etc`, database backups, or release trees.
- Metadata only, with directory-fd traversal and no symlink following.
- Only the exact adapter filename format can become a candidate. Unknown
  files, unexpected links, unsafe metadata and unselected directories stay
  outside any candidate set. Coverage limitations are explicit.
- Keep the newest N **per directory and config basename**, OR anything newer
  than D days, OR any explicitly reviewed hold. Suggested initial planning
  values are N=20 and D=30, not an installed policy or fixed storage cap.
- An explicit reviewed hold list (or explicit reviewed-empty statement) is
  required. The operator must first check current/failed transactions, last
  known-good rollback, incident evidence and pending reconciliation holds.
  An empty list is not safe merely because a prior deployment succeeded.
- A time/entry cap, read failure, mutation between passes, or unexpected
  boundary means no trustworthy complete cleanup plan. Partial totals must
  not become a release-ready or deletion-ready result.
- Outputs contain aggregate metadata and bounded samples, **not a complete
  executable deletion list**. Samples are not authorization and must never
  be passed to a shell deletion command. Build and verify the exact approved
  manifest separately before any future destructive implementation.

An age cutoff does not prove lack of application references. Even a complete
`candidate-not-approved` result still requires reference/hold review. Archived
protocol configs can contain credentials: do not open, upload, print or copy
their contents into Git, CI artifacts or ordinary logs.

## Proposed journal budgets, not installed

| Template | Persistent budget | Keep-free floor | File size | Max age |
| --- | ---: | ---: | ---: | ---: |
| `control-plane.journald.conf.in` | 2 GiB | 4 GiB | 128 MiB | 30 days |
| `small-edge.journald.conf.in` | 1 GiB | 2 GiB | 64 MiB | 30 days |

These are proposals based on the dated capacity inventory. They do not change
storage mode, forwarding or rate limits. `.conf.in` files are not active
systemd drop-ins, and this repository contains no installer for them.

**Reducing journal limits can remove archived logs. Restoring a configuration
file cannot restore logs already removed.** Review investigation/retention
holds and any approved secure evidence export before installation. Do not
run `journalctl --vacuum-*` as part of inventory or a generic fix command.
Budget/age controls are not a guarantee of keeping all logs for 30 days; size
pressure can discard archives sooner. Active files and other disk consumers
also mean these are not whole-filesystem hard quotas.

Existing logrotate already covers ordinary system/Nginx logs in the dated
inventory. Preserve it rather than installing a competing job. A successful
tmpfiles timer does not establish application backup retention.

Mechanism reference: [systemd journald configuration source documentation](https://github.com/systemd/systemd/blob/main/man/journald.conf.xml).

## Release and database boundaries

This tool does **not** prune application releases. A future release planner
must protect all of:

1. `current`, live process CWD/executable, and every installed service/timer
   reference, including inactive oneshot jobs.
2. Cross-release dependencies, especially helper `node_modules` links and an
   edge-agent `current` pointing into the candidate application's release.
3. Verified rollback releases and unfinished source/artifact transactions.
4. Incident/accounting holds and exact backups/artifacts required by receipts.

Only preserving current plus the two newest directories is insufficient.
Suggested policy is current plus two verified rollback versions **plus the
entire protected reference set**, not an unconditional three-directory cap.
Unknown references block deletion. Never delete or move the workspace/release
root recursively as a cleanup shortcut.

SQLite databases, WAL/SHM, payment/Coins/order records, full-metering
checkpoints, pending transactions, writer locks, material continuation
archives and unresolved historical reconciliation evidence are excluded.
Closed connection retention is a separate existing domain policy, not a
license to delete collector state or billing history.

## Service failures: bounded diagnosis before repair

Read only the named failed unit's state, restart count, role/source references,
public-certificate expiry and a bounded server-side error classification when
that expanded log-read scope is explicitly approved. Never emit raw journal,
command line, renewal credentials, environment or customer data.

- Certificate failure is not proof that the active certificate is expired.
  Classify challenge, network, renewal-config or hook failure before selecting
  a fix. `certbot renew --dry-run` performs ACME work and may run hooks; it is
  **not** a metadata-only diagnostic command. See the
  [Certbot renewal documentation](https://eff-certbot.readthedocs.io/en/stable/using.html#renewing-certificates).
- A candidate service in `auto-restart` is not proof it is unused. Determine
  intended role and consumers first; do not disable, restart or remove it
  automatically, particularly when the edge agent uses its source directory.
- Do not silence failure evidence with `reset-failed`, deleting logs or
  disabling monitoring. Do not change database, credentials, ports or DNS as
  an incidental storage fix.

## Validation and production exit

Offline Source Gate:

```sh
python3 -B -m unittest discover -s ops/maintenance -p 'test_*.py' -v
node --test server/tests/ci-workflow-contract.test.mjs
git diff --check
```

Run descriptor/symlink tests on Linux; skipped Windows tests are not Linux
evidence. CI runs the same Python synthetic suite, with no SSH, secrets or
production target. Tests use disposable fixtures, not copied production
configs or databases.

Production progression remains:

1. Review the exact source, fixed target, read/command allowlist and single-use
   receipt. Reuse unchanged synthetic evidence; do not rescan the entire host.
2. Obtain scoped diagnosis/retention metadata. Stop on failure or unknown
   coverage; do not replay a consumed or expired record.
3. Resolve producer/consumer references and holds. Present exact candidate
   paths, counts/bytes, reasons and metadata bindings, not just examples.
4. Approve precise mutations separately: backup/change/validation/rollback for
   config or services, and a recoverability decision before deleting data.
5. Execute bounded batches only after that gate; read back space, inode,
   protected-file identities, service/collector state, and record results.

No production installer, delete executor, rollback executor, capacity alarm,
recurring cleanup or exact production candidate list is delivered by this
source-only slice. Those remain explicit next-stage work, not completed by
green planner tests. Preserve the already-authorized task scope across turns;
only new destructive or expanded read boundaries require another approval.
