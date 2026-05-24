# Production Replacement: prod-edge-a HTTPS Preflight

Date: 2026-05-24 22:00-22:06 +08:00

Branch: `ops/prod-edge-a-https-preflight`

Related records:

- `docs/production-replacement-records/2026-05-24-prod-edge-a-production-activation.md`
- `docs/SUBSCRIPTION_OPAQUE_ACCESS_MODEL_GAP.md`
- `docs/DOMAIN_IMPLEMENTATION_RUNBOOK.md`
- `docs/PROJECT_OPERATING_MODEL.md`

## Scope

This record covers a read-only HTTPS readiness preflight for the active
production subscription gateway host:

```text
sub.globalcirclecat.com -> prod-edge-a -> 13.215.156.159
```

This preflight checked:

- DNS and public reachability;
- AWS instance and security-group state;
- current HTTP public boundary;
- Nginx active server block and log-redaction posture;
- current `443/tcp` listener state;
- Certbot and existing certificate state.

This preflight did not perform:

- Certbot installation or certificate issuance;
- Nginx config mutation;
- Nginx reload or restart;
- HTTP-to-HTTPS redirect;
- production `.env` mutation;
- production node-config mutation;
- opaque artifact activation or artifact creation;
- legacy query-token retirement;
- DNS mutation;
- AWS mutation;
- service restart;
- secret, token, raw subscription URL, SQLite data, AWS credential, private
  key, or customer-data copying or recording.

## Current Target

```text
Production instance: i-0b7791340d3fedff5
Production public IP: 13.215.156.159
Production security group: sg-0379ece0b3d305c43
Instance state: running
Instance type: t4g.small
Architecture: arm64
Private IP: 172.31.27.240
```

DNS and public reachability:

```text
sub.globalcirclecat.com:80 -> 13.215.156.159 -> reachable
ss-sg.globalcirclecat.com:18388 -> 13.215.156.159 -> reachable
sub.globalcirclecat.com:443 -> 13.215.156.159 -> not reachable
https://sub.globalcirclecat.com/api/health -> connection timeout
```

Security group ingress:

```text
80/tcp -> 0.0.0.0/0
443/tcp -> 0.0.0.0/0
18388/tcp -> 0.0.0.0/0
18388/udp -> 0.0.0.0/0
22/tcp -> operator SSH source only
```

Conclusion: AWS security-group ingress already permits `443/tcp`, but the
instance is not currently listening on `443/tcp`.

## HTTP Boundary

HTTP public boundary remained correct:

```text
GET http://sub.globalcirclecat.com/api/health -> 200
GET http://sub.globalcirclecat.com/api/admin/subscriptions -> 404
GET http://sub.globalcirclecat.com/sub/clash.yaml without token -> 401
GET http://sub.globalcirclecat.com/ -> 404
```

No raw subscription URL or token was used or recorded during this check.

## Runtime And Nginx

Service state:

```text
proxy-gateway-console.service -> active
proxy-gateway-ss.service -> active
nginx -> active
nginx -t -> ok
```

Listeners:

```text
0.0.0.0:80 -> nginx
0.0.0.0:18388 -> ss-server
127.0.0.1:3456 -> console/API
127.0.0.1:18180 -> local HTTP bridge
0.0.0.0:443 -> not listening
```

Active Nginx public gateway facts:

```text
listen 80 default_server
server_name sub.globalcirclecat.com _
access_log /var/log/nginx/proxy-gateway-access.log proxy_gateway
log_format proxy_gateway uses "$request_method $uri $server_protocol"
location = /api/health -> proxy to local console
location = /sub/clash.yaml -> proxy to local console
location ^~ /api/admin/ -> 404
location / -> 404
```

Nginx token logging posture:

```text
active nginx -T literal $request_uri hits -> none
/var/log/nginx/proxy-gateway-access.log token= count -> 0
/var/log/nginx/access.log token= count -> 0
```

Raw access-log lines were not copied into this record.

## Certificate State

```text
certbot -> missing
/etc/letsencrypt -> missing
existing certificate files -> none observed
```

Conclusion: HTTPS issuance is not ready as an immediate command execution.
The next mutating step must include an approved installation/issuance plan for
Certbot or another certificate client, plus Nginx `443` configuration and
rollback. Initial issuance should still avoid automatic redirect unless a
separate approval explicitly chooses redirect behavior.

## Readiness Conclusion

Ready:

- `sub.globalcirclecat.com` resolves to the active `prod-edge-a` public IP.
- Current HTTP production boundary is healthy.
- Security group already permits `443/tcp`.
- Nginx token-redaction posture remains clean.

Not ready for immediate HTTPS issuance:

- no `443/tcp` listener exists on the instance;
- Certbot is not installed;
- no existing `/etc/letsencrypt` certificate state exists;
- an explicit mutating approval is still required before installing a
  certificate client, changing Nginx, reloading services, or issuing a
  certificate.

Next approval phrase, if continuing:

```text
Approve HTTPS issuance for sub.globalcirclecat.com on prod-edge-a with no automatic redirect.
```

That approval must still be treated as Risk A production work and must record
the exact installation, issuance, Nginx validation, reload, endpoint
validation, and rollback steps.
