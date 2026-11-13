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
const DEPENDENCY_KINDS = new Set([
  "structural_fk",
  "module_chain",
  "same_execution_bundle_conditional",
  "hard_checksum_gate",
  "hard_schema_gate",
  "checksum_bound_replacement"
]);
const FK_DELETE_ACTIONS = new Set(["CASCADE", "RESTRICT", "SET", null]);

function unique(values) {
  return new Set(values).size === values.length;
}

function countColumns(tables, layer) {
  return tables
    .filter((table) => layer === null || table.layer === layer)
    .reduce((total, table) => total + (Array.isArray(table.columns) ? table.columns.length : 0), 0);
}

function countLayer(entries, layer) {
  return entries.filter((entry) => entry.layer === layer).length;
}

function indexedColumnName(term) {
  if (typeof term !== "string") return null;
  const match = term.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)(?:\s+(?:ASC|DESC))?$/i);
  return match?.[1] ?? null;
}

function sourceMatches(sourceFiles, sourcePath, blob) {
  return typeof sourcePath === "string"
    && sourcePath.length > 0
    && SHA1.test(blob ?? "")
    && sourceFiles.get(sourcePath) === blob;
}

function graphIsAcyclic(nodes, edges) {
  const adjacency = new Map([...nodes].map((node) => [node, []]));
  const indegree = new Map([...nodes].map((node) => [node, 0]));
  for (const edge of edges) {
    adjacency.get(edge.from).push(edge.to);
    indegree.set(edge.to, indegree.get(edge.to) + 1);
  }
  const queue = [...indegree].filter(([, degree]) => degree === 0).map(([node]) => node);
  let visited = 0;
  while (queue.length) {
    const node = queue.shift();
    visited++;
    for (const target of adjacency.get(node)) {
      const next = indegree.get(target) - 1;
      indegree.set(target, next);
      if (next === 0) queue.push(target);
    }
  }
  return visited === nodes.size;
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
  const sourceFileEntries = Array.isArray(inventory.evidence?.sourceFiles) ? inventory.evidence.sourceFiles : [];
  const tableNames = tables.map((table) => table?.name);
  const tableByName = new Map(tables.filter((table) => typeof table?.name === "string").map((table) => [table.name, table]));
  const sourceFiles = new Map(sourceFileEntries.filter((entry) => typeof entry?.path === "string").map((entry) => [entry.path, entry.blob]));

  const actualCounts = {
    tables: tables.length,
    columns: countColumns(tables, null),
    foreignKeys: foreignKeys.length,
    indexes: indexes.length,
    triggers: triggers.length,
    coreTables: countLayer(tables, "core"),
    companionTables: countLayer(tables, "companion"),
    coreColumns: countColumns(tables, "core"),
    companionColumns: countColumns(tables, "companion"),
    coreForeignKeys: countLayer(foreignKeys, "core"),
    companionForeignKeys: countLayer(foreignKeys, "companion"),
    coreIndexes: countLayer(indexes, "core"),
    companionIndexes: countLayer(indexes, "companion"),
    coreTriggers: countLayer(triggers, "core"),
    companionTriggers: countLayer(triggers, "companion"),
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
    "coreTables","companionTables","coreColumns","companionColumns",
    "coreForeignKeys","companionForeignKeys","coreIndexes","companionIndexes",
    "coreTriggers","companionTriggers"
  ]) {
    add(declaredCounts[key] === actualCounts[key], `count_mismatch:${key}`);
  }

  add(tableNames.every((name) => typeof name === "string" && name.length > 0), "table_name_missing");
  add(unique(tableNames), "duplicate_table_name");
  add(sourceFileEntries.every((entry) => typeof entry?.path === "string" && SHA1.test(entry?.blob ?? "")), "source_file_entry_invalid");
  add(unique(sourceFileEntries.map((entry) => entry.path)), "duplicate_source_file_path");

  for (const table of tables) {
    const tableName = table?.name ?? "unknown";
    const columns = Array.isArray(table?.columns) ? table.columns : [];
    const columnNames = columns.map((column) => column?.name);
    add(table.layer === "core" || table.layer === "companion", `table_layer_invalid:${tableName}`);
    add(table.columnCount === columns.length, `column_count_mismatch:${tableName}`);
    add(unique(columnNames), `duplicate_column_name:${tableName}`);
    add(columns.every((column) => typeof column?.name === "string" && typeof column?.type === "string"), `column_shape_invalid:${tableName}`);
    add(table.productionPresence === "NOT_OBSERVED", `table_production_presence_not_observed:${tableName}`);
    add(sourceMatches(sourceFiles, table.source?.path, table.source?.blob), `table_source_identity_mismatch:${tableName}`);
    const tableMigrationIds = Array.isArray(table.migrationIds) ? table.migrationIds : [];
    add(unique(tableMigrationIds), `duplicate_table_migration_id:${tableName}`);
    add(tableMigrationIds.every((id) => migrations.some((migration) => migration.migrationId === id)), `table_migration_reference_unknown:${tableName}`);
    for (const additional of table.source?.additionalDefinitions ?? []) {
      add(sourceMatches(sourceFiles, additional?.path, additional?.blob), `additional_source_identity_mismatch:${tableName}`);
    }
  }

  const migrationIds = migrations.map((migration) => migration?.migrationId);
  add(migrations.every((migration, index) => migration?.ordinal === index + 1), "migration_ordinals_not_contiguous");
  add(migrationIds.every((id) => typeof id === "string" && id.length > 0), "migration_id_missing");
  add(unique(migrationIds), "duplicate_migration_id");
  for (const migration of migrations) {
    const id = migration?.migrationId ?? "unknown";
    add(SHA256.test(migration?.ddlSha256 ?? ""), `migration_checksum_invalid:${id}`);
    add(typeof migration?.checksumFormula === "string" && migration.checksumFormula.length > 0, `migration_checksum_formula_missing:${id}`);
    add(migration.targetD1MigrationId === null, `target_migration_must_not_be_assigned:${id}`);
    add(migration.sourceAppliedAt === "NOT_OBSERVED", `source_apply_time_must_remain_unobserved:${id}`);
    add(migration.sourceDatabaseIdentity === "NOT_OBSERVED", `source_db_identity_must_remain_unobserved:${id}`);
  }

  for (const edge of foreignKeys) {
    const from = tableByName.get(edge?.fromTable);
    const to = tableByName.get(edge?.toTable);
    const fromColumns = Array.isArray(edge?.fromColumns) ? edge.fromColumns : [];
    const toColumns = Array.isArray(edge?.toColumns) ? edge.toColumns : [];
    add(Boolean(from), `foreign_key_from_table_unknown:${edge?.fromTable ?? "unknown"}`);
    add(Boolean(to), `foreign_key_to_table_unknown:${edge?.toTable ?? "unknown"}`);
    add(fromColumns.length > 0 && fromColumns.length === toColumns.length, `foreign_key_column_arity_invalid:${edge?.fromTable ?? "unknown"}`);
    add(Boolean(from) && fromColumns.every((column) => from.columns.some((entry) => entry.name === column)), `foreign_key_from_column_unknown:${edge?.fromTable ?? "unknown"}`);
    add(Boolean(to) && toColumns.every((column) => to.columns.some((entry) => entry.name === column)), `foreign_key_to_column_unknown:${edge?.toTable ?? "unknown"}`);
    add(FK_DELETE_ACTIONS.has(edge?.onDelete ?? null), `foreign_key_delete_action_invalid:${edge?.fromTable ?? "unknown"}`);
    add(edge?.layer === from?.layer, `foreign_key_layer_mismatch:${edge?.fromTable ?? "unknown"}`);
  }

  for (const [kind, entries] of [["index", indexes], ["trigger", triggers]]) {
    const names = entries.map((entry) => entry?.name);
    add(names.every((name) => typeof name === "string" && name.length > 0), `${kind}_name_missing`);
    add(unique(names), `duplicate_${kind}_name`);
    for (const entry of entries) {
      const name = entry?.name ?? "unknown";
      const table = tableByName.get(entry?.table);
      add(Boolean(table), `${kind}_table_unknown:${name}`);
      add(sourceMatches(sourceFiles, entry?.source, entry?.blob), `${kind}_source_identity_mismatch:${name}`);
      if (kind === "index") {
        const columns = Array.isArray(entry?.columns) ? entry.columns : [];
        add(typeof entry?.unique === "boolean", `index_unique_flag_invalid:${name}`);
        add(columns.length > 0, `index_columns_missing:${name}`);
        add(Boolean(table) && columns.every((term) => {
          const column = indexedColumnName(term);
          return column !== null && table.columns.some((item) => item.name === column);
        }), `index_column_unknown:${name}`);
        add(entry?.predicate === null || typeof entry?.predicate === "string" || (entry?.predicate && typeof entry.predicate === "object"), `index_predicate_invalid:${name}`);
      } else {
        add(["BEFORE", "AFTER", "INSTEAD OF"].includes(entry?.timing), `trigger_timing_invalid:${name}`);
        add(typeof entry?.event === "string" && /^(INSERT|UPDATE|DELETE)(?:\s|$)/.test(entry.event), `trigger_event_invalid:${name}`);
      }
    }
  }

  const exclusionNames = new Set((inventory.exclusions ?? []).map((entry) => entry?.name));
  for (const name of REQUIRED_EXCLUSIONS) {
    add(exclusionNames.has(name), `required_exclusion_missing:${name}`);
  }

  const graph = inventory.dependencyGraph;
  const graphNodes = new Set([graph?.baseNode, ...migrationIds]);
  const graphEdges = Array.isArray(graph?.edges) ? graph.edges : [];
  for (const edge of graphEdges) {
    add(graphNodes.has(edge?.from) && graphNodes.has(edge?.to), `dependency_graph_node_unknown:${edge?.from ?? "unknown"}->${edge?.to ?? "unknown"}`);
    add(DEPENDENCY_KINDS.has(edge?.kind), `dependency_graph_kind_invalid:${edge?.kind ?? "unknown"}`);
    add(edge?.from !== edge?.to, "dependency_graph_self_edge");
  }
  if (graphEdges.every((edge) => graphNodes.has(edge?.from) && graphNodes.has(edge?.to) && edge?.from !== edge?.to)) {
    add(graphIsAcyclic(graphNodes, graphEdges), "dependency_graph_cycle");
  }

  add(inventory.authorization?.repositoryOnly === true, "repository_only_boundary_missing");
  for (const key of FORBIDDEN_AUTHORIZATION) {
    add(inventory.authorization?.[key] === false, `authorization_must_remain_false:${key}`);
  }

  return { valid: errors.length === 0, errors, actualCounts };
}
