# channel-lab-b TUIC Runtime Deployment Record

Date: 2026-05-28, Asia/Shanghai.

Risk:

```text
A / channel runtime canary deployment
```

Approval phrase:

```text
Approve Channel Runtime Canary deployment on channel-lab-b for TUIC only. No production cutover.
```

## Scope

Approved:

```text
deploy one TUIC runtime on channel-lab-b
use the already-created AWS ap-northeast-1 channel-lab-b server
use the already-approved TUIC candidate UDP port
install one runtime package
write one runtime config
generate server-local TUIC credentials
create one systemd service
validate config, service state, listener state, and security-group posture
record rollback and next gates
```

Explicitly not approved:

```text
DNS mutation
Nginx mutation
production config mutation
subscription output mutation
controlled subscription batch generation
operator-device traffic
all-user rollout
production authority transfer
tenant or artifact mutation
SQLite copy
Local Edge Agent production activation
WireGuard or server mesh setup
any other protocol runtime
```

No secrets, tokens, subscription URLs, opaque artifact URLs, private keys, raw
runtime configs, raw logs, SQLite contents, credentials, or customer data were
recorded.

## Target

Provider-neutral label:

```text
channel-lab-b
```

Cloud/provider details:

```text
provider: AWS
region: ap-northeast-1
instance id: i-068f3cebec06ad0c0
instance type: t3.small
public IPv4: 13.114.23.32
private IPv4: 172.31.46.109
security group: sg-0a70e5f1bbd42576b
OS image: Ubuntu 24.04 LTS amd64
```

Base creation record:

```text
docs/production-replacement-records/2026-05-28-channel-lab-b-creation.md
```

## Runtime Package

Runtime:

```text
Mihomo Meta v1.19.25 linux amd64 compatible
asset: mihomo-linux-amd64-compatible-v1.19.25.gz
release published: 2026-05-16T15:26:51Z
download SHA256: verified against GitHub release asset digest
```

Source reviewed:

```text
MetaCubeX/mihomo GitHub release metadata
Mihomo TUIC v5 listener documentation
```

Reason:

```text
The repository already renders Mihomo TUIC client fields. Using Mihomo as the
server-side listener keeps this first TUIC runtime canary aligned with the
existing Clash/Mihomo subscription-output contract.
```

## Runtime Configuration

Service:

```text
systemd unit: mihomo-tuic.service
runtime binary: /opt/mihomo/bin/mihomo
runtime config directory: /etc/mihomo
runtime config file: /etc/mihomo/config.yaml
credential marker file: /etc/mihomo/channel-lab-b-tuic.env
certificate directory: /etc/mihomo/certs
listener: TUIC v5 on UDP/443
congestion controller: bbr
ALPN: h3
mode: rule
default route: DIRECT
```

Secret boundary:

```text
TUIC UUID and password were generated on channel-lab-b only.
The values are stored only in the remote runtime config / credential marker.
They were not printed, copied into this repository, pasted into chat, or
recorded in PR text.
```

Certificate boundary:

```text
self-signed certificate generated on channel-lab-b
short canary lifetime: 30 days
no public CA issuance
no DNS validation
no HTTPS gateway change
```

Process boundary:

```text
dedicated system user: mihomo
binary capability: cap_net_bind_service
service restart policy: on-failure
NoNewPrivileges: true
protected home/system paths enabled
```

## Validation

AWS status:

```text
instance state: running
instance status: ok
system status: ok
```

Package:

```text
release asset downloaded: yes
download SHA256 verified: yes
binary installed: yes
binary version: Mihomo Meta v1.19.25 linux amd64
```

Config and service:

```text
mihomo config test: passed
systemd service: active
ActiveState: active
SubState: running
Result: success
ExecMainStatus: 0
NRestarts: 0
```

Listener:

```text
UDP/443 listener: present
TCP/443 listener: not opened by this runtime
SSH: still restricted by security group to the operator public IPv4 /32
```

Security group:

```text
tcp/22: operator public IPv4 /32 only
udp/443: 0.0.0.0/0 for the TUIC candidate listener
egress: default outbound allowed
```

File posture:

```text
/etc/mihomo: root:mihomo 0750
/etc/mihomo/config.yaml: root:mihomo 0640
/etc/mihomo/channel-lab-b-tuic.env: root:root 0600
/etc/mihomo/certs/channel-lab-b.crt: root:mihomo 0640
/etc/mihomo/certs/channel-lab-b.key: root:mihomo 0640
/opt/mihomo/bin/mihomo: root:root 0755 with cap_net_bind_service
```

Log summary:

```text
recent mihomo-tuic.service error/panic/fatal/failed line count: 0
raw journal lines: not recorded
```

## Not Performed

```text
no DNS change
no Nginx change
no production config change
no subscription output change
no controlled subscription batch generation
no operator-device traffic
no all-user rollout
no production authority transfer
no tenant mutation
no artifact mutation
no SQLite copy
no raw credential export
no raw runtime config recorded
no raw logs recorded
no channel-lab-a cleanup
no Hysteria2 mutation
```

## Rollback

Rollback remains a separate A-tier cleanup decision unless emergency stop is
required. The validated local rollback shape is:

```text
sudo systemctl disable --now mihomo-tuic.service
sudo rm -f /etc/systemd/system/mihomo-tuic.service
sudo systemctl daemon-reload
sudo rm -rf /etc/mihomo /opt/mihomo /var/lib/mihomo /var/log/mihomo
```

Cloud cleanup remains separate:

```text
stop or terminate channel-lab-b
delete sg-0a70e5f1bbd42576b if no longer attached
delete imported key pair channel-lab-b-20260528 if no longer needed
```

Do not perform rollback or cloud cleanup without separate approval unless there
is a live safety incident.

## Remaining Gates

Still required before any user-visible or operator-device comparison:

```text
controlled subscription batch generation approval
operator-device TUIC canary approval
safe client material handoff
standalone Mihomo import validation
measurement sample plan
measurement bundle generation
comparison against Hysteria2 hold evidence
cleanup / retain decision
```

Recommended next approval phrase:

```text
Approve controlled TUIC subscription batch generation and operator-device canary for channel-lab-b. No all-user rollout.
```

## Conclusion

```text
channel-lab-b: running
TUIC runtime: deployed
runtime service: mihomo-tuic.service active
UDP/443 listener: active
controlled subscription batch: not generated
operator-device traffic: not run
all-user rollout: not performed
DNS / Nginx / production config: untouched
production authority transfer: not performed
cleanup review: still required
next gate: controlled subscription batch / operator-device TUIC canary approval
```
