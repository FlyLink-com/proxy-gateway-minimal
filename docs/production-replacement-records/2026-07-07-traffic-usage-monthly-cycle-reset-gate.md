# Traffic Usage Monthly Cycle Reset Gate


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: traffic_usage_monthly_cycle_reset_gate
  superseded_by: null
  last_verified_at: 2026-07-07
  production_authority: false
```


- Date: 2026-07-07
- Target: `vul1/gccgw-vultr-candidate`
- Risk: A
- Scope: deploy backend-only monthly usage cycle accounting for portal,
  subscription headers, quota decisions, and Admin usage monitor
- Sensitive output: suppressed

## Change Summary

The usage quota model remains `50G / 100G / 200G per month`, but usage is no
longer evaluated against the lifetime cumulative rollup. The backend now
computes the active usage window from the entitlement `validFrom` timestamp and
the current evaluation time.

Example:

```text
validFrom=2026-07-06T00:00:00.000Z
cycle 1=2026-07-06T00:00:00.000Z to 2026-08-06T00:00:00.000Z
cycle 2=2026-08-06T00:00:00.000Z to 2026-09-06T00:00:00.000Z
```

Historical usage samples and rollups remain stored for audit. The current
cycle is used for:

- traffic quota decisions;
- User Portal account/order usage summaries;
- `Subscription-Userinfo` upload/download header values;
- Admin subscription usage monitor item and aggregate values.

## Backend Overlay Allowlist

Only these production source files are in scope:

```text
server/services/platform/usage-billing-cycle.mjs
server/services/platform/subscription-control-db.mjs
server/services/platform/traffic-accounting.mjs
server/services/platform/portal-access-requests.mjs
server/routes/subscription.mjs
server/services/platform/subscription-usage-monitor.mjs
server/state.mjs
```

Test-only files are not deployed:

```text
server/tests/platform-traffic-accounting.test.mjs
server/tests/platform-portal-access-requests.test.mjs
server/tests/admin-subscriptions.test.mjs
server/tests/platform-subscription-usage-monitor.test.mjs
server/tests/state.test.mjs
```

## Important Packaging Note

Production deployment copies whole files, not individual hunks. `server/state.mjs`
also contains prior traffic-usage collector wiring from the earlier approved
traffic usage work. Before deployment, verify one of these is true:

- the remote current `server/state.mjs` already matches the reviewed previous
  traffic-usage collector baseline and can safely receive the monthly-cycle
  clock wiring; or
- prepare a remote-current-based minimal candidate that applies only the
  monthly-cycle `state.mjs` clock wiring.

Do not mix unrelated dirty worktree files into this release.

## Explicit Non-goals

- Do not deploy portal/static assets.
- Do not change DNS, Nginx, firewall, Xray, Hysteria2, Mihomo, or system
  runtime configs.
- Do not change SQLite schema or run migrations.
- Do not enable, disable, or retune collectors.
- Do not output subscription links, tokens, passwords, private keys, raw env,
  raw config, credential maps, controller payloads, customer records, or SQLite
  rows.

## Local Validation

Validated locally before this gate:

```text
node --test server/tests/platform-traffic-accounting.test.mjs server/tests/platform-portal-access-requests.test.mjs server/tests/admin-subscriptions.test.mjs server/tests/platform-subscription-usage-monitor.test.mjs server/tests/state.test.mjs
100 passed

npm test
931 passed

git diff --check
passed with LF-to-CRLF warnings only
```

## Deployment Shape

1. Build a reviewed backend overlay containing only the allowlisted production
   files.
2. Upload to a temporary staging directory and compare local/staged SHA-256
   hashes for every file.
3. Back up:
   - `/opt/proxy-gateway-minimal-candidate/current`
   - `/opt/proxy-gateway-minimal-candidate/.env`
   - `/opt/proxy-gateway-minimal-candidate/current/.env`
   - `proxy-gateway-candidate.service`
   - control database files
4. Cover only the allowlisted production files.
5. Restart `proxy-gateway-candidate.service`.
6. Trigger `gccgw-traffic-usage-collect.service` once only for safe freshness
   validation.

## Post-deploy Validation

Use redacted checks only:

```text
proxy-gateway-candidate.service=active
gccgw-traffic-usage-collect.timer=active
collector trigger exits 0
collector unresolved count is 0 or an already-known tolerated mapping residue
portal/account usage summaries return current-cycle totals
subscription header upload/download values are current-cycle totals
Admin usage monitor aggregate values are current-cycle totals
```

Do not print raw subscription URLs, tokens, credentials, env values, configs,
controller payloads, SQLite rows, or customer-identifying record bodies.

## Rollback

Rollback requires a separate exact approval unless an immediate safety rollback
is needed during the same approved execution window.

1. Restore the allowlisted backend files from backup.
2. Restore env files only if they were touched unexpectedly.
3. Restart `proxy-gateway-candidate.service`.
4. Verify service active and redacted usage checks return to the previous
   behavior.

No SQLite schema rollback is required because this gate does not change schema.

## Suggested Approval Text

```text
批准上线 traffic-usage-monthly-cycle-reset-20260707 到 vul1/gccgw-vultr-candidate：上传并校验 reviewed backend overlay（server/services/platform/usage-billing-cycle.mjs、server/services/platform/subscription-control-db.mjs、server/services/platform/traffic-accounting.mjs、server/services/platform/portal-access-requests.mjs、server/routes/subscription.mjs、server/services/platform/subscription-usage-monitor.mjs、server/state.mjs）；备份 /opt/proxy-gateway-minimal-candidate/current、/opt/proxy-gateway-minimal-candidate/.env、/opt/proxy-gateway-minimal-candidate/current/.env、proxy-gateway-candidate.service 和控制库；仅覆盖上述后端文件并重启 proxy-gateway-candidate.service；触发 gccgw-traffic-usage-collect.service 做一次脱敏校验；不替换 portal/static，不改 DNS/Nginx/firewall/Xray/Hysteria2/Mihomo/SQLite schema，不启用或关闭任何 collector，不输出订阅链接、token、密码、私钥、原始 env、原始配置、credential map、controller payload 或 SQLite 行；上线前核对 server/state.mjs 远端基线与上一轮已批准 traffic-usage collector 版本一致，按当前备份回滚。
```
