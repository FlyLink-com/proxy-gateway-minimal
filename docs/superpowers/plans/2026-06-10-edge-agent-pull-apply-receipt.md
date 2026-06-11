# Edge Agent Pull Apply Receipt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans
> to implement this plan.

**Goal:** Replace manual remote data-plane handoff consumption with a tested
pull / apply / receipt contract so Singapore and future data-plane nodes only
render as healthy after their runtimes have applied the latest desired
credential generation.

**Architecture:** Keep Japan as the single subscription control plane. Add a
node-scoped desired-state store, redacted receipt store, private agent protocol,
and render gate. Add a small data-plane agent that pulls desired state, applies
runtime-specific adapters locally, and posts redacted receipts. No Redis,
external queue, public Admin, shared node-local user DB, or microservice split.

**Tech Stack:** Node.js ESM, existing Express routes, existing SQLite control
DB repository, existing runtime adapter patterns for Xray/VLESS Reality,
Hysteria2, and Mihomo/TUIC, existing test runner.

## Progress

Current repo-only progress as of 2026-06-10:

- Completed: Task 1 protocol/redaction helpers and tests.
- Completed: Task 2 durable desired-state, apply-receipt, and agent-lease
  storage in the control DB with idempotent schema migration coverage.
- Completed: Task 3 normal subscription rendering and render-proof paths fail
  closed for remote data-plane channels until a fresh applied receipt and lease
  exist.
- Remaining: Task 4 private agent routes, Task 5 node-side dry-run agent, and
  Task 6 production gate documentation closeout.
- Not authorized: production deployment, live order creation, runtime config
  mutation, Nginx/firewall/systemd changes, or secret/material output.

---

### Task 1: Protocol And Redaction Contract

**Files:**
- Create: `server/services/edge/data-plane-agent-protocol.mjs`
- Create: `server/tests/data-plane-agent-protocol.test.mjs`

**Step 1: Write failing protocol tests**

Cover:
- desired-state payload validates `nodeRef`, `generation`, `channelRefs`,
  `edgeCredentialRefs`, `validUntil`, and digest fields;
- receipt payload validates `nodeRef`, `generation`, `channelRef`, `status`,
  `configTest`, `serviceActive`, `listenerPresent`, `credentialCount`,
  `appliedAt`, and `reasonCode`;
- payloads containing forbidden material are rejected or redacted;
- unknown channel refs are rejected for a node-scoped request.

**Step 2: Implement protocol helpers**

Add helpers for:
- validating desired-state request scope;
- building redacted desired-state summaries;
- validating apply receipts;
- producing safe error payloads.

**Step 3: Verify**

Run:

```powershell
node --test server\tests\data-plane-agent-protocol.test.mjs
```

### Task 2: Desired Generation And Receipt Store

**Files:**
- Update: `server/services/platform/subscription-control-db.mjs`
- Create: `server/services/edge/data-plane-desired-state-store.mjs`
- Create: `server/services/edge/data-plane-receipt-store.mjs`
- Create/update tests under `server/tests/`

**Step 1: Write failing store tests**

Cover:
- issuing an order creates node/channel desired generations;
- replaying the same generation is idempotent;
- receipt for an older generation does not satisfy latest generation;
- `failed` or stale receipts block normal render;
- `applied` fresh receipt allows the remote channel to become render-eligible.

**Step 2: Add idempotent schema migration**

Add tables or columns for:
- desired-state generation metadata;
- channel-level apply receipts;
- agent lease/heartbeat facts.

Keep migrations idempotent and avoid production execution in this repo-only
task.

**Step 3: Implement stores**

Stores should return safe refs and counts by default. Sensitive material must
remain behind existing protected material resolution paths.

**Step 4: Verify**

Run focused tests, then:

```powershell
npm test
```

### Task 3: Render Fail-Closed Gate

**Files:**
- Update subscription rendering/channel policy services
- Add tests under `server/tests/`

**Step 1: Write failing render tests**

Cover:
- local channels still render when policy allows and local runtime readiness is
  already represented;
- remote SGP channels do not render when latest applied receipt is missing;
- remote SGP channels render after fresh matching receipt;
- stale lease removes or demotes remote channels;
- Admin render proof can show pending channels without returning YAML.

**Step 2: Implement render gate**

Channel render eligibility should combine:
- pool/lifecycle policy;
- entitlement/order status;
- desired generation existence;
- latest applied receipt;
- fresh node lease;
- explicit canary/private assignment where required.

**Step 3: Verify**

Run focused tests and:

```powershell
npm test
```

### Task 4: Private Agent Routes

**Files:**
- Create: `server/routes/data-plane-agent.mjs`
- Update app wiring behind env gate
- Add route tests

**Step 1: Write failing route tests**

Cover:
- routes are disabled by default;
- unauthenticated requests reject;
- node identity can only pull its own desired state;
- receipt POST rejects forbidden material;
- public Admin and public portal boundaries are unchanged.

**Step 2: Implement env-gated routes**

Suggested private routes:

```text
GET  /api/internal/data-plane-agent/desired-state
POST /api/internal/data-plane-agent/receipts
POST /api/internal/data-plane-agent/lease
```

These routes must not be publicly exposed by Nginx and must be protected by
node-scoped authentication.

**Step 3: Verify**

Run route tests and:

```powershell
npm test
```

### Task 5: Node-Side Agent Dry Run

**Files:**
- Create: `agent/edge-agent.mjs`
- Create/update runtime adapter tests
- Add docs/runbook pointer if needed

**Step 1: Write failing dry-run tests**

Cover:
- agent pulls desired state for one node;
- agent invokes adapters in dry-run mode;
- agent posts receipts without raw material;
- config-test failure posts `failed` receipt and does not apply;
- idempotent apply posts unchanged/applied receipt.

**Step 2: Implement dry-run agent**

The first version should run locally against fixtures and injected adapters.
Production systemd installation is explicitly out of scope.

**Step 3: Verify**

Run focused tests and:

```powershell
npm test
```

### Task 6: Production Gate Documentation

**Files:**
- Update: `docs/EDGE_AGENT_PULL_APPLY_RECEIPT_ARCHITECTURE.md`
- Create production approval packet when implementation is ready

**Step 1: Document exact A-tier gates**

Document:
- read-only inventory;
- staging proof;
- SGP agent install;
- loopback/private route exposure check;
- service restart limits;
- rollback to previous protected runtime configs;
- validation that remote channels render only after receipts.

**Step 2: Final repo validation**

Run:

```powershell
git diff --check origin/master...HEAD
npm test
npm run project-state:check
```

**Step 3: Stop before production**

Do not deploy, restart services, mutate production DBs, modify Nginx, modify
firewall, create live orders, or output secrets without a separate exact
Risk A approval.
