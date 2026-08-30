# Admin Console Rebuild Worktree Organization

Last updated: 2026-06-16, America/Los_Angeles.

```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: admin_console_rebuild_worktree_organization
  superseded_by: null
  last_verified_at: 2026-08-29
  production_authority: false
```


> Status:
> - Type: Historical local worktree organization record
> - Risk: C for this record; referenced Admin UI implementation remains B
> - Production impact: None
> - Execution authority: Does not authorize production, AWS, Vultr, DNS,
>   Nginx, systemd, DB, runtime, auth model, schema/migration, token,
>   credential, subscription URL, raw config/log/env, SQLite row, or
>   customer-data actions

This record preserves the New Admin rebuild worktree organization observed on
2026-06-16. It does not describe the current worktree, queue, or PR scope. Use
the fresh native Issue/PR record and inspect the actual worktree before any
handoff, staging step, or PR.

## Cleanup Completed

The root-level temporary Markdown inventory files were removed because they
were scratch output, not project state:

- `.tmp-list-md.ps1`
- `.tmp-md-list.txt`
- `.tmp-md-stats.ps1`

Do not recreate ad hoc inventory files in the repository root. If a scan result
needs to survive, turn it into a reviewed document under `docs/`.

## Then-Current Admin UI Rebuild Bundle

At the documented cutoff, these files formed the New Admin implementation
bundle. This list is historical evidence, not a current staging instruction:

- `admin/src/App.tsx`
- `admin/src/app/navigation.ts`
- `admin/src/components/layout/admin-layout.tsx`
- `admin/src/components/layout/app-sidebar.tsx`
- `admin/src/components/layout/top-bar.tsx`
- `admin/src/components/primitives/*`
- `admin/src/features/admin-case-workbench/case-workbench.tsx`
- `admin/src/pages/dashboard-page.tsx`
- `admin/src/pages/portal-requests-page.tsx`
- `admin/src/pages/subscription-usage-monitor-page.tsx`
- `admin/src/styles.css`
- `admin/src/test/admin-case-workbench-components.test.tsx`
- `admin/src/test/admin-dashboard.test.tsx`
- `admin/src/test/admin-style-contract.test.ts`
- `admin/src/test/admin-ui-primitives.test.tsx`
- `admin/src/test/navigation.test.ts`
- `admin/src/test/portal-requests-page.test.tsx`
- `admin/src/test/subscription-usage-monitor.test.tsx`
- `admin/src/test/user-portal.test.tsx`

The deleted legacy Admin files are part of this same bundle because the new
console shell replaces their active navigation surface:

- `admin/src/components/metric-card.tsx`
- `admin/src/components/status-badge.tsx`
- `admin/src/features/subscriptions/confirm-action-dialog.tsx`
- `admin/src/features/subscriptions/create-subscription-dialog.tsx`
- `admin/src/features/subscriptions/renew-subscription-dialog.tsx`
- `admin/src/features/subscriptions/reset-token-dialog.tsx`
- `admin/src/features/subscriptions/subscriptions-page.tsx`
- `admin/src/pages/nodes-page.tsx`
- `admin/src/pages/overview-page.tsx`
- `admin/src/pages/provisioning-page.tsx`
- `admin/src/test/subscriptions.test.ts`

Expected PR classification for this bundle: B, because it is Admin UI code,
tests, and local visual QA with no production/runtime authority.

## Design And Planning Bundle

These files document the design basis, object dictionary, concept breakdown,
and page-by-page implementation plan:

- `docs/ADMIN_CONSOLE_REBUILD_BASELINE.md`
- `docs/ADMIN_CONSOLE_CONCEPT_REQUIREMENTS_MATRIX.md`
- `docs/ADMIN_CONSOLE_DOMAIN_DICTIONARY.md`
- `docs/ADMIN_CONSOLE_OVERVIEW_FIGMA_SPEC.md`
- `docs/ADMIN_CONSOLE_COMPONENT_FUNCTION_BLUEPRINT.md`
- `docs/ADMIN_CONSOLE_VISUAL_QA_LEDGER.md`
- `docs/ADMIN_CONSOLE_NAVIGATION_IA.md`
- `docs/ADMIN_UI_GITHUB_REFERENCE_STUDY.md`
- `docs/ADMIN_UI_LEGACY_ARCHIVE.md`
- `docs/assets/admin-console/new-admin-console-rebuild-concept.png`
- `docs/README.md`

These are C-tier by themselves, but they can travel with the B-tier Admin UI
bundle when they explain the implemented surface and validation evidence.

## Dated Handoff Inputs

At the documented cutoff, the handoff referenced these files:

- `docs/PROJECT_CONTEXT.md`
- `project-state/current.json`

`docs/PROJECT_CONTEXT.md` is an active context/router. The referenced
`project-state/current.json` is now a dated compatibility snapshot. Neither is
current task authority, permission to mutate production, or proof of live
production state. Resolve current work from fresh native Issue/PR records and
use Project #1 only for navigation.

## Separate Backend Bundle

The following files are not part of the Admin UI rebuild bundle and should be
kept as a separate review boundary unless a later task explicitly ties them to
the Admin work:

- `server/services/edge/data-plane-agent-service.mjs`
- `server/tests/data-plane-agent-service.test.mjs`

Expected PR classification for this backend bundle: B if it remains repo-only
service/test behavior. It becomes A only if a later task attempts production
runtime apply, deployment, schema migration, or live node mutation.

## Staging Boundary

When preparing a commit or PR, use explicit path-bounded staging. Do not use a
broad `git add .` while this branch contains mixed Admin UI, docs, state, and
backend changes.

Historical Admin UI bundle staging example (do not run without re-deriving the
current scope from the native Issue/PR and actual worktree):

```powershell
git add `
  admin/src/App.tsx `
  admin/src/app/navigation.ts `
  admin/src/components/layout/admin-layout.tsx `
  admin/src/components/layout/app-sidebar.tsx `
  admin/src/components/layout/top-bar.tsx `
  admin/src/components/primitives `
  admin/src/features/admin-case-workbench/case-workbench.tsx `
  admin/src/pages/dashboard-page.tsx `
  admin/src/pages/portal-requests-page.tsx `
  admin/src/pages/subscription-usage-monitor-page.tsx `
  admin/src/styles.css `
  admin/src/test/admin-case-workbench-components.test.tsx `
  admin/src/test/admin-dashboard.test.tsx `
  admin/src/test/admin-style-contract.test.ts `
  admin/src/test/admin-ui-primitives.test.tsx `
  admin/src/test/navigation.test.ts `
  admin/src/test/portal-requests-page.test.tsx `
  admin/src/test/subscription-usage-monitor.test.tsx `
  admin/src/test/user-portal.test.tsx `
  admin/src/components/metric-card.tsx `
  admin/src/components/status-badge.tsx `
  admin/src/features/subscriptions/confirm-action-dialog.tsx `
  admin/src/features/subscriptions/create-subscription-dialog.tsx `
  admin/src/features/subscriptions/renew-subscription-dialog.tsx `
  admin/src/features/subscriptions/reset-token-dialog.tsx `
  admin/src/features/subscriptions/subscriptions-page.tsx `
  admin/src/pages/nodes-page.tsx `
  admin/src/pages/overview-page.tsx `
  admin/src/pages/provisioning-page.tsx `
  admin/src/test/subscriptions.test.ts
```

Historical docs/snapshot staging example (same fresh-scope requirement):

```powershell
git add `
  docs/ADMIN_CONSOLE_REBUILD_BASELINE.md `
  docs/ADMIN_CONSOLE_CONCEPT_REQUIREMENTS_MATRIX.md `
  docs/ADMIN_CONSOLE_DOMAIN_DICTIONARY.md `
  docs/ADMIN_CONSOLE_OVERVIEW_FIGMA_SPEC.md `
  docs/ADMIN_CONSOLE_COMPONENT_FUNCTION_BLUEPRINT.md `
  docs/ADMIN_CONSOLE_VISUAL_QA_LEDGER.md `
  docs/ADMIN_CONSOLE_NAVIGATION_IA.md `
  docs/ADMIN_CONSOLE_REBUILD_WORKTREE_ORGANIZATION.md `
  docs/ADMIN_UI_GITHUB_REFERENCE_STUDY.md `
  docs/ADMIN_UI_LEGACY_ARCHIVE.md `
  docs/assets/admin-console/new-admin-console-rebuild-concept.png `
  docs/README.md `
  docs/PROJECT_CONTEXT.md `
  project-state/current.json
```

Suggested backend staging set, only if that work is intentionally in scope:

```powershell
git add `
  server/services/edge/data-plane-agent-service.mjs `
  server/tests/data-plane-agent-service.test.mjs
```

After staging, verify with:

```powershell
git diff --cached --name-status
```

## Validation Snapshot

The then-current Admin rebuild bundle was validated locally with:

- `npm run test --prefix admin -- src/test/navigation.test.ts`
- `npm run admin:test`
- `npm run admin:build`
- `npm test`
- `npm run project-state:check`
- `git diff --check origin/master...HEAD`
- `git diff --check`

`git diff --check` may emit LF/CRLF warnings on Windows. Treat those as line
ending warnings only when the command exits successfully and reports no
whitespace errors.

Before any final PR or commit report, rerun the commands required by
`docs/VALIDATION_BASELINE.md` for the exact staged surface.
