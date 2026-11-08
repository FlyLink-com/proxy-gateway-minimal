# D1 T2-C1 Risk A Login Proof-Window Owner Decision Proposal v1

> **Status:** PROPOSED DEFAULTS FOR OWNER REVIEW. This document narrows the remaining C1-A04 decisions; it is not approval to persist production observations, change the BWH login path, create keys, or cut over.
> **Source anchor:** `feat/c1-risk-a-proof-window-contract-20261108@96c2b455b215b8eda01b6a562cdcaeaf942e7aaa`.
> **Production authority:** BWH remains the only production control-data writer. The existing legacy verifier remains authoritative until separately approved cutover.
> **Related contract:** `docs/D1_T2_C1_RISK_A_LOGIN_PROOF_WINDOW_CONTRACT_V1.md`.

## 1. Decision goal

Identify the >72 UTF-8-byte password cohort without deriving length from one-way Scrypt hashes and without collecting plaintext, exact lengths, password hashes, or additional PII.

The existing synthetic helper already limits the observation to exactly four fields:

- `accountRef`
- `bucket` (`le_72` or `gt_72`)
- `edgeWhitespace`
- `observedAtMs`

An observation may be produced only after the existing BWH legacy password verifier succeeds. Failed login attempts create no record.

## 2. Recommended default decisions

These defaults are intentionally conservative and minimize new infrastructure.

| Decision | Recommended default | Reason |
|---|---|---|
| Proof-window duration | 30 calendar days from a separately approved enablement timestamp; close earlier only after cohort reconciliation is complete | Bounded collection period; no indefinite observation |
| Persistence | If persistence is approved, use one dedicated minimal record in the existing BWH authoritative control store; do not write to D1, KV, R2, analytics, logs, or the business Worker | Keeps the observation with the current authentication authority and avoids premature D1 writes |
| Stored fields | Exactly the four fields in the synthetic contract; no additional status, email, IP, exact byte count, hash, password, or session field | Data minimization |
| Encryption | Require transport encryption and verified at-rest encryption for the BWH store. If either cannot be evidenced, do not persist; use the unclassified/reset-safe path instead. Do not invent or provision a new application key in this phase | Avoids an unapproved key-custody dependency |
| Access | Writer: existing legacy authentication service only. Reader: narrowly scoped migration-cohort process, read-only. No general Admin/support browsing. Record access must be auditable | Least privilege |
| Retention | Stop collecting at day 30. Delete each record once its account disposition is confirmed. Purge all remaining records no later than 7 days after the proof window closes (hard maximum 37 days from start) | Prevents the temporary cohort marker becoming a permanent identity dataset |
| Notification | For `gt_72`, send one targeted notice through the existing verified-email channel after successful login; send at most one reminder during the window | Reuses the existing channel and avoids repeated notifications |
| Reset flow | Reuse the existing approved password-reset flow, including its current one-time token, expiry, and rate limits. Do not introduce a second reset mechanism | Avoids inconsistent credential lifecycle rules |
| Unclassified accounts | Never infer from Scrypt. Treat no observation as unclassified and require reset/assisted recovery before that account is imported | Fail-safe handling |
| Incomplete reset at cutover | Do not import the incompatible credential or silently truncate it. Keep the account on the legacy authority until reset is completed; do not claim the identity cutover is complete for that account | Preserves access and password semantics |

### Persistence fallback

If the owner does not approve persistence, the safe fallback is simple: no observation is stored; every account without an already-approved non-secret length marker remains unclassified and must complete the reset-safe path before import. This may increase reset volume, but it does not require collecting more data or weakening password verification.

## 3. Required control details

### 3.1 Write and read behavior

- The production hook, if later approved, must run only after successful legacy verification.
- Calculate UTF-8 byte length transiently from the exact trim-only normalized value already verified by the current BWH password path.
- Do not log the submitted value, the exact byte count, or a derived credential fingerprint.
- A repeated successful login may update the observation timestamp only if the owner chooses a last-observed model; otherwise use first-observation-wins. Recommended: first-observation-wins to minimize writes and preserve the first evidence timestamp.
- A record must be rejected if it contains any field outside the four-field contract.

### 3.2 Account disposition

- `le_72`: eligible for the separately validated Scrypt import path; this bucket is not itself import approval.
- `gt_72`: require a completed password reset before importing the credential.
- No record: unclassified; never assume `le_72`.
- Reset completion must be verified by the identity service before the account enters the compatible import cohort.

### 3.3 Deletion evidence

- Deletion must be performed by the same narrowly scoped service that owns the proof-window records.
- Record only a non-sensitive deletion count, time, and run reference in the operational evidence; do not export account references or record contents.
- The deletion run must be idempotent and report remaining-row count as zero.
- No evidence artifact may contain the four-field records themselves.

## 4. Owner decisions to record

To close C1-A04, the project owner only needs to accept or amend these six grouped decisions:

1. **Window:** 30 days, one-time, no automatic extension.
2. **Storage:** minimal four-field record in the existing BWH control store, conditional on verified encryption and least-privilege access; otherwise no persistence.
3. **Retention:** delete per account on final disposition; purge all remaining records within 7 days after window close.
4. **Notification/reset:** one immediate targeted notice plus at most one reminder; reuse the existing reset flow and its current expiry/rate limits.
5. **Cutover:** no Scrypt-hash inference, no truncation, no incompatible credential import; unresolved accounts remain on the legacy authority until reset.
6. **Accountability:** designate functional Identity/Privacy owner and Security approver in the project decision record. No external reviewer search is implied.

## 5. Implementation and acceptance sequence after decision

The work can remain staged and low-risk:

1. Keep the current pure helper and its 12/12 synthetic tests unchanged.
2. Add only a synthetic persistence-adapter contract and purge/idempotency tests; do not connect it to BWH.
3. Review the storage/encryption/access assumptions against the actual BWH control-store implementation without reading customer rows.
4. Implement a production hook only after the grouped owner decision and a separate explicit production authorization.
5. Verify the reset cohort and cutover behavior using synthetic accounts before any real identity operation.

## 6. Explicit non-authorization

This proposal does not authorize:

- Production login instrumentation or changes to the BWH verifier.
- BWH customer-row reads, exports, or production writes.
- Production persistence of proof-window observations.
- New key generation, secret bindings, Auth0 tenant creation, or user import.
- D1 writes, Worker/DO deployment, dual-write, cutover, or writer-authority change.

**Current gate:** C1-A04 remains OPEN pending owner decision. C1/C2 remain OPEN; T2 remains BLOCKED. This is a decision proposal, not a new technical blocker.
