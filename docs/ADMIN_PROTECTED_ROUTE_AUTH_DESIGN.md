# Admin Protected Route Auth Design

Date: 2026-06-30 America/Los_Angeles / 2026-07-01 UTC.

> Status:
> - Type: Admin protected-route auth and TLS design gate.
> - Risk: C for this document only.
> - Follow-up implementation risk: B for local-only code/tests; A for
>   production auth model, TLS/Nginx route, systemd/env, schema/migration,
>   deploy, rollback, or public Admin exposure.
> - Production impact: None.
> - Execution authority: This document does not authorize production, Nginx,
>   systemd, DNS, firewall, provider firewall, SQLite migration, payment,
>   token rotation, secret handling, public Admin, or customer-data actions.

No secrets, tokens, subscription URLs, credentials, raw runtime config, raw
logs, SQLite rows, customer private data, or TOTP secrets are recorded here.

## Purpose

The frozen Admin preview artifact can remain staged on the production host, but
it must not become publicly reachable until the protected-route gate is complete.
This design defines the minimum route and authentication model required before a
later operator can approve a hostname-based Admin preview.

Target posture:

1. one protected Admin hostname;
2. valid TLS for that hostname;
3. explicit source IP allowlist;
4. exactly one active Admin operator for the first launch;
5. one active Google Authenticator / TOTP binding for that operator;
6. short-lived HttpOnly browser session after TOTP verification;
7. server-side Admin API gateway that never exposes the Console Token to the
   browser;
8. public apex/subscription/user portal boundaries unchanged.

## Current Facts To Preserve

The current repository already has these relevant controls:

- `/api/admin` is guarded by the Admin allowlist middleware.
- `ADMIN_ALLOWED_CIDRS` controls Admin source CIDRs.
- `TRUSTED_PROXY_CIDRS` controls whether `X-Forwarded-For` is trusted.
- The local Admin bridge serves static Admin only after a local session cookie.
- The local Admin bridge injects the Console Token server-side and does not send
  the real token to the browser.
- The portal auth lane has a TOTP verifier and a one-active-authenticator rule
  for portal accounts.

The current production staging record also says the Admin artifact is staged but
not served by Nginx, public `/api/admin/*` remains blocked, and public Admin
launch remains blocked.

Those controls are not enough for public protected Admin because there is no
completed production Admin operator login, Admin TOTP enrollment, Admin session,
or TLS/Nginx route for the Admin host.

## Non-Goals

This design does not:

- change the running production release or current symlink;
- expose Admin on the apex, subscription host, or portal host;
- move user-portal login into the Admin panel;
- enable public user registration;
- add payment checkout, callback, webhook, refund, or provider-key logic;
- dump or migrate production SQLite rows;
- output or rotate Console Token values;
- permit raw logs, raw config, tokens, credentials, subscription URLs, or TOTP
  secrets in the frontend.

## Route Model

Use a dedicated Admin hostname. The expected first hostname is:

```text
admin.globalcirclecat.cloud
```

The hostname is not approved for serving until a later read-only inventory
confirms DNS target, certificate coverage, Nginx server blocks, and rollback
state.

Required public route behavior:

| Route | Required behavior |
| --- | --- |
| `https://admin.globalcirclecat.cloud/` | Serve the staged Admin static artifact only after IP allowlist and Admin session gate. Unauthenticated requests should see the Admin login shell, not the app data. |
| `https://admin.globalcirclecat.cloud/api/admin-auth/*` | Admin operator auth, TOTP enrollment/verification, session status, and logout only. |
| `https://admin.globalcirclecat.cloud/api/admin/*` | Server-side Admin API gateway. Requires allowed source IP, valid Admin session, and recent TOTP-backed session. Injects Console Token server-side only. |
| `https://admin.globalcirclecat.cloud/api/portal/*` | Not mounted on the Admin hostname. Return `404` unless a later gate explicitly changes this. |
| `https://admin.globalcirclecat.cloud/sub/*` | Not mounted on the Admin hostname. Return `404`. |
| Apex/subscription hosts `/api/admin/*` | Continue returning `404`. |

## TLS And Nginx Boundary

The production route must use a separate Nginx server block for the Admin
hostname. It must not be merged into the apex, subscription, or portal server
blocks.

Required Nginx design:

```nginx
server {
    listen 443 ssl http2;
    server_name admin.globalcirclecat.cloud;

    # Certificate must cover admin.globalcirclecat.cloud.
    ssl_certificate     /path/to/admin/fullchain.pem;
    ssl_certificate_key /path/to/admin/privkey.pem;

    # Operator source allowlist. Exact CIDRs are supplied only at approval time.
    allow <operator_public_ip_or_vpn_cidr>;
    deny all;

    root /opt/proxy-gateway-minimal-candidate/admin-preview/current/admin-dist;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location ^~ /api/admin-auth/ {
        proxy_pass http://127.0.0.1:3456;
        proxy_set_header Host $host;
        proxy_set_header Authorization "";
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }

    location ^~ /api/admin/ {
        proxy_pass http://127.0.0.1:3456;
        proxy_set_header Host $host;
        proxy_set_header Authorization "";
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }

    location ^~ /api/ {
        return 404;
    }
}
```

Implementation details may use a release-specific static path or a dedicated
`admin-preview/current` symlink, but symlink creation or Nginx reload is a
separate A-tier production action.

Required app-level defense in depth:

- `ADMIN_ALLOWED_CIDRS` must include only loopback plus the reviewed operator
  source CIDR(s), not broad private networks for public deployment.
- `TRUSTED_PROXY_CIDRS` must include only the local Nginx proxy source address
  used by the app, typically loopback, before `X-Forwarded-For` is trusted.
- the Admin session gateway must ignore or strip browser-supplied
  `Authorization` and inject the Console Token only after a valid Admin session.
- If Nginx and the app disagree on source IP, fail closed.

## Admin Auth Chain

The Admin browser must never receive the real Console Token. The browser gets
only:

- static HTML/CSS/JS;
- a short-lived, HttpOnly, Secure, SameSite session cookie after successful
  Admin login and TOTP verification;
- safe Admin API JSON responses.

Required request chain:

```text
allowed source IP
  -> TLS Admin hostname
  -> Admin operator identity check
  -> one active Admin TOTP factor
  -> short-lived Admin session cookie
  -> server-side Admin API gateway
  -> loopback Console Token injection
  -> existing /api/admin service handlers
```

Fail-closed behavior:

- source IP outside allowlist: `403`;
- missing or invalid Admin session: `401`;
- Admin operator disabled: `403`;
- second Admin operator active during gated launch: `409` or setup blocked;
- missing TOTP enrollment after bootstrap: setup-only view;
- wrong TOTP code: `401` or `400`, with rate limit and no detailed reason;
- direct Console Token supplied by browser: ignored or rejected;
- `/api/admin/*` on non-Admin hosts: remains `404`.

## Single-Administrator Rule

The first public protected preview allows one Admin operator only.

Required state:

```text
admin_operators
  operatorRef
  displayName
  status
  role = single_admin
  createdAt
  disabledAt

admin_operator_totp_credentials
  credentialRef
  operatorRef
  encryptedTotpSecret
  status
  enrolledAt
  lastVerifiedAt
  failureCount
  lastAcceptedTimeStep
  revokedAt

admin_operator_sessions
  sessionRef
  operatorRef
  authMethod = totp
  issuedAt
  expiresAt
  lastSeenAt
  sourceIpSafeRef
  revokedAt
```

For the first launch:

- exactly one `admin_operators.status = active` row is allowed;
- exactly one active TOTP credential is allowed for that operator;
- TOTP replacement requires an explicit reset/revoke gate;
- operator deletion is not a normal UI action during this phase;
- recovery must disable the existing credential before a new one is enrolled.

If implementation avoids a schema migration for the first local proof, the same
invariants must still be represented in a default-off store and covered by
tests. Production persistence remains a separate schema/migration gate.

## TOTP Requirements

TOTP should reuse the existing verifier behavior where practical:

- 6 digits;
- 30-second period;
- narrow drift window;
- constant-time code comparison;
- no raw secret echo after enrollment setup;
- encrypted-at-rest secret in production;
- one active credential;
- failure counters and rate limits;
- last accepted time-step tracking to prevent replay;
- safe audit events only.

Enrollment flow:

1. Operator passes the initial Admin identity/bootstrap gate.
2. Server creates a pending TOTP enrollment with short expiry.
3. UI displays QR/manual key only during enrollment.
4. Operator submits a 6-digit code.
5. Server validates the code and creates the single active credential.
6. Server creates the Admin session cookie only after the TOTP proof.

Login flow after enrollment:

1. Operator submits the Admin identity proof.
2. Server returns `second_factor_required`.
3. Operator submits TOTP code.
4. Server validates, rate-limits, checks replay, writes safe audit summary, and
   issues the Admin session cookie.

## API Surface

The public protected Admin route should add a small auth surface separate from
existing management APIs:

| Endpoint | Purpose |
| --- | --- |
| `GET /api/admin-auth/session` | Safe session status; no Console Token or secret material. |
| `POST /api/admin-auth/bootstrap/start` | First-operator setup start. Enabled only when no active operator exists and a reviewed bootstrap condition is present. |
| `POST /api/admin-auth/totp/enrollment` | Start TOTP enrollment for the single operator. |
| `POST /api/admin-auth/totp/enrollment/confirm` | Confirm first TOTP code and activate the credential. |
| `POST /api/admin-auth/login` | Identity proof; returns second-factor requirement after setup. |
| `POST /api/admin-auth/totp/verify` | Verify TOTP and create Admin session. |
| `POST /api/admin-auth/logout` | Revoke/clear Admin session cookie. |

All protected Admin management reads and mutations remain under
`/api/admin/*`, but are reachable from the browser only through the server-side
gateway after Admin session validation.

## Repository-Local Implementation Hook

The repository-local implementation is default-off and uses these environment
names when explicitly enabled:

```text
ADMIN_AUTH_ROUTES_ENABLED=true
ADMIN_AUTH_BOOTSTRAP_TOKEN=<protected host value>
ADMIN_AUTH_SESSION_SECRET=<protected host value>
ADMIN_AUTH_OPERATOR_REF=<safe operator ref, default operator_local_admin>
```

Runtime behavior:

- disabled by default;
- `/api/admin-auth/*` shares the Admin IP allowlist;
- bootstrap binds exactly one Admin operator and one active TOTP credential in
  the current local in-memory service;
- logout and normal login require a TOTP challenge before a new Admin session is
  issued;
- `/api/admin/*` clears incoming browser `Authorization` when this gate is
  enabled and injects the Console Token server-side only after a valid
  `gcc_admin_session` cookie;
- production persistence, schema migration, TLS/Nginx route activation, and
  durable operator recovery remain separate gates.

## Cookie And Browser Rules

Required cookie properties for production:

```text
HttpOnly
Secure
SameSite=Strict
Path=/
short Max-Age, target 30-60 minutes for the first preview
```

Frontend storage rules:

- no Console Token in `localStorage`, `sessionStorage`, URL, page source, or
  browser-visible bootstrap payload;
- no TOTP secret after enrollment confirmation;
- no raw subscription URLs, credentials, tokens, raw logs, raw config, or SQLite
  rows in any Admin page;
- the app must handle `401`, `403`, and `second_factor_required` as normal
  locked states.

## Logging And Evidence

Allowed evidence:

- route status codes;
- hostname and path only;
- safe operator ref;
- safe session ref;
- TOTP success/failure counters without code or secret;
- source IP classification such as `allowed` or `blocked`, or a safe hash/ref if
  needed;
- redacted audit summaries.

Forbidden evidence:

- Console Token;
- TOTP secret, QR payload, or code;
- subscription URL/token;
- raw Nginx config containing secrets;
- raw env;
- raw logs;
- SQLite rows;
- customer private data.

## Validation Gates

Local implementation validation before any production route request:

```powershell
git diff --check origin/master...HEAD
node --test server/tests/admin-allowlist.test.mjs
node --test server/tests/admin-auth-route.test.mjs
node --test server/tests/admin-auth-service.test.mjs
node --test server/tests/local-admin-bridge.test.mjs
npm run admin:test
npm run admin:build
npm test
```

Production read-only inventory required before route deployment:

```text
target host identity
current release symlink
staged Admin artifact path and hashes
current Nginx server_name map
current TLS certificate coverage
current public /api/admin/* blocked posture
current app listener binding
current Admin env names only, not values
operator public IP or VPN CIDR to allow
rollback config path and current release
```

Production post-change validation, if separately approved:

```text
nginx -t successful before reload
admin hostname TLS certificate valid for admin.globalcirclecat.cloud
disallowed source receives 403
allowed source receives Admin login/setup shell
no Admin session -> /api/admin/* returns 401 or locked response
wrong TOTP cannot create session
correct TOTP creates HttpOnly Secure SameSite session
browser storage contains no real Console Token
browser storage contains no TOTP secret after setup
allowed Admin session can load safe summary API only
apex/subscription hosts /api/admin/* still return 404
public 3456/5176/5177/5187 remain unavailable
Nginx and proxy-gateway service remain active
```

## Rollback Design

Rollback for the protected route must be independent from the staged artifact:

1. Restore the previous Nginx config backup or remove the Admin server block.
2. Run `nginx -t`.
3. Reload Nginx only after config test passes.
4. Disable Admin auth route env flags if they were enabled.
5. Revoke active Admin sessions.
6. Confirm public `/api/admin/*` is blocked on apex/subscription hosts.
7. Confirm `admin.globalcirclecat.cloud` is blocked or no longer serves Admin.
8. Keep or remove the staged artifact according to the exact rollback approval.

No rollback step may print tokens, TOTP secrets, raw env, raw config, raw logs,
SQLite rows, or customer data.

## Required Decisions Before Production Approval

The next production approval must name:

- target host: `vul1/gccgw-vultr-candidate`;
- Admin artifact label and SHA-256;
- Admin hostname;
- allowed operator source CIDR(s);
- whether TLS certificate issuance/install is included;
- whether Nginx `admin-preview/current` symlink creation is included;
- whether app env changes are included;
- whether schema/migration is included or the production gate is route-only;
- rollback owner and exact rollback scope.

Short confirmations such as "同意" or "开始" are not enough for route mutation.

## Next Approval Phrase For Local Implementation

Use this if the next step is local code and tests only:

```text
批准进入 Admin protected route auth implementation：scope=local code and tests only for single-admin TOTP session gateway, no production, no Nginx, no systemd, no DNS, no firewall, no SQLite production migration, no public Admin；validation=admin auth tests + admin allowlist tests + local bridge tests + admin build/tests + npm test；rollback=git revert local changes only.
```

## Future Production Approval Phrase Template

Use this only after local implementation passes and a fresh read-only inventory
fills the placeholders:

```text
批准执行 Admin protected route production deployment：target=vul1/gccgw-vultr-candidate；artifact=<admin-preview-label> sha256=<sha256>；host=admin.globalcirclecat.cloud；allowed_cidrs=<reviewed operator CIDR list>；scope=<TLS cert if included> + <Nginx admin host route> + <server-side Admin auth gateway env if included>, no apex/subscription route change, no public /api/admin on existing hosts, no payment, no customer data dump, no token output；validation=nginx -t, TLS host check, allowed-source login/TOTP/session smoke, disallowed-source blocked, apex/sub /api/admin still 404, public high ports still closed；rollback=restore previous Nginx config, reload only after nginx -t, revoke Admin sessions, disable Admin route env flags, keep/remove staged artifact as stated.
```
