const MAX_INGRESS_BYTES = 64 * 1024 * 1024;
const MAX_TTL_MS = 24 * 60 * 60 * 1000;
const ENTRY_NAMES = Object.freeze([
  "source-archive",
  "dependency-artifact",
  "manifest",
  "checksum"
]);

export const CONTROL_PLANE_ARTIFACT_INGRESS = Object.freeze({
  schemaVersion: "1",
  type: "control_plane_artifact_ingress",
  maxAggregateBytes: MAX_INGRESS_BYTES,
  maxTtlMs: MAX_TTL_MS,
  entryNames: ENTRY_NAMES
});

export class ArtifactIngressContractError extends Error {
  constructor(code) {
    super(code);
    this.name = "ArtifactIngressContractError";
    this.code = code;
  }
}

function fail(code) {
  throw new ArtifactIngressContractError(code);
}

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function exactKeys(value, expected) {
  const keys = Object.keys(record(value)).sort();
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
}

function isoTimestamp(value, code) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) fail(code);
  const normalized = new Date(value).toISOString();
  if (normalized !== value) fail(code);
  return normalized;
}

function sha256(value) {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) {
    fail("artifact_ingress_digest_invalid");
  }
  return value;
}

function sourceCommit(value) {
  if (typeof value !== "string" || !/^[0-9a-f]{40}$/.test(value)) {
    fail("artifact_ingress_source_invalid");
  }
  return value;
}

function entry(value, expectedName) {
  if (!exactKeys(value, ["name", "sha256", "sizeBytes"])
    || value.name !== expectedName
    || !Number.isSafeInteger(value.sizeBytes)
    || value.sizeBytes < 0
    || value.sizeBytes > MAX_INGRESS_BYTES) {
    fail("artifact_ingress_entry_invalid");
  }
  return {
    name: expectedName,
    sizeBytes: value.sizeBytes,
    sha256: sha256(value.sha256)
  };
}

export function validateIngressHeader(input = {}, { now = new Date().toISOString() } = {}) {
  const value = record(input);
  if (!exactKeys(value, [
    "aggregateSizeBytes",
    "entries",
    "expiresAt",
    "issuedAt",
    "schemaVersion",
    "sourceCommit",
    "type"
  ])) {
    fail("artifact_ingress_header_invalid");
  }
  if (value.schemaVersion !== CONTROL_PLANE_ARTIFACT_INGRESS.schemaVersion
    || value.type !== CONTROL_PLANE_ARTIFACT_INGRESS.type
    || !Array.isArray(value.entries)
    || value.entries.length !== ENTRY_NAMES.length
    || !Number.isSafeInteger(value.aggregateSizeBytes)
    || value.aggregateSizeBytes < 0
    || value.aggregateSizeBytes > MAX_INGRESS_BYTES) {
    fail("artifact_ingress_header_invalid");
  }

  const issuedAt = isoTimestamp(value.issuedAt, "artifact_ingress_expiry_invalid");
  const expiresAt = isoTimestamp(value.expiresAt, "artifact_ingress_expiry_invalid");
  const nowAt = isoTimestamp(now, "artifact_ingress_expiry_invalid");
  const issuedMs = Date.parse(issuedAt);
  const expiresMs = Date.parse(expiresAt);
  if (issuedMs > Date.parse(nowAt)
    || expiresMs <= Date.parse(nowAt)
    || expiresMs <= issuedMs
    || expiresMs - issuedMs > MAX_TTL_MS) {
    fail("artifact_ingress_expiry_invalid");
  }

  const entries = value.entries.map((value, index) => entry(value, ENTRY_NAMES[index]));
  const aggregateSizeBytes = entries.reduce((total, value) => total + value.sizeBytes, 0);
  if (!Number.isSafeInteger(aggregateSizeBytes)
    || aggregateSizeBytes !== value.aggregateSizeBytes
    || aggregateSizeBytes > MAX_INGRESS_BYTES) {
    fail("artifact_ingress_size_invalid");
  }

  return {
    schemaVersion: CONTROL_PLANE_ARTIFACT_INGRESS.schemaVersion,
    type: CONTROL_PLANE_ARTIFACT_INGRESS.type,
    sourceCommit: sourceCommit(value.sourceCommit),
    issuedAt,
    expiresAt,
    aggregateSizeBytes,
    entries
  };
}

export function buildIngressHeader({
  sourceCommit: inputSourceCommit,
  issuedAt,
  expiresAt,
  entries
} = {}) {
  const rawEntries = Array.isArray(entries) ? entries : [];
  const header = {
    schemaVersion: CONTROL_PLANE_ARTIFACT_INGRESS.schemaVersion,
    type: CONTROL_PLANE_ARTIFACT_INGRESS.type,
    sourceCommit: inputSourceCommit,
    issuedAt,
    expiresAt,
    aggregateSizeBytes: rawEntries.reduce(
      (total, value) => total + (Number.isSafeInteger(value?.sizeBytes) ? value.sizeBytes : 0),
      0
    ),
    entries: rawEntries
  };
  return validateIngressHeader(header, { now: issuedAt });
}

export function safeIngressReceipt({
  candidateId,
  header
} = {}) {
  const value = validateIngressHeader(header, { now: header?.issuedAt });
  if (typeof candidateId !== "string" || !/^[0-9a-f-]{36}$/.test(candidateId)) {
    fail("artifact_ingress_receipt_invalid");
  }
  return {
    schemaVersion: "1",
    type: "control_plane_artifact_ingress_receipt",
    state: "candidate_received",
    candidateId,
    sourceCommit: value.sourceCommit,
    expiresAt: value.expiresAt,
    aggregateSizeBytes: value.aggregateSizeBytes,
    entries: value.entries.map(({ name, sizeBytes, sha256 }) => ({ name, sizeBytes, sha256 }))
  };
}
