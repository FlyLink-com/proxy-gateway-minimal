# Subscription Opaque Access Model Gap

Last updated: 2026-05-24, Asia/Shanghai.

> Status:
> - Type: Active gap record
> - Risk: C for this document; A for production activation or endpoint
>   migration
> - Execution authority: Does not authorize additional production activation,
>   Nginx changes, DNS changes, HTTPS issuance, deployment, tenant artifact
>   issuance, legacy endpoint removal, or traffic-accounting enforcement
> - Production impact: None
> - Source of truth for: Remaining access-model gaps after the repository-level
>   opaque subscription artifact layer

## Purpose

PR #87 added the repository-level opaque subscription artifact layer. That work
gives the application the backend primitives for per-device opaque subscription
artifacts, but it does not complete the production access model.

This document records the gap between:

```text
implemented repository capability
```

and:

```text
safe production subscription access model
```

Use it before planning HTTPS, Nginx exposure, legacy query-token retirement,
artifact issuance, traffic accounting, or client migration.

## Implemented After PR #87

The repository now supports:

```text
subscription_artifacts SQLite table
hashed artifact secret storage
admin create / list / revoke / rotate artifact APIs
visible-once artifact URL returns for create and rotate
non-secret artifact summaries for list responses
public app-level GET /sub/a/:artifact refresh route
artifact refresh metadata using hashed IP-prefix and User-Agent signals
tenant expiry / disabled checks during artifact resolution
Subscription V2 YAML rendering for valid artifacts
legacy /sub/clash.yaml token route preserved
```

The app-level opaque artifact route does not accept query-token fallback. Blank
or whitespace artifact values return not found rather than an internal error.

## Production Canary Status

The 2026-05-24 `prod-edge-a` opaque artifact production canary exposed
`/sub/a/*` through the production Nginx gateway, migrated
`PUBLIC_SUBSCRIPTION_BASE_URL` to `https://sub.globalcirclecat.com`, created
one active artifact for the active tenant, and validated that the resulting
HTTPS artifact URL renders Subscription V2 YAML.

This was a canary only. It did not retire `/sub/clash.yaml?token=...`, rotate
tenant tokens, issue artifacts to all tenants, add user self-service, or enforce
traffic/device-abuse policy.

After the operator confirmed the canary import worked, the active tenant's
primary legacy token was reset and the active tenant's remaining temporary
`pgtmp_` links were expired. That drained the known active-tenant legacy links
without removing the `/sub/clash.yaml` route or future query-token support.

## Gap Summary

### 1. Production Exposure Is Activated For One Canary Artifact

`GET /sub/a/:artifact` exists at the Express app layer and is listed as an
app-level public prefix. It is now also exposed through the production Nginx
gateway on `prod-edge-a` for canary validation.

Current production public boundary exposes:

```text
/api/health
/sub/clash.yaml
/sub/a/*
```

Further artifact issuance, migration, or endpoint retirement remains Risk A
because the path segment is a bearer artifact.

### 2. Opaque Path Logging Is A New Secret Boundary

The old query-token model primarily needed query-string redaction. Opaque
artifact URLs move the bearer value into the path.

That means an access log format that includes raw `$uri`, full request URL, or
path segments can leak the artifact even when query strings are not logged.

Production canary logging behavior has been updated for Nginx:

```text
/sub/a/* uses proxy_gateway_artifact
logged request target is /sub/a/[redacted]
```

The initial canary validation found raw artifact path exposure in the access log
before the artifact-specific log format was installed. The proxy gateway access
log was truncated during the same execution record to remove that raw path.

Future production activation must continue to verify logging behavior for all
layers:

```text
Nginx access log
Nginx error log
application logs
reverse-proxy diagnostics
incident records
CI / validation logs
operator chat or PR comments
```

Do not paste raw artifact URLs into docs, PRs, chat, CI logs, or incident
records.

### 3. Artifact Issuance And Migration Are Only Defined For Canary

The admin APIs can create artifacts, and one production canary artifact has
been issued to the active tenant. There is still no approved all-tenant
migration workflow.

Still open:

```text
which additional tenants receive artifacts
how the operator identifies each device scope
how the visible-once URL is delivered safely
how lost-device / new-device rotation is handled
how existing query-token users migrate
how rollback works if artifact refresh fails
```

Until this is approved, production users continue to depend on the existing
subscription access path.

### 4. Legacy Query-Token Access Remains Active

PR #87 intentionally kept `/sub/clash.yaml?token=...` working.

The active tenant's known old primary and temporary links have been drained
after opaque canary validation, but the route itself remains available for any
future generated legacy token until a separate route-retirement plan is
approved.

Legacy query-token retirement is not safe until all of these are true:

```text
opaque artifact production route is exposed and validated
artifact logging posture is verified
artifacts have been issued to the target tenants
client refresh behavior is tested
rollback path is documented
support process for new devices is defined
```

Removing or blocking the legacy route remains separate Risk A production access
work.

### 5. Device Binding Is Observational, Not Enforcement

The repository layer records hashed refresh metadata, but it does not implement
a full abuse policy.

Current capability:

```text
store hashed IP-prefix signal
store hashed User-Agent signal
track artifact refresh metadata
operator can revoke or rotate artifacts
```

Not implemented yet:

```text
automatic multi-IP abuse classification
automatic suspicious-state transition policy
automatic blocking based on device signal drift
customer-facing recovery or reissue flow
traffic quota enforcement
tenant-level data-plane accounting
```

This is intentional for the first repository slice. Hard blocking based on IP
or User-Agent churn can break legitimate mobile, broadband, NAT, or VPN users.

### 6. HTTPS Is Enabled, But Migration Work Remains Separate

HTTPS is enabled for `sub.globalcirclecat.com` on `prod-edge-a`, and the canary
runtime base URL has been migrated to `https://sub.globalcirclecat.com`.

Still separate:

```text
HTTP-to-HTTPS redirect behavior
all-tenant artifact issuance
legacy query-token retirement
client migration window
rollback from artifact access
```

Do not bundle legacy-token retirement or all-tenant artifact issuance without an
explicit Risk A execution record.

## Recommended Next Work

Handle the remaining work as separate steps:

```text
1. Operator validation of the canary artifact URL in Clash/Mihomo.
2. Legacy query-token retirement plan.
3. Additional artifact issuance / rotation workflow.
4. Traffic accounting design.
5. Device-abuse observation and operator review policy.
```

Keep these out of the repository-level implementation PR:

```text
no DNS mutation
no further Nginx mutation
no additional production deploy
no all-tenant artifact issuance
no raw artifact URL recording
no legacy endpoint removal
no traffic quota enforcement
```

## Decision

The repository now has the opaque artifact primitives needed for the next
subscription access model, but the access model is not closed.

The current safe statement is:

```text
opaque artifact backend support: implemented
legacy query-token access: still active
production opaque artifact access: canary activated
active tenant known legacy links: drained
path-artifact logging posture: artifact path is redacted in Nginx access log
device-sharing enforcement: observational metadata only
```
