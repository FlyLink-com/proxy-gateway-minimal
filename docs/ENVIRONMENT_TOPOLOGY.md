# Environment Topology

Last updated: 2026-07-11, America/Los_Angeles.

This document defines the operating map for the subscription management
project. Use it to avoid mixing local Codex projects, historical repository
copies, GitHub branches, Cloudflare public-site builds, Vultr production
runtime, AWS staging/DR, and archived runtime records.

This document is an orientation aid only. It does not authorize production,
DNS, Nginx, systemd, provider firewall, runtime config, database, account,
subscription, token, credential, or customer-data actions.

## Source Of Truth

The source of truth for code is:

```text
GitHub: gaoyi1020-web/proxy-gateway-minimal
Default branch: master
Local active checkout: D:\Projects\proxy-gateway-minimal
```

`master` is the integrated stable baseline. It is not automatically the live
production runtime. Development starts from `master` on a task branch and
returns to `master` through a pull request.

## Local Directories

| Path | Role | Policy |
| --- | --- | --- |
| `D:\Projects\proxy-gateway-minimal` | Active local checkout | Use for all ongoing Codex and local development. |
| `C:\Users\g\Projects\订阅管理\proxy-gateway-minimal` | Pre-D-drive migration checkout | Do not use as the default working tree. Keep only for history lookup until archived. |
| `C:\Users\g\WorkBuddy\2026-05-20-18-07-31\proxy-gateway-minimal` | Historical original checkout | Do not develop here. Keep only for history lookup until archived. |
| `C:\Users\g\OneDrive\文档\订阅管理` | Empty legacy Codex project shell | Do not use as a code repository. It has no commits and no project code. |

Before changing the project, verify:

```powershell
git -C D:\Projects\proxy-gateway-minimal status --short --branch
git -C D:\Projects\proxy-gateway-minimal rev-parse HEAD
```

## Branch Model

| Branch pattern | Purpose | Deployment status |
| --- | --- | --- |
| `master` | Stable integrated code line and production baseline | Deployable only after verification and a separate Risk A promotion gate. |
| `codex/<task>` | Codex local/worktree task branches | Not deployable until reviewed and merged. |
| `feat/<feature>` | Larger feature branches | Not deployable until reviewed and merged. |
| `ops/<topic>` | Infrastructure, deployment, recovery, or environment changes | Deployable only after ops verification. |
| `ops/domain-https` | Paused historical domain HTTPS plan | Preserve, but do not use unless domain plan is explicitly resumed. |
| `release/<date-or-topic>` or `deploy/staging` | Optional pre-release candidate when a separate staging line is needed | Staging only; promote after verification. |

The normal source flow is:

```text
master -> codex/<task> or feat/<feature> -> PR -> master -> staging verification -> production deployment gate
```

If a change needs runtime testing before production, create or designate a
non-production staging target and record the exact commit, branch, artifact, and
verification result before touching production. AWS is currently a staging/DR
surface, not the main production authority.

## Current Production Roles

Point-in-time documented production posture as of 2026-06-09. Verify live DNS,
provider firewall, Nginx, systemd, runtime configs, endpoints, and SQLite state
before any Risk A action.

| Surface | Current role | Authority boundary |
| --- | --- | --- |
| Vultr Japan | Main production control plane for the `gccwebos.com` lane. | Owns accounts, user portal orders, subscription rendering, credential lifecycle orchestration, Admin/operator API, and usage ledger authority. |
| Vultr Japan data plane | Production data-plane capacity on the same provider lane. | Owns protocol runtime capacity only; it must not become an independent customer/order database. |
| Vultr Singapore | Additional production data-plane capacity connected through Japan control-plane handoff/apply. | Owns protocol runtime capacity only; it must not issue accounts, orders, package limits, or independent portal state. |
| Cloudflare | DNS, optional static public-site hosting, cache/CDN edge, and Workers Builds validation for `admin/dist-site`. | Must not host the Express/SQLite control plane, Admin API, User Portal API, subscription issuance, payment, runtime adapters, or credentials. |
| AWS | Staging, proof, validation, and future DR/migration option. | Not current main production; do not treat old AWS records or stopped nodes as active production without fresh live inventory and Risk A approval. |

## Current Production Data-Plane Channels

The documented current bundle direction is Vultr Japan + Vultr Singapore as one
subscription bundle when channel config, credential fan-out, runtime handoff,
and render proof are aligned:

| Channel | Provider / host role | Protocol family |
| --- | --- | --- |
| `channel-vultr-a-vless-reality-tcp` | Vultr Japan data plane | VLESS Reality over TCP |
| `channel-vultr-a-hy2` | Vultr Japan data plane | Hysteria2 over UDP |
| `channel-vultr-a-tuic` | Vultr Japan data plane | TUIC over UDP |
| `channel-sgp-a-vless-reality-tcp` | Vultr Singapore data plane | VLESS Reality over TCP |
| `channel-sgp-a-hy2` | Vultr Singapore data plane | Hysteria2 over UDP |
| `channel-sgp-a-tuic` | Vultr Singapore data plane | TUIC over UDP |

Do not mark these channels as production-ready based on template rendering
alone. Runtime listener state, provider firewall, credential counts, client
import behavior, mobile/desktop smoke, and order-owned usage mapping remain
separate validation facts.

## Runtime Paths

Production runtime directories are operational deployment directories. Do not
assume they are Git checkouts or byte-for-byte copies of `master`. Verify
production by service status, release symlink, file presence, database health,
endpoint behavior, and redacted execution records.

| Surface | Path shape | Notes |
| --- | --- | --- |
| Vultr Japan control plane | `/opt/proxy-gateway-minimal-candidate/...` | Candidate-style release/current layout. Verify live before mutation. |
| Vultr Singapore data plane | Provider host protected runtime paths | Runtime-only data-plane host. Verify through approved read-only inventory. |
| Cloudflare public site | `admin/dist-site` | Static assets only; built through `wrangler.jsonc` / Workers Builds. |
| AWS staging/DR | `/opt/proxy-gateway-minimal-candidate/...` when provisioned | Validation/DR only unless a future Risk A promotion says otherwise. |

## Historical AWS Runtime Roles

AWS Singapore runtime inventory in older records is historical unless freshly
revalidated. The following observations were last current on 2026-05-24 and are
retained only to prevent accidental reactivation:

| Historical role | Instance | Public IP | Private IP | Last known state | Notes |
| --- | --- | --- | --- | --- | --- |
| Production blue | `i-004ab1c6c71d06bca` | `47.129.247.102` | `172.31.26.232` | Running at last AWS inventory | Historical AWS subscription node; no longer the default production authority after the Vultr lane. |
| Production green candidate | `i-0ad8676ee113d14cb` | `18.136.102.226` | `172.31.18.176` | Running at last AWS inventory | Historical replacement candidate; not current production unless a fresh gate reassigns it. |
| Historical stopped node | `i-0589aac321172dd74` | none | `172.31.24.0` | Stopped at last AWS inventory | Do not treat as staging without explicit rebuild and retagging. |

Clean staging provisioning, validation, promotion gates, and cleanup rules live
in `docs/STAGING_PROVISIONING.md`.

## Deployment States

Use these terms consistently:

| State | Meaning |
| --- | --- |
| Development | Local task branch or Codex worktree. Not deployed. |
| Candidate / 待上线 | A reviewed commit or branch selected for staging verification. |
| Staging | Candidate deployed to a non-production target, currently usually AWS, for endpoint and service checks. |
| Production | Verified code/config deployed to the active Vultr control-plane or data-plane runtime through a Risk A gate. |

Detailed promotion and rollback rules live in `docs/DEPLOYMENT_FLOW.md`.

Minimum production boundary checks must use the current approved domains and
host inventory. Do not use historical AWS IP checks as current production
validation without fresh reactivation.

## Codex Alignment

Codex app local environment configuration lives under:

```text
.codex/
```

The Codex app may generate files in this folder from the Environment settings
UI. These project-level files are part of the project alignment when they
contain no secrets.

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

Do not store production tokens, subscription URLs, SSH keys, or `.env` values in
`.codex/`.

## Verification Commands

GitHub:

```powershell
git remote -v
gh repo view gaoyi1020-web/proxy-gateway-minimal --json nameWithOwner,visibility,defaultBranchRef,pushedAt,isPrivate
gh pr list --repo gaoyi1020-web/proxy-gateway-minimal --state open
```

Vultr:

Interactive or Agent-assisted Vultr inventory must follow
`docs/INFRASTRUCTURE_ACCESS_RULE.md`. Do not recover `VULTR_API_KEY` from a
persistent CurrentUser or LocalMachine environment variable. Complete
credential-free network and CLI prechecks first, then use only the exact
ephemeral credential source, target, and read-only command allowlist approved
by a fresh Risk A Gate.

Cloudflare public-site validation:

```powershell
npm run cloudflare:site:validate
npx --yes wrangler@4.99.0 deploy --dry-run
```

AWS staging/DR inventory:

```powershell
$env:HTTP_PROXY=$null; $env:HTTPS_PROXY=$null; $env:ALL_PROXY=$null
$env:http_proxy=$null; $env:https_proxy=$null; $env:all_proxy=$null
aws ec2 describe-instances --region ap-northeast-1 --filters Name=instance-state-name,Values=running,stopped --query "Reservations[].Instances[].{InstanceId:InstanceId,State:State.Name,PublicIp:PublicIpAddress,Name:Tags[?Key=='Name']|[0].Value,Project:Tags[?Key=='Project']|[0].Value,Purpose:Tags[?Key=='Purpose']|[0].Value}" --output table
```

These commands verify tooling and documented surfaces only. Production
mutation, DNS changes, runtime restarts, firewall edits, live order creation,
subscription URL/token/password output, SQLite row dumps, and secret handling
remain separate Risk A gates.
