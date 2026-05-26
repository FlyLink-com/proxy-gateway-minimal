# Singapore Prod-Edge Stop With Accepted Outage

Date: 2026-05-26, Asia/Shanghai.

Risk: A production node mutation with accepted service outage.

Branch: `codex/singapore-node-stop-record`

Approval:

```text
Approve Singapore prod-edge-a and prod-edge-b stop with accepted service outage. Stop only, no termination, no security-group deletion, no DNS change, no Aliyun change, rollback by starting instances.
```

## Boundary

Approved and performed:

```text
stop AWS Singapore prod-edge-b instance
stop AWS Singapore prod-edge-a instance
verify both instances reached stopped state
verify DNS records were not changed
verify Aliyun private candidate remained active and private
record the accepted service outage and rollback caveat
```

Not approved and not performed:

```text
no instance termination
no security-group deletion
no DNS change
no Aliyun change
no SQLite copy
no artifact state copy
no production .env readout or copy
no secret, token, subscription URL, private key, SQLite row, or customer data readout
no public Admin exposure
no production authority transfer
```

## Preflight

Immediately before stopping, both target instances were running:

```text
i-0ad8676ee113d14cb:
  name: proxy-gateway-node-sg-green-20260524
  role: green-candidate
  public IP: 18.136.102.226
  security group: sg-06682c36aa03834f7
  state: running

i-0b7791340d3fedff5:
  name: proxy-gateway-prod-edge-a-20260524
  role: prod-edge-a-candidate
  public IP: 13.215.156.159
  security group: sg-0379ece0b3d305c43
  state: running
```

Authoritative AliDNS records before the stop:

```text
sub.globalcirclecat.com: A 13.215.156.159, TTL 600, ENABLE
ss-sg.globalcirclecat.com: A 13.215.156.159, TTL 600, ENABLE
```

Tracked subscription edge config still referenced:

```text
prod-edge-a -> ss-sg.globalcirclecat.com:18388
prod-edge-b -> 18.136.102.226:18388
ping hosts -> sub.globalcirclecat.com, ss-sg.globalcirclecat.com, 18.136.102.226
```

This means the stop was expected to interrupt subscription distribution and
edge proxy traffic. The operator explicitly accepted this outage.

## Stop Execution

Stop order:

```text
1. prod-edge-b / i-0ad8676ee113d14cb
2. prod-edge-a / i-0b7791340d3fedff5
```

AWS accepted both stop requests:

```text
i-0ad8676ee113d14cb: running -> stopping
i-0b7791340d3fedff5: running -> stopping
```

`aws ec2 wait instance-stopped` completed successfully.

Final AWS state:

```text
i-0ad8676ee113d14cb:
  state: stopped
  public IP: none
  security group retained: sg-06682c36aa03834f7

i-0b7791340d3fedff5:
  state: stopped
  public IP: none
  security group retained: sg-0379ece0b3d305c43
```

Elastic IP check:

```text
describe-addresses for both instance ids: []
network-interface public IP associations: null
allocation ids: null
```

Important rollback caveat:

```text
The stopped instances did not retain Elastic IP associations. Starting the
instances later may assign new public IPv4 addresses, so rollback may require
DNS and config updates if the original addresses are not restored by AWS.
```

## Post-Stop Validation

AliDNS was not changed:

```text
sub.globalcirclecat.com: A 13.215.156.159, TTL 600, ENABLE
ss-sg.globalcirclecat.com: A 13.215.156.159, TTL 600, ENABLE
```

Expected production outage from the operator environment:

```text
https://sub.globalcirclecat.com/api/health via 13.215.156.159: timeout
```

Expected HP vantage port results:

```text
13.215.156.159:22/80/443/18388/3456/18080: timeout
18.136.102.226:22/80/443/18388/3456/18080: timeout
```

Aliyun private candidate remained active:

```text
proxy-gateway-candidate.service: active
nginx: active
ufw: active
http://127.0.0.1:3456/api/health: ok, authRequired true
http://127.0.0.1:18080/api/health: ok, authRequired true
```

Aliyun listener posture remained private:

```text
127.0.0.1:3456: candidate app
127.0.0.1:18080: candidate Nginx
0.0.0.0:22 and [::]:22: SSH
0.0.0.0:51820 and [::]:51820: existing wg-home lab path
no public 80 listener
no public 443 listener
no public 18388 listener
no public 3456 listener
no public 18080 listener
```

## Decision

The requested stop-only cleanup has completed:

```text
prod-edge-a: stopped
prod-edge-b: stopped
termination: not performed
security groups: retained
DNS: unchanged
Aliyun: unchanged
service outage: accepted and observed
```

Current production-style DNS and repository config still point at stopped or
released addresses. This is intentional under the accepted outage decision, but
it means the next production work should not be described as a no-downtime
promotion.

## Next Gate

The next practical gate is clean node rebuild and/or Aliyun subscription
distribution promotion planning.

Suggested gate for new edge capacity:

```text
Approve clean edge node rebuild planning. Read-only/design first. No DNS change, no user traffic, no production authority transfer, no security-group deletion.
```

Suggested rollback gate if the operator wants to bring the stopped AWS nodes
back temporarily:

```text
Approve Singapore prod-edge-a and prod-edge-b rollback start. Start only, no DNS change unless new public IPs require a separate approval, no termination, no security-group deletion.
```

## Rollback

The approved rollback concept is starting the stopped instances. Because no
Elastic IPs were attached after stop, a practical rollback may need an
additional DNS/config decision if AWS assigns different public IP addresses on
start.
