# Current Release State

```yaml
document_metadata:
  doc_type: canonical
  lifecycle: active
  authority_scope: release_state
  superseded_by: null
  last_verified_at: 2026-08-09
  production_authority: false
```

> Status:
> - Type: Current documented release snapshot
> - Version management baseline: `v3` artifact and runtime-identity foundation
> - Source evidence baseline: `master@02fc63a3f949b748dcccf26ba7d310be82f4b6df`
> - Source evidence observed: 2026-08-09, America/Los_Angeles
> - Latest successful build evidence: Release Artifact run `31267179669`
> - Latest recorded production deployment event: 2026-07-20,
>   `control-plane-app` source `9982d378f93dd506c24c137197293f6942dc45ee`
> - Last fully reconciled prior production snapshot: source
>   `9bc03b413e58198a08617f2e587e0120eb4d6cb2`
> - Current live identity: Not freshly inventoried by this Risk C reconciliation
> - Execution authority: None

## Current Source-Only Reconciliation (2026-08-09)

The exact reviewed source cutoff is
`master@02fc63a3f949b748dcccf26ba7d310be82f4b6df`. This cutoff supersedes older
repository-source snapshots in this document, but it does not rewrite the dated
deployment evidence retained below.

At this cutoff, source, tests, migrations, and default-off composition establish
the following implementation language:

- Admin authentication/session foundations, a backend read-capability registry,
  and an Operations read envelope exist. Enforcement is partial and default-off;
  the Admin frontend still has no `/api/admin-auth` login consumer.
- Coin Wallet is a balance projection and Coin Ledger is the immutable financial
  fact stream. Additive Wallet reference indexes exist as source/migration
  evidence; no production schema apply is established here.
- Coins Commerce follows `Offer -> Checkout Quote -> Commerce Order ->
  Fulfillment Command`. Commerce Orders purchase products with Coins and are not
  Recharge/Payment Orders.
- Account Resource Authority can bind an exact request, entitlement, issued
  link/version, and immutable Quote provenance. Source availability does not
  establish production assignment or activation.
- Durable provider-neutral Recharge/Payment storage and coordination plus Portal
  routes exist in source. PayPal sandbox and the XSD/ChaoJiPay source runtimes
  remain single-active/default-off evidence; no live provider activation,
  refund, or reconciliation is established.
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
artifacts do not establish deployment, provider enablement, production schema
state, or current runtime identity. A Risk A action still requires fresh
read-only inventory and an exact approval gate.

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

The latest successful exact-`master` build proof is Release Artifact run
`31267179669` for source
`02fc63a3f949b748dcccf26ba7d310be82f4b6df`. Its source artifact is
`proxy-gateway-02fc63a3f949`, and the control-plane, Portal, and Admin jobs all
completed successfully. The observed artifact expires on 2026-08-22. This is
short-lived build evidence only; it does not satisfy durable release retention
or establish approval, deployment, or production reconciliation.

Runtime Config Identity v1 remains an offline deterministic observation
contract for `japan-runtime-config` and `sgp-runtime-config`. A generated
identity is not a deploy event, and this Risk C reconciliation did not observe
either live host.

## Latest Recorded Production Deployment

### Deploy Note: Japan Control Plane Upgrade (2026-07-20)

This is the latest deployment event recorded in the repository. It is retained
as dated evidence and is not a fresh claim about the current live pointer.

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

No fresh Risk A production inventory was performed on 2026-08-09. The table
therefore separates the latest recorded event from the last fully reconciled
prior snapshot instead of guessing which identity currently serves.

| Release unit | Dated documented identity | State | Evidence and boundary |
| --- | --- | --- | --- |
| `control-plane-app` | Latest recorded event: `master-upgrade-20260720-9982d378`, source `9982d378f93dd506c24c137197293f6942dc45ee`. Last fully reconciled prior snapshot: `phase2-control-plane-artifact-alignment-20260710-001`, source `9bc03b413e58198a08617f2e587e0120eb4d6cb2`, artifact `proxy-gateway-9bc03b413e58.zip`, SHA-256 `6ECFD142F387996411FC5435F9F313F6C5E6740005C11DE25E60C499D5E40278`. | `active_documented` | The 2026-07-20 event was validated at execution time and no later tracked replacement was found, but this reconciliation did not freshly read the live pointer, service, artifact, or runtime identity. |
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

## Retired Japan Additive-Repair GitHub Lanes

In this source revision,
`.github/workflows/japan-runtime-config-additive-repair.yml` and
`.github/workflows/japan-runtime-config-bootstrap-probe.yml` are retired and
absent. The repository therefore has no manual GitHub Actions entry point for
new dispatches of the former Japan additive-repair or bootstrap-probe path.

This is source-layer retirement. It does not cancel or disable reruns of
historical workflow runs. No rerun is authorized by this source change, and a
read-only historical-run inventory is required before operational closure can
be claimed.

This source retirement does not authorize dispatch, prove the absence of
Environment secrets or host authorization, alter `vultr-japan-production`, or
change production state. Restoring either historical workflow alone does not
authorize dispatch. Any reactivation requires fresh read-only inventory, a new
immutable artifact and source-to-runtime review, an explicit rollback plan, and
a new exact Risk A approval.

## Source And Production Drift

Current source is
`master@02fc63a3f949b748dcccf26ba7d310be82f4b6df`. The latest recorded
control-plane deployment event used `9982d378f93dd506c24c137197293f6942dc45ee`,
while the last fully reconciled prior production snapshot used
`9bc03b413e58198a08617f2e587e0120eb4d6cb2`. The current live identity was not
freshly inventoried, so the exact runtime delta is unknown.

All capabilities added after the latest recorded deployment event remain
`not_deployed` unless a separate Deploy Note and fresh target validation say
otherwise. In particular, Admin read authorization, Wallet reference indexes,
durable Recharge/Payment, XSD/ChaoJiPay adapters, Coins Commerce, Account
Resource Authority, traffic projection/UI integration, and forwarded-client
trust changes are source/test/migration/default-off evidence at this cutoff.

Open Draft PRs #592-#594 are not part of `master`, artifacts for this cutoff,
or production evidence. A successful source check or artifact workflow does
not move a production pointer.

## Evidence

- `RELEASE_MANIFEST.md`
- `docs/OPERATIONS_PLANE_SOURCE_REALITY.md`
- Exact source cutoff
  `master@02fc63a3f949b748dcccf26ba7d310be82f4b6df`
- GitHub Release Artifact run `31267179669`
- Source artifact `proxy-gateway-02fc63a3f949` (observed expiry 2026-08-22)
- The dated deployment and production-replacement records indexed under
  `docs/production-replacement-records/`
