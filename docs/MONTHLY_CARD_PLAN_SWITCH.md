# Monthly Card Plan Switch (Renew / Upgrade / Downgrade) Design

Last updated: 2026-10-10.

```yaml
document_metadata:
  doc_type: canonical
  lifecycle: active
  authority_scope: monthly_card_plan_switch
  superseded_by: null
  last_verified_at: 2026-10-10
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
status 'scheduled' | 'applied' | 'superseded'
created_at, resolved_at, superseded_by_order_ref
partial unique index: at most one 'scheduled' row per account
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
4. Capture: unchanged. Fulfillment command is created as today.
5. Fulfillment (`execute` in `coin-commerce-production-subscription-fulfillment.mjs`
   + `applyCoinCommerceSubscriptionFulfillment`), by `kind`:
   * `renewal`: existing behaviour; additionally, in the same DB transaction,
     mark the cancelled scheduled switch `superseded`.
   * `upgrade_inplace`: one transaction: CAS update `plan`, `traffic_limit_bytes`
     (new cap), keep `valid_from` and `valid_until`; update the access request
     plan fields; append the audit effect with `switchKind`; supersede a pending
     downgrade if cancelled. Runtime `renewTenant` is called with the unchanged expiry.
   * `upgrade_restart`: same, but `valid_until = now + 365d`, `valid_from` kept.
   * `downgrade_scheduled`: the entitlement is NOT changed. One transaction
     inserts the `scheduled` switch row (`effective_at = snapshot_valid_until`,
     `paid_units`) and returns success, so the order/command become `delivered`
     immediately (no long-lived pending command: the per-account predecessor rule
     in the claim query would otherwise block later renewals).
6. Applying a due downgrade: a small idempotent function
   `applyDueScheduledPlanSwitches(now)` driven by the existing commerce
   coordinator tick. For each `scheduled` row with `effective_at <= now` it calls
   the same fulfillment handler with a synthetic command whose `commandRef` is
   derived deterministically from `switch_ref`, so the existing "different plan
   after expiry" code path applies (new `valid_from = now`, new term, new cap),
   then marks the row `applied` in the same transaction as the entitlement
   effect. Replays hit the existing effect-audit replay branch. Quotes/confirms
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
100 GB - used). Known residual: for `upgrade_restart` the cycle rule changes from
fixed 30-day windows to calendar-month anniversaries of the same anchor; near
a boundary this can shift the window start by at most 2 days. A test pins the
size of this shift; Ethan to accept or reject.
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
* Minimum remaining time for an upgrade quote: 60 minutes, to avoid a quote
  that expires before fulfillment; below that, use renewal.

## Rollback

* Runtime rollback: set `COINS_COMMERCE_PLAN_SWITCH_ENABLED` false and restart
  (flag is read at startup). New quotes revert to the old same-plan-only guard.
  Already applied upgrades remain valid (entitlement rows are normal). Scheduled
  downgrades are paid: before turning the flag off the operator must run the
  read-only listing of `scheduled` rows and either wait for them to apply (the
  due-applier keeps running while the schema is present) or apply them manually
  under a Gate. Do not drop the tables while any `scheduled` row exists.
* Schema rollback (additive only): `drop table platform_scheduled_plan_switches;
  drop table platform_coin_commerce_plan_switch_quotes;` only after exporting
  both tables and confirming zero `scheduled` rows. No existing table changed,
  so no data migration back. Not applied anywhere by this PR.
* Code rollback: revert the PR; with the flag off the old paths are unchanged.

## Migration

New module `server/services/platform/coin-commerce-plan-switch-migrations.mjs`
and CLI `scripts/platform-coin-commerce-plan-switch-schema.mjs`
(`npm run platform:coin-commerce:plan-switch:schema`), mirroring
`platform-account-resource-authority-schema.mjs`: `--dry-run`, `--apply`,
`--validate`; additive `create table if not exists`-equivalent with
validation functions (`validatePlanSwitchSchema`). Nothing is applied by this
PR to any database.

## Portal API and UI

* Server: `GET /api/portal/commerce/plan-switch/state` (only registered when the
  flag is on; 404 otherwise) returns, per published plan offer:
  `{ offerRef, action: 'current_renew'|'upgrade'|'downgrade'|'unavailable',
  chargeUnits, creditUnits, effectiveAt, reasonCode }` plus
  `{ current: { offerRef, validUntil }, pendingSwitch: { toOfferRef, effectiveAt } | null }`.
  `checkout-preview` response gains an optional `planSwitch` object
  (`kind`, `creditUnits`, `effectiveAt`, `cancelsPendingDowngrade`).
* UI (`admin/src/features/user-portal`): `MarketplacePanel` receives the state;
  every plan card shows the current plan + expiry date, a button label by action:
  renew "续费 / Renew", upgrade "升级，补差价 N Coins / Upgrade, pay N Coins",
  downgrade "期末降级 / Downgrade at period end (effective <date>)". Instead
  of the generic "该商品当前不可用。" the new codes have specific copy, e.g.
  "你当前的套餐有效期至 <日期>。该操作暂不支持，请在到期后切换。" The inline
  confirm text must state: "升级立即生效，不退款；降级在当前周期结束后生效，已支付不退款；
  续费或升级会取消待生效的降级". Flag off or endpoint 404: current UI unchanged.

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

## Manual verification

See the PR body checklists: "must run in a test environment" and "pre-launch only".

## Open points for Ethan

1. Credit for a cancelled pending downgrade (forfeit vs credit, chosen: credit,
   floor charge of 1 Coin, excess forfeited).
2. Yearly upgrade uses term restart (see Expiry handling choice).
3. Over-quota-suspended accounts are not auto-resumed after an upgrade.
4. Up to one coordinator tick of expired service when a downgrade applies.