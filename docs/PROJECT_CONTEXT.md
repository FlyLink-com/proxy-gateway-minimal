# Project Context

Last updated: 2026-05-26, Asia/Shanghai.

This file is the compact handoff note for continuing
`proxy-gateway-minimal`. Read it first, then inspect the live repo state before
making claims or changes. It intentionally summarizes current facts and links
to detailed records instead of repeating historical execution logs.

## How To Use This File

Use this file for:

- Current repo/source-of-truth orientation.
- Current product direction and risk boundaries.
- Current documented production snapshot.
- Active blockers and next work lanes.
- Latest validation baseline and quick commands.

Do not use this file as:

- A production inventory source.
- A deployment approval.
- A replacement for live DNS, AWS, Nginx, systemd, SQLite, tenant, or endpoint
  verification.
- A place to store secrets, tokens, subscription URLs, credentials, SQLite data,
  or customer data.

Detailed navigation lives in `docs/README.md`. Structured project state lives in
`project-state/*.json`; it is a coordination aid, not a runtime control plane.

## Repository

```text
C:\Users\g\Projects\订阅管理\proxy-gateway-minimal
```

The active code source of truth is GitHub
`gaoyi1020-web/proxy-gateway-minimal` plus the local checkout above.

Do not use these as active code checkouts:

- `C:\Users\g\OneDrive\文档\订阅管理` - legacy empty Codex project shell.
- `C:\Users\g\WorkBuddy\2026-05-20-18-07-31\proxy-gateway-minimal` -
  historical archaeology only.

Before any repo work:

```powershell
cd C:\Users\g\Projects\订阅管理\proxy-gateway-minimal
git status --short --branch
git fetch origin
```

## Workflow Boundary

Default risk tiers live in `AGENTS.md`:

- C: docs-only; usually validate with `git diff --check origin/master...HEAD`.
- B: repo code, tests, Admin UI, local tooling; run focused checks plus the
  relevant project tests.
- A: AWS, production, DNS, Nginx, HTTPS, systemd, security groups, nodes, auth
  model, schema/migration, deploy, rollback, or tenant/artifact mutation. A-tier
  work requires read-only inventory, dry-run, explicit operator approval,
  validation, and rollback evidence.

Do not lower risk just because a task is easy to run locally.

Every PR must complete its approved design -> execution -> validation loop
before it is marked Ready, submitted for merge, or reported complete. A
spec-only, runbook-only, or inventory-only PR is allowed only when that is the
explicit scope and the PR body states the non-goals, skipped execution, and next
approval gate.

`docs/PROJECT_OPERATING_MODEL.md` also defines the PR cadence reporting rule:
after every five merged PRs, give a concise stage report covering the PR range,
risk tiers, validation evidence, production boundary changes, blockers, and
recommended next actions.

## Current Product Direction

The active product spine is:

```text
stable subscription/import experience
  -> authoritative subscription control plane
  -> replaceable edge data-plane capacity
  -> loopback-only local client adapter path
  -> measured validation and operations
```

Current architecture priorities:

- Aliyun User Management / Subscription Distribution: the near-term business
  split is Aliyun for user management/subscription distribution, HP for local CI/operator
  lab, and all other nodes in a controlled drain/retirement queue. See
  `docs/ALIYUN_USER_SUBSCRIPTION_DISTRIBUTION_RUNBOOK.md`.
- Subscription Control / Edge Split: keep subscription state, Admin actions,
  opaque artifacts, and rendering authoritative in the control plane. CI has
  moved off the current Aliyun server, and that host is now prepared as a
  private loopback-only `sub-control-a` candidate without production authority.
- Edge Data Plane: current AWS `prod-edge-a/b` remain production/runtime
  dependencies until Aliyun promotion and node drain are explicitly approved.
  Do not add or keep non-Aliyun/HP nodes as the default direction; drain and
  retirement are now the near-term queue.
- Validation / CI: move manual CI toward a local Linux validation host so the
  future production subscription control plane does not also run repository
  validation workloads.
- Channel Upgrade MVP: prioritize Clash/Mihomo-native subscription rendering
  for multi-protocol channel candidates. SS remains the baseline; VLESS/XUDP,
  Hysteria2, and TUIC are renderer-supported candidate families; QUIC/MPTCP stay
  research items until measured in controlled canaries. Runtime canaries are
  gated by `docs/CHANNEL_RUNTIME_CANARY_RUNBOOK.md`; repository renderer/config
  support does not authorize remote protocol deployment by itself.
- Local Edge Agent: keep as a parked future node/agent adaptation asset, not
  the current mainline for the next channel-upgrade slice.
- Server Edge Mesh: plan private edge-to-edge health, management, validation,
  and recovery paths. It is not a user VPN and does not authorize WireGuard
  execution by itself.
- Operator Lab / HP Relay: useful for local path and upstream behavior
  research, but not production, staging, CI, `prod-edge-c`, Server Edge Mesh, or
  the official Local Edge Agent runtime.

Use these docs for detail:

- `docs/PROJECT_TOPOLOGY.md`
- `docs/ALIYUN_USER_SUBSCRIPTION_DISTRIBUTION_RUNBOOK.md`
- `docs/ALIYUN_CONTROL_LOCAL_CI_REBUILD_PLAN.md`
- `docs/SUBSCRIPTION_CONTROL_EDGE_ARCHITECTURE.md`
- `docs/SUBSCRIPTION_CONTROL_PLANE_NEW_SERVER_RUNBOOK.md`
- `docs/LOCAL_EDGE_AGENT_DESIGN.md`
- `docs/LOCAL_EDGE_CHANNEL_TECHNICAL_MVP.md`
- `docs/CHANNEL_RUNTIME_CANARY_RUNBOOK.md`
- `docs/SERVER_EDGE_MESH_DESIGN.md`
- `docs/PROJECT_SIMPLIFICATION_MAP.md`
- `docs/MULTI_AGENT_OPERATING_MODEL.md`

## Current Production Snapshot

This snapshot reflects documented project state as of 2026-05-25. Refresh live
AWS, DNS, Nginx, service, endpoint, and SQLite state before A-tier work.

- Current production MVP target: `prod-edge-a` on `13.215.156.159`.
- Current production gateway DNS: `sub.globalcirclecat.com -> 13.215.156.159`.
- Current production Shadowsocks DNS: `ss-sg.globalcirclecat.com -> 13.215.156.159`.
- Current production instance: `i-0b7791340d3fedff5`.
- Current production security group: `sg-0379ece0b3d305c43`.
- HTTPS is enabled for `https://sub.globalcirclecat.com` with no forced
  HTTP-to-HTTPS redirect.
- Nginx remains the public gateway/protection layer.
- Public gateway permits `/api/health`, `/sub/clash.yaml`, and the controlled
  opaque artifact path `/sub/a/*`; the public Admin UI remains blocked.
- The active opaque artifact canary exists for controlled operator validation.
  The full import URL is stored only in a local `C:\tmp\...` file and must not
  be pasted, committed, logged, or written into docs.
- Legacy `/sub/clash.yaml?token=...` support still exists until a separate
  A-tier retirement plan is approved.
- Subscription V2 output includes `prod-edge-a` plus `prod-edge-b` as the
  iteration/canary secondary slot.
- `prod-edge-b` is currently carried by the validated green instance
  `18.136.102.226`; lifecycle changes remain A-tier.
- The latest non-Aliyun node cleanup preflight is recorded in
  `docs/production-replacement-records/2026-05-26-non-aliyun-node-cleanup-preflight.md`.
  It refreshed AWS, AliDNS, public endpoint, and repository-reference evidence
  and did not perform any stop, terminate, DNS, security-group, runtime, tenant,
  SQLite, or artifact mutation.
- Legacy blue `i-004ab1c6c71d06bca` is stopped and retained for controlled
  retirement review. Do not terminate it or delete its security group without
  separate A-tier approval.
- Current prod-edge-a production subscription DB path is documented as
  `/opt/proxy-gateway-minimal/.proxy-gateway/subscriptions.sqlite`. Historical
  records may mention `/opt/proxy-gateway-minimal/data/subscriptions.sqlite`;
  verify the active runtime `.env` before backup, restore, or SQLite inspection.
- The live production deployment directory is not a Git checkout. Verify
  production by file presence, `systemctl`, `journalctl`, endpoint behavior, and
  SQLite/tooling checks rather than `git rev-parse` on the host.

## Active Blockers And Gated Work

The following remain blocked unless a specific runbook, read-only inventory,
operator approval, validation, and rollback path exist:

- Broader opaque artifact issuance.
- Legacy query-token retirement.
- Traffic accounting, quota enforcement, and device-abuse enforcement.
- Channel runtime canary execution for VLESS/XUDP, Hysteria2, TUIC, or any
  other protocol candidate. Repository renderer/config support is merged, but
  runtime deployment, node config activation, security-group changes,
  operator-device canaries, or broader rollout remain A-tier and must follow
  `docs/CHANNEL_RUNTIME_CANARY_RUNBOOK.md`.
- Physical control-plane / edge data-plane split.
- Local Linux manual CI is now bootstrapped and validated as an archive-based
  repository validation host. See
  `docs/production-replacement-records/2026-05-26-local-linux-ci-readonly-inventory.md`
  and
  `docs/production-replacement-records/2026-05-26-local-linux-ci-bootstrap-validation.md`.
  It is not staging, not production, and not deploy approval.
- Aliyun private state-copy validation or production-control promotion. The
  current Aliyun candidate-preparation record is
  `docs/production-replacement-records/2026-05-26-aliyun-sub-control-candidate-preparation.md`.
  The latest private state-copy preflight record is
  `docs/production-replacement-records/2026-05-26-aliyun-state-copy-preflight.md`.
  The latest source internal inspection attempt is
  `docs/production-replacement-records/2026-05-26-prod-edge-a-source-internal-state-copy-inspection.md`.
- Clean fallback `sub-control-a` candidate provisioning, state-copy validation,
  public-boundary validation, or promotion.
- A2 host-internal read-only inventory is currently incomplete because SSH to
  `prod-edge-a` / `prod-edge-b` closes during key exchange from the current
  operator environment. See
  `docs/production-replacement-records/2026-05-26-sub-control-a-candidate-readonly-preflight.md`.
- `prod-edge-b` carrying-instance replacement or lifecycle mutation.
- `prod-edge-c` creation or durable third-node recovery work.
- AWS node drain, stop, termination, or security-group cleanup as part of the
  new "Aliyun + HP only" target. The latest cleanup preflight confirms
  `prod-edge-a` is still blocked by AliDNS/user-facing dependency and
  `prod-edge-b` is still blocked by the documented temporary secondary-slot
  dependency. Drain/stop/termination each require separate A-tier approvals and
  evidence.
- Legacy blue final termination or security-group cleanup.
- WireGuard install, mesh key generation, UDP security-group changes,
  `wg-quick` start, or live mesh validation.
- DNS, Nginx, HTTPS redirect behavior, systemd, production runtime config,
  tenant state, or SQLite authority changes.

GitHub-hosted Actions validation has previously been blocked by billing or
spending-limit constraints. Manual CI fallback is documented, but it is not
staging, not production, and not deployment approval.

## Current Work Queue

Use `project-state/tasks.json` as the compact backlog source. The current C/B
simplification queue is closed:

- `C1-doc-context-slimming` - completed in PR #112.
- `C3-validation-baseline-entrypoint` - completed in PR #113.
- `C2-architecture-non-goal-hardening` - completed in PR #114.
- `B1-code-module-inventory` - completed in PR #115.
- `B2-admin-ui-surface-simplification` - completed in PR #115.

The remaining queued items are A-tier and remain blocked:

- `A1-legacy-query-token-retirement`
- `A2-physical-control-edge-split`

For A2, the preferred first step is now the role split in
`docs/ALIYUN_CONTROL_LOCAL_CI_REBUILD_PLAN.md`: local Linux manual CI first,
then Aliyun production-control candidate inventory, then controlled
non-Aliyun node drain / retirement after Aliyun promotion. Do not start either
A-tier item without a specific runbook, read-only inventory, operator approval,
validation plan, and rollback evidence.

Latest local Linux CI candidate inventory:

- `docs/production-replacement-records/2026-05-26-local-linux-ci-readonly-inventory.md`
- `docs/production-replacement-records/2026-05-26-local-linux-ci-bootstrap-validation.md`
- `hp-server` is reachable through the approved local SSH key.
- Node.js `v22.22.3` and npm `10.9.8` are available through a user-local
  toolchain under `~/.local/ci-node/`.
- Archive-based manual CI passed for commit
  `4dacd1edf0b179cea38654de4cda2fd845c6d922`: `npm ci`,
  `npm ci --prefix admin`, `npm test` 180/180, `npm run admin:test` 25/25,
  and `npm run admin:build`.
- Per-run workspace, archive, npm cache, GitHub config, and git credentials
  were cleaned after validation.
- Aliyun CI cleanup has been completed; HP is now the manual CI lane.

Latest Aliyun CI cleanup / subscription-control candidate inventory:

- `docs/production-replacement-records/2026-05-26-aliyun-ci-cleanup-inventory.md`
- `docs/production-replacement-records/2026-05-26-aliyun-ci-cleanup.md`
- `docs/production-replacement-records/2026-05-26-aliyun-sub-control-candidate-preparation.md`
- `docs/production-replacement-records/2026-05-26-aliyun-state-copy-preflight.md`
- `docs/production-replacement-records/2026-05-26-prod-edge-a-source-internal-state-copy-inspection.md`
- The current Aliyun SWAS host is reachable through SSH alias `miyao`.
- It is running Ubuntu 24.04.2 with Node.js `v22.22.2`, npm `10.9.7`, git
  `2.43.0`, 2 CPU, about 2 GiB memory, and 40 GiB disk.
- No active manual-CI workspace, repository archive, GitHub CLI config, or git
  credential file was found in the read-only scan.
- The cleanup removed only `/root/.npm`, `/root/.cache`, and any matching
  `/tmp/proxy-gateway-ci-*.tar` archives; the post-cleanup recheck found CI
  workspace, GitHub CLI config, git credentials, npm/cache residue, and CI
  archives absent.
- A private candidate proxy-gateway runtime is now active on loopback only, and
  candidate Nginx is active on loopback only.
- WireGuard `wg-home` is active on UDP 51820 and must be explicitly accepted,
  scoped, or removed during any future production hardening.
- UFW is active with default deny incoming / allow outgoing and only OpenSSH
  plus existing `wg-home` UDP 51820 allowed inbound.
- The candidate app listens on `127.0.0.1:3456`; candidate Nginx listens on
  `127.0.0.1:18080`; no edge proxy listener was opened.
- HP-side external validation found public 3456, 18080, 80, and 443 closed and
  SSH 22 open.
- No DNS, user traffic, production authority, production SQLite copy, artifact
  copy, edge traffic, AWS, public Admin, WireGuard, tenant, or cutover mutation
  was performed.
- Aliyun private state-copy preflight confirms candidate app health, loopback
  Nginx health, UFW deny-incoming posture, and candidate SQLite
  `integrity_check: ok`.
- The same preflight confirms AliDNS still points `sub.globalcirclecat.com` and
  `ss-sg.globalcirclecat.com` to `13.215.156.159`, and HP-side public checks do
  not observe Aliyun candidate public exposure on 80/443/3456/18080.
- Private state-copy validation is still blocked because prod-edge-a source
  internal SSH inspection timed out during banner exchange; source SQLite
  integrity and fresh source backup are not yet verified.
- Follow-up source internal inspection confirmed prod-edge-a EC2 health and
  production public endpoint health, but SSM inventory is empty and SSH TCP/22
  closes before banner/auth. Source command execution remains blocked.
- The next gate is explicit prod-edge-a source access remediation planning,
  followed by separate remediation approval if mutation is needed, then Aliyun
  private state-copy validation approval.

Latest Aliyun user-management / subscription-distribution decision:

- `docs/ALIYUN_USER_SUBSCRIPTION_DISTRIBUTION_RUNBOOK.md`
- Near-term target: Aliyun becomes the user-management and subscription
  distribution platform, HP remains local CI/operator lab, and all other nodes
  are drained and retired through explicit A-tier gates.
- The separate technical MVP branch is PR #129,
  `codex/local-edge-channel-probe-harness`; it owns local edge channel probe,
  benchmark, and manager work and must not be coupled to Aliyun production
  authority without a later integration gate.
- Read-only refresh on 2026-05-26 found AWS still has running `prod-edge-a`
  `13.215.156.159` and `prod-edge-b` `18.136.102.226`.
- Authoritative AliDNS still points `sub.globalcirclecat.com` and
  `ss-sg.globalcirclecat.com` to `13.215.156.159`, so no AWS node can be
  stopped before Aliyun promotion and node drain evidence.
- Latest cleanup preflight:
  `docs/production-replacement-records/2026-05-26-non-aliyun-node-cleanup-preflight.md`.
- The preflight also found the tracked static node config still references
  `prod-edge-a` and `prod-edge-b`, so node cleanup remains sequenced but not
  executable until Aliyun promotion and subscription-output drain evidence.
- The next executable gate is prod-edge-a source access remediation planning or,
  for node cleanup specifically, a later drain-and-stop approval after Aliyun
  promotion.

Latest A2 preflight:

- `docs/production-replacement-records/2026-05-26-sub-control-a-candidate-readonly-preflight.md`
- External AWS, DNS, public-boundary, and edge-port checks were healthy.
- Host-internal service / SQLite / backup / journal checks are blocked until
  an approved internal inspection path exists. The latest source inspection
  attempt confirmed the path is still blocked before SSH banner/auth and SSM is
  unavailable.
- Clean `sub-control-a` candidate provisioning is not approved. The clean
  new-server control-plane path is now a fallback if the Aliyun candidate path
  is rejected by inventory or cleanup gates.

## Current Validation Baseline

Use `docs/VALIDATION_BASELINE.md` as the active validation command matrix.

Short version:

- C docs-only: `git diff --check origin/master...HEAD`
- Project-state JSON: `npm run project-state:check` plus diff check
- Server/shared code: `npm test` plus diff check
- Admin UI: `npm run admin:test`, `npm run admin:build`, `npm test`, and diff
  check
- A-tier work: runbook-specific validation only; there is no generic shortcut

Latest PR #111 validation before merge:

- `npm run project-state:check` passed.
- `npm test` passed with 175/175 tests.
- `git diff --check origin/master...HEAD` passed.

## Local Run And Admin Access

Local server:

```powershell
npm run server
```

Admin UI:

```powershell
npm run admin:dev
```

To connect local Admin UI to current prod-edge-a backend, open an SSH tunnel:

```powershell
ssh -i "$env:USERPROFILE\.ssh\proxy-gateway-aws-sg-20260521.pem" -L 3456:127.0.0.1:3456 ubuntu@13.215.156.159
```

Then use:

```text
API base URL: leave blank in Vite dev mode so same-origin /api requests use the dev proxy
Console token: production CONSOLE_TOKEN from /opt/proxy-gateway-minimal/.env
```

Do not set the browser UI API base URL directly to `http://127.0.0.1:3456`
unless the target backend sends CORS headers. The production backend does not
currently expose browser CORS, so Vite dev proxy is the intended local testing
path.

## Connectivity Notes

If AWS, Aliyun, GitHub, or other CLI commands fail because local proxy
environment variables point to a dead local listener, clear proxy variables for
the current process first:

```powershell
Remove-Item Env:HTTP_PROXY,Env:HTTPS_PROXY,Env:ALL_PROXY,Env:http_proxy,Env:https_proxy,Env:all_proxy -ErrorAction SilentlyContinue
```

Safe AWS refresh pattern:

```powershell
$env:HTTP_PROXY=$null; $env:HTTPS_PROXY=$null; $env:ALL_PROXY=$null
$env:http_proxy=$null; $env:https_proxy=$null; $env:all_proxy=$null
aws ec2 describe-instances --region ap-southeast-1 --filters Name=ip-address,Values=13.215.156.159 --query "Reservations[].Instances[].{InstanceId:InstanceId,State:State.Name,PublicIp:PublicIpAddress,Type:InstanceType,LaunchTime:LaunchTime,Name:Tags[?Key=='Name']|[0].Value,Purpose:Tags[?Key=='Purpose']|[0].Value,Project:Tags[?Key=='Project']|[0].Value,SecurityGroups:SecurityGroups[*].GroupId}" --output table
```

Safe AliDNS refresh pattern:

```powershell
$env:HTTP_PROXY=$null; $env:HTTPS_PROXY=$null; $env:ALL_PROXY=$null
$env:http_proxy=$null; $env:https_proxy=$null; $env:all_proxy=$null
aliyun alidns DescribeDomainRecords --DomainName globalcirclecat.com --RRKeyWord sub --PageSize 10
```

## Documentation Navigation

Use `docs/README.md` as the full docs index. It classifies current state docs,
active runbooks, production safety records, execution records, paused docs, and
historical specs/plans.

High-value entrypoints:

- `AGENTS.md` - workflow rules and A/B/C risk gates.
- `docs/PROJECT_OPERATING_MODEL.md` - source-of-truth layers and work lanes.
- `docs/PROJECT_SIMPLIFICATION_MAP.md` - cleanup map and complexity hotspots.
- `docs/PROJECT_CONTROL_PLANE.md` - structured project-state model.
- `docs/VALIDATION_BASELINE.md` - current validation command matrix.
- `project-state/current.json` - compact current-state snapshot.
- `project-state/lanes.json` - active lane index and risk boundaries.
- `project-state/tasks.json` - active backlog.
- `docs/NETWORK_FORWARDING.md` - local/proxy/Admin/runtime forwarding model.
- `docs/ENVIRONMENT_TOPOLOGY.md` - repo, GitHub, branch, and AWS role map.
- `docs/DEPLOYMENT_FLOW.md` - deployment, staging, promotion, rollback flow.
- `docs/CI_MANUAL_VALIDATION.md` - manual validation host workflow.
- `docs/ALIYUN_CONTROL_LOCAL_CI_REBUILD_PLAN.md` - target split for current
  Aliyun production subscription control, local Linux manual CI, and controlled
  non-Aliyun node drain / retirement.
- `docs/SUBSCRIPTION_CONTROL_PLANE_NEW_SERVER_RUNBOOK.md` - clean
  `sub-control-a` candidate fallback gates for the future physical split.

Detailed production and incident history remains in:

- `docs/production-replacement-records/*.md`
- `docs/production-incident-records/*.md`
- `docs/domain-implementation-records/*.md`
- `docs/server-edge-mesh-records/*.md`

Do not copy full historical execution details back into this handoff unless
they change current state, blockers, or required next actions.

## Historical Baseline

Historical feature and operations context is still useful but should not bloat
the current handoff:

- `v0.1.0-mvp` introduced SQLite-backed subscription tenants, hashed tokens,
  Admin subscription APIs, and tenant-token subscription fetch.
- Subscription hardening introduced temporary links, token rotation, `/sub`
  rate limiting, Admin public blocking, public console UI blocking, and token
  redaction guidance.
- Admin UI work connected the frontend to real `/api/admin/*` endpoints through
  Bearer auth and same-origin Vite dev proxy use.
- Subscription architecture refactor introduced `SubscriptionCore`, store
  contracts, compatibility exports, serializer/validation separation, and
  platform integration boundaries.
- Environment foundation added systemd templates, Nginx gateway template,
  SQLite backup/restore scripts, `.env.example` expansion, and ops docs.

For detailed historical specs/plans, use `docs/superpowers/README.md` and the
corresponding files under `docs/superpowers/`.

## Guardrails

- Do not commit secrets, subscription URLs with real tokens, `.proxy-gateway/`,
  AWS/SS credential material, SQLite data, or customer data.
- Do not rely on ignored `.proxy-gateway/aws-singapore/` status files without
  live verification.
- Do not change domain DNS, HTTPS redirect behavior, production base URL,
  opaque artifact exposure, legacy subscription access, production nodes,
  Nginx, systemd, security groups, or tenants unless the user explicitly asks
  and the work follows the relevant A-tier gate.
- Do not expose the Admin UI through the public gateway.
- Do not remove Nginx from the gateway path while hardening public access.
- When changing auth, rate limits, logs, subscription output, tenant behavior,
  or route boundaries, add focused tests and run the relevant validation.
