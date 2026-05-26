# Aliyun CI Cleanup And Subscription-Control Candidate Inventory

Date: 2026-05-26, Asia/Shanghai.

> Status:
> - Type: Read-only execution record
> - Risk: A-adjacent inventory; no mutation performed
> - Execution authority: Does not authorize cleanup, package install, service
>   deployment, Nginx, systemd, firewall/security-group, DNS, SQLite, secret,
>   artifact, tenant, production authority, edge traffic, or cutover changes
> - Production impact: None
> - Source of truth for: first read-only inventory of the current Aliyun server
>   before retiring it from the CI lane and considering it as `sub-control-a`

## Scope

This record follows `docs/ALIYUN_CONTROL_LOCAL_CI_REBUILD_PLAN.md`:

```text
current Aliyun server -> future subscription control-plane candidate
local Linux server -> manual CI
clean servers -> edge data-plane forwarding nodes
```

Only read-only SSH, Aliyun CLI, and process/listener inventory commands were
run. No cleanup, install, deploy, service restart, Nginx config, firewall
change, WireGuard change, DNS change, SQLite movement, secret movement, node
traffic change, or production authority transfer was performed.

## Target

```text
SSH alias: miyao
Cloud product: Aliyun SWAS / Simple Application Server
Instance id: 3e9253d3fb044463b876edacf6af8784
Public IP: 47.251.178.125
Private IP: 172.18.54.13
Region: us-west-1
Image: Ubuntu 24.04
Plan: 2 CPU, 2.0 GB memory, 40 GB ESSD disk, 200 Mbps bandwidth
Candidate role: sub-control-a after cleanup, hardening, bootstrap, validation,
  and separate promotion approval
Current reality: historical/manual CI host with an active WireGuard lab
  interface; not yet a production subscription control plane
```

## Commands

Representative read-only commands:

```powershell
ssh -o BatchMode=yes miyao "hostname; whoami; date -Iseconds; cat /etc/os-release; uname -a; df -h; free -h; node --version; npm --version; git --version; nginx -v || true"
```

```powershell
ssh -o BatchMode=yes miyao "find \$HOME -maxdepth 4 -type d -name 'proxy-gateway-manual-ci' -o -name '.gh' -o -name '.npm'; find /tmp -maxdepth 1 -type f -name 'proxy-gateway-ci-*.tar'; test -f ~/.git-credentials && echo present || echo absent"
```

```powershell
ssh -o BatchMode=yes miyao "ss -lntup; systemctl list-units --type=service --state=running --no-pager; ip -br addr; ip route; timedatectl; sudo -n ufw status || true; sudo -n iptables -S || true"
```

```powershell
aliyun swas-open list-instances --region us-west-1 --biz-region-id us-west-1
```

Secrets, private keys, subscription URLs, credentials, `.env` values, SQLite
contents, customer data, and raw WireGuard key material are intentionally not
recorded.

## Observed System Facts

```text
Hostname: iZrj92lvcxgfwxsyrupgfkZ
User: root
OS: Ubuntu 24.04.2 LTS
Kernel: 6.8.0-63-generic
Timezone: Asia/Shanghai
NTP: active and synchronized
Root disk: 40 GiB total, 35 GiB available
Memory: 1.6 GiB total, 1.1 GiB available
Swap: none
node: v22.22.2
npm: 10.9.7
git: 2.43.0
nginx: not installed
```

Aliyun instance inventory:

```text
Status: Running
Public IP: 47.251.178.125
Private IP: 172.18.54.13
DDoS status: normal
Disk: 40 GiB
Expiry: 2027-03-27T16:00:00Z
```

## CI Residue Inventory

Observed:

```text
proxy-gateway-manual-ci workspaces under $HOME: absent
/tmp/proxy-gateway-ci-*.tar archives: absent
GitHub CLI config: absent
git credentials file: absent
npm cache: present, about 33 MiB under /root/.npm
user cache: present, about 4 KiB under /root/.cache
node_modules/.git directories under shallow $HOME scan: absent
```

Assessment:

```text
No active manual-CI workspace, archive, GitHub config, or git credential file
was found in the read-only scan. Small user-level npm/cache residue remains and
can be removed only after explicit cleanup approval.
```

Required cleanup approval phrase:

```text
Approve Aliyun manual CI lane cleanup. No production authority transfer, no DNS change, no user traffic.
```

## Listener And Service Inventory

Listeners observed:

```text
22/tcp: SSH on 0.0.0.0 and [::]
53/tcp and 53/udp: local systemd-resolved stubs on loopback
68/udp: DHCP client on eth0
323/udp: chrony local listener
51820/udp: WireGuard on 0.0.0.0 and [::]
```

Running service inventory includes OS/base services such as SSH, chrony,
systemd-networkd, systemd-resolved, unattended-upgrades, rsyslog, cron,
polkit, and Aliyun agent service.

Not observed by the process/unit filters:

```text
nginx
proxy-gateway
node application process
npm
pm2
xray
v2ray
sing-box
shadowsocks process
```

## Network Inventory

```text
lo: 127.0.0.1/8, ::1/128
eth0: 172.18.54.13/18
wg-home: 10.90.0.1/24
```

Routes include the normal Aliyun private-network default path and the
WireGuard lab subnet. WireGuard `wg-home` is active with one peer and a recent
handshake was observed. The keys are not recorded here.

Firewall inventory:

```text
ufw: inactive
iptables default policies: ACCEPT for INPUT, FORWARD, and OUTPUT
```

This firewall posture is not acceptable as a final production subscription
control-plane boundary. Candidate preparation must either harden the host or
place it behind an approved public boundary before any production authority is
considered.

## Directory Inventory

```text
/opt: present
/srv: present
/var/www: absent
/etc/nginx: absent
/etc/wireguard: present
proxy-gateway-like directories under /opt, /srv, /var/www: absent in the
  shallow scan
```

## Candidate Readiness Assessment

Ready for the next gated step:

```text
SSH access works through alias miyao.
Node.js 22, npm, and git are already present.
Disk capacity is sufficient for a small subscription-control candidate.
No active CI workspace, archive, GitHub config, or git credential file was
found by the read-only scan.
No proxy-gateway runtime, Nginx runtime, or app listener is currently active.
```

Not ready for production-control bootstrap without approval and hardening:

```text
Nginx is absent.
No proxy-gateway service is deployed.
UFW is inactive and iptables defaults are ACCEPT.
WireGuard wg-home is active on UDP 51820 and must be explicitly accepted,
scoped, or removed during candidate hardening.
The host has only about 2 GiB memory and no swap.
The server is not yet documented as clean from all old validation-host residue
until approved cleanup is performed and rechecked.
No production SQLite, artifact state, Admin boundary, Nginx public boundary,
backup/restore path, or rollback path has been validated on this host.
```

## Decision

```text
Decision: read-only inventory complete
Aliyun CI cleanup state: cleanup not yet approved or performed
Subscription-control candidate state: possible but not prepared
Production authority moved: no
User traffic changed: no
DNS changed: no
Nginx/systemd/firewall changed: no
Secrets copied: none
```

Required next gates:

```text
1. Approve and run Aliyun manual CI lane cleanup.
2. Recheck CI residue after cleanup.
3. Approve Aliyun subscription control-plane candidate preparation.
4. Bootstrap candidate service without DNS, user traffic, production authority,
   edge traffic, SQLite authority movement, or public Admin exposure.
```

Required candidate-preparation approval phrase:

```text
Approve Aliyun subscription control-plane candidate preparation. No DNS change, no user traffic, no production authority transfer, no edge traffic.
```

## Rollback

No rollback was required because this record performed read-only inventory
only.
