// A3-0 materializer safety contract tests.
//
// These tests pin the exact evidence shapes the kernel-enforced aggregate
// storage quota boundary and the restricted service-native smoke boundary
// must publish before the production materializer guard may be reconsidered.
// They are unit-level contracts only; real XFS project-quota enforcement
// and real systemd fixed-service-principal sandbox execution are validated by separate
// privileged disposable Linux runs (see issue #636 Gate A3-1).
//
// Production materialize/verify/preflight must remain fail-closed with
// `worker_storage_limit_unavailable`; this file does not relax that guard.

import assert from "node:assert/strict";
import test from "node:test";

import {
  buildServiceNativeSmokeInvocation,
  CandidateDependencyGateError,
  collectServiceNativeSmokeEvidence,
  collectStorageQuotaEvidence,
  createCandidateDependencyGateA3PhysicalValidationRuntime,
  createCandidateDependencyGateTestRuntime,
  materializeCandidateDependencies,
  parseServiceSmokeReadback,
  parseStorageQuotaEvidence,
  preflightCandidateDependencies,
  verifyCandidateDependencies
} from "../../scripts/control-plane-candidate-dependency-gate.mjs";
import {
  parseA3PhysicalValidationArgs,
  runA3PhysicalValidationCli
} from "../../scripts/control-plane-materializer-a3-physical-validation.mjs";

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

test("collectStorageQuotaEvidence binds XFS project quota state and an observed ENOSPC probe", () => {
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
      return { status: 0, stdout: blockReportCount === 1 ? "4242 512 0 1024 00 [------]\n" : "4242 1024 0 1024 00 [------]\n", stderr: "" };
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
  assert.equal(evidence.byteCurrent, 1024 * 1024);
  assert.equal(evidence.byteHardLimit, 1024 * 1024);
  assert.equal(evidence.inodeCurrent, 64);
  assert.equal(evidence.inodeHardLimit, 64);
  assert.equal(evidence.headroomBytes, 0);
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
  assert.ok(invocation.args.includes("--property=User=4711"));
  assert.ok(invocation.args.includes("--property=Group=4712"));
  assert.ok(invocation.args.includes("--property=PrivateNetwork=yes"));
  assert.ok(invocation.args.includes("--property=CapabilityBoundingSet="));
  assert.ok(invocation.args.includes(`--property=BindReadOnlyPaths=/var/lib/control-plane-a3-1/run-1/probe/project:/run/control-plane-a3-service-smoke/control-plane-a3-service-smoke-run-1-validation/project:norbind ${invocation.worker}:${invocation.visibleWorker}:norbind`));
  assert.deepEqual(invocation.args.slice(-8), [
    "/usr/bin/node",
    invocation.visibleWorker,
    "--mode", "smoke",
    "--root", "/run/control-plane-a3-service-smoke/control-plane-a3-service-smoke-run-1-validation/project",
    "--snapshot", "scripts/control-plane-db-snapshot-gate.mjs"
  ]);
});

test("collectServiceNativeSmokeEvidence requires successful smoke then exact terminal and empty cgroup", () => {
  const calls = [];
  let bindReadOnlyPaths = "";
  const execute = (command, args) => {
    calls.push([command, args]);
    if (command === "/usr/bin/systemd-run") {
      bindReadOnlyPaths = args.find((value) => value.startsWith("--property=BindReadOnlyPaths=")).slice("--property=BindReadOnlyPaths=".length);
      return { status: 0, stdout: '{"schemaVersion":"2","type":"control_plane_dependency_artifact","mode":"smoke","state":"verified","smoke":{"betterSqlite3Memory":true,"snapshotImport":true}}\n', stderr: "" };
    }
    return { status: 0, stdout: `ActiveState=inactive\nSubState=dead\nResult=success\nExecMainStatus=0\nControlGroup=/system.slice/control-plane-a3-service-smoke-run-1-validation.service\nUser=4711\nGroup=4712\nPrivateNetwork=yes\nCapabilityBoundingSet=\nProtectSystem=strict\nProtectHome=yes\nPrivateDevices=yes\nNoNewPrivileges=yes\nBindReadOnlyPaths=${bindReadOnlyPaths}\n`, stderr: "" };
  };
  const evidence = collectServiceNativeSmokeEvidence({
    runLabel: "run-1",
    root: "/var/lib/control-plane-a3-1/run-1/probe/project",
    service: { uid: 4711, gid: 4712 },
    runtime: physicalRuntime({
      executePhysicalCommand: execute,
      readPhysicalFile: (path) => path.endsWith("cgroup.events") ? "populated 0\n" : ""
    })
  });
  assert.equal(evidence.serviceUid, 4711);
  assert.equal(evidence.serviceGid, 4712);
  assert.equal(evidence.cgroupEmpty, true);
  assert.equal(evidence.betterSqlite3Memory, true);
  assert.equal(calls.length, 2);
});

test("collectServiceNativeSmokeEvidence marks terminal and cgroup uncertainty as attention-required", () => {
  const runtime = physicalRuntime({
    executePhysicalCommand: (command) => command === "/usr/bin/systemd-run"
      ? { status: 0, stdout: '{"schemaVersion":"2","type":"control_plane_dependency_artifact","mode":"smoke","state":"verified","smoke":{"betterSqlite3Memory":true,"snapshotImport":true}}\n', stderr: "" }
      : { status: 1, stdout: "", stderr: "unit unavailable" },
    readPhysicalFile: () => ""
  });
  assert.throws(
    () => collectServiceNativeSmokeEvidence({ runLabel: "run-1", root: "/var/lib/control-plane-a3-1/run-1/probe/project", service: { uid: 4711, gid: 4712 }, runtime }),
    (error) => condition("worker_cleanup_uncertain")(error) && error.attentionRequired === true
  );
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
