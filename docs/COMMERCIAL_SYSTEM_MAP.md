# Commercial System Map

```yaml
document_metadata:
  doc_type: evidence
  lifecycle: active
  authority_scope: commercial_integration_topology
  superseded_by: null
  last_verified_at: 2026-07-22
  production_authority: false
```

> Status:
> - Risk: C for this map
> - PR #526 classification: `COMMERCE_PLATFORM_FOUNDATION`
> - Commerce domain foundation: `SOURCE_FOUNDATION_PRESENT`
> - PR #526 Coins production integration: `NOT_STARTED`
> - PR #526 production payment settlement: `NOT_IMPLEMENTED`
> - Production impact: None

## Purpose

This map separates two tracks that must converge before a commercial feature is
complete:

```text
Commerce capability track
  Domain -> API -> Contract -> State machine

Product integration track
  Production identity -> User journey -> UI integration -> Release

Both tracks
  -> Commercial feature complete
```

A healthy domain model does not prove production product integration. A
working page does not prove a production commercial backend.

This is a derived topology. Commercial semantics remain owned by
`docs/COMMERCIAL_MODEL_V1.md` and reviewed domain contracts; release semantics
remain owned by `RELEASE_MANIFEST.md`.

## PR #526 Reclassification

| Layer | Current status | Accepted meaning |
| --- | --- | --- |
| Coins product and pricing source model | `FOUNDATION_PRESENT` | Source-only catalog and immutable snapshots exist. |
| Wallet and referral store | `FOUNDATION_PRESENT` | Append-only in-memory model and atomic local mutation boundary exist. |
| Commerce orders | `FOUNDATION_PRESENT` | Product/recharge order concepts and source-only orchestration exist. |
| Payment attempts and charge certainty | `SERVICE_POLICY_PRESENT` | Provider-bound attempts and conservative state/switching rules exist in the service path; the store does not enforce a complete transition matrix. |
| Idempotency | `SINGLE_PROCESS_ONLY` | In-process source behavior and route contract are tested; durable cross-process exactly-once behavior is absent. |
| Provider adapter | `PREVIEW_ONLY` | Injected, network-free adapter; no live provider capability. |
| Fulfillment | `PLAN_ONLY` | An inspectable plan is emitted; nothing applies runtime grants. |
| Portal/Admin HTTP contracts | `SOURCE_ONLY` | Protected DTO boundaries exist; no production binding is proven. |
| Portal commercial integration | `REJECTED_PENDING_IDENTITY` | Current UI result is not accepted as production Portal integration. |
| Admin payment-operations integration | `REJECTED_PENDING_IDENTITY` | Safe-read contracts remain useful; current page is not accepted as production Admin integration. |
| Durable ledger | `NOT_IMPLEMENTED` | No production schema, migration, durable transaction log, or cross-process concurrency boundary. |
| Webhook lifecycle | `NOT_IMPLEMENTED` | No inbox, authenticity verification, replay control, or provider-event correlation. |
| Settlement and reconciliation | `NOT_IMPLEMENTED` | Labels/read models are not a settlement or reconciliation workflow. |
| Fulfillment execution | `NOT_IMPLEMENTED` | No job, outbox, retry, compensation, apply receipt, or runtime expiry executor. |

The backend source should be preserved as a foundation. It must not be called a
production ledger, double-entry ledger, production payment system, or complete
commercial backend.

The exact normalized payment vocabulary is:

```text
entry_unavailable
confirmed_no_charge
provider_insufficient
risk_rejected
action_required
pending
unknown
possibly_charged
succeeded
reversed
```

Do not collapse this into a generic `failed` state without a reviewed contract
change. The service applies the conservative switching policy, but the current
in-memory store can append revisions without independently proving that every
`status`, `chargeCertainty`, and `reconciliationState` combination is valid.
That repository-level transition contract remains future work.

## Commercial Policy Alignment Gate

`docs/COMMERCIAL_MODEL_V1.md` currently defines the primary v1 offer as a
time-bounded entitlement with included traffic and explicitly says a pure
prepaid wallet is not the primary v1 model.

PR #526 introduces a Coins-first purchase foundation. These can coexist only
after an explicit policy decision defines whether Coins is:

- an optional funding and purchase mechanism for approved platform products;
- a successor commercial-model version; or
- a non-production experiment.

Until that relationship is reconciled:

```text
coins_domain_contract: preserve_for_review
commercial_policy_authority: unresolved
production_activation: blocked
```

This is a governance gap, not evidence that the provider-neutral backend
implementation should be discarded.

### Closed-Loop Coins And Referral Settlement

Paid and bonus Coins are closed-loop platform value:

```text
no withdrawal
no fiat exchange
no user transfer
no trading
no third-party merchant payment
```

PR #526 also models referral lots and an externally settled amount. Before the
domain contract is frozen, one of these must be chosen explicitly:

- referral rewards remain closed-loop Coins and can never be externally
  settled; or
- a future external partner claim is a separate accounting asset/domain and is
  not a Coins wallet lot.

Until that decision exists:

```text
closed_loop_coins_invariants: freezeable
referral_external_settlement_contract: blocked
entire_backend_contract_frozen: false
```

## User Commercial Journey

The production user journey to discover and validate is:

```text
User login
  -> existing account center
  -> existing billing/package area
  -> Coins wallet
  -> recharge
  -> product purchase
  -> order
  -> entitlement/grant
  -> subscription/resource delivery
  -> measured usage
```

Coins is a capability inside the existing Portal. It is not authority to build
a second product shell.

Required ownership map:

| Step | Owning production surface | Domain contract | Current state |
| --- | --- | --- | --- |
| Login/account | Portal | Portal session/account ownership | Surface identity blocked |
| Wallet | Portal billing area | Wallet read model and ledger semantics | Source contract present |
| Recharge | Portal billing area | Recharge order and payment attempt | Source contract present; provider non-live |
| Purchase | Portal product/package area | Product order and Coins hold/capture | Source contract present |
| Order | Portal order history | Immutable order snapshot | Source contract present |
| Entitlement/grant | Existing resource lifecycle | Fulfillment plan and future executor | Plan only |
| Delivery/usage | Existing subscription/resource surface | Access lifecycle and accounting | Separate existing domains |

## Operator Commercial Journey

The production operator journey to discover and validate is:

```text
Protected Admin
  -> existing order operations
  -> payment evidence
  -> settlement state
  -> reconciliation exceptions
  -> fulfillment exceptions
  -> controlled resolution plan
```

Required ownership map:

| Step | Owning production surface | Domain contract | Current state |
| --- | --- | --- | --- |
| Order review | Existing Admin operations | Commerce order summary | Production source identity blocked |
| Payment evidence | Existing Admin operations | Redacted Payment Logs DTO | Source contract present |
| Settlement | Future finance/operations owner | Provider settlement records | Not implemented |
| Reconciliation | Future finance/operations owner | Expected-versus-observed ledger/provider facts | Not implemented |
| Fulfillment exception | Existing/future operations owner | Plan/job/result/receipt | Plan only |
| Resolution | Controlled operator gate | Retry/compensation/refund/reversal plan | Not implemented |

Admin remains read-only for PR #526. No payment capture, retry, refund,
settlement, provider routing, balance overwrite, or runtime action is
authorized.

## Production Backend Sequence

After production surface identity and commercial policy alignment are resolved,
production backend work remains a sequence of separately approved phases:

```text
Durable append-only commerce ledger and aggregate state machines
  -> provider sandbox adapter
  -> webhook inbox and authenticity verification
  -> verified event local transaction and crash recovery
  -> fulfillment job/outbox
  -> execution receipt and compensation
  -> settlement reconciliation
  -> refund, chargeback, and dispute handling
  -> production release gate
```

Minimum durable records include:

```text
wallet_transactions
wallet_lots
commerce_orders
payment_attempts
provider_events
fulfillment_jobs
fulfillment_events
reconciliation_records
business_operation_reservations
```

Schema names are planning vocabulary only. They do not authorize a migration.

Durable acceptance must also define and enforce:

- recharge-order transitions from `payment_requested` through credited,
  failed, or reversed terminal outcomes;
- product-order transitions from `fulfillment_planned` through fulfilled,
  failed, or compensated outcomes;
- persisted compatibility between payment status, charge certainty, and
  reconciliation state;
- durable idempotency and business-operation reservation;
- provider-call reservation, provider idempotency, and recovery when the
  process stops after a provider call but before recording its local result;
- refund, chargeback, and dispute events, compensating wallet transactions,
  entitlement compensation decisions, and their reconciliation transitions.

External provider operations and the local database cannot form one distributed
atomic transaction. The local transaction may atomically commit a verified
provider event, order/payment transition, wallet credit, and fulfillment
outbox; reservation and reconciliation handle the external uncertainty window.

Current recharge success is intentionally incomplete: a successful preview
attempt is represented as charged but uncredited. It does not append a paid
Coins lot or advance the recharge order through settlement. A reconciliation
label in a DTO is not a reconciliation record or workflow.

## Recharge And Purchase Separation

The required invariant is:

```text
Recharge
  -> verified funding event
  -> append wallet transaction

Purchase
  -> hold existing Coins
  -> capture or release
  -> fulfillment plan/job
```

Recharge must never silently purchase a product. Product purchase must never
silently create a recharge. Provider success must not directly issue runtime
credentials.

## Completion Definition

A commercial capability is complete only when all are true:

- production frontend identity is confirmed;
- user and operator journeys are mapped;
- domain and commercial-policy contracts agree;
- durable storage and real integration boundaries are implemented where
  required;
- UI extends the existing production surfaces;
- production-like browser, security, and business validation pass;
- artifact, deployment, and rollback identities are recorded;
- production activation passes a separate Risk A gate.

## Related Documents

- `docs/COMMERCIAL_FEATURE_INTEGRATION_GATE.md`
- `docs/PRODUCTION_SURFACE_REPORT.md`
- `docs/ACTIVE_FRONTEND_MAP.md`
- `docs/COMMERCIAL_MODEL_V1.md`
- `docs/BILLING_RECHARGE_CONTRACT.md`
- `docs/ACCOUNT_RESOURCE_DELIVERY_LIFECYCLE.md`
- `docs/superpowers/specs/2026-07-22-coins-commerce-vertical-slice-design.md`
- `docs/superpowers/plans/2026-07-22-coins-commerce-vertical-slice.md`
