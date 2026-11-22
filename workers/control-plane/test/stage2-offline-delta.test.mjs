import assert from "node:assert/strict";
import test from "node:test";
import { createWorker } from "./helpers.mjs";
import { runSyntheticOfflineMigration } from "../../../tools/d1-stage2/offline-rehearsal.mjs";
import { replaySyntheticOfflineDelta } from "../../../tools/d1-stage2/offline-delta-replay.mjs";

const now = "2026-11-20T00:00:00.000Z";
const until = "2026-12-20T00:00:00.000Z";
function account(n) {
  // Card 14: loader-input rows no longer carry metadata_json.
  return { id: "s2s-account-00" + n, owner_ref: "s2s-owner-00" + n,
    status: "active", created_at: now, updated_at: now };
}
function entitlement(n, acct) {
  return { id: "s2s-entitlement-00" + n, account_id: "s2s-account-00" + acct,
    plan: "monthly", status: "active", valid_from: now, valid_until: until,
    max_artifacts: 2, max_devices: 1, traffic_limit_bytes: 5000,
    created_at: now, updated_at: now };
}
function plan(which, rows) {
  return { runId: "s2s-run-" + which, snapshotId: "s2s-snapshot-" + which,
    batchSize: 1, tables: [
      { name: "platform_accounts", rows: rows.accounts },
      { name: "platform_entitlements", rows: rows.entitlements },
    ] };
}
const before = () => plan("before-001", {
  accounts: [account(1), account(2)],
  entitlements: [entitlement(1,1), entitlement(2,2)],
});
const after = () => plan("after-001", {
  accounts: [{ ...account(1), status: "suspended" }, account(3)],
  entitlements: [{ ...entitlement(1,1), traffic_limit_bytes: 8000 }, entitlement(3,3)],
});

async function fixture(t) {
  const { mf, db } = await createWorker();
  t.after(() => mf.dispose());
  const ddl = [
    "CREATE TABLE stage2_local_rehearsal_sentinel(singleton INTEGER PRIMARY KEY,marker TEXT NOT NULL)",
    "CREATE TABLE stage2_rehearsal_runs(run_id TEXT PRIMARY KEY,plan_hash TEXT NOT NULL,snapshot_hash TEXT NOT NULL)",
    "CREATE TABLE stage2_rehearsal_batches(run_id TEXT NOT NULL REFERENCES stage2_rehearsal_runs(run_id), " +
      "table_name TEXT NOT NULL,batch_index INTEGER NOT NULL,row_count INTEGER NOT NULL," +
      "last_pk TEXT NOT NULL,batch_digest TEXT NOT NULL,PRIMARY KEY(run_id,table_name,batch_index))",
    "CREATE TABLE stage2_rehearsal_assertions(value INTEGER NOT NULL CHECK(value = 1))",
    "CREATE TABLE platform_entitlements(id TEXT PRIMARY KEY,account_id TEXT NOT NULL REFERENCES platform_accounts(id), " +
      "plan TEXT NOT NULL,status TEXT NOT NULL,valid_from TEXT NOT NULL,valid_until TEXT NOT NULL," +
      "max_artifacts INTEGER NOT NULL,max_devices INTEGER NOT NULL,traffic_limit_bytes INTEGER NOT NULL, " +
      "created_at TEXT NOT NULL,updated_at TEXT NOT NULL)",
  ];
  for (const q of ddl) await db.prepare(q).run();
  await db.prepare(
    "INSERT INTO stage2_local_rehearsal_sentinel VALUES (1,'local-miniflare-synthetic-only-v1')"
  ).run();
  await runSyntheticOfflineMigration(db, before());
  return db;
}
async function count(db, table, where = "") {
  return (await db.prepare("SELECT COUNT(*) AS n FROM " + table + " " + where).first()).n;
}

test("Stage2B orders removals and upserts to preserve foreign keys", async t => {
  const db = await fixture(t);
  const phases = [];
  const r = await replaySyntheticOfflineDelta(db, before(), after(), {
    afterBatch({ phase }) { phases.push(phase); },
  });
  assert.equal(r.committed, 6);
  assert.equal(r.resumed, 0);
  assert.equal(r.receipt.status, "reconciled");
  assert.deepEqual(phases, [
    "delta/delete/platform_entitlements",
    "delta/upsert/platform_accounts",
    "delta/upsert/platform_accounts",
    "delta/upsert/platform_entitlements",
    "delta/upsert/platform_entitlements",
    "delta/delete/platform_accounts",
  ]);
  assert.equal(await count(db, "platform_accounts", "WHERE id LIKE 's2s-%'"), 2);
  assert.equal(await count(db, "platform_entitlements"), 2);
  assert.equal(await count(db, "platform_accounts", "WHERE id='s2s-account-002'"), 0);
  assert.equal(await count(db, "platform_entitlements", "WHERE id='s2s-entitlement-002'"), 0);
  assert.equal((await db.prepare("SELECT status FROM platform_accounts WHERE id='s2s-account-001'").first()).status,
    "suspended");
  assert.equal((await db.prepare(
    "SELECT traffic_limit_bytes FROM platform_entitlements WHERE id='s2s-entitlement-001'"
  ).first()).traffic_limit_bytes, 8000);
  const again = await replaySyntheticOfflineDelta(db, before(), after());
  assert.equal(again.committed, 0);
  assert.equal(again.resumed, 6);
  assert.deepEqual(again.receipt, r.receipt);
});

test("Stage2B interrupted after delete checkpoint resumes all remaining operations", async t => {
  const db = await fixture(t);
  await assert.rejects(replaySyntheticOfflineDelta(db, before(), after(), {
    afterBatch({ phase }) {
      assert.equal(phase, "delta/delete/platform_entitlements");
      throw new Error("synthetic_delta_ack_lost");
    },
  }), /synthetic_delta_ack_lost/);
  assert.equal(await count(db, "platform_entitlements", "WHERE id='s2s-entitlement-002'"), 0);
  assert.equal(await count(db, "stage2_rehearsal_batches",
    "WHERE table_name LIKE 'delta/%'"), 1);
  const result = await replaySyntheticOfflineDelta(db, before(), after());
  assert.equal(result.resumed, 1);
  assert.equal(result.committed, 5);
  assert.equal(result.receipt.status, "reconciled");
});

test("Stage2B reparents a retained entitlement before deleting its old account", async t => {
  const db = await fixture(t);
  const target = plan("reparent-001", {
    accounts: [account(1), account(3)],
    entitlements: [entitlement(1, 1), entitlement(2, 3)],
  });
  const result = await replaySyntheticOfflineDelta(db, before(), target);
  assert.equal(result.receipt.status, "reconciled");
  assert.equal((await db.prepare(
    "SELECT account_id FROM platform_entitlements WHERE id = 's2s-entitlement-002'",
  ).first()).account_id, "s2s-account-003");
  assert.equal(await count(db, "platform_accounts", "WHERE id = 's2s-account-002'"), 0);
});

test("Stage2B exact old-row guard fails closed on stale source after partial delta", async t => {
  const db = await fixture(t);
  await assert.rejects(replaySyntheticOfflineDelta(db, before(), after(), {
    async afterBatch() {
      await db.prepare(
        "UPDATE platform_accounts SET status='disabled' WHERE id='s2s-account-001'"
      ).run();
      throw new Error("synthetic_external_mutation_after_checkpoint");
    },
  }), /synthetic_external_mutation_after_checkpoint/);
  await assert.rejects(replaySyntheticOfflineDelta(db, before(), after()));
  assert.equal((await db.prepare("SELECT status FROM platform_accounts WHERE id='s2s-account-001'").first()).status,
    "disabled");
  assert.equal(await count(db, "stage2_rehearsal_batches",
    "WHERE table_name='delta/upsert/platform_accounts'"), 0);
});

test("Stage2B a stale row in a multi-row update batch aborts all changes and checkpoint", async t => {
  const db = await fixture(t);
  const target = after();
  target.batchSize = 2;
  target.tables[0].rows[0].status = "suspended";
  target.tables[0].rows.push({ ...account(2), status: "disabled" });
  target.tables[1].rows.push(entitlement(2,2));
  // One delete (entitlement 2 in before -> not deleted here), so there is
  // no delta batch before account updates. Change the target *during*
  // the first delta checkpoint by separately inserting a new account 3
  // after an earlier unrelated account insert? Instead use a synthetic
  // account delta with two updates and a preceding child delete.
  target.tables[1].rows = [entitlement(1,1)];
  const base = before();
  const first = await replaySyntheticOfflineDelta(db, base, {
    ...target, batchSize: 2,
  }, {
    async afterBatch({ phase }) {
      assert.equal(phase, "delta/delete/platform_entitlements");
      await db.prepare(
        "UPDATE platform_accounts SET status='suspended' WHERE id='s2s-account-002'"
      ).run();
      throw new Error("synthetic_inject_stale_second_update");
    }
  }).catch(error => {
    assert.match(error.message, /synthetic_inject_stale_second_update/);
    return null;
  });
  assert.equal(first, null);
  await assert.rejects(replaySyntheticOfflineDelta(db, base, {
    ...target, batchSize: 2,
  }));
  // Account 1 update was rolled back with the failed account 2 guard.
  assert.equal((await db.prepare(
    "SELECT status FROM platform_accounts WHERE id='s2s-account-001'"
  ).first()).status, "active");
  assert.equal(await count(db, "stage2_rehearsal_batches",
    "WHERE table_name='delta/upsert/platform_accounts'"), 0);
});

test("Stage2B changed snapshot identity under same delta run id rejects replay", async t => {
  const db = await fixture(t);
  await replaySyntheticOfflineDelta(db, before(), after());
  const different = after();
  different.tables[0].rows[0].status = "disabled";
  await assert.rejects(replaySyntheticOfflineDelta(db, before(), different),
    { code: "stage2_run_identity_mismatch" });
  assert.equal(await count(db, "stage2_rehearsal_batches", "WHERE table_name LIKE 'delta/%'"), 6);
});

test("Stage2B rejects a different plan that registers the delta run first", async t => {
  const db = await fixture(t);
  await db.prepare(
    "CREATE TRIGGER claim_delta_run_first BEFORE INSERT ON stage2_rehearsal_runs " +
    "WHEN NEW.run_id = 's2s-run-after-001' AND NEW.plan_hash <> 'competing-plan' " +
    "BEGIN INSERT INTO stage2_rehearsal_runs VALUES (NEW.run_id, 'competing-plan', 'competing-snapshot'); END",
  ).run();
  await assert.rejects(replaySyntheticOfflineDelta(db, before(), after()), {
    code: "stage2_run_identity_mismatch",
  });
  assert.equal(await count(db, "stage2_rehearsal_batches", "WHERE table_name LIKE 'delta/%'"), 0);
  assert.equal(await count(db, "platform_entitlements", "WHERE id = 's2s-entitlement-002'"), 1);
  assert.equal(await count(db, "platform_accounts", "WHERE id = 's2s-account-003'"), 0);
});

test("Stage2B missing initial snapshot and invalid FK fail before any delta write", async t => {
  const { mf, db } = await createWorker();
  t.after(() => mf.dispose());
  await assert.rejects(replaySyntheticOfflineDelta(db, before(), after()),
    { code: "stage2_local_fixture_required" });
  const broken = after();
  broken.tables[1].rows[0].account_id = "s2s-account-unseen";
  await assert.rejects(replaySyntheticOfflineDelta(db, before(), broken),
    { code: "stage2_unresolved_parent_fk" });
});
