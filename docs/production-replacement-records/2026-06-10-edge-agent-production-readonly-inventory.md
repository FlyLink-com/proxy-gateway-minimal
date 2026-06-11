# Edge Agent Production Read-Only Inventory

Date: 2026-06-10, America/Los_Angeles.

## Scope

- Target: Vultr Japan control plane and Vultr Singapore data plane.
- Risk: A read-only inventory.
- Mutation: none.
- Services restarted: none.
- DNS, Nginx, firewall, provider firewall, systemd, runtime config, account,
  order, payment, subscription, token, password, private key, raw env, raw log,
  raw config, and SQLite row changes: none.

This record does not authorize production deployment or data-plane agent
activation. It records only safe status facts collected before a future exact
approval gate.

## Japan Control Plane Findings

- SSH from the operator device to Japan validated.
- Current release summary: `vultr-japan-sgp-gate2-20260609-505eed9-static`.
- `proxy-gateway-candidate.service`: active and enabled.
- Loopback health check on the control-plane service: HTTP 200.
- `tcp/3456`: one listener, loopback-only by read-only socket check.
- Protected environment files are declared by systemd, but values were not
  read or printed.
- Backup directories exist by count-based check.
- Protected handoff directory exists.
- Loopback request to the internal data-plane agent path without node
  authentication did not return a usable payload.

## Singapore Data Plane Findings

- Japan-to-Singapore SSH validated through the configured data-plane alias.
- `proxy-gateway-candidate.service`: active.
- `nginx.service`: active.
- `xray-vless-reality.service`: active.
- `hysteria2.service`: active.
- `mihomo-tuic.service`: active.
- Loopback health check on the Singapore gateway service: HTTP 200.
- `tcp/3456`: loopback-only by read-only socket check.
- `tcp/8443`: listener present.
- `udp/10443`: listener present.
- `udp/443`: listener present.
- Hysteria2 stats surface listener present on loopback-only expected port.
- Protected runtime directories and backup directory exist by count-based
  checks.

## Public Boundary Findings

Public status-code checks:

- `portal.globalcirclecat.cloud/`: HTTP 200.
- `sub.globalcirclecat.cloud/`: HTTP 404.
- `sub.globalcirclecat.cloud/api/health`: HTTP 200.
- `sub.globalcirclecat.cloud/api/admin/platform/subscription-usage-monitor`
  without Admin auth: HTTP 404.
- `sub.globalcirclecat.cloud/api/internal/data-plane-agent/desired-state`
  without node auth: HTTP 404.
- `portal.globalcirclecat.cloud/api/portal/access-requests/current` without a
  portal session: HTTP 401.

Result: public portal and subscription health remain reachable; public Admin
and public internal-agent route exposure were not observed.

## Gate Result

The read-only inventory is clean enough to prepare a separate exact-approved
production gate for the edge-agent pull/apply/receipt deployment.

The next gate must still explicitly name:

- release and artifact hash;
- Japan deployment target and Singapore agent/runtime target;
- protected node-agent token material source by location only;
- private route exposure strategy;
- exact service restart list;
- dry-run and validation commands;
- rollback release and protected runtime backup path.

No production deployment, route exposure, runtime apply loop, or live order
smoke was performed by this inventory.
