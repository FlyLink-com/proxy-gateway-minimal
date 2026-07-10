# Project Context

Last updated: 2026-07-10, America/Los_Angeles.

> Status:
> - Type: Active current-state handoff
> - Risk: C
> - Execution authority: Does not authorize production, provider, DNS, Nginx,
>   systemd, firewall, schema, deploy, promotion, rollback, credential, payment,
>   subscription-material, or customer-data actions
> - Production impact: None
> - Source of truth for: Current repo orientation, Phase 2 queue, documented
>   release state, validation entrypoints, and first-pass Agent boundaries

This file is the compact entrypoint for continuing
`proxy-gateway-minimal`. Historical execution detail belongs in the indexed
records under `docs/`, not in this handoff.

## Read First

Use this order before any work:

1. `docs/CURRENT_RELEASE_STATE.md`
2. `RELEASE_MANIFEST.md`
3. `docs/PROJECT_CONTEXT.md`
4. `git status --short --branch`
5. Live GitHub, deployment, or production inventory required by the task risk

`project-state/*.json` is a compact coordination layer. It does not override
live production evidence or authorize external mutation.

## Current Classification

The project is a:

```text
Release-managed monorepo
  + Platform Foundation
  + Phase 2 Operational Reliability
```

It is not yet a fully reconciled platform product. Artifact governance is
stronger than deployment/runtime reconciliation, and commercial providers are
not live.

## Current Architecture

Use this mental model:

```text
Adapters
  company site | User Portal | protected Admin | CLI

Control plane
  Vultr Japan
  accounts | entitlements | orders/access requests | delivery | usage ledger

Interconnect
  authenticated desired-state, protected material refs, redacted receipts

Data plane
  Vultr Japan + Vultr Singapore
  VLESS Reality | Hysteria2 | TUIC

Evidence domains
  source | artifact | deployment | runtime observation
```

Do not derive production state from `master` alone. Artifact Identity and
Runtime Identity are independent evidence domains until explicit reconciliation
links them.

## Repository

Active checkout:

```text
D:\Projects\proxy-gateway-minimal
```

Repository:

```text
gaoyi1020-web/proxy-gateway-minimal
```

At the pre-reconciliation 2026-07-10 snapshot:

- `master`: `9aa1561eea8ce77cd1cf670369d5bd42c2331ba2`
- local worktree: clean and synchronized before this reconciliation branch
- remote branches: `master` only
- open PRs: 0
- open Issues: #437, #438, #439, and #440
- latest master CI: `29095756877`, success
- latest Release Artifact run: `29095756923`, success

These are dated facts. Re-run Git and GitHub inventory before making a current
claim.

Historical checkouts under the former C drive project paths are archive or
reference surfaces, not active source.

## Workflow Boundary

Risk tiers live in `AGENTS.md`:

- C: docs, runbooks, state records, and small governance corrections.
- B: focused source code, tests, local tooling, and protected UI behavior.
- A: production, providers, DNS, Nginx, systemd, firewall, auth model, schema,
  runtime config, deployment, promotion, rollback, or customer-data action.

A-tier work requires:

```text
read-only inventory
  -> reviewer-defined exact boundary
  -> explicit operator approval
  -> execution
  -> validation
  -> rollback evidence
```

Short replies alone do not authorize a production gate. The reviewer defines
scope, target, forbidden actions, validation, rollback, and stop conditions;
the operator approves or rejects that exact gate.

Every implementation PR must contain intent, execution, actual validation, and
remaining gates. Issues are durable index cards; PRs are execution summaries
and validation receipts.

## Phase 2 Queue

Keep one primary implementation lane active:

| Order | Issue | Lane | Current state |
| --- | --- | --- | --- |
| 1 | #437 | Traffic Accounting | Active; PRs #441, #459, and #460 merged; producer gaps remain |
| 2 | #438 | Portal Lifecycle | Queued after traffic semantics stabilize |
| 3 | #439 | Commercial Foundation | Queued; billing and AppsFlyer remain non-live |
| 4 | #440 | Code Boundary Cleanup | Opportunistic guardrail only |

Issue #457 is closed. Real merges proved the Vercel staged-deployment boundary
without moving the public custom aliases. Promotion remains separately gated.

Do not pre-create broad pipeline, Portal redesign, payment activation, or
architecture-refactor PRs. Each source PR must answer:

1. What capability does it produce?
2. Who consumes it now and later?
3. Why are adjacent runtime, UI, business, or deployment changes excluded?

## Release And Artifact State

The release model is:

```text
Source -> Artifact -> Release -> Deployment -> Runtime State
```

`master` is reviewed source, not a production-version claim.

Artifact Manifest v1 currently covers:

- `control-plane-app`
- `portal-static`
- `admin-static`

Runtime Config Identity v1 provides an offline deterministic observation
identity generator for Japan and Singapore runtime config. It has not observed
production and does not contain deployment state.

See `RELEASE_MANIFEST.md` for the contract and
`docs/CURRENT_RELEASE_STATE.md` for current documented identities.

## Deployment Boundary

The company site uses Vercel Git integration:

- Production Branch: `master`
- `autoAssignCustomDomains=false`
- current public alias target:
  `proxy-gateway-minimal-hqdudl13g-gccltd.vercel.app`
- current GitHub Production deployment: `5389897330`
- latest staged candidate: Vercel deployment
  `dpl_33AwpEF5kp2fnxSSgP4C8AhR8TNd`, GitHub deployment `5392032753`, source
  `9aa1561eea8ce77cd1cf670369d5bd42c2331ba2`
- staged proof: candidate READY, `production_environment=false`, and neither
  public custom alias moved

No Vercel promotion or rollback is authorized by this document.

The Cloudflare public-site workflow keeps automatic deploy disabled through
`CLOUDFLARE_SITE_AUTO_DEPLOY=false`. Pushes that match its paths may still run
build and verification. Manual deployment remains a separate production gate.

GitHub `Production` and `cloudflare-production` environments had no protection
rules at the latest read-only inventory. Branch protection/ruleset APIs were
unavailable under the current private-repository plan, so process discipline is
not equivalent to an enforced GitHub approval rule.

## Documented Production Snapshot

The compact current snapshot is in `docs/CURRENT_RELEASE_STATE.md`.

Important boundaries:

- `control-plane-app`: `active_documented` from the July 9 deployment record.
- `company-site-static`: `deployed_unreconciled`; current Vercel source and
  deployment are known, but portable artifact lineage is incomplete.
- `portal-static`: `deployed_unreconciled`.
- `admin-static`: `unknown` production identity.
- Japan and SGP runtime config: `active_documented`, not live-observed by
  Runtime Identity v1.
- `subscription-rendering`: `deployed_unreconciled`.
- AppsFlyer: disabled/dry-run only.

The documented control-plane source is an ancestor of current `master`, which
is 28 commits ahead at the snapshot. Source-only capabilities must not be
reported as deployed without a matching production record.

## Active Blockers

1. #437 still lacks protected Japan TUIC map verification status and SGP TUIC
   sidecar status producers; the Admin UI remains deferred.
2. Runtime Identity has not observed Japan or Singapore production.
3. Company site, Portal, Admin, and subscription-rendering lineage is not fully
   reconciled.
4. Billing and AppsFlyer are intentionally non-live.

Historical Aliyun, AWS canary, old carrier PR, and Admin OS task queues are not
current execution authority. Use Git history and the archive/index documents
only when archaeology is explicitly required.

## Validation Baseline

Use `docs/VALIDATION_BASELINE.md`.

Short matrix:

- C docs-only: `git diff --check origin/master...HEAD`
- project-state changes: `npm run project-state:check` plus diff check
- server/shared source: focused tests, `npm test`, and diff check
- Admin UI: focused tests, `npm run admin:test`, `npm run admin:build`,
  `npm test`, and diff check
- A-tier: runbook-specific validation; no generic shortcut

GitHub Actions success is build evidence, not production evidence.

## Documentation Navigation

Use these entrypoints:

- `docs/README.md`: full documentation index
- `docs/CURRENT_RELEASE_STATE.md`: current documented release identities
- `RELEASE_MANIFEST.md`: source/artifact/release/deployment/runtime model
- `docs/GITHUB_ISSUE_PR_WORKFLOW.md`: Issue and PR ownership
- `docs/FOUNDATION_FREEZE_2026_07_09.md`: Phase 1 closeout boundary
- `docs/TRAFFIC_ACCOUNTING_QUOTA_GATEWAY_PLAN.md`: active #437 domain plan
- `docs/ACCOUNT_RESOURCE_DELIVERY_LIFECYCLE.md`: queued #438 domain plan
- `docs/BILLING_RECHARGE_CONTRACT.md`: queued #439 foundation
- `docs/PROJECT_SIMPLIFICATION_MAP.md`: cleanup and non-goal map
- `docs/production-replacement-records/`: production execution evidence
- `docs/archive/`: superseded plans and historical context

Do not copy historical execution narratives back into this file. Add only facts
that change current orientation, queue order, risk boundaries, or the documented
release snapshot.

## Guardrails

- Do not commit or output secrets, credentials, subscription material,
  production environment values, private keys, SQLite rows, raw runtime config,
  raw logs, or customer data.
- Do not expose public Admin.
- Do not mutate production, providers, DNS, Nginx, systemd, firewall, schema,
  auth, runtime, deployment, promotion, or rollback without an exact Risk A
  gate and operator approval.
- Do not treat a merged PR, successful CI run, artifact, runbook, or dated
  execution record as current production proof.
- Do not reactivate historical Aliyun/AWS lanes without a new Issue, fresh
  inventory, and explicit approval.
- Keep Phase 2 serial: #437, then #438, then #439; use #440 only when active
  work exposes a measured boundary.
