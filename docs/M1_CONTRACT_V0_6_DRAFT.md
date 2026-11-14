# M1 Contract v0.6 — Draft

```yaml
document_metadata:
  doc_type: evidence
  lifecycle: active
  authority_scope: m1_contract_v0_6
  superseded_by: null
  last_verified_at: 2026-11-15
  production_authority: false
```

> **DRAFT FOR REVIEW.** This document-only revision is not formal T2 acceptance, retention approval, target DDL approval, data-load authorization, or production authorization.

## 1. Purpose, precedence and scope

This revision consolidates the four implementation packages that merged after v0.5 into the M1 contract as **source evidence**. It supplements v0.4 and v0.5; it does not replace either. v0.4 remains effective for its approved items (G-01, G-02, G-04, G-05, G-06, G-07, G-09, G-10B, G-11), D-01–D-10, C-01–C-10, and the B2 batch gates. v0.5 remains the record of Yi's confirmed business directions for G-03, G-08, G-10A and G-12.

**This revision states plainly, up front:**

- v0.6 is a **DRAFT** supplement. It does **NOT** declare M1 overall APPROVED.
- It does **NOT** close any C1–C6 item.
- It does **NOT** claim T2 PASS or READY.
- It does **NOT** authorize real key custody, production migration, or deployment.
- A merged implementation package is source evidence at an exact HEAD. It is not domain-owner approval, business acceptance, or formal T2 PASS. No review, test result, approval, or artifact hash carries forward after its bound HEAD or source baseline changes.

The current authorization covers this independent Draft branch and Draft PR only. It does not authorize Ready, merge, CI, BWH or production access, customer-data access, real secret creation, remote D1 mutation, deployment, dual-write, migration, traffic split, DNS/route/schedule changes, or cutover.

## 2. Source baseline and merged packages

- Repository: `FlyLink-com/proxy-gateway-minimal`
- Source anchor: `master@08ef75616de9674d28722ed9f2ff51470408c0fd` (PR #879 merged 2026-11-14T16:56:29Z)
- Production remains `pr799`. Every merge below is source-only.
- All anchors in §3 were verified by direct read at this exact HEAD in the v0.6 worktree; line numbers below are the `08ef7561` positions.

| Work package | PR | Merged HEAD (short) | Merge commit | Source review |
|---|---:|---|---|---|
| G-10A deletion proof | #870 | `5a7f9153` | `c497bf16` | APPROVED, bound `5a7f9153` |
| G-12 password specification R1 | #871 | `a3bbd4cb` | `7e440bb5` | APPROVED, bound `a3bbd4cb` |
| G-03 masked email display | #872 | `4d009290` | `2c23adfb` | APPROVED, bound `4d009290` |
| G-08 TOTP enrollment lifecycle proof | #873 | `0fefbed4` | `e64b1112` | APPROVED, bound `0fefbed4` |
| M1 contract v0.5 draft | #874 | `d37fa18e` | `ba6ca8bc` | APPROVED, bound `d37fa18e` |

### 2.1 What the T2-02 matrix still says

T2-02 (baseline `c1d61e58`, 2026-11-14) recorded 30 remaining items (C1 14, C2 5, C3 2, C4 2, C5 3, C6 4), 0 countable as done, T2 **BLOCKED**. The four packages merged after that baseline; they change the evidence for C1-08, C1-10, C1-12 and C1-13 as recorded in §3, but **no T2-02 item is re-scored by this document**. Re-scoring is a T2-03 closeout action, not a v0.6 claim.

Production behavior that the four packages did **not** change: registration still writes the raw email (`portal-registration.mjs`, `loginRef`/`displayRef` raw values); login still resolves through the full-table scan (`resolvePortalLoginAccount`); the TOTP protector is still shared between Portal and Admin with no key ID; the payment helper still has zero production call sites; the payment URL is still stored as plaintext `next_action_url TEXT`.

### 2.2 B9 re-verification at the new master — not all green

B9 re-verification at `08ef7561` is complete (report `b9-master-reverify-2026-11-15.md`, SHA-256 `8121c193152aeab8cda8b8393122e7cd915a90c500f622ad5585ed051f537a3a`): **7,575 items = 7,568 pass / 1 fail / 6 skip** (root suite 7,345: 7,338 pass / 1 fail / 6 skip; C2 policy 30/30; validator 53/53; Worker 147/147; `docs:authority:strict` 483 blocks; `git diff --check` clean). The new master is **not all green**: two full root-suite runs each failed a different timing-sensitive test, and each passed in isolation. Yi ruled 2026-11-15 01:56 CST that B9 is **conditionally pending closeout** — the re-verification is executed and its evidence is filed, but it does not meet the all-green acceptance condition and does not close. A read-only investigation of the two unstable tests is in progress; it is not part of this document. v0.6 does not present B9 as all-green evidence, and B9 partial pass does not substitute for C1–C5 acceptance and does not start B10.

## 3. The four items: direction → merged implementation → residual

### 3.1 G-03 · Masked email as display identifier

**Confirmed direction (v0.5, Yi 2026-11-14).** Use a masked email as the user display identifier: default display like `li***@gmail.com`; no raw email in D1 display fields, session summaries, or ordinary admin lists; full email only through an authorized identity service with a business need; one unified masking algorithm; masked email is display-only, never an identifier, authentication basis, or dedup key. (Yi's correction E-01 to the crosscheck stands: v0.5 added the unified-algorithm and display-only requirements over v0.4.)

**Merged implementation (PR #872, head `4d009290`, verified at `08ef7561`).**

- Pure-function module `server/services/platform/email-masking.mjs`: `maskEmail` (local part first 2 chars + `***` + `@` + full domain; local part under 2 chars keeps all visible chars + `***`; sub-address `user+tag@` masks the pre-`+` part and drops `+tag`; non-ASCII lowercased first; overlong local part masked the same way, never errors); invalid input returns fallback `user_account` (`EMAIL_DISPLAY_FALLBACK`), never throws; `maskEmailOrKeep` and `isMaskedEmailDisplay` accompany it.
- Landing points, all verified: session summaries masked (`server/services/platform/user-portal-auth.mjs:355` in `publicBrowserSession`, `:935`); admin lists/search masked only, operator-typed raw email never echoed (`server/routes/admin-platform.mjs:122`, `:325`, `:337`); D1 projection gate tightened (`server/services/platform/control-json-contracts.mjs:118`: externalized set is now `displayName` + `displayEmailMasked`; `loginRef`/`displayRef` are no longer externalized).
- The public RFC 6238 demo TOTP secret literal was removed from all 9 baseline files (35 occurrences) as a follow-up in the same batch; full-tree grep count is 0.

**Residual / open.**

- Display-layer masking only. Storage is untouched (E-01): raw email is still stored in `platform_accounts.metadata_json` (`loginRef`/`displayRef`); registration still writes it; login still resolves on it internally. Masking does not remove raw email from source storage, logs, or Leads projections.
- OBS-2: `displayEmailMasked` has no writer yet — D1 wiring follow-up.
- OBS-3: the Leads list still returns raw lead emails — Yi to decide.
- OBS-N1 (deploy shape): a deploy shape with only `portalSupportRequests` and no `userPortalAuth` now gets 400 `validation_error` instead of anonymous 201 on support-request submissions — an explicitly required tightening; a separate Yi ruling is needed only if that shape must stay anonymously usable.
- Full-email authorized viewing: no new endpoint was built. Admin search keeps digest matching; full email is via an offline process. The authorized-viewing rule itself (who, on what basis) is still undecided — see §4.
- Identity/Privacy named owner still not designated.

### 3.2 G-08 · TOTP enrollment lifecycle proof

**Confirmed direction (v0.5, Yi 2026-11-14).** Automated testing plus independent security review, strictly for the **TOTP enrollment lifecycle** (v0.4 wording; Yi's correction E-01: general identity-binding tests can never declare G-08 complete; the TOTP enrollment flow's actual proof scope must be defined explicitly).

**Merged implementation (PR #873, head `0fefbed4`, verified at `08ef7561`).**

- Carrier: survey P-2 option A — reuse `platform_audit_events`, B2-4c contract pattern. Entity type `totp_enrollment`, contract branch in `server/services/platform/subscription-control-db.mjs:8542` (`totp_enrollment_started` `:8554`, `totp_enrollment_code_verified` `:8576`, `totp_enrollment_bound` `:8597`).
- Five-segment proof (survey P-1): started → code_verified → bound (credential row + `totpRef`, `accountMatches: true`, envelope format `v2`/`enc`/`unknown`) → consistency (`accountMatches` computed, not hardcoded) → independent review (review subagent procedure, no code).
- Write points, all verified: Portal `startTotpEnrollment` / `confirmTotpEnrollment` / `enrollTotpCredential` (`server/services/platform/user-portal-auth.mjs`, started event at `:516`) and Admin `startBootstrap` / `confirmTotpEnrollment` (`server/services/platform/admin-auth.mjs`, started event at `:486`). Audit-write failure is fail-closed on success paths (transaction rollback); failed-code events are best-effort evidence and never mask the original error.
- Metadata contains refs, times and result only — never secret, code, or ciphertext. The bound event uses `totpRef`, not `credentialRef`, because the audit contract rejects key names containing `credential`.
- Tests: `server/tests/totp-enrollment-proof.test.mjs`, 18 tests (verified count at this HEAD), covering normal / repeat / conflict / failure / retry per the survey P-3 matrix.

**Residual / open.**

- **G-08 overall is still BLOCKED.** Full acceptance depends on C5 (audit-event retention for the new event volume).
- P-4 four open behavior decisions (see §4): re-enrollment old-credential disposition; unlimited confirm failures; Admin still stores `enc:` plaintext; no Admin re-enrollment entry after binding.
- P-5 production inventory (read-only format distribution of `platform_portal_totp_credentials.encrypted_totp_secret`) — needs Yi's explicit authorization; not done.
- Named owners (enrollment lifecycle owner, independent security reviewer) pending Yi designation.
- B2-3-P frozen items untouched: Portal/Admin shared protector split waits for M3; key ID waits for M3; `mustRotate` gets no new semantics. Legacy TOTP `enc:` values are not force-rejected or migrated.

### 3.3 G-10A · Deletion proof, privacy audit credential, failure recovery

**Confirmed direction (v0.5, Yi 2026-11-14).** Deletion proof + privacy-safe audit credential + failure recovery: record request ID, authorization basis, scope, result, completion time; audit records must not re-save deleted raw PII/credential material; failure / partial / timeout / interrupt must have traceable status and safe retry; backup copies, legally retained data, and non-immediately-deletable boundaries explicit; proof must rest on actual data-state verification, API success alone insufficient. (Yi's correction E-02: G-10A depends on C5 — deletion flow and failure recovery may be researched, but legal retention exceptions cannot be finalized and the deletion mechanism cannot be declared fully accepted until RET-02～RET-11 are decided.)

**Merged implementation (PR #870, head `5a7f9153`, verified at `08ef7561`).**

- Service module `server/services/platform/portal-identity-deletion.mjs`: `PortalIdentityDeletionService`; steps 0–8 (`persist_request`, `freeze_account`, `revoke_sessions`, `revoke_credentials`, `d1_placeholder`, `delete_personal_data`, `write_tombstone`, `verify_readback`, `issue_proof`); step 5 is the irreversible boundary; verification modes `physical` / `logical` (mutually exclusive: physical ⇒ verify record absent, logical ⇒ verify status `revoked` + retention-compliant); authorization bases `owner_request` / `compliance_order`; audit metadata = refs / scope / result / time only; recovery = task resume / retry / compensation only, never restoring deleted data; tombstone `retention_policy_ref = 'pending-c5-decision'`; D1 step recorded `skipped`.
- DB layer in `server/services/platform/subscription-control-db.mjs`: tables `platform_identity_deletion_jobs` (`:1819`), `platform_identity_deletion_proofs` (`:1840`), `platform_identity_deletion_tombstones` (`:1855`), no FK on account refs; `identity_deletion` audit contract branch at `:8401`.
- Step 5 checks 10 C5-undecided blocking tables first and fails with zero writes if any has residual rows.
- Follow-up commit `5a7f9153`: `verifyTotpAndCreateSession` and `completeSecondFactor` re-read account status before any credential work and fail closed (`invalid_login`) when `status !== 'active'` (verified at `user-portal-auth.mjs:746–752`).
- Tests: `server/tests/portal-identity-deletion.test.mjs`, 29 tests (verified count at this HEAD).

**Residual / open.**

- Service layer only — **no HTTP route / trigger endpoint wired**. No user-facing deletion journey exists.
- Whether an unfinished deletion task blocks re-registration of the same identifier is undecided.
- Unfreeze decision for abandoned tasks: `abandonDeletion` exists (only `failed` jobs, basis + actorRef + audit event, terminal); abandoning does **not** auto-unfreeze — unfreezing is a separate decision.
- Physical-vs-logical is a required per-task parameter with no default; tombstone retention rules, legal retention exceptions, and backup handling are all `pending-c5-decision`.
- **Full acceptance still depends on C5** (RET-02～RET-11 formal periods). Privacy/Compliance named owner not designated.
- C1-10 (T2-02): the mechanism now exists where the matrix recorded "deletion proof still no form"; the 503 sub-item was already closed in B2-4d. The item itself is not re-scored here.

### 3.4 G-12 · R1 unified password specification

**Confirmed direction (v0.5, Yi 2026-11-14).** Keep existing password compatibility and unify input / storage / validation spec: no plaintext storage, no password in logs/audit; Unicode, length limits, encoding, scrypt params, and validation rules to be specified; security-reviewed migration for old formats; controlled reset for incompatible historical formats, no silent security downgrade.

**Merged implementation (PR #871, head `a3bbd4cb`, verified at `08ef7561`).**

- Repo diff is one test file only: `server/tests/password-spec.test.mjs`, 13 tests (verified count at this HEAD), covering R1-01～R1-14 of the specification draft `b2-5-password-spec-DRAFT-2026-11-14.md` (219 lines, SHA-256 `cbe959bad320cd15b0d5e2ae61c83655bf70db96df8184d0940184a987970cd5`; status DRAFT, not Yi-approved).
- Locked technical decisions: scrypt params stay (`N=32768, r=8, p=1, keyLength=64, maxmem=64MB`); salt 16 bytes; envelope `scrypt$v=1$…`, 7 segments; parse fail-closed; Unicode = trim-only; 72-byte = survey P-2 option A (local path status quo; Auth0 first login per rehearsal classification — ≤72 allow rehash, >72 targeted reset, never truncate); change/reset = survey P-3 option C (do NOT build now; the spec defines the unified rules they must follow when built); `mustRotate` = no semantics, frozen until M3.
- Audit events: types + fields defined in the spec only (`portal_password_issued` / `portal_password_verified` / `portal_password_locked`; never password/hash). **Write calls are NOT implemented** — write volume must be decided with the C5 audit-retention policy.

**Residual / open.**

- P-5 production format inventory (read-only distribution of stored password hashes) — **not done**; needs Yi's explicit authorization (sensitive-data access).
- Audit-event writes pending C5 (RET-04).
- Android shared vectors not ported verbatim — open acceptance item.
- D-1 observation: the login page renders a `disabled` "忘记密码？" dead button (`admin/src/features/user-portal/user-portal-page.tsx:2785`) — must be wired or removed when reset is built.
- Spec approval method and named owner (Identity/Security) pending Yi designation. The spec document remains DRAFT.
- C1-12 (T2-02): the specification document and its tests now exist where the matrix recorded "R1 unified password specification document still does not exist". The item itself is not re-scored here.

## 4. Open decisions — what v0.6 does NOT decide

Nothing in this section is decided by this document. Do not read any of the following as approved, and do not invent a decision for any of them.

| # | Open decision | Status |
|---|---|---|
| OD-01 | D-08 / D-09 / D-10 field dispositions (D1 target v1 candidate fields; password/passkey credential tables DEFER; TOTP secret EXTERNALIZE) | Still PROPOSED in v0.4; field-disposition contract awaits the domain owner |
| OD-02 | Named owners: M1 contract owner, security reviewer, key custodian, independent reviewer (C6-01); RET-domain approvers (RET-02～RET-11) | Not designated; role labels in v0.5 §3 are not named approvals |
| OD-03 | G-12 spec approval method (who approves the R1 specification, and how) | Pending Yi designation; the spec is DRAFT |
| OD-04 | G-12 P-5 production format inventory | Needs Yi's explicit authorization; not done |
| OD-05 | G-08 P-4 four behavior decisions: (1) re-enrollment old-credential disposition — revoke or leave; (2) enrollment-confirm failures — count and lock or not; (3) Admin enrollment — switch to protector encryption or keep `enc:`; (4) Admin forced re-enrollment path after binding | Undecided; (1) and (3) are B2-3-P / M3 scope |
| OD-06 | G-08 P-5 production inventory (TOTP ciphertext format distribution) | Needs Yi's explicit authorization; not done |
| OD-07 | G-10A unfreeze decision for abandoned deletion tasks | Undecided; abandoning a task does not auto-unfreeze |
| OD-08 | G-10A full acceptance | Depends on C5: RET-02～RET-11 formal periods, tombstone retention rules, legal retention exceptions, backup handling |
| OD-09 | G-03 OBS-2: `displayEmailMasked` has no writer yet (D1 wiring follow-up) | Open |
| OD-10 | G-03 OBS-3: Leads list still returns raw lead emails | Yi to decide |
| OD-11 | G-03 OBS-N1 deploy-shape ruling: whether the "only `portalSupportRequests`, no `userPortalAuth`" shape must stay anonymously usable | Only needed if that shape must stay anonymous; the current 400 tightening stands |
| OD-12 | G-12 audit-event write calls (password issued / verified / locked) | Pending C5 (RET-04); types defined, writes not implemented |
| OD-13 | G-03 / G-08 / G-10A / G-12 named-owner designations (Identity/Privacy, enrollment lifecycle, Privacy/Compliance, Identity/Security) | Pending Yi designation |
| OD-14 | G-03 authorized full-email viewing rule (who may retrieve a full email, on what basis, with what audit) | Undecided; no new endpoint built |
| OD-15 | Whether an unfinished G-10A deletion task blocks re-registration of the same identifier | Undecided |
| OD-16 | G-10A physical-vs-logical default; tombstone retention rules; backup-copy disposal rules | Depend on C5; no default set |

Also unchanged and still open: C1-01 / C1-02 (registration and login PII externalization — G-01 / G-02 approved, implementation not done); C1-11 (#863 enablement gates, zero-hit grep evidence, needs call-chain verification per T2-02 errata E-01); C1-14 (#849 net-diff mapping, not done); C2-01～C2-05 (real key custody 0%; M3 scope); C3-01 / C3-02 (26-field writer closure, M4 scope); C4-01 / C4-02 (payment custody wiring, M5 scope); C5-01 (RET-02～RET-11 formal periods — interim dispositions exist, formal approval does not); C5-02 (RET-12 passkey, DEFERRED); C5-03 (G2-P4 legacy-archive conditional probe, deferred by Yi 2026-11-14); C6-01～C6-04 (independent acceptance, B10 scope, starts only after C1–C5 close).

Batch order is unchanged: Yi ruled 2026-11-15 01:40 CST to keep the T2-02 §3 order (C1 B2–B4 → C2 B5 → C3 B6 → C4 B7 → C5 B8 → B9 → B10). This document does not reorder it.

## 5. Changes vs v0.5

- Records the four merged packages (#870–#873) as source evidence with exact merged HEADs, merge commits, and implementation anchors verified at `08ef7561` — v0.5 listed them as Draft work packages with reviewed HEADs only.
- Adds the per-item residual lists that the merges leave behind (G-03 OBS-2/OBS-3/OBS-N1, G-08 P-4/P-5, G-10A trigger/unfreeze/C5 dependence, G-12 P-5/audit-write/Android-vector/D-1 button).
- Adds the B9 re-verification result at `08ef7561` (7,575 = 7,568 pass / 1 fail / 6 skip; not all green; conditionally pending closeout) and states explicitly that it is not all-green evidence.
- Adds the consolidated open-decisions register (§4, OD-01～OD-16), including items v0.5 left as per-item "待确认" notes.
- Adds the T2-02 baseline note (§2.1): no T2-02 item is re-scored by this document.
- Reaffirms the unchanged boundaries: v0.6 is a DRAFT supplement; M1 overall not APPROVED; no C1–C6 item closed; T2 still BLOCKED; no real key custody, production migration, or deployment authorized.

## 6. Review checklist

- [ ] Verify the source anchor is still the intended Master baseline (`08ef7561`).
- [ ] Re-fetch PR #870–#874 and bind each status to exact current HEAD and review record.
- [ ] Verify each §3 implementation anchor by direct read at the anchor HEAD (paths and line numbers given).
- [ ] Confirm no owner name, numeric retention duration, or production status was invented (§4 lists only open items).
- [ ] Confirm the B9 figures match `b9-master-reverify-2026-11-15.md` (SHA-256 `8121c193…`) and that B9 is not presented as all-green.
- [ ] Confirm the T2-02 item statuses are not re-scored anywhere in this document.
- [ ] Independent reviewer checks this complete document and records findings against the exact commit.
- [ ] Yi records formal approval or changes; no approval is implied by this Draft.

---
**Document status:** DRAFT / NOT OWNER-APPROVED / NOT T2 PASS / NO PRODUCTION AUTHORITY.
