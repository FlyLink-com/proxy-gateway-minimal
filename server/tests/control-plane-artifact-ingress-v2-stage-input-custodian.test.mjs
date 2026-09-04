import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  existsSync,
  linkSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { lstat as lstatAsync } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import {
  ArtifactIngressV2StageInputCustodyError,
  createArtifactIngressV2StageInputCustodianTestRuntime,
  custodyArtifactIngressV2StageInput,
  runArtifactIngressV2StageInputCustodianCli
} from "../../scripts/control-plane-artifact-ingress-v2-stage-input-custodian.mjs";
import {
  buildIngressV2Header,
  safeIngressV2Receipt
} from "../../scripts/control-plane-artifact-ingress-v2-contract.mjs";
import {
  createProductionStageControllerTestRuntime,
  preflightProductionCandidateStage
} from "../../scripts/control-plane-production-stage-controller-lib.mjs";

const NOW = "2026-09-03T06:00:00.000Z";
const EXPIRES_AT = "2026-09-04T05:00:00.000Z";
const SOURCE_COMMIT = "a".repeat(40);
const RELEASE = "ci-20260903";
const PACKET_ID = "11111111-1111-4111-8111-111111111111";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

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

function zip(entries, comment) {
  const localRecords = [];
  const centralRecords = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const bytes = Buffer.from(entry.bytes);
    const crc = crc32(bytes);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(bytes.length, 18);
    local.writeUInt32LE(bytes.length, 22);
    local.writeUInt16LE(name.length, 26);
    localRecords.push(local, name, bytes);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE((3 << 8) | 20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(bytes.length, 20);
    central.writeUInt32LE(bytes.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE((0o100644 << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    centralRecords.push(central, name);
    offset += local.length + name.length + bytes.length;
  }
  const centralBytes = Buffer.concat(centralRecords);
  const commentBytes = Buffer.from(comment, "ascii");
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBytes.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(commentBytes.length, 20);
  return Buffer.concat([...localRecords, centralBytes, end, commentBytes]);
}

function nativeCustodyBundle() {
  return {
    schemaVersion: "1",
    type: "control_plane_welcome_coins_native_custody_bundle",
    buildProfile: "hardened-linux-x86_64-gcc-v2",
    receipt: { path: "node_modules/.gccgw-native/welcome-coins-native-build.json", sha256: "5".repeat(64), sizeBytes: 1, mode: "0644" },
    outerWrapper: { path: "node_modules/.gccgw-native/welcome-coins-activation-outer-wrapper", sha256: "8".repeat(64), sizeBytes: 1, mode: "0755", kind: "static-pie" },
    outerPostExecBootstrap: { path: "node_modules/.gccgw-native/welcome-coins-outer-post-exec-bootstrap.so", sha256: "9".repeat(64), sizeBytes: 1, mode: "0644", kind: "shared-object" },
    launcher: { path: "node_modules/.gccgw-native/welcome-coins-custody-launcher", sha256: "6".repeat(64), sizeBytes: 1, mode: "0755", kind: "pie" },
    postExecBootstrap: { path: "node_modules/.gccgw-native/welcome-coins-post-exec-bootstrap.so", sha256: "7".repeat(64), sizeBytes: 1, mode: "0644", kind: "shared-object" }
  };
}

function makeFixture(t, {
  faultPhase = null,
  nowValues = null,
  swapCustodyRootAtClaim = false,
  replacePublishedDestinationAtExpiry = false
} = {}) {
  const root = mkdtempSync(join(tmpdir(), "gccgw-ingress-v2-custody-"));
  const quarantineRoot = join(root, "quarantine");
  const ingressReceiptRoot = join(root, "ingress-receipts");
  const stageInputRoot = join(root, "stage-input");
  const custodyReceiptRoot = join(root, "custody-receipts");
  const candidate = join(quarantineRoot, PACKET_ID);
  for (const path of [quarantineRoot, ingressReceiptRoot, stageInputRoot, custodyReceiptRoot, candidate]) {
    mkdirSync(path, { mode: 0o700 });
  }
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const packageBytes = Buffer.from('{"name":"candidate","version":"1.0.0"}\n');
  const packageLockBytes = Buffer.from('{"name":"candidate","lockfileVersion":3,"packages":{}}\n');
  const sourceArchiveName = `proxy-gateway-${RELEASE}.zip`;
  const sourceBytes = zip([
    { name: "package.json", bytes: packageBytes },
    { name: "package-lock.json", bytes: packageLockBytes },
    { name: "scripts/control-plane-db-snapshot-gate-lib.mjs", bytes: "export const safeImport = true;\n" },
    { name: "server/index.js", bytes: "export const staged = true;\n" }
  ], SOURCE_COMMIT);
  const dependencyBytes = Buffer.from("dependency archive fixture\n");
  const fileBytes = new Map();
  fileBytes.set("artifact.json", Buffer.from(`${JSON.stringify({
    schemaVersion: "1",
    releaseUnit: "control-plane-app",
    sourceCommit: SOURCE_COMMIT,
    release: RELEASE,
    artifact: {
      fileName: sourceArchiveName,
      sha256: sha256(sourceBytes),
      sizeBytes: sourceBytes.length,
      createdAt: NOW
    }
  }, null, 2)}\n`));
  fileBytes.set(sourceArchiveName, sourceBytes);
  fileBytes.set(`${sourceArchiveName}.sha256`, Buffer.from(`${sha256(sourceBytes)}  .release-artifacts/${sourceArchiveName}\n`));
  fileBytes.set("dependency-artifact.json", Buffer.from(`${JSON.stringify({
    schemaVersion: "4",
    type: "control_plane_dependency_artifact",
    state: "verified",
    releaseUnit: "control-plane-app",
    sourceCommit: SOURCE_COMMIT,
    artifactRelease: RELEASE,
    package: { sha256: sha256(packageBytes), sizeBytes: packageBytes.length },
    packageLock: { sha256: sha256(packageLockBytes), sizeBytes: packageLockBytes.length },
    archive: { fileName: "node-modules.tar", sha256: sha256(dependencyBytes), sizeBytes: dependencyBytes.length },
    runtime: {
      platform: "linux", arch: "x64", libc: "glibc-2.39", nodeVersion: "v22.23.1",
      nodeAbi: "127", npmVersion: "v10.9.2", betterSqlite3Version: "12.10.0"
    },
    smoke: { betterSqlite3Memory: true, snapshotImport: true },
    tree: { sha256: "4".repeat(64), entryCount: 4, totalBytes: 128, hardlinksBroken: true, symlinksInternal: true },
    nativeCustody: nativeCustodyBundle(),
    provenance: { builder: "github-actions", workflow: "control-plane-dependency-artifact.yml" }
  }, null, 2)}\n`));
  fileBytes.set("node-modules.tar", dependencyBytes);
  fileBytes.set("release-label.txt", Buffer.from(`${RELEASE}\n`));
  for (const [name, bytes] of fileBytes) writeFileSync(join(candidate, name), bytes);

  const header = buildIngressV2Header({
    packetId: PACKET_ID,
    sourceCommit: SOURCE_COMMIT,
    issuedAt: NOW,
    expiresAt: EXPIRES_AT,
    entries: [...fileBytes].map(([name, bytes]) => ({ name, sizeBytes: bytes.length, sha256: sha256(bytes) }))
  });
  const headerSha256 = sha256(Buffer.from(JSON.stringify(header)));
  const ingressReceipt = safeIngressV2Receipt({ candidateId: PACKET_ID, header, acceptedAt: NOW });
  const ingressReceiptBytes = Buffer.from(`${JSON.stringify(ingressReceipt)}\n`);
  const replayClaimBytes = Buffer.from(`${JSON.stringify({
    schemaVersion: "1",
    type: "control_plane_artifact_ingress_replay_claim",
    packetId: PACKET_ID,
    sourceCommit: SOURCE_COMMIT,
    issuedAt: NOW,
    claimedAt: NOW,
    expiresAt: EXPIRES_AT,
    headerSha256
  })}\n`);
  const ingressReceiptPath = join(ingressReceiptRoot, `${PACKET_ID}.json`);
  const replayClaimPath = join(ingressReceiptRoot, `.replay-${PACKET_ID}.json`);
  writeFileSync(ingressReceiptPath, ingressReceiptBytes);
  writeFileSync(replayClaimPath, replayClaimBytes);

  const owners = new Map();
  const modes = new Map();
  const custodyTrace = [];
  const anchorTrace = [];
  const renameTrace = [];
  const directoryHandles = [];
  const key = (path) => resolve(path);
  const mark = (path, uid, gid, fileMode) => {
    owners.set(key(path), { uid, gid });
    modes.set(key(path), fileMode);
  };
  for (const path of [quarantineRoot, ingressReceiptRoot, stageInputRoot, custodyReceiptRoot]) mark(path, 0, 0, 0o700);
  mark(candidate, 1234, 1234, 0o700);
  for (const name of fileBytes.keys()) mark(join(candidate, name), 1234, 1234, 0o600);
  mark(ingressReceiptPath, 1234, 1234, 0o600);
  mark(replayClaimPath, 1234, 1234, 0o600);
  const moveMappings = (source, destination) => {
    for (const [path, value] of [...owners]) {
      if (path === key(source) || path.startsWith(`${key(source)}${process.platform === "win32" ? "\\" : "/"}`)) {
        const moved = key(destination) + path.slice(key(source).length);
        owners.set(moved, value);
        owners.delete(path);
      }
    }
    for (const [path, value] of [...modes]) {
      if (path === key(source) || path.startsWith(`${key(source)}${process.platform === "win32" ? "\\" : "/"}`)) {
        const moved = key(destination) + path.slice(key(source).length);
        modes.set(moved, value);
        modes.delete(path);
      }
    }
  };
  const clock = nowValues ? [...nowValues] : null;
  let clockReads = 0;
  const displacedDestination = join(root, "displaced-stage-input");
  const swappedCustodyRoot = join(root, "held-custody-receipts");
  let temporaryIndex = 0;
  const runtime = createArtifactIngressV2StageInputCustodianTestRuntime({
    now: () => {
      const value = clock?.[clockReads] ?? NOW;
      clockReads += 1;
      if (replacePublishedDestinationAtExpiry && clockReads === 3) {
        const destination = join(stageInputRoot, PACKET_ID);
        renameSync(destination, displacedDestination);
        mkdirSync(destination);
        writeFileSync(join(destination, "competitor-sentinel"), "preserve\n");
      }
      return value;
    },
    openDirectory: async (path) => {
      const handle = {
        fd: -1,
        anchor: path,
        stat() { return lstatAsync(handle.anchor); },
        async sync() {},
        async close() {}
      };
      directoryHandles.push(handle);
      return handle;
    },
    anchoredChild: (directory, name) => {
      anchorTrace.push({ root: directory.path, name });
      return join(directory.handle.anchor, name);
    },
    anchoredDirectory: (directory) => directory.handle.anchor,
    ownerOf: (path, metadata) => owners.get(key(path)) ?? { uid: metadata.uid, gid: metadata.gid },
    modeOf: (path, metadata) => modes.get(key(path)) ?? (metadata.mode & 0o777),
    setDirectoryCustody: async (record) => {
      mark(record.path, 0, 0, 0o700);
      custodyTrace.push({ kind: "directory", path: record.path, uid: 0, gid: 0, mode: 0o700 });
    },
    setFileCustody: async (record) => {
      mark(record.path, 0, 0, 0o600);
      custodyTrace.push({ kind: "file", path: record.path, uid: 0, gid: 0, mode: 0o600 });
    },
    renameNoReplace: async (request) => {
      const { source, destination } = request;
      renameTrace.push(request);
      if (existsSync(destination)) return false;
      renameSync(source, destination);
      moveMappings(source, destination);
      return true;
    },
    temporaryId: () => `fixture-${temporaryIndex += 1}`,
    faultAt: async (phase) => {
      if (swapCustodyRootAtClaim && phase === "claim_persisted") {
        renameSync(custodyReceiptRoot, swappedCustodyRoot);
        moveMappings(custodyReceiptRoot, swappedCustodyRoot);
        for (const handle of directoryHandles) {
          if (handle.anchor === custodyReceiptRoot) handle.anchor = swappedCustodyRoot;
        }
        mkdirSync(custodyReceiptRoot);
        mark(custodyReceiptRoot, 0, 0, 0o700);
      }
      if (phase === faultPhase) throw new Error(`fault:${phase}`);
    }
  });
  const options = {
    apply: true,
    quarantineRoot,
    ingressReceiptRoot,
    stageInputRoot,
    custodyReceiptRoot,
    packetId: PACKET_ID,
    expectedSourceCommit: SOURCE_COMMIT,
    expectedExpiresAt: EXPIRES_AT,
    expectedHeaderSha256: headerSha256,
    expectedReceiptSha256: sha256(ingressReceiptBytes),
    expectedReplayClaimSha256: sha256(replayClaimBytes),
    expectedReplayClaimSizeBytes: replayClaimBytes.length,
    expectedArtifactManifestSha256: header.entries[0].sha256,
    expectedSourceArtifactSha256: header.entries[1].sha256,
    expectedDependencyManifestSha256: header.entries[3].sha256,
    expectedDependencyArchiveSha256: header.entries[4].sha256,
    runtime
  };
  return {
    root, roots: { quarantineRoot, ingressReceiptRoot, stageInputRoot, custodyReceiptRoot }, candidate,
    header, fileBytes, options, runtime, custodyTrace, anchorTrace, renameTrace, ingressReceiptPath, replayClaimPath,
    swappedCustodyRoot, displacedDestination
  };
}

function condition(code) {
  return (error) => error instanceof ArtifactIngressV2StageInputCustodyError && error.code === code;
}

function cliArguments(value) {
  return [
    "--mode", "import", "--apply",
    "--quarantine-root", value.quarantineRoot,
    "--ingress-receipt-root", value.ingressReceiptRoot,
    "--stage-input-root", value.stageInputRoot,
    "--custody-receipt-root", value.custodyReceiptRoot,
    "--packet-id", value.packetId,
    "--expected-source-commit", value.expectedSourceCommit,
    "--expected-expires-at", value.expectedExpiresAt,
    "--expected-header-sha256", value.expectedHeaderSha256,
    "--expected-receipt-sha256", value.expectedReceiptSha256,
    "--expected-replay-claim-sha256", value.expectedReplayClaimSha256,
    "--expected-replay-claim-size-bytes", String(value.expectedReplayClaimSizeBytes),
    "--expected-artifact-manifest-sha256", value.expectedArtifactManifestSha256,
    "--expected-source-artifact-sha256", value.expectedSourceArtifactSha256,
    "--expected-dependency-manifest-sha256", value.expectedDependencyManifestSha256,
    "--expected-dependency-archive-sha256", value.expectedDependencyArchiveSha256
  ];
}

test("root-local custody copies the exact six files and yields a stage-controller-compatible layout", async (t) => {
  const value = makeFixture(t);
  const sourceBefore = new Map([...value.fileBytes.keys()].map((name) => [name, readFileSync(join(value.candidate, name))]));
  const receipt = await custodyArtifactIngressV2StageInput(value.options);
  const destination = join(value.roots.stageInputRoot, PACKET_ID);
  assert.equal(receipt.state, "stage_input_custodied");
  assert.equal(receipt.replayClaimSha256, value.options.expectedReplayClaimSha256);
  assert.equal(receipt.replayClaimSizeBytes, value.options.expectedReplayClaimSizeBytes);
  assert.deepEqual(readdirSync(destination).sort(), [...value.fileBytes.keys()].sort());
  for (const [name, bytes] of sourceBefore) {
    assert.deepEqual(readFileSync(join(destination, name)), bytes);
    assert.deepEqual(readFileSync(join(value.candidate, name)), bytes);
  }
  assert.equal(existsSync(value.ingressReceiptPath), true);
  assert.equal(existsSync(value.replayClaimPath), true);
  assert.equal(existsSync(join(value.roots.custodyReceiptRoot, `${PACKET_ID}.json`)), true);
  assert.equal(existsSync(join(value.roots.custodyReceiptRoot, `.claim-${PACKET_ID}.json`)), true);
  const custodyClaim = JSON.parse(readFileSync(
    join(value.roots.custodyReceiptRoot, `.claim-${PACKET_ID}.json`),
    "utf8"
  ));
  assert.equal(custodyClaim.replayClaimSha256, value.options.expectedReplayClaimSha256);
  assert.equal(custodyClaim.replayClaimSizeBytes, value.options.expectedReplayClaimSizeBytes);
  assert.equal(value.custodyTrace.filter(({ kind }) => kind === "directory").length, 1);
  assert.equal(value.custodyTrace.filter(({ kind }) => kind === "file").length, 8);
  assert.equal(value.anchorTrace.some(({ root, name }) => root === value.roots.stageInputRoot
    && name.startsWith(`.importing-${PACKET_ID}-`)), true);
  assert.equal(value.anchorTrace.some(({ root, name }) => root === value.roots.stageInputRoot
    && name === PACKET_ID), true);
  assert.equal(value.anchorTrace.some(({ root, name }) => root === value.roots.custodyReceiptRoot
    && name === `.claim-${PACKET_ID}.json`), true);
  assert.equal(value.anchorTrace.some(({ root, name }) => root === value.roots.custodyReceiptRoot
    && name.startsWith(`.receipt-${PACKET_ID}-`)), true);
  assert.equal(value.anchorTrace.some(({ root, name }) => root === value.roots.custodyReceiptRoot
    && name === `${PACKET_ID}.json`), true);
  assert.equal(value.renameTrace.length, 2);
  assert.equal(value.renameTrace.every(({ sourceRoot, destinationRoot }) => sourceRoot === destinationRoot
    && [value.roots.stageInputRoot, value.roots.custodyReceiptRoot].includes(sourceRoot?.path)), true);

  const deploymentRoot = join(value.root, "deployment");
  const releases = join(deploymentRoot, "releases");
  const currentRelease = "control-plane-current";
  mkdirSync(join(releases, currentRelease), { recursive: true });
  symlinkSync(join(releases, currentRelease), join(deploymentRoot, "current"), process.platform === "win32" ? "junction" : "dir");
  const stage = preflightProductionCandidateStage({
    inputDirectory: destination,
    candidateRelease: "candidate-from-custody",
    expectedCurrentRelease: currentRelease,
    expectedSourceCommit: SOURCE_COMMIT,
    expectedArtifactRelease: RELEASE,
    expectedArtifactManifestSha256: value.header.entries[0].sha256,
    expectedSourceArtifactSha256: value.header.entries[1].sha256,
    expectedDependencyManifestSha256: value.header.entries[3].sha256,
    expectedDependencyArchiveSha256: value.header.entries[4].sha256,
    runtime: createProductionStageControllerTestRuntime({ root: deploymentRoot, enforceModes: false })
  });
  assert.equal(stage.state, "ready");
  assert.equal(stage.inputFileCount, 6);
  assert.equal(value.custodyTrace.every(({ uid, gid }) => uid === 0 && gid === 0), true,
    "the cross-platform trace is not a substitute for the required target-Linux root synthetic");
});

test("custody binds the exact replay-claim digest and size before publishing", async (t) => {
  const exact = makeFixture(t);
  const exactClaimBytes = readFileSync(exact.replayClaimPath);
  const exactReceipt = await custodyArtifactIngressV2StageInput({
    ...exact.options,
    expectedReplayClaimSha256: sha256(exactClaimBytes),
    expectedReplayClaimSizeBytes: exactClaimBytes.length
  });
  assert.equal(exactReceipt.state, "stage_input_custodied");

  const drifted = makeFixture(t);
  const originalClaimBytes = readFileSync(drifted.replayClaimPath);
  const claim = JSON.parse(originalClaimBytes.toString("utf8"));
  const driftedClaimBytes = Buffer.from(`${JSON.stringify({
    type: claim.type,
    schemaVersion: claim.schemaVersion,
    packetId: claim.packetId,
    sourceCommit: claim.sourceCommit,
    issuedAt: claim.issuedAt,
    claimedAt: claim.claimedAt,
    expiresAt: claim.expiresAt,
    headerSha256: claim.headerSha256
  })}\n`);
  assert.equal(driftedClaimBytes.length, originalClaimBytes.length,
    "the negative probe must preserve size and remain semantically valid");
  assert.notEqual(sha256(driftedClaimBytes), sha256(originalClaimBytes));
  writeFileSync(drifted.replayClaimPath, driftedClaimBytes);
  await assert.rejects(
    () => custodyArtifactIngressV2StageInput({
      ...drifted.options,
      expectedReplayClaimSha256: sha256(originalClaimBytes),
      expectedReplayClaimSizeBytes: originalClaimBytes.length
    }),
    condition("artifact_ingress_stage_custody_claim_mismatch")
  );
  assert.deepEqual(readdirSync(drifted.roots.stageInputRoot), []);
  assert.deepEqual(readdirSync(drifted.roots.custodyReceiptRoot), []);

  const wrongSize = makeFixture(t);
  await assert.rejects(
    () => custodyArtifactIngressV2StageInput({
      ...wrongSize.options,
      expectedReplayClaimSizeBytes: wrongSize.options.expectedReplayClaimSizeBytes - 1
    }),
    condition("artifact_ingress_stage_custody_claim_mismatch")
  );
  assert.deepEqual(readdirSync(wrongSize.roots.stageInputRoot), []);
  assert.deepEqual(readdirSync(wrongSize.roots.custodyReceiptRoot), []);
});

test("custody rejects Gate, replay-claim, and source inode drift without publishing", async (t) => {
  const noApply = makeFixture(t);
  await assert.rejects(
    () => custodyArtifactIngressV2StageInput({ ...noApply.options, apply: false }),
    condition("artifact_ingress_stage_custody_apply_confirmation_required")
  );
  assert.deepEqual(readdirSync(noApply.roots.stageInputRoot), []);

  const overlapping = makeFixture(t);
  for (const stageInputRoot of [
    resolve("/opt/proxy-gateway-minimal-candidate/stage-input"),
    resolve("/opt")
  ]) {
    await assert.rejects(
      () => custodyArtifactIngressV2StageInput({ ...overlapping.options, stageInputRoot }),
      condition("artifact_ingress_stage_custody_root_invalid")
    );
  }

  const wrongGate = makeFixture(t);
  await assert.rejects(
    () => custodyArtifactIngressV2StageInput({ ...wrongGate.options, expectedReceiptSha256: "f".repeat(64) }),
    condition("artifact_ingress_stage_custody_receipt_mismatch")
  );
  assert.deepEqual(readdirSync(wrongGate.roots.stageInputRoot), []);
  assert.deepEqual(readdirSync(wrongGate.roots.custodyReceiptRoot), []);

  const badClaim = makeFixture(t);
  const claim = JSON.parse(readFileSync(badClaim.replayClaimPath, "utf8"));
  const badClaimBytes = Buffer.from(`${JSON.stringify({ ...claim, headerSha256: "e".repeat(64) })}\n`);
  writeFileSync(badClaim.replayClaimPath, badClaimBytes);
  await assert.rejects(
    () => custodyArtifactIngressV2StageInput({
      ...badClaim.options,
      expectedReplayClaimSha256: sha256(badClaimBytes),
      expectedReplayClaimSizeBytes: badClaimBytes.length
    }),
    condition("artifact_ingress_stage_custody_claim_invalid")
  );
  assert.deepEqual(readdirSync(badClaim.roots.stageInputRoot), []);

  const linked = makeFixture(t);
  const sourceArchive = join(linked.candidate, linked.header.entries[1].name);
  const secondLink = join(linked.root, "source-archive-hardlink");
  linkSync(sourceArchive, secondLink);
  await assert.rejects(
    () => custodyArtifactIngressV2StageInput(linked.options),
    condition("artifact_ingress_stage_custody_source_invalid")
  );
  assert.deepEqual(readdirSync(linked.roots.stageInputRoot), []);
});

test("post-publish failure removes only the owned destination and retains permanent claims", async (t) => {
  const value = makeFixture(t, { faultPhase: "after_publish" });
  await assert.rejects(
    () => custodyArtifactIngressV2StageInput(value.options),
    condition("artifact_ingress_stage_custody_incomplete")
  );
  assert.equal(existsSync(join(value.roots.stageInputRoot, PACKET_ID)), false);
  assert.equal(existsSync(join(value.roots.custodyReceiptRoot, `.claim-${PACKET_ID}.json`)), true);
  assert.equal(existsSync(join(value.roots.custodyReceiptRoot, `${PACKET_ID}.json`)), false);
  assert.equal(existsSync(value.replayClaimPath), true);
  assert.equal(existsSync(value.candidate), true);
});

test("post-publish expiry removes the still-owned destination without a terminal receipt", async (t) => {
  const value = makeFixture(t, { nowValues: [NOW, NOW, EXPIRES_AT] });
  await assert.rejects(
    () => custodyArtifactIngressV2StageInput(value.options),
    (error) => error instanceof ArtifactIngressV2StageInputCustodyError
  );
  assert.equal(existsSync(join(value.roots.stageInputRoot, PACKET_ID)), false);
  assert.equal(existsSync(join(value.roots.custodyReceiptRoot, `.claim-${PACKET_ID}.json`)), true);
  assert.equal(existsSync(join(value.roots.custodyReceiptRoot, `${PACKET_ID}.json`)), false);
  assert.equal(existsSync(value.replayClaimPath), true);
});

test("post-publish expiry preserves a replacement destination with a different inode", async (t) => {
  const value = makeFixture(t, {
    nowValues: [NOW, NOW, EXPIRES_AT],
    replacePublishedDestinationAtExpiry: true
  });
  await assert.rejects(
    () => custodyArtifactIngressV2StageInput(value.options),
    (error) => error instanceof ArtifactIngressV2StageInputCustodyError
  );
  assert.equal(readFileSync(join(value.roots.stageInputRoot, PACKET_ID, "competitor-sentinel"), "utf8"), "preserve\n");
  assert.equal(existsSync(value.displacedDestination), true);
  assert.equal(existsSync(join(value.roots.custodyReceiptRoot, `.claim-${PACKET_ID}.json`)), true);
  assert.equal(existsSync(join(value.roots.custodyReceiptRoot, `${PACKET_ID}.json`)), false);
});

test("custody fails closed when the lexical custody root is swapped after the claim", {
  skip: process.platform === "win32" ? "requires Linux directory replacement semantics" : false
}, async (t) => {
  const value = makeFixture(t, { swapCustodyRootAtClaim: true });
  await assert.rejects(
    () => custodyArtifactIngressV2StageInput(value.options),
    condition("artifact_ingress_stage_custody_root_changed")
  );
  assert.deepEqual(readdirSync(value.roots.custodyReceiptRoot), []);
  assert.equal(existsSync(join(value.swappedCustodyRoot, `.claim-${PACKET_ID}.json`)), true);
  assert.deepEqual(readdirSync(value.roots.stageInputRoot), []);
  assert.equal(existsSync(value.replayClaimPath), true);
});

test("deterministic stage temporary collision preserves the pre-existing sentinel", async (t) => {
  const value = makeFixture(t);
  const collision = join(value.roots.stageInputRoot, `.importing-${PACKET_ID}-fixture-1`);
  mkdirSync(collision);
  writeFileSync(join(collision, "sentinel"), "preserve\n");
  await assert.rejects(
    () => custodyArtifactIngressV2StageInput(value.options),
    (error) => error instanceof ArtifactIngressV2StageInputCustodyError
  );
  assert.equal(readFileSync(join(collision, "sentinel"), "utf8"), "preserve\n");
  assert.equal(existsSync(join(value.roots.custodyReceiptRoot, `${PACKET_ID}.json`)), false);
});

test("deterministic terminal temporary collision preserves the sentinel and removes only this publish", async (t) => {
  const value = makeFixture(t);
  const collision = join(value.roots.custodyReceiptRoot, `.receipt-${PACKET_ID}-fixture-2`);
  writeFileSync(collision, "preserve\n");
  await assert.rejects(
    () => custodyArtifactIngressV2StageInput(value.options),
    (error) => error instanceof ArtifactIngressV2StageInputCustodyError
  );
  assert.equal(readFileSync(collision, "utf8"), "preserve\n");
  assert.equal(existsSync(join(value.roots.stageInputRoot, PACKET_ID)), false);
  assert.equal(existsSync(join(value.roots.custodyReceiptRoot, `.claim-${PACKET_ID}.json`)), true);
  assert.equal(existsSync(join(value.roots.custodyReceiptRoot, `${PACKET_ID}.json`)), false);
});

test("CLI accepts only the exact Gate-bound root and evidence argument order", async (t) => {
  const invalid = makeFixture(t);
  let invalidError = "";
  const reordered = cliArguments(invalid.options);
  [reordered[0], reordered[2]] = [reordered[2], reordered[0]];
  assert.equal(await runArtifactIngressV2StageInputCustodianCli({
    argv: reordered,
    runtime: invalid.runtime,
    stdout: { write() {} },
    stderr: { write(bytes) { invalidError += bytes; } }
  }), 1);
  assert.equal(invalidError, "artifact_ingress_stage_custody_arguments_invalid\n");
  assert.deepEqual(readdirSync(invalid.roots.stageInputRoot), []);

  const missing = makeFixture(t);
  let missingError = "";
  const missingReplaySize = cliArguments(missing.options);
  const replaySizeIndex = missingReplaySize.indexOf("--expected-replay-claim-size-bytes");
  missingReplaySize.splice(replaySizeIndex, 2);
  assert.equal(await runArtifactIngressV2StageInputCustodianCli({
    argv: missingReplaySize,
    runtime: missing.runtime,
    stdout: { write() {} },
    stderr: { write(bytes) { missingError += bytes; } }
  }), 1);
  assert.equal(missingError, "artifact_ingress_stage_custody_arguments_invalid\n");
  assert.deepEqual(readdirSync(missing.roots.stageInputRoot), []);

  const valid = makeFixture(t);
  let output = "";
  let error = "";
  assert.equal(await runArtifactIngressV2StageInputCustodianCli({
    argv: cliArguments(valid.options),
    runtime: valid.runtime,
    stdout: { write(bytes) { output += bytes; } },
    stderr: { write(bytes) { error += bytes; } }
  }), 0);
  assert.equal(error, "");
  assert.equal(JSON.parse(output).state, "stage_input_custodied");
});

test("receiver and GitHub workflow never invoke the root-local custodian", () => {
  for (const path of [
    new URL("../../scripts/control-plane-artifact-ingress-receiver.mjs", import.meta.url),
    new URL("../../.github/workflows/control-plane-artifact-ingress-v2.yml", import.meta.url)
  ]) {
    assert.doesNotMatch(
      readFileSync(path, "utf8"),
      /control-plane-artifact-ingress-v2-stage-input-custodian/u
    );
  }
});
