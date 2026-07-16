# Edge Agent Workspace

This file is a responsibility and navigation entrypoint. It does not establish
global, release, deployment, runtime, or production authority.

## Responsibility

`agent/` owns the local loopback edge-agent surface and the data-plane agent
runner and adapters that consume desired state, handle protected material at
runtime, apply supported edge configurations, and emit redacted receipts.

## Entry Points

- [local-edge-agent.mjs](local-edge-agent.mjs) starts the loopback-only local
  agent surface.
- [production-edge-agent.mjs](production-edge-agent.mjs) defines the one-shot
  data-plane runner and production runtime adapters.
- [channel-profile.mjs](channel-profile.mjs),
  [edge-tunnel.mjs](edge-tunnel.mjs), and
  [socks5-adapter.mjs](socks5-adapter.mjs) define local channel plumbing.
- [diagnostics.mjs](diagnostics.mjs) owns redacted diagnostic summaries.

## Development

Run `npm run agent:local` from the repository root only for the local loopback
surface. Use injected adapters and synthetic fixtures when developing the
production runner; do not use a production host or real protected material as
a development environment.

## Validation

Run the focused local-agent tests under `server/tests/local-edge-*.test.mjs` or
`node --test server/tests/production-edge-agent.test.mjs` for the changed
boundary, then `npm test` and
`git diff --check origin/master...HEAD`.

## Boundary

The production runner defaults and source-level dry runs are not authorization
to connect to or mutate a real runtime. SSH, provider access, protected
material, service changes, runtime apply, and production execution remain
separate Risk A actions with exact approval and validation.
