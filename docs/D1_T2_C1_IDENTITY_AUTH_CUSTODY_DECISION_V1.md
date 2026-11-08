# D1 T2-C1 Identity and Authentication Custody Decision v1

> **Status:** DRAFT PROPOSAL — owner decision required; not approved and not an implementation authorization.
> **Repository:** `FlyLink-com/proxy-gateway-minimal`
> **Draft branch:** `docs/d1-target-schema-g6-rehearsal-plan-20261107`
> **Source anchor:** `master@be261abc60f28bb2733764fa5364ab44b3e76844`
> **Pre-C1 Draft baseline:** `86a7637a9f60a78f37574db47afb9e9b102933e2`
> **Production authority:** BWH remains the only production writer until a separately approved cutover.
> **Scope:** Repository design and synthetic/local work only. No production identity, credential, secret, customer-row, BWH or remote Cloudflare access.

## 1. Decision summary

C1 cannot be closed by removing `loginRef` / `displayRef` from `platform_accounts.metadata_json`. Registration, password verification, second-factor verification, portal sessions, administrator search and the Coins canary currently share identity data and behavior.

**Recommended target boundary:** use an identity/authentication authority that is separate from the Cloudflare control-plane Worker and D1. Prefer a standards-based external identity provider (OIDC Authorization Code + PKCE) only if it can preserve the required password, email-verification, TOTP, lockout, credential-revocation and administrator-directory behavior. If no provider meets those requirements, use a dedicated first-party identity service with its own isolated identity/credential store and key custody. Do not create a substitute identity authority inside the control-plane D1.

The target control plane should receive only an opaque, stable identity subject and verified authentication context. D1 should retain the opaque account-to-identity binding and approved non-secret lifecycle facts. Email, display name, password hashes, TOTP secret material and raw authentication capabilities must not be copied into D1, control-plane Worker request/response bodies or forwarded headers, logs, traces, fixtures or evidence.

This is a recommendation, not a vendor selection. No identity provider, tenant, account, key, secret or remote resource is selected or configured by this document.

## 2. Non-negotiable invariants

1. BWH remains the current production source of truth and only production writer until an independent cutover decision.
2. The existing password-login capability must not be silently disabled merely because all 11 `platform_portal_password_credentials` fields are DEFER for D1.
3. The two Passkey JSON fields and Passkey credential schema remain DEFER; this proposal does not activate Passkey.
4. No raw email, display name, password hash, encrypted TOTP secret, raw TOTP secret, recovery code, bearer token, authorization code or other credential capability is persisted to D1 or written to logs/traces/fixtures/evidence.
5. No ordinary SHA-256 digest of an email, IP address or other low-entropy identifier is described as anonymization. Retained pseudonyms require the separately approved C2 HMAC contract.
6. No historical credential value is presumed to be encrypted because of a prefix. In particular, legacy `enc:<base32>` is raw Base32 secret material under the current verifier.
7. Identity-provider outage, invalid assertion, unknown issuer/subject, duplicate binding or ambiguous identity resolution must fail closed. No fallback to raw PII or an unkeyed digest in D1.
8. Source-level findings and synthetic tests do not establish that User Portal or Admin Auth routes are active in production. Production activation remains NOT OBSERVED.

## 3. Source-derived compatibility baseline

The source audit is pinned to `be261abc60f28bb2733764fa5364ab44b3e76844`. The relevant source blobs and behavior are:

| Area | Source evidence | Current behavior that must be reconciled |
| --- | --- | --- |
| Registration | `portal-registration.mjs`, blob `df3a67dc61f94f4d4c14043b3fbf49418d419b39` | Email is normalized (trim + lowercase); duplicate detection compares ordinary SHA-256 digests; raw email is written to `loginRef` and `displayRef`; the public session display label is derived from the email. Registration also creates the trial / welcome-Coins path. |
| Login resolver | `subscription-control-db.mjs`, blob `bc6694a93f452f97393ff6f1a8099e854c0b19ac` | Exact account ID is checked first. Otherwise active accounts are scanned for `loginRef` / `displayRef`; only one matching account resolves. Multiple matches return `ambiguous`; no match returns `not_found`. |
| Password login | `user-portal-auth.mjs`, blob `f9e4e7036b079a63092898a15948424b074a067a`; `portal-password-credentials.mjs`, blob `ca9a5f201487f89202aff60e01f504c1622b4c28` | Login resolves the account before password verification. Password verification is account-bound, returns generic invalid-login behavior, updates failure counters/lockout and records verification. The credential service is conditionally wired for User Portal/Admin Auth routes; production activation is NOT OBSERVED. |
| Password credential schema | `subscription-control-db.mjs`, source blob above | The 11 columns are `id`, `account_id`, `password_hash`, `status`, `failure_count`, `locked_until`, `must_rotate`, `created_at`, `last_verified_at`, `revoked_at`, `updated_at`. All 11 remain DEFER for D1. DEFER is a data-disposition decision, not feature-retirement approval. |
| TOTP | `portal-totp-verifier.mjs`, blob `f093ed7693e829bb40d93e15f0dce09ca689ce60`; `state.mjs`, blob `da3ddbe459d44d75e80cb196b2454ebbd6f3212c` | Current AES-256-GCM envelope has no key ID. `USER_PORTAL_TOTP_SECRET_KEY` supplies one protector shared by User Portal and Admin TOTP. Legacy `enc:` is stripped and treated as Base32, not decrypted ciphertext. |
| Portal session | `user-portal-auth.mjs`, blob above | Public session currently derives `userRef` and `displayName` from `metadata.loginRef`, exposing the email-derived value. |
| Admin search/display | `admin-platform.mjs`, blob `0189b8b5b9bd06f66121caef65b2ec397d49d491` | Search computes ordinary SHA-256 of normalized email; account summaries project `loginRef`, `displayRef` and `displayName`. |
| Registration email verification | `portal-registration-email-verification.mjs`, blob `5e41587a648c526d7c53db3427ef5bd123450147`; route blob `28fc7c813fac4cad97f1845ab9ea66a01dbb586b` | Email and verification code are handled by the current Node route/service; verification state is in-memory and the rate-limit index uses ordinary SHA-256. The sender receives the raw email and code. |
| Coins canary | `portal-registration.mjs`, blob above; `state.mjs` | The optional canary eligibility reader receives an `emailDigest`; the existing behavior must be preserved without passing raw email or an unkeyed digest into the future control plane. |

### 3.1 Compatibility tests already present

The pinned source test suite includes tests for:
- unique `loginRef` password login;
- second-factor challenge after password when TOTP is enabled;
- locked TOTP remaining a required factor;
- password verification generic failure and lockout;
- TOTP verification, adjacent time window and invalid-format rejection;
- email verification single-use, registration dedupe and duplicate-trial prevention;
- Coins canary match, non-match and invalid eligibility result;
- registration cookie/session behavior.

These existing tests are source compatibility evidence, not proof of an external identity-provider adapter or a Cloudflare migration.

### 3.2 Existing provider-integration inventory

A targeted repository code search at the source anchor located no application-level OIDC/JWKS identity adapter or integration for Auth0, Clerk, Cognito, Keycloak or `openid-client`. The OIDC/JWKS references found were for GitHub Actions deployment/supply-chain trust, not User Portal or Admin authentication. An archived Admin UI shell note excluded Clerk/external auth for that specific UI-shell phase; it is not a current C1 identity-provider selection or a general prohibition. Therefore the current source does not establish an existing external identity authority.

### 3.3 Provider assessment (2026-11-07)

The separate [C1 identity-provider evaluation](D1_T2_C1_IDENTITY_PROVIDER_EVALUATION_V1.md) identifies **Auth0 Essentials + Bulk User Import** as the preferred managed candidate because its import schema supports the current scrypt parameter set and TOTP factors. This is not a vendor selection or tenant authorization. Keycloak with custom password/TOTP import is the no-reset fidelity fallback; Clerk remains conditional on vendor confirmation of the raw-salt Node scrypt format. Firebase Identity Platform and Cognito have no documented existing-TOTP-seed import path in their bulk/user-migration APIs. C1 remains BLOCKED until the synthetic provider proof and accountable-owner decisions pass.

## 4. Recommended target architecture (provider-neutral)

### 4.1 Identity and credential authority

The selected identity authority must own:
- normalized email and email verification;
- unique email-to-subject resolution;
- password hash storage and verification;
- password lockout, revocation and password-rotation state;
- TOTP enrollment, secret custody, verification, lockout and recovery;
- user profile/display-label retrieval;
- authorized administrator directory search and identity projection;
- account deletion / identity unlink lifecycle.

The authority must issue an immutable opaque subject identifier that is not an email, display name, email hash or other deterministic low-entropy identifier.

### 4.2 Browser and control-plane boundary

Preferred flow, subject to provider capability verification:

1. Browser registration, email verification, password login and TOTP enrollment/verification occur directly with the selected identity authority. Raw credentials do not transit the control-plane Worker.
2. The authority returns a short-lived, audience-bound signed identity assertion with minimal claims: issuer, opaque subject, audience, expiry, issue/authentication time and approved authentication-strength/factor claims. Email and display-name claims are excluded.
3. A dedicated edge/API authentication gateway (outside the business Worker) validates signature, issuer, audience, expiry, nonce and required authentication strength. It strips the user assertion and all inbound credential headers before forwarding the request.
4. The gateway forwards only a trusted opaque actor context (`issuerRef`, `subjectRef`, `accountRef` and approved auth-context flags) over a protected internal channel. The business Worker must not receive the original assertion, access/refresh token, authorization code, password, TOTP code or recovery capability in its body or headers. Direct calls that bypass the gateway must be rejected.
5. The gateway and Worker do not log or trace the assertion or credential material. Control-plane handlers operate on opaque references and business state only.

If the provider or edge gateway requires raw credentials, email claims or bearer assertions to pass through to the business Worker, it does not satisfy this proposal without a separately approved exception.

### 4.3 D1 identity binding (conceptual only; no DDL authorization)

D1 may hold a minimal binding equivalent to:

- `account_id`: existing stable opaque platform account identifier;
- `issuer_ref`: allowlisted identity-provider identifier;
- `subject_ref`: provider-issued opaque immutable subject;
- `status`: constrained lifecycle state;
- `created_at`, `updated_at`, optional `revoked_at`.

Required constraints:
- unique `(issuer_ref, subject_ref)`;
- one active binding per account for the selected identity policy;
- foreign key to the opaque platform account;
- no email, display name, password hash, TOTP secret, recovery code, provider access token or refresh token;
- no unkeyed low-entropy identity digest.

The exact table/column names, multi-provider linking policy and migration IDs remain T3 decisions after T2. This section is not target DDL.

### 4.4 Password credential disposition

- Keep all 11 current `platform_portal_password_credentials` columns DEFER from D1.
- Do not copy password hashes, salts, password credential rows or bearer credentials into D1.
- The selected authority must preserve password verification, generic invalid-login behavior, lockout/failure policy, the stored `mustRotate` state and its existing consumers, credential revocation and account binding. Do not infer that `mustRotate` currently blocks session creation: the pinned `user-portal-auth.mjs` path does not itself read that flag.
- The current password hash is a project-specific Node scrypt envelope: `scrypt$v=1$N=32768$r=8$p=1$<salt-base64url>$<64-byte-derived-base64url>`, using a 16-byte minimum salt and timing-safe comparison. Provider migration must prove exact hash import/verification compatibility or use an approved just-in-time legacy verifier that re-hashes only after successful login. If neither is supported, use an owner-approved, user-notified password-reset plan; never silently invalidate existing passwords.
- If the selected provider cannot preserve a required behavior, use a dedicated credential service outside D1 and outside the control-plane Worker request/response body; do not weaken the behavior or silently disable password login.
- A provider migration must not assume that the conditional source wiring means the feature is unused. Confirm production activation only through a separately authorized, non-customer-data deployment/configuration review; this round does not perform that review.

### 4.5 TOTP credential disposition

- Keep `platform_portal_totp_credentials.encrypted_totp_secret` EXTERNALIZE.
- D1 may retain approved non-secret lifecycle facts and an opaque external secret/credential reference.
- TOTP enrollment and verification occur at the identity authority; the control plane receives only a verified factor result and opaque credential reference.
- Preserve active/revoked/locked state, failure counter, lockout, enrollment, last verification and revocation behavior where these remain required.
- User Portal and Admin authentication must have separately scoped factors/clients and keys unless the Security owner explicitly approves a shared boundary.
- Key IDs, AES-GCM envelope, key separation, rotation/re-encryption, retirement and emergency revocation are C2 decisions. C1 does not authorize key creation or secret migration.
- Historical `enc:` and unprefixed Base32 values must be re-encrypted under an approved vault/key or quarantined/re-enrolled. Never treat them as ciphertext based on the prefix.

### 4.6 Registration, deduplication and Coins canary

- The identity authority owns email normalization and uniqueness. Preserve the source trim + lowercase normalization and reject duplicate normalized email atomically.
- The D1 account mapping is created only after verified identity creation; retries must be idempotent and must not create a second account, trial or welcome-Coins grant.
- Email verification delivery, verification code, attempt limits and rate limiting remain inside the identity authority or a separately approved identity service. The control-plane Worker receives only a verified result and opaque subject.
- Replace the current `emailDigest` canary callback with a provider-issued eligibility claim or an isolated eligibility decision that returns only a boolean/decision reference. Any keyed pseudonym format and key custody belong to C2.
- Preserve match/non-match behavior and reject malformed/unknown eligibility results before any account, entitlement or wallet write.

### 4.7 Portal display and Admin search

- `userRef` in the control-plane session becomes an opaque account/identity reference, never an email.
- The existing client-facing display behavior must be preserved through an identity-profile channel that does not route raw email/display name through the control-plane Worker. The product owner must choose the visible label (masked email or user-managed display name); this proposal does not silently choose a new UI behavior.
- Admin email search and display use a separate privileged identity-directory channel with explicit Admin authorization and audit. The control-plane Worker receives only opaque account references and authorization outcomes.
- If the provider cannot support safe, authorized Admin search/display without sending raw email through the control-plane Worker, C1 remains blocked pending an approved alternative.

## 5. Failure and lifecycle contract

| Condition | Required behavior |
| --- | --- |
| Identity authority unavailable | Fail closed for new login, registration, password verification, TOTP verification and Admin identity search; no D1 PII/digest fallback. |
| Unknown issuer, invalid signature/audience/expiry/nonce | Reject; do not create or refresh a session. |
| Unknown subject or missing account binding | Reject or enter an explicitly approved account-link flow; never guess by email digest. |
| Duplicate subject binding / ambiguous identity | Reject and raise a sanitized security event containing opaque refs only. |
| Duplicate normalized email at registration | Preserve duplicate-registration protection; no second account/trial/Coins grant. |
| Password invalid / locked / revoked | Preserve generic public invalid-login response; internal audit may record a typed outcome without password or email. |
| TOTP invalid / locked / revoked | Do not create a session; preserve challenge and lockout semantics. |
| Identity deletion / unlink | Revoke sessions and credential references; retain only owner-approved financial/audit tombstones under C5 policy. |
| Existing BWH production path before cutover | Remains the current authority. No speculative fallback or dual-write is introduced by this Draft proposal. |

## 6. Decisions still required from accountable owners

C1 cannot be marked complete until these decisions are explicit:

1. **Identity authority selection:** name the existing or new provider/service and prove support for email verification, stable opaque subject, password login, TOTP, lockout, revocation, account deletion and Admin directory operations.
2. **Source-of-truth ownership:** name the Identity/Privacy owner and Security owner; define who controls identity lifecycle and who can approve recovery or account linking.
3. **Portal/Admin separation:** choose one provider with separate clients/realms and scopes, or separate providers. Shared TOTP key scope is not assumed.
4. **Display policy:** choose masked email or user-managed display label; define whether any privileged role may retrieve the full email.
5. **Coins canary:** choose provider claim or isolated eligibility service; preserve existing eligibility behavior without exposing email or an unkeyed digest to the control plane.
6. **Password capability:** confirm the required product behavior and the external verifier's support for lockout, `mustRotate`, revocation and generic failure semantics. Do not interpret DEFER as retirement.
7. **Historical TOTP disposition:** choose re-enrollment or approved re-encryption/quarantine. Exact key mechanics remain under C2.
8. **Outage/recovery policy:** approve session continuation/revocation behavior during identity-provider outage and the account recovery path.

No owner names, vendor, retention period or production activation state are inferred in this proposal.

## 7. C1 synthetic acceptance matrix

All tests must use synthetic identities, synthetic passwords, synthetic TOTP secrets and isolated local stores.

| ID | Required assertion |
| --- | --- |
| C1-01 | Email normalization preserves trim + lowercase semantics; case/whitespace variants resolve to one identity. |
| C1-02 | Duplicate registration is atomic and cannot create a second account, trial or welcome-Coins grant. |
| C1-03 | Exact account-ID compatibility path and opaque subject lookup both resolve only the intended active account. |
| C1-04 | Unique identity lookup succeeds; unknown or ambiguous lookup fails with the existing generic public login error. |
| C1-05 | Password success, invalid password, lockout, stored `mustRotate` state/consumers, revocation and provider outage preserve defined behavior; the exact current scrypt envelope is import-compatible or has an approved JIT re-hash / reset path. |
| C1-06 | TOTP success, invalid code, challenge expiry, lockout, revocation and provider outage do not create unauthorized sessions. |
| C1-07 | Session response contains opaque `userRef`; no raw email/display name or credential material appears in control-plane response/log fixtures. |
| C1-08 | Authorized Admin search/display works through the separate identity-directory channel; unauthorized search fails closed. |
| C1-09 | Coins canary match/non-match is identical to the current policy; invalid eligibility results fail before writes. |
| C1-10 | D1 writer rejects raw email, display name, password hash, TOTP secret, recovery code, token and unkeyed low-entropy identity digests. |
| C1-11 | No raw email/password/TOTP code, authorization code, access/refresh token, recovery capability or user bearer assertion reaches the business Worker body or forwarded headers in the target browser flow; gateway bypass is rejected. |
| C1-12 | Identity deletion/unlink revokes sessions and external credential references without deleting immutable financial/audit facts outside the C5 policy. |

The tests must record exact Node version, command, output, fixture hash and tested adapter/provider contract. A source-mirroring harness alone is not repository test evidence.

## 8. Implementation sequence after owner decision

1. Record the selected identity authority, owner roles, Portal/Admin boundary and display/canary policies.
2. Define a provider-neutral adapter contract with typed outcomes for resolved/not-found/ambiguous/unavailable, password verification, TOTP verification, profile lookup and Admin directory lookup.
3. Add synthetic adapter tests for C1-01 through C1-12 without real accounts or keys.
4. Implement the selected adapter and route the browser authentication flow directly to the identity authority; keep raw credentials out of control-plane Worker bodies.
5. Replace account metadata identity lookups with opaque subject bindings; remove raw identity fields and unkeyed low-entropy digests from the D1 target candidate.
6. Keep the password credential table DEFER; externalize TOTP secret material and use opaque references only.
7. Run scoped repository Node tests locally, then the full required suite only after an explicit budget/CI decision.
8. Obtain separate Identity/Privacy and Security owner approvals, then independent review pinned to the exact final commit.

## 9. Current disposition

- **C1:** BLOCKED — Auth0 Essentials bulk import is the preferred managed candidate, but no vendor/tenant is selected or approved; synthetic import proof and owner decisions remain outstanding.
- **C2:** OPEN — key custody, key IDs, key separation and legacy compatibility remain separate blockers.
- **C3:** OPEN — account metadata/PII and independent review remain outstanding after writer-boundary hardening.
- **T2:** BLOCKED.
- **T3 / G6:** not started; remain gated on formal T2 completion.

This document adds a reviewable proposal only. It does not change authentication source code, D1 schema, migration code, production configuration or production authority. No BWH or Cloudflare production access, customer data, credentials, real keys, remote D1 mutation, Worker/DO deployment, CI, PR Ready transition, merge or cutover is authorized.
