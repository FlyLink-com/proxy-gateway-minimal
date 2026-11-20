// D1 Stage 1B — source-side dry-run delta enumeration.
//
// Given a checkpoint manifest (primary key -> content fingerprint, built
// by buildCheckpointManifest) and the current database, enumerate the
// delta by primary key and fingerprint: inserts, updates and deletes.
// The manifest carries ONLY primary keys and fingerprints — never row
// values — and fingerprints never cover credential columns, so no raw
// credential material can reach D1 through this interface.
//
// Read-only: this module performs SELECTs only. It creates no tables,
// writes no rows, and never imports anything into E4. Actual E4 import
// is a later stage.
//
// Known limitation, by design: a change that touches ONLY credential
// columns does not change the fingerprint and therefore produces no
// delta entry. That is the price of never letting credential material
// (even hashed) influence an exported fingerprint. Do NOT overstate the
// mitigation: the freeze receipt's high-water mark records per-table
// row counts, and max(updated_at) only for tables that carry
// updated_at — tables without it (for example
// platform_portal_edge_credentials) are covered by row count alone, so
// a credential-only change that keeps the row count is not detectable
// from the receipt either. A dedicated post-freeze reconciliation for
// credential tables is follow-up work (inventory U-F18) and does not
// exist in this PR; until then a credential-only change produces no
// delta entry and must be treated as an open gap, not as covered.

import { createHash } from "node:crypto";

// Column names that may carry credential material. Their values are
// excluded from fingerprints.
export const CREDENTIAL_COLUMN_PATTERN =
  /(password|passwd|secret|private[_-]?key|scrypt|credential|token|auth[_-]?key)/i;

export function isCredentialColumn(columnName) {
  return typeof columnName === "string" && CREDENTIAL_COLUMN_PATTERN.test(columnName);
}

export class SourceDeltaError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "SourceDeltaError";
    this.code = code;
  }
}

function deltaError(code, message) {
  return new SourceDeltaError(code, message);
}

const SAFE_IDENTIFIER = /^[A-Za-z0-9_]+$/;

function assertIdentifier(value, field) {
  if (typeof value !== "string" || !SAFE_IDENTIFIER.test(value)) {
    throw deltaError("delta_identifier_invalid", `delta ${field} must be a safe SQL identifier`);
  }
  return value;
}

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

// Content fingerprint of one row: SHA-256 over the canonical JSON of
// its non-credential columns. extraExclude lists additional column names
// to leave out (for example columns whose values are large blobs that
// the caller fingerprints elsewhere). The primary key column is always
// included so the fingerprint is bound to the row identity.
export function fingerprintRow(row, { excludeColumns = [] } = {}) {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw deltaError("delta_row_invalid", "fingerprintRow requires a row object");
  }
  const excluded = new Set(excludeColumns);
  const visible = {};
  for (const key of Object.keys(row).sort()) {
    if (excluded.has(key)) continue;
    if (isCredentialColumn(key)) continue;
    visible[key] = row[key] ?? null;
  }
  return createHash("sha256").update(canonicalJson(visible)).digest("hex");
}

function assertTableSpec(tableSpec) {
  if (!tableSpec || typeof tableSpec !== "object" || Array.isArray(tableSpec)) {
    throw deltaError("delta_table_invalid", "delta table spec must be an object");
  }
  const table = assertIdentifier(tableSpec.table, "table");
  const pk = assertIdentifier(tableSpec.pk, "pk");
  const excludeColumns = Array.isArray(tableSpec.excludeColumns) ? tableSpec.excludeColumns : [];
  for (const column of excludeColumns) assertIdentifier(column, "excludeColumns entry");
  return { table, pk, excludeColumns };
}

function assertTableExists(db, table) {
  const row = db
    .prepare(`select name from sqlite_master where type = 'table' and name = ?`)
    .get(table);
  if (!row) throw deltaError("delta_table_missing", `delta table is missing: ${table}`);
}

function assertPkColumn(db, table, pk) {
  const columns = db.prepare(`pragma table_info(${table})`).all();
  if (!columns.some((column) => column.name === pk)) {
    throw deltaError("delta_pk_missing", `delta pk column is missing: ${table}.${pk}`);
  }
}

// Build a checkpoint manifest for the given tables: { snapshotId,
// tables: { <table>: { <pk>: <fingerprint> } } }. Read-only.
export function buildCheckpointManifest(db, { tables, snapshotId } = {}) {
  if (typeof snapshotId !== "string" || snapshotId.length === 0) {
    throw deltaError("delta_snapshot_required", "checkpoint manifest requires a non-empty snapshotId");
  }
  if (!Array.isArray(tables) || tables.length === 0) {
    throw deltaError("delta_table_invalid", "checkpoint manifest requires at least one table");
  }
  if (!db || typeof db.prepare !== "function") {
    throw deltaError("delta_table_missing", "checkpoint manifest requires a database handle");
  }
  const manifest = { snapshotId, tables: {} };
  for (const spec of tables) {
    const { table, pk, excludeColumns } = assertTableSpec(spec);
    assertTableExists(db, table);
    assertPkColumn(db, table, pk);
    const rows = db.prepare(`select * from ${table} order by ${pk} asc`).all();
    const entries = {};
    for (const row of rows) {
      entries[String(row[pk])] = fingerprintRow(row, { excludeColumns });
    }
    manifest.tables[table] = entries;
  }
  return manifest;
}

// Enumerate the delta between a checkpoint manifest and the current
// database. Returns { sourceSnapshotId, tables: [{ table, inserted,
// updated, deleted }], summary }. inserted/updated carry the current
// fingerprint; updated/deleted also carry the checkpoint fingerprint.
// Row values are never included.
export function enumerateSourceDeltas(db, { tables, checkpoint } = {}) {
  if (!checkpoint || typeof checkpoint !== "object" || Array.isArray(checkpoint)
    || typeof checkpoint.snapshotId !== "string" || checkpoint.snapshotId.length === 0
    || !checkpoint.tables || typeof checkpoint.tables !== "object") {
    throw deltaError("delta_checkpoint_invalid", "delta enumeration requires a valid checkpoint manifest");
  }
  if (!Array.isArray(tables) || tables.length === 0) {
    throw deltaError("delta_table_invalid", "delta enumeration requires at least one table");
  }
  if (!db || typeof db.prepare !== "function") {
    throw deltaError("delta_table_missing", "delta enumeration requires a database handle");
  }
  const result = {
    sourceSnapshotId: checkpoint.snapshotId,
    tables: [],
    summary: { tables: 0, inserted: 0, updated: 0, deleted: 0 },
  };
  for (const spec of tables) {
    const { table, pk, excludeColumns } = assertTableSpec(spec);
    assertTableExists(db, table);
    assertPkColumn(db, table, pk);
    // A checkpoint that does not cover a requested table is incomplete
    // (interrupted snapshot): fail closed instead of silently treating
    // every current row as inserted.
    if (!Object.hasOwn(checkpoint.tables, table)) {
      throw deltaError("delta_checkpoint_invalid", `checkpoint does not cover table: ${table}`);
    }
    const previous = checkpoint.tables[table];
    if (typeof previous !== "object" || Array.isArray(previous)) {
      throw deltaError("delta_checkpoint_invalid", `checkpoint entries for ${table} must be an object`);
    }
    const rows = db.prepare(`select * from ${table} order by ${pk} asc`).all();
    const current = new Map();
    for (const row of rows) {
      current.set(String(row[pk]), fingerprintRow(row, { excludeColumns }));
    }
    const inserted = [];
    const updated = [];
    for (const [pkValue, fingerprint] of current.entries()) {
      if (!Object.hasOwn(previous, pkValue)) {
        inserted.push({ pk: pkValue, fingerprint });
      } else if (previous[pkValue] !== fingerprint) {
        updated.push({ pk: pkValue, fingerprint, previousFingerprint: previous[pkValue] });
      }
    }
    const deleted = [];
    for (const pkValue of Object.keys(previous)) {
      if (!current.has(pkValue)) {
        deleted.push({ pk: pkValue, previousFingerprint: previous[pkValue] });
      }
    }
    result.tables.push({ table, inserted, updated, deleted });
    result.summary.tables += 1;
    result.summary.inserted += inserted.length;
    result.summary.updated += updated.length;
    result.summary.deleted += deleted.length;
  }
  return result;
}
