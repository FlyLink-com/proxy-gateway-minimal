# Lead Retention Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:executing-plans` and `superpowers:test-driven-development` to
> execute this plan task-by-task. Do not delegate this Risk A source work.

**Goal:** Close the source-only Lead retention operations prerequisite with a
fail-closed purge, complete Lead-aware SQLite backup, bounded manifest-driven
pruner, inert systemd templates, tests, and restore documentation.

**Architecture:** Add one Node CLI backed by small exported pure helpers. Reuse
`better-sqlite3` for read-only inspection, online backup, integrity checks, and
the existing `purgeExpiredLeads` store operation. Published backups are complete
immutable snapshots plus closed sidecar manifests; pruning is restricted to
verified due pairs under one canonical directory. Production activation remains
a separate exact Risk A Gate.

**Tech stack:** Node.js ES modules, `better-sqlite3`, built-in `node:test`,
systemd unit templates, Markdown operations documentation.

## Global constraints

- Risk A source-only; no SSH, production database, systemd, provider, artifact,
  service, deployment, or promotion mutation.
- One PR contains intent, implementation, tests, and operations documentation.
- Dry-run is default; `--apply` is mandatory for deletion or backup creation.
- The CLI never creates missing production schema during maintenance.
- Output contains only closed aggregate JSON and closed reason codes.
- No Lead row, private field, absolute path, filename, raw error, credential,
  configuration, subscription URL, or customer data is printed.
- Backup expiry is bound to the earliest Lead expiry and includes a two-hour
  pruning safety window.
- Pruning never recursively deletes or acts on unknown, orphaned, nested,
  symlinked, malformed, or integrity-drifted entries.
- Restore keeps service start after successful Lead purge and integrity
  verification.
- No external dependency, generic backup framework, Admin UI, schema change,
  retention-duration change, or automatic production activation.

---

### Task 1: Freeze the CLI contract and non-initializing store boundary

**Files:**
- Create: `server/services/platform/lead-retention-operations.mjs`
- Create: `server/tests/platform-lead-retention-operations.test.mjs`
- Modify: `server/services/platform/subscription-control-db.mjs:678-710,1209-1212`
- Modify: `server/tests/platform-subscription-control-db.test.mjs:1260-1320`

**Interfaces:**
- `createSqliteSubscriptionControlStore({ database, initializeSchema: false })`
  opens an already verified schema without executing DDL.
- Pure exports normalize time, calculate retention, canonicalize manifests, and
  construct closed command results.
- No filesystem mutation is introduced in this task.

- [x] **Step 1: Write failing tests for the non-initializing store mode**

Create a temporary legacy SQLite database without `platform_leads`, open it
through the store with `initializeSchema: false`, close it, and prove no Lead
table or index was created. Add a second fixture with the exact Lead schema and
prove the existing purge method still deletes only `expires_at <= now`.

- [x] **Step 2: Run the focused store tests and verify RED**

```powershell
node --test --test-name-pattern="non-initializing|purge method" server/tests/platform-subscription-control-db.test.mjs
```

Expected: FAIL because `initializeSchema` is not supported.

- [x] **Step 3: Implement the minimal factory option**

Default `initializeSchema` to `true` so every current caller is unchanged.
When false, skip schema DDL and WAL-mode mutation while preserving safe busy
timeout and foreign-key settings. Do not weaken normal initialization.

- [x] **Step 4: Write failing pure-contract tests**

Cover canonical UTC, invalid time, exact 90-day calculation, earliest Lead
cutoff, two-hour safety window, manifest canonicalization and digest vectors,
closed result fields, sorted reason codes, and private-output rejection.

- [x] **Step 5: Run the new operations test and verify RED**

```powershell
node --test server/tests/platform-lead-retention-operations.test.mjs
```

Expected: FAIL because the operations module does not exist.

- [x] **Step 6: Implement the smallest pure core and verify GREEN**

Create constants and pure helpers only. The manifest domain is
`PLATFORM_LEAD_BACKUP_MANIFEST:v1\0`; `manifestDigest` is excluded from its own
preimage. Reject extra keys, noncanonical basenames, invalid timestamps, unsafe
counts, and private output.

```powershell
node --test server/tests/platform-lead-retention-operations.test.mjs server/tests/platform-subscription-control-db.test.mjs
```

- [x] **Step 7: Commit the contract slice**

```powershell
git add server/services/platform/lead-retention-operations.mjs server/services/platform/subscription-control-db.mjs server/tests/platform-lead-retention-operations.test.mjs server/tests/platform-subscription-control-db.test.mjs
git commit -m "feat(platform): define Lead retention operations contract"
```

### Task 2: Implement fail-closed purge with dry-run default

**Files:**
- Modify: `server/services/platform/lead-retention-operations.mjs`
- Modify: `server/tests/platform-lead-retention-operations.test.mjs`

**Interfaces:**
- `runLeadPurge({ dbPath, apply, nowFn })`
- Reads the exact path supplied by the required environment at the CLI boundary.
- Produces only aggregate `eligibleLeadCount` and `deletedLeadCount`.

- [x] **Step 1: Write failing purge integration tests**

Use synthetic databases for: dry-run no deletion; exact-boundary apply;
unexpired/non-Lead preservation; missing Lead table no-op; missing database;
invalid database; incompatible Lead schema; and locked/busy failure. Assert the
serialized result never contains the fixture path, basename, organization,
email, message, or raw exception.

- [x] **Step 2: Run the purge tests and verify RED**

```powershell
node --test --test-name-pattern="purge" server/tests/platform-lead-retention-operations.test.mjs
```

Expected: FAIL because the purge operation is absent.

- [x] **Step 3: Implement read-only inspection and apply**

Dry-run opens with `readonly: true` and `fileMustExist: true`, verifies
`quick_check`, exact compatible Lead columns, and eligible count. Apply opens an
existing database without schema initialization and delegates physical deletion
to `purgeExpiredLeads({ now })`. Missing `platform_leads` is a valid zero result;
all other schema/integrity/path failures are closed blockers.

- [x] **Step 4: Run focused tests and verify GREEN**

```powershell
node --test --test-name-pattern="purge" server/tests/platform-lead-retention-operations.test.mjs
```

- [x] **Step 5: Commit the purge slice**

```powershell
git add server/services/platform/lead-retention-operations.mjs server/tests/platform-lead-retention-operations.test.mjs
git commit -m "feat(platform): add fail-closed Lead purge"
```

### Task 3: Implement complete backup publication and bounded pruning

**Files:**
- Modify: `server/services/platform/lead-retention-operations.mjs`
- Modify: `server/tests/platform-lead-retention-operations.test.mjs`

**Interfaces:**
- `runLeadBackup({ dbPath, backupDir, apply, nowFn, randomBytesFn })`
- `runLeadPrune({ backupDir, apply, nowFn })`
- Backup publication uses unique temporary siblings, SQLite online backup,
  snapshot inspection, atomic no-overwrite finalization, and a manifest commit
  marker.

- [x] **Step 1: Write failing backup tests**

Cover dry-run no filesystem entry, no-Lead 90-day cutoff, earliest Lead cutoff,
expired Lead refusal, two-hour-window refusal, complete snapshot content,
`quick_check`, exact size/hash, canonical manifest/digest, mode `0600` on POSIX,
existing-file collision, no-overwrite behavior, and cleanup before publication.

- [x] **Step 2: Run backup tests and verify RED**

```powershell
node --test --test-name-pattern="backup" server/tests/platform-lead-retention-operations.test.mjs
```

Expected: FAIL because backup execution is absent.

- [x] **Step 3: Implement backup with publication boundary**

Open the source database read-only with `fileMustExist`. Create the temporary
snapshot only under the canonical backup root through `Database#backup()`. Open
and inspect that closed snapshot, calculate `privacyCutoff` and `pruneAt`, then
publish the mode-`0600` SQLite file first and mode-`0600` manifest last without
overwriting existing paths. Never print either basename.

- [x] **Step 4: Write failing prune tests**

Cover due/future aggregates, dry-run no deletion, exact due-pair apply,
SQLite-first/manifest-last partial failure, traversal, separators, symlinks,
nested directories, orphan files, unsupported schema, altered digest/size/hash,
invalid timestamp order, and unknown file preservation.

- [x] **Step 5: Run prune tests and verify RED**

```powershell
node --test --test-name-pattern="prune" server/tests/platform-lead-retention-operations.test.mjs
```

Expected: FAIL because prune execution is absent.

- [x] **Step 6: Implement exact-pair pruning and verify GREEN**

Enumerate only direct directory entries. A manifest is a commit marker; validate
its closed schema, projection digest, canonical basename, containment, regular
file types, size, hash, and timestamp order before considering deletion. Any
blocked entry prevents apply from deleting other entries. Delete a verified due
SQLite file first and its manifest last; normalize partial failure to
`reconciliation_required`.

```powershell
node --test server/tests/platform-lead-retention-operations.test.mjs
```

- [x] **Step 7: Commit backup and prune**

```powershell
git add server/services/platform/lead-retention-operations.mjs server/tests/platform-lead-retention-operations.test.mjs
git commit -m "feat(platform): retain Lead-aware control backups"
```

### Task 4: Add the CLI entry point and inert systemd templates

**Files:**
- Create: `scripts/platform-lead-retention.mjs`
- Create: `ops/systemd/gccgw-platform-lead-retention.service`
- Create: `ops/systemd/gccgw-platform-lead-retention.timer`
- Modify: `package.json`
- Modify: `server/tests/platform-lead-retention-operations.test.mjs`
- Modify: `server/tests/environment-foundation.test.mjs`

**Interfaces:**
- CLI grammar is exactly `purge`, `backup --backup-dir`, and
  `prune --backup-dir`, with optional `--apply` and no extra arguments.
- systemd oneshot executes purge then prune; timer is hourly, persistent, and
  has a five-minute randomized delay.

- [x] **Step 1: Write failing CLI process tests**

Spawn Node against synthetic paths and assert dry-run default, `--apply`
requirement, missing environment/path errors, duplicate/unknown argument
rejection, one-line closed JSON, exit-code mapping, empty progress output, and
private/path redaction.

- [x] **Step 2: Write failing source-template tests**

Require both tracked units, exact candidate `WorkingDirectory` and environment
file, `proxy-gateway` identity, two sequential `--apply` commands, dedicated
backup directory, hardening, narrow writable paths, `OnCalendar=hourly`,
`Persistent=true`, `RandomizedDelaySec=5m`, and no application restart/start.

- [x] **Step 3: Run focused tests and verify RED**

```powershell
node --test server/tests/platform-lead-retention-operations.test.mjs server/tests/environment-foundation.test.mjs
```

- [x] **Step 4: Implement the CLI and units**

The entry point owns argument parsing and result serialization only; execution
stays in the tested operations module. Add an npm convenience script without
changing normal server startup. The systemd service is inert repository source
and does not include `[Install]` activation for the service itself; the timer is
the only enablement unit.

- [x] **Step 5: Run focused tests and verify GREEN**

```powershell
node --test server/tests/platform-lead-retention-operations.test.mjs server/tests/environment-foundation.test.mjs
```

- [x] **Step 6: Commit CLI and source templates**

```powershell
git add scripts/platform-lead-retention.mjs ops/systemd/gccgw-platform-lead-retention.service ops/systemd/gccgw-platform-lead-retention.timer package.json server/tests/platform-lead-retention-operations.test.mjs server/tests/environment-foundation.test.mjs
git commit -m "ops(platform): schedule Lead retention maintenance"
```

### Task 5: Close operations and restore documentation

**Files:**
- Modify: `ops/README.md`
- Modify: `docs/LEAD_DURABILITY_SCHEMA_GATE.md`
- Modify: `docs/superpowers/specs/2026-07-16-lead-retention-operations-design.md`
- Modify: `docs/superpowers/plans/2026-07-16-lead-retention-operations.md`
- Modify: `server/tests/environment-foundation.test.mjs`

**Interfaces:**
- Documentation distinguishes source availability from production activation.
- Restore sequence proves service stopped, manifest/integrity verified, purge
  completed, zero expired rows, then service start.

- [x] **Step 1: Add failing documentation assertions**

Require the dedicated backup root, privacy cutoff, two-hour safety window,
hourly/65-minute cadence, dry-run/apply split, restore-before-start ordering,
retention incident stop condition, source-only status, and two later exact Risk
A Gates.

- [x] **Step 2: Run documentation tests and verify RED**

```powershell
node --test server/tests/environment-foundation.test.mjs
```

- [x] **Step 3: Update operations and schema-gate documentation**

Document only repository-supported commands and inert units. Do not claim the
timer is installed, backups exist, production schema is initialized, or any
production validation has run. Mark implementation-plan checkboxes from actual
evidence only.

- [x] **Step 4: Run documentation validation and verify GREEN**

```powershell
node --test server/tests/environment-foundation.test.mjs
npm run docs:authority:check
npm run project-state:check
```

- [x] **Step 5: Commit the documentation closure**

```powershell
git add ops/README.md docs/LEAD_DURABILITY_SCHEMA_GATE.md docs/superpowers/specs/2026-07-16-lead-retention-operations-design.md docs/superpowers/plans/2026-07-16-lead-retention-operations.md server/tests/environment-foundation.test.mjs
git commit -m "docs(platform): close Lead retention operations source"
```

### Task 6: Verify, review, and publish the source-only PR

**Files:**
- Verify every path changed from `origin/master`.

- [x] **Step 1: Run exact-head focused and complete validation**

```powershell
node --test server/tests/platform-lead-retention-operations.test.mjs
npm test
npm run project-state:check
npm run docs:authority:check
git diff --check origin/master...HEAD
git diff --check
```

- [x] **Step 2: Review exact changed surface and forbidden scope**

```powershell
git diff --stat origin/master...HEAD
git diff --name-status origin/master...HEAD
git log --oneline origin/master..HEAD
git status --short --branch
```

Verify no production record, provider config, runtime credential material,
Nginx, DNS, firewall, identity map, attribution path, Admin UI, or application
service unit changed. Verify the main checkout and `.codex/config.toml` remain
untouched.

- [x] **Step 3: Push and create one Draft PR**

The PR body records Risk A source-only authority, intent, exact files, TDD
evidence, retention arithmetic, failure behavior, non-goals, production impact
`none`, rollback boundary, and the two later exact Gates. Keep Draft until
independent review and exact-head checks are complete.

- [x] **Step 4: Perform independent source review and address findings**

Review the exact PR head for privacy leakage, path containment, schema side
effects, dry-run mutation, partial deletion, timer assumptions, restore order,
and test gaps. Apply minimal fixes through RED/GREEN and rerun complete
validation.

- [x] **Step 5: Ready and merge only when the source closure is complete**

Mark Ready, merge through the repository's allowed method, verify merged commit
and PR state, and clean only the isolated worktree/branch when safe. Do not
perform production writes.

- [x] **Step 6: Regenerate later Gate inputs without executing them**

After merge, bind the new exact master/artifact identity and prepare two
separate approval packets:

1. additive-only Japan identity repair (`missing 3 -> 0`, stale entries retained
   unless separately inventoried and approved);
2. cumulative control-plane deployment including retention timer activation,
   backup/restore proof, validation, rollback, and Deploy Note.

Neither packet is approved or executed by completion of this plan.

Prepared approval evidence:

- additive-only Japan identity repair Gate:
  `https://github.com/gccwebos-com/proxy-gateway-minimal/pull/507#issuecomment-4991026388`;
- cumulative control-plane deployment plus retention activation Gate:
  `https://github.com/gccwebos-com/proxy-gateway-minimal/pull/507#issuecomment-4991031115`.

Both packets retain `production_write_authority=false` until their own exact
operator approvals. They cannot be bundled or treated as deployment evidence.
