# Production Replacement: Active Tenant Legacy Link Drain

Date: 2026-05-24 23:15-23:24 +08:00

Branch: `ops/legacy-query-token-retirement`

Related records:

- `docs/production-replacement-records/2026-05-24-opaque-artifact-production-canary.md`
- `docs/production-replacement-records/2026-05-24-prod-edge-a-https-issuance.md`
- `docs/SUBSCRIPTION_OPAQUE_ACCESS_MODEL_GAP.md`

Approval:

```text
已经导入成功过期链接进行清退
```

The approval followed the operator confirmation that the opaque artifact import
worked in Clash/Mihomo.

## Scope

This record covers a controlled active-tenant legacy credential drain:

- reset the active tenant's primary legacy subscription token;
- expire the active tenant's remaining temporary `pgtmp_` subscription links;
- keep the opaque artifact active;
- verify the operator's opaque canary URL still works;
- verify the local legacy temporary test URL no longer works.

This operation did not perform:

- DNS mutation;
- AWS mutation;
- Nginx mutation or reload;
- service restart;
- artifact rotation or revocation;
- all-tenant artifact issuance;
- `/sub/clash.yaml` route removal;
- legacy query-token route removal;
- tenant expiry change;
- tenant disable/enable action;
- `prod-edge-b` mutation;
- legacy-blue mutation;
- traffic quota enforcement;
- device-abuse automatic blocking;
- secret, token, raw subscription URL, raw artifact path, SQLite content, AWS
  credential, private key, or customer-data recording in docs, PRs, chat, or
  incident notes.

## Preflight

prod-edge-a read-only checks:

```text
proxy-gateway-console.service -> active
proxy-gateway-ss.service -> active
nginx -> active
SQLite path -> /opt/proxy-gateway-minimal/.proxy-gateway/subscriptions.sqlite
SQLite integrity_check -> ok
active production tenants -> 1 assigned to prod-edge-a
disabled tenants -> 1 unchanged
opaque artifacts -> 1 total / 1 active
```

The local legacy test file was inspected without printing the URL. It was not a
primary `pgsub_` token URL; it was a temporary `pgtmp_` link:

```text
path -> /sub/clash.yaml
token kind -> pgtmp
```

This explains why resetting the primary tenant token alone did not invalidate
that local test URL.

## Execution

### Primary Token Reset

SQLite backup retained on prod-edge-a:

```text
/opt/proxy-gateway-minimal/.proxy-gateway/backups/subscriptions-before-legacy-token-retirement-20260524T151500Z.sqlite
```

Action:

```text
POST loopback /api/admin/subscriptions/<active-tenant-id>/reset-token
```

The production console token was loaded locally on the server and was not
printed or recorded. The response body contained a newly generated legacy
subscription URL, but the URL was not printed, stored, or delivered.

Result:

```text
reset_status -> 200
SQLite integrity before -> ok
SQLite integrity after -> ok
active tenant token_prefix changed -> yes
opaque artifacts before -> 1 total / 1 active
opaque artifacts after -> 1 total / 1 active
```

### Temporary Link Expiry

SQLite backup retained on prod-edge-a:

```text
/opt/proxy-gateway-minimal/.proxy-gateway/backups/subscriptions-before-temp-link-retirement-20260524T152000Z.sqlite
```

Action:

```text
expire active tenant temporary links by setting expires_at to a past timestamp
```

Result:

```text
SQLite integrity before -> ok
SQLite integrity after -> ok
active tenant unexpired temp links before -> 2
active tenant unexpired temp links after -> 0
opaque artifacts after -> 1 total / 1 active
```

The historical temporary-link rows were retained for audit context; they were
not deleted.

## Validation

Local URL validation, without printing either URL:

```text
operator opaque artifact URL -> 200
local legacy temporary test URL -> 403
```

prod-edge-a post-drain validation:

```text
proxy-gateway-console.service -> active
proxy-gateway-ss.service -> active
nginx -> active
SQLite integrity_check -> ok
active production tenants -> 1 assigned to prod-edge-a
disabled tenants -> 1 unchanged
opaque artifacts -> 1 total / 1 active
active tenant unexpired temp links -> 0
```

## Cleanup

Temporary remote execution scripts were removed:

```text
/tmp/tmp-retire-legacy-query-token.sh
/tmp/tmp-expire-temp-links.sh
```

Temporary local execution scripts were not committed.

The local opaque artifact import URL file remains the operator handoff file:

```text
C:\tmp\prod-edge-a-opaque-subscription-url-20260524T143100Z.txt
```

The local legacy temporary test URL file was kept only long enough for
post-drain validation, returned `403`, and was then deleted locally.

## Current State After Drain

```text
opaque artifact canary -> active and validated by operator
active tenant primary legacy token -> rotated
active tenant temporary links -> expired
legacy /sub/clash.yaml route -> still present
legacy query-token route -> still present for any future generated tokens
additional artifact issuance -> not performed
legacy route removal -> not performed
traffic/device enforcement -> not implemented
```

## Follow-Up Decisions

Recommended next decisions:

```text
1. Keep the opaque artifact import URL handoff file protected; do not paste or commit it.
2. Plan broader legacy query-token retirement if no clients still depend on it.
3. Define artifact issuance / rotation policy for additional devices or tenants.
4. Keep traffic accounting and device-abuse enforcement as separate designs.
```
