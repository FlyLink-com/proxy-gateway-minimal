# M1 Contract v0.5 — Draft

```yaml
document_metadata:
  doc_type: governance
  lifecycle: draft
  authority_scope: m1_contract_v0_5
  supplements: m1_contract_v0_4
  source_anchor: master@c1d61e58d6eae9dd577216355632638fc95a46f8
  verified_at: 2026-11-14
  production_authority: false
  migration_authority: false
```

> **DRAFT FOR REVIEW.** This document-only revision is not formal T2 acceptance, retention approval, target DDL approval, data-load authorization, or production authorization.

## 1. Purpose, precedence and scope

This revision consolidates the current source-review evidence, remaining business decisions, accountability model, and formal gates for M1/T2 closeout.

This revision supplements v0.4; it does not replace it. v0.4 remains effective for its approved items (G-01, G-02, G-04, G-05, G-06, G-07, G-09, G-10B, G-11), D-01–D-10, C-01–C-10, and the B2 batch gates.

The current authorization covers this independent Draft branch and Draft PR only. It does not authorize Ready, merge, CI, BWH or production access, customer-data access, real secret creation, remote D1 mutation, deployment, dual-write, migration, traffic split, DNS/route/schedule changes, or cutover.

A PR review marked APPROVED is source-review evidence bound to that exact HEAD. It is not domain-owner approval, business acceptance, or formal T2 PASS. No review, test result, approval, or artifact hash carries forward after its bound HEAD or source baseline changes.

## 2. Source baseline and four Draft work packages

- Repository: `FlyLink-com/proxy-gateway-minimal`
- Source anchor: `master@c1d61e58d6eae9dd577216355632638fc95a46f8`
- The abbreviated PR HEADs below are the reviewed values reported on 2026-11-14; re-fetch exact current HEAD and review records before any subsequent gate action.

| Work package | PR | Reviewed HEAD (short) | Source review | Remaining boundary |
|---|---:|---|---|---|
| G-10A deletion proof | #870 | `7fb76ace` | APPROVED | HTTP trigger, unfinished-job/re-registration policy, unfreeze/re-auth policy, C5-dependent acceptance |
| G-12 password specification R1 | #871 | `4ae2289d` | APPROVED | Named accountable owner and formal specification approval method; production format inventory remains separately gated |
| G-03 masked email display | #872 | `2f6d86ec` | APPROVED | D1 writer/storage integration and decision on raw Leads email projection; follow-up technical items OBS-5 and OBS-1 in progress |
| G-08 TOTP enrollment lifecycle proof | #873 | `bf7393e9` | APPROVED | P-4 decisions, P-5 inventory authorization, named lifecycle/security owners, C5-dependent acceptance |

These are four source-review completions, not four completed business gates. Each approval is valid only for its exact reviewed tree and authorizes no Ready transition, merge, production inventory, migration, or deployment.

## 3. Governance roles and accountability

| Role | Accountability | Assignment |
|---|---|---|
| Yi | M1 overall decision owner; approves contract direction and formal gate outcomes | Designated |
| Muse | Contract editor, evidence indexer, discrepancy tracker and review coordinator; not a substitute for accountable domain owners | Assistant workflow |
| Data / Usage owner | RET-02 purpose, minimization, aggregation and finite-retention decision | Named person not recorded |
| Finance / Legal / Payment owners | RET-03 jurisdictional financial and commerce retention | Named persons not recorded |
| Security / Compliance owner | RET-04 audit retention, legal hold, export and purge evidence | Named person not recorded |
| Payment / Commerce owners | RET-05 replay/idempotency bounds; RET-08 reconciliation; RET-11 payment tombstones | Named persons not recorded |
| Identity / Security owners | RET-06 sessions/challenges and credential lifecycle | Named persons not recorded |
| Portal / Product owner | RET-07 access-request and event-history retention | Named person not recorded |
| Ads / Privacy owner | RET-09 consent-history and revocation evidence | Named person not recorded |
| Identity / Privacy owner | RET-10 identity and registration-risk pseudonyms | Named person not recorded |
| Independent reviewer | Reviews exact final contract and gate evidence; must not be the author | To be assigned per review |

Role labels are not named approvals. Do not invent owner names. Where multiple functions are accountable, record each person's name, role, date, decision, and scope.

## 4. C5 retention framework — RET-02 through RET-11

### 4.1 Binding principles

1. Never infer record retention from active validity, expiry, lease, lock, or provider-token TTL.
2. No default indefinite retention.
3. No data class is copied into D1 until purpose, minimization, retention class, terminal behavior, purge owner, and deletion evidence are explicit.
4. Financial, ledger, receipt, and audit facts are not deleted merely because an application state is terminal. Jurisdictional, reconciliation, dispute, tax, accounting, and legal-hold requirements must be established by accountable owners.
5. The Leads 90-day rule applies only to Leads email/message data; it does not authorize 90 days for other data classes.
6. Until an owner decision is approved, the safe migration disposition is **exclude/defer from the D1 target**. This does not authorize deletion from the current authoritative system.
7. Each approved policy must define start event, duration, terminal behavior, legal-hold override, purge cadence, retries, evidence receipt, and recovery/restore behavior.

### 4.2 Existing source observations — not new approvals

| Observation | What it means | What it does not mean |
|---|---|---|
| Leads email/message: 90 days; backup-prune safety margin 2 hours | Existing accepted Leads rule | Not a rule for other PII/business records |
| Payment order TTL: 10 minutes | Active order validity | Not receipt, ledger, or order-row retention |
| Deferred checkout quote TTL: 5 minutes | Quote validity | Not row-purge approval |
| Reservation grace: 24 hours | Business grace window | Not record retention |
| Portal session: 30 minutes; remembered session: 7 days | Session validity | Not post-terminal row retention |
| Second-factor challenge: 5 minutes; TOTP lock: 15 minutes | Challenge and lock windows | Not audit-history retention |
| Wallet-first claim lease: 10 minutes | Worker claim/reclaim window | Not delivered-row or digest retention |
| Provider action expiry | Bounds raw action capability lifetime | Does not decide redacted tombstone duration |

### 4.3 RET decision register

| ID | Data class | Required owner decision | Interim disposition |
|---|---|---|---|
| RET-02 | Raw usage samples | Data/Product: purpose, aggregation/minimization, finite TTL and workload justification | Exclude raw samples from initial D1 |
| RET-03 | Financial ledger, payment receipts, commerce orders | Finance + Legal + Payment: jurisdiction-aware duration, immutable terminal behavior, disputes/reconciliation and legal hold | No guessed duration; preserve current authority; D1 copy deferred |
| RET-04 | Audit events | Security/Compliance: retention, export access, legal hold, purge proof | No guessed duration; preserve integrity |
| RET-05 | Idempotency receipts and provider-event dedupe | Payment/Commerce: maximum client retry, provider replay and reconciliation windows; exact bounds and retain corresponding HMAC key IDs | D1 copy deferred pending approved bounds |
| RET-06 | Portal sessions and second-factor challenges | Identity/Security: bounded post-terminal audit window, purge cadence and evidence | Preserve active lifecycle; no inferred post-terminal TTL |
| RET-07 | Portal access requests/events | Portal/Product: separate business expiry from event-history retention, terminal purge and redacted evidence | No inferred event-history TTL |
| RET-08 | Deferred transitions and wallet-first quotes | Wallet/Commerce: reconciliation closure, replay/idempotency window, purge/tombstone period | Lease/quote TTL is not retention approval |
| RET-09 | Ads Consent evidence | Ads/Privacy: consent-history duration, revocation semantics, access and evidence | Preserve consent semantics; no inferred duration |
| RET-10 | Account identity and registration-risk pseudonyms | Identity/Privacy: remove raw email/displayName; decide necessary keyed digests and TTL; assess low-entropy identifiers | No raw PII or unkeyed low-entropy digest migration |
| RET-11 | Payment action ciphertext/tombstones | Payment/Security: ciphertext bounded by provider expiry and terminal purge; tombstone duration tied to approved replay/reconciliation window | No raw URL/QR capability in D1; no guessed tombstone TTL |

RET-01 remains the existing ACCEPTED Leads source rule. RET-12 Passkey credentials remain DEFERRED and are not silently included in RET-02–RET-11 closure.

### 4.4 Required approval record per RET item

Each item remains OPEN until the repository records:
- named approver(s), role, date, and explicit decision;
- purpose and data-class scope;
- approved numeric duration or documented non-time-based legal/operational rule;
- clock start, terminal behavior, hold/exception rules, and purge cadence;
- synthetic positive, negative, retry, interruption, and restore tests;
- deletion/tombstone evidence format and artifact hashes.

## 5. Cross-gate dependencies

- **G-10A:** service-layer deletion proof is not an HTTP-triggered user journey. Its irreversible deletion boundary must fail closed when C5-undecided tables contain residual rows. No production deletion is authorized.
- **G-12:** R1 tests lock specified password behavior but do not designate the accountable password-policy owner or approve a production inventory.
- **G-03:** masked presentation does not remove raw email from source storage, D1 writers, logs, or Leads projections. Storage custody and Leads display policy remain separate decisions.
- **G-08:** enrollment audit proof must never contain TOTP secrets, codes, or ciphertext. General identity-binding tests alone cannot declare G-08 complete; the proof scope is strictly the TOTP enrollment lifecycle. P-4 lifecycle decisions and P-5 production inventory are separate gates; this contract does not authorize P-5 access.

## 6. Formal T2 acceptance

T2 remains **BLOCKED** until C1–C6 have exact-HEAD evidence and accountable owner decisions:

- **C1:** identity/authentication authority, opaque binding, PII externalization, password compatibility, TOTP custody, deletion/revocation, and synthetic compatibility.
- **C2:** HMAC/AES key custody, key IDs, domain separation, rotation/re-encryption, legacy compatibility, and recovery evidence.
- **C3:** all JSON persistence writers, direct SQL paths, opaque refs, generation grammar, and historical compatibility.
- **C4:** payment action URL/QR external custody, expiry, revocation, terminal purge, tombstone, replay, and restore contract.
- **C5:** RET-02–RET-11 owner decisions and synthetic purge/tombstone evidence; RET-12 remains explicitly deferred.
- **C6:** independent review by a non-author, exact commit/artifact hashes, finding disposition, and formal Yi gate decision.

A source-review APPROVED, focused passing test, Draft PR, or prepared decision register cannot independently satisfy this gate.

## 7. Downstream gates and prohibited actions

T3 target D1 DDL proposal and G6 offline migration rehearsal remain gated on formal T2 acceptance. G5 remote staging is a later, separate gate.

This Draft authorizes no BWH/production database/customer-row/log access; production credential or real-key creation/read; remote D1 mutation or DDL apply; Worker/DO deployment or namespace/migration changes; production dual-write, shadow-write, migration, traffic split, DNS/route/schedule change, writer-authority change; PR Ready transition, merge, or production cutover.

BWH remains the sole production writer unless a later separate explicit authorization and formal gate decision changes that authority.

## 8. Change log from v0.4

- Positions v0.5 as a supplement to v0.4 (not a replacement); v0.4 remains effective for its approved items.
- Distinguishes source-review completion from business/formal acceptance for G-10A, G-12, G-03 and G-08.
- Adds role accountability while leaving unconfirmed domain-owner names blank.
- Consolidates RET-02–RET-11 into decision domains and records safe interim D1 exclusion/defer dispositions.
- Clarifies that existing TTLs are validity/lease windows, not retention approvals.
- Adds per-item approval evidence requirements and formal T2 acceptance criteria.
- Reaffirms T3/G6/G5 dependencies and the source-only/no-production boundary.

## 9. Review checklist

- [ ] Verify the source anchor is still the intended Master baseline.
- [ ] Re-fetch PR #870–#873 and bind each status to exact current HEAD and review record.
- [ ] Verify v0.4 clauses and accepted amendments are accurately represented.
- [ ] Confirm RET-01 and RET-12 treatment against the current authoritative decision register.
- [ ] Confirm no owner name, numeric retention duration, or production status was invented.
- [ ] Independent reviewer checks this complete document and records findings against the exact commit.
- [ ] Yi records formal approval or changes; no approval is implied by this Draft PR.

---
**Document status:** DRAFT / NOT OWNER-APPROVED / NOT T2 PASS / NO PRODUCTION AUTHORITY.
