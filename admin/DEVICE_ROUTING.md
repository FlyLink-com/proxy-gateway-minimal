# Desktop Portal entry — source implementation and local acceptance

- Risk: B (source-only). Production route activation remains Risk A.
- Process: bounded intent/code/tests in the existing frontend workspaces.
- Expected PR count: 2, because desktop source and mobile selector live in separate repositories.
- release_unit: `portal-static`
- frontend_surface: `portal`
- identity_impact: false
- Production/AWS impact: none in this change; no SSH, Nginx write/reload, API, database, DNS, payment-policy or collector change.
- Refs #527; this change does not close the separation/archive epic or the existing planning PR #735.

## Implementation

Reuse the existing real desktop Portal, not the archived Admin UI. The new `admin:portal:web:build` emits `admin/dist-portal-web` with `/web/` base. Its config composes the existing Portal config, including the recharge trust configuration plugin. The existing Portal/Admin/Site builds keep their entry identities.

`/web/` and `/web/register[/]` are explicit desktop pages. They never run device detection. Compact desktop links return to the neutral mobile-owned entry with `display=mobile|auto`, retaining other query values and hashes. Public desktop images use `/web/`; business requests remain same-origin `/api/portal/*`.

The paired mobile change chooses once at initial navigation: explicit preference > explicit mobile entry > remembered preference > device default. No resize, zoom, login or keyboard event switches the interface. The mobile activation flag stays off until the desktop route has been installed and checked.

## Local acceptance — 2026-09-20

- Targeted new entry/build tests: 6 passed; related Portal tests: 142 passed.
- Full `npm run admin:test`: 81 files, 1282 passed.
- `npm run admin:build`: passed (existing bundle-size warning remains).
- `npm run admin:portal:web:build` / `admin:portal:web:verify`: passed, 10-file Portal artifact, no Admin shell or secret material.
- Existing `admin:portal:build` / `admin:portal:verify`: passed.
- `npm run frontend:boundaries:check`: passed. New HTML/config/scripts are registered with exact hashes/imports; checker strictness is not relaxed.
- Frontend boundary test file: 102 passed.
- `git diff --check`: passed.
- Paired local Chrome browser checks: desktop auto entry, manual mobile/desktop/auto choices, remembered preference, registration query/hash preservation, distinct static namespaces, synthetic cookie/sessionStorage persistence.
- Chrome iPhone emulation stays mobile on initial entry and after viewport changes. Physical iPhone/Safari and production routing are not claimed.

Full root `npm test` after the frontend contract registration: 5169 total, 5102 passed, 11 failed, 56 skipped. Do not describe the full root suite as green.

Independent baseline comparison used a clean detached worktree at `a5daf4a19f38ef8042796b35a29ef882c8311a47` with `npm ci --ignore-scripts`, no copied environment/config/credentials. The eight affected test files produced 293 total, 277 passed, 11 failed, 5 skipped. Their 11 failure names exactly match the candidate:

| Test file | Existing failures |
| --- | ---: |
| artifact-manifest | 2 |
| control-plane-release-identity | 1 |
| control-plane-welcome-coins-native-synthetic-runner | 1 |
| control-plane-welcome-coins-runtime-closure | 2 |
| project-drift-report | 1 |
| project-export | 1 |
| project-state-check | 1 |
| validation-environment-preflight | 2 |

These include Windows line-ending/path assumptions and existing workflow/source-marker or fixture-contract mismatches, not exclusively Windows issues. No new failure was found relative to that baseline. Neither tests nor gates were weakened to hide the failures. Baseline `project-state:check` and `validation:environment:source` passed. These findings remain disclosed for review; they do not constitute production approval.

## Promotion boundary

Not deployed. Before production activation, inspect the current page-serving configuration, prepare fresh backup/exact route diff/rollback, and bind both reviewed artifact identities. Install and check `/web/` plus static assets before enabling the mobile selector. Preserve API, referral and payment callback routes. Production desktop recharge trust origins must use the already-authorized public configuration; the local default-empty trust binding is only local verification, not a production-ready payment configuration.

Rollback order: restore the prior mobile-only page artifact first, then roll back desktop routes if necessary. No previous consumed execution package is reusable.
