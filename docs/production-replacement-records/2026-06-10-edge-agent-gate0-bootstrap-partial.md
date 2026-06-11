# Edge Agent Gate 0 Bootstrap Partial

Date: 2026-06-10, America/Los_Angeles.

## Status

- Type: Risk A production preparation gate.
- Scope executed: SGP edge-agent protected runtime bootstrap only.
- Japan protected env registration: later completed in
  `2026-06-10-edge-agent-gate0-japan-env-registration.md`.
- Secrets included: no.
- Live order creation: no.
- DNS / Nginx / provider firewall mutation: no.

## Approved Intent

Prepare the protected material and controllable SGP agent runtime needed before
the later edge-agent pull / apply / receipt production activation.

This was intentionally not the full production activation gate. The route
enablement and controlled apply loop remain separate.

## SGP Result

Completed on SGP data-plane host:

- Uploaded and verified the reviewed `edge-agent-production-activation-20260610-002-worktree` artifact.
- Installed the edge-agent runtime under the protected SGP agent root.
- Set the SGP agent `current` symlink to the reviewed `002` release.
- Created protected token and token-hash material without outputting either value.
- Installed `gccgw-edge-agent.service`.
- Left `gccgw-edge-agent.service` inactive.
- Left Xray / Hysteria2 / TUIC service state unchanged.

Validation summary:

- SGP edge-agent unit: present.
- SGP edge-agent service: inactive.
- SGP protected token material: present.
- SGP protected token-hash material: present.
- SGP current agent release: `edge-agent-production-activation-20260610-002-worktree`.

## Japan Result

Japan protected env registration was not completed.

The local operator SSH route to Japan was going through Mihomo / TUN, with the
observed public egress resolving to the SGP host. Direct local SSH to Japan
established TCP but timed out during SSH banner exchange. ProxyJump via SGP also
timed out because SGP could not connect to Japan `tcp/22`.

No Japan protected env write was confirmed. Specifically, the following agent
registration keys were not confirmed as written:

- `EDGE_DATA_PLANE_AGENT_ROUTES_ENABLED`
- `EDGE_DATA_PLANE_AGENT_NODES_JSON`
- `EDGE_DATA_PLANE_HANDOFF_DIR`

## Current Blocker

This record is superseded for the SSH blocker by:

- `2026-06-10-business-ssh-whitelist-vultr.md`
- `2026-06-10-edge-agent-gate0-japan-env-registration.md`

The remaining blocker moved from Gate 0 preparation to the later production
activation gate. Do not start `gccgw-edge-agent.service` until that separate
gate explicitly enables the internal agent routes and validates dry-run/apply
receipts.

Recommended next gate options:

1. Enable private/internal data-plane agent routes on Japan.
2. Restart Japan proxy-gateway.
3. Start SGP edge-agent.
4. Run dry-run pull, controlled apply, redacted receipts, and render proof.

## Rollback Notes

If Gate 0 needs to be rolled back before Japan registration:

- Stop and disable `gccgw-edge-agent.service` on SGP if it was started later.
- Restore or remove `/etc/systemd/system/gccgw-edge-agent.service`.
- Restore or remove `/etc/gccgw-edge-agent` protected material.
- Restore or remove the SGP edge-agent runtime root created for this gate.
- Run `systemctl daemon-reload` on SGP.

Do not remove unrelated Xray, Hysteria2, TUIC, Nginx, or production proxy-gateway
state.
