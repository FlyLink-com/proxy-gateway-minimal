# Step 6 — Auth0 Real Non-Production Tenant Verification

Date: 2026-11-08 (America/Los_Angeles)
Executor: Muse
Authorization: Yi confirmed the Portal/Admin tenant mapping and instructed the verification to begin on 2026-11-08.
Scope: non-production DEVELOPMENT tenants only; synthetic `example.test` users and invented passwords. No production users, production data, paid plan upgrade, production tenant, or production migration was involved.

This document records provider-observed behavior. It is separate from the local synthetic validator tests; it does not make the validator package a live-provider integration and does not close C1 or T2.

## Tenant mapping

| Surface | Tenant | Issuer | Team | Region / environment |
|---|---|---|---|---|
| Portal verification | `gccltd-co` | `https://gccltd-co.us.auth0.com/` | `team-87jzxfi` | US-5 / DEVELOPMENT |
| Admin verification | `dev-xtk5cthsct5ccxth` | `https://dev-xtk5cthsct5ccxth.us.auth0.com/` | `team-fx6acyf` | US-5 / DEVELOPMENT |

Plan / tenant constraints observed:
- Each team on the free/trial tier is limited to one tenant. The two existing verification tenants belong to different teams, so the two-tenant test topology was possible without upgrading.
- Portal team `gccltd-co` was on a trial with about 21 days remaining on 2026-11-08 (approximately 2026-11-29), then expected to fall back to Free. This is a dated observation, not a current subscription-state assertion.
- Auth0 tenant domains cannot be renamed after creation. Production tenants, if separately authorized, must be created with the approved naming convention at the appropriate Essentials stage.
- Management API access used the dashboard API Explorer's temporary test application and a 24-hour token. Password and MFA grants had to be explicitly enabled on the non-production Default Apps.

## 1. Bulk import acceptance — PASS, with a critical validation-boundary finding

Connection: Portal `Username-Password-Authentication` (`con_C4JwWIHvhUJSslOI`).

The primary import task `job_2Mk5zCWax9LmgUE2`, external ID `c1-verify-portal-main-20261108`, inserted 5 synthetic users and reported 0 failed. The cohort included an ordinary password, exactly 72 UTF-8 bytes, 24 Chinese characters (72 UTF-8 bytes), an 80-byte hazard probe, and a trim sample.

A second task intentionally supplied a malformed record whose hash was truncated to 32 bytes while `keylen` remained 64. Auth0 still reported inserted 1 / failed 0. The malformed account then failed login with HTTP 403 and `Password change required.`

Conclusion: the provider's bulk-import acceptance is shallow and does not prove hash/keylen consistency or credential usability. The repository's pre-import gate is the security boundary. It must validate canonical envelope encoding, salt/hash lengths, declared key length, algorithm parameters, account-bound attestation, and batch integrity before submitting any record. Provider inserted counts must never be treated as credential validation.

## 2. Scrypt first login and bcrypt lazy rehash — PASS; 72-byte hazard confirmed

Real Portal tenant password-grant observations:
- Ordinary imported Scrypt account: first correct login issued tokens (200); second login after rehash issued tokens (200); wrong password returned 403 `invalid_grant`.
- Exactly 72-byte password: correct value succeeded; changing the final byte failed.
- 24 Chinese characters / 72 UTF-8 bytes: correct value succeeded.
- 80-byte synthetic password: full value succeeded on the first Scrypt login.
- After that first login, entering only the first 72 bytes also succeeded. The full 80-byte value continued to succeed on the next login.

Conclusion: after successful Scrypt verification, Auth0's bcrypt lazy rehash applies the 72-byte input-window semantics. An 80-byte account can become accessible using only its first 72 bytes after rehash. This is provider-observed confirmation of C1-D01:
- Identify passwords longer than 72 UTF-8 bytes before import.
- Notify the user and require a user-initiated targeted reset.
- Never truncate or silently transform the password.
- Do not import an over-72-byte account through the imported-Scrypt route until reset is completed and the replacement is attested within the allowed byte window.

The 80-byte account was a synthetic hazard probe only; this test provides no estimate of the number of affected production accounts.

## 3. R1 trim-only behavior — provider behavior confirmed

The legacy system hashes the trimmed password, while Auth0 verifies the exact password value it receives:
- The padded input with leading/trailing whitespace failed with 403 `Password change required.`
- The trimmed form succeeded.
- The error description differed from an ordinary wrong-password response; the internal trigger for this provider message was not investigated further.

Conclusion: Auth0 does not automatically preserve the legacy trim behavior. The already-approved R1 contract must be applied before the password reaches Auth0 on every supported first-party login, registration, and reset path. Internal whitespace and case must remain unchanged; no Unicode normalization or truncation is permitted. Any hosted or alternate path without proven pre-Auth0 normalization must stay outside the imported-hash route and use the approved notified user-initiated reset fallback.

## 4. Real JWKS verification and cross-tenant rejection — PASS

- Both tenants' OIDC discovery documents and JWKS endpoints were publicly reachable; each published two RSA RS256 signing keys, with disjoint `kid` sets.
- A Portal synthetic user's RS256 ID token verified against the Portal JWKS. Verification against the Admin JWKS was rejected because the token's `kid` was absent.
- An Admin synthetic user's RS256 ID token verified against the Admin JWKS. Verification against the Portal JWKS was rejected for the same reason.
- The Portal synthetic user's email returned zero users when queried in the Admin tenant.

Conclusion: the two non-production tenant token/JWKS boundaries were observed to reject cross-tenant verification symmetrically. This does not replace integration testing of the Cloudflare Gateway OIDC/JWKS adapter, issuer/audience/algorithm checks, claim mapping, key rotation/cache behavior, or business-domain authorization.

## 5. Admin MFA self-service enrollment and enforcement — PASS

Admin tenant configuration:
- Guardian OTP factor enabled.
- MFA policy set to `["all-applications"]`, then read back successfully.
- Portal remained voluntary per T1: MFA policy empty and factor not enabled.

Synthetic Admin user `adm-user01@example.test`:
1. Login without enrolled MFA returned HTTP 403 `mfa_required`; no session was issued, only an `mfa_token`.
2. `POST /mfa/associate` with the `mfa_token` bearer credential and `authenticator_types: ["otp"]` returned 200 and issued the enrollment secret/recovery codes.
3. A locally generated TOTP completed enrollment through the `mfa-otp` grant; login then issued tokens (200).
4. A subsequent login again required MFA. An invalid OTP was rejected (403 `Invalid otp_code`). Reuse of a code in the same time window was rejected; a code from the next window succeeded (200).

The same-window replay observation is consistent with replay prevention, but the conclusion is limited to the tested timing sequence and is not a complete provider-wide replay guarantee.

The API integration shape is now known for future implementation. Hosted Login browser UX, custom domains, and email delivery were not walked through in this test.

## Credential hygiene and cleanup

- Verification-created synthetic users remain in the two non-production tenants; all use `example.test` addresses.
- Default App grant types were changed only in these non-production tenants to enable the password/password-realm and Admin MFA test grants.
- Both Default App client secrets were rotated after verification; the prior values were invalidated.
- The Management API test token was short-lived (24 hours; recorded expiry 2026-11-10 05:19 / 05:22 UTC).
- Local `.session/` token, secret, synthetic password, and TOTP-secret material was securely shredded. Only non-secret result files were retained.

No credential values, client-secret values, access tokens, passwords, TOTP seeds, or recovery codes are included in this document.

## Evidence files

Local result directory: `~/workspace/auth0-verify/results/`

- `discovery-*.json`
- `jwks-*.json`
- `users-import-portal(.manifest).json`
- `job-*-submit.json`
- `job-*-final.json`
- `login-matrix-portal.json`
- `jwks-verification.json`
- `jwks-verification-admin.json`
- `admin-user.json`
- `admin-mfa-flow.json`

## Gate interpretation and remaining work

Step 6 real non-production provider verification is PASS for the tested API behaviors. C1 overall remains OPEN. The remaining C1 work includes:
- Exact-head review and integration of the Admin R1 trim-only change; complete source/test proof across Browser, Android, and Admin, including every supported registration/login/reset entry point.
- Production-safe account-length attestation and notified reset workflow for over-72-byte accounts. The attestation must persist only the approved coarse bucket and metadata, never passwords, hashes, exact lengths, or password fragments.
- Cloudflare Gateway OIDC/JWKS adapter implementation and non-production integration tests: issuer, audience, allowed algorithms, signature, expiry/not-before, key rotation/cache, tenant binding, claim projection, and domain-level authorization.
- Admin MFA integration into the actual authentication flow, while Portal remains voluntary per T1; hosted UX and email delivery need separate validation.
- Production tenant naming/plan and real-user migration remain separate future decisions and authorizations.

This evidence does not authorize production tenant creation, production-user reads or imports, credential export, production login instrumentation, notification/reset campaigns, BWH access, remote D1 writes, Worker deployment, dual-write, data migration, or cutover. T2 remains BLOCKED / NOT READY; BWH remains the sole production control-data write authority.

Source: Yi-authorized non-production execution record supplied 2026-11-08; Muse result files and credential-cleanup record.