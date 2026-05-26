# Local Linux Manual CI Read-Only Inventory

Date: 2026-05-26, Asia/Shanghai.

> Status:
> - Type: Read-only execution record
> - Risk: A-adjacent inventory; no mutation performed
> - Execution authority: Does not authorize package install, CI bootstrap,
>   cleanup, staging, deploy, production, node, DNS, Nginx, systemd, SQLite,
>   secret, artifact, or cutover changes
> - Production impact: None
> - Source of truth for: first inventory of the local Linux host as the target
>   manual CI candidate

## Scope

This record follows `docs/ALIYUN_CONTROL_LOCAL_CI_REBUILD_PLAN.md`:

```text
current Aliyun server -> future subscription control-plane candidate
local Linux server -> manual CI candidate
clean servers -> edge data-plane forwarding nodes
```

Only read-only SSH commands were run. No packages were installed, no archives
were copied, and no production data, secrets, DNS, Nginx, systemd, SQLite,
node, or traffic state was changed.

## Target

```text
Host: hp-server
Access path: g@192.168.10.250 using the approved local SSH key
Candidate role: local-ci-a
Current reality: operator-lab HP server, not a sterile CI appliance
```

## Commands

The following commands were run from the Windows operator machine through SSH.
They are listed without key material or credentials.

```powershell
ssh -o BatchMode=yes -o ConnectTimeout=10 -i "$env:USERPROFILE\.ssh\hp-ubuntu-server-ed25519" g@192.168.10.250 "hostname; uname -a; df -h; free -h; node --version || true; npm --version || true; git --version || true; ip -br addr"
```

```powershell
ssh -o BatchMode=yes -o ConnectTimeout=10 -i "$env:USERPROFILE\.ssh\hp-ubuntu-server-ed25519" g@192.168.10.250 "cat /etc/os-release; lscpu | egrep 'Model name|CPU\\(s\\)|Architecture'; timedatectl; ss -lntup || true"
```

## Observed Facts

System:

```text
Hostname: hp-server
OS: Ubuntu 24.04.4 LTS
Kernel: 6.8.0-100-generic
Architecture: x86_64
CPU: Intel Core i5-8250U, 8 logical CPUs
Memory: 7.5 GiB total, 6.9 GiB available
Swap: 4.0 GiB total, unused at inventory time
Root disk: 98 GiB total, 85 GiB available
Timezone: Asia/Shanghai
NTP: active and synchronized
```

Tooling:

```text
git: 2.43.0
node: not installed
npm: not installed
```

Network:

```text
lo: 127.0.0.1/8
enx2c16dba9fe55: 10.10.10.2/24, 192.168.10.250/24, 192.168.10.152/24
wlp3s0: DOWN
wg-home: 10.90.0.2/32
```

Listeners observed:

```text
SSH: 0.0.0.0:22 and [::]:22
DNS stub: systemd-resolved local stub listeners
WireGuard lab interface: UDP 34249
Local proxy lab listeners: TCP 10881, TCP 10882, loopback TCP 8388
Python lab listener: 192.168.10.250:8088 and 10.90.0.2:8088
```

## Readiness Assessment

Pass:

```text
SSH BatchMode works from the operator machine.
Hardware is sufficient for manual CI validation.
git is already installed.
System clock is synchronized.
No repository archive, credential, production data, or secret was copied.
```

Not ready without approval:

```text
Node.js 22 is absent.
npm is absent.
Operator-lab networking services are active on the host.
```

Risk notes:

```text
The host is usable as a local manual CI candidate, but it is not a sterile CI
appliance. CI must use clean per-run workspaces and must not copy production
.env files, tokens, subscription URLs, SQLite data, cloud credentials, node
passwords, customer data, or long-lived repository credentials.

Manual CI evidence from this host remains repository validation only. It is not
staging, not deployment approval, and not production approval.
```

## Decision

```text
Decision: inventory complete
Candidate state: reachable and hardware-ready, tooling-incomplete
Next gate: explicit approval is required before installing Node.js 22 or
running archive-based manual CI validation
```

Required approval phrase before mutation:

```text
Approve local Linux manual CI bootstrap. No production secrets, no production data, no deploy, no staging.
```
