# DNS / Domain Stage 2 HTTP-Only Validation

Date: 2026-05-24 03:32:32 +08:00

```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: domain_implementation_records_2026_05_24_stage2_http_only_validation
  superseded_by: null
  last_verified_at: 2026-05-24
  production_authority: false
```

Branch: `ops/domain-stage2-http-validation`

Base commit: `4ef5800f38a39c4cf46984594406ca829d65a7a1`

Runbook: `docs/DOMAIN_IMPLEMENTATION_RUNBOOK.md`

## Scope

This record covers Gate 1 / Stage 2 HTTP-only validation for
`sub.globalcirclecat.com` on the current blue production node.

Mode:

```text
read-only validation first
```

This record checks whether the existing blue Nginx default server already
satisfies the HTTP domain public boundary after Stage 1 DNS records were
created.

This record does not authorize or perform:

- DNS mutation
- AWS mutation
- Nginx config edit or reload
- HTTPS certificate issuance
- Production `.env` change
- Production node-config change
- Service restart
- Green creation
- Cutover
- Secret, token, subscription URL, SQLite, AWS credential, or customer data copy

## Public HTTP Boundary

Command type: local `curl.exe --noproxy "*"` against
`http://sub.globalcirclecat.com`.

Results:

```text
http://sub.globalcirclecat.com/api/health -> 200
http://sub.globalcirclecat.com/api/admin/subscriptions -> 404
http://sub.globalcirclecat.com/sub/clash.yaml without token -> 401
http://sub.globalcirclecat.com/ -> 404
```

Conclusion: the existing blue Nginx default server satisfies the HTTP-only
domain public boundary for the currently approved Stage 2 checks.

## Nginx Log Redaction Check

Command type: read-only SSH inspection of Nginx config and active access-log
summary. Raw log lines were not copied into this record.

Results:

```text
log_format proxy_gateway count: 1
$request_uri occurrences in nginx -T output: 0
active access_log path: /var/log/nginx/access.log
proxy_gateway access_log path: /var/log/nginx/access.log
token query count in proxy_gateway access logs: 0
```

Conclusion: the active Nginx access log uses the `proxy_gateway` format and the
checked config does not include `$request_uri`. The active access log checked
for this record did not contain `?token=` query entries.

## Nginx Mutation Decision

No Nginx mutation was performed.

Reason: the existing blue Nginx default server already returned the expected
HTTP-only public boundary for `sub.globalcirclecat.com`, and the active log
redaction check passed.

Tracked repository templates and the production Nginx runtime can still be
aligned later if a separately approved Stage 2 implementation task requires
it. This record does not approve such a change.

## Conclusion

Stage 2 HTTP-only domain validation completed in read-only mode.

Ready to request Stage 3 HTTPS issuance approval: yes, through a separate
explicit approval only.

Not approved by this record:

- Certbot or HTTPS issuance
- HTTPS redirect behavior
- `PUBLIC_SUBSCRIPTION_BASE_URL` migration
- `config/proxy-servers.json` node host migration
- Green creation
- Production cutover
