// One cutover coordinator. It reuses the journal writer lock and does not run at process start.
import { closeSync, existsSync, fsyncSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import {
  describeFullMeteringPending, fullMeteringDigest, readFullMeteringJournal, recoverFullMeteringJournal,
  admitPreRatingSwitchPending, withFullMeteringJournalLock
} from "./full-metering-journal.mjs";
import { usageCycleForBinding } from "../../server/services/platform/usage-billing-cycle.mjs";
import {
  activatePendingProtocolRatingPolicy, applyProtocolTrafficRatingMigration, assertRawOnlyRollbackAllowed,
  inspectProtocolTrafficRating, readProtocolRatingStatus, recordProtocolRatingBaseline
} from "../../server/services/platform/protocol-traffic-rating.mjs";
import { createSqliteSubscriptionControlStore } from "../../server/services/platform/subscription-control-db.mjs";
import { createFullMeteringSampleWriter } from "./full-metering-sample-writer.mjs";
import { fullMeteringChannels, validateFullMeteringContext } from "./full-metering-scope.mjs";
import { readFullMeteringBindings } from "./traffic-vless-recovery-baseline.mjs";

const fail = (code) => { throw Object.assign(new Error(code), { code }); };
const RECORD = "rating-lifecycle.json";
const ORDER = Object.freeze(["inspect", "migrate", "drain", "baseline", "activate"]);

function pendingPath(directory) {
  return join(directory, "pending.json");
}

function readRecord(directory, scopeDigest) {
  const path = join(directory, RECORD);
  if (!existsSync(path)) return { version: 1, kind: "protocol-rating-lifecycle", scopeDigest, stages: {} };
  let parsed;
  try { parsed = JSON.parse(readFileSync(path, "utf8")); } catch { fail("rating_lifecycle_record_invalid"); }
  const { digest, ...body } = parsed || {};
  if (digest !== fullMeteringDigest(body) || body.kind !== "protocol-rating-lifecycle" || body.version !== 1) {
    fail("rating_lifecycle_record_invalid");
  }
  if (body.scopeDigest !== scopeDigest) fail("rating_lifecycle_conflict");
  return body;
}

function syncDirectory(directory) {
  // Windows cannot fsync a directory. A thrown test hook is a process-crash
  // window, not a power-loss proof. Parent-sync failure happens after rename,
  // so the new file is already visible and is not rolled back.
  if (process.platform === "win32") return;
  const fd = openSync(directory, "r");
  try { fsyncSync(fd); } finally { closeSync(fd); }
}

function writeRecord(directory, record, input = null) {
  const body = { version: 1, kind: "protocol-rating-lifecycle", scopeDigest: record.scopeDigest, stages: record.stages };
  const bytes = Buffer.from(JSON.stringify({ ...body, digest: fullMeteringDigest(body) }));
  const temporary = join(directory, `.${RECORD}.${randomUUID()}.tmp`);
  const fd = openSync(temporary, "wx", 0o600);
  try { writeFileSync(fd, bytes); fsyncSync(fd); }
  finally { closeSync(fd); }
  const fault = input?.persistFault || null;
  if (fault) input.persistFault = null;
  try {
    if (fault === "before-rename") fail("persist_before_rename");
    renameSync(temporary, join(directory, RECORD));
    if (fault === "parent-sync") fail("persist_parent_sync");
    syncDirectory(directory);
  } catch (error) {
    if (existsSync(temporary)) {
      try { unlinkSync(temporary); } catch { /* keep the original persist error */ }
    }
    throw error;
  }
}

function checkpointDigest(directory, context) {
  return fullMeteringDigest(readFullMeteringJournal({ directory, context }));
}

function entitlementCycle(db, entitlementId, boundaryObservedAt) {
  const row = db.prepare("select plan, valid_from as validFrom, valid_until as validUntil from platform_entitlements where id = ?").get(entitlementId);
  const cycle = row ? usageCycleForBinding(row, boundaryObservedAt) : null;
  if (!cycle) fail("rating_lifecycle_cycle_conflict");
  return { cycleKey: cycle.cadence === "lifetime" ? "lifetime" : cycle.startedAt, windowStartedAt: cycle.startedAt };
}

function performInspect(input) {
  const impact = inspectProtocolTrafficRating(input.db);
  const pending = describeFullMeteringPending({ directory: input.directory, context: input.context });
  return {
    schema: impact.schema,
    reason: impact.reason,
    checksum: impact.checksum,
    pending: pending.state,
    checkpointDigest: checkpointDigest(input.directory, input.context)
  };
}

function performMigrate(input, record) {
  const impact = inspectProtocolTrafficRating(input.db);
  if (impact.schema === "partial") fail("rating_partial_schema");
  if (impact.schema === "checksum_mismatch") fail("rating_checksum_mismatch");
  if (!record.stages.inspect) fail("rating_lifecycle_order");
  const applied = applyProtocolTrafficRatingMigration(input.db, { now: input.now });
  return { id: applied.id, checksum: applied.checksum };
}

function formalRecoveryWriter(input) {
  const scope = validateFullMeteringContext(input.context);
  const channelRefs = fullMeteringChannels(scope).map((source) => source.channelRef);
  // The store borrows the caller connection. Its constructor lowers the busy
  // timeout; the formal entry keeps the longer operator timeout.
  const controlStore = createSqliteSubscriptionControlStore({ database: input.db, initializeSchema: false });
  input.db.pragma("busy_timeout = 5000");
  const readBindings = () => readFullMeteringBindings({
    db: input.db,
    databaseIdentityDigest: input.context.databaseIdentityDigest,
    channelRefs,
    now: input.now
  });
  return createFullMeteringSampleWriter({ database: input.db, controlStore, readBindings, meteringScope: scope });
}

function performDrain(input) {
  const described = describeFullMeteringPending({ directory: input.directory, context: input.context });
  if (described.state === "invalid") fail("full_metering_intent_invalid");
  if (described.state === "v1" && input.legacyPayloadDigest !== described.payloadDigest) fail("full_metering_legacy_unadmitted");
  if (input.formal === true && described.state === "v2" && input.legacyPayloadDigest != null) fail("rating_operator_rejected");
  let applySamples = input.applySamples;
  if (described.state !== "absent" && input.formal === true) {
    if (typeof input.applySamples === "function") fail("rating_operator_rejected");
    applySamples = formalRecoveryWriter(input);
  }
  if (described.state !== "absent" && typeof applySamples !== "function") fail("rating_lifecycle_writer_required");
  if (described.state === "v1") {
    admitPreRatingSwitchPending({ directory: input.directory, context: input.context });
  }
  const recovered = described.state !== "absent";
  if (recovered) {
    recoverFullMeteringJournal({
      directory: input.directory, context: input.context, applySamples
    });
  }
  if (existsSync(pendingPath(input.directory))) fail("rating_lifecycle_pending_present");
  const checkpoint = readFullMeteringJournal({ directory: input.directory, context: input.context });
  return {
    recovered,
    checkpointDigest: fullMeteringDigest(checkpoint),
    channels: Array.isArray(checkpoint.channels) ? [...checkpoint.channels] : [],
    simultaneousProtocolSwitch: false
  };
}

function checkedBaselines(input) {
  if (!Array.isArray(input.baselines)) fail("rating_lifecycle_baseline_required");
  return input.baselines.map((item) => {
    const cycle = entitlementCycle(input.db, item.entitlementId, item.boundaryObservedAt);
    if (item.cycleKey !== cycle.cycleKey || item.windowStartedAt !== cycle.windowStartedAt) fail("rating_lifecycle_cycle_conflict");
    return { item, cycleKey: cycle.cycleKey };
  });
}

function baselineIdentity(item) {
  return [item.accountId, item.entitlementId, item.requestId, item.cycleKey, item.boundaryObservedAt].join("\0");
}

function baselineSignature(resources) {
  return resources.map((item) => `${baselineIdentity(item)}\0${item.observation}`).sort().join("|");
}

function performBaseline(input, record) {
  if (existsSync(pendingPath(input.directory))) fail("rating_lifecycle_pending_present");
  // The first record is bound to the drained checkpoint. A later call may append a
  // new resource or cycle after that checkpoint has moved. It cannot drop or retarget one.
  if (!record.stages.baseline && checkpointDigest(input.directory, input.context) !== record.stages.drain?.checkpointDigest) {
    fail("rating_lifecycle_conflict");
  }
  const checked = checkedBaselines(input);
  const previous = record.stages.baseline?.resources || [];
  const nextKeys = new Set(checked.map(({ item }) => baselineIdentity(item)));
  for (const item of previous) {
    if (!nextKeys.has(baselineIdentity(item))) fail("rating_lifecycle_conflict");
  }
  for (const { item } of checked) {
    const stored = previous.find((row) => baselineIdentity(row) === baselineIdentity(item));
    if (stored && stored.observation !== item.observation) fail("rating_baseline_conflict");
  }
  const policyVersion = readProtocolRatingStatus(input.db).active?.version ?? 0;
  const resources = [];
  const ordered = [...checked].sort((left, right) => {
    const leftKnown = previous.some((row) => baselineIdentity(row) === baselineIdentity(left.item));
    const rightKnown = previous.some((row) => baselineIdentity(row) === baselineIdentity(right.item));
    return leftKnown === rightKnown ? 0 : leftKnown ? -1 : 1;
  });
  for (const { item } of ordered) {
    recordProtocolRatingBaseline(input.db, { ...item, policyVersion, now: input.now });
    resources.push({
      accountId: item.accountId, entitlementId: item.entitlementId, requestId: item.requestId,
      cycleKey: item.cycleKey, observation: item.observation, boundaryObservedAt: item.boundaryObservedAt
    });
  }
  return { resources };
}

function policyIdentity(db, status) {
  return db.prepare("select version, policy_digest from platform_protocol_rating_policies where status = ?").get(status) || null;
}

function activationReceipt(intent) {
  return {
    policyVersion: intent.targetVersion,
    policyDigest: intent.policyDigest,
    checkpointDigest: intent.checkpointDigest,
    channels: [...intent.channels],
    simultaneousProtocolSwitch: false
  };
}

function sameActivation(stage, intent) {
  return stage?.policyVersion === intent.targetVersion
    && stage?.policyDigest === intent.policyDigest
    && stage?.checkpointDigest === intent.checkpointDigest;
}

const FORMAL_HOOKS = Object.freeze(["persistFault", "beforeActivateDb", "beforeRecord", "onStage", "applySamples"]);

function assertFormalRequest(input) {
  for (const key of FORMAL_HOOKS) {
    if (Object.hasOwn(input, key) && input[key] != null) fail("rating_operator_rejected");
  }
  if (typeof input.expectedCheckpointDigest !== "string" || !/^[a-f0-9]{64}$/.test(input.expectedCheckpointDigest)) {
    fail("rating_operator_rejected");
  }
}

function sameFormalIntent(intent, version, digest, previous, checkpoint) {
  return intent?.targetVersion === version && intent?.policyDigest === digest
    && intent?.expectedActiveVersion === previous && intent?.checkpointDigest === checkpoint;
}

function assertFormalActivationTarget(input, record) {
  const version = input.expectedPolicyVersion;
  const digest = input.expectedPolicyDigest;
  const previous = input.expectedActiveVersion;
  if (!Number.isInteger(version) || version < 1 || typeof digest !== "string" || !/^[a-f0-9]{64}$/.test(digest)
    || !(previous === null || (Number.isInteger(previous) && previous >= 1))) fail("rating_operator_rejected");
  const stage = record.stages.activate;
  const intent = record.stages.activateIntent;
  const checkpoint = input.expectedCheckpointDigest;
  // An unfinished intent is the only target, whether it is the first window or a
  // later one. A completed receipt may open the next window only after the
  // checkpoint moves and the live active and pending rows match the request.
  if (intent && !sameActivation(stage, intent)) {
    if (!sameFormalIntent(intent, version, digest, previous, checkpoint)) fail("rating_lifecycle_conflict");
    return;
  }
  if (stage && stage.policyVersion === version && stage.policyDigest === digest && stage.checkpointDigest === checkpoint) return;
  if (stage) {
    if (stage.checkpointDigest === checkpoint || Number(stage.policyVersion) !== previous) fail("rating_lifecycle_conflict");
    let pending;
    let active;
    try {
      pending = policyIdentity(input.db, "pending");
      active = policyIdentity(input.db, "active");
    } catch (error) {
      if (typeof error?.code === "string" && error.code.startsWith("rating_")) throw error;
      fail("rating_schema_required");
    }
    const activeVersion = active ? Number(active.version) : null;
    if (!active || activeVersion !== previous || active.policy_digest !== stage.policyDigest) fail("rating_lifecycle_conflict");
    if (!pending || Number(pending.version) !== version || pending.policy_digest !== digest
      || Number(pending.version) === Number(stage.policyVersion)) fail("rating_lifecycle_conflict");
    return;
  }
  let pending;
  let active;
  try {
    pending = policyIdentity(input.db, "pending");
    active = policyIdentity(input.db, "active");
  } catch (error) {
    if (typeof error?.code === "string" && error.code.startsWith("rating_")) throw error;
    fail("rating_schema_required");
  }
  const activeVersion = active ? Number(active.version) : null;
  if (!pending || Number(pending.version) !== version || pending.policy_digest !== digest || activeVersion !== previous) {
    fail("rating_lifecycle_conflict");
  }
}

function finishActivationIntent(input, record, intent) {
  const active = policyIdentity(input.db, "active");
  if (active && Number(active.version) === Number(intent.targetVersion)) {
    if (active.policy_digest !== intent.policyDigest) fail("rating_lifecycle_conflict");
    return activationReceipt(intent);
  }
  if (checkpointDigest(input.directory, input.context) !== intent.checkpointDigest) fail("rating_lifecycle_conflict");
  const pending = policyIdentity(input.db, "pending");
  const currentActive = active ? Number(active.version) : null;
  if (!pending || Number(pending.version) !== Number(intent.targetVersion) || pending.policy_digest !== intent.policyDigest
    || currentActive !== intent.expectedActiveVersion) fail("rating_lifecycle_conflict");
  // The visible intent is not durable until this rewrite finishes. A parent
  // sync failure here is before the database change and leaves that change unmade.
  writeRecord(input.directory, record, input);
  activatePendingProtocolRatingPolicy(input.db, {
    now: input.now,
    version: intent.targetVersion,
    policyDigest: intent.policyDigest,
    expectedActiveVersion: intent.expectedActiveVersion
  });
  const committed = policyIdentity(input.db, "active");
  if (!committed || Number(committed.version) !== Number(intent.targetVersion) || committed.policy_digest !== intent.policyDigest) {
    fail("rating_lifecycle_conflict");
  }
  return activationReceipt(intent);
}

function performActivate(input, record) {
  if (existsSync(pendingPath(input.directory))) fail("rating_lifecycle_pending_present");
  const boundary = checkpointDigest(input.directory, input.context);
  const stage = record.stages.activate;
  const intent = record.stages.activateIntent;
  if (intent && !sameActivation(stage, intent)) return finishActivationIntent(input, record, intent);
  const status = readProtocolRatingStatus(input.db);
  if (stage && (!status.pending || boundary === stage.checkpointDigest)) {
    const active = policyIdentity(input.db, "active");
    if (!active || Number(active.version) !== Number(stage.policyVersion) || active.policy_digest !== stage.policyDigest) {
      fail("rating_lifecycle_conflict");
    }
    // A renamed receipt can be visible before its directory sync finishes.
    // Completion has to rewrite that same receipt; visibility alone is not enough.
    writeRecord(input.directory, record, input);
    return stage;
  }
  if (!stage && boundary !== record.stages.drain?.checkpointDigest) fail("rating_lifecycle_conflict");
  if (!status.pending) fail("rating_pending_missing");
  const pending = policyIdentity(input.db, "pending");
  const active = policyIdentity(input.db, "active");
  const checkpoint = readFullMeteringJournal({ directory: input.directory, context: input.context });
  const nextIntent = {
    operation: "activate",
    targetVersion: Number(pending.version),
    policyDigest: pending.policy_digest,
    expectedActiveVersion: active ? Number(active.version) : null,
    checkpointDigest: fullMeteringDigest(checkpoint),
    channels: Array.isArray(checkpoint.channels) ? [...checkpoint.channels] : []
  };
  record.stages = { ...record.stages, activateIntent: nextIntent };
  writeRecord(input.directory, record, input);
  if (typeof input.beforeActivateDb === "function") input.beforeActivateDb(nextIntent);
  return finishActivationIntent(input, record, nextIntent);
}

function verifyExisting(stage, record, input) {
  if (stage === "drain" && existsSync(pendingPath(input.directory))) fail("rating_lifecycle_pending_present");
  if (stage === "baseline" && (input.action === "baseline" || Array.isArray(input.baselines))) {
    const next = performBaseline(input, record);
    return baselineSignature(next.resources) === baselineSignature(record.stages.baseline.resources) ? null : next;
  }
  if (stage === "activate") return performActivate(input, record);
  return null;
}

async function withRatingWriterLock(input, callback) {
  // Same writer.lock. One turn while it is held, then the original acquire.
  // The identity recheck runs only after that acquire, before the business step.
  if (input.formal === true) {
    const lock = join(input.directory, "writer.lock");
    if (existsSync(lock)) {
      await Promise.resolve();
      if (existsSync(lock)) fail("full_metering_locked");
    }
  }
  return withFullMeteringJournalLock({ directory: input.directory }, () => {
    if (input.formal === true && input.operatorBinding) input.operatorBinding.recheck();
    const result = callback();
    if (!input.operatorBinding) return result;
    return Promise.resolve().then(() => (
      input.operatorBinding.postcheck() ? result : { ...result, operatorTargetVerified: false }
    ));
  });
}

export async function runProtocolRatingLifecycle(input = {}) {
  if (!ORDER.includes(input.action) || !input.db || !input.directory || !input.context || !input.now) fail("rating_lifecycle_order");
  return withRatingWriterLock(input, () => {
    if (input.formal === true) {
      assertFormalRequest(input);
      if (checkpointDigest(input.directory, input.context) !== input.expectedCheckpointDigest) fail("rating_lifecycle_conflict");
    }
    const scopeDigest = fullMeteringDigest(input.context);
    let record = readRecord(input.directory, scopeDigest);
    const target = ORDER.indexOf(input.action);
    for (let index = 0; index <= target; index += 1) {
      const stage = ORDER[index];
      if (input.formal === true && stage === "activate") assertFormalActivationTarget(input, record);
      if (input.formal === true && stage === "migrate") {
        const impact = inspectProtocolTrafficRating(input.db);
        if (impact.schema === "partial") fail("rating_partial_schema");
        if (impact.schema === "checksum_mismatch") fail("rating_checksum_mismatch");
      }
      if (record.stages[stage]) {
        const replacement = verifyExisting(stage, record, input);
        if (replacement && replacement !== record.stages[stage]) {
          // The database change is already committed. This hook is the receipt
          // write, including when a later window replaces the previous receipt.
          if (stage === "activate" && typeof input.beforeRecord === "function") input.beforeRecord(stage);
          record = { ...record, stages: { ...record.stages, [stage]: replacement } };
          writeRecord(input.directory, record, input);
        }
        continue;
      }
      // A direct library call still fills earlier stages. Formal mode runs only the named step.
      if (input.formal === true && stage !== input.action) fail("rating_lifecycle_prerequisite");
      const body = stage === "inspect" ? performInspect(input)
        : stage === "migrate" ? performMigrate(input, record)
          : stage === "drain" ? performDrain(input)
            : stage === "baseline" ? performBaseline(input, record)
              : performActivate(input, record);
      if (typeof input.beforeRecord === "function") input.beforeRecord(stage);
      record = { ...record, stages: { ...record.stages, [stage]: body } };
      writeRecord(input.directory, record, input);
      if (typeof input.onStage === "function") input.onStage(stage);
    }
    return { scopeDigest, stages: record.stages };
  });
}

export async function runProtocolRatingRollbackCheck(input = {}) {
  if (!input.db || !input.directory || !input.context) fail("rating_lifecycle_order");
  return withRatingWriterLock(input, () => {
    if (input.formal === true) {
      assertFormalRequest(input);
      if (checkpointDigest(input.directory, input.context) !== input.expectedCheckpointDigest) fail("rating_lifecycle_conflict");
    }
    const scopeDigest = fullMeteringDigest(input.context);
    const record = readRecord(input.directory, scopeDigest);
    let outcome;
    try {
      outcome = assertRawOnlyRollbackAllowed(input.db);
    } catch (error) {
      const reason = error?.code || "rating_raw_only_rollback_forbidden";
      record.stages = { ...record.stages, rollback: { allowed: false, reason } };
      writeRecord(input.directory, record);
      throw error;
    }
    record.stages = { ...record.stages, rollback: { allowed: true, reason: outcome.reason } };
    writeRecord(input.directory, record);
    return { scopeDigest, stages: record.stages, rollback: outcome };
  });
}
