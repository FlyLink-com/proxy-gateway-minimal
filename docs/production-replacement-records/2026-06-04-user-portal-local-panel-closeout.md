# User Portal Local Panel Closeout

Date: 2026-06-04, Asia/Shanghai.

Risk: C documentation closeout for a completed B-tier local Admin/User Portal
UI slice.

Scope:

```text
Close out the repository-local customer portal panel after the order-management
UI merge, authentication preview flow, support form, and backend contract tests.

This record does not authorize production portal exposure, public routing,
payment activation, production database migration, credential-provider setup,
automatic subscription issuance, DNS, Nginx, systemd, firewall, Aliyun, AWS,
edge, or user-traffic changes.
```

## Completed Local Panel Scope

The repository-local user portal panel now has one customer-facing product
surface:

```text
account login
  -> required first-login account security setup when configured
  -> subscription order management
  -> use guide
  -> support request form
  -> personal center and account security settings
```

Completed behavior:

- Normal login shows one account/password form with a generated local human
  challenge and hidden bot trap; email-code login and separate login-method tabs
  remain retired/hidden.
- Initial preview accounts that require setup must bind an authenticator and
  export a passkey preview package before the setup dialog can be completed.
- Authenticator setup renders a QR/manual-key TOTP enrollment and requires a
  valid 6-digit code before marking the factor bound.
- Passkey preview verification requires the exported package content and does
  not accept a fixed proof string or click-only success.
- Subscription management is now an order table. Users submit 7-day, 30-day, or
  365-day order requests with quantity and client target.
- The request step creates an order/access-request fact only. It does not return
  subscription material, create a runtime tenant, create an entitlement, activate
  payment, or issue automatic trial/monthly/yearly access.
- The create-order form is folded behind the `新建订单` button. It is not shown
  by default after login, and it folds again after successful submission.
- Refresh, copy, and disable are order-row actions for already-issued records.
  Physical delete stays disabled.
- Support is a form-backed request submission surface, not a chatbot, Telegram,
  or customer-service workflow.
- User-facing portal copy was cleaned so the order panel does not show code-like
  terms such as local preview implementation details, raw JSON wording, or
  physical-delete language.

## Backend / Contract Scope

Repository support exists for the current panel contracts:

- `server/routes/user-portal.mjs` remains a guarded, default-off HTTP adapter.
- `server/services/platform/portal-access-requests.mjs` records order
  duration, quantity, client target, pending review state, and duplicate initial
  trial policy.
- `server/services/platform/portal-human-challenge.mjs` models backend-issued
  human challenges for the future production boundary.
- `server/services/platform/portal-initial-account-issuance.mjs` and
  `server/services/platform/portal-password-credentials.mjs` model durable
  account/password storage rules for repo-only tests.
- `server/services/platform/portal-support-requests.mjs` records safe support
  request summaries without echoing raw messages in operator summaries.

These services remain repository contracts until separately approved production
storage, public routing, credential provider, abuse-control, and session gates
exist.

## Validation Evidence

Latest local validation for this closeout:

```text
npm run admin:test -- user-portal
  43 passed

npm run admin:test
  122 passed

npm run admin:build
  passed

npm test
  555 passed

git diff --check origin/master...HEAD
  passed

npm run project-state:check
  passed
```

Browser validation:

```text
Route:
  http://127.0.0.1:5174/?iab=order-full-check-2#/portal-preview

Browser:
  System Chrome controlled through playwright-core.

Observed:
  login completed
  first-login security setup dialog appeared
  authenticator QR/manual-key enrollment completed with a current TOTP code
  passkey preview package download was triggered
  security setup dialog closed after both requirements completed
  order panel initially had no visible submit button or duration field
  clicking 新建订单 showed duration, quantity, client target, and submit controls
  order panel copy check found no targeted engineering terms
  console errors: 0
  page errors: 0
```

## Files In Scope For This Closeout

Primary frontend scope:

```text
admin/src/features/user-portal/user-portal-page.tsx
admin/src/features/user-portal/user-portal-client.ts
admin/src/features/user-portal/totp-preview.ts
admin/src/test/user-portal.test.tsx
```

Primary backend contract scope:

```text
server/routes/user-portal.mjs
server/services/platform/portal-access-requests.mjs
server/services/platform/portal-human-challenge.mjs
server/services/platform/portal-initial-account-issuance.mjs
server/services/platform/portal-password-credentials.mjs
server/services/platform/portal-support-requests.mjs
server/tests/platform-portal-access-requests.test.mjs
server/tests/platform-portal-human-challenge.test.mjs
server/tests/platform-portal-initial-account-issuance.test.mjs
server/tests/platform-portal-password-credentials.test.mjs
server/tests/platform-portal-support-requests.test.mjs
server/tests/portal-access-request-routes.test.mjs
server/tests/portal-support-request-routes.test.mjs
server/tests/user-portal-routes.test.mjs
```

Related docs:

```text
docs/USER_PORTAL_FLOW.md
docs/USER_PORTAL_AUTH_BOUNDARY.md
docs/USER_PORTAL_HUMAN_CHALLENGE_DESIGN.md
docs/USER_PORTAL_PRODUCTION_AUTH_PLAN.md
```

The current working tree also contains many unrelated docs, archive, server,
and project-state changes. They should not be bundled into a user-portal-only
commit or PR without separate review.

## Remaining Gates

Still not complete:

- production public portal routing;
- production account creation policy and operator handoff UX;
- durable production password reset/recovery policy;
- real WebAuthn passkey registration;
- provider CAPTCHA/Turnstile/hCaptcha/reCAPTCHA integration;
- real email sending, which is currently retired from the product direction;
- payment-provider checkout or webhook processing;
- automatic entitlement or subscription issuance from user order submission;
- Admin/operator order-management CRUD beyond the current guarded request
  review and order-row preview behavior;
- production SQLite migration or credential secret encryption rollout;
- public DNS, Nginx, systemd, firewall, Aliyun, AWS, or edge changes.

Any of those items is a separate A-tier gate when it affects production,
credentials, schema, public routing, payment, or deployment.

## Not Performed

This closeout does not perform:

```text
git commit
git merge
GitHub PR creation
production deployment
public portal exposure
payment activation
real email issuance
provider CAPTCHA setup
production database migration
real credential-provider setup
automatic subscription issuance
runtime tenant or artifact creation
DNS / Nginx / systemd / firewall mutation
Aliyun / AWS / edge mutation
secret, token, subscription URL, private key, .env value, SQLite row, account
password, or customer-data recording
```

## Closeout Decision

The repository-local customer portal panel is ready to stop active UI churn for
the current B-tier slice.

Next work should start as one of these explicit follow-up lanes:

```text
1. User/order management panel: operator-side order CRUD except physical delete.
2. Production auth gate: durable credentials, WebAuthn, provider CAPTCHA, and
   public-session hardening.
3. Production deployment gate: public routing, DNS/Nginx/systemd, storage
   migration, and rollback plan.
```

Short confirmations such as `同意`, `继续`, `开始`, `ok`, or `go` do not
authorize production, credential, schema, payment, cloud, or deployment gates.
