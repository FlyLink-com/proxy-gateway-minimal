import { lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

import { parseCanonicalJsonBytes, sha256Hex } from "../server/services/deployment/canonical-json.mjs";

const ENTRY_PATH_PATTERN = /^(?:[a-z0-9][a-z0-9._-]*\/)*[a-z0-9][a-z0-9._-]*$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const BRAND = new WeakSet();

function frozenContract(schemaId, fieldOrder, { nested = {}, arrays = {}, validate = () => {} } = {}) {
  return Object.freeze({
    schemaId,
    maxBytes: 512 * 1024,
    fieldOrder: Object.freeze([...fieldOrder]),
    nested: Object.freeze({ ...nested }),
    arrays: Object.freeze({ ...arrays }),
    validate
  });
}

function assertDigest(value, code) {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) throw new Error(code);
}

const TREE_ENTRY_CONTRACT = frozenContract(
  "control_plane_reviewed_tree_entry_v1",
  ["path", "mode", "size", "sha256"],
  {
    validate(value) {
      if (typeof value.path !== "string" || !ENTRY_PATH_PATTERN.test(value.path)
          || value.path.includes("..")
          || typeof value.mode !== "string" || !/^0[0-7]{3}$/.test(value.mode)
          || !Number.isSafeInteger(value.size) || value.size < 0) {
        throw new Error("reviewed_tree_entry_invalid");
      }
      assertDigest(value.sha256, "reviewed_tree_entry_invalid");
    }
  }
);

const NODE_HEADERS_MANIFEST_CONTRACT = frozenContract(
  "control_plane_node_headers_manifest_v1",
  ["schemaVersion", "treeId", "nodeVersion", "nodeModuleAbi", "treeSha256", "entries"],
  {
    nested: { entry: TREE_ENTRY_CONTRACT },
    arrays: { entries: "entry" },
    validate(value) {
      if (value.schemaVersion !== 1
          || value.treeId !== "control-plane-node-headers-v1"
          || typeof value.nodeVersion !== "string" || !/^v\d+\.\d+\.\d+$/.test(value.nodeVersion)
          || typeof value.nodeModuleAbi !== "string" || !/^\d+$/.test(value.nodeModuleAbi)
          || value.entries.length === 0) {
        throw new Error("node_headers_manifest_invalid");
      }
      assertDigest(value.treeSha256, "node_headers_manifest_invalid");
    }
  }
);

function assertDirectory(path, code) {
  const metadata = lstatSync(path);
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) throw new Error(code);
}

function assertRegularFile(path, code) {
  const metadata = lstatSync(path);
  if (metadata.isSymbolicLink() || !metadata.isFile()) throw new Error(code);
  return metadata;
}

function relativeEntries(root, directory = root) {
  const entries = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = join(directory, entry.name);
    const relativePath = relative(root, entryPath).split(sep).join("/");
    if (entry.isSymbolicLink()) throw new Error("reviewed_tree_symlink_forbidden");
    if (entry.isDirectory()) {
      entries.push(...relativeEntries(root, entryPath));
      continue;
    }
    if (!entry.isFile()) throw new Error("reviewed_tree_entry_type_invalid");
    entries.push(relativePath);
  }
  return entries.sort();
}

function canonicalTreeDigest(entries) {
  return sha256Hex(Buffer.from(entries.map(({ path, mode, size, sha256 }) => (
    `${path}\0${mode}\0${size}\0${sha256}\n`
  )).join(""), "utf8"));
}

export function verifyNodeHeadersTree({ directory, manifestPath, expectedSha256, nodeVersion, nodeModuleAbi }) {
  if (typeof directory !== "string" || typeof manifestPath !== "string") {
    throw new Error("node_headers_input_invalid");
  }
  assertDigest(expectedSha256, "node_headers_expected_digest_invalid");
  if (typeof nodeVersion !== "string" || typeof nodeModuleAbi !== "string") {
    throw new Error("node_headers_runtime_identity_invalid");
  }

  assertDirectory(directory, "node_headers_directory_invalid");
  assertRegularFile(manifestPath, "node_headers_manifest_invalid");
  const root = realpathSync(directory);
  const resolvedManifestPath = realpathSync(manifestPath);
  const manifestRelativeToRoot = relative(root, resolvedManifestPath);
  if (manifestRelativeToRoot === "" || (!manifestRelativeToRoot.startsWith(`..${sep}`) && manifestRelativeToRoot !== "..")) {
    throw new Error("node_headers_manifest_location_invalid");
  }
  const manifest = parseCanonicalJsonBytes(
    readFileSync(resolvedManifestPath),
    NODE_HEADERS_MANIFEST_CONTRACT
  );
  if (manifest.nodeVersion !== nodeVersion || manifest.nodeModuleAbi !== nodeModuleAbi) {
    throw new Error("node_headers_runtime_identity_mismatch");
  }
  if (manifest.treeSha256 !== expectedSha256) {
    throw new Error("node_headers_expected_digest_mismatch");
  }

  const manifestPaths = manifest.entries.map(({ path }) => path);
  if (new Set(manifestPaths).size !== manifestPaths.length
      || manifestPaths.some((path, index) => index > 0 && path <= manifestPaths[index - 1])) {
    throw new Error("node_headers_manifest_entry_order_invalid");
  }
  const discoveredPaths = relativeEntries(root);
  if (discoveredPaths.length !== manifestPaths.length
      || discoveredPaths.some((path, index) => path !== manifestPaths[index])) {
    throw new Error("node_headers_tree_entry_set_mismatch");
  }

  const verifiedEntries = manifest.entries.map((entry) => {
    const path = resolve(root, entry.path);
    const relativePath = relative(root, path);
    if (relativePath === "" || relativePath === ".." || relativePath.startsWith(`..${sep}`)) {
      throw new Error("node_headers_entry_path_invalid");
    }
    const metadata = assertRegularFile(path, "node_headers_entry_invalid");
    const mode = `0${(metadata.mode & 0o777).toString(8).padStart(3, "0")}`;
    if (mode !== entry.mode || metadata.size !== entry.size || sha256Hex(readFileSync(path)) !== entry.sha256) {
      throw new Error("node_headers_tree_digest_mismatch");
    }
    return Object.freeze({ ...entry });
  });
  const treeSha256 = canonicalTreeDigest(verifiedEntries);
  if (treeSha256 !== expectedSha256) throw new Error("node_headers_tree_digest_mismatch");

  const result = Object.freeze({
    directory: root,
    treeSha256,
    nodeVersion: manifest.nodeVersion,
    nodeModuleAbi: manifest.nodeModuleAbi,
    entries: Object.freeze(verifiedEntries)
  });
  BRAND.add(result);
  return result;
}

export function assertVerifiedNodeHeadersTree(value) {
  if (!BRAND.has(value)) throw new Error("verified_node_headers_brand_invalid");
  return value;
}
