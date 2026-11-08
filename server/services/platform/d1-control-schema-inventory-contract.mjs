const SHA1 = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const REQUIRED_EXCLUSIONS = [
  "Ads Conversion",
  "Portal Link Reset",
  "subscriptions.sqlite",
  "Third-party subscription DB",
  "BWH credential-material file store",
  "Local Worker synthetic G3/G4 protocol"
];
const FORBIDDEN_AUTHORIZATION = [
  "productionRead",
  "bwhConnection",
  "remoteCloudflareMutation",
  "d1Apply",
  "workerDeployment",
  "ciTriggered",
  "prCreated",
  "merged",
  "cutover"
];

function unique(values) {
  return new Set(values).size === values.length;
}

function countColumns(tables, layer) {
  return tables
    .filter((table) => layer === null || table.layer === layer)
    .reduce((total, table) => total + (Array.isArray(table.columns) ? table.columns.length : 0), 0);
}

export function validateD1ControlSchemaInventory(inventory) {
  const errors = [];
  const add = (condition, code) => { if (!condition) errors.push(code); };

  if (!inventory || typeof inventory !== "object" || Array.isArray(inventory)) {
    return { valid: false, errors: ["inventory_not_object"], actualCounts: null };
  }

  const tables = Array.isArray(inventory.tables) ? inventory.tables : [];
  const indexes = Array.isArray(inventory.indexes) ? inventory.indexes : [];
  const triggers = Array.isArray(inventory.triggers) ? inventory.triggers : [];
  const foreignKeys = Array.isArray(inventory.foreignKeyEdges) ? inventory.foreignKeyEdges : [];
  const migrations = Array.isArray(inventory.sourceMigrationHistory) ? inventory.sourceMigrationHistory : [];

  const actualCounts = {
    tables: tables.length,
    columns: countColumns(tables, null),
    foreignKeys: foreignKeys.length,
    indexes: indexes.length,
    triggers: triggers.length,
    coreTables: tables.filter((table) => table.layer === "core").length,
    companionTables: tables.filter((table) => table.layer === "companion").length,
    coreColumns: countColumns(tables, "core"),
    companionColumns: countColumns(tables, "companion"),
    sourceMigrations: migrations.length
  };

  add(inventory.schemaVersion === "1.0.0", "schema_version_invalid");
  add(inventory.artifact === "D1_CONTROL_SCHEMA_INVENTORY_V1", "artifact_name_invalid");
  add(inventory.status === "SOURCE_ONLY_T1_COMPLETE", "inventory_status_invalid");
  add(SHA1.test(inventory.sourceCommit ?? ""), "source_commit_invalid");
  add(inventory.scope?.productionPresence === "NOT_OBSERVED", "production_presence_must_remain_unobserved");
  add(inventory.scope?.noDualWrite === true, "dual_write_must_remain_disabled");
  add(inventory.scope?.productionWriterUntilCutover === "BWH Node/Express + SQLite", "production_writer_authority_mismatch");

  const declaredCounts = inventory.counts ?? {};
  for (const key of [
    "tables","columns","foreignKeys","indexes","triggers",
    "coreTables","companionTables","coreColumns","companionColumns"
  ]) {
    add(declaredCounts[key] === actualCounts[key], `count_mismatch:${key}`);
  }

  const tableNames = tables.map((table) => table?.name);
  add(tableNames.every((name) => typeof name === "string" && name.length > 0), "table_name_missing");
  add(unique(tableNames), "duplicate_table_name");

  for (const table of tables) {
    const columns = Array.isArray(table?.columns) ? table.columns : [];
    add(table.columnCount === columns.length, `column_count_mismatch:${table?.name ?? "unknown"}`);
    add(unique(columns.map((column) => column?.name)), `duplicate_column_name:${table?.name ?? "unknown"}`);
    add(columns.every((column) => typeof column?.name === "string" && typeof column?.type === "string"), `column_shape_invalid:${table?.name ?? "unknown"}`);
    add(table.productionPresence === "NOT_OBSERVED", `table_production_presence_not_observed:${table?.name ?? "unknown"}`);
    add(typeof table.source?.path === "string" && table.source.path.length > 0, `source_path_missing:${table?.name ?? "unknown"}`);
    add(SHA1.test(table.source?.blob ?? ""), `source_blob_invalid:${table?.name ?? "unknown"}`);
  }

  const migrationIds = migrations.map((migration) => migration?.migrationId);
  add(migrations.every((migration, index) => migration?.ordinal === index + 1), "migration_ordinals_not_contiguous");
  add(migrationIds.every((id) => typeof id === "string" && id.length > 0), "migration_id_missing");
  add(unique(migrationIds), "duplicate_migration_id");
  for (const migration of migrations) {
    add(SHA256.test(migration?.ddlSha256 ?? ""), `migration_checksum_invalid:${migration?.migrationId ?? "unknown"}`);
    add(migration.targetD1MigrationId === null, `target_migration_must_not_be_assigned:${migration?.migrationId ?? "unknown"}`);
    add(migration.sourceAppliedAt === "NOT_OBSERVED", `source_apply_time_must_remain_unobserved:${migration?.migrationId ?? "unknown"}`);
    add(migration.sourceDatabaseIdentity === "NOT_OBSERVED", `source_db_identity_must_remain_unobserved:${migration?.migrationId ?? "unknown"}`);
  }

  for (const [kind, entries] of [["index", indexes], ["trigger", triggers]]) {
    const names = entries.map((entry) => entry?.name);
    add(names.every((name) => typeof name === "string" && name.length > 0), `${kind}_name_missing`);
    add(unique(names), `duplicate_${kind}_name`);
    for (const entry of entries) {
      add(SHA1.test(entry?.blob ?? ""), `${kind}_source_blob_invalid:${entry?.name ?? "unknown"}`);
      add(typeof entry?.source === "string" && entry.source.length > 0, `${kind}_source_path_missing:${entry?.name ?? "unknown"}`);
    }
  }

  const exclusionNames = new Set((inventory.exclusions ?? []).map((entry) => entry?.name));
  for (const name of REQUIRED_EXCLUSIONS) {
    add(exclusionNames.has(name), `required_exclusion_missing:${name}`);
  }

  add(inventory.authorization?.repositoryOnly === true, "repository_only_boundary_missing");
  for (const key of FORBIDDEN_AUTHORIZATION) {
    add(inventory.authorization?.[key] === false, `authorization_must_remain_false:${key}`);
  }

  return { valid: errors.length === 0, errors, actualCounts };
}
