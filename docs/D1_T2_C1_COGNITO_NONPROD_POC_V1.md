# D1 T2-C1 Amazon Cognito Non-Production PoC v1

~~~yaml
document_metadata:
  doc_type: evidence
  lifecycle: draft
  authority_scope: d1_t2_c1_cognito_nonprod_poc
  superseded_by: null
  last_verified_at: 2026-11-15
  production_authority: false
~~~

> **DRAFT — NON-PRODUCTION TECHNICAL PROOF ONLY.** This document records the first Cognito PoC scope and local synthetic converter. It is not a final vendor selection, purchase approval, production tenant authorization, real-user import authorization, D1 migration approval, or production cutover authorization.

- Repository: FlyLink-com/proxy-gateway-minimal
- Source baseline: master at 11dd1cfb208b78a85ce77b8c8aef2b6763f9000a
- PoC branch: feat/c1-cognito-scrypt-poc-20261115
- Production authority: BWH remains the only production writer until a separately approved cutover.
- Existing C1/Auth0 evidence is retained as historical evidence. This PoC evaluates Cognito as the first non-production candidate; it does not rewrite or erase earlier evidence.

## 1. Objective and boundary

Evaluate Amazon Cognito User Pools as the first non-production managed identity candidate for the FlyLink D1 identity migration.

The PoC is limited to:
- Synthetic-only Scrypt hash conversion and import-record construction.
- A non-production Cognito User Pool import using one fixed synthetic account.
- First sign-in against the imported Scrypt hash and automatic migration to Cognito native SRP credentials.
- Portal/Admin User Pool separation.
- Portal optional TOTP and Admin required TOTP.
- Cognito token claims and Cloudflare Worker verification compatibility.

Explicitly excluded:
- Production user rows, emails, password hashes, plaintext passwords, TOTP seeds or recovery codes.
- Production AWS resources, Cloudflare Workers, D1, Durable Objects, Secrets, routes or bindings.
- BWH access, production import, dual-write, data loading, deployment or cutover.
- Any assumption that a local synthetic PASS proves Cognito service acceptance.

## 2. Why Cognito is now the first PoC candidate

AWS announced password-hash CSV import on 2026-07-15. Cognito supports BCRYPT, SCRYPT, ARGON2ID and PBKDF2_SHA256. With a password hash column and a job-level algorithm selection, imported users can sign in with their existing passwords. Cognito verifies the imported hash on first sign-in, then migrates the credential to its native authentication system. Subsequent sign-ins use Cognito SRP.

Official references:
- https://aws.amazon.com/about-aws/whats-new/2026/07/amazon-cognito-password-hash-import/
- https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-using-import-tool.html

This feature materially changes the earlier assessment that Cognito could not preserve existing passwords. The earlier C1 provider assessment predates this July 2026 capability and must not be treated as current for password-import suitability.

## 3. Source compatibility baseline

The current source password service and synthetic rehearsal establish:

| Parameter | Existing FlyLink source |
|---|---|
| Algorithm | Node crypto Scrypt |
| N | 32768 |
| r | 8 |
| p | 1 |
| Derived key length | 64 bytes |
| Salt | 16 random bytes in the current fixture |
| Password input | UTF-8 after ECMAScript String.trim() |
| Stored envelope | scrypt versioned envelope with Base64URL salt and derived hash |

AWS documents Cognito Scrypt import as:

- Format: N$r$p$hexSalt$hexHash
- Maximum N: 65536
- Maximum r: 8
- Maximum p: 1

The current N/r/p values are within AWS's documented limits. The converter decodes the existing Base64URL salt and hash bytes and renders them as lowercase hexadecimal. It does not re-derive, truncate, normalize or otherwise change the stored digest.

**Unproven critical detail:** AWS documents the Scrypt format and parameter ceilings but does not explicitly state the accepted derived-hash byte length in the cited page. The current source produces a 64-byte derived key, while the AWS example shows a shorter digest. A real non-production import job must prove acceptance of the exact 64-byte source digest before this path is considered compatible.

The converter and tests are in:
- server/services/platform/portal-cognito-scrypt-import-rehearsal.mjs
- server/tests/platform-portal-cognito-scrypt-import-rehearsal.test.mjs
- scripts/platform-cognito-scrypt-import-rehearsal.mjs

The local command emits only a redacted receipt. It does not call AWS, write a CSV file, or emit a password hash.

## 4. Cognito import constraints to prove

### 4.1 User Pool eligibility

AWS notes that password-hash import is not available on every existing User Pool. It requires modern Cognito infrastructure. Eligible pools show the password-hashing-algorithm selector when creating an import job.

The PoC must create fresh non-production pools and confirm that the SCRYPT selector is actually present before proceeding.

### 4.2 CSV and email verification

AWS requires the downloaded User Pool CSV template. All template columns must be present, even when some values are blank. The password_hash column is required when the import job specifies an algorithm.

The documented required identity fields include:
- cognito:username
- email_verified or phone_number_verified set to true
- email when email_verified is true
- all attributes configured as required in the User Pool

A single import job uses one password-hashing algorithm. All rows in that job must use the same algorithm.

The synthetic fixture uses a reserved example.test email and email_verified=true. This is only a synthetic test value. **Do not mark a real user's email as verified unless the existing source system has authoritative evidence that it was verified.** Unverified-email accounts require a separately reviewed verification path and must not be silently promoted to verified.

### 4.3 Import file custody

A Cognito import CSV contains password hashes and identity attributes and must be treated as a sensitive credential artifact. AWS documents upload through a pre-signed URL and deletion of temporary uploaded data after the import job completes.

For the PoC:
- Use only the fixed synthetic record.
- Generate the CSV only from the User Pool's downloaded template.
- Never print the CSV or password_hash value to logs.
- Never commit the CSV, pre-signed URL, IAM role credentials or AWS credentials.
- Keep the artifact in a restricted temporary location and securely delete the local copy after the job.
- Review CloudWatch import logs for accidental sensitive-field disclosure.

### 4.4 First sign-in and SRP transition

AWS documents that users with imported password hashes cannot use SRP until their first successful sign-in. The first sign-in must use USER_PASSWORD_AUTH or ADMIN_USER_PASSWORD_AUTH. Cognito verifies the imported Scrypt hash; after successful authentication it migrates the credential to its native authentication system. Later sign-ins should use SRP.

The PoC must prove:
1. Correct synthetic password succeeds on the first imported-hash login.
2. Incorrect password fails with non-enumerating public behavior.
3. The first successful sign-in migrates the credential.
4. A subsequent SRP sign-in succeeds.
5. A password reset before first sign-in replaces the imported hash as documented.
6. Import failure and partial-job reconciliation do not create ambiguous or duplicate identity bindings.

The PoC must not log the full authentication event or password-bearing request.

### 4.5 Password normalization and byte boundaries

The existing source trims password input before Scrypt verification. Cognito must not be assumed to reproduce ECMAScript trim semantics. Browser, Android and Admin clients must perform the approved trim-only normalization before sending a password to Cognito, and this must be proved against the actual Cognito sign-in path.

Unlike the former Auth0 bcrypt re-hash path, Cognito's documented imported-Scrypt flow migrates to its native SRP credential system. The Auth0-specific 72-byte bcrypt rule must not be copied into the Cognito implementation as an assumed limit. However, the PoC must test:
- 71 UTF-8 bytes
- 72 UTF-8 bytes
- 73 UTF-8 bytes
- 24 Chinese characters (72 UTF-8 bytes)
- 25 Chinese characters (75 UTF-8 bytes)
- leading/trailing whitespace under the legacy trim-only rule

The local tests prove only that the converter preserves the source hash bytes and does not impose a bcrypt truncation rule. They do not prove Cognito service acceptance of the 64-byte digest or long-password behavior.

AWS also states that password policy is not enforced during hash import. Source-side password policy and historical cohort behavior must be reviewed before any real-user import.

## 5. MFA and Portal/Admin separation

The existing T1 direction is retained: historical TOTP factors are not imported. Users re-enroll with a newly generated Cognito TOTP secret. No legacy TOTP secret is copied into the Cognito CSV.

Target topology for the PoC:
- Portal non-production User Pool: TOTP optional; users can opt in from account security settings.
- Admin non-production User Pool: TOTP required; users must complete enrollment before obtaining an ordinary signed-in session.
- Separate app clients, issuers, signing keys, user directories and MFA factors.
- No cross-pool identity acceptance.

AWS documents TOTP setup with AssociateSoftwareToken and VerifySoftwareToken. When MFA is required, users without an enrolled factor must complete the MFA setup flow. The PoC must test the exact imported-user first-login path, including MFA_SETUP behavior and the managed-login path.

The existing Portal TOTP verifier accepts the current 30-second TOTP period with one adjacent interval on either side. AWS documents acceptance of codes within 30 seconds before or after the attempt; verify this exact boundary in the non-production test.

For Admin token assurance, inspect and verify Cognito's access-token and ID-token AMR/ACR claims after a completed TOTP challenge. AWS documents AMR values including pwd, otp and mfa, and ACR authentication levels including TOTP level 4. The Worker must require the actual verified MFA evidence; the presence of a configured TOTP factor alone is not proof that the current authentication completed TOTP.

Official references:
- https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-settings-mfa.html
- https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-settings-mfa-totp.html
- https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-step-up-authentication.html

## 6. OIDC and Cloudflare integration proof

The non-production Cognito app clients must use Authorization Code + PKCE for Browser and Android clients.

The Cloudflare Worker gateway must validate:
- Signature against the correct pool's JWKS.
- Exact issuer and audience/client binding.
- Token use and allowed algorithm.
- Expiration, issued-at and nonce where applicable.
- Authentication time.
- AMR/ACR claims for Admin TOTP enforcement.
- Portal/Admin cross-pool rejection.
- Unknown subject, duplicate mapping, revoked binding and JWKS outage fail-closed behavior.

D1 continues to store opaque issuer/subject-to-account bindings and business data only. Cognito owns identity credentials and authentication factors. Do not copy password hashes, TOTP secrets, raw access/refresh tokens or raw authentication capabilities into D1.

The current provider-neutral boundary helper remains the internal contract. This PoC must add a Cognito-specific issuer and claim projection without making the business Worker Cognito-specific.

## 7. Execution sequence and acceptance gates

| Step | Work | Acceptance evidence |
|---|---|---|
| 1 | Confirm AWS account, billing profile and selected region | Account owner confirms access; no card data shared |
| 2 | Create two non-production User Pools | Portal/Admin pools are separate; SCRYPT import option is present |
| 3 | Configure email sign-in and verification | Downloaded CSV header and required-attribute policy recorded |
| 4 | Run fixed synthetic Scrypt import | Import job succeeds; no production identity involved |
| 5 | Verify first login and SRP transition | Correct/wrong password, first sign-in and subsequent SRP evidence |
| 6 | Verify normalization and byte boundaries | 71/72/73-byte and Unicode matrix passes |
| 7 | Verify Portal optional TOTP | Enrollment, challenge, recovery and opt-out behavior |
| 8 | Verify Admin required TOTP | MFA_SETUP, successful TOTP, AMR/ACR and no factor bypass |
| 9 | Verify OIDC and Worker gateway | Issuer/audience/JWKS/nonce/factor and cross-pool rejection tests |
| 10 | Review costs, limits and operational recovery | Region pricing, MAU, API quotas, email delivery and restore plan recorded |

No step above grants production import or cutover authority.

## 8. Current local result and remaining blockers

Local synthetic-only implementation:
- Converts the current source Scrypt envelope to Cognito's documented N$r$p$hexSalt$hexHash format.
- Round-trips salt and derived-hash bytes.
- Builds a fixed synthetic record using a verified example.test email.
- Builds a synthetic CSV projection from a supplied pool-template header.
- Omits all TOTP material.
- Emits a redacted receipt only.

Not yet run:
- Node test suite on this branch.
- Cognito import job in a real non-production User Pool.
- Cognito acceptance of the exact 64-byte derived hash.
- First sign-in and SRP migration.
- Actual 71/72/73-byte password behavior in Cognito.
- Actual Cognito TOTP enrollment, Admin MFA_SETUP and AMR/ACR claims.
- OIDC Authorization Code + PKCE and Worker JWKS integration.
- AWS account billing, region, quotas and email deliverability.

No AWS-specific MCP connection is available in the current session, so no User Pool, IAM role, import job, domain, app client or AWS resource has been created. The live proof requires an authorized AWS console/CLI session in the user's AWS account. Do not send AWS access keys, secret keys, session tokens or password-bearing CSV contents into chat.

## 9. Decision status

- First non-production candidate: Amazon Cognito.
- Auth0: retained as the previously evidenced fallback; no existing Auth0 evidence is deleted.
- China-based identity clouds: excluded from future provider comparisons.
- Final identity provider selection: pending live Cognito PoC.
- C1: remains PARTIAL/BLOCKED until the provider-specific proof and remaining identity custody requirements pass.
- T2: remains BLOCKED.
- Production import, D1 data load, Worker deployment and cutover: NOT AUTHORIZED.

## 10. Official AWS references

- Password-hash import announcement (2026-07-15): https://aws.amazon.com/about-aws/whats-new/2026/07/amazon-cognito-password-hash-import/
- Import users from CSV and password hashes: https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-using-import-tool.html
- Add MFA to a User Pool: https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-settings-mfa.html
- TOTP software-token MFA: https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-settings-mfa-totp.html
- Authentication levels with ACR and AMR claims: https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-step-up-authentication.html
