# channel-lab-a Hysteria2 Mihomo Import Validation Record

Date: 2026-05-26, Asia/Shanghai.

Risk:

```text
A / controlled Mihomo import validation
```

Approval phrase:

```text
Approve controlled Mihomo import validation for channel-lab-a Hysteria2 on the operator device.
No all-user rollout.
```

## Scope

Approved:

```text
use the existing channel-lab-a Hysteria2 runtime
use the existing local operator-only canary credential material
download a temporary official Mihomo core into a local directory outside the repository
generate a local Mihomo runtime config outside the repository
start a temporary standalone Mihomo process on the operator device
bind the Mihomo test listener to 127.0.0.1 only
run short HTTP proxy samples through the Mihomo -> Hysteria2 path
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
system proxy change
TUN / virtual NIC / driver setup
WireGuard or server mesh setup
```

No secrets, tokens, subscription URLs, opaque artifact URLs, private keys, raw
runtime configs, raw logs, SQLite contents, or customer data were recorded.

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

Mihomo core:

```text
project: MetaCubeX/mihomo
release: v1.19.25
asset: mihomo-windows-amd64-v1-v1.19.25.zip
execution mode: temporary standalone process
local mixed port: 127.0.0.1:28280
```

The temporary Mihomo core was downloaded from the official GitHub release and
kept outside the repository. It was not installed as a service and did not
modify the system proxy, route table, TUN device, or network adapter state.

Local sensitive files were kept outside the repository:

```text
C:\Users\g\AppData\Local\Temp\channel-lab-a-hysteria2-canary\mihomo-channel-lab-a.yaml
C:\Users\g\AppData\Local\Temp\channel-lab-a-hysteria2-canary\mihomo-channel-lab-a-runtime.yaml
```

These files contain canary credentials and must not be committed, pasted into
PRs, or copied into docs/chat.

## Validation

Preflight:

```text
local mihomo/clash binary in PATH: not present
temporary Mihomo core version: Mihomo Meta v1.19.25 windows amd64
local runtime config path: outside repository
```

Standalone Mihomo run:

```text
temporary standalone Mihomo process: started
local mixed-port listener: present on 127.0.0.1:28280
sample count: 20
HTTP 200 samples through Mihomo -> Hysteria2 path: 20
failed samples: 0
p50 total time: 1.0773s
p95 total time: 1.1630s
max total time: 2.2891s
Mihomo log error count: 0
temporary standalone Mihomo process: stopped after validation
```

An unrelated existing `verge-mihomo` process was observed after validation and
was not started, stopped, or modified by this record.

## Result

```text
Mihomo can parse and run the controlled Hysteria2 canary config: yes
operator-device Mihomo -> channel-lab-a Hysteria2 path: passed short canary
all-user rollout: not performed
subscription output: unchanged
DNS / Nginx / production config: untouched
server runtime config: unchanged
security group: unchanged
system proxy / TUN / virtual NIC: untouched
```

This proves a local standalone Mihomo core can run the Hysteria2 candidate
configuration and complete short HTTP proxy samples through `channel-lab-a`.
It does not prove long-term stability, full GUI import behavior, large-file
throughput, UDP application behavior, multi-vantage performance, all-user
readiness, or censorship-resistance guarantees.

## Remaining Gates

Still required before broader channel decisions:

```text
longer measurement window
baseline comparison against SS or other candidate paths
real GUI/profile import validation if the operator wants client-UI evidence
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
stop the temporary standalone Mihomo process
delete the local sensitive canary directory
remove any locally imported canary profile from the operator device
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
standalone Mihomo import/runtime validation: passed short 20-sample HTTP test
local canary config: generated outside repository
all-user rollout: not performed
production traffic: none
subscription output: unchanged
DNS / Nginx / production config: untouched
next gate: extended measurement, GUI import evidence, or cleanup decision
```
