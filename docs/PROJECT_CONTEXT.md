# Project Context

Last updated: 2026-05-22, Asia/Shanghai.

This file is the handoff note for continuing the `proxy-gateway-minimal` work from a new Codex conversation. Read this file first, then inspect the live repo state before making changes.

## Repository

```text
C:\Users\g\WorkBuddy\2026-05-20-18-07-31\proxy-gateway-minimal
```

## Current Stage

- Active branch: `feat/subscription-hardening`
- Domain-based subscription exposure remains paused.
- Nginx stays in front of the app as the gateway protection layer.
- This branch adds temporary `pgtmp_` subscription links, explicit primary-token rotation tests, `/sub` rate limiting, app-level `/api/admin` source-IP allowlisting, and token redaction guidance.
- Deployment to AWS Singapore `47.129.247.102` is a separate operations step after merge.

## Verified Local State

- Current branch: `feat/subscription-hardening`
- Remote tracking branch: `origin/feat/subscription-hardening`
- Pre-hardening source branch commit: `d5341d4 docs: add domain https runbook`
- `v0.1.0-mvp` is tagged on `master` at `8d38d2c Merge pull request #5 from gaoyi1020-web/feat/subscription-admin-core`
- Tracked working tree was clean before this handoff file was added.
- Stage close-out goal: preserve this handoff file, then continue hardening from a clean branch.

Quick check:

```powershell
git -C C:\Users\g\WorkBuddy\2026-05-20-18-07-31\proxy-gateway-minimal status --short --branch
git -C C:\Users\g\WorkBuddy\2026-05-20-18-07-31\proxy-gateway-minimal log --oneline --decorate -8
```

## Current Operations State

- Current production server: AWS Singapore `47.129.247.102`
- AWS instance: `i-004ab1c6c71d06bca`
- Instance name: `proxy-gateway-node-sg-blue-20260521`
- Instance state verified live on 2026-05-22: `running`
- Security group: `sg-04a165ec77f430ee8`
- Previous AWS instance with project tag `proxy-gateway-minimal`: `i-0589aac321172dd74`, verified live as `stopped`
- Local ignored files under `.proxy-gateway/aws-singapore/` may be stale. In particular, old cached files referenced `52.221.198.76`; prefer live AWS queries over those cached status files.

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

- `README.md`: user-facing project and API documentation. Some older sections still mention the pre-blue-deploy Aliyun server `47.251.178.125`; treat those as historical unless reverified.
- `qa-report.md`: v0.1.0 test and QA summary. It is useful for test coverage, but the server references are historical.
- `docs/DOMAIN_HTTPS.md`: domain HTTPS runbook. Currently paused.
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

## Next Work

Next branch: `feat/subscription-hardening`.

Planned scope:

- Temporary random subscription links.
- Token rotation.
- Rate limiting on `/sub`.
- Block `/api/admin` from public access.
- Desensitize access logs so subscription tokens are not written to logs.

Before starting, refresh the repo and current AWS state, then create or switch to the hardening branch from the intended base:

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
