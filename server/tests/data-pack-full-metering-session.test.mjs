import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { packFixture, CHANNELS, NOW } from "./full-metering-data-pack-bindings.fixture.mjs";
import { createFileBackedEdgeCredentialMaterialStore } from "../services/edge/credential-material-store.mjs";
import { fullMeteringRuntimeFingerprint } from "../../scripts/lib/full-metering-source-driver.mjs";

async function fixture(t) {
  const { createDataPackFullMeteringSession } = await import("../../scripts/lib/data-pack-full-metering-session.mjs");
  const base = packFixture(t);
  const directory = mkdtempSync(join(tmpdir(), "pack-meter-session-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const materialStore = createFileBackedEdgeCredentialMaterialStore({ filePath: join(directory, "material.json") });
  const identities = [];
  for (const type of ["pack", "pack", "timed"]) {
    const material = { uuid: randomUUID(), password: randomUUID() };
    const materialDigest = `sha256:${createHash("sha256").update(material.uuid).update("\0").update(material.password).digest("hex")}`;
    const binding = type === "pack" ? base.pack({ materialDigest }) : base.timed(CHANNELS[2], { materialDigest });
    materialStore.putCredentialMaterial({ credentialRef: binding.edgeCredentialRef, materialDigest, material });
    identities.push({ ...binding, material, uploadBytes: 100, downloadBytes: 200 });
  }
  let tick = Date.parse(NOW);
  const nowFn = () => new Date(tick).toISOString();
  const transport = { evidenceMode: "synthetic_transport",
    async readMeteringSnapshot({ credentialRefByRuntimeUser }) {
      assert.equal(Object.keys(credentialRefByRuntimeUser).length, 3);
      return { generation: "a".repeat(64), configDigest: "b".repeat(64), observedAt: nowFn(),
        runtimeUsers: identities.map(item => ({ runtimeUser: item.edgeCredentialRef,
          materialFingerprint: fullMeteringRuntimeFingerprint("hy2", item.material) })),
        observations: identities.map(({ edgeCredentialRef, uploadBytes, downloadBytes }) => ({ edgeCredentialRef, uploadBytes, downloadBytes })) };
    } };
  const create = () => createDataPackFullMeteringSession({ database: base.db, controlStore: base.control,
    materialStore, transport, runDir: directory, accountId: "acct_meter_packs", ownerRef: "owner_meter_packs", nowFn });
  return { ...base, directory, create, identities, tick() { tick += 1000; }, transport };
}

test("session seeds explicit quiet synthetic channels and writes only observed Hy2 increments", async t => {
  const f = await fixture(t), session = f.create();
  t.after(() => session.close());
  assert.equal(session.evidenceMode, "full_metering_journal");
  assert.equal((await session.initialize()).recordedBytes, 0);
  f.tick(); f.identities[0].uploadBytes += 7;
  assert.equal((await session.collect()).recordedBytes, 7);
  assert.equal(f.control.listUsageSamples().length, 1);
  assert.equal(f.control.listUsageSamples()[0].requestId, f.identities[0].requestId);
  f.tick(); assert.equal((await session.collect()).recordedBytes, 0);
  session.close();
  assert.equal(f.db.prepare("SELECT 1 AS value").get().value, 1);
  await assert.rejects(() => session.collect(), { code: "data_pack_metering_session_closed" });
});

test("session rejects a pre-existing other-channel resource without creating journal", async t => {
  const f = await fixture(t);
  f.timed(CHANNELS[0]);
  assert.throws(f.create, { code: "data_pack_metering_scope_invalid" });
});

test("session rejects extra bindings after initialization and unauthorized reset callbacks", async t => {
  const f = await fixture(t), session = f.create();
  t.after(() => session.close());
  await session.initialize();
  await assert.rejects(() => session.continueReset({}), { code: "data_pack_metering_reset_invalid" });
  f.timed(CHANNELS[2]); f.tick();
  await assert.rejects(() => session.collect(), { code: "data_pack_metering_scope_invalid" });
  assert.equal(f.control.listUsageSamples().length, 0);
});

test("session refuses drift to an unselected channel before recording more traffic", async t => {
  const f = await fixture(t), session = f.create();
  t.after(() => session.close());
  await session.initialize();
  f.db.prepare("UPDATE platform_portal_edge_credentials SET edge_channel_ref='channel_not_in_scope' WHERE edge_credential_ref=?")
    .run(f.identities[2].edgeCredentialRef);
  f.tick(); f.identities[0].uploadBytes += 9;
  await assert.rejects(() => session.collect(), { code: "data_pack_metering_scope_invalid" });
  assert.equal(f.control.listUsageSamples().length, 0);
});
