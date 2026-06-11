# Edge Agent Production Activation Approval Packet

Date: 2026-06-10, America/Los_Angeles.

## Status

- Type: production activation approval packet.
- Risk: A.
- Production execution: not approved by this document.
- Secrets included: no.
- Live order creation: not part of validation unless separately approved.

This packet converts the Stage 2 repository implementation and the first
read-only production inventory into an exact approval shape for activating the
edge-agent pull / apply / receipt loop. It is an approval template only; it does
not deploy an agent, expose a route, restart a service, mutate runtime config,
or authorize production traffic changes.

Update after repo-only apply follow-up: the agent library now supports explicit
apply with injected runtime adapters and protected credential material lookup.
Apply remains fail-closed by default. The production gate still must provide
the reviewed SGP agent wrapper/systemd command, adapter wiring, protected
material path, and rollback procedure; the CLI must not be treated as an
auto-discovered production mutator.

Update after activation readiness recheck: the `002` artifact was installed on
SGP during Gate 0, but that package does not contain
`agent/production-edge-agent.mjs` and must not be used for production
activation. The reviewed local candidate moved from `004` to `005`: `004`
added the production runner and protected token-file input, but its first
activation preflight found that real host runtime adapters could not complete a
non-mutating dry-run. `005` keeps the protected token-file input and adds a
redacted `dry_run_checked` path for real host runtime adapters before
controlled apply.

## Preconditions Already Recorded

- Repo-only Stage 2 implementation and validation are recorded in
  `docs/production-replacement-records/2026-06-10-edge-agent-stage2-repo-closeout-and-production-gate.md`.
- Production read-only inventory is recorded in
  `docs/production-replacement-records/2026-06-10-edge-agent-production-readonly-inventory.md`.
- The inventory found Japan control-plane service health, Singapore data-plane
  service/listener posture, Japan-to-Singapore SSH, and public Admin/internal
  boundary checks clean enough to prepare a separate exact-approved gate.

These facts are drift-prone. Re-run read-only inventory if this packet is not
executed immediately after approval.

## Required Exact Approval Fields

The operator approval must provide all of the following values. Placeholders are
not valid for execution.

- `release`: exact release directory name.
- `artifact`: local archive path.
- `archive_sha256`: exact SHA-256 of the archive.
- `target`: `Vultr Japan control plane 45.76.222.52 + SGP data plane 45.76.158.201 only`.
- `current_release`: current Japan runtime release, last observed as
  `vultr-japan-sgp-gate2-20260609-505eed9-static`.
- `agent_runtime`: exact SGP edge-agent install path or systemd unit name.
- `protected_material_source`: path or operator handoff name for protected node
  token material, without printing the value.
- `rollback_release`: previous Japan release to restore.
- `rollback_paths`: protected Japan env / DB backup paths and SGP runtime backup
  path names, without raw contents.

## Reviewed Artifact Candidate

Current candidate prepared after the dry-run preflight blocker:

- Release id: `edge-agent-production-activation-20260610-005-worktree`.
- Artifact:
  `D:\Projects\proxy-gateway-minimal\.codex-artifacts\edge-agent-production-activation-20260610-005-worktree\proxy-gateway-edge-agent-production-activation-20260610-005-worktree.zip`.
- Artifact SHA-256:
  `BB17E8E218E63A403041F5B5059BCBDE1DCDF199C7B5B82329E1CB4908343D5E`.
- File-like path count: `765`.
- Production artifact boundary result:
  - blocker count: `0`;
  - review-required count: `0`.
- Required runner file present:
  `agent/production-edge-agent.mjs`.
- Protected token-file support present:
  `EDGE_DATA_PLANE_AGENT_TOKEN_FILE`.
- Host adapter dry-run support present:
  `dry_run_checked` receipt for real host runtime adapters.
- Protected runtime config excluded:
  `config/proxy-servers.json`.

The earlier candidates must not be used for production activation:

- `edge-agent-production-activation-20260610-001-worktree`: its manifest
  included local generated/assistant residue that the repository boundary tests
  now reject.
- `edge-agent-production-activation-20260610-002-worktree`: it was used for SGP
  Gate 0 bootstrap material, but the installed package lacks the production
  runner file required by this activation gate.
- `edge-agent-production-activation-20260610-004-worktree`: it has the
  production runner and token-file support, but dry-run against real host
  runtime adapters fails with `adapter_invalid`, so it must not be used for the
  pull/apply/receipt activation gate.

## Execution Scope

Allowed only after exact approval:

- Back up Japan current symlink, protected env, proxy config, control DB, and
  subscription DB if configured.
- Back up SGP edge-agent metadata and approved runtime configs before any apply.
- Upload the verified runtime artifact to Japan and SGP as required by the
  approved runner layout.
- Run `npm ci` in the new Japan release directory and the SGP edge-agent
  release directory if dependencies are installed per host.
- Switch Japan `current` and SGP edge-agent `current` only to the approved
  release.
- Enable `EDGE_DATA_PLANE_AGENT_ROUTES_ENABLED=true` only in protected runtime
  env.
- Register node-agent token hash / node identity from protected material only;
  never print the token or raw hash.
- Install or update the SGP edge-agent as the approved private pull/apply
  runtime using protected token-file input such as
  `EDGE_DATA_PLANE_AGENT_TOKEN_FILE`, not raw token env output.
- Configure private SGP-to-Japan transport for agent requests; the public
  subscription domain must not be used for `/api/internal/*`.
- Start with an agent dry-run that fetches desired state and produces a redacted
  plan without mutating SGP configs.
- Run controlled apply only after dry-run passes and only through the reviewed
  adapter/material injection path.
- Config-test SGP Xray, Hysteria2, and TUIC before any approved service restart.
- Restart only the explicitly approved services:
  `proxy-gateway-candidate.service` on Japan and the approved SGP edge-agent /
  data-plane services after config-test.
- Post redacted receipts from SGP to Japan.

## Forbidden

Forbidden without a separate exact approval:

- DNS mutation.
- Nginx config mutation or reload.
- Provider firewall mutation.
- Public Admin exposure.
- Payment changes.
- Account or password generation.
- Live order creation.
- Subscription URL, token, password, private-key, credential, raw env, raw log,
  raw config, SQLite row, or customer-data output.
- Copying SGP runtime config or protected material into Git.
- Restarting unrelated services.

## Validation

Required validation after execution:

- Artifact SHA-256 matches approval.
- `npm ci` succeeds in the approved release.
- Japan `proxy-gateway-candidate.service` is active.
- Japan health endpoint returns HTTP 200.
- `portal.globalcirclecat.cloud/` returns HTTP 200.
- `sub.globalcirclecat.cloud/api/health` returns HTTP 200.
- Public Admin remains blocked.
- Public `/api/internal/data-plane-agent/*` remains unavailable without node
  authentication.
- No-session portal APIs still reject.
- Japan `tcp/3456` remains loopback-only.
- SGP edge-agent service is active or the approved operator-managed agent is
  running.
- SGP `tcp/8443`, `udp/10443`, and `udp/443` listeners are active.
- SGP Hysteria2 stats surface remains loopback-only.
- Agent desired-state route accepts the approved node identity in private scope
  without printing tokens.
- SGP dry-run receipt is accepted.
- SGP applied receipt is accepted after controlled apply.
- Render proof shows SGP remote channels are renderable only after the matching
  fresh applied receipt and not before.
- No live order is created during validation unless separately approved.

## Rollback

Rollback must restore:

- Previous Japan `current` symlink.
- Japan protected env backup.
- Japan control/subscription DB backups if touched.
- Previous SGP runtime configs if the agent applied a runtime change.
- Previous SGP agent service state.

Rollback validation:

- Japan health returns HTTP 200.
- Portal and subscription health endpoints remain public as expected.
- Public Admin remains blocked.
- No-session portal APIs reject.
- Public internal-agent route remains unavailable.
- SGP data-plane services return to their previous approved state.
- Remote channels fail closed if receipts or node lease state are absent.

## Approval Text Template

Use this exact shape when ready to authorize execution. Replace every
placeholder with a concrete reviewed value.

```text
批准执行 Vultr Japan/SGP edge-agent pull/apply/receipt 生产激活：
release=edge-agent-production-activation-20260610-005-worktree;
artifact=D:\Projects\proxy-gateway-minimal\.codex-artifacts\edge-agent-production-activation-20260610-005-worktree\proxy-gateway-edge-agent-production-activation-20260610-005-worktree.zip;
archive_sha256=BB17E8E218E63A403041F5B5059BCBDE1DCDF199C7B5B82329E1CB4908343D5E;
target=Vultr Japan control plane 45.76.222.52 + SGP data plane 45.76.158.201 only;
current_release=vultr-japan-sgp-gate2-20260609-505eed9-static;
agent_runtime=SGP gccgw-edge-agent.service using /opt/proxy-gateway-minimal-edge-agent/current/agent/production-edge-agent.mjs;
protected_material_source=/etc/gccgw-edge-agent/token and protected edge credential material file paths only, no value output;
scope=backup Japan current/protected env/proxy config/control DB/subscription DB and SGP approved runtime configs/agent metadata; upload verified artifact; npm ci where required; switch Japan current and SGP edge-agent current to the approved release; enable EDGE_DATA_PLANE_AGENT_ROUTES_ENABLED=true; register node identity/token hash from protected material only; configure private SGP-to-Japan agent transport; wire SGP EDGE_DATA_PLANE_AGENT_TOKEN_FILE/protected material/channel refs/apply gate; run agent dry-run; controlled apply after dry-run; config-test SGP Xray/Hy2/TUIC; restart only Japan proxy-gateway-candidate.service and approved SGP edge-agent/data-plane services after config-test; post redacted receipts; validate render proof;
validation=artifact hash ok, npm ci ok, Japan service active, health 200, portal/sub public 200, Admin blocked, no-session portal APIs reject, internal agent public reject, tcp3456 loopback-only, SGP agent active, SGP TCP8443/UDP10443/UDP443 active, stats loopback-only, dry-run receipt ok, applied receipt ok, render proof remote channels require fresh applied receipt, no live order creation;
rollback=restore previous Japan current symlink/protected env/DB backups and SGP runtime/agent backups, restart only affected approved services after config-test;
forbidden=DNS, Nginx config/reload, provider firewall, public Admin, payment, account/password generation, live order creation, subscription URL/token/password/private-key/credential output, SQLite row dump, raw env/log/config/runtime payload output, copying protected runtime config into Git.
```

Do not approve this gate until the artifact has been built, the archive hash has
been verified, and the protected material source has been confirmed by location
only.
