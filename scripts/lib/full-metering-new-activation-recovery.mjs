// Same-scope pause recovery: initialize a new absent journal at current counters
// with zero samples. The old journal is read-only. There is no global activation
// registry; uniqueness and old-writer custody are explicit prechecks, not a
// second ledger. This module never collects, never writes the old journal, and
// never authorizes production.
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { runFullMeteringCollection } from "./full-metering-collection.mjs";
import { assertFullMeteringJournalNoPending, fullMeteringDigest, readFullMeteringJournal } from "./full-metering-journal.mjs";
import { admitFullMeteringPlanSwitches } from "./full-metering-plan-switch-continuation.mjs";
import { fullMeteringBindingIdentity } from "./full-metering-sample-writer.mjs";
import { LOCAL_METERING_SCOPE, assertFullMeteringCheckpointScope, assertFullMeteringContextScope, fullMeteringChannels } from "./full-metering-scope.mjs";

export const NEW_ACTIVATION_RECOVERY_LIMITS = Object.freeze({
  maxDurationMs: 60_000,
  maxRssBytes: 512 * 1024 * 1024,
  maxIdentities: 10_000,
  maxKnownActivations: 128
});

const fail = code => { throw Object.assign(new Error(code), { code }); };
const REF = /^[A-Za-z0-9._:-]{1,128}$/;
const HASH = /^[a-f0-9]{64}$/;
const key = entry => `${entry.channelRef}\0${entry.edgeCredentialRef}`;
const norm = value => process.platform === "win32" ? resolve(value).toLowerCase() : resolve(value);

function need(ok, code) { if (!ok) fail(code); }
function sha(bytes) { return createHash("sha256").update(bytes).digest("hex"); }

export function assertNewActivationRecoveryBounds(startedAtMs, usage = process.memoryUsage(), nowMs = Date.now()) {
  need(Number.isFinite(startedAtMs) && Number.isFinite(nowMs) && nowMs - startedAtMs <= NEW_ACTIVATION_RECOVERY_LIMITS.maxDurationMs, "full_metering_recovery_time_limit");
  need(Number.isFinite(usage?.rss) && usage.rss >= 0 && usage.rss <= NEW_ACTIVATION_RECOVERY_LIMITS.maxRssBytes, "full_metering_recovery_memory_limit");
}

function absent(path) {
  try { lstatSync(path); return false; }
  catch (error) { if (error.code === "ENOENT") return true; throw error; }
}

function directoryDigest(directory) {
  const entries = [];
  const walk = (path, rel) => {
    for (const name of readdirSync(path).sort()) {
      const child = join(path, name);
      const info = lstatSync(child);
      need(!info.isSymbolicLink(), "full_metering_path_invalid");
      const relative = rel ? `${rel}/${name}` : name;
      if (info.isDirectory()) walk(child, relative);
      else {
        need(info.isFile(), "full_metering_path_invalid");
        entries.push([relative, sha(readFileSync(child))]);
      }
    }
  };
  walk(directory, "");
  return fullMeteringDigest(entries);
}

function publicSummary(fields) {
  const summary = {
    type: "full_metering_new_activation_recovery",
    ok: true,
    historicalDebits: false,
    identitiesIssued: false,
    entitlementsChanged: false,
    oldJournalMutated: false,
    rawReturned: false,
    recoveryReady: false,
    productionWritesAuthorized: false,
    ...fields
  };
  need(!JSON.stringify(summary).includes("\u0000"), "full_metering_recovery_invalid");
  return summary;
}

export function parseFullMeteringNewActivationRecoveryCommand(argv) {
  if (!Array.isArray(argv) || !["--precheck", "--initialize-new-journal"].includes(argv[0])
    || argv.length !== 5 || argv[1] !== "--request" || argv[3] !== "--request-sha256") fail("full_metering_command_invalid");
  const requestPath = argv[2], requestSha256 = argv[4];
  need(typeof requestPath === "string" && /^\/[A-Za-z0-9_./-]+$/.test(requestPath) && !requestPath.split("/").includes("..") && !requestPath.split("/").includes("."), "full_metering_command_invalid");
  need(HASH.test(requestSha256), "full_metering_command_invalid");
  return { mode: argv[0] === "--precheck" ? "precheck" : "initialize", requestPath, requestSha256 };
}

export function validateFullMeteringNewActivationRecoveryRequest(request) {
  const linuxPath = value => typeof value === "string" && /^\/[A-Za-z0-9_./-]+$/.test(value) && !value.split("/").includes("..") && !value.split("/").includes(".");
  need(request && typeof request === "object" && !Array.isArray(request)
    && Object.keys(request).sort().join(",") === "activationUnused,knownActivationIds,meteringScope,newActivationId,newConfigPath,newConfigSha256,oldActivationId,oldContext,oldJournalDirectory,oldWriterStopped,version"
    && request.version === 1 && request.meteringScope === LOCAL_METERING_SCOPE
    && REF.test(request.oldActivationId) && REF.test(request.newActivationId)
    && request.oldActivationId !== request.newActivationId
    && linuxPath(request.oldJournalDirectory) && linuxPath(request.newConfigPath)
    && HASH.test(request.newConfigSha256)
    && request.oldWriterStopped === true && request.activationUnused === true
    && Array.isArray(request.knownActivationIds) && request.knownActivationIds.length >= 1
    && request.knownActivationIds.length <= NEW_ACTIVATION_RECOVERY_LIMITS.maxKnownActivations
    && request.knownActivationIds.every(id => REF.test(id))
    && new Set(request.knownActivationIds).size === request.knownActivationIds.length
    && request.knownActivationIds.includes(request.oldActivationId)
    && !request.knownActivationIds.includes(request.newActivationId), "full_metering_recovery_request_invalid");
  assertFullMeteringContextScope(request.oldContext, LOCAL_METERING_SCOPE);
  return request;
}

function classify({ checkpoint, inventory, channels }) {
  need(Array.isArray(inventory?.entries) && Array.isArray(inventory?.retainedBindings)
    && inventory.entries.length + inventory.retainedBindings.length <= NEW_ACTIVATION_RECOVERY_LIMITS.maxIdentities, "full_metering_binding_invalid");
  const entries = inventory.entries.map(entry => fullMeteringBindingIdentity(entry));
  const retained = inventory.retainedBindings.map(entry => ({
    channelRef: entry.channelRef, edgeCredentialRef: entry.edgeCredentialRef, materialDigest: entry.materialDigest
  }));
  const seen = new Set();
  for (const entry of [...entries, ...retained]) {
    need(channels.some(source => source.channelRef === entry.channelRef) && !seen.has(key(entry)), "full_metering_binding_invalid");
    seen.add(key(entry));
  }
  const active = new Map(entries.map(entry => [key(entry), entry]));
  const oldSeen = new Set();
  let unchanged = 0, billingChanged = 0, otherChanged = 0, missing = 0, retainedCount = 0;
  for (const source of checkpoint.sources) {
    need(Array.isArray(source.identities) && source.identities.length <= NEW_ACTIVATION_RECOVERY_LIMITS.maxIdentities, "full_metering_checkpoint_invalid");
    for (const previous of source.identities) {
      need(previous.channelRef === source.channelRef && !oldSeen.has(key(previous))
        && fullMeteringDigest(fullMeteringBindingIdentity(previous)) === fullMeteringDigest(previous), "full_metering_checkpoint_invalid");
      oldSeen.add(key(previous));
      const live = active.get(key(previous));
      if (!live) {
        const archived = retained.find(entry => key(entry) === key(previous));
        if (archived && archived.materialDigest === previous.materialDigest) retainedCount++;
        else missing++;
        continue;
      }
      if (fullMeteringDigest(live) === fullMeteringDigest(previous)) { unchanged++; continue; }
      if (fullMeteringDigest({ ...previous, billingBinding: live.billingBinding }) === fullMeteringDigest(live)) billingChanged++;
      else otherChanged++;
    }
  }
  return {
    identities: { entries, retained },
    counts: {
      eligible: entries.length,
      retained: retained.length,
      unchanged,
      billingChanged,
      otherChanged,
      missing,
      retainedMatched: retainedCount,
      newEligible: entries.filter(entry => !oldSeen.has(key(entry))).length
    }
  };
}

function precheck(input, startedAtMs) {
  assertNewActivationRecoveryBounds(startedAtMs);
  const {
    oldDirectory, oldContext, oldActivationId, newDirectory, newContext, newActivationId,
    meteringScope = LOCAL_METERING_SCOPE, oldWriterStopped, activationUnused, knownActivationIds,
    readInventory, readPlanSwitchProof, nowFn = () => new Date().toISOString()
  } = input;
  need(meteringScope === LOCAL_METERING_SCOPE, "full_metering_scope_invalid");
  need(oldWriterStopped === true, "full_metering_old_writer_active");
  need(activationUnused === true, "full_metering_activation_not_unique");
  need(REF.test(oldActivationId) && REF.test(newActivationId) && oldActivationId !== newActivationId, "full_metering_activation_reused");
  need(Array.isArray(knownActivationIds) && knownActivationIds.length >= 1
    && knownActivationIds.length <= NEW_ACTIVATION_RECOVERY_LIMITS.maxKnownActivations
    && knownActivationIds.every(id => REF.test(id))
    && new Set(knownActivationIds).size === knownActivationIds.length
    && knownActivationIds.includes(oldActivationId)
    && !knownActivationIds.includes(newActivationId), "full_metering_activation_not_unique");
  need(typeof oldDirectory === "string" && isAbsolute(oldDirectory)
    && typeof newDirectory === "string" && isAbsolute(newDirectory)
    && norm(oldDirectory) !== norm(newDirectory), "full_metering_journal_not_distinct");
  assertFullMeteringContextScope(oldContext, LOCAL_METERING_SCOPE);
  assertFullMeteringContextScope(newContext, LOCAL_METERING_SCOPE);
  need(oldContext.databaseIdentityDigest === newContext.databaseIdentityDigest, "full_metering_database_identity_changed");
  need(oldContext.scopeDigest !== newContext.scopeDigest, "full_metering_config_not_distinct");
  need(typeof readInventory === "function", "full_metering_recovery_invalid");
  need(absent(newDirectory), "full_metering_new_journal_exists");
  need(!existsSync(join(oldDirectory, "writer.lock")), "full_metering_old_writer_lock");
  assertFullMeteringJournalNoPending({ directory: oldDirectory });
  const checkpoint = readFullMeteringJournal({ directory: oldDirectory, context: oldContext });
  assertFullMeteringCheckpointScope(checkpoint, LOCAL_METERING_SCOPE);
  need(checkpoint.version === 1 && checkpoint.activationId === oldActivationId
    && Number.isSafeInteger(checkpoint.sequence) && checkpoint.sequence >= 0, "full_metering_checkpoint_invalid");
  const inventory = readInventory();
  const classified = classify({ checkpoint, inventory, channels: fullMeteringChannels(LOCAL_METERING_SCOPE) });
  need(classified.counts.otherChanged === 0 && classified.counts.missing === 0
    && classified.counts.retainedMatched === 0, "full_metering_identity_unresolved");
  const nowValue = nowFn();
  const now = nowValue instanceof Date ? nowValue.toISOString() : nowValue;
  let admitted = 0;
  if (classified.counts.billingChanged) {
    need(typeof readPlanSwitchProof === "function", "full_metering_plan_switch_unproven");
    const admission = admitFullMeteringPlanSwitches({
      checkpoint, identities: classified.identities, readPlanSwitchProof, now
    });
    need(admission.changes.size === classified.counts.billingChanged, "full_metering_plan_switch_unproven");
    admitted = admission.changes.size;
  } else if (typeof readPlanSwitchProof === "function") {
    const admission = admitFullMeteringPlanSwitches({
      checkpoint, identities: classified.identities, readPlanSwitchProof, now
    });
    need(admission.changes.size === 0, "full_metering_plan_switch_unproven");
  }
  const oldTreeDigest = directoryDigest(oldDirectory);
  assertNewActivationRecoveryBounds(startedAtMs);
  return { checkpoint, classified, admitted, oldTreeDigest, now };
}

export async function runFullMeteringNewActivationRecovery(input) {
  const startedAtMs = Date.now();
  const mode = input?.mode;
  need(mode === "precheck" || mode === "initialize", "full_metering_recovery_invalid");
  const checked = precheck(input, startedAtMs);
  const summary = publicSummary({
    status: mode === "precheck" ? "precheck_passed" : "baseline_initialized",
    mode,
    meteringScope: LOCAL_METERING_SCOPE,
    oldSequence: checked.checkpoint.sequence,
    eligible: checked.classified.counts.eligible,
    unchanged: checked.classified.counts.unchanged,
    billingChanged: checked.classified.counts.billingChanged,
    admitted: checked.admitted,
    newEligible: checked.classified.counts.newEligible,
    sampleCount: 0,
    recordedBytes: 0
  });
  if (mode === "precheck") return summary;
  need(typeof input.readSources === "function", "full_metering_recovery_invalid");
  const initialized = await runFullMeteringCollection({
    directory: input.newDirectory,
    context: input.newContext,
    activationId: input.newActivationId,
    mode: "initialize",
    meteringScope: LOCAL_METERING_SCOPE,
    nowFn: input.nowFn,
    readInventory: input.readInventory,
    readSources: input.readSources,
    readPlanSwitchProof: input.readPlanSwitchProof,
    applySamples: input.applySamples,
    onStage: input.onStage
  });
  need(initialized.status === "baseline_initialized" && initialized.sampleCount === 0
    && initialized.recordedBytes === 0 && initialized.historicalDebits === false, "full_metering_initialization_charge_forbidden");
  need(directoryDigest(input.oldDirectory) === checked.oldTreeDigest, "full_metering_old_journal_changed");
  need(!existsSync(join(input.oldDirectory, "pending.json")) && !existsSync(join(input.oldDirectory, "writer.lock")), "full_metering_old_journal_changed");
  const created = readFullMeteringJournal({ directory: input.newDirectory, context: input.newContext });
  need(created.activationId === input.newActivationId && created.sequence === 0
    && created.meteringScope === LOCAL_METERING_SCOPE, "full_metering_checkpoint_invalid");
  assertNewActivationRecoveryBounds(startedAtMs);
  return publicSummary({
    ...summary,
    status: "baseline_initialized",
    newSequence: created.sequence,
    sampleCount: initialized.sampleCount,
    recordedBytes: initialized.recordedBytes,
    pendingStartCount: initialized.pendingStartCount
  });
}
