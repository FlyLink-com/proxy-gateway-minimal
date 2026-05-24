# Production Replacement: Opaque Artifact Production Canary

Date: 2026-05-24 22:30-22:48 +08:00

Branch: `ops/opaque-artifact-production-canary`

Related records:

- `docs/production-replacement-records/2026-05-24-prod-edge-a-production-activation.md`
- `docs/production-replacement-records/2026-05-24-prod-edge-a-https-issuance.md`
- `docs/SUBSCRIPTION_DEVICE_SCOPED_OPAQUE_URLS.md`
- `docs/SUBSCRIPTION_OPAQUE_IMPLEMENTATION_PLAN.md`
- `docs/SUBSCRIPTION_OPAQUE_ACCESS_MODEL_GAP.md`

Approval:

```text
批准
```

The approval followed the operator request to generate a new opaque
subscription import link for controlled replacement testing before retiring
legacy access.

## Scope

This record covers the approved production canary on `prod-edge-a`:

- deploy current `master` server code containing the opaque artifact route;
- expose `/sub/a/*` through the production Nginx gateway;
- keep `https://sub.globalcirclecat.com` as the artifact base URL;
- create one active opaque artifact for the active production tenant;
- deliver the full import URL only to a local protected file;
- validate that the artifact URL renders Subscription V2 YAML;
- align tracked Nginx templates with artifact-path log redaction.

This operation did not perform:

- DNS mutation;
- AWS mutation;
- forced HTTP-to-HTTPS redirect;
- tenant token reset or rotation;
- legacy `/sub/clash.yaml?token=...` removal;
- all-tenant artifact issuance;
- production tenant migration;
- `prod-edge-b` mutation;
- legacy-blue mutation;
- traffic quota enforcement;
- device-abuse automatic blocking;
- user portal work;
- secret, token, raw subscription URL, raw artifact path, SQLite content, AWS
  credential, private key, or customer-data recording in docs, PRs, chat, or
  incident notes.

## Pre-Canary State

Production gateway:

```text
prod-edge-a -> 13.215.156.159
sub.globalcirclecat.com -> prod-edge-a
HTTPS -> enabled, no automatic redirect
legacy query-token route -> active
opaque artifact backend support -> implemented in repository
production /sub/a/* Nginx exposure -> not active before this canary
```

The active production database path was verified from `prod-edge-a` runtime
configuration:

```text
SUBSCRIPTION_DB_PATH -> /opt/proxy-gateway-minimal/.proxy-gateway/subscriptions.sqlite
SQLite integrity_check -> ok
subscription_artifacts table -> present
```

The active tenant was already assigned to `prod-edge-a`; no tenant node fix was
required.

## Deployment And Runtime Changes

Server code was refreshed on `prod-edge-a` from current `master` so the running
process included:

```text
PUBLIC_PATH_PREFIXES -> /sub/a/
GET /sub/a/:artifact
```

Backup retained on `prod-edge-a`:

```text
/opt/proxy-gateway-minimal/deploy-backups/code-before-opaque-20260524T143000Z.tgz
```

Runtime config and Nginx backups retained on `prod-edge-a`:

```text
/opt/proxy-gateway-minimal/.env.before-opaque-20260524T143700Z
/etc/nginx/sites-available/proxy-gateway-public.conf.before-opaque-20260524T143700Z
/etc/nginx/sites-available/proxy-gateway-public.conf.before-artifact-log-redaction-20260524T144500Z
```

Production runtime config was updated to:

```text
PUBLIC_SUBSCRIPTION_BASE_URL=https://sub.globalcirclecat.com
```

Nginx was updated to proxy:

```text
/sub/a/* -> 127.0.0.1:3456
```

Service actions:

```text
proxy-gateway-console.service -> restarted
nginx -t -> ok
nginx -> reloaded
```

## Artifact Creation

One opaque subscription artifact was created for the active production tenant
through the loopback admin API using the production console token. The console
token was loaded locally on the server and was not printed or recorded.

Created artifact:

```text
artifact id -> artifact_5d316489-92fe-40f1-900a-445872869318
tenant -> active production tenant
status -> active
base host -> sub.globalcirclecat.com
base path -> /sub/a/
```

The raw artifact secret, raw artifact path, and full subscription URL are not
recorded in this repository.

The full import URL was copied only to the local workstation file:

```text
C:\tmp\prod-edge-a-opaque-subscription-url-20260524T143100Z.txt
```

Local file access was restricted to the current Windows user. The remote
temporary URL file was deleted after transfer.

## Validation

Artifact URL validation, without recording the URL:

```text
GET opaque artifact URL -> 200
content-type -> application/x-yaml; charset=utf-8
YAML contains -> prod-edge-a
YAML contains -> prod-edge-b
YAML contains legacy blue -> no
```

Public boundary after canary:

```text
GET https://sub.globalcirclecat.com/api/health -> 200
GET https://sub.globalcirclecat.com/sub/a/not-real.yaml -> 404
GET https://sub.globalcirclecat.com/sub/clash.yaml without token -> 401
GET https://sub.globalcirclecat.com/api/admin/subscriptions -> 404
GET http://sub.globalcirclecat.com/api/health -> 200
```

Runtime health:

```text
proxy-gateway-console.service -> active
proxy-gateway-ss.service -> active
nginx -> active
nginx -t -> ok
SQLite integrity_check -> ok
created artifact refresh_count -> 2
```

## Log Redaction Remediation

During the first canary validation, the active Nginx log format still logged
the raw `$uri`, which can expose the opaque artifact secret because the bearer
value is now in the path.

Observed before remediation:

```text
/sub/a/ path entries in proxy gateway access log -> 2
```

Immediate remediation:

- installed an artifact-specific Nginx access-log format;
- configured `/sub/a/*` to use that format;
- validated `nginx -t`;
- reloaded Nginx;
- truncated the proxy gateway access log to remove the raw canary artifact path.

Current artifact log behavior:

```text
location ^~ /sub/a/ -> access_log proxy_gateway_artifact
logged request target -> /sub/a/[redacted]
raw artifact path in access log -> 0
token= query count in access log -> 0
```

Raw access-log lines were not copied into this record.

## Cleanup

Removed remote temporary files from `prod-edge-a`:

```text
/tmp/prod-edge-a-opaque-subscription-url-20260524T143100Z.txt
/tmp/proxy-gateway-artifact-summary-20260524T143100Z.json
/tmp/proxy-gateway-prod-edge-a-current-master-c70fd89.tar
/tmp/proxy-gateway-deploy-20260524T143000Z
```

Removed local deployment archive:

```text
C:\tmp\proxy-gateway-prod-edge-a-current-master-c70fd89.tar
```

Retained local operator handoff file:

```text
C:\tmp\prod-edge-a-opaque-subscription-url-20260524T143100Z.txt
```

Do not commit, paste, or upload that file.

## Rollback Notes

Rollback requires separate explicit Risk A approval.

Possible rollback steps:

```bash
sudo install -m 0600 -o root -g root \
  /opt/proxy-gateway-minimal/.env.before-opaque-20260524T143700Z \
  /opt/proxy-gateway-minimal/.env

sudo install -m 0644 -o root -g root \
  /etc/nginx/sites-available/proxy-gateway-public.conf.before-opaque-20260524T143700Z \
  /etc/nginx/sites-available/proxy-gateway-public.conf

sudo nginx -t
sudo systemctl reload nginx
sudo systemctl restart proxy-gateway-console.service
```

If the canary artifact must be disabled, revoke it through the admin artifact
API or SQLite-backed store path under a separately approved execution record.
Do not rotate tenant tokens or remove the legacy query-token route as part of a
canary rollback unless separately approved.

## Current State After Canary

```text
HTTPS subscription gateway -> enabled
PUBLIC_SUBSCRIPTION_BASE_URL -> https://sub.globalcirclecat.com
/sub/a/* production Nginx exposure -> active
one opaque artifact -> active for controlled canary
legacy /sub/clash.yaml?token=... -> still active
Subscription V2 output -> prod-edge-a + prod-edge-b
artifact path logging -> redacted
all-tenant migration -> not performed
legacy query-token retirement -> not performed
traffic/device enforcement -> not implemented
```

## Follow-Up Decisions

Recommended next decisions:

```text
1. Operator imports the protected canary URL into Clash/Mihomo and validates refresh.
2. If canary works, plan legacy query-token drain / retirement.
3. Define additional artifact issuance and rotation workflow.
4. Keep traffic accounting and device-abuse enforcement as separate designs.
```
