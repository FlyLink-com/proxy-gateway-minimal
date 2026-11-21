// D1 Stage 2 — source manifest, safe export batches and incremental
// manifest tests (tasks 1–4, plus the export-side crash cases of
// task 7). All fixtures are synthetic (s2s- prefix). No production
// data, no real credential material, no network.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";

import {
  buildSyntheticSourceSnapshot,
  verifySyntheticSourceSnapshot,
  readExpectedTableList,
  computeLedgerDigest,
  isSourceManifestError,
} from "../services/platform/d1-stage2-source-manifest.mjs";
import {
  exportPage,
  verifyExportPage,
  createHighWaterMark,
  buildIncrementalManifest,
  verifyIncrementalManifest,
  isExportError,
} from "../services/platform/d1-stage2-source-export.mjs";
import {
  buildCheckpointManifest,
  enumerateSourceDeltas,
  fingerprintRow,
} from "../services/platform/source-delta.mjs";
import {
  buildCredentialVersionManifest,
} from "../services/platform/d1-stage2-credential-reconciliation.mjs";

const NOW = "2026-11-20T00:00:00.000Z";
const SNAPSHOT_A = "s2s-snapshot-test-001";
const SNAPSHOT_B = "s2s-snapshot-test-002";

function makeSnapshot(t, snapshotId = SNAPSHOT_A) {
  const dir = mkdtempSync(join(tmpdir(), "stage2-export-"));
  const { metadata, db } = buildSyntheticSourceSnapshot({
    dbPath: join(dir, "snapshot.sqlite"),
    snapshotId,
    now: NOW,
  });
  t.after(() => {
    try { db.close(); } catch { /* already closed */ }
    rmSync(dir, { recursive: true, force: true });
  });
  return { metadata, db, dir };
}

function assertErrorCode(fn, code) {
  assert.throws(fn, (error) => error && error.code === code);
}

// Canonical JSON identical to the export module's: sorted keys, no spaces.
function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

// Add an unapproved column to every row of a page and recompute the
// hash and byte length exactly as the issuer would, so the page is
// hash-self-consistent: only the column-authorization check can catch it.
function smuggleColumn(page, column, value) {
  const rows = page.rows.map((row) => ({ ...row, [column]: value }));
  return {
    ...page,
    columns: [...page.columns, column],
    rows,
    contentHash: createHash("sha256").update(canonicalJson(rows), "utf8").digest("hex"),
    byteLength: Buffer.byteLength(canonicalJson(rows), "utf8"),
  };
}

const CHECKPOINT_TABLES = [
  { table: "platform_accounts", pk: "id" },
  { table: "platform_entitlements", pk: "id" },
  { table: "platform_schema_migrations", pk: "migration_id" },
];

// ---- Task 1: manifest and source identity ----

test("S2S-MAN-1 snapshot builds with the pinned source identity", (t) => {
  const { metadata } = makeSnapshot(t);
  assert.equal(metadata.sourceSnapshotId, SNAPSHOT_A);
  assert.equal(metadata.sourceCommit, "be261abc60f28bb2733764fa5364ab44b3e76844");
  assert.equal(metadata.migrationCount, 19);
  assert.equal(metadata.inventoryTableCount, 70);
  assert.equal(metadata.inventoryColumnCount, 820);
  assert.equal(metadata.authority, "BWH_ACTIVE");
  assert.equal(metadata.epoch, 1);
  assert.equal(metadata.mappingVersion, "stage2-candidate-v1");
  assert.deepEqual(metadata.tableRowCounts, {
    platform_accounts: 3,
    platform_entitlements: 4,
    platform_portal_edge_credentials: 3,
    platform_schema_migrations: 19,
  });
  // Rehearsal subset only: 4 of the 70 expected tables materialized.
  assert.equal(metadata.missingExpectedTables.length, 66);
  assert.deepEqual(metadata.unexpectedTables, [
    "platform_credential_versions",
    "platform_writer_authority",
  ]);
  assert.deepEqual(metadata.materializedTables, [
    "platform_accounts",
    "platform_entitlements",
    "platform_portal_edge_credentials",
    "platform_schema_migrations",
  ]);
  assert.match(metadata.snapshotHash, /^[0-9a-f]{64}$/);
  assert.equal(metadata.credentialBackfilledCount, 0);
});

test("S2S-MAN-2 verify passes on a fresh snapshot", (t) => {
  const { metadata, db } = makeSnapshot(t);
  assert.deepEqual(verifySyntheticSourceSnapshot(db, metadata), { valid: true });
});

test("S2S-MAN-3 a tampered row fails snapshot verification", (t) => {
  const { metadata, db } = makeSnapshot(t);
  db.prepare(`update platform_accounts set status = 'disabled' where id = 's2s-account-001'`).run();
  assertErrorCode(() => verifySyntheticSourceSnapshot(db, metadata), "source_snapshot_rows_mismatch");
});

test("S2S-MAN-4 a tampered ledger fails snapshot verification", (t) => {
  const { metadata, db } = makeSnapshot(t);
  db.prepare(`delete from platform_schema_migrations where migration_id = '20260723_001_coin_wallet_foundation'`).run();
  assertErrorCode(() => verifySyntheticSourceSnapshot(db, metadata), "source_migration_ledger_invalid");
});

test("S2S-MAN-5 two snapshots built from the same inputs have identical digests", (t) => {
  const first = makeSnapshot(t, SNAPSHOT_A);
  const second = makeSnapshot(t, SNAPSHOT_A);
  assert.equal(first.metadata.schemaDigest, second.metadata.schemaDigest);
  assert.equal(first.metadata.ledgerDigest, second.metadata.ledgerDigest);
  assert.deepEqual(first.metadata.tableRowDigests, second.metadata.tableRowDigests);
  assert.equal(first.metadata.credentialManifestHash, second.metadata.credentialManifestHash);
  assert.equal(first.metadata.snapshotHash, second.metadata.snapshotHash);
});

test("S2S-MAN-6 an invalid snapshot id is rejected", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "stage2-export-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  assertErrorCode(
    () => buildSyntheticSourceSnapshot({ dbPath: join(dir, "x.sqlite"), snapshotId: "prod-snapshot-1" }),
    "source_snapshot_id_invalid",
  );
  assertErrorCode(
    () => buildSyntheticSourceSnapshot({ dbPath: join(dir, "x.sqlite"), snapshotId: "" }),
    "source_snapshot_id_invalid",
  );
});

test("S2S-MAN-7 ledger digest matches the pinned 19-entry registry", (t) => {
  const { db } = makeSnapshot(t);
  const digest = computeLedgerDigest(db);
  assert.match(digest, /^[0-9a-f]{64}$/);
  const expected = readExpectedTableList();
  assert.equal(expected.sourceMigrationHistory.length, 19);
  assert.ok(expected.sourceMigrationHistory.every((entry) => /^[0-9a-f]{64}$/.test(entry.ddlSha256)));
  assert.equal(isSourceManifestError(new Error("x")), false);
});

test("S2S-MAN-8 a metadata row count that disagrees with the database fails snapshot verification", (t) => {
  const { metadata, db } = makeSnapshot(t);
  const tampered = { ...metadata, tableRowCounts: { ...metadata.tableRowCounts, platform_accounts: 99 } };
  assertErrorCode(() => verifySyntheticSourceSnapshot(db, tampered), "source_snapshot_rowcount_mismatch");
});

// ---- Task 2: safe export batches ----

test("S2S-EXP-1 first page of accounts is PK-ordered, KEEP-only and verifiable", (t) => {
  const { db } = makeSnapshot(t);
  const page = exportPage(db, { table: "platform_accounts", pk: "id", snapshotId: SNAPSHOT_A, limit: 2, batchIndex: 0 });
  assert.equal(page.rowCount, 2);
  assert.deepEqual(page.columns, ["id", "owner_ref", "status", "created_at", "updated_at"]);
  assert.ok(!page.columns.includes("metadata_json"), "CONDITIONAL metadata_json must not be exported");
  assert.deepEqual(page.startPk, ["s2s-account-001"]);
  assert.deepEqual(page.endPk, ["s2s-account-002"]);
  assert.deepEqual(page.rows.map((row) => row.id), ["s2s-account-001", "s2s-account-002"]);
  assert.equal(page.byteLength > 0, true);
  assert.equal(verifyExportPage(page), true);
  assert.ok(page.continuationToken.startsWith("s2s-ct-"));
});

test("S2S-EXP-2 resuming from a continuation token covers every row exactly once", (t) => {
  const { db } = makeSnapshot(t);
  const first = exportPage(db, { table: "platform_accounts", pk: "id", snapshotId: SNAPSHOT_A, limit: 2, batchIndex: 0 });
  const second = exportPage(db, {
    table: "platform_accounts", pk: "id", snapshotId: SNAPSHOT_A,
    afterPk: first.endPk, limit: 2, batchIndex: 1,
  });
  assert.equal(second.rowCount, 1);
  assert.deepEqual(second.rows.map((row) => row.id), ["s2s-account-003"]);
  assert.equal(second.continuationToken !== null, true);
  const third = exportPage(db, {
    table: "platform_accounts", pk: "id", snapshotId: SNAPSHOT_A,
    afterPk: second.endPk, limit: 2, batchIndex: 2,
  });
  assert.equal(third.rowCount, 0);
  assert.equal(third.continuationToken, null);
  const seen = [...first.rows, ...second.rows].map((row) => row.id);
  assert.deepEqual(seen, ["s2s-account-001", "s2s-account-002", "s2s-account-003"]);
});

test("S2S-EXP-3 export limit is bounded to 1..20", (t) => {
  const { db } = makeSnapshot(t);
  assertErrorCode(
    () => exportPage(db, { table: "platform_accounts", pk: "id", snapshotId: SNAPSHOT_A, limit: 21 }),
    "export_limit_invalid",
  );
  assertErrorCode(
    () => exportPage(db, { table: "platform_accounts", pk: "id", snapshotId: SNAPSHOT_A, limit: 0 }),
    "export_limit_invalid",
  );
  const page = exportPage(db, { table: "platform_entitlements", pk: "id", snapshotId: SNAPSHOT_A, limit: 20 });
  assert.equal(page.rowCount, 4);
});

test("S2S-EXP-4 credentials export excludes credential columns and pages on the composite PK", (t) => {
  const { db } = makeSnapshot(t);
  const page = exportPage(db, {
    table: "platform_portal_edge_credentials",
    pk: ["request_id", "edge_channel_ref"],
    snapshotId: SNAPSHOT_A, limit: 2, batchIndex: 0,
  });
  assert.deepEqual(page.columns, ["request_id", "edge_channel_ref", "ordinal"]);
  for (const row of page.rows) {
    assert.equal("edge_credential_ref" in row, false);
    assert.equal("edge_material_digest" in row, false);
  }
  assert.deepEqual(page.endPk, ["s2s-request-002", "s2s-channel-a"]);
  const next = exportPage(db, {
    table: "platform_portal_edge_credentials",
    pk: ["request_id", "edge_channel_ref"],
    snapshotId: SNAPSHOT_A, afterPk: page.endPk, limit: 2, batchIndex: 1,
  });
  assert.equal(next.rowCount, 1);
  assert.deepEqual(next.rows[0], { request_id: "s2s-request-002", edge_channel_ref: "s2s-channel-b", ordinal: 1 });
  assert.equal(verifyExportPage(page), true);
  assert.equal(verifyExportPage(next), true);
});

test("S2S-EXP-5 unmapped table, tampered page and unsorted page all fail closed", (t) => {
  const { db } = makeSnapshot(t);
  assertErrorCode(
    () => exportPage(db, { table: "platform_writer_authority", pk: "id", snapshotId: SNAPSHOT_A }),
    "export_table_unmapped",
  );
  const page = exportPage(db, { table: "platform_accounts", pk: "id", snapshotId: SNAPSHOT_A, limit: 2 });
  const tampered = { ...page, rows: page.rows.map((row) => ({ ...row })) };
  tampered.rows[0] = { ...tampered.rows[0], status: "disabled" };
  assertErrorCode(() => verifyExportPage(tampered), "export_page_hash_mismatch");
  const unsorted = { ...page, rows: [...page.rows].reverse() };
  assert.throws(() => verifyExportPage(unsorted), (error) => isExportError(error) && error.code.startsWith("export_page_"));
});

test("S2S-EXP-6 a secret-looking value in an approved column is rejected", (t) => {
  const { db } = makeSnapshot(t);
  db.prepare(`update platform_accounts set owner_ref = 'sk-abcdefgh12345678' where id = 's2s-account-001'`).run();
  assertErrorCode(
    () => exportPage(db, { table: "platform_accounts", pk: "id", snapshotId: SNAPSHOT_A }),
    "export_sensitive_value_detected",
  );
});

test("S2S-EXP-7 a page smuggling CONDITIONAL metadata_json with a self-consistent hash is rejected", (t) => {
  const { db } = makeSnapshot(t);
  const page = exportPage(db, { table: "platform_accounts", pk: "id", snapshotId: SNAPSHOT_A, limit: 2 });
  const smuggled = smuggleColumn(page, "metadata_json", "s2s-smuggled-metadata");
  assertErrorCode(() => verifyExportPage(smuggled), "export_page_column_unapproved");
});

test("S2S-EXP-8 a page smuggling DEFER edge_credential_ref with a self-consistent hash is rejected", (t) => {
  const { db } = makeSnapshot(t);
  const page = exportPage(db, {
    table: "platform_portal_edge_credentials",
    pk: ["request_id", "edge_channel_ref"],
    snapshotId: SNAPSHOT_A, limit: 2,
  });
  const smuggled = smuggleColumn(page, "edge_credential_ref", "s2s-smuggled-credential-ref");
  assertErrorCode(() => verifyExportPage(smuggled), "export_page_column_unapproved");
});

test("S2S-EXP-9 a page whose excludedColumns disagree with the mapping is rejected", (t) => {
  const { db } = makeSnapshot(t);
  const page = exportPage(db, { table: "platform_accounts", pk: "id", snapshotId: SNAPSHOT_A, limit: 2 });
  const wrongExcluded = { ...page, excludedColumns: page.excludedColumns.filter((entry) => entry.column !== "metadata_json") };
  assertErrorCode(() => verifyExportPage(wrongExcluded), "export_page_column_unapproved");
});


test("S2S-EXP-10 verifier rejects row-level field smuggling when page.columns is unchanged", (t) => {
  const { db } = makeSnapshot(t);
  const page = exportPage(db, { table: "platform_accounts", pk: "id", snapshotId: SNAPSHOT_A, limit: 2 });
  for (const [column, value] of [
    ["metadata_json", "s2s-smuggled-metadata"],
    ["edge_credential_ref", "s2s-smuggled-credential-ref"],
  ]) {
    const rows = page.rows.map((row, index) => index === 0 ? { ...row, [column]: value } : row);
    const canonical = canonicalJson(rows);
    const rowSmuggled = {
      ...page,
      rows,
      // Keep the declared columns untouched, but make the payload hash
      // self-consistent exactly as an attacker could.
      contentHash: createHash("sha256").update(canonical, "utf8").digest("hex"),
      byteLength: Buffer.byteLength(canonical, "utf8"),
    };
    assertErrorCode(() => verifyExportPage(rowSmuggled), "export_page_column_unapproved");
  }

  const secretRows = page.rows.map((row, index) => index === 0 ? { ...row, owner_ref: "Bearer sk-abcdefgh12345678" } : row);
  const secretCanonical = canonicalJson(secretRows);
  const secretPage = {
    ...page,
    rows: secretRows,
    contentHash: createHash("sha256").update(secretCanonical, "utf8").digest("hex"),
    byteLength: Buffer.byteLength(secretCanonical, "utf8"),
  };
  assertErrorCode(() => verifyExportPage(secretPage), "export_sensitive_value_detected");
});

test("S2S-EXP-11 non-empty page boundaries and continuation token bind to actual row PKs", (t) => {
  const { db } = makeSnapshot(t);
  const page = exportPage(db, { table: "platform_accounts", pk: "id", snapshotId: SNAPSHOT_A, limit: 1 });
  const forgedLastPk = ["s2s-account-003"];
  const forgedTokenPayload = Buffer.from(JSON.stringify({
    table: page.table,
    lastPk: forgedLastPk,
    snapshotId: page.snapshotId,
  }), "utf8").toString("base64url");
  const forgedBoundary = {
    ...page,
    endPk: forgedLastPk,
    continuationToken: `s2s-ct-${forgedTokenPayload}`,
  };
  assertErrorCode(() => verifyExportPage(forgedBoundary), "export_page_boundary_mismatch");

  const missingToken = { ...page, continuationToken: null };
  assertErrorCode(() => verifyExportPage(missingToken), "export_page_token_mismatch");

  const forgedStart = { ...page, startPk: ["s2s-account-003"] };
  assertErrorCode(() => verifyExportPage(forgedStart), "export_page_boundary_mismatch");
});

// ---- Task 4: deletion / incremental manifest ----

function checkpointAndModify(t, db) {
  const checkpoint = buildCheckpointManifest(db, { tables: CHECKPOINT_TABLES, snapshotId: SNAPSHOT_A });
  const prevCredentials = buildCredentialVersionManifest(db, { snapshotId: SNAPSHOT_A });
  db.prepare(`update platform_accounts set status = 'suspended' where id = 's2s-account-001'`).run();
  db.prepare(`insert into platform_entitlements (id, account_id, plan, status, valid_from, valid_until, max_artifacts, max_devices, traffic_limit_bytes, created_at, updated_at) values ('s2s-entitlement-005', 's2s-account-002', 's2s-plan-basic', 'active', ?, ?, 1, 1, 0, ?, ?)`)
    .run(NOW, "2027-11-20T00:00:00.000Z", NOW, NOW);
  db.prepare(`delete from platform_entitlements where id = 's2s-entitlement-003'`).run();
  const curCredentials = buildCredentialVersionManifest(db, { snapshotId: SNAPSHOT_B });
  return { checkpoint, prevCredentials, curCredentials };
}

test("S2S-INC-1 incremental manifest counts inserts, updates, deletes and tombstones with FK order", (t) => {
  const { db } = makeSnapshot(t);
  const { checkpoint, prevCredentials, curCredentials } = checkpointAndModify(t, db);
  const hwm = createHighWaterMark({ seq: 1, snapshotId: SNAPSHOT_B });
  const manifest = buildIncrementalManifest(db, {
    tables: CHECKPOINT_TABLES,
    checkpoint,
    previousCredentialManifest: prevCredentials,
    currentCredentialManifest: curCredentials,
    highWaterMark: hwm,
    previousSnapshotId: SNAPSHOT_A,
  });
  assert.equal(manifest.seq, 1);
  assert.equal(manifest.previousSnapshotId, SNAPSHOT_A);
  assert.deepEqual(manifest.summary, { tables: 4, inserted: 1, updated: 1, deleted: 1 });
  const accounts = manifest.tables.find((entry) => entry.table === "platform_accounts");
  assert.equal(accounts.updated.length, 1);
  assert.equal(accounts.updated[0].pk, "s2s-account-001");
  const entitlements = manifest.tables.find((entry) => entry.table === "platform_entitlements");
  assert.deepEqual(entitlements.inserted.map((row) => row.pk), ["s2s-entitlement-005"]);
  assert.equal(entitlements.deleted.length, 1);
  assert.equal(entitlements.deleted[0].pk, "s2s-entitlement-003");
  assert.ok(typeof entitlements.deleted[0].previousFingerprint === "string", "delete carries a tombstone fingerprint");
  const credentials = manifest.tables.find((entry) => entry.table === "platform_portal_edge_credentials");
  assert.equal(credentials.inserted.length, 0);
  assert.equal(credentials.updated.length, 0);
  assert.equal(credentials.deleted.length, 0);
  assert.equal(manifest.credentialRotations.unchanged, 3);
  assert.deepEqual(manifest.insertOrder, [
    "platform_accounts",
    "platform_entitlements",
    "platform_schema_migrations",
    "platform_portal_edge_credentials",
  ]);
  assert.deepEqual(manifest.deleteOrder, [
    "platform_portal_edge_credentials",
    "platform_schema_migrations",
    "platform_entitlements",
    "platform_accounts",
  ]);
  assert.equal(verifyIncrementalManifest(manifest).valid, true);
});

test("S2S-INC-2 a seq gap and a tampered manifest hash both fail verification", (t) => {
  const { db } = makeSnapshot(t);
  const { checkpoint, prevCredentials, curCredentials } = checkpointAndModify(t, db);
  const first = buildIncrementalManifest(db, {
    tables: CHECKPOINT_TABLES, checkpoint,
    previousCredentialManifest: prevCredentials, currentCredentialManifest: curCredentials,
    highWaterMark: createHighWaterMark({ seq: 1, snapshotId: SNAPSHOT_B }), previousSnapshotId: SNAPSHOT_A,
  });
  const gapped = buildIncrementalManifest(db, {
    tables: CHECKPOINT_TABLES, checkpoint,
    previousCredentialManifest: prevCredentials, currentCredentialManifest: curCredentials,
    highWaterMark: createHighWaterMark({ seq: 3, snapshotId: SNAPSHOT_B }), previousSnapshotId: SNAPSHOT_A,
  });
  assertErrorCode(() => verifyIncrementalManifest(gapped, first), "export_manifest_gap");
  const tampered = { ...first, summary: { ...first.summary, inserted: 99 } };
  assertErrorCode(() => verifyIncrementalManifest(tampered), "export_manifest_hash_mismatch");
});

test("S2S-INC-3 two updates between checkpoints collapse to one delta entry (fingerprint diff is not CDC)", (t) => {
  const { db } = makeSnapshot(t);
  const checkpoint = buildCheckpointManifest(db, { tables: CHECKPOINT_TABLES, snapshotId: SNAPSHOT_A });
  db.prepare(`update platform_accounts set status = 'suspended' where id = 's2s-account-001'`).run();
  db.prepare(`update platform_accounts set status = 'disabled' where id = 's2s-account-001'`).run();
  const deltas = enumerateSourceDeltas(db, { tables: CHECKPOINT_TABLES, checkpoint });
  const accounts = deltas.tables.find((entry) => entry.table === "platform_accounts");
  assert.equal(accounts.updated.length, 1, "the intermediate state is invisible to fingerprint diffing");
  assert.equal(accounts.updated[0].pk, "s2s-account-001");
  assert.equal(accounts.updated[0].fingerprint, fingerprintRow(db.prepare(`select * from platform_accounts where id = 's2s-account-001'`).get()));
});

test("S2S-INC-4 a checkpoint that does not cover a table fails closed", (t) => {
  const { db } = makeSnapshot(t);
  const partial = buildCheckpointManifest(db, {
    tables: [{ table: "platform_accounts", pk: "id" }],
    snapshotId: SNAPSHOT_A,
  });
  const prevCredentials = buildCredentialVersionManifest(db, { snapshotId: SNAPSHOT_A });
  const curCredentials = buildCredentialVersionManifest(db, { snapshotId: SNAPSHOT_B });
  assert.throws(
    () => buildIncrementalManifest(db, {
      tables: CHECKPOINT_TABLES, checkpoint: partial,
      previousCredentialManifest: prevCredentials, currentCredentialManifest: curCredentials,
      highWaterMark: createHighWaterMark({ seq: 1, snapshotId: SNAPSHOT_B }), previousSnapshotId: SNAPSHOT_A,
    }),
    (error) => error && error.code === "delta_checkpoint_invalid",
  );
});


test("S2S-INC-5 stale checkpoint and credential manifests cannot be relabeled as a newer parent snapshot", (t) => {
  const { db } = makeSnapshot(t);
  const checkpoint = buildCheckpointManifest(db, { tables: CHECKPOINT_TABLES, snapshotId: SNAPSHOT_A });
  const previousCredentialManifest = buildCredentialVersionManifest(db, { snapshotId: SNAPSHOT_A });
  const currentCredentialManifest = buildCredentialVersionManifest(db, { snapshotId: SNAPSHOT_B });
  const baseArgs = {
    tables: CHECKPOINT_TABLES,
    checkpoint,
    previousCredentialManifest,
    currentCredentialManifest,
    highWaterMark: createHighWaterMark({ seq: 1, snapshotId: SNAPSHOT_B }),
    previousSnapshotId: SNAPSHOT_A,
  };

  // Reproduces the stale-checkpoint chain: an A checkpoint cannot be
  // presented as the B parent of a B -> C delta.
  assertErrorCode(
    () => buildIncrementalManifest(db, { ...baseArgs, previousSnapshotId: SNAPSHOT_B }),
    "export_checkpoint_lineage",
  );

  const stalePreviousCredentials = buildCredentialVersionManifest(db, { snapshotId: SNAPSHOT_B });
  assertErrorCode(
    () => buildIncrementalManifest(db, { ...baseArgs, previousCredentialManifest: stalePreviousCredentials }),
    "export_credential_manifest_lineage",
  );

  const staleCurrentCredentials = buildCredentialVersionManifest(db, { snapshotId: SNAPSHOT_A });
  assertErrorCode(
    () => buildIncrementalManifest(db, { ...baseArgs, currentCredentialManifest: staleCurrentCredentials }),
    "export_credential_manifest_lineage",
  );

  assertErrorCode(
    () => buildIncrementalManifest(db, { ...baseArgs, currentCredentialManifest: null }),
    "export_credential_manifest_invalid",
  );
});

// ---- Task 7 (export side): crash and integrity ----

test("S2S-CRASH-1 an export interrupted between pages resumes without loss or duplication", (t) => {
  const { db } = makeSnapshot(t);
  const first = exportPage(db, { table: "platform_entitlements", pk: "id", snapshotId: SNAPSHOT_A, limit: 2, batchIndex: 0 });
  // Simulate a crash: all in-memory export state is discarded; only
  // the page-1 continuation token survives (it is durable).
  const token = first.continuationToken;
  assert.ok(token);
  const resumed = exportPage(db, {
    table: "platform_entitlements", pk: "id", snapshotId: SNAPSHOT_A,
    afterPk: first.endPk, limit: 2, batchIndex: 1,
  });
  assert.deepEqual([...first.rows, ...resumed.rows].map((row) => row.id), [
    "s2s-entitlement-001", "s2s-entitlement-002", "s2s-entitlement-003", "s2s-entitlement-004",
  ]);
  assert.equal(token, first.continuationToken);
});

test("S2S-CRASH-2 a row changed after the checkpoint exports its new state; the checkpoint fingerprint is stale", (t) => {
  const { db } = makeSnapshot(t);
  const checkpoint = buildCheckpointManifest(db, { tables: CHECKPOINT_TABLES, snapshotId: SNAPSHOT_A });
  db.prepare(`update platform_accounts set status = 'disabled' where id = 's2s-account-002'`).run();
  const page = exportPage(db, { table: "platform_accounts", pk: "id", snapshotId: SNAPSHOT_A, limit: 20 });
  assert.equal(page.rows.find((row) => row.id === "s2s-account-002").status, "disabled");
  assert.equal(verifyExportPage(page), true);
  const currentFingerprint = fingerprintRow(db.prepare(`select * from platform_accounts where id = 's2s-account-002'`).get());
  assert.notEqual(currentFingerprint, checkpoint.tables.platform_accounts["s2s-account-002"]);
});

test("S2S-CRASH-3 a missing table fails closed for export and for the incremental manifest", (t) => {
  const { db } = makeSnapshot(t);
  db.exec(`drop table platform_entitlements`);
  assertErrorCode(
    () => exportPage(db, { table: "platform_entitlements", pk: "id", snapshotId: SNAPSHOT_A }),
    "export_table_missing",
  );
  const checkpoint = buildCheckpointManifest(db, {
    tables: [{ table: "platform_accounts", pk: "id" }, { table: "platform_schema_migrations", pk: "migration_id" }],
    snapshotId: SNAPSHOT_A,
  });
  const prevCredentials = buildCredentialVersionManifest(db, { snapshotId: SNAPSHOT_A });
  const curCredentials = buildCredentialVersionManifest(db, { snapshotId: SNAPSHOT_B });
  assert.throws(
    () => buildIncrementalManifest(db, {
      tables: CHECKPOINT_TABLES, checkpoint,
      previousCredentialManifest: prevCredentials, currentCredentialManifest: curCredentials,
      highWaterMark: createHighWaterMark({ seq: 1, snapshotId: SNAPSHOT_B }), previousSnapshotId: SNAPSHOT_A,
    }),
    (error) => error && (error.code === "delta_table_missing" || error.code === "delta_checkpoint_invalid"),
  );
});

test("S2S-CRASH-4 a large batch is bounded at 20 rows per page", (t) => {
  const { db } = makeSnapshot(t);
  const insert = db.prepare(`insert into platform_accounts (id, owner_ref, status, created_at, updated_at, metadata_json) values (?, ?, 'active', ?, ?, '{}')`);
  const bulk = db.transaction(() => {
    for (let i = 100; i < 125; i += 1) insert.run(`s2s-account-${i}`, `s2s-owner-${i}`, NOW, NOW);
  });
  bulk();
  const page = exportPage(db, { table: "platform_accounts", pk: "id", snapshotId: SNAPSHOT_A, limit: 20 });
  assert.equal(page.rowCount, 20);
  assert.ok(page.continuationToken);
  const rest = exportPage(db, { table: "platform_accounts", pk: "id", snapshotId: SNAPSHOT_A, afterPk: page.endPk, limit: 20 });
  assert.equal(rest.rowCount, 8);
  assert.equal(page.rowCount + rest.rowCount, 28);
});

test("S2S-CRASH-5 FK delete order: cascade removes children, and the manifest still orders deletes children-first", (t) => {
  const { db } = makeSnapshot(t);
  db.pragma("foreign_keys = ON");
  // Part A — the real entitlements DDL is ON DELETE CASCADE, so
  // deleting a parent succeeds and removes its children with it:
  // the FK is enforced (the children disappear), not ignored.
  const cascade = db.prepare(`delete from platform_accounts where id = 's2s-account-003'`).run();
  assert.equal(cascade.changes, 1);
  assert.equal(db.prepare(`select count(*) as n from platform_entitlements where account_id = 's2s-account-003'`).get().n, 0);
  // Part B — the incremental manifest still orders deletes
  // children-first: the D1 applier needs that order where its FKs
  // are RESTRICT.
  const checkpoint = buildCheckpointManifest(db, { tables: CHECKPOINT_TABLES, snapshotId: SNAPSHOT_A });
  const prevCredentials = buildCredentialVersionManifest(db, { snapshotId: SNAPSHOT_A });
  db.prepare(`delete from platform_entitlements where account_id = 's2s-account-001'`).run();
  const changed = db.prepare(`delete from platform_accounts where id = 's2s-account-001'`).run();
  assert.equal(changed.changes, 1);
  const curCredentials = buildCredentialVersionManifest(db, { snapshotId: SNAPSHOT_B });
  const manifest = buildIncrementalManifest(db, {
    tables: CHECKPOINT_TABLES, checkpoint,
    previousCredentialManifest: prevCredentials, currentCredentialManifest: curCredentials,
    highWaterMark: createHighWaterMark({ seq: 1, snapshotId: SNAPSHOT_B }), previousSnapshotId: SNAPSHOT_A,
  });
  assert.ok(manifest.deleteOrder.indexOf("platform_entitlements") < manifest.deleteOrder.indexOf("platform_accounts"));
  assert.equal(manifest.tables.find((entry) => entry.table === "platform_entitlements").deleted.length, 2);
  assert.equal(manifest.tables.find((entry) => entry.table === "platform_accounts").deleted.length, 1);
});

// Sanity: better-sqlite3 is available in this test process.
test("S2S-ENV-1 better-sqlite3 opens a database", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "stage2-env-"));
  let probe;
  t.after(() => {
    if (probe?.open) probe.close();
    rmSync(dir, { recursive: true, force: true });
  });
  probe = new Database(join(dir, "probe.sqlite"));
  probe.exec(`create table probe (id integer primary key)`);
  probe.prepare(`insert into probe (id) values (1)`).run();
  assert.equal(probe.prepare(`select count(*) as n from probe`).get().n, 1);
});
