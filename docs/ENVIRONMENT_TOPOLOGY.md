# Environment Topology

Last updated: 2026-05-23, Asia/Shanghai.

This document defines the operating map for the subscription management project. Use it to avoid mixing local Codex projects, historical repository copies, GitHub branches, and AWS runtime directories.

## Source Of Truth

The source of truth for code is:

```text
GitHub: gaoyi1020-web/proxy-gateway-minimal
Default branch: master
Local active checkout: C:\Users\g\Projects\订阅管理\proxy-gateway-minimal
```

`master` is the integrated stable baseline. Development starts from `master` on a task branch and returns to `master` through a pull request.

## Local Directories

| Path | Role | Policy |
| --- | --- | --- |
| `C:\Users\g\Projects\订阅管理\proxy-gateway-minimal` | Active local checkout | Use for all ongoing Codex and local development. |
| `C:\Users\g\WorkBuddy\2026-05-20-18-07-31\proxy-gateway-minimal` | Historical original checkout | Do not develop here. Keep only for history lookup until archived. |
| `C:\Users\g\OneDrive\文档\订阅管理` | Empty legacy Codex project shell | Do not use as a code repository. It has no commits and no project code. |

Before changing the project, verify:

```powershell
git -C C:\Users\g\Projects\订阅管理\proxy-gateway-minimal status --short --branch
git -C C:\Users\g\Projects\订阅管理\proxy-gateway-minimal rev-parse HEAD
```

## Branch Model

| Branch pattern | Purpose | Deployment status |
| --- | --- | --- |
| `master` | Stable integrated code line and production baseline | Deployable after verification. |
| `codex/<task>` | Codex local/worktree task branches | Not deployable until reviewed and merged. |
| `feat/<feature>` | Larger feature branches | Not deployable until reviewed and merged. |
| `ops/<topic>` | Infrastructure, deployment, recovery, or environment changes | Deployable only after ops verification. |
| `ops/domain-https` | Paused historical domain HTTPS plan | Preserve, but do not use unless domain plan is explicitly resumed. |
| `release/<date-or-topic>` or `deploy/staging` | Optional pre-release candidate when a separate staging line is needed | Staging only; promote after verification. |

The normal flow is:

```text
master -> codex/<task> or feat/<feature> -> PR -> master -> staging verification -> production deployment
```

If a change needs AWS testing before production, create or designate a staging deployment target and record the exact commit, branch, and verification result before touching production.

## AWS Runtime Roles

Current AWS Singapore inventory, verified on 2026-05-23:

| Role | Instance | Public IP | State | Notes |
| --- | --- | --- | --- | --- |
| Production blue | `i-004ab1c6c71d06bca` | `47.129.247.102` | `running` | Current in-use subscription node. |
| Historical stopped node | `i-0589aac321172dd74` | none | `stopped` | Old proxy-gateway node; do not treat as staging without explicit assignment. |
| Staging / pre-release | TBD | TBD | TBD | Create or assign before testing deployment candidates. |

Production runtime path:

```text
/opt/proxy-gateway-minimal
```

The production directory is an operational runtime directory. Do not assume it is a Git checkout or a byte-for-byte copy of `master`. Verify production by service status, file presence, database health, and endpoint behavior.

## Deployment States

Use these terms consistently:

| State | Meaning |
| --- | --- |
| Development | Local task branch or Codex worktree. Not deployed. |
| Candidate / 待上线 | A reviewed commit or branch selected for staging verification. |
| Staging | Candidate deployed to a non-production AWS target for endpoint and service checks. |
| Production | Verified code/config deployed to the in-use AWS node. |

Minimum production checks:

```powershell
curl -i http://47.129.247.102/api/health
curl -i http://47.129.247.102/api/admin/subscriptions
curl -i http://47.129.247.102/sub/clash.yaml
```

Expected public behavior:

```text
/api/health -> 200
/api/admin/subscriptions -> 404
/sub/clash.yaml without token -> 401
```

## Codex Alignment

Codex app local environment configuration lives under:

```text
.codex/
```

The Codex app may generate files in this folder from the Environment settings UI. These project-level files are part of the project alignment when they contain no secrets.

Current local environment name:

```text
订阅管理
```

Recommended setup script for a future Codex worktree environment:

```powershell
Set-Location $env:CODEX_WORKTREE_PATH
npm ci
npm ci --prefix admin
```

Recommended quick actions:

```powershell
npm test
npm run admin:test
npm run admin:build
```

Do not store production tokens, subscription URLs, SSH keys, or `.env` values in `.codex/`.

## GitHub And AWS Verification

GitHub:

```powershell
git remote -v
gh repo view gaoyi1020-web/proxy-gateway-minimal --json nameWithOwner,visibility,defaultBranchRef,pushedAt,isPrivate
gh pr list --repo gaoyi1020-web/proxy-gateway-minimal --state open
```

AWS:

```powershell
$env:HTTP_PROXY=$null; $env:HTTPS_PROXY=$null; $env:ALL_PROXY=$null
$env:http_proxy=$null; $env:https_proxy=$null; $env:all_proxy=$null
aws ec2 describe-instances --region ap-southeast-1 --filters Name=instance-state-name,Values=running,stopped --query "Reservations[].Instances[].{InstanceId:InstanceId,State:State.Name,PublicIp:PublicIpAddress,Name:Tags[?Key=='Name']|[0].Value,Project:Tags[?Key=='Project']|[0].Value,Purpose:Tags[?Key=='Purpose']|[0].Value}" --output table
```

