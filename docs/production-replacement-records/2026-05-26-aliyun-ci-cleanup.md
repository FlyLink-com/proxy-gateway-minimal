# Aliyun Manual CI Lane Cleanup

Date: 2026-05-26, Asia/Shanghai.

Branch: `codex/aliyun-platform-split-runbook`

PR: `#131`

Risk: A-adjacent Aliyun host mutation, limited to manual-CI residue cleanup.

Approval context:

```text
Operator agreed to proceed after the node-cleanup review identified Aliyun
platform promotion as the required next step.
```

This cleanup followed the previously documented gate:

```text
Approve Aliyun manual CI lane cleanup. No production authority transfer, no DNS change, no user traffic.
```

## Boundary

Performed:

```text
read-only cleanup dry-run on Aliyun
delete root user npm/cache residue from the historical manual CI lane
delete any matching /tmp/proxy-gateway-ci-*.tar archives
post-cleanup residue recheck
post-cleanup listener, process, firewall, route, disk, memory, and Aliyun
instance status recheck
```

Not performed:

```text
no production authority transfer
no DNS change
no user traffic change
no Nginx install or configuration
no systemd service install, restart, enable, or disable
no firewall, security-group, or WireGuard mutation
no proxy-gateway deployment
no package install or upgrade
no SQLite, tenant, artifact, token, subscription URL, or secret movement
no AWS mutation
```

## Cleanup Dry-Run

Target host:

```text
SSH alias: miyao
Host user: root
Hostname: iZrj92lvcxgfwxsyrupgfkZ
```

Dry-run found:

```text
/root/proxy-gateway-manual-ci: absent
/root/.gh: absent
/root/.config/gh: absent
/root/.git-credentials: absent
/root/.npm: present, about 33 MiB
/root/.cache: present, about 4 KiB
/tmp/proxy-gateway-ci-*.tar: none
shallow $HOME scan for .git, node_modules, proxy-gateway-minimal: none
```

Runtime dry-run facts:

```text
node: v22.22.2
npm: 10.9.7
git: 2.43.0
nginx: not installed
proxy-gateway / node app / npm / pm2 / nginx / xray / v2ray / sing-box /
  shadowsocks process filter: none after cleanup
```

## Cleanup Command

The mutation was limited to user-level CI residue paths:

```bash
rm -rf -- "$HOME/.npm" "$HOME/.cache"
find /tmp -maxdepth 1 -type f -name "proxy-gateway-ci-*.tar" -delete
```

## Post-Cleanup Residue Recheck

Observed after cleanup:

```text
/root/proxy-gateway-manual-ci: absent
/root/.gh: absent
/root/.config/gh: absent
/root/.git-credentials: absent
/root/.npm: absent
/root/.cache: absent
/tmp/proxy-gateway-ci-*.tar: none
```

## Post-Cleanup Host Recheck

System facts after cleanup:

```text
node: v22.22.2
npm: 10.9.7
git: 2.43.0
nginx: not installed
root disk: 40 GiB total, 35 GiB available, 9% used
memory: 1.6 GiB total, about 1.1 GiB available
swap: none
Aliyun instance status: Running
DDoS status: normal
public IP: 47.251.178.125
private IP: 172.18.54.13
```

Listener / process posture after cleanup:

```text
SSH remains listening on 22/tcp.
systemd-resolved, DHCP, chrony, and WireGuard wg-home remain as before.
WireGuard wg-home remains active on UDP 51820.
No proxy-gateway, Node app, npm, pm2, nginx, xray, v2ray, sing-box, ss-local,
ssserver, or shadowsocks runtime process was observed after cleanup.
UFW remains inactive.
iptables default policies remain ACCEPT.
```

WireGuard peer identity and key material are intentionally not recorded here.

## Decision

```text
Aliyun manual CI lane cleanup: completed
CI workspace residue: absent
CI archive residue: absent
GitHub CLI config residue: absent
git credential residue: absent
npm/cache residue: removed and rechecked absent
production authority moved: no
DNS changed: no
user traffic changed: no
Nginx/systemd/firewall changed: no
WireGuard changed: no
proxy-gateway deployed: no
secrets copied or recorded: no
```

## Remaining Gate

Aliyun can now move from "cleanup pending" to the next gated step:

```text
Approve Aliyun subscription control-plane candidate preparation. No DNS change, no user traffic, no production authority transfer, no edge traffic.
```

That later gate still must handle:

```text
candidate public/private boundary
Nginx or equivalent local boundary
firewall posture
WireGuard wg-home accept/scope/remove decision
candidate service bootstrap
private health validation
no public Admin exposure
no production state authority until a later state-copy/promotion gate
```

## Rollback

No service rollback was required. The cleanup removed disposable CI cache
material only. If npm cache is later needed, it should be recreated by the next
approved package install or validation run rather than restored from this
cleanup.
