# D1 T2-C5 Source-grounded Retention Audit v1

```yaml
document_metadata:
  doc_type: evidence
  lifecycle: active
  authority_scope: d1_t2_c5_source_retention_audit
  superseded_by: null
  last_verified_at: 2026-11-10
  production_authority: false
```


> **Status:** SOURCE AUDIT ONLY. No retention duration is approved or changed by this document.
> **Source branch:** `feat/t2-c4-c5-payment-retention-contracts-20261108`, based on the current D1 T2 schema/G6 preparation branch.
> **Production boundary:** No production database rows, logs, or customer records were read.

## 1. Executive finding

The repository currently has one clearly evidenced numeric data-retention rule: Leads at 90 days, with a 2-hour backup-prune safety margin. The other numeric values found in source are active validity, lease, or lock windows—not record-retention approvals.

Do not copy the Leads 90-day rule to sessions, payments, ledger, audit, idempotency, usage, consent, or payment-action tombstones.

## 2. Source-grounded inventory

| Data class | Observed source contract | Source path | Retention interpretation |
|---|---|---|---|
| Leads email/message | `PLATFORM_LEAD_RETENTION_MS = 90 days`; backup prune safety margin = 2 hours; `runLeadPurge` supports dry-run and apply and deletes only rows with `expires_at <= now` | `server/services/platform/lead-retention-operations.mjs`; `scripts/platform-lead-retention.mjs` | **Only accepted numeric retention rule currently evidenced.** |
| Payment orders | `ORDER_TTL_MS = 10 minutes` | `server/services/platform/payment-store.mjs` | Active order validity only. Does not authorize deleting orders, receipts, ledger facts, or provider replay evidence. |
| Payment receipts/action URLs | `next_action_url` is inserted into `platform_payment_receipts`; `mapReceipt` and `mapOrder` project the raw URL; `ORDER_SELECT` reads it back. No receipt/order purge method was found in this store module. | `server/services/platform/payment-store.mjs` | C4 custody and C5 retention both remain open. Raw action capability must be externalized before D1 migration; receipt retention still needs Payment/Finance/Legal decision. |
| Deferred checkout quotes | `WALLET_FIRST_DEFERRED_CHECKOUT_QUOTE_TTL_MS = 300,000` (5 minutes); reservation grace = 86,400,000 (24 hours) | `server/services/platform/wallet-first-deferred-checkout-quote-contract.mjs` | Quote validity and reservation grace only. They are not row-purge periods. |
| Portal sessions | Default session expiry = 1,800 seconds; remembered browser session = 604,800 seconds; ordinary browser session = 1,800 seconds | `server/services/platform/user-portal-auth.mjs` | Session validity only. The auth service validates active/revoked/expired state; it does not establish post-terminal row retention. |
| Second-factor challenges | Challenge expiry = 300 seconds; TOTP lock = 900 seconds | `server/services/platform/user-portal-auth.mjs` | Challenge validity and rate-limit lock only. Not post-terminal retention. |
| In-memory enrollment/conversion state | Pending TOTP enrollment and browser-conversion maps are deleted/pruned on expiry; browser-conversion map is bounded by age and entry count | `server/services/platform/user-portal-auth.mjs` | In-memory lifecycle only; does not prove persistent challenge/session cleanup. |
| Persistent Portal sessions/challenges | The inspected control-store source exposes lifecycle updates and `purgeExpiredLeads`; no dedicated `purgeExpiredPortalSessions` or `purgeExpiredSecondFactorChallenges` method was found. | `server/services/platform/subscription-control-db.mjs` | Mark as **NOT FOUND IN INSPECTED REPOSITORY PATHS**, not proof that no external operator process exists. Needs a bounded purge design and test. |
| Wallet-first handoff | Claim lease = 600,000 ms (10 minutes); delivered rows retain the two digest fields; no terminal-row purge method was found in the inspected delivery service/schema. | `server/services/platform/wallet-first-current-resource-setup-delivery.mjs`; `server/services/platform/wallet-first-setup-delivery-handoffs-migrations.mjs` | Lease/reclaim behavior is not row retention. Covered by the C2 Wallet-first digest audit; RET-05/RET-08 remain open. |
| Raw usage samples | No dedicated finite-retention purge job was established in this audit; initial D1 scope excludes raw samples. | T2 source/target inventory | Keep excluded until minimization, aggregation, purpose, and finite TTL are approved. |
| Financial ledger, payment receipts, audit events | Immutable facts and replay/reconciliation relationships exist; no common approved retention duration was found. | Payment, wallet, audit and commerce source modules | Preserve integrity; do not guess a duration or delete on business-terminal status alone. |
| Payment action ciphertext/tombstones | C4 synthetic contract removes ciphertext on terminal transition and accepts an externally selected `purgeAfter`; no numeric tombstone TTL is embedded. | `server/services/platform/payment-action-custody-contract.mjs` | Correct separation: ciphertext expiry/terminal purge is distinct from redacted tombstone retention. Payment owner still selects replay/reconciliation window. |

## 3. Important distinctions

1. `expires_at`, `valid_until`, quote TTL, order TTL, challenge TTL, and claim lease are not retention approval.
2. A terminal financial/payment state does not automatically permit deleting the immutable receipt, ledger, or audit chain.
3. A delivered handoff's 10-minute lease does not mean the row or digest is deleted after 10 minutes.
4. A payment action's provider expiry bounds the raw capability; it does not determine how long a redacted tombstone is needed for reconciliation.
5. The Leads 90-day rule is scoped to Leads only.

## 4. Low-friction closeout plan

The source inventory is now explicit, so the remaining work can be grouped rather than split into many individual blockers:

- **Identity/security:** approve one bounded post-terminal window for sessions and second-factor challenges, with purge owner and deletion evidence.
- **Wallet/commerce/payment:** approve replay/reconciliation windows for handoffs, deferred transitions, receipts, and payment tombstones.
- **Finance/legal/audit:** approve immutable ledger, payment receipt, and audit retention by jurisdiction; no guessed numeric value.
- **Data/usage/ads:** keep raw usage excluded; approve consent-history and aggregated usage retention only when a concrete product purpose exists.

No new duration is proposed by this source audit. Existing Leads 90-day behavior remains unchanged.

## 5. Explicit non-authorization

This audit does not authorize production purge, customer-row reads, schema changes, D1 writes, Worker/DO deployment, or deletion of any existing record. C5 remains OPEN until the domain owners approve the grouped rules and the corresponding synthetic purge/tombstone tests pass.
