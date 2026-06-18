# Admin Console App Map

Last updated: 2026-06-17, America/Los_Angeles.

> Status:
> - Linear: GCC-74 under GCC-81 / GCC-42
> - Type: Control-plane application map and App Library source
> - Risk: C for this document; current React manifest/test integration is B.
> - Production impact: None.
> - Execution authority: Does not authorize production, AWS, Vultr, DNS,
>   Nginx, systemd, DB, runtime, auth model, schema/migration, token,
>   credential, subscription URL, raw config/log/env, SQLite row, or
>   customer-data actions.

The Admin console is a browser desktop. A page is a workspace app, and each
page module is a plugin app. The App Library is the restore/search surface for
workspace pages, plugins, console utilities, and planned apps.

The code source of truth is `admin/src/app/admin-app-manifest.ts`.

## App Model

Every app entry must have:

| Field | Meaning |
| --- | --- |
| `appId` | Stable identifier used by App Library, tests, search, and future permissions. |
| `zhName` / `enName` | Chinese planning name and English canonical UI name. |
| `category` | One of Monitoring, Management, Configuration, Audit / Workflow, or Platform Tools. |
| `primaryObjects` | Business objects supervised by the app. |
| `coreViews` | First UI surfaces the app owns. |
| `searchableFields` | Whitelisted safe fields used by App Library search. |
| `safetyBoundary` | What the app may show or control without new authority. |
| `followUpTask` | Next implementation task that owns deeper behavior. |

Search entries may use only `label`, aliases, safe descriptions, app category,
owner area, capabilities, route target, and `catalog.searchableFields`.
Forbidden fields remain excluded from search and UI output.

## Workspace Apps

| appId | 中文名 | English UI | Category | Primary objects | Core views | Follow-up |
| --- | --- | --- | --- | --- | --- | --- |
| `operations-overview` | 运营概览 | Operations Overview | Monitoring | platform health, risk case, activity event, channel summary | health summary, risk queue, next action routing | `GCC-75` |
| `accounts-resources` | 账号与资源 | Accounts & Resources | Management | user account, resource, order, subscription artifact, quota policy | account directory, resources and orders, quota and usage, lifecycle, history and events | `GCC-75` |
| `usage-channels` | 使用情况和渠道 | Usage & Channels | Monitoring | usage sample, channel, collector, receipt, safe edge reference | collection freshness, channel coverage, usage ledger, anomalies, receipts and collectors | `GCC-75` |

## Plugin Apps

| Owner page | Plugins |
| --- | --- |
| Operations Overview | `health-summary`, `risk-queue`, `next-actions` |
| Accounts & Resources | `account-overview`, `resource-orders`, `quota-usage`, `lifecycle`, `history-events` |
| Usage & Channels | `freshness`, `channel-coverage`, `usage-ledger`, `collection-anomalies`, `receipts-collectors` |

Plugin controls are local to the plugin header/menu. The App Library restores
hidden plugins by dispatching the app's `route.page` and `route.targetId`.

## Console Utilities

| appId | Role |
| --- | --- |
| `utility.risk-notifications` | Route risk notifications back to Operations Overview. |
| `utility.environment` | Show production/read-only environment context and Risk A reminder. |
| `utility.preview-site` | Open the public preview shell. |
| `utility.user-portal` | Open the user-facing portal view. |
| `utility.admin-api` | Show private Admin API connection and local console settings. |

Utilities do not own business objects and must not become hidden production
actions.

## Planned Apps

| appId | Gate |
| --- | --- |
| `planned.audit-workflow` | Locked until durable case/history facts exist. |
| `planned.platform-development` | Locked until safe platform tools and object models exist. |
| `planned.system-settings` | Locked until private settings and permission boundaries exist. |

Planned apps may be searchable as locked launchers, but they cannot execute
runtime, production, auth, schema, DB, or credential actions.

## Implementation Rules

1. Do not change existing `AdminPage`, plugin `navId`, or `targetId` values
   without a migration plan for local layout state and deep links.
2. Do not introduce a remote/runtime app registry in this phase.
3. Do not duplicate page/module/utility metadata outside the app manifest.
4. App Library rendering should consume the app map, not rebuild entries from
   page navigation arrays.
5. Future permission and search work should consume the manifest catalog,
   not scrape rendered labels.

## Validation

For App Map changes:

```powershell
npm run admin:test -- src/test/admin-app-manifest.test.ts
npm run admin:test -- src/test/navigation.test.ts
```

For PR closeout touching Admin code:

```powershell
git diff --check
npm run admin:test
npm run admin:build
npm test
```
