# Operations Environment Foundation

This directory contains the minimum deploy and recovery foundation for the
subscription service. It is intentionally small: the project remains a modular
monolith, SQLite remains the production store, and the admin UI/API are still
operator-only through local access or an SSH tunnel.

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
sudo nginx -t
sudo systemctl reload nginx
```

Public Nginx should expose only:

- `GET /api/health`
- `GET /sub/clash.yaml?token=...`

The admin API and admin UI are not public. Use an SSH tunnel for operator access:

```powershell
ssh -i "$env:USERPROFILE\.ssh\proxy-gateway-aws-sg-20260521.pem" -L 3456:127.0.0.1:3456 ubuntu@47.129.247.102
```

## Environment Roles

The current production node is AWS Singapore `47.129.247.102` (`i-004ab1c6c71d06bca`). It is not a staging target.

Use `docs/DEPLOYMENT_FLOW.md` before promoting a candidate:

- Development happens on local `codex/<task>` or `feat/<feature>` branches.
- Candidate / 待上线 means a reviewed commit selected for AWS validation.
- Staging requires an explicitly assigned non-production AWS instance.
- Production changes require a fresh SQLite backup, service checks, and public endpoint checks.

The stopped `i-0589aac321172dd74` instance is historical until a separate ops change explicitly reassigns and verifies it as staging.

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
curl -i http://47.129.247.102/api/health
curl -i http://47.129.247.102/api/admin/subscriptions
```

Expected public behavior:

- `/api/health` returns `200`.
- `/api/admin/subscriptions` returns `404`.
- `/sub/clash.yaml?token=<valid-token>` returns `200`.
