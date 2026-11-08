# D1 T2 Migration Readiness Reassessment — 2026-11-08

> **Decision:** NOT READY — T2 remains BLOCKED. T3 target DDL and G6 offline migration rehearsal are not authorized to start.
> **Evidence anchor:** C1/C2 source HEAD `bc3f8c9a713de05715f42f733b8fa72ba53d4477`; PR #842 Review ID `5817529933` is APPROVED for the bounded C1/C2 source slice only.
> **Production authority:** BWH remains the only production control-data writer.
> **Scope:** Repository evidence and owner-provided local test records only. No production database, BWH host, customer row, production credential, real key, remote D1, Worker, DO, deployment or traffic was accessed.

## 1. Executive decision

The C1/C2 source-hardening slice has passed a bounded second source review. The review is precisely bound to `bc3f8c9a`; four related test files passed 48/48 under Node v22.23.1; full-suite comparative attribution found zero newly introduced failure names relative to `bf200c47`.

This is meaningful source-quality evidence. It is **not** a T2 PASS, not formal C1/C2 acceptance, not a target DDL approval, and not permission to load data.

The full repository suite is not all green: the baseline and candidate both retain 156 failure names, and the candidate's second full run had one additional usage-ledger timer failure name that passed 5/5 isolated runs on both heads. No hosted CI PASS exists for PR #842.

## 2. Current gate matrix

| Gate | State | Why it remains open |
|---|---|---|
| T2-C1 Identity/auth custody | OPEN | Auth0 Essentials + Bulk User Import selected and >72-byte targeted-reset/Portal-Admin isolation directions approved. Still missing exact Scrypt import and trim-normalization proof, safe over-limit cohort identification, 72-byte rejection-before-rehash proof, real OIDC/JWKS gateway/provider adapter, TOTP/email/lockout compatibility and isolated hosted proof. |
| T2-C2 HMAC/key custody | OPEN | No approved Cloudflare secret custody boundary, named custodians, independent escrow/restore; two Wallet-first historical SHA-256 fields unresolved; TOTP custody choice and key-retirement windows pending. |
| T2-C3 JSON/ref/generation | OPEN | 26-column inventory is reconciled, but only 7 writer families are recorded closed; 16 existing contracts are mapped, 2 Passkey fields DEFER and account metadata remains BLOCKED pending C1. Full writer-path independent review and historical compatibility evidence remain outstanding. |
| T2-C4 Payment capability custody | OPEN | DO SQLite is only a proposal; payment/security owners, key boundary, access control, expiry/purge/tombstone and outage/restore proof remain outstanding. |
| T2-C5 Retention/G2 residuals | OPEN | RET-02–RET-12 lack approved owner decisions; G2 limitations need G6 probes or explicit named risk acceptance. |
| T2-C6 Full independent review | OPEN | PR #842 approves only the C1/C2 source slice. The full review of C1–C6, the 820-field disposition, all 26 JSON writer paths, payment custody, retention and G2 residuals remains outstanding. Distinct GitHub account does not alone prove distinct natural-person independence. |

## 3. Why T3 and G6 cannot start

The current T2 exit criteria require all six work packages to have accepted evidence, all mandatory owner decisions, closed/explicitly excluded JSON writer paths, sensitive-data absence proof, consistent key/retention contracts, G2 residual disposition, a full-scope reviewer signature on the exact final commit, and T1 field-map revalidation.

Those conditions are not met.

Therefore:
- **T3 target DDL proposal:** do not start yet. The 820-field disposition map is structurally reviewed but is not target DDL approval.
- **G6 offline rehearsal:** do not start yet. It depends on a reviewed T3 DDL proposal and must use deterministic synthetic/local fixtures only.
- **Production migration / dual-write / shadow-write / traffic split:** not authorized.
- **Production writer-authority switch:** not authorized.

## 4. Required sequence before reconsidering migration readiness

1. **Record remaining C1 owner decisions:** TOTP import/re-enrollment; email verification; display identity; Coins canary; named Identity/Privacy/Security owners. Provider selection, targeted >72-byte reset policy and Portal/Admin isolation principle were approved on 2026-11-08.
2. **Prove the selected Auth0 path before any tenant creation:** exact Node Scrypt import vector and byte encoding; current `trim()` normalization; imported-user first-login rehash; rejection of 73+ UTF-8-byte passwords before bcrypt truncation; safe classification of over-limit accounts without plaintext; two-tenant Portal/Admin isolation plus non-production tenant allocation; email/TOTP/lockout/revocation; real OIDC/JWKS gateway and provider adapter. The password hash alone cannot identify over-limit users. If the Essentials login path cannot fail closed for 73+ byte passwords, stop and return with a concrete alternative; do not weaken the contract.
3. **Resolve C2 custody and compatibility:** per-Worker secret vs Secrets Store; named custodians; encrypted independent escrow/restore; Wallet-first `idempotency_key_hash` and `session_binding_hash`; TOTP key ownership; retention/replay windows.
4. **Complete remaining C2 tests:** run the separate 14-case PII vector file as one suite in Node v22.23.1 and attach exact output/hash.
5. **Complete C3:** verify all 26 JSON writers at persistence boundaries; resolve account metadata and historical conformance; retain Passkey as DEFER unless separately approved.
6. **Complete C4:** approve payment-action capability custody, owner, key boundary, expiry, purge, tombstone, outage and restore; prove with synthetic tests.
7. **Complete C5:** record named owners and approved retention rules for RET-02–RET-12; map each G2 residual to a G6 probe or explicit risk acceptance.
8. **Complete C6:** conduct full-scope review of C1–C6, the 820-field disposition, 26 writer paths, vectors and G2 residuals; bind the signed result to the exact final T2 commit and establish required reviewer independence.
9. **Only after formal T2 PASS:** begin T3 as a repository/local-only target DDL proposal. Independently review the exact DDL before G6 synthetic offline rehearsal.

## 5. Non-negotiable production boundary

Until a separate, explicit production cutover authorization is issued:
- BWH remains the only production writer.
- No BWH connection or production database inventory.
- No production customer-row reads or exports.
- No real production HMAC/AES key creation or provisioning.
- No remote D1 mutation, Worker/DO deployment, secret/binding/route/schedule/DNS changes.
- No production dual-write, shadow-write, migration, traffic split or write-authority switch.
- No merge or Ready transition is implied by the PR #842 approval.

## 6. Source review reference

- PR: https://github.com/FlyLink-com/proxy-gateway-minimal/pull/842
- Review ID: `5817529933`
- Reviewer account: `gccltdco-cmd`
- Review state: `APPROVED`
- Exact commit: `bc3f8c9a713de05715f42f733b8fa72ba53d4477`
- Review base: `bf200c474173d58d855fab66050a9c2b6b1ac4d4`
- PR remains OPEN / DRAFT / unmerged; no hosted CI PASS is claimed.


## 7. Owner decision update — 2026-11-08

Auth0 Essentials + Bulk User Import is now the owner-selected identity direction. The owner also approved a targeted, user-notified reset for passwords above 72 UTF-8 bytes and the Portal/Admin isolation principle.

This reduces the open decision count but does not change the migration-readiness result: **NOT READY — T2 remains BLOCKED**. No tenant was created, no real identity was imported, and no production credential or customer row was accessed.

Critical unresolved execution issue: the existing Scrypt hash does not reveal the original password byte length. The team must prove a privacy-preserving way to identify affected accounts (for example, transient byte counting during a legacy-authenticated login) and must not infer the affected cohort from hashes. Accounts not safely classified remain on the legacy authority or require a separately approved reset cohort.

Additional compatibility blockers include current `String(password).trim()` normalization, exact Scrypt import parameter/encoding proof, and provider-side rejection of over-limit input before bcrypt rehash. The Auth0 official 2026 Flexible Password Policy release notes must be reconciled with the older support article documenting the 72-byte bcrypt behavior; a non-production test of imported-user login is mandatory.

The three-tenant Essentials entitlement also needs a concrete allocation proving that two isolated production tenants and the required non-production validation can coexist.
