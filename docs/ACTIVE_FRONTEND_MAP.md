# Active Frontend Resource Map

Last verified: 2026-08-28, America/Los_Angeles.

```yaml
document_metadata:
  doc_type: canonical
  lifecycle: active
  authority_scope: frontend_resource_classification
  superseded_by: null
  last_verified_at: 2026-08-28
  production_authority: false
```

This document classifies repository resources for the Admin and Portal
surfaces. It is authoritative for source ownership and classification at the
observed Git commit only. It does not prove artifact retention, deployment,
runtime state, provider ownership, or production identity.

Observed source: `master@d5ed20a3310f063cddacc0b5bad4a385da21ccd2`.

## Classification invariant

Every listed resource has exactly one classification from Issue #527:

- `ACTIVE_PRODUCTION`
- `ACTIVE_SOURCE_UNBOUND`
- `LEGACY_QUARANTINE`
- `ARCHIVE_EVIDENCE`
- `RETIRE_CANDIDATE`
- `RUNTIME_ONLY_UNKNOWN`

Any resource reachable from a current HTML entry, bootstrap, stylesheet,
package build command, or CI build is not quarantine, archive, or a retire
candidate, regardless of words such as `legacy`, `preview`, or `preserve` in
its name. A current source/build dependency remains
`ACTIVE_SOURCE_UNBOUND` until a fresh exact production chain proves otherwise.

## Current map

| Resource or cohort | Surface and observed chain | Classification | Owner and retention reason | Next gate |
| --- | --- | --- | --- | --- |
| `admin/index.html`, `admin/src/main.tsx`, `admin/src/App.tsx`, `admin/src/styles.css`, `admin/dist` | Admin entry -> bootstrap -> application/styles -> generated output | `ACTIVE_SOURCE_UNBOUND` | Admin source/build. Current Admin production identity is not proven. | Keep buildable and verified; establish an exact deployment/artifact/source chain before any production claim. |
| Cross-surface routes in `admin/src/App.tsx` | The Admin bundle currently imports/routes Portal preview, Portal registration/login, and company-site code. | `ACTIVE_SOURCE_UNBOUND` | Active Admin build dependency and known isolation debt. It is not a production integration target. | A focused Risk B PR must add import/build boundaries before moving code. Company-site ownership remains with #551. |
| `admin/src/styles/legacy-entrypoints.css`, `admin/src/styles/public-site.css`, and the other imports of `admin/src/styles.css` | Transitive inputs to the current Admin build; `styles.css` is also consumed by the company-site entry. | `ACTIVE_SOURCE_UNBOUND` | Active CSS despite misleading names. Deletion or quarantine would break current builds. | First emit and verify per-surface source boundaries; then split or rename one coherent cohort per Risk B PR. |
| `admin/portal/index.html`, `admin/src/portal-main.tsx`, `admin/src/features/user-portal/**`, `admin/src/portal-static-preserve.css`, `admin/dist-portal` | Portal entry -> bootstrap -> Portal pages/client -> stylesheet -> generated output | `ACTIVE_SOURCE_UNBOUND` | Portal source/build. The current master output is not proof of current serving state. | Keep buildable and verified; obtain a separately approved fresh production inventory before promotion or retirement. |
| `admin/src/styles/portal-static-preserve/**` | Eleven CSS files are transitively imported by `portal-static-preserve.css`, including Admin-, public-site-, and legacy-named files. | `ACTIVE_SOURCE_UNBOUND` | Active Portal CSS. Most corresponding ordinary/preserve files differ byte-for-byte, so they cannot be deduplicated by name. | Add module/build boundary evidence, then split or rename without changing output in a focused Risk B PR. |
| `admin/src/app/admin-fixture-preview.ts`, `admin/src/features/subscriptions/usage-runtime-fixture.ts`, `admin/src/features/user-portal/totp-preview.ts`, and active tests | Reachable preview/fixture/test support for current source or CI. | `ACTIVE_SOURCE_UNBOUND` | Validation-only or synthetic inputs; never production evidence. | Keep isolated from production identity and secrets; remove only after import and test consumers are proven absent. |
| `admin/install/index.html`, `admin/src/install-config-main.tsx` | Direct Vite development entry with no current package/CI build command. | `ACTIVE_SOURCE_UNBOUND` | Source exists and may be used directly; absence from CI is not proof of disuse. | Assign an owner and build contract before quarantine or retirement consideration. |
| `admin/site/index.html`, `admin/src/site-main.tsx`, `admin/src/features/company-site/**`, `admin/dist-site` | Company-site entry -> bootstrap -> page/styles -> generated output | `ACTIVE_SOURCE_UNBOUND` | Active repo source/build, but lifecycle ownership is delegated to #551. | Do not retire through #527; reconcile and separate under #551. |
| PR #526, dated Figma observations, `docs/archive/**`, historical release/deployment records | Retained design, review, release, rollback, and archaeology records. | `ARCHIVE_EVIDENCE` | Evidence only; it cannot re-enter an active build or establish current production. | Retain with dates and exact identities; never copy into active source without a new review. |
| Current Admin deployment/artifact/source chain | No fresh exact deployment readback was performed for this map. | `RUNTIME_ONLY_UNKNOWN` | External currentness is unknown. | Separate Risk A read-only inventory before any provider, host, artifact, or runtime action. |
| Current Portal serving/artifact/source chain | A 2026-07-26 chain exists as dated evidence, but no fresh current readback was performed for this map. | `RUNTIME_ONLY_UNKNOWN` | External currentness is unknown; the old receipt cannot authorize a new state. | Separate Risk A read-only inventory before promotion, cleanup, or current-production claims. |

At this observation there are no repository resources classified as
`ACTIVE_PRODUCTION`, `LEGACY_QUARANTINE`, or `RETIRE_CANDIDATE`. That is a
fail-closed result, not an assertion that those classes can never be used.

## Source, artifact, and production separation

- Source state is read from the exact Git commit and current imports/build
  commands.
- Artifact state is a dated immutable artifact observation and may expire.
- Production state requires a fresh provider/runtime readback.
- A Project field, Issue status, filename, test, build result, Figma record, or
  old receipt cannot substitute for any of the above domains.

## Change rules

- Classification-only updates are Risk C and must bind an exact source
  observation.
- Import/build boundary enforcement, moves, renames, or verified source
  removal are Risk B and use focused PRs with tests.
- Deployment, provider inventory, artifact-store deletion, DNS/CDN/certificate/
  Nginx changes, production replacement, and rollback mutation are Risk A and
  require a separate gate and explicit approval.

Related documents:

- [PRODUCTION_SURFACE_REPORT.md](PRODUCTION_SURFACE_REPORT.md)
- [COMMERCIAL_FEATURE_INTEGRATION_GATE.md](COMMERCIAL_FEATURE_INTEGRATION_GATE.md)
- [CURRENT_SOURCE_AND_ARCHIVE_BOUNDARY.md](CURRENT_SOURCE_AND_ARCHIVE_BOUNDARY.md)
- [PORTAL_STATIC_PRODUCTION_RELEASE_RUNBOOK.md](PORTAL_STATIC_PRODUCTION_RELEASE_RUNBOOK.md)
