import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { packFixture, CHANNELS } from "./full-metering-data-pack-bindings.fixture.mjs";
import { FULL_METERING_CHANNELS, runFullMeteringCollection } from "../../scripts/lib/full-metering-collection.mjs";
import { createFullMeteringSourceDriver, fullMeteringRuntimeFingerprint } from "../../scripts/lib/full-metering-source-driver.mjs";
import { createFullMeteringSampleWriter } from "../../scripts/lib/full-metering-sample-writer.mjs";
import { readFullMeteringJournal } from "../../scripts/lib/full-metering-journal.mjs";
import { readDataPackDesiredStateRows } from "../services/edge/data-pack-desired-state-rows.mjs";

const T0 = "2026-09-30T23:59:57.000Z";
const T1 = "2026-09-30T23:59:59.000Z";
const T2 = "2026-10-01T00:00:01.000Z";
const T3 = "2026-10-01T00:00:02.000Z";
const T4 = "2026-10-01T00:00:03.000Z";
const CONTEXT = { databaseIdentityDigest: "b".repeat(64), scopeDigest: "c".repeat(64) };
const materialDigest = (material) => `sha256:${createHash("sha256")
  .update(material.uuid).update("\0").update(material.password).digest("hex")}`;

function pipeline(t) {
  const fixture = packFixture(t, CHANNELS);
  const directory = mkdtempSync(join(tmpdir(), "full-metering-pack-pipeline-"));
  const journal = join(directory, "journal");
  t.after(() => rmSync(directory, { recursive: true, force: true, maxRetries: 3 }));
  let now = T0;
  const identities = [];
  const sources = FULL_METERING_CHANNELS.map((source, index) => ({
    channelRef: source.channelRef,
    kind: index < 2 ? "xray" : index < 4 ? "hy2" : "tuic",
    host: [1, 3].includes(index) ? "sgp" : "local",
    runtimeUnit: index < 2 ? "xray-vless-reality.service"
      : index < 4 ? "hysteria2.service" : "mihomo-tuic.service",
    configPath: `/synthetic/channel_${index}/config`
  }));

  function add({ channel = CHANNELS[2], gigabytes } = {}) {
    const index = identities.length + 1;
    const material = { uuid: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      password: `synthetic_pack_pipeline_${index}` };
    const digest = materialDigest(material);
    const binding = gigabytes ? fixture.pack({ channel, gigabytes, materialDigest: digest })
      : fixture.timed(channel, { materialDigest: digest });
    const entry = { binding, material, digest,
      uploadBytes: 100, downloadBytes: 100, runtimePresent: true };
    identities.push(entry);
    return entry;
  }

  const readInventory = () => fixture.read(now);
  const readSources = createFullMeteringSourceDriver({ sources,
    readMaterial: () => ({ records: identities.map((entry) => ({
      credentialRef: entry.binding.edgeCredentialRef, materialDigest: entry.digest, material: entry.material
    })) }),
    // Explicit simulated process boundary: this does not query a daemon, socket,
    // SSH host or protocol collector. Everything after the snapshot is real.
    readSource: async (source) => {
      const entries = identities.filter((entry) => entry.runtimePresent
        && entry.binding.channelRef === source.channelRef);
      return { generation: "a".repeat(64), configDigest: "d".repeat(64), observedAt: now,
        runtimeUsers: entries.map((entry) => ({
          runtimeUser: source.kind === "tuic" ? entry.material.uuid : entry.binding.edgeCredentialRef,
          materialFingerprint: fullMeteringRuntimeFingerprint(source.kind, entry.material)
        })),
        observations: entries.map((entry) => ({ edgeCredentialRef: entry.binding.edgeCredentialRef,
          uploadBytes: entry.uploadBytes, downloadBytes: entry.downloadBytes,
          ...(source.kind === "tuic" ? { connectionId: `connection_${entry.binding.edgeCredentialRef}` } : {})
        })) };
    }
  });
  const writer = createFullMeteringSampleWriter({ database: fixture.db,
    controlStore: fixture.control, readBindings: readInventory });
  return {
    ...fixture, add, identities, readInventory,
    at: (value) => { now = value; },
    run: (mode) => runFullMeteringCollection({ directory: journal, context: CONTEXT,
      activationId: "synthetic_pack_pipeline", mode, nowFn: () => now,
      readInventory, readSources, applySamples: writer }),
    checkpoint: () => readFullMeteringJournal({ directory: journal, context: CONTEXT }),
    checkpointBytes: () => readFileSync(join(journal, "checkpoint.json")),
    hasPending: () => existsSync(join(journal, "pending.json")),
    usage(entry) {
      const binding = entry.binding;
      return fixture.control.readDataPackResourceUsage({ accountId: binding.accountId,
        orderRef: binding.orderRef, requestRef: binding.requestId,
        entitlementRef: binding.entitlementId, now }).usage;
    },
    sampleTotals(entry) {
      return fixture.db.prepare(`select count(*) as count, coalesce(sum(total_bytes), 0) as bytes
        from platform_usage_samples where edge_credential_ref = ? and account_id = ?
          and entitlement_id = ? and request_id = ?`)
        .get(entry.binding.edgeCredentialRef, entry.binding.accountId,
          entry.binding.entitlementId, entry.binding.requestId);
    },
    packDesiredRows: (channel = CHANNELS[2]) => readDataPackDesiredStateRows(fixture.db, channel, Date.parse(now)),
  };
}

test("real full-metering pipeline admits new packs without historical charges, crosses month, and retains only exhausted pack", async (t) => {
  const f = pipeline(t);
  const timed = CHANNELS.map((channel) => f.add({ channel }));
  const first = f.add({ gigabytes: 100 });
  assert.equal((await f.run("initialize")).recordedBytes, 0);
  const initialCheckpoint = f.checkpoint();

  // A new pack joins an existing checkpoint. Even a large first counter is a
  // baseline; only pre-existing resources contribute to this polling interval.
  const second = f.add({ gigabytes: 200 });
  second.uploadBytes = 5000;
  second.downloadBytes = 7000;
  f.at(T1);
  for (const entry of [...timed, first]) {
    entry.uploadBytes += 5;
    entry.downloadBytes += 5;
  }
  const joined = await f.run("collect");
  assert.equal(joined.eligibleCount, 7);
  assert.equal(joined.recordedBytes, 60);
  assert.deepEqual(f.sampleTotals(second), { count: 0, bytes: 0 });
  assert.equal(f.usage(second).collectionStatus, "pending");
  assert.equal(f.usage(second).usedBytes, null);
  assert.equal(f.checkpoint().startedAt, initialCheckpoint.startedAt);

  f.at(T2);
  for (const entry of timed) { entry.uploadBytes += 5; entry.downloadBytes += 5; }
  first.uploadBytes += 7;
  first.downloadBytes += 8;
  second.uploadBytes += 2;
  second.downloadBytes += 3;
  const crossed = await f.run("collect");
  assert.equal(crossed.recordedBytes, 70);
  assert.equal(crossed.cycleBoundaryUnassignedBytes, 0);
  assert.equal(f.usage(first).usedBytes, 25);
  assert.equal(f.usage(second).usedBytes, 5);
  assert.deepEqual(f.sampleTotals(first), { count: 2, bytes: 25 });
  assert.deepEqual(f.sampleTotals(second), { count: 1, bytes: 5 });
  for (const entry of timed) assert.deepEqual(f.sampleTotals(entry), { count: 2, bytes: 20 });

  f.at(T3);
  first.uploadBytes += first.binding.quotaBytes - 25;
  second.uploadBytes += 2;
  second.downloadBytes += 2;
  for (const entry of timed) { entry.uploadBytes += 1; entry.downloadBytes += 1; }
  await f.run("collect");
  assert.equal(f.usage(first).usedBytes, first.binding.quotaBytes);
  assert.equal(f.usage(first).exhausted, true);
  assert.equal(f.usage(second).usedBytes, 9);
  assert.equal(f.usage(second).exhausted, false);
  const afterExhaustion = f.readInventory();
  assert.equal(afterExhaustion.entries.length, 6);
  assert.equal(afterExhaustion.retainedBindings.length, 1);
  assert.equal(afterExhaustion.retainedBindings[0].edgeCredentialRef, first.binding.edgeCredentialRef);
  assert.equal(afterExhaustion.retainedBindings[0].reasons.includes("quota_exhausted"), true);
  assert.deepEqual(f.packDesiredRows().activeRows.map((row) => row.edge_credential_ref), [second.binding.edgeCredentialRef]);

  // Simulate the Agent having applied removal. The strict source driver must
  // accept the missing retained identity and still meter every remaining one.
  first.runtimePresent = false;
  f.at(T4);
  second.uploadBytes += 2;
  second.downloadBytes += 2;
  for (const entry of timed) { entry.uploadBytes += 1; entry.downloadBytes += 1; }
  const continued = await f.run("collect");
  assert.equal(continued.recordedBytes, 14);
  assert.equal(continued.eligibleCount, 6);
  assert.equal(f.usage(first).usedBytes, first.binding.quotaBytes);
  assert.equal(f.usage(second).usedBytes, 13);
  for (const entry of timed) assert.deepEqual(f.sampleTotals(entry), { count: 4, bytes: 24 });
  assert.equal(f.hasPending(), false);
});

test("a source with only an exhausted retained pack does not block other metering sources", async (t) => {
  const f = pipeline(t);
  const packChannel = CHANNELS[4];
  const timed = CHANNELS.filter((channel) => channel !== packChannel).map((channel) => f.add({ channel }));
  const pack = f.add({ channel: packChannel, gigabytes: 100 });
  await f.run("initialize");

  f.at(T1);
  pack.uploadBytes += pack.binding.quotaBytes;
  for (const entry of timed) { entry.uploadBytes += 1; entry.downloadBytes += 1; }
  const exhausted = await f.run("collect");
  assert.equal(exhausted.recordedBytes, pack.binding.quotaBytes + 8);
  const exhaustedCheckpoint = f.checkpoint();
  const inventory = f.readInventory();
  assert.equal(inventory.entries.length, 4);
  assert.equal(inventory.entries.some((entry) => entry.channelRef === packChannel), false);
  assert.equal(inventory.retainedBindings.length, 1);
  assert.equal(inventory.retainedBindings[0].edgeCredentialRef, pack.binding.edgeCredentialRef);
  assert.equal(inventory.retainedBindings[0].reasons.includes("quota_exhausted"), true);
  assert.deepEqual(f.packDesiredRows(packChannel).activeRows, []);

  // This source now has no live runtime identity at all. Its retained binding
  // must preserve the inventory without requiring a timed fallback identity.
  pack.runtimePresent = false;
  f.at(T2);
  for (const entry of timed) { entry.uploadBytes += 2; entry.downloadBytes += 3; }
  const continued = await f.run("collect");
  assert.equal(continued.eligibleCount, 4);
  assert.equal(continued.recordedBytes, 20);
  assert.deepEqual(f.sampleTotals(pack), { count: 1, bytes: pack.binding.quotaBytes });
  assert.equal(f.usage(pack).exhausted, true);
  for (const entry of timed) assert.deepEqual(f.sampleTotals(entry), { count: 2, bytes: 7 });
  const continuedCheckpoint = f.checkpoint();
  assert.equal(continuedCheckpoint.startedAt, exhaustedCheckpoint.startedAt);
  assert.equal(continuedCheckpoint.sequence, exhaustedCheckpoint.sequence + 1);
  assert.deepEqual(continuedCheckpoint.sources.find((source) => source.channelRef === packChannel).identities,
    exhaustedCheckpoint.sources.find((source) => source.channelRef === packChannel).identities);
  assert.equal(continuedCheckpoint.materialContinuations, undefined);
  assert.equal(f.hasPending(), false);
});

test("pack material reset keeps ordinary full-metering collect fail-closed pending exact continuation", async (t) => {
  const f = pipeline(t);
  CHANNELS.forEach((channel) => f.add({ channel }));
  const pack = f.add({ gigabytes: 100 });
  await f.run("initialize");
  f.at(T1);
  for (const entry of f.identities) { entry.uploadBytes += 5; entry.downloadBytes += 5; }
  await f.run("collect");
  const beforeCheckpoint = f.checkpointBytes();
  const beforeUsage = f.sampleTotals(pack);
  // Simulate the durable result of a reset under the same metering principal.
  // This does not bypass or authorize the separate checkpoint continuation gate.
  // A rejection proves the safety boundary, not automatic reset continuity or
  // the product's end-to-end credential-reset acceptance.
  pack.material = { ...pack.material, password: "synthetic_reset_replacement" };
  pack.digest = materialDigest(pack.material);
  f.db.prepare(`update platform_data_pack_edge_credentials set edge_material_digest = ?
    where edge_credential_ref = ?`).run(pack.digest, pack.binding.edgeCredentialRef);
  f.at(T2);
  for (const entry of f.identities) { entry.uploadBytes += 2; entry.downloadBytes += 3; }
  await assert.rejects(f.run("collect"), { code: "full_metering_binding_changed" });
  assert.deepEqual(f.checkpointBytes(), beforeCheckpoint);
  assert.deepEqual(f.sampleTotals(pack), beforeUsage);
  assert.equal(f.usage(pack).usedBytes, 10);
  assert.equal(f.hasPending(), false);
});
