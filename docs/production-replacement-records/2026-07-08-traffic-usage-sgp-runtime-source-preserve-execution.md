# traffic-usage-sgp-runtime-source-preserve-20260708 execution

Date: 2026-07-08 UTC
Risk: A

## Scope

Approved production target: `vul1/gccgw-vultr-candidate`.

Reviewed overlay files:

- `agent/production-edge-agent.mjs`
- `server/services/edge/xray-vless-reality-runtime-adapter.mjs`
- `server/services/edge/mihomo-tuic-runtime-adapter.mjs`
- `server/services/edge/mihomo-tuic-host-runtime-adapter.mjs`
- `server/state.mjs`

Package SHA-256:

- `db27cf7c3d10278e5b48225a818e8c79d8fa7a22be448bd0e43805f9f10c2317`

## Backups

Japan backup:

- `/opt/proxy-gateway-minimal-candidate/backups/traffic-usage-sgp-runtime-source-preserve-20260708-20260708034110`

SGP backup:

- `/root/gccgw-backups/traffic-usage-sgp-runtime-source-preserve-20260708-20260708034110`

The SGP backup includes an additional archive of the actual edge-agent runtime
source resolved from `/opt/proxy-gateway-minimal-edge-agent/current`.

## Execution Summary

- Installed the reviewed overlay on Japan current source.
- Installed the reviewed overlay on SGP candidate current source.
- Found that SGP `gccgw-edge-agent.service` actually executes
  `/opt/proxy-gateway-minimal-edge-agent/current`, so the same overlay was
  installed there after adding a backup of the resolved runtime current source.
- Added SGP edge-agent drop-in for loopback-only runtime usage sources:
  Xray stats on `127.0.0.1:10085` and Mihomo controller on
  `127.0.0.1:19090`.
- Created protected Mihomo controller secret material without printing its
  content.
- Triggered SGP edge-agent reconciliation. Redacted result showed
  `desiredStateCount=3`, `appliedCount=3`, `materialCount=234`,
  `receiptCount=3`.
- Created Japan loopback-only SGP usage tunnel:
  `127.0.0.1:11085` for SGP Xray stats and `127.0.0.1:19091` for SGP Mihomo
  controller.
- Generated protected SGP TUIC runtime credential map. Runtime users matched
  protected material: `78/78`.
- Configured Japan usage source JSON for JP/SGP VLESS and JP TUIC.

## Validation

SGP runtime preservation:

- `gccgw-edge-agent.service`: active
- `xray-vless-reality.service`: active
- `mihomo-tuic.service`: active
- `hysteria2.service`: active
- SGP Xray stats listener: `127.0.0.1:10085`
- SGP Mihomo controller listener: `127.0.0.1:19090`
- SGP VLESS TCP 8443 listener: present
- SGP TUIC UDP 443 listener: present
- After restarting SGP edge-agent and then restarting Xray/Mihomo, the Xray
  stats API and Mihomo external-controller remained present and loopback-only.

Japan services:

- `proxy-gateway-candidate.service`: active
- `gccgw-traffic-usage-collect.timer`: active
- `gccgw-sgp-usage-source-tunnel.service`: active
- Japan SGP Xray tunnel listener: `127.0.0.1:11085`
- Japan SGP Mihomo tunnel listener: `127.0.0.1:19091`

Usage collection:

- Full six-source probe created collectors for JP/SGP VLESS and JP/SGP TUIC.
- SGP VLESS collected and recorded successfully.
- SGP TUIC failed closed with blocker `node_aggregate_only`: the Mihomo
  `/connections` source did not provide per-credential rows at validation time.
- To keep the production timer healthy, SGP TUIC was removed from active usage
  sources while preserving its loopback controller, protected secret, protected
  map, and tunnel for follow-up proof.
- Final active collector run succeeded:
  - `collectorCount=5`
  - `observationCount=28`
  - `recordedCount=28`
  - `insertedCount=28`
  - `unresolvedCount=0`
  - active channels:
    - `channel-vultr-a-hy2`
    - `channel-sgp-a-hy2`
    - `channel-vultr-a-tuic`
    - `channel-vultr-a-vless-reality-tcp`
    - `channel-sgp-a-vless-reality-tcp`

## Non-Goals Observed

- No Hysteria2 config changes were made.
- No DNS, Nginx, firewall, or SQLite schema changes were made.
- No subscription links, tokens, passwords, private keys, raw env files, raw
  configs, credential map contents, controller payloads, or SQLite rows were
  printed or recorded.

## Follow-Up

SGP TUIC usage should remain fail-closed until a redacted proof shows that the
Mihomo source returns per-credential rows rather than aggregate-only data.
