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

`/web/` and `/web/register[/]` are explicit desktop pages. They never run device detection. In-app display-mode switches are hidden on login, registration, session-status and signed-in pages. Explicit `/web/`, `/m/` and `display=mobile|auto|desktop` entry handling remains unchanged in the routing layer; hiding the controls does not clear remembered preferences. Public desktop images use `/web/`; business requests remain same-origin `/api/portal/*`.

The paired mobile change chooses once at initial navigation: explicit preference > explicit mobile entry > remembered preference > device default. No resize, zoom, login or keyboard event switches the interface. The mobile activation flag stays off until the desktop route has been installed and checked.

## Local acceptance — 2026-09-20

### Follow-up: hide display-mode controls (source only)

- Removed only the switch mounts/imports from desktop login, second-factor, session-status, registration and signed-in pages. Automatic routing, URL overrides, stored preferences and API/session behavior are unchanged.
- TDD: new Chinese/English page-level absence assertions failed first (2 failed, 3 passed), then passed after removing the mounts. Coverage includes anonymous, registration, initial session restoration and signed-in shells.
- This follow-up: targeted entry/session tests 17 passed; full frontend suite 81 files / 1283 passed; desktop build and 10-file artifact verification passed; frontend boundary check and `git diff --check` passed.
- React review: controls are not mounted, rather than visually hidden/focusable. No new effects, listeners, requests or dependencies. Language/theme controls remain.
- Local implementation only: not pushed, merged or deployed. No fresh production account or physical iPhone test; no backend changes or full backend-suite rerun. The older validation records below remain historical evidence, not new results.

### Original routing implementation acceptance

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

### Unified review and authenticated local follow-up — 2026-09-20

- Closed the release-pipeline gap: desktop now has its own build, archive replay,
  checksum, manifest and upload job. Ordinary CI also builds/verifies this entry.
  Existing exact workflow inventories were extended for the extra job; no gate
  or assertion was removed to accommodate it.
- New artifact-workflow tests were red before the job existed, then passed.
  Final focused CI/artifact workflow tests: 9 passed. Desktop build/verifier and
  frontend boundary check passed again after the workflow changes.
- Final full root suite this round: 5171 total, 5104 passed, 11 failed,
  56 skipped. The 11 names still match the independently checked baseline above;
  the extra two tests passed. This is not a green Windows full-suite result.
- Fresh GitHub CI at the preceding reviewed head
  `548bd81db4e8657bdd09a818c75de64686ef2744` (run `35530441821`) passed,
  including the Linux server suite and frontend checks. That run does not cover
  the new pipeline edits: the new pushed head needs its own check results.
- With this desktop build and the paired mobile build on the same loopback
  origin, a user-authorized synthetic login exercised the actual backend auth
  modules and in-memory database. The browser retained the same persistent
  HttpOnly session across mobile -> desktop -> mobile, including reloads.
  Logging out in a second desktop tab invalidated the session and updated the
  mobile tab; the browser cookie was removed. No cookie values were recorded.
- The fixture wires actual commerce-model and access-request reads needed by
  the desktop shell, with no credits/orders and no fulfillment worker. Wallet,
  referral and payment-provider business acceptance is outside this fixture;
  its unconfigured endpoint errors are not production findings.
- A paired mobile selector display mismatch for explicit `/m/` was corrected
  and checked in the browser. The mobile build was restored to default-off
  after acceptance. Owned browser/server were closed; ports 4189/4192 are not
  listening. No user browser session or existing preview service was closed.

Physical iPhone/Safari, real production-account switching, live routing
inventory and deployment remain unperformed. The prior frontend suite/build
evidence above is reused only for unchanged application source, not represented
as a second run or as production acceptance.

Not deployed. Before production activation, inspect the current page-serving configuration, prepare fresh backup/exact route diff/rollback, and bind both reviewed artifact identities. Install and check `/web/` plus static assets before enabling the mobile selector. Preserve API, referral and payment callback routes. Production desktop recharge trust origins must use the already-authorized public configuration; the local default-empty trust binding is only local verification, not a production-ready payment configuration.

The release-artifact workflow packages the legacy `/portal` and desktop `/web/` bundles in separate ZIPs and manifests under the existing `portal-static` release unit; the desktop artifact is identified by its `globalcircle-portal-web-<release>.zip` filename and `portal-web-static-<release>` upload name. Both artifacts remain build evidence until the Risk A static promotion gate passes.

Rollback order: restore the prior mobile-only page artifact first, then roll back desktop routes if necessary. No previous consumed execution package is reusable.

## Page-only release preparation

This is the paired routing plan, not an executable production approval. The older
`docs/PORTAL_STATIC_PRODUCTION_RELEASE_RUNBOOK.md` permits static-pointer changes
only and explicitly excludes Nginx edits; it cannot authorize this path addition.
A fresh routing-specific Risk A packet must bind the actual serving configuration.

| Entry | Candidate owner | Must remain true |
| --- | --- | --- |
| `/`, `/portal[/]`, `/m[/]` | Reviewed mobile Vercel build | Root assets remain mobile; normal build defaults to routing off. |
| `/portal/register[/]` | Same mobile build | Referral query and return hash retained. |
| `/web` | Page-only redirect to `/web/` | Keep query; no device detection here. |
| `/web/`, `/web/register[/]` | Verified desktop static artifact | Entry HTML, not a fallback to mobile HTML. |
| `/web/assets/*` and desktop public files | Same desktop artifact | Missing assets return 404, never an HTML login page. |
| `/api/*`, `/r/*`, existing payment callbacks | Existing backend routes | No route, upstream, auth or cache-policy changes. |

The approved packet must name the desktop merged source, ZIP/manifest SHA-256,
public recharge-origin binding hash, mobile merged source, routing-enabled build
identity, current mobile-only rollback build, effective Nginx configuration hash,
new backup identity, exact location diff, and acceptance/rollback commands.
None of these production identities is inferred from local builds or an old
Deploy Note. Both desktop and mobile remain `release_unit: portal-static` and
`frontend_surface: portal`; distinguish artifacts by file name/build identity,
not by adding a release unit or changing the manifest schema.

Execution order after the exact gate is approved:

1. Recheck reviewed heads/checks, artifact retrievability and live page topology;
   verify the already-authorized public recharge-origin binding. No secrets or
   production environment/database copies are needed for the frontend build.
2. Back up the exact current page config and retain the current mobile-only
   artifact; stage the verified desktop artifact outside the serving path.
3. Install only desktop page/static locations; configuration-test before reload.
   Leave the mobile selector off. Verify desktop HTML, registration and every
   referenced asset's namespace/content hash; mobile remains unchanged.
4. Bind and promote the mobile build with `VITE_PORTAL_DESKTOP_ENABLED=true`.
   Verify automatic/manual choice, registration return, no switching on resize,
   and authenticated cross-surface reads. No purchase/payment is an acceptance
   action without separate authorization.
5. Physical iPhone/Safari acceptance: login, portrait/landscape, keyboard close,
   background/foreground and reload must not require pinch zoom to display the
   main content. This is not replaced by Chrome device emulation.
6. On failed activation, restore the previous mobile-only page first. Keep
   `/web/` working while the selector can still reference it; then restore the
   exact backed-up desktop locations if needed and verify both restored paths.
   Do not restart the backend or restore a database for a page-routing rollback.

No DNS, backend release, database/schema, balance, entitlement, subscription
identity, collector, payment-provider or Admin change belongs to this release.
Append a concise Deploy Note to both related PRs only after actual acceptance.
