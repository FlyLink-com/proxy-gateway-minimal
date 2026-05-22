# Domain HTTPS Runbook

## Target

- Subscription domain: `sub.globalcirclecat.com`
- AWS Singapore node: `47.129.247.102`
- HTTP app port: `127.0.0.1:3456`
- Public SS port: `18388`

## Current Status

- AWS security group `sg-04a165ec77f430ee8` allows inbound TCP `443` from `0.0.0.0/0`.
- The Singapore server has `certbot 2.9.0` and `python3-certbot-nginx` installed.
- Nginx is prepared with `server_name sub.globalcirclecat.com _;` and proxies to `127.0.0.1:3456`.
- HTTP health works when the request Host is `sub.globalcirclecat.com`.
- DNS is not yet ready: `sub.globalcirclecat.com` has no A record.

## Nginx Configuration

### Subscription Hardening Checklist

Keep `/api/admin` private at Nginx unless a specific operator source IP is configured:

```nginx
location /api/admin/ {
    return 404;
}
```

Do not expose the static console UI on the public gateway. The public site should allow only health checks and subscription fetches:

```nginx
location = /api/health {
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_pass http://127.0.0.1:3456;
}

location / {
    return 404;
}
```

When proxying subscription fetches, forward the original client address:

```nginx
location = /sub/clash.yaml {
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_pass http://127.0.0.1:3456;
}
```

Use `$uri` instead of `$request_uri` in access logs so query strings and `token=` values are not written:

```nginx
log_format proxy_gateway '$remote_addr - $remote_user [$time_local] "$request_method $uri $server_protocol" '
                         '$status $body_bytes_sent "$http_referer" "$http_user_agent"';
```

## DNS Record Required

Create this DNS record in the authoritative DNS provider for `globalcirclecat.com`:

| Type | Host | Value | TTL |
|------|------|-------|-----|
| A | `sub` | `47.129.247.102` | `600` |

Do not repoint `globalcirclecat.com` or `www.globalcirclecat.com` for this change. They currently resolve to a separate IP and may be serving other traffic.

## Verification

Run from the local workstation:

```powershell
Resolve-DnsName sub.globalcirclecat.com -Type A
curl.exe --noproxy "*" -fsS http://sub.globalcirclecat.com/api/health
```

Expected:

- DNS returns `47.129.247.102`.
- Health returns JSON with `"ok": true`.

## Certificate Issue

After DNS resolves to `47.129.247.102`, run on the Singapore server:

```bash
sudo certbot --nginx \
  -d sub.globalcirclecat.com \
  --redirect \
  --agree-tos \
  --no-eff-email \
  -m admin@globalcirclecat.com
```

Then verify:

```powershell
curl.exe --noproxy "*" -fsS https://sub.globalcirclecat.com/api/health
```

## Switch Subscription Base URL

After HTTPS works, update `/opt/proxy-gateway-minimal/.env` on the Singapore server:

```bash
sudo sed -i 's#^PUBLIC_SUBSCRIPTION_BASE_URL=.*#PUBLIC_SUBSCRIPTION_BASE_URL=https://sub.globalcirclecat.com#' /opt/proxy-gateway-minimal/.env
sudo systemctl restart proxy-gateway-console.service
```

Create or reset tenant subscription tokens so newly issued links use:

```text
https://sub.globalcirclecat.com/sub/clash.yaml?token=...
```

## Rollback

If HTTPS issuance fails before changing `PUBLIC_SUBSCRIPTION_BASE_URL`, keep using the existing HTTP subscription URL:

```text
http://47.129.247.102/sub/clash.yaml?token=...
```

If HTTPS issuance succeeds but app routing fails, remove Certbot's HTTPS edits and restore the prepared HTTP-only Nginx site:

```bash
sudo nginx -t
sudo systemctl reload nginx
```
