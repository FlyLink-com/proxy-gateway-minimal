import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { FULL_METERING_CHANNELS } from "../../scripts/lib/full-metering-collection.mjs";
import { createFullMeteringSourceDriver, fullMeteringRuntimeFingerprint } from "../../scripts/lib/full-metering-source-driver.mjs";
const materialDigestFor = material => `sha256:${createHash("sha256").update(material.uuid).update("\0").update(material.password).digest("hex")}`;
function fixture() {
  const records = FULL_METERING_CHANNELS.map((source, index) => {
    const material = { uuid: `uuid-${index}`, password: `password-${index}` };
    return { credentialRef: `ref-${index}`, materialDigest: materialDigestFor(material), material };
  });
  const entries = FULL_METERING_CHANNELS.map((source, index) => ({ ...source, edgeCredentialRef: records[index].credentialRef, materialDigest: records[index].materialDigest }));
  const sources = entries.map((entry, index) => ({ channelRef: entry.channelRef, kind: index < 2 ? "xray" : index < 4 ? "hy2" : "tuic", host: [1, 3].includes(index) ? "sgp" : "local", runtimeUnit: index < 2 ? "xray-vless-reality.service" : index < 4 ? "hysteria2.service" : "mihomo-tuic.service", configPath: index < 2 ? "/etc/xray/config.json" : index < 4 ? "/etc/hysteria/config.yaml" : "/etc/mihomo/config.yaml" }));
  const readSource = async source => {
    const i = sources.findIndex(row => row.channelRef === source.channelRef), record = records[i];
    return { generation: "a".repeat(64), configDigest: "b".repeat(64), observedAt: "2026-09-08T00:00:00.000Z", observations: [],
      runtimeUsers: [{ runtimeUser: source.kind === "tuic" ? record.material.uuid : record.credentialRef, materialFingerprint: fullMeteringRuntimeFingerprint(source.kind, record.material) }] };
  };
  return { entries, records, sources, readSource };
}
test("driver derives maps only from verified existing material and covers five independent sources", async () => {
  const f = fixture();
  const driver = createFullMeteringSourceDriver({ sources: f.sources, readMaterial: () => ({ records: f.records }), readSource: f.readSource });
  const result = await driver({ entries: f.entries, retainedBindings: [] });
  assert.equal(result.length, 5);
  assert.equal(result[4].mode, "connections");
  assert.equal(result[2].sourceRef, "full_metering_hy2_cumulative_v1");
});
for (const scope of ["eligible", "retained"]) {
  for (const field of ["uuid", "password"]) {
    test(`driver rejects ${scope} ${field} replacement even when stored digest labels and runtime agree`, async () => {
      const f = fixture();
      const inventory = { entries: [...f.entries], retainedBindings: [] };
      if (scope === "retained") inventory.retainedBindings.push(inventory.entries.shift());
      f.records[0].material[field] = `replacement-${field}`;
      assert.notEqual(materialDigestFor(f.records[0].material), f.records[0].materialDigest);
      const driver = createFullMeteringSourceDriver({ sources: f.sources, readMaterial: () => ({ records: f.records }), readSource: f.readSource });
      await assert.rejects(driver(inventory), { code: "full_metering_material_binding_changed" });
    });
  }
}
for (const field of ["uuid", "password"]) {
  for (const value of ["", " ", " value "]) {
    test(`driver rejects noncanonical ${field} material ${JSON.stringify(value)}`, async () => {
      const f = fixture();
      f.records[0].material[field] = value;
      f.records[0].materialDigest = materialDigestFor(f.records[0].material);
      f.entries[0].materialDigest = f.records[0].materialDigest;
      const driver = createFullMeteringSourceDriver({ sources: f.sources, readMaterial: () => ({ records: f.records }), readSource: f.readSource });
      await assert.rejects(driver({ entries: f.entries, retainedBindings: [] }), { code: "full_metering_material_invalid" });
    });
  }
}
for (const failure of ["missing-material", "changed-material", "unknown-runtime", "runtime-material", "missing-eligible", "duplicate-runtime", "source-generation"]) {
  test(`driver fails before accounting on ${failure}`, async () => {
    const f = fixture();
    if (failure === "missing-material") f.records.pop();
    if (failure === "changed-material") f.records[0].materialDigest = "changed";
    const readSource = async source => {
      const result = await f.readSource(source);
      if (failure === "unknown-runtime") result.runtimeUsers[0].runtimeUser = "unknown";
      if (failure === "runtime-material") result.runtimeUsers[0].materialFingerprint = "0".repeat(64);
      if (failure === "missing-eligible") result.runtimeUsers = [];
      if (failure === "duplicate-runtime") result.runtimeUsers.push(result.runtimeUsers[0]);
      if (failure === "source-generation") result.generation = "unproven";
      return result;
    };
    const driver = createFullMeteringSourceDriver({ sources: f.sources, readMaterial: () => ({ records: f.records }), readSource });
    await assert.rejects(driver({ entries: f.entries, retainedBindings: [] }), /^Error: full_metering_/);
  });
}
test("fingerprints expose no raw credential and have identical worker encoding", () => {
  const material = { uuid: "private-uuid", password: "private-password" };
  assert.equal(fullMeteringRuntimeFingerprint("tuic", material), createHash("sha256").update(JSON.stringify(["tuic", material.uuid, material.password])).digest("hex"));
  assert.equal(fullMeteringRuntimeFingerprint("hy2", material), createHash("sha256").update(JSON.stringify(["hy2", material.password])).digest("hex"));
});
