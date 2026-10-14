import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { packFixture, CHANNELS } from "./full-metering-data-pack-bindings.fixture.mjs";
import { FULL_METERING_CHANNELS, runFullMeteringCollection } from "../../scripts/lib/full-metering-collection.mjs";
import { createFullMeteringSourceDriver, fullMeteringRuntimeFingerprint } from "../../scripts/lib/full-metering-source-driver.mjs";
import { createFullMeteringSampleWriter } from "../../scripts/lib/full-metering-sample-writer.mjs";
import { fullMeteringDigest, readFullMeteringJournal } from "../../scripts/lib/full-metering-journal.mjs";
import { createFileBackedEdgeCredentialMaterialStore } from "../services/edge/credential-material-store.mjs";
import { createDataPlaneDesiredStateNotifier } from "../services/edge/data-plane-desired-state-notifier.mjs";
import { createCoinCommerceDataPackCredentialReset } from "../services/platform/coin-commerce-data-pack-credential-reset.mjs";

const CONTEXT = { databaseIdentityDigest: "b".repeat(64), scopeDigest: "c".repeat(64) };
const RESET_PENDING = "coin_commerce_data_pack_reset_reconciliation_required";
const materialDigest = (material) => `sha256:${createHash("sha256")
  .update(material.uuid).update("\0").update(material.password).digest("hex")}`;

function fixture(t) {
  const base = packFixture(t, CHANNELS);
  const directory = mkdtempSync(join(tmpdir(), "full-metering-pack-reset-pipeline-"));
  const journal = join(directory, "journal");
  const materialPath = join(directory, "protected-material.json");
  t.after(() => rmSync(directory, { recursive: true, force: true, maxRetries: 3 }));
  const materialStore = createFileBackedEdgeCredentialMaterialStore({ filePath: materialPath });
  // Keep observations in the recent past: the actual desired-state reader also
  // uses wall-clock time. No process, network endpoint or real account is used.
  let millis = Date.now() - 60000;
  const now = () => new Date(millis).toISOString();
  const identities = [];
  let applyReceipts = 0, artifactCalls = 0;
  let sourceReadHook = null;
  const sources = FULL_METERING_CHANNELS.map((source, index) => ({
    channelRef: source.channelRef, kind: index < 2 ? "xray" : index < 4 ? "hy2" : "tuic",
    host: [1, 3].includes(index) ? "sgp" : "local",
    runtimeUnit: index < 2 ? "xray-vless-reality.service"
      : index < 4 ? "hysteria2.service" : "mihomo-tuic.service",
    configPath: `/synthetic/reset_pipeline_${index}/config`
  }));

  function add({ channel = CHANNELS[2], gigabytes } = {}) {
    const index = identities.length + 1;
    const material = { uuid: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      password: `synthetic_reset_pipeline_${index}` };
    const digest = materialDigest(material);
    const binding = gigabytes ? base.pack({ channel, gigabytes, materialDigest: digest })
      : base.timed(channel, { materialDigest: digest });
    materialStore.putCredentialMaterial({ credentialRef: binding.edgeCredentialRef,
      materialDigest: digest, material });
    const entry = { binding, uploadBytes: 100, downloadBytes: 100, runtimePresent: true };
    identities.push(entry);
    return entry;
  }

  const readInventory = () => base.read(now());
  const readSources = createFullMeteringSourceDriver({ sources,
    readMaterial: () => JSON.parse(readFileSync(materialPath, "utf8")),
    // Only the physical daemon snapshot is simulated. Identity validation,
    // collection, durable journal, sample writer and control DB are real.
    readSource: async (source) => {
      const entries = identities.filter((entry) => entry.runtimePresent
        && entry.binding.channelRef === source.channelRef);
      const snapshot = { generation: "a".repeat(64), configDigest: "d".repeat(64), observedAt: now(),
        runtimeUsers: entries.map((entry) => {
          const material = materialStore.resolveCredentialMaterial(entry.binding.edgeCredentialRef);
          return { runtimeUser: source.kind === "tuic" ? material.uuid : entry.binding.edgeCredentialRef,
            materialFingerprint: fullMeteringRuntimeFingerprint(source.kind, material) };
        }),
        observations: entries.map((entry) => ({ edgeCredentialRef: entry.binding.edgeCredentialRef,
          uploadBytes: entry.uploadBytes, downloadBytes: entry.downloadBytes,
          ...(source.kind === "tuic" ? { connectionId: `connection_${entry.binding.edgeCredentialRef}` } : {})
        })) };
      if (sourceReadHook) await sourceReadHook(source);
      return snapshot;
    }
  });
  const writer = createFullMeteringSampleWriter({ database: base.db,
    controlStore: base.control, readBindings: readInventory });
  const notifier = createDataPlaneDesiredStateNotifier({ controlStore: base.control,
    servers: CHANNELS.map((channel) => ({ name: channel, physicalNodeRef: "node_reset_pipeline",
      runtimeAdapter: "remote-data-plane-handoff" })), nowFn: now });
  const artifactRotation = { rotate(input) {
    artifactCalls += 1;
    base.control.beginCoinCommerceDataPackArtifactRotation({ ...input, now: now() });
    const leaseRef = "packrotlease_pipeline_artifact";
    let intent = base.control.claimCoinCommerceDataPackArtifactRotation({ ...input, leaseRef, now: now() });
    try {
      if (intent.status === "prepared") intent = base.control.advanceCoinCommerceDataPackArtifactRotation({
        ...input, leaseRef, stage: "escrowed", replacementArtifactRef: `artifact_${input.rotationRef}`, now: now() });
      if (intent.status === "escrowed") intent = base.control.advanceCoinCommerceDataPackArtifactRotation({
        ...input, leaseRef, stage: "switched", now: now() });
      if (intent.status === "switched") intent = base.control.advanceCoinCommerceDataPackArtifactRotation({
        ...input, leaseRef, stage: "complete", now: now() });
      return { status: intent.status, orderRef: input.orderRef };
    } finally { base.control.releaseCoinCommerceDataPackArtifactRotation({ ...input, leaseRef }); }
  } };
  // Delivery lookup and external artifact issuance are narrow synthetic ports;
  // the reset intent, proof, receipt and artifact-link lifecycle use the real DB.
  const reset = createCoinCommerceDataPackCredentialReset({ controlStore: base.control,
    materialStore, desiredStateNotifier: notifier, artifactRotation, nowFn: now,
    commerceStore: { getDeliveredOrderBinding({ accountId, orderRef }) {
      const entry = identities.find(({ binding }) => binding.orderRef === orderRef && binding.accountId === accountId);
      return entry ? { kind: "data_pack", orderRef, requestRef: entry.binding.requestId,
        entitlementRef: entry.binding.entitlementId } : null;
    } }
  });
  const scope = (entry, rotationRef) => ({ accountId: entry.binding.accountId,
    orderRef: entry.binding.orderRef, rotationRef });
  const resetState = (input) => base.control.beginCoinCommerceDataPackCredentialReset({ ...input, now: now() });

  function prepareResets(entries) {
    const inputs = entries.map((entry, index) => scope(entry, `packrot_pipeline_${identities.indexOf(entry)}_${index}`));
    for (const input of inputs) {
      assert.throws(() => reset.rotate(input), { code: RESET_PENDING });
      assert.equal(resetState(input).status, "material_committed");
    }
    for (const channel of new Set(entries.map((entry) => entry.binding.channelRef))) {
      // Explicit synthetic edge apply receipt, not physical protocol acceptance.
      // This is not a metering receipt: only the real collector may create that.
      notifier.notifyOrderLifecycle({ reason: "coin_commerce_data_pack_credential_reset",
        order: { edgeChannelRef: channel } });
      const desired = base.control.getLatestEdgeDesiredStateForChannel(channel, { nodeRef: "node_reset_pipeline" });
      base.control.recordEdgeApplyReceipt({ id: `receipt_reset_pipeline_${++applyReceipts}`,
        channelRef: channel, desiredStateRef: desired.desiredStateRef, status: "applied",
        configTestOk: true, serviceActive: true, listenerUdp443: true, appliedAt: now(), createdAt: now() });
    }
    for (const input of inputs) {
      assert.throws(() => reset.rotate(input), { code: RESET_PENDING });
      assert.equal(resetState(input).status, "edge_applied");
      assert.equal(base.control.getCoinCommerceDataPackMeteringResetReceipt({ ...input, now: now() }), null);
    }
    assert.equal(artifactCalls, 0);
    return inputs;
  }

  return { ...base, identities, add, materialStore, readInventory, prepareResets, reset, resetState, now,
    tick: () => { millis += 1000; },
    artifactCalls: () => artifactCalls,
    run: async (mode, dataPackResetStore = base.control, hooks = {}) => {
      sourceReadHook = hooks.duringSource;
      try {
        return await runFullMeteringCollection({
          directory: journal, context: CONTEXT, activationId: "synthetic_pack_reset_pipeline", mode,
          nowFn: hooks.nowFn ?? now, readInventory, readSources: async (inventory) => {
            const result = await readSources(inventory);
            if (hooks.afterSources) await hooks.afterSources();
            return result;
          }, applySamples: Object.hasOwn(hooks, "applySamples") ? hooks.applySamples : writer,
          onStage: hooks.onStage, dataPackResetStore });
      } finally { sourceReadHook = null; }
    },
    checkpoint: () => readFullMeteringJournal({ directory: journal, context: CONTEXT }),
    checkpointBytes: () => readFileSync(join(journal, "checkpoint.json")),
    hasPending: () => existsSync(join(journal, "pending.json")),
    archiveFiles: () => readdirSync(journal).filter((name) => name.startsWith("material-before-")),
    corruptRecoveryEvidence(kind) {
      const archives = readdirSync(journal).filter((name) => name.startsWith("material-before-"));
      assert.equal(archives.length, 1);
      const path = join(journal, kind === "identity_proof" ? "checkpoint.json" : archives[0]);
      if (kind === "archive_missing") { unlinkSync(path); return; }
      const envelope = JSON.parse(readFileSync(path, "utf8"));
      if (kind === "archive_changed") envelope.payload.sequence += 1;
      else {
        assert.equal(kind, "identity_proof");
        envelope.payload.dataPackResetContinuations[0].continuation.identityDigest = "f".repeat(64);
      }
      // Preserve a valid envelope checksum: recovery must validate the logical
      // preimage and identity proof, not merely reject malformed JSON/checksums.
      envelope.digest = fullMeteringDigest({ version: envelope.version,
        context: envelope.context, payload: envelope.payload });
      writeFileSync(path, JSON.stringify(envelope));
    },
    archive: (receipt) => JSON.parse(readFileSync(join(journal, receipt.continuation.archiveName), "utf8")).payload,
    receipt: (input) => base.control.getCoinCommerceDataPackMeteringResetReceipt({ ...input, now: now() }),
    usage: (entry) => base.control.readDataPackResourceUsage({ accountId: entry.binding.accountId,
      orderRef: entry.binding.orderRef, requestRef: entry.binding.requestId,
      entitlementRef: entry.binding.entitlementId, now: now() }).usage,
    totals: (entry) => base.db.prepare(`select count(*) as count, coalesce(sum(total_bytes), 0) as bytes
      from platform_usage_samples where edge_credential_ref = ? and account_id = ?
        and entitlement_id = ? and request_id = ?`).get(entry.binding.edgeCredentialRef,
      entry.binding.accountId, entry.binding.entitlementId, entry.binding.requestId)
  };
}

async function activeFixture(t, packs = 1) {
  const f = fixture(t);
  const timed = CHANNELS.map((channel) => f.add({ channel }));
  const entries = Array.from({ length: packs }, (_, index) => f.add({ gigabytes: index ? 200 : 100 }));
  await f.run("initialize");
  f.tick();
  for (const entry of f.identities) { entry.uploadBytes += 7; entry.downloadBytes += 3; }
  await f.run("collect");
  f.tick();
  return { f, timed, packs: entries };
}

test("authorized active pack reset preserves usage, establishes a zero-charge baseline, and resumes deltas", async (t) => {
  const { f, packs: [pack] } = await activeFixture(t);
  const before = f.checkpoint();
  const [input] = f.prepareResets([pack]);
  pack.uploadBytes = 5000;
  pack.downloadBytes = 7000;
  const checkpointBytes = f.checkpointBytes();
  await assert.rejects(f.run("collect"), { code: "full_metering_binding_changed" });
  assert.deepEqual(f.checkpointBytes(), checkpointBytes);
  assert.equal(f.usage(pack).usedBytes, 10);

  const result = await f.run("collect-pack-resets");
  assert.equal(result.recordedBytes, 0);
  assert.deepEqual(f.totals(pack), { count: 1, bytes: 10 });
  const receipt = f.receipt(input);
  assert.equal(receipt.version, 1);
  assert.equal(receipt.proof.rotationRef, input.rotationRef);
  assert.equal(receipt.continuation.previousSequence, before.sequence);
  assert.equal(receipt.continuation.sequence, before.sequence + 1);
  assert.deepEqual(f.archive(receipt), before);
  assert.equal(f.reset.rotate(input).status, "complete");
  assert.equal(f.artifactCalls(), 1);
  assert.equal(f.reset.rotate(input).status, "complete");
  assert.equal(f.artifactCalls(), 1);

  f.tick();
  pack.uploadBytes += 2;
  pack.downloadBytes += 4;
  assert.equal((await f.run("collect")).recordedBytes, 6);
  assert.deepEqual(f.totals(pack), { count: 2, bytes: 16 });
  assert.equal(f.usage(pack).usedBytes, 16);
  assert.equal(f.hasPending(), false);
});

test("a committed reset checkpoint with a missing control receipt retries audit without another transition or charge", async (t) => {
  const { f, packs: [pack] } = await activeFixture(t);
  const [input] = f.prepareResets([pack]);
  pack.uploadBytes = 8000;
  pack.downloadBytes = 9000;
  const previousSequence = f.checkpoint().sequence;
  let attemptedReceipts = 0;
  const auditFailure = { ...f.control, recordCoinCommerceDataPackMeteringResetReceipt() {
    attemptedReceipts += 1;
    throw new Error("synthetic metering receipt write failure");
  } };
  await assert.rejects(f.run("collect-pack-resets", auditFailure));
  assert.equal(attemptedReceipts, 1);
  assert.equal(f.checkpoint().sequence, previousSequence + 1);
  const committed = f.checkpointBytes();
  assert.equal(f.receipt(input), null);
  assert.deepEqual(f.totals(pack), { count: 1, bytes: 10 });
  assert.equal(f.hasPending(), false);
  assert.throws(() => f.reset.rotate(input), { code: RESET_PENDING });
  assert.equal(f.artifactCalls(), 0);

  await f.run("collect-pack-resets");
  assert.deepEqual(f.checkpointBytes(), committed);
  assert.equal(f.receipt(input).continuation.sequence, previousSequence + 1);
  assert.deepEqual(f.totals(pack), { count: 1, bytes: 10 });
  assert.equal(f.reset.rotate(input).status, "complete");
  f.tick();
  pack.uploadBytes += 2;
  assert.equal((await f.run("collect")).recordedBytes, 2);
  assert.deepEqual(f.totals(pack), { count: 2, bytes: 12 });
  assert.equal(f.hasPending(), false);
});

test("two pending pack resets on one source receive one bounded continuation without transferring usage", async (t) => {
  const { f, packs: [first, second] } = await activeFixture(t, 2);
  const inputs = f.prepareResets([first, second]);
  const beforeSequence = f.checkpoint().sequence;
  first.uploadBytes = 9000;
  second.downloadBytes = 11000;
  assert.equal((await f.run("collect-pack-resets")).recordedBytes, 0);
  assert.equal(f.checkpoint().sequence, beforeSequence + 1);
  for (const input of inputs) {
    assert.equal(f.receipt(input).continuation.sequence, beforeSequence + 1);
    assert.equal(f.reset.rotate(input).status, "complete");
  }
  assert.equal(f.artifactCalls(), 2);
  f.tick();
  first.uploadBytes += 3;
  second.downloadBytes += 7;
  assert.equal((await f.run("collect")).recordedBytes, 10);
  assert.deepEqual(f.totals(first), { count: 2, bytes: 13 });
  assert.deepEqual(f.totals(second), { count: 2, bytes: 17 });
  assert.equal(f.hasPending(), false);
});

test("an exhausted retained pack can reset without regaining eligibility or blocking unrelated usage", async (t) => {
  const { f, timed, packs: [exhausted, other] } = await activeFixture(t, 2);
  exhausted.uploadBytes += exhausted.binding.quotaBytes - 10;
  await f.run("collect");
  exhausted.runtimePresent = false;
  f.tick();
  const [input] = f.prepareResets([exhausted]);
  for (const entry of timed) entry.uploadBytes += 1;
  other.uploadBytes += 7;
  const result = await f.run("collect-pack-resets");
  assert.equal(result.eligibleCount, 6);
  assert.equal(result.recordedBytes, 12);
  assert.equal(f.receipt(input).proof.exhausted, true);
  assert.equal(f.usage(exhausted).usedBytes, exhausted.binding.quotaBytes);
  assert.equal(f.usage(exhausted).exhausted, true);
  assert.equal(f.usage(other).usedBytes, 17);
  assert.equal(f.readInventory().entries.some((entry) => entry.edgeCredentialRef === exhausted.binding.edgeCredentialRef), false);
  assert.equal(f.readInventory().retainedBindings.some((entry) => entry.edgeCredentialRef === exhausted.binding.edgeCredentialRef), true);
  assert.equal(f.control.getLatestEdgeDesiredStateForChannel(exhausted.binding.channelRef)
    .edgeCredentialRefs.includes(exhausted.binding.edgeCredentialRef), false);
  assert.equal(f.reset.rotate(input).status, "complete");
  f.tick();
  other.downloadBytes += 3;
  assert.equal((await f.run("collect")).recordedBytes, 3);
  assert.equal(f.usage(exhausted).usedBytes, exhausted.binding.quotaBytes);
  assert.equal(f.usage(other).usedBytes, 20);
  assert.equal(f.hasPending(), false);
});

test("pack-reset collection refuses a material change without a durable authorized reset proof", async (t) => {
  const { f, packs: [pack] } = await activeFixture(t);
  const before = f.checkpointBytes();
  const oldMaterialDigest = f.materialStore.getCredentialMaterialSummary(pack.binding.edgeCredentialRef).materialDigest;
  const material = { uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", password: "synthetic_unauthorized_change" };
  const digest = materialDigest(material);
  // Intentionally corrupt the synthetic fixture without creating a reset intent.
  f.materialStore.stageCredentialMaterialRotation({ rotationRef: "packrot_unapproved",
    credentialRef: pack.binding.edgeCredentialRef, oldMaterialDigest, newMaterialDigest: digest, material });
  f.materialStore.commitCredentialMaterialRotation({ rotationRef: "packrot_unapproved",
    credentialRef: pack.binding.edgeCredentialRef, oldMaterialDigest, newMaterialDigest: digest });
  f.db.prepare("update platform_data_pack_edge_credentials set edge_material_digest = ? where edge_credential_ref = ?")
    .run(digest, pack.binding.edgeCredentialRef);
  await assert.rejects(f.run("collect-pack-resets"), { code: "full_metering_binding_changed" });
  assert.deepEqual(f.checkpointBytes(), before);
  assert.deepEqual(f.totals(pack), { count: 1, bytes: 10 });
  assert.equal(f.hasPending(), false);
});

test("an authorized pack reset does not authorize an unrelated timed identity material change", async (t) => {
  const { f, timed: [timed], packs: [pack] } = await activeFixture(t);
  const [input] = f.prepareResets([pack]);
  const before = f.checkpointBytes();
  const oldMaterialDigest = f.materialStore.getCredentialMaterialSummary(timed.binding.edgeCredentialRef).materialDigest;
  const material = { uuid: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", password: "synthetic_unrelated_timed_change" };
  const digest = materialDigest(material);
  f.materialStore.stageCredentialMaterialRotation({ rotationRef: "packrot_unrelated_timed",
    credentialRef: timed.binding.edgeCredentialRef, oldMaterialDigest, newMaterialDigest: digest, material });
  f.materialStore.commitCredentialMaterialRotation({ rotationRef: "packrot_unrelated_timed",
    credentialRef: timed.binding.edgeCredentialRef, oldMaterialDigest, newMaterialDigest: digest });
  f.db.prepare("update platform_portal_access_requests set edge_material_digest = ? where id = ?")
    .run(digest, timed.binding.requestId);
  // Keep both authoritative timed material facts internally consistent so the
  // test reaches checkpoint authorization, rather than the reader's ambiguity guard.
  f.db.prepare("update platform_portal_edge_credentials set edge_material_digest = ? where request_id = ?")
    .run(digest, timed.binding.requestId);
  await assert.rejects(f.run("collect-pack-resets"), { code: "full_metering_binding_changed" });
  assert.deepEqual(f.checkpointBytes(), before);
  assert.deepEqual(f.totals(timed), { count: 1, bytes: 10 });
  assert.deepEqual(f.totals(pack), { count: 1, bytes: 10 });
  assert.equal(f.receipt(input), null);
  assert.equal(f.hasPending(), false);
});

for (const crashStage of ["pending_durable", "samples_committed", "checkpoint_durable"]) {
  test(`pack-reset journal recovery after ${crashStage} keeps one continuation and one copy of each usage sample`, async (t) => {
    const { f, timed: [timed], packs: [pack] } = await activeFixture(t);
    const [input] = f.prepareResets([pack]);
    const before = f.checkpoint();
    pack.uploadBytes = 12345;
    timed.uploadBytes += 9;
    const interruptedStages = [];
    await assert.rejects(f.run("collect-pack-resets", f.control, { onStage(stage) {
      interruptedStages.push(stage);
      if (stage === crashStage) throw Object.assign(new Error("synthetic journal interruption"), { code: "synthetic_journal_interruption" });
    } }), { code: "synthetic_journal_interruption" });
    assert.equal(interruptedStages.at(-1), crashStage);
    assert.equal(f.hasPending(), true);
    assert.equal(f.archiveFiles().length, 1);
    assert.equal(f.checkpoint().sequence, before.sequence + (crashStage === "checkpoint_durable" ? 1 : 0));
    assert.deepEqual(f.totals(timed), crashStage === "pending_durable"
      ? { count: 1, bytes: 10 } : { count: 2, bytes: 19 });
    assert.deepEqual(f.totals(pack), { count: 1, bytes: 10 });
    assert.equal(f.receipt(input), null);

    const recovered = await f.run("collect-pack-resets");
    assert.equal(recovered.status, "reset_receipts_recovered");
    assert.equal(recovered.recordedBytes, 0);
    assert.equal(f.checkpoint().sequence, before.sequence + 1);
    assert.equal(f.checkpoint().dataPackResetContinuations.length, 1);
    assert.equal(f.receipt(input).continuation.sequence, before.sequence + 1);
    assert.deepEqual(f.archive(f.receipt(input)), before);
    assert.deepEqual(f.totals(timed), { count: 2, bytes: 19 });
    assert.deepEqual(f.totals(pack), { count: 1, bytes: 10 });
    assert.equal(f.hasPending(), false);
    assert.equal(f.reset.rotate(input).status, "complete");
    f.tick();
    pack.uploadBytes += 3;
    timed.uploadBytes += 1;
    assert.equal((await f.run("collect")).recordedBytes, 4);
    assert.deepEqual(f.totals(timed), { count: 3, bytes: 20 });
    assert.deepEqual(f.totals(pack), { count: 2, bytes: 13 });
  });
}

test("pack-reset source material drift during observation fails before archive, checkpoint or audit writes", async (t) => {
  const { f, timed, packs: [pack] } = await activeFixture(t);
  const [input] = f.prepareResets([pack]);
  const before = f.checkpointBytes();
  const target = timed.at(-1);
  const oldMaterialDigest = f.materialStore.getCredentialMaterialSummary(target.binding.edgeCredentialRef).materialDigest;
  const material = { uuid: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", password: "synthetic_source_mid_read_drift" };
  const digest = materialDigest(material);
  let drifted = false;
  await assert.rejects(f.run("collect-pack-resets", f.control, { duringSource(source) {
    if (source.channelRef !== CHANNELS[4]) return;
    drifted = true;
    f.materialStore.stageCredentialMaterialRotation({ rotationRef: "packrot_source_drift",
      credentialRef: target.binding.edgeCredentialRef, oldMaterialDigest, newMaterialDigest: digest, material });
    f.materialStore.commitCredentialMaterialRotation({ rotationRef: "packrot_source_drift",
      credentialRef: target.binding.edgeCredentialRef, oldMaterialDigest, newMaterialDigest: digest });
  } }), { code: "full_metering_material_changed_during_read" });
  assert.equal(drifted, true);
  assert.deepEqual(f.checkpointBytes(), before);
  assert.equal(f.receipt(input), null);
  assert.deepEqual(f.totals(pack), { count: 1, bytes: 10 });
  assert.equal(f.archiveFiles().length, 0);
  assert.equal(f.hasPending(), false);
});

test("pack-reset proof drift after sources are read fails before any continuation commits", async (t) => {
  const { f, packs: [pack] } = await activeFixture(t);
  const [input] = f.prepareResets([pack]);
  const before = f.checkpointBytes();
  const original = f.control.readCoinCommerceDataPackMeteringResetProofs({ now: f.now() })[0];
  await assert.rejects(f.run("collect-pack-resets", f.control, { afterSources() {
    // Change the actual synthetic DB intent, not a caller-fabricated proof or
    // receipt. The second real proof read must detect the changed preimage.
    f.db.prepare("update platform_data_pack_credential_resets set old_edge_material_digest = ? where rotation_ref = ?")
      .run(`sha256:${"e".repeat(64)}`, input.rotationRef);
  } }), { code: "full_metering_binding_changed" });
  assert.notEqual(f.control.readCoinCommerceDataPackMeteringResetProofs({ now: f.now() })[0].oldEdgeMaterialDigest,
    original.oldEdgeMaterialDigest);
  assert.deepEqual(f.checkpointBytes(), before);
  assert.equal(f.receipt(input), null);
  assert.deepEqual(f.totals(pack), { count: 1, bytes: 10 });
  assert.equal(f.archiveFiles().length, 0);
  assert.equal(f.hasPending(), false);
});

test("a private preimage archive alone is not a committed pack reset and a later retry safely reuses it", async (t) => {
  const { f, packs: [pack] } = await activeFixture(t);
  const [input] = f.prepareResets([pack]);
  const before = f.checkpointBytes();
  const previousSequence = f.checkpoint().sequence;
  pack.uploadBytes = 5555;
  // Reject at the journal's batch validation, after archive creation but before
  // pending intent. This injects only a local writer dependency failure.
  await assert.rejects(f.run("collect-pack-resets", f.control, { applySamples: null }),
    { code: "full_metering_batch_invalid" });
  const archives = f.archiveFiles();
  assert.equal(archives.length, 1);
  assert.deepEqual(f.checkpointBytes(), before);
  assert.equal(f.hasPending(), false);
  assert.equal(f.receipt(input), null);
  assert.deepEqual(f.totals(pack), { count: 1, bytes: 10 });
  assert.throws(() => f.reset.rotate(input), { code: RESET_PENDING });
  assert.equal(f.artifactCalls(), 0);

  assert.equal((await f.run("collect-pack-resets")).recordedBytes, 0);
  assert.equal(f.checkpoint().sequence, previousSequence + 1);
  assert.deepEqual(f.archiveFiles(), archives);
  assert.equal(f.receipt(input).continuation.sequence, previousSequence + 1);
  assert.deepEqual(f.totals(pack), { count: 1, bytes: 10 });
  assert.equal(f.reset.rotate(input).status, "complete");
  assert.equal(f.hasPending(), false);
});

for (const [kind, expectedCode] of [
  ["archive_missing", "ENOENT"],
  ["archive_changed", "full_metering_material_archive_changed"],
  ["identity_proof", "full_metering_pack_reset_history_invalid"]
]) {
  test(`missing audit receipt cannot be repaired with corrupt recovery evidence: ${kind}`, async (t) => {
    const { f, packs: [pack] } = await activeFixture(t);
    const [input] = f.prepareResets([pack]);
    let attemptedReceipts = 0;
    await assert.rejects(f.run("collect-pack-resets", { ...f.control,
      recordCoinCommerceDataPackMeteringResetReceipt() {
        attemptedReceipts += 1;
        throw Object.assign(new Error("synthetic audit unavailable"), { code: "synthetic_audit_unavailable" });
      }
    }), { code: "synthetic_audit_unavailable" });
    assert.equal(attemptedReceipts, 1);
    assert.equal(f.checkpoint().dataPackResetContinuations.length, 1);
    assert.equal(f.hasPending(), false);
    f.corruptRecoveryEvidence(kind);
    const corruptedCheckpoint = f.checkpointBytes();
    const originalTotals = f.identities.map((entry) => f.totals(entry));
    let sourceReads = 0;
    await assert.rejects(f.run("collect-pack-resets", f.control, {
      duringSource() { sourceReads += 1; }
    }), { code: expectedCode });
    assert.equal(sourceReads, 0);
    assert.equal(f.receipt(input), null);
    assert.deepEqual(f.checkpointBytes(), corruptedCheckpoint);
    assert.deepEqual(f.identities.map((entry) => f.totals(entry)), originalTotals);
    assert.equal(f.usage(pack).usedBytes, 10);
    assert.equal(f.hasPending(), false);
    assert.throws(() => f.reset.rotate(input), { code: RESET_PENDING });
    assert.equal(f.artifactCalls(), 0);
  });
}

test("acknowledged but unfinished pack reset continues ordinary deltas without a second material boundary", async (t) => {
  const { f, packs: [pack] } = await activeFixture(t);
  const [input] = f.prepareResets([pack]);
  pack.uploadBytes = 7000;
  await f.run("collect-pack-resets");
  const receipt = f.receipt(input);
  const checkpoint = f.checkpoint();
  const boundaries = checkpoint.sources.map((source) => source.counterState.materialBoundaries);
  assert.equal(f.resetState(input).status, "edge_applied");
  assert.equal(f.artifactCalls(), 0);

  for (let iteration = 1; iteration <= 2; iteration += 1) {
    f.tick();
    pack.uploadBytes += 3;
    const result = await f.run("collect-pack-resets");
    assert.equal(result.recordedBytes, 3);
    assert.equal(result.dataPackResetContinuation, undefined);
    const current = f.checkpoint();
    assert.equal(current.sequence, checkpoint.sequence + iteration);
    assert.deepEqual(current.dataPackResetContinuations, checkpoint.dataPackResetContinuations);
    assert.deepEqual(current.sources.map((source) => source.counterState.materialBoundaries), boundaries);
    assert.deepEqual(f.receipt(input), receipt);
    assert.equal(f.usage(pack).usedBytes, 10 + iteration * 3);
    assert.equal(f.hasPending(), false);
  }
  assert.equal(f.archiveFiles().length, 1);
  assert.equal(f.reset.rotate(input).status, "complete");
});

test("a newly issued pack reset absent from the prior checkpoint takes its first zero-charge baseline", async (t) => {
  const f = fixture(t);
  CHANNELS.forEach((channel) => f.add({ channel }));
  await f.run("initialize");
  f.tick();
  const pack = f.add({ gigabytes: 100 });
  const before = f.checkpoint();
  assert.equal(before.sources.some((source) => source.identities
    .some((identity) => identity.edgeCredentialRef === pack.binding.edgeCredentialRef)), false);
  const [input] = f.prepareResets([pack]);
  pack.uploadBytes = 5000;
  pack.downloadBytes = 8000;
  assert.equal((await f.run("collect-pack-resets")).recordedBytes, 0);
  assert.deepEqual(f.totals(pack), { count: 0, bytes: 0 });
  assert.equal(f.usage(pack).usedBytes, null);
  assert.equal(f.receipt(input).continuation.previousSequence, before.sequence);
  assert.deepEqual(f.archive(f.receipt(input)), before);
  assert.equal(f.reset.rotate(input).status, "complete");

  f.tick();
  pack.uploadBytes += 2;
  pack.downloadBytes += 3;
  assert.equal((await f.run("collect")).recordedBytes, 5);
  assert.deepEqual(f.totals(pack), { count: 1, bytes: 5 });
  assert.equal(f.usage(pack).usedBytes, 5);
  assert.equal(f.hasPending(), false);
});
test("a moving clock writes the reset receipt after its durable continuation without waiting for a retry", async (t) => {
  const { f, packs: [pack] } = await activeFixture(t);
  const [input] = f.prepareResets([pack]);
  let clockReads = 0;
  const result = await f.run("collect-pack-resets", f.control, { nowFn: () => {
    clockReads += 1; f.tick(); return f.now();
  } });
  assert.equal(result.recordedBytes, 0);
  assert.ok(clockReads >= 4);
  assert.equal(f.receipt(input).continuation.sequence, f.checkpoint().sequence);
  assert.equal(f.usage(pack).usedBytes, 10);
  assert.equal(f.reset.rotate(input).status, "complete");
  assert.equal(f.hasPending(), false);
});
