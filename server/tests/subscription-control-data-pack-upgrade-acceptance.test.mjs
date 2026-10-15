import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";

import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import { createSqliteCoinCommerceStore } from "../services/platform/coin-commerce-store.mjs";
import { applyCoinWalletMigrations, COIN_WALLET_MIGRATIONS,
  REQUIRED_COIN_WALLET_MIGRATION_ID } from "../services/platform/coin-wallet-migrations.mjs";
import { applyCoinCommerceMigrations, COIN_COMMERCE_MIGRATIONS,
  REQUIRED_COIN_COMMERCE_MIGRATION_ID } from "../services/platform/coin-commerce-migrations.mjs";
import { COIN_COMMERCE_DATA_PACK_CANDIDATES } from "../services/platform/coin-commerce-production-catalog.mjs";
import { readFullMeteringBindings } from "../../scripts/lib/traffic-vless-recovery-baseline.mjs";

// Synthetic acceptance only. The co-resident database is constructed from source,
// not copied from production or loaded with a historical release binary. The
// existing cross-db recovery suite owns interrupted fulfillment replay coverage.
const ACCOUNT = "acct_pack_upgrade";
const NOW = "2026-09-29T00:00:00.000Z";
const TIMED = "ent_pack_upgrade_timed";
const TIMED_REQUEST = "request_pack_upgrade_timed";
const CHANNEL = "channel_pack_upgrade";
const PACK_TABLES = [
  "platform_data_pack_credential_resets",
  "platform_data_pack_artifact_rotations",
  "platform_data_pack_edge_credentials",
  "platform_data_pack_resources"
];

function digest(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function tableRows(database, name) {
  // Every name comes from this synthetic database's own sqlite_master inventory.
  return database.prepare(`select * from "${name.replaceAll('"', '""')}"`)
    .all().map((row) => JSON.stringify(row)).sort();
}

function inventory(database, { legacyOnly = false } = {}) {
  const schema = database.prepare(`select type, name, tbl_name, sql from sqlite_master
    where name not like 'sqlite_%' order by type, name`).all()
    .filter((row) => !legacyOnly || !PACK_TABLES.includes(row.tbl_name));
  const data = Object.fromEntries(schema.filter((row) => row.type === "table")
    .map((row) => [row.name, digest(tableRows(database, row.name))]));
  return { schemaDigest: digest(schema), data };
}

function clockedDatabase(database, clock) {
  return new Proxy(database, {
    get(target, property) {
      if (property === "inTransaction") return target.inTransaction;
      if (property === "prepare") return (sql) => {
        if (/select\s+strftime\('%Y-%m-%dT%H:%M:%fZ',\s*'now'\)/i.test(sql)) {
          return { pluck: () => ({ get: () => clock.value }) };
        }
        return target.prepare(sql);
      };
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
}

function openStores(path, clock, { initializeCoins = false } = {}) {
  const database = new Database(path);
  const control = createSqliteSubscriptionControlStore({ database });
  if (initializeCoins) {
    applyCoinWalletMigrations({ database,
      expectedMigrationId: REQUIRED_COIN_WALLET_MIGRATION_ID,
      expectedDdlChecksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum,
      nowFn: () => new Date(clock.value) });
    applyCoinCommerceMigrations({ database,
      expectedMigrationId: REQUIRED_COIN_COMMERCE_MIGRATION_ID,
      expectedDdlChecksum: COIN_COMMERCE_MIGRATIONS[0].ddlChecksum,
      nowFn: () => new Date(clock.value) });
  }
  const commerce = createSqliteCoinCommerceStore({
    database: clockedDatabase(database, clock), cancelWindowMs: 0
  });
  return { database, control, commerce, close() {
    commerce.close();
    control.close();
    database.close();
  } };
}

function usageSample(suffix, entitlementId, requestId, bytes) {
  return {
    id: `sample_pack_upgrade_${suffix}`, sourceRef: `source_pack_upgrade_${suffix}`,
    channelRef: CHANNEL, edgeCredentialRef: `edgecred_pack_upgrade_${suffix}`,
    accountId: ACCOUNT, entitlementId, requestId,
    observedAt: NOW, intervalStartedAt: "2026-09-28T23:59:00.000Z",
    intervalEndedAt: NOW, uploadBytes: bytes, downloadBytes: 0,
    sampleDigest: `digest_pack_upgrade_${suffix}`, createdAt: NOW
  };
}

function withLegacyFixture(run) {
  const directory = mkdtempSync(join(tmpdir(), "pack-upgrade-acceptance-"));
  const path = join(directory, "control-commerce.sqlite");
  const backupPath = join(directory, "before-pack.sqlite");
  const clock = { value: NOW };
  const opened = new Set();
  const open = (target = path, options) => {
    const stores = openStores(target, clock, options);
    opened.add(stores);
    return stores;
  };
  const close = (stores) => {
    stores.close();
    opened.delete(stores);
  };
  try {
    const stores = open(path, { initializeCoins: true });
    const { control, commerce, database } = stores;
    control.createAccount({ id: ACCOUNT, ownerRef: "owner_pack_upgrade",
      status: "active", createdAt: NOW, updatedAt: NOW });
    control.createEntitlement({ id: TIMED, accountId: ACCOUNT,
      plan: "offerv_plan_30d_100gb_monthly_v1", status: "active",
      validFrom: "2026-09-01T00:00:00.000Z", validUntil: "2026-10-01T00:00:00.000Z",
      trafficLimitBytes: 100 * 1024 ** 3, createdAt: NOW, updatedAt: NOW });
    control.createIssuanceRequest({ id: TIMED_REQUEST, accountId: ACCOUNT,
      entitlementId: TIMED, approvalRef: "approval_pack_upgrade_timed",
      status: "issued", quantity: 1, nodeId: CHANNEL,
      purpose: "coin_commerce_product_fulfillment", requestedByRef: "fixture_issuer",
      createdAt: NOW, updatedAt: NOW });
    control.linkIssuedSubscription({ id: "link_pack_upgrade_timed",
      requestId: TIMED_REQUEST, tenantRef: "tenant_pack_upgrade_timed",
      artifactRef: "artifact_pack_upgrade_timed", status: "active",
      createdAt: NOW, updatedAt: NOW });
    control.recordUsageSample(usageSample("timed", TIMED, TIMED_REQUEST, 7 * 1024 ** 3));
    database.prepare(`insert into platform_portal_access_requests
      (id, portal_user_ref, plan, client_target, duration_days, quantity,
       status, next_action, prior_trial_state, submitted_at, updated_at)
      values ('access_pack_upgrade_monthly', 'owner_pack_upgrade', 'monthly', 'clash',
        30, 1, 'pending_admin_review', 'await_review', 'none', ?, ?)`)
      .run(NOW, NOW);
    commerce.walletStore.creditCoins({ accountId: ACCOUNT, coinType: "paid_coins",
      amountUnits: 200, availability: "available", sourceType: "synthetic_seed",
      sourceRef: "credit_pack_upgrade", sourceDigest: "a".repeat(64),
      policyRef: null, policyVersion: null, expiresAt: null,
      operation: { actorScope: "system:pack_upgrade", idempotencyKey: "credit_pack_upgrade",
        actorType: "system", actorRef: "pack_upgrade" } });
    // Removing only empty additive objects models a pre-pack schema. It does not
    // claim that this is a dump of the current production schema/version.
    for (const table of PACK_TABLES) database.exec(`drop table ${table}`);
    const before = inventory(database);
    assert.ok(tableRows(database, "platform_coin_ledger_entries").length > 0);
    assert.equal(database.pragma("foreign_key_check").length, 0);
    close(stores);
    // Both owners are closed, so no outstanding WAL writer can invalidate the copy.
    copyFileSync(path, backupPath);
    return run({ directory, path, backupPath, clock, before, open, close });
  } finally {
    for (const stores of opened) stores.close();
    rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
}

test("additive pack upgrade preserves existing timed plan, usage, Coins and schema through restart", () => {
  withLegacyFixture(({ path, backupPath, before, open, close }) => {
    for (let restart = 0; restart < 2; restart += 1) {
      const stores = open();
      const { database, control } = stores;
      assert.deepEqual(inventory(database, { legacyOnly: true }), before);
      for (const table of PACK_TABLES) assert.equal(tableRows(database, table).length, 0);
      assert.equal(control.resolveAccountServiceEntitlement({ accountId: ACCOUNT, now: NOW })?.id, TIMED);
      assert.equal(control.getUsageRollupByEdgeCredentialRef("edgecred_pack_upgrade_timed").totalBytes,
        7 * 1024 ** 3);
      assert.equal(database.pragma("foreign_key_check").length, 0);
      assert.equal(database.pragma("integrity_check", { simple: true }), "ok");
      close(stores);
    }
    // Snapshot restore is proved only while there have been zero business writes.
    copyFileSync(backupPath, path);
    const restored = new Database(path, { readonly: true });
    try { assert.deepEqual(inventory(restored), before); }
    finally { restored.close(); }
  });
});

test("post-write recovery retains captured Coins, delivered pack and usage instead of restoring the old snapshot", () => {
  withLegacyFixture(({ directory, backupPath, clock, open, close }) => {
    let stores = open();
    const { commerce, control } = stores;
    const oldLedger = tableRows(stores.database, "platform_coin_ledger_entries");
    commerce.publishOfferVersion(COIN_COMMERCE_DATA_PACK_CANDIDATES[0]);
    const quote = commerce.createCheckoutQuote({ accountId: ACCOUNT, offerRef: "offer_pack_100gb" });
    const confirmation = { accountId: ACCOUNT, quoteRef: quote.quoteRef,
      operation: { actorScope: `portal:${ACCOUNT}`, idempotencyKey: "confirm_pack_upgrade",
        actorType: "portal_user", actorRef: ACCOUNT } };
    const order = commerce.confirmOrder(confirmation);
    clock.value = order.cancelUntil;
    commerce.claimDueCaptures({ limit: 1 });
    commerce.captureClaimedOrder({ orderRef: order.orderRef });
    const claim = commerce.claimNextFulfillmentCommand({ leaseMs: 1000 });
    const reservation = { commandRef: claim.commandRef, orderRef: claim.orderRef,
      accountId: ACCOUNT, offerVersionRef: claim.offerVersionRef,
      quotaBytes: 100 * 1024 ** 3, nodeId: CHANNEL, now: clock.value };
    const reserved = control.reserveCoinCommerceDataPackIssuance(reservation);
    // No runtime process is started; only synthetic runtime references are bound.
    const finalization = { commandRef: claim.commandRef, orderRef: claim.orderRef,
      accountId: ACCOUNT, nodeId: CHANNEL, now: clock.value, requestRef: reserved.requestRef,
      entitlementRef: reserved.entitlementRef, tenantRef: "tenant_pack_upgrade",
      artifactRef: "artifact_pack_upgrade" };
    const issued = control.completeCoinCommerceDataPackIssuance(finalization);
    const fulfillment = { commandRef: claim.commandRef, orderRef: claim.orderRef,
      accountId: ACCOUNT, offerVersionRef: claim.offerVersionRef,
      quotaBytes: reservation.quotaBytes, requestRef: reserved.requestRef,
      entitlementRef: reserved.entitlementRef, issuedLinkRef: issued.issuedLinkRef,
      technicalValidUntil: "9999-12-31T23:59:59.999Z",
      commercialNeverExpires: true, createdAt: clock.value };
    const effect = control.applyCoinCommerceDataPackFulfillment(fulfillment);
    commerce.completeFulfillmentCommand({ commandRef: claim.commandRef,
      leaseGeneration: claim.leaseGeneration, leaseToken: claim.leaseToken,
      effectRef: effect.effectRef, status: "delivered" });
    const sample = usageSample("pack", reserved.entitlementRef, reserved.requestRef, 3 * 1024 ** 3);
    control.recordUsageSample(sample);
    const postWrite = inventory(stores.database);
    const ledger = tableRows(stores.database, "platform_coin_ledger_entries");
    assert.ok(ledger.length > oldLedger.length);
    assert.ok(oldLedger.every((row) => ledger.includes(row)), "original Coins entries remain immutable");
    close(stores);

    stores = open();
    assert.deepEqual(inventory(stores.database), postWrite);
    assert.equal(stores.commerce.confirmOrder(confirmation).orderRef, order.orderRef);
    assert.equal(stores.control.reserveCoinCommerceDataPackIssuance(reservation).requestRef, reserved.requestRef);
    assert.deepEqual(stores.control.completeCoinCommerceDataPackIssuance(finalization), issued);
    assert.deepEqual(stores.control.applyCoinCommerceDataPackFulfillment(fulfillment), effect);
    assert.equal(stores.control.recordUsageSample(sample).inserted, false);
    assert.equal(stores.commerce.claimNextFulfillmentCommand({ leaseMs: 1000 }), null);
    assert.equal(stores.control.readDataPackResourceUsage({ accountId: ACCOUNT,
      orderRef: order.orderRef, requestRef: reserved.requestRef,
      entitlementRef: reserved.entitlementRef, now: clock.value }).usage.usedBytes, 3 * 1024 ** 3);
    assert.equal(stores.control.resolveAccountServiceEntitlement({ accountId: ACCOUNT, now: NOW })?.id, TIMED);
    assert.equal(stores.database.pragma("foreign_key_check").length, 0);
    assert.equal(stores.database.pragma("integrity_check", { simple: true }), "ok");
    assert.equal(digest(tableRows(stores.database, "platform_coin_ledger_entries")), digest(ledger));
    close(stores);

    // Negative control: an old snapshot loses post-write financial/resource facts.
    // Restore it only into a separate disposable path. This is a detection test,
    // not an implemented production restore guard or old-binary compatibility
    // proof. After writes, preserve the current database and use a separately
    // approved code-only rollback/forward recovery, with readers and writers
    // checked against the retained schema and pending pack work.
    const stalePath = join(directory, "unsafe-pre-write-restore.sqlite");
    copyFileSync(backupPath, stalePath);
    const stale = new Database(stalePath, { readonly: true });
    try {
      const staleLedger = tableRows(stale, "platform_coin_ledger_entries");
      assert.equal(digest(staleLedger), digest(oldLedger));
      assert.notEqual(digest(staleLedger), digest(ledger),
        "pre-write snapshot cannot preserve post-write Coins entries");
      assert.ok(ledger.some((row) => !staleLedger.includes(row)),
        "restoring the old snapshot would remove committed Coins entries");
      assert.equal(stale.prepare(`select count(*) from platform_coin_commerce_orders
        where order_ref = ?`).pluck().get(order.orderRef), 0);
      assert.equal(stale.prepare(`select count(*) from platform_usage_samples
        where id = ?`).pluck().get(sample.id), 0);
      assert.equal(stale.prepare(`select name from sqlite_master
        where name = 'platform_data_pack_resources'`).get(), undefined);
    } finally { stale.close(); }
  });
});

test("full-metering reader accepts an issued pack beside a valid timed binding without changing stored facts", () => {
  withLegacyFixture(({ open, close }) => {
    const stores = open();
    const { database, control } = stores;
    // This is only an identifier in a disposable SQLite fixture. No channel,
    // collector, provider, protocol process or external endpoint is contacted.
    const channel = "channel-vultr-a-hy2";
    database.prepare("update platform_issuance_requests set node_id = ? where id = ?")
      .run(channel, TIMED_REQUEST);
    control.upsertPortalAccessRequest({ id: TIMED_REQUEST, portalUserRef: ACCOUNT,
      plan: "monthly", clientTarget: "clash", durationDays: 30, quantity: 1,
      status: "delivered", nextAction: "user_can_use_access", noteProvided: false,
      priorTrialState: "not_applicable", submittedAt: NOW, updatedAt: NOW,
      validUntil: "2026-10-01T00:00:00.000Z", entitlementRef: TIMED,
      accessGrantRef: "grant_pack_upgrade_timed", tenantId: "tenant_pack_upgrade_timed",
      artifactId: "artifact_pack_upgrade_timed", edgeChannelRef: channel,
      edgeCredentialRef: "edgecred_pack_upgrade_timed",
      edgeMaterialDigest: `sha256:${"c".repeat(64)}` });
    const read = () => database.transaction(() => readFullMeteringBindings({
      db: database, databaseIdentityDigest: "a".repeat(64),
      channelRefs: [channel], now: NOW
    }))();
    const before = inventory(database);
    assert.equal(read().entries.length, 1, "the existing timed binding is accepted");
    assert.deepEqual(inventory(database), before);
    const claim = { commandRef: "command_pack_reader_probe", orderRef: "order_pack_reader_probe",
      accountId: ACCOUNT, offerVersionRef: "offerv_pack_100gb_v1",
      quotaBytes: 100 * 1024 ** 3, nodeId: channel, now: NOW };
    const reserved = control.reserveCoinCommerceDataPackIssuance(claim);
    const issued = control.completeCoinCommerceDataPackIssuance({
      commandRef: claim.commandRef, orderRef: claim.orderRef, accountId: ACCOUNT,
      requestRef: reserved.requestRef, entitlementRef: reserved.entitlementRef,
      nodeId: channel, tenantRef: "tenant_pack_reader_probe",
      artifactRef: "artifact_pack_reader_probe", now: NOW
    });
    control.registerCoinCommerceDataPackEdgeCredential({ requestRef: reserved.requestRef,
      entitlementRef: reserved.entitlementRef, edgeChannelRef: channel,
      edgeCredentialRef: "edgecred_pack_reader_probe", edgeMaterialDigest: `sha256:${"d".repeat(64)}`,
      now: NOW });
    control.applyCoinCommerceDataPackFulfillment({ commandRef: claim.commandRef,
      orderRef: claim.orderRef, accountId: ACCOUNT, requestRef: reserved.requestRef,
      entitlementRef: reserved.entitlementRef, issuedLinkRef: issued.issuedLinkRef,
      offerVersionRef: claim.offerVersionRef, quotaBytes: claim.quotaBytes,
      technicalValidUntil: "9999-12-31T23:59:59.999Z", commercialNeverExpires: true,
      createdAt: NOW });
    assert.equal(control.findIssuedSubscriptionBindingByEdgeCredentialRef(
      "edgecred_pack_reader_probe")?.requestId, reserved.requestRef);
    const after = inventory(database);
    // Both resources must reach the actual five-source reader; silently skipping
    // the independent pack must not turn this regression green.
    const bindings = read();
    assert.equal(bindings.entries.length, 2);
    assert.equal(bindings.entries.filter(entry => entry.requestId === TIMED_REQUEST).length, 1);
    const packBindings = bindings.entries.filter(entry => entry.requestId === reserved.requestRef);
    assert.equal(packBindings.length, 1);
    assert.equal(packBindings[0].accountId, ACCOUNT);
    assert.equal(packBindings[0].entitlementId, reserved.entitlementRef);
    assert.equal(packBindings[0].channelRef, channel);
    assert.equal(bindings.retainedBindings.length, 0);
    assert.deepEqual(inventory(database), after);
    close(stores);
  });
});
