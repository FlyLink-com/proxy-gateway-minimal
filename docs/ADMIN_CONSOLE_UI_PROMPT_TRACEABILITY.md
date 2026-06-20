# Admin Console UI Prompt Traceability

Last updated: 2026-06-21, Asia/Shanghai.

> Status:
> - Risk: C for this prompt traceability document; follow-up Admin UI code work
>   is B unless it touches auth, schema, runtime, or production gates.
> - Production impact: None.
> - Execution authority: Does not authorize production, AWS, Vultr, DNS,
>   Nginx, systemd, DB, runtime, auth model, schema/migration, token,
>   credential, subscription URL, raw config/log/env, raw log, audit export,
>   SQLite row, or customer-data actions.

This document fixes the missing layer between design requirements and code:
the prompt relationship model. The Admin console should not be prompted as a
generic dashboard. Every page, section, component, and visual QA pass must be
driven by the same ownership path so repeated objects do not become repeated
pages.

## Source Path

Use this path when designing or implementing any Admin UI slice:

```text
concept image
  -> concept requirements matrix
  -> domain dictionary
  -> navigation IA
  -> relationship draft
  -> this prompt traceability map
  -> frontend page structure blueprint
  -> component/function blueprint or page spec
  -> React/Vite implementation
  -> tests and visual QA ledger
```

Do not skip from the concept image directly to React. That is how duplicated
cards, mixed page responsibilities, and long-scroll pages reappear.

## Prompt Layers

| Layer | Prompt responsibility | Source of truth | Output |
| --- | --- | --- | --- |
| Project prompt | Defines Admin as a protected operator console, not User Portal, not subscription creation, and not production execution. | `docs/ADMIN_CONSOLE_REBUILD_BASELINE.md` | Product boundary and visual direction. |
| Object prompt | Defines account, order, quota, usage, channel, receipt, case, history, setting, and platform tool terms. | `docs/ADMIN_CONSOLE_DOMAIN_DICTIONARY.md` | State language and object ownership. |
| Navigation prompt | Decides which page owns each operator decision. | `docs/ADMIN_CONSOLE_NAVIGATION_IA.md` and `admin/src/app/navigation.ts` | Active top-level pages and locked slots. |
| Relationship prompt | Maps expanded Admin needs into current, next, contract, and deferred waves. | `docs/ADMIN_CONSOLE_RELATIONSHIP_DRAFT.md` | Figma handoff scope and task sequencing. |
| Page prompt | Defines one page's primary question, allowed decisions, evidence-only facts, and forbidden decisions. | `pageWorkbenchContracts` in `admin/src/app/navigation.ts` | Page-local section list. |
| Structure prompt | Freezes page hierarchy, module ownership, locked-page gates, and implementation mapping before code work. | `docs/ADMIN_CONSOLE_FRONTEND_STRUCTURE_BLUEPRINT.md` | Page structure graph and module graph. |
| Section prompt | Defines one task-focused panel or sub-navigation section. | This document plus frontend structure blueprint and component blueprint. | One operator question, one owner, one data boundary. |
| Component prompt | Defines reusable component behavior, states, empty/disconnected states, and test focus. | `docs/ADMIN_CONSOLE_COMPONENT_FUNCTION_BLUEPRINT.md` | Primitive or page component. |
| Visual prompt | Defines density, spacing, card rhythm, tables, chips, meters, responsive behavior, and concept deviations. | Concept matrix, Figma spec, visual QA ledger. | Browser/Chrome/Computer QA checks. |
| Data prompt | Defines real safe sources, gaps, redaction, and no-fake-data rules. | Backend summaries, page selectors, data contract map. | View model and backend follow-up if needed. |

## Current Active Page Prompts

## Current Figma Handoff Boundary

The GCC-103 Figma/Admin UI handoff is not a request to design every future page
at production depth. Use this scope for the current handoff:

| Frame group | Must include | Must not include |
| --- | --- | --- |
| Shell and navigation | Active three pages, locked ordinary slots, top bar controls, protected-console safety line, App Library/search states. | Search results or hidden launchers for Key Management, Audit Center, or Log Access for non-super-admin users. |
| `Operations Overview` | Health Summary, Risk Queue, Next Actions, inspection summary as compact signal. | Full account/order ledger, raw audit trail, raw logs, key metadata, production action buttons. |
| `Accounts & Resources` | Account/user supervision, order count, active order count, per-user traffic, resources/orders, quota and lifecycle states, safe artifact refs. | Raw subscription URL, token, private key, credential, billing/payment expansion, runtime mutation controls. |
| `Usage & Channels` | Collection Freshness, Channel Coverage, Usage Ledger, Collection Anomalies, Receipts & Collectors; static route latency, agent status, and inspection summaries under the existing monitoring modules. | Raw logs, raw config, collector activation, quota decision ownership. |
| Future / privileged map | Clear callouts that System Settings/About/Key/Audit/Log are later waves with entry gates. | Clickable empty route pages or disabled placeholders that imply current availability. |

If the design needs to show super-admin Key/Audit/Log, it must be a separate
variant labelled future/deferred and must show MFA, reason, TTL, and no raw
secret/log fixture data. It is not part of the normal-operator frame set.

### Operations Overview

```text
Design the Operations Overview page as the cross-area routing surface.
It answers: what needs attention, and where should the operator go next?

Owns:
- platform health summary;
- top computed risk candidates;
- next review target routing.

May preview:
- account, order, quota, usage, channel, receipt, and anomaly facts only as
  compact signals that route to the owning page.

Must not own:
- account create/disable;
- quota editing or quota policy decisions;
- order pause/archive;
- collector diagnosis detail;
- durable case workflow;
- runtime apply or platform tools.

Current sections:
- Health Summary;
- Risk Queue;
- Next Actions.

Acceptance:
- no account/resource ledger table in Overview;
- no object timeline panel in Overview until durable history is intentionally
  reintroduced by IA update;
- no channel/order ledger in Overview;
- next-action cards route to Accounts & Resources or Usage & Channels;
- tests assert retired ledgers are absent.
```

### Accounts & Resources

```text
Design Accounts & Resources as the user operations decision owner.
It answers: which account owns which resources, and what quota or lifecycle
decision is needed?

Owns:
- account create/disable planning;
- account lifecycle;
- resource/order lifecycle;
- subscription artifact lifecycle;
- quota policy;
- order pause/archive planning.

May use as evidence:
- usage collection trust;
- channel coverage;
- receipt coverage;
- collection anomalies.

Must not own:
- runtime apply;
- platform tooling;
- operator settings;
- collector activation.

Current sections:
- Account Directory;
- Resources & Orders;
- Quota & Usage;
- Lifecycle;
- History & Events.

Acceptance:
- quota and lifecycle decisions live here, not in Platform Monitoring;
- channel/receipt facts are evidence only;
- future account actions require backend contract, audit, tests, and risk
  reclassification before becoming executable.
```

### Usage & Channels

```text
Design Usage & Channels as the platform monitoring evidence owner.
It answers: are usage collection, channels, and receipts trustworthy?

Owns:
- usage collection trust;
- channel coverage;
- receipt coverage;
- collection anomaly diagnosis.

May use as evidence:
- account refs;
- order refs;
- quota-risk signals.

Must not own:
- account create/disable;
- quota ownership or quota editing;
- order pause/archive;
- subscription artifact lifecycle;
- runtime apply;
- platform tooling;
- operator settings.

Current sections:
- Collection Freshness;
- Channel Coverage;
- Usage Ledger;
- Collection Anomalies;
- Receipts & Collectors.

Acceptance:
- over-limit and near-limit labels here are measurement evidence, not action
  authority;
- collector/receipt/channel states are visually distinct from account/order
  lifecycle states;
- charts, ledgers, filters, and anomaly queues stay inside this page.
```

### Locked Pages

```text
Design locked Admin pages as entry-gated future work areas.
They may appear as locked navigation slots only when the shell needs to show
the future console map.

Audit & Cases unlocks only after durable case/history facts exist.
Platform Development unlocks only after real safe tools and data contracts
exist.
System Settings unlocks only after a private settings boundary exists.

Acceptance:
- no clickable placeholder route;
- no empty page created for visual completeness;
- entry gate text explains what backend or safety contract is missing.
```

## Section Prompt Template

Use this template before adding or redesigning any card, table, timeline,
drawer, filter, or chart:

```text
Section:
Owner page:
Operator question:
Primary object:
Decision ownership:
- owned / preview-only / evidence-only
Allowed actions:
Forbidden actions:
Data source:
Known gap:
Redaction boundary:
States:
- loading:
- disconnected:
- empty:
- ready:
- stale/error:
Responsive rule:
Test contract:
Visual QA check:
```

If the section cannot be filled out, it should not be implemented yet.

## Component Prompt Template

```text
Build or reuse a component for:

Component role:
Used by pages:
Required props/state:
Display states:
Accessibility:
Responsive constraints:
Sensitive-data rule:
Existing primitive to reuse:
Test to add or update:
Visual QA expectation:

Do not add a one-off style if an existing primitive or token can carry the
behavior. Do not nest cards inside cards.
```

## Visual QA Prompt Template

```text
Check the Admin UI from outside to inside:

1. Shell: brand, active nav, locked slots, top bar controls, default popovers.
2. Page ownership: only the current page's allowed sections are visible.
3. Components: cards, tables, chips, meters, queues, timelines, charts.
4. States: loading, disconnected, empty, stale, warning, danger, ready.
5. Responsive: desktop and 390px mobile have no overlapping text or document
   horizontal overflow.
6. Console: no browser error/warn logs.
7. Boundary: no subscription URL, token, credential, raw config/log/env,
   SQLite row, or customer-private data.
```

## Anti-Drift Rules

- Never prompt "make an admin dashboard" without naming the owner page and
  operator question.
- Never classify by object noun alone. Classify by the decision the operator is
  making.
- Never move quota policy into Usage & Channels just because usage numbers are
  shown there.
- Never move channel/receipt diagnosis into Accounts & Resources just because
  an order row references a channel.
- Never reintroduce Overview ledgers after they were routed to owner pages
  unless `pageWorkbenchContracts`, IA docs, tests, and visual QA are updated
  together.
- Never use concept-copy parity as authority to create a placeholder route.
- Never use Product Design, Build Web Apps, Figma, Browser, Chrome, or Computer
  output as a higher authority than repo source, backend facts, and safety
  boundaries.

## Review Checklist

Before coding or accepting a UI slice:

1. The page prompt names one primary operator question.
2. The section prompt names one owner page.
3. The object is marked owned, preview-only, or evidence-only.
4. Forbidden actions are explicit.
5. Data source is real or the component shows a connected gap honestly.
6. Empty/disconnected/stale states are specified.
7. The matching test contract is named.
8. Browser/Chrome visual QA has a desktop and mobile check.
9. No sensitive material is displayed or stored.
10. The docs, `pageWorkbenchContracts`, tests, and implementation still agree.
