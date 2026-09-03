import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { buildIngressHeader } from "../../scripts/control-plane-artifact-ingress-contract.mjs";
import {
  receiveArtifactIngress,
  runArtifactIngressReceiverCli
} from "../../scripts/control-plane-artifact-ingress-receiver.mjs";

const NOW = "2026-09-03T06:00:00.000Z";
const SOURCE_COMMIT = "c".repeat(40);

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function packet({ corruptDigest = false } = {}) {
  const payloads = [
    Buffer.from("source-fixture"),
    Buffer.from("dependency-fixture"),
    Buffer.from('{"releaseUnit":"control-plane-app"}'),
    Buffer.from("source-archive 00000000\\n")
  ];
  const names = ["source-archive", "dependency-artifact", "manifest", "checksum"];
  const header = buildIngressHeader({
    sourceCommit: SOURCE_COMMIT,
    issuedAt: NOW,
    expiresAt: "2026-09-04T06:00:00.000Z",
    entries: payloads.map((bytes, index) => ({
      name: names[index],
      sizeBytes: bytes.length,
      sha256: corruptDigest && index === 1 ? "0".repeat(64) : digest(bytes)
    }))
  });
  const headerBytes = Buffer.from(JSON.stringify(header), "utf8");
  const prefix = Buffer.alloc(4);
  prefix.writeUInt32BE(headerBytes.length);
  return {
    header,
    chunks: [prefix, headerBytes, ...payloads]
  };
}

test("receiver accepts only a complete digest-bound packet and writes an aggregate-safe receipt", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "gccgw-artifact-ingress-"));
  const quarantineRoot = join(root, "quarantine");
  const receiptRoot = join(root, "receipts");
  mkdirSync(quarantineRoot);
  mkdirSync(receiptRoot);
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const { chunks } = packet();
  const receipt = await receiveArtifactIngress({
    input: chunks.map((chunk) => Buffer.from(chunk)),
    quarantineRoot,
    receiptRoot,
    now: NOW,
    candidateId: "11111111-1111-4111-8111-111111111111"
  });

  assert.equal(receipt.state, "candidate_received");
  assert.equal(receipt.sourceCommit, SOURCE_COMMIT);
  assert.equal(JSON.stringify(receipt).includes(root), false);
  assert.equal(
    readFileSync(join(quarantineRoot, receipt.candidateId, "source-archive"), "utf8"),
    "source-fixture"
  );
  assert.equal(
    readFileSync(join(receiptRoot, receipt.candidateId + ".json"), "utf8").includes(root),
    false
  );
});

test("receiver removes partial bytes and publishes no receipt when a payload digest mismatches", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "gccgw-artifact-ingress-reject-"));
  const quarantineRoot = join(root, "quarantine");
  const receiptRoot = join(root, "receipts");
  mkdirSync(quarantineRoot);
  mkdirSync(receiptRoot);
  const candidateId = randomUUID();
  t.after(() => rmSync(root, { recursive: true, force: true }));

  await assert.rejects(
    () => receiveArtifactIngress({
      input: packet({ corruptDigest: true }).chunks,
      quarantineRoot,
      receiptRoot,
      now: NOW,
      candidateId
    }),
    (error) => error.code === "artifact_ingress_digest_mismatch"
  );

  assert.equal(existsSync(join(quarantineRoot, candidateId)), false);
  assert.equal(existsSync(join(receiptRoot, candidateId + ".json")), false);
});

test("receiver CLI accepts only fixed roots and emits an aggregate-safe receipt", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "gccgw-artifact-ingress-cli-"));
  const quarantineRoot = join(root, "quarantine");
  const receiptRoot = join(root, "receipts");
  mkdirSync(quarantineRoot);
  mkdirSync(receiptRoot);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  let stdout = "";
  let stderr = "";

  const exitCode = await runArtifactIngressReceiverCli({
    argv: ["--quarantine-root", quarantineRoot, "--receipt-root", receiptRoot],
    stdin: packet().chunks,
    stdout: { write: (value) => { stdout += value; } },
    stderr: { write: (value) => { stderr += value; } },
    now: NOW,
    candidateId: "33333333-3333-4333-8333-333333333333"
  });

  assert.equal(exitCode, 0);
  assert.equal(stderr, "");
  assert.equal(JSON.parse(stdout).candidateId, "33333333-3333-4333-8333-333333333333");
  assert.equal(stdout.includes(root), false);
});

test("receiver CLI rejects extra or reordered arguments without echoing host paths", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "gccgw-artifact-ingress-cli-reject-"));
  const quarantineRoot = join(root, "quarantine");
  const receiptRoot = join(root, "receipts");
  mkdirSync(quarantineRoot);
  mkdirSync(receiptRoot);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  let stdout = "";
  let stderr = "";

  const exitCode = await runArtifactIngressReceiverCli({
    argv: ["--receipt-root", receiptRoot, "--quarantine-root", quarantineRoot],
    stdin: packet().chunks,
    stdout: { write: (value) => { stdout += value; } },
    stderr: { write: (value) => { stderr += value; } },
    now: NOW
  });

  assert.equal(exitCode, 1);
  assert.equal(stdout, "");
  assert.equal(JSON.parse(stderr).error, "artifact_ingress_arguments_invalid");
  assert.equal(stderr.includes(root), false);
});
