# Admin Console Safe-Read DTO Registry

Last updated: 2026-06-29, America/Los_Angeles.

> Status:
> - Type: Phase 2 frontend/backend interface registry
> - Risk: C
> - Production impact: None
> - Execution authority: Does not authorize production, AWS, Vultr, Aliyun,
>   DNS, Nginx, systemd, firewall, database migration, runtime mutation,
>   deploy, rollback, auth model change, token, credential, subscription URL,
>   raw config/log/env, SQLite row, or customer-data action

This registry is the bridge between the Admin Console visual baseline, the
frontend safe-read model, and existing backend capabilities. It answers:

1. Which Admin UI surface owns each query.
2. Which safe DTO family should feed that surface.
3. Which backend route, service, or table already exists.
4. Which gap needs a follow-up Linear task before real data wiring.

It is intentionally not a mutation spec. The current three Admin pages are
safe-read operator surfaces: they summarize, query, route, and show bounded
evidence. Detailed user CRUD, order CRUD, node logs, node health, bandwidth,
user access logs, operator logs, and audit exports belong to dedicated feature
pages or query endpoints.

## Evidence Baseline

| Area | Current evidence | Status for Admin Phase 2 |
| --- | --- | --- |
| Admin subscriptions | `server/routes/admin-subscriptions.mjs` exposes subscription list/read/create/update, renew, node assignment, disable/enable, token reset, temp-link, artifact, node list, and overview routes. | Existing admin route family, but not yet normalized into the new safe-read page registry. Mutation routes stay outside Phase 2 UI wiring. |
| Platform accounts and entitlements | `server/routes/admin-platform.mjs` exposes account list, account entitlement creation/listing, entitlement list, dynamic entry creation, and access grants. `subscription-control-db.mjs` has account, entitlement, quota, usage, issuance, link, revocation, and audit tables. | Existing control-plane data. User Management now has a frontend safe-read DTO adapter and App-level read-only binding to protected account, entitlement, and account-level usage summary inputs. |
| Portal access requests and orders | `server/routes/admin-platform.mjs` exposes portal access request list, reject, approve-preview, traffic-limit, and mark-delivered routes. Portal user routes expose request create/current/refresh/disable for user-facing flows. | Current Accounts & Resources source. Admin UI should display safe order/resource summaries, not raw subscription material. |
| Usage accounting | `server/routes/admin-platform.mjs` exposes subscription usage monitor and collect routes. `subscription-control-db.mjs` has usage samples and rollups plus quota counters. | Existing monitoring source. User Management may consume only account-level order/usage aggregates from the monitor; detailed usage ledger, collection freshness, channel coverage, and anomaly views remain Usage & Channels follow-up work. |
| Node and agent state | `admin-subscriptions` has `/api/admin/nodes`; `subscription-control-db.mjs` has edge registered nodes, apply receipts, desired-state notifications, and agent leases. | Source exists in pieces. Dedicated node health, bandwidth, receipt, and log query endpoints remain follow-up work. |
| Audit and history | `subscription-control-db.mjs` has revocation and audit events; subscription repository has subscription audit events; portal sessions and credential tables exist. | Source exists, but normal Admin UI must not expose raw audit payloads or raw logs. Safe history and log surfaces need separate gated DTOs. |
| Payments and billing callbacks | No reviewed Phase 2 Admin safe-read endpoint or mutation contract is active for payment provider webhooks. | System Settings may reserve a payment webhook configuration surface later, but real callback URL management, signing secret handling, event replay, idempotency, provider verification, and billing-state mutation are A-tier follow-up work. |

## Registry Rules

1. UI-visible DTOs return safe summaries only.
2. Raw route responses must not be passed straight into React page state.
3. Forbidden data includes tokens, credentials, subscription URLs, raw config,
   raw logs, env values, runtime material, SQLite rows, provider internals, and
   customer-private contact data.
4. Every UI surface must declare an owner page, DTO family, source evidence,
   route target, query model, current status, and Linear owner task.
5. System Search is discovery only. It may index safe manifest/search
   documents and typed safe object documents (`type`, safe id, business area,
   owner page, route target, status), but it must not restore AppLibrary,
   NavigationLibrary, hidden modules, or raw backend payloads.
6. Current page chips and cards are not the feature implementation. They route
   to the feature owner or show bounded evidence.
7. Mutation actions are deferred to a separate capability and dry-run gate
   contract. Read-only DTO work remains B or C; auth, schema, production,
   runtime, retention, raw log, or audit export changes are A-tier.
8. The customer User Portal is a separate product surface. Admin Console must
   not render, launch, deep-link, or restore the user-facing portal. System
   Settings is reserved for future private configuration work such as payment
   API or billing callback rotation, and those changes require A-tier gates.

## Status Taxonomy

| Status | Meaning | Allowed next action |
| --- | --- | --- |
| `ready-for-fixture` | Page ownership, route target, and safe fields are known. | Use synthetic fixture projection and UI tests. |
| `endpoint-exists-needs-dto` | Backend route exists, but response shape is not yet the canonical safe-read DTO. | Add adapter tests and a normalizer before UI binding. |
| `safe-dto-adapter-ready` | Backend source shape and frontend safe-read normalizer exist, with tests proving redaction and UI row/detail mapping. | Bind the read-only query hook or page-owned endpoint; keep mutation and privileged detail gates disabled. |
| `read-only-bound` | Protected read-only source is loaded by the Admin app and passed through a tested safe-read adapter before rendering. | Add query state, filters, pagination, and backend-safe DTO refinements; do not expose mutation controls or privileged detail. |
| `source-exists-no-endpoint` | Tables or service methods exist, but no Admin safe query endpoint exists. | Create a read-only endpoint design and contract tests. |
| `route-shell-only` | Figma route frame, navigation entry, manifest entry, System Search discovery, and generic safe-read renderer exist, but feature-specific components and DTO/API adapters are still missing. | Keep the route read-only; add component and DTO contracts before replacing the generic renderer. |
| `query-page-needed` | This is a real feature page, not a summary card. | Create route, table/query state, pagination, and safe DTO task. |
| `privileged-gated` | Data requires super-admin, fresh MFA, reason code, or audit approval. | Keep out of normal search and normal Admin payloads. |
| `deferred` | Not needed for current Phase 2. | Keep visible only as planned route, if approved by IA. |

## Page And DTO Registry

2026-06-27 local manifest sync: the seven Figma feature frames are no longer
planned placeholders. They are active safe-read route shells in local
navigation, manifest, and System Search discovery. That does not make them
feature-complete: each still needs page-specific components, query state,
pagination/table behavior, safe DTO projection, backend adapter tests, and
browser visual QA before replacing the generic safe-read renderer. Raw log,
token, credential, subscription URL, runtime config, SQLite row, and
customer-private material remain forbidden.

| UI surface | Route scope | DTO family | Existing source evidence | Current status | Linear owner |
| --- | --- | --- | --- | --- | --- |
| Operations Overview | `/admin/operations` | `operationsOverviewSummary` | `/api/admin/overview`, usage monitor summaries, portal request summaries | `ready-for-fixture`; aggregate and route only | GCC-127 |
| Operations Risk Queue | `/admin/operations#risk-queue` | `operationsOverviewSummary.riskQueue` | Portal access requests, usage monitor anomaly candidates, lifecycle summary | `endpoint-exists-needs-dto`; route to owning page | GCC-127 |
| Operations Next Actions | `/admin/operations#next-actions` | `operationsOverviewSummary.nextActions` | Page ownership model in `navigation.ts` and safe summary sources | `ready-for-fixture`; no mutation actions | GCC-127 |
| System Search | TopBar global search | `systemSearchSafeDocument` | `admin/src/app/admin-search-index.ts`, manifest/page registry, typed safe object fixture documents | `route-shell-only`; searches safe manifest, page, active route shell, and typed safe object documents only; no AppLibrary/NavigationLibrary restore; live DTO binding pending | GCC-124 |
| Account Directory | `/admin/accounts#account-overview` | `accountManagementSummary` | `/api/admin/platform/accounts`, `platform_accounts`, `getAccountControlSummary` | `endpoint-exists-needs-dto`; account CRUD page not complete | GCC-126, GCC-131 |
| User Management page | `/admin/user-management` | `accountManagementSummary.detail` | `platform_accounts`, portal sessions, account entitlements, subscription usage monitor aggregates | `frontend-safe-read-complete`; `App.tsx` loads `/api/admin/platform/accounts`, `/api/admin/platform/entitlements`, and `/api/admin/platform/subscription-usage-monitor` through the protected Admin API client, then `admin-user-management-safe-read.ts` maps summaries into redacted table/detail rows. Usage monitor data is reduced to account-level Orders, Usage, Quota, Upload/Download, Collection, Last Usage, Warnings, Current Subscription, and Subscription Window fields only; order ids, tenant refs, node ids, channel refs, credential refs, URLs, tokens, raw logs, raw config, and SQLite rows must not render. Search plus Status/Risk/Plan filters run only on safe fields. The page header owns the Create User gated entry; the selected-account detail card owns only compact Edit/Disable/Delete frontend dry-run buttons and a locked submit shell. Read remains safe-read only, Create remains locked, and real mutations still require permission, audit, approval, backend validation, and retention review before any execution. Created Time filtering and backend pagination remain follow-up work. Backend raw account summaries must not bypass this adapter. | GCC-131 |
| Resources & Orders | `/admin/accounts#resource-orders` | `orderManagementSummary` | `/api/admin/platform/portal-access-requests`, issuance requests, issued links, subscription tenant repository | `endpoint-exists-needs-dto`; safe refs only | GCC-126, GCC-132 |
| Order Records page | `/admin/order-management` | `orderManagementSummary.detail` | Portal access requests, payment orders, issued links, subscription tenants, audit events, account-level usage aggregates | `frontend-safe-read-complete`; `admin-safe-read-page.tsx` renders the page as a read-only billing/order record lookup surface with safe filters, table pagination, compact detail card, payment channel/provider reference fields, and explicit reconciliation warnings. The detail card does not expose lifecycle, refund, quota-edit, delivery, or subscription mutation controls. Account entitlement days, plan tier, traffic tier, and subscription-count ownership remain on User Management/account models; Order Records is ledger/query only. | GCC-132, GCC-138 |
| Quota & Usage | `/admin/accounts#quota-usage` | `orderQuotaUsageSummary` | Traffic-limit route, usage rollups, usage samples, quota counters | `endpoint-exists-needs-dto`; URL stays on the Accounts owner page until a dedicated query page is approved | GCC-126, GCC-132 |
| Lifecycle | `/admin/accounts#lifecycle` | `orderLifecycleSummary` | Subscription disable/enable/renew routes, portal refresh/disable, revocation events | `source-exists-no-endpoint`; mutation controls deferred | GCC-132 |
| History & Events | `/admin/accounts#history-events` | `objectHistorySummary` | Platform audit events, revocation events, subscription audit events, portal request event metadata | `source-exists-no-endpoint`; URL stays on the Accounts owner page until a dedicated query page is approved; raw audit/log output forbidden | GCC-134 |
| Collection Freshness | `/admin/usage#freshness` | `collectionFreshnessSummary` | Usage monitor, usage samples/rollups, generated timestamps | `endpoint-exists-needs-dto`; chart axis and stale states required | GCC-125 |
| Channel Coverage | `/admin/usage#channel-coverage` | `channelHealthSummary` | Usage monitor channel counts, edge registered nodes, desired-state receipts | `source-exists-no-endpoint`; missing-channel states must be explicit | GCC-125, GCC-133 |
| Usage Ledger | `/admin/usage#usage-ledger` | `usageLedgerSummary` | Usage samples, usage rollups, request/order refs | `endpoint-exists-needs-dto`; table query state required | GCC-125 |
| Receipts & Collectors | `/admin/usage#receipts-collectors` | `collectorReceiptSummary` | Edge apply receipts, desired-state notifications, agent leases | `source-exists-no-endpoint`; no raw agent logs | GCC-125, GCC-133 |
| Collection Anomalies | `/admin/usage#collection-anomalies` | `collectionAnomalySummary` | Usage monitor anomaly rules, quota and lifecycle states, receipts | `source-exists-no-endpoint`; route candidates only | GCC-125 |
| User Access Logs | `/admin/user-access-logs` | `userAccessLogSummary` | Portal sessions, second-factor challenges, portal entries | `route-shell-only`; access-log toolbar, severity filters, table, redacted detail, and pagination not yet implemented | GCC-134 |
| User Operation Logs | `/admin/user-operation-logs` | `operatorLogSummary` | Platform audit events and future operator action records | `route-shell-only`; operation filters, safe audit table, redacted detail, export gate, and pagination not yet implemented | GCC-134 |
| Node Health | `/admin/node-health` | `nodeHealthSummary` | `/api/admin/nodes`, edge registered nodes, agent leases | `route-shell-only`; node metrics, health table, heartbeat panel, diagnostic preview, and safe DTO adapter not yet implemented | GCC-133 |
| Node Logs | `/admin/node-logs` | `nodeLogSessionSummary` | No normal Admin raw log endpoint; agent/receipt metadata exists | `route-shell-only`; safe metadata search may route here, but raw logs remain privileged-gated and are not normal payloads | GCC-134 |
| Node Bandwidth | `/admin/node-bandwidth` | `nodeBandwidthSummary` | Usage samples/rollups and channel refs | `route-shell-only`; bandwidth metric row, trend chart, channel breakdown table, activity log, and safe aggregation endpoint not yet implemented | GCC-133 |
| Payment Webhook Settings | `/admin/system-settings#payment-webhooks` | `paymentWebhookConfigurationSummary` | No active Phase 2 Admin endpoint; future billing provider callback, event, and ledger services need separate design | `deferred`; System Settings remains reserved. Webhook callback URL editing, signing secret storage, provider event verification, replay, idempotency, billing entitlement mutation, and audit export require A-tier spec, dry-run, approval, validation, and rollback gates before implementation | GCC-130 |
| Mutation/Dry-run Gates | Separate action surface | `adminActionPreviewSummary` | Existing mutation routes, no unified action contract | `deferred`; requires capability, dry-run, and approval rules | GCC-130 |

## Query Model Requirements

All table-like or long-list surfaces should align with the current frontend
model:

- `admin/src/app/admin-safe-read-projection.ts`
- `admin/src/app/admin-safe-read-page-model.ts`
- `admin/src/app/admin-table-query-state.ts`

Minimum query fields:

| Field | Rule |
| --- | --- |
| `page` | One of `dashboard`, `portalRequests`, `usageMonitor`, or an approved future child page. |
| `navId` | Must map to a page-owned section. Legacy or disabled section routes are not canonical. |
| `routeScope` | Must stay inside safe Admin routes and anchors. |
| `pagination` | Required for account, order, usage ledger, receipt, node, and log lists. |
| `filters` | Allow only safe keys such as `state`, `tone`, `owner`, and `route` until a feature-specific contract exists. |
| `sort` | Allow only safe summary fields such as `updatedAt`, `state`, and `safeRef` until a feature-specific contract exists. |
| `mutationPolicy` | Must be `read-only-no-mutation` for Phase 2 safe-read work. |

## Implementation Order

| Order | Task | Purpose |
| --- | --- | --- |
| 1 | GCC-135 | Freeze this DTO registry and route ownership table with the route-shell/component-gap boundary. |
| 2 | GCC-124 | Keep System Search as safe discovery over active route shells and typed safe documents; no AppLibrary/NavigationLibrary restore. |
| 3 | GCC-128 | Normalize safe fixture/projection DTOs for current owner pages and route shells. |
| 4 | GCC-129 | Add shared table, pagination, filter, and query-state primitives used by route shells. |
| 5 | GCC-131 | User Management page-specific query UI, safe DTO adapter, account-level usage/subscription projection, header-owned Create gate, and compact selected-account Edit/Disable/Delete frontend dry-run shells are complete for the frontend safe-read phase; Create and all mutation submits remain backend-gated. |
| 6 | GCC-132 | Replace the generic order renderer with the Order Records query UI and safe DTO adapter; keep it ledger/query only, with account entitlement ownership on User Management/account models. |
| 7 | GCC-126 | Wire Accounts & Resources subpage ownership without raw backend payloads. |
| 8 | GCC-125 | Wire Usage & Channels safe query surfaces. |
| 9 | GCC-133 | Replace Node Health and Node Bandwidth generic renderers with page-specific query UI and safe DTO adapters. |
| 10 | GCC-134 | Replace User Access Logs, User Operation Logs, and Node Logs generic renderers with redacted query UI and privilege gates. |
| 11 | GCC-127 | Keep Operations Overview as summary and route owner only. |
| 12 | GCC-130 | Design mutation/dry-run/capability gates after safe-read surfaces are stable. |

## Validation

Docs-only registry changes require:

```powershell
git diff --check
```

Future frontend implementation work should use the Admin validation baseline:

```powershell
npm run admin:test
npm run admin:build
npm test
```

Backend safe-read DTO work should add targeted server tests for redaction,
state taxonomy, forbidden patterns, and missing-source behavior before wiring
React adapters to live routes.
