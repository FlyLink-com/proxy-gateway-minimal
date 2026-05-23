# Documentation Index

Last updated: 2026-05-24, Asia/Shanghai.

Use this file as the first navigation point for project documentation. It
classifies current source-of-truth docs, active runbooks, execution records,
and historical design artifacts. It does not authorize production, AWS, DNS,
Nginx, HTTPS, deploy, secret, token, subscription URL, SQLite, or customer-data
actions by itself.

## Project Landing Pages

| Document | Purpose | Status | When to read |
| --- | --- | --- | --- |
| `README.md` | Chinese project landing page, quick start, topology summary, APIs, module tree, and current project overview. | Active entrypoint. | Read when onboarding Chinese-speaking operators or checking quick-start usage. |
| `README_EN.md` | English project landing page, quick start, topology summary, APIs, and source-of-truth pointer. | Active entrypoint. | Read when onboarding English-speaking collaborators. |

## Current State

| Document | Purpose | Status | When to read |
| --- | --- | --- | --- |
| `docs/PROJECT_CONTEXT.md` | Current project handoff, validated state, active blockers, and current operational facts. | Active current-state handoff. | Read first when resuming the repo or before changing project direction. |

## Workflow / Agent Rules

| Document | Purpose | Status | When to read |
| --- | --- | --- | --- |
| `AGENTS.md` | Default agent instructions, A/B/C risk tiers, validation expectations, and safety boundaries. | Active workflow rules. | Read before repo, ops, CI, network, deployment, or production-adjacent work. |
| `docs/CI_MANUAL_VALIDATION.md` | Temporary clean-server CI-equivalent validation path while GitHub-hosted Actions is blocked. | Active runbook, not staging or deploy approval. | Read before using a temporary validation host for repo-level CI evidence. |

## Network / Runtime

| Document | Purpose | Status | When to read |
| --- | --- | --- | --- |
| `docs/NETWORK_FORWARDING.md` | Local forwarding, PAC, Clash/Mihomo subscription forwarding, Admin tunnel, production runtime paths, and network test matrix. | Active architecture source of truth. | Read before network, proxy, node, or subscription-path changes. |
| `docs/ENVIRONMENT_TOPOLOGY.md` | Local checkout, GitHub, branch roles, AWS runtime roles, and current topology. | Active topology reference. | Read before interpreting environment roles or AWS instance identity. |
| `docs/API_COMPATIBILITY.md` | API compatibility notes for external callers and existing clients. | Current reference. | Read before changing API response shape or endpoint behavior. |
| `docs/MIGRATION.md` | Migration notes for earlier project usage and compatibility transitions. | Reference / migration notes. | Read when maintaining compatibility with older local usage. |

## Deployment / Staging

| Document | Purpose | Status | When to read |
| --- | --- | --- | --- |
| `docs/DEPLOYMENT_FLOW.md` | Development, PR, candidate, staging, production promotion, and rollback flow. | Active deployment flow. | Read before deployment, promotion, rollback, or candidate selection work. |
| `docs/STAGING_PROVISIONING.md` | Clean staging provisioning, dry-run inventory, approval gates, validation, and cleanup. | Active staging runbook. | Read before any staging AWS mutation. |
| `docs/STAGING_TARGET_DECISION.md` | Decision record for clean staging versus reusing the historical stopped node. | Active decision record. | Read before assigning or reassigning a staging target. |

## Production Safety

| Document | Purpose | Status | When to read |
| --- | --- | --- | --- |
| `docs/PRODUCTION_DR.md` | Single-node production disaster recovery, hard-stop rules, read-only inventory, backup/restore, validation, and incident template. | Active Risk A runbook; does not authorize mutation by itself. | Read before incident recovery, backup/restore, or production DR action. |
| `docs/PRODUCTION_REPLACEMENT.md` | Blue-green replacement gate: keep blue serving, create and validate green, decide cutover, preserve rollback. | Active Risk A runbook; does not authorize green creation by itself. | Read before planning a production replacement candidate. |
| `docs/PRODUCTION_CUTOVER_STRATEGY.md` | EIP, DNS/domain, and subscription/node-config cutover strategy decision. | Active decision record. | Read before choosing a traffic-cutover mechanism. |
| `docs/DOMAIN_ABSTRACTION_PLAN.md` | Domain/DNS abstraction plan for subscription base URL and Shadowsocks node host. | Active planning document; no execution authority. | Read before DNS/domain implementation planning. |
| `docs/DOMAIN_IMPLEMENTATION_RUNBOOK.md` | DNS/domain execution gates, AliDNS commands, HTTP/HTTPS validation, runtime config migration gates, client window, and rollback. | Active Risk A runbook; explicit approval still required before mutation. | Read before any DNS, Nginx, HTTPS, production config, or domain migration step. |
| `docs/production-replacement-preflight/2026-05-24-blue-green-preflight.md` | Read-only production replacement preflight facts. | Execution record; historical facts for the named date. | Read when checking whether green creation was previously considered ready. |
| `docs/domain-implementation-records/2026-05-24-stage0-preflight.md` | Read-only DNS/domain Stage 0 preflight facts. | Execution record; historical facts for the named date. | Read before requesting Gate 1 DNS/domain implementation approval. |

## Paused / Historical

| Document | Purpose | Status | When to read |
| --- | --- | --- | --- |
| `docs/DOMAIN_HTTPS.md` | Earlier domain HTTPS runbook for `sub.globalcirclecat.com`. | Paused; superseded for current execution by the domain abstraction docs unless explicitly re-enabled. | Read only for historical context or if the domain HTTPS plan is explicitly resumed. |
| `docs/superpowers/specs/*` | Design specs created during feature and ops planning. | Historical design artifacts unless referenced by current docs. | Read for background, not as the default operational source of truth. |
| `docs/superpowers/plans/*` | Implementation plans created during feature and ops work. | Historical implementation artifacts unless referenced by current docs. | Read for background on why prior work was implemented. |
| `qa-report.md` | Earlier QA summary for the MVP baseline. | Historical QA reference. | Read for old coverage context, not for current test counts. |

## Reading Order

For routine development:

1. `AGENTS.md`
2. `docs/PROJECT_CONTEXT.md`
3. The subsystem document listed above

For production, AWS, DNS, Nginx, HTTPS, deploy, rollback, or node work:

1. `AGENTS.md`
2. `docs/PROJECT_CONTEXT.md`
3. The relevant active Risk A runbook
4. The latest relevant execution record, if one exists

Runbooks describe gates and commands, but they do not grant approval. Real
production, AWS, DNS, Nginx, HTTPS, or cutover execution still requires a
separate explicit operator approval record.
