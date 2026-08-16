# Subscription Opaque Artifact Implementation Plan

Last updated: 2026-05-24, Asia/Shanghai.

```yaml
document_metadata:
  doc_type: canonical
  lifecycle: active
  authority_scope: subscription_opaque_artifact_implementation_plan
  superseded_by: null
  last_verified_at: 2026-05-24
  production_authority: false
```


> Status:
> - Type: Active implementation plan / implementation checklist
> - Risk: B for repository implementation; A for production activation
> - Execution authority: Does not authorize production activation, Nginx changes, DNS changes, deployment, or legacy endpoint removal
> - Production impact: None until separately approved and deployed
> - Source of truth for: First repository implementation slice for device-scoped opaque subscription artifacts

## Purpose

This plan turns `docs/SUBSCRIPTION_DEVICE_SCOPED_OPAQUE_URLS.md` into a
repository implementation path. The goal is to replace user-visible tenant
tokens with per-device opaque refresh artifacts while keeping Subscription V2
YAML generation, tenant expiry, disabled status, and operator node assignment
semantics intact.

The first implementation must be usable in local and clean validation without
changing production traffic. Production activation remains a separate Risk A
runbook because opaque paths become sensitive and require Nginx access-log,
runtime config, client migration, and rollback decisions.

## Current Facts

- Subscription V2 renderer is implemented.
- Valid default-primary tenants receive the configured V2 node set.
- Explicit non-default tenant node assignment remains an operator-only canary
  override that scopes the tenant to one node.
- Existing subscription access still resolves tenant tokens server-side and
  rejects expired or disabled tenants at token resolution time.
- Device-scoped opaque subscription URLs were documented as a design contract
  before implementation. The first repository implementation adds backend
  support only; production activation remains separate Risk A work.

## Target Behavior

The product access model should become:

```text
tenant entitlement:
  time + traffic

user-facing subscription access:
  per-device opaque refresh artifact

server-side authority:
  tenant token and tenant state remain contained on the server

renderer:
  existing Subscription V2 YAML output
```

A user should not need to see, copy, or manage a raw tenant token. Clash/Mihomo
can still refresh the subscription artifact URL. If a copied artifact appears
across suspicious device or network signals, the server can mark the artifact
for operator review, rotation, revocation, or stricter future enforcement.

## Implementation Slice

### PR 1: Repository Implementation

```text
Risk: B / compact code change
Branch: refactor/subscription-opaque-artifacts
Expected PR count: 1
Production/AWS impact: none
Validation:
  git diff --check origin/master...HEAD
  node --test server/tests/subscription-repository.test.mjs server/tests/subscription-service.test.mjs server/tests/admin-subscriptions.test.mjs
  npm test
```

Scope:

- Add a `subscription_artifacts` SQLite table in repository initialization.
- Add repository methods for creating, finding, listing, revoking, rotating,
  and recording refresh metadata for artifacts.
- Add store-contract entries for the new repository methods.
- Add core methods for artifact creation, listing, revoke, rotate, and resolve.
- Add a public artifact refresh route that accepts an opaque path, not a query
  token.
- Add admin APIs to create visible-once artifacts, list non-secret artifact
  summaries, revoke artifacts, and rotate artifacts.
- Keep legacy token-based subscription route working.
- Keep Subscription V2 renderer behavior unchanged.

Non-goals:

- No production deployment.
- No Nginx change.
- No DNS or HTTPS change.
- No legacy endpoint removal.
- No traffic quota enforcement.
- No public self-service portal.
- No mixed protocol or DPI bypass renderer.
- No customer-data export.

## Schema Direction

The repository can create the table during normal SQLite initialization. This is
acceptable for a B-tier repository implementation because it is not deployed to
production by the PR itself. Production rollout of the schema remains Risk A.

Conceptual fields:

```text
id
tenant_id
artifact_secret_hash
artifact_prefix
status
created_at
first_seen_at
last_seen_at
rotated_at
revoked_at
bound_ip_prefix_hash
bound_user_agent_hash
recent_ip_hashes_json
recent_user_agent_hashes_json
refresh_count
updated_at
```

Rules:

- Store only hashes for artifact secrets and device/network signals.
- Store a short non-secret prefix for admin display and support workflows.
- Do not store raw artifact URLs.
- Do not store raw tenant tokens.
- Do not store raw client IPs or raw User-Agent strings.
- Use `active`, `suspicious`, `revoked`, and `rotated` statuses in the data
  model, even if the first implementation only enforces `active`, `revoked`,
  and `rotated`.

## Route Direction

The first code PR should add a dedicated artifact refresh route with no query
token. The exact path can be repository-local and does not need to be the final
production Nginx path.

Example semantics:

```text
GET /sub/a/:artifact
```

Behavior:

- Unknown artifact: generic not-found response.
- Revoked or rotated artifact: gone response.
- Tenant disabled: forbidden response.
- Tenant expired: forbidden response.
- Valid artifact: render current Subscription V2 YAML for the tenant.
- Refresh metadata: update last seen, refresh count, and hashed device signals.

The route must not return tenant ids, token hashes, raw tokens, or raw artifact
secrets in responses.

## Admin Direction

Admin APIs should be operator-only and protected by the existing admin route
boundaries.

First PR endpoints:

```text
POST /api/admin/subscriptions/:id/artifacts
GET /api/admin/subscriptions/:id/artifacts
POST /api/admin/subscription-artifacts/:id/revoke
POST /api/admin/subscription-artifacts/:id/rotate
```

Semantics:

- Create returns the full artifact URL once.
- List returns only non-secret summaries.
- Revoke disables the artifact without changing tenant status.
- Rotate creates a replacement artifact and marks the old artifact rotated.
- Artifact operations must not change subscription URL/token semantics for
  other artifacts or tenants.

## Device Signal Direction

The first implementation should collect signals conservatively and avoid hard
blocking normal mobile or ISP churn.

Allowed first-pass signals:

- IP prefix hash.
- User-Agent hash.
- First seen timestamp.
- Last seen timestamp.
- Refresh count.
- Recent hashed IP/User-Agent set size.

First-pass enforcement:

- Revoke and rotate are explicit operator actions.
- Suspicious state can be recorded if the signal set changes unusually, but it
  should not block by default unless the implementation includes a focused test
  and explicit product decision.

## Test Contract

Repository tests:

- Creates artifacts with hashed secret and display prefix.
- Finds active artifact by raw artifact secret.
- Does not expose raw artifact secret in list output.
- Revokes artifact and prevents active resolution.
- Rotates artifact and links replacement behavior if implemented.
- Records refresh metadata without storing raw IP or raw User-Agent.

Core tests:

- Valid artifact resolves to Subscription V2 YAML config.
- Expired tenant through artifact returns the existing expired behavior.
- Disabled tenant through artifact returns the existing disabled behavior.
- Revoked artifact is rejected.
- Rotated artifact is rejected or redirected only if explicitly implemented.
- Legacy token-based subscription route still works.
- Operator node assignment behavior remains unchanged.

Route tests:

- Artifact route does not accept query token fallback.
- Unknown artifact response is generic.
- Valid artifact returns Clash YAML.
- Public route does not leak tenant id, token, or raw artifact secret.
- Admin create returns visible-once URL.
- Admin list returns only artifact summaries.
- Admin revoke and rotate require admin auth.

Regression tests:

- Existing Subscription V2 multi-node output stays unchanged.
- Explicit tenant node assignment still scopes output to the selected node.
- Temp-link behavior remains unchanged.

## Production Activation Gates

Production activation is not part of the B-tier implementation PR. It requires
a separate Risk A plan and approval because opaque artifact paths are sensitive.

Required gates:

- Decide final public artifact host/path shape.
- Review Nginx access-log format because `$uri` can expose opaque artifact
  paths.
- Decide whether to suppress, hash, or isolate artifact path logs.
- Validate public boundary for artifact refresh route.
- Decide whether legacy query-token subscriptions remain enabled during the
  migration window.
- Generate or rotate artifacts for production tenants.
- Provide rollback from artifact refresh back to legacy token refresh.
- Validate Clash/Mihomo refresh behavior without recording raw artifact URLs in
  docs or chat.

## Open Decisions For Implementation

- Exact local route prefix for artifact refresh.
- Whether first-pass suspicious detection is record-only or blocks.
- Whether rotation should return a replacement URL in the same response or use
  a separate create flow.
- Whether artifact summaries need a dedicated audit event table in PR 1 or can
  use the existing subscription audit event model first.
- Whether artifact URL generation uses the existing public base URL setting or
  a new artifact-specific base URL setting.

## Recommended Next Step

The B-tier implementation PR should remain bounded to repository behavior and
tests:

```text
Branch: refactor/subscription-opaque-artifacts
Goal: implement repository-backed opaque subscription artifacts with tests
```

Do not deploy or activate the feature in production until a separate Risk A
activation plan approves Nginx logging, public boundary, tenant migration, and
rollback.
