# Production Disaster Recovery Runbook

Last updated: 2026-05-24, Asia/Shanghai.

This runbook documents how to reason about and recover the current production
service when the single AWS production node is degraded. It is a recovery
runbook only. It does not authorize AWS mutation, production deployment,
security group changes, secret copying, or instance replacement by itself.

## Scope

Use this document for production disaster recovery planning and incident
response involving the current AWS Singapore production node:

```text
Production node: aws-singapore-blue
Instance ID: i-004ab1c6c71d06bca
Public IP: 47.129.247.102
Security group: sg-04a165ec77f430ee8
Runtime path: /opt/proxy-gateway-minimal
```

All production-changing actions remain Risk A work. They require an explicit
operator approval, read-only inventory, a recovery plan, validation evidence,
and a rollback or exit plan before mutation.

## Current Single Points Of Failure

The current production service is a single-node deployment. One EC2 instance
currently carries these responsibilities:

- Public Nginx gateway for `/api/health` and `/sub/clash.yaml`.
- Loopback Console/API service on `127.0.0.1:3456`.
- Public Shadowsocks server on `0.0.0.0:18388`.
- SQLite subscription database.
- Production `.env`, node config, Nginx config, and systemd service runtime.

The current production public IP `47.129.247.102` is not documented as an
Elastic IP allocation. Do not stop the production instance without an IP
retention or cutover plan.

## Outage Criteria

Treat any of these as potential production incidents:

- Public `http://47.129.247.102/api/health` does not return `200`.
- Public `/sub/clash.yaml` cannot be reached or does not enforce token checks.
- Public Shadowsocks port `18388` is unreachable for valid clients.
- Loopback Console/API on `127.0.0.1:3456` is unavailable on the production
  host.
- SQLite database is missing, locked beyond recovery, corrupt, or fails
  `pragma integrity_check`.
- Nginx, `proxy-gateway-console.service`, or `proxy-gateway-ss.service` is
  inactive or repeatedly crashing.
- The production public IP changes unexpectedly.

## Hard Stop Rules

Do not perform these actions without a specific approved Risk A runbook:

- Do not stop or terminate `i-004ab1c6c71d06bca`.
- Do not detach, replace, or broadly open `sg-04a165ec77f430ee8`.
- Do not mutate production Nginx, systemd, `ss-server`, `.env`, SQLite, or
  node config during diagnosis.
- Do not copy production `.env`, `CONSOLE_TOKEN`, `SS_PASSWORD`, SQLite data,
  AWS credentials, customer data, or subscription URLs to local machines,
  temporary CI hosts, staging hosts, or chat.
- Do not use the historical stopped node `i-0589aac321172dd74` as staging,
  standby, or replacement production without explicit reassignment, rebuild,
  retagging, and validation.
- Do not use a manual CI validation host as staging, standby, production, or a
  self-hosted runner.
- Do not expose the Admin UI or Admin API publicly.
- Do not open `3456`, `18180`, or `1080` to the public internet.

## Read-Only AWS Inventory

Clear local proxy variables first if AWS CLI requests are accidentally routed
through a dead local proxy:

```powershell
Remove-Item Env:HTTP_PROXY,Env:HTTPS_PROXY,Env:ALL_PROXY,Env:http_proxy,Env:https_proxy,Env:all_proxy -ErrorAction SilentlyContinue
```

Verify the production instance by explicit instance ID:

```powershell
aws ec2 describe-instances `
  --region ap-southeast-1 `
  --instance-ids i-004ab1c6c71d06bca `
  --query "Reservations[].Instances[].{InstanceId:InstanceId,State:State.Name,PublicIp:PublicIpAddress,PrivateIp:PrivateIpAddress,Type:InstanceType,Name:Tags[?Key=='Name']|[0].Value,Purpose:Tags[?Key=='Purpose']|[0].Value,SecurityGroups:SecurityGroups[*].GroupId}" `
  --output table
```

Cross-check the public IP:

```powershell
aws ec2 describe-instances `
  --region ap-southeast-1 `
  --filters Name=ip-address,Values=47.129.247.102 `
  --query "Reservations[].Instances[].{InstanceId:InstanceId,State:State.Name,PublicIp:PublicIpAddress,PrivateIp:PrivateIpAddress,SecurityGroups:SecurityGroups[*].GroupId}" `
  --output table
```

Check whether the public IP is an Elastic IP allocation:

```powershell
aws ec2 describe-addresses `
  --region ap-southeast-1 `
  --public-ips 47.129.247.102 `
  --output table
```

If this command returns no allocation or `InvalidAddress.NotFound`, the IP is
not confirmed as retained.

Verify the production security group by explicit ID:

```powershell
aws ec2 describe-security-groups `
  --region ap-southeast-1 `
  --group-ids sg-04a165ec77f430ee8 `
  --query "SecurityGroups[].{GroupId:GroupId,GroupName:GroupName,VpcId:VpcId,Description:Description,IpPermissions:IpPermissions}" `
  --output table
```

Verify the historical stopped node if replacement or standby discussions start:

```powershell
aws ec2 describe-instances `
  --region ap-southeast-1 `
  --instance-ids i-0589aac321172dd74 `
  --query "Reservations[].Instances[].{InstanceId:InstanceId,State:State.Name,PublicIp:PublicIpAddress,PrivateIp:PrivateIpAddress,Name:Tags[?Key=='Name']|[0].Value,Project:Tags[?Key=='Project']|[0].Value,Environment:Tags[?Key=='Environment']|[0].Value}" `
  --output table
```

## Production Backup Requirements

Before any recovery mutation, confirm the production database path from the
runtime environment without printing secret values. Current documented
production path:

```text
/opt/proxy-gateway-minimal/data/subscriptions.sqlite
```

Create a SQLite backup from the production host:

```bash
cd /opt/proxy-gateway-minimal
SUBSCRIPTION_DB_PATH=/opt/proxy-gateway-minimal/data/subscriptions.sqlite \
  scripts/backup-subscriptions.sh
```

Run an integrity check:

```bash
sqlite3 /opt/proxy-gateway-minimal/data/subscriptions.sqlite "pragma integrity_check;"
```

Expected result:

```text
ok
```

Confirm presence and permissions, but do not print sensitive contents:

```bash
ls -l /opt/proxy-gateway-minimal/.env
ls -l /opt/proxy-gateway-minimal/data/subscriptions.sqlite
ls -l /opt/proxy-gateway-minimal/config/proxy-servers.json
ls -l /etc/systemd/system/proxy-gateway-console.service /etc/systemd/system/proxy-gateway-ss.service
ls -l /etc/nginx/sites-enabled /etc/nginx/conf.d
```

Record backup path, file mode, size, and integrity result in the incident
record. Do not copy the backup outside the approved recovery boundary.

## Recovery Options

### 1. Same-Instance Service Recovery

Use when the EC2 host is reachable and the public IP is intact.

Read-only checks:

```bash
systemctl is-active proxy-gateway-console.service proxy-gateway-ss.service nginx

systemctl show proxy-gateway-console.service proxy-gateway-ss.service nginx \
  --property=ActiveState,SubState,Result,ExecMainStatus,NRestarts \
  --no-pager

journalctl -u proxy-gateway-console.service -n 100 --no-pager
journalctl -u proxy-gateway-ss.service -n 100 --no-pager
nginx -t
ss -lntup
```

Do not paste raw `systemctl status`, process command lines, `ss -lntup`, or
journal output into PRs, docs, chat, or incident records if they include
command arguments, tokens, passwords, subscription URLs, environment-derived
secrets, or customer data. Record only redacted unit state, timestamps, error
summaries, and validation outcomes.

Inspect `journalctl` output locally and redact sensitive values before
recording incident notes.

Restarting services is production mutation. Only do it after explicit operator
approval and after recording the current state.

### 2. SQLite Restore On The Same Instance

Use only when the instance and service files are intact but SQLite data must be
restored.

Required gates:

- Create a fresh backup of the current database first.
- Run `pragma integrity_check` on both current and candidate backup files.
- Confirm the restore target path and service user.
- Stop only the required service after approval.
- Restore using the tracked restore script.
- Validate local and public endpoints after restart.

Example restore command shape:

```bash
cd /opt/proxy-gateway-minimal
SUBSCRIPTION_DB_PATH=/opt/proxy-gateway-minimal/data/subscriptions.sqlite \
  scripts/restore-subscriptions.sh /path/to/subscriptions-backup.sqlite
```

### 3. Rebuild On A Clean Replacement Instance

Use when the production instance is unrecoverable. This is a high-risk
production DR action, not staging.

Required gates:

- Explicit operator approval for replacement production.
- Read-only inventory of failed production and candidate replacement.
- IP retention, DNS, or client cutover plan.
- Production secret handling plan.
- SQLite backup or last-known-good data source.
- Nginx, systemd, Console/API, `ss-server`, and node config restore plan.
- Validation checklist below before declaring recovery.

Do not reuse a manual CI host. Do not use a staging node unless it is explicitly
promoted under a production DR runbook.

### 4. Promote A Warm Standby

Use only if a standby has already been provisioned and approved as production
DR infrastructure.

Required gates:

- Verify standby instance ID, public IP or DNS, security group, and runtime
  commit/config.
- Verify production `.env`, `SS_PASSWORD`, node config, and SQLite data were
  provisioned through an approved secret/data handling process.
- Validate local loopback endpoints before public cutover.
- Execute DNS/IP/client cutover only after approval.

No warm standby is currently assigned.

### 5. DNS Or IP Cutover

Current production clients and node config still depend on `47.129.247.102`.
Domain HTTPS remains paused. DNS/IP cutover requires a separate approved plan
covering subscription base URL, node host, Nginx, HTTPS, TTL, and client impact.

## Recovery Validation

After any approved recovery action, collect these checks.

On the production host:

```bash
systemctl is-active proxy-gateway-console.service proxy-gateway-ss.service nginx
ss -lntup
curl -i http://127.0.0.1:3456/api/health
curl -i http://127.0.0.1:3456/api/admin/subscriptions
sqlite3 /opt/proxy-gateway-minimal/data/subscriptions.sqlite "pragma integrity_check;"
```

Expected local behavior:

```text
proxy-gateway-console.service -> active
proxy-gateway-ss.service -> active
nginx -> active
127.0.0.1:3456/api/health -> 200
127.0.0.1:3456/api/admin/subscriptions without token -> 401
SQLite integrity_check -> ok
```

From an external network:

```powershell
curl.exe -i http://47.129.247.102/api/health
curl.exe -i http://47.129.247.102/api/admin/subscriptions
curl.exe -i http://47.129.247.102/sub/clash.yaml
```

Expected public behavior:

```text
/api/health -> 200
/api/admin/subscriptions -> 404
/sub/clash.yaml without token -> 401
```

If an operator has a valid subscription token, test a real subscription fetch
without pasting the token into logs, PRs, docs, or chat.

Validate the Shadowsocks node path with an approved client-side check. Do not
publish `SS_PASSWORD`, subscription URLs, or generated YAML containing tokens.

## Incident Record Template

```text
Incident title:
Date/time:
Reporter:
Operator:

Symptoms:
Affected paths:
Customer impact:

Production instance lookup:
Public IP lookup:
Elastic IP lookup:
Security group lookup:
Historical/staging nodes checked:

Backup path:
Backup integrity result:
Current DB integrity result:

Approved recovery option:
Approval phrase / approver:
Commands run:
Files changed:
Services restarted:
Secrets copied: yes/no, approved boundary only
AWS resources mutated:

Validation results:
- local /api/health:
- local admin without token:
- public /api/health:
- public /api/admin/subscriptions:
- public /sub/clash.yaml without token:
- valid subscription fetch:
- ss-server/client check:
- SQLite integrity_check:

Rollback or exit status:
Cleanup completed:
Follow-ups:
```

## Non-Goals

This runbook does not implement or authorize:

- Active-active production.
- Automatic failover.
- Load balancers.
- Terraform, Kubernetes, Redis, queues, or cluster orchestration.
- Domain HTTPS rollout.
- Staging provisioning.
- Production mutation from a docs-only PR.
