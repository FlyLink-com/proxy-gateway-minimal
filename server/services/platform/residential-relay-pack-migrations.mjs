import { createHash } from "node:crypto";

export const REQUIRED_RESIDENTIAL_RELAY_PACK_MIGRATION_ID = "20261014_001_residential_relay_pack";
export const RESIDENTIAL_RELAY_MIGRATIONS_TABLE = "platform_residential_relay_schema_migrations";
export const RESIDENTIAL_RELAY_SKUS_TABLE = "platform_residential_relay_skus";
export const RESIDENTIAL_RELAY_UPSTREAMS_TABLE = "platform_residential_relay_upstreams";

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
     base_coin_units integer not null check (base_coin_units > 0),
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
     on ${RESIDENTIAL_RELAY_UPSTREAMS_TABLE}(sku_id, active, enabled)`
]);

const normalize = sql => String(sql).replace(/\s+/g, " ").trim().toLowerCase();
export const REQUIRED_RESIDENTIAL_RELAY_PACK_DDL_CHECKSUM = createHash("sha256")
  .update(STATEMENTS.map(normalize).join("\n"), "utf8").digest("hex");

const OWNED = [
  ["table", RESIDENTIAL_RELAY_MIGRATIONS_TABLE, 0],
  ["table", RESIDENTIAL_RELAY_SKUS_TABLE, 1],
  ["table", RESIDENTIAL_RELAY_UPSTREAMS_TABLE, 2],
  ["index", "platform_residential_relay_upstreams_sku_idx", 3]
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
    database.prepare(`insert into ${RESIDENTIAL_RELAY_MIGRATIONS_TABLE}(migration_id, ddl_checksum, applied_at) values (?, ?, ?)`)
      .run(REQUIRED_RESIDENTIAL_RELAY_PACK_MIGRATION_ID, REQUIRED_RESIDENTIAL_RELAY_PACK_DDL_CHECKSUM, at.toISOString());
    if (!inspectResidentialRelayPackSchema({ database }).ok) throw fail("applied_schema_incompatible");
    return [REQUIRED_RESIDENTIAL_RELAY_PACK_MIGRATION_ID];
  }).immediate();
}
