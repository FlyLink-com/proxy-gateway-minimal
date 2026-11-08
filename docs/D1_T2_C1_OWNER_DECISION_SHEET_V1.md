# D1 T2-C1 Identity Provider and Owner Decision Sheet v1

> Status: PARTIALLY OWNER-APPROVED — on 2026-11-08 the project owner selected Auth0 Essentials + Bulk User Import, approved a targeted reset for passwords exceeding 72 UTF-8 bytes, and approved Portal/Admin identity isolation. No vendor tenant, account, real identity, credential, or production resource has been created or configured.
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

Focused source-slice verification: at exact HEAD `bc3f8c9a713de05715f42f733b8fa72ba53d4477`, Node v22.23.1, the reviewer reran four related repository test files and recorded 48/48 PASS, including `d1-t2-identity-boundary.test.mjs` and `platform-portal-identity-import-rehearsal.test.mjs`. This does not prove a hosted identity-provider integration, OIDC/JWKS gateway, >72-byte password behavior, production route activation or historical TOTP ownership. PR #842 source-slice review by `gccltdco-cmd` is APPROVED at that exact HEAD; C1 remains OPEN pending the owner decisions and hosted compatibility proof below. Full-suite comparative evidence and the no-hosted-CI caveat are recorded in the closeout matrix.

## 2. Provider choice

### Option A — Auth0 Essentials + Bulk User Import (owner-selected managed path; proof pending)

Advantages:
- Current provider evaluation found a direct import schema for the project's scrypt parameters and a TOTP factor import path.
- Managed OIDC, Android SDK, MFA, user directory and account lifecycle reduce ongoing identity-service operations.
- Two isolated tenants can be used for Portal and Admin; the plan includes three tenants in the evaluated Essentials tier.

Blocking conditions:
- Imported scrypt credentials are re-hashed to the provider's native bcrypt after successful first login. The provider's bcrypt path has a 72 UTF-8-byte ceiling.
- Existing passwords above 72 UTF-8 bytes cannot be truncated or silently accepted. Auth0's bcrypt storage path ignores bytes after the 72-byte boundary. The affected production-user count is UNKNOWN because no production identity rows were read; a one-way scrypt hash does not reveal the original password byte length.
- The exact email verification/OTP attempt and rate-limit behavior, first-login rehash behavior, TOTP import acceptance, ±1 interval, lockout and Portal/Admin tenant isolation still require an isolated provider proof.
- Owner-selected T1 (2026-11-08) supersedes the earlier transfer option: both legacy enc: and v2: TOTP values are invalidated at cutover; do not import, decrypt, transfer or re-encrypt them. Users re-enroll in Auth0 MFA.

Recommended policy if Option A is selected:
- Preserve existing passwords for the import-compatible range.
- For a password above 72 UTF-8 bytes, require a targeted, user-notified reset before that credential is imported or used for its first Auth0 login. Never truncate. If the account cannot be classified from an already-approved non-secret length marker, classify only when the user submits the password to the existing verifier and measure `Buffer.byteLength(password, "utf8")` in memory; do not log or persist the password. Accounts still unclassified at cutover must remain on the legacy authority or enter a separately approved reset cohort—never guess from the hash.
- Import synthetic TOTP factors in an isolated proof first. Real factor transfer remains separately authorized and must not write plaintext seeds to disk, logs, D1, Worker request bodies or evidence.
- Preserve the current password normalization contract: the existing Node credential service applies `String(password).trim()` before Scrypt. Prove that the Auth0 login path applies equivalent normalization or require a safe reset for any incompatible case; do not silently change effective password semantics.
- The current Node Scrypt envelope (`N=32768`, `r=8`, `p=1`, `keylen=64`, 16-byte salt) maps to Auth0 `custom_password_hash` parameters (`cost=32768`, `blockSize=8`, `parallelization=1`, `keylen=64`). Convert decoded salt/hash bytes to supported import encodings without ever materializing plaintext passwords.
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
| C1-D01 | Identity provider | Auth0 Essentials + Bulk User Import | APPROVED — 2026-11-08 |
| C1-D02 | Passwords above 72 UTF-8 bytes | Targeted, user-notified reset before import/first Auth0 login; never truncate | APPROVED — execution proof OPEN |
| C1-D03 | Portal/Admin separation | Separate Auth0 tenants, issuer refs, audiences, factors and admin policies; no cross-reuse | APPROVED — topology proof OPEN |
| C1-D04 | Existing TOTP | T1: Auth0-managed MFA; Portal enrollment is optional and Admin enrollment is mandatory. At cutover, all legacy BWH enc: and v2: values are invalidated; no import/decrypt/transfer/re-encryption; users re-enroll. | APPROVED — enrollment proof OPEN |
| C1-D05 | Email verification policy | Preserve single-use, duplicate and rate-limit behavior unless an explicit product change is approved | PENDING |
| C1-D06 | Visible account label | Masked email or user-managed display name through identity-profile service; never route raw value through business Worker | PENDING |
| C1-D07 | Coins canary | Keyed PII pseudonym or provider eligibility claim | RECOMMENDED: keyed PII pseudonym |
| C1-D08 | Identity lifecycle owner | Assign accountable Identity/Privacy and Security roles | PENDING |

The owner direction for C1-D01/C1-D02 and the Portal/Admin isolation principle is approved on 2026-11-08. Remaining blockers are proof, not provider selection: exact Scrypt import vectors; 72-byte rejection behavior during login (not only password setting); identification of over-limit accounts without plaintext; current trim normalization; tenant topology and non-production integration proof. If Auth0 cannot preserve these contracts, stop and return with a concrete fallback decision rather than weakening or truncating credentials. Do not create a provider tenant until a separate explicit authorization is issued.

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


## 7. Evidence update — 2026-11-08

The C1 source-slice review on PR #842 is APPROVED by GitHub account `gccltdco-cmd`, Review ID `5817529933`, bound to exact HEAD `bc3f8c9a713de05715f42f733b8fa72ba53d4477`. The reviewer reran four related repository test files under Node v22.23.1: 48/48 PASS. This is source-level review evidence only; the approval does not close C1.

The owner decisions C1-D01/C1-D02 and the Portal/Admin isolation principle C1-D03 are now APPROVED as recorded above. C1-D04 through C1-D08 remain open, and the module still does not implement OIDC/JWKS signature verification or a real provider adapter. Provider selection does not authorize tenant creation. Password cohort identification, trim normalization and the exact first-login 72-byte behavior remain mandatory proof items.

The full repository suite was separately executed and compared against the Draft baseline at Node v22.23.1; this is comparative zero-new-regression evidence, not a green suite. No hosted CI PASS is claimed. C1 remains OPEN.


## 8. Owner decision — 2026-11-08

The project owner approved **Auth0 Essentials + Bulk User Import** as the selected identity-provider direction, approved targeted user-notified reset for passwords exceeding 72 UTF-8 bytes, and approved the Portal/Admin isolation principle. This is an architecture decision only.

### Compatibility details that must be proven before any tenant or user import

- Current repository source at the C1/C2 review HEAD uses Node `crypto.scryptSync` with `N=32768`, `r=8`, `p=1`, `keylen=64`, a raw 16-byte salt, and `String(password).trim()` before deriving/verifying the hash.
- Auth0's documented Scrypt import schema can represent the parameters as `cost=32768`, `blockSize=8`, `parallelization=1`, `keylen=64`; import encodings must be derived from the decoded salt/hash bytes, not by copying the project's base64url strings without conversion.
- Auth0 re-hashes an imported custom password hash to bcrypt after successful first login. Auth0 Support documents a 72-byte limit where bytes beyond the limit may be ignored. The exact current Flexible Password Policy behavior for imported-user login must be tested; a setting that only rejects long new/reset passwords is insufficient.
- The existing Scrypt hash is one-way and contains no recoverable plaintext length. A targeted reset population cannot be inferred from the hash. Use an already-approved non-secret length marker if one exists, or measure UTF-8 byte length in memory when a user submits a password to the legacy verifier. Never log, export or persist plaintext. Unknown users must remain on the legacy authority or be handled through a separately approved reset cohort.
- Current password input normalization trims leading/trailing whitespace before Scrypt. The Auth0 flow must preserve this exact effective behavior or explicitly route incompatible cases through an approved reset; do not silently alter it.
- The 72-byte unit is UTF-8 **bytes**, not Unicode characters. A password containing multibyte characters can reach the byte boundary with fewer than 72 visible characters.

### Non-production proof required

1. Synthetic known-answer tests for the exact Node Scrypt envelope, including ASCII, multibyte UTF-8, edge whitespace, 71/72/73-byte values and malformed salts/hashes.
2. Verify that imported hashes authenticate exactly once and are re-hashed as expected after successful login.
3. Prove that 73+ UTF-8-byte passwords are rejected before bcrypt rehash/truncation; if not, Auth0 Essentials is not acceptable without a different guarded migration path.
4. Verify reset behavior and ensure the initial bulk import omits the incompatible password hash for any account that must reset; do not attempt to bulk-upsert a hash later as a workaround.
5. Verify TOTP, email verification, lockout, account binding, issuer/audience isolation, session revocation and Admin directory behavior using synthetic identities only.
6. Reconcile the three-tenant Essentials entitlement with two isolated production tenants and the required non-production tenant allocation.

No vendor tenant, real user, password, TOTP seed, provider credential, production configuration or production resource was created or changed by this approval.


## Owner decision update — T1 (2026-11-08)

The owner-selected T1 policy is authoritative and supersedes the earlier synthetic-import / possible v2-transfer alternatives in this document:

- Auth0 owns target Portal/Admin MFA factors.
- Portal users may enroll voluntarily; Admin users must enroll before accessing Admin.
- At cutover, all legacy BWH TOTP values (enc: and v2:) are invalidated. No legacy secret is imported, decrypted, transferred or re-encrypted.
- Existing users re-enroll with Auth0 MFA. The old BWH key remains under the existing BWH production boundary until a separately authorized cutover; this record does not authorize key access or deletion.
- C1-D04 is APPROVED as a design decision; synthetic enrollment, verification, lockout, recovery, revocation and outage proof remain OPEN.
- C2-D05 is resolved for this migration path: do not provision first-party Portal/Admin TOTP AES keys for the Auth0-managed target. The generic v3 primitive is not a selected production path.

