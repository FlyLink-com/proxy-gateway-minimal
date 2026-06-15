# Unit Design Index

Last updated: 2026-06-15, America/Los_Angeles.

> Status:
> - Type: Active unit design index
> - Risk: C
> - Execution authority: Does not authorize code, commercial system, CI host,
>   AWS, DNS, Nginx, HTTPS, production config, node, tenant, secret, SQLite,
>   deploy, or cutover changes
> - Production impact: None
> - Source of truth for: navigation across separated project unit designs

## Purpose

This directory keeps each project unit design separate. Use
`docs/DOMAIN_UNIT_BOUNDARIES.md` as the top-level boundary and these unit files
for focused ownership, interfaces, risks, and next tasks.

For source/archive separation, use `docs/CURRENT_SOURCE_AND_ARCHIVE_BOUNDARY.md`
before importing unit material from old checkouts, `.worktrees/`, generated
artifacts, or `docs/archive/superpowers/`. Historical unit specs and plans are
background only until a current active doc reactivates them.

## Unit Designs

| Unit | Document | Status |
| --- | --- | --- |
| Product Business | `docs/units/PRODUCT_BUSINESS_UNIT.md` | Active |
| Commercial / Entitlement | `docs/units/COMMERCIAL_ENTITLEMENT_UNIT.md` | Active |
| Subscription Access Control | `docs/units/SUBSCRIPTION_ACCESS_UNIT.md` | Active |
| Edge / Node Capacity | `docs/units/EDGE_NODE_UNIT.md` | Active |
| Local Client | `docs/units/LOCAL_CLIENT_UNIT.md` | Active |
| Validation / CI | `docs/units/VALIDATION_CI_UNIT.md` | Active |
| Operator Lab | `docs/units/OPERATOR_LAB_UNIT.md` | Active |
| Production Operations | `docs/units/PRODUCTION_OPS_UNIT.md` | Active |

## Repository Anchor Map

Use this map as a navigation layer only. It does not change code ownership,
runtime authority, or validation requirements. Verify exact files with `rg` or
`rg --files` before editing.

| Unit | Primary repository anchors | Primary test anchors | Default validation | Must not own |
| --- | --- | --- | --- | --- |
| Product Business | `admin/src/features/user-portal/`, `admin/src/features/company-site/`, `admin/src/pages/portal-requests-page.tsx`, `server/routes/user-portal.mjs`, `server/routes/public-leads.mjs`, product-flow docs | `admin/src/test/user-portal.test.tsx`, `admin/src/test/company-site.test.tsx`, `admin/src/test/portal-requests-page.test.tsx`, `server/tests/platform-portal-*.test.mjs`, `server/tests/platform-lead-*.test.mjs` | Admin UI: `npm run admin:test`, `npm run admin:build`, `npm test`, diff check. Docs-only: diff check. | Node runtime authority, payment provider execution, public Admin exposure, or production issuance approval. |
| Commercial / Entitlement | `server/services/platform/`, `server/routes/admin-platform.mjs`, `project-state/*.json`, entitlement/billing docs | `server/tests/platform-account-entitlement-shell.test.mjs`, `server/tests/platform-billing-provider-contract.test.mjs`, `server/tests/platform-payment-provider-adapter-template.test.mjs`, `server/tests/platform-subscription-control-db.test.mjs` | Server/shared code: `npm test` and diff check. Project-state changes: `npm run project-state:check` and diff check. | Data-plane listener config, runtime apply, provider checkout/webhook activation, or live customer billing mutation. |
| Subscription Access Control | `server/routes/subscription.mjs`, `server/services/clash-subscription.mjs`, `server/services/platform-subscription-*.mjs`, `server/services/channel-subscription-*.mjs`, `bin/gccgw.mjs`, subscription-access docs | `server/tests/clash-subscription.test.mjs`, `server/tests/platform-subscription-access-shell.test.mjs`, `server/tests/platform-issue-subscription-cli.test.mjs`, `server/tests/channel-subscription-*.test.mjs` | Server/CLI changes: targeted tests plus `npm test` and diff check. Docs-only: diff check. | Raw token output, public Admin exposure, node-local account truth, production artifact issuance, or legacy-token retirement without a Risk A gate. |
| Edge / Node Capacity | `agent/production-edge-agent.mjs`, `agent/edge-tunnel.mjs`, `server/services/edge/`, `ops/edge-node/`, `deployments/production-template/`, node and channel runtime docs | `server/tests/edge-*.test.mjs`, `server/tests/data-plane-agent-*.test.mjs`, `server/tests/node-image-*.test.mjs`, `server/tests/channel-runtime-*.test.mjs` | Repo-only code: targeted tests plus `npm test` and diff check. Runtime/node execution remains runbook-specific Risk A. | Business entitlement decisions, user account truth, DNS/Nginx/firewall mutation, protected material handoff, or traffic activation without exact approval. |
| Local Client | `agent/local-edge-agent.mjs`, `agent/socks5-adapter.mjs`, `agent/diagnostics.mjs`, `agent/channel-profile.mjs`, local client docs | `server/tests/local-edge-*.test.mjs`, `server/tests/diagnostics.test.mjs`, `server/tests/network-doctor.test.mjs`, `server/tests/ip-address.test.mjs` | Local prototype/server code: targeted tests plus `npm test` and diff check. Docs-only: diff check. | Replacing Clash/Mihomo UI, system network takeover, production node mutation, or public runtime exposure. |
| Validation / CI | `docs/VALIDATION_BASELINE.md`, `docs/CI_MANUAL_VALIDATION.md`, `project-state/*.json`, validation tooling in `server/services/` and CLI scripts | `server/tests/*validation*.test.mjs`, `server/tests/*readiness*.test.mjs`, `server/tests/cli-*.test.mjs`, `server/tests/package-entry.test.mjs` | Docs-only: diff check. Project-state/tooling: `npm run project-state:check`, targeted tests, `npm test`, and diff check as applicable. | Production approval, staging authority, provider mutation, or treating manual CI as deployment validation. |
| Operator Lab | `agent/check_proxy.py`, `server/services/channel-*.mjs`, `server/tests/channel-*.test.mjs`, HP/operator-lab docs | `server/tests/channel-benchmark-*.test.mjs`, `server/tests/channel-measurement-*.test.mjs`, `server/tests/channel-lab-*.test.mjs`, `server/tests/channel-candidate-*.test.mjs` | Repo-only lab tooling: targeted tests plus `npm test` and diff check. Live lab/runtime work is Risk A if it touches hosts or networks. | Production capacity, user/order authority, provider firewall mutation, DNS changes, or automatic channel activation. |
| Production Operations | `docs/production-replacement-records/`, `docs/production-incident-records/`, `docs/*RUNBOOK*.md`, `ops/`, `deployments/production-template/`, `bin/gccgw.mjs` operator commands | Runbook-specific fixtures, `server/tests/*gate*.test.mjs`, `server/tests/*preflight*.test.mjs`, `server/tests/gccgw-*.test.mjs`, plus manual validation records when approved | C-tier runbook edits: diff check. Repo-only support code: targeted tests plus `npm test`. Production execution: runbook-specific Risk A validation only. | Treating docs as approval, printing secrets, skipping backup/rollback, public Admin exposure, or mutating cloud/runtime without exact operator approval. |

## Standard Unit Template

Each unit design should answer:

```text
Purpose:
  What this unit exists to decide or operate.

Responsibilities:
  What this unit owns.

Explicit non-responsibilities:
  What this unit must not own.

Inputs:
  What this unit consumes from other units.

Outputs:
  What this unit produces for other units.

Interfaces:
  How this unit connects to the others without sharing internals.

Current repository anchors:
  Current docs, code, or project-state files that relate to this unit.

Risk and validation:
  Default risk tier and validation commands.

Next tasks:
  The next safe repository or design work.

Paused / blocked items:
  Work that needs a separate design, runbook, approval, or production gate.
```

## Boundary Rule

Do not merge these designs back into one large "subscription management"
concept. Integration belongs at explicit interfaces:

```text
commercial entitlement decision
access artifact / subscription output
edge capacity and health
local bootstrap / diagnostics
validation evidence
operator lab evidence
production execution record
```
