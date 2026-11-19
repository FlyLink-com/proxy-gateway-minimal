// D1 Stage 1B — BWH single-writer authority, freeze receipt, source
// delta, store guard wiring, and wallet idempotency under the guard.
//
// All fixtures are synthetic: throwaway temp-file/in-memory SQLite
// databases built by the tests themselves. Nothing here connects to
// BWH, a Worker, or any real control plane, and no production SQLite
// file or secret ever enters a test artifact.

import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  WRITER_PHASES,
  assertWritable,
  ensureWriterAuthority,
  guardedTransaction,
  parseWriterEpoch,
  readWriterAuthority,
  transitionWriterAuthority,
} from "../services/platform/single-writer-authority.mjs";
import {
  buildFreezeReceipt,
  verifyFreezeReceipt,
} from "../services/platform/writer-freeze-receipt.mjs";
import {
  buildCheckpointManifest,
  enumerateSourceDeltas,
  fingerprintRow,
} from "../services/platform/source-delta.mjs";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import {
  COIN_WALLET_MIGRATIONS,
  REQUIRED_COIN_WALLET_MIGRATION_ID,
  applyCoinWalletMigrations,
} from "../services/platform/coin-wallet-migrations.mjs";
import { createSqliteCoinWalletStore } from "../services/platform/coin-wallet-store.mjs";

const NOW = new Date("2026-11-20T00:00:00.000Z");
const nowFn = () => new Date(NOW);

async function tempDbFile(t) {
  const dir = await mkdtemp(join(tmpdir(), "stage1b-authority-"));
  t.after(async () => {
    await rm(dir, { recursive: true, force: true });
  });
  return join(dir, "synthetic.sqlite");
}

function memoryDb(t) {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  t.after(() => {
    try {
      db.close();
    } catch {
      // Already closed by the test.
    }
  });
  return db;
}

function createSyntheticBusinessTables(db) {
  db.exec(`
    create table synth_accounts (
      id text primary key, status text not null, updated_at text not null
    );
    create table synth_credentials (
      id text primary key, account_id text not null,
      password_hash text not null, updated_at text not null
    );
  `);
}

function insertSynthAccount(db, id, status = "active") {
  db.prepare(
    "insert into synth_accounts (id, status, updated_at) values (?, ?, ?)",
  ).run(id, status, NOW.toISOString());
}

function countRows(db, table) {
  return Number(db.prepare(`select count(*) as n from ${table}`).get().n);
}

function assertWriterError(error, code) {
  assert.equal(error?.name, "WriterAuthorityError", `expected WriterAuthorityError, got ${error}`);
  assert.equal(error?.code, code, `expected ${code}, got ${error?.code}: ${error?.message}`);
}

// --- Authority record and epoch parsing ---

test("S1B-AUTH-1: ensureWriterAuthority initializes BWH_ACTIVE epoch 1 and is idempotent", () => {
  const db = new Database(":memory:");
  try {
    const first = ensureWriterAuthority(db, { now: nowFn });
    assert.equal(first.authority, "BWH");
    assert.equal(first.phase, WRITER_PHASES.BWH_ACTIVE);
    assert.equal(first.epoch, 1);
    assert.equal(countRows(db, "platform_writer_authority"), 1);
    const second = ensureWriterAuthority(db, { now: nowFn });
    assert.deepEqual(second, first);
    assert.equal(countRows(db, "platform_writer_authority"), 1);
  } finally {
    db.close();
  }
});

test("S1B-AUTH-2: parseWriterEpoch accepts valid epochs and rejects malformed ones", () => {
  for (const valid of ["1", "2147483647", "7", 42, 1]) {
    assert.equal(parseWriterEpoch(valid), Number(valid));
  }
  for (const invalid of [
    "0", "00", "01", "007", "2147483648", "-1", "1.5", "", " 3", "3 ",
    "abc", null, undefined, 1.5, Number.NaN, {}, [], true,
  ]) {
    assert.throws(() => parseWriterEpoch(invalid), (error) => {
      assertWriterError(error, "writer_epoch_required");
      return true;
    }, `expected writer_epoch_required for ${JSON.stringify(invalid)}`);
  }
});

test("S1B-AUTH-3: assertWritable passes on BWH_ACTIVE and guardedTransaction commits", (t) => {
  const db = memoryDb(t);
  createSyntheticBusinessTables(db);
  const record = assertWritable(db);
  assert.equal(record.phase, WRITER_PHASES.BWH_ACTIVE);
  assert.equal(record.epoch, 1);
  guardedTransaction(db, "1", () => insertSynthAccount(db, "acct-1"));
  assert.equal(countRows(db, "synth_accounts"), 1);
});

test("S1B-AUTH-4: guardedTransaction rolls back fence and business write together", (t) => {
  const db = memoryDb(t);
  createSyntheticBusinessTables(db);
  assert.throws(
    () => guardedTransaction(db, "1", () => {
      insertSynthAccount(db, "acct-1");
      throw new Error("synthetic business failure");
    }),
    /synthetic business failure/,
  );
  assert.equal(countRows(db, "synth_accounts"), 0);
  assert.equal(readWriterAuthority(db).epoch, 1);
});

// --- Transitions ---

test("S1B-AUTH-5: legal transitions advance the epoch by exactly one", (t) => {
  const db = memoryDb(t);
  const frozen = transitionWriterAuthority(db, { to: "FROZEN", now: nowFn });
  assert.equal(frozen.phase, "FROZEN");
  assert.equal(frozen.authority, "BWH");
  assert.equal(frozen.epoch, 2);
  const active = transitionWriterAuthority(db, { to: "D1_ACTIVE", now: nowFn });
  assert.equal(active.phase, "D1_ACTIVE");
  assert.equal(active.authority, "D1");
  assert.equal(active.epoch, 3);
  const recovery = transitionWriterAuthority(db, { to: "RECOVERY", now: nowFn });
  assert.equal(recovery.phase, "RECOVERY");
  assert.equal(recovery.epoch, 4);
  const resumed = transitionWriterAuthority(db, { to: "D1_ACTIVE", now: nowFn });
  assert.equal(resumed.phase, "D1_ACTIVE");
  assert.equal(resumed.epoch, 5);

  const db2 = memoryDb(t);
  const aborted = transitionWriterAuthority(db2, { to: "FROZEN", now: nowFn });
  assert.equal(aborted.epoch, 2);
  const back = transitionWriterAuthority(db2, { to: "BWH_ACTIVE", now: nowFn });
  assert.equal(back.phase, "BWH_ACTIVE");
  assert.equal(back.epoch, 3);
});

test("S1B-AUTH-6: illegal transitions are rejected and change nothing", (t) => {
  const db = memoryDb(t);
  ensureWriterAuthority(db, { now: nowFn });
  const illegal = [
    ["BWH_ACTIVE", "D1_ACTIVE"],
    ["BWH_ACTIVE", "RECOVERY"],
    ["BWH_ACTIVE", "BWH_ACTIVE"],
  ];
  for (const [from, to] of illegal) {
    assert.equal(readWriterAuthority(db).phase, from);
    assert.throws(
      () => transitionWriterAuthority(db, { to, now: nowFn }),
      (error) => {
        assertWriterError(error, "writer_transition_illegal");
        return true;
      },
      `${from} -> ${to} must be illegal`,
    );
    assert.equal(readWriterAuthority(db).phase, from);
    assert.equal(readWriterAuthority(db).epoch, 1);
  }
  transitionWriterAuthority(db, { to: "FROZEN", now: nowFn });
  transitionWriterAuthority(db, { to: "D1_ACTIVE", now: nowFn });
  transitionWriterAuthority(db, { to: "RECOVERY", now: nowFn });
  assert.throws(
    () => transitionWriterAuthority(db, { to: "BWH_ACTIVE", now: nowFn }),
    (error) => {
      // RECOVERY -> BWH_ACTIVE is blocked, not merely illegal: reverse
      // reconciliation is not implemented or verified yet.
      assertWriterError(error, "writer_transition_blocked");
      return true;
    },
  );
  assert.equal(readWriterAuthority(db).phase, "RECOVERY");
  assert.equal(readWriterAuthority(db).epoch, 4);
});

test("S1B-AUTH-7: transition with a stale expected epoch is rejected", (t) => {
  const db = memoryDb(t);
  assert.throws(
    () => transitionWriterAuthority(db, { to: "FROZEN", expectedEpoch: "9", now: nowFn }),
    (error) => {
      assertWriterError(error, "writer_epoch_stale");
      return true;
    },
  );
  assert.equal(readWriterAuthority(db).phase, "BWH_ACTIVE");
  assert.equal(readWriterAuthority(db).epoch, 1);
  const frozen = transitionWriterAuthority(db, { to: "FROZEN", expectedEpoch: 1, now: nowFn });
  assert.equal(frozen.epoch, 2);
});

// --- Fencing: stale epoch, frozen, D1-active, recovery, restart ---

test("S1B-AUTH-8: stale-epoch and future-epoch writes are rejected without effect", (t) => {
  const db = memoryDb(t);
  createSyntheticBusinessTables(db);
  for (const badEpoch of ["2", "999", "0"]) {
    assert.throws(
      () => guardedTransaction(db, badEpoch, () => insertSynthAccount(db, `acct-${badEpoch}`)),
      (error) => {
        assertWriterError(error, badEpoch === "0" ? "writer_epoch_required" : "writer_epoch_stale");
        return true;
      },
    );
  }
  assert.equal(countRows(db, "synth_accounts"), 0);
});

test("S1B-AUTH-9: a late queued job after freeze is rejected and writes nothing", (t) => {
  const db = memoryDb(t);
  createSyntheticBusinessTables(db);
  // The job was queued while BWH was active; the freeze lands first.
  insertSynthAccount(db, "acct-before-freeze");
  transitionWriterAuthority(db, { to: "FROZEN", now: nowFn });
  assert.throws(
    () => guardedTransaction(db, "1", () => insertSynthAccount(db, "acct-late-job")),
    (error) => {
      assertWriterError(error, "writer_authority_not_bwh");
      return true;
    },
  );
  assert.equal(countRows(db, "synth_accounts"), 1);
  assert.equal(db.prepare("select id from synth_accounts").get().id, "acct-before-freeze");
});

test("S1B-AUTH-10: a stale process after D1 activation is rejected", (t) => {
  const db = memoryDb(t);
  createSyntheticBusinessTables(db);
  transitionWriterAuthority(db, { to: "FROZEN", now: nowFn });
  transitionWriterAuthority(db, { to: "D1_ACTIVE", expectedEpoch: "2", now: nowFn });
  assert.equal(readWriterAuthority(db).epoch, 3);
  // The stale process still holds epoch 1 and BWH_ACTIVE assumptions.
  assert.throws(
    () => guardedTransaction(db, "1", () => insertSynthAccount(db, "acct-stale")),
    (error) => {
      assertWriterError(error, "writer_authority_not_bwh");
      assert.equal(error.phase, "D1_ACTIVE");
      return true;
    },
  );
  assert.equal(countRows(db, "synth_accounts"), 0);
  transitionWriterAuthority(db, { to: "RECOVERY", now: nowFn });
  assert.throws(
    () => guardedTransaction(db, undefined, () => insertSynthAccount(db, "acct-recovery")),
    (error) => {
      assertWriterError(error, "writer_authority_not_bwh");
      return true;
    },
  );
  assert.equal(countRows(db, "synth_accounts"), 0);
});

test("S1B-AUTH-11: restart while frozen keeps fencing (durable record, not process memory)", async (t) => {
  const path = await tempDbFile(t);
  const first = new Database(path);
  first.exec(`
    create table synth_accounts (
      id text primary key, status text not null, updated_at text not null
    );
  `);
  guardedTransaction(first, "1", () => insertSynthAccount(first, "acct-1"));
  transitionWriterAuthority(first, { to: "FROZEN", now: nowFn });
  first.close();

  // A new process with a fresh handle reopens the same file.
  const second = new Database(path);
  t.after(() => {
    try {
      second.close();
    } catch {
      // Already closed.
    }
  });
  const reopened = readWriterAuthority(second);
  assert.equal(reopened.phase, "FROZEN");
  assert.equal(reopened.epoch, 2);
  assert.throws(
    () => guardedTransaction(second, "1", () => insertSynthAccount(second, "acct-2")),
    (error) => {
      assertWriterError(error, "writer_authority_not_bwh");
      return true;
    },
  );
  assert.equal(countRows(second, "synth_accounts"), 1);
  // Explicit abort back to BWH_ACTIVE re-admits writes on the new handle.
  transitionWriterAuthority(second, { to: "BWH_ACTIVE", now: nowFn });
  guardedTransaction(second, "3", () => insertSynthAccount(second, "acct-2"));
  assert.equal(countRows(second, "synth_accounts"), 2);
});

// --- Freeze receipt ---

test("S1B-FRZ-1: freeze receipt verifies and carries the pre-freeze evidence", (t) => {
  const db = memoryDb(t);
  createSyntheticBusinessTables(db);
  insertSynthAccount(db, "acct-1");
  insertSynthAccount(db, "acct-2", "suspended");
  db.prepare(
    "insert into synth_credentials (id, account_id, password_hash, updated_at) values (?, ?, ?, ?)",
  ).run("cred-1", "acct-1", "synthetic-hash-aaa", NOW.toISOString());
  const receipt = buildFreezeReceipt(db, {
    snapshotId: "snap-synth-1",
    checkpointId: "ckpt-synth-1",
    outstandingJobs: [{ ref: "job-timer-1", kind: "scheduler" }],
    now: nowFn,
  });
  assert.equal(receipt.type, "bwh_freeze_receipt");
  assert.equal(receipt.version, 1);
  assert.equal(receipt.authority, "BWH");
  assert.equal(receipt.phase, "BWH_ACTIVE");
  assert.equal(receipt.epoch, 1);
  assert.equal(receipt.snapshotId, "snap-synth-1");
  assert.equal(receipt.checkpointId, "ckpt-synth-1");
  assert.equal(receipt.writerQuiescenceAsserted, true);
  assert.match(receipt.receiptDigest, /^[0-9a-f]{64}$/);
  assert.equal(receipt.outstandingJobs.count, 1);
  assert.equal(receipt.highWaterMark.totalRows, 3);
  const accounts = receipt.highWaterMark.tables.find((entry) => entry.table === "synth_accounts");
  assert.equal(accounts.rowCount, 2);
  assert.equal(accounts.maxUpdatedAt, NOW.toISOString());
  assert.equal(verifyFreezeReceipt(receipt), true);
});

test("S1B-FRZ-2: a tampered receipt fails verification", (t) => {
  const db = memoryDb(t);
  createSyntheticBusinessTables(db);
  insertSynthAccount(db, "acct-1");
  const receipt = buildFreezeReceipt(db, {
    snapshotId: "snap-synth-1",
    checkpointId: "ckpt-synth-1",
    now: nowFn,
  });
  assert.throws(
    () => verifyFreezeReceipt({ ...receipt, epoch: 2 }),
    (error) => {
      assertWriterError(error, "freeze_receipt_invalid");
      return true;
    },
  );
  const tamperedMark = {
    ...receipt,
    highWaterMark: {
      tables: receipt.highWaterMark.tables.map((entry) => ({ ...entry, rowCount: entry.rowCount + 1 })),
      totalRows: receipt.highWaterMark.totalRows + 1,
    },
  };
  assert.throws(
    () => verifyFreezeReceipt(tamperedMark),
    (error) => {
      assertWriterError(error, "freeze_receipt_invalid");
      return true;
    },
  );
  assert.throws(
    () => verifyFreezeReceipt({ ...receipt, receiptDigest: "0".repeat(64) }),
    (error) => {
      assertWriterError(error, "freeze_receipt_invalid");
      return true;
    },
  );
});

test("S1B-FRZ-3: freeze receipt does not change phase and requires BWH_ACTIVE", (t) => {
  const db = memoryDb(t);
  createSyntheticBusinessTables(db);
  buildFreezeReceipt(db, { snapshotId: "snap-1", checkpointId: "ckpt-1", now: nowFn });
  assert.equal(readWriterAuthority(db).phase, "BWH_ACTIVE");
  assert.equal(readWriterAuthority(db).epoch, 1);
  transitionWriterAuthority(db, { to: "FROZEN", now: nowFn });
  assert.throws(
    () => buildFreezeReceipt(db, { snapshotId: "snap-2", checkpointId: "ckpt-2", now: nowFn }),
    (error) => {
      assertWriterError(error, "writer_authority_not_bwh");
      return true;
    },
  );
});

// --- Source delta ---

const DELTA_TABLES = [
  { table: "synth_accounts", pk: "id" },
  { table: "synth_credentials", pk: "id" },
];

test("S1B-DLT-1: delta enumerates inserts, updates and deletes by PK and fingerprint", (t) => {
  const db = memoryDb(t);
  createSyntheticBusinessTables(db);
  insertSynthAccount(db, "acct-1");
  insertSynthAccount(db, "acct-2");
  const checkpoint = buildCheckpointManifest(db, { tables: DELTA_TABLES, snapshotId: "snap-1" });
  assert.equal(Object.keys(checkpoint.tables.synth_accounts).length, 2);

  insertSynthAccount(db, "acct-3");
  db.prepare("update synth_accounts set status = ? where id = ?").run("suspended", "acct-1");
  db.prepare("delete from synth_accounts where id = ?").run("acct-2");
  const delta = enumerateSourceDeltas(db, { tables: DELTA_TABLES, checkpoint });
  assert.equal(delta.sourceSnapshotId, "snap-1");
  assert.deepEqual(delta.summary, { tables: 2, inserted: 1, updated: 1, deleted: 1 });
  const accounts = delta.tables.find((entry) => entry.table === "synth_accounts");
  assert.deepEqual(accounts.inserted.map((row) => row.pk), ["acct-3"]);
  assert.deepEqual(accounts.updated.map((row) => row.pk), ["acct-1"]);
  assert.equal(accounts.updated[0].previousFingerprint, checkpoint.tables.synth_accounts["acct-1"]);
  assert.deepEqual(accounts.deleted.map((row) => row.pk), ["acct-2"]);
  const creds = delta.tables.find((entry) => entry.table === "synth_credentials");
  assert.deepEqual([creds.inserted, creds.updated, creds.deleted], [[], [], []]);
});

test("S1B-DLT-2: fingerprints never cover credential columns and deltas never carry values", (t) => {
  const db = memoryDb(t);
  createSyntheticBusinessTables(db);
  const hashA = "synthetic-scrypt-hash-aaaa";
  const hashB = "synthetic-scrypt-hash-bbbb";
  db.prepare(
    "insert into synth_credentials (id, account_id, password_hash, updated_at) values (?, ?, ?, ?)",
  ).run("cred-1", "acct-1", hashA, NOW.toISOString());
  const before = fingerprintRow(
    db.prepare("select * from synth_credentials where id = ?").get("cred-1"),
  );
  // Rotating only the credential must not change the fingerprint: no
  // credential material may influence an exported fingerprint.
  db.prepare("update synth_credentials set password_hash = ? where id = ?").run(hashB, "cred-1");
  const afterHashOnly = fingerprintRow(
    db.prepare("select * from synth_credentials where id = ?").get("cred-1"),
  );
  assert.equal(afterHashOnly, before);
  // A non-credential change does change it.
  db.prepare("update synth_credentials set updated_at = ? where id = ?")
    .run("2026-11-21T00:00:00.000Z", "cred-1");
  const afterVisible = fingerprintRow(
    db.prepare("select * from synth_credentials where id = ?").get("cred-1"),
  );
  assert.notEqual(afterVisible, before);

  const checkpoint = buildCheckpointManifest(db, {
    tables: [{ table: "synth_credentials", pk: "id" }],
    snapshotId: "snap-cred-1",
  });
  const delta = enumerateSourceDeltas(db, {
    tables: [{ table: "synth_credentials", pk: "id" }],
    checkpoint,
  });
  assert.deepEqual(delta.summary, { tables: 1, inserted: 0, updated: 0, deleted: 0 });
  const serialized = JSON.stringify({ checkpoint, delta });
  assert.ok(!serialized.includes(hashA), "delta artifacts must not contain credential values");
  assert.ok(!serialized.includes(hashB), "delta artifacts must not contain credential values");
});

test("S1B-DLT-3: delta enumeration fails closed on bad inputs", (t) => {
  const db = memoryDb(t);
  createSyntheticBusinessTables(db);
  assert.throws(
    () => buildCheckpointManifest(db, { tables: [{ table: "no_such_table", pk: "id" }], snapshotId: "s" }),
    (error) => error?.code === "delta_table_missing",
  );
  assert.throws(
    () => buildCheckpointManifest(db, { tables: [{ table: "synth_accounts", pk: "no_such_pk" }], snapshotId: "s" }),
    (error) => error?.code === "delta_pk_missing",
  );
  assert.throws(
    () => buildCheckpointManifest(db, { tables: DELTA_TABLES, snapshotId: "" }),
    (error) => error?.code === "delta_snapshot_required",
  );
  const checkpoint = buildCheckpointManifest(db, { tables: DELTA_TABLES, snapshotId: "snap-1" });
  assert.throws(
    () => enumerateSourceDeltas(db, { tables: DELTA_TABLES, checkpoint: null }),
    (error) => error?.code === "delta_checkpoint_invalid",
  );
  assert.throws(
    () => enumerateSourceDeltas(db, { tables: DELTA_TABLES, checkpoint: { ...checkpoint, snapshotId: "" } }),
    (error) => error?.code === "delta_checkpoint_invalid",
  );
});

// --- Store wiring: runInTransaction guarded path ---

test("S1B-STORE-1: runInTransaction guarded path enforces the epoch through the store", async (t) => {
  const path = await tempDbFile(t);
  const db = new Database(path);
  t.after(() => {
    try {
      db.close();
    } catch {
      // Already closed.
    }
  });
  const store = createSqliteSubscriptionControlStore({ database: db });
  assert.equal(readWriterAuthority(db).phase, "BWH_ACTIVE");
  assert.equal(readWriterAuthority(db).epoch, 1);

  const account = { id: "acct-store-1", ownerRef: "owner-store-1", createdAt: NOW.toISOString(), updatedAt: NOW.toISOString() };
  const created = store.runInTransaction(() => store.createAccount(account), { guarded: true, writerEpoch: "1" });
  assert.equal(created.id, "acct-store-1");

  // Unguarded behavior is unchanged while BWH is active.
  const created2 = store.runInTransaction(() => store.createAccount({
    ...account, id: "acct-store-2", ownerRef: "owner-store-2",
  }));
  assert.equal(created2.id, "acct-store-2");

  // A stale epoch rejects the write and leaves no row behind.
  assert.throws(
    () => store.runInTransaction(() => store.createAccount({
      ...account, id: "acct-store-3", ownerRef: "owner-store-3",
    }), { guarded: true, writerEpoch: "9" }),
    (error) => {
      assertWriterError(error, "writer_epoch_stale");
      return true;
    },
  );
  assert.equal(store.getAccount("acct-store-3"), null);

  // Freezing the durable record fences the store even for old callers
  // that pass no epoch at all.
  transitionWriterAuthority(db, { to: "FROZEN", now: nowFn });
  assert.throws(
    () => store.runInTransaction(() => store.createAccount({
      ...account, id: "acct-store-4", ownerRef: "owner-store-4",
    }), { guarded: true, writerEpoch: "2" }),
    (error) => {
      assertWriterError(error, "writer_authority_not_bwh");
      return true;
    },
  );
  assert.equal(store.getAccount("acct-store-4"), null);
});

// --- Wallet idempotency under the guard (real wallet store) ---

function walletFixture(t) {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  t.after(() => {
    try {
      db.close();
    } catch {
      // Already closed.
    }
  });
  db.exec(`create table platform_accounts(
    id text primary key, owner_ref text not null, status text not null,
    created_at text not null, updated_at text not null, metadata_json text not null default '{}')`);
  db.prepare(
    "insert into platform_accounts values(?,?,'active',?,?,'{}')",
  ).run("acct-wallet-1", "owner-wallet-1", NOW.toISOString(), NOW.toISOString());
  applyCoinWalletMigrations({
    database: db,
    expectedMigrationId: REQUIRED_COIN_WALLET_MIGRATION_ID,
    expectedDdlChecksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum,
    nowFn,
  });
  let sequence = 0;
  const wallet = createSqliteCoinWalletStore({
    database: db,
    nowFn,
    refFactory: (kind) => `${kind}_${++sequence}`,
  });
  return { db, wallet };
}

function creditInput(idempotencyKey) {
  return {
    accountId: "acct-wallet-1",
    coinType: "paid_coins",
    amountUnits: 500,
    availability: "available",
    sourceType: "synthetic_seed",
    sourceRef: "source_stage1b",
    sourceDigest: "a".repeat(64),
    policyRef: null,
    policyVersion: null,
    expiresAt: null,
    operation: {
      actorScope: "system:stage1b-test",
      idempotencyKey,
      actorType: "system",
      actorRef: "stage1b_test",
    },
  };
}

test("S1B-WALLET-1: an identical wallet credit retried under the guard never duplicates the ledger", (t) => {
  const { db, wallet } = walletFixture(t);
  const first = guardedTransaction(db, "1", () => wallet.creditCoins(creditInput("credit_stage1b_1")));
  assert.equal(first.ok, true);
  assert.equal(first.replayed, false);
  const second = guardedTransaction(db, "1", () => wallet.creditCoins(creditInput("credit_stage1b_1")));
  assert.equal(second.ok, true);
  assert.equal(second.replayed, true);
  assert.equal(second.operationRef, first.operationRef);
  const entries = wallet.listLedgerEntries({ walletRef: first.walletRef });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].amountUnits, 500);
});

test("S1B-WALLET-2: a frozen authority rejects the wallet retry before any ledger effect", (t) => {
  const { db, wallet } = walletFixture(t);
  const first = guardedTransaction(db, "1", () => wallet.creditCoins(creditInput("credit_stage1b_2")));
  assert.equal(first.ok, true);
  transitionWriterAuthority(db, { to: "FROZEN", now: nowFn });
  assert.throws(
    () => guardedTransaction(db, "2", () => wallet.creditCoins(creditInput("credit_stage1b_2"))),
    (error) => {
      assertWriterError(error, "writer_authority_not_bwh");
      return true;
    },
  );
  const entries = wallet.listLedgerEntries({ walletRef: first.walletRef });
  assert.equal(entries.length, 1);
});
