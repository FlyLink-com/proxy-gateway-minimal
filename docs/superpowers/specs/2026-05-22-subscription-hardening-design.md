# Subscription Hardening Design

## Goal

Harden the subscription-management MVP before wider use. The branch keeps the existing SQLite-backed subscription core and adds short-lived subscription links, clearer token rotation semantics, `/sub` abuse limits, public-admin blocking, and token-safe logging guidance.

## Current Baseline

- `v0.1.0-mvp` is on `master`.
- `ops/domain-https` contains the domain HTTPS runbook and project handoff context.
- The active production server is AWS Singapore `47.129.247.102`.
- Domain-based subscription exposure is paused; keep using the IP/Nginx gateway path unless the user explicitly re-enables the domain plan.
- `server/app.mjs` marks `/sub/clash.yaml` as public to the global auth middleware, then `server/routes/subscription.mjs` validates console or tenant tokens itself.
- Admin routes under `/api/admin/*` currently rely on the console token but do not have an IP allowlist guard.
- The app does not currently add a general access log middleware. Nginx can still log full query strings unless configured otherwise.

## Branch Scope

Implement in `feat/subscription-hardening`.

Included:

- Short-lived random subscription delivery links for existing tenants.
- Token rotation behavior documentation and tests that prove old primary tokens stop working after reset.
- In-memory `/sub` rate limiting suitable for a single-node deployment.
- Application-level `/api/admin` source-IP allowlist as a defense-in-depth control.
- Token redaction helpers and tests for log-safe request identifiers.
- Nginx runbook updates to strip query strings from access logs and block public `/api/admin`.
- README/QA updates after implementation.

Excluded:

- Payment, public signup, and self-service user portal.
- Per-user Shadowsocks credentials or immediate traffic disconnect.
- Redis/distributed rate limiting.
- React admin frontend integration.
- Re-enabling `sub.globalcirclecat.com`.

## Recommended Approach

Use additive security modules around the current route boundaries:

```text
Express app
  -> client IP helper
  -> admin IP allowlist middleware for /api/admin
  -> existing console auth middleware
  -> /sub route-level rate limiter
  -> subscription service
  -> SQLite repository
```

This keeps the current subscription service intact while adding controls where requests enter the system. The only persistence change should be for temporary delivery links.

## Temporary Subscription Links

Add short-lived link records instead of making the tenant's primary token shorter-lived.

Table:

```text
subscription_temp_links
- id text primary key
- tenant_id text not null
- token_hash text not null unique
- token_prefix text not null
- expires_at text not null
- used_at text
- created_at text not null
```

Token format:

```text
pgtmp_<base64url-random>
```

Behavior:

- Admin route `POST /api/admin/subscriptions/:id/temp-link` creates a temporary link for an existing tenant.
- Default TTL is 24 hours.
- Runtime override: `SUBSCRIPTION_TEMP_LINK_TTL_MINUTES`.
- The response returns the raw temporary token only once in `subscriptionUrl`.
- `GET /sub/clash.yaml?token=<pgtmp_...>` resolves the temp link, validates the tenant state, and returns the same scoped Clash YAML as the tenant's primary token.
- Expired temp links return `403` with `Subscription link expired`.
- Unknown temp tokens return `401`.
- A temp link does not rotate or reveal the tenant's primary token.

First implementation keeps temp links reusable until expiry. Single-use links can be added later if client import workflows do not refresh the same URL after initial setup.

## Token Rotation

The existing `reset-token` endpoint already replaces the tenant's stored primary token hash. This branch should make that guarantee explicit:

- `POST /api/admin/subscriptions/:id/reset-token` returns a new visible-once primary subscription URL.
- The previous primary token must immediately return `401`.
- Existing temporary links for the same tenant remain valid until expiry unless the tenant is disabled or expired.
- Disabling or expiring a tenant blocks both primary and temporary tokens.

This preserves operator workflow while avoiding surprise invalidation of short-lived links that were already issued for onboarding.

## /sub Rate Limiting

Add a small in-memory rate limiter for `GET /sub/clash.yaml`.

Default policy:

```text
window: 60 seconds
max requests: 30 per client IP
```

Runtime overrides:

```text
SUB_RATE_LIMIT_WINDOW_MS=60000
SUB_RATE_LIMIT_MAX=30
```

Response when limited:

```json
{
  "error": "Too Many Requests"
}
```

Status: `429`.

Implementation notes:

- Key by resolved client IP, not token, so invalid-token scans are limited.
- Use `Retry-After` with remaining seconds in the current window.
- Periodically prune expired counters during requests to avoid unbounded growth.
- Keep the limiter injectable in tests so route tests can use small limits and deterministic time.

## Client IP Resolution

Behind Nginx, Express normally sees the proxy source address. Add a helper that trusts `X-Forwarded-For` only when the direct peer is loopback or a private address.

Inputs:

- `req.socket.remoteAddress`
- `req.headers["x-forwarded-for"]`

Rules:

- If the direct peer is loopback/private and `X-Forwarded-For` contains at least one IP, use the first IP.
- Otherwise use the direct peer address.
- Normalize IPv6-mapped IPv4 values such as `::ffff:203.0.113.10`.

This avoids trusting spoofed public `X-Forwarded-For` when requests bypass Nginx.

## Admin Public Access Block

Add an application-level allowlist middleware before admin routes.

Default allowed sources:

```text
127.0.0.1
::1
10.0.0.0/8
172.16.0.0/12
192.168.0.0/16
```

Runtime override:

```text
ADMIN_ALLOWED_CIDRS=127.0.0.1/32,10.0.0.0/8
```

Behavior:

- Requests to `/api/admin/*` from disallowed public IPs return `403` before service handlers run.
- Console token is still required after the IP allowlist passes.
- Tests should cover allowed loopback/private, blocked public IP, and spoofed `X-Forwarded-For` from a public direct peer.

Nginx should also block public `/api/admin` in deployment, but the app-level guard provides safety if Nginx is misconfigured.

## Log Redaction

Add a reusable redaction helper for request targets and URLs.

Rules:

- Replace `token` query values with `[redacted]`.
- Redact bearer tokens as `Bearer [redacted]` if a helper is ever used on headers.
- Preserve path and non-secret query keys for diagnostics.

Examples:

```text
/sub/clash.yaml?token=pgsub_secret&client=clash
/sub/clash.yaml?token=[redacted]&client=clash
```

The Express app should not log full request URLs by default. The helper exists for future logs and for error paths that need a safe request identifier.

## Nginx Runbook Updates

Document the deployed Nginx target behavior:

- Proxy `/sub/clash.yaml` to `127.0.0.1:3456`.
- Block public `/api/admin` with `deny all` unless an explicit operator IP is configured.
- Use an access log format that records `$uri` instead of `$request_uri`, so query strings and subscription tokens are not logged.
- Pass `X-Forwarded-For` and `X-Real-IP` to the app.

The runbook should be written as an operations checklist, not executed automatically in this branch.

## Testing Plan

Add focused tests before implementation:

- Token utility tests for `pgtmp_` generation and safe token prefixes.
- Repository tests for creating, finding, expiring, and marking temp links.
- Service tests for temp-link create/resolve, expired temp links, tenant-disabled behavior, and reset-token invalidating the old primary token.
- Route tests for `POST /api/admin/subscriptions/:id/temp-link`.
- Route tests for `/sub` rate limiting and `Retry-After`.
- Middleware tests for admin source-IP allowlist.
- Redaction helper tests for query tokens and bearer tokens.
- Full `npm test` before commit.

## Operational Verification

After code implementation and tests:

```powershell
npm test
npm run pack:dry-run
```

For live deployment, verify separately:

```powershell
curl.exe --noproxy "*" -i "http://47.129.247.102/sub/clash.yaml?token=bad"
curl.exe --noproxy "*" -i "http://47.129.247.102/api/admin/subscriptions"
```

Expected:

- Bad subscription token returns `401` until rate limited.
- Public admin request returns `403` or is blocked by Nginx.
- Nginx access logs do not contain full `token=` values.

## Risks And Mitigations

- **Rate limiting legitimate client refreshes**: keep the default high enough for Clash/Mihomo refreshes and configurable by env.
- **False source IP trust**: trust `X-Forwarded-For` only from loopback/private direct peers.
- **Token leak in deployment logs**: update Nginx runbook and add app-level redaction helpers even though the app does not currently access-log every request.
- **Operator lockout**: app allowlist defaults include loopback and private ranges; Nginx public blocking remains an operations step.
- **Temp-link table drift**: keep temp-link storage isolated from primary tenant rows and add repository tests for expired lookups.
