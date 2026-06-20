# Admin Console Overview Figma Spec

Last updated: 2026-06-20, Asia/Shanghai.

> Status:
> - Source Figma file:
>   <https://www.figma.com/design/EvQXTtJ2XnRfcGxRLTRt0B>
> - Target page: `01 Overview Console`
> - Risk: C for this design spec; follow-up Admin UI code work is B
> - Production impact: None
> - Execution authority: Does not authorize production, AWS, Vultr, DNS,
>   Nginx, systemd, DB, runtime, auth model, schema/migration, token,
>   credential, subscription URL, raw config/log/env, SQLite row, or
>   customer-data actions

This document preserves the concept-image design intent for the `总览 / 运营控制台`
first screen. It exists because the current Figma MCP session hit the Starter
plan tool-call limit before the page could be written.

Use this spec only after applying the ownership rules in
`docs/ADMIN_CONSOLE_UI_PROMPT_TRACEABILITY.md`. The current React implementation
keeps Overview focused on summary and routing: `Health Summary`, `Risk Queue`,
and `Next Actions`. The old concept regions for account/resource rows, object
timeline, and channel ledger are source material for owner pages, not
Overview-owned content.

The source concept image and early Figma notes contain Chinese planning copy.
For the current GCC-103 handoff, React-visible UI labels remain English
canonical unless an explicit locale adapter and tests are added. Figma frames
may keep Chinese annotations for planning, but implementation labels, route
names, test anchors, and copy handoff should map to the existing English Admin
contract.

## Design Intent

The overview is an operator console first screen. It must answer:

1. Is the platform reviewable right now?
2. Which computed risks need attention?
3. Which owner page should the operator open next?
4. Are production actions still gated?

It is not a subscription creation form, not a runtime execution console, and
not a public customer surface.

## Canvas

| Item | Value |
| --- | --- |
| Frame name | `Overview Console / 1600x1024` |
| Size | `1600 x 1024` |
| Background | `#F8FAFC` |
| App shell | Sidebar + top bar + content workbench |
| Sidebar width | `240` |
| Top bar height | `64` |
| Content padding | `24` |
| Card radius | `12` for dashboard cards; `8` for compact controls |
| Stroke | `#D8E1EE` / `#E2E8F0` |
| Primary blue | `#0F5ED7` |
| Success green | `#0A7A45` |
| Warning orange | `#C2410C` |
| Danger red | `#B91C1C` |
| Text primary | `#0F172A` |
| Text secondary | `#475569` |
| Text muted | `#64748B` |
| Font | `Noto Sans SC` for Chinese UI text; `Inter` only for numeric fallback if needed |

## Shell Layout

| Region | Size/position | Content | Notes |
| --- | --- | --- | --- |
| Sidebar | `240 x 1024` left | Logo, product subtitle, nav, safety footer. | Active item `总览`; planned items locked. |
| Top bar | `1360 x 64` top right | Search, environment selector, alerts, help, shield, operator menu. | No secret/session raw values. |
| Content | `1360 x 960` under top bar | Header, metric cards, risk queue, next-action routing. | Fits first viewport without scroll in desktop spec. |

### Sidebar Content

| Item | Text | State |
| --- | --- | --- |
| Brand | `GlobalCircle AI` | Visible |
| Subtitle | `Proxy Gateway` | Visible |
| Nav 1 | `总览` | Active |
| Nav 2 | `用户监管` | Locked or active when real route exists |
| Nav 3 | `平台监控` | Locked or active when real route exists |
| Nav 4 | `审计与工单` | Locked |
| Nav 5 | `平台开发` | Locked |
| Nav 6 | `系统设置` | Locked |
| Footer | `生产环境操作我们来保护`; `请通过门禁申请后执行` | Safety copy |

### Top Bar Content

| Item | Text/state | Notes |
| --- | --- | --- |
| Search | `搜索用户、订单、通道、工单或事件`; shortcut `⌘ K` | Search shell only until global safe search exists. |
| Environment | `生产环境` | Read-only selector in first slice. |
| Notifications | badge `12` | Opens risk/case queue only after route exists. |
| Operator | `operator` | Safe display name only. |

## Content Layout

Content uses three ownership-safe vertical bands:

1. Header + metric cards.
2. Risk queue with severity filters and safe summary rows.
3. Next-action routing to the owning pages.

The old concept's `用户与资源`, `对象时间线`, and `流量与通道` regions are no
longer Overview-owned implementation areas. They are routed as follows:

| Concept region | Owning page |
| --- | --- |
| `用户与资源` | `Accounts & Resources` |
| `对象时间线` | Future `Audit & Cases`, with interim history entry points in `Accounts & Resources` |
| `流量与通道` | `Usage & Channels` |

### Current Overview Subnavigation

| Section | Role |
| --- | --- |
| `Health Summary` | Metric cards and platform reviewability. |
| `Risk Queue` | Computed risk candidates and severity filters. |
| `Next Actions` | Route cards into the owner pages; no detailed ledger ownership. |

## Header

| Element | Text | Requirement |
| --- | --- | --- |
| Title | `运营控制台` | Page title. |
| Freshness | `刷新于 12:30:45` | Use `刷新于 HH:mm:ss`; disconnected state uses `未连接`. |
| Refresh icon | visual only | Manual refresh hook when API wiring exists. |

## Metric Cards

Cards are four equal columns across the content width, excluding right panel
when the design uses a separate timeline column.

| Card | Value | Source note | Tone |
| --- | --- | --- | --- |
| `平台健康` | `良好` | `近 5 分钟` | Success |
| `风险案件` | `18` | `较昨日 +6` | Danger |
| `采集新鲜度` | `2 分 14 秒` | `P95 延迟` | Info |
| `通道覆盖` | `98.6%` | `可用通道占比` | Success |

Each card includes:

- small icon chip;
- label;
- dominant value;
- source note;
- tiny sparkline;
- empty/disconnected state.

## `监管案件`

| Element | Text/state |
| --- | --- |
| Header | `监管案件` + badge `18` |
| Tabs | `全部 18`; `高风险 5`; `中风险 9`; `低风险 4` |
| Row 1 | `订单流量超额`; `涉及订单 12`; badge `9` |
| Row 2 | `采集延迟`; `超过阈值 5 分钟`; badge `6` |
| Row 3 | `回执缺失`; `超过阈值 15 分钟`; badge `3` |
| Footer | `查看全部案件` |

Interaction:

- tabs filter local visible rows;
- row selection drives timeline/object detail;
- footer stays disabled/gated until durable case page exists.

## Concept Regions Routed Out Of Overview

These regions came from the concept image and remain useful design material,
but they must not be implemented as detailed Overview collections.

| Concept region | Original visual intent | Current implementation prompt |
| --- | --- | --- |
| `用户与资源` | Safe user/order/quota/risk rows. | Implement as `Accounts & Resources` account/resource/order review content. In Overview, show only a route card or computed summary count. |
| `对象时间线` | Object filters, object chain, and safe event list. | Implement later in durable `Audit & Cases`; interim history entry points belong under owner pages. In Overview, show only the next review target. |
| `流量与通道` | Channel status filters, freshness, receipt state, usage rows. | Implement as `Usage & Channels` monitoring content. In Overview, show only aggregate freshness/coverage metrics and route action. |

Rules for all routed regions:

- show safe refs only;
- no raw customer identity, token, credential, or subscription URL;
- do not duplicate owner-page ledgers inside Overview;
- route by page ownership before adding any new card.

## Component Backlog From This Screen

| Component | Purpose | First code target |
| --- | --- | --- |
| `AdminShell` | Sidebar + top bar + content workbench. | `admin/src/components/layout/*` |
| `PageHeader` | Title, freshness, refresh status. | Shared UI component. |
| `MetricCard` | Operator metric with trend and source note. | Replace ad hoc card markup. |
| `RiskQueue` | Severity filters and risk rows. | `Operations Overview`, then future case page. |
| `QuotaMeter` | Percent, used/limit, overage and source state. | `Accounts & Resources`; Overview summary only. |
| `StatusChip` | Semantic state language. | All pages. |
| `ObjectChain` | Safe linked refs. | Future `Audit & Cases` or owner-page history. |
| `ObjectTimeline` | Safe event list. | Future durable audit; not current Overview. |
| `ChannelLedger` | Traffic/channel table. | `Usage & Channels`. |
| `Sparkline` | Bounded visual trend. | Metric cards and channel rows. |

## Implementation Acceptance

- The screen must fit the desktop `1600 x 1024` frame without overlapping text.
- The sidebar and top bar must remain visually stable when content data is
  missing.
- Unknown, stale, zero, disabled, over-limit, delayed, and receipt-missing
  states must be visually distinct.
- Overview must not render account/resource ledgers, object timelines, or
  channel ledgers as page-owned collections.
- Overview next actions must route detailed work to `Accounts & Resources`,
  `Usage & Channels`, or a gated future page.
- Links navigate only to real pages; planned pages remain gated.
- No raw subscription URLs, tokens, credentials, runtime config, env values,
  logs, SQLite rows, or customer-private data appear.
- Chrome/Browser/Computer QA must compare the implemented screen against this
  Figma page after the Figma canvas is generated.
