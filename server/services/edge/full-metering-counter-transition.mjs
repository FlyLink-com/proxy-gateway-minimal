import { createHash } from "node:crypto";

const REF = /^[A-Za-z0-9._:-]{1,128}$/;
const HASH = /^[a-f0-9]{64}$/;
const LIMIT = 100000;
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const connectionKey = connection => `${connection.generation}\0${connection.connectionId}`;
const zero = () => ({ uploadBytes: 0, downloadBytes: 0 });
const STATE_FIELDS = ["schemaVersion", "type", "mode", "sourceRef", "channelRef", "generation", "minObservedAt", "scopeDigest",
  "lastObservedAt", "lastObservationDigest", "entries", "connections", "stateDigest", "eligibleRefs", "retainedRefs",
  "archivedRefs", "retiredEntries", "retiredConnections", "scopeRevision", "previousStateDigest", "lastScopeChange",
  "generationRevision", "generationArchives", "generationStartedAt", "generationAwaitingObservation", "generationUnassignedGap"];
const boundaryDigest = (generation, verifiedAt) => digest({ type: "verified_generation_boundary", generation, verifiedAt });

function fail(code = "counter_input_invalid") {
  const error = new Error(code);
  error.code = code;
  throw error;
}
function requireCondition(condition, code) { if (!condition) fail(code); }
function object(value, keys, optional = []) {
  requireCondition(value !== null && typeof value === "object" && !Array.isArray(value));
  requireCondition([Object.prototype, null].includes(Object.getPrototypeOf(value)));
  const own = Reflect.ownKeys(value);
  requireCondition(own.every(k => typeof k === "string" && (keys.includes(k) || optional.includes(k))));
  requireCondition(keys.every(k => Object.hasOwn(value, k)));
  requireCondition(own.every(k => Object.hasOwn(Object.getOwnPropertyDescriptor(value, k), "value")));
}
function canonical(value) {
  if (Array.isArray(value)) { array(value); return `[${value.map(canonical).join(",")}]`; }
  if (value !== null && typeof value === "object") {
    const keys = Reflect.ownKeys(value);
    requireCondition(keys.every(k => typeof k === "string"));
    object(value, keys);
    return `{${keys.sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
const digest = value => createHash("sha256").update(canonical(value)).digest("hex");
function ref(value) { requireCondition(typeof value === "string" && REF.test(value)); return value; }
function iso(value) {
  requireCondition(typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value));
  const time = Date.parse(value);
  requireCondition(Number.isFinite(time) && new Date(time).toISOString() === value);
  return value;
}
function integer(value) { requireCondition(Number.isSafeInteger(value) && value >= 0); return value; }
function sum(a, b) { return integer(a + b); }
function bytes(value) {
  const uploadBytes = integer(value.uploadBytes), downloadBytes = integer(value.downloadBytes);
  sum(uploadBytes, downloadBytes);
  return { uploadBytes, downloadBytes };
}
function array(value) {
  requireCondition(Array.isArray(value) && value.length <= LIMIT);
  const keys = Reflect.ownKeys(value).filter(k => k !== "length");
  requireCondition(keys.length === value.length && keys.every((k, i) => k === String(i) && Object.hasOwn(Object.getOwnPropertyDescriptor(value, k), "value")));
}
function refs(value, allowEmpty = true) {
  array(value);
  requireCondition(allowEmpty || value.length > 0);
  const result = value.map(ref).sort(compare);
  requireCondition(new Set(result).size === result.length);
  return result;
}
function withTotal(value) { return { ...value, totalBytes: sum(value.uploadBytes, value.downloadBytes) }; }
function add(target, value) {
  target.uploadBytes = sum(target.uploadBytes, value.uploadBytes);
  target.downloadBytes = sum(target.downloadBytes, value.downloadBytes);
  sum(target.uploadBytes, target.downloadBytes);
}
function cursor(observation, observedAt) { return { ...bytes(observation), observedAt }; }

function normalize(request) {
  object(request, ["state", "mode", "sourceRef", "channelRef", "generation", "eligibleRefs", "retainedRefs", "observedAt", "now", "minObservedAt", "observations"], ["maxAgeMs"]);
  requireCondition(["cumulative", "connections"].includes(request.mode));
  requireCondition(typeof request.generation === "string" && HASH.test(request.generation));
  const eligibleRefs = refs(request.eligibleRefs, request.state !== null && request.state !== undefined), retainedRefs = refs(request.retainedRefs);
  const eligible = new Set(eligibleRefs), retained = new Set(retainedRefs);
  requireCondition(retainedRefs.every(r => !eligible.has(r)));
  const observedAt = iso(request.observedAt), now = iso(request.now), minObservedAt = iso(request.minObservedAt);
  const maxAgeMs = Object.hasOwn(request, "maxAgeMs") ? request.maxAgeMs : 120000;
  requireCondition(Number.isSafeInteger(maxAgeMs) && maxAgeMs > 0 && maxAgeMs <= 86400000);
  requireCondition(minObservedAt <= observedAt && observedAt <= now && Date.parse(now) - Date.parse(observedAt) <= maxAgeMs);
  const scope = { mode: request.mode, sourceRef: ref(request.sourceRef), channelRef: ref(request.channelRef), eligibleRefs, retainedRefs, minObservedAt };
  array(request.observations);
  const seen = new Set();
  const observations = request.observations.map(raw => {
    object(raw, ["edgeCredentialRef", "uploadBytes", "downloadBytes", ...(scope.mode === "connections" ? ["connectionId"] : [])]);
    const edgeCredentialRef = ref(raw.edgeCredentialRef);
    const result = { edgeCredentialRef, ...bytes(raw) };
    if (scope.mode === "connections") result.connectionId = ref(raw.connectionId);
    const key = result.connectionId ?? edgeCredentialRef;
    requireCondition(!seen.has(key));
    seen.add(key);
    requireCondition(eligible.has(edgeCredentialRef) || retained.has(edgeCredentialRef), "unknown_counter_identity");
    return result;
  }).sort((a, b) => compare(a.connectionId ?? a.edgeCredentialRef, b.connectionId ?? b.edgeCredentialRef));
  return { scope, scopeDigest: digest(scope), generation: request.generation, eligible, retained,
    observations, observedAt, observationDigest: digest(observations) };
}

function initialState(n) {
  return { schemaVersion: 1, type: "full_metering_counter_state", mode: n.scope.mode,
    sourceRef: n.scope.sourceRef, channelRef: n.scope.channelRef, generation: n.generation,
    minObservedAt: n.scope.minObservedAt, scopeDigest: n.scopeDigest,
    eligibleRefs: [...n.scope.eligibleRefs], retainedRefs: [...n.scope.retainedRefs],
    archivedRefs: [], retiredEntries: [], retiredConnections: [], scopeRevision: 0,
    generationRevision: 0, generationArchives: [], generationStartedAt: n.scope.minObservedAt,
    generationAwaitingObservation: false, generationUnassignedGap: null,
    previousStateDigest: null, lastScopeChange: null,
    lastObservedAt: n.observedAt, lastObservationDigest: n.observationDigest,
    entries: n.scope.eligibleRefs.map(edgeCredentialRef => ({ edgeCredentialRef, status: "pending_start",
      generation: n.generation, cursor: null, usage: zero(), carryUsage: zero(), connectionIds: [] })), connections: [] };
}

function validateState(raw, n = null) {
  // Digest is corruption detection, not an authorization token. The caller must
  // retain the entire state in protected storage and must not turn lost state into null.
  try {
    object(raw, STATE_FIELDS);
    requireCondition(raw.schemaVersion === 1 && raw.type === "full_metering_counter_state");
    requireCondition(["cumulative", "connections"].includes(raw.mode));
    ref(raw.sourceRef); ref(raw.channelRef); iso(raw.minObservedAt); iso(raw.lastObservedAt);
    requireCondition(raw.minObservedAt <= raw.lastObservedAt);
    for (const field of ["generation", "scopeDigest", "lastObservationDigest", "stateDigest"]) requireCondition(typeof raw[field] === "string" && HASH.test(raw[field]));
    const { stateDigest, ...payload } = raw;
    requireCondition(digest(payload) === stateDigest);
    integer(raw.generationRevision); array(raw.generationArchives);
    requireCondition(raw.generationRevision === raw.generationArchives.length && raw.generationRevision <= 128);
    iso(raw.generationStartedAt);
    requireCondition(raw.generationStartedAt >= raw.minObservedAt && raw.generationStartedAt <= raw.lastObservedAt);
    requireCondition(typeof raw.generationAwaitingObservation === "boolean");
    const knownGenerations = new Set();
    for (const [index, archive] of raw.generationArchives.entries()) {
      object(archive, ["snapshot", "nextGeneration", "verifiedAt", "archiveDigest"]);
      object(archive.snapshot, STATE_FIELDS.filter(field => field !== "generationArchives"));
      const { snapshot, nextGeneration, verifiedAt, archiveDigest } = archive;
      requireCondition(typeof nextGeneration === "string" && HASH.test(nextGeneration));
      requireCondition(typeof archiveDigest === "string" && HASH.test(archiveDigest));
      requireCondition(digest({ snapshot, nextGeneration, verifiedAt }) === archiveDigest);
      requireCondition(snapshot.generationRevision === index && !knownGenerations.has(snapshot.generation));
      requireCondition(typeof snapshot.generation === "string" && HASH.test(snapshot.generation));
      knownGenerations.add(snapshot.generation);
      requireCondition(!knownGenerations.has(nextGeneration));
      requireCondition(iso(verifiedAt) >= iso(snapshot.lastObservedAt));
      for (const field of ["schemaVersion", "type", "mode", "sourceRef", "channelRef", "minObservedAt"]) requireCondition(snapshot[field] === raw[field]);
      if (index > 0) requireCondition(raw.generationArchives[index - 1].nextGeneration === snapshot.generation);
      // Rebuild the exact prior payload from the flat prefix, not recursively
      // nested archives. The original state digest must still verify verbatim.
      const { stateDigest: previousDigest, ...oldPayload } = snapshot;
      requireCondition(digest({ ...oldPayload, generationArchives: raw.generationArchives.slice(0, index) }) === previousDigest);
    }
    if (raw.generationRevision === 0) {
      requireCondition(raw.generationStartedAt === raw.minObservedAt && !raw.generationAwaitingObservation && raw.generationUnassignedGap === null);
    } else {
      const last = raw.generationArchives.at(-1);
      requireCondition(last.nextGeneration === raw.generation && last.verifiedAt === raw.generationStartedAt && raw.previousStateDigest !== null);
      object(raw.generationUnassignedGap, ["startedAt", "verifiedAt", "baselineCompletedAt", "unassignedBytes"]);
      const gap = raw.generationUnassignedGap;
      requireCondition(gap.startedAt === last.snapshot.lastObservedAt && gap.verifiedAt === last.verifiedAt && gap.unassignedBytes === null);
      if (gap.baselineCompletedAt !== null) requireCondition(iso(gap.baselineCompletedAt) >= gap.verifiedAt && gap.baselineCompletedAt <= raw.lastObservedAt);
      if (raw.generationAwaitingObservation) requireCondition(raw.lastObservedAt === raw.generationStartedAt
        && raw.lastObservationDigest === boundaryDigest(raw.generation, raw.generationStartedAt) && gap.baselineCompletedAt === null);
    }
    requireCondition(!knownGenerations.has(raw.generation)); knownGenerations.add(raw.generation);
    integer(raw.scopeRevision);
    requireCondition(raw.previousStateDigest === null || typeof raw.previousStateDigest === "string" && HASH.test(raw.previousStateDigest));
    for (const field of ["eligibleRefs", "retainedRefs", "archivedRefs"]) requireCondition(canonical(raw[field]) === canonical(refs(raw[field])));
    requireCondition(raw.eligibleRefs.every(r => !raw.retainedRefs.includes(r)));
    requireCondition(raw.archivedRefs.every(r => raw.retainedRefs.includes(r)));
    const ownScope = { mode: raw.mode, sourceRef: raw.sourceRef, channelRef: raw.channelRef,
      eligibleRefs: raw.eligibleRefs, retainedRefs: raw.retainedRefs, minObservedAt: raw.minObservedAt };
    requireCondition(digest(ownScope) === raw.scopeDigest);
    if (raw.scopeRevision === 0) requireCondition(raw.lastScopeChange === null && raw.archivedRefs.length === 0 && raw.eligibleRefs.length > 0);
    else {
      requireCondition(raw.previousStateDigest !== null);
      object(raw.lastScopeChange, ["revision", "previousStateDigest", "fromScopeDigest", "toScopeDigest", "addedRefs", "retiredRefs"]);
      requireCondition(raw.lastScopeChange.revision === raw.scopeRevision);
      for (const field of ["previousStateDigest", "fromScopeDigest", "toScopeDigest"]) requireCondition(typeof raw.lastScopeChange[field] === "string" && HASH.test(raw.lastScopeChange[field]));
      requireCondition(raw.lastScopeChange.toScopeDigest === raw.scopeDigest && raw.lastScopeChange.fromScopeDigest !== raw.scopeDigest);
      for (const field of ["addedRefs", "retiredRefs"]) requireCondition(canonical(raw.lastScopeChange[field]) === canonical(refs(raw.lastScopeChange[field])));
      requireCondition(raw.lastScopeChange.addedRefs.length + raw.lastScopeChange.retiredRefs.length > 0);
      requireCondition(raw.lastScopeChange.addedRefs.every(r => raw.eligibleRefs.includes(r)) && raw.lastScopeChange.retiredRefs.every(r => raw.archivedRefs.includes(r)));
    }
    for (const field of ["entries", "connections", "retiredEntries", "retiredConnections"]) array(raw[field]);
    requireCondition(raw.entries.length + raw.retiredEntries.length <= LIMIT && raw.connections.length + raw.retiredConnections.length <= LIMIT);
    const allConnectionIds = new Set();
    for (const archived of [false, true]) {
      const selectedEntries = archived ? raw.retiredEntries : raw.entries;
      const selectedConnections = archived ? raw.retiredConnections : raw.connections;
      const entryKeys = selectedEntries.map(e => e.edgeCredentialRef);
      requireCondition(canonical(entryKeys) === canonical(archived ? raw.archivedRefs : raw.eligibleRefs));
      const entries = new Map();
      for (const entry of selectedEntries) {
        object(entry, ["edgeCredentialRef", "status", "generation", "cursor", "usage", "carryUsage", "connectionIds"]);
        ref(entry.edgeCredentialRef);
        requireCondition(knownGenerations.has(entry.generation) && (archived || entry.generation === raw.generation));
        requireCondition(["pending_start", "observed"].includes(entry.status));
        object(entry.usage, ["uploadBytes", "downloadBytes"]); bytes(entry.usage);
        object(entry.carryUsage, ["uploadBytes", "downloadBytes"]); bytes(entry.carryUsage);
        const priorGeneration = raw.generationArchives.find(a => a.nextGeneration === entry.generation);
        const carried = priorGeneration?.snapshot.entries.find(e => e.edgeCredentialRef === entry.edgeCredentialRef)?.usage ?? zero();
        requireCondition(canonical(entry.carryUsage) === canonical(carried));
        requireCondition(entry.usage.uploadBytes >= entry.carryUsage.uploadBytes && entry.usage.downloadBytes >= entry.carryUsage.downloadBytes);
        requireCondition(canonical(entry.connectionIds) === canonical(refs(entry.connectionIds)));
        if (entry.status === "pending_start") requireCondition(entry.cursor === null && entry.connectionIds.length === 0 && canonical(entry.usage) === canonical(entry.carryUsage));
        if (!archived && raw.generationAwaitingObservation) requireCondition(entry.status === "pending_start");
        if (raw.mode === "cumulative") {
          requireCondition(entry.connectionIds.length === 0);
          if (entry.status === "observed") {
            object(entry.cursor, ["uploadBytes", "downloadBytes", "observedAt"]); bytes(entry.cursor); iso(entry.cursor.observedAt);
            requireCondition(entry.cursor.observedAt >= raw.minObservedAt && entry.cursor.observedAt <= raw.lastObservedAt);
            if (!archived) requireCondition(entry.cursor.observedAt === raw.lastObservedAt);
            requireCondition(entry.usage.uploadBytes - entry.carryUsage.uploadBytes <= entry.cursor.uploadBytes && entry.usage.downloadBytes - entry.carryUsage.downloadBytes <= entry.cursor.downloadBytes);
          }
        } else {
          requireCondition(entry.cursor === null);
          if (entry.status === "observed") requireCondition(entry.connectionIds.length > 0);
        }
        entries.set(entry.edgeCredentialRef, entry);
      }
      if (raw.mode === "cumulative") requireCondition(selectedConnections.length === 0);
      const connectionKeys = selectedConnections.map(connectionKey);
      requireCondition(new Set(connectionKeys).size === connectionKeys.length && canonical(connectionKeys) === canonical([...connectionKeys].sort(compare)));
      const byOwner = new Map(selectedEntries.map(e => [e.edgeCredentialRef, []]));
      for (const connection of selectedConnections) {
        object(connection, ["connectionId", "edgeCredentialRef", "generation", "uploadBytes", "downloadBytes", "observedAt", "closedAt"]);
        ref(connection.connectionId); ref(connection.edgeCredentialRef); bytes(connection); iso(connection.observedAt);
        requireCondition(entries.has(connection.edgeCredentialRef));
        requireCondition(connection.generation === entries.get(connection.edgeCredentialRef).generation);
        const key = connectionKey(connection);
        requireCondition(!allConnectionIds.has(key)); allConnectionIds.add(key);
        requireCondition(connection.observedAt >= raw.minObservedAt && connection.observedAt <= raw.lastObservedAt);
        if (connection.closedAt === null) { if (!archived) requireCondition(connection.observedAt === raw.lastObservedAt); }
        else requireCondition(iso(connection.closedAt) > connection.observedAt && connection.closedAt <= raw.lastObservedAt);
        byOwner.get(connection.edgeCredentialRef).push(connection.connectionId);
      }
      for (const entry of selectedEntries) requireCondition(canonical(entry.connectionIds) === canonical(byOwner.get(entry.edgeCredentialRef)));
      const totals = zero(); selectedEntries.forEach(entry => add(totals, entry.usage));
    }
  } catch { fail("counter_state_invalid"); }
  if (!n) return structuredClone(raw);
  requireCondition(raw.scopeDigest === n.scopeDigest && raw.mode === n.scope.mode && raw.sourceRef === n.scope.sourceRef && raw.channelRef === n.scope.channelRef && raw.minObservedAt === n.scope.minObservedAt, "counter_scope_changed");
  requireCondition(raw.generation === n.generation, "source_generation_changed");
  requireCondition(n.observedAt >= raw.generationStartedAt, "observation_before_generation_boundary");
  requireCondition(canonical(raw.entries.map(e => e.edgeCredentialRef)) === canonical(n.scope.eligibleRefs), "counter_state_invalid");
  return structuredClone(raw);
}

/**
 * Pure, fail-closed transition over one complete, successful source snapshot.
 * `state: null` is allowed only for genuine first admission; callers own protected
 * storage, generation provenance, source-read success and atomic sample/state commit.
 * Cumulative mode covers VLESS/Hy2; connections mode covers TUIC connection pairs.
 * Inputs use safe integer bytes, canonical UTC timestamps, fixed eligible/retained
 * keys and a source-generation SHA-256. Missing whole pairs are pending only before
 * first observation. Retained keys are strictly parsed, never baselined or charged.
 * Returns detached `nextState`, positive per-user `deltas` with observed intervals,
 * `eligibleTotals`/`totals` (accepted usage since baseline, NOT raw traffic totals),
 * actual eligible `counters`, aggregate-only `summary`, and exact-replay `unchanged`.
 * `retiredTotals` holds previously metered archived usage, never a new charge.
 * New connections baseline independently; closed IDs remain tombstones and cannot
 * be reused in this generation. No I/O, resets, lifecycle actions or DB writes.
 */
export function transitionFullMeteringCounters(request) {
  const n = normalize(request);
  const previous = request.state === null ? null : validateState(request.state, n);
  const next = previous ?? initialState(n);
  let unchanged = false;
  if (previous) {
    requireCondition(n.observedAt >= previous.lastObservedAt, "observation_out_of_order");
    if (n.observedAt === previous.lastObservedAt && !previous.generationAwaitingObservation) {
      requireCondition(n.observationDigest === previous.lastObservationDigest, "observation_replay_conflict");
      unchanged = true;
    }
  }
  const pendingBefore = new Set(next.entries.filter(e => e.status === "pending_start").map(e => e.edgeCredentialRef));
  const deltaByOwner = new Map();
  let initializedConnectionCount = 0, closedConnectionCount = 0;
  const accumulate = (entry, observation, before) => {
    requireCondition(observation.uploadBytes >= before.uploadBytes && observation.downloadBytes >= before.downloadBytes, "counter_decreased");
    const delta = { uploadBytes: observation.uploadBytes - before.uploadBytes, downloadBytes: observation.downloadBytes - before.downloadBytes };
    add(entry.usage, delta);
    if (delta.uploadBytes === 0 && delta.downloadBytes === 0) return;
    const accumulated = deltaByOwner.get(entry.edgeCredentialRef) ?? { edgeCredentialRef: entry.edgeCredentialRef, ...zero(), intervalStartedAt: before.observedAt, intervalEndedAt: n.observedAt };
    add(accumulated, delta);
    if (before.observedAt < accumulated.intervalStartedAt) accumulated.intervalStartedAt = before.observedAt;
    deltaByOwner.set(entry.edgeCredentialRef, accumulated);
  };
  if (!unchanged) {
    next.previousStateDigest = previous?.stateDigest ?? null;
    if (n.scope.mode === "cumulative") {
      const observations = new Map(n.observations.map(o => [o.edgeCredentialRef, o]));
      for (const entry of next.entries) {
        const observation = observations.get(entry.edgeCredentialRef);
        if (!observation) {
          requireCondition(entry.status === "pending_start", "observed_counter_missing");
          continue;
        }
        if (entry.status === "observed") accumulate(entry, observation, entry.cursor);
        entry.status = "observed";
        entry.cursor = cursor(observation, n.observedAt);
      }
    } else {
      const entries = new Map(next.entries.map(e => [e.edgeCredentialRef, e]));
      const connections = new Map(next.connections.map(c => [c.connectionId, c]));
      const observations = new Map(n.observations.map(o => [o.connectionId, o]));
      for (const archived of next.retiredConnections) {
        const observation = observations.get(archived.connectionId);
        if (observation && archived.generation === n.generation) requireCondition(observation.edgeCredentialRef === archived.edgeCredentialRef, "connection_identity_changed");
      }
      // Check all prior IDs before excluding retained observations, so changing an
      // observed connection's owner into a retained identity cannot hide drift.
      for (const connection of connections.values()) {
        const observation = observations.get(connection.connectionId);
        if (observation) {
          requireCondition(connection.edgeCredentialRef === observation.edgeCredentialRef, "connection_identity_changed");
          requireCondition(connection.closedAt === null, "closed_connection_reappeared");
        } else if (connection.closedAt === null) { connection.closedAt = n.observedAt; closedConnectionCount++; }
      }
      for (const observation of n.observations) {
        if (n.retained.has(observation.edgeCredentialRef)) continue;
        const entry = entries.get(observation.edgeCredentialRef);
        const before = connections.get(observation.connectionId);
        if (before) accumulate(entry, observation, before);
        else {
          initializedConnectionCount++;
          entry.connectionIds.push(observation.connectionId);
          entry.connectionIds.sort(compare);
        }
        entry.status = "observed";
        connections.set(observation.connectionId, { connectionId: observation.connectionId, edgeCredentialRef: observation.edgeCredentialRef, generation: n.generation, ...cursor(observation, n.observedAt), closedAt: null });
      }
      requireCondition(connections.size + next.retiredConnections.length <= LIMIT);
      next.connections = [...connections.values()].sort((a, b) => compare(a.connectionId, b.connectionId));
    }
    next.lastObservedAt = n.observedAt;
    next.lastObservationDigest = n.observationDigest;
    next.generationAwaitingObservation = false;
    if (next.generationUnassignedGap && next.generationUnassignedGap.baselineCompletedAt === null && next.entries.every(e => e.status === "observed")) next.generationUnassignedGap.baselineCompletedAt = n.observedAt;
    delete next.stateDigest;
    next.stateDigest = digest(next);
  }
  const totals = zero();
  const retiredTotals = zero(); next.retiredEntries.forEach(entry => add(retiredTotals, entry.usage));
  const eligibleTotals = next.entries.map(entry => { add(totals, entry.usage); return { edgeCredentialRef: entry.edgeCredentialRef, status: entry.status, ...withTotal(entry.usage) }; });
  const observedCount = next.entries.filter(e => e.status === "observed").length;
  return { nextState: next, unchanged,
    deltas: [...deltaByOwner.values()].sort((a, b) => compare(a.edgeCredentialRef, b.edgeCredentialRef)).map(withTotal),
    eligibleTotals, totals: withTotal(totals), retiredTotals: withTotal(retiredTotals),
    counters: n.observations.filter(o => n.eligible.has(o.edgeCredentialRef)).map(o => ({ ...o, observedAt: n.observedAt })),
    summary: { eligibleCount: next.entries.length, observedCount, pendingCount: next.entries.length - observedCount,
      generationRevision: next.generationRevision, generationUnassignedGap: structuredClone(next.generationUnassignedGap),
      initializedCount: unchanged ? 0 : next.entries.filter(e => e.status === "observed" && pendingBefore.has(e.edgeCredentialRef)).length,
      retainedObservationCount: n.observations.filter(o => n.retained.has(o.edgeCredentialRef)).length,
      initializedConnectionCount, closedConnectionCount,
      archivedIdentityCount: next.retiredEntries.length,
      activeConnectionCount: next.connections.filter(c => c.closedAt === null).length } };
}

/**
 * Explicit scope migration after the caller's fresh identity/ownership inspection.
 * Only verified new eligible keys and eligible -> retained retirement are supported.
 * The old cursor, accumulated usage, live/closed connections are archived unchanged;
 * archived live connections describe the last snapshot, not current liveness.
 * No retained reactivation, identity deletion or generation change is inferred.
 * Persist returned receipt and before/after state atomically in the protected journal;
 * `previousStateDigest` links the change but does not itself authenticate the caller.
 */
export function reconcileVerifiedFullMeteringScope(request) {
  object(request, ["state", "eligibleRefs", "retainedRefs"]);
  const before = validateState(request.state);
  const eligibleRefs = refs(request.eligibleRefs), retainedRefs = refs(request.retainedRefs);
  const eligible = new Set(eligibleRefs), retained = new Set(retainedRefs);
  const allowed = condition => requireCondition(condition, "counter_scope_reconciliation_invalid");
  allowed(eligibleRefs.every(r => !retained.has(r)));
  allowed(before.retainedRefs.every(r => retained.has(r) && !eligible.has(r)));
  allowed(before.eligibleRefs.every(r => eligible.has(r) || retained.has(r)));
  allowed(retainedRefs.every(r => before.retainedRefs.includes(r) || before.eligibleRefs.includes(r)));
  const addedRefs = eligibleRefs.filter(r => !before.eligibleRefs.includes(r));
  const retiredRefs = before.eligibleRefs.filter(r => retained.has(r));
  if (addedRefs.length === 0 && retiredRefs.length === 0) return { nextState: before, unchanged: true, receipt: null };
  const next = structuredClone(before);
  const retired = new Set(retiredRefs);
  next.retiredEntries.push(...next.entries.filter(e => retired.has(e.edgeCredentialRef)));
  next.entries = next.entries.filter(e => !retired.has(e.edgeCredentialRef));
  next.retiredConnections.push(...next.connections.filter(c => retired.has(c.edgeCredentialRef)));
  next.connections = next.connections.filter(c => !retired.has(c.edgeCredentialRef));
  next.entries.push(...addedRefs.map(edgeCredentialRef => ({ edgeCredentialRef, status: "pending_start", generation: next.generation, cursor: null, usage: zero(), carryUsage: zero(), connectionIds: [] })));
  next.entries.sort((a, b) => compare(a.edgeCredentialRef, b.edgeCredentialRef));
  next.retiredEntries.sort((a, b) => compare(a.edgeCredentialRef, b.edgeCredentialRef));
  next.retiredConnections.sort((a, b) => compare(connectionKey(a), connectionKey(b)));
  next.eligibleRefs = eligibleRefs; next.retainedRefs = retainedRefs;
  next.archivedRefs = next.retiredEntries.map(e => e.edgeCredentialRef);
  next.scopeRevision = sum(before.scopeRevision, 1);
  next.previousStateDigest = before.stateDigest;
  next.scopeDigest = digest({ mode: next.mode, sourceRef: next.sourceRef, channelRef: next.channelRef, eligibleRefs, retainedRefs, minObservedAt: next.minObservedAt });
  next.lastScopeChange = { revision: next.scopeRevision, previousStateDigest: before.stateDigest, fromScopeDigest: before.scopeDigest, toScopeDigest: next.scopeDigest, addedRefs, retiredRefs };
  delete next.stateDigest; next.stateDigest = digest(next);
  validateState(next);
  return { nextState: next, unchanged: false, receipt: { beforeStateDigest: before.stateDigest, afterStateDigest: next.stateDigest,
    fromScopeDigest: before.scopeDigest, toScopeDigest: next.scopeDigest, addedRefs: [...addedRefs], retiredRefs: [...retiredRefs], revision: next.scopeRevision } };
}

/**
 * Advance only after the host driver has verified a new runtime instance, stable
 * known material/ownership and read provenance. This helper performs no host I/O.
 * `verifiedAt` is a trusted pre-read boundary or that verified read's timestamp.
 * Existing active cursors/connections and lifetime usage are preserved in a flat,
 * digest-verifiable archive. Every currently eligible identity starts pending in
 * the new generation; its first real pair is a baseline, never historical debit.
 * Unassigned gap bytes remain explicitly unknown (null). Persist receipt and both
 * states atomically; neither repeated same-generation resets nor old-ID generation
 * reuse are permitted. No runtime restart, clear or synthetic zero is performed.
 */
export function advanceVerifiedFullMeteringGeneration(request) {
  object(request, ["state", "generation", "verifiedAt"]);
  const before = validateState(request.state);
  const { generation, verifiedAt } = request;
  requireCondition(typeof generation === "string" && HASH.test(generation), "counter_generation_transition_invalid");
  iso(verifiedAt);
  requireCondition(verifiedAt >= before.lastObservedAt && generation !== before.generation
    && !before.generationArchives.some(archive => archive.snapshot.generation === generation)
    && before.generationRevision < 128, "counter_generation_transition_invalid");
  const next = structuredClone(before);
  const { generationArchives: ignored, ...snapshot } = structuredClone(before);
  const body = { snapshot, nextGeneration: generation, verifiedAt };
  next.generationArchives.push({ ...body, archiveDigest: digest(body) });
  next.generationRevision++;
  next.generation = generation;
  next.generationStartedAt = verifiedAt;
  next.generationAwaitingObservation = true;
  next.generationUnassignedGap = { startedAt: before.lastObservedAt, verifiedAt, baselineCompletedAt: null, unassignedBytes: null };
  next.previousStateDigest = before.stateDigest;
  next.lastObservedAt = verifiedAt;
  next.lastObservationDigest = boundaryDigest(generation, verifiedAt);
  next.entries = before.entries.map(entry => ({ edgeCredentialRef: entry.edgeCredentialRef, generation, status: "pending_start",
    cursor: null, usage: { ...entry.usage }, carryUsage: { ...entry.usage }, connectionIds: [] }));
  next.connections = [];
  delete next.stateDigest; next.stateDigest = digest(next);
  validateState(next);
  return { nextState: next, unchanged: false, receipt: { type: "verified_full_metering_generation_advance",
    beforeStateDigest: before.stateDigest, afterStateDigest: next.stateDigest, previousGeneration: before.generation,
    generation, verifiedAt, revision: next.generationRevision, archiveDigest: next.generationArchives.at(-1).archiveDigest,
    unassignedBytes: null } };
}
