# Current Release State

> Status:
> - Type: Current documented release snapshot
> - Version management baseline: `v3` artifact and runtime-identity foundation
> - Source evidence baseline: `e1beacc15fdc35661077cd3387f3ba17a3966e1a` (PR #468), before this reconciliation change
> - Static artifact baseline: `18807285` (PR #452)
> - Historical v2 baseline: `4fbe0222` (PR #445)
> - Updated: 2026-07-11, America/Los_Angeles
> - Evidence cutoff: GitHub and Vercel read-only inventory through the #468 merge, plus validated Issue #437 production execution records
> - Live verification: no new production-host inventory was performed by this C-tier reconciliation
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
`29153679403` for source
`e1beacc15fdc35661077cd3387f3ba17a3966e1a`. It completed the current
control-plane, Portal, and Admin artifact jobs. This is build evidence only; it
does not establish approval, deployment, or production reconciliation.

Runtime Config Identity v1 defines a deterministic offline schema and generator
for `japan-runtime-config` and `sgp-runtime-config`. No generated production
config-identity file is committed, and that offline capability has not observed
Japan or Singapore. This is separate from the protected operational Evidence
Runtime activated on Japan for traffic status; that runtime is
`active_observation_only` and its read-only projection has been reconciled.

## Deployment Promotion Boundary

The public company site is built by the linked Vercel project from `master`.
Read-only inventory and the completed Issue #457 gate established:

- Vercel Production Branch remains `master`.
- `autoAssignCustomDomains=false`.
- Build command, install command, output directory, Git integration, domains,
  and environment settings were not changed by the gate.
- Real merges #458 through #468 created production-target deployments while
  leaving the two public custom aliases on the previously approved deployment.
- The latest staged candidate is Vercel deployment
  `proxy-gateway-minimal-l4wfa6q0h-gccltd.vercel.app`, READY for source
  `e1beacc15fdc35661077cd3387f3ba17a3966e1a`. Its GitHub deployment record is
  `5403913679` with `production_environment=false`.
- `gccwebos.com` and `www.gccwebos.com` still resolve to
  `proxy-gateway-minimal-hqdudl13g-gccltd.vercel.app`, sourced from
  `7e9a8667657e5323e09ff7c262da85d26729e69b`, and both roots returned HTTP 200
  after the #468 merge.
- The current public GitHub Production deployment record remains `5389897330`.

The merge-versus-promotion boundary is proven and Issue #457 is closed.
Promotion or rollback remains a separate exact Risk A approval.

The repository Cloudflare workflow remains non-automatic through
`CLOUDFLARE_SITE_AUTO_DEPLOY=false`; CI run `29153679418` completed the
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

The #463 merge proved the native build creates a saved version without changing
the active deployment, so Issue #462 is closed. The #468 merge created saved
candidate version `407eb863-0e82-4e73-af54-3a44722b07c9` in build
`f186b7d5-533c-4f5b-b056-27777243d93f`. The active deployment was not
independently re-read during this C-tier reconciliation; the last exact active
identity remains dated Issue #462 evidence, not a fresh live claim.

## Documented Production Snapshot

| Release unit | Current documented identity | State | Evidence and boundary |
| --- | --- | --- | --- |
| `control-plane-app` | `phase2-control-plane-artifact-alignment-20260710-001`; source `9bc03b413e58198a08617f2e587e0120eb4d6cb2`; artifact `proxy-gateway-9bc03b413e58.zip`; SHA-256 `6ECFD142F387996411FC5435F9F313F6C5E6740005C11DE25E60C499D5E40278`; size `4410855` bytes | `active_documented` | The approved alignment validated the pointer, service, health, Portal and auth boundaries, and natural collector/sidecar executions. Later #466/#467 promotion attempts rolled back; #468 was not promoted. |
| `company-site-static` | Vercel public deployment `5389897330`, source `7e9a8667657e5323e09ff7c262da85d26729e69b`; Cloudflare workers.dev deployment `540da82f-b04d-4d67-9c8d-c5542d55e8a5`, version `e5a648c9-d3c4-47b7-afb9-4bbed8f1be70` | `deployed_unreconciled` | The two public custom domains remain on Vercel. The secondary Cloudflare Worker has no custom domains, but was auto-promoted before the #462 gate. Neither serving surface has a reconciled portable company-site artifact lineage. |
| `portal-static` | Last tracked restore artifact `globalcircle-portal-ca9f5702-20260708.tar`; SHA-256 `DD6CB14E2F519078917760E9ADE4033732D68960C17ABDAC67A471797DF9EEFC` | `deployed_unreconciled` | Restore and later route checks are documented; no current immutable Portal artifact is reconciled to production. |
| `admin-static` | Current immutable production artifact identity not recorded | `unknown` | Build artifact identity exists, but no production Admin static promotion is recorded. |
| `japan-runtime-config` | `2026-07-09-japan-traffic-runtime-config-restore` plus `japan-traffic-evidence-runtime-activation-20260710-001` | `active_documented` | Protected traffic evidence is `active_observation_only`; read-only reconciliation is verified. Runtime services are healthy, identity synchronization is degraded, accounting completeness remains `risk_not_quantified`, and no trust or automation loop is active. Offline Runtime Config Identity v1 has not observed this host. |
| `sgp-runtime-config` | `2026-07-08-sgp-subscription-render-receipt-reconcile` execution identity | `active_documented` | The record validated SGP services, metering endpoints, receipts, and rendered channels. Runtime Identity v1 has not observed this host. |
| `subscription-rendering` | Receipt-gated rendering served by the documented control-plane and SGP runtime state | `deployed_unreconciled` | A delivered artifact rendered documented JP and SGP channels, but no separate immutable rendering artifact is recorded. |
| `attribution-appsflyer` | Disabled/dry-run baseline from `appsflyer-runtime-disabled-20260708-001` | `disabled` | No live provider credentials or activation are recorded. |

## Source And Production Drift

The documented production control-plane source `9bc03b41` is an ancestor of
current `master` at `e1beacc1`. Production and source state differ intentionally:

| PR | Capability | Release unit | State |
| --- | --- | --- | --- |
| #416, #419, #425, #441, #459, #460, #464 | Cumulative control-plane capabilities through traffic evidence producers | `control-plane-app` | `deployed` in `phase2-control-plane-artifact-alignment-20260710-001` |
| #465 | Runtime identity sync gate | `none` | `not_applicable`; governance rule only |
| #466 | Additive-only TUIC map repair capability | `control-plane-app` | `not_deployed`; alignment attempts rolled back |
| #467 | Condition-driven promotion health gate | `control-plane-app` | `not_deployed`; promotion attempt rolled back after identity rejection |
| #468 | Protected release-config assembly and identity gate | `control-plane-app` | `not_deployed`; clean validation and build evidence only |

Source merge, clean validation, and successful artifact workflows do not change
the production pointer. Failed promotion attempts are preserved as execution
evidence and are not reclassified as deployment success.

## Phase 2 Source State

- #437 Traffic Accounting is the only active implementation Epic. Collector
  state/provenance/projection, protected producers, Evidence Runtime activation,
  read-only reconciliation, and the Identity Gate are complete. Identity sync
  remains degraded (`missing=2`, `stale=19` at the approved observation), the
  additive repair capability is source-only, and `map_apply` has not started.
  Admin UI, accounting influence, quota influence, and automation remain
  deferred.
- #438 Portal Lifecycle is queued after traffic-state semantics stabilize.
- #439 Commercial Foundation is queued and must keep billing and AppsFlyer live
  activation disabled.
- #440 Code Boundary Cleanup is an opportunistic guardrail, not a broad
  refactor.
- #457 is closed after real master merges proved staged Vercel deployment
  behavior without moving the public custom aliases.
- #462 is closed after a reviewed merge proved version upload without active
  Cloudflare promotion. Provider promotion remains a separate Risk A gate.

## Evidence

- `RELEASE_MANIFEST.md`
- GitHub CI run `29153679418`
- GitHub Release Artifact run `29153679403`
- GitHub deployments `5389897330` and `5403913679`
- Closed GitHub Issue #457 inventory and execution comments
- Closed GitHub Issue #462 inventory, provider-gate, and merge-proof comments
- GitHub Issue #437 deployment, Evidence Runtime, reconciliation, retention
  inventory, and rollback evidence through PR #468
- `docs/RECENT_PR_CAPABILITY_MAP_2026_07_09.md`
- `docs/production-replacement-records/2026-07-09-traffic-usage-xray-idle-observable-backend-deploy-execution.md`
- `docs/production-replacement-records/2026-07-09-japan-traffic-runtime-config-restore-execution.md`
- `docs/production-replacement-records/2026-07-08-sgp-subscription-render-receipt-reconcile-execution.md`
