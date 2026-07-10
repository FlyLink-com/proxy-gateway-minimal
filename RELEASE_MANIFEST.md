# Release Manifest

> Status:
> - Type: Active source-to-production traceability baseline
> - Risk: C
> - Last updated: 2026-07-09, America/Los_Angeles
> - Source inventory baseline: `master` at `4fbe0222`
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

## Minimum Metadata

A PR declares:

```yaml
capability: <stable capability label>
release_unit: <fixed value or none>
production_state: not_deployed
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

## Artifact Manifest v1

The two existing control-plane ZIP workflows generate and upload
`artifact.json` beside the ZIP and checksum. The manifest contains only the
portable artifact identity:

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
artifact base name rather than a local or host path. Automated workflow
integration is intentionally limited to `control-plane-app` in v1. Generating
this file does not deploy or promote the artifact and does not change runtime
state.

The first verified `master` proof is GitHub Release Artifact run `29074645989`
for source `4fbe022264e30acd9e487dd880b7d4ed544be259`. Its uploaded ZIP, checksum
sidecar, and `artifact.json` agreed on source, release, file name, SHA-256, size,
and UTC creation time, and the manifest contained no downloaded absolute path.

## Current PR Mapping

This is the compact release view of the detailed capability inventory in
`docs/RECENT_PR_CAPABILITY_MAP_2026_07_09.md`.

| PR | Capability | Source commit | Release unit | Release assignment | Production state |
| --- | --- | --- | --- | --- | --- |
| #441 | `collector-state-contract@v1` | `9d48592c` | `control-plane-app` | Unassigned | `not_deployed` |
| #436 | `phase-2-foundation-baseline@v1` | `2ac196b7` | None | None | `not_applicable` |
| #435 | `local-proxy-control-boundary@v1` | `53eb5a10` | `control-plane-app` | Unassigned | `not_deployed` |
| #434 | `aliyun-runtime-default-retirement@v1` | `7d70292e` | `control-plane-app` | Unassigned | `not_deployed` |
| #433 | `aliyun-gate-api-retirement@v1` | `1935a806` | `control-plane-app`, `admin-static` | Unassigned; promote units separately | `not_deployed` |
| #432 | `portal-preview-isolation@v1` | `a7e25425` | Unresolved: `admin-static` or `portal-static` | Promotion blocked pending artifact ownership | `not_deployed` |
| #427 | `foundation-freeze-and-archive-boundary@v1` | `790f20a6` | None | None | `not_applicable` |
| #426 | `company-site-mobile-experience@v1` | `e853076d` | `company-site-static` | Historical deployment only; release lineage unresolved | `deployed_unreconciled` |
| #425 | `subscription-refresh-abuse-controls@v1` | `5d23e1ab` | `control-plane-app` | Unassigned | `not_deployed` |
| #424 | `production-deployment-evidence-index@v1` | `b2ce22d8` | None; evidence references earlier units | Evidence carrier, not a release | `not_applicable` |

No new release is declared `ready` or `deployed` by this manifest. In
particular, #426 is mapped to `company-site-static`, but its historical artifact
cannot be proven reproducible from the merge commit and therefore remains
`deployed_unreconciled` until a clean promotion replaces or reconciles it.

## Fixed Rules

1. Every implementation PR declares one capability and its release unit, or
   explicitly declares `none`.
2. A merged but unpromoted capability remains `production_state: not_deployed`.
3. Production completion requires a Deploy Note linked to an immutable artifact
   or configuration identity.
4. A PR cannot deploy a release unit outside its declared boundary.
5. Deployment and runtime claims require current target validation; neither a
   PR merge nor a preview deployment is sufficient evidence.

## References

- `docs/RECENT_PR_CAPABILITY_MAP_2026_07_09.md`
- `docs/FOUNDATION_FREEZE_2026_07_09.md`
- `docs/MASTER_ARCHIVE_BOUNDARY.md`
- `docs/production-replacement-records/`
