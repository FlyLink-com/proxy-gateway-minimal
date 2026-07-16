# Lead Durability Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist the existing Lead review queue in the subscription control SQLite database with an approved 90-day retention boundary and no parallel operations event model.

**Architecture:** Extend the existing control-store adapter with one additive Lead table and four narrow persistence methods. Keep normalization, safe summaries, and retention calculation in `lead-review-queue.mjs`, preserving its in-memory fallback while `state.mjs` injects the already-owned control store for normal runtime use.

**Tech Stack:** Node.js ES modules, `better-sqlite3`, built-in `node:test`, existing runtime state factory.

## Global Constraints

- Risk A source-only; no production schema initialization, deployment, provider access, runtime mutation, or customer-data access.
- Retention is exactly 90 days from normalized `updatedAt`.
- Expired Leads are never returned and are physically deleted on the next queue interaction or explicit purge.
- The future production backup/restore process must enforce the same 90-day boundary and purge immediately after restore.
- Add only `platform_leads`, `platform_leads_status_created_idx`, and `platform_leads_expires_at_idx`.
- Do not add `platform_operations_events`, lifecycle inference, generic summaries, Admin UI, external dependencies, or background services.
- Preserve the public and protected Lead HTTP response shapes.
- Public callers cannot choose persisted Lead identity, status, source, or timestamps; non-validation store failures map to `lead_sink_unavailable`.

---

### Task 1: Add the additive Lead persistence port

**Files:**
- Modify: `server/services/platform/subscription-control-db.mjs:209-220,661-1190,2891-2960`
- Modify: `server/tests/platform-subscription-control-db.test.mjs:1-40,after final existing test`

**Interfaces:**
- Consumes: normalized Lead objects from `normalizePlatformLead()`.
- Produces: `upsertLead(lead, { expiresAt })`, `getLead(id)`, `listLeads({ status })`, and `purgeExpiredLeads({ now })`.

- [ ] **Step 1: Write failing tests for persistence, restart, purge, and additive schema**

Append tests that create a synthetic Lead, close/reopen the database, preserve
`createdAt` across an update, purge at the expiry boundary, and inspect
`sqlite_master` to prove the new objects are exactly the approved table and two
indexes. The persistence call shape is:

```js
store.upsertLead({
  id: "lead_durable_1",
  type: "platform_lead",
  status: "new",
  organization: "Synthetic Research",
  email: "synthetic@example.test",
  direction: "API Sandbox",
  stage: "review",
  message: "Synthetic local fixture only.",
  source: "company-site",
  createdAt: "2026-07-16T00:00:00.000Z",
  updatedAt: "2026-07-16T00:00:00.000Z"
}, { expiresAt: "2026-10-14T00:00:00.000Z" });
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node --test server/tests/platform-subscription-control-db.test.mjs
```

Expected: FAIL because `store.upsertLead` is not defined.

- [ ] **Step 3: Implement the minimal table, row mapper, and store methods**

Add the exact schema:

```sql
create table if not exists platform_leads (
  id text primary key,
  status text not null check (status in ('new', 'reviewing', 'converted', 'rejected')),
  organization text not null,
  email text not null,
  direction text not null,
  stage text not null default '',
  message text not null,
  source text not null,
  created_at text not null,
  updated_at text not null,
  expires_at text not null
);
create index if not exists platform_leads_status_created_idx
  on platform_leads(status, created_at);
create index if not exists platform_leads_expires_at_idx
  on platform_leads(expires_at);
```

Map snake-case columns back to the existing camel-case Lead contract. Use an
idempotent insert/update statement that keeps the original `created_at` when an
ID already exists, and add:

```js
function purgeExpiredLeads({ now }) {
  return db.prepare("delete from platform_leads where expires_at <= ?")
    .run(isoText(now, "now")).changes;
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the same `node --test` command. Expected: all tests in the file PASS.

- [ ] **Step 5: Commit the store slice**

```powershell
git add server/services/platform/subscription-control-db.mjs server/tests/platform-subscription-control-db.test.mjs
git commit -m "feat(platform): persist retained leads"
```

### Task 2: Adapt the Lead queue with the 90-day retention policy

**Files:**
- Modify: `server/services/platform/lead-review-queue.mjs:1-98`
- Modify: `server/tests/platform-lead-review-queue.test.mjs:1-78`
- Modify: `server/tests/platform-lead-routes.test.mjs:1-130`

**Interfaces:**
- Consumes: the four store methods from Task 1 and an optional `retentionDays` test override.
- Produces: the unchanged queue API plus `purgeExpiredLeads()`.

- [ ] **Step 1: Write failing queue tests for restart, expiry, and status retention refresh**

Use a real temporary SQLite store. Create one queue, enqueue a Lead, close the
store, reopen it, and assert a second queue returns the same summary. Advance
`nowFn` to the exact 90-day boundary and assert `getLead()` returns the existing
safe `not_found` error and the underlying store no longer lists the row. Assert
a status update retains `createdAt` while setting a new 90-day expiry.

- [ ] **Step 2: Run focused queue and route tests and verify RED**

Run:

```powershell
node --test server/tests/platform-lead-review-queue.test.mjs server/tests/platform-lead-routes.test.mjs
```

Expected: FAIL because the queue ignores `store` and does not expose purge.

- [ ] **Step 3: Implement the store adapter and retention calculation**

Add:

```js
export const PLATFORM_LEAD_RETENTION_DAYS = 90;

function retentionUntil(updatedAt, retentionDays) {
  return new Date(
    new Date(updatedAt).getTime() + retentionDays * 24 * 60 * 60 * 1000
  ).toISOString();
}
```

The queue generates ID/status/timestamps for every new Lead and the public route
passes only organization, email, direction, stage, and message. When a store is
present, purge before every queue operation, call
`store.upsertLead(lead, { expiresAt })` for insert/update, and read/list through
the store. Keep the existing `Map` implementation as the fallback when no store
is injected. `purgeExpiredLeads()` returns the deleted row count for the store
path and `0` for the in-memory path.

- [ ] **Step 4: Run focused queue and route tests and verify GREEN**

Run the same focused test command. Expected: all tests PASS,
caller-controlled persistence fields are ignored, store failures return 503,
and success response fixtures remain unchanged.

- [ ] **Step 5: Commit the queue slice**

```powershell
git add server/services/platform/lead-review-queue.mjs server/tests/platform-lead-review-queue.test.mjs server/tests/platform-lead-routes.test.mjs
git commit -m "feat(platform): retain durable lead queue"
```

### Task 3: Wire runtime ownership and record the schema gate

**Files:**
- Modify: `server/state.mjs:960-982,1440-1450`
- Modify: `server/tests/state.test.mjs:269-305`
- Create: `docs/LEAD_DURABILITY_SCHEMA_GATE.md`

**Interfaces:**
- Consumes: `createPlatformLeadReviewQueue({ store })` from Task 2.
- Produces: runtime restart persistence using the existing control database path; no new route or deployment interface.

- [ ] **Step 1: Write a failing runtime restart test**

Create two sequential runtime states using the same synthetic
`SUBSCRIPTION_CONTROL_DB_PATH`. Enqueue through the first state's
`platform.leadQueue`, close it, open the second state, and assert the Lead and
status are preserved. Close each runtime before deleting the fixture directory.

- [ ] **Step 2: Run the state test and verify RED**

Run:

```powershell
node --test --test-name-pattern="Lead review queue" server/tests/state.test.mjs
```

Expected: FAIL because `state.mjs` creates the queue without the control store.

- [ ] **Step 3: Inject the owned control store and write the gate document**

Change runtime construction to:

```js
const platformLeadQueue = options.platformLeadQueue || createPlatformLeadReviewQueue({
  store: platformControlStore
});
```

Create `docs/LEAD_DURABILITY_SCHEMA_GATE.md` with the exact schema objects,
90-day deletion and backup rules, local dry-run checklist, stop conditions,
future production gate, and non-destructive rollback boundary from the design.

- [ ] **Step 4: Run focused runtime and Lead validation**

Run:

```powershell
node --test --test-name-pattern="Lead review queue" server/tests/state.test.mjs
node --test server/tests/platform-subscription-control-db.test.mjs server/tests/platform-lead-review-queue.test.mjs server/tests/platform-lead-routes.test.mjs
```

Expected: all selected tests PASS.

- [ ] **Step 5: Commit runtime wiring and documentation**

```powershell
git add server/state.mjs server/tests/state.test.mjs docs/LEAD_DURABILITY_SCHEMA_GATE.md docs/superpowers/specs/2026-07-16-lead-durability-foundation-design.md docs/superpowers/plans/2026-07-16-lead-durability-foundation.md
git commit -m "docs(platform): gate durable lead storage"
```

### Task 4: Verify and publish the replacement Draft PR

**Files:**
- Verify all files changed from `origin/master`.

**Interfaces:**
- Consumes: completed Tasks 1-3.
- Produces: exact-head validation evidence and one Draft replacement PR.

- [ ] **Step 1: Run complete validation**

```powershell
npm test
npm run project-state:check
npm run docs:authority:check
git diff --check origin/master...HEAD
```

Expected: every command exits 0.

- [ ] **Step 2: Review the exact changed surface and forbidden scope**

```powershell
git diff --stat origin/master...HEAD
git diff --name-status origin/master...HEAD
rg -n "platform_operations_events|operations-summary" server docs/LEAD_DURABILITY_SCHEMA_GATE.md
git status --short --branch
```

Expected: only the planned Lead/store/runtime/tests/docs files changed; the
forbidden-scope search returns no new implementation; worktree is clean.

- [ ] **Step 3: Push and create a Draft PR**

Push `codex/lead-durability-foundation`, create a Draft PR referencing #475 and
superseding #476, and include Risk A/source-only authority, exact schema,
retention, validation, non-goals, future production gate, and rollback in the
body.

- [ ] **Step 4: Supersede old PR #476 only after replacement creation succeeds**

Comment on #476 with the replacement PR number, close it as superseded, verify
the closed state, and delete `origin/codex/operations-foundation` only after the
replacement branch and PR are durably visible.
