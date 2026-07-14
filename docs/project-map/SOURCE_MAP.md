# Source Map

Last verified: 2026-07-14, America/Los_Angeles.

> Status:
> - Type: Source responsibility and dependency map
> - Risk: C
> - Execution authority: Does not authorize code, production, runtime,
>   provider, deployment, promotion, rollback, schema, auth, credential, or
>   customer-data actions
> - Production impact: None
> - Source of truth for: High-level responsibility, dependency, risk, and
>   evidence-backed ownership gaps for the requested source surfaces

## Inventory Boundary

- Source head inspected: `ab8b0ec2034cc92a84bcea738c0a254afbd60213`.
- Inventory used tracked source, directory listings, `server/app.mjs`, active
  architecture/release docs, and current GitHub state.
- No repository `CODEOWNERS` file or human source-module ownership registry was
  found. `docs/CONFIGURATION_OWNERSHIP_MATRIX.md` defines configuration
  placement, not human ownership. Owners below are therefore `unassigned`.
- Risk is the default for changing or executing the surface. A smaller-looking
  change inherits Risk A when it crosses a production/runtime/auth/schema or
  deployment boundary.

## Module Map

| Module | Responsibility | Dependencies | `risk_level` | `owner` |
| --- | --- | --- | --- | --- |
| `server/services/` | Reusable domain/application services for platform control, subscription rendering/access, edge handoff, CLI orchestration, channel analysis, redaction, network/local helpers, and related policies. | `server/state.mjs` composition/stores, configuration, route adapters, selected scripts and schemas. | B for focused repo-only behavior/tests; A for auth model, schema/migration, live runtime, quota activation, or production mutation. | `unassigned` |
| `server/routes/` | HTTP boundary for Admin auth/platform/subscriptions, User Portal, public leads, subscription delivery, data-plane agents, diagnostics, local proxy, network, status, and system proxy operations. | `server/app.mjs`, middleware, `server/services/`, state, authentication/rate-limit boundaries. | B for focused route/contract changes; A when changing auth, public exposure, schema, live subscription/runtime behavior, or production routing. | `unassigned` |
| `frontend` (tracked implementation is primarily `admin/`) | Shared Vite workspace for protected Admin, User Portal, company site, and install/static entrypoints. There is no tracked top-level `frontend/` directory at this head. | Safe backend DTOs/routes, `admin/src/` shared components/features, `admin/portal/`, `admin/site/`, build configs and verification scripts. | B for local UI/tests/builds; A for production static replacement, auth activation, provider/DNS change, or public Admin exposure. | `unassigned` |
| `runtime` (logical surface; no tracked top-level `runtime/`) | Protocol runtime capacity, local/production edge agents, protected handoff, configuration templates, runtime identity, Nginx/systemd/edge-node operational material, and runtime evidence producers. | `agent/`, `config/`, `ops/`, `schemas/`, `server/services/edge/`, `server/routes/data-plane-agent.mjs`, selected scripts and runbooks. | A for any live observation that accesses protected state, mutation, restart, config change, deploy, promotion, rollback, or provider action; repo-only fixtures/tests may be B. | `unassigned` |
| `scripts/` | Repository-local validation, artifact/runtime identity generation, traffic evidence, controlled previews, backup/restore helpers, project-state checks, precommit routing, and operator tooling. | `bin/gccgw.mjs`, server services/stores, schemas, package scripts, protected inputs supplied only under separate gates. | C for documentation-only references; B for repo-only script/checker changes with tests; A when a script is used against production/runtime/provider state. | `unassigned` |

## `server/services/` Submap

| Surface | Responsibility | Primary consumers |
| --- | --- | --- |
| `server/services/platform/` | Accounts, entitlements, orders/access requests, delivery, usage/quota, portal/auth support, control stores, and operator-safe summaries. | Admin, User Portal, CLI, data-plane handoff, subscription services. |
| `server/services/subscriptions/` | Subscription-specific access/rendering and lifecycle behavior. | Subscription routes, Portal delivery, CLI/platform workflows. |
| `server/services/edge/` | Control/data-plane agent contracts, desired state, material handoff, receipts, runtime evidence boundaries. | Data-plane agent route, production/local edge agents, platform workflows. |
| `server/services/cli/` | CLI application seams and safe operator-facing orchestration. | `bin/gccgw.mjs` commands and project/operator workflows. |
| root service modules | Channel evaluation, network/local proxy support, rendering, redaction, diagnostics, and shared utilities. | Routes, CLI, scripts, agents, tests. |

## `server/routes/` Boundary

`server/app.mjs` mounts the current route modules and applies allowlist,
session, authentication, rate-limit, and public/protected ordering. A route
file is an adapter, not a new domain owner. Business rules should remain in
services/stores, and protected routes must not be made public through mapping
or documentation changes.

## Frontend Boundary

The physical workspace name `admin/` does not mean every build is protected
Admin. Current source contains separate Admin, Portal, site, and install
entrypoints/build configurations in the same workspace. Maps and PRs must name
the actual `frontend_surface` when a static frontend changes.

## Runtime Boundary

Because no tracked top-level `runtime/` directory exists, `runtime` in project
maps is a logical impact surface, not a path glob. A task packet must name the
concrete repository paths and separately name the live target only after the
appropriate Risk A gate. Repository templates, schemas, scripts, and dated
records do not prove the current live configuration.

## Ownership Update Rule

Replace `unassigned` only when a reviewed repository record explicitly assigns
ownership. Git authorship, a currently running agent, an open PR author, or a
role name in `docs/MULTI_AGENT_OPERATING_MODEL.md` is not sufficient evidence
of durable human module ownership.
