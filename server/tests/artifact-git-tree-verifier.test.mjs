import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import * as treeVerifier from "../../scripts/artifact-git-tree-verifier.mjs";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const VERIFIER_PATH = resolve(REPOSITORY_ROOT, "scripts/artifact-git-tree-verifier.mjs");

test("artifact Git-tree verifier is a repository-owned executable module", () => {
  assert.equal(existsSync(VERIFIER_PATH), true);
});

function git(cwd, args, options = {}) {
  return execFileSync("git", args, {
    cwd,
    encoding: options.encoding ?? "utf8",
    input: options.input,
    env: {
      ...process.env,
      GIT_AUTHOR_DATE: "2026-07-16T20:00:00Z",
      GIT_COMMITTER_DATE: "2026-07-16T20:00:00Z"
    }
  }).trim();
}

function createRepository(t) {
  const directory = mkdtempSync(join(tmpdir(), "gccgw-artifact-tree-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  git(directory, ["init", "-q"]);
  git(directory, ["config", "user.email", "tests@example.invalid"]);
  git(directory, ["config", "user.name", "Artifact Tree Tests"]);
  mkdirSync(join(directory, "nested"));
  writeFileSync(join(directory, "alpha.txt"), "alpha\n");
  writeFileSync(join(directory, "nested", "script.sh"), "#!/bin/sh\necho safe\n");
  chmodSync(join(directory, "nested", "script.sh"), 0o755);
  git(directory, ["add", "."]);
  git(directory, ["update-index", "--chmod=+x", "nested/script.sh"]);
  git(directory, ["commit", "-qm", "base tree"]);
  const commit = git(directory, ["rev-parse", "HEAD"]);
  const artifactPath = join(directory, "approved.zip");
  writeFileSync(artifactPath, storedZip([
    { name: "alpha.txt", data: "alpha\n", mode: 0o100644 },
    { name: "nested/", mode: 0o040755 },
    { name: "nested/script.sh", data: "#!/bin/sh\necho safe\n", mode: 0o100755 }
  ], commit));
  return { artifactPath, commit, directory };
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function storedZip(entries, sourceCommit = "") {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const data = Buffer.from(entry.data ?? "");
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    localParts.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE((3 << 8) | 20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(((entry.mode ?? 0o100644) << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + data.length;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  const comment = Buffer.from(sourceCommit, "utf8");
  end.writeUInt16LE(comment.length, 20);
  return Buffer.concat([...localParts, centralDirectory, end, comment]);
}

test("verifies archive paths, modes, and blob bytes against the trusted Git tree", (t) => {
  assert.equal(typeof treeVerifier.verifyArtifactGitTree, "function");
  const fixture = createRepository(t);
  assert.deepEqual(treeVerifier.verifyArtifactGitTree({
    artifactPath: fixture.artifactPath,
    repositoryPath: fixture.directory,
    expectedCommit: fixture.commit
  }), {
    ok: true,
    type: "artifact_git_tree_identity",
    fileCount: 2
  });
});

test("rejects content, file-set, mode, link, duplicate, and traversal drift", (t) => {
  assert.equal(typeof treeVerifier.verifyArtifactGitTree, "function");
  const fixture = createRepository(t);
  const variants = [];

  writeFileSync(join(fixture.directory, "alpha.txt"), "tampered\n");
  git(fixture.directory, ["add", "alpha.txt"]);
  git(fixture.directory, ["commit", "-qm", "content drift"]);
  variants.push(["content.zip", git(fixture.directory, ["rev-parse", "HEAD"])]);

  writeFileSync(join(fixture.directory, "extra.txt"), "extra\n");
  git(fixture.directory, ["add", "extra.txt"]);
  git(fixture.directory, ["commit", "-qm", "extra file"]);
  variants.push(["extra.zip", git(fixture.directory, ["rev-parse", "HEAD"])]);

  unlinkSync(join(fixture.directory, "alpha.txt"));
  git(fixture.directory, ["add", "-u", "--", "alpha.txt"]);
  git(fixture.directory, ["commit", "-qm", "missing file"]);
  variants.push(["missing.zip", git(fixture.directory, ["rev-parse", "HEAD"])]);

  git(fixture.directory, ["update-index", "--chmod=-x", "nested/script.sh"]);
  git(fixture.directory, ["commit", "-qm", "mode drift"]);
  variants.push(["mode.zip", git(fixture.directory, ["rev-parse", "HEAD"])]);

  const linkBlob = git(fixture.directory, ["hash-object", "-w", "--stdin"], { input: "alpha.txt" });
  git(fixture.directory, ["update-index", "--add", "--cacheinfo", `120000,${linkBlob},link`]);
  git(fixture.directory, ["commit", "-qm", "link entry"]);
  variants.push(["link.zip", git(fixture.directory, ["rev-parse", "HEAD"])]);

  for (const [name, commit] of variants) {
    const artifactPath = join(fixture.directory, name);
    git(fixture.directory, ["archive", "--format=zip", `--output=${artifactPath}`, commit]);
    assert.throws(
      () => treeVerifier.verifyArtifactGitTree({
        artifactPath,
        repositoryPath: fixture.directory,
        expectedCommit: fixture.commit
      }),
      (error) => error.code === "artifact_source_tree_mismatch"
    );
  }

  for (const [name, entries] of [
    ["duplicate.zip", [
      { name: "alpha.txt", data: "alpha\n" },
      { name: "alpha.txt", data: "alpha\n" }
    ]],
    ["traversal.zip", [{ name: "../alpha.txt", data: "alpha\n" }]]
  ]) {
    const artifactPath = join(fixture.directory, name);
    writeFileSync(artifactPath, storedZip(entries));
    assert.throws(
      () => treeVerifier.verifyArtifactGitTree({
        artifactPath,
        repositoryPath: fixture.directory,
        expectedCommit: fixture.commit
      }),
      (error) => error.code === "artifact_source_tree_mismatch"
    );
  }
});

test("CLI failure is fixed and does not echo repository or archive paths", (t) => {
  assert.equal(typeof treeVerifier.runArtifactGitTreeVerifierCli, "function");
  const fixture = createRepository(t);
  writeFileSync(fixture.artifactPath, storedZip([{ name: "../protected", data: "x" }]));
  let stdout = "";
  let stderr = "";
  const exitCode = treeVerifier.runArtifactGitTreeVerifierCli({
    argv: [
      "--repository", fixture.directory,
      "--commit", fixture.commit,
      "--artifact", fixture.artifactPath
    ],
    stdout: { write: (value) => { stdout += value; } },
    stderr: { write: (value) => { stderr += value; } }
  });
  assert.equal(exitCode, 1);
  assert.equal(stdout, "");
  assert.equal(JSON.parse(stderr).error, "artifact_source_tree_mismatch");
  assert.equal(stderr.includes(fixture.directory), false);
  assert.equal(stderr.includes(fixture.artifactPath), false);
  assert.equal(readFileSync(fixture.artifactPath).length > 0, true);
});
