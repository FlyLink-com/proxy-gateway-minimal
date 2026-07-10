# Current Release State

> Status:
> - Type: Current documented release snapshot
> - Version management baseline: `v3` artifact and runtime-identity foundation
> - Source evidence baseline: `20f8345dd1e6d09dd1a816634aa8f29c5312fd0c` (PR #461), before this reconciliation change
> - Static artifact baseline: `18807285` (PR #452)
> - Historical v2 baseline: `4fbe0222` (PR #445)
> - Updated: 2026-07-10, America/Los_Angeles
> - Evidence cutoff: GitHub, Vercel, and Cloudflare read-only inventory through 2026-07-10T14:04:28Z
> - Live verification: company-site provider boundaries only; control/data-plane runtime was not re-inventoried
> - Execution authority: None

Read this file for the latest repository-backed release identity before reading
historical deployment records. It does not replace live read-only inventory
before a Risk A action and does not authorize promotion, rollback, runtime
mutation, credential access, or customer-data access. Newer validated Issue,
PR, or deployment evidence takes precedence over this dated cutoff until the
next source-state reconciliation.

## State Labels

- `active_documented`: the latest tracked execution record validated the unit,
  and no later tracked replacement was found. This is not current live proof.
- `deployed_unreconciled`: production deployment exists, but source, artifact,
  release-unit, or current-pointer lineage is incomplete.
- `unknown`: the current production identity cannot be proven from repository
  evidence.
- `disabled`: the unit is intentionally present without live activation.
- `not_deployed`: reviewed source is on `master` but no matching production
  promotion is recorded.

## Build Artifact State

Artifact Manifest v1 has build-time coverage for three release units:

| Release unit | Coverage | Boundary |
| --- | --- | --- |
| `control-plane-app` | Tracked | Existing ZIP workflows emit a ZIP, checksum, and `artifact.json`. |
| `portal-static` | Tracked | The Portal job builds and verifies `admin/dist-portal`, then emits a ZIP, checksum, and `artifact.json`. |
| `admin-static` | Tracked | The Admin job builds and verifies `admin/dist`, then emits a ZIP, checksum, and `artifact.json`. |

The latest successful `master` build proof is Release Artifact run
`29097381774` for source
`20f8345dd1e6d09dd1a816634aa8f29c5312fd0c`. It completed the current
control-plane, Portal, and Admin artifact jobs. This is build evidence only; it
does not establish approval, deployment, or production reconciliation.

Runtime Config Identity v1 defines a deterministic offline schema and generator
for `japan-runtime-config` and `sgp-runtime-config`. No generated production
identity is committed, and no Japan or Singapore runtime observation or
reconciliation has been performed.

## Deployment Promotion Boundary

The public company site is built by the linked Vercel project from `master`.
Read-only inventory and the completed Issue #457 gate established:

- Vercel Production Branch remains `master`.
- `autoAssignCustomDomains=false`.
- Build command, install command, output directory, Git integration, domains,
  and environment settings were not changed by the gate.
- Real merges #458 through #461 created production-target deployments while
  leaving the two public custom aliases on the previously approved deployment.
- The latest staged candidate is Vercel deployment
  `dpl_Fy7at228XHgWE1p2T5ZpCoa97HS1`, READY for source
  `20f8345dd1e6d09dd1a816634aa8f29c5312fd0c`. Its GitHub deployment record is
  `5392379943` with `production_environment=false`.
- `gccwebos.com` and `www.gccwebos.com` still resolve to
  `proxy-gateway-minimal-hqdudl13g-gccltd.vercel.app`, sourced from
  `7e9a8667657e5323e09ff7c262da85d26729e69b`, and both roots returned HTTP 200
  after the #461 merge.
- The current public GitHub Production deployment record remains `5389897330`.

The merge-versus-promotion boundary is proven and Issue #457 is closed.
Promotion or rollback remains a separate exact Risk A approval.

The repository Cloudflare workflow remains non-automatic through
`CLOUDFLARE_SITE_AUTO_DEPLOY=false`; CI run `29097381907` completed the
Cloudflare dry run without invoking its deploy job. Issue #462 found a separate
Cloudflare native Git trigger that previously ran `npx wrangler deploy` for
every `master` commit. The #461 merge therefore created Worker deployment
`540da82f-b04d-4d67-9c8d-c5542d55e8a5` with version
`e5a648c9-d3c4-47b7-afb9-4bbed8f1be70` at 100%.

Under the approved #462 provider gate, the native production trigger was
changed at `2026-07-10T14:04:05Z` to
`npx wrangler versions upload`. Independent readback showed that branch/path
filters, root directory, cache, repository connection, build-token reference,
environment-variable count, Worker settings, and domains were unchanged. The
setting mutation created no build, version, or deployment; the active
deployment/version above remained unchanged. The Worker has no custom domains,
but its `workers.dev` endpoint remains enabled and returned HTTP 200.

Issue #462 remains open until one reviewed `master` merge proves that the native
build creates a saved version without changing the active deployment.

## Documented Production Snapshot

| Release unit | Current documented identity | State | Evidence and boundary |
| --- | --- | --- | --- |
| `control-plane-app` | `traffic-usage-xray-idle-observable-20260709-001`; source `9a6c2dc5b8182006caa3c9358cb2e2bb12cd2590`; artifact SHA-256 `C646E8CC22CE5ECEDE3D6ED32B47F82FEA92605F965DBCD994D7A35DAD3F0563` | `active_documented` | The July 9 execution record validated the current pointer, service, health route, Portal routes, collector result, and timer. No live host re-inventory was performed in this update. |
| `company-site-static` | Vercel public deployment `5389897330`, source `7e9a8667657e5323e09ff7c262da85d26729e69b`; Cloudflare workers.dev deployment `540da82f-b04d-4d67-9c8d-c5542d55e8a5`, version `e5a648c9-d3c4-47b7-afb9-4bbed8f1be70` | `deployed_unreconciled` | The two public custom domains remain on Vercel. The secondary Cloudflare Worker has no custom domains, but was auto-promoted before the #462 gate. Neither serving surface has a reconciled portable company-site artifact lineage. |
| `portal-static` | Last tracked restore artifact `globalcircle-portal-ca9f5702-20260708.tar`; SHA-256 `DD6CB14E2F519078917760E9ADE4033732D68960C17ABDAC67A471797DF9EEFC` | `deployed_unreconciled` | Restore and later route checks are documented; no current immutable Portal artifact is reconciled to production. |
| `admin-static` | Current immutable production artifact identity not recorded | `unknown` | Build artifact identity exists, but no production Admin static promotion is recorded. |
| `japan-runtime-config` | `2026-07-09-japan-traffic-runtime-config-restore` execution identity | `active_documented` | The record validated loopback-only metering endpoints and collector success. Runtime Identity v1 has not observed this host. |
| `sgp-runtime-config` | `2026-07-08-sgp-subscription-render-receipt-reconcile` execution identity | `active_documented` | The record validated SGP services, metering endpoints, receipts, and rendered channels. Runtime Identity v1 has not observed this host. |
| `subscription-rendering` | Receipt-gated rendering served by the documented control-plane and SGP runtime state | `deployed_unreconciled` | A delivered artifact rendered documented JP and SGP channels, but no separate immutable rendering artifact is recorded. |
| `attribution-appsflyer` | Disabled/dry-run baseline from `appsflyer-runtime-disabled-20260708-001` | `disabled` | No live provider credentials or activation are recorded. |

## Source And Production Drift

The documented control-plane source `9a6c2dc5` is an ancestor of current
`master`, which is 29 commits ahead at this cutoff. The following release-bearing
capabilities remain source-only unless a later exact deployment record proves
otherwise:

| PR | Capability | Release unit | State |
| --- | --- | --- | --- |
| #416 | Redacted collector startup status and protected TUIC map tooling | `control-plane-app` | `not_deployed` |
| #419 | Stable subscription URL during Portal refresh | `control-plane-app` | `not_deployed` |
| #425 | Subscription refresh and credential-fetch abuse controls | `control-plane-app` | `not_deployed` |
| #432 | Portal preview isolation | unresolved `admin-static` or `portal-static` | `not_deployed` |
| #433 | Retired Aliyun gate APIs | `control-plane-app`, `admin-static` | `not_deployed` |
| #434 | Retired Aliyun runtime defaults | `control-plane-app` | `not_deployed` |
| #435 | Local proxy-control route boundary | `control-plane-app` | `not_deployed` |
| #441 | Canonical traffic collector-state contract | `control-plane-app` | `not_deployed` |
| #459 | Redacted collector error provenance | `control-plane-app` | `not_deployed` |
| #460 | Protected collector Admin projection and optional redacted snapshot bridge | `control-plane-app` | `not_deployed` |

PRs #442-#461 primarily establish capability mapping, release/artifact
governance, CI maintenance, and offline Runtime Identity. Their merge does not
promote the source-only capabilities above.

## Phase 2 Source State

- #437 Traffic Accounting is the only active implementation Epic. PRs #441,
  #459, and #460 are merged. Japan TUIC map verification status and SGP TUIC
  sidecar status still need separately evidenced protected producers before
  the Epic can close; Admin UI remains deferred.
- #438 Portal Lifecycle is queued after traffic-state semantics stabilize.
- #439 Commercial Foundation is queued and must keep billing and AppsFlyer live
  activation disabled.
- #440 Code Boundary Cleanup is an opportunistic guardrail, not a broad
  refactor.
- #457 is closed after real master merges proved staged Vercel deployment
  behavior without moving the public custom aliases.
- #462 is the temporary merge gate. Its provider setting is corrected, but one
  reviewed master merge must still prove version upload without active
  Cloudflare deployment change before the Issue closes and #437 resumes.

## Evidence

- `RELEASE_MANIFEST.md`
- GitHub CI run `29097381907`
- GitHub Release Artifact run `29097381774`
- GitHub deployments `5389897330` and `5392379943`
- Closed GitHub Issue #457 inventory and execution comments
- Open GitHub Issue #462 inventory and provider-gate execution comments
- GitHub Issue #437 merge evidence through PR #460
- `docs/RECENT_PR_CAPABILITY_MAP_2026_07_09.md`
- `docs/production-replacement-records/2026-07-09-traffic-usage-xray-idle-observable-backend-deploy-execution.md`
- `docs/production-replacement-records/2026-07-09-japan-traffic-runtime-config-restore-execution.md`
- `docs/production-replacement-records/2026-07-08-sgp-subscription-render-receipt-reconcile-execution.md`
