# Non-Aliyun Node Cleanup Preflight


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: non_aliyun_node_cleanup_preflight
  superseded_by: null
  last_verified_at: 2026-05-26
  production_authority: false
```


Date: 2026-05-26, Asia/Shanghai.

Branch: `codex/aliyun-platform-split-runbook`

PR: `#131`

Risk: A-adjacent read-only inventory for later node drain / cleanup.

Operator request:

```text
Start node cleanup first.
```

## Boundary

This record is a cleanup preflight only.

Performed:

```text
read-only AWS instance inventory
read-only AliDNS record inventory
read-only public endpoint checks without subscription tokens
read-only repository / documentation reference scan
```

Not performed:

```text
no EC2 stop
no EC2 termination
no security-group mutation
no DNS mutation
no Nginx, systemd, firewall, or runtime mutation
no tenant, SQLite, artifact, token, or subscription URL mutation
no production deploy
no MeshCentral resource mutation
```

## Live AWS Inventory

Command:

```powershell
aws ec2 describe-instances `
  --region ap-southeast-1 `
  --filters Name=instance-state-name,Values=running,stopped `
  --query "Reservations[].Instances[].{InstanceId:InstanceId,State:State.Name,PublicIp:PublicIpAddress,PrivateIp:PrivateIpAddress,Type:InstanceType,Name:Tags[?Key=='Name']|[0].Value,Role:Tags[?Key=='Role']|[0].Value,Project:Tags[?Key=='Project']|[0].Value,NoCutover:Tags[?Key=='NoCutover']|[0].Value,SecurityGroups:SecurityGroups[*].GroupId}" `
  --output json
```

Observed:

| Instance | State | Public IP | Private IP | Type | Name | Role / project | Security group | Cleanup classification |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `i-0b7791340d3fedff5` | running | `13.215.156.159` | `172.31.27.240` | `t4g.small` | `proxy-gateway-prod-edge-a-20260524` | `Role=prod-edge-a-candidate`, `Project=proxy-gateway-minimal`, `NoCutover=true` | `sg-0379ece0b3d305c43` | Current production dependency. Do not stop before Aliyun promotion, DNS migration, and rollback acceptance. |
| `i-0ad8676ee113d14cb` | running | `18.136.102.226` | `172.31.18.176` | `t4g.small` | `proxy-gateway-node-sg-green-20260524` | `Role=green-candidate`, `Project=proxy-gateway-minimal`, `NoCutover=true` | `sg-06682c36aa03834f7` | Current `prod-edge-b` carrying instance / temporary secondary slot. Do not stop while subscription output may still emit it. |
| `i-004ab1c6c71d06bca` | stopped | none | `172.31.26.232` | `t4g.small` | `proxy-gateway-node-sg-blue-20260521` | untagged project role | `sg-04a165ec77f430ee8` | Already stopped. Candidate for later final termination only after separate approval and dependency inventory. |
| `i-0589aac321172dd74` | stopped | none | `172.31.24.0` | `t4g.small` | `proxy-gateway-aws-sg` | `Project=proxy-gateway-minimal` | `sg-0748fd9a7f936e28d` | Already stopped. Candidate for later final termination only after separate approval and dependency inventory. |
| `i-0609ff48af3946c1c` | stopped | `52.76.105.23` | `172.31.39.78` | `t3a.2xlarge` | `meshcentral-singapore-8vcpu-20260512` | `Project=MeshCentral` | `sg-04e4adda17e41d12b` | Out of this project. No mutation without separate MeshCentral owner confirmation. |

## Live DNS Inventory

AliDNS authoritative records:

| RR | Type | Value | TTL | Status | Cleanup impact |
| --- | --- | --- | --- | --- | --- |
| `sub.globalcirclecat.com` | A | `13.215.156.159` | 600 | ENABLE | Blocks stopping `prod-edge-a`. |
| `ss-sg.globalcirclecat.com` | A | `13.215.156.159` | 600 | ENABLE | Blocks stopping `prod-edge-a`. |

Local `Resolve-DnsName` returned `198.18.0.87` and `198.18.0.88` with TTL 1
for these names, which appears to be local proxy / virtual DNS behavior. This
record treats AliDNS as the authoritative DNS source for cleanup decisions.

## Public Boundary Checks

Tokenless checks only; no subscription URL, token, tenant data, or private
credential was read or printed.

`prod-edge-a` forced to the authoritative IP:

```text
https://sub.globalcirclecat.com/api/health via --resolve 13.215.156.159 -> 200
https://sub.globalcirclecat.com/sub/clash.yaml without token via --resolve 13.215.156.159 -> 401
13.215.156.159:18388 -> reachable
13.215.156.159:443 -> reachable
```

`prod-edge-b` carrying instance:

```text
http://18.136.102.226/api/health -> 200
http://18.136.102.226/sub/clash.yaml without token -> 401
18.136.102.226:18388 -> reachable
18.136.102.226:80 -> reachable
18.136.102.226:22 -> reachable
```

## Repository Reference Scan

Read-only scan over tracked config / docs / server / project-state paths found
the current static config still references:

```text
config/proxy-servers.json:
  prod-edge-a -> ss-sg.globalcirclecat.com
  prod-edge-b -> 18.136.102.226
  pingHosts -> sub.globalcirclecat.com, ss-sg.globalcirclecat.com, 18.136.102.226
```

Current docs and project state also still describe production Subscription V2
as emitting `prod-edge-a` plus temporary `prod-edge-b`.

## Cleanup Decision

No node was cleaned up in this step because both running project nodes still
have live dependency signals:

```text
prod-edge-a:
  blocked by authoritative DNS and active public health boundary

prod-edge-b:
  blocked by documented Subscription V2 secondary-slot dependency and live
  edge reachability

legacy stopped nodes:
  no stop needed; final termination/security-group cleanup is a later gate

MeshCentral stopped node:
  outside this project cleanup unless separate ownership is confirmed
```

## Required Next Gates

Recommended sequence:

```text
1. Aliyun subscription platform cleanup / hardening / candidate bootstrap.
2. Aliyun private validation and production promotion approval.
3. Subscription output inventory proving AWS nodes are no longer emitted, or an
   explicit operator acceptance of the remaining client cache window.
4. DNS inventory proving subscription and node-host names no longer point to
   AWS nodes.
5. Separate AWS node drain-and-stop approval.
6. Observation window.
7. Separate AWS termination and security-group cleanup approval.
```

First executable mutation gate for node cleanup:

```text
Approve AWS node drain and stop after Aliyun promotion. No termination, no security-group deletion, rollback window preserved.
```

Earlier read-only gate, if refreshed again:

```text
Approve AWS node drain preflight. Read-only only. No stop, no terminate, no DNS change, no security-group change.
```

Termination gate must remain separate:

```text
Approve AWS node termination and security-group cleanup after observation window. No rollback dependency remains.
```

## Current Result

Node cleanup is sequenced, but not executed.

The safe current conclusion is:

```text
Do not stop prod-edge-a yet.
Do not stop prod-edge-b yet.
Do not terminate stopped legacy nodes yet.
Do not mutate the MeshCentral-tagged node from this project.
Proceed with Aliyun platform promotion work before AWS node shutdown.
```
