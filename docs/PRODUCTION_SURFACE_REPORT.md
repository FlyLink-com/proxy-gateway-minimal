# Frontend Production Surface Report

Observed: 2026-08-28, America/Los_Angeles.

```yaml
document_metadata:
  doc_type: evidence
  lifecycle: active
  authority_scope: frontend_production_surface_observation
  superseded_by: null
  last_verified_at: 2026-08-28
  production_authority: false
```

This is a dated, read-only observation that keeps source, artifact, and
production state separate for the Admin and Portal surfaces. It is not a
deployment inventory, promotion receipt, rollback record, or execution
approval.

## Observation boundary

- Source: `master@d5ed20a3310f063cddacc0b5bad4a385da21ccd2`.
- Source tree: `2c5f6207a050c8f9463bfa7ef0276354087dc381`.
- Exact master CI and Code Quality runs completed successfully.
- Release Artifact run:
  [33226161889](https://github.com/gccwebos-com/proxy-gateway-minimal/actions/runs/33226161889).
- No provider, host, DNS, CDN, Nginx, static-root, current-pointer, or public
  runtime inventory was performed.

## Surface states

| Surface | Source observation | Artifact observation | Production observation | Result |
| --- | --- | --- | --- | --- |
| Admin | `admin/index.html -> admin/src/main.tsx -> admin/src/App.tsx -> admin/src/styles.css -> admin/dist`; exact master build and verifier passed. | `admin-static-d5ed20a3310f`, artifact `9706934374`, digest `sha256:fcdb25d2955340b898a48e31c10a1257db346cc11a6b58f4429bcff9afec9925`, expires 2026-09-12. | Not read. No exact current deployment/artifact/source chain is available from this observation. | Source and artifact: `ACTIVE_SOURCE_UNBOUND`; production: `RUNTIME_ONLY_UNKNOWN`. |
| Portal | `admin/portal/index.html -> admin/src/portal-main.tsx -> UserRegistrationPage/UserPortalPage -> admin/src/portal-static-preserve.css -> admin/dist-portal`; exact master build and verifier passed. | `portal-static-d5ed20a3310f`, artifact `9706934490`, digest `sha256:f719c18ad89f78870fe6a39842aedc0c774231a2a3972bcfebfd37895f461a2e`, expires 2026-09-12. | Not read. The 2026-07-26 `portal-static-cb69e18071c1` evidence is historical and does not prove the current serving state. | Source and artifact: `ACTIVE_SOURCE_UNBOUND`; production: `RUNTIME_ONLY_UNKNOWN`. |

Artifact availability is temporary and is not durability, deployment, or
rollback proof. A successful build or artifact upload cannot be rewritten as
`ACTIVE_PRODUCTION`.

## Cross-surface source debt

The Admin entry currently includes Portal preview/login/register and company-
site routes through `admin/src/App.tsx`. Both Admin and the company-site build
consume `admin/src/styles.css`, while the Portal build consumes eleven CSS
files through `portal-static-preserve.css`. These are active build facts, not
proof that the surfaces share one production identity.

The current classification must therefore remain source-specific and
fail-closed. Physical source isolation belongs to focused Risk B work. The
company-site lifecycle remains owned by #551.

## Production stop condition

Before any production claim or mutation, a separate Risk A packet must provide
a fresh, exact chain:

```text
public name
-> provider/deployment
-> immutable artifact digest
-> source commit
-> HTML entry/bootstrap/stylesheet
-> output or serving root
```

It must also identify rollback material and its retention window. Ambiguous,
unreadable, redacted, expired, or permission-denied evidence is `UNKNOWN`, not
an empty or successful result.

This report cannot authorize deployment, artifact deletion, provider cleanup,
DNS/CDN/certificate/Nginx changes, static replacement, or rollback.

Related documents:

- [ACTIVE_FRONTEND_MAP.md](ACTIVE_FRONTEND_MAP.md)
- [COMMERCIAL_FEATURE_INTEGRATION_GATE.md](COMMERCIAL_FEATURE_INTEGRATION_GATE.md)
- [PORTAL_STATIC_PRODUCTION_RELEASE_RUNBOOK.md](PORTAL_STATIC_PRODUCTION_RELEASE_RUNBOOK.md)
