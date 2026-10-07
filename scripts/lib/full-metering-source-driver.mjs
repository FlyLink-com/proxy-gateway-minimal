import { createHash } from "node:crypto";
import { FULL_METERING_CHANNELS } from "./full-metering-collection.mjs";
import { fullMeteringDigest } from "./full-metering-journal.mjs";

const fail = code => { throw Object.assign(new Error(code), { code }); };
const REF = /^[A-Za-z0-9._:-]{1,128}$/;
const HASH = /^[a-f0-9]{64}$/;
export function fullMeteringRuntimeFingerprint(kind, material) {
  if (!["xray", "hy2", "tuic"].includes(kind) || !material || [material.uuid, material.password].some(value => typeof value !== "string" || !value || value.trim() !== value || value.length > 1024)) fail("full_metering_material_invalid");
  return createHash("sha256").update(JSON.stringify([kind, kind === "hy2" ? material.password : material.uuid, ...(kind === "tuic" ? [material.password] : [])])).digest("hex");
}
export function createFullMeteringSourceDriver({ sources, readMaterial, readSource }) {
  if (!Array.isArray(sources) || sources.length !== 5 || typeof readMaterial !== "function" || typeof readSource !== "function") fail("full_metering_driver_invalid");
  const fixed = FULL_METERING_CHANNELS.map(expected => {
    const matches = sources.filter(source => source.channelRef === expected.channelRef);
    if (matches.length !== 1) fail("full_metering_source_scope_invalid");
    const source = matches[0];
    const kind = expected.sourceRef.includes("xray") ? "xray" : expected.mode === "connections" ? "tuic" : "hy2";
    const host = expected.channelRef.startsWith("channel-sgp-") ? "sgp" : "local";
    const runtimeUnit = kind === "xray" ? "xray-vless-reality.service" : kind === "hy2" ? "hysteria2.service" : "mihomo-tuic.service";
    if (Object.keys(source).sort().join(",") !== "channelRef,configPath,host,kind,runtimeUnit"
      || source.host !== host || source.kind !== kind || source.runtimeUnit !== runtimeUnit
      || typeof source.configPath !== "string" || !/^\/[A-Za-z0-9_./-]+$/.test(source.configPath) || source.configPath.includes("..")) fail("full_metering_source_scope_invalid");
    return { ...source, ...expected };
  });
  return async function readFullMeteringSources(inventory) {
    const materialPayload = readMaterial();
    const records = Array.isArray(materialPayload) ? materialPayload : materialPayload?.records;
    if (!Array.isArray(records) || records.length > 100000) fail("full_metering_material_invalid");
    const material = new Map();
    for (const record of records) {
      if (!REF.test(record?.credentialRef || "") || material.has(record.credentialRef)) fail("full_metering_material_invalid");
      material.set(record.credentialRef, record);
    }
    const output = [];
    for (const source of fixed) {
      const eligible = inventory.entries.filter(entry => entry.channelRef === source.channelRef);
      const retained = inventory.retainedBindings.filter(entry => entry.channelRef === source.channelRef);
      const superseded = new Set(retained.filter(entry => entry.reasons?.includes("portal_durable_scope_supersedes_primary"))
        .map(entry => entry.edgeCredentialRef));
      const credentialRefByRuntimeUser = Object.create(null), fingerprints = new Map();
      for (const entry of [...eligible, ...retained]) {
        const record = material.get(entry.edgeCredentialRef);
        if (!record && retained.includes(entry)) continue; // Not an active runtime identity proof.
        if (!record || record.materialDigest !== entry.materialDigest) fail("full_metering_material_binding_changed");
        const fingerprint = fullMeteringRuntimeFingerprint(source.kind, record.material);
        // Match the issuer's digest of canonical material, not only the stored
        // labels: a reused ref must not authorize replacement runtime material.
        const materialDigest = `sha256:${createHash("sha256").update(record.material.uuid).update("\0").update(record.material.password).digest("hex")}`;
        if (materialDigest !== record.materialDigest || materialDigest !== entry.materialDigest) fail("full_metering_material_binding_changed");
        const user = source.kind === "tuic" ? record.material.uuid : record.credentialRef;
        if (Object.hasOwn(credentialRefByRuntimeUser, user)) fail("full_metering_material_ambiguous");
        credentialRefByRuntimeUser[user] = entry.edgeCredentialRef;
        fingerprints.set(user, fingerprint);
      }
      const result = await readSource({ ...source, credentialRefByRuntimeUser });
      if (!HASH.test(result?.generation || "") || !HASH.test(result?.configDigest || "")
        || !Array.isArray(result.runtimeUsers) || result.runtimeUsers.length > 100000) fail("full_metering_runtime_unproven");
      const seen = new Set(), covered = new Set();
      for (const runtime of result.runtimeUsers) {
        if (!runtime || typeof runtime.runtimeUser !== "string" || seen.has(runtime.runtimeUser)
          || !Object.hasOwn(credentialRefByRuntimeUser, runtime.runtimeUser)
          || runtime.materialFingerprint !== fingerprints.get(runtime.runtimeUser)) fail("full_metering_runtime_identity_changed");
        // Historical retention is not permission to leave a removed channel
        // running without billing. Reconcile runtime separately; never ignore it.
        if (superseded.has(credentialRefByRuntimeUser[runtime.runtimeUser])) fail("full_metering_superseded_identity_running");
        seen.add(runtime.runtimeUser); covered.add(credentialRefByRuntimeUser[runtime.runtimeUser]);
      }
      if (eligible.some(entry => !covered.has(entry.edgeCredentialRef))) fail("full_metering_runtime_identity_missing");
      output.push({ channelRef: source.channelRef, sourceRef: source.sourceRef, mode: source.mode,
        generation: result.generation, observedAt: result.observedAt, observations: result.observations });
    }
    if (fullMeteringDigest(readMaterial()) !== fullMeteringDigest(materialPayload)) fail("full_metering_material_changed_during_read");
    return output;
  };
}
