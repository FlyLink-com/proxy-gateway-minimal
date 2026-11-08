# D1 T2 Identity and Authentication Custody — Source Audit v1

> **Status:** Source-only findings for T2 decision-making. This is not an identity-service design approval, production activation finding, secret migration authorization, or T2 PASS.
> **Source anchor:** `master@be261abc60f28bb2733764fa5364ab44b3e76844`.
> **Draft branch:** `docs/d1-target-schema-g6-rehearsal-plan-20261107`.
> **Production authority:** BWH remains the only production writer.

## 1. Executive finding

The current D1 PII decision is not an email-only transformation. The source contains an interdependent identity and authentication path:

- account creation writes raw email into `loginRef` and `displayRef`;
- password login resolves an email-like identifier to an account by scanning active account metadata;
- public browser sessions expose the email-derived value as `userRef` and `displayName`;
- password credential records are stored through the same control-store abstraction, while all 11 columns of `platform_portal_password_credentials` are currently marked DEFER in the T2 field map;
- TOTP ciphertext is stored in `platform_portal_totp_credentials.encrypted_totp_secret`, which is marked EXTERNALIZE;
- the current TOTP envelope has no key ID, and the same configured protector is passed to User Portal and Admin TOTP verification;
- legacy `enc:` values are stripped to raw Base32 by the verifier path; the prefix does not prove encryption.

**T2-C1 cannot pass by simply deleting email fields.** The project must define an approved identity/authentication custody authority and preserve the existing source behavior without copying password hashes or TOTP secrets into D1. Production activation of the conditional User Portal/Admin Auth route path is **NOT OBSERVED** by this source audit.

## 2. Evidence inventory

All paths below were read from the pinned Master source anchor. Line numbers are relative to that exact commit.

| Source | Blob SHA-1 | Relevant lines | Finding |
|---|---|---:|---|
| `server/services/platform/portal-registration.mjs` | `df3a67dc61f94f4d4c14043b3fbf49418d419b39` | 210–237, 285–333 | Email normalization, SHA-256 lookup digest, registration risk digests, raw login/display refs written to account metadata |
| `server/services/platform/subscription-control-db.mjs` | `bc6694a93f452f97393ff6f1a8099e854c0b19ac` | 466–477, 2083–2124, 8585–8624, 8625–8670 | Login metadata fields, exact-ID/unique-email resolution, TOTP state lookup, password credential persistence |
| `server/services/platform/user-portal-auth.mjs` | `f9e4e7036b079a63092898a15948424b074a067a` | 349–361, 419–437, 645–690 | Public session identity, login resolution, password verification and second-factor challenge |
| `server/services/platform/portal-password-credentials.mjs` | `ca9a5f201487f89202aff60e01f504c1622b4c28` | 118–205 | Password hash creation, verification, failure counters and lockout |
| `server/services/platform/portal-totp-verifier.mjs` | `f093ed7693e829bb40d93e15f0dce09ca689ce60` | 7–10, 61–110, 112–128, 171–193 | AES-256-GCM protector, keyless envelope, legacy plaintext/enc prefix handling, TOTP verification |
| `server/state.mjs` | `da3ddbe459d44d75e80cb196b2454ebbd6f3212c` | 695–707, 2446–2464, 2479–2505 | Environment key binding, shared User Portal/Admin TOTP protector, conditional password service wiring |
| `server/routes/admin-platform.mjs` | `0189b8b5b9bd06f66121caef65b2ec397d49d491` | 84–106, 302–326 | Admin email search digest and display-field projection |

The field-map evidence is in `docs/D1_CONTROL_FIELD_DISPOSITION_T2_V1.json` on the Draft branch.

## 3. Account identity and email lookup

### 3.1 Registration writer

At `portal-registration.mjs:210–237`, registration derives source-IP and request-context SHA-256 digests. At lines 227–237, duplicate registration checks compare the normalized email's ordinary SHA-256 digest with `loginDigest` and `contactDigest`.

At lines 285–333, account metadata writes:
- raw email to `loginRef` and `displayRef`;
- the same ordinary email digest to `loginDigest` and `contactDigest`;
- `displayDigest`, `useCaseDigest`, source-IP and request-context digests;
- non-PII product/legal fields.

The existing PII design correctly requires exact source normalization (trim + lowercase) and preserves equality between the paired source-IP and request-context evidence fields. Unused `displayDigest` and `useCaseDigest` should not be migrated merely because they exist.

### 3.2 Login resolution

At `subscription-control-db.mjs:466–477`, the store reads only `loginRef` and `displayRef` as metadata login aliases and lowercases them for comparison.

At lines 2083–2124, `resolvePortalLoginAccount()`:
1. accepts an exact account ID first;
2. otherwise scans active accounts;
3. compares the submitted login value with `loginRef` / `displayRef`;
4. resolves only a unique match; ambiguous matches do not resolve.

At `user-portal-auth.mjs:419–437`, password login delegates to this store lookup before password verification.

Removing the email refs therefore requires an authorized identity lookup that maps the normalized login identifier to one opaque account ID and preserves unique-match / ambiguity / generic-failure behavior. An HMAC email digest alone is not a reversible identity lookup and cannot supply the user's display label.

### 3.3 Session and Admin projection

At `user-portal-auth.mjs:349–361`, the public browser session currently derives `userRef` and `displayName` from `metadata.loginRef`. The target must decide whether to return a masked email, a user-approved display label, or an opaque account label, and how the user-facing identity is retrieved under authorization.

At `admin-platform.mjs:84–106`, Admin search normalizes email and computes ordinary SHA-256; at lines 302–326, account summaries use `loginRef`, `displayRef`, and `displayName`. The replacement must preserve authorized Admin search/display without leaking raw identifiers into D1 or logs.

## 4. Password credential custody

At `portal-password-credentials.mjs:118–205`, the service creates a password hash, stores it through `controlStore.createPortalPasswordCredential()`, verifies it by account ID, and records failure/lockout state.

At `server/state.mjs:2446–2451`, this service is conditionally wired when User Portal or Admin Auth routes are enabled. This source read does not prove those routes are enabled in production.

The T2 field map marks all 11 columns of `platform_portal_password_credentials` as `DEFER` / `deferred_until_feature_approval`. This means the table must not be copied into the first D1 target under the current disposition. It does **not** prove that the source feature is unused and does not authorize disabling password login.

Required decision:
- identify the authoritative password-credential verifier/store;
- preserve account lookup, hash verification, lockout counters, must-rotate semantics, credential revocation, and generic invalid-login behavior;
- decide whether the current BWH credential path remains a bounded credential-custody exception or is replaced by a separately approved identity/auth service;
- D1 may store only approved opaque account/credential refs and non-secret lifecycle facts.

No credential data was read or migrated in this audit.

## 5. TOTP secret custody and key rotation

### 5.1 Current encryption format

At `portal-totp-verifier.mjs:7–10`, the current protected prefix is `v2:aes-256-gcm:`; the key parser requires 32 bytes.

At lines 61–110, the protector encrypts with AES-256-GCM and stores IV, authentication tag and ciphertext. The envelope does not include a key ID. Decryption uses the single normalized key passed to the protector.

At `state.mjs:695–707` and 2452–2464:
- the protector key is read from `USER_PORTAL_TOTP_SECRET_KEY`;
- the same protector object is passed to both User Portal and Admin TOTP verification.

A safe key rotation cannot be inferred from the `v2` algorithm prefix alone. The target contract needs a key ID, old-key read / new-key write policy, re-encryption procedure, retirement proof, and an explicit decision on whether User Portal and Admin TOTP share or separate keys.

### 5.2 Legacy plaintext handling

At `portal-totp-verifier.mjs:82–110`, `unprotect()` returns the raw value unchanged when it does not begin with the current AES-GCM prefix.

At lines 112–128, the TOTP unwrapping function strips `enc:` and passes the remainder to Base32 decoding. Thus `enc:<base32>` is not authenticated ciphertext; it is raw secret material with a legacy label.

The field map marks `platform_portal_totp_credentials.encrypted_totp_secret` EXTERNALIZE. Before any target load:
- all values must be classified by exact format;
- legacy `enc:` / unprefixed Base32 values must be re-encrypted under the approved key/version or quarantined/rejected;
- no legacy value may be copied into D1 or a fixture under the assumption that it is encrypted.

Other TOTP fields (credential ref, account ref, status, failure/lock state and timestamps) remain KEEP candidates only after the external-secret reference and lifecycle contract is approved.

## 6. Required T2 decisions

1. **Identity authority:** named owner, system of record, normalized email lookup, display-label retrieval, Admin authorization, outage behavior, deletion and retention.
2. **Password authority:** explain the DEFER-vs-conditionally-wired-source discrepancy; preserve or explicitly retire password login through a separate approval.
3. **TOTP custody:** external secret store, opaque secret reference, encryption-key custody, key ID, key separation, rotation/re-encryption, enrollment, verification, lockout, recovery, revocation and outage behavior.
4. **Legacy values:** exact inventory method, accepted formats, re-encryption/quarantine, failure-closed behavior and evidence retention.
5. **Synthetic compatibility:** duplicate registration, unique/ambiguous login lookup, generic login failure, password lockout, TOTP success/failure/lockout, session identity, Admin search/display, canary equality and account deletion.
6. **Owner approval:** Identity/Privacy and Security owners must approve the final custody model before T2-C1/C2 can pass.

## 7. Explicit limits

- Source-only review at the pinned Master commit.
- Production route activation is NOT OBSERVED.
- No BWH connection, production database or customer-row access, credential read, secret read, or key provisioning.
- No source-code login change, no credential movement, no D1 DDL/apply, no remote Worker/DO deployment, no CI, no PR Ready/merge, and no production cutover.
- BWH remains the only production writer.
