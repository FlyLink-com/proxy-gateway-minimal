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
  git(directory, ["config", "core.autocrlf", "false"]);
  mkdirSync(join(directory, "nested"));
  mkdirSync(join(directory, "config"));
  writeFileSync(join(directory, "alpha.txt"), "alpha\n");
  writeFileSync(join(directory, ".env.example"), "safe-example-environment\n");
  writeFileSync(join(directory, "config", "proxy-servers.json"), "protected-config\n");
  writeFileSync(join(directory, "nested", "script.sh"), "#!/bin/sh\necho safe\n");
  chmodSync(join(directory, "nested", "script.sh"), 0o755);
  git(directory, ["add", "."]);
  git(directory, ["update-index", "--chmod=+x", "nested/script.sh"]);
  git(directory, ["commit", "-qm", "base tree"]);
  const commit = git(directory, ["rev-parse", "HEAD"]);
  const artifactPath = join(directory, "approved.zip");
  writeFileSync(artifactPath, storedZip([
    { name: "alpha.txt", data: "alpha\n", mode: 0o100644 },
    { name: ".env.example", data: "safe-example-environment\n", mode: 0o100644 },
    { name: "config/", mode: 0o040755 },
    { name: "config/proxy-servers.json", data: "protected-config\n", mode: 0o100644 },
    { name: "nested/", mode: 0o040755 },
    { name: "nested/script.sh", data: "#!/bin/sh\necho safe\n", mode: 0o100755 }
  ], commit));
  return { artifactPath, commit, directory };
}

function writeTrackedFile(directory, path, data = "synthetic\n") {
  const target = join(directory, ...path.split("/"));
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, data);
  git(directory, ["add", "--", path]);
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
    fileCount: 4
  });
});

test("permits only the explicit review-only proxy config omission for a source-only artifact", (t) => {
  const fixture = createRepository(t);
  const sourceOnlyArtifact = join(fixture.directory, "source-only.zip");
  const baseVerification = {
    artifactPath: sourceOnlyArtifact,
    repositoryPath: fixture.directory,
    expectedCommit: fixture.commit,
    sourceOnlyBoundary: true
  };

  execFileSync("git", [
    "-c",
    "core.autocrlf=false",
    "archive",
    "--format=zip",
    `--output=${sourceOnlyArtifact}`,
    fixture.commit,
    "--",
    ".",
    ":(exclude)config/proxy-servers.json",
    ":(exclude).env"
  ], { cwd: fixture.directory });

  assert.throws(
    () => treeVerifier.verifyArtifactGitTree(baseVerification),
    (error) => error.code === "artifact_source_tree_mismatch"
  );
  assert.deepEqual(treeVerifier.verifyArtifactGitTree({
    ...baseVerification,
    excludedPaths: ["config/proxy-servers.json"]
  }), {
    ok: true,
    type: "artifact_git_tree_identity",
    fileCount: 3
  });
  assert.throws(
    () => treeVerifier.verifyArtifactGitTree({
      ...baseVerification,
      excludedPaths: ["config/proxy-servers.json", ".env"]
    }),
    (error) => error.code === "artifact_source_tree_mismatch"
  );
  assert.throws(
    () => treeVerifier.verifyArtifactGitTree({
      ...baseVerification,
      excludedPaths: ["alpha.txt"]
    }),
    (error) => error.code === "artifact_source_tree_mismatch"
  );

  let stdout = "";
  let stderr = "";
  const exitCode = treeVerifier.runArtifactGitTreeVerifierCli({
    argv: [
      "--repository", fixture.directory,
      "--commit", fixture.commit,
      "--artifact", sourceOnlyArtifact,
      "--exclude-path", "config/proxy-servers.json",
      "--source-only-boundary"
    ],
    stdout: { write: (value) => { stdout += value; } },
    stderr: { write: (value) => { stderr += value; } }
  });
  assert.equal(exitCode, 0);
  assert.equal(stderr, "");
  assert.deepEqual(JSON.parse(stdout), {
    ok: true,
    type: "artifact_git_tree_identity",
    fileCount: 3
  });
});

test("keeps exact tree verification when the review-only proxy omission is absent", (t) => {
  const fixture = createRepository(t);
  const sourceOnlyArtifact = join(fixture.directory, "source-only-no-proxy-config.zip");
  unlinkSync(join(fixture.directory, "config", "proxy-servers.json"));
  git(fixture.directory, ["add", "-u", "--", "config/proxy-servers.json"]);
  git(fixture.directory, ["commit", "-qm", "remove protected proxy config"]);
  const commit = git(fixture.directory, ["rev-parse", "HEAD"]);

  execFileSync("git", [
    "-c",
    "core.autocrlf=false",
    "archive",
    "--format=zip",
    `--output=${sourceOnlyArtifact}`,
    commit,
    "--",
    ".",
    ":(exclude)config/proxy-servers.json",
    ":(exclude).env"
  ], { cwd: fixture.directory });

  assert.deepEqual(treeVerifier.verifyArtifactGitTree({
    artifactPath: sourceOnlyArtifact,
    repositoryPath: fixture.directory,
    expectedCommit: commit,
    excludedPaths: ["config/proxy-servers.json"],
    sourceOnlyBoundary: true
  }), {
    ok: true,
    type: "artifact_git_tree_identity",
    fileCount: 3
  });
});

test("blocks sensitive files in the trusted Git tree before source-only omissions", (t) => {
  const fixture = createRepository(t);
  for (const path of [
    ".env",
    ".env.local",
    "nested/.env.payment",
    "nested/.env.hp-private",
    "nested/.env.aliyun-prod",
    "control.sqlite",
    "protected/operator.key",
    "logs/proxy.log",
    "server/app.mjs.bak-20260716"
  ]) {
    writeTrackedFile(fixture.directory, path);
  }
  git(fixture.directory, ["commit", "-qm", "add blocked artifact paths"]);
  const commit = git(fixture.directory, ["rev-parse", "HEAD"]);
  const sourceOnlyArtifact = join(fixture.directory, "blocked-trusted-tree.zip");

  execFileSync("git", [
    "-c",
    "core.autocrlf=false",
    "archive",
    "--format=zip",
    `--output=${sourceOnlyArtifact}`,
    commit,
    "--",
    ".",
    ":(exclude)config/proxy-servers.json",
    ":(exclude).env"
  ], { cwd: fixture.directory });

  assert.throws(
    () => treeVerifier.verifyArtifactGitTree({
      artifactPath: sourceOnlyArtifact,
      repositoryPath: fixture.directory,
      expectedCommit: commit,
      excludedPaths: ["config/proxy-servers.json"],
      sourceOnlyBoundary: true
    }),
    (error) => error.code === "artifact_source_tree_mismatch"
      && error.stage === "trusted_git_tree_boundary"
  );
});

test("blocks sensitive files injected into a ZIP when the trusted Git tree is clean", (t) => {
  const fixture = createRepository(t);
  const artifactPath = join(fixture.directory, "blocked-zip-paths.zip");
  writeFileSync(artifactPath, storedZip([
    { name: "alpha.txt", data: "alpha\n", mode: 0o100644 },
    { name: ".env.example", data: "safe-example-environment\n", mode: 0o100644 },
    { name: "nested/", mode: 0o040755 },
    { name: "nested/script.sh", data: "#!/bin/sh\necho safe\n", mode: 0o100755 },
    { name: ".env.local", data: "synthetic\n", mode: 0o100644 },
    { name: "control.sqlite", data: "synthetic\n", mode: 0o100644 },
    { name: "protected/operator.key", data: "synthetic\n", mode: 0o100644 }
  ], fixture.commit));

  assert.throws(
    () => treeVerifier.verifyArtifactGitTree({
      artifactPath,
      repositoryPath: fixture.directory,
      expectedCommit: fixture.commit,
      excludedPaths: ["config/proxy-servers.json"],
      sourceOnlyBoundary: true
    }),
    (error) => error.code === "artifact_source_tree_mismatch"
      && error.stage === "zip_file_boundary"
  );
});

test("source-only CLI blocks boundary paths, preserves legacy mode, and rejects malformed flags without leaks", (t) => {
  const fixture = createRepository(t);
  writeTrackedFile(fixture.directory, ".env.local");
  git(fixture.directory, ["commit", "-qm", "add protected environment"]);
  const commit = git(fixture.directory, ["rev-parse", "HEAD"]);
  const artifactPath = join(fixture.directory, "boundary-path.zip");
  git(fixture.directory, ["archive", "--format=zip", `--output=${artifactPath}`, commit]);

  assert.deepEqual(treeVerifier.verifyArtifactGitTree({
    artifactPath,
    repositoryPath: fixture.directory,
    expectedCommit: commit
  }), {
    ok: true,
    type: "artifact_git_tree_identity",
    fileCount: 5
  });

  let stdout = "";
  let stderr = "";
  const boundaryExitCode = treeVerifier.runArtifactGitTreeVerifierCli({
    argv: [
      "--repository", fixture.directory,
      "--commit", commit,
      "--artifact", artifactPath,
      "--source-only-boundary"
    ],
    stdout: { write: (value) => { stdout += value; } },
    stderr: { write: (value) => { stderr += value; } }
  });
  assert.equal(boundaryExitCode, 1);
  assert.equal(stdout, "");
  assert.equal(JSON.parse(stderr).error, "artifact_source_tree_mismatch");
  assert.equal(stderr.includes(fixture.directory), false);
  assert.equal(stderr.includes(".env.local"), false);

  stdout = "";
  stderr = "";
  const malformedExitCode = treeVerifier.runArtifactGitTreeVerifierCli({
    argv: [
      "--repository", fixture.directory,
      "--commit", commit,
      "--artifact", artifactPath,
      "--source-only-boundary=invalid"
    ],
    stdout: { write: (value) => { stdout += value; } },
    stderr: { write: (value) => { stderr += value; } }
  });
  assert.equal(malformedExitCode, 1);
  assert.equal(stdout, "");
  assert.equal(JSON.parse(stderr).error, "artifact_source_tree_mismatch");
  assert.equal(stderr.includes(fixture.directory), false);
  assert.equal(stderr.includes(".env.local"), false);
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

test("verifies the current HEAD source ZIP with only the explicit proxy omission", (t) => {
  const artifactDirectory = mkdtempSync(join(tmpdir(), "gccgw-current-head-artifact-"));
  t.after(() => rmSync(artifactDirectory, { recursive: true, force: true }));
  const artifactPath = join(artifactDirectory, "source-only.zip");
  const commit = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: REPOSITORY_ROOT,
    encoding: "utf8"
  }).trim();

  execFileSync("git", [
    "-c",
    "core.autocrlf=false",
    "archive",
    "--format=zip",
    `--output=${artifactPath}`,
    "HEAD",
    "--",
    ".",
    ":(exclude)config/proxy-servers.json",
    ":(exclude).env"
  ], { cwd: REPOSITORY_ROOT });

  const report = treeVerifier.verifyArtifactGitTree({
    artifactPath,
    repositoryPath: REPOSITORY_ROOT,
    expectedCommit: commit,
    excludedPaths: ["config/proxy-servers.json"],
    sourceOnlyBoundary: true
  });
  assert.equal(report.ok, true);
  assert.equal(report.type, "artifact_git_tree_identity");
  assert.ok(report.fileCount > 0);
});
