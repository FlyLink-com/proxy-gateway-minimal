import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import {
  ArtifactIngressPacketError,
  buildCanonicalIngressPacket
} from "../../scripts/control-plane-artifact-ingress-packet-builder.mjs";

const NOW = "2026-09-03T06:00:00.000Z";
const SOURCE_COMMIT = "a".repeat(40);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function fixture(t, { dependencyCommit = SOURCE_COMMIT } = {}) {
  const root = mkdtempSync(join(tmpdir(), "gccgw-artifact-packet-"));
  const input = join(root, "input");
  const output = join(root, "output");
  mkdirSync(input);
  mkdirSync(output);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const sourceArchive = join(input, "source.zip");
  const dependencyArtifact = join(input, "node-modules.tar");
  const sourceManifest = join(input, "artifact.json");
  const dependencyManifest = join(input, "dependency-artifact.json");
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
  return { output, sourceArchive, dependencyArtifact, sourceManifest, dependencyManifest };
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
