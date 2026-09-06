import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import * as schema from "../services/platform/coin-commerce-migrations.mjs";
import { applyCoinWalletMigrations, COIN_WALLET_MIGRATIONS,
  REQUIRED_COIN_WALLET_MIGRATION_ID } from "../services/platform/coin-wallet-migrations.mjs";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import { createSqliteCoinCommerceStore } from "../services/platform/coin-commerce-store.mjs";
import { COIN_COMMERCE_PRODUCTION_OFFERS } from "../services/platform/coin-commerce-production-catalog.mjs";

const NOW = "2026-09-06T12:00:00.000Z";
const TABLE = "platform_coin_commerce_initial_confirmations";
const BASE_CHECKSUM = "39ef5f2280d5fad55472ef083c7d896817763cee3bb998b2deb0792ec324a44e";
const sha = (value) => createHash("sha256").update(value).digest("hex");
const operation = (id, accountId) => ({ actorScope: `portal:${accountId}`,
  idempotencyKey: id, actorType: "portal_user", actorRef: accountId });

function fixture({ failed = false } = {}) {
  const database = new Database(":memory:");
  database.pragma("foreign_keys = ON");
  const control = createSqliteSubscriptionControlStore({ database });
  applyCoinWalletMigrations({ database,
    expectedMigrationId: REQUIRED_COIN_WALLET_MIGRATION_ID,
    expectedDdlChecksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum });
  schema.applyCoinCommerceMigrations({ database,
    expectedMigrationId: schema.REQUIRED_COIN_COMMERCE_MIGRATION_ID,
    expectedDdlChecksum: BASE_CHECKSUM });
  const state = { database, control, close() { this.store?.close(); control.close(); database.close(); } };
  if (!failed) return state;
  const accountId = "acct_initial_confirmation_synthetic";
  control.createAccount({ id: accountId, ownerRef: accountId, status: "active",
    createdAt: NOW, updatedAt: NOW });
  const clock = { value: NOW };
  const clockDatabase = new Proxy(database, { get(target, key) {
    if (key === "prepare") return (sql) => /select\s+strftime\('%Y-%m-%dT%H:%M:%fZ',\s*'now'\)/i.test(sql)
      ? { pluck: () => ({ get: () => clock.value }) } : target.prepare(sql);
    const value = Reflect.get(target, key, target);
    return typeof value === "function" ? value.bind(target) : value;
  } });
  const store = createSqliteCoinCommerceStore({ database: clockDatabase });
  state.store = store;
  store.walletStore.creditCoins({ accountId, coinType: "paid_coins", amountUnits: 50,
    availability: "available", sourceType: "synthetic_seed", sourceRef: "source_initial_confirmation",
    sourceDigest: "1".repeat(64), policyRef: null, policyVersion: null, expiresAt: null,
    operation: { actorScope: "system:confirmation-test", idempotencyKey: "credit_confirmation",
      actorType: "system", actorRef: "confirmation_test" } });
  const offer = COIN_COMMERCE_PRODUCTION_OFFERS[0];
  store.publishOfferVersion(offer);
  const quote = store.createCheckoutQuote({ accountId, offerRef: offer.offerRef });
  const order = store.confirmOrder({ accountId, quoteRef: quote.quoteRef,
    operation: operation("confirm_initial", accountId) });
  clock.value = "2026-09-06T12:00:04.000Z";
  store.claimDueCaptures({ limit: 1 });
  store.captureClaimedOrder({ orderRef: order.orderRef });
  const command = store.claimNextFulfillmentCommand({ leaseMs: 30_000 });
  store.failFulfillmentCommand({ commandRef: command.commandRef,
    leaseGeneration: command.leaseGeneration, leaseToken: command.leaseToken,
    safeCode: "fulfillment_handler_unavailable" });
  const requestRef = `pareq_commerce_${sha(command.commandRef)}`;
  const entitlementRef = `ent_commerce_${sha(command.commandRef)}`;
  const issuedLinkRef = `${requestRef}_link_1`;
  const effectRef = `effect_coin_commerce_${sha(`GCCWEBOS:COIN_COMMERCE_SUBSCRIPTION_FULFILLMENT:v1\0${command.commandRef}`)}`;
  const expiresAt = "2026-10-06T12:00:00.000Z";
  control.createEntitlement({ id: entitlementRef, accountId, plan: offer.offerVersionRef,
    status: "active", validFrom: NOW, validUntil: expiresAt, trafficLimitBytes: 50 * 1024 ** 3,
    createdAt: NOW, updatedAt: NOW });
  control.createIssuanceRequest({ id: requestRef, accountId, entitlementId: entitlementRef,
    approvalRef: `approval_commerce_${sha(`${command.commandRef}\0${order.orderRef}`)}`,
    status: "issued", quantity: 1, nodeId: "node_synthetic", purpose: "coin_commerce_product_fulfillment",
    requestedByRef: "operator_synthetic", createdAt: NOW, updatedAt: NOW });
  control.linkIssuedSubscription({ id: issuedLinkRef, requestId: requestRef,
    tenantRef: "tenantref_synthetic", artifactRef: "artifactref_synthetic",
    status: "active", createdAt: NOW, updatedAt: NOW });
  const confirmedAt = "2026-09-06T12:01:00.000Z";
  const values = { confirmation_ref: "confirmation_synthetic", command_ref: command.commandRef,
    order_ref: order.orderRef, account_id: accountId, effect_ref: effectRef,
    approval_sha256: "a".repeat(64), inventory_sha256: "b".repeat(64), effect_sha256: "c".repeat(64),
    receipt_ref: "receipt_confirmation_synthetic", operator_ref: "operator_synthetic",
    resource_request_ref: requestRef, entitlement_ref: entitlementRef, issued_link_ref: issuedLinkRef,
    failed_updated_at: clock.value, attempt_count: 1, lease_generation: 1, confirmed_at: confirmedAt };
  const metadata = { version: 1, commandRef: command.commandRef, orderRef: order.orderRef,
    accountId, requestRef, entitlementRef, issuedLinkRef, tenantRef: "tenantref_synthetic",
    artifactRef: "artifactref_synthetic", offerVersionRef: offer.offerVersionRef, portalPlan: "monthly",
    durationDays: 30, monthlyTrafficGb: 50, trafficLimitBytes: 50 * 1024 ** 3,
    validFrom: NOW, previousValidUntil: NOW, targetValidUntil: expiresAt };
  Object.assign(state, { values, metadata, effectRef, command, order, accountId });
  return state;
}

function input(database) {
  return { database, expectedMigrationId: schema.REQUIRED_COIN_COMMERCE_INITIAL_CONFIRMATION_MIGRATION_ID,
    expectedDdlChecksum: schema.COIN_COMMERCE_INITIAL_CONFIRMATION_MIGRATIONS?.[0].ddlChecksum,
    nowFn: () => new Date(NOW) };
}
function apply(state) { return schema.applyCoinCommerceInitialConfirmationMigrations(input(state.database)); }
function audit(state, metadata = state.metadata) {
  state.control.recordAuditEvent({ id: state.effectRef, entityType: "coin_commerce_subscription_fulfillment",
    entityRef: state.values.entitlement_ref, action: "subscription_fulfillment_applied",
    actorRef: "coin_commerce_fulfillment", createdAt: state.values.confirmed_at, metadata });
}
function insert(state, patch = {}) {
  const values = { ...state.values, ...patch };
  state.database.prepare(`insert into ${TABLE} (${Object.keys(values).join(",")})
    values (${Object.keys(values).map((key) => `@${key}`).join(",")})`).run(values);
}
function receipt(state, effectRef = state.effectRef) {
  const v = state.values;
  state.database.prepare(`insert into platform_coin_commerce_fulfillment_receipts
    (receipt_ref, command_ref, effect_ref, status, safe_code, recorded_at)
    values (?, ?, ?, 'delivered', null, ?)`).run(v.receipt_ref, v.command_ref, effectRef, v.confirmed_at);
}
function completeCommand(state, additionalSet = "") {
  state.database.prepare(`update platform_coin_commerce_fulfillment_commands
    set status='delivered',safe_failure_code=null,updated_at=?${additionalSet}
    where command_ref=?`).run(state.values.confirmed_at, state.values.command_ref);
}
function completeOrder(state) {
  state.database.prepare(`update platform_coin_commerce_orders set payment_status='captured',updated_at=?
    where order_ref=?`).run(state.values.confirmed_at, state.values.order_ref);
}
function withState(options, action) { const state = fixture(options); try { return action(state); } finally { state.close(); } }
function schemaSnapshot(database) {
  return database.prepare("select type,name,tbl_name,sql from sqlite_master order by type,name").all();
}

test("foundation identity and unextended validation remain unchanged", () => withState({}, (state) => {
  assert.equal(schema.COIN_COMMERCE_MIGRATIONS[0].ddlChecksum, BASE_CHECKSUM);
  assert.equal(schema.REQUIRED_COIN_COMMERCE_MIGRATION_ID, "20260726_001_coin_commerce_foundation");
  assert.equal(schema.inspectCoinCommerceSchema({ database: state.database }).ok, true);
  assert.equal(typeof schema.inspectCoinCommerceInitialConfirmationSchema, "function");
  assert.equal(schema.inspectCoinCommerceInitialConfirmationSchema({ database: state.database }).ok, false);
}));

test("explicit optional migration is exact, idempotent, and accepted by foundation validation", () => withState({}, (state) => {
  const result = apply(state);
  assert.equal(result.sourceChanged, true);
  assert.equal(result.ok, true);
  assert.equal(schema.inspectCoinCommerceSchema({ database: state.database }).ok, true);
  assert.equal(schema.inspectCoinCommerceInitialConfirmationSchema({ database: state.database }).ok, true);
  assert.equal(apply(state).sourceChanged, false);
  assert.equal(schema.COIN_COMMERCE_MIGRATIONS[0].ddlChecksum, BASE_CHECKSUM);
}));

for (const field of ["expectedMigrationId", "expectedDdlChecksum"]) {
  test(`optional migration rejects wrong ${field} without writes`, () => withState({}, (state) => {
    const before = schemaSnapshot(state.database);
    assert.throws(() => schema.applyCoinCommerceInitialConfirmationMigrations({ ...input(state.database), [field]: "wrong" }),
      (error) => error.code === (field === "expectedMigrationId"
        ? "commerce_migration_id_mismatch" : "commerce_migration_checksum_mismatch"));
    assert.deepEqual(schemaSnapshot(state.database), before);
  }));
}

test("unused optional inverse restores exact original schema and ledger", () => withState({}, (state) => {
  const before = schemaSnapshot(state.database);
  const ledger = state.database.prepare("select * from platform_schema_migrations order by migration_id").all();
  apply(state);
  assert.equal(schema.removeUnusedCoinCommerceInitialConfirmationMigration(input(state.database)).sourceChanged, true);
  assert.deepEqual(schemaSnapshot(state.database), before);
  assert.deepEqual(state.database.prepare("select * from platform_schema_migrations order by migration_id").all(), ledger);
  assert.equal(schema.inspectCoinCommerceSchema({ database: state.database }).ok, true);
}));

for (const tamper of ["missing_guard", "orphan_ledger", "extra_index", "checksum"]) {
  test(`partial or altered extension ${tamper} fails closed`, () => withState({}, (state) => {
    apply(state);
    if (tamper === "missing_guard") state.database.exec("drop trigger coin_commerce_initial_confirmations_insert_guard");
    if (tamper === "orphan_ledger") state.database.prepare("delete from platform_schema_migrations where migration_id=?")
      .run(schema.REQUIRED_COIN_COMMERCE_INITIAL_CONFIRMATION_MIGRATION_ID);
    if (tamper === "extra_index") state.database.exec(`create index unreviewed_confirmation_idx on ${TABLE}(operator_ref)`);
    if (tamper === "checksum") state.database.prepare("update platform_schema_migrations set ddl_checksum=? where migration_id=?")
      .run("c".repeat(64), schema.REQUIRED_COIN_COMMERCE_INITIAL_CONFIRMATION_MIGRATION_ID);
    assert.equal(schema.inspectCoinCommerceSchema({ database: state.database }).ok, false);
    assert.equal(schema.inspectCoinCommerceInitialConfirmationSchema({ database: state.database }).ok, false);
    assert.throws(() => apply(state));
    assert.throws(() => schema.removeUnusedCoinCommerceInitialConfirmationMigration(input(state.database)));
  }));
}

test("only evidence-bound initial confirmation closes the original terminal order", () => withState({ failed: true }, (state) => {
  apply(state);
  const financialBefore = state.database.prepare("select * from platform_coin_ledger_entries order by entry_ref").all();
  const originalEvents = state.database.prepare("select * from platform_coin_commerce_order_events order by event_ref").all();
  state.database.transaction(() => { audit(state); insert(state); receipt(state); completeCommand(state); completeOrder(state); })();
  assert.equal(state.store.getOrder({ accountId: state.accountId, orderRef: state.values.order_ref }).fulfillment.status, "delivered");
  assert.equal(state.store.getOrder({ accountId: state.accountId, orderRef: state.values.order_ref }).paymentStatus, "captured");
  assert.deepEqual(state.database.prepare("select * from platform_coin_ledger_entries order by entry_ref").all(), financialBefore);
  assert.deepEqual(state.database.prepare("select * from platform_coin_commerce_order_events order by event_ref").all(), originalEvents);
  assert.throws(() => insert(state));
  assert.throws(() => state.database.exec(`update ${TABLE} set operator_ref='changed'`));
  assert.throws(() => state.database.exec(`delete from ${TABLE}`));
  assert.throws(() => schema.removeUnusedCoinCommerceInitialConfirmationMigration(input(state.database)),
    (error) => error.code === "commerce_initial_confirmation_migration_in_use");
}));

for (const [field, value] of Object.entries({ approval_sha256: "A".repeat(64), inventory_sha256: "short", effect_sha256: "C".repeat(64),
  failed_updated_at: NOW, attempt_count: 2, lease_generation: 2, confirmed_at: "not-a-date",
  account_id: "another_account", effect_ref: "effect_other", receipt_ref: "", operator_ref: "" })) {
  test(`confirmation insertion rejects mismatched ${field}`, () => withState({ failed: true }, (state) => {
    apply(state); audit(state); assert.throws(() => insert(state, { [field]: value }));
    assert.equal(state.database.prepare(`select count(*) from ${TABLE}`).pluck().get(), 0);
  }));
}

for (const field of ["commandRef", "orderRef", "accountId", "requestRef", "entitlementRef", "issuedLinkRef"]) {
  test(`effect metadata mismatch ${field} cannot authorize confirmation`, () => withState({ failed: true }, (state) => {
    apply(state); audit(state, { ...state.metadata, [field]: "different_ref" });
    assert.throws(() => insert(state));
  }));
}

for (const status of ["pending", "processing"]) {
  test(`confirmation never grants failed to ${status}`, () => withState({ failed: true }, (state) => {
    apply(state); audit(state); insert(state); receipt(state);
    assert.throws(() => state.database.prepare("update platform_coin_commerce_fulfillment_commands set status=? where command_ref=?")
      .run(status, state.values.command_ref));
  }));
}

test("missing or mismatched final receipt blocks terminal transition", () => withState({ failed: true }, (state) => {
  apply(state); audit(state); insert(state);
  assert.throws(() => completeCommand(state));
  assert.throws(() => completeOrder(state));
  receipt(state, "effect_not_the_confirmed_effect");
  assert.throws(() => completeCommand(state));
}));

test("confirmation cannot change counters or payload while closing a failed command", () => withState({ failed: true }, (state) => {
  apply(state); audit(state); insert(state); receipt(state);
  for (const clause of [",attempt_count=2,lease_generation=2", ",payload_json='{}'", ",created_at='2026-01-01T00:00:00.000Z'"]) {
    assert.throws(() => completeCommand(state, clause));
  }
  completeCommand(state); completeOrder(state);
}));

test("failed confirmation transaction rolls all evidence and terminal changes back", () => withState({ failed: true }, (state) => {
  apply(state);
  assert.throws(() => state.database.transaction(() => {
    audit(state); insert(state); receipt(state); completeCommand(state); throw new Error("synthetic_abort");
  })());
  assert.equal(state.database.prepare(`select count(*) from ${TABLE}`).pluck().get(), 0);
  assert.equal(state.control.getAuditEvent(state.effectRef), null);
  assert.equal(state.store.getOrder({ accountId: state.accountId, orderRef: state.values.order_ref }).fulfillment.status, "failed");
}));

test("confirmation cannot close a later reopened reconciliation", () => withState({ failed: true }, (state) => {
  apply(state); audit(state); insert(state); receipt(state); completeCommand(state); completeOrder(state);
  state.database.prepare(`update platform_coin_commerce_orders set payment_status='reconciliation_required',updated_at=?
    where order_ref=?`).run("2026-09-06T13:00:00.000Z", state.values.order_ref);
  assert.throws(() => completeOrder(state));
  assert.equal(state.database.prepare("select payment_status from platform_coin_commerce_orders where order_ref=?")
    .pluck().get(state.values.order_ref), "reconciliation_required");
}));

test("confirmation rejects order drift after the exact original failure", () => withState({ failed: true }, (state) => {
  apply(state); audit(state);
  state.database.prepare("update platform_coin_commerce_orders set updated_at=? where order_ref=?")
    .run("2026-09-06T12:00:05.000Z", state.values.order_ref);
  assert.throws(() => insert(state));
}));

test("confirmation command closure rejects order drift after evidence insertion", () => withState({ failed: true }, (state) => {
  apply(state); audit(state); insert(state); receipt(state);
  state.database.prepare("update platform_coin_commerce_orders set updated_at=? where order_ref=?")
    .run("2026-09-06T12:00:05.000Z", state.values.order_ref);
  assert.throws(() => completeCommand(state),
    (error) => error.code === "SQLITE_CONSTRAINT_TRIGGER");
  assert.equal(state.database.prepare("select status from platform_coin_commerce_fulfillment_commands where command_ref=?")
    .pluck().get(state.values.command_ref), "failed");
}));

test("confirmation order closure cannot mutate financial or identity snapshots", () => withState({ failed: true }, (state) => {
  apply(state); audit(state); insert(state); receipt(state); completeCommand(state);
  for (const clause of ["amount_units=1", "account_id='another_account'", "hold_ref='another_hold'", "offer_snapshot_json='{}'"]) {
    assert.throws(() => state.database.prepare(`update platform_coin_commerce_orders
      set payment_status='captured',updated_at=?,${clause} where order_ref=?`)
      .run(state.values.confirmed_at, state.values.order_ref));
  }
  completeOrder(state);
}));

test("optional dry-run proves apply and unused inverse only on a private clone", async () => {
  const root = mkdtempSync(join(tmpdir(), "initial-confirmation-dry-run-test-"));
  const sourcePath = join(root, "source.sqlite");
  const state = fixture();
  try {
    await state.database.backup(sourcePath);
    const before = sha(readFileSync(sourcePath));
    const result = await schema.dryRunCoinCommerceInitialConfirmationMigrations({ dbPath: sourcePath, tempRoot: root });
    assert.equal(result.ok, true);
    assert.equal(result.mode, "dry-run");
    assert.equal(result.sourceChanged, false);
    assert.equal(result.unusedInverseVerified, true);
    assert.deepEqual(result.pendingMigrationIds, [schema.REQUIRED_COIN_COMMERCE_INITIAL_CONFIRMATION_MIGRATION_ID]);
    assert.equal(sha(readFileSync(sourcePath)), before);
    assert.deepEqual(readdirSync(root), ["source.sqlite"]);
    const source = new Database(sourcePath, { readonly: true, fileMustExist: true });
    try {
      assert.equal(schema.inspectCoinCommerceSchema({ database: source }).ok, true);
      assert.equal(schema.inspectCoinCommerceInitialConfirmationSchema({ database: source }).ok, false);
    } finally { source.close(); }
  } finally { state.close(); rmSync(root, { recursive: true, force: true }); }
});

test("optional dry-run retains used confirmation and does not claim an unused inverse", async () => {
  const root = mkdtempSync(join(tmpdir(), "initial-confirmation-used-dry-run-test-"));
  const sourcePath = join(root, "source.sqlite");
  const state = fixture({ failed: true });
  try {
    apply(state); audit(state); insert(state); receipt(state); completeCommand(state); completeOrder(state);
    await state.database.backup(sourcePath);
    const before = sha(readFileSync(sourcePath));
    const result = await schema.dryRunCoinCommerceInitialConfirmationMigrations({ dbPath: sourcePath, tempRoot: root });
    assert.equal(result.ok, true);
    assert.equal(result.sourceChanged, false);
    assert.equal(result.unusedInverseVerified, false);
    assert.deepEqual(result.pendingMigrationIds, []);
    assert.equal(sha(readFileSync(sourcePath)), before);
    assert.deepEqual(readdirSync(root), ["source.sqlite"]);
  } finally { state.close(); rmSync(root, { recursive: true, force: true }); }
});

test("optional dry-run rejects incompatible source and cleans only its private clone", async () => {
  const root = mkdtempSync(join(tmpdir(), "initial-confirmation-invalid-dry-run-test-"));
  const sourcePath = join(root, "source.sqlite");
  const state = fixture();
  try {
    state.database.exec("drop trigger coin_commerce_orders_payment_status_transition");
    await state.database.backup(sourcePath);
    const before = sha(readFileSync(sourcePath));
    await assert.rejects(() => schema.dryRunCoinCommerceInitialConfirmationMigrations({ dbPath: sourcePath, tempRoot: root }),
      (error) => error.code === "commerce_initial_confirmation_schema_incompatible");
    assert.equal(sha(readFileSync(sourcePath)), before);
    assert.deepEqual(readdirSync(root), ["source.sqlite"]);
  } finally { state.close(); rmSync(root, { recursive: true, force: true }); }
});

test("optional dry-run detects a concurrent WAL commit and removes its clone", async () => {
  const root = mkdtempSync(join(tmpdir(), "initial-confirmation-wal-dry-run-test-"));
  const sourcePath = join(root, "source.sqlite");
  const state = fixture();
  const originalBackup = Database.prototype.backup;
  let writer;
  let committed = false;
  try {
    state.database.exec("create table synthetic_confirmation_sentinel (value integer); insert into synthetic_confirmation_sentinel values (0)");
    await state.database.backup(sourcePath);
    writer = new Database(sourcePath, { fileMustExist: true });
    writer.pragma("journal_mode = WAL");
    Database.prototype.backup = async function backupWithConcurrentCommit(...args) {
      const result = await originalBackup.apply(this, args);
      if (this.readonly && !committed) {
        writer.exec("update synthetic_confirmation_sentinel set value=1");
        committed = true;
      }
      return result;
    };
    await assert.rejects(() => schema.dryRunCoinCommerceInitialConfirmationMigrations({ dbPath: sourcePath, tempRoot: root }),
      (error) => error.code === "commerce_source_changed_during_dry_run");
    assert.equal(committed, true);
    assert.equal(readdirSync(root).some((name) => name.startsWith("coin-commerce-initial-confirmation-dry-run-")), false);
    assert.equal(schema.inspectCoinCommerceInitialConfirmationSchema({ database: writer }).ok, false);
  } finally {
    Database.prototype.backup = originalBackup;
    writer?.close(); state.close(); rmSync(root, { recursive: true, force: true });
  }
});

test("optional migration failures roll back trigger replacements and ledger together", () => withState({}, (state) => {
  const before = schemaSnapshot(state.database);
  const originalExec = state.database.exec;
  state.database.exec = function failDuringExtension(sql) {
    if (/create trigger coin_commerce_initial_confirmations_insert_guard/.test(sql)) throw new Error("synthetic_private_failure");
    return originalExec.call(this, sql);
  };
  try {
    assert.throws(() => apply(state), (error) => error.code === "commerce_initial_confirmation_migration_failed"
      && !error.message.includes("synthetic_private_failure"));
  } finally { state.database.exec = originalExec; }
  assert.deepEqual(schemaSnapshot(state.database), before);
  assert.equal(schema.inspectCoinCommerceSchema({ database: state.database }).ok, true);
}));

test("unused inverse failures retain the entire installed extension", () => withState({}, (state) => {
  apply(state);
  const before = schemaSnapshot(state.database);
  const originalExec = state.database.exec;
  state.database.exec = function failDuringInverse(sql) {
    if (/create trigger coin_commerce_orders_payment_status_transition/.test(sql)) throw new Error("synthetic_private_failure");
    return originalExec.call(this, sql);
  };
  try {
    assert.throws(() => schema.removeUnusedCoinCommerceInitialConfirmationMigration(input(state.database)),
      (error) => error.code === "commerce_initial_confirmation_migration_failed");
  } finally { state.database.exec = originalExec; }
  assert.deepEqual(schemaSnapshot(state.database), before);
  assert.equal(schema.inspectCoinCommerceInitialConfirmationSchema({ database: state.database }).ok, true);
}));
