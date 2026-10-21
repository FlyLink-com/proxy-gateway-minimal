import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { createFullMeteringSampleWriter, makeFullMeteringSample } from "../../scripts/lib/full-metering-sample-writer.mjs";
import { FULL_METERING_CHANNELS } from "../../scripts/lib/full-metering-scope.mjs";
import { readFullMeteringBindings } from "../../scripts/lib/traffic-vless-recovery-baseline.mjs";
import {
  admitPreRatingSwitchPending, commitFullMeteringJournal, fullMeteringDigest, initializeFullMeteringJournal,
  readFullMeteringJournal, recoverFullMeteringJournal, withFullMeteringJournalLock
} from "../../scripts/lib/full-metering-journal.mjs";
import { runProtocolRatingLifecycle, runProtocolRatingRollbackCheck } from "../../scripts/lib/protocol-traffic-rating-lifecycle.mjs";
import { OPENED_FILE_PROOFS_REJECTED, probeSqliteOpenedFile } from "../../scripts/lib/protocol-traffic-rating-opened-file.mjs";
import { operatorTargetSubject, operatorTargetsMatch, runProtocolRatingOperator } from "../../scripts/lib/protocol-traffic-rating-operator.mjs";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import {
  activatePendingProtocolRatingPolicy, freezeProtocolRatingDecisions, inspectProtocolTrafficRating,
  publishProtocolRatingPolicy, protocolRatingRevision, readProtocolRatedUsage, recordProtocolRatingBaseline
} from "../services/platform/protocol-traffic-rating.mjs";
import { DATA_PACK_TECHNICAL_VALID_UNTIL, usageCycleForBinding } from "../services/platform/usage-billing-cycle.mjs";

const NOW = "2026-10-20T00:00:00.000Z";
const context = { scopeDigest: "a".repeat(64), databaseIdentityDigest: "b".repeat(64) };
const root = join(import.meta.dirname, "../..");

function journal(t, checkpoint = { sequence: 0, channels: [] }) {
  const parent = mkdtempSync(join(tmpdir(), "rating-lifecycle-"));
  const directory = join(parent, "journal");
  initializeFullMeteringJournal({ directory, context, checkpoint });
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  return directory;
}

function entitlementDb() {
  const db = new Database(":memory:");
  db.exec(`create table platform_entitlements (
    id text primary key, plan text not null, valid_from text not null, valid_until text not null
  )`);
  return db;
}

function cycleFor(plan, validFrom, validUntil, at) {
  const cycle = usageCycleForBinding({ plan, validFrom, validUntil }, at);
  return { cycleKey: cycle.cadence === "lifetime" ? "lifetime" : cycle.startedAt, windowStartedAt: cycle.startedAt };
}

function stageFile(directory) {
  return JSON.parse(readFileSync(join(directory, "rating-lifecycle.json"), "utf8"));
}

function charges(db) {
  return db.prepare("select * from platform_protocol_rating_charges order by raw_sample_id").all();
}

function insertEntitlement(db, id, plan, validFrom, validUntil) {
  db.prepare("insert into platform_entitlements (id, plan, valid_from, valid_until) values (?, ?, ?, ?)").run(id, plan, validFrom, validUntil);
}

function baselineItem(id, plan, validFrom, validUntil, at, observation = "measured_zero") {
  return {
    accountId: "account", entitlementId: id, requestId: `request-${id}`, observation,
    boundaryObservedAt: at, ...cycleFor(plan, validFrom, validUntil, at)
  };
}

test("dry run reads only the named database and refuses apply", (t) => {
  const parent = mkdtempSync(join(tmpdir(), "rating-dry-run-"));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const dbPath = join(parent, "synthetic.sqlite");
  const created = new Database(dbPath);
  created.close();
  const inspected = spawnSync(process.execPath, ["scripts/protocol-traffic-rating-dry-run.mjs", "--db", dbPath], { cwd: root, encoding: "utf8" });
  assert.equal(inspected.status, 0, inspected.stderr);
  const report = JSON.parse(inspected.stdout);
  assert.equal(report.apply, "not_performed");
  assert.equal(report.schema, "absent");
  assert.equal(report.reason, "ready_to_apply");
  assert.equal(report.migrationId, "protocol-traffic-rating-v1");
  assert.equal(report.objects.missing.length, 5);
  assert.equal(report.rollback.snapshotRestore, "refused");
  const opened = new Database(dbPath, { readonly: true });
  assert.equal(inspectProtocolTrafficRating(opened).schema, "absent");
  opened.close();
});

test("partial schema and a bad checksum block migration without repair", async (t) => {
  const directory = journal(t);
  const partial = entitlementDb();
  partial.exec("create table platform_protocol_rating_migrations (id text primary key, checksum text not null, applied_at text not null)");
  await assert.rejects(runProtocolRatingLifecycle({
    db: partial, directory, context, now: NOW, action: "migrate"
  }), /rating_partial_schema/);
  assert.equal(partial.prepare("select count(*) as count from sqlite_master where name = 'platform_protocol_rating_policies'").get().count, 0);
  const mismatch = entitlementDb();
  await runProtocolRatingLifecycle({ db: mismatch, directory: journal(t), context, now: NOW, action: "migrate" });
  mismatch.prepare("update platform_protocol_rating_migrations set checksum = ?").run("f".repeat(64));
  assert.equal(inspectProtocolTrafficRating(mismatch).reason, "checksum_mismatch");
  await assert.rejects(runProtocolRatingLifecycle({
    db: mismatch, directory: journal(t), context, now: NOW, action: "migrate"
  }), /rating_checksum_mismatch/);
  assert.equal(mismatch.prepare("select checksum from platform_protocol_rating_migrations").get().checksum, "f".repeat(64));
  partial.close();
  mismatch.close();
});

test("the journal lock is the only writer lock, and an interrupted inspect can resume", async (t) => {
  const directory = journal(t);
  const db = entitlementDb();
  t.after(() => db.close());
  await assert.rejects(withFullMeteringJournalLock({ directory }, async () => {
    await runProtocolRatingLifecycle({ db, directory, context, now: NOW, action: "inspect" });
  }), /full_metering_locked/);
  await assert.rejects(runProtocolRatingLifecycle({
    db, directory, context, now: NOW, action: "migrate",
    onStage: (stage) => { if (stage === "inspect") throw new Error("stop_after_inspect"); }
  }), /stop_after_inspect/);
  const resumed = await runProtocolRatingLifecycle({ db, directory, context, now: NOW, action: "migrate" });
  assert.equal(resumed.stages.migrate.checksum, resumed.stages.inspect.checksum);
  assert.equal(db.prepare("select count(*) as count from platform_protocol_rating_migrations").get().count, 1);
  await runProtocolRatingLifecycle({ db, directory, context, now: NOW, action: "migrate" });
  assert.equal(db.prepare("select count(*) as count from platform_protocol_rating_migrations").get().count, 1);
});

test("old v1 drain requires the payload digest, and a failed new batch stays pending", async (t) => {
  const directory = journal(t);
  const db = new Database(":memory:");
  const store = createSqliteSubscriptionControlStore({ database: db });
  t.after(() => db.close());
  const binding = {
    sourceRef: "full_metering_xray_cumulative_v1", channelRef: "channel-vultr-a-vless-reality-tcp",
    edgeCredentialRef: "private-ref", materialDigest: "sha256:test", accountId: "account",
    entitlementId: "entitlement", requestId: "request",
    billingBinding: { plan: "yearly", validFrom: "2026-09-01T00:00:00.000Z", validUntil: "2027-09-01T00:00:00.000Z" }
  };
  store.createAccount({ id: "account", ownerRef: "owner", status: "active", createdAt: NOW, updatedAt: NOW });
  store.createEntitlement({
    id: "entitlement", accountId: "account", plan: "yearly", status: "active",
    validFrom: binding.billingBinding.validFrom, validUntil: binding.billingBinding.validUntil,
    trafficLimitBytes: 99999, createdAt: NOW, updatedAt: NOW
  });
  store.createIssuanceRequest({
    id: "request", accountId: "account", entitlementId: "entitlement", approvalRef: "test", status: "issued",
    quantity: 1, nodeId: binding.channelRef, purpose: "test", requestedByRef: "test", createdAt: NOW, updatedAt: NOW
  });
  const sample = makeFullMeteringSample({
    binding, activationId: "test-activation", generation: "a".repeat(64),
    delta: { uploadBytes: 1, downloadBytes: 0, totalBytes: 1, intervalStartedAt: "2026-09-08T00:00:00.000Z", intervalEndedAt: "2026-09-08T00:01:00.000Z" }
  });
  const previous = readFullMeteringJournal({ directory, context });
  const payload = {
    previousDigest: fullMeteringDigest(previous),
    nextCheckpoint: { sequence: 1, channels: ["private-ref"] },
    samples: [sample]
  };
  const body = { version: 1, context, payload };
  writeFileSync(join(directory, "pending.json"), JSON.stringify({ ...body, digest: fullMeteringDigest(body) }), { mode: 0o600 });
  const write = createFullMeteringSampleWriter({ database: db, controlStore: store, readBindings: () => ({ entries: [binding] }) });
  await assert.rejects(runProtocolRatingLifecycle({
    db, directory, context, now: NOW, action: "drain", applySamples: write, legacyPayloadDigest: "ab".repeat(32)
  }), /full_metering_legacy_unadmitted/);
  assert.equal(store.listUsageSamples().length, 0);
  assert.equal(existsSync(join(directory, "pending.json")), true);
  admitPreRatingSwitchPending({ directory, context });
  const replaced = { ...payload, samples: [{ ...sample, record: { ...sample.record, uploadBytes: 2 } }] };
  const replacedBody = { version: 1, context, payload: replaced };
  writeFileSync(join(directory, "pending.json"), JSON.stringify({ ...replacedBody, digest: fullMeteringDigest(replacedBody) }), { mode: 0o600 });
  await assert.rejects(runProtocolRatingLifecycle({
    db, directory, context, now: NOW, action: "drain", applySamples: write, legacyPayloadDigest: fullMeteringDigest(replaced)
  }), /full_metering_legacy_unadmitted/);
  assert.equal(store.listUsageSamples().length, 0);
  rmSync(join(directory, "pending.json"));
  rmSync(join(directory, "pre-rating-switch.json"));
  const drained = await runProtocolRatingLifecycle({
    db, directory, context, now: NOW, action: "drain", applySamples: write
  });
  assert.equal(drained.stages.drain.recovered, false);
  assert.equal(drained.stages.drain.simultaneousProtocolSwitch, false);
});

test("a failed version-2 batch is replayed without legacy admission and stays pending when a decision is required", async (t) => {
  const directory = journal(t);
  const db = new Database(":memory:");
  const store = createSqliteSubscriptionControlStore({ database: db });
  t.after(() => db.close());
  const from = "2026-09-01T00:00:00.000Z";
  const until = "2027-09-01T00:00:00.000Z";
  const binding = {
    sourceRef: "full_metering_xray_cumulative_v1", channelRef: "channel-vultr-a-vless-reality-tcp",
    edgeCredentialRef: "private-ref", materialDigest: "sha256:test", accountId: "account",
    entitlementId: "entitlement", requestId: "request",
    billingBinding: { plan: "yearly", validFrom: from, validUntil: until }
  };
  store.createAccount({ id: "account", ownerRef: "owner", status: "active", createdAt: NOW, updatedAt: NOW });
  store.createEntitlement({
    id: "entitlement", accountId: "account", plan: "yearly", status: "active",
    validFrom: from, validUntil: until, trafficLimitBytes: 99999, createdAt: NOW, updatedAt: NOW
  });
  store.createIssuanceRequest({
    id: "request", accountId: "account", entitlementId: "entitlement", approvalRef: "test", status: "issued",
    quantity: 1, nodeId: binding.channelRef, purpose: "test", requestedByRef: "test", createdAt: NOW, updatedAt: NOW
  });
  const write = createFullMeteringSampleWriter({ database: db, controlStore: store, readBindings: () => ({ entries: [binding] }) });
  await runProtocolRatingLifecycle({ db, directory, context, now: NOW, action: "migrate" });
  const cycle = cycleFor("yearly", from, until, "2026-09-08T00:01:00.000Z");
  recordProtocolRatingBaseline(db, {
    accountId: "account", entitlementId: "entitlement", requestId: "request", ...cycle,
    boundaryObservedAt: from, observation: "measured_zero", now: NOW, policyVersion: 0
  });
  const sample = makeFullMeteringSample({
    binding, activationId: "test-activation", generation: "c".repeat(64),
    delta: { uploadBytes: 1, downloadBytes: 0, totalBytes: 1, intervalStartedAt: "2026-09-08T00:00:00.000Z", intervalEndedAt: "2026-09-08T00:01:00.000Z" }
  });
  const previous = readFullMeteringJournal({ directory, context });
  assert.throws(() => commitFullMeteringJournal({
    directory, context, previousCheckpoint: previous,
    nextCheckpoint: { sequence: previous.sequence + 1, channels: ["vless"] },
    samples: [sample], applySamples: write
  }), /rating_decision_required/);
  await assert.rejects(runProtocolRatingLifecycle({
    db, directory, context, now: NOW, action: "drain", applySamples: write
  }), /rating_decision_required/);
  assert.equal(existsSync(join(directory, "pending.json")), true);
  assert.equal(existsSync(join(directory, "pre-rating-switch.json")), false);
  assert.equal(store.listUsageSamples().length, 0);
  assert.equal(db.prepare("select count(*) as count from platform_protocol_rating_charges").get().count, 0);
  assert.equal(readFullMeteringJournal({ directory, context }).sequence, previous.sequence);
});

test("dry run reports partial schema and a bad checksum without writing", async (t) => {
  const parent = mkdtempSync(join(tmpdir(), "rating-dry-run-state-"));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const partialPath = join(parent, "partial.sqlite");
  const partial = new Database(partialPath);
  partial.exec("create table platform_protocol_rating_migrations (id text primary key, checksum text not null, applied_at text not null)");
  partial.close();
  const partialRun = spawnSync(process.execPath, ["scripts/protocol-traffic-rating-dry-run.mjs", "--db", partialPath], { cwd: root, encoding: "utf8" });
  assert.equal(partialRun.status, 0, partialRun.stderr);
  const partialReport = JSON.parse(partialRun.stdout);
  assert.equal(partialReport.schema, "partial");
  assert.equal(partialReport.reason, "partial_schema");
  assert.equal(partialReport.apply, "not_performed");
  const refused = spawnSync(process.execPath, ["scripts/protocol-traffic-rating-dry-run.mjs", "--db", partialPath, "--apply"], { cwd: root, encoding: "utf8" });
  assert.equal(refused.status, 2);
  assert.equal(JSON.parse(refused.stdout).reason, "apply_refused");
  const reopened = new Database(partialPath, { readonly: true });
  assert.equal(reopened.prepare("select count(*) as count from sqlite_master where name = 'platform_protocol_rating_policies'").get().count, 0);
  reopened.close();

  const installedPath = join(parent, "installed.sqlite");
  const installed = new Database(installedPath);
  const directory = journal(t);
  await runProtocolRatingLifecycle({ db: installed, directory, context, now: NOW, action: "migrate" });
  installed.prepare("update platform_protocol_rating_migrations set checksum = ?").run("e".repeat(64));
  installed.close();
  const mismatch = spawnSync(process.execPath, ["scripts/protocol-traffic-rating-dry-run.mjs", "--db", installedPath], { cwd: root, encoding: "utf8" });
  assert.equal(mismatch.status, 0, mismatch.stderr);
  assert.equal(JSON.parse(mismatch.stdout).reason, "checksum_mismatch");
  const still = new Database(installedPath, { readonly: true });
  assert.equal(still.prepare("select checksum from platform_protocol_rating_migrations").get().checksum, "e".repeat(64));
  still.close();
});

test("a changed context or a corrupt stage file is kept and does not continue", async (t) => {
  const directory = journal(t);
  const db = entitlementDb();
  t.after(() => db.close());
  await runProtocolRatingLifecycle({ db, directory, context, now: NOW, action: "inspect" });
  const original = readFileSync(join(directory, "rating-lifecycle.json"), "utf8");
  const other = { scopeDigest: "c".repeat(64), databaseIdentityDigest: context.databaseIdentityDigest };
  await assert.rejects(runProtocolRatingLifecycle({
    db, directory, context: other, now: NOW, action: "inspect"
  }), /rating_lifecycle_conflict/);
  assert.equal(readFileSync(join(directory, "rating-lifecycle.json"), "utf8"), original);
  writeFileSync(join(directory, "rating-lifecycle.json"), "{");
  await assert.rejects(runProtocolRatingLifecycle({
    db, directory, context, now: NOW, action: "migrate"
  }), /rating_lifecycle_record_invalid/);
  assert.equal(readFileSync(join(directory, "rating-lifecycle.json"), "utf8"), "{");
  assert.equal(db.prepare("select count(*) as count from sqlite_master where name = 'platform_protocol_rating_policies'").get().count, 0);
});

test("an interrupted migrate keeps the schema and a second apply does not add a row", async (t) => {
  const directory = journal(t);
  const db = entitlementDb();
  t.after(() => db.close());
  await assert.rejects(runProtocolRatingLifecycle({
    db, directory, context, now: NOW, action: "migrate",
    beforeRecord: (stage) => { if (stage === "migrate") throw new Error("stop_before_migrate_record"); }
  }), /stop_before_migrate_record/);
  assert.equal(Object.hasOwn(stageFile(directory).stages, "migrate"), false);
  assert.equal(db.prepare("select count(*) as count from platform_protocol_rating_migrations").get().count, 1);
  await runProtocolRatingLifecycle({ db, directory, context, now: NOW, action: "migrate" });
  assert.equal(db.prepare("select count(*) as count from platform_protocol_rating_migrations").get().count, 1);
});

test("a matching old v1 drain writes raw once and does not backfill a charge", async (t) => {
  const directory = journal(t);
  const db = new Database(":memory:");
  const store = createSqliteSubscriptionControlStore({ database: db });
  t.after(() => db.close());
  const from = "2026-09-01T00:00:00.000Z";
  const until = "2027-09-01T00:00:00.000Z";
  const binding = {
    sourceRef: "full_metering_xray_cumulative_v1", channelRef: "channel-vultr-a-vless-reality-tcp",
    edgeCredentialRef: "private-ref", materialDigest: "sha256:test", accountId: "account",
    entitlementId: "entitlement", requestId: "request",
    billingBinding: { plan: "yearly", validFrom: from, validUntil: until }
  };
  store.createAccount({ id: "account", ownerRef: "owner", status: "active", createdAt: NOW, updatedAt: NOW });
  store.createEntitlement({
    id: "entitlement", accountId: "account", plan: "yearly", status: "active",
    validFrom: from, validUntil: until, trafficLimitBytes: 99999, createdAt: NOW, updatedAt: NOW
  });
  store.createIssuanceRequest({
    id: "request", accountId: "account", entitlementId: "entitlement", approvalRef: "test", status: "issued",
    quantity: 1, nodeId: binding.channelRef, purpose: "test", requestedByRef: "test", createdAt: NOW, updatedAt: NOW
  });
  const sample = makeFullMeteringSample({
    binding, activationId: "test-activation", generation: "d".repeat(64),
    delta: { uploadBytes: 1, downloadBytes: 0, totalBytes: 1, intervalStartedAt: "2026-09-08T00:00:00.000Z", intervalEndedAt: "2026-09-08T00:01:00.000Z" }
  });
  const previous = readFullMeteringJournal({ directory, context });
  const payload = { previousDigest: fullMeteringDigest(previous), nextCheckpoint: { sequence: 1, channels: ["private-ref"] }, samples: [sample] };
  const body = { version: 1, context, payload };
  writeFileSync(join(directory, "pending.json"), JSON.stringify({ ...body, digest: fullMeteringDigest(body) }), { mode: 0o600 });
  const write = createFullMeteringSampleWriter({ database: db, controlStore: store, readBindings: () => ({ entries: [binding] }) });
  const drained = await runProtocolRatingLifecycle({
    db, directory, context, now: NOW, action: "drain", applySamples: write, legacyPayloadDigest: fullMeteringDigest(payload)
  });
  assert.equal(drained.stages.drain.recovered, true);
  assert.equal(drained.stages.drain.simultaneousProtocolSwitch, false);
  assert.equal(existsSync(join(directory, "pending.json")), false);
  assert.equal(existsSync(join(directory, "pre-rating-switch.json")), false);
  assert.equal(store.listUsageSamples().length, 1);
  assert.equal(store.listUsageSamples()[0].totalBytes, 1);
  assert.equal(charges(db).length, 0);
  const cycle = cycleFor("yearly", from, until, "2026-09-08T00:01:00.000Z");
  await runProtocolRatingLifecycle({
    db, directory, context, now: NOW, action: "baseline",
    baselines: [{
      accountId: "account", entitlementId: "entitlement", requestId: "request", ...cycle,
      boundaryObservedAt: "2026-09-08T00:01:00.000Z", observation: "measured"
    }]
  });
  const rated = readProtocolRatedUsage(db, { requestId: "request", cycleKey: cycle.cycleKey, observedFrom: cycle.windowStartedAt });
  assert.equal(rated.totalBytes, 1);
  assert.equal(charges(db).length, 0);
  const again = await runProtocolRatingLifecycle({
    db, directory, context, now: NOW, action: "drain", applySamples: write
  });
  assert.equal(again.stages.drain.checkpointDigest, drained.stages.drain.checkpointDigest);
  assert.equal(store.listUsageSamples().length, 1);
});

test("a committed batch whose checkpoint was not written is finished once by drain", async (t) => {
  const directory = journal(t);
  const db = new Database(":memory:");
  const store = createSqliteSubscriptionControlStore({ database: db });
  t.after(() => db.close());
  const from = "2026-09-01T00:00:00.000Z";
  const until = "2027-09-01T00:00:00.000Z";
  const binding = {
    sourceRef: "full_metering_xray_cumulative_v1", channelRef: "channel-vultr-a-vless-reality-tcp",
    edgeCredentialRef: "private-ref", materialDigest: "sha256:test", accountId: "account",
    entitlementId: "entitlement", requestId: "request",
    billingBinding: { plan: "yearly", validFrom: from, validUntil: until }
  };
  store.createAccount({ id: "account", ownerRef: "owner", status: "active", createdAt: NOW, updatedAt: NOW });
  store.createEntitlement({
    id: "entitlement", accountId: "account", plan: "yearly", status: "active",
    validFrom: from, validUntil: until, trafficLimitBytes: 99999, createdAt: NOW, updatedAt: NOW
  });
  store.createIssuanceRequest({
    id: "request", accountId: "account", entitlementId: "entitlement", approvalRef: "test", status: "issued",
    quantity: 1, nodeId: binding.channelRef, purpose: "test", requestedByRef: "test", createdAt: NOW, updatedAt: NOW
  });
  const write = createFullMeteringSampleWriter({ database: db, controlStore: store, readBindings: () => ({ entries: [binding] }) });
  await runProtocolRatingLifecycle({ db, directory, context, now: NOW, action: "migrate" });
  publishProtocolRatingPolicy(db, { vless: "1.5", hy2: "1.0", tuic: "1.0", now: NOW, expectedRevision: protocolRatingRevision(db) });
  activatePendingProtocolRatingPolicy(db, { now: NOW });
  const cycle = cycleFor("yearly", from, until, "2026-09-08T00:01:00.000Z");
  recordProtocolRatingBaseline(db, {
    accountId: "account", entitlementId: "entitlement", requestId: "request", ...cycle,
    boundaryObservedAt: from, observation: "measured_zero", now: NOW
  });
  const sample = makeFullMeteringSample({
    binding, activationId: "test-activation", generation: "e".repeat(64),
    delta: { uploadBytes: 1, downloadBytes: 0, totalBytes: 1, intervalStartedAt: "2026-09-08T00:00:00.000Z", intervalEndedAt: "2026-09-08T00:01:00.000Z" }
  });
  const previous = readFullMeteringJournal({ directory, context });
  assert.throws(() => commitFullMeteringJournal({
    directory, context, previousCheckpoint: previous,
    nextCheckpoint: { sequence: previous.sequence + 1, channels: ["private-ref"] },
    samples: [sample], applySamples: write, freezeRating: () => freezeProtocolRatingDecisions(db, [sample]),
    onStage: (stage) => { if (stage === "samples_committed") throw new Error("stop_before_checkpoint"); }
  }), /stop_before_checkpoint/);
  assert.equal(existsSync(join(directory, "pending.json")), true);
  assert.equal(readFullMeteringJournal({ directory, context }).sequence, previous.sequence);
  assert.equal(charges(db).length, 1);
  const drained = await runProtocolRatingLifecycle({
    db, directory, context, now: NOW, action: "drain", applySamples: write
  });
  assert.equal(drained.stages.drain.recovered, true);
  assert.equal(existsSync(join(directory, "pending.json")), false);
  assert.equal(charges(db).length, 1);
  assert.equal(charges(db)[0].carry_out, 5000);
  assert.equal(store.listUsageSamples().length, 1);
  assert.equal(readFullMeteringJournal({ directory, context }).sequence, previous.sequence + 1);
});

test("baseline cycles stay explicit, and a repeat cannot rebuild or drop one", async (t) => {
  const directory = journal(t);
  const db = entitlementDb();
  t.after(() => db.close());
  const yearlyFrom = "2026-09-01T00:00:00.000Z";
  const yearlyUntil = "2027-09-01T00:00:00.000Z";
  const earlyFrom = "2026-01-15T00:00:00.000Z";
  const earlyUntil = "2027-01-15T00:00:00.000Z";
  const monthFrom = "2026-09-01T00:00:00.000Z";
  const monthUntil = "2026-12-01T00:00:00.000Z";
  const packFrom = "2026-08-01T00:00:00.000Z";
  insertEntitlement(db, "yearly", "yearly", yearlyFrom, yearlyUntil);
  insertEntitlement(db, "early", "yearly", earlyFrom, earlyUntil);
  insertEntitlement(db, "month", "offerv_plan_30d_100gb_monthly_v1", monthFrom, monthUntil);
  insertEntitlement(db, "upgrade", "yearly", yearlyFrom, yearlyUntil);
  insertEntitlement(db, "downgrade", "offerv_plan_30d_50gb_monthly_v1", monthFrom, monthUntil);
  insertEntitlement(db, "pack", "offerv_pack_100gb_v1", packFrom, DATA_PACK_TECHNICAL_VALID_UNTIL);
  const resources = [
    baselineItem("yearly", "yearly", yearlyFrom, yearlyUntil, "2026-09-08T00:01:00.000Z"),
    baselineItem("early", "yearly", earlyFrom, earlyUntil, "2026-09-20T00:00:00.000Z"),
    baselineItem("month", "offerv_plan_30d_100gb_monthly_v1", monthFrom, monthUntil, "2026-10-20T00:00:00.000Z"),
    baselineItem("upgrade", "yearly", yearlyFrom, yearlyUntil, "2026-09-08T00:01:00.000Z"),
    baselineItem("downgrade", "offerv_plan_30d_50gb_monthly_v1", monthFrom, monthUntil, "2026-09-20T00:00:00.000Z"),
    baselineItem("pack", "offerv_pack_100gb_v1", packFrom, DATA_PACK_TECHNICAL_VALID_UNTIL, "2026-10-20T00:00:00.000Z")
  ];
  await assert.rejects(runProtocolRatingLifecycle({
    db, directory, context, now: NOW, action: "baseline",
    baselines: [{ ...resources[0], cycleKey: "lifetime" }]
  }), /rating_lifecycle_cycle_conflict/);
  assert.equal(db.prepare("select count(*) as count from platform_protocol_rating_baselines").get().count, 0);
  await runProtocolRatingLifecycle({ db, directory, context, now: NOW, action: "drain" });
  await assert.rejects(runProtocolRatingLifecycle({
    db, directory, context, now: NOW, action: "baseline", baselines: [{ ...resources[0], observation: "measured" }]
  }), /rating_baseline_unproven/);
  assert.equal(db.prepare("select count(*) as count from platform_protocol_rating_baselines").get().count, 0);
  const recorded = await runProtocolRatingLifecycle({
    db, directory, context, now: NOW, action: "baseline", baselines: resources
  });
  assert.equal(recorded.stages.baseline.resources.length, 6);
  const pack = db.prepare("select cycle_key, observation, confirmed_total_bytes from platform_protocol_rating_baselines where entitlement_id = 'pack'").get();
  assert.equal(pack.cycle_key, "lifetime");
  assert.equal(pack.observation, "measured_zero");
  assert.equal(pack.confirmed_total_bytes, 0);
  const early = db.prepare("select cycle_key from platform_protocol_rating_baselines where entitlement_id = 'early'").get();
  assert.equal(early.cycle_key, "2026-09-15T00:00:00.000Z");
  const month = db.prepare("select cycle_key from platform_protocol_rating_baselines where entitlement_id = 'month'").get();
  assert.equal(month.cycle_key, "2026-10-01T00:00:00.000Z");
  await runProtocolRatingLifecycle({ db, directory, context, now: NOW, action: "baseline", baselines: resources });
  assert.equal(db.prepare("select count(*) as count from platform_protocol_rating_baselines").get().count, 6);
  await assert.rejects(runProtocolRatingLifecycle({
    db, directory, context, now: NOW, action: "baseline",
    baselines: resources.map((item) => item.entitlementId === "yearly" ? { ...item, observation: "unobserved" } : item)
  }), /rating_baseline_conflict/);
  assert.equal(db.prepare("select observation from platform_protocol_rating_baselines where entitlement_id = 'yearly'").get().observation, "measured_zero");
  await assert.rejects(runProtocolRatingLifecycle({
    db, directory, context, now: NOW, action: "baseline", baselines: resources.filter((item) => item.entitlementId !== "downgrade")
  }), /rating_lifecycle_conflict/);
  assert.equal(db.prepare("select count(*) as count from platform_protocol_rating_baselines where entitlement_id = 'downgrade'").get().count, 1);
  db.prepare("update platform_entitlements set valid_from = ? where id = 'upgrade'").run("2026-10-01T00:00:00.000Z");
  await assert.rejects(runProtocolRatingLifecycle({
    db, directory, context, now: NOW, action: "baseline", baselines: resources
  }), /rating_lifecycle_cycle_conflict/);
  assert.equal(db.prepare("select cycle_key from platform_protocol_rating_baselines where entitlement_id = 'upgrade'").get().cycle_key, "2026-09-01T00:00:00.000Z");
});

test("activation follows a quiet checkpoint, and a price change does not reset carry", async (t) => {
  const directory = journal(t);
  const db = new Database(":memory:");
  const store = createSqliteSubscriptionControlStore({ database: db });
  t.after(() => db.close());
  const from = "2026-09-01T00:00:00.000Z";
  const until = "2027-09-01T00:00:00.000Z";
  const binding = {
    sourceRef: "full_metering_xray_cumulative_v1", channelRef: "channel-vultr-a-vless-reality-tcp",
    edgeCredentialRef: "private-ref", materialDigest: "sha256:test", accountId: "account",
    entitlementId: "entitlement", requestId: "request",
    billingBinding: { plan: "yearly", validFrom: from, validUntil: until }
  };
  store.createAccount({ id: "account", ownerRef: "owner", status: "active", createdAt: NOW, updatedAt: NOW });
  store.createEntitlement({
    id: "entitlement", accountId: "account", plan: "yearly", status: "active",
    validFrom: from, validUntil: until, trafficLimitBytes: 99999, createdAt: NOW, updatedAt: NOW
  });
  store.createIssuanceRequest({
    id: "request", accountId: "account", entitlementId: "entitlement", approvalRef: "test", status: "issued",
    quantity: 1, nodeId: binding.channelRef, purpose: "test", requestedByRef: "test", createdAt: NOW, updatedAt: NOW
  });
  const write = createFullMeteringSampleWriter({ database: db, controlStore: store, readBindings: () => ({ entries: [binding] }) });
  const september = cycleFor("yearly", from, until, "2026-09-08T00:01:00.000Z");
  const octoberBoundary = "2026-10-01T00:00:00.000Z";
  const october = cycleFor("yearly", from, until, "2026-10-01T00:01:00.000Z");
  await runProtocolRatingLifecycle({ db, directory, context, now: NOW, action: "drain" });
  await runProtocolRatingLifecycle({
    db, directory, context, now: NOW, action: "baseline",
    baselines: [{
      accountId: "account", entitlementId: "entitlement", requestId: "request", ...september,
      boundaryObservedAt: from, observation: "measured_zero"
    }]
  });
  await assert.rejects(runProtocolRatingLifecycle({
    db, directory, context, now: NOW, action: "activate"
  }), /rating_pending_missing/);
  assert.equal(Object.hasOwn(stageFile(directory).stages, "activate"), false);
  publishProtocolRatingPolicy(db, { vless: "1.5", hy2: "1.0", tuic: "1.0", now: NOW, expectedRevision: protocolRatingRevision(db) });
  await assert.rejects(runProtocolRatingLifecycle({
    db, directory, context, now: NOW, action: "activate",
    beforeRecord: (stage) => { if (stage === "activate") throw new Error("stop_before_activate_record"); }
  }), /stop_before_activate_record/);
  assert.equal(db.prepare("select status from platform_protocol_rating_policies").get().status, "active");
  assert.equal(Object.hasOwn(stageFile(directory).stages, "activate"), false);
  const activated = await runProtocolRatingLifecycle({ db, directory, context, now: NOW, action: "activate" });
  assert.equal(activated.stages.activate.policyVersion, 1);
  assert.equal(activated.stages.activate.simultaneousProtocolSwitch, false);
  assert.equal(db.prepare("select count(*) as count from platform_protocol_rating_policies where status = 'active'").get().count, 1);
  const later = "2026-10-20T00:05:00.000Z";
  publishProtocolRatingPolicy(db, { vless: "2.5", hy2: "1.0", tuic: "1.0", now: later, expectedRevision: protocolRatingRevision(db) });
  const held = await runProtocolRatingLifecycle({ db, directory, context, now: later, action: "activate" });
  assert.equal(held.stages.activate.policyVersion, 1);
  assert.equal(db.prepare("select count(*) as count from platform_protocol_rating_policies where status = 'pending'").get().count, 1);
  const first = makeFullMeteringSample({
    binding, activationId: "test-activation", generation: "1".repeat(64),
    delta: { uploadBytes: 1, downloadBytes: 0, totalBytes: 1, intervalStartedAt: "2026-09-08T00:00:00.000Z", intervalEndedAt: "2026-09-08T00:01:00.000Z" }
  });
  const checkpoint = readFullMeteringJournal({ directory, context });
  commitFullMeteringJournal({
    directory, context, previousCheckpoint: checkpoint,
    nextCheckpoint: { sequence: checkpoint.sequence + 1, channels: ["private-ref"] },
    samples: [first], applySamples: write, freezeRating: () => freezeProtocolRatingDecisions(db, [first]),
    onStage: (stage) => {
      if (stage !== "pending_durable") return;
      publishProtocolRatingPolicy(db, { vless: "2.5", hy2: "1.0", tuic: "1.0", now: "2026-10-20T00:06:00.000Z", expectedRevision: protocolRatingRevision(db) });
    }
  });
  assert.equal(charges(db)[0].multiplier_units, 15000);
  assert.equal(charges(db)[0].carry_out, 5000);
  assert.equal(db.prepare("select version from platform_protocol_rating_policies where status = 'active'").get().version, 1);
  const switched = await runProtocolRatingLifecycle({ db, directory, context, now: "2026-10-20T00:06:00.000Z", action: "activate" });
  assert.equal(db.prepare("select vless_units from platform_protocol_rating_policies where status = 'active'").get().vless_units, 25000);
  assert.notEqual(switched.stages.activate.checkpointDigest, activated.stages.activate.checkpointDigest);
  assert.equal(switched.stages.activate.simultaneousProtocolSwitch, false);
  await runProtocolRatingLifecycle({
    db, directory, context, now: "2026-10-20T00:06:00.000Z", action: "baseline",
    baselines: [
      { accountId: "account", entitlementId: "entitlement", requestId: "request", ...september, boundaryObservedAt: from, observation: "measured_zero" },
      { accountId: "account", entitlementId: "entitlement", requestId: "request", ...october, boundaryObservedAt: octoberBoundary, observation: "measured_zero" }
    ]
  });
  const octoberSample = makeFullMeteringSample({
    binding, activationId: "test-activation", generation: "3".repeat(64),
    delta: { uploadBytes: 1, downloadBytes: 0, totalBytes: 1, intervalStartedAt: "2026-10-01T00:00:00.000Z", intervalEndedAt: "2026-10-01T00:01:00.000Z" }
  });
  const beforeOctober = readFullMeteringJournal({ directory, context });
  commitFullMeteringJournal({
    directory, context, previousCheckpoint: beforeOctober,
    nextCheckpoint: { sequence: beforeOctober.sequence + 1, channels: ["private-ref"] },
    samples: [octoberSample], applySamples: write, freezeRating: () => freezeProtocolRatingDecisions(db, [octoberSample])
  });
  const octoberCharge = db.prepare("select carry_in, charged_total_bytes from platform_protocol_rating_charges where cycle_key = ?").get(october.cycleKey);
  assert.equal(octoberCharge.carry_in, 0);
  assert.equal(octoberCharge.charged_total_bytes, 2);
  assert.equal(db.prepare("select remainder from platform_protocol_rating_carry where cycle_key = ?").get(september.cycleKey).remainder, 5000);
  const older = makeFullMeteringSample({
    binding, activationId: "test-activation", generation: "2".repeat(64),
    delta: { uploadBytes: 1, downloadBytes: 0, totalBytes: 1, intervalStartedAt: "2026-09-08T00:01:00.000Z", intervalEndedAt: "2026-09-08T00:02:00.000Z" }
  });
  const beforeOlder = readFullMeteringJournal({ directory, context });
  assert.throws(() => commitFullMeteringJournal({
    directory, context, previousCheckpoint: beforeOlder,
    nextCheckpoint: { sequence: beforeOlder.sequence + 1, channels: ["private-ref"] },
    samples: [older], applySamples: write, freezeRating: () => freezeProtocolRatingDecisions(db, [older])
  }), /full_metering_rollup_invalid/);
  assert.equal(existsSync(join(directory, "pending.json")), true);
  assert.equal(readFullMeteringJournal({ directory, context }).sequence, beforeOlder.sequence);
  assert.equal(store.listUsageSamples().length, 2);
  assert.equal(db.prepare("select remainder from platform_protocol_rating_carry where cycle_key = ?").get(september.cycleKey).remainder, 5000);
  const septemberCharges = db.prepare("select carry_in, charged_total_bytes from platform_protocol_rating_charges where cycle_key = ?").all(september.cycleKey);
  assert.deepEqual(septemberCharges.map((row) => [row.carry_in, row.charged_total_bytes]), [[0, 1]]);
  assert.equal(charges(db).length, 2);
  assert.equal(charges(db).reduce((sum, row) => sum + row.charged_total_bytes, 0), 3);
});

function policyState(db) {
  const rows = db.prepare("select version, status from platform_protocol_rating_policies").all();
  return {
    activeVersion: rows.find((row) => row.status === "active")?.version ?? null,
    pendingVersion: rows.find((row) => row.status === "pending")?.version ?? null
  };
}

test("recovery after an interrupted activation keeps the original policy", async (t) => {
  const directory = journal(t);
  const db = entitlementDb();
  t.after(() => db.close());
  await runProtocolRatingLifecycle({ db, directory, context, now: NOW, action: "baseline", baselines: [] });
  const checkpoint = fullMeteringDigest(readFullMeteringJournal({ directory, context }));
  publishProtocolRatingPolicy(db, { vless: "1.5", hy2: "1.0", tuic: "1.0", now: NOW, expectedRevision: protocolRatingRevision(db) });
  await assert.rejects(runProtocolRatingLifecycle({
    db, directory, context, now: NOW, action: "activate",
    beforeRecord: (stage) => { if (stage === "activate") throw new Error("stop_before_activate_record"); }
  }), /stop_before_activate_record/);
  assert.deepEqual(policyState(db), { activeVersion: 1, pendingVersion: null });
  assert.equal(Object.hasOwn(stageFile(directory).stages, "activate"), false);
  const chargesBefore = db.prepare("select count(*) as count from platform_protocol_rating_charges").get().count;
  const carryBefore = db.prepare("select count(*) as count from platform_protocol_rating_carry").get().count;
  publishProtocolRatingPolicy(db, {
    vless: "2.5", hy2: "1.0", tuic: "1.0", now: "2026-10-20T00:05:00.000Z", expectedRevision: protocolRatingRevision(db)
  });
  const resumed = await runProtocolRatingLifecycle({
    db, directory, context, now: "2026-10-20T00:05:00.000Z", action: "activate"
  });
  assert.deepEqual(policyState(db), { activeVersion: 1, pendingVersion: 2 });
  assert.equal(resumed.stages.activate.policyVersion, 1);
  assert.equal(resumed.stages.activate.checkpointDigest, checkpoint);
  assert.equal(fullMeteringDigest(readFullMeteringJournal({ directory, context })), checkpoint);
  assert.equal(db.prepare("select count(*) as count from platform_protocol_rating_charges").get().count, chargesBefore);
  assert.equal(db.prepare("select count(*) as count from platform_protocol_rating_carry").get().count, carryBefore);
  const repeated = await runProtocolRatingLifecycle({
    db, directory, context, now: "2026-10-20T00:05:00.000Z", action: "activate"
  });
  assert.equal(repeated.stages.activate.policyVersion, 1);
  assert.equal(repeated.stages.activate.policyDigest, resumed.stages.activate.policyDigest);
  assert.equal(repeated.stages.activate.checkpointDigest, checkpoint);
  assert.deepEqual(policyState(db), { activeVersion: 1, pendingVersion: 2 });
});

test("activation persist faults leave the previous record or a visible intent", async (t) => {
  const directory = journal(t);
  const db = entitlementDb();
  t.after(() => db.close());
  await runProtocolRatingLifecycle({ db, directory, context, now: NOW, action: "baseline", baselines: [] });
  publishProtocolRatingPolicy(db, { vless: "1.5", hy2: "1.0", tuic: "1.0", now: NOW, expectedRevision: protocolRatingRevision(db) });
  const beforeFault = readFileSync(join(directory, "rating-lifecycle.json"), "utf8");
  await assert.rejects(runProtocolRatingLifecycle({
    db, directory, context, now: NOW, action: "activate", persistFault: "before-rename"
  }), /persist_before_rename/);
  assert.equal(readFileSync(join(directory, "rating-lifecycle.json"), "utf8"), beforeFault);
  assert.deepEqual(policyState(db), { activeVersion: null, pendingVersion: 1 });
  assert.equal(readdirSync(directory).some((name) => name.endsWith(".tmp")), false);

  await assert.rejects(runProtocolRatingLifecycle({
    db, directory, context, now: NOW, action: "activate", persistFault: "parent-sync"
  }), /persist_parent_sync/);
  const intent = stageFile(directory).stages.activateIntent;
  assert.equal(intent.targetVersion, 1);
  assert.equal(intent.policyDigest, db.prepare("select policy_digest from platform_protocol_rating_policies where version = 1").get().policy_digest);
  assert.equal(Object.hasOwn(stageFile(directory).stages, "activate"), false);
  assert.deepEqual(policyState(db), { activeVersion: null, pendingVersion: 1 });
  const resumed = await runProtocolRatingLifecycle({ db, directory, context, now: NOW, action: "activate" });
  assert.equal(resumed.stages.activate.policyVersion, 1);
  assert.equal(resumed.stages.activate.policyDigest, intent.policyDigest);
  assert.deepEqual(policyState(db), { activeVersion: 1, pendingVersion: null });
  const repeated = await runProtocolRatingLifecycle({ db, directory, context, now: NOW, action: "activate" });
  assert.equal(repeated.stages.activate.policyVersion, 1);
  assert.equal(repeated.stages.activate.policyDigest, intent.policyDigest);
  assert.deepEqual(policyState(db), { activeVersion: 1, pendingVersion: null });
});

test("a second parent-sync failure leaves the unpublished target inactive", async (t) => {
  const directory = journal(t);
  const db = entitlementDb();
  t.after(() => db.close());
  await runProtocolRatingLifecycle({ db, directory, context, now: NOW, action: "baseline", baselines: [] });
  publishProtocolRatingPolicy(db, { vless: "1.5", hy2: "1.0", tuic: "1.0", now: NOW, expectedRevision: protocolRatingRevision(db) });
  const checkpoint = fullMeteringDigest(readFullMeteringJournal({ directory, context }));
  await assert.rejects(runProtocolRatingLifecycle({
    db, directory, context, now: NOW, action: "activate", persistFault: "parent-sync"
  }), /persist_parent_sync/);
  const intent = stageFile(directory).stages.activateIntent;
  assert.equal(intent.targetVersion, 1);
  assert.equal(intent.checkpointDigest, checkpoint);
  assert.equal(Object.hasOwn(stageFile(directory).stages, "activate"), false);
  assert.deepEqual(policyState(db), { activeVersion: null, pendingVersion: 1 });
  const chargesBefore = db.prepare("select count(*) as count from platform_protocol_rating_charges").get().count;
  const carryBefore = db.prepare("select count(*) as count from platform_protocol_rating_carry").get().count;
  await assert.rejects(runProtocolRatingLifecycle({
    db, directory, context, now: NOW, action: "activate", persistFault: "parent-sync"
  }), /persist_parent_sync/);
  assert.deepEqual(policyState(db), { activeVersion: null, pendingVersion: 1 });
  assert.equal(Object.hasOwn(stageFile(directory).stages, "activate"), false);
  assert.equal(stageFile(directory).stages.activateIntent.targetVersion, 1);
  assert.equal(stageFile(directory).stages.activateIntent.policyDigest, intent.policyDigest);
  assert.equal(stageFile(directory).stages.activateIntent.expectedActiveVersion, null);
  assert.equal(stageFile(directory).stages.activateIntent.checkpointDigest, checkpoint);
  assert.equal(fullMeteringDigest(readFullMeteringJournal({ directory, context })), checkpoint);
  assert.equal(db.prepare("select count(*) as count from platform_protocol_rating_charges").get().count, chargesBefore);
  assert.equal(db.prepare("select count(*) as count from platform_protocol_rating_carry").get().count, carryBefore);
});

test("a failed activation receipt keeps the committed policy and the later pending", async (t) => {
  const directory = journal(t);
  const db = entitlementDb();
  t.after(() => db.close());
  await runProtocolRatingLifecycle({ db, directory, context, now: NOW, action: "baseline", baselines: [] });
  publishProtocolRatingPolicy(db, { vless: "1.5", hy2: "1.0", tuic: "1.0", now: NOW, expectedRevision: protocolRatingRevision(db) });
  const checkpoint = fullMeteringDigest(readFullMeteringJournal({ directory, context }));
  await assert.rejects(runProtocolRatingLifecycle({
    db, directory, context, now: NOW, action: "activate",
    beforeRecord: (stage) => { if (stage === "activate") throw new Error("stop_before_activate_record"); }
  }), /stop_before_activate_record/);
  const intent = stageFile(directory).stages.activateIntent;
  assert.equal(intent.targetVersion, 1);
  assert.equal(Object.hasOwn(stageFile(directory).stages, "activate"), false);
  assert.deepEqual(policyState(db), { activeVersion: 1, pendingVersion: null });
  publishProtocolRatingPolicy(db, {
    vless: "2.5", hy2: "1.0", tuic: "1.0", now: "2026-10-20T00:05:00.000Z", expectedRevision: protocolRatingRevision(db)
  });
  const chargesBefore = db.prepare("select count(*) as count from platform_protocol_rating_charges").get().count;
  const carryBefore = db.prepare("select count(*) as count from platform_protocol_rating_carry").get().count;
  await assert.rejects(runProtocolRatingLifecycle({
    db, directory, context, now: "2026-10-20T00:05:00.000Z", action: "activate", persistFault: "before-rename"
  }), /persist_before_rename/);
  assert.deepEqual(policyState(db), { activeVersion: 1, pendingVersion: 2 });
  assert.equal(Object.hasOwn(stageFile(directory).stages, "activate"), false);
  assert.equal(stageFile(directory).stages.activateIntent.policyDigest, intent.policyDigest);
  assert.equal(stageFile(directory).stages.activateIntent.checkpointDigest, checkpoint);
  await assert.rejects(runProtocolRatingLifecycle({
    db, directory, context, now: "2026-10-20T00:05:00.000Z", action: "activate", persistFault: "parent-sync"
  }), /persist_parent_sync/);
  assert.deepEqual(policyState(db), { activeVersion: 1, pendingVersion: 2 });
  assert.equal(fullMeteringDigest(readFullMeteringJournal({ directory, context })), checkpoint);
  assert.equal(db.prepare("select count(*) as count from platform_protocol_rating_charges").get().count, chargesBefore);
  assert.equal(db.prepare("select count(*) as count from platform_protocol_rating_carry").get().count, carryBefore);
  const completed = await runProtocolRatingLifecycle({
    db, directory, context, now: "2026-10-20T00:05:00.000Z", action: "activate"
  });
  assert.equal(completed.stages.activate.policyVersion, 1);
  assert.equal(completed.stages.activate.policyDigest, intent.policyDigest);
  assert.equal(completed.stages.activate.checkpointDigest, checkpoint);
  assert.deepEqual(policyState(db), { activeVersion: 1, pendingVersion: 2 });
  assert.equal(db.prepare("select count(*) as count from platform_protocol_rating_charges").get().count, chargesBefore);
  assert.equal(db.prepare("select count(*) as count from platform_protocol_rating_carry").get().count, carryBefore);
});

test("a visible activation receipt stays incomplete until its sync succeeds again", async (t) => {
  const directory = journal(t);
  const db = entitlementDb();
  t.after(() => db.close());
  await runProtocolRatingLifecycle({ db, directory, context, now: NOW, action: "baseline", baselines: [] });
  publishProtocolRatingPolicy(db, { vless: "1.5", hy2: "1.0", tuic: "1.0", now: NOW, expectedRevision: protocolRatingRevision(db) });
  const checkpoint = fullMeteringDigest(readFullMeteringJournal({ directory, context }));
  await assert.rejects(runProtocolRatingLifecycle({
    db, directory, context, now: NOW, action: "activate",
    beforeRecord: (stage) => { if (stage === "activate") throw new Error("stop_before_activate_record"); }
  }), /stop_before_activate_record/);
  publishProtocolRatingPolicy(db, {
    vless: "2.5", hy2: "1.0", tuic: "1.0", now: "2026-10-20T00:05:00.000Z", expectedRevision: protocolRatingRevision(db)
  });
  await assert.rejects(runProtocolRatingLifecycle({
    db, directory, context, now: "2026-10-20T00:05:00.000Z", action: "activate", persistFault: "parent-sync"
  }), /persist_parent_sync/);
  const visible = stageFile(directory).stages.activate;
  assert.equal(visible.policyVersion, 1);
  assert.equal(visible.checkpointDigest, checkpoint);
  assert.deepEqual(policyState(db), { activeVersion: 1, pendingVersion: 2 });
  const chargesBefore = db.prepare("select count(*) as count from platform_protocol_rating_charges").get().count;
  const carryBefore = db.prepare("select count(*) as count from platform_protocol_rating_carry").get().count;
  const baselinesBefore = db.prepare("select count(*) as count from platform_protocol_rating_baselines").get().count;
  await assert.rejects(runProtocolRatingLifecycle({
    db, directory, context, now: "2026-10-20T00:05:00.000Z", action: "activate", persistFault: "parent-sync"
  }), /persist_parent_sync/);
  assert.deepEqual(policyState(db), { activeVersion: 1, pendingVersion: 2 });
  assert.equal(stageFile(directory).stages.activate.policyVersion, 1);
  assert.equal(stageFile(directory).stages.activate.policyDigest, visible.policyDigest);
  assert.equal(stageFile(directory).stages.activate.checkpointDigest, checkpoint);
  assert.equal(fullMeteringDigest(readFullMeteringJournal({ directory, context })), checkpoint);
  assert.equal(db.prepare("select count(*) as count from platform_protocol_rating_charges").get().count, chargesBefore);
  assert.equal(db.prepare("select count(*) as count from platform_protocol_rating_carry").get().count, carryBefore);
  assert.equal(db.prepare("select count(*) as count from platform_protocol_rating_baselines").get().count, baselinesBefore);
  const completed = await runProtocolRatingLifecycle({
    db, directory, context, now: "2026-10-20T00:05:00.000Z", action: "activate"
  });
  assert.equal(completed.stages.activate.policyVersion, 1);
  assert.equal(completed.stages.activate.policyDigest, visible.policyDigest);
  assert.equal(completed.stages.activate.checkpointDigest, checkpoint);
  const repeated = await runProtocolRatingLifecycle({
    db, directory, context, now: "2026-10-20T00:05:00.000Z", action: "activate"
  });
  assert.equal(repeated.stages.activate.policyVersion, 1);
  assert.equal(repeated.stages.activate.policyDigest, visible.policyDigest);
  assert.deepEqual(policyState(db), { activeVersion: 1, pendingVersion: 2 });
  assert.equal(fullMeteringDigest(readFullMeteringJournal({ directory, context })), checkpoint);
  assert.equal(db.prepare("select count(*) as count from platform_protocol_rating_charges").get().count, chargesBefore);
  assert.equal(db.prepare("select count(*) as count from platform_protocol_rating_carry").get().count, carryBefore);
  assert.equal(db.prepare("select count(*) as count from platform_protocol_rating_baselines").get().count, baselinesBefore);
});

test("a replaced activation target stays pending and the writer lock does not apply it", async (t) => {
  const directory = journal(t);
  const db = entitlementDb();
  t.after(() => db.close());
  await runProtocolRatingLifecycle({ db, directory, context, now: NOW, action: "baseline", baselines: [] });
  publishProtocolRatingPolicy(db, { vless: "1.5", hy2: "1.0", tuic: "1.0", now: NOW, expectedRevision: protocolRatingRevision(db) });
  const checkpoint = fullMeteringDigest(readFullMeteringJournal({ directory, context }));
  await assert.rejects(runProtocolRatingLifecycle({
    db, directory, context, now: NOW, action: "activate",
    beforeActivateDb: () => { throw new Error("stop_before_activate_db"); }
  }), /stop_before_activate_db/);
  assert.equal(stageFile(directory).stages.activateIntent.targetVersion, 1);
  assert.equal(stageFile(directory).stages.activateIntent.checkpointDigest, checkpoint);
  assert.deepEqual(policyState(db), { activeVersion: null, pendingVersion: 1 });
  await withFullMeteringJournalLock({ directory }, async () => {
    await assert.rejects(runProtocolRatingLifecycle({
      db, directory, context, now: NOW, action: "activate"
    }), /full_metering_locked/);
  });
  assert.deepEqual(policyState(db), { activeVersion: null, pendingVersion: 1 });
  assert.equal(Object.hasOwn(stageFile(directory).stages, "activate"), false);

  const replaced = journal(t);
  const replacedDb = entitlementDb();
  t.after(() => replacedDb.close());
  await runProtocolRatingLifecycle({ db: replacedDb, directory: replaced, context, now: NOW, action: "baseline", baselines: [] });
  publishProtocolRatingPolicy(replacedDb, { vless: "1.5", hy2: "1.0", tuic: "1.0", now: NOW, expectedRevision: protocolRatingRevision(replacedDb) });
  const replacedCheckpoint = fullMeteringDigest(readFullMeteringJournal({ directory: replaced, context }));
  await assert.rejects(runProtocolRatingLifecycle({
    db: replacedDb, directory: replaced, context, now: NOW, action: "activate",
    beforeActivateDb: () => publishProtocolRatingPolicy(replacedDb, {
      vless: "2.5", hy2: "1.0", tuic: "1.0", now: "2026-10-20T00:05:00.000Z", expectedRevision: protocolRatingRevision(replacedDb)
    })
  }), /rating_lifecycle_conflict/);
  assert.deepEqual(policyState(replacedDb), { activeVersion: null, pendingVersion: 2 });
  assert.equal(stageFile(replaced).stages.activateIntent.targetVersion, 1);
  assert.equal(Object.hasOwn(stageFile(replaced).stages, "activate"), false);
  assert.equal(fullMeteringDigest(readFullMeteringJournal({ directory: replaced, context })), replacedCheckpoint);
  await assert.rejects(runProtocolRatingLifecycle({
    db: replacedDb, directory: replaced, context, now: "2026-10-20T00:05:00.000Z", action: "activate"
  }), /rating_lifecycle_conflict/);
  assert.deepEqual(policyState(replacedDb), { activeVersion: null, pendingVersion: 2 });
  assert.equal(replacedDb.prepare("select count(*) as count from platform_protocol_rating_charges").get().count, 0);
});

test("an invalid pending is refused and the file stays", async (t) => {
  const directory = journal(t);
  const db = entitlementDb();
  t.after(() => db.close());
  const checkpoint = readFullMeteringJournal({ directory, context });
  const payload = {
    version: 2, previousDigest: fullMeteringDigest(checkpoint),
    nextCheckpoint: { sequence: checkpoint.sequence + 1, channels: [] },
    samples: [], rating: null, unexpected: true
  };
  const body = { version: 1, context, payload };
  const encoded = JSON.stringify({ ...body, digest: fullMeteringDigest(body) });
  writeFileSync(join(directory, "pending.json"), encoded);
  await assert.rejects(runProtocolRatingLifecycle({
    db, directory, context, now: NOW, action: "drain"
  }), /full_metering_intent_invalid/);
  assert.equal(readFileSync(join(directory, "pending.json"), "utf8"), encoded);
  assert.equal(Object.hasOwn(stageFile(directory).stages, "drain"), false);
  assert.equal(db.prepare("select count(*) as count from platform_protocol_rating_baselines").get().count, 0);
});

test("an explicit empty baseline is recorded once and a later pending is kept", async (t) => {
  const directory = journal(t);
  const db = entitlementDb();
  t.after(() => db.close());
  await runProtocolRatingLifecycle({ db, directory, context, now: NOW, action: "baseline", baselines: [] });
  assert.deepEqual(stageFile(directory).stages.baseline.resources, []);
  assert.equal(db.prepare("select count(*) as count from platform_protocol_rating_baselines").get().count, 0);
  await runProtocolRatingLifecycle({ db, directory, context, now: NOW, action: "baseline", baselines: [] });
  assert.equal(db.prepare("select count(*) as count from platform_protocol_rating_baselines").get().count, 0);
  const marker = "{\"kept\":true}";
  writeFileSync(join(directory, "pending.json"), marker);
  await assert.rejects(runProtocolRatingLifecycle({
    db, directory, context, now: NOW, action: "activate"
  }), /rating_lifecycle_pending_present/);
  assert.equal(readFileSync(join(directory, "pending.json"), "utf8"), marker);
  assert.equal(Object.hasOwn(stageFile(directory).stages, "activate"), false);
});

test("rollback is a separate entry and refuses raw-only rollback after a non-identity charge", async (t) => {
  const absentDirectory = journal(t);
  const absent = entitlementDb();
  t.after(() => absent.close());
  const allowed = await runProtocolRatingRollbackCheck({ db: absent, directory: absentDirectory, context });
  assert.equal(allowed.rollback.allowed, true);
  assert.equal(allowed.rollback.reason, "schema_absent");
  assert.equal(absent.prepare("select count(*) as count from sqlite_master where name = 'platform_protocol_rating_policies'").get().count, 0);

  const directory = journal(t);
  const db = new Database(":memory:");
  const store = createSqliteSubscriptionControlStore({ database: db });
  t.after(() => db.close());
  const from = "2026-09-01T00:00:00.000Z";
  const until = "2027-09-01T00:00:00.000Z";
  const binding = {
    sourceRef: "full_metering_xray_cumulative_v1", channelRef: "channel-vultr-a-vless-reality-tcp",
    edgeCredentialRef: "private-ref", materialDigest: "sha256:test", accountId: "account",
    entitlementId: "entitlement", requestId: "request",
    billingBinding: { plan: "yearly", validFrom: from, validUntil: until }
  };
  store.createAccount({ id: "account", ownerRef: "owner", status: "active", createdAt: NOW, updatedAt: NOW });
  store.createEntitlement({
    id: "entitlement", accountId: "account", plan: "yearly", status: "active",
    validFrom: from, validUntil: until, trafficLimitBytes: 99999, createdAt: NOW, updatedAt: NOW
  });
  store.createIssuanceRequest({
    id: "request", accountId: "account", entitlementId: "entitlement", approvalRef: "test", status: "issued",
    quantity: 1, nodeId: binding.channelRef, purpose: "test", requestedByRef: "test", createdAt: NOW, updatedAt: NOW
  });
  const write = createFullMeteringSampleWriter({ database: db, controlStore: store, readBindings: () => ({ entries: [binding] }) });
  await runProtocolRatingLifecycle({ db, directory, context, now: NOW, action: "migrate" });
  const identity = await runProtocolRatingRollbackCheck({ db, directory, context });
  assert.equal(identity.rollback.reason, "no_non_identity_charge");
  publishProtocolRatingPolicy(db, { vless: "1.5", hy2: "1.0", tuic: "1.0", now: NOW, expectedRevision: protocolRatingRevision(db) });
  activatePendingProtocolRatingPolicy(db, { now: NOW });
  const cycle = cycleFor("yearly", from, until, "2026-09-08T00:01:00.000Z");
  recordProtocolRatingBaseline(db, {
    accountId: "account", entitlementId: "entitlement", requestId: "request", ...cycle,
    boundaryObservedAt: from, observation: "measured_zero", now: NOW
  });
  const sample = makeFullMeteringSample({
    binding, activationId: "test-activation", generation: "f".repeat(64),
    delta: { uploadBytes: 1, downloadBytes: 0, totalBytes: 1, intervalStartedAt: "2026-09-08T00:00:00.000Z", intervalEndedAt: "2026-09-08T00:01:00.000Z" }
  });
  const previous = readFullMeteringJournal({ directory, context });
  commitFullMeteringJournal({
    directory, context, previousCheckpoint: previous,
    nextCheckpoint: { sequence: previous.sequence + 1, channels: ["private-ref"] },
    samples: [sample], applySamples: write, freezeRating: () => freezeProtocolRatingDecisions(db, [sample])
  });
  await assert.rejects(runProtocolRatingRollbackCheck({ db, directory, context }), /rating_raw_only_rollback_forbidden/);
  assert.equal(stageFile(directory).stages.rollback.allowed, false);
  assert.equal(charges(db).length, 1);
  publishProtocolRatingPolicy(db, { vless: "1.0", hy2: "1.0", tuic: "1.0", now: "2026-10-20T00:05:00.000Z", expectedRevision: protocolRatingRevision(db) });
  activatePendingProtocolRatingPolicy(db, { now: "2026-10-20T00:05:00.000Z" });
  await assert.rejects(runProtocolRatingRollbackCheck({ db, directory, context }), /rating_raw_only_rollback_forbidden/);
  assert.equal(charges(db).length, 1);
  assert.equal(db.prepare("select remainder from platform_protocol_rating_carry").get().remainder, 5000);
  assert.equal(store.listUsageSamples().length, 1);
});

function formalRequest(directory, db, action, fields = {}) {
  const request = {
    action, directory, context, db,
    now: fields.now || NOW,
    expectedCheckpointDigest: fields.expectedCheckpointDigest
      || fullMeteringDigest(readFullMeteringJournal({ directory, context }))
  };
  if (action === "baseline") request.baselines = fields.baselines;
  if (action === "activate") {
    request.expectedPolicyVersion = fields.expectedPolicyVersion;
    request.expectedPolicyDigest = fields.expectedPolicyDigest;
    request.expectedActiveVersion = fields.expectedActiveVersion;
  }
  if (action === "drain" && Object.hasOwn(fields, "legacyPayloadDigest")) {
    request.legacyPayloadDigest = fields.legacyPayloadDigest;
  }
  return request;
}

async function openMovedWindow(t) {
  const parent = mkdtempSync(join(tmpdir(), "rating-next-window-"));
  const directory = join(parent, "journal");
  const db = new Database(join(parent, "control.sqlite"));
  initializeFullMeteringJournal({ directory, context, checkpoint: { sequence: 0, channels: [] } });
  t.after(() => { db.close(); rmSync(parent, { recursive: true, force: true }); });
  const store = createSqliteSubscriptionControlStore({ database: db });
  const from = "2026-09-01T00:00:00.000Z";
  const until = "2027-09-01T00:00:00.000Z";
  const binding = {
    sourceRef: "full_metering_xray_cumulative_v1", channelRef: "channel-vultr-a-vless-reality-tcp",
    edgeCredentialRef: "private-ref", materialDigest: "sha256:test", accountId: "account",
    entitlementId: "entitlement", requestId: "request",
    billingBinding: { plan: "yearly", validFrom: from, validUntil: until }
  };
  store.createAccount({ id: "account", ownerRef: "owner", status: "active", createdAt: NOW, updatedAt: NOW });
  store.createEntitlement({
    id: "entitlement", accountId: "account", plan: "yearly", status: "active",
    validFrom: from, validUntil: until, trafficLimitBytes: 99999, createdAt: NOW, updatedAt: NOW
  });
  store.createIssuanceRequest({
    id: "request", accountId: "account", entitlementId: "entitlement", approvalRef: "test", status: "issued",
    quantity: 1, nodeId: binding.channelRef, purpose: "test", requestedByRef: "test", createdAt: NOW, updatedAt: NOW
  });
  const write = createFullMeteringSampleWriter({ database: db, controlStore: store, readBindings: () => ({ entries: [binding] }) });
  const september = cycleFor("yearly", from, until, "2026-09-08T00:01:00.000Z");
  for (const action of ["inspect", "migrate", "drain"]) {
    await runProtocolRatingOperator(formalRequest(directory, db, action));
  }
  await runProtocolRatingOperator(formalRequest(directory, db, "baseline", {
    baselines: [{
      accountId: "account", entitlementId: "entitlement", requestId: "request", ...september,
      boundaryObservedAt: from, observation: "measured_zero"
    }]
  }));
  publishProtocolRatingPolicy(db, { vless: "1.5", hy2: "1.0", tuic: "1.0", now: NOW, expectedRevision: protocolRatingRevision(db) });
  const first = db.prepare("select version, policy_digest from platform_protocol_rating_policies where status = 'pending'").get();
  const firstCheckpoint = fullMeteringDigest(readFullMeteringJournal({ directory, context }));
  await runProtocolRatingOperator(formalRequest(directory, db, "activate", {
    expectedPolicyVersion: 1, expectedPolicyDigest: first.policy_digest, expectedActiveVersion: null,
    expectedCheckpointDigest: firstCheckpoint
  }));
  publishProtocolRatingPolicy(db, { vless: "2.5", hy2: "1.0", tuic: "1.0", now: "2026-10-20T00:05:00.000Z", expectedRevision: protocolRatingRevision(db) });
  const second = db.prepare("select version, policy_digest from platform_protocol_rating_policies where status = 'pending'").get();
  const sample = makeFullMeteringSample({
    binding, activationId: "test-activation", generation: "1".repeat(64),
    delta: { uploadBytes: 1, downloadBytes: 0, totalBytes: 1, intervalStartedAt: "2026-09-08T00:00:00.000Z", intervalEndedAt: "2026-09-08T00:01:00.000Z" }
  });
  const checkpoint = readFullMeteringJournal({ directory, context });
  commitFullMeteringJournal({
    directory, context, previousCheckpoint: checkpoint,
    nextCheckpoint: { sequence: checkpoint.sequence + 1, channels: ["private-ref"] },
    samples: [sample], applySamples: write, freezeRating: () => freezeProtocolRatingDecisions(db, [sample])
  });
  const nextCheckpoint = fullMeteringDigest(readFullMeteringJournal({ directory, context }));
  return { directory, db, store, write, binding, first, second, firstCheckpoint, nextCheckpoint };
}

function activateMoved(opened, fields = {}) {
  return runProtocolRatingOperator(formalRequest(opened.directory, opened.db, "activate", {
    now: "2026-10-20T00:06:00.000Z",
    expectedPolicyVersion: fields.expectedPolicyVersion ?? opened.second.version,
    expectedPolicyDigest: fields.expectedPolicyDigest ?? opened.second.policy_digest,
    expectedActiveVersion: fields.expectedActiveVersion === undefined ? 1 : fields.expectedActiveVersion,
    expectedCheckpointDigest: fields.expectedCheckpointDigest || opened.nextCheckpoint
  }));
}

test("a completed formal window accepts the next accurate price only after the checkpoint moves", async (t) => {
  const opened = await openMovedWindow(t);
  const { directory, db, store, write, binding, second, firstCheckpoint, nextCheckpoint } = opened;
  assert.equal(db.prepare("select version from platform_protocol_rating_policies where status = 'active'").get().version, 1);
  const beforeSkip = readFileSync(join(directory, "rating-lifecycle.json"));
  await assert.rejects(activateMoved(opened, { expectedCheckpointDigest: firstCheckpoint }), /rating_lifecycle_conflict/);
  assert.equal(readFileSync(join(directory, "rating-lifecycle.json")).equals(beforeSkip), true);
  assert.notEqual(nextCheckpoint, firstCheckpoint);
  assert.equal(charges(db)[0].policy_version, 1);
  assert.equal(charges(db)[0].multiplier_units, 15000);
  const switched = await runProtocolRatingOperator(formalRequest(directory, db, "activate", {
    now: "2026-10-20T00:06:00.000Z",
    expectedPolicyVersion: second.version, expectedPolicyDigest: second.policy_digest, expectedActiveVersion: 1,
    expectedCheckpointDigest: nextCheckpoint
  }));
  assert.equal(switched.ok, true);
  assert.equal(switched.digests.policy, second.policy_digest);
  assert.equal(switched.digests.checkpoint, nextCheckpoint);
  assert.equal(db.prepare("select version, vless_units from platform_protocol_rating_policies where status = 'active'").get().vless_units, 25000);
  assert.equal(db.prepare("select count(*) as count from platform_protocol_rating_policies where status = 'pending'").get().count, 0);
  assert.equal(db.prepare("select status from platform_protocol_rating_policies where version = 1").get().status, "superseded");
  assert.equal(charges(db)[0].policy_version, 1);
  assert.equal(charges(db)[0].multiplier_units, 15000);
  assert.equal(db.prepare("select count(*) as count from platform_protocol_rating_baselines").get().count, 1);
  const repeated = await runProtocolRatingOperator(formalRequest(directory, db, "activate", {
    now: "2026-10-20T00:06:00.000Z",
    expectedPolicyVersion: second.version, expectedPolicyDigest: second.policy_digest, expectedActiveVersion: 1,
    expectedCheckpointDigest: nextCheckpoint
  }));
  assert.equal(repeated.digests.policy, second.policy_digest);
  assert.equal(charges(db).length, 1);
  const later = makeFullMeteringSample({
    binding, activationId: "test-activation", generation: "2".repeat(64),
    delta: { uploadBytes: 1, downloadBytes: 0, totalBytes: 1, intervalStartedAt: "2026-09-08T00:01:00.000Z", intervalEndedAt: "2026-09-08T00:02:00.000Z" }
  });
  const beforeLater = readFullMeteringJournal({ directory, context });
  commitFullMeteringJournal({
    directory, context, previousCheckpoint: beforeLater,
    nextCheckpoint: { sequence: beforeLater.sequence + 1, channels: ["private-ref"] },
    samples: [later], applySamples: write, freezeRating: () => freezeProtocolRatingDecisions(db, [later])
  });
  const rows = charges(db);
  assert.deepEqual(rows.map((row) => [row.policy_version, row.multiplier_units, row.carry_in, row.charged_total_bytes, row.carry_out]), [
    [1, 15000, 0, 1, 5000],
    [2, 25000, 5000, 3, 0]
  ]);
  assert.equal(db.prepare("select remainder from platform_protocol_rating_carry").get().remainder, 0);
  assert.equal(store.listUsageSamples().length, 2);
  assert.equal(db.prepare("select count(*) as count from platform_protocol_rating_baselines").get().count, 1);
});

test("a new price window keeps the captured target when the request or the receipt is interrupted", async (t) => {
  const mismatched = await openMovedWindow(t);
  const beforeMismatch = readFileSync(join(mismatched.directory, "rating-lifecycle.json"));
  await assert.rejects(activateMoved(mismatched, { expectedPolicyDigest: "f".repeat(64) }), /rating_lifecycle_conflict/);
  await assert.rejects(activateMoved(mismatched, { expectedActiveVersion: null }), /rating_lifecycle_conflict/);
  await assert.rejects(activateMoved(mismatched, { expectedActiveVersion: 2 }), /rating_lifecycle_conflict/);
  await assert.rejects(activateMoved(mismatched, { expectedCheckpointDigest: "e".repeat(64) }), /rating_lifecycle_conflict/);
  publishProtocolRatingPolicy(mismatched.db, {
    vless: "3.5", hy2: "1.0", tuic: "1.0", now: "2026-10-20T00:07:00.000Z", expectedRevision: protocolRatingRevision(mismatched.db)
  });
  await assert.rejects(activateMoved(mismatched), /rating_lifecycle_conflict/);
  const replaced = mismatched.db.prepare("select version, policy_digest from platform_protocol_rating_policies where status = 'pending'").get();
  await assert.rejects(activateMoved(mismatched, {
    expectedPolicyVersion: replaced.version, expectedPolicyDigest: replaced.policy_digest, expectedActiveVersion: null
  }), /rating_lifecycle_conflict/);
  writeFileSync(join(mismatched.directory, "pending.json"), "{}\n");
  await assert.rejects(activateMoved(mismatched, {
    expectedPolicyVersion: replaced.version, expectedPolicyDigest: replaced.policy_digest
  }), /rating_lifecycle_pending_present/);
  assert.equal(existsSync(join(mismatched.directory, "pending.json")), true);
  assert.equal(readFileSync(join(mismatched.directory, "rating-lifecycle.json")).equals(beforeMismatch), true);
  assert.equal(mismatched.db.prepare("select version from platform_protocol_rating_policies where status = 'active'").get().version, 1);
  assert.equal(charges(mismatched.db).length, 1);
  assert.equal(mismatched.db.prepare("select count(*) as count from platform_protocol_rating_baselines").get().count, 1);

  const beforeDb = await openMovedWindow(t);
  const beforeRename = readFileSync(join(beforeDb.directory, "rating-lifecycle.json"));
  await assert.rejects(runProtocolRatingLifecycle({
    db: beforeDb.db, directory: beforeDb.directory, context, now: "2026-10-20T00:06:00.000Z", action: "activate",
    persistFault: "before-rename"
  }), /persist_before_rename/);
  assert.equal(readFileSync(join(beforeDb.directory, "rating-lifecycle.json")).equals(beforeRename), true);
  assert.equal(beforeDb.db.prepare("select version from platform_protocol_rating_policies where status = 'active'").get().version, 1);
  await assert.rejects(runProtocolRatingLifecycle({
    db: beforeDb.db, directory: beforeDb.directory, context, now: "2026-10-20T00:06:00.000Z", action: "activate",
    persistFault: "parent-sync"
  }), /persist_parent_sync/);
  assert.equal(stageFile(beforeDb.directory).stages.activate.policyVersion, 1);
  assert.equal(stageFile(beforeDb.directory).stages.activateIntent.targetVersion, beforeDb.second.version);
  assert.equal(stageFile(beforeDb.directory).stages.activateIntent.policyDigest, beforeDb.second.policy_digest);
  assert.equal(beforeDb.db.prepare("select version from platform_protocol_rating_policies where status = 'active'").get().version, 1);
  publishProtocolRatingPolicy(beforeDb.db, {
    vless: "3.5", hy2: "1.0", tuic: "1.0", now: "2026-10-20T00:07:00.000Z", expectedRevision: protocolRatingRevision(beforeDb.db)
  });
  const heldIntent = readFileSync(join(beforeDb.directory, "rating-lifecycle.json"));
  await assert.rejects(activateMoved(beforeDb), /rating_lifecycle_conflict/);
  const third = beforeDb.db.prepare("select version, policy_digest from platform_protocol_rating_policies where status = 'pending'").get();
  await assert.rejects(activateMoved(beforeDb, {
    expectedPolicyVersion: third.version, expectedPolicyDigest: third.policy_digest
  }), /rating_lifecycle_conflict/);
  assert.equal(readFileSync(join(beforeDb.directory, "rating-lifecycle.json")).equals(heldIntent), true);
  assert.equal(beforeDb.db.prepare("select version from platform_protocol_rating_policies where status = 'active'").get().version, 1);
  assert.equal(charges(beforeDb.db)[0].policy_version, 1);

  const afterDb = await openMovedWindow(t);
  await assert.rejects(runProtocolRatingLifecycle({
    db: afterDb.db, directory: afterDb.directory, context, now: "2026-10-20T00:06:00.000Z", action: "activate",
    beforeRecord: (stage) => { if (stage === "activate") throw new Error("stop_before_next_receipt"); }
  }), /stop_before_next_receipt/);
  assert.equal(afterDb.db.prepare("select version from platform_protocol_rating_policies where status = 'active'").get().version, afterDb.second.version);
  assert.equal(stageFile(afterDb.directory).stages.activate.policyVersion, 1);
  assert.equal(stageFile(afterDb.directory).stages.activateIntent.targetVersion, afterDb.second.version);
  assert.equal(charges(afterDb.db).length, 1);
  publishProtocolRatingPolicy(afterDb.db, {
    vless: "3.5", hy2: "1.0", tuic: "1.0", now: "2026-10-20T00:07:00.000Z", expectedRevision: protocolRatingRevision(afterDb.db)
  });
  await assert.rejects(runProtocolRatingLifecycle({
    db: afterDb.db, directory: afterDb.directory, context, now: "2026-10-20T00:06:00.000Z", action: "activate",
    persistFault: "parent-sync"
  }), /persist_parent_sync/);
  assert.equal(stageFile(afterDb.directory).stages.activate.policyVersion, afterDb.second.version);
  assert.equal(stageFile(afterDb.directory).stages.activate.policyDigest, afterDb.second.policy_digest);
  assert.equal(afterDb.db.prepare("select version from platform_protocol_rating_policies where status = 'pending'").get().version, 3);
  const completed = await activateMoved(afterDb);
  assert.equal(completed.digests.policy, afterDb.second.policy_digest);
  assert.equal(completed.digests.checkpoint, afterDb.nextCheckpoint);
  assert.equal(afterDb.db.prepare("select version from platform_protocol_rating_policies where status = 'active'").get().version, afterDb.second.version);
  assert.equal(afterDb.db.prepare("select version from platform_protocol_rating_policies where status = 'pending'").get().version, 3);
  await assert.rejects(activateMoved(afterDb, {
    expectedPolicyVersion: 3,
    expectedPolicyDigest: afterDb.db.prepare("select policy_digest from platform_protocol_rating_policies where status = 'pending'").get().policy_digest
  }), /rating_lifecycle_conflict/);
  const repeated = await activateMoved(afterDb);
  assert.equal(repeated.digests.policy, afterDb.second.policy_digest);
  assert.equal(charges(afterDb.db).length, 1);
  assert.equal(charges(afterDb.db)[0].policy_version, 1);
  assert.equal(afterDb.db.prepare("select count(*) as count from platform_protocol_rating_baselines").get().count, 1);
});

const BINDING_FROM = "2026-09-29T00:00:00.000Z";
const BINDING_UNTIL = "2027-09-29T00:00:00.000Z";
const BINDING_MATERIAL = `sha256:${"a".repeat(64)}`;

function installDurableBindings(control) {
  for (const [index, source] of FULL_METERING_CHANNELS.entries()) {
    const suffix = String(index + 1);
    const accountId = "acct_formal_drain";
    const entitlementId = `ent_formal_${suffix}`;
    const requestId = `request_formal_${suffix}`;
    const edgeCredentialRef = `edge_formal_${suffix}`;
    if (index === 0) {
      control.createAccount({ id: accountId, ownerRef: "owner_formal_drain", status: "active", createdAt: BINDING_FROM, updatedAt: BINDING_FROM });
    }
    control.createEntitlement({
      id: entitlementId, accountId, plan: "yearly", status: "active",
      validFrom: BINDING_FROM, validUntil: BINDING_UNTIL, trafficLimitBytes: 1024 ** 3,
      createdAt: BINDING_FROM, updatedAt: BINDING_FROM
    });
    control.createIssuanceRequest({
      id: requestId, accountId, entitlementId, approvalRef: `approval_formal_${suffix}`,
      status: "issued", quantity: 1, nodeId: source.channelRef, purpose: "portal_auto_issuance",
      requestedByRef: "fixture_issuer", createdAt: BINDING_FROM, updatedAt: BINDING_FROM
    });
    control.linkIssuedSubscription({
      id: `link_formal_${suffix}`, requestId, tenantRef: `tenant_formal_${suffix}`,
      artifactRef: `artifact_formal_${suffix}`, status: "active", createdAt: BINDING_FROM, updatedAt: BINDING_FROM
    });
    control.upsertPortalAccessRequest({
      id: requestId, portalUserRef: accountId, plan: "yearly", clientTarget: "clash", durationDays: 365,
      quantity: 1, status: "delivered", nextAction: "user_can_use_access", noteProvided: false,
      priorTrialState: "not_applicable", submittedAt: BINDING_FROM, updatedAt: BINDING_FROM,
      validUntil: BINDING_UNTIL, entitlementRef: entitlementId, accessGrantRef: `grant_formal_${suffix}`,
      tenantId: `tenant_formal_${suffix}`, artifactId: `artifact_formal_${suffix}`,
      edgeChannelRef: source.channelRef, edgeCredentialRef, edgeMaterialDigest: BINDING_MATERIAL
    });
  }
}

function boundEntry(db) {
  const inventory = db.transaction(() => readFullMeteringBindings({
    db, databaseIdentityDigest: context.databaseIdentityDigest,
    channelRefs: FULL_METERING_CHANNELS.map((source) => source.channelRef), now: NOW
  }))();
  const binding = inventory.entries.find((entry) => entry.channelRef === "channel-vultr-a-vless-reality-tcp");
  if (!binding) throw new Error("formal_binding_missing");
  return binding;
}

test("formal drain recovers an approved old pending without an external writer", async (t) => {
  const directory = journal(t);
  const db = new Database(":memory:");
  const store = createSqliteSubscriptionControlStore({ database: db });
  t.after(() => db.close());
  installDurableBindings(store);
  const binding = boundEntry(db);
  await runProtocolRatingOperator(formalRequest(directory, db, "inspect"));
  await runProtocolRatingOperator(formalRequest(directory, db, "migrate"));
  const sample = makeFullMeteringSample({
    binding, activationId: "test-activation", generation: "a".repeat(64),
    delta: { uploadBytes: 1, downloadBytes: 0, totalBytes: 1, intervalStartedAt: "2026-10-01T00:00:00.000Z", intervalEndedAt: "2026-10-01T00:01:00.000Z" }
  });
  const previous = readFullMeteringJournal({ directory, context });
  const payload = { previousDigest: fullMeteringDigest(previous), nextCheckpoint: { sequence: 1, channels: ["edge_formal_1"] }, samples: [sample] };
  const body = { version: 1, context, payload };
  writeFileSync(join(directory, "pending.json"), JSON.stringify({ ...body, digest: fullMeteringDigest(body) }), { mode: 0o600 });
  const drained = await runProtocolRatingOperator(formalRequest(directory, db, "drain", {
    legacyPayloadDigest: fullMeteringDigest(payload)
  }));
  assert.equal(drained.ok, true);
  assert.equal(drained.counts.charges, 0);
  assert.equal(existsSync(join(directory, "pending.json")), false);
  assert.equal(existsSync(join(directory, "pre-rating-switch.json")), false);
  assert.equal(store.listUsageSamples().length, 1);
  assert.equal(store.listUsageSamples()[0].totalBytes, 1);
  assert.equal(JSON.stringify(drained).includes("edge_formal_1"), false);
  assert.equal(JSON.stringify(drained).includes(directory), false);
  const repeated = await runProtocolRatingOperator(formalRequest(directory, db, "drain", {
    legacyPayloadDigest: fullMeteringDigest(payload),
    expectedCheckpointDigest: drained.digests.checkpoint
  }));
  assert.equal(repeated.counts.charges, 0);
  assert.equal(store.listUsageSamples().length, 1);
});

function writeLegacyPending(directory, payload) {
  const body = { version: 1, context, payload };
  writeFileSync(join(directory, "pending.json"), JSON.stringify({ ...body, digest: fullMeteringDigest(body) }), { mode: 0o600 });
}

test("formal drain keeps an unapproved, replaced, or external-writer pending", async (t) => {
  const directory = journal(t);
  const db = new Database(":memory:");
  const store = createSqliteSubscriptionControlStore({ database: db });
  t.after(() => db.close());
  installDurableBindings(store);
  const binding = boundEntry(db);
  await runProtocolRatingOperator(formalRequest(directory, db, "inspect"));
  await runProtocolRatingOperator(formalRequest(directory, db, "migrate"));
  const sample = makeFullMeteringSample({
    binding, activationId: "test-activation", generation: "b".repeat(64),
    delta: { uploadBytes: 1, downloadBytes: 0, totalBytes: 1, intervalStartedAt: "2026-10-01T00:00:00.000Z", intervalEndedAt: "2026-10-01T00:01:00.000Z" }
  });
  const previous = readFullMeteringJournal({ directory, context });
  const payload = { previousDigest: fullMeteringDigest(previous), nextCheckpoint: { sequence: 1, channels: ["edge_formal_1"] }, samples: [sample] };
  writeLegacyPending(directory, payload);
  const before = readFileSync(join(directory, "pending.json"));
  await assert.rejects(runProtocolRatingOperator(formalRequest(directory, db, "drain", {
    legacyPayloadDigest: "c".repeat(64)
  })), /full_metering_legacy_unadmitted/);
  assert.equal(readFileSync(join(directory, "pending.json")).equals(before), true);
  assert.equal(existsSync(join(directory, "pre-rating-switch.json")), false);
  assert.equal(store.listUsageSamples().length, 0);
  const write = createFullMeteringSampleWriter({ database: db, controlStore: store, readBindings: () => ({ entries: [binding] }) });
  await assert.rejects(runProtocolRatingLifecycle({
    db, directory, context, now: NOW, action: "drain", formal: true, expectedCheckpointDigest: fullMeteringDigest(previous),
    applySamples: write, legacyPayloadDigest: fullMeteringDigest(payload)
  }), /rating_operator_rejected/);
  assert.equal(store.listUsageSamples().length, 0);
  admitPreRatingSwitchPending({ directory, context });
  const replaced = { ...payload, samples: [{ ...sample, record: { ...sample.record, uploadBytes: 2 } }] };
  writeLegacyPending(directory, replaced);
  await assert.rejects(runProtocolRatingOperator(formalRequest(directory, db, "drain", {
    legacyPayloadDigest: fullMeteringDigest(replaced)
  })), /full_metering_legacy_unadmitted/);
  assert.equal(existsSync(join(directory, "pending.json")), true);
  assert.equal(existsSync(join(directory, "pre-rating-switch.json")), true);
  assert.equal(store.listUsageSamples().length, 0);
  assert.equal(charges(db).length, 0);
});

test("formal drain finishes a version-2 batch once and does not admit a null decision", async (t) => {
  const directory = journal(t);
  const db = new Database(":memory:");
  const store = createSqliteSubscriptionControlStore({ database: db });
  t.after(() => db.close());
  installDurableBindings(store);
  const binding = boundEntry(db);
  await runProtocolRatingOperator(formalRequest(directory, db, "inspect"));
  await runProtocolRatingOperator(formalRequest(directory, db, "migrate"));
  publishProtocolRatingPolicy(db, { vless: "1.5", hy2: "1.0", tuic: "1.0", now: NOW, expectedRevision: protocolRatingRevision(db) });
  activatePendingProtocolRatingPolicy(db, { now: NOW });
  const cycle = cycleFor("yearly", BINDING_FROM, BINDING_UNTIL, "2026-10-01T00:01:00.000Z");
  recordProtocolRatingBaseline(db, {
    accountId: binding.accountId, entitlementId: binding.entitlementId, requestId: binding.requestId, ...cycle,
    boundaryObservedAt: BINDING_FROM, observation: "measured_zero", now: NOW
  });
  const write = createFullMeteringSampleWriter({
    database: db, controlStore: store,
    readBindings: () => ({ entries: [binding] })
  });
  const sample = makeFullMeteringSample({
    binding, activationId: "test-activation", generation: "d".repeat(64),
    delta: { uploadBytes: 1, downloadBytes: 0, totalBytes: 1, intervalStartedAt: "2026-10-01T00:00:00.000Z", intervalEndedAt: "2026-10-01T00:01:00.000Z" }
  });
  const previous = readFullMeteringJournal({ directory, context });
  assert.throws(() => commitFullMeteringJournal({
    directory, context, previousCheckpoint: previous,
    nextCheckpoint: { sequence: previous.sequence + 1, channels: ["edge_formal_1"] },
    samples: [sample], applySamples: write, freezeRating: () => freezeProtocolRatingDecisions(db, [sample]),
    onStage: (stage) => { if (stage === "samples_committed") throw new Error("stop_before_checkpoint"); }
  }), /stop_before_checkpoint/);
  const checkpoint = fullMeteringDigest(previous);
  await assert.rejects(runProtocolRatingOperator(formalRequest(directory, db, "drain", {
    legacyPayloadDigest: "e".repeat(64), expectedCheckpointDigest: checkpoint
  })), /rating_operator_rejected/);
  assert.equal(existsSync(join(directory, "pending.json")), true);
  const drained = await runProtocolRatingOperator(formalRequest(directory, db, "drain", { expectedCheckpointDigest: checkpoint }));
  assert.equal(drained.ok, true);
  assert.equal(drained.counts.charges, 1);
  assert.equal(charges(db)[0].multiplier_units, 15000);
  assert.equal(charges(db)[0].carry_out, 5000);
  assert.equal(store.listUsageSamples().length, 1);
  assert.equal(existsSync(join(directory, "pending.json")), false);
  assert.equal(existsSync(join(directory, "pre-rating-switch.json")), false);
  const again = await runProtocolRatingOperator(formalRequest(directory, db, "drain", {
    expectedCheckpointDigest: drained.digests.checkpoint
  }));
  assert.equal(again.counts.charges, 1);
  assert.equal(db.prepare("select remainder from platform_protocol_rating_carry").get().remainder, 5000);
  const undecided = journal(t);
  const quiet = makeFullMeteringSample({
    binding, activationId: "test-activation", generation: "f".repeat(64),
    delta: { uploadBytes: 1, downloadBytes: 0, totalBytes: 1, intervalStartedAt: "2026-10-01T00:01:00.000Z", intervalEndedAt: "2026-10-01T00:02:00.000Z" }
  });
  await runProtocolRatingOperator(formalRequest(undecided, db, "inspect"));
  await runProtocolRatingOperator(formalRequest(undecided, db, "migrate"));
  const quietPrevious = readFullMeteringJournal({ directory: undecided, context });
  assert.throws(() => commitFullMeteringJournal({
    directory: undecided, context, previousCheckpoint: quietPrevious,
    nextCheckpoint: { sequence: quietPrevious.sequence + 1, channels: ["edge_formal_1"] },
    samples: [quiet], applySamples: write
  }), /rating_decision_required/);
  await assert.rejects(runProtocolRatingOperator(formalRequest(undecided, db, "drain")), /rating_decision_required/);
  assert.equal(existsSync(join(undecided, "pending.json")), true);
  assert.equal(existsSync(join(undecided, "pre-rating-switch.json")), false);
  assert.equal(store.listUsageSamples().length, 1);
  assert.equal(charges(db).length, 1);
});

test("the formal command recovers an approved old pending and prints no sample body", async (t) => {
  const parent = mkdtempSync(join(tmpdir(), "rating-formal-drain-"));
  const directory = join(parent, "journal");
  const dbPath = join(parent, "control.sqlite");
  const db = new Database(dbPath);
  initializeFullMeteringJournal({ directory, context, checkpoint: { sequence: 0, channels: [] } });
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const store = createSqliteSubscriptionControlStore({ database: db });
  installDurableBindings(store);
  const binding = boundEntry(db);
  await runProtocolRatingOperator(formalRequest(directory, db, "inspect"));
  await runProtocolRatingOperator(formalRequest(directory, db, "migrate"));
  const sample = makeFullMeteringSample({
    binding, activationId: "test-activation", generation: "9".repeat(64),
    delta: { uploadBytes: 4, downloadBytes: 0, totalBytes: 4, intervalStartedAt: "2026-10-01T00:00:00.000Z", intervalEndedAt: "2026-10-01T00:01:00.000Z" }
  });
  const previous = readFullMeteringJournal({ directory, context });
  const payload = { previousDigest: fullMeteringDigest(previous), nextCheckpoint: { sequence: 1, channels: ["edge_formal_1"] }, samples: [sample] };
  writeLegacyPending(directory, payload);
  const digest = fullMeteringDigest(payload);
  db.close();
  const args = [
    "scripts/protocol-traffic-rating-operator.mjs",
    "--action", "drain", "--db", dbPath, "--journal", directory,
    "--scope-digest", context.scopeDigest, "--database-identity", context.databaseIdentityDigest,
    "--now", NOW, "--expected-checkpoint", fullMeteringDigest(previous),
    "--legacy-payload-digest", digest
  ];
  const run = spawnSync(process.execPath, args, { cwd: root, encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  const receipt = JSON.parse(run.stdout);
  assert.equal(receipt.ok, true);
  assert.equal(receipt.action, "drain");
  assert.equal(receipt.counts.charges, 0);
  assert.equal(run.stdout.includes("edge_formal_1"), false);
  assert.equal(run.stdout.includes(dbPath), false);
  const opened = new Database(dbPath, { readonly: true });
  assert.equal(opened.prepare("select count(*) as count from platform_usage_samples").get().count, 1);
  assert.equal(opened.prepare("select total_bytes from platform_usage_samples").get().total_bytes, 4);
  assert.equal(opened.prepare("select count(*) as count from platform_protocol_rating_charges").get().count, 0);
  opened.close();
  assert.equal(existsSync(join(directory, "pending.json")), false);
  const refused = spawnSync(process.execPath, [
    "scripts/protocol-traffic-rating-operator.mjs", "--action", "inspect", "--legacy-payload-digest", digest
  ], { cwd: root, encoding: "utf8" });
  assert.equal(refused.status, 2);
  assert.equal(JSON.parse(refused.stdout).error, "rating_operator_rejected");
});

function identityRequest(directory, dbPath, action) {
  return {
    action, directory, dbPath, context, now: NOW,
    expectedCheckpointDigest: fullMeteringDigest(readFullMeteringJournal({ directory, context }))
  };
}

function assertNoIdentityLeak(body, paths) {
  assert.equal(body.includes("\"ino\""), false);
  assert.equal(body.includes("\"dev\""), false);
  assert.equal(body.includes("\"uid\""), false);
  assert.equal(body.includes("\"gid\""), false);
  assert.equal(body.includes("\"nlink\""), false);
  assert.equal(body.includes("\"realpath\""), false);
  for (const path of paths) assert.equal(body.includes(path), false);
}

test("same bytes are a different file, and ordinary growth keeps the opened file", (t) => {
  const parent = mkdtempSync(join(tmpdir(), "rating-file-identity-"));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const dbPath = join(parent, "control.sqlite");
  const created = new Database(dbPath);
  created.exec("create table growth (id integer primary key)");
  created.prepare("insert into growth (id) values (1)").run();
  const before = operatorTargetSubject(dbPath, false);
  const beforeStat = lstatSync(dbPath);
  created.prepare("insert into growth (id) values (2)").run();
  created.close();
  const grown = operatorTargetSubject(dbPath, false);
  const grownStat = lstatSync(dbPath);
  assert.equal(operatorTargetsMatch(before, grown), true);
  assert.equal(before.ino, grown.ino);
  assert.ok(grownStat.mtimeMs !== beforeStat.mtimeMs || grownStat.size !== beforeStat.size);
  const copyPath = join(parent, "copy.sqlite");
  copyFileSync(dbPath, copyPath);
  const copy = operatorTargetSubject(copyPath, false);
  assert.equal(readFileSync(dbPath).equals(readFileSync(copyPath)), true);
  assert.notEqual(copy.ino, grown.ino);
  assert.equal(operatorTargetsMatch(grown, copy), false);
  rmSync(dbPath);
  renameSync(copyPath, dbPath);
  const replaced = operatorTargetSubject(dbPath, false);
  assert.equal(replaced.realpath, grown.realpath);
  assert.notEqual(replaced.ino, grown.ino);
  assert.equal(operatorTargetsMatch(grown, replaced), false);
  assert.equal(operatorTargetsMatch(grown, { ...grown, mode: grown.mode ^ 0o777 }), false);
  assert.equal(operatorTargetsMatch(grown, { ...grown, uid: grown.uid + 1 }), false);
  assert.equal(operatorTargetsMatch(grown, { ...grown, gid: grown.gid + 1 }), false);
  let chmodChanged = false;
  try {
    chmodSync(dbPath, 0o600);
    const chmodded = operatorTargetSubject(dbPath, false);
    chmodChanged = chmodded.mode !== replaced.mode || chmodded.uid !== replaced.uid || chmodded.gid !== replaced.gid;
    assert.equal(operatorTargetsMatch(replaced, chmodded), !chmodChanged);
  } catch (error) {
    assert.equal(chmodChanged, false);
    assert.ok(error.code === "EPERM" || error.code === "EACCES" || error.code === "ENOTSUP");
  }
  const held = new Database(dbPath);
  const heldSubject = operatorTargetSubject(dbPath, false);
  const intruder = join(parent, "intruder.sqlite");
  copyFileSync(dbPath, intruder);
  let swapCode = null;
  try { renameSync(intruder, dbPath); } catch (error) { swapCode = error.code; }
  if (swapCode == null) {
    assert.equal(operatorTargetsMatch(heldSubject, operatorTargetSubject(dbPath, false)), false);
  } else {
    assert.ok(swapCode === "EPERM" || swapCode === "EBUSY" || swapCode === "EACCES");
    assert.equal(operatorTargetsMatch(heldSubject, operatorTargetSubject(dbPath, false)), true);
  }
  held.close();
  const current = new Database(dbPath, { readonly: true });
  assert.equal(current.prepare("select count(*) as count from sqlite_master where name like 'platform_protocol_rating_%'").get().count, 0);
  current.close();
});

test("a memory database still binds only the journal directory", async (t) => {
  const directory = journal(t);
  const db = new Database(":memory:");
  t.after(() => db.close());
  const before = operatorTargetSubject(directory, true);
  const receipt = await runProtocolRatingOperator(formalRequest(directory, db, "inspect"));
  assert.equal(receipt.ok, true);
  assert.equal(operatorTargetsMatch(before, operatorTargetSubject(directory, true)), true);
  assert.equal(existsSync(join(directory, "rating-lifecycle.json")), true);
  assertNoIdentityLeak(JSON.stringify(receipt), [directory]);
});

test("inspect and migrate keep a grown database and journal on the opened identity", async (t) => {
  const parent = mkdtempSync(join(tmpdir(), "rating-file-growth-"));
  const directory = join(parent, "journal");
  const dbPath = join(parent, "control.sqlite");
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  new Database(dbPath).close();
  initializeFullMeteringJournal({ directory, context, checkpoint: { sequence: 0, channels: [] } });
  const dbSubject = operatorTargetSubject(dbPath, false);
  const directorySubject = operatorTargetSubject(directory, true);
  const inspected = await runProtocolRatingOperator(identityRequest(directory, dbPath, "inspect"));
  assert.equal(inspected.ok, true);
  assert.equal(operatorTargetsMatch(dbSubject, operatorTargetSubject(dbPath, false)), true);
  assert.equal(operatorTargetsMatch(directorySubject, operatorTargetSubject(directory, true)), true);
  writeFileSync(join(directory, "extra.txt"), "growth");
  assert.equal(operatorTargetsMatch(directorySubject, operatorTargetSubject(directory, true)), true);
  const checkpointPath = join(directory, "checkpoint.json");
  const checkpointNext = join(directory, "checkpoint-next.json");
  copyFileSync(checkpointPath, checkpointNext);
  rmSync(checkpointPath);
  renameSync(checkpointNext, checkpointPath);
  assert.equal(operatorTargetsMatch(directorySubject, operatorTargetSubject(directory, true)), true);
  assert.equal(operatorTargetsMatch(dbSubject, operatorTargetSubject(dbPath, false)), true);
  const migrated = await runProtocolRatingOperator(identityRequest(directory, dbPath, "migrate"));
  assert.equal(migrated.ok, true);
  assert.equal(migrated.stages.includes("migrate"), true);
  assert.equal(operatorTargetsMatch(dbSubject, operatorTargetSubject(dbPath, false)), true);
  assert.equal(operatorTargetsMatch(directorySubject, operatorTargetSubject(directory, true)), true);
  assertNoIdentityLeak(JSON.stringify(migrated), [dbPath, directory]);
  const checkpoint = fullMeteringDigest(readFullMeteringJournal({ directory, context }));
  const cli = spawnSync(process.execPath, [
    "scripts/protocol-traffic-rating-operator.mjs",
    "--action", "inspect", "--db", dbPath, "--journal", directory,
    "--scope-digest", context.scopeDigest, "--database-identity", context.databaseIdentityDigest,
    "--now", NOW, "--expected-checkpoint", checkpoint
  ], { cwd: root, encoding: "utf8" });
  assert.equal(cli.status, 0, cli.stderr);
  assert.equal(JSON.parse(cli.stdout).ok, true);
  assertNoIdentityLeak(cli.stdout, [dbPath, directory]);
  const opened = new Database(dbPath, { readonly: true });
  assert.equal(opened.prepare("select count(*) as count from platform_protocol_rating_migrations").get().count, 1);
  opened.close();
});

test("a replaced journal directory is unverified before a write", async (t) => {
  const parent = mkdtempSync(join(tmpdir(), "rating-file-drift-"));
  const directory = join(parent, "journal");
  const dbPath = join(parent, "control.sqlite");
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  new Database(dbPath).close();
  initializeFullMeteringJournal({ directory, context, checkpoint: { sequence: 0, channels: [] } });
  const early = runProtocolRatingOperator(identityRequest(directory, dbPath, "migrate"));
  const movedEarly = join(parent, "journal-before");
  renameSync(directory, movedEarly);
  mkdirSync(directory);
  await assert.rejects(early, (error) => {
    assert.equal(error.code, "rating_target_unverified");
    assert.equal(error.message.includes(directory), false);
    assert.equal(error.message.includes(dbPath), false);
    return true;
  });
  assert.equal(existsSync(join(directory, "rating-lifecycle.json")), false);
  assert.equal(existsSync(join(movedEarly, "rating-lifecycle.json")), false);
  const untouched = new Database(dbPath, { readonly: true });
  assert.equal(untouched.prepare("select count(*) as count from sqlite_master where name like 'platform_protocol_rating_%'").get().count, 0);
  untouched.close();
  rmSync(directory, { recursive: true, force: true });
  renameSync(movedEarly, directory);
  const migrated = await runProtocolRatingOperator(identityRequest(directory, dbPath, "inspect"));
  assert.equal(migrated.ok, true);
  const saved = new Database(dbPath, { readonly: true });
  assert.equal(saved.prepare("select count(*) as count from sqlite_master where name like 'platform_protocol_rating_%'").get().count, 0);
  saved.close();
});

function otherFile(subject) {
  return { ...subject, ino: subject.ino === 0 ? 1 : 0 };
}

test("an opened handle that is not the path is unverified before any rating write", async (t) => {
  const parent = mkdtempSync(join(tmpdir(), "rating-opened-before-"));
  const directory = join(parent, "journal");
  const dbPath = join(parent, "control.sqlite");
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const created = new Database(dbPath);
  created.close();
  initializeFullMeteringJournal({ directory, context, checkpoint: { sequence: 0, channels: [] } });
  const subject = operatorTargetSubject(dbPath, false);
  const probeDb = new Database(dbPath);
  const probed = probeSqliteOpenedFile(probeDb);
  probeDb.close();
  assert.equal(probed.proven, false);
  assert.equal(probed.reason, "driver_handle_unexposed");
  assert.deepEqual([...probed.rejected], [...OPENED_FILE_PROOFS_REJECTED]);
  for (const changed of [otherFile(subject), { ...subject, mode: subject.mode ^ 0o777 }, { ...subject, uid: subject.uid + 1 }]) {
    await assert.rejects(runProtocolRatingOperator(identityRequest(directory, dbPath, "inspect"), {
      readOpenedFile: () => ({ proven: true, subject: changed })
    }), (error) => error.code === "rating_target_unverified" && !error.message.includes(dbPath));
  }
  await assert.rejects(runProtocolRatingOperator(identityRequest(directory, dbPath, "inspect"), {
    readOpenedFile: () => ({ proven: true, subject }), sql: "select 1"
  }), (error) => error.code === "rating_operator_rejected");
  assert.equal(existsSync(join(directory, "rating-lifecycle.json")), false);
  const untouched = new Database(dbPath, { readonly: true });
  assert.equal(untouched.prepare("select count(*) as count from sqlite_master where name like 'platform_protocol_rating_%'").get().count, 0);
  untouched.close();
});

test("a handle or journal replaced while waiting for the writer lock writes nothing", async (t) => {
  const parent = mkdtempSync(join(tmpdir(), "rating-opened-wait-"));
  const directory = join(parent, "journal");
  const dbPath = join(parent, "control.sqlite");
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  new Database(dbPath).close();
  initializeFullMeteringJournal({ directory, context, checkpoint: { sequence: 0, channels: [] } });
  const subject = operatorTargetSubject(dbPath, false);
  let drift = false;
  mkdirSync(join(directory, "writer.lock"));
  const waiting = runProtocolRatingOperator(identityRequest(directory, dbPath, "inspect"), {
    readOpenedFile: () => ({ proven: true, subject: drift ? otherFile(subject) : subject })
  });
  // Two turns pass the open checks. The third is the held writer lock.
  await Promise.resolve();
  await Promise.resolve();
  drift = true;
  rmSync(join(directory, "writer.lock"), { recursive: true, force: true });
  await assert.rejects(waiting, (error) => error.code === "rating_target_unverified" && !error.message.includes(directory));
  assert.equal(existsSync(join(directory, "rating-lifecycle.json")), false);
  const handleDb = new Database(dbPath, { readonly: true });
  assert.equal(handleDb.prepare("select count(*) as count from sqlite_master where name like 'platform_protocol_rating_%'").get().count, 0);
  handleDb.close();

  mkdirSync(join(directory, "writer.lock"));
  const journalWait = runProtocolRatingOperator(identityRequest(directory, dbPath, "migrate"));
  await Promise.resolve();
  await Promise.resolve();
  const moved = join(parent, "journal-moved");
  let movedJournal = false;
  let moveCode = null;
  try {
    renameSync(directory, moved);
    mkdirSync(directory);
    movedJournal = true;
  } catch (error) {
    moveCode = error.code;
  }
  if (!movedJournal) {
    rmSync(join(directory, "writer.lock"), { recursive: true, force: true });
    await journalWait.catch(() => {});
    assert.fail(`journal rename while waiting was not proven: ${moveCode}`);
  }
  await assert.rejects(journalWait, (error) => error.code === "rating_target_unverified");
  assert.equal(existsSync(join(directory, "rating-lifecycle.json")), false);
  assert.equal(existsSync(join(moved, "rating-lifecycle.json")), false);
  const waited = new Database(dbPath, { readonly: true });
  assert.equal(waited.prepare("select count(*) as count from sqlite_master where name like 'platform_protocol_rating_%'").get().count, 0);
  waited.close();
});

test("a committed migrate stays when the opened identity drifts before the receipt", async (t) => {
  const parent = mkdtempSync(join(tmpdir(), "rating-opened-after-"));
  const directory = join(parent, "journal");
  const dbPath = join(parent, "control.sqlite");
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  new Database(dbPath).close();
  initializeFullMeteringJournal({ directory, context, checkpoint: { sequence: 0, channels: [] } });
  const subject = operatorTargetSubject(dbPath, false);
  let drift = false;
  const controls = { readOpenedFile: () => ({ proven: true, subject: drift ? otherFile(subject) : subject }) };
  const inspected = await runProtocolRatingOperator(identityRequest(directory, dbPath, "inspect"), controls);
  assert.equal(inspected.ok, true);
  const running = runProtocolRatingOperator(identityRequest(directory, dbPath, "migrate"), controls);
  await Promise.resolve();
  await Promise.resolve();
  drift = true;
  const receipt = await running;
  assert.equal(receipt.ok, false);
  assert.equal(receipt.error, "rating_target_unverified");
  assert.equal(receipt.stages.includes("migrate"), true);
  assert.equal(receipt.counts.policies, 0);
  assertNoIdentityLeak(JSON.stringify(receipt), [dbPath, directory]);
  assert.equal(existsSync(join(directory, "rating-lifecycle.json")), true);
  const saved = new Database(dbPath, { readonly: true });
  assert.equal(saved.prepare("select count(*) as count from platform_protocol_rating_migrations").get().count, 1);
  saved.close();
  const kept = join(parent, "journal-kept");
  renameSync(directory, kept);
  mkdirSync(directory);
  assert.equal(existsSync(join(kept, "rating-lifecycle.json")), true);
  assert.equal(existsSync(join(directory, "rating-lifecycle.json")), false);
});

test("a relative path, a missing file, and a symlink print no path", (t) => {
  const parent = mkdtempSync(join(tmpdir(), "rating-file-refuse-"));
  const directory = join(parent, "journal");
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  initializeFullMeteringJournal({ directory, context, checkpoint: { sequence: 0, channels: [] } });
  const checkpoint = fullMeteringDigest(readFullMeteringJournal({ directory, context }));
  const args = (dbPath) => [
    "scripts/protocol-traffic-rating-operator.mjs",
    "--action", "inspect", "--db", dbPath, "--journal", directory,
    "--scope-digest", context.scopeDigest, "--database-identity", context.databaseIdentityDigest,
    "--now", NOW, "--expected-checkpoint", checkpoint
  ];
  const relative = spawnSync(process.execPath, args("relative.sqlite"), { cwd: root, encoding: "utf8" });
  assert.equal(relative.status, 2);
  assert.equal(JSON.parse(relative.stdout).error, "rating_operator_rejected");
  assertNoIdentityLeak(relative.stdout, ["relative.sqlite", directory]);
  const missing = join(parent, "missing.sqlite");
  const absent = spawnSync(process.execPath, args(missing), { cwd: root, encoding: "utf8" });
  assert.equal(absent.status, 2);
  assert.equal(JSON.parse(absent.stdout).error, "rating_operator_rejected");
  assert.equal(existsSync(missing), false);
  assertNoIdentityLeak(absent.stdout, [missing, directory]);
  const file = join(parent, "regular.sqlite");
  new Database(file).close();
  const link = join(parent, "linked.sqlite");
  symlinkSync(file, link);
  const linked = spawnSync(process.execPath, args(link), { cwd: root, encoding: "utf8" });
  assert.equal(linked.status, 2);
  assert.equal(JSON.parse(linked.stdout).error, "rating_operator_rejected");
  assertNoIdentityLeak(linked.stdout, [link, file, directory]);
});
