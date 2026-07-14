# Release Manifest

> Status:
> - Type: Active source-to-production traceability baseline
> - Risk: C
> - Last updated: 2026-07-14, America/Los_Angeles
> - Source inventory baseline: `master` at `ab8b0ec2`
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

## Deployment Promotion Boundary

Closed Issue #457 records the proven company-site promotion boundary. The
linked Vercel project keeps `master` as its Production Branch and has automatic
custom production-domain assignment disabled. Real merges through #468 created
production-target candidates without moving the public custom aliases.

The latest observed candidate is READY at
`proxy-gateway-minimal-l4wfa6q0h-gccltd.vercel.app`, GitHub deployment
`5403913679`, for source
`e1beacc15fdc35661077cd3387f3ba17a3966e1a`. It has
`production_environment=false` and did not receive `gccwebos.com` or
`www.gccwebos.com`. Both public aliases remain on deployment
`proxy-gateway-minimal-hqdudl13g-gccltd.vercel.app`, GitHub deployment
`5389897330`, sourced from `7e9a8667657e5323e09ff7c262da85d26729e69b`.
Promotion or rollback remains a separate exact Risk A gate.

The repository Cloudflare workflow keeps auto-deploy disabled and performs a
Wrangler dry run. A separate native Workers Builds production trigger was found
to auto-promote every `master` commit. The #461 merge created active deployment
`540da82f-b04d-4d67-9c8d-c5542d55e8a5`, version
`e5a648c9-d3c4-47b7-afb9-4bbed8f1be70` at 100%, on a workers.dev-only surface
with no custom domains.

The approved Issue #462 gate changed only that trigger's deploy command from
`npx wrangler deploy` to `npx wrangler versions upload`. The setting change
created no build, version, or deployment, and the #463 merge then proved that a
reviewed `master` merge saves a version without promoting it. Issue #462 is
closed. The #468 merge created saved candidate version
`407eb863-0e82-4e73-af54-3a44722b07c9` in build
`f186b7d5-533c-4f5b-b056-27777243d93f`; the active deployment identity was not
independently re-read during this C-tier reconciliation. Promotion remains a
separate exact Risk A action.

## Release Units

Use only these values:

| Release unit | Boundary |
| --- | --- |
| `control-plane-app` | Japan control-plane Node application |
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
artifact base name rather than a local or host path. Automated artifact
identity now covers `control-plane-app`, `portal-static`, and `admin-static`;
the production dry-run workflow remains limited to `control-plane-app`. The
static jobs build and verify `admin/dist-portal` or `admin/dist` before
packaging them, but do not deploy or promote either artifact. Generating this
file does not change runtime state.

`admin-static` identifies the default Admin entrypoint as it is built today; it
does not assert physical source isolation. That entrypoint still bundles shared
Portal and company-site routes until a separate boundary-cleanup task removes
them.

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

The latest verified `master` proof at this inventory cutoff is Release Artifact
run `29328012651` for source
`ab8b0ec2034cc92a84bcea738c0a254afbd60213`. It completed the control-plane,
Portal, and Admin artifact jobs. This is build evidence, not production
promotion evidence.

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

## Current PR Mapping

This is the current compact view of the ten most recently merged PRs at source
baseline `ab8b0ec2`. The detailed
`docs/RECENT_PR_CAPABILITY_MAP_2026_07_09.md` is a frozen historical snapshot
and is not appended with later PRs.

| PR | Declared capability | Source commit | Release unit | Release assignment | Production state |
| --- | --- | --- | --- | --- | --- |
| #469 | `phase-2-release-state-reconciliation@v1` | `73eb6cea` | `none` | Source-state reconciliation only | `not_applicable` |
| #470 | `infrastructure-access-rule-v1` | `b4abd6ee` | `none` | Governance boundary only | `not_applicable` |
| #472 | `not_declared` | `b801ec1a` | `none` | Provider-neutral Commercial Model v1 docs only | `not_applicable` |
| #471 | `not_declared` | `23e86358` | `control-plane-app` | Credential lifecycle source only; no production promotion | `not_deployed` |
| #473 | `not_declared` | `f3d62754` | `control-plane-app` | Cumulative accounting source only; no production promotion | `not_deployed` |
| #474 | `trial-traffic-limit@v1` | `52741c3f` | `control-plane-app` | Reviewed source only; no production promotion | `not_deployed` |
| #477 | `traffic-accounting-unresolved-provenance` | `d6775077` | `control-plane-app` | Reviewed source only; production remains unchanged | `not_deployed` |
| #478 | `traffic-accounting-natural-observation-validator@v1` | `70ec822c` | `control-plane-app` | Offline validator source only; no production promotion | `not_deployed` |
| #481 | `not_declared` | `2df971a4` | `none` | Test-only fixture stabilization | `not_applicable` |
| #480 | `release-governance-calibration@v1` | `ab8b0ec2` | `none` | Governance calibration only | `not_applicable` |

The Phase 2 traffic chain begins with #441
`collector-state-contract@v1`; #459 preserves redacted adapter provenance,
#460 exposes the protected read model, and #464 adds protected status producers.
Those capabilities are present in the documented production control-plane
release at source `9bc03b41`. Later control-plane changes in #466 through #468,
#471, #473, #474, and #477 remain source-only; #478 is offline validation and
#481 is test-only. None changes the dated production pointer.

Open source candidates are outside this merged mapping. Draft PR #476 is the
Issue #475 operations-foundation source/schema candidate and is not deployed.
Draft PR #479 is not deployed, its identity gate is pending, and terminal
receipt `issuecomment-4966594034` is blocked with the prior approval consumed.
Any successor execution requires a new exact gate. Neither Draft is `ready`,
merged, artifact-approved, or production-approved.

No new release is declared `ready` or `deployed` by this manifest. A source-only
PR may say that deployment is not applicable; that statement is not a Deploy
Note and must not be backfilled as production evidence.

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
