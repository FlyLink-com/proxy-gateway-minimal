# Aliyun Control DB Path Patch And Runtime Upgrade Success

Date: 2026-06-02, Asia/Shanghai.

## Status

```text
Risk: A
Process: exact-approved protected env path patch and runtime upgrade retry
Expected PR count: 0 for production execution record; local docs remain uncommitted
Validation: passed
Production/AWS impact: Aliyun candidate runtime only; no AWS mutation
```

## Approval

The operator approved a protected control DB path patch and runtime upgrade
retry to exact commit `3e1c9a79ec852e3ca5a4f013a42e3aabf7c97185`.

Allowed mutations were limited to:

```text
create an on-host 0600 backup copy of /opt/proxy-gateway-minimal-candidate/.env
append SUBSCRIPTION_CONTROL_DB_PATH=/opt/proxy-gateway-minimal-candidate/state/control.sqlite only if no control DB key existed
preserve existing .env values without printing or copying them off-host
use the already prepared release /opt/proxy-gateway-minimal-candidate/releases/3e1c9a79ec85
switch current to the prepared release
restart only proxy-gateway-candidate.service
allow runtime initialization of the control SQLite file under the service-owned state directory
```

No `.env` value, SQLite row, log content, handoff content, token,
subscription URL, credential, or customer data was copied or printed.

## Preflight

```text
local HEAD: 3e1c9a79ec852e3ca5a4f013a42e3aabf7c97185
approved commit: 3e1c9a79ec852e3ca5a4f013a42e3aabf7c97185
current before retry: /opt/proxy-gateway-minimal-candidate/releases/da33de295cb0
target release exists: yes
rollback release exists: yes
target candidate-start.mjs exists: yes
target node_modules exists: yes
base .env exists: yes
control DB env key before patch: no
state directory owner/mode: proxy-gateway-candidate:proxy-gateway-candidate:700
proxy-gateway-candidate.service: active
nginx: active
```

## Protected Env Patch

```text
env backup path: /opt/proxy-gateway-minimal-candidate/state/backups/env-before-control-db-path-20260602T145409Z
env backup metadata: proxy-gateway-candidate:proxy-gateway-candidate:600:600
env appended: yes
control DB env key after patch: yes
env file metadata after patch: proxy-gateway-candidate:proxy-gateway-candidate:600:688
```

The appended setting is non-secret and points to the existing service-owned
state directory:

```text
SUBSCRIPTION_CONTROL_DB_PATH=/opt/proxy-gateway-minimal-candidate/state/control.sqlite
```

Existing `.env` values were preserved and were not printed.

## Runtime Switch

```text
old_current: /opt/proxy-gateway-minimal-candidate/releases/da33de295cb0
current_after_switch: /opt/proxy-gateway-minimal-candidate/releases/3e1c9a79ec85
proxy-gateway-candidate.service restart: success
proxy-gateway-candidate.service active: active
current_final: /opt/proxy-gateway-minimal-candidate/releases/3e1c9a79ec85
candidate-start.mjs present: yes
```

Only `proxy-gateway-candidate.service` was restarted.

## Validation

Private application boundary:

```text
127.0.0.1:3456 /api/health: 200
127.0.0.1:3456 /api/admin/subscriptions without auth: 401
127.0.0.1:3456 /sub/clash.yaml without token: 401
```

Public HTTPS boundary:

```text
https://sub.globalcirclecat.com/api/health: 200
https://sub.globalcirclecat.com/api/admin/subscriptions without auth: 404
https://sub.globalcirclecat.com/sub/clash.yaml without token: 401
https://sub.globalcirclecat.com/: 200
```

SQLite integrity:

```text
subscriptions.sqlite size=73728 integrity=ok
proxy-gateway.sqlite size=0 integrity=ok
control.sqlite size=4096 integrity=ok
control.sqlite metadata=proxy-gateway-candidate:proxy-gateway-candidate:644:4096
```

Listener boundary:

```text
tcp 0.0.0.0:22
tcp 0.0.0.0:80
tcp 0.0.0.0:443
tcp 127.0.0.1:18080
tcp 127.0.0.1:18180
tcp 127.0.0.1:3456
tcp 127.0.0.1:35435
udp 0.0.0.0:51820
udp [::]:51820
public forbidden listener on 3456/18180/1080/18388: no
```

The new `127.0.0.1:18180` listener is loopback-only and comes from the
candidate runtime's local HTTP proxy bridge. No public 18180 listener was
opened.

Rollback readiness:

```text
rollback release da33de295cb0 exists: yes
on-host .env backup exists: yes
```

## Not Performed

```text
Nginx reload/config mutation: not performed
DNS mutation: not performed
UFW/provider firewall mutation: not performed
systemd unit mutation: not performed
.env value output: not performed
SQLite row dump/copy off-host/import/restore: not performed
handoff/log copy: not performed
token/subscription URL/customer data output: not performed
tenant/artifact/subscription-output mutation: not performed
edge traffic activation: not performed
public Admin exposure: not performed
```

## Result

Aliyun candidate runtime is now active on exact release `3e1c9a79ec85` with a
protected control DB path in the host `.env`. The previous release
`da33de295cb0` remains available for rollback.
