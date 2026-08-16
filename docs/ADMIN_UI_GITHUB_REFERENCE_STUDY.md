# Admin UI GitHub Reference Study

Last updated: 2026-06-18, America/Los_Angeles.

```yaml
document_metadata:
  doc_type: canonical
  lifecycle: active
  authority_scope: admin_ui_github_reference_study
  superseded_by: null
  last_verified_at: 2026-06-18
  production_authority: false
```


> Status:
> - Linear: GCC-49 under GCC-42
> - Risk: C for this reference study; follow-up UI/code work is B
> - Production impact: None
> - Execution authority: Does not authorize production, AWS, Vultr, DNS,
>   Nginx, systemd, DB, runtime, token, credential, subscription URL, template
>   adoption, framework migration, or customer-data actions

This document is a deep reading note for Admin UI planning. It complements
`docs/ADMIN_UI_DESIGN_AUDIT.md` by comparing similar open-source panels and
adjacent management consoles against this project's current Admin role.

The purpose is not to copy a product. The purpose is to use UI research as a
project review tool: which objects exist, which lifecycle states must be kept
separate, which operational risks need first-class visibility, and which
patterns should be avoided because they conflict with this project's control
plane and Risk A gates.

## Current Reference Scope Decision

The current Admin OS research lane should not treat hosted deployment platforms
as primary product references. GlobalCircle Admin is not a hosted deployment
platform, and the current work is a protected self-operated control-plane
workspace for supervision, operations review, app/plugin organization, and
future gated tooling.

Reference priority for the next design pass:

1. **Tier 1:** Grafana-style self-operated observability/control consoles.
   Grafana is the highest-value source because it has solved many dashboard,
   panel, library, plugin, alert, drilldown, and operator workflow problems
   that are close to this Admin OS direction.
2. **Tier 2:** domain-adjacent proxy, zero-trust, status, usage, and billing
   panels when they clarify one of our objects or page responsibilities.
3. **Tier 3:** visual template or component examples only when a specific
   density, spacing, table, chart, icon, modal, or empty-state pattern needs
   confirmation.

Every source still needs a fit check before entering the design library. The
output should be an Admin OS rule, component requirement, or app/plugin
behavior decision, not copied code or a new dependency.

## Reuse Existing Wheels Without Copying The Vehicle

GitHub reference projects are first-class design and product-analysis inputs
for this Admin rebuild. The goal is to reuse proven panel patterns where they
reduce product uncertainty, not to import a template or inherit another
project's operating model.

Use open-source panels for four separate jobs:

| Job | What to extract | Examples | What not to do |
| --- | --- | --- | --- |
| Self-operated console architecture | Dashboard/panel model, plugin catalog, alert-to-object routing, query/drilldown flow, app shell, and source-backed visualization patterns. | Grafana. | Copy AGPL code, inherit Grafana's full observability taxonomy, or turn Admin into a generic metrics product. |
| Business-object discovery | Object names, ownership boundaries, lifecycle states, and detail-page shape. | Proxy panels, NetBird, Firezone, Lago. | Collapse this project's account, order, artifact, and runtime credential layers into one foreign `user/client` model. |
| Operational path discovery | How operators move from alert to object, evidence, decision, note, and follow-up. | Linear-like issue tools, OpenStatus, OneUptime, Grafana-like consoles. | Add production execution buttons or incident workflows before backend authority exists. |
| Component-pattern discovery | Sidebar, metric cards, filters, data tables, status chips, quota meters, timelines, empty states. | Horizon UI, TailAdmin, Flowbite, Mosaic. | Copy template code, migrate frameworks, or add Tailwind/commercial template dependency in this lane. |
| Validation discovery | What states mature products make impossible to confuse. | Monitoring and billing/usage panels. | Let the frontend invent business meanings that backend summaries do not provide. |

The durable output of a reference read is a project-specific decision, not a
downloaded component:

```text
reference panel pattern
  -> object/path/state insight
  -> fit or conflict decision
  -> Figma design source
  -> local React/CSS implementation
  -> Chrome/Browser/Computer visual and interaction verification
```

This keeps the project from repeating solved UI/IA work while preserving the
current architecture: backend domain services own business logic, Admin
visualizes safe summaries, and production-affecting actions remain gated.

## Current Project Reading Frame

The current Admin surface is a protected management and supervision console.
It should help the operator review:

- user accounts and account enabled/disabled state;
- resources, orders, entitlements, access grants, and safe artifact refs;
- traffic quota, usage rollups, collection status, and over-limit signals;
- channel coverage, collector health, stale/unknown/zero usage, and receipt
  gaps;
- lifecycle candidates such as expiry, pause, revoke, and archive review;
- safe previews and advisory gate packets without runtime mutation authority.

It should not become:

- the customer self-service portal;
- a casual subscription creation panel detached from account/resource review;
- a production execution console;
- a place where raw subscription URLs, tokens, credentials, runtime config,
  SQLite rows, or customer-private data are displayed.

Local code already has the data shape needed for this direction:

- `admin/src/app/navigation.ts` groups Admin into `总览`, `用户监管`, and
  `平台监控`.
- `admin/src/pages/portal-requests-page.tsx` is moving toward `账号与资源`
  supervision with request status, user account refs, resources, controlled
  delivery preview, traffic limit editing, and safe audit refs.
- `admin/src/pages/subscription-usage-monitor-page.tsx` already separates
  platform collection overview, time series, channel chips, order ledger rows,
  collection status, and warnings.
- `admin/src/pages/dashboard-page.tsx` already has a more SaaS-like operations
  summary, but it still depends on the underlying page responsibilities being
  sharpened first.

## Backend Domain First

Business logic belongs in backend domain services and durable control-plane
state. The frontend should not invent business rules to make a page look
complete. Admin UI work should instead operate as a review lens over backend
facts:

1. Read the backend object model and API fields first.
2. Compare those facts with mature reference panels and management consoles.
3. Record what each reference does well and where it conflicts with this
   project's safety or authority model.
4. Derive this project's panel shape from the backend domain model, not from a
   template layout.
5. When the UI review reveals a real missing concept, upgrade the backend
   business logic or API contract in a separate B/A-scoped task with tests.

The frontend may format, group, filter, and visualize backend facts. It may
also make missing, stale, unsafe, or contradictory facts visible. It should not
silently create alternative meanings for account lifecycle, order lifecycle,
quota decisions, collector state, channel health, credential coverage, or
production gates.

Use this as the decision loop for GCC-45 through GCC-48:

```text
backend domain fact
  -> UI/reference comparison
  -> pros/cons and gap decision
  -> Admin panel design
  -> backend/API upgrade if the domain model is actually missing a concept
  -> frontend rendering of the reviewed backend fact
```

This keeps the panel from becoming a decorative shell while also preventing the
frontend from becoming a second, inconsistent business layer.

## Evaluation Rubric

Use these dimensions when reading a reference product:

| Dimension | Question | Preferred outcome |
| --- | --- | --- |
| Business object fit | Does it expose users/accounts, resources/orders, quota, usage, channels, and lifecycle states? | Borrow object vocabulary and table/card composition. |
| Information architecture fit | Does it separate overview, account supervision, platform monitoring, settings, and audit? | Borrow navigation grouping only when it matches current pages. |
| Operational safety fit | Does it separate observation from mutation, and does it hide secrets? | Borrow only advisory/review patterns that preserve Risk A gates. |
| Usage model fit | Does it distinguish unknown, stale, zero, measured, over-limit, and collector-disabled states? | Borrow state language and anomaly queues. |
| Design maturity | Is the UI readable, modern, and operator efficient? | Borrow density, spacing, status chips, meters, and responsive table patterns. |
| Technical fit | Does it require a framework or template migration? | Do not adopt code or dependencies unless a later technical migration is approved. |

## Reference Inventory

### Tier 1 Self-Operated Control Console Reference

Grafana is the primary reference for the Admin OS operating model. Use it as a
source for console architecture and operator experience, not as a source for
code adoption.

| Reference | What it proves | Borrow | Avoid | Maps to |
| --- | --- | --- | --- | --- |
| [Grafana](https://github.com/grafana/grafana) | A self-operated console can organize dashboards, panels, visualizations, alerts, exploration, mixed data sources, and plugin-style extensibility around operator workflows. | Panel/plugin mental model, dashboard library discipline, alert-to-panel drilldown, data-source separation, query/explore affordances, visualization density, variable/filter bars, folder/library organization, and stateful operator workspaces. | Copying AGPL code; adopting Grafana as the product model; exposing raw logs/queries/config; adding generic observability scope before our account, order, usage, channel, and gate objects are stable. | GCC-74, GCC-76, GCC-77, GCC-78, GCC-82 |

Design translation:

- Admin workspace apps behave like first-class console applications.
- Page modules behave like local plugins/panels with explicit ownership,
  display state, restore path, and safe search metadata.
- System Search should evolve toward safe console discovery and recovery, not a
  scroll dialog or second navigation tree.
- Usage and channel views should learn from Grafana's panel/explore/alert
  workflow, while keeping our backend summaries as the authority.
- Alerts and risk queues should route to account, order, channel, collector,
  receipt, or gate evidence rather than becoming free-form production actions.

### Visual Template Source Candidates

These projects are the closest GitHub source matches for the concept-image
direction. They are useful for reading source structure and visual language,
but they are not approved dependencies or copy sources for this branch.

| Reference | What it proves | Borrow | Avoid | Maps to |
| --- | --- | --- | --- | --- |
| [Horizon UI Tailwind React](https://github.com/horizon-ui/horizon-tailwind-react) | The Horizon-style dashboard source exists publicly and matches the desired polished SaaS/card language. | Card rhythm, left rail feel, metric hierarchy, status-rich dashboard composition. | Direct migration: the current repo uses project-owned React/Vite/CSS, and this branch is not a Tailwind/template adoption. | GCC-42, GCC-45, GCC-48 |
| [TailAdmin React](https://github.com/TailAdmin/free-react-tailwind-admin-dashboard) | A current React + TypeScript + Tailwind admin template can be used as a source-structure study for sidebar, tables, charts, modals, and dark-mode primitives. | Information density, table/chart primitives, accessible shell behavior, component inventory. | Treating it as a drop-in dependency or replacing the current CSS/component stack without a separate migration decision. | GCC-45, GCC-46, GCC-47, GCC-48 |
| [Mosaic Lite](https://github.com/cruip/tailwind-dashboard-template) | React + Tailwind + Vite dashboards can give useful analytics widgets and chart-heavy operator layouts. | Usage trend, warning bars, activity cards, dashboard density. | Direct code adoption because the license/redistribution terms are not a clean fit for project source reuse. | GCC-45, GCC-47 |
| [Flowbite Admin Dashboard](https://github.com/themesberg/flowbite-admin-dashboard) | Flowbite/Tailwind templates cover CRUD tables, charts, settings, modals, drawers, and multi-page admin examples. | Table/sidebar/component coverage and state layouts. | Pulling in Flowbite, Hugo, Webpack, or copied CRUD page assumptions that do not match this app. | GCC-48 |

Decision: use these as design and source-reading references only. The current
implementation remains a local React/Vite Admin app with project-owned CSS and
lucide icons.

### Direct Proxy And Subscription Panels

These projects are closest to the domain. They are useful for object and state
coverage, but weaker as direct UI architecture references because many combine
runtime configuration, user creation, subscription links, and infrastructure
mutation into one panel.

| Reference | What it proves | Borrow | Avoid | Maps to |
| --- | --- | --- | --- | --- |
| [Marzban](https://github.com/Gozargah/Marzban) | A proxy management UI can manage hundreds of proxy accounts, multiple nodes, traffic limits, expiry limits, subscriptions, monitoring, and API/CLI operations. | User/account rows, traffic and expiry limit visibility, node/channel coverage, system monitoring cards. | Combining create/modify/limit operations with runtime configuration and subscription material display. | GCC-46, GCC-47 |
| [Hiddify-Manager](https://github.com/hiddify/Hiddify-Manager) | A mature panel separates Dashboard, Users, Admins, Settings, Domains, Proxies, and Actions. Users have usage limit and package-day concepts plus dedicated user pages. | Separate Admin/user-page mental model, package-days/usage-limit display, settings/actions split, dashboard resource cards. | Admin links/password-like access patterns, domain/proxy/runtime settings sharing the same surface as user management. | GCC-45, GCC-46, GCC-47 |
| [3x-ui](https://github.com/MHSanaei/3x-ui) | Per-client management commonly includes traffic quotas, expiry, IP limits, live online status, share links, subscriptions, per inbound/client/outbound traffic stats, multi-node, and dark/light themes. | Per-client quota/expiry/status table columns, traffic stats reset visibility, live state chips, theme readiness ideas. | Treating this as production-grade reference; its own README warns against production use. Avoid direct runtime action parity. | GCC-46, GCC-47, GCC-48 |
| [s-ui](https://github.com/alireza0/s-ui) | Sing-Box/SagerNet panels often expose multi-client/inbound, advanced routing, client traffic cap, expiration date, online client status, traffic/system status, subscription service, and dark/light theme. | Channel/inbound chip patterns, system-status plus client-status split, dark/light token discipline. | Default panel credentials, direct routing/configuration controls, production-environment assumptions. | GCC-47, GCC-48 |
| [V2Board](https://github.com/v2board/v2board) | A multi-proxy-protocol management panel can become a broader commercial/control-plane application, but the public README is sparse. | Treat as historical/domain evidence for proxy-protocol panel category and commercial-style control plane. | Do not infer detailed UI or backend semantics beyond the public documentation; do not adopt Redis/Laravel-style complexity. | GCC-42 context only |
| [Marz-X](https://github.com/wmm-x/marz-x) | A dashboard layered over Marzban emphasizes user/subscription management, plans, data limits, bandwidth analytics, multi-server support, and real-time status. | Modern dashboard/analytics framing, bandwidth cards, plan/data-limit management panels, multi-server status summary. | One-click server optimization, Docker/Nginx/SSL automation, visual Xray config, and Swagger testing as Admin first-screen features. | GCC-45, GCC-46, GCC-47 |

### Adjacent Management Consoles

These are better references for the protected Admin's information architecture:
they manage users, devices/resources, policies, health, usage, incidents, and
operational review without being narrowly tied to proxy subscription output.
They are secondary to Grafana for the Admin OS shell, but remain useful when a
specific object model or workflow needs a closer domain match.

| Reference | What it proves | Borrow | Avoid | Maps to |
| --- | --- | --- | --- | --- |
| [NetBird Dashboard](https://github.com/netbirdio/dashboard) and [NetBird](https://github.com/netbirdio/netbird) | A management UI can center peers, setup keys, users, access controls, peer status, groups/rules, traffic events, and activity logging. | `Users -> Resources/Peers -> Access/Entitlement -> Activity` mental model; setup/issuance keys as controlled artifacts; status-first tables. | Auth0 or Tailwind adoption as a prerequisite; direct peer removal UX without our review gates. | GCC-46, GCC-48 |
| [Firezone](https://github.com/firezone/firezone) | A zero-trust access console frames users/groups, resources, gateways, policies, audit logs, and scalable gateways as separate concepts. | Strong account/resource/policy/gateway separation; least-privilege language; audit and gateway-health cards. | Treating our subscription system as a zero-trust product clone; direct gateway deployment controls. | GCC-46, GCC-47 |
| [Lago](https://github.com/getlago/lago) | Usage-based products separate metering, aggregation, subscriptions, entitlements, pricing dimensions, and revenue analytics. | Quota/metering language, event ingestion freshness, entitlement-plan linkage, usage trend cards. | Billing/payment orchestration, provider keys, invoice flows, or payment actions in Admin during this lane. | GCC-46, GCC-47 |
| [OpenStatus](https://github.com/openstatusHQ/openstatus) | Status and uptime products combine monitoring, incident communication, maintenance windows, global checks, and alert routing. | Data freshness strips, monitor health cards, maintenance/incident state vocabulary, anomaly queues. | Public status-page publication or subscriber notification flows inside protected Admin. | GCC-45, GCC-47 |
| [OneUptime](https://github.com/oneuptime/oneuptime) | Observability platforms organize uptime, infrastructure monitoring, status pages, incidents, on-call/alerts, logs, metrics, traces, and workflows. | Operations overview hierarchy: service health, infrastructure health, incidents, alerts, logs/recent events. | Pulling in a full observability taxonomy that would bury the subscription-control product spine. | GCC-45, GCC-47 |

## Deep Findings

### 1. The closest proxy panels validate our domain fields, not our authority model.

Marzban, Hiddify, 3x-ui, s-ui, V2Board, and Marz-X all confirm the core fields
operators expect in this category:

- user or client identity;
- plan/package duration;
- traffic limit and used traffic;
- expiry date;
- enabled, suspended, expired, or online state;
- generated subscription or share link;
- node, inbound, protocol, or channel coverage;
- traffic statistics and reset controls;
- admin/system status.

Those fields map well to our Admin display model. They do not map cleanly to
our execution model. In this project, order issuance, subscription artifact
rendering, protected credential material, data-plane apply, and production
mutation remain separate control-plane and Risk A paths. Admin can supervise
and prepare review, but it must not casually mutate runtime or expose raw
materials.

### 2. Account lifecycle and order/subscription lifecycle must remain separate.

Most proxy panels flatten the concept into `user/client`, because they are
single-purpose panels. Our project has at least four distinct layers:

| Layer | Admin meaning | UI implication |
| --- | --- | --- |
| User account | The customer or portal account identity. | Can be created, enabled, disabled, risk-marked, and reviewed as an account. |
| Resource/order | A commercial or access request owned by the account. | Has request status, plan, duration, entitlement, access grant, and lifecycle. |
| Subscription artifact | Safe customer-facing delivery product for an order. | Must be shown as safe refs and status, not raw URLs or tokens. |
| Runtime/channel credential | Data-plane material and collection anchor. | Admin may show safe channel/edge credential coverage, not raw material. |

This is why `账号与资源` should not be a plain "subscriptions" page. It should
act like a user/resource supervision page: account summary on top, resource and
order table beneath, quota and lifecycle review in detail panels, and issuance
preview as a secondary controlled action.

### 3. Usage UI must distinguish measured-zero from unknown.

The most important usage-accounting lesson is not the chart. It is state
language. A value of `0 B` can mean a true zero measurement, collector disabled,
not collected, stale collection, missing channel binding, or missing receipt.
Our UI already has `collectionStatus`, `usageStatus`, `channelCount`,
`measuredChannelCount`, `lastUsageObservedAt`, and warning arrays. The next UI
work should make those states visually impossible to confuse.

Recommended state groups:

| State group | Display language | Source fields |
| --- | --- | --- |
| Trusted measurement | `已采集`, `已计量 x/y 通道` | `collectionStatus=measured`, channel counts |
| True zero | `零用量`, `已采集 0B` | `collectionStatus=measured_zero` |
| Unknown | `未采集` | `collectionStatus=not_collected` |
| Stale | `延迟`, `采集已过期` | `collectionStatus=stale`, last observed time |
| Collector unavailable | `采集器未启用`, `采集不可用` | `collectionStatus=collector_disabled` |
| Limit risk | `接近额度`, `超额` | `usedBytes`, `trafficLimitBytes`, ratio |
| Channel coverage issue | `待采集通道`, `回执缺失` | measured vs issued channels, receipt state |

### 4. The overview page should summarize risk, not host every tool.

OpenStatus and OneUptime are useful here because their first screen usually
answers health, incident, monitoring, alert, and recent-event questions. Our
`运营总览` should answer:

- Is the subscription-control system healthy enough for review?
- Are there overdue user/resource actions?
- Are there over-limit, stale, zero-usage, collector-disabled, or receipt
  missing anomalies?
- Which page should the operator open next?
- Are any production actions blocked behind an explicit Risk A gate?

The older channel gate workbenches are still valuable, but they should not be
the first visual impression. They belong below the high-level operating summary
or under a future `平台开发`/`审计记录` section after real page separation exists.

### 5. We should borrow SaaS dashboard composition, not template code.

The user's Horizon-style direction is still valid as a design language:
modern cards, generous spacing, clear charts, and status-rich cards fit the
business. The current project should still keep implementation in the existing
React app and project-owned CSS/components.

Do not import a commercial template or migrate to Tailwind as part of GCC-42.
The value is in the design vocabulary:

- sectioned sidebar with small descriptions;
- quiet neutral background and strong card hierarchy;
- metric cards with source notes;
- status chips with consistent tones;
- quota meters;
- data freshness strips;
- anomaly queues;
- dense but readable account/order tables;
- master/detail review panels;
- empty/error/loading states that preserve layout size.

### 6. Grafana should drive the next OS-level review pass.

Grafana is valuable because it solves the exact class of product problem we are
now approaching: a console shell that hosts many operator-facing panels,
searchable dashboards, visualized facts, alert entry points, and extensible
plugins without requiring every panel to reinvent navigation, data source
selection, drilldown, or layout rules.

For this project, the useful extraction is:

| Grafana concept | Admin OS translation |
| --- | --- |
| Dashboard | Workspace app such as Operations Overview, Accounts & Resources, or Usage & Channels. |
| Panel | Plugin app/module with local controls, display state, and restore path. |
| Data source | Backend summary/API domain such as accounts, orders, usage ledger, channels, collectors, receipts, or gates. |
| Variables/filter bar | Safe search and scoped filters inside System Search or page-level toolbars. |
| Alerting | Risk queues and anomaly routing, not production execution. |
| Explore | Drilldown from overview to safe account/order/channel evidence. |
| Plugin ecosystem | Future reviewed Admin app manifest/YAML mechanism after approval, not arbitrary runtime upload. |

The next reference-library task should start by auditing Grafana's dashboard,
panel, library, alert, explore, and plugin patterns against the existing
Admin app map before spending time on lower-fit template projects.

Implementation backlog derived from the Grafana read:

| Need | Admin OS rule | Follow-up scope |
| --- | --- | --- |
| Source-backed panels | Every plugin panel should name the safe backend summary or display-only data source it visualizes. | Manifest-level `sourceContract` now records `dataSourceRefs`, drilldown targets, evidence routes, and a display-only transform boundary; next UI work should consume it. |
| Safe filters | Filters behave like dashboard variables, preserving page context without bypassing backend permission checks. | Define page/filter scope before adding richer System Search or evidence search. |
| Display transforms | Frontend transforms may format, group, sort, and unit-convert; quota, lifecycle, and risk decisions remain backend/domain-owned. | Keep `display transform only` language in component contracts and tests. |
| Alert routing | Risk items route to account, order, channel, collector, receipt, or gate evidence. | Add `evidenceLink`/`sourcePanelId` only after the target evidence surface exists. |
| Explore | Explore is a safe evidence drawer or page drilldown, not arbitrary SQL, log, config, or data-source browsing. | Start with read-only account/order/channel drilldown from existing safe summaries. |
| Discovery taxonomy | System Search can gain tags, folders, recent/favorite state, and hidden-module state once the manifest search contract is explicit. | Build on the current static manifest; do not introduce a runtime plugin market. |

## Page Mapping

### `运营总览` / GCC-45

Borrow primarily from OpenStatus, OneUptime, NetBird, and Marz-X.

Recommended first-screen composition:

1. Health header: current supervision status, last generated/checked time, and
   no-production-action boundary.
2. Metric cards: active accounts/resources, delivered orders, measured orders,
   abnormal orders, expiring/paused/archive candidates, blocked channels.
3. Risk queue: over-limit, stale usage, measured-zero anomaly, collector
   disabled, receipt missing, resource delivery blockers.
4. Small charts: order lifecycle donut, usage by channel bars, warning type
   bars, short activity sparkline.
5. Recent safe activity: account/order safe refs only.
6. Secondary gate workbenches: below the operational summary or moved later
   when a dedicated platform-development section exists.

Do not make overview the subscription creation or channel execution page.

### `账号与资源` / GCC-46

Borrow primarily from NetBird, Firezone, Hiddify, Marzban, 3x-ui, and Lago.

Recommended composition:

1. Account supervision toolbar: account ref, status, plan/resource, order
   status, usage risk.
2. Account table: account ref, account lifecycle, resource count, delivered
   orders, quota risk, last activity, next review action.
3. Account detail: safe identity refs, account enabled/disabled state, risk
   flags, recent order events.
4. Resource/order table: order/request ref, plan, duration, entitlement ref,
   access grant ref, subscription artifact state, delivery state, quota state.
5. Quota card: default limit, edited limit, used/total, ratio meter, collection
   state, channel coverage, audit note, operator ref.
6. Lifecycle card: account disable is separate from order pause/revoke/expire
   and archive candidacy.
7. Controlled issuance/lifecycle preview: visible but secondary, clearly
   marked as preview-only unless a separate execution path is approved.

Do not use "create subscription" as the central action. The central action is
account/resource review.

### `流量与通道` / GCC-47

Borrow primarily from Marzban, 3x-ui, s-ui, Marz-X, OpenStatus, and OneUptime.

Recommended composition:

1. Data freshness strip: collector configured, last collection, stale window,
   unmeasured order count, measured channel coverage.
2. Platform usage cards: upload, download, total used, measured orders, zero
   usage orders, over-limit/near-limit.
3. Channel coverage cards: issued channels, measured channels, missing channel
   count, receipt or collector blockers.
4. Historical usage chart: filter by account/order/channel with visible legend.
5. Collection anomaly queue before the ledger: stale, true zero, not collected,
   collector disabled, missing artifact/ref/receipt, plus over-limit/near-limit
   evidence for correlation only.
6. Order usage ledger: account ref, order ref, plan, issued channels, safe
   edge credential coverage, upload/download/total, quota decision, collection
   status, last observed, warnings.

Do not let platform totals or anomaly evidence substitute for order-level quota
decisions; quota policy belongs to `账号与资源`.

### Shared Primitives / GCC-48

Borrow across all references, but implement locally:

- `PageHeader`: page name, responsibility, data freshness, safety boundary.
- `SectionPanel`: one-level page section with heading/action slot.
- `MetricCard`: value, label, state/tone, source note.
- `StatusChip`: semantic tones for success/info/warning/danger/neutral.
- `QuotaMeter`: used/limit, ratio, overage, source timestamp.
- `DataFreshness`: collection status, stale threshold, unknown/failed counts.
- `RiskQueue`: severity, entity ref, reason, safe next action.
- `DataTable`: dense table with stable columns and mobile fallback.
- `SafeRef`: shortened non-secret refs for account/order/channel/credential.

## Anti-Patterns To Reject

The reference set also shows what this project should not absorb:

- Direct runtime deployment, restart, firewall, DNS, Nginx, or SSL controls in
  the protected Admin UI.
- Full subscription URLs, generated share links, QR codes, credentials,
  passwords, private keys, raw config, or raw logs in table cells.
- A single `user/client` object that hides the distinction between account,
  order, subscription artifact, and runtime credential.
- A single `0 B` label for not-collected, stale, collector-disabled, and true
  measured-zero usage.
- Placeholder navigation groups copied from a template before real pages exist.
- One-click server optimization or visual proxy-core configuration as the main
  Admin value proposition.
- New hard dependencies such as Tailwind, Redis, billing/payment providers, or
  auth services just because a reference project uses them.
- Hosted deployment-platform assumptions such as project hosting, edge deploy,
  cloud preview promotion, tenant-hosted apps, or Vercel/Cloudflare-style
  runtime ownership as primary Admin OS requirements.

## Recommended Execution Order

Keep GCC-49 as a docs-only input, then continue the existing GCC-42 child line:

1. GCC-46 `账号与资源`: make account/resource/order/quota/lifecycle separation
   visible first.
2. GCC-47 `流量与通道`: make usage freshness, channel coverage, and anomaly
   states impossible to confuse.
3. GCC-45 `运营总览`: compose the top-level dashboard from the clarified pages.
4. GCC-48 shared primitives: normalize cards, chips, meters, tables, empty
   states, spacing, and responsive rules after the first two pages expose real
   repeated patterns.

## Validation For This Study

This is docs-only:

```powershell
git diff --check origin/master...HEAD
```

Also check new untracked files for trailing whitespace before staging or
opening a PR.

## Sources Reviewed

- [Marzban](https://github.com/Gozargah/Marzban)
- [Marzban documentation introduction](https://gozargah.github.io/marzban/en/docs/introduction/)
- [Hiddify-Manager](https://github.com/hiddify/Hiddify-Manager)
- [Hiddify panel configuration wiki](https://github.com/hiddify/Hiddify-Manager/wiki/How-to-configure-Hiddify-panel-properly)
- [3x-ui](https://github.com/MHSanaei/3x-ui)
- [s-ui](https://github.com/alireza0/s-ui)
- [V2Board](https://github.com/v2board/v2board)
- [Marz-X](https://github.com/wmm-x/marz-x)
- [NetBird Dashboard](https://github.com/netbirdio/dashboard)
- [NetBird](https://github.com/netbirdio/netbird)
- [Firezone](https://github.com/firezone/firezone)
- [Lago](https://github.com/getlago/lago)
- [OpenStatus](https://github.com/openstatusHQ/openstatus)
- [OneUptime](https://github.com/oneuptime/oneuptime)
- [Grafana](https://github.com/grafana/grafana)
- [Horizon UI Tailwind React](https://github.com/horizon-ui/horizon-tailwind-react)
- [TailAdmin React](https://github.com/TailAdmin/free-react-tailwind-admin-dashboard)
- [Mosaic Lite](https://github.com/cruip/tailwind-dashboard-template)
- [Flowbite Admin Dashboard](https://github.com/themesberg/flowbite-admin-dashboard)
