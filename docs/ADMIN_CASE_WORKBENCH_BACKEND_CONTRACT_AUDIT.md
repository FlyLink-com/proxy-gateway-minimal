# Admin Case Workbench Backend Contract Audit

Last updated: 2026-06-15, America/Los_Angeles.

> Status:
> - Linear: GCC-54
> - Risk: C for this read-only audit
> - Production impact: None
> - Execution authority: This document does not authorize schema migration,
>   production data backfill, auth model changes, runtime mutation, lifecycle
>   automation, token handling, subscription URL handling, credential exposure,
>   deploy, or rollback.

## Goal

Map which backend facts can safely support phase-one Admin case candidates and
which facts need a later backend contract before durable Case workflows are
built.

## Current Safe Facts

| Fact | Current source | Safe frontend use |
| --- | --- | --- |
| Portal request lifecycle | `portal-access-requests.mjs`, `subscription-control-db.mjs` | Show request/order status and next review target. |
| Portal usage summary | `portal-access-requests.mjs` | Show upload, download, used, total, usage status, collection status, channel counts, and updated time. |
| Traffic limit | `portal-access-requests.mjs`, `subscription-control-db.mjs` | Show current quota and quota source. |
| Usage monitor row | `subscription-usage-monitor.mjs` | Show account/order scoped measured usage, collection status, warnings, channel usage, and safe binding presence booleans. |
| Usage timeseries | `subscription-usage-monitor.mjs` | Show aggregate chart data by safe account, order, and channel refs. |
| Safety flags | Admin platform routes and service summaries | Assert raw subscription URLs, secrets, raw credentials, raw customer network data, and runtime mutation are not returned. |

## Gaps Before Durable Case

| Gap | Why it matters | Required later scope |
| --- | --- | --- |
| Durable Case object | Phase one candidates are derived and cannot be closed, reopened, assigned, or archived. | B/A or A depending on schema and migration scope. |
| Account lifecycle source | UI currently cannot prove account enabled, disabled, or suspended from a first-class account status. | Backend account summary contract. |
| Request status vocabulary alignment | Backend can contain lifecycle states that frontend types may not expose. | Type/API contract alignment and tests. |
| Stale usage window | UI must not invent stale collection without backend policy. | Backend-provided stale window or collection status contract. |
| Audit notes | Operator notes need persistence and actor/audit refs. | Backend note API and auth review. |
| Receipt missing evidence | UI can show binding presence booleans, but durable evidence needs receipt refs or safe lifecycle events. | Receipt evidence contract. |

## Phase-One Rule

Frontend may compute `case_candidate:*` identifiers from already-safe API
payloads. It must label them as derived candidates and must not mark them as
closed, false positive, assigned, archived, or durable.

## Required Tests Before GCC-55

```powershell
node --test server\tests\platform-portal-access-requests.test.mjs
node --test server\tests\platform-subscription-control-db.test.mjs
npm run admin:test
npm run admin:build
npm test
git diff --check origin/master...HEAD
```

## Sensitive Data Boundary

Case candidates, timeline rows, linked objects, fixtures, and audit documents
must not contain raw subscription URLs, tokens, credential material, private
keys, raw runtime config, raw SQLite rows, or customer-private data.
