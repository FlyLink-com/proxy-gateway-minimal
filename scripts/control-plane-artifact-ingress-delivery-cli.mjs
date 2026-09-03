#!/usr/bin/env node
import { fileURLToPath } from "node:url";

import {
  ArtifactIngressPacketError,
  buildCanonicalIngressPacketFromArtifactDirectories
} from "./control-plane-artifact-ingress-packet-builder.mjs";
import { writeArtifactIngressPacket } from "./control-plane-artifact-ingress-sender.mjs";

const ARGUMENT_NAMES = Object.freeze([
  "source-directory",
  "dependency-directory",
  "output-directory",
  "source-commit",
  "issued-at",
  "expires-at"
]);

function fail(code) {
  throw new ArtifactIngressPacketError(code);
}

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith("--") || value === undefined) fail("artifact_ingress_delivery_arguments_invalid");
    const name = flag.slice(2);
    if (!ARGUMENT_NAMES.includes(name) || values.has(name) || value.length === 0) {
      fail("artifact_ingress_delivery_arguments_invalid");
    }
    values.set(name, value);
  }
  if (values.size !== ARGUMENT_NAMES.length) fail("artifact_ingress_delivery_arguments_invalid");
  return Object.fromEntries(values);
}

export async function writeCanonicalIngressDelivery({
  output,
  sourceDirectory,
  dependencyDirectory,
  outputDirectory,
  sourceCommit,
  issuedAt,
  expiresAt
} = {}) {
  const packet = await buildCanonicalIngressPacketFromArtifactDirectories({
    sourceDirectory,
    dependencyDirectory,
    output: outputDirectory,
    expectedSourceCommit: sourceCommit,
    issuedAt,
    expiresAt
  });
  return writeArtifactIngressPacket({
    output,
    files: {
      sourceArchive: packet.files.sourceArchive,
      dependencyArtifact: packet.files.dependencyArtifact,
      manifest: packet.files.manifest,
      checksum: packet.files.checksum
    },
    sourceCommit,
    issuedAt,
    expiresAt
  });
}

export async function runCanonicalIngressDeliveryCli({
  argv = process.argv.slice(2),
  stdout = process.stdout,
  stderr = process.stderr
} = {}) {
  try {
    const options = parseArguments(argv);
    await writeCanonicalIngressDelivery({
      output: stdout,
      sourceDirectory: options["source-directory"],
      dependencyDirectory: options["dependency-directory"],
      outputDirectory: options["output-directory"],
      sourceCommit: options["source-commit"],
      issuedAt: options["issued-at"],
      expiresAt: options["expires-at"]
    });
    return 0;
  } catch (error) {
    const code = error instanceof ArtifactIngressPacketError
      ? error.code
      : "artifact_ingress_delivery_failed";
    stderr.write(`${code}\n`);
    return 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const exitCode = await runCanonicalIngressDeliveryCli();
  if (exitCode !== 0) process.exitCode = exitCode;
}
