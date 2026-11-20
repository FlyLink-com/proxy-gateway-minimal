// D1 Stage 2 — source manifest and synthetic WAL snapshot (task 1).
//
// Builds a consistent, immutable synthetic WAL snapshot of the source
// and the metadata that identifies it: sourceSnapshotId, schema
// digest, DB-boundary identity, migration-ledger digest, mapping
// version, snapshot hash, authority + epoch, and the expected table
// list. The snapshot is verified by recomputation (verify function
// below); the hash IS the identity — any later modification changes
// it, so a tampered snapshot fails verification instead of passing
// silently.
//
// What the snapshot covers, honestly:
// - The rehearsal subset only: platform_accounts,
//   platform_entitlements, platform_portal_edge_credentials, plus the
//   platform_schema_migrations ledger, the writer-authority record and
//   the credential-version table. The expected table list is the full
//   70-table inventory from docs/D1_CONTROL_SCHEMA_INVENTORY_V1.json;
//   the metadata records the 65 tables NOT materialized as missing, so
//   nobody can mistake this rehearsal snapshot for a full-source
//   snapshot. A full-source snapshot needs the T2-approved table list
//   and the production DDL, which are not available offline.
// - The historical 70-table / 820-column inventory numbers are
//   candidate counts from the pinned source commit be261abc… They are
//   NOT observed production counts, and this module never presents
//   them as such.
// - All fixture rows are synthetic (s2s- prefix). No production data,
//   no real credential material, no real HMAC/crypto keys.
// - The credentials table DDL in the snapshot omits the REFERENCES
//   clause to platform_portal_access_requests: that parent table is
//   not materialized in the rehearsal subset. Columns, types, PK and
//   CHECKs are otherwise copied verbatim from
//   server/services/platform/subscription-control-db.mjs.
// - edge_material_digest values in the fixtures are deterministic
//   sha256: digests of synthetic refs (sha256("s2s-material:<ref>")).
//   They stand in for the real column's format, not for real material.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import Database from "better-sqlite3";

import { ensureWriterAuthority, readWriterAuthority } from "./single-writer-authority.mjs";
import { SOURCE_MIGRATION_REGISTRY, validateD1SourceMigrationChecksums } from "./d1-source-migration-registry.mjs";
import { buildCheckpointManifest, fingerprintRow } from "./source-delta.mjs";
import {
  CREDENTIALS_TABLE,
  CREDENTIAL_VERSION_TABLE,
  backfillCredentialVersions,
  buildCredentialVersionManifest,
  ensureCredentialVersionTracking,
} from "./d1-stage2-credential-reconciliation.mjs";

export const SNAPSHOT_SCHEMA_VERSION = 1;
export const SNAPSHOT_FIXTURE_NOW = "2026-11-20T00:00:00.000Z";
export const SNAPSHOT_ID_PATTERN = /^s2s-[a-z0-9-]{3,80}$/;

export const SNAPSHOT_TABLES = Object.freeze([
  { table: "platform_accounts", pk: "id" },
  { table: "platform_entitlements", pk: "id" },
  { table: "platform_portal_edge_credentials", pk: ["request_id", "edge_channel_ref"] },
  { table: "platform_schema_migrations", pk: "migration_id" },
]);

export const SNAPSHOT_FIXTURE_DDL = Object.freeze({
  platform_accounts: `
    create table if not exists platform_accounts (
      id text primary key,
      owner_ref text not null,
      status text not null check (status in ('active', 'suspended', 'disabled')),
      created_at text not null,
      updated_at text not null,
      metadata_json text not null default '{}'
    );
    create index if not exists platform_accounts_status_idx
      on platform_accounts(status);
  `,
  platform_entitlements: `
    create table if not exists platform_entitlements (
      id text primary key,
      account_id text not null references platform_accounts(id) on delete cascade,
      plan text not null,
      status text not null check (status in ('active', 'expired', 'revoked', 'suspended')),
      valid_from text not null,
      valid_until text not null,
      max_artifacts integer not null default 1,
      max_devices integer not null default 1,
      traffic_limit_bytes integer not null default 0,
      created_at text not null,
      updated_at text not null
    );
    create index if not exists platform_entitlements_account_id_idx
      on platform_entitlements(account_id);
    create index if not exists platform_entitlements_status_idx
      on platform_entitlements(status);
  `,
  // FK to platform_portal_access_requests deliberately omitted: the
  // parent table is not materialized in the rehearsal subset.
  platform_portal_edge_credentials: `
    create table if not exists platform_portal_edge_credentials (
      request_id text not null,
      edge_channel_ref text not null,
      edge_credential_ref text not null,
      edge_material_digest text not null,
      ordinal integer not null default 0 check (ordinal >= 0),
      primary key (request_id, edge_channel_ref)
    );
    create unique index if not exists platform_portal_edge_credentials_ref_idx
      on platform_portal_edge_credentials(edge_credential_ref);
  `,
  platform_schema_migrations: `
    create table if not exists platform_schema_migrations (
      migration_id text primary key,
      ddl_checksum text not null,
      applied_at text not null
    );
  `,
});

export class SourceManifestError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "SourceManifestError";
    this.code = code;
  }
}

function manifestError(code, message) {
  return new SourceManifestError(code, message);
}

export function isSourceManifestError(error) {
  return error instanceof SourceManifestError;
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

// The pinned expected table list, read from the control-schema
// inventory on disk. The inventory is the only source for this list;
// it is never re-derived from the snapshot itself.
export function readExpectedTableList() {
  const path = new URL("../../../docs/D1_CONTROL_SCHEMA_INVENTORY_V1.json", import.meta.url);
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw manifestError("source_inventory_unavailable", "control-schema inventory is missing or unreadable");
  }
  const tables = Array.isArray(parsed.tables) ? parsed.tables.map((table) => table.name) : [];
  const history = Array.isArray(parsed.sourceMigrationHistory) ? parsed.sourceMigrationHistory : [];
  return {
    sourceCommit: parsed.sourceCommit ?? null,
    schemaVersion: parsed.schemaVersion ?? null,
    tables,
    tableCount: tables.length,
    columnCount: tables.length === 0 ? 0 : parsed.counts?.columns ?? null,
    sourceMigrationHistory: history.map((entry) => ({
      ordinal: entry.ordinal ?? null,
      migrationId: entry.migrationId,
      ddlSha256: entry.ddlSha256,
    })),
  };
}

export function syntheticMaterialDigest(ref) {
  return `sha256:${sha256Hex(`s2s-material:${ref}`)}`;
}

export function buildFixtureRows(now = SNAPSHOT_FIXTURE_NOW) {
  const accounts = [
    { id: "s2s-account-001", owner_ref: "s2s-owner-001", status: "active", created_at: now, updated_at: now, metadata_json: "{}" },
    { id: "s2s-account-002", owner_ref: "s2s-owner-002", status: "active", created_at: now, updated_at: now, metadata_json: "{}" },
    { id: "s2s-account-003", owner_ref: "s2s-owner-003", status: "suspended", created_at: now, updated_at: now, metadata_json: "{}" },
  ];
  const entitlements = [
    { id: "s2s-entitlement-001", account_id: "s2s-account-001", plan: "s2s-plan-basic", status: "active", valid_from: now, valid_until: "2027-11-20T00:00:00.000Z", max_artifacts: 1, max_devices: 1, traffic_limit_bytes: 0, created_at: now, updated_at: now },
    { id: "s2s-entitlement-002", account_id: "s2s-account-001", plan: "s2s-plan-plus", status: "active", valid_from: now, valid_until: "2027-11-20T00:00:00.000Z", max_artifacts: 2, max_devices: 2, traffic_limit_bytes: 0, created_at: now, updated_at: now },
    { id: "s2s-entitlement-003", account_id: "s2s-account-002", plan: "s2s-plan-basic", status: "expired", valid_from: "2025-11-20T00:00:00.000Z", valid_until: now, max_artifacts: 1, max_devices: 1, traffic_limit_bytes: 0, created_at: "2025-11-20T00:00:00.000Z", updated_at: now },
    { id: "s2s-entitlement-004", account_id: "s2s-account-003", plan: "s2s-plan-basic", status: "suspended", valid_from: now, valid_until: "2027-11-20T00:00:00.000Z", max_artifacts: 1, max_devices: 1, traffic_limit_bytes: 0, created_at: now, updated_at: now },
  ];
  const credentials = [
    { request_id: "s2s-request-001", edge_channel_ref: "s2s-channel-a", edge_credential_ref: "s2s-cred-001", edge_material_digest: syntheticMaterialDigest("s2s-cred-001"), ordinal: 0 },
    { request_id: "s2s-request-002", edge_channel_ref: "s2s-channel-a", edge_credential_ref: "s2s-cred-002", edge_material_digest: syntheticMaterialDigest("s2s-cred-002"), ordinal: 0 },
    { request_id: "s2s-request-002", edge_channel_ref: "s2s-channel-b", edge_credential_ref: "s2s-cred-003", edge_material_digest: syntheticMaterialDigest("s2s-cred-003"), ordinal: 1 },
  ];
  return { accounts, entitlements, credentials };
}

// SHA-256 over the database's own schema text (tables, indexes,
// triggers with non-null SQL, ordered by type then name). Two
// databases with the same schema text produce the same digest;
// adding, dropping or altering any object changes it.
export function computeSchemaDigest(db) {
  const rows = db
    .prepare(`select type, name, sql from sqlite_master where sql is not null order by type asc, name asc`)
    .all();
  return sha256Hex(canonicalJson(rows.map((row) => ({ type: row.type, name: row.name, sql: row.sql }))));
}

// Read the ledger from the database and verify it against the pinned
// registry (19 entries, all 64-hex checksums). Returns the ledger
// digest; throws when the ledger is incomplete or mismatched.
export function computeLedgerDigest(db) {
  const rows = db
    .prepare(`select migration_id, ddl_checksum from platform_schema_migrations order by migration_id asc`)
    .all();
  const history = rows.map((row) => ({ migrationId: row.migration_id, ddlSha256: row.ddl_checksum }));
  const validation = validateD1SourceMigrationChecksums({ sourceMigrationHistory: history });
  if (!validation.valid) {
    throw manifestError(
      "source_migration_ledger_invalid",
      `migration ledger does not match the pinned registry: ${validation.errors.join(", ")}`,
    );
  }
  if (validation.expectedCount !== SOURCE_MIGRATION_REGISTRY.length
    || SOURCE_MIGRATION_REGISTRY.length !== 19) {
    throw manifestError("source_migration_ledger_count", "migration ledger must hold exactly the 19 pinned entries");
  }
  return sha256Hex(canonicalJson(history));
}

export function checkExpectedTablePresence(db, expectedTables) {
  const present = db.prepare(`select name from sqlite_master where type = 'table' order by name asc`).all()
    .map((row) => row.name);
  const presentSet = new Set(present);
  const expectedSet = new Set(expectedTables);
  return {
    present: expectedTables.filter((name) => presentSet.has(name)),
    missing: expectedTables.filter((name) => !presentSet.has(name)),
    unexpected: present.filter((name) => !expectedSet.has(name)),
  };
}

// Build the synthetic snapshot and its metadata. The caller owns the
// returned db handle and must close it. When dbPath is given, the
// snapshot is a real WAL file on disk; otherwise it is in-memory
// (journal_mode reports 'memory' then, which the metadata records
// honestly). The metadata is JSON-serializable.
export function buildSyntheticSourceSnapshot({
  db: existingDb = null,
  dbPath = null,
  snapshotId,
  now = SNAPSHOT_FIXTURE_NOW,
  mappingVersion = "stage2-candidate-v1",
} = {}) {
  if (typeof snapshotId !== "string" || !SNAPSHOT_ID_PATTERN.test(snapshotId)) {
    throw manifestError("source_snapshot_id_invalid", "source snapshot id must match s2s-[a-z0-9-]{3,80}");
  }
  if (typeof mappingVersion !== "string" || mappingVersion.length === 0) {
    throw manifestError("source_mapping_version_invalid", "mapping version must be a non-empty string");
  }
  const expected = readExpectedTableList();
  if (expected.sourceCommit === null || expected.tables.length === 0) {
    throw manifestError("source_inventory_unavailable", "control-schema inventory has no expected table list");
  }
  const db = existingDb ?? new Database(dbPath ?? ":memory:");
  const journalModeRow = db.prepare(`pragma journal_mode = WAL`).get();
  const journalMode = journalModeRow?.journal_mode ?? "unknown";
  const fixtures = buildFixtureRows(now);
  db.exec(SNAPSHOT_FIXTURE_DDL.platform_accounts);
  db.exec(SNAPSHOT_FIXTURE_DDL.platform_entitlements);
  db.exec(SNAPSHOT_FIXTURE_DDL.platform_portal_edge_credentials);
  db.exec(SNAPSHOT_FIXTURE_DDL.platform_schema_migrations);
  // The snapshot always starts BWH_ACTIVE epoch 1: that is the only
  // state ensureWriterAuthority creates. Any other phase is reached
  // via transitionWriterAuthority, not by building a snapshot.
  ensureWriterAuthority(db, { now: () => new Date(now) });
  ensureCredentialVersionTracking(db);
  const insertAccount = db.prepare(`insert into platform_accounts (id, owner_ref, status, created_at, updated_at, metadata_json) values (?, ?, ?, ?, ?, ?)`);
  const insertEntitlement = db.prepare(`insert into platform_entitlements (id, account_id, plan, status, valid_from, valid_until, max_artifacts, max_devices, traffic_limit_bytes, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insertCredential = db.prepare(`insert into platform_portal_edge_credentials (request_id, edge_channel_ref, edge_credential_ref, edge_material_digest, ordinal) values (?, ?, ?, ?, ?)`);
  const insertMigration = db.prepare(`insert into platform_schema_migrations (migration_id, ddl_checksum, applied_at) values (?, ?, ?)`);
  const insertAll = db.transaction(() => {
    for (const row of fixtures.accounts) insertAccount.run(row.id, row.owner_ref, row.status, row.created_at, row.updated_at, row.metadata_json);
    for (const row of fixtures.entitlements) insertEntitlement.run(row.id, row.account_id, row.plan, row.status, row.valid_from, row.valid_until, row.max_artifacts, row.max_devices, row.traffic_limit_bytes, row.created_at, row.updated_at);
    for (const row of fixtures.credentials) insertCredential.run(row.request_id, row.edge_channel_ref, row.edge_credential_ref, row.edge_material_digest, row.ordinal);
    for (const entry of expected.sourceMigrationHistory) insertMigration.run(entry.migrationId, entry.ddlSha256, now);
  });
  insertAll();
  const backfilled = backfillCredentialVersions(db, { now: () => new Date(now) });
  if (backfilled.backfilled !== 0) {
    throw manifestError("source_snapshot_backfill_unexpected", "fixture credential rows must be tracked from insertion, not backfilled");
  }
  const schemaDigest = computeSchemaDigest(db);
  const ledgerDigest = computeLedgerDigest(db);
  const checkpoint = buildCheckpointManifest(db, {
    tables: [
      { table: "platform_accounts", pk: "id" },
      { table: "platform_entitlements", pk: "id" },
      { table: "platform_schema_migrations", pk: "migration_id" },
    ],
    snapshotId,
  });
  const credentialManifest = buildCredentialVersionManifest(db, { snapshotId });
  const authorityRecord = readWriterAuthority(db);
  const presence = checkExpectedTablePresence(db, expected.tables);
  const materializedTables = SNAPSHOT_TABLES.map((spec) => spec.table).sort();
  const rowCounts = {};
  for (const spec of SNAPSHOT_TABLES) {
    rowCounts[spec.table] = db.prepare(`select count(*) as n from ${spec.table}`).get().n;
  }
  const metadata = {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    sourceSnapshotId: snapshotId,
    sourceCommit: expected.sourceCommit,
    inventoryTableCount: expected.tableCount,
    inventoryColumnCount: expected.columnCount,
    mappingVersion,
    journalMode,
    authority: authorityRecord.phase,
    epoch: authorityRecord.epoch,
    schemaDigest,
    ledgerDigest,
    migrationCount: expected.sourceMigrationHistory.length,
    tableRowCounts: rowCounts,
    tableRowDigests: {
      platform_accounts: sha256Hex(canonicalJson(checkpoint.tables.platform_accounts)),
      platform_entitlements: sha256Hex(canonicalJson(checkpoint.tables.platform_entitlements)),
      platform_schema_migrations: sha256Hex(canonicalJson(checkpoint.tables.platform_schema_migrations)),
    },
    credentialManifestHash: credentialManifest.manifestHash,
    credentialBackfilledCount: credentialManifest.backfilledCount,
    materializedTables,
    expectedTables: expected.tables,
    missingExpectedTables: presence.missing,
    unexpectedTables: presence.unexpected,
  };
  metadata.snapshotHash = sha256Hex(canonicalJson({
    sourceSnapshotId: metadata.sourceSnapshotId,
    sourceCommit: metadata.sourceCommit,
    mappingVersion: metadata.mappingVersion,
    authority: metadata.authority,
    epoch: metadata.epoch,
    schemaDigest: metadata.schemaDigest,
    ledgerDigest: metadata.ledgerDigest,
    tableRowCounts: metadata.tableRowCounts,
    tableRowDigests: metadata.tableRowDigests,
    credentialManifestHash: metadata.credentialManifestHash,
    materializedTables: metadata.materializedTables,
  }));
  return { metadata, db };
}

// Recompute every digest from the live database and compare it with
// the metadata. Returns { valid: true } on success; throws
// SourceManifestError naming the first mismatched field. This is the
// immutability check: a snapshot whose contents changed after the
// metadata was issued fails here.
export function verifySyntheticSourceSnapshot(db, metadata) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)
    || metadata.schemaVersion !== SNAPSHOT_SCHEMA_VERSION
    || typeof metadata.sourceSnapshotId !== "string"
    || typeof metadata.snapshotHash !== "string") {
    throw manifestError("source_snapshot_invalid", "source snapshot metadata is malformed");
  }
  const expected = readExpectedTableList();
  if (metadata.sourceCommit !== expected.sourceCommit) {
    throw manifestError("source_snapshot_commit_mismatch", "source snapshot was built at a different source commit");
  }
  const schemaDigest = computeSchemaDigest(db);
  if (schemaDigest !== metadata.schemaDigest) {
    throw manifestError("source_snapshot_schema_mismatch", "source snapshot schema digest does not match its metadata");
  }
  const ledgerDigest = computeLedgerDigest(db);
  if (ledgerDigest !== metadata.ledgerDigest) {
    throw manifestError("source_snapshot_ledger_mismatch", "source snapshot migration ledger digest does not match its metadata");
  }
  const checkpoint = buildCheckpointManifest(db, {
    tables: [
      { table: "platform_accounts", pk: "id" },
      { table: "platform_entitlements", pk: "id" },
      { table: "platform_schema_migrations", pk: "migration_id" },
    ],
    snapshotId: metadata.sourceSnapshotId,
  });
  const rowDigests = {
    platform_accounts: sha256Hex(canonicalJson(checkpoint.tables.platform_accounts)),
    platform_entitlements: sha256Hex(canonicalJson(checkpoint.tables.platform_entitlements)),
    platform_schema_migrations: sha256Hex(canonicalJson(checkpoint.tables.platform_schema_migrations)),
  };
  for (const table of Object.keys(rowDigests)) {
    if (rowDigests[table] !== metadata.tableRowDigests?.[table]) {
      throw manifestError("source_snapshot_rows_mismatch", `source snapshot row digest mismatch: ${table}`);
    }
  }
  const credentialManifest = buildCredentialVersionManifest(db, { snapshotId: metadata.sourceSnapshotId });
  if (credentialManifest.manifestHash !== metadata.credentialManifestHash) {
    throw manifestError("source_snapshot_credentials_mismatch", "source snapshot credential version manifest does not match its metadata");
  }
  const authorityRecord = readWriterAuthority(db);
  if (authorityRecord.phase !== metadata.authority || authorityRecord.epoch !== metadata.epoch) {
    throw manifestError("source_snapshot_authority_mismatch", "source snapshot authority/epoch does not match its metadata");
  }
  const presence = checkExpectedTablePresence(db, expected.tables);
  if (JSON.stringify(presence.missing) !== JSON.stringify(metadata.missingExpectedTables)
    || JSON.stringify(presence.unexpected) !== JSON.stringify(metadata.unexpectedTables)) {
    throw manifestError("source_snapshot_tables_mismatch", "source snapshot expected-table dispositions do not match its metadata");
  }
  const recomputed = sha256Hex(canonicalJson({
    sourceSnapshotId: metadata.sourceSnapshotId,
    sourceCommit: metadata.sourceCommit,
    mappingVersion: metadata.mappingVersion,
    authority: metadata.authority,
    epoch: metadata.epoch,
    schemaDigest: metadata.schemaDigest,
    ledgerDigest: metadata.ledgerDigest,
    tableRowCounts: metadata.tableRowCounts,
    tableRowDigests: metadata.tableRowDigests,
    credentialManifestHash: metadata.credentialManifestHash,
    materializedTables: metadata.materializedTables,
  }));
  if (recomputed !== metadata.snapshotHash) {
    throw manifestError("source_snapshot_hash_mismatch", "source snapshot hash does not match its metadata");
  }
  return { valid: true };
}
