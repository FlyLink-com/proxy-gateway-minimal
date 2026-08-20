# Production Replacement Runbook

Last updated: 2026-06-01, Asia/Shanghai.

```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: production_replacement_runbook
  superseded_by: null
  last_verified_at: 2026-06-01
  production_authority: false
```


> Status:
> - Type: Historical AWS runbook (superseded)
> - Risk: A for any future provider action
> - Execution authority: None
> - Production impact: None
> - Source of truth for: Historical AWS blue-green replacement evidence only
>
> **Historical AWS evidence only.** This document preserves historical AWS
> identifiers, commands, and dates. It must not be used as current
> production-target authority or as current provider instructions.
>
> Select the current runtime target through `docs/RUNTIME_LANE_AUTHORITY.md`.
> Before any provider action, complete fresh live read-only inventory and obtain
> approval for a new exact Risk A gate.

Last updated: 2026-06-01, Asia/Shanghai.

This runbook defines the blue-green production replacement model for the
current single-node AWS production service. It is a planning and execution gate
document only. It does not authorize AWS mutation, production secret copying,
instance creation, traffic cutover, or production deployment by itself.

## Scope

Current production blue:

```text
Node name: aws-singapore-blue
Instance ID: i-004ab1c6c71d06bca
Public IP: 47.129.247.102
Security group: sg-04a165ec77f430ee8
Runtime path: /opt/proxy-gateway-minimal
```

The replacement candidate should be treated as a production replacement
candidate, not staging. It is only allowed to receive production secrets,
SQLite data, or production node config after explicit Risk A approval and a
recorded secret/data handling plan.

## Relationship To Other Docs

- `docs/PRODUCTION_DR.md`: incident recovery and disaster recovery response.
- `docs/DEPLOYMENT_FLOW.md`: normal candidate, staging, production, and
  rollback flow.
- `docs/STAGING_PROVISIONING.md`: clean staging provisioning. Staging is not a
  production replacement target.
- `docs/ENVIRONMENT_TOPOLOGY.md`: current local/GitHub/AWS topology.

## Replacement Goal

Use this process when the goal is:

```text
Keep current production blue serving users.
Create a clean green production replacement candidate.
Deploy and validate green independently.
Make a cutover decision only after validation, backup, IP/DNS plan, and rollback are clear.
```

This is not active-active. This is not automatic failover. This is not a
generic staging test.

## Hard Stop Rules

Until an explicit cutover is approved, blue remains untouched:

- Do not stop, terminate, reboot, or resize the blue instance.
- Do not detach or replace the blue security group.
- Do not mutate blue Nginx, systemd units, `ss-server`, `.env`, SQLite, or
  node config.
- Do not restart blue services unless responding to an incident under
  `docs/PRODUCTION_DR.md`.
- Do not assume `47.129.247.102` can be retained. It is not currently
  documented as an Elastic IP allocation.
- Do not expose the Admin UI or Admin API publicly.
- Do not open `3456`, `18180`, or `1080` to the public internet.
- Do not use manual CI validation hosts as green candidates.
- Do not use the historical stopped node `i-0589aac321172dd74` as green without
  explicit reassignment, rebuild, retagging, and validation.

Do not paste raw process command lines, `systemctl status`, `ss -lntup`,
journal output, tokens, passwords, subscription URLs, customer data, or
environment-derived secrets into PRs, docs, chat, or replacement records.
Record only redacted states, timestamps, error summaries, and validation
outcomes.

## Required Classification

Every real replacement action is Risk A.

```text
Risk: A
Process: strict gate
Expected PR count: depends on implementation and cutover scope
Validation: runbook-defined, not a single command
Production/AWS impact: yes
```

The runbook itself may be edited as docs-only work, but executing it is
production work.

## Not Performed Boundary

Unless a later replacement execution record has exact A-tier approval and
records matching validation evidence, this runbook has not performed:

```text
green candidate creation
AWS instance, security-group, IP, DNS, Nginx, systemd, or service mutation
production .env, token, SQLite, subscription URL, customer-data, or node-config copy
production deployment
traffic migration, promotion, or cutover
blue stop, reboot, resize, termination, or rollback-start
```

## Preflight Check

Every replacement action must complete fresh read-only blue inventory and
candidate/cutover planning evidence before any AWS, host, DNS, service,
production-secret, SQLite, node-config, deployment, or traffic mutation. The
preflight record is required to state:

```text
Risk: A / read-only
Mutation: none
Blue instance, public IP/EIP posture, and security group: verified
Current public endpoint, service, database, and backup posture: verified
Green candidate plan, secret/data handling plan, and rollback plan: recorded
Secrets/customer data: not printed or copied into Git
Selected approval gate and owner: named
```

If any preflight fact is stale, missing, or inconsistent with the selected
approval gate, stop before creating or mutating replacement resources.

## Pre-Execution Gates

Before creating or mutating any AWS resource, record these decisions:

- Exact source commit or release artifact to deploy to green.
- Whether green is same-region `ap-southeast-1` or a different region.
- Instance type, AMI, architecture, disk size, and tags.
- Security group policy for SSH, HTTP, HTTPS, and Shadowsocks.
- Production `.env` handling plan.
- Production `CONSOLE_TOKEN`, `SS_PASSWORD`, and subscription secret handling
  plan.
- SQLite backup source and restore plan.
- `config/proxy-servers.json` restore or replacement plan.
- IP retention or DNS/client cutover plan.
- Rollback plan.
- Operator approval phrase.

Recommended approval phrase:

```text
Create a green production replacement candidate for aws-singapore-blue.
```

This phrase authorizes only the green candidate creation work described in the
approved runbook. It does not authorize cutover.

## Read-Only Blue Inventory

Clear local proxy variables if local proxy configuration interferes with AWS
CLI:

```powershell
Remove-Item Env:HTTP_PROXY,Env:HTTPS_PROXY,Env:ALL_PROXY,Env:http_proxy,Env:https_proxy,Env:all_proxy -ErrorAction SilentlyContinue
```

Verify blue by instance ID:

```powershell
aws ec2 describe-instances `
  --region ap-southeast-1 `
  --instance-ids i-004ab1c6c71d06bca `
  --query "Reservations[].Instances[].{InstanceId:InstanceId,State:State.Name,PublicIp:PublicIpAddress,PrivateIp:PrivateIpAddress,Type:InstanceType,Name:Tags[?Key=='Name']|[0].Value,Purpose:Tags[?Key=='Purpose']|[0].Value,SecurityGroups:SecurityGroups[*].GroupId}" `
  --output table
```

Verify blue by public IP:

```powershell
aws ec2 describe-instances `
  --region ap-southeast-1 `
  --filters Name=ip-address,Values=47.129.247.102 `
  --query "Reservations[].Instances[].{InstanceId:InstanceId,State:State.Name,PublicIp:PublicIpAddress,PrivateIp:PrivateIpAddress,SecurityGroups:SecurityGroups[*].GroupId}" `
  --output table
```

Check whether `47.129.247.102` is an Elastic IP:

```powershell
aws ec2 describe-addresses `
  --region ap-southeast-1 `
  --public-ips 47.129.247.102 `
  --output table
```

If this command returns no allocation or `InvalidAddress.NotFound`, the IP is
not confirmed as retained and must not be assumed movable.

Verify blue security group:

```powershell
aws ec2 describe-security-groups `
  --region ap-southeast-1 `
  --group-ids sg-04a165ec77f430ee8 `
  --query "SecurityGroups[].{GroupId:GroupId,GroupName:GroupName,VpcId:VpcId,Description:Description,IpPermissions:IpPermissions}" `
  --output table
```

## Blue Backup Gate

Before green receives production data or before cutover is considered, create
and verify a fresh blue SQLite backup.

On blue:

```bash
cd /opt/proxy-gateway-minimal
SUBSCRIPTION_DB_PATH=/opt/proxy-gateway-minimal/data/subscriptions.sqlite \
  scripts/backup-subscriptions.sh
sqlite3 /opt/proxy-gateway-minimal/data/subscriptions.sqlite "pragma integrity_check;"
```

Record:

- Backup path.
- Backup file mode and size.
- `pragma integrity_check` result.
- Service states from redacted `systemctl is-active` and `systemctl show`
  output.
- Current public endpoint behavior.

Do not print or copy `.env`, token values, `SS_PASSWORD`, generated
subscription URLs, or customer data into the record.

## Green Candidate Requirements

Green must be a clean replacement candidate with explicit identity:

```text
Environment: production-replacement
Role: green-candidate
Project: proxy-gateway-minimal
Name: proxy-gateway-node-sg-green-<date-or-ticket>
```

Green must have:

- Explicit instance ID.
- Explicit public IP or DNS name.
- Explicit security group.
- Explicit runtime path.
- Exact commit SHA or release artifact.
- Documented source of `.env`, SQLite backup, and node config.
- Nginx, Console/API, `ss-server`, systemd, and SQLite restored through the
  approved production boundary.

Green must not:

- Serve production traffic before cutover approval.
- Reuse staging secrets or staging SQLite data.
- Expose Admin UI publicly.
- Open loopback-only ports publicly.
- Be confused with staging or manual CI validation hosts.

## Green Deployment And Validation

Green validation must be performed before any cutover decision.

On green:

```bash
systemctl is-active proxy-gateway-console.service proxy-gateway-ss.service nginx

systemctl show proxy-gateway-console.service proxy-gateway-ss.service nginx \
  --property=ActiveState,SubState,Result,ExecMainStatus,NRestarts \
  --no-pager

nginx -t
ss -lntup
curl -i http://127.0.0.1:3456/api/health
curl -i http://127.0.0.1:3456/api/admin/subscriptions
sqlite3 /opt/proxy-gateway-minimal/data/subscriptions.sqlite "pragma integrity_check;"
```

Expected green local behavior:

```text
proxy-gateway-console.service -> active
proxy-gateway-ss.service -> active
nginx -> active
127.0.0.1:3456/api/health -> 200
127.0.0.1:3456/api/admin/subscriptions without token -> 401
SQLite integrity_check -> ok
```

From an external network, using green public IP or green DNS:

```powershell
curl.exe -i http://<green-public-ip-or-dns>/api/health
curl.exe -i http://<green-public-ip-or-dns>/api/admin/subscriptions
curl.exe -i http://<green-public-ip-or-dns>/sub/clash.yaml
```

Expected green public behavior:

```text
/api/health -> 200
/api/admin/subscriptions -> 404
/sub/clash.yaml without token -> 401
```

Additional required validation:

- Valid subscription token fetch succeeds without logging or pasting the token.
- Expired subscription token is rejected at token resolution time.
- Admin API works only through loopback or SSH tunnel.
- `ss-server` listens on the approved public Shadowsocks port.
- Clash/Mihomo can connect to green in an approved test without affecting blue.
- Nginx still blocks public Admin UI and public `/api/admin/*`.
- No raw `systemctl status`, process command line, `ss -lntup`, journal output,
  token, password, subscription URL, or customer data is copied into the
  record.

## Cutover Strategy Decision

Do not cut over until one strategy is explicitly chosen and validated.

### Option A: Elastic IP Reassociation

Use only if the current production IP is confirmed to be an Elastic IP or a new
Elastic IP plan is approved.

Required gates:

- Confirm allocation ID.
- Confirm blue/green network interface targets.
- Confirm reassociation commands and rollback commands.
- Confirm client impact and expected propagation behavior.

Current blocker: `47.129.247.102` is not currently documented as an Elastic IP
allocation.

### Option B: DNS Cutover

Use only if domain subscription and node host plans are explicitly resumed.

Required gates:

- DNS record name and TTL.
- HTTPS/Nginx plan if public HTTPS is required.
- `PUBLIC_SUBSCRIPTION_BASE_URL` plan.
- `config/proxy-servers.json` node host plan.
- Client compatibility and rollback plan.

Current blocker: domain HTTPS remains paused.

### Option C: Subscription And Node Config Update

Use when clients must move from old IP-based config to a new node address or
subscription base URL.

Required gates:

- Which generated YAML fields change.
- Whether existing clients need manual subscription refresh.
- How long blue remains available in parallel.
- How rollback restores old node config.
- Whether both blue and green are listed during a transition window.

This option has the highest client impact if clients are pinned to
`47.129.247.102`.

## Cutover Gate

Cutover requires all of these to be true:

- Blue is healthy enough to keep serving until cutover.
- Fresh SQLite backup exists and passes integrity check.
- Green local validation passed.
- Green public gateway validation passed.
- Valid subscription and Shadowsocks connectivity validation passed.
- Admin API remains private.
- IP/DNS/client cutover strategy is selected.
- Rollback command sequence is written down.
- Operator explicitly approves cutover.

Recommended cutover approval phrase:

```text
Cut over production traffic from blue to green.
```

This phrase is separate from green candidate creation approval.

## Rollback Gate

Before cutover, document:

- How to restore traffic to blue.
- Whether blue remains unchanged and running.
- Whether any client-visible URL, IP, DNS, or node config changed.
- Whether SQLite writes occurred on green after cutover.
- Whether data must be reconciled before rollback.
- Maximum acceptable rollback window.

Blue should stay running during the initial green cutover unless the approved
plan says otherwise.

## Post-Cutover Validation

After cutover, run:

```powershell
curl.exe -i http://<production-public-host>/api/health
curl.exe -i http://<production-public-host>/api/admin/subscriptions
curl.exe -i http://<production-public-host>/sub/clash.yaml
```

Expected public behavior:

```text
/api/health -> 200
/api/admin/subscriptions -> 404
/sub/clash.yaml without token -> 401
```

Also verify:

- Valid subscription fetch through the production public host.
- Shadowsocks client connectivity through the production node host.
- Admin SSH tunnel to green loopback Console/API.
- SQLite integrity on green.
- Nginx/systemd service states on green.
- Blue still available for rollback, if the plan requires it.

## Replacement Record Template

```text
Replacement title:
Date/time:
Operator:

Blue instance ID:
Blue public IP:
Blue health before work:
Blue backup path:
Blue SQLite integrity:

Green instance ID:
Green public IP or DNS:
Green security group:
Green AMI / instance type:
Green deployed commit:
Green runtime path:

Production secret handling approval:
SQLite restore source:
Node config source:

Green validation:
- systemd:
- nginx -t:
- local /api/health:
- local admin without token:
- public /api/health:
- public /api/admin/subscriptions:
- public /sub/clash.yaml without token:
- valid subscription fetch:
- ss-server/client check:
- SQLite integrity_check:

Cutover strategy:
Cutover approval:
Cutover commands:
Rollback commands:

Post-cutover validation:
Blue retained for rollback:
Cleanup completed:
Follow-ups:
```

## Non-Goals

This runbook does not implement or authorize:

- Automatic failover.
- Active-active production.
- Load balancers.
- Terraform, Kubernetes, Redis, queues, or cluster orchestration.
- Domain HTTPS rollout.
- Staging provisioning.
- Production mutation from a docs-only PR.
