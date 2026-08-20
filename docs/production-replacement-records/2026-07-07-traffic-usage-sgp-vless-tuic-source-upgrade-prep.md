# Traffic Usage SGP VLESS/TUIC Source Upgrade Prep


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: traffic_usage_sgp_vless_tuic_source_upgrade_prep
  superseded_by: null
  last_verified_at: 2026-07-07
  production_authority: false
```


Date: 2026-07-07 UTC

Risk: A

Scope: read-only production inventory plus local backend preparation for SGP
VLESS/TUIC usage collection. This record does not approve or execute production
runtime mutation.

## Operator Intent

The operator asked to start the SGP upgrade after JP VLESS/TUIC and monthly
cycle accounting had been enabled.

## Current Production Evidence

- Japan control-plane `proxy-gateway-candidate.service`: active.
- Japan `gccgw-traffic-usage-collect.timer`: active.
- Japan usage env has the approved JP single-source VLESS and TUIC usage keys
  present.
- Latest redacted collector samples report four collectors:
  - `channel-vultr-a-hy2`
  - `channel-sgp-a-hy2`
  - `channel-vultr-a-tuic`
  - `channel-vultr-a-vless-reality-tcp`
- The latest redacted collector samples report `unresolvedCount=0`.
- SGP SSH through the approved Japan-to-SGP path succeeds.
- SGP runtime services are active:
  - `xray-vless-reality.service`
  - `mihomo-tuic.service`
  - `hysteria2.service`
- SGP public runtime listeners are present for VLESS TCP 8443 and TUIC UDP 443.
- SGP Xray stats loopback listener is absent.
- SGP Mihomo external-controller loopback listener is absent.

## Local Backend Prep

Local source now supports explicit multi-source usage collector wiring:

- `EDGE_XRAY_USAGE_SOURCES_JSON`
  - Each source declares a loopback `statsServer` and the channel refs that use
    it.
  - This prevents SGP VLESS from reading JP Xray counters.
- `EDGE_MIHOMO_USAGE_SOURCES_JSON`
  - Each source declares a loopback `controllerUrl`, optional `metricsPath`,
    optional protected `controllerSecretPath`, optional credential map, and the
    channel refs that use it.
  - This prevents SGP TUIC from reading JP Mihomo controller traffic.

The existing single-source env keys remain compatible:

- `EDGE_XRAY_STATS_SERVER`
- `EDGE_XRAY_USAGE_CHANNEL_REFS`
- `EDGE_MIHOMO_USAGE_CONTROLLER_URL`
- `EDGE_MIHOMO_USAGE_METRICS_PATH`
- `EDGE_MIHOMO_USAGE_CHANNEL_REFS`
- `EDGE_MIHOMO_USAGE_CREDENTIAL_MAP_PATH`

## Validation

Targeted state wiring validation:

```text
node --test --test-name-pattern="usage source|usage collectors" server/tests/state.test.mjs
```

Result: 4 passed.

Full state runtime wiring validation:

```text
node --test server/tests/state.test.mjs
```

Result: 42 passed.

## Current Blockers

1. **SGP VLESS cannot be enabled yet**

   SGP Xray does not currently expose a loopback stats/API/policy source.
   Enabling SGP VLESS usage requires a separate reviewed SGP Xray runtime config
   update, config test, service restart, redacted proof, and rollback plan.

2. **SGP TUIC cannot be enabled yet**

   SGP Mihomo does not currently expose a loopback external-controller source.
   Enabling SGP TUIC usage requires a separate reviewed SGP Mihomo runtime
   config update, protected controller secret, protected credential map,
   config test, service restart, redacted proof, and rollback plan.

3. **Japan must read SGP sources through loopback-only transport**

   The control-plane collector must not expose SGP stats/controller publicly.
   If SGP runtime sources are enabled, Japan needs approved loopback-only source
   reachability, for example reviewed SSH local forwards from Japan to SGP
   loopback ports, before the multi-source env can be enabled.

## Recommended Production Gate

Use one explicit A-tier gate for SGP runtime source enablement and collector
activation after this local backend prep is reviewed.

Approval template:

```text
批准上线 traffic-usage-sgp-vless-tuic-source-enable-20260707 到 vul1/gccgw-vultr-candidate：上传并校验 reviewed backend overlay server/state.mjs；备份 /opt/proxy-gateway-minimal-candidate/current、/opt/proxy-gateway-minimal-candidate/.env、/opt/proxy-gateway-minimal-candidate/current/.env、gccgw-traffic-usage-collect.service/timer、proxy-gateway-candidate.service、控制库、Japan-to-SGP SSH/tunnel systemd unit（如存在）、SGP /etc/xray/config.json、SGP /etc/mihomo/config.yaml、SGP xray-vless-reality.service、SGP mihomo-tuic.service；在 SGP 仅启用 loopback-only Xray stats/API/policy 和 loopback-only Mihomo external-controller，不改变现有 VLESS clients、Reality 设置、TUIC users、TLS、端口和公网监听；生成受保护 SGP TUIC credential map 和 controller secret，权限 600，不输出内容；config-test 通过后仅重启 SGP xray-vless-reality.service 与 mihomo-tuic.service；在 Japan 仅建立 loopback-only SGP usage source reachability，并设置 EDGE_XRAY_USAGE_SOURCES_JSON 与 EDGE_MIHOMO_USAGE_SOURCES_JSON 让 JP/SGP VLESS、JP/SGP TUIC 分别绑定各自 source；重启 proxy-gateway-candidate.service，触发 gccgw-traffic-usage-collect.service，验证 collectorCount=6、SGP VLESS/TUIC reports collected、unresolvedCount=0 或明确 fail-closed；不改 Hysteria2、不改 DNS/Nginx/firewall/SQLite schema，不输出订阅链接、token、密码、私钥、原始 env、原始配置、credential map、controller payload 或 SQLite 行；按当前备份回滚。
```

## Forbidden Without Separate Approval

- Public stats/controller exposure.
- DNS, Nginx, firewall, or SQLite schema changes.
- Payment, account, order, entitlement, or subscription material mutation.
- Changes to existing VLESS clients, Reality settings, TUIC users, TLS, or
  public runtime ports beyond adding loopback-only usage sources.
- Raw runtime config, raw env, subscription URL, token, password, private key,
  controller secret, credential map, controller payload, or SQLite row output.
