# D1 T2 PII Pseudonymization and HMAC Compatibility v1 — Draft

> **Status:** SOURCE-DERIVED DESIGN + SYNTHETIC VECTORS. Not privacy/domain-owner approval, not secret provisioning, not production migration authorization.
> **Source anchor:** `master@be261abc60f28bb2733764fa5364ab44b3e76844`.
> **Draft branch:** `docs/d1-target-schema-g6-rehearsal-plan-20261107`.
> **Scope:** remove low-entropy PII and raw identity fields from account JSON while preserving duplicate-registration checks, admin email search, registration risk checks and canary eligibility.

## 1. Source behavior that must be preserved

### 1.1 Registration

`server/services/platform/portal-registration.mjs` currently:

- normalizes email by trimming and lowercasing;
- computes ordinary SHA-256 hex for the normalized email;
- uses that digest to reject duplicate registrations by comparing account metadata `loginDigest` and `contactDigest`;
- computes source-IP and request-context digests for registration-risk counting and legal-agreement evidence;
- writes raw `loginRef` and `displayRef` email strings to account metadata;
- writes `displayDigest` and optional `useCaseDigest`, although no runtime consumer was found for those two digest fields in the scoped source search.

The same source currently puts `legalAgreementSourceIpDigest` and `registrationSourceIpDigest` from the same value, and `legalAgreementRequestKeyDigest` and `registrationRequestKeyDigest` from the same value. Preserve those equality relationships unless a separately reviewed domain contract changes them.

### 1.2 Other consumers

- `server/routes/admin-platform.mjs` computes an ordinary SHA-256 digest from an admin email search and compares it with account `loginDigest` / `contactDigest`. When matched, the route may use the submitted search email as the returned account email. This is a distinct consumer of the same equality pseudonym.
- `server/state.mjs` currently configures registration welcome-Coins canary eligibility using a raw 64-hex SHA-256 email hash. The canary comparison is exact equality against the registration email digest.
- `server/services/platform/user-portal-auth.mjs` reads `metadata.loginRef` to produce the user-facing identity label.
- `server/routes/admin-platform.mjs` uses `displayRef` / `displayName` to produce admin display fields.
- `server/services/platform/portal-initial-account-issuance.mjs` can write a raw `displayName` into account metadata.

These dependencies mean simply deleting fields from `portal-registration.mjs` would break user-facing identity behavior. A separate, explicitly approved identity/PII custody boundary is required before source behavior can be changed.

### 1.3 Active authentication credential boundary

The current source inventory shows that account identity and authentication cannot be treated as an email-only PII cleanup:

- `server/services/platform/user-portal-auth.mjs` resolves the login identifier through `controlStore.resolvePortalLoginAccount()`, then verifies the password by opaque `accountId`. The public browser session currently derives its user-facing `userRef` / `displayName` from `metadata.loginRef`.
- `server/services/platform/portal-password-credentials.mjs` creates and verifies password hashes through the current control store. `server/state.mjs` wires this service into the active portal routes. The T2 field disposition currently marks all 11 columns of `platform_portal_password_credentials` as DEFER / excluded from D1. This is a data-placement decision, not evidence that password login is unused or may be disabled.
- `server/services/platform/user-portal-auth.mjs` passes `encryptedTotpSecret` to the TOTP verifier. The field disposition marks `platform_portal_totp_credentials.encrypted_totp_secret` EXTERNALIZE while the credential ref, account ref, status, lockout counters and timestamps remain KEEP candidates.
- `platform_portal_passkey_credentials` remains DEFER; the scoped source audit did not find a production service caller.

Before T2-C1 can pass, the project must approve an identity/authentication custody boundary that preserves current password and TOTP behavior without copying password hashes or encrypted TOTP secrets into D1. The target login path must define how email is resolved to an opaque account reference, how password verification and lockout state are performed, how TOTP verification retrieves the protected secret, and how session issuance remains bound to the resolved account. The source audit has not identified a separate production identity/credential service; do not assume one exists.

This section is a source-derived blocker clarification, not approval to deploy a new identity service, move credentials, change login behavior, or create secrets.

## 2. Data disposition

| Existing field | Observed purpose | Draft target disposition |
|---|---|---|
| `loginRef` | User Portal login/display fallback | Remove from D1 account metadata; resolve through approved identity custody |
| `displayRef` | Admin display identity | Remove from D1 account metadata; resolve through approved identity custody |
| `displayName` | Initial account display label | Remove from D1 account metadata; keep only in approved identity custody if product requires it |
| `loginDigest`, `contactDigest` | Duplicate registration and admin email search | Replace with same `account-email-lookup/v1` keyed pseudonym to preserve equality |
| `displayDigest` | No consumer found in scoped source search | Drop; do not migrate |
| `useCaseDigest` | No consumer found in scoped source search | Drop; do not migrate |
| `registrationSourceIpDigest`, `legalAgreementSourceIpDigest` | Registration risk and legal evidence | Replace with same `registration-source-ip/v1` keyed pseudonym |
| `registrationRequestKeyDigest`, `legalAgreementRequestKeyDigest` | Registration request-context evidence | Replace with same `registration-request-key/v1` keyed pseudonym |
| `intentPlan`, `requestedDeviceCount`, `primaryRegion`, legal flags/versions/timestamp and security flags | Non-PII product/control facts | Retain only through the separate exact `account-metadata/v1` allowlist |

Do not rename or repurpose a legacy field in-place without a versioned schema/migration contract. The table above defines semantic disposition, not approved DDL.

## 3. Pseudonym algorithm

The existing equality behavior can be retained without storing the low-entropy source value or the ordinary SHA-256 digest.

1. Apply the exact source normalization before hashing. For email this is trim + lowercase as already implemented by `normalizeEmail()`.
2. Compute the legacy SHA-256 digest in memory only:
   `legacyDigestHex = SHA256(UTF8(canonicalSourceValue)).hexLowercase`.
3. Transform that digest under a dedicated PII key and fixed domain:

```text
HMAC-SHA-256(K_pii[key_id],
  UTF8("flylink:d1:pii-digest:v1\0") ||
  LP(UTF8(key_id)) ||
  LP(UTF8(domain)) ||
  LP(UTF8(legacy_digest_hex)))
```

4. Persist only the versioned envelope:

```text
hmac-sha256:v1:<key-id>:<64-lowercase-hex>
```

LP is a four-byte unsigned big-endian byte length followed by UTF-8 bytes. Do not decode the legacy hex digest into bytes; its exact lowercase ASCII hex representation is the HMAC input field.

### Fixed domains

- `account-email-lookup/v1`: registration duplicate check, admin email search and registration canary equality.
- `registration-source-ip/v1`: source-IP rate limit and legal source-IP evidence; the two existing metadata fields retain equal values.
- `registration-request-key/v1`: request-context evidence; the two existing metadata fields retain equal values.

Domains are constants selected by the code path. Never accept a domain from request, account metadata, CLI input or Worker payload. Display/use-case digest domains are intentionally not defined because those values should be dropped unless a concrete consumer is established.

## 4. Compatibility rules

### 4.1 Duplicate registration

- New registration computes the email pseudonym using the active PII key and `account-email-lookup/v1`.
- The account lookup compares only versioned pseudonym envelopes generated for the active and retained read keys.
- Same canonical email must continue to match the same account throughout key rotation.
- Missing key ring, malformed envelope or unknown key ID fails closed; it must not silently fall back to plaintext or ordinary SHA-256 equality.

### 4.2 Admin email search

- Admin search computes candidate envelopes for the normalized search email under each retained key ID.
- Query/match uses only the `account-email-lookup/v1` domain.
- Do not expose the pseudonym or legacy digest in the admin response.
- If an exact search match is found, the existing behavior of returning the submitted normalized email may be retained, subject to the existing admin authorization boundary.
- General account display names must come from the approved identity custody boundary, not D1 metadata.

### 4.3 Registration canary

- The existing environment setting accepts a raw SHA-256 hex string. That representation must be treated as legacy and must not be accepted by the target runtime.
- The target canary value is a versioned `account-email-lookup/v1` pseudonym envelope. The configured value is a digest, not a key.
- The runtime must compare the candidate envelope under the configured key ID and fail closed on missing key, unknown key ID, malformed envelope or legacy raw SHA-256 value.
- The key itself remains in an approved secret binding; no key value is included in source, D1, environment reports, Notion or test fixtures beyond public synthetic constants.

### 4.4 User and admin display identity

- `loginRef`, `displayRef` and `displayName` are not pseudonyms and must not be moved into another D1 JSON field.
- User Portal authentication and admin display need a separate identity custody contract that can resolve an account reference to an authorized login/display value.
- The identity boundary must define access control, encryption at rest, key custody, retention, deletion, restore, and behavior during outage.
- Until that boundary exists and is separately approved, removing the fields from source would be a behavior-breaking change. This is an explicit blocker, not a reason to retain them in target D1.

## 5. Historical migration and key rotation

### 5.1 Historical transformation

- Historical email rows that still contain raw `loginRef` / `displayRef` may compute the canonical email SHA-256 and then the keyed pseudonym in the protected migration process. Raw email must not be exported to intermediate files, logs or evidence.
- Historical source-IP and request-context rows may be transformed by applying HMAC to their existing legacy SHA-256 hex values. No raw IP/user-agent value is required.
- Historical `displayDigest` and `useCaseDigest` are dropped unless a named consumer and purpose are approved before migration.
- If a row has only a legacy email digest and no raw email, it can still be transformed to the HMAC envelope by treating that exact legacy digest as the input. The migration must not attempt dictionary recovery.
- The transformation must be deterministic for the same key ID, domain and legacy digest, and must be repeatable without changing already transformed rows.

### 5.2 Rotation protocol

- PII pseudonymization uses its own key family, separate from idempotency and provider-event keys.
- Each stored envelope identifies the key ID used to create it.
- New writes use exactly one active key ID.
- Reads/lookups calculate candidates for every retained key ID and compare complete versioned envelopes.
- Keep old read keys until every row using that key has been re-keyed or deleted and all registration retry, admin lookup and canary compatibility windows have closed.
- Key retirement requires a row-count/reconciliation proof by key ID, a restore test, and owner approval.
- Never attempt to re-key by reversing the HMAC. Re-key from the retained legacy digest in the protected migration environment or from the canonical source value in memory.
- If any required key ID is unavailable, fail closed and emit only a safe error code; do not fall back to plaintext or unkeyed SHA-256.

### 5.3 Mixed-version rollout restriction

No dual-write or production mixed-version rollout is authorized by this document. Before such a rollout is considered, source and target readers/writers must have a separately reviewed compatibility protocol. A runtime that accepts both raw SHA-256 and HMAC indefinitely would preserve the weak legacy lookup path and is not an acceptable end state.

## 6. Synthetic evidence

The companion `server/tests/d1-t2-security-vectors.test.mjs` now includes:

- fixed synthetic known-answer vectors for account email, source IP and request-context domains;
- domain separation and key-ID separation;
- old-key lookup while retaining a new active write key;
- unknown/retired key failure;
- rejection of a legacy plain SHA-256 digest as a runtime fallback;
- checks that the persisted envelope contains neither the raw synthetic value nor its legacy SHA-256 digest.

All keys and source values in these tests are public synthetic constants. They are not production credentials.

## 7. Required source changes — not performed in this pass

1. Add a dedicated PII pseudonymization helper with exact key-ring validation, key ID parsing, fixed domain constants and constant-time digest comparison where raw digest comparisons occur.
2. Change registration duplicate checks and writes to use `account-email-lookup/v1` envelopes.
3. Change admin email search to compute candidate envelopes using the same domain and retained key ring.
4. Change canary configuration to require the versioned email pseudonym envelope; reject the legacy raw SHA-256 configuration.
5. Define and implement the separate identity custody boundary before removing `loginRef`, `displayRef` and `displayName` from source behavior.
6. Remove unused `displayDigest` and `useCaseDigest` fields after consumer search and compatibility tests confirm no remaining dependency.
7. Update account metadata exact allowlist and historical transformation manifest.
8. Add integration tests for registration duplicate rejection, admin search, canary eligibility, identity lookup and rotation. The current vector tests are primitive-level only and do not prove these integrations.

## 8. Gate status

**PII contract: DESIGN PARTIALLY CLOSED / IMPLEMENTATION BLOCKED.**

Closed in this pass:
- scoped source consumers identified;
- field disposition and fixed domains defined;
- HMAC-over-legacy-digest compatibility formula specified;
- synthetic vectors added for three PII domains;
- rotation and fail-closed rules documented.

Still blocked:
- identity custody owner and technical boundary;
- PII key custody approval and secret-binding design;
- registration/admin/canary source integration;
- exact account metadata allowlist enforcement;
- protected historical transformation rehearsal;
- domain-owner retention and privacy approval;
- independent T2 review.

No business source code, production database, BWH host, remote D1, Worker, secrets, deployment, CI, PR or merge was changed or used. BWH remains the only production write authority.
