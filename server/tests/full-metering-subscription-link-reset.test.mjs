import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import { checkPortalSubscriptionLinkResetSchema, ensurePortalSubscriptionLinkResetSchema,
  verifyPortalSubscriptionLinkResetLineage } from "../services/platform/portal-subscription-link-reset-store.mjs";
import { createPortalAccessRequestService } from "../services/platform/portal-access-requests.mjs";
import { createSubscriptionCore } from "../services/subscriptions/core.mjs";
import { createSubscriptionRepository } from "../services/subscriptions/repository.mjs";
import { inspectFullMeteringBindings, inspectTrafficVlessBaseline, readFullMeteringBindings } from "../../scripts/lib/traffic-vless-recovery-baseline.mjs";
import { fullMeteringBindingIdentity, createFullMeteringSampleWriter } from "../../scripts/lib/full-metering-sample-writer.mjs";
import { fullMeteringDigest, readFullMeteringJournal } from "../../scripts/lib/full-metering-journal.mjs";
import { runFullMeteringCollection } from "../../scripts/lib/full-metering-collection.mjs";
import { fullMeteringChannels, LOCAL_METERING_SCOPE } from "../../scripts/lib/full-metering-scope.mjs";

const NOW = "2026-10-09T12:00:00.000Z", FROM = "2026-10-01T00:00:00.000Z", UNTIL = "2026-11-01T00:00:00.000Z";
const CHANNELS = fullMeteringChannels(LOCAL_METERING_SCOPE);
const TABLE = "platform_portal_subscription_link_resets";
const ref = (prefix, value) => `${prefix}ref_${createHash("sha256").update(value).digest("hex").slice(0, 16)}`;

// All material is disposable and synthetic. No protocol process, remote
// endpoint, production DB, subscription or private collector file is used.
function fixture(t, mode = "legacy_primary") {
  const directory = mkdtempSync(join(tmpdir(), "full-metering-reset-"));
  const dbPath = join(directory, "control.sqlite");
  const db = new Database(dbPath), runtimeDb = new Database(":memory:");
  let writerDb;
  t.after(() => {
    writerDb?.close(); db.close(); runtimeDb.close();
    assert.equal(dirname(realpathSync(directory)), realpathSync(tmpdir()));
    assert.match(basename(directory), /^full-metering-reset-/);
    rmSync(directory, { recursive: true });
  });
  let at = NOW, counter = 1000;
  const nowFn = () => new Date(at);
  const control = createSqliteSubscriptionControlStore({ database: db });
  const repository = createSubscriptionRepository({ database: runtimeDb });
  const core = createSubscriptionCore({ repository, nowFn, publicSubscriptionBaseUrl: "https://subscription.example.test",
    proxyConfig: { servers: CHANNELS.map(({ channelRef }) => ({ id: channelRef, name: channelRef,
      host: "192.0.2.1", port: 443, protocol: "ss", method: "aes-256-gcm", password: "synthetic-no-network" })) } });
  function seed(index, channelRef) {
    const owner = `account_synthetic_${index}`, request = `request_synthetic_${index}`;
    const tenant = `tenant_synthetic_${index}`, entitlement = `ent_synthetic_${index}`, credential = `credential_synthetic_${index}`;
    repository.createTenant({ id: tenant, displayName: "synthetic", status: "active", nodeId: channelRef, expiresAt: UNTIL,
      credentialMode: "shared-node", tokenHash: `synthetic_hash_${index}`, tokenPrefix: "synthetic", note: "synthetic", now: FROM });
    const original = core.createSubscriptionArtifact(tenant);
    control.createAccount({ id: owner, ownerRef: owner, status: "active", createdAt: FROM, updatedAt: FROM });
    control.createEntitlement({ id: entitlement, accountId: owner, plan: "monthly", status: "active", validFrom: FROM,
      validUntil: UNTIL, trafficLimitBytes: 10000, createdAt: FROM, updatedAt: FROM });
    control.createIssuanceRequest({ id: request, accountId: owner, entitlementId: entitlement, approvalRef: "approval_synthetic",
      status: "issued", nodeId: channelRef, purpose: "portal_access_request", requestedByRef: owner, createdAt: FROM, updatedAt: FROM });
    control.linkIssuedSubscription({ id: `link_synthetic_${index}`, requestId: request, tenantRef: ref("tenant", tenant),
      artifactRef: ref("artifact", original.artifact.id), status: "active", createdAt: FROM, updatedAt: FROM });
    control.upsertPortalAccessRequest({ id: request, portalUserRef: owner, plan: "monthly", clientTarget: "clash", durationDays: 30, quantity: 1,
      status: "delivered", nextAction: "user_can_use_access", priorTrialState: "not_applicable", submittedAt: FROM, updatedAt: FROM,
      validUntil: UNTIL, expiresAt: UNTIL, entitlementRef: entitlement, accessGrantRef: `grant_synthetic_${index}`, tenantId: tenant,
      artifactId: original.artifact.id, subscriptionUrl: original.subscriptionUrl, edgeChannelRef: channelRef,
      edgeCredentialRef: credential, edgeMaterialDigest: "1".repeat(64) });
    return { owner, request, tenant, entitlement, credential, original };
  }
  const targets = CHANNELS.map(({ channelRef }, index) => seed(index, channelRef));
  const target = targets[0];
  if (mode === "legacy_primary") db.prepare("delete from platform_portal_edge_credentials where request_id=?").run(target.request);
  if (mode === "shadow") {
    control.upsertPortalAccessRequest({ ...control.getPortalAccessRequest(target.request), edgeCredentials: [{
      edgeChannelRef: CHANNELS[1].channelRef, edgeCredentialRef: "credential_synthetic_shadow", edgeMaterialDigest: "2".repeat(64) }] });
    seed("anchor", CHANNELS[0].channelRef);
  }
  ensurePortalSubscriptionLinkResetSchema(db);
  const service = createPortalAccessRequestService({ runtimeCore: core, controlStore: control, nowFn,
    subscriptionLinkResetEnabled: true, subscriptionLinkResetCooldownMs: 300000 });
  const inspect = () => inspectFullMeteringBindings({ dbPath, channelRefs: CHANNELS.map(source => source.channelRef), nowFn });
  const readInventory = () => {
    const result = inspect();
    if (!result.ok) throw Object.assign(new Error(result.summary.errorCode), { code: result.summary.errorCode });
    return result.privateInventory;
  };
  const context = { scopeDigest: "a".repeat(64), databaseIdentityDigest: readInventory().databaseIdentityDigest, meteringScope: LOCAL_METERING_SCOPE };
  writerDb = new Database(dbPath);
  const writerStore = createSqliteSubscriptionControlStore({ database: writerDb });
  const applySamples = createFullMeteringSampleWriter({ database: writerDb, controlStore: writerStore,
    meteringScope: LOCAL_METERING_SCOPE, activationId: "synthetic-reset-continuity",
    readBindings: () => readFullMeteringBindings({ db: writerDb, databaseIdentityDigest: context.databaseIdentityDigest,
      channelRefs: CHANNELS.map(source => source.channelRef), now: at }) });
  const collectOptions = { directory: join(directory, "checkpoint"), context, meteringScope: LOCAL_METERING_SCOPE,
    activationId: "synthetic-reset-continuity", nowFn: () => at, readInventory, applySamples,
    readSources: async inventory => CHANNELS.map(({ channelRef, sourceRef, mode: sourceMode }) => ({
      channelRef, sourceRef, mode: sourceMode, generation: "c".repeat(64), observedAt: at,
      observations: inventory.entries.filter(entry => entry.channelRef === channelRef).map(entry => ({
        edgeCredentialRef: entry.edgeCredentialRef, uploadBytes: counter, downloadBytes: counter,
        ...(sourceMode === "connections" ? { connectionId: "synthetic-connection" } : {}) })) })) };
  const reset = (index = 1) => service.resetSubscriptionLink({ portalUserRef: target.owner, requestRef: target.request,
    confirmed: true, idempotencyKey: `synthetic-collector-reset-${index}` });
  const set = (step, bytes) => { at = new Date(Date.parse(NOW) + step * 360000).toISOString(); counter = bytes; };
  return { db, dbPath, control, core, target, targets, reset, inspect, readInventory, collectOptions, set };
}

function identityDigest(inventory) {
  return fullMeteringDigest(inventory.entries.map(fullMeteringBindingIdentity));
}
function retainedIdentityDigest(inventory) {
  return fullMeteringDigest(inventory.retainedBindings.map(({ channelRef, edgeCredentialRef, materialDigest, reasons }) => ({
    channelRef, edgeCredentialRef, materialDigest, reasons })));
}
function ledgerDigest(f) {
  return fullMeteringDigest({ samples: f.db.prepare("select * from platform_usage_samples order by id").all(),
    rollups: f.db.prepare("select * from platform_usage_rollups order by edge_credential_ref").all() });
}
function assertBlocked(f) {
  const ledger = ledgerDigest(f);
  const result = f.inspect();
  assert.equal(result.ok, false);
  assert.equal(result.summary.errorCode, "baseline_binding_invalid");
  assert.equal(result.privateInventory, null);
  assert.equal(ledgerDigest(f), ledger, "failed inspection must not alter any accounting");
}

for (const mode of ["legacy_primary", "durable", "shadow"]) {
  test(`${mode}: two completed link resets preserve identity and normal collector continuity`, async t => {
    const f = fixture(t, mode), before = f.readInventory();
    const identity = identityDigest(before), retainedIdentity = retainedIdentityDigest(before), retainedCount = before.retainedBindings.length;
    assert.equal(retainedCount, mode === "shadow" ? 1 : 0);
    if (mode === "shadow") assert.deepEqual(before.retainedBindings[0].reasons, ["portal_durable_scope_supersedes_primary"]);
    const issuedBefore = fullMeteringDigest(f.db.prepare("select * from platform_issued_subscription_links order by id").all());
    const entitlementBefore = fullMeteringDigest(f.control.getEntitlement(f.target.entitlement));
    const initial = await runFullMeteringCollection({ ...f.collectOptions, mode: "initialize" });
    assert.equal(initial.recordedBytes, 0);
    for (let step = 1; step <= 2; step += 1) {
      f.set(step, 1000 + step * 5);
      const ledgerBefore = ledgerDigest(f);
      assert.equal(f.reset(step).event.type, "subscription_link_reset");
      assert.equal(ledgerDigest(f), ledgerBefore, "reset must not credit, debit or clear usage");
      const after = f.inspect();
      assert.equal(after.ok, true, after.summary.errorCode);
      assert.equal(identityDigest(after.privateInventory), identity);
      assert.equal(after.privateInventory.retainedBindings.length, retainedCount);
      assert.equal(retainedIdentityDigest(after.privateInventory), retainedIdentity);
      assert.equal(fullMeteringDigest(f.control.getEntitlement(f.target.entitlement)), entitlementBefore);
      assert.equal(fullMeteringDigest(f.db.prepare("select * from platform_issued_subscription_links order by id").all()), issuedBefore);
      const collected = await runFullMeteringCollection({ ...f.collectOptions, mode: "collect" });
      assert.equal(collected.status, "collected");
      assert.equal(collected.pendingStartCount, 0);
      assert.equal(collected.sampleCount, before.entries.length);
      assert.equal(collected.recordedBytes, before.entries.length * 10);
      assert.equal(collected.historicalDebits, false);
      assert.equal((await runFullMeteringCollection({ ...f.collectOptions, mode: "collect" })).sampleCount, 0);
    }
    const checkpoint = readFullMeteringJournal(f.collectOptions);
    assert.equal(checkpoint.sources.every(source => source.counterState.generation === "c".repeat(64)), true);
    assert.equal(checkpoint.materialContinuations, undefined);
    assert.equal(checkpoint.billingWindowContinuations, undefined);
    assert.equal(f.db.prepare("select count(*) count from platform_usage_samples").get().count, before.entries.length * 2);
  });
}

const mutations = [
  ["prepared is not completed authority", f => f.db.prepare(`update ${TABLE} set state='prepared', completed_at=null`).run()],
  ["missing chain", f => f.db.prepare(`delete from ${TABLE}`).run()],
  ["different owner", f => f.db.prepare(`update ${TABLE} set owner_ref=?`).run(f.targets[1].owner)],
  ["different tenant", f => f.db.prepare(`update ${TABLE} set tenant_id=?`).run(f.targets[1].tenant)],
  ["different request", f => f.db.prepare(`update ${TABLE} set request_ref=?`).run(f.targets[1].request)],
  ["broken original artifact", f => f.db.prepare(`update ${TABLE} set previous_artifact_id='synthetic_unrelated_artifact'`).run()],
  ["tampered replacement", f => f.db.prepare(`update ${TABLE} set replacement_artifact_id='synthetic_unrelated_artifact'`).run()],
  ["completion before preparation", f => f.db.prepare(`update ${TABLE} set completed_at=?`).run(FROM)],
  ["missing opt-in schema", f => f.db.exec(`drop table ${TABLE}`)],
  ["missing required unique index", f => f.db.exec("drop index portal_link_reset_replacement_idx")],
  ["nonmatching original issued artifact", f => f.db.prepare("update platform_issued_subscription_links set artifact_ref=? where request_id=?")
    .run(ref("artifact", "synthetic_never_issued"), f.target.request)],
  ["nonmatching issued tenant", f => f.db.prepare("update platform_issued_subscription_links set tenant_ref=? where request_id=?")
    .run(ref("tenant", "synthetic_unrelated_tenant"), f.target.request)],
  ["tampered current artifact pointer", f => f.db.prepare("update platform_portal_access_requests set artifact_id='synthetic_unrelated_current' where id=?")
    .run(f.target.request)],
  ["ambiguous completed branch", f => f.db.prepare(`insert into ${TABLE}
    select ?,request_ref,owner_ref,tenant_id,previous_artifact_id,'synthetic_branch',subscription_url,prepared_at,completed_at,state,source_digest from ${TABLE}`)
    .run("f".repeat(64))]
];
for (const [name, mutate] of mutations) {
  test(`reset lineage fail-closed: ${name}`, t => {
    const f = fixture(t);
    f.reset();
    mutate(f);
    assertBlocked(f);
  });
}

test("legacy exact artifact binding remains valid without opt-in reset schema", t => {
  const f = fixture(t);
  f.db.exec(`drop table ${TABLE}`);
  assert.equal(f.inspect().ok, true);
});

test("legacy VLESS recovery retains exact artifact matching and does not opt into completed reset lineage", t => {
  const f = fixture(t);
  const inspectLegacyRecovery = () => inspectTrafficVlessBaseline({ dbPath: f.dbPath,
    channelRefs: [CHANNELS[0].channelRef], nowFn: () => new Date(NOW),
    retentionPolicy: "preserve-ineligible", initializationPolicy: "verified-legacy-fresh-cursors" });
  assert.equal(inspectLegacyRecovery().ok, true);
  f.reset();
  assert.equal(f.inspect().ok, true, "full collector explicitly accepts valid completed lineage");
  const result = inspectLegacyRecovery();
  assert.equal(result.ok, false);
  assert.equal(result.summary.errorCode, "baseline_binding_invalid");
});

test("reset schema and lineage inspection preserve the caller's integer mode on success and failure", t => {
  const f = fixture(t);
  f.reset();
  const lineageInput = { requestRef: f.target.request, ownerRef: f.target.owner, tenantId: f.target.tenant,
    originalArtifactRef: ref("artifact", f.target.original.artifact.id), currentArtifactId: f.control.getPortalAccessRequest(f.target.request).artifactId };
  for (const safeIntegers of [false, true]) {
    f.db.defaultSafeIntegers(safeIntegers);
    const type = safeIntegers ? "bigint" : "number";
    assert.equal(checkPortalSubscriptionLinkResetSchema(f.db), true);
    assert.equal(typeof f.db.prepare("select 1 value").get().value, type);
    assert.equal(verifyPortalSubscriptionLinkResetLineage(f.db, lineageInput), true);
    assert.equal(typeof f.db.prepare("select 1 value").get().value, type);
    assert.equal(verifyPortalSubscriptionLinkResetLineage(f.db, { ...lineageInput, ownerRef: f.targets[1].owner }), false);
    assert.equal(typeof f.db.prepare("select 1 value").get().value, type);
  }
  f.db.exec("drop index portal_link_reset_replacement_idx");
  for (const safeIntegers of [false, true]) {
    f.db.defaultSafeIntegers(safeIntegers);
    const type = safeIntegers ? "bigint" : "number";
    assert.throws(() => checkPortalSubscriptionLinkResetSchema(f.db), { code: "subscription_link_reset_schema_unavailable" });
    assert.equal(typeof f.db.prepare("select 1 value").get().value, type);
    assert.equal(verifyPortalSubscriptionLinkResetLineage(f.db, lineageInput), false);
    assert.equal(typeof f.db.prepare("select 1 value").get().value, type);
  }
});

test("invalid completed lineage stops normal collection before sources, checkpoint or ledger change", async t => {
  const f = fixture(t);
  await runFullMeteringCollection({ ...f.collectOptions, mode: "initialize" });
  const checkpointBefore = fullMeteringDigest(readFullMeteringJournal(f.collectOptions));
  const ledgerBefore = ledgerDigest(f);
  f.set(1, 1005);
  f.reset();
  f.db.prepare(`update ${TABLE} set owner_ref=?`).run(f.targets[1].owner);
  let sourceReads = 0;
  await assert.rejects(runFullMeteringCollection({ ...f.collectOptions, mode: "collect",
    readSources: async () => { sourceReads += 1; return []; } }), { code: "baseline_binding_invalid" });
  assert.equal(sourceReads, 0);
  assert.equal(fullMeteringDigest(readFullMeteringJournal(f.collectOptions)), checkpointBefore);
  assert.equal(ledgerDigest(f), ledgerBefore);
});

test("multi-reset lineage fails closed on an intermediate gap or backwards pointer", t => {
  const f = fixture(t);
  f.reset();
  const intermediate = f.control.getPortalAccessRequest(f.target.request).artifactId;
  f.set(1, 1000);
  f.reset(2);
  const current = f.control.getPortalAccessRequest(f.target.request).artifactId;
  f.db.prepare("update platform_portal_access_requests set artifact_id=? where id=?").run(intermediate, f.target.request);
  assertBlocked(f);
  f.db.prepare("update platform_portal_access_requests set artifact_id=? where id=?").run(current, f.target.request);
  f.db.prepare(`delete from ${TABLE} where previous_artifact_id=?`).run(f.target.original.artifact.id);
  assertBlocked(f);
});
