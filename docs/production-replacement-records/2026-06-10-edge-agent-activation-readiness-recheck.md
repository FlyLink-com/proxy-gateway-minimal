# Edge Agent Activation Readiness Recheck

Date: 2026-06-10, America/Los_Angeles.

Risk: A

## Scope

After operator approval to continue the edge-agent activation lane, a read-only
recheck validated the live Japan control-plane and Singapore data-plane posture
before any route enablement, service start, restart, or runtime mutation.

No production service was restarted, no provider firewall, DNS, Nginx, systemd,
runtime config, account, order, payment, subscription token, password, private
key, raw environment, raw config, raw log, or SQLite row was changed or printed.

## Live Findings

Japan control-plane:

- SSH from the operator workstation to Japan succeeds.
- `proxy-gateway-candidate.service` is active.
- The service environment paths contain the Gate 0 agent registration keys:
  `EDGE_DATA_PLANE_AGENT_ROUTES_ENABLED`,
  `EDGE_DATA_PLANE_AGENT_NODES_JSON`, and
  `EDGE_DATA_PLANE_HANDOFF_DIR`.
- The local internal desired-state route exists but rejects unauthenticated
  loopback requests.
- Public health and portal checks pass.
- Public `/api/internal/*` and Admin routes remain blocked.

Singapore data-plane:

- SSH from the operator workstation to Singapore succeeds.
- Singapore can reach Japan `tcp/22`; Japan `tcp/3456` remains unavailable
  from Singapore, preserving the loopback-only Admin/control boundary.
- `xray-vless-reality.service`, `hysteria2.service`, and `mihomo-tuic.service`
  are active.
- Singapore data-plane listeners are active on `tcp/8443`, `udp/10443`, and
  `udp/443`.
- Hysteria2 stats remains loopback-only.
- `gccgw-edge-agent.service` is installed but inactive.
- The installed edge-agent environment still classifies its base URL as the
  public subscription domain.
- The installed edge-agent environment does not yet contain the production
  runner keys needed for protected token/material/channel/apply wiring.

Provider firewall and host boundary:

- Vultr provider firewall metadata shows the Japan firewall group allows
  `tcp/22` from the Singapore host address.
- Japan UFW allows `tcp/22`.
- The earlier `sh`-based `/dev/tcp` probe was a false negative on Singapore;
  a bash-based probe confirms Singapore can reach Japan `tcp/22`.

## Decision

Production activation remains blocked.

The blocker is no longer a Japan protected env registration problem or a basic
Japan/Singapore SSH reachability problem. The current blocker is SGP agent
production wiring:

- the SGP agent still targets the public subscription domain instead of a
  private/loopback transport to Japan's internal agent routes;
- the SGP agent service environment lacks the reviewed production runner
  token/material/channel/apply inputs; and
- the SGP agent is intentionally inactive.

Do not start `gccgw-edge-agent.service` yet.

## Required Next Gate

The next exact-approved Risk A gate should be limited to:

1. install or configure a private SGP-to-Japan transport, such as an SSH local
   tunnel from SGP loopback to Japan loopback `3456`, without exposing
   `/api/internal/*` publicly;
2. update the SGP edge-agent systemd environment to use the reviewed production
   runner contract and protected token/material/channel inputs without printing
   values;
3. start with a dry-run receipt;
4. only after dry-run success, run controlled apply, config-test affected SGP
   data-plane runtimes, restart only approved SGP services if required, and
   post redacted applied receipts; and
5. validate that normal subscription rendering requires fresh applied receipts
   for remote Singapore channels.

This record does not authorize that gate.
