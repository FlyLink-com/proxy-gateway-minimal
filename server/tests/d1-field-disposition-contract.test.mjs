import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateD1FieldDisposition } from "../services/platform/d1-field-disposition-contract.mjs";

const inventoryBytes = readFileSync(new URL("../../docs/D1_CONTROL_SCHEMA_INVENTORY_V1.json", import.meta.url));
const dispositionBytes = readFileSync(new URL("../../docs/D1_CONTROL_FIELD_DISPOSITION_T2_V1.json", import.meta.url));
const inventory = JSON.parse(inventoryBytes.toString("utf8"));
const disposition = JSON.parse(dispositionBytes.toString("utf8"));
const sourceInventoryBlob = createHash("sha1")
  .update(`blob ${inventoryBytes.length}\0`)
  .update(inventoryBytes)
  .digest("hex");

function validate(copy = structuredClone(disposition), sourceBlob = sourceInventoryBlob) {
  return validateD1FieldDisposition({ inventory, disposition: copy, sourceInventoryBlob: sourceBlob });
}

test("accepts exact 70-table / 820-field disposition map with 790 target candidates", () => {
  const result = validate();
  assert.equal(result.valid, true, result.errors.join(", "));
  assert.deepEqual(result.actualCounts, {
    tables: 70,
    fields: 820,
    tableDispositions: { KEEP: 64, CONDITIONAL: 4, DEFER: 2 },
    fieldDispositions: { KEEP: 712, CONDITIONAL: 59, EXTERNALIZE: 7, TRANSFORM: 19, DEFER: 23 },
    targetCandidateFields: 790,
    lowConfidenceFields: 1
  });
});

test("binds the disposition proposal to the exact inventory Git blob", () => {
  const result = validate(structuredClone(disposition), "a".repeat(40));
  assert.ok(result.errors.includes("source_inventory_blob_mismatch"));
});

test("rejects missing and duplicate source-field rows", () => {
  const missing = structuredClone(disposition);
  missing.fields.pop();
  assert.ok(validate(missing).errors.includes("field_disposition_coverage_mismatch"));

  const duplicate = structuredClone(disposition);
  duplicate.fields.push(structuredClone(duplicate.fields[0]));
  assert.ok(validate(duplicate).errors.includes("duplicate_field_disposition"));
});

test("rejects source column type and ordinal drift", () => {
  const wrongType = structuredClone(disposition);
  wrongType.fields[0].sourceType = "BLOB";
  assert.ok(validate(wrongType).errors.includes("field_source_type_mismatch:platform_leads.id"));

  const wrongOrdinal = structuredClone(disposition);
  wrongOrdinal.fields[0].ordinal = 9;
  assert.ok(validate(wrongOrdinal).errors.includes("field_ordinal_mismatch:platform_leads.id"));
});

test("rejects source nullability, key, default and check drift", () => {
  const nullable = structuredClone(disposition);
  nullable.fields[0].nullable = false;
  assert.ok(validate(nullable).errors.includes("field_nullable_mismatch:platform_leads.id"));

  const primaryKey = structuredClone(disposition);
  primaryKey.fields[0].primaryKey = false;
  assert.ok(validate(primaryKey).errors.includes("field_primary_key_mismatch:platform_leads.id"));

  const defaultValue = structuredClone(disposition);
  defaultValue.fields[0].default = "NULL";
  assert.ok(validate(defaultValue).errors.includes("field_default_mismatch:platform_leads.id"));

  const check = structuredClone(disposition);
  check.fields[0].check = true;
  assert.ok(validate(check).errors.includes("field_check_mismatch:platform_leads.id"));
});

test("rejects missing or semantically mismatched disposition rules", () => {
  const missing = structuredClone(disposition);
  delete missing.rules[missing.fields[0].ruleId];
  assert.ok(validate(missing).errors.includes("field_rule_missing:platform_leads.id"));

  const mismatch = structuredClone(disposition);
  mismatch.rules[mismatch.fields[0].ruleId].disposition = "DEFER";
  assert.ok(validate(mismatch).errors.includes("field_rule_disposition_mismatch:platform_leads.id"));
});

test("rejects unknown retention and test references", () => {
  const retention = structuredClone(disposition);
  retention.fields[0].retentionId = "RET-NOT-DEFINED";
  assert.ok(validate(retention).errors.includes("field_retention_rule_missing:platform_leads.id"));

  const testRef = structuredClone(disposition);
  testRef.fields[0].testIds = ["T2-NOT-DEFINED"];
  assert.ok(validate(testRef).errors.includes("field_test_reference_unknown:platform_leads.id"));
});

test("rejects inclusion and target-column drift", () => {
  const inclusion = structuredClone(disposition);
  inclusion.fields[0].inclusion = "excluded_from_d1";
  assert.ok(validate(inclusion).errors.includes("field_inclusion_mismatch:platform_leads.id"));

  const target = structuredClone(disposition);
  const externalized = target.fields.find(field => field.disposition === "EXTERNALIZE");
  externalized.targetColumn = "email";
  assert.ok(validate(target).errors.includes(`excluded_target_column_not_null:${externalized.table}.${externalized.column}`));
});

test("rejects table coverage and target-candidate count drift", () => {
  const tableCoverage = structuredClone(disposition);
  tableCoverage.tables.pop();
  assert.ok(validate(tableCoverage).errors.includes("table_disposition_coverage_mismatch"));

  const targetCount = structuredClone(disposition);
  targetCount.tables[0].targetCandidateColumns += 1;
  assert.ok(validate(targetCount).errors.includes(`table_target_candidate_count_mismatch:${targetCount.tables[0].name}`));
});

test("rejects source table lineage drift and deferred-table leakage", () => {
  const lineage = structuredClone(disposition);
  lineage.tables[0].sourceBlob = "a".repeat(40);
  assert.ok(validate(lineage).errors.includes(`table_source_blob_mismatch:${lineage.tables[0].name}`));

  const deferred = structuredClone(disposition);
  const deferredTable = deferred.tables.find(table => table.disposition === "DEFER");
  const deferredField = deferred.fields.find(field => field.table === deferredTable.name);
  deferredField.disposition = "KEEP";
  deferredField.inclusion = "included";
  deferredField.targetColumn = deferredField.column;
  deferredField.targetType = deferredField.sourceType;
  assert.ok(validate(deferred).errors.includes(`deferred_table_has_non_deferred_field:${deferredTable.name}`));
});

test("rejects count drift, low-confidence drift and production authorization", () => {
  const count = structuredClone(disposition);
  count.counts.targetCandidateFields = 789;
  assert.ok(validate(count).errors.includes("count_mismatch:targetCandidateFields"));

  const confidence = structuredClone(disposition);
  confidence.counts.lowConfidenceFields = 0;
  assert.ok(validate(confidence).errors.includes("count_mismatch:lowConfidenceFields"));

  const authorization = structuredClone(disposition);
  authorization.authorization.d1Apply = true;
  assert.ok(validate(authorization).errors.includes("authorization_must_remain_false:d1Apply"));
});

test("keeps the field map in proposal state until domain review", () => {
  const copy = structuredClone(disposition);
  copy.approvalState = "APPROVED";
  assert.ok(validate(copy).errors.includes("approval_state_must_remain_proposed"));
});
