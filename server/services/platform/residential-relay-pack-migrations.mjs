import { createHash, randomBytes } from "node:crypto";

export const REQUIRED_RESIDENTIAL_RELAY_PACK_MIGRATION_ID = "20261014_002_residential_relay_pack_pricing";
export const RESIDENTIAL_RELAY_MIGRATIONS_TABLE = "platform_residential_relay_schema_migrations";
export const RESIDENTIAL_RELAY_SKUS_TABLE = "platform_residential_relay_skus";
export const RESIDENTIAL_RELAY_UPSTREAMS_TABLE = "platform_residential_relay_upstreams";
export const RESIDENTIAL_RELAY_COUPONS_TABLE = "platform_residential_relay_coupons";
export const RESIDENTIAL_RELAY_COUPON_SKUS_TABLE = "platform_residential_relay_coupon_skus";
export const RESIDENTIAL_RELAY_REDEEM_ATTEMPTS_TABLE = "platform_residential_relay_redeem_attempts";
export const RESIDENTIAL_RELAY_ORDER_PRICES_TABLE = "platform_residential_relay_order_prices";

// Seeded display defaults (Ethan 2026-10-14). Admin can edit; 1TB has no price
// and is unsellable until one is set. Seeds start disabled.
export const RESIDENTIAL_RELAY_SEED_SKUS = Object.freeze([
  Object.freeze({ sizeCode: "100G", quotaGib: 100, baseCoinUnits: 30 }),
  Object.freeze({ sizeCode: "200G", quotaGib: 200, baseCoinUnits: 50 }),
  Object.freeze({ sizeCode: "500G", quotaGib: 500, baseCoinUnits: 120 }),
  Object.freeze({ sizeCode: "1TB", quotaGib: 1024, baseCoinUnits: null })
]);
export const RESIDENTIAL_RELAY_SEED_DURATION_DAYS = 30;

const STATEMENTS = Object.freeze([
  `create table ${RESIDENTIAL_RELAY_MIGRATIONS_TABLE} (
     migration_id text primary key,
     ddl_checksum text not null,
     applied_at text not null
   )`,
  `create table ${RESIDENTIAL_RELAY_SKUS_TABLE} (
     id text primary key,
     size_code text not null unique check (size_code in ('100G', '200G', '500G', '1TB')),
     buyer_protocol text not null check (buyer_protocol in ('vless', 'hysteria2')),
     quota_bytes integer not null check (quota_bytes > 0),
     duration_days integer not null check (duration_days > 0 and duration_days <= 3660),
     base_coin_units integer check (base_coin_units is null or base_coin_units > 0),
     enabled integer not null default 0 check (enabled in (0, 1)),
     created_at text not null,
     updated_at text not null
   )`,
  `create table ${RESIDENTIAL_RELAY_UPSTREAMS_TABLE} (
     id text primary key,
     sku_id text not null references ${RESIDENTIAL_RELAY_SKUS_TABLE}(id),
     fingerprint text not null,
     display_name text not null,
     country_code text not null,
     protocol text not null,
     protected_config text not null,
     enabled integer not null default 0 check (enabled in (0, 1)),
     active integer not null default 1 check (active in (0, 1)),
     created_at text not null,
     updated_at text not null,
     unique (sku_id, fingerprint)
   )`,
  `create index platform_residential_relay_upstreams_sku_idx
     on ${RESIDENTIAL_RELAY_UPSTREAMS_TABLE}(sku_id, active, enabled)`,
  `create table ${RESIDENTIAL_RELAY_COUPONS_TABLE} (
     id text primary key,
     code text not null unique,
     batch_id text not null,
     kind text not null check (kind in ('percent', 'fixed')),
     value integer not null check (value > 0),
     all_skus integer not null default 0 check (all_skus in (0, 1)),
     expires_at text not null,
     issued_at text not null,
     issued_by text not null,
     issuer text not null,
     recipient_ref text,
     voided_at text,
     voided_by text,
     redeemed_by text,
     redeemed_at text,
     usable_until text,
     consumed_by text,
     consumed_order_ref text unique,
     consumed_amount integer check (consumed_amount is null or consumed_amount >= 0),
     consumed_at text,
     check (voided_at is null or redeemed_at is null),
     check ((redeemed_by is null) = (redeemed_at is null)),
     check ((redeemed_at is null) = (usable_until is null)),
     check (recipient_ref is null or redeemed_by is null or redeemed_by = recipient_ref),
     check (consumed_at is null or (redeemed_at is not null and consumed_by = redeemed_by
       and consumed_order_ref is not null and consumed_amount is not null))
   )`,
  `create index platform_residential_relay_coupons_redeemed_idx
     on ${RESIDENTIAL_RELAY_COUPONS_TABLE}(redeemed_by)`,
  `create table ${RESIDENTIAL_RELAY_COUPON_SKUS_TABLE} (
     coupon_id text not null references ${RESIDENTIAL_RELAY_COUPONS_TABLE}(id),
     sku_id text not null references ${RESIDENTIAL_RELAY_SKUS_TABLE}(id),
     primary key (coupon_id, sku_id)
   )`,
  `create table ${RESIDENTIAL_RELAY_ORDER_PRICES_TABLE} (
     order_ref text primary key,
     account_ref text not null,
     sku_id text not null references ${RESIDENTIAL_RELAY_SKUS_TABLE}(id),
     coupon_id text unique references ${RESIDENTIAL_RELAY_COUPONS_TABLE}(id),
     list_price integer not null,
     final_price integer not null check (final_price >= 0),
     breakdown text not null,
     created_at text not null
   )`,
  `create table ${RESIDENTIAL_RELAY_REDEEM_ATTEMPTS_TABLE} (
     id integer primary key autoincrement,
     account_ref text not null,
     client_key text not null,
     input_hash text not null,
     outcome text not null check (outcome in ('redeemed', 'failed', 'rate_limited', 'daily_limited')),
     attempted_at text not null
   )`,
  `create index platform_residential_relay_redeem_attempts_account_idx
     on ${RESIDENTIAL_RELAY_REDEEM_ATTEMPTS_TABLE}(account_ref, attempted_at)`,
  `create index platform_residential_relay_redeem_attempts_client_idx
     on ${RESIDENTIAL_RELAY_REDEEM_ATTEMPTS_TABLE}(client_key, attempted_at)`
]);

const normalize = sql => String(sql).replace(/\s+/g, " ").trim().toLowerCase();
export const REQUIRED_RESIDENTIAL_RELAY_PACK_DDL_CHECKSUM = createHash("sha256")
  .update(STATEMENTS.map(normalize).join("\n"), "utf8").digest("hex");

const OWNED = [
  ["table", RESIDENTIAL_RELAY_MIGRATIONS_TABLE, 0],
  ["table", RESIDENTIAL_RELAY_SKUS_TABLE, 1],
  ["table", RESIDENTIAL_RELAY_UPSTREAMS_TABLE, 2],
  ["index", "platform_residential_relay_upstreams_sku_idx", 3],
  ["table", RESIDENTIAL_RELAY_COUPONS_TABLE, 4],
  ["index", "platform_residential_relay_coupons_redeemed_idx", 5],
  ["table", RESIDENTIAL_RELAY_COUPON_SKUS_TABLE, 6],
  ["table", RESIDENTIAL_RELAY_ORDER_PRICES_TABLE, 7],
  ["table", RESIDENTIAL_RELAY_REDEEM_ATTEMPTS_TABLE, 8],
  ["index", "platform_residential_relay_redeem_attempts_account_idx", 9],
  ["index", "platform_residential_relay_redeem_attempts_client_idx", 10]
];

function fail(code) {
  const error = new Error("Residential relay schema operation rejected");
  error.code = code;
  return error;
}

function object(database, name) {
  return database.prepare("select type, sql from sqlite_master where name = ?").get(name) ?? null;
}

export function inspectResidentialRelayPackSchema({ database } = {}) {
  if (!database || typeof database.prepare !== "function") throw fail("invalid_migration_contract");
  const present = OWNED.filter(([, name]) => object(database, name));
  if (present.length === 0) return { ok: false, schemaState: "pending", reasonCodes: ["required_migration_missing"] };
  const exact = OWNED.every(([type, name, index]) => {
    const row = object(database, name);
    return row && row.type === type && normalize(row.sql) === normalize(STATEMENTS[index]);
  });
  let row = null;
  try {
    row = database.prepare(`select ddl_checksum from ${RESIDENTIAL_RELAY_MIGRATIONS_TABLE} where migration_id = ?`)
      .get(REQUIRED_RESIDENTIAL_RELAY_PACK_MIGRATION_ID) ?? null;
  } catch { row = null; }
  const ok = exact && row?.ddl_checksum === REQUIRED_RESIDENTIAL_RELAY_PACK_DDL_CHECKSUM;
  return { ok, schemaState: ok ? "ready" : "blocked", reasonCodes: ok ? [] : ["owned_object_incompatible"] };
}

export function applyResidentialRelayPackMigrations({ database, expectedMigrationId, expectedDdlChecksum, nowFn } = {}) {
  if (expectedMigrationId !== REQUIRED_RESIDENTIAL_RELAY_PACK_MIGRATION_ID) throw fail("migration_id_mismatch");
  if (expectedDdlChecksum !== REQUIRED_RESIDENTIAL_RELAY_PACK_DDL_CHECKSUM) throw fail("migration_checksum_mismatch");
  if (typeof nowFn !== "function") throw fail("invalid_migration_contract");
  database.pragma("foreign_keys = ON");
  return database.transaction(() => {
    const state = inspectResidentialRelayPackSchema({ database });
    if (state.ok) return [];
    if (state.schemaState !== "pending") throw fail("applied_schema_incompatible");
    for (const statement of STATEMENTS) database.exec(statement);
    const at = nowFn();
    if (!(at instanceof Date) || Number.isNaN(at.getTime())) throw fail("invalid_migration_contract");
    const seed = database.prepare(`insert into ${RESIDENTIAL_RELAY_SKUS_TABLE}
      (id, size_code, buyer_protocol, quota_bytes, duration_days, base_coin_units, enabled, created_at, updated_at)
      values (?, ?, 'vless', ?, ?, ?, 0, ?, ?)`);
    for (const item of RESIDENTIAL_RELAY_SEED_SKUS) {
      seed.run(`rrsku_${randomBytes(16).toString("hex")}`, item.sizeCode, item.quotaGib * 1024 ** 3,
        RESIDENTIAL_RELAY_SEED_DURATION_DAYS, item.baseCoinUnits, at.toISOString(), at.toISOString());
    }
    database.prepare(`insert into ${RESIDENTIAL_RELAY_MIGRATIONS_TABLE}(migration_id, ddl_checksum, applied_at) values (?, ?, ?)`)
      .run(REQUIRED_RESIDENTIAL_RELAY_PACK_MIGRATION_ID, REQUIRED_RESIDENTIAL_RELAY_PACK_DDL_CHECKSUM, at.toISOString());
    if (!inspectResidentialRelayPackSchema({ database }).ok) throw fail("applied_schema_incompatible");
    return [REQUIRED_RESIDENTIAL_RELAY_PACK_MIGRATION_ID];
  }).immediate();
}
