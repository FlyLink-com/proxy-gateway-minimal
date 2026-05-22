# Project Context

Last updated: 2026-05-22, Asia/Shanghai.

This file is the handoff note for continuing the `proxy-gateway-minimal` work from a new Codex conversation. Read this file first, then inspect the live repo state before making changes.

## Repository

```text
C:\Users\g\WorkBuddy\2026-05-20-18-07-31\proxy-gateway-minimal
```

## Current Stage

- Active branch: `feat/subscription-architecture-refactor`
- Domain-based subscription exposure remains paused.
- Nginx stays in front of the app as the gateway protection layer.
- The public Nginx gateway does not expose the static console UI. It only allows `/api/health` and `/sub/clash.yaml`; all other public paths return `404`.
- `master` already includes the subscription hardening work: temporary `pgtmp_` links, primary-token rotation, `/sub` rate limiting, app-level `/api/admin` source-IP allowlisting, Nginx public UI blocking, and token redaction guidance.
- `PR #3 Add admin console shell` was merged into `master` on 2026-05-22.
- The admin UI calls the real `/api/admin/*` backend APIs. It is no longer mock-only.
- The current branch restructures the subscription system into a modular monolith: `SubscriptionCore`, `SubscriptionStore`, SQLite adapter, serializer/validation modules, and a future platform integration boundary.
- The admin UI is intended for local use or SSH tunnel access only. Do not expose it through the public gateway.
- The hardening branch was deployed to AWS Singapore `47.129.247.102` on 2026-05-22.
- Default tracked node config now points at the active AWS Singapore node `aws-singapore-blue`.

## Verified Local State

- Current branch: `feat/subscription-architecture-refactor`
- Remote tracking branch: not pushed yet at the start of this branch.
- Base: latest `master` after merging PR #3 at `9637c69`.
- Current architecture checkpoints:
  - `55d2496 docs: design subscription architecture refactor`
  - `04d5eed refactor: introduce subscription core and store contracts`
- GitHub PR #3: merged.
- Local Vite admin UI: `http://127.0.0.1:5173/`
- Local backend `127.0.0.1:3456` is not expected to be running unless a local server or SSH tunnel is started.
- Pre-hardening source branch commit: `d5341d4 docs: add domain https runbook`
- Latest deployed hardening base before config alignment: `93b8610 chore: finish subscription hardening verification`
- `v0.1.0-mvp` is tagged on `master` at `8d38d2c Merge pull request #5 from gaoyi1020-web/feat/subscription-admin-core`
- Stage close-out goal: finish verification, push `feat/subscription-architecture-refactor`, and open a PR for the structural refactor.

Quick check:

```powershell
git -C C:\Users\g\WorkBuddy\2026-05-20-18-07-31\proxy-gateway-minimal status --short --branch
git -C C:\Users\g\WorkBuddy\2026-05-20-18-07-31\proxy-gateway-minimal log --oneline --decorate -8
```

## Current Operations State

- Current production server: AWS Singapore `47.129.247.102`
- Current production node name: `aws-singapore-blue`
- AWS instance: `i-004ab1c6c71d06bca`
- Instance name: `proxy-gateway-node-sg-blue-20260521`
- Instance state verified live on 2026-05-22: `running`
- Security group: `sg-04a165ec77f430ee8`
- Public Nginx exposure verified on 2026-05-22: `/` and `/index.html` return `404`, `/api/admin/subscriptions` returns `404`, `/api/health` returns `200`, and `/sub/clash.yaml` with a valid token returns `200`.
- Production `proxy-gateway-console.service` and `proxy-gateway-ss.service` were verified active on 2026-05-22.
- Production admin API is reachable from the server itself on `127.0.0.1:3456` with the production `CONSOLE_TOKEN`.
- Production admin API returned 2 subscription users on 2026-05-22: `karing-blue-sg` and `karing-blue`.
- Previous AWS instance with project tag `proxy-gateway-minimal`: `i-0589aac321172dd74`, verified live as `stopped`
- Local ignored files under `.proxy-gateway/aws-singapore/` may be stale. In particular, old cached files referenced `52.221.198.76`; prefer live AWS queries over those cached status files.

To connect the local admin UI to the production backend, open an SSH tunnel:

```powershell
ssh -i "$env:USERPROFILE\.ssh\proxy-gateway-aws-sg-20260521.pem" -L 3456:127.0.0.1:3456 ubuntu@47.129.247.102
```

Then use these UI settings:

```text
API base URL: leave blank in Vite dev mode so same-origin /api requests use the dev proxy
Console token: production CONSOLE_TOKEN from /opt/proxy-gateway-minimal/.env
```

Do not set the browser UI API base URL directly to `http://127.0.0.1:3456` unless the target backend sends CORS headers. The production backend does not currently expose browser CORS, so Vite dev proxy is the intended local testing path.

## Environment Connectivity

Verified on 2026-05-22:

- GitHub remote: `https://github.com/gaoyi1020-web/proxy-gateway-minimal.git`
- GitHub CLI account: `gaoyi1020-web`
- Repository permission: `ADMIN`
- Repository visibility: `PRIVATE`
- Remote branches checked: `master`, `ops/domain-https`
- AWS CLI identity: IAM user `arn:aws:iam::580857941765:user/gaoyi1020@gmail.com`
- AWS default region: `us-east-1`; use `--region ap-southeast-1` for the running Singapore node.
- AWS query for `47.129.247.102` returned the running instance `i-004ab1c6c71d06bca`.

If AWS or GitHub commands fail because the local proxy points to a dead `127.0.0.1:18180`, clear proxy variables for the process first:

```powershell
Remove-Item Env:HTTP_PROXY,Env:HTTPS_PROXY,Env:ALL_PROXY,Env:http_proxy,Env:https_proxy,Env:all_proxy -ErrorAction SilentlyContinue
```

Safe AWS refresh command:

```powershell
$env:HTTP_PROXY=$null; $env:HTTPS_PROXY=$null; $env:ALL_PROXY=$null
$env:http_proxy=$null; $env:https_proxy=$null; $env:all_proxy=$null
aws ec2 describe-instances --region ap-southeast-1 --filters Name=ip-address,Values=47.129.247.102 --query "Reservations[].Instances[].{InstanceId:InstanceId,State:State.Name,PublicIp:PublicIpAddress,Type:InstanceType,LaunchTime:LaunchTime,Name:Tags[?Key=='Name']|[0].Value,Purpose:Tags[?Key=='Purpose']|[0].Value,Project:Tags[?Key=='Project']|[0].Value,SecurityGroups:SecurityGroups[*].GroupId}" --output table
```

## Domain And HTTPS Decision

- `docs/DOMAIN_HTTPS.md` exists and records the domain HTTPS runbook for `sub.globalcirclecat.com`.
- That domain subscription plan is currently paused.
- Do not expose subscriptions through `sub.globalcirclecat.com` unless the user explicitly re-enables the domain plan.
- Aliyun CLI is installed (`aliyun version` returned `3.3.15`).
- AliDNS credentials worked for a read-only `DescribeDomainRecords` call on 2026-05-22.
- `sub.globalcirclecat.com` had no `sub` record at that time.
- Keep Nginx as the gateway/protection layer.

AliDNS refresh command:

```powershell
$env:HTTP_PROXY=$null; $env:HTTPS_PROXY=$null; $env:ALL_PROXY=$null
$env:http_proxy=$null; $env:https_proxy=$null; $env:all_proxy=$null
aliyun alidns DescribeDomainRecords --DomainName globalcirclecat.com --RRKeyWord sub --PageSize 10
```

## Existing Docs To Read

- `README.md`: user-facing project and API documentation.
- `qa-report.md`: v0.1.0 test and QA summary. It is useful for test coverage, but the server references are historical.
- `docs/DOMAIN_HTTPS.md`: domain HTTPS runbook. Currently paused.
- `docs/superpowers/specs/2026-05-22-admin-console-real-api-design.md`: real admin API integration design.
- `docs/superpowers/plans/2026-05-22-admin-console-real-api.md`: implementation plan for wiring `admin/` to `/api/admin/*`.
- `docs/superpowers/specs/2026-05-21-subscription-admin-core-design.md`: backend subscription-admin design.
- `docs/superpowers/plans/2026-05-21-subscription-admin-core.md`: implemented plan for the `feat/subscription-admin-core` branch that became `v0.1.0-mvp`.

## Implemented Baseline

`v0.1.0-mvp` includes:

- SQLite-backed subscription tenants.
- Hashed tenant tokens with visible-once raw token responses.
- Admin subscription APIs under `/api/admin/subscriptions`.
- Tenant-token `/sub/clash.yaml` fetch.
- Console-token subscription compatibility during migration.
- Existing tests reported as 76 passing in `qa-report.md`.

## Recent Hardening Close-Out

Branch: `feat/subscription-hardening`.

Implemented scope:

- Temporary random subscription links.
- Token rotation.
- Rate limiting on `/sub`.
- Block `/api/admin` from public access.
- Block the public static console UI at Nginx.
- Desensitize access logs so subscription tokens are not written to logs.
- Align tracked default node config with the deployed AWS Singapore node.

## Recent Admin UI Integration

Branch: `feat/admin-console-shell`.

Implemented scope:

- Separate Vite React admin app under `admin/`.
- Real admin API client with bearer `CONSOLE_TOKEN` auth.
- In-app connection panel for API base URL and console token.
- Blank API base URL support for same-origin `/api` requests through the Vite dev proxy.
- Subscription page wired to list, create, renew, disable, enable, reset token, and create temporary links.
- Overview and nodes pages wired to backend `/api/admin/overview` and `/api/admin/nodes`.
- Existing subscription URLs are not fabricated in the UI; full URLs are only shown immediately after create, reset, or temporary-link generation.
- Mobile layout was checked and adjusted so the connection panel does not overflow at narrow widths.

Verified on 2026-05-22:

- `npm run admin:build`: passing.
- `npm test`: passing, 97 tests.
- `npm run admin:test`: passing, 7 tests.
- Chrome mobile-width check: `innerWidth=390`, `docWidth=390`, `bodyWidth=390`.
- GitHub PR #3 includes the Vite dev proxy fix for local UI testing through an SSH tunnel.
- Real UI through Vite dev proxy plus SSH tunnel loaded production data on 2026-05-22: 2 subscription users, no browser fetch failure.

## Recent Subscription Architecture Refactor

Branch: `feat/subscription-architecture-refactor`.

Implemented scope:

- `SubscriptionCore` is exported from `server/services/subscriptions/core.mjs`.
- `server/services/subscriptions/service.mjs` remains as a compatibility export for existing imports.
- `SubscriptionStore` required methods are documented and validated in `store-contract.mjs`.
- Current SQLite implementation is exposed as `createSqliteSubscriptionStore`, with `createSubscriptionRepository` retained as a compatibility alias.
- Serializer and validation helpers were split out of the core module.
- `createPlatformSubscriptionIntegration()` defines the future platform/payment caller boundary without adding public platform APIs.
- Runtime state now exposes both `subscriptions.core/store` and compatibility aliases `subscriptions.service/repository`.
- Contract tests verify core/store/platform boundaries and confirm public subscription refresh does not depend on platform integration availability.

Before continuing from a new session, refresh the repo and current AWS state:

```powershell
cd C:\Users\g\WorkBuddy\2026-05-20-18-07-31\proxy-gateway-minimal
git status --short --branch
git fetch origin
```

## Guardrails

- Do not commit secrets, subscription URLs with real tokens, `.proxy-gateway/`, or AWS/SS credential material.
- Do not rely on ignored `.proxy-gateway/aws-singapore/` status files without verifying live state first.
- Do not resume domain DNS or HTTPS issuance unless the user explicitly asks for it.
- Do not remove Nginx from the gateway path while hardening public access.
- When changing auth, rate limits, or logs, add focused tests and run `npm test`.
