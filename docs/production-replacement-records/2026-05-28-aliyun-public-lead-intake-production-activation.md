# Aliyun Public Lead Intake Production Activation

Date: 2026-05-28, Asia/Shanghai.

## Scope

Activate the public lead-intake endpoint on the Aliyun public Nginx boundary by
proxying only `POST /api/public/leads` to the existing local proxy-gateway
service.

## Approval

```text
Approve Aliyun public lead-intake production activation. Allow updating only the Aliyun Nginx public boundary to proxy POST /api/public/leads to the existing local proxy-gateway service, preserving /, /api/health, /sub/clash.yaml, /sub/a/, and public Admin blocking. No DNS change, no public Admin, no subscription state mutation, no edge traffic, no AWS mutation, no payment activation, and rollback by restoring the previous Nginx config.
```

## Preflight

Repo/worktree:

```text
C:\Users\g\.config\superpowers\worktrees\proxy-gateway-minimal\telegram-qr-registration-entry
branch: codex/telegram-qr-registration-entry
```

Production public state before the change:

```text
https://sub.globalcirclecat.com/                       -> 200
https://sub.globalcirclecat.com/api/health             -> 200
https://sub.globalcirclecat.com/api/admin/platform/... -> 404
https://sub.globalcirclecat.com/sub/clash.yaml         -> 401 without token
https://sub.globalcirclecat.com/sub/a/__placeholder__  -> 404
POST https://sub.globalcirclecat.com/api/public/leads  -> 405
```

Host-internal preflight:

```text
POST http://127.0.0.1:3456/api/public/leads with empty JSON -> 400
```

This confirmed the local application route existed and the public 405 was a
Nginx boundary issue rather than a missing application route.

## Execution

Backup:

```text
/root/proxy-gateway-backups/public-lead-intake-20260528T175741/
  proxy-gateway-public.conf.before.content
  proxy-gateway-public.conf.target
```

Nginx change:

```text
Added exact `location = /api/public/leads` blocks to both public 80 and 443
server blocks in `/etc/nginx/sites-available/proxy-gateway-public.conf`.

Only POST is proxied to `http://127.0.0.1:3456`.
Other methods return 405.
```

Reload:

```text
nginx -t              -> passed
systemctl reload nginx -> passed
nginx -t              -> passed
```

## Validation

Public lead intake:

```text
POST /api/public/leads with a valid smoke payload -> 202 {"ok":true,"status":"accepted"}
POST /api/public/leads with empty JSON            -> 400
GET  /api/public/leads                            -> 405
```

Boundary regression:

```text
https://sub.globalcirclecat.com/                       -> 200
https://sub.globalcirclecat.com/api/health             -> 200
https://sub.globalcirclecat.com/api/admin/platform/... -> 404
https://sub.globalcirclecat.com/sub/clash.yaml         -> 401 without token
https://sub.globalcirclecat.com/sub/a/__placeholder__  -> 404
http://sub.globalcirclecat.com/                        -> 404 unchanged
ssh.service                                            -> active
nginx.service                                          -> active
proxy-gateway-candidate.service                        -> active
```

## Not Performed

- No DNS change.
- No public Admin exposure.
- No subscription state mutation.
- No edge traffic activation.
- No AWS mutation.
- No payment activation.
- No proxy-gateway restart.
- No customer data export.

## Notes

The smoke validation created one synthetic lead using non-customer placeholder
data. Public lead intake is now reachable, but the platform remains an
operator-controlled flow: lead review, account conversion, entitlement, access
grant, and resource-package delivery are still protected/Admin or CLI flows, not
public self-service automation.

## Rollback

```bash
cp -f /root/proxy-gateway-backups/public-lead-intake-20260528T175741/proxy-gateway-public.conf.before.content \
  /etc/nginx/sites-available/proxy-gateway-public.conf
nginx -t
systemctl reload nginx
```
