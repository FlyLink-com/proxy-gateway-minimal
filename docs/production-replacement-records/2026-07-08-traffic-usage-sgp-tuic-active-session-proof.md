# traffic-usage-sgp-tuic active-session proof

Date: 2026-07-08 UTC
Risk: A controlled proof

## Scope

Run a controlled active TUIC session proof for `channel-sgp-a-tuic` after the
readonly investigation showed aggregate-only idle controller output.

The proof used a temporary local Mihomo client on Japan with a single protected
SGP TUIC runtime credential selected from protected material. The runtime
credential, credential map, controller payload, raw config, subscription
material, token, password, private key, and SQLite rows were not printed or
recorded.

No production config, systemd unit, firewall, DNS, Nginx, runtime listener,
SQLite schema, subscription artifact, or controller payload was modified.

## Execution Summary

Temporary client boundaries:

- Temporary client config directory: generated under `/tmp` and removed.
- Temporary local mixed proxy: `127.0.0.1:18080`.
- Temporary local controller: `127.0.0.1:19092`.
- Remote observed source: SGP Mihomo controller through the existing Japan
  loopback-only tunnel.

The proof initiated a throttled HTTP download through the temporary TUIC client
and polled the SGP `/connections` source while the session was active.

Redacted proof results:

- protected material found: yes
- protected runtime credential selected: yes
- temporary client started: yes
- temporary listener on `127.0.0.1:18080`: yes
- controller polls: 24
- HTTP 200 controller polls: 24
- object-shaped payload polls: 24
- polls with a `connections` array: 22
- polls with active connections: 22
- max active connections observed: 1
- selected runtime-user hits: 22
- UUID-like value hits: 44
- byte-field hits: 44
- chain-field hits: 44
- client log error count: 0
- download command result: timed out by the deliberate proof limit after
  receiving traffic

Observed active-connection shape:

- top-level connection keys:
  `chains`, `download`, `id`, `metadata`, `providerChains`, `rule`,
  `rulePayload`, `start`, `upload`
- metadata keys included `inboundUser`

## Finding

When an SGP TUIC session is active, Mihomo `/connections` can expose a runtime
user field under connection metadata. That runtime user can be mapped to an
`edgeCredentialRef` through the protected credential map.

This proves the previous idle probe was not blocked by the credential map or
tunnel. The source can be attributed while a TUIC connection is active.

## Accounting Decision

Do not enable `channel-sgp-a-tuic` as a production quota-grade collector using
the current `/connections` reader.

Reason:

- `/connections` is an active-connection snapshot, not a persistent per-user
  usage ledger.
- The current `traffic-accounting` service records each collector observation as
  a usage sample and sums those samples for the billing cycle.
- The current reader does not maintain per-connection delta state. It reports
  the bytes present in the snapshot.

If enabled directly on the five-minute production timer, this source can:

- double count long-lived active connections when the same connection appears in
  multiple polls, and
- miss short-lived connections that start and finish between polls.

The active-session proof therefore changes the source assessment from
`aggregate-only while idle` to `attributable while active, but not safe as a
quota-grade source with the current accounting model`.

## Current Safe State

`channel-sgp-a-tuic` remains prepared but disabled from active production usage
collection.

Validated after the proof:

- Japan temporary listener `127.0.0.1:18080`: absent
- Japan temporary listener `127.0.0.1:19092`: absent
- `proxy-gateway-candidate.service`: active
- `gccgw-traffic-usage-collect.timer`: active
- `gccgw-sgp-usage-source-tunnel.service`: active
- SGP `gccgw-edge-agent.service`: active
- SGP `xray-vless-reality.service`: active
- SGP `mihomo-tuic.service`: active
- SGP Mihomo controller listener `127.0.0.1:19090`: present
- SGP TUIC UDP 443 listener: present

Final active production collector remains the five-source safe set:

- `channel-vultr-a-hy2`
- `channel-sgp-a-hy2`
- `channel-vultr-a-tuic`
- `channel-vultr-a-vless-reality-tcp`
- `channel-sgp-a-vless-reality-tcp`

## Reference Check

Official Mihomo API documentation describes `/connections` as the active
connections endpoint with per-connection metadata and byte fields, and
`/traffic` as aggregate real-time traffic.

Related upstream discussion in MetaCubeX/mihomo issue #2478 requests persistent
per-client traffic statistics, which matches the gap observed here.

## Next Viable Options

1. Keep SGP TUIC fail-closed for quota enforcement.
2. Add a separately approved stateful TUIC usage sidecar that polls active
   connections frequently, computes per-connection deltas, stores durable
   per-credential counters, and exposes cumulative per-credential totals to the
   existing collector.
3. Prefer a runtime or controller source that natively exposes persistent
   per-user cumulative TUIC counters.
4. Remove SGP TUIC from quota-enforced offerings if no durable per-credential
   source is available.

Do not attribute aggregate-only or snapshot-only TUIC traffic to users for
monthly quota decisions.
