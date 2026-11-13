import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  SOURCE_MIGRATION_REGISTRY,
  validateD1SourceMigrationChecksums
} from "../services/platform/d1-source-migration-registry.mjs";

const inventory = JSON.parse(readFileSync(new URL("../../docs/D1_CONTROL_SCHEMA_INVENTORY_V1.json", import.meta.url), "utf8"));

test("matches all 19 source migration IDs and DDL checksums on the exact imported source head", () => {
  const result = validateD1SourceMigrationChecksums(inventory);
  assert.equal(result.valid, true, result.errors.join(", "));
  assert.equal(result.expectedCount, 19);
  assert.equal(result.actualCount, 19);
});

test("registry exports 19 unique migration identities", () => {
  assert.equal(SOURCE_MIGRATION_REGISTRY.length, 19);
  assert.equal(new Set(SOURCE_MIGRATION_REGISTRY.map((entry) => entry.migrationId)).size, 19);
});

test("rejects a changed source DDL checksum", () => {
  const changed = structuredClone(SOURCE_MIGRATION_REGISTRY);
  changed[0].ddlSha256 = "f".repeat(64);
  const result = validateD1SourceMigrationChecksums(inventory, changed);
  assert.ok(result.errors.includes(`source_migration_checksum_mismatch:${inventory.sourceMigrationHistory[0].migrationId}`));
});

test("rejects a missing migration and a duplicate migration identity", () => {
  const missing = SOURCE_MIGRATION_REGISTRY.slice(1);
  assert.ok(validateD1SourceMigrationChecksums(inventory, missing).errors
    .includes(`source_migration_missing:${inventory.sourceMigrationHistory[0].migrationId}`));

  const duplicate = [...SOURCE_MIGRATION_REGISTRY, SOURCE_MIGRATION_REGISTRY[0]];
  assert.ok(validateD1SourceMigrationChecksums(inventory, duplicate).errors
    .includes("registry_migration_id_duplicate"));
});

test("rejects untracked source migrations", () => {
  const extra = [...SOURCE_MIGRATION_REGISTRY, {
    migrationId: "20990101_001_untracked",
    ddlSha256: "e".repeat(64)
  }];
  assert.ok(validateD1SourceMigrationChecksums(inventory, extra).errors
    .includes("source_migration_unexpected:20990101_001_untracked"));
});
