# HP Portal Validation Private Execution

Date: 2026-05-31, Asia/Shanghai.

## Scope

Private HP validation for the user-portal and subscription-control seams using
the current branch in an isolated, disposable test directory.

Risk: A execution.

Production impact: none.

## Approval

The operator completed the runbook approval for HP Aliyun-like private portal
validation setup, including the rollback clause requiring the test service to
be stopped and the isolated test directory to be deleted.

This approval allowed:

- deploying the current branch to HP under an isolated test directory;
- installing dependencies from repository lockfiles;
- creating test SQLite data only;
- starting a loopback/private test service for portal validation;
- rollback by stopping the test service and deleting the isolated directory.

It did not allow DNS, public listener, production SQLite/customer data, Aliyun,
Nginx public boundary, persistent systemd, or real subscription issuance
mutation.

## Local Baseline

```text
branch: codex/user-portal-plan-subscription-page
head: a843be6
working tree: clean before execution record edits
origin branch: origin/codex/user-portal-plan-subscription-page at a843be6
origin/master observed at: 1601e96
```

Local validation before HP mutation:

```text
npm run admin:test -- user-portal: 15 passed / 0 failed
npm run admin:build: passed
npm test: 437 passed / 0 failed
npm run project-state:check: passed
git diff --check origin/master...HEAD: passed
```

## HP Setup

Safe HP inventory facts:

```text
host: hp-server
kernel: Linux 6.8.0-100-generic x86_64
login-shell node: v22.22.2
login-shell npm: 10.9.7
```

`/opt` required non-interactive sudo, which was unavailable. The isolated
validation directory was therefore placed at:

```text
/home/g/proxy-gateway-minimal-portal-validation
```

Before deletion or cleanup, the resolved path was verified with `readlink -m`
and matched the exact isolated directory above.

The current commit was packaged with `git archive`, copied to HP, and extracted
under `repo/`. Repository lockfiles were present. HP setup ran:

```text
npm ci --no-audit --no-fund
npm ci --prefix admin --no-audit --no-fund
npm run admin:build
```

An old leftover isolated portal-validation process from the same directory was
found and stopped before the current service start. It was not a production
process and no systemd, Nginx, firewall, DNS, Aliyun, AWS, production SQLite, or
customer-data mutation was performed.

## Test Service

The temporary service used:

```text
bind: 127.0.0.1:45131
data/control-test.sqlite
data/runtime-test.sqlite
handoff/portal-entry-demo.json with mode 0600
```

The handoff file contained fake/demo validation material only and was not
printed to terminal output, docs, or chat.

The service mounted the built `admin/dist` portal bundle before the repository
public static files, then mounted the normal app routes with the user portal
routes explicitly enabled for validation.

## Validation Evidence

HP smoke results:

```text
/api/health: 200
/api/status without auth: 401
/api/admin/subscriptions without auth: 401
portal shell: 200
portal bundle asset: 200
/api/portal/entry/enroll: 200
/api/portal/session: 200
responseSensitiveMaterial: false
control-test.sqlite integrity_check: ok
runtime-test.sqlite integrity_check: ok
platform_portal_sessions rows: 1
listener: 127.0.0.1:45131 only
```

This validates the private portal shell and guarded portal entry/session seam
with test-only data. Local UI tests remain the evidence for detailed lifecycle
rendering states.

## Rollback

Rollback was executed immediately after validation:

```text
stopped: true
listener_45131: absent
deleted: /home/g/proxy-gateway-minimal-portal-validation
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
