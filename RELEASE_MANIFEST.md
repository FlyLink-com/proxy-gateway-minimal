# Release Manifest

```yaml
document_metadata:
  doc_type: canonical
  lifecycle: active
  authority_scope: release_traceability
  superseded_by: null
  last_verified_at: 2026-10-09
  production_authority: false
```

> Status:
> - Type: Active source-to-production traceability baseline
> - Risk: C
> - Last updated: 2026-10-09 UTC
> - Source reconciliation cutoff: `master@521bb535d0d385d533734b020cf96a533f6ed729`
> - Latest read deployment records describe BWH business source #752,
>   standalone collector #759 and rendering composition #760/#761, plus
>   current-domain ingress/DNS cutover; they are not a whole-master deployment
> - Dated source/check/task/deployment evidence and remaining unknowns:
>   [2026-10-09 reconciliation](docs/CURRENT_RELEASE_STATE.md#source-and-deployment-reconciliation-2026-10-09)
> - No live runtime or provider readback was performed by this docs change
> - Production authority: None. This file does not deploy, promote, roll back,
>   mutate runtime state, or replace live inventory and validation.

## Model

The repository uses one reviewed source branch and explicit promotion records:

```text
Source -> Artifact -> Release -> Deployment -> Runtime State
```

| Layer | Answers | Evidence |
| --- | --- | --- |
| Source | What capability was reviewed? | PR and exact `master` commit |
| Artifact | What immutable output was built? | Artifact name and SHA-256 |
| Release | What is approved to move together? | Release ID, included PRs, capabilities, and release units |
| Deployment | What was promoted, where, and when? | Deploy Note, target, backup, validation, and rollback |
| Runtime State | What is actually serving now? | Read-only live inventory and runtime validation |

`master` is the trusted source baseline. It is not a production-version claim.

## Four Release Gates

The source-to-runtime model is orchestrated through four separate gates:

| Gate | Required evidence | Risk and authority boundary |
| --- | --- | --- |
| Source Gate | Source intent, allowed files, focused/full validation, and diff checks for the exact source head. | Normally Risk B for server/shared source; Risk C remains available for docs-only changes. |
| Merge Gate | Exact reviewed head, reviews, required checks, Ready transition, and merge. | Integrates reviewed source only; it does not publish a release or authorize production. |
| Artifact Gate | Exact `master` commit, immutable artifact identity, SHA-256, manifest, and verified retrievability. | Establishes build/release evidence only. |
| Production Gate | Fresh live inventory, exact operator approval, exact target and mutation boundary, backup, validation, aggregate identity evidence when applicable, and rollback-ready evidence. | Always Risk A. |

This is an `A envelope / B source core` model. A server/shared source-only PR
normally remains Risk B even when the eventual release path includes a Risk A
Production Gate. `identity_impact: true` records downstream impact and the need
for Identity Gate evidence; it does not by itself elevate that source-only PR
to Risk A. Runtime or provider mutation, deployment, promotion, and rollback
remain separately gated Risk A actions.

Each gate closes independently. Passing a Source, Merge, or Artifact Gate does
not authorize the next gate or establish current runtime state. These rules are
prospective: historical approvals, execution receipts, failures, rollbacks,
and outcomes remain as originally recorded and are never rewritten or
retroactively reclassified.

## Gate Approval And Ownership

Before requesting execution approval, the controller verifies transport and
tool availability plus repository and exact-head readability. A transport
failure before approval is a setup failure, not a business remediation result.
Durable approval is bound to the stated head, scope, target, and mutation
boundary; once execution begins, that approval is consumed and never reused.

Any head, scope, test, identity, or mutation-boundary failure stops the active
gate. A corrected attempt requires a new gate and, when execution approval is
required, a new approval. One controller owns final validation and GitHub
integration. Implementers run scoped implementation validation only, and
semantic reviewers are read-only unless separately authorized.

Issue comments and approval text are durable evidence, not platform
enforcement. Branch/ruleset or deployment-environment protection may be
claimed only after live readback. Any workflow capable of real production
deployment must remain disabled or require independently enforced approval.

## Recorded Control-Plane Deployment (2026-08-26)

The deployment record reviewed at the historical 2026-08-26 cutoff is the
[PR #667 Deploy Note](https://github.com/gccwebos-com/proxy-gateway-minimal/pull/667#issuecomment-5426440067):

- deployed at `2026-08-26T13:53:47.576Z`;
- source `b5ca23db58c55f2d73ec59ffa9525f85b92a8a9c`;
- release `control-plane-b5ca23db-a3-sync-20260825`;
- target `vultr-japan-control`.

That Deploy Note records exact source/dependency packet verification, protected
overlay, bounded materialization, restricted service-native smoke, SQLite
snapshot/custody, atomic pointer exchange, one candidate start, PID/CWD binding,
health validation and terminal readback. No database restore, schema mutation,
feature activation, runtime-identity change or old-release deletion occurred.
The terminal receipt recorded the prior immutable release as retained for a
separately authorized code-pointer rollback. This reconciliation grants no new
production authority and performed no fresh runtime readback.

## Deployment Promotion Boundary

These provider facts reproduce the last observations linked from Issues #457
and #462; neither provider was re-read during the 2026-08-28 C-tier
reconciliation.

Closed Issue #457 records the proven company-site promotion boundary. At that
receipt cutoff, the linked Vercel project recorded `master` as its Production
Branch and automatic custom production-domain assignment as disabled. Real
merges through #468 created production-target candidates without moving the
public custom aliases.

Issue #457 recorded its latest observed candidate as READY at
`proxy-gateway-minimal-l4wfa6q0h-gccltd.vercel.app`, GitHub deployment
`5403913679`, for source
`e1beacc15fdc35661077cd3387f3ba17a3966e1a`. It has
`production_environment=false` and did not receive `gccwebos.com` or
`www.gccwebos.com`. That receipt recorded both public aliases on deployment
`proxy-gateway-minimal-hqdudl13g-gccltd.vercel.app`, GitHub deployment
`5389897330`, sourced from `7e9a8667657e5323e09ff7c262da85d26729e69b`.
Promotion or rollback remains a separate exact Risk A gate.

At the recorded cutoff, the repository Cloudflare workflow had auto-deploy
disabled and performed a Wrangler dry run. A separate native Workers Builds production trigger was found
to auto-promote every `master` commit. The #461 merge created active deployment
`540da82f-b04d-4d67-9c8d-c5542d55e8a5`, version
`e5a648c9-d3c4-47b7-afb9-4bbed8f1be70` at 100%, on a workers.dev-only surface
with no custom domains.

The approved Issue #462 gate changed only that trigger's deploy command from
`npx wrangler deploy` to `npx wrangler versions upload`. The setting change
created no build, version, or deployment, and the #463 merge then proved that a
reviewed `master` merge saved a version without promoting it. Issue #462 is
closed. The #468 merge created saved candidate version
`407eb863-0e82-4e73-af54-3a44722b07c9` in build
`f186b7d5-533c-4f5b-b056-27777243d93f`; the active deployment identity was not
independently re-read during this C-tier reconciliation. Promotion remains a
separate exact Risk A action.

## Release Units

Use only these values:

| Release unit | Boundary |
| --- | --- |
| `control-plane-app` | Control-plane Node application; exact target is bound by its Deploy Note |
| `company-site-static` | Public GCC WebOS company website |
| `portal-static` | Customer User Portal |
| `admin-static` | Protected Admin console |
| `japan-runtime-config` | Japan Xray, Mihomo, and related runtime configuration |
| `sgp-runtime-config` | Singapore data-plane runtime configuration |
| `subscription-rendering` | Subscription generation and delivery boundary |
| `attribution-appsflyer` | Separately gated attribution experiment and adapter |

Static frontend PRs also declare `frontend_surface` as `company-site`,
`portal`, or `admin`. A release may include multiple units, but each unit must
have its own artifact or explicit configuration identity and promotion result.

### Identity Impact Is Not A Release Unit

Runtime identity is an impact dimension across existing release units, not an
independently deployable unit. Do not add `runtime-identity` to the fixed list.
Changes that can alter Xray or Mihomo principals, protected usage maps,
material-to-runtime bindings, or collector identity resolution declare
`identity_impact: true` and use the Identity Gate in
`docs/IDENTITY_LIFECYCLE.md`.

The production gate belongs to the target runtime release unit, normally
`japan-runtime-config` or `sgp-runtime-config`. A control-plane or rendering PR
that can later change runtime principals declares the impact in source, while
the actual aggregate before/after evidence is recorded by the separately
approved runtime deployment or Change Record.

## Minimum Metadata

A PR declares:

```yaml
capability: <stable capability label>
release_unit: <fixed value or none>
production_state: not_deployed
identity_impact: false
```

When `identity_impact` is true, the PR also declares a safe logical surface and
keeps the downstream runtime Identity Gate pending until target-runtime
evidence exists. That pending downstream gate does not by itself change a
source-only PR's risk:

```yaml
identity_gate:
  surface: <safe logical surface>
  state: pending
```

A release declaration adds:

```yaml
release: release-YYYY-MM-DD-<scope>
status: planned | ready | deployed | rolled_back | superseded
source_commit: <full master commit>
included_prs: []
capabilities: []
release_units: []
artifacts: [] # each entry includes identity and sha256
deploy_notes: []
```

No release becomes `ready` without exact source, artifact identity, SHA-256,
target boundary, validation, rollback information, and proof that the exact
artifact remains retrievable throughout the deployment and rollback window.
Retrievability must come from a durable store or an explicitly verified target
backup. Production completion is recorded in the related PR Deploy Note; merge
status alone never changes `production_state`.

An identity-impacting Deploy Note or runtime Change Record additionally records
aggregate `before` and `after` values for `runtime_count`, `mapped_count`,
`missing`, `stale`, `changed`, and `missing_material`, plus
`retention_state` and the final gate `state`. It never records raw identifiers,
credential references, controller payloads, config, environment values, or
database rows. Identity health is `verified` only when all four difference
counts are zero.

## Artifact Manifest v1

The control-plane ZIP workflows and the independent Portal and Admin static
artifact jobs generate and upload `artifact.json` beside each ZIP and checksum.
The manifest contains only the portable artifact identity:

```json
{
  "schemaVersion": "1",
  "releaseUnit": "control-plane-app",
  "sourceCommit": "<full-git-commit>",
  "release": "<release-label>",
  "artifact": {
    "fileName": "<artifact-file-name>",
    "sha256": "<sha256>",
    "sizeBytes": 0,
    "createdAt": "<iso-8601-timestamp>"
  }
}
```

`scripts/create-artifact-manifest.mjs` recognizes the eight fixed release
units, rejects non-portable source/release metadata, and records only the
artifact base name rather than a local or host path. At the 2026-08-26 source
cutoff, automated artifact identity covered
`control-plane-app`, `portal-static`, and `admin-static`; the production
dry-run workflow was limited to `control-plane-app`. The static jobs built and
verified `admin/dist-portal` or `admin/dist` before packaging them, but did
not deploy or promote either artifact. Generating this file does not change
runtime state.

At that cutoff, `admin-static` identified the default Admin entrypoint without
asserting physical source isolation. That entrypoint bundled shared Portal and
company-site routes; any current source boundary must be read from Git.

Short-lived GitHub Actions artifacts are build evidence only. They do not by
themselves satisfy the Artifact Gate's deployment-and-rollback-window
retrievability requirement and cannot make a release `ready`. This manifest
does not claim that any currently listed build artifact has durable retention;
that must be verified for the exact release through a durable store or an
explicitly verified target backup.

The first verified `master` proof is GitHub Release Artifact run `29074645989`
for source `4fbe022264e30acd9e487dd880b7d4ed544be259`. Its uploaded ZIP, checksum
sidecar, and `artifact.json` agreed on source, release, file name, SHA-256, size,
and UTC creation time, and the manifest contained no downloaded absolute path.

The latest verified release-artifact proof recorded at the 2026-08-26
inventory cutoff is Release Artifact run `32854893859` for source
`b5ca23db58c55f2d73ec59ffa9525f85b92a8a9c`. Its control-plane artifact is
`proxy-gateway-b5ca23db58c5` (ID `9565756416`, originally observed expiry
`2026-09-08T13:42:13Z`; 2026-09-14 API readback `expired: true`); the inner ZIP is 7,563,583 bytes with SHA-256
`20bf7d56c63e5038497d1c12c53507267f4468516e2e23fe4732710658acb76d`.
The same workflow also completed the Portal and Admin artifact jobs, but
neither static release unit was promoted by the A3 event.

Control Plane Dependency Artifact run `32854893837` also succeeded for the
same exact source. Artifact ID `9565754679`, named
`control-plane-dependency-b5ca23db58c55f2d73ec59ffa9525f85b92a8a9c`, is
`6460709` bytes and was originally observed to expire at
`2026-09-08T13:42:10Z`; a 2026-09-14 API readback recorded `expired: true`.
Its inner `node-modules.tar` is 26,664,960 bytes with SHA-256
`c87e70c8fbae033eb357b103ac2da554b99f6af4a50d02294fe1e615c3c7de5b`.
Production Deploy Dry Run `32856999391` succeeded for the same commit. These
GitHub identities remain short-lived build evidence; the production deployment
is established by the separate PR #667 execution receipt.

### A3 Dependency Materialization Boundary

Issue #636 and PRs #646-#667 add the source contracts, physical collector,
diagnostics integrity, exact-head XFS project-quota proof, and restricted
service-native smoke proof needed by the A3 dependency materializer. The quota
segment passed on a disposable non-production XFS filesystem at PR #654's exact
head, including project-tree inheritance, quota accounting/enforcement, bounded
byte/inode exhaustion, diagnostics verification, and cleanup/readback.

The service-native segment separately passed on the non-production physical
host at PR #656's exact head. It verified the fixed non-root principal, native
module and snapshot-import workload, cgroup v2 boundary, terminal/unit
readback, diagnostics integrity, and cleanup. These proofs complete the A3-1
physical evidence boundary, not the Artifact or Production Gate.

Merged PR #658 adds an unforgeable fixed-root XFS production runtime only for the
complete CLI tuple `--enable-a3-materializer --a3-run-label <label>
--a3-project-id <id>`. Default and partial invocations remain fail-closed with
`worker_storage_limit_unavailable`. Production dry-run `32628957935` validated
the exact-master packet without host access. The separately approved A3-2
read-only inventory then observed the PR #622 live release, healthy service/CWD
binding, clean candidate namespace, cgroup v2, capacity and SQLite integrity,
but found the fixed deployment root on `ext4` with no XFS project-quota mount,
accounting, enforcement, report, or project ID. That XFS-only attempt remains a
historical A3-2 `NO-GO`; no upload, quota change, materialization, deployment,
pointer transition, service change, feature activation, or runtime health
window occurred.

Merged PR #662 adds a separate bounded admission runtime for the observed ext4
topology. It remains default-off and requires the complete tuple
`--enable-bounded-artifact-admission --bounded-run-label <label>`. The XFS
route remains available. The bounded path binds exact artifact budget and
filesystem topology checks, retains the restricted service-native smoke and
fail-closed boundaries, and writes schema-4 receipts. Exact-master CI run
`32645695594`, CodeQL run `32645695630`, Dependency Artifact run `32645695541`,
and Release Artifact run `32645695598` succeeded. That was the bounded-path
source baseline; it did not itself authorize production.

PRs #663-#667 then completed bounded artifact admission reconciliation,
production staging/controller hardening, clean-Linux validation, prepublish
smoke metadata, and synchronization of the production-validated smoke repairs.
For exact `master@b5ca23db58c55f2d73ec59ffa9525f85b92a8a9c`, Release Artifact run
`32854893859`, Dependency Artifact run `32854893837`, and Production Deploy Dry
Run `32856999391` succeeded. Candidate preparation verified the staged packet,
protected overlay, bounded dependency materialization and service-native smoke.

The separately approved promotion run
`a3b-b5ca23db-promote-20260826-09` ended `promoted_verified` at
`2026-08-26T13:53:47.576Z`. The release pointer and process CWD matched
`control-plane-b5ca23db-a3-sync-20260825`; the service was active/running with
restart count zero, the candidate start count was one and rollback start count
was zero. Snapshot/custody and terminal readback passed. A later public-only
availability window returned three HTTP 200 responses without redirects. No
database restore, schema mutation, feature activation, runtime-identity change
or old-release deletion occurred. This closes A3 for the deployed
`control-plane-app` dependency-materialization/promotion outcome; it does not
activate other source capabilities or release units.

## Runtime Config Identity v1

Runtime Config Identity is an observation artifact, not an application build,
deployment event, promotion record, or service-health report. The v1 contract is
defined by `schemas/runtime-config-identity-v1.schema.json` and contains only:

```json
{
  "schemaVersion": "1",
  "releaseUnit": "japan-runtime-config",
  "observedAt": "<explicit-utc-timestamp>",
  "components": [
    {
      "name": "xray-config",
      "sha256": "<sha256>"
    }
  ]
}
```

`scripts/generate-runtime-identity.mjs` accepts only
`japan-runtime-config` or `sgp-runtime-config`, requires an explicit
`observedAt`, rejects duplicate or non-portable logical component names, hashes
the exact local input bytes, and sorts components by name. The generated JSON
does not contain input paths, raw config, environment values, logs, process or
service state, secrets, or deployment state. CLI success and failure summaries
also omit paths and input content.

The generator is offline-only. It does not read environment variables, connect
to a host or cloud API, deploy, restart services, or reconcile production.
Synthetic fixtures are test inputs only. Generated `runtime-identities/` output
is ignored and must not be committed as current production evidence. A real
Japan or SGP observation remains a separate Risk A read-only action with its own
approval and execution evidence.

## Historical PR Mapping (2026-07-15)

This table is retained as a dated July source-governance snapshot at baseline
`5b61d9d7`; it is not the current merge queue or release assignment. The detailed
`docs/RECENT_PR_CAPABILITY_MAP_2026_07_09.md` is a frozen historical snapshot
and is not appended with later PRs.

| PR | Declared capability | Source commit | Release unit | Release assignment | Production state |
| --- | --- | --- | --- | --- | --- |
| #482 | `not_declared` | `06d69b2d` | `none` | Current source-governance reconciliation only | `not_applicable` |
| #483 | `not_declared` | `2413c101` | `none` | CI lane routing and always-run diff checking only | `not_applicable` |
| #489 | `not_declared` | `f054ac44` | `none` | Governance-state reconciliation only | `not_applicable` |
| #486 | `not_declared` | `fdf5eede` | `admin-static` | Admin dependency remediation; no production promotion | `not_deployed` |
| #487 | `not_declared` | `20954248` | `admin-static` | Admin dependency remediation; no production promotion | `not_deployed` |
| #488 | `not_declared` | `1d02b0ad` | `admin-static` | Admin dependency remediation; no production promotion | `not_deployed` |
| #490 | `not_declared` | `a764f48f` | `control-plane-app` | Security input-boundary source change; no production promotion | `not_deployed` |
| #491 | `not_declared` | `329eb282` | `control-plane-app` | Admin-auth abuse-control source change; no production promotion | `not_deployed` |
| #492 | `not_declared` | `0601e79e` | `none` | Project-topology documentation reconciliation only | `not_applicable` |
| #494 | `not_declared` | `5b61d9d7` | `none` | Canonical authority metadata normalization only | `not_applicable` |

The Phase 2 traffic chain begins with #441
`collector-state-contract@v1`; #459 preserves redacted adapter provenance,
#460 exposes the protected read model, and #464 adds protected status producers.
Those capabilities are present in the documented production control-plane
release at source `9bc03b41`. Later control-plane changes in #466 through #468,
#471, #473, #474, and #477 remain source-only; #478 is offline validation and
#481 is test-only. PRs #486-#488 are Admin dependency remediations, PRs #490
and #491 are control-plane source changes, and PRs #489/#492/#494 are
governance or docs-only. None changes the dated production pointer.

Open source candidates are outside this merged mapping. At this inventory
cutoff, two Draft PRs are open and no non-Draft PR is open. Draft PR #476 is the
Issue #475 operations-foundation source/schema candidate, has merge conflicts,
and is not deployed. Draft PR #479 is at
`58ccdccc6af5ed120541f03d2713857e4a9a8a65`, is behind `master`, has zero
unresolved non-outdated review threads, and is not deployed. Gate
`pr479-forward-pending-rollback-obligation-remediation-20260715-003` was
approved by `issuecomment-4979572712` and terminated blocked at `fresh_binding`
by `issuecomment-4979585832` because of
`worktree_submodule_guard_null_wrapper_failure`. The approval is consumed and
nonreusable, no later durable Gate exists, and neither open PR is
artifact-approved, deployed, or production-approved.

Issue #437 was reopened through the Risk C receipt
`issuecomment-4976074286` because PR #482 had been recorded as its closer even
though the PR body explicitly denied resolution. The blocked predecessor is
not rewritten as successful, and the four checks from PR #479's old head are
not current-`master` integration evidence.

PRs #476 and #479 are no longer open. Their status and Gate narrative above are
historical evidence only and must not be used to sequence current work.

## Source Reconciliation Boundary (2026-09-14)

The Git source cutoff observed on 2026-09-14 is
`master@3565c54865676ba127b115f7f914a0359e545bf0`. The latest recorded
control-plane deployment event used source
`b5ca23db58c55f2d73ec59ffa9525f85b92a8a9c` in the 2026-08-26 PR #667 Deploy
Note. These identities are intentionally distinct: current `master` is 164
commits ahead of that deployment source, and the deployed-source GitHub
Actions packets are expired. This document performed no fresh runtime
readback.

The 2026-09-14 GitHub inventory in `docs/CURRENT_RELEASE_STATE.md` recorded
1 open Draft PR, 16 open Issues, and 72 remote heads. The 2026-09-12, 2026-08-23,
and 2026-08-28 count sentences remain historical. Current sequencing must still
be resolved from native live Issues and PRs, using Project #1 only as
navigation; dated `project-state/*.json` records do not replace that live
read.

The capability record for deployed source
`b5ca23db58c55f2d73ec59ffa9525f85b92a8a9c` includes Admin/Operations read
foundations, Wallet and immutable Coin Ledger, durable Recharge/Payment, Coins
Commerce, Account Resource Authority, traffic usage projections, and
trusted-proxy attribution. These span previously enabled legacy surfaces and
newer source/test/migration/default-off extensions. Their exact consumer and gap
boundaries are maintained in `docs/OPERATIONS_PLANE_SOURCE_REALITY.md`. The
recorded deployed control-plane release contains that deployed source.
Promotion-09 neither enabled nor revalidated the legacy surfaces, and it did
not apply the wallet-first schemas, activate the
wallet-first/deferred/Authority extensions, or prove new provider/runtime
readiness.

Release Artifact run `32854893859` successfully built the control-plane,
Portal, and Admin units for deployed source
`b5ca23db58c55f2d73ec59ffa9525f85b92a8a9c`. Dependency Artifact run
`32854893837` produced the corresponding Linux dependency artifact. Those
exact control-plane and dependency packets were used by the recorded A3
deployment; the GitHub copies remain short-lived and do not close Issue #597's
durable retention requirement.

The 2026-08-22 readback observed zero open Dependabot alerts, secret scanning
disabled, and no available code-scanning alert inventory because Code Security
is not enabled. The workflow inventory found 40 Action `uses:` references: 13
full-SHA pinned and 27 using mutable tags. Rulesets, environment protection,
and provider settings were not refreshed. The 2026-08-26 A3 execution refreshed
only the bounded Japan `control-plane-app` release, materialization, snapshot,
service and health boundaries recorded above. Issues #597 and #598 retain the
durable release and supply-chain closure.

At this historical 2026-09-14 cutoff, the linked control-plane deployment
was `control-plane-b5ca23db-a3-sync-20260825`. Later Japan and BWH records are
indexed in `docs/CURRENT_RELEASE_STATE.md`; this history is not the current
production identity. A source-only PR may say that
deployment is not applicable; that statement is not a Deploy Note and must not
be backfilled as production evidence.

## Rollback Strategy Rule

- Source-only capability: revert the exact merge commit through a reviewed PR.
- Governance or offline tooling with release unit `none`: no production
  rollback applies.
- Deployed release unit: restore the exact previous artifact or release identity
  under a separately approved gate and validate the target boundary.

## Fixed Rules

1. Every implementation PR declares one capability and its release unit, or
   explicitly declares `none`.
2. A merged but unpromoted capability remains `production_state: not_deployed`.
3. Production completion requires a Deploy Note linked to an immutable artifact
   or configuration identity.
4. A PR cannot deploy a release unit outside its declared boundary.
5. Deployment and runtime claims require current target validation; neither a
   PR merge nor a preview deployment is sufficient evidence.
6. Identity-impacting runtime changes remain `pending`, `degraded`, or
   `blocked` until the aggregate Identity Gate is complete; runtime health does
   not imply identity synchronization or accounting completeness.

## References

- `docs/RECENT_PR_CAPABILITY_MAP_2026_07_09.md`
- `docs/FOUNDATION_FREEZE_2026_07_09.md`
- `docs/IDENTITY_LIFECYCLE.md`
- `docs/MASTER_ARCHIVE_BOUNDARY.md`
- `docs/production-replacement-records/`
