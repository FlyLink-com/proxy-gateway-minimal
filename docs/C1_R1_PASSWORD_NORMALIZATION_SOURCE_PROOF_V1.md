# C1 R1 Password Normalization Source Proof

```yaml
document_metadata:
  doc_type: evidence
  lifecycle: active
  authority_scope: c1_r1_password_normalization_source_proof
  superseded_by: null
  last_verified_at: 2026-11-10
  production_authority: false
```

Date: 2026-11-10.
Scope: source-level compatibility evidence for the owner-approved R1 trim-only contract. All password values in tests are synthetic.

## Approved contract

The owner-approved rule is exactly:

`String(value ?? "").trim()`

Remove leading and trailing ECMAScript whitespace only. Preserve internal whitespace, case, and Unicode code-point sequences. Do not lowercase, normalize NFC/NFD/NFKC, collapse internal whitespace, truncate, or silently rewrite a password.

Registration and login use the same effective value before hashing or verification. Any future password-reset entrypoint must use the same rule before hashing or handing off to Auth0. The separate C1-D02 rule for passwords above 72 UTF-8 bytes remains targeted user-notified reset with no truncation; R1 does not alter it.

## Browser Portal

- `admin/src/features/user-portal/user-portal-parsers.ts` defines `requiredText()` as `String(value ?? "").trim()` and rejects empty-after-trim values.
- `admin/src/features/user-portal/user-portal-http.ts` uses that helper for both `registerTrialAccount()` and password-mode `authenticate()` before constructing request bodies.
- **Registration UI correction in this PR:** `user-registration-page.tsx` now computes password rules from the trimmed effective value, compares the trimmed password and confirmation, and submits the trimmed value. Previously, UI validation and confirmation used raw input even though the HTTP adapter trimmed later; that could let edge whitespace affect the minimum-length rule or make the UI and request use different effective values.
- Regression coverage in `admin/src/test/user-portal.test.tsx`:
  - registration UI submits the trimmed effective password and accepts a confirmation containing that same effective value;
  - HTTP registration trims before dispatch;
  - HTTP login exercises the shared R1 vector set.
- Source blobs:
  - parser: `fe9de716ba7981896e93f8569b2b2f01b445ec49`
  - HTTP adapter: `385bb695acbf07da6e7479762800ca73e9795e13`
  - registration UI after correction: `8de57fbfbe8ea8df71a6261623eaa488d99c003f`
  - Browser tests after correction: `dae6785b9c4fa253173916f4178ff89c2a910cb8`

## Admin

- `admin/src/app/admin-auth-client.ts` now applies JavaScript `String.trim()` to the password before constructing the same-origin `/api/admin-auth/login` request's `bootstrapToken` field and rejects empty-after-trim before network dispatch.
- The current Admin client exposes session, login, TOTP verification, and logout; it does not expose self-service registration or password reset. No such absent route is claimed as implemented by this PR.
- `admin/src/test/admin-auth-client.test.ts` runs the same shared synthetic vector set and asserts the exact value sent in the request.
- Source blobs:
  - Admin client: `f633ec713cb9927c219063f50276840607cdf7e8`
  - Admin tests after vector expansion: `3c23b32d88f7105789ca538ad0d23f3d23155f6e`

## Shared synthetic compatibility vectors

The Browser login/registration and Admin login tests import the same fixture:

`admin/src/test/password-normalization-vectors.ts`, blob `571b782174d8a591bb56b39275a6a1f11e4a66ef`.

It covers:
1. Leading/trailing ECMAScript whitespace (including FEFF, NBSP, TAB, ideographic space and paragraph separator) removed.
2. Interior FEFF, tabs, repeated spaces and other interior characters preserved.
3. Case preserved.
4. Composed NFC and decomposed NFD sequences remain distinct; no Unicode normalization.
5. Non-ECMAScript control characters U+001C/U+001F are not accidentally trimmed.

## Android Portal

- Verified main commit: `c19d5bf57388b427a5e8248d838cbf3e87b39d47`.
- `PortalRepository.kt` defines `normalizedLoginPassword()` using the ECMAScript String.trim whitespace set and applies it before the password-session request.
- `RegistrationModels.kt` reuses the same helper for registration password validation and request construction.
- `AccountLoginAttemptTest.edgeWhitespaceMatchesServerWithoutChangingPasswordInterior` covers leading/trailing whitespace, interior FEFF preservation and non-ECMAScript controls; the long-password test also checks internal Unicode and whitespace preservation.
- Android source is unchanged in this PR. The shared Browser/Admin fixture has not yet been ported verbatim to Android, so the policy's full cross-client identical-vector evidence remains an open acceptance item rather than being overstated as complete.

## Password-reset scope

The reviewed Browser/Admin client surfaces do not currently expose a password-reset endpoint. If one is introduced, it must apply the same trim-only rule before the password reaches hashing or the hosted provider. The notified user-initiated reset fallback for a path that cannot prove pre-Auth0 normalization remains a separate gated operation; this PR does not send notifications or reset accounts.

## Validation and remaining gate

- Source files and updated tests were read back from the exact Draft branch.
- No Admin Vitest suite, Admin TypeScript/build, full repository `npm test`, or Android Gradle suite has been run in this work item. Draft CI was intentionally not triggered; no Hosted CI PASS is claimed.
- The shared vector fixture is synthetic and contains no customer credentials.
- Keep the Auth0 `edgeWhitespace=true` cohort fail-closed until the exact current PR head receives independent review, required source tests/build validation pass, and the normalized first-party path is integrated into the intended hosted-auth flow.
- This record does not authorize creating Auth0 tenants, importing real accounts, reading/exporting production credentials, sending notifications, resetting production passwords/TOTP, deploying, changing production authentication, connecting to BWH, or writing remote D1.
