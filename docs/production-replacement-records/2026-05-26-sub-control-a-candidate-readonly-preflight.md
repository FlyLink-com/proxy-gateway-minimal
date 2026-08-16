# sub-control-a Candidate Read-Only Preflight


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: sub_control_a_candidate_readonly_preflight
  superseded_by: null
  last_verified_at: 2026-05-26
  production_authority: false
```


Date: 2026-05-26, Asia/Shanghai.

## Scope

This record is the first A2 read-only inventory pass for the clean
`sub-control-a` candidate path in
`docs/SUBSCRIPTION_CONTROL_PLANE_NEW_SERVER_RUNBOOK.md`.

No production, AWS, DNS, Nginx, HTTPS, systemd, security-group, SQLite, tenant,
artifact, secret, server-creation, or traffic mutation was performed.

## Risk / Authority

```text
Risk: A
Execution type: read-only inventory and documentation record
Production impact: none
Candidate provisioning: not approved
Cutover: not approved
DNS change: not approved
State copy / restore: not approved
```

This record does not authorize provisioning the new server. The exact approval
phrase from `docs/SUBSCRIPTION_CONTROL_PLANE_NEW_SERVER_RUNBOOK.md` is still
required before any clean `sub-control-a` candidate creation.

## Repository Baseline

```text
branch: codex/a2-sub-control-a-candidate-preflight
source baseline: master
baseline commit: 1af87cfc3cbdad0cb0fa3c88ec99541eca7686dd
latest commit summary: Merge pull request #125 from gaoyi1020-web/codex/docs-control-plane-new-server-runbook
open PRs before this record: none
project-state check: passed
```

PR #125 established the clean new-server runbook. Its manual CI evidence was:

```text
commit: 02668463591c77d04f83310bb5f14a68ec9f1b30
environment: Aliyun manual CI validation host
Node: v22.22.2
npm: 10.9.7
npm ci: passed
npm ci --prefix admin: passed
npm test: 180/180 passed
npm run admin:test: 25/25 passed
npm run admin:build: passed
cleanup: workspace and archive removed
```

The current merge commit has not yet been rerun through manual CI in this
record. No candidate provisioning should rely on this record as final
repository validation.

## Read-Only AWS Inventory

Read-only AWS identity check succeeded for the configured AWS account. The
commands used no production mutation.

Region:

```text
ap-southeast-1
```

Instances:

```text
prod-edge-a documented production target:
  instance id: i-0b7791340d3fedff5
  state: running
  public IP: 13.215.156.159
  private IP: 172.31.27.240
  type: t4g.small
  AZ: ap-southeast-1b
  VPC: vpc-01be6089f9892a651
  subnet: subnet-0bd6d390d9e318744
  security group: sg-0379ece0b3d305c43
  Name tag: proxy-gateway-prod-edge-a-20260524
  Role tag: prod-edge-a-candidate
  NoCutover tag: true

prod-edge-b carrying instance:
  instance id: i-0ad8676ee113d14cb
  state: running
  public IP: 18.136.102.226
  private IP: 172.31.18.176
  type: t4g.small
  AZ: ap-southeast-1b
  VPC: vpc-01be6089f9892a651
  subnet: subnet-0bd6d390d9e318744
  security group: sg-06682c36aa03834f7
  Name tag: proxy-gateway-node-sg-green-20260524
  Role tag: green-candidate
  NoCutover tag: true
```

Instance status:

```text
i-0b7791340d3fedff5: running / system ok / instance ok / no scheduled events
i-0ad8676ee113d14cb: running / system ok / instance ok / no scheduled events
```

AMI baseline for the historical candidate image:

```text
ami-08bf93219e21cea7a:
  name: ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-arm64-server-20260515
  architecture: arm64
  root device: ebs
  virtualization: hvm
```

Operational metadata note:

```text
prod-edge-a is now documented as the production MVP target, but its AWS tags
still say Role=prod-edge-a-candidate and NoCutover=true. Do not rely on those
tags alone for production role decisions until a separate metadata cleanup is
approved.
```

## Security Group Inventory

Both observed edge security groups expose the current production/edge surface:

```text
22/tcp:
  allowed from one operator CIDR only

80/tcp:
  allowed from 0.0.0.0/0

443/tcp:
  allowed from 0.0.0.0/0

18388/tcp:
  allowed from 0.0.0.0/0

18388/udp:
  allowed from 0.0.0.0/0

egress:
  all protocols to 0.0.0.0/0
```

No security group mutation was performed.

## DNS Inventory

Authoritative AliDNS records:

```text
sub.globalcirclecat.com:
  type: A
  value: 13.215.156.159
  TTL: 600
  status: ENABLE

ss-sg.globalcirclecat.com:
  type: A
  value: 13.215.156.159
  TTL: 600
  status: ENABLE
```

Local resolver caveat:

```text
Resolve-DnsName from the current Windows environment returned 198.18.0.16 and
198.18.0.17 with TTL 1 for the two names, even when a public resolver was
specified. Treat this as local proxy/fake-IP resolver behavior, not
authoritative production DNS.
```

For endpoint validation in this record, `curl --resolve` was used to bind the
hostname to the authoritative production IP.

## Public Boundary And Edge Reachability

Public HTTPS validation against `sub.globalcirclecat.com` with
`--resolve sub.globalcirclecat.com:443:13.215.156.159`:

```text
/api/health: 200
/api/admin/subscriptions without token: 404
/sub/clash.yaml without token: 401
TLS verification result: 0
remote IP: 13.215.156.159
```

Public HTTP validation:

```text
http://sub.globalcirclecat.com/api/health via --resolve to 13.215.156.159: 200
http://13.215.156.159/api/health: 200
http://18.136.102.226/api/health: 200
http://18.136.102.226/api/admin/subscriptions without token: 404
```

TCP reachability:

```text
13.215.156.159:22 -> reachable
18.136.102.226:22 -> reachable
13.215.156.159:18388 -> reachable
18.136.102.226:18388 -> reachable
```

Domain-based `Test-NetConnection ss-sg.globalcirclecat.com:18388` reached a
local fake-IP address. Use the direct IP or authoritative DNS record for
production reachability assertions from this environment.

## Host-Internal Inventory Status

Host-internal inventory was attempted with the approved local key file:

```text
~/.ssh/proxy-gateway-aws-sg-20260521.pem exists locally
```

The SSH TCP connection to both edge nodes was established, then closed by the
remote side during SSH key exchange:

```text
13.215.156.159: kex_exchange_identification: Connection closed by remote host
18.136.102.226: connection closed during SSH attempt
```

The observed operator egress did not match the recorded SSH allowlist CIDR in
the edge security groups. Because this is a read-only preflight, no security
group change was made.

The following required internal checks were therefore not completed:

```text
production service active/enabled state from systemd
runtime `.env` path check without printing values
active SUBSCRIPTION_DB_PATH verification
SQLite integrity check on the active production database
tenant/artifact aggregate counts
latest backup path / timestamp / size
Nginx config test on host
local loopback /api/health from host
local Admin auth boundary from host
journal sensitive-pattern count
```

This is a hard stop before candidate provisioning.

## Preflight Decision

Current external inventory is broadly healthy:

```text
AWS instances: running and status checks ok
AliDNS: both production records point to 13.215.156.159
public gateway: health 200, public Admin blocked, no-token subscription 401
edge ports: prod-edge-a and prod-edge-b 18388/tcp reachable
```

But A2 Phase 1 is incomplete because host-internal production inventory could
not be collected.

Decision:

```text
Do not request or execute clean sub-control-a candidate provisioning yet.
First restore or approve a host-internal read-only inspection path.
```

## Required Next Action

Choose one approved path before continuing:

```text
Option 1:
  Run the host-internal read-only inventory from an operator network already
  allowed by the current SSH security-group rule.

Option 2:
  Approve a temporary SSH ingress update for the current operator egress,
  run the host-internal read-only inventory, then restore the original
  security-group rule and record both actions.

Option 3:
  Approve an equivalent read-only internal inspection method, such as an
  explicitly scoped AWS Systems Manager command, if the instances support it.
```

No clean `sub-control-a` candidate should be provisioned until one of those
paths completes and the execution record is updated.

## Rollback

No rollback was required because no external state was changed.
