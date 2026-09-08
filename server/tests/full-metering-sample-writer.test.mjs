import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import { createFullMeteringSampleWriter, makeFullMeteringSample } from "../../scripts/lib/full-metering-sample-writer.mjs";

const START = "2026-09-08T00:00:00.000Z", END = "2026-09-08T00:01:00.000Z";
const binding = { sourceRef: "full_metering_xray_cumulative_v1", channelRef: "channel-vultr-a-vless-reality-tcp", edgeCredentialRef: "private-ref", materialDigest: "sha256:test", accountId: "account", entitlementId: "entitlement", requestId: "request", billingBinding: { plan: "yearly", validFrom: "2026-09-01T00:00:00.000Z", validUntil: "2027-09-01T00:00:00.000Z" } };
function fixture(t) {
  const db = new Database(":memory:");
  const store = createSqliteSubscriptionControlStore({ database: db });
  t.after(() => db.close());
  store.createAccount({ id: "account", ownerRef: "owner", status: "active", createdAt: START, updatedAt: START });
  store.createEntitlement({ id: "entitlement", accountId: "account", plan: "yearly", status: "active", validFrom: binding.billingBinding.validFrom, validUntil: binding.billingBinding.validUntil, trafficLimitBytes: 99999, createdAt: START, updatedAt: START });
  store.createIssuanceRequest({ id: "request", accountId: "account", entitlementId: "entitlement", approvalRef: "test", status: "issued", quantity: 1, nodeId: binding.channelRef, purpose: "test", requestedByRef: "test", createdAt: START, updatedAt: START });
  let entries = [binding];
  const write = createFullMeteringSampleWriter({ database: db, controlStore: store, readBindings: () => ({ entries }) });
  const sample = makeFullMeteringSample({ binding, activationId: "test-activation", generation: "a".repeat(64), delta: { uploadBytes: 3, downloadBytes: 7, totalBytes: 10, intervalStartedAt: START, intervalEndedAt: END } });
  return { db, store, write, sample, setEntries: value => { entries = value; } };
}
test("full metering sample commits to existing accounting exactly once without schema or rights changes", t => {
  const f = fixture(t);
  const schema = f.db.prepare("SELECT * FROM sqlite_schema ORDER BY name").all();
  const entitlement = f.store.getEntitlement("entitlement");
  f.write([f.sample]); f.write([JSON.parse(JSON.stringify(f.sample))]);
  assert.equal(f.store.listUsageSamples().length, 1);
  assert.equal(f.store.getUsageRollupByEdgeCredentialRef("private-ref").totalBytes, 10);
  assert.deepEqual(f.db.prepare("SELECT * FROM sqlite_schema ORDER BY name").all(), schema);
  assert.deepEqual(f.store.getEntitlement("entitlement"), entitlement);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM platform_usage_counter_cursors").get().n, 0);
});
test("completed intent can finalize after entitlement expiry, but new unverified samples cannot", t => {
  const f = fixture(t);
  f.write([f.sample]); f.setEntries([]); f.write([f.sample]);
  const later = makeFullMeteringSample({ binding, activationId: "test-activation", generation: "a".repeat(64), delta: { uploadBytes: 4, downloadBytes: 6, totalBytes: 10, intervalStartedAt: END, intervalEndedAt: "2026-09-08T00:02:00.000Z" } });
  assert.throws(() => f.write([later]), /binding_changed/);
  assert.equal(f.store.listUsageSamples().length, 1);
});
test("mixed batch validates every binding before commit and rolls back all inserts", t => {
  const f = fixture(t);
  const other = makeFullMeteringSample({ binding: { ...binding, edgeCredentialRef: "unknown-ref" }, activationId: "test-activation", generation: "a".repeat(64), delta: { uploadBytes: 3, downloadBytes: 7, totalBytes: 10, intervalStartedAt: START, intervalEndedAt: END } });
  assert.throws(() => f.write([f.sample, other]), /binding_changed/);
  assert.equal(f.store.listUsageSamples().length, 0);
});
test("changed identity, digest collision, reversed intervals, unsafe totals and cycle crossing fail closed", t => {
  const f = fixture(t);
  f.setEntries([{ ...binding, entitlementId: "other-entitlement" }]);
  assert.throws(() => f.write([f.sample]), /binding_changed/);
  f.setEntries([binding]); f.write([f.sample]);
  const corrupted = structuredClone(f.sample); corrupted.record.uploadBytes++;
  assert.throws(() => f.write([corrupted]), /sample_invalid/);
  const delta = { uploadBytes: 3, downloadBytes: 7, totalBytes: 10, intervalStartedAt: END, intervalEndedAt: START };
  assert.throws(() => makeFullMeteringSample({ binding, activationId: "test", generation: "a".repeat(64), delta }), /interval_invalid/);
  assert.throws(() => makeFullMeteringSample({ binding, activationId: "test", generation: "a".repeat(64), delta: { ...delta, intervalStartedAt: START, intervalEndedAt: END, uploadBytes: Number.MAX_SAFE_INTEGER } }), /counter_invalid/);
  assert.throws(() => makeFullMeteringSample({ binding, activationId: "test", generation: "a".repeat(64), delta: { ...delta, intervalStartedAt: "2026-09-30T23:59:00.000Z", intervalEndedAt: "2026-10-01T00:01:00.000Z" } }), /billing_cycle_changed/);
});
test("rollup overflow and preexisting cross-account rollup do not accept new bytes", t => {
  const f = fixture(t);
  f.write([f.sample]);
  f.db.prepare("UPDATE platform_usage_rollups SET total_bytes=?").run(Number.MAX_SAFE_INTEGER);
  const later = makeFullMeteringSample({ binding, activationId: "test-activation", generation: "a".repeat(64), delta: { uploadBytes: 4, downloadBytes: 6, totalBytes: 10, intervalStartedAt: END, intervalEndedAt: "2026-09-08T00:02:00.000Z" } });
  assert.throws(() => f.write([later]), /rollup_invalid/);
  assert.equal(f.store.listUsageSamples().length, 1);
});
