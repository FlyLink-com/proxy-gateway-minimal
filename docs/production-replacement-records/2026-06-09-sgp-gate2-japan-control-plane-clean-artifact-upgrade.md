# SGP Gate 2 Japan Control-Plane Clean Artifact Upgrade


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: sgp_gate2_japan_control_plane_clean_artifact_upgrade
  superseded_by: null
  last_verified_at: 2026-06-09
  production_authority: false
```


Date: 2026-06-09, Asia/Shanghai.

Risk tier: A production runtime upgrade.

Target:

- Vultr Japan control plane: `45.76.222.52`

This record contains only redacted operational facts. It does not contain raw
environment values, raw runtime config, raw logs, SQLite rows, account
credentials, subscription URLs, tokens, passwords, private keys, or customer
data.

## Source Baseline

- Source commit: `505eed929e7fb7a3aa72b62ff2da92725891d9c5`.
- Source branch: `feat/install-config-wizard`.
- Release id: `vultr-japan-sgp-gate2-20260609-505eed9-static`.
- Artifact SHA-256:
  `8C3A4BE50872011C96DAE25ED2293ACCECA2D2E6480FD0507BD071706C260987`.

The artifact was built from the Git commit plus freshly built static assets:

- `admin/dist`
- `admin/dist-portal`

The artifact was not built from the Singapore runtime host.

## Local Preflight

Local validation before upload:

- `npm run admin:build` passed.
- `npm run admin:portal:build` passed.
- `npm run admin:portal:verify` passed.
- `npm run project-state:check` passed.
- `git diff --check` passed.
- `gccgw package inspect` reported:
  - production artifact boundary ok;
  - blocker count 0;
  - review-required count 0.

`gccgw package inspect` overall package-template status was false because this
artifact is a source/runtime release artifact, not a deployment-template package
with `package-manifest.json`, `topology.json`, and related import metadata.

## Pre-Upgrade State

Read-only Japan preflight showed:

- current release before upgrade:
  `vultr-order-response-channel-hotfix-20260608-001`;
- `proxy-gateway-candidate.service`: active;
- local health endpoint: HTTP 200;
- public portal: HTTP 200;
- public health: HTTP 200;
- public Admin: HTTP 404;
- `tcp3456`: loopback-only at `127.0.0.1:3456`;
- Japan-to-SGP SSH: already fixed and validated before this gate.

## Change Executed

On Japan control plane:

- uploaded the verified artifact;
- verified remote SHA-256 matched the expected hash;
- backed up current symlink, protected env, current release env, production
  proxy config, and local SQLite/database files found under protected paths;
- unpacked the artifact into the releases directory;
- ran `npm ci --omit=dev`;
- carried forward protected runtime material required by systemd and operator
  access:
  - current release `.env`;
  - current production `config/proxy-servers.json`;
  - current local `.proxy-gateway` runtime material;
- switched `/opt/proxy-gateway-minimal-candidate/current` to the new release;
- restarted `proxy-gateway-candidate.service` only.

No SGP runtime service was restarted. No DNS, Nginx, provider firewall, payment,
account/password generation, live order creation, subscription URL/token/password
output, SQLite row dump, raw env output, raw config output, or raw log output
was performed.

## Validation

Post-upgrade validation:

- current release:
  `vultr-japan-sgp-gate2-20260609-505eed9-static`;
- `proxy-gateway-candidate.service`: active;
- local health endpoint: HTTP 200;
- local Admin route required authentication;
- `tcp3456`: loopback-only at `127.0.0.1:3456`;
- Japan-to-SGP SSH: ok;
- Japan redacted `gccgw node policy-check --json`:
  - ok: true
  - nodeCount: 6
  - blockers: 0
  - warnings: 0
- public portal: HTTP 200;
- public health: HTTP 200;
- public Admin: HTTP 404;
- no-session portal order API: HTTP 401;
- no-session current access request API: HTTP 401;
- empty password session request: HTTP 400.

## Decision

Gate 2 is complete.

Japan control plane is now running the clean artifact release selected for the
SGP final closeout lane. The protected runtime config was intentionally carried
forward from the previous production release instead of being replaced by local
source defaults.

SGP is still not fully closed. Gate 3 remains required to apply or reconcile
the SGP data-plane runtime through the protected handoff path. Gate 4 remains
separate because it creates a live test order.
