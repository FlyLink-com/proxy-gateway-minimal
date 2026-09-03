import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Writable } from "node:stream";
import test from "node:test";

import { receiveArtifactIngress } from "../../scripts/control-plane-artifact-ingress-receiver.mjs";
import { writeArtifactIngressPacket } from "../../scripts/control-plane-artifact-ingress-sender.mjs";

const NOW = "2026-09-03T06:00:00.000Z";
const SOURCE_COMMIT = "d".repeat(40);

test("sender emits the only accepted ordered packet and the receiver can verify it", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "gccgw-artifact-sender-"));
  const quarantineRoot = join(root, "quarantine");
  const receiptRoot = join(root, "receipts");
  const packetRoot = join(root, "packet");
  mkdirSync(quarantineRoot);
  mkdirSync(receiptRoot);
  mkdirSync(packetRoot);
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const files = {
    sourceArchive: join(packetRoot, "source.zip"),
    dependencyArtifact: join(packetRoot, "dependency.tar"),
    manifest: join(packetRoot, "artifact.json"),
    checksum: join(packetRoot, "artifact.sha256")
  };
  writeFileSync(files.sourceArchive, "source");
  writeFileSync(files.dependencyArtifact, "dependency");
  writeFileSync(files.manifest, '{"sourceCommit":"fixture"}');
  writeFileSync(files.checksum, "source.zip fixture");

  const chunks = [];
  const output = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.from(chunk));
      callback();
    }
  });
  const header = await writeArtifactIngressPacket({
    output,
    files,
    sourceCommit: SOURCE_COMMIT,
    issuedAt: NOW,
    expiresAt: "2026-09-04T06:00:00.000Z"
  });

  assert.deepEqual(header.entries.map((entry) => entry.name), [
    "source-archive",
    "dependency-artifact",
    "manifest",
    "checksum"
  ]);
  const receipt = await receiveArtifactIngress({
    input: chunks,
    quarantineRoot,
    receiptRoot,
    now: NOW,
    candidateId: "22222222-2222-4222-8222-222222222222"
  });
  assert.equal(receipt.sourceCommit, SOURCE_COMMIT);
});
