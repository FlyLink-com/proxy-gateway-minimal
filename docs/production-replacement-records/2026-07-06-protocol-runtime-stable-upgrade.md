# Protocol Runtime Stable Upgrade

Date: 2026-07-06.

Risk tier: A production runtime upgrade.

Targets:

- Vultr Japan control plane: `45.76.222.52`
- Vultr Singapore data plane: `45.76.158.201`

This record contains only redacted operational facts. It does not contain raw
environment values, raw runtime config, raw logs, SQLite rows, account
credentials, subscription URLs, tokens, passwords, private keys, runtime
credential material, or customer data.

## Approval

The operator approved a stable protocol runtime upgrade with this scope:

- back up current Hysteria2 and Mihomo binaries plus related systemd service
  state;
- upgrade Hysteria2 to `app/v2.9.3`;
- upgrade Mihomo to `v1.19.27`;
- do not upgrade Xray prerelease builds;
- do not change DNS, Nginx, firewall, schema, payment, account, order,
  subscription, or token state;
- Japan: restart `hysteria2` only and keep `mihomo-tuic` inactive;
- SGP: restart `hysteria2` and `mihomo-tuic`;
- do not restart Xray or edge-agent services.

Rollback approved: restore the backed-up binaries, restart affected services,
and rerun the same validation checks.

## Read-Only Inventory

Before mutation:

- Japan host: `gccgw-vultr-candidate`;
- Japan current release:
  `/opt/proxy-gateway-minimal-candidate/releases/japan-sgp-vless-host-unify-20260622-001`;
- Japan `proxy-gateway-candidate.service`: active;
- Japan `nginx`: active;
- Japan `xray-vless-reality.service`: active;
- Japan `hysteria2.service`: active;
- Japan `mihomo-tuic.service`: inactive;
- Japan local `/api/health`: HTTP 200;
- SGP host: `gccgw-sgp-small-portal-20260608-002`;
- SGP `gccgw-edge-agent.service`: active;
- SGP `xray-vless-reality.service`: active;
- SGP `hysteria2.service`: active;
- SGP `mihomo-tuic.service`: active.

Version baseline:

- Japan Xray: `26.3.27`;
- Japan Hysteria2: `v2.9.2`;
- Japan Mihomo: `v1.19.25`;
- SGP Xray: `26.3.27`;
- SGP Hysteria2: `v2.9.2`;
- SGP Mihomo: `v1.19.25`.

Dry-run/config checks before mutation:

- Japan Xray config test: OK;
- Japan Mihomo config test: OK;
- SGP Xray config test: OK;
- SGP Mihomo config test: OK;
- Hysteria2 CLI has no separate config-check flag; validation is backup,
  controlled restart, and service/listener health checks.

## Source Assets

Official release metadata was checked before execution:

- Xray latest visible release `v26.6.27` was marked prerelease and was not
  installed;
- Hysteria2 official stable release `app/v2.9.3` was selected;
- Mihomo official stable release `v1.19.27` was selected;
- TUIC server latest official release remained `tuic-server-1.0.0`; production
  TUIC service here is provided by Mihomo, not standalone `tuic-server`.

Selected assets:

- `hysteria-linux-amd64`
  - SHA256:
    `66dbdb0608f25f3057b433afe975a9fc1af2ca8e512479e294988b3ef363d6c1`
- `mihomo-linux-amd64-v1.19.27.gz`
  - SHA256:
    `fb3e34c55844f389ff54679e5a3aec331d5ec38006c20f8dcc476fb47768a58f`

The generic amd64 assets were used. AVX and microarchitecture-specific Mihomo
variants were not used.

## Backup

Backups were created on both hosts:

- Japan:
  `/root/gccgw-runtime-backups/protocol-runtime-stable-20260706-001`
- SGP:
  `/root/gccgw-runtime-backups/protocol-runtime-stable-20260706-001`

Each backup directory contains the previous Hysteria2 and Mihomo binaries,
SHA256 sums, version outputs, Mihomo config-test output, and systemd service
state snapshots.

## Change Executed

Japan:

- installed Hysteria2 `v2.9.3` to `/opt/hysteria/bin/hysteria`;
- installed Mihomo `v1.19.27` to `/opt/mihomo/bin/mihomo`;
- reran Mihomo config test successfully with the upgraded binary;
- restarted `hysteria2.service`;
- kept `mihomo-tuic.service` inactive.

SGP:

- installed Hysteria2 `v2.9.3` to `/usr/local/bin/hysteria`;
- installed Mihomo `v1.19.27` to `/opt/mihomo/bin/mihomo`;
- reran Mihomo config test successfully with the upgraded binary;
- restarted `hysteria2.service`;
- restarted `mihomo-tuic.service`.

No DNS, Nginx, firewall, schema, payment, account, order, subscription, token,
Xray, edge-agent, raw config, raw env, raw log, or database row action was
performed.

## Validation

Post-upgrade validation:

- Japan Hysteria2 version: `v2.9.3`;
- Japan Mihomo version: `v1.19.27`;
- Japan Xray version remained `26.3.27`;
- Japan `hysteria2.service`: active;
- Japan `mihomo-tuic.service`: inactive;
- Japan `xray-vless-reality.service`: active;
- Japan `proxy-gateway-candidate.service`: active;
- Japan local `/api/health`: HTTP 200;
- Japan Mihomo config test: OK;
- SGP Hysteria2 version: `v2.9.3`;
- SGP Mihomo version: `v1.19.27`;
- SGP Xray version remained `26.3.27`;
- SGP `gccgw-edge-agent.service`: active;
- SGP `xray-vless-reality.service`: active;
- SGP `hysteria2.service`: active;
- SGP `mihomo-tuic.service`: active;
- SGP Mihomo config test: OK;
- SGP TCP `8443` listener: present;
- SGP UDP `10443` listener: present;
- SGP UDP `443` listener: present;
- public `https://globalcirclecat.cloud/api/health`: HTTP 200;
- public `https://sub.globalcirclecat.cloud/api/health`: HTTP 200;
- retired portal host health path remained HTTP 410;
- public `globalcirclecat.cloud:3456`: closed;
- public `globalcirclecat.cloud:18080`: closed.

Some local wrapper commands had Windows CRLF quoting artifacts while printing
validation summaries. The affected listener and version checks were rerun with
narrower commands and passed as recorded above.

## Rollback

Rollback remains available from:

- Japan:
  `/root/gccgw-runtime-backups/protocol-runtime-stable-20260706-001`
- SGP:
  `/root/gccgw-runtime-backups/protocol-runtime-stable-20260706-001`

Rollback steps:

1. Restore `hysteria.before` and `mihomo.before` from the host backup
   directory to the service binary paths recorded above.
2. Restart affected services:
   - Japan: `hysteria2.service`;
   - SGP: `hysteria2.service` and `mihomo-tuic.service`.
3. Revalidate versions, service states, SGP listeners, Japan health, public
   health, and public high-port closure.

## Outcome

The approved stable protocol runtime upgrade completed successfully.

Hysteria2 and Mihomo are upgraded on Japan and SGP. Xray prerelease builds were
not installed. Japan `mihomo-tuic.service` remains inactive as approved. SGP
runtime listeners and public control-plane boundaries validated successfully.
