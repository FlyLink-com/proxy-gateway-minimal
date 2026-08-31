import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const LIBRARY_PATH = resolve(
  REPOSITORY_ROOT,
  "scripts/control-plane-welcome-coins-activation-gate-lib.mjs"
);
const NATIVE_LAUNCHER_PATH = resolve(
  REPOSITORY_ROOT,
  "scripts/native/welcome-coins-custody-launcher.c"
);
const SERVICE_PRINCIPAL = Object.freeze({ uid: 1001, gid: 1002 });
const DATABASE_BOUNDARY = Object.freeze({
  logicalSha256: "1".repeat(64),
  objectIdentitySha256: "2".repeat(64),
  parentIdentitySha256: "3".repeat(64)
});
const GUARD_IDENTITY = "runtime-condition-v1:11:12:21:22";
const ROOT_IDENTITY = Object.freeze({
  gid: 0,
  pid: 4100,
  startTimeTicks: "410000",
  uid: 0
});
const CHILD_IDENTITY = Object.freeze({
  gid: SERVICE_PRINCIPAL.gid,
  pid: 4200,
  startTimeTicks: "420000",
  uid: SERVICE_PRINCIPAL.uid
});

function sourceDataUrl(source) {
  return `data:text/javascript;base64,${Buffer.from(source, "utf8").toString("base64")}`;
}

function replaceExactModuleSpecifier(source, specifier, replacement) {
  const needle = JSON.stringify(specifier);
  assert.equal(source.split(needle).length - 1, 1, specifier);
  return source.replace(needle, JSON.stringify(replacement));
}

let harnessPromise;

function loadHarness() {
  if (harnessPromise) return harnessPromise;
  let source = readFileSync(LIBRARY_PATH, "utf8");
  source = replaceExactModuleSpecifier(source, "dotenv", import.meta.resolve("dotenv"));
  source = replaceExactModuleSpecifier(
    source,
    "./control-plane-db-snapshot-gate-lib.mjs",
    pathToFileURL(resolve(REPOSITORY_ROOT, "scripts/control-plane-db-snapshot-gate-lib.mjs")).href
  );
  source = replaceExactModuleSpecifier(
    source,
    "./control-plane-welcome-coins-holder-observer-lib.mjs",
    pathToFileURL(resolve(
      REPOSITORY_ROOT,
      "scripts/control-plane-welcome-coins-holder-observer-lib.mjs"
    )).href
  );
  source += `
export const __nativeControllerHarness = Object.freeze({
  encodeSetup: typeof encodeWelcomeCoinsNativeSetup === "function"
    ? encodeWelcomeCoinsNativeSetup : undefined,
  encodeFrame: typeof encodeWelcomeCoinsNativeFrame === "function"
    ? encodeWelcomeCoinsNativeFrame : undefined,
  decodeReady: typeof decodeWelcomeCoinsNativeReady === "function"
    ? decodeWelcomeCoinsNativeReady : undefined,
  decodeFrame: typeof decodeWelcomeCoinsNativeFrame === "function"
    ? decodeWelcomeCoinsNativeFrame : undefined,
  runCustody: typeof runWelcomeCoinsNativeSchemaCustody === "function"
    ? runWelcomeCoinsNativeSchemaCustody : undefined,
  settleProcess: typeof settleWelcomeCoinsNativeControllerProcess === "function"
    ? settleWelcomeCoinsNativeControllerProcess : undefined,
  settleOpenFailure: typeof settleWelcomeCoinsNativeOpenFailure === "function"
    ? settleWelcomeCoinsNativeOpenFailure : undefined,
  closeOnce: typeof createWelcomeCoinsNativeControllerCloseOnce === "function"
    ? createWelcomeCoinsNativeControllerCloseOnce : undefined,
  deadline: typeof welcomeCoinsNativeDeadline === "function"
    ? welcomeCoinsNativeDeadline : undefined,
  writeSocket: typeof writeWelcomeCoinsNativeSocket === "function"
    ? writeWelcomeCoinsNativeSocket : undefined,
  parseTerminal: typeof parseWelcomeCoinsNativeTerminalResult === "function"
    ? parseWelcomeCoinsNativeTerminalResult : undefined,
  failureReceipt: typeof welcomeCoinsActivationTransactionFailureReceipt === "function"
    ? welcomeCoinsActivationTransactionFailureReceipt : undefined,
  revalidateArtifacts: typeof revalidateWelcomeCoinsProductionArtifacts === "function"
    ? revalidateWelcomeCoinsProductionArtifacts : undefined,
  validateArtifacts: typeof validateWelcomeCoinsProductionArtifacts === "function"
    ? validateWelcomeCoinsProductionArtifacts : undefined
});
`;
  harnessPromise = import(sourceDataUrl(source));
  return harnessPromise;
}

function magicField(value) {
  const result = Buffer.alloc(40);
  result.write(value, 0, "ascii");
  return result;
}

function readyBytes(overrides = {}) {
  const value = {
    childPid: CHILD_IDENTITY.pid,
    acquiredDev: 11n,
    acquiredIno: 12n,
    authorizationDev: 21n,
    authorizationIno: 22n,
    ...overrides
  };
  const bytes = Buffer.alloc(76);
  magicField("welcome_coins_native_ready_v1").copy(bytes, 0);
  bytes.writeUInt32BE(value.childPid, 40);
  bytes.writeBigUInt64BE(value.acquiredDev, 44);
  bytes.writeBigUInt64BE(value.acquiredIno, 52);
  bytes.writeBigUInt64BE(value.authorizationDev, 60);
  bytes.writeBigUInt64BE(value.authorizationIno, 68);
  return bytes;
}

function sha256Canonical(value) {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

function channelIdentity(accessMode, dev, ino) {
  const objectIdentitySha256 = sha256Canonical({
    dev: String(dev),
    ino: String(ino)
  });
  return sha256Canonical({ accessMode, objectIdentitySha256 });
}

function schemaReadyResult() {
  return Object.freeze({
    schemaVersion: "1",
    type: "control_plane_welcome_coins_schema_custody_gate",
    state: "schema_ready",
    databaseCustody: "exclusive",
    guardIdentitySha256: createHash("sha256").update(GUARD_IDENTITY, "utf8").digest("hex"),
    snapshot: Object.freeze({
      id: "6".repeat(64),
      sizeBytes: 8192,
      quickCheck: true,
      foreignKeys: true,
      schemaVersion: 7
    }),
    schema: Object.freeze({
      state: "ready",
      sourceChanged: false,
      checks: Object.freeze({
        foundationDependency: true,
        schemaExact: true,
        quickCheck: true,
        foreignKeys: true
      }),
      reasonCodes: Object.freeze([]),
      appliedMigrationIds: Object.freeze([]),
      pendingMigrationIds: Object.freeze([])
    })
  });
}

function nativeCustodyFailureFixture({
  sendCommitAuthorization,
  receiveCustodyHeld,
  exchangeCustodyHeartbeat,
  sendCustodyRelease,
  waitForTerminal
} = {}) {
  const events = [];
  const closeOptions = [];
  const channelBinding = Object.freeze({
    parentIdentity: ROOT_IDENTITY,
    childIdentity: CHILD_IDENTITY,
    acquiredChannelIdentitySha256: channelIdentity(1, 11, 12),
    authorizationChannelIdentitySha256: channelIdentity(0, 21, 22)
  });
  const session = {
    launcherPid: ROOT_IDENTITY.pid,
    launcherIdentity: ROOT_IDENTITY,
    async sendSetup() {
      events.push("setup");
    },
    async receiveReady() {
      events.push("ready");
      return {
        childPid: CHILD_IDENTITY.pid,
        acquiredDev: "11",
        acquiredIno: "12",
        authorizationDev: "21",
        authorizationIno: "22"
      };
    },
    async sendAuthorizationEnvelope() {
      events.push("authorization-envelope");
    },
    async receiveAcquired() {
      events.push("acquired");
      return {
        type: "welcome_coins_schema_custody_acquired",
        acquisitionProofSha256: "5".repeat(64),
        childIdentity: CHILD_IDENTITY,
        channelBinding
      };
    },
    async sendCommitAuthorization(value) {
      events.push("commit");
      return sendCommitAuthorization?.(value);
    },
    async receiveCustodyHeld() {
      events.push("held");
      if (typeof receiveCustodyHeld !== "function") {
        throw new Error("unexpected custody-held read");
      }
      return receiveCustodyHeld({ channelBinding });
    },
    async exchangeCustodyHeartbeat(value) {
      events.push(`heartbeat:${value.stage}`);
      if (typeof exchangeCustodyHeartbeat !== "function") {
        throw new Error("unexpected custody heartbeat");
      }
      return exchangeCustodyHeartbeat(value);
    },
    async sendCustodyRelease(value) {
      events.push("release");
      if (typeof sendCustodyRelease !== "function") {
        throw new Error("unexpected custody release");
      }
      return sendCustodyRelease(value);
    },
    async waitForTerminal() {
      events.push("terminal");
      if (typeof waitForTerminal === "function") return waitForTerminal();
      throw new Error("unexpected terminal read");
    },
    async close(options) {
      events.push("close");
      closeOptions.push(options);
    }
  };
  const runtime = {
    now: () => "2026-08-30T12:00:00.000Z",
    randomBytes: () => Buffer.alloc(32, 0xab),
    async openController() {
      events.push("open");
      return session;
    },
    revalidateArtifacts(binding) {
      events.push("artifact-readback");
      assert.equal(binding, TEST_ARTIFACT_BINDING);
      return binding;
    },
    readRootProcessIdentity() {
      events.push("root-readback");
      return ROOT_IDENTITY;
    },
    readHardenedChildIdentity() {
      events.push("child-readback");
      return CHILD_IDENTITY;
    }
  };
  return { channelBinding, closeOptions, events, runtime };
}

const CANDIDATE_ARTIFACT_SPECS = Object.freeze([
  ["scripts/control-plane-welcome-coins-activation-transaction-cli.mjs", "transactionCliSha256", "0644", "file"],
  ["scripts/control-plane-welcome-coins-activation-gate-lib.mjs", "activationLibrarySha256", "0644", "file"],
  ["scripts/control-plane-db-snapshot-gate-lib.mjs", "snapshotLibrarySha256", "0644", "file"],
  ["scripts/control-plane-welcome-coins-holder-observer-lib.mjs", "holderObserverSha256", "0644", "file"],
  ["server/services/platform/portal-registration-welcome-bonus-migrations.mjs", "welcomeBonusMigrationsSha256", "0644", "file"],
  ["server/services/platform/coin-wallet-migrations.mjs", "coinWalletMigrationsSha256", "0644", "file"],
  ["scripts/control-plane-welcome-coins-activation-transaction-custody-cli.mjs", "custodyCliSha256", "0644", "file"],
  ["node_modules/.gccgw-native/welcome-coins-activation-outer-wrapper", "outerWrapperSha256", "0755", "static-pie"],
  ["node_modules/.gccgw-native/welcome-coins-custody-launcher", "nativeLauncherSha256", "0755", "pie"],
  ["node_modules/.gccgw-native/welcome-coins-post-exec-bootstrap.so", "postExecBootstrapSha256", "0644", "shared-object"],
  ["node_modules/.gccgw-native/welcome-coins-outer-post-exec-bootstrap.so", "outerPostExecBootstrapSha256", "0644", "shared-object"],
  ["node_modules/.gccgw-native/welcome-coins-native-build.json", "nativeBuildReceiptSha256", "0644", "json"]
]);
const TEST_DEPENDENCY_TREE = Object.freeze({
  sha256: "d".repeat(64),
  entryCount: 321,
  totalBytes: 4_321_000,
  hardlinksBroken: true,
  symlinksInternal: true
});

const TEST_ARTIFACT_RECORDS = Object.freeze(CANDIDATE_ARTIFACT_SPECS.map(
  ([path, _key, mode, kind], index) => Object.freeze({
    path,
    sha256: artifactSha256(index),
    fileIdentitySha256: artifactFileIdentity(index),
    sizeBytes: index + 101,
    mode,
    kind
  })
));
const TEST_ARTIFACT_BINDING = Object.freeze({
  schemaVersion: "1",
  type: "welcome_coins_activation_artifact_binding",
  candidateRoot: "/opt/proxy-gateway-minimal-candidate/releases/release-1",
  expectedRelease: "release-1",
  candidateRootSha256: candidateControlSurfaceSha256(
    "release-1",
    TEST_ARTIFACT_RECORDS.map(({ fileIdentitySha256: _identity, ...record }) => record),
    TEST_DEPENDENCY_TREE
  ),
  artifacts: TEST_ARTIFACT_RECORDS,
  dependencyTree: TEST_DEPENDENCY_TREE,
  node: Object.freeze({
    path: "/usr/bin/node",
    sha256: "8".repeat(64),
    fileIdentitySha256: "f".repeat(64),
    sizeBytes: 808,
    mode: "0755",
    kind: "elf"
  })
});

function candidateControlSurfaceSha256(expectedRelease, records, dependencyTree) {
  return sha256Canonical({
    schemaVersion: "1",
    type: "welcome_coins_activation_candidate_control_surface",
    expectedRelease,
    files: records,
    dependencyTree
  });
}

function artifactSha256(index) {
  return (index + 1).toString(16).repeat(64);
}

function artifactFileIdentity(index) {
  return (index + 4).toString(16).repeat(64);
}

test("production artifact validation binds every executable native byte and the fixed candidate control surface", async () => {
  const { __nativeControllerHarness: harness } = await loadHarness();
  assert.equal(typeof harness.validateArtifacts, "function");
  const candidateRoot = "/opt/proxy-gateway-minimal-candidate/releases/release-1";
  const nodePath = "/usr/bin/node";
  const records = CANDIDATE_ARTIFACT_SPECS.map(([path, key, mode, kind], index) => ({
    path,
    sha256: artifactSha256(index),
    fileIdentitySha256: artifactFileIdentity(index),
    sizeBytes: index + 101,
    mode,
    kind,
    key
  }));
  const nodeIdentity = {
    path: nodePath,
    sha256: "8".repeat(64),
    fileIdentitySha256: "f".repeat(64),
    sizeBytes: 808,
    mode: "0755",
    kind: "elf"
  };
  const artifacts = Object.fromEntries(records.map((record) => [record.key, record.sha256]));
  artifacts.nodeModulesTreeSha256 = TEST_DEPENDENCY_TREE.sha256;
  artifacts.nodeSha256 = nodeIdentity.sha256;
  artifacts.candidateRootSha256 = candidateControlSurfaceSha256(
    "release-1",
    records.map(({ key: _key, fileIdentitySha256: _identity, ...record }) => record),
    TEST_DEPENDENCY_TREE
  );
  const inspected = [];
  let inspectedDependencyTrees = 0;
  const runtime = {
    inspectArtifact(spec) {
      inspected.push(spec);
      if (spec.path === nodePath) return nodeIdentity;
      const prefix = `${candidateRoot}/`;
      const relativePath = spec.path.slice(prefix.length);
      const record = records.find((value) => value.path === relativePath);
      assert.ok(record, relativePath);
      return Object.fromEntries(Object.entries(record).filter(([key]) => key !== "key"));
    },
    inspectDependencyTree({ path }) {
      inspectedDependencyTrees += 1;
      assert.equal(path, `${candidateRoot}/node_modules`);
      return TEST_DEPENDENCY_TREE;
    }
  };

  const binding = harness.validateArtifacts({
    executionEnvelope: { expectedRelease: "release-1", artifacts },
    candidateRoot,
    nodePath,
    runtime
  });
  assert.deepEqual(Object.keys(binding).sort(), [
    "artifacts",
    "candidateRoot",
    "candidateRootSha256",
    "dependencyTree",
    "expectedRelease",
    "node",
    "schemaVersion",
    "type"
  ]);
  assert.equal(binding.type, "welcome_coins_activation_artifact_binding");
  assert.equal(binding.artifacts.length, CANDIDATE_ARTIFACT_SPECS.length);
  assert.equal(binding.artifacts[7].fileIdentitySha256, artifactFileIdentity(7));
  assert.deepEqual(binding.dependencyTree, TEST_DEPENDENCY_TREE);
  assert.equal(binding.node.fileIdentitySha256, "f".repeat(64));
  assert.deepEqual(
    inspected.map(({ path, mode, kind }) => ({ path, mode, kind })),
    [
      ...CANDIDATE_ARTIFACT_SPECS.map(([path, _key, mode, kind]) => ({
        path: `${candidateRoot}/${path}`,
        mode,
        kind
      })),
      { path: nodePath, mode: "0755", kind: "elf" }
    ]
  );
  assert.equal(inspectedDependencyTrees, 1);
  inspected.length = 0;
  assert.equal(harness.revalidateArtifacts({ binding, runtime }), binding);
  assert.equal(inspected.length, CANDIDATE_ARTIFACT_SPECS.length + 1);
  assert.equal(inspectedDependencyTrees, 2);

  assert.throws(
    () => harness.validateArtifacts({
      executionEnvelope: {
        expectedRelease: "release-1",
        artifacts: { ...artifacts, nativeLauncherSha256: "f".repeat(64) }
      },
      candidateRoot,
      nodePath,
      runtime
    }),
    (error) => error?.condition === "execution_envelope_invalid"
  );

  const driftedRuntime = {
    inspectArtifact(spec) {
      const observed = runtime.inspectArtifact(spec);
      return spec.path.endsWith("welcome-coins-custody-launcher")
        ? { ...observed, fileIdentitySha256: "0".repeat(64) }
        : observed;
    },
    inspectDependencyTree: runtime.inspectDependencyTree
  };
  assert.throws(
    () => harness.revalidateArtifacts({ binding, runtime: driftedRuntime }),
    (error) => error?.condition === "execution_envelope_invalid"
  );

  assert.throws(
    () => harness.revalidateArtifacts({
      binding,
      runtime: {
        inspectArtifact: runtime.inspectArtifact,
        inspectDependencyTree() {
          return { ...TEST_DEPENDENCY_TREE, sha256: "0".repeat(64) };
        }
      }
    }),
    (error) => error?.condition === "execution_envelope_invalid"
  );
});

test("native controller codec is exact-width, canonical, and rejects nonzero magic padding", async () => {
  const { __nativeControllerHarness: harness } = await loadHarness();
  for (const name of ["encodeSetup", "encodeFrame", "decodeReady", "decodeFrame"]) {
    assert.equal(typeof harness[name], "function", name);
  }

  const setup = harness.encodeSetup(SERVICE_PRINCIPAL);
  assert.equal(setup.length, 48);
  assert.equal(setup.subarray(0, 40).equals(magicField("welcome_coins_native_setup_v1")), true);
  assert.equal(setup.readUInt32BE(40), SERVICE_PRINCIPAL.uid);
  assert.equal(setup.readUInt32BE(44), SERVICE_PRINCIPAL.gid);

  assert.deepEqual(harness.decodeReady(readyBytes()), {
    childPid: CHILD_IDENTITY.pid,
    acquiredDev: "11",
    acquiredIno: "12",
    authorizationDev: "21",
    authorizationIno: "22"
  });
  const nonzeroPadding = readyBytes();
  nonzeroPadding[39] = 1;
  assert.throws(
    () => harness.decodeReady(nonzeroPadding),
    (error) => error?.condition === "database_custody_failed"
  );

  const payload = { type: "fixed_test", value: true };
  const frame = harness.encodeFrame("welcome_coins_native_commit_v1", payload);
  assert.equal(frame.length, 44 + Buffer.byteLength(`${JSON.stringify(payload)}\n`));
  assert.deepEqual(
    harness.decodeFrame(frame, "welcome_coins_native_commit_v1"),
    payload
  );
  assert.throws(
    () => harness.decodeFrame(frame, "welcome_coins_native_acquired_v1"),
    (error) => error?.condition === "database_custody_failed"
  );
});

test("private native custody composition binds root and child identities, FD4/FD5, guard, and one commit", async () => {
  const { __nativeControllerHarness: harness } = await loadHarness();
  assert.equal(typeof harness.runCustody, "function");

  const events = [];
  const challenge = Buffer.alloc(32, 0xab);
  let authorizationEnvelope;
  let commitFrame;
  let releaseFrame;
  let heldCallbackResult;
  const heartbeatFrames = [];
  const acquiredChannelIdentitySha256 = channelIdentity(1, 11, 12);
  const authorizationChannelIdentitySha256 = channelIdentity(0, 21, 22);
  const channelBinding = Object.freeze({
    parentIdentity: ROOT_IDENTITY,
    childIdentity: CHILD_IDENTITY,
    acquiredChannelIdentitySha256,
    authorizationChannelIdentitySha256
  });
  const acquiredFrame = Object.freeze({
    type: "welcome_coins_schema_custody_acquired",
    acquisitionProofSha256: "5".repeat(64),
    childIdentity: CHILD_IDENTITY,
    channelBinding
  });
  const schemaResult = schemaReadyResult();
  const heldFrame = Object.freeze({
    type: "schema_ready_custody_held",
    schemaResult,
    childIdentity: CHILD_IDENTITY,
    channelBinding
  });
  const session = {
    launcherPid: ROOT_IDENTITY.pid,
    launcherIdentity: ROOT_IDENTITY,
    async sendSetup(value) {
      events.push("setup");
      assert.deepEqual(value, SERVICE_PRINCIPAL);
    },
    async receiveReady() {
      events.push("ready");
      return harness.decodeReady(readyBytes());
    },
    async sendAuthorizationEnvelope(value) {
      events.push("authorization-envelope");
      authorizationEnvelope = value;
    },
    async receiveAcquired() {
      events.push("acquired");
      return acquiredFrame;
    },
    async sendCommitAuthorization(value) {
      events.push("commit");
      commitFrame = value;
    },
    async receiveCustodyHeld() {
      events.push("held");
      return heldFrame;
    },
    async exchangeCustodyHeartbeat(value) {
      events.push(`heartbeat:${value.stage}`);
      heartbeatFrames.push(value);
      return value;
    },
    async sendCustodyRelease(value) {
      events.push("release");
      releaseFrame = value;
    },
    async waitForTerminal() {
      events.push("terminal");
      return schemaResult;
    },
    async close() {
      events.push("close");
    }
  };
  const runtime = {
    now: () => "2026-08-30T12:00:00.000Z",
    randomBytes(size) {
      assert.equal(size, 32);
      return Buffer.from(challenge);
    },
    async openController({ launcherPath, launcherArtifact, nodeArtifact }) {
      events.push("open");
      assert.equal(
        launcherPath,
        "/opt/proxy-gateway-minimal-candidate/releases/release-1/node_modules/.gccgw-native/welcome-coins-custody-launcher"
      );
      assert.deepEqual(
        launcherArtifact,
        TEST_ARTIFACT_BINDING.artifacts.find(
          (record) => record.path.endsWith("welcome-coins-custody-launcher")
        )
      );
      assert.deepEqual(nodeArtifact, TEST_ARTIFACT_BINDING.node);
      return session;
    },
    revalidateArtifacts(binding) {
      events.push("artifact-readback");
      assert.equal(binding, TEST_ARTIFACT_BINDING);
      return binding;
    },
    readRootProcessIdentity({
      pid,
      expectedParentPid,
      expectedExecutable,
      expectedExecutableArtifact
    }) {
      events.push("root-readback");
      assert.equal(pid, ROOT_IDENTITY.pid);
      assert.equal(expectedParentPid, process.pid);
      assert.equal(
        expectedExecutable,
        "/opt/proxy-gateway-minimal-candidate/releases/release-1/node_modules/.gccgw-native/welcome-coins-custody-launcher"
      );
      assert.deepEqual(
        expectedExecutableArtifact,
        TEST_ARTIFACT_BINDING.artifacts.find(
          (record) => record.path.endsWith("welcome-coins-custody-launcher")
        )
      );
      return ROOT_IDENTITY;
    },
    readHardenedChildIdentity({
      pid,
      expectedParentPid,
      servicePrincipal,
      expectedExecutable,
      expectedExecutableArtifact
    }) {
      events.push("child-readback");
      assert.equal(pid, CHILD_IDENTITY.pid);
      assert.equal(expectedParentPid, ROOT_IDENTITY.pid);
      assert.deepEqual(servicePrincipal, SERVICE_PRINCIPAL);
      assert.equal(expectedExecutable, "/usr/bin/node");
      assert.deepEqual(expectedExecutableArtifact, TEST_ARTIFACT_BINDING.node);
      return CHILD_IDENTITY;
    }
  };
  let claim;

  const result = await harness.runCustody({
    candidateRoot: "/opt/proxy-gateway-minimal-candidate/releases/release-1",
    servicePrincipal: SERVICE_PRINCIPAL,
    expectedDatabaseBoundary: DATABASE_BOUNDARY,
    expectedRuntimeConditionStartGuardIdentity: GUARD_IDENTITY,
    dbPath: "/private/state/subscription-control.sqlite",
    snapshotDirectory: "/private/snapshots/welcome-coins",
    tempRoot: "/private/tmp/welcome-coins",
    validatedArtifactBinding: TEST_ARTIFACT_BINDING,
    async authorizeCommit(value) {
      events.push("authorize-commit");
      claim = value;
      return true;
    },
    async runWhileCustodyHeld(value, assertCustodyHeld) {
      events.push("while-custody-held");
      heldCallbackResult = value;
      for (const stage of [
        "pre_activation",
        "post_activation",
        "post_verify",
        "post_terminal_guard"
      ]) {
        assert.equal(await assertCustodyHeld(stage), true);
      }
      return true;
    },
    runtime
  });

  assert.deepEqual(events, [
    "artifact-readback",
    "open",
    "setup",
    "ready",
    "root-readback",
    "child-readback",
    "artifact-readback",
    "authorization-envelope",
    "acquired",
    "artifact-readback",
    "authorize-commit",
    "commit",
    "held",
    "artifact-readback",
    "while-custody-held",
    "heartbeat:pre_activation",
    "heartbeat:post_activation",
    "heartbeat:post_verify",
    "heartbeat:post_terminal_guard",
    "artifact-readback",
    "release",
    "terminal",
    "close"
  ]);
  assert.deepEqual(authorizationEnvelope, {
    type: "control_plane_welcome_coins_schema_custody_child",
    schemaVersion: "1",
    serviceUid: SERVICE_PRINCIPAL.uid,
    serviceGid: SERVICE_PRINCIPAL.gid,
    initialExternalHolderCount: 0,
    authorizationChallengeSha256: createHash("sha256").update(challenge).digest("hex"),
    parentIdentity: ROOT_IDENTITY,
    childIdentity: CHILD_IDENTITY,
    acquiredChannelIdentitySha256,
    authorizationChannelIdentitySha256,
    custody: {
      serviceUnit: "proxy-gateway-candidate.service",
      expectedServiceState: "inactive",
      expectedRuntimeConditionStartGuardIdentity: GUARD_IDENTITY,
      dbPath: "/private/state/subscription-control.sqlite",
      snapshotDirectory: "/private/snapshots/welcome-coins",
      tempRoot: "/private/tmp/welcome-coins",
      createdAt: "2026-08-30T12:00:00.000Z",
      expectedDatabaseBoundary: DATABASE_BOUNDARY
    }
  });
  assert.deepEqual(claim, {
    exclusiveCustodyHeld: true,
    processIdentitySha256: sha256Canonical(CHILD_IDENTITY),
    channelBindingSha256: sha256Canonical(channelBinding),
    uid: SERVICE_PRINCIPAL.uid,
    gid: SERVICE_PRINCIPAL.gid
  });
  assert.deepEqual(commitFrame, {
    type: "authorize_schema_apply",
    authorizationChallenge: challenge.toString("hex"),
    acquiredFrameSha256: sha256Canonical(acquiredFrame)
  });
  assert.deepEqual(heldCallbackResult, {
    state: "schema_ready",
    schemaState: "ready",
    schemaExact: true,
    snapshotCreated: true
  });
  assert.deepEqual(releaseFrame, {
    type: "release_after_activation_verified",
    heldFrameSha256: sha256Canonical(heldFrame)
  });
  assert.deepEqual(
    heartbeatFrames.map(({ type, heldFrameSha256, sequence, stage, challengeSha256 }) => ({
      type,
      heldFrameSha256,
      sequence,
      stage,
      challengeSha256
    })),
    [
      "pre_activation",
      "post_activation",
      "post_verify",
      "post_terminal_guard"
    ].map((stage, index) => ({
      type: "assert_custody_held",
      heldFrameSha256: sha256Canonical(heldFrame),
      sequence: index + 1,
      stage,
      challengeSha256: createHash("sha256").update(challenge).digest("hex")
    }))
  );
  assert.equal(result.state, "schema_ready");
});

test("post-commit activation failure releases the exact held frame as attention before cleanup", async () => {
  const { __nativeControllerHarness: harness } = await loadHarness();
  let releaseFrame;
  let heldFrame;
  const fixture = nativeCustodyFailureFixture({
    receiveCustodyHeld({ channelBinding }) {
      heldFrame = Object.freeze({
        type: "schema_ready_custody_held",
        schemaResult: schemaReadyResult(),
        childIdentity: CHILD_IDENTITY,
        channelBinding
      });
      return heldFrame;
    },
    sendCustodyRelease(value) {
      releaseFrame = value;
    },
    waitForTerminal() {
      throw new Error("expected attention terminal");
    }
  });

  await assert.rejects(
    harness.runCustody({
      candidateRoot: "/opt/proxy-gateway-minimal-candidate/releases/release-1",
      servicePrincipal: SERVICE_PRINCIPAL,
      expectedDatabaseBoundary: DATABASE_BOUNDARY,
      expectedRuntimeConditionStartGuardIdentity: GUARD_IDENTITY,
      dbPath: "/private/state/subscription-control.sqlite",
      snapshotDirectory: "/private/snapshots/welcome-coins",
      tempRoot: "/private/tmp/welcome-coins",
      validatedArtifactBinding: TEST_ARTIFACT_BINDING,
      authorizeCommit: async () => true,
      async runWhileCustodyHeld() {
        throw new Error("simulated activation publication failure");
      },
      runtime: fixture.runtime
    }),
    (error) => error?.message === "attention_required"
  );
  assert.deepEqual(releaseFrame, {
    type: "release_after_attention",
    heldFrameSha256: sha256Canonical(heldFrame)
  });
  assert.deepEqual(fixture.events.slice(-3), ["release", "terminal", "close"]);
  assert.deepEqual(fixture.closeOptions, [{ commitMayHaveStarted: true }]);
});

test("custody heartbeat mismatch or omission cannot publish a verified release", async () => {
  const { __nativeControllerHarness: harness } = await loadHarness();
  const common = {
    candidateRoot: "/opt/proxy-gateway-minimal-candidate/releases/release-1",
    servicePrincipal: SERVICE_PRINCIPAL,
    expectedDatabaseBoundary: DATABASE_BOUNDARY,
    expectedRuntimeConditionStartGuardIdentity: GUARD_IDENTITY,
    dbPath: "/private/state/subscription-control.sqlite",
    snapshotDirectory: "/private/snapshots/welcome-coins",
    tempRoot: "/private/tmp/welcome-coins",
    validatedArtifactBinding: TEST_ARTIFACT_BINDING,
    authorizeCommit: async () => true
  };

  for (const scenario of ["mismatch", "omission"]) {
    let heldFrame;
    let releaseFrame;
    const fixture = nativeCustodyFailureFixture({
      receiveCustodyHeld({ channelBinding }) {
        heldFrame = Object.freeze({
          type: "schema_ready_custody_held",
          schemaResult: schemaReadyResult(),
          childIdentity: CHILD_IDENTITY,
          channelBinding
        });
        return heldFrame;
      },
      exchangeCustodyHeartbeat(value) {
        return Object.freeze({
          ...value,
          challengeSha256: "0".repeat(64)
        });
      },
      sendCustodyRelease(value) {
        releaseFrame = value;
      },
      waitForTerminal() {
        throw new Error("expected attention terminal");
      }
    });

    await assert.rejects(
      harness.runCustody({
        ...common,
        async runWhileCustodyHeld(_schemaResult, assertCustodyHeld) {
          if (scenario === "mismatch") {
            await assertCustodyHeld("pre_activation");
          }
          return true;
        },
        runtime: fixture.runtime
      }),
      (error) => error?.message === "attention_required",
      scenario
    );
    assert.deepEqual(releaseFrame, {
      type: "release_after_attention",
      heldFrameSha256: sha256Canonical(heldFrame)
    });
    assert.equal(
      fixture.events.includes("heartbeat:pre_activation"),
      scenario === "mismatch"
    );
    assert.equal(fixture.events.includes("release"), true);
    assert.equal(
      fixture.events.some((event) => event === "release-verified"),
      false
    );
  }
});

test("native custody keeps pre-commit rejection blocked and treats commit transmission failure as uncertain", async () => {
  const { __nativeControllerHarness: harness } = await loadHarness();
  const common = {
    candidateRoot: "/opt/proxy-gateway-minimal-candidate/releases/release-1",
    servicePrincipal: SERVICE_PRINCIPAL,
    expectedDatabaseBoundary: DATABASE_BOUNDARY,
    expectedRuntimeConditionStartGuardIdentity: GUARD_IDENTITY,
    dbPath: "/private/state/subscription-control.sqlite",
    snapshotDirectory: "/private/snapshots/welcome-coins",
    tempRoot: "/private/tmp/welcome-coins",
    validatedArtifactBinding: TEST_ARTIFACT_BINDING
  };

  const preCommit = nativeCustodyFailureFixture();
  await assert.rejects(
    harness.runCustody({
      ...common,
      authorizeCommit: async () => false,
      runWhileCustodyHeld: async () => assert.fail("pre-commit rejection cannot activate"),
      runtime: preCommit.runtime
    }),
    (error) => error?.condition === "database_custody_failed"
  );
  assert.equal(preCommit.events.includes("commit"), false);
  assert.equal(preCommit.events.at(-1), "close");
  assert.deepEqual(preCommit.closeOptions, [{ commitMayHaveStarted: false }]);

  const transmissionFailure = nativeCustodyFailureFixture({
    sendCommitAuthorization() {
      throw new Error("simulated transport failure");
    }
  });
  await assert.rejects(
    harness.runCustody({
      ...common,
      authorizeCommit: async () => true,
      runWhileCustodyHeld: async () => assert.fail("failed commit transmission cannot activate"),
      runtime: transmissionFailure.runtime
    }),
    (error) => error?.message === "attention_required"
      && error?.condition === undefined
  );
  assert.equal(transmissionFailure.events.includes("commit"), true);
  assert.equal(transmissionFailure.events.includes("terminal"), false);
  assert.equal(transmissionFailure.events.at(-1), "close");
  assert.deepEqual(
    transmissionFailure.closeOptions,
    [{ commitMayHaveStarted: true }]
  );
});

test("post-commit cleanup waits for the native bound before containment kill", async () => {
  const { __nativeControllerHarness: harness } = await loadHarness();
  assert.equal(typeof harness.settleProcess, "function");
  const events = [];
  let running = true;

  await harness.settleProcess({
    commitMayHaveStarted: true,
    async waitForClose(timeoutMs) {
      events.push(`wait:${timeoutMs}`);
      if (timeoutMs === 155_000) throw new Error("native bound elapsed");
      running = false;
    },
    isRunning: () => running,
    verifyTerminationTarget() {
      events.push("verify-target");
    },
    terminate() {
      events.push("terminate");
      return true;
    }
  });
  assert.deepEqual(events, [
    "wait:155000",
    "verify-target",
    "terminate",
    "wait:5000"
  ]);

  events.length = 0;
  await harness.settleProcess({
    commitMayHaveStarted: true,
    async waitForClose(timeoutMs) {
      events.push(`wait:${timeoutMs}`);
    },
    isRunning: () => false,
    verifyTerminationTarget: () => assert.fail("natural close needs no kill binding"),
    terminate: () => assert.fail("natural close must not be killed")
  });
  assert.deepEqual(events, ["wait:155000"]);

  const launcherSource = readFileSync(NATIVE_LAUNCHER_PATH, "utf8");
  assert.match(launcherSource, /#define WELCOME_COINS_CHILD_TIMEOUT_MS 120000/u);
  assert.match(launcherSource, /#define WELCOME_COINS_IO_TIMEOUT_MS 30000/u);
});

test("controller close calls join one bounded cleanup and retain its failure", async () => {
  const { __nativeControllerHarness: harness } = await loadHarness();
  assert.equal(typeof harness.closeOnce, "function");
  let calls = 0;
  let rejectCleanup;
  const cleanupFailure = new Error("bounded cleanup failed");
  const close = harness.closeOnce(async () => {
    calls += 1;
    await new Promise((_resolvePromise, rejectPromise) => {
      rejectCleanup = rejectPromise;
    });
  });
  const first = close({ commitMayHaveStarted: true });
  const second = close({ commitMayHaveStarted: true });
  let secondSettled = false;
  void second.finally(() => { secondSettled = true; }).catch(() => {});
  await new Promise((resolvePromise) => setImmediate(resolvePromise));
  assert.equal(calls, 1);
  assert.equal(secondSettled, false);
  rejectCleanup(cleanupFailure);
  await assert.rejects(first, (error) => error === cleanupFailure);
  await assert.rejects(second, (error) => error === cleanupFailure);
  await assert.rejects(close(), (error) => error === cleanupFailure);
  assert.equal(calls, 1);
});

test("open failure cleanup waits, rebinds the broker, kills once, and proves reap", async () => {
  const { __nativeControllerHarness: harness } = await loadHarness();
  assert.equal(typeof harness.settleOpenFailure, "function");
  const events = [];
  let running = true;
  await harness.settleOpenFailure({
    async waitForClose(timeoutMs) {
      events.push(`wait:${timeoutMs}`);
      if (events.length === 1) throw new Error("broker still running");
      running = false;
    },
    isRunning: () => running,
    verifyTerminationTarget() {
      events.push("verify-target");
    },
    terminate() {
      events.push("terminate");
      return true;
    }
  });
  assert.deepEqual(events, [
    "wait:5000",
    "verify-target",
    "terminate",
    "wait:5000"
  ]);

  for (const failureMode of ["identity", "kill", "reap"]) {
    running = true;
    let killed = false;
    await assert.rejects(
      harness.settleOpenFailure({
        async waitForClose() {
          if (!killed || failureMode === "reap") throw new Error("not closed");
          running = false;
        },
        isRunning: () => running,
        verifyTerminationTarget() {
          if (failureMode === "identity") throw new Error("identity mismatch");
        },
        terminate() {
          if (failureMode === "identity") assert.fail("unbound target must not be killed");
          if (failureMode === "kill") return false;
          killed = true;
          return true;
        }
      }),
      (error) => failureMode === "identity"
        ? error?.message === "identity mismatch"
        : error?.condition === "database_custody_failed"
    );
  }
});

test("timed-out socket writes retain an owned frame until the transport callback", async () => {
  const { __nativeControllerHarness: harness } = await loadHarness();
  assert.equal(typeof harness.writeSocket, "function");
  assert.equal(typeof harness.deadline, "function");
  const original = Buffer.from("sensitive-frame", "utf8");
  const expected = Buffer.from(original);
  let transportBytes;
  let transportCallback;
  const socket = {
    write(bytes, callback) {
      transportBytes = bytes;
      transportCallback = callback;
    }
  };

  await assert.rejects(
    harness.writeSocket(socket, original, harness.deadline(1)),
    (error) => error?.condition === "database_custody_failed"
  );
  original.fill(0);
  assert.deepEqual(transportBytes, expected);
  transportCallback();
  await new Promise((resolvePromise) => setImmediate(resolvePromise));
  assert.equal(transportBytes.every((byte) => byte === 0), true);
  expected.fill(0);
});

test("native terminal failure preserves only an allowlisted aggregate custody condition", async () => {
  const { __nativeControllerHarness: harness } = await loadHarness();
  assert.equal(typeof harness.parseTerminal, "function");
  assert.equal(typeof harness.failureReceipt, "function");
  const terminal = Object.freeze({ code: 1, signal: null, error: null });
  const failure = Object.freeze({
    schemaVersion: "1",
    type: "control_plane_welcome_coins_schema_custody_child",
    state: "attention_required",
    condition: "snapshot_publish_failed",
    mutationPossible: true
  });
  let error;
  try {
    harness.parseTerminal({
      terminal,
      stdoutBytes: Buffer.alloc(0),
      stderrBytes: Buffer.from(`${JSON.stringify(failure)}\n`, "utf8")
    });
    assert.fail("aggregate failure receipt must not be accepted as success");
  } catch (caught) {
    error = caught;
  }
  assert.equal(error?.message, "attention_required");
  assert.equal(error?.custodyCondition, "snapshot_publish_failed");
  assert.deepEqual(harness.failureReceipt(error, { approvalConsumed: true }), {
    schemaVersion: "1",
    type: "control_plane_welcome_coins_activation_transaction",
    state: "attention_required",
    condition: "attention_required",
    custodyCondition: "snapshot_publish_failed",
    approvalConsumed: true
  });

  const launcherFailure = Object.freeze({
    schemaVersion: "1",
    type: "welcome_coins_native_launcher",
    state: "blocked",
    condition: "post_exec_security_invalid"
  });
  assert.throws(
    () => harness.parseTerminal({
      terminal,
      stdoutBytes: Buffer.alloc(0),
      stderrBytes: Buffer.from(`${JSON.stringify(launcherFailure)}\n`, "utf8")
    }),
    (caught) => caught?.message === "attention_required"
      && caught?.custodyCondition === "post_exec_security_invalid"
  );

  for (const invalid of [
    { ...failure, privatePath: "/private/database.sqlite" },
    { ...failure, condition: "/private/database.sqlite" },
    { ...failure, mutationPossible: false },
    { ...failure, type: "unreviewed_child" }
  ]) {
    assert.throws(
      () => harness.parseTerminal({
        terminal,
        stdoutBytes: Buffer.alloc(0),
        stderrBytes: Buffer.from(`${JSON.stringify(invalid)}\n`, "utf8")
      }),
      (caught) => caught?.condition === "database_custody_failed"
        && caught?.custodyCondition === undefined
    );
  }
  assert.throws(
    () => harness.parseTerminal({
      terminal,
      stdoutBytes: Buffer.alloc(0),
      stderrBytes: Buffer.from(`${JSON.stringify(failure)}\n${JSON.stringify(failure)}\n`, "utf8")
    }),
    (caught) => caught?.condition === "database_custody_failed"
      && caught?.custodyCondition === undefined
  );
  for (const stderrBytes of [
    Buffer.from(`${JSON.stringify(failure)}\r\n`, "utf8"),
    Buffer.from([0xc3, 0x28, 0x0a]),
    Buffer.concat([Buffer.alloc(1024, 0x61), Buffer.from("\n")])
  ]) {
    assert.throws(
      () => harness.parseTerminal({
        terminal,
        stdoutBytes: Buffer.alloc(0),
        stderrBytes
      }),
      (caught) => caught?.condition === "database_custody_failed"
        && caught?.custodyCondition === undefined
    );
  }
  const reordered = Object.fromEntries(Object.entries(failure).reverse());
  assert.throws(
    () => harness.parseTerminal({
      terminal,
      stdoutBytes: Buffer.alloc(0),
      stderrBytes: Buffer.from(`${JSON.stringify(reordered)}\n`, "utf8")
    }),
    (caught) => caught?.condition === "database_custody_failed"
      && caught?.custodyCondition === undefined
  );
  assert.throws(
    () => harness.parseTerminal({
      terminal,
      stdoutBytes: Buffer.from("unexpected stdout\n", "utf8"),
      stderrBytes: Buffer.from(`${JSON.stringify(failure)}\n`, "utf8")
    }),
    (caught) => caught?.condition === "database_custody_failed"
      && caught?.custodyCondition === undefined
  );
});

test("canonical C custody-held failure reaches the final aggregate-only receipt and unknown stderr fails closed", async () => {
  const { __nativeControllerHarness: harness } = await loadHarness();
  const terminal = Object.freeze({ code: 1, signal: null, error: null });
  const custodyHeldFailure = Object.freeze({
    schemaVersion: "1",
    type: "welcome_coins_native_launcher",
    state: "blocked",
    condition: "custody_held_invalid"
  });

  let custodyHeldError;
  try {
    harness.parseTerminal({
      terminal,
      stdoutBytes: Buffer.alloc(0),
      stderrBytes: Buffer.from(`${JSON.stringify(custodyHeldFailure)}\n`, "utf8")
    });
    assert.fail("the native launcher failure must not be accepted as success");
  } catch (error) {
    custodyHeldError = error;
  }
  const custodyHeldReceipt = harness.failureReceipt(
    custodyHeldError,
    { approvalConsumed: true }
  );
  assert.deepEqual(custodyHeldReceipt, {
    schemaVersion: "1",
    type: "control_plane_welcome_coins_activation_transaction",
    state: "attention_required",
    condition: "attention_required",
    custodyCondition: "custody_held_invalid",
    approvalConsumed: true
  });
  assert.deepEqual(Object.keys(custodyHeldReceipt), [
    "schemaVersion",
    "type",
    "state",
    "condition",
    "custodyCondition",
    "approvalConsumed"
  ]);

  const rawIdentifier = "pid=4242 path=/private/state/subscription-control.sqlite";
  const unknownFailure = Object.freeze({
    ...custodyHeldFailure,
    condition: rawIdentifier
  });
  let unknownError;
  try {
    harness.parseTerminal({
      terminal,
      stdoutBytes: Buffer.alloc(0),
      stderrBytes: Buffer.from(`${JSON.stringify(unknownFailure)}\n`, "utf8")
    });
    assert.fail("an unknown native condition must fail closed");
  } catch (error) {
    unknownError = error;
  }
  const unknownReceipt = harness.failureReceipt(unknownError, { approvalConsumed: true });
  assert.deepEqual(unknownReceipt, {
    schemaVersion: "1",
    type: "control_plane_welcome_coins_activation_transaction",
    state: "blocked",
    condition: "database_custody_failed",
    approvalConsumed: true
  });
  assert.equal(JSON.stringify(unknownReceipt).includes(rawIdentifier), false);

  const receiptWithRawField = Object.freeze({
    ...custodyHeldFailure,
    rawIdentifier
  });
  assert.throws(
    () => harness.parseTerminal({
      terminal,
      stdoutBytes: Buffer.alloc(0),
      stderrBytes: Buffer.from(`${JSON.stringify(receiptWithRawField)}\n`, "utf8")
    }),
    (error) => error?.condition === "database_custody_failed"
      && error?.custodyCondition === undefined
  );
});

test("default Linux controller uses authenticated abstract AF_UNIX FD7 and bounded aggregate-only terminal handling", () => {
  const source = readFileSync(LIBRARY_PATH, "utf8");

  assert.match(source, /createServer\s*\(\s*\{\s*pauseOnConnect:\s*true\s*\}\s*\)/u);
  assert.match(source, /`\\0gccgw-wc-\$\{randomUUID\(\)\.replaceAll/u);
  assert.match(source, /createConnection\s*\(\s*\{\s*path:\s*socketName\s*\}\s*\)/u);
  assert.match(source, /spawn\s*\(\s*launcherPath\s*,\s*\[\s*\]/u);
  assert.match(source, /stdio:\s*\[[\s\S]*passedSocket[\s\S]*\]/u);
  assert.match(source, /env:\s*SYSTEMD_COMMAND_ENV/u);
  assert.match(source, /shell:\s*false/u);
  assert.match(source, /hardenedStopped:\s*true/u);
  assert.match(source, /expectedRuntimeConditionStartGuardIdentity:\s*guardIdentity/u);
  assert.match(
    source,
    /WELCOME_COINS_NATIVE_HEARTBEAT_MAGIC\s*=\s*"welcome_coins_native_heartbeat_v1"/u
  );
  assert.match(
    source,
    /WELCOME_COINS_NATIVE_HEARTBEAT_ACK_MAGIC\s*=\s*\n\s*"welcome_coins_native_heartbeat_ack_v1"/u
  );
  assert.match(source, /async exchangeCustodyHeartbeat\s*\(\s*value\s*\)/u);
  assert.match(source, /WELCOME_COINS_NATIVE_TERMINAL_TIMEOUT_MS\s*=\s*155_000/u);
  assert.match(source, /stderrBytes\.length\s*!==\s*0/u);
  assert.doesNotMatch(source, /console\.(?:log|error|warn)\s*\(/u);
});
