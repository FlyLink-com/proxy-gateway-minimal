# Admin Console Domain Dictionary

Last updated: 2026-06-16, America/Los_Angeles.

> Status:
> - Linear: Supports GCC-42 / GCC-48 / GCC-69
> - Risk: C for this dictionary
> - Production impact: None
> - Execution authority: Does not authorize production, AWS, Vultr, DNS,
>   Nginx, systemd, DB, runtime, auth model, schema/migration, token,
>   credential, subscription URL, raw config/log/env, SQLite row, or
>   customer-data actions

This dictionary is the source of truth for New Admin Console wording,
decision ownership, display scenarios, page responsibility, and future
sub-navigation. It exists to prevent every page from becoming a long scrolling
pile of unrelated cards.

Admin is an operator console. It supervises users, resources, usage, channels,
cases, and platform health. User Portal remains the self-service product surface.

## Layering Rules

| Layer | Meaning | Rule |
| --- | --- | --- |
| Top-level navigation | Domain work area such as `用户监管` or `平台监控`. | Add only when the area has a real page, data source, redaction boundary, non-goals, tests, and validation. |
| Page | Primary workbench inside a domain, such as `账号与资源`. | It may contain first-screen summary cards, tables, and detail panels. |
| Sub-navigation | A scoped split under a page when content no longer fits one clear workbench. | Use tabs/segmented nav inside the page before adding another top-level item. |
| Section | One task-focused group inside a page or subpage. | A section owns one operator question and must not nest cards inside cards. |
| Decision ownership | The page responsible for the operator decision, not just the underlying object. | A card belongs where the operator decides what to do next. |
| Object | Domain fact such as account, order, quota, channel, case, or receipt. | An object may appear on multiple pages, but each appearance must state whether it is owned, previewed, or only used for correlation. |

Overview pages may preview objects from other areas, but they do not own the
deep workflow. A preview must link to the owner page or stay read-only until
that owner page exists.

## UI Copy And Locale Rule

The React Admin interface uses English canonical labels for visible navigation,
page titles, sub-navigation, setup copy, top-bar controls, and test anchors:
`Overview`, `Operations Overview`, `User Operations`, `Accounts & Resources`,
`Platform Monitoring`, `Usage & Channels`, `Audit & Cases`,
`Platform Development`, and `System Settings`.

Chinese labels in this dictionary are planning glosses and product notes. They
may be reused later by a browser/runtime i18n layer, but code ownership and
tests should reference the English canonical labels.

The active Admin content layer is now guarded by
`admin/src/test/admin-english-copy-contract.test.ts`: active page modules,
shared workbench primitives, case candidates, and case-workbench display types
must not inline Chinese UI copy. User Portal copy is intentionally outside this
Admin contract and should be handled by its own locale plan.

## Top-Level Decision Ownership

| Console area | Current page | Owns decisions for | May preview or correlate | Does not decide |
| --- | --- | --- | --- | --- |
| `Overview` | `Operations Overview` | Platform health, top risks, cross-area next review target, recent safe activity. | Users, orders, quota, channels, cases, timeline snippets. | Account lifecycle, quota editing, collector diagnosis, durable case workflow. |
| `User Operations` | `Accounts & Resources` | User accounts, resources, orders, entitlements, subscription artifacts, quota, account lifecycle. | Usage freshness, channel refs, case badges. | Collector operations, channel strategy, runtime apply, node onboarding. |
| `Platform Monitoring` | `Usage & Channels` | Usage accounting trust, collection freshness, channel coverage, collector/receipt visibility, and data-anomaly diagnosis. | Account/order refs as safe links and quota-risk signals as evidence. | Account creation/disable, quota ownership decisions, order pause/archive, durable case closure. |
| `Audit & Cases` | Locked | Durable cases, object history, audit notes, review workflow, work-order packets. | All domain objects through safe refs. | Direct production execution. |
| `Platform Development` | Locked | Channel strategy, node onboarding readiness, collector lab, safe platform tools. | Channel and node health from monitoring. | User account operations and billing-facing workflows. |
| `System Settings` | Locked | Private operator settings, environment profile, refresh behavior, permissions, safety policy. | Console state. | Product settings exposed to users, auth model changes without a separate gate. |

## Front-End Page Contract

The code-level page responsibility contract lives in
`admin/src/app/navigation.ts` as `pageWorkbenchContracts`. It is tested by
`admin/src/test/navigation.test.ts` so later UI work cannot silently move
operator decisions between pages.

| Contract field | Meaning |
| --- | --- |
| `role` | Whether the page is an `overview`, a `decision-owner`, or an `evidence-owner`. |
| `primaryQuestion` | The operator question the page must answer before adding more cards. |
| `sectionIds` | The page-local sub-navigation ids that the page contract covers. |
| `ownsDecisions` | Decisions the page may own in UI, copy, filters, drawers, and future actions. |
| `previewOnly` | Decisions the page may summarize or route to, but not own. |
| `evidenceOnly` | Facts the page may show as evidence for another owner page. |
| `forbiddenDecisions` | Decisions that must not be implemented on the page without reclassifying the IA and tests. |

Current active contracts:

| Page | Role | Owns | Evidence/preview boundary |
| --- | --- | --- | --- |
| `Operations Overview` | `overview` | Cross-area next review target. | Previews users, orders, quota, collection, channels, receipts, and anomalies; it does not edit accounts, quota, lifecycle, or runtime. |
| `Accounts & Resources` | `decision-owner` | Account create/disable planning, account lifecycle, resource/order lifecycle, subscription artifact lifecycle, quota policy, and order pause/archive planning. | May show collection/channel/receipt facts only as evidence for user/resource decisions. |
| `Usage & Channels` | `evidence-owner` | Usage collection trust, channel coverage, receipt coverage, and collection anomaly diagnosis. | May show account/order/quota refs as evidence, but cannot own account creation, quota policy, order pause/archive, artifact lifecycle, or runtime apply. |

## Object Dictionary

| Object | Definition | Owning area | Current source | Editable now | User Portal visible | Sensitive boundary |
| --- | --- | --- | --- | --- | --- | --- |
| Operator | Protected Admin user operating the console. | `系统设置` | Local/session state and static shell copy. | No. | No. | Do not expose operator secrets or raw config. |
| User account | Customer account identity inside the business control plane. | `用户监管` | Portal access request ownership and future account summary. | No. | Yes, as the user's own account only. | Show safe account refs, not credentials or private contact data. |
| Resource | The business-owned access resource granted to an account. | `用户监管` | Portal request summaries and issued order facts. | No. | Yes, user-scoped. | Do not show raw subscription material. |
| Order | Request/lifecycle record for issuing or maintaining a resource. | `用户监管` | Portal access request summaries. | Limited quota update path exists for delivered requests. | Yes, user-scoped. | Show safe refs and lifecycle, not internal raw rows. |
| Entitlement | Plan or right granted by an order. | `用户监管` | Plan/duration fields and future entitlement index. | No. | Yes, user-scoped. | Keep as labels/refs, not billing-private internals. |
| Subscription artifact | Renderable product output associated with an order. | `用户监管` | Safe artifact refs in summaries. | No direct artifact mutation in this UI slice. | Yes, as rendered user output only through proper portal/sub routes. | Never show subscription URL, token, secret, YAML, or credential material. |
| Quota | Traffic limit and usage ratio for an order/resource. | `用户监管` | Traffic limit fields, usage metadata, usage monitor rows. | Traffic limit review/update only through existing safe Admin path. | Yes, user-scoped usage display. | Separate used value, configured limit, source, collection state, and audit status. |
| Usage sample | Measured upload/download/total sample from runtime accounting. | `平台监控` | Subscription usage monitor rows and aggregates. | No. | Aggregated user-scoped usage only. | Do not expose raw collector logs, raw runtime endpoints, or credentials. |
| Channel | Safe logical path/node channel that can serve issued resources. | `平台监控` | Usage monitor rows, issued channel refs, safe node/channel refs. | No. | Usually no; user may see client-compatible endpoint only through subscription output. | Show safe channel refs, not runtime endpoints or credentials. |
| Collector | Component that collects usage/accounting facts. | `平台监控` | Generated time, collection status, future collector health. | No. | No. | Do not expose raw logs/env/config. |
| Receipt | Redacted evidence that desired state or channel/runtime state was applied. | `平台监控` | Safe receipt summaries and future durable receipt events. | No. | No. | Show presence/freshness/status only, not material payloads. |
| Edge credential ref | Safe reference to edge credential material. | `平台监控` | Binding summaries and usage monitor rows. | No. | No. | Reference only; never credential contents. |
| Case | Review candidate or durable investigation record. | `审计与工单` | Computed candidates now; durable case store later. | No durable action until backend exists. | No. | Evidence must be bounded and redacted. |
| Audit event | Durable record of operator/system decision or object transition. | `审计与工单` | Future case/history backend. | No. | Usually no; user-facing history requires separate portal contract. | No raw source row, secret, or customer-private data. |
| Object history | Cross-object timeline for account, order, quota, artifact, channel, receipt, and case events. | `审计与工单` | Computed safe events now; durable history later. | No. | Only user-scoped subset if portal contract exists. | Computed events must be labeled honestly and not invent facts. |
| Platform tool | Safe internal utility for strategy, diagnostics, dry-run planning, or onboarding readiness. | `平台开发` | Existing safe CLI/helper summaries and future tool adapters. | Dry-run only until separately gated. | No. | Output redacted packets, never live mutation payloads. |
| Operator setting | Private console preference or environment selection. | `系统设置` | Local UI state and future private settings. | Local/private only. | No. | Do not store or show secrets in Git or public UI. |

## Decision Routing Matrix

The same object can appear in more than one page. Classify a card by the
operator decision it supports:

| Operator decision | Owning page | May appear elsewhere as |
| --- | --- | --- |
| Is this user account enabled, disabled, or needing review? | `用户监管 / 账号与资源` | Risk count in `运营总览`; linked safe ref in `审计与工单`. |
| Which resource, order, entitlement, or artifact belongs to this account? | `用户监管 / 账号与资源` | Safe correlation row in `平台监控`; preview table in `运营总览`. |
| What is the configured quota, edited quota, used/total ratio, or over-limit decision? | `用户监管 / 账号与资源 -> 额度与用量` | Data-anomaly evidence in `平台监控`; risk summary in `运营总览`. |
| Was usage collected, stale, absent, or truly zero? | `平台监控 / 流量与通道 -> 采集异常` | User/order context in `账号与资源`; top risk in `运营总览`. |
| Which channel, collector, receipt, or edge credential ref explains the sample? | `平台监控 / 流量与通道` | Linked safe refs in `账号与资源`; case evidence later. |
| Who reviewed, closed, reopened, or marked a false positive? | `审计与工单` after durable backend exists. | Preview-only case candidate in current pages. |

Do not classify by noun alone. For example, an over-limit row references an
order and quota, but platform monitoring owns only the measurement evidence;
the quota policy decision remains in `账号与资源`.

## Page And Sub-Navigation Model

### `总览 / 运营总览`

`运营总览` answers: is the platform healthy, what needs attention, and where
should the operator go next?

| Sub-area | Purpose | Owner rule |
| --- | --- | --- |
| `健康摘要` | Platform health, collection freshness, channel coverage, risk count. | Owns only summary signals. |
| `风险队列` | Top computed review candidates. | Previews cases; durable workflow belongs to `审计与工单`. |
| `下一步入口` | Route to `Accounts & Resources` or `Usage & Channels` when the operator needs details. | Overview should not own account/resource ledgers, object timelines, or channel ledgers. |

Do not add many secondary ledgers here. If a section needs filters, paging, or a
detail drawer, move it to the owning page.

### `用户监管 / 账号与资源`

`用户监管` answers: which user owns which resources, what is their quota state,
and what account/order lifecycle needs review?

| Sub-nav | Purpose | Primary objects | Promote when |
| --- | --- | --- | --- |
| `账号概览` | Search, filter, and select user accounts. | User account, account status, security state. | Account rows need their own filters/detail panel. |
| `资源与订单` | Show resources, orders, plans, entitlements, artifacts, and delivery lifecycle. | Resource, order, entitlement, artifact. | Order/resource table outgrows account overview. |
| `额度与用量` | Show configured limit, edited limit, used/total, measured channels, collection age, quota risk. | Quota, usage summary. | Quota edits/audit history need focused space. |
| `生命周期` | Separate account disabled, order paused, artifact revoked, expired, archived, restored. | Account lifecycle, order lifecycle, artifact lifecycle. | Lifecycle chips need evidence and review path. |
| `历史与事件` | User/account/order history view. | Object history, audit events, cases. | Durable history backend exists. |

Account creation and account disable belong here. Subscription creation is not
the primary Admin model. Order pause, revoke, archive, and quota enforcement are
separate lifecycle review flows and may become Risk A depending on production
impact.

### `平台监控 / 流量与通道`

`平台监控` answers: are usage collection and channels trustworthy, fresh, and
complete?

| Sub-nav | Purpose | Primary objects | Promote when |
| --- | --- | --- | --- |
| `采集新鲜度` | Collector status, generated time, stale threshold, unknown count. | Collector, usage sample. | Collector facts need more than one strip/card. |
| `通道覆盖` | Issued/measured/missing channels and receipt blockers. | Channel, receipt, edge credential ref. | Per-channel diagnosis needs filters. |
| `用量台账` | Account/order/channel usage rows and warnings. | Usage sample, order, account, channel. | Usage ledger needs paging/filtering. |
| `采集异常` | Stale usage, true zero, not collected, disabled collector, missing receipt, and quota-risk signals used as measurement evidence. | Usage sample, collector, receipt, channel, order safe ref. | Queue becomes a primary investigation path. |
| `回执与采集器` | Receipt freshness, collector availability, future safe collector diagnostics. | Receipt, collector. | Backend contract exists. |

This area may show account/order refs for correlation, but it does not own
account lifecycle, quota ownership decisions, order pause, or archive.

### Planned Areas

| Area | Future sub-nav | Entry gate |
| --- | --- | --- |
| `审计与工单` | `Case 收件箱`, `对象历史`, `审计备注`, `工作单`, `关闭/误报复核` | Durable Case/history backend, safe evidence contract, authorization and tests. |
| `平台开发` | `通道策略`, `节点接入`, `采集器实验室`, `API 诊断`, `Dry-run 工具` | Real platform tools with no-secret outputs and no production mutation authority. |
| `系统设置` | `连接设置`, `环境档案`, `刷新策略`, `权限可见性`, `安全策略` | Private/local settings contract and no public Admin exposure. |

## State Taxonomy

| Domain | States | Required distinction |
| --- | --- | --- |
| Account | `启用`, `已禁用`, `待接入账号状态`, `需复核` | Account disabled is not order paused. |
| Order/resource | `待处理`, `待发放`, `已发放`, `已暂停`, `已到期`, `已撤销`, `待归档` | Order lifecycle is not artifact lifecycle. |
| Artifact | `已生成`, `已撤销`, `已轮换`, `缺失`, `待复核` | Artifact revoked is not credential missing. |
| Quota | `正常`, `接近额度`, `超额`, `未限额`, `未采集` | Quota status belongs to `账号与资源`; platform monitoring may only surface it as evidence. |
| Collection | `已采集`, `零用量`, `延迟`, `未采集`, `采集关闭`, `采集不可用` | Zero usage, stale usage, and no collector are different. |
| Channel | `正常`, `降级`, `异常`, `未使用`, `回执缺失`, `回执延迟` | Channel health is not quota status. |
| Receipt | `已确认`, `延迟`, `缺失`, `不适用`, `待复核` | Receipt absence is review evidence, not automatic runtime failure. |
| Case | `高风险`, `中风险`, `低风险`, `待处理`, `已关闭`, `误报` | Computed candidates are not durable cases until stored. |
| Safety | `只读`, `预览`, `需要门禁`, `执行未授权`, `生产动作禁止` | UI visibility is not execution approval. |

## Routing Rules

1. If the operator question is "what is wrong now?", start at `运营总览`.
2. If the question is "which user/account/resource/order owns this?", route to
   `用户监管`.
3. If the question is "was usage collected, measured, or linked to a channel?",
   route to `平台监控`.
4. If the question is "is this account/order/quota policy allowed or should it
   be paused, archived, restored, or edited?", route to `用户监管` first and
   reclassify as A-tier if production mutation is involved.
5. If the question is "what happened over time and who reviewed it?", route to
   `审计与工单` after durable history exists.
6. If the question is "which platform tool or rollout strategy should be used?",
   route to `平台开发` after safe tool adapters exist.
7. If the question is "how is this private console configured?", route to
   `系统设置`.

When a page needs more than one scroll of unrelated material, split it with
sub-navigation under the current page. Do not promote a top-level navigation
entry just to reduce scroll length.

## Implementation Handoff

- Keep current active top-level pages: `Operations Overview`,
  `Accounts & Resources`, and `Usage & Channels`.
- Add sub-navigation only when a page has enough real content and tests to make
  the split useful.
- Model future sub-nav in docs before adding React routes.
- Reuse dictionary labels in tests so copy drift is caught.
- Keep `pageWorkbenchContracts` in sync with this dictionary whenever page
  ownership, preview-only behavior, evidence-only behavior, or forbidden
  decisions change.
- Keep overview cards as previews; deep filters, ledgers, histories, and
  editable review flows belong to owner pages.
- Any mutation that affects production accounts, orders, quota enforcement,
  runtime collectors, channels, nodes, auth, schema, DNS, Nginx, systemd, or
  cloud resources must be reclassified before implementation.
