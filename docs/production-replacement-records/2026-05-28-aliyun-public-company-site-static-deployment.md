# Aliyun Public Company Site Static Deployment


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: aliyun_public_company_site_static_deployment
  superseded_by: null
  last_verified_at: 2026-05-28
  production_authority: false
```


Date: 2026-05-28, Asia/Shanghai.

## Scope

Deploy the repository-built public company site bundle to the Aliyun
subscription-control host and update only the HTTPS public-site root location.

## Approval

```text
Approve Aliyun public company-site static frontend deployment. Allow deploying admin/dist-site static assets to the Aliyun host and updating Nginx only to serve the public company site at https://sub.globalcirclecat.com/ while preserving /api/health, /sub/clash.yaml, /sub/a/, and public Admin blocking. No DNS change, no public Admin, no edge traffic, no subscription state mutation, no AWS mutation, no unrelated node mutation, and rollback by restoring the previous Nginx config and static asset directory.
```

## Preflight

Local source:

```text
Worktree: C:\Users\g\.config\superpowers\worktrees\proxy-gateway-minimal\telegram-qr-registration-entry
Branch: codex/telegram-qr-registration-entry
Bundle: admin/dist-site
```

Local validation:

```text
npm run admin:site:build  -> passed
npm run admin:site:verify -> passed
```

Nginx preflight:

```text
/etc/nginx/sites-enabled/proxy-gateway-public.conf
  /api/health       -> proxy_pass http://127.0.0.1:3456
  /sub/clash.yaml   -> proxy_pass http://127.0.0.1:3456
  /sub/a/           -> proxy_pass http://127.0.0.1:3456 with redacted artifact log format
  /api/admin/       -> return 404
  HTTPS /           -> return 404 before this deployment
```

## Execution

Archive:

```text
local:  C:\Users\g\AppData\Local\Temp\globalcircle-site-20260528T173730.tar.gz
remote: /tmp/globalcircle-site-20260528T173730.tar.gz
sha256: 0A8F6DF707B677452A733793B6CC3F0610FBDAED8FBB3E0571D77C2B31E48D2C
```

Remote release:

```text
/var/www/globalcircle-site/releases/20260528T173730
/var/www/globalcircle-site/current -> releases/20260528T173730
```

Nginx change:

```text
Only the HTTPS server block root location was changed from return 404 to:

location / {
    root /var/www/globalcircle-site/current;
    try_files $uri $uri/ /index.html;
}
```

Backup:

```text
/root/proxy-gateway-backups/public-site-20260528T173730/proxy-gateway-public.conf.before.content
/root/proxy-gateway-backups/public-site-20260528T173730/globalcircle-site.before.txt
```

## Validation

```text
nginx -t -> passed
systemctl reload nginx -> passed
```

Public checks:

```text
https://sub.globalcirclecat.com/                     -> 200
title                                                -> GlobalCircle AI - 智能体研发与增长自动化
public JS asset                                      -> 200
public CSS asset                                     -> 200
root HTML contains GlobalCircle marker               -> true
root HTML contains Telegram/TG/bot registration text -> false
root HTML contains Admin bundle markers              -> false
https://sub.globalcirclecat.com/api/health           -> 200
https://sub.globalcirclecat.com/api/admin/...        -> 404
https://sub.globalcirclecat.com/sub/clash.yaml       -> 401 without token
https://sub.globalcirclecat.com/sub/a/__placeholder__ -> 404
http://sub.globalcirclecat.com/                      -> 404 unchanged
```

## Not Performed

- No DNS change.
- No public Admin deployment.
- No normal `admin/dist` deployment.
- No proxy-gateway restart.
- No subscription state mutation.
- No edge traffic activation.
- No AWS mutation.
- No unrelated node mutation.
- No public lead-intake runtime activation.

## Follow-Up

The static site is reachable. The public contact form backend path is not active
through production Nginx at this gate; `POST /api/public/leads` currently returns
405 because only the static-site root was authorized and deployed. Activating
public lead intake needs a separate gate covering the runtime route and Nginx
proxy boundary.

## Rollback

Restore the backup Nginx config and previous static directory state:

```bash
cp -f /root/proxy-gateway-backups/public-site-20260528T173730/proxy-gateway-public.conf.before.content \
  /etc/nginx/sites-available/proxy-gateway-public.conf
nginx -t
systemctl reload nginx
```

If a previous `/var/www/globalcircle-site` archive exists in a future rollback,
restore it from the matching backup directory and repoint
`/var/www/globalcircle-site/current` to the intended release.
