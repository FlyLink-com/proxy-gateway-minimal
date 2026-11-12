# D1 T2 C1/C2 Acceptance Preparation — 2026-11-08

> **Status:** Draft execution plan. C1 and C2 remain OPEN; T2 remains BLOCKED.
> **Working branch:** `fix/t2-c1-c2-t1-reenroll-only-20261108`
> **Source-review anchor:** PR #843, T1 follow-up branch HEAD `2b95496c95238df2b7dae24f903d91d32a266f4f` at the time this anchor was written (a 2026-11-08 historical snapshot taken after tested source HEAD `c6a70b3f`; the PR head later advanced through documentation-only commits to `4be249a3` before this head-label correction commit, so `2b95496c` is a historical snapshot, not the current PR head; review pending at the time of writing; PR #842 approval remains bound only to `bc3f8c9a`). The only changes after tested source HEAD `c6a70b3f` are documentation/evidence updates; all nine source/test Git Blob SHAs were re-read and match the tested inventory.
> **Branch audit:** PR #843 is OPEN / DRAFT against `fix/t2-c1-c2-source-hardening-20261108` at `bc3f8c9a`. Keep this as a review follow-up, not a Master merge candidate.
> **Current production authority:** BWH remains the only production control-data writer.
> **Scope:** Repository-only source/doc alignment and synthetic/local acceptance preparation. No production, tenant, real-key, deployment or migration action is authorized here.

## 1. Current evidence baseline

### Source-slice review

- PR #842 remains OPEN / DRAFT / unmerged.
- The bounded C1/C2 source review is APPROVED by GitHub account `gccltdco-cmd`, Review ID `5817529933`, bound to exact HEAD `bc3f8c9a713de05715f42f733b8fa72ba53d4477`.
- The reviewer reported four focused repository test files at Node v22.23.1: **48/48 PASS**.
- The full-suite comparison reported zero new failure names against baseline `bf200c47`; the 156 baseline failure names remained, and a second run had one timer-flake name isolated at 5/5 on both heads.
- This is bounded source-slice and comparative evidence, not an all-green suite, hosted CI PASS, formal C1/C2 acceptance or full T2 approval.
- PR #842 has no Hosted CI run. Do not describe local tests as CI.
- At exact T1 branch HEAD `2b95496c95238df2b7dae24f903d91d32a266f4f`, the five repository test files passed **62/62 twice** under Node v22.23.1. All nine source/test Git Blob SHAs match the previously tested `c6a70b3f` inventory; the intervening changes were documentation only. Nine source/test files passed `node --check`. Latest exact-head logs: `6562575453bf4fc9de3dcaad7b3c7fa01aab5045abc82d5e4aa6a5aaad9ece6d` and `ee4089f69438ee05d8a0324278a76016ca7b5d5ae3b74f4c04a4c59a062f1041`.
- This is a bounded source-slice run, not the full repository `npm test`, not hosted CI, and not formal C1/C2 acceptance. PR #843 remains OPEN / DRAFT pending exact-head review.

### C1 local provider rehearsal

The local Auth0 validator package is now present in separate Draft PR #844 at HEAD `9dac357b0cd25bb676ce9a278bc2a882509e8309`, based on this T1 branch. It was independently rerun in the isolated Node v22.23.1 environment with Python pyca/bcrypt 5.0.0: **37/37 PASS twice** (10 import, 9 attestation, 8 tenant isolation, 10 S0–S9 end-to-end); all validator .mjs files passed `node --check`. It uses only a local mock Auth0 tenant and synthetic identities; it does not prove real Auth0 API/JWKS/MFA behavior or authorize tenant creation.

## 2. Owner decisions now treated as authoritative

1. **Identity provider:** Auth0 Essentials + Bulk User Import is selected as the target direction. Selection does not authorize tenant creation.
2. **Passwords above 72 UTF-8 bytes:** targeted, user-notified reset before import/first Auth0 login; never truncate or silently change passwords.
3. **Portal/Admin isolation:** separate Auth0 tenants and distinct issuer, audience, clients, factors and administrative boundaries.
4. **TOTP — T1:** Auth0-managed MFA owns target factors. Portal enrollment is optional; Admin enrollment is mandatory. At cutover, all legacy BWH TOTP values (`enc:`, `v2:` and legacy raw Base32) are invalidated. They are not imported, decrypted, transferred or re-encrypted. Users re-enroll.
5. **Production authority:** BWH remains the only production writer until a separately approved cutover.

T1 supersedes earlier proposals for synthetic legacy-secret import or one-time v2 decrypt/re-encryption. The generic first-party v3 TOTP primitive is not a selected target path and must not be provisioned for this migration without a new owner decision.

## 3. Remaining C1 acceptance work

| ID | Required proof | Current status |
|---|---|---|
| C1-A01 | Exact Node Scrypt envelope import vector, byte-preserving salt/hash encoding | OPEN |
| C1-A02 | Preserve current `String(password).trim()` behavior across Browser, Android and identity service | OPEN |
| C1-A03 | Prove 73+ UTF-8-byte passwords are rejected before first Auth0 bcrypt rehash; never infer affected cohort from Scrypt hashes | OPEN |
| C1-A04 | Login proof window Risk A design, privacy review and synthetic tests | OPEN |
| C1-A05 | Separate Portal/Admin tenant topology and negative cross-tenant tests | OPEN |
| C1-A06 | Auth0 MFA new enrollment/verification, ±1 interval, lockout, recovery, revocation and outage proof under T1 | OPEN |
| C1-A07 | Email verification single-use, expiry, retries and rate-limit compatibility | OPEN |
| C1-A08 | Real OIDC/JWKS signature-verifying gateway and private Worker service-binding integration | OPEN |
| C1-A09 | Session revocation, account deletion/unlink and provider-outage behavior | OPEN |
| C1-A10 | Admin directory search/display authorization and audit boundary | OPEN |
| C1-A11 | Registration dedupe, trial/welcome-Coins atomicity and keyed Coins-canary semantics | OPEN |
| C1-A12 | Privacy-safe account label and named Identity/Privacy/Security ownership | OPEN |

### Risk A — login proof window contract to prepare

The existing legacy verifier is the only authority during the proof window. For a successful legacy-authenticated login:

- Measure UTF-8 byte length transiently from the exact normalized in-memory password value already passed to the legacy verifier. Preserve the existing trim-only normalization; do not add lowercasing, internal-space folding or Unicode normalization.
- Record only the opaque account reference, a coarse bucket (`le_72` or `gt_72`), an edge-whitespace boolean and a timestamp.
- Never record the password, exact byte length, password hash, salt, bearer token or request body.
- A `gt_72` account enters the approved, user-notified reset path before any Auth0 import or first provider login.
- An unclassified account stays on the legacy authority or enters a separately approved reset cohort. Never guess from a one-way hash.

Still requiring owner approval before any production implementation: proof-window duration, storage boundary, encryption/access policy, retention and purge time, notification copy/channel, reset expiry/retry behavior, and the exact cutover treatment of accounts that never complete the proof window. This document does not authorize production login-path changes.

## 4. Remaining C2 acceptance work

| ID | Required proof or decision | Current status |
|---|---|---|
| C2-A01 | Choose per-Worker secret bindings vs Secrets Store; document least-privilege consumers and environment separation | OPEN |
| C2-A02 | Name primary/backup custodians and Security approver; define access and revocation | OPEN |
| C2-A03 | Approve independent encrypted escrow, dual-control recovery and incident revocation; prove restore with synthetic keys | OPEN |
| C2-A04 | Inventory Wallet-first `idempotency_key_hash` and `session_binding_hash` callers, replay scopes and retention; choose explicit compatibility or retirement | OPEN |
| C2-A05 | Target TOTP ownership | **APPROVED by T1:** Auth0-managed MFA; no legacy secret transfer and no first-party target TOTP key provisioning |
| C2-A06 | Define per-family replay/retention windows, key rotation overlap, retirement and restore proof | OPEN |
| C2-A07 | Run the separate 14-case PII security-vector test file under Node v22.23.1; attach exact command, output and file hash | **PASS — 14/14 at c6a70b3f; formal C2 remains OPEN** |

The C2 design recommendation remains: prefer per-Worker secret bindings when a key family has one Worker consumer; use Secrets Store only where cross-Worker sharing is genuinely required. Secrets Store is not a non-exportable HSM/KMS. Keep any approved encrypted escrow outside the repository and Notion. No real keys are generated or provisioned in this phase.

## 5. Execution sequence

1. **T1 source correction:** complete. The duplicate `decodeCanonicalBase64Url` declaration was removed; strict TOTP classification remains re-enrollment-only and malformed values quarantine.
2. **Fixed-environment verification:** complete for exact source HEAD `c6a70b3f`: five files 62/62 PASS twice, including the independent 14-case PII suite; nine files pass `node --check`. See the pinned regression report. Do not infer full repository `npm test` or CI success.
3. **Risk A preparation:** finish the proof-window specification and synthetic tests only. Keep duration, storage, retention and notification decisions explicitly OPEN until approved.
4. **C1 provider proof:** only after a separate explicit authorization to create non-production Auth0 tenants. Use synthetic identities only; prove import, first-login rehash, 72-byte rejection, normalization, tenant isolation, email verification and T1 MFA lifecycle. No real account import.
5. **C2 custody proof:** complete owner decisions and synthetic-key backup/restore/revocation drills. Do not create real production keys or Cloudflare bindings.
6. **Exact-head review:** after tests and source/doc alignment, obtain review of the new exact HEAD. The PR #842 approval remains bound only to `bc3f8c9a`; it does not transfer to this branch.
7. **Formal package decision:** keep C1/C2 OPEN until all owner decisions and applicable proofs are accepted. T2 remains BLOCKED until C1–C6 and the full T2 exit criteria are satisfied.

## 6. Branch and integration boundary

- PR #842 is a bounded source-review vehicle based on `review/t2-c1-c2-baseline-bf200c47`; its exact approved source HEAD must remain unchanged.
- The documentation synchronization branch `docs/t2-c1-c2-review-evidence-sync-20261108` is 160 commits ahead of current Master. It is a Draft workstream, not a narrow merge candidate.
- PR #843 is the exact T1 follow-up review vehicle (OPEN / DRAFT; base `fix/t2-c1-c2-source-hardening-20261108` at `bc3f8c9a`; head `c6a70b3f` at the time of this evidence — a historical snapshot; the PR head later advanced through documentation-only commits to `4be249a3` before this head-label correction commit). PR #844 is a separate Draft for the synthetic Auth0 validator package. Do not create a PR to Master, merge, force-push PR #842, or treat the stacked Draft history as a Master merge candidate.
- Any later integration PR must be rebuilt from an explicitly reviewed target baseline with only the required, dependency-complete changes. No such PR is opened by this plan.

## 7. Non-negotiable no-go boundaries

- No BWH connection, production database inventory, customer-row read/export or production credential access.
- No Auth0 tenant creation, provider API credential creation or real identity import without separate explicit authorization.
- No real HMAC/AES key creation, Cloudflare Secrets Store or Worker secret binding.
- No remote D1 mutation, Worker/DO deployment, DNS/route/schedule change or traffic change.
- No production dual-write, shadow-write, migration or writer-authority switch.
- No CI is triggered by this plan; no PR Ready transition or merge is implied.
- Do not schedule external reviewer sourcing. The existing GitHub account-level approval is source-slice evidence only; it does not by itself prove natural-person independence or close full T2-C6.

**Current decision:** C1 and C2 are in source/doc alignment and acceptance preparation. C1/C2 formal acceptance is OPEN; T2 is BLOCKED; T3 and G6 remain not authorized. BWH remains the production control-data writer.
