# traffic-usage-sgp-tuic-delta-sidecar gate

Date: 2026-07-08 UTC
Risk: A

## Scope

Prepare the production gate for enabling SGP TUIC usage accounting through a
separate Mihomo connection-delta sidecar.

This gate does not approve or execute production mutation. It records readonly
inventory, rollout boundaries, validation commands, rollback scope, and the
operator approval text required before execution.

## Local Overlay

Reviewed local overlay files:

- `server/services/edge/mihomo-connection-delta-usage-reader.mjs`
- `server/services/edge/mihomo-tuic-usage-collector.mjs`
- `scripts/mihomo-connection-delta-usage-sidecar.mjs`

Local SHA-256:

- `server/services/edge/mihomo-connection-delta-usage-reader.mjs`
  `9e5257aadf86cc942c3bd44fe1493103fabfde23d907ab8de135ffd34a5ab341`
- `server/services/edge/mihomo-tuic-usage-collector.mjs`
  `75294a6b82611e11546f1edf256aff2f4ad0b4d32a5f620345936360eafa2843`
- `scripts/mihomo-connection-delta-usage-sidecar.mjs`
  `87200689b40ab8924dc0479237d47f38bf42c859ca1e3eda7607bc18e13ac4ba`

## Readonly Production Inventory

Target: `vul1/gccgw-vultr-candidate`.

Japan:

- `proxy-gateway-candidate.service`: active
- `gccgw-traffic-usage-collect.timer`: active
- `gccgw-sgp-usage-source-tunnel.service`: active
- SGP Xray tunnel listener `127.0.0.1:11085`: present
- SGP Mihomo tunnel listener `127.0.0.1:19091`: present
- current source directory: present
- current `.env`: present
- protected directory: present
- protected directory owner/mode: `proxy-gateway:proxy-gateway` / `700`
- `proxy-gateway` OS user: present
- Node path: `/usr/bin/node`
- sidecar script on remote: missing
- delta reader on remote: missing
- current remote TUIC collector SHA-256:
  `39c9d426a05cec7d0bab9b1c1bda8aa453694ab444f3ef902a77306fd26f468d`

Current sanitized usage source shape:

- Mihomo source array count: 1
- Mihomo active `channelRefs`: `channel-vultr-a-tuic`
- Xray source array count: 2
- Xray active `channelRefs`:
  - `channel-vultr-a-vless-reality-tcp`
  - `channel-sgp-a-vless-reality-tcp`

Protected material metadata:

- SGP TUIC credential map candidate:
  `sgp-tuic-usage-credential-map.json`, mode `600`,
  owner `proxy-gateway:proxy-gateway`
- SGP Mihomo runtime controller secret candidate:
  `sgp-mihomo-runtime-controller.secret`, mode `600`,
  owner `proxy-gateway:proxy-gateway`

SGP:

- `gccgw-edge-agent.service`: active
- `xray-vless-reality.service`: active
- `mihomo-tuic.service`: active
- Mihomo controller listener `127.0.0.1:19090`: present
- TUIC UDP 443 listener: present
- Node runtime: present

## Rollout Design

Do not add `channel-sgp-a-tuic` back to the existing five-minute
`gccgw-traffic-usage-collect.timer` collector.

Install a separate Japan-side one-shot service and timer:

- service: `gccgw-sgp-tuic-delta-usage-sidecar.service`
- timer: `gccgw-sgp-tuic-delta-usage-sidecar.timer`
- run user/group: `proxy-gateway:proxy-gateway`
- working directory: `/opt/proxy-gateway-minimal-candidate/current`
- executable: `/usr/bin/node`
- script:
  `/opt/proxy-gateway-minimal-candidate/current/scripts/mihomo-connection-delta-usage-sidecar.mjs`
- timer cadence: `OnBootSec=30s`, `OnUnitActiveSec=10s`,
  `AccuracySec=1s`

Protected sidecar environment file:

- `/opt/proxy-gateway-minimal-candidate/protected/sgp-tuic-delta-sidecar.env`
- owner/mode: `proxy-gateway:proxy-gateway` / `600`
- contains only paths, channel ref, loopback controller URL, and non-secret
  flags
- references the protected controller secret file instead of storing the secret
  value inline

Protected state file:

- `/opt/proxy-gateway-minimal-candidate/protected/sgp-tuic-connection-delta-state.json`
- owner/mode: `proxy-gateway:proxy-gateway` / `600`
- stores sanitized connection ids, edge credential refs, counters, and timestamps
- does not store runtime user ids, passwords, controller payloads, remote IPs,
  subscription links, tokens, private keys, or SQLite rows

Sidecar env entries to configure:

- `MIHOMO_CONNECTION_DELTA_CONTROLLER_URL=http://127.0.0.1:19091`
- `MIHOMO_CONNECTION_DELTA_CONTROLLER_SECRET_FILE=/opt/proxy-gateway-minimal-candidate/protected/sgp-mihomo-runtime-controller.secret`
- `MIHOMO_CONNECTION_DELTA_CHANNEL_REF=channel-sgp-a-tuic`
- `MIHOMO_CONNECTION_DELTA_STATE_PATH=/opt/proxy-gateway-minimal-candidate/protected/sgp-tuic-connection-delta-state.json`
- `MIHOMO_CONNECTION_DELTA_CREDENTIAL_MAP_PATH=/opt/proxy-gateway-minimal-candidate/protected/sgp-tuic-usage-credential-map.json`
- `MIHOMO_CONNECTION_DELTA_CONTROL_DB_PATH=<value from current SUBSCRIPTION_CONTROL_DB_PATH>`
- `MIHOMO_CONNECTION_DELTA_RECORD_USAGE=0` for warmup
- `MIHOMO_CONNECTION_DELTA_RECORD_USAGE=1` only after warmup validation passes

## Validation Plan

Local preflight already run:

- `node --check server/services/edge/mihomo-connection-delta-usage-reader.mjs`
- `node --check scripts/mihomo-connection-delta-usage-sidecar.mjs`
- `node --check server/services/edge/mihomo-tuic-usage-collector.mjs`
- `node --test server/tests/mihomo-connection-delta-usage-sidecar.test.mjs server/tests/edge-mihomo-connection-delta-usage-reader.test.mjs server/tests/edge-mihomo-external-controller-usage-reader.test.mjs`

Execution validation after approval:

1. Back up current source files, protected sidecar env/state files if present,
   and the two sidecar systemd units/timers if present.
2. Upload the reviewed overlay files and verify SHA-256 on the remote host.
3. Create the protected sidecar env file with `RECORD_USAGE=0`.
4. Run sidecar check and one warmup `--collect` command as `proxy-gateway`.
   Expected: redacted JSON, no raw controller payload, no secret output, and no
   control DB write.
5. Confirm the protected state file exists with owner/mode
   `proxy-gateway:proxy-gateway` / `600`.
6. Switch sidecar env to `RECORD_USAGE=1`.
7. Install and enable the sidecar timer.
8. Trigger the sidecar service once and inspect only redacted summary fields.
9. Confirm:
   - sidecar service/timer active or last run successful
   - proxy service still active
   - existing five-source collector timer still active
   - SGP tunnel still active
   - SGP Mihomo controller and TUIC listener still present
   - no raw runtime payload, controller secret, credential map content,
     subscription URL, token, password, private key, raw env, raw config, or
     SQLite row was printed

## Known Risk

This sidecar converts active Mihomo `/connections` snapshots into per-connection
deltas. It is safer than adding SGP TUIC to the five-minute collector, but it is
still a polling model.

Residual risk:

- connections that start and finish between polling windows can be undercounted;
- timer-based polling cannot provide perfect persistent TUIC accounting unless
  the runtime exposes native durable per-user counters.

This risk must be explicitly accepted in the production approval.

## Rollback Plan

Rollback is limited to Japan control-plane runtime files and sidecar units:

1. Disable and stop `gccgw-sgp-tuic-delta-usage-sidecar.timer`.
2. Stop `gccgw-sgp-tuic-delta-usage-sidecar.service` if active.
3. Restore backed-up overlay files.
4. Restore or remove backed-up sidecar env/state files as appropriate.
5. Restore or remove sidecar systemd units/timers as appropriate.
6. Reload systemd daemon.
7. Verify `proxy-gateway-candidate.service`,
   `gccgw-traffic-usage-collect.timer`, and
   `gccgw-sgp-usage-source-tunnel.service` remain active.
8. Do not mutate DNS, Nginx, firewall, Xray, Hysteria2, Mihomo runtime config,
   or SQLite schema.

Rollback does not delete already recorded usage samples. If usage samples need
business adjustment, that must be a separate controlled accounting decision.

## Approval Text

Suggested approval:

批准上线 traffic-usage-sgp-tuic-delta-sidecar-20260708 到
vul1/gccgw-vultr-candidate：上传并校验 reviewed overlay
server/services/edge/mihomo-connection-delta-usage-reader.mjs、
server/services/edge/mihomo-tuic-usage-collector.mjs、
scripts/mihomo-connection-delta-usage-sidecar.mjs；备份 current、current/.env、
protected/sgp-tuic-delta-sidecar.env、protected/sgp-tuic-connection-delta-state.json、
gccgw-sgp-tuic-delta-usage-sidecar.service/timer、proxy-gateway-candidate.service、
gccgw-traffic-usage-collect.service/timer、gccgw-sgp-usage-source-tunnel.service
和控制库；仅覆盖上述 overlay 文件，不改 DNS/Nginx/firewall/Xray/Hysteria2/SGP
Mihomo runtime config/SQLite schema，不把 channel-sgp-a-tuic 加回现有 5 分钟
collector；创建 protected sidecar env/state，使用
sgp-mihomo-runtime-controller.secret 和 sgp-tuic-usage-credential-map.json，
先以 RECORD_USAGE=0 warmup，再切换 RECORD_USAGE=1，安装并启用
gccgw-sgp-tuic-delta-usage-sidecar.service/timer，每 10 秒轮询 SGP Mihomo
loopback controller 并写入 per-connection delta usage；我接受轮询模型可能漏计
短于轮询窗口的极短连接；执行后验证 sidecar service/timer、proxy、现有 collector
timer、SGP tunnel active，且输出仅为脱敏摘要；不输出订阅链接、token、密码、私钥、
原始 env、原始配置、credential map、controller payload 或 SQLite 行；按当前备份回滚。
