# Release Manifest

> Status:
> - Type: Active source-to-production traceability baseline
> - Risk: C
> - Last updated: 2026-07-10, America/Los_Angeles
> - Source inventory baseline: `master` at `9aa1561e`
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
custom production-domain assignment disabled. Real merges #458, #459, and #460
created production-target candidates without moving the public custom aliases.

The latest observed candidate is READY as Vercel deployment
`dpl_33AwpEF5kp2fnxSSgP4C8AhR8TNd`, GitHub deployment `5392032753`, for source
`9aa1561eea8ce77cd1cf670369d5bd42c2331ba2`. It has
`production_environment=false` and did not receive `gccwebos.com` or
`www.gccwebos.com`. Both public aliases remained on GitHub deployment
`5389897330`, sourced from `7e9a8667657e5323e09ff7c262da85d26729e69b`.
Promotion or rollback remains a separate exact Risk A gate.

The Cloudflare public-site workflow also keeps repository auto-deploy disabled.
Build/verification evidence from that workflow is not deployment evidence.

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
run `29095756923` for source
`9aa1561eea8ce77cd1cf670369d5bd42c2331ba2`. It completed the control-plane,
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
baseline `9aa1561e`. The detailed
`docs/RECENT_PR_CAPABILITY_MAP_2026_07_09.md` is a frozen historical snapshot
and is not appended with later PRs.

| PR | Capability | Source commit | Release unit | Release assignment | Production state |
| --- | --- | --- | --- | --- | --- |
| #445 | `artifact-manifest-generation@v1` | `4fbe0222` | `none` | Governance/tooling only | `not_applicable` |
| #446 | `version-management-baseline-v2@v1` | `b1bec5b0` | `none` | Governance baseline only | `not_applicable` |
| #448 | `portal-static-artifact-generation@v1` | `4b5bc143` | `portal-static` | Artifact built; no promotion | `not_deployed` |
| #450 | `artifact-upload-action-v7@v1` | `255a0822` | `none` | CI maintenance only | `not_applicable` |
| #452 | `admin-static-artifact-generation@v1` | `18807285` | `admin-static` | Artifact built; no promotion | `not_deployed` |
| #454 | `artifact-coverage-reconciliation@v1` | `65f8515e` | `none` | Governance reconciliation only | `not_applicable` |
| #456 | `runtime-config-identity-generation@v1` | `7e9a8667` | `none` | Offline observation tooling only | `not_applicable` |
| #458 | `phase-2-project-state-reconciliation@v1` | `3013e8f9` | `none` | Source reconciliation; Vercel candidate remained staged | `not_deployed` |
| #459 | `collector-error-provenance@v1` | `72e98096` | `control-plane-app` | Unassigned | `not_deployed` |
| #460 | `protected-admin-collector-projection@v1` | `9aa1561e` | `control-plane-app` | Unassigned | `not_deployed` |

The Phase 2 traffic chain begins with #441
`collector-state-contract@v1`; #459 preserves redacted adapter provenance and
#460 exposes the protected read model. All three remain source-only until an
exact `control-plane-app` deployment record proves otherwise.

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

## References

- `docs/RECENT_PR_CAPABILITY_MAP_2026_07_09.md`
- `docs/FOUNDATION_FREEZE_2026_07_09.md`
- `docs/MASTER_ARCHIVE_BOUNDARY.md`
- `docs/production-replacement-records/`
