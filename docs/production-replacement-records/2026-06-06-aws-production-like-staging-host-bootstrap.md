# AWS Production-Like Staging Host Bootstrap

Date: 2026-06-06, Asia/Shanghai.

Risk: A.

## Scope

Exact-approved Gate 4 host bootstrap for the AWS production-like staging host.

Approved target:

```text
AWS staging host: 54.248.170.34
instance_id: i-08aa4775a099c9a18
release: bdc95d46ae4d
archive_sha256: 5BC1B1B27EC15A3D0C762AF835A08C28A09B92413C7F23F80743FB9F0D107F92
```

This gate installed a production-like but isolated staging runtime using synthetic staging values only. It did not copy or use Vultr production material, Aliyun material, customer data, production secrets, live subscription artifacts, payment material, or real account material.

## Installed Runtime

Installed on the AWS staging host:

- Base packages: `ca-certificates`, `curl`, `git`, `nginx`, `sqlite3`, `ufw`, `jq`, `unzip`, build prerequisites, and Python.
- Node.js: `v22.22.3`.
- npm: `10.9.8`.
- Approved repository artifact unpacked to `/opt/proxy-gateway-minimal-candidate/releases/bdc95d46ae4d`.
- Current release symlink: `/opt/proxy-gateway-minimal-candidate/current`.
- Production-like service user: `proxy-gateway-candidate`.
- Protected synthetic staging environment under `/etc/proxy-gateway-candidate/`.
- Synthetic staging DB/material directories under `/var/lib/proxy-gateway-candidate/`.
- Protected edge backup directory under `/var/backups/gccgw-edge/`.
- Nginx staging server config.
- Mihomo `v1.19.25` compatible linux amd64 binary, verified by the approved upstream sha256.
- `proxy-gateway-candidate.service`.
- `mihomo-tuic.service`.

The protected environment and Mihomo config were not printed or copied into Git.

## Boundary

Configured public staging boundary:

- `GET /api/health` proxies to the loopback app service.
- `/api/portal/*` proxies to the loopback app service and must reject without a session.
- `/sub/a/*` and `/sub/clash.yaml` are available for later synthetic subscription validation.
- `/api/admin/*` is blocked at Nginx.
- `/` returns 404.

No DNS, registrar, Nginx production site, Vultr production, Aliyun runtime, payment, account/password generation, or live order creation was changed.

## Validation

Safe validation results:

```text
artifact_hash: ok
npm_ci: ok
gccgw self check: ok
gccgw install preflight: ok
nginx_config_test: ok
mihomo_config_test: ok
proxy-gateway-candidate.service: active/running, Result=success, NRestarts=0
mihomo-tuic.service: active/running, Result=success, NRestarts=0
nginx.service: active/running, Result=success, NRestarts=0
public /api/health: 200
public /api/admin/platform/health: 404
public /api/portal/access-requests/current: 401
public /: 404
udp443_listeners: 1
tcp80_listeners: 1
tcp3456_listeners: 1
```

The public Admin boundary was validated through Nginx as 404. The loopback app service remains protected by its own auth checks.

## Not Validated Yet

This gate did not validate the full business flow.

Pending Gate 5 items:

- Synthetic initial account import or creation for staging only.
- Synthetic portal login.
- Synthetic order creation.
- Synthetic subscription artifact rendering.
- Controlled TUIC client import/self-test.
- Per-order credential rotation/disable/reconciliation behavior.
- Traffic accounting or quota behavior.

The current TUIC staging service uses synthetic staging material and an IP-based staging strategy. A later validation gate may need a DNS and certificate strategy before client-side tests that require a trusted public certificate chain.

## Rollback Plan

If Gate 4 must be reverted while retaining the EC2 instance for inspection:

```bash
sudo systemctl stop proxy-gateway-candidate.service mihomo-tuic.service nginx.service || true
sudo systemctl disable proxy-gateway-candidate.service mihomo-tuic.service || true
sudo rm -f /etc/systemd/system/proxy-gateway-candidate.service /etc/systemd/system/mihomo-tuic.service
sudo systemctl daemon-reload
sudo rm -f /etc/nginx/sites-enabled/globalcirclecat-staging.conf
sudo rm -f /etc/nginx/sites-available/globalcirclecat-staging.conf
sudo rm -rf /opt/proxy-gateway-minimal-candidate
sudo rm -rf /opt/mihomo
sudo rm -rf /etc/proxy-gateway-candidate
sudo rm -rf /etc/mihomo
sudo rm -rf /var/lib/proxy-gateway-candidate
sudo rm -rf /var/backups/gccgw-edge
```

Full AWS resource cleanup still requires a separate termination approval gate.
