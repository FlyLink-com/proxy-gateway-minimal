# Current Release State

```yaml
document_metadata:
  doc_type: canonical
  lifecycle: active
  authority_scope: release_state
  superseded_by: null
  last_verified_at: 2026-07-15
  production_authority: false
```

> Status:
> - Type: Current documented release snapshot
> - Version management baseline: `v3` artifact and runtime-identity foundation
> - Source evidence baseline: `2413c101724df45579ebf4b9e0f306d32d9bb1af` (PR #483)
> - Static artifact baseline: `18807285` (PR #452)
> - Historical v2 baseline: `4fbe0222` (PR #445)
> - Updated: 2026-07-14, America/Los_Angeles
> - Source evidence cutoff: GitHub read-only inventory through `master@2413c101724df45579ebf4b9e0f306d32d9bb1af` on 2026-07-14
> - Production/runtime evidence cutoff: `2026-07-11T13:03:40Z`; the existing validated Issue #437 execution records remain dated evidence
> - Live verification: no fresh live production or provider inventory was performed by this C-tier reconciliation
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
`29381367545` for source
`2413c101724df45579ebf4b9e0f306d32d9bb1af`. It completed the current
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
current `master` at `2413c101`. Production and source state differ intentionally:

| PR | Capability | Release unit | State |
| --- | --- | --- | --- |
| #416, #419, #425, #441, #459, #460, #464 | Cumulative control-plane capabilities through traffic evidence producers | `control-plane-app` | `deployed` in `phase2-control-plane-artifact-alignment-20260710-001` |
| #465 | Runtime identity sync gate | `none` | `not_applicable`; governance rule only |
| #466 | Additive-only TUIC map repair capability | `control-plane-app` | `not_deployed`; alignment attempts rolled back |
| #467 | Condition-driven promotion health gate | `control-plane-app` | `not_deployed`; promotion attempt rolled back after identity rejection |
| #468 | Protected release-config assembly and identity gate | `control-plane-app` | `not_deployed`; clean validation and build evidence only |
| #469, #470, #472, #480, #485, #482, #483 | Release-state, infrastructure-access, commercial-model, release-governance, project-intelligence, source-reconciliation, and CI-lane records | `none` | `not_applicable`; source governance only |
| #471, #473, #474, #477 | Credential lifecycle, cumulative accounting, trial-limit, and unresolved-provenance changes | `control-plane-app` | `not_deployed`; reviewed source only |
| #478 | Offline natural-observation validator | `control-plane-app` | `not_deployed`; offline validator source only |
| #481 | Material-handoff preflight fixture stabilization | `none` | `not_applicable`; test-only change |

Source merge, clean validation, and successful artifact workflows do not change
the production pointer. Failed promotion attempts are preserved as execution
evidence and are not reclassified as deployment success.

At this source inventory cutoff, five PRs remain open and are not part of
`master`. Draft PR #476 is the Issue #475 operations-foundation source/schema
candidate. Draft PR #479 is at
`03d744556be6785ac8c97dae2bc4fb79ae9e246f`, is behind `master`, has three
unresolved non-outdated threads, and is not deployed. Its predecessor terminal
receipt `issuecomment-4966594034` remains blocked, the predecessor approval is
consumed, and no durable successor Gate exists. Non-Draft PRs #486, #487, and
#488 are dependency-update candidates. None of these open PRs is merged,
artifact-approved, deployed, or production-approved.

Issue #437 was reopened by the Risk C reconciliation receipt
`issuecomment-4976074286`: PR #482 had been recorded as its closer even though
the PR body explicitly denied resolving the Issue. The blocked predecessor is
not reclassified as successful, and PR #479's four checks from its old head are
not current-`master` integration evidence.

## Source Governance Snapshot

PR #482 merged as `06d69b2da07a50322a260bd08f160febaf7b6a7d` and PR
#483 merged as `2413c101724df45579ebf4b9e0f306d32d9bb1af`. PR #483 added
docs-only/code lane routing and an always-run diff check while retaining one
stable required `Validate` context. The observed repository has 18 remote
branches, five open PRs (Draft #476/#479 and non-Draft #486/#487/#488), and
five open Issues (#437/#438/#439/#440/#475). Current exact-`master`
source/build proof is:

- CI `29381367549`: success.
- Release Artifact `29381367545`: success.
- CodeQL `29381507931`: success.
- Deploy Cloudflare Site `29381367553`: build, verification, and dry-run
  succeeded; deploy was skipped.

Ruleset `18935716` strictly requires `Validate`, requires zero approvals, and
does not require review-thread resolution. Six environments exist; only
`artifact-publication` has a branch policy, and none has reviewer enforcement.
This is the observed machine-enforcement boundary, not independent approval.

GitHub reports 39 open code-scanning alerts (2 critical, 36 high, and 1
medium), 3 open Dependabot alerts (2 high and 1 low), and 0 open
secret-scanning alerts. Successful CodeQL execution neither resolves these
alerts nor proves exploitability.

The ordered next-action queue is:

1. establish a durable successor Gate on #437 for PR #479;
2. complete PR #479 source remediation, current-`master` integration,
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
  The dated production observation remains unchanged: identity sync is degraded
  (`missing=2`, `stale=19`), and `map_apply` has not started. Draft PR #479 is
  blocked at terminal receipt `issuecomment-4966594034`; no durable successor
  Gate exists. Issue #437 was reopened by receipt `issuecomment-4976074286`
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
- GitHub CI run `29381367549`
- GitHub Release Artifact run `29381367545`
- GitHub CodeQL run `29381507931`
- GitHub Deploy Cloudflare Site run `29381367553`
- GitHub deployments `5389897330` and `5403913679`
- Closed GitHub Issue #457 inventory and execution comments
- Closed GitHub Issue #462 inventory, provider-gate, and merge-proof comments
- GitHub Issue #437 deployment, Evidence Runtime, reconciliation, retention,
  rollback, and source-only follow-up evidence through PR #479
- Open GitHub Issue #475 and Draft PR #476 operations-foundation source/schema
  evidence
- Merged GitHub PRs #482 and #483 source-reconciliation and CI-lane evidence
- `docs/RECENT_PR_CAPABILITY_MAP_2026_07_09.md`
- `docs/production-replacement-records/2026-07-09-traffic-usage-xray-idle-observable-backend-deploy-execution.md`
- `docs/production-replacement-records/2026-07-09-japan-traffic-runtime-config-restore-execution.md`
- `docs/production-replacement-records/2026-07-08-sgp-subscription-render-receipt-reconcile-execution.md`
