// D1 Stage 1B — wiring of the phase-only writer fence into the
// service-layer write paths: the central store's runInTransaction
// default path, the coin-commerce store's 13 named write transactions,
// and its W-063 caller-owned write participant. The fence rejects a frozen / D1-active database before
// any business effect, and the commerce store lets the fence error
// keep its own code (writer_authority_not_bwh) instead of wrapping it
// as commerce_infrastructure_error, so callers can tell a frozen
// database apart from an infrastructure failure.
//
// All fixtures are synthetic: throwaway temp-file SQLite databases
// built by the tests themselves. Nothing here connects to BWH, a
// Worker, or any real control plane, and no production SQLite file or
// secret ever enters a test artifact.

import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { mkdtemp, rm } from "node:fs/promises";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ensureWriterAuthority,
  readWriterAuthority,
  transitionWriterAuthority,
} from "../services/platform/single-writer-authority.mjs";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import {
  COIN_COMMERCE_MIGRATIONS,
  REQUIRED_COIN_COMMERCE_MIGRATION_ID,
  applyCoinCommerceMigrations,
} from "../services/platform/coin-commerce-migrations.mjs";
import {
  COIN_WALLET_MIGRATIONS,
  REQUIRED_COIN_WALLET_MIGRATION_ID,
  applyCoinWalletMigrations,
} from "../services/platform/coin-wallet-migrations.mjs";
import {
  createSqliteCoinCommerceStore,
} from "../services/platform/coin-commerce-store.mjs";

const NOW = new Date("2026-11-20T00:00:00.000Z");
const CLOCK = "2026-07-26T12:34:56.000Z";

async function tempDb(t) {
  const dir = await mkdtemp(join(tmpdir(), "stage1b-wiring-"));
  const db = new Database(join(dir, "synthetic.sqlite"));
  t.after(async () => {
    db.close();
    await rm(dir, { recursive: true, force: true });
  });
  return db;
}

function assertWriterError(error, code) {
  assert.equal(error?.name, "WriterAuthorityError", `expected WriterAuthorityError, got ${error}`);
  assert.equal(error?.code, code, `expected ${code}, got ${error?.code}: ${error?.message}`);
}

function account(id) {
  return {
    id,
    ownerRef: `owner-${id}`,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
  };
}

// --- Central store: plain runInTransaction (no options) ---

test("S1B-WIRE-1: plain runInTransaction commits while BWH_ACTIVE and leaves the epoch at 1", async (t) => {
  const db = await tempDb(t);
  const store = createSqliteSubscriptionControlStore({ database: db });
  assert.equal(readWriterAuthority(db).phase, "BWH_ACTIVE");

  const created = store.runInTransaction(() => store.createAccount(account("acct-wire-1")));
  assert.equal(created.id, "acct-wire-1");
  assert.equal(store.getAccount("acct-wire-1").id, "acct-wire-1");
  assert.equal(readWriterAuthority(db).epoch, 1);
});

test("S1B-WIRE-2: plain runInTransaction rejects while FROZEN and re-admits after abort", async (t) => {
  const db = await tempDb(t);
  const store = createSqliteSubscriptionControlStore({ database: db });
  store.runInTransaction(() => store.createAccount(account("acct-wire-2a")));
  assert.equal(readWriterAuthority(db).epoch, 1);

  transitionWriterAuthority(db, { to: "FROZEN" });
  assert.equal(readWriterAuthority(db).epoch, 2);
  assert.throws(
    () => store.runInTransaction(() => store.createAccount(account("acct-wire-2b"))),
    (error) => {
      assertWriterError(error, "writer_authority_not_bwh");
      return true;
    },
  );
  assert.equal(store.getAccount("acct-wire-2b"), null);

  // The explicit abort path re-admits plain internal writers.
  transitionWriterAuthority(db, { to: "BWH_ACTIVE" });
  assert.equal(readWriterAuthority(db).epoch, 3);
  const created = store.runInTransaction(() => store.createAccount(account("acct-wire-2c")));
  assert.equal(created.id, "acct-wire-2c");
});

test("S1B-WIRE-3: plain runInTransaction rejects after D1_ACTIVE and in RECOVERY", async (t) => {
  const db = await tempDb(t);
  const store = createSqliteSubscriptionControlStore({ database: db });

  transitionWriterAuthority(db, { to: "FROZEN" });
  transitionWriterAuthority(db, { to: "D1_ACTIVE" });
  assert.equal(readWriterAuthority(db).phase, "D1_ACTIVE");
  assert.throws(
    () => store.runInTransaction(() => store.createAccount(account("acct-wire-3a"))),
    (error) => {
      assertWriterError(error, "writer_authority_not_bwh");
      return true;
    },
  );
  assert.equal(store.getAccount("acct-wire-3a"), null);

  transitionWriterAuthority(db, { to: "RECOVERY" });
  assert.equal(readWriterAuthority(db).phase, "RECOVERY");
  assert.throws(
    () => store.runInTransaction(() => store.createAccount(account("acct-wire-3b"))),
    (error) => {
      assertWriterError(error, "writer_authority_not_bwh");
      return true;
    },
  );
  assert.equal(store.getAccount("acct-wire-3b"), null);
});

// --- Coin-commerce store: named write transactions ---

function refFactory() {
  const counts = new Map();
  return (kind) => {
    const count = (counts.get(kind) ?? 0) + 1;
    counts.set(kind, count);
    return `${kind}_${count}`;
  };
}

function offer(overrides = {}) {
  return {
    offerRef: "offer_monthly_basic",
    offerVersionRef: "offerv_monthly_basic_v1",
    version: 1,
    category: "plan",
    title: { zh: "基础月卡", en: "Basic monthly plan" },
    summary: { zh: "每月 50 GB", en: "50 GB monthly" },
    importantNotices: {
      zh: ["仅用于平台自营服务"],
      en: ["For platform-owned services only"],
    },
    baseCoinUnits: 20,
    referencePrice: { currency: "CNY", amountMinor: 2_000 },
    acceptedCoinTypes: ["bonus_coins", "paid_coins", "reward_coins"],
    delivery: {
      kind: "subscription_plan",
      durationDays: 30,
      monthlyTrafficGb: 50,
      trafficGb: null,
      neverExpires: false,
      discountBasisPoints: 500,
    },
    ...overrides,
  };
}

function createCommerceSchema(dbPath) {
  const database = new Database(dbPath);
  database.pragma("foreign_keys = ON");
  database.exec(`
    create table platform_accounts (
      id text primary key,
      owner_ref text not null,
      status text not null check (status in ('active', 'suspended', 'disabled')),
      created_at text not null,
      updated_at text not null,
      metadata_json text not null default '{}'
    )
  `);
  applyCoinWalletMigrations({
    database,
    expectedMigrationId: REQUIRED_COIN_WALLET_MIGRATION_ID,
    expectedDdlChecksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum,
    nowFn: () => new Date(CLOCK),
  });
  applyCoinCommerceMigrations({
    database,
    expectedMigrationId: REQUIRED_COIN_COMMERCE_MIGRATION_ID,
    expectedDdlChecksum: COIN_COMMERCE_MIGRATIONS[0].ddlChecksum,
    nowFn: () => new Date(CLOCK),
  });
  return database;
}

function commerceFixture(t) {
  const directory = mkdtempSync(join(tmpdir(), "stage1b-wiring-commerce-"));
  const dbPath = join(directory, "commerce.sqlite");
  const database = createCommerceSchema(dbPath);
  database.prepare(`
    insert into platform_accounts
      (id, owner_ref, status, created_at, updated_at, metadata_json)
    values (?, ?, 'active', ?, ?, '{}')
  `).run("acct_synthetic_1", "owner_acct_synthetic_1", CLOCK, CLOCK);
  const store = createSqliteCoinCommerceStore({
    database,
    commerceRefFactory: refFactory(),
    walletRefFactory: refFactory(),
  });
  t.after(() => {
    try {
      store.close();
    } catch {
      // Already closed.
    }
    try {
      database.close();
    } catch {
      // Already closed.
    }
    rmSync(directory, { recursive: true, force: true, maxRetries: 3 });
  });
  return { directory, database, store };
}

function offerCount(database) {
  return database.prepare(
    "select count(*) from platform_coin_commerce_offer_versions",
  ).pluck().get();
}

function offerStatus(database, offerVersionRef) {
  return database.prepare(
    "select status from platform_coin_commerce_offer_versions where offer_version_ref = ?",
  ).pluck().get(offerVersionRef);
}

function quoteCount(database) {
  return database.prepare(
    "select count(*) from platform_coin_commerce_quotes",
  ).pluck().get();
}

test("S1B-WIRE-4: commerce publishOfferVersion commits while BWH_ACTIVE", (t) => {
  const { database, store } = commerceFixture(t);
  const published = store.publishOfferVersion(offer());
  assert.equal(published.offerRef, "offer_monthly_basic");
  assert.equal(offerStatus(database, "offerv_monthly_basic_v1"), "published");
  assert.equal(offerCount(database), 1);
  assert.equal(readWriterAuthority(database).phase, "BWH_ACTIVE");
  assert.equal(readWriterAuthority(database).epoch, 1);
});

test("S1B-WIRE-5: commerce publishOfferVersion rejects while FROZEN with the fence code, not a wrapped infrastructure error", (t) => {
  const { database, store } = commerceFixture(t);
  ensureWriterAuthority(database);
  transitionWriterAuthority(database, { to: "FROZEN" });
  assert.equal(readWriterAuthority(database).phase, "FROZEN");

  assert.throws(
    () => store.publishOfferVersion(offer()),
    (error) => {
      assertWriterError(error, "writer_authority_not_bwh");
      return true;
    },
  );
  assert.equal(offerCount(database), 0);

  transitionWriterAuthority(database, { to: "BWH_ACTIVE" });
  const published = store.publishOfferVersion(offer());
  assert.equal(published.offerRef, "offer_monthly_basic");
  assert.equal(offerStatus(database, "offerv_monthly_basic_v1"), "published");
  assert.equal(offerCount(database), 1);
});

test("S1B-WIRE-6: commerce createCheckoutQuote rejects while FROZEN and commits after abort", (t) => {
  const { database, store } = commerceFixture(t);
  store.publishOfferVersion(offer());
  assert.equal(offerCount(database), 1);

  transitionWriterAuthority(database, { to: "FROZEN" });
  assert.throws(
    () => store.createCheckoutQuote({
      accountId: "acct_synthetic_1",
      offerRef: "offer_monthly_basic",
    }),
    (error) => {
      assertWriterError(error, "writer_authority_not_bwh");
      return true;
    },
  );
  assert.equal(quoteCount(database), 0);

  transitionWriterAuthority(database, { to: "BWH_ACTIVE" });
  const quote = store.createCheckoutQuote({
    accountId: "acct_synthetic_1",
    offerRef: "offer_monthly_basic",
  });
  assert.equal(typeof quote.quoteRef, "string");
  assert.equal(quoteCount(database), 1);
});

test("S1B-WIRE-7: commerce retireOfferVersion rejects while FROZEN and the offer stays published", (t) => {
  const { database, store } = commerceFixture(t);
  store.publishOfferVersion(offer());
  assert.equal(offerStatus(database, "offerv_monthly_basic_v1"), "published");

  transitionWriterAuthority(database, { to: "FROZEN" });
  assert.throws(
    () => store.retireOfferVersion({
      offerRef: "offer_monthly_basic",
      offerVersionRef: "offerv_monthly_basic_v1",
    }),
    (error) => {
      assertWriterError(error, "writer_authority_not_bwh");
      return true;
    },
  );
  assert.equal(offerStatus(database, "offerv_monthly_basic_v1"), "published");

  transitionWriterAuthority(database, { to: "BWH_ACTIVE" });
  const retired = store.retireOfferVersion({
    offerRef: "offer_monthly_basic",
    offerVersionRef: "offerv_monthly_basic_v1",
  });
  assert.equal(retired.offerRef, "offer_monthly_basic");
  assert.equal(offerStatus(database, "offerv_monthly_basic_v1"), "retired");
});

// --- Source-shape invariant: named transactions and W-063 are fenced ---

const FENCED_COMMERCE_WRITERS = [
  "const publishTransaction = db.transaction(",
  "const bootstrapTransaction = db.transaction(",
  "const retireTransaction = db.transaction(",
  "const createQuoteTransaction = db.transaction(",
  "const confirmTransaction = db.transaction(",
  "const cancelTransaction = db.transaction(",
  "const claimCapturesTransaction = db.transaction(",
  "function captureOrderBody(",
  "const recoverTransaction = db.transaction(",
  "const claimCommandTransaction = db.transaction(",
  "const completeCommandTransaction = db.transaction(",
  "const failCommandTransaction = db.transaction(",
  "const nextWakeTransaction = db.transaction(",
];

const COMMERCE_FENCE = /^\s*assertCommerceWritable\(\);$/;
const commerceSourcePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "services",
  "platform",
  "coin-commerce-store.mjs",
);

function assertCommerceFenceInventory(source) {
  const lines = source.split(/\r?\n/);
  function firstFenceAfter(at, label) {
    const next = lines.findIndex((line, index) =>
      index > at && line.trim() && !line.trimStart().startsWith("//"));
    assert.ok(next !== -1 && COMMERCE_FENCE.test(lines[next]),
      `fence is not the first statement of ${label}: ${lines[next] ?? "<none>"}`);
    return next;
  }
  const expected = FENCED_COMMERCE_WRITERS.map(definition => {
    const at = lines.findIndex(line => line.includes(definition));
    assert.notEqual(at, -1, `missing write transaction definition: ${definition}`);
    return firstFenceAfter(at, definition);
  });

  // W-063 runs inside the caller's transaction, not a db.transaction()
  // declared by this store. Verify the exact complete() callback, not inspect().
  const participant = lines.indexOf("  const initialConfirmationParticipant = Object.freeze({");
  assert.notEqual(participant, -1, "missing W-063 initial confirmation participant");
  const participantEnd = lines.indexOf("  });", participant + 1);
  const complete = lines.indexOf("    complete(input) {", participant + 1);
  assert.ok(complete > participant && complete < participantEnd,
    "missing W-063 initialConfirmationParticipant.complete()");
  assert.equal(lines[complete + 1], "      return initialConfirmationAction(() => {",
    "W-063 complete() must use the caller-transaction wrapper");
  expected.push(firstFenceAfter(complete + 1, "W-063 complete() callback"));

  const actual = lines.flatMap((line, index) => COMMERCE_FENCE.test(line) ? [index] : []);
  assert.deepEqual(actual, expected.sort((a, b) => a - b),
    "unexpected fence outside the inventoried transaction bodies");
}

test("S1B-WIRE-8: named commerce transactions and W-063 fence before business logic", () => {
  assertCommerceFenceInventory(readFileSync(commerceSourcePath, "utf8"));
});

test("S1B-WIRE-8 regression: a late W-063 fence is rejected even when fence count stays the same", () => {
  const source = readFileSync(commerceSourcePath, "utf8").replace(/\r\n/g, "\n");
  const original = "        assertCommerceWritable();\n        const value = assertPlainObject(input);";
  assert.ok(source.includes(original), "expected W-063 fixture anchor");
  const late = source.replace(original,
    "        const value = assertPlainObject(input);\n        assertCommerceWritable();");
  assert.throws(() => assertCommerceFenceInventory(late),
    /fence is not the first statement of W-063 complete/);
});

test("S1B-WIRE-9: write callbacks on two connections are fenced by the same freeze", (t) => {
  const { directory, database, store } = commerceFixture(t);
  const database2 = new Database(join(directory, "commerce.sqlite"));
  database2.pragma("busy_timeout = 5000");
  const store2 = createSqliteCoinCommerceStore({
    database: database2,
    commerceRefFactory: refFactory(),
    walletRefFactory: refFactory(),
  });
  try {
    // A second offer, so the two callbacks do not collide on one row.
    const second = offer({
      offerRef: "offer_monthly_premium",
      offerVersionRef: "offerv_monthly_premium_v1",
      title: { zh: "高级月卡", en: "Premium monthly plan" },
    });
    // The synchronous driver runs the callbacks sequentially. Both see
    // the committed freeze on their own connection.
    ensureWriterAuthority(database);
    transitionWriterAuthority(database, { to: "FROZEN" });
    assert.throws(
      () => store.publishOfferVersion(second),
      (error) => {
        assertWriterError(error, "writer_authority_not_bwh");
        return true;
      },
    );
    assert.throws(
      () => store2.publishOfferVersion(second),
      (error) => {
        assertWriterError(error, "writer_authority_not_bwh");
        return true;
      },
    );
    assert.equal(offerCount(database), 0);
    // Abort re-admits both: each callback then commits on its own
    // connection, sequentially.
    transitionWriterAuthority(database, { to: "BWH_ACTIVE" });
    const viaFirst = store.publishOfferVersion(second);
    assert.equal(viaFirst.offerRef, "offer_monthly_premium");
    assert.equal(offerCount(database), 1);
    const viaSecond = store2.publishOfferVersion(offer());
    assert.equal(viaSecond.offerRef, "offer_monthly_basic");
    assert.equal(offerCount(database), 2);
  } finally {
    try {
      store2.close();
    } catch {
      // Already closed.
    }
    try {
      database2.close();
    } catch {
      // Already closed.
    }
  }
});
