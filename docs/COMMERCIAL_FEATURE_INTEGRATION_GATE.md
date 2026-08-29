# Frontend Commercial Feature Integration Gate

Last verified: 2026-08-28, America/Los_Angeles.

```yaml
document_metadata:
  doc_type: canonical
  lifecycle: active
  authority_scope: frontend_commercial_integration_gate
  superseded_by: null
  last_verified_at: 2026-08-28
  production_authority: false
```

This gate controls where commercial frontend work may enter the Admin and
Portal source trees. It does not authorize production integration, deployment,
provider/runtime changes, schema/auth changes, or release promotion.

## Admission rule

A source-only integration is allowed only when all of these are true:

1. The target cohort appears in
   [ACTIVE_FRONTEND_MAP.md](ACTIVE_FRONTEND_MAP.md) as
   `ACTIVE_SOURCE_UNBOUND` or `ACTIVE_PRODUCTION` at the exact PR base.
2. The target surface and owner match the feature intent.
3. The entry, bootstrap, route, stylesheet, build output, and verifier are
   named explicitly.
4. Focused boundary tests fail before the implementation and pass after it.
5. The full surface build and verifier pass on the exact PR head.
6. The PR makes no production claim and does not consume production approval
   from a Project field, Issue state, old receipt, or build result.

`RUNTIME_ONLY_UNKNOWN`, unclassified, unreadable, or ambiguous evidence fails
closed.

## Allowed source targets

| Intent | Allowed current source target | Required validation | Boundary |
| --- | --- | --- | --- |
| Protected Admin behavior | Admin entry/bootstrap and Admin-owned components reached from `admin/src/main.tsx`. | Focused tests, `admin:test`, `admin:build`, `admin:verify`, server tests, diff check. | Do not use Portal/site preview branches as the production target. |
| Customer Portal behavior | Portal entry/bootstrap and Portal-owned components reached from `admin/src/portal-main.tsx`. | Focused tests, `admin:test`, `admin:portal:build`, `admin:portal:verify`, server tests, diff check. | Do not infer deployment from the current source or artifact. |
| Company-site behavior | Not owned by #527. | Follow #551 and the company-site build/verifier. | Do not retire or promote it through this gate. |

## Forbidden integration targets

Do not attach new product or commercial behavior to:

- PR #526 or another closed/unmerged implementation;
- `docs/archive/**`, historical release/deployment records, or rollback
  evidence;
- Figma observations, screenshots, demos, previews, fixtures, mocks, or tests;
- generated `admin/dist`, `admin/dist-portal`, or `admin/dist-site` output;
- a path classified as `LEGACY_QUARANTINE`, `ARCHIVE_EVIDENCE`,
  `RETIRE_CANDIDATE`, or `RUNTIME_ONLY_UNKNOWN`;
- a file selected only because its name contains `legacy`, `preview`,
  `preserve`, `demo`, or `deprecated`.

The existing Admin cross-surface routes and mixed stylesheet imports are
boundary debt, not permission to add more cross-surface coupling.

## Risk and evidence gates

| Change | Risk and gate |
| --- | --- |
| Inventory/classification documentation | Risk C; exact source observation, document-authority check, diff check. |
| Source feature, import/build boundary, rename, move, or verified source removal | Risk B; one focused PR with intent, tests, builds, verifiers, and no production mutation. |
| Artifact promotion, deployment, provider/runtime inventory, DNS/CDN/certificate/Nginx change, production replacement, artifact deletion, or rollback | Risk A; separate issue/runbook, fresh exact inventory, explicit operator approval, validation, rollback, mutation, and post-readback. |

## Required PR evidence

A Risk B frontend PR records:

- exact base and head SHA;
- one frontend surface and release unit, or an explicit shared-source reason;
- touched entry/bootstrap/route/stylesheet/output boundary;
- focused negative and positive tests;
- surface build/verifier results on the exact head;
- production impact `none` and production state `not_deployed`;
- any remaining `RUNTIME_ONLY_UNKNOWN` facts without guessing.

Approval is not transferable. A dated artifact, Project field, old receipt, or
approval for a different digest/state cannot authorize a new target.

Related documents:

- [ACTIVE_FRONTEND_MAP.md](ACTIVE_FRONTEND_MAP.md)
- [PRODUCTION_SURFACE_REPORT.md](PRODUCTION_SURFACE_REPORT.md)
- [VALIDATION_BASELINE.md](VALIDATION_BASELINE.md)
- [PORTAL_STATIC_PRODUCTION_RELEASE_RUNBOOK.md](PORTAL_STATIC_PRODUCTION_RELEASE_RUNBOOK.md)
