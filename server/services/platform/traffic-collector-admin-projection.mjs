import {
  chmodSync,
  chownSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmdirSync,
  statSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { sanitizeTrafficCollectorState } from "./traffic-collector-state.mjs";
import {
  TRAFFIC_COLLECTOR_PRODUCER_REFS,
  createUnavailableTrafficCollectorProducerStatus,
  sanitizeTrafficCollectorProducerStatus
} from "./traffic-collector-status-producers.mjs";

const MAX_SNAPSHOT_BYTES = 256 * 1024;
const PRODUCER_LOCK_TIMEOUT_MS = 2000;
const PRODUCER_STALE_LOCK_MS = 30_000;
const PRODUCER_LOCK_WAIT_MS = 10;
const PRODUCER_LOCK_SIGNAL = new Int32Array(new SharedArrayBuffer(4));
const AVAILABLE = "available";
const UNAVAILABLE_STATES = new Set([
  "not_configured",
  "not_observed",
  "invalid_observation"
]);
const SAFE_SOURCE_REASON_CODES = new Set([
  "auth_error",
  "authentication_failed",
  "collector_exception",
  "controller_error",
  "controller_forbidden",
  "controller_unauthorized",
  "credential_binding_missing",
  "mapping_unresolved",
  "missing_stats",
  "node_aggregate_only",
  "per_credential_usage_entries_required",
  "runtime_down",
  "runtime_fetch_failed",
  "traffic_stats_forbidden",
  "traffic_stats_unauthorized",
  "unresolved_binding",
  "validation_error",
  "xray_stats_query_failed"
]);
const PRODUCER_FILE_SUFFIX = Object.freeze({
  japan_tuic_usage_credential_map: "japan-tuic-map",
  sgp_tuic_connection_delta_sidecar: "sgp-tuic-sidecar"
});

function projectionError(message) {
  const error = new Error(message);
  error.code = "validation_error";
  return error;
}

function text(value) {
  return String(value ?? "").trim();
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nonNegativeInteger(value) {
  const normalized = Number(value);
  return Number.isInteger(normalized) && normalized >= 0 ? normalized : 0;
}

function isoOrNull(value) {
  const normalized = text(value);
  if (!normalized) return null;
  const timestamp = new Date(normalized);
  return Number.isNaN(timestamp.getTime()) ? null : timestamp.toISOString();
}

function safety() {
  return {
    redacted: true,
    summaryOnly: true,
    mutationAllowed: false,
    rawRuntimePayloadReturned: false,
    rawConfigReturned: false,
    rawLogReturned: false,
    credentialReturned: false,
    customerDataReturned: false
  };
}

function sourceReasonCodes(value) {
  const codes = Array.isArray(value)
    ? value.map((entry) => text(entry?.code || entry).toLowerCase())
    : [];
  return [...new Set(codes.filter((code) => SAFE_SOURCE_REASON_CODES.has(code)))].sort();
}

function observability(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const result = {};
  if (typeof value.statsApiReachable === "boolean") {
    result.statsApiReachable = value.statsApiReachable;
  }
  if (typeof value.userTrafficCountersObserved === "boolean") {
    result.userTrafficCountersObserved = value.userTrafficCountersObserved;
  }
  return Object.keys(result).length > 0 ? result : null;
}

function collectorProjection({ collectorState, blockers, reasonCodes, observability: rawObservability } = {}) {
  const state = sanitizeTrafficCollectorState(collectorState);
  if (!state) return null;
  return {
    ...state,
    reasonCodes: sourceReasonCodes(reasonCodes || blockers),
    observability: observability(rawObservability),
    safety: { redacted: true }
  };
}

function sortProducers(left, right) {
  return left.producerRef.localeCompare(right.producerRef);
}

function sortCollectors(left, right) {
  return left.channelRef.localeCompare(right.channelRef)
    || left.sourceRef.localeCompare(right.sourceRef);
}

function collectorKey(value) {
  const channelRef = text(value?.channelRef);
  const sourceRef = text(value?.sourceRef);
  return channelRef && sourceRef ? `${channelRef}\u0000${sourceRef}` : "";
}

function preserveLastCollectorSuccess(projection, previous) {
  if (previous?.availability !== AVAILABLE) return projection;
  const previousSuccessByCollector = new Map(
    previous.collectors
      .map((collector) => [collectorKey(collector), isoOrNull(collector.lastCollectorSuccessAt)])
      .filter(([key, timestamp]) => key && timestamp)
  );
  return {
    ...projection,
    collectors: projection.collectors.map((collector) => {
      if (collector.lastCollectorSuccessAt) return collector;
      const previousSuccess = previousSuccessByCollector.get(collectorKey(collector));
      return previousSuccess
        ? { ...collector, lastCollectorSuccessAt: previousSuccess }
        : collector;
    })
  };
}

export function createUnavailableTrafficCollectorAdminProjection(availability = "invalid_observation") {
  const normalized = UNAVAILABLE_STATES.has(availability) ? availability : "invalid_observation";
  return {
    type: "traffic_collector_admin_projection",
    schemaVersion: "1",
    availability: normalized,
    observedAt: null,
    run: null,
    accounting: null,
    collectors: [],
    producers: [],
    omittedCollectorCount: 0,
    omittedProducerCount: 0,
    safety: safety()
  };
}

export function buildTrafficCollectorAdminProjection({ summary, observedAt, producerStatuses = [] } = {}) {
  if (!isRecord(summary)) {
    throw projectionError("traffic collector summary is required");
  }
  if (text(summary.type) !== "traffic_usage_collect_once") {
    throw projectionError("traffic collector summary type is invalid");
  }
  const safeObservedAt = isoOrNull(observedAt);
  if (!safeObservedAt) {
    throw projectionError("observedAt must be a valid ISO timestamp");
  }

  const reports = Array.isArray(summary.reports) ? summary.reports : [];
  const collectors = reports
    .map((report) => collectorProjection({
      collectorState: report?.collectorState,
      blockers: report?.blockers,
      observability: report?.observability
    }))
    .filter(Boolean)
    .sort(sortCollectors);
  const unresolvedCount = nonNegativeInteger(summary.unresolvedCount);
  const rawProducers = Array.isArray(producerStatuses) ? producerStatuses : [];
  const producers = rawProducers
    .map((entry) => sanitizeTrafficCollectorProducerStatus(entry))
    .filter(Boolean)
    .sort(sortProducers);

  return {
    type: "traffic_collector_admin_projection",
    schemaVersion: "1",
    availability: AVAILABLE,
    observedAt: safeObservedAt,
    run: {
      runOk: summary.ok === true,
      rawReportOk: summary.rawReportOk === true,
      collectorCount: nonNegativeInteger(summary.collectorCount),
      idleCollectorCount: nonNegativeInteger(summary.idleCollectorCount)
    },
    accounting: {
      recordingOk: unresolvedCount === 0,
      observationCount: nonNegativeInteger(summary.observationCount),
      recordedCount: nonNegativeInteger(summary.recordedCount),
      insertedCount: nonNegativeInteger(summary.insertedCount),
      unresolvedCount
    },
    collectors,
    producers,
    omittedCollectorCount: reports.length - collectors.length,
    omittedProducerCount: rawProducers.length - producers.length,
    safety: safety()
  };
}

export function sanitizeTrafficCollectorAdminProjection(value) {
  if (!isRecord(value)) {
    return createUnavailableTrafficCollectorAdminProjection("invalid_observation");
  }
  if (value.availability !== AVAILABLE) {
    const unavailable = createUnavailableTrafficCollectorAdminProjection(value.availability);
    const rawProducers = value.producers === undefined
      ? []
      : Array.isArray(value.producers)
        ? value.producers
        : null;
    if (rawProducers === null) return unavailable;
    const producers = rawProducers
      .map((entry) => sanitizeTrafficCollectorProducerStatus(entry))
      .filter(Boolean)
      .sort(sortProducers);
    return {
      ...unavailable,
      producers,
      omittedProducerCount: nonNegativeInteger(value.omittedProducerCount)
        + (rawProducers.length - producers.length)
    };
  }
  if (text(value.type) !== "traffic_collector_admin_projection" || text(value.schemaVersion) !== "1") {
    return createUnavailableTrafficCollectorAdminProjection("invalid_observation");
  }
  const observedAt = isoOrNull(value.observedAt);
  if (
    !observedAt
    || !isRecord(value.run)
    || !isRecord(value.accounting)
    || !Array.isArray(value.collectors)
  ) {
    return createUnavailableTrafficCollectorAdminProjection("invalid_observation");
  }

  const rawCollectors = Array.isArray(value.collectors) ? value.collectors : [];
  const collectors = rawCollectors
    .map((entry) => collectorProjection({
      collectorState: entry,
      reasonCodes: entry?.reasonCodes,
      observability: entry?.observability
    }))
    .filter(Boolean)
    .sort(sortCollectors);
  const unresolvedCount = nonNegativeInteger(value.accounting.unresolvedCount);
  const rawProducers = value.producers === undefined
    ? []
    : Array.isArray(value.producers)
      ? value.producers
      : null;
  if (rawProducers === null) {
    return createUnavailableTrafficCollectorAdminProjection("invalid_observation");
  }
  const producers = rawProducers
    .map((entry) => sanitizeTrafficCollectorProducerStatus(entry))
    .filter(Boolean)
    .sort(sortProducers);

  return {
    type: "traffic_collector_admin_projection",
    schemaVersion: "1",
    availability: AVAILABLE,
    observedAt,
    run: {
      runOk: value.run.runOk === true,
      rawReportOk: value.run.rawReportOk === true,
      collectorCount: nonNegativeInteger(value.run.collectorCount),
      idleCollectorCount: nonNegativeInteger(value.run.idleCollectorCount)
    },
    accounting: {
      recordingOk: value.accounting.recordingOk === true && unresolvedCount === 0,
      observationCount: nonNegativeInteger(value.accounting.observationCount),
      recordedCount: nonNegativeInteger(value.accounting.recordedCount),
      insertedCount: nonNegativeInteger(value.accounting.insertedCount),
      unresolvedCount
    },
    collectors,
    producers,
    omittedCollectorCount: nonNegativeInteger(value.omittedCollectorCount)
      + (rawCollectors.length - collectors.length),
    omittedProducerCount: nonNegativeInteger(value.omittedProducerCount)
      + (rawProducers.length - producers.length),
    safety: safety()
  };
}

export function createFileTrafficCollectorStatusStore({ filePath } = {}) {
  const normalizedPath = text(filePath);
  if (!normalizedPath || !isAbsolute(normalizedPath)) {
    throw projectionError("traffic collector status file path must be absolute");
  }
  const resolvedPath = resolve(normalizedPath);

  function readBase() {
    if (!existsSync(resolvedPath)) {
      return createUnavailableTrafficCollectorAdminProjection("not_observed");
    }
    try {
      if (statSync(resolvedPath).size > MAX_SNAPSHOT_BYTES) {
        return createUnavailableTrafficCollectorAdminProjection("invalid_observation");
      }
      const payload = readFileSync(resolvedPath, "utf8");
      if (Buffer.byteLength(payload, "utf8") > MAX_SNAPSHOT_BYTES) {
        return createUnavailableTrafficCollectorAdminProjection("invalid_observation");
      }
      return sanitizeTrafficCollectorAdminProjection(JSON.parse(payload));
    } catch {
      return createUnavailableTrafficCollectorAdminProjection("invalid_observation");
    }
  }

  function producerPath(producerRef) {
    const suffix = PRODUCER_FILE_SUFFIX[producerRef];
    return suffix ? `${resolvedPath}.${suffix}.json` : "";
  }

  function readProducerStatus(producerRef) {
    const path = producerPath(producerRef);
    if (!path || !existsSync(path)) {
      return createUnavailableTrafficCollectorProducerStatus(producerRef, "not_observed");
    }
    try {
      if (statSync(path).size > MAX_SNAPSHOT_BYTES) {
        return createUnavailableTrafficCollectorProducerStatus(producerRef, "invalid_observation");
      }
      const payload = readFileSync(path, "utf8");
      if (Buffer.byteLength(payload, "utf8") > MAX_SNAPSHOT_BYTES) {
        return createUnavailableTrafficCollectorProducerStatus(producerRef, "invalid_observation");
      }
      const status = sanitizeTrafficCollectorProducerStatus(JSON.parse(payload));
      return status?.producerRef === producerRef
        ? status
        : createUnavailableTrafficCollectorProducerStatus(producerRef, "invalid_observation");
    } catch {
      return createUnavailableTrafficCollectorProducerStatus(producerRef, "invalid_observation");
    }
  }

  function withProducerStatuses(projection) {
    const producers = TRAFFIC_COLLECTOR_PRODUCER_REFS
      .map((producerRef) => readProducerStatus(producerRef))
      .filter(Boolean)
      .sort(sortProducers);
    return {
      ...projection,
      producers,
      omittedProducerCount: nonNegativeInteger(projection.omittedProducerCount)
    };
  }

  function read() {
    return withProducerStatuses(readBase());
  }

  function writeAtomic(path, value) {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    let ownership;
    try {
      const ownershipPath = existsSync(path)
        ? path
        : path !== resolvedPath && existsSync(resolvedPath)
          ? resolvedPath
          : dirname(path);
      const source = statSync(ownershipPath);
      ownership = { uid: source.uid, gid: source.gid };
    } catch {
      ownership = null;
    }
    const temporaryPath = `${path}.${process.pid}.tmp`;
    try {
      writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
      if (ownership) {
        try {
          chownSync(temporaryPath, ownership.uid, ownership.gid);
        } catch {
          // Best effort on platforms or filesystems without chown support.
        }
      }
      chmodSync(temporaryPath, 0o600);
      renameSync(temporaryPath, path);
      chmodSync(path, 0o600);
    } catch (error) {
      try {
        if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
      } catch {
        // Preserve the original write failure without exposing cleanup details.
      }
      throw error;
    }
  }

  function withProducerWriteLock(path, callback) {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    const lockPath = `${path}.lock`;
    const deadline = Date.now() + PRODUCER_LOCK_TIMEOUT_MS;
    while (true) {
      try {
        mkdirSync(lockPath, { mode: 0o700 });
        break;
      } catch (error) {
        if (error?.code !== "EEXIST") throw error;
        try {
          if (Date.now() - statSync(lockPath).mtimeMs > PRODUCER_STALE_LOCK_MS) {
            rmdirSync(lockPath);
            continue;
          }
        } catch (lockError) {
          if (lockError?.code === "ENOENT") continue;
        }
        if (Date.now() >= deadline) {
          throw projectionError("traffic collector producer status write is busy");
        }
        Atomics.wait(PRODUCER_LOCK_SIGNAL, 0, 0, PRODUCER_LOCK_WAIT_MS);
      }
    }
    try {
      return callback();
    } finally {
      try {
        rmdirSync(lockPath);
      } catch {
        // Preserve the write result without exposing lock cleanup details.
      }
    }
  }

  function write(input = {}) {
    const projection = preserveLastCollectorSuccess(
      buildTrafficCollectorAdminProjection(input),
      readBase()
    );
    writeAtomic(resolvedPath, projection);
    return withProducerStatuses(projection);
  }

  function writeProducerStatus(value) {
    let status = sanitizeTrafficCollectorProducerStatus(value);
    if (!status || status.availability !== AVAILABLE) {
      throw projectionError("traffic collector producer status is invalid");
    }
    const path = producerPath(status.producerRef);
    return withProducerWriteLock(path, () => {
      const previous = readProducerStatus(status.producerRef);
      if (
        previous?.availability === AVAILABLE
        && Date.parse(status.observedAt) <= Date.parse(previous.observedAt)
      ) {
        return previous;
      }
      if (!status.lastSuccessAt && previous?.lastSuccessAt) {
        status = { ...status, lastSuccessAt: previous.lastSuccessAt };
      }
      writeAtomic(path, status);
      return status;
    });
  }

  return { read, write, writeProducerStatus };
}
