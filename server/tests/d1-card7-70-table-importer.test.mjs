// D1 Card 7 — 70-table importer tests (synthetic data only).
//
// Everything here runs against an in-memory SQLite database built by
// `d1-card7-synthetic-fixture.mjs`. No real BWH row is read, no E4 write
// is attempted, no network call is made. The seven-column check mirrors
// the Card 6 / S4 synthetic check (one synthetic lease + three synthetic
// receipts, values read back value-by-value) and extends it to all 70
// tables, batch checkpoint resume, count/hash reconciliation and failure
// recovery.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  TABLE_MAPPING,
  SOURCE_TABLES_70,
  E4_TARGET_ONLY_TABLES,
  E4_CONDITIONALLY_MISSING_TABLES,
  firstBatchTables,
} from "../services/platform/d1-card7-70-table-mapping.mjs";
import {
  BATCH_SIZE,
  CARD6_DDL_ONLY_TABLES,
  E4_TARGET,
  EXTERNALIZE_SOURCE_COLUMNS,
  assertE4Target,
  buildD1BatchStatements,
  countSourceRows,
  controlledJsonSchemaVersion,
  createCheckpoint,
  executeD1Batch,
  firstBatchPlan,
  hashDatabase,
  hashRow,
  hashRowValues,
  hashTableRows,
  loadPlanOrder,
  planBatchesForTable,
  readSourcePage,
  resumePlan,
  runSyntheticLoad,
  targetColumnsFor,
  transformCredentialCount,
  transformGeneration,
  transformListenerPresent,
  transformNodeRef,
  transformReasonCode,
  transformReceiptDigest,
  transformReleasedAt,
  transformRow,
  verifyBatchApplied,
  verifySourceIntegrity,
} from "../services/platform/d1-card7-70-table-importer.mjs";
import {
  createSyntheticFixtureDb,
  fixtureRowCounts,
  syntheticValueFor,
} from "../services/platform/d1-card7-synthetic-fixture.mjs";

const IMPORTER_SOURCE = readFileSync(
  new URL("../services/platform/d1-card7-70-table-importer.mjs", import.meta.url),
  "utf8",
);
const SNAPSHOT_ID = "synth-phase8a-20261118T134920Z";
const SNAPSHOT_SHA = "a".repeat(64);
const GATES_OPEN = {
  legacyArchiveQ6: true,
  desiredStatesD2: true,
  linkResetsD2: true,
  ledgerDetermination: "H1",
  passwordHandlingApproved: true,
};

function freshDb() {
  return createSyntheticFixtureDb(new DatabaseSync(":memory:"));
}

function sumCp(checkpoints, field) {
  return checkpoints.reduce((n, c) => n + c[field], 0);
}

function synthRow(db, table, index = 0) {
  return db.prepare(`SELECT * FROM "${table}" ORDER BY rowid LIMIT 1 OFFSET ?`).get(index);
}

// ---------------------------------------------------------------------------
// Mapping: 70 tables
// ---------------------------------------------------------------------------

test("mapping covers exactly the 70 source tables (68 same-name, 2 missing, 17 added)", () => {
  assert.equal(TABLE_MAPPING.length, 70);
  assert.equal(SOURCE_TABLES_70.length, 70);
  assert.deepEqual(TABLE_MAPPING.map((t) => t.source), SOURCE_TABLES_70);
  assert.equal(TABLE_MAPPING.filter((t) => t.target === t.source).length, 68);
  assert.deepEqual(E4_CONDITIONALLY_MISSING_TABLES, [
    "platform_ads_click_consent_claims",
    "platform_ads_consent_decisions",
  ]);
  assert.equal(E4_TARGET_ONLY_TABLES.length, 17);
  assert.equal(TABLE_MAPPING.filter((t) => t.target === null).length, 2);
  assert.equal(new Set(TABLE_MAPPING.map((t) => t.source)).size, 70);
});

test("DDL v1.1 column total is 570 (545 on src70 DDL tables + 25 on the 3 DDL-only tables)", () => {
  // The 48 src70 tables that exist in DDL v1.1 are exactly the mapped
  // tables with an FK layer (ring tables included); the other 22 mapped
  // tables are V2.2-only / not-in-DDL / excluded.
  const ddlTables = TABLE_MAPPING.filter((t) => t.fkLayer !== null && t.fkLayer !== undefined);
  assert.equal(ddlTables.length, 48);
  const src70DdlCols = ddlTables.reduce((a, t) => a + t.columns.length, 0);
  assert.equal(src70DdlCols, 545);
  const ddlOnlyCols = CARD6_DDL_ONLY_TABLES.reduce((a, t) => a + t.columns.length, 0);
  assert.equal(ddlOnlyCols, 25); // 13 + 2 + 10
  assert.equal(src70DdlCols + ddlOnlyCols, 570);
});

test("first-batch snapshot rows total 6,848 over 50 tables (47 in mapping + 3 DDL-only)", () => {
  const inMapping = firstBatchTables();
  assert.equal(inMapping.length, 47);
  const mappingRows = inMapping.reduce((a, t) => a + (t.snapshotRows ?? 0), 0);
  const ddlOnlyRows = CARD6_DDL_ONLY_TABLES.reduce((a, t) => a + t.snapshotRows, 0);
  assert.equal(ddlOnlyRows, 12); // 3 + 3 + 6
  assert.equal(mappingRows + ddlOnlyRows, 6848);
});

test("first-batch plan is 103 batches at 100 rows per batch, per-table ceiling", () => {
  const plan = firstBatchPlan();
  assert.equal(plan.length, 103);
  assert.equal(plan[0].batchId, "B-001");
  assert.equal(plan[102].batchId, "B-103");
  const byTable = (name) => plan.filter((b) => b.table === name);
  assert.equal(byTable("platform_edge_apply_receipts").length, 16);
  assert.equal(byTable("platform_portal_sessions").length, 12);
  assert.equal(byTable("platform_portal_edge_credentials").length, 8);
  assert.equal(byTable("platform_edge_desired_state_notifications").length, 4);
  assert.equal(byTable("platform_audit_events").length, 3);
  assert.equal(byTable("platform_accounts").length, 1);
  assert.equal(plan.filter((b) => b.ringGroup === "lots-credit-origins").length, 2);
  assert.equal(BATCH_SIZE, 100);
});

test("planBatchesForTable ceilings: 1513 -> 16, 100 -> 1, 101 -> 2, 0 -> none", () => {
  assert.equal(planBatchesForTable("platform_edge_apply_receipts", 1513).length, 16);
  assert.equal(planBatchesForTable("platform_accounts", 100).length, 1);
  assert.equal(planBatchesForTable("platform_accounts", 101).length, 2);
  assert.deepEqual(planBatchesForTable("platform_accounts", 0), []);
});

test("load order respects FK layers: parents first, ring together after layer 1", () => {
  const order = loadPlanOrder();
  assert.equal(order.length, 50);
  const at = (name) => order.indexOf(name);
  assert.ok(at("platform_accounts") < at("platform_coin_wallets"));
  assert.ok(at("platform_coin_wallets") < at("platform_coin_commerce_orders"));
  assert.ok(at("platform_coin_commerce_orders") < at("platform_coin_commerce_fulfillment_commands"));
  assert.ok(at("platform_coin_commerce_fulfillment_commands") < at("platform_coin_commerce_fulfillment_receipts"));
  assert.ok(at("platform_portal_entries") < at("platform_portal_sessions"));
  assert.ok(at("platform_coin_commerce_initial_confirmations") > at("platform_issued_subscription_links"));
  const lots = at("platform_coin_lots");
  const origins = at("platform_coin_credit_origins");
  assert.equal(Math.abs(lots - origins), 1, "ring tables load adjacently");
  assert.ok(lots > at("platform_coin_wallets"), "ring loads after its layer-1 parents");
  assert.ok(at("platform_coin_ledger_entries") < at("platform_usage_rollups"), "same-layer tables keep alphabetical order");
});

// ---------------------------------------------------------------------------
// Seven signed rules, one function per rule
// ---------------------------------------------------------------------------

test("rule 1 released_at: NULL stays NULL, text passes through, non-text refused", () => {
  assert.equal(transformReleasedAt(null), null);
  assert.equal(transformReleasedAt(undefined), null);
  assert.equal(transformReleasedAt("2026-11-18T13:49:20Z"), "2026-11-18T13:49:20Z");
  assert.throws(() => transformReleasedAt(0), /seven_rule_violation/);
});

test("rule 2 node_ref: NULL stays NULL, reference kept, nothing generated", () => {
  assert.equal(transformNodeRef(null), null);
  assert.equal(transformNodeRef(undefined), null);
  assert.equal(transformNodeRef("synth-node-001"), "synth-node-001");
  assert.throws(() => transformNodeRef(42), /seven_rule_violation/);
});

test("rule 3 generation: TEXT verbatim incl. leading zeros; numbers refused, never coerced", () => {
  assert.equal(transformGeneration("007"), "007");
  assert.equal(transformGeneration("0"), "0");
  assert.equal(transformGeneration(null), null);
  assert.throws(() => transformGeneration(7), /generation_must_remain_text/);
  assert.throws(() => transformGeneration(0), /generation_must_remain_text/);
  assert.throws(() => transformGeneration(true), /generation_must_remain_text/);
  // Static guard: the function itself contains no numeric coercion, so the
  // superseded integer draft cannot resurface through this code path.
  const fn = transformGeneration.toString();
  assert.ok(!/parseInt|Number\(|BigInt/.test(fn), fn);
  assert.ok(!/parseInt\(|Number\(|BigInt\(/.test(IMPORTER_SOURCE.split("transformGeneration")[1].slice(0, 400)));
});

test("rule 4 receipt_digest: verbatim when storable; BLOB / oversize defers the row with D-1", () => {
  assert.deepEqual(transformReceiptDigest("synth-digest-abc123"), { value: "synth-digest-abc123", deferred: null });
  assert.deepEqual(transformReceiptDigest(null), { value: null, deferred: null });
  const blob = transformReceiptDigest(Buffer.from([0xff, 0xfe]));
  assert.equal(blob.deferred?.reasonCode, "D-1");
  assert.equal(blob.value, null);
  const huge = transformReceiptDigest("x".repeat(2_000_001));
  assert.equal(huge.deferred?.reasonCode, "D-1");
});

test("rule 5 reason_code: text and NULL verbatim, never enum-mapped", () => {
  assert.equal(transformReasonCode("synth-ok"), "synth-ok");
  assert.equal(transformReasonCode("weird-unlisted-code"), "weird-unlisted-code");
  assert.equal(transformReasonCode(null), null);
  assert.throws(() => transformReasonCode(3), /seven_rule_violation/);
});

test("rule 6 listener_present: integers 0/1 verbatim; booleans and strings refused", () => {
  assert.equal(transformListenerPresent(0), 0);
  assert.equal(transformListenerPresent(1), 1);
  assert.throws(() => transformListenerPresent(true), /listener_present_must_be_0_or_1/);
  assert.throws(() => transformListenerPresent("1"), /listener_present_must_be_0_or_1/);
  assert.throws(() => transformListenerPresent(2), /listener_present_must_be_0_or_1/);
});

test("rule 7 credential_count: integers verbatim incl. boundaries; no truncation, no re-default", () => {
  assert.equal(transformCredentialCount(0), 0);
  assert.equal(transformCredentialCount(1), 1);
  assert.equal(transformCredentialCount(2147483647), 2147483647);
  assert.throws(() => transformCredentialCount("5"), /credential_count_must_be_integer/);
  assert.throws(() => transformCredentialCount(1.5), /credential_count_must_be_integer/);
});

// ---------------------------------------------------------------------------
// Synthetic fixture: in-memory SQLite, 70 tables
// ---------------------------------------------------------------------------

test("fixture builds all 70 tables in :memory: with >=1 synthetic row each", () => {
  const db = freshDb();
  const counts = fixtureRowCounts(db);
  assert.equal(Object.keys(counts).length, 70);
  for (const [table, n] of Object.entries(counts)) {
    assert.ok(n >= 1, `${table} has ${n} rows`);
  }
  assert.equal(counts.platform_edge_agent_leases, 1);
  assert.equal(counts.platform_edge_apply_receipts, 3);
  assert.equal(counts.platform_usage_samples, 2);
  const integrity = verifySourceIntegrity(db);
  assert.equal(integrity.ok, true);
  assert.equal(integrity.foreignKeyViolations, 0);
});

test("seven-column fixture: one lease + three receipts read back value-by-value from SQLite", () => {
  const db = freshDb();
  const lease = synthRow(db, "platform_edge_agent_leases");
  assert.equal(lease.released_at, null);
  const receipts = db.prepare(
    'SELECT * FROM "platform_edge_apply_receipts" ORDER BY rowid',
  ).all();
  assert.equal(receipts.length, 3);
  // Receipt 1: drift columns all NULL.
  assert.equal(receipts[0].node_ref, null);
  assert.equal(receipts[0].generation, null);
  assert.equal(receipts[0].receipt_digest, null);
  assert.equal(receipts[0].reason_code, null);
  assert.equal(receipts[0].listener_present, 0);
  assert.equal(receipts[0].credential_count, 0);
  // Receipt 2: populated; generation keeps its leading zero as TEXT.
  assert.equal(receipts[1].node_ref, "synth-node-001");
  assert.equal(receipts[1].generation, "007");
  assert.equal(typeof receipts[1].generation, "string");
  assert.equal(receipts[1].receipt_digest, "synth-digest-abc123");
  assert.equal(receipts[1].reason_code, "synth-ok");
  assert.equal(receipts[1].listener_present, 1);
  assert.equal(receipts[1].credential_count, 2147483647);
  // Receipt 3: digest stored as a BLOB (node:sqlite returns BLOBs as
  // Uint8Array) — not losslessly storable as TEXT.
  assert.ok(receipts[2].receipt_digest instanceof Uint8Array);
  const res = transformRow({ table: "platform_edge_apply_receipts", row: receipts[2], gates: GATES_OPEN });
  assert.equal(res.row, null);
  assert.equal(res.deferred?.reasonCode, "D-1");
  // Receipts 1 and 2 filter through, value by value — except the two
  // DEFER drift columns (P fix, CARD6 §3.3 #6/#7): listener_present
  // and credential_count carry no target value and are absent from
  // the output row, while the other drift columns still pass through.
  for (const [i, want] of [[0, receipts[0]], [1, receipts[1]]]) {
    const out = transformRow({ table: "platform_edge_apply_receipts", row: want, gates: GATES_OPEN });
    assert.equal(out.deferred, null, `receipt ${i} deferred`);
    assert.equal(out.rejected, null, `receipt ${i} rejected`);
    assert.equal(out.row.generation, want.generation);
    assert.equal(out.row.node_ref, want.node_ref);
    assert.equal(out.row.receipt_digest, want.receipt_digest);
    assert.equal(out.row.reason_code, want.reason_code);
    assert.ok(!("listener_present" in out.row), `receipt ${i} must not carry listener_present (DEFER)`);
    assert.ok(!("credential_count" in out.row), `receipt ${i} must not carry credential_count (DEFER)`);
  }
});

test("seven-column synthetic round-trip: D1 statement descriptors preserve every value in an in-memory target", (t) => {
  const db = freshDb();
  const target = new DatabaseSync(":memory:");
  try {
    // Add a second synthetic lease to cover both NULL and timestamp text.
    const leaseBase = synthRow(db, "platform_edge_agent_leases");
    const leaseColumnNames = Object.keys(leaseBase);
    const timedLease = {
      ...leaseBase,
      lease_ref: "synth-z-lease-timed-002",
      released_at: "2026-11-21T09:41:45.000Z",
    };
    db.prepare(
      "INSERT INTO platform_edge_agent_leases (" +
        leaseColumnNames.map((name) => '"' + name + '"').join(", ") +
        ") VALUES (" + leaseColumnNames.map(() => "?").join(", ") + ")",
    ).run(...leaseColumnNames.map((name) => timedLease[name]));

    const sourceLeases = db.prepare(
      'SELECT * FROM "platform_edge_agent_leases" ORDER BY lease_ref',
    ).all();
    const sourceReceipts = db.prepare(
      'SELECT * FROM "platform_edge_apply_receipts" ORDER BY id',
    ).all();
    assert.equal(sourceLeases.length, 2);
    assert.equal(sourceReceipts.length, 3);

    function createTargetTable(table) {
      const mapping = TABLE_MAPPING.find((entry) => entry.source === table);
      assert.ok(mapping, "mapping exists for " + table);
      const columns = targetColumnsFor(table);
      const definitions = columns.map((name) => {
        const column = mapping.columns.find((entry) => entry.name === name);
        assert.ok(column, "target column exists in mapping: " + table + "." + name);
        return '"' + name + '" ' + column.type + (column.pk ? " PRIMARY KEY" : "");
      });
      target.exec('CREATE TABLE "' + mapping.target + '" (' + definitions.join(", ") + ")");
    }

    createTargetTable("platform_edge_agent_leases");
    createTargetTable("platform_edge_apply_receipts");

    const transformedLeases = sourceLeases.map((row) => (
      transformRow({ table: "platform_edge_agent_leases", row, gates: GATES_OPEN })
    ));
    assert.ok(transformedLeases.every((entry) => entry.row && !entry.deferred && !entry.rejected));
    for (const entry of transformedLeases) {
      for (const statement of buildD1BatchStatements({
        table: "platform_edge_agent_leases",
        rows: [entry.row],
      })) {
        target.prepare(statement.sql).run(...statement.params);
      }
    }

    const transformedReceipts = sourceReceipts.map((row) => (
      transformRow({ table: "platform_edge_apply_receipts", row, gates: GATES_OPEN })
    ));
    assert.ok(transformedReceipts[0].row);
    assert.ok(transformedReceipts[1].row);
    assert.equal(transformedReceipts[2].row, null);
    assert.equal(transformedReceipts[2].deferred.reasonCode, "D-1");
    for (const entry of transformedReceipts.filter((item) => item.row)) {
      for (const statement of buildD1BatchStatements({
        table: "platform_edge_apply_receipts",
        rows: [entry.row],
      })) {
        target.prepare(statement.sql).run(...statement.params);
      }
    }

    const targetLeases = target.prepare(
      'SELECT * FROM "platform_edge_agent_leases" ORDER BY lease_ref',
    ).all();
    const targetReceipts = target.prepare(
      'SELECT * FROM "platform_edge_apply_receipts" ORDER BY id',
    ).all();
    assert.equal(targetLeases.length, 2);
    assert.equal(targetReceipts.length, 2);

    // Rule 1: released_at NULL and timestamp text both survive round-trip.
    assert.equal(targetLeases[0].released_at, null);
    assert.equal(targetLeases[1].released_at, "2026-11-21T09:41:45.000Z");

    // Rules 2–5: NULL and populated values survive; generation stays TEXT.
    // Rules 6–7 (P fix): the two drift columns are DEFER — they are
    // absent from the target columns and from the loaded rows.
    assert.equal(targetReceipts[0].node_ref, null);
    assert.equal(targetReceipts[0].generation, null);
    assert.equal(targetReceipts[0].receipt_digest, null);
    assert.equal(targetReceipts[0].reason_code, null);
    assert.ok(!("listener_present" in targetReceipts[0]), "listener_present is DEFER, not loaded");
    assert.ok(!("credential_count" in targetReceipts[0]), "credential_count is DEFER, not loaded");

    assert.equal(targetReceipts[1].node_ref, "synth-node-001");
    assert.equal(targetReceipts[1].generation, "007");
    assert.equal(typeof targetReceipts[1].generation, "string");
    assert.equal(targetReceipts[1].reason_code, "synth-ok");
    assert.ok(!("listener_present" in targetReceipts[1]), "listener_present is DEFER, not loaded");
    assert.ok(!("credential_count" in targetReceipts[1]), "credential_count is DEFER, not loaded");
    assert.deepEqual(
      [...Buffer.from(targetReceipts[1].receipt_digest, "utf8")],
      [...Buffer.from(sourceReceipts[1].receipt_digest, "utf8")],
    );
    assert.ok(!targetReceipts.some((row) => row.id === sourceReceipts[2].id),
      "a non-losslessly-storable digest defers the entire row");

    const leaseColumns = targetColumnsFor("platform_edge_agent_leases");
    const receiptColumns = targetColumnsFor("platform_edge_apply_receipts");
    const leaseSourceKept = transformedLeases.map((entry) => entry.row);
    const receiptSourceKept = transformedReceipts.filter((entry) => entry.row).map((entry) => entry.row);
    const leaseSourceHash = hashTableRows(leaseSourceKept, leaseColumns);
    const leaseTargetHash = hashTableRows(targetLeases, leaseColumns);
    const receiptSourceHash = hashTableRows(receiptSourceKept, receiptColumns);
    const receiptTargetHash = hashTableRows(targetReceipts, receiptColumns);
    assert.equal(leaseSourceHash, leaseTargetHash);
    assert.equal(receiptSourceHash, receiptTargetHash);

    const leaseSourceFingerprints = leaseSourceKept.map((row) => hashRow(row, leaseColumns));
    const leaseTargetFingerprints = targetLeases.map((row) => hashRow(row, leaseColumns));
    const receiptSourceFingerprints = receiptSourceKept.map((row) => hashRow(row, receiptColumns));
    const receiptTargetFingerprints = targetReceipts.map((row) => hashRow(row, receiptColumns));
    assert.deepEqual(leaseSourceFingerprints, leaseTargetFingerprints);
    assert.deepEqual(receiptSourceFingerprints, receiptTargetFingerprints);

    const runId = "load-synth-seven-column-roundtrip";
    const snapshotId = "synth-seven-column-roundtrip-20261121";
    const leaseCheckpoint = createCheckpoint({
      runId,
      snapshotId,
      snapshotRowsTotal: 5,
      batch: { batchId: "SYNTH-LEASES-001", table: "platform_edge_agent_leases", rowOffset: 0, rowCount: 2 },
      sourceCount: 2,
      loadedCount: 2,
      deferredCount: 0,
      failedCount: 0,
      sourceHash: leaseSourceHash,
      targetHash: leaseTargetHash,
      fkViolations: 0,
      status: "LOADED",
      note: "synthetic in-memory source-to-target readback",
    });
    const receiptCheckpoint = createCheckpoint({
      runId,
      snapshotId,
      snapshotRowsTotal: 5,
      batch: { batchId: "SYNTH-RECEIPTS-001", table: "platform_edge_apply_receipts", rowOffset: 0, rowCount: 3 },
      sourceCount: 3,
      loadedCount: 2,
      deferredCount: 1,
      failedCount: 0,
      sourceHash: receiptSourceHash,
      targetHash: receiptTargetHash,
      fkViolations: 0,
      status: "PENDING",
      note: "hash covers the two losslessly kept rows; third row is deferred whole with D-1",
    });
    assert.equal(leaseCheckpoint.hash_match, true);
    assert.equal(leaseCheckpoint.status, "LOADED");
    assert.equal(receiptCheckpoint.hash_match, true);
    assert.equal(receiptCheckpoint.status, "PENDING");
    assert.equal(receiptCheckpoint.deferred_count, 1);

    const evidence = {
      schemaVersion: 1,
      mode: "synthetic-only",
      runId,
      snapshotId,
      perTableCounts: {
        platform_edge_agent_leases: { source: 2, target: 2, deferred: 0 },
        platform_edge_apply_receipts: { source: 3, target: 2, deferred: 1 },
      },
      checkpoints: [leaseCheckpoint, receiptCheckpoint],
      rowFingerprints: {
        platform_edge_agent_leases: {
          source: leaseSourceFingerprints,
          target: leaseTargetFingerprints,
        },
        platform_edge_apply_receipts: {
          source: receiptSourceFingerprints,
          target: receiptTargetFingerprints,
        },
      },
      independentReviewReceipt: {
        status: "PENDING_INDEPENDENT_REVIEW",
        reviewer: null,
        reviewedAt: null,
        note: "A reviewer other than the implementation author must inspect this synthetic evidence before acceptance.",
      },
    };
    const evidenceHash = createHash("sha256")
      .update(JSON.stringify(evidence), "utf8")
      .digest("hex");
    assert.match(evidenceHash, /^[0-9a-f]{64}$/);
    assert.equal(evidence.independentReviewReceipt.status, "PENDING_INDEPENDENT_REVIEW");
    t.diagnostic("SEVEN_COLUMN_SYNTHETIC_EVIDENCE " + JSON.stringify({ ...evidence, evidenceHash }));
  } finally {
    target.close();
    db.close();
  }
});

// ---------------------------------------------------------------------------
// Filter: EXTERNALIZE / TRANSFORM / gates / guards
// ---------------------------------------------------------------------------

test("EXTERNALIZE: a non-null raw value rejects the whole row and never enters D1", () => {
  const db = freshDb();
  for (const [table, column, id] of [
    ["platform_portal_access_requests", "subscription_url", "E-03"],
    ["platform_portal_totp_credentials", "encrypted_totp_secret", "E-04"],
    ["platform_payment_receipts", "next_action_url", "E-05"],
  ]) {
    const row = synthRow(db, table, 0);
    assert.notEqual(row[column], null, `${table}.${column} fixture row 1 must carry a value`);
    const res = transformRow({ table, row, gates: GATES_OPEN });
    assert.equal(res.row, null);
    assert.equal(res.rejected?.code, "externalized_value_present");
    assert.equal(res.rejected?.id, id);
    const clean = synthRow(db, table, 1);
    assert.equal(clean[column], null);
    const ok = transformRow({ table, row: clean, gates: GATES_OPEN });
    assert.equal(ok.rejected, null);
    assert.ok(!(column in (ok.row ?? {})), `${column} must not appear in the output row`);
  }
  assert.equal(EXTERNALIZE_SOURCE_COLUMNS.length, 8);
});

test("TRANSFORM digest-only: raw idempotency key becomes a digest, raw never leaves", () => {
  const db = freshDb();
  const row = synthRow(db, "platform_coin_operation_receipts", 0);
  const res = transformRow({ table: "platform_coin_operation_receipts", row, gates: GATES_OPEN });
  assert.equal(res.rejected, null);
  assert.ok(!("idempotency_key" in res.row));
  assert.match(res.row.idempotency_key_digest ?? "", /^[0-9a-f]{64}$/);
  assert.equal(res.row.idempotency_key_digest, createHash("sha256")
    .update(`d1-card7-synthetic-digest:platform_coin_operation_receipts:idempotency_key:${row.idempotency_key}`, "utf8")
    .digest("hex"));
  const stmts = buildD1BatchStatements({ table: "platform_coin_operation_receipts", rows: [res.row] });
  assert.ok(stmts[0].sql.includes('"idempotency_key_digest"'));
  assert.ok(!stmts[0].sql.includes('"idempotency_key"'));
});

test("TRANSFORM JSON: metadata_json is validated against its versioned schema and normalized with sorted keys; invalid JSON fails", () => {
  const db = freshDb();
  // A schema-valid fulfillment metadata value normalizes with sorted keys.
  const row = {
    ...synthRow(db, "platform_audit_events", 0),
    metadata_json: '{"targetValidUntil":"2026-12-21T00:00:00.000Z","version":1,"commandRef":"synth-command-0","orderRef":"synth-order-0","accountId":"synth-account-0","requestRef":"synth-request-0","entitlementRef":"synth-entitlement-0","issuedLinkRef":"synth-issued-link-0","tenantRef":"synth-tenant-0","artifactRef":"synth-artifact-0","offerVersionRef":"synth-offer-version-0","portalPlan":"monthly","durationDays":30,"monthlyTrafficGb":50,"trafficLimitBytes":53687091200,"validFrom":"2026-11-21T00:00:00.000Z","previousValidUntil":"2026-11-21T00:00:00.000Z"}',
  };
  const res = transformRow({ table: "platform_audit_events", row, gates: GATES_OPEN });
  assert.equal(res.rejected, null);
  assert.equal(JSON.parse(res.row.metadata_json).commandRef, "synth-command-0");
  assert.deepEqual(Object.keys(JSON.parse(res.row.metadata_json)), [...Object.keys(JSON.parse(res.row.metadata_json))].sort());
  const bad = { ...row, metadata_json: "{not json" };
  assert.throws(() => transformRow({ table: "platform_audit_events", row: bad, gates: GATES_OPEN }), /json_transform_invalid/);
});

test("TRANSFORM JSON (O): unknown and sensitive fields reject the row for every schema column", () => {
  const db = freshDb();
  const cases = [
    {
      table: "platform_audit_events", column: "metadata_json",
      valid: '{"version":1,"commandRef":"synth-command-0","orderRef":"synth-order-0","accountId":"synth-account-0","requestRef":"synth-request-0","entitlementRef":"synth-entitlement-0","issuedLinkRef":"synth-issued-link-0","tenantRef":"synth-tenant-0","artifactRef":"synth-artifact-0","offerVersionRef":"synth-offer-version-0","portalPlan":"monthly","durationDays":30,"monthlyTrafficGb":50,"trafficLimitBytes":53687091200,"validFrom":"2026-11-21T00:00:00.000Z","previousValidUntil":"2026-11-21T00:00:00.000Z","targetValidUntil":"2026-12-21T00:00:00.000Z"}',
      unknown: '{"version":1,"surpriseField":1}',
      sensitive: '{"version":1,"apiToken":"synth-should-never-load"}',
    },
    {
      table: "platform_coin_commerce_fulfillment_commands", column: "payload_json",
      valid: '{"offerVersionRef":"synth-offer-version-0","delivery":{"kind":"subscription_plan","durationDays":30,"monthlyTrafficGb":50,"trafficGb":null,"neverExpires":false,"discountBasisPoints":0}}',
      unknown: '{"offerVersionRef":"synth-offer-version-0","delivery":{"kind":"subscription_plan","durationDays":30,"monthlyTrafficGb":50,"trafficGb":null,"neverExpires":false,"discountBasisPoints":0},"extra":1}',
      sensitive: '{"offerVersionRef":"synth-offer-version-0","delivery":{"kind":"subscription_plan","durationDays":30,"monthlyTrafficGb":50,"trafficGb":null,"neverExpires":false,"discountBasisPoints":0},"password":"x"}',
    },
    {
      table: "platform_edge_registered_nodes", column: "metadata_json",
      valid: `{"source":"node-image-first-boot-packet","receiptGateRequired":true,"imageSafeConfirmed":true,"artifactHashRecorded":false,"wireguardPlanRef":"synth-wg-plan-0","wireguardPublicKeyFingerprint":"sha256:${"a".repeat(64)}","agentAuthFingerprint":"sha256:${"b".repeat(64)}"}`,
      unknown: '{"source":"node-image-first-boot-packet","receiptGateRequired":true,"imageSafeConfirmed":true,"artifactHashRecorded":false,"wireguardPlanRef":"synth-wg-plan-0","mysteryField":"x"}',
      sensitive: '{"source":"node-image-first-boot-packet","receiptGateRequired":true,"imageSafeConfirmed":true,"artifactHashRecorded":false,"wireguardPlanRef":"synth-wg-plan-0","secret":"x"}',
    },
    {
      table: "platform_issuance_requests", column: "metadata_json",
      valid: '{"cli":"platform:issue-subscription"}',
      unknown: '{"cli":"platform:issue-subscription","mystery":1}',
      sensitive: '{"cli":"platform:issue-subscription","credential":"x"}',
    },
    {
      table: "platform_portal_access_requests", column: "event_json",
      valid: '{"type":"delivery_generation_reissued","occurredAt":"2026-11-21T00:00:00.000Z"}',
      unknown: '{"type":"delivery_generation_reissued","occurredAt":"2026-11-21T00:00:00.000Z","extra":1}',
      sensitive: '{"type":"delivery_generation_reissued","occurredAt":"2026-11-21T00:00:00.000Z","token":"x"}',
    },
  ];
  for (const { table, column, valid, unknown, sensitive } of cases) {
    // Fixture row 1: row 0 of portal_access_requests carries a
    // non-null EXTERNALIZE subscription_url, which rejects the row
    // before the JSON column is even reached.
    const base = synthRow(db, table, 1);
    const ok = transformRow({ table, row: { ...base, [column]: valid }, gates: GATES_OPEN });
    assert.equal(ok.rejected, null, `${table}.${column} valid value must load`);
    assert.equal(typeof ok.row[column], "string", `${table}.${column} must normalize to a string`);
    assert.throws(
      () => transformRow({ table, row: { ...base, [column]: unknown }, gates: GATES_OPEN }),
      /json_unknown_field/,
      `${table}.${column} must reject unknown fields`,
    );
    assert.throws(
      () => transformRow({ table, row: { ...base, [column]: sensitive }, gates: GATES_OPEN }),
      /json_sensitive_field/,
      `${table}.${column} must reject sensitive fields`,
    );
  }
});

test("TRANSFORM JSON (O rework): real-row shapes from the r2 snapshot load — kind-conditional delivery, portal '{}' / old_link_invalidated, account + wallet-first audit, bind-existing edge", () => {
  const db = freshDb();
  const load = (table, column, value, rowIndex = 1) => {
    const base = synthRow(db, table, rowIndex);
    return transformRow({ table, row: { ...base, [column]: value }, gates: GATES_OPEN });
  };
  const reject = (table, column, value, pattern, rowIndex = 1) => {
    assert.throws(() => load(table, column, value, rowIndex), pattern, `${table}.${column} ${value} must reject`);
  };
  // Fulfillment: subscription_plan carries trafficGb null (real rows);
  // data_pack carries durationDays/monthlyTrafficGb null.
  const plan = '{"offerVersionRef":"synth-offer-version-0","delivery":{"kind":"subscription_plan","durationDays":30,"monthlyTrafficGb":50,"trafficGb":null,"neverExpires":false,"discountBasisPoints":0}}';
  const pack = '{"offerVersionRef":"synth-offer-version-0","delivery":{"kind":"data_pack","durationDays":null,"monthlyTrafficGb":null,"trafficGb":100,"neverExpires":true,"discountBasisPoints":null}}';
  assert.equal(load("platform_coin_commerce_fulfillment_commands", "payload_json", plan).rejected, null);
  assert.equal(load("platform_coin_commerce_fulfillment_commands", "payload_json", pack).rejected, null);
  reject("platform_coin_commerce_fulfillment_commands", "payload_json",
    '{"offerVersionRef":"synth-offer-version-0","delivery":{"kind":"subscription_plan","durationDays":30,"monthlyTrafficGb":50,"trafficGb":50,"neverExpires":false,"discountBasisPoints":0}}',
    /trafficGb must be null/);
  reject("platform_coin_commerce_fulfillment_commands", "payload_json",
    '{"offerVersionRef":"synth-offer-version-0","delivery":{"kind":"data_pack","durationDays":30,"monthlyTrafficGb":null,"trafficGb":100,"neverExpires":true,"discountBasisPoints":null}}',
    /durationDays must be null/);
  reject("platform_coin_commerce_fulfillment_commands", "payload_json",
    '{"offerVersionRef":"synth-offer-version-0","delivery":{"kind":"other","durationDays":30,"monthlyTrafficGb":50,"trafficGb":null,"neverExpires":false,"discountBasisPoints":0}}',
    /kind must be subscription_plan or data_pack/);
  // Portal: '{}' is the no-event encoding; old_link_invalidated is live.
  assert.equal(load("platform_portal_access_requests", "event_json", "{}").rejected, null);
  assert.equal(load("platform_portal_access_requests", "event_json", '{"type":"old_link_invalidated","occurredAt":"2026-11-21T00:00:00.000Z"}').rejected, null);
  // Audit: account shape + wallet-first prepared shape (initial_activation).
  assert.equal(load("platform_audit_events", "metadata_json", '{"approvalRef":"approval_local_user_lifecycle","reasonProvided":true}').rejected, null);
  reject("platform_audit_events", "metadata_json", '{"approvalRef":"approval_local_user_lifecycle","reasonProvided":"yes"}', /reasonProvided must be a boolean/);
  const walletFirstPrepared = JSON.stringify({
    version: 1, transitionRef: "synth-transition-0", accountId: "synth-account-0",
    flowKind: "initial_activation", offerVersionRef: "synth-offer-version-0",
    durationDays: 30, monthlyTrafficGb: 50, portalPlan: "monthly",
    scheduledFor: "2026-11-21T00:00:00.000Z", activationAt: "2026-11-21T00:00:00.000Z",
    validUntil: "2026-12-21T00:00:00.000Z", effectRef: "synth-effect-0",
    entitlementId: "synth-entitlement-0", requestId: "synth-request-0",
    issuedLinkId: "synth-issued-link-0", nodeId: "synth-node-0",
    accountDigest: "a".repeat(64),
    expectedEntitlementId: null, expectedRequestId: null, expectedIssuedLinkId: null,
    expectedValidUntil: null, currentTenantRef: null, currentArtifactRef: null,
    currentInitialTransitionRef: null,
  });
  assert.equal(load("platform_audit_events", "metadata_json", walletFirstPrepared).rejected, null);
  reject("platform_audit_events", "metadata_json",
    walletFirstPrepared.replace('"initial_activation"', '"other_flow"'), /flowKind must be/);
  // Edge: bind-existing-reviewed-node shape (real node-sgp-a row) loads
  // alongside the first-boot shape.
  const bindExisting = '{"source":"bind-existing-reviewed-node","registrationMode":"bind-existing-reviewed-node-only","poolRef":"pool-stable","receiptGateRequired":true,"protectedRefSet":"existing-protected-key-digest-refs","keyDigestRefsReviewed":true,"nodeAuthDigestPresent":true,"noRuntimeMaterialStored":true}';
  assert.equal(load("platform_edge_registered_nodes", "metadata_json", bindExisting).rejected, null);
  reject("platform_edge_registered_nodes", "metadata_json",
    bindExisting.replace('"pool-stable"', '"pool-other"').replace('"bind-existing-reviewed-node-only"', '"other-mode"'),
    /registrationMode must be/);
});

test("TRANSFORM JSON (O): every TRANSFORM JSON column has a registered versioned schema", () => {
  const db = freshDb();
  void db;
  for (const [table, column] of [
    ["platform_audit_events", "metadata_json"],
    ["platform_coin_commerce_fulfillment_commands", "payload_json"],
    ["platform_edge_registered_nodes", "metadata_json"],
    ["platform_issuance_requests", "metadata_json"],
    ["platform_portal_access_requests", "event_json"],
  ]) {
    assert.equal(controlledJsonSchemaVersion(table, column), 1, `${table}.${column} must carry schema version 1`);
  }
  assert.equal(controlledJsonSchemaVersion("platform_audit_events", "no_such_column"), null);
});

test("M1-02: platform_accounts.metadata_json is never loaded", () => {
  const db = freshDb();
  const row = synthRow(db, "platform_accounts", 0);
  assert.equal(typeof row.metadata_json, "string");
  const res = transformRow({ table: "platform_accounts", row, gates: GATES_OPEN });
  assert.equal(res.rejected, null);
  assert.ok(!("metadata_json" in res.row));
  assert.ok(!targetColumnsFor("platform_accounts").includes("metadata_json"));
});

test("gates are fail-closed by default: ledger D-3, password D-2, legacy CONDITIONAL-GATE", () => {
  const db = freshDb();
  const ledger = transformRow({ table: "platform_coin_ledger_entries", row: synthRow(db, "platform_coin_ledger_entries", 0), gates: {} });
  assert.equal(ledger.deferred?.reasonCode, "D-3");
  const pw = transformRow({ table: "platform_portal_password_credentials", row: synthRow(db, "platform_portal_password_credentials", 0), gates: {} });
  assert.equal(pw.deferred?.reasonCode, "D-2");
  const legacy = transformRow({ table: "platform_payment_orders_legacy_archive_20260803", row: synthRow(db, "platform_payment_orders_legacy_archive_20260803", 0), gates: {} });
  assert.equal(legacy.deferred?.reasonCode, "CONDITIONAL-GATE");
  // With the gates explicitly passed, the same rows load. (The legacy
  // gates-open check uses fixture row 2: row 1 carries E-06/E-07 values
  // and is rejected as EXTERNALIZE before any gate can pass it.)
  assert.notEqual(transformRow({ table: "platform_coin_ledger_entries", row: synthRow(db, "platform_coin_ledger_entries", 0), gates: GATES_OPEN }).row, null);
  assert.notEqual(transformRow({ table: "platform_portal_password_credentials", row: synthRow(db, "platform_portal_password_credentials", 0), gates: GATES_OPEN }).row, null);
  assert.notEqual(transformRow({ table: "platform_payment_orders_legacy_archive_20260803", row: synthRow(db, "platform_payment_orders_legacy_archive_20260803", 1), gates: GATES_OPEN }).row, null);
});

test("password value never enters the reconciliation hash input (CodeQL js/insufficient-password-hash false positive)", () => {
  const db = freshDb();
  const row = synthRow(db, "platform_portal_password_credentials", 0);
  assert.notEqual(row.password_hash, null, "fixture row 1 must carry a password_hash value");
  // Even with the gate explicitly open, every column of this table is
  // DEFER, so the output row is empty — the password value is dropped.
  const res = transformRow({ table: "platform_portal_password_credentials", row, gates: GATES_OPEN });
  assert.equal(res.deferred, null);
  assert.equal(res.rejected, null);
  assert.deepEqual(Object.keys(res.row ?? {}), []);
  assert.ok(!("password_hash" in (res.row ?? {})), "password_hash must not appear in the output row");
  assert.ok(!JSON.stringify(res.row).includes(row.password_hash), "password value must not appear in the output row");
  // targetColumnsFor excludes every DEFER column, so the reconciliation
  // hash input for this table is empty — hashTableRows/hashRow can never
  // hash the password value. The SHA-256 in sha256Hex is a row
  // reconciliation fingerprint over synthetic data, not credential storage.
  assert.deepEqual(targetColumnsFor("platform_portal_password_credentials"), []);
  assert.equal(hashRow(res.row, targetColumnsFor("platform_portal_password_credentials")), hashRowValues([]));
});

test("DEFER / CREATE-EMPTY / NOT-IN-DDL tables defer whole rows, never silently drop", () => {
  const db = freshDb();
  const deferred = transformRow({ table: "platform_deferred_resource_transitions", row: synthRow(db, "platform_deferred_resource_transitions", 0), gates: GATES_OPEN });
  assert.equal(deferred.deferred?.reasonCode, "TABLE-DEFERRED");
  const empty = transformRow({ table: "platform_data_pack_resources", row: synthRow(db, "platform_data_pack_resources", 0), gates: GATES_OPEN });
  assert.equal(empty.deferred?.reasonCode, "TABLE-NOT-LOADED");
  const notInDdl = transformRow({ table: "platform_leads", row: synthRow(db, "platform_leads", 0), gates: GATES_OPEN });
  assert.equal(notInDdl.deferred?.reasonCode, "TABLE-NOT-LOADED");
});

test("CONDITIONAL columns are omitted and recorded, never silently copied as KEEP", () => {
  const db = freshDb();
  const res = transformRow({ table: "platform_edge_desired_state_notifications", row: synthRow(db, "platform_edge_desired_state_notifications", 0), gates: GATES_OPEN });
  assert.equal(res.rejected, null);
  assert.ok(res.deferredColumns.includes("reason"));
  assert.ok(!("reason" in res.row));
});

test("guards: unknown column rejected, missing NOT NULL rejected, samples refused", () => {
  const db = freshDb();
  const row = { ...synthRow(db, "platform_accounts", 0), mystery_column: "x" };
  assert.equal(transformRow({ table: "platform_accounts", row, gates: GATES_OPEN }).rejected?.code, "unknown_source_column");
  const missing = { ...synthRow(db, "platform_accounts", 0) };
  delete missing.owner_ref;
  assert.equal(transformRow({ table: "platform_accounts", row: missing, gates: GATES_OPEN }).rejected?.code, "missing_required_column");
  assert.throws(() => countSourceRows(db, "platform_usage_samples"), /samples_table_excluded/);
  assert.throws(() => readSourcePage(db, "platform_usage_samples"), /samples_table_excluded/);
  assert.throws(() => readSourcePage(db, "platform_no_such_table"), /unknown_source_table/);
});

// ---------------------------------------------------------------------------
// Count / hash reconciliation (Card 6 §6.2)
// ---------------------------------------------------------------------------

test("hash: NULL is the literal 6-char \\0NULL, integers are decimal text, '007' != 7", () => {
  assert.equal(hashRowValues([null]), createHash("sha256").update("\\0NULL", "utf8").digest("hex"));
  assert.equal(hashRowValues([7]), hashRowValues(["7"]));
  assert.notEqual(hashRowValues(["007"]), hashRowValues([7]));
  assert.notEqual(hashRowValues([null]), hashRowValues([""]));
});

test("hash: table hash is PK-ordered, database hash is name-ordered and deterministic", () => {
  const cols = ["id", "generation"];
  const rows = [
    { id: "b", generation: "007" },
    { id: "a", generation: null },
  ];
  const forward = hashTableRows(rows, cols);
  const sorted = hashTableRows([...rows].sort((x, y) => x.id.localeCompare(y.id)), cols);
  assert.notEqual(forward, sorted, "row order must change the table hash");
  assert.equal(hashDatabase({ b: "x", a: "y" }), hashDatabase({ a: "y", b: "x" }));
  assert.equal(hashRow({ id: "a", generation: "007" }, cols), hashRowValues(["a", "007"]));
});

// ---------------------------------------------------------------------------
// Checkpoint resume + idempotency
// ---------------------------------------------------------------------------

test("checkpoint resume: LOADED skipped, FAILED re-run, snapshot change voids the run", () => {
  const plan = firstBatchPlan();
  const mk = (batch, status, snapshotId = SNAPSHOT_ID) => createCheckpoint({
    runId: "load-synth-001", snapshotId, snapshotRowsTotal: 6848, batch,
    sourceCount: batch.rowCount, loadedCount: status === "LOADED" ? batch.rowCount : 0,
    deferredCount: 0, failedCount: status === "FAILED" ? 1 : 0,
    sourceHash: null, targetHash: null, fkViolations: 0, status,
  });
  const checkpoints = [
    mk(plan[0], "LOADED"),
    mk(plan[1], "LOADED"),
    mk(plan[2], "FAILED"),
  ];
  const resumed = resumePlan({ plan, checkpoints });
  assert.equal(resumed.voided, false);
  assert.deepEqual(resumed.skippedLoaded, ["B-001", "B-002"]);
  assert.ok(resumed.toRun.some((b) => b.batchId === "B-003"), "FAILED batch re-runs whole");
  assert.ok(!resumed.toRun.some((b) => b.batchId === "B-001"));
  assert.ok(resumed.toRun.length < plan.length);

  const voided = resumePlan({ plan, checkpoints: [mk(plan[0], "LOADED"), mk(plan[1], "LOADED", "other-snapshot")] });
  assert.equal(voided.voided, true);
  assert.deepEqual(voided.toRun, []);
});

test("checkpoint resume: a split ring group blocks both ring batches for manual handling", () => {
  const plan = firstBatchPlan();
  const ring = plan.filter((b) => b.ringGroup);
  assert.equal(ring.length, 2);
  const mk = (batch, status) => createCheckpoint({
    runId: "load-synth-001", snapshotId: SNAPSHOT_ID, snapshotRowsTotal: 6848, batch,
    sourceCount: batch.rowCount, loadedCount: status === "LOADED" ? batch.rowCount : 0,
    deferredCount: 0, failedCount: 0, sourceHash: null, targetHash: null, fkViolations: 0, status,
  });
  const resumed = resumePlan({ plan, checkpoints: [mk(ring[0], "LOADED")] });
  assert.ok(resumed.blocked.includes(ring[0].batchId));
  assert.ok(resumed.blocked.includes(ring[1].batchId));
  assert.ok(!resumed.toRun.some((b) => b.ringGroup));
});

test("idempotency: verifyBatchApplied distinguishes applied / hash-mismatch / not-applied", () => {
  const applied = [{ batchId: "B-001", contentHash: "abc" }];
  assert.deepEqual(verifyBatchApplied({ appliedBatches: applied, batchId: "B-001", contentHash: "abc" }), { applied: true, hashMatch: true });
  assert.deepEqual(verifyBatchApplied({ appliedBatches: applied, batchId: "B-001", contentHash: "zzz" }), { applied: true, hashMatch: false });
  assert.deepEqual(verifyBatchApplied({ appliedBatches: applied, batchId: "B-002", contentHash: "abc" }), { applied: false, hashMatch: null });
});

// ---------------------------------------------------------------------------
// Executor interface: allowlist only, no execution
// ---------------------------------------------------------------------------

test("executor allowlist: only the exact E4 triple passes; anything else refused pre-request", () => {
  assert.equal(assertE4Target(E4_TARGET), true);
  assert.equal(assertE4Target({ databaseId: "05732071-22a5-4e04-834c-f5dd4407a462", databaseName: "flylink-control-migration-e4", accountId: "17d66c001f9d851fa0d5a88cd311c2c0" }), true);
  for (const bad of [
    { databaseId: "00000000-0000-0000-0000-000000000000", databaseName: "flylink-control-migration-e4", accountId: "17d66c001f9d851fa0d5a88cd311c2c0" },
    { databaseId: "05732071-22a5-4e04-834c-f5dd4407a462", databaseName: "flylink-control-migration-staging", accountId: "17d66c001f9d851fa0d5a88cd311c2c0" },
    { databaseId: "05732071-22a5-4e04-834c-f5dd4407a462", databaseName: "flylink-control-migration-e4", accountId: "other-account" },
    null,
  ]) {
    assert.throws(() => assertE4Target(bad), /e4_target_not_allowed/);
  }
});

test("executor: buildD1BatchStatements respects the 100-param / 100KB limits; execute always refuses", () => {
  const db = freshDb();
  const row = transformRow({ table: "platform_accounts", row: synthRow(db, "platform_accounts", 0), gates: GATES_OPEN }).row;
  const stmts = buildD1BatchStatements({ table: "platform_accounts", rows: [row] });
  assert.equal(stmts.length, 1);
  assert.ok(stmts[0].sql.startsWith('INSERT INTO "platform_accounts"'));
  assert.ok(stmts[0].params.length <= 100);
  assert.ok(Buffer.byteLength(stmts[0].sql, "utf8") <= 100_000);
  assert.throws(() => executeD1Batch(), /e4_executor_not_connected/);
  assert.throws(() => buildD1BatchStatements({ table: "platform_ads_click_consent_claims", rows: [{}] }), /e4_target_not_allowed/);
});

test("importer module performs no network I/O", () => {
  assert.ok(!/fetch\s*\(|node:https|node:http|undici|XMLHttpRequest/.test(IMPORTER_SOURCE));
});

test("checkpoint hash_match is null when either hash is missing (C-1)", () => {
  const plan = firstBatchPlan();
  const batch = plan[0];
  const mk = (sourceHash, targetHash) => createCheckpoint({
    runId: "load-synth-001", snapshotId: SNAPSHOT_ID, snapshotRowsTotal: 6848, batch,
    sourceCount: 1, loadedCount: 1, deferredCount: 0, failedCount: 0,
    sourceHash, targetHash, fkViolations: 0, status: "LOADED",
  });
  assert.equal(mk(null, null).hash_match, null, "no hash on either side is unknown, not a match");
  assert.equal(mk(undefined, undefined).hash_match, null);
  assert.equal(mk("abc", null).hash_match, null);
  assert.equal(mk(null, "abc").hash_match, null);
  assert.equal(mk("abc", "abc").hash_match, true);
  assert.equal(mk("abc", "zzz").hash_match, false);
});

// ---------------------------------------------------------------------------
// Full synthetic dry run
// ---------------------------------------------------------------------------

test("full synthetic dry run (gates open): checkpoints record actual rows, deterministic hash, 4 rejections", () => {
  const db = freshDb();
  const run = runSyntheticLoad({ db, snapshotId: SNAPSHOT_ID, sha256: SNAPSHOT_SHA, gates: GATES_OPEN });
  assert.equal(run.planBatchCount, 103);
  assert.equal(run.checkpoints.length, 103);
  // Checkpoint counts are this run's actual synthetic outcome, not the
  // snapshot plan counts (C-1): checkpoint loaded/deferred/failed sums
  // reconcile with the run totals for the 50 planned tables. The 44
  // TABLE-NOT-LOADED rows of the 22 non-first-batch tables and the 2
  // excluded samples rows have no plan batch, so checkpoint source rows
  // total 106 (= 152 - 44 - 2), and checkpoint deferred is 13 (= 57 - 44),
  // all of it D-1 (1) + SOURCE-INVENTORY-GAP (12).
  const sum = (f) => run.checkpoints.reduce((n, c) => n + c[f], 0);
  assert.equal(sum("loaded_count"), 89);
  assert.equal(sum("loaded_count"), run.totals.loadedRows);
  assert.equal(sum("deferred_count"), 13);
  assert.equal(sum("failed_count"), 4);
  assert.equal(sum("failed_count"), run.totals.rejectedRows);
  assert.equal(sum("source_count"), 106);
  assert.ok(run.checkpoints.every((c) => c.loaded_count <= c.source_count));
  assert.ok(run.checkpoints.every((c) => c.hash_match === null), "no hashes in a synthetic dry run, so hash_match is null, never true");
  // No checkpoint may claim a snapshot-scale load: the largest snapshot
  // batch is 100 rows, but the fixture holds at most 2 rows per table,
  // so no checkpoint loads more than 2 rows.
  assert.ok(run.checkpoints.every((c) => c.loaded_count <= 2));
  // A LOADED checkpoint means every actual row in that batch loaded;
  // a batch with any deferred / rejected row is PENDING and re-runs.
  assert.ok(run.checkpoints.every((c) => c.status === "LOADED"
    ? (c.source_count > 0 && c.loaded_count === c.source_count && c.deferred_count === 0 && c.failed_count === 0)
    : c.status === "PENDING"));
  const resumed = resumePlan({ plan: firstBatchPlan(), checkpoints: run.checkpoints });
  assert.ok(!resumed.skippedLoaded.includes("B-007"), "receipts first batch has a deferred row, must not be skipped");
  // Review §6 three mismatch cases, re-checked against actuals:
  // (1) receipts B-007..B-022 claimed 1,513 loaded; actual 2 loaded / 1 deferred.
  const receiptCps = run.checkpoints.filter((c) => c.table === "platform_edge_apply_receipts");
  assert.equal(receiptCps.length, 16);
  assert.equal(sumCp(receiptCps, "loaded_count"), 2);
  assert.equal(sumCp(receiptCps, "deferred_count"), 1);
  assert.equal(receiptCps[0].loaded_count, 2);
  assert.equal(receiptCps[0].deferred_count, 1);
  assert.equal(receiptCps[0].status, "PENDING");
  assert.ok(receiptCps.slice(1).every((c) => c.loaded_count === 0 && c.source_count === 0));
  // (2) archive B-029 claimed 33/33 loaded; actual 1 loaded / 1 rejected.
  const archiveCp = run.checkpoints.find((c) => c.table === "platform_payment_orders_legacy_archive_20260803");
  assert.equal(archiveCp.loaded_count, 1);
  assert.equal(archiveCp.failed_count, 1);
  assert.equal(archiveCp.source_count, 2);
  assert.equal(archiveCp.status, "PENDING");
  // (3) G-1 desired_states B-027 claimed 3/3 loaded; actual 0 loaded / 3 deferred.
  const desiredCp = run.checkpoints.find((c) => c.table === "platform_edge_desired_states");
  assert.equal(desiredCp.loaded_count, 0);
  assert.equal(desiredCp.deferred_count, 3);
  assert.equal(desiredCp.source_count, 3);
  assert.equal(desiredCp.status, "PENDING");
  assert.equal(run.integrity.ok, true);
  assert.match(run.databaseHash, /^[0-9a-f]{64}$/);
  // 140 fixture rows + 12 DDL-only snapshot rows.
  assert.equal(run.totals.sourceRows, 152);
  // 4 EXTERNALIZE rejections: E-03, E-04, E-05, E-06 (row 1 of each table;
  // the legacy row carries both E-06 and E-07 values and is rejected once).
  assert.equal(run.totals.rejectedRows, 4);
  assert.deepEqual(run.rejected.map((r) => r.id).sort(), ["E-03", "E-04", "E-05", "E-06"]);
  // Samples table: 2 fixture rows, 0 loaded, recorded as excluded.
  const samples = run.perTable.find((t) => t.table === "platform_usage_samples");
  assert.equal(samples.excluded, true);
  assert.equal(samples.loadedRows, 0);
  assert.equal(samples.sourceRows, 2);
  // DDL-only tables: planned but source-absent (gap G-1).
  for (const extra of CARD6_DDL_ONLY_TABLES) {
    const entry = run.perTable.find((t) => t.table === extra.source);
    assert.equal(entry.sourceAbsentFromBaseline, true);
    assert.equal(entry.loadedRows, 0);
  }
  // Receipts: 3 fixture rows -> 2 loaded, 1 deferred D-1.
  const receipts = run.perTable.find((t) => t.table === "platform_edge_apply_receipts");
  assert.equal(receipts.sourceRows, 3);
  assert.equal(receipts.loadedRows, 2);
  assert.ok(run.deferred.some((d) => d.table === "platform_edge_apply_receipts" && d.reasonCode === "D-1"));
  // Determinism: a second identical run hashes identically.
  const again = runSyntheticLoad({ db, snapshotId: SNAPSHOT_ID, sha256: SNAPSHOT_SHA, gates: GATES_OPEN });
  assert.equal(again.databaseHash, run.databaseHash);
  assert.equal(again.totals.loadedRows, run.totals.loadedRows);
});

test("full synthetic dry run (gates closed): ledger, password and legacy rows defer, nothing loads past a gate", () => {
  const db = freshDb();
  const run = runSyntheticLoad({ db, snapshotId: SNAPSHOT_ID, sha256: SNAPSHOT_SHA, gates: {} });
  const codes = run.deferred.map((d) => `${d.table}:${d.reasonCode}`);
  assert.ok(codes.some((c) => c === "platform_coin_ledger_entries:D-3"));
  assert.ok(codes.some((c) => c === "platform_portal_password_credentials:D-2"));
  assert.ok(codes.some((c) => c === "platform_payment_orders_legacy_archive_20260803:CONDITIONAL-GATE"));
  const ledger = run.perTable.find((t) => t.table === "platform_coin_ledger_entries");
  assert.equal(ledger.loadedRows, 0);
  const pw = run.perTable.find((t) => t.table === "platform_portal_password_credentials");
  assert.equal(pw.loadedRows, 0);
  // Checkpoints agree with the closed-gate run too: 84 loaded, no
  // checkpoint claims a snapshot-scale load.
  assert.equal(sumCp(run.checkpoints, "loaded_count"), 84);
  assert.equal(sumCp(run.checkpoints, "loaded_count"), run.totals.loadedRows);
  assert.ok(run.checkpoints.every((c) => c.loaded_count <= 2));
  assert.ok(run.checkpoints.every((c) => c.hash_match === null));
});

test("synthetic values are deterministic helpers, not real data", () => {
  assert.equal(syntheticValueFor("platform_accounts", "id", 0), "synth-platform_accounts-id-0");
  assert.equal(syntheticValueFor("platform_edge_apply_receipts", "generation", 1), "007");
});
