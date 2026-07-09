# Backend Capability And Mutation Inventory

Last updated: 2026-06-19, Asia/Shanghai.

> Status:
> - Type: Repository inventory
> - Risk: C
> - Execution authority: Does not authorize runtime, production, AWS, Vultr,
>   Aliyun, DNS, Nginx, systemd, firewall, SQLite, tenant, artifact, payment,
>   deploy, rollback, secret, token, subscription URL, credential, or
>   customer-data actions
> - Production impact: None
> - Source of truth for: Repo-local route and CLI capability inventory only

## Purpose

This inventory closes the GCC-93/GCC-94/GCC-95 docs lane by mapping the current
backend facts for:

- mutation-capable Admin/API endpoints and their audit/redaction boundaries;
- the backend CLI capability registry exposed by `gccgw capabilities`;
- case/risk queue models that separate preview-only output from durable state.

It is intentionally docs-only. It reads the repository source and tests, and it
does not inspect production, cloud resources, runtime databases, logs, `.env`
files, or protected configuration.

## Source Files Reviewed

| Area | Source | Test evidence |
| --- | --- | --- |
| Express route mounting/auth boundary | `server/app.mjs` | route tests under `server/tests/*routes*.test.mjs` |
| Admin subscription mutations | `server/routes/admin-subscriptions.mjs` | `server/tests/admin-subscriptions.test.mjs` |
| Admin platform preview/durable routes | `server/routes/admin-platform.mjs` | `server/tests/admin-platform-issuance-api.test.mjs`, `server/tests/platform-access-routes.test.mjs` |
| Portal access/support queues | `server/routes/user-portal.mjs`, `server/services/platform/portal-access-requests.mjs`, `server/services/platform/portal-support-requests.mjs` | portal/platform route and service tests |
| Data-plane handoff queue | `server/services/edge/data-plane-handoff-queue.mjs` | edge handoff queue tests |
| Subscription issuance preview/plan/execute | `server/services/platform/subscription-issuance.mjs` | `server/tests/admin-platform-issuance-api.test.mjs` and CLI/platform tests |
| CLI capability registry | `server/services/cli/router.mjs` | `server/tests/cli-router.test.mjs` |

## Route Protection Baseline

`server/app.mjs` mounts `/api/admin` behind the Admin source-IP allowlist before
the app-level Bearer auth middleware. The same app wires `adminSubscriptionRoutes`
only when a subscription core/service is present, and wires `adminPlatformRoutes`
when platform services such as queues, control store, usage accounting, or
handoff queue are present.

User Portal public paths are added to the auth public path list only when portal
routes are enabled. Those routes still call portal session or human-challenge
services for session-scoped operations. This inventory treats public route
availability as a repository fact, not a production exposure claim.

## GCC-93: Mutation Endpoint Inventory

### Admin Subscription Runtime Mutations

These protected routes call subscription core/service methods and can mutate
runtime subscription state when backed by a durable repository:

| Endpoint | Handler call | Mutation class | Response boundary |
| --- | --- | --- | --- |
| `POST /api/admin/subscriptions` | `core.createTenant(...)` | creates a tenant and may return visible-once subscription material | internal errors collapse to `{ error: "internal_error" }`; test covers no secret echo on internal failure |
| `PATCH /api/admin/subscriptions/:id` | `core.renewTenant(...)` | renews tenant metadata | validation errors map to 400; missing tenant maps to 404 |
| `POST /api/admin/subscriptions/:id/renew` | `core.renewTenant(...)` | renews tenant metadata | same error mapping as above |
| `POST /api/admin/subscriptions/:id/node` | `core.setTenantNode(...)` | changes tenant node assignment | operator-only Admin route |
| `POST /api/admin/subscriptions/:id/disable` | `core.disableTenant(...)` | disables tenant | operator-only Admin route |
| `POST /api/admin/subscriptions/:id/enable` | `core.enableTenant(...)` | enables tenant | operator-only Admin route |
| `POST /api/admin/subscriptions/:id/reset-token` | `core.resetToken(...)` | rotates tenant token | can return visible-once subscription material |
| `POST /api/admin/subscriptions/:id/temp-link` | `core.createTempLink(...)` | creates temporary link | can return visible-once temporary link material |
| `POST /api/admin/subscriptions/:id/artifacts` | `core.createSubscriptionArtifact(...)` | creates opaque artifact | create response can include visible-once artifact URL |
| `POST /api/admin/subscription-artifacts/:id/revoke` | `core.revokeSubscriptionArtifact(...)` | revokes artifact | summary response |
| `POST /api/admin/subscription-artifacts/:id/rotate` | `core.rotateSubscriptionArtifact(...)` | rotates artifact | can return visible-once replacement artifact URL |

Read-only Admin subscription routes are `GET /api/admin/subscriptions`,
`GET /api/admin/subscriptions/:id`, `GET /api/admin/subscriptions/:id/artifacts`,
`GET /api/admin/nodes`, and `GET /api/admin/overview`.

### Admin Platform Preview/Report Routes

These protected platform routes use `POST` but are repository-local preview,
report, package, or template builders. Source and tests mark them as no runtime
mutation and no production mutation:

| Endpoint family | Boundary |
| --- | --- |
| `/api/admin/platform/channel-system-decision-flow` | builds decision evidence from dry-run, measurement, and runtime inventory summaries |
| `/api/admin/platform/channel-runtime-evidence-bridge` | bridges safe runtime evidence into readiness state |
| `/api/admin/platform/channel-runtime-gate-workbench` | builds operator gate review evidence |
| `/api/admin/platform/channel-runtime-execution-handoff` | builds execution handoff packet preview |
| `/api/admin/platform/channel-subscription-output-draft` | builds subscription-output draft review |
| `/api/admin/platform/channel-subscription-activation-*` | builds readiness, handoff, flow, record-template, and package artifacts |
| `/api/admin/platform/channel-lab-target-decision` | builds lab target decision output |
| `/api/admin/platform/clean-edge-readiness-summary` | builds readiness summary |
| `/api/admin/platform/provisioning-form/preview` | converts operator facts into safe issuance input preview |
| `/api/admin/platform/subscription-issuance/preview` | validates issuance input and returns a plan with `runtimeDbMutated: false` and `controlDbMutated: false` |

### Admin Platform Durable Mutations

These protected platform routes persist state or change durable queue records:

| Endpoint | Durable target | Runtime mutation boundary |
| --- | --- | --- |
| `POST /api/admin/platform/subscription-issuance/request` | control store account, entitlement, and planned issuance request | does not create runtime tenant or artifact; test asserts `runtimeDbMutated: false` and `controlDbMutated: true` |
| `POST /api/admin/platform/subscription-usage-monitor/collect` | usage accounting collector/store if configured | collector integration is explicit and returns 202 |
| `POST /api/admin/platform/data-plane-handoff-queue/:handoffRef/archive` | protected handoff queue files/archive | queue archive result reports `mutation: false` because it records queue bookkeeping, not data-plane apply |
| `POST /api/admin/platform/leads/:id/status` | lead review queue | updates lead status summary |
| `POST /api/admin/platform/leads/:id/account` | account shell and lead queue | creates account from lead and marks lead converted |
| `POST /api/admin/platform/accounts/:id/entitlements` | account entitlement shell | creates entitlement |
| `POST /api/admin/platform/accounts/:accountId/entitlements/:entitlementId/dynamic-entry` | access shell | stores grant summary while hiding dynamic entry, artifact refs, URLs, and secrets |
| `POST /api/admin/platform/portal-access-requests/:requestRef/reject` | portal access request store | marks request rejected |
| `POST /api/admin/platform/portal-access-requests/:requestRef/mark-delivered` | portal access request store; optional edge credential/lifecycle services when configured | marks delivered and may attach edge credential refs/material digests; raw material must not be returned |

Read-only durable-summary routes include platform clean-start, leads list,
accounts list, entitlements list, access grants list, portal access request
list, usage monitor, and data-plane handoff queue list.

The historical Aliyun gate packet and gate-evidence Admin APIs are retired from
the current backend surface. Their records remain historical documentation only
under the archive and production-replacement record indexes.

### Portal Case Routes

`server/routes/user-portal.mjs` provides user-facing case/order routes when
portal routes are enabled:

| Endpoint | Service call | Preview/durable model |
| --- | --- | --- |
| `POST /api/portal/access-requests` | `accessRequests.submitRequest(...)` | durable request submission; session-scoped to the portal account |
| `GET /api/portal/access-requests/current` | `accessRequests.listRequests(...)` | read-only durable summaries |
| `POST /api/portal/access-requests/refresh` | `accessRequests.refreshSubscription(...)` | lifecycle mutation path only if service implements it |
| `POST /api/portal/access-requests/disable` | `accessRequests.disableSubscription(...)` | lifecycle mutation path only if service implements it |
| `POST /api/portal/support-requests` | `supportRequests.submitRequest(...)` | durable in-memory support request summary in current service implementation |

Portal auth/security routes such as password session, second factor, TOTP
enrollment, and entry enrollment are auth-state operations. They are outside
the GCC-93 subscription/case inventory except that their errors also avoid
echoing internal details.

## GCC-94: Backend Capability Registry Inventory

The backend capability registry is not a database. It is built in
`server/services/cli/router.mjs` by:

1. composing `SPECIAL_COMMAND_ENTRIES`, `NODE_SCRIPT_COMMAND_ENTRIES`, and
   `PACKAGE_SCRIPT_COMMAND_ENTRIES` into the flat `gccgw commands` map;
2. grouping commands through `CAPABILITY_GROUPS`;
3. calculating each group's `highestRiskTier` from command risk tiers;
4. returning either text or JSON from `buildCliCapabilityRegistry(...)`.

`gccgw capabilities --json` returns:

```text
type: gccgw_capability_registry
generatedBy: gccgw capabilities
redacted: true
capabilities: grouped command summaries
```

The test `server/tests/cli-router.test.mjs` asserts that the registry includes
at least `install`, `node`, and `subscription`, that `subscription` has highest
risk tier `A`, that it includes execution-gated subscription commands, and that
the JSON does not contain subscription URLs, tokens, secrets, or passwords.

Current registry groups:

| Capability id | Purpose | Risk source |
| --- | --- | --- |
| `project` | repository verification, navigation, docs, environment checks | mostly C, verification commands can raise the group |
| `install` | host bootstrap planning, preflight, configure, execution | includes A-tier execution-gated bootstrap |
| `node` | node inspection, validation, registration/disable planning, edge credential operations | includes A-tier edge apply/bootstrap commands |
| `package` | inspect/import/apply production input packages | includes A-tier package apply |
| `subscription` | prepare, issue, hand off, revoke subscription and portal-entry materials | includes A-tier issuance/portal-entry execution commands |
| `channel` | validate, measure, decide, package, and record channel runtime evidence | mostly C/B repo evidence; runtime activation remains separate Risk A outside the registry output |
| `config` | redacted local configuration profiles | C |
| `site-admin` | site/Admin build and tests | B |
| `operations` | ops, backup, release inspection | C unless future commands are added |

The registry is an operator navigation surface. It does not grant approval,
execute production actions, or lower the risk tier of any command.

## GCC-95: Preview Vs Durable Queue Model

### Preview-Only Model

Preview-only routes and services validate input, derive safe summaries, and
return next-action guidance. They must not write runtime DB, control DB,
production config, subscription output, data-plane runtime, or approval state.

Concrete source facts:

- `previewSubscriptionIssuance(...)` validates input and returns
  `runtimeDbMutated: false`, `controlDbMutated: false`, and no raw URL.
- `portalAccessRequests.previewApproval(...)` returns mode
  `portal-access-request-approval-preview` with `previewOnly: true`,
  `noRuntimeMutation: true`, and `requiresSeparateIssuanceExecution: true`.
- Channel decision/bridge/workbench/handoff/draft/package route tests assert
  no runtime mutation, no approval submission, no traffic movement, and redacted
  output.

### Durable Intent Model

Durable intent routes persist reviewed business facts without directly applying
runtime changes:

- `planSubscriptionIssuance(...)` writes account, entitlement, and planned
  issuance request rows in the control store, requires an approval reference,
  and intentionally leaves runtime tenant/artifact creation to a separate
  fulfillment path.
- Portal access requests persist request state through submit, reject, and
  mark-delivered operations. The summary includes safety flags that distinguish
  raw handoff material from safe refs/digests.
- Lead/account/entitlement/access-grant routes persist operator-facing business
  shell records and return redacted summaries.
- Handoff queue archive persists queue bookkeeping and archive files; it does
  not claim that the remote data plane was applied.

### Runtime Execution Model

Runtime execution exists in backend services and CLI paths but should not be
confused with preview/durable intent:

- `executeSubscriptionIssuance(...)` creates runtime tenant/artifact through
  `runtimeCore`, finalizes control-store records, and separates raw
  `handoffMaterial` from safe `summary`. Its comments explicitly state that
  `handoffMaterial` contains raw secrets and must not leak to public API
  responses.
- Portal `markDelivered(...)` can attach edge credential refs/material digests
  and notify lifecycle/desired-state services when those services are
  configured. That is not the same as data-plane apply receipt validation.
- Edge/data-plane apply remains governed by separate Risk A runbooks and
  receipt-gated validation, not by this inventory document.

## Risk And Follow-Up Notes

Known facts:

- Admin subscription routes contain real mutation endpoints.
- Admin platform routes mix preview/report endpoints with durable business
  state changes; `POST` alone is not a reliable mutation signal.
- `gccgw capabilities` is a redacted CLI-derived registry, not an approval
  plane.
- Preview-only models are covered by tests that check no mutation and no secret
  echo for representative routes.

Risks:

- Visible-once Admin subscription responses can contain subscription material;
  these endpoints must stay protected by Admin allowlist, Bearer auth, and
  operator process controls.
- The codebase has both control-store durable intent and runtime execution
  services; future UI/API work can regress if it treats previews as completion
  evidence.
- Some platform services can be in-memory depending on wiring; production
  claims require live configuration verification under a separate gate.

Next actions:

- Keep route docs and Admin UI labels explicit about preview-only versus
  durable mutation.
- Before adding new protected Admin routes, classify them as preview-only,
  durable intent, or runtime execution and add tests for mutation/redaction
  boundaries.
- Before any production/runtime use, follow the relevant Risk A runbook with
  read-only inventory, dry-run, approval, validation, and rollback plan.
