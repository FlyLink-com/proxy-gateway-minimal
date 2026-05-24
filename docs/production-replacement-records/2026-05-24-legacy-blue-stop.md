# Legacy Blue Stop Record

Date: 2026-05-24 Asia/Shanghai

## Scope

Risk: A / legacy production-node retirement step

This record documents the approved stop of the legacy blue EC2 instance after
`prod-edge-a` became the production MVP target.

Approved action:

```text
Stop legacy blue i-004ab1c6c71d06bca only.
Do not terminate.
Do not delete security group.
Do not touch prod-edge-a or prod-edge-b.
```

## Target

```text
Legacy blue instance: i-004ab1c6c71d06bca
Legacy blue previous public IP: 47.129.247.102
Legacy blue security group: sg-04a165ec77f430ee8
Legacy blue AWS tag name: proxy-gateway-node-sg-blue-20260521
Region: ap-southeast-1
```

## Preconditions Checked

Repository state:

```text
Branch: master
Remote: origin/master
Working tree: clean
Latest docs/config cleanup: PR #82 merged
```

AWS read-only check before stop:

```text
Instance state: running
Public IP: 47.129.247.102
Security group: sg-04a165ec77f430ee8
EIP check: InvalidAddress.NotFound for 47.129.247.102
```

DNS and production boundary checks before stop:

```text
AliDNS authoritative sub.globalcirclecat.com A: 13.215.156.159
AliDNS authoritative ss-sg.globalcirclecat.com A: 13.215.156.159
sub.globalcirclecat.com /api/health: 200
sub.globalcirclecat.com /sub/clash.yaml without token: 401
```

During pre-stop validation, the local Windows resolver still had a cached
`ss-sg.globalcirclecat.com -> 47.129.247.102` answer. The stop was paused until
local DNS cache was cleared and the default resolver returned:

```text
ss-sg.globalcirclecat.com -> 13.215.156.159
```

The final pre-stop `ss-sg.globalcirclecat.com:18388` check resolved to
`13.215.156.159` and established a TCP connection. The telnet-style check then
timed out because it does not speak the Shadowsocks protocol; the TCP connect
was the intended boundary check.

## Mutation Performed

```bash
aws ec2 stop-instances \
  --region ap-southeast-1 \
  --instance-ids i-004ab1c6c71d06bca

aws ec2 wait instance-stopped \
  --region ap-southeast-1 \
  --instance-ids i-004ab1c6c71d06bca
```

## Result

AWS post-stop state:

```text
Instance state: stopped
Public IP: null
Security group retained: sg-04a165ec77f430ee8
Instance not terminated
```

Post-stop production boundary checks:

```text
sub.globalcirclecat.com resolves to: 13.215.156.159
sub.globalcirclecat.com /api/health: 200
sub.globalcirclecat.com /sub/clash.yaml without token: 401
ss-sg.globalcirclecat.com resolves to: 13.215.156.159
ss-sg.globalcirclecat.com:18388 TCP connect: established
```

## Not Performed

```text
No EC2 termination
No security group deletion
No DNS mutation
No AWS mutation outside stopping the legacy blue instance
No prod-edge-a mutation
No prod-edge-b / green mutation
No Nginx mutation
No HTTPS issuance
No production .env change
No production node-config change
No tenant migration
No token rotation
No secret, token, subscription URL, SQLite data, AWS credential, or customer data copied or recorded
```

## Follow-Up

Legacy blue is now stopped but still exists. Any later termination, security
group cleanup, key cleanup, AMI/snapshot handling, or final retirement record
requires a separate explicit Risk A approval.

`prod-edge-b` remains the temporary second node in Subscription V2 output and
still needs a separate lifecycle decision.
