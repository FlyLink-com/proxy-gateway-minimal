import assert from "node:assert/strict";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  runStaticArtifactTreeVerifierCli,
  verifyStaticArtifactTree
} from "../../scripts/static-artifact-tree-verifier.mjs";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const VERIFIER_PATH = resolve(REPOSITORY_ROOT, "scripts/static-artifact-tree-verifier.mjs");
const FAILURE = `${JSON.stringify({ ok: false, error: "static_artifact_tree_mismatch" })}\n`;

function createTreePair(t) {
  const root = mkdtempSync(join(tmpdir(), "gccgw-static-tree-"));
  const expected = join(root, "expected-private-path");
  const actual = join(root, "actual-private-path");
  mkdirSync(expected);
  mkdirSync(actual);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return { actual, expected, root };
}

function writeTree(root) {
  mkdirSync(join(root, "assets"));
  mkdirSync(join(root, "empty"));
  writeFileSync(join(root, "index.html"), "<!doctype html>\n");
  writeFileSync(join(root, "assets", "app.bin"), Buffer.from([0, 255, 1, 254]));
  writeFileSync(join(root, "assets", "launch.sh"), "#!/bin/sh\nexit 0\n");
  writeFileSync(join(root, "permissions.txt"), "same bytes\n");
  if (process.platform !== "win32") {
    chmodSync(join(root, "assets", "launch.sh"), 0o755);
  }
}

function assertMismatch(callback, hiddenPaths = []) {
  assert.throws(callback, (error) => {
    assert.equal(error.code, "static_artifact_tree_mismatch");
    assert.equal(error.message, "static_artifact_tree_mismatch");
    for (const hiddenPath of hiddenPaths) {
      assert.equal(error.message.includes(hiddenPath), false);
    }
    return true;
  });
}

test("static artifact tree verifier accepts identical relative trees and file bytes", (t) => {
  const fixture = createTreePair(t);

  assert.deepEqual(verifyStaticArtifactTree({
    expectedDirectory: fixture.expected,
    actualDirectory: fixture.actual
  }), {
    ok: true,
    type: "static_artifact_tree_identity",
    fileCount: 0
  });

  writeTree(fixture.expected);
  writeTree(fixture.actual);
  if (process.platform !== "win32") {
    chmodSync(join(fixture.expected, "permissions.txt"), 0o600);
    chmodSync(join(fixture.actual, "permissions.txt"), 0o644);
  }

  assert.deepEqual(verifyStaticArtifactTree({
    expectedDirectory: fixture.expected,
    actualDirectory: fixture.actual
  }), {
    ok: true,
    type: "static_artifact_tree_identity",
    fileCount: 4
  });
});

test("static artifact tree verifier rejects relative path and byte drift", (t) => {
  const fixture = createTreePair(t);
  writeTree(fixture.expected);
  writeTree(fixture.actual);

  writeFileSync(join(fixture.actual, "assets", "app.bin"), Buffer.from([0, 254, 1, 255]));
  assertMismatch(
    () => verifyStaticArtifactTree({
      expectedDirectory: fixture.expected,
      actualDirectory: fixture.actual
    }),
    [fixture.expected, fixture.actual]
  );

  writeFileSync(join(fixture.actual, "assets", "app.bin"), Buffer.from([0, 255, 1, 254]));
  writeFileSync(join(fixture.actual, "unexpected-private-name.txt"), "extra\n");
  assertMismatch(
    () => verifyStaticArtifactTree({
      expectedDirectory: fixture.expected,
      actualDirectory: fixture.actual
    }),
    ["unexpected-private-name.txt", fixture.expected, fixture.actual]
  );

  unlinkSync(join(fixture.actual, "unexpected-private-name.txt"));
  unlinkSync(join(fixture.actual, "index.html"));
  assertMismatch(() => verifyStaticArtifactTree({
    expectedDirectory: fixture.expected,
    actualDirectory: fixture.actual
  }));

  mkdirSync(join(fixture.actual, "index.html"));
  assertMismatch(() => verifyStaticArtifactTree({
    expectedDirectory: fixture.expected,
    actualDirectory: fixture.actual
  }));
});

test("static artifact tree verifier compares executable intent on POSIX", {
  skip: process.platform === "win32"
}, (t) => {
  const fixture = createTreePair(t);
  writeTree(fixture.expected);
  writeTree(fixture.actual);
  chmodSync(join(fixture.actual, "assets", "launch.sh"), 0o644);

  assertMismatch(() => verifyStaticArtifactTree({
    expectedDirectory: fixture.expected,
    actualDirectory: fixture.actual
  }));
});

test("static artifact tree verifier rejects symlinks and symlink roots", {
  skip: process.platform === "win32"
}, (t) => {
  const fixture = createTreePair(t);
  writeTree(fixture.expected);
  writeTree(fixture.actual);
  symlinkSync("index.html", join(fixture.expected, "alias.html"));

  assertMismatch(() => verifyStaticArtifactTree({
    expectedDirectory: fixture.expected,
    actualDirectory: fixture.actual
  }));

  unlinkSync(join(fixture.expected, "alias.html"));
  symlinkSync("index.html", join(fixture.actual, "alias.html"));
  assertMismatch(() => verifyStaticArtifactTree({
    expectedDirectory: fixture.expected,
    actualDirectory: fixture.actual
  }));

  const expectedLink = join(fixture.root, "expected-root-link");
  const actualLink = join(fixture.root, "actual-root-link");
  symlinkSync(fixture.expected, expectedLink, "dir");
  symlinkSync(fixture.actual, actualLink, "dir");
  assertMismatch(() => verifyStaticArtifactTree({
    expectedDirectory: expectedLink,
    actualDirectory: fixture.actual
  }));
  assertMismatch(() => verifyStaticArtifactTree({
    expectedDirectory: fixture.expected,
    actualDirectory: actualLink
  }));
});

test("static artifact tree verifier rejects special filesystem entries", {
  skip: process.platform === "win32"
}, (t) => {
  const fixture = createTreePair(t);
  execFileSync("mkfifo", [join(fixture.expected, "private.pipe")]);

  assertMismatch(() => verifyStaticArtifactTree({
    expectedDirectory: fixture.expected,
    actualDirectory: fixture.actual
  }), ["private.pipe"]);

  unlinkSync(join(fixture.expected, "private.pipe"));
  execFileSync("mkfifo", [join(fixture.actual, "private.pipe")]);
  assertMismatch(() => verifyStaticArtifactTree({
    expectedDirectory: fixture.expected,
    actualDirectory: fixture.actual
  }), ["private.pipe"]);
});

test("static artifact tree verifier requires two existing physical directories", (t) => {
  const fixture = createTreePair(t);
  const regularFile = join(fixture.root, "regular-file");
  writeFileSync(regularFile, "not a directory\n");

  for (const expectedDirectory of [
    join(fixture.root, "missing-private-directory"),
    regularFile
  ]) {
    assertMismatch(() => verifyStaticArtifactTree({
      expectedDirectory,
      actualDirectory: fixture.actual
    }), [expectedDirectory]);
    assertMismatch(() => verifyStaticArtifactTree({
      expectedDirectory: fixture.expected,
      actualDirectory: expectedDirectory
    }), [expectedDirectory]);
  }
});

test("static artifact tree verifier CLI emits only bounded success JSON", (t) => {
  const fixture = createTreePair(t);
  writeTree(fixture.expected);
  writeTree(fixture.actual);

  const result = spawnSync(process.execPath, [
    VERIFIER_PATH,
    "--expected", fixture.expected,
    "--actual", fixture.actual
  ], { encoding: "utf8" });

  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
  const expectedResult = {
    ok: true,
    type: "static_artifact_tree_identity",
    fileCount: 4
  };
  assert.equal(result.stdout, `${JSON.stringify(expectedResult)}\n`);
  assert.equal(result.stdout.includes(fixture.expected), false);
  assert.equal(result.stdout.includes(fixture.actual), false);
});

test("static artifact tree verifier CLI failures are fixed and path-free", (t) => {
  const fixture = createTreePair(t);
  writeTree(fixture.expected);
  writeTree(fixture.actual);
  writeFileSync(join(fixture.actual, "private-drift.txt"), "drift\n");

  let stdout = "";
  let stderr = "";
  const exitCode = runStaticArtifactTreeVerifierCli({
    argv: ["--expected", fixture.expected, "--actual", fixture.actual],
    stdout: { write: (value) => { stdout += value; } },
    stderr: { write: (value) => { stderr += value; } }
  });
  assert.equal(exitCode, 1);
  assert.equal(stdout, "");
  assert.equal(stderr, FAILURE);
  assert.equal(stderr.includes("private-drift.txt"), false);
  assert.equal(stderr.includes(fixture.expected), false);
  assert.equal(stderr.includes(fixture.actual), false);

  const malformed = spawnSync(process.execPath, [
    VERIFIER_PATH,
    "--expected", fixture.expected,
    "--actual", fixture.actual,
    "--unexpected", "private-value"
  ], { encoding: "utf8" });
  assert.equal(malformed.status, 1);
  assert.equal(malformed.stdout, "");
  assert.equal(malformed.stderr, FAILURE);
  assert.equal(malformed.stderr.includes(fixture.expected), false);
});
