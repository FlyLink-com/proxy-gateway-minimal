import { spawnSync } from "node:child_process";
import { parseXrayStatsCliProtobufUserCounters } from "./xray-recovery-counter-parser.mjs";
import { assertNoDuplicateObjectKeys } from "../deployment/strict-json-scan.mjs";

const SAFE_REF_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

function readerError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function text(value) {
  return String(value ?? "").trim();
}

function requiredText(value, field) {
  const normalized = text(value);
  if (!normalized) {
    throw readerError("validation_error", `${field} is required`);
  }
  return normalized;
}

function safeRef(value, field) {
  const normalized = requiredText(value, field);
  if (!SAFE_REF_PATTERN.test(normalized)) {
    throw readerError("validation_error", `${field} must be a safe reference`);
  }
  return normalized;
}

function isoText(value, field) {
  const raw = requiredText(value, field);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw readerError("validation_error", `${field} must be a valid ISO timestamp`);
  }
  return date.toISOString();
}

function nonNegativeInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function loopbackStatsServer(value) {
  const raw = requiredText(value, "statsServer");
  if (raw.includes("://")) {
    throw readerError("validation_error", "statsServer must be a host:port pair");
  }
  let url;
  try {
    url = new URL(`http://${raw}`);
  } catch {
    throw readerError("validation_error", "statsServer must be a host:port pair");
  }
  if (!url.port) {
    throw readerError("validation_error", "statsServer must include a port");
  }
  const host = url.hostname.toLowerCase();
  if (host !== "127.0.0.1" && host !== "localhost" && host !== "::1" && host !== "[::1]") {
    throw readerError("validation_error", "statsServer must be loopback-only");
  }
  return raw;
}

function defaultCommandRunner(command, args, recoveryOptions = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    ...recoveryOptions
  });
  return {
    exitCode: Number.isInteger(result.status) ? result.status : 1,
    stdout: result.stdout || "",
    stderr: result.stderr || ""
  };
}

function parseStatsPayload(stdout, strictCounters) {
  try {
    const output = requiredText(stdout, "stats output");
    if (strictCounters) assertNoDuplicateObjectKeys(output);
    const payload = JSON.parse(output);
    if (!isPlainObject(payload)) {
      throw readerError("validation_error", "stats output must be an object");
    }
    return payload;
  } catch (error) {
    if (error?.code) throw error;
    throw readerError("validation_error", "stats output must be JSON");
  }
}

function statRows(payload) {
  if (Array.isArray(payload.stat)) return payload.stat;
  if (Array.isArray(payload.stats)) return payload.stats;
  return [];
}

function entriesFromStats(payload) {
  const byRef = new Map();
  for (const row of statRows(payload)) {
    if (!isPlainObject(row)) continue;
    const name = text(row.name);
    const match = /^user>>>([^>]+)>>>traffic>>>(uplink|downlink)$/.exec(name);
    if (!match) continue;
    const edgeCredentialRef = text(match[1]);
    if (!SAFE_REF_PATTERN.test(edgeCredentialRef)) continue;
    const current = byRef.get(edgeCredentialRef) || {
      edgeCredentialRef: safeRef(edgeCredentialRef, "edgeCredentialRef"),
      uploadBytes: 0,
      downloadBytes: 0
    };
    if (match[2] === "uplink") {
      current.uploadBytes += nonNegativeInteger(row.value);
    } else {
      current.downloadBytes += nonNegativeInteger(row.value);
    }
    byRef.set(edgeCredentialRef, current);
  }
  return [...byRef.values()].sort((left, right) =>
    left.edgeCredentialRef.localeCompare(right.edgeCredentialRef)
  );
}

export function createXrayStatsCliUsageSnapshotReader({
  xrayBinary = "xray",
  statsServer = "127.0.0.1:10085",
  commandRunner = defaultCommandRunner,
  nowFn = () => new Date(),
  strictCounters = false
} = {}) {
  const safeXrayBinary = requiredText(xrayBinary, "xrayBinary");
  const safeStatsServer = loopbackStatsServer(statsServer);
  if (typeof commandRunner !== "function") {
    throw readerError("validation_error", "commandRunner is required");
  }

  return async function readXrayStatsUsage({ since } = {}) {
    const args = ["api", "statsquery", `--server=${safeStatsServer}`];
    const result = (strictCounters
      ? commandRunner(safeXrayBinary, args, { timeout: 20000, maxBuffer: 4 * 1024 * 1024, shell: false })
      : commandRunner(safeXrayBinary, args)) || {};
    const exitCode = Number.isInteger(result.exitCode) ? result.exitCode : 1;
    if (exitCode !== 0) {
      throw readerError("xray_stats_query_failed", "xray stats query failed");
    }
    const payload = parseStatsPayload(result.stdout, strictCounters);
    const nowValue = typeof nowFn === "function" ? nowFn() : new Date();
    const observedAt = isoText(
      (!strictCounters && payload.observedAt) || (nowValue instanceof Date ? nowValue.toISOString() : nowValue),
      "observedAt"
    );
    return {
      sourceRef: "xray_statsquery_user_traffic",
      accountingMode: "cumulative",
      observedAt,
      intervalStartedAt: isoText((!strictCounters && payload.intervalStartedAt) || since || observedAt, "intervalStartedAt"),
      intervalEndedAt: isoText((!strictCounters && payload.intervalEndedAt) || observedAt, "intervalEndedAt"),
      entries: strictCounters ? parseXrayStatsCliProtobufUserCounters(payload) : entriesFromStats(payload)
    };
  };
}
