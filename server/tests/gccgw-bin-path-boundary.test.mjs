import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const nodeCommand = "node";

test("gccgw refuses JSON input paths outside the repository", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "gccgw-path-boundary-"));
  const inputPath = join(tempDir, "safe-node-facts.json");
  writeFileSync(inputPath, JSON.stringify({
    id: "prod-edge-outside",
    endpointRef: "runtime:PROD_EDGE_OUTSIDE_HOST",
    portRef: "runtime:PROD_EDGE_OUTSIDE_PORT"
  }));

  try {
    const result = spawnSync(nodeCommand, [
      "bin/gccgw.mjs",
      "node",
      "register",
      "--dry-run",
      inputPath,
      "--json"
    ], {
      cwd: repoRoot,
      encoding: "utf8"
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /JSON input path must be inside the repository/);
    assert.equal(result.stdout, "");
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("gccgw accepts JSON input paths inside the repository", () => {
  const stdout = execFileSync(nodeCommand, [
    "bin/gccgw.mjs",
    "node",
    "inspect",
    "--config",
    "config/proxy-servers.json",
    "--json"
  ], {
    cwd: repoRoot,
    encoding: "utf8"
  });

  const report = JSON.parse(stdout);
  assert.equal(report.type, "gccgw_node_inspect");
  assert.equal(report.configPath, "config/proxy-servers.json");
  assert.equal(report.mutation, false);
});
