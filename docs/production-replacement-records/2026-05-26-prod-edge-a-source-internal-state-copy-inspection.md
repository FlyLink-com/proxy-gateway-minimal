# Prod-Edge-A Source Internal State-Copy Inspection

Date: 2026-05-26, Asia/Shanghai.

Risk: A-adjacent read-only source inspection.

Branch: `codex/prod-edge-a-source-inspection`

Operator request:

```text
Merge the small workspace-sync step into the next planning task and start
executing together.
```

## Boundary

This record attempts the source-side internal checks required before Aliyun
private state-copy validation. It is read-only and does not authorize state
copy, service changes, DNS changes, or traffic movement.

Performed:

```text
local worktree sync to current master in the clean Aliyun inventory worktree
read-only EC2 instance health check
read-only SSM managed-instance check
read-only SSH banner and SSH command attempts
read-only ssh-keyscan attempt
read-only EC2 instance / ENI / security-group inventory
read-only production public endpoint checks
read-only HP vantage public port checks
read-only EC2 console-output metadata check without printing console contents
```

Not performed:

```text
no DNS change
no user traffic change
no service restart
no instance stop, start, reboot, or termination
no security-group or network ACL mutation
no SQLite copy
no artifact state copy
no production .env readout or copy
no secret, token, subscription URL, private key, SQLite row, or customer data readout
no public Admin exposure
no production authority transfer
```

## Local Workspace Step

The local cleanup/sync step was merged into this task instead of split into a
separate PR.

Observed:

```text
main checkout: codex/channel-benchmark-summary-cli with gone upstream
execution worktree: C:\Users\g\Projects\订阅管理\proxy-gateway-minimal-aliyun-inventory
execution worktree before sync: master behind origin/master by 2
execution worktree after sync: master...origin/master at 2602ece
```

No production or cloud mutation was involved in the workspace step.

## EC2 And SSM Checks

EC2 instance status:

```text
instance id: i-0b7791340d3fedff5
state: running
system status: ok
instance status: ok
availability zone: ap-southeast-1b
```

SSM managed-instance inventory:

```text
describe-instance-information result: []
```

The instance is not currently available as an SSM managed instance from this
operator environment, so SSM is not an available internal inspection path.

Instance identity:

```text
public IP: 13.215.156.159
private IP: 172.31.27.240
VPC: vpc-01be6089f9892a651
subnet: subnet-0bd6d390d9e318744
security group: sg-0379ece0b3d305c43
name: proxy-gateway-prod-edge-a-20260524
role tag: prod-edge-a-candidate
NoCutover tag: true
```

ENI:

```text
network interface: eni-0f9249945db98079b
status: in-use
private IP: 172.31.27.240
public IP association: 13.215.156.159
source/destination check: true
```

Security-group ingress:

```text
22/tcp: 36.163.181.255/32
80/tcp: 0.0.0.0/0
443/tcp: 0.0.0.0/0
18388/tcp: 0.0.0.0/0
18388/udp: 0.0.0.0/0
egress: all protocols to 0.0.0.0/0
```

## SSH Internal Inspection Attempt

TCP-level SSH banner probe from the operator environment:

```text
connect: ok, about 1 ms
banner: timeout
```

Direct SSH command attempt:

```text
target: ubuntu@13.215.156.159
result: failed
error class: connection closed by 13.215.156.159 port 22
```

`ssh-keyscan`:

```text
result: failed
error class: connection closed by remote host
```

Interpretation:

```text
The network path reaches TCP/22, but SSH does not complete the pre-auth banner
exchange. This is not the normal "wrong key" phase. It blocks internal source
inspection because no command can be executed on prod-edge-a.
```

Because SSH internal inspection is blocked, this record could not verify:

```text
source proxy-gateway systemd state from inside prod-edge-a
source Nginx state from inside prod-edge-a
source runtime .env path without printing values
source SQLite path from active runtime config
source SQLite integrity_check
fresh source backup creation
source artifact state paths
source journal redaction posture
```

## Public Production Checks

Tokenless production endpoint checks remained healthy:

```text
https://sub.globalcirclecat.com/api/health via 13.215.156.159: ok, authRequired true
https://sub.globalcirclecat.com/sub/clash.yaml without token via 13.215.156.159: 401
```

HP vantage public port checks:

```text
13.215.156.159:22: open
13.215.156.159:80: open
13.215.156.159:443: open
13.215.156.159:18388: open
18.136.102.226:22: open
18.136.102.226:80: open
18.136.102.226:443: connection refused
18.136.102.226:18388: open
```

EC2 console-output metadata:

```text
latest console output exists
timestamp: 2026-05-26T07:26:01Z
output length: 65535
```

The console output content was intentionally not printed into this record.

## Decision

Source internal inspection result:

```text
prod-edge-a EC2 health: ok
production public endpoint: healthy
production SSH TCP/22 path: reachable
SSM internal path: unavailable
SSH command execution: blocked before banner/auth
source SQLite integrity: not verified
fresh source backup: not created or verified
state-copy readiness: still blocked
```

Aliyun private state-copy validation must not proceed yet. The source authority
host is healthy from public/service signals, but its internal state cannot be
inspected through the currently available operator paths.

## Next Gate

The next gate is an operator choice between restoring source internal access or
providing another approved private backup path.

Recommended gate:

```text
Approve prod-edge-a source access remediation planning. Read-only planning only. No reboot, no stop, no service restart, no security-group change, no DNS change, no SQLite copy.
```

Potential later remediation gates must be separate if they include any mutation,
such as SSH service restart, instance reboot, rescue-volume workflow, SSM
bootstrap, security-group change, or source backup transfer.

The Aliyun private state-copy validation gate remains blocked until source
SQLite integrity and fresh source backup can be verified without exposing
sensitive data.

## Rollback

No rollback was required because this step made no production, cloud, runtime,
DNS, firewall, service, state, tenant, artifact, or traffic mutation.
