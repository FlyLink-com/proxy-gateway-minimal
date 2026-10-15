import { createHash } from "node:crypto";
import { emptyFullMeteringConnectionHistory, readFullMeteringConnectionHistory, compactFullMeteringConnectionHistory,
  hasFullMeteringClosedConnection } from "./full-metering-connection-history.mjs";

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
const V2_STATE_FIELDS = [...STATE_FIELDS, "connectionHistory", "retentionMigration"];
const MATERIAL_STATE_FIELDS = ["materialBoundaries", "billingWindowBoundaries", "planSwitchBoundaries"];
const CONTINUATION_STATE_FIELDS = [...MATERIAL_STATE_FIELDS, "planSwitchReactivations"];
const REQUEST_FIELDS = ["state", "mode", "sourceRef", "channelRef", "generation", "eligibleRefs", "retainedRefs", "observedAt", "now", "minObservedAt", "observations"];
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
const digest = value => {
  // Large packed histories must not be expanded into a second whole canonical
  // state string just to calculate a digest. Keep the original byte order/hash.
  const hash = createHash("sha256");
  const visit = item => {
    if (Array.isArray(item)) {
      array(item); hash.update("["); item.forEach((entry, index) => { if (index) hash.update(","); visit(entry); }); hash.update("]");
    } else if (item !== null && typeof item === "object") {
      const keys = Reflect.ownKeys(item); requireCondition(keys.every(key => typeof key === "string")); object(item, keys);
      hash.update("{"); keys.sort().forEach((key, index) => { if (index) hash.update(","); hash.update(`${JSON.stringify(key)}:`); visit(item[key]); }); hash.update("}");
    } else hash.update(JSON.stringify(item));
  };
  visit(value); return hash.digest("hex");
};
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
  object(request, REQUEST_FIELDS, ["maxAgeMs"]);
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
  return { schemaVersion: n.scope.mode === "connections" ? 2 : 1, type: "full_metering_counter_state", mode: n.scope.mode,
    ...(n.scope.mode === "connections" ? { connectionHistory: emptyFullMeteringConnectionHistory(), retentionMigration: null } : {}),
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
    const version = raw && typeof raw === "object" ? Object.getOwnPropertyDescriptor(raw, "schemaVersion")?.value : null;
    object(raw, version === 2 ? V2_STATE_FIELDS : STATE_FIELDS, CONTINUATION_STATE_FIELDS);
    requireCondition([1, 2].includes(raw.schemaVersion) && raw.type === "full_metering_counter_state");
    requireCondition(["cumulative", "connections"].includes(raw.mode));
    requireCondition(raw.schemaVersion !== 2 || raw.mode === "connections");
    ref(raw.sourceRef); ref(raw.channelRef); iso(raw.minObservedAt); iso(raw.lastObservedAt);
    requireCondition(raw.minObservedAt <= raw.lastObservedAt);
    for (const field of ["generation", "scopeDigest", "lastObservationDigest", "stateDigest"]) requireCondition(typeof raw[field] === "string" && HASH.test(raw[field]));
    const { stateDigest, ...payload } = raw;
    requireCondition(digest(payload) === stateDigest);
    const historyBuffer = raw.schemaVersion === 2 ? readFullMeteringConnectionHistory(raw.connectionHistory,
      { minObservedAt: raw.minObservedAt, lastObservedAt: raw.lastObservedAt }) : null;
    if (raw.schemaVersion === 2 && raw.retentionMigration !== null) {
      object(raw.retentionMigration, ["previousSchemaVersion", "previousStateDigest", "convertedAt", "originalArchiveDigests"]);
      requireCondition(raw.retentionMigration.previousSchemaVersion === 1 && typeof raw.retentionMigration.previousStateDigest === "string" && HASH.test(raw.retentionMigration.previousStateDigest));
      requireCondition(iso(raw.retentionMigration.convertedAt) >= raw.minObservedAt && raw.retentionMigration.convertedAt <= raw.lastObservedAt);
      array(raw.retentionMigration.originalArchiveDigests);
      requireCondition(raw.retentionMigration.originalArchiveDigests.length <= 128 && raw.retentionMigration.originalArchiveDigests.every(value => typeof value === "string" && HASH.test(value)));
    }
    integer(raw.generationRevision); array(raw.generationArchives);
    requireCondition(raw.generationRevision === raw.generationArchives.length && raw.generationRevision <= 128);
    iso(raw.generationStartedAt);
    requireCondition(raw.generationStartedAt >= raw.minObservedAt && raw.generationStartedAt <= raw.lastObservedAt);
    requireCondition(typeof raw.generationAwaitingObservation === "boolean");
    const knownGenerations = new Set();
    for (const [index, archive] of raw.generationArchives.entries()) {
      if (raw.schemaVersion === 2) {
        // A v2 archive is explicitly a usage summary, NOT a reconstruction of
        // the old full payload. Original state/archive digests are audit links;
        // summary contents have their own digest under the protected journal.
        object(archive, ["version", "generation", "generationRevision", "nextGeneration", "verifiedAt", "lastObservedAt",
          "entries", "sourceStateDigest", "sourceArchiveDigest", "archiveDigest"]);
        requireCondition(archive.version === 2 && archive.generationRevision === index);
        for (const field of ["generation", "nextGeneration", "sourceStateDigest", "archiveDigest"]) requireCondition(typeof archive[field] === "string" && HASH.test(archive[field]));
        requireCondition(archive.sourceArchiveDigest === null || typeof archive.sourceArchiveDigest === "string" && HASH.test(archive.sourceArchiveDigest));
        const { archiveDigest, ...summary } = archive;
        requireCondition(digest(summary) === archiveDigest);
        requireCondition(!knownGenerations.has(archive.generation)); knownGenerations.add(archive.generation);
        requireCondition(!knownGenerations.has(archive.nextGeneration));
        requireCondition(iso(archive.verifiedAt) >= iso(archive.lastObservedAt) && archive.lastObservedAt >= raw.minObservedAt);
        requireCondition(archive.verifiedAt <= raw.lastObservedAt);
        if (index > 0) requireCondition(raw.generationArchives[index - 1].nextGeneration === archive.generation
          && raw.generationArchives[index - 1].verifiedAt <= archive.lastObservedAt);
        const migrated = raw.retentionMigration?.originalArchiveDigests ?? [];
        requireCondition(archive.sourceArchiveDigest === (index < migrated.length ? migrated[index] : null));
        array(archive.entries);
        requireCondition(canonical(archive.entries.map(entry => entry.edgeCredentialRef)) === canonical(refs(archive.entries.map(entry => entry.edgeCredentialRef))));
        for (const entry of archive.entries) { object(entry, ["edgeCredentialRef", "usage"]); ref(entry.edgeCredentialRef); object(entry.usage, ["uploadBytes", "downloadBytes"]); bytes(entry.usage); }
        continue;
      }
      object(archive, ["snapshot", "nextGeneration", "verifiedAt", "archiveDigest"]);
      object(archive.snapshot, STATE_FIELDS.filter(field => field !== "generationArchives"), CONTINUATION_STATE_FIELDS);
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
    if (raw.schemaVersion === 2 && raw.retentionMigration !== null) requireCondition(raw.retentionMigration.originalArchiveDigests.length <= raw.generationArchives.length);
    if (raw.generationRevision === 0) {
      requireCondition(raw.generationStartedAt === raw.minObservedAt && !raw.generationAwaitingObservation && raw.generationUnassignedGap === null);
    } else {
      const last = raw.generationArchives.at(-1);
      requireCondition(last.nextGeneration === raw.generation && last.verifiedAt === raw.generationStartedAt && raw.previousStateDigest !== null);
      object(raw.generationUnassignedGap, ["startedAt", "verifiedAt", "baselineCompletedAt", "unassignedBytes"]);
      const gap = raw.generationUnassignedGap;
      requireCondition(gap.startedAt === (raw.schemaVersion === 2 ? last.lastObservedAt : last.snapshot.lastObservedAt) && gap.verifiedAt === last.verifiedAt && gap.unassignedBytes === null);
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
    const materialCarry = new Map();
    const generationCarries = new Map(raw.generationArchives.map(archive => [archive.nextGeneration,
      new Map((raw.schemaVersion === 2 ? archive.entries : archive.snapshot.entries).map(entry => [entry.edgeCredentialRef, entry.usage]))]));
    const eligibleOrArchived = new Set([...raw.eligibleRefs, ...raw.archivedRefs]);
    const acceptBoundaries = (field) => {
      if (!Object.hasOwn(raw, field)) return [];
      array(raw[field]);
      requireCondition(raw[field].length > 0 && raw[field].length <= 128);
      let lastAt = raw.minObservedAt;
      for (const boundary of raw[field]) {
        object(boundary, ["generation", "observedAt", "previousStateDigest", "entries", "boundaryDigest"]);
        requireCondition(knownGenerations.has(boundary.generation));
        requireCondition(iso(boundary.observedAt) > lastAt && boundary.observedAt <= raw.lastObservedAt);
        const generationIndex = raw.generationArchives.findIndex(archive => archive.nextGeneration === boundary.generation);
        const startedAt = generationIndex < 0 ? raw.minObservedAt : raw.generationArchives[generationIndex].verifiedAt;
        const following = raw.generationArchives.find(archive => (raw.schemaVersion === 2 ? archive.generation : archive.snapshot.generation) === boundary.generation);
        requireCondition(boundary.observedAt > startedAt && (!following || boundary.observedAt <= following.verifiedAt));
        for (const digestField of ["previousStateDigest", "boundaryDigest"]) requireCondition(typeof boundary[digestField] === "string" && HASH.test(boundary[digestField]));
        const { boundaryDigest: recordedDigest, ...payload } = boundary;
        requireCondition(digest(payload) === recordedDigest);
        array(boundary.entries);
        requireCondition(boundary.entries.length > 0);
        requireCondition(canonical(boundary.entries.map(entry => entry.edgeCredentialRef)) === canonical(refs(boundary.entries.map(entry => entry.edgeCredentialRef))));
        for (const entry of boundary.entries) {
          object(entry, ["edgeCredentialRef", "carryUsage"]);
          ref(entry.edgeCredentialRef); object(entry.carryUsage, ["uploadBytes", "downloadBytes"]); bytes(entry.carryUsage);
          requireCondition(eligibleOrArchived.has(entry.edgeCredentialRef));
        }
        lastAt = boundary.observedAt;
      }
      return raw[field];
    };
    const reactivations = raw.planSwitchReactivations ?? [];
    array(reactivations); requireCondition(reactivations.length <= 128);
    let lastReactivatedAt = null;
    for (const boundary of reactivations) {
      object(boundary, ["version", "generation", "observedAt", "previousStateDigest", "entries", "boundaryDigest"]);
      requireCondition(boundary.version === 1 && knownGenerations.has(boundary.generation));
      iso(boundary.observedAt);
      requireCondition(boundary.observedAt <= raw.lastObservedAt && (lastReactivatedAt === null || boundary.observedAt > lastReactivatedAt));
      const start = raw.generationArchives.find(archive => archive.nextGeneration === boundary.generation)?.verifiedAt ?? raw.minObservedAt;
      const following = raw.generationArchives.find(archive => (raw.schemaVersion === 2 ? archive.generation : archive.snapshot.generation) === boundary.generation);
      requireCondition(boundary.observedAt >= start && (!following || boundary.observedAt <= following.verifiedAt));
      for (const field of ["previousStateDigest", "boundaryDigest"]) requireCondition(typeof boundary[field] === "string" && HASH.test(boundary[field]));
      const { boundaryDigest: recorded, ...payload } = boundary;
      requireCondition(digest(payload) === recorded);
      array(boundary.entries); requireCondition(boundary.entries.length > 0);
      requireCondition(canonical(boundary.entries.map(entry => entry.edgeCredentialRef)) === canonical(refs(boundary.entries.map(entry => entry.edgeCredentialRef))));
      for (const entry of boundary.entries) {
        object(entry, ["edgeCredentialRef", "carryUsage", "retiredEntry", "retiredConnections"]);
        ref(entry.edgeCredentialRef); requireCondition(eligibleOrArchived.has(entry.edgeCredentialRef));
        object(entry.carryUsage, ["uploadBytes", "downloadBytes"]); bytes(entry.carryUsage);
        const saved = entry.retiredEntry;
        object(saved, ["edgeCredentialRef", "status", "generation", "cursor", "usage", "carryUsage", "connectionIds"]);
        requireCondition(saved.edgeCredentialRef === entry.edgeCredentialRef && knownGenerations.has(saved.generation));
        requireCondition(["pending_start", "observed"].includes(saved.status));
        for (const field of ["usage", "carryUsage"]) { object(saved[field], ["uploadBytes", "downloadBytes"]); bytes(saved[field]); }
        requireCondition(canonical(saved.usage) === canonical(entry.carryUsage)
          && saved.usage.uploadBytes >= saved.carryUsage.uploadBytes && saved.usage.downloadBytes >= saved.carryUsage.downloadBytes);
        requireCondition(canonical(saved.connectionIds) === canonical(refs(saved.connectionIds)));
        if (saved.status === "pending_start") requireCondition(saved.cursor === null && saved.connectionIds.length === 0
          && canonical(saved.usage) === canonical(saved.carryUsage));
        if (raw.mode === "cumulative") {
          requireCondition(saved.connectionIds.length === 0);
          if (saved.status === "observed") {
            object(saved.cursor, ["uploadBytes", "downloadBytes", "observedAt"]); bytes(saved.cursor);
            requireCondition(iso(saved.cursor.observedAt) >= raw.minObservedAt && saved.cursor.observedAt <= boundary.observedAt);
            requireCondition(saved.usage.uploadBytes - saved.carryUsage.uploadBytes <= saved.cursor.uploadBytes
              && saved.usage.downloadBytes - saved.carryUsage.downloadBytes <= saved.cursor.downloadBytes);
          }
        } else requireCondition(saved.cursor === null);
        array(entry.retiredConnections);
        const ids = [];
        for (const connection of entry.retiredConnections) {
          object(connection, ["connectionId", "edgeCredentialRef", "generation", "uploadBytes", "downloadBytes", "observedAt", "closedAt"]);
          ref(connection.connectionId); bytes(connection); ids.push(connection.connectionId);
          requireCondition(connection.edgeCredentialRef === entry.edgeCredentialRef && connection.generation === saved.generation);
          requireCondition(iso(connection.observedAt) >= raw.minObservedAt && connection.observedAt <= boundary.observedAt);
          if (connection.closedAt !== null) requireCondition(iso(connection.closedAt) > connection.observedAt && connection.closedAt <= boundary.observedAt);
        }
        requireCondition(canonical(ids) === canonical(saved.connectionIds));
      }
      lastReactivatedAt = boundary.observedAt;
    }
    const orderedBoundaries = [...MATERIAL_STATE_FIELDS.flatMap(acceptBoundaries), ...reactivations]
      .sort((left, right) => compare(left.observedAt, right.observedAt));
    for (const boundary of orderedBoundaries) {
      for (const entry of boundary.entries) {
        const key = `${boundary.generation}\0${entry.edgeCredentialRef}`;
        const prior = materialCarry.get(key) ?? generationCarries.get(boundary.generation)?.get(entry.edgeCredentialRef) ?? zero();
        requireCondition(entry.carryUsage.uploadBytes >= prior.uploadBytes && entry.carryUsage.downloadBytes >= prior.downloadBytes);
        materialCarry.set(key, entry.carryUsage);
      }
    }
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
        const carried = materialCarry.get(`${entry.generation}\0${entry.edgeCredentialRef}`)
          ?? (raw.schemaVersion === 2 ? priorGeneration?.entries : priorGeneration?.snapshot.entries)?.find(e => e.edgeCredentialRef === entry.edgeCredentialRef)?.usage ?? zero();
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
          if (entry.status === "observed" && raw.schemaVersion === 1) requireCondition(entry.connectionIds.length > 0);
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
        if (raw.schemaVersion === 2) {
          requireCondition(connection.closedAt === null);
          requireCondition(!hasFullMeteringClosedConnection(historyBuffer, connection.generation, connection.connectionId));
        }
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

function usageArchive(state, nextGeneration, verifiedAt, sourceArchiveDigest = null) {
  const summary = { version: 2, generation: state.generation, generationRevision: state.generationRevision,
    nextGeneration, verifiedAt, lastObservedAt: state.lastObservedAt,
    entries: state.entries.map(entry => ({ edgeCredentialRef: entry.edgeCredentialRef, usage: { ...entry.usage } })),
    sourceStateDigest: state.stateDigest, sourceArchiveDigest };
  return { ...summary, archiveDigest: digest(summary) };
}

function synchronizeConnectionIndexes(state) {
  for (const [entryField, connectionField] of [["entries", "connections"], ["retiredEntries", "retiredConnections"]]) {
    const byOwner = new Map(state[entryField].map(entry => [entry.edgeCredentialRef, []]));
    for (const connection of state[connectionField]) byOwner.get(connection.edgeCredentialRef).push(connection.connectionId);
    for (const entry of state[entryField]) entry.connectionIds = byOwner.get(entry.edgeCredentialRef).sort(compare);
  }
}

function retainConnectionHistory(state, observedAt, additionalClosed = []) {
  const closed = [...additionalClosed, ...state.connections.filter(connection => connection.closedAt !== null),
    ...state.retiredConnections.filter(connection => connection.closedAt !== null)];
  const result = compactFullMeteringConnectionHistory(state.connectionHistory, closed, { minObservedAt: state.minObservedAt, observedAt });
  state.connectionHistory = result.history;
  state.connections = state.connections.filter(connection => connection.closedAt === null);
  state.retiredConnections = state.retiredConnections.filter(connection => connection.closedAt === null);
  synchronizeConnectionIndexes(state);
  return result.buffer;
}

function prepareConnectionRetention(state, observedAt) {
  if (state.mode !== "connections") return null;
  let archivedClosed = [];
  if (state.schemaVersion === 1) {
    // validateState already verified every legacy archive against its original
    // full-state digest. The migration is a new state, never an in-place rewrite
    // of that evidence or a fabricated replacement of the original hashes.
    const originalArchiveDigests = state.generationArchives.map(archive => archive.archiveDigest);
    const boundaries = new Map(state.generationArchives.map(archive => [archive.snapshot.generation, archive.verifiedAt]));
    for (const archive of state.generationArchives) {
      for (const connection of [...archive.snapshot.connections, ...archive.snapshot.retiredConnections]) {
        archivedClosed.push({ ...connection, closedAt: connection.closedAt ?? boundaries.get(connection.generation) ?? archive.verifiedAt });
      }
    }
    for (const connection of state.retiredConnections) {
      if (connection.closedAt === null && connection.generation !== state.generation) connection.closedAt = boundaries.get(connection.generation);
    }
    state.retentionMigration = { previousSchemaVersion: 1, previousStateDigest: state.stateDigest, convertedAt: observedAt, originalArchiveDigests };
    state.connectionHistory = emptyFullMeteringConnectionHistory();
    state.generationArchives = state.generationArchives.map(archive => usageArchive(archive.snapshot, archive.nextGeneration, archive.verifiedAt, archive.archiveDigest));
    state.schemaVersion = 2;
  }
  return retainConnectionHistory(state, observedAt, archivedClosed);
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
 * New connections baseline independently; closed IDs remain compact tombstones
 * for thirty days. An ID first seen after expiry establishes a zero-charge
 * baseline, never a charge for its old cumulative bytes. No I/O or DB writes.
 */
export function transitionFullMeteringCounters(request) {
  return transitionCounters(request);
}

/**
 * Pure accounting primitive, not material-change authority. The host caller must
 * verify old/current identity, ownership, material proof and source provenance,
 * then atomically archive the complete old checkpoint and persist this result.
 * Selected eligible identities establish a fresh real baseline in the SAME
 * runtime generation; their already accepted usage moves into explicit carry
 * evidence. Other identities use the ordinary transition and all safety checks.
 * A complete connections snapshot may contain no current pair for a selected
 * identity; absence closes its old connections and never invents a new cursor.
 * Cumulative mode always requires an actual pair for every selected identity.
 * No clear/reset, runtime I/O, automatic opt-in or invented generation is allowed.
 * New optional journal evidence is deliberately unreadable by older validators;
 * an older helper must never overwrite it during rollback. Gap bytes are unknown.
 */
export function transitionVerifiedFullMeteringMaterialCounters(request) {
  object(request, [...REQUEST_FIELDS, "materialRefs"], ["maxAgeMs"]);
  const materialRefs = refs(request.materialRefs, false);
  requireCondition(canonical(materialRefs) === canonical(request.materialRefs), "counter_material_transition_invalid");
  const { materialRefs: ignored, ...ordinaryRequest } = request;
  return transitionCounters(ordinaryRequest, materialRefs, "material");
}
export function transitionVerifiedFullMeteringBillingWindowCounters(request) {
  object(request, [...REQUEST_FIELDS, "billingWindowRefs"], ["maxAgeMs"]);
  const billingWindowRefs = refs(request.billingWindowRefs, false);
  requireCondition(canonical(billingWindowRefs) === canonical(request.billingWindowRefs), "counter_billing_window_transition_invalid");
  const { billingWindowRefs: ignored, ...ordinaryRequest } = request;
  return transitionCounters(ordinaryRequest, billingWindowRefs, "billing-window");
}

// This primitive is not plan-switch authority. The caller must first prove an
// applied commercial plan-only transition with unchanged ownership and material.
// It keeps accepted usage and records an unknown interval, never a historical
// debit. Its distinct evidence must survive later ordinary/material/window reads;
// older strict validators reject this new field rather than silently dropping it.
// A plan change cannot legitimize decreasing same-generation runtime counters.
export function transitionVerifiedFullMeteringPlanSwitchCounters(request) {
  object(request, [...REQUEST_FIELDS, "planSwitchRefs"], ["maxAgeMs"]);
  const planSwitchRefs = refs(request.planSwitchRefs, false);
  requireCondition(canonical(planSwitchRefs) === canonical(request.planSwitchRefs), "counter_plan_switch_transition_invalid");
  const { planSwitchRefs: ignored, ...ordinaryRequest } = request;
  return transitionCounters(ordinaryRequest, planSwitchRefs, "plan-switch");
}

// The caller owns the commercial proof. This separate atomic primitive never
// broadens ordinary scope reconciliation: only exactly selected, archived refs
// may leave retention. No staged state is returned before its real observation
// and final state validation. A generation change must already be independently
// verified with advanceVerifiedFullMeteringGeneration; it is never inferred here.
export function transitionVerifiedFullMeteringPlanSwitchReactivationCounters(request) {
  object(request, [...REQUEST_FIELDS, "planSwitchRefs", "reactivationRefs"], ["maxAgeMs"]);
  const planSwitchRefs = refs(request.planSwitchRefs, false), reactivationRefs = refs(request.reactivationRefs, false);
  requireCondition(canonical(planSwitchRefs) === canonical(request.planSwitchRefs)
    && canonical(reactivationRefs) === canonical(request.reactivationRefs)
    && reactivationRefs.every(value => planSwitchRefs.includes(value)), "counter_plan_switch_reactivation_invalid");
  const { planSwitchRefs: ignored, reactivationRefs: ignoredReactivation, ...ordinaryRequest } = request;
  return transitionCounters(ordinaryRequest, planSwitchRefs, "plan-switch", reactivationRefs);
}

// The caller must independently prove both disjoint kinds of continuation.
// One complete snapshot establishes their boundaries atomically: material reset
// counters may decrease, while unchanged-material plan counters remain monotonic.
// Neither boundary charges an unassigned interval, and ordinary peers still count.
export function transitionVerifiedFullMeteringMaterialAndPlanSwitchCounters(request) {
  object(request, [...REQUEST_FIELDS, "materialRefs", "planSwitchRefs"], ["maxAgeMs", "reactivationRefs"]);
  const materialRefs = refs(request.materialRefs, false), planSwitchRefs = refs(request.planSwitchRefs, false);
  const planSelection = new Set(planSwitchRefs);
  const reactivationRefs = Object.hasOwn(request, "reactivationRefs") ? refs(request.reactivationRefs, false) : null;
  requireCondition(canonical(materialRefs) === canonical(request.materialRefs)
    && canonical(planSwitchRefs) === canonical(request.planSwitchRefs)
    && materialRefs.every(value => !planSelection.has(value))
    && (!reactivationRefs || canonical(reactivationRefs) === canonical(request.reactivationRefs)
      && reactivationRefs.every(value => planSelection.has(value))), "counter_combined_transition_invalid");
  const { materialRefs: ignoredMaterial, planSwitchRefs: ignoredPlan, reactivationRefs: ignoredReactivation, ...ordinaryRequest } = request;
  return transitionCounters(ordinaryRequest, materialRefs, "material", reactivationRefs, planSwitchRefs);
}

function stagePlanSwitchReactivation(before, n, reactivationRefs) {
  const allowed = value => requireCondition(value, "counter_plan_switch_reactivation_invalid");
  allowed(before !== null && (before.planSwitchReactivations?.length ?? 0) < 128);
  allowed(before.mode === n.scope.mode && before.sourceRef === n.scope.sourceRef && before.channelRef === n.scope.channelRef
    && before.minObservedAt === n.scope.minObservedAt && before.generation === n.generation);
  allowed(n.observedAt > before.lastObservedAt || before.generationAwaitingObservation && n.observedAt === before.lastObservedAt);
  const restored = new Set(reactivationRefs);
  const actual = n.scope.eligibleRefs.filter(value => before.retainedRefs.includes(value));
  allowed(canonical(actual) === canonical(reactivationRefs));
  allowed(reactivationRefs.every(value => before.archivedRefs.includes(value)));
  allowed(before.retainedRefs.every(value => restored.has(value) || n.retained.has(value)));
  allowed(before.eligibleRefs.every(value => n.eligible.has(value) || n.retained.has(value)));
  allowed(n.scope.retainedRefs.every(value => before.retainedRefs.includes(value) || before.eligibleRefs.includes(value)));
  const addedRefs = n.scope.eligibleRefs.filter(value => !before.eligibleRefs.includes(value));
  const retiredRefs = before.eligibleRefs.filter(value => n.retained.has(value));
  const retired = new Set(retiredRefs), next = structuredClone(before);
  const entries = before.retiredEntries.filter(entry => restored.has(entry.edgeCredentialRef)).map(entry => ({
    edgeCredentialRef: entry.edgeCredentialRef, carryUsage: { ...entry.usage }, retiredEntry: structuredClone(entry),
    retiredConnections: structuredClone(before.retiredConnections.filter(connection => connection.edgeCredentialRef === entry.edgeCredentialRef))
  }));
  allowed(entries.length === reactivationRefs.length);
  const boundary = { version: 1, generation: n.generation, observedAt: n.observedAt, previousStateDigest: before.stateDigest, entries };
  next.planSwitchReactivations = [...(before.planSwitchReactivations ?? []), { ...boundary, boundaryDigest: digest(boundary) }];
  next.retiredEntries = [...next.retiredEntries.filter(entry => !restored.has(entry.edgeCredentialRef)),
    ...next.entries.filter(entry => retired.has(entry.edgeCredentialRef))].sort((a, b) => compare(a.edgeCredentialRef, b.edgeCredentialRef));
  next.retiredConnections = [...next.retiredConnections.filter(connection => !restored.has(connection.edgeCredentialRef)),
    ...next.connections.filter(connection => retired.has(connection.edgeCredentialRef))].sort((a, b) => compare(connectionKey(a), connectionKey(b)));
  next.entries = next.entries.filter(entry => !retired.has(entry.edgeCredentialRef));
  next.connections = next.connections.filter(connection => !retired.has(connection.edgeCredentialRef));
  for (const saved of entries) {
    const entry = structuredClone(saved.retiredEntry);
    if (entry.generation !== n.generation) {
      entry.generation = n.generation; entry.status = "pending_start"; entry.cursor = null; entry.connectionIds = [];
    } else next.connections.push(...structuredClone(saved.retiredConnections));
    entry.carryUsage = { ...entry.usage };
    next.entries.push(entry);
  }
  next.entries.push(...addedRefs.filter(value => !restored.has(value)).map(edgeCredentialRef => ({ edgeCredentialRef,
    status: "pending_start", generation: n.generation, cursor: null, usage: zero(), carryUsage: zero(), connectionIds: [] })));
  next.entries.sort((a, b) => compare(a.edgeCredentialRef, b.edgeCredentialRef));
  next.connections.sort((a, b) => compare(connectionKey(a), connectionKey(b)));
  next.eligibleRefs = [...n.scope.eligibleRefs]; next.retainedRefs = [...n.scope.retainedRefs];
  next.archivedRefs = next.retiredEntries.map(entry => entry.edgeCredentialRef);
  next.scopeDigest = n.scopeDigest; next.scopeRevision = sum(before.scopeRevision, 1);
  next.previousStateDigest = before.stateDigest;
  next.lastScopeChange = { revision: next.scopeRevision, previousStateDigest: before.stateDigest,
    fromScopeDigest: before.scopeDigest, toScopeDigest: n.scopeDigest, addedRefs, retiredRefs };
  return next;
}

function transitionCounters(request, materialRefs = null, boundaryKind = "material", reactivationRefs = null, additionalPlanRefs = null) {
  const n = normalize(request);
  const previous = request.state === null ? null : validateState(request.state, reactivationRefs ? null : n);
  const beforeStateDigest = previous?.stateDigest ?? null;
  const next = reactivationRefs ? stagePlanSwitchReactivation(previous, n, reactivationRefs) : previous ?? initialState(n);
  const material = new Set([...(materialRefs ?? []), ...(additionalPlanRefs ?? [])]);
  const billingWindow = boundaryKind === "billing-window";
  const planSwitch = boundaryKind === "plan-switch";
  const monotonicBoundaryRefs = new Set(planSwitch ? materialRefs ?? [] : additionalPlanRefs ?? []);
  const boundaryField = planSwitch ? "planSwitchBoundaries" : billingWindow ? "billingWindowBoundaries" : "materialBoundaries";
  const boundaryError = planSwitch ? "counter_plan_switch_transition_invalid"
    : billingWindow ? "counter_billing_window_transition_invalid" : "counter_material_transition_invalid";
  let materialBoundary = null, planSwitchBoundary = null;
  const boundarySelections = materialRefs ? [{ selectedRefs: materialRefs, field: boundaryField, error: boundaryError },
    ...(additionalPlanRefs ? [{ selectedRefs: additionalPlanRefs, field: "planSwitchBoundaries", error: "counter_plan_switch_transition_invalid" }] : [])] : [];
  for (const { selectedRefs, field, error } of boundarySelections) {
    requireCondition(boundaryKind === "material" || billingWindow || planSwitch, error);
    requireCondition(previous !== null && (n.observedAt > previous.lastObservedAt || reactivationRefs && previous.generationAwaitingObservation)
      && (!previous.generationAwaitingObservation || reactivationRefs) && (previous[field]?.length ?? 0) < 128, error);
    const observedRefs = new Set(n.observations.map(observation => observation.edgeCredentialRef));
    const selected = new Set(selectedRefs);
    requireCondition(selectedRefs.every(r => n.eligible.has(r)
      && (n.scope.mode === "connections" || observedRefs.has(r))), error);
    const boundary = { generation: n.generation, observedAt: n.observedAt, previousStateDigest: previous.stateDigest,
      entries: next.entries.filter(entry => selected.has(entry.edgeCredentialRef))
        .map(entry => ({ edgeCredentialRef: entry.edgeCredentialRef, carryUsage: { ...entry.usage } })) };
    // A just-verified generation already baselines all active entries. Restored
    // retained usage is carried by its distinct reactivation evidence at that
    // same boundary; do not fabricate an ordinary plan boundary before a read.
    if (!previous.generationAwaitingObservation) {
      const recorded = { ...boundary, boundaryDigest: digest(boundary) };
      if (additionalPlanRefs && field === "planSwitchBoundaries") planSwitchBoundary = recorded;
      else materialBoundary = recorded;
      next[field] = [...(next[field] ?? []), recorded];
    }
    for (const entry of next.entries) if (selected.has(entry.edgeCredentialRef)) entry.carryUsage = { ...entry.usage };
  }
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
  const requireMonotonic = (observation, before) => {
    requireCondition(observation.uploadBytes >= before.uploadBytes && observation.downloadBytes >= before.downloadBytes, "counter_decreased");
  };
  const accumulate = (entry, observation, before) => {
    requireMonotonic(observation, before);
    const delta = { uploadBytes: observation.uploadBytes - before.uploadBytes, downloadBytes: observation.downloadBytes - before.downloadBytes };
    add(entry.usage, delta);
    if (delta.uploadBytes === 0 && delta.downloadBytes === 0) return;
    const accumulated = deltaByOwner.get(entry.edgeCredentialRef) ?? { edgeCredentialRef: entry.edgeCredentialRef, ...zero(), intervalStartedAt: before.observedAt, intervalEndedAt: n.observedAt };
    add(accumulated, delta);
    if (before.observedAt < accumulated.intervalStartedAt) accumulated.intervalStartedAt = before.observedAt;
    deltaByOwner.set(entry.edgeCredentialRef, accumulated);
  };
  if (!unchanged) {
    const historyBuffer = prepareConnectionRetention(next, n.observedAt);
    next.previousStateDigest = previous?.stateDigest ?? null;
    if (n.scope.mode === "cumulative") {
      const observations = new Map(n.observations.map(o => [o.edgeCredentialRef, o]));
      for (const entry of next.entries) {
        const observation = observations.get(entry.edgeCredentialRef);
        if (!observation) {
          requireCondition(entry.status === "pending_start", "observed_counter_missing");
          continue;
        }
        if (entry.status === "observed") {
          if (!material.has(entry.edgeCredentialRef)) accumulate(entry, observation, entry.cursor);
          else if (monotonicBoundaryRefs.has(entry.edgeCredentialRef)) requireMonotonic(observation, entry.cursor);
        }
        entry.status = "observed";
        entry.cursor = cursor(observation, n.observedAt);
      }
    } else {
      const entries = new Map(next.entries.map(e => [e.edgeCredentialRef, e]));
      const connections = new Map(next.connections.map(c => [c.connectionId, c]));
      const observations = new Map(n.observations.map(o => [o.connectionId, o]));
      for (const observation of n.observations) requireCondition(!hasFullMeteringClosedConnection(historyBuffer, n.generation, observation.connectionId), "closed_connection_reappeared");
      for (const archived of next.retiredConnections) {
        const observation = observations.get(archived.connectionId);
        if (archived.generation === n.generation) {
          if (observation) requireCondition(observation.edgeCredentialRef === archived.edgeCredentialRef, "connection_identity_changed");
          else if (archived.closedAt === null) archived.closedAt = n.observedAt;
        }
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
        if (before) {
          if (!material.has(entry.edgeCredentialRef)) accumulate(entry, observation, before);
          else if (monotonicBoundaryRefs.has(entry.edgeCredentialRef)) requireMonotonic(observation, before);
        }
        else {
          initializedConnectionCount++;
          entry.connectionIds.push(observation.connectionId);
          entry.connectionIds.sort(compare);
        }
        entry.status = "observed";
        connections.set(observation.connectionId, { connectionId: observation.connectionId, edgeCredentialRef: observation.edgeCredentialRef, generation: n.generation, ...cursor(observation, n.observedAt), closedAt: null });
      }
      next.connections = [...connections.values()].sort((a, b) => compare(a.connectionId, b.connectionId));
      if (next.connections.some(connection => connection.closedAt !== null) || next.retiredConnections.some(connection => connection.closedAt !== null)) retainConnectionHistory(next, n.observedAt);
      else synchronizeConnectionIndexes(next);
      requireCondition(next.connections.length + next.retiredConnections.length <= LIMIT);
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
  if (materialBoundary || reactivationRefs) validateState(next);
  return { nextState: next, unchanged,
    ...(additionalPlanRefs ? { receipt: { type: "verified_full_metering_material_and_plan_switch_transition",
      materialCount: materialRefs.length, planSwitchCount: additionalPlanRefs.length,
      materialBoundaryDigest: materialBoundary?.boundaryDigest ?? null,
      planSwitchBoundaryDigest: planSwitchBoundary?.boundaryDigest ?? null,
      ...(reactivationRefs ? { reactivationCount: reactivationRefs.length,
        reactivationBoundaryDigest: next.planSwitchReactivations.at(-1).boundaryDigest } : {}),
      beforeStateDigest, afterStateDigest: next.stateDigest,
      generation: n.generation, observedAt: n.observedAt, unassignedBytes: null } }
      : reactivationRefs ? { receipt: { type: "verified_full_metering_plan_switch_reactivation",
      reactivationCount: reactivationRefs.length, planSwitchCount: materialRefs.length,
      reactivationBoundaryDigest: next.planSwitchReactivations.at(-1).boundaryDigest,
      beforeStateDigest: previous.stateDigest, afterStateDigest: next.stateDigest,
      generation: n.generation, observedAt: n.observedAt, unassignedBytes: null } }
      : materialBoundary ? { receipt: planSwitch
      ? { type: "verified_full_metering_plan_switch_transition", planSwitchCount: materialRefs.length,
        planSwitchBoundaryDigest: materialBoundary.boundaryDigest, beforeStateDigest: materialBoundary.previousStateDigest,
        afterStateDigest: next.stateDigest, generation: n.generation, observedAt: n.observedAt, unassignedBytes: null }
      : billingWindow ? { type: "verified_full_metering_billing_window_transition", billingWindowCount: materialRefs.length,
        billingWindowBoundaryDigest: materialBoundary.boundaryDigest, beforeStateDigest: materialBoundary.previousStateDigest,
        afterStateDigest: next.stateDigest, generation: n.generation, observedAt: n.observedAt, unassignedBytes: null }
      : { type: "verified_full_metering_material_transition", materialCount: materialRefs.length,
        materialBoundaryDigest: materialBoundary.boundaryDigest, beforeStateDigest: materialBoundary.previousStateDigest,
        afterStateDigest: next.stateDigest, generation: n.generation, observedAt: n.observedAt, unassignedBytes: null } } : {}),
    deltas: [...deltaByOwner.values()].sort((a, b) => compare(a.edgeCredentialRef, b.edgeCredentialRef)).map(withTotal),
    eligibleTotals, totals: withTotal(totals), retiredTotals: withTotal(retiredTotals),
    counters: n.observations.filter(o => n.eligible.has(o.edgeCredentialRef)).map(o => ({ ...o, observedAt: n.observedAt })),
    summary: { eligibleCount: next.entries.length, observedCount, pendingCount: next.entries.length - observedCount,
      generationRevision: next.generationRevision, generationUnassignedGap: structuredClone(next.generationUnassignedGap),
      initializedCount: unchanged ? 0 : next.entries.filter(e => e.status === "observed" && pendingBefore.has(e.edgeCredentialRef)).length,
      retainedObservationCount: n.observations.filter(o => n.retained.has(o.edgeCredentialRef)).length,
      initializedConnectionCount, closedConnectionCount,
      closedHistoryCount: next.connectionHistory?.count ?? 0,
      connectionHistoryRetentionDays: next.mode === "connections" ? 30 : null,
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
 * Cumulative states preserve their exact flat archives. TUIC v2 preserves usage
 * summaries with original digest audit links and compact closure fingerprints,
 * not old connection payloads. Every currently eligible identity starts pending in
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
    && !before.generationArchives.some(archive => (archive.version === 2 ? archive.generation : archive.snapshot.generation) === generation)
    && before.generationRevision < 128, "counter_generation_transition_invalid");
  const next = structuredClone(before);
  if (next.mode === "connections") {
    prepareConnectionRetention(next, verifiedAt);
    retainConnectionHistory(next, verifiedAt, [...next.connections, ...next.retiredConnections]
      .map(connection => ({ ...connection, closedAt: verifiedAt })));
    next.retiredConnections = [];
    next.retiredEntries.forEach(entry => { entry.connectionIds = []; });
    next.generationArchives.push(usageArchive(next, generation, verifiedAt));
  } else {
    const { generationArchives: ignored, ...snapshot } = structuredClone(before);
    const body = { snapshot, nextGeneration: generation, verifiedAt };
    next.generationArchives.push({ ...body, archiveDigest: digest(body) });
  }
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
