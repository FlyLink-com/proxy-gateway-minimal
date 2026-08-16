# channel-lab-a Hysteria2 Runtime Deployment Record


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: channel_lab_a_hysteria2_runtime
  superseded_by: null
  last_verified_at: 2026-05-26
  production_authority: false
```


Date: 2026-05-26, Asia/Shanghai.

Risk:

```text
A / channel runtime canary deployment
```

Approval phrase:

```text
Approve Channel Runtime Canary deployment on channel-lab-a for Hysteria2 only.
No production cutover.
```

## Scope

Approved:

```text
install Hysteria2 runtime on channel-lab-a
write one Hysteria2 server config
generate one self-signed test certificate on channel-lab-a
generate one Hysteria2 password on channel-lab-a
start one systemd service for Hysteria2
validate the service state and UDP listener
run a local host-only client smoke test against the Hysteria2 server
record redacted validation evidence
```

Explicitly not approved:

```text
DNS mutation
Nginx mutation
production config mutation
subscription output mutation
tenant or artifact mutation
SQLite copy
secret copy out of channel-lab-a
all-user rollout
production traffic
operator-device canary traffic
Local Edge Agent production activation
WireGuard or server mesh setup
```

No secrets, tokens, subscription URLs, opaque artifact URLs, private keys, raw
runtime configs, raw access logs, SQLite contents, or customer data were
recorded.

## Inputs

Target:

```text
provider-neutral label: channel-lab-a
provider: AWS
region: ap-southeast-1
instance id: i-0f2cf745a1bb5ba51
public IPv4: 18.143.186.75
security group: sg-0cad3c8a7380528f9
```

Runtime:

```text
runtime: Hysteria2
installed version: v2.9.2
install method: official Hysteria2 Linux install script
service: hysteria-server.service
config path: /etc/hysteria/config.yaml
certificate path: /etc/hysteria/channel-lab-a.crt
private key path: /etc/hysteria/channel-lab-a.key
password storage path: /etc/hysteria/channel-lab-a.password
candidate listen: UDP/443
```

The Hysteria documentation used for this execution describes the Linux install
script, server configuration, default `:443` listen behavior, TLS/auth fields,
and client-side self-signed certificate testing with `insecure` for development
validation.

## Implementation

Performed:

```text
installed Hysteria2 v2.9.2
generated a local self-signed certificate for channel-lab-a canary validation
generated a random password on the server
wrote /etc/hysteria/config.yaml
started and enabled hysteria-server.service
kept the runtime isolated to channel-lab-a
```

Configuration summary:

```text
listen: :443
tls: self-signed canary certificate on channel-lab-a
auth: password
udp: enabled
masquerade: string response for basic HTTP/3-compatible service behavior
```

The raw password and raw config were not copied into this repository, PR,
chat, or docs.

## Implementation Note

The first service start failed because the official service runs as the
`hysteria` user while `/etc/hysteria` and the generated files were initially
root-only.

Root cause:

```text
hysteria-server.service User=hysteria
/etc/hysteria/config.yaml was not readable by the hysteria user
```

Fix:

```text
/etc/hysteria directory: root:hysteria, 750
config/key/password files: root:hysteria, 640
certificate: root:hysteria, 644
```

After the permission fix, `hysteria-server.service` started successfully.

## Validation

AWS status:

```text
instance state: running
instance status: ok
system status: ok
```

Service state:

```text
hysteria-server.service: active
ActiveState: active
SubState: running
Result: success
ExecMainStatus: 0
NRestarts: 0
```

Listener:

```text
UDP/443 listener: present on all interfaces
```

Local host-only Hysteria client smoke test:

```text
client config: temporary file on channel-lab-a only
target server: 127.0.0.1:443
TLS mode: self-signed development validation
local HTTP proxy: 127.0.0.1:18080
HTTP proxy request result: 200
connect time: 0.000131s
time to first byte: 0.050728s
total time: 0.050776s
client log error count: 0
```

This smoke test proves the installed Hysteria2 runtime can complete a local
client/server path on channel-lab-a. It does not prove operator-device path
quality, long-haul performance, censorship resistance, or subscription renderer
activation.

Journal summary:

```text
initial permission failure: observed and fixed
post-fix service state: active / running
raw journal lines: not copied into this record
```

## Remaining Gates

Still required before useful channel evaluation:

```text
operator-device canary approval
client-side Hysteria2 config generation or controlled Clash/Mihomo import
baseline SS comparison path
long-haul latency / jitter / timeout samples
UDP path measurements from operator environment
HP/local Linux vantage measurements if useful
rollback timing validation
cleanup / stop / destroy decision within the review window
```

Next approval phrase:

```text
Approve controlled operator-device channel canary for Hysteria2.
No all-user rollout.
```

That approval must still define the canary client config delivery method,
redaction rules, baseline comparison, measurement window, and rollback command.

## Rollback

Prepared rollback actions:

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
Hysteria2 runtime: installed and active
UDP/443: listening
local host-only smoke test: passed
production traffic: none
subscription output: unchanged
DNS / Nginx / production config: untouched
next gate: controlled operator-device Hysteria2 canary or cleanup decision
```
