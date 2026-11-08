# D1 T2 C1/C2 Remaining Owner Decisions Register

> **Status:** Decision register — owner action required. C1/C2 source-slice review is APPROVED; neither formal package is closed.
> **Review anchor:** `bc3f8c9a713de05715f42f733b8fa72ba53d4477`
> **Review:** PR #842 / Review ID `5817529933` / `gccltdco-cmd` / APPROVED.
> **Production authority:** BWH remains the only production writer.
> **Boundary:** This register records choices and evidence still required. It does not authorize tenant creation, real key creation, Cloudflare resource changes, BWH access, D1 mutation, deployment, migration, or production cutover.

## 1. C1 — identity and authentication custody

| ID | Owner decision | Current recommendation / options | Required proof before closure | Status |
|---|---|---|---|---|
| C1-D01 | Select identity provider | Auth0 Essentials + Bulk User Import is the preferred managed candidate if the targeted reset policy for passwords above 72 UTF-8 bytes is acceptable. Keycloak with a custom scrypt provider is the fidelity fallback if resets are unacceptable. | Decision recorded by project owner and Identity/Security owners; no provider tenant before approval. | PENDING |
| C1-D02 | Passwords above 72 UTF-8 bytes | Never truncate. Either approve targeted, user-notified reset for affected accounts or choose a provider/path that preserves the exact current Node scrypt behavior. Affected production-user count is unknown because no production identity rows were read. | Synthetic proof for selected path; explicit user-impact and recovery policy. | PENDING |
| C1-D03 | Portal/Admin isolation | Prefer separate Auth0 tenants or separate Keycloak realms/deployments, distinct issuer references, audiences, factors and admin policy. | Negative tests proving cross-tenant/realm identity and factor cannot be reused. | PENDING |
| C1-D04 | Existing TOTP migration | First prove synthetic provider import. If import is unsupported or fails compatibility, require explicit re-enrollment rather than unsafe conversion. Legacy v2 requires the exact authorized old key and re-encryption; legacy `enc:`/unprefixed Base32 is raw secret material and must be re-enrolled or quarantined, not treated as ciphertext. | Account-ownership evidence, provider import or re-enrollment decision, lockout/recovery/revocation tests. | PENDING |
| C1-D05 | Email verification | Preserve current single-use code, expiry, attempt and rate-limit semantics unless a deliberate product change is approved. | Synthetic provider-flow tests for expiry, retries, duplicate registration and rate limits. | PENDING |
| C1-D06 | Visible account label | Use masked email or user-managed display name through an authorized identity-profile path; do not send raw identity values through the business Worker or persist them in D1. | Data-flow and authorization proof; privacy owner approval. | PENDING |
| C1-D07 | Coins canary eligibility | Preferred: retain equality semantics through the C2 domain-separated keyed email pseudonym. Alternative: a provider eligibility claim with an approved trust contract. | C2 PII key custody and compatibility tests; no raw email or unkeyed SHA-256 fallback. | PENDING |
| C1-D08 | Identity lifecycle ownership | Name accountable Identity/Privacy and Security owner roles for enrollment, lockout, recovery, revocation, deletion, retention and provider outage. | Named owner approvals and runbooks. | PENDING |

## 2. C2 — key custody, compatibility and recovery

| ID | Owner decision | Current recommendation / options | Required proof before closure | Status |
|---|---|---|---|---|
| C2-D01 | Secret storage boundary | Prefer per-Worker secret bindings when one Worker consumes a key family. Use Cloudflare Secrets Store only where cross-Worker sharing is genuinely required; it is a distribution/storage service, not a non-exportable HSM/KMS. | Security approval, least-privilege consumer map, account/environment separation and rotation design. | PENDING |
| C2-D02 | Key custodians | Name primary and backup key-custodian roles and an independent Security approver. | Explicit accountable roles, access/revocation and separation-of-duty record. | PENDING |
| C2-D03 | Independent escrow and recovery | Maintain encrypted backup outside the repository and Notion, with separately controlled recovery material and tested restore procedure. Do not create real keys in this phase. | Backup/escrow threat model, recovery drill using synthetic keys, dual-control and incident revocation procedure. | PENDING |
| C2-D04 | Wallet-first historical digests | Resolve both `idempotency_key_hash` and `session_binding_hash` separately. Inventory callers, uniqueness/replay windows and whether canonical inputs remain available; choose explicit compatibility-read, deterministic transformation or retirement. No indefinite unkeyed SHA-256 fallback. | Caller/retention inventory; duplicate/replay and crash-recovery synthetic tests; owner-approved migration semantics. | PENDING |
| C2-D05 | TOTP key ownership | Decide whether selected managed identity provider owns Portal/Admin factors (and the old key is used only for an approved one-time transfer), or first-party v3 AES-GCM remains; if first-party, Portal/Admin key families remain distinct. | C1 provider decision; key separation, AAD, rotation, recovery and account-ownership proof. | PENDING |
| C2-D06 | Rotation and retirement windows | Define payment retry, idempotency replay, registration lookup, data retention and backup windows before retiring any old HMAC/AES key. | Per-family retention register, row-count/reconciliation by key ID, restore test and owner approval. | PENDING |
| C2-D07 | PII vector test completion | Run the separate 14-case `d1-t2-security-vectors.test.mjs` as one suite under Node v22.23.1; do not infer its result from the four-file 48/48 run. | Exact command, Node version, complete output and file hash attached to the pinned evidence bundle. | OPEN |

## 3. Evidence already completed — not a substitute for owner decisions

- PR #842 is OPEN / DRAFT and unmerged.
- Review ID `5817529933` is `APPROVED`, submitted by `gccltdco-cmd`, and its GitHub REST `commit_id` exactly matches source HEAD `bc3f8c9a713de05715f42f733b8fa72ba53d4477`.
- Reviewer executed four related repository test files under Node v22.23.1 at that exact HEAD: **48/48 PASS**.
- Full repository comparative test run: baseline `bf200c47` had 7,084 tests / 156 failures / 6 skips; candidate `bc3f8c9a` had 7,112 tests / 156 failures / 6 skips on first run. All baseline failure names remained, all 28 added tests passed, and new-failure difference was zero. A second candidate run had one extra usage-ledger timer failure name, isolated 5/5 on both HEADs.
- The full suite is not green; this is a comparative no-new-regression result. PR #842 has no hosted CI run and no CI PASS is claimed.
- Account separation is evidenced at GitHub level. It does not, by itself, establish that the reviewer is a different natural person from the author.

## 4. Gate rule

C1 and C2 remain OPEN until all applicable owner decisions, real non-production provider/key-custody proofs, historical compatibility tests and recovery evidence are complete. Source-slice APPROVED is not formal package acceptance. No tenant, production key, BWH connection, remote D1 operation, deployment, merge or writer-authority switch is authorized by this register.
