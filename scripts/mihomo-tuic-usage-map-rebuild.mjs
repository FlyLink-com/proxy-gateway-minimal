#!/usr/bin/env node
import { realpathSync, readFileSync, renameSync, statSync, writeFileSync, chmodSync, chownSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createFileTrafficCollectorStatusStore } from "../server/services/platform/traffic-collector-admin-projection.mjs";
import { buildMihomoTuicUsageCredentialMapProducerStatus } from "../server/services/platform/traffic-collector-status-producers.mjs";

export { buildMihomoTuicUsageCredentialMapProducerStatus };

const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/ig;
const SAFE_REF_PATTERN = /^[A-Za-z0-9._:-]{1,160}$/;
const SAFE_ERROR_CODES = new Set([
  "candidate_not_ready",
  "EACCES",
  "EISDIR",
  "ENOENT",
  "EPERM",
  "expected_count_mismatch",
  "validation_error"
]);
const CANONICAL_REBUILD_STRATEGY = "canonical_rebuild";
const ADDITIVE_MISSING_ONLY_STRATEGY = "additive_missing_only";

function text(value) {
  return String(value ?? "").trim();
}

function readJsonFile(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function normalizeMaterialRecords(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.records)) return value.records;
  return [];
}

function materialMapFrom(records = []) {
  const byUuid = new Map();
  for (const record of normalizeMaterialRecords(records)) {
    const uuid = text(record?.material?.uuid).toLowerCase();
    const credentialRef = text(record?.credentialRef);
    if (uuid && credentialRef && SAFE_REF_PATTERN.test(credentialRef)) {
      byUuid.set(uuid, credentialRef);
    }
  }
  return byUuid;
}

function uuidSetFromMihomoConfig(configText) {
  return [...new Set((text(configText).match(UUID_PATTERN) || []).map((uuid) => uuid.toLowerCase()))].sort();
}

function rebuildMap({ mihomoConfigText, materialRecords }) {
  const materialByUuid = materialMapFrom(materialRecords);
  const rebuilt = {};
  let missingMaterial = 0;
  for (const uuid of uuidSetFromMihomoConfig(mihomoConfigText)) {
    const credentialRef = materialByUuid.get(uuid);
    if (credentialRef) {
      rebuilt[uuid] = credentialRef;
    } else {
      missingMaterial += 1;
    }
  }
  return { rebuilt, missingMaterial };
}

function lowerKeySet(value = {}) {
  return new Set(Object.keys(value || {}).map((key) => key.toLowerCase()));
}

function lowerEntryMap(value = {}) {
  return new Map(Object.entries(value || {}).map(([key, entry]) => [
    key.toLowerCase(),
    text(entry)
  ]));
}

function countDiff(left, right) {
  return [...left].filter((key) => !right.has(key)).length;
}

function normalizeStrategy(value) {
  const strategy = text(value) || CANONICAL_REBUILD_STRATEGY;
  if (![CANONICAL_REBUILD_STRATEGY, ADDITIVE_MISSING_ONLY_STRATEGY].includes(strategy)) {
    const error = new Error("unsupported strategy");
    error.code = "validation_error";
    throw error;
  }
  return strategy;
}

function buildAdditiveCandidate({
  currentMap,
  rebuiltMap,
  missingMaterial,
  applied = false
}) {
  const currentKeys = lowerKeySet(currentMap);
  const rebuiltKeys = lowerKeySet(rebuiltMap);
  const currentEntries = lowerEntryMap(currentMap);
  const rebuiltEntries = lowerEntryMap(rebuiltMap);
  const addCount = countDiff(rebuiltKeys, currentKeys);
  const deferredRemoveCount = countDiff(currentKeys, rebuiltKeys);
  const deferredChangedCount = [...rebuiltEntries].filter(([key, value]) => (
    currentEntries.has(key) && currentEntries.get(key) !== value
  )).length;

  return {
    strategy: ADDITIVE_MISSING_ONLY_STRATEGY,
    ready: missingMaterial === 0 && deferredChangedCount === 0,
    applied,
    projectedMapCount: currentKeys.size + addCount,
    addCount,
    removeCount: 0,
    deferredRemoveCount,
    changedCount: 0,
    deferredChangedCount,
    missingMaterialCount: missingMaterial
  };
}

function buildAdditiveMap({ currentMap, rebuiltMap }) {
  const candidateMap = { ...currentMap };
  const currentKeys = lowerKeySet(currentMap);
  for (const [uuid, credentialRef] of Object.entries(rebuiltMap)) {
    if (!currentKeys.has(uuid.toLowerCase())) {
      candidateMap[uuid] = credentialRef;
    }
  }
  return candidateMap;
}

function additiveNextAction(candidate, { applied = false } = {}) {
  if (candidate.missingMaterialCount > 0) {
    return "resolve_missing_material_before_usage_map_apply";
  }
  if (candidate.deferredChangedCount > 0) {
    return "resolve_changed_binding_before_additive_apply";
  }
  if (applied) {
    return "run_traffic_usage_collector_validation_then_continue_retention_review";
  }
  return candidate.addCount > 0
    ? "apply_additive_candidate_after_operator_approval"
    : "no_additive_repair_required";
}

function withAdditiveCandidate(report, candidate, { applied = false } = {}) {
  return {
    ...report,
    ok: candidate.ready,
    candidateReady: candidate.ready,
    candidate,
    nextAction: additiveNextAction(candidate, { applied })
  };
}

function modeText(mode) {
  return (mode & 0o777).toString(8).padStart(3, "0");
}

function baseReport({
  mode,
  currentMap,
  rebuiltMap,
  missingMaterial,
  applied = false,
  finalMode = ""
}) {
  const currentKeys = lowerKeySet(currentMap);
  const rebuiltKeys = lowerKeySet(rebuiltMap);
  const currentEntries = lowerEntryMap(currentMap);
  const rebuiltEntries = lowerEntryMap(rebuiltMap);
  const addCount = countDiff(rebuiltKeys, currentKeys);
  const removeCount = countDiff(currentKeys, rebuiltKeys);
  const changedCount = [...rebuiltEntries].filter(([key, value]) => (
    currentEntries.has(key) && currentEntries.get(key) !== value
  )).length;
  const candidateReady = missingMaterial === 0;
  return {
    type: "mihomo_tuic_usage_credential_map_rebuild",
    ok: candidateReady,
    mode,
    applied,
    currentMapCount: currentKeys.size,
    rebuiltMapCount: rebuiltKeys.size,
    addCount,
    removeCount,
    changedCount,
    missingMaterial,
    candidateReady,
    ...(finalMode ? { finalMode } : {}),
    nextAction: candidateReady
      ? (applied ? "run_traffic_usage_collector_validation" : "apply_after_operator_approval")
      : "resolve_missing_material_before_usage_map_apply",
    safety: {
      noRawRuntimePayload: true,
      noSecretMaterialReturned: true,
      redacted: true
    }
  };
}

export function buildMihomoTuicUsageCredentialMapReport({
  strategy,
  mihomoConfigText,
  materialRecords = [],
  currentMap = {}
} = {}) {
  const safeStrategy = normalizeStrategy(strategy);
  const { rebuilt, missingMaterial } = rebuildMap({ mihomoConfigText, materialRecords });
  const report = baseReport({
    mode: "dry-run",
    currentMap,
    rebuiltMap: rebuilt,
    missingMaterial
  });
  if (safeStrategy === CANONICAL_REBUILD_STRATEGY) return report;
  return withAdditiveCandidate(report, buildAdditiveCandidate({
    currentMap,
    rebuiltMap: rebuilt,
    missingMaterial
  }));
}

function assertExpectedCounts(report, {
  expectedAddCount,
  expectedRemoveCount,
  expectedChangedCount,
  expectedMissingMaterial
} = {}) {
  const expected = [
    ["expectedAddCount", expectedAddCount, report.addCount],
    ["expectedRemoveCount", expectedRemoveCount, report.removeCount],
    ["expectedChangedCount", expectedChangedCount, report.changedCount],
    ["expectedMissingMaterial", expectedMissingMaterial, report.missingMaterial]
  ];
  for (const [field, value, actual] of expected) {
    if (value !== undefined && Number(value) !== Number(actual)) {
      const error = new Error(`${field} mismatch`);
      error.code = "expected_count_mismatch";
      throw error;
    }
  }
}

function assertRequiredAdditiveExpectedCounts({
  expectedAddCount,
  expectedRemoveCount,
  expectedChangedCount,
  expectedMissingMaterial,
  expectedDeferredRemoveCount,
  expectedProjectedMapCount
} = {}) {
  const required = [
    expectedAddCount,
    expectedRemoveCount,
    expectedChangedCount,
    expectedMissingMaterial,
    expectedDeferredRemoveCount,
    expectedProjectedMapCount
  ];
  if (required.some((value) => value === undefined)) {
    const error = new Error("complete additive expected counts are required");
    error.code = "validation_error";
    throw error;
  }
}

function assertAdditiveExpectedCounts(candidate, expected = {}) {
  assertRequiredAdditiveExpectedCounts(expected);
  assertExpectedCounts({
    addCount: candidate.addCount,
    removeCount: candidate.removeCount,
    changedCount: candidate.changedCount,
    missingMaterial: candidate.missingMaterialCount
  }, expected);
  if (Number(expected.expectedDeferredRemoveCount) !== Number(candidate.deferredRemoveCount)) {
    const error = new Error("expectedDeferredRemoveCount mismatch");
    error.code = "expected_count_mismatch";
    throw error;
  }
  if (Number(expected.expectedProjectedMapCount) !== Number(candidate.projectedMapCount)) {
    const error = new Error("expectedProjectedMapCount mismatch");
    error.code = "expected_count_mismatch";
    throw error;
  }
}

function replaceProtectedMap({ mapPath, nextMap }) {
  const before = statSync(mapPath);
  const tmpPath = `${mapPath}.${process.pid}.tmp`;
  writeFileSync(tmpPath, `${JSON.stringify(nextMap, null, 2)}\n`, { mode: 0o600 });
  try {
    chownSync(tmpPath, before.uid, before.gid);
  } catch {
    // Best effort for platforms without chown support.
  }
  chmodSync(tmpPath, 0o600);
  renameSync(tmpPath, mapPath);
  try {
    chownSync(mapPath, before.uid, before.gid);
  } catch {
    // Best effort for platforms without chown support.
  }
  chmodSync(mapPath, 0o600);
  return statSync(mapPath);
}

export function applyMihomoTuicUsageCredentialMap({
  strategy,
  mapPath,
  mihomoConfigText,
  materialRecords = [],
  expectedAddCount,
  expectedRemoveCount,
  expectedChangedCount,
  expectedMissingMaterial,
  expectedDeferredRemoveCount,
  expectedProjectedMapCount
} = {}) {
  const safeStrategy = normalizeStrategy(strategy);
  const safeMapPath = text(mapPath);
  if (!safeMapPath) {
    const error = new Error("mapPath is required");
    error.code = "validation_error";
    throw error;
  }
  const currentMap = readJsonFile(safeMapPath);
  const { rebuilt, missingMaterial } = rebuildMap({ mihomoConfigText, materialRecords });
  if (safeStrategy === ADDITIVE_MISSING_ONLY_STRATEGY) {
    const candidate = buildAdditiveCandidate({
      currentMap,
      rebuiltMap: rebuilt,
      missingMaterial
    });
    assertAdditiveExpectedCounts(candidate, {
      expectedAddCount,
      expectedRemoveCount,
      expectedChangedCount,
      expectedMissingMaterial,
      expectedDeferredRemoveCount,
      expectedProjectedMapCount
    });
    if (!candidate.ready) {
      const error = new Error("candidate map is not ready");
      error.code = "candidate_not_ready";
      throw error;
    }

    const additiveMap = buildAdditiveMap({ currentMap, rebuiltMap: rebuilt });
    const after = replaceProtectedMap({ mapPath: safeMapPath, nextMap: additiveMap });
    const finalReport = baseReport({
      mode: "apply",
      currentMap: additiveMap,
      rebuiltMap: rebuilt,
      missingMaterial,
      applied: true,
      finalMode: modeText(after.mode)
    });
    return withAdditiveCandidate(finalReport, {
      ...candidate,
      applied: true
    }, { applied: true });
  }

  const dryReport = baseReport({
    mode: "dry-run",
    currentMap,
    rebuiltMap: rebuilt,
    missingMaterial
  });
  assertExpectedCounts(dryReport, {
    expectedAddCount,
    expectedRemoveCount,
    expectedChangedCount,
    expectedMissingMaterial
  });
  if (!dryReport.candidateReady) {
    const error = new Error("candidate map is not ready");
    error.code = "candidate_not_ready";
    throw error;
  }

  const after = replaceProtectedMap({ mapPath: safeMapPath, nextMap: rebuilt });

  return baseReport({
    mode: "apply",
    currentMap,
    rebuiltMap: rebuilt,
    missingMaterial,
    applied: true,
    finalMode: modeText(after.mode)
  });
}

function argValue(argv, name) {
  const prefix = `${name}=`;
  const inline = argv.find((item) => item.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : "";
}

function numberArg(argv, name) {
  const value = argValue(argv, name);
  return value === "" ? undefined : Number(value);
}

export function runMihomoTuicUsageMapRebuildCli({
  argv = process.argv.slice(2),
  stdout = process.stdout,
  stderr = process.stderr,
  nowFn = () => new Date()
} = {}) {
  const mapPath = argValue(argv, "--current-map");
  const mihomoConfigPath = argValue(argv, "--mihomo-config");
  const materialStorePath = argValue(argv, "--material-store");
  const statusPath = argValue(argv, "--status-path");
  const strategy = argValue(argv, "--strategy");
  const apply = argv.includes("--apply");
  function writeProducerStatus(report) {
    if (statusPath) {
      try {
        const now = nowFn();
        createFileTrafficCollectorStatusStore({ filePath: statusPath }).writeProducerStatus(
          buildMihomoTuicUsageCredentialMapProducerStatus({
            report,
            observedAt: now instanceof Date ? now.toISOString() : now
          })
        );
      } catch {
        stderr.write(`${JSON.stringify({
          type: "traffic_collector_status_producer_snapshot",
          ok: false,
          producerRef: "japan_tuic_usage_credential_map",
          error: "status_snapshot_write_failed",
          safety: {
            redacted: true,
            pathReturned: false,
            rawErrorReturned: false
          }
        })}\n`);
      }
    }
  }

  try {
    const input = {
      strategy,
      mapPath,
      mihomoConfigText: readFileSync(mihomoConfigPath, "utf8"),
      materialRecords: normalizeMaterialRecords(readJsonFile(materialStorePath)),
      expectedAddCount: numberArg(argv, "--expected-add"),
      expectedRemoveCount: numberArg(argv, "--expected-remove"),
      expectedChangedCount: numberArg(argv, "--expected-changed"),
      expectedMissingMaterial: numberArg(argv, "--expected-missing-material"),
      expectedDeferredRemoveCount: numberArg(argv, "--expected-deferred-remove"),
      expectedProjectedMapCount: numberArg(argv, "--expected-projected-map-count")
    };
    const report = apply
      ? applyMihomoTuicUsageCredentialMap(input)
      : buildMihomoTuicUsageCredentialMapReport({
        strategy: input.strategy,
        mihomoConfigText: input.mihomoConfigText,
        materialRecords: input.materialRecords,
        currentMap: readJsonFile(mapPath)
      });
    writeProducerStatus(report);
    stdout.write(`${JSON.stringify(report)}\n`);
    return report.ok ? 0 : 1;
  } catch (error) {
    writeProducerStatus({
      type: "mihomo_tuic_usage_credential_map_rebuild",
      verificationFailed: true
    });
    stderr.write(`${JSON.stringify({
      type: "mihomo_tuic_usage_credential_map_rebuild",
      ok: false,
      error: SAFE_ERROR_CODES.has(text(error?.code)) ? text(error.code) : "map_rebuild_failed",
      safety: {
        noRawRuntimePayload: true,
        noSecretMaterialReturned: true,
        redacted: true
      }
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

if (isDirectInvocation()) {
  process.exitCode = runMihomoTuicUsageMapRebuildCli();
}
