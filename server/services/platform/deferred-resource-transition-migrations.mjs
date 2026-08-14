import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync
} from "node:fs";
import { tmpdir } from "node:os";
import {
  isAbsolute,
  join,
  relative,
  resolve,
  sep
} from "node:path";
import Database from "better-sqlite3";

import {
  COIN_COMMERCE_MIGRATIONS,
  REQUIRED_COIN_COMMERCE_MIGRATION_ID,
  inspectCoinCommerceSchema
} from "./coin-commerce-migrations.mjs";
import {
  COIN_WALLET_MIGRATIONS,
  REQUIRED_COIN_WALLET_MIGRATION_ID,
  inspectCoinWalletSchema
} from "./coin-wallet-migrations.mjs";

export const LEGACY_DEFERRED_RESOURCE_TRANSITION_MIGRATION_ID =
  "20260813_002_deferred_resource_transitions";
export const DEFERRED_RESOURCE_TRANSITION_RISK_A_GATES_MIGRATION_ID =
  "20260814_003_deferred_resource_transition_risk_a_gates";
export const REQUIRED_DEFERRED_RESOURCE_TRANSITION_MIGRATION_ID =
  DEFERRED_RESOURCE_TRANSITION_RISK_A_GATES_MIGRATION_ID;

const TRANSITIONS_TABLE = "platform_deferred_resource_transitions";
const RESERVATIONS_TABLE =
  "platform_deferred_resource_transition_reservations";
const RESERVATION_ALLOCATIONS_TABLE =
  "platform_deferred_resource_transition_reservation_allocations";
const OPERATION_RECEIPTS_TABLE =
  "platform_deferred_resource_transition_operation_receipts";
const EVENTS_TABLE = "platform_deferred_resource_transition_events";
const REBASES_TABLE = "platform_deferred_resource_transition_rebases";
const ACTIVE_ACCOUNT_INDEX =
  "platform_deferred_resource_transitions_one_active_account_idx";
const RESERVED_CLAIM_INDEX =
  "platform_deferred_resource_transitions_reserved_claim_idx";
const RECEIPTS_REPLAY_INDEX =
  "platform_deferred_resource_transition_operation_receipts_replay_idx";
const EVENTS_PAGE_INDEX =
  "platform_deferred_resource_transition_events_page_idx";
const REBASE_PENDING_CLAIM_INDEX =
  "platform_deferred_resource_transition_rebases_pending_claim_idx";

/**
 * The deferred store owns this reservation boundary. It deliberately does not
 * reuse a generic Commerce reservation: a dedicated participant must claim,
 * settle, or release it under the deferred-transition protocol. `order_ref`
 * remains an opaque immutable deferred-order identifier with no
 * ordinary-Commerce FK. Deadline values are derived from the bound transition,
 * never supplied as an independent reservation mutation. A rebase caller owns
 * one `BEGIN IMMEDIATE` transaction, updates that transition first, then
 * applies the validated reservation snapshot update.
 */
export const DEFERRED_RESOURCE_TRANSITION_RESERVATION_SCHEMA = Object.freeze({
  reservationTable: RESERVATIONS_TABLE,
  reservationRefColumn: "reservation_ref",
  transitionTable: TRANSITIONS_TABLE,
  transitionOrderRefColumn: "order_ref",
  sourceTypeColumn: "source_type",
  sourceRefColumn: "source_ref",
  sourceRefBindsTransitionRef: true,
  activationAtColumn: "activation_at",
  expiresAtColumn: "expires_at",
  reservationRebaseGenerationColumn: "rebase_generation",
  sourceIdentityUnique: true,
  orderRefImmutable: true,
  deadlineRebaseContract: Object.freeze({
    transitionScheduleColumn: "scheduled_for",
    transitionGenerationColumn: "rebase_generation",
    activationMatchesSchedule: true,
    recoveryGraceHours: 24,
    extendsOnly: true,
    atomic: true,
    callerOwnsBeginImmediateTransaction: true,
    transitionUpdatedFirst: true,
    automaticTransitionUpdate: false
  }),
  effectSuccessorSnapshotColumns: Object.freeze([
    "effect_entitlement_id",
    "effect_request_id",
    "effect_issued_link_id",
    "effect_valid_until"
  ]),
  allocationTable: RESERVATION_ALLOCATIONS_TABLE,
  allocationRefColumn: "allocation_ref",
  lotRefColumn: "lot_ref",
  coinTypeSnapshotColumn: "coin_type_snapshot",
  amountUnitsColumn: "amount_units",
  lotExpiresAtSnapshotColumn: "lot_expires_at_snapshot",
  allocationDeadlineCheck:
    "bonus_lot_expires_at_after_reservation_expires_at",
  stateColumn: "state",
  leaseColumns: Object.freeze([
    "lease_generation",
    "lease_token",
    "lease_until"
  ]),
  lotExpiryChecks: Object.freeze({
    reserve: "bonus_lot_expires_at_after_reservation_expires_at",
    claim: "live_lot_binding_matches_snapshot",
    preCapture: "live_lot_binding_matches_snapshot_and_not_expired",
    rebase: "release_or_requote_if_live_lot_expiry_invalid"
  }),
  allocationImmutable: true
});

/**
 * A settled transition writes this durable outbox in the same immediate
 * transaction that captures its Coins and enters `settled`. Consumers claim
 * this table rather than retaining an in-memory rebase queue, so a process
 * crash cannot silently lose a required scheduled-switch rebase.
 */
export const DEFERRED_RESOURCE_TRANSITION_REBASE_OUTBOX_SCHEMA = Object.freeze({
  table: REBASES_TABLE,
  settledTransitionRefColumn: "settled_transition_ref",
  accountIdColumn: "account_id",
  effectRefColumn: "effect_ref",
  effectSuccessorSnapshotColumns: Object.freeze([
    "effect_entitlement_id",
    "effect_request_id",
    "effect_issued_link_id",
    "effect_valid_until"
  ]),
  stateColumn: "state",
  states: Object.freeze([
    "pending",
    "processing",
    "completed",
    "reconciliation_required"
  ]),
  leaseColumns: Object.freeze([
    "lease_generation",
    "lease_token",
    "lease_until"
  ]),
  safeCodeColumn: "safe_code",
  createdAtColumn: "created_at",
  updatedAtColumn: "updated_at",
  completedAtColumn: "completed_at",
  keyedBySettledTransition: true,
  transitionSettleRequiresPendingOutbox: true,
  claimIndex: REBASE_PENDING_CLAIM_INDEX
});

const MIGRATION_STATEMENTS = Object.freeze([
  `
    create table ${RESERVATIONS_TABLE} (
      reservation_ref text primary key,
      account_id text not null references platform_accounts(id),
      wallet_ref text not null references platform_coin_wallets(wallet_ref),
      source_type text not null,
      source_ref text not null,
      amount_units integer not null check (
        typeof(amount_units) = 'integer'
        and amount_units between 1 and 9007199254740991
      ),
      activation_at text not null,
      expires_at text not null check (expires_at > activation_at),
      rebase_generation integer not null default 0 check (
        typeof(rebase_generation) = 'integer'
        and rebase_generation between 0 and 2147483647
      ),
      state text not null check (state in (
        'reserved', 'processing', 'captured', 'released',
        'reconciliation_required'
      )),
      lease_generation integer not null default 0 check (
        typeof(lease_generation) = 'integer'
        and lease_generation between 0 and 2147483647
      ),
      lease_token text,
      lease_until text,
      created_at text not null,
      updated_at text not null,
      check (
        (
          state = 'reserved'
          and lease_token is null
          and lease_until is null
        )
        or
        (
          state = 'processing'
          and lease_token is not null
          and lease_until is not null
        )
        or
        (
          state in ('captured', 'released', 'reconciliation_required')
          and lease_token is null
          and lease_until is null
        )
      ),
      unique (source_type, source_ref)
    )
  `,
  `
    create table ${RESERVATION_ALLOCATIONS_TABLE} (
      allocation_ref text primary key,
      reservation_ref text not null
        references ${RESERVATIONS_TABLE}(reservation_ref),
      lot_ref text not null references platform_coin_lots(lot_ref),
      coin_type_snapshot text not null check (coin_type_snapshot in (
        'paid_coins', 'bonus_coins', 'reward_coins'
      )),
      allocation_sequence integer not null check (
        typeof(allocation_sequence) = 'integer' and allocation_sequence > 0
      ),
      amount_units integer not null check (
        typeof(amount_units) = 'integer'
        and amount_units between 1 and 9007199254740991
      ),
      lot_expires_at_snapshot text,
      created_at text not null,
      unique (reservation_ref, lot_ref),
      unique (reservation_ref, allocation_sequence)
    )
  `,
  `
    create table ${TRANSITIONS_TABLE} (
      transition_ref text primary key,
      account_id text not null references platform_accounts(id),
      order_ref text not null unique,
      reservation_ref text not null unique
        references ${RESERVATIONS_TABLE}(reservation_ref),
      offer_version_ref text not null
        references platform_coin_commerce_offer_versions(offer_version_ref),
      commercial_model text not null
        check (commercial_model = 'wallet_first_unique_v1'),
      flow_kind text not null
        check (flow_kind in ('initial_activation', 'scheduled_switch')),
      plan_rank integer not null check (
        typeof(plan_rank) = 'integer' and plan_rank between 1 and 3
      ),
      amount_units integer not null check (
        typeof(amount_units) = 'integer'
        and amount_units between 1 and 9007199254740991
      ),
      offer_snapshot_json text not null check (
        json_valid(offer_snapshot_json)
        and json_type(offer_snapshot_json) = 'object'
      ),
      allocation_snapshot_json text not null check (
        json_valid(allocation_snapshot_json)
        and json_type(allocation_snapshot_json) = 'array'
      ),
      reserved_at text not null,
      scheduled_for text not null,
      expected_entitlement_id text
        references platform_entitlements(id),
      expected_request_id text
        references platform_issuance_requests(id),
      expected_issued_link_id text
        references platform_issued_subscription_links(id),
      expected_valid_until text,
      rebase_generation integer not null default 0 check (
        typeof(rebase_generation) = 'integer'
        and rebase_generation between 0 and 2147483647
      ),
      state text not null check (state in (
        'reserved', 'processing', 'effect_applied', 'settled',
        'requote_required', 'cancelled', 'reconciliation_required'
      )),
      lease_generation integer not null default 0 check (
        typeof(lease_generation) = 'integer'
        and lease_generation between 0 and 2147483647
      ),
      lease_token text,
      lease_until text,
      effect_ref text,
      effect_entitlement_id text references platform_entitlements(id),
      effect_request_id text references platform_issuance_requests(id),
      effect_issued_link_id text references platform_issued_subscription_links(id),
      effect_valid_until text,
      safe_code text,
      settled_at text,
      created_at text not null,
      updated_at text not null,
      check (
        (
          flow_kind = 'initial_activation'
          and expected_entitlement_id is null
          and expected_request_id is null
          and expected_issued_link_id is null
          and expected_valid_until is null
        )
        or
        (
          flow_kind = 'scheduled_switch'
          and expected_entitlement_id is not null
          and expected_request_id is not null
          and expected_issued_link_id is not null
          and expected_valid_until is not null
        )
      ),
      check (
        (
          state = 'reserved'
          and lease_token is null
          and lease_until is null
          and effect_ref is null
          and effect_entitlement_id is null
          and effect_request_id is null
          and effect_issued_link_id is null
          and effect_valid_until is null
          and safe_code is null
          and settled_at is null
        )
        or
        (
          state = 'processing'
          and lease_token is not null
          and lease_until is not null
          and effect_ref is null
          and effect_entitlement_id is null
          and effect_request_id is null
          and effect_issued_link_id is null
          and effect_valid_until is null
          and safe_code is null
          and settled_at is null
        )
        or
        (
          state = 'effect_applied'
          and lease_token is not null
          and lease_until is not null
          and effect_ref is not null
          and effect_entitlement_id is not null
          and effect_request_id is not null
          and effect_issued_link_id is not null
          and effect_valid_until is not null
          and safe_code is null
          and settled_at is null
        )
        or
        (
          state = 'settled'
          and lease_token is null
          and lease_until is null
          and effect_ref is not null
          and effect_entitlement_id is not null
          and effect_request_id is not null
          and effect_issued_link_id is not null
          and effect_valid_until is not null
          and safe_code is null
          and settled_at is not null
        )
        or
        (
          state = 'requote_required'
          and lease_token is null
          and lease_until is null
          and effect_ref is null
          and effect_entitlement_id is null
          and effect_request_id is null
          and effect_issued_link_id is null
          and effect_valid_until is null
          and safe_code is not null
          and settled_at is null
        )
        or
        (
          state = 'cancelled'
          and lease_token is null
          and lease_until is null
          and effect_ref is null
          and effect_entitlement_id is null
          and effect_request_id is null
          and effect_issued_link_id is null
          and effect_valid_until is null
          and safe_code is null
          and settled_at is null
        )
        or
        (
          state = 'reconciliation_required'
          and lease_token is null
          and lease_until is null
          and safe_code is not null
          and (
            (
              effect_ref is null
              and effect_entitlement_id is null
              and effect_request_id is null
              and effect_issued_link_id is null
              and effect_valid_until is null
            )
            or
            (
              effect_ref is not null
              and effect_entitlement_id is not null
              and effect_request_id is not null
              and effect_issued_link_id is not null
              and effect_valid_until is not null
            )
          )
        )
      )
    )
  `,
  `
    create table ${OPERATION_RECEIPTS_TABLE} (
      operation_ref text primary key,
      transition_ref text not null references ${TRANSITIONS_TABLE}(transition_ref),
      account_id text not null references platform_accounts(id),
      actor_scope text not null,
      operation_type text not null check (operation_type in (
        'reserve_transition', 'claim_transition', 'record_effect',
        'settle_transition', 'rebase_transition', 'cancel_transition',
        'require_requote', 'reconcile_transition'
      )),
      idempotency_key text not null,
      request_digest text not null,
      status text not null check (status in ('started', 'succeeded', 'failed')),
      result_ref text,
      safe_result_code text,
      created_at text not null,
      completed_at text,
      unique (actor_scope, operation_type, idempotency_key),
      check (
        (
          status = 'started'
          and result_ref is null
          and safe_result_code is null
          and completed_at is null
        )
        or
        (
          status = 'succeeded'
          and result_ref is not null
          and safe_result_code is null
          and completed_at is not null
        )
        or
        (
          status = 'failed'
          and result_ref is null
          and safe_result_code is not null
          and completed_at is not null
        )
      )
    )
  `,
  `
    create table ${EVENTS_TABLE} (
      event_ref text primary key,
      transition_ref text not null references ${TRANSITIONS_TABLE}(transition_ref),
      event_type text not null check (event_type in (
        'transition_reserved', 'transition_claimed',
        'resource_effect_applied', 'transition_settled',
        'transition_rebased', 'transition_requote_required',
        'transition_cancelled', 'transition_reconciliation_required'
      )),
      safe_code text,
      actor_type text not null check (
        actor_type in ('portal_user', 'commerce_system')
      ),
      actor_ref text not null,
      occurred_at text not null,
      check (
        (
          event_type in (
            'transition_requote_required',
            'transition_reconciliation_required'
          )
          and safe_code is not null
        )
        or
        (
          event_type not in (
            'transition_requote_required',
            'transition_reconciliation_required'
          )
          and safe_code is null
        )
      )
    )
  `,
  `
    create table ${REBASES_TABLE} (
      settled_transition_ref text primary key
        references ${TRANSITIONS_TABLE}(transition_ref),
      account_id text not null references platform_accounts(id),
      effect_ref text not null unique,
      effect_entitlement_id text not null references platform_entitlements(id),
      effect_request_id text not null references platform_issuance_requests(id),
      effect_issued_link_id text not null
        references platform_issued_subscription_links(id),
      effect_valid_until text not null,
      state text not null check (state in (
        'pending', 'processing', 'completed', 'reconciliation_required'
      )),
      lease_generation integer not null default 0 check (
        typeof(lease_generation) = 'integer'
        and lease_generation between 0 and 2147483647
      ),
      lease_token text,
      lease_until text,
      safe_code text,
      created_at text not null,
      updated_at text not null,
      completed_at text,
      check (
        (
          state = 'pending'
          and lease_token is null
          and lease_until is null
          and safe_code is null
          and completed_at is null
        )
        or
        (
          state = 'processing'
          and lease_token is not null
          and lease_until is not null
          and safe_code is null
          and completed_at is null
        )
        or
        (
          state = 'completed'
          and lease_token is null
          and lease_until is null
          and safe_code is null
          and completed_at is not null
        )
        or
        (
          state = 'reconciliation_required'
          and lease_token is null
          and lease_until is null
          and safe_code is not null
          and completed_at is null
        )
      )
    )
  `,
  `
    create unique index ${ACTIVE_ACCOUNT_INDEX}
      on ${TRANSITIONS_TABLE}(account_id)
      where state in ('processing', 'effect_applied')
  `,
  `
    create index ${RESERVED_CLAIM_INDEX}
      on ${TRANSITIONS_TABLE}(
        scheduled_for, plan_rank desc, reserved_at, transition_ref
      )
      where state = 'reserved'
  `,
  `
    create index ${RECEIPTS_REPLAY_INDEX}
      on ${OPERATION_RECEIPTS_TABLE}(
        actor_scope, operation_type, idempotency_key
      )
  `,
  `
    create index ${EVENTS_PAGE_INDEX}
      on ${EVENTS_TABLE}(transition_ref, occurred_at desc, event_ref desc)
  `,
  `
    create index ${REBASE_PENDING_CLAIM_INDEX}
      on ${REBASES_TABLE}(created_at, settled_transition_ref)
      where state = 'pending'
  `,
  `
    create trigger deferred_resource_transition_events_immutable_update
    before update on ${EVENTS_TABLE}
    begin
      select raise(abort, 'deferred_resource_transition_event_immutable');
    end
  `,
  `
    create trigger deferred_resource_transition_events_immutable_delete
    before delete on ${EVENTS_TABLE}
    begin
      select raise(abort, 'deferred_resource_transition_event_immutable');
    end
  `,
  `
    create trigger deferred_resource_transition_rebases_transition_binding_insert
    before insert on ${REBASES_TABLE}
    when
      new.state <> 'pending'
      or new.lease_generation <> 0
      or not exists (
        select 1 from ${TRANSITIONS_TABLE}
         where transition_ref = new.settled_transition_ref
           and account_id = new.account_id
           and effect_ref = new.effect_ref
           and effect_entitlement_id = new.effect_entitlement_id
           and effect_request_id = new.effect_request_id
           and effect_issued_link_id = new.effect_issued_link_id
           and effect_valid_until = new.effect_valid_until
           and state in ('effect_applied', 'settled')
      )
    begin
      select raise(abort, 'deferred_resource_transition_rebase_transition_binding');
    end
  `,
  `
    create trigger deferred_resource_transition_rebases_state_transition
    before update of state on ${REBASES_TABLE}
    when
      new.state <> old.state
      and not (
        (
          old.state = 'pending'
          and new.state in ('processing', 'reconciliation_required')
        )
        or
        (
          old.state = 'processing'
          and new.state in (
            'pending', 'completed', 'reconciliation_required'
          )
        )
      )
    begin
      select raise(abort, 'deferred_resource_transition_rebase_state_transition');
    end
  `,
  `
    create trigger deferred_resource_transition_rebases_lease_cas_update
    before update of state, lease_generation, lease_token, lease_until
    on ${REBASES_TABLE}
    when not (
      (
        old.state = 'pending'
        and new.state = 'processing'
        and new.lease_generation = old.lease_generation + 1
        and new.lease_token is not null
        and new.lease_until is not null
      )
      or
      (
        old.state = 'pending'
        and new.state = 'reconciliation_required'
        and new.lease_generation = old.lease_generation
        and new.lease_token is null
        and new.lease_until is null
      )
      or
      (
        old.state = 'processing'
        and new.state in ('pending', 'completed', 'reconciliation_required')
        and new.lease_generation = old.lease_generation
        and new.lease_token is null
        and new.lease_until is null
      )
      or
      (
        old.state = 'processing'
        and new.state = 'processing'
        and new.lease_generation = old.lease_generation
        and new.lease_token = old.lease_token
        and new.lease_until > old.lease_until
      )
      or
      (
        old.state = new.state
        and new.lease_generation = old.lease_generation
        and new.lease_token is old.lease_token
        and new.lease_until is old.lease_until
      )
    )
    begin
      select raise(abort, 'deferred_resource_transition_rebase_lease_cas');
    end
  `,
  `
    create trigger deferred_resource_transition_rebases_identity_immutable_update
    before update of
      settled_transition_ref,
      account_id,
      effect_ref,
      effect_entitlement_id,
      effect_request_id,
      effect_issued_link_id,
      effect_valid_until,
      created_at
    on ${REBASES_TABLE}
    begin
      select raise(abort, 'deferred_resource_transition_rebase_identity_immutable');
    end
  `,
  `
    create trigger deferred_resource_transition_rebases_terminal_immutable_update
    before update of
      state,
      lease_generation,
      lease_token,
      lease_until,
      safe_code,
      updated_at,
      completed_at
    on ${REBASES_TABLE}
    when old.state in ('completed', 'reconciliation_required')
    begin
      select raise(abort, 'deferred_resource_transition_rebase_terminal_immutable');
    end
  `,
  `
    create trigger deferred_resource_transition_reservations_state_transition
    before update of state on ${RESERVATIONS_TABLE}
    when
      new.state <> old.state
      and not (
        (
          old.state = 'reserved'
          and new.state in ('processing', 'released', 'reconciliation_required')
        )
        or
        (
          old.state = 'processing'
          and new.state in ('reserved', 'captured', 'reconciliation_required')
        )
        or
        (
          old.state in ('captured', 'released')
          and new.state = 'reconciliation_required'
        )
      )
    begin
      select raise(abort, 'deferred_resource_transition_reservation_state_transition');
    end
  `,
  `
    create trigger deferred_resource_transition_reservations_transition_binding_state
    before update of state on ${RESERVATIONS_TABLE}
    when
      new.state in ('processing', 'captured')
      and not exists (
        select 1 from ${TRANSITIONS_TABLE}
         where transition_ref = old.source_ref
           and reservation_ref = old.reservation_ref
           and account_id = old.account_id
           and amount_units = old.amount_units
           and scheduled_for = old.activation_at
           and rebase_generation = old.rebase_generation
      )
    begin
      select raise(abort, 'deferred_resource_transition_reservation_transition_binding');
    end
  `,
  `
    create trigger deferred_resource_transition_reservations_identity_immutable_update
    before update of
      reservation_ref,
      account_id,
      wallet_ref,
      source_type,
      source_ref,
      amount_units,
      created_at
    on ${RESERVATIONS_TABLE}
    begin
      select raise(abort, 'deferred_resource_transition_reservation_identity_immutable');
    end
  `,
  `
    create trigger deferred_resource_transition_reservations_rebase_binding_update
    before update of activation_at, expires_at, rebase_generation
    on ${RESERVATIONS_TABLE}
    when
      (
        new.activation_at is not old.activation_at
        or
        new.expires_at is not old.expires_at
        or new.rebase_generation <> old.rebase_generation
      )
      and not (
        old.state = 'reserved'
        and new.state = 'reserved'
        and new.activation_at > old.activation_at
        and new.expires_at > old.expires_at
        and new.expires_at = strftime(
          '%Y-%m-%dT%H:%M:%fZ', julianday(new.activation_at) + 1
        )
        and new.rebase_generation = old.rebase_generation + 1
        and exists (
          select 1 from ${TRANSITIONS_TABLE}
           where reservation_ref = old.reservation_ref
             and transition_ref = old.source_ref
             and state = 'reserved'
             and scheduled_for = new.activation_at
             and rebase_generation = new.rebase_generation
        )
      )
    begin
      select raise(abort, 'deferred_resource_transition_reservation_rebase_binding');
    end
  `,
  `
    create trigger deferred_resource_transition_reservations_terminal_immutable_update
    before update of
      state,
      lease_generation,
      lease_token,
      lease_until,
      updated_at
    on ${RESERVATIONS_TABLE}
    when
      old.state in ('captured', 'released', 'reconciliation_required')
      and not (
        old.state in ('captured', 'released')
        and new.state = 'reconciliation_required'
      )
    begin
      select raise(abort, 'deferred_resource_transition_reservation_terminal_immutable');
    end
  `,
  `
    create trigger deferred_resource_transition_reservation_allocations_immutable_update
    before update on ${RESERVATION_ALLOCATIONS_TABLE}
    begin
      select raise(abort, 'deferred_resource_transition_reservation_allocation_immutable');
    end
  `,
  `
    create trigger deferred_resource_transition_reservation_allocations_immutable_delete
    before delete on ${RESERVATION_ALLOCATIONS_TABLE}
    begin
      select raise(abort, 'deferred_resource_transition_reservation_allocation_immutable');
    end
  `,
  `
    create trigger deferred_resource_transition_reservation_allocations_snapshot_binding_insert
    before insert on ${RESERVATION_ALLOCATIONS_TABLE}
    when not exists (
      select 1
        from ${RESERVATIONS_TABLE} as reservation
        join platform_coin_lots as lot on lot.lot_ref = new.lot_ref
       where reservation.reservation_ref = new.reservation_ref
         and lot.wallet_ref = reservation.wallet_ref
         and lot.coin_type = new.coin_type_snapshot
         and lot.expires_at is new.lot_expires_at_snapshot
         and (
           (
             new.coin_type_snapshot = 'bonus_coins'
             and new.lot_expires_at_snapshot > reservation.expires_at
           )
           or
           (
             new.coin_type_snapshot in ('paid_coins', 'reward_coins')
             and new.lot_expires_at_snapshot is null
           )
         )
    )
    begin
      select raise(abort, 'deferred_resource_transition_reservation_allocation_snapshot_binding');
    end
  `,
  `
    create trigger deferred_resource_transitions_state_transition
    before update of state on ${TRANSITIONS_TABLE}
    when
      new.state <> old.state
      and not (
        (
          old.state = 'reserved'
          and new.state in (
            'processing', 'requote_required', 'cancelled',
            'reconciliation_required'
          )
        )
        or
        (
          old.state = 'processing'
          and new.state in (
            'reserved', 'effect_applied', 'reconciliation_required'
          )
        )
        or
        (
          old.state = 'effect_applied'
          and new.state in ('settled', 'reconciliation_required')
        )
        or
        (
          old.state in ('settled', 'requote_required', 'cancelled')
          and new.state = 'reconciliation_required'
        )
      )
    begin
      select raise(abort, 'deferred_resource_transition_state_transition');
    end
  `,
  `
    create trigger deferred_resource_transitions_settled_rebase_outbox_binding
    before update of state on ${TRANSITIONS_TABLE}
    when
      old.state = 'effect_applied'
      and new.state = 'settled'
      and not exists (
        select 1 from ${REBASES_TABLE}
         where settled_transition_ref = new.transition_ref
           and account_id = new.account_id
           and effect_ref = new.effect_ref
           and effect_entitlement_id = new.effect_entitlement_id
           and effect_request_id = new.effect_request_id
           and effect_issued_link_id = new.effect_issued_link_id
           and effect_valid_until = new.effect_valid_until
           and state = 'pending'
      )
    begin
      select raise(abort, 'deferred_resource_transition_settled_rebase_outbox_binding');
    end
  `,
  `
    create trigger deferred_resource_transitions_reservation_binding_insert
    before insert on ${TRANSITIONS_TABLE}
    when not exists (
      select 1 from ${RESERVATIONS_TABLE}
       where reservation_ref = new.reservation_ref
         and source_ref = new.transition_ref
         and account_id = new.account_id
         and amount_units = new.amount_units
         and activation_at = new.scheduled_for
         and expires_at = strftime(
           '%Y-%m-%dT%H:%M:%fZ', julianday(new.scheduled_for) + 1
         )
         and rebase_generation = new.rebase_generation
    )
    begin
      select raise(abort, 'deferred_resource_transition_reservation_binding');
    end
  `,
  `
    create trigger deferred_resource_transitions_identity_immutable_update
    before update of
      transition_ref,
      account_id,
      order_ref,
      reservation_ref,
      offer_version_ref,
      commercial_model,
      flow_kind,
      plan_rank,
      amount_units,
      offer_snapshot_json,
      allocation_snapshot_json,
      reserved_at,
      created_at
    on ${TRANSITIONS_TABLE}
    begin
      select raise(abort, 'deferred_resource_transition_identity_immutable');
    end
  `,
  `
    create trigger deferred_resource_transitions_effect_successor_snapshot_transition
    before update of
      state,
      effect_ref,
      effect_entitlement_id,
      effect_request_id,
      effect_issued_link_id,
      effect_valid_until
    on ${TRANSITIONS_TABLE}
    when
      new.effect_ref is not old.effect_ref
      or new.effect_entitlement_id is not old.effect_entitlement_id
      or new.effect_request_id is not old.effect_request_id
      or new.effect_issued_link_id is not old.effect_issued_link_id
      or new.effect_valid_until is not old.effect_valid_until
    begin
      select case when not (
        old.state = 'processing'
        and new.state = 'effect_applied'
        and old.effect_ref is null
        and old.effect_entitlement_id is null
        and old.effect_request_id is null
        and old.effect_issued_link_id is null
        and old.effect_valid_until is null
        and new.effect_ref is not null
        and new.effect_entitlement_id is not null
        and new.effect_request_id is not null
        and new.effect_issued_link_id is not null
        and new.effect_valid_until is not null
      ) then raise(abort, 'deferred_resource_transition_effect_successor_snapshot_transition') end;
    end
  `,
  `
    create trigger deferred_resource_transitions_rebase_transition
    before update of
      scheduled_for,
      expected_entitlement_id,
      expected_request_id,
      expected_issued_link_id,
      expected_valid_until,
      rebase_generation
    on ${TRANSITIONS_TABLE}
    when not (
      old.state = 'reserved'
      and new.state = 'reserved'
      and new.scheduled_for > old.scheduled_for
      and new.rebase_generation = old.rebase_generation + 1
    )
    begin
      select raise(abort, 'deferred_resource_transition_rebase_transition');
    end
  `,
  `
    create trigger deferred_resource_transitions_terminal_immutable_update
    before update of
      state,
      scheduled_for,
      expected_entitlement_id,
      expected_request_id,
      expected_issued_link_id,
      expected_valid_until,
      rebase_generation,
      lease_generation,
      lease_token,
      lease_until,
      effect_ref,
      effect_entitlement_id,
      effect_request_id,
      effect_issued_link_id,
      effect_valid_until,
      safe_code,
      settled_at,
      updated_at
    on ${TRANSITIONS_TABLE}
    when
      old.state in (
        'settled', 'requote_required', 'cancelled',
        'reconciliation_required'
      )
      and not (
        old.state in ('settled', 'requote_required', 'cancelled')
        and new.state = 'reconciliation_required'
      )
    begin
      select raise(abort, 'deferred_resource_transition_terminal_immutable');
    end
  `,
  `
    create trigger deferred_resource_transition_operation_receipts_status_transition
    before update of status on ${OPERATION_RECEIPTS_TABLE}
    when
      new.status <> old.status
      and not (
        old.status = 'started' and new.status in ('succeeded', 'failed')
      )
    begin
      select raise(abort, 'deferred_resource_transition_operation_receipt_status_transition');
    end
  `,
  `
    create trigger deferred_resource_transition_operation_receipts_identity_immutable_update
    before update of
      operation_ref,
      transition_ref,
      account_id,
      actor_scope,
      operation_type,
      idempotency_key,
      request_digest,
      created_at
    on ${OPERATION_RECEIPTS_TABLE}
    begin
      select raise(abort, 'deferred_resource_transition_operation_receipt_identity_immutable');
    end
  `,
  `
    create trigger deferred_resource_transition_operation_receipts_terminal_immutable_update
    before update of status, result_ref, safe_result_code, completed_at
    on ${OPERATION_RECEIPTS_TABLE}
    when old.status in ('succeeded', 'failed')
    begin
      select raise(abort, 'deferred_resource_transition_operation_receipt_terminal_immutable');
    end
  `
]);

// This additive migration deliberately leaves the published v1 DDL and
// checksum untouched. Existing databases must ledger-match v1 before these
// additional guards are installed.
const RISK_A_GATES_MIGRATION_STATEMENTS = Object.freeze([
  `
    create trigger deferred_resource_transition_reservations_wallet_account_binding_insert
    before insert on ${RESERVATIONS_TABLE}
    when not exists (
      select 1 from platform_coin_wallets
       where wallet_ref = new.wallet_ref
         and account_id = new.account_id
    )
    begin
      select raise(abort, 'deferred_resource_transition_reservation_wallet_account_binding');
    end
  `,
  `
    create trigger deferred_resource_transition_reservations_initial_state_reserved
    before insert on ${RESERVATIONS_TABLE}
    when not (
      new.state = 'reserved'
      and new.lease_generation = 0
      and new.lease_token is null
      and new.lease_until is null
    )
    begin
      select raise(abort, 'deferred_resource_transition_reservation_initial_state_reserved');
    end
  `,
  `
    create trigger deferred_resource_transitions_initial_state_reserved
    before insert on ${TRANSITIONS_TABLE}
    when not (
      new.state = 'reserved'
      and new.rebase_generation = 0
      and new.lease_generation = 0
      and new.lease_token is null
      and new.lease_until is null
      and new.effect_ref is null
      and new.effect_entitlement_id is null
      and new.effect_request_id is null
      and new.effect_issued_link_id is null
      and new.effect_valid_until is null
      and new.safe_code is null
      and new.settled_at is null
    )
    begin
      select raise(abort, 'deferred_resource_transition_initial_state_reserved');
    end
  `
]);

function normalizeSql(sql) {
  const source = String(sql);
  const literals = [];
  let protectedSql = "";
  for (let index = 0; index < source.length;) {
    if (source[index] !== "'") {
      protectedSql += source[index];
      index += 1;
      continue;
    }
    const start = index;
    index += 1;
    while (index < source.length) {
      if (source[index] !== "'") {
        index += 1;
        continue;
      }
      if (source[index + 1] === "'") {
        index += 2;
        continue;
      }
      index += 1;
      break;
    }
    const token = `\0${literals.length}\0`;
    literals.push(source.slice(start, index));
    protectedSql += token;
  }
  return protectedSql
    .trim()
    .replace(/;\s*$/, "")
    .replace(/\s+/g, " ")
    .replace(/\s*([(),=+>])\s*/g, "$1")
    .toLowerCase()
    .replace(/\0(\d+)\0/g, (_match, index) => literals[Number(index)]);
}

const OWNED_OBJECTS = Object.freeze([
  ["table", RESERVATIONS_TABLE],
  ["table", RESERVATION_ALLOCATIONS_TABLE],
  ["table", TRANSITIONS_TABLE],
  ["table", OPERATION_RECEIPTS_TABLE],
  ["table", EVENTS_TABLE],
  ["table", REBASES_TABLE],
  ["index", ACTIVE_ACCOUNT_INDEX],
  ["index", RESERVED_CLAIM_INDEX],
  ["index", RECEIPTS_REPLAY_INDEX],
  ["index", EVENTS_PAGE_INDEX],
  ["index", REBASE_PENDING_CLAIM_INDEX],
  ["trigger", "deferred_resource_transition_events_immutable_update"],
  ["trigger", "deferred_resource_transition_events_immutable_delete"],
  ["trigger", "deferred_resource_transition_rebases_transition_binding_insert"],
  ["trigger", "deferred_resource_transition_rebases_state_transition"],
  ["trigger", "deferred_resource_transition_rebases_lease_cas_update"],
  ["trigger", "deferred_resource_transition_rebases_identity_immutable_update"],
  ["trigger", "deferred_resource_transition_rebases_terminal_immutable_update"],
  ["trigger", "deferred_resource_transition_reservations_state_transition"],
  ["trigger", "deferred_resource_transition_reservations_transition_binding_state"],
  ["trigger", "deferred_resource_transition_reservations_identity_immutable_update"],
  ["trigger", "deferred_resource_transition_reservations_rebase_binding_update"],
  ["trigger", "deferred_resource_transition_reservations_terminal_immutable_update"],
  ["trigger", "deferred_resource_transition_reservation_allocations_immutable_update"],
  ["trigger", "deferred_resource_transition_reservation_allocations_immutable_delete"],
  ["trigger", "deferred_resource_transition_reservation_allocations_snapshot_binding_insert"],
  ["trigger", "deferred_resource_transitions_state_transition"],
  ["trigger", "deferred_resource_transitions_settled_rebase_outbox_binding"],
  ["trigger", "deferred_resource_transitions_reservation_binding_insert"],
  ["trigger", "deferred_resource_transitions_identity_immutable_update"],
  ["trigger", "deferred_resource_transitions_effect_successor_snapshot_transition"],
  ["trigger", "deferred_resource_transitions_rebase_transition"],
  ["trigger", "deferred_resource_transitions_terminal_immutable_update"],
  ["trigger", "deferred_resource_transition_operation_receipts_status_transition"],
  ["trigger", "deferred_resource_transition_operation_receipts_identity_immutable_update"],
  ["trigger", "deferred_resource_transition_operation_receipts_terminal_immutable_update"]
]);

const RISK_A_GATES_OWNED_OBJECTS = Object.freeze([
  ["trigger", "deferred_resource_transition_reservations_wallet_account_binding_insert"],
  ["trigger", "deferred_resource_transition_reservations_initial_state_reserved"],
  ["trigger", "deferred_resource_transitions_initial_state_reserved"]
]);

const ALL_OWNED_OBJECTS = Object.freeze([
  ...OWNED_OBJECTS,
  ...RISK_A_GATES_OWNED_OBJECTS
]);

const EXPECTED_OBJECT_SQL = new Map(
  OWNED_OBJECTS.map(([type, name], index) => [
    `${type}:${name}`,
    normalizeSql(MIGRATION_STATEMENTS[index])
  ])
);

const EXPECTED_RISK_A_GATES_OBJECT_SQL = new Map(
  RISK_A_GATES_OWNED_OBJECTS.map(([type, name], index) => [
    `${type}:${name}`,
    normalizeSql(RISK_A_GATES_MIGRATION_STATEMENTS[index])
  ])
);

const EXPECTED_TABLE_COLUMNS = Object.freeze({
  [RESERVATIONS_TABLE]: [
    "reservation_ref",
    "account_id",
    "wallet_ref",
    "source_type",
    "source_ref",
    "amount_units",
    "activation_at",
    "expires_at",
    "rebase_generation",
    "state",
    "lease_generation",
    "lease_token",
    "lease_until",
    "created_at",
    "updated_at"
  ],
  [RESERVATION_ALLOCATIONS_TABLE]: [
    "allocation_ref",
    "reservation_ref",
    "lot_ref",
    "coin_type_snapshot",
    "allocation_sequence",
    "amount_units",
    "lot_expires_at_snapshot",
    "created_at"
  ],
  [TRANSITIONS_TABLE]: [
    "transition_ref",
    "account_id",
    "order_ref",
    "reservation_ref",
    "offer_version_ref",
    "commercial_model",
    "flow_kind",
    "plan_rank",
    "amount_units",
    "offer_snapshot_json",
    "allocation_snapshot_json",
    "reserved_at",
    "scheduled_for",
    "expected_entitlement_id",
    "expected_request_id",
    "expected_issued_link_id",
    "expected_valid_until",
    "rebase_generation",
    "state",
    "lease_generation",
    "lease_token",
    "lease_until",
    "effect_ref",
    "effect_entitlement_id",
    "effect_request_id",
    "effect_issued_link_id",
    "effect_valid_until",
    "safe_code",
    "settled_at",
    "created_at",
    "updated_at"
  ],
  [OPERATION_RECEIPTS_TABLE]: [
    "operation_ref",
    "transition_ref",
    "account_id",
    "actor_scope",
    "operation_type",
    "idempotency_key",
    "request_digest",
    "status",
    "result_ref",
    "safe_result_code",
    "created_at",
    "completed_at"
  ],
  [EVENTS_TABLE]: [
    "event_ref",
    "transition_ref",
    "event_type",
    "safe_code",
    "actor_type",
    "actor_ref",
    "occurred_at"
  ],
  [REBASES_TABLE]: [
    "settled_transition_ref",
    "account_id",
    "effect_ref",
    "effect_entitlement_id",
    "effect_request_id",
    "effect_issued_link_id",
    "effect_valid_until",
    "state",
    "lease_generation",
    "lease_token",
    "lease_until",
    "safe_code",
    "created_at",
    "updated_at",
    "completed_at"
  ]
});

const EXPECTED_FOREIGN_KEYS = Object.freeze({
  [RESERVATIONS_TABLE]: [
    ["account_id", "platform_accounts", "id"],
    ["wallet_ref", "platform_coin_wallets", "wallet_ref"]
  ],
  [RESERVATION_ALLOCATIONS_TABLE]: [
    ["reservation_ref", RESERVATIONS_TABLE, "reservation_ref"],
    ["lot_ref", "platform_coin_lots", "lot_ref"]
  ],
  [TRANSITIONS_TABLE]: [
    ["account_id", "platform_accounts", "id"],
    ["reservation_ref", RESERVATIONS_TABLE, "reservation_ref"],
    ["offer_version_ref", "platform_coin_commerce_offer_versions", "offer_version_ref"],
    ["expected_entitlement_id", "platform_entitlements", "id"],
    ["expected_request_id", "platform_issuance_requests", "id"],
    ["expected_issued_link_id", "platform_issued_subscription_links", "id"],
    ["effect_entitlement_id", "platform_entitlements", "id"],
    ["effect_request_id", "platform_issuance_requests", "id"],
    ["effect_issued_link_id", "platform_issued_subscription_links", "id"]
  ],
  [OPERATION_RECEIPTS_TABLE]: [
    ["transition_ref", TRANSITIONS_TABLE, "transition_ref"],
    ["account_id", "platform_accounts", "id"]
  ],
  [EVENTS_TABLE]: [
    ["transition_ref", TRANSITIONS_TABLE, "transition_ref"]
  ],
  [REBASES_TABLE]: [
    ["settled_transition_ref", TRANSITIONS_TABLE, "transition_ref"],
    ["account_id", "platform_accounts", "id"],
    ["effect_entitlement_id", "platform_entitlements", "id"],
    ["effect_request_id", "platform_issuance_requests", "id"],
    ["effect_issued_link_id", "platform_issued_subscription_links", "id"]
  ]
});

const EXPECTED_INDEXES = Object.freeze({
  [ACTIVE_ACCOUNT_INDEX]: {
    table: TRANSITIONS_TABLE,
    columns: ["account_id"],
    unique: 1,
    partial: 1
  },
  [RESERVED_CLAIM_INDEX]: {
    table: TRANSITIONS_TABLE,
    columns: ["scheduled_for", "plan_rank", "reserved_at", "transition_ref"],
    unique: 0,
    partial: 1
  },
  [RECEIPTS_REPLAY_INDEX]: {
    table: OPERATION_RECEIPTS_TABLE,
    columns: ["actor_scope", "operation_type", "idempotency_key"],
    unique: 0,
    partial: 0
  },
  [EVENTS_PAGE_INDEX]: {
    table: EVENTS_TABLE,
    columns: ["transition_ref", "occurred_at", "event_ref"],
    unique: 0,
    partial: 0
  },
  [REBASE_PENDING_CLAIM_INDEX]: {
    table: REBASES_TABLE,
    columns: ["created_at", "settled_transition_ref"],
    unique: 0,
    partial: 1
  }
});

const EXPECTED_LEDGER_SQL = normalizeSql(`
  create table platform_schema_migrations (
    migration_id text primary key,
    ddl_checksum text not null,
    applied_at text not null
  )
`);

const DDL_CHECKSUM = createHash("sha256")
  .update(
    `GCCWEBOS:DEFERRED_RESOURCE_TRANSITION_DDL:v1\0${
      MIGRATION_STATEMENTS.map(normalizeSql).join("\0")
    }`,
    "utf8"
  )
  .digest("hex");

const RISK_A_GATES_DDL_CHECKSUM = createHash("sha256")
  .update(
    `GCCWEBOS:DEFERRED_RESOURCE_TRANSITION_DDL:v2\0${
      RISK_A_GATES_MIGRATION_STATEMENTS.map(normalizeSql).join("\0")
    }`,
    "utf8"
  )
  .digest("hex");

export const REQUIRED_DEFERRED_RESOURCE_TRANSITION_DDL_CHECKSUM =
  RISK_A_GATES_DDL_CHECKSUM;

export const DEFERRED_RESOURCE_TRANSITION_MIGRATIONS = Object.freeze([
  Object.freeze({
    id: LEGACY_DEFERRED_RESOURCE_TRANSITION_MIGRATION_ID,
    ddlChecksum: DDL_CHECKSUM
  }),
  Object.freeze({
    id: DEFERRED_RESOURCE_TRANSITION_RISK_A_GATES_MIGRATION_ID,
    ddlChecksum: RISK_A_GATES_DDL_CHECKSUM
  })
]);

const SAFE_INSPECTION_REASONS = new Set([
  "database_close_failed",
  "database_inspection_failed",
  "database_invalid",
  "database_missing",
  "database_unavailable",
  "foreign_key_check_failed",
  "migration_checksum_mismatch",
  "migration_dependency_missing",
  "migration_ledger_incompatible",
  "owned_object_incompatible",
  "owned_object_missing",
  "owned_object_without_migration",
  "quick_check_failed",
  "required_migration_missing"
]);

const KNOWN_ERROR_CODES = new Set([
  "applied_schema_incompatible",
  "database_close_failed",
  "database_unavailable",
  "invalid_database_path",
  "invalid_migration_contract",
  "invalid_temp_root",
  "migration_apply_failed",
  "migration_checksum_mismatch",
  "migration_dependency_missing",
  "migration_id_mismatch",
  "owned_object_without_migration",
  "source_changed_during_dry_run"
]);

const INTERNAL_MIGRATION_ERRORS = new WeakMap();

function safeMigrationError(code) {
  const error = new Error("Deferred resource-transition schema rejected");
  error.code = code;
  return error;
}

function migrationError(code, invocationToken) {
  const error = safeMigrationError(code);
  INTERNAL_MIGRATION_ERRORS.set(error, Object.freeze({
    code,
    invocationToken
  }));
  return error;
}

function safeErrorCode(error) {
  try {
    const code = error?.code;
    return typeof code === "string" ? code : null;
  } catch {
    return null;
  }
}

function isSqliteContentionCode(code) {
  return typeof code === "string"
    && /^SQLITE_(?:BUSY|LOCKED)(?:_|$)/.test(code);
}

function closedOperationError(error, invocationToken) {
  const provenance = INTERNAL_MIGRATION_ERRORS.get(error);
  if (
    provenance?.invocationToken === invocationToken
    && KNOWN_ERROR_CODES.has(provenance.code)
  ) {
    return safeMigrationError(provenance.code);
  }
  if (isSqliteContentionCode(safeErrorCode(error))) {
    return safeMigrationError("database_unavailable");
  }
  return safeMigrationError("migration_apply_failed");
}

function inspectWithContentionTracking(database, operation, contentionError) {
  let contention = false;

  function recordContention(error) {
    if (isSqliteContentionCode(safeErrorCode(error))) contention = true;
  }

  function statementView(statement) {
    let view;
    view = new Proxy(statement, {
      get(target, property) {
        let member;
        try {
          member = Reflect.get(target, property, target);
        } catch (error) {
          recordContention(error);
          throw error;
        }
        if (typeof member !== "function") return member;
        return (...args) => {
          try {
            const result = member.apply(target, args);
            return result === target ? view : result;
          } catch (error) {
            recordContention(error);
            throw error;
          }
        };
      }
    });
    return view;
  }

  let databaseView;
  databaseView = new Proxy(database, {
    get(target, property) {
      let member;
      try {
        member = Reflect.get(target, property, target);
      } catch (error) {
        recordContention(error);
        throw error;
      }
      if (typeof member !== "function") return member;
      return (...args) => {
        try {
          const result = member.apply(target, args);
          if (property === "prepare") return statementView(result);
          return result === target ? databaseView : result;
        } catch (error) {
          recordContention(error);
          throw error;
        }
      };
    }
  });

  let result;
  try {
    result = operation(databaseView);
  } catch (error) {
    if (contention) throw contentionError();
    throw error;
  }
  if (contention) throw contentionError();
  return result;
}

function inspectForApply(database, operation, invocationToken) {
  return inspectWithContentionTracking(
    database,
    operation,
    () => migrationError("database_unavailable", invocationToken)
  );
}

function assertDatabasePath(dbPath) {
  if (typeof dbPath !== "string" || !isAbsolute(dbPath)) {
    throw safeMigrationError("invalid_database_path");
  }
}

function objectRow(database, type, name) {
  return database.prepare(
    "select type, name, tbl_name, sql from sqlite_master"
      + " where type = ? and name = ? collate nocase"
  ).get(type, name) ?? null;
}

function namedObjectRow(database, name) {
  return database.prepare(
    "select type, name, tbl_name, sql from sqlite_master"
      + " where name = ? collate nocase"
  ).get(name) ?? null;
}

function migrationRow(database, migrationId) {
  return database.prepare(`
    select migration_id, ddl_checksum
      from platform_schema_migrations
     where migration_id = ?
  `).get(migrationId) ?? null;
}

function migrationLedgerState(database) {
  const row = objectRow(database, "table", "platform_schema_migrations");
  if (!row) return "missing";
  return normalizeSql(row.sql) === EXPECTED_LEDGER_SQL
    ? "compatible"
    : "incompatible";
}

function walletFoundationDependencyIsExact(database) {
  try {
    const row = migrationRow(database, REQUIRED_COIN_WALLET_MIGRATION_ID);
    return row?.ddl_checksum === COIN_WALLET_MIGRATIONS[0].ddlChecksum
      && inspectCoinWalletSchema({ database }).ok;
  } catch {
    return false;
  }
}

function commerceFoundationDependencyIsExact(database) {
  try {
    const row = migrationRow(database, REQUIRED_COIN_COMMERCE_MIGRATION_ID);
    return row?.ddl_checksum === COIN_COMMERCE_MIGRATIONS[0].ddlChecksum
      && inspectCoinCommerceSchema({ database }).ok;
  } catch {
    return false;
  }
}

const RESOURCE_CHAIN_PARENT_COLUMNS = Object.freeze({
  platform_entitlements: Object.freeze(["id", "account_id", "status", "valid_until"]),
  platform_issuance_requests: Object.freeze(["id", "account_id", "entitlement_id"]),
  platform_issued_subscription_links: Object.freeze(["id", "request_id"])
});

const RESOURCE_CHAIN_PARENT_FOREIGN_KEYS = Object.freeze({
  platform_entitlements: Object.freeze([
    ["account_id", "platform_accounts", "id"]
  ]),
  platform_issuance_requests: Object.freeze([
    ["account_id", "platform_accounts", "id"],
    ["entitlement_id", "platform_entitlements", "id"]
  ]),
  platform_issued_subscription_links: Object.freeze([
    ["request_id", "platform_issuance_requests", "id"]
  ])
});

function tableHasColumns(database, table, expectedColumns) {
  const row = objectRow(database, "table", table);
  if (!row) return false;
  const columns = database.pragma(`table_info(${table})`);
  return expectedColumns.every((column) => columns.some(({ name }) => name === column))
    && columns.some(({ name, pk }) => name === "id" && pk === 1);
}

function tableHasForeignKeys(database, table, expectedForeignKeys) {
  const actual = database.pragma(`foreign_key_list(${table})`).map(
    ({ from, table: parentTable, to }) => [from, parentTable, to].join("->")
  );
  return expectedForeignKeys.every((entry) => actual.includes(entry.join("->")));
}

function resourceChainParentDependencyIsExact(database) {
  try {
    return Object.entries(RESOURCE_CHAIN_PARENT_COLUMNS).every(([table, columns]) => (
      tableHasColumns(database, table, columns)
      && tableHasForeignKeys(
        database,
        table,
        RESOURCE_CHAIN_PARENT_FOREIGN_KEYS[table]
      )
    ));
  } catch {
    return false;
  }
}

function reservationWalletBindingsAreExact(database) {
  try {
    return !database.prepare(`
      select 1
        from ${RESERVATIONS_TABLE} as reservation
        left join platform_coin_wallets as wallet
          on wallet.wallet_ref = reservation.wallet_ref
       where wallet.account_id is null
          or wallet.account_id <> reservation.account_id
       limit 1
    `).get();
  } catch {
    return false;
  }
}

function settledTransitionsHaveCaptureAndOutbox(database) {
  try {
    return !database.prepare(`
      select 1
        from ${TRANSITIONS_TABLE} as transition
       where transition.state = 'settled'
         and (
           not exists (
             select 1 from ${RESERVATIONS_TABLE} as reservation
              where reservation.reservation_ref = transition.reservation_ref
                and reservation.account_id = transition.account_id
                and reservation.state = 'captured'
           )
           or not exists (
             select 1 from ${REBASES_TABLE} as rebase
              where rebase.settled_transition_ref = transition.transition_ref
                and rebase.account_id = transition.account_id
                and rebase.effect_ref = transition.effect_ref
                and rebase.effect_entitlement_id = transition.effect_entitlement_id
                and rebase.effect_request_id = transition.effect_request_id
                and rebase.effect_issued_link_id = transition.effect_issued_link_id
                and rebase.effect_valid_until = transition.effect_valid_until
           )
         )
       limit 1
    `).get();
  } catch {
    return false;
  }
}

function foreignKeysAreExact(database, table) {
  const actual = database.pragma(`foreign_key_list(${table})`)
    .map((entry) => [entry.from, entry.table, entry.to].join("->"))
    .sort();
  const expected = EXPECTED_FOREIGN_KEYS[table]
    .map((entry) => entry.join("->"))
    .sort();
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function ownedTableIsExact(database, table) {
  const row = objectRow(database, "table", table);
  if (
    !row
    || row.name !== table
    || normalizeSql(row.sql) !== EXPECTED_OBJECT_SQL.get(`table:${table}`)
  ) {
    return false;
  }
  const columns = database.pragma(`table_info(${table})`).map(({ name }) => name);
  return JSON.stringify(columns) === JSON.stringify(EXPECTED_TABLE_COLUMNS[table])
    && foreignKeysAreExact(database, table);
}

function ownedIndexIsExact(database, name) {
  const expected = EXPECTED_INDEXES[name];
  const row = objectRow(database, "index", name);
  if (
    !row
    || row.name !== name
    || row.tbl_name !== expected.table
    || normalizeSql(row.sql) !== EXPECTED_OBJECT_SQL.get(`index:${name}`)
  ) {
    return false;
  }
  const listed = database.pragma(`index_list(${expected.table})`)
    .find((entry) => entry.name === name);
  const columns = database.pragma(`index_info(${name})`).map(({ name: column }) => column);
  return listed?.unique === expected.unique
    && listed.partial === expected.partial
    && JSON.stringify(columns) === JSON.stringify(expected.columns);
}

function ownedTriggerIsExact(database, name, expectedSql = EXPECTED_OBJECT_SQL) {
  const row = objectRow(database, "trigger", name);
  return Boolean(
    row
    && row.name === name
    && normalizeSql(row.sql) === expectedSql.get(`trigger:${name}`)
  );
}

function ownedObjectIsExact(database, type, name) {
  if (type === "table") return ownedTableIsExact(database, name);
  if (type === "index") return ownedIndexIsExact(database, name);
  return ownedTriggerIsExact(database, name);
}

function ownedObjectsAreExact(database) {
  return OWNED_OBJECTS.every(([type, name]) =>
    ownedObjectIsExact(database, type, name)
  );
}

function riskAGatesOwnedObjectsAreExact(database) {
  return RISK_A_GATES_OWNED_OBJECTS.every(([type, name]) => (
    type === "trigger"
      && ownedTriggerIsExact(database, name, EXPECTED_RISK_A_GATES_OBJECT_SQL)
  ));
}

function integrityChecks(database) {
  try {
    const quickRows = database.pragma("quick_check");
    const foreignKeyViolations = database.pragma("foreign_key_check").length;
    return {
      quickCheck:
        quickRows.length === 1
        && Object.values(quickRows[0])[0] === "ok",
      foreignKeyViolations,
      integrityError: false
    };
  } catch {
    return {
      quickCheck: false,
      foreignKeyViolations: 0,
      integrityError: true
    };
  }
}

function closedInspection(database) {
  const reasons = [];
  const ledgerState = migrationLedgerState(database);
  const walletFoundationDependency = ledgerState === "compatible"
    && walletFoundationDependencyIsExact(database);
  const commerceFoundationDependency = ledgerState === "compatible"
    && commerceFoundationDependencyIsExact(database);
  const resourceChainParentDependency = ledgerState === "compatible"
    && resourceChainParentDependencyIsExact(database);
  const foundationDependency = walletFoundationDependency
    && commerceFoundationDependency
    && resourceChainParentDependency;
  let migrationRows = 0;
  let baseRow = null;
  let riskAGatesRow = null;
  if (ledgerState === "compatible") {
    migrationRows = database.prepare(
      "select count(*) from platform_schema_migrations"
    ).pluck().get();
    baseRow = migrationRow(
      database,
      LEGACY_DEFERRED_RESOURCE_TRANSITION_MIGRATION_ID
    );
    riskAGatesRow = migrationRow(
      database,
      DEFERRED_RESOURCE_TRANSITION_RISK_A_GATES_MIGRATION_ID
    );
  } else if (ledgerState === "incompatible") {
    reasons.push("migration_ledger_incompatible");
  }

  const presentBaseTargetNames = OWNED_OBJECTS
    .filter(([, name]) => namedObjectRow(database, name));
  const presentRiskAGatesTargetNames = RISK_A_GATES_OWNED_OBJECTS
    .filter(([, name]) => namedObjectRow(database, name));
  const presentTargetNames = [
    ...presentBaseTargetNames,
    ...presentRiskAGatesTargetNames
  ];
  const presentCounts = {
    tables: ALL_OWNED_OBJECTS.filter(([type, name]) =>
      type === "table" && objectRow(database, type, name)
    ).length,
    indexes: ALL_OWNED_OBJECTS.filter(([type, name]) =>
      type === "index" && objectRow(database, type, name)
    ).length,
    triggers: ALL_OWNED_OBJECTS.filter(([type, name]) =>
      type === "trigger" && objectRow(database, type, name)
    ).length
  };
  let pendingMigrationIds = [];

  if (!foundationDependency && ledgerState !== "incompatible") {
    reasons.push("migration_dependency_missing");
  }
  if (foundationDependency) {
    if (!baseRow) {
      if (presentTargetNames.length === 0) {
        reasons.push("required_migration_missing");
        pendingMigrationIds = [
          LEGACY_DEFERRED_RESOURCE_TRANSITION_MIGRATION_ID,
          DEFERRED_RESOURCE_TRANSITION_RISK_A_GATES_MIGRATION_ID
        ];
      } else {
        reasons.push("owned_object_without_migration");
      }
    } else if (baseRow.ddl_checksum !== DDL_CHECKSUM) {
      reasons.push("migration_checksum_mismatch");
    } else if (!ownedObjectsAreExact(database)) {
      const missing = OWNED_OBJECTS.some(([type, name]) => !objectRow(database, type, name));
      reasons.push(missing ? "owned_object_missing" : "owned_object_incompatible");
    } else if (!riskAGatesRow) {
      if (presentRiskAGatesTargetNames.length > 0) {
        reasons.push("owned_object_without_migration");
      } else {
        reasons.push("required_migration_missing");
        pendingMigrationIds = [
          DEFERRED_RESOURCE_TRANSITION_RISK_A_GATES_MIGRATION_ID
        ];
      }
    } else if (riskAGatesRow.ddl_checksum !== RISK_A_GATES_DDL_CHECKSUM) {
      reasons.push("migration_checksum_mismatch");
    } else if (!riskAGatesOwnedObjectsAreExact(database)) {
      const missing = RISK_A_GATES_OWNED_OBJECTS.some(
        ([type, name]) => !objectRow(database, type, name)
      );
      reasons.push(missing ? "owned_object_missing" : "owned_object_incompatible");
    } else {
      if (!reservationWalletBindingsAreExact(database)) {
        reasons.push("owned_object_incompatible");
      }
      if (!settledTransitionsHaveCaptureAndOutbox(database)) {
        reasons.push("owned_object_incompatible");
      }
    }
  }

  const integrity = integrityChecks(database);
  if (!integrity.quickCheck || integrity.integrityError) {
    reasons.push("quick_check_failed");
  }
  if (integrity.foreignKeyViolations > 0 || integrity.integrityError) {
    reasons.push("foreign_key_check_failed");
  }

  const reasonCodes = [...new Set(reasons)].sort();
  const schemaExact = baseRow?.ddl_checksum === DDL_CHECKSUM
    && ownedObjectsAreExact(database)
    && riskAGatesRow?.ddl_checksum === RISK_A_GATES_DDL_CHECKSUM
    && riskAGatesOwnedObjectsAreExact(database);
  const checks = {
    walletFoundationDependency,
    commerceFoundationDependency,
    resourceChainParentDependency,
    reservationWalletBindings: schemaExact
      && reservationWalletBindingsAreExact(database),
    settledTransitionsHaveCaptureAndOutbox: schemaExact
      && settledTransitionsHaveCaptureAndOutbox(database),
    schemaExact,
    quickCheck: integrity.quickCheck && !integrity.integrityError,
    foreignKeys:
      integrity.foreignKeyViolations === 0 && !integrity.integrityError
  };
  const counts = {
    ...presentCounts,
    migrationRows,
    foreignKeyViolations: integrity.foreignKeyViolations
  };
  const pending = pendingMigrationIds.length > 0
    && reasonCodes.length === 1
    && reasonCodes[0] === "required_migration_missing";
  const ok = foundationDependency
    && reasonCodes.length === 0
    && checks.schemaExact
    && checks.reservationWalletBindings
    && checks.settledTransitionsHaveCaptureAndOutbox
    && checks.quickCheck
    && checks.foreignKeys;

  return {
    ok,
    schemaState: ok ? "ready" : pending ? "pending" : "blocked",
    requiredMigrationId: REQUIRED_DEFERRED_RESOURCE_TRANSITION_MIGRATION_ID,
    counts,
    checks,
    reasonCodes,
    pendingMigrationIds: pending ? pendingMigrationIds : []
  };
}

export function inspectDeferredResourceTransitionSchema({ database } = {}) {
  if (
    !database
    || typeof database.prepare !== "function"
    || typeof database.pragma !== "function"
  ) {
    throw safeMigrationError("invalid_migration_contract");
  }
  return closedInspection(database);
}

function closedValidationFailure(reasonCode) {
  return {
    ok: false,
    schemaState: "blocked",
    requiredMigrationId: REQUIRED_DEFERRED_RESOURCE_TRANSITION_MIGRATION_ID,
    counts: {
      tables: 0,
      indexes: 0,
      triggers: 0,
      migrationRows: 0,
      foreignKeyViolations: 0
    },
    checks: {
      walletFoundationDependency: false,
      commerceFoundationDependency: false,
      resourceChainParentDependency: false,
      reservationWalletBindings: false,
      settledTransitionsHaveCaptureAndOutbox: false,
      schemaExact: false,
      quickCheck: false,
      foreignKeys: false
    },
    reasonCodes: SAFE_INSPECTION_REASONS.has(reasonCode)
      ? [reasonCode]
      : ["database_inspection_failed"],
    pendingMigrationIds: []
  };
}

function validationFailureReason(dbPath, error) {
  if (!existsSync(dbPath)) return "database_missing";
  const code = safeErrorCode(error);
  if (code === "database_unavailable") return "database_unavailable";
  if (code === "SQLITE_NOTADB") return "database_invalid";
  if (isSqliteContentionCode(code)) return "database_unavailable";
  return "database_inspection_failed";
}

export function validateDeferredResourceTransitionSchema({
  dbPath,
  database
} = {}) {
  if (database) return inspectDeferredResourceTransitionSchema({ database });
  assertDatabasePath(dbPath);
  let owned;
  let result;
  let closeFailed = false;
  try {
    try {
      owned = new Database(dbPath, { readonly: true, fileMustExist: true });
      result = inspectWithContentionTracking(
        owned,
        (inspectionDatabase) => inspectDeferredResourceTransitionSchema({
          database: inspectionDatabase
        }),
        () => safeMigrationError("database_unavailable")
      );
    } catch (error) {
      try {
        result = closedValidationFailure(validationFailureReason(dbPath, error));
      } catch {
        result = closedValidationFailure("database_inspection_failed");
      }
    }
  } finally {
    try {
      owned?.close();
    } catch {
      closeFailed = true;
    }
  }
  if (closeFailed) return closedValidationFailure("database_close_failed");
  return result;
}

function assertFoundationDependency(database, invocationToken) {
  if (
    !inspectForApply(
      database,
      (inspectionDatabase) => (
        walletFoundationDependencyIsExact(inspectionDatabase)
        && commerceFoundationDependencyIsExact(inspectionDatabase)
        && resourceChainParentDependencyIsExact(inspectionDatabase)
      ),
      invocationToken
    )
  ) {
    throw migrationError("migration_dependency_missing", invocationToken);
  }
}

function assertOwnedObjectsAreAbsent(database, invocationToken) {
  if (ALL_OWNED_OBJECTS.some(([, name]) => namedObjectRow(database, name))) {
    throw migrationError("owned_object_without_migration", invocationToken);
  }
}

function assertRiskAGatesOwnedObjectsAreAbsent(database, invocationToken) {
  if (RISK_A_GATES_OWNED_OBJECTS.some(([, name]) => namedObjectRow(database, name))) {
    throw migrationError("owned_object_without_migration", invocationToken);
  }
}

function normalizeAppliedAt(nowFn, invocationToken) {
  const value = nowFn();
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw migrationError("invalid_migration_contract", invocationToken);
  }
  return value.toISOString();
}

function applyWithDatabase(database, nowFn, invocationToken) {
  database.pragma("foreign_keys = ON");
  const migrate = database.transaction(() => {
    assertFoundationDependency(database, invocationToken);
    const appliedMigrationIds = [];
    let appliedAt = null;
    const insertLedgerRow = (migrationId, ddlChecksum) => {
      appliedAt ??= normalizeAppliedAt(nowFn, invocationToken);
      database.prepare(`
        insert into platform_schema_migrations
          (migration_id, ddl_checksum, applied_at)
        values (?, ?, ?)
      `).run(migrationId, ddlChecksum, appliedAt);
    };

    const baseApplied = migrationRow(
      database,
      LEGACY_DEFERRED_RESOURCE_TRANSITION_MIGRATION_ID
    );
    if (baseApplied) {
      if (baseApplied.ddl_checksum !== DDL_CHECKSUM) {
        throw migrationError("migration_checksum_mismatch", invocationToken);
      }
      if (!inspectForApply(
        database,
        (inspectionDatabase) => ownedObjectsAreExact(inspectionDatabase),
        invocationToken
      )) {
        throw migrationError("applied_schema_incompatible", invocationToken);
      }
    } else {
      assertOwnedObjectsAreAbsent(database, invocationToken);
      for (const statement of MIGRATION_STATEMENTS) database.exec(statement);
      insertLedgerRow(LEGACY_DEFERRED_RESOURCE_TRANSITION_MIGRATION_ID, DDL_CHECKSUM);
      if (!inspectForApply(
        database,
        (inspectionDatabase) => ownedObjectsAreExact(inspectionDatabase),
        invocationToken
      )) {
        throw migrationError("applied_schema_incompatible", invocationToken);
      }
      appliedMigrationIds.push(LEGACY_DEFERRED_RESOURCE_TRANSITION_MIGRATION_ID);
    }

    const riskAGatesApplied = migrationRow(
      database,
      DEFERRED_RESOURCE_TRANSITION_RISK_A_GATES_MIGRATION_ID
    );
    if (riskAGatesApplied) {
      if (riskAGatesApplied.ddl_checksum !== RISK_A_GATES_DDL_CHECKSUM) {
        throw migrationError("migration_checksum_mismatch", invocationToken);
      }
      if (!inspectForApply(
        database,
        (inspectionDatabase) => riskAGatesOwnedObjectsAreExact(inspectionDatabase),
        invocationToken
      )) {
        throw migrationError("applied_schema_incompatible", invocationToken);
      }
    } else {
      assertRiskAGatesOwnedObjectsAreAbsent(database, invocationToken);
      for (const statement of RISK_A_GATES_MIGRATION_STATEMENTS) database.exec(statement);
      insertLedgerRow(
        DEFERRED_RESOURCE_TRANSITION_RISK_A_GATES_MIGRATION_ID,
        RISK_A_GATES_DDL_CHECKSUM
      );
      if (!inspectForApply(
        database,
        (inspectionDatabase) => riskAGatesOwnedObjectsAreExact(inspectionDatabase),
        invocationToken
      )) {
        throw migrationError("applied_schema_incompatible", invocationToken);
      }
      appliedMigrationIds.push(DEFERRED_RESOURCE_TRANSITION_RISK_A_GATES_MIGRATION_ID);
    }

    if (!inspectForApply(
      database,
      (inspectionDatabase) => inspectDeferredResourceTransitionSchema({
        database: inspectionDatabase
      }),
      invocationToken
    ).ok) {
      throw migrationError("applied_schema_incompatible", invocationToken);
    }
    return appliedMigrationIds;
  });
  return migrate.immediate();
}

export function applyDeferredResourceTransitionMigrations({
  dbPath,
  database,
  expectedMigrationId,
  expectedDdlChecksum,
  nowFn = () => new Date()
} = {}) {
  if (expectedMigrationId !== REQUIRED_DEFERRED_RESOURCE_TRANSITION_MIGRATION_ID) {
    throw safeMigrationError("migration_id_mismatch");
  }
  if (expectedDdlChecksum !== RISK_A_GATES_DDL_CHECKSUM) {
    throw safeMigrationError("migration_checksum_mismatch");
  }
  if (typeof nowFn !== "function" || (!database && dbPath === undefined)) {
    throw safeMigrationError("invalid_migration_contract");
  }
  if (!database) assertDatabasePath(dbPath);

  const invocationToken = Object.freeze({});
  let owned;
  try {
    const connection = database ?? (owned = new Database(dbPath, {
      fileMustExist: true
    }));
    const appliedMigrationIds = applyWithDatabase(
      connection,
      nowFn,
      invocationToken
    );
    const inspection = inspectForApply(
      connection,
      (inspectionDatabase) => inspectDeferredResourceTransitionSchema({
        database: inspectionDatabase
      }),
      invocationToken
    );
    if (!inspection.ok) {
      throw migrationError("applied_schema_incompatible", invocationToken);
    }
    return {
      ...inspection,
      mode: "apply",
      sourceChanged: appliedMigrationIds.length > 0,
      appliedMigrationIds
    };
  } catch (error) {
    throw closedOperationError(error, invocationToken);
  } finally {
    if (owned) {
      try {
        owned.close();
      } catch {
        throw safeMigrationError("database_close_failed");
      }
    }
  }
}

function assertAbsoluteTempRoot(root, invocationToken) {
  if (typeof root !== "string" || !isAbsolute(root)) {
    throw migrationError("invalid_temp_root", invocationToken);
  }
}

function sourceInspectionState(database) {
  return {
    dataVersion: database.pragma("data_version", { simple: true }),
    schemaVersion: database.pragma("schema_version", { simple: true }),
    inspection: inspectDeferredResourceTransitionSchema({ database })
  };
}

function sourceInspectionStateIsUnchanged(before, after) {
  return before.dataVersion === after.dataVersion
    && before.schemaVersion === after.schemaVersion
    && JSON.stringify(before.inspection) === JSON.stringify(after.inspection);
}

function safeRemoveOwnedDirectory(directory, root, invocationToken) {
  const resolvedDirectory = resolve(directory);
  const resolvedRoot = resolve(root);
  const child = relative(resolvedRoot, resolvedDirectory);
  if (
    child.length === 0
    || child === ".."
    || child.startsWith(`..${sep}`)
    || isAbsolute(child)
  ) {
    throw migrationError("invalid_temp_root", invocationToken);
  }
  try {
    rmSync(resolvedDirectory, { recursive: true, force: true });
  } catch {
    throw migrationError("migration_apply_failed", invocationToken);
  }
}

export async function dryRunDeferredResourceTransitionMigrations({
  dbPath,
  tempRoot
} = {}) {
  assertDatabasePath(dbPath);
  const invocationToken = Object.freeze({});
  const root = tempRoot ?? tmpdir();
  let workDirectory;
  let source;
  try {
    assertAbsoluteTempRoot(root, invocationToken);
    mkdirSync(root, { recursive: true });
    workDirectory = mkdtempSync(
      join(root, "deferred-resource-transition-dry-run-")
    );
    const snapshotPath = join(workDirectory, "snapshot.sqlite");
    source = new Database(dbPath, { readonly: true, fileMustExist: true });
    assertFoundationDependency(source, invocationToken);
    const sourceInspectionBefore =
      inspectDeferredResourceTransitionSchema({ database: source });
    const sourceStateBefore = sourceInspectionState(source);
    await source.backup(snapshotPath);
    const applied = applyDeferredResourceTransitionMigrations({
      dbPath: snapshotPath,
      expectedMigrationId: REQUIRED_DEFERRED_RESOURCE_TRANSITION_MIGRATION_ID,
      expectedDdlChecksum: RISK_A_GATES_DDL_CHECKSUM
    });
    const validated = validateDeferredResourceTransitionSchema({
      dbPath: snapshotPath
    });
    if (!validated.ok) {
      throw migrationError("applied_schema_incompatible", invocationToken);
    }
    if (!sourceInspectionStateIsUnchanged(
      sourceStateBefore,
      sourceInspectionState(source)
    )) {
      throw migrationError("source_changed_during_dry_run", invocationToken);
    }
    return {
      ...validated,
      mode: "dry-run",
      sourceChanged: false,
      pendingMigrationIds: sourceInspectionBefore.pendingMigrationIds,
      appliedMigrationIds: applied.appliedMigrationIds
    };
  } catch (error) {
    throw closedOperationError(error, invocationToken);
  } finally {
    let cleanupError = null;
    try {
      source?.close();
    } catch {
      cleanupError = migrationError("database_close_failed", invocationToken);
    }
    if (workDirectory) {
      try {
        safeRemoveOwnedDirectory(workDirectory, root, invocationToken);
      } catch (error) {
        cleanupError ??= error;
      }
    }
    if (cleanupError) throw closedOperationError(cleanupError, invocationToken);
  }
}
