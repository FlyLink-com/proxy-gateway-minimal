# Project Simplification Map

Last updated: 2026-05-25, Asia/Shanghai.

> Status:
> - Type: Active simplification and cleanup map
> - Risk: C
> - Execution authority: Does not authorize code, CI host, AWS, DNS, Nginx,
>   HTTPS, production config, node, tenant, secret, SQLite, deploy, or cutover
>   changes
> - Production impact: None
> - Source of truth for: What to simplify first, what to keep active, what to
>   pause, and how to classify future cleanup work

## Purpose

The project has grown from a minimal subscription gateway into a broader
subscription-control and edge-networking product. That direction is valid, but
the information structure is now carrying too much at once:

- current product direction
- production facts
- historical execution records
- future architecture ideas
- local operator-lab experiments
- manual CI fallback
- prototype Local Edge Agent code
- server-side edge mesh planning

This document provides a compact simplification map. It does not delete history
or approve implementation. It defines the order and boundaries for future
docs/code cleanup so agents do not expand every idea into the main product path.

## Current Product Spine

The project should optimize around one product spine:

```text
stable subscription/import experience
  -> authoritative subscription control plane
  -> replaceable edge data-plane capacity
  -> local client adapter path
  -> measured validation and operations
```

In concrete terms:

```text
sub-control-a / future sub-control-b
  own subscription state, artifacts, Admin, rendering, and operator actions

prod-edge-a / prod-edge-b / future prod-edge-c
  carry edge data-plane traffic and report health

Local Edge Agent
  is the future local loopback channel adapter path

Clash/Mihomo
  remains the client router and UI until deliberately replaced
```

Subscription URLs, opaque artifacts, node config, and edge mesh work are
supporting mechanisms. They should not become competing products.

## Simplification Principles

Use these rules when deciding whether to add, keep, archive, or refactor work.

```text
One current state entrypoint:
  docs/PROJECT_CONTEXT.md should summarize current facts and point to detail.

One documentation index:
  docs/README.md should route readers to the right current or historical doc.

One operating model:
  docs/PROJECT_OPERATING_MODEL.md defines risk, lanes, gates, and product
  stability principles.

One multi-agent model:
  docs/MULTI_AGENT_OPERATING_MODEL.md defines task packets, parallelization,
  and verification responsibility.

One simplification map:
  this document defines the cleanup backlog and boundaries.
```

Do not add a new long-lived architecture document unless it fits one of the
active lanes below and has a clear validation or cleanup path.

## Active Lanes

### Lane 1: Subscription Control Plane

Purpose:

- keep subscription state authoritative
- generate stable subscription output
- own Admin/operator actions
- own opaque artifacts and future device bootstrap

Primary docs:

- `docs/SUBSCRIPTION_CONTROL_EDGE_ARCHITECTURE.md`
- `docs/SUBSCRIPTION_V2_REPLACEMENT.md`
- `docs/SUBSCRIPTION_DEVICE_SCOPED_OPAQUE_URLS.md`
- `docs/SUBSCRIPTION_OPAQUE_ACCESS_MODEL_GAP.md`

Primary code areas:

- `server/services/subscriptions/*`
- `server/routes/subscription.mjs`
- `server/routes/admin-subscriptions.mjs`
- `server/services/clash-subscription.mjs`
- `server/middleware/*`

Keep active. This is core product work.

### Lane 2: Edge Data Plane

Purpose:

- make edge nodes replaceable delivery capacity
- keep production node identity provider-neutral
- isolate edge traffic from subscription authority
- preserve rollback and recovery options

Primary docs:

- `docs/PRODUCTION_EDGE_FLEET.md`
- `docs/NODE_NAMING.md`
- `docs/PRODUCTION_REPLACEMENT.md`
- `docs/PRODUCTION_DR.md`
- relevant execution records under `docs/production-replacement-records/`

Primary code/config areas:

- `ops/edge-node/*`
- `proxy-servers.json.example`
- `ops/nginx/*`
- `ops/systemd/*`

Keep active, but all real node, DNS, Nginx, systemd, or production config work
remains Risk A.

### Lane 3: Local Client Adapter

Purpose:

- keep Clash/Mihomo as the user-facing router/UI
- provide a future loopback-only Local Edge Agent
- adapt local client traffic into platform-controlled remote-edge channels

Primary docs:

- `docs/LOCAL_EDGE_AGENT_DESIGN.md`
- `docs/NETWORK_FORWARDING.md`

Primary code areas:

- `agent/*`
- `server/tests/local-edge-*.mjs`

Keep active as product prototype work. It should not mutate system proxy,
routes, drivers, TUN, public listeners, production transport, or device
credentials until a separate design and risk gate exists.

### Lane 4: Validation And CI

Purpose:

- keep local and manual CI evidence reproducible
- avoid confusing manual CI with staging or production
- give code changes a predictable verification baseline

Primary docs:

- `docs/CI_MANUAL_VALIDATION.md`
- relevant validation sections in `docs/PROJECT_CONTEXT.md`

Primary code/config areas:

- `package.json`
- `server/tests/*`
- `admin/src/test/*`
- `.github/workflows/*`

Keep active. Future simplification should create a compact validation baseline
entrypoint rather than adding more historical test-count paragraphs to
`PROJECT_CONTEXT.md`.

### Lane 5: Operator Lab / HP Relay

Purpose:

- provide local experiment evidence for network path, upstream selection, and
  channel behavior
- support operator-only research and debugging

Status:

- not production
- not staging
- not CI
- not prod-edge-c
- not Server Edge Mesh
- not the official Local Edge Agent runtime

Keep as an experiment lane only. Do not write HP Relay facts into production
records unless a separate approved promotion path exists.

### Lane 6: Server Edge Mesh

Purpose:

- private edge-to-edge management, health, validation, and recovery
- provider-neutral operator path between edge nodes

Primary docs:

- `docs/SERVER_EDGE_MESH_DESIGN.md`
- `docs/SERVER_EDGE_MESH_WIREGUARD_CANARY_RUNBOOK.md`
- `docs/server-edge-mesh-records/*`

Keep active as an ops architecture lane. It is not a user VPN, not customer data
routing, and not the local client adapter product.

## Current Complexity Hotspots

### Hotspot 1: PROJECT_CONTEXT Is Too Dense

Known fact:

`docs/PROJECT_CONTEXT.md` is the current resume source, but it now mixes current
facts, historical execution summaries, validation baselines, production state,
and future direction in one long file.

Simplification target:

```text
PROJECT_CONTEXT.md
  keep: current facts, active blockers, latest durable next step
  move/detail: long historical execution facts remain in record docs
  link: docs/README.md and this simplification map for navigation
```

Suggested follow-up:

- C-tier PR: create a compact `docs/CURRENT_STATE.md` or slim the existing
  `PROJECT_CONTEXT.md` into a shorter handoff with links.
- Do not delete historical facts until they are reachable from `docs/README.md`.

### Hotspot 2: Historical Records Are Correct But Noisy

Known fact:

Execution records are valuable because they prove what happened and what did
not happen. The problem is not their existence; the problem is that current
handoff text repeats too much of them.

Simplification target:

```text
execution records:
  keep immutable
  improve index/navigation
  do not copy full details into PROJECT_CONTEXT.md
```

Suggested follow-up:

- C-tier PR: add record indexes by area:
  - production replacement
  - production incident
  - domain implementation
  - server edge mesh

### Hotspot 3: Product And Ops Experiments Can Blur Together

Known fact:

Local Edge Agent, Server Edge Mesh, HP Relay, WireGuard, Clash/Mihomo
subscriptions, and opaque artifacts are related, but they are not the same
thing.

Simplification target:

```text
Local Edge Agent:
  product client adapter

Server Edge Mesh:
  private operator/edge management path

HP Relay:
  operator lab and research node

Subscription artifacts:
  access/bootstrap mechanism

Clash/Mihomo:
  current user router/UI
```

Suggested follow-up:

- C-tier PR: add a short "what this is not" block to each active architecture
  doc if it is missing or too weak.

### Hotspot 4: Code Has Production, Prototype, And Legacy-Looking Areas

Known fact:

The repository contains production server paths, Admin UI paths, Local Edge
Agent prototype paths, network diagnostic paths, and legacy/compatibility-looking
routes. These should not be deleted by intuition.

Initial module classification for future audit:

```text
Production core:
  server/app.mjs
  server/index.mjs
  server/start.mjs
  server/middleware/*
  server/routes/subscription.mjs
  server/routes/admin-subscriptions.mjs
  server/routes/status.mjs
  server/services/subscriptions/*
  server/services/clash-subscription.mjs
  server/services/config.mjs
  server/services/console-token.mjs
  server/services/redaction.mjs

Operator/Admin UI:
  admin/src/features/subscriptions/*
  admin/src/components/*
  admin/src/pages/*

Prototype product path:
  agent/*
  server/tests/local-edge-*.mjs

Network diagnostics / compatibility audit candidates:
  server/routes/legacy-proxy.mjs
  server/routes/network.mjs
  server/routes/system-proxy.mjs
  server/services/http-bridge.mjs
  server/services/http-proxy.mjs
  server/services/daemon-launcher.mjs
  server/services/ss-local.mjs
  daemon.mjs
```

This classification is not an approval to remove files. It is the starting
point for a B-tier code inventory PR with tests.

### Hotspot 5: Validation Baselines Are Scattered

Known fact:

The repo has local tests, Admin tests/build, GitHub Actions intent, and Aliyun
manual CI fallback records. Historical pass counts differ by date and branch.

Simplification target:

```text
Current C-tier:
  git diff --check origin/master...HEAD

Current B-tier server:
  git diff --check origin/master...HEAD
  npm test

Current B-tier Admin:
  git diff --check origin/master...HEAD
  npm run admin:test
  npm run admin:build
  npm test

Current A-tier:
  runbook-specific validation plus rollback evidence
```

Suggested follow-up:

- C-tier PR: add `docs/VALIDATION_BASELINE.md` and point old validation records
  to historical context.

## Recommended Cleanup Queue

### C1: Documentation Slimming

Goal:

Make current-state reading fast without losing historical audit evidence.

Scope:

- reduce `PROJECT_CONTEXT.md` duplication
- add record indexes if needed
- ensure every historical record remains reachable from `docs/README.md`
- keep all secrets and raw URLs out of docs

Validation:

```text
git diff --check origin/master...HEAD
```

### C2: Architecture "Not This" Hardening

Goal:

Prevent HP Relay, Server Edge Mesh, Local Edge Agent, and subscription artifacts
from being confused with each other.

Scope:

- update active architecture docs with explicit non-goals
- keep product spine consistent
- avoid changing runbook approval phrases

Validation:

```text
git diff --check origin/master...HEAD
```

### C3: Validation Baseline Entrypoint

Goal:

Create one short current validation entrypoint.

Scope:

- add `docs/VALIDATION_BASELINE.md`
- link it from `docs/README.md`, `docs/PROJECT_CONTEXT.md`, and
  `docs/PROJECT_OPERATING_MODEL.md`
- distinguish current validation commands from historical execution evidence

Validation:

```text
git diff --check origin/master...HEAD
```

### B1: Code Module Inventory

Goal:

Classify code modules as production, operator UI, prototype, compatibility, or
cleanup candidates using tests and imports.

Scope:

- inspect imports and package scripts
- map route/service reachability
- add or update tests only where classification depends on behavior
- do not delete files in the first inventory PR unless the evidence is trivial

Validation:

```text
git diff --check origin/master...HEAD
npm test
```

Admin-related changes also require:

```text
npm run admin:test
npm run admin:build
```

### B2: Admin UI Surface Simplification

Goal:

Keep the Admin UI focused on current operator workflows.

Scope:

- identify placeholder pages versus active pages
- keep mock data only if it serves local development or tests
- avoid exposing Admin UI publicly

Validation:

```text
git diff --check origin/master...HEAD
npm run admin:test
npm run admin:build
npm test
```

### A1: Legacy Query-Token Retirement

Goal:

Eventually retire legacy query-token subscription access after opaque artifacts
are broadly issued and verified.

Scope:

- production tenant/artifact migration
- route behavior changes
- Nginx/public path validation
- rollback and stale-client handling

Risk:

Always Risk A. This changes production access semantics.

### A2: Physical Control/Edge Split

Goal:

Move from co-located production toward a separate subscription control plane and
replaceable edge data-plane nodes.

Scope:

- control-plane host/DB authority
- edge health/reporting
- DNS/Nginx/systemd/node config
- backup/restore and rollback

Risk:

Always Risk A.

## Stop-Doing List

Do not do these unless a separate approved task explicitly changes direction:

- do not add another long architecture branch without tying it to an active lane
- do not treat HP Relay as production, staging, CI, or prod-edge-c
- do not treat Server Edge Mesh as a user VPN
- do not treat WireGuard setup as already approved because a runbook exists
- do not treat manual CI as staging or deploy approval
- do not delete legacy-looking code without import, route, and test evidence
- do not copy historical execution details into `PROJECT_CONTEXT.md` when a link
  to the record is enough
- do not record raw secrets, subscription URLs, tokens, passwords, private keys,
  customer data, or unredacted production credentials

## Completion Criteria For Simplification Work

A simplification PR is useful only if it reduces ambiguity. Check each PR
against this list:

```text
Does it make the product spine clearer?
Does it reduce current-state duplication?
Does it preserve historical evidence by linking rather than deleting?
Does it distinguish production from lab/prototype/validation?
Does it keep the A/B/C risk boundary intact?
Does it avoid secrets and raw subscription URLs?
Does it make the next code or ops task easier to execute safely?
```

If the answer is not clear, prefer a smaller PR.
