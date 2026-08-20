# gccwebos IPv6 Production Gate


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: gccwebos_ipv6_production_gate
  superseded_by: null
  last_verified_at: 2026-07-06
  production_authority: false
```


Date: 2026-07-06.

Risk tier: A production DNS/Nginx network change.

Target:

- Vultr Japan control plane: `45.76.222.52`
- Japan IPv6: `2401:c080:1000:2a0e:5400:6ff:fe38:fa1c`

This is a planning and approval packet. It is not itself production approval.
It contains only redacted operational facts and does not include raw
environment values, raw runtime config, raw logs, SQLite rows, account
credentials, subscription URLs, tokens, passwords, private keys, runtime
credential material, or customer data.

## Decision

Use Japan as the first production IPv6 HTTPS entry point for:

- `portal.gccwebos.com`
- `sub.gccwebos.com`

Do not point these domains to SGP for this gate. SGP currently has IPv6
listeners, but its Nginx hostname scope is `sgp.gccwebos.com`; it is not the
current production User Portal or subscription domain authority.

Do not use any `globalcirclecat.*` hostname as a production entry point.

## Read-Only Findings

DNS:

- `portal.gccwebos.com` has A `45.76.222.52` and no AAAA record.
- `sub.gccwebos.com` has A `45.76.222.52` and no AAAA record.
- `sgp.gccwebos.com` has A `45.76.158.201` and no AAAA record.
- `gccwebos.com` and `www.gccwebos.com` have no AAAA records in this preflight.

Japan host:

- Hostname: `gccgw-vultr-candidate`
- Global IPv6: `2401:c080:1000:2a0e:5400:6ff:fe38:fa1c/64`
- Nginx: active; `nginx -t` passed.
- Current IPv6 listeners include TCP `22`, TCP `8443`, and UDP `10443`.
- Current IPv6 listeners do not include TCP `80` or TCP `443`.
- Existing certificate SAN covers `portal.gccwebos.com` and
  `sub.gccwebos.com`.
- Current forced IPv6 HTTPS check to `portal.gccwebos.com` on Japan IPv6 fails
  before HTTP because Nginx is not listening on IPv6 `443`.

Japan Nginx scope:

- `portal.gccwebos.com` has an existing HTTPS server block with only IPv4
  `listen 443 ssl`.
- The block serving `sub.gccwebos.com` has an existing HTTPS server block with
  only IPv4 `listen 443 ssl`.
- The HTTP redirect/default blocks are also IPv4-only for the relevant
  `gccwebos` hostnames.

SGP host:

- Hostname: `gccgw-sgp-small-portal-20260608-002`
- Global IPv6: `2001:19f0:4401:ae6:5400:6ff:fe3b:30ea/64`
- Nginx IPv6 listeners include TCP `80` and TCP `443`.
- SGP Nginx hostname scope observed in preflight is `sgp.gccwebos.com`, not
  `portal.gccwebos.com` or `sub.gccwebos.com`.

## Proposed Scope

Japan only:

1. Back up the active Nginx site config and capture current `nginx -T` summary,
   `nginx -t`, IPv6 listeners, DNS, and HTTP status facts.
2. Add IPv6 listeners to the existing `gccwebos` Nginx host blocks:
   - add `listen [::]:443 ssl;` to `portal.gccwebos.com`;
   - add `listen [::]:443 ssl;` to the block serving `sub.gccwebos.com`;
   - add `listen [::]:80;` to the relevant HTTP redirect/default block only
     where needed for `portal.gccwebos.com` and `sub.gccwebos.com`.
3. Run `nginx -t`.
4. Reload Nginx only after the config test passes.
5. Validate forced IPv6 HTTPS locally and from SGP:
   - `portal.gccwebos.com` on Japan IPv6 returns expected health behavior;
   - `sub.gccwebos.com` on Japan IPv6 returns expected health behavior;
   - public Admin remains blocked;
   - public high ports `3456` and `18080` remain closed.
6. Add AAAA records only after Nginx IPv6 validation passes:
   - `portal.gccwebos.com` -> `2401:c080:1000:2a0e:5400:6ff:fe38:fa1c`
   - `sub.gccwebos.com` -> `2401:c080:1000:2a0e:5400:6ff:fe38:fa1c`
7. Revalidate DNS and direct IPv6 HTTPS after propagation.

## Forbidden Actions

- Do not change A records.
- Do not use or restore `globalcirclecat.*` as a production entry point.
- Do not point `portal.gccwebos.com` or `sub.gccwebos.com` to SGP in this gate.
- Do not alter app code, SQLite schema, payment, account, order, subscription,
  token, edge credential material, Xray, Hysteria2, Mihomo, TUIC, edge-agent,
  or systemd runtime services.
- Do not expose public Admin.
- Do not output raw configs, raw environment, logs, tokens, subscription URLs,
  credentials, private keys, SQLite rows, or customer data.

## Validation

Before DNS:

- `nginx -t` passes.
- Nginx reload succeeds.
- Japan TCP `80` and TCP `443` are listening on IPv6.
- Forced IPv6 HTTPS for `portal.gccwebos.com` to Japan IPv6 returns HTTP 200
  on `/api/health`.
- Forced IPv6 HTTPS for `sub.gccwebos.com` to Japan IPv6 returns HTTP 200 on
  `/api/health`.
- Forced IPv6 public Admin path remains blocked.
- Japan app health remains HTTP 200 locally.
- Public IPv4 checks for `portal.gccwebos.com` and `sub.gccwebos.com` remain
  healthy.
- Public high ports `3456` and `18080` remain closed.

After DNS:

- AAAA records resolve to the Japan IPv6 address above.
- Direct `curl -6` for `portal.gccwebos.com/api/health` returns HTTP 200.
- Direct `curl -6` for `sub.gccwebos.com/api/health` returns HTTP 200.
- IPv4 path remains healthy.
- Public Admin remains blocked.
- Public high ports `3456` and `18080` remain closed.

## Rollback

If Nginx validation fails before DNS:

1. Restore the Nginx site config backup.
2. Run `nginx -t`.
3. Reload Nginx only after the config test passes.
4. Confirm IPv4 portal/subscription health is unchanged.

If validation fails after DNS:

1. Remove the two AAAA records.
2. Restore the Nginx site config backup if the failure is related to Nginx.
3. Run `nginx -t` and reload only after the config test passes.
4. Confirm IPv4 portal/subscription health is unchanged and public high ports
   remain closed.

## Exact Approval Template

```text
批准执行 gccwebos Japan IPv6 HTTPS production gate：
target=Vultr Japan 45.76.222.52 / 2401:c080:1000:2a0e:5400:6ff:fe38:fa1c only；
domains=portal.gccwebos.com,sub.gccwebos.com；
scope=备份 Japan Nginx site config 和只读状态；只给现有 gccwebos Nginx host blocks 添加 IPv6 listen 80/443；nginx -t 通过后 reload Nginx；先做 forced IPv6 HTTPS 验证；验证通过后只添加 portal.gccwebos.com 和 sub.gccwebos.com 的 AAAA 到 Japan IPv6；不改 A 记录；
validation=nginx -t ok, IPv6 80/443 listening, forced IPv6 portal/sub health 200, IPv4 portal/sub health unchanged, public Admin blocked, public 3456/18080 closed, AAAA resolves to Japan IPv6, direct curl -6 portal/sub health 200；
rollback=删除 portal/sub AAAA，恢复 Nginx config 备份，nginx -t 后 reload，确认 IPv4 portal/sub health 保持 200；
forbidden=globalcirclecat production entry, SGP target for portal/sub, A record changes, app/schema/payment/account/order/subscription/token/credential/runtime service changes, public Admin exposure, raw config/env/log/token/subscription URL/credential/private key/SQLite row/customer data output。
```
