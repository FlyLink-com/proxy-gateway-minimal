export const REQUIRED_PLAN_SWITCH_MIGRATION_ID =
  "20261010_001_coin_commerce_plan_switch";

export const PLAN_SWITCH_QUOTES_TABLE =
  "platform_coin_commerce_plan_switch_quotes";
export const PLAN_SWITCH_SCHEDULED_TABLE =
  "platform_scheduled_plan_switches";

// Verbatim schema rollback from docs/MONTHLY_CARD_PLAN_SWITCH.md.
// Scheduled switches are dropped first. Quote rows may still name a
// superseded switch; cancels_switch_ref is not a SQL foreign key.
export const PLAN_SWITCH_SCHEMA_ROLLBACK_STATEMENTS = Object.freeze([
  "drop table platform_scheduled_plan_switches;",
  "drop table platform_coin_commerce_plan_switch_quotes;"
]);

const SAFE_INTEGER_MAX = 9_007_199_254_740_991;

export const MIGRATION_STATEMENTS = Object.freeze([
  `
    create table platform_coin_commerce_plan_switch_quotes (
      quote_ref text primary key
        references platform_coin_commerce_quotes(quote_ref) on delete restrict,
      account_id text not null
        references platform_accounts(id) on delete restrict,
      entitlement_id text not null check (length(trim(entitlement_id)) > 0),
      kind text not null check (kind in (
        'renewal',
        'upgrade_inplace',
        'upgrade_restart',
        'downgrade_scheduled'
      )),
      from_offer_version_ref text not null check (
        length(trim(from_offer_version_ref)) > 0
      ),
      to_offer_version_ref text not null check (
        length(trim(to_offer_version_ref)) > 0
      ),
      snapshot_valid_from text not null check (
        length(trim(snapshot_valid_from)) > 0
      ),
      snapshot_valid_until text not null check (
        length(trim(snapshot_valid_until)) > 0
      ),
      list_price_units integer not null check (
        typeof(list_price_units) = 'integer'
        and list_price_units between 1 and ${SAFE_INTEGER_MAX}
      ),
      credit_units integer not null check (
        typeof(credit_units) = 'integer'
        and credit_units between 0 and ${SAFE_INTEGER_MAX}
      ),
      pending_credit_units integer not null check (
        typeof(pending_credit_units) = 'integer'
        and pending_credit_units between 0 and ${SAFE_INTEGER_MAX}
      ),
      charge_units integer not null check (
        typeof(charge_units) = 'integer'
        and charge_units between 1 and ${SAFE_INTEGER_MAX}
      ),
      cancels_switch_ref text,
      effective_at text,
      created_at text not null check (length(trim(created_at)) > 0),
      check (snapshot_valid_from < snapshot_valid_until),
      check (
        (
          kind = 'renewal'
          and from_offer_version_ref = to_offer_version_ref
        )
        or (
          kind <> 'renewal'
          and from_offer_version_ref <> to_offer_version_ref
        )
      ),
      check (
        (
          kind = 'downgrade_scheduled'
          and effective_at is not null
          and length(trim(effective_at)) > 0
        )
        or (
          kind <> 'downgrade_scheduled'
          and effective_at is null
        )
      )
    )
  `,
  `
    create trigger platform_coin_commerce_plan_switch_quotes_update_deny
    before update on platform_coin_commerce_plan_switch_quotes
    begin
      select raise(abort, 'plan_switch_quote_update_denied');
    end
  `,
  `
    create trigger platform_coin_commerce_plan_switch_quotes_delete_deny
    before delete on platform_coin_commerce_plan_switch_quotes
    begin
      select raise(abort, 'plan_switch_quote_delete_denied');
    end
  `,
  `
    create table platform_scheduled_plan_switches (
      switch_ref text primary key
        references platform_coin_commerce_orders(order_ref) on delete restrict,
      account_id text not null
        references platform_accounts(id) on delete restrict,
      entitlement_id text not null check (length(trim(entitlement_id)) > 0),
      from_offer_version_ref text not null check (
        length(trim(from_offer_version_ref)) > 0
      ),
      to_offer_version_ref text not null check (
        length(trim(to_offer_version_ref)) > 0
      ),
      effective_at text not null check (length(trim(effective_at)) > 0),
      paid_units integer not null check (
        typeof(paid_units) = 'integer'
        and paid_units between 1 and ${SAFE_INTEGER_MAX}
      ),
      status text not null check (
        status in ('scheduled', 'applying', 'applied', 'superseded')
      ),
      created_at text not null check (length(trim(created_at)) > 0),
      resolved_at text,
      superseded_by_order_ref text,
      check (from_offer_version_ref <> to_offer_version_ref),
      check (
        (
          status in ('scheduled', 'applying')
          and resolved_at is null
          and superseded_by_order_ref is null
        )
        or (
          status = 'applied'
          and resolved_at is not null
          and length(trim(resolved_at)) > 0
          and superseded_by_order_ref is null
        )
        or (
          status = 'superseded'
          and resolved_at is not null
          and length(trim(resolved_at)) > 0
          and superseded_by_order_ref is not null
          and length(trim(superseded_by_order_ref)) > 0
        )
      )
    )
  `,
  `
    create unique index platform_scheduled_plan_switches_one_scheduled_uidx
      on platform_scheduled_plan_switches(account_id)
      where status in ('scheduled', 'applying')
  `,
  `
    create trigger platform_scheduled_plan_switches_insert_guard
    before insert on platform_scheduled_plan_switches
    when new.status <> 'scheduled'
      or new.resolved_at is not null
      or new.superseded_by_order_ref is not null
    begin
      select raise(abort, 'plan_switch_insert_state_invalid');
    end
  `,
  `
    create trigger platform_scheduled_plan_switches_status_transition
    before update on platform_scheduled_plan_switches
    when not (
      ((old.status = 'scheduled' and new.status in ('applying', 'superseded'))
       or (old.status = 'applying' and new.status = 'applied'))
      and new.switch_ref = old.switch_ref
      and new.account_id = old.account_id
      and new.entitlement_id = old.entitlement_id
      and new.from_offer_version_ref = old.from_offer_version_ref
      and new.to_offer_version_ref = old.to_offer_version_ref
      and new.effective_at = old.effective_at
      and new.paid_units = old.paid_units
      and new.created_at = old.created_at
      and ((new.status = 'applying' and new.resolved_at is null)
           or (new.status <> 'applying' and new.resolved_at is not null
               and length(trim(new.resolved_at)) > 0))
      and (
        (
          new.status in ('applying', 'applied')
          and new.superseded_by_order_ref is null
        )
        or (
          new.status = 'superseded'
          and new.superseded_by_order_ref is not null
          and length(trim(new.superseded_by_order_ref)) > 0
        )
      )
    )
    begin
      select raise(abort, 'plan_switch_status_transition_denied');
    end
  `,
  `
    create trigger platform_scheduled_plan_switches_delete_deny
    before delete on platform_scheduled_plan_switches
    begin
      select raise(abort, 'plan_switch_delete_denied');
    end
  `,
  `
    create trigger platform_coin_commerce_plan_switch_quotes_cancel_ref_guard
    before insert on platform_coin_commerce_plan_switch_quotes
    when new.cancels_switch_ref is not null
      and not exists (
        select 1
          from platform_scheduled_plan_switches scheduled
         where scheduled.switch_ref = new.cancels_switch_ref
           and scheduled.account_id = new.account_id
           and scheduled.status = 'scheduled'
      )
    begin
      select raise(abort, 'plan_switch_quote_cancel_ref_invalid');
    end
  `
]);

export function normalizeSql(sql) {
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
    .replace(/\s*([(),=<>])\s*/g, "$1")
    .toLowerCase()
    .replace(/\0(\d+)\0/g, (_match, index) => literals[Number(index)]);
}

export const OWNED_OBJECTS = Object.freeze([
  Object.freeze(["table", PLAN_SWITCH_QUOTES_TABLE]),
  Object.freeze(["trigger", "platform_coin_commerce_plan_switch_quotes_update_deny"]),
  Object.freeze(["trigger", "platform_coin_commerce_plan_switch_quotes_delete_deny"]),
  Object.freeze(["table", PLAN_SWITCH_SCHEDULED_TABLE]),
  Object.freeze(["index", "platform_scheduled_plan_switches_one_scheduled_uidx"]),
  Object.freeze(["trigger", "platform_scheduled_plan_switches_insert_guard"]),
  Object.freeze(["trigger", "platform_scheduled_plan_switches_status_transition"]),
  Object.freeze(["trigger", "platform_scheduled_plan_switches_delete_deny"]),
  Object.freeze(["trigger", "platform_coin_commerce_plan_switch_quotes_cancel_ref_guard"])
]);

const PREDICATE_EXPECTED_SQL = new Map(
  OWNED_OBJECTS.map(([type, name], index) => [
    `${type}:${name}`,
    normalizeSql(MIGRATION_STATEMENTS[index])
  ])
);

// Commerce validation treats every platform_coin_commerce_* object as its own.
// The quote table uses that prefix, so an exact plan-switch object is excluded
// from the commerce namespace. A different SQL text stays inside it and fails
// closed. Objects that are absent leave the commerce check unchanged.
export function planSwitchCommerceNamespaceRowIsExact(row) {
  if (
    !row
    || typeof row.type !== "string"
    || typeof row.name !== "string"
    || typeof row.sql !== "string"
  ) {
    return false;
  }
  const expected = PREDICATE_EXPECTED_SQL.get(`${row.type}:${row.name}`);
  return typeof expected === "string" && normalizeSql(row.sql) === expected;
}
