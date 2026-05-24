# Production Replacement: prod-edge-a Production MVP Activation

Date: 2026-05-24 17:30-17:44 +08:00

Branch: `ops/prod-edge-a-production-activation`

Related records:

- `docs/production-replacement-records/2026-05-24-prod-edge-a-candidate-creation.md`
- `docs/production-replacement-records/2026-05-24-prod-edge-a-cutover-preflight.md`
- `docs/production-replacement-records/2026-05-24-node-to-legacy-blue-data-preflight.md`
- `docs/production-replacement-records/2026-05-24-legacy-blue-fresh-backup-restore.md`
- `docs/SUBSCRIPTION_V2_REPLACEMENT.md`

Approval:

```text
可以
```

The approval followed the operator decision to stop treating the legacy blue
network issue as the production MVP blocker and to activate `prod-edge-a` as
the production MVP target with Subscription V2 output.

## Scope

This record covers the approved production MVP activation:

- keep subscription tokens stable;
- keep the subscription endpoint path `/sub/clash.yaml` stable;
- activate `prod-edge-a` as the production subscription gateway target;
- activate Subscription V2 multi-node output on `prod-edge-a`;
- keep green as a temporary second node in the V2 output;
- update AliDNS records for `sub.globalcirclecat.com` and
  `ss-sg.globalcirclecat.com` to `prod-edge-a`;
- validate public boundary and V2 YAML shape without recording secrets.

This operation did not perform:

- SQLite data mutation;
- tenant migration;
- token rotation;
- HTTPS issuance;
- Nginx config mutation;
- `ss-server` config mutation;
- green cleanup;
- legacy blue shutdown, stop, termination, or retirement;
- public Admin UI exposure;
- traffic quota enforcement;
- self-service portal work;
- secret, token, raw subscription URL, SQLite content, AWS credential, private
  key, or customer data disclosure in PRs, docs, chat, or logs.

## Pre-Activation Checks

prod-edge-a:

```text
Instance public IP -> 13.215.156.159
proxy-gateway-console.service -> active
proxy-gateway-ss.service -> active
nginx -> active
NRestarts -> 0,0,0
SUBSCRIPTION_DB_PATH key -> present
PUBLIC_SUBSCRIPTION_BASE_URL key -> present
SQLite integrity_check -> ok
subscription_tenants count -> 2
subscription_tenants max(updated_at) -> 2026-05-23T15:45:00.918Z
public /api/health -> 200
public /api/admin/subscriptions -> 404
public /sub/clash.yaml without token -> 401
public / -> 404
```

Initial prod-edge-a node config before this activation contained only:

```text
prod-edge-a -> 13.215.156.159:18388
```

AliDNS before mutation:

```text
sub.globalcirclecat.com -> 47.129.247.102 TTL 600
  RecordId: 2058265981713498112

ss-sg.globalcirclecat.com -> 47.129.247.102 TTL 600
  RecordId: 2058265985853242368
```

## Runtime Config Mutation On prod-edge-a

Backups retained on prod-edge-a:

```text
/opt/proxy-gateway-minimal/config/proxy-servers.json.20260524T173000Z.before-prod-activation
/opt/proxy-gateway-minimal/.env.20260524T173000Z.before-prod-activation
```

Installed production V2 node config:

```text
prod-edge-a:
  host: ss-sg.globalcirclecat.com
  port: 18388

prod-edge-b:
  host: 18.136.102.226
  port: 18388
  role: temporary secondary edge node
```

Updated public subscription base URL:

```text
PUBLIC_SUBSCRIPTION_BASE_URL=http://sub.globalcirclecat.com
```

Service action:

```text
proxy-gateway-console.service -> restarted
proxy-gateway-console.service -> active
proxy-gateway-ss.service -> active
nginx -> active
```

No Nginx reload, `ss-server` restart, SQLite restore, or tenant mutation was
performed during this activation.

## Subscription V2 Validation

Loopback health after restart:

```text
http://127.0.0.1:3456/api/health -> 200
```

Console-bearer subscription YAML shape, with secrets omitted:

```text
proxies:
  - name: "prod-edge-a"
    server: "ss-sg.globalcirclecat.com"
  - name: "prod-edge-b"
    server: "18.136.102.226"
proxy-groups:
  - name: GLOBAL
```

This proves the running prod-edge-a process loaded the V2 two-node production
config. Password lines were intentionally not copied into the record.

## DNS Mutation

AliDNS updates:

```text
sub.globalcirclecat.com
  RecordId: 2058265981713498112
  Old value: 47.129.247.102
  New value: 13.215.156.159
  TTL: 600

ss-sg.globalcirclecat.com
  RecordId: 2058265985853242368
  Old value: 47.129.247.102
  New value: 13.215.156.159
  TTL: 600
```

AliDNS post-update inventory:

```text
sub.globalcirclecat.com -> 13.215.156.159 TTL 600
ss-sg.globalcirclecat.com -> 13.215.156.159 TTL 600
```

Authoritative DNS checks:

```text
dns25.hichina.com:
  sub.globalcirclecat.com -> 13.215.156.159 TTL 600
  ss-sg.globalcirclecat.com -> 13.215.156.159 TTL 600

dns26.hichina.com:
  sub.globalcirclecat.com -> 13.215.156.159 TTL 600
  ss-sg.globalcirclecat.com -> 13.215.156.159 TTL 600
```

Local recursive DNS may continue returning the previous value until its cached
TTL expires. This is expected during the propagation window.

Observed propagation window:

```text
local system resolver:
  sub.globalcirclecat.com -> 47.129.247.102 TTL 282
  ss-sg.globalcirclecat.com -> 13.215.156.159 TTL 282

223.5.5.5:
  sub.globalcirclecat.com -> 13.215.156.159 TTL 600
  ss-sg.globalcirclecat.com -> 13.215.156.159 TTL 600
```

## Public Validation

Forced-host validation against prod-edge-a:

```text
http://sub.globalcirclecat.com/api/health -> 200
http://sub.globalcirclecat.com/api/admin/subscriptions -> 404
http://sub.globalcirclecat.com/sub/clash.yaml without token -> 401
http://sub.globalcirclecat.com/ -> 404
```

Forced-host console-bearer YAML shape, with secrets omitted:

```text
proxies:
  - name: "prod-edge-a"
    server: "ss-sg.globalcirclecat.com"
  - name: "prod-edge-b"
    server: "18.136.102.226"
proxy-groups:
  - name: GLOBAL
```

Shadowsocks TCP reachability:

```text
13.215.156.159:18388 -> reachable
18.136.102.226:18388 -> reachable
```

## Cleanup

Removed temporary transfer file from prod-edge-a:

```text
/tmp/proxy-servers.production-v2.json
```

No temporary local runtime secret file was created.

## Rollback

DNS rollback:

```bash
aliyun alidns UpdateDomainRecord \
  --RecordId 2058265981713498112 \
  --RR sub \
  --Type A \
  --Value 47.129.247.102 \
  --TTL 600

aliyun alidns UpdateDomainRecord \
  --RecordId 2058265985853242368 \
  --RR ss-sg \
  --Type A \
  --Value 47.129.247.102 \
  --TTL 600
```

prod-edge-a runtime config rollback:

```bash
sudo install -m 0644 -o root -g root \
  /opt/proxy-gateway-minimal/config/proxy-servers.json.20260524T173000Z.before-prod-activation \
  /opt/proxy-gateway-minimal/config/proxy-servers.json

sudo install -m 0600 -o root -g root \
  /opt/proxy-gateway-minimal/.env.20260524T173000Z.before-prod-activation \
  /opt/proxy-gateway-minimal/.env

sudo systemctl restart proxy-gateway-console.service
```

No SQLite rollback is required for this activation because no SQLite data was
mutated.

## Current State After Activation

```text
Production subscription gateway authoritative DNS -> prod-edge-a
Production primary node authoritative DNS -> prod-edge-a
Subscription V2 output on prod-edge-a -> prod-edge-a + temporary prod-edge-b
Subscription URL path -> unchanged
Tenant tokens -> unchanged
SQLite data -> unchanged during this activation
Green -> still running as temporary secondary node
Legacy blue -> not stopped, not retired, not terminated
HTTPS -> not issued
Traffic quota -> not implemented
```

## Follow-Up Decisions

Recommended next decisions:

```text
1. Observe DNS propagation and subscription refresh behavior.
2. Decide whether to keep green as temporary prod-edge-b or replace it with a
   durable provider-neutral second node.
3. Decide when to retire legacy blue after dependency drain and rollback window.
4. Keep traffic quota/data-plane accounting as a separate A-tier design.
```
