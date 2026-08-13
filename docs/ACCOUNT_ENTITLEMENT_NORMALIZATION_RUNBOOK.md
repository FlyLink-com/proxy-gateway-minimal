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
It is a planning contract, not the future write operator.

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

For a case in the **remote-handoff** runtime scope, `runtimeState=verified`
is accepted only when the private snapshot carries one opaque scope digest and
all four exact, current facts: desired state, applied notification, active
matching lease, and applied receipt with config test, service, and listener
ready. A scope outside remote-handoff has no such claim and remains blocked
for a future independent Runtime Gate. This is a canonical input contract, not
a live readback: it must be sampled again inside the later maintenance window.
Case references must be strictly sorted opaque 64-hex values, so the same
private case set has one snapshot and plan digest rather than a caller-chosen
ordering.

`legacy-entitlement-normalization-execution-state.mjs` adds a second, still
source-only **execution-preflight contract**. It has no CLI and no database,
filesystem, network, runtime, Commerce, Wallet, or Authority adapter. Given a
private snapshot and private digest-only attestations, it verifies only that
the following declarations bind together:

- exact source commit, policy, snapshot and plan digests, bounded expiry, and
  batch limit;
- a held write barrier with zero aggregate Wallet/Commerce/Payment/Fulfillment
  writers;
- distinct paired control/runtime backup and restore-proof digests;
- the exact affected remote-handoff scope and its desired/notification/lease/
  listener-ready receipt digest set; and
- one matching opaque case digest and review binding for every frozen case.

Its receipt is deliberately `attestationClaimsOnly: true`,
`executionAllowed: false`, and has all effects fixed to zero. Even when every
input declaration matches, the strongest state is
`candidate_for_separate_risk_a`; it is not an authenticated readback, approval,
operator receipt, or permission to switch a user model. Hard blockers cannot
be cleared by a review digest, and multi-current chains remain
`review_required` until a separate private canonical-chain decision exists.

The same module can canonicalize a **private execution-intent manifest** for
future review. It binds only pre-approved, unique-current, non-blocked cases to
opaque private triad references, Authority CAS expectations, a deterministic
operation digest, a source-binding digest supplied by a future private
inventory, and a fixed 365-day/200-GiB/yearly transition shape whose cycle
anchor equals its start. Its public summary exposes only manifest/snapshot/plan
digests and a count. Raw manifest parse/serialize helpers remain internal to
this source module: there is no CLI, HTTP route, log surface, or runtime import
for them. The manifest is not an operator, does not provide idempotent writes,
and is never printed by the CLI or a receipt. Multi-current, lapsed,
zero-service, Authority-conflicted, runtime-drifted, or otherwise blocked cases
cannot enter it. The preflight accepts such a manifest only as an in-memory
private object and recomputes its source/snapshot/plan/case bindings; a digest
string alone is not accepted as evidence.

The canonical preflight also applies a short, ordered declaration window:
frozen snapshot → intent → held barrier → paired backup/restore declaration →
runtime declaration → review → evaluation. The barrier's generation digest is
derived from its complete aggregate declaration, rather than accepted as an
unrelated hash. These are still **claims-only integrity bindings**, not a
production lock, authenticated provider readback, or evidence that every
control-plane writer is paused. A later Risk A operator must obtain a real
maintenance/read-only generation covering entitlement, Portal, Authority and
runtime writers, then independently read it back in the same window.

## Required gates before any later apply

The one-time production cohort query attempted for this work did not yield a
valid frozen snapshot. Do not treat a prior aggregate count, a source digest,
or a successful local dry-run as its replacement. A future separate Risk A
sequence must include:

1. Resolve the current desired-state/notification/lease/receipt drift for the
   exact runtime resources that a transition could affect.
2. Take one fresh read-only, aggregate-safe cohort inventory and bind a
   private frozen manifest to exact source, database, and paired backup
   identities. The source-only execution-preflight contract may validate the
   resulting digest relationships, but the later Risk A operator must perform
   its own authenticated live readback. Stop on ambiguity, partial chains,
   in-flight Commerce, or runtime drift.
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

## Future operator contract (not implemented by this PR)

The future Risk A operator must be a separate executable surface. It may not
turn this read-only CLI's `apply` mode on or treat the source-only
execution-preflight receipt as proof of the live system. Its private immutable
manifest must bind an exact source/artifact identity, snapshot and plan digest,
bounded expiry, write-barrier generation, paired control/runtime backup and
restore proof digests, exact schema checksums, runtime/identity preflight
digests, and one explicitly approved canonical chain and transition rule for
every case.
It must treat each case as the following forward-only state machine:

```text
planned -> control_committed -> runtime_pending -> runtime_applied -> reconciled
                                      |                    |
                                      +---- stopped / reconciliation_required
```

No component may infer a keeper, create a second service resource, fabricate
a payment/Coins/Commerce effect, or delete historical records. The operator
must stop the whole bounded batch on any case drift, in-flight write, failed
runtime readback, or unknown outcome. A later case cannot begin after a prior
case becomes `runtime_pending`, `stopped`, or `reconciliation_required`.
Control-DB restoration alone is not a rollback after a runtime change; recovery
is forward reconciliation under a separate exact approval.
