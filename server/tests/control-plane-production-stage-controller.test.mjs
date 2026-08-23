import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import test from "node:test";

import {
  PRODUCTION_STAGE_CONTROLLER_TYPE,
  PRODUCTION_STAGE_LOCK_NAME,
  ProductionStageControllerError,
  createProductionStageControllerTestRuntime,
  preflightProductionCandidateStage,
  runProductionStageControllerCli,
  stageProductionCandidate,
  verifyProductionCandidateStage
} from "../../scripts/control-plane-production-stage-controller.mjs";
import { parseArtifactStageReceipt } from "../../scripts/control-plane-candidate-dependency-gate.mjs";

const SOURCE_COMMIT = "9".repeat(40);
const ARTIFACT_RELEASE = "master-92c868e0";
const CANDIDATE_RELEASE = "candidate-92c868e0";
const CURRENT_RELEASE = "control-plane-current";
const CREATED_AT = "2026-08-23T12:00:00.000Z";
const hash = (value) => createHash("sha256").update(value).digest("hex");
const condition = (name) => (error) => error instanceof ProductionStageControllerError && error.condition === name;
const FIXTURE_MODES = new Map();

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) value = (value >>> 8) ^ CRC_TABLE[(value ^ byte) & 0xff];
  return (value ^ 0xffffffff) >>> 0;
}

function zip(entries, { comment: commentValue = SOURCE_COMMIT, flags = 0x0800 } = {}) {
  const localRecords = [];
  const centralRecords = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const bytes = Buffer.isBuffer(entry.bytes) ? entry.bytes : Buffer.from(entry.bytes ?? "");
    const mode = entry.mode ?? 0o100644;
    const madeBy = entry.madeBy ?? ((3 << 8) | 20);
    const external = entry.external ?? ((mode << 16) >>> 0);
    const extra = Buffer.from(entry.extra ?? []);
    const crc = crc32(bytes);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(bytes.length, 18);
    local.writeUInt32LE(bytes.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(extra.length, 28);
    localRecords.push(local, name, extra, bytes);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(madeBy, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(bytes.length, 20);
    central.writeUInt32LE(bytes.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(extra.length, 30);
    central.writeUInt32LE(external, 38);
    central.writeUInt32LE(offset, 42);
    centralRecords.push(central, name, extra);
    offset += local.length + name.length + extra.length + bytes.length;
  }
  const central = Buffer.concat(centralRecords);
  const comment = Buffer.from(commentValue, "ascii");
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(comment.length, 20);
  return Buffer.concat([...localRecords, central, end, comment]);
}

function regularEntries(overrides = []) {
  const entries = [
    { name: "package.json", bytes: '{"name":"candidate","version":"1.0.0"}\n' },
    { name: "package-lock.json", bytes: '{"name":"candidate","lockfileVersion":3,"packages":{}}\n' },
    { name: "scripts/control-plane-db-snapshot-gate.mjs", bytes: "export const safeImport = true;\n" },
    { name: "server/index.js", bytes: "export const staged = true;\n" }
  ];
  return [...entries, ...overrides];
}

function write(path, bytes, mode = 0o600) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes, { mode });
  chmodSync(path, mode);
  FIXTURE_MODES.set(resolve(path), mode);
}

function removeCurrent(path) {
  try { unlinkSync(path); } catch { rmSync(path, { recursive: true, force: true }); }
}

function pointCurrent(root, release) {
  const pointer = join(root, "current");
  if (existsSync(pointer) || (() => { try { lstatSync(pointer); return true; } catch { return false; } })()) removeCurrent(pointer);
  symlinkSync(join(root, "releases", release), pointer, process.platform === "win32" ? "junction" : "dir");
}

function treeSnapshot(root) {
  const rows = [];
  function visit(path, relativePath = ".") {
    const metadata = lstatSync(path);
    rows.push([relativePath, metadata.isSymbolicLink() ? "link" : metadata.isDirectory() ? "dir" : "file", metadata.mode & 0o777, metadata.size]);
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) return;
    for (const name of readdirSync(path).sort()) visit(join(path, name), relativePath === "." ? name : `${relativePath}/${name}`);
  }
  visit(root);
  return rows;
}

function fixture(t, { zipEntries = regularEntries(), zipOptions, inputMutation, configMode = 0o640, publicationRoots = true, runtimeOverrides = {} } = {}) {
  const root = mkdtempSync(join(tmpdir(), "gccgw-production-stage-"));
  const inputDirectory = join(root, "input");
  const deploymentRoot = join(root, "deployment");
  const releases = join(deploymentRoot, "releases");
  const activeRoot = join(releases, CURRENT_RELEASE);
  mkdirSync(join(activeRoot, "config"), { recursive: true, mode: 0o755 });
  if (publicationRoots) {
    mkdirSync(join(deploymentRoot, "assembly-receipts"), { recursive: true, mode: 0o700 });
    mkdirSync(join(deploymentRoot, "dependency-artifacts"), { recursive: true, mode: 0o700 });
    chmodSync(join(deploymentRoot, "assembly-receipts"), 0o700);
    chmodSync(join(deploymentRoot, "dependency-artifacts"), 0o700);
    FIXTURE_MODES.set(resolve(deploymentRoot, "assembly-receipts"), 0o700);
    FIXTURE_MODES.set(resolve(deploymentRoot, "dependency-artifacts"), 0o700);
  }
  write(join(activeRoot, "config", "proxy-servers.json"), Buffer.from("{}\n"), configMode);
  write(join(activeRoot, ".env"), Buffer.from("PROTECTED=1\n"), 0o600);
  pointCurrent(deploymentRoot, CURRENT_RELEASE);
  write(join(deploymentRoot, "service-state.txt"), Buffer.from("active\n"), 0o600);
  write(join(deploymentRoot, "subscription-control.sqlite"), Buffer.from("db-sentinel\n"), 0o600);

  const archiveBytes = zip(zipEntries, zipOptions);
  const artifactName = `proxy-gateway-${ARTIFACT_RELEASE}.zip`;
  const packageBytes = Buffer.from(zipEntries.find(({ name }) => name === "package.json")?.bytes ?? "");
  const lockBytes = Buffer.from(zipEntries.find(({ name }) => name === "package-lock.json")?.bytes ?? "");
  const artifactManifest = {
    schemaVersion: "1",
    releaseUnit: "control-plane-app",
    sourceCommit: SOURCE_COMMIT,
    release: ARTIFACT_RELEASE,
    artifact: { fileName: artifactName, sha256: hash(archiveBytes), sizeBytes: archiveBytes.length, createdAt: CREATED_AT }
  };
  const artifactManifestBytes = Buffer.from(`${JSON.stringify(artifactManifest, null, 2)}\n`);
  const dependencyArchiveBytes = Buffer.from("bounded dependency tar bytes\n");
  const dependencyManifest = {
    schemaVersion: "2",
    type: "control_plane_dependency_artifact",
    state: "verified",
    releaseUnit: "control-plane-app",
    sourceCommit: SOURCE_COMMIT,
    artifactRelease: ARTIFACT_RELEASE,
    package: { sha256: hash(packageBytes), sizeBytes: packageBytes.length },
    packageLock: { sha256: hash(lockBytes), sizeBytes: lockBytes.length },
    archive: { fileName: "node-modules.tar", sha256: hash(dependencyArchiveBytes), sizeBytes: dependencyArchiveBytes.length },
    runtime: { platform: "linux", arch: "x64", libc: "glibc-2.39", nodeVersion: "v22.23.1", nodeAbi: "127", npmVersion: "v10.9.2", betterSqlite3Version: "12.10.0" },
    smoke: { betterSqlite3Memory: true, snapshotImport: true },
    tree: { sha256: "4".repeat(64), entryCount: 4, totalBytes: 128, hardlinksBroken: true, symlinksInternal: true },
    provenance: { builder: "github-actions", workflow: "control-plane-dependency-artifact.yml" }
  };
  const dependencyManifestBytes = Buffer.from(`${JSON.stringify(dependencyManifest, null, 2)}\n`);
  mkdirSync(inputDirectory, { recursive: true, mode: 0o700 });
  chmodSync(inputDirectory, 0o700);
  FIXTURE_MODES.set(resolve(inputDirectory), 0o700);
  write(join(inputDirectory, "artifact.json"), artifactManifestBytes);
  write(join(inputDirectory, artifactName), archiveBytes);
  write(join(inputDirectory, `${artifactName}.sha256`), Buffer.from(`${hash(archiveBytes)}  .release-artifacts/${artifactName}\n`));
  write(join(inputDirectory, "dependency-artifact.json"), dependencyManifestBytes);
  write(join(inputDirectory, "node-modules.tar"), dependencyArchiveBytes);
  write(join(inputDirectory, "release-label.txt"), Buffer.from(`${ARTIFACT_RELEASE}\n`));
  inputMutation?.({ inputDirectory, artifactName });

  const runtime = createProductionStageControllerTestRuntime({
    root: deploymentRoot,
    enforceModes: true,
    now: () => CREATED_AT,
    renameNoReplace({ source, destination }) {
      if (existsSync(destination)) return false;
      renameSync(source, destination);
      return true;
    },
    modeFor(path, metadata) {
      const absolute = resolve(path);
      if (FIXTURE_MODES.has(absolute)) return FIXTURE_MODES.get(absolute);
      if (basename(absolute) === PRODUCTION_STAGE_LOCK_NAME) return 0o600;
      if (["assembly-receipts", "dependency-artifacts"].includes(basename(absolute))) return 0o700;
      if (absolute.includes(`${join("releases", CANDIDATE_RELEASE)}`)) return metadata.isDirectory() ? 0o755 : 0o644;
      if (absolute.includes(`${join("assembly-receipts", CANDIDATE_RELEASE)}`)) return metadata.isDirectory() ? 0o700 : 0o600;
      if (absolute.includes(`${join("dependency-artifacts", CANDIDATE_RELEASE)}`)) {
        return ["dependency-artifact.json", "node-modules.tar", "release-label.txt"].includes(basename(absolute)) ? 0o400 : 0o700;
      }
      return metadata.mode & 0o7777;
    },
    ...runtimeOverrides
  });
  const options = {
    inputDirectory,
    candidateRelease: CANDIDATE_RELEASE,
    expectedCurrentRelease: CURRENT_RELEASE,
    expectedSourceCommit: SOURCE_COMMIT,
    expectedArtifactRelease: ARTIFACT_RELEASE,
    expectedArtifactManifestSha256: hash(artifactManifestBytes),
    expectedSourceArtifactSha256: hash(archiveBytes),
    expectedDependencyManifestSha256: hash(dependencyManifestBytes),
    expectedDependencyArchiveSha256: hash(dependencyArchiveBytes),
    runtime
  };
  t.after(() => {
    for (const path of FIXTURE_MODES.keys()) if (path.startsWith(resolve(root))) FIXTURE_MODES.delete(path);
    rmSync(root, { recursive: true, force: true });
  });
  return { root, deploymentRoot, inputDirectory, activeRoot, artifactName, artifactManifestBytes, dependencyManifestBytes, packageBytes, lockBytes, options };
}

function copyInputSet(source, destination) {
  rmSync(destination, { recursive: true, force: true });
  mkdirSync(destination, { recursive: true, mode: 0o700 });
  chmodSync(destination, 0o700);
  FIXTURE_MODES.set(resolve(destination), 0o700);
  for (const name of readdirSync(source)) write(join(destination, name), readFileSync(join(source, name)), 0o600);
}

test("preflight is read-only and binds exactly six controlled inputs", (t) => {
  const value = fixture(t);
  const before = treeSnapshot(value.root);
  const result = preflightProductionCandidateStage(value.options);
  assert.equal(result.type, PRODUCTION_STAGE_CONTROLLER_TYPE);
  assert.equal(result.mode, "preflight");
  assert.equal(result.state, "ready");
  assert.equal(result.applied, false);
  assert.deepEqual(treeSnapshot(value.root), before);
  assert.equal(JSON.stringify(result).includes(value.root), false);
});

test("the six-file input is path-disjoint from the complete deployment tree", async (t) => {
  await t.test("deployment root", (t) => {
    const value = fixture(t);
    const before = treeSnapshot(value.root);
    assert.throws(
      () => preflightProductionCandidateStage({ ...value.options, inputDirectory: value.deploymentRoot }),
      condition("input_boundary_invalid")
    );
    assert.deepEqual(treeSnapshot(value.root), before);
  });

  await t.test("deployment ancestor", (t) => {
    const value = fixture(t);
    const before = treeSnapshot(value.root);
    assert.throws(
      () => preflightProductionCandidateStage({ ...value.options, inputDirectory: value.root }),
      condition("input_boundary_invalid")
    );
    assert.deepEqual(treeSnapshot(value.root), before);
  });

  for (const relativePath of [
    ["assembly-receipts"],
    ["dependency-artifacts"],
    ["releases", CURRENT_RELEASE, "private-stage-input"]
  ]) {
    await t.test(relativePath.join("/"), (t) => {
      const value = fixture(t);
      const overlappingInput = join(value.deploymentRoot, ...relativePath);
      copyInputSet(value.inputDirectory, overlappingInput);
      const before = treeSnapshot(value.deploymentRoot);

      assert.throws(
        () => stageProductionCandidate({ ...value.options, inputDirectory: overlappingInput, apply: true }),
        condition("input_boundary_invalid")
      );
      assert.deepEqual(treeSnapshot(value.deploymentRoot), before);
      assert.equal(existsSync(join(value.deploymentRoot, PRODUCTION_STAGE_LOCK_NAME)), false);
      assert.equal(existsSync(join(value.deploymentRoot, "releases", CANDIDATE_RELEASE)), false);
      assert.equal(realpathSync(join(value.deploymentRoot, "current")), realpathSync(value.activeRoot));
    });
  }
});

test("a common-prefix sibling remains a valid private input root", (t) => {
  const value = fixture(t);
  const siblingInput = join(value.root, `${basename(value.deploymentRoot)}-input`);
  copyInputSet(value.inputDirectory, siblingInput);
  const before = treeSnapshot(value.deploymentRoot);

  const result = preflightProductionCandidateStage({ ...value.options, inputDirectory: siblingInput });

  assert.equal(result.state, "ready");
  assert.deepEqual(treeSnapshot(value.deploymentRoot), before);
});

test("verify rejects an input moved below the published deployment tree", (t) => {
  const value = fixture(t);
  stageProductionCandidate({ ...value.options, apply: true });
  const overlappingInput = join(value.deploymentRoot, "verify-input");
  copyInputSet(value.inputDirectory, overlappingInput);
  const before = treeSnapshot(value.deploymentRoot);

  assert.throws(
    () => verifyProductionCandidateStage({ ...value.options, inputDirectory: overlappingInput }),
    condition("input_boundary_invalid")
  );
  assert.deepEqual(treeSnapshot(value.deploymentRoot), before);
  assert.equal(existsSync(join(value.deploymentRoot, PRODUCTION_STAGE_LOCK_NAME)), false);
  assert.equal(realpathSync(join(value.deploymentRoot, "current")), realpathSync(value.activeRoot));
});

test("stage is default-off and requires an explicit apply confirmation", (t) => {
  const value = fixture(t);
  assert.throws(() => stageProductionCandidate(value.options), condition("apply_confirmation_required"));
  assert.equal(existsSync(join(value.deploymentRoot, "releases", CANDIDATE_RELEASE)), false);
  assert.equal(realpathSync(join(value.deploymentRoot, "current")), realpathSync(value.activeRoot));
});

test("an existing production-stage controller claim blocks before reserved namespace mutation", (t) => {
  const value = fixture(t);
  const lockPath = join(value.deploymentRoot, PRODUCTION_STAGE_LOCK_NAME);
  const lockBytes = Buffer.from("operator-owned claim\n");
  write(lockPath, lockBytes, 0o600);

  let observed;
  assert.throws(
    () => stageProductionCandidate({ ...value.options, apply: true }),
    (error) => {
      observed = error;
      return error instanceof ProductionStageControllerError && error.condition === "stage_lock_unavailable";
    }
  );
  assert.equal(observed.attentionRequired, true);
  assert.deepEqual(readFileSync(lockPath), lockBytes);
  assert.equal(existsSync(join(value.deploymentRoot, "releases", CANDIDATE_RELEASE)), false);
  assert.equal(existsSync(join(value.deploymentRoot, "assembly-receipts", CANDIDATE_RELEASE)), false);
  assert.equal(existsSync(join(value.deploymentRoot, "dependency-artifacts", CANDIDATE_RELEASE)), false);
  assert.equal(realpathSync(join(value.deploymentRoot, "current")), realpathSync(value.activeRoot));
});

test("the production-stage controller claim serializes cooperating stage attempts", (t) => {
  let value;
  let hookCalls = 0;
  let nestedError;
  value = fixture(t, {
    runtimeOverrides: {
      afterStageLockAcquired() {
        hookCalls += 1;
        try {
          stageProductionCandidate({ ...value.options, apply: true });
        } catch (error) {
          nestedError = error;
        }
      }
    }
  });

  const result = stageProductionCandidate({ ...value.options, apply: true });
  assert.equal(result.state, "staged");
  assert.equal(hookCalls, 1);
  assert.equal(nestedError instanceof ProductionStageControllerError, true);
  assert.equal(nestedError.condition, "stage_lock_unavailable");
  assert.equal(nestedError.attentionRequired, true);
  assert.equal(existsSync(join(value.deploymentRoot, PRODUCTION_STAGE_LOCK_NAME)), false);
});

test("the production-stage controller claim is released after a controlled failure", (t) => {
  const value = fixture(t, { runtimeOverrides: { faultAt: "after_stage_lock_acquired" } });
  assert.throws(
    () => stageProductionCandidate({ ...value.options, apply: true }),
    condition("stage_failed")
  );
  assert.equal(existsSync(join(value.deploymentRoot, PRODUCTION_STAGE_LOCK_NAME)), false);
  assert.equal(existsSync(join(value.deploymentRoot, "releases", CANDIDATE_RELEASE)), false);
  assert.equal(realpathSync(join(value.deploymentRoot, "current")), realpathSync(value.activeRoot));
});

test("the production-stage controller claim is released after a receipt-terminal failure", (t) => {
  const value = fixture(t, { runtimeOverrides: { faultAt: "after_receipt_publish" } });
  let observed;
  assert.throws(
    () => stageProductionCandidate({ ...value.options, apply: true }),
    (error) => {
      observed = error;
      return error instanceof ProductionStageControllerError && error.condition === "stage_failed";
    }
  );
  assert.equal(observed.attentionRequired, true);
  assert.equal(existsSync(join(value.deploymentRoot, PRODUCTION_STAGE_LOCK_NAME)), false);
  assert.equal(existsSync(join(value.deploymentRoot, "releases", CANDIDATE_RELEASE)), true);
  assert.equal(existsSync(join(value.deploymentRoot, "assembly-receipts", CANDIDATE_RELEASE)), true);
  assert.equal(existsSync(join(value.deploymentRoot, "dependency-artifacts", CANDIDATE_RELEASE)), true);
  assert.equal(realpathSync(join(value.deploymentRoot, "current")), realpathSync(value.activeRoot));
});

test("Linux claim cleanup preserves an unknown replacement", { skip: process.platform !== "linux" }, (t) => {
  const replacement = Buffer.from("replacement claim\n");
  let replacedPath;
  const value = fixture(t, {
    runtimeOverrides: {
      beforeStageLockRelease(path) {
        unlinkSync(path);
        write(path, replacement, 0o600);
        replacedPath = path;
      }
    }
  });

  let observed;
  assert.throws(
    () => stageProductionCandidate({ ...value.options, apply: true }),
    (error) => {
      observed = error;
      return error instanceof ProductionStageControllerError && error.condition === "cleanup_failed";
    }
  );
  assert.equal(observed.attentionRequired, true);
  assert.deepEqual(readFileSync(replacedPath), replacement);
  assert.equal(realpathSync(join(value.deploymentRoot, "current")), realpathSync(value.activeRoot));
});

test("stage publishes a no-replace source candidate and bound receipts without protected overlays", (t) => {
  const value = fixture(t);
  const currentLink = readlinkSync(join(value.deploymentRoot, "current"));
  const serviceBefore = readFileSync(join(value.deploymentRoot, "service-state.txt"));
  const databaseBefore = readFileSync(join(value.deploymentRoot, "subscription-control.sqlite"));
  const result = stageProductionCandidate({ ...value.options, apply: true });
  const candidateRoot = join(value.deploymentRoot, "releases", CANDIDATE_RELEASE);
  const assemblyRoot = join(value.deploymentRoot, "assembly-receipts", CANDIDATE_RELEASE);
  const dependencyRoot = join(value.deploymentRoot, "dependency-artifacts", CANDIDATE_RELEASE);

  assert.equal(result.state, "staged");
  assert.equal(result.applied, true);
  assert.equal(readFileSync(join(candidateRoot, "package.json"), "utf8"), value.packageBytes.toString("utf8"));
  assert.equal(existsSync(join(candidateRoot, ".env")), false);
  assert.equal(existsSync(join(candidateRoot, "config", "proxy-servers.json")), false);
  assert.deepEqual(readdirSync(assemblyRoot).sort(), ["artifact-manifest.json", "artifact-stage-receipt.json"]);
  assert.deepEqual(readFileSync(join(assemblyRoot, "artifact-manifest.json")), value.artifactManifestBytes);
  const receiptBytes = readFileSync(join(assemblyRoot, "artifact-stage-receipt.json"));
  assert.doesNotThrow(() => parseArtifactStageReceipt({
    bytes: receiptBytes,
    candidateRelease: CANDIDATE_RELEASE,
    packageJson: value.packageBytes,
    packageLock: value.lockBytes,
    artifactManifestBytes: value.artifactManifestBytes
  }));
  assert.deepEqual(readdirSync(dependencyRoot).sort(), ["dependency-artifact.json", "node-modules.tar", "release-label.txt"]);
  if (process.platform !== "win32") {
    assert.equal(lstatSync(dependencyRoot).mode & 0o777, 0o700);
    for (const name of readdirSync(dependencyRoot)) assert.equal(lstatSync(join(dependencyRoot, name)).mode & 0o777, 0o400);
  }
  assert.equal(readlinkSync(join(value.deploymentRoot, "current")), currentLink);
  assert.deepEqual(readFileSync(join(value.deploymentRoot, "service-state.txt")), serviceBefore);
  assert.deepEqual(readFileSync(join(value.deploymentRoot, "subscription-control.sqlite")), databaseBefore);
  assert.equal(JSON.stringify(result).includes(value.root), false);
  const verified = verifyProductionCandidateStage(value.options);
  assert.equal(verified.mode, "verify");
  assert.equal(verified.state, "verified");
  assert.equal(verified.applied, false);
  assert.equal(existsSync(join(value.deploymentRoot, PRODUCTION_STAGE_LOCK_NAME)), false);
});

test("input custody rejects missing, extra, and hash-drifted artifacts before mutation", async (t) => {
  await t.test("missing", (t) => {
    const value = fixture(t, { inputMutation: ({ inputDirectory }) => unlinkSync(join(inputDirectory, "release-label.txt")) });
    assert.throws(() => preflightProductionCandidateStage(value.options), condition("input_set_invalid"));
  });
  await t.test("extra", (t) => {
    const value = fixture(t, { inputMutation: ({ inputDirectory }) => write(join(inputDirectory, "unexpected.txt"), "unexpected\n") });
    assert.throws(() => preflightProductionCandidateStage(value.options), condition("input_set_invalid"));
  });
  await t.test("drift", (t) => {
    const value = fixture(t);
    write(join(value.inputDirectory, "node-modules.tar"), "different bytes\n");
    assert.throws(() => stageProductionCandidate({ ...value.options, apply: true }), condition("dependency_archive_mismatch"));
    assert.equal(existsSync(join(value.deploymentRoot, "releases", CANDIDATE_RELEASE)), false);
  });
});

test("input custody rejects symlink, hardlink, and replacement races", async (t) => {
  await t.test("symlink", { skip: process.platform === "win32" }, (t) => {
    const value = fixture(t);
    const label = join(value.inputDirectory, "release-label.txt");
    const external = join(value.root, "external-label.txt");
    write(external, `${ARTIFACT_RELEASE}\n`);
    unlinkSync(label);
    symlinkSync(external, label);
    assert.throws(() => preflightProductionCandidateStage(value.options), condition("input_file_invalid"));
  });
  await t.test("hardlink", (t) => {
    const value = fixture(t);
    const archive = join(value.inputDirectory, "node-modules.tar");
    linkSync(archive, join(value.root, "archive-hardlink"));
    assert.throws(() => preflightProductionCandidateStage(value.options), condition("input_file_invalid"));
  });
  await t.test("replacement before first mutation", (t) => {
    let value;
    value = fixture(t, {
      runtimeOverrides: {
        beforeFirstMutation() {
          const archive = join(value.inputDirectory, "node-modules.tar");
          unlinkSync(archive);
          write(archive, "replacement\n");
        }
      }
    });
    assert.throws(() => stageProductionCandidate({ ...value.options, apply: true }), condition("input_changed"));
    assert.equal(existsSync(join(value.deploymentRoot, "releases", CANDIDATE_RELEASE)), false);
  });
});

test("ZIP validation rejects traversal, links, special files, duplicates, protected overlays, and node_modules", async (t) => {
  const invalid = [
    ["traversal", [{ name: "../escape", bytes: "x" }], "source_archive_path_invalid"],
    ["symlink", [{ name: "link", bytes: "target", mode: 0o120777 }], "source_archive_entry_invalid"],
    ["special", [{ name: "fifo", bytes: "", mode: 0o010644 }], "source_archive_entry_invalid"],
    ["duplicate", [{ name: "package.json", bytes: "duplicate\n" }], "source_archive_duplicate"],
    ["env", [{ name: ".env", bytes: "forbidden\n" }], "source_archive_overlay_invalid"],
    ["proxy-config", [{ name: "config/proxy-servers.json", bytes: "{}\n" }], "source_archive_overlay_invalid"],
    ["node-modules", [{ name: "node_modules/a/index.js", bytes: "x\n" }], "source_archive_node_modules_invalid"]
  ];
  for (const [name, additions, expected] of invalid) {
    await t.test(name, (t) => {
      const value = fixture(t, { zipEntries: regularEntries(additions) });
      assert.throws(() => preflightProductionCandidateStage(value.options), condition(expected));
    });
  }
});

test("ZIP validation binds the exact source commit comment and production artifact boundary", async (t) => {
  await t.test("EOCD comment drift", (t) => {
    const value = fixture(t, { zipOptions: { comment: "8".repeat(40) } });
    assert.throws(() => preflightProductionCandidateStage(value.options), condition("source_archive_invalid"));
  });
  await t.test("forbidden database suffix", (t) => {
    const value = fixture(t, { zipEntries: regularEntries([{ name: "runtime.sqlite", bytes: "not-a-database\n" }]) });
    assert.throws(() => preflightProductionCandidateStage(value.options), condition("source_archive_entry_invalid"));
  });
});

test("ZIP validation accepts only the exact legacy git-archive DOS metadata shape", async (t) => {
  const gitArchiveExtra = Buffer.from([
    0x55, 0x54, 0x05, 0x00,
    0x01, 0x00, 0x00, 0x00, 0x00
  ]);
  const legacy = (entry) => ({
    ...entry,
    madeBy: 0,
    external: entry.name.endsWith("/") ? 0x10 : 0,
    extra: gitArchiveExtra
  });
  const entries = [
    legacy({ name: "docs/", bytes: "", mode: 0o040755 }),
    legacy({ name: "package.json", bytes: '{"name":"candidate","version":"1.0.0"}\n' }),
    legacy({ name: "package-lock.json", bytes: '{"name":"candidate","lockfileVersion":3,"packages":{}}\n' }),
    {
      name: "scripts/control-plane-db-snapshot-gate.mjs",
      bytes: "export const safeImport = true;\n",
      mode: 0o100755,
      madeBy: 0x0317,
      extra: gitArchiveExtra
    },
    legacy({ name: "server/index.js", bytes: "export const staged = true;\n" })
  ];

  await t.test("legacy regular files and trailing-slash directories", (t) => {
    const value = fixture(t, { zipEntries: entries });
    assert.equal(preflightProductionCandidateStage(value.options).state, "ready");
  });
  await t.test("legacy regular file external attributes must remain exactly zero", (t) => {
    const value = fixture(t, {
      zipEntries: entries.map((entry) => (
        entry.name === "server/index.js" ? { ...entry, external: 0x20 } : entry
      ))
    });
    assert.throws(
      () => preflightProductionCandidateStage(value.options),
      condition("source_archive_entry_invalid")
    );
  });
  await t.test("legacy directory requires only the exact DOS directory flag", (t) => {
    for (const external of [0, 0x20]) {
      const value = fixture(t, {
        zipEntries: entries.map((entry) => (
          entry.name === "docs/" ? { ...entry, external } : entry
        ))
      });
      assert.throws(
        () => preflightProductionCandidateStage(value.options),
        condition("source_archive_entry_invalid")
      );
    }
  });
  await t.test("legacy regular file rejects the DOS directory flag", (t) => {
    const value = fixture(t, {
      zipEntries: entries.map((entry) => (
        entry.name === "server/index.js" ? { ...entry, external: 0x10 } : entry
      ))
    });
    assert.throws(
      () => preflightProductionCandidateStage(value.options),
      condition("source_archive_entry_invalid")
    );
  });
  await t.test("other DOS creator versions are not the legacy shape", (t) => {
    const value = fixture(t, {
      zipEntries: entries.map((entry) => (
        entry.name === "server/index.js" ? { ...entry, madeBy: 0x0014 } : entry
      ))
    });
    assert.throws(
      () => preflightProductionCandidateStage(value.options),
      condition("source_archive_invalid")
    );
  });
  await t.test("legacy directory payload mismatch remains blocked", (t) => {
    const value = fixture(t, {
      zipEntries: entries.map((entry) => (
        entry.name === "docs/" ? { ...entry, bytes: "not-empty" } : entry
      ))
    });
    assert.throws(
      () => preflightProductionCandidateStage(value.options),
      condition("source_archive_entry_invalid")
    );
  });
});

test("current release CAS blocks initial mismatch and a race before first mutation", async (t) => {
  await t.test("initial mismatch", (t) => {
    const value = fixture(t);
    assert.throws(() => preflightProductionCandidateStage({ ...value.options, expectedCurrentRelease: "other-current" }), condition("current_release_mismatch"));
  });
  await t.test("race", (t) => {
    let value;
    value = fixture(t, {
      runtimeOverrides: {
        beforeFirstMutation() {
          const other = join(value.deploymentRoot, "releases", "other-current");
          mkdirSync(other, { recursive: true });
          pointCurrent(value.deploymentRoot, "other-current");
        }
      }
    });
    assert.throws(() => stageProductionCandidate({ ...value.options, apply: true }), condition("current_release_changed"));
    assert.equal(existsSync(join(value.deploymentRoot, "releases", CANDIDATE_RELEASE)), false);
  });
});

test("publication order is candidate then dependency then assembly receipt-last", (t) => {
  const order = [];
  const value = fixture(t, {
    publicationRoots: false,
    runtimeOverrides: {
      renameNoReplace({ source, destination }) {
        if (existsSync(destination)) return false;
        order.push(destination.includes("assembly-receipts") ? "assembly" : destination.includes("dependency-artifacts") ? "dependency" : "candidate");
        renameSync(source, destination);
        return true;
      }
    }
  });
  stageProductionCandidate({ ...value.options, apply: true });
  assert.deepEqual(order, ["candidate", "dependency", "assembly"]);
  assert.equal(lstatSync(join(value.deploymentRoot, "assembly-receipts")).mode & 0o400, 0o400);
  assert.equal(lstatSync(join(value.deploymentRoot, "dependency-artifacts")).mode & 0o400, 0o400);
});

test("an uncertain rename result is reconciled to the attempt inode before cleanup", (t) => {
  let moved = false;
  const value = fixture(t, {
    runtimeOverrides: {
      renameNoReplace({ source, destination }) {
        if (existsSync(destination)) return false;
        renameSync(source, destination);
        moved = true;
        throw new Error("injected return-path failure after rename");
      }
    }
  });

  assert.throws(
    () => stageProductionCandidate({ ...value.options, apply: true }),
    condition("candidate_publish_failed")
  );
  assert.equal(moved, true);
  assert.equal(existsSync(join(value.deploymentRoot, "releases", CANDIDATE_RELEASE)), false);
  assert.equal(existsSync(join(value.deploymentRoot, "dependency-artifacts", CANDIDATE_RELEASE)), false);
  assert.equal(existsSync(join(value.deploymentRoot, "assembly-receipts", CANDIDATE_RELEASE)), false);
  assert.equal(realpathSync(join(value.deploymentRoot, "current")), realpathSync(value.activeRoot));
});

test("a destination-parent durability failure cleans the reconciled published inode", (t) => {
  let candidateMoved = false;
  let injected = false;
  let value;
  value = fixture(t, {
    runtimeOverrides: {
      renameNoReplace({ source, destination }) {
        if (existsSync(destination)) return false;
        renameSync(source, destination);
        if (destination === join(value.deploymentRoot, "releases", CANDIDATE_RELEASE)) {
          candidateMoved = true;
        }
        return true;
      },
      syncPublishedPath(path, conditionName) {
        if (candidateMoved && !injected && path === join(value.deploymentRoot, "releases")) {
          injected = true;
          throw new ProductionStageControllerError(conditionName);
        }
      }
    }
  });

  assert.throws(
    () => stageProductionCandidate({ ...value.options, apply: true }),
    condition("candidate_publish_failed")
  );
  assert.equal(injected, true);
  assert.equal(existsSync(join(value.deploymentRoot, "releases", CANDIDATE_RELEASE)), false);
  assert.equal(existsSync(join(value.deploymentRoot, "dependency-artifacts", CANDIDATE_RELEASE)), false);
  assert.equal(existsSync(join(value.deploymentRoot, "assembly-receipts", CANDIDATE_RELEASE)), false);
  assert.equal(realpathSync(join(value.deploymentRoot, "current")), realpathSync(value.activeRoot));
});

test("dangling or existing final namespaces are collisions and are never replaced", { skip: process.platform === "win32" }, async (t) => {
  await t.test("dangling candidate", (t) => {
    const value = fixture(t);
    const candidate = join(value.deploymentRoot, "releases", CANDIDATE_RELEASE);
    symlinkSync("missing-release", candidate, "dir");
    assert.throws(() => preflightProductionCandidateStage(value.options), condition("candidate_present"));
    assert.equal(lstatSync(candidate).isSymbolicLink(), true);
  });
  await t.test("existing assembly", (t) => {
    const value = fixture(t);
    const assembly = join(value.deploymentRoot, "assembly-receipts", CANDIDATE_RELEASE);
    mkdirSync(assembly);
    write(join(assembly, "sentinel"), "preserve\n");
    assert.throws(() => stageProductionCandidate({ ...value.options, apply: true }), condition("candidate_present"));
    assert.equal(readFileSync(join(assembly, "sentinel"), "utf8"), "preserve\n");
  });
});

test("verify re-reads final hashes, modes, exact sets, and receipt", (t) => {
  const value = fixture(t);
  stageProductionCandidate({ ...value.options, apply: true });
  assert.equal(verifyProductionCandidateStage(value.options).state, "verified");
  const dependency = join(value.deploymentRoot, "dependency-artifacts", CANDIDATE_RELEASE, "node-modules.tar");
  chmodSync(dependency, 0o600);
  writeFileSync(dependency, "drift\n");
  assert.throws(() => verifyProductionCandidateStage(value.options), condition("dependency_publish_failed"));
});

test("a post-publication failure cleans only attempt-owned staging paths", (t) => {
  const value = fixture(t, { runtimeOverrides: { faultAt: "after_candidate_publish" } });
  assert.throws(() => stageProductionCandidate({ ...value.options, apply: true }), condition("stage_failed"));
  assert.equal(existsSync(join(value.deploymentRoot, "releases", CANDIDATE_RELEASE)), false);
  assert.equal(existsSync(join(value.deploymentRoot, "assembly-receipts", CANDIDATE_RELEASE)), false);
  assert.equal(existsSync(join(value.deploymentRoot, "dependency-artifacts", CANDIDATE_RELEASE)), false);
  assert.equal(realpathSync(join(value.deploymentRoot, "current")), realpathSync(value.activeRoot));
  assert.equal(readFileSync(join(value.deploymentRoot, "service-state.txt"), "utf8"), "active\n");
  assert.equal(readFileSync(join(value.deploymentRoot, "subscription-control.sqlite"), "utf8"), "db-sentinel\n");
});

test("faults after directory identity registration leave no temporary namespace or bootstrap root", async (t) => {
  for (const point of [
    "after_publication_root_registered",
    "after_temporary_namespace_registered",
    "after_temporary_child_registered"
  ]) {
    await t.test(point, (t) => {
      const value = fixture(t, {
        publicationRoots: false,
        runtimeOverrides: { faultAt: point }
      });

      assert.throws(
        () => stageProductionCandidate({ ...value.options, apply: true }),
        condition("stage_failed")
      );
      assert.equal(existsSync(join(value.deploymentRoot, "assembly-receipts")), false);
      assert.equal(existsSync(join(value.deploymentRoot, "dependency-artifacts")), false);
      assert.deepEqual(
        readdirSync(join(value.deploymentRoot, "releases")).filter((name) => name.startsWith(".stage-")),
        []
      );
      assert.equal(existsSync(join(value.deploymentRoot, "releases", CANDIDATE_RELEASE)), false);
      assert.equal(realpathSync(join(value.deploymentRoot, "current")), realpathSync(value.activeRoot));
    });
  }
});

test("a created directory without a trustworthy identity is attention-required", async (t) => {
  for (const point of [
    "after_publication_root_mkdir_before_identity",
    "after_temporary_namespace_mkdir_before_identity",
    "after_temporary_child_mkdir_before_identity"
  ]) {
    await t.test(point, (t) => {
      let observed;
      const value = fixture(t, {
        publicationRoots: false,
        runtimeOverrides: { faultAt: point }
      });

      assert.throws(
        () => stageProductionCandidate({ ...value.options, apply: true }),
        (error) => {
          observed = error;
          return error instanceof ProductionStageControllerError && error.condition === "cleanup_failed";
        }
      );
      assert.equal(observed.attentionRequired, true);
      assert.equal(existsSync(join(value.deploymentRoot, "releases", CANDIDATE_RELEASE)), false);
      assert.equal(realpathSync(join(value.deploymentRoot, "current")), realpathSync(value.activeRoot));
    });
  }
});

test("a pre-identity replacement is never adopted as attempt-owned", async (t) => {
  for (const point of ["publication_root", "temporary_namespace", "temporary_child"]) {
    await t.test(point, (t) => {
      let replacedPath;
      const value = fixture(t, {
        publicationRoots: false,
        runtimeOverrides: {
          faultAt: `after_${point}_registered`,
          beforeDirectoryIdentityTrusted(observedPoint, path) {
            if (observedPoint !== point || replacedPath) return;
            rmSync(path, { recursive: true, force: false });
            mkdirSync(path, { mode: 0o700 });
            write(join(path, "replacement-sentinel"), "preserve\n");
            replacedPath = path;
          }
        }
      });

      let observed;
      assert.throws(
        () => stageProductionCandidate({ ...value.options, apply: true }),
        (error) => {
          observed = error;
          return error instanceof ProductionStageControllerError && error.condition === "cleanup_failed";
        }
      );
      assert.equal(observed.attentionRequired, true);
      assert.equal(readFileSync(join(replacedPath, "replacement-sentinel"), "utf8"), "preserve\n");
      if (point === "temporary_child") assert.equal(existsSync(dirname(replacedPath)), true);
      assert.equal(realpathSync(join(value.deploymentRoot, "current")), realpathSync(value.activeRoot));
    });
  }
});

test("cleanup never removes a replacement at an attempt-owned path", (t) => {
  let replacedPath;
  const value = fixture(t, {
    publicationRoots: false,
    runtimeOverrides: {
      afterDirectoryRegistered(point, path) {
        if (point !== "temporary_namespace") return;
        rmSync(path, { recursive: true, force: false });
        mkdirSync(path, { mode: 0o700 });
        write(join(path, "replacement-sentinel"), "preserve\n");
        replacedPath = path;
        throw new Error("injected replacement race");
      }
    }
  });

  let observed;
  assert.throws(
    () => stageProductionCandidate({ ...value.options, apply: true }),
    (error) => {
      observed = error;
      return error instanceof ProductionStageControllerError && error.condition === "cleanup_failed";
    }
  );
  assert.equal(observed.attentionRequired, true);
  assert.equal(readFileSync(join(replacedPath, "replacement-sentinel"), "utf8"), "preserve\n");
  assert.equal(realpathSync(join(value.deploymentRoot, "current")), realpathSync(value.activeRoot));
});

test("cleanup never removes a replacement below an attempt-owned path", (t) => {
  let replacedPath;
  const value = fixture(t, {
    publicationRoots: false,
    runtimeOverrides: {
      afterDirectoryRegistered(point, path) {
        if (point !== "temporary_child") return;
        rmSync(path, { recursive: true, force: false });
        mkdirSync(path, { mode: 0o700 });
        write(join(path, "replacement-sentinel"), "preserve\n");
        replacedPath = path;
        throw new Error("injected child replacement race");
      }
    }
  });

  let observed;
  assert.throws(
    () => stageProductionCandidate({ ...value.options, apply: true }),
    (error) => {
      observed = error;
      return error instanceof ProductionStageControllerError && error.condition === "cleanup_failed";
    }
  );
  assert.equal(observed.attentionRequired, true);
  assert.equal(readFileSync(join(replacedPath, "replacement-sentinel"), "utf8"), "preserve\n");
  assert.equal(realpathSync(join(value.deploymentRoot, "current")), realpathSync(value.activeRoot));
});

test("Linux cleanup closes every held directory after a descendant replacement", async (t) => {
  if (process.platform !== "linux") {
    t.skip("directory custody descriptors are a Linux production boundary");
    return;
  }
  for (const targetChild of [1, 2, 3]) {
    await t.test(`temporary child ${targetChild}`, (t) => {
      const registered = [];
      const closed = [];
      let childCount = 0;
      let replacedPath;
      const value = fixture(t, {
        publicationRoots: false,
        runtimeOverrides: {
          afterDirectoryRegistered(point, path) {
            registered.push(path);
            if (point !== "temporary_child" || ++childCount !== targetChild) return;
            rmSync(path, { recursive: true, force: false });
            mkdirSync(path, { mode: 0o700 });
            write(join(path, "replacement-sentinel"), "preserve\n");
            replacedPath = path;
            throw new Error("injected Linux inode-reuse race");
          },
          afterDirectoryCustodyClosed(_point, path) {
            closed.push(path);
          }
        }
      });

      assert.throws(
        () => stageProductionCandidate({ ...value.options, apply: true }),
        (error) => error instanceof ProductionStageControllerError
          && error.condition === "cleanup_failed"
          && error.attentionRequired === true
      );
      assert.equal(readFileSync(join(replacedPath, "replacement-sentinel"), "utf8"), "preserve\n");
      assert.deepEqual([...new Set(closed)].sort(), [...new Set(registered)].sort());
      assert.equal(realpathSync(join(value.deploymentRoot, "current")), realpathSync(value.activeRoot));
    });
  }
});

test("CLI emits one safe JSON error envelope and cannot enable stage without apply", () => {
  let stdout = "";
  let stderr = "";
  const exitCode = runProductionStageControllerCli({
    argv: ["--mode", "stage"],
    stdout: { write: (value) => { stdout += value; } },
    stderr: { write: (value) => { stderr += value; } }
  });
  assert.equal(exitCode, 1);
  assert.equal(stdout, "");
  const report = JSON.parse(stderr);
  assert.deepEqual(Object.keys(report).sort(), ["condition", "mode", "schemaVersion", "state", "type"]);
  assert.equal(report.type, PRODUCTION_STAGE_CONTROLLER_TYPE);
  assert.equal(report.mode, "stage");
  assert.equal(report.condition, "apply_confirmation_required");
  assert.equal(stderr.includes("/opt/"), false);

  stdout = "";
  stderr = "";
  const verifyExit = runProductionStageControllerCli({
    argv: ["--mode", "verify", "--apply"],
    stdout: { write: (value) => { stdout += value; } },
    stderr: { write: (value) => { stderr += value; } }
  });
  assert.equal(verifyExit, 1);
  assert.equal(stdout, "");
  const verifyReport = JSON.parse(stderr);
  assert.deepEqual(verifyReport, {
    schemaVersion: "1",
    type: PRODUCTION_STAGE_CONTROLLER_TYPE,
    mode: "verify",
    state: "blocked",
    condition: "invalid_input"
  });
});
