#!/usr/bin/env node
import { fileURLToPath } from "node:url";

import {
  ArtifactIngressV2PacketError,
  buildCanonicalIngressV2PacketFromArtifactDirectories
} from "./control-plane-artifact-ingress-v2-packet-builder.mjs";
import { writeArtifactIngressV2Packet } from "./control-plane-artifact-ingress-v2-sender.mjs";

const ARGUMENT_NAMES = Object.freeze([
  "source-directory",
  "dependency-directory",
  "packet-id",
  "source-commit",
  "issued-at",
  "expires-at"
]);

function fail(code) {
  throw new ArtifactIngressV2PacketError(code);
}

function parseArguments(argv) {
  if (!Array.isArray(argv) || argv.length !== ARGUMENT_NAMES.length * 2) {
    fail("artifact_ingress_v2_delivery_arguments_invalid");
  }
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith("--") || typeof value !== "string" || value.length === 0) {
      fail("artifact_ingress_v2_delivery_arguments_invalid");
    }
    const name = flag.slice(2);
    if (!ARGUMENT_NAMES.includes(name) || values.has(name)) {
      fail("artifact_ingress_v2_delivery_arguments_invalid");
    }
    values.set(name, value);
  }
  return Object.fromEntries(values);
}

export async function writeCanonicalIngressV2Delivery({
  output,
  sourceDirectory,
  dependencyDirectory,
  packetId,
  sourceCommit,
  issuedAt,
  expiresAt
} = {}) {
  const packet = await buildCanonicalIngressV2PacketFromArtifactDirectories({
    sourceDirectory,
    dependencyDirectory,
    packetId,
    expectedSourceCommit: sourceCommit,
    issuedAt,
    expiresAt
  });
  return writeArtifactIngressV2Packet({
    output,
    files: packet.files,
    expectedHeader: packet.header
  });
}

export async function runCanonicalIngressV2DeliveryCli({
  argv = process.argv.slice(2),
  stdout = process.stdout,
  stderr = process.stderr
} = {}) {
  try {
    const options = parseArguments(argv);
    await writeCanonicalIngressV2Delivery({
      output: stdout,
      sourceDirectory: options["source-directory"],
      dependencyDirectory: options["dependency-directory"],
      packetId: options["packet-id"],
      sourceCommit: options["source-commit"],
      issuedAt: options["issued-at"],
      expiresAt: options["expires-at"]
    });
    return 0;
  } catch (error) {
    const code = error instanceof ArtifactIngressV2PacketError
      ? error.code
      : "artifact_ingress_v2_delivery_failed";
    stderr.write(`${code}\n`);
    return 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const exitCode = await runCanonicalIngressV2DeliveryCli();
  if (exitCode !== 0) process.exitCode = exitCode;
}
