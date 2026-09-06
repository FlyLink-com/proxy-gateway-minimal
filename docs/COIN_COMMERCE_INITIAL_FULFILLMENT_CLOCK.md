# Initial Commerce Fulfillment Clock Repair

Date: 2026-09-06. Source-only implementation record; no production authority.

```yaml
document_metadata:
  doc_type: evidence
  lifecycle: active
  authority_scope: commerce_initial_fulfillment_clock_repair
  superseded_by: null
  last_verified_at: 2026-09-06
  production_authority: false
```

## Scope

- Source Gate: Risk B; one focused code/test PR.
- Eventual release unit: `control-plane-app`; `identity_impact: false`.
- Production deployment and existing terminal-order recovery remain Risk A.
- No schema, feature flag, payment, price, upgrade/queue policy or runtime
  principal change is included. No production order is modified by this PR.

## Failure and implementation

The fulfillment handler captured its operation time before calling the initial
resource issuer. The issuer independently read its clock. A difference of even
one millisecond made the newly issued entitlement appear to be in the future
when the handler re-resolved it. Issuance had already committed, but Commerce
effect confirmation had not. A later attempt could resolve that resource but
the database layer incorrectly required its original creation time to equal the
new attempt time.

The repair has three boundaries:

1. Pass a canonical internal `issuedAt` from the handler to the initial issuer.
   Standalone issuer callers that omit it retain the existing service clock.
   Invalid supplied values fail before creating any resource.
2. Confirm an initial resource against its persisted original issuance time,
   with the operation time remaining the confirmation/audit time. Original
   validity, quota, and duration must match; confirmation does not add a period.
3. Bind confirmation to the issuer's existing deterministic command/order-derived
   resource references. Check the exact request, entitlement,
   grant, link, approval and purpose in the database transaction. Matching the
   SKU and dates alone is insufficient. A different same-SKU command is a
   renewal, not permission to adopt another command's unfinished initial effect.

Existing effect identity and live-chain checks remain in force. This change
does not alter capture or the coordinator's lease and terminal-state rules.

## Validation contract

Tests use isolated synthetic SQLite/runtime fixtures only. They cover the
advancing clock, a temporary failure after issuance followed by a later attempt,
unchanged original duration, one resource/effect, different-command renewal,
malformed references and timestamps, and exact same-command lineage drift.

Run the two focused test files, then `npm test` and `git diff --check`:

```text
server/tests/platform-coin-commerce-subscription-fulfillment.test.mjs
server/tests/platform-portal-access-requests.test.mjs
```

The PR records actual red/green counts, full-suite results and limitations.
Local validation or a merge is not production recovery evidence.

## Existing terminal orders are a separate recovery boundary

An order already in `reconciliation_required` with a `failed` command is not
eligible for the ordinary coordinator. The current schema deliberately forbids
both terminal states from transitioning out. Inserting a delivered receipt
alone also violates the command/receipt invariant. This PR neither changes
these contracts nor claims that deploying it will repair such an order.

Completing an already-issued terminal order requires an explicitly approved,
versioned recovery mechanism. The intended narrow scope is an operator-only,
single-order confirmation of the same initial resource, never a generic retry:

- Fresh read-only inventory binds the exact failed command/order, captured hold
  and ledger evidence, original offer and allocations, deterministic issuance
  lineage and audit, and the current runtime resource. Any ambiguity blocks.
- The execution path must not call capture, the resource issuer, a generic
  coordinator, renewal, or arbitrary status-update SQL.
- An atomic confirmation must preserve historical failure events, the original
  resource period/quota and financial facts, while recording one canonical
  effect, one final receipt and durable recovery evidence.
- A response-loss retry must only recognize the same committed result. Different
  evidence, another command, a missing resource or a conflicting effect blocks.
- A schema extension needs migration/validator tests and an explicit rollback
  compatibility plan: the old exact-DDL validator rejects an unknown extension.
  A code-pointer rollback alone must not be claimed sufficient.

No recovery migration or terminal-order mutation is implemented or authorized
by this record. Do not disable triggers, issue a second command, fake operation
time, recapture Coins, extend the entitlement, or restore the shared database
as a shortcut. Keep the terminal order unchanged until that separate mechanism
and its exact Production Gate are verified and approved.
