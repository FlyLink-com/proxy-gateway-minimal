# sgp-subscription-render-receipt-reconcile execution

Date: 2026-07-08 UTC
Risk: A

## Scope

Approved production target: `vul1/gccgw-vultr-candidate`.

The change repaired SGP subscription rendering by fixing the SGP edge-agent
runtime environment that prevented current applied receipts from being posted.

No subscription receipt gate was relaxed. No DNS, Nginx, firewall, SQLite schema,
Xray config, Hysteria2 config, Mihomo config, subscription URL, token, password,
private key, raw env file, raw config, credential map, controller payload, or
SQLite row was printed or recorded.

## Backups

Japan backup:

- `/opt/proxy-gateway-minimal-candidate/backups/sgp-subscription-render-receipt-reconcile-20260708-20260708052410`

SGP backup:

- `/root/gccgw-backups/sgp-subscription-render-receipt-reconcile-20260708-20260708052410`

The backups cover Japan current source/env/control DB and SGP edge-agent source,
env, runtime configs, relevant systemd unit state, and edge-agent wrapper scripts.

## Root Cause

The SGP edge-agent loop was active but failed each cycle with a redacted
`ENOENT` from the apply path. Current SGP desired-state existed, but the control
plane had no matching current applied receipts, so the remote-data-plane
subscription render gate correctly withheld all SGP channels.

The failing read was the Mihomo runtime controller secret file configured through
the edge-agent systemd environment. It pointed under `/root`, while
`gccgw-edge-agent.service` runs with `ProtectHome=true`, so the service saw that
file as missing. Running the reconcile outside the systemd sandbox succeeded,
which confirmed the data and runtime adapters were otherwise valid.

## Change

- Copied the existing Mihomo runtime controller secret into the edge-agent
  accessible protected area under `/etc/gccgw-edge-agent/`.
- Rewrote the existing SGP edge-agent usage-source drop-in so
  `EDGE_MIHOMO_RUNTIME_CONTROLLER_SECRET_FILE` points at the accessible protected
  file.
- Ran `systemctl daemon-reload`.
- Restarted `gccgw-edge-agent.service`.

## Validation

SGP edge-agent loop:

- `gccgw-edge-agent.service`: active
- last loop report: `ok=true`
- `desiredStateCount=3`
- `appliedCount=3`
- `materialCount=231`
- `receiptCount=3`
- last loop error file: empty

Current receipt gate:

- `channel-sgp-a-vless-reality-tcp`: current matching applied receipt present
- `channel-sgp-a-hy2`: current matching applied receipt present
- `channel-sgp-a-tuic`: current matching applied receipt present

Rendered subscription summary from a real delivered artifact:

- HTTP status: `200`
- edge credential count: `6`
- rendered channel count: `6`
- rendered JP channel count: `3`
- rendered SGP channel count: `3`

SGP service health:

- `xray-vless-reality.service`: active
- `hysteria2.service`: active
- `mihomo-tuic.service`: active
- SGP VLESS TCP `8443`: present
- SGP HY2 UDP `10443`: present
- SGP TUIC UDP `443`: present
- SGP Xray stats loopback listener: present
- SGP Mihomo controller loopback listener: present

## Rollback

Rollback remains backup based:

1. Restore the SGP edge-agent drop-in from the SGP backup.
2. Remove or restore `/etc/gccgw-edge-agent/mihomo-runtime-controller.secret` as
   appropriate for the backup state.
3. Run `systemctl daemon-reload`.
4. Restart `gccgw-edge-agent.service`.
5. If required, restore Japan control DB and SGP runtime configs from the listed
   backups.
6. Re-run the redacted receipt and rendered-channel validation.
