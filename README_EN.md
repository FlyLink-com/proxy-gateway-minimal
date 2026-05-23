# Proxy Gateway Console

[中文](README.md) | [Documentation index](docs/README.md)

Lightweight proxy gateway console for local proxy forwarding, Clash/Mihomo subscription delivery, and subscription-tenant operations.

> Current network fact: Windows local forwarding and Clash/Mihomo subscription forwarding are different paths. `docs/NETWORK_FORWARDING.md` is the source of truth for network forwarding boundaries.

## Project Purpose

`proxy-gateway-minimal` is a small Node.js gateway that combines:

- Local Windows HTTP-to-SOCKS forwarding through `ss-local`.
- Clash/Mihomo subscription YAML generation at `/sub/clash.yaml`.
- SQLite-backed subscription tenant management.
- A local or SSH-tunneled Admin Console Shell for operators.
- Production runbooks for systemd, Nginx, SQLite backup/restore, staging, and manual CI validation.

It is intentionally not a Kubernetes, Docker Compose, Terraform, or automatic CD system.

## Network Topology

Windows local forwarding:

```text
Windows app / WinINet / PAC / HTTP_PROXY / HTTPS_PROXY
        ↓
127.0.0.1:18180 Node HTTP-to-SOCKS bridge
        ↓
127.0.0.1:1080 ss-local SOCKS5
        ↓
Remote Shadowsocks server
```

ALL_PROXY-aware local apps:

```text
Application
        ↓
127.0.0.1:1080 ss-local SOCKS5
        ↓
Remote Shadowsocks server
```

Clash/Mihomo subscription forwarding:

```text
Clash / Mihomo
        ↓
GET /sub/clash.yaml?token=...
        ↓
Receives Shadowsocks YAML
        ↓
Connects directly to the remote Shadowsocks server
```

In subscription mode, `proxy-gateway-minimal` is a subscription generator and access controller. After the client receives the YAML, Clash/Mihomo connects directly to the remote Shadowsocks node; it does not use local `127.0.0.1:18180` or `127.0.0.1:1080`.

## Ports

| Port | Service | Purpose |
|------|---------|---------|
| 3456 | Console API | Web console, REST API, PAC file, subscription endpoint |
| 1080 | SOCKS5 | Local `ss-local` listener |
| 18180 | HTTP Proxy | Local HTTP-to-SOCKS bridge |

`CONSOLE_PORT` affects only the Node runtime. The Windows proxy scripts currently assume the default local ports `3456` / `1080` / `18180`; changing `CONSOLE_PORT` does not automatically reconfigure `scripts/proxy.ps1`, `scripts/network-doctor.ps1`, or the PAC URL.

## Quick Start

Install dependencies:

```bash
npm install
```

Create local configuration:

```bash
cp .env.example .env
```

Minimum `.env`:

```text
SS_PASSWORD=your_shadowsocks_password_here
```

Optional values:

```text
CONSOLE_PORT=3456
CONSOLE_TOKEN=your-fixed-console-token
```

Start the service:

```bash
npm run daemon
```

Alternative local starts:

```bash
npm run server
npm run cli
```

Open the local console at:

```text
http://127.0.0.1:3456/
```

The first start creates `.proxy-gateway/console-token` and reuses it on later starts unless `CONSOLE_TOKEN` is provided.

## Admin Console Shell

The operator Admin Console Shell lives in `admin/` and is a Vite React app on top of the real `/api/admin/*` backend APIs.

```bash
npm install --prefix admin
npm run admin:dev
npm run admin:build
npm run admin:test
```

In Vite dev mode, leave the API base URL blank and expose a local backend or SSH tunnel at `127.0.0.1:3456`; the Vite dev server proxies same-origin `/api` requests to that backend.

The Admin Console Shell includes:

- Connection health diagnostics.
- Confirmation dialogs for sensitive subscription actions.
- Visible-once generated subscription URLs after create, reset-token, or temporary-link operations.

Do not expose the Admin Console Shell through the public Nginx gateway. Production public access should continue to allow only `/api/health` and `/sub/clash.yaml`.

## Orchestration Model

The project uses lightweight human-gated orchestration:

- The Windows local checkout is used for development, testing, Admin UI operation, and SSH tunnel workflows.
- GitHub `master` is the stable integration baseline.
- Work enters through short-lived `codex/*`, `feat/*`, `fix/*`, `test/*`, `refactor/*`, `ops/*`, or `docs/*` branches.
- GitHub Actions provides repository-level validation when hosted runners are available.
- While GitHub-hosted Actions is blocked by billing or spending limits, use `docs/CI_MANUAL_VALIDATION.md` for temporary clean-server CI-equivalent validation.
- Staging is not created automatically.
- Production is not deployed automatically.

Manual CI validation is not staging, not production approval, not a self-hosted runner, and not deploy approval.

## Subscription Admin Core

The Subscription Admin Core stores tenants in SQLite and generates tenant-scoped Clash/Mihomo subscription URLs.

Default database path:

```text
.proxy-gateway/subscriptions.sqlite
```

Key environment variables:

| Variable | Purpose |
|----------|---------|
| `SUBSCRIPTION_DB_PATH` | Custom SQLite database path |
| `PUBLIC_SUBSCRIPTION_BASE_URL` | Public base URL used in generated subscription URLs |
| `SUBSCRIPTION_EXPIRING_DAYS` | Expiring-window size, default `7` days |
| `SUBSCRIPTION_TEMP_LINK_TTL_MINUTES` | Temporary subscription-link lifetime, default `1440` minutes |
| `SUB_RATE_LIMIT_WINDOW_MS` | `/sub` rate-limit window, default `60000` ms |
| `SUB_RATE_LIMIT_MAX` | `/sub` requests per client IP per window, default `30` |
| `ADMIN_ALLOWED_CIDRS` | Admin source-IP allowlist, default loopback and RFC1918 private ranges |

Admin API calls use `Authorization: Bearer <console-token>`. Protected `/api/*` routes do not accept console tokens in query strings.

`/sub/clash.yaml` keeps query-token support for Clash/Mihomo subscription clients. Primary subscription tokens use `pgsub_`; temporary subscription tokens use `pgtmp_`. Raw subscription tokens are visible once and stored as hashes.

Subscription expiry is enforced when a token is resolved: expired tenants receive `403` on `/sub/clash.yaml` even if their stored status remains `active`. The stored `disabled` status is reserved for operator-driven disable actions.

## Proxy Modes

| Mode | Command | Purpose |
|------|---------|---------|
| Global | `npm run proxy:on` | Route traffic through `127.0.0.1:18180` |
| PAC | `npm run proxy:pac` | Use PAC rules for direct/proxy split |
| Off | `npm run proxy:off` | Disable the Windows system proxy |
| Status | `npm run proxy:status` | Show current Windows proxy settings |

## Windows Network Diagnostics

```powershell
npm run network:status
npm run network:repair
npm run network:reset
```

`network-doctor.ps1` reads `CONSOLE_TOKEN` only from the process environment or `.proxy-gateway/console-token`. It does not read `.env` by default.

## API Endpoint Summary

Public and subscription endpoints:

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/health` | Public health check |
| GET | `/sub/clash.yaml` | Clash/Mihomo subscription YAML |

Local/protected control endpoints:

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/subscription/status` | Subscription URL and node count |
| POST | `/api/ss/start` | Start local `ss-local` |
| POST | `/api/ss/stop` | Stop local `ss-local` |
| POST | `/api/proxy/start` | Start the local proxy stack |
| POST | `/api/proxy/stop` | Stop the local proxy stack |
| GET | `/api/status` | Aggregate status |
| GET | `/api/network/status` | Windows proxy-stack diagnostics |
| POST | `/api/network/repair` | Start and repair local proxy ownership |
| POST | `/api/network/reset` | Clear proxy settings written by this project |

Admin subscription endpoints:

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/admin/subscriptions` | List tenants |
| POST | `/api/admin/subscriptions` | Create a tenant and visible-once subscription URL |
| GET | `/api/admin/subscriptions/:id` | Read one tenant |
| PATCH | `/api/admin/subscriptions/:id` | Update tenant expiry |
| POST | `/api/admin/subscriptions/:id/renew` | Renew a tenant |
| POST | `/api/admin/subscriptions/:id/disable` | Disable a tenant |
| POST | `/api/admin/subscriptions/:id/enable` | Enable a tenant |
| POST | `/api/admin/subscriptions/:id/reset-token` | Reset a tenant token and return a new visible-once URL |
| POST | `/api/admin/subscriptions/:id/temp-link` | Create a temporary subscription URL |
| POST | `/api/admin/subscriptions/:id/node` | Reassign a tenant to a configured node |
| GET | `/api/admin/nodes` | List assignable nodes |
| GET | `/api/admin/overview` | Tenant and node overview |

Tenant node assignment is an operator-only maintenance and canary mechanism. It does not change tenant tokens or subscription URLs. Tenant creation may include `nodeId`; when omitted, the backend keeps using the first configured named node. `POST /api/admin/subscriptions/:id/node` accepts either a node `id` or `name` and only affects that tenant's future `/sub/clash.yaml` output. Adding a second production node to `config/proxy-servers.json`, migrating production tenant assignments, or making production subscriptions emit a new node remains Risk A production node-config work with a separate gate.

## Validation And CI

Standard repository validation:

```bash
npm test
npm run admin:test
npm run admin:build
```

While GitHub-hosted Actions is blocked by billing or spending-limit issues, `docs/CI_MANUAL_VALIDATION.md` defines the temporary clean-server CI-equivalent path:

```bash
npm ci
npm ci --prefix admin
npm test
npm run admin:test
npm run admin:build
```

For docs-only changes, `git diff --check origin/master...HEAD` is usually enough.

## Source-Of-Truth Docs

Start with `docs/README.md` for the documentation index. It classifies current state docs, active runbooks, execution records, paused docs, and historical specs/plans.

Use `docs/PROJECT_CONTEXT.md` for the current handoff state. Use the relevant active runbook before production, AWS, DNS, Nginx, HTTPS, staging, deployment, rollback, or node work.

Do not commit secrets, console tokens, subscription URLs with real tokens, SQLite data, AWS credentials, or customer data.
