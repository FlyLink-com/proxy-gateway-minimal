import {
  chmodSync,
  mkdirSync,
  renameSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { randomUUID } from "node:crypto";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";

const MAX_OBSERVATION_BYTES = 256 * 1024;
const JAPAN_TUIC_CHANNEL_REF = "channel-vultr-a-tuic";

function validationError(message) {
  const error = new Error(message);
  error.code = "validation_error";
  return error;
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonNegativeSafeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function canonicalIsoTimestamp(value) {
  if (typeof value !== "string") return null;
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) || timestamp.toISOString() !== value
    ? null
    : timestamp;
}

function requireRedacted(value) {
  return isRecord(value?.safety) && value.safety.redacted === true;
}

function requireAcceptedProjection(projection) {
  if (!isRecord(projection)
    || projection.type !== "traffic_collector_admin_projection"
    || projection.schemaVersion !== "1"
    || projection.availability !== "available"
    || !requireRedacted(projection)) {
    throw validationError("Japan TUIC repair observation requires a redacted available projection");
  }

  const observedAt = canonicalIsoTimestamp(projection.observedAt);
  if (!observedAt) {
    throw validationError("Japan TUIC repair observation requires a valid observedAt timestamp");
  }

  if (!isRecord(projection.run)
    || projection.run.runOk !== true
    || projection.run.rawReportOk !== true
    || !isNonNegativeSafeInteger(projection.run.collectorCount)) {
    throw validationError("Japan TUIC repair observation requires a successful collector run");
  }

  if (!isRecord(projection.accounting)
    || projection.accounting.recordingOk !== true
    || projection.accounting.unresolvedCount !== 0
    || projection.omittedCollectorCount !== 0) {
    throw validationError("Japan TUIC repair observation requires complete resolved accounting");
  }

  if (!Array.isArray(projection.collectors)) {
    throw validationError("Japan TUIC repair observation requires collector projections");
  }
  const japanCollector = projection.collectors.find((collector) => (
    isRecord(collector) && collector.channelRef === JAPAN_TUIC_CHANNEL_REF
  ));
  if (!japanCollector
    || !requireRedacted(japanCollector)
    || japanCollector.health !== "healthy"
    || japanCollector.condition !== "ok"
    || japanCollector.unresolvedCount !== 0) {
    throw validationError("Japan TUIC collector is not accepted");
  }

  const lastCollectorSuccessAt = canonicalIsoTimestamp(japanCollector.lastCollectorSuccessAt);
  if (!lastCollectorSuccessAt || observedAt < lastCollectorSuccessAt) {
    throw validationError("Japan TUIC observation precedes collector success");
  }

  return { observedAt: projection.observedAt, japanCollector };
}

export function buildJapanTuicRepairObservation({ projection } = {}) {
  const { observedAt, japanCollector } = requireAcceptedProjection(projection);
  return {
    schemaVersion: "1",
    type: "japan_tuic_repair_observation",
    capturedAt: observedAt,
    collectorCount: projection.run.collectorCount,
    unresolvedTotal: projection.accounting.unresolvedCount,
    japanTuicUnresolved: japanCollector.unresolvedCount,
    accepted: true
  };
}

export function createJapanTuicRepairObservationStore({ filePath } = {}) {
  if (typeof filePath !== "string" || !isAbsolute(filePath)) {
    throw validationError("Japan TUIC observation filePath must be absolute");
  }
  const path = resolve(filePath);

  return {
    write({ projection } = {}) {
      const observation = buildJapanTuicRepairObservation({ projection });
      const serialized = `${JSON.stringify(observation)}\n`;
      if (Buffer.byteLength(serialized, "utf8") > MAX_OBSERVATION_BYTES) {
        throw validationError("Japan TUIC observation exceeds the size limit");
      }

      const parentDirectory = dirname(path);
      mkdirSync(parentDirectory, { recursive: true, mode: 0o700 });
      chmodSync(parentDirectory, 0o700);
      const temporaryPath = `${join(parentDirectory, `.${basename(path)}.tmp-${process.pid}-${randomUUID()}`)}`;
      try {
        writeFileSync(temporaryPath, serialized, {
          encoding: "utf8",
          mode: 0o600,
          flag: "wx"
        });
        chmodSync(temporaryPath, 0o600);
        renameSync(temporaryPath, path);
        chmodSync(path, 0o600);
      } catch (error) {
        try {
          unlinkSync(temporaryPath);
        } catch (cleanupError) {
          if (cleanupError?.code !== "ENOENT") throw cleanupError;
        }
        throw error;
      }

      return observation;
    }
  };
}
