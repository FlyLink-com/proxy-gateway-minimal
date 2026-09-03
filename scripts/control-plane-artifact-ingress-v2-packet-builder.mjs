#!/usr/bin/env node
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readFile, readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parseArtifactManifest } from "./control-plane-candidate-dependency-gate-lib.mjs";
import { parseDependencyArtifactManifest } from "./control-plane-dependency-artifact-lib.mjs";
import { buildIngressV2Header } from "./control-plane-artifact-ingress-v2-contract.mjs";

const MAX_AGGREGATE_BYTES = 64 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 1024 * 1024;
const MAX_CHECKSUM_BYTES = 4096;
const MAX_LABEL_BYTES = 512;
const COMMIT = /^[0-9a-f]{40}$/;
const ARGUMENT_NAMES = Object.freeze([
  "source-directory",
  "dependency-directory",
  "packet-id",
  "source-commit",
  "issued-at",
  "expires-at"
]);

export class ArtifactIngressV2PacketError extends Error {
  constructor(code) {
    super(code);
    this.name = "ArtifactIngressV2PacketError";
    this.code = code;
  }
}

function fail(code) {
  throw new ArtifactIngressV2PacketError(code);
}

function sameIdentity(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.size === right.size
    && left.mtimeMs === right.mtimeMs
    && left.ctimeMs === right.ctimeMs;
}

function safeBasename(value) {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 255
    && value !== "."
    && value !== ".."
    && basename(value) === value;
}

async function inspectDirectory(path, code) {
  if (typeof path !== "string" || path.length === 0 || path.length > 4096) fail(code);
  let metadata;
  try {
    metadata = await lstat(path);
  } catch {
    fail(code);
  }
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) fail(code);
  return metadata;
}

async function inspectRegularFile(path, { code, maximumBytes, captureBytes = false }) {
  let before;
  try {
    before = await lstat(path);
  } catch {
    fail(code);
  }
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1
    || !Number.isSafeInteger(before.size) || before.size < 0 || before.size > maximumBytes) {
    fail(code);
  }
  let bytes;
  const hash = createHash("sha256");
  try {
    if (captureBytes) {
      bytes = await readFile(path);
      hash.update(bytes);
    } else {
      for await (const chunk of createReadStream(path, { highWaterMark: 64 * 1024 })) hash.update(chunk);
    }
  } catch {
    fail(code);
  }
  let after;
  try {
    after = await lstat(path);
  } catch {
    fail(code);
  }
  if (!sameIdentity(before, after) || (bytes && bytes.length !== before.size)) fail(code);
  return Object.freeze({
    path,
    fileName: basename(path),
    sha256: hash.digest("hex"),
    sizeBytes: before.size,
    ...(bytes ? { bytes } : {})
  });
}

async function exactNames(path, expected, code) {
  let names;
  try {
    names = (await readdir(path)).sort();
  } catch {
    fail(code);
  }
  const wanted = [...expected].sort();
  if (names.length !== wanted.length || names.join("\0") !== wanted.join("\0")) fail(code);
}

function parseSourceManifest(bytes) {
  try {
    return parseArtifactManifest({ bytes });
  } catch {
    fail("artifact_ingress_v2_packet_source_manifest_invalid");
  }
}

function parseDependencyManifest(bytes) {
  try {
    return parseDependencyArtifactManifest({ bytes });
  } catch {
    fail("artifact_ingress_v2_packet_dependency_manifest_invalid");
  }
}

function parseArguments(argv) {
  if (!Array.isArray(argv) || argv.length !== ARGUMENT_NAMES.length * 2) {
    fail("artifact_ingress_v2_packet_cli_invalid");
  }
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith("--") || typeof value !== "string" || value.length === 0) {
      fail("artifact_ingress_v2_packet_cli_invalid");
    }
    const name = flag.slice(2);
    if (!ARGUMENT_NAMES.includes(name) || values.has(name)) fail("artifact_ingress_v2_packet_cli_invalid");
    values.set(name, value);
  }
  return Object.fromEntries(values);
}

export async function buildCanonicalIngressV2PacketFromArtifactDirectories({
  sourceDirectory,
  dependencyDirectory,
  packetId,
  expectedSourceCommit,
  issuedAt,
  expiresAt
} = {}) {
  if (typeof expectedSourceCommit !== "string" || !COMMIT.test(expectedSourceCommit)) {
    fail("artifact_ingress_v2_packet_source_binding_mismatch");
  }
  const [sourceDirectoryBefore, dependencyDirectoryBefore] = await Promise.all([
    inspectDirectory(sourceDirectory, "artifact_ingress_v2_packet_source_invalid"),
    inspectDirectory(dependencyDirectory, "artifact_ingress_v2_packet_dependency_invalid")
  ]);
  await exactNames(
    dependencyDirectory,
    ["dependency-artifact.json", "node-modules.tar", "release-label.txt"],
    "artifact_ingress_v2_packet_dependency_invalid"
  );

  const artifactManifest = await inspectRegularFile(join(sourceDirectory, "artifact.json"), {
    code: "artifact_ingress_v2_packet_source_invalid",
    maximumBytes: MAX_MANIFEST_BYTES,
    captureBytes: true
  });
  const sourceManifest = parseSourceManifest(artifactManifest.bytes);
  const sourceArchiveName = sourceManifest.value.artifact.fileName;
  if (!safeBasename(sourceArchiveName)
    || sourceArchiveName !== `proxy-gateway-${sourceManifest.value.release}.zip`) {
    fail("artifact_ingress_v2_packet_source_manifest_invalid");
  }
  const sourceChecksumName = `${sourceArchiveName}.sha256`;
  await exactNames(
    sourceDirectory,
    ["artifact.json", sourceArchiveName, sourceChecksumName],
    "artifact_ingress_v2_packet_source_invalid"
  );

  const [sourceArchive, sourceChecksum, dependencyManifestFile, dependencyArchive, releaseLabel] = await Promise.all([
    inspectRegularFile(join(sourceDirectory, sourceArchiveName), {
      code: "artifact_ingress_v2_packet_source_invalid", maximumBytes: MAX_AGGREGATE_BYTES
    }),
    inspectRegularFile(join(sourceDirectory, sourceChecksumName), {
      code: "artifact_ingress_v2_packet_source_invalid", maximumBytes: MAX_CHECKSUM_BYTES, captureBytes: true
    }),
    inspectRegularFile(join(dependencyDirectory, "dependency-artifact.json"), {
      code: "artifact_ingress_v2_packet_dependency_invalid", maximumBytes: MAX_MANIFEST_BYTES, captureBytes: true
    }),
    inspectRegularFile(join(dependencyDirectory, "node-modules.tar"), {
      code: "artifact_ingress_v2_packet_dependency_invalid", maximumBytes: MAX_AGGREGATE_BYTES
    }),
    inspectRegularFile(join(dependencyDirectory, "release-label.txt"), {
      code: "artifact_ingress_v2_packet_dependency_invalid", maximumBytes: MAX_LABEL_BYTES, captureBytes: true
    })
  ]);
  const dependencyManifest = parseDependencyManifest(dependencyManifestFile.bytes);

  if (sourceManifest.value.sourceCommit !== expectedSourceCommit
    || dependencyManifest.value.sourceCommit !== expectedSourceCommit) {
    fail("artifact_ingress_v2_packet_source_binding_mismatch");
  }
  if (sourceManifest.value.release !== dependencyManifest.value.artifactRelease) {
    fail("artifact_ingress_v2_packet_release_binding_mismatch");
  }
  if (sourceArchive.sha256 !== sourceManifest.value.artifact.sha256
    || sourceArchive.sizeBytes !== sourceManifest.value.artifact.sizeBytes) {
    fail("artifact_ingress_v2_packet_source_artifact_mismatch");
  }
  const expectedChecksum = Buffer.from(
    `${sourceArchive.sha256}  .release-artifacts/${sourceArchiveName}\n`,
    "utf8"
  );
  if (!sourceChecksum.bytes.equals(expectedChecksum)) {
    fail("artifact_ingress_v2_packet_source_checksum_invalid");
  }
  if (dependencyManifest.value.archive.fileName !== "node-modules.tar"
    || dependencyArchive.sha256 !== dependencyManifest.value.archive.sha256
    || dependencyArchive.sizeBytes !== dependencyManifest.value.archive.sizeBytes) {
    fail("artifact_ingress_v2_packet_dependency_archive_mismatch");
  }
  if (!releaseLabel.bytes.equals(Buffer.from(`${dependencyManifest.value.artifactRelease}\n`, "utf8"))) {
    fail("artifact_ingress_v2_packet_release_binding_mismatch");
  }

  await Promise.all([
    exactNames(sourceDirectory, ["artifact.json", sourceArchiveName, sourceChecksumName], "artifact_ingress_v2_packet_source_invalid"),
    exactNames(dependencyDirectory, ["dependency-artifact.json", "node-modules.tar", "release-label.txt"], "artifact_ingress_v2_packet_dependency_invalid"),
    inspectDirectory(sourceDirectory, "artifact_ingress_v2_packet_source_invalid").then((after) => {
      if (!sameIdentity(sourceDirectoryBefore, after)) fail("artifact_ingress_v2_packet_source_invalid");
    }),
    inspectDirectory(dependencyDirectory, "artifact_ingress_v2_packet_dependency_invalid").then((after) => {
      if (!sameIdentity(dependencyDirectoryBefore, after)) fail("artifact_ingress_v2_packet_dependency_invalid");
    })
  ]);

  const files = Object.freeze({
    artifactManifest: artifactManifest.path,
    sourceArchive: sourceArchive.path,
    sourceChecksum: sourceChecksum.path,
    dependencyManifest: dependencyManifestFile.path,
    dependencyArchive: dependencyArchive.path,
    releaseLabel: releaseLabel.path
  });
  const entries = [
    { name: "artifact.json", sha256: artifactManifest.sha256, sizeBytes: artifactManifest.sizeBytes },
    { name: sourceArchiveName, sha256: sourceArchive.sha256, sizeBytes: sourceArchive.sizeBytes },
    { name: sourceChecksumName, sha256: sourceChecksum.sha256, sizeBytes: sourceChecksum.sizeBytes },
    { name: "dependency-artifact.json", sha256: dependencyManifestFile.sha256, sizeBytes: dependencyManifestFile.sizeBytes },
    { name: "node-modules.tar", sha256: dependencyArchive.sha256, sizeBytes: dependencyArchive.sizeBytes },
    { name: "release-label.txt", sha256: releaseLabel.sha256, sizeBytes: releaseLabel.sizeBytes }
  ];
  const aggregateSizeBytes = entries.reduce((total, entry) => total + entry.sizeBytes, 0);
  if (aggregateSizeBytes > MAX_AGGREGATE_BYTES) fail("artifact_ingress_v2_packet_size_invalid");
  const header = buildIngressV2Header({
    packetId,
    sourceCommit: expectedSourceCommit,
    issuedAt,
    expiresAt,
    entries
  });
  return Object.freeze({
    header,
    files,
    bindings: Object.freeze({
      packetId: header.packetId,
      sourceCommit: expectedSourceCommit,
      artifactRelease: sourceManifest.value.release,
      artifactManifestSha256: artifactManifest.sha256,
      sourceArtifactSha256: sourceArchive.sha256,
      dependencyManifestSha256: dependencyManifestFile.sha256,
      dependencyArchiveSha256: dependencyArchive.sha256,
      aggregateSizeBytes: header.aggregateSizeBytes
    })
  });
}

export async function runArtifactIngressV2PacketBuilderCli({
  argv = process.argv.slice(2),
  stdout = process.stdout,
  stderr = process.stderr
} = {}) {
  try {
    const options = parseArguments(argv);
    const packet = await buildCanonicalIngressV2PacketFromArtifactDirectories({
      sourceDirectory: options["source-directory"],
      dependencyDirectory: options["dependency-directory"],
      packetId: options["packet-id"],
      expectedSourceCommit: options["source-commit"],
      issuedAt: options["issued-at"],
      expiresAt: options["expires-at"]
    });
    stdout.write(
      `artifact_ingress_v2_packet_verified source_commit=${packet.header.sourceCommit} aggregate_bytes=${packet.header.aggregateSizeBytes}\n`
    );
    return 0;
  } catch (error) {
    const code = error instanceof ArtifactIngressV2PacketError
      ? error.code
      : "artifact_ingress_v2_packet_failed";
    stderr.write(`${code}\n`);
    return 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const exitCode = await runArtifactIngressV2PacketBuilderCli();
  if (exitCode !== 0) process.exitCode = exitCode;
}
