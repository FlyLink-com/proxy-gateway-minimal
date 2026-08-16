# HP Portal Validation Read-Only Inventory


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: hp_portal_validation_readonly_inventory
  superseded_by: null
  last_verified_at: 2026-05-31
  production_authority: false
```


Date: 2026-05-31, Asia/Shanghai.

## Scope

Read-only HP inventory for the planned Aliyun-like private user-portal
validation environment.

## Risk

Risk: A preflight / read-only inventory.

No mutation was performed.

## Approval Posture

The operator provided the HP portal validation setup approval text, but the
message omitted the runbook's required rollback clause:

```text
rollback by stopping the test service and deleting the isolated test directory
```

Because the exact approval phrase was incomplete, this record only covers
read-only inventory and local validation. No deployment, dependency
installation, test SQLite creation, process start, Nginx/systemd/firewall
change, production data copy, real subscription issuance, or Aliyun mutation was
performed.

## Local Repo Baseline

```text
branch: codex/user-portal-plan-subscription-page
head: 4a6382b
working tree: clean at inventory start
```

## HP Access Check

Initial alias check:

```text
ssh hp-server ... -> hostname alias did not resolve from this Windows SSH config
```

Historical private HP access path check without the approved key failed with
`Permission denied`, as expected.

Approved local HP key path existed and read-only SSH succeeded.

## HP Inventory Summary

Safe facts observed:

```text
hostname: hp-server
kernel: Linux 6.8.0-100-generic x86_64
user: g
home: /home/g
git: 2.43.0
node: not found on PATH
npm: not found on PATH
root filesystem: 98G total, 8.1G used, 85G available
```

Existing listeners were observed for SSH, local DNS, previous lab Python
listeners, local `ss-local` listeners, and loopback Shadowsocks service. These
listeners were not changed.

## Local Validation

Targeted local user-portal tests:

```text
npm run admin:test -- user-portal
result: 15 passed / 0 failed
```

Admin bundle build:

```text
npm run admin:build
result: passed
```

## Stop Condition

Setup execution stopped before any HP mutation because:

1. the exact approval phrase was incomplete without rollback authority;
2. HP does not currently have Node/npm available on PATH, so any setup would
   require dependency/runtime preparation;
3. setup preparation, test SQLite creation, and service start are A-tier
   mutations under `docs/HP_PORTAL_VALIDATION_RUNBOOK.md`.

## Non-Goals Confirmed

Not performed:

- DNS change.
- Public listener exposure.
- Production SQLite or customer-data copy.
- Aliyun mutation.
- Nginx public-boundary change.
- systemd persistent service installation.
- Test SQLite creation.
- Dependency installation.
- Service start.
- Real subscription issuance.
- Subscription URL, token, artifact secret, credential, or customer-data
  output.

## Next Gate

To continue with HP setup, the operator must provide the complete exact approval
phrase from `docs/HP_PORTAL_VALIDATION_RUNBOOK.md`, including the rollback
clause.
