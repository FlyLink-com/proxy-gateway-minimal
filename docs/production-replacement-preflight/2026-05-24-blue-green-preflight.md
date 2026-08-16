# Production Replacement Preflight: Blue-Green Candidate Readiness

Date: 2026-05-24, Asia/Shanghai.

```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: production_replacement_preflight_2026_05_24_blue_green_preflight
  superseded_by: null
  last_verified_at: 2026-05-24
  production_authority: false
```

This is a read-only production replacement preflight record. It does not
authorize AWS mutation, green instance creation, production secret copying,
SQLite copying, security group changes, service restarts, or cutover.

## Classification

```text
Risk: A / read-only ops preflight
Process: strict, no mutation
Target: current production blue
Production/AWS impact: read-only only
Validated local commit: 0791e6d6e944dd21c68c16bcb7a4cf7a2d670a54
```

## Executive Conclusion

Current blue is healthy enough to remain in service, but the project is not
ready to request green production replacement candidate creation yet.

Blockers before green creation approval:

- `47.129.247.102` is not confirmed as an Elastic IP and must not be assumed
  movable.
- The current tracked subscription base URL and node config are IP-pinned to
  `47.129.247.102`.
- The domain HTTPS plan remains paused, so DNS cutover is not yet an approved
  path.
- A fresh blue SQLite backup should be created immediately before any approved
  green data restore or cutover action.

Recommended next action:

```text
Decide the production cutover strategy first:
1. Elastic IP allocation/reassociation plan;
2. DNS/subscription domain plan; or
3. subscription/node config update plan.
```

Do not create green until that strategy and its rollback path are approved.

## Explicit Non-Actions

This preflight did not perform any of the following:

- No `run-instances`.
- No security group creation or mutation.
- No ingress or egress rule change.
- No Elastic IP allocation or association.
- No production stop, reboot, terminate, or service restart.
- No `.env`, `CONSOLE_TOKEN`, `SS_PASSWORD`, SQLite, AWS credentials, customer
  data, or subscription URL copied.
- No green candidate created.
- No cutover approved.

## Blue Instance Inventory

Read-only AWS inventory was collected in `ap-southeast-1`.

| Field | Value |
| --- | --- |
| Instance ID | `i-004ab1c6c71d06bca` |
| State | `running` |
| Instance type | `t4g.small` |
| Region | `ap-southeast-1` |
| AMI ID | `ami-08bf93219e21cea7a` |
| AMI name | `ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-arm64-server-20260515` |
| Architecture | `arm64` |
| Launch time | `2026-05-21T15:04:19+00:00` |
| Public IP | `47.129.247.102` |
| Private IP | `172.31.26.232` |
| VPC | `vpc-01be6089f9892a651` |
| Subnet | `subnet-0bd6d390d9e318744` |
| Key pair | `proxy-gateway-aws-sg-20260521` |
| Security group | `sg-04a165ec77f430ee8` |
| Name tag | `proxy-gateway-node-sg-blue-20260521` |
| Purpose tag | `blue-deploy` |
| Project / Environment / Role tags | not set |
| Root volume | `vol-0c97431aaf639e098` |
| Root volume size/type | `12 GiB`, `gp3` |
| Root volume encryption | `false` |
| Root volume AZ | `ap-southeast-1b` |

Public IP cross-check by `Name=ip-address,Values=47.129.247.102` returned the
same instance `i-004ab1c6c71d06bca`.

## Public IP / Elastic IP Status

`aws ec2 describe-addresses --public-ips 47.129.247.102` returned
`InvalidAddress.NotFound`.

Conclusion:

```text
47.129.247.102 is not confirmed as an Elastic IP allocation.
It must not be treated as movable or retained across stop/start.
```

This blocks Elastic IP reassociation as the default cutover strategy.

## Security Group Inventory

Security group:

```text
sg-04a165ec77f430ee8
Name: proxy-gateway-node-sg-blue-20260521
Description: Proxy Gateway blue Singapore node 20260521
VPC: vpc-01be6089f9892a651
```

Ingress:

| Protocol | Port | Source | Purpose |
| --- | --- | --- | --- |
| TCP | `22` | `36.163.181.255/32` | admin SSH |
| TCP | `80` | `0.0.0.0/0` | subscription HTTP / Nginx gateway |
| TCP | `443` | `0.0.0.0/0` | allowed by SG, HTTPS runtime still paused |
| TCP | `18388` | `0.0.0.0/0` | Shadowsocks TCP |
| UDP | `18388` | `0.0.0.0/0` | Shadowsocks UDP |

Egress:

```text
All protocols to 0.0.0.0/0
```

Observed boundary:

- `3456`, `18180`, and `1080` are not exposed in the security group.
- Admin public path remains blocked by Nginx.

## Public Endpoint Checks

Read-only public endpoint checks from the local machine:

| Endpoint | Result |
| --- | --- |
| `http://47.129.247.102/api/health` | `200 OK` |
| `http://47.129.247.102/api/admin/subscriptions` | `404 Not Found` |
| `http://47.129.247.102/sub/clash.yaml` without token | `401 Unauthorized` |

No subscription token was used or recorded.

## Production Runtime Read-Only Health

Read-only SSH checks were run against blue. No production service was restarted.

| Check | Result |
| --- | --- |
| Hostname | `ip-172-31-26-232` |
| `proxy-gateway-console.service` | `active`, `Result=success`, `NRestarts=0`, `ExecMainStatus=0` |
| `proxy-gateway-ss.service` | `active`, `Result=success`, `NRestarts=0`, `ExecMainStatus=0` |
| `nginx` | `active`, `Result=success`, `NRestarts=0`, `ExecMainStatus=0` |
| `sudo nginx -t` | syntax ok, test successful |
| local `127.0.0.1:3456/api/health` | `200` |
| local `127.0.0.1:3456/api/admin/subscriptions` without token | `401` |

Redacted listener check confirmed:

```text
0.0.0.0:80
0.0.0.0:18388 tcp/udp
127.0.0.1:3456
127.0.0.1:18180
```

Raw process command lines and journal output were not copied into this record.

## SQLite Backup And Integrity

Current documented database:

```text
/opt/proxy-gateway-minimal/data/subscriptions.sqlite
```

Read-only checks:

| Item | Result |
| --- | --- |
| DB size | `53248` bytes |
| DB mode | `644` |
| DB mtime | `2026-05-22 16:08:02 +0000` |
| `pragma integrity_check` | `ok` |
| Latest backup | `/opt/proxy-gateway-minimal/data/backups/subscriptions-20260522T160153Z.sqlite` |
| Latest backup size | `53248` bytes |
| Latest backup mode | `600` |
| Latest backup timestamp | `2026-05-22T16:01:53Z` |

At preflight time (`2026-05-23T16:50Z` / `2026-05-24T00:50+08:00`), the latest
backup was about 24 hours and 48 minutes old.

Conclusion:

```text
SQLite integrity is healthy.
The latest backup exists, but a fresh backup is required immediately before any approved green restore or cutover.
```

No SQLite data was copied.

## Config And Secret Boundary Checks

Presence checks only:

| Path | Result |
| --- | --- |
| `/opt/proxy-gateway-minimal/.env` | exists, mode `600` |
| `/opt/proxy-gateway-minimal/config/proxy-servers.json` | exists |
| `/etc/systemd/system/proxy-gateway-console.service` | exists |
| `/etc/systemd/system/proxy-gateway-ss.service` | exists |

No file contents were printed or copied.

Tracked local config currently remains IP-based:

```text
config/proxy-servers.json host: 47.129.247.102
config/proxy-servers.json pingHosts: 47.129.247.102
config/proxy-servers.json nginx.host: 47.129.247.102
.env.example PUBLIC_SUBSCRIPTION_BASE_URL: http://47.129.247.102
```

This means current clients and generated node/subscription behavior should be
treated as IP-pinned until a domain or node-config migration plan is approved.

## Green Candidate Assumptions

These are planning assumptions only, not approval to create green:

| Area | Assumption |
| --- | --- |
| Region | Prefer same region `ap-southeast-1` for least behavioral change. |
| Architecture | `arm64`, matching blue. |
| Instance type | `t4g.small` unless capacity or load data justifies a change. |
| AMI | Start from the same Ubuntu 24.04 arm64 AMI family, currently `ami-08bf93219e21cea7a`. |
| Disk | At least `12 GiB gp3`, matching blue; increase only with explicit reason. |
| Security group | Prefer a separate green SG mirroring blue public boundary; do not mutate blue SG. |
| Runtime path | `/opt/proxy-gateway-minimal`. |
| Tags | `Project=proxy-gateway-minimal`, `Environment=production-replacement`, `Role=green-candidate`, date/ticketed `Name`. |

Production secret and SQLite handling must be separately approved under the
production replacement runbook.

## Cutover Blocker Analysis

### Elastic IP Reassociation

Current status:

```text
Blocked.
```

Reason: `47.129.247.102` returned `InvalidAddress.NotFound` from
`describe-addresses`, so it is not confirmed as an Elastic IP.

### DNS Cutover

Current status:

```text
Blocked / not selected.
```

Reason: the domain HTTPS plan remains paused. DNS record, TTL, HTTPS/Nginx,
and `PUBLIC_SUBSCRIPTION_BASE_URL` strategy are not approved.

### Subscription / Node Config Update

Current status:

```text
Possible but high client impact.
```

Reason: tracked node config and subscription base URL are currently IP-pinned
to `47.129.247.102`. Moving to a new green IP would require a client-facing
node/subscription migration plan and rollback window.

## Readiness Decision

```text
Ready to create green now: no
Ready to cut over now: no
Ready to request the next planning decision: yes
```

Blockers:

- No confirmed movable EIP for `47.129.247.102`.
- DNS/domain cutover is paused and not approved.
- Current node/subscription config is IP-pinned.
- Fresh pre-cutover SQLite backup has not yet been created for a green restore.

Recommended next action:

```text
Choose the cutover strategy before requesting green creation approval.
```

Recommended decision order:

1. Decide whether to introduce an Elastic IP or DNS/domain abstraction.
2. Decide whether clients can tolerate a subscription/node config update.
3. After cutover strategy is approved, request explicit approval to create the
   green production replacement candidate.
4. Immediately before any green restore or cutover, create a fresh blue SQLite
   backup and rerun integrity checks.

## Commands Evidence Summary

Read-only command groups used:

- `aws ec2 describe-instances` by blue instance ID.
- `aws ec2 describe-instances` by current public IP.
- `aws ec2 describe-addresses` by current public IP.
- `aws ec2 describe-security-groups` by blue security group ID.
- `aws ec2 describe-volumes` by blue root volume ID.
- `aws ec2 describe-images` by blue AMI ID.
- Public `curl.exe` endpoint checks.
- SSH read-only `systemctl is-active`, safe `systemctl show`, `sudo nginx -t`,
  redacted listener check, local endpoint checks, SQLite `pragma
  integrity_check`, and file presence/stat checks.

No mutation commands were run.
