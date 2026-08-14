# Current Release State

```yaml
document_metadata:
  doc_type: canonical
  lifecycle: active
  authority_scope: release_state
  superseded_by: null
  last_verified_at: 2026-08-14
  production_authority: false
```

> Status:
> - Type: Current documented release snapshot
> - Version management baseline: `v3` artifact and runtime-identity foundation
> - Detailed source-capability inventory: `master@02fc63a3f949b748dcccf26ba7d310be82f4b6df`
>   observed 2026-08-09, America/Los_Angeles
> - Latest release source and production deployment event: 2026-08-14,
>   `control-plane-app` source `c06f749f245247eea7e94c68f4249a0017e8e884`
> - Latest build evidence used for that release: Release Artifact run `31816741441`,
>   artifact `proxy-gateway-c06f749f2452`
> - Current control-plane identity: fresh Risk A deployment readback passed at
>   execution time; other release units retain their separately documented state
> - Execution authority: None

## Dated Source-Capability Reconciliation (2026-08-09)

The detailed reviewed source cutoff is
`master@02fc63a3f949b748dcccf26ba7d310be82f4b6df`. It remains the dated
capability inventory below; the later control-plane deployment record does not
turn this inventory into evidence of feature activation.

Fresh aggregate production readback on 2026-08-14 distinguishes the unchanged
legacy surfaces from the new activation lane: legacy Portal routes, Coins
Wallet, Coins Commerce (audience `all_active`), and XSD recharge were already
enabled. The c06 deployment did not enable or revalidate those legacy surfaces.
The still-unenabled scope is limited to wallet-first, the deferred runtime,
Account Resource Authority, and the four wallet-first schema gates.

At this cutoff, source, tests, migrations, and default-off composition establish
the following implementation language:

- Admin authentication/session foundations, a backend read-capability registry,
  and an Operations read envelope exist. Enforcement is partial and default-off;
  the Admin frontend still has no `/api/admin-auth` login consumer.
- Coin Wallet is a balance projection and Coin Ledger is the immutable financial
  fact stream. Additive Wallet reference indexes exist as source/migration
  evidence; this dated inventory does not establish application of the four
  wallet-first schemas.
- Coins Commerce follows `Offer -> Checkout Quote -> Commerce Order ->
  Fulfillment Command`. Commerce Orders purchase products with Coins and are not
  Recharge/Payment Orders.
- Account Resource Authority can bind an exact request, entitlement, issued
  link/version, and immutable Quote provenance. Source availability does not
  establish production assignment or activation.
- Durable provider-neutral Recharge/Payment storage and coordination plus Portal
  routes exist in source. PayPal sandbox and the XSD/ChaoJiPay source runtimes
  remain source evidence here; this dated section does not state the current
  legacy XSD recharge runtime or enable a new wallet-first payment path.
- Traffic collection exposes protected usage samples and rollups. The Admin
  `Usage & Channels` surface does not yet consume that projection, and traffic
  accounting evidence is not the Coin Ledger.
- Forwarded-client attribution now treats the direct socket peer as authoritative
  unless that peer is explicitly trusted; malformed forwarded chains fail
  closed. This is source/test evidence, not proof of a deployed proxy topology.

The detailed capability/gap matrix is
`docs/OPERATIONS_PLANE_SOURCE_REALITY.md`. Open Draft PRs #592, #593, and #594
are excluded from this source baseline. The GitHub counts observed on
2026-08-09—three open Draft PRs, no open non-Draft PR, and fifteen open
Issues—are a dated inventory only and must be refreshed before a later current
claim.

Source availability, clean validation, migrations, feature flags, and build
artifacts do not establish activation of the wallet-first/deferred/Authority
lane, application of its schemas, or current runtime identity. A Risk A action
still requires fresh read-only inventory and an exact approval gate.

## State Labels

- `active_documented`: the latest tracked execution record validated the unit,
  and no later tracked replacement was found. This is not current live proof.
- `deployed_unreconciled`: a deployment record exists, but exact current
  pointer, artifact, release-unit, or runtime lineage has not been freshly
  reconciled.
- `unknown`: current production identity cannot be proven from retained
  repository evidence.
- `disabled`: the unit is intentionally present without live activation.
- `not_deployed`: reviewed source is on `master` but no matching production
  promotion is recorded.

## Build Artifact State

Artifact Manifest v1 has build-time coverage for three release units:

| Release unit | Coverage | Boundary |
| --- | --- | --- |
| `control-plane-app` | Tracked | The source package emits a ZIP, checksum, and `artifact.json`. |
| `portal-static` | Tracked | The Portal job builds and verifies `admin/dist-portal`, then emits a ZIP, checksum, and `artifact.json`. |
| `admin-static` | Tracked | The Admin job builds and verifies `admin/dist`, then emits a ZIP, checksum, and `artifact.json`. |

The latest exact-source build evidence used by the recorded deployment is
Release Artifact run `31816741441` for
`c06f749f245247eea7e94c68f4249a0017e8e884`. Its control-plane source artifact
is `proxy-gateway-c06f749f2452`; the exact artifact checksum was verified during
the approved deployment. The GitHub artifact remains build evidence, while the
separate Deploy Note below records the production promotion. No Portal or Admin
static artifact was deployed by that event.

Runtime Config Identity v1 remains an offline deterministic observation
contract for `japan-runtime-config` and `sgp-runtime-config`. A generated
identity is not a deploy event, and this Risk C reconciliation did not observe
either live host.

## Latest Recorded Production Deployment

### Deploy Note: Japan Control Plane Upgrade (2026-08-14)

The authoritative execution receipt is the existing
[PR #616 Deploy Note](https://github.com/gccwebos-com/proxy-gateway-minimal/pull/616#issuecomment-5295613931).

**Deployment Metadata:**

- **deployed_at**: 2026-08-14T16:19:18Z
- **release_unit**: control-plane-app
- **source_commit**: c06f749f245247eea7e94c68f4249a0017e8e884
- **artifact_or_release**: `proxy-gateway-c06f749f2452` /
  `control-plane-c06f749f-20260814`
- **target**: vultr-japan-control
- **backup**: shared control-plane snapshot created and verified before the
  pointer switch; no restore performed

**Validation Results recorded at execution time:**

- Service active; the release pointer and service process working directory
  matched the new immutable release.
- Local and public health checks returned 200.
- The temporary runtime start guard was removed only after successful health
  validation.
- No Portal/static deployment, wallet-first schema enablement, wallet-first or
  deferred-runtime activation, Account Resource Authority activation, or
  runtime-identity change was performed.
- The existing legacy Portal routes, Coins Wallet, Coins Commerce (audience
  `all_active`), and XSD recharge retained their prior enabled state; they were
  not enabled or revalidated by this deployment.

**Risk Classification:** A-tier
**Rollback Boundary:** pointer rollback and database restore remain separate
operator decisions; no database restore was performed.

### Prior Deploy Note: Japan Control Plane Upgrade (2026-07-20)

This prior deployment event is retained as dated historical evidence.

**Deployment Metadata:**

- **deployed_at**: 2026-07-20 06:21:00 UTC
- **release_unit**: control-plane-app
- **source_commit**: 9982d378f93dd506c24c137197293f6942dc45ee
- **artifact_or_release**: releases/master-upgrade-20260720-9982d378
- **target**: vultr-japan-control:/opt/proxy-gateway-minimal-candidate/current
- **backup**: /opt/proxy-gateway-minimal-candidate/backups/upgrade-20260720-060639/
- **previous_release**: releases/phase2-control-plane-artifact-alignment-20260710-001

**Validation Results recorded at execution time:**

- Service Status: active (running), PID 1949527
- HTTP Console: 200 OK, "Proxy Gateway Console" title verified
- Service Ports: 3456 (Console), 18180 (HTTP Proxy) listening
- New Modules: `lead-retention-operations.mjs`, `gate-governance.mjs` present
- Database Schema: `platform_leads` table exists (0 records)
- Database Location:
  `/opt/proxy-gateway-minimal-candidate/shared/state/subscription-control.sqlite`
  (71M)
- Service Stability: no crash loops, 2+ minutes uptime post-restart

**Upgrade Scope recorded at execution time:**

- Japan TUIC repair CI/CD workflow
- Platform lead retention infrastructure
- Portal auth enhancements
- Governance framework

**Execution Notes:**

- Initial deployment encountered missing `config/` files due to incomplete
  transfer.
- Rollback was exercised: the symlink reverted to the old release and the
  service recovered.
- A second deployment succeeded after manual transfer of `config/*.json`.
- Schema initialization ran through `initializeSchema()` on service startup.
- The execution record classified runtime identity gates as unchanged.

**Risk Classification:** A-tier
**Rollback Plan:** Recorded as verified during the execution

## Documented Production Snapshot

The 2026-08-14 Risk A deployment performed fresh readback for
`control-plane-app`. Other release units below retain their separate documented
state and were not reclassified by this control-plane release.

| Release unit | Documented identity | State | Evidence and boundary |
| --- | --- | --- | --- |
| `control-plane-app` | `control-plane-c06f749f-20260814`; source `c06f749f245247eea7e94c68f4249a0017e8e884`; artifact `proxy-gateway-c06f749f2452`. | `active_documented` | Fresh deployment readback verified the pointer, process working directory, active service, and local/public health at execution time. A shared control-plane snapshot was verified before switching; no restore or runtime-identity change occurred. |
| `company-site-static` | Dated July evidence records Vercel deployment `5389897330`, source `7e9a8667657e5323e09ff7c262da85d26729e69b`, plus Cloudflare Worker deployment `540da82f-b04d-4d67-9c8d-c5542d55e8a5`. | `deployed_unreconciled` | Portable artifact lineage and current serving identity were not freshly reconciled. |
| `portal-static` | Last tracked restore artifact `globalcircle-portal-ca9f5702-20260708.tar`; SHA-256 `DD6CB14E2F519078917760E9ADE4033732D68960C17ABDAC67A471797DF9EEFC`. | `deployed_unreconciled` | No current immutable Portal artifact or live pointer was freshly reconciled. |
| `admin-static` | Current immutable production artifact identity not recorded. | `unknown` | Build evidence exists, but no production Admin promotion is proven here. |
| `japan-runtime-config` | Dated records `2026-07-09-japan-traffic-runtime-config-restore` and `japan-traffic-evidence-runtime-activation-20260710-001`. | `active_documented` | No later tracked replacement was found; no fresh live Runtime Config Identity observation was performed. |
| `sgp-runtime-config` | Dated record `2026-07-08-sgp-subscription-render-receipt-reconcile`. | `active_documented` | No later tracked replacement was found; no fresh live Runtime Config Identity observation was performed. |
| `subscription-rendering` | Receipt-gated rendering was recorded against the dated control-plane and SGP state. | `deployed_unreconciled` | No separately reconciled current immutable rendering artifact is recorded. |
| `attribution-appsflyer` | Disabled/dry-run baseline from `appsflyer-runtime-disabled-20260708-001`. | `disabled` | No live provider credentials or activation are recorded. |

## Dated Promotion Boundary

July Issue #457 evidence established that Vercel source merges could create
production-target candidates without moving the public custom aliases. July
Issue #462 evidence changed a Cloudflare native trigger from direct deploy to
version upload and then observed a saved version without active promotion.
Those records prove the boundary for those executions; they are not a fresh
2026-08-09 readback of provider settings, domains, deployments, or runtime
state. Any provider promotion or rollback remains a separate exact Risk A gate.

## Manual Japan Additive-Repair Source Authorization

The manual Japan runtime-config additive-repair workflow retains one active
source-only authorization contract. `approval_pr` must resolve a merged PR at
the exact workflow commit, its final head must have a successful `Validate`
check, and the latest-state approval must come from a reviewer other than the
actual triggering actor. While those conditions remain true, this merged-PR
source authorization is reusable; `approval_pr` is not a one-time or consumed
credential.

This contract authorizes source admission only. It does not bootstrap host
access, authorize workflow dispatch, read connection material, apply a map,
deploy a release, mutate runtime state, or prove production success. Each such
action remains behind its separate exact Risk A gate and current evidence.

## Source And Production Drift

The latest deployed control-plane source is
`c06f749f245247eea7e94c68f4249a0017e8e884`. The detailed 2026-08-09 source
capability inventory is an ancestor of that source, but deployment of the
control-plane application does not prove that the wallet-first, deferred
runtime, Authority, or four wallet-first schema gates are enabled. It was not a
new activation or revalidation of the already enabled legacy Portal routes,
Coins Wallet, Coins Commerce (audience `all_active`), or XSD recharge.

The 2026-08-14 Deploy Note expressly records no Portal/static deployment,
wallet-first schema enablement, wallet-first/deferred runtime activation,
Authority activation, or runtime-identity change. Portal production identity remains
`deployed_unreconciled`: before any Portal integration or activation, its exact
deployment/artifact, source commit, HTML entry, bootstrap, stylesheet, and
output directory must be bound and then validated in a separate approved gate.

The next frontend remediation PR may address that boundary and the user-facing
flow, but its merge or preview validation does not authorize application of the
four wallet-first schemas or activation of the wallet-first/deferred/Authority
lane. Those remain separate Risk A actions.

## Evidence

- `RELEASE_MANIFEST.md`
- `docs/OPERATIONS_PLANE_SOURCE_REALITY.md`
- Detailed source-capability cutoff
  `master@02fc63a3f949b748dcccf26ba7d310be82f4b6df`
- Deployed control-plane source
  `c06f749f245247eea7e94c68f4249a0017e8e884`
- GitHub Release Artifact run `31816741441`
- Source artifact `proxy-gateway-c06f749f2452`
- [PR #616 Deploy Note](https://github.com/gccwebos-com/proxy-gateway-minimal/pull/616#issuecomment-5295613931)
- The dated deployment and production-replacement records indexed under
  `docs/production-replacement-records/`
