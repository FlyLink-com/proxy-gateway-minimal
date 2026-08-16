# traffic-usage-sgp-tuic-per-credential readonly investigation


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: traffic_usage_sgp_tuic_per_credential_readonly_investigation
  superseded_by: null
  last_verified_at: 2026-07-08
  production_authority: false
```


Date: 2026-07-08 UTC
Risk: A readonly investigation

## Scope

Investigate why `channel-sgp-a-tuic` could not remain enabled in the traffic
usage collector after SGP runtime source preservation.

No production config, systemd unit, firewall, DNS, Nginx, runtime listener,
SQLite schema, credential material, subscription artifact, or controller payload
was modified.

## Findings

The SGP Mihomo controller is reachable through the Japan loopback-only tunnel:

- `/version`: HTTP 200
- `/traffic`: HTTP 200, streaming aggregate traffic rows
- `/connections`: HTTP 200

The SGP `/connections` payload shape observed during the readonly probe was:

- top-level keys: `connections`, `downloadTotal`, `memory`, `uploadTotal`
- `connections`: `null`
- aggregate totals: non-zero

The redacted proof command for SGP TUIC returned:

- `readyToEnableCollector=false`
- `collectorStatus=collector_not_supported`
- `aggregateOnlyBlocked=true`
- `blockers=["node_aggregate_only"]`
- `nextAction=do_not_enable_tuic_usage_collector_until_per_credential_rows_exist`

This means the source currently exposes aggregate TUIC traffic but no
per-runtime-user or per-edge-credential rows that can be safely attributed.

## Reference Check

The official Mihomo API documentation describes:

- `/traffic` as real-time aggregate upload/download rates and cumulative totals.
- `/connections` as active connection objects with `id`, `metadata`, `upload`,
  `download`, `start`, `chains`, `providerChains`, `rule`, and `rulePayload`.

The API contract does not document a stable per-user or per-credential traffic
field for TUIC listener users.

Related upstream feature request:

- MetaCubeX/mihomo issue #2478 asks for persistent per-client traffic
  statistics, noting that Mihomo currently provides real-time traffic but no
  historical client-level usage API.

## Root Cause

`channel-sgp-a-tuic` is not blocked by our credential map, controller reachability,
or collector wiring. The blocker is source capability: the current Mihomo
external-controller path does not provide per-credential TUIC usage rows.

Keeping SGP TUIC enabled as a collector would either:

- fail the production timer with `node_aggregate_only`, or
- risk misattributing aggregate node traffic to users.

The current fail-closed behavior is therefore correct.

## Current Safe State

The active production collector remains healthy with five sources:

- `channel-vultr-a-hy2`
- `channel-sgp-a-hy2`
- `channel-vultr-a-tuic`
- `channel-vultr-a-vless-reality-tcp`
- `channel-sgp-a-vless-reality-tcp`

`channel-sgp-a-tuic` remains prepared but disabled:

- SGP Mihomo controller remains loopback-only.
- Japan-to-SGP loopback tunnel remains available.
- Protected credential map exists.
- Protected controller secret exists.

## Next Viable Options

1. Keep SGP TUIC fail-closed until Mihomo exposes per-user TUIC usage rows.
2. Run a separately approved controlled active-connection proof to see whether
   active TUIC sessions ever include a runtime-user field in `/connections`.
3. If Mihomo cannot expose per-user TUIC usage, migrate SGP TUIC usage accounting
   to a runtime/source that has a stable per-credential stats API, or remove SGP
   TUIC from quota-enforced offerings.

No option should attribute aggregate-only TUIC traffic to individual users.
