import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Writable } from "node:stream";
import test from "node:test";

import {
  ArtifactIngressV2PacketError,
  buildCanonicalIngressV2PacketFromArtifactDirectories,
  runArtifactIngressV2PacketBuilderCli
} from "../../scripts/control-plane-artifact-ingress-v2-packet-builder.mjs";
import {
  runCanonicalIngressV2DeliveryCli,
  writeCanonicalIngressV2Delivery
} from "../../scripts/control-plane-artifact-ingress-v2-delivery-cli.mjs";
import { receiveArtifactIngress } from "../../scripts/control-plane-artifact-ingress-receiver.mjs";
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
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
    }
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
    receipt: {
      path: "node_modules/.gccgw-native/welcome-coins-native-build.json",
      sha256: "5".repeat(64), sizeBytes: 1, mode: "0644"
    },
    outerWrapper: {
      path: "node_modules/.gccgw-native/welcome-coins-activation-outer-wrapper",
      sha256: "8".repeat(64), sizeBytes: 1, mode: "0755", kind: "static-pie"
    },
    outerPostExecBootstrap: {
      path: "node_modules/.gccgw-native/welcome-coins-outer-post-exec-bootstrap.so",
      sha256: "9".repeat(64), sizeBytes: 1, mode: "0644", kind: "shared-object"
    },
    launcher: {
      path: "node_modules/.gccgw-native/welcome-coins-custody-launcher",
      sha256: "6".repeat(64), sizeBytes: 1, mode: "0755", kind: "pie"
    },
    postExecBootstrap: {
      path: "node_modules/.gccgw-native/welcome-coins-post-exec-bootstrap.so",
      sha256: "7".repeat(64), sizeBytes: 1, mode: "0644", kind: "shared-object"
    }
  };
}

function fixture(t, {
  sourceCommit = SOURCE_COMMIT,
  dependencyCommit = SOURCE_COMMIT,
  sourceRelease = RELEASE,
  dependencyRelease = RELEASE
} = {}) {
  const root = mkdtempSync(join(tmpdir(), "gccgw-artifact-ingress-v2-packet-"));
  const sourceDirectory = join(root, "source");
  const dependencyDirectory = join(root, "dependency");
  mkdirSync(sourceDirectory);
  mkdirSync(dependencyDirectory);
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const sourceArchiveName = `proxy-gateway-${sourceRelease}.zip`;
  const sourceArchive = join(sourceDirectory, sourceArchiveName);
  const sourceChecksum = join(sourceDirectory, `${sourceArchiveName}.sha256`);
  const sourceManifest = join(sourceDirectory, "artifact.json");
  const dependencyArchive = join(dependencyDirectory, "node-modules.tar");
  const dependencyManifest = join(dependencyDirectory, "dependency-artifact.json");
  const releaseLabel = join(dependencyDirectory, "release-label.txt");
  const packageBytes = Buffer.from('{"name":"candidate","version":"1.0.0"}\n');
  const packageLockBytes = Buffer.from('{"name":"candidate","lockfileVersion":3,"packages":{}}\n');
  const sourceBytes = zip([
    { name: "package.json", bytes: packageBytes },
    { name: "package-lock.json", bytes: packageLockBytes },
    { name: "scripts/control-plane-db-snapshot-gate-lib.mjs", bytes: "export const safeImport = true;\n" },
    { name: "server/index.js", bytes: "export const staged = true;\n" }
  ], sourceCommit);
  const dependencyBytes = Buffer.from("dependency archive fixture\n");

  writeFileSync(sourceArchive, sourceBytes);
  writeFileSync(sourceChecksum, `${sha256(sourceBytes)}  .release-artifacts/${sourceArchiveName}\n`);
  writeFileSync(sourceManifest, `${JSON.stringify({
    schemaVersion: "1",
    releaseUnit: "control-plane-app",
    sourceCommit,
    release: sourceRelease,
    artifact: {
      fileName: sourceArchiveName,
      sha256: sha256(sourceBytes),
      sizeBytes: sourceBytes.length,
      createdAt: NOW
    }
  }, null, 2)}\n`);
  writeFileSync(dependencyArchive, dependencyBytes);
  writeFileSync(dependencyManifest, `${JSON.stringify({
    schemaVersion: "4",
    type: "control_plane_dependency_artifact",
    state: "verified",
    releaseUnit: "control-plane-app",
    sourceCommit: dependencyCommit,
    artifactRelease: dependencyRelease,
    package: { sha256: sha256(packageBytes), sizeBytes: packageBytes.length },
    packageLock: { sha256: sha256(packageLockBytes), sizeBytes: packageLockBytes.length },
    archive: {
      fileName: "node-modules.tar",
      sha256: sha256(dependencyBytes),
      sizeBytes: dependencyBytes.length
    },
    runtime: {
      platform: "linux", arch: "x64", libc: "glibc-2.39",
      nodeVersion: "v22.23.1", nodeAbi: "127", npmVersion: "v10.9.2",
      betterSqlite3Version: "12.10.0"
    },
    smoke: { betterSqlite3Memory: true, snapshotImport: true },
    tree: {
      sha256: "4".repeat(64), entryCount: 4, totalBytes: 128,
      hardlinksBroken: true, symlinksInternal: true
    },
    nativeCustody: nativeCustodyBundle(),
    provenance: {
      builder: "github-actions",
      workflow: "control-plane-dependency-artifact.yml"
    }
  }, null, 2)}\n`);
  writeFileSync(releaseLabel, `${dependencyRelease}\n`);

  return {
    root,
    sourceDirectory,
    dependencyDirectory,
    sourceArchive,
    sourceChecksum,
    sourceManifest,
    dependencyArchive,
    dependencyManifest,
    releaseLabel,
    sourceArchiveName
  };
}

function build(input, overrides = {}) {
  return buildCanonicalIngressV2PacketFromArtifactDirectories({
    sourceDirectory: input.sourceDirectory,
    dependencyDirectory: input.dependencyDirectory,
    packetId: PACKET_ID,
    expectedSourceCommit: SOURCE_COMMIT,
    issuedAt: NOW,
    expiresAt: EXPIRES_AT,
    ...overrides
  });
}

async function rejected(input, mutate, code) {
  mutate(input);
  await assert.rejects(
    () => build(input),
    (error) => error instanceof ArtifactIngressV2PacketError && error.code === code
  );
}

test("v2 packet builder preserves the exact six stage files and their manifest bindings", async (t) => {
  const input = fixture(t);
  const packet = await build(input);

  assert.deepEqual(packet.header.entries.map(({ name }) => name), [
    "artifact.json",
    input.sourceArchiveName,
    `${input.sourceArchiveName}.sha256`,
    "dependency-artifact.json",
    "node-modules.tar",
    "release-label.txt"
  ]);
  assert.deepEqual(Object.keys(packet.files), [
    "artifactManifest", "sourceArchive", "sourceChecksum",
    "dependencyManifest", "dependencyArchive", "releaseLabel"
  ]);
  assert.equal(packet.header.sourceCommit, SOURCE_COMMIT);
  assert.deepEqual(readdirSync(input.sourceDirectory).sort(), [
    "artifact.json", input.sourceArchiveName, `${input.sourceArchiveName}.sha256`
  ].sort());
  assert.deepEqual(readdirSync(input.dependencyDirectory).sort(), [
    "dependency-artifact.json", "node-modules.tar", "release-label.txt"
  ]);
});

test("v2 delivery round-trips to one receiver candidate with the stage-controller layout", async (t) => {
  const input = fixture(t);
  const chunks = [];
  const output = new Writable({
    write(chunk, _encoding, done) { chunks.push(Buffer.from(chunk)); done(); }
  });
  const header = await writeCanonicalIngressV2Delivery({
    output,
    sourceDirectory: input.sourceDirectory,
    dependencyDirectory: input.dependencyDirectory,
    packetId: PACKET_ID,
    sourceCommit: SOURCE_COMMIT,
    issuedAt: NOW,
    expiresAt: EXPIRES_AT
  });
  const quarantineRoot = join(input.root, "quarantine");
  const receiptRoot = join(input.root, "receipts");
  mkdirSync(quarantineRoot);
  mkdirSync(receiptRoot);
  const candidateId = "22222222-2222-4222-8222-222222222222";
  const receipt = await receiveArtifactIngress({
    input: chunks, quarantineRoot, receiptRoot, now: NOW, candidateId
  });

  assert.equal(header.schemaVersion, "2");
  assert.equal(receipt.schemaVersion, "2");
  assert.deepEqual(
    readdirSync(join(quarantineRoot, PACKET_ID)).sort(),
    header.entries.map(({ name }) => name).sort()
  );
  assert.equal(
    readFileSync(join(quarantineRoot, PACKET_ID, "release-label.txt"), "utf8"),
    `${RELEASE}\n`
  );

  const deploymentRoot = join(input.root, "deployment");
  const releases = join(deploymentRoot, "releases");
  const currentRelease = "control-plane-current";
  mkdirSync(join(releases, currentRelease), { recursive: true });
  symlinkSync(
    join(releases, currentRelease),
    join(deploymentRoot, "current"),
    process.platform === "win32" ? "junction" : "dir"
  );
  const stage = preflightProductionCandidateStage({
    inputDirectory: join(quarantineRoot, PACKET_ID),
    candidateRelease: "candidate-from-ingress-v2",
    expectedCurrentRelease: currentRelease,
    expectedSourceCommit: SOURCE_COMMIT,
    expectedArtifactRelease: RELEASE,
    expectedArtifactManifestSha256: header.entries[0].sha256,
    expectedSourceArtifactSha256: header.entries[1].sha256,
    expectedDependencyManifestSha256: header.entries[3].sha256,
    expectedDependencyArchiveSha256: header.entries[4].sha256,
    runtime: createProductionStageControllerTestRuntime({
      root: deploymentRoot,
      enforceModes: false
    })
  });
  assert.equal(stage.state, "ready");
  assert.equal(stage.mode, "preflight");
  assert.equal(stage.applied, false);
  assert.deepEqual(stage.binding, {
    artifactManifestSha256: header.entries[0].sha256,
    sourceArtifactSha256: header.entries[1].sha256,
    dependencyManifestSha256: header.entries[3].sha256,
    dependencyArchiveSha256: header.entries[4].sha256
  });
});

test("v2 builder rejects source and dependency commit or release drift", async (t) => {
  await assert.rejects(
    () => build(fixture(t, { dependencyCommit: "b".repeat(40) })),
    (error) => error.code === "artifact_ingress_v2_packet_source_binding_mismatch"
  );
  await assert.rejects(
    () => build(fixture(t, { dependencyRelease: "different-release" })),
    (error) => error.code === "artifact_ingress_v2_packet_release_binding_mismatch"
  );
});

test("v2 builder rejects tampered source, dependency, checksum, and release-label bytes", async (t) => {
  await rejected(
    fixture(t),
    (input) => writeFileSync(input.sourceArchive, "tampered source"),
    "artifact_ingress_v2_packet_source_artifact_mismatch"
  );
  await rejected(
    fixture(t),
    (input) => writeFileSync(input.dependencyArchive, "tampered dependency"),
    "artifact_ingress_v2_packet_dependency_archive_mismatch"
  );
  await rejected(
    fixture(t),
    (input) => writeFileSync(input.sourceChecksum, "0".repeat(64) + "  wrong\n"),
    "artifact_ingress_v2_packet_source_checksum_invalid"
  );
  await rejected(
    fixture(t),
    (input) => writeFileSync(input.releaseLabel, "wrong-release\n"),
    "artifact_ingress_v2_packet_release_binding_mismatch"
  );
});

test("v2 builder rejects missing, extra, and path-escaping artifact selections", async (t) => {
  await rejected(
    fixture(t),
    (input) => rmSync(input.sourceChecksum),
    "artifact_ingress_v2_packet_source_invalid"
  );
  await rejected(
    fixture(t),
    (input) => writeFileSync(join(input.dependencyDirectory, "extra"), "unexpected"),
    "artifact_ingress_v2_packet_dependency_invalid"
  );
  await rejected(fixture(t), (input) => {
    const manifest = JSON.parse(readFileSync(input.sourceManifest, "utf8"));
    manifest.artifact.fileName = "../node-modules.tar";
    writeFileSync(input.sourceManifest, JSON.stringify(manifest));
  }, "artifact_ingress_v2_packet_source_manifest_invalid");
});

test("v2 packet-builder CLI accepts only the exact non-mutating argument set", async (t) => {
  const input = fixture(t);
  let stdout = "";
  let stderr = "";
  const exitCode = await runArtifactIngressV2PacketBuilderCli({
    argv: [
      "--source-directory", input.sourceDirectory,
      "--dependency-directory", input.dependencyDirectory,
      "--packet-id", PACKET_ID,
      "--source-commit", SOURCE_COMMIT,
      "--issued-at", NOW,
      "--expires-at", EXPIRES_AT
    ],
    stdout: { write(value) { stdout += value; } },
    stderr: { write(value) { stderr += value; } }
  });
  assert.equal(exitCode, 0);
  assert.match(stdout, /^artifact_ingress_v2_packet_verified source_commit=/);
  assert.equal(stderr, "");

  let invalidError = "";
  const invalidExitCode = await runArtifactIngressV2PacketBuilderCli({
    argv: ["--source-directory", input.sourceDirectory],
    stdout: { write() {} },
    stderr: { write(value) { invalidError += value; } }
  });
  assert.equal(invalidExitCode, 1);
  assert.equal(invalidError, "artifact_ingress_v2_packet_cli_invalid\n");
});

test("v2 delivery CLI emits only binary packet bytes on stdout", async (t) => {
  const input = fixture(t);
  const chunks = [];
  const stdout = new Writable({
    write(chunk, _encoding, done) { chunks.push(Buffer.from(chunk)); done(); }
  });
  let stderr = "";
  const exitCode = await runCanonicalIngressV2DeliveryCli({
    argv: [
      "--source-directory", input.sourceDirectory,
      "--dependency-directory", input.dependencyDirectory,
      "--packet-id", PACKET_ID,
      "--source-commit", SOURCE_COMMIT,
      "--issued-at", NOW,
      "--expires-at", EXPIRES_AT
    ],
    stdout,
    stderr: { write(value) { stderr += value; } }
  });
  assert.equal(exitCode, 0);
  assert.equal(stderr, "");
  assert.equal(Buffer.concat(chunks).readUInt32BE(0) > 0, true);
});
