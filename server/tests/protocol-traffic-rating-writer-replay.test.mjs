import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { createFullMeteringSampleWriter, makeFullMeteringSample } from "../../scripts/lib/full-metering-sample-writer.mjs";
import {
  admitPreRatingSwitchPending, commitFullMeteringJournal, fullMeteringDigest, initializeFullMeteringJournal,
  readFullMeteringJournal, recoverFullMeteringJournal
} from "../../scripts/lib/full-metering-journal.mjs";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import {
  activatePendingProtocolRatingPolicy, applyProtocolTrafficRatingMigration, freezeProtocolRatingDecisions,
  protocolRatingRevision, publishProtocolRatingPolicy, readProtocolRatedUsage, recordProtocolRatingBaseline
} from "../services/platform/protocol-traffic-rating.mjs";
import { usageCycleForBinding } from "../services/platform/usage-billing-cycle.mjs";

const FROM = "2026-09-01T00:00:00.000Z";
const UNTIL = "2027-09-01T00:00:00.000Z";
const START = "2026-09-08T00:00:00.000Z";
const END = "2026-09-08T00:01:00.000Z";
const LATER = "2026-09-08T00:02:00.000Z";
const context = { scopeDigest: "a".repeat(64), databaseIdentityDigest: "b".repeat(64) };
const binding = {
  sourceRef: "full_metering_xray_cumulative_v1",
  channelRef: "channel-vultr-a-vless-reality-tcp",
  edgeCredentialRef: "private-ref",
  materialDigest: "sha256:test",
  accountId: "account",
  entitlementId: "entitlement",
  requestId: "request",
  billingBinding: { plan: "yearly", validFrom: FROM, validUntil: UNTIL }
};

function sampleAt(endedAt, startedAt = START) {
  return makeFullMeteringSample({
    binding,
    activationId: "test-activation",
    generation: "a".repeat(64),
    delta: { uploadBytes: 1, downloadBytes: 0, totalBytes: 1, intervalStartedAt: startedAt, intervalEndedAt: endedAt }
  });
}

function open(t) {
  const db = new Database(":memory:");
  const store = createSqliteSubscriptionControlStore({ database: db });
  const parent = mkdtempSync(join(tmpdir(), "rating-writer-"));
  t.after(() => {
    db.close();
    rmSync(parent, { recursive: true, force: true });
  });
  store.createAccount({ id: "account", ownerRef: "owner", status: "active", createdAt: START, updatedAt: START });
  store.createEntitlement({
    id: "entitlement", accountId: "account", plan: "yearly", status: "active",
    validFrom: FROM, validUntil: UNTIL, trafficLimitBytes: 99999, createdAt: START, updatedAt: START
  });
  store.createIssuanceRequest({
    id: "request", accountId: "account", entitlementId: "entitlement", approvalRef: "test", status: "issued",
    quantity: 1, nodeId: binding.channelRef, purpose: "test", requestedByRef: "test", createdAt: START, updatedAt: START
  });
  const directory = join(parent, "journal");
  initializeFullMeteringJournal({ directory, context, checkpoint: { sequence: 0, channels: [] } });
  const write = createFullMeteringSampleWriter({
    database: db, controlStore: store, readBindings: () => ({ entries: [binding] })
  });
  const cycle = usageCycleForBinding(binding.billingBinding, END);
  return { db, store, write, directory, cycle, sample: sampleAt(END) };
}

function installRating(f, units = { vless: "1.5", hy2: "1.0", tuic: "1.0" }) {
  applyProtocolTrafficRatingMigration(f.db, { now: END });
  const pending = publishProtocolRatingPolicy(f.db, { ...units, now: END, expectedRevision: protocolRatingRevision(f.db) });
  activatePendingProtocolRatingPolicy(f.db, { now: END, ...pending });
}

function baseline(f, boundary = START, observation = "measured_zero") {
  recordProtocolRatingBaseline(f.db, {
    accountId: "account", entitlementId: "entitlement", requestId: "request",
    cycleKey: f.cycle.startedAt, windowStartedAt: f.cycle.startedAt,
    boundaryObservedAt: boundary, observation, now: END
  });
}

function commit(f, samples, extra = {}) {
  const previous = readFullMeteringJournal({ directory: f.directory, context });
  return commitFullMeteringJournal({
    directory: f.directory,
    context,
    previousCheckpoint: previous,
    nextCheckpoint: { sequence: previous.sequence + 1, channels: ["private-ref"] },
    samples,
    applySamples: f.write,
    ...extra
  });
}

function charges(db) {
  return db.prepare("select count(*) as count from platform_protocol_rating_charges").get().count;
}

function carry(db) {
  return db.prepare("select remainder from platform_protocol_rating_carry").get()?.remainder ?? null;
}

function rawTotal(store) {
  return store.listUsageSamples().reduce((sum, row) => sum + row.totalBytes, 0);
}

test("a journal replay of the same frozen decision does not charge twice or move carry", (t) => {
  const f = open(t);
  installRating(f);
  baseline(f);
  const decision = freezeProtocolRatingDecisions(f.db, [f.sample]);
  assert.throws(() => commit(f, [f.sample], {
    freezeRating: () => decision,
    onStage: (stage) => { if (stage === "samples_committed") throw new Error("synthetic_crash"); }
  }), /synthetic_crash/);
  const charged = charges(f.db);
  const remainder = carry(f.db);
  const raw = rawTotal(f.store);
  assert.equal(charged, 1);
  assert.equal(remainder, 5000);
  assert.equal(recoverFullMeteringJournal({ directory: f.directory, context, applySamples: f.write }).recovered, true);
  assert.equal(charges(f.db), charged);
  assert.equal(carry(f.db), remainder);
  assert.equal(rawTotal(f.store), raw);
  assert.equal(f.store.listUsageSamples()[0].totalBytes, 1);
});

test("a changed frozen decision stops the writer without another charge or carry movement", (t) => {
  const f = open(t);
  installRating(f);
  baseline(f);
  const decision = freezeProtocolRatingDecisions(f.db, [f.sample]);
  commit(f, [f.sample], { freezeRating: () => decision });
  const remainder = carry(f.db);
  const changed = [{ ...decision[0], multiplierUnits: 25000 }];
  assert.throws(() => commit(f, [f.sample], { freezeRating: () => changed }), /rating_replay_conflict/);
  assert.equal(charges(f.db), 1);
  assert.equal(carry(f.db), remainder);
  assert.equal(rawTotal(f.store), 1);
});

test("a frozen decision for raw without a charge does not backfill", (t) => {
  const f = open(t);
  installRating(f);
  commit(f, [f.sample]);
  baseline(f);
  assert.equal(charges(f.db), 0);
  assert.equal(carry(f.db), null);
  const decision = freezeProtocolRatingDecisions(f.db, [f.sample]);
  assert.throws(() => commit(f, [f.sample], { freezeRating: () => decision }), /rating_charge_missing/);
  assert.equal(charges(f.db), 0);
  assert.equal(carry(f.db), null);
  assert.equal(f.store.listUsageSamples().length, 1);
  assert.equal(f.store.listUsageSamples()[0].uploadBytes, 1);
});

test("a conflicting replay rolls back the new sample in the same journal batch", (t) => {
  const f = open(t);
  installRating(f);
  baseline(f);
  const first = freezeProtocolRatingDecisions(f.db, [f.sample]);
  commit(f, [f.sample], { freezeRating: () => first });
  const remainder = carry(f.db);
  const later = sampleAt(LATER, END);
  const next = freezeProtocolRatingDecisions(f.db, [later]);
  const bad = [next[0], { ...first[0], multiplierUnits: 25000 }];
  assert.throws(() => commit(f, [later, f.sample], { freezeRating: () => bad }), /rating_replay_conflict/);
  assert.equal(f.store.listUsageSamples().length, 1);
  assert.equal(charges(f.db), 1);
  assert.equal(carry(f.db), remainder);
});

test("historical raw and legacy raw do not gain a charge", (t) => {
  const f = open(t);
  commit(f, [f.sample]);
  assert.equal(f.store.listUsageSamples().length, 1);
  installRating(f);
  commit(f, [f.sample]);
  assert.equal(charges(f.db), 0);
  baseline(f, END, "measured");
  commit(f, [f.sample]);
  commit(f, [f.sample], { freezeRating: () => [null] });
  assert.equal(charges(f.db), 0);
  assert.equal(f.store.listUsageSamples()[0].totalBytes, 1);
  const rated = readProtocolRatedUsage(f.db, {
    requestId: "request", cycleKey: f.cycle.startedAt, observedFrom: f.cycle.startedAt
  });
  assert.equal(rated.totalBytes, 1);
  assert.equal(rated.chargedTotalBytes, 1);
});

test("a failed new commit cannot be recovered as an old v1 exemption", (t) => {
  for (const extra of [{}, { freezeRating: () => null }]) {
    const f = open(t);
    installRating(f);
    baseline(f);
    assert.throws(() => commit(f, [f.sample], extra), /rating_decision_required/);
    const payload = JSON.parse(readFileSync(join(f.directory, "pending.json"), "utf8")).payload;
    assert.equal(payload.version, 2);
    assert.equal(payload.rating, null);
    assert.equal(Object.keys(payload).sort().join(","), "nextCheckpoint,previousDigest,rating,samples,version");
    assert.throws(() => admitPreRatingSwitchPending({ directory: f.directory, context }), /full_metering_legacy_unadmitted/);
    assert.equal(existsSync(join(f.directory, "pre-rating-switch.json")), false);
    assert.throws(() => recoverFullMeteringJournal({
      directory: f.directory, context, applySamples: f.write
    }), /rating_decision_required/);
    assert.equal(f.store.listUsageSamples().length, 0);
    assert.equal(charges(f.db), 0);
    assert.equal(carry(f.db), null);
    assert.equal(readFullMeteringJournal({ directory: f.directory, context }).sequence, 0);
    assert.equal(existsSync(join(f.directory, "pending.json")), true);
  }
});

test("an admitted synthetic version-1 pending replays raw and the rated read still fails", (t) => {
  const f = open(t);
  installRating(f);
  baseline(f);
  const previous = readFullMeteringJournal({ directory: f.directory, context });
  const payload = {
    previousDigest: fullMeteringDigest(previous),
    nextCheckpoint: { sequence: previous.sequence + 1, channels: ["private-ref"] },
    samples: [f.sample]
  };
  const body = { version: 1, context, payload };
  writeFileSync(join(f.directory, "pending.json"), JSON.stringify({ ...body, digest: fullMeteringDigest(body) }), { mode: 0o600 });
  assert.throws(() => recoverFullMeteringJournal({
    directory: f.directory, context, applySamples: f.write
  }), /full_metering_legacy_unadmitted/);
  assert.equal(f.store.listUsageSamples().length, 0);
  assert.equal(charges(f.db), 0);
  assert.equal(carry(f.db), null);
  assert.equal(readFullMeteringJournal({ directory: f.directory, context }).sequence, 0);
  const wrong = { kind: "pre-rating-switch", payloadDigest: "ab".repeat(32) };
  const wrongBody = { version: 1, context, payload: wrong };
  writeFileSync(join(f.directory, "pre-rating-switch.json"), JSON.stringify({ ...wrongBody, digest: fullMeteringDigest(wrongBody) }), { mode: 0o600 });
  assert.throws(() => recoverFullMeteringJournal({
    directory: f.directory, context, applySamples: f.write
  }), /full_metering_legacy_unadmitted/);
  assert.throws(() => admitPreRatingSwitchPending({ directory: f.directory, context }), /full_metering_legacy_unadmitted/);
  assert.equal(f.store.listUsageSamples().length, 0);
  assert.equal(readFullMeteringJournal({ directory: f.directory, context }).sequence, 0);
  rmSync(join(f.directory, "pre-rating-switch.json"));
  const admitted = admitPreRatingSwitchPending({ directory: f.directory, context });
  assert.equal(admitted.payloadDigest, fullMeteringDigest(payload));
  assert.equal(recoverFullMeteringJournal({
    directory: f.directory, context, applySamples: f.write
  }).recovered, true);
  assert.equal(f.store.listUsageSamples().length, 1);
  assert.equal(charges(f.db), 0);
  assert.equal(carry(f.db), null);
  assert.equal(readFullMeteringJournal({ directory: f.directory, context }).sequence, 1);
  assert.equal(existsSync(join(f.directory, "pending.json")), false);
  assert.equal(existsSync(join(f.directory, "pre-rating-switch.json")), false);
  assert.throws(() => readProtocolRatedUsage(f.db, {
    requestId: "request", cycleKey: f.cycle.startedAt, observedFrom: f.cycle.startedAt
  }), /rating_charge_missing/);
});

test("a v2 null does not erase an existing charge or stand in for a missing decision", (t) => {
  const f = open(t);
  installRating(f);
  baseline(f);
  const decision = freezeProtocolRatingDecisions(f.db, [f.sample]);
  commit(f, [f.sample], { freezeRating: () => decision });
  const sequence = readFullMeteringJournal({ directory: f.directory, context }).sequence;
  const remainder = carry(f.db);
  assert.throws(() => commit(f, [f.sample], { freezeRating: () => [null] }), /rating_decision_required/);
  assert.equal(readFullMeteringJournal({ directory: f.directory, context }).sequence, sequence);
  assert.equal(charges(f.db), 1);
  assert.equal(carry(f.db), remainder);
  assert.equal(f.store.listUsageSamples().length, 1);
  const fresh = open(t);
  installRating(fresh);
  baseline(fresh);
  assert.throws(() => commit(fresh, [fresh.sample], { freezeRating: () => [null] }), /rating_decision_required/);
  assert.equal(fresh.store.listUsageSamples().length, 0);
  assert.equal(charges(fresh.db), 0);
  assert.equal(carry(fresh.db), null);
  assert.throws(() => fresh.write([fresh.sample]), /rating_decision_required/);
  assert.equal(fresh.store.listUsageSamples().length, 0);
  assert.equal(charges(fresh.db), 0);
});

test("a mixed historical and rated batch charges only the rated sample", (t) => {
  const f = open(t);
  commit(f, [f.sample]);
  installRating(f);
  baseline(f, END, "measured");
  const later = sampleAt(LATER, END);
  const frozen = freezeProtocolRatingDecisions(f.db, [f.sample, later]);
  assert.equal(frozen[0], null);
  assert.equal(frozen[1].protocol, "vless");
  commit(f, [f.sample, later], { freezeRating: () => frozen });
  assert.equal(f.store.listUsageSamples().length, 2);
  assert.equal(f.db.prepare("select count(*) as count from platform_protocol_rating_charges where raw_sample_id = ?").get(f.sample.record.id).count, 0);
  assert.equal(f.db.prepare("select count(*) as count from platform_protocol_rating_charges where raw_sample_id = ?").get(later.record.id).count, 1);
  const blocked = open(t);
  commit(blocked, [blocked.sample]);
  installRating(blocked);
  baseline(blocked, END, "measured");
  const rated = sampleAt(LATER, END);
  assert.throws(() => commit(blocked, [blocked.sample, rated], { freezeRating: () => [null, null] }), /rating_decision_required/);
  assert.equal(blocked.store.listUsageSamples().length, 1);
  assert.equal(charges(blocked.db), 0);
  assert.equal(blocked.store.listUsageSamples()[0].uploadBytes, 1);
});

test("a failure after the raw charge and carry write rolls the transaction back", (t) => {
  const f = open(t);
  installRating(f);
  baseline(f);
  let writes = 0;
  const original = f.store.recordUsageSample.bind(f.store);
  f.store.recordUsageSample = (input) => {
    const result = original(input);
    writes += 1;
    throw Object.assign(new Error("injected_after_write"), { code: "injected_after_write" });
  };
  const later = sampleAt(LATER, END);
  const frozen = freezeProtocolRatingDecisions(f.db, [f.sample, later]);
  assert.throws(() => commit(f, [f.sample, later], { freezeRating: () => frozen }), /injected_after_write/);
  assert.equal(writes, 1);
  assert.equal(f.store.listUsageSamples().length, 0);
  assert.equal(charges(f.db), 0);
  assert.equal(carry(f.db), null);
});
