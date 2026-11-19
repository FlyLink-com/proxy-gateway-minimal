// Stage 2B: *synthetic-only* incremental update/delete replay.
//
// This is not CDC: both before/after states are immutable, caller-provided
// local test fixtures, not remote BWH snapshots. The source-side durable
// ordered delta journal and U-F18 credential rotation parity remain OPEN.
// This module is Node tooling only, never an HTTP Worker route.
import { createHash } from "node:crypto";
import {
  approvedSyntheticColumns,
  normalizeSyntheticPlan,
  reconcileSyntheticRehearsal,
  verifySyntheticCheckpointSet,
  Stage2RehearsalError,
} from "./offline-rehearsal.mjs";

const fail = (code) => { throw new Stage2RehearsalError(code); };
const canonical = (x) => {
  if (x === null || typeof x !== "object") return JSON.stringify(x);
  if (Array.isArray(x)) return "[" + x.map(canonical).join(",") + "]";
  return "{" + Object.keys(x).sort().map(k => JSON.stringify(k) + ":" + canonical(x[k])).join(",") + "}";
};
const hash = x => createHash("sha256").update(canonical(x), "utf8").digest("hex");
const sourceOrder = ["platform_accounts", "platform_entitlements"];
const deleteOrder = [...sourceOrder].reverse();

function createChanges(before, after) {
  const oldTables = new Map(before.tables.map(t => [t.name, t.rows]));
  const newTables = new Map(after.tables.map(t => [t.name, t.rows]));
  const phases = [];
  for (const name of deleteOrder) {
    if (!oldTables.has(name)) continue;
    const next = new Map(newTables.get(name).map(r => [r.id, r]));
    const rows = oldTables.get(name).filter(r => !next.has(r.id))
      .map(row => ({ kind: "delete", pk: row.id, before: row }));
    phases.push({ key: "delta/delete/" + name, name, rows });
  }
  for (const name of sourceOrder) {
    if (!oldTables.has(name)) continue;
    const old = new Map(oldTables.get(name).map(r => [r.id, r]));
    const rows = newTables.get(name).filter(r =>
      !old.has(r.id) || canonical(old.get(r.id)) !== canonical(r)
    ).map(row => ({ kind: old.has(row.id) ? "update" : "insert",
      pk: row.id, before: old.get(row.id) ?? null, after: row }));
    phases.push({ key: "delta/upsert/" + name, name, rows });
  }
  return phases;
}

function groups(rows, batchSize) {
  const batches = [];
  for (let i = 0; i < rows.length; i += batchSize) batches.push(rows.slice(i, i + batchSize));
  return batches;
}

function exactRowGuard(db, table, row) {
  const columns = approvedSyntheticColumns(table);
  // The local table has CHECK(value=1). Insert zero only when an exact
  // expected old row is absent. Its CHECK failure aborts this D1 batch
  // including any preceding writes and its checkpoint.
  return db.prepare(
    "INSERT INTO stage2_rehearsal_assertions(value) SELECT 0 WHERE NOT EXISTS " +
    "(SELECT 1 FROM " + table + " WHERE " +
    columns.map(c => '"' + c + '" IS ?').join(" AND ") + ")"
  ).bind(...columns.map(c => row[c]));
}

function mutations(db, table, op) {
  const cols = approvedSyntheticColumns(table);
  if (op.kind === "insert") {
    const params = cols.map(c => op.after[c]);
    return [db.prepare(
      "INSERT INTO " + table + "(" + cols.map(c => '"' + c + '"').join(",") + ") " +
      "SELECT " + cols.map(() => "?").join(",") + " WHERE NOT EXISTS " +
      "(SELECT 1 FROM " + table + " WHERE " + cols.map(c => '"' + c + '" IS ?').join(" AND ") + ")"
    ).bind(...params, ...params)];
  }
  if (op.kind === "update") {
    return [
      exactRowGuard(db, table, op.before),
      db.prepare(
        "UPDATE " + table + " SET " +
        cols.filter(c => c !== "id").map(c => '"' + c + '" = ?').join(",") + " WHERE id = ?"
      ).bind(...cols.filter(c => c !== "id").map(c => op.after[c]), op.pk),
    ];
  }
  if (op.kind === "delete") {
    return [
      exactRowGuard(db, table, op.before),
      db.prepare("DELETE FROM " + table + " WHERE id = ?").bind(op.pk),
    ];
  }
  fail("stage2_delta_invalid");
}

async function verifiedDeltaBatches(db, runId, phase, batchSize) {
  const records = (await db.prepare(
    "SELECT batch_index,row_count,last_pk,batch_digest FROM stage2_rehearsal_batches " +
    "WHERE run_id=? AND table_name=? ORDER BY batch_index"
  ).bind(runId, phase.key).all()).results ?? [];
  const expected = groups(phase.rows, batchSize);
  if (records.length > expected.length) fail("stage2_checkpoint_invalid");
  records.forEach((record, index) => {
    const batch = expected[index];
    if (record.batch_index !== index || record.row_count !== batch.length ||
      record.last_pk !== batch[batch.length - 1].pk ||
      record.batch_digest !== hash(batch)) fail("stage2_checkpoint_invalid");
  });
  return records.length;
}

async function verifyDeltaReceipt(db, run, after, phases) {
  for (const phase of phases) {
    const expected = groups(phase.rows, after.batchSize).length;
    if (await verifiedDeltaBatches(db, run.runId, phase, after.batchSize) !== expected) {
      fail("stage2_checkpoint_incomplete");
    }
  }
  const tables = [];
  for (const table of after.tables) {
    const columns = approvedSyntheticColumns(table.name);
    for (const row of table.rows) {
      const actual = await db.prepare(
        "SELECT " + columns.map(c => '"' + c + '"').join(",") +
        " FROM " + table.name + " WHERE id=?"
      ).bind(row.id).first();
      if (!actual || canonical(actual) !== canonical(row)) fail("stage2_reconciliation_mismatch");
    }
    const count = await db.prepare(
      "SELECT COUNT(*) AS n FROM " + table.name + " WHERE id LIKE 's2s-%'"
    ).first();
    if (count.n !== table.rows.length) fail("stage2_reconciliation_extra_rows");
    tables.push({ name: table.name, expected: table.rows.length, observed: count.n });
  }
  return { status: "reconciled", beforeSnapshot: run.beforeSnapshot,
    afterSnapshot: after.sourceHash, deltaRunId: run.runId, tables };
}

export async function replaySyntheticOfflineDelta(db, rawBefore, rawAfter, { afterBatch = null } = {}) {
  const before = normalizeSyntheticPlan(rawBefore);
  const after = normalizeSyntheticPlan(rawAfter);
  if (before.runId === after.runId || before.snapshotId === after.snapshotId ||
      canonical(before.tables.map(t => t.name)) !== canonical(after.tables.map(t => t.name))) {
    fail("stage2_delta_identity_invalid");
  }
  // Independently verify all *prior* completed base-run checkpoints, even
  // when a delta run has already partially mutated the target.
  await verifySyntheticCheckpointSet(db, rawBefore);
  const phases = createChanges(before, after);
  const planHash = hash({ mode: "synthetic-delta-v1", before: before.planHash,
    after: after.planHash, phases });
  const deltaRun = { runId: after.runId, beforeSnapshot: before.sourceHash,
    planHash, afterSnapshot: after.sourceHash };
  const existing = await db.prepare(
    "SELECT plan_hash,snapshot_hash FROM stage2_rehearsal_runs WHERE run_id=?"
  ).bind(deltaRun.runId).first();
  if (existing && (existing.plan_hash !== deltaRun.planHash ||
      existing.snapshot_hash !== deltaRun.afterSnapshot)) fail("stage2_run_identity_mismatch");
  const prior = await db.prepare(
    "SELECT COUNT(*) AS n FROM stage2_rehearsal_batches WHERE run_id=?"
  ).bind(deltaRun.runId).first();
  if (prior.n === 0) {
    // On the first invocation require the entire target to match the
    // preceding checkpoint before making *any* delta mutation.
    await reconcileSyntheticRehearsal(db, rawBefore);
  }
  await db.prepare(
    "INSERT INTO stage2_rehearsal_runs(run_id,plan_hash,snapshot_hash) VALUES(?,?,?) " +
    "ON CONFLICT(run_id) DO NOTHING"
  ).bind(deltaRun.runId, deltaRun.planHash, deltaRun.afterSnapshot).run();
  let committed = 0, resumed = 0;
  for (const phase of phases) {
    const batches = groups(phase.rows, after.batchSize);
    const done = await verifiedDeltaBatches(db, deltaRun.runId, phase, after.batchSize);
    resumed += done;
    for (let index = done; index < batches.length; index++) {
      const batch = batches[index];
      const statements = batch.flatMap(op => mutations(db, phase.name, op));
      statements.push(db.prepare(
        "INSERT INTO stage2_rehearsal_batches " +
        "(run_id,table_name,batch_index,row_count,last_pk,batch_digest) VALUES(?,?,?,?,?,?)"
      ).bind(deltaRun.runId, phase.key, index, batch.length,
        batch[batch.length - 1].pk, hash(batch)));
      await db.batch(statements); // business delta + checkpoint, one transaction
      committed++;
      if (afterBatch) await afterBatch({ phase: phase.key, index });
    }
  }
  return { committed, resumed, receipt: await verifyDeltaReceipt(db, deltaRun, after, phases) };
}
