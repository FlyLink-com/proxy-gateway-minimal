# Deployment Flow

Last updated: 2026-05-23, Asia/Shanghai.

This document defines how code moves from local development to a staging or pre-release check and then to the production AWS node. It keeps GitHub, Codex, and AWS responsibilities separate.

## Current Live Snapshot

Verified read-only on 2026-05-23 Asia/Shanghai.

| Area | Current fact |
| --- | --- |
| AWS account | `580857941765` |
| AWS region | `ap-southeast-1` for the Singapore proxy nodes |
| Production instance | `i-004ab1c6c71d06bca` |
| Production name | `proxy-gateway-node-sg-blue-20260521` |
| Production public IP | `47.129.247.102` |
| Production private IP | `172.31.26.232` |
| Production state | `running` |
| Production instance type | `t4g.small` |
| Production security group | `sg-04a165ec77f430ee8` |
| Production runtime path | `/opt/proxy-gateway-minimal` |
| Historical stopped instance | `i-0589aac321172dd74`, no public IP, `stopped` |
| Staging instance | Not assigned |

`47.129.247.102` was not returned by `describe-addresses`, so it is not currently documented as an Elastic IP allocation. Do not stop the production instance unless an IP change is acceptable or an Elastic IP migration plan is prepared first.

## Environment Roles

| Environment | Purpose | Source of truth | AWS target |
| --- | --- | --- | --- |
| Development | Local implementation and tests | Local task branch from `master` | None |
| Candidate / 待上线 | A commit selected for pre-release validation | GitHub branch or PR commit | None until deployed to staging |
| Staging | AWS validation without touching production users | Recorded candidate commit | Dedicated staging instance only |
| Production | In-use subscription service | Verified production commit plus runtime config | `i-004ab1c6c71d06bca` |
| Historical | For archaeology only | Old snapshots and stopped nodes | `i-0589aac321172dd74` is not staging |

The stopped `proxy-gateway-aws-sg` instance must not be treated as staging just because it exists. If it is reused, first make a separate ops change that records the intent, tags it as staging, verifies its disk/runtime state, and confirms no production data or tokens will be reused.

The staging target decision is recorded in `docs/STAGING_TARGET_DECISION.md`. Current recommendation: create a clean, explicitly tagged staging instance when staging is needed; do not start the stopped historical instance as-is.

## Branch Flow

Use this flow for normal work:

```text
master -> codex/<task> or feat/<feature> -> PR -> master -> staging candidate -> production
```

Rules:

- `master` is the stable integrated baseline.
- `codex/<task>` and `feat/<feature>` branches are not deployment targets.
- `release/<date-or-topic>` may be used when a candidate needs several commits or staged fixes.
- `deploy/staging` may be introduced only if there is a standing staging AWS target.
- Production deploys should reference an exact commit SHA, not only a branch name.

## Staging Target Requirements

Before calling any AWS node staging, record these facts in `docs/ENVIRONMENT_TOPOLOGY.md`:

| Required field | Rule |
| --- | --- |
| Instance ID | Must be explicit. |
| Public IP or DNS | Must be explicit if public endpoint tests are required. |
| Security group | Must be listed with expected ports. |
| Runtime path | Usually `/opt/proxy-gateway-minimal`, but record the actual path. |
| Git commit | Exact candidate SHA deployed to staging. |
| Data boundary | Use staging `.env` and staging SQLite data. Do not copy production tokens or subscription URLs. |
| Tags | Use `Project=proxy-gateway-minimal`, `Environment=staging`, and `Role=pre-release`. |

Recommended staging public behavior should match production gateway rules:

```text
/api/health -> 200
/api/admin/subscriptions -> 404
/sub/clash.yaml without token -> 401
/ -> 404
/index.html -> 404
```

The admin API should be tested through SSH tunnel or loopback only.

## Current Production Network Boundary

Production security group `sg-04a165ec77f430ee8` currently permits:

| Port | Protocol | Source | Purpose |
| --- | --- | --- | --- |
| `22` | TCP | `36.163.181.255/32` | SSH operator access |
| `80` | TCP | `0.0.0.0/0` | Public Nginx gateway |
| `443` | TCP | `0.0.0.0/0` | Allowed by SG, but HTTPS was not active in runtime verification |
| `18388` | TCP/UDP | `0.0.0.0/0` | Shadowsocks node |

Runtime listeners verified on production:

| Address | Port | Process role |
| --- | --- | --- |
| `0.0.0.0` | `80` | Nginx public gateway |
| `0.0.0.0` | `18388` | Shadowsocks server |
| `127.0.0.1` | `3456` | Proxy gateway console/API |
| `127.0.0.1` | `18180` | Local HTTP proxy |

HTTPS to `https://47.129.247.102/api/health` did not establish during this check. Keep the domain HTTPS plan paused unless explicitly resumed.

## Deployment Checklist

### 1. Local Development

```powershell
git status --short --branch
npm test
npm run admin:test
npm run admin:build
```

Expected:

```text
working tree clean before PR
server tests pass
admin tests pass
admin build passes
```

### 2. Candidate Selection

Record:

- GitHub PR number.
- Commit SHA.
- Whether the candidate needs AWS staging.
- The exact validation commands already run locally.

Do not change AWS during candidate selection.

### 3. Staging Verification

Only after a staging target is assigned:

```bash
systemctl is-active proxy-gateway-console.service proxy-gateway-ss.service nginx
ss -lntup
curl -i http://127.0.0.1:3456/api/health
curl -i http://127.0.0.1:3456/api/admin/subscriptions
curl -i http://<staging-public-ip>/api/health
curl -i http://<staging-public-ip>/api/admin/subscriptions
curl -i http://<staging-public-ip>/sub/clash.yaml
```

Expected public results:

```text
/api/health -> 200
/api/admin/subscriptions -> 404
/sub/clash.yaml without token -> 401
```

### 4. Production Promotion

Before touching production:

```bash
cd /opt/proxy-gateway-minimal
scripts/backup-subscriptions.sh
sqlite3 /opt/proxy-gateway-minimal/data/subscriptions.sqlite "pragma integrity_check;"
```

Promotion must preserve:

- Production `.env`.
- Production SQLite database.
- Production node config unless the change explicitly includes node config.
- Nginx public block for admin UI and admin API.

After promotion:

```bash
systemctl is-active proxy-gateway-console.service proxy-gateway-ss.service nginx
curl -i http://127.0.0.1:3456/api/health
curl -i http://47.129.247.102/api/health
curl -i http://47.129.247.102/api/admin/subscriptions
curl -i http://47.129.247.102/sub/clash.yaml
```

Expected production public results:

```text
/api/health -> 200
/api/admin/subscriptions -> 404
/sub/clash.yaml without token -> 401
```

### 5. Rollback

Rollback is a production operation. Use the latest verified SQLite backup and the previous known-good runtime files.

```bash
cd /opt/proxy-gateway-minimal
SUBSCRIPTION_DB_PATH=/opt/proxy-gateway-minimal/data/subscriptions.sqlite \
  scripts/restore-subscriptions.sh /path/to/verified-backup.sqlite
systemctl is-active proxy-gateway-console.service proxy-gateway-ss.service nginx
```

Then rerun the production public checks.

## Documentation Update Rule

Every staging or production operation should update `docs/PROJECT_CONTEXT.md` with:

- Date and timezone.
- Branch or commit deployed.
- AWS target.
- Whether services were restarted.
- Verification commands and results.

If an AWS tag, security group, IP, or runtime path changes, update `docs/ENVIRONMENT_TOPOLOGY.md` in the same PR.
