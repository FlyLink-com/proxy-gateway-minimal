# Operations Environment Foundation

Current-use guard: this README contains recovery foundations and older
provider-specific examples. Treat provider names, public IPs, service names,
and Shadowsocks examples here as historical or template context unless a
current active runbook and live verification confirm them. Before using this
directory as source material, read `docs/PROJECT_CONTEXT.md`,
`docs/README.md`, and `docs/CURRENT_SOURCE_AND_ARCHIVE_BOUNDARY.md`.

This directory contains the minimum deploy and recovery foundation for the
subscription service. It is intentionally small: the project remains a modular
monolith, SQLite remains the production store, and the admin UI/API are still
operator-only through local access or an SSH tunnel.

Provider-neutral third-node recovery build materials live under
`ops/edge-node/`. They are repo-only materials for the future `prod-edge-c`
slot and do not authorize cloud creation, production mutation, secret copying,
SQLite restore, service start, DNS changes, or traffic cutover by themselves.

## Recoverable Runtime Boundary

Existing subscription refreshes can be restored from:

- Git-tracked application code.
- The SQLite database, normally `.proxy-gateway/subscriptions.sqlite`.
- The deployed `.env`, including `CONSOLE_TOKEN`, `SS_PASSWORD`,
  `PUBLIC_SUBSCRIPTION_BASE_URL`, rate limits, and admin allowlist settings.
- The deployed node config under `config/proxy-servers.json`.
- `proxy-gateway-console.service` and `proxy-gateway-ss.service`.
- `proxy-gateway-public.conf` for Nginx public exposure.

Platform or payment data is not part of the `/sub/clash.yaml` runtime path.

## Deployment Layout

Recommended Linux layout:

```text
/opt/proxy-gateway-minimal/
  .env
  .proxy-gateway/
    subscriptions.sqlite
    backups/
  config/
  server/
  admin/
  ops/
  scripts/
```

Create a dedicated service user:

```bash
sudo useradd --system --home /opt/proxy-gateway-minimal --shell /usr/sbin/nologin proxy-gateway
sudo mkdir -p /opt/proxy-gateway-minimal
sudo chown -R proxy-gateway:proxy-gateway /opt/proxy-gateway-minimal
```

Install runtime dependencies:

```bash
sudo apt-get update
sudo apt-get install -y nodejs npm nginx sqlite3 shadowsocks-libev
```

Clone or update the repository in `/opt/proxy-gateway-minimal`, then install
Node dependencies:

```bash
cd /opt/proxy-gateway-minimal
npm ci
npm run admin:build
```

Create `.env` from `.env.example` and replace placeholder values.

## systemd

Install unit files:

```bash
sudo cp ops/systemd/proxy-gateway-console.service /etc/systemd/system/
sudo cp ops/systemd/proxy-gateway-ss.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now proxy-gateway-console.service
sudo systemctl enable --now proxy-gateway-ss.service
```

The app binds to `127.0.0.1:3456`; public access goes through Nginx.

## Nginx

Install the public gateway template:

```bash
sudo cp ops/nginx/proxy-gateway-public.conf /etc/nginx/sites-available/proxy-gateway-public.conf
sudo ln -sf /etc/nginx/sites-available/proxy-gateway-public.conf /etc/nginx/sites-enabled/proxy-gateway-public.conf
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl enable --now nginx
sudo systemctl reload nginx
```

Public Nginx should expose only:

- `GET /api/health`
- `GET /sub/clash.yaml?token=...`

The admin API and admin UI are not public. Use the local Admin bridge or a raw
SSH tunnel for operator access. The bridge keeps the remote Console Token in the
local proxy process, creates a one-time local browser session, and binds only to
`127.0.0.1`.

```powershell
$env:GCC_ADMIN_SSH_HOST="<operator-approved-host>"
npm run admin:local-proxy:start
```

If `127.0.0.1:5176` or `127.0.0.1:5177` is occupied by a stale bridge session,
stop the tracked local listeners first:

```powershell
npm run admin:local-proxy:stop
```

When SSH is routed through Mihomo/TUN, the start script prints a clear warning
and leaves routing to Clash/Mihomo by default. It only adds a temporary host
route when the operator explicitly passes `-AllowDirectRoute`.

## Environment Roles

Current runtime-lane authority and target selection live in
`docs/RUNTIME_LANE_AUTHORITY.md`. This README does not select a current
production or staging target.

The former AWS `prod-edge-a`, legacy-blue, stopped-instance, and candidate
workflow references are historical provider context only. Do not use their
identifiers or `docs/DEPLOYMENT_FLOW.md` as current target or promotion
instructions. That deployment flow is preserved as historical AWS evidence.

If a future validation task proposes AWS staging, first complete fresh live
read-only inventory and obtain a new exact Risk A gate that selects the target.
Only then may `docs/STAGING_TARGET_DECISION.md` and
`docs/STAGING_PROVISIONING.md` be used for the approved clean-staging scope;
neither document makes an AWS target current by itself.

## Backup And Restore

Create a SQLite backup:

```bash
cd /opt/proxy-gateway-minimal
SUBSCRIPTION_DB_PATH=/opt/proxy-gateway-minimal/.proxy-gateway/subscriptions.sqlite \
  scripts/backup-subscriptions.sh
```

Restore from a backup:

```bash
cd /opt/proxy-gateway-minimal
SUBSCRIPTION_DB_PATH=/opt/proxy-gateway-minimal/.proxy-gateway/subscriptions.sqlite \
  scripts/restore-subscriptions.sh /path/to/subscriptions-backup.sqlite
```

Restore stops `proxy-gateway-console.service`, saves the current database beside
the live database, installs the backup with mode `600`, applies the owner from
the systemd service `User`/`Group`, and starts the service. If a deployment uses
a different service name or needs an explicit owner, set
`SUBSCRIPTION_SERVICE_NAME`, `SUBSCRIPTION_SERVICE_USER`, or
`SUBSCRIPTION_SERVICE_GROUP` for the restore command.

## Verification

After deployment or restore:

```bash
systemctl status proxy-gateway-console.service --no-pager
systemctl status proxy-gateway-ss.service --no-pager
curl -fsS http://127.0.0.1:3456/api/health
curl -i http://127.0.0.1:3456/api/admin/subscriptions
```

From a public network:

```bash
curl -i http://sub.gccwebos.com/api/health
curl -i http://sub.gccwebos.com/api/admin/subscriptions
```

Expected public behavior:

- `/api/health` returns `200`.
- `/api/admin/subscriptions` returns `404`.
- `/sub/clash.yaml?token=<valid-token>` returns `200`.
