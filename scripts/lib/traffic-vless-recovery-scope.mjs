import { basename, dirname } from "node:path";
import { readRecoveryJson, recoveryAbsolutePath, recoveryReject, assertRecoveryDirectory, writeRecoveryJson } from "./traffic-recovery-protected-files.mjs";
import { admitTrafficVlessBaseline, inspectTrafficVlessBaseline } from "./traffic-vless-recovery-baseline.mjs";
import { readBaselineEnvelope, readAppliedBaselineReceipt, validateRecoveryChannels, validateVlessRecoveryRequest } from "../traffic-vless-recovery.mjs";

function keys(value, allowed) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((key) => !allowed.includes(key))) recoveryReject();
}
const refs = (value) => Array.isArray(value) ? value : typeof value === "string" ? value.split(",").map((ref) => ref.trim()).filter(Boolean) : [];
export function loadTrafficVlessRecoveryScope({ path, env, nowFn = () => new Date(), batch }) {
  const packet = readRecoveryJson(path);
  const config = packet.value;
  keys(config, ["schemaVersion", "collectionScope", "planFile", "planFileSha256", "validUntil", "statusFile"]);
  keys(config.collectionScope, ["channelRefs", "protocol", "lifecycleMode"]);
  if (config.schemaVersion !== 1 || config.collectionScope.protocol !== "vless" || config.collectionScope.lifecycleMode !== "record-only") recoveryReject();
  const channelRefs = validateRecoveryChannels(config.collectionScope.channelRefs);
  const envelope = readBaselineEnvelope(config.planFile, config.planFileSha256);
  const request = validateVlessRecoveryRequest(envelope.request);
  if (JSON.stringify(channelRefs) !== JSON.stringify(validateRecoveryChannels(request.channelRefs))) recoveryReject();
  if (recoveryAbsolutePath(env.SUBSCRIPTION_CONTROL_DB_PATH) !== request.dbPath) recoveryReject();
  const now = nowFn().getTime();
  const preparedAt = Date.parse(envelope.privatePlan.preparedAt);
  const until = Date.parse(config.validUntil);
  if (!Number.isFinite(now) || !Number.isFinite(preparedAt) || !Number.isFinite(until)
    || now < preparedAt || now >= until || until > preparedAt + 24 * 3600 * 1000) recoveryReject();
  readAppliedBaselineReceipt(config.planFile, config.planFileSha256, envelope.privatePlan.planDigest);
  const configured = env.EDGE_XRAY_USAGE_SOURCES_JSON || env.EDGE_XRAY_STATS_SOURCES_JSON;
  const sources = configured ? JSON.parse(configured) : [{
    xrayBinary: env.EDGE_XRAY_BINARY,
    statsServer: env.EDGE_XRAY_STATS_SERVER || env.EDGE_XRAY_STATS_API_SERVER,
    channelRefs: refs(env.EDGE_XRAY_USAGE_CHANNEL_REFS || env.EDGE_XRAY_STATS_CHANNEL_REFS)
  }];
  if (!Array.isArray(sources)) recoveryReject();
  for (const expected of request.sources) {
    const matches = sources.filter((source) => source && refs(source.channelRefs ?? source.channelRef).includes(expected.channelRef));
    if (matches.length !== 1) recoveryReject();
    const source = matches[0];
    if (refs(source.channelRefs ?? source.channelRef).length !== 1
      || (source.statsServer || source.server) !== expected.statsServer
      || (source.xrayBinary || env.EDGE_XRAY_BINARY) !== expected.xrayBinary) recoveryReject();
  }
  const admission = admitTrafficVlessBaseline({ dbPath: request.dbPath, plan: envelope.privatePlan, expectedPlanDigest: envelope.privatePlan.planDigest, nowFn });
  if (!admission.ok) recoveryReject();
  const retainedObservationKeys = [];
  if (batch !== undefined) {
    // A disappearing whole user is not idle evidence. Validate the complete
    // private binding/counter set again after all reads, before any recording.
    if (!Array.isArray(batch) || batch.length !== channelRefs.length) recoveryReject();
    const inventory = inspectTrafficVlessBaseline({ dbPath: request.dbPath, channelRefs, retentionPolicy: request.retentionPolicy, nowFn });
    if (!inventory.ok) recoveryReject();
    for (const field of ["bindingDigest", "databaseIdentityDigest", "schemaDigest", ...(request.schemaVersion === 2 ? ["retentionDigest"] : [])]) {
      if (inventory.privateInventory[field] !== envelope.privatePlan[field]) recoveryReject();
    }
    const key = (entry) => `${entry.sourceRef}\0${entry.channelRef}\0${entry.edgeCredentialRef}`;
    const expected = new Map(inventory.privateInventory.entries.map((entry) => [key(entry), entry.cursor]));
    const retained = new Set((inventory.privateInventory.retainedBindings || []).map(key));
    const seen = new Set();
    let eligibleSeen = 0;
    const seenChannels = new Set();
    for (const entry of batch) {
      if (!channelRefs.includes(entry.channelRef) || seenChannels.has(entry.channelRef)
        || entry.collected?.accountingMode !== "cumulative" || !Array.isArray(entry.collected?.observations)) recoveryReject();
      seenChannels.add(entry.channelRef);
      for (const observation of entry.collected.observations) {
        const id = key(observation);
        const cursor = expected.get(id);
        if ((!cursor && !retained.has(id)) || seen.has(id) || observation.channelRef !== entry.channelRef
          || !Number.isSafeInteger(observation.uploadBytes) || !Number.isSafeInteger(observation.downloadBytes)
          || !Number.isSafeInteger(observation.uploadBytes + observation.downloadBytes)
          || observation.uploadBytes < 0 || observation.downloadBytes < 0
          || (cursor && (observation.uploadBytes < cursor.uploadBytes || observation.downloadBytes < cursor.downloadBytes
            || Date.parse(observation.observedAt) < Date.parse(cursor.observedAt)))
          || !Number.isFinite(Date.parse(observation.observedAt))
          || Date.parse(observation.observedAt) > nowFn().getTime()) recoveryReject();
        seen.add(id);
        if (cursor) eligibleSeen++;
        else retainedObservationKeys.push(id);
      }
    }
    if (eligibleSeen !== expected.size) recoveryReject();
  }
  const statusFile = recoveryAbsolutePath(config.statusFile);
  if (basename(statusFile) !== "vless-recovery-status.json" || statusFile === env.EDGE_USAGE_COLLECTOR_STATUS_PATH) recoveryReject();
  assertRecoveryDirectory(dirname(statusFile));
  try { if (readRecoveryJson(statusFile).value.type !== "traffic_vless_recovery_status") recoveryReject(); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  return { collectionScope: Object.freeze({ channelRefs: Object.freeze(channelRefs), protocol: "vless", lifecycleMode: "record-only" }),
    ...(request.schemaVersion === 2 ? { retentionPolicy: request.retentionPolicy,
      retainedBindingCount: envelope.privatePlan.retainedBindings.length, retainedObservationKeys: Object.freeze(retainedObservationKeys) } : {}),
    statusFile, baselinePlanDigest: envelope.privatePlan.planDigest, packetSha256: packet.sha256 };
}
export function writeTrafficVlessRecoveryStatus(path, value) {
  return writeRecoveryJson(path, value, { replace: true });
}
