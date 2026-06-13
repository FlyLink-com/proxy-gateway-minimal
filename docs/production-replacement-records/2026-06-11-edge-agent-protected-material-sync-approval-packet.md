# Edge Agent Protected Material Sync Approval Packet

Date: 2026-06-11

Risk: A

Status: packaged approval packet only. No production mutation is authorized by
this document.

## Context

The edge-agent source deployment and future-order live smoke reached the SGP
data-plane apply step, but it rolled back because SGP could not resolve
protected per-order credential material for desired `edgeCredentialRef` values.

The successful parts of the prior gate remain useful:

- Japan control plane can expose private authenticated desired-state to SGP.
- SGP agent can pull desired-state through the private path.
- SGP Xray, Hysteria2, and TUIC services can be config-tested and listener
  checked.
- Receipts remain redacted and do not carry runtime material.

The missing part is a protected material synchronization path. Repeating source
deployment without that path will reproduce the same apply failure.

## Source Candidate

- Branch: `codex/edge-agent-source-absorption`
- Runtime release:
  `edge-agent-protected-material-sync-20260611-001-worktree`
- Artifact:
  `D:\Projects\proxy-gateway-minimal\.codex-artifacts\edge-agent-protected-material-sync-20260611-001-worktree\proxy-gateway-edge-agent-protected-material-sync-20260611-001-worktree.zip`
- SHA256:
  `F6B074E4156602263CE671B9FB9CBA0A9866F032111CAE409AC8B6C763DABB9C`

The local package preflight confirmed the archive includes the protected
material sync source and excludes `.git`, `node_modules`, `.codex-artifacts`,
`.codex-runtime`, `data`, `.proxy-gateway`, `test-results`, `output`, local
tooling hidden directories, nested worktrees, SQLite/DB files, and local token
files. This approval packet is external release metadata and is intentionally
excluded from the runtime archive to avoid self-referential archive hashes.

## Required Repo Work Before Production

Implement and validate the plan in
`docs/superpowers/plans/2026-06-11-sgp-protected-material-sync.md`.

Minimum source behavior required before a production gate:

- `POST /api/internal/data-plane-agent/materials` exists behind the same
  internal data-plane agent bearer authentication.
- Material requests are scoped to the authenticated node, current
  `desiredStateRef`, current `edgeCredentialRef` set, and matching
  `materialDigest` values.
- `mode=summary` returns count/digest presence only and is safe for redacted
  validation.
- `mode=material` returns protected runtime material only over the private
  authenticated route and is never logged, recorded in receipts, documented, or
  output to the operator.
- SGP agent merges material into its local protected material file before
  applying Xray, Hysteria2, or TUIC adapters.
- Desired-state and receipts remain redacted.

Required local validation before a package can be proposed:

```powershell
node --test server/tests/data-plane-agent-protocol.test.mjs server/tests/data-plane-agent-service.test.mjs server/tests/data-plane-agent-routes.test.mjs server/tests/production-edge-agent.test.mjs
npm test
npm run project-state:check
git diff --check
```

## Production Approval Template

Use this only after confirming the live current release by read-only inventory.

## Read-Only Inventory Refresh

2026-06-11 read-only refresh confirmed:

- Japan current release:
  `edge-agent-future-order-runtime-20260611-002-worktree`
- Japan `proxy-gateway-candidate.service`: active.
- Japan local health endpoint: `/api/health` returns `200`.
- Japan `tcp/3456`: loopback-only.
- Public portal root: `200`.
- Public subscription health: `200`.
- Public Admin and public internal data-plane routes: blocked.
- Japan-to-SGP SSH: ok.
- SGP agent, Xray, Hysteria2, and TUIC services: active.
- SGP TCP8443, UDP443, UDP10443, and loopback stats listener: present.

```text
批准执行 Vultr Japan/SGP edge-agent protected material sync production activation:
release=edge-agent-protected-material-sync-20260611-001-worktree;
artifact=D:\Projects\proxy-gateway-minimal\.codex-artifacts\edge-agent-protected-material-sync-20260611-001-worktree\proxy-gateway-edge-agent-protected-material-sync-20260611-001-worktree.zip;
archive_sha256=F6B074E4156602263CE671B9FB9CBA0A9866F032111CAE409AC8B6C763DABB9C;
target=Vultr Japan control plane 45.76.222.52 + SGP data plane 45.76.158.201 only;
current_release=edge-agent-future-order-runtime-20260611-002-worktree;
scope=read-only inventory; protected backups; upload verified artifact; npm ci; switch Japan current; restart Japan proxy-gateway-candidate.service only; install/update SGP agent source if needed; enable private material pull; run SGP dry-run summary material preflight; controlled apply for exactly one approved test order or existing reviewed order; config-test SGP Xray/Hy2/TUIC; restart only approved SGP data-plane services if required; post redacted receipts; render proof;
validation=artifact hash ok, npm ci ok, Japan health 200, portal/sub public 200, Admin blocked, public internal route blocked, no-session APIs reject, tcp3456 loopback-only, unauthenticated internal route rejects, SGP agent active, SGP TCP8443/UDP10443/UDP443 active, stats loopback-only, summary material preflight ok, fresh applied receipt ok, subscription render proof includes SGP channels only after matching fresh receipt, no sensitive output;
rollback=restore Japan/SGP protected backups and previous agent/runtime state, restart only affected approved services after config-test;
forbidden=DNS,Nginx config/reload,provider firewall,public Admin,payment,account credential generation,more than one live order,passkey enablement,sensitive subscription/runtime material output,SQLite row dump,raw env/log/config output,copying protected runtime config into Git,unrelated service restart.
```

## Validation Notes

During production validation:

- `mode=summary` material preflight may report counts and digest matches only.
- `mode=material` response bodies must not be printed.
- Receipt validation may print only node/channel/generation/status/count facts.
- Render proof may print channel names and whether SGP channels are withheld or
  included. It must not print sensitive subscription or runtime material.

## Rollback Boundary

Rollback must restore:

- Japan current symlink.
- Japan protected env/proxy config/control DB/subscription DB backups.
- SGP agent source/env/service metadata.
- SGP protected runtime configs.

Rollback must not:

- mutate DNS;
- reload Nginx unless a separately approved Nginx gate exists;
- mutate provider firewall;
- expose public Admin;
- output protected material.

## Non-Goals

- No public material route.
- No new Redis, queue, cluster, or external storage dependency.
- No raw material in desired-state, receipts, logs, docs, Git, or chat.
- No broad live order creation.
- No quota or usage collector activation in this gate.
