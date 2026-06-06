# Edge Inventory Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a repository-local edge inventory contract that Subscription Access Control can consume without owning production node lifecycle.

**Architecture:** Add a small subscription-edge inventory module that normalizes configured proxy servers into safe node summaries, filters unavailable nodes from subscription output, and keeps assigned tenants fail-closed when their node is disabled or in maintenance. Subscription core remains the authority for access decisions; this change does not mutate production.

**Tech Stack:** Node.js ESM, `node:test`, existing subscription core and serializer modules.

---

### Task 1: Add Failing Contract Tests

**Files:**
- Modify: `server/tests/subscription-architecture-contract.test.mjs`
- Modify: `server/tests/subscription-service.test.mjs`

- [ ] Write tests proving node summaries include safe edge metadata only: `role`, `region`, `status`, `maintenance`, `subscriptionEligible`, and `reason`.
- [ ] Write tests proving default multi-node subscription output excludes disabled and maintenance nodes.
- [ ] Write tests proving tenants assigned to a disabled or maintenance node fail closed with `Subscription node unavailable`.
- [ ] Run targeted tests and confirm they fail before implementation.

### Task 2: Implement Inventory Normalization

**Files:**
- Create: `server/services/subscriptions/edge-inventory.mjs`
- Modify: `server/services/subscriptions/serializer.mjs`

- [ ] Add `normalizeEdgeNode(server)` to return a safe node summary without password or raw private fields.
- [ ] Add `subscriptionEligible` semantics: only `online` nodes that are not in maintenance are eligible.
- [ ] Add helper functions for listing eligible nodes and resolving eligible nodes by id or name.
- [ ] Keep current proxy server config shape compatible.

### Task 3: Wire Core Access Decisions

**Files:**
- Modify: `server/services/subscriptions/core.mjs`

- [ ] Use the inventory helpers in `selectTenantNode`, `resolveTenantAccess`, `listNodes`, and `overview`.
- [ ] Preserve current default behavior for plain configs with no status metadata.
- [ ] Fail closed before writing `lastUsedAt` when a tenant node is unavailable.

### Task 4: Validate And Publish

**Files:**
- Modify: `docs/units/SUBSCRIPTION_ACCESS_UNIT.md`
- Modify: `docs/units/EDGE_NODE_UNIT.md`
- Modify: `project-state/tasks.json`

- [ ] Record this as a completed B-tier repository contract task.
- [ ] Run `git diff --check origin/master...HEAD`.
- [ ] Run `npm test`.
- [ ] Commit, push, open PR, inspect checks, and merge if local validation passes and any GitHub Actions failure is the known billing/spending-limit runner blocker.
