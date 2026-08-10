import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  buildToolchainInventoryEvidence,
  FOUNDATION_TOOLCHAIN_CONTAINER_IMAGE,
  FOUNDATION_TOOLCHAIN_PLATFORM,
  FOUNDATION_TOOL_ROLES,
  serializeToolchainInventoryLine
} from "../../scripts/control-plane-foundation-toolchain-inventory.mjs";

function evidenceInput(overrides = {}) {
  return {
    sourceCommit: "a".repeat(40),
    workflowSha256: "b".repeat(64),
    containerImage: FOUNDATION_TOOLCHAIN_CONTAINER_IMAGE,
    nodeVersion: "v22.23.1",
    nodeModuleAbi: "127",
    nodeApiVersion: "10",
    toolRoles: FOUNDATION_TOOL_ROLES.map((role, index) => ({
      role,
      sha256: (index + 1).toString(16).repeat(64)
    })),
    headersTreeSha256: "f".repeat(64),
    ...overrides
  };
}

test("v2 inventory binds one complete immutable OCI closure and stays non-authoritative", () => {
  const evidence = buildToolchainInventoryEvidence(evidenceInput());

  assert.deepEqual(Object.keys(evidence), [
    "schemaVersion",
    "receiptType",
    "authority",
    "eligible",
    "sourceCommit",
    "workflowPath",
    "workflowSha256",
    "closureKind",
    "containerImage",
    "containerManifestSha256",
    "platform",
    "nodeVersion",
    "nodeModuleAbi",
    "nodeApiVersion",
    "toolRoles",
    "toolRolesSha256",
    "headersTreeSha256",
    "candidateClosureSha256"
  ]);
  assert.equal(evidence.schemaVersion, "2");
  assert.equal(evidence.receiptType, "control_plane_foundation_toolchain_inventory_v2");
  assert.equal(evidence.authority, "inventory_only");
  assert.equal(evidence.eligible, false);
  assert.equal(evidence.closureKind, "oci_platform_manifest");
  assert.equal(evidence.containerImage, FOUNDATION_TOOLCHAIN_CONTAINER_IMAGE);
  assert.equal(evidence.platform, FOUNDATION_TOOLCHAIN_PLATFORM);
  assert.match(evidence.containerManifestSha256, /^[a-f0-9]{64}$/);
  assert.match(evidence.toolRolesSha256, /^[a-f0-9]{64}$/);
  assert.match(evidence.candidateClosureSha256, /^[a-f0-9]{64}$/);
});

test("closure digest changes for headers, role bytes, or container identity drift", () => {
  const baseline = buildToolchainInventoryEvidence(evidenceInput());
  const changedHeaders = buildToolchainInventoryEvidence(evidenceInput({
    headersTreeSha256: "e".repeat(64)
  }));
  const input = evidenceInput();
  const changedRoles = buildToolchainInventoryEvidence({
    ...input,
    toolRoles: input.toolRoles.map((entry, index) => (
      index === 0 ? { ...entry, sha256: "d".repeat(64) } : entry
    ))
  });
  assert.notEqual(changedHeaders.candidateClosureSha256, baseline.candidateClosureSha256);
  assert.notEqual(changedRoles.candidateClosureSha256, baseline.candidateClosureSha256);
  assert.throws(
    () => buildToolchainInventoryEvidence(evidenceInput({
      containerImage: FOUNDATION_TOOLCHAIN_CONTAINER_IMAGE.replace(/.$/, "0")
    })),
    /foundation_toolchain_inventory_container_invalid/
  );
});

test("canonical v2 line contains no host path or secret-like field", () => {
  const line = serializeToolchainInventoryLine(buildToolchainInventoryEvidence(evidenceInput()));
  assert.equal(line.at(-1), 0x0a);
  assert.equal(line.subarray(0, -1).includes(0x0a), false);
  const text = line.toString("utf8").toLowerCase();
  for (const forbidden of [
    "hostname",
    "runnername",
    "uid",
    "pid",
    "device",
    "inode",
    "credential",
    "secret",
    "token"
  ]) {
    assert.equal(text.includes(forbidden), false);
  }
});

test("missing, reordered, forged, or duplicate tool-role evidence fails closed", () => {
  const input = evidenceInput();
  assert.throws(
    () => buildToolchainInventoryEvidence({ ...input, toolRoles: input.toolRoles.slice(1) }),
    /foundation_toolchain_inventory_role_order_invalid/
  );
  assert.throws(
    () => buildToolchainInventoryEvidence({ ...input, toolRoles: [...input.toolRoles].reverse() }),
    /foundation_toolchain_inventory_role_order_invalid/
  );
  assert.throws(
    () => buildToolchainInventoryEvidence({
      ...input,
      toolRoles: input.toolRoles.map((entry, index) => (
        index === 0 ? { ...entry, sha256: "not-a-digest" } : entry
      ))
    }),
    /foundation_toolchain_inventory_role_invalid/
  );
  assert.throws(
    () => buildToolchainInventoryEvidence({
      ...input,
      toolRoles: input.toolRoles.map((entry, index) => (
        index === 1 ? { ...entry, sha256: input.toolRoles[0].sha256 } : entry
      ))
    }),
    /foundation_toolchain_inventory_duplicate_tool_bytes/
  );
});

test("inventory controller has no execution, network, or publication primitive", async () => {
  const source = await readFile(
    new URL("../../scripts/control-plane-foundation-toolchain-inventory.mjs", import.meta.url),
    "utf8"
  );
  assert.doesNotMatch(source, /node:(?:child_process|http|https|net|tls|dgram)/);
  assert.doesNotMatch(source, /\b(?:spawn|spawnSync|exec|execFile|fork|fetch)\s*\(/);
  assert.doesNotMatch(source, /(?:upload|publish|release|package|podman|\bdocker\s+)/i);
});
