import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import {
  ArtifactIngressPacketError,
  buildCanonicalIngressPacket,
  buildCanonicalIngressPacketFromArtifactDirectories,
  runArtifactIngressPacketBuilderCli
} from "../../scripts/control-plane-artifact-ingress-packet-builder.mjs";

const NOW = "2026-09-03T06:00:00.000Z";
const SOURCE_COMMIT = "a".repeat(40);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function fixture(t, { dependencyCommit = SOURCE_COMMIT, separateDirectories = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), "gccgw-artifact-packet-"));
  const input = join(root, "input");
  const sourceDirectory = separateDirectories ? join(root, "source") : input;
  const dependencyDirectory = separateDirectories ? join(root, "dependency") : input;
  const output = join(root, "output");
  mkdirSync(input);
  if (separateDirectories) {
    mkdirSync(sourceDirectory);
    mkdirSync(dependencyDirectory);
  }
  mkdirSync(output);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const sourceArchive = join(sourceDirectory, "source.zip");
  const dependencyArtifact = join(dependencyDirectory, "node-modules.tar");
  const sourceManifest = join(sourceDirectory, "artifact.json");
  const dependencyManifest = join(dependencyDirectory, "dependency-artifact.json");
  writeFileSync(sourceArchive, "source artifact bytes");
  writeFileSync(dependencyArtifact, "dependency artifact bytes");
  const sourceBytes = Buffer.byteLength("source artifact bytes");
  const dependencyBytes = Buffer.byteLength("dependency artifact bytes");
  writeFileSync(sourceManifest, JSON.stringify({
    schemaVersion: "1",
    releaseUnit: "control-plane-app",
    sourceCommit: SOURCE_COMMIT,
    release: "fixture-source",
    artifact: {
      fileName: "source.zip",
      sha256: sha256("source artifact bytes"),
      sizeBytes: sourceBytes,
      createdAt: NOW
    }
  }));
  writeFileSync(dependencyManifest, JSON.stringify({
    schemaVersion: "4",
    type: "control_plane_dependency_artifact",
    state: "verified",
    releaseUnit: "control-plane-app",
    sourceCommit: dependencyCommit,
    artifactRelease: "fixture-dependency",
    archive: {
      fileName: "node-modules.tar",
      sha256: sha256("dependency artifact bytes"),
      sizeBytes: dependencyBytes
    }
  }));
  return {
    output, sourceArchive, dependencyArtifact, sourceManifest, dependencyManifest,
    sourceDirectory, dependencyDirectory
  };
}

test("packet builder emits one canonical four-object packet bound to both verified manifests", async (t) => {
  const input = fixture(t);
  const packet = await buildCanonicalIngressPacket({
    ...input,
    issuedAt: NOW,
    expiresAt: "2026-09-04T06:00:00.000Z"
  });

  assert.deepEqual(packet.header.entries.map((entry) => entry.name), [
    "source-archive",
    "dependency-artifact",
    "manifest",
    "checksum"
  ]);
  assert.equal(packet.header.sourceCommit, SOURCE_COMMIT);
  const manifest = JSON.parse(readFileSync(packet.files.manifest, "utf8"));
  assert.deepEqual(manifest, {
    schemaVersion: "1",
    type: "control_plane_artifact_ingress_packet",
    sourceCommit: SOURCE_COMMIT,
    issuedAt: NOW,
    expiresAt: "2026-09-04T06:00:00.000Z",
    source: {
      release: "fixture-source",
      sha256: packet.header.entries[0].sha256,
      sizeBytes: packet.header.entries[0].sizeBytes
    },
    dependency: {
      release: "fixture-dependency",
      sha256: packet.header.entries[1].sha256,
      sizeBytes: packet.header.entries[1].sizeBytes
    }
  });
  const checksum = readFileSync(packet.files.checksum, "utf8");
  assert.match(checksum, new RegExp(`^${packet.header.entries[0].sha256}  source-archive$`, "m"));
  assert.match(checksum, new RegExp(`^${packet.header.entries[1].sha256}  dependency-artifact$`, "m"));
  assert.match(checksum, new RegExp(`^${packet.header.entries[2].sha256}  manifest$`, "m"));
});

test("packet builder rejects manifest commit drift before publishing a packet", async (t) => {
  const input = fixture(t, { dependencyCommit: "c".repeat(40) });
  await assert.rejects(
    () => buildCanonicalIngressPacket({
      ...input,
      issuedAt: NOW,
      expiresAt: "2026-09-04T06:00:00.000Z"
    }),
    (error) => error instanceof ArtifactIngressPacketError
      && error.code === "artifact_ingress_packet_manifest_invalid"
  );
  assert.deepEqual(readdirSync(input.output), []);
});

test("packet builder rejects an archive whose bytes drift from its reviewed manifest", async (t) => {
  const input = fixture(t);
  writeFileSync(input.sourceArchive, "tampered source artifact bytes");
  await assert.rejects(
    () => buildCanonicalIngressPacket({
      ...input,
      issuedAt: NOW,
      expiresAt: "2026-09-04T06:00:00.000Z"
    }),
    (error) => error instanceof ArtifactIngressPacketError
      && error.code === "artifact_ingress_packet_manifest_invalid"
  );
  assert.deepEqual(readdirSync(input.output), []);
});

test("directory builder derives only manifest-named regular artifacts under fixed directories", async (t) => {
  const input = fixture(t, { separateDirectories: true });
  const packet = await buildCanonicalIngressPacketFromArtifactDirectories({
    sourceDirectory: input.sourceDirectory,
    dependencyDirectory: input.dependencyDirectory,
    output: input.output,
    expectedSourceCommit: SOURCE_COMMIT,
    issuedAt: NOW,
    expiresAt: "2026-09-04T05:00:00.000Z"
  });
  assert.equal(packet.header.sourceCommit, SOURCE_COMMIT);
  assert.deepEqual(readdirSync(input.output).sort(), ["ingress-checksum.sha256", "ingress-manifest.json"]);
});

test("directory builder rejects a manifest artifact path that escapes its download directory", async (t) => {
  const input = fixture(t, { separateDirectories: true });
  const sourceManifest = JSON.parse(readFileSync(input.sourceManifest, "utf8"));
  sourceManifest.artifact.fileName = "../node-modules.tar";
  writeFileSync(input.sourceManifest, JSON.stringify(sourceManifest));
  await assert.rejects(
    () => buildCanonicalIngressPacketFromArtifactDirectories({
      sourceDirectory: input.sourceDirectory,
      dependencyDirectory: input.dependencyDirectory,
      output: input.output,
      expectedSourceCommit: SOURCE_COMMIT,
      issuedAt: NOW,
      expiresAt: "2026-09-04T05:00:00.000Z"
    }),
    (error) => error instanceof ArtifactIngressPacketError
      && error.code === "artifact_ingress_packet_manifest_invalid"
  );
  assert.deepEqual(readdirSync(input.output), []);
});

test("packet builder CLI accepts only complete exact option sets", async (t) => {
  const input = fixture(t, { separateDirectories: true });
  let output = "";
  let errors = "";
  const exitCode = await runArtifactIngressPacketBuilderCli({
    argv: [
      "--source-directory", input.sourceDirectory,
      "--dependency-directory", input.dependencyDirectory,
      "--output-directory", input.output,
      "--source-commit", SOURCE_COMMIT,
      "--issued-at", NOW,
      "--expires-at", "2026-09-04T05:00:00.000Z"
    ],
    stdout: { write(value) { output += value; } },
    stderr: { write(value) { errors += value; } }
  });
  assert.equal(exitCode, 0);
  assert.match(output, /^artifact_ingress_packet_staged source_commit=/);
  assert.equal(errors, "");

  let invalidErrors = "";
  const invalidExitCode = await runArtifactIngressPacketBuilderCli({
    argv: ["--source-directory", input.sourceDirectory],
    stdout: { write() {} },
    stderr: { write(value) { invalidErrors += value; } }
  });
  assert.equal(invalidExitCode, 1);
  assert.equal(invalidErrors, "artifact_ingress_packet_cli_invalid\n");
});
