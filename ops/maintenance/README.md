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
retention planner, a full-manifest builder, an exact-approval batch execution
core, offline tests, and **inert proposed** journald templates. The planner and
manifest builder never delete files. The execution core can delete only via a
separately bound host wrapper and explicit approval; its CLI is dry-run only.
Nothing here installs a timer, rotates logs, opens a database, modifies runtime
adapters or restarts services. Source validation is not production remediation.

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

## Full manifests and exact batch execution

`edge_backup_manifest.py` supplements, rather than changes, the original
aggregate/sample planner. It records **every metadata entry** in the explicitly
selected fixed protocol directory. Two independent passes must agree. A
fingerprint is an integrity comparison, never a substitute for the full list.
Unselected directories/root files remain protected outside the stated scope.
Links, nested directories, read errors, drift or resource caps mark coverage
incomplete and block candidates. Unknown regular files are individually kept.

Private manifests include exact path, device/inode/mode/link count/owner/size,
mtime/ctime/block count, retention reason and protected/candidate disposition.
Keep newest 20 per basename/directory **or** 30 days **or** reviewed holds.
These eligibility rules do not grant deletion authority. For small hosts use
streaming metadata acquisition and apply policy locally per protocol; never
materialize the whole historical backup tree in the edge agent's memory.
The conservative in-process memory budget is not a measured RSS guarantee.

Required protection review, independently derived and source-bound:

| Protection class | Required evidence / behavior |
| --- | --- |
| Active configurations | Exact path and resolved identity; no content reads or changes |
| Current or failed apply | Explicit reference/hold or proof of no outstanding reference; unknown blocks |
| Known-good rollback | Exact approved rollback reference; age is irrelevant |
| Incident / reconciliation hold | Preserve explicit holds; history/map retention is a separate work item |
| Recent backups / latest N | Protected entries enumerated in full, not hash examples |
| Outside scope | Release, DB/WAL/SHM, checkpoint/pending and all unselected trees untouched |

The Singapore Hy2 backup cohort binding lives in `protection_observer.py`.
No approved rollback reference is named, so `known_good_rollback` stays
`unresolved`. No incident or reconciliation ledger is named, so
`incident_reconciliation` stays `unwired`. Historical failed applies stay
`unresolved`: an omitted `backupRef`, a last-report, or the absence of an
open backup file is not that source and cannot become an empty hold list.
`cohort_retention()` keeps the whole cohort `retained` and the review
incomplete. `protection_reader.read_cohort()` is the reader for that binding.
A class becomes `empty` or `present` only when its binding names a source and
the fetched record identifies that same source with a non-placeholder body
digest. A missing record stays at the absent status. An omitted `backupRef`,
a last-report, open-file absence, a missing rollback reference, or a missing
incident ledger cannot become an empty hold list. The default binding names
no source, so the reader keeps the cohort `retained`.
`ProtectionObserver.read_protection` calls this reader and still raises
`production_protection_observer_not_wired` while that review is incomplete.
The reader does not open a host and does not approve deletion. A later host
wrapper must not call `derive_review()` with three explicit `empty`
observations to bypass it.

`edge_backup_execute.py` accepts only a complete, digest-verified manifest and
an explicit approved **subset of its candidate paths** (at most 10,000 per
single-use record, one protocol directory). Approval also binds target/hostname,
all three source modules, the independent protection-observer implementation,
time window, receipt and quarantine paths. It has no wildcard, recursive-delete,
age-only apply, auto-renewal or service-control route. An old receipt cannot be
replayed. A changed candidate list needs a new exact approval.

Directory ownership remains root-only by default. A separate exact approval may
include `directoryBindings`, a map for **only ROOT and the one selected protocol
directory**, each containing its manifest-bound `dev`, `ino`, `mode`, `nlink`,
`uid` and `gid`. Both entries are required and must match the complete manifest.
This permits a service-owned directory only with exact `0700` permissions; it is
not a UID-wide exception and never changes directory ownership. Ancestors above
ROOT must remain root-owned, non-group/world-writable and traversed without
following links. The bindings and live directory identities are checked again
around scope scans and before each move/unlink. Receipt and quarantine parents
remain root-private without exceptions. `validate_manifest(...,
directory_bindings=...)` supports this source-only compatibility check; neither
it nor a dry-run grants execution authority.

Before/after each batch it re-reads the whole selected scope and verifies
metadata against the manifest minus the precisely recorded completed subset.
Before each move and deletion it refreshes protection evidence. New holds,
unknown reference coverage, additions/removals/replacements, unexpected directory
identity or expiry stop execution. Own completed removals do not falsely look
like external drift. No automatic retries or cleanup of partial state occur.

Each candidate is atomically moved with `renameat2(RENAME_NOREPLACE)` into a
root-private same-filesystem quarantine, verified there, then unlinked. An
uncertain/mismatched move stays recoverable in quarantine; it is never silently
restored over another file. Each intention/result is fsynced to an exclusive
receipt. An I/O failure can produce a partial/unknown outcome, not success.
Successfully unlinked contents are **not recoverable by reverting code**;
operator approval must explicitly accept disposal or arrange a separate
approved secure retention copy. No config bodies are exported by this tool.
This model does not defend against malicious root or root-held writable handles.

The source core deliberately cannot instantiate a production observer from
JSON or load an arbitrary plugin. The separately reviewed host wrapper must
derive fresh holds from actual reference sources, not echo a manifest boolean.
Until that target-specific protection closure and exact production approval
exist, report **source core validated / production not executed**.

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

The batch execution **core** is included; a production-wired protection observer,
approved exact target manifest and destructive execution receipt are distinct
deliverables. Do not describe an inert wrapper or synthetic success as an
installed cleanup policy. No journal installer, release pruner, service repair,
recurring cleanup or capacity alarm is installed by this PR. Preserve the
already-authorized task scope across turns; only new destructive or expanded
read boundaries require another approval.
