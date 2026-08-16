# Aliyun Private State-Copy Preflight


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: aliyun_state_copy_preflight
  superseded_by: null
  last_verified_at: 2026-05-26
  production_authority: false
```


Date: 2026-05-26, Asia/Shanghai.

Risk: A-adjacent read-only preflight.

Branch: `codex/aliyun-state-copy-preflight`

Operator request:

```text
Continue the next step.
```

## Boundary

This record checks whether Aliyun is ready for the next private state-copy
validation gate. It does not authorize or perform the state copy.

Performed:

```text
read-only Aliyun candidate service checks
read-only Aliyun candidate SQLite integrity_check
read-only Aliyun listener and firewall checks
read-only DNS inventory for subscription hostnames
read-only AWS prod-edge-a identity check
read-only public boundary checks from the operator and HP vantage points
read-only prod-edge-a SSH/internal-inspection attempt
```

Not performed:

```text
no production SQLite copy
no artifact state copy
no production .env copy
no secret, token, subscription URL, private key, or customer data readout
no DNS change
no user traffic change
no public Admin exposure
no production authority transfer
no Nginx, systemd, firewall, WireGuard, AWS, tenant, artifact, or edge traffic mutation
```

## Aliyun Candidate Checks

Aliyun candidate host:

```text
hostname: iZrj92lvcxgfwxsyrupgfkZ
time observed: 2026-05-26T15:06:35+08:00 and later
```

Service states:

```text
proxy-gateway-candidate.service: active
nginx: active
wg-quick@wg-home.service: active
ufw: active
```

Local health:

```text
http://127.0.0.1:3456/api/health: ok, authRequired true
http://127.0.0.1:18080/api/health: ok, authRequired true
```

Local auth / route boundary:

```text
http://127.0.0.1:3456/api/admin/subscriptions without auth: 401
http://127.0.0.1:18080/api/admin/subscriptions: 404
http://127.0.0.1:3456/sub/clash.yaml without auth: 401
http://127.0.0.1:18080/sub/clash.yaml: 404
```

Candidate SQLite:

```text
path: /opt/proxy-gateway-minimal-candidate/state/subscriptions.sqlite
integrity_check: ok
```

Nginx:

```text
nginx -t: successful
```

Listeners:

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

Firewall:

```text
UFW status: active
default incoming: deny
default outgoing: allow
allowed inbound: OpenSSH, 51820/udp for the existing wg-home lab path
```

## Public Boundary Checks

HP vantage point:

```text
47.251.178.125:22: open
47.251.178.125:80: timeout
47.251.178.125:443: timeout
47.251.178.125:3456: timeout
47.251.178.125:18080: timeout
```

This keeps the Aliyun candidate private for subscription-control validation.
The existing WireGuard UDP lab path remains separately scoped and was not
changed in this preflight.

Current production and secondary edge public checks from HP:

```text
13.215.156.159:22: open
13.215.156.159:80: open
13.215.156.159:443: open
13.215.156.159:18388: open
18.136.102.226:22: open
18.136.102.226:80: open
18.136.102.226:18388: open
```

Current tokenless production endpoint checks:

```text
https://sub.globalcirclecat.com/api/health via 13.215.156.159: ok, authRequired true
https://sub.globalcirclecat.com/sub/clash.yaml without token via 13.215.156.159: 401
```

## DNS And AWS Checks

AliDNS authoritative records:

```text
sub.globalcirclecat.com: A 13.215.156.159, TTL 600, ENABLE
ss-sg.globalcirclecat.com: A 13.215.156.159, TTL 600, ENABLE
```

AWS prod-edge-a identity:

```text
instance id: i-0b7791340d3fedff5
state: running
public IP: 13.215.156.159
type: t4g.small
name: proxy-gateway-prod-edge-a-20260524
role tag: prod-edge-a-candidate
security group: sg-0379ece0b3d305c43
```

## Source Internal Inspection

Attempted read-only SSH inspection of current prod-edge-a:

```text
target: ubuntu@13.215.156.159
key: local operator key path only; key material not printed
result: blocked
error class: connection timed out during banner exchange
```

Because the source host-internal path is blocked, this preflight did not verify:

```text
source systemd service state from inside prod-edge-a
source Nginx state from inside prod-edge-a
source SQLite path from inside prod-edge-a
source SQLite integrity_check from inside prod-edge-a
fresh source backup creation or validation
source artifact state paths
```

## Decision

Aliyun private candidate readiness:

```text
candidate app: healthy
candidate loopback Nginx: healthy
candidate SQLite integrity: ok
candidate public Admin exposure: not observed
candidate public 80/443/3456/18080 exposure: not observed
DNS/user traffic: still on AWS prod-edge-a
production authority transfer: not performed
state-copy readiness: blocked by source internal inspection path
```

The next step is not yet a state copy. The next step is to establish an
approved source internal inspection path for prod-edge-a, or otherwise provide
an approved private source backup path, without exposing secrets or changing
traffic.

## Next Gate

Recommended next gate:

```text
Approve prod-edge-a source internal state-copy inspection. Read-only only. No DNS change, no user traffic, no service restart, no SQLite copy, no public Admin.
```

After that source inspection passes, the existing private state-copy validation
gate can be requested:

```text
Approve Aliyun private state-copy validation. No DNS change, no user traffic, no public Admin, no production authority transfer.
```

## Rollback

No rollback was required because this preflight made no runtime, cloud, DNS,
firewall, service, state, tenant, artifact, or traffic mutation.
