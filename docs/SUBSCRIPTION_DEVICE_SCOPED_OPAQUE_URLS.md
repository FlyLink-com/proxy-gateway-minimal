# Device-Scoped Opaque Subscription URLs

Last updated: 2026-08-16.

```yaml
document_metadata:
  doc_type: canonical
  lifecycle: active
  authority_scope: device_scoped_opaque_subscription_urls
  superseded_by: null
  last_verified_at: 2026-08-16
  production_authority: false
```


> Status:
> - Type: Active design contract
> - Risk: C for this document, B for code implementation, A for production
>   activation
> - Execution authority: Does not authorize code deployment, production config
>   changes, DNS changes, Nginx changes, HTTPS issuance, node migration, tenant
>   migration, or traffic cutover
> - Production impact: None until separately approved
> - Source of truth for: the next subscription access model after Subscription V2

## Purpose

Subscription V2 changes what a valid subscription returns: it can emit a
platform-approved multi-node edge set while preserving tenant entitlement
semantics.

This document defines the next access model for how a user imports and refreshes
that subscription.

The product goal is:

```text
subscription entry remains stable for a device
tenant token does not leave the server
user-facing URL looks opaque
the same URL can refresh in Clash/Mihomo
operators can detect sharing or abuse
subscription YAML can change dynamically over time
```

## Problem

Clash/Mihomo subscriptions are import URLs. After import, clients keep the URL
and use it for later refreshes. If the URL is a bearer secret, whoever gets the
URL can reuse it.

The current MVP model is good enough for initial production validation, but it
has product weaknesses:

- the subscription URL exposes a semantic path and query-style credential shape;
- the user can copy the stored URL out of the client;
- one shared URL can spread across devices or networks;
- node output can be updated, but access abuse is not yet device-aware.

The desired product model is not a one-time download link. A one-time link would
break normal Clash/Mihomo refresh behavior.

## Core Decision

Use device-scoped opaque subscription artifacts.

Each device receives an opaque subscription URL that is itself the product
artifact. The URL can refresh, but it belongs to one device scope. The server
maps the opaque host and path to a stored artifact record, then resolves the
artifact to the tenant and renders the current dynamic Subscription V2 YAML.

Tenant tokens stay server-side and are never embedded in the user-visible URL.

## Implementation Status

Repository-level backend support now exists for the first implementation slice:

```text
admin create/list/revoke/rotate artifact APIs
SQLite-backed artifact records with hashed artifact secrets
public app-level /sub/a/:artifact refresh route
server-side tenant resolution and Subscription V2 YAML rendering
basic hashed device-signal metadata collection
```

One production canary artifact is now active on `prod-edge-a` for controlled
operator validation. The canary exposes `/sub/a/*` through Nginx, uses
`https://sub.globalcirclecat.com`, and redacts artifact paths in the Nginx
access log. Broader artifact issuance, legacy URL deprecation, user migration,
traffic enforcement, and abuse-response policy remain separate Risk A work.

Repository-level platform access grant support now also exists for the Aliyun
Subscription Control Platform MVP path:

```text
protected Admin-only dynamic-entry access grant creation
in-memory access grant summaries linked to account and entitlement shells
visible-once posture and dynamic-entry / artifact presence flags
raw portal URL, artifact reference, and subscription URL redaction in summaries
```

This dynamic-entry shell is not a public resolver and is not a customer-facing
login endpoint. It represents operator-issued metadata only, behind the
protected Admin API boundary. Production activation, persistence, public portal
resolution, DNS, Nginx, HTTPS, logging review, state copy, and user traffic
remain separate Risk A gates.

## URL Model

The product URL should look like an opaque artifact, not a semantic API route.

Example shape:

```text
http://<opaque-host>/<opaque-path>.yaml
```

Properties:

- no query token;
- no tenant id;
- no provider, region, node, tier, or cloud hint;
- no human-meaningful path segment;
- raw URL is shown only at creation time;
- the stored server-side value is a hash, not the raw artifact secret.

The opaque host can be a random label under an approved subscription domain, or
the host can remain stable while the path carries the artifact secret. The final
production choice depends on DNS and Nginx logging constraints.

## Refresh Model

The opaque URL must remain refreshable.

Normal flow:

```text
Clash/Mihomo
  -> GET opaque subscription artifact URL
  -> server resolves host + path hash
  -> server checks artifact, tenant, expiry, and abuse state
  -> server renders current Subscription V2 YAML
  -> client updates nodes without changing the imported URL
```

Dynamic YAML is allowed and expected:

- node list can add or remove approved production nodes;
- node order can change;
- node labels stay provider-neutral;
- node hostnames can move through DNS or runtime config;
- expired or disabled tenants remain blocked at resolution time.

In the account subscription model, an opaque artifact is part of the current
delivery generation, not the account subscription itself. Portal reissue keeps
the active artifact URL stable by default and rotates only the protected runtime
material / delivery generation behind it. The account, order, entitlement, and
usage accounting anchor stay stable. Artifact rotation is reserved for leakage,
abuse, device rebind, or operator-controlled revocation. The broader lifecycle
boundary lives in `docs/ACCOUNT_RESOURCE_DELIVERY_LIFECYCLE.md`.

## Device Binding

Device binding is heuristic, not cryptographic.

The first successful refresh can establish an observed device profile:

```text
ip prefix hash
user-agent hash
first-seen timestamp
last-used timestamp
request frequency
recent ip-prefix count
recent user-agent count
```

The system should allow normal network churn. Mobile networks, home broadband,
VPNs, and ISP NAT can legitimately change IPs. The first implementation should
avoid hard blocking on one IP change.

Suggested policy:

- one or two recent IP prefixes can remain normal;
- multiple unrelated IP prefixes within a short window becomes suspicious;
- multiple user-agent hashes for one artifact becomes suspicious;
- high refresh frequency becomes suspicious or rate-limited;
- suspicious artifacts can continue temporarily, be marked for operator review,
  or require rotation depending on the approved policy;
- revoked artifacts return a terminal response and require issuing a new
  device artifact.

## Artifact States

Recommended states:

```text
active
suspicious
revoked
rotated
expired
```

State semantics:

- `active`: refresh is allowed.
- `suspicious`: refresh can be allowed, rate-limited, or reviewed depending on
  policy.
- `revoked`: refresh is denied; generate a new artifact for a new device.
- `rotated`: old artifact no longer works because a replacement was issued.
- `expired`: artifact is no longer valid independent of tenant status.

Tenant lifecycle remains separate:

- tenant `disabled` remains operator-driven;
- tenant `expired` remains computed from tenant expiry;
- artifact revocation does not change tenant status;
- tenant expiry or disable blocks all artifacts for that tenant.

## Response Contract

The first implementation should use a small, deterministic response contract:

| Case | Response |
| --- | --- |
| Valid active artifact and tenant | `200` with Clash/Mihomo YAML |
| Unknown artifact | `404` or generic unauthorized response |
| Tenant expired or disabled | `403` |
| Artifact revoked or rotated | `410` |
| Abuse or high-frequency refresh | `429` or `403`, depending on policy |

Do not return details that let an attacker distinguish tenant existence,
artifact status internals, or node inventory.

## Logging And Secret Handling

The opaque URL is a bearer artifact. Host and path may both be sensitive.

Required logging posture:

- do not log raw artifact host labels;
- do not log raw artifact path segments;
- do not log full request URLs;
- do not log query strings;
- record only internal artifact id, short non-secret prefix, status, timestamps,
  and summarized risk decisions;
- do not paste raw artifact URLs into PRs, docs, chat, incident records, or CI
  logs.

This is stricter than the current query-token model. With path-based artifacts,
an Nginx `$uri` access log can leak the artifact. Production activation must
therefore include an explicit Nginx/app logging review before exposing opaque
artifact URLs.

## Conceptual Data Model

The first repository implementation uses a `subscription_artifacts` table with
the same containment principle as this conceptual model: raw artifact secrets,
raw IPs, and raw User-Agent values are not stored. The production activation
schema and migration gate still require separate Risk A approval.

Conceptual model:

```text
subscription_artifacts
  id
  tenant_id
  host_label_hash
  path_slug_hash
  display_prefix
  status
  created_at
  first_seen_at
  last_used_at
  rotated_at
  revoked_at
  bound_ip_prefix_hash
  bound_user_agent_hash
  recent_ip_prefix_count
  recent_user_agent_count
  refresh_count
```

Optional later audit/event storage:

```text
subscription_artifact_events
  artifact_id
  event_type
  event_time
  ip_prefix_hash
  user_agent_hash
  summary
```

The first code PR should choose the smallest schema that can support one device
artifact per tenant and abuse-state tracking without introducing external
dependencies.

## Admin Model

Operator actions:

- create a device-scoped artifact for a tenant;
- show the raw artifact URL once;
- list artifacts by tenant using non-secret display prefixes;
- revoke an artifact;
- rotate an artifact and invalidate the old one;
- inspect summarized abuse signals without exposing raw URLs.

Non-goals:

- no public self-service portal in the first implementation;
- no payment or renewal flow;
- no customer-facing account login model;
- no traffic quota enforcement in this access-layer design.

## Migration Model

Keep the existing subscription endpoint during migration.

Recommended sequence:

1. Implement artifact service and tests without production activation.
2. Add operator-only artifact creation and revocation.
3. Validate opaque artifact refresh locally and in a clean validation
   environment.
4. Approve production Nginx/logging changes separately.
5. Generate a device-scoped artifact for controlled test users.
6. Migrate active users gradually.
7. Deprecate legacy query-token URLs only after client behavior is verified.

Do not invalidate existing users by default. Legacy subscription URLs should be
phased out through controlled rotation, not a surprise hard cut.

## Risk Classification

Design document:

```text
Risk: C / docs-only
Validation:
  git diff --check origin/master...HEAD
Production impact:
  none
```

First implementation:

```text
Risk: B or A depending on schema/auth boundary
Likely B if:
  - schema is local SQLite-only and covered by migration tests;
  - endpoint is admin-only;
  - no production runtime is changed;
  - legacy subscription behavior remains unchanged.
Likely A if:
  - public subscription route behavior changes;
  - auth model changes;
  - Nginx logging changes are required;
  - production activation is included.
```

Production activation:

```text
Risk: A
Requires:
  - production logging review;
  - Nginx/public route review;
  - rollback plan to existing subscription endpoint;
  - operator approval;
  - validation with a real Clash/Mihomo import and refresh cycle;
  - no raw artifact URL recorded in docs or chat.
```

## Open Decisions

These must be resolved before production activation:

- random subdomain plus random path, or stable host plus random path;
- suspicious artifact behavior: allow with review, rate-limit, or block;
- production Nginx logging posture for path-based bearer artifacts;
- production artifact issuance and client migration window;
- how long legacy query-token URLs remain supported.

## First Implementation Candidate

Repository implementation task:

```text
Branch: refactor/subscription-opaque-artifacts
Risk: B / compact code change with A production activation boundary
Goal:
  Add backend support for device-scoped opaque subscription artifacts while
  preserving the current legacy subscription endpoint.
Validation:
  git diff --check origin/master...HEAD
  targeted subscription artifact tests
  npm test
Production/AWS impact:
  none
```

Hard boundary:

```text
No DNS mutation
No Nginx mutation
No HTTPS issuance
No production deploy
No production artifact creation
No legacy URL removal
No self-service portal
No traffic quota enforcement
```
