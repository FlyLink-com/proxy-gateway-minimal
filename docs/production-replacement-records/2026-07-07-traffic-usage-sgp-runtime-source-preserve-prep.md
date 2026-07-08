# Traffic Usage SGP Runtime Source Preserve Prep

Date: 2026-07-08 UTC

Risk: A

Scope: local source preparation for the follow-up SGP VLESS/TUIC traffic usage
gate after `traffic-usage-sgp-vless-tuic-source-enable-20260707` failed closed.
This record does not approve or execute production mutation.

## Problem

The previous SGP source-enable gate proved that candidate Xray and Mihomo
usage-source configs could pass config tests, but the SGP edge-agent/runtime
reconciliation restored active Xray/Mihomo configs to the prior shape after
restart. As a result:

- SGP Xray stats/API/policy did not persist.
- SGP Mihomo external-controller did not persist.
- Japan multi-source collector activation was correctly not enabled.

## Local Fix

Local source now lets the runtime reconciliation layer own the loopback-only
usage-source settings instead of applying them as one-off active config edits:

- Xray VLESS host config generation can preserve a loopback-only stats/API
  source through `EDGE_XRAY_RUNTIME_STATS_SERVER`.
- Mihomo TUIC host config generation can preserve a loopback-only
  external-controller through `EDGE_MIHOMO_RUNTIME_CONTROLLER_URL` plus a direct
  or file-backed `EDGE_MIHOMO_RUNTIME_CONTROLLER_SECRET`.
- Production edge-agent env wiring passes those runtime-only settings into the
  SGP runtime adapters.
- Control-plane collector env remains separate: Japan collector should still
  use `EDGE_XRAY_USAGE_SOURCES_JSON` and `EDGE_MIHOMO_USAGE_SOURCES_JSON` only
  after SGP runtime usage sources remain stable.

The implementation deliberately avoids reusing collector-side
`EDGE_XRAY_STATS_SERVER` for runtime config generation, so Japan collector
configuration does not accidentally mutate data-plane active configs.

## Validation

Targeted runtime adapter tests:

```text
node --test --test-name-pattern="loopback usage stats" server/tests/edge-vless-hy2-runtime-adapters.test.mjs
```

Result: passed.

```text
node --test --test-name-pattern="usage source" server/tests/edge-mihomo-tuic-host-runtime-adapter.test.mjs
```

Result: passed.

Related regression tests:

```text
node --test server/tests/edge-vless-hy2-runtime-adapters.test.mjs
node --test server/tests/edge-mihomo-tuic-host-runtime-adapter.test.mjs
node --test server/tests/state.test.mjs
node --test server/tests/production-edge-agent.test.mjs
```

Result: passed.

## Next Production Gate

The next gate must deploy the runtime source-preserve overlay before enabling
Japan's six-source collector configuration.

Recommended approval text:

```text
批准上线 traffic-usage-sgp-runtime-source-preserve-20260708 到 vul1/gccgw-vultr-candidate：上传并校验 reviewed overlay（agent/production-edge-agent.mjs、server/services/edge/xray-vless-reality-runtime-adapter.mjs、server/services/edge/mihomo-tuic-runtime-adapter.mjs、server/services/edge/mihomo-tuic-host-runtime-adapter.mjs、server/state.mjs）；备份 Japan current、current/.env、gccgw-traffic-usage-collect.service/timer、proxy-gateway-candidate.service、控制库、Japan-to-SGP SSH/tunnel unit（如存在）、SGP edge-agent runtime/current source、SGP edge-agent unit、SGP /etc/xray/config.json、SGP /etc/mihomo/config.yaml、SGP xray-vless-reality.service、SGP mihomo-tuic.service；在 SGP edge-agent runtime 仅启用 EDGE_XRAY_RUNTIME_STATS_SERVER=127.0.0.1:10085、EDGE_MIHOMO_RUNTIME_CONTROLLER_URL=http://127.0.0.1:19090 和受保护 EDGE_MIHOMO_RUNTIME_CONTROLLER_SECRET_FILE，不改变现有 VLESS clients、Reality 设置、TUIC users、TLS、端口或公网监听；重启/触发 SGP edge-agent reconciliation，验证 SGP active Xray stats/API/policy 与 Mihomo external-controller 在 edge-agent reconciliation 和服务重启后仍保留，且 loopback listener only；随后在 Japan 仅建立 loopback-only SGP usage source reachability，并设置 EDGE_XRAY_USAGE_SOURCES_JSON 与 EDGE_MIHOMO_USAGE_SOURCES_JSON 让 JP/SGP VLESS、JP/SGP TUIC 分别绑定各自 source；重启 proxy-gateway-candidate.service，触发 gccgw-traffic-usage-collect.service，验证 collectorCount=6、SGP VLESS/TUIC reports collected、unresolvedCount=0 或明确 fail-closed；不改 Hysteria2、不改 DNS/Nginx/firewall/SQLite schema，不输出订阅链接、token、密码、私钥、原始 env、原始配置、credential map、controller payload 或 SQLite 行；按当前备份回滚。
```

## Sensitive Output Boundary

Do not output subscription URLs, tokens, passwords, private keys, raw env, raw
runtime config, credential maps, controller payloads, or SQLite rows. Use only
presence markers, counts, service status, redacted proof summaries, and
loopback/listener state.
