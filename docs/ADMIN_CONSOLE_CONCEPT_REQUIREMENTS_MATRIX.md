# Admin Console Concept Requirements Matrix

Last updated: 2026-06-15, America/Los_Angeles.

```yaml
document_metadata:
  doc_type: canonical
  lifecycle: active
  authority_scope: admin_console_concept_requirements_matrix
  superseded_by: null
  last_verified_at: 2026-06-15
  production_authority: false
```


> Status:
> - Source: `docs/assets/admin-console/new-admin-console-rebuild-concept.png`
> - Risk: C for this requirements matrix; follow-up Admin UI code work is B
> - Production impact: None
> - Execution authority: Does not authorize production, AWS, Vultr, DNS,
>   Nginx, systemd, DB, runtime, auth model, schema/migration, token,
>   credential, subscription URL, raw config, raw log, SQLite row, or
>   customer-data actions

This document turns the Admin console concept image into an implementation
checklist. The concept image is project-owned product copy: every visible card,
table, chip, filter, and timeline row represents a feature requirement that
must be mapped to a page, data source, safety boundary, and implementation
stage before code is expanded.

For the executable `总览 / 运营控制台` first-screen Figma and React target, use
`docs/ADMIN_CONSOLE_OVERVIEW_FIGMA_SPEC.md` after reading this matrix.

## Extraction And Design Tool Status

This pass uses the concept image as a visual/OCR-style transcription source and
then maps the visible copy to requirements. Local machine OCR is not yet
available in this workspace: `tesseract` is not installed, and Python packages
`pytesseract`, `cv2`, `easyocr`, `paddleocr`, and `keras_ocr` are unavailable.
The extraction below should therefore be treated as model-assisted visual
transcription that needs a future machine OCR proof if exact pixel/text audit is
required.

Product Design preflight found no saved product-design context, so this
document is grounded in:

- the local concept image at
  `docs/assets/admin-console/new-admin-console-rebuild-concept.png`;
- the current repo architecture and Admin UI rebuild direction;
- the approved business boundary that Admin is a protected supervision,
  operations, maintenance, and platform-development console.

The Figma connector is authenticated and exposes Figma design tools. The first
editable design handoff file is:

- `GlobalCircle AI Admin Console Requirements Draft`:
  <https://www.figma.com/design/EvQXTtJ2XnRfcGxRLTRt0B>

This file currently contains the first requirements-to-design planning canvas:
concept OCR/visual text ledger, page responsibility split, Figma-first design
source, code implementation path, and Chrome/Browser/Computer visual QA loop.
Figma is the right design source and review surface; it is not the OCR engine
for this pass.

## OCR Text Ledger

The following ledger records the visible text by region before implementation
mapping. Use it as the copy source unless a later design review explicitly
changes wording.

### Shell And Top Bar

| Region | Visible text | Requirement IDs | Implementation note |
| --- | --- | --- | --- |
| Brand | `GlobalCircle AI`; `Proxy Gateway` | SH-01 | Product and console identity. |
| Sidebar | `总览`; `用户监管`; `平台监控`; `审计与工单`; `平台开发`; `系统设置` | SH-02 | `总览` active; other entries show lock markers until their pages are real. |
| Sidebar footer | `生产环境操作我们来保护`; `请通过门禁申请后执行` | SH-07 | Safety copy; should link only when a safety/runbook page exists. |
| Global search | `搜索用户、订单、通道、工单或事件`; `⌘ K` | SH-03 | Search scope is users, orders, channels, cases, events. |
| Environment | `生产环境` | SH-04 | Read-only environment signal until settings/permission contracts exist. |
| Notifications | Badge `12` | SH-05 | Opens or previews risk/case queue only when implemented. |
| Operator area | help icon; shield icon; `operator` | SH-06 | Session/operator affordance without exposing secrets or raw profile data. |

### Overview Header And Metric Cards

| Region | Visible text | Requirement IDs | Implementation note |
| --- | --- | --- | --- |
| Header | `运营控制台`; `刷新于 12:30:45` | OV-01, OV-02 | Exact refresh copy pattern is `刷新于 HH:mm:ss`. |
| Metric card | `平台健康`; `良好`; `近 5 分钟` | OV-10 | Platform health should combine safe Admin/API/channel readiness facts. |
| Metric card | `风险案件`; `18`; `较昨日 +6` | OV-11 | Delta copy is part of the card, not just the count. |
| Metric card | `采集新鲜度`; `2 分 14 秒`; `P95 延迟` | OV-12 | Freshness card uses P95 latency/freshness language. |
| Metric card | `通道覆盖`; `98.6%`; `可用通道占比` | OV-13 | Coverage is measured/available safe channel coverage. |

### `监管案件`

| Region | Visible text | Requirement IDs | Implementation note |
| --- | --- | --- | --- |
| Header | `监管案件`; badge `18` | OV-20 | Count must match safe computed case candidates. |
| Severity filters | `全部 18`; `高风险 5`; `中风险 9`; `低风险 4` | OV-21 | Local filter tabs; selected tab visible. |
| Case row | `订单流量超额`; `涉及订单 12`; badge `9` | OV-22 | Maps to over-limit or quota-risk candidate group. |
| Case row | `采集延迟`; `超过阈值 5 分钟`; badge `6` | OV-22 | Maps to freshness/stale usage candidate group. |
| Case row | `回执缺失`; `超过阈值 15 分钟`; badge `3` | OV-22 | Maps to receipt-missing candidate group. |
| Footer link | `查看全部案件` | OV-23 | Must stay disabled or gated until durable cases page exists. |

### `用户与资源`

| Region | Visible text | Requirement IDs | Implementation note |
| --- | --- | --- | --- |
| Header | `用户与资源`; `查看全部` | OV-30, OV-34 | Preview of user supervision page. |
| Table header | `用户账号`; `关联订单`; `配额用量`; `风险状态` | OV-30 | These are the required first-slice columns. |
| Row | `user_001`; `order_2048`; `72%`; `正常` | OV-30, OV-31, OV-32 | Safe refs only; no raw identity/token/url. |
| Row | `user_002`; `order_2047`; `45%`; `正常` | OV-30, OV-31, OV-32 | Quota meter and status chip. |
| Row | `user_003`; `order_2046`; `92%`; `中风险` | OV-30, OV-31, OV-32 | Near-limit risk state. |
| Row | `user_004`; `order_2045`; `15%`; `正常` | OV-30, OV-31, OV-32 | Low utilization normal state. |
| Row | `user_005`; `order_2044`; `88%`; `中风险` | OV-30, OV-31, OV-32 | Near-limit risk state. |
| Footer link | `查看全部用户与资源` | OV-34 | Navigates to `用户监管` only when page is real. |

### `对象时间线`

| Region | Visible text | Requirement IDs | Implementation note |
| --- | --- | --- | --- |
| Header | `对象时间线` | OV-40 | Cross-object event preview. |
| Object filters | `全部`; `用户账号`; `订单`; `订阅产物`; `通道` | OV-40 | Filter event list by object type. |
| Selected object | `user_001`; `用户账号` | OV-41 | Selected safe user reference. |
| Object chain | `order_2048`; `订单`; `sub_8192`; `订阅产物`; `cn-hk-01`; `通道` | OV-41 | User -> order -> artifact -> channel chain. |
| Event | `配额使用更新`; `系统`; `配额使用率更新为 72%（阈值 80%）`; `12:29:10` | OV-42 | Quota event generated from safe usage summary. |
| Event | `订单流量更新`; `系统`; `订单 order_2048 本小时流量 18.6 GB`; `12:15:33` | OV-42 | Bounded traffic event; no raw rows. |
| Event | `回执已恢复`; `通道`; `通道 cn-hk-01 回执恢复正常`; `12:05:21` | OV-42 | Receipt recovery event. |
| Event | `采集延迟告警`; `系统`; `通道 cn-hk-01 采集延迟 8 分 12 秒`; `11:58:07` | OV-42 | Freshness warning event. |
| Event | `订阅产物生效`; `系统`; `订阅产物 sub_8192 已生效`; `11:30:44` | OV-42 | Artifact lifecycle event, safe ref only. |
| Event | `用户登录`; `安全`; `控制台登录成功（MFA）`; `09:12:11` | OV-42 | Operator/security event. |
| Footer link | `查看完整时间线` | OV-44 | Must stay gated until durable object history exists. |

### `流量与通道`

| Region | Visible text | Requirement IDs | Implementation note |
| --- | --- | --- | --- |
| Header | `流量与通道`; `近 1 小时` | OV-50, OV-51 | Platform-monitoring preview with time window. |
| Status filters | `全部 24`; `正常 20`; `降级 2`; `异常 2`; `未使用 4` | OV-50, OV-53 | Counts and states must be derived, not hardcoded. |
| Table header | `通道标识`; `状态`; `流量 (req/s)`; `错误率`; `采集新鲜度`; `回执状态`; `使用率` | OV-52 | Required channel ledger columns. |
| Row | `cn-hk-01`; `正常`; `128`; `0.12%`; `1 分 08 秒`; `正常`; `63%` | OV-52, OV-53 | Healthy measured channel. |
| Row | `sg-sg-02`; `正常`; `95`; `0.08%`; `1 分 42 秒`; `正常`; `47%` | OV-52, OV-53 | Healthy measured channel. |
| Row | `us-la-03`; `降级`; `18`; `1.32%`; `8 分 12 秒`; `延迟`; `9%` | OV-52, OV-53 | Degraded/stale channel. |
| Row | `eu-fr-04`; `异常`; `0`; `-`; `> 30 分钟`; `缺失`; `0%` | OV-52, OV-53 | Abnormal channel with missing receipt. |
| Row | `jp-tk-05`; `未使用`; `0`; `-`; `-`; `-`; `0%` | OV-52, OV-53 | Unused channel state. |
| Footer link | `查看所有通道` | OV-54 | Navigates to `平台监控` only when page is real. |

## OCR-To-Implementation Alignment

| Concept region | Primary page | Required implementation unit | First backend/data contract | Gate |
| --- | --- | --- | --- | --- |
| Shell/top bar | Shared shell | Brand, nav, search, env, notifications, operator menu, safety footer. | Local nav config plus safe session/environment summary. | SH-01 through SH-07. |
| Four metric cards | `总览` | Reusable `MetricCard` plus bounded sparklines. | Safe overview aggregate service or page-level derived selectors. | OV-10 through OV-13. |
| `监管案件` | `总览`; later `审计与工单` | Risk queue preview with severity filters and grouped case candidates. | Existing safe usage/portal summaries first; durable case store later. | OV-20 through OV-23, AW-01. |
| `用户与资源` | Current owner: `用户监管`; concept sourced from `总览` image | User/resource table, quota meter, risk chip, row selection. | Portal request summaries plus order usage metadata. | OV-30 through OV-34, US-03 through US-06. |
| `对象时间线` | Current owner: future `审计与工单`; interim owner-page history entries only | Object chain and event preview for user/order/artifact/channel. | Computed safe events first; durable object history later. | OV-40 through OV-44, AW-03. |
| `流量与通道` | Current owner: `平台监控`; concept sourced from `总览` image | Channel ledger with status filters and freshness/receipt states. | Usage monitor rows, channel aggregation, receipt state. | OV-50 through OV-54, PM-01 through PM-07. |

The concept image visually specifies a rich first-screen direction, but current
implementation ownership is split by operator decision. It only names the other
pages in navigation, so `用户监管`, `平台监控`, `审计与工单`, `平台开发`, and
`系统设置` below are derived from the approved product responsibility split and
must be reviewed page-by-page before implementation.

## Product Brief

Build GlobalCircle AI Admin as a protected operator console for supervision and
maintenance. The console is not the user portal, not a subscription creation
form, and not a direct production execution panel.

The concept maps to six work areas:

| Area | Page state | Purpose |
| --- | --- | --- |
| `总览` / `运营控制台` | Active first screen | Cross-surface health, risk summary, and routing to the owning pages for detailed account/resource, usage/channel, and future audit work. |
| `用户监管` | Active or next detailed page | User accounts, resources, orders, subscription artifacts, quota, account lifecycle, and controlled account actions. |
| `平台监控` | Active or next detailed page | Usage accounting trust, channel health, collector freshness, receipt coverage, and data-anomaly diagnosis. |
| `审计与工单` | Planned locked page | Durable cases, audit notes, object history, assignment, close/reopen review. |
| `平台开发` | Planned locked page | Channel/node strategy, platform tooling, canary planning, safe dry-run utilities. |
| `系统设置` | Planned locked page | Private operator settings, environment/API connection, refresh behavior, permissions, and safety configuration. |

Navigation lock icons in the concept are permission and readiness signals. A
section may become clickable only when it has a real page, safe data source,
redaction boundary, tests, and validation. It must not become a placeholder
route just to match the visual.

## Shell Requirements

| ID | Region | Requirement | Interaction | Data/source | Status |
| --- | --- | --- | --- | --- | --- |
| SH-01 | Brand rail | Show GlobalCircle AI logo, `Proxy Gateway` product subtitle, and compact operator-console shell. | Sidebar collapse button can be added after layout is stable. | Local asset/design token only. | UI required. |
| SH-02 | Navigation | Show `总览`, `用户监管`, `平台监控`, `审计与工单`, `平台开发`, `系统设置`. | Active real pages navigate; gated pages render locked and explain entry gate. | `admin/src/app/navigation.ts`; IA doc. | Partly implemented. |
| SH-03 | Global search | Search users, orders, channels, cases, or events. | Keyboard shortcut label visible; later scoped results dropdown. | Future global safe search endpoint or local page search adapters. | Planned. |
| SH-04 | Environment selector | Show current environment such as `生产环境` with protected-state chip. | Selector opens only safe configured environments; no production mutation. | Admin session/config summary. | UI required. |
| SH-05 | Notifications | Show risk notification count. | Opens filtered risk/case queue, not browser alerts. | Case candidates now; durable cases later. | UI required. |
| SH-06 | Help and operator menu | Show help icon, shield/protected-console marker, and operator identity. | Menu can expose profile/session/settings only after private settings page exists. | Local session and future operator profile summary. | Planned. |
| SH-07 | Safety footer | Show production-environment protection copy in the sidebar footer. | Link to safety/runbook page only when such page exists. | Static copy plus docs link. | UI required. |

Shell acceptance:

- Active navigation must not include empty pages.
- Search and notification surfaces must never reveal tokens, URLs, raw config,
  raw logs, raw env values, SQLite rows, or customer-private data.
- The first viewport must show the protected Admin role before any operational
  data cards.

## Page 1: `总览` / `运营控制台`

The overview is the exact concept screen. It should answer whether the platform
is reviewable, what needs attention, which user/order/channel objects are
involved, and what changed recently.

### Header And Refresh

| ID | Card/section | Requirement | Interaction | Data/source | Priority |
| --- | --- | --- | --- | --- | --- |
| OV-01 | Page title | Title `运营控制台`, last refresh timestamp, refresh icon. | Manual refresh reloads all overview-safe summaries. | Admin overview, portal requests, usage monitor. | P0 |
| OV-02 | Time copy | Show `刷新于 HH:mm:ss` rather than vague stale text. | If disconnected, show `未连接` and keep layout stable. | Generated/loaded timestamps. | P0 |

### Metric Cards

| ID | Card | Display fields | Interaction | Data/source | Priority |
| --- | --- | --- | --- | --- | --- |
| OV-10 | `平台健康` | State label (`良好`, `阻断`, `未知`), time window (`近 5 分钟`), small trend line. | Click filters timeline to platform health events. | Admin overview distribution readiness, API load errors, node/channel availability. | P0 |
| OV-11 | `风险案件` | Count, delta versus previous period, red trend line. | Click opens risk case queue with `全部` selected. | Computed case candidates now; durable cases later. | P0 |
| OV-12 | `采集新鲜度` | P95 latency or freshness duration such as `2 分 14 秒`, blue trend. | Click opens platform monitoring freshness section. | Usage monitor generatedAt, last usage observation age, stale thresholds. | P0 |
| OV-13 | `通道覆盖` | Measured/available channel coverage percentage and green trend. | Click opens channel coverage table. | Issued channel count, measured channel count, receipt status. | P0 |

Metric card rules:

- Values are operator signals, not marketing metrics.
- `0 B` or missing samples must never be collapsed into `良好`.
- Trend lines may start as lightweight SVG/canvas-free sparklines from bounded
  arrays; they must not use fake production data.

### `监管案件` Card

| ID | Feature | Requirement | Interaction | Data/source | Priority |
| --- | --- | --- | --- | --- | --- |
| OV-20 | Case count | Header `监管案件` plus count badge. | Count matches visible safe candidates. | Case candidates from portal requests and usage rows. | P0 |
| OV-21 | Severity tabs | `全部`, `高风险`, `中风险`, `低风险` with counts. | Filter local list; selected tab visible. | Case candidate severity. | P0 |
| OV-22 | Case row | Icon, title, subtitle/reason, count badge, chevron. Example: `订单流量超额`, `采集延迟`, `回执缺失`. | Row selection highlights the computed risk and points to the owning page; durable object detail waits for `审计与工单`. | Reason taxonomy: over_limit, usage_stale, receipt_missing, collector_disabled, not_collected, archive_candidate. | P0 |
| OV-23 | View all | `查看全部案件`. | Navigate only after `审计与工单` has a real durable page; otherwise non-clicking disabled copy. | Navigation IA. | P1 |

No close, assign, archive, false-positive, disable, or execute button belongs
in this card until durable case/history backend exists.

### `用户与资源` Card

| ID | Feature | Requirement | Interaction | Data/source | Priority |
| --- | --- | --- | --- | --- | --- |
| OV-30 | Summary table | Columns: `用户账号`, `关联订单`, `配额用量`, `风险状态`. | Current owner page selects user/order detail; Overview shows only route or aggregate summary. | Portal access request summaries, order usage metadata. | P0 |
| OV-31 | Quota meter | Percent value plus compact progress bar. | Hover/title can expose used/limit and last collected time. | `usedBytes`, `trafficLimitBytes`, collection status. | P0 |
| OV-32 | Risk chip | `正常`, `中风险`, `超额`, `延迟`, `未采集`. | Chip color must match state language. | Derived from quota ratio and usage collection status. | P0 |
| OV-33 | Row action menu | Kebab menu visible for future actions. | Disabled or read-only until account/resource action contracts exist. | Future account/resource backend. | P2 |
| OV-34 | View all | `查看全部用户与资源`. | Navigate to `用户监管` page. | Current navigation route. | P0 |

This card must not expose raw subscription URLs, tokens, credentials, or full
customer-private identity. Use safe refs such as `user_001` and `order_2048`.

### `对象时间线` Card

| ID | Feature | Requirement | Interaction | Data/source | Priority |
| --- | --- | --- | --- | --- | --- |
| OV-40 | Object tabs | Filters: `全部`, `用户账号`, `订单`, `订阅产物`, `通道`. | Filter timeline events by object type. | Current computed events; durable history later. | P0 |
| OV-41 | Object chain | Show selected object chain such as user -> order -> subscription artifact -> channel. | Chips are selectable safe refs; no raw material. | Portal request summary, usage row channel refs. | P0 |
| OV-42 | Timeline events | Show event title, source/system chip, timestamp, and detail. | Click can select matching case/resource row. | Current synthetic timeline from safe summaries; future durable audit events. | P0 |
| OV-43 | Filter icon | Reserved for timeline filters. | Disabled until durable event types exist. | Future case/history backend. | P2 |
| OV-44 | View full timeline | Link at bottom. | Promote only when `审计与工单` page exists. | Navigation IA. | P2 |

The concept timeline may use computed safe events as source material, but the
current Overview must not render a full timeline. Durable history belongs to
`审计与工单`; interim history entry points stay under owner pages.

### `流量与通道` Card

| ID | Feature | Requirement | Interaction | Data/source | Priority |
| --- | --- | --- | --- | --- | --- |
| OV-50 | Status filters | `全部`, `正常`, `降级`, `异常`, `未使用` with counts. | Filter table locally. | Usage monitor channel/order rows. | P0 |
| OV-51 | Time range | Dropdown such as `近 1 小时`. | Changes trend window only after data exists; otherwise disabled. | Usage monitor time-series. | P1 |
| OV-52 | Channel table | Columns: channel safe ref, status, traffic sparkline + req/s, error rate, freshness, receipt status, utilization. | Row click selects channel detail in `平台监控`; future object timeline waits for `审计与工单`. | Subscription usage monitor rows, channel aggregation, receipt state. | P0 |
| OV-53 | Status language | `正常`, `降级`, `异常`, `未使用`, `延迟`, `缺失`. | Color and icon must remain consistent. | Derived from collection, error, receipt, and activity facts. | P0 |
| OV-54 | View all | `查看所有通道`. | Navigate to `平台监控` page. | Current navigation route. | P0 |

This section is a platform-monitoring preview. It does not start collectors,
apply runtime changes, reset credentials, or disable orders.

## Classification Rule

The concept image is visually correct, but implementation ownership is not
assigned by object noun. Assign each card by the operator decision:

- quota policy, over-limit disposition, order pause/archive, artifact
  lifecycle, and account disablement belong to `用户监管`;
- usage freshness, true zero usage, missing samples, collector disabled,
  receipt missing, and channel coverage belong to `平台监控`;
- durable review, notes, close/reopen, and false-positive workflow belong to
  `审计与工单` after the backend exists;
- `运营总览` summarizes these states and sends the operator to the owner page.

When platform monitoring displays `超额` or `接近额度`, it is evidence from
usage accounting, not authority to edit quota or pause an order.

## Page 2: `用户监管`

`用户监管` expands `用户与资源` into an account/resource workbench. It supervises
accounts and their resources; it does not create subscriptions as the primary
task.

| ID | Section | Requirement | Data/source | Backend gap | Priority |
| --- | --- | --- | --- | --- | --- |
| US-01 | Page header | Title `用户监管`, responsibility copy, data freshness, safe boundary. | Local page + summaries. | None. | P0 |
| US-02 | Account filters | Search account/order/resource; filters for account status, order status, quota risk, collection state. | Portal request summaries and usage metadata. | Better account status contract. | P0 |
| US-03 | Account table | Columns: account safe ref, account lifecycle, resource count, delivered orders, quota risk, last activity, next review. | Portal request summaries; future account summaries. | Durable account lifecycle. | P0 |
| US-04 | Account detail | Safe identity refs, account enabled/disabled state, security state, recent account events. | Portal user/account summaries. | Account-management backend. | P1 |
| US-05 | Resource/order table | Order ref, plan, duration, entitlement ref, access grant ref, subscription artifact safe ref, delivery/lifecycle status. | Portal request summaries, issuance summaries. | Full account->resource index. | P0 |
| US-06 | Quota panel | Default limit, edited limit, used/total, ratio meter, last collection, measured channels, audit note. | Order usage metadata and traffic limit update summary. | Durable quota audit list. | P0 |
| US-07 | Account actions | Create account, enable/disable account, review risk, update quota. | Future controlled account service. | Needs backend contract and tests. | P2 |
| US-08 | Lifecycle separation | Account disabled, order paused, subscription expired, artifact revoked, and quota overage must be separate chips. | Existing state language plus future account states. | Account lifecycle fields. | P0 |

Controlled action boundary:

- Account creation/disable belongs here, not subscription creation.
- Order pause/revoke/archive and quota enforcement remain separate lifecycle
  review flows.
- Any production-affecting account/order mutation needs explicit backend
  contract, audit event, tests, and risk reclassification before implementation.

## Page 3: `平台监控`

`平台监控` expands `流量与通道` into the usage, collector, channel, receipt, and
anomaly diagnosis page.

| ID | Section | Requirement | Data/source | Backend gap | Priority |
| --- | --- | --- | --- | --- | --- |
| PM-01 | Freshness strip | Collector configured, last collection, stale threshold, unknown count, measured channel coverage. | Usage monitor generatedAt, collectionStatus, channel counts. | Runtime collector health summary. | P0 |
| PM-02 | Usage cards | Upload, download, total used, measured orders, zero-usage orders, over-limit/near-limit. | Usage aggregates and order rows. | Time-series rollups for trend. | P0 |
| PM-03 | Channel coverage | Issued channels, measured channels, missing channel count, receipt blockers. | Usage rows, issued channels, receipts. | First-class channel aggregate endpoint. | P0 |
| PM-04 | Time-series chart | Usage trend by account/order/channel with visible legend. | Current history if available; otherwise bounded recent rows. | Durable time-series query. | P1 |
| PM-05 | Collection anomaly queue | Stale usage, true zero, not collected, collector disabled, missing artifact/ref/receipt, plus over-limit/near-limit evidence for correlation. | Warnings and derived case candidates. | Backend anomaly summary endpoint optional. | P0 |
| PM-06 | Channel ledger | Channel safe ref, status, traffic, error rate, freshness, receipt, utilization, linked order count. | Usage monitor rows and channel aggregation. | Channel health rollup. | P0 |
| PM-07 | Order usage ledger | Account ref, order ref, plan, issued channels, safe edge credential coverage, upload/download/total, quota decision, last observed, warnings. | Existing subscription usage monitor. | None for first slice. | P0 |
| PM-08 | Collector controls | Show collector availability and last run. | Future collector state summary. | Runtime collection service contract. | P2 |

The platform monitor may prepare operator review context. It must not activate
runtime collectors, mutate channel config, apply desired state, or disable
orders without a separate gate.

## Page 4: `审计与工单`

This page is planned and locked until durable Case/history facts exist. The
overview can preview a selected case, but the full page needs real storage.

| ID | Section | Requirement | Data/source | Entry gate |
| --- | --- | --- | --- | --- |
| AW-01 | Case inbox | Durable case list with severity, owner, status, linked object, updated time. | Future case store. | GCC-55 durable Case/history backend. |
| AW-02 | Case detail | Evidence, linked objects, notes, audit events, source rows, suggested next action. | Future case + audit events. | Safe redaction tests. |
| AW-03 | Object history | Cross-object timeline for account, order, artifact, channel, receipt, quota, support. | Future durable object history. | Event taxonomy and storage. |
| AW-04 | Review workflow | Assign, note, close, reopen, mark false-positive. | Future case service. | Audit trail and authorization. |
| AW-05 | Work-order bridge | Convert case into dry-run plan or Risk A approval packet when needed. | Future plan generator. | Explicit non-execution boundary. |

This page is not a production execution queue. Work orders may prepare review
packets, but execution remains outside the UI unless a separate approved path
exists.

## Page 5: `平台开发`

This page is planned and locked. It should support platform evolution without
turning Admin into a runtime mutation panel.

| ID | Section | Requirement | Data/source | Entry gate |
| --- | --- | --- | --- | --- |
| PD-01 | Channel strategy | Compare channel candidates, quality reports, and rollout recommendations. | Existing safe channel planning helpers. | Safe platform-tool adapter page. |
| PD-02 | Node onboarding | Show node registration readiness, material handoff preflight, receipt coverage. | Safe node registry/preflight summaries. | No-secret node tool contracts. |
| PD-03 | Collector lab | Review collector readiness and sample coverage. | Future collector summaries. | Runtime collector contract. |
| PD-04 | API diagnostics | Safe API health, route availability, version/build metadata. | Local/Admin status summaries. | Redaction boundary. |
| PD-05 | Sandbox utilities | Dry-run-only utilities for operator planning. | Existing CLI helpers where safe. | No production mutation authority. |

## Page 6: `系统设置`

This page is planned and locked. It contains private operator-console settings,
not public product settings.

| ID | Section | Requirement | Data/source | Entry gate |
| --- | --- | --- | --- | --- |
| ST-01 | Admin API connection | Base URL/session/token input for local protected Admin testing. | Existing connection panel. | Private/local-only boundary. |
| ST-02 | Environment profiles | Safe environment labels and current environment status. | Config summaries. | No secret values shown. |
| ST-03 | Refresh behavior | Auto refresh interval, manual refresh, stale thresholds. | Local UI settings. | Persisted private settings. |
| ST-04 | Permissions | Operator role, locked sections, feature visibility. | Future operator profile. | Auth/permission review. |
| ST-05 | Safety policy | Redaction, no-public-Admin, no-raw-material reminders. | Static policy and docs links. | None. |

## Shared UI Primitive Backlog

These primitives should be implemented once and reused across pages:

| ID | Primitive | Required behavior |
| --- | --- | --- |
| UI-01 | `PageHeader` | Title, responsibility, freshness, safety/status line, optional actions. |
| UI-02 | `MetricCard` | Icon, label, value, trend, source note, semantic tone. |
| UI-03 | `StatusChip` | Stable tones for success, info, warning, danger, neutral, disabled. |
| UI-04 | `QuotaMeter` | Used/limit, ratio, overage, measured channels, timestamp. |
| UI-05 | `Sparkline` | Bounded tiny trend line with empty/disconnected state. |
| UI-06 | `RiskQueue` | Severity filters, counts, selected row, reason taxonomy. |
| UI-07 | `ObjectChain` | Safe linked refs for user/order/artifact/channel. |
| UI-08 | `ObjectTimeline` | Filtered events, source chip, timestamp, linked object. |
| UI-09 | `DataTable` | Dense operator table, stable columns, responsive overflow, empty/loading/error states. |
| UI-10 | `SafeRef` | Short non-secret refs with copy only when safe and useful. |

## Implementation Phases

| Phase | Scope | Output | Validation |
| --- | --- | --- | --- |
| Phase 0 | Concept parsing, OCR/visual text ledger, and requirement matrix. | This document plus links from baseline/index docs. | `git diff --check origin/master...HEAD`. |
| Phase 1 | Overview concept parity. | Shell, four metric cards, risk case queue, and next-action routing; detailed user/resource, traffic/channel, and object-history regions are routed to owner pages. | Admin tests, build, Browser QA. |
| Phase 2 | `用户监管` detail page. | Account/resource/order/quota workbench with clear account versus order lifecycle. | Admin tests, build, server tests for safe summaries if API changes. |
| Phase 3 | `平台监控` detail page. | Freshness strip, usage cards, channel coverage, collection anomaly queue, channel/order ledgers. | Admin tests, build, usage monitor server tests. |
| Phase 4 | Durable `审计与工单`. | Case store, audit events, notes, object history, close/reopen workflow. | Separate B/A classification depending on schema/runtime impact. |
| Phase 5 | `平台开发` and `系统设置`. | Safe platform tools and private settings only after entry gates. | Per-page validation and safety tests. |

## One-By-One Review Checklist

Use this checklist when implementing or reviewing each card:

1. Does the card map to one decision owner and one primary operator question?
2. Are all labels copied from the concept or approved state-language docs?
3. Is the data source real, safe, and redacted?
4. Is the empty/disconnected state explicit and stable?
5. Are unknown, stale, true zero, over-limit, receipt-missing, and disabled
   states visually distinct?
6. Does any click navigate only to a real page?
7. Does any action avoid production mutation unless a separate gate exists?
8. Does the card avoid subscription URLs, tokens, credentials, raw config, raw
   logs, raw env values, SQLite rows, and customer-private data?
9. Is there a focused test for the state or interaction?
10. Has Browser QA confirmed the card fits desktop and mobile without overlap?
