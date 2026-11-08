import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { validateD1ControlSchemaInventory } from "../services/platform/d1-control-schema-inventory-contract.mjs";

const inventory = JSON.parse(readFileSync(new URL("../../docs/D1_CONTROL_SCHEMA_INVENTORY_V1.json", import.meta.url), "utf8"));

test("accepts the pinned source-only 70-table inventory", () => {
  const result = validateD1ControlSchemaInventory(inventory);
  assert.equal(result.valid, true, result.errors.join(", "));
  assert.deepEqual(result.actualCounts, {
    tables: 70,
    columns: 820,
    foreignKeys: 126,
    indexes: 88,
    triggers: 91,
    coreTables: 48,
    companionTables: 22,
    coreColumns: 530,
    companionColumns: 290,
    coreForeignKeys: 84,
    companionForeignKeys: 42,
    coreIndexes: 71,
    companionIndexes: 17,
    coreTriggers: 41,
    companionTriggers: 50,
    sourceMigrations: 19
  });
});

test("rejects declared count drift", () => {
  const copy = structuredClone(inventory);
  copy.counts.columns = 819;
  const result = validateD1ControlSchemaInventory(copy);
  assert.ok(result.errors.includes("count_mismatch:columns"));
});

test("rejects duplicate table names and duplicate columns", () => {
  const duplicateTable = structuredClone(inventory);
  duplicateTable.tables[1].name = duplicateTable.tables[0].name;
  assert.ok(validateD1ControlSchemaInventory(duplicateTable).errors.includes("duplicate_table_name"));

  const duplicateColumn = structuredClone(inventory);
  duplicateColumn.tables[0].columns[1].name = duplicateColumn.tables[0].columns[0].name;
  assert.ok(validateD1ControlSchemaInventory(duplicateColumn).errors.includes("duplicate_column_name:platform_leads"));
});

test("rejects a table columnCount that does not match its columns", () => {
  const copy = structuredClone(inventory);
  copy.tables[0].columnCount += 1;
  assert.ok(validateD1ControlSchemaInventory(copy).errors.includes("column_count_mismatch:platform_leads"));
});

test("rejects invalid source blob fingerprints", () => {
  const copy = structuredClone(inventory);
  copy.tables[0].source.blob = "not-a-git-blob";
  assert.ok(validateD1ControlSchemaInventory(copy).errors.includes("source_blob_invalid:platform_leads"));
});

test("rejects duplicate migration identities and non-contiguous ordinals", () => {
  const duplicate = structuredClone(inventory);
  duplicate.sourceMigrationHistory[1].migrationId = duplicate.sourceMigrationHistory[0].migrationId;
  assert.ok(validateD1ControlSchemaInventory(duplicate).errors.includes("duplicate_migration_id"));

  const gap = structuredClone(inventory);
  gap.sourceMigrationHistory[0].ordinal = 2;
  assert.ok(validateD1ControlSchemaInventory(gap).errors.includes("migration_ordinals_not_contiguous"));
});

test("rejects malformed source migration checksums", () => {
  const copy = structuredClone(inventory);
  copy.sourceMigrationHistory[0].ddlSha256 = "abc";
  assert.ok(validateD1ControlSchemaInventory(copy).errors.includes("migration_checksum_invalid:20260723_001_coin_wallet_foundation"));
});

test("rejects accidental production authorization", () => {
  const copy = structuredClone(inventory);
  copy.authorization.d1Apply = true;
  copy.authorization.bwhConnection = true;
  const result = validateD1ControlSchemaInventory(copy);
  assert.ok(result.errors.includes("authorization_must_remain_false:d1Apply"));
  assert.ok(result.errors.includes("authorization_must_remain_false:bwhConnection"));
});

test("rejects missing out-of-scope exclusions", () => {
  const copy = structuredClone(inventory);
  copy.exclusions = copy.exclusions.filter((entry) => entry.name !== "BWH credential-material file store");
  assert.ok(validateD1ControlSchemaInventory(copy).errors.includes("required_exclusion_missing:BWH credential-material file store"));
});

test("rejects any source object marked as production-observed", () => {
  const copy = structuredClone(inventory);
  copy.tables[0].productionPresence = "PRESENT";
  assert.ok(validateD1ControlSchemaInventory(copy).errors.includes("table_production_presence_not_observed:platform_leads"));
});


test("rejects foreign-key edges with unknown tables or columns", () => {
  const unknownTable = structuredClone(inventory);
  unknownTable.foreignKeyEdges[0].toTable = "platform_missing_parent";
  assert.ok(validateD1ControlSchemaInventory(unknownTable).errors
    .includes("foreign_key_to_table_unknown:platform_missing_parent"));

  const unknownColumn = structuredClone(inventory);
  unknownColumn.foreignKeyEdges[0].fromColumns[0] = "missing_account_ref";
  assert.ok(validateD1ControlSchemaInventory(unknownColumn).errors
    .includes("foreign_key_from_column_unknown:platform_entitlements"));
});

test("rejects indexes that reference missing tables or columns", () => {
  const unknownTable = structuredClone(inventory);
  unknownTable.indexes[0].table = "platform_missing_table";
  assert.ok(validateD1ControlSchemaInventory(unknownTable).errors
    .includes("index_table_unknown:platform_leads_status_created_idx"));

  const unknownColumn = structuredClone(inventory);
  unknownColumn.indexes[0].columns[0] = "missing_column";
  assert.ok(validateD1ControlSchemaInventory(unknownColumn).errors
    .includes("index_column_unknown:platform_leads_status_created_idx"));
});

test("rejects triggers that reference unknown tables or invalid events", () => {
  const unknownTable = structuredClone(inventory);
  unknownTable.triggers[0].table = "platform_missing_table";
  assert.ok(validateD1ControlSchemaInventory(unknownTable).errors
    .includes(`trigger_table_unknown:${inventory.triggers[0].name}`));

  const invalidEvent = structuredClone(inventory);
  invalidEvent.triggers[0].event = "UPSERT";
  assert.ok(validateD1ControlSchemaInventory(invalidEvent).errors
    .includes(`trigger_event_invalid:${inventory.triggers[0].name}`));
});

test("requires table migration references and source blob identities to resolve", () => {
  const unknownMigration = structuredClone(inventory);
  const migratedTable = unknownMigration.tables.find((table) => table.migrationIds.length > 0);
  migratedTable.migrationIds.push("20990101_001_unknown_migration");
  assert.ok(validateD1ControlSchemaInventory(unknownMigration).errors
    .includes(`table_migration_reference_unknown:${migratedTable.name}`));

  const wrongSource = structuredClone(inventory);
  wrongSource.tables[0].source.blob = "a".repeat(40);
  assert.ok(validateD1ControlSchemaInventory(wrongSource).errors
    .includes(`table_source_identity_mismatch:${wrongSource.tables[0].name}`));
});

test("rejects dependency graph cycles and unknown nodes", () => {
  const unknownNode = structuredClone(inventory);
  unknownNode.dependencyGraph.edges.push({
    from: "UNKNOWN_MIGRATION",
    to: unknownNode.sourceMigrationHistory[0].migrationId,
    kind: "module_chain"
  });
  assert.ok(validateD1ControlSchemaInventory(unknownNode).errors
    .includes(`dependency_graph_node_unknown:UNKNOWN_MIGRATION->${unknownNode.sourceMigrationHistory[0].migrationId}`));

  const cycle = structuredClone(inventory);
  cycle.dependencyGraph.edges.push({
    from: cycle.sourceMigrationHistory[0].migrationId,
    to: cycle.dependencyGraph.baseNode,
    kind: "module_chain"
  });
  assert.ok(validateD1ControlSchemaInventory(cycle).errors.includes("dependency_graph_cycle"));
});

test("rejects layer-specific object count drift", () => {
  const copy = structuredClone(inventory);
  copy.counts.companionTriggers = 49;
  assert.ok(validateD1ControlSchemaInventory(copy).errors.includes("count_mismatch:companionTriggers"));
});
