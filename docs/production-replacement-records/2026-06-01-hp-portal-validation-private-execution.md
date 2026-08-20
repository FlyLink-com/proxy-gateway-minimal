# HP Portal Validation Private Execution


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: hp_portal_validation_private_execution
  superseded_by: null
  last_verified_at: 2026-06-01
  production_authority: false
```


Date: 2026-06-01, Asia/Shanghai.

## Scope

Private HP validation for the current branch user-portal and
subscription-control service seams using an isolated, disposable test directory.

Risk: A execution.

Production impact: none.

## Approval

The operator approved HP Aliyun-like private portal validation environment
setup, including rollback by stopping the test service and deleting the
isolated test directory.

This approval allowed:

- deploying the current branch to `hp-server` under an isolated test directory;
- installing dependencies from repository lockfiles;
- creating test SQLite data only;
- starting a loopback/private test service for portal validation;
- rollback by stopping the test service and deleting the isolated directory.

It did not allow:

- DNS change;
- public listener exposure;
- production SQLite or customer-data copy;
- Aliyun mutation;
- Nginx public-boundary change;
- persistent systemd service;
- real subscription issuance;
- firewall change;
- edge traffic activation.

## Local Baseline

```text
repository: D:\Projects\proxy-gateway-minimal
branch: docs/master-archive-boundary
head: a06d021
```

This pass validated the latest branch head after `gccgw` command-surface
consolidation, source-doc navigation, and runbook preflight-boundary hardening.
No unrelated local file was included in the HP deployment archive.

## HP Setup

Safe HP inventory facts:

```text
host: hp-server
kernel: Linux 6.8.0-100-generic x86_64
login-shell node: v22.22.2
login-shell npm: 10.9.7
```

The isolated validation directory was:

```text
/home/g/proxy-gateway-minimal-portal-validation
```

Before cleanup or deletion, the resolved path was verified with `readlink -m`
and matched the exact isolated directory above.

The current branch head was copied to HP with `git archive`, extracted under
`repo/`, and installed from repository lockfiles:

```text
npm ci --no-audit --no-fund
npm ci --prefix admin --no-audit --no-fund
npm run admin:build
```

No `.env`, production SQLite, handoff file, log file, token, subscription URL,
credential, or customer data was copied from production or from the local
operator environment into Git.

## Test Service

The temporary validation service used:

```text
bind: 127.0.0.1:45132
data/control-test.sqlite
data/runtime-test.sqlite
handoff/portal-entry-demo.json with mode 0600
```

The handoff file contained fake/demo validation material only and was not
printed to terminal output, docs, or chat.

The service mounted the built `admin/dist` portal bundle before the repository
public static files, then mounted normal app routes with the user portal routes
explicitly enabled for validation.

## Validation Evidence

Clean HP smoke results:

```text
/api/health: 200
/api/status without auth: 401
/api/admin/platform/portal-access-requests without auth: 401
portal shell: 200
portal bundle asset: 200
/api/portal/access-requests: 201
/api/portal/entry/enroll: 200
/api/portal/session: 200
forbiddenLiteral in responses: false
raw subscription path/token pattern in responses: false
control-test.sqlite integrity: ok
platform_portal_entries rows: 1
platform_portal_sessions rows: 1
platform_portal_totp_credentials rows: 1
runtime-test.sqlite integrity: ok
subscription_tenants rows: 0
subscription_artifacts rows: 0
listener: 127.0.0.1:45132 only
```

This validates the private portal shell, guarded access-request route, dynamic
entry enrollment, and short-lived portal session seam with test-only data.
Runtime tenant/artifact counts remained zero, confirming no real subscription
issuance occurred.

## Rollback

Rollback was executed immediately after validation:

```text
deleted: true
listener_45132: absent
```

The isolated test directory no longer exists after rollback.

## Non-Goals Confirmed

Not performed:

- DNS change.
- Public listener exposure.
- Nginx public-boundary change.
- systemd persistent service installation.
- Firewall mutation.
- Aliyun mutation.
- AWS mutation.
- Production SQLite copy, migration, or write.
- Customer-data import.
- Real subscription issuance.
- Payment activation.
- Edge traffic activation.
- Legacy query-token retirement.
- Raw subscription URL, artifact secret, access token, credential, private key,
  or customer-data output.
