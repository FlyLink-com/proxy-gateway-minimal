import assert from "node:assert/strict";
import { chmod, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { serializeCanonicalJsonBytes, sha256Hex } from "../services/deployment/canonical-json.mjs";
import {
  assertVerifiedNodeHeadersTree,
  verifyNodeHeadersTree
} from "../../scripts/control-plane-node-headers-contract.mjs";

const ENTRY_CONTRACT = Object.freeze({
  schemaId: "control_plane_reviewed_tree_entry_v1",
  maxBytes: 4096,
  fieldOrder: Object.freeze(["path", "mode", "size", "sha256"]),
  nested: Object.freeze({}),
  arrays: Object.freeze({}),
  validate() {}
});
const MANIFEST_CONTRACT = Object.freeze({
  schemaId: "control_plane_node_headers_manifest_v1",
  maxBytes: 4096,
  fieldOrder: Object.freeze(["schemaVersion", "treeId", "nodeVersion", "nodeModuleAbi", "treeSha256", "entries"]),
  nested: Object.freeze({ entry: ENTRY_CONTRACT }),
  arrays: Object.freeze({ entries: "entry" }),
  validate() {}
});

function digestEntries(entries) {
  return sha256Hex(Buffer.from(entries.map(({ path, mode, size, sha256 }) => (
    `${path}\0${mode}\0${size}\0${sha256}\n`
  )).join(""), "utf8"));
}

async function createHeadersFixture({ extraFile = false, changedBytes = false } = {}) {
  const fixtureRoot = await mkdtemp(join(tmpdir(), "control-plane-node-headers-"));
  const root = join(fixtureRoot, "headers");
  const includeDirectory = join(root, "include", "node");
  await mkdir(includeDirectory, { recursive: true });
  const header = Buffer.from(changedBytes ? "#define NAPI_VERSION 10\n" : "#define NAPI_VERSION 9\n", "utf8");
  const headerPath = join(includeDirectory, "node_api.h");
  await writeFile(headerPath, header);
  await chmod(headerPath, 0o644);
  if (extraFile) await writeFile(join(includeDirectory, "extra.h"), "extra\n");
  const entries = [{
    path: "include/node/node_api.h",
    mode: process.platform === "win32" ? "0666" : "0644",
    size: header.length,
    sha256: sha256Hex(Buffer.from("#define NAPI_VERSION 9\n", "utf8"))
  }];
  const treeSha256 = digestEntries(entries);
  const manifestPath = join(fixtureRoot, "headers-manifest.json");
  await writeFile(manifestPath, serializeCanonicalJsonBytes({
    schemaVersion: 1,
    treeId: "control-plane-node-headers-v1",
    nodeVersion: "v22.0.0",
    nodeModuleAbi: "127",
    treeSha256,
    entries
  }, MANIFEST_CONTRACT));
  return { fixtureRoot, root, manifestPath, treeSha256 };
}

async function withHeadersFixture(options, action) {
  const fixture = await createHeadersFixture(options);
  try {
    return await action(fixture);
  } finally {
    await rm(fixture.fixtureRoot, { recursive: true, force: true });
  }
}

test("verifies a canonical Node headers tree against its expected identity", async () => {
  await withHeadersFixture({}, async ({ root, manifestPath, treeSha256 }) => {
    const verified = verifyNodeHeadersTree({
      directory: root,
      manifestPath,
      expectedSha256: treeSha256,
      nodeVersion: "v22.0.0",
      nodeModuleAbi: "127"
    });
    assert.equal(verified.treeSha256, treeSha256);
    assert.equal(verified.entries.length, 1);
    assert.equal(assertVerifiedNodeHeadersTree(verified), verified);
  });
});

test("rejects an unlisted headers file", async () => {
  await withHeadersFixture({ extraFile: true }, async ({ root, manifestPath, treeSha256 }) => {
    assert.throws(() => verifyNodeHeadersTree({
      directory: root,
      manifestPath,
      expectedSha256: treeSha256,
      nodeVersion: "v22.0.0",
      nodeModuleAbi: "127"
    }), /node_headers_tree_entry_set_mismatch/);
  });
});

test("rejects a headers tree whose contents drift after manifest review", async () => {
  await withHeadersFixture({ changedBytes: true }, async ({ root, manifestPath, treeSha256 }) => {
    assert.throws(() => verifyNodeHeadersTree({
      directory: root,
      manifestPath,
      expectedSha256: treeSha256,
      nodeVersion: "v22.0.0",
      nodeModuleAbi: "127"
    }), /node_headers_tree_digest_mismatch/);
  });
});
