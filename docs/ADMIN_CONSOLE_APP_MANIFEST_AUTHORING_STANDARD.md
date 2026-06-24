# Admin Console App Manifest Authoring Standard

Last updated: 2026-06-18, America/Los_Angeles.

> Status:
> - Linear: GCC-75 under GCC-81 / GCC-42
> - Type: Control-plane app authoring standard
> - Risk: C for this document; current Admin manifest/test integration is B.
> - Production impact: None.
> - Execution authority: Does not authorize production, AWS, Vultr, DNS,
>   Nginx, systemd, DB, runtime, auth model, schema/migration, token,
>   credential, subscription URL, raw config/log/env, SQLite row, or
>   customer-data actions.

This standard defines how new Admin OS applications are authored. The code
source of truth is `admin/src/app/admin-app-manifest.ts`.

Future reviewed-upload and registry publication rules are documented in
`docs/ADMIN_CONSOLE_APP_REGISTRY_REVIEW_DESIGN.md`. That registry design is not
implemented in this phase; uploaded YAML remains a future capability until
schema validation, review storage, approval, publication, permissions, and audit
flows exist.

## Required Fields

Every application manifest must carry:

| Field | Purpose |
| --- | --- |
| `appId` | Stable id used by System Search, layout, permissions, tests, and future deep links. |
| `title` | Canonical English UI label. |
| `subtitle` | Chinese planning label for product/IA review. |
| `icon` | Stable icon key, not a direct component snapshot. |
| `entryType` | `workspace-app`, `plugin-module`, `system-action`, or `planned-app`. |
| `category` | `monitoring`, `management`, `configuration`, `audit-workflow`, or `platform-tools`. |
| `primaryObject` | First business object owned or represented by the app. |
| `capabilities` | Safe UI abilities such as view, inspect, comment, suggest-action, dry-run, configure, develop, or administer. |
| `routes` | One or more safe route targets. Plugin routes must include both page and target id. |
| `searchFields` | Whitelisted safe search text. |
| `layoutDefaults` | Default size, allowed sizes, default pin state, and initial visibility. |
| `visibility` | `pinned`, `library`, `hidden`, or `locked`. |
| `riskTier` | Local UI risk classification: B or C for active UI, A for gated future apps. |
| `dataBoundary` | Must be `safe-summary-only` in this phase. |
| `sourceContract` | Display-only data-source, drilldown, and evidence-route contract for the app or plugin. |
| `state` | `normal`, `warning`, `blocked`, `readonly`, `planned`, or `needs-config`. |
| `forbiddenFields` | Explicit unsafe labels excluded from search, UI output, and app authoring payloads. |

## Source Contract

Every app and plugin must declare a source contract:

| Field | Meaning |
| --- | --- |
| `dataSourceRefs` | Safe summary or display-only data source refs consumed by the app. |
| `drilldownTargets` | Safe page, plugin, utility, or locked app targets the UI may route to. |
| `evidenceRoutes` | Safe evidence labels such as `account-ref`, `order-ref`, `risk-case`, or `receipt-state`. |
| `transformBoundary` | Must be `display-only`; frontend transforms may format, group, sort, or unit-convert but must not decide quota, lifecycle, risk, auth, or runtime behavior. |

Source contracts are metadata. They do not authorize new API access, backend
schema, runtime mutation, arbitrary data-source configuration, raw query/log
browsing, or production action execution.

## Entry Types

| Type | Meaning | Examples |
| --- | --- | --- |
| `workspace-app` | First-class workspace page entry owned by ShellRail and TopBar. | Operations Overview, Accounts & Resources, Usage & Channels. |
| `plugin-module` | Restorable page module hosted by a workspace app. | Quota & Usage, Usage Ledger, Collection Freshness. |
| `system-action` | Console utility or launcher that does not own business objects. | Production environment, Admin API, Preview site. |
| `planned-app` | Locked future application slot. | Audit & Cases, Platform Development, System Settings. |

## Layout Sizes

| Size | Use |
| --- | --- |
| `large` | First-class workspace app or expanded plugin surface. |
| `medium` | Default plugin/module size. |
| `compact` | Dense plugin view that still shows title and status. |
| `icon-only` | Compact route/action launcher or locked utility. |
| `hidden` | Removed from the canvas and recoverable from System Search or page-local controls. |

## Runtime States

| State | Meaning |
| --- | --- |
| `normal` | Ready for normal safe UI use. |
| `warning` | Safe UI is available but needs attention. |
| `blocked` | App cannot show meaningful data until a prerequisite is resolved. |
| `readonly` | App is explicitly read-only. |
| `planned` | Future app slot, not active. |
| `needs-config` | Utility requires local/private configuration before it is useful. |

## Three Active Examples

| appId | title | subtitle | type | category | primaryObject | default layout |
| --- | --- | --- | --- | --- | --- | --- |
| `operations-overview` | Operations Overview | 运营概览 | `workspace-app` | `monitoring` | platform health | `large`, `pinned` |
| `accounts-resources` | Accounts & Resources | 账号与资源 | `workspace-app` | `management` | user account | `large`, `pinned` |
| `usage-channels` | Usage & Channels | 使用情况和渠道 | `workspace-app` | `monitoring` | usage sample | `large`, `pinned` |

## Safety Rules

Manifests may store UI metadata, safe refs, labels, categories, route ids, safe
capabilities, safe summaries, and redaction policies.

Manifests must not store or expose:

- raw token;
- raw secret;
- credential;
- subscription URL;
- auth header;
- raw session, env, config, log, runtime, or error data;
- SQLite row;
- raw runtime endpoint;
- raw subscription material;
- customer-private identity or contact data;
- unredacted operator notes or case evidence.

Search fields are stricter than safety-boundary fields: a manifest may list
forbidden labels in `forbiddenFields`, but `searchFields` and search index text
must never include those forbidden field names or raw values.

## Authoring Workflow

1. Add or edit the source entry in `admin/src/app/admin-app-manifest.ts`.
2. Include catalog metadata: Chinese planning name, English UI name, category,
   primary objects, core views, safe searchable fields, safety boundary, and
   follow-up task.
3. Include `sourceContract` with safe data source refs, drilldown targets,
   evidence routes, and `transformBoundary: "display-only"`.
4. Let `adminAppAuthoringManifest` derive the authoring entry.
5. Add or update tests in `admin/src/test/admin-app-manifest.test.ts`.
6. If the app has visible UI routing, add a focused navigation or page test.
7. Do not add a second hardcoded array in System Search, route-index, or page
   code.

## Validation

For manifest-only changes:

```powershell
npm run admin:test -- src/test/admin-app-manifest.test.ts
```

For System Search or route consumption changes:

```powershell
npm run admin:test -- src/test/navigation.test.ts
npm run admin:build
```

For PR closeout touching Admin code:

```powershell
git diff --check
npm run admin:test
npm run admin:build
npm test
```
