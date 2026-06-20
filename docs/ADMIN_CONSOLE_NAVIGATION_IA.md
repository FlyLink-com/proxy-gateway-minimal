# Admin Console Navigation IA

Last updated: 2026-06-21, Asia/Shanghai.

> Status:
> - Linear: GCC-57 under GCC-50
> - Risk: C for this IA document; follow-up Admin UI code work is B
> - Production impact: None
> - Execution authority: Does not authorize production, AWS, Vultr, DNS,
>   Nginx, systemd, DB, runtime, auth model, schema/migration, token,
>   credential, subscription URL, raw config/log/env, raw log, audit export,
>   SQLite row, or customer-data actions

This document defines the Admin console navigation model after GCC-57. Admin is
not a subscription creation surface and is not the user self-service portal. It
is the operator console for supervision, operations, maintenance, and future
platform development.

For the card-by-card concept requirements extracted from the current Admin
console concept image, use
`docs/ADMIN_CONSOLE_CONCEPT_REQUIREMENTS_MATRIX.md`. This IA document decides
which areas may appear in navigation; the matrix decides what every visible
card, table, timeline, filter, and future page must prove before implementation
or promotion.

For object wording, page ownership, state taxonomy, and when to split a page
into sub-navigation, use `docs/ADMIN_CONSOLE_DOMAIN_DICTIONARY.md`. The
dictionary is the source of truth for deciding whether a card belongs to
`Overview`, `User Operations`, `Platform Monitoring`, `Audit & Cases`,
`Platform Development`, or `System Settings`.

For the expanded relationship model and backend DTO contract, use
`docs/ADMIN_CONSOLE_RELATIONSHIP_DRAFT.md` and
`docs/ADMIN_BACKEND_DTO_CONTRACT.md`. Those documents record User Management,
Order Management, Key Management, Audit Center, Log Access, About,
route-latency, agent-status, and inspection-summary needs. This IA document
decides which of those needs may enter active navigation.

## Decision

Treat Admin as a sustainable operator console shell, similar in product shape to
an infrastructure console: one protected shell, multiple domain work areas, and
strict entry gates before a work area becomes visible navigation.

Do not add clickable placeholder menu items only to look like a commercial
template. A navigation entry becomes active only when it has a real page, a real
data source, a safe redaction boundary, explicit non-goals, tests, and
validation. Planned top-level work areas may be visible as locked IA slots when
the shell needs to communicate the future console map, but they must stay
non-clickable and show their entry gate.

## UI Copy And Locale Rule

React-visible Admin shell copy uses English as the canonical interface language:
navigation labels, page titles, sub-navigation, setup copy, top-bar controls,
and test anchors must stay in English. Chinese terms in this document are
explanatory notes for product planning and may later become locale-pack strings
through browser/runtime i18n, but they are not the source of truth for current
UI labels.

Current active Admin pages and shared workbench primitives are covered by
`admin/src/test/admin-english-copy-contract.test.ts`. New Admin navigation or
page slices should either use English canonical copy or add an explicit i18n
adapter with tests; do not add inline Chinese copy to active Admin modules.

## Current Visible Navigation

These sections are active now because they have real pages and safe data
boundaries:

| Section | Page | Responsibility | Current data source |
| --- | --- | --- | --- |
| `Overview` | `Operations Overview` | Platform health, risk summary, recent safe activity. | Admin overview API and computed case candidates. |
| `User Operations` | `Accounts & Resources` | User accounts, owned resources, orders, subscription artifacts, quota state. | Portal access request summaries and safe refs. |
| `Platform Monitoring` | `Usage & Channels` | Usage accounting trust, collector freshness, channel health, receipt coverage, and data-anomaly diagnosis. | Subscription usage monitor summaries and safe refs. |

The visible shell subtitle remains `Proxy Gateway`. Page labels carry the
operator-console responsibility split.

## Current Wave Boundary

The current GCC-109/GCC-103 wave keeps the active top-level navigation sparse.
The expanded relationship model is valid for design and sequencing, but it does
not promote every relationship surface into the active React route map.

| Relationship surface | Current navigation decision | Follow-up owner |
| --- | --- | --- |
| `Operations Overview` | Active page. | Current handoff closed; backend DTO mapping continues under GCC-112. |
| Platform monitoring dashboards, route latency, agent status, inspection summaries | Stay inside `Usage & Channels` / Platform Monitoring; static UI exists and backend DTO ownership remains pending. | `GCC-112` backend contract. |
| User Management | Stay inside `Accounts & Resources` as account/user supervision. | `GCC-114` decides later split. |
| Order Management | Stay inside `Accounts & Resources` as resources/orders/lifecycle supervision. | `GCC-114` decides later split. |
| Account & Permissions | Stay as scoped permissions/settings content until capability and backend contracts exist. | `GCC-79`, `GCC-110`, backend contract work. |
| System Settings | Planned/locked until a private settings boundary exists. | Later settings work. |
| About | Planned safe system-info surface; no route is created in this wave. | Later low-risk UI slice after build/version DTO is defined. |
| Key Management | Not registered for non-super-admin users; not active in this wave. | `GCC-113` after `GCC-79`, `GCC-110`, `GCC-112`. |
| Audit Center | Not registered for non-super-admin users; separate from normal risk/case summaries. | `GCC-113` / durable audit contract. |
| Log Access | Not registered for non-super-admin users; no raw log route or search source. | `GCC-113` / `GCC-112`. |

## Sub-Navigation Model

Top-level navigation should remain stable and sparse. When a page starts
holding unrelated long-scroll content, split it with page-local sub-navigation
instead of adding another top-level area.

| Page | First sub-navigation candidates | Ownership rule |
| --- | --- | --- |
| `Operations Overview` | `Health Summary`, `Risk Queue`, `Next Actions` | Overview owns summary and routing only. It does not render the account/resource ledger, object timeline, or channel ledger as page-owned collections; those live on their owner pages. |
| `Accounts & Resources` | `Account Directory`, `Resources & Orders`, `Quota & Usage`, `Lifecycle`, `History & Events` | User supervision owns account/resource/order/quota lifecycle and account create/disable planning. |
| `Usage & Channels` | `Collection Freshness`, `Channel Coverage`, `Usage Ledger`, `Collection Anomalies`, `Receipts & Collectors` | Platform monitoring owns usage collection, channel coverage, receipts, collector freshness, and data-anomaly diagnosis; quota policy and lifecycle decisions stay in user supervision. |
| `Audit & Cases` | `Case Inbox`, `Object History`, `Audit Notes`, `Work Orders`, `Close / False Positive Review` | Locked until durable Case/history facts exist. |
| `Platform Development` | `Channel Strategy`, `Node Onboarding`, `Collector Lab`, `API Diagnostics`, `Dry-run Tools` | Locked until safe platform tools have real data contracts. |
| `System Settings` | `Connection Settings`, `Environment Profiles`, `Refresh Policy`, `Permissions`, `Safety Policy` | Locked until private/local settings have a safe boundary. |

The first implementation of sub-navigation should happen inside active pages
only after the target sections have enough real content, tests, and validation
to justify the split. Do not create empty child routes.

## Classification Rule

Navigation is grouped by operator decision, not by object noun:

- `Operations Overview` answers what needs attention and where to go next.
- `Accounts & Resources` decides user account ownership, resource/order lifecycle, quota
  policy, account creation, and account disablement.
- `Usage & Channels` diagnoses whether usage, collectors, channels, receipts, and
  edge credential refs are trustworthy enough to support those decisions.
- `Audit & Cases` will own durable review workflow once cases and object history
  exist.

An order can therefore appear in all three active pages, but only
`Accounts & Resources` owns order lifecycle decisions. A platform-monitoring row may show
over-limit or near-limit evidence, but the quota action belongs to
`Accounts & Resources -> Quota & Usage`.

The implementation guard for this rule is `pageWorkbenchContracts` in
`admin/src/app/navigation.ts`. Tests assert that `Operations Overview` is an overview page,
`Accounts & Resources` is the decision owner for account/resource/quota/lifecycle concerns,
and `Usage & Channels` is the evidence owner for collection/channel/receipt/anomaly
concerns. Any future UI that needs to move a forbidden decision across pages
must update the IA, domain dictionary, code contract, and tests together.

## Planned Navigation Slots

These sections are part of the console IA. They may render as locked,
non-clickable top-level slots, but they must not become active page navigation
until their entry gate is met:

| Planned section | Responsibility | Entry gate |
| --- | --- | --- |
| `Audit & Cases` | Durable cases, object history, audit notes, close/reopen review flows. | GCC-55 durable Case/history backend contract and UI integration. |
| `Platform Development` | Channel experiments, node onboarding, strategy tools, platform extension utilities. | Real platform tooling with object model, data source, safe boundary, tests, and validation. |
| `System Settings` | Private operator settings and local console configuration. | Private access boundary, explicit non-goals, validation, and no public Admin exposure. |

## Privileged Registration Rule

Privileged pages are different from ordinary locked slots. For non-super-admin
operators, Key Management, Audit Center, and Log Access must not be registered
at all:

- no sidebar or planned-app entry;
- no hidden route;
- no App Library launcher;
- no global-search or command-palette result;
- no notification deep link;
- no frontend API call for key, audit, or raw/ephemeral log data.

Super-admin visibility still is not backend authority. Privileged detail views
must be backed by backend permission checks and, when sensitive, fresh MFA.

## Entry Gate

Every new top-level Admin entry must define:

1. Object model: an object defined or added in
   `docs/ADMIN_CONSOLE_DOMAIN_DICTIONARY.md`.
2. Primary task: supervise, investigate, review, maintain, dry-run, or plan.
3. Data source: API, computed safe candidate, durable case/history, or local
   operator configuration.
4. Redaction boundary: no token, credential, subscription URL, raw runtime
   material, raw SQLite row, raw env/config/log, or customer private data.
5. Non-goals: especially production mutation, auth changes, schema migration,
   runtime apply, DNS/Nginx/systemd/firewall changes, or empty placeholder UI.
6. Tests and validation: targeted Admin tests, build, Browser QA when UI
   changes, and risk-tier validation from `docs/VALIDATION_BASELINE.md`.

## Phase Map

| Phase | Linear issue | Navigation effect |
| --- | --- | --- |
| Closed wave | GCC-109 / GCC-103 | Relationship model, IA/docs, and Figma handoff boundaries are documented. |
| Closed wave | GCC-110 / GCC-111 | Capability-gated registration and richer Platform Monitoring static UI are on `master`. |
| Current backend contract | GCC-101 / GCC-112 | Define DTO, redaction, retention, and privilege contracts before live integration. |
| Phase 3 decision | GCC-114 | Decide whether User Management and Order Management split from `Accounts & Resources`. |
| Deferred privileged UI | GCC-113 | Add super-admin-only Key/Audit/Log fixture surfaces only after capability and backend contracts settle. |
| Older durable case lane | GCC-55 | Promote durable cases/history into `Audit & Cases -> Case Inbox` after backend facts exist. |

## User Portal Boundary

User Portal remains a separate self-service surface for account login,
subscription state, user-visible usage, client import, support handoff, and
security settings. Admin must not reuse User Portal navigation or expose
operator-only state to end users.

## Production Boundary

This IA does not approve any production action. Admin may visualize risk,
generate safe review candidates, and prepare dry-run plans, but production
pause, archive, restore, node changes, runtime apply, schema migration, auth
changes, DNS, Nginx, systemd, firewall, or cloud-provider mutations remain
A-tier gates requiring explicit runbook and operator approval.
