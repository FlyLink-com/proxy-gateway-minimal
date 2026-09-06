import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import Database from "better-sqlite3";
import * as commerce from "../services/platform/coin-commerce-store.mjs";
import * as schema from "../services/platform/coin-commerce-migrations.mjs";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import { applyCoinCommerceMigrations, COIN_COMMERCE_MIGRATIONS, REQUIRED_COIN_COMMERCE_MIGRATION_ID } from "../services/platform/coin-commerce-migrations.mjs";
import { applyCoinWalletMigrations, COIN_WALLET_MIGRATIONS, REQUIRED_COIN_WALLET_MIGRATION_ID } from "../services/platform/coin-wallet-migrations.mjs";
import { COIN_COMMERCE_PRODUCTION_OFFERS } from "../services/platform/coin-commerce-production-catalog.mjs";

const NOW = "2026-07-30T00:00:00.000Z";
const ACCOUNT = "acct_initial_confirmation";
const OFFER = COIN_COMMERCE_PRODUCTION_OFFERS[0];
const FINANCIAL_TABLES = ["platform_coin_wallets", "platform_coin_lots", "platform_coin_holds", "platform_coin_hold_allocations", "platform_coin_operation_receipts", "platform_coin_ledger_entries"];

function fixture() {
  const database = new Database(":memory:");
  database.pragma("foreign_keys = ON");
  const control = createSqliteSubscriptionControlStore({ database });
  applyCoinWalletMigrations({ database, expectedMigrationId: REQUIRED_COIN_WALLET_MIGRATION_ID, expectedDdlChecksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum, nowFn: () => new Date(NOW) });
  applyCoinCommerceMigrations({ database, expectedMigrationId: REQUIRED_COIN_COMMERCE_MIGRATION_ID, expectedDdlChecksum: COIN_COMMERCE_MIGRATIONS[0].ddlChecksum, nowFn: () => new Date(NOW) });
  control.createAccount({ id: ACCOUNT, ownerRef: ACCOUNT, status: "active", createdAt: NOW, updatedAt: NOW });
  const connection = new Proxy(database, { get(target, key) {
    if (key === "prepare") return (sql) => /select\s+strftime\('%Y-%m-%dT%H:%M:%fZ',\s*'now'\)/i.test(sql)
      ? { pluck: () => ({ get: () => NOW }) } : target.prepare(sql);
    const value = Reflect.get(target, key, target);
    return typeof value === "function" ? value.bind(target) : value;
  } });
  const store = commerce.createSqliteCoinCommerceStore({ database: connection, cancelWindowMs: 0 });
  store.walletStore.creditCoins({ accountId: ACCOUNT, coinType: "paid_coins", amountUnits: 100, availability: "available", sourceType: "synthetic_seed", sourceRef: "source_initial", sourceDigest: "a".repeat(64), policyRef: null, policyVersion: null, expiresAt: null, operation: { actorScope: "system:test", idempotencyKey: "credit_initial", actorType: "system", actorRef: "initial_test" } });
  store.publishOfferVersion(OFFER);
  let sequence = 0;
  function order({ failed = true, safeCode = "fulfillment_handler_unavailable" } = {}) {
    const quote = store.createCheckoutQuote({ accountId: ACCOUNT, offerRef: OFFER.offerRef });
    const result = store.confirmOrder({ accountId: ACCOUNT, quoteRef: quote.quoteRef, operation: { actorScope: `portal:${ACCOUNT}`, idempotencyKey: `confirm_${++sequence}`, actorType: "portal_user", actorRef: ACCOUNT } });
    store.claimDueCaptures({ limit: 10 });
    store.captureClaimedOrder({ orderRef: result.orderRef });
    if (failed) {
      const command = store.claimNextFulfillmentCommand({ leaseMs: 1000 });
      store.failFulfillmentCommand({ commandRef: command.commandRef, leaseGeneration: command.leaseGeneration, leaseToken: command.leaseToken, safeCode });
    }
    return result;
  }
  return { database, connection, control, store, order, close() { store.close(); control.close(); database.close(); } };
}
function participant(state, overrides = {}) {
  return commerce.createCoinCommerceInitialConfirmationParticipant({ store: state.store, database: state.connection, ...overrides });
}
function inspect(state, orderRef) {
  return state.database.transaction(() => participant(state).inspect({ accountId: ACCOUNT, orderRef }))();
}
function snapshot(database) {
  return Object.fromEntries(FINANCIAL_TABLES.map((table) => [table, database.prepare(`select * from ${table} order by rowid`).all()]));
}
function code(action, expected = "reconciliation_required") {
  assert.throws(action, (error) => error.code === expected);
}
function corrupt(state, table, sql) {
  for (const { name } of state.database.prepare("select name from sqlite_master where type='trigger' and tbl_name=?").all(table)) {
    state.database.exec(`drop trigger "${name.replaceAll('"', '""')}"`);
  }
  state.database.exec(sql);
}

function confirmationFixture(state) {
  const target = state.order();
  schema.applyCoinCommerceInitialConfirmationMigrations({ database: state.database,
    expectedMigrationId: schema.REQUIRED_COIN_COMMERCE_INITIAL_CONFIRMATION_MIGRATION_ID,
    expectedDdlChecksum: schema.COIN_COMMERCE_INITIAL_CONFIRMATION_MIGRATIONS[0].ddlChecksum, nowFn: () => new Date(NOW) });
  const command = state.database.prepare("select * from platform_coin_commerce_fulfillment_commands where order_ref=?").get(target.orderRef);
  const sha = (value) => createHash("sha256").update(value).digest("hex");
  const request = `pareq_commerce_${sha(command.command_ref)}`;
  const entitlement = `ent_commerce_${sha(command.command_ref)}`;
  const link = `${request}_link_1`;
  const effect = `effect_coin_commerce_${sha(`GCCWEBOS:COIN_COMMERCE_SUBSCRIPTION_FULFILLMENT:v1\0${command.command_ref}`)}`;
  const expires = "2026-08-29T00:00:00.000Z";
  const confirmed = "2026-07-30T00:01:00.000Z";
  const tenant = "tenantref_0000000000000000";
  const artifact = "artifactref_0000000000000000";
  state.control.createEntitlement({ id: entitlement, accountId: ACCOUNT, plan: OFFER.offerVersionRef,
    status: "active", validFrom: NOW, validUntil: expires, trafficLimitBytes: 50 * 1024 ** 3, createdAt: NOW, updatedAt: NOW });
  state.control.createIssuanceRequest({ id: request, accountId: ACCOUNT, entitlementId: entitlement,
    approvalRef: `approval_commerce_${sha(`${command.command_ref}\0${target.orderRef}`)}`,
    status: "issued", quantity: 1, nodeId: "node_synthetic", purpose: "coin_commerce_product_fulfillment",
    requestedByRef: "operator_synthetic", createdAt: NOW, updatedAt: NOW });
  state.control.linkIssuedSubscription({ id: link, requestId: request, tenantRef: tenant, artifactRef: artifact,
    status: "active", createdAt: NOW, updatedAt: NOW });
  const metadata = { version: 1, commandRef: command.command_ref, orderRef: target.orderRef,
    accountId: ACCOUNT, requestRef: request, entitlementRef: entitlement, issuedLinkRef: link,
    tenantRef: tenant, artifactRef: artifact, offerVersionRef: OFFER.offerVersionRef, portalPlan: "monthly",
    durationDays: 30, monthlyTrafficGb: 50, trafficLimitBytes: 50 * 1024 ** 3, validFrom: NOW,
    previousValidUntil: NOW, targetValidUntil: expires };
  const values = { confirmation_ref: "confirmation_initial", command_ref: command.command_ref,
    order_ref: target.orderRef, account_id: ACCOUNT, effect_ref: effect, effect_sha256: "c".repeat(64),
    receipt_ref: "receipt_initial", approval_sha256: "a".repeat(64), inventory_sha256: "b".repeat(64),
    resource_request_ref: request, entitlement_ref: entitlement, issued_link_ref: link,
    failed_updated_at: NOW, attempt_count: command.attempt_count, lease_generation: command.lease_generation,
    confirmed_at: confirmed, operator_ref: "operator_synthetic" };
  function insert({ metadataOverride = {}, rowOverride = {} } = {}) {
    state.control.recordAuditEvent({ id: effect, entityType: "coin_commerce_subscription_fulfillment",
      entityRef: entitlement, action: "subscription_fulfillment_applied", actorRef: "coin_commerce_fulfillment",
      createdAt: confirmed, metadata: { ...metadata, ...metadataOverride } });
    const rawAudit = state.database.prepare("select * from platform_audit_events where id=?").get(effect);
    const canonicalAudit = Object.fromEntries(Object.keys(rawAudit).sort().map((key) => [key, rawAudit[key]]));
    const row = { ...values, effect_sha256: sha(JSON.stringify(canonicalAudit)), ...rowOverride };
    state.database.prepare(`insert into platform_coin_commerce_initial_confirmations (${Object.keys(row).join(",")})
      values (${Object.keys(row).map((key) => `@${key}`).join(",")})`).run(row);
  }
  return { target, values, insert };
}

test("internal participant rejects forged stores and another connection without expanding normal methods", () => {
  const state = fixture();
  try {
    const keys = Reflect.ownKeys(state.store);
    assert.deepEqual(Reflect.ownKeys(participant(state)), ["inspect", "complete"]);
    assert.deepEqual(Reflect.ownKeys(state.store), keys);
    code(() => participant(state, { store: { ...state.store } }), "invalid_store_contract");
    code(() => participant(state, { store: Object.create(state.store) }), "invalid_store_contract");
    code(() => participant(state, { database: state.database }), "invalid_store_contract");
  } finally { state.close(); }
});

test("both internal methods require a caller-owned transaction and reject getters", () => {
  const state = fixture();
  try {
    const target = state.order();
    const p = participant(state);
    code(() => p.inspect({ accountId: ACCOUNT, orderRef: target.orderRef }));
    code(() => p.complete({ confirmationRef: "confirmation_initial" }));
    state.database.transaction(() => {
      code(() => p.inspect({ get accountId() { throw new Error("getter executed"); }, orderRef: target.orderRef }));
      code(() => p.complete({ get confirmationRef() { throw new Error("getter executed"); } }));
    })();
  } finally { state.close(); }
});

test("inspect returns exact failed captured proof without financial writes or requiring extension", () => {
  const state = fixture();
  try {
    const target = state.order();
    const before = snapshot(state.database);
    const found = inspect(state, target.orderRef);
    assert.equal(found.order.order_ref, target.orderRef);
    assert.equal(found.command.safe_failure_code, "fulfillment_handler_unavailable");
    assert.equal(found.hold.status, "captured");
    assert.equal(found.payload.delivery.kind, "subscription_plan");
    assert.deepEqual(found.allocation, [{ coinType: "paid_coins", amountUnits: 20 }]);
    assert.equal(found.ledger.operation.safe_result_code, "captured");
    assert.equal(found.ledger.entries.length, 1);
    assert.equal(found.ledger.entries[0].operation, "held_to_consumed");
    assert.equal(found.confirmation, null);
    assert.equal(found.receipt, null);
    assert.equal(found.events.filter((event) => event.event_type === "fulfillment_failed").length, 1);
    assert.deepEqual(snapshot(state.database), before);
  } finally { state.close(); }
});

for (const [name, table, sql] of [
  ["capture digest", "platform_coin_operation_receipts", "update platform_coin_operation_receipts set request_digest='bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' where operation_type='capture_coin_hold'"],
  ["capture amount", "platform_coin_ledger_entries", "update platform_coin_ledger_entries set amount_units=amount_units+1 where operation='held_to_consumed'"],
  ["capture actor", "platform_coin_ledger_entries", "update platform_coin_ledger_entries set actor_ref='foreign_actor' where operation='held_to_consumed'"],
  ["missing ledger", "platform_coin_ledger_entries", "delete from platform_coin_ledger_entries where operation='held_to_consumed'"],
]) {
  test(`inspect refuses ${name} corruption without repair`, () => {
    const state = fixture();
    try {
      const target = state.order();
      corrupt(state, table, sql);
      const before = snapshot(state.database);
      code(() => inspect(state, target.orderRef));
      assert.deepEqual(snapshot(state.database), before);
    } finally { state.close(); }
  });
}

test("inspect rejects wrong account, unavailable failure eligibility and other pending commands", () => {
  const state = fixture();
  try {
    const target = state.order();
    state.database.transaction(() => code(() => participant(state).inspect({ accountId: "acct_foreign", orderRef: target.orderRef })))();
  } finally { state.close(); }
  const conflict = fixture();
  try {
    conflict.order({ failed: false });
    conflict.order({ failed: false });
    const lease = conflict.store.claimNextFulfillmentCommand({ leaseMs: 1000 });
    conflict.store.failFulfillmentCommand({ commandRef: lease.commandRef, leaseGeneration: lease.leaseGeneration,
      leaseToken: lease.leaseToken, safeCode: "fulfillment_handler_unavailable" });
    const target = conflict.database.prepare("select order_ref from platform_coin_commerce_fulfillment_commands where command_ref=?").get(lease.commandRef);
    code(() => inspect(conflict, target.order_ref));
  } finally { conflict.close(); }
  const other = fixture();
  try {
    const target = other.order({ safeCode: "fulfillment_handler_failed" });
    code(() => inspect(other, target.orderRef));
  } finally { other.close(); }
});

test("complete rejects an absent durable confirmation without any financial write", () => {
  const state = fixture();
  try {
    state.order();
    const before = snapshot(state.database);
    state.database.transaction(() => code(() => participant(state).complete({ confirmationRef: "confirmation_absent" })))();
    assert.deepEqual(snapshot(state.database), before);
  } finally { state.close(); }
});

test("complete atomically confirms only the exact initial order, preserves finances and replays without writes", () => {
  const state = fixture();
  try {
    const setup = confirmationFixture(state);
    const money = snapshot(state.database);
    const history = state.database.prepare("select * from platform_coin_commerce_order_events where order_ref=? order by event_ref").all(setup.target.orderRef);
    const resourceTables = ["platform_entitlements", "platform_issuance_requests", "platform_issued_subscription_links"];
    const resource = () => resourceTables.map((table) => state.database.prepare(`select * from ${table} order by rowid`).all());
    const resources = resource();
    state.database.transaction(() => {
      setup.insert();
      assert.deepEqual(participant(state).complete({ confirmationRef: setup.values.confirmation_ref }), { status: "delivered" });
    })();
    const found = inspect(state, setup.target.orderRef);
    assert.equal(found.order.payment_status, "captured");
    assert.equal(found.command.status, "delivered");
    assert.equal(found.receipt.receipt_ref, setup.values.receipt_ref);
    assert.equal(found.command.attempt_count, 1);
    assert.equal(found.command.lease_generation, 1);
    assert.equal(found.events.length, history.length + 1);
    for (const prior of history) assert.ok(found.events.some((event) => JSON.stringify(event) === JSON.stringify(prior)));
    assert.deepEqual(snapshot(state.database), money);
    assert.deepEqual(resource(), resources);
    const changes = state.database.prepare("select total_changes()").pluck().get();
    state.database.transaction(() => assert.deepEqual(participant(state).complete({ confirmationRef: setup.values.confirmation_ref }), { status: "delivered" }))();
    assert.equal(state.database.prepare("select total_changes()").pluck().get(), changes);
    state.database.transaction(() => code(() => participant(state).complete({ confirmationRef: "confirmation_other" })))();
  } finally { state.close(); }
});

test("a terminal event write failure stays infrastructure failure and the caller rolls every confirmation write back", () => {
  const state = fixture();
  try {
    const setup = confirmationFixture(state);
    const before = inspect(state, setup.target.orderRef);
    const money = snapshot(state.database);
    state.database.exec(`create trigger synthetic_confirmation_event_failure before insert on platform_coin_commerce_order_events
      when new.event_type='fulfillment_delivered' begin select raise(abort,'synthetic_event_write_failure'); end`);
    code(() => state.database.transaction(() => {
      setup.insert();
      participant(state).complete({ confirmationRef: setup.values.confirmation_ref });
    })(), "commerce_infrastructure_error");
    assert.deepEqual(inspect(state, setup.target.orderRef), before);
    assert.deepEqual(snapshot(state.database), money);
    assert.equal(state.database.prepare("select count(*) from platform_coin_commerce_initial_confirmations").pluck().get(), 0);
    assert.equal(state.database.prepare("select count(*) from platform_audit_events where id=?").pluck().get(setup.values.effect_ref), 0);
  } finally { state.close(); }
});

test("complete rejects changed audit bytes even when the parsed canonical effect is semantically unchanged", () => {
  const state = fixture();
  try {
    const setup = confirmationFixture(state);
    code(() => state.database.transaction(() => {
      setup.insert();
      state.database.prepare("update platform_audit_events set metadata_json=metadata_json || ' ' where id=?").run(setup.values.effect_ref);
      participant(state).complete({ confirmationRef: setup.values.confirmation_ref });
    })());
    assert.equal(inspect(state, setup.target.orderRef).command.status, "failed");
  } finally { state.close(); }
});
