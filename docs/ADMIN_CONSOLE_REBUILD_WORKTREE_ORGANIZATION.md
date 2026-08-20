# Admin Console Rebuild Worktree Organization

Last updated: 2026-06-16, America/Los_Angeles.

```yaml
document_metadata:
  doc_type: operational
  lifecycle: active
  authority_scope: admin_console_rebuild_worktree_organization
  superseded_by: null
  last_verified_at: 2026-06-16
  production_authority: false
```


> Status:
> - Type: Local worktree organization record
> - Risk: C for this record; referenced Admin UI implementation remains B
> - Production impact: None
> - Execution authority: Does not authorize production, AWS, Vultr, DNS,
>   Nginx, systemd, DB, runtime, auth model, schema/migration, token,
>   credential, subscription URL, raw config/log/env, SQLite row, or
>   customer-data actions

This record organizes the current New Admin rebuild worktree so the next
handoff, staging step, or PR does not mix unrelated changes by accident.

## Cleanup Completed

The root-level temporary Markdown inventory files were removed because they
were scratch output, not project state:

- `.tmp-list-md.ps1`
- `.tmp-md-list.txt`
- `.tmp-md-stats.ps1`

Do not recreate ad hoc inventory files in the repository root. If a scan result
needs to survive, turn it into a reviewed document under `docs/`.

## Primary Admin UI Rebuild Bundle

These files form the active New Admin implementation bundle and should be
reviewed together unless a later split is deliberately chosen:

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

## Coordination State

These files are coordination state, not runtime authority:

- `docs/PROJECT_CONTEXT.md`
- `project-state/current.json`

Keep them aligned with the real repository state, but do not treat them as
permission to mutate production or as proof of live production state.

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

Suggested Admin UI bundle staging set:

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

Suggested docs/state staging set:

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

The current Admin rebuild bundle has already been validated locally with:

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
