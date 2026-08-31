import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const LIBRARY_PATH = resolve(
  REPOSITORY_ROOT,
  "scripts/control-plane-welcome-coins-activation-gate-lib.mjs"
);
const TRANSACTION_CLI_PATH = resolve(
  REPOSITORY_ROOT,
  "scripts/control-plane-welcome-coins-activation-transaction-cli.mjs"
);
const TRANSACTION_COMPATIBILITY_PATH = resolve(
  REPOSITORY_ROOT,
  "scripts/control-plane-welcome-coins-activation-transaction.mjs"
);
const SERVICE_UNIT = "proxy-gateway-candidate.service";
const CANARY_DIGEST = "a".repeat(64);
const ENVIRONMENT_SHA256 = "b".repeat(64);
const POST_ACTIVATION_ENVIRONMENT_SHA256 = "c".repeat(64);
const GUARD_IDENTITY = "runtime-condition-v1:11:22:33:44";
const DATABASE_BOUNDARY = Object.freeze({
  logicalSha256: "1".repeat(64),
  objectIdentitySha256: "2".repeat(64),
  parentIdentitySha256: "3".repeat(64)
});
const SERVICE_PRINCIPAL = Object.freeze({ uid: 1001, gid: 1001 });
const CUSTODY_CHILD_PROCESS_IDENTITY_SHA256 = "5".repeat(64);
const CUSTODY_CHILD_CHANNEL_BINDING_SHA256 = "6".repeat(64);
const PRIVATE_VALUES = Object.freeze({
  approvalToken: "private-approval-token",
  databasePath: "/private/state/subscription-control.sqlite",
  snapshotPath: "/private/snapshots/control-plane.sqlite",
  rawEvent: "pid=4242 mask=CLOSE_WRITE",
  email: "private-canary@example.invalid"
});

function replaceExactModuleSpecifier(source, specifier, replacement) {
  const needle = JSON.stringify(specifier);
  assert.equal(source.split(needle).length - 1, 1, specifier);
  return source.replace(needle, JSON.stringify(replacement));
}

function sourceDataUrl(source) {
  return `data:text/javascript;base64,${Buffer.from(source, "utf8").toString("base64")}`;
}

let privateHarnessPromise;

function loadPrivateTransactionHarness() {
  if (privateHarnessPromise) return privateHarnessPromise;
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
    pathToFileURL(resolve(REPOSITORY_ROOT, "scripts/control-plane-welcome-coins-holder-observer-lib.mjs")).href
  );
  source += `
const __transactionCoreForHarness =
  typeof runWelcomeCoinsActivationTransactionCore === "function"
    ? runWelcomeCoinsActivationTransactionCore
    : undefined;
export { __transactionCoreForHarness };
`;
  privateHarnessPromise = import(sourceDataUrl(source));
  return privateHarnessPromise;
}

async function transactionCore() {
  const harness = await loadPrivateTransactionHarness();
  assert.equal(
    typeof harness.__transactionCoreForHarness,
    "function",
    "the one-shot transaction core must exist but remain production-private"
  );
  return harness.__transactionCoreForHarness;
}

function executionEnvelope() {
  return Object.freeze({
    schemaVersion: "1",
    scope: "welcome-coins-activation-transaction",
    serviceUnit: SERVICE_UNIT,
    expectedEnvironmentSha256: ENVIRONMENT_SHA256,
    approvalToken: PRIVATE_VALUES.approvalToken
  });
}

function guardedServiceState(activeState, identity = GUARD_IDENTITY) {
  return {
    unit: SERVICE_UNIT,
    activeState,
    loadState: "loaded",
    needDaemonReload: "no",
    mainPid: activeState === "active" ? 4242 : 0,
    runtimeConditionStartGuard: true,
    runtimeConditionStartGuardIdentity: identity,
    privateDropInPath: "/run/systemd/system/private-start-guard.conf"
  };
}

function expectedReceipt() {
  return {
    schemaVersion: "1",
    type: "control_plane_welcome_coins_activation_transaction",
    state: "activation_verified_guarded",
    approvalConsumed: true,
    service: {
      unit: SERVICE_UNIT,
      activeState: "inactive",
      runtimeConditionStartGuard: true
    },
    database: {
      exclusiveCustodyHeldThroughActivationVerification: true,
      holderObservationPhases: 2,
      identityBound: true
    },
    schema: {
      state: "ready",
      exact: true,
      snapshotCreated: true
    },
    activation: {
      state: "verified",
      environmentSha256: POST_ACTIVATION_ENVIRONMENT_SHA256
    }
  };
}

function custodyChildClaim(overrides = {}) {
  return {
    exclusiveCustodyHeld: true,
    processIdentitySha256: CUSTODY_CHILD_PROCESS_IDENTITY_SHA256,
    channelBindingSha256: CUSTODY_CHILD_CHANNEL_BINDING_SHA256,
    uid: SERVICE_PRINCIPAL.uid,
    gid: SERVICE_PRINCIPAL.gid,
    ...overrides
  };
}

function operationFixture({
  effectiveUid = 0,
  servicePrincipal = SERVICE_PRINCIPAL,
  failAt,
  firstHolderCount = 0,
  secondHolderCount = 0,
  secondBoundary = DATABASE_BOUNDARY,
  approvedCustodyChildHolderCount = 1,
  approvedCustodyChildProcessIdentitySha256 = CUSTODY_CHILD_PROCESS_IDENTITY_SHA256,
  approvedCustodyChildChannelBindingSha256 = CUSTODY_CHILD_CHANNEL_BINDING_SHA256,
  custodyClaim = custodyChildClaim()
} = {}) {
  const events = [];
  const mutationEvents = [];
  const holderInspectionCalls = [];
  let startCalled = false;
  let canaryCalled = false;
  let standaloneSchemaApplyCalled = false;

  function observe(name) {
    events.push(name);
    if (failAt === name) throw new Error(`fault:${name}`);
  }

  function mutate(name) {
    events.push(name);
    mutationEvents.push(name);
    if (failAt === name) throw new Error(`fault:${name}`);
  }

  const operations = {
    readEffectiveUid() {
      observe("uid:root");
      return effectiveUid;
    },
    validateExecutionEnvelope(value) {
      observe("envelope:validate");
      assert.equal(value.serviceUnit, SERVICE_UNIT);
      return {
        valid: true,
        serviceUnit: SERVICE_UNIT,
        approvalDigestSha256: "4".repeat(64),
        privateApprovalToken: PRIVATE_VALUES.approvalToken
      };
    },
    runFreshPreflight({ expectedEnvironmentSha256 }) {
      observe("activation:preflight");
      assert.equal(expectedEnvironmentSha256, ENVIRONMENT_SHA256);
      return {
        state: "ready",
        environmentSha256: ENVIRONMENT_SHA256,
        privateEnvironmentPath: PRIVATE_VALUES.databasePath
      };
    },
    resolveServicePrincipal({ serviceUnit }) {
      observe("principal:resolve");
      assert.equal(serviceUnit, SERVICE_UNIT);
      return servicePrincipal;
    },
    consumeExecutionEnvelope() {
      mutate("approval:consume");
      return {
        consumed: true,
        privateApprovalToken: PRIVATE_VALUES.approvalToken
      };
    },
    establishStartGuard({ serviceUnit }) {
      mutate("guard:establish");
      assert.equal(serviceUnit, SERVICE_UNIT);
      return guardedServiceState("active");
    },
    readGuardedServiceState({ phase }) {
      const activeState = phase === "active" ? "active" : "inactive";
      observe(`guard:${phase}`);
      return guardedServiceState(activeState);
    },
    stopService({ serviceUnit }) {
      mutate("service:stop");
      assert.equal(serviceUnit, SERVICE_UNIT);
      return { stopped: true };
    },
    inspectExternalHolders({
      phase,
      expectedDatabaseBoundary,
      expectedCustodyChildProcessIdentitySha256,
      expectedCustodyChildChannelBindingSha256
    }) {
      observe(`holders:${phase}`);
      holderInspectionCalls.push({
        phase,
        expectedDatabaseBoundary,
        expectedCustodyChildProcessIdentitySha256,
        expectedCustodyChildChannelBindingSha256
      });
      if (phase === "inactive_pre_custody") {
        assert.equal(expectedDatabaseBoundary, undefined);
        assert.equal(expectedCustodyChildProcessIdentitySha256, undefined);
        assert.equal(expectedCustodyChildChannelBindingSha256, undefined);
        return {
          externalHolderCount: firstHolderCount,
          databaseBoundary: DATABASE_BOUNDARY,
          privateDatabasePath: PRIVATE_VALUES.databasePath,
          rawIdentifiers: [PRIVATE_VALUES.rawEvent]
        };
      }
      assert.equal(phase, "exclusive_pre_commit");
      assert.deepEqual(expectedDatabaseBoundary, DATABASE_BOUNDARY);
      return {
        externalHolderCount: secondHolderCount,
        approvedCustodyChildHolderCount,
        approvedCustodyChildProcessIdentitySha256,
        approvedCustodyChildChannelBindingSha256,
        databaseBoundary: secondBoundary,
        privateDatabasePath: PRIVATE_VALUES.databasePath,
        rawIdentifiers: [PRIVATE_VALUES.rawEvent]
      };
    },
    async runSchemaCustody({
      servicePrincipal: actualPrincipal,
      expectedDatabaseBoundary,
      authorizeCommit,
      runWhileCustodyHeld
    }) {
      assert.deepEqual(actualPrincipal, SERVICE_PRINCIPAL);
      assert.notEqual(actualPrincipal.uid, 0);
      assert.deepEqual(expectedDatabaseBoundary, DATABASE_BOUNDARY);
      observe("schema:exclusive_acquired");
      assert.equal(await authorizeCommit(custodyClaim), true);
      mutate("schema:commit");
      const result = {
        state: "schema_ready",
        schemaState: "ready",
        schemaExact: true,
        snapshotCreated: true,
        privateSnapshotPath: PRIVATE_VALUES.snapshotPath,
        privateDatabaseValue: "not-for-receipt"
      };
      assert.equal(typeof runWhileCustodyHeld, "function");
      assert.equal(await runWhileCustodyHeld(result, async (stage) => {
        observe(`custody:${stage}`);
        return true;
      }), true);
      return result;
    },
    activate({ expectedEnvironmentSha256, canaryDigest }) {
      mutate("activation:apply");
      assert.equal(expectedEnvironmentSha256, ENVIRONMENT_SHA256);
      assert.equal(canaryDigest, CANARY_DIGEST);
      return {
        state: "activated",
        environmentSha256: POST_ACTIVATION_ENVIRONMENT_SHA256,
        privateCanaryDigest: CANARY_DIGEST,
        privateCanaryEmail: PRIVATE_VALUES.email
      };
    },
    verify({ expectedEnvironmentSha256 }) {
      observe("activation:verify");
      assert.equal(expectedEnvironmentSha256, POST_ACTIVATION_ENVIRONMENT_SHA256);
      return {
        state: "verified",
        environmentSha256: POST_ACTIVATION_ENVIRONMENT_SHA256,
        privateEnvironmentPath: PRIVATE_VALUES.databasePath
      };
    },
    standaloneSchemaApply() {
      standaloneSchemaApplyCalled = true;
      throw new Error("standalone schema mutation must not be selected");
    },
    startService() {
      startCalled = true;
      throw new Error("service start is outside this transaction");
    },
    runCanary() {
      canaryCalled = true;
      throw new Error("canary execution is outside this transaction");
    }
  };

  return {
    operations,
    events,
    mutationEvents,
    holderInspectionCalls,
    excludedOperationsCalled() {
      return { standaloneSchemaApplyCalled, startCalled, canaryCalled };
    }
  };
}

async function runCore(fixture, envelope = executionEnvelope(), coreOverride) {
  const core = coreOverride ?? await transactionCore();
  return core({
    executionEnvelope: envelope,
    canaryDigest: CANARY_DIGEST,
    operations: fixture.operations
  });
}

test("production exposes only the closed transaction CLI runner, never the transaction core or mutators", async () => {
  const productionModule = await import(pathToFileURL(LIBRARY_PATH).href);
  const transactionExports = Object.keys(productionModule)
    .filter((name) => name.includes("ActivationTransaction"))
    .sort();

  assert.deepEqual(transactionExports, ["runWelcomeCoinsActivationTransactionCli"]);
  for (const name of [
    "runWelcomeCoinsActivationTransactionCore",
    "consumeWelcomeCoinsActivationExecutionEnvelope",
    "applyWelcomeCoinsSchemaUnderCustody",
    "activateWelcomeCoins",
    "startWelcomeCoinsService",
    "runWelcomeCoinsCanary"
  ]) {
    assert.equal(Object.hasOwn(productionModule, name), false, name);
  }
});

test("closed production runner rejects invalid input without honoring caller-supplied operation seams", async () => {
  const productionModule = await import(pathToFileURL(LIBRARY_PATH).href);
  assert.equal(typeof productionModule.runWelcomeCoinsActivationTransactionCli, "function");
  let injectedOperationCalled = false;
  let stdout = "";
  let stderr = "";
  const status = await productionModule.runWelcomeCoinsActivationTransactionCli({
    argv: ["--db-path", PRIVATE_VALUES.databasePath],
    stdout: { write: (value) => { stdout += value; } },
    stderr: { write: (value) => { stderr += value; } },
    operations: {
      consumeExecutionEnvelope() {
        injectedOperationCalled = true;
      }
    },
    transactionCore() {
      injectedOperationCalled = true;
    },
    standaloneSchemaApply() {
      injectedOperationCalled = true;
    }
  });

  assert.notEqual(status, 0);
  assert.equal(injectedOperationCalled, false);
  assert.equal(stdout, "");
  assert.equal(stderr.trim().split("\n").length, 1);
  assert.deepEqual(JSON.parse(stderr), {
    schemaVersion: "1",
    type: "control_plane_welcome_coins_activation_transaction",
    state: "blocked",
    condition: "invalid_input"
  });
  assert.equal(stderr.includes(PRIVATE_VALUES.databasePath), false);
});

test("dedicated and compatibility transaction launchers dispatch and package exposes no standalone mutation alias", () => {
  for (const scriptPath of [TRANSACTION_CLI_PATH, TRANSACTION_COMPATIBILITY_PATH]) {
    const result = spawnSync(process.execPath, [scriptPath], {
      cwd: REPOSITORY_ROOT,
      encoding: "utf8"
    });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    const directOuterCondition = process.platform === "linux"
      && process.getuid?.() === 0
      && process.geteuid?.() === 0
      && process.getgid?.() === 0
      && process.getegid?.() === 0
      ? "outer_runtime_invalid"
      : "invoker_not_root";
    assert.deepEqual(JSON.parse(result.stderr), {
      schemaVersion: "1",
      type: "control_plane_welcome_coins_production_transaction",
      state: "blocked",
      condition: directOuterCondition
    });
  }

  const packageJson = JSON.parse(readFileSync(resolve(REPOSITORY_ROOT, "package.json"), "utf8"));
  assert.equal(Object.hasOwn(packageJson.scripts, "welcome-coins:activation:transaction"), false);
  assert.equal(Object.hasOwn(packageJson.scripts, "welcome-coins:activation:apply"), false);
  assert.equal(Object.hasOwn(packageJson.scripts, "welcome-coins:activation:deactivate"), false);
});

test("one-shot transaction consumes approval before the first mutation and ends verified, inactive, and guarded", async () => {
  const fixture = operationFixture();

  const receipt = await runCore(fixture);

  assert.deepEqual(receipt, expectedReceipt());
  assert.deepEqual(fixture.holderInspectionCalls[1], {
    phase: "exclusive_pre_commit",
    expectedDatabaseBoundary: DATABASE_BOUNDARY,
    expectedCustodyChildProcessIdentitySha256: CUSTODY_CHILD_PROCESS_IDENTITY_SHA256,
    expectedCustodyChildChannelBindingSha256: CUSTODY_CHILD_CHANNEL_BINDING_SHA256
  });
  assert.equal(fixture.events.indexOf("activation:preflight") < fixture.events.indexOf("approval:consume"), true);
  assert.equal(fixture.mutationEvents[0], "approval:consume");
  for (const [before, after] of [
    ["approval:consume", "guard:establish"],
    ["guard:establish", "service:stop"],
    ["service:stop", "holders:inactive_pre_custody"],
    ["holders:inactive_pre_custody", "schema:exclusive_acquired"],
    ["schema:exclusive_acquired", "holders:exclusive_pre_commit"],
    ["holders:exclusive_pre_commit", "schema:commit"],
    ["schema:commit", "activation:apply"],
    ["activation:apply", "activation:verify"],
    ["activation:verify", "guard:terminal"]
  ]) {
    assert.equal(fixture.events.indexOf(before) < fixture.events.indexOf(after), true, `${before} -> ${after}`);
  }
  assert.deepEqual(fixture.excludedOperationsCalled(), {
    standaloneSchemaApplyCalled: false,
    startCalled: false,
    canaryCalled: false
  });
});

test("post-commit database custody encloses activation verification and the terminal guard", async () => {
  const fixture = operationFixture();
  const readGuardedServiceState = fixture.operations.readGuardedServiceState;
  const activate = fixture.operations.activate;
  const verify = fixture.operations.verify;
  let custodyHeld = false;
  let custodyReleased = false;

  fixture.operations.readGuardedServiceState = (options) => {
    if (options.phase === "pre_activation" || options.phase === "terminal") {
      assert.equal(custodyHeld, true, `${options.phase} must run while database custody is held`);
    }
    return readGuardedServiceState(options);
  };
  fixture.operations.activate = (options) => {
    assert.equal(custodyHeld, true, "activation must run while database custody is held");
    return activate(options);
  };
  fixture.operations.verify = (options) => {
    assert.equal(custodyHeld, true, "verification must run while database custody is held");
    return verify(options);
  };
  fixture.operations.runSchemaCustody = async ({
    servicePrincipal,
    expectedDatabaseBoundary,
    authorizeCommit,
    runWhileCustodyHeld
  }) => {
    assert.deepEqual(servicePrincipal, SERVICE_PRINCIPAL);
    assert.deepEqual(expectedDatabaseBoundary, DATABASE_BOUNDARY);
    assert.equal(
      typeof runWhileCustodyHeld,
      "function",
      "the transaction must pass its private activation phase into schema custody"
    );

    fixture.events.push("schema:exclusive_acquired");
    custodyHeld = true;
    try {
      assert.equal(await authorizeCommit(custodyChildClaim()), true);
      fixture.events.push("schema:commit");
      fixture.mutationEvents.push("schema:commit");
      fixture.events.push("schema:post_commit_hold");
      const schemaResult = {
        state: "schema_ready",
        schemaState: "ready",
        schemaExact: true,
        snapshotCreated: true
      };
      await runWhileCustodyHeld(schemaResult, async (stage) => {
        assert.equal(custodyHeld, true, `${stage} must retain database custody`);
        fixture.events.push(`custody:${stage}`);
        return true;
      });
      return schemaResult;
    } finally {
      fixture.events.push("schema:custody_release");
      custodyHeld = false;
      custodyReleased = true;
    }
  };

  const receipt = await runCore(fixture);

  assert.equal(custodyReleased, true, "runSchemaCustody must release before the transaction returns");
  assert.equal(custodyHeld, false);
  for (const [before, after] of [
    ["schema:commit", "schema:post_commit_hold"],
    ["schema:post_commit_hold", "custody:pre_activation"],
    ["custody:pre_activation", "activation:apply"],
    ["activation:apply", "custody:post_activation"],
    ["custody:post_activation", "activation:verify"],
    ["activation:verify", "custody:post_verify"],
    ["custody:post_verify", "guard:terminal"],
    ["guard:terminal", "custody:post_terminal_guard"],
    ["custody:post_terminal_guard", "schema:custody_release"]
  ]) {
    assert.equal(fixture.events.indexOf(before) < fixture.events.indexOf(after), true, `${before} -> ${after}`);
  }
  assert.equal(
    Object.hasOwn(receipt.database, "externalHolderCount"),
    false,
    "a terminal receipt must not claim that a point-in-time holder scan remained continuously true"
  );
});

test("the original guard identity is pinned before custody commit and through activation verification", async () => {
  const fixture = operationFixture();
  const runSchemaCustody = fixture.operations.runSchemaCustody;
  const activate = fixture.operations.activate;
  const verify = fixture.operations.verify;
  fixture.operations.runSchemaCustody = (options) => {
    assert.equal(options.expectedGuardIdentity, GUARD_IDENTITY);
    return runSchemaCustody(options);
  };
  fixture.operations.activate = (options) => {
    assert.equal(options.expectedGuardIdentity, GUARD_IDENTITY);
    return activate(options);
  };
  fixture.operations.verify = (options) => {
    assert.equal(options.expectedGuardIdentity, GUARD_IDENTITY);
    return verify(options);
  };

  await runCore(fixture);
  assert.equal(fixture.events.includes("guard:exclusive_pre_commit"), true);
  assert.equal(fixture.events.includes("guard:pre_activation"), true);
});

test("a replaced guard cannot authorize custody commit", async () => {
  const fixture = operationFixture();
  const changedIdentity = "runtime-condition-v1:55:66:77:88";
  fixture.operations.readGuardedServiceState = ({ phase }) => {
    const activeState = phase === "active" ? "active" : "inactive";
    fixture.events.push(`guard:${phase}`);
    return guardedServiceState(
      activeState,
      phase === "exclusive_pre_commit" ? changedIdentity : GUARD_IDENTITY
    );
  };

  await assert.rejects(
    () => runCore(fixture),
    (error) => error?.condition === "service_start_guard_changed"
  );
  assert.equal(fixture.events.includes("schema:commit"), false);
  assert.equal(fixture.events.includes("activation:apply"), false);
});

test("every failure after schema success is attention-required with the guard retained", async () => {
  const afterSchemaCases = [
    {
      label: "guard drift before activation",
      configure(fixture) {
        const original = fixture.operations.readGuardedServiceState;
        fixture.operations.readGuardedServiceState = (options) => options.phase === "pre_activation"
          ? guardedServiceState("inactive", "runtime-condition-v1:55:66:77:88")
          : original(options);
      },
      forbidden: "activation:apply"
    },
    {
      label: "verification failure after activation publish",
      configure(fixture) {
        fixture.operations.verify = () => {
          fixture.events.push("activation:verify");
          throw new Error("private verification failure");
        };
      },
      forbidden: "guard:terminal"
    },
    {
      label: "terminal guard drift",
      configure(fixture) {
        const original = fixture.operations.readGuardedServiceState;
        fixture.operations.readGuardedServiceState = (options) => options.phase === "terminal"
          ? guardedServiceState("inactive", "runtime-condition-v1:55:66:77:88")
          : original(options);
      }
    }
  ];

  for (const item of afterSchemaCases) {
    const fixture = operationFixture();
    item.configure(fixture);
    await assert.rejects(
      () => runCore(fixture),
      (error) => error?.message === "attention_required",
      item.label
    );
    if (item.forbidden) assert.equal(fixture.events.includes(item.forbidden), false, item.label);
    assert.equal(fixture.events.includes("startService"), false, item.label);
  }
});

test("transaction requires a root controller and positive uid and gid for the service database principal before consuming approval", async () => {
  const core = await transactionCore();
  for (const options of [
    { effectiveUid: 1001 },
    { servicePrincipal: { uid: 0, gid: 1001 } },
    { servicePrincipal: { uid: 1001, gid: 0 } }
  ]) {
    const fixture = operationFixture(options);
    await assert.rejects(() => runCore(fixture, executionEnvelope(), core));
    assert.equal(fixture.events.includes("approval:consume"), false, JSON.stringify(options));
    assert.equal(fixture.events.includes("guard:establish"), false, JSON.stringify(options));
  }
});

test("second zero-holder observation is bound to the same database boundary after exclusive acquisition and before commit", async () => {
  const core = await transactionCore();
  for (const options of [
    { firstHolderCount: 1 },
    { secondHolderCount: 1 },
    {
      secondBoundary: {
        ...DATABASE_BOUNDARY,
        objectIdentitySha256: "9".repeat(64)
      }
    }
  ]) {
    const fixture = operationFixture(options);
    await assert.rejects(() => runCore(fixture, executionEnvelope(), core));
    assert.equal(fixture.events.includes("activation:apply"), false);
    if (options.firstHolderCount === 1) {
      assert.equal(fixture.events.includes("schema:exclusive_acquired"), false);
    } else {
      assert.equal(fixture.events.indexOf("schema:exclusive_acquired") >= 0, true);
      assert.equal(fixture.events.indexOf("schema:exclusive_acquired") < fixture.events.indexOf("holders:exclusive_pre_commit"), true);
      assert.equal(fixture.events.includes("schema:commit"), false);
    }
  }
});

test("commit authorization requires exactly one approved custody child holder bound to the acquired child identity", async () => {
  const core = await transactionCore();
  for (const options of [
    { approvedCustodyChildHolderCount: 0 },
    { approvedCustodyChildHolderCount: 2 },
    { approvedCustodyChildProcessIdentitySha256: "7".repeat(64) },
    { approvedCustodyChildChannelBindingSha256: "8".repeat(64) }
  ]) {
    const fixture = operationFixture(options);
    await assert.rejects(() => runCore(fixture, executionEnvelope(), core));
    assert.equal(fixture.events.includes("schema:exclusive_acquired"), true);
    assert.equal(fixture.events.includes("holders:exclusive_pre_commit"), true);
    assert.equal(fixture.events.includes("schema:commit"), false);
    assert.equal(fixture.events.includes("activation:apply"), false);
  }
});

test("commit authorization rejects malformed or cross-principal custody claims before the second holder observation", async () => {
  const core = await transactionCore();
  for (const claim of [
    null,
    custodyChildClaim({ exclusiveCustodyHeld: false }),
    custodyChildClaim({ processIdentitySha256: "invalid" }),
    custodyChildClaim({ channelBindingSha256: "invalid" }),
    custodyChildClaim({ uid: SERVICE_PRINCIPAL.uid + 1 }),
    custodyChildClaim({ gid: SERVICE_PRINCIPAL.gid + 1 }),
    { ...custodyChildClaim(), unexpected: true }
  ]) {
    const fixture = operationFixture({ custodyClaim: claim });
    await assert.rejects(() => runCore(fixture, executionEnvelope(), core));
    assert.equal(fixture.events.includes("schema:exclusive_acquired"), true);
    assert.equal(fixture.events.includes("holders:exclusive_pre_commit"), false);
    assert.equal(fixture.events.includes("schema:commit"), false);
    assert.equal(fixture.events.includes("activation:apply"), false);
  }
});

test("each failed gate stops later schema, activation, and verification phases", async () => {
  const core = await transactionCore();
  const cases = [
    ["approval:consume", "guard:establish"],
    ["guard:establish", "service:stop"],
    ["service:stop", "holders:inactive_pre_custody"],
    ["holders:inactive_pre_custody", "schema:exclusive_acquired"],
    ["holders:exclusive_pre_commit", "schema:commit"],
    ["schema:commit", "activation:apply"],
    ["activation:apply", "activation:verify"]
  ];

  for (const [failed, forbidden] of cases) {
    const fixture = operationFixture({ failAt: failed });
    const mutationMayHaveOccurred = new Set(["schema:commit", "activation:apply"]).has(failed);
    await assert.rejects(
      () => runCore(fixture, executionEnvelope(), core),
      mutationMayHaveOccurred
        ? (error) => error?.message === "attention_required"
        : new RegExp(`fault:${failed}`)
    );
    assert.equal(fixture.events.includes(forbidden), false, `${failed} must stop ${forbidden}`);
  }
});

test("successful receipt is exact aggregate-only evidence and cannot leak approval, identifiers, paths, or raw events", async () => {
  const fixture = operationFixture();
  const receipt = await runCore(fixture);
  const serialized = JSON.stringify(receipt);

  assert.deepEqual(receipt, expectedReceipt());
  for (const privateValue of [
    PRIVATE_VALUES.approvalToken,
    PRIVATE_VALUES.databasePath,
    PRIVATE_VALUES.snapshotPath,
    PRIVATE_VALUES.rawEvent,
    PRIVATE_VALUES.email,
    CANARY_DIGEST,
    "4242",
    "CLOSE_WRITE"
  ]) {
    assert.equal(serialized.includes(privateValue), false, privateValue);
  }
  assert.equal(/(?:pid|path|token|timestamp|raw|event|sizeBytes)/iu.test(serialized), false);
});
