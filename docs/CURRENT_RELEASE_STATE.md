# Current Release State

```yaml
document_metadata:
  doc_type: canonical
  lifecycle: active
  authority_scope: current_release_state
  superseded_by: null
  last_verified_at: 2026-08-28
  production_authority: false
```

> Status:
> - Type: Dated documented release snapshot
> - Version management baseline: `v3` artifact and runtime-identity foundation
> - Git source reconciliation cutoff:
>   `master@2824d01f9523ff39805083744e7b0c4f30bfef50`, observed 2026-08-28;
>   this is not a permanent current-head claim
> - Latest recorded control-plane deployment event: 2026-08-26, deployed source
>   `b5ca23db58c55f2d73ec59ffa9525f85b92a8a9c`
> - Recorded deployed release identity:
>   `control-plane-b5ca23db-a3-sync-20260825`
> - Exact deployed-source build evidence: Release Artifact run `32854893859`,
>   Dependency Artifact run `32854893837`, and Production Deploy Dry Run
>   `32856999391`
> - Recorded control-plane terminal observation: promotion-09 readback on
>   2026-08-26 matched the release pointer, service and process working
>   directory; a later public-only health window returned three HTTP 200
>   responses
> - This C-tier reconciliation performed no fresh production or runtime readback
> - Execution authority: None

## A3 Production Closeout (2026-08-26)

At the 2026-08-26 deployment cutoff,
`master@b5ca23db58c55f2d73ec59ffa9525f85b92a8a9c` resolved to merged PR #667
and was the exact source of the latest recorded `control-plane-app`
deployment. Release Artifact
run `32854893859` produced `proxy-gateway-b5ca23db58c5` (Actions artifact ID
`9565756416`), and Dependency Artifact run `32854893837` produced
`control-plane-dependency-b5ca23db58c55f2d73ec59ffa9525f85b92a8a9c`
(Actions artifact ID `9565754679`). The source ZIP is 7,563,583 bytes with
SHA-256 `20bf7d56c63e5038497d1c12c53507267f4468516e2e23fe4732710658acb76d`;
the dependency archive is 26,664,960 bytes with SHA-256
`c87e70c8fbae033eb357b103ac2da554b99f6af4a50d02294fe1e615c3c7de5b`.
Production Deploy Dry Run `32856999391` also succeeded for that exact source.
The Actions artifacts were observed
unexpired through 2026-09-08; they remain short-lived build evidence even
though the exact downloaded packets were verified during this deployment.

The A3 candidate-preparation stage verified the exact staged source, protected
overlay, bounded dependency materialization, restricted service-native smoke,
terminal cleanup and materializer receipt before promotion. Promotion run
`a3b-b5ca23db-promote-20260826-09` then created and verified the shared SQLite
snapshot, atomically exchanged the release pointer, started the candidate once,
and completed the health gate. Terminal readback recorded
`promoted_verified`: the pointer and process working directory matched
`control-plane-b5ca23db-a3-sync-20260825`, the service was active/running with
result `success` and restart count zero, and no rollback start was used.

The durable execution evidence is the
[PR #667 Deploy Note](https://github.com/gccwebos-com/proxy-gateway-minimal/pull/667#issuecomment-5426440067)
and the
[Issue #636 closeout receipt](https://github.com/gccwebos-com/proxy-gateway-minimal/issues/636#issuecomment-5426441456).
A delayed public-only health window returned three HTTP 200 responses without
redirects. No database restore, schema mutation, feature activation,
runtime-identity change or old-release deletion occurred. The terminal receipt
recorded the previous immutable release as retained for code-pointer rollback.

This closes the A3 dependency-materialization and production-promotion outcome
for `control-plane-app`. It does not activate wallet-first, deferred-runtime or
Account Resource Authority functionality, apply their schema gates, or deploy
the Portal, Admin, company-site or runtime-config release units.

## Dated Source And A3 Reconciliation (2026-08-23)

The reviewed source observed at the 2026-08-23 reconciliation cutoff was
`master@42d17885646d52387f9327f19e2a2e0d70b2b84e`, which includes merged PR
#662. Exact-master CI run `32645695594`, CodeQL run `32645695630`, Release
Artifact run `32645695598`, and Control Plane Dependency Artifact run
`32645695541` all succeeded. The same read-only GitHub inventory observed zero
open PRs, eighteen open Issues, and 117 remote branches.

Release Artifact run `32645695598` produced three temporary build artifacts:

- `proxy-gateway-42d17885646d` (Actions artifact ID `9494798503`);
- `portal-static-42d17885646d` (Actions artifact ID `9494802700`);
- `admin-static-42d17885646d` (Actions artifact ID `9494802010`).

Dependency Artifact run `32645695541` produced
`control-plane-dependency-42d17885646d52387f9327f19e2a2e0d70b2b84e`
with Actions artifact ID `9494801281`, size `6460706` bytes, and observed
expiry `2026-09-06T14:32:03Z`. These artifacts are temporary build evidence,
not durable release retention, deployment, rollback identity, or current
runtime proof.

Issue #636 A3 source work is merged through PR #662. PR #654's exact head
passed a disposable non-production XFS physical run that verified project-tree
setup, project accounting/enforcement, fixed byte and inode limits, rejected
byte and inode writes with Linux XFS `ENOSPC`, diagnostics integrity, and
complete cleanup/readback.

PR #656's exact head separately passed the restricted service-native smoke on
the non-production physical host. The fixed non-root principal, native module
and snapshot-import workload, cgroup v2 boundary, terminal/unit readback,
diagnostics integrity, and cleanup were verified. This closes both A3-1
physical evidence segments. Merged PR #658 added the production XFS runtime
source path, but only when the complete explicit tuple
`--enable-a3-materializer --a3-run-label <label> --a3-project-id <id>` is
supplied. Default and partial invocations remain fail-closed with
`worker_storage_limit_unavailable`.

Merged PR #662 adds a separate bounded artifact-admission path for the existing
production ext4 topology. It is also default-off and requires the complete
explicit tuple `--enable-bounded-artifact-admission --bounded-run-label
<label>`. The XFS route remains available. The bounded route binds the exact
artifact budget and filesystem topology, retains the service-native smoke and
fail-closed guards, and emits schema-4 receipts.

Production dry-run `32628957935` then built and validated the then-current
`master@b93577c99c1202d1f799e2da4e573c8ad7fcf13c` packet without host access
or mutation. The approved A3-2 read-only inventory
observed the live release recorded by PR #622, a healthy active/running service,
matching current/service/process working-directory identity, a clean candidate
namespace, cgroup v2, 140537528320 available bytes, and a read-only SQLite
`quick_check` result of `ok`. The fixed deployment root is on `ext4`, however,
with no project-quota mount option, accounting, enforcement, report, or project
ID. The then-current XFS-only production quota readback therefore could not
pass. That `master@b93577c...` A3-2 attempt remains a historical `NO-GO`; no
artifact upload, materialization, pointer switch, service change, quota change,
schema/feature activation, or promotion occurred. It does not evaluate the new
bounded route. A fresh Risk A read-only inventory and dry-run bound to exact
`master@42d17885646d52387f9327f19e2a2e0d70b2b84e` and artifact ID
`9494801281` were pending at that cutoff. The 2026-08-26 closeout above
supersedes that pending status with exact-source production evidence for
`master@b5ca23db58c55f2d73ec59ffa9525f85b92a8a9c`.

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
is closed, and there are no open PRs. Those item counts and states are dated
evidence only. Current sequencing must be resolved from native live Issues and
PRs, using Project #1 only as navigation; `project-state/*.json` does not own
the live queue.

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

The 2026-08-26 Deploy Note binds the deployment recorded at that cutoff to
exact source `b5ca23db58c55f2d73ec59ffa9525f85b92a8a9c`, source artifact ID
`9565756416`,
dependency artifact ID `9565754679`, Production Deploy Dry Run `32856999391`
and release `control-plane-b5ca23db-a3-sync-20260825`. Earlier 2026-08-16 and
2026-08-14 control-plane deployments remain historical evidence. None of these
events records a Portal or Admin static promotion.

Runtime Config Identity v1 remains an offline deterministic observation
contract for `japan-runtime-config` and `sgp-runtime-config`. A generated
identity is not a deploy event, and this Risk C reconciliation did not observe
either live host.

The exact-source build proof used by the recorded 2026-08-26 deployment is
Release Artifact run `32854893859` plus Dependency Artifact run `32854893837`
for `b5ca23db58c55f2d73ec59ffa9525f85b92a8a9c`.

## Latest Recorded Production Deployment

### Deploy Note: A3 Production Sync Promotion (2026-08-26)

The authoritative execution record is the
[PR #667 Deploy Note](https://github.com/gccwebos-com/proxy-gateway-minimal/pull/667#issuecomment-5426440067).

**Deployment Metadata:**

- **deployed_at**: 2026-08-26T13:53:47.576Z
- **release_unit**: control-plane-app
- **source_commit**: b5ca23db58c55f2d73ec59ffa9525f85b92a8a9c
- **artifact_or_release**: `proxy-gateway-b5ca23db58c5` / dependency artifact
  `control-plane-dependency-b5ca23db58c55f2d73ec59ffa9525f85b92a8a9c` /
  `control-plane-b5ca23db-a3-sync-20260825`
- **target**: vultr-japan-control
- **backup**: verified root-custody SQLite snapshot created before the pointer
  exchange; no restore performed

**Validation Results recorded at execution time:**

- Candidate preparation completed protected-overlay verification, bounded
  materialization and restricted service-native smoke.
- The pointer exchanged atomically; terminal pointer, service and process CWD
  identity matched the candidate.
- The candidate started exactly once. Final service state was active/running,
  result `success`, restart count zero; rollback start count remained zero.
- SQLite snapshot/custody and terminal readback passed. SQLite schema version
  remained 101 with aggregate schema entry count 225.
- No database restore, schema mutation, feature activation or old-release
  deletion occurred.
- A later public-only availability window returned three HTTP 200 responses
  without redirects; response bodies were not retained.

**Risk Classification:** A-tier
**Rollback Boundary:** the terminal receipt recorded the prior immutable
release as retained; code-pointer rollback and database restore remain
separate operator decisions, and neither was performed.

### Prior Deploy Note: Japan Control Plane Upgrade (2026-08-16)

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

The 2026-08-26 Risk A promotion binds `control-plane-app` to the identity below.
Other release units retain their separate documented state and were not
reclassified by this deployment.

| Release unit | Documented identity | State | Evidence and boundary |
| --- | --- | --- | --- |
| `control-plane-app` | `control-plane-b5ca23db-a3-sync-20260825`; source `b5ca23db58c55f2d73ec59ffa9525f85b92a8a9c`. | `active_documented` | PR #667 records exact source/dependency packets, bounded materialization, service-native smoke, verified snapshot, atomic pointer exchange, one candidate start, pointer/PID/CWD binding and health. Promotion-09 ended `promoted_verified`; no rollback, schema change or feature activation occurred. |
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

## Git Source And Recorded Deployment-Source Drift

The Git source cutoff observed on 2026-08-28 is
`master@2824d01f9523ff39805083744e7b0c4f30bfef50`. The latest recorded
control-plane deployment event used source
`b5ca23db58c55f2d73ec59ffa9525f85b92a8a9c` on 2026-08-26. These identities
are intentionally distinct. This docs-only reconciliation performed no fresh
runtime readback and cannot state current runtime alignment. The A3 bounded
dependency materialization and promotion path is recorded as deployed and
verified for that `control-plane-app` release. The earlier XFS-only A3-2
`NO-GO` remains historical evidence explaining why the bounded ext4 route was
added; it is not the terminal A3 state recorded by the 2026-08-26 closeout.

Source/deployment alignment does not prove activation of wallet-first,
deferred runtime, Authority, or the four wallet-first schema gates. Promotion-09
explicitly recorded no schema mutation or feature activation.

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
- Git source reconciliation cutoff observed 2026-08-28
  `master@2824d01f9523ff39805083744e7b0c4f30bfef50`
- GitHub CI run `32854893874`
- GitHub CodeQL run `32854893258`
- GitHub Release Artifact run `32854893859`
- GitHub Dependency Artifact run `32854893837`
- GitHub Production Deploy Dry Run `32856999391`
- [PR #654 A3 quota physical proof](https://github.com/gccwebos-com/proxy-gateway-minimal/pull/654)
- [PR #656 A3 service-native smoke proof](https://github.com/gccwebos-com/proxy-gateway-minimal/pull/656)
- [PR #658 A3 source integration](https://github.com/gccwebos-com/proxy-gateway-minimal/pull/658)
- [PR #662 bounded artifact admission](https://github.com/gccwebos-com/proxy-gateway-minimal/pull/662)
- [Issue #636 A3 promotion boundary](https://github.com/gccwebos-com/proxy-gateway-minimal/issues/636)
- [Issue #636 A3-2 inventory receipt](https://github.com/gccwebos-com/proxy-gateway-minimal/issues/636#issuecomment-5385197978)
- [PR #667 final Deploy Note](https://github.com/gccwebos-com/proxy-gateway-minimal/pull/667#issuecomment-5426440067)
- [Issue #636 production closeout receipt](https://github.com/gccwebos-com/proxy-gateway-minimal/issues/636#issuecomment-5426441456)
- Control-plane deployment-event source recorded 2026-08-26
  `b5ca23db58c55f2d73ec59ffa9525f85b92a8a9c`
- Release identity recorded by that deployment event
  `control-plane-b5ca23db-a3-sync-20260825`
- Prior release evidence:
  [PR #622 Deploy Note](https://github.com/gccwebos-com/proxy-gateway-minimal/pull/622#issuecomment-5305417656)
  and `control-plane-57d7ab751b9c-a5b2-20260816T002126Z-1786839686627`
- The dated deployment and production-replacement records indexed under
  `docs/production-replacement-records/`
