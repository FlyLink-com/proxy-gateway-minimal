const TABLE_DISPOSITIONS = new Set(["KEEP", "CONDITIONAL", "DEFER"]);
const FIELD_DISPOSITIONS = new Set(["KEEP", "CONDITIONAL", "EXTERNALIZE", "TRANSFORM", "DEFER"]);
const INCLUSION_BY_DISPOSITION = Object.freeze({
  KEEP: "included",
  CONDITIONAL: "conditional",
  EXTERNALIZE: "excluded_from_d1",
  TRANSFORM: "included_after_transform",
  DEFER: "deferred_until_feature_approval"
});
const CANDIDATE_INCLUSIONS = new Set(["included", "conditional", "included_after_transform"]);
const CONFIDENCE = new Set(["low", "medium", "high"]);
const SOURCE_COMMIT = /^[0-9a-f]{40}$/;

function countBy(items, key) {
  const counts = {};
  for (const item of items) {
    const value = item?.[key] ?? "INVALID";
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function sameCounts(actual, expected) {
  const keys = new Set([...Object.keys(actual), ...Object.keys(expected ?? {})]);
  return [...keys].every((key) => (actual[key] ?? 0) === (expected?.[key] ?? 0));
}

export function validateD1FieldDisposition({ inventory, disposition, sourceInventoryBlob } = {}) {
  const errors = [];
  const add = (condition, code) => { if (!condition) errors.push(code); };

  if (!inventory || typeof inventory !== "object" || !Array.isArray(inventory.tables)
    || !disposition || typeof disposition !== "object" || Array.isArray(disposition)) {
    return { valid: false, errors: ["field_disposition_input_invalid"], actualCounts: null };
  }

  const sourceTables = inventory.tables;
  const sourceByName = new Map(sourceTables.map((table) => [table.name, table]));
  const tables = Array.isArray(disposition.tables) ? disposition.tables : [];
  const fields = Array.isArray(disposition.fields) ? disposition.fields : [];
  const rules = disposition.rules && typeof disposition.rules === "object" ? disposition.rules : {};
  const retention = disposition.retentionCatalog && typeof disposition.retentionCatalog === "object"
    ? disposition.retentionCatalog : {};
  const tests = Array.isArray(disposition.testCatalog) ? disposition.testCatalog : [];
  const testIds = new Set(tests.map((entry) => entry?.id));
  const tableNames = tables.map((table) => table?.name);
  const fieldKeys = fields.map((field) => `${field?.table}.${field?.column}`);
  const tableByName = new Map(tables.filter((table) => typeof table?.name === "string").map((table) => [table.name, table]));
  const fieldsByTable = new Map();
  for (const field of fields) {
    const list = fieldsByTable.get(field?.table) ?? [];
    list.push(field);
    fieldsByTable.set(field?.table, list);
  }

  const candidateFields = fields.filter((field) => CANDIDATE_INCLUSIONS.has(field?.inclusion));
  const actualCounts = {
    tables: tables.length,
    fields: fields.length,
    tableDispositions: countBy(tables, "disposition"),
    fieldDispositions: countBy(fields, "disposition"),
    targetCandidateFields: candidateFields.length,
    lowConfidenceFields: fields.filter((field) => field?.confidence === "low").length
  };

  add(disposition.schemaVersion === "1.0.0", "schema_version_invalid");
  add(disposition.artifact === "D1_CONTROL_FIELD_DISPOSITION_T2_V1", "artifact_name_invalid");
  add(disposition.approvalState === "ALL_FIELD_ROWS_PROPOSAL_PENDING_REVIEW", "approval_state_must_remain_proposed");
  add(SOURCE_COMMIT.test(disposition.sourceCommit ?? ""), "source_commit_invalid");
  add(disposition.sourceCommit === inventory.sourceCommit, "source_commit_mismatch");
  add(disposition.sourceInventory?.path === "docs/D1_CONTROL_SCHEMA_INVENTORY_V1.json", "source_inventory_path_mismatch");
  add(/^[0-9a-f]{40}$/.test(sourceInventoryBlob ?? ""), "source_inventory_blob_invalid");
  add(disposition.sourceInventory?.blob === sourceInventoryBlob, "source_inventory_blob_mismatch");
  add(disposition.sourceInventory?.sourceTables === sourceTables.length, "source_inventory_table_count_mismatch");
  add(disposition.sourceInventory?.sourceFields === sourceTables.reduce((sum, table) => sum + table.columns.length, 0), "source_inventory_field_count_mismatch");

  add(tables.length === sourceTables.length, "table_disposition_coverage_mismatch");
  add(new Set(tableNames).size === tableNames.length, "duplicate_table_disposition");
  add(new Set(fieldKeys).size === fieldKeys.length, "duplicate_field_disposition");
  add(fields.length === sourceTables.reduce((sum, table) => sum + table.columns.length, 0), "field_disposition_coverage_mismatch");

  const tableCounts = countBy(tables, "disposition");
  const fieldCounts = countBy(fields, "disposition");
  add(disposition.counts?.tables === actualCounts.tables, "count_mismatch:tables");
  add(disposition.counts?.fields === actualCounts.fields, "count_mismatch:fields");
  add(sameCounts(tableCounts, disposition.counts?.tableDispositions), "count_mismatch:tableDispositions");
  add(sameCounts(fieldCounts, disposition.counts?.fieldDispositions), "count_mismatch:fieldDispositions");
  add(disposition.counts?.targetCandidateFields === actualCounts.targetCandidateFields, "count_mismatch:targetCandidateFields");
  add(disposition.counts?.lowConfidenceFields === actualCounts.lowConfidenceFields, "count_mismatch:lowConfidenceFields");

  for (const source of sourceTables) {
    const name = source.name;
    const table = tableByName.get(name);
    add(Boolean(table), `table_disposition_missing:${name}`);
    if (!table) continue;
    add(TABLE_DISPOSITIONS.has(table.disposition), `table_disposition_invalid:${name}`);
    add(table.layer === source.layer, `table_layer_mismatch:${name}`);
    add(table.slice === source.slice, `table_slice_mismatch:${name}`);
    add(table.sourceModule === source.source?.path, `table_source_module_mismatch:${name}`);
    add(table.sourceBlob === source.source?.blob, `table_source_blob_mismatch:${name}`);
    add(table.sourceColumns === source.columns.length, `table_source_column_count_mismatch:${name}`);
    add(table.productionPresence === "NOT_OBSERVED", `table_production_presence_not_observed:${name}`);
    add(JSON.stringify(table.migrationIds ?? []) === JSON.stringify(source.migrationIds ?? []), `table_migration_ids_mismatch:${name}`);

    const tableFields = fieldsByTable.get(name) ?? [];
    const candidates = tableFields.filter((field) => CANDIDATE_INCLUSIONS.has(field.inclusion));
    add(tableFields.length === source.columns.length, `table_field_coverage_mismatch:${name}`);
    add(table.targetCandidateColumns === candidates.length, `table_target_candidate_count_mismatch:${name}`);
    add(uniqueTargetColumns(candidates), `duplicate_target_column:${name}`);
    if (table.disposition === "DEFER") {
      add(tableFields.every((field) => field.disposition === "DEFER"), `deferred_table_has_non_deferred_field:${name}`);
      add(candidates.length === 0, `deferred_table_has_target_candidate:${name}`);
    }

    for (let ordinal = 0; ordinal < source.columns.length; ordinal++) {
      const sourceColumn = source.columns[ordinal];
      const field = tableFields[ordinal];
      const key = `${name}.${sourceColumn.name}`;
      add(field?.table === name && field?.column === sourceColumn.name, `field_order_or_name_mismatch:${key}`);
      if (!field) continue;
      add(field.ordinal === ordinal + 1, `field_ordinal_mismatch:${key}`);
      add(field.sourceType === sourceColumn.type, `field_source_type_mismatch:${key}`);
      add(field.nullable === !sourceColumn.notNull, `field_nullable_mismatch:${key}`);
      add(field.primaryKey === sourceColumn.primaryKey, `field_primary_key_mismatch:${key}`);
      add(field.unique === sourceColumn.unique, `field_unique_mismatch:${key}`);
      add(field.default === sourceColumn.default, `field_default_mismatch:${key}`);
      add(field.check === sourceColumn.check, `field_check_mismatch:${key}`);
      add(FIELD_DISPOSITIONS.has(field.disposition), `field_disposition_invalid:${key}`);
      add(field.inclusion === INCLUSION_BY_DISPOSITION[field.disposition], `field_inclusion_mismatch:${key}`);
      const rule = rules[field.ruleId];
      add(Boolean(rule), `field_rule_missing:${key}`);
      if (rule) {
        add(rule.disposition === field.disposition, `field_rule_disposition_mismatch:${key}`);
        add(rule.confidence === field.confidence, `field_rule_confidence_mismatch:${key}`);
        add(typeof rule.reason === "string" && rule.reason.length > 0, `field_rule_reason_missing:${key}`);
        if (field.disposition === "CONDITIONAL" || field.disposition === "DEFER") {
          add(typeof rule.condition === "string" && rule.condition.length > 0, `field_rule_condition_missing:${key}`);
        }
        if (field.disposition === "TRANSFORM") {
          add(typeof rule.transform === "string" && rule.transform.length > 0, `field_rule_transform_missing:${key}`);
        }
      }
      add(CONFIDENCE.has(field.confidence), `field_confidence_invalid:${key}`);
      add(Boolean(retention[field.retentionId]), `field_retention_rule_missing:${key}`);
      add(Array.isArray(field.testIds) && field.testIds.length > 0, `field_test_ids_missing:${key}`);
      add(Array.isArray(field.testIds) && field.testIds.every((id) => testIds.has(id)), `field_test_reference_unknown:${key}`);
      if (CANDIDATE_INCLUSIONS.has(field.inclusion)) {
        add(typeof field.targetColumn === "string" && field.targetColumn.length > 0, `target_column_missing:${key}`);
        add(typeof field.targetType === "string" && field.targetType.length > 0, `target_type_missing:${key}`);
      } else {
        add(field.targetColumn === null && field.targetType === null, `excluded_target_column_not_null:${key}`);
      }
    }
  }

  for (const table of tables) {
    add(sourceByName.has(table?.name), `unknown_table_disposition:${table?.name ?? "unknown"}`);
  }
  add(new Set(tests.map((entry) => entry?.id)).size === tests.length, "duplicate_test_catalog_id");
  add(tests.every((entry) => typeof entry?.id === "string" && typeof entry?.name === "string"), "test_catalog_entry_invalid");

  const authorization = disposition.authorization ?? {};
  add(authorization.repositoryOnly === true, "repository_only_boundary_missing");
  add(authorization.syntheticOnly === true, "synthetic_only_boundary_missing");
  for (const key of ["productionRead", "bwhConnection", "remoteCloudflareMutation", "d1Apply", "workerDeployment", "ciTriggered", "prCreated", "merged", "cutover"]) {
    add(authorization[key] === false, `authorization_must_remain_false:${key}`);
  }

  return { valid: errors.length === 0, errors, actualCounts };
}

function uniqueTargetColumns(fields) {
  const names = fields.map((field) => field.targetColumn);
  return new Set(names).size === names.length;
}
