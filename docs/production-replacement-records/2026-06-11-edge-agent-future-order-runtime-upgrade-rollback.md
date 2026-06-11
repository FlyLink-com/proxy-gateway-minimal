# Edge-Agent Future-Order Runtime Upgrade Rollback

Date: 2026-06-11

Risk: A

Target:

- Vultr Japan control plane `45.76.222.52`
- Vultr Singapore data plane `45.76.158.201` read-only validation only

Approved release:

- `edge-agent-future-order-runtime-20260611-001`
- Artifact:
  `.codex-artifacts/edge-agent-future-order-runtime-20260611-001/proxy-gateway-edge-agent-future-order-runtime-20260611-001.zip`
- SHA-256:
  `57D65811BE0D907C931C2BDE4B361DFE212EC90A10549879172EE80B47AD6020`

## Outcome

The runtime/schema upgrade did not complete. The gate uploaded and unpacked the
approved artifact and ran `npm ci`, but the Japan
`proxy-gateway-candidate.service` restart failed. The execution immediately
restored the `current` symlink to
`edge-agent-production-activation-20260610-005-worktree` and verified that the
existing production service remained active and healthy.

No DNS, Nginx, provider firewall, SGP runtime, payment, account/password,
subscription URL/token/password, private key, credential, SQLite row, raw
environment, raw config, or raw log output was changed or disclosed.

## Redacted Evidence

Verified before the attempted switch:

- Local artifact SHA-256 matched the approved value.
- Japan current release matched the approved rollback release before mutation.
- Japan public and private boundaries were healthy:
  - local health `200`
  - portal public `200`
  - subscription health public `200`
  - public Admin blocked
  - public internal agent route blocked
  - no-session portal API rejected
  - `tcp/3456` remained loopback-only
  - unauthenticated loopback internal route rejected
- Production control DB did not yet contain
  `platform_edge_desired_state_notifications` before the attempted upgrade.

Completed actions:

- Backed up Japan protected env, proxy config, control DB, and subscription DB.
- Uploaded and verified the approved artifact on Japan.
- Unpacked the approved artifact into the candidate release directory.
- Ran `npm ci` successfully for the candidate release.
- Switched `current` to the candidate release and attempted to restart only
  `proxy-gateway-candidate.service`.

Rollback evidence:

- Restart of `proxy-gateway-candidate.service` failed.
- `current` was restored to
  `edge-agent-production-activation-20260610-005-worktree`.
- `proxy-gateway-candidate.service` was active after rollback.
- Local production health returned `200` after rollback.

Singapore read-only validation after rollback:

- Japan-to-SGP SSH succeeded.
- SGP edge agent, Xray VLESS Reality, Hysteria2, and TUIC services were active.
- SGP `tcp/8443`, `udp/10443`, and `udp/443` listeners were present.
- SGP traffic stats remained loopback-only.

## Root Cause

Initial follow-up redacted diagnostics ran the candidate release against
temporary copies of the production control and subscription DBs on an alternate
loopback port. That first diagnostic used shell-sourcing to load the service
EnvironmentFiles. Later evidence showed that shell-sourcing is not a faithful
model for systemd EnvironmentFile parsing.

That first diagnostic incorrectly classified
`EDGE_DATA_PLANE_AGENT_NODES_JSON` as invalid JSON. The later protected-env
normalization gate corrected the finding:

- The protected EnvironmentFile material already resolves to a JSON array under
  a systemd-style parser.
- No protected environment rewrite was needed.
- The candidate can start successfully on an alternate loopback port when loaded
  through a root wrapper that reads EnvironmentFiles and drops privileges to
  `proxy-gateway`.
- The candidate can create
  `platform_edge_desired_state_notifications` in a temporary control DB.

The original service restart still failed during this gate and was safely
rolled back. A separately approved retry is required before promoting the
candidate release.

## Current State

- Japan production remains on
  `edge-agent-production-activation-20260610-005-worktree`.
- `edge-agent-future-order-runtime-20260611-001` exists on disk as an unpacked
  inactive release with dependencies installed.
- The real production control DB was not migrated by this failed gate.
- Singapore runtime was not mutated or restarted.

## Next Gate

Do not retry the `001` upgrade until one of these is explicitly approved:

1. A protected-env normalization gate that converts the Japan
   `EDGE_DATA_PLANE_AGENT_NODES_JSON` material into the JSON array format
   required by the current source contract, without outputting the value.
2. A new runtime candidate that preserves compatibility with the existing
   protected material shape and includes tests proving both accepted shapes.

Either path must include read-only inventory, backups, validation, rollback, and
the same sensitive-output restrictions as this gate.
