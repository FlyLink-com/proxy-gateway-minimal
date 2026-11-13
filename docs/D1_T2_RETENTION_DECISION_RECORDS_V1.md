# D1 T2 Retention Decision Records v1 — Draft

```yaml
document_metadata:
  doc_type: evidence
  lifecycle: active
  authority_scope: d1_t2_retention_decision_records
  superseded_by: null
  last_verified_at: 2026-11-10
  production_authority: false
```


Status: DECISION REGISTER PREPARED; DOMAIN OWNER APPROVAL PENDING. No new numeric retention periods are approved by this document.

## 1. Rules

- Active expiry is not the same as record retention.
- No default indefinite retention.
- A row cannot be copied to D1 until its retention class, terminal behavior, purge owner and evidence are explicit.
- Financial/audit records are not deleted merely because an application status is terminal; applicable legal and reconciliation requirements must be established.
- Raw usage samples remain excluded from the initial D1 migration until a finite TTL and aggregation purpose are approved.
- A retention period is not inferred from a lease_until, expires_at, valid_until or payment-order TTL field.

## 2. Source evidence

| Data class | Current source evidence | What it means | What it does not mean |
|---|---|---|---|
| Leads email/message | Existing 90-day expiry/purge in scripts/platform-lead-retention.mjs and lead-retention-operations.mjs; backup prune safety margin is 2 hours | 90 days is the established Leads rule | It does not authorize retaining other PII classes for 90 days |
| Payment orders | payment-store.mjs defines ORDER_TTL_MS = 10 minutes | Active order validity window | Not a receipt/ledger retention period |
| Wallet-first deferred checkout quotes | wallet-first-deferred-checkout-quote-contract.mjs defines a 5-minute quote TTL | Active quote validity window | Not proof that expired quote rows are purged |
| Raw usage samples | Initial D1 scope excludes raw samples; no dedicated time-based purge job was established in this audit | Keep excluded | Do not infer indefinite retention is acceptable |
| Portal sessions / second-factor challenges | Source preserves expires_at, used_at and revoked_at state | Active validity and terminal state are represented | Post-terminal row retention/purge window remains open |
| Audit / financial ledger / payment receipts | Immutable business facts and audit events exist; no approved common TTL was found | Preserve integrity during approved retention | Do not guess 1, 3, 5 or 7 years without domain/legal decision |
| Idempotency receipts | Replay protection is scoped by actor/account + operation + key; provider event replay has its own scope | Retain at least the maximum retry, provider replay and reconciliation window | A short application TTL alone is insufficient |
| Portal access requests/events | Business expiry and lifecycle event fields exist | Request state can expire/complete | Event-history retention is not defined by request expiry |
| Deferred transitions / reservations / rebases | Lease and transition state has expiry/terminal markers | Worker ownership and transition validity are bounded | No row-retention or post-terminal purge duration is implied |
| Ads Consent evidence | Conditional feature/source fingerprint; consent value and epoch-ms semantics must be preserved | Feature-gated data needs its own consent evidence contract | No retention period is inferred |
| Payment action custody | Proposed DO ciphertext TTL is no later than provider expiresAt; purge on terminal state | Raw capability lifetime is bounded by action lifecycle | Redacted tombstone duration still needs payment-domain approval |
| Passkey credentials | Table and JSON remain DEFER | No D1 copy in T2 | No future retention policy is inferred |

## 3. Decision register

| ID | Data class | Proposed rule / required decision | Owner role required | Status |
|---|---|---|---|---|
| RET-01 | Leads email/message | Keep existing 90-day expiry and purge; external PII custody same or shorter; retain redacted purge receipt | Lead/data owner | ACCEPTED SOURCE RULE |
| RET-02 | Raw usage samples | Exclude from initial D1. Future copy requires finite TTL, aggregation/minimization purpose and workload justification | Data/product owner | OPEN |
| RET-03 | Financial ledger, payment receipts and commerce orders | Define jurisdiction-aware retention and immutable terminal behavior; no guessed duration | Finance + Legal + Payment owner | OPEN |
| RET-04 | Audit events | Define security/compliance retention, export access, purge proof and legal hold behavior | Security/compliance owner | OPEN |
| RET-05 | Six idempotency receipts + provider event dedupe | Retain for max(client retry, provider replay, reconciliation closeout); publish exact bound per domain and retain corresponding HMAC key IDs | Payment/commerce owners | OPEN |
| RET-06 | Portal sessions and second-factor challenges | Preserve active expires_at/used_at/revoked_at; define bounded post-terminal audit window and cleanup cadence | Identity/security owner | OPEN |
| RET-07 | Portal access requests/events | Separate business request expiry from event-history retention; define terminal purge and redacted evidence | Portal/product owner | OPEN |
| RET-08 | Deferred transitions and wallet-first quotes | Retain until terminal reconciliation closes plus approved idempotency/replay window; define purge/tombstone period | Wallet/commerce owner | OPEN |
| RET-09 | Ads Consent evidence | Define consent-history retention, revocation semantics and evidence access; preserve ad_personalization=0 and epoch-ms | Ads/privacy owner | OPEN |
| RET-10 | Account identity and registration-risk pseudonyms | Remove raw email/displayName; decide which keyed digests remain and their TTL; unkeyed SHA-256 is not treated as anonymous | Identity/privacy owner | OPEN |
| RET-11 | Payment action ciphertext/tombstones | Ciphertext no later than provider expiry and purge on terminal; tombstone duration equals approved replay/reconciliation window | Payment/security owner | OPEN |
| RET-12 | Passkey credentials | Remain deferred until product activation, exact public-key schema and retention policy are separately approved | Identity/security owner | DEFERRED |

## 4. Required owner decisions

The current project record does not identify named domain owners or provide approved periods for RET-02 through RET-12. Do not invent names or durations. The project owner must assign accountable people/roles and approve the periods before T2 can pass.

Until then:
- no raw usage sample copy;
- no account PII or unkeyed low-entropy digest copy;
- no payment raw URL/QR in D1;
- no automatic purge of financial/audit facts;
- no indefinite-retention default;
- no T2 PASS or production migration.

## 5. Source-grounded retention audit — 2026-11-08

The exact source observations and their distinction from record retention are consolidated in `docs/D1_T2_C5_SOURCE_RETENTION_AUDIT_V1.md`.

Key confirmations:
- Leads is still the only accepted numeric rule: 90 days, with a 2-hour backup-prune safety margin and an explicit dry-run/apply purge path.
- Payment order 10-minute TTL, deferred quote 5-minute TTL, reservation 24-hour grace, Portal session 30-minute/7-day validity, second-factor 5-minute challenge, TOTP 15-minute lock, and Wallet-first 10-minute claim lease are validity/lease windows only.
- The inspected payment store has no receipt/order purge path and currently stores/projects raw `next_action_url`; C4 custody must be resolved before D1 migration.
- The inspected control-store source exposes Leads purge but no dedicated persistent Portal session/challenge purge method; in-memory enrollment/conversion pruning does not prove persistent-row deletion.
- Wallet-first delivered-row digest retention is not implied by its claim lease.

No new numeric duration is approved. RET-02–RET-12 remain OPEN/DEFERRED as recorded; this source audit narrows the evidence but does not substitute for domain-owner decisions.
