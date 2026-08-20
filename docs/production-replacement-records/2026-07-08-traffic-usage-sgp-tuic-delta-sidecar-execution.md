# traffic-usage-sgp-tuic-delta-sidecar execution


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: traffic_usage_sgp_tuic_delta_sidecar_execution
  superseded_by: null
  last_verified_at: 2026-07-08
  production_authority: false
```


Date: 2026-07-08 UTC
Risk: A

## Scope

Approved production target: `vul1/gccgw-vultr-candidate`.

Approved overlay:

- `server/services/edge/mihomo-connection-delta-usage-reader.mjs`
- `server/services/edge/mihomo-tuic-usage-collector.mjs`
- `scripts/mihomo-connection-delta-usage-sidecar.mjs`

The deployment did not modify DNS, Nginx, firewall, Xray, Hysteria2, SGP
Mihomo runtime config, or SQLite schema. `channel-sgp-a-tuic` was not added back
to the existing five-minute `gccgw-traffic-usage-collect.timer` collector.

## Backup

Backup directory:

- `/opt/proxy-gateway-minimal-candidate/backups/traffic-usage-sgp-tuic-delta-sidecar-20260708-20260708045337`

The backup includes:

- current source archive
- current `.env`
- existing overlay target files when present
- protected sidecar env/state files when present
- sidecar service/timer when present
- `proxy-gateway-candidate.service`
- `gccgw-traffic-usage-collect.service/timer`
- `gccgw-sgp-usage-source-tunnel.service`
- control DB files, including WAL/SHM files when present

## Overlay Verification

Remote upload SHA-256 matched the reviewed local files:

- `server/services/edge/mihomo-connection-delta-usage-reader.mjs`
  `9e5257aadf86cc942c3bd44fe1493103fabfde23d907ab8de135ffd34a5ab341`
- `server/services/edge/mihomo-tuic-usage-collector.mjs`
  `75294a6b82611e11546f1edf256aff2f4ad0b4d32a5f620345936360eafa2843`
- `scripts/mihomo-connection-delta-usage-sidecar.mjs`
  `87200689b40ab8924dc0479237d47f38bf42c859ca1e3eda7607bc18e13ac4ba`

Remote `node --check` passed for all three overlay files before installation.

## Execution Summary

- Installed the reviewed overlay files into Japan current source.
- Created protected sidecar env file with owner/mode
  `proxy-gateway:proxy-gateway` / `600`.
- Created sidecar state file during warmup with owner/mode
  `proxy-gateway:proxy-gateway` / `600`.
- Installed:
  - `gccgw-sgp-tuic-delta-usage-sidecar.service`
  - `gccgw-sgp-tuic-delta-usage-sidecar.timer`
- Warmed up with `RECORD_USAGE=0`.
- After warmup success, switched protected sidecar env to `RECORD_USAGE=1`.
- Enabled and started the sidecar timer.

The sidecar runs as a oneshot service every 10 seconds through systemd timer.
The service being `inactive` after each run is expected for a successful
oneshot.

## Validation

Immediate deployment validation:

- warmup result: `success`
- warmup exit status: `0`
- sidecar state file mode: `600`
- sidecar state file owner: `proxy-gateway:proxy-gateway`
- sidecar env file mode: `600`
- sidecar env file owner: `proxy-gateway:proxy-gateway`
- sidecar service result after record-mode run: `success`
- sidecar service exit status after record-mode run: `0`
- sidecar timer: `active`
- sidecar timer enabled: `enabled`
- `proxy-gateway-candidate.service`: active
- `gccgw-traffic-usage-collect.timer`: active
- `gccgw-sgp-usage-source-tunnel.service`: active
- Japan SGP Mihomo tunnel listener `127.0.0.1:19091`: present

Follow-up timer validation after waiting for timer cycles:

- sidecar timer: active
- sidecar timer enabled: enabled
- sidecar service result: success
- sidecar service exit status: 0
- sidecar failed units: 0
- sidecar redacted summaries in the last two minutes: 8
- latest sidecar summary `ok`: yes
- latest sidecar observation count: 0
- latest sidecar recorded count: 0
- state file mode: 600
- state file owner: `proxy-gateway:proxy-gateway`
- state file JSON: valid
- `proxy-gateway-candidate.service`: active
- `gccgw-traffic-usage-collect.timer`: active
- `gccgw-sgp-usage-source-tunnel.service`: active
- Japan SGP Xray tunnel listener `127.0.0.1:11085`: present
- Japan SGP Mihomo tunnel listener `127.0.0.1:19091`: present

SGP validation:

- `gccgw-edge-agent.service`: active
- `xray-vless-reality.service`: active
- `mihomo-tuic.service`: active
- SGP Mihomo controller listener `127.0.0.1:19090`: present
- SGP TUIC UDP 443 listener: present

At validation time there were no active SGP TUIC observations, so the sidecar
recorded zero usage rows. This is expected for an idle connection window.

## Safety

No subscription links, tokens, passwords, private keys, raw env files, raw
configs, credential map contents, controller payloads, or SQLite rows were
printed or recorded in this execution note.

The accepted residual risk remains: timer-based polling can undercount
connections that start and finish between polling windows.

## Rollback

Rollback remains the approved backup-based rollback:

1. Disable and stop `gccgw-sgp-tuic-delta-usage-sidecar.timer`.
2. Stop `gccgw-sgp-tuic-delta-usage-sidecar.service` if active.
3. Restore the backed-up overlay files from the backup directory.
4. Restore or remove sidecar env/state files as needed.
5. Restore or remove sidecar systemd units/timers as needed.
6. Run `systemctl daemon-reload`.
7. Verify `proxy-gateway-candidate.service`,
   `gccgw-traffic-usage-collect.timer`, and
   `gccgw-sgp-usage-source-tunnel.service` remain active.

Rollback does not delete usage rows already recorded before rollback. Any
business adjustment to usage samples requires a separate controlled accounting
decision.
