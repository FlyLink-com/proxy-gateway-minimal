import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildFoundationToolchainLock,
  extractCanonicalV2InventoryFromLog,
  FOUNDATION_TOOLCHAIN_CONFIRMATION,
  serializeFoundationToolchainLock
} from "../../scripts/control-plane-foundation-toolchain-publication.mjs";
import {
  buildToolchainInventoryEvidence,
  FOUNDATION_TOOLCHAIN_CONTAINER_IMAGE,
  FOUNDATION_TOOL_ROLES,
  serializeToolchainInventoryLine
} from "../../scripts/control-plane-foundation-toolchain-inventory.mjs";
import { sha256Hex } from "../services/deployment/canonical-json.mjs";

function inventoryEvidence() {
  return buildToolchainInventoryEvidence({
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
    headersTreeSha256: "f".repeat(64)
  });
}

test("extracts exactly one canonical v2 inventory receipt from GitHub log prefixes", () => {
  const bytes = serializeToolchainInventoryLine(inventoryEvidence()).subarray(0, -1);
  const log = `job\tstep\t2026-08-10T00:00:00Z ${bytes.toString("utf8")}\n`;
  const extracted = extractCanonicalV2InventoryFromLog(log);
  assert.deepEqual(extracted.bytes, bytes);
  assert.equal(extracted.sha256, sha256Hex(bytes));
  assert.throws(() => extractCanonicalV2InventoryFromLog(`${log}${log}`), /foundation_toolchain_inventory_count_invalid/);
  assert.throws(() => extractCanonicalV2InventoryFromLog("no receipt\n"), /foundation_toolchain_inventory_count_invalid/);
});

test("builds one content-addressed lock without a self digest", () => {
  const inventory = inventoryEvidence();
  const inventoryBytes = serializeToolchainInventoryLine(inventory).subarray(0, -1);
  const result = buildFoundationToolchainLock({
    inventoryRunId: "31355310872",
    inventoryReceiptSha256: sha256Hex(inventoryBytes),
    inventory,
    confirmation: FOUNDATION_TOOLCHAIN_CONFIRMATION
  });

  assert.deepEqual(Object.keys(result.value), [
    "schemaVersion",
    "assetType",
    "sourceCommit",
    "inventoryRunId",
    "inventoryReceiptSha256",
    "inventoryWorkflowPath",
    "inventoryWorkflowSha256",
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
    "candidateClosureSha256",
    "releaseTag",
    "assetName"
  ]);
  assert.equal(result.value.candidateClosureSha256, inventory.candidateClosureSha256);
  assert.equal(result.releaseTag, `control-plane-foundation-toolchain-v2-${inventory.candidateClosureSha256}`);
  assert.equal(result.assetName, `foundation-toolchain-lock-v2-${inventory.candidateClosureSha256}.json`);
  assert.deepEqual(serializeFoundationToolchainLock(result.value), result.bytes);
  assert.equal(JSON.stringify(result.value).includes(result.sha256), false);
});

test("publication lock rejects wrong confirmation, run ID, or non-v2 inventory", () => {
  const inventory = inventoryEvidence();
  const inventoryReceiptSha256 = sha256Hex(serializeToolchainInventoryLine(inventory).subarray(0, -1));
  const input = {
    inventoryRunId: "31355310872",
    inventoryReceiptSha256,
    inventory,
    confirmation: FOUNDATION_TOOLCHAIN_CONFIRMATION
  };
  assert.throws(
    () => buildFoundationToolchainLock({ ...input, confirmation: "publish it" }),
    /foundation_toolchain_publication_confirmation_invalid/
  );
  assert.throws(
    () => buildFoundationToolchainLock({ ...input, inventoryRunId: "not-a-run" }),
    /foundation_toolchain_inventory_run_id_invalid/
  );
  assert.throws(
    () => buildFoundationToolchainLock({
      ...input,
      inventory: { ...inventory, schemaVersion: "1" }
    }),
    /foundation_toolchain_inventory_v2_required/
  );
});
