import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { once } from "node:events";
import { basename } from "node:path";

import {
  ArtifactIngressV2ContractError,
  buildIngressV2Header,
  validateIngressV2Header
} from "./control-plane-artifact-ingress-v2-contract.mjs";

const FILE_KEYS = Object.freeze([
  "artifactManifest", "sourceArchive", "sourceChecksum", "dependencyManifest", "dependencyArchive", "releaseLabel"
]);
const MAX_AGGREGATE_BYTES = 64 * 1024 * 1024;

function fail(code) { throw new ArtifactIngressV2ContractError(code); }

function sameIdentity(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.nlink === right.nlink
    && left.size === right.size
    && left.mtimeMs === right.mtimeMs
    && left.ctimeMs === right.ctimeMs;
}

async function snapshotFile(path, expectedEntry) {
  if (typeof path !== "string" || path.length === 0 || path.length > 4096) fail("artifact_ingress_sender_input_invalid");
  let handle;
  try {
    const lexical = await lstat(path);
    handle = await open(path, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    const before = await handle.stat();
    if (basename(path) !== expectedEntry.name
      || lexical.isSymbolicLink() || !lexical.isFile() || !before.isFile()
      || before.nlink !== 1 || !Number.isSafeInteger(before.size)
      || before.size !== expectedEntry.sizeBytes || before.size > MAX_AGGREGATE_BYTES
      || lexical.dev !== before.dev || lexical.ino !== before.ino) {
      fail("artifact_ingress_sender_input_invalid");
    }
    const bytes = await handle.readFile();
    const after = await handle.stat();
    const lexicalAfter = await lstat(path);
    if (after.nlink !== 1 || !sameIdentity(before, after) || !sameIdentity(lexical, lexicalAfter)
      || lexicalAfter.dev !== after.dev || lexicalAfter.ino !== after.ino
      || bytes.length !== before.size) {
      fail("artifact_ingress_sender_input_changed");
    }
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    if (sha256 !== expectedEntry.sha256) fail("artifact_ingress_sender_input_changed");
    return {
      fileName: basename(path),
      sizeBytes: bytes.length,
      sha256,
      bytes
    };
  } catch (error) {
    if (error instanceof ArtifactIngressV2ContractError) throw error;
    fail("artifact_ingress_sender_input_invalid");
  } finally {
    await handle?.close().catch(() => {});
  }
}

async function write(output, bytes) {
  if (!output || typeof output.write !== "function") fail("artifact_ingress_sender_output_invalid");
  if (output.write(bytes)) return;
  if (typeof output.once !== "function") fail("artifact_ingress_sender_output_invalid");
  await once(output, "drain");
}

export async function writeArtifactIngressV2Packet({ output, files, expectedHeader } = {}) {
  if (!files || typeof files !== "object" || Array.isArray(files)
    || Object.keys(files).sort().join("\n") !== [...FILE_KEYS].sort().join("\n")) fail("artifact_ingress_sender_input_invalid");
  const validatedExpectedHeader = validateIngressV2Header(expectedHeader, { now: expectedHeader?.issuedAt });
  const inspected = Object.fromEntries(await Promise.all(FILE_KEYS.map(async (key, index) => [
    key,
    await snapshotFile(files[key], validatedExpectedHeader.entries[index])
  ])));
  const entries = [
    { name: "artifact.json", ...inspected.artifactManifest },
    { name: inspected.sourceArchive.fileName, ...inspected.sourceArchive },
    { name: inspected.sourceChecksum.fileName, ...inspected.sourceChecksum },
    { name: "dependency-artifact.json", ...inspected.dependencyManifest },
    { name: "node-modules.tar", ...inspected.dependencyArchive },
    { name: "release-label.txt", ...inspected.releaseLabel }
  ];
  const header = buildIngressV2Header({
    packetId: expectedHeader?.packetId,
    sourceCommit: expectedHeader?.sourceCommit,
    issuedAt: expectedHeader?.issuedAt,
    expiresAt: expectedHeader?.expiresAt,
    entries: entries.map(({ name, sha256, sizeBytes }) => ({ name, sha256, sizeBytes }))
  });
  if (JSON.stringify(header) !== JSON.stringify(expectedHeader)) {
    fail("artifact_ingress_sender_input_changed");
  }
  const headerBytes = Buffer.from(JSON.stringify(header), "utf8");
  const prefix = Buffer.alloc(4);
  prefix.writeUInt32BE(headerBytes.length);
  await write(output, prefix);
  await write(output, headerBytes);
  for (const item of entries) {
    for (let offset = 0; offset < item.bytes.length; offset += 64 * 1024) {
      await write(
        output,
        item.bytes.subarray(offset, Math.min(offset + 64 * 1024, item.bytes.length))
      );
    }
  }
  return header;
}
