# Traffic Usage Monthly Cycle Reset Execution


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: traffic_usage_monthly_cycle_reset_execution
  superseded_by: null
  last_verified_at: 2026-07-07
  production_authority: false
```


- Date: 2026-07-07
- Target: `vul1/gccgw-vultr-candidate`
- Risk: A
- Scope: backend-only monthly usage cycle accounting
- Sensitive output: suppressed

## Approval

The operator approved `traffic-usage-monthly-cycle-reset-20260707`.

Allowed scope:

- Upload and verify reviewed backend overlay:
  - `server/services/platform/usage-billing-cycle.mjs`
  - `server/services/platform/subscription-control-db.mjs`
  - `server/services/platform/traffic-accounting.mjs`
  - `server/services/platform/portal-access-requests.mjs`
  - `server/routes/subscription.mjs`
  - `server/services/platform/subscription-usage-monitor.mjs`
  - `server/state.mjs`
- Back up current runtime tree, base/current env files,
  `proxy-gateway-candidate.service`, and control database files.
- Cover only the approved backend files.
- Restart `proxy-gateway-candidate.service`.
- Trigger `gccgw-traffic-usage-collect.service` once for redacted validation.

Explicit non-goals:

- Do not replace portal/static assets.
- Do not change DNS, Nginx, firewall, Xray, Hysteria2, Mihomo, or SQLite
  schema.
- Do not enable or disable collectors.
- Do not output subscription links, tokens, passwords, private keys, raw env,
  raw config, credential maps, controller payloads, SQLite rows, or customer
  data.

## Local Validation

Local validation completed before deployment:

```text
node --test server/tests/platform-traffic-accounting.test.mjs server/tests/platform-portal-access-requests.test.mjs server/tests/admin-subscriptions.test.mjs server/tests/platform-subscription-usage-monitor.test.mjs server/tests/state.test.mjs
100 passed

npm test
931 passed

git diff --check
passed with LF-to-CRLF warnings only
```

## Remote Preflight

Remote target:

```text
hostname=gccgw-vultr-candidate
proxy-gateway-candidate.service=active
gccgw-traffic-usage-collect.timer=active
current runtime tree=present
```

`server/state.mjs` baseline matched the previously approved
traffic-usage collector deployment:

```text
remote_state_sha256=d04d541ebd7be7d8f405340f105d36283b401153447178e022db4357f9de23b5
state_has_mihomo_usage_map=yes
state_has_xray_scope=yes
```

Remote pre-deployment hashes:

```text
server/services/platform/usage-billing-cycle.mjs MISSING
server/services/platform/subscription-control-db.mjs f595ee8a3d6dcd0b87fdb64fa6bfb90e808a5ab67e284b2376c8ab862216fbf2
server/services/platform/traffic-accounting.mjs bf877527b71b81b397a09e167d23836b3828f6bf5cf8881c4ead1d29917346ca
server/services/platform/portal-access-requests.mjs 948be2304b56378cb1e0e13e6c8b411519f6559e4fb5f9fbf7e9d0c7134edc38
server/routes/subscription.mjs f29ba602f16515a63280606b279c47a94bfd617d30fc63ea5d4eb17e56315dae
server/services/platform/subscription-usage-monitor.mjs b9ef36ce5fc469ce1811843462904fed436d5b00e85990ece6e5fe2b18cfee24
server/state.mjs d04d541ebd7be7d8f405340f105d36283b401153447178e022db4357f9de23b5
```

## Overlay Verification

Local overlay label:

```text
traffic-usage-monthly-cycle-reset-20260707-20260707150132
```

Staged and deployed hashes:

```text
server/services/platform/usage-billing-cycle.mjs 79f95b2d5ec7cb7c403171e3032a5b9482a619d2223ab3ff1b4007bdae5f7f1e
server/services/platform/subscription-control-db.mjs 1dd34aacac4b1435c0cc25d2a3ac246c4b4024e6a8a4d83fe637cfd328facc2a
server/services/platform/traffic-accounting.mjs 1d27930c551c52f907df669f0070daf789ab8088c5033d71621241af8a74d7ba
server/services/platform/portal-access-requests.mjs 97ae7ba8346844033f231dd46ec27bcb99512a1b47b13e6b977503a22c246370
server/routes/subscription.mjs 40620fb15f0fa046a25813cdc01013613bd3726c159655fbf8648dd47eb3eb1d
server/services/platform/subscription-usage-monitor.mjs fbad04bfa846653176ff51d59ef2062866b724e4fc77cf73e8c6ddbaa118e7af
server/state.mjs 8d11b646924a9f9455610d3ab2bc30d4e6821ccbcc5660615a7dbeb1a72e2f00
```

Remote staging validation:

```text
sha256sum -c SHA256SUMS: ok
node --check allowlisted files: ok
```

## Backup

Backup directory:

```text
/opt/proxy-gateway-minimal-candidate/backups/traffic-usage-monthly-cycle-reset-20260707-20260707150132
```

Backed up:

```text
current runtime tree=yes
base env file=yes
current env file=yes
proxy-gateway-candidate.service=yes
shared control state=yes
```

No env contents, tokens, credentials, raw configs, SQLite rows, or customer data
were read or recorded.

## Deployment

Covered only the approved backend files:

```text
server/services/platform/usage-billing-cycle.mjs
server/services/platform/subscription-control-db.mjs
server/services/platform/traffic-accounting.mjs
server/services/platform/portal-access-requests.mjs
server/routes/subscription.mjs
server/services/platform/subscription-usage-monitor.mjs
server/state.mjs
```

Restarted:

```text
proxy-gateway-candidate.service
```

Not changed:

```text
portal/static assets
DNS
Nginx
firewall
Xray
Hysteria2
Mihomo
SQLite schema
collector enablement or channel scope
```

## Post-deployment Validation

Service state:

```text
proxy-gateway-candidate.service=active
proxy_result=success
proxy_restarts=0
gccgw-traffic-usage-collect.timer=active
local health HTTP=200
```

Triggered `gccgw-traffic-usage-collect.service` once. Latest redacted summary:

```text
collector_result=success
collectorCount=4
observationCount=20
recordedCount=20
insertedCount=20
unresolvedCount=0
quotaDisableRequiredCount=0
nextAction=continue_usage_monitoring
safety.redacted=true
```

Synthetic monthly-cycle check on the deployed helper:

```text
validFrom=2026-07-06T00:00:00.000Z
at=2026-08-10T00:00:00.000Z
cycle_startedAt=2026-08-06T00:00:00.000Z
cycle_endedAt=2026-09-06T00:00:00.000Z
```

Recent `proxy-gateway-candidate.service` journal scan after deployment returned
no matching error, exception, failed, or unhandled lines.

## Rollback

Rollback source:

```text
/opt/proxy-gateway-minimal-candidate/backups/traffic-usage-monthly-cycle-reset-20260707-20260707150132
```

Rollback requires a separate exact approval unless an immediate safety rollback
is needed during the same approved execution window:

1. Restore the seven allowlisted backend files from `backup/current`.
2. Restore env files only if later evidence shows they were unexpectedly
   touched.
3. Restart `proxy-gateway-candidate.service`.
4. Verify service active and run redacted collector validation.

No SQLite schema rollback is required because this deployment did not change
schema.
