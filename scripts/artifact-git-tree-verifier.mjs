#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, realpathSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";
import { inspectProductionArtifactBoundary } from "../server/services/platform/production-artifact-boundary.mjs";

const MAX_ARCHIVE_BYTES = 64 * 1024 * 1024;
const MAX_ENTRIES = 10_000;
const MAX_UNCOMPRESSED_BYTES = 256 * 1024 * 1024;
const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const ZIP64_UINT16 = 0xffff;
const ZIP64_UINT32 = 0xffffffff;
const textDecoder = new TextDecoder("utf-8", { fatal: true });
const ALLOWED_EXCLUDED_PATHS = new Set([
  "config/proxy-servers.json"
]);

export class ArtifactGitTreeError extends Error {
  constructor(stage = "artifact_source_tree_mismatch") {
    super("artifact_source_tree_mismatch");
    this.name = "ArtifactGitTreeError";
    this.code = "artifact_source_tree_mismatch";
    Object.defineProperty(this, "stage", { value: stage, enumerable: false });
  }
}

function mismatch(stage) {
  return new ArtifactGitTreeError(stage);
}

function assertCondition(condition) {
  if (!condition) throw mismatch();
}

function assertProductionArtifactBoundary(paths, stage) {
  const report = inspectProductionArtifactBoundary({ paths });
  if (!report.ok) throw mismatch(stage);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function decodePath(bytes) {
  let path;
  try {
    path = textDecoder.decode(bytes);
  } catch {
    throw mismatch();
  }
  assertCondition(path.length > 0 && !path.includes("\0") && !path.includes("\\"));
  assertCondition(!path.startsWith("/") && !/^[A-Za-z]:/.test(path));
  const directory = path.endsWith("/");
  const normalized = directory ? path.slice(0, -1) : path;
  const segments = normalized.split("/");
  assertCondition(normalized.length > 0 && segments.every((segment) => segment && segment !== "." && segment !== ".."));
  return { directory, path: normalized };
}

function findEndOfCentralDirectory(archive) {
  const minimum = Math.max(0, archive.length - 65_557);
  for (let offset = archive.length - 22; offset >= minimum; offset -= 1) {
    if (archive.readUInt32LE(offset) !== EOCD_SIGNATURE) continue;
    const commentLength = archive.readUInt16LE(offset + 20);
    if (offset + 22 + commentLength === archive.length) return offset;
  }
  throw mismatch();
}

function extractEntryData(archive, entry) {
  const offset = entry.localOffset;
  assertCondition(offset >= 0 && offset + 30 <= archive.length);
  assertCondition(archive.readUInt32LE(offset) === LOCAL_SIGNATURE);
  const localFlags = archive.readUInt16LE(offset + 6);
  const localMethod = archive.readUInt16LE(offset + 8);
  const localCrc = archive.readUInt32LE(offset + 14);
  const localCompressedSize = archive.readUInt32LE(offset + 18);
  const localUncompressedSize = archive.readUInt32LE(offset + 22);
  const localNameLength = archive.readUInt16LE(offset + 26);
  const localExtraLength = archive.readUInt16LE(offset + 28);
  assertCondition(localFlags === entry.flags && localMethod === entry.method);
  const usesDataDescriptor = (localFlags & 0x0008) !== 0;
  if (usesDataDescriptor) {
    const localIdentityIsEmpty = localCrc === 0 && localCompressedSize === 0 && localUncompressedSize === 0;
    const localIdentityMatches = localCrc === entry.crc
      && localCompressedSize === entry.compressedSize
      && localUncompressedSize === entry.uncompressedSize;
    assertCondition(localIdentityIsEmpty || localIdentityMatches);
  } else {
    assertCondition(localCrc === entry.crc
      && localCompressedSize === entry.compressedSize
      && localUncompressedSize === entry.uncompressedSize);
  }
  const nameStart = offset + 30;
  const dataStart = nameStart + localNameLength + localExtraLength;
  const dataEnd = dataStart + entry.compressedSize;
  assertCondition(dataStart <= archive.length && dataEnd <= archive.length);
  assertCondition(archive.subarray(nameStart, nameStart + localNameLength).equals(entry.rawName));
  const compressed = archive.subarray(dataStart, dataEnd);
  let data;
  try {
    data = entry.method === 0 ? Buffer.from(compressed) : inflateRawSync(compressed, {
      maxOutputLength: MAX_UNCOMPRESSED_BYTES
    });
  } catch {
    throw mismatch();
  }
  assertCondition(data.length === entry.uncompressedSize);
  assertCondition(crc32(data) === entry.crc);
  return data;
}

function readZipEntries(artifactPath) {
  let resolvedPath;
  let size;
  try {
    resolvedPath = realpathSync(resolve(artifactPath));
    const stats = statSync(resolvedPath);
    assertCondition(stats.isFile());
    size = stats.size;
  } catch (error) {
    if (error instanceof ArtifactGitTreeError) throw error;
    throw mismatch();
  }
  assertCondition(size > 0 && size <= MAX_ARCHIVE_BYTES);
  const archive = readFileSync(resolvedPath);
  const eocdOffset = findEndOfCentralDirectory(archive);
  const disk = archive.readUInt16LE(eocdOffset + 4);
  const centralDisk = archive.readUInt16LE(eocdOffset + 6);
  const diskEntries = archive.readUInt16LE(eocdOffset + 8);
  const totalEntries = archive.readUInt16LE(eocdOffset + 10);
  const centralSize = archive.readUInt32LE(eocdOffset + 12);
  const centralOffset = archive.readUInt32LE(eocdOffset + 16);
  const commentLength = archive.readUInt16LE(eocdOffset + 20);
  let sourceCommitComment;
  try {
    sourceCommitComment = textDecoder.decode(archive.subarray(eocdOffset + 22, eocdOffset + 22 + commentLength));
  } catch {
    throw mismatch();
  }
  assertCondition(disk === 0 && centralDisk === 0 && diskEntries === totalEntries);
  assertCondition(totalEntries !== ZIP64_UINT16 && centralSize !== ZIP64_UINT32 && centralOffset !== ZIP64_UINT32);
  assertCondition(totalEntries > 0 && totalEntries <= MAX_ENTRIES);
  assertCondition(centralOffset + centralSize === eocdOffset);

  const entries = [];
  const names = new Set();
  let offset = centralOffset;
  let totalUncompressed = 0;
  for (let index = 0; index < totalEntries; index += 1) {
    assertCondition(offset + 46 <= eocdOffset && archive.readUInt32LE(offset) === CENTRAL_SIGNATURE);
    const versionMadeBy = archive.readUInt16LE(offset + 4);
    const flags = archive.readUInt16LE(offset + 8);
    const method = archive.readUInt16LE(offset + 10);
    const crc = archive.readUInt32LE(offset + 16);
    const compressedSize = archive.readUInt32LE(offset + 20);
    const uncompressedSize = archive.readUInt32LE(offset + 24);
    const nameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const diskStart = archive.readUInt16LE(offset + 34);
    const externalAttributes = archive.readUInt32LE(offset + 38);
    const localOffset = archive.readUInt32LE(offset + 42);
    const end = offset + 46 + nameLength + extraLength + commentLength;
    assertCondition(end <= eocdOffset);
    const host = versionMadeBy >>> 8;
    assertCondition((host === 0 || host === 3) && diskStart === 0);
    assertCondition((flags & ~0x0808) === 0 && (method === 0 || method === 8));
    assertCondition(compressedSize !== ZIP64_UINT32 && uncompressedSize !== ZIP64_UINT32 && localOffset !== ZIP64_UINT32);
    totalUncompressed += uncompressedSize;
    assertCondition(totalUncompressed <= MAX_UNCOMPRESSED_BYTES);
    const rawName = archive.subarray(offset + 46, offset + 46 + nameLength);
    const decoded = decodePath(rawName);
    assertCondition(!names.has(decoded.path));
    names.add(decoded.path);
    const mode = externalAttributes >>> 16;
    assertCondition(host === 3 || mode === 0);
    const entry = {
      ...decoded,
      compressedSize,
      crc,
      flags,
      host,
      localOffset,
      method,
      mode,
      rawName,
      uncompressedSize
    };
    entry.data = extractEntryData(archive, entry);
    entries.push(entry);
    offset = end;
  }
  assertCondition(offset === eocdOffset);
  return { entries, sourceCommitComment };
}

function runGit(repositoryPath, args, encoding = "utf8") {
  try {
    return execFileSync("git", ["-C", repositoryPath, ...args], {
      encoding,
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"]
    });
  } catch {
    throw mismatch();
  }
}

function readTrustedTree(repositoryPath, expectedCommit) {
  assertCondition(typeof repositoryPath === "string" && typeof expectedCommit === "string");
  assertCondition(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(expectedCommit));
  let resolvedRepository;
  try {
    resolvedRepository = realpathSync(resolve(repositoryPath));
    assertCondition(statSync(resolvedRepository).isDirectory());
  } catch (error) {
    if (error instanceof ArtifactGitTreeError) throw error;
    throw mismatch();
  }
  const resolvedCommit = runGit(resolvedRepository, ["rev-parse", "--verify", `${expectedCommit}^{commit}`]).trim();
  assertCondition(resolvedCommit === expectedCommit);
  const objectFormat = runGit(resolvedRepository, ["rev-parse", "--show-object-format"]).trim();
  assertCondition(objectFormat === "sha1" || objectFormat === "sha256");
  const listing = runGit(resolvedRepository, ["ls-tree", "-r", "-z", "--full-tree", expectedCommit], null);
  const entries = new Map();
  let start = 0;
  while (start < listing.length) {
    const end = listing.indexOf(0, start);
    assertCondition(end > start);
    let record;
    try {
      record = textDecoder.decode(listing.subarray(start, end));
    } catch {
      throw mismatch();
    }
    const match = /^(\d{6}) (\S+) ([0-9a-f]+)\t(.+)$/.exec(record);
    assertCondition(match);
    const [, modeText, type, oid, path] = match;
    assertCondition(type === "blob" && (modeText === "100644" || modeText === "100755"));
    assertCondition(!entries.has(path));
    entries.set(path, { mode: Number.parseInt(modeText, 8), oid });
    start = end + 1;
  }
  assertCondition(entries.size > 0);
  return { entries, objectFormat };
}

function expectedDirectories(paths) {
  const directories = new Set();
  for (const path of paths) {
    const segments = path.split("/");
    for (let index = 1; index < segments.length; index += 1) {
      directories.add(segments.slice(0, index).join("/"));
    }
  }
  return directories;
}

function normalizedExcludedPaths(value) {
  if (value === undefined) return new Set();
  assertCondition(Array.isArray(value));
  const excludedPaths = new Set();
  for (const path of value) {
    assertCondition(typeof path === "string" && ALLOWED_EXCLUDED_PATHS.has(path));
    assertCondition(!excludedPaths.has(path));
    excludedPaths.add(path);
  }
  return excludedPaths;
}

function blobOid(data, objectFormat) {
  return createHash(objectFormat)
    .update(Buffer.from(`blob ${data.length}\0`))
    .update(data)
    .digest("hex");
}

export function verifyArtifactGitTree({
  artifactPath,
  repositoryPath,
  expectedCommit,
  excludedPaths,
  sourceOnlyBoundary = false
} = {}) {
  assertCondition(typeof sourceOnlyBoundary === "boolean");
  const trusted = readTrustedTree(repositoryPath, expectedCommit);
  if (sourceOnlyBoundary) {
    assertProductionArtifactBoundary(trusted.entries.keys(), "trusted_git_tree_boundary");
  }
  const excluded = normalizedExcludedPaths(excludedPaths);
  const archive = readZipEntries(artifactPath);
  assertCondition(archive.sourceCommitComment === expectedCommit);
  const archiveEntries = archive.entries;
  const expectedEntries = new Map(
    [...trusted.entries].filter(([path]) => !excluded.has(path))
  );
  const directories = expectedDirectories(expectedEntries.keys());
  const archiveFiles = new Map();

  for (const entry of archiveEntries) {
    if (entry.directory) {
      const expectedMode = entry.host === 3 ? 0o040755 : 0;
      assertCondition(entry.data.length === 0 && entry.mode === expectedMode && directories.has(entry.path));
      continue;
    }
    assertCondition(entry.host === 0 || (entry.mode & 0o170000) === 0o100000);
    assertCondition(!archiveFiles.has(entry.path));
    archiveFiles.set(entry.path, entry);
  }

  if (sourceOnlyBoundary) {
    assertProductionArtifactBoundary(archiveFiles.keys(), "zip_file_boundary");
  }
  for (const excludedPath of excluded) assertCondition(!archiveFiles.has(excludedPath));
  assertCondition(archiveFiles.size === expectedEntries.size);
  for (const [path, expected] of expectedEntries) {
    const actual = archiveFiles.get(path);
    assertCondition(actual);
    if (actual.host === 0) assertCondition(expected.mode === 0o100644);
    else assertCondition(actual.mode === expected.mode);
    assertCondition(blobOid(actual.data, trusted.objectFormat) === expected.oid);
  }

  return {
    ok: true,
    type: "artifact_git_tree_identity",
    fileCount: archiveFiles.size
  };
}

function parseArguments(argv) {
  assertCondition(Array.isArray(argv) && argv.length >= 6);
  const parsed = { "--exclude-path": [], "--source-only-boundary": false };
  for (let index = 0; index < argv.length;) {
    const flag = argv[index];
    if (flag === "--source-only-boundary") {
      assertCondition(parsed[flag] === false);
      parsed[flag] = true;
      index += 1;
      continue;
    }
    const value = argv[index + 1];
    assertCondition(["--repository", "--commit", "--artifact", "--exclude-path"].includes(flag));
    assertCondition(typeof value === "string" && value.length > 0);
    if (flag === "--exclude-path") {
      parsed[flag].push(value);
      index += 2;
      continue;
    }
    assertCondition(parsed[flag] === undefined);
    parsed[flag] = value;
    index += 2;
  }
  assertCondition(parsed["--repository"] && parsed["--commit"] && parsed["--artifact"]);
  return parsed;
}

export function runArtifactGitTreeVerifierCli({
  argv = process.argv.slice(2),
  stdout = process.stdout,
  stderr = process.stderr
} = {}) {
  try {
    const parsed = parseArguments(argv);
    const result = verifyArtifactGitTree({
      artifactPath: parsed["--artifact"],
      repositoryPath: parsed["--repository"],
      expectedCommit: parsed["--commit"],
      excludedPaths: parsed["--exclude-path"],
      sourceOnlyBoundary: parsed["--source-only-boundary"]
    });
    stdout.write(`${JSON.stringify(result)}\n`);
    return 0;
  } catch {
    stderr.write(`${JSON.stringify({ error: "artifact_source_tree_mismatch" })}\n`);
    return 1;
  }
}

let invokedDirectly = false;
try {
  invokedDirectly = realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
} catch {
  invokedDirectly = false;
}

if (invokedDirectly) process.exitCode = runArtifactGitTreeVerifierCli();
