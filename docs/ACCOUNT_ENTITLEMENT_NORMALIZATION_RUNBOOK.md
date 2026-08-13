# Account Entitlement Normalization Runbook

> Status:
> - Type: source-only planning and dry-run contract
> - Risk: B for this source-only tool; every data, runtime, identity, payment,
>   deployment, and production step remains Risk A
> - Release unit: `control-plane-app`
> - Production state: `not_deployed`
> - Execution authority: none
> - Identity impact: false for this planning tool; a later resource transition
>   must declare and pass its own Identity Gate

## Purpose and boundary

This tool prepares an aggregate-only plan for the policy goal of one annual
`200 GB/month` service model for accounts that have a current service chain.
It does **not** implement that migration. It cannot read a production database,
select a resource, assign Authority, alter an entitlement, issue or revoke a
subscription, change a tenant/artifact, touch a wallet, create a Quote or
Order, capture Coins, invoke a payment provider, or dispatch a runtime action.

The target product is fixed in source as:

| Field | Value |
| --- | --- |
| Offer | `offer_plan_365d_200gb_monthly` |
| Immutable offer version | `offerv_plan_365d_200gb_monthly_v1` |
| Duration | 365 days |
| Monthly traffic | 200 GiB |
| Portal plan | `yearly` |

The tool deliberately leaves the following business decisions unresolved:
the definition of the approved current-service cohort; the explicit canonical
chain for an account with more than one current chain; the `validFrom`,
`validUntil`, and usage-cycle anchor rule; any cross-product transition
semantics; the disposition of non-canonical records; and all account-login
identity merges. A digest only binds a local canonical input; it is not
authenticated provenance, an approval, a backup, or an execution receipt.

## Source-only command

The input is a private, canonical JSON **case snapshot**. It uses only opaque
SHA-256 `caseRef` values and pre-classified facts. It must never contain an
account ID, email, entitlement/request/link reference, database path, URL,
credential, SQL, session, payment detail, or raw database row. The CLI accepts
only an absolute local regular JSON input file (UNC/network and database-like
paths are rejected) and writes exactly one aggregate-only JSON line.

```powershell
node scripts/platform-legacy-entitlement-normalization.mjs `
  --mode inventory --input-path '<absolute private snapshot path>'

node scripts/platform-legacy-entitlement-normalization.mjs `
  --mode plan --input-path '<absolute private snapshot path>'

node scripts/platform-legacy-entitlement-normalization.mjs `
  --mode dry-run --input-path '<absolute private snapshot path>'
```

`--mode apply` is intentionally rejected with `apply_not_supported`. No
database path, confirmation token, selection, assignment, or production flag
is accepted by this tool.

The output reports only canonical-input checks, a snapshot digest, a plan
digest, aggregate classification counts, and fixed zero-effect assertions:

- automatic chain selection: `0`;
- Authority assignments: `0`;
- plan transitions: `0`;
- zero-service resource creation: `0`;
- wallet, Coins, Commerce Order, and fulfillment effects: `0`.

`reasonCounts` is an overlapping blocker summary: a single private case can
contribute to several independent blockers, while `counts` retains its one
deterministic primary classification. This prevents an Authority or runtime
drift from being hidden by a different primary reason. `no_service_noop` is
the only non-review outcome for a zero-resource account.
It does not create an entitlement, Authority row, tenant, artifact, Portal
request, wallet, or account merge. `lapsed_only`, partial, future/effect-backed,
duplicate-login, in-flight Commerce, and runtime/identity-unverified cases are
blocked. Multi-current chains require an explicitly reviewed canonical triad;
the tool never chooses a keeper from timestamps, use, runtime presence, or
validity dates.

## Required gates before any later apply

The one-time production cohort query attempted for this work did not yield a
valid frozen snapshot. Do not treat a prior aggregate count, a source digest,
or a successful local dry-run as its replacement. A future separate Risk A
sequence must include:

1. Resolve the current desired-state/notification/lease/receipt drift for the
   exact runtime resources that a transition could affect.
2. Take one fresh read-only, aggregate-safe cohort inventory and bind a
   private frozen manifest to exact source, database, and paired backup
   identities. Stop on ambiguity, partial chains, in-flight Commerce, or
   runtime drift.
3. Review an explicit product-transition contract and private canonical triad
   manifest. No automatic backfill or keeper selection is permitted.
4. Implement and validate a separate idempotent normalization operator on
   paired control/runtime copies. It must support per-case CAS, stop states,
   forward reconciliation, and runtime readback. It must not use ad hoc SQL or
   `applyCoinCommerceSubscriptionFulfillment`.
5. Obtain an exact Data Gate and Runtime Gate for a bounded batch, then run a
   fresh post-write readback before any larger batch.
6. Only after a migrated test account has a verified unique annual service
   chain and runtime delivery is reconciled, request a separate financial Gate
   for one bounded XSD recharge to `paid_coins` followed by a Coins Commerce
   checkout, capture, and fulfillment verification. That transaction is not a
   rollback mechanism for this migration.

The CLI has no database driver or database connection and rejects database-like
input paths; it only reads local regular canonical JSON snapshot bytes. That
does not make an arbitrary local JSON file safe to disclose, so input files
remain private and are never echoed in output.

No production action is approved or performed by this runbook.
