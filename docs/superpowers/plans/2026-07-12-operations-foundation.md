# Operations Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a durable, privacy-bounded operations foundation for lead review, lifecycle events, and safe operator summaries without activating providers or production migration.

**Architecture:** Extend the existing SQLite control store with additive-only Lead and operations-event tables. Keep the current lead queue interface, inject the durable store at runtime, emit idempotent lifecycle events from existing write paths, and expose one protected summary-only Admin API.

**Tech Stack:** Node.js ESM, better-sqlite3, Express, node:test.

**GitHub Index Card:** Issue #475.

## Global Constraints

- Risk A applies because this adds SQLite schema.
- Source and local validation only; no production database access, deploy, promotion, or provider activation.
- Schema changes are additive `CREATE TABLE/INDEX IF NOT EXISTS`; no alteration, deletion, or backfill of existing business tables.
- Outputs must not expose email, message, subscription URL, credential material, raw provider payload, raw SQLite rows, or customer-private data.
- Keep the modular monolith and add no external service, queue, Redis, or warehouse dependency.

---

### Task 1: Add the schema gate and durable Lead repository

**Files:**
- Modify: `server/services/platform/subscription-control-db.mjs`
- Modify: `server/services/platform/lead-review-queue.mjs`
- Test: `server/tests/platform-operations-foundation.test.mjs`

**Interfaces:**
- Produces: `upsertLead(input)`, `getLead(id)`, `listLeads(filters)` on the control store.
- Consumes: existing `normalizePlatformLead()` and `createPlatformLeadReviewSummary()` contracts.

- [x] Write a restart test that creates a Lead, closes the SQLite store, reopens it, and verifies status and identity.
- [x] Run `node --test server/tests/platform-operations-foundation.test.mjs` and verify the restart assertion fails with `lead not found`.
- [x] Add `platform_leads` with an additive status/time index and implement the repository port.
- [x] Inject the repository into the existing queue without changing its public API.
- [x] Re-run the focused test and verify it passes.

### Task 2: Add the idempotent operations event boundary

**Files:**
- Modify: `server/services/platform/subscription-control-db.mjs`
- Test: `server/tests/platform-operations-foundation.test.mjs`

**Interfaces:**
- Produces: `recordOperationsEvent(input)` and `listOperationsEvents(filters)`.
- Event refs: safe references only; private values are rejected from metadata.

- [x] Write tests for duplicate idempotency keys, append-only results, and unsafe metadata rejection.
- [x] Verify tests fail because `recordOperationsEvent` does not exist.
- [x] Add `platform_operations_events`, its type/time and reference indexes, and the allowlisted event vocabulary.
- [x] Emit Lead, Access Request, Delivery, and first-usage events from existing write paths.
- [x] Verify duplicate usage samples cannot duplicate the first-usage event.

### Task 3: Add the protected operations summary

**Files:**
- Create: `server/services/platform/operations-foundation-summary.mjs`
- Modify: `server/routes/admin-platform.mjs`
- Modify: `server/state.mjs`
- Test: `server/tests/platform-operations-foundation.test.mjs`

**Interfaces:**
- Produces: `createOperationsFoundationSummary({ leadQueue, controlStore })`.
- HTTP: `GET /api/admin/platform/operations-summary`, protected by the existing Admin boundary.

- [x] Write tests for Lead counts, event counts, missing-link evidence, authentication, and summary-only safety flags.
- [x] Verify the route returns 404 and runtime restart loses Lead state before implementation.
- [x] Wire the control store into the runtime Lead queue and expose the read-only summary route.
- [x] Run focused platform, state, access-request, and traffic-accounting tests.

### Task 4: Validate additive schema compatibility and complete the A-tier record

**Files:**
- Create: `docs/OPERATIONS_FOUNDATION_SCHEMA_GATE.md`
- Modify: `project-state/current.json`
- Modify: `project-state/lanes.json`
- Modify: `project-state/tasks.json`
- Test: `server/tests/platform-operations-foundation.test.mjs`

**Interfaces:**
- Consumes: a legacy SQLite fixture containing existing control-plane tables but no operations tables.
- Produces: a recorded local dry-run proving additive initialization and repeat startup.

- [x] Add a legacy-schema fixture test and verify the new store adds only the two new tables and indexes.
- [x] Verify repeated initialization preserves existing rows and creates no duplicate operations events.
- [x] Record scope, stop conditions, future production backup requirement, and rollback behavior in the schema gate.
- [x] Run `npm run project-state:check`.
- [x] Run the full suite with the macOS temporary directory canonicalized.
- [x] Run working-tree and base diff checks.

### Task 5: Review and hand off the single PR

**Files:** All files above.

**Interfaces:** Produces one reviewable source-only PR boundary; no deployment authority.

- [x] Inspect `git diff --stat` and `git diff --check` for unrelated changes.
- [x] Confirm no `.codex/config.toml`, generated fixture, database, credential, URL, or private material is tracked.
- [x] Summarize intent, schema boundary, tests, known non-goals, future production gate, and rollback in the handoff.
