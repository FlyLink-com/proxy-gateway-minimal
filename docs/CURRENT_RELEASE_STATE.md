# Current Release State

```yaml
document_metadata:
  doc_type: canonical
  lifecycle: active
  authority_scope: current_release_state
  superseded_by: null
  last_verified_at: 2026-08-23
  production_authority: false
```

> Status:
> - Type: Current documented release snapshot
> - Version management baseline: `v3` artifact and runtime-identity foundation
> - Current source inventory: `master@b93577c99c1202d1f799e2da4e573c8ad7fcf13c`
>   observed 2026-08-23, America/Los_Angeles
> - Latest release source and production deployment event: 2026-08-16,
>   `control-plane-app` source `57d7ab751b9c3b9111bc7d7e799c28d165fdabdb`
> - Latest deployed release identity:
>   `control-plane-57d7ab751b9c-a5b2-20260816T002126Z-1786839686627`
> - Latest exact-master build evidence, not deployed: Release Artifact run
>   `32628598266` and Dependency Artifact run `32628598229`
> - Current control-plane identity: fresh A3-2 read-only production inventory
>   on 2026-08-23 matched the PR #622 Deploy Note and observed a healthy service;
>   other release units retain their separately documented state
> - Execution authority: None

## Current Source And A3 Reconciliation (2026-08-23)

The current reviewed source is
`master@b93577c99c1202d1f799e2da4e573c8ad7fcf13c`. The read-only GitHub
inventory observed no open PRs and eighteen open Issues. Exact-master CI,
CodeQL, Release Artifact, and Control Plane Dependency Artifact workflows all
succeeded.

Release Artifact run `32628598266` produced three temporary build artifacts:

- `proxy-gateway-b93577c99c12`;
- `portal-static-b93577c99c12`;
- `admin-static-b93577c99c12`.

Dependency Artifact run `32628598229` produced
`control-plane-dependency-b93577c99c1202d1f799e2da4e573c8ad7fcf13c`
with Actions artifact ID `9490394884`. These artifacts were observed as
available through 2026-09-06. They are temporary build evidence, not durable
release retention, deployment, rollback identity, or current runtime proof.

Issue #636 A3 source work is merged through PR #658. PR #654's exact head
passed a disposable non-production XFS physical run that verified project-tree
setup, project accounting/enforcement, fixed byte and inode limits, rejected
byte and inode writes with Linux XFS `ENOSPC`, diagnostics integrity, and
complete cleanup/readback.

PR #656's exact head separately passed the restricted service-native smoke on
the non-production physical host. The fixed non-root principal, native module
and snapshot-import workload, cgroup v2 boundary, terminal/unit readback,
diagnostics integrity, and cleanup were verified. This closes both A3-1
physical evidence segments. Merged PR #658 adds the production runtime source
path, but only when the complete explicit tuple
`--enable-a3-materializer --a3-run-label <label> --a3-project-id <id>` is
supplied. Default and partial invocations remain fail-closed with
`worker_storage_limit_unavailable`.

Production dry-run `32628957935` then built and validated the exact-master
packet without host access or mutation. The approved A3-2 read-only inventory
observed the live release recorded by PR #622, a healthy active/running service,
matching current/service/process working-directory identity, a clean candidate
namespace, cgroup v2, 140537528320 available bytes, and a read-only SQLite
`quick_check` result of `ok`. The fixed deployment root is on `ext4`, however,
with no project-quota mount option, accounting, enforcement, report, or project
ID. Exact-master production quota readback therefore cannot pass. A3-2 is
`NO-GO`; no artifact upload, materialization, pointer switch, service change,
quota change, schema/feature activation, or promotion occurred.

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
`docs/OPERATIONS_PLANE_SOURCE_REALITY.md`. The GitHub counts observed on
2026-08-09—three open Draft PRs, no open non-Draft PR, and fifteen open
Issues—are retained only as historical context. At the 2026-08-22 inventory,
PR #592 and #594 are closed unmerged, PR #593 is merged docs-only, Issue #561
is closed, and there are no open PRs. Current sequencing uses the eighteen live
Issues recorded in `project-state/*.json`.

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

The 2026-08-16 Deploy Note binds the current recorded deployment to exact source
`57d7ab751b9c3b9111bc7d7e799c28d165fdabdb` and release
`control-plane-57d7ab751b9c-a5b2-20260816T002126Z-1786839686627`, and records
verified artifact/config assembly. It does not name a retained GitHub Release
Artifact run. The prior 2026-08-14 deployment used Release Artifact run
`31816741441` and source artifact `proxy-gateway-c06f749f2452`; those identities
remain historical evidence and are not the live release. Neither deployment
records a Portal or Admin static promotion.

Runtime Config Identity v1 remains an offline deterministic observation
contract for `japan-runtime-config` and `sgp-runtime-config`. A generated
identity is not a deploy event, and this Risk C reconciliation did not observe
either live host.

The latest exact-master build proof is Release Artifact run `32628598266` for
`b93577c99c1202d1f799e2da4e573c8ad7fcf13c`. It does not replace the build
identity used by the recorded 2026-08-16 deployment and does not change any
release-unit state in the production snapshot below.

## Latest Recorded Production Deployment

### Deploy Note: Japan Control Plane Upgrade (2026-08-16)

The authoritative execution receipt is the existing
[PR #622 Deploy Note](https://github.com/gccwebos-com/proxy-gateway-minimal/pull/622#issuecomment-5305417656).

**Deployment Metadata:**

- **deployed_at**: 2026-08-16T02:46:11.800Z
- **release_unit**: control-plane-app
- **source_commit**: 57d7ab751b9c3b9111bc7d7e799c28d165fdabdb
- **artifact_or_release**:
  `control-plane-57d7ab751b9c-a5b2-20260816T002126Z-1786839686627`
- **target**: vultr-japan-control
- **backup**: fresh shared SQLite snapshot with detached integrity verification;
  no restore recorded

**Validation Results recorded at execution time:**

- Artifact/config assembly and the fresh SQLite snapshot were verified.
- The current pointer switched atomically; service PID/CWD binding and loopback
  health passed.
- A5E transition evidence validated four records; database quick/FK checks
  passed.
- Five newly introduced feature flags remained off.

The 2026-08-23 A3-2 read-only inventory independently observed this exact
release label as current and reconfirmed active/running service and CWD binding
without changing production state.

**Risk Classification:** A-tier
**Rollback Boundary:** pointer rollback and database restore remain separate
operator decisions; no database restore was performed.

### Prior Deploy Note: Japan Control Plane Upgrade (2026-08-14)

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

The 2026-08-16 Risk A deployment and 2026-08-23 A3-2 read-only inventory bind
`control-plane-app` to the identity below. Other release units retain their
separate documented state and were not reclassified by this inventory.

| Release unit | Documented identity | State | Evidence and boundary |
| --- | --- | --- | --- |
| `control-plane-app` | `control-plane-57d7ab751b9c-a5b2-20260816T002126Z-1786839686627`; source `57d7ab751b9c3b9111bc7d7e799c28d165fdabdb`. | `active_documented` | PR #622 records artifact/config assembly, snapshot verification, atomic pointer switch, PID/CWD binding and health. The 2026-08-23 A3-2 read-only inventory observed the same live label and healthy service/CWD identity, but found the deployment root on ext4 without XFS project quota. |
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
`57d7ab751b9c3b9111bc7d7e799c28d165fdabdb`. The detailed 2026-08-09 source
capability inventory is an ancestor of that source, but deployment of the
control-plane application does not prove that the wallet-first, deferred
runtime, Authority, or four wallet-first schema gates are enabled. The PR #622
Deploy Note records five new feature flags remaining off.

Current source is now
`b93577c99c1202d1f799e2da4e573c8ad7fcf13c`, 100 commits beyond the recorded
production source. The newer source includes the A3 dependency-artifact
materializer safety, physical quota proof, service-native smoke proof, and the
explicit default-off production runtime tuple. Its successful CI and temporary
artifacts do not establish deployment or activation. The A3-2 inventory proves
that the current production filesystem cannot satisfy the required XFS project
quota boundary, so materialization remains blocked.

The 2026-08-16 Deploy Note is scoped to `control-plane-app` and records five new
feature flags remaining off. It does not establish Portal/static deployment,
wallet-first schema enablement, wallet-first/deferred runtime activation,
Authority activation, or runtime-identity change. Portal production identity
remains `deployed_unreconciled`: before any Portal integration or activation,
its exact deployment/artifact, source commit, HTML entry, bootstrap, stylesheet,
and output directory must be bound and then validated in a separate approved
gate.

The next frontend remediation PR may address that boundary and the user-facing
flow, but its merge or preview validation does not authorize application of the
four wallet-first schemas or activation of the wallet-first/deferred/Authority
lane. Those remain separate Risk A actions.

## Evidence

- `RELEASE_MANIFEST.md`
- `docs/OPERATIONS_PLANE_SOURCE_REALITY.md`
- Detailed source-capability cutoff
  `master@02fc63a3f949b748dcccf26ba7d310be82f4b6df`
- Current source inventory
  `master@b93577c99c1202d1f799e2da4e573c8ad7fcf13c`
- GitHub Release Artifact run `32628598266`
- GitHub Dependency Artifact run `32628598229`
- [PR #654 A3 quota physical proof](https://github.com/gccwebos-com/proxy-gateway-minimal/pull/654)
- [PR #656 A3 service-native smoke proof](https://github.com/gccwebos-com/proxy-gateway-minimal/pull/656)
- [PR #658 A3 source integration](https://github.com/gccwebos-com/proxy-gateway-minimal/pull/658)
- [Issue #636 A3 promotion boundary](https://github.com/gccwebos-com/proxy-gateway-minimal/issues/636)
- [Issue #636 A3-2 inventory receipt](https://github.com/gccwebos-com/proxy-gateway-minimal/issues/636#issuecomment-5385197978)
- Deployed control-plane source
  `57d7ab751b9c3b9111bc7d7e799c28d165fdabdb`
- Deployed release
  `control-plane-57d7ab751b9c-a5b2-20260816T002126Z-1786839686627`
- [PR #622 Deploy Note](https://github.com/gccwebos-com/proxy-gateway-minimal/pull/622#issuecomment-5305417656)
- The dated deployment and production-replacement records indexed under
  `docs/production-replacement-records/`
