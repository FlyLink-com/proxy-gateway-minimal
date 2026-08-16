# Production Replacement: prod-edge-a HTTPS Issuance


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: prod_edge_a_https_issuance
  superseded_by: null
  last_verified_at: 2026-05-24
  production_authority: false
```


Date: 2026-05-24 22:12-22:16 +08:00

Branch: `ops/prod-edge-a-https-issuance`

Related records:

- `docs/production-replacement-records/2026-05-24-prod-edge-a-https-preflight.md`
- `docs/production-replacement-records/2026-05-24-prod-edge-a-production-activation.md`
- `docs/DOMAIN_IMPLEMENTATION_RUNBOOK.md`
- `docs/SUBSCRIPTION_OPAQUE_ACCESS_MODEL_GAP.md`

Approval:

```text
批准
```

The approval followed the recommendation to issue HTTPS for
`sub.globalcirclecat.com` on `prod-edge-a` without automatic redirect.

## Scope

This record covers the approved HTTPS issuance for the active production
subscription gateway host:

```text
sub.globalcirclecat.com -> prod-edge-a -> 13.215.156.159
```

This operation performed:

- immediate preflight on `prod-edge-a`;
- backup of the active Nginx public gateway config;
- installation of Certbot and the Nginx plugin;
- certificate issuance for `sub.globalcirclecat.com`;
- Certbot Nginx deployment with `--no-redirect`;
- Nginx syntax, service, listener, endpoint, and renewal validation.

This operation did not perform:

- DNS mutation;
- AWS mutation;
- HTTP-to-HTTPS redirect;
- production `.env` mutation;
- production `config/proxy-servers.json` mutation;
- opaque artifact activation or artifact creation;
- legacy query-token retirement;
- production tenant migration;
- `prod-edge-b` carrying-instance change;
- legacy-blue cleanup;
- secret, token, raw subscription URL, SQLite data, AWS credential, private
  key, or customer-data copying or recording.

## Pre-Issuance State

Immediate checks before mutation:

```text
proxy-gateway-console.service -> active
proxy-gateway-ss.service -> active
nginx -> active
nginx -t -> ok
443 listener -> no
certbot -> missing
HTTP /api/health -> 200
```

Nginx backup created on `prod-edge-a`:

```text
/etc/nginx/sites-available/proxy-gateway-public.conf.before-https-20260524T141247Z
```

## Execution

Installed packages:

```text
certbot -> 2.9.0-1
python3-certbot-nginx -> 2.9.0-1
```

Issuance command shape:

```text
certbot --nginx -d sub.globalcirclecat.com --agree-tos --no-eff-email --no-redirect -m admin@globalcirclecat.com
```

Certificate result:

```text
Certificate name -> sub.globalcirclecat.com
Key type -> ECDSA
Domains -> sub.globalcirclecat.com
Expiry -> 2026-08-22 13:14:51+00:00
Certificate path -> /etc/letsencrypt/live/sub.globalcirclecat.com/fullchain.pem
Private key path -> /etc/letsencrypt/live/sub.globalcirclecat.com/privkey.pem
```

The private key content was not viewed, copied, or recorded.

## Post-Issuance Runtime State

Service and listener validation:

```text
proxy-gateway-console.service -> active
proxy-gateway-ss.service -> active
nginx -> active
nginx -t -> ok
443 listener -> yes
certbot.timer -> enabled / active
certbot renew --dry-run -> success
```

Nginx active config summary:

```text
listen 80 default_server
listen 443 ssl
server_name sub.globalcirclecat.com _
ssl_certificate -> /etc/letsencrypt/live/sub.globalcirclecat.com/fullchain.pem
ssl_certificate_key -> /etc/letsencrypt/live/sub.globalcirclecat.com/privkey.pem
access_log -> /var/log/nginx/proxy-gateway-access.log proxy_gateway
log_format proxy_gateway uses "$request_method $uri $server_protocol"
return 301 / return 308 -> none observed
```

Log-redaction validation:

```text
active nginx -T literal $request_uri hits -> none
/var/log/nginx/proxy-gateway-access.log token= count -> 0
/var/log/nginx/access.log token= count -> 0
```

Raw access-log lines were not copied into this record.

## Endpoint Validation

HTTP remained non-redirecting:

```text
GET http://sub.globalcirclecat.com/api/health -> 200
```

HTTPS public boundary:

```text
GET https://sub.globalcirclecat.com/api/health -> 200
GET https://sub.globalcirclecat.com/api/admin/subscriptions -> 404
GET https://sub.globalcirclecat.com/sub/clash.yaml without token -> 401
GET https://sub.globalcirclecat.com/ -> 404
```

TCP validation:

```text
sub.globalcirclecat.com:443 -> reachable
```

No raw subscription URL or token was used or recorded during validation.

## Rollback Notes

If HTTPS must be reverted, use a separate explicit Risk A approval and record:

```text
sudo cp -a /etc/nginx/sites-available/proxy-gateway-public.conf.before-https-20260524T141247Z \
  /etc/nginx/sites-available/proxy-gateway-public.conf
sudo nginx -t
sudo systemctl reload nginx
```

Do not delete certificate files, disable Certbot renewal, add redirects, change
DNS, or change production runtime config without a separately approved rollback
or follow-up execution record.

## Follow-Up Boundaries

Still not performed:

- `PUBLIC_SUBSCRIPTION_BASE_URL=https://sub.globalcirclecat.com` migration;
- opaque artifact public route exposure;
- artifact issuance or tenant migration;
- legacy `/sub/clash.yaml?token=...` drain or retirement;
- traffic accounting or device-abuse enforcement;
- forced HTTP-to-HTTPS redirect.

Each item remains separate work with its own risk classification and approval
gate.
