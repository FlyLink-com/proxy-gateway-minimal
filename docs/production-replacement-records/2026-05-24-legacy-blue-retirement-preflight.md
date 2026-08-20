# Legacy Blue Retirement Preflight


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: legacy_blue_retirement_preflight
  superseded_by: null
  last_verified_at: 2026-05-24
  production_authority: false
```


Date: 2026-05-24, Asia/Shanghai.

## Status

```text
Risk: A / read-only retirement preflight
Scope: legacy blue retirement readiness
AWS mutation: none
Production mutation: none
DNS mutation: none
Nginx / systemd / service restart: none
Secrets / tokens / raw subscription URLs / SQLite data copied: none
Retirement approved: no
```

This record checks whether legacy blue can be retired after `prod-edge-a`
became the production MVP target with Subscription V2 output. It does not
authorize stopping, terminating, detaching security groups, deleting security
groups, deleting keys, removing DNS records, changing production config, or
removing legacy subscription endpoints.

## Targets

| Role | Instance | Public IP | Security group | Current role |
| --- | --- | --- | --- | --- |
| Legacy blue | `i-004ab1c6c71d06bca` | `47.129.247.102` | `sg-04a165ec77f430ee8` | Review and controlled exit only |
| Current production | `i-0b7791340d3fedff5` | `13.215.156.159` | `sg-0379ece0b3d305c43` | `prod-edge-a` production MVP target |
| Temporary secondary | `i-0ad8676ee113d14cb` | `18.136.102.226` | `sg-06682c36aa03834f7` | Temporary `prod-edge-b` in V2 output |

## Read-Only AWS Inventory

`describe-instances` showed:

```text
legacy blue:
  instance: i-004ab1c6c71d06bca
  public IP: 47.129.247.102
  state: running
  type: t4g.small
  name: proxy-gateway-node-sg-blue-20260521
  project tag: none
  security group: sg-04a165ec77f430ee8

prod-edge-a:
  instance: i-0b7791340d3fedff5
  public IP: 13.215.156.159
  state: running
  type: t4g.small
  name: proxy-gateway-prod-edge-a-20260524
  project tag: proxy-gateway-minimal
  security group: sg-0379ece0b3d305c43

prod-edge-b / current green:
  instance: i-0ad8676ee113d14cb
  public IP: 18.136.102.226
  state: running
  type: t4g.small
  name: proxy-gateway-node-sg-green-20260524
  project tag: proxy-gateway-minimal
  security group: sg-06682c36aa03834f7
```

`describe-instance-status --include-all-instances` showed all three instances
as `running`, with system and instance status `ok`.

Security group read-only check showed legacy blue still has public ingress for:

```text
80/tcp
443/tcp
18388/tcp
18388/udp
22/tcp from the operator IP allowlist
```

This matches the current green and `prod-edge-a` public-service shape.

## EIP / IP Retention Check

`describe-addresses --public-ips 47.129.247.102` returned:

```text
InvalidAddress.NotFound
```

Conclusion: legacy blue `47.129.247.102` is still not confirmed as an Elastic IP.
Do not assume the public IP can be retained after stop/terminate.

## DNS Check

AliDNS read-only checks showed:

```text
sub.globalcirclecat.com   A 13.215.156.159 TTL 600
ss-sg.globalcirclecat.com A 13.215.156.159 TTL 600
```

Local DNS resolution also returned:

```text
sub.globalcirclecat.com   -> 13.215.156.159 TTL 600
ss-sg.globalcirclecat.com -> 13.215.156.159 TTL 600
```

Conclusion: authoritative and local DNS no longer point these production names
at legacy blue.

## Public Reachability Check

From the local operator network, legacy blue is currently reachable:

```text
47.129.247.102:22    TCP reachable
47.129.247.102:80    TCP reachable
47.129.247.102:18388 TCP reachable
```

This differs from the earlier local timeout evidence. Treat the old timeout as
an incident observation from that earlier time window, not the current state.

Public HTTP boundary checks against legacy blue returned:

```text
http://47.129.247.102/api/health              -> 200
http://47.129.247.102/api/admin/subscriptions -> 404
http://47.129.247.102/sub/clash.yaml          -> 401 without token
```

Current production comparison:

```text
http://13.215.156.159/api/health -> 200
13.215.156.159:18388             -> TCP reachable
18.136.102.226:18388             -> TCP reachable
```

## Repository Reference Check

Tracked production node config no longer emits legacy blue:

```text
config/proxy-servers.json:
  prod-edge-a -> ss-sg.globalcirclecat.com
  prod-edge-b -> 18.136.102.226
```

Remaining tracked references to legacy blue were found in documentation and
local client config:

```text
config/ss-local.json
docs/NETWORK_FORWARDING.md
README.md
ops/README.md
docs/PROJECT_CONTEXT.md historical entries
```

`config/ss-local.json` still points local `ss-local` direct mode at
`47.129.247.102`. This is not the production subscription path, but it is a
tracked local-runtime default. Retiring legacy blue before updating or
explicitly accepting this local-runtime break would make that path fail.

## Readiness Assessment

Ready to request legacy blue retirement execution approval:

```text
Not yet.
```

Reasons:

```text
1. Legacy blue is still running and reachable, so retirement must be an
   explicit controlled action, not an incident cleanup assumption.
2. The IP is not confirmed as EIP; stop/terminate may permanently release it.
3. Tracked local config still points `ss-local` direct mode at legacy blue.
4. Stale operational docs still describe legacy blue as current production.
5. Security group cleanup and instance stop/termination are AWS mutations and
   require a separate explicit A-tier approval.
```

Ready to clean stale repo references before retirement:

```text
Yes.
```

Recommended next action:

```text
1. Run a C/B-tier repo cleanup to move local default config and active docs away
   from legacy blue:
   - config/ss-local.json -> current production node host
   - docs/NETWORK_FORWARDING.md -> prod-edge-a / V2 production facts
   - README.md and ops/README.md -> current production facts

2. After that cleanup, request a separate A-tier approval phrase for actual
   legacy blue retirement execution.
```

Suggested future approval phrase for mutation:

```text
Retire legacy blue i-004ab1c6c71d06bca after repo reference cleanup. Stop only; do not terminate.
```

Use stop-before-terminate as the first retirement action unless the operator
explicitly approves termination. Stopping is still destructive with respect to
the unconfirmed public IP, so it remains A-tier.

## Non-Actions Confirmed

```text
No instance stopped
No instance terminated
No security group changed
No DNS changed
No Nginx changed
No systemd service restarted
No production config changed
No tenant changed
No token or raw subscription URL recorded
No SQLite copied
No AWS credential copied
```
