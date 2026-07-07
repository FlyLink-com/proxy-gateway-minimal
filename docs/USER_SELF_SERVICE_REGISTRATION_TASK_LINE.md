# User Self-Service Registration Task Line

Date: 2026-07-01

Risk: A

Status: Open; repository implementation is locally validated behind
fail-closed gates and still requires a protected production activation gate.

Production impact: None from this document.

## Process

User self-service registration touches account creation, entitlement creation,
abuse controls, human verification, email ownership verification, login setup,
and production rollout. Implementation and production activation must use the
Risk A process:

1. Read-only inventory.
2. Product/security decision record.
3. Repository implementation behind fail-closed gates.
4. Focused tests plus full validation.
5. Staging or protected preview.
6. Explicit operator approval.
7. Production activation with rollback.

Expected PR count: 2 to 4.

- PR 1: registration contract, tests, and fail-closed email-verification
  service seam.
- PR 2: frontend two-step registration UI and local verification.
- PR 3: production email provider adapter and environment documentation.
- PR 4: production activation packet if the provider, domain, or route boundary
  changes require a separate gate.

## Current Inventory

Known current facts from the 2026-07-01 checkout and live read-only checks:

- The frontend route `/portal/register` exists in `admin/src/App.tsx`.
- The registration page exists in
  `admin/src/features/user-portal/user-registration-page.tsx`.
- The backend route `POST /api/portal/registration` exists in
  `server/routes/user-portal.mjs`.
- The registration service exists in
  `server/services/platform/portal-registration.mjs`.
- Current registration creates a portal account, seven-day trial entitlement,
  access request, and visible-once entry token.
- Registration currently requires backend human verification for
  `portal_registration`.
- Current registration summaries do not return subscription URLs and do not echo
  raw customer email or display name.
- App-level rate limits exist for portal human challenge issuance, registration
  by client IP, registration by submitted identity, password login, and second
  factor.
- A provider-neutral registration email verification service exists and stores
  verification codes as hashes only.
- A Resend-compatible sender adapter exists, but production sending stays
  disabled unless runtime environment variables are configured after approval.
- `admin.gccwebos.com/portal/register` currently serves the Admin bundle.
- `gccwebos.com/portal/register` currently returns `404`.
- Production records show a backend overlay that included
  `portal-registration.mjs` and single-subscription policy activation for
  future portal-created accounts.

## 2026-07-02 Local Validation Snapshot

Local repository validation confirms:

- The existing user panel login page links to `/portal/register/` for
  self-service registration.
- `/portal/register` is served by the portal-only React entrypoint rather than
  the Admin shell in local routing tests.
- Registration is two-step: request email verification, then submit the code
  with a fresh human verification challenge before account creation.
- The backend creates the account, seven-day trial entitlement, access request,
  and visible-once entry handoff only after human and email verification pass.
- Registration email verification codes are hashed, TTL-bound, single-use, and
  rate-limited by IP and submitted email identity.
- Production mail delivery remains fail-closed unless reviewed runtime
  provider environment is configured after approval.

Validation run:

- `npm run admin:test -- src/test/user-portal.test.tsx src/test/navigation.test.ts`
- `node --test server/tests/portal-registration-routes.test.mjs server/tests/rate-limit.test.mjs server/tests/resend-registration-email-sender.test.mjs`
- `npm run admin:portal:build`
- `npm run admin:portal:verify`
- `git diff --check origin/master...HEAD`
- `npm test`

## Product Decision Boundary

Existing portal docs intentionally retired email-code login and email magic
links. This task line does not reopen those by default.

Allowed new decision for this task line:

- registration email ownership verification before account creation;
- provider-backed delivery through a reviewed mail adapter;
- per-IP and per-email send limits;
- hashed verification code storage;
- no raw verification code in logs, API responses, docs, or tests beyond
  deterministic local fixtures;
- no account enumeration by email;
- no automatic subscription URL or runtime credential issuance.

Still out of scope unless separately approved:

- email-code login;
- email magic links;
- password reset;
- phone/SMS verification;
- payment activation;
- automatic subscription material generation;
- public Admin exposure;
- production DB migration without backup and rollback.

## Target Flow

1. Visitor opens the registration page.
2. Browser language selects Chinese or English copy; user can switch manually.
3. User enters name/team, email, plan intent, device count, region, and use
   case.
4. User completes human verification.
5. Backend sends a registration email verification code through the configured
   provider.
6. User submits the code.
7. Backend creates the account and seven-day trial only after the code is
   verified.
8. Backend returns a safe setup handoff: account ID, visible-once setup material
   if still approved, trial status, and next action to bind an authenticator.
9. User completes authenticator setup before normal portal access.

## Implementation Slices

### Slice 1: Contract And Guardrail Tests

Scope:

- Add registration rate-limit tests for IP and email identity limits.
- Add tests proving missing or invalid email verification blocks account
  creation.
- Add tests proving duplicate or replayed verification codes fail closed.
- Add tests proving registration responses do not echo email, verification
  code, subscription URL, token, or raw customer profile.

Validation:

- `node --test server/tests/portal-registration-routes.test.mjs server/tests/rate-limit.test.mjs`
- `npm test`
- `git diff --check origin/master...HEAD`

### Slice 2: Email Verification Service Seam

Scope:

- Add a registration email verification service with provider-neutral interface.
- Store only hashed codes and safe metadata.
- Enforce TTL, maximum attempts, single use, resend cooldown, and per-identity
  send limits.
- Keep the service fail-closed when provider configuration is missing.
- Add a deterministic local sender for tests only.

Non-goal:

- No real provider secrets in Git.
- No production mail send in tests.

### Slice 3: Provider Adapter

Scope:

- Add a Resend-compatible sender adapter behind environment configuration.
- Use `USER_PORTAL_REGISTRATION_EMAIL_PROVIDER=resend` to select the adapter.
- Use `RESEND_API_KEY` only as a server-side runtime secret.
- Use `USER_PORTAL_REGISTRATION_EMAIL_FROM` and optional
  `USER_PORTAL_REGISTRATION_EMAIL_REPLY_TO` for approved sender identities.
- Use `mail.gccwebos.com` only after DNS/provider verification is recorded.
- Keep provider errors safe and non-enumerating.
- Add redacted operational diagnostics that show provider configured/not
  configured without exposing keys or message contents.

Validation:

- Provider disabled path fails closed.
- Provider test mode uses fixture sender.
- Resend adapter tests use a synthetic API key and injected fetch only.
- Production dry-run record proves configuration shape without outputting
  secrets.

### Slice 4: Frontend Two-Step Registration

Scope:

- Change `/portal/register` from one-step account creation to two-step
  verification then creation.
- Add resend cooldown UI.
- Add locked/error states for rate limits and expired verification.
- Keep current Chinese/English language behavior.
- Do not show payment, subscription URL, or Admin wording.

Validation:

- `npm run admin:test`
- `npm run admin:build`
- Browser verification for desktop and mobile.

### Slice 5: Production Gate

Scope:

- Read-only inventory of current Admin/Portal route, backend runtime, Nginx,
  DNS, and provider domain status.
- Backup touched runtime files.
- Stage artifact and verify hashes.
- Activate only after exact approval.
- Validate live boundaries:
  - registration page loads;
  - human challenge issuance remains limited;
  - email verification send is limited;
  - invalid code does not create an account;
  - successful controlled test creates exactly one trial account;
  - no subscription URL, token, raw customer email, or provider secret is
    returned.

Rollback:

- Restore previous backend files or release pointer.
- Restore previous Admin frontend release pointer.
- Disable provider env or route gate if abuse is detected.

## Open Decisions

- Public entry domain: keep `/portal/register` under `admin.gccwebos.com` during
  protected preview, or expose a separate customer domain later.
- Email provider activation: use Resend free tier first, with Pro only after
  volume or domain requirements force it.
- Account setup material: keep visible-once entry token for the first wave, or
  replace it with email-verified authenticator setup only.
- Duplicate email policy: reject, merge into existing pending setup, or route to
  support without revealing account existence.
- SMS/phone verification: defer unless business requirements require it.

## Current First Action

The next action is a protected staging package for the locally validated
backend and portal static bundle. Production activation must not replace the
existing portal static contents until the exact artifact hashes, rollback
backup path, and mail-provider fail-closed behavior are reviewed and approved.
