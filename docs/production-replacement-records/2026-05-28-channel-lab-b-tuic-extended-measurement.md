# channel-lab-b TUIC Extended Measurement Record

Date: 2026-05-28, Asia/Shanghai.

Risk:

```text
A / controlled operator-device TUIC extended measurement
```

Approval phrase:

```text
Approve extended channel-lab-b TUIC measurement on the operator device. No all-user rollout.
```

## Scope

Approved:

```text
use the existing channel-lab-b TUIC runtime
use existing local operator-only canary client material
start a temporary standalone Mihomo process on the operator device
bind the Mihomo test listener to 127.0.0.1 only
run multiple local HTTP proxy measurement windows from the operator device
record redacted aggregate measurement evidence
generate a channel measurement bundle report
generate a channel measurement investigation report
stop the temporary Mihomo process after measurement
```

Explicitly not approved:

```text
all-user rollout
production subscription-output change
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
production authority transfer
Local Edge Agent production activation
system proxy change
TUN / virtual NIC / driver setup
WireGuard or server mesh setup
channel-lab-a cleanup or Hysteria2 mutation
Aliyun runtime mutation
Aliyun provider firewall mutation
```

No secrets, tokens, subscription URLs, opaque artifact URLs, private keys, raw
runtime configs, raw logs, SQLite contents, credentials, raw endpoint URLs, or
customer data were recorded.

## Inputs

Server:

```text
provider-neutral label: channel-lab-b
provider: AWS
region: ap-northeast-1
runtime: Mihomo Meta v1.19.25 TUIC v5 listener
candidate listen: UDP/443
```

Runtime and short-canary records:

```text
docs/production-replacement-records/2026-05-28-channel-lab-b-tuic-runtime.md
docs/production-replacement-records/2026-05-28-channel-lab-b-tuic-operator-device-canary.md
```

Operator-device path:

```text
standalone Mihomo local mixed port: 127.0.0.1:29380
measurement target class: public lightweight HTTPS endpoint
sample windows: 3
samples per window: 60
```

Local sensitive canary configuration stayed outside the repository. The
repository measurement bundle contains aggregate summaries only.

## Measurement Bundle

Repository-safe aggregate evidence:

```text
docs/channel-measurement-bundles/2026-05-28-channel-lab-b-tuic-extended-measurement/manifest.json
docs/channel-measurement-bundles/2026-05-28-channel-lab-b-tuic-extended-measurement/bundle-report.json
docs/channel-measurement-bundles/2026-05-28-channel-lab-b-tuic-extended-measurement/investigation-report.json
```

The bundle report was generated with:

```powershell
node scripts/channel-measurement-bundle.mjs `
  docs/channel-measurement-bundles/2026-05-28-channel-lab-b-tuic-extended-measurement/manifest.json
```

The investigation report was generated with:

```powershell
node scripts/channel-measurement-investigation.mjs `
  docs/channel-measurement-bundles/2026-05-28-channel-lab-b-tuic-extended-measurement/bundle-report.json
```

## Results

Standalone Mihomo -> TUIC path:

```text
window count: 3
total samples: 180
success samples: 180
failed samples: 0
timeout samples: 0

window 1 duration: p50 820.3 ms, p95 847.7 ms, p99 981.7 ms, max 981.7 ms
window 2 duration: p50 820.2 ms, p95 835.8 ms, p99 863.0 ms, max 863.0 ms
window 3 duration: p50 825.2 ms, p95 835.5 ms, p99 1242.7 ms, max 1242.7 ms

extended report readiness: ready_for_decision
reason codes: extended_measurement_ready
investigation overall status: ready_for_operator_decision
recommended next action: prepare_risk_a_canary_gate
```

Temporary local Mihomo logs:

```text
error-like line count: 0
panic/fatal/failed/timeout-like line count: 0
```

The temporary standalone Mihomo process was stopped after measurement, and the
local loopback listener was no longer present after cleanup.

## Interpretation

This measurement is stronger than the previous 20-sample TUIC short canary
because it has three independent 60-sample windows through the operator-device
Mihomo -> TUIC path.

The TUIC candidate meets the repository extended-measurement thresholds in this
run:

```text
minimum windows: met
minimum samples per window: met
minimum success rate: met
maximum timeout rate: met
maximum p95 duration: met
maximum p99 duration: met
```

This does not authorize production activation. It means the TUIC candidate has
enough local operator-device evidence to enter an operator decision gate for a
possible canary-only subscription-output activation plan.

## Not Performed

```text
no production traffic
no all-user rollout
no subscription output change
no DNS change
no Nginx change
no production config change
no tenant mutation
no artifact mutation
no SQLite copy
no server runtime reconfiguration
no service restart
no security-group change
no system proxy change
no TUN or virtual NIC setup
no production authority transfer
no channel-lab-b cleanup
no channel-lab-a cleanup
no Hysteria2 mutation
no Aliyun runtime mutation
no Aliyun provider firewall mutation
```

## Remaining Gates

Still required before any production-facing change:

```text
operator decision on whether TUIC should move to a canary-only subscription-output activation plan
Aliyun host-internal service/SQLite/Nginx evidence or an accepted waiver
canary-only activation plan and rollback path
separate exact approval before any subscription-output mutation
separate exact approval before any production config, DNS, Nginx, or all-user rollout
cleanup / retain decision for channel-lab-b
```

Possible next approval phrase for a canary-only activation plan:

```text
Approve canary-only TUIC subscription-output activation planning for channel-lab-b. No mutation.
```

Cleanup remains separately gated:

```text
Approve cleanup of channel-lab-b TUIC canary artifacts and server.
```

## Conclusion

```text
channel-lab-b TUIC extended measurement: completed
sample volume: sufficient for the repository extended-measurement gate
success/timeout behavior: healthy in this run
latency behavior: within current p95/p99 thresholds
decision: ready_for_operator_decision
recommended next action: prepare Risk A canary-only activation planning, not activation
cleanup decision: still separately gated
```
