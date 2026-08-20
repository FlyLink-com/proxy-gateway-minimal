# Production Replacement: Green Refresh To Current Master


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: green_refresh_current_master
  superseded_by: null
  last_verified_at: 2026-05-24
  production_authority: false
```


Date: 2026-05-24 05:20-05:32 +08:00

Branch: `ops/green-refresh-current-master`

Runbook: `docs/PRODUCTION_REPLACEMENT.md`

Approval phrase:

```text
Refresh green production replacement candidate to current master and validate only.
No blue mutation, no DNS change, no production cutover.
```

## Scope

This record covers a green-only refresh of the existing production replacement
candidate.

Approved scope:

- Deploy current `master` to existing green `18.136.102.226`.
- Preserve green runtime `.env`, SQLite data, node config, and local runtime
  state.
- Run repository validation on green.
- Restart green `proxy-gateway-console.service` so the refreshed code is active.
- Validate green local and public runtime behavior.

This record does not authorize or perform:

- Blue mutation
- DNS change
- Nginx mutation
- HTTPS issuance
- Production `.env` or node-config change on blue
- Production tenant migration
- Green promotion
- Cutover
- Green cleanup or termination
- Secret, token, subscription URL, SQLite content, AWS credential, or customer
  data disclosure in PRs, docs, chat, or logs

## Identity

Blue remained serving throughout this work.

```text
Blue public IP: 47.129.247.102
Green instance: i-0ad8676ee113d14cb
Green public IP: 18.136.102.226
Green role: production replacement candidate
```

DNS remained pointed at blue:

```text
sub.globalcirclecat.com -> 47.129.247.102 TTL 600
ss-sg.globalcirclecat.com -> 47.129.247.102 TTL 600
```

## Deployment

Previous green deployment:

```text
57e4f39aeb8847ae45b7e6f1c860988ef79ce345
```

Refreshed green deployment:

```text
c53f7087fc30b340667d94e0523d094063972e0d
```

Green runtime path:

```text
/opt/proxy-gateway-minimal
```

Runtime boundaries preserved on green:

```text
.env
data/
config/
.codex/
```

`.proxy-gateway/` was absent on green at refresh time.

The refresh used a Git archive of current `master`. The archive was extracted
on green, code files were replaced, and runtime-only files were preserved. No
runtime secret values, token values, generated subscription URLs, SQLite
contents, or customer data were printed or recorded.

Green service restart:

```text
proxy-gateway-console.service: restarted
proxy-gateway-ss.service: not restarted
nginx: not restarted
```

## Repository Validation On Green

Runtime:

```text
Node: v22.22.2
npm: 10.9.7
```

Validation:

```text
npm ci: passed
npm ci --prefix admin: passed
npm test: 132/132 passed
npm run admin:test: 24/24 passed
npm run admin:build: passed
```

`rsync --delete` emitted stale `admin/node_modules` deletion warnings while
replacing the code tree. The subsequent `npm ci --prefix admin` rebuilt admin
dependencies, and the full admin test/build validation passed.

## Green Runtime Validation

Service states after refresh:

```text
proxy-gateway-console.service: ActiveState=active, SubState=running, Result=success, ExecMainStatus=0, NRestarts=0
proxy-gateway-ss.service: ActiveState=active, SubState=running, Result=success, ExecMainStatus=0, NRestarts=23
nginx: ActiveState=active, SubState=running, Result=success, ExecMainStatus=0, NRestarts=0
```

`proxy-gateway-ss.service` still shows the previously recorded `NRestarts=23`
from initial green creation. It did not need a restart during this refresh.

Local green validation:

```text
nginx -t -> ok
SQLite integrity_check -> ok
127.0.0.1:3456/api/health -> 200
127.0.0.1:3456/api/admin/subscriptions without token -> 401
127.0.0.1:3456/sub/clash.yaml without token -> 401
```

File boundary checks:

```text
.env mode / owner -> 600 root:root
SQLite mode / owner / size -> 600 ubuntu:ubuntu 53248 bytes
```

Tenant node assignment live check:

```text
POST 127.0.0.1:3456/api/admin/subscriptions/tenant_real_1/node
Authorization: Bearer <console-token>
Body: {}
Result: 400 validation_error
```

This verified the PR #66 route and required-`nodeId` guard without changing
green tenant data.

Console-bearer subscription check:

```text
127.0.0.1:3456/sub/clash.yaml with Bearer console token -> 200
Generated YAML references 18.136.102.226
Generated YAML does not reference 47.129.247.102
```

The generated YAML was inspected only for expected IP references. It was not
printed or recorded because it can include node credentials.

## Public Validation

Public green behavior:

```text
http://18.136.102.226/api/health -> 200
http://18.136.102.226/api/admin/subscriptions -> 404
http://18.136.102.226/sub/clash.yaml without token -> 401
http://18.136.102.226/ -> 404
18.136.102.226:18388 TCP -> reachable
```

Public blue behavior after green refresh:

```text
http://47.129.247.102/api/health -> 200
http://47.129.247.102/api/admin/subscriptions -> 404
http://47.129.247.102/sub/clash.yaml without token -> 401
```

## Cleanup

Temporary refresh artifacts were removed from green:

```text
/tmp/proxy-gateway-current-master.tar.gz
/tmp/proxy-gateway-refresh-*
/tmp/proxy-gateway-preserve-*
```

The local Git archive used for transfer was removed after green validation.

## Cutover Status

No cutover was approved or performed.

Current client-facing production remains blue:

```text
47.129.247.102
sub.globalcirclecat.com -> 47.129.247.102
ss-sg.globalcirclecat.com -> 47.129.247.102
```

Green is now a refreshed production replacement candidate running current
`master`:

```text
18.136.102.226
c53f7087fc30b340667d94e0523d094063972e0d
```

## Conclusion

Green has been refreshed to current `master` and validated.

Ready to request a green cutover preflight: yes, through a separate explicit
approval only.

Still not approved:

- Cutover production traffic from blue to green
- DNS change to green
- HTTPS issuance
- Blue shutdown, restart, or termination
- Production tenant migration
- Green cleanup or termination
