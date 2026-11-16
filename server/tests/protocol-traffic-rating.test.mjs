import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import Database from "better-sqlite3";
import { fullMeteringBindingIdentity } from "../../scripts/lib/full-metering-sample-writer.mjs";
import { fullMeteringDigest } from "../../scripts/lib/full-metering-journal.mjs";
import {
  PROTOCOL_RATING_DENOMINATOR,
  PROTOCOL_RATING_SCHEMA_CHECKSUM,
  applyProtocolTrafficRatingMigration,
  applySampleRating,
  assertRawOnlyRollbackAllowed,
  chargeBytes,
  decimalFromUnits,
  freezeProtocolRatingDecisions,
  multiplierUnitsFromDecimal,
  publishProtocolRatingPolicy,
  activatePendingProtocolRatingPolicy,
  readProtocolRatedUsage,
  recordProtocolRatingBaseline,
  protocolRatingRevision
} from "../services/platform/protocol-traffic-rating.mjs";

const NOW = "2026-10-20T00:00:00.000Z";
const START = "2026-10-01T00:00:00.000Z";
const END = "2026-10-31T00:00:00.000Z";
const PLAN = "offerv_plan_30d_100gb_monthly_v1";

function database() {
  const db = new Database(":memory:");
  db.exec(`
    create table platform_entitlements (
      id text primary key, plan text not null, valid_from text not null, valid_until text not null
    );
    create table platform_usage_samples (
      id text primary key, source_ref text, channel_ref text, edge_credential_ref text,
      account_id text, entitlement_id text, request_id text, observed_at text,
      upload_bytes integer, download_bytes integer, total_bytes integer, created_at text
    );
  `);
  db.prepare("insert into platform_entitlements (id, plan, valid_from, valid_until) values (?, ?, ?, ?)").run("ent", PLAN, START, END);
  applyProtocolTrafficRatingMigration(db, { now: NOW });
  return db;
}

function publish(db, units, at = NOW) {
  const status = publishProtocolRatingPolicy(db, { ...units, now: at, expectedRevision: protocolRatingRevision(db) });
  return activatePendingProtocolRatingPolicy(db, { now: at, ...status });
}

function baseline(db, { observation = "measured_zero", boundary = NOW, accountId = "acct", requestId = "req" } = {}) {
  return recordProtocolRatingBaseline(db, {
    accountId, entitlementId: "ent", requestId, cycleKey: START, windowStartedAt: START,
    boundaryObservedAt: boundary, observation, now: NOW
  });
}

function sample(id, bytes, { upload = bytes, download = 0, at = "2026-10-20T01:00:00.000Z", accountId = "acct", entitlementId = "ent", requestId = "req", channelRef = "channel-vultr-a-hy2", sourceRef = "full_metering_hy2_cumulative_v1" } = {}) {
  const record = {
    id, accountId, entitlementId, requestId, channelRef, sourceRef,
    uploadBytes: upload, downloadBytes: download, totalBytes: upload + download,
    observedAt: at, createdAt: at
  };
  return record;
}

function insertRaw(db, record) {
  db.prepare(`insert into platform_usage_samples (
    id, source_ref, channel_ref, account_id, entitlement_id, request_id, observed_at,
    upload_bytes, download_bytes, total_bytes, created_at
  ) values (@id, @sourceRef, @channelRef, @accountId, @entitlementId, @requestId, @observedAt,
    @uploadBytes, @downloadBytes, @totalBytes, @createdAt)`).run(record);
}

function decisionFor(db, record) {
  const frozen = freezeProtocolRatingDecisions(db, [{ record }]);
  assert.ok(frozen?.[0]);
  return frozen[0];
}

function charge(db, record) {
  insertRaw(db, record);
  return db.transaction(() => applySampleRating(db, record, { decision: decisionFor(db, record), inserted: true }))();
}

test("decimal units and 1.5x remainder across two one-byte samples charge 3", () => {
  assert.equal(multiplierUnitsFromDecimal("1.5"), 15000n);
  assert.equal(decimalFromUnits(15000n), "1.5");
  assert.throws(() => multiplierUnitsFromDecimal("0"), /rating_invalid/);
  assert.throws(() => multiplierUnitsFromDecimal("10.1"), /rating_invalid/);
  const db = database();
  publish(db, { vless: "1.0", hy2: "1.5", tuic: "1.0" });
  baseline(db);
  charge(db, sample("a", 1));
  charge(db, sample("b", 1, { at: "2026-10-20T01:00:01.000Z" }));
  const usage = readProtocolRatedUsage(db, { accountId: "acct", entitlementId: "ent", requestId: "req", cycleKey: START, observedFrom: START });
  assert.equal(usage.mode, "rated");
  assert.equal(usage.totalBytes, 3);
  assert.equal(usage.uploadBytes + usage.downloadBytes, usage.totalBytes);
  assert.equal(usage.rawTotalBytes, 2);
});

test("cross-version 1.5x then 2.5x one-byte samples charge 4 without resetting carry", () => {
  const db = database();
  publish(db, { vless: "1.0", hy2: "1.5", tuic: "1.0" });
  baseline(db);
  charge(db, sample("a", 1));
  publish(db, { vless: "1.0", hy2: "2.5", tuic: "1.0" }, "2026-10-20T02:00:00.000Z");
  charge(db, sample("b", 1, { at: "2026-10-20T02:00:01.000Z" }));
  const usage = readProtocolRatedUsage(db, { requestId: "req", cycleKey: START, observedFrom: START });
  assert.equal(usage.totalBytes, 4);
});

test("many small samples match one large sample and directions sum to the charged total", () => {
  const left = database();
  const right = database();
  for (const db of [left, right]) {
    publish(db, { vless: "1.0", hy2: "1.5", tuic: "2.0" });
    baseline(db);
  }
  for (let index = 0; index < 10; index += 1) {
    charge(left, sample(`s${index}`, 1, { upload: 1, download: 2, at: new Date(Date.parse("2026-10-20T01:00:00.000Z") + index * 1000).toISOString() }));
  }
  charge(right, sample("once", 30, { upload: 10, download: 20 }));
  const a = readProtocolRatedUsage(left, { requestId: "req", cycleKey: START, observedFrom: START });
  const b = readProtocolRatedUsage(right, { requestId: "req", cycleKey: START, observedFrom: START });
  assert.equal(a.totalBytes, b.totalBytes);
  assert.equal(a.uploadBytes + a.downloadBytes, a.totalBytes);
  assert.equal(b.uploadBytes + b.downloadBytes, b.totalBytes);
});

test("replaying one raw sample does not advance carry, and a conflicting decision is rejected", () => {
  const db = database();
  publish(db, { vless: "1.0", hy2: "1.5", tuic: "1.0" });
  baseline(db);
  const record = sample("a", 1);
  charge(db, record);
  const again = decisionFor(db, record);
  const replay = db.transaction(() => applySampleRating(db, record, { decision: again, inserted: false }))();
  assert.equal(replay.mode, "replayed");
  assert.equal(readProtocolRatedUsage(db, { requestId: "req", cycleKey: START, observedFrom: START }).totalBytes, 1);
  assert.throws(() => applySampleRating(db, record, {
    decision: { ...again, multiplierUnits: 25000 },
    inserted: false
  }), /rating_replay_conflict/);
});

test("monthly and lifetime resources do not share a carry bucket", () => {
  const db = database();
  db.prepare("insert into platform_entitlements (id, plan, valid_from, valid_until) values (?, ?, ?, ?)").run(
    "pack", "offerv_pack_100gb_v1", START, "9999-12-31T23:59:59.999Z"
  );
  publish(db, { vless: "1.0", hy2: "1.5", tuic: "1.0" });
  baseline(db);
  recordProtocolRatingBaseline(db, {
    accountId: "acct", entitlementId: "pack", requestId: "pack-req", cycleKey: "lifetime",
    windowStartedAt: START, boundaryObservedAt: NOW, observation: "measured_zero", now: NOW
  });
  charge(db, sample("plan", 1));
  const pack = sample("pack", 1, { entitlementId: "pack", requestId: "pack-req" });
  insertRaw(db, pack);
  db.transaction(() => applySampleRating(db, pack, { decision: decisionFor(db, pack), inserted: true }))();
  assert.equal(readProtocolRatedUsage(db, { requestId: "req", cycleKey: START, observedFrom: START }).totalBytes, 1);
  assert.equal(readProtocolRatedUsage(db, { requestId: "pack-req", cycleKey: "lifetime", observedFrom: START }).totalBytes, 1);
});

test("a rolled-back charge does not keep the remainder", () => {
  const db = database();
  publish(db, { vless: "1.0", hy2: "1.5", tuic: "1.0" });
  baseline(db);
  const record = sample("a", 1);
  insertRaw(db, record);
  assert.throws(() => db.transaction(() => {
    applySampleRating(db, record, { decision: decisionFor(db, record), inserted: true });
    throw new Error("boom");
  })());
  assert.equal(db.prepare("select count(*) as count from platform_protocol_rating_charges").get().count, 0);
  assert.equal(db.prepare("select count(*) as count from platform_protocol_rating_carry").get().count, 0);
});

test("charged bytes round-trip at the safe integer boundary and reject one past it or a ten-times product", () => {
  const safe = BigInt(Number.MAX_SAFE_INTEGER);
  const before = chargeBytes({ rawUploadBytes: safe - 1n, rawDownloadBytes: 0n, multiplierUnits: 10000n });
  assert.equal(before.chargedTotalBytes, safe - 1n);
  assert.equal(BigInt(Number(before.chargedTotalBytes)), before.chargedTotalBytes);
  const edge = chargeBytes({ rawUploadBytes: safe, rawDownloadBytes: 0n, multiplierUnits: 10000n });
  assert.equal(edge.chargedTotalBytes, safe);
  assert.equal(Number(edge.chargedTotalBytes), Number.MAX_SAFE_INTEGER);
  assert.throws(() => chargeBytes({
    rawUploadBytes: safe + 1n, rawDownloadBytes: 0n, multiplierUnits: 10000n
  }), /rating_overflow/);
  assert.notEqual(BigInt(Number(safe * 10n)), safe * 10n);
  assert.throws(() => chargeBytes({
    rawUploadBytes: safe, rawDownloadBytes: 0n, multiplierUnits: 100000n
  }), /rating_overflow/);
  const db = database();
  publish(db, { vless: "10", hy2: "10", tuic: "10" });
  baseline(db);
  const record = sample("edge", Number(safe));
  insertRaw(db, record);
  assert.throws(() => db.transaction(() => applySampleRating(db, record, {
    decision: decisionFor(db, record), inserted: true
  }))(), /rating_overflow/);
  assert.equal(db.prepare("select count(*) as count from platform_protocol_rating_charges").get().count, 0);
  assert.equal(db.prepare("select total_bytes from platform_usage_samples where id = ?").get("edge").total_bytes, Number(safe));
  const kept = database();
  publish(kept, { vless: "1.0", hy2: "1.0", tuic: "1.0" });
  baseline(kept);
  const exact = sample("exact", Number(safe));
  insertRaw(kept, exact);
  kept.transaction(() => applySampleRating(kept, exact, { decision: decisionFor(kept, exact), inserted: true }))();
  assert.equal(kept.prepare("select charged_total_bytes from platform_protocol_rating_charges where raw_sample_id = ?").get("exact").charged_total_bytes, Number(safe));
});

test("overflow, unmapped channels, and a missing frozen decision are rejected", () => {
  assert.throws(() => chargeBytes({
    rawUploadBytes: PROTOCOL_RATING_DENOMINATOR ** 6n,
    rawDownloadBytes: 0n,
    multiplierUnits: 100000n
  }), /rating_overflow/);
  const db = database();
  publish(db, { vless: "1.0", hy2: "1.0", tuic: "1.0" });
  baseline(db);
  const foreign = sample("x", 1, { channelRef: "channel-sgp-a-hy2", sourceRef: "full_metering_hy2_cumulative_v1" });
  insertRaw(db, foreign);
  assert.throws(() => applySampleRating(db, foreign, { decision: null, inserted: true }), /rating_decision_required|rating_protocol_unmapped/);
  const mapped = sample("y", 1);
  insertRaw(db, mapped);
  assert.throws(() => applySampleRating(db, mapped, { decision: null, inserted: true }), /rating_decision_required/);
});

test("historical raw stays outside the charge sum, and a missing new charge stops the read", () => {
  const db = database();
  publish(db, { vless: "2.0", hy2: "2.0", tuic: "2.0" }, "2026-10-20T03:00:00.000Z");
  const old = sample("old", 10, { at: "2026-10-10T00:00:00.000Z" });
  insertRaw(db, old);
  recordProtocolRatingBaseline(db, {
    accountId: "acct", entitlementId: "ent", requestId: "req", cycleKey: START, windowStartedAt: START,
    boundaryObservedAt: "2026-10-10T00:00:00.000Z", observation: "measured", now: "2026-10-20T03:00:00.000Z"
  });
  const usage = readProtocolRatedUsage(db, { requestId: "req", cycleKey: START, observedFrom: START });
  assert.equal(usage.totalBytes, 10);
  assert.equal(db.prepare("select count(*) as count from platform_protocol_rating_charges").get().count, 0);
  const next = sample("new", 4, { at: "2026-10-21T00:00:00.000Z" });
  insertRaw(db, next);
  assert.throws(() => readProtocolRatedUsage(db, { requestId: "req", cycleKey: START, observedFrom: START }), /rating_charge_missing/);
  db.transaction(() => applySampleRating(db, next, { decision: decisionFor(db, next), inserted: true }))();
  assert.equal(readProtocolRatedUsage(db, { requestId: "req", cycleKey: START, observedFrom: START }).totalBytes, 18);
});

test("unobserved history is not stored as zero, and an explicit zero stays zero", () => {
  const unseen = database();
  publish(unseen, { vless: "1.0", hy2: "1.0", tuic: "1.0" });
  baseline(unseen, { observation: "unobserved" });
  assert.equal(readProtocolRatedUsage(unseen, { requestId: "req", cycleKey: START, observedFrom: START }).totalBytes, null);
  charge(unseen, sample("later", 1));
  const unknown = readProtocolRatedUsage(unseen, { requestId: "req", cycleKey: START, observedFrom: START });
  assert.equal(unknown.historyUnobserved, true);
  assert.equal(unknown.totalBytes, null);
  assert.equal(unknown.rawTotalBytes, null);
  assert.equal(unseen.prepare("select count(*) as count from platform_protocol_rating_charges").get().count, 1);
  const seen = database();
  publish(seen, { vless: "1.0", hy2: "1.0", tuic: "1.0" });
  baseline(seen, { observation: "measured_zero" });
  assert.equal(readProtocolRatedUsage(seen, { requestId: "req", cycleKey: START, observedFrom: START }).totalBytes, 0);
});

test("1x matches raw bytes and a later multiplier does not change the metering identity digest", () => {
  const db = database();
  publish(db, { vless: "1.0", hy2: "1.0", tuic: "1.0" });
  baseline(db);
  charge(db, sample("a", 7, { upload: 3, download: 4 }));
  const usage = readProtocolRatedUsage(db, { requestId: "req", cycleKey: START, observedFrom: START });
  assert.equal(usage.totalBytes, 7);
  assert.equal(usage.rawTotalBytes, 7);
  const binding = {
    sourceRef: "full_metering_hy2_cumulative_v1", channelRef: "channel-vultr-a-hy2", edgeCredentialRef: "edge",
    accountId: "acct", entitlementId: "ent", requestId: "req", materialDigest: "a".repeat(64),
    billingBinding: { plan: PLAN, validFrom: START, validUntil: END }
  };
  const before = fullMeteringDigest(fullMeteringBindingIdentity(binding));
  publish(db, { vless: "1.0", hy2: "3.0", tuic: "1.0" }, "2026-10-20T04:00:00.000Z");
  assert.equal(fullMeteringDigest(fullMeteringBindingIdentity(binding)), before);
});

test("migration checksum is stable, duplicate apply is safe, and a different checksum is rejected", () => {
  const db = database();
  const first = applyProtocolTrafficRatingMigration(db, { now: "2026-10-20T05:00:00.000Z" });
  assert.equal(first.checksum, PROTOCOL_RATING_SCHEMA_CHECKSUM);
  assert.equal(applyProtocolTrafficRatingMigration(db, { now: "2026-10-20T06:00:00.000Z" }).checksum, first.checksum);
  db.prepare("update platform_protocol_rating_migrations set checksum = ? where id = ?").run("0".repeat(64), "protocol-traffic-rating-v1");
  assert.throws(() => applyProtocolTrafficRatingMigration(db, { now: "2026-10-20T07:00:00.000Z" }), /rating_checksum_mismatch/);
});

test("non-1x charges forbid a raw-only rollback, and 1x charges do not", () => {
  const identity = database();
  publish(identity, { vless: "1.0", hy2: "1.0", tuic: "1.0" });
  baseline(identity);
  charge(identity, sample("a", 2));
  assert.equal(assertRawOnlyRollbackAllowed(identity).allowed, true);
  const raised = database();
  publish(raised, { vless: "1.0", hy2: "1.5", tuic: "1.0" });
  baseline(raised);
  charge(raised, sample("a", 2));
  assert.throws(() => assertRawOnlyRollbackAllowed(raised), /rating_raw_only_rollback_forbidden/);
});

test("freeze captures the active policy so a later publish is not what the decision carries", () => {
  const db = database();
  publish(db, { vless: "1.0", hy2: "1.5", tuic: "1.0" });
  baseline(db);
  const record = sample("a", 1);
  const frozen = decisionFor(db, record);
  publish(db, { vless: "1.0", hy2: "2.5", tuic: "1.0" }, "2026-10-20T08:00:00.000Z");
  insertRaw(db, record);
  db.transaction(() => applySampleRating(db, record, { decision: frozen, inserted: true }))();
  assert.equal(db.prepare("select multiplier_units from platform_protocol_rating_charges").get().multiplier_units, 15000);
  assert.equal(createHash("sha256").update("probe").digest("hex").length, 64);
});
