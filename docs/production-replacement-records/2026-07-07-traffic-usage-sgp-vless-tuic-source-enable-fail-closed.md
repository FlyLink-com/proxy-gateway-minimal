# Traffic Usage SGP VLESS/TUIC Source Enable Fail-Closed


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: traffic_usage_sgp_vless_tuic_source_enable_fail_closed
  superseded_by: null
  last_verified_at: 2026-07-07
  production_authority: false
```


Date: 2026-07-08 UTC

Risk: A

Approval: `traffic-usage-sgp-vless-tuic-source-enable-20260707`

Scope: approved attempt to enable SGP VLESS/TUIC usage sources through
loopback-only Xray stats and Mihomo external-controller, with Japan-side
multi-source collector wiring.

## Result

Fail-closed. SGP VLESS/TUIC usage collection was not enabled.

The existing production collector remained on the previously approved four
channels:

- `channel-vultr-a-hy2`
- `channel-sgp-a-hy2`
- `channel-vultr-a-tuic`
- `channel-vultr-a-vless-reality-tcp`

The final collector validation after rollback reported:

- `collectorCount`: 4
- `unresolvedCount`: 0
- collector service result: success
- `proxy-gateway-candidate.service`: active
- `gccgw-traffic-usage-collect.timer`: active

No `EDGE_XRAY_USAGE_SOURCES_JSON` or `EDGE_MIHOMO_USAGE_SOURCES_JSON` value was
left in production env.

## Backups

Japan backup root:

```text
/opt/proxy-gateway-minimal-candidate/backups/traffic-usage-sgp-vless-tuic-source-enable-20260707-20260708024829
```

SGP backup root:

```text
/root/gccgw-backups/traffic-usage-sgp-vless-tuic-source-enable-20260707-20260708024829/sgp
```

Backups include Japan `server/state.mjs`, env files, relevant systemd units,
control DB files, and SGP Xray/Mihomo active configs and service units.

## Execution Summary

Completed:

- Confirmed Japan control-plane services were active.
- Confirmed remote `server/state.mjs` had the prior JP usage channel-scope
  markers and did not yet have the new multi-source collector wiring.
- Confirmed SGP `xray-vless-reality.service`, `mihomo-tuic.service`, and
  `hysteria2.service` were active.
- Confirmed SGP had VLESS TCP 8443 and TUIC UDP 443 listeners.
- Confirmed SGP initially had no Xray stats loopback and no Mihomo controller
  loopback.
- Uploaded and hash-verified reviewed `server/state.mjs` to staging only.
- Generated SGP Xray and Mihomo usage-source candidate configs.
- Candidate config tests passed:
  - Xray candidate config test: exit 0.
  - Mihomo candidate config test: exit 0.
- Generated a protected Japan-side SGP TUIC credential map proof:
  - SGP runtime user keys fetched internally.
  - Material-store match count: 79 of 79.
  - Missing count: 0.

Stopped before completion:

- The reviewed `server/state.mjs` was not installed into
  `/opt/proxy-gateway-minimal-candidate/current`.
- Japan multi-source env was not set.
- `proxy-gateway-candidate.service` was not restarted for this rollout.
- SGP VLESS/TUIC reports were not added to the production collector.

## Blocker

After replacing SGP active Xray/Mihomo configs and restarting only the approved
SGP runtime services, `gccgw-edge-agent.service` subsequently restarted the SGP
runtime services and restored active Xray/Mihomo configs to their prior SHA.

Observed after the edge-agent reconciliation:

- SGP active Xray config no longer had stats/API/policy.
- SGP active Mihomo config no longer had external-controller/secret.
- SGP Xray stats loopback was absent.
- SGP Mihomo controller loopback was absent.

Because the loopback usage sources did not persist under the current SGP
edge-agent reconciliation model, Japan collector activation would have failed or
become unstable. The rollout was stopped fail-closed.

## Rollback Performed

Rolled back uncompleted source-prep changes:

- Stopped, disabled, and removed `gccgw-sgp-usage-source-tunnel.service`.
- Removed Japan local loopback tunnel listeners on `127.0.0.1:11085` and
  `127.0.0.1:19091`.
- Removed generated Japan-side protected SGP usage secret/map files from this
  attempt.
- Removed SGP candidate config files and temporary candidate script.

Final rollback validation:

- Japan usage tunnel unit: absent.
- Japan local SGP usage ports: absent.
- SGP runtime services: active.
- SGP Xray stats loopback: absent.
- SGP Mihomo controller loopback: absent.
- Existing collector: success, 4 collectors, `unresolvedCount=0`.

## Next Required Gate

SGP VLESS/TUIC usage source enablement now needs a separate reviewed change that
makes the SGP edge-agent/runtime reconciliation preserve approved loopback-only
usage-source settings. The next gate should include the edge-agent or runtime
adapter overlay in scope, not only active config replacement.

Do not approve Japan multi-source env activation until SGP active configs remain
stable after edge-agent reconciliation and service restarts.

## Sensitive Output Boundary

No subscription URLs, tokens, passwords, private keys, raw env, raw configs,
credential maps, controller payloads, or SQLite rows were recorded in this
document.
