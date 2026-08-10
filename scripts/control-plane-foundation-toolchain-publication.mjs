import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  FOUNDATION_TOOL_ROLES,
  parseToolchainInventoryBytes,
  serializeToolchainInventoryLine
} from "./control-plane-foundation-toolchain-inventory.mjs";
import {
  parseCanonicalJsonBytes,
  serializeCanonicalJsonBytes,
  sha256Hex
} from "../server/services/deployment/canonical-json.mjs";

const INVENTORY_WORKFLOW_PATH = ".github/workflows/control-plane-foundation-toolchain-inventory.yml";
const INVENTORY_WORKFLOW_NAME = "Control Plane Foundation Toolchain Inventory";
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SOURCE_COMMIT_PATTERN = /^[a-f0-9]{40}$/;
const RUN_ID_PATTERN = /^[1-9][0-9]{0,19}$/;

export const FOUNDATION_TOOLCHAIN_CONFIRMATION = "publish Foundation toolchain lock";

function frozenContract(schemaId, fieldOrder, { nested = {}, arrays = {}, validate = () => {} } = {}) {
  return Object.freeze({
    schemaId,
    maxBytes: 32 * 1024,
    fieldOrder: Object.freeze([...fieldOrder]),
    nested: Object.freeze({ ...nested }),
    arrays: Object.freeze({ ...arrays }),
    validate
  });
}

function assertSha256(value, code) {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) throw new Error(code);
}

const TOOL_ROLE_CONTRACT = frozenContract(
  "control_plane_foundation_toolchain_lock_role_v1",
  ["role", "sha256"],
  {
    validate(value) {
      if (!FOUNDATION_TOOL_ROLES.includes(value.role)) {
        throw new Error("foundation_toolchain_lock_role_invalid");
      }
      assertSha256(value.sha256, "foundation_toolchain_lock_role_invalid");
    }
  }
);

const LOCK_CONTRACT = frozenContract(
  "control_plane_foundation_toolchain_lock_v1",
  [
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
  ],
  {
    nested: { role: TOOL_ROLE_CONTRACT },
    arrays: { toolRoles: "role" },
    validate(value) {
      if (value.schemaVersion !== "1"
          || value.assetType !== "control_plane_foundation_toolchain_lock"
          || !SOURCE_COMMIT_PATTERN.test(value.sourceCommit)
          || !RUN_ID_PATTERN.test(value.inventoryRunId)
          || value.inventoryWorkflowPath !== INVENTORY_WORKFLOW_PATH
          || value.closureKind !== "oci_platform_manifest"
          || value.platform !== "linux/amd64"
          || typeof value.containerImage !== "string"
          || !value.containerImage.endsWith(`@sha256:${value.containerManifestSha256}`)
          || typeof value.nodeVersion !== "string" || !/^v\d+\.\d+\.\d+$/.test(value.nodeVersion)
          || typeof value.nodeModuleAbi !== "string" || !/^\d+$/.test(value.nodeModuleAbi)
          || typeof value.nodeApiVersion !== "string" || !/^\d+$/.test(value.nodeApiVersion)) {
        throw new Error("foundation_toolchain_lock_invalid");
      }
      for (const field of [
        "inventoryReceiptSha256",
        "inventoryWorkflowSha256",
        "containerManifestSha256",
        "toolRolesSha256",
        "headersTreeSha256",
        "candidateClosureSha256"
      ]) {
        assertSha256(value[field], "foundation_toolchain_lock_invalid");
      }
      if (value.toolRoles.length !== FOUNDATION_TOOL_ROLES.length
          || value.toolRoles.some(({ role }, index) => role !== FOUNDATION_TOOL_ROLES[index])) {
        throw new Error("foundation_toolchain_lock_role_order_invalid");
      }
      const expectedTag = `control-plane-foundation-toolchain-v2-${value.candidateClosureSha256}`;
      const expectedAsset = `foundation-toolchain-lock-v2-${value.candidateClosureSha256}.json`;
      if (value.releaseTag !== expectedTag || value.assetName !== expectedAsset) {
        throw new Error("foundation_toolchain_lock_identity_invalid");
      }
    }
  }
);

function canonicalInventoryBytes(inventory) {
  if (!inventory || inventory.schemaVersion !== "2"
      || inventory.receiptType !== "control_plane_foundation_toolchain_inventory_v2") {
    throw new Error("foundation_toolchain_inventory_v2_required");
  }
  const bytes = serializeToolchainInventoryLine(inventory).subarray(0, -1);
  parseToolchainInventoryBytes(bytes);
  return bytes;
}

export function extractCanonicalV2InventoryFromLog(logText) {
  if (typeof logText !== "string" || logText.length > 4 * 1024 * 1024) {
    throw new Error("foundation_toolchain_inventory_log_invalid");
  }
  const matches = [];
  for (const line of logText.split(/\r?\n/)) {
    const marker = line.indexOf('{"schemaVersion":"2","receiptType":"control_plane_foundation_toolchain_inventory_v2"');
    if (marker === -1) continue;
    const candidate = Buffer.from(line.slice(marker), "utf8");
    const value = parseToolchainInventoryBytes(candidate);
    const canonical = canonicalInventoryBytes(value);
    if (!candidate.equals(canonical)) {
      throw new Error("foundation_toolchain_inventory_log_noncanonical");
    }
    matches.push(Object.freeze({ value, bytes: canonical, sha256: sha256Hex(canonical) }));
  }
  if (matches.length !== 1) throw new Error("foundation_toolchain_inventory_count_invalid");
  return matches[0];
}

export function buildFoundationToolchainLock({
  inventoryRunId,
  inventoryReceiptSha256,
  inventory,
  confirmation
}) {
  if (confirmation !== FOUNDATION_TOOLCHAIN_CONFIRMATION) {
    throw new Error("foundation_toolchain_publication_confirmation_invalid");
  }
  if (typeof inventoryRunId !== "string" || !RUN_ID_PATTERN.test(inventoryRunId)) {
    throw new Error("foundation_toolchain_inventory_run_id_invalid");
  }
  assertSha256(inventoryReceiptSha256, "foundation_toolchain_inventory_receipt_digest_invalid");
  const inventoryBytes = canonicalInventoryBytes(inventory);
  if (sha256Hex(inventoryBytes) !== inventoryReceiptSha256) {
    throw new Error("foundation_toolchain_inventory_receipt_digest_mismatch");
  }
  const releaseTag = `control-plane-foundation-toolchain-v2-${inventory.candidateClosureSha256}`;
  const assetName = `foundation-toolchain-lock-v2-${inventory.candidateClosureSha256}.json`;
  const value = Object.freeze({
    schemaVersion: "1",
    assetType: "control_plane_foundation_toolchain_lock",
    sourceCommit: inventory.sourceCommit,
    inventoryRunId,
    inventoryReceiptSha256,
    inventoryWorkflowPath: inventory.workflowPath,
    inventoryWorkflowSha256: inventory.workflowSha256,
    closureKind: inventory.closureKind,
    containerImage: inventory.containerImage,
    containerManifestSha256: inventory.containerManifestSha256,
    platform: inventory.platform,
    nodeVersion: inventory.nodeVersion,
    nodeModuleAbi: inventory.nodeModuleAbi,
    nodeApiVersion: inventory.nodeApiVersion,
    toolRoles: Object.freeze(inventory.toolRoles.map((entry) => Object.freeze({ ...entry }))),
    toolRolesSha256: inventory.toolRolesSha256,
    headersTreeSha256: inventory.headersTreeSha256,
    candidateClosureSha256: inventory.candidateClosureSha256,
    releaseTag,
    assetName
  });
  const bytes = serializeFoundationToolchainLock(value);
  return Object.freeze({ value, bytes, sha256: sha256Hex(bytes), releaseTag, assetName });
}

export function serializeFoundationToolchainLock(value) {
  return serializeCanonicalJsonBytes(value, LOCK_CONTRACT);
}

export function parseFoundationToolchainLock(bytes) {
  return parseCanonicalJsonBytes(bytes, LOCK_CONTRACT);
}

function assertRunMetadata(run, { inventoryRunId, sourceCommit }) {
  if (!run || String(run.id) !== inventoryRunId
      || run.event !== "pull_request"
      || run.status !== "completed"
      || run.conclusion !== "success"
      || run.head_sha !== sourceCommit
      || run.name !== INVENTORY_WORKFLOW_NAME
      || run.path !== INVENTORY_WORKFLOW_PATH) {
    throw new Error("foundation_toolchain_inventory_run_invalid");
  }
}

function main() {
  try {
    const runnerTemp = process.env.RUNNER_TEMP;
    const githubOutput = process.env.GITHUB_OUTPUT;
    const inventoryRunId = process.env.CONTROL_PLANE_FOUNDATION_INVENTORY_RUN_ID;
    const sourceCommit = process.env.CONTROL_PLANE_FOUNDATION_SOURCE_COMMIT;
    const expectedClosureSha256 = process.env.CONTROL_PLANE_FOUNDATION_CLOSURE_SHA256;
    const confirmation = process.env.CONTROL_PLANE_FOUNDATION_CONFIRMATION;
    if (!runnerTemp || !githubOutput || !RUN_ID_PATTERN.test(inventoryRunId ?? "")
        || !SOURCE_COMMIT_PATTERN.test(sourceCommit ?? "")
        || !SHA256_PATTERN.test(expectedClosureSha256 ?? "")) {
      throw new Error("foundation_toolchain_publication_environment_invalid");
    }
    const run = JSON.parse(readFileSync(join(runnerTemp, "foundation-inventory-run.json"), "utf8"));
    assertRunMetadata(run, { inventoryRunId, sourceCommit });
    const extracted = extractCanonicalV2InventoryFromLog(
      readFileSync(join(runnerTemp, "foundation-inventory.log"), "utf8")
    );
    if (extracted.value.sourceCommit !== sourceCommit
        || extracted.value.candidateClosureSha256 !== expectedClosureSha256) {
      throw new Error("foundation_toolchain_publication_input_mismatch");
    }
    const lock = buildFoundationToolchainLock({
      inventoryRunId,
      inventoryReceiptSha256: extracted.sha256,
      inventory: extracted.value,
      confirmation
    });
    const lockPath = join(runnerTemp, "foundation-toolchain-lock.json");
    writeFileSync(lockPath, lock.bytes, { flag: "wx", mode: 0o600 });
    appendFileSync(githubOutput, [
      `lock_base64=${lock.bytes.toString("base64")}`,
      `lock_sha256=${lock.sha256}`,
      `target_commit=${lock.value.sourceCommit}`,
      `release_tag=${lock.releaseTag}`,
      `asset_name=${lock.assetName}`,
      ""
    ].join("\n"), "utf8");
    process.stdout.write(`${JSON.stringify({
      status: "validated_for_protected_publication",
      lockSha256: lock.sha256,
      candidateClosureSha256: extracted.value.candidateClosureSha256
    })}\n`);
  } catch {
    process.stderr.write("control_plane_foundation_toolchain_publication_preflight_failed\n");
    process.exitCode = 1;
  }
}

const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) main();
