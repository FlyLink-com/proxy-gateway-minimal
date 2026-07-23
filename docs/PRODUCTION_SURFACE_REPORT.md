# Production Surface Report

```yaml
document_metadata:
  doc_type: evidence
  lifecycle: active
  authority_scope: frontend_production_surface_evidence
  superseded_by: null
  last_verified_at: 2026-07-22
  production_authority: false
```

> Status:
> - Risk: C, read-only production-surface discovery
> - Evidence cutoff: 2026-07-22, America/Los_Angeles
> - Public asset observation: `2026-07-23T06:27:22Z`
> - Production impact: None
> - Code-change authority: None
> - Overall result: `BLOCKED`

## Purpose

This report answers one question before any commercial frontend work:

> Which source tree and exact commit produced the bytes currently served to
> Portal and Admin users?

The required identity chain is:

```text
Production URL
  -> deployment
  -> immutable artifact
  -> Git commit
  -> build entry
  -> source path
```

An observed URL, successful build, matching page name, or plausible source path
is not enough. If any link is unknown, the surface is not an approved
integration target.

## Gate Summary

| Surface | Serving state | Lineage state | Integration target state |
| --- | --- | --- | --- |
| Portal | `OBSERVED` | `DEPLOYED_UNRECONCILED` | `BLOCKED` |
| Admin | `OBSERVED` | `UNKNOWN` | `BLOCKED` |

## Method And Safety Boundary

The 2026-07-22 inventory used:

- unauthenticated public HTTP reads of the two production roots and their
  referenced static assets;
- a browser read of visible, non-sensitive page structure;
- repository release-state, artifact workflow, source-boundary, and historical
  frontend-reconciliation evidence;
- exact source inspection of Draft PR #526 at
  `be6ea94d3dde9e0fddb6bb739373c9a8263705c2`.

It did not:

- access provider consoles, credentials, environment values, raw logs,
  databases, customer records, payment data, or subscription material;
- deploy, promote, roll back, replace static files, or mutate production;
- infer a Git commit from a bundle file name;
- treat an HTTP `Last-Modified` header as a deployment or artifact identity.

Asset SHA-256 values below identify the exact public bytes observed at the
cutoff. They are observation evidence only until matched to a retained artifact
manifest.

## Portal Production Surface

### Observed URL And Bytes

| Field | Observed value |
| --- | --- |
| URL | `https://portal.gccwebos.com/` |
| Observed at | `2026-07-23T06:27:22Z` |
| HTTP result | `200` |
| Serving class | Nginx static surface |
| Root `Last-Modified` | `2026-07-09T04:13:00Z` |
| JavaScript | `/assets/index-RxgwCKCn.js` |
| JavaScript size / SHA-256 | `385330` bytes / `669c5b1828a1ec9697b523619212f330380f312b203c22ded47ba0fb50cd8ff8` |
| CSS | `/assets/index-C8cV34to.css` |
| CSS size / SHA-256 | `382111` bytes / `31bf29505a98d2a21285c30a1b8332afb97a49a1dbb26c933a71d61b59ea4944` |
| Current visible entry | Account login |
| Authenticated information architecture | Not re-verified in the current safe browser session |

### Identity Chain

| Link | Status | Evidence |
| --- | --- | --- |
| URL | `CONFIRMED` | Public root and referenced assets returned `200`. |
| Deployment | `UNKNOWN` | No current deployment ID, current-pointer record, or Deploy Note binds this URL. |
| Immutable artifact | `UNKNOWN` | Current public asset hashes are observed, but no retained artifact manifest is bound to them. |
| Git commit | `UNKNOWN` | No evidence binds the current JavaScript asset to a commit. |
| Build entry | `CANDIDATE_ONLY` | Repository source builds Portal through `admin/portal/index.html` and `admin/vite.portal.config.ts`. |
| Source path | `CANDIDATE_ONLY` | `admin/src/portal-main.tsx` and `admin/src/features/user-portal/` are current source candidates, not production-proven source. |

The last repository-recorded restore artifact is
`globalcircle-portal-ca9f5702-20260708.tar`, sourced from `ca9f5702`, and is
still classified `deployed_unreconciled` in
`docs/CURRENT_RELEASE_STATE.md`. Historical source reconciliation recorded a
different JavaScript asset name. The shared CSS name alone cannot prove that
the current Portal is the same immutable artifact.

**Portal decision: `BLOCKED`.** Do not modify a source candidate on the
assumption that it is the current production Portal.

## Admin Production Surface

### Observed URL And Bytes

| Field | Observed value |
| --- | --- |
| URL | `https://admin.gccwebos.com/` |
| Observed at | `2026-07-23T06:27:22Z` |
| HTTP result | `200` |
| Serving class | Nginx static surface |
| Root `Last-Modified` | `2026-07-06T20:49:28Z` |
| JavaScript | `/assets/index-DBS1EaJC.js` |
| JavaScript size / SHA-256 | `582452` bytes / `7fe66a871c8e5f5094f29b7db09d448ba01c6b2e7a01a168277e8e7273713dcb` |
| CSS | `/assets/index-C8cV34to.css` |
| CSS size / SHA-256 | `382111` bytes / `31bf29505a98d2a21285c30a1b8332afb97a49a1dbb26c933a71d61b59ea4944` |
| Page identity | `GlobalCircle AI - Operator Console` |

The authenticated Admin session exposed these safe navigation labels:

```text
运营总览
账户与资源
使用情况和渠道
用户管理
订单记录
节点健康状况
节点带宽
用户访问日志
用户操作日志
节点日志
```

No account identifier, credential, customer data, or operational record was
captured in this report.

### Identity Chain

| Link | Status | Evidence |
| --- | --- | --- |
| URL | `CONFIRMED` | Public root and referenced assets returned `200`. |
| Deployment | `UNKNOWN` | No current deployment ID or static promotion record is present. |
| Immutable artifact | `UNKNOWN` | `docs/CURRENT_RELEASE_STATE.md` explicitly records Admin production artifact identity as unknown. |
| Git commit | `UNKNOWN` | No retained manifest binds the observed asset hashes to a commit. |
| Build entry | `CANDIDATE_ONLY` | Repository source builds Admin through `admin/index.html` and `admin/vite.config.ts`. |
| Source path | `CANDIDATE_ONLY` | `admin/src/main.tsx`, `admin/src/App.tsx`, and the current layout/navigation source are not production-proven. |

The repository can build and package `admin-static`, but
`.github/workflows/release-artifact.yml` only creates short-retention build
artifacts. It does not promote them to `admin.gccwebos.com`.

**Admin decision: `BLOCKED`.** The repository's current Admin shell is a source
candidate, not a proven production integration target.

## PR #526 Binding Result

Draft PR #526 exact head at this cutoff:

```text
be6ea94d3dde9e0fddb6bb739373c9a8263705c2
```

The PR proves source, tests, and buildability for a source-only Coins slice. It
does not contain:

- a Portal or Admin production deployment ID;
- a retained immutable production artifact manifest;
- a digest comparison between its build outputs and the live asset bytes;
- a Deploy Note for either static release unit;
- a current authenticated Portal journey baseline.

Therefore PR #526 cannot claim that its Portal or Admin UI is integrated into
the current production surfaces.

## Evidence Required To Pass

For each surface, all of the following must be recorded:

1. production URL and serving deployment/current pointer;
2. immutable artifact file name, size, SHA-256, and durable location;
3. manifest source commit and release unit;
4. byte-for-byte match between the retained artifact and current public assets;
5. build entry and owning source paths;
6. authenticated navigation and user/operator journey, recorded without
   private data;
7. rollback-capable prior artifact identity.

Until then:

```text
frontend_identity_gate: blocked
frontend_code_changes: prohibited
task_11_closeout: prohibited
production_claim: prohibited
```

## Related Documents

- `docs/ACTIVE_FRONTEND_MAP.md`
- `docs/COMMERCIAL_SYSTEM_MAP.md`
- `docs/COMMERCIAL_FEATURE_INTEGRATION_GATE.md`
- `docs/CURRENT_RELEASE_STATE.md`
- `RELEASE_MANIFEST.md`
- `docs/CURRENT_SOURCE_AND_ARCHIVE_BOUNDARY.md`
- `docs/SOURCE_PRODUCTION_RECONCILIATION_2026_07_08.md`
