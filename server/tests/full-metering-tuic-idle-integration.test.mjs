import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import { createFullMeteringTuicConnectionSnapshotReader } from "../services/edge/full-metering-source-readers.mjs";
import { inspectFullMeteringBindings, readFullMeteringBindings } from "../../scripts/lib/traffic-vless-recovery-baseline.mjs";
import { createFullMeteringSourceDriver, fullMeteringRuntimeFingerprint } from "../../scripts/lib/full-metering-source-driver.mjs";
import { runFullMeteringCollection } from "../../scripts/lib/full-metering-collection.mjs";
import { readFullMeteringJournal } from "../../scripts/lib/full-metering-journal.mjs";
import { createFullMeteringSampleWriter } from "../../scripts/lib/full-metering-sample-writer.mjs";
import { LOCAL_METERING_SCOPE, fullMeteringChannels } from "../../scripts/lib/full-metering-scope.mjs";

// Real response parsing, binding inspection, journal and SQLite accounting;
// source transport/runtime proofs are synthetic. No protocol process or network.
const T0 = "2026-10-09T00:00:00.000Z";
const OLD = "2026-10-01T00:00:00.000Z";
const UNTIL = "2027-10-01T00:00:00.000Z";
const CHANNELS = fullMeteringChannels(LOCAL_METERING_SCOPE);
const sha = value => createHash("sha256").update(value).digest("hex");
const resourceRef = (prefix, value) => `${prefix}ref_${sha(value).slice(0, 16)}`;

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), "full-metering-tuic-idle-"));
  const dbPath = join(directory, "synthetic.sqlite"), journalDirectory = join(directory, "journal");
  const store = createSqliteSubscriptionControlStore({ dbPath });
  const db = new Database(dbPath);
  t.after(() => { db.close(); store.close(); rmSync(directory, { recursive: true, force: true }); });
  const f = { now: T0, payload: { uploadTotal: 9000, downloadTotal: 8000, connections: null, memory: 1000000 },
    calls: [], runtimeOmitted: false };
  const records = CHANNELS.map((source, n) => {
    const record = { credentialRef: `synthetic-credential-${n}`,
      material: { uuid: `${String(n + 1).padStart(8, "0")}-1111-4111-8111-111111111111`, password: `synthetic-password-${n}` } };
    record.materialDigest = `sha256:${sha(`${record.material.uuid}\0${record.material.password}`)}`;
    const accountId = `synthetic-account-${n}`, entitlementId = `synthetic-entitlement-${n}`, requestId = `synthetic-request-${n}`;
    const tenant = `synthetic-tenant-${n}`, artifact = `synthetic-artifact-${n}`;
    store.createAccount({ id: accountId, ownerRef: `synthetic-owner-${n}`, status: "active", createdAt: OLD, updatedAt: OLD });
    store.createEntitlement({ id: entitlementId, accountId, plan: "yearly", status: "active",
      validFrom: OLD, validUntil: UNTIL, trafficLimitBytes: 1000000, createdAt: OLD, updatedAt: OLD });
    store.createIssuanceRequest({ id: requestId, accountId, entitlementId, approvalRef: `synthetic-approval-${n}`,
      status: "issued", quantity: 1, nodeId: source.channelRef, purpose: "portal_auto_issuance", requestedByRef: "synthetic-issuer", createdAt: OLD, updatedAt: OLD });
    store.linkIssuedSubscription({ id: `synthetic-link-${n}`, requestId, tenantRef: resourceRef("tenant", tenant),
      artifactRef: resourceRef("artifact", artifact), status: "active", createdAt: OLD, updatedAt: OLD });
    store.upsertPortalAccessRequest({ id: requestId, portalUserRef: accountId, plan: "yearly", clientTarget: "clash", durationDays: 365, quantity: 1,
      status: "delivered", nextAction: "user_can_use_access", noteProvided: false, priorTrialState: "not_applicable", submittedAt: OLD, updatedAt: OLD,
      validUntil: UNTIL, entitlementRef: entitlementId, accessGrantRef: `synthetic-grant-${n}`, tenantId: tenant, artifactId: artifact,
      subscriptionUrl: "https://synthetic.example.invalid/sub/not-a-real-subscription", edgeChannelRef: source.channelRef,
      edgeCredentialRef: record.credentialRef, edgeMaterialDigest: record.materialDigest });
    return record;
  });
  const channelRefs = CHANNELS.map(source => source.channelRef);
  const sources = CHANNELS.map((source, n) => ({ channelRef: source.channelRef, host: "local",
    kind: n === 0 ? "xray" : n === 1 ? "hy2" : "tuic",
    runtimeUnit: n === 0 ? "xray-vless-reality.service" : n === 1 ? "hysteria2.service" : "mihomo-tuic.service",
    configPath: `/etc/synthetic/${n}/config` }));
  const context = { scopeDigest: "c".repeat(64), databaseIdentityDigest: "d".repeat(64), meteringScope: LOCAL_METERING_SCOPE };
  const readInventory = () => {
    const inspected = inspectFullMeteringBindings({ dbPath, channelRefs, nowFn: () => f.now });
    assert.equal(inspected.ok, true);
    return inspected.privateInventory;
  };
  const readSources = createFullMeteringSourceDriver({ sources, meteringScope: LOCAL_METERING_SCOPE,
    readMaterial: () => ({ records }), readSource: async source => {
      assert.equal(source.host, "local");
      f.calls.push(source.channelRef);
      const index = channelRefs.indexOf(source.channelRef), record = records[index];
      const runtimeUser = source.kind === "tuic" ? record.material.uuid : record.credentialRef;
      const runtimeUsers = f.runtimeOmitted && source.kind === "tuic" ? []
        : [{ runtimeUser, materialFingerprint: fullMeteringRuntimeFingerprint(source.kind, record.material) }];
      let observations;
      if (source.kind === "tuic") {
        const snapshot = await createFullMeteringTuicConnectionSnapshotReader({
          url: "http://127.0.0.1:19090/connections", credentialRefByRuntimeUser: source.credentialRefByRuntimeUser,
          nowFn: () => f.now, fetchFn: async (url, options) => {
            assert.equal(url, "http://127.0.0.1:19090/connections");
            assert.equal(options.method, "GET");
            return new Response(JSON.stringify(f.payload), { headers: { "content-type": "application/json" } });
          }
        })();
        observations = snapshot.connections;
      } else observations = [{ edgeCredentialRef: record.credentialRef, uploadBytes: 100, downloadBytes: 100 }];
      return { generation: "a".repeat(64), configDigest: "b".repeat(64), observedAt: f.now, observations, runtimeUsers };
    } });
  const sampleStore = createSqliteSubscriptionControlStore({ database: db, initializeSchema: false });
  const options = { directory: journalDirectory, context, activationId: "synthetic-tuic-idle", meteringScope: LOCAL_METERING_SCOPE,
    nowFn: () => f.now, readInventory, readSources,
    applySamples: createFullMeteringSampleWriter({ database: db, controlStore: sampleStore, meteringScope: LOCAL_METERING_SCOPE,
      activationId: "synthetic-tuic-idle", readBindings: () => readFullMeteringBindings({ db,
        databaseIdentityDigest: context.databaseIdentityDigest, channelRefs, now: f.now }) }) };
  return Object.assign(f, { records, readSources, journalDirectory,
    run: (mode, extra = {}) => runFullMeteringCollection({ ...options, mode, ...extra }),
    checkpoint: () => readFullMeteringJournal({ directory: journalDirectory, context }),
    checkpointBytes: () => readFileSync(join(journalDirectory, "checkpoint.json")),
    ledger: () => db.prepare("SELECT COUNT(*) AS count, COALESCE(SUM(total_bytes), 0) AS bytes FROM platform_usage_samples").get(),
    rows: () => db.prepare("SELECT channel_ref, edge_credential_ref, upload_bytes, download_bytes FROM platform_usage_samples ORDER BY rowid").all(),
    step: (minute, connections) => {
      f.now = `2026-10-09T00:${String(minute).padStart(2, "0")}:00.000Z`;
      f.payload = { uploadTotal: 9000 + minute * 1000, downloadTotal: 8000 + minute * 2000, connections, memory: 1000000 };
    },
    connection: (id, upload, download) => ({ id, metadata: { inboundUser: records[2].material.uuid }, upload, download }) });
}

test("native idle null through real reader and collector baselines each new connection without historical debit", async t => {
  const f = fixture(t);
  const preflight = await f.run("preflight");
  assert.equal(preflight.channelCount, 3);
  assert.equal(preflight.deferredSources.usage, "unknown");
  assert.equal(existsSync(f.journalDirectory), false);
  assert.equal((await f.run("initialize")).recordedBytes, 0);
  assert.deepEqual(f.ledger(), { count: 0, bytes: 0 });
  f.step(1, [f.connection("connection-a", 1000, 2000)]);
  assert.equal((await f.run("collect")).recordedBytes, 0);
  assert.deepEqual(f.ledger(), { count: 0, bytes: 0 });
  f.step(2, [f.connection("connection-a", 1012, 2034)]);
  assert.equal((await f.run("collect")).recordedBytes, 46);
  assert.deepEqual(f.ledger(), { count: 1, bytes: 46 });
  f.step(3, null);
  assert.equal((await f.run("collect")).recordedBytes, 0);
  assert.deepEqual(f.ledger(), { count: 1, bytes: 46 });
  f.step(4, [f.connection("connection-b", 3000, 4000)]);
  assert.equal((await f.run("collect")).recordedBytes, 0);
  assert.deepEqual(f.ledger(), { count: 1, bytes: 46 });
  f.step(5, [f.connection("connection-b", 3005, 4007)]);
  assert.equal((await f.run("collect")).recordedBytes, 12);
  assert.deepEqual(f.ledger(), { count: 2, bytes: 58 });
  assert.deepEqual(f.rows(), [
    { channel_ref: CHANNELS[2].channelRef, edge_credential_ref: f.records[2].credentialRef, upload_bytes: 12, download_bytes: 34 },
    { channel_ref: CHANNELS[2].channelRef, edge_credential_ref: f.records[2].credentialRef, upload_bytes: 5, download_bytes: 7 }
  ]);
  assert.equal(f.checkpoint().meteringScope, LOCAL_METERING_SCOPE);
  assert.equal(f.calls.every(channel => CHANNELS.some(source => source.channelRef === channel)), true);
  assert.equal(existsSync(join(f.journalDirectory, "pending.json")), false);
});

test("idle null does not relax eligible runtime coverage or material binding", async t => {
  const f = fixture(t);
  await f.run("initialize");
  const before = f.checkpointBytes();
  f.step(1, null);
  f.runtimeOmitted = true;
  await assert.rejects(f.run("collect"), { code: "full_metering_runtime_identity_missing" });
  f.runtimeOmitted = false;
  f.records[2].materialDigest = `sha256:${"f".repeat(64)}`;
  await assert.rejects(f.run("collect"), { code: "full_metering_material_binding_changed" });
  assert.deepEqual(f.checkpointBytes(), before);
  assert.deepEqual(f.ledger(), { count: 0, bytes: 0 });
  assert.equal(existsSync(join(f.journalDirectory, "pending.json")), false);
});

test("idle null still requires all three local sources and a present connections field", async t => {
  const f = fixture(t);
  await f.run("initialize");
  const before = f.checkpointBytes();
  f.step(1, null);
  await assert.rejects(f.run("collect", { readSources: async inventory => (await f.readSources(inventory)).slice(1) }),
    { code: "full_metering_source_scope_invalid" });
  delete f.payload.connections;
  await assert.rejects(f.run("collect"), { code: "full_metering_source_response_invalid" });
  assert.deepEqual(f.checkpointBytes(), before);
  assert.deepEqual(f.ledger(), { count: 0, bytes: 0 });
  assert.equal(existsSync(join(f.journalDirectory, "pending.json")), false);
});
