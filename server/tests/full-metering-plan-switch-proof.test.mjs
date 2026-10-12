import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import Database from "better-sqlite3";
import { readFullMeteringPlanSwitchProof } from "../../scripts/lib/full-metering-plan-switch-proof.mjs";
import { deriveCommerceOperationRefs } from "../services/platform/coin-commerce-domain.mjs";
import { planSwitchDueCommandRef, planSwitchScheduledEffectRef } from "../services/platform/coin-commerce-plan-switch-runtime.mjs";
import { PLAN_SWITCH_TIERS } from "../services/platform/coin-commerce-plan-switch-policy.mjs";

const [BASIC, PLUS, YEAR] = PLAN_SWITCH_TIERS;
const FROM = "2026-10-01T00:00:00.000Z", UNTIL = "2026-10-31T00:00:00.000Z";
const BOUNDARY = "2026-10-12T00:00:00.000Z", AT = "2026-10-12T00:00:01.000Z", NOW = "2026-10-12T00:00:02.000Z";
const hash = value => createHash("sha256").update(value).digest("hex");
const effectRef = command => `effect_coin_commerce_${hash(`GCCWEBOS:COIN_COMMERCE_SUBSCRIPTION_FULFILLMENT:v1\0${command}`)}`;
const billing = (tier = BASIC, from = FROM, until = UNTIL) => ({ plan: tier.offerVersionRef, validFrom: from, validUntil: until });
const identity = period => ({ sourceRef: "full_metering_xray_cumulative_v1", channelRef: "channel-vultr-a-vless-reality-tcp",
  edgeCredentialRef: "credential_synthetic", accountId: "acct_synthetic", entitlementId: "ent_synthetic", requestId: "request_synthetic",
  materialDigest: "synthetic-material-digest", billingBinding: period });
const afterDays = (from, days) => new Date(Date.parse(from) + days * 86400000).toISOString();

// Deliberately writable evidence tables let negative cases simulate malformed
// historical records. Real SQL, no mocks of prepare/get/all or transactions.
function fixture() {
  const db = new Database(":memory:");
  db.exec(`
    create table platform_accounts(id text primary key, status text);
    create table platform_entitlements(id text primary key, account_id text, status text, plan text, valid_from text, valid_until text, traffic_limit_bytes integer);
    create table platform_issuance_requests(id text primary key, account_id text, entitlement_id text, status text);
    create table platform_issued_subscription_links(id text primary key, request_id text, tenant_ref text, artifact_ref text, status text);
    create table platform_portal_access_requests(id text primary key, portal_user_ref text, entitlement_ref text, status text, valid_until text, expires_at text);
    create table platform_coin_commerce_plan_switch_quotes(quote_ref text primary key, account_id text, entitlement_id text, kind text, from_offer_version_ref text, to_offer_version_ref text, snapshot_valid_from text, snapshot_valid_until text, cancels_switch_ref text, effective_at text, created_at text);
    create table platform_coin_commerce_quotes(quote_ref text primary key, account_id text, offer_version_ref text, amount_units integer, status text, consumed_at text);
    create table platform_coin_commerce_orders(order_ref text primary key, account_id text, quote_ref text, offer_version_ref text, hold_ref text, amount_units integer, payment_status text, created_at text);
    create table platform_coin_wallets(wallet_ref text primary key, account_id text);
    create table platform_coin_holds(hold_ref text primary key, wallet_ref text, purpose text, purpose_ref text, amount_units integer, status text);
    create table platform_coin_commerce_fulfillment_commands(command_ref text primary key, order_ref text, account_id text, status text, payload_json text, updated_at text);
    create table platform_coin_commerce_fulfillment_receipts(receipt_ref text primary key, command_ref text, effect_ref text, status text, safe_code text, recorded_at text);
    create table platform_audit_events(id text primary key, entity_type text, entity_ref text, action text, actor_ref text, created_at text, metadata_json text);
    create table platform_scheduled_plan_switches(switch_ref text primary key, account_id text, entitlement_id text, from_offer_version_ref text, to_offer_version_ref text, effective_at text, paid_units integer, status text, created_at text, resolved_at text, superseded_by_order_ref text);
  `);
  const insert = (table, row) => db.prepare(`insert into ${table} (${Object.keys(row).join(",")}) values (${Object.keys(row).map(() => "?").join(",")})`).run(...Object.values(row));
  insert("platform_accounts", { id: "acct_synthetic", status: "active" });
  insert("platform_coin_wallets", { wallet_ref: "wallet_synthetic", account_id: "acct_synthetic" });
  insert("platform_issuance_requests", { id: "request_synthetic", account_id: "acct_synthetic", entitlement_id: "ent_synthetic", status: "issued" });
  insert("platform_issued_subscription_links", { id: "issued_synthetic", request_id: "request_synthetic", tenant_ref: "tenantref_synthetic", artifact_ref: "artifactref_synthetic", status: "active" });
  function current(period) {
    const tier = PLAN_SWITCH_TIERS.find(value => value.offerVersionRef === period.plan);
    db.prepare("delete from platform_entitlements").run();
    db.prepare("delete from platform_portal_access_requests").run();
    insert("platform_entitlements", { id: "ent_synthetic", account_id: "acct_synthetic", status: "active", plan: period.plan,
      valid_from: period.validFrom, valid_until: period.validUntil, traffic_limit_bytes: tier.monthlyTrafficGb * 1024 ** 3 });
    insert("platform_portal_access_requests", { id: "request_synthetic", portal_user_ref: "acct_synthetic", entitlement_ref: "ent_synthetic", status: "issued", valid_until: period.validUntil, expires_at: period.validUntil });
  }
  function transition({ before = billing(), after = billing(PLUS), kind = "upgrade_inplace", at = AT, ref = "one", quoteUntil = before.validUntil } = {}) {
    const order = `order_${ref}`, quote = `quote_${ref}`, hold = `hold_${ref}`;
    const command = deriveCommerceOperationRefs(order).commandRef, due = kind === "downgrade_scheduled";
    const appliedCommand = due ? planSwitchDueCommandRef(order) : command;
    const target = PLAN_SWITCH_TIERS.find(tier => tier.offerVersionRef === after.plan);
    const delivery = { kind: "subscription_plan", durationDays: target.durationDays, monthlyTrafficGb: target.monthlyTrafficGb,
      trafficGb: null, neverExpires: false, discountBasisPoints: 0 };
    insert("platform_coin_commerce_plan_switch_quotes", { quote_ref: quote, account_id: "acct_synthetic", entitlement_id: "ent_synthetic", kind,
      from_offer_version_ref: before.plan, to_offer_version_ref: after.plan, snapshot_valid_from: before.validFrom, snapshot_valid_until: quoteUntil,
      cancels_switch_ref: null, effective_at: due ? before.validUntil : null, created_at: BOUNDARY });
    insert("platform_coin_commerce_quotes", { quote_ref: quote, account_id: "acct_synthetic", offer_version_ref: after.plan, amount_units: 10, status: "consumed", consumed_at: BOUNDARY });
    insert("platform_coin_commerce_orders", { order_ref: order, account_id: "acct_synthetic", quote_ref: quote, offer_version_ref: after.plan, hold_ref: hold, amount_units: 10, payment_status: "captured", created_at: BOUNDARY });
    insert("platform_coin_holds", { hold_ref: hold, wallet_ref: "wallet_synthetic", purpose: "product_purchase", purpose_ref: order, amount_units: 10, status: "captured" });
    insert("platform_coin_commerce_fulfillment_commands", { command_ref: command, order_ref: order, account_id: "acct_synthetic", status: "delivered", payload_json: JSON.stringify({ offerVersionRef: after.plan, delivery }), updated_at: at });
    insert("platform_coin_commerce_fulfillment_receipts", { receipt_ref: `receipt_${ref}`, command_ref: command,
      effect_ref: due ? planSwitchScheduledEffectRef(order) : effectRef(appliedCommand), status: "delivered", safe_code: null, recorded_at: at });
    const metadata = { version: 1, commandRef: appliedCommand, orderRef: order, accountId: "acct_synthetic", requestRef: "request_synthetic",
      entitlementRef: "ent_synthetic", issuedLinkRef: "issued_synthetic", tenantRef: "tenantref_synthetic", artifactRef: "artifactref_synthetic",
      offerVersionRef: after.plan, portalPlan: target.durationDays >= 365 ? "yearly" : "monthly", durationDays: target.durationDays,
      monthlyTrafficGb: target.monthlyTrafficGb, trafficLimitBytes: target.monthlyTrafficGb * 1024 ** 3,
      validFrom: after.validFrom, previousValidUntil: before.validUntil, targetValidUntil: after.validUntil,
      ...(["upgrade_inplace", "upgrade_restart"].includes(kind) ? { switchKind: kind } : {}) };
    insert("platform_audit_events", { id: effectRef(appliedCommand), entity_type: "coin_commerce_subscription_fulfillment", entity_ref: "ent_synthetic",
      action: "subscription_fulfillment_applied", actor_ref: "coin_commerce_fulfillment", created_at: at, metadata_json: JSON.stringify(metadata) });
    if (due) insert("platform_scheduled_plan_switches", { switch_ref: order, account_id: "acct_synthetic", entitlement_id: "ent_synthetic",
      from_offer_version_ref: before.plan, to_offer_version_ref: after.plan, effective_at: before.validUntil, paid_units: 10,
      status: "applied", created_at: BOUNDARY, resolved_at: at, superseded_by_order_ref: null });
    current(after);
    return { order, quote, command, appliedCommand, metadata };
  }
  const prove = (before = billing(), after = billing(PLUS), options = {}) => db.transaction(() => readFullMeteringPlanSwitchProof({
    db, previousIdentity: identity(before), currentIdentity: identity(after), now: NOW, notBefore: BOUNDARY, ...options }))();
  return { db, insert, transition, current, prove, close: () => db.close() };
}

test("in-place proof is deterministic, aggregate-only and read-only", t => {
  const h = fixture(); t.after(h.close); h.transition();
  const changes = h.db.prepare("select total_changes() n").get().n;
  h.db.pragma("query_only = ON");
  const first = h.prove();
  assert.equal(first.ok, true); assert.deepEqual(h.prove(), first);
  assert.equal(first.proof.transitionCount, 1); assert.equal(first.proof.changedAt, AT);
  assert.equal(h.db.prepare("select total_changes() n").get().n, changes);
  assert.doesNotMatch(JSON.stringify(first), /acct_synthetic|request_synthetic|order_one|credential_synthetic/);
});

test("yearly restart needs its paid, delivered effect and preserved anchor", t => {
  const h = fixture(); t.after(h.close);
  const after = billing(YEAR, FROM, afterDays(AT, 365));
  h.transition({ after, kind: "upgrade_restart" });
  assert.equal(h.prove(billing(), after).ok, true);
});

test("renewal uses its actual additive effect boundary, including stale concurrent quote expiry", t => {
  const h = fixture(); t.after(h.close);
  const middle = billing(BASIC, FROM, afterDays(UNTIL, 30));
  const after = billing(BASIC, FROM, afterDays(middle.validUntil, 30));
  h.transition({ after: middle, kind: "renewal", ref: "one" });
  h.transition({ before: middle, after, kind: "renewal", ref: "two", at: NOW, quoteUntil: UNTIL });
  assert.equal(h.prove(billing(), after).proof.transitionCount, 2);
});

test("scheduled downgrade requires actual applied due effect, not only original delivery", t => {
  const h = fixture(); t.after(h.close);
  const at = "2026-10-31T00:00:01.000Z", after = billing(BASIC, at, afterDays(at, 30));
  h.transition({ before: billing(PLUS), after, kind: "downgrade_scheduled", at });
  assert.equal(h.prove(billing(PLUS), after, { now: at }).ok, true);
  h.db.prepare("update platform_scheduled_plan_switches set status='applying', resolved_at=null").run();
  assert.equal(h.prove(billing(PLUS), after, { now: at }).ok, false);
});

test("unique continuous upgrade followed by renewal is accepted", t => {
  const h = fixture(); t.after(h.close); h.transition();
  const after = billing(PLUS, FROM, afterDays(UNTIL, 30));
  h.transition({ before: billing(PLUS), after, kind: "renewal", ref: "two", at: NOW });
  assert.equal(h.prove(billing(), after).proof.transitionCount, 2);
});

for (const [name, sql] of [
  ["unpaid order", "update platform_coin_commerce_orders set payment_status='held'"],
  ["wrong hold owner", "update platform_coin_wallets set account_id='acct_other'"],
  ["wrong hold purpose", "update platform_coin_holds set purpose_ref='order_other'"],
  ["hold amount drift", "update platform_coin_holds set amount_units=11"],
  ["hold not captured", "update platform_coin_holds set status='active'"],
  ["wrong quote account", "update platform_coin_commerce_plan_switch_quotes set account_id='acct_other'"],
  ["unconsumed commerce quote", "update platform_coin_commerce_quotes set status='active', consumed_at=null"],
  ["wrong commerce quote amount", "update platform_coin_commerce_quotes set amount_units=11"],
  ["wrong old plan", "update platform_coin_commerce_plan_switch_quotes set from_offer_version_ref='unknown'"],
  ["missing immutable quote", "delete from platform_coin_commerce_plan_switch_quotes"],
  ["wrong command ref", "update platform_coin_commerce_fulfillment_commands set command_ref='coincmd_wrong'"],
  ["missing delivery", "delete from platform_coin_commerce_fulfillment_receipts"],
  ["pending delivery", "update platform_coin_commerce_fulfillment_commands set status='pending'"],
  ["authority payload outside this legacy flow", "update platform_coin_commerce_fulfillment_commands set payload_json=json_set(payload_json,'$.authority','unknown')"],
  ["wrong receipt effect", "update platform_coin_commerce_fulfillment_receipts set effect_ref='effect_unrelated'"],
  ["future receipt", "update platform_coin_commerce_fulfillment_receipts set recorded_at='2027-01-01T00:00:00.000Z'"],
  ["wrong issued resource", "update platform_issued_subscription_links set request_id='request_other'"],
  ["forged effect ref", "update platform_audit_events set id='effect_wrong'"],
  ["unknown effect field", "update platform_audit_events set metadata_json=json_set(metadata_json,'$.untrusted',1)"],
  ["wrong actor", "update platform_audit_events set actor_ref='other_actor'"],
  ["current database differs", "update platform_entitlements set valid_until='2026-11-01T00:00:00.000Z'"],
  ["suspended owner", "update platform_accounts set status='suspended'"],
  ["future effect", "update platform_audit_events set created_at='2027-01-01T00:00:00.000Z'"],
  ["old evidence replay", "update platform_audit_events set created_at='2026-10-11T23:59:59.000Z'"],
  ["duplicate receipt", "insert into platform_coin_commerce_fulfillment_receipts select 'duplicate',command_ref,effect_ref,status,safe_code,recorded_at from platform_coin_commerce_fulfillment_receipts"],
  ["malformed evidence JSON", "update platform_audit_events set metadata_json='not-json'"],
]) test(`proof rejects ${name}`, t => {
  const h = fixture(); t.after(h.close); h.transition(); h.db.exec(sql);
  assert.equal(h.prove().ok, false);
});

test("same billing tuple with competing paid transitions is ambiguous", t => {
  const h = fixture(); t.after(h.close); h.transition(); h.transition({ ref: "two" });
  assert.equal(h.prove().ok, false);
});

test("effects cannot be applied in reverse chronological order or skip a missing step", t => {
  const h = fixture(); t.after(h.close); h.transition({ at: NOW });
  const after = billing(PLUS, FROM, afterDays(UNTIL, 30));
  h.transition({ before: billing(PLUS), after, kind: "renewal", ref: "two", at: AT });
  assert.equal(h.prove(billing(), after).ok, false);
  h.db.prepare("delete from platform_audit_events where created_at=?").run(NOW);
  assert.equal(h.prove(billing(), after).ok, false);
});

test("downgrade cannot borrow unrelated or merely scheduled delivery evidence", t => {
  const h = fixture(); t.after(h.close);
  const at = "2026-10-31T00:00:01.000Z", after = billing(BASIC, at, afterDays(at, 30));
  h.transition({ before: billing(PLUS), after, kind: "downgrade_scheduled", at });
  h.db.prepare("update platform_scheduled_plan_switches set paid_units=11").run();
  assert.equal(h.prove(billing(PLUS), after, { now: at }).ok, false);
  h.db.prepare("update platform_scheduled_plan_switches set paid_units=10").run();
  h.db.prepare("delete from platform_audit_events").run();
  assert.equal(h.prove(billing(PLUS), after, { now: at }).ok, false);
});

test("restart must preserve its original monthly cycle anchor", t => {
  const h = fixture(); t.after(h.close);
  const after = billing(YEAR, AT, afterDays(AT, 365));
  h.transition({ after, kind: "upgrade_restart" });
  assert.equal(h.prove(billing(), after).ok, false);
});

test("closed evidence window and expired current entitlement are rejected", t => {
  const h = fixture(); t.after(h.close); h.transition();
  assert.equal(h.prove(billing(), billing(PLUS), { notBefore: NOW, now: AT }).ok, false);
  assert.equal(h.prove(billing(), billing(PLUS), { now: UNTIL }).ok, false);
});

test("identity owner, credential and material cannot be changed by a commerce proof", t => {
  const h = fixture(); t.after(h.close); h.transition();
  for (const field of ["accountId", "entitlementId", "requestId", "channelRef", "edgeCredentialRef", "sourceRef", "materialDigest"]) {
    const currentIdentity = { ...identity(billing(PLUS)), [field]: "changed_synthetic" };
    assert.equal(h.prove(billing(), billing(PLUS), { currentIdentity }).ok, false, field);
  }
});

test("requires caller transaction and propagates real database failures", t => {
  const h = fixture(); t.after(h.close); h.transition();
  assert.throws(() => readFullMeteringPlanSwitchProof({ db: h.db }), /full_metering_proof_transaction_required/);
  h.db.exec("drop table platform_coin_commerce_orders");
  assert.throws(() => h.prove(), /no such table/);
});
