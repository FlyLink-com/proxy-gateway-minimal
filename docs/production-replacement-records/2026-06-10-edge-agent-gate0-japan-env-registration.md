# Edge Agent Gate 0 - Japan Env Registration Completion

Date: 2026-06-10, America/Los_Angeles.

Risk: A

## Scope

This execution completed the remaining Gate 0 registration step after the
business SSH whitelist repair restored Japan and Singapore SSH reachability.

Allowed changes:

- Register the SGP edge-agent node metadata in Japan protected runtime env.
- Ensure the Japan protected handoff directory exists with restricted
  permissions.
- Keep agent routes disabled.

Explicitly not performed:

- No Japan `proxy-gateway-candidate.service` restart.
- No SGP `gccgw-edge-agent.service` start.
- No Xray, Hysteria2, TUIC, Mihomo, Nginx, DNS, firewall, payment, account,
  password, live order, subscription URL/token, SQLite row, raw env, raw log, or
  raw config mutation/output.

## Result

Japan protected env registration was completed for:

- `EDGE_DATA_PLANE_AGENT_ROUTES_ENABLED=false`
- `EDGE_DATA_PLANE_AGENT_NODES_JSON`
- `EDGE_DATA_PLANE_HANDOFF_DIR`

The SGP node registration uses the protected SGP token hash generated during
the earlier Gate 0 SGP bootstrap. No token or hash value was printed or recorded.

The SGP edge-agent service remains installed but inactive. This means Gate 0 is
now prepared, but the pull/apply/receipt production loop is still not active.

## Validation

Validated without printing protected values:

- Japan env files contain all three Gate 0 keys.
- `EDGE_DATA_PLANE_AGENT_NODES_JSON` parses as a JSON array.
- The registered node ref is `node-sgp-a`.
- The registered node has three channel refs.
- The token hash field has the expected SHA-256 hash shape.
- Japan `proxy-gateway-candidate.service` remains active.
- Japan `tcp/3456` remains loopback-only.
- `sub.globalcirclecat.cloud/api/health` returns HTTP 200.
- `portal.globalcirclecat.cloud/` returns HTTP 200.
- Public Admin remains blocked.
- Public internal edge-agent route remains unavailable.
- No-session portal API still rejects.
- SGP `gccgw-edge-agent.service` remains inactive.
- SGP Xray, Hysteria2, and TUIC services remain active.

## Follow-Up Gate

Next production gate, if approved separately, is activation:

- Enable private/internal data-plane agent routes.
- Restart Japan proxy-gateway.
- Start SGP edge-agent.
- Run SGP dry-run pull.
- Run controlled apply only after dry-run passes.
- Config-test and restart only approved SGP data-plane services if the apply
  requires it.
- Post redacted dry-run and applied receipts.
- Validate render proof that remote channels require fresh applied receipts.

This record does not authorize that activation.
