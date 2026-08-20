# Traffic Usage Other Protocols Read-Only Inventory


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: traffic_usage_other_protocols_readonly_inventory
  superseded_by: null
  last_verified_at: 2026-07-07
  production_authority: false
```


Date: 2026-07-07 UTC

Risk: A

Scope: read-only inventory for extending runtime traffic usage collection beyond
the already enabled Hysteria2 collector.

## Operator Intent

The operator asked to connect the remaining protocol usage collectors after the
initial traffic usage collector timer activation.

This record does not approve or execute production mutation. It records the
current blocker set before a separate approval gate.

## Read-Only Evidence

- `proxy-gateway-candidate.service`: active.
- `nginx`: active.
- `gccgw-traffic-usage-collect.timer`: enabled and active.
- Runtime services present and active:
  - `hysteria2.service`
  - `mihomo-tuic.service`
  - `xray-vless-reality.service`
- Hysteria2 exposes the approved loopback traffic stats listener.
- The latest collector timer logs show `collectorCount=2`, both Hysteria2
  channels, `unresolvedCount=0`, and `nextAction=continue_usage_monitoring`.
- Mihomo/TUIC has no `external-controller` or usage/statistics controller
  configured, and no Mihomo controller listener was observed.
- Xray/VLESS has active clients, but the runtime config does not enable Xray
  `stats`, `api`, or `policy`, so there is no user-level Xray stats API to
  collect from.
- The control database contains usage tables and existing usage rows, but
  current usage rows are only for `channel-vultr-a-hy2`.
- The control database contains portal edge credential bindings across active
  protocol channels.

## Current Blockers

1. **TUIC collection not yet runtime-ready**

   The code path can support env-gated Mihomo/TUIC usage collection, but
   production does not currently expose a loopback Mihomo controller endpoint
   with per-credential usage rows.

   The existing TUIC collector intentionally fails closed when a runtime source
   returns only node aggregate traffic. TUIC must not be enabled for quota
   accounting unless the loopback source can return per-credential rows keyed by
   `edgeCredentialRef` or an approved equivalent mapping.

2. **VLESS collection not yet runtime-ready**

   Xray has per-client labels in config, but stats collection requires a
   separately reviewed Xray stats/API/policy configuration and a collector that
   maps returned user counters to `edgeCredentialRef`.

## Recommended Next Gate

Use three stages:

1. Keep the current Hysteria2 collector running as the only quota-backed runtime
   usage source.
2. Add a reviewed TUIC per-credential usage source or proof adapter, then enable
   the env-gated Mihomo/TUIC collector only after it returns per-credential rows.
3. Add a reviewed VLESS/Xray usage collector plus loopback-only Xray
   stats/API/policy config, then enable it under a separate production gate.

## Repo-Only TUIC Proof Tool

The repo now includes `scripts/tuic-per-credential-usage-proof.mjs` as a
pre-production proof tool. It does not authorize production mutation. It accepts
only loopback Mihomo-compatible controller URLs, suppresses raw runtime payloads,
returns `readyToEnableCollector=true` only when the runtime source emits
credential-level usage rows, and exits non-zero for aggregate-only runtime
traffic.

The TUIC source supports two reviewed input shapes:

- Direct `/usage`-style rows with `edgeCredentialRef` and byte counters.
- `/connections` snapshots only when a protected credential map translates the
  runtime user to `edgeCredentialRef`.

Unmapped `/connections` payloads remain aggregate-only and fail closed. The
runtime collector can receive the protected map through
`EDGE_MIHOMO_USAGE_CREDENTIAL_MAP_PATH` or
`EDGE_MIHOMO_USAGE_CREDENTIAL_MAP_JSON`; the proof script accepts the matching
`TUIC_USAGE_PROOF_CREDENTIAL_MAP_PATH` or
`TUIC_USAGE_PROOF_CREDENTIAL_MAP_JSON` variables. Prefer the file path form on
hosts so raw runtime users do not need to be placed inline in shell history.

Targeted validation:

```
node --test server/tests/edge-mihomo-external-controller-usage-reader.test.mjs server/tests/edge-mihomo-tuic-usage-collector.test.mjs server/tests/tuic-per-credential-usage-proof-script.test.mjs
```

## Repo-Only VLESS/Xray Proof Tool

The repo now includes `scripts/vless-xray-stats-usage-proof.mjs` and an
env-gated Xray VLESS usage collector. This does not authorize production
mutation. The collector is only created when `EDGE_XRAY_STATS_SERVER` or
`EDGE_XRAY_STATS_API_SERVER` is configured, and the stats server must be
loopback-only. It converts Xray user traffic counters of the form
`user>>>edgeCredentialRef>>>traffic>>>uplink/downlink` into usage observations
and blocks aggregate-only or empty stats.

Targeted validation:

```
node --test server/tests/edge-xray-stats-cli-usage-reader.test.mjs server/tests/edge-xray-vless-usage-collector.test.mjs server/tests/vless-xray-stats-usage-proof-script.test.mjs
node --test --test-name-pattern="Xray VLESS usage collector" server/tests/state.test.mjs
```

## Approval Template

```
批准上线 traffic-usage-tuic-per-credential-proof-20260707 到 vul1/gccgw-vultr-candidate：上传并校验 reviewed backend overlay 和 TUIC per-credential usage source/proof；备份 /opt/proxy-gateway-minimal-candidate/current、/opt/proxy-gateway-minimal-candidate/.env、/opt/proxy-gateway-minimal-candidate/current/.env、/etc/mihomo/config.yaml、mihomo-tuic.service、gccgw-traffic-usage-collect.service/timer 和控制库；仅在 loopback-only 且返回 edgeCredentialRef 级别 usage rows 后启用 Mihomo/TUIC usage env；重启必要的 Mihomo/TUIC 和 collector service/timer 并验证 redacted usage counts、unresolvedCount=0 或明确 fail-closed；不启用 Xray/VLESS stats，不改 Hysteria2、不改 DNS/Nginx/firewall/SQLite schema，不输出订阅链接、token、密码、私钥、原始 env、原始配置或 SQLite 行；按备份回滚。
```

Separate VLESS/Xray approval template:

```
批准上线 traffic-usage-vless-xray-stats-20260707 到 vul1/gccgw-vultr-candidate：上传并校验 reviewed VLESS/Xray usage collector 和 Xray loopback stats/API/policy config overlay；备份 /opt/proxy-gateway-minimal-candidate/current、/opt/proxy-gateway-minimal-candidate/.env、/opt/proxy-gateway-minimal-candidate/current/.env、/etc/xray/config.json、xray-vless-reality.service、gccgw-traffic-usage-collect.service/timer 和控制库；仅启用 loopback-only Xray stats API，并验证 user counter 能映射到 edgeCredentialRef 后才纳入 usage ledger；不启用 Mihomo/TUIC controller，不改 Hysteria2、不改 DNS/Nginx/firewall/SQLite schema，不输出订阅链接、token、密码、私钥、原始 env、原始配置或 SQLite 行；按备份回滚。
```

## Forbidden Without A Separate Approval

- Public controller exposure.
- DNS, Nginx, or firewall changes.
- SQLite schema migration.
- Payment, account, order, entitlement, or subscription material mutation.
- Raw runtime config, raw env, subscription URL, token, password, private key,
  or credential output.
