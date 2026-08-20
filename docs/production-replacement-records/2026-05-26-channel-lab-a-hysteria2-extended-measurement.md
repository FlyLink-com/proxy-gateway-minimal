# channel-lab-a Hysteria2 Extended Measurement Record


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: channel_lab_a_hysteria2_extended_measurement
  superseded_by: null
  last_verified_at: 2026-05-26
  production_authority: false
```


Date: 2026-05-26, Asia/Shanghai.

Risk:

```text
A-adjacent / controlled operator-device channel measurement
```

Approval phrase:

```text
Approve extended channel-lab-a Hysteria2 measurement on the operator device.
```

## Scope

Approved:

```text
use the existing channel-lab-a Hysteria2 runtime
use existing local operator-only canary client material
start temporary loopback-only local Hysteria2 and Mihomo test clients
run multiple local HTTP proxy measurement windows from the operator device
record redacted aggregate measurement evidence
generate a channel measurement bundle report
```

Explicitly not approved:

```text
all-user rollout
subscription renderer output change
DNS mutation
Nginx mutation
production config mutation
tenant or artifact mutation
SQLite copy
server runtime reconfiguration
service restart
security-group mutation
additional port exposure
production cutover
Local Edge Agent production activation
system proxy change
TUN / virtual NIC / driver setup
WireGuard or server mesh setup
```

No secrets, tokens, subscription URLs, opaque artifact URLs, private keys, raw
runtime configs, raw logs, SQLite contents, raw endpoint URLs, or customer data
were recorded.

## Inputs

Server:

```text
provider-neutral label: channel-lab-a
provider: AWS
region: ap-southeast-1
instance id: i-0f2cf745a1bb5ba51
runtime: Hysteria2 v2.9.2
candidate listen: UDP/443
```

Operator-device paths:

```text
direct Hysteria2 local HTTP proxy: 127.0.0.1:28180
standalone Mihomo local mixed port: 127.0.0.1:28280
measurement target class: public lightweight HTTPS endpoint
sample windows per path: 3
samples per window: 60
```

Local sensitive canary configuration stayed outside the repository. The
repository measurement bundle contains aggregate summaries only.

## Measurement Bundle

Repository-safe aggregate evidence:

```text
docs/channel-measurement-bundles/2026-05-26-channel-lab-a-hysteria2-extended-measurement/manifest.json
docs/channel-measurement-bundles/2026-05-26-channel-lab-a-hysteria2-extended-measurement/bundle-report.json
```

The bundle report was generated with:

```powershell
node scripts/channel-measurement-bundle.mjs `
  docs/channel-measurement-bundles/2026-05-26-channel-lab-a-hysteria2-extended-measurement/manifest.json
```

## Results

Direct Hysteria2 client path:

```text
window count: 3
total samples: 180
success samples: 180
failed samples: 0
timeout samples: 0

window 1 duration: p50 1419.2 ms, p95 1462.6 ms, p99 1995.2 ms, max 1995.2 ms
window 2 duration: p50 1376.4 ms, p95 1447.9 ms, p99 2293.2 ms, max 2293.2 ms
window 3 duration: p50 1370.0 ms, p95 1405.3 ms, p99 1441.9 ms, max 1441.9 ms

extended report readiness: hold_for_investigation
reason codes: hold_window_present, high_p95_latency, high_p99_latency
```

Standalone Mihomo -> Hysteria2 path:

```text
window count: 3
total samples: 180
success samples: 180
failed samples: 0
timeout samples: 0

window 1 duration: p50 922.8 ms, p95 945.3 ms, p99 2726.5 ms, max 2726.5 ms
window 2 duration: p50 923.5 ms, p95 947.3 ms, p99 1370.0 ms, max 1370.0 ms
window 3 duration: p50 923.1 ms, p95 947.4 ms, p99 1436.2 ms, max 1436.2 ms

extended report readiness: hold_for_investigation
reason codes: hold_window_present, high_p99_latency
```

## Interpretation

This measurement is stronger than the previous 20-sample short canaries because
each path now has three independent 60-sample windows. Both paths had perfect
success rate and no timeouts during this run.

The result is still not ready for broader rollout:

```text
direct Hysteria2 path:
  consistently exceeds the current p95 latency threshold
  exceeds the current p99 threshold in two windows

Mihomo -> Hysteria2 path:
  has stable p50/p95 behavior in all windows
  has one p99 spike above the current p99 threshold
```

The Mihomo path is the better operator-device evidence from this run, but the
candidate remains `hold_for_investigation` until the p99 spike is explained,
reproduced, or cleared by further measurement or comparison against another
candidate.

## Not Performed

```text
no production traffic
no all-user rollout
no subscription output change
no DNS change
no Nginx change
no server runtime reconfiguration
no service restart
no security-group change
no tenant/artifact mutation
no system proxy change
no TUN / virtual NIC / driver setup
no cleanup of channel-lab-a
```

Temporary local Hysteria2 and Mihomo test processes were stopped after
measurement.

## Conclusion

```text
channel-lab-a Hysteria2 extended measurement: completed
sample volume: sufficient for the repository extended-measurement gate
success/timeout behavior: healthy in this run
latency behavior: not clean enough for broader rollout
decision: hold_for_investigation
recommended next action: investigate p99/p95 behavior or compare against TUIC before broader canary
cleanup decision: still separately gated
```
