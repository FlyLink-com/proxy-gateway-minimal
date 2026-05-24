# Subscription Opaque Access Model Gap

Last updated: 2026-05-24, Asia/Shanghai.

> Status:
> - Type: Active gap record
> - Risk: C for this document; A for production activation or endpoint
>   migration
> - Execution authority: Does not authorize production activation, Nginx
>   changes, DNS changes, HTTPS issuance, deployment, tenant artifact issuance,
>   legacy endpoint removal, or traffic-accounting enforcement
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

## Gap Summary

### 1. Production Exposure Is Not Activated

`GET /sub/a/:artifact` exists at the Express app layer and is listed as an
app-level public prefix, but repository support is not the same as production
activation.

Current production public boundary has historically exposed only:

```text
/api/health
/sub/clash.yaml
```

Exposing `/sub/a/*` publicly remains Risk A because the path segment is a
bearer artifact. It requires an explicit Nginx and logging review before any
production gateway change.

### 2. Opaque Path Logging Is A New Secret Boundary

The old query-token model primarily needed query-string redaction. Opaque
artifact URLs move the bearer value into the path.

That means an access log format that includes raw `$uri`, full request URL, or
path segments can leak the artifact even when query strings are not logged.

Production activation must define and verify logging behavior for all layers:

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

### 3. Artifact Issuance And Migration Are Not Defined

The admin APIs can create artifacts, but there is no approved production
issuance workflow yet.

Still open:

```text
which tenants receive artifacts first
how the operator identifies one device scope
how the visible-once URL is delivered safely
how lost-device / new-device rotation is handled
how existing query-token users migrate
how rollback works if artifact refresh fails
```

Until this is approved, production users continue to depend on the existing
subscription access path.

### 4. Legacy Query-Token Access Remains Active

PR #87 intentionally kept `/sub/clash.yaml?token=...` working.

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

### 6. HTTPS Is Still A Separate Gate

Opaque artifacts should not be treated as production-ready just because the
backend route exists.

Production activation should prefer HTTPS, but HTTPS work remains separate
from the repository layer:

```text
certificate issuance
Nginx server block changes
redirect behavior
HTTP fallback decision
client compatibility checks
rollback
```

Do not bundle HTTPS issuance with artifact issuance or legacy-token retirement
without an explicit Risk A execution record.

## Recommended Next Work

Handle the remaining work as separate steps:

```text
1. Aliyun manual CI or approved clean validation for current master.
2. Risk A opaque artifact production activation runbook.
3. Risk A Nginx logging and /sub/a exposure validation.
4. Controlled artifact issuance for one operator-owned test tenant/device.
5. Client refresh validation.
6. Legacy query-token retirement plan.
7. Traffic accounting design.
```

Keep these out of the repository-level implementation PR:

```text
no DNS mutation
no Nginx mutation
no HTTPS issuance
no production deploy
no tenant migration
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
production opaque artifact access: not activated
legacy query-token access: still active
path-artifact logging posture: requires Risk A review before exposure
device-sharing enforcement: observational metadata only
```
