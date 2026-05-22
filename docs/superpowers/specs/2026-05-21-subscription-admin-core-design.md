# Subscription Admin Core Design

## Goal

Add the backend core for operator-managed subscriptions without changing the working proxy node or replacing the legacy operations console. This branch turns the current single console-token subscription endpoint into a multi-tenant subscription service backed by SQLite.

The admin React shell remains mock-only until the next integration branch. This core branch must be usable and testable through HTTP API calls.

## Current Baseline

- `server/routes/subscription.mjs` serves `GET /sub/clash.yaml` and `GET /api/subscription/status`.
- `server/services/clash-subscription.mjs` generates Clash YAML from `state.proxyConfig`.
- `server/app.mjs` protects subscription routes with the existing console auth middleware.
- The existing subscription endpoint uses the console token as the subscription token.
- Existing tests expect unauthenticated subscription fetches to return `401` and valid console-token fetches to return the YAML.

## Recommended Approach

Use an additive backend layer:

```text
Express routes
  -> admin subscription route handlers
  -> subscription service
  -> SQLite repository
  -> existing Clash YAML generator
```

Do not rewrite the current proxy configuration loader or YAML generator. The new subscription service validates tenant tokens, loads the allowed node config, then calls the existing YAML generation path.

Why this approach:

- It preserves the already working AWS Singapore subscription behavior.
- It gives the frontend a stable API to replace the mock client later.
- It keeps data persistence isolated and testable.
- It avoids introducing user login, payment, or per-user Shadowsocks credentials before they are needed.

## Branch Scope

Implement in `feat/subscription-admin-core` after this planning branch is reviewed.

Included:

- SQLite database bootstrap.
- Subscription tenant repository.
- Secure token creation, hashing, verification, and reset.
- Admin subscription CRUD-like API.
- Tenant-token subscription fetch behavior.
- Existing console-token subscription fetch compatibility during migration.
- Tests for repository, service, routes, and compatibility.

Excluded:

- React admin shell API integration.
- Payment, public sign-up, or self-service user portal.
- Per-user Shadowsocks credentials.
- Immediate disconnect for users who already cached shared node credentials.
- Cloud deployment changes.

## Storage

Use SQLite for the first implementation. The service is a small single-node admin system, so SQLite keeps deployment simple and makes backups easy.

Default database path:

```text
.proxy-gateway/subscriptions.sqlite
```

Runtime override:

```text
SUBSCRIPTION_DB_PATH=/absolute/path/subscriptions.sqlite
```

The database file must stay out of git.

## Schema

Use a compact schema for the first backend core:

```text
subscription_tenants
- id text primary key
- display_name text not null
- status text not null
- expires_at text not null
- note text not null default ''
- node_id text not null
- credential_mode text not null
- token_hash text not null
- token_prefix text not null
- last_used_at text
- created_at text not null
- updated_at text not null

subscription_audit_events
- id text primary key
- action text not null
- tenant_id text
- actor text not null
- created_at text not null
- metadata_json text not null default '{}'
```

Indexes:

```text
unique index subscription_tenants_token_hash_idx on subscription_tenants(token_hash)
index subscription_tenants_status_idx on subscription_tenants(status)
index subscription_tenants_expires_at_idx on subscription_tenants(expires_at)
```

This deliberately combines token state into `subscription_tenants` for the first implementation. A later isolated-credential phase can split token history into a separate `subscription_tokens` table if historical token audit becomes necessary.

## Token Model

Token requirements:

- Generate at least 32 random bytes.
- Store only a hash, never the raw token.
- Return the raw token only in create and reset responses.
- Store a short `token_prefix` for operator identification.
- Compare token hashes with timing-safe equality when checking candidate tokens.

Recommended raw token format:

```text
pgsub_<base64url-random>
```

Token hash:

```text
sha256(rawToken)
```

The token remains a bearer secret because clients pass it in a subscription URL. Server logs must not print full query strings containing `token`.

## Status Rules

Stored statuses:

- `active`
- `disabled`

Computed presentation statuses:

- `active`: stored active and not near expiry.
- `expiring`: stored active and expires within the warning window.
- `expired`: stored active but expiry is in the past.
- `disabled`: stored disabled.

Default warning window:

```text
SUBSCRIPTION_EXPIRING_DAYS=7
```

The API returns the computed status while preserving a separate internal disabled flag through the stored status.

## API Contract

Admin API routes remain protected by existing console auth.

```text
GET  /api/admin/subscriptions
POST /api/admin/subscriptions
GET  /api/admin/subscriptions/:id
PATCH /api/admin/subscriptions/:id
POST /api/admin/subscriptions/:id/renew
POST /api/admin/subscriptions/:id/disable
POST /api/admin/subscriptions/:id/enable
POST /api/admin/subscriptions/:id/reset-token

GET /api/admin/nodes
GET /api/admin/overview
```

Tenant subscription route:

```text
GET /sub/clash.yaml?token=<tenant-token>
```

Migration compatibility:

- During this backend core phase, `GET /sub/clash.yaml?token=<console-token>` continues to work.
- Tenant-token requests use the new subscription validation flow.
- Missing token still returns `401`.
- Unknown tenant token returns `401`.
- Disabled or expired tenant token returns `403`.

This keeps current Clash/Karing users from breaking while tenant subscriptions are being introduced.

## Request And Response Shapes

Create:

```json
{
  "displayName": "customer-a",
  "expiresAt": "2026-06-21T00:00:00.000Z",
  "note": "manual subscription"
}
```

Create response:

```json
{
  "tenant": {
    "id": "tenant_...",
    "displayName": "customer-a",
    "status": "active",
    "expiresAt": "2026-06-21T00:00:00.000Z",
    "note": "manual subscription",
    "nodeName": "aws-singapore",
    "tokenPrefix": "pgsub_abcd",
    "lastUsedAt": null,
    "credentialMode": "shared-node"
  },
  "subscriptionUrl": "https://example.com/sub/clash.yaml?token=pgsub_raw_visible_once"
}
```

List response:

```json
{
  "items": [
    {
      "id": "tenant_...",
      "displayName": "customer-a",
      "status": "active",
      "expiresAt": "2026-06-21T00:00:00.000Z",
      "note": "manual subscription",
      "nodeName": "aws-singapore",
      "tokenPrefix": "pgsub_abcd",
      "lastUsedAt": null,
      "credentialMode": "shared-node"
    }
  ]
}
```

Reset token response:

```json
{
  "tenant": {
    "id": "tenant_...",
    "tokenPrefix": "pgsub_new"
  },
  "subscriptionUrl": "https://example.com/sub/clash.yaml?token=pgsub_raw_visible_once"
}
```

## Runtime Composition

Extend `createRuntimeState()` with a subscription admin service:

```text
state.subscriptions
- repository
- service
- publicSubscriptionBaseUrl
```

Default public subscription base URL:

```text
http://<state.host>:<state.ports.console>
```

Override:

```text
PUBLIC_SUBSCRIPTION_BASE_URL=https://proxy.example.com
```

The override matters for AWS because the client-facing URL should be HTTPS and public, while the local console host may remain `127.0.0.1`.

## Route Integration

Add a new route module:

```text
server/routes/admin-subscriptions.mjs
```

Keep `server/routes/subscription.mjs` responsible for `GET /sub/clash.yaml` and `/api/subscription/status`, but update it to delegate tenant-token validation when `state.subscriptions` is available.

This avoids mixing daily admin API actions into the public subscription fetch route.

## Validation

Use minimal explicit validation functions instead of adding a large validation framework.

Rules:

- `displayName`: required, trimmed, 1 to 80 chars.
- `expiresAt`: required ISO date, must parse to a valid date.
- `note`: optional, max 500 chars.
- `status`: only `active` or `disabled` stored.
- IDs are generated server-side.
- Client never supplies `tokenPrefix`, `tokenHash`, or `credentialMode`.

Return `400` with a small error body for validation failures:

```json
{
  "error": "validation_error",
  "message": "displayName is required"
}
```

## Testing Plan

Repository tests:

- Initializes schema in a temp database.
- Creates a tenant with hashed token only.
- Lists tenants without raw token.
- Renews expiry.
- Disables and enables.
- Resets token and invalidates the old hash.
- Updates `last_used_at` after valid subscription fetch.

Service tests:

- Computes active, expiring, expired, and disabled statuses.
- Verifies valid token.
- Rejects unknown token.
- Rejects expired token.
- Rejects disabled token.
- Produces a visible-once subscription URL only on create/reset.

Route tests:

- Admin routes require console auth.
- Create returns a tenant and visible-once URL.
- List never returns raw token or token hash.
- Renew, disable, enable, reset work through HTTP.
- `/sub/clash.yaml?token=<tenant-token>` returns YAML for active tenant.
- Missing token returns `401`.
- Unknown token returns `401`.
- Disabled and expired tenant tokens return `403`.
- Existing console-token subscription fetch remains compatible.

Final verification:

```powershell
npm test
```

## Implementation Order

1. Add SQLite dependency and database path handling.
2. Add token utility and status utility tests.
3. Add repository with schema bootstrap and tests.
4. Add subscription service with visible-once URL creation.
5. Add admin routes and route tests.
6. Update existing subscription route for tenant-token validation and console-token compatibility.
7. Update README and QA report with backend core status.
8. Push branch and open draft PR.

## Risks And Mitigations

- **SQLite native dependency on Windows/AWS**: use `better-sqlite3` for the first implementation, verify install/build on Windows before committing, and stop if native installation fails instead of falling back silently.
- **Breaking existing subscription users**: keep console-token compatibility in this branch.
- **Token leakage through logs**: avoid logging `req.url` on subscription routes and document that reverse proxy logs must strip query strings.
- **False sense of disconnect**: document that disabling stops future subscription refreshes, not already cached shared credentials.
- **Frontend mismatch**: keep response shapes aligned with the existing admin mock types.

## Next Branch

The next branch, `feat/admin-console-api-integration`, will replace the admin app's mock client with an HTTP client and add browser verification against the real backend.
