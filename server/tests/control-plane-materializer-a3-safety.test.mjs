// A3-0 materializer safety contract tests.
//
// These tests pin the exact evidence shapes the kernel-enforced aggregate
// storage quota boundary and the restricted service-native smoke boundary
// must publish before the production materializer guard may be reconsidered.
// They are unit-level contracts only; real XFS project-quota enforcement
// and real systemd DynamicUser sandbox execution are validated by separate
// privileged disposable Linux runs (see issue #636 Gate A3-1).
//
// Production materialize/verify/preflight must remain fail-closed with
// `worker_storage_limit_unavailable`; this file does not relax that guard.

import assert from "node:assert/strict";
import test from "node:test";

import {
  CandidateDependencyGateError,
  createCandidateDependencyGateTestRuntime,
  materializeCandidateDependencies,
  parseServiceSmokeReadback,
  parseStorageQuotaEvidence,
  preflightCandidateDependencies,
  verifyCandidateDependencies
} from "../../scripts/control-plane-candidate-dependency-gate.mjs";

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
      expectedErrorCode: "EDQUOT",
      observedErrorCode: "EDQUOT",
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
  assert.deepEqual(parsed.probe, { expectedErrorCode: "EDQUOT", observedErrorCode: "EDQUOT", exhausted: true });
});

// Pinned contract: parseStorageQuotaEvidence rejects probes whose declared
// expected error is not EDQUOT, and rejects non-exhausted probes. Note that
// the current parser does NOT cross-check observedErrorCode against "EDQUOT";
// tightening that into a hard assertion is deferred until A3-1 produces real
// Linux probe evidence (see issue #636).
test("parseStorageQuotaEvidence rejects probes whose declared expected code is not EDQUOT", () => {
  assert.throws(
    () => parseStorageQuotaEvidence(quotaEvidence({ probe: { expectedErrorCode: "ENOSPC", observedErrorCode: "ENOSPC", exhausted: true } })),
    condition("storage_quota_evidence_invalid")
  );
});

test("parseStorageQuotaEvidence rejects non-exhausted probes and missing probe metadata", () => {
  assert.throws(
    () => parseStorageQuotaEvidence(quotaEvidence({ probe: { expectedErrorCode: "EDQUOT", observedErrorCode: "EDQUOT", exhausted: false } })),
    condition("storage_quota_evidence_invalid")
  );
  assert.throws(
    () => parseStorageQuotaEvidence(quotaEvidence({ probe: { expectedErrorCode: "EDQUOT", observedErrorCode: "EDQUOT" } })),
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