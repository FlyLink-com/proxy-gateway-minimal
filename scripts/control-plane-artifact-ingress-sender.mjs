#!/usr/bin/env node
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat } from "node:fs/promises";
import { once } from "node:events";

import {
  ArtifactIngressContractError,
  buildIngressHeader
} from "./control-plane-artifact-ingress-contract.mjs";

const FILE_BINDINGS = Object.freeze([
  ["source-archive", "sourceArchive"],
  ["dependency-artifact", "dependencyArtifact"],
  ["manifest", "manifest"],
  ["checksum", "checksum"]
]);

function fail(code) {
  throw new ArtifactIngressContractError(code);
}

async function inspectFile(path) {
  if (typeof path !== "string" || path.length === 0 || path.length > 4096) {
    fail("artifact_ingress_sender_input_invalid");
  }
  let metadata;
  try {
    metadata = await lstat(path);
  } catch {
    fail("artifact_ingress_sender_input_invalid");
  }
  if (!metadata.isFile() || metadata.isSymbolicLink() || !Number.isSafeInteger(metadata.size)) {
    fail("artifact_ingress_sender_input_invalid");
  }
  const hash = createHash("sha256");
  try {
    for await (const chunk of createReadStream(path, { highWaterMark: 64 * 1024 })) {
      hash.update(chunk);
    }
  } catch {
    fail("artifact_ingress_sender_input_invalid");
  }
  return { path, sizeBytes: metadata.size, sha256: hash.digest("hex") };
}

async function writeChunk(output, chunk) {
  if (!output || typeof output.write !== "function") fail("artifact_ingress_sender_output_invalid");
  if (output.write(chunk)) return;
  if (typeof output.once !== "function") fail("artifact_ingress_sender_output_invalid");
  await once(output, "drain");
}

export async function writeArtifactIngressPacket({
  output,
  files,
  sourceCommit,
  issuedAt,
  expiresAt
} = {}) {
  if (!files || typeof files !== "object" || Array.isArray(files)
    || Object.keys(files).sort().join("\n") !== FILE_BINDINGS.map(([, key]) => key).sort().join("\n")) {
    fail("artifact_ingress_sender_input_invalid");
  }
  const inspected = await Promise.all(FILE_BINDINGS.map(async ([name, key]) => ({
    name,
    ...(await inspectFile(files[key]))
  })));
  const header = buildIngressHeader({
    sourceCommit,
    issuedAt,
    expiresAt,
    entries: inspected.map(({ name, sizeBytes, sha256 }) => ({ name, sizeBytes, sha256 }))
  });
  const headerBytes = Buffer.from(JSON.stringify(header), "utf8");
  const prefix = Buffer.alloc(4);
  prefix.writeUInt32BE(headerBytes.length);
  await writeChunk(output, prefix);
  await writeChunk(output, headerBytes);
  for (const file of inspected) {
    try {
      for await (const chunk of createReadStream(file.path, { highWaterMark: 64 * 1024 })) {
        await writeChunk(output, chunk);
      }
    } catch (error) {
      if (error instanceof ArtifactIngressContractError) throw error;
      fail("artifact_ingress_sender_stream_failed");
    }
  }
  return header;
}
