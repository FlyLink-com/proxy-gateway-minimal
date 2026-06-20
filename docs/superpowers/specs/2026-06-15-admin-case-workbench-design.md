# Admin Case Workbench Design

Last updated: 2026-06-15, America/Los_Angeles.

> Status:
> - Linear: GCC-50, GCC-51, GCC-52
> - Risk: C for this design document; follow-up frontend work is B; durable
>   backend history, schema/migration, production data backfill, or production
>   lifecycle automation is B/A or A depending on scope
> - Production impact: None
> - Execution authority: This document does not authorize production, AWS,
>   Vultr, DNS, Nginx, systemd, DB schema, runtime, token, credential,
>   subscription URL, customer-data, deploy, rollback, or lifecycle mutation
>   actions

## Goal

Add a Linear-like supervision workbench model to the protected Admin surface so
users, resources, orders, subscription artifacts, channels, usage facts, and
lifecycle events can be tracked over time.

The Admin surface remains a supervision console. It visualizes backend facts,
groups anomalies, records safe review state, and shows object history. It is
not a customer portal, not a casual subscription-creation panel, and not a
production execution console.

## Current Design Decision

Use the existing three-page Admin shape as phase one:

| Page | Case workbench role |
| --- | --- |
| `运营总览` | Shows the highest-priority case queue and the next review target. |
| `账号与资源` | Shows user/account, resource/order, quota, and lifecycle history. |
| `流量与通道` | Shows usage/channel anomalies and links them to orders and channels. |

Do not add a fourth navigation group yet. Promote the workbench to a standalone
`审计与工单` navigation section only after cases become durable, cross-page,
filterable, and frequently reviewed as their own workflow. Its first page can
be `监管工作台`; a separate `审计记录` page should wait until durable audit-log
review outgrows page-local timelines.

## Current Fact Gaps

The current source supports the direction, but it does not yet contain the full
case-management model:

- `Case` is not a durable backend object today. Phase one should call these
  rows case candidates unless/until a backend case API exists.
- Account lifecycle must come from account facts such as
  `active/suspended/disabled`; the UI must not infer account enabled/disabled
  only from `portalUserRef`.
- Order/request lifecycle and frontend status vocabulary need alignment before
  case automation depends on them. Backend records may carry lifecycle states
  that the frontend type model does not yet expose.
- Subscription artifact display must remain safe-reference based. If any Admin
  summary path can include raw subscription output, the backend contract must
  suppress or split that field before UI work consumes it.
- Usage `stale` must be backed by backend collection-window facts. The UI can
  display stale when provided, but it must not invent stale decisions from a
  missing timestamp without an agreed contract.

## Trackable Objects

| Object | Meaning | Safe UI identity | Primary source |
| --- | --- | --- | --- |
| User account | Customer or portal account identity and account lifecycle. | `accountRef` / `portalUserRef` | Portal access request summaries and future account service facts. |
| Resource / order | Commercial or access request owned by an account. | `requestRef` / `orderRef` | Portal access request service and subscription-control DB. |
| Subscription artifact | Customer-facing delivered artifact for an order. | `artifactId` / `artifactRef` only | Issuance/link records and portal request summaries. |
| Channel / node | Data-plane capacity or protocol channel. | `channelRef` / `nodeRef` | Edge credential, node registration, desired-state, and receipt facts. |
| Usage fact | Measured upload/download/total and collection state. | `edgeCredentialRef` as safe ref, never material | Usage rollups, samples, monitor aggregates. |
| Lifecycle event | Account/order/artifact/channel state transition. | `eventRef` / `auditRef` | Portal request fields, audit events, revocation events, desired-state notifications, receipts. |
| Case candidate | Operator-reviewable issue derived from one or more facts. | deterministic safe `caseRef` candidate | Phase one may compute from existing safe facts and must label it as derived. |
| Durable case | Persisted review workflow item. | `caseRef` | Phase two backend case API/table after contract and risk review. |

The UI may shorten safe refs for display, but it must not expose raw
subscription URLs, tokens, credential material, private keys, raw runtime config,
SQLite rows, or customer-private data.

## Case Model

A case is a review object, not the domain object itself. It points to one or
more trackable objects and explains why operator attention is needed.

Minimum case candidate fields:

| Field | Purpose |
| --- | --- |
| `caseRef` | Stable safe identifier or deterministic candidate identifier. |
| `objectType` | Primary object type: account, order, artifact, channel, usage, lifecycle. |
| `objectRef` | Primary safe object ref. |
| `title` | Short operator-facing summary. |
| `reasonCode` | Machine-readable reason, such as `over_limit`, `usage_stale`, `collector_disabled`, `receipt_missing`, `expiry_candidate`, `archive_candidate`. |
| `status` | Case workflow state. |
| `severity` / `priority` | Review severity, independent of production risk tier. |
| `source` | Derived source: usage monitor, quota review, lifecycle scan, receipt check, manual note. |
| `linkedObjects` | Typed safe links to account/order/channel/artifact/audit objects. |
| `evidenceRefs` | Safe refs for supporting facts such as usage rollup, receipt, audit event, or lifecycle event. |
| `gateRequired` | True when the next action would cross B/A or A-tier boundaries. |
| `createdAt` / `updatedAt` | Case lifecycle timestamps. |
| `closedAt` | Present only when closed. |
| `auditNoteRef` | Safe ref for operator note or closing rationale. |

Case status language:

| Status | Meaning |
| --- | --- |
| `待复核` | The system surfaced a condition and no operator review has started. |
| `处理中` | Operator is investigating or waiting for a safe follow-up. |
| `需门禁` | Next action would cross B/A or A-tier boundaries and needs a separate gate. |
| `已确认` | The condition is real and recorded, but no further action is needed in this case. |
| `误报` | The condition was reviewed and should not count as active risk. |
| `已关闭` | The case has a closing note and no active review remains. |
| `待归档` | Review is closed or nearly closed, but retention/archive review remains. |

These case statuses must not replace domain statuses. For example, account
disabled, order paused, subscription expired, over quota, stale collection, and
receipt missing remain separate domain states.

## Object Timeline

`ObjectTimeline` shows historical facts for one selected object. It is a read
path first; write actions must remain review notes unless a later task defines a
safe API.

Minimum timeline event fields:

| Field | Purpose |
| --- | --- |
| `eventRef` | Safe event identifier. |
| `category` | `account_lifecycle`, `order_lifecycle`, `entitlement_quota`, `artifact_access`, `channel_desired_state`, `usage_collection`, `case_workflow`. |
| `action` | `request_submitted`, `order_delivered`, `quota_updated`, `usage_collected`, `usage_stale`, `collector_disabled`, `receipt_applied`, `receipt_missing`, `account_disabled`, `order_paused`, `expired`, `archive_candidate`, `audit_note_added`, `case_closed`. |
| `objectType` / `objectRef` | Object the event belongs to. |
| `occurredAt` | When the event happened or was observed. |
| `actorRef` / `systemRef` | Safe actor or system source when available. |
| `source` | Backend source or computed source. |
| `sourceTable` / `sourceService` | Optional backend source hint for debugging without exposing raw rows. |
| `summary` | Short display summary. |
| `relatedRefs` | Safe linked refs. |
| `before` / `after` | Redacted status or quota deltas when safe and useful. |
| `severity` | neutral, info, warning, danger. |
| `reasonCode` | Machine-readable reason for the event. |
| `evidenceRef` / `auditRef` | Safe evidence or audit reference. |

Timeline events can be composed from existing request fields, usage rollups,
audit events, revocation events, desired-state notifications, and apply
receipts. Phase one may derive timeline rows from already-returned summaries;
phase two should expose first-class backend timeline APIs.

## Linked Objects

`LinkedObjects` keeps case context explicit with typed edges, not free-form
text:

- `UserAccount owns Resource/Order`.
- `Resource/Order has Entitlement`.
- `Resource/Order issues SubscriptionArtifact`.
- `SubscriptionArtifact boundTo tenant/accessGrant safe refs`.
- `Resource/Order uses Channel via edgeCredentialRef`.
- `UsageFact measures Resource/Order + Channel`.
- `LifecycleEvent targets any object`.
- `Case about/blocks/followsUp/duplicates any object`.

Linked objects are displayed as safe refs with type labels. The UI must not turn
raw credential identifiers into copyable secrets or reveal subscription output.
Each edge can carry `relationType`, source object, target object, source or
evidence ref, creation time, and authority/confidence. Edge metadata must not
include tokens, URLs, raw credentials, raw config, SQLite rows, or customer
private data.

## UI Structure

Shared components:

| Component | Role |
| --- | --- |
| `CaseQueue` | Filterable queue by status, reason, priority, object type, and source. |
| `CaseDetailPanel` | Detail drawer or right panel for selected case. |
| `ObjectTimeline` | Chronological object history. |
| `LinkedObjects` | Safe linked refs and relationship graph/list. |
| `AuditNote` | Operator note and closing rationale. |
| `LifecycleState` | Displays domain lifecycle state without merging unrelated concepts. |
| `FilterToolbar` | Shared filters for status, reason, object type, owner, priority, and time. |
| `SplitPanel` / `Drawer` | Desktop split-detail and mobile full-screen detail surfaces. |
| `KeyValueGrid` | Dense detail facts without nesting cards. |
| `EmptyState` / `ErrorState` / `LoadingSkeleton` | Stable section states that do not collapse layout or hide data-source failures. |

Phase-one embedding:

- `运营总览`: show the top case queue, grouped by over-limit, stale usage,
  measured-zero anomaly, collector unavailable, receipt missing, expiry, pause,
  and archive candidates.
- `账号与资源`: add account/order case badges, selected order timeline, quota
  review history, and linked account/order/artifact refs.
- `流量与通道`: make anomaly rows open case detail with usage facts, channel
  coverage, edge credential safe refs, last observed time, and receipt state.

Phase-two standalone workbench:

- Add an `审计与工单` section only when cases are durable, cross-page,
  searchable, filterable, and have real close/reopen/note workflows.
- Its first page should be `监管工作台`. `审计记录` can be added later only when
  durable audit review is a real standalone workflow.
- Layout should be a three-column work surface on desktop: saved filters,
  case queue, case detail/timeline. On mobile, use queue first and open detail
  as a full-screen drawer or route.

## Data Boundaries

The frontend may:

- group backend facts into display sections;
- sort and filter cases;
- compute phase-one case candidates from already-safe aggregates;
- render empty/loading/error states;
- show safe refs and redacted summaries.

The frontend must not:

- invent account, order, quota, usage, receipt, or lifecycle truth;
- treat unknown or stale usage as `0 B`;
- equate account disabled with order paused or subscription expired;
- expose raw subscription URL, token, credential material, raw config, SQLite
  row, or customer-private data;
- imply production mutation is available from a case detail panel.
- mark a case as durable, closed, false positive, or archived unless a backend
  fact or explicit operator-note contract supports it.
- decide `stale` collection without a backend-provided stale window or
  collection status contract.

Backend follow-up (`GCC-54` / `GCC-55`) should define whether cases are
computed from existing facts or persisted as durable review records. Any
schema/migration, production data backfill, auth model change, or automated
lifecycle action must be separately gated.

## Suggested Delivery Slices

| Linear issue | Slice | Output |
| --- | --- | --- |
| GCC-51 | Object and case IA | This design model, source-field map, and gap list. |
| GCC-52 | Visual workbench plan | Queue/detail/timeline mockup and responsive behavior. |
| GCC-53 | Frontend primitives | `CaseQueue`, `CaseDetailPanel`, `ObjectTimeline`, `LinkedObjects`, and state primitives embedded into the three existing pages. |
| GCC-54 | Backend contract audit | Existing facts, missing facts, computed-vs-durable case boundary, API contract. |
| GCC-55 | Business logic integration | Replace seed/computed UI where needed with backend facts and tests. |

## Error And Empty States

- Empty queue: show that no active cases match current filters, plus the data
  freshness source.
- Unknown facts: show `未采集` or `未知`, not `0 B`.
- Stale facts: show `延迟` and last observed time.
- Collector unavailable: show `采集不可用` and separate it from channel health.
- Backend unavailable: keep page layout stable and show section-local error
  panels.
- Case detail missing: keep the queue visible and show a non-destructive empty
  detail state.

## Testing And Validation

Docs-only validation:

```powershell
git diff --check origin/master...HEAD
```

Frontend implementation validation:

```powershell
npm run admin:test
npm run admin:build
npm test
git diff --check origin/master...HEAD
```

Visual QA:

- Open the local Admin UI through Vite dev/preview.
- Check desktop and mobile widths.
- Open a case from `运营总览`, `账号与资源`, and `流量与通道`.
- Verify queue, detail panel, linked refs, timeline, empty state, loading state,
  and error state are readable.
- Confirm no sensitive material appears in visible UI, logs, or fixtures.

## Open Implementation Questions

- Should phase-one transient cases be purely frontend-computed from existing
  summaries, or should an Admin route provide a first-class computed case list?
- Which audit events already cover quota edits, delivery, revocation, and
  lifecycle review closely enough for a first timeline?
- Should operator notes be allowed before durable case persistence exists, or
  should notes wait for backend contract work?
- Should the standalone navigation section be `审计与工单`, with page
  `监管工作台`, once promoted?
- Should the current request status vocabulary be expanded before the frontend
  depends on disabled/paused lifecycle cases?
