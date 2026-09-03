const MAX_INGRESS_BYTES = 64 * 1024 * 1024;
const MAX_TTL_MS = 24 * 60 * 60 * 1000;
const SOURCE_ARCHIVE = /^proxy-gateway-([A-Za-z0-9][A-Za-z0-9._-]{0,159})\.zip$/;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export const CONTROL_PLANE_ARTIFACT_INGRESS_V2 = Object.freeze({
  schemaVersion: "2",
  type: "control_plane_artifact_ingress",
  maxAggregateBytes: MAX_INGRESS_BYTES,
  maxTtlMs: MAX_TTL_MS,
  entryCount: 6
});

export class ArtifactIngressV2ContractError extends Error {
  constructor(code) { super(code); this.name = "ArtifactIngressV2ContractError"; this.code = code; }
}

function fail(code) { throw new ArtifactIngressV2ContractError(code); }
function record(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function exactKeys(value, expected) {
  const keys = Object.keys(record(value)).sort();
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
}
function iso(value, code) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) fail(code);
  return value;
}
function digest(value) {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) fail("artifact_ingress_digest_invalid");
  return value;
}
function sourceCommit(value) {
  if (typeof value !== "string" || !/^[0-9a-f]{40}$/.test(value)) fail("artifact_ingress_source_invalid");
  return value;
}
function packetId(value) {
  if (typeof value !== "string" || !UUID_V4.test(value)) fail("artifact_ingress_packet_id_invalid");
  return value;
}
function entry(value) {
  if (!exactKeys(value, ["name", "sha256", "sizeBytes"])
    || typeof value.name !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/.test(value.name)
    || !Number.isSafeInteger(value.sizeBytes) || value.sizeBytes < 0 || value.sizeBytes > MAX_INGRESS_BYTES) {
    fail("artifact_ingress_entry_invalid");
  }
  return { name: value.name, sha256: digest(value.sha256), sizeBytes: value.sizeBytes };
}
function stageInput(entries) {
  if (entries.length !== 6) fail("artifact_ingress_header_invalid");
  const [artifactManifest, sourceArchive, sourceChecksum, dependencyManifest, dependencyArchive, releaseLabel] = entries;
  if (artifactManifest.name !== "artifact.json" || !SOURCE_ARCHIVE.test(sourceArchive.name)
    || sourceChecksum.name !== `${sourceArchive.name}.sha256`
    || dependencyManifest.name !== "dependency-artifact.json"
    || dependencyArchive.name !== "node-modules.tar" || releaseLabel.name !== "release-label.txt") {
    fail("artifact_ingress_entry_invalid");
  }
  return entries;
}

export function validateIngressV2Header(input = {}, { now = new Date().toISOString() } = {}) {
  const value = record(input);
  if (!exactKeys(value, ["aggregateSizeBytes", "entries", "expiresAt", "issuedAt", "packetId", "schemaVersion", "sourceCommit", "type"])
    || value.schemaVersion !== CONTROL_PLANE_ARTIFACT_INGRESS_V2.schemaVersion
    || value.type !== CONTROL_PLANE_ARTIFACT_INGRESS_V2.type
    || !Array.isArray(value.entries) || !Number.isSafeInteger(value.aggregateSizeBytes)
    || value.aggregateSizeBytes < 0 || value.aggregateSizeBytes > MAX_INGRESS_BYTES) fail("artifact_ingress_header_invalid");
  const issuedAt = iso(value.issuedAt, "artifact_ingress_expiry_invalid");
  const expiresAt = iso(value.expiresAt, "artifact_ingress_expiry_invalid");
  const nowAt = iso(now, "artifact_ingress_expiry_invalid");
  if (Date.parse(issuedAt) > Date.parse(nowAt) || Date.parse(expiresAt) <= Date.parse(nowAt)
    || Date.parse(expiresAt) <= Date.parse(issuedAt) || Date.parse(expiresAt) - Date.parse(issuedAt) > MAX_TTL_MS) fail("artifact_ingress_expiry_invalid");
  const entries = stageInput(value.entries.map(entry));
  const aggregateSizeBytes = entries.reduce((total, item) => total + item.sizeBytes, 0);
  if (aggregateSizeBytes !== value.aggregateSizeBytes || aggregateSizeBytes > MAX_INGRESS_BYTES) fail("artifact_ingress_size_invalid");
  return {
    schemaVersion: "2",
    type: CONTROL_PLANE_ARTIFACT_INGRESS_V2.type,
    packetId: packetId(value.packetId),
    sourceCommit: sourceCommit(value.sourceCommit),
    issuedAt,
    expiresAt,
    aggregateSizeBytes,
    entries
  };
}

export function buildIngressV2Header({ packetId: id, sourceCommit: commit, issuedAt, expiresAt, entries } = {}) {
  const rawEntries = Array.isArray(entries) ? entries : [];
  return validateIngressV2Header({
    schemaVersion: "2", type: CONTROL_PLANE_ARTIFACT_INGRESS_V2.type, packetId: id, sourceCommit: commit, issuedAt, expiresAt,
    aggregateSizeBytes: rawEntries.reduce((total, item) => total + (Number.isSafeInteger(item?.sizeBytes) ? item.sizeBytes : 0), 0), entries: rawEntries
  }, { now: issuedAt });
}

export function safeIngressV2Receipt({ candidateId, header, acceptedAt } = {}) {
  const value = validateIngressV2Header(header, { now: acceptedAt });
  if (candidateId !== value.packetId) fail("artifact_ingress_receipt_invalid");
  return {
    schemaVersion: "2", type: "control_plane_artifact_ingress_receipt", state: "candidate_received",
    candidateId, packetId: value.packetId, sourceCommit: value.sourceCommit,
    issuedAt: value.issuedAt, acceptedAt: iso(acceptedAt, "artifact_ingress_receipt_invalid"),
    expiresAt: value.expiresAt,
    aggregateSizeBytes: value.aggregateSizeBytes,
    entries: value.entries.map(({ name, sizeBytes, sha256 }) => ({ name, sizeBytes, sha256 }))
  };
}
