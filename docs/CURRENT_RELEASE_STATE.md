# Current Release State

```yaml
document_metadata:
  doc_type: canonical
  lifecycle: active
  authority_scope: release_state
  superseded_by: null
  last_verified_at: 2026-07-24
  production_authority: false
```

> Status:
> - Type: Current documented release snapshot
> - Version management baseline: `v3` artifact and runtime-identity foundation
> - Source evidence baseline: `9982d378f93dd506c24c137197293f6942dc45ee` (master @ 2026-07-20)
> - Static artifact baseline: `18807285` (PR #452)
> - Historical v2 baseline: `4fbe0222` (PR #445)
> - Updated: 2026-07-24, America/Los_Angeles (traffic-accounting addendum;
>   source and release baseline below remain 2026-07-20)
> - Source evidence cutoff: GitHub read-only inventory through `master@9982d378f93dd506c24c137197293f6942dc45ee` on 2026-07-20
> - Production/runtime evidence cutoff: `2026-07-20T06:21:00Z`; vultr-japan-control control-plane-app upgraded to master-upgrade-20260720-9982d378
> - Live verification: Production upgrade validation completed with service stability confirmed
> - Execution authority: None

## Source-Only Reconciliation Addendum (2026-07-30)

A read-only GitHub inventory for #561 observed
`master@1b41a63337271cf1d5f0553ef4e3a61c3190e5e5`. This is newer than the
primary source cutoffs retained below. The Operations/Admin/Commerce capability
matrix is `docs/OPERATIONS_PLANE_SOURCE_REALITY.md`.

The newer source includes Admin authentication/session foundations, manifest
and safe-read owner models, protected traffic collector projection, Portal
Wallet/Ledger reads, and Commerce catalog/order foundations. It does not by
itself update any artifact, deployment, provider, production, or current-live
identity below. The historical deployment records remain intact until a
separate release-state reconciliation or fresh approved live inventory replaces
them.

Read this file for the latest repository-backed release identity before reading
historical deployment records. It does not replace live read-only inventory
before a Risk A action and does not authorize promotion, rollback, runtime
mutation, credential access, or customer-data access. Newer validated Issue,
PR, or deployment evidence takes precedence over this dated cutoff until the
next source-state reconciliation.

## Latest Production Deployment

### Deploy Note: Japan Control Plane Upgrade (2026-07-20)

**Deployment Metadata:**
- **deployed_at**: 2026-07-20 06:21:00 UTC
- **release_unit**: control-plane-app
- **source_commit**: 9982d378f93dd506c24c137197293f6942dc45ee
- **artifact_or_release**: releases/master-upgrade-20260720-9982d378
- **target**: vultr-japan-control:/opt/proxy-gateway-minimal-candidate/current
- **backup**: /opt/proxy-gateway-minimal-candidate/backups/upgrade-20260720-060639/
- **previous_release**: releases/phase2-control-plane-artifact-alignment-20260710-001

**Validation Results:**
- Service Status: ✅ active (running), PID 1949527
- HTTP Console: ✅ 200 OK, "Proxy Gateway Console" title verified
- Service Ports: ✅ 3456 (Console), 18180 (HTTP Proxy) listening
- New Modules: ✅ lead-retention-operations.mjs, gate-governance.mjs present
- Database Schema: ✅ platform_leads table exists (0 records)
- Database Location: /opt/proxy-gateway-minimal-candidate/shared/state/subscription-control.sqlite (71M)
- Service Stability: ✅ No crash loops, 2+ minutes uptime post-restart

**Upgrade Scope (72 commits since phase2-control-plane-artifact-alignment-20260710-001):**
- Japan TUIC repair CI/CD workflow
- Platform lead retention infrastructure (platform_leads table initialized)
- Portal auth enhancements (credential lifecycle, refresh cooldown, trial limits)
- Governance framework (gate-governance.mjs, execution-contract.mjs)

**Execution Notes:**
- Initial deployment encountered missing config/ files due to incomplete transfer
- Rollback successfully tested: symlink reverted to old release, service recovered
- Second deployment succeeded after manual scp of config/*.json
- Schema migration auto-executed via initializeSchema() on service startup
- No identity_impact: runtime identity gates unchanged

**Risk Classification:** A-tier
**Rollback Plan:** Verified functional via Phase 5 test execution

---

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
`29418796724` for source
`5b61d9d787e2f98e9f834fe05de6dcbb6805cea7`. It completed the current
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
current `master` at `5b61d9d7`. Production and source state differ intentionally:

| PR | Capability | Release unit | State |
| --- | --- | --- | --- |
| #416, #419, #425, #441, #459, #460, #464 | Cumulative control-plane capabilities through traffic evidence producers | `control-plane-app` | `deployed` in `phase2-control-plane-artifact-alignment-20260710-001` |
| #465 | Runtime identity sync gate | `none` | `not_applicable`; governance rule only |
| #466 | Additive-only TUIC map repair capability | `control-plane-app` | `not_deployed`; alignment attempts rolled back |
| #467 | Condition-driven promotion health gate | `control-plane-app` | `not_deployed`; promotion attempt rolled back after identity rejection |
| #468 | Protected release-config assembly and identity gate | `control-plane-app` | `not_deployed`; clean validation and build evidence only |
| #469, #470, #472, #480, #485, #482, #483, #489, #492, #494 | Release-state, infrastructure-access, commercial-model, release-governance, project-intelligence, source-reconciliation, CI-lane, and documentation-governance records | `none` | `not_applicable`; source governance only |
| #471, #473, #474, #477, #490, #491 | Credential lifecycle, cumulative accounting, trial-limit, unresolved-provenance, usage-accounting, and admin-auth abuse-control changes | `control-plane-app` | `not_deployed`; reviewed source only |
| #478 | Offline natural-observation validator | `control-plane-app` | `not_deployed`; offline validator source only |
| #481 | Material-handoff preflight fixture stabilization | `none` | `not_applicable`; test-only change |
| #486, #487, #488 | Admin dependency remediations | `admin-static` | `not_deployed`; reviewed source and build evidence only |

Source merge, clean validation, and successful artifact workflows do not change
the production pointer. Failed promotion attempts are preserved as execution
evidence and are not reclassified as deployment success.

At this source inventory cutoff, two Draft PRs remain open and are not part of
`master`; no non-Draft PR is open. Draft PR #476 is the Issue #475
operations-foundation source/schema candidate, has merge conflicts, and is not
deployed. Draft PR #479 is at
`58ccdccc6af5ed120541f03d2713857e4a9a8a65`, is behind `master`, has zero
unresolved non-outdated review threads, and is not deployed. Gate
`pr479-forward-pending-rollback-obligation-remediation-20260715-003` was
approved by `issuecomment-4979572712` and terminated blocked at `fresh_binding`
by `issuecomment-4979585832` because of
`worktree_submodule_guard_null_wrapper_failure`. The approval is consumed and
nonreusable, no later durable Gate exists, and no open PR is artifact-approved,
deployed, or production-approved.

Issue #437 was reopened by the Risk C reconciliation receipt
`issuecomment-4976074286`: PR #482 had been recorded as its closer even though
the PR body explicitly denied resolving the Issue. The blocked predecessor is
not reclassified as successful, and PR #479's four checks from its old head are
not current-`master` integration evidence.

## Source Governance Snapshot

PRs #486-#492 and #494 are merged after PR #483; current `master` is
`5b61d9d787e2f98e9f834fe05de6dcbb6805cea7`. PR #483 added docs-only/code lane
routing and an always-run diff check while retaining one stable required
`Validate` context. The observed repository has 16 remote branches, two open
Draft PRs (#476/#479), no open non-Draft PRs, and five open Issues
(#437/#438/#439/#440/#475). Current exact-`master`
source/build proof is:

- CI `29418796398`: success.
- Release Artifact `29418796724`: success.
- CodeQL `29418794902` and `29418794903`: success.
- Deploy Cloudflare Site `29391680029`: build and verification succeeded for
  `329eb282ef88e7ab41bee1252f22fe3570f7d3c8`; deploy was skipped.

Ruleset `18935716` strictly requires `Validate`, requires zero approvals, and
does not require review-thread resolution. Six environments exist; only
`artifact-publication` has a branch policy, and none has reviewer enforcement.
This is the observed machine-enforcement boundary, not independent approval.

The manual Japan runtime-config additive-repair workflow is source-only and
does not establish a deployment or production result. Its `approval_pr` check
requires the nominated PR to merge at the exact workflow commit, to have a
passed `Validate` check, and to retain a latest-state approval on the PR final
head from a reviewer other than the actual triggering actor before the execute
job can read connection material. This source-only authorization is reusable
while those conditions remain true; `approval_pr` is not a one-time or consumed
credential. It does not bootstrap host access, authorize dispatch, apply the
map, or prove production success; each remains behind its separate Risk A gate.

The Japan TUIC repair-observation source candidate is likewise
`not_deployed`. It neither deploys the writer nor configures an observation-file
path, creates CI credentials, secrets, bindings, or systemd units, changes the
protected map, or dispatches a workflow run. A later, separately approved Risk
A sequence must deploy the reviewed control-plane source, configure one
protected observation-file path, obtain two naturally timer-written accepted
observations, complete fresh aggregate preflight, then bootstrap the temporary
forced-command identity with both its runner and sibling helper matched to that
reviewed source release, dispatch one run, and prove host and GitHub cleanup.
The fixed 2026-07-16 map-repair ZIP remains unchanged and cannot prove that a
newer host-side sibling helper is deployed. Source merge, if approved, does not
establish any of those steps or a
closed-loop production result.

GitHub reports 0 open code-scanning alerts, 0 open Dependabot alerts, and 0 open
secret-scanning alerts at this cutoff. Successful CodeQL execution remains
source-analysis evidence rather than production proof.

The ordered next-action queue is:

1. establish a new durable successor proposal on #437 after the blocked,
   consumed Gate `pr479-forward-pending-rollback-obligation-remediation-20260715-003`;
2. complete any newly authorized PR #479 source remediation,
   current-`master` integration,
   exact-head checks, formal review, Ready, and merge through independent
   approvals;
3. finish the Gate ledger/validator, stable CI contexts plus settings Gate,
   durable artifact retention/binding, and the minimal
   organization/runtime-evidence model through separate PRs; and
4. only then establish independent Artifact and Risk A production-alignment
   Gates.

## Phase 2 Source State

- #437 Traffic Accounting remains the primary implementation Epic. Source now
  includes the reviewed credential-lifecycle, cumulative-accounting,
  unresolved-provenance, and offline natural-observation work through #478.
  The Japan TUIC repair-observation writer remains a source candidate and is
  not deployed; it has no configured protected observation path, CI identity,
  CI secret/binding, systemd change, map mutation, or dispatched repair run.
  A 2026-07-23 read-only Japan aggregate observation found identity sync
  degraded (`missing=3`, `stale=46`) with an additive-only candidate
  (`add=3`, `remove=0`). Periodic traffic collection is active; `map_apply`
  has not started because the protected repair capability is not bootstrapped.
  Draft PR #479 is
  blocked at Gate 003 terminal receipt `issuecomment-4979585832`; that approval
  is consumed, and no later durable Gate exists. Issue #437 was reopened by
  receipt `issuecomment-4976074286`
  after PR #482 was incorrectly recorded as its closer. Admin UI, accounting
  influence, quota influence, and automation remain deferred.
- #438 Portal Lifecycle is queued after traffic-state semantics stabilize.
- #439 Commercial Foundation remains queued. PR #472 records the v1 package
  model and PR #474 adds a source-only trial-limit guard; billing and AppsFlyer
  live activation remain disabled.
- #440 Code Boundary Cleanup is an opportunistic guardrail, not a broad
  refactor.
- #475 Operations Foundation is a separate open source/schema lane. Draft PR
  #476 is not deployed and does not authorize production schema initialization,
  provider access, or runtime mutation.
- #457 is closed after real master merges proved staged Vercel deployment
  behavior without moving the public custom aliases.
- #462 is closed after a reviewed merge proved version upload without active
  Cloudflare promotion. Provider promotion remains a separate Risk A gate.

## Evidence

- `RELEASE_MANIFEST.md`
- GitHub CI run `29418796398`
- GitHub Release Artifact run `29418796724`
- GitHub CodeQL runs `29418794902` and `29418794903`
- GitHub Deploy Cloudflare Site run `29391680029`
- GitHub deployments `5389897330` and `5403913679`
- Closed GitHub Issue #457 inventory and execution comments
- Closed GitHub Issue #462 inventory, provider-gate, and merge-proof comments
- GitHub Issue #437 deployment, Evidence Runtime, reconciliation, retention,
  rollback, and source-only follow-up evidence through PR #479
- Open GitHub Issue #475 and Draft PR #476 operations-foundation source/schema
  evidence
- Merged GitHub PRs #486-#492 and #494 source, security, and documentation evidence
- `docs/RECENT_PR_CAPABILITY_MAP_2026_07_09.md`
- `docs/production-replacement-records/2026-07-09-traffic-usage-xray-idle-observable-backend-deploy-execution.md`
- `docs/production-replacement-records/2026-07-09-japan-traffic-runtime-config-restore-execution.md`
- `docs/production-replacement-records/2026-07-08-sgp-subscription-render-receipt-reconcile-execution.md`
