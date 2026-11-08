# D1 T2-C1 Identity Provider Evaluation v1

> **Status:** DRAFT technical assessment — not a vendor selection, purchase approval, tenant-creation authorization, or implementation authorization.
> **Review date:** 2026-11-07
> **Repository:** \`FlyLink-com/proxy-gateway-minimal\`
> **Draft branch:** \`docs/d1-target-schema-g6-rehearsal-plan-20261107\`
> **Source-code anchor:** \`master@be261abc60f28bb2733764fa5364ab44b3e76844\`
> **Draft baseline:** \`098d4a24d2f29412a6f1cf2df9347ab96219e182\`
> **Production authority:** BWH remains the only production writer until a separately approved cutover.
> **Scope:** Public vendor documentation, repository source review, and synthetic-only reasoning. No production identity rows, customer data, passwords, TOTP seeds, real keys, BWH access, Cloudflare production resources, or vendor tenants were accessed or configured.

## 1. Executive conclusion

### 1.1 Recommended managed candidate

**Auth0 Essentials + Bulk User Import** is the strongest managed candidate on the evidence currently available.

The decisive finding is that Auth0's bulk-import schema supports both:

- \`custom_password_hash\` using standard \`scrypt\` with explicit cost, block-size, parallelization and key-length parameters;
- \`mfa_factors\` containing a TOTP secret.

The current project password format is standard Node \`crypto.scryptSync\` with \`N=32768\`, \`r=8\`, \`p=1\`, \`keylen=64\`, and a raw 16-byte salt. These parameters can be represented in Auth0's scrypt import schema. The current salt and derived hash are stored as base64url fields inside the project envelope; a converter can decode the original bytes and encode them in the import schema without knowing the user's plaintext password.

Auth0 Essentials currently lists **$35/month for up to 500 MAU**, includes Pro MFA and User Import, and includes three tenants. The Professional tier lists $240/month for up to 500 MAU and adds Custom Database Connections. A direct bulk-import path does not require the Custom Database Connection feature; Professional should not be purchased merely for this migration.

**This is a preferred candidate, not a selected provider.** It remains conditional on the 72-byte bcrypt limit, password normalization, email-OTP policy, TOTP time-window compatibility, customer-region reachability, data-processing terms, and a synthetic import proof.

### 1.2 Alternative if no password reset is acceptable

**Keycloak with a custom PasswordHashProvider and a controlled TOTP credential importer** is the most flexible self-hosted alternative.

It can be engineered to verify the existing Node scrypt envelope exactly and store TOTP credentials without asking users to re-enroll. However, this requires a Java extension, import tooling, an independently operated identity database, HA/backup/upgrade procedures, and ongoing security ownership. It is not a low-maintenance substitute for a managed provider.

### 1.3 Conditional cost challenger

**Clerk Pro** has a strong native Android flow, email codes, TOTP enrollment/import fields, and a low published entry price. Its supported password digest formats include \`scrypt_werkzeug\`, but the current project stores a raw random 16-byte Buffer as the scrypt salt. Werkzeug's format treats its salt field as a UTF-8 string. Merely putting the project's base64url salt text into that field changes the bytes supplied to scrypt and does not preserve the existing digest.

Clerk becomes a viable lower-cost challenger only if Clerk confirms support for the project's exact raw-salt Node scrypt format (or a synthetic proof establishes a lossless import path). No support request has been sent.

### 1.4 Not recommended as the first choice under the current no-TOTP-loss constraint

- **Firebase Identity Platform:** standard scrypt import appears parameter-compatible, and Android TOTP is supported; however, the documented bulk-import MFA factor schema exposes phone MFA, not TOTP. Existing TOTP seeds therefore have no documented import path.
- **Amazon Cognito:** native Android TOTP and a password migration Lambda are available, but the documented TOTP enrollment flow creates a new secret; no existing-seed import path was found. It therefore requires TOTP re-enrollment or a custom external TOTP challenge.

## 2. Source-derived compatibility baseline

All source findings below are pinned to \`be261abc60f28bb2733764fa5364ab44b3e76844\`. The source audit does not prove that the conditional Portal/Admin authentication routes are active in production. Production activation remains **NOT OBSERVED**.

| Area | Current source contract | Migration consequence |
| --- | --- | --- |
| Password algorithm | \`scrypt$v=1$N=32768$r=8$p=1$<salt-base64url>$<derived-base64url>\`; 64-byte derived key; 16-byte random salt; Node UTF-8 password input | A provider must import/verify the raw salt and hash bytes with identical scrypt parameters, or provide an approved legacy-verifier/JIT migration path. |
| Password normalization | Password is trimmed before hashing and verification; registration accepts 8–160 JavaScript characters | Provider-facing clients must preserve \`trim()\` semantics. A byte limit in the target provider must be handled explicitly, not silently. |
| Password lockout | Current service defaults to 5 failures and a 900-second lock | Provider brute-force settings must be tested against this contract; generic public invalid-login behavior must remain. |
| \`mustRotate\` | Credential record stores the flag; the pinned \`user-portal-auth.mjs\` path does not read it | Do not infer that current login blocks sessions on this flag. Do not introduce forced rotation without a separate owner decision. |
| Account resolution | Exact account ID first; otherwise scan active accounts for \`loginRef\` / \`displayRef\`; only a unique match resolves; ambiguous matches fail closed | Preserve a stable opaque account binding and reject duplicate/ambiguous identity links. |
| Portal TOTP | Standard TOTP: SHA-1, 6 digits, 30-second period, one adjacent interval on either side | Provider time-window tolerance and lockout must be verified using synthetic codes around period boundaries. |
| TOTP storage | AES-256-GCM \`v2\` envelope has no key ID; legacy \`enc:\` values are raw Base32 secret material, not ciphertext | C2 must approve key inventory/decryption and the one-time secret transfer. Never infer that \`enc:\` is encrypted. |
| Portal/Admin composition | Portal and Admin use the shared password credential service and TOTP protector in the current composition | Target identity domains must have explicit Portal/Admin separation; do not carry the shared key boundary forward by default. |
| Registration verification | Six-digit email code; 10-minute expiry; at most 5 attempts; 3 sends per normalized email per 15 minutes; 5 sends per request key per 15 minutes; in-memory state | Provider-native OTP behavior must be compared to the exact current TTL, retry and rate-limit contract. |
| Registration side effects | Account/trial/welcome-Coins and eligibility/canary logic are coordinated with account creation | Create the account and grant trial/Coins only after verified identity binding; all writes must remain idempotent. |
| Email pseudonym | Current source uses ordinary SHA-256 email digest in some lookup/canary paths | Replace with opaque subject or separately approved C2 HMAC; ordinary low-entropy SHA-256 is not anonymization. |
| Session projection | Public Portal session currently derives \`userRef\` / display label from email-backed metadata | The new session must use opaque account/subject refs; profile display must not route raw email through the business Worker. |
| Admin directory | Admin search/display currently projects email-backed metadata | Use a separately authorized identity-directory path; business Worker and D1 must not become the email directory. |

### 2.1 Conditional activation is a hard precondition

The source wires password credentials and the Portal/Admin auth services conditionally. No production configuration or customer record was read in this assessment. Therefore:

- do not assume every current account has a row in \`platform_portal_password_credentials\`;
- do not assume the current scrypt credential path is the production login path;
- do not assume all existing TOTP secrets use the same envelope;
- do not assume all existing accounts have the same email-verification history.

Before any real import, a separately authorized configuration-only review must identify the active authentication cohorts without exporting customer rows or secrets.

## 3. Auth0 — preferred managed candidate

### 3.1 Direct bulk-import mapping

Auth0's official Bulk User Import schema supports \`custom_password_hash.algorithm = "scrypt"\` and explicit scrypt parameters. The project's envelope can be mapped as follows:

| Project field | Auth0 import field | Value |
| --- | --- | --- |
| Algorithm | \`custom_password_hash.algorithm\` | \`scrypt\` |
| Node \`N\` | \`cost\` | \`32768\` |
| Node \`r\` | \`blockSize\` | \`8\` |
| Node \`p\` | \`parallelization\` | \`1\` |
| Node \`keylen\` | \`keylen\` | \`64\` |
| Raw salt bytes | \`salt.value\` | Decode the current base64url salt to its original 16 bytes, then encode as supported base64 |
| Derived hash bytes | \`hash.value\` | Decode the current base64url digest to its original 64 bytes, then encode as supported base64 |
| Password byte encoding | \`password.encoding\` | \`utf8\` |

This is a schema-level parameter match, not yet an Auth0 endpoint acceptance test. The import converter must parse the project envelope strictly, reject unknown versions/parameters, preserve the exact byte values, and never emit the original combined string as an unsupported opaque hash.

Auth0 also supports a TOTP factor in \`mfa_factors\`. The current project's normalized Base32 secret is structurally compatible with the TOTP import field. The same user import record can carry \`email_verified\`, the custom password hash, and the TOTP factor.

**Important:** the bulk import file contains raw email and decrypted TOTP secret material. It must never be committed to GitHub, retained as a normal build artifact, written to logs, or left on persistent local storage. A real import would require a separately approved, ephemeral, encrypted transfer process under C2 and Risk A controls.

### 3.2 Auth0 password-length limitation

Auth0 documents bcrypt as its internal password storage algorithm. After a successful login with an imported custom hash, Auth0 migrates the password to its internal bcrypt representation. bcrypt processes only the first 72 bytes.

The current project accepts passwords up to 160 JavaScript characters and hashes the trimmed UTF-8 bytes. Therefore the Auth0 route cannot silently accept every possible historical password.

Required compatibility policy:

1. Apply the exact existing \`trim()\` normalization before sending credentials to the provider.
2. Count UTF-8 bytes after normalization, not JavaScript characters.
3. Never send a password longer than 72 UTF-8 bytes to Auth0 for first login.
4. Route such a user to an email-verified, targeted password-reset flow; do not force-reset the entire user base.
5. Set the provider's minimum password length to 8 to match the existing registration contract; test the provider's password policy separately from imported-password verification.
6. Set new-password maximum to 72 UTF-8 bytes unless an approved alternative hash path is selected.

The current project does not reveal which users have passwords longer than 72 bytes. Do not claim that the affected population is zero.

### 3.3 TOTP compatibility

The source verifier uses SHA-1, six digits, a 30-second period and a ±1 interval window. Auth0's TOTP import accepts the secret, but the effective validation window and lockout semantics must be tested.

Required synthetic proof:

- import one synthetic Base32 TOTP secret;
- verify a code in the current 30-second interval;
- verify behavior at the previous and next intervals;
- verify rejection outside the allowed window;
- verify five failed attempts and the 900-second lockout policy, or document the approved replacement;
- prove that no raw secret appears in Worker logs, traces, fixtures or response bodies.

For real migration, the C2 key-custody decision must separately authorize decrypting the \`v2\` envelope. The \`enc:\` legacy value must be treated as raw Base32, stripped and normalized, not decrypted.

### 3.4 Email verification and signup behavior

Auth0 supports an email OTP verification flow before signup completes, using its Identifier-First / Flexible Identifiers flow. Its documented defaults are not identical to the current service: the code validity period is 15 minutes, and the documented request limit is IP-based (5 requests per minute); the documentation does not provide the current per-code five-attempt cap or per-email/per-request throttle contract.

Two acceptable paths remain open:

- approve the provider-native OTP policy as a deliberate behavior change after abuse/rate-limit review; or
- implement a separately bounded verification policy that preserves the current 10-minute TTL, five attempts, and per-email/per-request throttles.

Do not claim exact registration compatibility until this is tested end to end. The Identifier-First flow may change the current form sequence and must be checked against the existing email/password registration UI. Account creation, trial issuance, welcome-Coins and canary decisions must occur only after the verified provider subject is bound, and must remain idempotent.

### 3.5 Portal/Admin separation and directory

Auth0 Essentials currently includes three tenants. A plausible separation is Portal production, Admin production, and shared non-production; this still needs owner approval and environment design. Do not treat a single shared user directory as sufficient Admin isolation.

The Admin directory must use a separate Management API client with minimum read scopes and explicit audit. Auth0 user search has a 1,000-result query ceiling; exact-email lookup and bounded search should be used rather than unbounded broad scans. The current Admin search semantics must be compared to the Management API query language before replacing them. Raw email may be returned to an authorized Admin interface, but it must not be projected into D1 or the business Worker.

### 3.6 Current public pricing and plan fit

As reviewed on 2026-11-07:

- Essentials: $35/month for up to 500 MAU; includes Pro MFA, User Import, three tenants, and separate production/development environments.
- Professional: $240/month for up to 500 MAU; adds existing-user-database login / Custom Database Connections and Enterprise MFA.
- A direct bulk-import path does not require Custom Database Connections, so Professional is not the default recommendation.
- Paid tiers allow custom user counts; actual cost cannot be estimated without the project's MAU.
- Public Cloud is multi-tenant. Private deployment/data-residency options are Enterprise add-ons and require a separate quote.

If the user base is mainly in mainland China or another region with restrictive network conditions, login, callback, email delivery and token refresh reachability must be tested from the actual user regions before provider approval. No region or residency choice is made here.

## 4. Alternative provider comparison

| Provider | Existing password | Existing TOTP | Android | Main limitation | Assessment |
| --- | --- | --- | --- | --- | --- |
| Auth0 Essentials | Direct scrypt bulk import schema match | TOTP import supported | Official Android SDK + OIDC/PKCE | bcrypt 72-byte cap after first successful login; email OTP policy differs | **Preferred managed candidate**, conditional |
| Keycloak | Custom PasswordHashProvider can verify the exact legacy format | Custom credential importer / provider required | OIDC/PKCE via native OIDC library | Java extension and full identity-service operations | **Best fidelity fallback** if targeted reset is not acceptable |
| Clerk Pro | Supports specific digest formats including \`scrypt_werkzeug\`; current raw Buffer salt is not proven losslessly compatible | \`totpSecret\` import fields available | Native Android SDK supports TOTP | Requires vendor confirmation or custom hasher support for this exact Node scrypt format | **Cost challenger**, conditional |
| Firebase Identity Platform | \`STANDARD_SCRYPT\` import exposes cost, parallelization, block size and key length; candidate mapping is N=32768, p=1, r=8, dkLen=64 | Bulk import \`MfaFactor\` schema exposes phone factor only; no TOTP seed import field | Android TOTP supported from SDK 22.1.0; adjacent intervals configurable | Existing TOTP cannot be imported through the documented batch-create MFA schema; duplicate identifiers are not checked automatically | Low-cost option only if TOTP re-enrollment is explicitly accepted |
| Amazon Cognito | User Migration Lambda can verify a legacy password at first login and migrate the user | No documented existing TOTP-seed import; \`AssociateSoftwareToken\` creates a new secret | Amplify Android supports TOTP | Existing TOTP must be re-enrolled or kept in a custom external challenge; user-migration flow adds Lambda and legacy-verifier dependency | Low-cost option only if TOTP re-enrollment/external challenge is approved |

### 4.1 Clerk

Strengths:
- Native Android SDK includes TOTP MFA.
- User creation API supports \`totpSecret\`, TOTP period, digits and algorithm.
- Email codes are a first-class sign-in option.
- Pro is currently listed at $20/month billed annually, with 50,000 retained monthly users included per app; additional MRUs are usage-priced.
- Pro includes MFA; Business adds 30-day Application/Admin Logs and advanced protections.

Blocker:
- The project's scrypt salt is a random binary Buffer. Clerk's documented \`scrypt_werkzeug\` is Werkzeug-format and uses a string salt. Encoding the current raw salt as base64url text changes the salt bytes supplied to scrypt. No lossless conversion has been demonstrated.
- Ask Clerk support whether they can accept a custom Node scrypt format with raw salt bytes and exact parameters. Until a written answer and synthetic import proof exist, mark password import **NOT PROVEN**.

### 4.2 Firebase Identity Platform

Strengths:
- \`STANDARD_SCRYPT\` exposes \`cpuMemCost\`, \`parallelization\`, \`blockSize\` and \`dkLen\`; the candidate mapping is \`32768 / 1 / 8 / 64\`.
- TOTP is supported on Web, Android SDK 22.1.0+ and iOS SDK 10.12.0+.
- The TOTP adjacent-window setting is configurable from 0 to 10; the current project's ±1 behavior can be represented by setting one adjacent interval.
- Email/password Tier 1 pricing currently includes 50,000 MAU free, then $0.0055 per MAU from 50,000 to 100,000, with lower subsequent tiers.

Blockers:
- The documented batch-create \`MfaFactor\` schema only accepts \`phoneInfo\`; it does not accept an existing TOTP secret. TOTP enrollment generates a new secret.
- Batch import is optimized for speed and does not check duplicate identifiers; duplicate emails can create additional users. A full normalized-email/UID preflight is mandatory.
- The standard-scrypt parameter mapping still needs an Identity Platform synthetic import and sign-in proof.

### 4.3 Amazon Cognito

Strengths:
- User Migration Lambda can validate a user's existing password during first sign-in and migrate the user without requiring a blanket password reset.
- Amplify Android supports TOTP and email confirmation codes.
- Current published pricing has a 10,000-MAU free tier; Lite is $0.0055 per MAU for the next tier, while Essentials is $0.015 per MAU after the free tier. Email/SMS delivery and usage details must be priced separately. This is usage-based and not directly comparable to Auth0's plan price.

Blockers:
- The documented TOTP setup flow generates a new software-token secret; no API to import an existing TOTP seed was found.
- The migration Lambda receives the submitted password; event/password logging must be prohibited.
- The old credential verifier remains a dependency until each user migrates.
- Cognito does not support passwordless sign-in and MFA simultaneously in the same user pool. This is not the same as signup email confirmation, but it constrains future email-OTP login design.

### 4.4 Keycloak

Strengths:
- Custom password-hash provider support can implement the exact project scrypt envelope and rehash after a successful login to the selected Keycloak algorithm.
- Built-in TOTP policies can be configured to match SHA-1, six digits, 30 seconds and the required look-ahead/look-behind window.
- Realms can separate Portal and Admin identities.
- No per-MAU SaaS license; cost is infrastructure, database, HA, backups, monitoring, patching and security operations.

Blockers:
- Existing TOTP seeds need a controlled importer or extension; this is not treated as a zero-code built-in bulk import.
- Custom Java extensions must be tested against the exact Keycloak release and upgrade policy.
- The organization becomes responsible for the identity control plane, incident response, key rotation, recovery and availability.

## 5. Recommended target architecture if Auth0 is approved

1. **Browser / Android:** Authorization Code + PKCE directly with the provider. The business Worker never receives raw passwords, TOTP codes or recovery codes.
2. **Identity provider:** owns normalized email, email verification, password hash, TOTP, lockout, credential revocation and profile.
3. **Authentication gateway:** validates issuer, audience, signature, expiry, nonce and required authentication strength; strips the original bearer assertion before forwarding an opaque trusted actor context to the business Worker.
4. **Business Worker:** receives only \`issuerRef\`, \`subjectRef\`, \`accountRef\` and approved authentication-strength flags. It does not receive raw email or display name.
5. **D1:** stores only the opaque account-to-identity binding and approved non-secret lifecycle state. It does not store email, display name, password hash, TOTP secret, recovery code, access token or refresh token.
6. **Admin directory:** separate tenant/client and Management API credential, with least-privilege read scope and audited search. It must not reuse Portal authorization.
7. **Coins canary:** use opaque subject or a separately approved C2 HMAC eligibility reference; do not send raw email or ordinary SHA-256 email digest to the business Worker.
8. **Registration side effects:** only after verified subject binding; account/trial/Coins writes remain idempotent and are audited through the existing typed Audit writer.

## 6. Required synthetic proof before vendor selection

No provider tenant is to be created by this document. If Auth0 is approved for a non-production proof, the following must pass using synthetic-only data:

| ID | Proof | Pass condition |
| --- | --- | --- |
| C1-IDP-01 | Generate a synthetic project-format scrypt credential | Exact N/r/p/keylen, raw salt and digest bytes preserved in the Auth0 import record |
| C1-IDP-02 | Import synthetic user with \`custom_password_hash\` | Auth0 accepts the import; correct password succeeds; wrong password fails |
| C1-IDP-03 | First successful login after custom-hash import | Rehash behavior observed; no hidden password truncation or normalization change |
| C1-IDP-04 | Passwords with leading/trailing whitespace | Provider-facing client preserves current JavaScript \`trim()\` semantics |
| C1-IDP-05 | Password length | 8-byte/8-character minimum preserved; >72 UTF-8-byte password is routed to targeted reset before provider authentication |
| C1-IDP-06 | Synthetic TOTP factor import | Existing synthetic Base32 seed works without re-enrollment |
| C1-IDP-07 | TOTP time window | Current, previous and next interval behavior matches the approved ±1 policy |
| C1-IDP-08 | TOTP lockout | Five failures / 900-second lockout or explicitly approved equivalent |
| C1-IDP-09 | Email OTP registration | Code length, expiry, attempts, per-email and per-request rate limits are explicitly accepted or reproduced |
| C1-IDP-10 | Portal/Admin isolation | Separate tenants/clients; no cross-tenant session or factor reuse |
| C1-IDP-11 | Admin directory | Exact and bounded partial search; result caps; least-privilege Management API; sanitized audit |
| C1-IDP-12 | Token projection | No email/name/credential claims in the business Worker actor context; direct gateway bypass rejected |
| C1-IDP-13 | Duplicate and partial import | Normalized-email preflight, deterministic account binding, per-record error reconciliation and idempotent rerun |
| C1-IDP-14 | Provider outage/revocation | Fail closed for new auth; valid existing sessions follow approved bounded expiry/revocation policy |
| C1-IDP-15 | Data exposure scan | No raw email, password, TOTP seed, recovery code, bearer token or unkeyed low-entropy digest in Worker, D1, logs, traces, fixtures or evidence |
| C1-IDP-16 | Android and browser parity | Same issuer, audience, MFA strength and account binding across supported clients |

The proof must record exact provider plan, tenant region, SDK versions, synthetic fixture hashes, API request/response status, and import/readback results. Do not use real users or production credentials.

## 7. Owner decisions still required

1. Approve or reject Auth0 Essentials as the preferred managed candidate after the synthetic proof; this is not approved by the present assessment.
2. Approve the targeted password-reset policy for passwords over 72 UTF-8 bytes, or choose Keycloak/custom hashing if no reset is acceptable.
3. Decide whether the email-verification OTP contract may change from 10 minutes/five attempts to the provider's native policy, or must be reproduced exactly.
4. Confirm customer geography, required data residency, email deliverability and login reachability from actual user regions.
5. Confirm expected MAU/MRU and acceptable monthly cost.
6. Approve Portal/Admin tenant separation and account-link policy.
7. Approve the one-time transfer and purge process for decrypted TOTP seeds under C2; no real key is authorized here.
8. Confirm whether \`mustRotate\` is a product requirement or merely a stored legacy field.
9. Confirm production authentication route activation through a separately authorized configuration-only review; current activation is NOT OBSERVED.
10. Name Identity/Privacy and Security owners for provider, data processing, recovery and account lifecycle decisions.

## 8. Decision and current disposition

- **Preferred managed candidate:** Auth0 Essentials + Bulk User Import, conditional on synthetic proof and the 72-byte/OTP policy decisions.
- **Best no-reset fidelity fallback:** Keycloak with custom password-hash and TOTP import extensions.
- **Conditional cost challenger:** Clerk Pro, only if custom Node scrypt raw-salt import is confirmed.
- **Not preferred under current TOTP-preservation requirement:** Firebase Identity Platform and Amazon Cognito, because the documented bulk/import path does not import the existing TOTP secret.
- **Vendor selected:** NONE.
- **C1:** BLOCKED — provider not owner-approved; synthetic provider proof not run.
- **C2:** OPEN — TOTP key custody, key IDs, separation and legacy compatibility remain unresolved.
- **C3:** OPEN — account metadata/PII and independent review remain outstanding.
- **T2:** BLOCKED.
- **T3 / G6:** not started.

This assessment adds documentation only. It does not change authentication source code, D1 schema, migration code, production configuration, provider tenants, email delivery, keys or production authority. No BWH access, Cloudflare production access, customer-data read, real TOTP decryption, import, Worker/DO deployment, CI, PR Ready transition, merge or cutover is authorized.

## 9. Official references

### Auth0
- [Bulk User Import Schema and Examples](https://auth0.com/docs/manage-users/user-migration/bulk-user-import-database-schema-and-examples)
- [Importing MFA Factors](https://support.auth0.com/center/s/article/Importing-MFA-Factors)
- [Auth0 Pricing](https://auth0.com/pricing)
- [Email OTP verification before signup](https://support.auth0.com/center/s/article/Verify-email-address-before-signup-completes)
- [Password hash import and bcrypt behavior](https://support.auth0.com/center/s/article/Password-Hash-Import-with-Firebase-s-Scrypt-Algorithm)
- [Auth0 Android SDK](https://github.com/auth0/Auth0.Android)
- [Auth0 Management API — Search Users](https://auth0.com/docs/api/management/v2/users/get-users)

### Clerk
- [Create User API](https://clerk.com/docs/reference/backend/user/create-user)
- [Password hash migration guide](https://clerk.com/docs/guides/development/migrating/migrate-user-data)
- [Android authentication flows and TOTP](https://clerk.com/docs/android/reference/native-mobile/auth)
- [Clerk Pricing](https://clerk.com/pricing)
- [Werkzeug scrypt implementation](https://github.com/pallets/werkzeug/blob/main/src/werkzeug/security.py)

### Firebase Identity Platform
- [Import Users / Password Hashing](https://firebase.google.com/docs/auth/admin/import-users)
- [Identity Platform batchCreate API](https://cloud.google.com/identity-platform/docs/reference/rest/v1/projects.accounts/batchCreate)
- [MfaFactor schema](https://cloud.google.com/identity-platform/docs/reference/rest/v1/MfaFactor)
- [TOTP MFA, Android SDK and adjacent intervals](https://cloud.google.com/identity-platform/docs/admin/enabling-totp-mfa)
- [Identity Platform Pricing](https://cloud.google.com/identity-platform/pricing)

### Amazon Cognito
- [User Migration Lambda Trigger](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-lambda-migrate-user.html)
- [AssociateSoftwareToken API](https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_AssociateSoftwareToken.html)
- [Amplify Android MFA / TOTP](https://docs.amplify.aws/android/build-a-backend/auth/concepts/multi-factor-authentication/)
- [Cognito Pricing](https://aws.amazon.com/cognito/pricing/)

### Keycloak
- [Server Developer Guide — custom providers and password hash providers](https://www.keycloak.org/docs/latest/server_development/)
- [Server Administration Guide — OTP policy and user federation](https://www.keycloak.org/docs/latest/server_admin/)
