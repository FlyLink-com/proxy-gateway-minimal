# Edge Agent Protected Material Sync Partial Activation


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: edge_agent_material_sync_partial_activation
  superseded_by: null
  last_verified_at: 2026-06-11
  production_authority: false
```


Date: 2026-06-11

Risk: A

Release:

- `edge-agent-protected-material-sync-20260611-001-worktree`

Target:

- Vultr Japan control plane: `45.76.222.52`
- Vultr Singapore data plane: `45.76.158.201`

## Scope Executed

- Verified the approved local artifact hash before upload.
- Backed up Japan protected runtime inputs and SGP agent/runtime metadata.
- Uploaded the approved artifact to Japan and verified the remote hash.
- Installed dependencies in the candidate release directory.
- Materialized the release-local candidate environment file from protected
  runtime material without printing values.
- Switched Japan `current` to the approved release.
- Restarted only `proxy-gateway-candidate.service` on Japan.
- Synced the reviewed production edge-agent source surface to the SGP current
  runtime directory because the SGP current release did not contain it.
- Ran SGP edge-agent dry-run and protected material summary preflight.

## Validation

Japan validation passed:

- Service active.
- Local health returned `200`.
- Public portal returned `200`.
- Public subscription health returned `200`.
- Public Admin route remained blocked.
- Public internal data-plane-agent route remained blocked.
- No-session portal API rejected.
- `tcp/3456` remained loopback-only.
- Unauthenticated internal route rejected.

SGP validation passed:

- Japan-to-SGP SSH succeeded.
- `gccgw-edge-agent.service` remained active.
- Xray, Hysteria2, and TUIC services remained active.
- SGP `tcp/8443`, `udp/10443`, and `udp/443` listeners were present.
- Hysteria2 stats endpoint remained loopback-only.
- Agent dry-run completed successfully.
- Protected material summary preflight succeeded without returning raw material.

## Stop Condition

The production apply step was intentionally not executed.

The SGP agent desired-state endpoint currently returns channel-level aggregate
state rather than a single-order scoped state:

- `channel-sgp-a-tuic`: 29 edge credential refs.
- `channel-sgp-a-hy2`: 36 edge credential refs.
- `channel-sgp-a-vless-reality-tcp`: 29 edge credential refs.
- Total: 94 edge credential refs.

The active approval allowed a controlled apply for exactly one approved test
order or existing reviewed order. Applying the returned desired state would
therefore mutate all currently active SGP channel credentials and exceed that
approval boundary.

## Current State

Japan is running the approved release and remains healthy. SGP runtime services
remain active, but no SGP credential apply was performed during this gate.

## Next Gate

Before production SGP runtime apply, choose one of:

1. Add and validate a single-order smoke path that can scope desired state by a
   reviewed order or notification without recording a false aggregate receipt.
2. Approve a full SGP aggregate apply for the current channel-level desired
   state.
