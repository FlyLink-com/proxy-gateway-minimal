# Aliyun Non-Website Service Cleanup Record


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: aliyun_non_website_cleanup
  superseded_by: null
  last_verified_at: 2026-06-06
  production_authority: false
```


Date: 2026-06-06, Asia/Shanghai.

This record captures the approved Aliyun cleanup that leaves only the public
website on `globalcirclecat.com` / `www.globalcirclecat.com` while moving the
user portal and subscription surfaces to the Vultr `.cloud` deployment.

No secrets, tokens, passwords, subscription URLs, private keys, raw environment
files, raw SQLite rows, raw logs, or customer data are included.

## Approval

The operator approved the cleanup with:

- Keep the official website on Aliyun.
- Redirect `portal.globalcirclecat.com` to `portal.globalcirclecat.cloud`.
- Redirect `sub.globalcirclecat.com` to `sub.globalcirclecat.cloud`.
- Stop and disable Aliyun non-website runtime services.
- Keep runtime and config material as cold backup, without deleting data
  directories.

## Changes

Aliyun Nginx was updated so:

- `globalcirclecat.com` and `www.globalcirclecat.com` continue serving the
  static public website.
- `portal.globalcirclecat.com` returns HTTP 301 to
  `https://portal.globalcirclecat.cloud`.
- `sub.globalcirclecat.com` returns HTTP 301 to
  `https://sub.globalcirclecat.cloud`.
- Public website `/api/*` paths on Aliyun return HTTP 404 instead of depending
  on the stopped Node runtime.

The following Aliyun services were stopped:

- `proxy-gateway-candidate.service`
- `mihomo-tuic.service`

`proxy-gateway-candidate.service` was disabled. `mihomo-tuic.service` was
already disabled and remained disabled.

No DNS, firewall, provider security group, payment, account generation,
subscription credential output, SQLite dump, or Vultr mutation was performed.

## Backup

Aliyun backup directory:

- `/var/backups/proxy-gateway-aliyun-cleanup/20260606T110427Z`

The backup includes the previous active Nginx files and pre-cleanup systemd
service active/enabled state markers. Runtime directories and protected state
were not deleted.

## Validation

Post-cleanup service validation:

- `nginx.service`: active, enabled.
- `proxy-gateway-candidate.service`: inactive, disabled.
- `mihomo-tuic.service`: inactive, disabled.
- Nginx config test: passed.
- Aliyun TCP 443 listener: present.
- Aliyun UDP 443 listener: absent.

Public validation:

- `https://globalcirclecat.com/`: HTTP 200.
- `https://www.globalcirclecat.com/`: HTTP 200.
- `https://portal.globalcirclecat.com/`: HTTP 301 to
  `https://portal.globalcirclecat.cloud/`.
- `https://sub.globalcirclecat.com/api/health`: HTTP 301 to
  `https://sub.globalcirclecat.cloud/api/health`.
- `https://globalcirclecat.com/api/health`: HTTP 404.
- `https://globalcirclecat.cloud/`: HTTP 200.
- `https://portal.globalcirclecat.cloud/`: HTTP 200.
- `https://sub.globalcirclecat.cloud/api/health`: HTTP 200.

DNS validation:

- `.com` records still resolve to the Aliyun IP.
- `.cloud` records resolve to the Vultr IP.

## Rollback

Rollback remains possible because active configs and service states were backed
up and runtime/state directories were preserved.

Rollback outline:

1. Restore the backed-up Nginx files from
   `/var/backups/proxy-gateway-aliyun-cleanup/20260606T110427Z`.
2. Run `nginx -t`.
3. Reload Nginx if the test passes.
4. Re-enable and start `proxy-gateway-candidate.service`.
5. Start `mihomo-tuic.service` if the data-plane path must be restored.
6. Re-run public boundary and UDP 443 validation.
