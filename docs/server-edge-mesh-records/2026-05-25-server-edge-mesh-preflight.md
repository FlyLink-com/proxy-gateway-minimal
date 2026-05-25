# Server Edge Mesh Preflight

Date: 2026-05-25, Asia/Shanghai.

## Scope

Risk: A / read-only production network preflight.

Goal:

```text
Determine whether prod-edge-a and prod-edge-b are ready for a future private
server-side mesh canary.
```

Repository change:

```text
docs-only execution record
```

No mutation was performed:

```text
no WireGuard install
no WireGuard key generation
no firewall change
no security-group change
no AWS mutation
no DNS mutation
no Nginx mutation
no systemd mutation
no service restart
no production config change
no tenant migration
no subscription output change
no traffic migration
no cutover
no secret, token, subscription URL, SQLite, private key, cloud credential, or customer data copied or recorded
```

## Design Baseline

The design source is `docs/SERVER_EDGE_MESH_DESIGN.md`.

The intended V1 mesh role is:

```text
server-side private edge-to-edge infrastructure
health, management, validation, and recovery paths
not user-facing
not ordinary customer traffic
not Clash/Mihomo access
not Local Edge Agent replacement
not automatic failover
```

## Target Nodes

### prod-edge-a

```text
Instance ID: i-0b7791340d3fedff5
Current role: current production MVP target / primary edge slot
State: running
Instance type: t4g.small
Architecture: arm64
AMI: ami-08bf93219e21cea7a
Public IP: 13.215.156.159
Private IP: 172.31.27.240
Subnet: subnet-0bd6d390d9e318744
VPC: vpc-01be6089f9892a651
Security group: sg-0379ece0b3d305c43
```

### prod-edge-b

```text
Instance ID: i-0ad8676ee113d14cb
Current role: iteration/canary secondary slot, currently carried by the validated green candidate
State: running
Instance type: t4g.small
Architecture: arm64
AMI: ami-08bf93219e21cea7a
Public IP: 18.136.102.226
Private IP: 172.31.18.176
Subnet: subnet-0bd6d390d9e318744
VPC: vpc-01be6089f9892a651
Security group: sg-06682c36aa03834f7
```

## VPC And Subnet

Read-only AWS inventory:

```text
VPC: vpc-01be6089f9892a651
VPC CIDR: 172.31.0.0/16
Subnet: subnet-0bd6d390d9e318744
Subnet CIDR: 172.31.16.0/20
Availability Zone: ap-southeast-1b
```

Both candidate peers are in the same VPC and subnet.

Local operator-network observation:

```text
Local WLAN subnet: 192.168.10.0/24
Local Hyper-V default switch subnet observed: 172.31.32.0/20
```

CIDR note:

```text
Do not use the existing VPC CIDR 172.31.0.0/16 for a future mesh overlay.
Avoid local-observed 192.168.10.0/24 and 172.31.32.0/20.
Choose a dedicated mesh CIDR only in a separate approved execution plan.
```

## Current Security Group Posture

Both target security groups currently expose the same service-port pattern:

```text
22/tcp: operator SSH source CIDR only
80/tcp: 0.0.0.0/0
443/tcp: 0.0.0.0/0
18388/tcp: 0.0.0.0/0
18388/udp: 0.0.0.0/0
egress: 0.0.0.0/0
```

Important mesh finding:

```text
No WireGuard or mesh UDP ingress rule is currently present.
No security-group mutation was performed.
```

Public control-plane protection remains unchanged:

```text
3456/tcp not exposed by security group
18180/tcp not exposed by security group
1080/tcp not exposed by security group
```

## DNS And Public Reachability

DNS:

```text
sub.globalcirclecat.com -> 13.215.156.159 TTL 600
ss-sg.globalcirclecat.com -> 13.215.156.159 TTL 600
```

Public HTTP checks from the local operator device:

```text
https://sub.globalcirclecat.com/api/health -> 200
http://13.215.156.159/api/health -> 200
http://18.136.102.226/api/health -> 200
```

Public TCP reachability from the local operator device:

```text
13.215.156.159:22 -> reachable
18.136.102.226:22 -> reachable
13.215.156.159:18388 -> reachable
18.136.102.226:18388 -> reachable
```

ICMP remains unsuitable as the production-health signal in this environment:
the TCP checks passed while ping did not.

## Host Readiness

### prod-edge-a

Read-only host checks:

```text
OS: Ubuntu 24.04.4 LTS
Kernel: 6.17.0-1015-aws
Architecture: aarch64
WireGuard kernel module: available
wg binary: not installed
wireguard package: not installed, candidate available
wireguard-tools package: not installed, candidate available
net.ipv4.ip_forward: 0
net.ipv6.conf.all.forwarding: 0
ufw: inactive
```

Service checks:

```text
proxy-gateway-console.service: active, NRestarts=0
proxy-gateway-ss.service: active, NRestarts=0
nginx: active, NRestarts=0
local /api/health: 200
```

Listening summary:

```text
22/tcp: listening
80/tcp: listening
443/tcp: listening
18388/tcp: listening
18388/udp: listening
127.0.0.1:3456/tcp: listening
```

### prod-edge-b

Read-only host checks:

```text
OS: Ubuntu 24.04.4 LTS
Kernel: 6.17.0-1015-aws
Architecture: aarch64
WireGuard kernel module: available
wg binary: not installed
wireguard package: not installed, candidate available
wireguard-tools package: not installed, candidate available
net.ipv4.ip_forward: 0
net.ipv6.conf.all.forwarding: 0
ufw: inactive
```

Service checks:

```text
proxy-gateway-console.service: active, NRestarts=0
proxy-gateway-ss.service: active, NRestarts=23
nginx: active, NRestarts=0
local /api/health: 200
```

`proxy-gateway-ss.service` still carries the historical restart count recorded
in earlier green/prod-edge-b records. It was active during this preflight.

Listening summary:

```text
22/tcp: listening
80/tcp: listening
18388/tcp: listening
18388/udp: listening
127.0.0.1:3456/tcp: listening
443/tcp: not listening
```

## Private VPC Reachability

From `prod-edge-a` to `prod-edge-b` private IP:

```text
172.31.18.176:22 -> fail
172.31.18.176:80 -> ok
172.31.18.176:443 -> fail
172.31.18.176:18388 -> ok
```

From `prod-edge-b` to `prod-edge-a` private IP:

```text
172.31.27.240:22 -> fail
172.31.27.240:80 -> ok
172.31.27.240:443 -> ok
172.31.27.240:18388 -> ok
```

Interpretation:

```text
Same-VPC private reachability exists for currently listening public service
ports that security groups allow.

Private SSH is not currently open between the two security groups.
prod-edge-b does not currently listen on 443.
No mesh UDP port was tested because no mesh UDP listener or ingress rule exists.
```

## Readiness Assessment

Ready to request future mesh canary execution approval:

```text
partially ready
```

Positive findings:

```text
both target nodes are running
both target nodes are in the same VPC and subnet
both target nodes run the same Ubuntu/kernel/architecture family
WireGuard kernel module is available on both
wireguard and wireguard-tools packages are available to install
both production services are active
private VPC TCP reachability works for 80/18388
public production subscription gateway remains healthy
```

Blockers before any WireGuard/private mesh execution:

```text
choose a dedicated non-conflicting mesh CIDR
choose WireGuard listen port
define exact SG ingress delta for mesh UDP
define whether mesh uses public IP peer endpoints or private VPC endpoints
define key generation, storage, rotation, and revocation boundary
define whether SSH over mesh is allowed or explicitly disallowed
define systemd lifecycle and rollback commands
define validation commands and public-path non-regression checks
decide whether prod-edge-b should be kept as the first peer despite its historical ss restart count
```

Not ready for:

```text
automatic failover
customer traffic over mesh
database replication over mesh
prod-edge-c mesh membership
Local Edge Agent mesh-backed channel
```

## Recommended Next Action

Create a separate A-tier execution runbook for a two-node WireGuard canary
between `prod-edge-a` and `prod-edge-b`.

The runbook should remain explicit that initial execution is only:

```text
install WireGuard tooling
create node-local mesh keys without recording private material
open the minimal approved UDP peer path
bring up a two-peer private interface
validate private health checks
verify public gateway and Shadowsocks behavior did not regress
stop before user traffic, DNS changes, subscription output changes, prod-edge-c, or failover
```

Suggested branch:

```text
ops/server-edge-mesh-wireguard-canary-runbook
```
