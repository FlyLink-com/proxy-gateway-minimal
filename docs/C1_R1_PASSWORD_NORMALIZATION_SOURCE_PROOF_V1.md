# C1 R1 Password Normalization Source Proof

Date: 2026-11-09
Scope: source-level compatibility evidence for the already-approved R1 trim-only password contract. All password examples in tests are synthetic.

## Approved contract

R1 is already approved: registration and login remove leading and trailing ECMAScript whitespace only; password interior bytes/characters remain unchanged. Auth0 does not perform this legacy trim itself, so every client must normalize before sending a password to the hosted identity provider.

This record is a source/test audit, not proof of a live Auth0 tenant or production login path.

## Browser Portal

- `admin/src/features/user-portal/user-portal-parsers.ts` defines `requiredText()` as `String(value ?? "").trim()` and rejects empty-after-trim input.
- `admin/src/features/user-portal/user-portal-http.ts` calls that helper for both `registerTrialAccount()` and password-mode `authenticate()` before constructing the HTTP request body.
- Regression: `admin/src/test/user-portal.test.tsx`, test `http portal client posts password login to backend and maps TOTP challenges`, now submits synthetic leading/trailing ECMAScript whitespace and asserts the outgoing password is trimmed while an interior U+FEFF is retained.
- Source baseline: proxy-gateway branch commit `8c0afddc18d5255dad4c980fd945dcb3b118d008`.
- Blob references:
  - parser: `fe9de716ba7981896e93f8569b2b2f01b445ec49`
  - HTTP adapter: `385bb695acbf07da6e7479762800ca73e9795e13`
  - updated regression test: `ce21e12016d24522e61385f4ff28a9adb4177661`

## Android Portal

- `app/src/main/java/com/gccwebos/android/portal/PortalRepository.kt` defines `normalizedLoginPassword()` with the ECMAScript String.trim whitespace set and calls it before constructing the `/api/portal/password/session` request.
- `RegistrationModels.kt` uses the same helper for registration password validation and confirmation, preserving registration/login normalization parity.
- Regression: `app/src/test/java/com/gccwebos/android/portal/AccountLoginAttemptTest.kt` covers blank-after-trim values, edge whitespace parity, and preservation of internal characters.
- Verified Android main commit: `c19d5bf57388b427a5e8248d838cbf3e87b39d47`.
- Blob references:
  - PortalRepository: `e5f61cbf15385606448074fcce59a6a137c965da`
  - login regression test: `c8aded8b6dc735cd55cd1fc348fd44e5dbe835f7`

## Admin Portal

- Before this change, `admin/src/app/admin-auth-client.ts` forwarded the raw password to `/api/admin-auth/login`; the backend's legacy trim therefore did not prove normalization before a future Auth0 handoff.
- This branch now applies JavaScript `String.trim()` before constructing `bootstrapToken`, rejects empty-after-trim input before network dispatch, and preserves the existing raw-input 4096-character upper bound.
- Regression: `admin/src/test/admin-auth-client.test.ts` verifies leading/trailing ECMAScript whitespace removal, interior U+FEFF preservation, and whitespace-only fail-closed behavior.
- Branch: `fix/c1-admin-preauth-trim-20261109`.
- Relevant commits:
  - implementation: `4d5e20de24b9132aa79e340c3fc95c4bb6e5a0f1`
  - Admin test: `20f34e00d56d8f9ae3b3206488854c90bfbe65c4`
  - Browser regression: `da19f96283ccd115b4938126e802795806b61178`
- Current blobs:
  - Admin client: `f633ec713cb9927c219063f50276840607cdf7e8`
  - Admin test: `237aee167db1bed04a6b93b4e280bee1b53cc869`
  - Browser regression test: `ce21e12016d24522e61385f4ff28a9adb4177661`

## Validation and remaining gate

- Focused Node v22.16.0 execution against the updated Admin client passed: trim-only normalization, preservation of interior characters, blank-after-trim rejection before fetch, and normal request dispatch.
- The full repository Vitest suite and Android Gradle suite have not been rerun in this work item.
- The Admin source change is on a Draft child PR and is not merged. Do not mark the cross-client R1 source gate complete yet.
- Keep the `edgeWhitespace=true` cohort fail-closed in the Auth0 import validator until the Admin change receives exact-head review and is integrated into the intended hosted-auth path.
- This does not authorize creating Auth0 tenants, importing real accounts, collecting real passwords, deploying, or changing production authentication.
