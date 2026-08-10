import {
  lstatSync,
  readdirSync,
  readFileSync,
  realpathSync
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  parseCanonicalJsonBytes,
  serializeCanonicalJsonBytes,
  sha256Hex
} from "../server/services/deployment/canonical-json.mjs";

const WORKFLOW_PATH = ".github/workflows/control-plane-foundation-toolchain-inventory.yml";
const SOURCE_COMMIT_PATTERN = /^[a-f0-9]{40}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export const FOUNDATION_TOOL_ROLES = Object.freeze([
  "CC",
  "CXX",
  "AR",
  "LD",
  "PYTHON",
  "MAKE"
]);

export const FOUNDATION_TOOLCHAIN_CONTAINER_IMAGE =
  "docker.io/library/node:22.23.1-bookworm@sha256:175215a1f306ed5df592434b99cc2019f70624373fe49cb659240a618a846aed";
export const FOUNDATION_TOOLCHAIN_PLATFORM = "linux/amd64";
const FOUNDATION_TOOLCHAIN_CONTAINER_MANIFEST_SHA256 =
  FOUNDATION_TOOLCHAIN_CONTAINER_IMAGE.slice(FOUNDATION_TOOLCHAIN_CONTAINER_IMAGE.indexOf("@sha256:") + 8);

const FIXED_TOOL_PATHS = Object.freeze({
  CC: "/usr/bin/x86_64-linux-gnu-gcc-12",
  CXX: "/usr/bin/x86_64-linux-gnu-g++-12",
  AR: "/usr/bin/x86_64-linux-gnu-ar",
  LD: "/usr/bin/x86_64-linux-gnu-ld.bfd",
  PYTHON: "/usr/bin/python3.11",
  MAKE: "/usr/bin/make"
});

function frozenContract(schemaId, fieldOrder, { nested = {}, arrays = {}, validate = () => {} } = {}) {
  return Object.freeze({
    schemaId,
    maxBytes: 16 * 1024,
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
  "control_plane_foundation_toolchain_inventory_role_v1",
  ["role", "sha256"],
  {
    validate(value) {
      if (!FOUNDATION_TOOL_ROLES.includes(value.role)) {
        throw new Error("foundation_toolchain_inventory_role_invalid");
      }
      assertSha256(value.sha256, "foundation_toolchain_inventory_role_invalid");
    }
  }
);

const INVENTORY_CONTRACT = frozenContract(
  "control_plane_foundation_toolchain_inventory_v2",
  [
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
  ],
  {
    nested: { role: TOOL_ROLE_CONTRACT },
    arrays: { toolRoles: "role" },
    validate(value) {
      if (value.schemaVersion !== "2"
          || value.receiptType !== "control_plane_foundation_toolchain_inventory_v2"
          || value.authority !== "inventory_only"
          || value.eligible !== false
          || !SOURCE_COMMIT_PATTERN.test(value.sourceCommit)
          || value.workflowPath !== WORKFLOW_PATH
          || value.closureKind !== "oci_platform_manifest"
          || value.containerImage !== FOUNDATION_TOOLCHAIN_CONTAINER_IMAGE
          || value.containerManifestSha256 !== FOUNDATION_TOOLCHAIN_CONTAINER_MANIFEST_SHA256
          || value.platform !== FOUNDATION_TOOLCHAIN_PLATFORM
          || typeof value.nodeVersion !== "string" || !/^v\d+\.\d+\.\d+$/.test(value.nodeVersion)
          || typeof value.nodeModuleAbi !== "string" || !/^\d+$/.test(value.nodeModuleAbi)
          || typeof value.nodeApiVersion !== "string" || !/^\d+$/.test(value.nodeApiVersion)) {
        throw new Error("foundation_toolchain_inventory_invalid");
      }
      for (const field of [
        "workflowSha256",
        "toolRolesSha256",
        "headersTreeSha256",
        "candidateClosureSha256"
      ]) {
        assertSha256(value[field], "foundation_toolchain_inventory_invalid");
      }
      if (value.toolRoles.length !== FOUNDATION_TOOL_ROLES.length
          || value.toolRoles.some(({ role }, index) => role !== FOUNDATION_TOOL_ROLES[index])) {
        throw new Error("foundation_toolchain_inventory_role_order_invalid");
      }
    }
  }
);

function assertRegularNoSymlink(path, code) {
  const metadata = lstatSync(path);
  if (metadata.isSymbolicLink() || !metadata.isFile() || realpathSync(path) !== resolve(path)) {
    throw new Error(code);
  }
  return metadata;
}

function assertDirectoryNoSymlink(path, code) {
  const metadata = lstatSync(path);
  if (metadata.isSymbolicLink() || !metadata.isDirectory() || realpathSync(path) !== resolve(path)) {
    throw new Error(code);
  }
}

function collectTreeEntries(root, directory = root) {
  const entries = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    const relativePath = relative(root, path).split(sep).join("/");
    if (entry.isSymbolicLink()) throw new Error("foundation_toolchain_inventory_symlink_forbidden");
    if (entry.isDirectory()) {
      if (realpathSync(path) !== resolve(path)) {
        throw new Error("foundation_toolchain_inventory_symlink_forbidden");
      }
      entries.push(...collectTreeEntries(root, path));
      continue;
    }
    if (!entry.isFile()) throw new Error("foundation_toolchain_inventory_entry_type_invalid");
    const metadata = assertRegularNoSymlink(path, "foundation_toolchain_inventory_entry_invalid");
    entries.push(Object.freeze({
      path: relativePath,
      mode: `0${(metadata.mode & 0o777).toString(8).padStart(3, "0")}`,
      size: metadata.size,
      sha256: sha256Hex(readFileSync(path))
    }));
  }
  return entries.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
}

function digestTreeEntries(entries) {
  return sha256Hex(Buffer.from(entries.map(({ path, mode, size, sha256 }) => (
    `${path}\0${mode}\0${size}\0${sha256}\n`
  )).join(""), "utf8"));
}

function digestToolRoles(toolRoles) {
  return sha256Hex(Buffer.from(toolRoles.map(({ role, sha256 }) => (
    `${role}\0${sha256}\n`
  )).join(""), "utf8"));
}

export function buildToolchainInventoryEvidence({
  sourceCommit,
  workflowSha256,
  containerImage,
  nodeVersion,
  nodeModuleAbi,
  nodeApiVersion,
  toolRoles,
  headersTreeSha256
}) {
  if (containerImage !== FOUNDATION_TOOLCHAIN_CONTAINER_IMAGE) {
    throw new Error("foundation_toolchain_inventory_container_invalid");
  }
  if (!Array.isArray(toolRoles)
      || toolRoles.length !== FOUNDATION_TOOL_ROLES.length
      || toolRoles.some(({ role }, index) => role !== FOUNDATION_TOOL_ROLES[index])) {
    throw new Error("foundation_toolchain_inventory_role_order_invalid");
  }
  for (const { sha256 } of toolRoles) assertSha256(sha256, "foundation_toolchain_inventory_role_invalid");
  if (new Set(toolRoles.map(({ sha256 }) => sha256)).size !== toolRoles.length) {
    throw new Error("foundation_toolchain_inventory_duplicate_tool_bytes");
  }
  assertSha256(headersTreeSha256, "foundation_toolchain_inventory_headers_digest_invalid");
  assertSha256(workflowSha256, "foundation_toolchain_inventory_workflow_digest_invalid");
  if (typeof sourceCommit !== "string" || !SOURCE_COMMIT_PATTERN.test(sourceCommit)) {
    throw new Error("foundation_toolchain_inventory_source_commit_invalid");
  }
  const toolRolesSha256 = digestToolRoles(toolRoles);
  const candidateClosureSha256 = sha256Hex(Buffer.from([
    "control-plane-foundation-toolchain-closure-v2",
    FOUNDATION_TOOLCHAIN_CONTAINER_MANIFEST_SHA256,
    FOUNDATION_TOOLCHAIN_PLATFORM,
    nodeVersion,
    nodeModuleAbi,
    nodeApiVersion,
    headersTreeSha256,
    toolRolesSha256
  ].join("\0"), "utf8"));
  return Object.freeze({
    schemaVersion: "2",
    receiptType: "control_plane_foundation_toolchain_inventory_v2",
    authority: "inventory_only",
    eligible: false,
    sourceCommit,
    workflowPath: WORKFLOW_PATH,
    workflowSha256,
    closureKind: "oci_platform_manifest",
    containerImage: FOUNDATION_TOOLCHAIN_CONTAINER_IMAGE,
    containerManifestSha256: FOUNDATION_TOOLCHAIN_CONTAINER_MANIFEST_SHA256,
    platform: FOUNDATION_TOOLCHAIN_PLATFORM,
    nodeVersion,
    nodeModuleAbi,
    nodeApiVersion,
    toolRoles: Object.freeze(toolRoles.map((entry) => Object.freeze({ ...entry }))),
    toolRolesSha256,
    headersTreeSha256,
    candidateClosureSha256
  });
}

export function serializeToolchainInventoryLine(evidence) {
  return Buffer.concat([
    serializeCanonicalJsonBytes(evidence, INVENTORY_CONTRACT),
    Buffer.from("\n", "utf8")
  ]);
}

export function parseToolchainInventoryBytes(bytes) {
  return parseCanonicalJsonBytes(bytes, INVENTORY_CONTRACT);
}

export function collectFoundationToolchainInventory({ sourceCommit }) {
  if (process.platform !== "linux") throw new Error("foundation_toolchain_inventory_linux_required");
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const workflowFile = join(repositoryRoot, WORKFLOW_PATH);
  assertRegularNoSymlink(workflowFile, "foundation_toolchain_inventory_workflow_invalid");

  const runtimeRoot = resolve(dirname(process.execPath), "..");
  const headersRoot = join(runtimeRoot, "include", "node");
  assertDirectoryNoSymlink(headersRoot, "foundation_toolchain_inventory_headers_root_invalid");
  const headerEntries = collectTreeEntries(headersRoot);
  if (headerEntries.length === 0) throw new Error("foundation_toolchain_inventory_headers_empty");

  const toolRoles = FOUNDATION_TOOL_ROLES.map((role) => {
    const path = FIXED_TOOL_PATHS[role];
    assertRegularNoSymlink(path, "foundation_toolchain_inventory_tool_invalid");
    return Object.freeze({ role, sha256: sha256Hex(readFileSync(path)) });
  });
  if (new Set(toolRoles.map(({ sha256 }) => sha256)).size !== toolRoles.length) {
    throw new Error("foundation_toolchain_inventory_duplicate_tool_bytes");
  }

  return buildToolchainInventoryEvidence({
    sourceCommit,
    workflowSha256: sha256Hex(readFileSync(workflowFile)),
    containerImage: process.env.CONTROL_PLANE_FOUNDATION_CONTAINER_IMAGE,
    nodeVersion: process.version,
    nodeModuleAbi: process.versions.modules,
    nodeApiVersion: process.versions.napi,
    toolRoles,
    headersTreeSha256: digestTreeEntries(headerEntries)
  });
}

async function main() {
  try {
    const evidence = collectFoundationToolchainInventory({
      sourceCommit: process.env.CONTROL_PLANE_INVENTORY_SOURCE_COMMIT
    });
    process.stdout.write(serializeToolchainInventoryLine(evidence));
  } catch {
    process.stderr.write("control_plane_foundation_toolchain_inventory_failed\n");
    process.exitCode = 1;
  }
}

const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) await main();
