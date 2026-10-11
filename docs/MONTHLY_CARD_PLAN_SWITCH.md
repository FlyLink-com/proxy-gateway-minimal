# Monthly Card Plan Switch (Renew / Upgrade / Downgrade) Design

Last updated: 2026-10-11.

```yaml
document_metadata:
  doc_type: canonical
  lifecycle: active
  authority_scope: monthly_card_plan_switch
  superseded_by: null
  last_verified_at: 2026-10-11
  production_authority: false
```

> Status:
> - Type: Source design + implementation contract, default-off
> - Risk: A (Coin charging amounts, plan-switch entitlement effects, SQLite schema)
> - Release unit: `control-plane-app` (+ `portal-static` for the UI part)
> - Identity impact: false (no principal, material, map or resolver change)
> - Execution authority: None. No schema apply, no flag activation, no deploy.
> - Production impact: None until a separate Risk A Production Gate is approved

## Purpose and decision record

Today a user with an unexpired plan can only buy the same plan again; any other
plan fails with `offer_unavailable` ("This product is currently unavailable.").
Ethan chose "plan A" (2026-10-10): switching is allowed during the period.

| Case | Behaviour |
| --- | --- |
| Same-plan renewal | Allowed any time. Adds days only, no extra GB. Unchanged from today. |
| Upgrade (rank goes up) | Allowed mid-period. Charges the prorated price difference (unused value of the old plan is a price credit, rounded in the user's favour). Takes effect immediately. Keeps the original `validFrom` / billing-cycle anchor, so already-used bytes still count and the new cap applies at once (no free quota reset). |
| Downgrade (rank goes down) | Paid now, takes effect at the end of the current period (`validUntil`). No refund. Stored as a pending (scheduled) switch. |
| Renew or upgrade while a downgrade is pending | The pending downgrade is cancelled (renewal/upgrade wins). Its paid Coins are NOT refunded; they are applied as a price credit on the cancelling purchase (see "Open points"). |
| Refunds | No Coin refunds on any switch. |
| Third-party node tier (#762/#771) | Derived from the plan effective NOW (`platform_entitlements.plan`), never the pending one. |
| Data packs (#753) | Untouched. |
| Commerce model | LEGACY only. Fails closed otherwise (see "Production precheck"). |
| Rollout | Feature flag `COINS_COMMERCE_PLAN_SWITCH_ENABLED`, default OFF. Off = byte-identical behaviour. |

Plans (from `coin-commerce-production-catalog.mjs`, stored in `platform_entitlements.plan`
as the offer version ref):

| Rank | offerVersionRef | Coins | Days | GB/month |
| --- | --- | --- | --- | --- |
| 1 | `offerv_plan_30d_50gb_monthly_v1` | 20 | 30 | 50 |
| 2 | `offerv_plan_30d_100gb_monthly_v1` | 30 | 30 | 100 |
| 3 | `offerv_plan_365d_200gb_monthly_v1` | 200 | 365 | 200 |

Rank is an explicit table in code (`PLAN_SWITCH_TIERS`), with a test that every
published plan offer has a rank. A plan not in the table is never switchable.

## Expiry handling choice (deviation from the default, needs Ethan's ack)

The stated default was "keep the current `validUntil`". That works for
30-day to 30-day upgrades but is wrong for monthly to yearly (yearly costs less
per day, so the price difference would be negative) and cannot express stacked
renewals sensibly. Chosen rules:

* `plan_30d -> plan_30d` upgrade (basic to plus): keep `validUntil`
  (in-place upgrade). Charge = `floor(deltaPrice * remainingMs / durationMs)`, minimum 1 Coin.
* `-> yearly` upgrade: the old plan's unused value becomes a credit against the
  yearly price and the term restarts from now: `validUntil = now + 365d`.
  `validFrom` is still preserved (anchor kept). Charge = `yearlyPrice - ceil(credit)`;
  if the credit is not below the yearly price the switch is refused with
  `plan_switch_credit_exceeds_price` (never produces a free or negative charge).

Why: both rules keep the user from paying twice for the same time and never
shorten the paid period, and both preserve the anchor. If Ethan prefers one
uniform "keep validUntil" rule, only the yearly branch changes.

## Charge math (integer, user's favour)

Everything is integer. Time is milliseconds; `R = max(0, validUntil - now)`;
`D_old` = old plan duration in ms. `P_*` = list price in Coins. Intermediate
products stay below 2^53 (200 * 365d in ms is about 6.3e12).

```text
credit_unused   = ceil(P_old * R / D_old)          # more credit = user's favour
upgrade_inplace = max(1, floor((P_new - P_old) * R / D))   # both plans 30d, D = 30d
upgrade_yearly  = P_new - credit_unused            # must be >= 1, else refuse
pending_credit  = paid Coins of the pending downgrade being cancelled (0 if none)
charge          = max(1, switch_charge - pending_credit)   # list-price basis, then discount
```

Worked examples (30d = 2,592,000,000 ms):

| Situation | R | Calculation | Charge |
| --- | --- | --- | --- |
| basic to plus, just bought | 30d | floor(10 * 30/30) | 10 |
| basic to plus, 15 days left | 15d | floor(10 * 15/30) = floor(5) | 5 |
| basic to plus, 29.9d left | 29.9d | floor(9.966) | 9 |
| basic to plus, 1 hour left | 1h | floor(0.0138) = 0 so min | 1 |
| basic to yearly, 15d left | 15d | 200 - ceil(20 * 15/30 = 10) | 190, `validUntil = now + 365d` |
| plus to yearly, 7d left | 7d | 200 - ceil(30 * 7/30 = 7) | 193 |
| plus to yearly, 7d + 1ms | | credit ceil(7.0000000...) = 8 | 192 |
| basic to yearly, 70d left (stacked) | 70d | credit ceil(46.67) = 47 | 153 |
| basic to yearly, 310d left | | credit ceil(206.67) = 207 >= 200 | refused |
| downgrade plus to basic | any | list price, no proration | 20 (scheduled at `validUntil`) |
| downgrade yearly to plus | any | list price | 30 (scheduled at `validUntil`) |
| renew plus while basic downgrade pending | | 30 - 20 credit | 10 |

The discount reader (`discountBasisPoints`) is applied to the switch charge
after proration, exactly as for ordinary offers; the credit itself is computed
on list price. Orders keep the existing `amount_units >= 1` rule.

## Production precheck (fail closed, testable)

The new path only supports the LEGACY commerce model. Production evidence
(see `/workspace` audit, 2026-10-10): `COINS_COMMERCE_ACCOUNT_RESOURCE_AUTHORITY_ENABLED`
was UNSET on JP at 2026-10-07 (source default false), no BWH readback exists,
and no code path creates `platform_account_resource_authorities` rows. This is
inference, so the code verifies instead of assuming:

`precheckPlanSwitchAccount({ authorityFlagEnabled, commerceMode, authorityRowCount })`
(pure function, unit-tested) returns `{ok:true}` or `{ok:false, code}`:

| Condition | Error code |
| --- | --- |
| `COINS_COMMERCE_ACCOUNT_RESOURCE_AUTHORITY_ENABLED` true | `plan_switch_authority_mode_unsupported` |
| account commerce mode is not `legacy` (`wallet_first_unique_v1`) | `plan_switch_commerce_model_unsupported` |
| the account has at least one row in `platform_account_resource_authorities` | `plan_switch_authority_row_present` |

* Startup: if `COINS_COMMERCE_PLAN_SWITCH_ENABLED` and the Authority flag are
  both on, the server refuses to start (`plan_switch_requires_legacy_commerce`).
  If the plan-switch schema is not present and valid, it refuses to start
  (`plan_switch_schema_not_ready`).
* Per request (quote and quote-confirm): the account precheck runs; on failure
  the HTTP response is 409 with the specific code above (never silently proceeds,
  never falls back to the old behaviour for that account except the plain
  same-plan renewal path).
* A missing `platform_account_resource_authorities` table counts as 0 rows.
  Any other count-query error, an unreadable commerce mode, or a timestamp that
  is not canonical ISO fails closed with `plan_switch_precheck_unavailable`
  (HTTP 409). That result is not treated as zero rows.
* Pre-launch checklist item (Ethan): before go-live, approve a read-only check on
  BWH of the flag value and `select count(*) from platform_account_resource_authorities`.
  Expected: flag unset/false, count 0.

## State model

Two additive tables, no change to existing tables (no existing trigger or
constraint is relaxed). Both live in the Commerce/control SQLite file (same
`dbPath`) like `platform_commerce_authority_quote_bindings`.

`platform_coin_commerce_plan_switch_quotes` (immutable, one row per switch quote):

```text
quote_ref PK -> platform_coin_commerce_quotes
account_id, entitlement_id
kind               'renewal' | 'upgrade_inplace' | 'upgrade_restart' | 'downgrade_scheduled'
from_offer_version_ref, to_offer_version_ref
snapshot_valid_from, snapshot_valid_until      (entitlement at quote time)
list_price_units, credit_units, pending_credit_units, charge_units(before discount)
cancels_switch_ref NULL | platform_scheduled_plan_switches.switch_ref
effective_at       (= snapshot_valid_until for downgrades, else NULL)
created_at
```

`platform_scheduled_plan_switches` (one row per paid downgrade, mutable lifecycle):

```text
switch_ref PK (= order_ref of the downgrade order)
account_id, entitlement_id, from_offer_version_ref, to_offer_version_ref
effective_at, paid_units
status 'scheduled' | 'applying' | 'applied' | 'superseded'
created_at, resolved_at, superseded_by_order_ref
partial unique index: at most one 'scheduled' or 'applying' row per account
```

Entitlement row itself is only changed by the existing fulfillment applier
(compare-and-set UPDATE on plan/valid_from/valid_until/traffic_limit_bytes).

Eligibility with the flag on (replaces the same-plan-only rule, keeps its
fail-closed shape): classify requested offer against the account's current
entitlement `E` (via `resolveAccountProductEntitlement`):

```text
no E, or E expired (validUntil <= now)   -> ordinary purchase (unchanged)
same plan                                -> renewal (cancels pending downgrade, if any)
rank up                                  -> upgrade_inplace / upgrade_restart
rank down                                -> downgrade_scheduled (refused if one is already scheduled)
anything unknown / ambiguous             -> offer_unavailable (guard kept)
```

`hasConflictingNonterminalPlan` stays in force for in-flight (held, capture
pending, undelivered) orders; paid downgrade orders are delivered immediately
(below), so they do not create a standing conflict.

## Flows

1. Quote (`createCheckoutQuote`, inside the existing `BEGIN IMMEDIATE`
   transaction): run the account precheck, read `E` and any scheduled switch
   from the same database, compute `kind` and `charge_units`, insert the normal
   quote row with `amount_units = discounted charge` plus one
   `plan_switch_quotes` row. Flag off: this code is not reached.
2. Confirm: re-read `E` and the scheduled switch in the confirm transaction; if
   plan, `valid_from`, `valid_until` or the scheduled-switch ref differ from the
   snapshot, fail with `offer_unavailable`-class `plan_switch_state_changed`
   (retryable by re-quoting). Then hold Coins as today.
3. 3-second cancel window: unchanged. Nothing about the entitlement or the
   scheduled switch is modified at confirm; cancel only releases the hold, so
   cancelling inside the window leaves no switch state behind.
4. Capture: ordinary renewals retain the existing path. A yearly upgrade checks
   current ownership, entitlement snapshot, pending-credit reference and cycle
   alignment while still `held`. An unsafe transition cancels the uncaptured
   order and releases its hold (no refund); the cancellation event's system actor
   records the safe reason. A safe yearly upgrade atomically commits Coins capture,
   outbox and control entitlement/audit effect on the same SQLite connection and
   timestamp, with no runtime or external I/O. Confirmed prices are not reprorated.
5. Fulfillment (`execute` in `coin-commerce-production-subscription-fulfillment.mjs`
   + `applyCoinCommerceSubscriptionFulfillment`), by `kind`:
   * `renewal`: existing behaviour; additionally, in the same DB transaction,
     mark the cancelled scheduled switch `superseded`.
   * `upgrade_inplace`: one transaction: CAS update `plan`, `traffic_limit_bytes`
     (new cap), keep `valid_from` and `valid_until`; update the access request
     plan fields; append the audit effect with `switchKind`; supersede a pending
     downgrade if cancelled. Runtime `renewTenant` is called with the unchanged expiry.
   * `upgrade_restart`: replays the control effect committed at capture, with
     `valid_until = capture_time + 365d`, `valid_from` kept. Runtime retries use
     that fixed effect even if a calendar boundary has passed.
   * `downgrade_scheduled`: the entitlement is NOT changed. One transaction
     inserts the `scheduled` switch row (`effective_at = snapshot_valid_until`,
     `paid_units`) and returns success, so the order/command become `delivered`
     immediately (no long-lived pending command: the per-account predecessor rule
     in the claim query would otherwise block later renewals).
6. Applying a due downgrade: a small idempotent function
   `applyDueScheduledPlanSwitches(now)` driven by the existing commerce
   coordinator tick. For each `scheduled` or `applying` row with `effective_at <= now` it calls
   the same fulfillment handler with a synthetic command whose `commandRef` is
   derived deterministically from `switch_ref`, so the existing "different plan
   after expiry" code path applies (new `valid_from = now`, new term, new cap),
   then marks the row `applying` in the same transaction as the entitlement
   effect. Only successful runtime renewal and readback mark it `applied`.
   Both runtime failure and a crash after renewal but before completion retain
   durable retry work; replays use the effect-audit branch without another term
   extension or Coin capture. Quotes/confirms
   for the account are refused with `plan_switch_application_pending` while a
   due row is unapplied. Note: the service may be expired for up to one tick
   interval between `validUntil` and application; this is accepted and documented.
7. Audit effect chain: `resolveLiveCoinCommerceFulfillmentEffect` currently
   requires strictly increasing `targetValidUntil` and, for a different plan,
   `validFrom === createdAt`. Switch effects add an optional metadata key
   `switchKind` (`upgrade_inplace` | `upgrade_restart`; absent for all existing
   effects, so old rows parse identically). Rules: an `upgrade_inplace` effect may
   have `previousValidUntil === targetValidUntil` and is ordered by `createdAt`
   among effects sharing that `previousValidUntil`; an upgrade effect keeps
   `validFrom` equal to the terminal effect's `validFrom` even though the plan
   differs. Chains without any switch effect must resolve exactly as before.

## Billing-cycle / quota safety

Verified in the audit (usage-billing-cycle.mjs + listUsageSamples +
traffic-accounting.mjs): used bytes are windowed by the `validFrom`-anchored cycle.
Upgrades keep `validFrom`, so the current cycle and its used bytes are unchanged
and only the cap changes (override test: exhaust 50 GB, upgrade, remaining =
100 GB - used). Known residual, now guarded: for `upgrade_restart` the cycle rule changes from
fixed 30-day windows to calendar-month anniversaries of the same anchor.
`usageCycleForBinding` was measured for anchors on day-of-month 1 through 31,
across 12 months and 0 through 400 elapsed days: the yearly window can start up
to 29 days LATER than the current fixed window (free quota reset, e.g. anchor
2024-01-31, at 2024-02-29: fixed start 01-31, monthly start 02-29) and up to 30
days EARLIER (used bytes counted again, risking an instant over-quota). Plan A
forbids any reset, so `evaluatePlanSwitchRequest` FAILS CLOSED with
`plan_switch_cycle_misaligned` (HTTP 409) for `upgrade_restart` unless both
cycle rules select the same window start at the quote instant (always true in the
first cycle). `usage-billing-cycle.mjs` is unchanged. Unit tests:
`coin-commerce-plan-switch-cycle-guard.test.mjs`. Consequence: later-cycle
upgrades to yearly can be refused until the windows realign or the current term
ends; in-place monthly upgrades are never affected.
Not in scope here (open point): an account suspended for over-quota stays
suspended after an upgrade until the next cycle because the resume rule
requires a newer cycle start (`portal-access-requests.mjs` ~1400-1420).

## Idempotency, failure handling, concurrency

* Quote and confirm keep the existing idempotency-key receipts. The switch row
  is keyed by `quote_ref`; reusing a key with a different request digest still
  yields `idempotency_key_reused`.
* The effect reference derives from `commandRef` (existing). The applier is
  compare-and-set on the entitlement row; the scheduled-switch update is in the
  same transaction as the entitlement update, so either both or neither happen.
* Retryable dependency errors (`SQLITE_BUSY`, runtime temporarily unavailable)
  map to the existing retryable fulfillment error; drift between the quote snapshot and live
  state maps to the existing reconciliation error (order goes to
  `reconciliation_required`, Coins are not auto-refunded; operator reconciles).
* Quote creation, confirm and fulfillment each re-read the state inside a
  write transaction, so two tabs or two devices cannot both win: the second sees
  changed plan/`valid_until`/scheduled switch and gets `plan_switch_state_changed`
  at confirm, or a reconciliation error if it already passed confirm (only
  possible through a race inside one command's lifetime).
* Minimum remaining time for an upgrade quote: 60 minutes. Below that the
  upgrade is refused with `plan_switch_upgrade_window_closed`. The same plan
  remains a renewal. A different-plan request stays a different-plan request.

## Rollback

* Runtime rollback: set `COINS_COMMERCE_PLAN_SWITCH_ENABLED` false and restart
  (the flag is read at startup). New quotes revert to the old same-plan-only
  guard. Already applied upgrades remain valid (entitlement rows are normal).
  The due applier runs only while the flag is on and the schema validates.
  Before turning the flag off, list `scheduled` and `applying` rows and leave the flag on
  until runtime delivery completes, or finish them under a separate Gate. A flag-off
  process does not apply them. Do not drop the tables while either unfinished
  status exists. Also drain held/capture-pending/undelivered plan-switch orders
  before disabling the feature or reverting its code.
* Schema rollback (additive only): `drop table platform_scheduled_plan_switches;
  drop table platform_coin_commerce_plan_switch_quotes;` only after exporting
  both tables and confirming zero `scheduled` and `applying` rows. No existing table changed,
  so no data migration back. Not applied anywhere by this PR.
* Code rollback: revert the PR; with the flag off the old paths are unchanged.

## Migration

New module `server/services/platform/coin-commerce-plan-switch-migrations.mjs`
and CLI `scripts/platform-coin-commerce-plan-switch-schema.mjs`
(`npm run platform:coin-commerce:plan-switch:schema`), mirroring
`platform-account-resource-authority-schema.mjs`. The CLI takes
`--mode validate|dry-run|apply|rollback` and an absolute `--db-path`. Dry-run
also accepts an absolute `--temp-root`. Apply and rollback require
`--confirm-migration-id` and `--confirm-ddl-checksum`. Exit codes: 0 success,
2 contract rejected, 3 schema rejected, 4 infrastructure failure. Rollback
removes the migration ledger row only after the two documented DROP statements,
and it refuses with `plan_switch_rollback_rows_present` while any
`status in ('scheduled', 'applying')` row exists. `validatePlanSwitchSchema` checks the additive
tables. Synthetic temporary databases alone have been migrated during tests;
no production database has been modified.

Current source migration: `20261010_001_coin_commerce_plan_switch`.
DDL SHA-256: `c704e39b50d0acfba16076f8636f156e1fc749f26d8134550ac67a62167e0384`.
This replaces the pre-review candidate checksum, not an applied production ledger.

## Portal API and UI

* Server: `GET /api/portal/commerce/plan-switch/state` (only registered when the
  flag is on; 404 otherwise) returns, per published plan offer:
  `{ offerRef, action: 'current_renew'|'upgrade'|'downgrade'|'unavailable',
  chargeUnits, creditUnits, effectiveAt, reasonCode }` plus
  `{ current: { offerRef, validUntil }, pendingSwitch: { toOfferRef, effectiveAt } | null }`.
  `checkout-preview` and the confirmed order gain an optional `planSwitch`
  object (`kind`, `creditUnits`, `chargeUnits`, `effectiveAt`,
  `cancelsPendingDowngrade`). `chargeUnits` is the pre-discount switch charge,
  so the portal can require `amountUnits` to equal the discounted charge.
  The object is omitted when the flag is off and on ordinary purchases.
* UI (`admin/src/features/user-portal`): `MarketplacePanel` receives the state;
  every plan card shows the current plan and expiry date, and a button label
  by action: renew "续费 / Renew", upgrade "升级，补差价 N Coins / Upgrade, pay N Coins"
  (N is pre-discount `chargeUnits`), downgrade
  "期末降级（<date> 生效） / Downgrade at period end (effective <date>)".
  An unsupported card is disabled with "暂不可切换 / Plan change unavailable".
  When `reasonCode` is set, the card uses that code's zh/en pair. When
  `reasonCode` is null, the sentence is
  "你当前的套餐有效期至 <日期>。该操作暂不支持，请在到期后切换。" /
  "Your current plan runs until <date>. This change is not available. Switch after it ends."
  The confirm dialog keeps "请确认商品和购买金额。 / Review the product and purchase amount."
  and, only when `quote.planSwitch` is present, adds
  "升级立即生效，不退款；降级在当前周期结束后生效，已支付不退款；续费或升级会取消待生效的降级。" /
  "An upgrade takes effect immediately and is not refunded. A downgrade takes effect after the current period and the amount already paid is not refunded. Renewing or upgrading cancels a pending downgrade."
  Flag off, or a 404 from the state endpoint: current UI unchanged.

## Test plan (source level)

Unit: policy classification and all charge examples above (table-driven, boundary
ms, overflow guards); precheck matrix; tier table coverage. Store: quote/confirm
with and without flag, snapshot drift, idempotent replay, cancel inside the 3 s
window, concurrent quote vs confirm. Fulfillment: in-place upgrade keeps
`valid_from` and used bytes (usage-cycle test), restart upgrade, scheduled
downgrade row, due application, supersede on renewal/upgrade, replay of every
effect, chain resolver old-vs-new. Existing `purchaseEligibilityReader` tests
unchanged and passing with the flag off. Admin tests for cards and copy.
Full suite is compared with the Windows baseline on clean `master`.

## Implementation deviations

These are the behaviors shipped in this branch. Money arithmetic in the charge
table above is unchanged.

1. An upgrade with less than 60 minutes remaining is `plan_switch_upgrade_window_closed`. It is not rewritten into a renewal. Same-plan renewal stays available.
2. A second downgrade while one is `scheduled` is `plan_switch_already_scheduled`.
3. In-place upgrade with stacked remaining time follows `floor((P_new - P_old) * R / D)` exactly. At 70 days the basic-to-plus charge is 23 Coins, above the 10 Coin list difference. It is not capped. The portal allows `amountUnits` above the catalog base only when `planSwitch` is present and `amountUnits` is at most `planSwitch.chargeUnits`. The deferred-checkout projection still rejects an amount above the catalog base.
4. `creditUnits` for `upgrade_inplace` is the uncharged part of the price difference before the 1 Coin minimum. When the floor is 0, credit is the full difference and the charge is 1. Yearly `creditUnits` is `ceil(P_old * R / D_old)`. `chargeUnits` is before the discount reader. `listPriceUnits` is the target catalog price. `paid_units` stored for a downgrade is the captured order amount, after discount.
5. `plan_switch_invalid_input` rejects malformed policy input. It is not an HTTP commerce code.
6. The schema CLI uses `--mode validate|dry-run|apply|rollback` plus the confirm flags above. The earlier bare `--dry-run` / `--apply` / `--validate` names are those modes.
7. `entitlement_id` is not a SQL foreign key. `cancels_switch_ref` is not a SQL foreign key. A BEFORE INSERT trigger requires a non-null `cancels_switch_ref` to match a `scheduled` row of the same account. `quote_ref`, `account_id`, and `switch_ref` are foreign keys with ON DELETE RESTRICT.
8. Rollback runs the two documented DROP statements, then deletes this migration's ledger row. Applied and superseded rows do not block rollback. A `scheduled` or `applying` row does. The legacy `scheduledRows` inspection count includes both unfinished statuses.
9. Extra CHECK constraints tighten the documented columns: renewal iff `from` equals `to`; downgrade iff `effective_at` is set; scheduled-row status shape; `from <> to` on scheduled rows.
10. The startup schema check runs only when the flag is on, after the control store opens. The authority-flag combination still throws `plan_switch_requires_legacy_commerce` before any database file is created.
11. `inspectCoinCommerceSchema` treats `platform_coin_commerce_*` objects as commerce-owned. The plan-switch quote table is excluded only when its stored SQL matches this migration exactly. Any other extra object in that prefix still fails commerce validation. Absent objects leave the check unchanged.
12. `plan_switch_precheck_unavailable` covers an authority-count query error other than a missing table, an unreadable commerce mode, a non-canonical timestamp, and an internally invalid scheduled-switch read. A missing table is 0 rows.
13. `upgrade_restart` can move the usage-cycle window start (29 days later / 30 days earlier). Resolved by a fail-closed guard (`plan_switch_cycle_misaligned`); the cycle module is unchanged. See Billing-cycle / quota safety.
14. Effect-chain start detection ignores the candidate itself. A mixed chain applies an `upgrade_inplace` before a later strictly increasing effect that shares `previousValidUntil`, when that in-place effect is the earliest such candidate. Ambiguous order resolves to null. Chains with no `switchKind` keep the previous resolver. Old effects are not rewritten with `switchKind: null`. Renewal effects do not carry `switchKind`.
15. The applier refuses `upgrade_restart` when the computed `validUntil` is not strictly after the stored `validUntil`.
16. With the flag on, an injected fulfillment handler or an injected commerce store fails startup with `coinCommercePrerequisiteError`. Production uses the factory.
17. With the flag on, an ordinary or unmanaged purchase still charges the catalog list price through `applyCoinDiscount`.
18. Downgrade fulfillment records the scheduled row and returns before runtime binding resolution. The live entitlement must still match the quote snapshot. `payment_status` must be `captured`.
19. When plan-switch evaluation is not ok, the purchase-eligibility reader returns false. It does not fall through to the legacy same-plan reader.
20. The optional `planSwitch` object includes `chargeUnits`. The state endpoint's `chargeUnits` are the pre-discount policy charge. The quote button uses that number; the dialog charges `amountUnits` after discount.
21. The due applier is attached inside `recoverNonTerminalOrders` only when the flag is on. Flag off does not query the plan-switch tables and does not apply due rows. See Rollback.
22. Plain same-plan renewals without pending credit retain additive command-ref-idempotent delivery, including two separately paid pending renewals. Snapshot-dependent switches and pending-credit consumers serialize against unfinished plan orders before another hold, preventing double use of the credit.
23. The unpublished plan-switch migration now includes `applying`, so its DDL checksum changes. Bind the final checksum before any apply; do not reuse a previous preview checksum or rewrite an already-applied ledger. The original wallet/commerce migrations are unchanged. Production remains unmodified/default-off.

## Manual verification

### Must run in a test environment

Use a temporary SQLite file. Do not point these commands at a shared or production database.

* Flag off: a same-plan quote charges the catalog price and has no `planSwitch` key. A different live plan is `offer_unavailable`. `GET /api/portal/commerce/plan-switch/state` is not registered (404). The marketplace renders the existing buy buttons when the client has no state method or the state request returns 404.
* Flag on, schema applied to the temporary file with `npm run platform:coin-commerce:plan-switch:schema -- --mode apply --db-path <absolute-temp-path> --confirm-migration-id <id> --confirm-ddl-checksum <checksum>`:
  * Basic to plus with 15 days left charges 5 Coins before discount (`upgrade_inplace`), keeps `validFrom`, and keeps used bytes.
  * Basic to yearly restarts `validUntil` at fulfillment time plus 365 days and keeps `validFrom`.
  * Plus to basic inserts one `scheduled` row, leaves the live plan unchanged, and delivers the order without a long-lived pending command.
  * Cancel inside the 3-second window leaves no scheduled row.
  * Confirm after the entitlement drifts returns `plan_switch_state_changed` and does not supersede a pending downgrade.
  * After `effective_at`, quotes return `plan_switch_application_pending` until `applyDueScheduledPlanSwitches` runs; the following tick applies the downgrade on the expired-plan path.
  * Authority flag on, commerce mode `wallet_first_unique_v1`, and an authority row each fail closed with their own 409 code.
  * The state endpoint lists `current_renew`, `upgrade`, and `downgrade` with the charges above. The confirm dialog shows the immediate-upgrade, period-end downgrade, and cancel-pending sentences.
* `npm run platform:coin-commerce:plan-switch:schema -- --mode validate --db-path <absolute-temp-path>` passes after apply and fails closed on a database without the tables.

### Only before go-live

Do not run this section from the implementation worktree. It needs Ethan and a separate Risk A production gate.

* Ethan approves a read-only BWH check of `COINS_COMMERCE_ACCOUNT_RESOURCE_AUTHORITY_ENABLED` (expected unset or false) and `select count(*) from platform_account_resource_authorities` (expected 0). A missing table is 0. A query error stops the launch.
* Schema apply uses the CLI confirm flags against the intended database only after that check. The flag stays off until the gate approves `COINS_COMMERCE_PLAN_SWITCH_ENABLED=true`.
* Startup must refuse when that flag and `COINS_COMMERCE_ACCOUNT_RESOURCE_AUTHORITY_ENABLED` are both true.
* Before any later flag-off rollback, list `status in ('scheduled', 'applying')` rows and finish their runtime delivery while the flag is still on.

## Pre-launch checklist

Test environment, before anyone asks for a production gate:

* [ ] Flag-off purchase, checkout-preview, and marketplace match the current UI and responses.
* [ ] Temporary-database apply, validate, idempotent re-apply, and rollback of an empty scheduled set succeed.
* [ ] Charge examples in the table above match the policy tests, including the 1 ms yearly boundary and the credit-exceeds-price refusal.
* [ ] In-place upgrade preserves used bytes. `upgrade_restart` is refused with `plan_switch_cycle_misaligned` when the usage-window start would move (cycle-guard test).
* [ ] Cancel inside 3 seconds, snapshot drift, due-switch application, and replay are green on a temporary database.
* [ ] Portal state, card labels, disabled reasons, and confirm copy are green in the admin tests.

Only before go-live:

* [ ] Ethan has approved the read-only BWH check: `COINS_COMMERCE_ACCOUNT_RESOURCE_AUTHORITY_ENABLED` unset or false, and `select count(*) from platform_account_resource_authorities` returns 0.
* [ ] A separate Risk A production gate names the database, the migration id, and the DDL checksum before any schema apply.
* [ ] The plan-switch flag and the authority flag are not both enabled.
* [ ] Operators have the flag-off procedure: wait for zero `scheduled` and `applying` rows before disabling the flag, and do not drop the tables while either exists.

## Open points for Ethan

1. Credit for a cancelled pending downgrade (forfeit vs credit, chosen: credit,
   floor charge of 1 Coin, excess forfeited).
2. Yearly upgrade uses term restart (see Expiry handling choice).
3. Over-quota-suspended accounts are not auto-resumed after an upgrade.
4. Up to one coordinator tick of expired service when a downgrade applies.
5. Yearly term-restart upgrades are refused (plan_switch_cycle_misaligned) when the
   usage-window start would move; accept this limitation or ask for a cycle-module change (separate Risk A work).
6. The due-downgrade applier runs only while the flag is on and the schema validates;
   operators must finish scheduled/applying runtime delivery before turning the flag off.
