# channel-lab-a Creation Record

Date: 2026-05-26, Asia/Shanghai.

Risk:

```text
A / channel runtime canary server creation
```

Approval phrase:

```text
Approve creation of channel-lab-a on AWS ap-southeast-1 with Ubuntu LTS,
2 vCPU / 2 GB RAM class, SSH restricted to operator IP, one Hysteria2 UDP
candidate port, cleanup review in 72 hours. No production traffic.
```

## Scope

Approved:

```text
create a clean AWS ap-southeast-1 EC2 instance for channel-lab-a
use Ubuntu LTS
use a 2 vCPU / 2 GB RAM class
restrict SSH to the operator public IPv4 /32
open one Hysteria2 candidate UDP port
tag the instance and security group as no-production-traffic canary resources
validate instance state, status checks, security group, SSH reachability, and
basic host state
record cleanup review requirement
```

Explicitly not approved:

```text
Hysteria2 runtime installation
any other protocol runtime installation
DNS mutation
Nginx mutation
systemd service creation or mutation beyond the base OS
production config mutation
tenant or artifact mutation
SQLite copy
secret copy
traffic cutover
all-user subscription output change
Local Edge Agent production activation
WireGuard or server mesh setup
```

No secrets, tokens, subscription URLs, opaque artifact URLs, private keys, raw
runtime configs, raw access logs, SQLite contents, or customer data were
recorded.

## Created Resources

Provider-neutral label:

```text
channel-lab-a
```

Cloud/provider details:

```text
provider: AWS
region: ap-southeast-1
instance id: i-0f2cf745a1bb5ba51
instance type: t3.small
public IPv4: 18.143.186.75
private IPv4: 172.31.33.46
subnet: subnet-059b79e4b6e8e512b
security group: sg-0cad3c8a7380528f9
AMI: ami-04592e28abc2b9fc9
OS image: Ubuntu 24.04 LTS
root volume: 20 GiB gp3, encrypted, delete-on-termination
key pair: proxy-gateway-aws-sg-20260521
cleanup review: 72 hours
```

Security group intent:

```text
SSH:
  tcp/22 from operator public IPv4 /32 only

candidate protocol:
  udp/443 from 0.0.0.0/0 for future Hysteria2 canary runtime

egress:
  default outbound allowed
```

The operator public IPv4 value was used in the AWS security group command but
is not repeated here. Do not broaden SSH ingress without a new approval.

## Validation

AWS status:

```text
instance state: running
instance status: ok
system status: ok
```

Volume:

```text
type: gp3
size: 20 GiB
encrypted: true
delete on termination: true
```

Local operator checks:

```text
tcp/22 reachable from operator environment: true
SSH login with approved key: succeeded
```

Host summary:

```text
kernel: Linux 6.17 aws x86_64 family
system state: running
listening services:
  ssh
  local resolver
  DHCP/NTP-related base OS listeners
Hysteria2 runtime: not installed
candidate udp/443 listener: not present yet
```

This validation proves only that the clean canary server exists, is reachable
over restricted SSH, and has the approved candidate UDP ingress ready. It does
not prove Hysteria2 runtime behavior, proxy quality, weak-network performance,
or subscription output behavior.

## Remaining Gates

Still required before protocol testing:

```text
runtime deployment approval
candidate runtime package / binary selection
candidate config path
secret generation and storage boundary
Hysteria2 service definition
candidate udp/443 listener validation
operator-device Clash/Mihomo canary config
baseline SS comparison path
benchmark sample plan
rollback command validation
cleanup / stop / destroy decision after review window
```

Next approval phrase:

```text
Approve Channel Runtime Canary deployment on channel-lab-a for Hysteria2 only.
No production cutover.
```

That approval must still name the runtime package or binary, config path,
secret source, service name, rollback actions, and validation commands.

## Conclusion

```text
channel-lab-a: created and reachable
Hysteria2 runtime: not deployed
production traffic: none
DNS / Nginx / production config: untouched
cleanup review: required within 72 hours
next gate: Hysteria2 runtime deployment approval
```
