# Source And Production Reconciliation - 2026-07-08

> Status:
> - Type: Current reconciliation and archive queue
> - Risk: C
> - Execution authority: Does not authorize production, Vultr, DNS, Nginx,
>   systemd, firewall, SQLite, runtime config, deploy, rollback, credential,
>   token, subscription material, or customer-data actions
> - Production impact: None
> - Source of truth for: Current master/PR/production-evidence alignment after
>   the July 8 frontend and traffic-usage recovery work

## Purpose

Recent frontend and production recovery work created a split between deployed
static/runtime facts, `master`, and large Draft PR carriers. This document
records the current reconciliation so future work can merge in small, validated
PRs instead of trying to rescue stale stacked branches.

Use this document before continuing PR #364 or PR #381. It is an inventory and
archive queue only. It does not prove live runtime state and does not grant any
production action.

## Evidence Checked

- `origin/master` latest reviewed baseline after the July 8 merge pass:
  `6845445e docs: add lightweight deploy note rule (#392)`.
- Current open PRs:
  - #381 `feat: close traffic usage accounting rollout`, Draft, `DIRTY`,
    57 files.
  - #364 `[codex] Admin UI baseline and Phase 2 safe contracts`, Draft,
    `DIRTY`, 246 files.
- Closed as stale during the July 8 merge pass:
  - #337 stale `project-state/current.json` refresh.
  - #341 frontend UI closeout stacked on closed PR #340.
- Production-operation evidence used for orientation:
  - Japan portal static restore was performed from source commit `ca9f5702`
    using artifact
    `D:\Projects\proxy-gateway-minimal-artifacts\portal-restore-ca9f5702-20260708\globalcircle-portal-ca9f5702-20260708.tar`,
    SHA-256
    `dd6cb14e2f519078917760e9ade4033732d68960c17abdac67a471797df9eefc`.
  - Traffic-usage and SGP receipt/render records named below are present on
    PR #381, not on current `master`.

## Current Alignment Matrix

| Lane | Production or operation evidence | Current `master` state | Carrier now | Required action | Risk |
| --- | --- | --- | --- | --- | --- |
| PR/deploy traceability | July 8 deploy/rollback/static replacements showed PR closeout needed a lightweight production note. | #392 is merged and adds `Deploy Note` fields plus the release-unit rule. | `master` | Done. Use the PR template for future production actions. | C |
| Portal registration and user panel | Portal static was restored from `ca9f5702` artifact after the production frontend regression. | `master` has portal login/security fixes (#390/#391) but does not contain the full `user-registration-page.tsx` / portal route source from #364. | #364 reference branch plus restored artifact evidence. | Re-cut a small Portal source-alignment PR from current `master`; include only registration/user-panel source and tests needed to match the restored artifact. | B for repo code; A only if deployed |
| Admin UI system search and structure | No production runtime mutation needed. | #366 is merged into `master`. | `master` | Done for system-search structure. Do not claim #364 visual/Admin baseline is merged. | B |
| Traffic usage accounting | Runtime recovery and usage collection work exists as production/operator evidence, and the correct SGP receipt/render record is in #381. | `master` does not contain #381 collector scripts, service changes, or 2026-07-07/2026-07-08 traffic records. | #381 Draft, dirty. | Split into docs/evidence PR, repo-side collector/tests PR, and separate A-tier runtime config gate. | C/B/A split |
| AppsFlyer disabled/runtime gate | July 8 AppsFlyer gate and disabled-mode records were merged before the reconciliation pass. | #382/#383/#386/#387/#389 are merged; #392 now requires future Deploy Notes. | `master` | Done. Keep live activation blocked unless separately approved. | C/A split |
| GCC WebOS public/static site | Mobile FAQ/footer and domain closeout work merged. | #388 and #384 are merged. | `master` | Done for the touched static/domain docs. Avoid using this as evidence for portal registration source alignment. | B/C |
| Project-state snapshot | Old PR #337 attempted a June 19 refresh and is now stale. | `project-state/current.json` still needed a July 8 refresh before this PR. | This PR | Refresh only the current PR/merge/reconciliation facts; do not encode unverified live runtime details. | C |

## Split Plan

### Portal source alignment

Create a new branch from current `master` and extract only:

- `admin/src/features/user-portal/user-registration-page.tsx`
- `admin/src/features/user-portal/user-portal-route.tsx`
- the minimal `admin/portal` and router wiring needed for `/portal/register/`
- focused portal tests and build verification

Do not include unrelated Admin OS, Figma mirror, public-site fixture, or runtime
changes from #364. The PR should state that production static was restored
already, and that this repo PR aligns source to the restored frontend baseline.

#### Portal static source alignment follow-up

This follow-up re-cuts the portal static source baseline from current `master`
instead of merging #364 as a carrier branch. It restores only the portal static
source needed to rebuild the production `/var/www/globalcircle-portal` artifact
from `ca9f5702`, keeps the preserved CSS behind the portal-only build entry,
and leaves the current Admin shell stylesheet on `master`.

Evidence:

- Production static had already been backed up separately at
  `D:\Projects\proxy-gateway-minimal-artifacts\production-portal-static-preserve\20260708-191234`.
- `admin:portal:build` from this branch emits the same production artifact
  filenames observed on Japan: `index-C8cV34to.css`, `index-BVwqYSau.js`, and
  `browser-Bpdo4wTk.js`.
- A local tar expansion and SHA-256 manifest comparison against
  `globalcircle-portal-ca9f5702-20260708.tar` found 9 files, 9 artifact files,
  and 0 differences.

This is a repo source-alignment change only. It does not authorize or perform a
production deploy, static replacement, Nginx change, DNS change, runtime config
change, credential/token change, schema migration, or AppsFlyer activation.

### Traffic usage closeout

Do not merge #381 as one PR. Re-cut:

1. A docs/evidence-only PR for redacted traffic-usage execution records:
   - `2026-07-07-traffic-usage-collector-timer-activation.md`
   - `2026-07-07-traffic-usage-vless-xray-stats-runtime-execution.md`
   - `2026-07-07-traffic-usage-tuic-mihomo-controller-enable-execution.md`
   - `2026-07-08-sgp-subscription-render-receipt-reconcile-execution.md`
   - `2026-07-08-traffic-usage-sgp-runtime-source-preserve-execution.md`
2. A repo-side collector/accounting PR for scripts, services, and tests only.
3. A separate A-tier runtime gate for Japan/SGP systemd/config validation or
   mutation.

### Admin UI baseline

Treat #364 as a reference branch, not a merge vehicle. Re-cut Admin work after
the portal source PR:

- Admin visual/QA baseline.
- Figma mirror or design contract updates.
- Public-site/fixture changes only if still needed after current `master`.

## Archive Queue

| Item | Current state | Archive action |
| --- | --- | --- |
| #337 `codex/gcc-90-project-state-refresh-worker` | Closed, stale, conflicting single-file project-state refresh. | Keep closed; do not rebase. Recreate from current `master` only when project-state needs another refresh. |
| #341 `codex/frontend-ui-closeout-implementation` | Closed, stacked on closed unmerged #340. | Treat as historical reference. Re-cut any useful UI state work from current `master`. |
| #364 `codex/admin-figma-mirror-visual-qa` | Open Draft, dirty, oversized reference carrier. | Keep temporarily as extraction source; close after portal/Admin slices are re-cut or explicitly abandoned. |
| #381 `codex/traffic-usage-closeout-master-20260708` | Open Draft, dirty, mixed docs/code/runtime record carrier. | Keep temporarily as extraction source; close after docs and repo-side collector slices are re-cut. |
| `project-state/current.json` pre-2026-07-08 branch context | Stale compared with current master and PR list. | Updated by this PR with reconciliation facts only. |
| Local `.vercel/` directory | Untracked local workspace state. | Do not commit. Inspect separately before ignore/cleanup decisions. |

## Validation For This Reconciliation PR

- `npm run project-state:check`
- `git diff --check origin/master...HEAD`

No server tests, Admin build, production validation, or live endpoint checks are
required for this C-tier documentation and project-state reconciliation.
