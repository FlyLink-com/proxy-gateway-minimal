#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const KNOWN_DELTA_SOURCE_REFS = new Set([
  "hysteria2_traffic_stats",
  "mihomo_connection_delta"
]);

function inputError() {
  return new Error("traffic_accounting_observation_input_invalid");
}

function record(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw inputError();
  }
  return value;
}

function records(value) {
  if (!Array.isArray(value)) throw inputError();
  return value.map(record);
}

function nonNegativeInteger(value) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw inputError();
  }
  return value;
}

function positiveInteger(value) {
  const normalized = nonNegativeInteger(value);
  if (normalized < 1) throw inputError();
  return normalized;
}

function requiredText(value) {
  if (typeof value !== "string") throw inputError();
  const normalized = value.trim();
  if (!normalized) throw inputError();
  return normalized;
}

function requiredBoolean(value) {
  if (typeof value !== "boolean") throw inputError();
  return value;
}

function timestamp(value) {
  if (typeof value !== "string") throw inputError();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw inputError();
  return parsed.toISOString();
}

function cursorKey(value) {
  return [
    requiredText(value.source_ref),
    requiredText(value.channel_ref),
    requiredText(value.edge_credential_ref)
  ].join("\0");
}

function cursorRow(value) {
  const row = record(value);
  return {
    sourceRef: requiredText(row.source_ref),
    key: cursorKey(row),
    uploadBytes: nonNegativeInteger(row.upload_bytes),
    downloadBytes: nonNegativeInteger(row.download_bytes),
    epoch: nonNegativeInteger(row.epoch)
  };
}

function sampleRow(value) {
  const row = record(value);
  return {
    sourceRef: requiredText(row.source_ref),
    key: cursorKey(row),
    totalBytes: nonNegativeInteger(row.total_bytes),
    digest: requiredText(row.sample_digest)
  };
}

function uniqueCursorMap(value) {
  const rows = records(value).map(cursorRow);
  const map = new Map();
  for (const row of rows) {
    if (map.has(row.key)) throw inputError();
    map.set(row.key, row);
  }
  return { rows, map };
}

function boundary(value) {
  const normalized = record(value);
  return {
    count: "count" in normalized ? nonNegativeInteger(normalized.count) : null,
    totalBytes: nonNegativeInteger(normalized.totalBytes)
  };
}

function reasonCounts(value = {}) {
  const normalized = record(value);
  return {
    bindingMissing: nonNegativeInteger(normalized.bindingMissing ?? 0),
    channelMismatch: nonNegativeInteger(normalized.channelMismatch ?? 0),
    unknown: nonNegativeInteger(normalized.unknown ?? 0)
  };
}

function projectionEvidence(value) {
  const projection = record(value);
  const run = record(projection.run);
  const accounting = record(projection.accounting);
  const collectors = records(projection.collectors);
  const producers = records(projection.producers);
  const unresolvedReasonCounts = reasonCounts(accounting.unresolvedReasonCounts ?? {});
  let collectorCountsConserved = true;
  const collectorReasonCounts = collectors.reduce((aggregate, collector) => {
    const counts = reasonCounts(collector.unresolvedReasonCounts ?? {});
    const collectorUnresolvedCount = nonNegativeInteger(collector.unresolvedCount ?? 0);
    collectorCountsConserved &&= collectorUnresolvedCount
      === counts.bindingMissing + counts.channelMismatch + counts.unknown;
    aggregate.bindingMissing += counts.bindingMissing;
    aggregate.channelMismatch += counts.channelMismatch;
    aggregate.unknown += counts.unknown;
    return aggregate;
  }, { bindingMissing: 0, channelMismatch: 0, unknown: 0 });
  const collectorCount = nonNegativeInteger(run.collectorCount);
  const omittedCollectors = nonNegativeInteger(projection.omittedCollectorCount ?? 0);
  const omittedProducers = nonNegativeInteger(projection.omittedProducerCount ?? 0);
  const unresolvedTotal = nonNegativeInteger(accounting.unresolvedCount ?? 0);
  const availability = requiredText(projection.availability);
  const runOk = requiredBoolean(run.runOk);
  const rawReportOk = requiredBoolean(run.rawReportOk);
  const recordingOk = requiredBoolean(accounting.recordingOk);
  const unresolvedStateValid = unresolvedTotal === 0
    ? rawReportOk && recordingOk
    : !rawReportOk && !recordingOk && unresolvedReasonCounts.unknown === 0;
  const provenanceConserved = availability === "available"
    && runOk
    && collectorCount === collectors.length + omittedCollectors
    && omittedCollectors === 0
    && omittedProducers === 0
    && collectorCountsConserved
    && unresolvedReasonCounts.bindingMissing === collectorReasonCounts.bindingMissing
    && unresolvedReasonCounts.channelMismatch === collectorReasonCounts.channelMismatch
    && unresolvedReasonCounts.unknown === collectorReasonCounts.unknown
    && unresolvedTotal === unresolvedReasonCounts.bindingMissing
      + unresolvedReasonCounts.channelMismatch
      + unresolvedReasonCounts.unknown
    && unresolvedStateValid;

  return {
    runOk,
    rawReportOk,
    recordingOk,
    collectorCount,
    visibleCollectors: collectors.length,
    omittedCollectors,
    visibleProducers: producers.length,
    omittedProducers,
    unresolvedTotal,
    unresolvedReasonCounts,
    provenanceConserved
  };
}

function cumulativeSourceSet(value) {
  if (!Array.isArray(value)) throw inputError();
  const refs = value.map(requiredText);
  const unique = new Set(refs);
  if (unique.size !== refs.length) throw inputError();
  return unique;
}

function accountingEvidence({ cumulativeSourceRefs, previous, current }) {
  const cumulativeSources = cumulativeSourceSet(cumulativeSourceRefs);
  const previousState = record(previous);
  const currentState = record(current);
  const previousCursors = uniqueCursorMap(previousState.cursorRows);
  const currentCursors = uniqueCursorMap(currentState.cursorRows);
  const samples = records(currentState.newSamples).map(sampleRow);
  const previousSampleBoundary = boundary(previousState.sampleBoundary);
  const currentSampleBoundary = boundary(currentState.sampleBoundary);
  const previousRollupBoundary = boundary(previousState.rollupBoundary);
  const currentRollupBoundary = boundary(currentState.rollupBoundary);

  if (previousSampleBoundary.count === null || currentSampleBoundary.count === null) {
    throw inputError();
  }

  const samplesByKey = new Map();
  for (const sample of samples) {
    if (!samplesByKey.has(sample.key)) samplesByKey.set(sample.key, []);
    samplesByKey.get(sample.key).push(sample);
  }

  let removedCursorCount = 0;
  for (const key of previousCursors.map.keys()) {
    if (!currentCursors.map.has(key)) removedCursorCount += 1;
  }

  let acceptedPositiveCursorGrowth = 0;
  let cumulativeSampleBytes = 0;
  let cumulativeSampleCount = 0;
  let cumulativeZeroByteSamples = 0;
  let cursorInitializations = 0;
  let cursorResets = 0;
  let cursorEpochRegressions = 0;
  let cumulativeViolations = 0;

  for (const [key, currentCursor] of currentCursors.map) {
    if (!cumulativeSources.has(currentCursor.sourceRef)) continue;
    const previousCursor = previousCursors.map.get(key);
    const cursorSamples = samplesByKey.get(key) ?? [];
    if (!previousCursor) {
      cursorInitializations += 1;
      cumulativeViolations += cursorSamples.length;
      continue;
    }

    if (currentCursor.epoch < previousCursor.epoch) {
      cursorEpochRegressions += 1;
      cumulativeViolations += cursorSamples.length;
      continue;
    }

    const uploadDecreased = currentCursor.uploadBytes < previousCursor.uploadBytes;
    const downloadDecreased = currentCursor.downloadBytes < previousCursor.downloadBytes;
    const componentReset = uploadDecreased || downloadDecreased;
    const epochIncreased = currentCursor.epoch > previousCursor.epoch;
    const reset = componentReset || epochIncreased;
    if (reset) {
      cursorResets += 1;
      if (
        componentReset !== epochIncreased
        || currentCursor.epoch > previousCursor.epoch + 1
      ) {
        cumulativeViolations += 1;
      }
      cumulativeViolations += cursorSamples.length;
      continue;
    }

    const growth = currentCursor.uploadBytes - previousCursor.uploadBytes
      + currentCursor.downloadBytes - previousCursor.downloadBytes;
    if (growth > 0) {
      const bytes = cursorSamples.reduce((sum, sample) => sum + sample.totalBytes, 0);
      acceptedPositiveCursorGrowth += growth;
      cumulativeSampleBytes += bytes;
      cumulativeSampleCount += cursorSamples.length;
      cumulativeZeroByteSamples += cursorSamples.filter(
        (sample) => sample.totalBytes === 0
      ).length;
      if (cursorSamples.length < 1 || bytes !== growth) cumulativeViolations += 1;
    } else if (cursorSamples.length > 0) {
      cumulativeViolations += cursorSamples.length;
    }
  }

  for (const sample of samples) {
    if (
      cumulativeSources.has(sample.sourceRef)
      && !currentCursors.map.has(sample.key)
    ) {
      cumulativeViolations += 1;
    }
  }

  const knownDeltaSourceCursorRows = currentCursors.rows.filter(
    (cursor) => KNOWN_DELTA_SOURCE_REFS.has(cursor.sourceRef)
  ).length;
  const unclassifiedCursorRows = currentCursors.rows.filter(
    (cursor) => !cumulativeSources.has(cursor.sourceRef)
  ).length;
  const deltaSampleCount = samples.filter(
    (sample) => KNOWN_DELTA_SOURCE_REFS.has(sample.sourceRef)
  ).length;
  const unclassifiedSampleRows = samples.filter(
    (sample) => !cumulativeSources.has(sample.sourceRef)
      && !KNOWN_DELTA_SOURCE_REFS.has(sample.sourceRef)
  ).length;
  const newSampleBytes = samples.reduce((sum, sample) => sum + sample.totalBytes, 0);
  const sampleConservation = currentSampleBoundary.count - previousSampleBoundary.count
      === samples.length
    && currentSampleBoundary.totalBytes - previousSampleBoundary.totalBytes
      === newSampleBytes;
  const rollupConservation = currentRollupBoundary.totalBytes
      - previousRollupBoundary.totalBytes
    === newSampleBytes;
  const uniqueDigests = new Set(samples.map((sample) => sample.digest)).size
    === samples.length;

  return {
    cursorCountBefore: previousCursors.rows.length,
    cursorCountAfter: currentCursors.rows.length,
    removedCursorCount,
    newSampleCount: samples.length,
    newSampleBytes,
    cumulativeSampleCount,
    cumulativeSampleBytes,
    acceptedPositiveCursorGrowth,
    cumulativeZeroByteSamples,
    cursorInitializations,
    cursorResets,
    cursorEpochRegressions,
    cumulativeViolations,
    knownDeltaSourceCursorRows,
    unclassifiedCursorRows,
    deltaSampleCount,
    unclassifiedSampleRows,
    sampleConservation,
    rollupConservation,
    uniqueDigests,
    attributionInvalid: nonNegativeInteger(currentState.attributionInvalid),
    overQuota: nonNegativeInteger(currentState.overQuota)
  };
}

export function buildTrafficAccountingNaturalObservation(input = {}) {
  const value = record(input);
  const current = record(value.current);
  const collectorInvocationObserved = requiredBoolean(value.collectorInvocationObserved);
  const sidecarInvocationObserved = requiredBoolean(value.sidecarInvocationObserved);
  const projection = projectionEvidence(value.projection);
  const accounting = accountingEvidence({
    cumulativeSourceRefs: value.cumulativeSourceRefs,
    previous: value.previous,
    current
  });
  const lifecycle = {
    entitlementsRequestsLinksUnchanged: requiredBoolean(
      current.entitlementsRequestsLinksUnchanged
    ),
    receiptRegression: requiredBoolean(current.receiptRegression),
    notificationRegression: requiredBoolean(current.notificationRegression)
  };
  const boundaries = {
    databasesValid: requiredBoolean(current.databasesValid),
    protectedIdentityUnchanged: requiredBoolean(current.protectedIdentityUnchanged)
  };
  const passed = collectorInvocationObserved
    && sidecarInvocationObserved
    && projection.provenanceConserved
    && accounting.removedCursorCount === 0
    && accounting.cumulativeViolations === 0
    && accounting.cumulativeZeroByteSamples === 0
    && accounting.cursorEpochRegressions === 0
    && accounting.knownDeltaSourceCursorRows === 0
    && accounting.unclassifiedCursorRows === 0
    && accounting.unclassifiedSampleRows === 0
    && accounting.sampleConservation
    && accounting.rollupConservation
    && accounting.uniqueDigests
    && accounting.attributionInvalid === 0
    && accounting.overQuota === 0
    && lifecycle.entitlementsRequestsLinksUnchanged
    && !lifecycle.receiptRegression
    && !lifecycle.notificationRegression
    && boundaries.databasesValid
    && boundaries.protectedIdentityUnchanged;

  return {
    schemaVersion: "1",
    type: "traffic_accounting_natural_observation",
    round: positiveInteger(value.round),
    capturedAt: timestamp(value.capturedAt),
    collectorInvocationObserved,
    sidecarInvocationObserved,
    projection,
    accounting,
    lifecycle,
    boundaries,
    passed
  };
}

async function readProtectedInput(stream, maxBytes = 4 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of stream) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > maxBytes) throw inputError();
    chunks.push(bytes);
  }
  if (size === 0) throw inputError();
  return Buffer.concat(chunks).toString("utf8");
}

export async function runTrafficAccountingNaturalObservationCli({
  stdin = process.stdin,
  stdout = process.stdout,
  stderr = process.stderr
} = {}) {
  try {
    const input = JSON.parse(await readProtectedInput(stdin));
    const report = buildTrafficAccountingNaturalObservation(input);
    stdout.write(`${JSON.stringify(report)}\n`);
    return report.passed ? 0 : 2;
  } catch {
    stderr.write(`${JSON.stringify({
      schemaVersion: "1",
      type: "traffic_accounting_natural_observation",
      state: "error",
      condition: "invalid_input"
    })}\n`);
    return 1;
  }
}

function isDirectInvocation() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isDirectInvocation() || process.argv[1] === "-") {
  process.exitCode = await runTrafficAccountingNaturalObservationCli();
}
