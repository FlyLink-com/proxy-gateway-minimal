# D1 G2-P1 FK + Unique-Index Body Receipt v1

```yaml
document_metadata:
  doc_type: evidence
  lifecycle: active
  authority_scope: d1_g2_p1_fk_unique_index_body_receipt
  superseded_by: null
  last_verified_at: 2026-11-14
  production_authority: false
```

Status: **EVIDENCE COMPLETE for C5-03-01 + C5-03-04 (probe evidence only)**.
This document records probe results only. It does not declare a T2 PASS,
does not authorize production migration, deployment, BWH access, remote
D1/DO access, or production switching. Production remains pr799.

## 0. Verdict summary

| Item | Proven | Total |
| --- | --- | --- |
| FKs (C5-03-01) | 58 | 58 |
| ARA unique indexes (C5-03-04) | 4 | 4 |
| **Total** | **62** | **62** |

- **UNPROVEN: 0. NEEDS-REVIEW: 0.**
- Every item is PROVEN on **both** engines (better-sqlite3 / SQLite and
  local Miniflare D1), with identical per-probe outcomes and identical
  terminal states (full dump of every table, compared byte-for-byte).
- Schema verification PASSED before any probe ran (see §2).
- The strict historical reading is kept: G2's 68 PASS / 58
  attribution-limited FKs are now 68 PASS / **58 PROVEN-by-FK-body**.
  The 7 `platform_coin_commerce_initial_confirmations` FKs, whose
  delete-parent behavior was already proven 7/7 by FK body in stage 3b,
  now also have INSERT and UPDATE FK-body evidence.

## 1. Baselines, versions, hashes

- **Source baseline (branch base)**: master `ba6ca8bc`
  ("docs: M1 contract v0.5 draft (#874)", merged 2026-11-14T15:12:16Z).
  The fixture was first generated at `44d2b02d` (#875) and regenerated
  at `ba6ca8bc` after the docs-only #874 merge; the experiment-schema
  object hash is identical at both baselines (see below).
- **Historical G2 test baseline**: master
  `63082bae5d980c3905d6e7405329b19e6c4e38ac`.
- **Production**: pr799 (unchanged; every merge is source-only).
- **Data**: local synthetic data only. No remote Cloudflare, BWH, or
  production connection was used; no real keys; no production data.

| Artifact | SHA-256 |
| --- | --- |
| `tools/g2-p1/g2-p1-fixture.json` | `63ee5f8ea73f6ade1cc7ee69385b26bfe81e0a651874aa71a7188675add9974a` |
| `tools/g2-p1/g2-p1-results.json` | `3f0e74ece9fab35d19fb02c17997a9e5e46413f1e9cf98d9b2f5f2a1156add88` |
| `tools/g2-p1/g2-p1-ddl-diff.json` | `32179be66b39da43f28f4261c70cf23d66b31114570ec9523d0f6f9391f7c78b` |

| Version | Value |
| --- | --- |
| Node | v22.23.1 |
| better-sqlite3 | 12.10.0 |
| SQLite (better-sqlite3 side) | 3.53.1 |
| Miniflare | 4.20251109.0 |
| workerd | 1.20251109.0 |
| D1 SQLite version | not exposed by D1 (`sqlite_version()` is unauthorized) |

## 2. Schema verification (runner, before any probe)

The runner rebuilds the experiment schema from this checkout's own
migration modules and verifies it against the fixture's frozen values
before running any probe. All checks passed:

- Experiment-schema object SHA-256:
  `e7ae56a774a268f519ef89452ce615449754912788cee31cf9f57288a0e01e1b`
  (228 objects: 74 tables / 94 indexes / 60 triggers after omitting 31).
- Full-schema object SHA-256 (0 omitted, 91 triggers):
  `6e98d3f1c8e5e622f94dd9fa488f54adca4e64e5b34c1207e54fd19ec68b4a70`.
- FK inventory: 127 constraints (128 pragma rows), identical to the
  frozen fixture inventory — the G2 baseline's 126 plus the one new
  `platform_identity_bindings.account_id → platform_accounts(id)` FK
  (see §5 drift note).
- The 4 ARA unique-index SQLs are byte-identical to the frozen values.
- Omission union: 31 triggers, identical to the builder's list; every
  listed trigger existed in the built schema and is absent afterwards.
- Ledger: 19 `platform_schema_migrations` rows.

## 3. Method (guard-aware fixture)

The FK definitions under test are **byte-identical to production DDL by
construction**: the experiment schema is built from this checkout's own
migration modules, through their fail-closed apply entry points, in G2
DAG order plus the Plan C guard step
(`tools/g2-p1/lib/build-control-schema.mjs`). Only the shielding guards
are omitted — and every omitted trigger is **RAISE-only** (verified: no
DML in any trigger body after stripping RAISE calls), so omitting it
cannot change FK / CHECK / UNIQUE semantics. A guard only ever *adds* a
rejection; it never creates a foreign-key, check, or unique violation.

Omitted triggers (31 = the union of the per-item omission lists):

- INSERT guards (10): the three ARA insert guards, the commerce
  authority quote-bindings insert guard, the four deferred-transition
  binding insert guards, the Plan C
  `coin_commerce_initial_confirmations_insert_guard`, and
  `deferred_resource_transitions_initial_state_reserved` (transitions
  effect_* INSERT probes must carry `effect_applied` state, which that
  insert-state guard forbids).
- UPDATE guards (18): `revoke_only_update`, the identity-immutable /
  snapshot-immutable / update-deny guards on receipts, orders, quotes,
  bindings, rebases, allocations, reservations, transitions, payment
  receipts, referral accruals/bindings/origins, scheduled switches, and
  the initial-confirmations immutable guard.
- DELETE guards (3): `account_resource_authorities_delete_deny`,
  `platform_referral_profile_no_delete`,
  `platform_referral_touches_immutable_delete`.

Per-item probes (one fresh SQLite DB + one fresh isolated D1 DB per
item; probes run in this order, delete-parent last because it is
state-changing):

- **FK items** — INSERT an orphan row (expect FK); UPDATE the seed row's
  FK column to an orphan (expect FK; transitions effect_* items use the
  legal two-step state path reserved → processing → effect_applied);
  INSERT a positive control with all FKs real (expect ok); DELETE the
  parent (expect FK refusal, child rows unchanged). The delete census
  (every other FK referencing the same parent row) is recomputed live on
  both engines and compared with the frozen census, so a refusal cannot
  be mis-attributed to the wrong FK.
- **Index items** — P1 seed active row exists; P2 second active row with
  the same key column (expect UNIQUE naming that column); P3 same-key
  revoked row (expect ok — the predicate excludes it); P4 update the
  revoked row back to active (expect UNIQUE naming that column).

An item is PROVEN only if every probe matches its expectation on **both**
engines, the delete counts/census match the frozen values on both
engines, and the terminal states agree. The runner exits non-zero
otherwise. The full per-probe outcomes, error texts, and terminal-state
dumps are in `tools/g2-p1/g2-p1-results.json`.

## 4. Per-item results

Outcome columns (identical on both engines): FK items —
`insert / update / positive / delete`; index items — `p2 / p3 / p4`.
`update` shows `ok+FK` where the legal two-step path was used (first
step ok, second step FK). `census` is the number of FKs referencing the
same parent row (the delete-attribution check).

| ID | FK / index | Outcomes | Census | Verdict |
| --- | --- | --- | --- | --- |
| FK-01 | platform_account_resource_authorities(previous_authority_ref)->platform_account_resource_authorities(authority_ref) | FK / FK / ok / FK | 1 | PROVEN |
| FK-02 | platform_account_resource_authorities(issued_link_id)->platform_issued_subscription_links(id) | FK / FK / ok / FK | 1 | PROVEN |
| FK-03 | platform_account_resource_authorities(entitlement_id)->platform_entitlements(id) | FK / FK / ok / FK | 2 | PROVEN |
| FK-04 | platform_account_resource_authorities(resource_request_id)->platform_issuance_requests(id) | FK / FK / ok / FK | 2 | PROVEN |
| FK-05 | platform_account_resource_authorities(account_id)->platform_accounts(id) | FK / FK / ok / FK | 3 | PROVEN |
| FK-06 | platform_coin_commerce_operation_receipts(account_id)->platform_accounts(id) | FK / FK / ok / FK | 1 | PROVEN |
| FK-07 | platform_coin_commerce_orders(hold_ref)->platform_coin_holds(hold_ref) | FK / FK / ok / FK | 1 | PROVEN |
| FK-08 | platform_coin_commerce_orders(offer_version_ref)->platform_coin_commerce_offer_versions(offer_version_ref) | FK / FK / ok / FK | 2 | PROVEN |
| FK-09 | platform_coin_commerce_orders(quote_ref)->platform_coin_commerce_quotes(quote_ref) | FK / FK / ok / FK | 1 | PROVEN |
| FK-10 | platform_coin_commerce_orders(account_id)->platform_accounts(id) | FK / FK / ok / FK | 3 | PROVEN |
| FK-11 | platform_coin_commerce_plan_switch_quotes(account_id)->platform_accounts(id) | FK / FK / ok / FK | 2 | PROVEN |
| FK-12 | platform_commerce_authority_quote_bindings(account_id,authority_version)->platform_account_resource_authorities(account_id,version) | FK / FK / ok / FK | 1 | PROVEN |
| FK-13 | platform_commerce_authority_quote_bindings(issued_link_id)->platform_issued_subscription_links(id) | FK / FK / ok / FK | 2 | PROVEN |
| FK-14 | platform_commerce_authority_quote_bindings(entitlement_id)->platform_entitlements(id) | FK / FK / ok / FK | 3 | PROVEN |
| FK-15 | platform_commerce_authority_quote_bindings(resource_request_id)->platform_issuance_requests(id) | FK / FK / ok / FK | 3 | PROVEN |
| FK-16 | platform_commerce_authority_quote_bindings(account_id)->platform_accounts(id) | FK / FK / ok / FK | 6 | PROVEN |
| FK-17 | platform_commerce_authority_quote_bindings(authority_ref)->platform_account_resource_authorities(authority_ref) | FK / FK / ok / FK | 1 | PROVEN |
| FK-18 | platform_commerce_authority_quote_bindings(quote_ref)->platform_coin_commerce_quotes(quote_ref) | FK / FK / ok / FK | 1 | PROVEN |
| FK-19 | platform_deferred_resource_transition_operation_receipts(account_id)->platform_accounts(id) | FK / FK / ok / FK | 4 | PROVEN |
| FK-20 | platform_deferred_resource_transition_operation_receipts(transition_ref)->platform_deferred_resource_transitions(transition_ref) | FK / FK / ok / FK | 1 | PROVEN |
| FK-21 | platform_deferred_resource_transition_rebases(effect_issued_link_id)->platform_issued_subscription_links(id) | FK / FK / ok / FK | 2 | PROVEN |
| FK-22 | platform_deferred_resource_transition_rebases(effect_request_id)->platform_issuance_requests(id) | FK / FK / ok / FK | 3 | PROVEN |
| FK-23 | platform_deferred_resource_transition_rebases(effect_entitlement_id)->platform_entitlements(id) | FK / FK / ok / FK | 3 | PROVEN |
| FK-24 | platform_deferred_resource_transition_rebases(account_id)->platform_accounts(id) | FK / FK / ok / FK | 6 | PROVEN |
| FK-25 | platform_deferred_resource_transition_rebases(settled_transition_ref)->platform_deferred_resource_transitions(transition_ref) | FK / FK / ok / FK | 1 | PROVEN |
| FK-26 | platform_deferred_resource_transition_reservation_allocations(lot_ref)->platform_coin_lots(lot_ref) | FK / FK / ok / FK | 2 | PROVEN |
| FK-27 | platform_deferred_resource_transition_reservation_allocations(reservation_ref)->platform_deferred_resource_transition_reservations(reservation_ref) | FK / FK / ok / FK | 1 | PROVEN |
| FK-28 | platform_deferred_resource_transition_reservations(wallet_ref)->platform_coin_wallets(wallet_ref) | FK / FK / ok / FK | 1 | PROVEN |
| FK-29 | platform_deferred_resource_transition_reservations(account_id)->platform_accounts(id) | FK / FK / ok / FK | 2 | PROVEN |
| FK-30 | platform_deferred_resource_transitions(effect_issued_link_id)->platform_issued_subscription_links(id) | FK / ok+FK / ok / FK | 1 | PROVEN |
| FK-31 | platform_deferred_resource_transitions(effect_request_id)->platform_issuance_requests(id) | FK / ok+FK / ok / FK | 2 | PROVEN |
| FK-32 | platform_deferred_resource_transitions(effect_entitlement_id)->platform_entitlements(id) | FK / ok+FK / ok / FK | 2 | PROVEN |
| FK-33 | platform_deferred_resource_transitions(expected_issued_link_id)->platform_issued_subscription_links(id) | FK / FK / ok / FK | 1 | PROVEN |
| FK-34 | platform_deferred_resource_transitions(expected_request_id)->platform_issuance_requests(id) | FK / FK / ok / FK | 2 | PROVEN |
| FK-35 | platform_deferred_resource_transitions(expected_entitlement_id)->platform_entitlements(id) | FK / FK / ok / FK | 2 | PROVEN |
| FK-36 | platform_deferred_resource_transitions(offer_version_ref)->platform_coin_commerce_offer_versions(offer_version_ref) | FK / FK / ok / FK | 1 | PROVEN |
| FK-37 | platform_deferred_resource_transitions(reservation_ref)->platform_deferred_resource_transition_reservations(reservation_ref) | FK / FK / ok / FK | 1 | PROVEN |
| FK-38 | platform_deferred_resource_transitions(account_id)->platform_accounts(id) | FK / FK / ok / FK | 3 | PROVEN |
| FK-39 | platform_payment_receipts(payment_order_ref)->platform_payment_orders(payment_order_ref) | FK / FK / ok / FK | 1 | PROVEN |
| FK-40 | platform_referral_accruals(reward_lot_ref)->platform_coin_lots(lot_ref) | FK / FK / ok / FK | 3 | PROVEN |
| FK-41 | platform_referral_bindings(touch_digest)->platform_referral_touches(token_digest) | FK / FK / ok / FK | 1 | PROVEN |
| FK-42 | platform_referral_bindings(referrer_id)->platform_referral_profiles(account_id) | FK / FK / ok / FK | 2 | PROVEN |
| FK-43 | platform_referral_origins(referrer_id)->platform_referral_profiles(account_id) | FK / FK / ok / FK | 1 | PROVEN |
| FK-44 | platform_referral_origins(payment_order_ref)->platform_payment_orders(payment_order_ref) | FK / FK / ok / FK | 1 | PROVEN |
| FK-45 | platform_referral_origins(lot_ref)->platform_coin_lots(lot_ref) | FK / FK / ok / FK | 2 | PROVEN |
| FK-46 | platform_referral_origins(account_id)->platform_accounts(id) | FK / FK / ok / FK | 1 | PROVEN |
| FK-47 | platform_scheduled_plan_switches(account_id)->platform_accounts(id) | FK / FK / ok / FK | 4 | PROVEN |
| FK-48 | platform_scheduled_plan_switches(switch_ref)->platform_coin_commerce_orders(order_ref) | FK / FK / ok / FK | 1 | PROVEN |
| FK-49 | platform_wallet_first_deferred_checkout_quotes(expected_issued_link_id)->platform_issued_subscription_links(id) | FK / FK / ok / FK | 1 | PROVEN |
| FK-50 | platform_wallet_first_deferred_checkout_quotes(expected_request_id)->platform_issuance_requests(id) | FK / FK / ok / FK | 2 | PROVEN |
| FK-51 | platform_wallet_first_deferred_checkout_quotes(expected_entitlement_id)->platform_entitlements(id) | FK / FK / ok / FK | 2 | PROVEN |
| FK-52 | platform_coin_commerce_initial_confirmations(issued_link_ref)->platform_issued_subscription_links(id) | FK / FK / ok / FK | 1 | PROVEN |
| FK-53 | platform_coin_commerce_initial_confirmations(entitlement_ref)->platform_entitlements(id) | FK / FK / ok / FK | 2 | PROVEN |
| FK-54 | platform_coin_commerce_initial_confirmations(resource_request_ref)->platform_issuance_requests(id) | FK / FK / ok / FK | 2 | PROVEN |
| FK-55 | platform_coin_commerce_initial_confirmations(effect_ref)->platform_audit_events(id) | FK / FK / ok / FK | 1 | PROVEN |
| FK-56 | platform_coin_commerce_initial_confirmations(account_id)->platform_accounts(id) | FK / FK / ok / FK | 7 | PROVEN |
| FK-57 | platform_coin_commerce_initial_confirmations(order_ref)->platform_coin_commerce_orders(order_ref) | FK / FK / ok / FK | 2 | PROVEN |
| FK-58 | platform_coin_commerce_initial_confirmations(command_ref)->platform_coin_commerce_fulfillment_commands(command_ref) | FK / FK / ok / FK | 1 | PROVEN |
| IDX-01 | account_resource_authorities_active_account_uidx on platform_account_resource_authorities(account_id) WHERE status='active' | UNIQUE / ok / UNIQUE | — | PROVEN |
| IDX-02 | account_resource_authorities_active_entitlement_uidx on platform_account_resource_authorities(entitlement_id) WHERE status='active' | UNIQUE / ok / UNIQUE | — | PROVEN |
| IDX-03 | account_resource_authorities_active_link_uidx on platform_account_resource_authorities(issued_link_id) WHERE status='active' | UNIQUE / ok / UNIQUE | — | PROVEN |
| IDX-04 | account_resource_authorities_active_request_uidx on platform_account_resource_authorities(resource_request_id) WHERE status='active' | UNIQUE / ok / UNIQUE | — | PROVEN |

## 5. Attribution notes (read before reusing an item)

- **Shared-attribution delete censuses.** Several parent rows are
  referenced by more than one FK (census > 1 in §4). The census is
  recorded per item and recomputed live on both engines; a delete
  refusal is attributed to the tested FK only together with its census.
  The largest censuses are the lineage parents (`ent-1`, `req-1`,
  `link-1`), each referenced by the transitions effect_*/expected_* FKs,
  the bindings FKs, and the quote FKs.
- **FK-01 (ARA self-FK).** The seed row's `previous_authority_ref` is
  NULL, so the delete-parent probe targets `auth-1` through the extra
  revoked row `auth-2` (`previous_authority_ref = 'auth-1'`), whose
  census is 1. The insert/update probes use a revoked clone
  (`status = 'revoked'`, version 1000004) so the partial unique indexes
  do not interfere.
- **FK-30..FK-32 (transitions effect_*).** The UPDATE probe uses the
  legal two-step state path (reserved → processing → effect_applied);
  the first step succeeds, the second is refused with FK. The INSERT
  probes carry the `effect_applied` shape and required omitting
  `deferred_resource_transitions_initial_state_reserved` (recorded in
  the item's omission list).
- **FK-52..FK-58 (initial confirmations).** The orphan INSERTs were
  re-derived with the clone machinery instead of using the stage-3b
  variant SQLs verbatim: those SQLs copy conf-1's unique FK columns
  (`command_ref`, `order_ref`, `effect_ref`), which collide with UNIQUE
  once the insert guard is omitted (in stage 3b the guard masked the
  collision). The re-derived clones repoint the non-tested unique FK
  columns to second existing parents (`cmd-1`, `order-1`, `audit-2`)
  and mutate the 64-hex digests by flipping the last hex digit (a
  suffixed mutation would break the digest CHECKs). The UPDATE and
  DELETE SQLs are verbatim from the stage-3b variant receipt; the
  delete-parent 7/7 FK evidence from stage 3b is re-confirmed here.
- **Positive controls on unique FK columns.** Where the tested column
  itself is UNIQUE (orders `hold_ref`/`quote_ref`, bindings
  `quote_ref`, rebases `settled_transition_ref`, transitions
  `reservation_ref`, origins `payment_order_ref`/`lot_ref`/
  `account_id`, switches `switch_ref`, confirmations `effect_ref`/
  `order_ref`/`command_ref`), the positive control repoints that column
  to a second existing parent — exactly like the violation clone's
  sentinel serves as a fresh value. Without the repoint the positive
  control would collide with the seed row on the tested column itself.
- **Referral bindings (FK-41/FK-42).** The bindings null-pair CHECK
  (`(referrer_id is null) = (touch_digest is null)`) is satisfied by
  companion overrides: testing one side sets the other side to a real
  existing value. **Correction of a prior working note:** the touches
  table's `token_digest` carries **no** 64-hex format CHECK (verified
  by reading the DDL: `token_digest text not null primary key`); the
  orphan sentinel `missing-fk-ref` yields FK on both engines, which is
  itself the evidence that no format CHECK intercepts it.
- **Seed shapes.** Transitions/quotes probes use the B-shape
  (`scheduled_switch`, `expected_*` non-null) where the flow CHECK
  requires it, and the A-shape (`initial_activation`, `expected_*`
  NULL) otherwise; the positive control uses the seed shape so it cannot
  steal a unique value the delete setup later needs (this fixed the
  FK-49..FK-51 `transition_ref` collision found during fixture trials).

## 6. Drift note (out of scope, recorded not probed)

- One FK exists at `ba6ca8bc` that did not exist in the G2 baseline:
  `platform_identity_bindings.account_id → platform_accounts(id)`
  (RESTRICT / NO ACTION, from B2-2 / PR #867). It is **outside** the
  G2-58 scope and is **not** probed here; it is recorded in
  `tools/g2-p1/g2-p1-ddl-diff.json` (added: 4 tables + 6 indexes, all
  from B2-2/B2-4c; removed: 0; changed: 1 trigger text = the Plan C
  guard). The 4 ARA unique indexes are byte-identical to the G2
  baseline.

## 7. D1 notes (verified while building this probe)

- D1 error texts (single-statement `run()`): `D1_ERROR: FOREIGN KEY
  constraint failed: SQLITE_CONSTRAINT`, `D1_ERROR: UNIQUE constraint
  failed: <table>.<col>: SQLITE_CONSTRAINT`, `D1_ERROR: CHECK
  constraint failed: ...`. The signature matcher recognises all three.
- **Miniflare `:memory:` D1 bindings are NOT isolated**: every
  `":memory:"` binding in one Miniflare shares the same underlying
  database (a second item's DDL build fails with "table ... already
  exists"). This probe uses named databases (`g2-p1-<i>`) with a
  persist dir, the G2 spike's proven pattern; the runner wipes the dir
  on each run.
- **Miniflare needs the proxy env vars cleared** (it talks to workerd
  over localhost; with the egress proxy set, startup hangs). See §8.
- D1 does not expose its SQLite version (`sqlite_version()` is
  unauthorized); the Miniflare + workerd versions are recorded instead.

## 8. Reproducible commands

```sh
# from the repo root, on branch test/g2-p1-fk-unique-index-body-20261114
cd tools/g2-p1
npm ci            # pinned better-sqlite3 12.10.0 + miniflare 4.20251109.0
env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy npm run probe
# -> node g2-p1-run.mjs ; writes g2-p1-results.json ; exit 0 iff all 62 PROVEN
#    and the schema verification passed.
npm run probe:sqlite-only   # SQLite side only (fast smoke test, not a substitute)
```

Expected output (this run):

```text
=== SUMMARY === 62/62 PROVEN (fk 58/58, idx 4/4); verification PASSED; results sha256 3f0e74ece9fab35d19fb02c17997a9e5e46413f1e9cf98d9b2f5f2a1156add88
```

## 9. Non-goals and next gate

- **Non-goals**: no production DDL or migration is modified; no BWH /
  remote D1 / DO access; no real keys; local synthetic data only. This
  probe covers C5-03-01 + C5-03-04 only. The 18 CHECKs (G2-P2) and
  concurrent pagination (G2-P3) are separate probes, in that order.
  G2-P4 (archive fixture) starts only after Yi confirms Archive is in
  target scope.
- **Next gate**: independent review (fresh reviewer, exact head), then
  Ready + merge only on Yi's separate authorization. Merge is
  source-only; production stays pr799. This receipt does not close
  C5-03 (the probe evidence it records is complete, but C5-03's
  disposition also covers items 02/03/08 and the P2/P3 probes), and it
  does not give a T2 PASS.
