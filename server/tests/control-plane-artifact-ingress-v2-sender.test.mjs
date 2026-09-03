import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Writable } from "node:stream";
import test from "node:test";

import { buildIngressV2Header } from "../../scripts/control-plane-artifact-ingress-v2-contract.mjs";
import { writeArtifactIngressV2Packet } from "../../scripts/control-plane-artifact-ingress-v2-sender.mjs";
import { receiveArtifactIngress } from "../../scripts/control-plane-artifact-ingress-receiver.mjs";

const NOW = "2026-09-03T06:00:00.000Z";
const SOURCE_COMMIT = "a".repeat(40);
const digest = (value) => createHash("sha256").update(value).digest("hex");

test("v2 sender emits only the exact six-file stage input layout", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "gccgw-artifact-ingress-v2-sender-"));
  const filesRoot = join(root, "input");
  mkdirSync(filesRoot);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const archive = "proxy-gateway-fixture.zip";
  const files = {
    artifactManifest: join(filesRoot, "artifact.json"),
    sourceArchive: join(filesRoot, archive),
    sourceChecksum: join(filesRoot, `${archive}.sha256`),
    dependencyManifest: join(filesRoot, "dependency-artifact.json"),
    dependencyArchive: join(filesRoot, "node-modules.tar"),
    releaseLabel: join(filesRoot, "release-label.txt")
  };
  for (const path of Object.values(files)) writeFileSync(path, "fixture");
  const chunks = [];
  const output = new Writable({ write(chunk, _encoding, done) { chunks.push(Buffer.from(chunk)); done(); } });
  const expectedHeader = buildIngressV2Header({
    packetId: "11111111-1111-4111-8111-111111111111",
    sourceCommit: SOURCE_COMMIT,
    issuedAt: NOW,
    expiresAt: "2026-09-04T05:00:00.000Z",
    entries: [
      "artifact.json", archive, `${archive}.sha256`,
      "dependency-artifact.json", "node-modules.tar", "release-label.txt"
    ].map((name) => ({ name, sizeBytes: 7, sha256: digest("fixture") }))
  });
  const header = await writeArtifactIngressV2Packet({
    output, files, expectedHeader
  });
  assert.deepEqual(header.entries.map((entry) => entry.name), [
    "artifact.json", archive, `${archive}.sha256`, "dependency-artifact.json", "node-modules.tar", "release-label.txt"
  ]);
  assert.equal(header.aggregateSizeBytes, 42);
  assert.ok(chunks.length > 2);
  assert.equal(header.entries[0].sha256, digest("fixture"));
  const quarantineRoot = join(root, "quarantine");
  const receiptRoot = join(root, "receipts");
  mkdirSync(quarantineRoot);
  mkdirSync(receiptRoot);
  const receipt = await receiveArtifactIngress({
    input: chunks, quarantineRoot, receiptRoot, now: NOW, candidateId: "22222222-2222-4222-8222-222222222222"
  });
  assert.equal(receipt.schemaVersion, "2");
  assert.equal(receipt.entries.length, 6);

  let writes = 0;
  await assert.rejects(
    () => writeArtifactIngressV2Packet({
      output: { write() { writes += 1; return writes < 3; } },
      files,
      expectedHeader
    }),
    (error) => error.code === "artifact_ingress_sender_output_invalid"
  );

  const expiryQuarantine = join(root, "expiry-quarantine");
  const expiryReceipts = join(root, "expiry-receipts");
  mkdirSync(expiryQuarantine);
  mkdirSync(expiryReceipts);
  const clockValues = [NOW, expectedHeader.expiresAt];
  await assert.rejects(
    () => receiveArtifactIngress({
      input: chunks,
      quarantineRoot: expiryQuarantine,
      receiptRoot: expiryReceipts,
      clock: () => clockValues.shift()
    }),
    (error) => error.code === "artifact_ingress_expiry_invalid"
  );
  assert.deepEqual(readdirSync(expiryQuarantine), []);
  assert.deepEqual(readdirSync(expiryReceipts), []);
});

test("v2 receiver claims packetId before payload and rejects concurrent and serial replay", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "gccgw-artifact-ingress-v2-replay-"));
  const filesRoot = join(root, "input");
  const quarantineRoot = join(root, "quarantine");
  const receiptRoot = join(root, "receipts");
  mkdirSync(filesRoot);
  mkdirSync(quarantineRoot);
  mkdirSync(receiptRoot);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const archive = "proxy-gateway-fixture.zip";
  const files = {
    artifactManifest: join(filesRoot, "artifact.json"),
    sourceArchive: join(filesRoot, archive),
    sourceChecksum: join(filesRoot, `${archive}.sha256`),
    dependencyManifest: join(filesRoot, "dependency-artifact.json"),
    dependencyArchive: join(filesRoot, "node-modules.tar"),
    releaseLabel: join(filesRoot, "release-label.txt")
  };
  for (const path of Object.values(files)) writeFileSync(path, "fixture");
  const expectedHeader = buildIngressV2Header({
    packetId: "33333333-3333-4333-8333-333333333333",
    sourceCommit: SOURCE_COMMIT,
    issuedAt: NOW,
    expiresAt: "2026-09-04T05:00:00.000Z",
    entries: [
      "artifact.json", archive, `${archive}.sha256`,
      "dependency-artifact.json", "node-modules.tar", "release-label.txt"
    ].map((name) => ({ name, sizeBytes: 7, sha256: digest("fixture") }))
  });
  const packet = async () => {
    const chunks = [];
    const output = new Writable({ write(chunk, _encoding, done) { chunks.push(Buffer.from(chunk)); done(); } });
    await writeArtifactIngressV2Packet({ output, files, expectedHeader });
    return chunks;
  };

  const [left, right] = await Promise.all([packet(), packet()]);
  const results = await Promise.allSettled([
    receiveArtifactIngress({ input: left, quarantineRoot, receiptRoot, now: NOW }),
    receiveArtifactIngress({ input: right, quarantineRoot, receiptRoot, now: NOW })
  ]);
  assert.equal(results.filter(({ status }) => status === "fulfilled").length, 1);
  assert.equal(results.filter(({ status }) => status === "rejected").length, 1);
  assert.equal(
    results.find(({ status }) => status === "rejected").reason.code,
    "artifact_ingress_candidate_exists"
  );
  await assert.rejects(
    () => receiveArtifactIngress({
      input: left, quarantineRoot, receiptRoot, now: NOW
    }),
    (error) => error.code === "artifact_ingress_candidate_exists"
  );
  assert.equal(existsSync(join(quarantineRoot, expectedHeader.packetId)), true);
  assert.deepEqual(readdirSync(quarantineRoot), [expectedHeader.packetId]);
  assert.deepEqual(readdirSync(receiptRoot), [`${expectedHeader.packetId}.json`]);
});
