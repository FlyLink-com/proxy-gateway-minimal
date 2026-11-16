import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import express from "express";
import { createFullMeteringSampleWriter, makeFullMeteringSample } from "../../scripts/lib/full-metering-sample-writer.mjs";
import {
  commitFullMeteringJournal, fullMeteringDigest, initializeFullMeteringJournal, readFullMeteringJournal
} from "../../scripts/lib/full-metering-journal.mjs";
import { readFullMeteringDataPackBindings } from "../../scripts/lib/full-metering-data-pack-bindings.mjs";
import { runProtocolRatingLifecycle } from "../../scripts/lib/protocol-traffic-rating-lifecycle.mjs";
import { runProtocolRatingOperator } from "../../scripts/lib/protocol-traffic-rating-operator.mjs";
import { readDataPackDesiredStateRows } from "../services/edge/data-pack-desired-state-rows.mjs";
import { createPortalAccessRequestService } from "../services/platform/portal-access-requests.mjs";
import { ensurePortalSubscriptionLinkResetSchema } from "../services/platform/portal-subscription-link-reset-store.mjs";
import {
  freezeProtocolRatingDecisions, publishProtocolRatingPolicy, protocolRatingRevision, readProtocolRatedUsage
} from "../services/platform/protocol-traffic-rating.mjs";
import { createSubscriptionCore } from "../services/subscriptions/core.mjs";
import { createSubscriptionRepository } from "../services/subscriptions/repository.mjs";
import { buildSubscriptionUsageMonitor } from "../services/platform/subscription-usage-monitor.mjs";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import { createTrafficAccountingService } from "../services/platform/traffic-accounting.mjs";
import { usageCycleForBinding } from "../services/platform/usage-billing-cycle.mjs";
import { subscriptionRoutes } from "../routes/subscription.mjs";
import { CHANNELS, packFixture } from "./full-metering-data-pack-bindings.fixture.mjs";

const NOW = "2026-09-08T00:02:00.000Z";
const FROM = "2026-09-01T00:00:00.000Z";
const UNTIL = "2026-12-01T00:00:00.000Z";
const SAMPLE_START = "2026-09-08T00:00:00.000Z";
const SAMPLE_END = "2026-09-08T00:01:00.000Z";
const context = { scopeDigest: "a".repeat(64), databaseIdentityDigest: "b".repeat(64) };
const CHANNEL = "channel-vultr-a-vless-reality-tcp";
const PLAN = "offerv_plan_30d_100gb_monthly_v1";

function hashRef(prefix, value) {
  return `${prefix}ref_${createHash("sha256").update(value).digest("hex").slice(0, 16)}`;
}

function cycleAt(at) {
  const cycle = usageCycleForBinding({ plan: PLAN, validFrom: FROM, validUntil: UNTIL }, at);
  return { cycleKey: cycle.startedAt, windowStartedAt: cycle.startedAt };
}

function finishPortal(t, { status, nextAction, event, edgeCredentialRef, trafficLimitBytes = 50 * 1024 ** 3 }) {
  const db = new Database(":memory:");
  const store = createSqliteSubscriptionControlStore({ database: db });
  const parent = mkdtempSync(join(tmpdir(), "rating-readers-"));
  const directory = join(parent, "journal");
  t.after(() => {
    db.close();
    rmSync(parent, { recursive: true, force: true });
  });
  const tenantId = "tenant_rated";
  const artifactId = "artifact_rated";
  store.createAccount({ id: "acct_rated", ownerRef: "acct_rated", status: "active", createdAt: FROM, updatedAt: FROM });
  store.createEntitlement({
    id: "ent_rated", accountId: "acct_rated", plan: PLAN, status: "active",
    validFrom: FROM, validUntil: UNTIL, trafficLimitBytes, createdAt: FROM, updatedAt: FROM
  });
  store.createIssuanceRequest({
    id: "req_rated", accountId: "acct_rated", entitlementId: "ent_rated", approvalRef: "approval_rated",
    status: "issued", quantity: 1, nodeId: CHANNEL, purpose: "subscription", requestedByRef: "acct_rated",
    createdAt: FROM, updatedAt: FROM
  });
  store.linkIssuedSubscription({
    id: "link_rated", requestId: "req_rated", tenantRef: hashRef("tenant", tenantId),
    artifactRef: hashRef("artifact", artifactId), createdAt: FROM, updatedAt: FROM
  });
  store.upsertPortalAccessRequest({
    id: "req_rated", portalUserRef: "acct_rated", plan: "monthly", clientTarget: "clash", durationDays: 30,
    status, nextAction, priorTrialState: "not_applicable", submittedAt: FROM, updatedAt: FROM,
    validUntil: UNTIL, expiresAt: UNTIL, entitlementRef: "ent_rated", tenantId, artifactId,
    edgeChannelRef: CHANNEL, edgeCredentialRef, event
  });
  initializeFullMeteringJournal({ directory, context, checkpoint: { sequence: 0, channels: [] } });
  const binding = {
    sourceRef: "full_metering_xray_cumulative_v1", channelRef: CHANNEL, edgeCredentialRef,
    materialDigest: "sha256:test", accountId: "acct_rated", entitlementId: "ent_rated", requestId: "req_rated",
    billingBinding: { plan: PLAN, validFrom: FROM, validUntil: UNTIL }
  };
  const write = createFullMeteringSampleWriter({ database: db, controlStore: store, readBindings: () => ({ entries: [binding] }) });
  return { db, store, directory, binding, write, tenantRef: hashRef("tenant", tenantId) };
}

async function listen(app) {
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return { server, url: `http://127.0.0.1:${address.port}` };
}

test("rated portal, monitor, and subscription userinfo use the charged split", async (t) => {
  const fixture = finishPortal(t, {
    status: "issued", nextAction: "none", event: null, edgeCredentialRef: "edge-rated-1"
  });
  const cycle = cycleAt(SAMPLE_END);
  await runProtocolRatingLifecycle({ db: fixture.db, directory: fixture.directory, context, now: FROM, action: "drain" });
  await runProtocolRatingLifecycle({
    db: fixture.db, directory: fixture.directory, context, now: FROM, action: "baseline",
    baselines: [{
      accountId: "acct_rated", entitlementId: "ent_rated", requestId: "req_rated", ...cycle,
      boundaryObservedAt: FROM, observation: "measured_zero"
    }]
  });
  publishProtocolRatingPolicy(fixture.db, { vless: "2.5", hy2: "1.0", tuic: "1.0", now: FROM, expectedRevision: protocolRatingRevision(fixture.db) });
  await runProtocolRatingLifecycle({ db: fixture.db, directory: fixture.directory, context, now: FROM, action: "activate" });
  const sample = makeFullMeteringSample({
    binding: fixture.binding, activationId: "test-activation", generation: "a".repeat(64),
    delta: { uploadBytes: 1, downloadBytes: 0, totalBytes: 1, intervalStartedAt: SAMPLE_START, intervalEndedAt: SAMPLE_END }
  });
  const previous = readFullMeteringJournal({ directory: fixture.directory, context });
  commitFullMeteringJournal({
    directory: fixture.directory, context, previousCheckpoint: previous,
    nextCheckpoint: { sequence: previous.sequence + 1, channels: [CHANNEL] },
    samples: [sample], applySamples: fixture.write, freezeRating: () => freezeProtocolRatingDecisions(fixture.db, [sample])
  });
  const portal = fixture.store.readLegacyPortalCurrentResource({ accountId: "acct_rated", now: NOW });
  assert.equal(portal.resource.usage.usedBytes, 2);
  assert.equal(fixture.store.listUsageSamples()[0].totalBytes, 1);
  const monitor = buildSubscriptionUsageMonitor({
    controlStore: fixture.store, filters: {}, now: new Date(NOW), usageCollectorConfigured: true
  });
  const row = monitor.items.find((item) => item.issuanceRequestId === "req_rated");
  assert.equal(row.rawUsedBytes, 1);
  assert.equal(row.chargedUsedBytes, 2);
  assert.equal(row.usedBytes, 2);
  const before = fixture.store.listUsageSamples().length;
  const accounting = createTrafficAccountingService({ controlStore: fixture.store, nowFn: () => new Date(NOW) });
  assert.throws(() => accounting.recordUsageObservation({
    sourceRef: "full_metering_xray_cumulative_v1", channelRef: CHANNEL, edgeCredentialRef: "edge-rated-1",
    observedAt: "2026-09-08T00:03:00.000Z", intervalStartedAt: SAMPLE_END, intervalEndedAt: "2026-09-08T00:03:00.000Z",
    uploadBytes: 1, downloadBytes: 0
  }), /rating_decision_required/);
  assert.equal(fixture.store.listUsageSamples().length, before);
  const app = express();
  app.use(subscriptionRoutes({
    platform: { controlStore: fixture.store, usageNowFn: () => new Date(NOW) },
    subscriptions: { core: { resolveSubscriptionToken: async () => ({ ok: true, tenant: { id: fixture.tenantRef, status: "active", expiresAt: UNTIL }, proxyConfig: { servers: [] } }) } }
  }));
  const server = await listen(app);
  t.after(() => server.server.close());
  const response = await fetch(`${server.url}/sub/clash.yaml?token=synthetic`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("subscription-userinfo"), `upload=2; download=0; total=${50 * 1024 ** 3}; expire=${Math.floor(Date.parse(UNTIL) / 1000)}`);
  fixture.db.prepare("delete from platform_protocol_rating_charges").run();
  assert.throws(() => fixture.store.readLegacyPortalCurrentResource({ accountId: "acct_rated", now: NOW }), /rating_charge_missing/);
  assert.throws(() => buildSubscriptionUsageMonitor({
    controlStore: fixture.store, filters: {}, now: new Date(NOW), usageCollectorConfigured: true
  }), /rating_charge_missing/);
  const broken = await fetch(`${server.url}/sub/clash.yaml?token=synthetic`);
  assert.equal(broken.status, 503);
  assert.equal(broken.headers.get("subscription-userinfo"), null);
  assert.equal((await broken.json()).error, "usage_observation_required");
  assert.equal(fixture.store.listUsageSamples()[0].totalBytes, 1);
});

test("unobserved usage stays unknown for portal, monitor, resume, and subscription userinfo", async (t) => {
  const fixture = finishPortal(t, {
    status: "issued", nextAction: "none", event: null, edgeCredentialRef: "edge-rated-1"
  });
  const first = cycleAt(SAMPLE_END);
  const next = cycleAt("2026-10-20T00:00:00.000Z");
  await runProtocolRatingLifecycle({ db: fixture.db, directory: fixture.directory, context, now: FROM, action: "drain" });
  await runProtocolRatingLifecycle({
    db: fixture.db, directory: fixture.directory, context, now: FROM, action: "baseline",
    baselines: [
      { accountId: "acct_rated", entitlementId: "ent_rated", requestId: "req_rated", ...first, boundaryObservedAt: FROM, observation: "unobserved" },
      { accountId: "acct_rated", entitlementId: "ent_rated", requestId: "req_rated", ...next, boundaryObservedAt: next.windowStartedAt, observation: "unobserved" }
    ]
  });
  const portal = fixture.store.readLegacyPortalCurrentResource({ accountId: "acct_rated", now: NOW });
  assert.equal(portal.resource.usage.usedBytes, null);
  assert.equal(portal.resource.usage.collectionStatus, "pending");
  const monitor = buildSubscriptionUsageMonitor({ controlStore: fixture.store, now: new Date(NOW) });
  const row = monitor.items.find((item) => item.issuanceRequestId === "req_rated");
  assert.equal(row.usedBytes, null);
  assert.equal(row.chargedUsedBytes, null);
  fixture.store.upsertPortalAccessRequest({
    id: "req_rated", portalUserRef: "acct_rated", plan: "monthly", clientTarget: "clash", durationDays: 30,
    status: "disabled", nextAction: "traffic_supply_suspended_quota", priorTrialState: "not_applicable",
    submittedAt: FROM, updatedAt: "2026-09-15T00:00:00.000Z", validUntil: UNTIL, expiresAt: UNTIL,
    entitlementRef: "ent_rated", tenantId: "tenant_rated", artifactId: "artifact_rated",
    edgeChannelRef: CHANNEL, edgeCredentialRef: "edge-rated-1",
    event: { type: "traffic_supply_suspended", previousStatus: "issued", occurredAt: "2026-09-15T00:00:00.000Z" }
  });
  const portalService = createPortalAccessRequestService({ controlStore: fixture.store, nowFn: () => new Date("2026-10-20T00:00:00.000Z") });
  const resume = portalService.resumeTrafficSupply({ requestRef: "req_rated", portalUserRef: "acct_rated" });
  assert.equal(resume.mutation, false);
  assert.equal(resume.blockers[0].code, "quota_observation_required");
  const app = express();
  app.use(subscriptionRoutes({
    platform: { controlStore: fixture.store, usageNowFn: () => new Date(NOW) },
    subscriptions: { core: { resolveSubscriptionToken: async () => ({ ok: true, tenant: { id: fixture.tenantRef, status: "active", expiresAt: UNTIL }, proxyConfig: { servers: [] } }) } }
  }));
  const server = await listen(app);
  t.after(() => server.server.close());
  const response = await fetch(`${server.url}/sub/clash.yaml?token=synthetic`);
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("subscription-userinfo"), null);
  assert.equal((await response.json()).error, "usage_observation_required");
});

test("a data pack reports charged bytes and keeps an unobserved pack out of the active set", async (t) => {
  const packs = packFixture(t, [CHANNELS[0]]);
  const issued = packs.pack({ channel: CHANNELS[0] });
  const parent = mkdtempSync(join(tmpdir(), "rating-pack-"));
  const directory = join(parent, "journal");
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  initializeFullMeteringJournal({ directory, context, checkpoint: { sequence: 0, channels: [] } });
  const entry = packs.read("2026-09-30T00:00:00.000Z").entries.find((item) => item.edgeCredentialRef === issued.edgeCredentialRef);
  const cycle = usageCycleForBinding(entry.billingBinding, "2026-09-30T00:01:00.000Z");
  await runProtocolRatingLifecycle({ db: packs.db, directory, context, now: "2026-09-29T00:00:00.000Z", action: "drain" });
  await runProtocolRatingLifecycle({
    db: packs.db, directory, context, now: "2026-09-29T00:00:00.000Z", action: "baseline",
    baselines: [{
      accountId: entry.accountId, entitlementId: entry.entitlementId, requestId: entry.requestId,
      cycleKey: "lifetime", windowStartedAt: cycle.startedAt, boundaryObservedAt: cycle.startedAt, observation: "measured_zero"
    }]
  });
  publishProtocolRatingPolicy(packs.db, { vless: "2.5", hy2: "1.0", tuic: "1.0", now: "2026-09-29T00:00:00.000Z", expectedRevision: protocolRatingRevision(packs.db) });
  await runProtocolRatingLifecycle({ db: packs.db, directory, context, now: "2026-09-29T00:00:00.000Z", action: "activate" });
  const write = createFullMeteringSampleWriter({ database: packs.db, controlStore: packs.control, readBindings: () => packs.read("2026-09-30T00:01:00.000Z") });
  const sample = makeFullMeteringSample({
    binding: entry, activationId: "test-activation", generation: "b".repeat(64),
    delta: { uploadBytes: 1, downloadBytes: 0, totalBytes: 1, intervalStartedAt: "2026-09-30T00:00:00.000Z", intervalEndedAt: "2026-09-30T00:01:00.000Z" }
  });
  const previous = readFullMeteringJournal({ directory, context });
  commitFullMeteringJournal({
    directory, context, previousCheckpoint: previous,
    nextCheckpoint: { sequence: previous.sequence + 1, channels: [CHANNELS[0]] },
    samples: [sample], applySamples: write, freezeRating: () => freezeProtocolRatingDecisions(packs.db, [sample])
  });
  const usage = packs.control.readDataPackResourceUsage({
    accountId: issued.accountId, orderRef: issued.orderRef, requestRef: issued.requestId,
    entitlementRef: issued.entitlementId, now: "2026-09-30T00:02:00.000Z"
  });
  assert.equal(usage.usage.usedBytes, 2);
  assert.equal(packs.db.prepare("select total_bytes from platform_usage_samples where request_id = ?").get(issued.requestId).total_bytes, 1);
  const desired = readDataPackDesiredStateRows(packs.db, CHANNELS[0], Date.parse("2026-09-30T00:02:00.000Z"));
  assert.equal(desired.activeRows.some((row) => row.edge_credential_ref === issued.edgeCredentialRef), true);
  packs.db.defaultSafeIntegers(true);
  const bindings = packs.db.transaction(() => readFullMeteringDataPackBindings({
    db: packs.db, channels: [CHANNELS[0]], nowMs: Date.parse("2026-09-30T00:02:00.000Z"),
    sources: { [CHANNELS[0]]: "full_metering_xray_cumulative_v1" }
  }))();
  packs.db.defaultSafeIntegers(false);
  assert.equal(bindings.entries.some((item) => item.edgeCredentialRef === issued.edgeCredentialRef), true);
  assert.equal(bindings.retainedBindings.some((item) => item.reasons?.includes("quota_exhausted")), false);
  packs.db.prepare("delete from platform_protocol_rating_charges").run();
  assert.throws(() => packs.control.readDataPackResourceUsage({
    accountId: issued.accountId, orderRef: issued.orderRef, requestRef: issued.requestId,
    entitlementRef: issued.entitlementId, now: "2026-09-30T00:02:00.000Z"
  }), /rating_charge_missing/);
  assert.throws(() => readDataPackDesiredStateRows(packs.db, CHANNELS[0], Date.parse("2026-09-30T00:02:00.000Z")), /rating_charge_missing/);
  packs.db.defaultSafeIntegers(true);
  try {
    assert.throws(() => packs.db.transaction(() => readFullMeteringDataPackBindings({
      db: packs.db, channels: [CHANNELS[0]], nowMs: Date.parse("2026-09-30T00:02:00.000Z"),
      sources: { [CHANNELS[0]]: "full_metering_xray_cumulative_v1" }
    }))(), /rating_charge_missing/);
  } finally {
    packs.db.defaultSafeIntegers(false);
  }
  assert.equal(packs.db.prepare("select total_bytes from platform_usage_samples where request_id = ?").get(issued.requestId).total_bytes, 1);
});

function observationSampleId(record) {
  const digest = createHash("sha256")
    .update(record.sourceRef).update("\0")
    .update(record.channelRef).update("\0")
    .update(record.edgeCredentialRef).update("\0")
    .update(record.observedAt).update("\0")
    .update(record.intervalStartedAt).update("\0")
    .update(record.intervalEndedAt).update("\0")
    .update(String(record.uploadBytes)).update("\0")
    .update(String(record.downloadBytes))
    .digest("hex");
  return `usage_${digest.slice(0, 24)}`;
}

test("a caller-supplied frozen decision allows quota, replays once, then rejects exhaustion", async (t) => {
  const edgeCredentialRef = "edge-rated-quota";
  const fixture = finishPortal(t, {
    status: "issued", nextAction: "none", event: null, edgeCredentialRef, trafficLimitBytes: 10
  });
  const cycle = cycleAt(SAMPLE_END);
  await runProtocolRatingLifecycle({ db: fixture.db, directory: fixture.directory, context, now: FROM, action: "drain" });
  await runProtocolRatingLifecycle({
    db: fixture.db, directory: fixture.directory, context, now: FROM, action: "baseline",
    baselines: [{
      accountId: "acct_rated", entitlementId: "ent_rated", requestId: "req_rated", ...cycle,
      boundaryObservedAt: FROM, observation: "measured_zero"
    }]
  });
  publishProtocolRatingPolicy(fixture.db, {
    vless: "2.5", hy2: "1.0", tuic: "1.0", now: FROM, expectedRevision: protocolRatingRevision(fixture.db)
  });
  await runProtocolRatingLifecycle({ db: fixture.db, directory: fixture.directory, context, now: FROM, action: "activate" });
  const accounting = createTrafficAccountingService({ controlStore: fixture.store, nowFn: () => new Date(NOW) });
  const first = {
    sourceRef: "full_metering_xray_cumulative_v1", channelRef: CHANNEL, edgeCredentialRef,
    observedAt: "2026-09-08T00:03:00.000Z", intervalStartedAt: SAMPLE_END, intervalEndedAt: "2026-09-08T00:03:00.000Z",
    uploadBytes: 1, downloadBytes: 0
  };
  const firstDecision = freezeProtocolRatingDecisions(fixture.db, [{
    record: { id: observationSampleId(first), ...first, accountId: "acct_rated", entitlementId: "ent_rated", requestId: "req_rated" }
  }])[0];
  const allowed = accounting.recordUsageObservation({ ...first, ratingDecision: firstDecision });
  assert.equal(allowed.status, "within_quota");
  assert.equal(allowed.sampleInserted, true);
  assert.equal(allowed.quota.trafficLimitBytes, 10);
  assert.equal(allowed.quota.usedBytes, 2);
  assert.equal(allowed.execution.trafficSupplyMutationRequired, false);
  assert.equal(fixture.store.listUsageSamples()[0].totalBytes, 1);
  assert.equal(Number(fixture.db.prepare("select charged_total_bytes, carry_out from platform_protocol_rating_charges").get().carry_out), 5000);
  assert.equal(Number(fixture.db.prepare("select remainder from platform_protocol_rating_carry").get().remainder), 5000);
  const replay = accounting.recordUsageObservation({ ...first, ratingDecision: firstDecision });
  assert.equal(replay.sampleInserted, false);
  assert.equal(replay.status, "within_quota");
  assert.equal(replay.quota.usedBytes, 2);
  assert.equal(fixture.db.prepare("select count(*) as count from platform_protocol_rating_charges").get().count, 1);
  assert.equal(Number(fixture.db.prepare("select remainder from platform_protocol_rating_carry").get().remainder), 5000);
  const portal = fixture.store.readLegacyPortalCurrentResource({ accountId: "acct_rated", now: "2026-09-08T00:03:30.000Z" });
  assert.equal(portal.resource.usage.usedBytes, 2);
  assert.equal(portal.resource.usage.remainingBytes, 8);
  const second = {
    ...first,
    observedAt: "2026-09-08T00:04:00.000Z",
    intervalStartedAt: "2026-09-08T00:03:00.000Z",
    intervalEndedAt: "2026-09-08T00:04:00.000Z",
    uploadBytes: 3
  };
  const secondDecision = freezeProtocolRatingDecisions(fixture.db, [{
    record: { id: observationSampleId(second), ...second, accountId: "acct_rated", entitlementId: "ent_rated", requestId: "req_rated" }
  }])[0];
  const blocked = accounting.recordUsageObservation({ ...second, ratingDecision: secondDecision });
  assert.equal(blocked.status, "over_quota_disable_required");
  assert.equal(blocked.quota.usedBytes, 10);
  assert.equal(blocked.execution.trafficSupplyMutationRequired, true);
  assert.equal(blocked.trafficSupply.reason, "quota_exhausted");
  const samples = fixture.store.listUsageSamples();
  assert.equal(samples.reduce((sum, sample) => sum + sample.totalBytes, 0), 4);
  const charges = fixture.db.prepare("select charged_total_bytes, raw_total_bytes from platform_protocol_rating_charges").all();
  assert.equal(charges.reduce((sum, row) => sum + Number(row.raw_total_bytes), 0), 4);
  assert.equal(charges.reduce((sum, row) => sum + Number(row.charged_total_bytes), 0), 10);
  assert.equal(Number(fixture.db.prepare("select remainder from platform_protocol_rating_carry").get().remainder), 0);
  const exhausted = fixture.store.readLegacyPortalCurrentResource({ accountId: "acct_rated", now: "2026-09-08T00:04:30.000Z" });
  assert.equal(exhausted.resource.usage.usedBytes, 10);
  assert.equal(exhausted.resource.usage.remainingBytes, 0);
  const monitor = buildSubscriptionUsageMonitor({
    controlStore: fixture.store, filters: {}, now: new Date("2026-09-08T00:04:30.000Z"), usageCollectorConfigured: true
  });
  const row = monitor.items.find((item) => item.issuanceRequestId === "req_rated");
  assert.equal(row.rawUsedBytes, 4);
  assert.equal(row.chargedUsedBytes, 10);
  const beforeSamples = fixture.store.listUsageSamples().length;
  const beforeCharges = fixture.db.prepare("select count(*) as count from platform_protocol_rating_charges").get().count;
  assert.throws(() => accounting.recordUsageObservation({
    ...second,
    observedAt: "2026-09-08T00:05:00.000Z",
    intervalStartedAt: "2026-09-08T00:04:00.000Z",
    intervalEndedAt: "2026-09-08T00:05:00.000Z",
    uploadBytes: 1
  }), /rating_decision_required/);
  assert.equal(fixture.store.listUsageSamples().length, beforeSamples);
  assert.equal(fixture.db.prepare("select count(*) as count from platform_protocol_rating_charges").get().count, beforeCharges);
  assert.equal(Number(fixture.db.prepare("select remainder from platform_protocol_rating_carry").get().remainder), 0);
});

function cycleOf(plan, validFrom, validUntil, at) {
  const cycle = usageCycleForBinding({ plan, validFrom, validUntil }, at);
  return {
    cycleKey: cycle.cadence === "lifetime" ? "lifetime" : cycle.startedAt,
    windowStartedAt: cycle.startedAt,
    endedAt: cycle.endedAt
  };
}

function baselineFor(identity, cycle, boundaryObservedAt) {
  return {
    ...identity,
    cycleKey: cycle.cycleKey,
    windowStartedAt: cycle.windowStartedAt,
    boundaryObservedAt,
    observation: "measured_zero"
  };
}

function ratedTotal(db, identity, cycle) {
  return readProtocolRatedUsage(db, {
    ...identity,
    cycleKey: cycle.cycleKey,
    observedFrom: cycle.windowStartedAt,
    observedTo: cycle.endedAt
  }).totalBytes;
}

function remainderFor(db, identity, cycleKey) {
  const row = db.prepare(`select remainder from platform_protocol_rating_carry
    where account_id = ? and entitlement_id = ? and request_id = ? and cycle_key = ?`).get(
    identity.accountId, identity.entitlementId, identity.requestId, cycleKey
  );
  return row ? Number(row.remainder) : null;
}

function commitRatedByte(fixture, binding, when, generation) {
  const sample = makeFullMeteringSample({
    binding, activationId: "test-activation", generation,
    delta: {
      uploadBytes: 1, downloadBytes: 0, totalBytes: 1,
      intervalStartedAt: new Date(Date.parse(when) - 60_000).toISOString(), intervalEndedAt: when
    }
  });
  const previous = readFullMeteringJournal({ directory: fixture.directory, context });
  const write = createFullMeteringSampleWriter({
    database: fixture.db, controlStore: fixture.store, readBindings: () => ({ entries: [binding] })
  });
  commitFullMeteringJournal({
    directory: fixture.directory, context, previousCheckpoint: previous,
    nextCheckpoint: { sequence: previous.sequence + 1, channels: [binding.channelRef] },
    samples: [sample], applySamples: write, freezeRating: () => freezeProtocolRatingDecisions(fixture.db, [sample])
  });
}

async function appendBaselines(fixture, baselines, now) {
  return runProtocolRatingOperator({
    action: "baseline", directory: fixture.directory, context, db: fixture.db, now, baselines,
    expectedCheckpointDigest: fullMeteringDigest(readFullMeteringJournal({ directory: fixture.directory, context }))
  });
}

test("a charged subscription survives link reset, starts the next cycle at zero, and stays apart from a purchased resource", async (t) => {
  const edgeCredentialRef = "edge-rated-1";
  const fixture = finishPortal(t, { status: "issued", nextAction: "none", event: null, edgeCredentialRef });
  const september = cycleOf(PLAN, FROM, UNTIL, SAMPLE_END);
  const octoberAt = "2026-10-02T00:00:00.000Z";
  const october = cycleOf(PLAN, FROM, UNTIL, octoberAt);
  const earlyPlan = "offerv_plan_365d_200gb_monthly_v1";
  const earlyFrom = "2026-01-15T00:00:00.000Z";
  const earlyUntil = "2027-01-15T00:00:00.000Z";
  const earlyCycle = cycleOf(earlyPlan, earlyFrom, earlyUntil, "2026-09-20T00:00:00.000Z");
  const subscription = { accountId: "acct_rated", entitlementId: "ent_rated", requestId: "req_rated" };
  const purchased = { accountId: "acct_rated", entitlementId: "ent_early", requestId: "req_early" };
  const septemberBaseline = baselineFor(subscription, september, FROM);
  assert.equal(september.cycleKey, "2026-09-01T00:00:00.000Z");
  assert.equal(october.cycleKey, "2026-10-01T00:00:00.000Z");
  assert.equal(earlyCycle.cycleKey, "2026-09-15T00:00:00.000Z");
  await runProtocolRatingLifecycle({ db: fixture.db, directory: fixture.directory, context, now: FROM, action: "drain" });
  await runProtocolRatingLifecycle({
    db: fixture.db, directory: fixture.directory, context, now: FROM, action: "baseline", baselines: [septemberBaseline]
  });
  publishProtocolRatingPolicy(fixture.db, { vless: "2.5", hy2: "1.0", tuic: "1.0", now: FROM, expectedRevision: protocolRatingRevision(fixture.db) });
  await runProtocolRatingLifecycle({ db: fixture.db, directory: fixture.directory, context, now: FROM, action: "activate" });
  commitRatedByte(fixture, fixture.binding, SAMPLE_END, "a".repeat(64));
  assert.equal(fixture.store.readLegacyPortalCurrentResource({ accountId: "acct_rated", now: NOW }).resource.usage.usedBytes, 2);
  assert.equal(fixture.store.listUsageSamples()[0].totalBytes, 1);
  const runtimeDb = new Database(":memory:");
  t.after(() => runtimeDb.close());
  const repository = createSubscriptionRepository({ database: runtimeDb });
  const core = createSubscriptionCore({
    repository, nowFn: () => new Date(NOW), publicSubscriptionBaseUrl: "https://subscription.example.test",
    proxyConfig: { servers: [{ name: "synthetic", host: "192.0.2.1", port: 443, protocol: "ss", method: "aes-256-gcm", password: "synthetic-only" }] }
  });
  repository.createTenant({
    id: "tenant_rated", displayName: "synthetic", status: "active", nodeId: CHANNEL, expiresAt: UNTIL,
    credentialMode: "shared-node", tokenHash: "synthetic_hash", tokenPrefix: "synthetic", note: "synthetic", now: FROM
  });
  const artifact = core.createSubscriptionArtifact("tenant_rated");
  fixture.store.upsertPortalAccessRequest({
    id: "req_rated", portalUserRef: "acct_rated", plan: "monthly", clientTarget: "clash", durationDays: 30,
    status: "delivered", nextAction: "subscription_ready", priorTrialState: "not_applicable", submittedAt: FROM, updatedAt: NOW,
    validUntil: UNTIL, expiresAt: UNTIL, entitlementRef: "ent_rated", tenantId: "tenant_rated", artifactId: artifact.artifact.id,
    subscriptionUrl: artifact.subscriptionUrl, edgeChannelRef: CHANNEL, edgeCredentialRef, event: null
  });
  ensurePortalSubscriptionLinkResetSchema(fixture.db);
  const portal = createPortalAccessRequestService({
    runtimeCore: core, controlStore: fixture.store, nowFn: () => new Date(NOW),
    subscriptionLinkResetEnabled: true, subscriptionLinkResetCooldownMs: 300000, refreshCooldownMs: 300000
  });
  const reset = portal.resetSubscriptionLink({
    portalUserRef: "acct_rated", requestRef: "req_rated", confirmed: true, idempotencyKey: "synthetic-operation-key-01"
  });
  assert.equal(reset.event.type, "subscription_link_reset");
  assert.equal(reset.usage.usedBytes, 2);
  assert.equal(reset.usage.uploadBytes, 2);
  assert.equal(reset.usage.downloadBytes, 0);
  assert.notEqual(reset.subscriptionUrl, artifact.subscriptionUrl);
  assert.equal(fixture.store.getPortalAccessRequest("req_rated").edgeCredentialRef, edgeCredentialRef);
  assert.equal(fixture.store.readLegacyPortalCurrentResource({ accountId: "acct_rated", now: NOW }).resource.usage.usedBytes, 2);
  assert.equal(fixture.store.listUsageSamples()[0].totalBytes, 1);
  assert.equal(fixture.db.prepare("select count(*) as count from platform_protocol_rating_charges").get().count, 1);
  assert.equal(remainderFor(fixture.db, subscription, september.cycleKey), 5000);
  const octoberBaseline = baselineFor(subscription, october, october.windowStartedAt);
  const appended = await appendBaselines(fixture, [septemberBaseline, octoberBaseline], "2026-10-01T00:00:00.000Z");
  assert.equal(appended.ok, true);
  commitRatedByte(fixture, fixture.binding, "2026-10-01T00:01:00.000Z", "c".repeat(64));
  const octoberPortal = fixture.store.readLegacyPortalCurrentResource({ accountId: "acct_rated", now: octoberAt });
  assert.equal(octoberPortal.resource.usage.usedBytes, 2);
  assert.equal(octoberPortal.resource.usage.cycleStartedAt, october.cycleKey);
  assert.equal(ratedTotal(fixture.db, subscription, september), 2);
  assert.equal(ratedTotal(fixture.db, subscription, october), 2);
  assert.equal(remainderFor(fixture.db, subscription, september.cycleKey), 5000);
  assert.equal(remainderFor(fixture.db, subscription, october.cycleKey), 5000);
  assert.equal(fixture.db.prepare("select charged_total_bytes from platform_protocol_rating_charges where cycle_key = ?").get(october.cycleKey).charged_total_bytes, 2);
  fixture.store.createEntitlement({
    id: "ent_early", accountId: "acct_rated", plan: earlyPlan, status: "active",
    validFrom: earlyFrom, validUntil: earlyUntil, trafficLimitBytes: 200 * 1024 ** 3, createdAt: earlyFrom, updatedAt: earlyFrom
  });
  fixture.store.createIssuanceRequest({
    id: "req_early", accountId: "acct_rated", entitlementId: "ent_early", approvalRef: "approval_early",
    status: "issued", quantity: 1, nodeId: CHANNEL, purpose: "product_purchase", requestedByRef: "acct_rated",
    createdAt: earlyFrom, updatedAt: earlyFrom
  });
  const earlyTenant = "tenant_early";
  fixture.store.linkIssuedSubscription({
    id: "link_early", requestId: "req_early", tenantRef: hashRef("tenant", earlyTenant),
    artifactRef: hashRef("artifact", "artifact_early"), createdAt: earlyFrom, updatedAt: earlyFrom
  });
  fixture.store.upsertPortalAccessRequest({
    id: "req_early", portalUserRef: "acct_rated", plan: "yearly", clientTarget: "clash", durationDays: 365,
    status: "issued", nextAction: "none", priorTrialState: "not_applicable", submittedAt: earlyFrom, updatedAt: earlyFrom,
    validUntil: earlyUntil, expiresAt: earlyUntil, entitlementRef: "ent_early", tenantId: earlyTenant, artifactId: "artifact_early",
    edgeChannelRef: CHANNEL, edgeCredentialRef: "edge-early-1", event: null
  });
  const earlyBaseline = baselineFor(purchased, earlyCycle, "2026-09-20T00:00:00.000Z");
  await appendBaselines(fixture, [septemberBaseline, octoberBaseline, earlyBaseline], "2026-10-02T00:00:00.000Z");
  const earlyBinding = {
    sourceRef: "full_metering_xray_cumulative_v1", channelRef: CHANNEL, edgeCredentialRef: "edge-early-1",
    materialDigest: "sha256:test", ...purchased,
    billingBinding: { plan: earlyPlan, validFrom: earlyFrom, validUntil: earlyUntil }
  };
  commitRatedByte(fixture, earlyBinding, "2026-10-02T01:00:00.000Z", "d".repeat(64));
  const separated = fixture.store.readLegacyPortalCurrentResource({ accountId: "acct_rated", now: octoberAt });
  assert.equal(separated.resource.state, "reconciliation_required");
  assert.equal(separated.resource.usage, undefined);
  assert.equal(ratedTotal(fixture.db, subscription, september), 2);
  assert.equal(ratedTotal(fixture.db, subscription, october), 2);
  assert.equal(ratedTotal(fixture.db, purchased, earlyCycle), 2);
  assert.equal(remainderFor(fixture.db, purchased, earlyCycle.cycleKey), 5000);
  assert.equal(fixture.db.prepare("select count(*) as count from platform_protocol_rating_carry").get().count, 3);
  assert.equal(fixture.db.prepare("select count(*) as count from platform_protocol_rating_charges").get().count, 3);
  const raw = fixture.store.listUsageSamples();
  assert.equal(raw.length, 3);
  assert.equal(raw.every((sample) => sample.totalBytes === 1), true);
  const monitor = buildSubscriptionUsageMonitor({
    controlStore: fixture.store, filters: {}, now: new Date(octoberAt), usageCollectorConfigured: true
  });
  const subscriptionRow = monitor.items.find((item) => item.issuanceRequestId === "req_rated");
  const purchasedRow = monitor.items.find((item) => item.issuanceRequestId === "req_early");
  assert.equal(subscriptionRow.rawUsedBytes, 1);
  assert.equal(subscriptionRow.chargedUsedBytes, 2);
  assert.equal(subscriptionRow.ratingState, "rated");
  assert.equal(purchasedRow.rawUsedBytes, 1);
  assert.equal(purchasedRow.chargedUsedBytes, 2);
  assert.equal(purchasedRow.ratingState, "rated");
  assert.equal(monitor.ratingBoundary.effectiveNotBefore, FROM);
  assert.equal(monitor.ratingBoundary.version, 1);
});
