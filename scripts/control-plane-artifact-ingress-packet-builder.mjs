import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readFile, unlink, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

import { buildIngressHeader } from "./control-plane-artifact-ingress-contract.mjs";

const SOURCE_MANIFEST_KEYS = Object.freeze([
  "artifact", "release", "releaseUnit", "schemaVersion", "sourceCommit"
]);
const SOURCE_ARTIFACT_KEYS = Object.freeze([
  "createdAt", "fileName", "sha256", "sizeBytes"
]);
const DEPENDENCY_ARCHIVE_KEYS = Object.freeze(["fileName", "sha256", "sizeBytes"]);
const OUTPUT_NAMES = Object.freeze({
  manifest: "ingress-manifest.json",
  checksum: "ingress-checksum.sha256"
});
const COMMIT_PATTERN = /^[0-9a-f]{40}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const RELEASE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/;
const MAX_INPUT_MANIFEST_BYTES = 64 * 1024;

export class ArtifactIngressPacketError extends Error {
  constructor(code) {
    super(code);
    this.name = "ArtifactIngressPacketError";
    this.code = code;
  }
}

function fail(code) {
  throw new ArtifactIngressPacketError(code);
}

function exactKeys(value, expected) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
}

function strictIso(value) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))
    || new Date(value).toISOString() !== value) {
    fail("artifact_ingress_packet_manifest_invalid");
  }
  return value;
}

function digest(value) {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    fail("artifact_ingress_packet_manifest_invalid");
  }
  return value;
}

function size(value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    fail("artifact_ingress_packet_manifest_invalid");
  }
  return value;
}

function release(value) {
  if (typeof value !== "string" || !RELEASE_PATTERN.test(value)) {
    fail("artifact_ingress_packet_manifest_invalid");
  }
  return value;
}

function sourceCommit(value) {
  if (typeof value !== "string" || !COMMIT_PATTERN.test(value)) {
    fail("artifact_ingress_packet_manifest_invalid");
  }
  return value;
}

async function inspectRegularFile(path, code) {
  if (typeof path !== "string" || path.length === 0 || path.length > 4096) fail(code);
  let metadata;
  try {
    metadata = await lstat(path);
  } catch {
    fail(code);
  }
  if (!metadata.isFile() || metadata.isSymbolicLink() || !Number.isSafeInteger(metadata.size)) {
    fail(code);
  }
  const hash = createHash("sha256");
  try {
    for await (const chunk of createReadStream(path, { highWaterMark: 64 * 1024 })) hash.update(chunk);
  } catch {
    fail(code);
  }
  return { path, fileName: basename(path), sizeBytes: metadata.size, sha256: hash.digest("hex") };
}

async function readJson(path) {
  let metadata;
  try {
    metadata = await lstat(path);
  } catch {
    fail("artifact_ingress_packet_manifest_invalid");
  }
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > MAX_INPUT_MANIFEST_BYTES) {
    fail("artifact_ingress_packet_manifest_invalid");
  }
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    fail("artifact_ingress_packet_manifest_invalid");
  }
}

function validateSourceManifest(value, source) {
  if (!exactKeys(value, SOURCE_MANIFEST_KEYS)
    || value.schemaVersion !== "1"
    || value.releaseUnit !== "control-plane-app"
    || value.sourceCommit !== sourceCommit(value.sourceCommit)
    || !exactKeys(value.artifact, SOURCE_ARTIFACT_KEYS)
    || value.artifact.fileName !== source.fileName
    || digest(value.artifact.sha256) !== source.sha256
    || size(value.artifact.sizeBytes) !== source.sizeBytes) {
    fail("artifact_ingress_packet_manifest_invalid");
  }
  strictIso(value.artifact.createdAt);
  return { sourceCommit: value.sourceCommit, release: release(value.release) };
}

function validateDependencyManifest(value, dependency) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || value.schemaVersion !== "4"
    || value.type !== "control_plane_dependency_artifact"
    || value.state !== "verified"
    || value.releaseUnit !== "control-plane-app"
    || value.sourceCommit !== sourceCommit(value.sourceCommit)
    || !exactKeys(value.archive, DEPENDENCY_ARCHIVE_KEYS)
    || value.archive.fileName !== dependency.fileName
    || digest(value.archive.sha256) !== dependency.sha256
    || size(value.archive.sizeBytes) !== dependency.sizeBytes) {
    fail("artifact_ingress_packet_manifest_invalid");
  }
  return { sourceCommit: value.sourceCommit, release: release(value.artifactRelease) };
}

async function assertOutputDirectory(path) {
  let metadata;
  try {
    metadata = await lstat(path);
  } catch {
    fail("artifact_ingress_packet_output_invalid");
  }
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) fail("artifact_ingress_packet_output_invalid");
  const manifest = join(path, OUTPUT_NAMES.manifest);
  const checksum = join(path, OUTPUT_NAMES.checksum);
  for (const candidate of [manifest, checksum]) {
    try {
      await lstat(candidate);
      fail("artifact_ingress_packet_output_invalid");
    } catch (error) {
      if (error instanceof ArtifactIngressPacketError) throw error;
    }
  }
  return { manifest, checksum };
}

async function writeNoReplace(path, body) {
  try {
    await writeFile(path, body, { encoding: "utf8", flag: "wx", mode: 0o600 });
  } catch {
    fail("artifact_ingress_packet_output_invalid");
  }
}

export async function buildCanonicalIngressPacket({
  sourceArchive,
  dependencyArtifact,
  sourceManifest,
  dependencyManifest,
  output,
  issuedAt,
  expiresAt
} = {}) {
  const [source, dependency, sourceManifestValue, dependencyManifestValue] = await Promise.all([
    inspectRegularFile(sourceArchive, "artifact_ingress_packet_source_invalid"),
    inspectRegularFile(dependencyArtifact, "artifact_ingress_packet_dependency_invalid"),
    readJson(sourceManifest),
    readJson(dependencyManifest)
  ]);
  const sourceBinding = validateSourceManifest(sourceManifestValue, source);
  const dependencyBinding = validateDependencyManifest(dependencyManifestValue, dependency);
  if (sourceBinding.sourceCommit !== dependencyBinding.sourceCommit) {
    fail("artifact_ingress_packet_manifest_invalid");
  }
  const files = await assertOutputDirectory(output);
  const manifest = {
    schemaVersion: "1",
    type: "control_plane_artifact_ingress_packet",
    sourceCommit: sourceBinding.sourceCommit,
    issuedAt,
    expiresAt,
    source: {
      release: sourceBinding.release,
      sha256: source.sha256,
      sizeBytes: source.sizeBytes
    },
    dependency: {
      release: dependencyBinding.release,
      sha256: dependency.sha256,
      sizeBytes: dependency.sizeBytes
    }
  };
  const manifestBytes = JSON.stringify(manifest) + "\n";
  const manifestSha256 = createHash("sha256").update(manifestBytes).digest("hex");
  const checksumBytes = [
    `${source.sha256}  source-archive`,
    `${dependency.sha256}  dependency-artifact`,
    `${manifestSha256}  manifest`
  ].join("\n") + "\n";
  const checksumSha256 = createHash("sha256").update(checksumBytes).digest("hex");
  const header = buildIngressHeader({
    sourceCommit: sourceBinding.sourceCommit,
    issuedAt,
    expiresAt,
    entries: [
      { name: "source-archive", sha256: source.sha256, sizeBytes: source.sizeBytes },
      { name: "dependency-artifact", sha256: dependency.sha256, sizeBytes: dependency.sizeBytes },
      { name: "manifest", sha256: manifestSha256, sizeBytes: Buffer.byteLength(manifestBytes) },
      { name: "checksum", sha256: checksumSha256, sizeBytes: Buffer.byteLength(checksumBytes) }
    ]
  });
  let manifestWritten = false;
  try {
    await writeNoReplace(files.manifest, manifestBytes);
    manifestWritten = true;
    await writeNoReplace(files.checksum, checksumBytes);
  } catch (error) {
    if (manifestWritten) await unlink(files.manifest).catch(() => {});
    if (error instanceof ArtifactIngressPacketError) throw error;
    fail("artifact_ingress_packet_output_invalid");
  }
  return {
    header,
    files: {
      sourceArchive,
      dependencyArtifact,
      manifest: files.manifest,
      checksum: files.checksum
    }
  };
}
