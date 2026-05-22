# Environment Foundation Design

## Goal

Add a minimal, Git-tracked operations foundation for restoring and running the subscription service without depending on chat history or ignored local files.

This phase does not change production automatically. It records the deployable runtime boundary as templates, scripts, and documentation so the current AWS node or a replacement node can be rebuilt from the repository plus secrets and backups.

## Non-Goals

- Do not add Docker, Terraform, Ansible, or GitHub Actions in this phase.
- Do not migrate away from SQLite.
- Do not expose the admin API or admin UI publicly.
- Do not modify the live AWS server from this branch.
- Do not commit secrets, generated databases, keys, or real subscription URLs.

## Target Files

- `.env.example`: production subscription runtime variables.
- `ops/systemd/proxy-gateway-console.service`: Node app service template.
- `ops/systemd/proxy-gateway-ss.service`: Shadowsocks server service template.
- `ops/nginx/proxy-gateway-public.conf`: public gateway template.
- `ops/README.md`: deploy, recovery, tunnel, and verification runbook.
- `scripts/backup-subscriptions.sh`: SQLite online backup script.
- `scripts/restore-subscriptions.sh`: SQLite restore script with service stop/start.
- `server/tests/environment-foundation.test.mjs`: repository-level contract tests for the environment foundation.

## Runtime Boundary

The recoverable subscription service consists of:

- Git-tracked application code.
- `.env` values.
- `config/proxy-servers.json`.
- `.proxy-gateway/subscriptions.sqlite`.
- systemd service files.
- Nginx public path rules.

Future platform or payment state is not a dependency of `/sub/clash.yaml`.

## Public Gateway Boundary

The Nginx template exposes only:

- `GET /api/health`
- `GET /sub/clash.yaml?token=...`

All other public paths return `404`, including `/api/admin/*` and the admin UI. Admin access remains local or via SSH tunnel.

## Backup And Restore

`scripts/backup-subscriptions.sh` uses SQLite `.backup` to avoid copying a live database unsafely.

`scripts/restore-subscriptions.sh` stops the app service, saves the current database beside the live database, installs the selected backup with mode `600`, fixes ownership, and starts the app service again.

## Verification

Local verification:

```powershell
npm test
npm run admin:test
npm run admin:build
```

Operational verification after manual deployment:

```bash
systemctl status proxy-gateway-console.service --no-pager
systemctl status proxy-gateway-ss.service --no-pager
curl -fsS http://127.0.0.1:3456/api/health
curl -i http://PUBLIC_IP/api/admin/subscriptions
```
