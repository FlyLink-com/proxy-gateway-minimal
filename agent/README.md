# Edge Agent

The edge agent is a repo-only library and CLI foundation for the remote
data-plane pull/apply/receipt loop.

Current boundaries:

- It pulls desired state from `/api/internal/data-plane-agent/desired-state`.
- It sends per-channel lease heartbeats and redacted apply receipts.
- Dry-run remains the default behavior.
- Runtime apply is fail-closed unless the embedding process explicitly creates
  the agent with `allowApply: true` and injects approved runtime adapters plus a
  protected credential material store.
- The repository tests cover injected apply adapters and protected material
  lookup. The CLI still does not auto-discover production paths, install
  systemd units, or mutate Xray, Hysteria2, TUIC, Nginx, firewall, or
  production runtime configs by itself.
- The CLI reads the bearer token from `EDGE_DATA_PLANE_AGENT_TOKEN`; do not pass
  agent tokens as command-line arguments.
- `agent/production-edge-agent.mjs` is the reviewed production-runner contract
  for the next Risk A gate. It refuses public agent base URLs, accepts only
  private loopback/RFC1918 transport targets, requires declared channel runtime
  adapters, and requires a protected material store before apply mode can run.
  It is still inert until production env, private transport, and systemd
  activation are approved separately.
- Production installation is a separate Risk A gate.

Do not put tokens, subscription URLs, private keys, raw runtime configs, raw
logs, or SQLite rows in this directory.
