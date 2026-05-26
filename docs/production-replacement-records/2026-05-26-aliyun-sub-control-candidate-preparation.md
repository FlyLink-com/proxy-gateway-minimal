# Aliyun Subscription-Control Candidate Preparation

Date: 2026-05-26

Risk: A

Approval:

```text
Approve Aliyun subscription control-plane candidate preparation. No DNS change, no user traffic, no production authority transfer, no edge traffic.
```

## Scope

Approved scope:

```text
Prepare the current Aliyun host as a private subscription-control candidate.
Keep production authority, DNS, user traffic, production state, and edge traffic
unchanged.
```

Not approved and not performed:

```text
DNS change
user traffic cutover
production authority transfer
edge traffic
production SQLite copy or restore
artifact state copy
production .env copy
production secret, token, subscription URL, private key, or customer data copy
AWS mutation
WireGuard mutation
public Admin exposure
CI workload on the candidate host
```

## Repository Artifact

Candidate artifact source:

```text
branch: codex/aliyun-platform-split-runbook
commit: bfe6f89b723a3fbf7c1822202648e7078d6636aa
archive: proxy-gateway-candidate-bfe6f89b723a.tar
```

Local validation before artifact transfer:

```text
npm test: initial attempt failed because the isolated worktree had no node_modules
npm ci: passed
npm test: passed, 180/180
```

The initial test failure was dependency setup drift in the isolated worktree,
not an application test failure.

## Preflight

Before candidate preparation:

```text
/opt/proxy-gateway-minimal-candidate: absent
proxy-gateway-candidate.service: inactive / not found
Nginx: not installed or inactive
UFW: inactive
public listeners: SSH, DNS/host services, chrony, DHCP, and existing wg-home UDP 51820
```

The existing `wg-home` lab path was accepted for now and preserved. It was not
rekeyed, reconfigured, restarted, or promoted to production.

## Executed Changes

Aliyun host changes:

```text
installed nginx and sqlite3
created proxy-gateway-candidate system user
deployed archive to /opt/proxy-gateway-minimal-candidate/releases/bfe6f89b723a
created candidate-only .env with newly generated random values, not copied from production and not recorded
created /opt/proxy-gateway-minimal-candidate/current symlink
created proxy-gateway-candidate.service
started and enabled proxy-gateway-candidate.service
configured Nginx loopback-only candidate site on 127.0.0.1:18080
enabled and reloaded Nginx
enabled UFW default deny incoming / allow outgoing
allowed OpenSSH
allowed existing wg-home 51820/udp only to preserve the approved lab path
```

The candidate application starts with `autoStartHttpProxy: false`, so the
subscription-control candidate does not open the project HTTP proxy data-plane
listener.

## Validation

Candidate service validation from the Aliyun host:

```text
proxy-gateway-candidate.service: active / enabled
nginx: active / enabled
http://127.0.0.1:3456/api/health: ok, authRequired true
http://127.0.0.1:18080/api/health: ok, authRequired true
http://127.0.0.1:3456/api/admin/subscriptions without auth: 401
http://127.0.0.1:18080/api/admin/subscriptions: 404
http://127.0.0.1:3456/sub/clash.yaml without auth: 401
candidate SQLite integrity_check: ok
```

Listener validation from the Aliyun host:

```text
127.0.0.1:3456: proxy-gateway candidate app
127.0.0.1:18080: Nginx candidate boundary
0.0.0.0:22 and [::]:22: SSH
0.0.0.0:51820 and [::]:51820: existing wg-home lab path
no public 80 listener
no public 443 listener
no 1080 listener
no 18180 listener
no 18388 listener
```

Firewall validation:

```text
UFW status: active
default incoming: deny
default outgoing: allow
allowed inbound: OpenSSH, 51820/udp for existing wg-home lab path
```

External public-boundary validation used HP as a separate home-network vantage
because the Windows operator environment has local proxy/TUN variables that
make direct port probes unreliable. From HP:

```text
47.251.178.125:3456: closed
47.251.178.125:18080: closed
47.251.178.125:80: closed
47.251.178.125:443: closed
47.251.178.125:22: open
HTTP/HTTPS curls to 3456, 18080, 80, and 443: connection failed / timed out
```

DNS and AWS read-only verification:

```text
sub.globalcirclecat.com: A 13.215.156.159
ss-sg.globalcirclecat.com: A 13.215.156.159
prod-edge-a 13.215.156.159: running
prod-edge-b 18.136.102.226: running
```

No DNS, AWS, production endpoint, tenant, artifact, or subscription-output
mutation was performed.

## Observations

The first deployment script returned non-zero at an early local health check
because the service listener was not ready yet. Post-start validation showed
the service active and healthy.

`aegis.service` is currently failed. Journal history shows the same failed
restart pattern on 2026-05-24 and 2026-05-25 before this candidate work, and
apt/needrestart attempted it again during package installation. This record
does not mutate or repair the Aliyun Aegis service; treat it as a separate
host-maintenance observation.

## Rollback Plan

Candidate rollback, if needed:

```text
systemctl disable --now proxy-gateway-candidate.service
rm -f /etc/nginx/sites-enabled/proxy-gateway-candidate.conf
nginx -t && systemctl reload nginx
```

After diagnostics, the candidate tree can be removed with separate approval:

```text
rm -rf /opt/proxy-gateway-minimal-candidate
userdel proxy-gateway-candidate
```

Do not disable UFW or remove the preserved `wg-home` allow rule as part of a
blind rollback. Firewall rollback should be a separate operator decision
because the current deny-by-default boundary is safer for a future
subscription-control candidate and still preserves SSH access.

## Next Gate

The next gate is private state-copy validation:

```text
Approve Aliyun private state-copy validation. No DNS change, no user traffic, no public Admin, no production authority transfer.
```

That gate must still avoid printing or committing tokens, subscription URLs,
`.env` values, private keys, SQLite rows, or customer data.
