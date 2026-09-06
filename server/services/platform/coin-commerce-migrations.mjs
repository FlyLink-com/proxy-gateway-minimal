import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync
} from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import Database from "better-sqlite3";

import {
  COIN_WALLET_MIGRATIONS,
  REQUIRED_COIN_WALLET_MIGRATION_ID,
  inspectCoinWalletSchema
} from "./coin-wallet-migrations.mjs";

export const REQUIRED_COIN_COMMERCE_MIGRATION_ID =
  "20260726_001_coin_commerce_foundation";

const SAFE_INTEGER_MAX = 9_007_199_254_740_991;
const COUNTER_MAX = 2_147_483_647;

const MIGRATION_STATEMENTS = Object.freeze([
  `
    create table platform_coin_commerce_offer_versions (
      offer_version_ref text primary key,
      offer_ref text not null,
      version integer not null check (
        typeof(version) = 'integer' and version between 1 and ${SAFE_INTEGER_MAX}
      ),
      status text not null check (status in ('draft', 'published', 'retired')),
      category text not null check (category in ('plan', 'data_pack')),
      title_zh text not null check (length(title_zh) > 0),
      title_en text not null check (length(title_en) > 0),
      summary_zh text not null check (length(summary_zh) > 0),
      summary_en text not null check (length(summary_en) > 0),
      important_notices_zh_json text not null check (
        json_valid(important_notices_zh_json)
        and json_type(important_notices_zh_json) = 'array'
        and json_array_length(important_notices_zh_json) > 0
      ),
      important_notices_en_json text not null check (
        json_valid(important_notices_en_json)
        and json_type(important_notices_en_json) = 'array'
        and json_array_length(important_notices_en_json) > 0
      ),
      base_coin_units integer not null check (
        typeof(base_coin_units) = 'integer'
        and base_coin_units between 1 and ${SAFE_INTEGER_MAX}
      ),
      reference_currency text not null check (reference_currency = 'CNY'),
      reference_amount_minor integer not null check (
        typeof(reference_amount_minor) = 'integer'
        and reference_amount_minor between 1 and ${SAFE_INTEGER_MAX}
      ),
      accepted_coin_types_json text not null check (
        json_valid(accepted_coin_types_json)
        and json_type(accepted_coin_types_json) = 'array'
        and json_array_length(accepted_coin_types_json) > 0
      ),
      delivery_kind text not null check (
        delivery_kind in ('subscription_plan', 'data_pack')
      ),
      duration_days integer check (
        duration_days is null
        or (
          typeof(duration_days) = 'integer'
          and duration_days between 1 and ${SAFE_INTEGER_MAX}
        )
      ),
      monthly_traffic_gb integer check (
        monthly_traffic_gb is null
        or (
          typeof(monthly_traffic_gb) = 'integer'
          and monthly_traffic_gb between 1 and ${SAFE_INTEGER_MAX}
        )
      ),
      traffic_gb integer check (
        traffic_gb is null
        or (
          typeof(traffic_gb) = 'integer'
          and traffic_gb between 1 and ${SAFE_INTEGER_MAX}
        )
      ),
      never_expires integer not null check (
        typeof(never_expires) = 'integer' and never_expires in (0, 1)
      ),
      discount_basis_points integer check (
        discount_basis_points is null
        or (
          typeof(discount_basis_points) = 'integer'
          and discount_basis_points between 0 and 10000
        )
      ),
      created_at text not null,
      published_at text,
      retired_at text,
      unique (offer_ref, version),
      check (
        (
          category = 'plan'
          and delivery_kind = 'subscription_plan'
          and duration_days is not null
          and monthly_traffic_gb is not null
          and traffic_gb is null
          and never_expires = 0
          and discount_basis_points is not null
        )
        or
        (
          category = 'data_pack'
          and delivery_kind = 'data_pack'
          and duration_days is null
          and monthly_traffic_gb is null
          and traffic_gb is not null
          and never_expires = 1
          and discount_basis_points is null
        )
      ),
      check (
        (status = 'draft' and published_at is null and retired_at is null)
        or
        (status = 'published' and published_at is not null and retired_at is null)
        or
        (status = 'retired' and published_at is not null and retired_at is not null)
      )
    )
  `,
  `
    create table platform_coin_commerce_quotes (
      quote_ref text primary key,
      account_id text not null references platform_accounts(id),
      offer_version_ref text not null
        references platform_coin_commerce_offer_versions(offer_version_ref),
      wallet_version integer not null check (
        typeof(wallet_version) = 'integer'
        and wallet_version between 0 and ${SAFE_INTEGER_MAX}
      ),
      amount_units integer not null check (
        typeof(amount_units) = 'integer'
        and amount_units between 1 and ${SAFE_INTEGER_MAX}
      ),
      applied_discount_basis_points integer not null check (
        typeof(applied_discount_basis_points) = 'integer'
        and applied_discount_basis_points between 0 and 10000
      ),
      purchase_availability text not null check (
        purchase_availability in ('available', 'insufficient_balance')
      ),
      shortfall_units integer not null check (
        typeof(shortfall_units) = 'integer'
        and shortfall_units between 0 and ${SAFE_INTEGER_MAX}
      ),
      allocation_json text not null check (
        json_valid(allocation_json) and json_type(allocation_json) = 'array'
      ),
      before_balance_json text not null check (
        json_valid(before_balance_json) and json_type(before_balance_json) = 'object'
      ),
      after_balance_json text not null check (
        json_valid(after_balance_json) and json_type(after_balance_json) = 'object'
      ),
      status text not null check (status in ('active', 'consumed', 'expired')),
      created_at text not null,
      expires_at text not null,
      consumed_at text,
      check (
        (
          purchase_availability = 'available'
          and shortfall_units = 0
        )
        or
        (
          purchase_availability = 'insufficient_balance'
          and shortfall_units > 0
          and json_array_length(allocation_json) = 0
          and json(before_balance_json) = json(after_balance_json)
        )
      ),
      check (
        (status = 'consumed' and consumed_at is not null)
        or
        (status in ('active', 'expired') and consumed_at is null)
      )
    )
  `,
  `
    create table platform_coin_commerce_orders (
      order_ref text primary key,
      account_id text not null references platform_accounts(id),
      quote_ref text not null unique
        references platform_coin_commerce_quotes(quote_ref),
      offer_version_ref text not null
        references platform_coin_commerce_offer_versions(offer_version_ref),
      hold_ref text not null unique references platform_coin_holds(hold_ref),
      amount_units integer not null check (
        typeof(amount_units) = 'integer'
        and amount_units between 1 and ${SAFE_INTEGER_MAX}
      ),
      offer_snapshot_json text not null check (
        json_valid(offer_snapshot_json) and json_type(offer_snapshot_json) = 'object'
      ),
      allocation_snapshot_json text not null check (
        json_valid(allocation_snapshot_json)
        and json_type(allocation_snapshot_json) = 'array'
      ),
      payment_status text not null check (
        payment_status in (
          'held',
          'capture_pending',
          'captured',
          'cancelled',
          'capture_failed',
          'reconciliation_required'
        )
      ),
      cancel_until text not null,
      created_at text not null,
      updated_at text not null
    )
  `,
  `
    create table platform_coin_commerce_operation_receipts (
      operation_ref text primary key,
      account_id text not null references platform_accounts(id),
      actor_scope text not null,
      operation_type text not null check (
        operation_type in (
          'publish_offer',
          'create_quote',
          'confirm_order',
          'cancel_order',
          'claim_capture',
          'capture_order',
          'fulfillment_result'
        )
      ),
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
    create table platform_coin_commerce_order_events (
      event_ref text primary key,
      order_ref text not null references platform_coin_commerce_orders(order_ref),
      event_type text not null check (
        event_type in (
          'order_held',
          'order_cancelled',
          'capture_claimed',
          'payment_captured',
          'fulfillment_delivered',
          'fulfillment_failed',
          'reconciliation_required'
        )
      ),
      safe_code text,
      actor_type text not null check (
        actor_type in ('portal_user', 'commerce_system')
      ),
      actor_ref text not null,
      occurred_at text not null,
      check (
        (
          event_type in ('fulfillment_failed', 'reconciliation_required')
          and safe_code is not null
        )
        or
        (
          event_type not in ('fulfillment_failed', 'reconciliation_required')
          and safe_code is null
        )
      )
    )
  `,
  `
    create table platform_coin_commerce_fulfillment_commands (
      command_ref text primary key,
      order_ref text not null unique references platform_coin_commerce_orders(order_ref),
      account_id text not null references platform_accounts(id),
      payload_json text not null check (
        json_valid(payload_json) and json_type(payload_json) = 'object'
      ),
      status text not null check (
        status in ('pending', 'processing', 'delivered', 'failed')
      ),
      attempt_count integer not null check (
        typeof(attempt_count) = 'integer'
        and attempt_count between 0 and ${COUNTER_MAX}
      ),
      lease_generation integer not null check (
        typeof(lease_generation) = 'integer'
        and lease_generation between 0 and ${COUNTER_MAX}
      ),
      lease_token text,
      lease_until text,
      safe_failure_code text,
      created_at text not null,
      updated_at text not null,
      check (
        (
          status = 'processing'
          and lease_token is not null
          and length(lease_token) > 0
          and lease_until is not null
        )
        or
        (
          status <> 'processing'
          and lease_token is null
          and lease_until is null
        )
      ),
      check (
        (status = 'failed' and safe_failure_code is not null)
        or
        (status <> 'failed' and safe_failure_code is null)
      )
    )
  `,
  `
    create table platform_coin_commerce_fulfillment_receipts (
      receipt_ref text primary key,
      command_ref text not null
        references platform_coin_commerce_fulfillment_commands(command_ref),
      effect_ref text not null,
      status text not null check (status = 'delivered'),
      safe_code text check (safe_code is null),
      recorded_at text not null,
      unique (command_ref, effect_ref)
    )
  `,
  `
    create unique index offer_versions_one_published_idx
      on platform_coin_commerce_offer_versions(offer_ref)
      where status = 'published'
  `,
  `
    create index offer_versions_published_list_idx
      on platform_coin_commerce_offer_versions(category, published_at desc, offer_ref)
      where status = 'published'
  `,
  `
    create index quotes_account_status_expiry_idx
      on platform_coin_commerce_quotes(account_id, status, expires_at, quote_ref)
  `,
  `
    create index orders_due_capture_idx
      on platform_coin_commerce_orders(cancel_until, order_ref)
      where payment_status = 'held'
  `,
  `
    create index orders_capture_pending_idx
      on platform_coin_commerce_orders(updated_at, order_ref)
      where payment_status = 'capture_pending'
  `,
  `
    create index operation_receipts_replay_idx
      on platform_coin_commerce_operation_receipts(
        actor_scope,
        operation_type,
        idempotency_key
      )
  `,
  `
    create index order_events_order_page_idx
      on platform_coin_commerce_order_events(order_ref, occurred_at desc, event_ref desc)
  `,
  `
    create index fulfillment_commands_claim_idx
      on platform_coin_commerce_fulfillment_commands(status, lease_until, updated_at, command_ref)
  `,
  `
    create index fulfillment_receipts_command_idx
      on platform_coin_commerce_fulfillment_receipts(command_ref, recorded_at, receipt_ref)
  `,
  `
    create trigger coin_commerce_order_events_immutable_update
    before update on platform_coin_commerce_order_events
    begin
      select raise(abort, 'coin_commerce_order_event_immutable');
    end
  `,
  `
    create trigger coin_commerce_order_events_immutable_delete
    before delete on platform_coin_commerce_order_events
    begin
      select raise(abort, 'coin_commerce_order_event_immutable');
    end
  `,
  `
    create trigger coin_commerce_fulfillment_receipts_immutable_update
    before update on platform_coin_commerce_fulfillment_receipts
    begin
      select raise(abort, 'coin_commerce_fulfillment_receipt_immutable');
    end
  `,
  `
    create trigger coin_commerce_fulfillment_receipts_immutable_delete
    before delete on platform_coin_commerce_fulfillment_receipts
    begin
      select raise(abort, 'coin_commerce_fulfillment_receipt_immutable');
    end
  `,
  `
    create trigger coin_commerce_quotes_snapshot_immutable_update
    before update of
      quote_ref,
      account_id,
      offer_version_ref,
      wallet_version,
      amount_units,
      applied_discount_basis_points,
      purchase_availability,
      shortfall_units,
      allocation_json,
      before_balance_json,
      after_balance_json,
      created_at,
      expires_at
    on platform_coin_commerce_quotes
    begin
      select raise(abort, 'coin_commerce_quote_snapshot_immutable');
    end
  `,
  `
    create trigger coin_commerce_orders_snapshot_immutable_update
    before update of
      order_ref,
      account_id,
      quote_ref,
      offer_version_ref,
      hold_ref,
      amount_units,
      offer_snapshot_json,
      allocation_snapshot_json,
      cancel_until,
      created_at
    on platform_coin_commerce_orders
    begin
      select raise(abort, 'coin_commerce_order_snapshot_immutable');
    end
  `,
  `
    create trigger coin_commerce_offer_versions_content_immutable_update
    before update of
      offer_version_ref,
      offer_ref,
      version,
      category,
      title_zh,
      title_en,
      summary_zh,
      summary_en,
      important_notices_zh_json,
      important_notices_en_json,
      base_coin_units,
      reference_currency,
      reference_amount_minor,
      accepted_coin_types_json,
      delivery_kind,
      duration_days,
      monthly_traffic_gb,
      traffic_gb,
      never_expires,
      discount_basis_points,
      created_at,
      published_at
    on platform_coin_commerce_offer_versions
    when old.status in ('published', 'retired')
    begin
      select raise(abort, 'coin_commerce_offer_content_immutable');
    end
  `,
  `
    create trigger coin_commerce_offer_versions_status_transition
    before update of status on platform_coin_commerce_offer_versions
    when
      new.status <> old.status
      and not (
        (old.status = 'draft' and new.status = 'published')
        or (old.status = 'published' and new.status = 'retired')
      )
    begin
      select raise(abort, 'coin_commerce_offer_status_transition');
    end
  `,
  `
    create trigger coin_commerce_quotes_status_transition
    before update of status on platform_coin_commerce_quotes
    when
      new.status <> old.status
      and not (
        old.status = 'active' and new.status in ('consumed', 'expired')
      )
    begin
      select raise(abort, 'coin_commerce_quote_status_transition');
    end
  `,
  `
    create trigger coin_commerce_orders_payment_status_transition
    before update of payment_status on platform_coin_commerce_orders
    when
      new.payment_status <> old.payment_status
      and not (
        (
          old.payment_status = 'held'
          and new.payment_status in ('cancelled', 'capture_pending')
        )
        or
        (
          old.payment_status = 'capture_pending'
          and new.payment_status in (
            'captured',
            'capture_failed',
            'reconciliation_required'
          )
        )
        or
        (
          old.payment_status = 'capture_failed'
          and new.payment_status = 'capture_pending'
        )
        or
        (
          old.payment_status in ('captured', 'cancelled')
          and new.payment_status = 'reconciliation_required'
        )
      )
    begin
      select raise(abort, 'coin_commerce_order_payment_status_transition');
    end
  `,
  `
    create trigger coin_commerce_operation_receipts_status_transition
    before update of status on platform_coin_commerce_operation_receipts
    when
      new.status <> old.status
      and not (
        old.status = 'started' and new.status in ('succeeded', 'failed')
      )
    begin
      select raise(abort, 'coin_commerce_operation_receipt_status_transition');
    end
  `,
  `
    create trigger coin_commerce_fulfillment_commands_status_transition
    before update of status on platform_coin_commerce_fulfillment_commands
    when
      new.status <> old.status
      and not (
        (old.status = 'pending' and new.status in ('processing', 'failed'))
        or
        (
          old.status = 'processing'
          and new.status in ('pending', 'delivered', 'failed')
        )
      )
    begin
      select raise(abort, 'coin_commerce_fulfillment_command_status_transition');
    end
  `,
  `
    create trigger coin_commerce_offer_versions_terminal_immutable_update
    before update of status, published_at, retired_at
    on platform_coin_commerce_offer_versions
    when
      old.status = 'retired'
      or (
        old.status = 'published'
        and not (
          new.status = 'retired'
          and new.published_at is old.published_at
          and old.retired_at is null
          and new.retired_at is not null
        )
      )
    begin
      select raise(abort, 'coin_commerce_offer_terminal_immutable');
    end
  `,
  `
    create trigger coin_commerce_quotes_terminal_immutable_update
    before update of status, consumed_at
    on platform_coin_commerce_quotes
    when old.status in ('consumed', 'expired')
    begin
      select raise(abort, 'coin_commerce_quote_terminal_immutable');
    end
  `,
  `
    create trigger coin_commerce_operation_receipts_identity_immutable_update
    before update of
      operation_ref,
      account_id,
      actor_scope,
      operation_type,
      idempotency_key,
      request_digest,
      created_at
    on platform_coin_commerce_operation_receipts
    begin
      select raise(abort, 'coin_commerce_operation_receipt_identity_immutable');
    end
  `,
  `
    create trigger coin_commerce_operation_receipts_terminal_immutable_update
    before update of status, result_ref, safe_result_code, completed_at
    on platform_coin_commerce_operation_receipts
    when old.status in ('succeeded', 'failed')
    begin
      select raise(abort, 'coin_commerce_operation_receipt_terminal_immutable');
    end
  `
]);

const OWNED_OBJECTS = Object.freeze([
  ["table", "platform_coin_commerce_offer_versions"],
  ["table", "platform_coin_commerce_quotes"],
  ["table", "platform_coin_commerce_orders"],
  ["table", "platform_coin_commerce_operation_receipts"],
  ["table", "platform_coin_commerce_order_events"],
  ["table", "platform_coin_commerce_fulfillment_commands"],
  ["table", "platform_coin_commerce_fulfillment_receipts"],
  ["index", "offer_versions_one_published_idx"],
  ["index", "offer_versions_published_list_idx"],
  ["index", "quotes_account_status_expiry_idx"],
  ["index", "orders_due_capture_idx"],
  ["index", "orders_capture_pending_idx"],
  ["index", "operation_receipts_replay_idx"],
  ["index", "order_events_order_page_idx"],
  ["index", "fulfillment_commands_claim_idx"],
  ["index", "fulfillment_receipts_command_idx"],
  ["trigger", "coin_commerce_order_events_immutable_update"],
  ["trigger", "coin_commerce_order_events_immutable_delete"],
  ["trigger", "coin_commerce_fulfillment_receipts_immutable_update"],
  ["trigger", "coin_commerce_fulfillment_receipts_immutable_delete"],
  ["trigger", "coin_commerce_quotes_snapshot_immutable_update"],
  ["trigger", "coin_commerce_orders_snapshot_immutable_update"],
  ["trigger", "coin_commerce_offer_versions_content_immutable_update"],
  ["trigger", "coin_commerce_offer_versions_status_transition"],
  ["trigger", "coin_commerce_quotes_status_transition"],
  ["trigger", "coin_commerce_orders_payment_status_transition"],
  ["trigger", "coin_commerce_operation_receipts_status_transition"],
  ["trigger", "coin_commerce_fulfillment_commands_status_transition"],
  ["trigger", "coin_commerce_offer_versions_terminal_immutable_update"],
  ["trigger", "coin_commerce_quotes_terminal_immutable_update"],
  ["trigger", "coin_commerce_operation_receipts_identity_immutable_update"],
  ["trigger", "coin_commerce_operation_receipts_terminal_immutable_update"]
]);

const EXPECTED_NAMESPACE_OBJECTS = new Set(
  OWNED_OBJECTS.map(([type, name]) => `${type}:${name}`)
);

const EXPECTED_COLUMNS = Object.freeze({
  platform_coin_commerce_offer_versions: [
    ["offer_version_ref", "TEXT", 0, null, 1],
    ["offer_ref", "TEXT", 1, null, 0],
    ["version", "INTEGER", 1, null, 0],
    ["status", "TEXT", 1, null, 0],
    ["category", "TEXT", 1, null, 0],
    ["title_zh", "TEXT", 1, null, 0],
    ["title_en", "TEXT", 1, null, 0],
    ["summary_zh", "TEXT", 1, null, 0],
    ["summary_en", "TEXT", 1, null, 0],
    ["important_notices_zh_json", "TEXT", 1, null, 0],
    ["important_notices_en_json", "TEXT", 1, null, 0],
    ["base_coin_units", "INTEGER", 1, null, 0],
    ["reference_currency", "TEXT", 1, null, 0],
    ["reference_amount_minor", "INTEGER", 1, null, 0],
    ["accepted_coin_types_json", "TEXT", 1, null, 0],
    ["delivery_kind", "TEXT", 1, null, 0],
    ["duration_days", "INTEGER", 0, null, 0],
    ["monthly_traffic_gb", "INTEGER", 0, null, 0],
    ["traffic_gb", "INTEGER", 0, null, 0],
    ["never_expires", "INTEGER", 1, null, 0],
    ["discount_basis_points", "INTEGER", 0, null, 0],
    ["created_at", "TEXT", 1, null, 0],
    ["published_at", "TEXT", 0, null, 0],
    ["retired_at", "TEXT", 0, null, 0]
  ],
  platform_coin_commerce_quotes: [
    ["quote_ref", "TEXT", 0, null, 1],
    ["account_id", "TEXT", 1, null, 0],
    ["offer_version_ref", "TEXT", 1, null, 0],
    ["wallet_version", "INTEGER", 1, null, 0],
    ["amount_units", "INTEGER", 1, null, 0],
    ["applied_discount_basis_points", "INTEGER", 1, null, 0],
    ["purchase_availability", "TEXT", 1, null, 0],
    ["shortfall_units", "INTEGER", 1, null, 0],
    ["allocation_json", "TEXT", 1, null, 0],
    ["before_balance_json", "TEXT", 1, null, 0],
    ["after_balance_json", "TEXT", 1, null, 0],
    ["status", "TEXT", 1, null, 0],
    ["created_at", "TEXT", 1, null, 0],
    ["expires_at", "TEXT", 1, null, 0],
    ["consumed_at", "TEXT", 0, null, 0]
  ],
  platform_coin_commerce_orders: [
    ["order_ref", "TEXT", 0, null, 1],
    ["account_id", "TEXT", 1, null, 0],
    ["quote_ref", "TEXT", 1, null, 0],
    ["offer_version_ref", "TEXT", 1, null, 0],
    ["hold_ref", "TEXT", 1, null, 0],
    ["amount_units", "INTEGER", 1, null, 0],
    ["offer_snapshot_json", "TEXT", 1, null, 0],
    ["allocation_snapshot_json", "TEXT", 1, null, 0],
    ["payment_status", "TEXT", 1, null, 0],
    ["cancel_until", "TEXT", 1, null, 0],
    ["created_at", "TEXT", 1, null, 0],
    ["updated_at", "TEXT", 1, null, 0]
  ],
  platform_coin_commerce_operation_receipts: [
    ["operation_ref", "TEXT", 0, null, 1],
    ["account_id", "TEXT", 1, null, 0],
    ["actor_scope", "TEXT", 1, null, 0],
    ["operation_type", "TEXT", 1, null, 0],
    ["idempotency_key", "TEXT", 1, null, 0],
    ["request_digest", "TEXT", 1, null, 0],
    ["status", "TEXT", 1, null, 0],
    ["result_ref", "TEXT", 0, null, 0],
    ["safe_result_code", "TEXT", 0, null, 0],
    ["created_at", "TEXT", 1, null, 0],
    ["completed_at", "TEXT", 0, null, 0]
  ],
  platform_coin_commerce_order_events: [
    ["event_ref", "TEXT", 0, null, 1],
    ["order_ref", "TEXT", 1, null, 0],
    ["event_type", "TEXT", 1, null, 0],
    ["safe_code", "TEXT", 0, null, 0],
    ["actor_type", "TEXT", 1, null, 0],
    ["actor_ref", "TEXT", 1, null, 0],
    ["occurred_at", "TEXT", 1, null, 0]
  ],
  platform_coin_commerce_fulfillment_commands: [
    ["command_ref", "TEXT", 0, null, 1],
    ["order_ref", "TEXT", 1, null, 0],
    ["account_id", "TEXT", 1, null, 0],
    ["payload_json", "TEXT", 1, null, 0],
    ["status", "TEXT", 1, null, 0],
    ["attempt_count", "INTEGER", 1, null, 0],
    ["lease_generation", "INTEGER", 1, null, 0],
    ["lease_token", "TEXT", 0, null, 0],
    ["lease_until", "TEXT", 0, null, 0],
    ["safe_failure_code", "TEXT", 0, null, 0],
    ["created_at", "TEXT", 1, null, 0],
    ["updated_at", "TEXT", 1, null, 0]
  ],
  platform_coin_commerce_fulfillment_receipts: [
    ["receipt_ref", "TEXT", 0, null, 1],
    ["command_ref", "TEXT", 1, null, 0],
    ["effect_ref", "TEXT", 1, null, 0],
    ["status", "TEXT", 1, null, 0],
    ["safe_code", "TEXT", 0, null, 0],
    ["recorded_at", "TEXT", 1, null, 0]
  ]
});

const EXPECTED_FOREIGN_KEYS = Object.freeze({
  platform_coin_commerce_offer_versions: [],
  platform_coin_commerce_quotes: [
    ["account_id", "platform_accounts", "id"],
    ["offer_version_ref", "platform_coin_commerce_offer_versions", "offer_version_ref"]
  ],
  platform_coin_commerce_orders: [
    ["account_id", "platform_accounts", "id"],
    ["hold_ref", "platform_coin_holds", "hold_ref"],
    ["offer_version_ref", "platform_coin_commerce_offer_versions", "offer_version_ref"],
    ["quote_ref", "platform_coin_commerce_quotes", "quote_ref"]
  ],
  platform_coin_commerce_operation_receipts: [
    ["account_id", "platform_accounts", "id"]
  ],
  platform_coin_commerce_order_events: [
    ["order_ref", "platform_coin_commerce_orders", "order_ref"]
  ],
  platform_coin_commerce_fulfillment_commands: [
    ["account_id", "platform_accounts", "id"],
    ["order_ref", "platform_coin_commerce_orders", "order_ref"]
  ],
  platform_coin_commerce_fulfillment_receipts: [
    ["command_ref", "platform_coin_commerce_fulfillment_commands", "command_ref"]
  ]
});

const EXPECTED_INDEXES = Object.freeze({
  offer_versions_one_published_idx: [
    "platform_coin_commerce_offer_versions", ["offer_ref"], 1, 1
  ],
  offer_versions_published_list_idx: [
    "platform_coin_commerce_offer_versions",
    ["category", "published_at", "offer_ref"],
    0,
    1
  ],
  quotes_account_status_expiry_idx: [
    "platform_coin_commerce_quotes",
    ["account_id", "status", "expires_at", "quote_ref"],
    0,
    0
  ],
  orders_due_capture_idx: [
    "platform_coin_commerce_orders", ["cancel_until", "order_ref"], 0, 1
  ],
  orders_capture_pending_idx: [
    "platform_coin_commerce_orders", ["updated_at", "order_ref"], 0, 1
  ],
  operation_receipts_replay_idx: [
    "platform_coin_commerce_operation_receipts",
    ["actor_scope", "operation_type", "idempotency_key"],
    0,
    0
  ],
  order_events_order_page_idx: [
    "platform_coin_commerce_order_events",
    ["order_ref", "occurred_at", "event_ref"],
    0,
    0
  ],
  fulfillment_commands_claim_idx: [
    "platform_coin_commerce_fulfillment_commands",
    ["status", "lease_until", "updated_at", "command_ref"],
    0,
    0
  ],
  fulfillment_receipts_command_idx: [
    "platform_coin_commerce_fulfillment_receipts",
    ["command_ref", "recorded_at", "receipt_ref"],
    0,
    0
  ]
});

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
    .replace(/\s*([(),=+<>])\s*/g, "$1")
    .toLowerCase()
    .replace(/\0(\d+)\0/g, (_match, index) => literals[Number(index)]);
}

const EXPECTED_OBJECT_SQL = new Map(
  OWNED_OBJECTS.map(([type, name], index) => [
    `${type}:${name}`,
    normalizeSql(MIGRATION_STATEMENTS[index])
  ])
);

const DDL_CHECKSUM = createHash("sha256")
  .update(
    `GCCWEBOS:COIN_COMMERCE_DDL:v1\0${MIGRATION_STATEMENTS
      .map(normalizeSql)
      .join("\0")}`,
    "utf8"
  )
  .digest("hex");

export const COIN_COMMERCE_MIGRATIONS = Object.freeze([
  Object.freeze({
    id: REQUIRED_COIN_COMMERCE_MIGRATION_ID,
    ddlChecksum: DDL_CHECKSUM
  })
]);

// Optional, explicitly installed extension. The foundation DDL and checksum above
// remain frozen so an unused extension can be removed without rewriting history.
export const REQUIRED_COIN_COMMERCE_INITIAL_CONFIRMATION_MIGRATION_ID =
  "20260906_001_coin_commerce_initial_confirmation";
const INITIAL_CONFIRMATION_TABLE = "platform_coin_commerce_initial_confirmations";
const INITIAL_CONFIRMATION_OBJECTS = Object.freeze([
  ["table", INITIAL_CONFIRMATION_TABLE],
  ["trigger", "coin_commerce_initial_confirmations_insert_guard"],
  ["trigger", "coin_commerce_initial_confirmations_immutable_update"],
  ["trigger", "coin_commerce_initial_confirmations_immutable_delete"]
]);
const INITIAL_CONFIRMATION_TRIGGER_NAMES = Object.freeze([
  "coin_commerce_orders_payment_status_transition",
  "coin_commerce_fulfillment_commands_status_transition"
]);
const INITIAL_CONFIRMATION_STATEMENTS = Object.freeze([
  `create table platform_coin_commerce_initial_confirmations (
    confirmation_ref text primary key not null check (length(trim(confirmation_ref)) > 0),
    command_ref text not null unique references platform_coin_commerce_fulfillment_commands(command_ref),
    order_ref text not null unique references platform_coin_commerce_orders(order_ref),
    account_id text not null references platform_accounts(id),
    effect_ref text not null unique references platform_audit_events(id),
    approval_sha256 text not null unique check (
      length(approval_sha256) = 64 and approval_sha256 not glob '*[^0-9a-f]*'
    ),
    inventory_sha256 text not null check (
      length(inventory_sha256) = 64 and inventory_sha256 not glob '*[^0-9a-f]*'
    ),
    effect_sha256 text not null check (
      length(effect_sha256) = 64 and effect_sha256 not glob '*[^0-9a-f]*'
    ),
    receipt_ref text not null unique check (length(trim(receipt_ref)) > 0),
    operator_ref text not null check (length(trim(operator_ref)) > 0),
    resource_request_ref text not null references platform_issuance_requests(id),
    entitlement_ref text not null references platform_entitlements(id),
    issued_link_ref text not null references platform_issued_subscription_links(id),
    failed_updated_at text not null,
    attempt_count integer not null check (
      typeof(attempt_count) = 'integer' and attempt_count between 1 and ${COUNTER_MAX}
    ),
    lease_generation integer not null check (
      typeof(lease_generation) = 'integer' and lease_generation between 1 and ${COUNTER_MAX}
    ),
    confirmed_at text not null check (
      length(confirmed_at) = 24
      and strftime('%Y-%m-%dT%H:%M:%fZ', confirmed_at) is not null
      and strftime('%Y-%m-%dT%H:%M:%fZ', confirmed_at) = confirmed_at
      and confirmed_at >= failed_updated_at
    )
  )`,
  `create trigger coin_commerce_initial_confirmations_insert_guard
   before insert on platform_coin_commerce_initial_confirmations
   when not exists (
     select 1
       from platform_coin_commerce_fulfillment_commands c
       join platform_coin_commerce_orders o on o.order_ref = c.order_ref
       join platform_coin_holds h on h.hold_ref = o.hold_ref
       join platform_coin_wallets w on w.wallet_ref = h.wallet_ref
       join platform_audit_events a on a.id = new.effect_ref
       join platform_issuance_requests r on r.id = new.resource_request_ref
       join platform_entitlements e on e.id = new.entitlement_ref
       join platform_issued_subscription_links l on l.id = new.issued_link_ref
      where c.command_ref = new.command_ref
        and c.order_ref = new.order_ref and c.account_id = new.account_id
        and c.status = 'failed' and c.safe_failure_code = 'fulfillment_handler_unavailable'
        and c.lease_token is null and c.lease_until is null
        and c.updated_at = new.failed_updated_at
        and c.attempt_count = new.attempt_count and c.lease_generation = new.lease_generation
        and o.account_id = new.account_id and o.payment_status = 'reconciliation_required'
        and o.updated_at = new.failed_updated_at
        and h.status = 'captured' and h.purpose = 'product_purchase'
        and h.purpose_ref = o.order_ref and h.amount_units = o.amount_units
        and w.account_id = new.account_id
        and a.entity_type = 'coin_commerce_subscription_fulfillment'
        and a.entity_ref = new.entitlement_ref
        and a.action = 'subscription_fulfillment_applied'
        and a.actor_ref = 'coin_commerce_fulfillment' and a.created_at = new.confirmed_at
        and json_valid(a.metadata_json)
        and json_extract(a.metadata_json, '$.version') = 1
        and json_extract(a.metadata_json, '$.commandRef') = new.command_ref
        and json_extract(a.metadata_json, '$.orderRef') = new.order_ref
        and json_extract(a.metadata_json, '$.accountId') = new.account_id
        and json_extract(a.metadata_json, '$.requestRef') = new.resource_request_ref
        and json_extract(a.metadata_json, '$.entitlementRef') = new.entitlement_ref
        and json_extract(a.metadata_json, '$.issuedLinkRef') = new.issued_link_ref
        and json_extract(a.metadata_json, '$.offerVersionRef') = o.offer_version_ref
        and r.account_id = new.account_id and r.entitlement_id = e.id
        and r.status = 'issued' and r.quantity = 1
        and r.purpose = 'coin_commerce_product_fulfillment'
        and e.account_id = new.account_id and e.status = 'active'
        and l.request_id = r.id and l.status = 'active'
        and json_extract(a.metadata_json, '$.tenantRef') = l.tenant_ref
        and json_extract(a.metadata_json, '$.artifactRef') = l.artifact_ref
        and not exists (
          select 1 from platform_coin_commerce_fulfillment_receipts f
           where f.command_ref = c.command_ref or f.receipt_ref = new.receipt_ref
        )
   )
   begin select raise(abort, 'coin_commerce_initial_confirmation_binding_invalid'); end`,
  `create trigger coin_commerce_initial_confirmations_immutable_update
   before update on platform_coin_commerce_initial_confirmations
   begin select raise(abort, 'coin_commerce_initial_confirmation_immutable'); end`,
  `create trigger coin_commerce_initial_confirmations_immutable_delete
   before delete on platform_coin_commerce_initial_confirmations
   begin select raise(abort, 'coin_commerce_initial_confirmation_immutable'); end`,
  `create trigger coin_commerce_orders_payment_status_transition
   before update of payment_status on platform_coin_commerce_orders
   when new.payment_status <> old.payment_status and not (
     (old.payment_status = 'held' and new.payment_status in ('cancelled', 'capture_pending'))
     or (old.payment_status = 'capture_pending'
       and new.payment_status in ('captured', 'capture_failed', 'reconciliation_required'))
     or (old.payment_status = 'capture_failed' and new.payment_status = 'capture_pending')
     or (old.payment_status in ('captured', 'cancelled') and new.payment_status = 'reconciliation_required')
     or (old.payment_status = 'reconciliation_required' and new.payment_status = 'captured'
       and exists (
         select 1 from platform_coin_commerce_initial_confirmations x
         join platform_coin_commerce_fulfillment_commands c on c.command_ref = x.command_ref
         join platform_coin_commerce_fulfillment_receipts f on f.receipt_ref = x.receipt_ref
         join platform_coin_holds h on h.hold_ref = old.hold_ref
         join platform_coin_wallets w on w.wallet_ref = h.wallet_ref
         where x.order_ref = old.order_ref and x.account_id = old.account_id
           and old.updated_at = x.failed_updated_at
           and c.order_ref = old.order_ref and c.account_id = old.account_id
           and c.status = 'delivered' and c.safe_failure_code is null
           and c.lease_token is null and c.lease_until is null
           and c.updated_at = x.confirmed_at and c.attempt_count = x.attempt_count
           and c.lease_generation = x.lease_generation
           and new.updated_at = x.confirmed_at
           and f.command_ref = c.command_ref and f.effect_ref = x.effect_ref
           and f.status = 'delivered' and f.safe_code is null and f.recorded_at = x.confirmed_at
           and (select count(*) from platform_coin_commerce_fulfillment_receipts
                 where command_ref = c.command_ref) = 1
           and h.status = 'captured' and h.purpose = 'product_purchase'
           and h.purpose_ref = old.order_ref and h.amount_units = old.amount_units
           and w.account_id = old.account_id
       ))
   )
   begin select raise(abort, 'coin_commerce_order_payment_status_transition'); end`,
  `create trigger coin_commerce_fulfillment_commands_status_transition
   before update of status on platform_coin_commerce_fulfillment_commands
   when new.status <> old.status and not (
     (old.status = 'pending' and new.status in ('processing', 'failed'))
     or (old.status = 'processing' and new.status in ('pending', 'delivered', 'failed'))
     or (old.status = 'failed' and new.status = 'delivered'
       and old.safe_failure_code = 'fulfillment_handler_unavailable'
       and old.lease_token is null and old.lease_until is null
       and new.safe_failure_code is null and new.lease_token is null and new.lease_until is null
       and new.command_ref = old.command_ref and new.order_ref = old.order_ref
       and new.account_id = old.account_id and new.payload_json = old.payload_json
       and new.attempt_count = old.attempt_count and new.lease_generation = old.lease_generation
       and new.created_at = old.created_at
       and exists (
         select 1 from platform_coin_commerce_initial_confirmations x
         join platform_coin_commerce_orders o on o.order_ref = x.order_ref
         join platform_coin_commerce_fulfillment_receipts f on f.receipt_ref = x.receipt_ref
         join platform_audit_events a on a.id = x.effect_ref
         join platform_coin_holds h on h.hold_ref = o.hold_ref
         join platform_coin_wallets w on w.wallet_ref = h.wallet_ref
         where x.command_ref = old.command_ref and x.order_ref = old.order_ref
           and x.account_id = old.account_id and x.failed_updated_at = old.updated_at
           and x.attempt_count = old.attempt_count and x.lease_generation = old.lease_generation
           and new.updated_at = x.confirmed_at
           and o.account_id = old.account_id and o.payment_status = 'reconciliation_required'
           and o.updated_at = x.failed_updated_at
           and f.command_ref = old.command_ref and f.effect_ref = x.effect_ref
           and f.status = 'delivered' and f.safe_code is null and f.recorded_at = x.confirmed_at
           and (select count(*) from platform_coin_commerce_fulfillment_receipts
                 where command_ref = old.command_ref) = 1
           and a.entity_type = 'coin_commerce_subscription_fulfillment'
           and a.entity_ref = x.entitlement_ref and a.action = 'subscription_fulfillment_applied'
           and a.actor_ref = 'coin_commerce_fulfillment' and a.created_at = x.confirmed_at
           and json_extract(a.metadata_json, '$.commandRef') = old.command_ref
           and json_extract(a.metadata_json, '$.orderRef') = old.order_ref
           and json_extract(a.metadata_json, '$.accountId') = old.account_id
           and h.status = 'captured' and h.purpose = 'product_purchase'
           and h.purpose_ref = old.order_ref and h.amount_units = o.amount_units
           and w.account_id = old.account_id
       ))
   )
   begin select raise(abort, 'coin_commerce_fulfillment_command_status_transition'); end`
]);
const INITIAL_CONFIRMATION_OBJECT_SQL = new Map(
  [...INITIAL_CONFIRMATION_OBJECTS,
    ...INITIAL_CONFIRMATION_TRIGGER_NAMES.map((name) => ["trigger", name])]
    .map(([type, name], index) => [
      `${type}:${name}`, normalizeSql(INITIAL_CONFIRMATION_STATEMENTS[index])
    ])
);
const INITIAL_CONFIRMATION_CHECKSUM = createHash("sha256")
  .update(`GCCWEBOS:COIN_COMMERCE_INITIAL_CONFIRMATION_DDL:v1\0${INITIAL_CONFIRMATION_STATEMENTS
    .map(normalizeSql).join("\0")}`, "utf8").digest("hex");
export const COIN_COMMERCE_INITIAL_CONFIRMATION_MIGRATIONS = Object.freeze([
  Object.freeze({ id: REQUIRED_COIN_COMMERCE_INITIAL_CONFIRMATION_MIGRATION_ID,
    ddlChecksum: INITIAL_CONFIRMATION_CHECKSUM })
]);

const KNOWN_ERROR_CODES = new Set([
  "commerce_invalid_migration_contract",
  "commerce_invalid_database_path",
  "commerce_invalid_temp_root",
  "commerce_migration_id_mismatch",
  "commerce_migration_checksum_mismatch",
  "commerce_migration_dependency_missing",
  "commerce_owned_object_without_migration",
  "commerce_applied_schema_incompatible",
  "commerce_initial_confirmation_schema_incompatible",
  "commerce_initial_confirmation_migration_in_use",
  "commerce_source_changed_during_dry_run"
]);

function commerceMigrationError(code) {
  const error = new Error("Coin commerce schema operation rejected");
  error.code = code;
  return error;
}

function assertDatabasePath(dbPath) {
  if (typeof dbPath !== "string" || !isAbsolute(dbPath)) {
    throw commerceMigrationError("commerce_invalid_database_path");
  }
}

function objectRow(database, type, name) {
  return database.prepare(
    "select type, name, sql from sqlite_master where type = ? and name = ?"
  ).get(type, name) ?? null;
}

function commerceNamespaceObjects(database) {
  return database.prepare(`
    select type, name, tbl_name, sql
      from sqlite_master
     where (
       type = 'table'
       and lower(name) glob 'platform_coin_commerce_*'
     )
        or (
          type in ('index', 'trigger')
          and lower(tbl_name) glob 'platform_coin_commerce_*'
        )
     order by type, name
  `).all().filter((row) => !(
    row.type === "index"
    && row.sql === null
    && row.name.startsWith("sqlite_autoindex_")
  ));
}

function commerceNamespaceIsExact(database, extensionPresent = false) {
  const actual = commerceNamespaceObjects(database)
    .map(({ type, name }) => `${type}:${name}`);
  const expected = extensionPresent
    ? new Set([...EXPECTED_NAMESPACE_OBJECTS,
      ...INITIAL_CONFIRMATION_OBJECTS.map(([type, name]) => `${type}:${name}`)])
    : EXPECTED_NAMESPACE_OBJECTS;
  return actual.length === expected.size
    && actual.every((key) => expected.has(key));
}

function initialConfirmationExtensionState(database) {
  const ledger = objectRow(database, "table", "platform_schema_migrations")
    ? database.prepare(`select ddl_checksum from platform_schema_migrations where migration_id = ?`)
      .get(REQUIRED_COIN_COMMERCE_INITIAL_CONFIRMATION_MIGRATION_ID)
    : null;
  const objects = INITIAL_CONFIRMATION_OBJECTS.map(([type, name]) => objectRow(database, type, name));
  const present = Boolean(ledger) || objects.some(Boolean);
  if (!present) return { present: false, exact: false };
  const exact = ledger?.ddl_checksum === INITIAL_CONFIRMATION_CHECKSUM
    && [...INITIAL_CONFIRMATION_OBJECT_SQL].every(([key, expected]) => {
      const [type, name] = key.split(":");
      const row = objectRow(database, type, name);
      return Boolean(row) && normalizeSql(row.sql) === expected;
    })
    && commerceNamespaceIsExact(database, true);
  return { present: true, exact };
}

function commerceMigrationRow(database) {
  if (!objectRow(database, "table", "platform_schema_migrations")) return null;
  return database.prepare(`
    select migration_id, ddl_checksum, applied_at
      from platform_schema_migrations
     where migration_id = ?
  `).get(REQUIRED_COIN_COMMERCE_MIGRATION_ID) ?? null;
}

function walletMigrationRow(database) {
  if (!objectRow(database, "table", "platform_schema_migrations")) return null;
  return database.prepare(`
    select migration_id, ddl_checksum, applied_at
      from platform_schema_migrations
     where migration_id = ?
  `).get(REQUIRED_COIN_WALLET_MIGRATION_ID) ?? null;
}

function walletDependencyIsExact(database) {
  const required = walletMigrationRow(database);
  if (
    !required
    || required.ddl_checksum !== COIN_WALLET_MIGRATIONS[0].ddlChecksum
  ) {
    return false;
  }
  try {
    return inspectCoinWalletSchema({ database }).ok;
  } catch {
    return false;
  }
}

function assertWalletDependency(database) {
  if (!walletDependencyIsExact(database)) {
    throw commerceMigrationError("commerce_migration_dependency_missing");
  }
}

function assertCommerceOwnedObjectsAreAbsent(database) {
  if (commerceNamespaceObjects(database).length > 0) {
    throw commerceMigrationError("commerce_owned_object_without_migration");
  }
}

function integrityChecks(database) {
  let quickCheck = false;
  let foreignKeyViolations = 0;
  let integrityError = false;
  try {
    const rows = database.pragma("quick_check");
    quickCheck = rows.length === 1 && rows[0]?.quick_check === "ok";
  } catch {
    integrityError = true;
  }
  try {
    foreignKeyViolations = database.pragma("foreign_key_check").length;
  } catch {
    integrityError = true;
    foreignKeyViolations = 1;
  }
  return { quickCheck, foreignKeyViolations, integrityError };
}

function pragmaStructureIsExact(database) {
  for (const [table, expected] of Object.entries(EXPECTED_COLUMNS)) {
    const columns = database.pragma(`table_info(${table})`).map((column) => [
      column.name,
      column.type,
      column.notnull,
      column.dflt_value,
      column.pk
    ]);
    if (JSON.stringify(columns) !== JSON.stringify(expected)) return false;

    const foreignKeys = database.pragma(`foreign_key_list(${table})`)
      .map((foreignKey) => [
        foreignKey.from,
        foreignKey.table,
        foreignKey.to,
        foreignKey.on_update,
        foreignKey.on_delete,
        foreignKey.match
      ])
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
    const expectedForeignKeys = EXPECTED_FOREIGN_KEYS[table]
      .map(([from, target, to]) => [from, target, to, "NO ACTION", "NO ACTION", "NONE"])
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
    if (JSON.stringify(foreignKeys) !== JSON.stringify(expectedForeignKeys)) {
      return false;
    }
  }

  for (const [name, [table, expectedColumns, unique, partial]]
    of Object.entries(EXPECTED_INDEXES)) {
    const listed = database.pragma(`index_list(${table})`)
      .find((index) => index.name === name);
    if (!listed || listed.unique !== unique || listed.partial !== partial) {
      return false;
    }
    const columns = database.pragma(`index_info(${name})`).map(({ name: column }) => column);
    if (JSON.stringify(columns) !== JSON.stringify(expectedColumns)) return false;
  }
  return true;
}

function closedInspection(database) {
  const reasons = [];
  const counts = {
    tables: 0,
    indexes: 0,
    triggers: 0,
    migrationRows: 0,
    foreignKeyViolations: 0
  };
  let schemaExact = true;
  let extension = { present: false, exact: false };
  try {
    extension = initialConfirmationExtensionState(database);
    if (extension.present && !extension.exact) {
      reasons.push("commerce_initial_confirmation_schema_incompatible");
      schemaExact = false;
    }
  } catch {
    reasons.push("commerce_initial_confirmation_schema_incompatible");
    schemaExact = false;
  }

  for (const [type, name] of OWNED_OBJECTS) {
    const actual = objectRow(database, type, name);
    if (!actual) {
      reasons.push("commerce_owned_object_missing");
      schemaExact = false;
      continue;
    }
    counts[type === "index" ? "indexes" : `${type}s`] += 1;
    const key = `${type}:${name}`;
    const expectedSql = extension.exact && INITIAL_CONFIRMATION_OBJECT_SQL.has(key)
      ? INITIAL_CONFIRMATION_OBJECT_SQL.get(key) : EXPECTED_OBJECT_SQL.get(key);
    if (normalizeSql(actual.sql) !== expectedSql) {
      reasons.push("commerce_owned_object_incompatible");
      schemaExact = false;
    }
  }

  try {
    if (!commerceNamespaceIsExact(database, extension.exact)) {
      reasons.push("commerce_owned_object_incompatible");
      schemaExact = false;
    }
  } catch {
    reasons.push("commerce_owned_object_incompatible");
    schemaExact = false;
  }

  try {
    if (!pragmaStructureIsExact(database)) {
      reasons.push("commerce_owned_object_incompatible");
      schemaExact = false;
    }
  } catch {
    reasons.push("commerce_owned_object_incompatible");
    schemaExact = false;
  }

  let walletDependency = false;
  try {
    walletDependency = walletDependencyIsExact(database);
  } catch {
    walletDependency = false;
  }
  if (!walletDependency) reasons.push("commerce_migration_dependency_missing");

  try {
    counts.migrationRows = database.prepare(
      "select count(*) from platform_schema_migrations"
    ).pluck().get();
    const required = commerceMigrationRow(database);
    if (!required) {
      reasons.push("commerce_required_migration_missing");
      schemaExact = false;
    } else if (required.ddl_checksum !== DDL_CHECKSUM) {
      reasons.push("commerce_migration_checksum_mismatch");
      schemaExact = false;
    }
  } catch {
    reasons.push("commerce_migration_ledger_incompatible");
    schemaExact = false;
  }

  const integrity = integrityChecks(database);
  counts.foreignKeyViolations = integrity.foreignKeyViolations;
  if (!integrity.quickCheck || integrity.integrityError) {
    reasons.push("quick_check_failed");
  }
  if (integrity.foreignKeyViolations > 0 || integrity.integrityError) {
    reasons.push("foreign_key_check_failed");
  }

  const reasonCodes = [...new Set(reasons)].sort();
  const checks = {
    schemaExact,
    walletDependency,
    quickCheck: integrity.quickCheck && !integrity.integrityError,
    foreignKeys: integrity.foreignKeyViolations === 0 && !integrity.integrityError
  };
  const ok = reasonCodes.length === 0 && Object.values(checks).every(Boolean);
  return {
    ok,
    schemaState: ok ? "ready" : "blocked",
    requiredMigrationId: REQUIRED_COIN_COMMERCE_MIGRATION_ID,
    counts,
    checks,
    reasonCodes
  };
}

export function inspectCoinCommerceSchema({ database } = {}) {
  if (
    !database
    || typeof database.prepare !== "function"
    || typeof database.pragma !== "function"
  ) {
    throw commerceMigrationError("commerce_invalid_migration_contract");
  }
  return closedInspection(database);
}

function closedValidationFailure(reasonCode) {
  return {
    ok: false,
    schemaState: "blocked",
    requiredMigrationId: REQUIRED_COIN_COMMERCE_MIGRATION_ID,
    counts: {
      tables: 0,
      indexes: 0,
      triggers: 0,
      migrationRows: 0,
      foreignKeyViolations: 0
    },
    checks: {
      schemaExact: false,
      walletDependency: false,
      quickCheck: false,
      foreignKeys: false
    },
    reasonCodes: [reasonCode]
  };
}

function validationFailureReason(dbPath, error) {
  if (!existsSync(dbPath)) return "database_missing";
  if (error?.code === "SQLITE_NOTADB") return "database_invalid";
  return "database_inspection_failed";
}

export function validateCoinCommerceSchema({ dbPath, database } = {}) {
  if (database) return inspectCoinCommerceSchema({ database });
  assertDatabasePath(dbPath);
  let owned;
  let result;
  try {
    owned = new Database(dbPath, { readonly: true, fileMustExist: true });
    result = inspectCoinCommerceSchema({ database: owned });
  } catch (error) {
    result = closedValidationFailure(validationFailureReason(dbPath, error));
  }
  try {
    owned?.close();
  } catch {
    return closedValidationFailure("database_close_failed");
  }
  return result;
}

function normalizeAppliedAt(nowFn) {
  const value = nowFn();
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw commerceMigrationError("commerce_invalid_migration_contract");
  }
  return value.toISOString();
}

function applyWithDatabase(database, nowFn) {
  database.pragma("foreign_keys = ON");
  const migrate = database.transaction(() => {
    assertWalletDependency(database);
    const applied = commerceMigrationRow(database);
    if (applied) {
      if (applied.ddl_checksum !== DDL_CHECKSUM) {
        throw commerceMigrationError("commerce_migration_checksum_mismatch");
      }
      const inspection = inspectCoinCommerceSchema({ database });
      if (!inspection.ok) {
        throw commerceMigrationError("commerce_applied_schema_incompatible");
      }
      return [];
    }
    assertCommerceOwnedObjectsAreAbsent(database);
    for (const statement of MIGRATION_STATEMENTS) database.exec(statement);
    database.prepare(`
      insert into platform_schema_migrations
        (migration_id, ddl_checksum, applied_at)
      values (?, ?, ?)
    `).run(
      REQUIRED_COIN_COMMERCE_MIGRATION_ID,
      DDL_CHECKSUM,
      normalizeAppliedAt(nowFn)
    );
    const inspection = inspectCoinCommerceSchema({ database });
    if (!inspection.ok) {
      throw commerceMigrationError("commerce_applied_schema_incompatible");
    }
    return [REQUIRED_COIN_COMMERCE_MIGRATION_ID];
  });
  return migrate.immediate();
}

export function applyCoinCommerceMigrations({
  dbPath,
  database,
  expectedMigrationId,
  expectedDdlChecksum,
  nowFn = () => new Date()
} = {}) {
  if (expectedMigrationId !== REQUIRED_COIN_COMMERCE_MIGRATION_ID) {
    throw commerceMigrationError("commerce_migration_id_mismatch");
  }
  if (expectedDdlChecksum !== DDL_CHECKSUM) {
    throw commerceMigrationError("commerce_migration_checksum_mismatch");
  }
  if (typeof nowFn !== "function" || (!database && dbPath === undefined)) {
    throw commerceMigrationError("commerce_invalid_migration_contract");
  }
  if (!database) assertDatabasePath(dbPath);

  let owned;
  const connection = database ?? (owned = new Database(dbPath, { fileMustExist: true }));
  try {
    const appliedMigrationIds = applyWithDatabase(connection, nowFn);
    const inspection = inspectCoinCommerceSchema({ database: connection });
    if (!inspection.ok) {
      throw commerceMigrationError("commerce_applied_schema_incompatible");
    }
    return {
      ...inspection,
      mode: "apply",
      sourceChanged: appliedMigrationIds.length > 0,
      appliedMigrationIds
    };
  } catch (error) {
    if (KNOWN_ERROR_CODES.has(error?.code)) throw error;
    throw commerceMigrationError("commerce_migration_apply_failed");
  } finally {
    owned?.close();
  }
}

export function inspectCoinCommerceInitialConfirmationSchema({ database } = {}) {
  const foundation = inspectCoinCommerceSchema({ database });
  let extension = { present: false, exact: false };
  try {
    extension = initialConfirmationExtensionState(database);
  } catch {
    // Return a bounded schema result rather than SQLite errors or stored values.
  }
  const ok = foundation.ok && extension.exact;
  return {
    ...foundation,
    ok,
    schemaState: ok ? "ready" : "blocked",
    requiredMigrationId: REQUIRED_COIN_COMMERCE_INITIAL_CONFIRMATION_MIGRATION_ID,
    checks: { ...foundation.checks, initialConfirmationExtension: extension.exact },
    reasonCodes: [...new Set([...foundation.reasonCodes, ...(!extension.exact
      ? [extension.present ? "commerce_initial_confirmation_schema_incompatible"
        : "commerce_initial_confirmation_migration_missing"] : [])])].sort()
  };
}

function mutateInitialConfirmationMigration({
  dbPath, database, expectedMigrationId, expectedDdlChecksum,
  nowFn = () => new Date()
} = {}, remove = false) {
  if (expectedMigrationId !== REQUIRED_COIN_COMMERCE_INITIAL_CONFIRMATION_MIGRATION_ID) {
    throw commerceMigrationError("commerce_migration_id_mismatch");
  }
  if (expectedDdlChecksum !== INITIAL_CONFIRMATION_CHECKSUM) {
    throw commerceMigrationError("commerce_migration_checksum_mismatch");
  }
  if (typeof nowFn !== "function" || (!database && dbPath === undefined)
    || (database && (typeof database.transaction !== "function" || database.inTransaction))) {
    throw commerceMigrationError("commerce_invalid_migration_contract");
  }
  if (!database) assertDatabasePath(dbPath);
  let owned;
  try {
    const connection = database ?? (owned = new Database(dbPath, { fileMustExist: true }));
    connection.pragma("foreign_keys = ON");
    if (connection.pragma("foreign_keys", { simple: true }) !== 1) {
      throw commerceMigrationError("commerce_invalid_migration_contract");
    }
    const sourceChanged = connection.transaction(() => {
      if (!inspectCoinCommerceSchema({ database: connection }).ok) {
        throw commerceMigrationError("commerce_initial_confirmation_schema_incompatible");
      }
      const state = initialConfirmationExtensionState(connection);
      if (remove ? !state.present : state.exact) return false;
      if (remove) {
        if (!state.exact) {
          throw commerceMigrationError("commerce_initial_confirmation_schema_incompatible");
        }
        if (connection.prepare(`select count(*) from ${INITIAL_CONFIRMATION_TABLE}`).pluck().get() !== 0) {
          throw commerceMigrationError("commerce_initial_confirmation_migration_in_use");
        }
      }
      // These two exact transitions are replaced atomically with the versioned
      // extension. No caller can request arbitrary trigger removal or SQL.
      for (const name of INITIAL_CONFIRMATION_TRIGGER_NAMES) {
        connection.exec(`drop trigger ${name}`);
      }
      if (remove) {
        for (const [type, name] of [...INITIAL_CONFIRMATION_OBJECTS].reverse()) {
          connection.exec(`drop ${type} ${name}`);
        }
        for (const name of INITIAL_CONFIRMATION_TRIGGER_NAMES) {
          const index = OWNED_OBJECTS.findIndex(([type, candidate]) => type === "trigger" && candidate === name);
          connection.exec(MIGRATION_STATEMENTS[index]);
        }
        connection.prepare("delete from platform_schema_migrations where migration_id = ?")
          .run(REQUIRED_COIN_COMMERCE_INITIAL_CONFIRMATION_MIGRATION_ID);
      } else {
        for (const statement of INITIAL_CONFIRMATION_STATEMENTS) connection.exec(statement);
        connection.prepare(`insert into platform_schema_migrations (migration_id, ddl_checksum, applied_at)
          values (?, ?, ?)`).run(REQUIRED_COIN_COMMERCE_INITIAL_CONFIRMATION_MIGRATION_ID,
          INITIAL_CONFIRMATION_CHECKSUM, normalizeAppliedAt(nowFn));
      }
      const verified = remove ? inspectCoinCommerceSchema({ database: connection })
        : inspectCoinCommerceInitialConfirmationSchema({ database: connection });
      if (!verified.ok) {
        throw commerceMigrationError("commerce_initial_confirmation_schema_incompatible");
      }
      return true;
    }).immediate();
    const inspection = remove ? inspectCoinCommerceSchema({ database: connection })
      : inspectCoinCommerceInitialConfirmationSchema({ database: connection });
    return {
      ...inspection,
      mode: remove ? "remove-unused" : "apply",
      sourceChanged,
      appliedMigrationIds: !remove && sourceChanged ? [REQUIRED_COIN_COMMERCE_INITIAL_CONFIRMATION_MIGRATION_ID] : [],
      removedMigrationIds: remove && sourceChanged ? [REQUIRED_COIN_COMMERCE_INITIAL_CONFIRMATION_MIGRATION_ID] : []
    };
  } catch (error) {
    if (KNOWN_ERROR_CODES.has(error?.code)) throw error;
    throw commerceMigrationError("commerce_initial_confirmation_migration_failed");
  } finally {
    owned?.close();
  }
}

export function applyCoinCommerceInitialConfirmationMigrations(options = {}) {
  return mutateInitialConfirmationMigration(options);
}

export function removeUnusedCoinCommerceInitialConfirmationMigration(options = {}) {
  return mutateInitialConfirmationMigration(options, true);
}

function sha256File(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function safeRemoveOwnedDirectory(directory, root) {
  const resolvedDirectory = resolve(directory);
  const resolvedRoot = resolve(root);
  const child = relative(resolvedRoot, resolvedDirectory);
  if (
    child.length === 0
    || child === ".."
    || child.startsWith(`..${sep}`)
    || isAbsolute(child)
  ) {
    throw commerceMigrationError("commerce_invalid_temp_root");
  }
  rmSync(resolvedDirectory, { recursive: true, force: true });
}

function sourceInspectionState(database) {
  return {
    dataVersion: database.pragma("data_version", { simple: true }),
    schemaVersion: database.pragma("schema_version", { simple: true }),
    inspection: inspectCoinCommerceSchema({ database })
  };
}

function sourceInspectionStateIsUnchanged(before, after) {
  return JSON.stringify(after) === JSON.stringify(before);
}

export async function dryRunCoinCommerceMigrations({ dbPath, tempRoot } = {}) {
  assertDatabasePath(dbPath);
  const root = tempRoot ?? tmpdir();
  if (typeof root !== "string" || !isAbsolute(root)) {
    throw commerceMigrationError("commerce_invalid_temp_root");
  }
  mkdirSync(root, { recursive: true });
  const workDirectory = mkdtempSync(join(root, "coin-commerce-dry-run-"));
  let source;
  try {
    const snapshotPath = join(workDirectory, "snapshot.sqlite");
    const sourceHashBefore = sha256File(dbPath);
    source = new Database(dbPath, { readonly: true, fileMustExist: true });
    assertWalletDependency(source);
    const wasApplied = Boolean(commerceMigrationRow(source));
    const sourceStateBefore = sourceInspectionState(source);
    await source.backup(snapshotPath);

    const applied = applyCoinCommerceMigrations({
      dbPath: snapshotPath,
      expectedMigrationId: REQUIRED_COIN_COMMERCE_MIGRATION_ID,
      expectedDdlChecksum: DDL_CHECKSUM
    });
    const validated = validateCoinCommerceSchema({ dbPath: snapshotPath });
    if (!validated.ok) {
      throw commerceMigrationError("commerce_applied_schema_incompatible");
    }
    const sourceStateAfter = sourceInspectionState(source);
    if (
      sha256File(dbPath) !== sourceHashBefore
      || !sourceInspectionStateIsUnchanged(sourceStateBefore, sourceStateAfter)
    ) {
      throw commerceMigrationError("commerce_source_changed_during_dry_run");
    }
    return {
      ...validated,
      mode: "dry-run",
      sourceChanged: false,
      pendingMigrationIds: wasApplied
        ? []
        : [REQUIRED_COIN_COMMERCE_MIGRATION_ID],
      appliedMigrationIds: applied.appliedMigrationIds
    };
  } finally {
    try {
      source?.close();
    } finally {
      safeRemoveOwnedDirectory(workDirectory, root);
    }
  }
}

export async function dryRunCoinCommerceInitialConfirmationMigrations({ dbPath, tempRoot } = {}) {
  assertDatabasePath(dbPath);
  const root = tempRoot ?? tmpdir();
  if (typeof root !== "string" || !isAbsolute(root)) {
    throw commerceMigrationError("commerce_invalid_temp_root");
  }
  mkdirSync(root, { recursive: true });
  const workDirectory = mkdtempSync(join(root, "coin-commerce-initial-confirmation-dry-run-"));
  let source;
  let clone;
  try {
    const sourceHashBefore = sha256File(dbPath);
    source = new Database(dbPath, { readonly: true, fileMustExist: true });
    const sourceStateBefore = sourceInspectionState(source);
    if (!sourceStateBefore.inspection.ok) {
      throw commerceMigrationError("commerce_initial_confirmation_schema_incompatible");
    }
    const wasApplied = initialConfirmationExtensionState(source).exact;
    const snapshotPath = join(workDirectory, "snapshot.sqlite");
    await source.backup(snapshotPath);
    clone = new Database(snapshotPath, { fileMustExist: true });
    const contract = { database: clone,
      expectedMigrationId: REQUIRED_COIN_COMMERCE_INITIAL_CONFIRMATION_MIGRATION_ID,
      expectedDdlChecksum: INITIAL_CONFIRMATION_CHECKSUM };
    const applied = applyCoinCommerceInitialConfirmationMigrations(contract);
    const unused = clone.prepare(`select count(*) from ${INITIAL_CONFIRMATION_TABLE}`).pluck().get() === 0;
    if (unused) {
      removeUnusedCoinCommerceInitialConfirmationMigration(contract);
      if (!inspectCoinCommerceSchema({ database: clone }).ok
        || initialConfirmationExtensionState(clone).present) {
        throw commerceMigrationError("commerce_initial_confirmation_schema_incompatible");
      }
      applyCoinCommerceInitialConfirmationMigrations(contract);
    }
    const validated = inspectCoinCommerceInitialConfirmationSchema({ database: clone });
    if (!validated.ok) throw commerceMigrationError("commerce_initial_confirmation_schema_incompatible");
    const sourceStateAfter = sourceInspectionState(source);
    if (sha256File(dbPath) !== sourceHashBefore
      || !sourceInspectionStateIsUnchanged(sourceStateBefore, sourceStateAfter)) {
      throw commerceMigrationError("commerce_source_changed_during_dry_run");
    }
    return { ...validated, mode: "dry-run", sourceChanged: false,
      unusedInverseVerified: unused,
      pendingMigrationIds: wasApplied ? [] : [REQUIRED_COIN_COMMERCE_INITIAL_CONFIRMATION_MIGRATION_ID],
      appliedMigrationIds: applied.appliedMigrationIds };
  } catch (error) {
    if (KNOWN_ERROR_CODES.has(error?.code)) throw error;
    throw commerceMigrationError("commerce_initial_confirmation_dry_run_failed");
  } finally {
    try {
      clone?.close();
    } finally {
      try { source?.close(); } finally { safeRemoveOwnedDirectory(workDirectory, root); }
    }
  }
}
