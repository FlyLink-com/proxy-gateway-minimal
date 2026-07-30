# Admin Backend DTO Contract

Last updated: 2026-06-21, Asia/Shanghai.

> Status:
> - Type: GCC-101 / GCC-112 backend contract design.
> - Risk: C while this remains docs-only.
> - Production impact: None.
> - Execution authority: Does not authorize production, AWS, Vultr, DNS,
>   Nginx, systemd, DB, runtime, auth model, schema/migration, token,
>   credential, subscription URL, raw config/log/env, raw log, audit export,
>   SQLite row, or customer-data actions.

## Source-Reality Addendum (2026-07-30)

The statement below that this is not an implemented API applies to the proposed
DTO family as a whole; it must no longer be read as saying that every safe
Admin/Operations read capability is absent.

Source now contains, among other foundations:

- Admin authentication/session routes and services;
- manifest-backed safe-read projection, page, query, and owner models;
- a protected traffic collector Admin projection;
- Portal Wallet projection and Ledger reads;
- Portal Coins Commerce catalog, quote, and account-owned order reads.

The exact matrix is `docs/OPERATIONS_PLANE_SOURCE_REALITY.md`. Each DTO family
must be classified as `implemented_source`, `partial`,
`fixture_or_static_only`, `document_only`, or `missing` before a new
backend slice is opened. Similar frontend fields are not evidence that the
named backend DTO exists.

This document turns the Admin console UI work into a backend DTO contract plan.
It is not an implemented API, migration plan, auth model change, retention
policy change, or production execution gate.

Use it after:

- `docs/ADMIN_CONSOLE_RELATIONSHIP_DRAFT.md`
- `docs/ADMIN_CONSOLE_FRONTEND_STRUCTURE_BLUEPRINT.md`
- `docs/ADMIN_CONSOLE_COMPONENT_FUNCTION_BLUEPRINT.md`

Use it before:

- wiring live Admin read-only endpoints;
- adding backend contract tests for Admin summary responses;
- promoting Key Management, Audit Center, or Log Access fixtures;
- splitting User Management or Order Management into separate pages.

## Contract Principles

1. UI-visible DTOs return safe summaries, not runtime material.
2. DTOs must preserve ownership boundaries: Overview routes, Accounts &
   Resources decides user/order/quota/lifecycle, Usage & Channels owns
   monitoring evidence, privileged surfaces stay gated.
3. Absence is explicit. Unknown, stale, not collected, zero usage, forbidden,
   and disconnected are different states.
4. Registration-time privilege gating is mandatory. Privileged data must not be
   hidden in normal responses, search payloads, notifications, fixture data, or
   client-side caches.
5. Backend implementation remains B only for read-only summaries over existing
   safe data. It becomes A if auth, schema/migration, retention, runtime
   inspection, raw logs, audit durability, production data, or provider actions
   are changed.

## Common Response Envelope

Future Admin summary endpoints should share a small envelope shape so frontend
adapters can handle loading, stale, partial, and forbidden states consistently.

| Field | Purpose | Rule |
| --- | --- | --- |
| `schemaVersion` | Versioned contract identifier. | Required; reject unsupported versions fail-closed. |
| `generatedAt` | Server-side generation time. | Required for all read-only summaries. |
| `freshness` | `fresh`, `stale`, `partial`, `unknown`, `disconnected`. | Required when the DTO represents monitoring evidence. |
| `data` | DTO-specific safe summary payload. | Must contain only authorized fields. |
| `warnings` | Safe warnings for stale/partial data. | No raw error messages, paths, SQL, config, tokens, or endpoints. |
| `access` | Authorization decision metadata. | Safe reason codes only; no policy internals or privileged facts. |

Forbidden envelope behavior:

- echoing internal exception messages;
- embedding raw rows, raw logs, raw config, raw env, subscription URLs, tokens,
  keys, passwords, credentials, customer-private contact data, or SQLite values;
- returning privileged child payloads as `null` fields inside normal DTOs;
- returning search, notification, or command links for unregistered privileged
  apps.

## Safe Reference Rules

All object identifiers shown in Admin UI must be safe references.

| Object | Safe ref examples | Forbidden |
| --- | --- | --- |
| Account/user | `acct_safe_*`, `user_safe_*` | Email, phone, full name, customer-private contact fields. |
| Order/resource | `ord_safe_*`, `resource_safe_*` | Raw subscription URL, token, runtime credential, payment data. |
| Channel/route | `channel_safe_*`, `route_safe_*` | Runtime endpoint, node credential, raw provider config. |
| Agent/node | `agent_safe_*`, `node_safe_*` | SSH host detail, raw agent log, env path, protected listener secret. |
| Artifact | `artifact_safe_*` | One-time URL, bearer token, artifact secret, YAML content. |
| Audit/log | `audit_ref_*`, `log_session_*` | Raw audit payload, raw log lines outside approved ephemeral session. |

Safe refs may be stable enough for drilldown, but they must not be reversible
into protected runtime material by the frontend.

## DTO Families

### `operationsOverviewSummary`

Purpose: route operators to the owning page.

Privilege: all authorized Admin users.

Fields:

- `healthState`: platform summary state.
- `riskCandidates`: bounded counts and safe candidate refs.
- `collectionFreshness`: compact state and age bucket.
- `channelCoverage`: aggregate coverage and blocker counts.
- `inspectionSummary`: latest safe check state and failed/stale counts.
- `nextActions`: route targets only.

Must not include account/order ledgers, raw audit rows, raw logs, runtime apply
controls, or privileged app links.

### `channelHealthSummary`

Purpose: back `Usage & Channels -> Channel Coverage`.

Privilege: all authorized Admin users.

Fields:

- `channelRef`;
- `state`: `healthy`, `degraded`, `blocked`, `unknown`;
- `issuedOrderCount`;
- `measuredOrderCount`;
- `utilizationPct`;
- `errorRatePct`;
- `receiptState`: `healthy`, `pending`, `missing`, `delayed`;
- `lastMeasuredAt` or safe relative age;
- `blockers`: bounded safe reason codes.

Backend gap: first-class channel rollup and error-rate source.

### `routeLatencySummary`

Purpose: back route latency evidence under Platform Monitoring.

Privilege: all authorized Admin users.

Fields:

- `routeRef`;
- `sourceRef`;
- `targetRef`;
- `routeType`: `primary`, `fallback`, `recovery`;
- `p50Ms`;
- `p95Ms`;
- `p99Ms`;
- `sampleCount`;
- `state`: `fresh`, `stale`, `no_sample`, `unknown`;
- `measuredAt` or safe relative age.

Backend gap: route latency summary source. Runtime measurement changes remain A
if they alter data-plane behavior or production inspection scheduling.

### `agentStatusSummary`

Purpose: back `Receipts & Collectors -> Agent Status`.

Privilege: all authorized Admin users.

Fields:

- `agentRef`;
- `nodeRef`;
- `version`;
- `heartbeatState` and safe relative age;
- `desiredStatePullState`: `current`, `delayed`, `unavailable`;
- `receiptPushState`: `ready`, `pending`, `unavailable`;
- `collectorState`: `ready`, `delayed`, `disabled`, `unknown`;
- `blockers`: bounded safe reason codes.

Must not include raw agent logs, runtime config, SSH facts, file paths, env
values, or protected material refs beyond safe refs.

### `inspectionRunSummary`

Purpose: back inspection summaries under Platform Monitoring and compact
Overview signals.

Privilege: all authorized Admin users for summary state only.

Fields:

- `checkName`;
- `latestResult`: `pass`, `warning`, `blocked`, `unknown`;
- `durationMs`;
- `nextRunAt` or safe relative label;
- `ownerObjectRef`;
- `failedCount`;
- `staleCount`;
- `summaryReasonCodes`.

Must not expose raw logs, command output, host output, audit payloads, or
provider-specific runtime details.

### `userManagementSummary`

Purpose: back account/user supervision inside `Accounts & Resources`.

Privilege: Admin where the operator is allowed to supervise users.

Fields:

- `userRef` or `accountRef`;
- `state`: `enabled`, `disabled`, `pending`, `review_required`;
- `orderCount`;
- `activeOrderCount`;
- `totalUsage`;
- `quotaState`;
- `riskState`;
- `lastSafeEvent`.

Must not include customer-private contact fields unless a separate privacy
contract allows them.

### `orderManagementSummary`

Purpose: back resources/orders, quota, lifecycle, and per-order usage.

Privilege: Admin where the operator is allowed to supervise orders.

Fields:

- `orderRef`;
- `userRef`;
- `state`: `pending`, `active`, `paused`, `expired`, `revoked`,
  `archive_candidate`;
- `trafficUsed`;
- `quotaLimit`;
- `artifactSafeRefs`;
- `channelRefs`;
- `receiptState`;
- `lifecycleReasonCodes`.

Must not include raw subscription URLs, artifact secrets, rendered YAML,
runtime credentials, payment data, or quota mutation controls without a
separate action contract.

### `operatorAccountSummary`

Purpose: back scoped account and permission visibility.

Privilege: current operator; expanded role summary requires Admin or super
admin capability.

Fields:

- `operatorRef`;
- `role`;
- `mfaState`;
- `visibleApps`;
- `visibleScopes`;
- `sessionFreshness`;

Must not leak privileged app existence to non-super-admin contexts through
search, command results, notifications, or hidden DOM payloads.

### `aboutBuildInfo`

Purpose: back a future safe About/system info surface.

Privilege: all authorized Admin users.

Fields:

- frontend version/build id;
- backend version/build id;
- build time or release time;
- development phase;
- changelog summary;
- compatibility notes.

Must not include hostnames, provider account IDs, internal paths, deployment
secrets, env names with values, or runtime topology beyond approved safe
labels.

## Privileged DTOs

Privileged DTOs are not registered for normal operators or normal Admin users.

### `keyInventoryMetadataSummary`

Privilege: super admin entry; detail requires fresh MFA.

Allowed metadata:

- `keyRef`;
- `kind`;
- `scope`;
- `ownerRef`;
- `createdAt`;
- `expiresAt`;
- `rotationState`;
- `lastUsedAt`;
- `auditSummaryRef`.

Forbidden: raw key value, private key, token, password, seed, recovery code,
credential material, runtime config, export/download action, edit action, or
rotation execution without a separate A-tier gate.

### `auditSummary`

Privilege: super admin; detail requires policy-specific approval.

Allowed summary:

- category counts;
- `auditRef`;
- actor safe ref;
- object safe ref;
- action label;
- result state;
- occurred time.

Forbidden: raw audit payloads in normal Admin responses, customer data dumps,
secret snapshots, raw request/response bodies, or hidden normal-operator access.

### `ephemeralLogViewSession`

Privilege: super admin plus fresh MFA, reason code, TTL, and durable audit
summary.

Required behavior:

- one-time session ref;
- explicit reason code;
- short TTL;
- read-once burn state;
- redacted excerpt only;
- no normal search, cache, localStorage, fixture, or download surface.

Forbidden: raw log access for non-super-admin users, persistent frontend log
storage, unbounded search, raw config/env output, or bypassing audit summary
creation.

## Error And Empty States

Admin DTO adapters must distinguish:

- `loading`;
- `empty`;
- `unauthorized`;
- `forbidden`;
- `mfa_required`;
- `reason_required`;
- `stale`;
- `partial`;
- `disconnected`;
- `backend_invalid_json`;
- `network_timeout`;
- `collector_disabled`;
- `not_collected`;
- `zero_usage`;
- `receipt_missing`;
- `receipt_delayed`.

`0 B` usage means only real measured zero usage when the DTO explicitly says so.
It must not stand in for not collected, stale, disconnected, collector disabled,
or missing receipt states.

## Redaction Test Matrix

Future implementation PRs should add contract tests before UI integration.

| Test | Expected result |
| --- | --- |
| Normal operator fetches overview/monitoring summaries. | Response contains safe summaries and no privileged data. |
| Normal operator tries Key/Audit/Log DTO. | 404 or forbidden with safe reason code; no hidden payload. |
| Admin fetches user/order summaries. | Safe refs and counts only; no customer-private contact data unless separately approved. |
| Super admin without fresh MFA fetches privileged detail. | `mfa_required`; no metadata detail payload. |
| Super admin with fresh MFA requests ephemeral log session. | Bounded redacted one-time session only. |
| Secret-shaped strings appear in source data. | Response redacts or rejects; tests assert forbidden patterns absent. |
| Runtime collector unavailable. | DTO returns explicit stale/partial/disconnected state, not fake production data. |
| `0 B` usage is reported. | DTO includes measured-zero state, not just a numeric value. |

Forbidden-pattern tests should cover:

- URL-bearing subscription links;
- bearer/query tokens;
- password/private-key/seed/recovery-code terms;
- raw YAML/profile output;
- raw config/log/env content;
- SQLite row dumps;
- customer-private contact payloads;
- provider account or host internals not explicitly safe-listed.

## Implementation Gate

Recommended next sequence:

1. Keep this document as C-tier design authority.
2. Add read-only DTO normalization tests over synthetic fixtures.
3. Implement non-privileged read-only summaries first: overview, channel
   health, route latency, agent status, inspection summaries.
4. Connect Admin UI adapters only after tests prove redaction, state taxonomy,
   and privilege absence.
5. Treat schema/migration/auth/retention/runtime/log/audit changes as A-tier
   work with a separate runbook and operator approval.
