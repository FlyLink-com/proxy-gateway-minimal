import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const EXPECTED_CONTROLLER_SHA256 = "533e79ac416aad41d19cc6a7f501a6c79542257d56597508ddb79a94a30b75dd";
const EXPECTED_CANONICAL_SHA256 = "a6183ec26b92debd486ee1ce43532f37f62acf77cef68a2917a5188635f0fb23";
const EXPECTED_SCANNER_SHA256 = "c3ed625964b61ff43dc91ad688e04c4459220aa4094c2b6e3d76795decf9d010";
const CONTROLLER_URL = new URL("../../scripts/control-plane-foundation-toolchain-inventory.mjs", import.meta.url);
const CANONICAL_URL = new URL("../services/deployment/canonical-json.mjs", import.meta.url);
const SCANNER_URL = new URL("../services/deployment/strict-json-scan.mjs", import.meta.url);

function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

function assertClosedInventoryController(rawSource) {
  const source = rawSource.replace(/\r\n/g, "\n");
  assert.equal(sha256Hex(source), EXPECTED_CONTROLLER_SHA256);
  assert.doesNotMatch(source, /node:(?:child_process|http|https|net|tls|dgram)/);
  assert.doesNotMatch(source, /\b(?:spawn|spawnSync|exec|execFile|fork|fetch)\s*\(/);
  assert.doesNotMatch(source, /(?:upload|publish|release|package|podman|\bdocker\s+)/i);
  assert.doesNotMatch(source, /\b(?:eval|Function)\s*\(|globalThis\s*\[|process\s*\.\s*getBuiltinModule\b/);
  assert.match(source, /process\.platform !== "linux" \|\| process\.arch !== "x64"/);
  const fsImport = source.match(/import \{([\s\S]*?)\} from "node:fs";/);
  assert.ok(fsImport);
  assert.deepEqual(
    fsImport[1].split(",").map((entry) => entry.trim()).filter(Boolean).sort(),
    ["lstatSync", "readFileSync", "readdirSync", "realpathSync"]
  );
  assert.doesNotMatch(source, /node:fs\/promises|\bimport\s*\(/);
  assert.doesNotMatch(source, /\b(?:appendFile|chmod|copyFile|mkdir|open|rename|rm|unlink|writeFile)\w*\s*\(/);
  assert.deepEqual(
    [...source.matchAll(/process\.env\.([A-Z0-9_]+)/g)].map((match) => match[1]).sort(),
    [
      "CONTROL_PLANE_FOUNDATION_CONTAINER_IMAGE",
      "CONTROL_PLANE_INVENTORY_SOURCE_COMMIT"
    ]
  );
}

const [controllerSource, canonicalSource, scannerSource] = await Promise.all([
  readFile(CONTROLLER_URL, "utf8"),
  readFile(CANONICAL_URL, "utf8"),
  readFile(SCANNER_URL, "utf8")
]);
assertClosedInventoryController(controllerSource);
assert.equal(sha256Hex(canonicalSource.replace(/\r\n/g, "\n")), EXPECTED_CANONICAL_SHA256);
assert.equal(sha256Hex(scannerSource.replace(/\r\n/g, "\n")), EXPECTED_SCANNER_SHA256);

const controllerModule = await import(CONTROLLER_URL.href);
assert.deepEqual(Object.keys(controllerModule), [
  "FOUNDATION_TOOLCHAIN_CONTAINER_IMAGE",
  "FOUNDATION_TOOLCHAIN_PLATFORM",
  "FOUNDATION_TOOL_ROLES",
  "buildToolchainInventoryEvidence",
  "collectFoundationToolchainInventory",
  "parseToolchainInventoryBytes",
  "serializeToolchainInventoryLine"
]);
const {
  buildToolchainInventoryEvidence,
  FOUNDATION_TOOLCHAIN_CONTAINER_IMAGE,
  FOUNDATION_TOOLCHAIN_PLATFORM,
  FOUNDATION_TOOL_ROLES,
  serializeToolchainInventoryLine
} = controllerModule;

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
  assertClosedInventoryController(source);

  for (const fault of [
    `${source}\nglobalThis["fetch"]("https://example.invalid");\n`,
    `${source}\neval("process.exit(0)");\n`,
    `${source}\nprocess["getBuiltinModule"]("node:child_process");\n`
  ]) {
    assert.throws(() => assertClosedInventoryController(fault));
  }
});

test("inventory builder ignores shadowed array methods and binds the actual dense role rows", () => {
  const input = evidenceInput();
  const roles = input.toolRoles.map((entry) => ({ ...entry }));
  Object.defineProperty(roles, "map", {
    value: () => Array.prototype.map.call(
      roles,
      (entry) => ({ ...entry, sha256: "a".repeat(64) })
    ),
    enumerable: false
  });
  Object.defineProperty(roles, "some", {
    value: () => false,
    enumerable: false
  });
  const evidence = buildToolchainInventoryEvidence({ ...input, toolRoles: roles });
  assert.deepEqual(
    evidence.toolRoles,
    input.toolRoles
  );
});
