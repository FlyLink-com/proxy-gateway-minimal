import { createHash } from "node:crypto";
import { basename } from "node:path";

export const PLATFORM_LEAD_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
export const PLATFORM_LEAD_BACKUP_PRUNE_SAFETY_MS = 2 * 60 * 60 * 1000;
export const PLATFORM_LEAD_BACKUP_MANIFEST_DOMAIN =
  "PLATFORM_LEAD_BACKUP_MANIFEST:v1\0";

const MANIFEST_INPUT_KEYS = [
  "file",
  "createdAt",
  "privacyCutoff",
  "pruneAt",
  "retentionBasis",
  "size",
  "sha256",
  "quickCheck",
  "leadTablePresent",
  "leadRowCount"
];
const MANIFEST_KEYS = [
  "schemaVersion",
  "artifactKind",
  ...MANIFEST_INPUT_KEYS,
  "manifestDigest"
];
const RESULT_KEYS = [
  "schemaVersion",
  "command",
  "mode",
  "status",
  "mutationState",
  "counts",
  "reasonCodes"
];
const ALLOWED_COUNT_KEYS = new Set([
  "backupEligibleCount",
  "blockedEntryCount",
  "candidatePairCount",
  "createdBackupCount",
  "deletedLeadCount",
  "deletedPairCount",
  "duePairCount",
  "eligibleLeadCount",
  "futurePairCount",
  "leadRowCount",
  "orphanEntryCount",
  "unknownEntryCount"
]);
const SAFE_BACKUP_BASENAME = /^control-[0-9]{8}T[0-9]{6}Z-[a-f0-9]{8,64}\.sqlite$/;
const SAFE_REASON_CODE = /^[a-z][a-z0-9_]{0,63}$/;

function retentionError(reasonCode) {
  const error = new Error(reasonCode);
  error.code = "lead_retention_operation_error";
  error.reasonCode = reasonCode;
  return error;
}

function exactKeys(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function canonicalTimestamp(value) {
  if (typeof value !== "string" || !value) {
    throw retentionError("invalid_timestamp");
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== value) {
    throw retentionError("invalid_timestamp");
  }
  return value;
}

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  return `{${Object.keys(value).sort().map((key) => (
    `${JSON.stringify(key)}:${canonicalJson(value[key])}`
  )).join(",")}}`;
}

function sha256DomainObject(domain, value) {
  return createHash("sha256")
    .update(domain, "utf8")
    .update(canonicalJson(value), "utf8")
    .digest("hex");
}

function validateBackupBasename(value) {
  if (
    typeof value !== "string"
    || basename(value) !== value
    || !SAFE_BACKUP_BASENAME.test(value)
  ) {
    throw retentionError("invalid_backup_basename");
  }
  return value;
}

export function calculateLeadBackupRetention({ createdAt, leadExpiresAt = [] } = {}) {
  const normalizedCreatedAt = canonicalTimestamp(createdAt);
  if (!Array.isArray(leadExpiresAt)) {
    throw retentionError("invalid_timestamp");
  }
  const createdTime = Date.parse(normalizedCreatedAt);
  const defaultCutoffTime = createdTime + PLATFORM_LEAD_RETENTION_MS;
  const expiryTimes = leadExpiresAt.map((value) => {
    canonicalTimestamp(value);
    return Date.parse(value);
  });
  const earliestExpiryTime = expiryTimes.length > 0
    ? Math.min(...expiryTimes)
    : null;
  const usesLeadExpiry = earliestExpiryTime !== null
    && earliestExpiryTime < defaultCutoffTime;
  const privacyCutoffTime = usesLeadExpiry ? earliestExpiryTime : defaultCutoffTime;
  const pruneTime = privacyCutoffTime - PLATFORM_LEAD_BACKUP_PRUNE_SAFETY_MS;
  if (pruneTime <= createdTime) {
    throw retentionError("backup_safety_window_unavailable");
  }
  return {
    createdAt: normalizedCreatedAt,
    privacyCutoff: new Date(privacyCutoffTime).toISOString(),
    pruneAt: new Date(pruneTime).toISOString(),
    retentionBasis: usesLeadExpiry
      ? "earliest_lead_expiry"
      : "created_at_plus_90d"
  };
}

function manifestProjection(manifest) {
  const { manifestDigest: _manifestDigest, ...projection } = manifest;
  return projection;
}

function validateManifestFields(manifest) {
  if (!exactKeys(manifest, MANIFEST_KEYS)) {
    throw retentionError("invalid_manifest");
  }
  if (
    manifest.schemaVersion !== "1"
    || manifest.artifactKind !== "subscription-control-sqlite"
  ) {
    throw retentionError("invalid_manifest");
  }
  validateBackupBasename(manifest.file);
  canonicalTimestamp(manifest.createdAt);
  canonicalTimestamp(manifest.privacyCutoff);
  canonicalTimestamp(manifest.pruneAt);
  if (!new Set(["created_at_plus_90d", "earliest_lead_expiry"]).has(manifest.retentionBasis)) {
    throw retentionError("invalid_manifest");
  }
  if (!Number.isSafeInteger(manifest.size) || manifest.size <= 0) {
    throw retentionError("invalid_manifest");
  }
  if (typeof manifest.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(manifest.sha256)) {
    throw retentionError("invalid_manifest");
  }
  if (manifest.quickCheck !== "ok" || typeof manifest.leadTablePresent !== "boolean") {
    throw retentionError("invalid_manifest");
  }
  if (!Number.isSafeInteger(manifest.leadRowCount) || manifest.leadRowCount < 0) {
    throw retentionError("invalid_manifest");
  }
  if (!manifest.leadTablePresent && manifest.leadRowCount !== 0) {
    throw retentionError("invalid_manifest");
  }
  if (manifest.retentionBasis === "earliest_lead_expiry"
    && (!manifest.leadTablePresent || manifest.leadRowCount === 0)) {
    throw retentionError("invalid_manifest");
  }
  const createdTime = Date.parse(manifest.createdAt);
  const pruneTime = Date.parse(manifest.pruneAt);
  const cutoffTime = Date.parse(manifest.privacyCutoff);
  if (!(createdTime < pruneTime && pruneTime < cutoffTime)) {
    throw retentionError("invalid_manifest");
  }
  if (manifest.retentionBasis === "created_at_plus_90d"
    && cutoffTime !== createdTime + PLATFORM_LEAD_RETENTION_MS) {
    throw retentionError("invalid_manifest");
  }
}

export function createLeadBackupManifest(input = {}) {
  if (!exactKeys(input, MANIFEST_INPUT_KEYS)) {
    throw retentionError("invalid_manifest");
  }
  const manifest = {
    schemaVersion: "1",
    artifactKind: "subscription-control-sqlite",
    file: input.file,
    createdAt: input.createdAt,
    privacyCutoff: input.privacyCutoff,
    pruneAt: input.pruneAt,
    retentionBasis: input.retentionBasis,
    size: input.size,
    sha256: input.sha256,
    quickCheck: input.quickCheck,
    leadTablePresent: input.leadTablePresent,
    leadRowCount: input.leadRowCount,
    manifestDigest: ""
  };
  validateManifestFields({ ...manifest, manifestDigest: "0".repeat(64) });
  manifest.manifestDigest = sha256DomainObject(
    PLATFORM_LEAD_BACKUP_MANIFEST_DOMAIN,
    manifestProjection(manifest)
  );
  return manifest;
}

export function validateLeadBackupManifest(manifest) {
  validateManifestFields(manifest);
  if (typeof manifest.manifestDigest !== "string" || !/^[a-f0-9]{64}$/.test(manifest.manifestDigest)) {
    throw retentionError("invalid_manifest");
  }
  const expected = sha256DomainObject(
    PLATFORM_LEAD_BACKUP_MANIFEST_DOMAIN,
    manifestProjection(manifest)
  );
  if (manifest.manifestDigest !== expected) {
    throw retentionError("manifest_digest_mismatch");
  }
  return manifest;
}

function validateResultTuple({ command, mode, status, mutationState }) {
  if (!["purge", "backup", "prune"].includes(command)) return false;
  if (!["dry-run", "apply"].includes(mode)) return false;
  if (!["planned", "completed", "blocked", "reconciliation_required", "internal_error"].includes(status)) {
    return false;
  }
  if (!["none", "completed", "unknown"].includes(mutationState)) return false;
  if (status === "planned") return mode === "dry-run" && mutationState === "none";
  if (status === "completed") return mode === "apply" && mutationState === "completed";
  if (status === "blocked" || status === "internal_error") return mutationState === "none";
  return status === "reconciliation_required" && mode === "apply" && mutationState === "unknown";
}

export function buildLeadRetentionCommandResult({
  command,
  mode,
  status,
  mutationState,
  counts = {},
  reasonCodes = []
} = {}) {
  if (!validateResultTuple({ command, mode, status, mutationState })) {
    throw retentionError("invalid_command_result");
  }
  if (!counts || typeof counts !== "object" || Array.isArray(counts)) {
    throw retentionError("invalid_command_result");
  }
  const normalizedCounts = {};
  for (const key of Object.keys(counts).sort()) {
    if (!ALLOWED_COUNT_KEYS.has(key)
      || !Number.isSafeInteger(counts[key])
      || counts[key] < 0) {
      throw retentionError("invalid_command_result");
    }
    normalizedCounts[key] = counts[key];
  }
  if (!Array.isArray(reasonCodes)
    || reasonCodes.some((code) => typeof code !== "string" || !SAFE_REASON_CODE.test(code))) {
    throw retentionError("invalid_command_result");
  }
  return {
    schemaVersion: "1",
    command,
    mode,
    status,
    mutationState,
    counts: normalizedCounts,
    reasonCodes: [...new Set(reasonCodes)].sort()
  };
}

export function serializeLeadRetentionCommandResult(result) {
  if (!exactKeys(result, RESULT_KEYS)) {
    throw retentionError("invalid_command_result");
  }
  const normalized = buildLeadRetentionCommandResult(result);
  if (JSON.stringify(normalized) !== JSON.stringify(result)) {
    throw retentionError("invalid_command_result");
  }
  return `${JSON.stringify(result)}\n`;
}
