# channel-lab-b TUIC Operator-Device Canary Record


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: channel_lab_b_tuic_operator_device_canary
  superseded_by: null
  last_verified_at: 2026-05-28
  production_authority: false
```


Date: 2026-05-28, Asia/Shanghai.

Risk:

```text
A / controlled TUIC subscription batch and operator-device canary
```

Approval phrase:

```text
Approve controlled TUIC subscription batch generation and operator-device canary for channel-lab-b. No all-user rollout.
```

## Scope

Approved:

```text
use the existing channel-lab-b TUIC runtime
read server-local TUIC UUID/password material into local operator-only config
generate one controlled local TUIC subscription batch YAML
generate one local standalone Mihomo runtime config
start a temporary standalone Mihomo process on the operator device
bind the Mihomo test listener to 127.0.0.1 only
run short HTTP proxy samples through the Mihomo -> TUIC path
record redacted aggregate validation evidence
stop the temporary Mihomo process after validation
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
```

No secrets, tokens, subscription URLs, opaque artifact URLs, private keys, raw
runtime configs, raw logs, SQLite contents, credentials, or customer data were
recorded.

## Inputs

Server:

```text
provider-neutral label: channel-lab-b
provider: AWS
region: ap-northeast-1
instance id: i-068f3cebec06ad0c0
public IPv4: 13.114.23.32
runtime: Mihomo Meta v1.19.25 TUIC v5 listener
candidate listen: UDP/443
service: mihomo-tuic.service
```

Runtime deployment record:

```text
docs/production-replacement-records/2026-05-28-channel-lab-b-tuic-runtime.md
```

Operator-device Mihomo core:

```text
project: MetaCubeX/mihomo
release: v1.19.25
asset family: Windows amd64
execution mode: temporary standalone process
local mixed port: 127.0.0.1:29380
```

Local sensitive files were created outside the repository:

```text
C:\Users\g\AppData\Local\Temp\channel-lab-b-tuic-canary\channel-lab-b-tuic-subscription.yaml
C:\Users\g\AppData\Local\Temp\channel-lab-b-tuic-canary\mihomo-channel-lab-b-runtime.yaml
```

These files contain canary credentials and must not be committed, pasted into
PRs, copied into docs/chat, or shared as user-facing subscription material.
They are controlled operator-device canary material only.

## Validation

Preflight:

```text
channel-lab-b mihomo-tuic.service: active / running
channel-lab-b UDP/443 listener: present
channel-lab-b service NRestarts: 0
recent channel-lab-b service error/panic/fatal/failed line count: 0
local Mihomo core version: Mihomo Meta v1.19.25 windows amd64
local runtime config path: outside repository
local subscription batch path: outside repository
```

Standalone Mihomo run:

```text
temporary standalone Mihomo process: started
local mixed-port listener: present on 127.0.0.1:29380
target: https://www.gstatic.com/generate_204
sample count: 20
HTTP 204 samples through Mihomo -> TUIC path: 20
failed samples: 0
p50 total time: 0.8287s
p95 total time: 0.8371s
max total time: 2.1476s
Mihomo log error count: 0
temporary standalone Mihomo process: stopped after validation
```

The successful samples are the meaningful operator-device path evidence for
this record. They prove a short controlled Mihomo -> TUIC path from the current
operator device to `channel-lab-b`; they do not prove long-term stability,
large-file throughput, UDP application behavior, multi-vantage performance,
all-user readiness, or production readiness.

## Result

```text
Mihomo can parse and run the controlled TUIC canary config: yes
operator-device Mihomo -> channel-lab-b TUIC path: passed short canary
controlled subscription batch material: generated locally outside repo
all-user rollout: not performed
subscription output: unchanged
DNS / Nginx / production config: untouched
server runtime config: unchanged
security group: unchanged
system proxy / TUN / virtual NIC: untouched
```

## Not Performed

```text
no production subscription-output change
no public subscription URL generation
no all-user rollout
no DNS change
no Nginx change
no production config change
no tenant mutation
no artifact mutation
no SQLite copy
no server runtime reconfiguration
no service restart
no security-group mutation
no system proxy change
no TUN or virtual NIC setup
no production authority transfer
no channel-lab-a cleanup
no Hysteria2 mutation
```

## Remaining Gates

Still required before broader channel decisions:

```text
longer TUIC measurement window
baseline comparison against Hysteria2 hold evidence
failure/timeout behavior sampling
controlled decision pack after comparable sample volume
cleanup / stop / destroy decision within the review window
separate approval before any production subscription output or config change
```

Possible next approval phrase:

```text
Approve extended channel-lab-b TUIC measurement on the operator device. No all-user rollout.
```

Cleanup remains separately gated:

```text
Approve cleanup of channel-lab-b TUIC canary artifacts and server.
```

## Rollback

Local rollback:

```text
stop the temporary standalone Mihomo process
delete the local sensitive canary directory
remove any locally imported canary profile from the operator device
```

Server runtime rollback remains the same as the runtime deployment record:

```text
sudo systemctl disable --now mihomo-tuic.service
sudo rm -f /etc/systemd/system/mihomo-tuic.service
sudo systemctl daemon-reload
sudo rm -rf /etc/mihomo /opt/mihomo /var/lib/mihomo /var/log/mihomo
```

Cloud cleanup remains separate:

```text
stop or terminate i-068f3cebec06ad0c0
delete sg-0a70e5f1bbd42576b after dependency check
delete imported key pair channel-lab-b-20260528 if no longer needed
```

Cloud cleanup is not performed in this record.

## Conclusion

```text
channel-lab-b: running
TUIC runtime: active
standalone Mihomo import/runtime validation: passed short 20-sample HTTP test
local canary config: generated outside repository
all-user rollout: not performed
production traffic: none
subscription output: unchanged
DNS / Nginx / production config: untouched
next gate: extended TUIC measurement, decision pack, or cleanup decision
```
