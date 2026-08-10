import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  buildToolchainInventoryEvidence,
  FOUNDATION_TOOL_ROLES,
  serializeToolchainInventoryLine
} from "../../scripts/control-plane-foundation-toolchain-inventory.mjs";

function evidenceInput() {
  return {
    sourceCommit: "a".repeat(40),
    workflowSha256: "b".repeat(64),
    nodeVersion: "v22.18.0",
    nodeModuleAbi: "127",
    nodeApiVersion: "9",
    toolRoles: FOUNDATION_TOOL_ROLES.map((role, index) => ({
      role,
      sha256: (index + 1).toString(16).repeat(64)
    })),
    headersTreeSha256: "f".repeat(64)
  };
}

test("inventory evidence is permanently non-authoritative", () => {
  const evidence = buildToolchainInventoryEvidence(evidenceInput());

  assert.deepEqual(Object.keys(evidence), [
    "schemaVersion",
    "receiptType",
    "authority",
    "eligible",
    "sourceCommit",
    "workflowPath",
    "workflowSha256",
    "nodeVersion",
    "nodeModuleAbi",
    "nodeApiVersion",
    "toolRoles",
    "headersTreeSha256",
    "candidateToolchainTreeSha256",
    "candidateBundleSha256"
  ]);
  assert.equal(evidence.authority, "inventory_only");
  assert.equal(evidence.eligible, false);
  assert.deepEqual(evidence.toolRoles.map(({ role }) => role), FOUNDATION_TOOL_ROLES);
});

test("canonical inventory line contains no absolute host path or secret-like field", () => {
  const line = serializeToolchainInventoryLine(buildToolchainInventoryEvidence(evidenceInput()));
  assert.equal(line.at(-1), 0x0a);
  assert.equal(line.subarray(0, -1).includes(0x0a), false);
  const text = line.toString("utf8").toLowerCase();
  for (const forbidden of [
    "/usr/",
    "\\users\\",
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

test("missing, reordered, or forged tool-role evidence fails closed", () => {
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
      toolRoles: input.toolRoles.map((entry, index) => index === 0 ? { ...entry, sha256: "not-a-digest" } : entry)
    }),
    /foundation_toolchain_inventory_role_invalid/
  );
});

test("inventory controller has no execution, network, or publication primitive", async () => {
  const source = await readFile(
    new URL("../../scripts/control-plane-foundation-toolchain-inventory.mjs", import.meta.url),
    "utf8"
  );
  assert.doesNotMatch(source, /node:(?:child_process|http|https|net|tls|dgram)/);
  assert.doesNotMatch(source, /\b(?:spawn|spawnSync|exec|execFile|fork|fetch)\s*\(/);
  assert.doesNotMatch(source, /(?:upload|publish|release|package|container|docker|podman)/i);
});
