import { createHash } from "node:crypto";
import { inspectCoinWalletSchema } from "./coin-wallet-migrations.mjs";
import { validatePaymentStoreSchema } from "./payment-store-migrations.mjs";
import { referralError } from "./portal-referral-contract.mjs";

export const REFERRAL_MIGRATION_ID = "20260908_001_portal_referral";
const ddl = [
  `create table platform_referral_policies (
 policy_ref text not null, version integer not null check(version > 0),
 effective_at text not null unique, policy_json text not null, digest text not null,
 primary key(policy_ref, version))`,
  `create table platform_referral_profiles (
 account_id text not null primary key references platform_accounts(id), code text not null unique,
 status text not null check(status in ('active','disabled')), created_at text not null)`,
  `create table platform_referral_touches (
 token_digest text not null primary key, referrer_id text not null references platform_referral_profiles(account_id),
 observed_at text not null, expires_at text not null check(expires_at > observed_at))`,
  `create table platform_referral_bindings (
 account_id text not null primary key references platform_accounts(id),
 referrer_id text references platform_referral_profiles(account_id),
 touch_digest text references platform_referral_touches(token_digest), registered_at text not null,
 check(referrer_id is null or referrer_id <> account_id),
 check((referrer_id is null) = (touch_digest is null)))`,
  `create table platform_referral_origins (
 account_id text not null primary key references platform_accounts(id),
 lot_ref text not null unique references platform_coin_lots(lot_ref),
 payment_order_ref text not null unique references platform_payment_orders(payment_order_ref),
 referrer_id text references platform_referral_profiles(account_id),
 paid_units integer not null check(typeof(paid_units)='integer' and paid_units > 0),
 credited_at text not null, policy_json text, created_at text not null)`,
  `create table platform_referral_accruals (
 account_id text not null primary key references platform_referral_origins(account_id),
 reward_units integer not null check(typeof(reward_units)='integer' and reward_units >= 0),
 reward_lot_ref text unique references platform_coin_lots(lot_ref),
 confirmation_at text not null, risk_approved integer not null default 0 check(risk_approved in (0,1)),
 refunded_paid_units integer not null default 0 check(typeof(refunded_paid_units)='integer' and refunded_paid_units >= 0),
 reversed_units integer not null default 0 check(typeof(reversed_units)='integer' and reversed_units >= 0),
 status text not null check(status in ('pending','available','reversed','reconciliation_required','policy_missing','excluded')),
 updated_at text not null, check(reversed_units <= reward_units))`,
  `create table platform_referral_events (
 event_ref text not null primary key, account_id text not null references platform_accounts(id),
 kind text not null, digest text not null, occurred_at text not null)`,
  `create index platform_referral_bindings_referrer on platform_referral_bindings(referrer_id, registered_at)`,
  `create index platform_referral_origins_referrer on platform_referral_origins(referrer_id)`,
  `create trigger platform_referral_profile_code_immutable before update of account_id, code, created_at
 on platform_referral_profiles begin select raise(abort, 'referral_profile_immutable'); end`,
  `create trigger platform_referral_profile_no_delete before delete on platform_referral_profiles
 begin select raise(abort, 'referral_profile_immutable'); end`,
  `create trigger platform_referral_accrual_origin_immutable before update of account_id, reward_units, reward_lot_ref, confirmation_at
 on platform_referral_accruals begin select raise(abort, 'referral_accrual_immutable'); end`,
  `create trigger platform_referral_accrual_no_delete before delete on platform_referral_accruals
 begin select raise(abort, 'referral_accrual_immutable'); end`,
  ...["policies", "bindings", "origins", "events", "touches"].flatMap((table) =>
    ["update", "delete"].map(
      (action) =>
        `create trigger platform_referral_${table}_immutable_${action} before ${action} on platform_referral_${table}
 begin select raise(abort, 'referral_fact_immutable'); end`,
    ),
  ),
];
export const REFERRAL_DDL_CHECKSUM = createHash("sha256")
  .update(ddl.join("\n"))
  .digest("hex");
const normalize = (sql) =>
  sql
    .trim()
    .replace(/^create (table|index|trigger)/i, (s) => s.toUpperCase())
    .replace(/\s+/g, " ");
function objectName(sql) {
  return /^create (?:table|index|trigger) (\w+)/.exec(sql.trim())[1];
}
export function validatePortalReferralSchema(database) {
  try {
    if (
      !inspectCoinWalletSchema({ database }).ok ||
      !validatePaymentStoreSchema({ database })
    )
      return false;
    const row = database
      .prepare(
        "select ddl_checksum from platform_schema_migrations where migration_id = ?",
      )
      .get(REFERRAL_MIGRATION_ID);
    if (row?.ddl_checksum !== REFERRAL_DDL_CHECKSUM) return false;
    return ddl.every(
      (sql) =>
        normalize(
          database
            .prepare("select sql from sqlite_master where name = ?")
            .get(objectName(sql))?.sql || "",
        ) === normalize(sql),
    );
  } catch {
    return false;
  }
}
export function applyPortalReferralMigration(
  database,
  { expectedMigrationId, expectedDdlChecksum } = {},
) {
  if (
    expectedMigrationId !== REFERRAL_MIGRATION_ID ||
    expectedDdlChecksum !== REFERRAL_DDL_CHECKSUM
  )
    throw referralError("referral_migration_confirmation_required");
  database.pragma("foreign_keys=ON");
  database.pragma("busy_timeout=5000");
  return database
    .transaction(() => {
      if (
        !inspectCoinWalletSchema({ database }).ok ||
        !validatePaymentStoreSchema({ database })
      )
        throw referralError("referral_schema_dependency_missing");
      if (validatePortalReferralSchema(database)) return { applied: false };
      if (
        database
          .prepare(
            "select 1 from platform_schema_migrations where migration_id = ?",
          )
          .get(REFERRAL_MIGRATION_ID) ||
        ddl.some((sql) =>
          database
            .prepare("select 1 from sqlite_master where name = ?")
            .get(objectName(sql)),
        )
      ) {
        throw referralError("referral_schema_conflict");
      }
      for (const table of [
        "platform_accounts",
        "platform_coin_wallets",
        "platform_coin_lots",
        "platform_coin_ledger_entries",
        "platform_payment_orders",
        "platform_payment_receipts",
      ]) {
        if (
          !database
            .prepare(
              "select 1 from sqlite_master where type='table' and name=?",
            )
            .get(table)
        )
          throw referralError("referral_schema_dependency_missing");
      }
      for (const sql of ddl) database.exec(sql);
      database
        .prepare(
          "insert into platform_schema_migrations(migration_id, ddl_checksum, applied_at) values(?,?,?)",
        )
        .run(
          REFERRAL_MIGRATION_ID,
          REFERRAL_DDL_CHECKSUM,
          new Date().toISOString(),
        );
      if (!validatePortalReferralSchema(database))
        throw referralError("referral_schema_conflict");
      return { applied: true };
    })
    .immediate();
}
