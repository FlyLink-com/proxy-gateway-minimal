# Admin Protected Preview And Registration Runbook

Last updated: 2026-06-30, America/Los_Angeles.

> Status:
> - Type: Admin preview and user-registration sequencing runbook
> - Risk: C for this document.
> - Follow-up implementation risk: B for local Admin UI or local registration
>   code; A for production, Nginx, systemd, DNS, auth model, schema/migration,
>   payment, deploy, rollback, public portal, or live database changes.
> - Production impact: None.
> - Execution authority: Does not authorize production, AWS, Vultr, DNS,
>   Nginx, systemd, DB, runtime, auth model, schema/migration, token,
>   credential, subscription URL, raw config/log/env, SQLite row, payment
>   provider, webhook, or customer-data actions.

This runbook records the near-term operating path:

1. keep improving the local Admin console in small UI slices;
2. validate the local build and tests after each slice;
3. promote only a protected Admin preview when the local package is clean;
4. build the user self-service registration lifecycle locally before payment
   provider work;
5. keep payment API onboarding separate until registration and account security
   are stable.

The target posture is "controlled preview while testing", not public Admin.

## Current Local Candidate

The current local checkout has a broad Admin/Figma/auth worktree. Treat it as
an in-progress candidate until the exact deployable diff is reviewed.

Local validation observed on 2026-06-30:

```powershell
git diff --check
npm run admin:test
npm run admin:build
npm test
npm run admin:portal:build
npm run admin:portal:verify
npm run admin:site:build
npm run admin:site:verify
```

Observed results:

| Command | Result |
| --- | --- |
| `git diff --check` | Passed; only Windows LF/CRLF working-copy warnings were printed. |
| `npm run admin:test` | Passed, 34 test files and 322 tests. |
| `npm run admin:build` | Passed; Vite emitted the existing chunk-size warning only. |
| `npm test` | Passed, 829 server tests. |
| `npm run admin:portal:build` | Passed. |
| `npm run admin:portal:verify` | Passed; no Admin shell markers, no secret material, and portal human challenge contract present. |
| `npm run admin:site:build` | Passed. |
| `npm run admin:site:verify` | Passed. |

This is local evidence only. It is not production inventory, not production
approval, and not proof that the live host currently matches this checkout.

## Protected Admin Preview Gate

Use this gate when the operator wants to see the Admin UI online after local
validation.

Required boundary:

1. Public Admin must remain blocked.
2. Admin preview must be reachable only through an approved protected path.
3. Source IP allowlist must be explicit and reviewed.
4. Admin auth must require the existing console token/session boundary.
5. If the preview includes the user-portal security lane, Google Authenticator
   / TOTP remains account-bound and limited to one active authenticator per
   account.
6. Preview access must not expose raw subscription URLs, tokens, credentials,
   raw config/log/env, SQLite rows, or customer-private data.
7. No production data migration, payment provider callback, Nginx reload,
   systemd restart, DNS change, or deploy happens without a separate A-tier
   approval.

Detailed protected-route requirements for TLS, source IP allowlist, one active
Admin operator, one active Google Authenticator / TOTP binding, Admin session
cookies, and the server-side Console Token gateway live in
`docs/ADMIN_PROTECTED_ROUTE_AUTH_DESIGN.md`.

Minimum A-tier preflight before any live preview mutation:

| Step | Required result |
| --- | --- |
| Read-only inventory | Confirm target host, current release, service path, public boundary, Admin public-block posture, portal route posture, and rollback release. |
| Artifact decision | Name the exact local commit/diff or package being previewed. |
| Config decision | List required env names only, not values. Confirm Admin allowlist, portal allowlist, trusted proxy CIDRs, and route enable flags. |
| Backup/rollback | Identify rollback artifact/release and the command owner. |
| Validation plan | Define post-preview checks for Admin blocked/unblocked paths, portal human challenge, no-session portal rejection, and no secret output. |
| Operator approval | Use an explicit approval phrase naming target, artifact, scope, and rollback. Short confirmations are not enough for mutation. |

Post-preview validation must include redacted status only:

```text
Admin protected path: expected reachable for approved source only.
Public Admin path: expected blocked.
Portal human challenge: expected 201 only when portal route is intentionally enabled.
No-session portal API: expected 401.
Subscription health/public boundary: unchanged.
Sensitive material: not printed.
```

## User Self-Service Registration Gate

Registration belongs to the user portal lifecycle, not the Admin management
panel. The Admin panel may review users and orders after they exist, but it is
not the customer-facing signup surface.

Local registration lifecycle target:

```text
public site register CTA
  -> registration form
  -> safe account request
  -> platform account id
  -> 7-day trial request
  -> dynamic entry token visible-once handoff
  -> one active Google Authenticator / TOTP binding
  -> short portal session
  -> user panel shows plan, trial window, quota, usage, and subscription state
```

Local implementation acceptance:

1. Account ID is the same `platform_accounts.id` used by Admin and user portal.
2. Registration creates no subscription URL in the public response.
3. Trial request is limited to one trial per account.
4. Dynamic entry token is visible once and stored hash-only.
5. TOTP is required before a normal user session can use the account panel.
6. Only one active authenticator is allowed for the gated launch.
7. User-scoped portal APIs derive `portalUserRef` from the session account, not
   from user-submitted body fields.
8. The user panel can show usage and current subscription state, but cannot call
   Admin APIs.
9. Payment, checkout, webhook, renewal, refund, and provider API rotation stay
   out of this registration gate.

Current local implementation hook:

- backend route: `POST /api/portal/registration`;
- frontend route: `/portal/register/` in the portal build;
- created records: `platform_accounts.id`, active 7-day trial entitlement,
  pending trial access request, and hash-only dynamic portal entry;
- login continuation: visible-once entry token -> TOTP binding -> short portal
  session.

Recommended local validation for registration work:

```powershell
node --test server/tests/portal-registration-routes.test.mjs server/tests/platform-user-portal-auth.test.mjs server/tests/user-portal-routes.test.mjs server/tests/portal-access-request-routes.test.mjs
npm run admin:test -- user-portal
npm run admin:portal:build
npm run admin:portal:verify
npm test
git diff --check
```

Add focused route/service tests before adding UI wiring. Do not rely on manual
browser testing as the only proof for registration lifecycle changes.

## Payment API Deferral

Payment provider onboarding starts only after the registration lifecycle can be
tested locally without payment:

1. account exists;
2. trial request exists;
3. authenticator is bound;
4. portal session is active;
5. user panel displays plan/trial/quota/usage state;
6. Admin can review the account/order safely.

Payment work is a separate A-tier lane because it may introduce provider
secrets, webhook signatures, payment callbacks, balance mutation, entitlement
extension, and rollback requirements.

Use `docs/BILLING_RECHARGE_CONTRACT.md` and
`docs/PAYMENT_PROVIDER_ADAPTER_TEMPLATE.md` before payment implementation.

## Hard Stops

Stop and create a separate A-tier gate if the next step touches:

- production deployment or rollback;
- Nginx, DNS, HTTPS, systemd, firewall, or provider firewall;
- production SQLite migration or live customer rows;
- payment provider account, API key, callback, webhook, capture, refund, or
  settlement logic;
- public Admin exposure;
- raw subscription URLs, tokens, credentials, raw config/log/env, SQLite rows,
  or customer-private data.
