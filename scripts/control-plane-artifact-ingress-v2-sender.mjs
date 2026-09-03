import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat } from "node:fs/promises";
import { once } from "node:events";
import { basename } from "node:path";

import { ArtifactIngressV2ContractError, buildIngressV2Header } from "./control-plane-artifact-ingress-v2-contract.mjs";

const FILE_KEYS = Object.freeze([
  "artifactManifest", "sourceArchive", "sourceChecksum", "dependencyManifest", "dependencyArchive", "releaseLabel"
]);

function fail(code) { throw new ArtifactIngressV2ContractError(code); }

async function inspectFile(path) {
  if (typeof path !== "string" || path.length === 0 || path.length > 4096) fail("artifact_ingress_sender_input_invalid");
  let metadata;
  try { metadata = await lstat(path); } catch { fail("artifact_ingress_sender_input_invalid"); }
  if (!metadata.isFile() || metadata.isSymbolicLink() || !Number.isSafeInteger(metadata.size)) fail("artifact_ingress_sender_input_invalid");
  const hash = createHash("sha256");
  try { for await (const chunk of createReadStream(path, { highWaterMark: 64 * 1024 })) hash.update(chunk); }
  catch { fail("artifact_ingress_sender_input_invalid"); }
  return { path, fileName: basename(path), sizeBytes: metadata.size, sha256: hash.digest("hex") };
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
  const inspected = Object.fromEntries(await Promise.all(FILE_KEYS.map(async (key) => [key, await inspectFile(files[key])])));
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
    try { for await (const chunk of createReadStream(item.path, { highWaterMark: 64 * 1024 })) await write(output, chunk); }
    catch (error) {
      if (error instanceof ArtifactIngressV2ContractError) throw error;
      fail("artifact_ingress_sender_stream_failed");
    }
  }
  return header;
}
