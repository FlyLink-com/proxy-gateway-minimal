# Edge Agent Private Routes And Dry Run Stage 2 Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:executing-plans to implement this plan.

**Risk:** B for repository implementation and tests. Any production route
exposure, service restart, runtime config mutation, live order smoke, DNS,
Nginx, firewall, or credential material handling is Risk A and requires a
separate approval packet.

**Goal:** Finish the repo-only edge-agent productization lane after the durable
desired-state store and fail-closed render gate. The next stage adds private
agent routes, a node-side dry-run agent, and production gate documentation so
Singapore and future data-plane nodes can later move from manual handoff
consumption to a pull / apply / receipt loop.

**Current Acceptance Result:** The current phase is accepted at the repository
level. Implemented components cover the agent protocol/redaction helpers,
control DB desired-state / receipt / lease storage, and subscription render
fail-closed behavior for remote data-plane channels. Validation already run for
this phase:

```powershell
node --test server\tests\data-plane-agent-protocol.test.mjs
node --test server\tests\platform-subscription-control-db.test.mjs
node --test server\tests\subscription-service.test.mjs
node --test server\tests\channel-subscription-render-proof.test.mjs
npm test
npm run admin:test
npm run admin:build
npm run project-state:check
git diff --check
git diff --check origin/master...HEAD
```

**Stage 2 Repository Result:** Implemented and focused-tested repo-only private
agent routes, node-scoped service facade, and node-side dry-run agent. The
routes are disabled by default and mounted before console auth only when
`EDGE_DATA_PLANE_AGENT_ROUTES_ENABLED=true` and a configured agent service are
present. The dry-run agent uses injected runtime adapters and does not mutate
Xray, Hysteria2, TUIC, Nginx, firewall, systemd, production configs, accounts,
or orders.

Focused Stage 2 validation already run:

```powershell
node --test server\tests\data-plane-agent-protocol.test.mjs server\tests\data-plane-agent-service.test.mjs server\tests\data-plane-agent-routes.test.mjs
node --test server\tests\edge-agent-dry-run.test.mjs
node --test server\tests\channel-subscription-render-proof.test.mjs
```

Full closeout validation also passed:

```powershell
git diff --check
git diff --check origin/master...HEAD
npm run project-state:check
npm test
npm run admin:test
npm run admin:build
```

**Non-Goals:**

- Do not deploy an agent to Vultr Japan or Singapore in this stage.
- Do not expose `/api/internal/*` publicly through Nginx.
- Do not create live orders.
- Do not restart production services.
- Do not write raw credentials, subscription URLs, tokens, private keys, raw
  environment values, raw logs, raw runtime configs, or SQLite rows into Git,
  tests, docs, or reports.

## Task 1: Private Agent Route Contract

Status: Completed repo-only.

**Files:**

- Create `server/routes/data-plane-agent.mjs`.
- Update `server/app.mjs`.
- Update `server/state.mjs`.
- Create `server/tests/data-plane-agent-routes.test.mjs`.

**Tests first:**

- Routes are disabled by default.
- Requests without node authentication reject.
- A node token can pull only its configured `nodeRef` and channel scope.
- `GET /api/internal/data-plane-agent/desired-state` returns redacted desired
  state summaries only.
- `POST /api/internal/data-plane-agent/receipts` rejects forbidden material and
  accepts valid redacted receipts.
- `POST /api/internal/data-plane-agent/lease` records a node heartbeat without
  granting broader API access.
- Existing public portal, subscription, and Admin boundaries remain unchanged.

**Implementation requirements:**

- Add an explicit env gate such as
  `EDGE_DATA_PLANE_AGENT_ROUTES_ENABLED=true`.
- Keep routes outside public portal paths.
- Use a node-scoped verifier that compares a request token hash or equivalent
  protected verifier without logging token material.
- Return safe JSON errors only.

**Validation:**

```powershell
node --test server\tests\data-plane-agent-routes.test.mjs
npm test
```

## Task 2: Agent Service Facade

Status: Completed repo-only.

**Files:**

- Create `server/services/edge/data-plane-agent-service.mjs`.
- Update `server/services/edge/data-plane-agent-protocol.mjs` only if route
  integration needs additional pure helpers.
- Add focused service tests.

**Tests first:**

- Desired-state reads use the durable store and protocol redaction helpers.
- Receipt writes call the durable receipt store and preserve generation checks.
- Lease writes update only the node lease facts.
- A stale desired generation cannot be treated as applied by a newer receipt
  for another channel.

**Implementation requirements:**

- Keep route handlers thin.
- Keep material resolution behind existing protected runtime paths.
- Keep all returned payloads redacted by default.

**Validation:**

```powershell
node --test server\tests\data-plane-agent-service.test.mjs
npm test
```

## Task 3: Node-Side Dry Run Agent

Status: Completed repo-only.

**Files:**

- Create `agent/edge-agent.mjs`.
- Create `agent/README.md`.
- Create `server/tests/edge-agent-dry-run.test.mjs` or an equivalent focused
  test under the existing test runner.

**Tests first:**

- The agent pulls desired state using an injected HTTP client.
- The agent invokes injected runtime adapters in dry-run mode.
- The agent posts `applied`, `unchanged`, or `failed` receipts without raw
  material.
- Config-test failure posts a `failed` receipt and does not apply runtime
  mutation.
- Re-running the same generation is idempotent.

**Implementation requirements:**

- The first agent must be a local dry-run executable and library, not a
  production systemd unit.
- Adapter invocation must be injectable so tests do not touch real Xray, Hy2,
  TUIC, Nginx, firewall, or systemd.
- Logs and thrown errors must not include raw credential material.

**Validation:**

```powershell
node --test server\tests\edge-agent-dry-run.test.mjs
npm test
```

## Task 4: Render Proof And Admin Evidence

Status: Completed repo-only; existing render proof behavior remains green.

**Files:**

- Update `server/services/channel-subscription-render-proof.mjs` only if the
  Stage 2 route/receipt model needs clearer evidence.
- Add focused tests where behavior changes.

**Tests first:**

- Render proof can show remote channels as pending when receipts are missing.
- Render proof shows remote channels as renderable only after matching applied
  receipts and fresh leases.
- Proof output remains redacted and does not return subscription YAML unless
  explicitly requested by an already-authorized path.

**Validation:**

```powershell
node --test server\tests\channel-subscription-render-proof.test.mjs
npm test
```

## Task 5: Production Gate Packet

Status: Completed as documentation only. The gate packet does not authorize
production activation.

**Files:**

- Update `docs/EDGE_AGENT_PULL_APPLY_RECEIPT_ARCHITECTURE.md`.
- Create a new execution packet under `docs/production-replacement-records/`
  only after repository implementation and validation are green.
- Update `docs/PROJECT_CONTEXT.md`, `docs/README.md`, and
  `project-state/current.json` only with confirmed facts.

**Gate contents:**

- Read-only inventory checklist for Japan control plane and Singapore data
  plane.
- Private route exposure check showing `/api/internal/*` is not public.
- Agent install path and service boundaries.
- Exact restart limits.
- Rollback plan to previous protected runtime configs and previous control
  plane release.
- Validation that remote channels render only after fresh applied receipts.

**Validation:**

```powershell
git diff --check origin/master...HEAD
npm test
npm run admin:test
npm run admin:build
npm run project-state:check
```

## Completion Criteria

- Private agent routes are coded, disabled by default, and tested.
- The agent service facade is tested independently from Express.
- The node-side agent has a dry-run proof with injected adapters.
- Existing render gate tests remain green.
- Docs clearly separate repo-ready status from Risk A production activation.
- No production mutation, live order, secret output, or runtime restart occurred
  during this stage.
