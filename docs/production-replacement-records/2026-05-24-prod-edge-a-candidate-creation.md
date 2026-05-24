# Production Replacement: prod-edge-a Candidate Creation

Date: 2026-05-24 15:39-16:02 +08:00

Branch: `ops/prod-edge-a-candidate-creation`

Runbooks:

- `docs/production-replacement-records/2026-05-24-prod-edge-a-candidate-preflight.md`
- `docs/PRODUCTION_REPLACEMENT.md`
- `docs/PRODUCTION_EDGE_FLEET.md`
- `ops/edge-node/README.md`

Approval phrase:

```text
Create a clean prod-edge-a production candidate. Do not cut over traffic.
```

## Scope

This record covers creation and validation of a clean provider-neutral
`prod-edge-a` production candidate.

Approved scope:

- create a new EC2 candidate;
- create a new security group for the candidate;
- deploy current `master`;
- install edge-node runtime dependencies and templates;
- copy the approved runtime boundary from current green to the candidate;
- restore the copied SQLite database into the candidate-only `.proxy-gateway`
  data path;
- normalize the candidate copy to the provider-neutral `prod-edge-a` node
  identity;
- validate local and public runtime behavior.

This record does not authorize or perform:

- DNS change;
- blue mutation;
- green promotion;
- legacy blue shutdown or termination;
- production config migration;
- production tenant migration;
- HTTPS issuance;
- Nginx mutation on blue or green;
- production traffic cutover;
- public Admin UI exposure;
- secret, token, raw subscription URL, SQLite content, AWS credential, or
  customer data disclosure in PRs, docs, chat, or logs.

## Source State

Legacy blue remained unavailable from the local operator network during this
work:

```text
ssh ubuntu@47.129.247.102 -> timed out
```

Current green was used as the temporary runtime boundary source:

```text
Green public IP: 18.136.102.226
Green services: proxy-gateway-console.service / proxy-gateway-ss.service / nginx active
Green SQLite integrity_check: ok
```

Green runtime config shape before candidate normalization:

```text
server name: aws-singapore-blue
server host: 18.136.102.226
tenant node_id counts:
  aws-singapore-blue -> 1
  miyao (Aliyun Shadowsocks) -> 1
```

This source state is a temporary operational bridge. It is not a durable node
identity model and does not change the approved production migration boundary.

## AWS Resources Created

Security group:

```text
Group ID: sg-0379ece0b3d305c43
Group name: proxy-gateway-prod-edge-a-20260524
VPC: vpc-01be6089f9892a651
```

Ingress:

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

Instance:

```text
Instance ID: i-0b7791340d3fedff5
Name: proxy-gateway-prod-edge-a-20260524
Public IP: 13.215.156.159
Private IP: 172.31.27.240
State: running
Instance type: t4g.small
AMI: ami-08bf93219e21cea7a
Architecture: arm64
Subnet: subnet-0bd6d390d9e318744
VPC: vpc-01be6089f9892a651
Availability zone: ap-southeast-1b
Key pair: proxy-gateway-aws-sg-20260521
Security group: sg-0379ece0b3d305c43
Launch time: 2026-05-24T07:39:25Z
```

Tags:

```text
Name=proxy-gateway-prod-edge-a-20260524
Project=proxy-gateway-minimal
Environment=production-replacement
Role=prod-edge-a-candidate
Purpose=prod-edge-a-candidate
Owner=codex
NoCutover=true
LegacyBlueSource=i-004ab1c6c71d06bca
CurrentGreenCandidate=i-0ad8676ee113d14cb
```

Root volume:

```text
Volume ID: vol-0d9aed2257d548b00
Size/type: 12 GiB gp3
Encrypted: true
Availability zone: ap-southeast-1b
State: in-use
DeleteOnTermination: true
```

## Deployment

Deployed commit:

```text
cea90040a45458211570ae207214c4b2963ccc2a
```

Runtime path:

```text
/opt/proxy-gateway-minimal
```

Runtime:

```text
Node: v22.22.2
npm: 10.9.7
```

Deployment steps:

- created a Git archive of current `master`;
- copied the archive to prod-edge-a;
- extracted it under `/opt/proxy-gateway-minimal`;
- installed Node.js 22 from NodeSource;
- ran `ops/edge-node/bootstrap.sh --apply`;
- installed Nginx, sqlite3, shadowsocks-libev, service templates, and app
  dependencies;
- installed the approved runtime boundary from current green;
- adjusted candidate-only runtime values to `13.215.156.159`;
- wrote `.deployed-commit`.

Operational corrections during deployment:

- The first bootstrap attempt failed because the uploaded shell script had CRLF
  line endings on Linux. The candidate copy was normalized to LF and bootstrap
  was rerun.
- The first `npm run admin:test` failed because `sudo npm ci --prefix admin`
  left `admin/node_modules/.vite-temp` owned by root. The candidate app tree was
  re-owned for validation and Admin tests were rerun successfully.
- Initial public HTTP checks hit the Nginx default runtime behavior until
  Nginx reloaded the installed public gateway site. After `nginx -t` and
  `systemctl reload nginx`, the public boundary matched expectations.
- SQLite integrity must be checked as the `proxy-gateway` service user because
  the candidate database is mode `600`.

## Runtime Boundary Handling

Runtime files copied from current green to prod-edge-a under the approved
candidate-creation boundary:

- `.env`;
- SQLite database;
- `config/proxy-servers.json`;
- `/etc/proxy-gateway/ss-server.json`.

No runtime secret values, tokens, generated subscription URLs, SQLite contents,
AWS credentials, private keys, or customer data were printed or recorded.

Candidate-only adjustments:

```text
PUBLIC_SUBSCRIPTION_BASE_URL=http://13.215.156.159
SUBSCRIPTION_DB_PATH=/opt/proxy-gateway-minimal/.proxy-gateway/subscriptions.sqlite
config/proxy-servers.json server host=13.215.156.159
config/proxy-servers.json pingHosts=[13.215.156.159]
config/proxy-servers.json nginx.host=13.215.156.159
config/proxy-servers.json server name=prod-edge-a
candidate SQLite tenant node_id values normalized to prod-edge-a
```

The SQLite `node_id` normalization happened only on the prod-edge-a candidate
copy so the candidate can validate provider-neutral node identity. No blue,
green, or production tenant assignment was changed.

File boundary after install:

```text
.env -> 600 root:root
ss-server.json -> 600 root:root
.proxy-gateway/subscriptions.sqlite -> 600 proxy-gateway:proxy-gateway
```

Temporary transfer artifacts were removed from current green, prod-edge-a, and
the local workstation after validation.

## Repository Validation On prod-edge-a

Validation:

```text
npm ci: passed
npm ci --prefix admin: passed
npm test: 133/133 passed
npm run admin:test: 24/24 passed
npm run admin:build: passed
```

## Runtime Validation On prod-edge-a

Service states:

```text
proxy-gateway-console.service -> active
proxy-gateway-ss.service -> active
nginx -> active
```

Safe systemd properties:

```text
proxy-gateway-console.service: ActiveState=active, SubState=running, Result=success, ExecMainStatus=0, NRestarts=0
proxy-gateway-ss.service: ActiveState=active, SubState=running, Result=success, ExecMainStatus=0, NRestarts=0
nginx: ActiveState=active, SubState=running, Result=success, ExecMainStatus=0, NRestarts=0
```

Local validation:

```text
nginx -t -> ok
SQLite integrity_check -> ok
127.0.0.1:3456/api/health -> 200
127.0.0.1:3456/api/admin/subscriptions without token -> 401
127.0.0.1:3456/sub/clash.yaml without token -> 401
```

Console-bearer subscription check:

```text
127.0.0.1:3456/sub/clash.yaml with Bearer console token -> 200
Generated YAML contains prod-edge-a
Generated YAML references 13.215.156.159
Generated YAML does not reference 47.129.247.102
Generated YAML does not reference 18.136.102.226
```

The generated YAML was inspected only for expected labels and IP references.
It was not printed or recorded because it can include node credentials.

## Public Validation

Public prod-edge-a behavior:

```text
http://13.215.156.159/api/health -> 200
http://13.215.156.159/api/admin/subscriptions -> 404
http://13.215.156.159/sub/clash.yaml without token -> 401
http://13.215.156.159/ -> 404
13.215.156.159:18388 TCP -> reachable
13.215.156.159:3456 TCP -> not reachable
13.215.156.159:18180 TCP -> not reachable
13.215.156.159:1080 TCP -> not reachable
```

Log-redaction validation:

```text
nginx -T literal request_uri occurrences -> 0
access log token query count -> 0
```

No raw access-log lines were copied into this record.

## DNS And Cutover Status

DNS remained unchanged:

```text
sub.globalcirclecat.com -> 47.129.247.102 TTL 600
ss-sg.globalcirclecat.com -> 47.129.247.102 TTL 600
```

No traffic cutover was approved or performed.

Current roles after this execution:

```text
Legacy blue:
  Public IP: 47.129.247.102
  Role: review hold / controlled exit only

Current green:
  Public IP: 18.136.102.226
  Role: temporary validated candidate

prod-edge-a:
  Public IP: 13.215.156.159
  Role: clean provider-neutral production candidate
  Traffic: none
```

## Cleanup

Removed temporary files:

```text
Current green: /tmp/prod-edge-a-runtime-boundary.tar.gz
prod-edge-a: /tmp/prod-edge-a-runtime-boundary.tar.gz
prod-edge-a: /tmp/proxy-gateway-current-master.tar.gz
prod-edge-a: /tmp/configure-prod-edge-a.sh
prod-edge-a: /tmp/validate-prod-edge-a.sh
Local: C:\tmp\proxy-gateway-cea90040-prod-edge-a.tar.gz
Local: C:\tmp\configure-prod-edge-a.sh
Local: C:\tmp\validate-prod-edge-a.sh
```

Local stash preserved and not used:

```text
stash@{0}: local green node config test before prod-edge-a preflight
```

## Next Decision

prod-edge-a now exists and has passed candidate validation, but it is not
production and receives no DNS or subscription traffic.

Next actions require separate explicit Risk A approval:

- prod-edge-a cutover preflight;
- DNS/node-host cutover to prod-edge-a;
- production node-config migration;
- tenant migration;
- current green cleanup or reclassification;
- legacy blue retirement or cleanup.

Do not cut traffic over as a follow-up to this record.

## Repository Validation

Repository validation for this record:

```text
git diff --check origin/master...HEAD
```
