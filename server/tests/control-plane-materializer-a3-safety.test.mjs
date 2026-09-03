// A3-0 materializer safety contract tests.
//
// These tests pin the exact evidence shapes the kernel-enforced aggregate
// storage quota boundary and the restricted service-native smoke boundary
// must publish before the production materializer guard may be reconsidered.
// They are unit-level contracts only; real XFS project-quota enforcement
// and real systemd fixed-service-principal sandbox execution are validated by separate
// privileged disposable Linux runs (see issue #636 Gate A3-1).
//
// Production materialize/verify/preflight stay fail-closed by default. The
// separately reviewed A3 integration path must be explicit, fixed-root, and
// backed by fresh production quota readback plus service-native smoke.

import assert from "node:assert/strict";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  buildServiceNativeSmokeInvocation,
  buildProductionServiceNativeSmokeInvocation,
  CandidateDependencyGateError,
  collectProductionStorageQuotaReadback,
  collectServiceNativeSmokeEvidence,
  collectStorageQuotaEvidence,
  createCandidateDependencyGateA3PhysicalValidationRuntime,
  createCandidateDependencyGateBoundedProductionRuntime,
  createCandidateDependencyGateProductionRuntime,
  createCandidateDependencyGateTestRuntime,
  materializeCandidateDependencies,
  parseBoundedStorageReadback,
  parseProductionStorageQuotaReadback,
  parseServiceSmokeReadback,
  parseStorageQuotaEvidence,
  preflightCandidateDependencies,
  validateA3ServiceSmokeSource,
  verifyCandidateDependencies
} from "../../scripts/control-plane-candidate-dependency-gate-lib.mjs";
import {
  parseA3PhysicalValidationArgs,
  runA3PhysicalValidationCli
} from "../../scripts/control-plane-materializer-a3-physical-validation-lib.mjs";

function condition(name) {
  return (error) => error instanceof CandidateDependencyGateError && error.condition === name;
}

function quotaEvidence(overrides = {}) {
  return Object.freeze({
    filesystem: "xfs-prod",
    projectId: 4242,
    byteHardLimit: 8 * 1024 * 1024 * 1024,
    byteCurrent: 4096,
    inodeHardLimit: 65536,
    inodeCurrent: 12,
    headroomBytes: 8 * 1024 * 1024 * 1024 - 4096,
    headroomInodes: 65536 - 12,
    probe: Object.freeze({
      expectedErrorCode: "ENOSPC",
      observedErrorCode: "ENOSPC",
      exhausted: true
    }),
    ...overrides
  });
}

function smokeReadback(overrides = {}) {
  return Object.freeze({
    serviceUid: 4711,
    serviceGid: 4711,
    fixedNodePath: "/usr/bin/node",
    noNetwork: true,
    capabilityBoundingSet: "",
    protectSystem: "strict",
    protectHome: true,
    privateDevices: true,
    noNewPrivileges: true,
    cgroupEmpty: true,
    terminalActiveState: "inactive",
    terminalSubState: "dead",
    terminalResult: "success",
    betterSqlite3Memory: true,
    snapshotImport: true,
    ...overrides
  });
}

test("parseStorageQuotaEvidence accepts the exact A3 boundary shape", () => {
  const parsed = parseStorageQuotaEvidence(quotaEvidence());
  assert.equal(parsed.filesystem, "xfs-prod");
  assert.equal(parsed.projectId, 4242);
  assert.equal(parsed.headroomBytes, 8 * 1024 * 1024 * 1024 - 4096);
  assert.equal(parsed.headroomInodes, 65536 - 12);
  assert.deepEqual(parsed.probe, { expectedErrorCode: "ENOSPC", observedErrorCode: "ENOSPC", exhausted: true });
});

test("parseStorageQuotaEvidence rejects probes whose declared expected code is not ENOSPC", () => {
  assert.throws(
    () => parseStorageQuotaEvidence(quotaEvidence({ probe: { expectedErrorCode: "EDQUOT", observedErrorCode: "EDQUOT", exhausted: true } })),
    condition("storage_quota_evidence_invalid")
  );
});

test("parseStorageQuotaEvidence rejects a non-ENOSPC observed result", () => {
  assert.throws(
    () => parseStorageQuotaEvidence(quotaEvidence({ probe: { expectedErrorCode: "ENOSPC", observedErrorCode: "EDQUOT", exhausted: true } })),
    condition("storage_quota_evidence_invalid")
  );
});

test("parseStorageQuotaEvidence rejects non-exhausted probes and missing probe metadata", () => {
  assert.throws(
    () => parseStorageQuotaEvidence(quotaEvidence({ probe: { expectedErrorCode: "ENOSPC", observedErrorCode: "ENOSPC", exhausted: false } })),
    condition("storage_quota_evidence_invalid")
  );
  assert.throws(
    () => parseStorageQuotaEvidence(quotaEvidence({ probe: { expectedErrorCode: "ENOSPC", observedErrorCode: "ENOSPC" } })),
    condition("storage_quota_evidence_invalid")
  );
});

test("parseStorageQuotaEvidence rejects headroom inconsistency and missing fields", () => {
  assert.throws(
    () => parseStorageQuotaEvidence(quotaEvidence({ headroomBytes: 1 })),
    condition("storage_quota_evidence_invalid")
  );
  assert.throws(
    () => parseStorageQuotaEvidence(quotaEvidence({ headroomInodes: 1 })),
    condition("storage_quota_evidence_invalid")
  );
  const { probe, ...withoutProbe } = quotaEvidence();
  assert.throws(() => parseStorageQuotaEvidence(withoutProbe), condition("storage_quota_evidence_invalid"));
  const { projectId, ...withoutProject } = quotaEvidence();
  assert.throws(() => parseStorageQuotaEvidence(withoutProject), condition("storage_quota_evidence_invalid"));
});

test("parseStorageQuotaEvidence rejects byte/inode out-of-range and non-integer values", () => {
  assert.throws(
    () => parseStorageQuotaEvidence(quotaEvidence({ byteCurrent: -1 })),
    condition("storage_quota_evidence_invalid")
  );
  assert.throws(
    () => parseStorageQuotaEvidence(quotaEvidence({ byteCurrent: 9 * 1024 * 1024 * 1024 })),
    condition("storage_quota_evidence_invalid")
  );
  assert.throws(
    () => parseStorageQuotaEvidence(quotaEvidence({ inodeHardLimit: 0 })),
    condition("storage_quota_evidence_invalid")
  );
  assert.throws(
    () => parseStorageQuotaEvidence(quotaEvidence({ projectId: 0 })),
    condition("storage_quota_evidence_invalid")
  );
  assert.throws(
    () => parseStorageQuotaEvidence(quotaEvidence({ byteHardLimit: 1.5 })),
    condition("storage_quota_evidence_invalid")
  );
});

function productionQuotaReadback(overrides = {}) {
  return Object.freeze({
    filesystem: "/dev/mapper/control-plane",
    mountpoint: "/",
    projectId: 4242,
    byteHardLimit: 8 * 1024 * 1024 * 1024,
    byteCurrent: 4096,
    inodeHardLimit: 65536,
    inodeCurrent: 12,
    headroomBytes: 8 * 1024 * 1024 * 1024 - 4096,
    headroomInodes: 65536 - 12,
    projectTreeVerified: true,
    accounting: true,
    enforcement: true,
    ...overrides
  });
}

test("parseProductionStorageQuotaReadback accepts only a live enforced project-tree boundary", () => {
  const parsed = parseProductionStorageQuotaReadback(productionQuotaReadback());
  assert.equal(parsed.projectId, 4242);
  assert.equal(parsed.projectTreeVerified, true);
  assert.equal(parsed.accounting, true);
  assert.equal(parsed.enforcement, true);
  for (const overrides of [
    { projectTreeVerified: false },
    { accounting: false },
    { enforcement: false },
    { headroomBytes: 1 },
    { filesystem: "tmpfs" }
  ]) assert.throws(
    () => parseProductionStorageQuotaReadback(productionQuotaReadback(overrides)),
    condition("storage_quota_evidence_invalid")
  );
});

test("bounded storage readback accepts only exact ext4 budget and low-water evidence", () => {
  const logicalBytes = 4097;
  const entryCount = 3;
  const blockSize = 4096;
  const allocationUpperBoundBytes = logicalBytes + entryCount * (blockSize - 1) + 2 * (entryCount + 2) * blockSize;
  const reserveBytes = 512 * 1024 * 1024;
  const reserveInodes = 4096;
  const value = {
    storageMode: "bounded-artifact",
    filesystem: "ext4",
    rootDeviceId: "2049",
    deviceId: "2049",
    blockSize,
    logicalBytes,
    entryCount,
    allocationUpperBoundBytes,
    reserveBytes,
    requiredBytes: allocationUpperBoundBytes + reserveBytes,
    reserveInodes,
    requiredInodes: entryCount + 2 + reserveInodes,
    availableBytes: allocationUpperBoundBytes + reserveBytes,
    availableInodes: entryCount + 2 + reserveInodes
  };
  assert.equal(parseBoundedStorageReadback(value).storageMode, "bounded-artifact");
  for (const drift of [
    { availableBytes: value.requiredBytes - 1 },
    { availableInodes: value.requiredInodes - 1 },
    { filesystem: "xfs" },
    { rootDeviceId: "2050" },
    { allocationUpperBoundBytes: value.allocationUpperBoundBytes - 1 },
    { deviceId: "not-a-device" }
  ]) assert.throws(() => parseBoundedStorageReadback({ ...value, ...drift }), condition("dependency_storage_budget_unavailable"));
});

test("bounded materialization binds staging and receipt topology before mutation or readback", () => {
  const source = readFileSync(new URL("../../scripts/control-plane-candidate-dependency-gate-lib.mjs", import.meta.url), "utf8");
  const body = (start, end) => {
    const first = source.indexOf(start);
    const last = source.indexOf(end, first);
    assert.ok(first >= 0 && last > first, `missing source contract: ${start}`);
    return source.slice(first, last);
  };

  const staging = body("function artifactStaging(", "function normalizeArtifactTree(");
  assert.ok(
    staging.indexOf("boundedVolumeMatches(parent, expectedDeviceId)") < staging.indexOf("rootControlledDirectory("),
    "the existing staging parent must be volume-bound before the first staging mkdir"
  );
  assert.ok(
    staging.indexOf("boundedVolumeMatches(context.candidateRoot, expectedDeviceId)") < staging.indexOf("rootControlledDirectory("),
    "the candidate root must be volume-bound before the first staging mkdir"
  );

  const receiptDirectory = body("function receiptDirectory(", "function writeReceipt(");
  assert.match(receiptDirectory, /const candidateReceiptRoot = directory\(path,/);
  assert.match(receiptDirectory, /boundedVolumeMatches\(candidateReceiptRoot, expectedDeviceId\)/);

  const readReceipt = body("function readReceipt(", "function report(");
  assert.match(readReceipt, /storage = null/);
  assert.match(readReceipt, /boundedVolumeMatches\(parent, expectedDeviceId\)/);
  assert.match(readReceipt, /boundedVolumeMatches\(file\.path, expectedDeviceId\)/);

  const verify = body("export async function verifyCandidateDependencies(", "function args(");
  const firstStorageReadback = verify.indexOf("storageEvidence = storageEvidenceForMaterialization(");
  const firstReceiptReadback = verify.indexOf("readReceipt(value.c, supplied, storageEvidence)");
  assert.ok(firstStorageReadback >= 0 && firstStorageReadback < firstReceiptReadback,
    "verify must bind the candidate device before reading the receipt");
  assert.ok(verify.includes("readReceipt(value.c, supplied, exactStorageEvidence)"),
    "verify must rebind the receipt to the exact post-extraction storage readback");

  const materialize = body("export async function materializeCandidateDependencies(", "export async function verifyCandidateDependencies(");
  const materializeTopology = materialize.indexOf("assertBoundedMutationTopology(value.c, storageInitial, supplied)");
  assert.ok(
    materializeTopology >= 0 && materializeTopology < materialize.indexOf("key = lock(supplied)"),
    "known staging or receipt topology drift must block before the materialization lock mutation"
  );
  const verifyTopology = verify.indexOf("assertBoundedMutationTopology(value.c, storageEvidence, supplied)");
  assert.ok(
    verifyTopology >= 0 && verifyTopology < firstReceiptReadback,
    "known receipt topology drift must block before verify reads the receipt"
  );
});

test("XFS verify rejects a statically invalid receipt before quota readback", () => {
  const source = readFileSync(new URL("../../scripts/control-plane-candidate-dependency-gate-lib.mjs", import.meta.url), "utf8");
  const start = source.indexOf("export async function verifyCandidateDependencies(");
  const end = source.indexOf("function args(", start);
  assert.ok(start >= 0 && end > start, "missing verify source contract");
  const verify = source.slice(start, end);

  const receiptReadback = verify.indexOf("receipt = readReceipt(value.c, supplied);");
  const receiptValidation = verify.indexOf("currentReceipt = requireCurrentReceiptSchema(receipt.value", receiptReadback);
  const quotaReadback = verify.indexOf(
    "storageEvidence = storageEvidenceForMaterialization(supplied, null, value.c.candidateRoot);",
    receiptValidation
  );
  assert.ok(receiptReadback >= 0, "XFS verify must read the receipt before quota evidence");
  assert.ok(receiptValidation > receiptReadback, "XFS verify must validate the receipt before quota evidence");
  assert.ok(quotaReadback > receiptValidation, "XFS verify must reject a static receipt mismatch before quota readback");
});

test("collectProductionStorageQuotaReadback performs read-only project-tree and quota readback without exhaustion", () => {
  const root = "/opt/proxy-gateway-minimal-candidate", calls = [];
  const executePhysicalCommand = (command, args) => {
    calls.push([command, args]);
    if (command === "/usr/bin/findmnt") return { status: 0, stdout: "{\"filesystems\":[{\"target\":\"/\",\"source\":\"/dev/mapper/control-plane\",\"fstype\":\"xfs\",\"options\":\"rw,prjquota\"}]}\n", stderr: "" };
    if (command === "/usr/sbin/xfs_io") return { status: 0, stdout: "projid = 4242\n", stderr: "" };
    const action = args[2];
    if (action.startsWith("project -c")) return { status: 0, stdout: [`Checking project 4242 (path ${root})...`, "Processed 1 (/etc/projects and cmdline) paths for project 4242 with recursion depth infinite (-1).", ""].join("\n"), stderr: "" };
    if (action === "state -p") return { status: 0, stdout: "Project quota state on /dev/mapper/control-plane\nAccounting: ON\nEnforcement: ON\n", stderr: "" };
    if (action.includes(" -b ")) return { status: 0, stdout: "4242 4096 0 8388608 00 [------]\n", stderr: "" };
    if (action.includes(" -i ")) return { status: 0, stdout: "4242 12 0 65536 00 [------]\n", stderr: "" };
    return { status: 70, stdout: "", stderr: "unexpected" };
  };
  const value = collectProductionStorageQuotaReadback({
    root, projectId: 4242,
    runtime: physicalRuntime({ executePhysicalCommand })
  });
  assert.equal(value.filesystem, "/dev/mapper/control-plane");
  assert.equal(value.mountpoint, "/");
  assert.equal(value.byteHardLimit, 8 * 1024 * 1024 * 1024);
  assert.equal(value.inodeHardLimit, 65536);
  assert.equal(calls.length, 6);
  assert.equal(calls.some(([, args]) => args.some((item) => String(item).includes("limit"))), false);
});

test("parseServiceSmokeReadback accepts the exact A3 boundary shape", () => {
  const parsed = parseServiceSmokeReadback(smokeReadback());
  assert.equal(parsed.serviceUid, 4711);
  assert.equal(parsed.serviceGid, 4711);
  assert.equal(parsed.noNetwork, true);
  assert.equal(parsed.capabilityBoundingSet, "");
  assert.equal(parsed.protectSystem, "strict");
  assert.equal(parsed.cgroupEmpty, true);
  assert.equal(parsed.terminalResult, "success");
  assert.equal(parsed.betterSqlite3Memory, true);
  assert.equal(parsed.snapshotImport, true);
});

test("parseServiceSmokeReadback rejects root, writable bind, network, capability, terminal, and cgroup drift", () => {
  const cases = [
    [{ serviceUid: 0 }, "service_smoke_readback_invalid"],
    [{ serviceGid: 0 }, "service_smoke_readback_invalid"],
    [{ fixedNodePath: "" }, "service_smoke_readback_invalid"],
    [{ noNetwork: false }, "service_smoke_readback_invalid"],
    [{ capabilityBoundingSet: "CAP_NET_BIND_SERVICE" }, "service_smoke_readback_invalid"],
    [{ protectSystem: "full" }, "service_smoke_readback_invalid"],
    [{ protectHome: false }, "service_smoke_readback_invalid"],
    [{ privateDevices: false }, "service_smoke_readback_invalid"],
    [{ noNewPrivileges: false }, "service_smoke_readback_invalid"],
    [{ cgroupEmpty: false }, "service_smoke_readback_invalid"],
    [{ terminalActiveState: "active" }, "service_smoke_readback_invalid"],
    [{ terminalSubState: "running" }, "service_smoke_readback_invalid"],
    [{ terminalResult: "exit-code" }, "service_smoke_readback_invalid"],
    [{ betterSqlite3Memory: false }, "service_smoke_readback_invalid"],
    [{ snapshotImport: false }, "service_smoke_readback_invalid"]
  ];
  for (const [overrides, expected] of cases) {
    assert.throws(() => parseServiceSmokeReadback(smokeReadback(overrides)), condition(expected), JSON.stringify(overrides));
  }
});

function physicalRuntime(overrides = {}) {
  return {
    platform: "linux",
    requireRoot: true,
    allowA3PhysicalValidation: true,
    getuid: () => 0,
    tools: {
      node: "/usr/bin/node",
      systemdRun: "/usr/bin/systemd-run",
      systemctl: "/usr/bin/systemctl",
      systemdAnalyze: "/usr/bin/systemd-analyze",
      findmnt: "/usr/bin/findmnt",
      xfsQuota: "/usr/sbin/xfs_quota",
      xfsIo: "/usr/sbin/xfs_io"
    },
    ...overrides
  };
}

function projectCheckOutput(runLabel = "run-1", projectId = 4242, diagnostics = []) {
  const probeRoot = `/var/lib/control-plane-a3-1/${runLabel}/probe`;
  return [
    `Checking project ${projectId} (path ${probeRoot})...`,
    ...diagnostics,
    `Processed 1 (/etc/projects and cmdline) paths for project ${projectId} with recursion depth infinite (-1).`,
    ""
  ].join("\n");
}

test("collectStorageQuotaEvidence binds ENOSPC to XFS quota with less than one write chunk remaining", () => {
  const calls = [];
  let blockReportCount = 0;
  let inodeReportCount = 0;
  const execute = (command, args) => {
    calls.push([command, args]);
    if (command === "/usr/bin/findmnt") return { status: 0, stdout: '{"filesystems":[{"target":"/var/lib/control-plane-a3-1/run-1/probe","source":"/dev/loop7","fstype":"xfs","options":"rw,relatime,prjquota"}]}\n', stderr: "" };
    if (command === "/usr/sbin/xfs_io") return { status: 0, stdout: "projid = 4242\n", stderr: "" };
    if (args.includes("project -c -p /var/lib/control-plane-a3-1/run-1/probe 4242")) return { status: 0, stdout: projectCheckOutput(), stderr: "" };
    if (args.includes("state -p")) return { status: 0, stdout: "Project quota state on /dev/loop7 (/var/lib/control-plane-a3-1/run-1/probe)\n  Accounting: ON\n  Enforcement: ON\n", stderr: "" };
    if (args.includes("report -p -b -n -N -L 4242 -U 4242")) {
      blockReportCount += 1;
      return { status: 0, stdout: blockReportCount === 1 ? "4242 512 0 1024 00 [------]\n" : "4242 964 0 1024 00 [------]\n", stderr: "" };
    }
    if (args.includes("report -p -i -n -N -L 4242 -U 4242")) {
      inodeReportCount += 1;
      return { status: 0, stdout: inodeReportCount === 1 ? "4242 12 0 64 00 [------]\n" : "4242 64 0 64 00 [------]\n", stderr: "" };
    }
    return { status: 70, stdout: "", stderr: "unexpected command" };
  };
  const created = new Set();
  let nextDescriptor = 10;
  let createdCount = 0;
  let overflowAttempts = 0;
  let writeAttempts = 0;
  const probeFilesystem = {
    openSync(path) {
      if (path.endsWith(".a3-project-quota-probe-overflow")) {
        overflowAttempts += 1;
        throw Object.assign(new Error("inode quota exhausted"), { code: "ENOSPC" });
      }
      if (!created.has(path)) {
        created.add(path);
        createdCount += 1;
      }
      return nextDescriptor++;
    },
    closeSync() {},
    writeSync() {
      writeAttempts += 1;
      throw Object.assign(new Error("byte quota exhausted"), { code: "ENOSPC" });
    },
    unlinkSync(path) {
      if (!created.delete(path)) throw new Error("unexpected probe cleanup path");
    }
  };
  const evidence = collectStorageQuotaEvidence({
    runLabel: "run-1",
    projectId: 4242,
    runtime: physicalRuntime({
      executePhysicalCommand: execute,
      probeFilesystem
    })
  });
  assert.equal(evidence.filesystem, "/dev/loop7");
  assert.equal(evidence.byteCurrent, 964 * 1024);
  assert.equal(evidence.byteHardLimit, 1024 * 1024);
  assert.equal(evidence.inodeCurrent, 64);
  assert.equal(evidence.inodeHardLimit, 64);
  assert.equal(evidence.headroomBytes, 60 * 1024);
  assert.equal(evidence.headroomInodes, 0);
  assert.equal(calls.length, 8);
  assert.equal(createdCount, 52);
  assert.equal(overflowAttempts, 1);
  assert.equal(writeAttempts, 1);
  assert.equal(created.size, 0);
});

test("collectStorageQuotaEvidence rejects project-check diagnostics and malformed framing", () => {
  const probeRoot = "/var/lib/control-plane-a3-1/run-1/probe";
  const outputs = [
    "",
    projectCheckOutput("run-1", 4242, [`${probeRoot} - project identifier is not set (inode=0, tree=4242)`]),
    projectCheckOutput("run-1", 4242, [`${probeRoot} - project inheritance flag is not set`]),
    projectCheckOutput().replace("Processed 1", "Processed 2")
  ];
  for (const output of outputs) {
    const calls = [];
    const execute = (command, args) => {
      calls.push([command, args]);
      if (command === "/usr/bin/findmnt") {
        return { status: 0, stdout: '{"filesystems":[{"target":"/var/lib/control-plane-a3-1/run-1/probe","source":"/dev/loop7","fstype":"xfs","options":"rw,prjquota"}]}\n', stderr: "" };
      }
      if (command === "/usr/sbin/xfs_io") return { status: 0, stdout: "projid = 4242\n", stderr: "" };
      if (args.includes("project -c -p /var/lib/control-plane-a3-1/run-1/probe 4242")) {
        return { status: 0, stdout: output, stderr: "" };
      }
      return { status: 70, stdout: "", stderr: "unexpected command" };
    };
    assert.throws(() => collectStorageQuotaEvidence({
      runLabel: "run-1",
      projectId: 4242,
      runtime: physicalRuntime({ executePhysicalCommand: execute })
    }), condition("storage_quota_evidence_invalid"));
    assert.equal(calls.length, 3);
  }
});

test("collectStorageQuotaEvidence rejects project-check stderr even with canonical stdout", () => {
  const calls = [];
  const execute = (command, args) => {
    calls.push([command, args]);
    if (command === "/usr/bin/findmnt") {
      return { status: 0, stdout: '{"filesystems":[{"target":"/var/lib/control-plane-a3-1/run-1/probe","source":"/dev/loop7","fstype":"xfs","options":"rw,prjquota"}]}\n', stderr: "" };
    }
    if (command === "/usr/sbin/xfs_io") return { status: 0, stdout: "projid = 4242\n", stderr: "" };
    if (args.includes("project -c -p /var/lib/control-plane-a3-1/run-1/probe 4242")) {
      return { status: 0, stdout: projectCheckOutput(), stderr: "unexpected project-check warning\n" };
    }
    return { status: 70, stdout: "", stderr: "unexpected command" };
  };
  assert.throws(() => collectStorageQuotaEvidence({
    runLabel: "run-1",
    projectId: 4242,
    runtime: physicalRuntime({ executePhysicalCommand: execute })
  }), condition("storage_quota_evidence_invalid"));
  assert.equal(calls.length, 3);
});

test("collectStorageQuotaEvidence rejects ENOSPC claims without an at-exhaustion quota readback", () => {
  const execute = (command, args) => ({
    status: 0,
    stdout: command.endsWith("findmnt")
      ? '{"filesystems":[{"target":"/var/lib/control-plane-a3-1/run-1/probe","source":"/dev/loop7","fstype":"xfs","options":"rw,prjquota"}]}\n'
      : command.endsWith("xfs_io")
        ? "projid = 4242\n"
        : args.includes("project -c -p /var/lib/control-plane-a3-1/run-1/probe 4242")
          ? projectCheckOutput()
          : args.includes("state -p")
            ? "Project quota state\n  Accounting: ON\n  Enforcement: ON\n"
            : args.includes("report -p -b -n -N -L 4242 -U 4242")
              ? "4242 512 0 1024 00 [------]\n"
              : "4242 12 0 64 00 [------]\n",
    stderr: ""
  });
  assert.throws(() => collectStorageQuotaEvidence({
    runLabel: "run-1",
    projectId: 4242,
    runtime: physicalRuntime({
      executePhysicalCommand: execute,
      runQuotaExhaustionProbe: () => ({ expectedErrorCode: "ENOSPC", observedErrorCode: "ENOSPC", exhausted: true })
    })
  }), condition("storage_quota_evidence_invalid"));
});

test("collectStorageQuotaEvidence rejects plain filesystem ENOSPC when project quota is not exhausted", () => {
  const execute = (command, args) => ({
    status: 0,
    stdout: command.endsWith("findmnt")
      ? '{"filesystems":[{"target":"/var/lib/control-plane-a3-1/run-1/probe","source":"/dev/loop7","fstype":"xfs","options":"rw,prjquota"}]}\n'
      : command.endsWith("xfs_io")
        ? "projid = 4242\n"
        : args.includes("project -c -p /var/lib/control-plane-a3-1/run-1/probe 4242")
          ? projectCheckOutput()
          : args.includes("state -p")
            ? "Project quota state\n  Accounting: ON\n  Enforcement: ON\n"
            : args.includes("report -p -b -n -N -L 4242 -U 4242")
              ? "4242 512 0 1024 00 [------]\n"
              : "4242 12 0 64 00 [------]\n",
    stderr: ""
  });
  const created = new Set();
  let nextDescriptor = 10;
  const probeFilesystem = {
    openSync(path) {
      if (path.endsWith(".a3-project-quota-probe-overflow")) throw Object.assign(new Error("inode quota exhausted"), { code: "ENOSPC" });
      created.add(path);
      return nextDescriptor++;
    },
    closeSync() {},
    writeSync() { throw Object.assign(new Error("byte quota exhausted"), { code: "ENOSPC" }); },
    unlinkSync(path) {
      if (!created.delete(path)) throw new Error("unexpected probe cleanup path");
    }
  };
  assert.throws(() => collectStorageQuotaEvidence({
    runLabel: "run-1",
    projectId: 4242,
    runtime: physicalRuntime({ executePhysicalCommand: execute, probeFilesystem })
  }), condition("storage_quota_evidence_invalid"));
  assert.equal(created.size, 0);
});

test("collectStorageQuotaEvidence rejects ENOSPC when one full write chunk still fits", () => {
  let blockReportCount = 0;
  let inodeReportCount = 0;
  const execute = (command, args) => ({
    status: 0,
    stdout: command.endsWith("findmnt")
      ? '{"filesystems":[{"target":"/var/lib/control-plane-a3-1/run-1/probe","source":"/dev/loop7","fstype":"xfs","options":"rw,prjquota"}]}\n'
      : command.endsWith("xfs_io")
        ? "projid = 4242\n"
        : args.includes("project -c -p /var/lib/control-plane-a3-1/run-1/probe 4242")
          ? projectCheckOutput()
          : args.includes("state -p")
            ? "Project quota state\n  Accounting: ON\n  Enforcement: ON\n"
            : args.includes("report -p -b -n -N -L 4242 -U 4242")
              ? ++blockReportCount === 1 ? "4242 512 0 1024 00 [------]\n" : "4242 960 0 1024 00 [------]\n"
              : ++inodeReportCount === 1 ? "4242 12 0 64 00 [------]\n" : "4242 64 0 64 00 [------]\n",
    stderr: ""
  });
  assert.throws(() => collectStorageQuotaEvidence({
    runLabel: "run-1",
    projectId: 4242,
    runtime: physicalRuntime({
      executePhysicalCommand: execute,
      runQuotaExhaustionProbe: ({ attemptedWriteBytes, observeExhaustedQuota }) => {
        assert.equal(attemptedWriteBytes, 64 * 1024);
        observeExhaustedQuota({ attemptedWriteBytes });
        return { expectedErrorCode: "ENOSPC", observedErrorCode: "ENOSPC", exhausted: true };
      }
    })
  }), condition("storage_quota_evidence_invalid"));
});

test("collectStorageQuotaEvidence preserves attention-required when probe cleanup is uncertain", () => {
  let blockReportCount = 0;
  let inodeReportCount = 0;
  const execute = (command, args) => ({
    status: 0,
    stdout: command.endsWith("findmnt")
      ? '{"filesystems":[{"target":"/var/lib/control-plane-a3-1/run-1/probe","source":"/dev/loop7","fstype":"xfs","options":"rw,prjquota"}]}\n'
      : command.endsWith("xfs_io")
        ? "projid = 4242\n"
        : args.includes("project -c -p /var/lib/control-plane-a3-1/run-1/probe 4242")
          ? projectCheckOutput()
          : args.includes("state -p")
            ? "Project quota state\n  Accounting: ON\n  Enforcement: ON\n"
            : args.includes("report -p -b -n -N -L 4242 -U 4242")
              ? ++blockReportCount === 1 ? "4242 512 0 1024 00 [------]\n" : "4242 1024 0 1024 00 [------]\n"
              : ++inodeReportCount === 1 ? "4242 12 0 64 00 [------]\n" : "4242 64 0 64 00 [------]\n",
    stderr: ""
  });
  const probeFilesystem = {
    openSync(path) {
      if (path.endsWith(".a3-project-quota-probe-overflow")) throw Object.assign(new Error("inode quota exhausted"), { code: "ENOSPC" });
      return 10;
    },
    closeSync() {},
    writeSync() { throw Object.assign(new Error("byte quota exhausted"), { code: "ENOSPC" }); },
    unlinkSync() { throw new Error("cleanup uncertain"); }
  };
  assert.throws(() => collectStorageQuotaEvidence({
    runLabel: "run-1",
    projectId: 4242,
    runtime: physicalRuntime({ executePhysicalCommand: execute, probeFilesystem })
  }), (error) => condition("storage_quota_evidence_invalid")(error) && error.attentionRequired === true);
});

test("collectStorageQuotaEvidence rejects non-XFS and non-project-quota errno evidence", () => {
  const executeFor = (fstype) => (command, args) => ({
    status: 0,
    stdout: command.endsWith("findmnt")
      ? `{"filesystems":[{"target":"/var/lib/control-plane-a3-1/run-1/probe","source":"/dev/loop7","fstype":"${fstype}","options":"rw,prjquota"}]}\n`
      : command.endsWith("xfs_io")
        ? "projid = 4242\n"
        : args.includes("project -c -p /var/lib/control-plane-a3-1/run-1/probe 4242")
          ? projectCheckOutput()
        : args.includes("state -p")
          ? "Project quota state\n  Accounting: ON\n  Enforcement: ON\n"
          : args.includes("report -p -b -n -N -L 4242 -U 4242")
            ? "4242 512 0 1024 00 [------]\n"
            : "4242 12 0 64 00 [------]\n",
    stderr: ""
  });
  assert.throws(() => collectStorageQuotaEvidence({
    runLabel: "run-1",
    projectId: 4242,
    runtime: physicalRuntime({
      executePhysicalCommand: executeFor("ext4"),
      runQuotaExhaustionProbe: () => ({ expectedErrorCode: "ENOSPC", observedErrorCode: "ENOSPC", exhausted: true })
    })
  }), condition("storage_quota_evidence_invalid"));
  assert.throws(() => collectStorageQuotaEvidence({
    runLabel: "run-1",
    projectId: 4242,
    runtime: physicalRuntime({
      executePhysicalCommand: executeFor("xfs"),
      runQuotaExhaustionProbe: () => ({ expectedErrorCode: "ENOSPC", observedErrorCode: "EDQUOT", exhausted: true })
    })
  }), condition("storage_quota_evidence_invalid"));
});

test("buildServiceNativeSmokeInvocation pins principal, readonly bind, network isolation, and fixed worker argv", () => {
  const invocation = buildServiceNativeSmokeInvocation({
    runLabel: "run-1",
    root: "/var/lib/control-plane-a3-1/run-1/probe/project",
    service: { uid: 4711, gid: 4712 },
    runtime: physicalRuntime()
  });
  assert.equal(invocation.command, "/usr/bin/systemd-run");
  assert.ok(invocation.args.includes("--unit=control-plane-a3-service-smoke-run-1-validation"));
  assert.ok(invocation.args.includes("--service-type=oneshot"));
  assert.ok(invocation.args.includes("--remain-after-exit"));
  assert.equal(invocation.args.includes("--collect"), false);
  assert.ok(invocation.args.includes("--property=CollectMode=inactive"));
  assert.equal(invocation.args.includes("--wait"), false);
  assert.equal(invocation.args.includes("--pipe"), false);
  assert.ok(invocation.args.includes("--property=DynamicUser=no"));
  assert.ok(invocation.args.includes("--property=User=4711"));
  assert.ok(invocation.args.includes("--property=Group=4712"));
  assert.ok(invocation.args.includes("--property=PrivateNetwork=yes"));
  assert.ok(invocation.args.includes("--property=CapabilityBoundingSet="));
  for (const property of [
    "RestrictAddressFamilies=AF_UNIX",
    "RestrictNamespaces=yes",
    "SystemCallFilter=@system-service",
    "PrivateTmp=yes",
    "ProtectControlGroups=yes",
    "Delegate=no",
    "Slice=system.slice",
    "UMask=0077",
    "WorkingDirectory=/run/control-plane-a3-service-smoke/control-plane-a3-service-smoke-run-1-validation/project"
  ]) {
    assert.ok(invocation.args.includes(`--property=${property}`), property);
  }
  assert.ok(invocation.args.includes("--property=StandardOutput=file:/var/lib/control-plane-a3-1/run-1/probe/service-smoke-validation.stdout.json"));
  assert.ok(invocation.args.includes("--property=StandardError=file:/var/lib/control-plane-a3-1/run-1/probe/service-smoke-validation.stderr.txt"));
  assert.equal(invocation.captureStdout, "/var/lib/control-plane-a3-1/run-1/probe/service-smoke-validation.stdout.json");
  assert.equal(invocation.captureStderr, "/var/lib/control-plane-a3-1/run-1/probe/service-smoke-validation.stderr.txt");
  assert.match(invocation.worker, /control-plane-dependency-artifact-cli\.mjs$/);
  assert.match(invocation.workerLibrary, /control-plane-dependency-artifact-lib\.mjs$/);
  assert.match(invocation.workerContract, /control-plane-welcome-coins-native-contract\.mjs$/);
  assert.match(invocation.visibleWorkerContract, /control-plane-welcome-coins-native-contract\.mjs$/);
  assert.deepEqual(invocation.bindReadOnlyPaths, [
    "/var/lib/control-plane-a3-1/run-1/probe/project:/run/control-plane-a3-service-smoke/control-plane-a3-service-smoke-run-1-validation/project:norbind",
    `${invocation.worker}:${invocation.visibleWorker}:norbind`,
    `${invocation.workerLibrary}:${invocation.visibleWorkerLibrary}:norbind`,
    `${invocation.workerContract}:${invocation.visibleWorkerContract}:norbind`
  ]);
  assert.ok(invocation.args.includes(`--property=BindReadOnlyPaths=${invocation.bindReadOnlyPaths.join(" ")}`));
  assert.deepEqual(invocation.args.slice(-8), [
    "/usr/bin/node",
    invocation.visibleWorker,
    "--mode", "smoke",
    "--root", "/run/control-plane-a3-service-smoke/control-plane-a3-service-smoke-run-1-validation/project",
    "--snapshot", "scripts/control-plane-db-snapshot-gate-lib.mjs"
  ]);
});

test("A3 native smoke rejects a missing or non-fixed systemd-analyze path before launch", () => {
  const request = {
    runLabel: "run-1",
    root: "/var/lib/control-plane-a3-1/run-1/probe/project",
    service: { uid: 4711, gid: 4712 }
  };
  const fixedTools = physicalRuntime().tools;
  for (const tools of [
    { ...fixedTools, systemdAnalyze: "/tmp/systemd-analyze" },
    Object.fromEntries(Object.entries(fixedTools).filter(([name]) => name !== "systemdAnalyze"))
  ]) {
    assert.throws(
      () => buildServiceNativeSmokeInvocation({ ...request, runtime: physicalRuntime({ tools }) }),
      condition("invalid_input")
    );
  }
});

const VALID_SERVICE_SMOKE_STDOUT = '{"schemaVersion":"3","type":"control_plane_dependency_artifact","mode":"smoke","state":"verified","smoke":{"betterSqlite3Memory":true,"snapshotImport":true},"processIdentity":{"uid":4711,"gid":4712}}\n';
const SYSTEMD_SYSCALL_FILTER_CATALOG = [
  "@default",
  "    close",
  "@system-service",
  "    @default",
  "    read",
  "    write",
  ""
].join("\n");

function serviceSmokeHarness({
  processStdout = VALID_SERVICE_SMOKE_STDOUT,
  processStderr = "",
  initialCaptures = false,
  initialUnitLoaded = initialCaptures,
  initialUnitFailed = false,
  initialCaptureKind = "regular",
  captureBoundaryValid = true,
  sourceCustodyValid = true,
  launchStatus = 0,
  autoCollectFailedUnit = false,
  gcLoadedPolls = 0,
  cgroupGcPolls = 0,
  unitGcLastSleepOvershootMs = 0,
  completionPolls = 0,
  activatingOverrides = {},
  completionOverrides = {},
  pinnedStatus = 0,
  pinnedOverrides = {},
  omittedPinnedProperty = null,
  syscallFilterCatalog = SYSTEMD_SYSCALL_FILTER_CATALOG,
  systemdAnalyzeStatus = 0,
  systemdAnalyzeStderr = "",
  normalizeBindReadOnlyPaths = true,
  bindReadOnlyPathsReadback = null,
  cgroupFilesystemType = 0x63677270,
  cgroupControllersReadable = true,
  cgroupPresent = true,
  cgroupDisappearOnRead = null,
  cgroupReadEnoentWhilePresent = null,
  cgroupEvents = "populated 0\n",
  cgroupProcs = "",
  stopStatus = 0,
  resetFailedStatus = 0,
  stopCollectsFailedUnit = false
} = {}) {
  const unit = "control-plane-a3-service-smoke-run-1-validation.service";
  const cgroupRoot = `/sys/fs/cgroup/system.slice/${unit}`;
  const captureStdout = "/var/lib/control-plane-a3-1/run-1/probe/service-smoke-validation.stdout.json";
  const captureStderr = "/var/lib/control-plane-a3-1/run-1/probe/service-smoke-validation.stderr.txt";
  const captures = new Map(initialCaptures ? [[captureStdout, initialCaptureKind], [captureStderr, initialCaptureKind]] : []);
  const calls = [];
  let stopped = false;
  let unitLoaded = initialUnitLoaded;
  let cgroupAvailable = cgroupPresent;
  let remainingGcPolls = 0;
  let remainingCgroupGcPolls = 0;
  let unitGcClockMs = 0;
  const unitGcSleeps = [];
  let remainingCompletionPolls = 0;
  let startCollision = false;
  let unitFailed = initialUnitFailed;
  let bindReadOnlyPaths = "";
  let collectMode = "inactive-or-failed";
  let launchedProperties = new Map();
  const executePhysicalCommand = (command, args, execution) => {
    calls.push([command, args, execution]);
    if (command === "/usr/bin/systemd-run") {
      if (unitLoaded) {
        startCollision = true;
        return { status: 1, stdout: "", stderr: "unit already exists" };
      }
      stopped = false;
      unitLoaded = true;
      unitFailed = false;
      cgroupAvailable = cgroupPresent;
      remainingCgroupGcPolls = 0;
      const propertyEntries = args
        .filter((value) => value.startsWith("--property="))
        .map((value) => value.slice("--property=".length));
      launchedProperties = new Map(propertyEntries.map((entry) => {
        const separator = entry.indexOf("=");
        return [entry.slice(0, separator), entry.slice(separator + 1)];
      }));
      bindReadOnlyPaths = launchedProperties.get("BindReadOnlyPaths") ?? "";
      collectMode = launchedProperties.get("CollectMode")
        ?? (args.includes("--collect") ? "inactive-or-failed" : "inactive");
      remainingCompletionPolls = completionPolls;
      if (remainingCompletionPolls === 0) {
        captures.set(captureStdout, "regular");
        captures.set(captureStderr, "regular");
      }
      return { status: launchStatus, stdout: "", stderr: launchStatus === 0 ? "" : "start job failed" };
    }
    if (command === "/usr/bin/systemd-analyze") {
      return {
        status: systemdAnalyzeStatus,
        stdout: systemdAnalyzeStatus === 0 ? syscallFilterCatalog : "",
        stderr: systemdAnalyzeStatus === 0 ? systemdAnalyzeStderr : "catalog unavailable"
      };
    }
    if (command !== "/usr/bin/systemctl") return { status: 70, stdout: "", stderr: "unexpected command" };
    if (args[0] === "stop") {
      if (stopStatus === 0) {
        stopped = true;
        remainingGcPolls = gcLoadedPolls;
        remainingCgroupGcPolls = cgroupGcPolls;
        if (unitFailed && stopCollectsFailedUnit) {
          unitFailed = false;
          unitLoaded = false;
        }
      }
      return { status: stopStatus, stdout: "", stderr: stopStatus === 0 ? "" : "stop failed" };
    }
    if (args[0] === "reset-failed") {
      const effectiveResetStatus = unitLoaded ? resetFailedStatus : 1;
      if (effectiveResetStatus === 0) {
        unitFailed = false;
        stopped = true;
        remainingGcPolls = gcLoadedPolls;
        remainingCgroupGcPolls = cgroupGcPolls;
      }
      return { status: effectiveResetStatus, stdout: "", stderr: effectiveResetStatus === 0 ? "" : "reset failed" };
    }
    const property = args.find((value) => value.startsWith("--property="));
    if (["LoadState", "ActiveState", "SubState", "Result", "ExecMainStatus"].every((name) => property.includes(name))) {
      if (unitFailed) {
        return {
          status: 0,
          stdout: "LoadState=loaded\nActiveState=failed\nSubState=failed\nResult=exit-code\nExecMainStatus=1\n",
          stderr: ""
        };
      }
      if (remainingCompletionPolls > 0) {
        remainingCompletionPolls -= 1;
        const values = { LoadState: "loaded", ActiveState: "activating", SubState: "start", Result: "success", ExecMainStatus: "0", ...activatingOverrides };
        return { status: 0, stdout: Object.entries(values).map(([name, value]) => `${name}=${value}\n`).join(""), stderr: "" };
      }
      captures.set(captureStdout, "regular");
      captures.set(captureStderr, "regular");
      unitFailed = completionOverrides.ActiveState === "failed";
      if (autoCollectFailedUnit && completionOverrides.ActiveState === "failed" && collectMode === "inactive-or-failed") {
        unitLoaded = false;
        return {
          status: 0,
          stdout: "LoadState=not-found\nActiveState=inactive\nSubState=dead\nResult=success\nExecMainStatus=0\n",
          stderr: ""
        };
      }
      const values = { LoadState: "loaded", ActiveState: "active", SubState: "exited", Result: "success", ExecMainStatus: "0", ...completionOverrides };
      return { status: 0, stdout: Object.entries(values).map(([name, value]) => `${name}=${value}\n`).join(""), stderr: "" };
    }
    if (property.includes("Type,RemainAfterExit,CollectMode")) {
      const normalizedBindReadback = normalizeBindReadOnlyPaths ? bindReadOnlyPaths.replaceAll(":norbind", "") : bindReadOnlyPaths;
      const requestedProperties = new Set(property.slice("--property=".length).split(","));
      const values = {
        ActiveState: "active", SubState: "exited", Result: "success", ExecMainStatus: "0",
        ControlGroup: `/system.slice/${unit}`,
        User: launchedProperties.get("User"),
        Group: launchedProperties.get("Group"),
        PrivateNetwork: launchedProperties.get("PrivateNetwork"),
        CapabilityBoundingSet: launchedProperties.get("CapabilityBoundingSet"),
        ProtectSystem: launchedProperties.get("ProtectSystem"),
        ProtectHome: launchedProperties.get("ProtectHome"),
        PrivateDevices: launchedProperties.get("PrivateDevices"),
        NoNewPrivileges: launchedProperties.get("NoNewPrivileges"),
        BindReadOnlyPaths: typeof bindReadOnlyPathsReadback === "function" ? bindReadOnlyPathsReadback(normalizedBindReadback) : normalizedBindReadback, Type: "oneshot",
        RemainAfterExit: "yes", CollectMode: collectMode,
        RestrictAddressFamilies: launchedProperties.get("RestrictAddressFamilies"),
        RestrictNamespaces: launchedProperties.get("RestrictNamespaces"),
        SystemCallFilter: launchedProperties.get("SystemCallFilter"),
        PrivateTmp: launchedProperties.get("PrivateTmp"),
        ProtectControlGroups: launchedProperties.get("ProtectControlGroups"),
        Delegate: launchedProperties.get("Delegate"),
        Slice: launchedProperties.get("Slice"),
        UMask: launchedProperties.get("UMask"),
        WorkingDirectory: launchedProperties.get("WorkingDirectory"),
        ...pinnedOverrides
      };
      if (omittedPinnedProperty !== null) delete values[omittedPinnedProperty];
      return {
        status: pinnedStatus,
        stdout: pinnedStatus === 0 ? Object.entries(values)
          .filter(([name, value]) => requestedProperties.has(name) && value !== undefined)
          .map(([name, value]) => `${name}=${value}\n`).join("") : "",
        stderr: pinnedStatus === 0 ? "" : "unit unavailable"
      };
    }
    if (!unitLoaded) return { status: 0, stdout: "LoadState=not-found\nActiveState=inactive\nSubState=dead\n", stderr: "" };
    if (unitFailed) return { status: 0, stdout: "LoadState=loaded\nActiveState=failed\nSubState=failed\n", stderr: "" };
    if (stopped && remainingGcPolls === 0) {
      unitLoaded = false;
      return { status: 0, stdout: "LoadState=not-found\nActiveState=inactive\nSubState=dead\n", stderr: "" };
    }
    if (stopped) remainingGcPolls -= 1;
    return {
      status: 0,
      stdout: stopped
        ? "LoadState=loaded\nActiveState=inactive\nSubState=dead\n"
        : "LoadState=loaded\nActiveState=active\nSubState=exited\n",
      stderr: ""
    };
  };
  const runtime = physicalRuntime({
    executePhysicalCommand,
    physicalFilesystemType: (path) => {
      if (path !== "/sys/fs/cgroup") throw new Error("unexpected filesystem path");
      return cgroupFilesystemType;
    },
    physicalPathExists: (path) => {
      if (captures.get(path) === "regular") return true;
      if (path !== cgroupRoot || !cgroupAvailable) return false;
      if (!stopped) return unitLoaded;
      if (remainingCgroupGcPolls > 0) {
        remainingCgroupGcPolls -= 1;
        return true;
      }
      cgroupAvailable = false;
      return false;
    },
    a3UnitGcMonotonicNowNs: () => BigInt(unitGcClockMs) * 1_000_000n,
    a3UnitGcSleep: (milliseconds) => {
      unitGcSleeps.push(milliseconds);
      unitGcClockMs += milliseconds;
      if (unitGcClockMs === 10_000) unitGcClockMs += unitGcLastSleepOvershootMs;
      return true;
    },
    physicalLeafState: (path) => captures.get(path) || "absent",
    validateA3ServiceSmokeCaptureBoundary: () => captureBoundaryValid,
    validateA3ServiceSmokeSource: () => sourceCustodyValid,
    readPhysicalFile: (path) => {
      if (path === "/sys/fs/cgroup/cgroup.controllers") {
        if (!cgroupControllersReadable) throw Object.assign(new Error("cgroup controllers unavailable"), { code: "ENOENT" });
        return "cpu memory pids\n";
      }
      if (path === captureStdout) return processStdout;
      if (path === captureStderr) return processStderr;
      if (path === `${cgroupRoot}/cgroup.events`) {
        if (cgroupReadEnoentWhilePresent === "events") throw Object.assign(new Error("cgroup file unavailable"), { code: "ENOENT" });
        if (!cgroupAvailable || cgroupDisappearOnRead === "events") {
          cgroupAvailable = false;
          throw Object.assign(new Error("cgroup disappeared"), { code: "ENOENT" });
        }
        return cgroupEvents;
      }
      if (path === `${cgroupRoot}/cgroup.procs`) {
        if (cgroupReadEnoentWhilePresent === "procs") throw Object.assign(new Error("cgroup file unavailable"), { code: "ENOENT" });
        if (!cgroupAvailable || cgroupDisappearOnRead === "procs") {
          cgroupAvailable = false;
          throw Object.assign(new Error("cgroup disappeared"), { code: "ENOENT" });
        }
        return cgroupProcs;
      }
      throw new Error("unexpected read path");
    },
    removePhysicalFile: (path) => { captures.delete(path); }
  });
  return {
    runtime,
    calls,
    captures,
    wasStopped: () => stopped,
    hadStartCollision: () => startCollision,
    unitGcClockMs: () => unitGcClockMs,
    unitGcSleeps
  };
}

function collectServiceSmoke(runtime, service = { uid: 4711, gid: 4712 }) {
  return collectServiceNativeSmokeEvidence({
    runLabel: "run-1",
    root: "/var/lib/control-plane-a3-1/run-1/probe/project",
    service,
    runtime
  });
}

test("collectServiceNativeSmokeEvidence pins evidence, triangulates identity, then cleans the unit and captures", () => {
  const harness = serviceSmokeHarness();
  const evidence = collectServiceSmoke(harness.runtime);
  assert.equal(evidence.serviceUid, 4711);
  assert.equal(evidence.serviceGid, 4712);
  assert.equal(evidence.cgroupEmpty, true);
  assert.equal(evidence.betterSqlite3Memory, true);
  assert.equal(harness.wasStopped(), true);
  assert.equal(harness.captures.size, 0);
  assert.equal(harness.calls.length, 10);
  assert.deepEqual(harness.calls.map(([, args]) => args[0]), [
    "show", "show", "--unit=control-plane-a3-service-smoke-run-1-validation", "show", "show", "--no-pager", "show", "stop", "show", "show"
  ]);
});

test("collectServiceNativeSmokeEvidence reads back every emitted sandbox property and the system-call catalog", () => {
  const harness = serviceSmokeHarness();
  collectServiceSmoke(harness.runtime);
  const terminalShow = harness.calls.find(([, args]) => (
    args[0] === "show" && args.some((value) => value.includes("Type,RemainAfterExit,CollectMode"))
  ));
  assert.ok(terminalShow);
  const requested = terminalShow[1]
    .find((value) => value.startsWith("--property="))
    .slice("--property=".length)
    .split(",");
  for (const name of [
    "RestrictAddressFamilies", "RestrictNamespaces", "SystemCallFilter", "PrivateTmp",
    "ProtectControlGroups", "Delegate", "Slice", "UMask", "WorkingDirectory"
  ]) {
    assert.ok(requested.includes(name), name);
  }
  const analyze = harness.calls.find(([command]) => command === "/usr/bin/systemd-analyze");
  assert.deepEqual(analyze?.[1], ["--no-pager", "syscall-filter"]);
});

test("collectServiceNativeSmokeEvidence accepts alias and exactly expanded system-call readback", () => {
  for (const SystemCallFilter of ["@system-service", "write close read"]) {
    const harness = serviceSmokeHarness({ pinnedOverrides: { SystemCallFilter } });
    const evidence = collectServiceSmoke(harness.runtime);
    assert.equal(evidence.betterSqlite3Memory, true);
    assert.equal(harness.wasStopped(), true);
    assert.equal(harness.captures.size, 0);
  }
});

test("collectServiceNativeSmokeEvidence rejects missing or drifted emitted sandbox readback", () => {
  const drifts = {
    RestrictAddressFamilies: "AF_INET",
    RestrictNamespaces: "no",
    PrivateTmp: "no",
    ProtectControlGroups: "no",
    Delegate: "yes",
    Slice: "user.slice",
    UMask: "0022",
    WorkingDirectory: "/unexpected"
  };
  for (const [name, value] of Object.entries(drifts)) {
    const wrong = serviceSmokeHarness({ pinnedOverrides: { [name]: value } });
    assert.throws(
      () => collectServiceSmoke(wrong.runtime),
      (error) => condition("worker_cleanup_uncertain")(error) && error.attentionRequired === true,
      `${name} wrong`
    );
    assert.equal(wrong.wasStopped(), true);
    assert.equal(wrong.captures.size, 0);

    const missing = serviceSmokeHarness({ omittedPinnedProperty: name });
    assert.throws(
      () => collectServiceSmoke(missing.runtime),
      (error) => condition("worker_cleanup_uncertain")(error) && error.attentionRequired === true,
      `${name} missing`
    );
    assert.equal(missing.wasStopped(), true);
    assert.equal(missing.captures.size, 0);
  }
});

test("collectServiceNativeSmokeEvidence rejects ambiguous or drifted system-call readback", () => {
  for (const SystemCallFilter of [
    "close read",
    "close read write mount",
    "~close read write",
    "@missing",
    "close close read write"
  ]) {
    const harness = serviceSmokeHarness({ pinnedOverrides: { SystemCallFilter } });
    assert.throws(
      () => collectServiceSmoke(harness.runtime),
      (error) => condition("worker_cleanup_uncertain")(error) && error.attentionRequired === true,
      SystemCallFilter
    );
    assert.equal(harness.wasStopped(), true);
    assert.equal(harness.captures.size, 0);
  }

  const missing = serviceSmokeHarness({ omittedPinnedProperty: "SystemCallFilter" });
  assert.throws(
    () => collectServiceSmoke(missing.runtime),
    (error) => condition("worker_cleanup_uncertain")(error) && error.attentionRequired === true
  );
  assert.equal(missing.wasStopped(), true);
  assert.equal(missing.captures.size, 0);
});

test("collectServiceNativeSmokeEvidence rejects malformed or unavailable system-call catalogs", () => {
  const malformedCatalogs = [
    "@default\n    close\n@system-service\n    @loop\n@loop\n    @system-service\n",
    "@default\n    close\n@default\n    read\n@system-service\n    write\n",
    "@system-service\n    read\n",
    "@default\n    close\n",
    "@default\n    close\n@system-service\n",
    "@default\n    close\n@system-service\n    @missing\n",
    "@default\n    close\n@system-service\n    read\n    read\n"
  ];
  for (const syscallFilterCatalog of malformedCatalogs) {
    const harness = serviceSmokeHarness({ syscallFilterCatalog });
    assert.throws(
      () => collectServiceSmoke(harness.runtime),
      (error) => condition("worker_cleanup_uncertain")(error) && error.attentionRequired === true
    );
    assert.equal(harness.wasStopped(), true);
    assert.equal(harness.captures.size, 0);
  }

  for (const options of [
    { systemdAnalyzeStatus: 1 },
    { systemdAnalyzeStderr: "unexpected warning" },
    { syscallFilterCatalog: "x".repeat(256 * 1024 + 1) }
  ]) {
    const harness = serviceSmokeHarness(options);
    assert.throws(
      () => collectServiceSmoke(harness.runtime),
      (error) => condition("worker_cleanup_uncertain")(error) && error.attentionRequired === true
    );
    assert.equal(harness.wasStopped(), true);
    assert.equal(harness.captures.size, 0);
  }
});

test("collectServiceNativeSmokeEvidence bounds the native launch and collection readbacks", () => {
  const harness = serviceSmokeHarness();
  collectServiceSmoke(harness.runtime);
  const launch = harness.calls.find(([command]) => command === "/usr/bin/systemd-run");
  assert.deepEqual(launch[2], { timeoutMs: 300_000 });
  assert.equal(Object.isFrozen(launch[2]), true);
  const analyze = harness.calls.find(([command]) => command === "/usr/bin/systemd-analyze");
  assert.deepEqual(analyze[2], { timeoutMs: 15_000, maxOutputBytes: 256 * 1024 });
  assert.equal(Object.isFrozen(analyze[2]), true);
  const collectionReadbacks = harness.calls.filter(([command, args, execution]) => (
    command === "/usr/bin/systemctl"
    && args[0] === "show"
    && args.includes("--property=LoadState,ActiveState,SubState")
    && execution.timeoutMs !== 15_000
  ));
  assert.equal(collectionReadbacks.length, 2);
  for (const call of collectionReadbacks) {
    assert.deepEqual(call[2], { timeoutMs: 1_000 });
    assert.equal(Object.isFrozen(call[2]), true);
  }
  for (const call of harness.calls.filter((candidate) => {
    const [command] = candidate;
    return command !== "/usr/bin/systemd-run" && command !== "/usr/bin/systemd-analyze"
      && !collectionReadbacks.includes(candidate);
  })) {
    assert.deepEqual(call[2], { timeoutMs: 15_000 });
    assert.equal(Object.isFrozen(call[2]), true);
  }
});

test("collectServiceNativeSmokeEvidence waits for oneshot completion before reading captures", () => {
  const harness = serviceSmokeHarness({ completionPolls: 2 });
  const evidence = collectServiceSmoke(harness.runtime);
  assert.equal(evidence.betterSqlite3Memory, true);
  assert.equal(harness.wasStopped(), true);
  assert.equal(harness.captures.size, 0);
});

test("collectServiceNativeSmokeEvidence accepts systemd's empty Result while oneshot is activating", () => {
  const harness = serviceSmokeHarness({ completionPolls: 2, activatingOverrides: { Result: "" } });
  const evidence = collectServiceSmoke(harness.runtime);
  assert.equal(evidence.betterSqlite3Memory, true);
  assert.equal(harness.wasStopped(), true);
  assert.equal(harness.captures.size, 0);
});

test("collectServiceNativeSmokeEvidence fails closed when oneshot completion exceeds the bound", () => {
  const harness = serviceSmokeHarness({ completionPolls: Number.POSITIVE_INFINITY });
  assert.throws(
    () => collectServiceSmoke(harness.runtime),
    (error) => condition("worker_cleanup_uncertain")(error) && error.attentionRequired === true
  );
  assert.equal(harness.wasStopped(), true);
  assert.equal(harness.captures.size, 0);
});

test("collectServiceNativeSmokeEvidence preserves a definitive failed oneshot result", () => {
  const harness = serviceSmokeHarness({ completionOverrides: { ActiveState: "failed", SubState: "failed", Result: "exit-code", ExecMainStatus: "1" } });
  assert.throws(() => collectServiceSmoke(harness.runtime), condition("service_smoke_readback_invalid"));
  assert.equal(harness.wasStopped(), true);
  assert.equal(harness.captures.size, 0);
});

test("collectServiceNativeSmokeEvidence preserves the bounded smoke classifier before failed-oneshot cleanup", () => {
  const harness = serviceSmokeHarness({
    processStdout: "",
    processStderr: '{"schemaVersion":"3","type":"control_plane_dependency_artifact","mode":"smoke","state":"blocked","condition":"native_module_validation_failed"}\n',
    completionOverrides: { ActiveState: "failed", SubState: "failed", Result: "exit-code", ExecMainStatus: "1" }
  });
  assert.throws(() => collectServiceSmoke(harness.runtime), condition("native_module_validation_failed"));
  assert.equal(harness.wasStopped(), true);
  assert.equal(harness.captures.size, 0);
});

for (const smokeCondition of [
  "dependency_smoke_identity_invalid",
  "dependency_smoke_snapshot_invalid",
  "dependency_smoke_invalid"
]) {
  test(`collectServiceNativeSmokeEvidence strictly accepts and preserves ${smokeCondition}`, () => {
    const harness = serviceSmokeHarness({
      processStdout: "",
      processStderr: `${JSON.stringify({ schemaVersion: "3", type: "control_plane_dependency_artifact", mode: "smoke", state: "blocked", condition: smokeCondition })}\n`,
      completionOverrides: { ActiveState: "failed", SubState: "failed", Result: "exit-code", ExecMainStatus: "1" }
    });
    assert.throws(() => collectServiceSmoke(harness.runtime), condition(smokeCondition));
    assert.equal(harness.wasStopped(), true);
    assert.equal(harness.captures.size, 0);
  });
}

test("collectServiceNativeSmokeEvidence reads the bounded classifier after systemd-run reports the failed start job", () => {
  const harness = serviceSmokeHarness({
    launchStatus: 1,
    processStdout: "",
    processStderr: '{"schemaVersion":"3","type":"control_plane_dependency_artifact","mode":"smoke","state":"blocked","condition":"native_module_validation_failed"}\n',
    completionOverrides: { ActiveState: "failed", SubState: "failed", Result: "exit-code", ExecMainStatus: "1" }
  });
  assert.throws(() => collectServiceSmoke(harness.runtime), condition("native_module_validation_failed"));
  assert.equal(harness.calls.some(([, args]) => args[0] === "reset-failed"), true);
  assert.equal(harness.wasStopped(), true);
  assert.equal(harness.captures.size, 0);
});

test("collectServiceNativeSmokeEvidence keeps cleanup uncertainty above a classifier when reset-failed fails", () => {
  const harness = serviceSmokeHarness({
    launchStatus: 1,
    resetFailedStatus: 1,
    processStdout: "",
    processStderr: '{"schemaVersion":"3","type":"control_plane_dependency_artifact","mode":"smoke","state":"blocked","condition":"native_module_validation_failed"}\n',
    completionOverrides: { ActiveState: "failed", SubState: "failed", Result: "exit-code", ExecMainStatus: "1" }
  });
  assert.throws(
    () => collectServiceSmoke(harness.runtime),
    (error) => condition("worker_cleanup_uncertain")(error) && error.attentionRequired === true
  );
  assert.equal(harness.calls.some(([, args]) => args[0] === "reset-failed"), true);
  assert.equal(harness.captures.size, 2);
});

test("collectServiceNativeSmokeEvidence tolerates stop collecting an exact failed unit before reset-failed", () => {
  const harness = serviceSmokeHarness({
    launchStatus: 1,
    stopCollectsFailedUnit: true,
    processStdout: "",
    processStderr: '{"schemaVersion":"3","type":"control_plane_dependency_artifact","mode":"smoke","state":"blocked","condition":"native_module_validation_failed"}\n',
    completionOverrides: { ActiveState: "failed", SubState: "failed", Result: "exit-code", ExecMainStatus: "1" }
  });
  assert.throws(() => collectServiceSmoke(harness.runtime), condition("native_module_validation_failed"));
  assert.equal(harness.calls.some(([, args]) => args[0] === "reset-failed"), false);
  assert.equal(harness.captures.size, 0);
});

test("collectServiceNativeSmokeEvidence keeps a failed oneshot readable until its classifier is captured", () => {
  const harness = serviceSmokeHarness({
    launchStatus: 1,
    autoCollectFailedUnit: true,
    processStdout: "",
    processStderr: '{"schemaVersion":"3","type":"control_plane_dependency_artifact","mode":"smoke","state":"blocked","condition":"native_module_validation_failed"}\n',
    completionOverrides: { ActiveState: "failed", SubState: "failed", Result: "exit-code", ExecMainStatus: "1" }
  });
  assert.throws(() => collectServiceSmoke(harness.runtime), condition("native_module_validation_failed"));
  const launch = harness.calls.find(([command]) => command === "/usr/bin/systemd-run");
  assert.ok(launch[1].includes("--property=CollectMode=inactive"));
  assert.equal(launch[1].includes("--collect"), false);
  assert.equal(harness.wasStopped(), true);
  assert.equal(harness.captures.size, 0);
});

test("collectServiceNativeSmokeEvidence rejects a failed launch that contradicts successful unit evidence", () => {
  const harness = serviceSmokeHarness({ launchStatus: 1 });
  assert.throws(() => collectServiceSmoke(harness.runtime), condition("service_smoke_readback_invalid"));
  assert.equal(harness.wasStopped(), true);
  assert.equal(harness.captures.size, 0);
});

test("collectServiceNativeSmokeEvidence gives cleanup uncertainty priority over a valid failed-launch classifier", () => {
  const harness = serviceSmokeHarness({
    launchStatus: 1,
    stopStatus: 1,
    processStdout: "",
    processStderr: '{"schemaVersion":"3","type":"control_plane_dependency_artifact","mode":"smoke","state":"blocked","condition":"native_module_validation_failed"}\n',
    completionOverrides: { ActiveState: "failed", SubState: "failed", Result: "exit-code", ExecMainStatus: "1" }
  });
  assert.throws(
    () => collectServiceSmoke(harness.runtime),
    (error) => condition("worker_cleanup_uncertain")(error) && error.attentionRequired === true
  );
  assert.equal(harness.wasStopped(), false);
  assert.equal(harness.captures.size, 2);
});

test("collectServiceNativeSmokeEvidence collects a stale captureless unit before launch", () => {
  const harness = serviceSmokeHarness({
    initialUnitLoaded: true,
    processStdout: "",
    processStderr: '{"schemaVersion":"3","type":"control_plane_dependency_artifact","mode":"smoke","state":"blocked","condition":"native_module_validation_failed"}\n',
    completionOverrides: { ActiveState: "failed", SubState: "failed", Result: "exit-code", ExecMainStatus: "1" }
  });
  assert.throws(() => collectServiceSmoke(harness.runtime), condition("native_module_validation_failed"));
  assert.equal(harness.hadStartCollision(), false);
  assert.equal(harness.wasStopped(), true);
  assert.equal(harness.captures.size, 0);
});

test("collectServiceNativeSmokeEvidence resets an exact stale failed unit before a fresh launch", () => {
  const harness = serviceSmokeHarness({ initialUnitLoaded: true, initialUnitFailed: true });
  const evidence = collectServiceSmoke(harness.runtime);
  assert.equal(evidence.betterSqlite3Memory, true);
  assert.equal(harness.calls.filter(([, args]) => args[0] === "reset-failed").length, 1);
  assert.equal(harness.hadStartCollision(), false);
  assert.equal(harness.wasStopped(), true);
  assert.equal(harness.captures.size, 0);
});

test("collectServiceNativeSmokeEvidence rejects untrusted failed-oneshot envelopes", () => {
  const envelopes = [
    '{"schemaVersion":"3","type":"control_plane_dependency_artifact","mode":"smoke","state":"blocked","condition":"service_identity_invalid"}\n',
    '{"schemaVersion":"3","type":"control_plane_dependency_artifact","mode":"smoke","state":"verified","condition":"native_module_validation_failed"}\n',
    '{"schemaVersion":"3","type":"control_plane_dependency_artifact","mode":"smoke","state":"blocked","condition":"native_module_validation_failed","extra":true}\n',
    'not-json\n'
  ];
  for (const processStderr of envelopes) {
    const harness = serviceSmokeHarness({
      processStdout: "",
      processStderr,
      completionOverrides: { ActiveState: "failed", SubState: "failed", Result: "exit-code", ExecMainStatus: "1" }
    });
    assert.throws(() => collectServiceSmoke(harness.runtime), condition("service_smoke_readback_invalid"));
    assert.equal(harness.wasStopped(), true);
    assert.equal(harness.captures.size, 0);
  }
});

test("collectServiceNativeSmokeEvidence rejects mixed stdout and failure evidence", () => {
  const harness = serviceSmokeHarness({
    processStdout: VALID_SERVICE_SMOKE_STDOUT,
    processStderr: '{"schemaVersion":"3","type":"control_plane_dependency_artifact","mode":"smoke","state":"blocked","condition":"native_module_validation_failed"}\n',
    completionOverrides: { ActiveState: "failed", SubState: "failed", Result: "exit-code", ExecMainStatus: "1" }
  });
  assert.throws(() => collectServiceSmoke(harness.runtime), condition("service_smoke_readback_invalid"));
  assert.equal(harness.wasStopped(), true);
  assert.equal(harness.captures.size, 0);
});

test("collectServiceNativeSmokeEvidence rejects a non-CLI exit status even with a valid failure envelope", () => {
  const harness = serviceSmokeHarness({
    processStdout: "",
    processStderr: '{"schemaVersion":"3","type":"control_plane_dependency_artifact","mode":"smoke","state":"blocked","condition":"native_module_validation_failed"}\n',
    completionOverrides: { ActiveState: "failed", SubState: "failed", Result: "exit-code", ExecMainStatus: "2" }
  });
  assert.throws(() => collectServiceSmoke(harness.runtime), condition("service_smoke_readback_invalid"));
  assert.equal(harness.wasStopped(), true);
  assert.equal(harness.captures.size, 0);
});

test("collectServiceNativeSmokeEvidence accepts systemd-normalized readonly bind readback", () => {
  const harness = serviceSmokeHarness({ normalizeBindReadOnlyPaths: true });
  const evidence = collectServiceSmoke(harness.runtime);
  assert.equal(evidence.cgroupEmpty, true);
  const launchBind = harness.calls.find(([command]) => command === "/usr/bin/systemd-run")[1]
    .find((value) => value.startsWith("--property=BindReadOnlyPaths="));
  assert.equal(launchBind.match(/:norbind/g)?.length, 4);
  assert.equal(harness.wasStopped(), true);
  assert.equal(harness.captures.size, 0);
});

test("collectServiceNativeSmokeEvidence rejects normalized readonly bind entry and path drift", () => {
  const mutations = {
    missing: (value) => value.slice(0, value.indexOf(" ")),
    extra: (value) => `${value} /unexpected:/unexpected`,
    source: (value) => value.replace("/var/lib/control-plane-a3-1/run-1/probe/project", "/var/lib/control-plane-a3-1/run-1/probe/project-drift"),
    target: (value) => value.replace("/run/control-plane-a3-service-smoke/", "/run/control-plane-a3-service-smoke-drift/")
  };
  for (const [name, bindReadOnlyPathsReadback] of Object.entries(mutations)) {
    const harness = serviceSmokeHarness({ bindReadOnlyPathsReadback });
    assert.throws(
      () => collectServiceSmoke(harness.runtime),
      (error) => condition("worker_cleanup_uncertain")(error) && error.attentionRequired === true,
      name
    );
    assert.equal(harness.wasStopped(), true);
    assert.equal(harness.captures.size, 0);
  }
});

test("collectServiceNativeSmokeEvidence accepts an empty ControlGroup after systemd already removed the cgroup", () => {
  const harness = serviceSmokeHarness({ pinnedOverrides: { ControlGroup: "" }, cgroupPresent: false });
  const evidence = collectServiceSmoke(harness.runtime);
  assert.equal(evidence.cgroupEmpty, true);
  assert.equal(harness.wasStopped(), true);
  assert.equal(harness.captures.size, 0);
});

test("collectServiceNativeSmokeEvidence requires a proven cgroup v2 root before accepting an absent unit cgroup", () => {
  for (const options of [
    { cgroupFilesystemType: 0x27e0eb },
    { cgroupControllersReadable: false }
  ]) {
    const harness = serviceSmokeHarness({ pinnedOverrides: { ControlGroup: "" }, cgroupPresent: false, ...options });
    assert.throws(
      () => collectServiceSmoke(harness.runtime),
      (error) => condition("worker_cleanup_uncertain")(error) && error.attentionRequired === true
    );
    assert.equal(harness.calls.length, 0);
    assert.equal(harness.captures.size, 0);
  }
});

test("collectServiceNativeSmokeEvidence accepts an empty ControlGroup while the remaining cgroup is proven empty", () => {
  const harness = serviceSmokeHarness({ pinnedOverrides: { ControlGroup: "" }, cgroupPresent: true });
  const evidence = collectServiceSmoke(harness.runtime);
  assert.equal(evidence.cgroupEmpty, true);
  assert.equal(harness.wasStopped(), true);
  assert.equal(harness.captures.size, 0);
});

test("collectServiceNativeSmokeEvidence accepts cgroup collection racing either empty-state read", () => {
  for (const cgroupDisappearOnRead of ["events", "procs"]) {
    const harness = serviceSmokeHarness({ pinnedOverrides: { ControlGroup: "" }, cgroupDisappearOnRead });
    const evidence = collectServiceSmoke(harness.runtime);
    assert.equal(evidence.cgroupEmpty, true);
    assert.equal(harness.wasStopped(), true);
    assert.equal(harness.captures.size, 0);
  }
});

test("collectServiceNativeSmokeEvidence rejects missing cgroup files while the cgroup root remains", () => {
  for (const cgroupReadEnoentWhilePresent of ["events", "procs"]) {
    const harness = serviceSmokeHarness({ pinnedOverrides: { ControlGroup: "" }, cgroupReadEnoentWhilePresent });
    assert.throws(
      () => collectServiceSmoke(harness.runtime),
      (error) => condition("worker_cleanup_uncertain")(error) && error.attentionRequired === true,
      cgroupReadEnoentWhilePresent
    );
    assert.equal(harness.wasStopped(), true);
    assert.equal(harness.captures.size, 0);
  }
});

test("collectServiceNativeSmokeEvidence cleans interrupted-run captures before a bounded retry", () => {
  const harness = serviceSmokeHarness({ initialCaptures: true });
  const evidence = collectServiceSmoke(harness.runtime);
  assert.equal(evidence.cgroupEmpty, true);
  assert.equal(harness.wasStopped(), true);
  assert.equal(harness.captures.size, 0);
  assert.deepEqual(harness.calls.map(([, args]) => args[0]), [
    "show", "stop", "show", "show", "--unit=control-plane-a3-service-smoke-run-1-validation", "show", "show", "--no-pager", "show", "stop", "show", "show"
  ]);
});

test("collectServiceNativeSmokeEvidence cleans safe interrupted state before rejecting source custody", () => {
  const harness = serviceSmokeHarness({ initialCaptures: true, sourceCustodyValid: false });
  assert.throws(() => collectServiceSmoke(harness.runtime), condition("service_smoke_readback_invalid"));
  assert.equal(harness.wasStopped(), true);
  assert.equal(harness.captures.size, 0);
    assert.deepEqual(harness.calls.map(([, args]) => args[0]), ["show", "stop", "show", "show"]);
});

test("collectServiceNativeSmokeEvidence rejects dangling symlink and non-regular capture leaves before root systemd launch", () => {
  for (const initialCaptureKind of ["symbolicLink", "other"]) {
    const harness = serviceSmokeHarness({ initialCaptures: true, initialCaptureKind });
    assert.throws(
      () => collectServiceSmoke(harness.runtime),
      (error) => condition("service_smoke_readback_invalid")(error) && error.attentionRequired === true,
      initialCaptureKind
    );
    assert.equal(harness.calls.length, 0);
    assert.equal(harness.captures.size, 2);
  }
});

test("collectServiceNativeSmokeEvidence preserves stale state when the capture parent boundary is untrusted", () => {
  const harness = serviceSmokeHarness({ initialCaptures: true, captureBoundaryValid: false });
  assert.throws(
    () => collectServiceSmoke(harness.runtime),
    (error) => condition("service_smoke_readback_invalid")(error) && error.attentionRequired === true
  );
  assert.equal(harness.wasStopped(), false);
  assert.equal(harness.calls.length, 0);
  assert.equal(harness.captures.size, 2);
});

test("collectServiceNativeSmokeEvidence waits for transient unit GC before a same-name retry", () => {
  const harness = serviceSmokeHarness({ initialCaptures: true, gcLoadedPolls: 60 });
  const evidence = collectServiceSmoke(harness.runtime);
  assert.equal(evidence.cgroupEmpty, true);
  assert.equal(harness.hadStartCollision(), false);
  assert.equal(harness.captures.size, 0);
});

test("collectServiceNativeSmokeEvidence waits for empty cgroup GC after unit collection", () => {
  const harness = serviceSmokeHarness({ cgroupGcPolls: 60 });
  const evidence = collectServiceSmoke(harness.runtime);
  assert.equal(evidence.cgroupEmpty, true);
  assert.equal(harness.hadStartCollision(), false);
  assert.equal(harness.captures.size, 0);
  assert.equal(harness.unitGcClockMs(), 3_000);
  assert.deepEqual(new Set(harness.unitGcSleeps), new Set([50]));
});

test("collectServiceNativeSmokeEvidence observes joint unit and cgroup GC at the final bounded readback", () => {
  const harness = serviceSmokeHarness({ gcLoadedPolls: 201, cgroupGcPolls: 200 });
  const evidence = collectServiceSmoke(harness.runtime);
  assert.equal(evidence.cgroupEmpty, true);
  assert.equal(harness.hadStartCollision(), false);
  assert.equal(harness.captures.size, 0);
  assert.equal(harness.unitGcClockMs(), 10_000);
  assert.equal(harness.unitGcSleeps.length, 200);
  assert.deepEqual(new Set(harness.unitGcSleeps), new Set([50]));
  const finalReadback = harness.calls.filter(([, args]) => (
    args[0] === "show" && args.includes("--property=LoadState,ActiveState,SubState")
  )).at(-1);
  assert.deepEqual(finalReadback[2], { timeoutMs: 1_000 });
});

test("collectServiceNativeSmokeEvidence performs one final readback after bounded sleep overshoot", () => {
  const harness = serviceSmokeHarness({
    gcLoadedPolls: 201,
    cgroupGcPolls: 200,
    unitGcLastSleepOvershootMs: 1
  });
  const evidence = collectServiceSmoke(harness.runtime);
  assert.equal(evidence.cgroupEmpty, true);
  assert.equal(harness.unitGcClockMs(), 10_001);
  assert.equal(harness.unitGcSleeps.length, 200);
  const finalReadback = harness.calls.filter(([, args]) => (
    args[0] === "show" && args.includes("--property=LoadState,ActiveState,SubState")
  )).at(-1);
  assert.deepEqual(finalReadback[2], { timeoutMs: 1_000 });
});

test("collectServiceNativeSmokeEvidence fails attention-required when transient unit GC exceeds the bound", () => {
  const harness = serviceSmokeHarness({ gcLoadedPolls: 202 });
  assert.throws(
    () => collectServiceSmoke(harness.runtime),
    (error) => condition("worker_cleanup_uncertain")(error) && error.attentionRequired === true
  );
  assert.equal(harness.hadStartCollision(), false);
  assert.equal(harness.captures.size, 2);
  assert.equal(harness.unitGcClockMs(), 10_000);
  assert.equal(harness.unitGcSleeps.length, 200);
});

test("collectServiceNativeSmokeEvidence fails attention-required when empty cgroup GC exceeds the bound", () => {
  const harness = serviceSmokeHarness({ cgroupGcPolls: 201 });
  assert.throws(
    () => collectServiceSmoke(harness.runtime),
    (error) => condition("worker_cleanup_uncertain")(error) && error.attentionRequired === true
  );
  assert.equal(harness.hadStartCollision(), false);
  assert.equal(harness.captures.size, 2);
  assert.equal(harness.unitGcClockMs(), 10_000);
  assert.equal(harness.unitGcSleeps.length, 200);
});

test("collectServiceNativeSmokeEvidence rejects false or throwing source custody proof before launch", () => {
  for (const validateA3ServiceSmokeSource of [() => false, () => { throw new Error("unsafe source"); }]) {
    const harness = serviceSmokeHarness();
    harness.runtime.validateA3ServiceSmokeSource = validateA3ServiceSmokeSource;
    assert.throws(() => collectServiceSmoke(harness.runtime), condition("service_smoke_readback_invalid"));
    assert.deepEqual(harness.calls.map(([, args]) => args[0]), ["show", "show"]);
    assert.equal(harness.captures.size, 0);
  }
});

test("service-native smoke source custody hook receives the exact fourth contract module", () => {
  const observed = [];
  const harness = serviceSmokeHarness();
  harness.runtime.validateA3ServiceSmokeSource = (value) => {
    observed.push(value);
    return true;
  };
  collectServiceSmoke(harness.runtime);
  assert.equal(observed.length, 1);
  assert.deepEqual(Object.keys(observed[0]).sort(), [
    "root",
    "snapshotModule",
    "worker",
    "workerContract",
    "workerLibrary"
  ]);
  assert.match(observed[0].workerContract, /control-plane-welcome-coins-native-contract\.mjs$/);
});

test("service-native smoke rejects unsafe fourth contract-module source leaves", async (t) => {
  const repositoryRoot = resolve(".");
  const temporaryRoot = mkdtempSync(join(tmpdir(), "service-smoke-contract-"));
  t.after(() => rmSync(temporaryRoot, { recursive: true, force: true }));
  const invocationFor = (workerContract) => ({
    worker: resolve("scripts/control-plane-dependency-artifact-cli.mjs"),
    workerLibrary: resolve("scripts/control-plane-dependency-artifact-lib.mjs"),
    workerContract
  });
  const supplied = {
    requireRoot: false,
    enforceOwnership: false,
    checkAclCapabilities: () => true
  };
  const rejected = (workerContract) => assert.throws(
    () => validateA3ServiceSmokeSource(invocationFor(workerContract), repositoryRoot, supplied),
    condition("service_smoke_readback_invalid")
  );

  await t.test("missing", () => rejected(join(temporaryRoot, "missing.mjs")));
  await t.test("symlink", (subtest) => {
    const target = join(temporaryRoot, "target.mjs");
    const alias = join(temporaryRoot, "alias.mjs");
    writeFileSync(target, "export const value = true;\n", { mode: 0o600 });
    try {
      symlinkSync(target, alias, "file");
    } catch (error) {
      if (error?.code === "EPERM") {
        subtest.skip("Windows file symlink privilege unavailable");
        return;
      }
      throw error;
    }
    rejected(alias);
  });
  await t.test("writable", () => {
    const path = join(temporaryRoot, "writable.mjs");
    writeFileSync(path, "export const value = true;\n");
    chmodSync(path, 0o666);
    rejected(path);
  });
  await t.test("non-regular replacement", () => {
    const path = join(temporaryRoot, "replacement.mjs");
    mkdirSync(path);
    rejected(path);
  });
});

test("collectServiceNativeSmokeEvidence rejects requested, observed and systemctl identity drift", () => {
  const cases = [
    [serviceSmokeHarness(), { uid: 9999, gid: 8888 }, "service_smoke_readback_invalid", false],
    [serviceSmokeHarness({ pinnedOverrides: { User: "4712" } }), { uid: 4711, gid: 4712 }, "worker_cleanup_uncertain", true]
  ];
  for (const [harness, service, expected, attentionRequired] of cases) {
    assert.throws(
      () => collectServiceSmoke(harness.runtime, service),
      (error) => condition(expected)(error) && Boolean(error.attentionRequired) === attentionRequired
    );
    assert.equal(harness.wasStopped(), true);
    assert.equal(harness.captures.size, 0);
  }
});

test("collectServiceNativeSmokeEvidence rejects malformed or wrong-version process envelopes", () => {
  const cases = [
    '{"schemaVersion":"3","type":"control_plane_dependency_artifact","mode":"smoke","state":"verified","smoke":{"betterSqlite3Memory":true,"snapshotImport":true}}\n',
    '{"schemaVersion":"3","type":"control_plane_dependency_artifact","mode":"smoke","state":"verified","smoke":{"betterSqlite3Memory":true,"snapshotImport":true},"processIdentity":{"uid":4711,"gid":4712,"extra":1}}\n',
    '{"schemaVersion":"2","type":"control_plane_dependency_artifact","mode":"smoke","state":"verified","smoke":{"betterSqlite3Memory":true,"snapshotImport":true}}\n',
    '{"schemaVersion":"3","schemaVersion":"3","type":"control_plane_dependency_artifact","mode":"smoke","state":"verified","smoke":{"betterSqlite3Memory":true,"snapshotImport":true},"processIdentity":{"uid":4711,"gid":4712}}\n',
    '{"schemaVersion":"3","type":"wrong_type","mode":"smoke","state":"verified","smoke":{"betterSqlite3Memory":true,"snapshotImport":true},"processIdentity":{"uid":4711,"gid":4712}}\n',
    '{"schemaVersion":"3","type":"control_plane_dependency_artifact","mode":"build","state":"verified","smoke":{"betterSqlite3Memory":true,"snapshotImport":true},"processIdentity":{"uid":4711,"gid":4712}}\n',
    '{"schemaVersion":"3","type":"control_plane_dependency_artifact","mode":"smoke","state":"failed","smoke":{"betterSqlite3Memory":true,"snapshotImport":true},"processIdentity":{"uid":4711,"gid":4712}}\n'
  ];
  for (const processStdout of cases) {
    const harness = serviceSmokeHarness({ processStdout });
    assert.throws(() => collectServiceSmoke(harness.runtime), condition("service_smoke_readback_invalid"), processStdout);
    assert.equal(harness.wasStopped(), true);
    assert.equal(harness.captures.size, 0);
  }
});

test("collectServiceNativeSmokeEvidence rejects invalid process identity values", () => {
  const cases = [
    { uid: null, gid: 4712 }, { uid: 4711, gid: null }, { uid: "4711", gid: 4712 },
    { uid: 4711, gid: "4712" }, { uid: 1.5, gid: 4712 }, { uid: 4711, gid: 1.5 },
    { uid: -1, gid: 4712 }, { uid: 4711, gid: -1 }, { uid: Number.MAX_SAFE_INTEGER + 2, gid: 4712 }
  ];
  for (const identity of cases) {
    const processStdout = `{"schemaVersion":"3","type":"control_plane_dependency_artifact","mode":"smoke","state":"verified","smoke":{"betterSqlite3Memory":true,"snapshotImport":true},"processIdentity":${JSON.stringify(identity)}}\n`;
    const harness = serviceSmokeHarness({ processStdout });
    assert.throws(() => collectServiceSmoke(harness.runtime), condition("service_smoke_readback_invalid"), JSON.stringify(identity));
    assert.equal(harness.wasStopped(), true);
  }
});

test("collectServiceNativeSmokeEvidence marks pinned unit and cgroup uncertainty as attention-required", () => {
  for (const harness of [
    serviceSmokeHarness({ pinnedStatus: 1 }),
    serviceSmokeHarness({ pinnedOverrides: { ControlGroup: "/system.slice/unexpected.service" }, cgroupPresent: false }),
    serviceSmokeHarness({ cgroupEvents: "populated 1\n", cgroupProcs: "991\n" })
  ]) {
    assert.throws(
      () => collectServiceSmoke(harness.runtime),
      (error) => condition("worker_cleanup_uncertain")(error) && error.attentionRequired === true
    );
    assert.equal(harness.wasStopped(), true);
    assert.equal(harness.captures.size, 0);
  }
});

test("collectServiceNativeSmokeEvidence preserves cleanup uncertainty over otherwise valid evidence", () => {
  const harness = serviceSmokeHarness({ stopStatus: 1 });
  assert.throws(
    () => collectServiceSmoke(harness.runtime),
    (error) => condition("worker_cleanup_uncertain")(error) && error.attentionRequired === true
  );
  assert.equal(harness.wasStopped(), false);
  assert.equal(harness.captures.size, 2);
});

// Production entrypoints must stay fail-closed: even when the test-only
// runtime injection includes both boundary hooks, the production guard fires
// before the collector or the runner is consulted. We assemble the runtime
// manually (bypassing createCandidateDependencyGateTestRuntime's hard-coded
// requireRoot: false) so we can reproduce the production branch exactly.
function productionRuntime(overrides = {}) {
  return {
    platform: "linux",
    requireRoot: true,
    enforceOwnership: true,
    getuid: () => 0,
    getgid: () => 0,
    root: "/opt/proxy-gateway-minimal-candidate",
    stateRoot: "/var/lib/proxy-gateway-minimal/state",
    statePublicRoot: "/var/lib/proxy-gateway-minimal/state-public",
    workerInputRoot: "/var/lib/proxy-gateway-minimal/worker-input",
    sealedArchiveRoot: "/var/lib/proxy-gateway-minimal/sealed-archives",
    lockRoot: "/var/lock/proxy-gateway-minimal",
    now: () => "1970-01-01T00:00:00.000Z",
    tools: {
      systemctl: "/usr/bin/systemctl",
      systemdRun: "/usr/bin/systemd-run",
      systemdAnalyze: "/usr/bin/systemd-analyze",
      env: "/usr/bin/env",
      npm: "/usr/bin/npm",
      node: "/usr/bin/node",
      tar: "/usr/bin/tar",
      python: "/usr/bin/python3",
      getfacl: "/usr/bin/getfacl",
      getcap: "/usr/sbin/getcap"
    },
    allowTestWorkerStorage: true,
    collectStorageQuotaEvidence: () => quotaEvidence(),
    runServiceNativeSmoke: ({ service }) => smokeReadback({
      serviceUid: service.uid,
      serviceGid: service.gid
    }),
    ...overrides
  };
}

test("preflightCandidateDependencies stays fail-closed under requireRoot even with test injection", () => {
  assert.throws(
    () => preflightCandidateDependencies({
      candidateRelease: "candidate",
      expectedCurrentRelease: "active",
      runtime: productionRuntime()
    }),
    condition("worker_storage_limit_unavailable")
  );
});

test("materializeCandidateDependencies stays fail-closed under requireRoot even with test injection", async () => {
  await assert.rejects(
    materializeCandidateDependencies({
      candidateRelease: "candidate",
      expectedCurrentRelease: "active",
      expectedSourceCommit: "a".repeat(40),
      expectedArtifactRelease: "candidate",
      expectedDependencyManifestSha256: "b".repeat(64),
      expectedDependencyArchiveSha256: "c".repeat(64),
      apply: true,
      runtime: productionRuntime()
    }),
    condition("worker_storage_limit_unavailable")
  );
});

test("verifyCandidateDependencies stays fail-closed under requireRoot even with test injection", async () => {
  await assert.rejects(
    verifyCandidateDependencies({
      candidateRelease: "candidate",
      expectedCurrentRelease: "active",
      expectedSourceCommit: "a".repeat(40),
      expectedArtifactRelease: "candidate",
      expectedDependencyManifestSha256: "b".repeat(64),
      expectedDependencyArchiveSha256: "c".repeat(64),
      runtime: productionRuntime()
    }),
    condition("worker_storage_limit_unavailable")
  );
});

test("production A3 runtime is explicit, fixed-root, and advances past the legacy guard", async () => {
  const integrated = createCandidateDependencyGateProductionRuntime({ runLabel: "a3-prod-1", projectId: 4242 });
  assert.equal(integrated.root, "/opt/proxy-gateway-minimal-candidate");
  assert.equal(integrated.requireRoot, true);
  assert.equal(integrated.enforceOwnership, true);
  assert.equal(integrated.a3ProjectId, 4242);
  assert.equal(integrated.a3RunLabel, "a3-prod-1");
  assert.equal(integrated.tools.systemdAnalyze, "/usr/bin/systemd-analyze");
  const smoke = buildProductionServiceNativeSmokeInvocation({
    smokePhase: "postpublish",
    root: "/opt/proxy-gateway-minimal-candidate/releases/candidate",
    service: { uid: 4711, gid: 4712 },
    runtime: integrated
  });
  assert.equal(smoke.command, "/usr/bin/systemd-run");
  assert.ok(smoke.args.includes("--service-type=oneshot"));
  assert.ok(smoke.bindReadOnlyPaths.includes("/opt/proxy-gateway-minimal-candidate/releases/candidate:/run/control-plane-a3-service-smoke/control-plane-a3-service-smoke-a3-prod-1-postpublish/project:norbind"));
  assert.equal(smoke.captureStdout, "/run/control-plane-candidate-dependency-gates/service-smoke-postpublish.stdout.json");

  assert.throws(
    () => preflightCandidateDependencies({ candidateRelease: "candidate", expectedCurrentRelease: "active", runtime: integrated }),
    (error) => error instanceof CandidateDependencyGateError && error.condition !== "worker_storage_limit_unavailable"
  );
  await assert.rejects(
    materializeCandidateDependencies({
      candidateRelease: "candidate", expectedCurrentRelease: "active",
      expectedSourceCommit: "a".repeat(40), expectedArtifactRelease: "candidate",
      expectedDependencyManifestSha256: "b".repeat(64), expectedDependencyArchiveSha256: "c".repeat(64),
      apply: true, runtime: integrated
    }),
    (error) => error instanceof CandidateDependencyGateError && error.condition !== "worker_storage_limit_unavailable"
  );
  await assert.rejects(
    verifyCandidateDependencies({
      candidateRelease: "candidate", expectedCurrentRelease: "active",
      expectedSourceCommit: "a".repeat(40), expectedArtifactRelease: "candidate",
      expectedDependencyManifestSha256: "b".repeat(64), expectedDependencyArchiveSha256: "c".repeat(64),
      runtime: integrated
    }),
    (error) => error instanceof CandidateDependencyGateError && error.condition !== "worker_storage_limit_unavailable"
  );
});

test("production bounded-artifact runtime is explicit and does not require an XFS project identity", () => {
  const bounded = createCandidateDependencyGateBoundedProductionRuntime({ runLabel: "bounded-prod-1" });
  assert.equal(bounded.root, "/opt/proxy-gateway-minimal-candidate");
  assert.equal(bounded.storageMode, "bounded-artifact");
  assert.equal(bounded.a3ProjectId, undefined);
  assert.equal(bounded.tools.systemdAnalyze, "/usr/bin/systemd-analyze");

  const smoke = buildProductionServiceNativeSmokeInvocation({
    smokePhase: "postpublish",
    root: "/opt/proxy-gateway-minimal-candidate/releases/candidate",
    service: { uid: 4711, gid: 4712 },
    runtime: bounded
  });
  assert.ok(smoke.bindReadOnlyPaths.includes("/opt/proxy-gateway-minimal-candidate/releases/candidate:/run/control-plane-a3-service-smoke/control-plane-bounded-artifact-smoke-bounded-prod-1-postpublish/project:norbind"));

  for (const options of [
    {},
    { runLabel: "../escape" },
    { runLabel: "bounded-prod-1", projectId: 4242 }
  ]) assert.throws(() => createCandidateDependencyGateBoundedProductionRuntime(options), condition("invalid_input"));
});

test("production A3 runtime rejects partial or drifting activation identity", () => {
  for (const options of [
    {},
    { runLabel: "a3-prod-1" },
    { projectId: 4242 },
    { runLabel: "../escape", projectId: 4242 },
    { runLabel: "a3-prod-1", projectId: 0 },
    { runLabel: "a3-prod-1", projectId: 4242, root: "/tmp" }
  ]) assert.throws(() => createCandidateDependencyGateProductionRuntime(options), condition("invalid_input"));
});

test("createCandidateDependencyGateTestRuntime pins the test-side defaults", () => {
  const testRuntime = createCandidateDependencyGateTestRuntime();
  assert.equal(testRuntime.platform, "linux");
  assert.equal(testRuntime.requireRoot, false);
  assert.equal(testRuntime.enforceOwnership, false);
});

test("A3 physical validation runtime is fixed below the quota project and cannot enable the production route", () => {
  const validation = createCandidateDependencyGateA3PhysicalValidationRuntime({
    runLabel: "run-1",
    projectId: 4242,
    overrides: {
      getuid: () => 0,
      tools: {
        node: "/usr/bin/node", systemdRun: "/usr/bin/systemd-run", systemctl: "/usr/bin/systemctl",
        findmnt: "/usr/bin/findmnt", xfsQuota: "/usr/sbin/xfs_quota", xfsIo: "/usr/sbin/xfs_io"
      },
      executePhysicalCommand: () => ({ status: 70, stdout: "", stderr: "not executed by factory test" })
    }
  });
  assert.equal(validation.root, "/var/lib/control-plane-a3-1/run-1/probe/project/deployment");
  assert.equal(validation.a3ProjectRoot, "/var/lib/control-plane-a3-1/run-1/probe/project");
  assert.equal(validation.a3ProjectId, 4242);
  assert.equal(validation.requireRoot, false);
  assert.equal(validation.allowA3PhysicalValidation, true);
});

test("A3 physical validation CLI accepts only fixed quota and smoke argument shapes", () => {
  assert.deepEqual(parseA3PhysicalValidationArgs(["--mode", "quota", "--run-label", "run-1", "--project-id", "4242"]), {
    mode: "quota", runLabel: "run-1", projectId: 4242
  });
  assert.deepEqual(parseA3PhysicalValidationArgs(["--mode", "smoke", "--run-label", "run-1", "--project-id", "4242", "--service-uid", "4711", "--service-gid", "4712"]), {
    mode: "smoke", runLabel: "run-1", projectId: 4242, serviceUid: 4711, serviceGid: 4712
  });
  for (const argv of [
    ["--mode", "quota", "--run-label", "run-1", "--project-id", "0"],
    ["--mode", "smoke", "--run-label", "run-1", "--project-id", "4242", "--service-uid", "0", "--service-gid", "4712"],
    ["--mode", "quota", "--run-label", "run-1", "--project-id", "4242", "--root", "/tmp/free-path"]
  ]) assert.throws(() => parseA3PhysicalValidationArgs(argv));

  let stdout = "", stderr = "";
  const code = runA3PhysicalValidationCli({
    argv: ["--mode", "smoke", "--run-label", "run-1", "--project-id", "4242", "--service-uid", "0", "--service-gid", "4712"],
    stdout: { write(value) { stdout += value; } },
    stderr: { write(value) { stderr += value; } }
  });
  assert.equal(code, 1);
  assert.equal(stdout, "");
  assert.equal(JSON.parse(stderr).condition, "invalid_input");
});
