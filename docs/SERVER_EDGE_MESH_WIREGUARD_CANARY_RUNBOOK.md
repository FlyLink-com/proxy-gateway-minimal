# Server Edge Mesh WireGuard Canary Runbook

Last updated: 2026-05-25, Asia/Shanghai.

> Status:
> - Type: Active Risk A runbook
> - Risk: A
> - Execution authority: Does not authorize WireGuard installation, key
>   generation, security-group changes, firewall changes, service changes,
>   routing changes, production config changes, traffic migration, or cutover
>   by itself
> - Production impact: None unless a later execution record is separately
>   approved
> - Source of truth for: two-node WireGuard canary gates between `prod-edge-a`
>   and `prod-edge-b`

## Purpose

This runbook converts `docs/SERVER_EDGE_MESH_DESIGN.md` and the read-only
preflight record into exact gates for a first two-node WireGuard canary between
`prod-edge-a` and `prod-edge-b`.

The canary goal is narrow:

```text
Create a private server-to-server mesh path for edge health, management,
validation, and future recovery work.
```

It is not a product traffic feature.

## Required Approval Phrase

No command in this runbook may be executed until the operator gives this exact
approval:

```text
Approve two-node WireGuard server edge mesh canary between prod-edge-a and prod-edge-b. No user traffic, no DNS change, no subscription output change, no cutover.
```

This approval only covers the two-node canary described here. It does not
approve:

```text
prod-edge-c mesh membership
ordinary customer traffic over the mesh
Local Edge Agent mesh-backed channels
database replication
automatic failover
DNS changes
Nginx changes
production subscription output changes
tenant migration
legacy node retirement
```

## Current Preflight Facts

Source record:

```text
docs/server-edge-mesh-records/2026-05-25-server-edge-mesh-preflight.md
```

Current target nodes:

```text
prod-edge-a:
  instance id: i-0b7791340d3fedff5
  public ip: 13.215.156.159
  private ip: 172.31.27.240
  security group: sg-0379ece0b3d305c43

prod-edge-b:
  instance id: i-0ad8676ee113d14cb
  public ip: 18.136.102.226
  private ip: 172.31.18.176
  security group: sg-06682c36aa03834f7
```

Current environment:

```text
VPC: vpc-01be6089f9892a651
VPC CIDR: 172.31.0.0/16
Subnet: subnet-0bd6d390d9e318744
Subnet CIDR: 172.31.16.0/20
Region: ap-southeast-1
OS: Ubuntu 24.04.4 LTS on both nodes
Architecture: aarch64 on both nodes
WireGuard kernel module: available on both nodes
wireguard / wireguard-tools: available but not installed on both nodes
```

## Proposed Canary Parameters

These values are part of the runbook. Changing them requires updating the
execution record before running commands.

```text
Mesh CIDR: 10.89.0.0/24
prod-edge-a mesh address: 10.89.0.1/32
prod-edge-b mesh address: 10.89.0.2/32
WireGuard interface: wg-edge
WireGuard UDP port: 51820
MTU: 1420
```

CIDR rationale:

```text
10.89.0.0/24 does not overlap the observed AWS VPC CIDR 172.31.0.0/16,
observed subnet 172.31.16.0/20, local WLAN 192.168.10.0/24, or local Hyper-V
172.31.32.0/20.
```

Peer endpoint choice:

```text
Use private VPC IP endpoints for the first canary:
  prod-edge-a peer endpoint: 172.31.27.240:51820
  prod-edge-b peer endpoint: 172.31.18.176:51820
```

Security-group implication:

```text
The first canary should allow 51820/udp only between the two node security
groups, not from 0.0.0.0/0.
```

## Hard Stop Rules

Stop immediately if any of these are true:

```text
target instance id does not match this runbook
target public/private IP does not match current approved execution record
target security group does not match this runbook
node is not running
WireGuard module is unavailable
package install would remove or upgrade unrelated critical packages
service health is not green before mutation
public /api/health is not green before mutation
SQLite integrity check fails before mutation
security-group diff would expose mesh UDP to 0.0.0.0/0
any private key, preshared key, token, subscription URL, .env content, SQLite content, or customer data would be pasted into docs/chat/PR/logs
```

## Non-Goals

This runbook does not authorize:

```text
user-facing WireGuard profiles
Clash/Mihomo WireGuard nodes
Local Edge Agent channel changes
ordinary customer traffic over mesh
traffic accounting
quota enforcement
automatic failover
database replication
prod-edge-c creation or membership
DNS changes
Nginx changes
HTTPS changes
production .env changes
production config/proxy-servers.json changes
tenant assignment changes
subscription YAML output changes
legacy query-token retirement
```

## Stage 0: Fresh Read-Only Preflight

Run immediately before any approved execution.

### AWS Inventory

```bash
aws ec2 describe-instances \
  --region ap-southeast-1 \
  --instance-ids i-0b7791340d3fedff5 i-0ad8676ee113d14cb \
  --query 'Reservations[].Instances[].{InstanceId:InstanceId,State:State.Name,PublicIp:PublicIpAddress,PrivateIp:PrivateIpAddress,SubnetId:SubnetId,VpcId:VpcId,SecurityGroups:SecurityGroups[].GroupId,Tags:Tags}' \
  --output table
```

```bash
aws ec2 describe-security-groups \
  --region ap-southeast-1 \
  --group-ids sg-0379ece0b3d305c43 sg-06682c36aa03834f7 \
  --query 'SecurityGroups[].{GroupId:GroupId,IpPermissions:IpPermissions,IpPermissionsEgress:IpPermissionsEgress}' \
  --output json
```

Expected:

```text
both nodes running
prod-edge-a private IP 172.31.27.240
prod-edge-b private IP 172.31.18.176
no existing 51820/udp mesh ingress unless recorded by a previous approved execution
```

### Host Readiness

Do not paste raw secrets or raw journal output.

On each node:

```bash
hostname
lsb_release -ds
uname -r
uname -m
command -v wg || true
modinfo wireguard >/dev/null 2>&1 && echo wireguard_module=available || echo wireguard_module=not_available
dpkg-query -W -f='${Package} ${Status} ${Version}\n' wireguard wireguard-tools 2>/dev/null || true
apt-cache policy wireguard wireguard-tools | sed -n '1,80p'

systemctl is-active proxy-gateway-console.service proxy-gateway-ss.service nginx
systemctl show proxy-gateway-console.service proxy-gateway-ss.service nginx \
  --property=ActiveState,SubState,Result,ExecMainStatus,NRestarts \
  --no-pager

curl -sS -o /dev/null -w 'local health %{http_code} %{time_total}\n' \
  http://127.0.0.1:3456/api/health

sqlite3 /opt/proxy-gateway-minimal/.proxy-gateway/subscriptions.sqlite \
  'pragma integrity_check;'

ss -lntu
ip -br addr
ip route
sysctl net.ipv4.ip_forward net.ipv6.conf.all.forwarding 2>/dev/null || true
```

Expected:

```text
services active
local health 200
SQLite integrity_check ok
WireGuard module available
wireguard-tools either absent or already installed by a previous approved run
```

## Stage 1: Security Group Delta

This stage is a mutation and requires the approval phrase.

Only add peer-restricted UDP access.

Preferred rule shape:

```text
prod-edge-a SG allows 51820/udp from prod-edge-b SG
prod-edge-b SG allows 51820/udp from prod-edge-a SG
```

Commands:

```bash
aws ec2 authorize-security-group-ingress \
  --region ap-southeast-1 \
  --group-id sg-0379ece0b3d305c43 \
  --ip-permissions '[
    {
      "IpProtocol": "udp",
      "FromPort": 51820,
      "ToPort": 51820,
      "UserIdGroupPairs": [
        {
          "GroupId": "sg-06682c36aa03834f7",
          "Description": "server-edge-mesh wg-edge from prod-edge-b"
        }
      ]
    }
  ]'
```

```bash
aws ec2 authorize-security-group-ingress \
  --region ap-southeast-1 \
  --group-id sg-06682c36aa03834f7 \
  --ip-permissions '[
    {
      "IpProtocol": "udp",
      "FromPort": 51820,
      "ToPort": 51820,
      "UserIdGroupPairs": [
        {
          "GroupId": "sg-0379ece0b3d305c43",
          "Description": "server-edge-mesh wg-edge from prod-edge-a"
        }
      ]
    }
  ]'
```

Fallback only if SG-to-SG reference is rejected:

```text
Use private /32 CIDR rules:
  prod-edge-a SG allows 51820/udp from 172.31.18.176/32
  prod-edge-b SG allows 51820/udp from 172.31.27.240/32

Do not use 0.0.0.0/0.
```

Record the exact rule form used.

## Stage 2: Install WireGuard Tooling

This stage is a mutation and requires the approval phrase.

On both nodes:

```bash
sudo apt-get update
sudo apt-get install -y wireguard-tools
```

Do not install unrelated packages.

Post-check:

```bash
command -v wg
wg --version
modinfo wireguard >/dev/null 2>&1 && echo wireguard_module=available
```

Expected:

```text
wg exists
wireguard kernel module available
no production service restart occurred
```

## Stage 3: Generate Node-Local Mesh Keys

This stage is a mutation and requires the approval phrase.

Private keys must be generated on the target node and never copied into GitHub,
PRs, docs, chat, CI logs, shell transcript files, or support bundles.

On each node:

```bash
sudo install -d -m 0700 -o root -g root /etc/wireguard
sudo sh -c 'umask 077; wg genkey > /etc/wireguard/wg-edge.key'
sudo sh -c 'wg pubkey < /etc/wireguard/wg-edge.key > /etc/wireguard/wg-edge.pub'
sudo chmod 0600 /etc/wireguard/wg-edge.key
sudo chmod 0644 /etc/wireguard/wg-edge.pub
```

Allowed to record:

```text
public key fingerprint or full public key if the execution record explicitly
chooses to record public keys
```

Not allowed to record:

```text
private key
preshared key
raw shell output that includes private material
```

Recommended safer recording:

```bash
sudo sha256sum /etc/wireguard/wg-edge.pub
```

The execution record may store the public-key hash only.

## Stage 4: Create WireGuard Config

This stage is a mutation and requires the approval phrase.

The operator must fetch each node's public key out-of-band during the approved
execution and substitute it locally on the opposite node. Do not paste public
or private key material into this repository.

### prod-edge-a Config

Path:

```text
/etc/wireguard/wg-edge.conf
```

Template:

```ini
[Interface]
Address = 10.89.0.1/32
ListenPort = 51820
PrivateKey = <read from /etc/wireguard/wg-edge.key during execution>
MTU = 1420

[Peer]
# prod-edge-b
PublicKey = <prod-edge-b-public-key>
AllowedIPs = 10.89.0.2/32
Endpoint = 172.31.18.176:51820
PersistentKeepalive = 25
```

### prod-edge-b Config

Path:

```text
/etc/wireguard/wg-edge.conf
```

Template:

```ini
[Interface]
Address = 10.89.0.2/32
ListenPort = 51820
PrivateKey = <read from /etc/wireguard/wg-edge.key during execution>
MTU = 1420

[Peer]
# prod-edge-a
PublicKey = <prod-edge-a-public-key>
AllowedIPs = 10.89.0.1/32
Endpoint = 172.31.27.240:51820
PersistentKeepalive = 25
```

Recommended creation pattern:

```bash
sudo install -m 0600 -o root -g root /dev/null /etc/wireguard/wg-edge.conf
sudoedit /etc/wireguard/wg-edge.conf
sudo chmod 0600 /etc/wireguard/wg-edge.conf
```

Do not print the completed config to the terminal after private key insertion.

## Stage 5: Bring Up Mesh Canary

This stage is a mutation and requires the approval phrase.

On each node:

```bash
sudo systemctl enable wg-quick@wg-edge
sudo systemctl start wg-quick@wg-edge
```

Safe status checks:

```bash
systemctl is-active wg-quick@wg-edge
systemctl show wg-quick@wg-edge \
  --property=ActiveState,SubState,Result,ExecMainStatus,NRestarts \
  --no-pager
ip -br addr show wg-edge
ip route show dev wg-edge
sudo wg show wg-edge latest-handshakes transfer allowed-ips endpoints
```

Do not paste `wg showconf` output into records because it includes private
configuration context.

## Stage 6: Mesh Validation

From `prod-edge-a`:

```bash
ping -c 3 10.89.0.2 || true
curl -sS -o /dev/null -w 'mesh b health %{http_code} %{time_total}\n' \
  http://10.89.0.2/api/health || true
timeout 3 bash -lc '</dev/tcp/10.89.0.2/80' \
  && echo mesh_b_80_ok || echo mesh_b_80_fail
timeout 3 bash -lc '</dev/tcp/10.89.0.2/18388' \
  && echo mesh_b_18388_ok || echo mesh_b_18388_fail
```

From `prod-edge-b`:

```bash
ping -c 3 10.89.0.1 || true
curl -sS -o /dev/null -w 'mesh a health %{http_code} %{time_total}\n' \
  http://10.89.0.1/api/health || true
timeout 3 bash -lc '</dev/tcp/10.89.0.1/80' \
  && echo mesh_a_80_ok || echo mesh_a_80_fail
timeout 3 bash -lc '</dev/tcp/10.89.0.1/18388' \
  && echo mesh_a_18388_ok || echo mesh_a_18388_fail
```

Expected minimum:

```text
wg-quick@wg-edge active on both nodes
latest handshake appears on both nodes
10.89.0.1 and 10.89.0.2 can reach each other
health checks over mesh return 200 if routed through public Nginx listener
```

If HTTP health over mesh fails while ping/handshake succeeds, stop and record
the exact failure. Do not widen firewall rules without a separate approval.

## Stage 7: Public Non-Regression Checks

Run from the local operator device:

```powershell
Resolve-DnsName sub.globalcirclecat.com -Type A
Resolve-DnsName ss-sg.globalcirclecat.com -Type A

curl.exe --noproxy "*" -I https://sub.globalcirclecat.com/api/health
curl.exe --noproxy "*" -I https://sub.globalcirclecat.com/api/admin/subscriptions
curl.exe --noproxy "*" -I https://sub.globalcirclecat.com/sub/clash.yaml
curl.exe --noproxy "*" -I https://sub.globalcirclecat.com/

Test-NetConnection 13.215.156.159 -Port 18388
Test-NetConnection 18.136.102.226 -Port 18388
```

Expected:

```text
sub.globalcirclecat.com -> 13.215.156.159
ss-sg.globalcirclecat.com -> 13.215.156.159
/api/health -> 200
/api/admin/subscriptions -> 404
/sub/clash.yaml without token -> 401
/ -> 404
13.215.156.159:18388 -> reachable
18.136.102.226:18388 -> reachable
```

The canary must not change DNS, public Nginx behavior, or Subscription V2
output.

## Rollback

Rollback must be safe if any validation fails.

### Stop WireGuard

On both nodes:

```bash
sudo systemctl stop wg-quick@wg-edge || true
sudo systemctl disable wg-quick@wg-edge || true
ip -br addr show wg-edge || true
```

### Remove WireGuard Config And Keys

Only after confirming rollback is desired:

```bash
sudo rm -f /etc/wireguard/wg-edge.conf
sudo rm -f /etc/wireguard/wg-edge.key
sudo rm -f /etc/wireguard/wg-edge.pub
```

### Remove Security Group Rules

If SG-to-SG rules were used:

```bash
aws ec2 revoke-security-group-ingress \
  --region ap-southeast-1 \
  --group-id sg-0379ece0b3d305c43 \
  --ip-permissions '[
    {
      "IpProtocol": "udp",
      "FromPort": 51820,
      "ToPort": 51820,
      "UserIdGroupPairs": [
        {
          "GroupId": "sg-06682c36aa03834f7"
        }
      ]
    }
  ]'
```

```bash
aws ec2 revoke-security-group-ingress \
  --region ap-southeast-1 \
  --group-id sg-06682c36aa03834f7 \
  --ip-permissions '[
    {
      "IpProtocol": "udp",
      "FromPort": 51820,
      "ToPort": 51820,
      "UserIdGroupPairs": [
        {
          "GroupId": "sg-0379ece0b3d305c43"
        }
      ]
    }
  ]'
```

If private /32 CIDR rules were used, revoke the exact CIDR rules recorded in
the execution record.

### Package Removal

Do not remove `wireguard-tools` automatically unless the operator explicitly
approves package cleanup. Keeping the package installed but the interface
stopped is acceptable for a failed canary if recorded.

## Execution Record Requirements

Any execution record must include:

```text
approval phrase
operator timestamp
target instance ids
target private/public IPs
target security groups
mesh CIDR
mesh interface name
WireGuard UDP port
package install result
private key handling statement
public key hash or key-recording decision
SG rule form used
wg-quick service state
latest-handshake summary
mesh health validation
public non-regression validation
rollback performed or not performed
secrets/data copied or not copied
```

The execution record must not include:

```text
private keys
preshared keys
production .env content
CONSOLE_TOKEN
SS_PASSWORD
subscription URLs
opaque artifact values
SQLite contents
customer browsing destinations
raw access logs
raw journal excerpts with secrets
cloud credentials
```

## Completion Criteria

The canary is successful only if:

```text
both nodes have wg-quick@wg-edge active
both nodes show a recent WireGuard handshake
10.89.0.1 and 10.89.0.2 can reach each other
mesh health checks succeed or failures are understood and contained
public subscription gateway remains unchanged
public Shadowsocks ports remain reachable
DNS remains unchanged
Subscription V2 output remains unchanged
no customer traffic is moved
no secrets or private key material are recorded
rollback commands are available and verified syntactically
```

If any completion criterion fails, record the failure and either roll back or
explicitly keep the partial state under a separate operator decision.

## Recommended Next Step

After this runbook is reviewed and merged, the next action is not automatic
execution.

The next action requires the explicit approval phrase:

```text
Approve two-node WireGuard server edge mesh canary between prod-edge-a and prod-edge-b. No user traffic, no DNS change, no subscription output change, no cutover.
```
