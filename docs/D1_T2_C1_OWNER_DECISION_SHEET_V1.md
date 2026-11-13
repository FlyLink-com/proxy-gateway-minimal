# D1 T2-C1 Identity Provider and Owner Decision Sheet v1

```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: d1_t2_c1_owner_decision_sheet
  superseded_by: null
  last_verified_at: 2026-11-10
  production_authority: false
```


> Status: OWNER DECISION REQUIRED — provider-neutral boundary code is implemented in Draft; no identity provider, tenant, account, real identity, credential, or production resource is selected or configured.
> Source anchor: master@be261abc60f28bb2733764fa5364ab44b3e76844
> Draft branch: docs/d1-target-schema-g6-rehearsal-plan-20261107
> Production authority: BWH remains the only production writer.

## 1. Current decision

C1 must move authentication and direct identity custody out of the Cloudflare business control-plane Worker and D1. The business Worker receives only a short-lived opaque actor context after an identity gateway has validated the provider assertion.

The following source contract is now implemented:
- server/services/platform/d1-t2-identity-boundary.mjs
- server/tests/d1-t2-identity-boundary.test.mjs

The helper validates a strict actor-context schema, issuer allowlist, audience, short expiry, authentication factors, opaque subject/account/session references, and exact D1 identity-binding records. It rejects extra fields such as email, displayName, password, TOTP code, access/refresh token and authorization code. It also fails closed for unknown, duplicate, revoked or account-mismatched identity bindings and prevents a second active identity from being attached to an already-bound account.

Important limitation: this helper validates the internal actor-context contract. It does not verify OIDC/JWKS signatures and must only be called after a separate gateway has verified issuer, audience, signature, nonce, expiry and required authentication strength. The business Worker must not expose a public bypass route; only the approved private service-binding path may call it.

Local focused verification: Node v22.16.0, 9/9 tests PASS. The exact repository test file has been added but has not yet been rerun in the project-fixed Node v22.23.1 environment. No CI or full repository suite was run.

## 2. Provider choice

### Option A — Auth0 Essentials + Bulk User Import (recommended managed candidate)

Advantages:
- Current provider evaluation found a direct import schema for the project's scrypt parameters and a TOTP factor import path.
- Managed OIDC, Android SDK, MFA, user directory and account lifecycle reduce ongoing identity-service operations.
- Two isolated tenants can be used for Portal and Admin; the plan includes three tenants in the evaluated Essentials tier.

Blocking conditions:
- Imported scrypt credentials are re-hashed to the provider's native bcrypt after successful first login. The provider's bcrypt path has a 72 UTF-8-byte ceiling.
- Existing passwords above 72 UTF-8 bytes cannot be truncated or silently accepted. The affected production-user count is UNKNOWN because no production identity rows were read.
- The exact email verification/OTP attempt and rate-limit behavior, first-login rehash behavior, TOTP import acceptance, ±1 interval, lockout and Portal/Admin tenant isolation still require an isolated provider proof.
- Legacy v2 AES-GCM TOTP envelopes have no key ID and require the approved C2 one-time decrypt/transfer process. The historical enc: prefix is raw Base32, not ciphertext.

Recommended policy if Option A is selected:
- Preserve existing passwords for the import-compatible range.
- For a password above 72 UTF-8 bytes, require a targeted, user-notified reset before migration/login. Never truncate.
- Import synthetic TOTP factors in an isolated proof first. Real factor transfer remains separately authorized and must not write plaintext seeds to disk, logs, D1, Worker request bodies or evidence.
- Use separate Portal and Admin tenants, separate clients, issuer references, factor policies and administrative credentials.
- Keep Admin directory search behind a separate Admin identity-directory service with least-privilege provider scopes.

### Option B — Keycloak with custom PasswordHashProvider (fallback if no password reset is acceptable)

Advantages:
- A custom provider can verify the exact existing Node scrypt envelope and re-hash after successful login without the Auth0 bcrypt 72-byte limitation.
- A controlled TOTP importer can preserve existing factors without blanket re-enrollment.
- Separate realms or deployments can isolate Portal and Admin.

Costs and risks:
- Requires custom Java extension, exact-release compatibility tests, an isolated identity database, HA, backup/restore, upgrades, monitoring, patching and an accountable security operator.
- It is a self-operated identity service and adds infrastructure/operational work to the Cloudflare migration.

### Other candidates

Clerk remains conditional on vendor confirmation that the current raw 16-byte Node scrypt salt is preserved byte-for-byte; the reviewed Werkzeug string-salt format does not establish that. Firebase Identity Platform and Cognito do not expose a documented existing-TOTP-seed bulk-import path in the reviewed APIs; they require TOTP re-enrollment or a separate challenge service. They are not the first choice under a no-TOTP-loss requirement.

## 3. Required target flow

1. Browser/Android performs registration, email verification, password login and TOTP/passkey with the selected identity authority using Authorization Code + PKCE.
2. The identity authority owns normalized email, verification state, password hash, lockout, TOTP factors, recovery and profile.
3. An identity gateway validates provider issuer, audience, signature, nonce, expiry and required authentication strength. It strips the original assertion and credential headers.
4. The gateway calls the business control-plane Worker only over the private service-binding path and forwards the strict actor context: issuerRef, subjectRef, accountRef, sessionRef, authTimeMs, expiresAtMs, factors and fixed audience.
5. The business Worker validates the actor-context contract and resolves the opaque account binding. It never receives email, display name, password, TOTP code, recovery code, authorization code, access token or refresh token.
6. D1 stores only opaque account-to-identity binding and approved non-secret lifecycle facts. Exact DDL and column names remain T3 decisions.
7. Admin directory search/display occurs through a separate Admin identity-directory path with explicit authorization and audit; raw email never enters the business Worker.
8. Coins canary uses an approved keyed pseudonym or provider eligibility decision, not raw email or an unkeyed low-entropy digest.

## 4. Compatibility rules that must not be silently changed

- Preserve registration deduplication and atomic trial/welcome-Coins behavior.
- Preserve generic invalid-login responses, password lockout and credential revocation.
- Preserve the current second-factor rule: when TOTP is enabled or locked, a password success alone must not create a session.
- Preserve email verification single-use and duplicate-registration behavior; rate-limit policy changes require explicit owner approval.
- Do not infer that mustRotate currently blocks session creation; the pinned user-portal-auth path does not itself read that flag.
- Preserve current user-visible account display behavior through a separate identity-profile channel. Product owner must choose masked email or a user-managed display name; no UI behavior is silently changed.
- Provider outage fails closed for new login, registration, password/TOTP verification and Admin identity search. No fallback to D1 PII, raw email or unkeyed digest.

## 5. Decisions required from the project owner

| ID | Decision | Recommendation | Status |
|---|---|---|---|
| C1-D01 | Identity provider | Auth0 Essentials if targeted reset for >72-byte passwords is acceptable; otherwise Keycloak custom scrypt | PENDING |
| C1-D02 | Passwords above 72 UTF-8 bytes | Targeted, user-notified reset; never truncate | PENDING |
| C1-D03 | Portal/Admin separation | Separate Auth0 tenants or separate Keycloak realms/deployments, with separate issuer refs and factors | PENDING |
| C1-D04 | Existing TOTP | Prove synthetic import first; then preserve via provider import where accepted, otherwise explicit re-enrollment | PENDING |
| C1-D05 | Email verification policy | Preserve single-use, duplicate and rate-limit behavior unless an explicit product change is approved | PENDING |
| C1-D06 | Visible account label | Masked email or user-managed display name through identity-profile service; never route raw value through business Worker | PENDING |
| C1-D07 | Coins canary | Keyed PII pseudonym or provider eligibility claim | RECOMMENDED: keyed PII pseudonym |
| C1-D08 | Identity lifecycle owner | Assign accountable Identity/Privacy and Security roles | PENDING |

The first blocking owner decision is C1-D01/C1-D02. If the project owner rejects targeted resets for over-72-byte passwords, select Keycloak rather than weaken or truncate existing credentials. Do not create a provider tenant until the choice is explicit.

## 6. C1 completion evidence

C1 may be closed only after:
- Provider and Portal/Admin boundary are selected and approved.
- Synthetic hosted proof covers import, first login, password normalization, over-limit policy, email verification, TOTP, lockout, session projection and Admin directory.
- Provider adapter and gateway are implemented and tested against the selected provider.
- Account binding is unique, opaque, idempotent and fail-closed for ambiguous mappings.
- No raw PII or credential capability reaches the business Worker, D1, logs, traces, fixtures or evidence.
- Registration dedupe, trial/welcome-Coins, existing account compatibility and Coins canary behavior match the approved contract.
- The project owner records the data-processing, recovery, deletion/unlink and outage decisions.

No external identity tenant, real account import, production password, TOTP seed, provider API credential, BWH access, remote D1 mutation, deployment, dual-write, CI, PR Ready transition, merge or cutover is authorized by this sheet. BWH remains the only production writer.
