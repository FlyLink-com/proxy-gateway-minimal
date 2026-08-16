# channel-lab-a Hysteria2 Operator-Device Canary Record


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: channel_lab_a_hysteria2_operator_device_canary
  superseded_by: null
  last_verified_at: 2026-05-26
  production_authority: false
```


Date: 2026-05-26, Asia/Shanghai.

Risk:

```text
A / controlled operator-device channel canary
```

Approval phrase:

```text
Approve controlled operator-device channel canary for Hysteria2.
No all-user rollout.
```

## Scope

Approved:

```text
use the existing channel-lab-a Hysteria2 runtime
read the existing server-side Hysteria2 password into a local operator-only config
download a pinned Hysteria2 Windows client binary for local canary use
run a temporary local Hysteria2 client on the operator device
bind local test proxies to 127.0.0.1 only
run short HTTP proxy samples through the Hysteria2 path
generate a local Mihomo canary config file for controlled operator import
record redacted aggregate validation evidence
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
WireGuard or server mesh setup
```

No secrets, tokens, subscription URLs, opaque artifact URLs, private keys, raw
runtime configs, raw access logs, SQLite contents, or customer data were
recorded.

## Inputs

Server:

```text
provider-neutral label: channel-lab-a
provider: AWS
region: ap-southeast-1
instance id: i-0f2cf745a1bb5ba51
public IPv4: 18.143.186.75
runtime: Hysteria2 v2.9.2
candidate listen: UDP/443
```

Operator-device client:

```text
client: Hysteria2 Windows amd64
client version: v2.9.2
local HTTP proxy: 127.0.0.1:28180
local SOCKS5 proxy: 127.0.0.1:28181
TLS mode: self-signed canary validation
```

Local sensitive files were created outside the repository:

```text
C:\Users\g\AppData\Local\Temp\channel-lab-a-hysteria2-canary\client.yaml
C:\Users\g\AppData\Local\Temp\channel-lab-a-hysteria2-canary\mihomo-channel-lab-a.yaml
```

These files contain canary credentials and must not be committed, pasted into
PRs, or copied into docs/chat. The local Mihomo file is for controlled operator
import only.

## Validation

Preflight:

```text
channel-lab-a hysteria-server.service: active / running
channel-lab-a UDP/443 listener: present
operator device TCP/22 reachability: true
operator device TCP/443 reachability: true
local Hysteria binary before setup: not present in PATH
```

Local canary run:

```text
temporary local Hysteria client process: started
local HTTP proxy listener: present
local SOCKS5 proxy listener: present
sample count: 20
HTTP 200 samples through Hysteria path: 20
failed samples: 0
p50 total time: 1.1213s
p95 total time: 2.1624s
max total time: 2.2794s
client log error count: 0
temporary local Hysteria client process: stopped after validation
```

The TCP/443 check is only a basic reachability signal. The successful Hysteria
client samples are the meaningful operator-device path evidence for this
record.

## Result

```text
operator-device Hysteria2 path: passed short canary
all-user rollout: not performed
subscription output: unchanged
DNS / Nginx / production config: untouched
server runtime config: unchanged
security group: unchanged
```

This proves the current operator device can complete short HTTP proxy samples
through `channel-lab-a` over the Hysteria2 runtime. It does not prove long-term
stability, large-file throughput, UDP application behavior, multi-vantage
performance, all-user readiness, or censorship-resistance guarantees.

## Remaining Gates

Still required before broader channel decisions:

```text
longer measurement window
baseline comparison against SS or other candidate paths
Mihomo controlled import validation on the operator device
failure/timeout behavior sampling
cleanup / stop / destroy decision within the review window
separate approval before any subscription output or production config change
```

Possible next approval phrase:

```text
Approve extended channel-lab-a Hysteria2 measurement on the operator device.
No all-user rollout.
```

Cleanup remains separately gated:

```text
Approve cleanup of channel-lab-a Hysteria2 canary artifacts and server.
```

## Rollback

Local rollback:

```text
stop the local Hysteria client process
delete the local sensitive canary directory
remove the local Mihomo canary profile from the operator device
```

Server runtime rollback remains the same as the runtime deployment record:

```text
sudo systemctl stop hysteria-server.service
sudo systemctl disable hysteria-server.service
sudo rm -f /etc/hysteria/config.yaml
sudo rm -f /etc/hysteria/channel-lab-a.crt
sudo rm -f /etc/hysteria/channel-lab-a.key
sudo rm -f /etc/hysteria/channel-lab-a.password
```

Cloud cleanup remains separate:

```text
stop or terminate i-0f2cf745a1bb5ba51
delete sg-0cad3c8a7380528f9 after dependency check
```

Cloud cleanup is not performed in this record.

## Conclusion

```text
channel-lab-a: running
Hysteria2 runtime: active
operator-device Hysteria2 canary: passed short 20-sample HTTP test
local canary config: generated outside repository
all-user rollout: not performed
production traffic: none
subscription output: unchanged
DNS / Nginx / production config: untouched
next gate: extended measurement, Mihomo controlled import, or cleanup decision
```
