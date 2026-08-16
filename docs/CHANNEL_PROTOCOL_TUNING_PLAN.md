# Channel Protocol Tuning Plan

Last updated: 2026-06-09.

```yaml
document_metadata:
  doc_type: canonical
  lifecycle: active
  authority_scope: channel_protocol_tuning_plan
  superseded_by: null
  last_verified_at: 2026-06-09
  production_authority: false
```


This document records the repo-side plan for protocol-level tuning of the
current multi-channel subscription bundle. It is not a production approval and
does not authorize DNS, firewall, Nginx, systemd, runtime config, customer data,
subscription issuance, or secret handling changes.

## Current Finding

Recent client-side checks show that the subscription renderer can generate a
valid multi-channel Clash / Mihomo profile, but channel quality still varies by
protocol and path. This is not only a proxy-group selection issue:

- VLESS Reality over TCP can be reachable while still showing high first-byte
  latency and low throughput.
- Hysteria2 and TUIC can be reachable and faster, but UDP-heavy paths remain
  sensitive to local ISP policy, client runtime behavior, and server runtime
  tuning.
- AUTO / FALLBACK group behavior can hide or amplify the problem because the
  selected channel may be reachable but not the best available path.

The repository must therefore separate three concerns:

1. **subscription strategy**: which channel names appear in AUTO,
   WEAK-NETWORK, FALLBACK, and GLOBAL;
2. **runtime protocol tuning**: what server-side Hy2 / TUIC / VLESS runtime
   parameters are supported and tested;
3. **path evidence**: measured client-to-edge and edge-to-target quality facts.

## Repo Support Added

The Hysteria2 runtime adapter now supports explicit protocol tuning fields when
provided by protected environment or host adapter wiring:

- `bandwidth.up`
- `bandwidth.down`
- `ignoreClientBandwidth`
- `congestion.type`
- `congestion.bbrProfile`
- `quic.initStreamReceiveWindow`
- `quic.maxStreamReceiveWindow`
- `quic.initConnReceiveWindow`
- `quic.maxConnReceiveWindow`
- `quic.maxIdleTimeout`
- `quic.maxIncomingStreams`
- `quic.disablePathMTUDiscovery`
- `udpIdleTimeout`

All fields are optional. If they are not configured, the runtime adapter keeps
the current output shape.

## Candidate Matrix

Use the matrix below for staging or controlled production canary only after a
separate Risk A approval.

| Candidate | Runtime Focus | Intended Signal |
| --- | --- | --- |
| `hy2-baseline` | Current Hy2 runtime policy: sniff, IPv4-only outbound, loopback stats. | Establish clean baseline before tuning. |
| `hy2-balanced-bandwidth` | Explicit server bandwidth and matching client-side `up` / `down` render values. | Check whether bandwidth declaration reduces unstable pacing. |
| `hy2-large-quic-window` | Larger QUIC stream / connection receive windows. | Check whether long-haul throughput improves without increasing loss. |
| `hy2-mtu-conservative` | Disable path MTU discovery or reduce client UDP packet size where supported. | Check whether client/ISP fragmentation is causing timeouts. |
| `tuic-bbr-native` | Current TUIC BBR + native UDP relay. | Keep as current canary baseline. |
| `tuic-cubic-or-newreno` | Alternate congestion controller, one variant at a time. | Check whether BBR is over-aggressive on the observed route. |
| `vless-tcp-fallback` | VLESS Reality TCP only. | Keep as reachability fallback, not weak-network performance winner. |

Do not enable multiple protocol variants in one test window unless the test is
explicitly measuring proxy-group selection behavior.

## Measurement Method

For each candidate:

1. Generate or load a synthetic subscription profile with only the candidate
   channel and the control fallback channels needed for comparison.
2. Run client-side explicit proxy tests against fixed targets such as
   Cloudflare speed test download endpoints and `generate_204`.
3. Capture at least:
   - success count and timeout count;
   - first-byte time;
   - total transfer time for 100 KB, 1 MB, 3 MB, and 10 MB;
   - effective Mbps;
   - client-side packet loss where available;
   - server CPU/load and runtime listener health as redacted facts.
4. Repeat with the same local route state. Do not compare results across
   different local proxy subscriptions, TUN modes, or ISP egress IPs unless the
   test case is explicitly about those differences.

## Safe Channel Observation Report

`buildChannelQualityMeasurementReport(...)` records already-collected safe
observations by `channelRef`. It keeps client import compatibility separate
from network quality so that a template/client problem is not confused with a
provider or runtime path problem.

Accepted observation facts are limited to safe fields such as:

- `channelRef`
- `nodeRef`
- `source`
- `clientProfile`
- `compatibility`
- `measuredAt`
- `latencyMs`
- `jitterMs`
- `packetLossRatio`
- `successRate`
- `timeoutRate`
- `downloadMbps`
- `uploadMbps`

The report outputs advisory `qualityTier` and `strategyAdvice` values. For
example, a high-loss Singapore channel can be marked
`keep_optional_collect_evidence` without removing it from the subscription
bundle, while an import failure is marked as a client/template issue.

This layer rejects endpoint-like or secret-shaped input and omits hosts, ports,
tokens, credentials, subscription URLs, raw logs, and raw configs. It does not
run probes, contact servers, mutate runtime config, alter proxy groups, or
activate/deactivate channels.

## Promotion Threshold

A candidate can move from investigation to canary only when it meets all of the
following in a controlled measurement window:

- success rate is at least 98%;
- timeout rate is at most 1%;
- p95 first-byte latency is below 900 ms for the chosen test region;
- p95 3 MB transfer time is below 3.5 seconds or clearly better than the
  current baseline by at least 30%;
- no regression in existing subscription import compatibility;
- no public Admin, controller, stats, or raw runtime material exposure.

If a candidate fails, record whether the failure is:

- client/profile compatibility;
- local ISP or TUN routing;
- provider firewall or host listener;
- runtime config schema;
- edge CPU / kernel / UDP buffer pressure;
- upstream path quality.

## Risk Gate For Runtime Experiments

Runtime experiments remain A-tier because they can affect production channels.
A valid approval packet must include:

- exact target host and channel refs;
- candidate runtime parameters;
- backup paths;
- config-test command;
- restart list;
- validation commands;
- rollback plan;
- explicit confirmation that no subscription URLs, tokens, passwords, raw env,
  raw config, SQLite rows, or customer data will be output.

Repo-only adapter and test work remains B-tier and can be validated locally.
