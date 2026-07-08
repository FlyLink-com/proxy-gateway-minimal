# Traffic Usage VLESS Xray Stats Runtime Execution - 2026-07-07

## Approval

- Approval ref: `traffic-usage-vless-xray-stats-runtime-20260707`
- Target: `vul1/gccgw-vultr-candidate`
- Risk tier: A

## Executed

- Backed up:
  - `/etc/xray/config.json`
  - `xray-vless-reality.service`
  - `/opt/proxy-gateway-minimal-candidate/current`
  - `/opt/proxy-gateway-minimal-candidate/.env`
  - `/opt/proxy-gateway-minimal-candidate/current/.env`
  - `gccgw-traffic-usage-collect.service`
  - `gccgw-traffic-usage-collect.timer`
  - control and subscription database copies
- Generated a loopback-only Xray stats/API/policy candidate.
- Preserved existing VLESS client count and Reality inbound count.
- Ran Xray config-test before and after replacement.
- Replaced `/etc/xray/config.json`.
- Restarted only `xray-vless-reality.service`.

## Backup

- Backup root:
  `/opt/proxy-gateway-minimal-candidate/backups/traffic-usage-vless-xray-stats-runtime-20260707-20260707T091119Z`

## Runtime Validation

- Current Xray service: active.
- Current Xray config has `stats` and `api`.
- Xray API inbound listens on loopback only at `127.0.0.1:10085`.
- Xray stats query succeeded.
- User traffic counters were visible and had safe user refs.

## Collector Gate Result

The collector enable step was stopped fail-closed.

Reason:

- Current `EDGE_CREDENTIAL_CHANNEL_REFS` includes both JP and SGP VLESS
  channels.
- Existing collector construction binds one `EDGE_XRAY_STATS_SERVER` to every
  configured VLESS channel.
- A read-only mapping precheck showed:
  - `channel-vultr-a-vless-reality-tcp`: all observed counters mapped.
  - `channel-sgp-a-vless-reality-tcp`: observed the same counters but all were
    node mismatches.

Mitigation applied:

- Restored `/opt/proxy-gateway-minimal-candidate/current/.env` from backup.
- `EDGE_XRAY_STATS_SERVER` is not present in the active collector env.
- Traffic usage timer remains active and currently reports only the existing
  HY2 collectors.
- Recent timer summary remained `unresolvedCount: 0`.

## Local Fix Prepared

Prepared a minimal backend scoping fix:

- `server/state.mjs`
  - Adds Xray-only usage collector filter via
    `EDGE_XRAY_USAGE_CHANNEL_REFS` / `EDGE_XRAY_STATS_CHANNEL_REFS`.
  - Keeps global `EDGE_CREDENTIAL_CHANNEL_REFS` behavior unchanged.
- `.env.example`
  - Documents `EDGE_XRAY_USAGE_CHANNEL_REFS=`.
- `server/tests/state.test.mjs`
  - Adds a regression test proving JP and SGP VLESS config only creates the
    explicitly scoped Xray collector.

Validation:

- `node --test server/tests/state.test.mjs`: 38 passed.
- Targeted Xray/TUIC proof tests: 8 passed.
- `npm test`: 923 passed.
- `git diff --check -- .env.example server/state.mjs server/tests/state.test.mjs`:
  exit 0 with only existing LF-to-CRLF warnings.

## Next Approval Needed

To complete VLESS usage collection safely, deploy the scoped backend fix and
then set:

- `EDGE_XRAY_STATS_SERVER=127.0.0.1:10085`
- `EDGE_XRAY_USAGE_CHANNEL_REFS=channel-vultr-a-vless-reality-tcp`

No Mihomo/TUIC controller, Hysteria2, DNS, Nginx, firewall, or SQLite schema
change is required for that follow-up.

## Follow-up: VLESS Channel Scope Enablement

Approval:

- `traffic-usage-vless-xray-channel-scope-20260707`

Backup:

- Backup root:
  `/opt/proxy-gateway-minimal-candidate/backups/traffic-usage-vless-xray-channel-scope-20260707-20260707T104143Z`
- Covered:
  - `/opt/proxy-gateway-minimal-candidate/current`
  - `/opt/proxy-gateway-minimal-candidate/.env`
  - `/opt/proxy-gateway-minimal-candidate/current/.env`
  - `gccgw-traffic-usage-collect.service`
  - `gccgw-traffic-usage-collect.timer`
  - control and subscription database copies

Change applied:

- Kept deployed `server/state.mjs` at hash
  `46afa0c92bc036df697a1ef5af23bd5c7a817c70bbcec17ab8b73fbdf9ba70ab`.
- Set only the approved collector env keys in `current/.env`:
  - `EDGE_XRAY_STATS_SERVER`
  - `EDGE_XRAY_USAGE_CHANNEL_REFS`
- Did not change Xray config, Nginx, DNS, firewall, backend service code,
  Hysteria2, TUIC/Mihomo controllers, or SQLite schema.
- Did not restart `xray-vless-reality.service`.

Validation:

- Collector construction check:
  - collector count: 3
  - collector channel refs:
    - `channel-vultr-a-hy2`
    - `channel-sgp-a-hy2`
    - `channel-vultr-a-vless-reality-tcp`
  - SGP VLESS collector: absent
- Triggered `gccgw-traffic-usage-collect.service` once.
- Service result: success, exit status 0.
- Timer remained active and waiting.
- Redacted collector summary:
  - collector count: 3
  - observation count: 15
  - recorded count: 15
  - inserted count: 15
  - unresolved count: 0
  - VLESS report: `channel-vultr-a-vless-reality-tcp`, collected, 12
    observations recorded, 0 unresolved

Result:

- VLESS usage collection is enabled only for the JP Xray stats channel.
- The previous SGP VLESS node-mismatch path is no longer constructed.
