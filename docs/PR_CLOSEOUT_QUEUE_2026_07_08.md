# 2026-07-08 PR Closeout Queue

> Status: Historical repo-only queue; superseded as the current Git/docs queue
> by `docs/GIT_DOCS_ARCHIVE_CLOSEOUT_2026_07_09.md`
> Risk: C
> Production impact: None
> Execution authority: This record does not authorize production, runtime,
> DNS, Nginx, firewall, schema, credential, token, subscription material,
> payment-provider, AppsFlyer live, or customer-data actions.

This record captures the July 8 source/PR closeout after the dirty carrier PRs
were replaced by focused PRs from current `master`.

Use this file for historical context only. For the current branch/worktree/PR
state after the July 9 cleanup, read
`docs/GIT_DOCS_ARCHIVE_CLOSEOUT_2026_07_09.md`.

## Current GitHub State

- PR #394 merged the portal registration frontend/source alignment.
- PR #395 merged the traffic usage runtime/source collectors and tests.
- PR #396 archived the traffic usage / SGP execution records.
- PR #397 merged the portal registration backend services, routes, runtime
  wiring, and tests.
- PR #399 merged the Admin safe-read projection/page-model contracts and
  pagination standard baseline.
- PR #400 merged the Admin table query-state contract for paginated and
  route-split safe-read projections.
- PR #401 merged the Admin owner page model DTOs for Operations Overview,
  Accounts & Resources, and Usage & Channels.
- PR #403 merged Admin user-management control-store safe summaries and exposed
  portal-registration accounts to Admin safe-read surfaces.
- PR #404 merged the User Portal public preference switch for component-level
  locale/theme controls.
- PR #405 merged the Admin shell locale switch for the current three workspace
  pages.
- PR #381 was closed as a superseded traffic-usage carrier after #395 and #396.
- PR #364 was closed as a superseded Admin/Portal carrier after #394 and #397.
- Open PR count was rechecked as `0` after PR #405.

## Merge Vehicle Rule

Do not reopen or merge closed carrier branches. Any remaining useful work must
be re-cut from latest `origin/master` as a focused PR with current validation.

Each follow-up PR must state:

- `Risk`
- `Production/AWS impact`
- `Validation`
- `Not included`
- Whether it is source/test, docs-only, inventory-only, or a Risk A approval
  packet

## Next Split Queue

1. **Admin UI baseline / safe-read shell**
   - Risk: B
   - Completed so far: PR #399 safe-read model/projection contracts, PR #400
     table query-state contract, PR #401 owner page model DTOs, PR #403
     user-management safe summaries, and PR #405 shell locale switch.
   - Remaining: navigation, visual QA, stable rendered shell pieces, and any
     page wiring that can be validated without pulling unrelated auth, payment,
     or runtime changes.
   - Scope: Admin safe-read DTOs, navigation, visual QA, and stable shell
     pieces only.
   - Exclude: payment, Niuniu, protected Admin auth, runtime changes, and docs
     archive deletion.
   - Validation: `npm run admin:test`, `npm run admin:build`, `npm test`,
     `git diff --check origin/master...HEAD`.

2. **User Portal experience upgrades**
   - Risk: B
   - Completed so far: PR #394 restored portal registration frontend/source
     alignment, PR #397 restored registration backend wiring, and PR #404 added
     the public preference component.
   - Scope: registration/user-panel UX improvements that build on #394 and
     #397.
   - Exclude: payment-provider activation, production static deploy, DNS,
     Nginx, credentials, tokens, and subscription material.
   - Validation: Admin UI tests/build plus `npm test`.

3. **Niuniu/payment source adapter**
   - Risk: B for repo-only adapter/tests; A for any live provider activation.
   - Scope: provider-neutral or Niuniu adapter source, fail-closed checkout
     boundaries, synthetic tests, and no live keys.
   - Exclude: live checkout activation, production webhook, provider secrets,
     payment notification endpoint activation, and production route exposure.

4. **Admin protected auth**
   - Risk: B for local source/tests; A for any public/prod auth boundary change.
   - Scope: protected Admin auth source and tests from current `master`.
   - Exclude: public Admin exposure, Nginx changes, runtime env mutation,
     credential output, and production activation.

5. **Docs/archive reconciliation**
   - Risk: C
   - Scope: index stale production records and archive references without
     deleting current execution evidence or moving source code.
   - Exclude: bulk deletion of `docs/production-replacement-records`, runtime
     mutation, or claims that archived records describe current live state.

## Validation For This Record

- `npm run project-state:check`
- `git diff --check origin/master...HEAD`
