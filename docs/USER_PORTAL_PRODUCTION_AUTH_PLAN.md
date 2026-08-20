# User Portal Production Auth Implementation Plan

Last updated: 2026-08-16.

```yaml
document_metadata:
  doc_type: operational
  lifecycle: active
  authority_scope: user_portal_production_auth_implementation_plan
  superseded_by: null
  last_verified_at: 2026-08-16
  production_authority: false
```


> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development or superpowers:executing-plans to
> implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking.

**Goal:** Move customer portal login from repository-local preview state to a
durable, operator-issued account credential model without enabling public
self-registration or subscription issuance.

**Architecture:** Keep `platform_accounts` and `platform_entitlements` as the
business authority. Add a separate portal credential layer for password,
authenticator, passkey, human challenge, second-factor challenge, session, and
audit state. Portal HTTP routes stay default-off until runtime explicitly
injects the reviewed services.

**Tech Stack:** Node.js ESM, Express, better-sqlite3, Node `crypto.scrypt`,
browser WebAuthn APIs, `@simplewebauthn/server` only after explicit dependency
approval, Vitest, Node test runner.

---

## Risk Classification

Risk: A.

Reason: this changes auth model, credential storage, schema, login routes,
session issuance, and future production portal activation posture.

Current approval scope:

- allowed: repository design, read-only inventory, local tests, and safe docs;
- blocked: production SQLite migration execution, provider secrets, public
  portal exposure, DNS/Nginx/systemd changes, real account credential handoff,
  payment activation, and production automatic subscription issuance.

Product decision update, 2026-06-03:

- real email-code delivery and email magic links are no longer planned;
- existing email-code client stubs may remain hidden and fail-closed only for
  compatibility while that path is retired;
- do not create implementation tasks for SMTP, SES, mail-code tables, email
  magic links, or email recovery unless a future explicit product decision
  reverses this boundary.

Product decision update, 2026-06-04:

- the user portal now uses an order/request path for logged-in durable accounts:
  the request step records duration, quantity, and client target without
  creating runtime tenants, entitlements, issued links, or subscription URLs;
- refresh/copy/disable are order-row operations for already-issued records and
  must not physically delete order/request records;
- this repo-only path does not authorize public portal exposure, production
  mutation, payment activation, or automatic trial/monthly/yearly issuance.

Repo-only implementation status, 2026-06-03:

Completed:

- durable password credential table and scrypt password credential service;
- durable second-factor challenge table and auth-service completion path;
- durable passkey credential table/store primitives only;
- default-off backend human challenge route and verifier;
- default-off backend password session route;
- default-off backend password second-factor completion route;
- repository-only `portal-initial-account-issuance` service;
- dry-run-first `platform-issue-portal-initial-account` CLI and gccgw facade;
- HTTP client password login and second-factor completion calls.

Not completed:

- production SQLite migration execution;
- public portal exposure, DNS, Nginx, systemd, AWS, or provider changes;
- real account credential handoff outside protected local files;
- admin HTTP route for issuing initial accounts;
- production automatic entitlement or subscription material issuance;
- automatic trial/monthly/yearly self-service issuance;
- WebAuthn/passkey registration and assertion verification service;
- HTTP client/UI backend human-challenge request flow;
- backend TOTP/passkey enrollment routes for Personal Center;
- password rotation flow after `mustRotate=true`.

Expected PR sequence:

1. Design and migration gate documentation.
2. Repository-only schema/service/tests with default-off routes.
3. Admin/operator issuance and portal frontend wiring against local services.
4. Separate production migration and public-boundary runbook if the operator
   later approves activation.

## Current Read-Only Inventory

Known durable tables already exist in
`server/services/platform/subscription-control-db.mjs`:

- `platform_accounts`
- `platform_entitlements`
- `platform_portal_entries`
- `platform_portal_totp_credentials`
- `platform_portal_sessions`
- `platform_portal_password_credentials`
- `platform_portal_passkey_credentials`
- `platform_portal_second_factor_challenges`

Known backend services already exist:

- `server/services/platform/user-portal-auth.mjs`
  - `issueDynamicEntry`
  - `enrollTotpCredential`
  - `verifyTotpAndCreateSession`
  - `verifyPasswordAndMaybeChallenge`
  - `completeSecondFactor`
- `server/services/platform/portal-password-credentials.mjs`
  - `issueInitialPasswordCredential`
  - `verifyPasswordCredential`
- `server/services/platform/portal-human-challenge.mjs`
  - `issueChallenge`
  - `verifyChallenge`
- `server/services/platform/portal-initial-account-issuance.mjs`
  - `issuePortalInitialAccount`
Known HTTP portal routes already exist and are default-off:

- `POST /api/portal/human-challenges`
- `POST /api/portal/password/session`
- `POST /api/portal/password/second-factor`
- `POST /api/portal/entry/enroll`
- `POST /api/portal/session`
- `POST /api/portal/access-requests`
- `GET /api/portal/access-requests/current`
- `POST /api/portal/access-requests/refresh`
- `POST /api/portal/access-requests/disable`

Remaining gaps:

- no passkey registration or assertion challenge route;
- no WebAuthn verification service;
- no admin HTTP route that issues initial portal accounts;
- no production handoff workflow outside protected local files;
- no password rotation route or UI for `mustRotate=true`;
- no delete route for user portal subscription/order records;
- no direct self-service subscription-generation route in the user portal;
- HTTP client does not yet request backend human challenges for the normal UI;
- Personal Center TOTP/passkey enrollment is still local-preview only on the
  frontend HTTP path;
- local `#/portal-preview` accounts are in memory only and are not production
  account rows.

## Product Boundary

The production model is not public self-registration.

Accepted model:

```text
operator-reviewed lead or operator-provided safe account input
  -> durable platform account
  -> durable entitlement when approved
  -> operator-issued initial portal credential package
  -> first password login
  -> forced account security setup
  -> TOTP and/or WebAuthn passkey second factor
  -> short-lived portal session
  -> order/request submission
  -> reviewed order delivery path
```

Rejected model:

```text
public visitor
  -> creates account directly
  -> receives account/entitlement automatically
  -> receives monthly/yearly subscription material automatically
```

## File Map

Created in repo-only implementation:

- `server/services/platform/portal-password-credentials.mjs`
- `server/services/platform/portal-human-challenge.mjs`
- `server/services/platform/portal-initial-account-issuance.mjs`
- `scripts/platform-issue-portal-initial-account.mjs`
- `server/tests/platform-portal-password-credentials.test.mjs`
- `server/tests/platform-portal-human-challenge.test.mjs`
- `server/tests/platform-portal-initial-account-issuance.test.mjs`
- `server/tests/platform-issue-portal-initial-account-cli.test.mjs`
- `server/tests/portal-self-service-subscription-routes.test.mjs`
  - legacy self-service injection is ignored by the portal route and order
    requests remain pending.

Still planned:

- `server/services/platform/portal-passkey-credentials.mjs`
- `server/tests/platform-portal-passkey-credentials.test.mjs`
- full WebAuthn route tests after dependency approval

Modify:

- `server/services/platform/subscription-control-db.mjs`
- `server/services/platform/user-portal-auth.mjs`
- `server/routes/user-portal.mjs`
- `server/app.mjs`
- `server/tests/platform-subscription-control-db.test.mjs`
- `server/tests/platform-user-portal-auth.test.mjs`
- `server/tests/user-portal-routes.test.mjs`
- `server/services/cli/router.mjs`
- `server/tests/cli-router.test.mjs`
- `package.json`
- `admin/src/features/user-portal/user-portal-client.ts`
- `admin/src/features/user-portal/user-portal-page.tsx`
- `admin/src/test/user-portal.test.tsx`
- `docs/USER_PORTAL_AUTH_BOUNDARY.md`
- `docs/USER_PORTAL_FLOW.md`
- `docs/USER_PORTAL_HUMAN_CHALLENGE_DESIGN.md`

Dependency gate:

- Add `@simplewebauthn/server` only in the passkey implementation PR and only
  after explicit operator approval. Do not hand-roll WebAuthn signature
  validation.

## Task 1: Durable Credential Schema

**Files:**

- Modify: `server/services/platform/subscription-control-db.mjs`
- Test: `server/tests/platform-subscription-control-db.test.mjs`

- [x] **Step 1: Write failing schema tests**

Add tests that assert:

- a password credential can be created for an existing account;
- serialized account summaries never expose password hash, salt, challenge
  answer, passkey public key, credential id, or raw credential material;
- passkey credentials can be stored and listed by account;
- second-factor challenges expire and cannot be reused;
- failed writes roll back when grouped with account/session mutations.

Test outline:

```js
test("subscription control store persists portal password credential summaries safely", () => {
  withStore((store) => {
    const now = "2026-06-03T00:00:00.000Z";
    store.createAccount({
      id: "acct_auth_1",
      ownerRef: "owner_safe_ref",
      status: "active",
      createdAt: now,
      updatedAt: now
    });

    const credential = store.createPortalPasswordCredential({
      id: "pwd_cred_1",
      accountId: "acct_auth_1",
      passwordHash: "scrypt:params:hash-ref",
      status: "active",
      mustRotate: true,
      createdAt: now,
      updatedAt: now
    });

    assert.equal(credential.accountId, "acct_auth_1");
    const serialized = JSON.stringify(store.getAccountControlSummary("acct_auth_1"));
    assert.doesNotMatch(serialized, /passwordHash|scrypt:params:hash-ref|credential/i);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run:

```powershell
npm test -- --test-name-pattern "portal password credential"
```

Expected:

```text
FAIL createPortalPasswordCredential is not a function
```

- [x] **Step 3: Add minimal schema and store methods**

Add tables inside the existing `db.exec()` block:

```sql
create table if not exists platform_portal_password_credentials (
  id text primary key,
  account_id text not null references platform_accounts(id) on delete cascade,
  password_hash text not null,
  status text not null check (status in ('active', 'revoked', 'locked')),
  failure_count integer not null default 0 check (failure_count >= 0),
  locked_until text,
  must_rotate integer not null default 0 check (must_rotate in (0, 1)),
  created_at text not null,
  last_verified_at text,
  revoked_at text,
  updated_at text not null
);

create index if not exists platform_portal_password_credentials_account_id_idx
  on platform_portal_password_credentials(account_id);
create index if not exists platform_portal_password_credentials_status_idx
  on platform_portal_password_credentials(status);

create table if not exists platform_portal_passkey_credentials (
  id text primary key,
  account_id text not null references platform_accounts(id) on delete cascade,
  credential_id text not null unique,
  credential_id_hash text not null unique,
  public_key_jwk_json text not null,
  sign_count integer not null default 0 check (sign_count >= 0),
  transports_json text not null default '[]',
  status text not null check (status in ('active', 'revoked', 'locked')),
  created_at text not null,
  last_verified_at text,
  revoked_at text,
  updated_at text not null
);

create index if not exists platform_portal_passkey_credentials_account_id_idx
  on platform_portal_passkey_credentials(account_id);
create index if not exists platform_portal_passkey_credentials_status_idx
  on platform_portal_passkey_credentials(status);

create table if not exists platform_portal_second_factor_challenges (
  id text primary key,
  account_id text not null references platform_accounts(id) on delete cascade,
  challenge_hash text not null,
  allowed_factors_json text not null,
  status text not null check (status in ('active', 'used', 'expired', 'locked')),
  failure_count integer not null default 0 check (failure_count >= 0),
  expires_at text not null,
  used_at text,
  created_at text not null,
  updated_at text not null
);

create index if not exists platform_portal_second_factor_account_id_idx
  on platform_portal_second_factor_challenges(account_id);
create index if not exists platform_portal_second_factor_status_idx
  on platform_portal_second_factor_challenges(status);
```

Store methods:

```js
createPortalPasswordCredential(input)
getActivePortalPasswordCredential(accountId)
recordPortalPasswordVerificationFailure(id, { updatedAt, lockedUntil })
markPortalPasswordVerified(id, { verifiedAt, updatedAt })
createPortalPasskeyCredential(input)
getPortalPasskeyCredentialByCredentialId(credentialId)
listActivePortalPasskeyCredentials(accountId)
markPortalPasskeyVerified(id, { verifiedAt, signCount, updatedAt })
createPortalSecondFactorChallenge(input)
getPortalSecondFactorChallenge(id)
markPortalSecondFactorChallengeUsed(id, { usedAt, updatedAt })
recordPortalSecondFactorChallengeFailure(id, { updatedAt })
```

- [x] **Step 4: Run focused DB tests**

Run:

```powershell
npm test -- --test-name-pattern "portal password|portal passkey|second-factor"
```

Expected:

```text
PASS server/tests/platform-subscription-control-db.test.mjs
```

## Task 2: Password Credential Service

**Files:**

- Create: `server/services/platform/portal-password-credentials.mjs`
- Modify: `server/services/platform/user-portal-auth.mjs`
- Test: `server/tests/platform-portal-password-credentials.test.mjs`
- Test: `server/tests/platform-user-portal-auth.test.mjs`

- [x] **Step 1: Write failing tests**

Cover:

- issuing a password credential stores only a hash;
- wrong password returns a generic `invalid_login` error;
- inactive account cannot log in;
- active account with no second factor creates a session only if policy allows
  first-login setup;
- account with enabled TOTP/passkey returns `second_factor_required`;
- repeated failures increment failure count and lock the credential.

Test helper:

```js
import { randomUUID } from "node:crypto";

function buildTestPassword() {
  return randomUUID();
}
```

- [x] **Step 2: Run test to verify it fails**

Run:

```powershell
npm test -- --test-name-pattern "password credential"
```

Expected:

```text
FAIL Cannot find module '../services/platform/portal-password-credentials.mjs'
```

- [x] **Step 3: Implement password hashing with Node scrypt**

Use Node standard crypto first to avoid a native dependency in the initial
repository implementation.

Service contract:

```js
issueInitialPasswordCredential({
  accountId,
  plainPassword,
  issuedByRef,
  approvalRef,
  mustRotate
})

verifyPasswordCredential({
  accountId,
  plainPassword,
  requestContext
})
```

Hash record format:

```text
scrypt$v=1$N=32768$r=8$p=1$<saltBase64Url>$<hashBase64Url>
```

Rules:

- use `crypto.scrypt` or `crypto.scryptSync` with explicit parameters;
- generate at least 16 random bytes of salt;
- compare derived hashes with `timingSafeEqual`;
- never return `plainPassword` or `passwordHash`;
- store `mustRotate=true` for operator-issued initial credentials;
- emit only safe audit refs.

- [x] **Step 4: Wire password login into auth service, not routes directly**

Add to `createUserPortalAuthService()`:

```js
verifyPasswordAndMaybeChallenge(input)
completeSecondFactor(input)
```

`verifyPasswordAndMaybeChallenge` returns:

```js
{
  result: {
    status: "second_factor_required",
    challengeRef,
    accountId,
    availableFactors,
    expiresAt
  }
}
```

or:

```js
{
  session: {
    sessionRef,
    accountId,
    authMethod: "password",
    status,
    issuedAt,
    expiresAt
  }
}
```

The direct session path is allowed only for first-login setup policy. If the
account already has enabled TOTP or passkey factors, password verification must
not create a session until a second factor verifies.

- [x] **Step 5: Run focused auth tests**

Run:

```powershell
npm test -- --test-name-pattern "password credential|second factor"
```

Expected:

```text
PASS server/tests/platform-portal-password-credentials.test.mjs
PASS server/tests/platform-user-portal-auth.test.mjs
```

## Task 3: Backend Human Challenge Enforcement

**Files:**

- Create or modify: `server/services/platform/portal-human-challenge.mjs`
- Modify: `server/routes/user-portal.mjs`
- Test: `server/tests/user-portal-routes.test.mjs`

- [x] **Step 1: Write failing route tests**

Cover:

- `POST /api/portal/human-challenges` returns prompt and challenge ref;
- response never includes the answer;
- password login rejects missing, expired, used, wrong-scope, or wrong-answer
  challenge with the same external error;
- `entry/enroll` and `session` verify challenges before calling auth service.

- [x] **Step 2: Implement in-memory challenge service first**

Contract:

```js
issueChallenge({ scope, requestContext })
verifyChallenge({ challengeRef, answer, scope, requestContext })
```

Rules:

- expiry: 180 seconds;
- one-time use;
- max 3 failed attempts per challenge;
- uniform external error: `human_verification_failed`;
- no raw IP, raw user agent, answer, answer hash, credential, token, or
  subscription material in responses.

- [x] **Step 3: Wire default-off route**

Add route only when user portal routes are explicitly enabled:

```text
POST /api/portal/human-challenges
```

Update `USER_PORTAL_PUBLIC_PATHS` in `server/app.mjs` only after tests prove the
route remains unavailable when portal routes are not enabled.

- [x] **Step 4: Run focused route tests**

Run:

```powershell
npm test -- --test-name-pattern "human challenge|user portal routes"
```

Expected:

```text
PASS server/tests/user-portal-routes.test.mjs
```

## Task 4: Passkey / WebAuthn Credential Service

**Files:**

- Create: `server/services/platform/portal-passkey-credentials.mjs`
- Modify: `server/services/platform/subscription-control-db.mjs`
- Modify: `server/services/platform/user-portal-auth.mjs`
- Modify: `server/routes/user-portal.mjs`
- Test: `server/tests/platform-portal-passkey-credentials.test.mjs`
- Test: `server/tests/portal-auth-password-routes.test.mjs`

Current status:

- [x] Durable passkey table and store primitives exist.
- [ ] `@simplewebauthn/server` dependency has not been approved or added.
- [ ] WebAuthn registration/assertion service is not implemented.
- [ ] Passkey HTTP registration/assertion routes are not implemented.
- [ ] Current frontend passkey export remains local-preview only and is not a
  production WebAuthn proof.

- [ ] **Step 1: Request dependency approval**

Proposed dependency:

```powershell
npm install @simplewebauthn/server
```

Reason: WebAuthn signature validation, authenticator data parsing, challenge
verification, and counter handling are security-sensitive. Do not hand-roll this
protocol.

- [ ] **Step 2: Write failing WebAuthn service tests**

Cover:

- registration options are scoped to account id and origin;
- registration verification stores public key, credential id, credential id
  hash, transports, and sign counter;
- assertion options list only active credentials for the account;
- assertion verification updates sign counter and creates a session;
- replayed or stale challenge fails;
- response summaries omit public key material and credential ids.

- [ ] **Step 3: Implement passkey service**

Service contract:

```js
startPasskeyRegistration({ accountId, sessionRef, origin, rpId })
finishPasskeyRegistration({ accountId, sessionRef, response, origin, rpId })
startPasskeyAuthentication({ accountId, challengeRef, origin, rpId })
finishPasskeyAuthentication({ accountId, challengeRef, response, origin, rpId })
```

Rules:

- passkey enrollment belongs in Personal Center or forced first-login setup;
- passkey is not a login-page parallel first-factor button;
- passkey assertion is a second factor after password verification unless a
  later policy explicitly allows passwordless login;
- store WebAuthn public key material only in the credential table;
- do not export or display private keys;
- do not accept local preview JSON packages on the HTTP path.

- [ ] **Step 4: Run passkey tests**

Run:

```powershell
npm test -- --test-name-pattern "passkey|WebAuthn"
```

Expected:

```text
PASS server/tests/platform-portal-passkey-credentials.test.mjs
PASS server/tests/portal-auth-password-routes.test.mjs
```

## Task 5: Operator-Issued Initial Accounts

**Files:**

- Create: `server/services/platform/portal-initial-account-issuance.mjs`
- Create: `scripts/platform-issue-portal-initial-account.mjs`
- Still planned: `server/routes/admin-platform.mjs`
- Modify: `server/services/cli/router.mjs`
- Test: `server/tests/platform-portal-initial-account-issuance.test.mjs`
- Test: `server/tests/platform-issue-portal-initial-account-cli.test.mjs`
- Test: `server/tests/cli-router.test.mjs`

Current status:

- [x] Repository-only issuance service creates or validates a durable account.
- [x] Service writes an initial password credential through the password
  service, with `mustRotate=true`.
- [x] Service returns the one-time plaintext only as private handoff material,
  not in summaries.
- [x] CLI defaults to dry-run and does not create the DB or handoff file.
- [x] CLI execution requires `--execute-production-mutation`,
  `--approval-ref`, `--control-db-path`, and `--handoff-file`.
- [x] CLI facade and npm script are registered.
- [ ] Admin HTTP route for issuing initial accounts is not implemented.
- [ ] Entitlement creation is not wired into this service.
- [ ] Optional dynamic portal entry issuance is not wired into this service.

- [x] **Step 1: Write failing operator tests**

Completed coverage:

- service creates or validates an active account row when explicitly requested;
- initial password credential is written as hash only;
- handoff material is visible once and excluded from summaries;
- generated credentials are marked `mustRotate=true`;
- CLI `--dry-run` returns only safe planned refs;
- non-dry-run requires explicit approval and protected output path.

Still planned coverage:

- admin/operator HTTP path creates account row when explicitly requested;
- generated accounts require enforced password rotation and security setup at
  first login;
- entitlement and dynamic portal entry issuance remain separate until reviewed.

- [x] **Step 2: Implement account issuance service**

Use a service method instead of route-local writes:

```js
issuePortalInitialAccount({
  accountId,
  ownerRef,
  displayName,
  issuedByRef,
  approvalRef
})
```

Rules:

- write `platform_accounts` first;
- write password credential with `mustRotate=true`;
- return one-time handoff material only from the service private result;
- write handoff material only to a protected local file path in the CLI
  execution path;
- chat, docs, logs, summaries, and PR body must never include the initial
  password.

- [x] **Step 3: Run operator tests**

Run:

```powershell
npm test -- --test-name-pattern "portal initial account|issue portal account"
```

Expected:

```text
PASS server/tests/platform-portal-initial-account-issuance.test.mjs
PASS server/tests/platform-issue-portal-initial-account-cli.test.mjs
PASS server/tests/cli-router.test.mjs
```

## Task 6: Frontend HTTP Client and Portal UI

**Files:**

- Modify: `admin/src/features/user-portal/user-portal-client.ts`
- Modify: `admin/src/features/user-portal/user-portal-page.tsx`
- Modify: `admin/src/test/user-portal.test.tsx`

Current status:

- [x] HTTP client posts password login to
  `POST /api/portal/password/session`.
- [x] HTTP client maps backend TOTP factor names into portal
  `authenticator` second-factor choices.
- [x] HTTP client posts second-factor completion to
  `POST /api/portal/password/second-factor`.
- [x] Local preview remains isolated to `#/portal-preview`.
- [ ] `#/portal` still does not request backend human challenges before login.
- [ ] Personal Center HTTP TOTP enrollment routes are not wired.
- [ ] Personal Center HTTP passkey/WebAuthn registration routes are not wired.
- [ ] Password rotation UI for `mustRotate=true` is not implemented.

- [ ] **Step 1: Write failing Admin UI tests**

Cover:

- `#/portal` requests backend human challenge instead of generating authoritative
  math locally;
- password login calls the HTTP password session route;
- second-factor challenge shows TOTP and passkey options only after password
  succeeds;
- Personal Center enrollment calls backend TOTP/passkey routes on HTTP client;
- local preview keeps its in-memory demo behavior isolated to `#/portal-preview`.

- [ ] **Step 2: Implement HTTP client methods**

Completed methods:

```ts
authenticate(input)
completeSecondFactor(input)
```

Still planned methods:

```ts
requestHumanChallenge(input)
startAuthenticatorEnrollment(input)
confirmAuthenticatorEnrollment(input)
startPasskeyRegistration(input)
finishPasskeyRegistration(input)
```

Rules:

- no entry-token tab on normal login;
- no standalone authenticator tab on normal login;
- no local preview passkey JSON package on HTTP path;
- session state comes only from backend response;
- refresh challenge after failed human verification.

- [ ] **Step 3: Run Admin tests**

Run:

```powershell
npm run admin:test -- user-portal
npm run admin:build
```

Expected:

```text
PASS admin user-portal tests
PASS admin build
```

## Task 7: Full Repository Validation

Current validation run, 2026-06-03:

- [x] `git diff --check`
- [x] `git diff --check origin/master...HEAD`
- [x] `npm test`
- [x] `npm run admin:test`
- [x] `npm run admin:build`
- [x] `npm run project-state:check`

Run:

```powershell
git diff --check
git diff --check origin/master...HEAD
npm test
npm run admin:test
npm run admin:build
npm run project-state:check
```

Expected:

```text
all commands pass
```

If any command fails, do not report the auth line as complete. Fix or explicitly
record the blocker.

## Production Migration Gate

Before any production SQLite mutation:

1. Read-only inventory:
   - service unit and release ref;
   - active `SUBSCRIPTION_CONTROL_DB_PATH`;
   - SQLite file owner, mode, size, WAL files;
   - `sqlite3 .schema` redacted table list;
   - `pragma integrity_check`;
   - current portal route exposure.
2. Backup:
   - stop mutation path or hold maintenance gate;
   - create protected DB backup with mode `0600`;
   - record backup path as a protected host fact, not in public docs.
3. Dry run:
   - run migration on copied DB in a clean local/private environment;
   - run focused DB/auth tests against the copied DB;
   - verify rollback by restoring the copy.
4. Operator approval:
   - exact release ref;
   - exact migration command;
   - exact validation commands;
   - rollback command.
5. Production execution:
   - run migration once;
   - run `pragma integrity_check`;
   - start service with portal routes still private/default-off unless a separate
     public-boundary gate is approved.
6. Rollback:
   - disable new portal routes or feature flag;
   - restore DB backup only if migration causes operational failure;
   - keep added tables if rollback is route-disable only and no data corruption
     occurred.

## Non-Goals For This Plan

- No public self-registration.
- No production automatic entitlement issuance.
- No production automatic subscription URL delivery.
- No monthly/yearly self-service issuance.
- No user portal physical delete for subscription/order records.
- No email-code delivery, SMTP/SES mail issuance, or email magic links. This is
  a retired product path, not a paused backlog item.
- No Google/OAuth provider integration.
- No CAPTCHA provider secret.
- No production public portal route.
- No DNS, Nginx, HTTPS, systemd, or security-group changes.
- No raw credentials, tokens, subscription URLs, customer data, or handoff
  material in repository files.

## Acceptance Criteria

The repository implementation can be considered complete only when:

- production login path uses durable account and credential rows;
- local preview remains isolated to `#/portal-preview`;
- password hash is never returned or logged;
- passkey verification uses WebAuthn, not exported JSON or click-only proof;
- TOTP setup requires QR/manual key binding plus code confirmation;
- password login for accounts with enabled factors returns second-factor
  challenge and does not create a session;
- backend human challenge is server-issued, expiring, one-time, and verified
  before auth-sensitive operations;
- all focused and full validation commands pass;
- production activation remains behind a separate Risk A runbook.
