import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { createAdminUserMonitorService } from "../services/platform/admin-user-monitor.mjs";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const FROM = "2026-01-10T00:00:00.000Z";
const TO = "2026-01-13T00:00:00.000Z";
const DAY_MS = 86400000;

function withCtx(coinsWalletStore, fn) {
  const database = new Database(":memory:");
  const controlStore = createSqliteSubscriptionControlStore({ database });
  try {
    return fn({
      database,
      controlStore,
      service: createAdminUserMonitorService({ controlStore, coinsWalletStore })
    });
  } finally {
    controlStore.close();
    database.close();
  }
}

function putAccount(store, id, createdAt, metadata = {}, status = "active") {
  store.createAccount({
    id,
    ownerRef: "owner_must_not_leak",
    status,
    createdAt,
    updatedAt: createdAt,
    metadata
  });
}

function putUsage(store, accountId, samples) {
  const entitlementId = `ent_${accountId}`;
  const requestId = `req_${accountId}`;
  store.createEntitlement({
    id: entitlementId,
    accountId,
    plan: "monthly",
    status: "expired",
    validFrom: "2025-01-01T00:00:00.000Z",
    validUntil: "2025-12-31T00:00:00.000Z",
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-12-31T00:00:00.000Z"
  });
  store.createIssuanceRequest({
    id: requestId,
    accountId,
    entitlementId,
    approvalRef: "appr_1",
    status: "issued",
    quantity: 1,
    nodeId: "node_1",
    purpose: "access",
    requestedByRef: "op_1",
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z"
  });
  for (const sample of samples) {
    store.recordUsageSample({
      id: sample.id,
      sourceRef: "src_1",
      channelRef: "ch_1",
      edgeCredentialRef: `edge_${accountId}`,
      accountId,
      entitlementId,
      requestId,
      observedAt: sample.at,
      intervalStartedAt: sample.at,
      intervalEndedAt: sample.at,
      uploadBytes: sample.up,
      downloadBytes: sample.down,
      sampleDigest: `sha256:${sample.id}`,
      createdAt: sample.at
    });
  }
}

function cursorOf(createdAt, id) {
  return Buffer.from(JSON.stringify({ createdAt, id })).toString("base64url");
}

function codeOf(fn) {
  try {
    fn();
    return null;
  } catch (error) {
    return error.code;
  }
}

function totalChanges(database) {
  return database.prepare("select total_changes() as n").get().n;
}

test("readGrowth counts self_service vs other and fills empty UTC days", () => {
  withCtx(null, ({ database, controlStore, service }) => {
    putAccount(controlStore, "acc_self", "2026-01-10T01:00:00.000Z", {
      registrationSource: "self_service_portal"
    });
    putAccount(controlStore, "acc_other", "2026-01-12T02:00:00.000Z", {});
    putAccount(controlStore, "acc_bad", "2026-01-12T03:00:00.000Z", {
      registrationSource: "admin"
    });
    putAccount(controlStore, "acc_out", "2026-01-13T00:00:00.000Z", {
      registrationSource: "self_service_portal"
    });
    const before = totalChanges(database);
    const body = service.readGrowth({ from: FROM, to: TO });
    assert.equal(totalChanges(database), before);
    assert.equal(body.schemaVersion, "admin-user-monitor/v1");
    assert.equal(new Date(body.generatedAt).toISOString(), body.generatedAt);
    assert.equal(body.timezone, "UTC");
    assert.equal(body.from, FROM);
    assert.equal(body.to, TO);
    assert.equal(body.registeredCount, 1);
    assert.equal(body.otherCreatedCount, 2);
    assert.deepEqual(body.points, [
      { at: "2026-01-10T00:00:00.000Z", registeredCount: 1, otherCreatedCount: 0 },
      { at: "2026-01-11T00:00:00.000Z", registeredCount: 0, otherCreatedCount: 0 },
      { at: "2026-01-12T00:00:00.000Z", registeredCount: 0, otherCreatedCount: 2 }
    ]);
    const shifted = service.readGrowth({
      from: "2026-01-10T08:00:00+08:00",
      to: "2026-01-13T08:00:00+08:00"
    });
    assert.equal(shifted.from, FROM);
    assert.equal(shifted.registeredCount, 1);
    assert.equal(shifted.otherCreatedCount, 2);
  });
});

test("readGrowth and readTraffic reject calendar, 31-day, duplicate and unknown query", () => {
  withCtx(null, ({ controlStore, service }) => {
    putAccount(controlStore, "acc_q", FROM);
    const exact = new Date(Date.parse(FROM) + 31 * DAY_MS).toISOString();
    const over = new Date(Date.parse(FROM) + 31 * DAY_MS + 1).toISOString();
    const ok = service.readGrowth({ from: FROM, to: exact });
    assert.equal(ok.to, exact);
    assert.equal(codeOf(() => service.readGrowth({ from: FROM, to: over })), "invalid_query");
    assert.equal(codeOf(() => service.readGrowth({
      from: "2026-02-31T00:00:00.000Z",
      to: "2026-03-01T00:00:00.000Z"
    })), "invalid_query");
    assert.equal(codeOf(() => service.readGrowth({ from: FROM, to: FROM })), "invalid_query");
    assert.equal(codeOf(() => service.readGrowth({ from: [FROM, FROM], to: TO })), "invalid_query");
    assert.equal(codeOf(() => service.readGrowth({ from: FROM, to: TO, extra: "1" })), "invalid_query");
    assert.equal(codeOf(() => service.readGrowth({
      from: "2026-01-10T00:00:00.000",
      to: TO
    })), "invalid_query");
    assert.equal(codeOf(() => service.readTraffic("acc_q", { from: FROM, to: over })), "invalid_query");
    assert.equal(codeOf(() => service.readTraffic("acc_q", {
      from: FROM,
      to: TO,
      bucket: "week"
    })), "invalid_query");
    assert.equal(codeOf(() => service.readTraffic("acc_q", {
      from: FROM,
      to: TO,
      foo: "1"
    })), "invalid_query");
  });
});

test("readAccounts paginates same createdAt, redacts identity fields, and rejects bad query", () => {
  withCtx(null, ({ controlStore, service }) => {
    const ts = "2026-01-12T00:00:00.000Z";
    putAccount(controlStore, "acc_z", ts, { registrationSource: "self_service_portal" });
    putAccount(controlStore, "acc_a", ts, {});
    putAccount(controlStore, "acc_old", "2026-01-11T00:00:00.000Z", {}, "suspended");
    const page1 = service.readAccounts({ limit: 1 });
    assert.deepEqual(page1.items, [{
      id: "acc_z",
      status: "active",
      createdAt: ts,
      registrationSource: "self_service_portal"
    }]);
    assert.equal(page1.nextCursor, cursorOf(ts, "acc_z"));
    const page2 = service.readAccounts({ limit: 1, cursor: page1.nextCursor });
    assert.equal(page2.items[0].id, "acc_a");
    assert.equal(page2.items[0].registrationSource, "other");
    const rest = service.readAccounts({ cursor: page2.nextCursor, limit: 10 });
    assert.equal(rest.items[0].id, "acc_old");
    assert.equal(rest.nextCursor, null);
    assert.equal(service.readAccounts({ accountId: "acc_old", status: "suspended" }).items.length, 1);
    const raw = JSON.stringify(page1);
    assert.equal(raw.includes("owner_must_not_leak"), false);
    assert.equal(raw.includes("displayName"), false);
    assert.equal(codeOf(() => service.readAccounts({ cursor: "%%%" })), "invalid_query");
    assert.equal(codeOf(() => service.readAccounts({ accountId: ["acc_z", "acc_a"] })), "invalid_query");
    assert.equal(codeOf(() => service.readAccounts({ unknown: "x" })), "invalid_query");
    assert.equal(codeOf(() => service.readAccounts({
      accountId: "acc_z' OR '1'='1"
    })), "invalid_query");
  });
});

test("readTraffic aggregates exact-account history, preserves gaps, and does not write", () => {
  withCtx(null, ({ database, controlStore, service }) => {
    putAccount(controlStore, "acc_t", FROM);
    putAccount(controlStore, "acc_zero", FROM);
    putAccount(controlStore, "acc_idle", FROM);
    putAccount(controlStore, "acc_other", FROM);
    putUsage(controlStore, "acc_t", [
      { id: "s1", at: "2026-01-10T00:10:00.000Z", up: 10, down: 20 },
      { id: "s2", at: "2026-01-10T02:00:00.000Z", up: 1, down: 2 },
      { id: "s3", at: "2026-01-12T00:00:00.000Z", up: 4, down: 5 }
    ]);
    putUsage(controlStore, "acc_zero", [
      { id: "z1", at: "2026-01-10T00:00:00.000Z", up: 0, down: 0 }
    ]);
    putUsage(controlStore, "acc_other", [
      { id: "o1", at: "2026-01-10T00:00:00.000Z", up: 999, down: 999 }
    ]);
    const before = totalChanges(database);
    const missing = service.readTraffic("acc_idle", { from: FROM, to: TO });
    assert.equal(missing.state, "not_collected");
    assert.equal(missing.totalBytes, null);
    assert.deepEqual(missing.points, []);
    const zero = service.readTraffic("acc_zero", { from: FROM, to: TO });
    assert.equal(zero.state, "measured_zero");
    assert.equal(zero.totalBytes, 0);
    assert.equal(zero.uploadBytes, 0);
    assert.equal(zero.downloadBytes, 0);
    const full = service.readTraffic("acc_t", { from: FROM, to: TO, bucket: "day" });
    assert.equal(full.state, "measured");
    assert.equal(full.sampleCount, 3);
    assert.equal(full.totalBytes, 42);
    assert.equal(full.uploadBytes, 15);
    assert.equal(full.downloadBytes, 27);
    assert.equal(full.lastObservedAt, "2026-01-12T00:00:00.000Z");
    assert.deepEqual(full.points.map((point) => point.at), [
      "2026-01-10T00:00:00.000Z",
      "2026-01-12T00:00:00.000Z"
    ]);
    const hourly = service.readTraffic("acc_t", {
      from: "2026-01-10T00:00:00.000Z",
      to: "2026-01-10T03:00:00.000Z",
      bucket: "hour"
    });
    assert.deepEqual(hourly.points.map((point) => point.at), [
      "2026-01-10T00:00:00.000Z",
      "2026-01-10T02:00:00.000Z"
    ]);
    assert.equal(codeOf(() => service.readTraffic("missing_acc", { from: FROM, to: TO })), "account_not_found");
    assert.equal(totalChanges(database), before);
    assert.doesNotMatch(JSON.stringify(full), /edge_|src_1|ent_acc_t/);
  });
});

test("readCoins maps category deltas, missing wallet, unavailable source, and unknown account", () => {
  const walletStore = {
    getWalletProjection({ accountId }) {
      assert.equal(accountId, "acc_coins");
      return {
        exists: true,
        walletRef: "wallet_acc_coins",
        status: "active",
        version: 4,
        totals: { paid_coins: 8, bonus_coins: 0, reward_coins: 0 },
        spendableUnits: 8,
        heldUnits: 0,
        pendingUnits: 0
      };
    },
    listLedgerEntries({ walletRef, limit }) {
      assert.equal(walletRef, "wallet_acc_coins");
      return [
        { entryRef: "e_credit", walletRef: "wallet_acc_coins", occurredAt: "2026-01-12T00:00:00.000Z", operation: "credit", coinType: "paid_coins", amountUnits: 5, actorRef: "actor_secret", sourceRef: "src_secret", lotRef: "lot_secret", holdRef: null, operationRef: "op_secret" },
        { entryRef: "e_hold", walletRef: "wallet_acc_coins", occurredAt: "2026-01-11T00:00:00.000Z", operation: "available_to_held", coinType: "paid_coins", amountUnits: 2 },
        { entryRef: "e_consume", walletRef: "wallet_acc_coins", occurredAt: "2026-01-11T00:00:00.000Z", operation: "held_to_consumed", coinType: "paid_coins", amountUnits: 2 },
        { entryRef: "e_p2a", walletRef: "wallet_acc_coins", occurredAt: "2026-01-10T00:00:00.000Z", operation: "pending_to_available", coinType: "paid_coins", amountUnits: 3 }
      ].slice(0, limit);
    }
  };
  withCtx(walletStore, ({ controlStore, service }) => {
    putAccount(controlStore, "acc_coins", FROM);
    const body = service.readCoins("acc_coins", { limit: 10 });
    assert.equal(body.accountId, "acc_coins");
    assert.equal(body.wallet.status, "active");
    assert.deepEqual(body.wallet.balances, { paidCoins: 8, bonusCoins: 0, rewardCoins: 0 });
    assert.deepEqual(body.entries.map((entry) => [
      entry.category, entry.availableDeltaUnits, entry.pendingDeltaUnits, entry.heldDeltaUnits, entry.totalDeltaUnits
    ]), [
      ["credit", null, null, null, 5],
      ["available_to_held", -2, 0, 2, 0],
      ["held_to_consumed", 0, 0, -2, -2],
      ["pending_to_available", 3, -3, 0, 0]
    ]);
    assert.doesNotMatch(JSON.stringify(body), /wallet_acc_coins|actor_secret|src_secret|lot_secret|op_secret|actorRef|sourceRef|lotRef|operationRef/);
  });
  withCtx({
    getWalletProjection() {
      return {
        exists: false,
        status: "not_created",
        version: 0,
        totals: { paid_coins: 0, bonus_coins: 0, reward_coins: 0 },
        spendableUnits: 0,
        heldUnits: 0,
        pendingUnits: 0
      };
    },
    listLedgerEntries() {
      return [];
    }
  }, ({ controlStore, service }) => {
    putAccount(controlStore, "acc_empty", FROM);
    const empty = service.readCoins("acc_empty", {});
    assert.equal(empty.wallet.status, "not_created");
    assert.equal(empty.wallet.balances.paidCoins, 0);
    assert.deepEqual(empty.entries, []);
  });
  withCtx(null, ({ controlStore, service }) => {
    putAccount(controlStore, "acc_coins", FROM);
    assert.equal(codeOf(() => service.readCoins("acc_coins", {})), "source_unavailable");
    assert.equal(codeOf(() => service.readCoins("missing_acc", {})), "account_not_found");
  });
  withCtx({
    getWalletProjection() {
      throw new Error("disk");
    },
    listLedgerEntries() {
      return [];
    }
  }, ({ controlStore, service }) => {
    putAccount(controlStore, "acc_coins", FROM);
    assert.equal(codeOf(() => service.readCoins("acc_coins", {})), "source_unavailable");
  });
});

function boom(code) {
  const error = new Error("hidden_store_message");
  error.code = code;
  throw error;
}

test("readCoins rejects spendable mismatch and coin total overflow", () => {
  const projection = {
    exists: true,
    walletRef: "wallet_acc_coins",
    status: "active",
    version: 1,
    totals: { paid_coins: 8, bonus_coins: 0, reward_coins: 0 },
    spendableUnits: 6,
    heldUnits: 0,
    pendingUnits: 0
  };
  withCtx({
    getWalletProjection: () => projection,
    listLedgerEntries: () => []
  }, ({ controlStore, service }) => {
    putAccount(controlStore, "acc_coins", FROM);
    assert.equal(codeOf(() => service.readCoins("acc_coins", {})), "source_unavailable");
  });
  withCtx({
    getWalletProjection: () => ({
      ...projection,
      totals: { paid_coins: Number.MAX_SAFE_INTEGER, bonus_coins: 1, reward_coins: 0 },
      spendableUnits: Number.MAX_SAFE_INTEGER
    }),
    listLedgerEntries: () => []
  }, ({ controlStore, service }) => {
    putAccount(controlStore, "acc_coins", FROM);
    assert.equal(codeOf(() => service.readCoins("acc_coins", {})), "source_unavailable");
  });
});

test("store failures and malformed source rows are source_unavailable", () => {
  withCtx({
    getWalletProjection: () => boom("invalid_query"),
    listLedgerEntries: () => []
  }, ({ controlStore, service }) => {
    putAccount(controlStore, "acc_coins", FROM);
    assert.equal(codeOf(() => service.readCoins("acc_coins", {})), "source_unavailable");
  });
  const thrown = createAdminUserMonitorService({
    controlStore: {
      getAccount() {
        boom("account_not_found");
      },
      listUserMonitorGrowthDays() {
        boom("invalid_query");
      },
      listUserMonitorAccountDirectory() {
        return [{
          id: "acc/slash",
          status: "active",
          createdAt: FROM,
          registrationSource: "other"
        }];
      },
      summarizeUserMonitorTraffic() {
        return {
          sampleCount: 1,
          lastObservedAt: "2026-01-10T00:00:00+00:00",
          uploadBytes: 1,
          downloadBytes: 0,
          totalBytes: 1,
          points: [{
            at: "2026-01-10T00:00:00.000Z",
            sampleCount: 1,
            uploadBytes: 1,
            downloadBytes: 0,
            totalBytes: 1
          }]
        };
      }
    },
    coinsWalletStore: null
  });
  assert.equal(codeOf(() => thrown.readGrowth({ from: FROM, to: TO })), "source_unavailable");
  assert.equal(codeOf(() => thrown.readAccounts({})), "source_unavailable");
  assert.equal(codeOf(() => thrown.readTraffic("acc_q", { from: FROM, to: TO })), "source_unavailable");
  const missing = createAdminUserMonitorService({
    controlStore: {
      getAccount: () => null,
      summarizeUserMonitorTraffic() {
        throw new Error("must_not_run");
      }
    },
    coinsWalletStore: null
  });
  assert.equal(codeOf(() => missing.readTraffic("acc_q", { from: FROM, to: TO })), "account_not_found");
  withCtx(null, ({ service }) => {
    assert.equal(codeOf(() => service.readGrowth({ from: FROM, to: TO, extra: "1" })), "invalid_query");
    assert.equal(codeOf(() => service.readTraffic("missing_acc", { from: FROM, to: TO })), "account_not_found");
  });
});

test("accountId and entryRef allow dots and reject slashes", () => {
  withCtx({
    getWalletProjection: () => ({
      exists: true,
      walletRef: "wallet_acc.dot.1",
      status: "active",
      version: 1,
      totals: { paid_coins: 1, bonus_coins: 0, reward_coins: 0 },
      spendableUnits: 1,
      heldUnits: 0,
      pendingUnits: 0
    }),
    listLedgerEntries: ({ walletRef }) => [{
      entryRef: "e.dot:1",
      walletRef,
      occurredAt: "2026-01-12T00:00:00.000Z",
      operation: "credit",
      coinType: "paid_coins",
      amountUnits: 1
    }]
  }, ({ controlStore, service }) => {
    putAccount(controlStore, "acc.dot.1", FROM);
    const listed = service.readAccounts({ accountId: "acc.dot.1" });
    assert.equal(listed.items[0].id, "acc.dot.1");
    const coins = service.readCoins("acc.dot.1", {});
    assert.equal(coins.entries[0].entryRef, "e.dot:1");
    assert.equal(codeOf(() => service.readAccounts({ accountId: "acc/slash" })), "invalid_query");
    assert.equal(codeOf(() => service.readCoins("acc/slash", {})), "invalid_query");
  });
  const slashSource = createAdminUserMonitorService({
    controlStore: {
      getAccount: () => ({ id: "acc_coins" }),
      listUserMonitorAccountDirectory: () => []
    },
    coinsWalletStore: {
      getWalletProjection: () => ({
        exists: true,
        walletRef: "wallet_acc_coins",
        status: "active",
        version: 1,
        totals: { paid_coins: 1, bonus_coins: 0, reward_coins: 0 },
        spendableUnits: 1,
        heldUnits: 0,
        pendingUnits: 0
      }),
      listLedgerEntries: () => [{
        entryRef: "e/slash",
        walletRef: "wallet_acc_coins",
        occurredAt: "2026-01-12T00:00:00.000Z",
        operation: "credit",
        coinType: "paid_coins",
        amountUnits: 1
      }]
    }
  });
  assert.equal(codeOf(() => slashSource.readCoins("acc_coins", {})), "source_unavailable");
});

test("cursors require canonical unpadded base64url and exact schema", () => {
  withCtx(null, ({ controlStore, service }) => {
    const ts = "2026-01-12T00:00:00.000Z";
    putAccount(controlStore, "acc_z", ts);
    putAccount(controlStore, "acc_a", ts);
    const page1 = service.readAccounts({ limit: 1 });
    const page2 = service.readAccounts({ limit: 1, cursor: page1.nextCursor });
    assert.equal(page2.items[0].id, "acc_a");
    assert.equal(codeOf(() => service.readAccounts({ cursor: `${page1.nextCursor}!` })), "invalid_query");
    assert.equal(codeOf(() => service.readAccounts({ cursor: `${page1.nextCursor}=` })), "invalid_query");
    assert.equal(codeOf(() => service.readAccounts({
      cursor: Buffer.from("{", "utf8").toString("base64url")
    })), "invalid_query");
    assert.equal(codeOf(() => service.readAccounts({
      cursor: Buffer.from(JSON.stringify({ createdAt: ts, id: "acc_z", extra: "x" })).toString("base64url")
    })), "invalid_query");
    assert.equal(codeOf(() => service.readAccounts({
      cursor: Buffer.from(JSON.stringify({ createdAt: "2026-02-31T00:00:00.000Z", id: "acc_z" })).toString("base64url")
    })), "invalid_query");
  });
});

test("growth accepts fractional seconds, offset date crossing, year 0099, and year 0000 leap day", () => {
  withCtx(null, ({ controlStore, service }) => {
    putAccount(controlStore, "acc_year99", "0099-06-01T12:00:00.000Z");
    putAccount(controlStore, "acc_leap0", "0000-02-29T00:00:00.000Z");
    const fractions = service.readGrowth({
      from: "2026-01-10T00:00:00.1Z",
      to: "2026-01-10T00:00:00.12Z"
    });
    assert.equal(fractions.from, "2026-01-10T00:00:00.100Z");
    assert.equal(fractions.to, "2026-01-10T00:00:00.120Z");
    const millis = service.readGrowth({
      from: "2026-01-10T00:00:00.123Z",
      to: "2026-01-11T00:00:00.000Z"
    });
    assert.equal(millis.from, "2026-01-10T00:00:00.123Z");
    const crossed = service.readGrowth({
      from: "2026-01-10T02:00:00+08:00",
      to: "2026-01-11T02:00:00+08:00"
    });
    assert.equal(crossed.from, "2026-01-09T18:00:00.000Z");
    assert.equal(crossed.to, "2026-01-10T18:00:00.000Z");
    const year99 = service.readGrowth({
      from: "0099-06-01T00:00:00.000Z",
      to: "0099-06-03T00:00:00.000Z"
    });
    assert.equal(year99.from, "0099-06-01T00:00:00.000Z");
    assert.equal(year99.otherCreatedCount, 1);
    assert.deepEqual(year99.points.map((point) => point.at), [
      "0099-06-01T00:00:00.000Z",
      "0099-06-02T00:00:00.000Z"
    ]);
    const leap = service.readGrowth({
      from: "0000-02-28T00:00:00.000Z",
      to: "0000-03-01T00:00:00.000Z"
    });
    assert.deepEqual(leap.points.map((point) => point.at), [
      "0000-02-28T00:00:00.000Z",
      "0000-02-29T00:00:00.000Z"
    ]);
    assert.equal(leap.otherCreatedCount, 1);
    assert.equal(codeOf(() => service.readGrowth({
      from: "2026-02-31T00:00:00.000Z",
      to: "2026-03-01T00:00:00.000Z"
    })), "invalid_query");
    const exact = new Date(Date.parse(FROM) + 31 * DAY_MS).toISOString();
    assert.equal(service.readGrowth({ from: FROM, to: exact }).to, exact);
  });
});

test("growth rejects duplicate, out-of-range, and overflowing aggregate days", () => {
  const days = [
    { at: "2026-01-10T00:00:00.000Z", registeredCount: 1, otherCreatedCount: 0 },
    { at: "2026-01-11T00:00:00.000Z", registeredCount: 0, otherCreatedCount: 0 },
    { at: "2026-01-12T00:00:00.000Z", registeredCount: 0, otherCreatedCount: 0 }
  ];
  const serviceOf = (rows) => createAdminUserMonitorService({
    controlStore: { listUserMonitorGrowthDays: () => rows }
  });
  assert.equal(codeOf(() => serviceOf([days[0], days[0], days[1], days[2]]).readGrowth({ from: FROM, to: TO })), "source_unavailable");
  assert.equal(codeOf(() => serviceOf([
    { at: "2026-01-09T00:00:00.000Z", registeredCount: 1, otherCreatedCount: 0 },
    ...days
  ]).readGrowth({ from: FROM, to: TO })), "source_unavailable");
  assert.equal(codeOf(() => serviceOf([
    { at: "2026-01-10T00:00:00.000Z", registeredCount: Number.MAX_SAFE_INTEGER, otherCreatedCount: 0 },
    { at: "2026-01-11T00:00:00.000Z", registeredCount: 1, otherCreatedCount: 0 },
    days[2]
  ]).readGrowth({ from: FROM, to: TO })), "source_unavailable");
});

test("readTraffic totals stay consistent with points under WAL writer interleave", () => {
  const dir = mkdtempSync(join(tmpdir(), "aum-wal-"));
  const dbPath = join(dir, "control.sqlite");
  let db1;
  let db2;
  let store;
  let injected = false;
  let readerTransactionAtInjection = null;
  try {
    db1 = new Database(dbPath);
    db1.pragma("journal_mode = WAL");
    store = createSqliteSubscriptionControlStore({ database: db1 });
    putAccount(store, "acc_t", FROM);
    putUsage(store, "acc_t", [
      { id: "s1", at: "2026-01-10T00:10:00.000Z", up: 10, down: 0 }
    ]);
    db2 = new Database(dbPath);
    db2.pragma("foreign_keys = ON");
    const originalPrepare = db1.prepare.bind(db1);
    db1.prepare = (sql) => {
      const statement = originalPrepare(sql);
      if (sql.includes("max(observed_at) as last_observed_at") && sql.includes("from platform_usage_samples")) {
        const originalGet = statement.get.bind(statement);
        statement.get = (...parameters) => {
          const totals = originalGet(...parameters);
          if (!injected) {
            injected = true;
            readerTransactionAtInjection = db1.inTransaction;
            db2.prepare(`
              insert into platform_usage_samples (
                id, source_ref, channel_ref, edge_credential_ref, account_id,
                entitlement_id, request_id, observed_at, interval_started_at,
                interval_ended_at, upload_bytes, download_bytes, total_bytes,
                sample_digest, created_at
              ) values (
                's2', 'src_1', 'ch_1', 'edge_acc_t', 'acc_t',
                'ent_acc_t', 'req_acc_t', '2026-01-10T02:00:00.000Z',
                '2026-01-10T02:00:00.000Z', '2026-01-10T02:00:00.000Z',
                20, 0, 20, 'sha256:s2', '2026-01-10T02:00:00.000Z'
              )
            `).run();
          }
          return totals;
        };
      }
      return statement;
    };
    const changes = () => originalPrepare("select total_changes() as n").get().n;
    const before = changes();
    const service = createAdminUserMonitorService({
      controlStore: store,
      coinsWalletStore: null
    });
    const query = { from: FROM, to: TO, bucket: "day" };
    const first = service.readTraffic("acc_t", query);
    assert.equal(injected, true);
    assert.equal(readerTransactionAtInjection, true);
    assert.equal(first.sampleCount, 1);
    assert.equal(first.totalBytes, 10);
    assert.equal(first.points.reduce((sum, point) => sum + point.sampleCount, 0), 1);
    assert.equal(first.points.reduce((sum, point) => sum + point.totalBytes, 0), 10);
    const second = service.readTraffic("acc_t", query);
    assert.equal(second.sampleCount, 2);
    assert.equal(second.totalBytes, 30);
    assert.equal(second.points.reduce((sum, point) => sum + point.sampleCount, 0), 2);
    assert.equal(second.points.reduce((sum, point) => sum + point.totalBytes, 0), 30);
    assert.equal(changes(), before);
  } finally {
    store?.close();
    db1?.close();
    db2?.close();
    rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
});

test("readCoins fail-closed when ledger walletRef does not match the selected wallet", () => {
  withCtx({
    getWalletProjection({ accountId }) {
      assert.equal(accountId, "acc_coins");
      return {
        exists: true,
        walletRef: "wallet_acc_coins",
        status: "active",
        version: 1,
        totals: { paid_coins: 1, bonus_coins: 0, reward_coins: 0 },
        spendableUnits: 1,
        heldUnits: 0,
        pendingUnits: 0
      };
    },
    listLedgerEntries() {
      return [{
        entryRef: "e_bad",
        occurredAt: "2026-01-12T00:00:00.000Z",
        operation: "credit",
        coinType: "paid_coins",
        amountUnits: 1,
        walletRef: "wallet_other"
      }];
    }
  }, ({ controlStore, service }) => {
    putAccount(controlStore, "acc_coins", FROM);
    assert.equal(codeOf(() => service.readCoins("acc_coins", {})), "source_unavailable");
  });
});
