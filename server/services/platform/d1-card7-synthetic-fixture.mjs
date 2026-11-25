// D1 Card 7 — synthetic fixture builder (in-memory SQLite only).
//
// Builds a `:memory:` SQLite database holding one synthetic row set per
// source table (70 tables), using only the mapping in
// `d1-card7-70-table-mapping.mjs`. Every value is synthetic and labelled
// `synth-…`; no real BWH row, password, hash, or key material is ever
// present here. The caller supplies the already-open `DatabaseSync` handle
// (from `node:sqlite`); this module opens no files and touches no network.
//
// Fixture shape per table:
// - Row 1 fills every column (boundary values where the column has them).
// - Row 2 leaves every nullable column NULL (NULL-coverage row).
// - `platform_usage_samples` gets 1 row on purpose: the reader must refuse
//   it by table name even when rows exist (load 0 rows, D-3 option C).
// - `platform_edge_agent_leases` (1 row) + `platform_edge_apply_receipts`
//   (3 rows) additionally get the exact seven-column fixture rows used by
//   the Card 6 / S4 synthetic check: one lease with released_at NULL, and
//   three receipts covering NULL / populated-with-leading-zero-'007' /
//   non-losslessly-storable digest (BLOB, defers the whole row with D-1).

import { TABLE_MAPPING, tableMappingFor } from "./d1-card7-70-table-mapping.mjs";
import { EXTERNALIZE_SOURCE_COLUMNS, RAW_TO_DIGEST_COLUMN } from "./d1-card7-70-table-importer.mjs";

export const SYNTHETIC_MARKER = "d1-card7-synth-only";

const INTEGER_BOUNDARIES = [0, 1, 2147483647];

export function syntheticTextValue(table, column, index) {
  return `synth-${table}-${column}-${index}`;
}

export function syntheticValueFor(table, column, index) {
  // Seven-column boundary values first.
  if (table === "platform_edge_agent_leases" && column === "released_at") return null;
  if (table === "platform_edge_apply_receipts") {
    if (column === "node_ref") return index === 0 ? null : "synth-node-001";
    if (column === "generation") return index === 0 ? null : "007";
    if (column === "receipt_digest") return index === 0 ? null : "synth-digest-abc123";
    if (column === "reason_code") return index === 0 ? null : "synth-ok";
    if (column === "listener_present") return index === 0 ? 0 : 1;
    if (column === "credential_count") return index === 0 ? 0 : 2147483647;
  }
  // TRANSFORM JSON columns: the importer validates each value against
  // its versioned field-specific schema (d1-card7-70-table-importer.mjs
  // CONTROLLED_JSON_SCHEMAS), so the fixture must emit a value that
  // matches the real contract for that column — never a generic
  // {"synth": true, ...} object, which the schemas reject as unknown
  // fields. Each shape below mirrors the in-repo write contract for
  // that column (see the importer header for the grounding).
  if (table === "platform_audit_events" && column === "metadata_json") {
    return JSON.stringify({
      version: 1,
      commandRef: `synth-command-${index}`,
      orderRef: `synth-order-${index}`,
      accountId: `synth-account-${index}`,
      requestRef: `synth-request-${index}`,
      entitlementRef: `synth-entitlement-${index}`,
      issuedLinkRef: `synth-issued-link-${index}`,
      tenantRef: `synth-tenant-${index}`,
      artifactRef: `synth-artifact-${index}`,
      offerVersionRef: `synth-offer-version-${index}`,
      portalPlan: "monthly",
      durationDays: 30,
      monthlyTrafficGb: 50,
      trafficLimitBytes: 50 * (1024 ** 3),
      validFrom: "2026-11-21T00:00:00.000Z",
      previousValidUntil: "2026-11-21T00:00:00.000Z",
      targetValidUntil: "2026-12-21T00:00:00.000Z",
    });
  }
  if (table === "platform_coin_commerce_fulfillment_commands" && column === "payload_json") {
    return JSON.stringify({
      offerVersionRef: `synth-offer-version-${index}`,
      delivery: {
        kind: "subscription_plan",
        durationDays: 30,
        monthlyTrafficGb: 50,
        trafficGb: 50,
        neverExpires: false,
        discountBasisPoints: 0,
      },
    });
  }
  if (table === "platform_edge_registered_nodes" && column === "metadata_json") {
    return JSON.stringify({
      source: "node-image-first-boot-packet",
      receiptGateRequired: true,
      imageSafeConfirmed: true,
      artifactHashRecorded: false,
      wireguardPlanRef: `synth-wg-plan-${index}`,
      wireguardPublicKeyFingerprint: `sha256:${"a".repeat(64)}`,
      agentAuthFingerprint: `sha256:${"b".repeat(64)}`,
    });
  }
  if (table === "platform_issuance_requests" && column === "metadata_json") {
    return JSON.stringify({ cli: "platform:issue-subscription" });
  }
  if (table === "platform_portal_access_requests" && column === "event_json") {
    return JSON.stringify({ type: "delivery_generation_reissued", occurredAt: "2026-11-21T00:00:00.000Z" });
  }
  if (column.endsWith("_json") || column === "payload_json" || column === "event_json") {
    return JSON.stringify({ synth: true, table, column, index });
  }
  if (column.endsWith("_digest") || column.endsWith("_hash")) {
    // Distinct per (table, column, index): digest columns are primary keys
    // on some tables (e.g. referral_touches.token_digest).
    return `synth-digest-${table}-${column}-${index}`;
  }
  if (column === "encrypted_totp_secret") return "SYNTH-NOT-A-REAL-SECRET";
  if (column === "subscription_url" || column === "next_action_url"
    || column === "checkout_url" || column === "checkout_qr_code") {
    // EXTERNALIZE columns: row 1 carries a value on purpose so the filter
    // must reject the row; row 2 is NULL so the column is dropped cleanly.
    return index === 0 ? `synth-externalized-${column}` : null;
  }
  const mapping = tableMappingFor(table);
  const def = mapping?.columns.find((c) => c.name === column);
  if (def?.type === "INTEGER") return INTEGER_BOUNDARIES[index % INTEGER_BOUNDARIES.length];
  return syntheticTextValue(table, column, index);
}

// Source-only columns: present in the BWH source but deliberately absent
// from the DDL target. The synthetic source schema must carry them, or the
// filter's source-side guards could never be exercised.
// - EXTERNALIZE columns (E-01..E-07 for tables in the mapping; E-08 belongs
//   to a DDL-only table with no synthetic source rows — see the report).
// - Raw digest-source columns (idempotency_key / lease_token /
//   create_idempotency_key / event_dedupe_key): the DDL carries only the
//   digest column, so the source schema must carry the raw one.
// - platform_accounts.metadata_json (M1-02: not built, not loaded).
export function sourceOnlyColumnsFor(table) {
  const extras = [];
  for (const ext of EXTERNALIZE_SOURCE_COLUMNS) {
    if (ext.table === table) extras.push(ext.column);
  }
  for (const raw of Object.keys(RAW_TO_DIGEST_COLUMN[table] ?? {})) extras.push(raw);
  if (table === "platform_accounts") extras.push("metadata_json");
  return extras;
}

export function sourceColumnsFor(table) {
  const mapping = tableMappingFor(table);
  const cols = mapping.columns.map((c) => ({ name: c.name, type: c.type, notNull: c.notNull, pk: c.pk }));
  for (const name of sourceOnlyColumnsFor(table)) {
    if (!cols.some((c) => c.name === name)) {
      cols.push({ name, type: "TEXT", notNull: false, pk: false, sourceOnly: true });
    }
  }
  return cols;
}

function fixtureTableDdl(table) {
  const cols = sourceColumnsFor(table);
  const pkCols = cols.filter((c) => c.pk).map((c) => c.name);
  const parts = cols.map((c) => {
    let def = `"${c.name}" ${c.type}`;
    // A composite key is a table-level PRIMARY KEY constraint:
    // SQLite rejects two inline PRIMARY KEYs in one CREATE TABLE.
    if (c.pk && pkCols.length === 1) def += " PRIMARY KEY";
    if (c.notNull && !c.pk) def += " NOT NULL";
    return def;
  });
  if (pkCols.length > 1) {
    parts.push(`PRIMARY KEY (${pkCols.map((name) => `"${name}"`).join(", ")})`);
  }
  // Keep the fixture schema free of CHECK / FK clauses on purpose: the
  // fixture proves row filtering, batching, checkpointing and hashing, not
  // DDL trigger / FK enforcement (covered by the DDL S4 synthetic test).
  return `CREATE TABLE "${table}" (${parts.join(", ")})`;
}

export function createSyntheticFixtureDb(db) {
  if (!db || typeof db.exec !== "function" || typeof db.prepare !== "function") {
    throw new Error("synthetic_fixture_db_invalid");
  }
  db.exec("BEGIN");
  try {
    for (const entry of TABLE_MAPPING) {
      const table = entry.source;
      db.exec(fixtureTableDdl(table));
      const cols = sourceColumnsFor(table);
      const placeholders = cols.map(() => "?").join(", ");
      const insert = db.prepare(
        `INSERT INTO "${table}" (${cols.map((c) => `"${c.name}"`).join(", ")}) VALUES (${placeholders})`,
      );
      // Row 1: every column filled. Row 2: nullable columns NULL.
      for (let index = 0; index < 2; index++) {
        const values = cols.map((c) => {
          if (index === 1 && !c.notNull && !c.pk) return null;
          return syntheticValueFor(table, c.name, index);
        });
        insert.run(...values);
      }
    }
    // Seven-column fixture rows (Card 6 / S4 check): replace the two generic
    // receipts rows with the exact 1-lease + 3-receipt set.
    db.exec(`DELETE FROM "platform_edge_agent_leases"`);
    db.exec(`DELETE FROM "platform_edge_apply_receipts"`);
    const leaseCols = tableMappingFor("platform_edge_agent_leases").columns;
    const leaseInsert = db.prepare(
      `INSERT INTO "platform_edge_agent_leases" (${leaseCols.map((c) => `"${c.name}"`).join(", ")}) VALUES (${leaseCols.map(() => "?").join(", ")})`,
    );
    leaseInsert.run(...leaseCols.map((c) => syntheticValueFor("platform_edge_agent_leases", c.name, 0)));
    const receiptCols = tableMappingFor("platform_edge_apply_receipts").columns;
    const receiptInsert = db.prepare(
      `INSERT INTO "platform_edge_apply_receipts" (${receiptCols.map((c) => `"${c.name}"`).join(", ")}) VALUES (${receiptCols.map(() => "?").join(", ")})`,
    );
    // Receipt 1: drift columns all NULL, listener 0, credential 0.
    receiptInsert.run(...receiptCols.map((c) => syntheticValueFor("platform_edge_apply_receipts", c.name, 0)));
    // Receipt 2: populated, generation '007' (leading zero), listener 1,
    // credential_count at the 32-bit boundary.
    receiptInsert.run(...receiptCols.map((c) => syntheticValueFor("platform_edge_apply_receipts", c.name, 1)));
    // Receipt 3: receipt_digest is a BLOB — not losslessly storable as
    // TEXT, so the filter must defer the whole row with D-1. It uses
    // index 2 for the other columns so its PK differs from receipt 2.
    receiptInsert.run(...receiptCols.map((c) => {
      if (c.name === "receipt_digest") return Buffer.from([0xff, 0xfe, 0xfd]);
      return syntheticValueFor("platform_edge_apply_receipts", c.name, 2);
    }));
    db.exec("COMMIT");
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch { /* already rolled back */ }
    throw error;
  }
  return db;
}

export function fixtureRowCounts(db) {
  const counts = {};
  for (const entry of TABLE_MAPPING) {
    counts[entry.source] = db.prepare(`SELECT COUNT(*) AS n FROM "${entry.source}"`).get().n;
  }
  return counts;
}
