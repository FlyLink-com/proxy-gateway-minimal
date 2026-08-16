# 2026-06-05 Japan TUIC Production Reconnect


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: japan_tuic_production_reconnect
  superseded_by: null
  last_verified_at: 2026-06-05
  production_authority: false
```


## Scope

- Risk tier: A.
- Target control plane: Aliyun candidate runtime only.
- Target data-plane node: `channel-lab-b-tuic`.
- Objective: reconnect the existing Japan TUIC node to Aliyun subscription output after the retired `prod-edge-a` and `prod-edge-b` Shadowsocks nodes were physically removed from the active cloud config.

## Guardrails

- No DNS, firewall, provider security-group, Nginx config, public Admin, payment, passkey, account/password generation, or AWS resource mutation.
- No live order creation during validation.
- No raw credentials, tokens, subscription URLs, raw YAML, raw config, raw env, raw logs, SQLite rows, or customer data were recorded.
- The retired `prod-edge-a` and `prod-edge-b` nodes were not restored to the active config.

## Read-Only Preflight

- Aliyun candidate service was reachable and active.
- Active Aliyun release was `6954d5d3300a`.
- Before reconnect, active `config/proxy-servers.json` contained zero servers after the retired-node physical delete.
- Aliyun runtime env had already been set to auto-issuance target `channel-lab-b-tuic`.
- Japan TUIC host `channel-lab-b-tuic` was reachable and reported:
  - `mihomo-tuic.service`: active.
  - `NRestarts`: 0.
  - UDP 443 listener count: 1.
- Existing runtime tenant aggregate before the reconnect showed unexpired active tenants already mostly assigned to `channel-lab-b-tuic`, with two unexpired active tenants still assigned to `prod-edge-a`.

## Mutation

- Created protected on-host backup:
  - `/opt/proxy-gateway-minimal-candidate/backups/japan-tuic-production-reconnect-20260605T064816Z`
- Migrated the two unexpired active runtime tenants that still referenced `prod-edge-a` to `channel-lab-b-tuic`.
- The first active-config write did not persist a one-node active config, leaving the active config at zero servers. Root-cause evidence showed no active or backup `proxy-servers.json` file containing a one-node Japan config after that attempt.
- Created an additional active-config backup:
  - `/opt/proxy-gateway-minimal-candidate/backups/japan-tuic-active-config-write-20260605T065542Z`
- Copied the existing `channel-lab-b-tuic` template from release `492ba99ea564` into the active release config and normalized only safe lifecycle fields:
  - `status=online`
  - `disabled=false`
  - `maintenance=false`
  - `channelPool=stable`
  - `pool=stable`
  - `lifecycle=active`
  - `strategyPriority=10`
- Restarted `proxy-gateway-candidate.service` only.

## Validation

- Active config summary after write:
  - server count: 1.
  - names: `channel-lab-b-tuic`.
  - type: `tuic`.
  - pool: `stable`.
  - status: `online`.
  - retired `prod-edge-a` / `prod-edge-b` present: false.
- Candidate service:
  - `proxy-gateway-candidate.service`: active.
  - local health: HTTP 200.
  - local no-token subscription boundary: HTTP 401.
- Runtime tenant aggregate after reconnect:
  - `channel-lab-b-tuic`: 38 computed active, 2 computed expired, 2 stored disabled.
  - `prod-edge-a`: 0 computed active, 1 stored disabled.
  - unavailable unexpired active tenant count: 0.
- Public boundaries:
  - `https://sub.globalcirclecat.com/api/health`: HTTP 200.
  - `https://sub.globalcirclecat.com/sub/clash.yaml` without token: HTTP 401.
  - `https://sub.globalcirclecat.com/api/admin/subscriptions`: HTTP 404.
  - `https://portal.globalcirclecat.com/`: HTTP 200.
  - `https://portal.globalcirclecat.com/api/admin/subscriptions`: HTTP 404.
  - empty unauthenticated portal access-request POST: HTTP 400.
  - current access-request without portal ref: HTTP 400.
- `nginx -t`: passed.
- Japan TUIC data-plane recheck:
  - SSH reachable.
  - `mihomo-tuic.service`: active.
  - `NRestarts`: 0.
  - UDP 443 listener count: 1.

## Result

Aliyun subscription output is reconnected to the Japan TUIC production node `channel-lab-b-tuic`, and the active runtime config no longer contains the retired Shadowsocks nodes.

Known residuals:

- Direct token-bearing live subscription refresh was not performed during validation, to avoid using or recording customer subscription URLs or tokens.
- Existing expired or disabled subscription URLs are still expected to return authorization failures.
- The live active release now contains runtime config drift and the earlier zero-node startup hotfix; the next clean release should promote or replace those source changes deliberately instead of relying on live-only edits.
- Per-order TUIC credential add/remove remains separate production hardening work; this reconnect only restores Japan TUIC as the stable eligible node for current subscription output.
