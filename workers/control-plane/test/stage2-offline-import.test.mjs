import assert from "node:assert/strict";
import test from "node:test";
import { createWorker } from "./helpers.mjs";
import {
  normalizeSyntheticPlan,
  runSyntheticOfflineMigration,
  reconcileSyntheticRehearsal,
} from "../../../tools/d1-stage2/offline-rehearsal.mjs";

const timestamp = "2026-11-20T00:00:00.000Z";
function fixtures(overrides = {}) {
  // Card 14: loader-input rows no longer carry metadata_json (the loader
  // rejects it with stage2_metadata_json_denied). The direct target-table
  // seeds further below still insert metadata_json explicitly, because the
  // local D1 table keeps the column with DEFAULT '{}'.
  const a = { id: "s2s-account-001", owner_ref: "s2s-owner-001", status: "active",
    created_at: timestamp, updated_at: timestamp };
  const b = { id: "s2s-account-002", owner_ref: "s2s-owner-002", status: "active",
    created_at: timestamp, updated_at: timestamp };
  const ent = {
    id: "s2s-entitlement-001", account_id: "s2s-account-001", plan: "monthly",
    status: "active", valid_from: timestamp, valid_until: "2026-12-20T00:00:00.000Z",
    max_artifacts: 2, max_devices: 1, traffic_limit_bytes: 5000,
    created_at: timestamp, updated_at: timestamp,
  };
  return {
    runId: "s2s-run-contract-001", snapshotId: "s2s-snapshot-contract-001",
    batchSize: 1,
    tables: [
      { name: "platform_accounts", rows: [a, b] },
      { name: "platform_entitlements", rows: [ent] },
    ],
    ...overrides,
  };
}

async function setup(db) {
  const ddl = [
    "CREATE TABLE stage2_local_rehearsal_sentinel (singleton INTEGER PRIMARY KEY,marker TEXT NOT NULL)",
    "CREATE TABLE stage2_rehearsal_runs (run_id TEXT PRIMARY KEY, plan_hash TEXT NOT NULL, snapshot_hash TEXT NOT NULL)",
    "CREATE TABLE stage2_rehearsal_batches (run_id TEXT NOT NULL REFERENCES stage2_rehearsal_runs(run_id), " +
      "table_name TEXT NOT NULL, batch_index INTEGER NOT NULL, row_count INTEGER NOT NULL, " +
      "last_pk TEXT NOT NULL, batch_digest TEXT NOT NULL, PRIMARY KEY(run_id,table_name,batch_index))",
    "CREATE TABLE platform_entitlements (id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES platform_accounts(id), " +
      "plan TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('active','expired')), " +
      "valid_from TEXT NOT NULL,valid_until TEXT NOT NULL,max_artifacts INTEGER NOT NULL, " +
      "max_devices INTEGER NOT NULL,traffic_limit_bytes INTEGER NOT NULL, " +
      "created_at TEXT NOT NULL,updated_at TEXT NOT NULL)",
  ];
  for (const sql of ddl) await db.prepare(sql).run();
  await db.prepare(
    "INSERT INTO stage2_local_rehearsal_sentinel(singleton,marker) VALUES(1,'local-miniflare-synthetic-only-v1')"
  ).run();
}
async function count(db, table, clause = "") {
  const { n } = await db.prepare("SELECT COUNT(*) AS n FROM " + table + " " + clause).first();
  return n;
}
async function ready(t) {
  const { mf, db } = await createWorker();
  t.after(() => mf.dispose());
  await setup(db);
  return db;
}

test("stage2 synthetic fixtures load parents then children; checkpoints and replay are idempotent", async t => {
  const db = await ready(t);
  const plan = fixtures();
  const first = await runSyntheticOfflineMigration(db, plan);
  assert.equal(first.committed, 3);
  assert.equal(first.resumed, 0);
  assert.equal(first.receipt.status, "reconciled");
  assert.equal(first.receipt.tables[0].expected, 2);
  assert.equal(first.receipt.tables[1].expected, 1);
  assert.equal(await count(db, "stage2_rehearsal_batches"), 3);
  assert.equal(await count(db, "platform_accounts", "WHERE id LIKE 's2s-%'"), 2);
  assert.equal(await count(db, "platform_entitlements"), 1);
  const repeat = await runSyntheticOfflineMigration(db, plan);
  assert.equal(repeat.committed, 0);
  assert.equal(repeat.resumed, 3);
  assert.deepEqual(repeat.receipt, first.receipt);
});

test("stage2 lost response after an atomic commit resumes without duplicate business rows", async t => {
  const db = await ready(t);
  let called = 0;
  await assert.rejects(runSyntheticOfflineMigration(db, fixtures(), {
    afterBatch() {
      if (++called === 1) throw new Error("synthetic_lost_ack_after_commit");
    },
  }), /synthetic_lost_ack_after_commit/);
  assert.equal(await count(db, "stage2_rehearsal_batches"), 1);
  assert.equal(await count(db, "platform_accounts", "WHERE id LIKE 's2s-%'"), 1);
  const recovered = await runSyntheticOfflineMigration(db, fixtures());
  assert.equal(recovered.resumed, 1);
  assert.equal(recovered.committed, 2);
  assert.equal(await count(db, "platform_accounts", "WHERE id LIKE 's2s-%'"), 2);
  assert.equal(await count(db, "stage2_rehearsal_batches"), 3);
});

test("stage2 divergent target PK aborts the entire batch, checkpoint never advances", async t => {
  const db = await ready(t);
  const source = fixtures({ batchSize: 2 });
  const row = source.tables[0].rows[1];
  await db.prepare(
    "INSERT INTO platform_accounts(id,owner_ref,status,created_at,updated_at,metadata_json) VALUES(?,?,?,?,?,?)"
  ).bind(row.id, row.owner_ref, "disabled", row.created_at, row.updated_at, "{}").run();
  await assert.rejects(runSyntheticOfflineMigration(db, source));
  assert.equal(await count(db, "stage2_rehearsal_batches"), 0);
  assert.equal(await count(db, "platform_accounts", "WHERE id LIKE 's2s-%'"), 1);
  assert.equal((await db.prepare(
    "SELECT status FROM platform_accounts WHERE id='s2s-account-002'"
  ).first()).status, "disabled");
});

test("stage2 changed snapshot under an existing run id fails closed before another batch", async t => {
  const db = await ready(t);
  await runSyntheticOfflineMigration(db, fixtures());
  const changed = fixtures();
  changed.tables[0].rows[0].status = "disabled";
  await assert.rejects(runSyntheticOfflineMigration(db, changed), {
    code: "stage2_run_identity_mismatch",
  });
  assert.equal(await count(db, "stage2_rehearsal_batches"), 3);
  assert.equal((await db.prepare(
    "SELECT status FROM platform_accounts WHERE id='s2s-account-001'"
  ).first()).status, "active");
});

test("stage2 corrupted checkpoint and post-load row mutation are both detected", async t => {
  const db = await ready(t);
  await runSyntheticOfflineMigration(db, fixtures());
  await db.prepare(
    "UPDATE stage2_rehearsal_batches SET batch_digest=? WHERE table_name='platform_accounts' AND batch_index=0"
  ).bind("x".repeat(64)).run();
  await assert.rejects(runSyntheticOfflineMigration(db, fixtures()), {
    code: "stage2_checkpoint_invalid",
  });
  await db.prepare(
    "UPDATE stage2_rehearsal_batches SET batch_digest=? WHERE table_name='platform_accounts' AND batch_index=0"
  ).bind("x".repeat(64)).run();
  const untouched = fixtures();
  const derived = normalizeSyntheticPlan(untouched);
  // Repair the synthetic checkpoint using its recorded digest from
  // a separately generated temporary run in a distinct local database.
  const other = await ready(t);
  await runSyntheticOfflineMigration(other, untouched);
  const saved = await other.prepare(
    "SELECT batch_digest FROM stage2_rehearsal_batches WHERE table_name='platform_accounts' AND batch_index=0"
  ).first();
  await db.prepare(
    "UPDATE stage2_rehearsal_batches SET batch_digest=? WHERE table_name='platform_accounts' AND batch_index=0"
  ).bind(saved.batch_digest).run();
  assert.match(derived.sourceHash, /^[0-9a-f]{64}$/);
  await db.prepare("UPDATE platform_accounts SET status='disabled' WHERE id='s2s-account-001'").run();
  await assert.rejects(reconcileSyntheticRehearsal(db, fixtures()), {
    code: "stage2_reconciliation_mismatch",
  });
});

test("stage2 extra target synthetic ID fails closed instead of reporting a false match", async t => {
  const db = await ready(t);
  await runSyntheticOfflineMigration(db, fixtures());
  await db.prepare(
    "INSERT INTO platform_accounts(id,owner_ref,status,created_at,updated_at,metadata_json) VALUES(?,?,?,?,?,?)"
  ).bind("s2s-account-extraneous", "s2s-owner-extraneous", "active", timestamp, timestamp, "{}").run();
  await assert.rejects(reconcileSyntheticRehearsal(db, fixtures()), {
    code: "stage2_reconciliation_extra_rows",
  });
});

test("stage2 absent local sentinel and missing target schema abort with zero writes", async t => {
  const { mf, db } = await createWorker();
  t.after(() => mf.dispose());
  await assert.rejects(runSyntheticOfflineMigration(db, fixtures()), {
    code: "stage2_local_fixture_required",
  });
  assert.equal(await count(db, "platform_accounts", "WHERE id LIKE 's2s-%'"), 0);
  await db.prepare("CREATE TABLE stage2_local_rehearsal_sentinel(singleton INTEGER PRIMARY KEY,marker TEXT)").run();
  await db.prepare("INSERT INTO stage2_local_rehearsal_sentinel VALUES(1,'local-miniflare-synthetic-only-v1')").run();
  await assert.rejects(runSyntheticOfflineMigration(db, fixtures()), {
    code: "stage2_target_schema_mismatch",
  });
  assert.equal(await count(db, "platform_accounts", "WHERE id LIKE 's2s-%'"), 0);
});

test("stage2 rejects production-looking values, unknown fields, duplicate keys and unresolved FK", async t => {
  const db = await ready(t);
  const notSynthetic = fixtures();
  notSynthetic.tables[0].rows[0].id = "real-account-001";
  await assert.rejects(runSyntheticOfflineMigration(db, notSynthetic), { code: "stage2_real_rows_denied" });
  const personal = fixtures();
  personal.tables[0].rows[0].metadata_json = '{"email":"example@example.org"}';
  await assert.rejects(runSyntheticOfflineMigration(db, personal), { code: "stage2_metadata_json_denied" });
  const unknownField = fixtures();
  unknownField.tables[0].rows[0].email = "example@example.org";
  await assert.rejects(runSyntheticOfflineMigration(db, unknownField), { code: "stage2_column_disposition_denied" });
  const duplicate = fixtures();
  duplicate.tables[0].rows.push({ ...duplicate.tables[0].rows[0] });
  await assert.rejects(runSyntheticOfflineMigration(db, duplicate), { code: "stage2_duplicate_source_pk" });
  const invalidParent = fixtures();
  invalidParent.tables[1].rows[0].account_id = "s2s-account-unseen";
  await assert.rejects(runSyntheticOfflineMigration(db, invalidParent), { code: "stage2_unresolved_parent_fk" });
  assert.equal(await count(db, "stage2_rehearsal_runs"), 0);
});
