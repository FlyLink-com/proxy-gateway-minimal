# Edge-Agent Future-Order Runtime Retry EnvironmentFile Blocker

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

The retry did not complete. The candidate dependency verification passed and
the Japan `current` symlink was switched to
`edge-agent-future-order-runtime-20260611-001`, but
`proxy-gateway-candidate.service` failed during restart. The execution
immediately restored `current` to
`edge-agent-production-activation-20260610-005-worktree`, restored backed-up DB
files, and restarted the previous service successfully.

No DNS, Nginx, provider firewall, Singapore runtime, payment,
account/password, live order, subscription URL/token/password, private key,
credential, SQLite row, raw environment, raw config, or raw log output was
changed or disclosed.

## Redacted Validation

Preflight:

- Local artifact SHA-256 matched the approved value.
- Japan current release was
  `edge-agent-production-activation-20260610-005-worktree`.
- Candidate release directory existed and already had dependencies installed.
- Japan health and public boundaries were valid:
  - local health `200`
  - portal public `200`
  - subscription health public `200`
  - public Admin blocked
  - public internal agent route blocked
  - no-session portal API rejected
  - unauthenticated loopback internal route rejected
  - `tcp/3456` loopback-only
- Japan-to-SGP SSH worked.
- SGP edge agent, Xray VLESS Reality, Hysteria2, and TUIC services were active.
- SGP `tcp/8443`, `udp/10443`, and `udp/443` listeners were present.
- SGP traffic stats stayed loopback-only.

Retry execution:

- Created protected Japan backups for the current symlink target, protected
  env/config surfaces, systemd metadata, and discoverable DB files.
- Ran `npm ci` successfully in the candidate release.
- Switched `current` to the candidate release.
- Attempted to restart only `proxy-gateway-candidate.service`.
- Restart failed, so rollback ran immediately.

Rollback validation:

- Japan `current` returned to
  `edge-agent-production-activation-20260610-005-worktree`.
- `proxy-gateway-candidate.service` was active.
- Local health returned `200`.
- Portal public returned `200`.
- Subscription health public returned `200`.
- Public Admin and public internal agent routes remained blocked.
- No-session portal API and unauthenticated internal loopback route were
  rejected.
- `tcp/3456` remained loopback-only.

## Root Cause

The failure was not caused by the previously suspected
`EDGE_DATA_PLANE_AGENT_NODES_JSON` shape. The protected-env normalization gate
already proved that the protected material resolves to a JSON array under a
systemd-style parser and that the candidate can start on an alternate loopback
port with temporary DB copies.

The new redacted diagnostic found a systemd packaging boundary:

- The service has one `EnvironmentFile` path bound through the `current`
  release symlink.
- The approved candidate release does not contain the corresponding
  release-local environment file.
- The candidate release also does not contain `.env`, `.env.production`, or
  `protected.env`.

Therefore, when `current` points at the candidate, systemd fails while loading
the current-bound `EnvironmentFile`, before the Node process starts. This also
explains why the prior temp-start proof passed: that proof loaded protected
EnvironmentFiles through a wrapper and did not exercise the release-local
`current` EnvironmentFile dependency.

## Current State

- Japan production remains on
  `edge-agent-production-activation-20260610-005-worktree`.
- The real production control DB was not migrated.
- `edge-agent-future-order-runtime-20260611-001` remains an inactive candidate
  release on disk.
- Singapore runtime was only read and was not mutated or restarted.

## Next Gate

Do not retry the runtime/schema promotion until a separate exact Risk A gate
handles the systemd EnvironmentFile boundary. Acceptable approaches are:

1. Copy or materialize the required release-local EnvironmentFile into the
   candidate release from operator-protected runtime material, without outputting
   values.
2. Preferably harden the service so production environment material comes only
   from stable protected paths outside the `current` symlink, then retry the
   candidate switch.

Either path must include read-only inventory, protected backups, validation,
rollback, and the same sensitive-output restrictions as this gate.
