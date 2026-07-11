# Release Manifest

> Status:
> - Type: Active source-to-production traceability baseline
> - Risk: C
> - Last updated: 2026-07-11, America/Los_Angeles
> - Source inventory baseline: `master` at `e1beacc1`
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
keeps the gate pending until target-runtime evidence exists:

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
target boundary, validation, and rollback information. Production completion is
recorded in the related PR Deploy Note; merge status alone never changes
`production_state`.

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

The first verified `master` proof is GitHub Release Artifact run `29074645989`
for source `4fbe022264e30acd9e487dd880b7d4ed544be259`. Its uploaded ZIP, checksum
sidecar, and `artifact.json` agreed on source, release, file name, SHA-256, size,
and UTC creation time, and the manifest contained no downloaded absolute path.

The latest verified `master` proof at this inventory cutoff is Release Artifact
run `29153679403` for source
`e1beacc15fdc35661077cd3387f3ba17a3966e1a`. It completed the control-plane,
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
baseline `e1beacc1`. The detailed
`docs/RECENT_PR_CAPABILITY_MAP_2026_07_09.md` is a frozen historical snapshot
and is not appended with later PRs.

| PR | Capability | Source commit | Release unit | Release assignment | Production state |
| --- | --- | --- | --- | --- | --- |
| #458 | `phase-2-project-state-reconciliation@v1` | `3013e8f9` | `none` | Source reconciliation; Vercel candidate remained staged | `not_applicable` |
| #459 | `collector-error-provenance@v1` | `72e98096` | `control-plane-app` | Included in `phase2-control-plane-artifact-alignment-20260710-001` | `deployed` |
| #460 | `protected-admin-collector-projection@v1` | `9aa1561e` | `control-plane-app` | Included in `phase2-control-plane-artifact-alignment-20260710-001` | `deployed` |
| #461 | `release-ledger-reconciliation@v1` | `20f8345d` | `none` | Governance reconciliation only | `not_applicable` |
| #463 | `cloudflare-promotion-boundary-reconciliation@v1` | `8c7ad033` | `none` | Provider boundary recorded; Issue #462 closed after proof | `not_applicable` |
| #464 | `traffic-status-producers@v1` | `9bc03b41` | `control-plane-app` | Deployed in `phase2-control-plane-artifact-alignment-20260710-001`; Evidence Runtime activated separately | `deployed` |
| #465 | `runtime-identity-sync-gate@v1` | `2a091d51` | `none` | Governance definition only | `not_applicable` |
| #466 | `tuic-additive-map-repair@v1` | `8c769586` | `control-plane-app` | Promotion attempts rolled back; current production pointer unchanged | `not_deployed` |
| #467 | `control-plane-promotion-health-gate@v1` | `4ae74602` | `control-plane-app` | Promotion attempt rolled back after identity gate rejection | `not_deployed` |
| #468 | `control-plane-release-config-identity-gate@v1` | `e1beacc1` | `control-plane-app` | Clean validation and build proof only; no promotion | `not_deployed` |

The Phase 2 traffic chain begins with #441
`collector-state-contract@v1`; #459 preserves redacted adapter provenance,
#460 exposes the protected read model, and #464 adds protected status producers.
Those capabilities are present in the documented production control-plane
release at source `9bc03b41`. PRs #466 through #468 remain source-only; failed
promotion attempts were rolled back and did not change the current pointer.

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
