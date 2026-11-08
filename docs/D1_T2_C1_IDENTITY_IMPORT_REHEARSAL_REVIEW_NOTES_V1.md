# D1 T2-C1 Identity Import Rehearsal — Second-Pass Review Notes v1

- Review date: 2026-11-07 (PST)
- Reviewed branch: docs/d1-target-schema-g6-rehearsal-plan-20261107
- Reviewed HEAD: 76bd676ddc3e1a214b6cdc9392ad40baea993088
- Master at review: be261abc60f28bb2733764fa5364ab44b3e76844
- Review type: AI-assisted source-only second-pass review.
- Formal independent reviewer sign-off: NOT PROVIDED. The same assistant participated in authoring the rehearsal implementation; this note is not a substitute for the T2 requirement that a reviewer who did not author the implementation review and sign the exact final commit.
- Risk boundary: repository source and synthetic fixtures only. No BWH connection, production account rows, real passwords, real TOTP seeds, C2 keys, Auth0 tenant/API, remote D1, Worker deployment, PR, merge, or CI run.

## 1. Executive disposition

The local synthetic rehearsal is useful as a narrow byte/schema compatibility probe. Its fixed-fixture allowlist, no-network/no-file behavior, v2 TOTP rejection, and redacted CLI are appropriate for this phase.

It does NOT establish a production-ready identity migration converter or complete C1 acceptance. Two password-compatibility blockers and the existing TOTP custody gate remain unresolved. Provider behavior, import reconciliation, and account lifecycle compatibility have not been tested.

**Disposition: C1 BLOCKED; C2 OPEN; T2 BLOCKED. Do not promote to Ready, merge, deploy, create a tenant, or use real account material on the strength of this rehearsal.**

## 2. Pinned source and local validation evidence

Exact GitHub blob IDs were checked against the isolated local copies with git hash-object:

| File | GitHub blob SHA-1 |
|---|---|
| server/services/platform/portal-identity-import-rehearsal.mjs | 99df6a82959b56ab4ad80d4384d7f929bf930fa2 |
| server/services/platform/portal-totp-verifier.mjs | f093ed7693e829bb40d93e15f0dce09ca689ce60 |
| server/tests/platform-portal-identity-import-rehearsal.test.mjs | f75df2a31279da1b63192f26caeb836f4453dd84 |
| scripts/platform-identity-import-rehearsal.mjs | eb7d3c356b43e6586d696ec61c304d5b8e83a695 |

Local checks, Node.js v22.16.0:

- node --check on the service, TOTP verifier and CLI: PASS.
- Exact focused repository test file with node --test: 9/9 PASS.
- Scrypt vector: Node crypto.scryptSync reproduced the independently generated Python hashlib.scrypt 64-byte result.
- CLI no-argument execution: PASS_LOCAL_SYNTHETIC_ONLY; receipt scan found none of the fixture password, password hash, salt, TOTP secret or email.
- CLI extra-argument guard: expected non-zero exit and rejection observed.
- Additional TOTP-window check: previous/current/next windows accepted; -2/+2 windows rejected.
- No trailing whitespace was found in the reviewed changed files during the source scan.

Not run: full repository test suite, git diff --check, CI, Auth0 tenant/API import/readback, hosted first-login rehash, provider lockout/recovery, duplicate/partial import, Android/browser parity, or real credential handling.

The local test result validates the exact focused files, not the complete repository or provider behavior.

## 3. Findings

### C1-R1 — P1: Legacy password trim semantics are not represented by Auth0's hash encoding

Evidence:

- The existing portal password service applies String(value ?? "").trim() in requiredText() before deriving and verifying scrypt hashes (server/services/platform/portal-password-credentials.mjs).
- The rehearsal's verifyPortalScryptPassword() also trims the supplied password before scrypt (portal-identity-import-rehearsal.mjs, around line 72).
- The rehearsal records password.encoding = "utf8". Auth0 documents this as an encoding/transcoding instruction; it does not document whitespace trimming as part of the import hash contract.
- The rehearsal's trimNormalizationPreserved assertion calls the local helper that itself trims. It therefore proves legacy helper behavior, not that Auth0 will trim a user's login input.

A synthetic reproduction confirmed that a hash created from the trimmed string abc matches the legacy normalized input "  abc  ", but does not match the untrimmed byte sequence "  abc  ".

Impact: users whose effective legacy password relies on leading/trailing whitespace normalization may fail first login after bulk import unless the same normalization is guaranteed before provider authentication.

Required before C1 acceptance:

1. Choose and document the authoritative password canonicalization contract.
2. Prove the browser and Android clients apply it consistently before direct provider authentication, or choose an approved verifier/credential-reset approach that preserves the legacy behavior.
3. Add tests that distinguish legacy trimming from provider byte-level verification. Do not label the local trim assertion as Auth0 compatibility evidence.

Reference: https://auth0.com/docs/manage-users/user-migration/bulk-user-import-schema

### C1-R2 — P1: The 72-byte first-login compatibility rule is classified, not enforced

The rehearsal exports classifyAuth0FirstLoginPassword(), which returns targeted_reset_required above 72 UTF-8 bytes. It does not enforce a reset, block provider login, or integrate with a browser/Android authentication path.

Auth0 documents a 72-byte database-password limit and states that bytes beyond the limit are ignored. Auth0 also documents that after a successful login using an imported custom hash, it re-hashes the password with bcrypt and uses the new hash going forward.

The current registration contract permits up to 160 JavaScript string code units. The affected production-account count is unknown and was not inspected.

Impact: a password longer than 72 UTF-8 bytes may authenticate against the imported scrypt hash on first login, then be stored by the provider with bcrypt's truncation behavior. The current classifier alone does not prevent this transition.

Required before C1 acceptance:

1. Obtain an owner-approved targeted-reset policy or a genuinely enforced pre-login gate.
2. Prove the gate is applied before the first provider authentication, not merely displayed in one client.
3. Keep the affected-user count UNKNOWN until a separately authorized, privacy-safe assessment exists. Do not inspect production passwords or attempt to derive them.

References:
- https://support.auth0.com/center/s/article/customize-max-password-length
- https://support.auth0.com/center/s/article/How-to-update-user-data-while-lazy-migration

### C1-R3 — HISTORICAL: Legacy enc: TOTP fixture is synthetic-only; superseded by T1

The current TOTP verifier strips the legacy enc: prefix and treats the remainder as Base32. That prefix is not encryption. The rehearsal normalizes the fixed synthetic enc:JBSWY3DPEHPK3PXP fixture into Auth0's unpadded Base32 field.

The synthetic record builder is restricted to that exact fixture and rejects arbitrary TOTP values. It also fails closed for a v2: envelope without C2 key custody. No real secret was read or decrypted.

However, the D1 field-disposition and T2-C2 contracts explicitly require legacy enc:<base32> values to be re-registered, re-protected under an approved custody contract, or quarantined/rejected before a target load. The current TOTP secret field remains EXTERNALIZE; C2 key ID, key separation, rotation and old-value handling remain open.

Required before any real TOTP import:

1. Preserve the fixed synthetic-only guard.
2. Do not feed production enc: or unprefixed Base32 values through this path.
3. Obtain the separate C2 custody decision and the required Identity/Privacy and Security approvals.
4. Choose re-enrollment or approved re-encryption/quarantine for historical values.

References:
- D1_CONTROL_FIELD_DISPOSITION_T2_V1.md
- D1_T2_CLOSEOUT_EXECUTION_MATRIX_V1.md
- https://auth0.com/docs/manage-users/user-migration/bulk-user-import-schema

### C1-R4 — P2: Parser and verifier lack explicit input-size bounds

parsePortalScryptPasswordHash() splits and Base64URL-decodes the supplied hash before validating decoded salt/hash lengths. It has no maximum encoded-envelope length. verifyPortalScryptPassword() also has no explicit password byte-length bound before synchronous scrypt.

The record builder's fixed synthetic hash/TOTP allowlist prevents arbitrary credentials from being used to create an import record today. The module is not wired to a public route. This is therefore a hardening requirement before any generalized converter or runtime reuse, not an observed production exploit.

Recommended hardening:

- Set a strict maximum encoded-envelope length before splitting or decoding.
- Match the salt length to the approved historical source contract; do not silently accept an unreviewed range.
- Bound password input bytes before synchronous scrypt and return a stable typed failure.
- Add oversized input and malformed Base64URL tests.

### C1-R5 — P2: TOTP repository test omits the previous accepted time window

The production verifier loops from -window through +window with a default window of 1. The focused test covers the current interval and the next interval, but not the previous interval.

An additional isolated test against the exact verifier blob confirmed previous/current/next acceptance and rejection outside the window. The implementation appears correct; the committed regression coverage is incomplete.

Recommended change: add the previous-window vector and an explicit -2/+2 rejection assertion to the repository test.

### C1-R6 — P2: Upsert and partial-import metadata behavior is not covered

The record builder emits app_metadata: { legacy_account_ref }. Auth0 documents that when bulk-import upsert is enabled, an included app_metadata object replaces the existing metadata object in full. Auth0 also documents that email_verified may be reset to pending on upsert if omitted.

The focused test validates the local object shape only. It does not validate duplicate identities, existing metadata preservation, partial job failures, idempotent reruns or readback.

Before any provider proof, decide whether this is a clean initial import with upsert disabled or an upsert into an existing tenant. If upsert is enabled, explicitly preserve all required metadata and verify duplicate/partial-import reconciliation.

Reference: https://support.auth0.com/center/s/article/How-to-use-bulk-import-job-with-upsert

### C1-R7 — Scope limitation: this is a fixed synthetic fixture builder, not a production converter

The builder accepts only .example.test email addresses, synthetic- identifiers, one exact password-hash fixture and one exact TOTP fixture. This is a good safety boundary for a rehearsal.

It does not yet provide a production record iterator, real-account identity mapping, duplicate preflight, import-file generation, import job execution, readback, retry/reconciliation, or provider lifecycle adapter. Do not describe it as ready to migrate real accounts.

### C1-R8 — C1 behavioral acceptance remains unproven

The rehearsal does not prove preservation of:

- account-ID and opaque-subject resolution, unique/ambiguous lookup behavior;
- generic login failures, failure counters, lockout, revocation and mustRotate consumers;
- TOTP lockout, recovery, enrollment, revocation and outage semantics;
- email verification and normalized-email uniqueness;
- Admin directory search/display and authorization;
- registration deduplication and Coins-canary decisions;
- provider outage, account deletion/unlink and session revocation;
- Android/browser issuer, audience, MFA and account-binding parity.

These are C1 acceptance requirements, not optional post-migration cleanup.

## 4. Current repository and governance state

- Branch: docs/d1-target-schema-g6-rehearsal-plan-20261107.
- HEAD: 76bd676ddc3e1a214b6cdc9392ad40baea993088.
- Master: be261abc60f28bb2733764fa5364ab44b3e76844.
- Branch comparison: 141 commits ahead, 0 behind.
- Matching PR: none.
- Commit status/workflow runs for the reviewed HEAD: none observed.
- No Ready transition, merge, deployment, tenant creation, production data access or production mutation was performed.

The focused test pass does not change the project gates:

| Gate | Status |
|---|---|
| C1 identity/authentication custody | BLOCKED |
| C2 HMAC/AES-GCM key custody | OPEN |
| C3 account metadata/JSON boundaries | OPEN |
| T2 | BLOCKED |
| T3 / G6 | Not authorized by this review |

## 5. Recommended next sequence

1. Resolve C1-R1 password canonicalization and C1-R2 72-byte reset/enforcement policy with the accountable owners.
2. Apply owner-selected T1: legacy enc: and v2: TOTP values are invalidated at cutover and require Auth0 MFA re-enrollment; no decryption, import, transfer or re-encryption.
3. Harden parser/verifier input bounds and add the previous-window TOTP regression.
4. Define initial-import/upsert policy, metadata preservation, duplicate preflight and partial-import reconciliation.
5. Only after separate authorization to create a non-production tenant, run the isolated Auth0 proof for Scrypt import, first-login rehash, 72-byte rejection, trim normalization, MFA enrollment/verification, lockout and tenant isolation.
6. Test C1-01 through C1-12, including lockout, Admin directory, Coins canary, outage/revocation and Android/browser parity.
7. Obtain a reviewer who did not author the implementation to review the exact final commit. Until then, this remains an AI-assisted second-pass review, not formal independent sign-off.

No source behavior or production authority is changed by this review note.


## Owner decision update — T1 (2026-11-08)

The earlier C1-R3 text described a synthetic-only enc: fixture and a possible C2-approved v2 conversion path. That path is superseded by the owner's T1 decision: legacy enc: and v2: TOTP values are invalidated at cutover; no real or synthetic legacy secret is a production migration input; users re-enroll with Auth0 MFA. Portal enrollment is optional and Admin enrollment mandatory. The repository's generic legacy classifier must return re_enroll_required and must not decrypt or re-encrypt. Synthetic provider proof is for new enrollment/verification and lifecycle behavior, not legacy secret import.

