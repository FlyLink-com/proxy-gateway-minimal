# Production Replacement: Green Candidate Creation


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: green_candidate_creation
  superseded_by: null
  last_verified_at: 2026-05-24
  production_authority: false
```


Date: 2026-05-24 03:48-04:00 +08:00

Branch: `ops/green-production-candidate-creation`

Base commit: `57e4f39aeb8847ae45b7e6f1c860988ef79ce345`

Runbook: `docs/PRODUCTION_REPLACEMENT.md`

Approval phrase:

```text
Create a green production replacement candidate for aws-singapore-blue.
```

## Scope

This record covers creation and validation of a green production replacement
candidate for current blue `aws-singapore-blue`.

Approved scope:

- Create a green EC2 candidate.
- Create a green security group.
- Deploy current `master` commit to green.
- Copy the approved production runtime boundary from blue to green.
- Restore a fresh blue SQLite backup to green.
- Configure green to validate itself directly by green public IP.
- Validate green local and public runtime behavior.

This record does not authorize or perform:

- Cutover from blue to green
- DNS record change
- Elastic IP allocation or reassociation
- Nginx mutation on blue
- HTTPS certificate issuance
- Production `.env` or node-config mutation on blue
- Blue service restart
- Green promotion to production
- Public Admin UI exposure
- Secret, token, subscription URL, SQLite data, AWS credential, or customer data
  disclosure in PRs, docs, chat, or logs

## Blue Preflight

Blue remained serving throughout this work.

Blue identity:

```text
Instance ID: i-004ab1c6c71d06bca
Public IP: 47.129.247.102
Private IP: 172.31.26.232
Instance type: t4g.small
AMI: ami-08bf93219e21cea7a
Architecture: arm64
Subnet: subnet-0bd6d390d9e318744
VPC: vpc-01be6089f9892a651
Availability zone: ap-southeast-1b
Key pair: proxy-gateway-aws-sg-20260521
Security group: sg-04a165ec77f430ee8
```

Blue public boundary after green validation:

```text
http://47.129.247.102/api/health -> 200
http://47.129.247.102/api/admin/subscriptions -> 404
http://47.129.247.102/sub/clash.yaml without token -> 401
```

## Fresh Blue SQLite Backup

A fresh blue SQLite backup was created before green data restore.

```text
Backup path: /opt/proxy-gateway-minimal/data/backups/subscriptions-20260523T194918Z.sqlite
Backup mode / owner / size: 600 root:root 53248 bytes
Current DB integrity_check: ok
Backup integrity_check: ok
```

No SQLite file was copied to the local workstation. The backup was transferred
from blue to green through the approved production replacement boundary and
temporary transfer artifacts were removed.

## AWS Resources Created

Green security group:

```text
Group ID: sg-06682c36aa03834f7
Group name: proxy-gateway-node-sg-green-20260524
VPC: vpc-01be6089f9892a651
```

Green security group ingress:

| Protocol | Port | Source | Purpose |
| --- | --- | --- | --- |
| TCP | `22` | `36.163.181.255/32` | admin SSH |
| TCP | `80` | `0.0.0.0/0` | subscription HTTP / Nginx gateway |
| TCP | `443` | `0.0.0.0/0` | HTTPS reserved, not active in runtime validation |
| TCP | `18388` | `0.0.0.0/0` | Shadowsocks TCP |
| UDP | `18388` | `0.0.0.0/0` | Shadowsocks UDP |

Egress:

```text
All protocols to 0.0.0.0/0
```

Green instance:

```text
Instance ID: i-0ad8676ee113d14cb
Name: proxy-gateway-node-sg-green-20260524
Public IP: 18.136.102.226
Private IP: 172.31.18.176
State: running
Instance type: t4g.small
AMI: ami-08bf93219e21cea7a
Architecture: arm64
Subnet: subnet-0bd6d390d9e318744
VPC: vpc-01be6089f9892a651
Availability zone: ap-southeast-1b
Key pair: proxy-gateway-aws-sg-20260521
Security group: sg-06682c36aa03834f7
Launch time: 2026-05-23T19:48:29Z
```

Green tags:

```text
Name=proxy-gateway-node-sg-green-20260524
Project=proxy-gateway-minimal
Environment=production-replacement
Role=green-candidate
Purpose=green-candidate
Owner=codex
BlueSource=i-004ab1c6c71d06bca
NoCutover=true
```

Green root volume:

```text
Volume ID: vol-0aebb249dd241a4ed
Size/type: 12 GiB gp3
Encrypted: true
Availability zone: ap-southeast-1b
State: in-use
DeleteOnTermination: true
```

## Deployment

Current `master` commit deployed to green:

```text
57e4f39aeb8847ae45b7e6f1c860988ef79ce345
```

Runtime path:

```text
/opt/proxy-gateway-minimal
```

Installed runtime:

```text
Node: v22.22.2
npm: 10.9.7
nginx: installed from Ubuntu packages
sqlite3: installed from Ubuntu packages
shadowsocks-libev: installed from Ubuntu packages
```

Validation during deploy:

```text
npm ci: passed
npm ci --prefix admin: passed
npm run admin:build: passed
npm test: 129/129 passed
npm run admin:test: 24/24 passed
```

The first `npm run admin:build` attempt failed because `admin/` dependencies
had not yet been installed. After `npm ci --prefix admin`, the build passed.

## Production Runtime Boundary Handling

Runtime files copied from blue to green under the approved replacement
boundary:

- Production `.env`
- Fresh SQLite backup
- `config/proxy-servers.json`
- `proxy-gateway-console.service`
- `proxy-gateway-ss.service`
- Nginx public gateway config
- Shadowsocks server config

No raw secret values, tokens, generated subscription URLs, SQLite contents, or
customer data were printed or recorded.

Green-only runtime adjustments:

```text
PUBLIC_SUBSCRIPTION_BASE_URL=http://18.136.102.226
config/proxy-servers.json server host=18.136.102.226
config/proxy-servers.json pingHosts=[18.136.102.226]
config/proxy-servers.json nginx.host=18.136.102.226
```

The server `name` in `config/proxy-servers.json` was kept as
`aws-singapore-blue` so restored tenant `node_id` values remain resolvable in
the copied SQLite data. This is a green validation choice only and does not
change blue.

Temporary transfer artifacts:

```text
Blue runtime tar: removed
Blue ss-server config temp copy: removed
Green runtime tar: removed
Green ss-server config temp copy: removed
Local code archive: removed
```

## Green Validation

Green service states:

```text
proxy-gateway-console.service -> active
proxy-gateway-ss.service -> active
nginx -> active
```

Safe systemd properties after final validation:

```text
proxy-gateway-console.service: ActiveState=active, SubState=running, Result=success, ExecMainStatus=0, NRestarts=0
proxy-gateway-ss.service: ActiveState=active, SubState=running, Result=success, ExecMainStatus=0, NRestarts=23
nginx: ActiveState=active, SubState=running, Result=success, ExecMainStatus=0, NRestarts=0
```

`proxy-gateway-ss.service` initially restarted while `/etc/proxy-gateway/ss-server.json`
was missing on green. The missing config was copied from blue to green through
the approved boundary, temporary files were removed, and the service then
became active with `ExecMainStatus=0`.

Local green validation:

```text
nginx -t -> ok
127.0.0.1:3456/api/health -> 200
127.0.0.1:3456/api/admin/subscriptions without token -> 401
127.0.0.1:3456/api/admin/overview with Bearer token -> 200
SQLite integrity_check -> ok
SQLite mode / owner / size -> 600 ubuntu:ubuntu 53248 bytes
Tenant counts -> active:1, disabled:1
Listeners -> 0.0.0.0:80, 0.0.0.0:18388, 127.0.0.1:3456
Valid console-bearer subscription fetch -> ok, generated YAML references 18.136.102.226
Unknown subscription token -> 401
```

Public green validation:

```text
http://18.136.102.226/api/health -> 200
http://18.136.102.226/api/admin/subscriptions -> 404
http://18.136.102.226/sub/clash.yaml without token -> 401
http://18.136.102.226/ -> 404
Valid console-bearer subscription fetch through public Nginx -> ok, generated YAML references 18.136.102.226
18.136.102.226:18388 TCP -> reachable
```

Nginx access-log check on green:

```text
$request_uri occurrences in nginx -T output -> 0
token query count in /var/log/nginx/access.log -> 0
```

Expired tenant-token validation was not performed with a raw tenant token:
the copied production database stores only token hashes, and this execution did
not create or mutate tenant records merely for validation. The repository test
suite covering expired token rejection passed on green as part of `npm test`.

## Cutover Status

No cutover was approved or performed.

Current client-facing production remains blue:

```text
47.129.247.102
sub.globalcirclecat.com -> 47.129.247.102
ss-sg.globalcirclecat.com -> 47.129.247.102
```

Green is a validated production replacement candidate only:

```text
18.136.102.226
```

## Rollback / Exit Plan

Because no production traffic was cut over, rollback is simply to keep blue in
service and leave DNS/config unchanged.

If green is no longer needed before cutover, destroy green only after a
separate explicit cleanup approval:

```powershell
aws ec2 terminate-instances --region ap-southeast-1 --instance-ids i-0ad8676ee113d14cb
aws ec2 delete-security-group --region ap-southeast-1 --group-id sg-06682c36aa03834f7
```

Do not run these cleanup commands without approval.

## Conclusion

Green production replacement candidate creation and validation completed.

Ready to request cutover planning or further validation: yes, through a
separate explicit approval only.

Not approved by this record:

- Cutover production traffic from blue to green
- DNS change to green
- Elastic IP allocation or reassociation
- HTTPS issuance
- Blue shutdown, restart, or termination
- Green cleanup or termination
