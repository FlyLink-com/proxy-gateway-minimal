// D1 Stage 2 — safe export row batches and incremental manifest
// (tasks 2, 3, 4).
//
// Export batches:
// - Only columns whose candidate disposition is KEEP are selected.
//   CONDITIONAL columns are excluded until their contract exists
//   (metadata_json is CONDITIONAL pending the M1-02 allowlist; it is
//   NOT exported by this module). DEFER columns are never selected.
//   Any column not listed in the candidate map defaults to DEFER.
//   The SQL itself only selects the approved columns, so unapproved
//   data never enters a payload; a value scanner runs on top as
//   defense-in-depth.
// - Pagination is keyset (PK > last PK), never naive OFFSET, so a
//   changing database cannot silently skip or repeat rows.
// - Every page carries a stable identity: table, full PK tuple,
//   start/end PK, row count, approved column list, byte length,
//   canonical content hash, and a continuation token that resumes
//   exactly after the last PK of the previous page.
// - Batches are bounded to at most 20 rows (the rehearsal D1 batch
//   bound from the Stage 2A offline rehearsal). That bound is a
//   rehearsal constant, not a measured D1 limit.
//
// Field dispositions are CANDIDATE ONLY, pending owner approval.
// Nothing in this module presents a mapping as approved. The T2
// proposal aggregates (712 KEEP / 59 CONDITIONAL / 7 EXTERNALIZE /
// 19 TRANSFORM / 23 DEFER across 70 tables) are not a per-column
// mapping; this module maps only the rehearsal-subset columns, and
// only as candidates.
//
// Sensitive-field exclusion (task 3): raw email/PII, password or
// TOTP secrets, raw edge credential material, payment checkout
// URLs/QR capabilities, third-party subscription data and retained
// credential blobs never appear in a payload. The rehearsal subset
// contains none of those except the credential columns, which are
// DEFER. A plain SHA-256 of low-entropy PII is not anonymization, so
// no PII value is hashed into a payload in place of excluding it.
//
// Incremental manifest (task 4): built from a durable, ordered
// high-water mark. Deltas for single-PK tables come from the 1B
// checkpoint fingerprint diff; credential deltas come from the
// version-manifest comparison (task 5), which is the only signal that
// sees a credential-only rotation. The manifest sequence is issued
// by the manifest itself (seq = previous seq + 1); it is NOT a source
// transaction order, and this module never describes fingerprint-only
// diffing as live CDC. Deletes carry tombstones with the checkpoint
// fingerprint of the deleted row. Apply order is FK parent-before-
// child for inserts/updates and the reverse for deletes, fixed for
// the rehearsal subset; unknown tables fail closed instead of
// guessing an order.

import { createHash } from "node:crypto";

import { buildCheckpointManifest, enumerateSourceDeltas, fingerprintRow } from "./source-delta.mjs";
import {
  CREDENTIALS_TABLE,
  buildCredentialVersionManifest,
  detectCredentialRotations,
  verifyCredentialVersionManifest,
} from "./d1-stage2-credential-reconciliation.mjs";

export const EXPORT_SCHEMA_VERSION = 1;
export const D1_REHEARSAL_BATCH_LIMIT = 20;
export const EXPORT_ID_PATTERN = /^s2s-[a-z0-9-]{3,80}$/;

// Candidate field dispositions for the rehearsal subset ONLY.
// Status: candidate, pending owner approval (T2). Do not present
// any entry here as approved.
export const CANDIDATE_MAPPING_VERSION = "stage2-candidate-v1";
export const CANDIDATE_FIELD_DISPOSITIONS = Object.freeze({
  platform_accounts: Object.freeze({
    id: "KEEP",
    owner_ref: "KEEP",
    status: "KEEP",
    created_at: "KEEP",
    updated_at: "KEEP",
    metadata_json: "CONDITIONAL",
  }),
  platform_entitlements: Object.freeze({
    id: "KEEP",
    account_id: "KEEP",
    plan: "KEEP",
    status: "KEEP",
    valid_from: "KEEP",
    valid_until: "KEEP",
    max_artifacts: "KEEP",
    max_devices: "KEEP",
    traffic_limit_bytes: "KEEP",
    created_at: "KEEP",
    updated_at: "KEEP",
  }),
  platform_portal_edge_credentials: Object.freeze({
    request_id: "KEEP",
    edge_channel_ref: "KEEP",
    edge_credential_ref: "DEFER",
    edge_material_digest: "DEFER",
    ordinal: "KEEP",
  }),
  platform_schema_migrations: Object.freeze({
    migration_id: "KEEP",
    ddl_checksum: "KEEP",
    applied_at: "KEEP",
  }),
});

// FK apply order for the rehearsal subset. Inserts/updates apply
// parents first; deletes apply children first. Anything not listed
// here fails closed — the order is never guessed.
export const REHEARSAL_APPLY_ORDER = Object.freeze([
  "platform_accounts",
  "platform_entitlements",
  "platform_schema_migrations",
  "platform_portal_edge_credentials",
]);

export class ExportError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ExportError";
    this.code = code;
  }
}

function exportError(code, message) {
  return new ExportError(code, message);
}

export function isExportError(error) {
  return error instanceof ExportError;
}

function sha256Hex(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

const SAFE_IDENTIFIER = /^[A-Za-z0-9_]+$/;
const CREDENTIAL_COLUMN_PATTERN = /(password|passwd|secret|private[_-]?key|scrypt|credential|token|auth[_-]?key)/i;
// Values that must never appear in an exported payload, even if a
// column was approved: secret-looking strings and hashes of secret
// material. This is defense-in-depth; column selection is the
// primary control.
const SENSITIVE_VALUE_PATTERN = /(password|passwd|secret|private[_-]?key|bearer\s|sk-[a-z0-9]{8,}|sha256:[0-9a-f]{64})/i;

function assertIdentifier(value, what) {
  if (typeof value !== "string" || !SAFE_IDENTIFIER.test(value)) {
    throw exportError("export_identifier_invalid", `${what} is not a safe identifier: ${String(value)}`);
  }
  return value;
}

function assertPkTuple(pk) {
  if (typeof pk === "string") return [pk];
  if (Array.isArray(pk) && pk.length > 0 && pk.every((part) => typeof part === "string")) return pk;
  throw exportError("export_pk_invalid", "primary key must be a column name or a non-empty array of column names");
}

// Resolve the disposition of every column of a table. Unlisted
// columns default to DEFER, and the result says so explicitly.
// CONDITIONAL columns are resolved but NOT exportable until their
// contract exists; the caller decides by reading exportableColumns.
export function resolveFieldDispositions(table) {
  const dispositions = CANDIDATE_FIELD_DISPOSITIONS[table];
  if (!dispositions) {
    throw exportError("export_table_unmapped", `no candidate field mapping exists for table: ${table}`);
  }
  return {
    table,
    mappingVersion: CANDIDATE_MAPPING_VERSION,
    mappingStatus: "candidate-pending-owner-approval",
    dispositions: { ...dispositions },
  };
}

export function exportableColumns(table) {
  const resolved = resolveFieldDispositions(table);
  return Object.entries(resolved.dispositions)
    .filter(([, disposition]) => disposition === "KEEP")
    .map(([column]) => column);
}

export function excludedColumns(table, columns) {
  const resolved = resolveFieldDispositions(table);
  return columns
    .filter((column) => resolved.dispositions[column] !== "KEEP")
    .map((column) => ({
      column,
      disposition: resolved.dispositions[column] ?? "DEFER",
      reason: resolved.dispositions[column] === "CONDITIONAL"
        ? "conditional contract not defined (M1-02 allowlist pending)"
        : "not approved for export",
    }));
}

function scanForSensitiveValues(rows, columns) {
  for (const row of rows) {
    for (const column of columns) {
      if (CREDENTIAL_COLUMN_PATTERN.test(column)) {
        throw exportError("export_sensitive_column", `approved column list contains a credential column: ${column}`);
      }
      const value = row[column];
      if (typeof value === "string" && SENSITIVE_VALUE_PATTERN.test(value)) {
        throw exportError("export_sensitive_value_detected", `exported value looks like secret material in column: ${column}`);
      }
    }
  }
}

function pkCondition(pkColumns, afterPk) {
  if (afterPk === null || afterPk === undefined) return { sql: "", params: [] };
  if (!Array.isArray(afterPk) || afterPk.length !== pkColumns.length) {
    throw exportError("export_continuation_invalid", "continuation pk does not match the table primary key");
  }
  if (pkColumns.length === 1) {
    return { sql: `where ${pkColumns[0]} > ?`, params: [afterPk[0]] };
  }
  const tuple = `(${pkColumns.join(", ")})`;
  const placeholders = `(${pkColumns.map(() => "?").join(", ")})`;
  return { sql: `where ${tuple} > ${placeholders}`, params: afterPk };
}

function encodeContinuationToken({ table, lastPk, snapshotId }) {
  const payload = Buffer.from(canonicalJson({ table, lastPk, snapshotId }), "utf8").toString("base64url");
  return `s2s-ct-${payload}`;
}

export function decodeContinuationToken(token) {
  if (typeof token !== "string" || !token.startsWith("s2s-ct-")) {
    throw exportError("export_continuation_invalid", "continuation token is malformed");
  }
  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(token.slice("s2s-ct-".length), "base64url").toString("utf8"));
  } catch {
    throw exportError("export_continuation_invalid", "continuation token is malformed");
  }
  if (!parsed || typeof parsed !== "object" || typeof parsed.table !== "string"
    || !Array.isArray(parsed.lastPk) || parsed.lastPk.length === 0
    || typeof parsed.snapshotId !== "string" || parsed.snapshotId.length === 0) {
    throw exportError("export_continuation_invalid", "continuation token is malformed");
  }
  return parsed;
}

// Export one bounded, PK-ordered page of a table. Only KEEP columns
// are selected. afterPk is the last PK tuple of the previous page
// (or null for the first page). limit is 1..20.
export function exportPage(db, {
  table,
  pk,
  snapshotId,
  afterPk = null,
  limit = D1_REHEARSAL_BATCH_LIMIT,
  batchIndex = 0,
} = {}) {
  assertIdentifier(table, "table");
  if (typeof snapshotId !== "string" || !EXPORT_ID_PATTERN.test(snapshotId)) {
    throw exportError("export_snapshot_invalid", "export requires a synthetic snapshot id (s2s-...)");
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > D1_REHEARSAL_BATCH_LIMIT) {
    throw exportError("export_limit_invalid", `export limit must be an integer between 1 and ${D1_REHEARSAL_BATCH_LIMIT}`);
  }
  if (!Number.isInteger(batchIndex) || batchIndex < 0) {
    throw exportError("export_batch_invalid", "batch index must be a non-negative integer");
  }
  const pkColumns = assertPkTuple(pk);
  for (const column of pkColumns) assertIdentifier(column, "pk column");
  const columns = exportableColumns(table);
  for (const column of columns) assertIdentifier(column, "column");
  if (!columns.includes(pkColumns[0]) || !pkColumns.every((column) => columns.includes(column))) {
    throw exportError("export_pk_unapproved", "primary key columns must be approved for export");
  }
  const tableExists = db.prepare(`select name from sqlite_master where type = 'table' and name = ?`).get(table);
  if (!tableExists) {
    throw exportError("export_table_missing", `export table is missing: ${table}`);
  }
  const { sql: whereSql, params } = pkCondition(pkColumns, afterPk);
  const orderSql = `order by ${pkColumns.join(" asc, ")} asc`;
  const rows = db.prepare(
    `select ${columns.join(", ")} from ${table} ${whereSql} ${orderSql} limit ?`,
  ).all(...params, limit);
  scanForSensitiveValues(rows, columns);
  const rowPks = rows.map((row) => pkColumns.map((column) => row[column]));
  const contentHash = sha256Hex(canonicalJson(rows));
  const byteLength = Buffer.byteLength(canonicalJson(rows), "utf8");
  const continuationToken = rowPks.length === 0
    ? null
    : encodeContinuationToken({ table, lastPk: rowPks[rowPks.length - 1], snapshotId });
  return {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    snapshotId,
    batchIndex,
    table,
    pk: pkColumns,
    columns,
    excludedColumns: excludedColumns(table, Object.keys(CANDIDATE_FIELD_DISPOSITIONS[table])),
    startPk: rowPks.length === 0 ? null : rowPks[0],
    endPk: rowPks.length === 0 ? null : rowPks[rowPks.length - 1],
    rowCount: rows.length,
    byteLength,
    contentHash,
    continuationToken,
    rows,
  };
}

// Recompute the page hash, byte length and PK ordering. Returns true;
// throws ExportError on any mismatch.
export function verifyExportPage(page) {
  if (!page || typeof page !== "object" || Array.isArray(page)
    || page.schemaVersion !== EXPORT_SCHEMA_VERSION
    || typeof page.table !== "string" || !Array.isArray(page.pk) || page.pk.length === 0
    || !Array.isArray(page.columns) || !Array.isArray(page.rows)
    || page.rowCount !== page.rows.length
    || typeof page.byteLength !== "number" || typeof page.contentHash !== "string") {
    throw exportError("export_page_invalid", "export page is malformed");
  }
  if (sha256Hex(canonicalJson(page.rows)) !== page.contentHash) {
    throw exportError("export_page_hash_mismatch", "export page content hash does not match its rows");
  }
  if (Buffer.byteLength(canonicalJson(page.rows), "utf8") !== page.byteLength) {
    throw exportError("export_page_length_mismatch", "export page byte length does not match its rows");
  }
  for (let i = 1; i < page.rows.length; i += 1) {
    const prev = page.pk.map((column) => page.rows[i - 1][column]);
    const cur = page.pk.map((column) => page.rows[i][column]);
    if (canonicalJson(prev) >= canonicalJson(cur)) {
      throw exportError("export_page_order_invalid", "export page rows are not strictly PK-ordered");
    }
  }
  if (page.rows.length > 0 && page.continuationToken !== null) {
    const decoded = decodeContinuationToken(page.continuationToken);
    if (decoded.table !== page.table || decoded.snapshotId !== page.snapshotId
      || JSON.stringify(decoded.lastPk) !== JSON.stringify(page.endPk)) {
      throw exportError("export_page_token_mismatch", "export page continuation token does not match its last row");
    }
  }
  if (page.rows.length === 0 && page.continuationToken !== null) {
    throw exportError("export_page_token_mismatch", "an empty export page must not carry a continuation token");
  }
  return true;
}

// A durable, ordered high-water mark. seq is a manifest-issued
// sequence, not a source transaction order. The manifest chain is
// verified by seq contiguity (next seq = previous seq + 1); a gap
// is an error, never silently skipped.
export function createHighWaterMark({ seq, snapshotId }) {
  if (!Number.isInteger(seq) || seq < 0) {
    throw exportError("export_hwm_invalid", "high-water mark seq must be a non-negative integer");
  }
  if (typeof snapshotId !== "string" || !EXPORT_ID_PATTERN.test(snapshotId)) {
    throw exportError("export_hwm_invalid", "high-water mark requires a synthetic snapshot id (s2s-...)");
  }
  return { seq, snapshotId };
}

// Build the incremental manifest since a checkpoint. tables is the
// list of {table, pk} specs for fingerprint diffing; the credentials
// table is handled separately through the version manifests, because
// fingerprint diffing cannot see a credential-only rotation.
export function buildIncrementalManifest(db, {
  tables,
  checkpoint,
  previousCredentialManifest,
  currentCredentialManifest,
  highWaterMark,
  previousSnapshotId,
} = {}) {
  if (!highWaterMark || typeof highWaterMark !== "object"
    || !Number.isInteger(highWaterMark.seq) || highWaterMark.seq < 0
    || typeof highWaterMark.snapshotId !== "string") {
    throw exportError("export_hwm_invalid", "incremental manifest requires a valid high-water mark");
  }
  if (typeof previousSnapshotId !== "string" || previousSnapshotId.length === 0) {
    throw exportError("export_checkpoint_invalid", "incremental manifest requires the previous snapshot id");
  }
  if (!Array.isArray(tables) || tables.length === 0) {
    throw exportError("export_table_invalid", "incremental manifest requires at least one table spec");
  }
  for (const spec of tables) {
    if (spec.table === CREDENTIALS_TABLE) {
      throw exportError("export_credential_fingerprint_forbidden", "credentials table must be diffed by version manifest, not fingerprint (fingerprint diffing cannot see a credential-only rotation)");
    }
    if (!REHEARSAL_APPLY_ORDER.includes(spec.table)) {
      throw exportError("export_table_unmapped", `no apply order defined for table: ${spec.table}`);
    }
  }
  const deltas = enumerateSourceDeltas(db, { tables, checkpoint });
  const credentialRotations = previousCredentialManifest && currentCredentialManifest
    ? detectCredentialRotations(previousCredentialManifest, currentCredentialManifest)
    : null;
  if (tables.some((spec) => spec.table === CREDENTIALS_TABLE) && !credentialRotations) {
    throw exportError("export_credential_manifest_missing", "credentials table requires previous and current version manifests");
  }
  const orderedTables = [...REHEARSAL_APPLY_ORDER].filter((name) => name === CREDENTIALS_TABLE
    ? credentialRotations !== null
    : tables.some((spec) => spec.table === name));
  const insertOrder = orderedTables;
  const deleteOrder = [...orderedTables].reverse();
  const manifestTables = deltas.tables.map((entry) => ({
    table: entry.table,
    inserted: entry.inserted,
    updated: entry.updated,
    deleted: entry.deleted,
  }));
  if (credentialRotations) {
    manifestTables.push({
      table: CREDENTIALS_TABLE,
      inserted: credentialRotations.added.map((pk) => ({ pk, fingerprint: null, note: "credential row added; value bytes never exported" })),
      updated: credentialRotations.rotated.map((rotation) => ({ pk: rotation.pk, fromVersion: rotation.fromVersion, toVersion: rotation.toVersion, fingerprint: null, note: "credential-only rotation detected by version bump" })),
      deleted: credentialRotations.deleted.map((pk) => ({ pk, fingerprint: null, note: "credential row deleted (tombstone)" })),
    });
  }
  const summary = deltas.summary;
  if (credentialRotations) {
    summary.tables += 1;
    summary.inserted += credentialRotations.added.length;
    summary.updated += credentialRotations.rotated.length;
    summary.deleted += credentialRotations.deleted.length;
  }
  const manifest = {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    snapshotId: highWaterMark.snapshotId,
    previousSnapshotId,
    highWaterMark: { ...highWaterMark },
    seq: highWaterMark.seq,
    tables: manifestTables,
    insertOrder,
    deleteOrder,
    summary,
    credentialRotations: credentialRotations ? {
      rotated: credentialRotations.rotated,
      added: credentialRotations.added,
      deleted: credentialRotations.deleted,
      unchanged: credentialRotations.unchanged,
    } : null,
  };
  manifest.manifestHash = sha256Hex(canonicalJson({
    snapshotId: manifest.snapshotId,
    previousSnapshotId: manifest.previousSnapshotId,
    highWaterMark: manifest.highWaterMark,
    seq: manifest.seq,
    tables: manifest.tables,
    insertOrder: manifest.insertOrder,
    deleteOrder: manifest.deleteOrder,
    summary: manifest.summary,
  }));
  return manifest;
}

// Verify an incremental manifest: shape, counts, hash, and — when a
// previous manifest is given — seq contiguity and snapshot lineage.
// A gap (seq != previous seq + 1) is an error, not a warning.
export function verifyIncrementalManifest(manifest, previousManifest = null) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)
    || manifest.schemaVersion !== EXPORT_SCHEMA_VERSION
    || typeof manifest.snapshotId !== "string" || typeof manifest.previousSnapshotId !== "string"
    || !Number.isInteger(manifest.seq) || manifest.seq < 0
    || !Array.isArray(manifest.tables) || !Array.isArray(manifest.insertOrder) || !Array.isArray(manifest.deleteOrder)
    || typeof manifest.summary !== "object" || typeof manifest.manifestHash !== "string") {
    throw exportError("export_manifest_invalid", "incremental manifest is malformed");
  }
  if (previousManifest) {
    if (manifest.seq !== previousManifest.seq + 1) {
      throw exportError("export_manifest_gap", `incremental manifest seq gap: expected ${previousManifest.seq + 1}, got ${manifest.seq}`);
    }
    if (manifest.previousSnapshotId !== previousManifest.snapshotId) {
      throw exportError("export_manifest_lineage", "incremental manifest previous snapshot does not match the previous manifest");
    }
  }
  const expected = sha256Hex(canonicalJson({
    snapshotId: manifest.snapshotId,
    previousSnapshotId: manifest.previousSnapshotId,
    highWaterMark: manifest.highWaterMark,
    seq: manifest.seq,
    tables: manifest.tables,
    insertOrder: manifest.insertOrder,
    deleteOrder: manifest.deleteOrder,
    summary: manifest.summary,
  }));
  if (expected !== manifest.manifestHash) {
    throw exportError("export_manifest_hash_mismatch", "incremental manifest hash does not match its contents");
  }
  return { valid: true };
}
