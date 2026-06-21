# Admin Console Visual QA Ledger

Last updated: 2026-06-21, America/Los_Angeles.

> Status:
> - Linear: GCC-68
> - Type: Concept-to-implementation visual QA ledger
> - Risk: C for this ledger; follow-up Admin UI code work is B
> - Production impact: None
> - Execution authority: Does not authorize production, AWS, Vultr, DNS,
>   Nginx, systemd, DB, runtime, auth model, schema/migration, token,
>   credential, subscription URL, raw config/log/env, SQLite row, or
>   customer-data actions

This ledger records how the New Admin console concept image maps to the local
React/Vite implementation and how Browser, Chrome, and Computer should be used
for visual acceptance.

Source references:

- Concept image:
  `docs/assets/admin-console/new-admin-console-rebuild-concept.png`
- Requirements matrix:
  `docs/ADMIN_CONSOLE_CONCEPT_REQUIREMENTS_MATRIX.md`
- Overview implementation spec:
  `docs/ADMIN_CONSOLE_OVERVIEW_FIGMA_SPEC.md`
- UI prompt traceability:
  `docs/ADMIN_CONSOLE_UI_PROMPT_TRACEABILITY.md`
- Domain dictionary:
  `docs/ADMIN_CONSOLE_DOMAIN_DICTIONARY.md`
- Component/function blueprint:
  `docs/ADMIN_CONSOLE_COMPONENT_FUNCTION_BLUEPRINT.md`
- Figma mirror:
  `docs/ADMIN_CONSOLE_FIGMA_MIRROR.md`

## Tool Roles

| Tool | Role | Current use | Fallback rule |
| --- | --- | --- | --- |
| Browser / IAB | Fast local DOM, viewport, console-log, and responsive checks. | Primary tool for this ledger. | Use first for local `127.0.0.1` checks. |
| Chrome | Real desktop-profile visual inspection when Browser viewport or extension state is insufficient. | Not required in this pass because Browser covered DOM, desktop, and mobile checks. | Use for final wide-screen polish or profile-specific issues. |
| Computer | Windows desktop-level fallback when browser automation cannot expose the visual state. | Not required in this pass. | Use only for visual capture or app-window issues that Browser/Chrome cannot inspect. |

## Current Figma Mirror Evidence

Figma connector evidence on 2026-06-21:

| Check | Result |
| --- | --- |
| Source file metadata | Read succeeded for `https://www.figma.com/design/EvQXTtJ2XnRfcGxRLTRt0B`. |
| Current top-level page | `00 Requirements Map`. |
| Current main frame | `GlobalCircle AI Admin Console / Requirements Map`, `1440 x 1200`. |
| Current mismatch | Several requirement-map row frames are shorter than their child cards, creating clipping risk. |
| Connector-reported seat | `Dev / developer`. |
| User-reported Figma UI access | Full access for the connected account. |
| Write attempt | Blocked while trying to resize clipped rows and create mirror pages. |
| Connector message | `get_metadata` and `get_screenshot` can read the file, but `use_figma` read-only execution is blocked with `User does not have view permission on file`. |
| Next action | Refresh or reconnect the Figma connector so the MCP `use_figma` session sees the same Full/edit permission shown in Figma UI, then rerun the mirror write step. |

Local mirror contract added:

| Contract | Purpose |
| --- | --- |
| `admin/src/design/figma-mirror.ts` | Canonical Figma file key, required mirror pages, page-to-React mapping, write-access blocker, and QA evidence axes. |
| `admin/src/test/admin-figma-mirror-contract.test.ts` | Verifies mirror page names, one page mirror per active Admin route, and blocker visibility. |
| `admin/src/test/admin-visual-qa-contract.test.tsx` | Verifies fixture shell landmarks, page/panel DOM ownership hooks, named interactive controls, and safe-data boundary. |

## Current Browser Evidence

Local target:

```text
http://127.0.0.1:5173/
```

Fresh Browser check on 2026-06-16 after the English canonical content slice:

| Viewport | Pages checked | Han copy in body/title | Global horizontal overflow | Console errors | Result |
| --- | --- | --- | --- | --- | --- |
| Browser split viewport `584px` | `Operations Overview`, `Accounts & Resources`, `Usage & Channels` | No | No | 0 | Pass |
| Desktop override `1440 x 900` | `Operations Overview`, `Accounts & Resources`, `Usage & Channels` | No | No | 0 | Pass |

Focused Browser check on 2026-06-21 after adding the Figma mirror and visual QA
contracts used `http://127.0.0.1:5173/#/fixture-preview`:

| Viewport | Page checked | Panels | Global horizontal overflow | Unnamed interactive controls | Sensitive text boundary | Console errors | Result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Browser override `1440 x 900` | `Operations Overview` | 3: `dashboard-health-summary`, `dashboard-risk-queue`, `dashboard-next-actions` | No | 0 | Pass | 0 | Pass |
| Browser override `390 x 844` | `Operations Overview` | 3: `dashboard-health-summary`, `dashboard-risk-queue`, `dashboard-next-actions` | No | 0 | Pass | 0 | Pass |

Clean Browser check on 2026-06-16 after the page-ownership cleanup used
`http://127.0.0.1:5175/` to avoid stale HMR console entries from the existing
5173 dev server:

| Viewport | Pages checked | Section ownership checked | Han copy in body/title | Global horizontal overflow | Scoped console errors | Result |
| --- | --- | --- | --- | --- | --- | --- |
| Browser override `584 x 900` | `Operations Overview`, `Accounts & Resources`, `Usage & Channels` | Overview section IDs, Accounts anchor order, Usage anchor order, delivery preview nesting, ledger/anomaly/receipts ownership | No | No | 0 | Pass |
| Browser override `1440 x 900` | `Operations Overview`, `Accounts & Resources`, `Usage & Channels` | Overview section IDs, Accounts anchor order, Usage anchor order, delivery preview nesting, ledger/anomaly/receipts ownership | No | No | 0 | Pass |

Page-local navigation observed:

| Page | Navigation labels observed |
| --- | --- |
| `Operations Overview` | `Health Summary`, `Risk Queue`, `Next Actions` |
| `Accounts & Resources` | `Account Directory`, `Resources & Orders`, `Quota & Usage`, `Lifecycle`, `History & Events` |
| `Usage & Channels` | `Collection Freshness`, `Channel Coverage`, `Usage Ledger`, `Collection Anomalies`, `Receipts & Collectors` |

## Concept Alignment Checks

| ID | Concept area | Expected from concept | Current implementation | QA status |
| --- | --- | --- | --- | --- |
| SH-01 | Shell and brand | Left rail with GlobalCircle AI identity and protected operator context. | Sidebar shows brand, grouped navigation, locked future slots, and safety footer. | Pass |
| SH-02 | Navigation | Overview, user supervision, platform monitoring, audit/cases, platform development, and settings. | Active real pages remain limited to `Operations Overview`, `Accounts & Resources`, and `Usage & Channels`; planned areas are locked. | Pass |
| SH-03 | Top search | Search users, orders, channels, cases, or events. | Top search is route-aware and searches active console pages; global object search is a later data-contract gap. | Partial |
| OV-10 | Platform health metric | Health card with status, note, and sparkline. | `Platform health` metric renders with safe overview readiness and trend. | Pass |
| OV-11 | Risk cases metric | Risk count and trend. | `Risk cases` renders from computed safe candidates; count differs from concept because local data is real fixture/API state. | Pass |
| OV-12 | Collection freshness metric | Freshness/P95-style latency card. | `Collection freshness` renders from usage monitor generated/observed timestamps. | Pass |
| OV-13 | Channel coverage metric | Channel coverage card. | `Channel coverage` renders measured-channel coverage and trend. | Pass |
| OV-20 | Risk queue | Severity filters and selectable risk rows. | `Risk Queue` renders severity filters and computed safe risk candidates. | Pass |
| OV-30 | User/resources preview | User, order, quota, risk status table. | Routed out of Overview. The owning implementation is `Accounts & Resources`; Overview may show only next-action routing or aggregate signals. | Pass by intentional routing |
| OV-40 | Object timeline | Object filters, object chain, safe event list. | Routed out of Overview. Full durable history belongs to future `Audit & Cases`; interim history entry points stay under owner pages. | Pass by intentional routing |
| OV-50 | Traffic/channel preview | Status filters and channel ledger. | Routed out of Overview. The owning implementation is `Usage & Channels`; Overview keeps only freshness/coverage metrics and route action. | Pass by intentional routing |

## Detailed Page Checks

| Page | Expected role | Current result | QA status |
| --- | --- | --- | --- |
| `Operations Overview` | Summary-and-routing dashboard that sends deep work to the owning page. | The page renders top metrics, risk queue, and next-action routing. Account/resource ledgers, object timelines, and channel ledgers are intentionally absent from Overview. Legacy service/order/activity/warning/recent-activity detail panels are also removed. | Pass |
| `User Operations / Accounts & Resources` | Own user accounts, resources, orders, quota, lifecycle, and history/event entry points. | Page header, safety note, resource data badge, sub-navigation, account directory, resource/order section, quota section, lifecycle summary, history/events cases, controlled delivery preview, and safe refs render in page-local ownership order. | Pass |
| `Platform Monitoring / Usage & Channels` | Own collection freshness, channel coverage, usage ledger, collection anomaly queue, receipt/collector entry points. | Page header, read-only safety note, data badge, sub-navigation, freshness, channel health, usage ledger with filters/curves/activity/order table, collection anomalies with case queue and anomaly queue, and a real receipts/collectors panel render. | Pass |

## Responsive Checks

| Breakpoint | Check | Result |
| --- | --- | --- |
| Browser split viewport `584px` | Three pages have no global horizontal overflow, no Han copy, and render active navigation. | Pass |
| Desktop override `1440 x 900` | Three pages have no global horizontal overflow, no Han copy, and render active navigation. | Pass |
| Mobile sub-navigation | Sub-nav uses horizontal scrolling inside its own container instead of widening the page. | Pass |
| Tables and refs | Long safe refs and table content stay inside their scroll/row containers. | Covered by Admin tests and Browser overflow check. |

## Intentional Deviations

| Concept expectation | Current behavior | Reason |
| --- | --- | --- |
| Concept uses sample counts such as `18` risk cases and `98.6%` coverage. | Local implementation shows current fixture/API-derived values such as `5` risk cases or `50%` coverage. | Values must come from safe summaries, not static concept numbers. |
| Concept shows locked icons beside several navigation entries. | Current shell shows locked planned slots with explanatory entry-gate text. | More explicit for operator safety and avoids empty clickable pages. |
| Concept fits the entire first screen into a wide 1600px canvas. | Local 1280px viewport keeps the same hierarchy but allows scroll. | Current app must support narrower desktop and browser preview widths. |
| Concept shows request rate and error rate as if first-class channel facts exist. | Current channel preview exposes honest gaps or derived placeholders instead of fake runtime rates. | Backend summary contract for request/error rates is not complete. |

## Backend/Data Contract Gaps

These gaps should remain visible in planning, but they do not block the current
UI skeleton:

- Durable case/history backend for full `Audit & Cases`.
- First-class account lifecycle summary for account create/disable states.
- Durable quota audit history and reason display.
- Collector health endpoint for availability, last run, and failure reason.
- Channel rollup endpoint for request rate, error rate, and longer trends.
- Durable object event taxonomy for account/order/artifact/channel/receipt
  history.

## Acceptance Rule

Before marking a future Admin UI visual task complete, record:

1. The viewport sizes checked.
2. The pages or sections checked.
3. Whether global horizontal overflow exists.
4. Console error count.
5. Any intentional concept deviation.
6. Any backend/data contract gap.
7. The exact local validation commands that passed.

Do not use concept parity to justify production mutation, runtime apply,
collector activation, account disablement, order pause, quota enforcement, or
artifact revocation. Those remain separate tasks and may require B or A
reclassification depending on behavior.
