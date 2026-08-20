# Aliyun Gate A Live Inventory Refresh


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: aliyun_gate_a_live_inventory
  superseded_by: null
  last_verified_at: 2026-05-27
  production_authority: false
```


Date: 2026-05-27, Asia/Shanghai.

Risk: A-adjacent read-only inventory.

Branch: `codex/aliyun-gate-a-live-inventory`

Operator request:

```text
Continue.
```

## Boundary

This record refreshes live evidence for Aliyun promotion Gate A. It replaces
stale planning assumptions before any promotion, state-copy, DNS, or public
boundary work.

Performed:

```text
read-only repository branch and PR inventory
read-only AliDNS inventory
read-only AWS instance and status inventory
read-only Aliyun SWAS instance and firewall inventory
read-only Aliyun host service, listener, resource, health, Nginx, UFW, and
candidate SQLite checks
read-only HP vantage public port and HTTP checks
read-only operator vantage DNS / TCP / HTTP checks
read-only repository reference scan for stale node and DNS dependencies
```

Not performed:

```text
no Aliyun deployment
no DNS change
no Nginx, systemd, UFW, WireGuard, firewall, or security-group mutation
no service restart, start, stop, reload, or reboot
no AWS start, stop, reboot, termination, or volume action
no production state copy
no SQLite, tenant, artifact, or subscription output mutation
no public listener exposure
no edge traffic activation
no production authority transfer
no secret, token, subscription URL, private key, SQLite row, .env value, or
customer data readout
```

## Agent / Task Routing

Lead agent:

```text
Codex
```

Primary unit:

```text
Production Ops Agent
```

Supporting units:

```text
Validation / CI Agent for repository validation evidence
Subscription Access Agent for state-copy and artifact-boundary implications
Sidecar Reviewer for read-only Gate A scope review
```

Next owner:

```text
Production Ops Agent for Gate B source access / source-state planning and a
separate provider-firewall hardening plan before any public-boundary dry run.
```

## Repository Snapshot

```text
branch: codex/aliyun-gate-a-live-inventory
base commit observed: 59543c1ded2f3eb69a1dd01e97d8245bdc6c49db
open PRs at inventory start: none
```

No uncommitted repository mutation existed before this inventory record was
created.

## AliDNS Inventory

Authoritative AliDNS records still point subscription and edge hostnames to the
old AWS address:

```text
sub.globalcirclecat.com: A 13.215.156.159, TTL 600, ENABLE
ss-sg.globalcirclecat.com: A 13.215.156.159, TTL 600, ENABLE
```

Operator-device `Resolve-DnsName` returned synthetic `198.18.0.0/15` answers
from the local network/proxy environment. Those local resolver answers are not
treated as authoritative project state. AliDNS remains the authoritative DNS
source for this gate.

## AWS Inventory

AWS Singapore instances:

```text
i-0b7791340d3fedff5:
  name: proxy-gateway-prod-edge-a-20260524
  role: prod-edge-a-candidate
  state: stopped
  public IP: none
  private IP: 172.31.27.240
  type: t4g.small
  security group: sg-0379ece0b3d305c43
  instance status: not-applicable while stopped

i-0ad8676ee113d14cb:
  name: proxy-gateway-node-sg-green-20260524
  role: green-candidate
  state: stopped
  public IP: none
  private IP: 172.31.18.176
  type: t4g.small
  security group: sg-06682c36aa03834f7
  instance status: not-applicable while stopped

i-004ab1c6c71d06bca:
  name: proxy-gateway-node-sg-blue-20260521
  purpose: blue-deploy
  state: stopped
  public IP: none
  private IP: 172.31.26.232
  type: t4g.small
  security group: sg-04a165ec77f430ee8
  instance status: not-applicable while stopped

i-0589aac321172dd74:
  name: proxy-gateway-aws-sg
  purpose: aws-singapore-proxy
  state: stopped
  public IP: none
  private IP: 172.31.24.0
  type: t4g.small
  security group: sg-0748fd9a7f936e28d
  instance status: not-applicable while stopped

i-0609ff48af3946c1c:
  name: meshcentral-singapore-8vcpu-20260512
  project: MeshCentral
  state: stopped
  public IP observed in AWS inventory: 52.76.105.23
  private IP: 172.31.39.78
  type: t3a.2xlarge
  security group: sg-04e4adda17e41d12b
  note: out of proxy-gateway mutation scope without separate owner approval

i-0f2cf745a1bb5ba51:
  name: channel-lab-a
  role: channel-canary
  state: running
  public IP: 18.143.186.75
  private IP: 172.31.33.46
  type: t3.small
  security group: sg-0cad3c8a7380528f9
  system status: ok
  instance status: ok
```

Implication:

```text
The old production DNS target, 13.215.156.159, is no longer attached to the
stopped prod-edge-a instance. Rollback to AWS would require a separate
rollback-start / DNS / runtime plan before it can be treated as a live source.
```

## Aliyun Cloud Inventory

Aliyun SWAS:

```text
instance id: 3e9253d3fb044463b876edacf6af8784
name: Ubuntu-jkoy
region: us-west-1
status: Running
public IP: 47.251.178.125
private IP: 172.18.54.13
DDoS status: normal
plan: 2 CPU, 2 GiB memory, 40 GiB ESSD, 200 Mbps bandwidth
expiry: 2027-03-27T16:00:00Z
```

Provider firewall inventory:

```text
22/tcp: accept from 0.0.0.0/0
80/tcp: accept from 0.0.0.0/0
443/tcp: accept from 0.0.0.0/0
3128/tcp: accept from 0.0.0.0/0
1194/tcp: accept from 0.0.0.0/0
1-65535/udp: accept from 0.0.0.0/0
1-65535/tcp+udp: accept from 0.0.0.0/0
```

Implication:

```text
Aliyun provider firewall posture is too broad for promotion. Host UFW currently
blocks most public paths, but provider-firewall hardening must be separately
planned and approved before any public-boundary dry run or promotion.
```

## Aliyun Host Inventory

Host:

```text
hostname: iZrj92lvcxgfwxsyrupgfkZ
OS: Ubuntu 24.04.2 LTS
kernel: 6.8.0-63-generic
time zone: Asia/Shanghai
system clock synchronized: yes
uptime: about 4 days, 8 hours at inventory time
CPU: 2
memory: 1.6 GiB total, about 1.1 GiB available
swap: none
root filesystem: 40 GiB total, about 35 GiB available
node: v22.22.2
npm: 10.9.7
git: 2.43.0
```

Network:

```text
eth0: 172.18.54.13/18
wg-home: 10.90.0.1/24
default route: via 172.18.63.253 dev eth0
```

Services:

```text
proxy-gateway-candidate.service: active
nginx: active
wg-quick@wg-home.service: active
ufw: active
```

Host listeners:

```text
127.0.0.1:3456/tcp: proxy-gateway candidate app
127.0.0.1:18080/tcp: candidate Nginx
0.0.0.0:22/tcp and [::]:22/tcp: SSH
0.0.0.0:51820/udp and [::]:51820/udp: existing wg-home lab path
no host listener observed on public 80/tcp
no host listener observed on public 443/tcp
no host listener observed on public 3456/tcp
no host listener observed on public 18080/tcp
```

UFW:

```text
status: active
default incoming: deny
default outgoing: allow
allowed inbound: OpenSSH and 51820/udp for existing wg-home lab path
```

Candidate service:

```text
current release path: /opt/proxy-gateway-minimal-candidate/releases/bfe6f89b723a
current symlink: /opt/proxy-gateway-minimal-candidate/current
systemd unit: proxy-gateway-candidate.service
unit active since: 2026-05-26 13:56:12 CST
process memory: about 32 MiB at inventory time
git metadata in current release: absent
```

Local health and boundary:

```text
http://127.0.0.1:3456/api/health: ok, authRequired true
http://127.0.0.1:18080/api/health: ok, authRequired true
http://127.0.0.1:3456/api/admin/subscriptions without auth: 401
http://127.0.0.1:18080/api/admin/subscriptions: 404
nginx -t: successful
candidate SQLite integrity_check: ok
```

Candidate state-file metadata:

```text
/opt/proxy-gateway-minimal-candidate/state/subscriptions.sqlite:
  size: 73728 bytes
  timestamp: 2026-05-26T13:56:11 local host time
```

No SQLite rows, tenant rows, artifact rows, `.env` values, tokens, or
subscription URLs were printed.

## Public Boundary Checks

HP vantage point via `g@192.168.10.250`:

```text
47.251.178.125:22: open
47.251.178.125:80: closed_or_timeout
47.251.178.125:443: closed_or_timeout
47.251.178.125:3456: closed_or_timeout
47.251.178.125:18080: closed_or_timeout

13.215.156.159:22: closed_or_timeout
13.215.156.159:80: closed_or_timeout
13.215.156.159:443: closed_or_timeout
13.215.156.159:18388: closed_or_timeout

sub.globalcirclecat.com:80: closed_or_timeout
sub.globalcirclecat.com:443: closed_or_timeout
ss-sg.globalcirclecat.com:18388: closed_or_timeout

https://sub.globalcirclecat.com/api/health: http_code 000
https://sub.globalcirclecat.com/sub/clash.yaml: http_code 000
http://47.251.178.125/api/health: http_code 000
https://47.251.178.125/api/health: http_code 000
```

Operator-device vantage point:

```text
curl checks to sub.globalcirclecat.com and 47.251.178.125 timed out.
PowerShell TcpClient checks reported broad TCP open results that conflict with
HTTP timeouts and HP vantage checks.
Resolve-DnsName returned synthetic 198.18.0.0/15 answers for project domains.
```

Assessment:

```text
HP vantage and Aliyun host listeners show the candidate app remains private to
loopback. Operator-device TCP and DNS checks are not reliable readiness
signals in this environment because the local network/proxy path is visibly
intercepting or synthesizing behavior.
```

## Repository Reference Inventory

Tracked repository config still references stopped or stale output targets:

```text
config/proxy-servers.json:
  prod-edge-a host: ss-sg.globalcirclecat.com
  prod-edge-b host: 18.136.102.226
  ping hosts include sub.globalcirclecat.com, ss-sg.globalcirclecat.com, and 18.136.102.226
  nginx host: sub.globalcirclecat.com

config/ss-local.json:
  server: ss-sg.globalcirclecat.com
```

Implication:

```text
Subscription output/config remains stale for restored service. It must be
rebuilt through a separate approved edge/control-plane gate before the service
can be considered healthy for users.
```

## Decision

Promotion readiness decision:

```text
blocked
```

Rollback-source status:

```text
rollback-start-needed
```

Current service posture:

```text
accepted-outage
```

Reasons:

```text
AliDNS still points subscription and edge hostnames to an AWS address whose
carrying prod-edge-a instance is stopped and has no public IP association.

Aliyun candidate app and candidate Nginx are healthy on loopback, but no
production state-copy has been validated.

Aliyun provider firewall is too broad and must be hardened before any public
boundary dry run or promotion.

Existing wg-home UDP lab path remains active and must be accepted, scoped, or
removed before production hardening.

Tracked repository node config still references stopped or stale AWS targets.

HP vantage does not observe public Aliyun 80/443/3456/18080 exposure, and
public production endpoints are unavailable from HP during the accepted outage.
```

## Next Gates

Recommended next gates:

```text
Gate B source access / source-state planning.
Provider-firewall hardening plan before Gate D public-boundary dry run.
Clean edge node rebuild planning or rollback-start planning if temporary
restore is required.
Private state-copy validation only after source-state and backup prerequisites
are separately approved and satisfied.
```

Not approved by this record:

```text
source access remediation
state copy
public-boundary dry run
DNS promotion
edge rebuild
rollback-start
AWS cleanup or termination
WireGuard removal or mesh changes
legacy query-token retirement
```

## Validation

Repository validation required for this inventory record:

```text
npm run project-state:check
git diff --check origin/master...HEAD
```

Runtime validation is limited to the read-only commands recorded above.
