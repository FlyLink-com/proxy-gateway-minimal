# Lead Retention Operations Design

Last updated: 2026-07-16, America/Los_Angeles.

> Status:
> - Design state: Proposed for Operator review
> - Risk: A because the source defines future production SQLite deletion,
>   backup retention, restore, and systemd behavior
> - Process: one source-only PR with design, implementation, tests, and
>   operations documentation; production remains a later exact Risk A Gate
> - Expected PR count: 1
> - Source baseline: `daffc30356b8bf256f7ad44a314e22e10dbab445`
> - Validation: focused synthetic tests, full `npm test`, project-state and
>   document-authority checks, and exact diff checks
> - Production/AWS impact: None
> - Execution authority: repository source changes and local synthetic SQLite
>   validation only; no SSH write, artifact upload, production schema or data
>   mutation, systemd installation, service restart, deployment, or promotion

## Decision

Deliver one narrow source-only operations capability that closes the retention
prerequisite created by the durable `platform_leads` queue:

1. purge expired Lead rows from the subscription control database;
2. create complete SQLite backups whose lifetime cannot exceed the lifetime of
   the earliest Lead row contained in the backup;
3. prune only due backup-and-manifest pairs inside one dedicated directory;
4. provide a hardened recurring systemd service and timer template; and
5. require an explicit post-restore purge before service traffic resumes.

The source PR does not install or execute any of those production mutations.
After it is independently reviewed and merged, production work remains split
into two fresh exact Risk A approvals: an additive-only Japan identity repair
Gate and a cumulative deployment Gate that includes retention activation.

## Problem and invariants

`platform_leads` stores private organization, email, direction, stage, message,
source, and timestamp data. The approved application retention boundary is
exactly 90 days from normalized `updatedAt`, represented by `expires_at`.
Expired rows are already excluded at the next queue interaction, and the store
exposes `purgeExpiredLeads({ now })`, but source currently has no production
purge cadence, Lead-aware control-database backup policy, safe backup pruner, or
post-restore purge procedure.

This design preserves these invariants:

- a Lead is never returned when `expires_at <= now`;
- a maintenance purge deletes only rows whose `expires_at <= now`;
- a published backup is a complete, internally consistent SQLite snapshot;
- a backup containing a Lead is scheduled for deletion before that Lead's
  retention deadline;
- a restored database is purged before the application service starts;
- source rollback never drops or truncates `platform_leads`;
- command output and retained manifests contain no Lead fields, database rows,
  credentials, raw configuration, customer identifiers, or absolute paths;
- dry-run is the default for every destructive command; and
- invalid, ambiguous, or tampered backup state fails closed without broad
  deletion.

## Component boundary

Create one focused Node entry point:

```text
scripts/platform-lead-retention.mjs purge [--apply]
scripts/platform-lead-retention.mjs backup --backup-dir <directory> [--apply]
scripts/platform-lead-retention.mjs prune --backup-dir <directory> [--apply]
```

`purge` and `backup` obtain the exact control-database path from the required
`SUBSCRIPTION_CONTROL_DB_PATH` environment variable. The path is never printed
or copied into a manifest. `prune` does not open the live database and is
confined to the explicitly supplied dedicated backup directory.

The entry point may expose pure functions for synthetic tests, but no new
generic backup framework, server route, Admin UI, queue, daemon, external
service, Redis dependency, or production-access adapter is introduced.
`better-sqlite3`, already owned by the repository, is the only SQLite runtime
dependency.

## Closed command result

Every invocation writes one single-line JSON result to stdout. The root fields
are closed and contain only safe aggregate evidence:

```json
{
  "schemaVersion": "1",
  "command": "purge|backup|prune",
  "mode": "dry-run|apply",
  "status": "planned|completed|blocked|reconciliation_required|internal_error",
  "mutationState": "none|completed|unknown",
  "counts": {},
  "reasonCodes": []
}
```

`counts` is command-specific and contains non-negative integers only. Permitted
examples are `eligibleLeadCount`, `deletedLeadCount`, `candidatePairCount`,
`deletedPairCount`, and `blockedEntryCount`. `reasonCodes` is a closed, sorted,
unique list. It never contains an exception message, path, filename, database
value, or user input.

Stdout contains no progress text. Diagnostic stderr uses only closed reason
codes. Exit codes are `0` for `planned` or `completed`, `20` for `blocked`, `30`
for `reconciliation_required`, `64` for a command-contract error, and `70` for
an internal error. A failure after the first filesystem deletion is always
`reconciliation_required` with `mutationState: unknown`; it is never reported
as safely retryable.

## Purge contract

The purge command opens only the exact control database and computes the count
of rows satisfying `expires_at <= now`. Time is read once at command start and
normalized to canonical UTC. Synthetic tests inject the clock; production does
not accept a caller-supplied timestamp.

Dry-run reports the eligible aggregate count and performs no deletion. Apply
calls the existing store operation `purgeExpiredLeads({ now })` inside the
adapter's transaction boundary and reports only the deleted count. It does not
delete non-Lead rows, rewrite surviving Leads, vacuum the database, alter
schema, or initialize missing production schema as a side effect.

Missing `platform_leads` is a successful no-op only when the control database
itself is valid and readable. A missing database, invalid database, unexpected
schema, busy/locked state, or integrity failure blocks without mutation.

## Backup contract

### Snapshot and publication

Backup apply creates a new online SQLite snapshot through the existing Node
SQLite dependency. It never shell-interpolates a database path and never
copies an open database with a raw filesystem copy.

The command writes unique temporary siblings inside the dedicated backup
directory, then performs all checks against the snapshot itself:

1. SQLite `quick_check` returns exactly `ok`;
2. the Lead table shape is either absent or exactly compatible with the merged
   durability schema;
3. every Lead expiry is canonical and later than snapshot creation time;
4. the file is regular, is not a symlink, and remains inside the canonical
   backup root;
5. final file size and SHA-256 are calculated only after the SQLite handle is
   closed; and
6. both backup and manifest receive mode `0600`.

If the snapshot contains an already-expired Lead, publication is blocked and
the unpublished temporary snapshot is removed. The operator must first run the
approved live purge and then create a fresh backup. The backup command does not
silently edit Lead rows inside a snapshot.

The verified SQLite file is published first and its manifest is published last
as the pair's commit marker. A crash before manifest publication can leave an
orphan artifact; automatic pruning must not delete that orphan. It is reported
as a blocked entry for explicit reconciliation. Existing files are never
overwritten.

Dry-run validates the live source and destination boundary and reports only
whether one backup would be eligible. It creates no temporary or final file.

### Retention calculation

For a snapshot created at `createdAt`, define:

```text
privacyCutoff = min(createdAt + 90 days, earliest platform_leads.expires_at)
pruneAt       = privacyCutoff - 2 hours
```

When the Lead table is absent or contains no rows, `privacyCutoff` is
`createdAt + 90 days`. If `pruneAt <= createdAt`, publication is blocked. This
means a complete backup cannot be created while its earliest contained Lead is
within the two-hour safety window. The operator may wait for and purge that row
or use an earlier still-valid backup; the tool never extends the deadline.

The two-hour margin is deliberately greater than the recurring timer's normal
maximum scheduling interval of 65 minutes. Under a healthy timer, a due backup
is therefore deleted at least 55 minutes before the earliest privacy cutoff.
A missed timer, disabled unit, read-only filesystem, or host outage is a
retention incident: later deployment and restore Gates must block until prune
readback is healthy. `Persistent=true` provides catch-up after downtime but is
not represented as proof that a deadline was met.

Deleting the complete immutable artifact at `pruneAt` is a privacy-first
tradeoff: backup lifetime can be much shorter than 90 days when it contains an
older Lead. It preserves complete disaster-recovery state until the safe
deadline without mutating, re-signing, or partially rewriting a published
backup.

### Retention manifest

Each backup has one adjacent mode-`0600` JSON manifest. Its closed schema is:

```json
{
  "schemaVersion": "1",
  "artifactKind": "subscription-control-sqlite",
  "file": "safe-basename.sqlite",
  "createdAt": "canonical-utc",
  "privacyCutoff": "canonical-utc",
  "pruneAt": "canonical-utc",
  "retentionBasis": "created_at_plus_90d|earliest_lead_expiry",
  "size": 0,
  "sha256": "lowercase-hex",
  "quickCheck": "ok",
  "leadTablePresent": true,
  "leadRowCount": 0,
  "manifestDigest": "lowercase-hex"
}
```

The digest is SHA-256 over canonical JSON after deleting only
`manifestDigest`, with the domain prefix
`PLATFORM_LEAD_BACKUP_MANIFEST:v1\0`. The manifest contains a safe basename,
not an absolute or relative directory. It contains no earliest-Lead value,
row, identifier, private field, source commit guess, service secret, or raw
configuration.

The digest detects accidental drift and provides deterministic evidence; it is
not a signature and does not convert a writable directory into a trust root.
Ownership and directory permissions remain production Gate requirements.

## Prune contract

Prune recognizes only a manifest whose name and declared SQLite basename form
one exact pair under the canonical dedicated backup root. Before planning or
deleting, it verifies:

- the manifest has exactly the v1 fields and a valid projection digest;
- the declared basename is canonical and contains no separator or traversal;
- both entries are regular files, not symlinks or reparse points;
- their canonical parents equal the approved backup root;
- stored size and SHA-256 match the closed SQLite file; and
- `createdAt < pruneAt < privacyCutoff` and the retention basis is internally
  consistent.

Dry-run reports aggregate due, future, and blocked counts. Apply deletes only a
verified pair whose `pruneAt <= now`, in the order SQLite file first and
manifest commit marker last. Future pairs are untouched. Unknown files,
orphans, malformed names, unsupported manifests, mismatched digests or sizes,
symlinks, nested directories, and containment failures are never deleted and
produce a blocked result.

The command does not use a broad `find -delete`, wildcard deletion, age based
on filesystem metadata, or a recursive directory removal. A partial pair
deletion is `reconciliation_required` and requires an explicit inventory; it
does not trigger an automatic retry.

## Systemd operations source

Add these repository templates:

```text
ops/systemd/gccgw-platform-lead-retention.service
ops/systemd/gccgw-platform-lead-retention.timer
```

The oneshot service runs as `proxy-gateway`, uses the candidate application's
protected environment file, and has exactly two sequential apply commands:

1. purge the live control database;
2. prune the dedicated Lead-aware control-backup directory.

It uses the current release symlink as `WorkingDirectory`, does not start or
restart the application service, and applies systemd hardening including
`NoNewPrivileges`, `PrivateTmp`, `ProtectSystem`, `ProtectHome`, and the
narrowest `ReadWritePaths` for the shared runtime state and dedicated backup
directory.

The timer uses `OnCalendar=hourly`, `Persistent=true`,
`RandomizedDelaySec=5m`, and an explicit accuracy bound. Under normal healthy
operation, expired Lead rows remain invisible at their exact `expires_at`
boundary through the application queue and are physically purged within at
most 65 minutes. The backup two-hour safety window is separate and ensures the
recurring pruner normally acts before the privacy cutoff.

The source templates are inert. A later exact deployment Gate must bind the
absolute release and environment paths, create the dedicated backup directory
owned by `proxy-gateway` with mode `0700`, install the units, run daemon reload,
execute dry-run and one manual apply validation, enable the timer, and read
back unit identity, next-run state, last result, database integrity, and safe
aggregate counts.

## Restore boundary

Restoration remains an explicit manual Risk A operation and is not added to the
recurring service. The approved sequence is:

1. bind the exact target host, service, database, backup pair, and rollback
   artifact;
2. verify manifest digest, containment, mode, size, SHA-256, and SQLite
   `quick_check`;
3. stop the application service and prove it is stopped;
4. preserve the current database under its independently approved retention
   policy;
5. install the verified database with exact owner and mode;
6. run Lead purge with `--apply` against the restored database;
7. verify zero expired Leads and SQLite `quick_check`;
8. start the service; and
9. validate loopback health and protected behavior without exposing private
   rows.

If post-restore purge or verification fails, traffic remains stopped and the
operator follows the bound rollback decision. No restore command may start the
service before the purge succeeds. The existing subscription restore helper is
not generalized or silently repointed to the control database in this PR.

## Failure and rollback behavior

- Schema drift, a busy database, invalid time, integrity failure, path escape,
  unsafe file type, or manifest drift blocks before mutation.
- The tool never creates missing production schema as part of maintenance.
- Temporary unpublished files may be cleaned only by the backup invocation
  that created them and only before publication.
- Published or orphan files require the closed prune/reconciliation rules.
- Source rollback removes the CLI and inert unit templates; it does not drop
  tables, erase rows, delete backups, disable a live timer, or restore data.
- Any production disablement, backup deletion outside normal policy, schema
  change, data restoration, or artifact rollback requires its own exact Risk A
  authority.

## Test strategy

Implementation follows TDD with synthetic temporary databases and directories.
Required focused coverage includes:

- purge dry-run performs no deletion;
- purge apply deletes at the exact `expires_at <= now` boundary and preserves
  all unexpired and non-Lead rows;
- a missing Lead table is a no-op but an invalid database blocks;
- backup with no Leads uses `createdAt + 90 days` as privacy cutoff;
- backup with Leads uses the earliest contained expiry;
- backup refuses expired Leads and a Lead inside the two-hour safety window;
- the snapshot passes `quick_check` and produces exact size, SHA-256, mode
  `0600`, canonical manifest, and projection digest;
- dry-run creates no filesystem entry and existing files are never replaced;
- prune dry-run deletes nothing;
- prune apply deletes only the exact due pair and preserves future pairs;
- traversal, separator-bearing names, symlinks, nested paths, orphan entries,
  unsupported schema, invalid timestamps, altered digest, altered size, and
  partial deletion all fail closed;
- command results and errors do not contain paths, filenames, Lead fields,
  synthetic emails/messages, database rows, secrets, or raw exception text;
- systemd templates bind the exact two commands, `--apply`, service user,
  hardening, hourly cadence, persistent catch-up, and narrow writable paths;
  and
- the restore runbook keeps service start after successful purge and
  verification.

The exact branch head must pass:

```text
node --test server/tests/platform-lead-retention-operations.test.mjs
npm test
npm run project-state:check
npm run docs:authority:check
git diff --check origin/master...HEAD
git diff --check
```

## Alternatives considered

### Fixed 90 days from backup creation

Rejected. A backup created today may contain a Lead already close to its own
90-day deadline, so retaining that backup for another 90 days would extend the
private row beyond the approved boundary.

### Rewrite published backups as individual Leads expire

Rejected. Mutating an immutable rollback artifact invalidates its hash,
complicates crash recovery, and creates partially rewritten backup states.

### Exclude all Lead rows from every control-database backup

Rejected for the primary rollback artifact because it discards durable Lead
queue disaster recovery and no longer represents a complete control database.

### Separate Lead database, Redis, queue, or cryptographic key shredding

Rejected as unnecessary architectural complexity for the current single-node
SQLite system. The complete-backup plus earliest-expiry deadline uses existing
dependencies and a smaller verifiable boundary.

## Non-goals

- No production execution, deployment, upload, service mutation, or schema
  initialization.
- No Japan identity-map repair, stale-map deletion, provider mutation, runtime
  principal change, attribution change, or traffic cutover.
- No Admin UI, public API, Lead semantics, schema, or retention-duration
  change.
- No generic backup-system refactor or change to subscription backup behavior.
- No automatic restore, automatic DROP, destructive schema rollback, vacuum,
  row archive, tombstone, analytics copy, or retention bypass.
- No secrets, tokens, subscription URLs, credentials, customer data, absolute
  production paths, or raw database material in repository evidence.

## Source exit criteria

The source-only retention prerequisite is complete only when:

```yaml
design_reviewed: true
implementation_tests_passed: true
full_test_suite_passed: true
document_checks_passed: true
independent_review_complete: true
source_pr_merged: true
production_writes_performed: false
production_timer_installed: false
production_schema_initialized: false
```

Meeting these source criteria does not make production ready by itself. The
next step is to regenerate exact-head artifact evidence and submit two separate
Risk A Gates. Neither Gate inherits approval from this design or source PR.
