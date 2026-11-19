// Stage 2A: synthetic-only, local-D1 checkpoint + replay rehearsal.
//
// This is intentionally a Node-side offline tool, NOT imported by the
// deployed Worker. It never opens a BWH SQLite file or a remote Cloudflare
// connection. Only caller-injected local Miniflare D1 plus an explicit
// local-fixture sentinel is accepted. This is not a 70-table data importer.
import { createHash } from "node:crypto";

export class Stage2RehearsalError extends Error {
  constructor(code) {
    super(code);
    this.name = "Stage2RehearsalError";
    this.code = code;
  }
}

const fail = (code) => { throw new Stage2RehearsalError(code); };
const sha = (value) => createHash("sha256").update(value, "utf8").digest("hex");
const idPattern = /^s2s-[a-z0-9-]{3,80}$/;
const timePattern = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;

function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  return "{" + Object.keys(value).sort()
    .map((key) => JSON.stringify(key) + ":" + canonical(value[key])).join(",") + "}";
}

const TABLES = Object.freeze({
  platform_accounts: Object.freeze({
    pk: "id",
    columns: Object.freeze(["id", "owner_ref", "status", "created_at", "updated_at", "metadata_json"]),
  }),
  platform_entitlements: Object.freeze({
    pk: "id",
    columns: Object.freeze(["id", "account_id", "plan", "status", "valid_from", "valid_until",
      "max_artifacts", "max_devices", "traffic_limit_bytes", "created_at", "updated_at"]),
  }),
});

function isSyntheticId(s) {
  return typeof s === "string" && idPattern.test(s);
}

function isTime(s) {
  return typeof s === "string" && timePattern.test(s)
    && Number.isFinite(Date.parse(s)) && new Date(s).toISOString() === s;
}

function assertRow(table, row) {
  const spec = TABLES[table];
  if (!row || typeof row !== "object" || Array.isArray(row)) fail("stage2_row_invalid");
  const names = Object.keys(row).sort();
  if (canonical(names) !== canonical([...spec.columns].sort())) fail("stage2_column_disposition_denied");
  if (!isSyntheticId(row.id)) fail("stage2_real_rows_denied");
  for (const k of spec.columns.filter(k => k.endsWith("_at") || k === "valid_from" || k === "valid_until")) {
    if (!isTime(row[k])) fail("stage2_timestamp_invalid");
  }
  if (table === "platform_accounts") {
    if (!isSyntheticId(row.owner_ref) || !["active", "disabled", "suspended"].includes(row.status)
      || row.metadata_json !== "{}") fail("stage2_real_rows_denied");
  } else {
    if (!isSyntheticId(row.account_id) || !["monthly", "annual"].includes(row.plan)
      || !["active", "expired"].includes(row.status)
      || !Number.isSafeInteger(row.max_artifacts) || row.max_artifacts < 0
      || !Number.isSafeInteger(row.max_devices) || row.max_devices < 0
      || !Number.isSafeInteger(row.traffic_limit_bytes) || row.traffic_limit_bytes < 0
      || row.traffic_limit_bytes > 1000000000000) fail("stage2_real_rows_denied");
  }
}

export function normalizeSyntheticPlan(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)
    || !/^s2s-run-[a-z0-9-]{3,48}$/.test(input.runId ?? "")
    || !/^s2s-snapshot-[a-z0-9-]{3,48}$/.test(input.snapshotId ?? "")
    || !Number.isInteger(input.batchSize) || input.batchSize < 1 || input.batchSize > 20
    || !Array.isArray(input.tables) || input.tables.length < 1 || input.tables.length > 2) {
    fail("stage2_plan_invalid");
  }
  const names = input.tables.map(t => t?.name);
  const approved = ["platform_accounts", "platform_entitlements"].slice(0, names.length);
  if (canonical(names) !== canonical(approved)) fail("stage2_table_disposition_denied");
  const tables = input.tables.map(table => {
    if (!Array.isArray(table.rows) || table.rows.length > 200) fail("stage2_plan_invalid");
    const rows = table.rows.map(row => {
      assertRow(table.name, row);
      return Object.fromEntries(TABLES[table.name].columns.map(key => [key, row[key]]));
    });
    rows.sort((a, b) => a.id.localeCompare(b.id, "en"));
    if (new Set(rows.map(row => row.id)).size !== rows.length) fail("stage2_duplicate_source_pk");
    return { name: table.name, rows };
  });
  if (tables.length === 2) {
    const accounts = new Set(tables[0].rows.map(row => row.id));
    if (tables[1].rows.some(row => !accounts.has(row.account_id))) {
      fail("stage2_unresolved_parent_fk");
    }
  }
  const sourceHash = sha(canonical(tables));
  const planHash = sha(canonical({
    runId: input.runId, snapshotId: input.snapshotId, batchSize: input.batchSize,
    sourceHash, tableNames: names,
  }));
  return { runId: input.runId, snapshotId: input.snapshotId, batchSize: input.batchSize,
    tables, sourceHash, planHash };
}

function batchesOf(rows, batchSize) {
  const batches = [];
  for (let at = 0; at < rows.length; at += batchSize) {
    batches.push(rows.slice(at, at + batchSize));
  }
  return batches;
}

function batchFingerprint(rows) { return sha(canonical(rows)); }

async function verifyLocalFixture(db, plan) {
  if (!db || typeof db.prepare !== "function" || typeof db.batch !== "function") {
    fail("stage2_local_fixture_required");
  }
  try {
    const sentinel = await db.prepare(
      "SELECT marker FROM stage2_local_rehearsal_sentinel WHERE singleton = 1"
    ).first();
    if (sentinel?.marker !== "local-miniflare-synthetic-only-v1") {
      fail("stage2_local_fixture_required");
    }
    for (const table of plan.tables) {
      const cols = await db.prepare("SELECT name FROM pragma_table_info('" + table.name + "')").all();
      const found = new Set((cols.results ?? []).map(x => x.name));
      if (TABLES[table.name].columns.some(col => !found.has(col))) {
        fail("stage2_target_schema_mismatch");
      }
    }
    const runs = await db.prepare("SELECT name FROM pragma_table_info('stage2_rehearsal_runs')").all();
    const checks = await db.prepare("SELECT name FROM pragma_table_info('stage2_rehearsal_batches')").all();
    if ((runs.results ?? []).length < 3 || (checks.results ?? []).length < 6) {
      fail("stage2_local_fixture_required");
    }
  } catch (error) {
    if (error instanceof Stage2RehearsalError) throw error;
    fail("stage2_local_fixture_required");
  }
}

async function ensureRun(db, plan) {
  await db.prepare(
    "INSERT INTO stage2_rehearsal_runs (run_id, plan_hash, snapshot_hash) VALUES (?, ?, ?) " +
    "ON CONFLICT (run_id) DO NOTHING"
  ).bind(plan.runId, plan.planHash, plan.sourceHash).run();
  const actual = await db.prepare(
    "SELECT plan_hash, snapshot_hash FROM stage2_rehearsal_runs WHERE run_id = ?"
  ).bind(plan.runId).first();
  if (actual?.plan_hash !== plan.planHash || actual?.snapshot_hash !== plan.sourceHash) {
    fail("stage2_run_identity_mismatch");
  }
}

async function completedBatches(db, plan, table) {
  const data = await db.prepare(
    "SELECT batch_index, row_count, last_pk, batch_digest FROM stage2_rehearsal_batches " +
    "WHERE run_id = ? AND table_name = ? ORDER BY batch_index"
  ).bind(plan.runId, table.name).all();
  const existing = data.results ?? [];
  const expected = batchesOf(table.rows, plan.batchSize);
  if (existing.length > expected.length) fail("stage2_checkpoint_invalid");
  existing.forEach((record, index) => {
    const b = expected[index];
    if (record.batch_index !== index || record.row_count !== b.length
      || record.last_pk !== b[b.length - 1].id
      || record.batch_digest !== batchFingerprint(b)) {
      fail("stage2_checkpoint_invalid");
    }
  });
  return existing.length;
}

function insertExactOrConflict(db, table, row) {
  const cols = TABLES[table.name].columns;
  const fields = cols.map(c => '"' + c + '"').join(", ");
  const query = "INSERT INTO " + table.name + " (" + fields + ") SELECT "
    + cols.map(() => "?").join(", ") + " WHERE NOT EXISTS (SELECT 1 FROM "
    + table.name + " WHERE " + cols.map(c => '"' + c + '" IS ?').join(" AND ") + ")";
  const values = cols.map(k => row[k]);
  // A matching replay is a no-op. A conflicting same-PK row trips the
  // target UNIQUE constraint, rolling back business INSERT and checkpoint
  // together. Never overwrite a divergent target row.
  return db.prepare(query).bind(...values, ...values);
}

export async function reconcileSyntheticRehearsal(db, rawPlan) {
  const plan = normalizeSyntheticPlan(rawPlan);
  await verifyLocalFixture(db, plan);
  const run = await db.prepare("SELECT plan_hash, snapshot_hash FROM stage2_rehearsal_runs WHERE run_id=?")
    .bind(plan.runId).first();
  if (run?.plan_hash !== plan.planHash || run?.snapshot_hash !== plan.sourceHash) {
    fail("stage2_run_identity_mismatch");
  }
  const tables = [];
  for (const table of plan.tables) {
    const expected = batchesOf(table.rows, plan.batchSize).length;
    if (await completedBatches(db, plan, table) !== expected) {
      fail("stage2_checkpoint_incomplete");
    }
    const cols = TABLES[table.name].columns;
    for (const row of table.rows) {
      const target = await db.prepare(
        "SELECT " + cols.map(c => '"' + c + '"').join(", ") + " FROM " + table.name + " WHERE id = ?"
      ).bind(row.id).first();
      if (!target || canonical(target) !== canonical(row)) {
        fail("stage2_reconciliation_mismatch");
      }
    }
    const count = await db.prepare(
      "SELECT COUNT(*) AS n FROM " + table.name + " WHERE id LIKE 's2s-%'"
    ).first();
    if (count.n !== table.rows.length) fail("stage2_reconciliation_extra_rows");
    tables.push({ table: table.name, expected: table.rows.length, observed: count.n,
      batchCount: expected, snapshotDigest: batchFingerprint(table.rows) });
  }
  return { status: "reconciled", runId: plan.runId, snapshotHash: plan.sourceHash,
    planHash: plan.planHash, tables };
}

export async function runSyntheticOfflineMigration(db, rawPlan, { afterBatch = null } = {}) {
  const plan = normalizeSyntheticPlan(rawPlan);
  await verifyLocalFixture(db, plan);
  await ensureRun(db, plan);
  let committed = 0;
  let resumed = 0;
  for (const table of plan.tables) {
    const batches = batchesOf(table.rows, plan.batchSize);
    const start = await completedBatches(db, plan, table);
    resumed += start;
    for (let index = start; index < batches.length; index++) {
      const batch = batches[index];
      const statements = batch.map(row => insertExactOrConflict(db, table, row));
      statements.push(db.prepare(
        "INSERT INTO stage2_rehearsal_batches " +
        "(run_id,table_name,batch_index,row_count,last_pk,batch_digest) VALUES (?,?,?,?,?,?)"
      ).bind(plan.runId, table.name, index, batch.length, batch[batch.length - 1].id,
        batchFingerprint(batch)));
      // D1's batch is the atomic commit unit: checkpoint cannot advance
      // without its matching business rows and vice versa.
      await db.batch(statements);
      committed++;
      if (afterBatch) await afterBatch({ table: table.name, batchIndex: index });
    }
  }
  return { committed, resumed, receipt: await reconcileSyntheticRehearsal(db, rawPlan) };
}


// A delta rehearsal must trust an earlier completed source snapshot's
// immutable checkpoint log, not a mutable "last seen row" flag. This
// function only verifies checkpoint provenance; it is valid even after
// a later delta has changed the target rows.
export async function verifySyntheticCheckpointSet(db, rawPlan) {
  const plan = normalizeSyntheticPlan(rawPlan);
  await verifyLocalFixture(db, plan);
  const run = await db.prepare(
    "SELECT plan_hash,snapshot_hash FROM stage2_rehearsal_runs WHERE run_id=?"
  ).bind(plan.runId).first();
  if (run?.plan_hash !== plan.planHash || run?.snapshot_hash !== plan.sourceHash) {
    fail("stage2_run_identity_mismatch");
  }
  for (const table of plan.tables) {
    if (await completedBatches(db, plan, table)
      !== batchesOf(table.rows, plan.batchSize).length) {
      fail("stage2_checkpoint_incomplete");
    }
  }
  return { runId: plan.runId, snapshotHash: plan.sourceHash, planHash: plan.planHash };
}
