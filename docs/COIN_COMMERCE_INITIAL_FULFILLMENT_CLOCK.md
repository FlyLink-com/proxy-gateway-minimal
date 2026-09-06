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

- Source Gate: Risk A for the approved terminal-confirmation schema extension;
  the preceding clock-only repair was Risk B. Continue in the same PR.
- Eventual release unit: `control-plane-app`; `identity_impact: false`.
- Production deployment and existing terminal-order recovery remain Risk A.
- The optional versioned confirmation schema is source-only and never applied
  automatically. No price, upgrade/queue policy, feature flag or runtime
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

Existing effect identity and live-chain checks remain in force. The ordinary
coordinator and capture paths remain unchanged; the approved recovery extension
adds only proof-bound terminal confirmation, never generic retry.

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
alone also violates the command/receipt invariant. Deploying the clock repair
alone cannot repair such an order. The separately approved source extension
below is optional and requires explicit schema application and operator use.

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

## Approved source implementation contract

The 2026-09-06 continuation approval permits implementation and synthetic tests
of this mechanism in PR #718, not execution against production.

- `prepare` reads only one selected account/order and returns a digest rather
  than identifiers, resource material, database rows or customer data.
- `execute` binds that digest, exact account/order, operator reference and a
  canonical expiry to the approval digest. Digest matching is evidence binding,
  not authentication: the caller must be a separately approved operator-owned
  controller. No HTTP route or ordinary runtime composition exposes the API.
- A private participant verifies the same exact SQLite connection and existing
  Commerce/captured-hold invariants. A single immediate transaction writes the
  canonical initial effect, immutable confirmation, final receipt, two narrow
  terminal transitions and completion event. Resource and financial tables are
  read-only throughout this transaction.
- The new state-trigger exceptions require the immutable confirmation and exact
  receipt; they do not allow failed commands to become pending or processing.
  The original failed order/command timestamps must match. A used confirmation
  cannot clear a later reconciliation event. The immutable row also binds the
  exact audit bytes so a changed effect cannot masquerade as a committed replay.
- Replaying the same committed approval returns only the durable result, even
  after approval expiry. No fresh mutation is permitted after expiry.
- The original foundation migration identity/checksum remains unchanged. The
  new reader accepts exact old or exact extended schema, rejecting partial,
  forged or altered extensions. Removing an unused extension restores the old
  exact contract atomically; removal after any confirmation is forbidden.

Production remains unchanged until fresh inventory, a verified snapshot,
single-operator quiescence/serialization, exact source/migration/approval,
runtime readback, and a rollback/forward-fix decision are approved. A used
extension requires retaining forward-compatible code, not an old-binary pointer
rollback or deletion of confirmation history. Do not disable triggers, issue a
second command, fake operation time, recapture Coins, extend the entitlement, or
restore the shared database as a shortcut.

## Schema operator interface and acceptance

The standalone `scripts/platform-coin-commerce-initial-confirmation-schema.mjs`
has four explicit modes; it cannot select or recover an order. Outputs contain
only fixed reason codes, schema identity and aggregate results, never paths or
database rows. On Windows, use a drive-qualified local path (UNC is not accepted).

```text
node scripts/platform-coin-commerce-initial-confirmation-schema.mjs --mode validate --db-path <absolute-synthetic-db>
node scripts/platform-coin-commerce-initial-confirmation-schema.mjs --mode dry-run --db-path <absolute-synthetic-db> --temp-root <private-absolute-test-root>
node scripts/platform-coin-commerce-initial-confirmation-schema.mjs --mode apply --db-path <absolute-synthetic-db> --confirm-migration-id 20260906_001_coin_commerce_initial_confirmation --confirm-ddl-checksum <reviewed-exact-checksum>
node scripts/platform-coin-commerce-initial-confirmation-schema.mjs --mode remove-unused --db-path <absolute-synthetic-db> --confirm-migration-id 20260906_001_coin_commerce_initial_confirmation --confirm-ddl-checksum <reviewed-exact-checksum>
```

These are validation instructions, not production commands or approval. `validate`
opens SQLite read-only; that is not a guarantee that a live WAL database has no
SQLite companion side effects. Use an isolated fixture here; any future host
inventory must separately control database writers and companion custody.
`dry-run` uses SQLite backup into a private temporary directory and exercises
apply, unused inverse, reapply and exact schema inspection only on that clone.
It checks source main-file hash, data version and schema version before/after,
fails on observed concurrent change, and removes its own test clone. It is not
a retained production backup. On a used extension it validates but cannot claim
an unused inverse was exercised (`unusedInverseVerified: false`).

Exit codes: 0 verified, 2 rejected arguments/confirmation, 3 blocked schema or
used extension, 4 operation unavailable. A nonzero or uncertain mutation result
requires read-only inventory, not automatic retry. Exact migration proof is an
operator error-prevention check, not authentication or a production Gate.

Focused coverage additionally includes these four files:

```text
server/tests/platform-coin-commerce-initial-confirmation.test.mjs
server/tests/platform-coin-commerce-initial-confirmation-participant.test.mjs
server/tests/platform-coin-commerce-initial-confirmation-schema.test.mjs
server/tests/platform-coin-commerce-initial-confirmation-cli.test.mjs
```

Acceptance is unchanged money/resource snapshots, one original effect/receipt,
preserved historical failures, exact replay with no writes, no database change
after any injected write failure, reject lineage/audit/approval/runtime drift,
foundation compatibility and reversible unused schema. A production-specific
controller must later bind exact source and target, quiesce competing writers,
verify a fresh snapshot and inventory, receive operator approval, and return
only aggregate readback. No production controller is supplied or executed here.
