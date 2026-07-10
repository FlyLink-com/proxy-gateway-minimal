# Current Release State

> Status:
> - Type: Current documented release snapshot
> - Version management baseline: `v1`
> - Baseline commit: `67838e98` (PR #443)
> - Updated: 2026-07-09, America/Los_Angeles
> - Evidence cutoff: tracked execution records through 2026-07-09 plus local
>   artifact hash verification on the same date
> - Live verification: Not performed for this docs-only update
> - Execution authority: None

Read this file for the latest repository-backed production identity before
reading historical deployment records. It does not replace live read-only
inventory before a Risk A action and does not authorize promotion, rollback,
runtime mutation, credential access, or customer-data access.
`project-state/current.json` remains a coordination snapshot and does not
override this file for documented release identity.

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

## Documented Production Snapshot

| Release unit | Current documented identity | State | Evidence and boundary |
| --- | --- | --- | --- |
| `control-plane-app` | `traffic-usage-xray-idle-observable-20260709-001`; source `9a6c2dc5b8182006caa3c9358cb2e2bb12cd2590`; artifact SHA-256 `C646E8CC22CE5ECEDE3D6ED32B47F82FEA92605F965DBCD994D7A35DAD3F0563` | `active_documented` | The July 9 execution record validated the current pointer, service, health route, Portal routes, collector result, and timer. The local artifact still exists and its hash was rechecked for this snapshot. |
| `company-site-static` | July 9 Vercel production deployment for the GCC WebOS public site | `deployed_unreconciled` | The deployment used a prebuilt artifact from `1699a17a` plus dirty working-tree changes. PR #426 later merged as `e853076d`, but reproducibility from that merge commit is not proven. The historical record incorrectly called this unit `portal-static`; this snapshot corrects only the classification. |
| `portal-static` | Last tracked restore artifact `globalcircle-portal-ca9f5702-20260708.tar`; SHA-256 `DD6CB14E2F519078917760E9ADE4033732D68960C17ABDAC67A471797DF9EEFC` | `deployed_unreconciled` | The restore and later HTTP 200 route checks are documented, and PR #414 preserved a rebuildable source baseline. A current static artifact or pointer identity after later Portal changes is not recorded. |
| `admin-static` | Current immutable artifact identity not recorded | `unknown` | A July 8 record observed the static shell while protected Admin APIs remained blocked, but no current `admin-static` artifact lineage or later static promotion is recorded. |
| `japan-runtime-config` | `2026-07-09-japan-traffic-runtime-config-restore` execution identity | `active_documented` | The record validated Xray and Mihomo config tests, loopback-only metering endpoints, runtime services, collector success, and public/private boundaries. No immutable runtime-config artifact was recorded. |
| `sgp-runtime-config` | `2026-07-08-sgp-subscription-render-receipt-reconcile` execution identity | `active_documented` | The record validated the SGP edge agent, three current receipts, three protocol services, loopback metering endpoints, and rendered SGP channels. No live re-inventory was performed in this update. |
| `subscription-rendering` | Receipt-gated rendering served by the documented control-plane and SGP runtime state | `deployed_unreconciled` | A real delivered artifact rendered all documented JP and SGP channels on July 8, but no separate immutable `subscription-rendering` release artifact is recorded. |
| `attribution-appsflyer` | Disabled/dry-run baseline from `appsflyer-runtime-disabled-20260708-001`, included in the deployed control-plane source ancestry | `disabled` | No live provider credentials or activation are recorded. Live mode remains outside this baseline. |

## Known Master-Only Capabilities

These release-bearing changes are descendants of the deployed control-plane
source or belong to unresolved static ownership, but have no matching
production promotion in the current record set:

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

## Freeze Boundary

`67838e98` is **Version Management Baseline v1**: the capability map, release
manifest, release-unit registry, and Agent rules are accepted source facts.
This file completes the documented state view without promoting any capability.

Update this snapshot only when a tracked deployment, rollback, or explicit
release reconciliation changes one of the listed units. Before any Risk A
action, verify the target live and treat newer validated production evidence as
authoritative over this dated file.

## Evidence

- `RELEASE_MANIFEST.md`
- `docs/RECENT_PR_CAPABILITY_MAP_2026_07_09.md`
- `docs/SOURCE_PRODUCTION_RECONCILIATION_2026_07_08.md`
- `docs/production-replacement-records/2026-07-09-traffic-usage-xray-idle-observable-backend-deploy-execution.md`
- `docs/production-replacement-records/2026-07-09-gccwebos-mobile-cta-vercel-production-deploy-execution.md`
- `docs/production-replacement-records/2026-07-09-japan-traffic-runtime-config-restore-execution.md`
- `docs/production-replacement-records/2026-07-08-sgp-subscription-render-receipt-reconcile-execution.md`
- `docs/production-replacement-records/2026-07-08-appsflyer-runtime-disabled-upgrade-execution.md`
