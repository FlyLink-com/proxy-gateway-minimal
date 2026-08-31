import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  closeSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
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
const OUTER_WRAPPER_SOURCE_PATH = resolve(
  REPOSITORY_ROOT,
  "scripts/native/welcome-coins-activation-outer-wrapper.c"
);
const PACKAGE_JSON_PATH = resolve(REPOSITORY_ROOT, "package.json");

const SERVICE_UNIT = "proxy-gateway-candidate.service";
const ACTIVE_ENVIRONMENT_SHA256 = "a".repeat(64);
const DISABLED_ENVIRONMENT_SHA256 = "b".repeat(64);
const APPROVAL_DIGEST_SHA256 = "c".repeat(64);
const GUARD_IDENTITY = "runtime-condition-v1:11:22:33:44";
const ARTIFACTS = Object.freeze({
  candidateRootSha256: "1".repeat(64),
  transactionCliSha256: "2".repeat(64),
  activationLibrarySha256: "3".repeat(64),
  snapshotLibrarySha256: "4".repeat(64),
  holderObserverSha256: "5".repeat(64),
  welcomeBonusMigrationsSha256: "6".repeat(64),
  coinWalletMigrationsSha256: "7".repeat(64),
  custodyCliSha256: "8".repeat(64),
  outerWrapperSha256: "9".repeat(64),
  nativeLauncherSha256: "a".repeat(64),
  postExecBootstrapSha256: "b".repeat(64),
  outerPostExecBootstrapSha256: "c".repeat(64),
  nativeBuildReceiptSha256: "d".repeat(64),
  nodeModulesTreeSha256: "e".repeat(64),
  nodeSha256: "f".repeat(64)
});
const CANDIDATE_ARTIFACT_SPECS = Object.freeze([
  ["scripts/control-plane-welcome-coins-activation-transaction-cli.mjs", "0644", "file"],
  ["scripts/control-plane-welcome-coins-activation-gate-lib.mjs", "0644", "file"],
  ["scripts/control-plane-db-snapshot-gate-lib.mjs", "0644", "file"],
  ["scripts/control-plane-welcome-coins-holder-observer-lib.mjs", "0644", "file"],
  ["server/services/platform/portal-registration-welcome-bonus-migrations.mjs", "0644", "file"],
  ["server/services/platform/coin-wallet-migrations.mjs", "0644", "file"],
  ["scripts/control-plane-welcome-coins-activation-transaction-custody-cli.mjs", "0644", "file"],
  ["node_modules/.gccgw-native/welcome-coins-activation-outer-wrapper", "0755", "static-pie"],
  ["node_modules/.gccgw-native/welcome-coins-custody-launcher", "0755", "pie"],
  ["node_modules/.gccgw-native/welcome-coins-post-exec-bootstrap.so", "0644", "shared-object"],
  ["node_modules/.gccgw-native/welcome-coins-outer-post-exec-bootstrap.so", "0644", "shared-object"],
  ["node_modules/.gccgw-native/welcome-coins-native-build.json", "0644", "json"]
]);

function sha256Canonical(value) {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

function productionArtifactBinding(identitySeed) {
  const artifacts = CANDIDATE_ARTIFACT_SPECS.map(([path, mode, kind], index) => ({
    path,
    sha256: ((index + 1).toString(16)).repeat(64),
    fileIdentitySha256: identitySeed.repeat(64),
    sizeBytes: index + 1,
    mode,
    kind
  }));
  const dependencyTree = {
    sha256: "d".repeat(64),
    entryCount: 1,
    totalBytes: 1,
    hardlinksBroken: true,
    symlinksInternal: true
  };
  return {
    schemaVersion: "1",
    type: "welcome_coins_activation_artifact_binding",
    candidateRoot: "/opt/proxy-gateway-minimal-candidate/releases/release-2026-08-30",
    expectedRelease: "release-2026-08-30",
    candidateRootSha256: sha256Canonical({
      schemaVersion: "1",
      type: "welcome_coins_activation_candidate_control_surface",
      expectedRelease: "release-2026-08-30",
      files: artifacts.map(({ fileIdentitySha256: _identity, ...record }) => record),
      dependencyTree
    }),
    artifacts,
    dependencyTree,
    node: {
      path: "/usr/bin/node",
      sha256: "e".repeat(64),
      fileIdentitySha256: identitySeed.repeat(64),
      sizeBytes: 1,
      mode: "0755",
      kind: "elf"
    }
  };
}

function sourceDataUrl(source) {
  return `data:text/javascript;base64,${Buffer.from(source, "utf8").toString("base64")}`;
}

function replaceExactModuleSpecifier(source, specifier, replacement) {
  const needle = JSON.stringify(specifier);
  assert.equal(source.split(needle).length - 1, 1, specifier);
  return source.replace(needle, JSON.stringify(replacement));
}

let harnessPromise;
let outerHarnessPromise;

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
export const __deactivationTransactionHarness = Object.freeze({
  exactEnvelope: typeof exactWelcomeCoinsDeactivationExecutionEnvelope === "function"
    ? exactWelcomeCoinsDeactivationExecutionEnvelope
    : undefined,
  consumeEnvelope: typeof consumeWelcomeCoinsExecutionEnvelope === "function"
    ? consumeWelcomeCoinsExecutionEnvelope
    : undefined,
  exactGuardedState: typeof exactWelcomeCoinsTransactionGuardedState === "function"
    ? exactWelcomeCoinsTransactionGuardedState
    : undefined,
  requireEmptyStdin: typeof requireEmptyDeactivationStdin === "function"
    ? requireEmptyDeactivationStdin
    : undefined,
  transactionCore: typeof runWelcomeCoinsDeactivationTransactionCore === "function"
    ? runWelcomeCoinsDeactivationTransactionCore
    : undefined,
  productionTransaction: typeof runWelcomeCoinsDeactivationProductionTransaction === "function"
    ? runWelcomeCoinsDeactivationProductionTransaction
    : undefined,
  failureReceipt: typeof welcomeCoinsDeactivationTransactionFailureReceipt === "function"
    ? welcomeCoinsDeactivationTransactionFailureReceipt
    : undefined,
  writeCompletedReceipt: typeof writeWelcomeCoinsCompletedTransactionReceipt === "function"
    ? writeWelcomeCoinsCompletedTransactionReceipt
    : undefined
});
`;
  harnessPromise = import(sourceDataUrl(source));
  return harnessPromise;
}

function loadOuterHarness() {
  if (outerHarnessPromise) return outerHarnessPromise;
  let source = readFileSync(TRANSACTION_CLI_PATH, "utf8");
  const mainInvocation = "process.exitCode = await main();";
  assert.equal(source.split(mainInvocation).length - 1, 1);
  source = source.replace(mainInvocation, "");
  source += `
export const __deactivationOuterHarness = Object.freeze({
  decodeExecutionEnvelopeBytes
});
`;
  outerHarnessPromise = import(sourceDataUrl(source));
  return outerHarnessPromise;
}

function deactivationEnvelope(overrides = {}) {
  return {
    schemaVersion: "1",
    type: "control_plane_welcome_coins_deactivation_execution_envelope",
    scope: "welcome-coins-deactivation-transaction",
    approvalDigestSha256: APPROVAL_DIGEST_SHA256,
    expiresAt: "2026-09-30T18:00:00.000Z",
    retry: false,
    serviceUnit: SERVICE_UNIT,
    expectedRelease: "release-2026-08-30",
    expectedActiveEnvironmentSha256: ACTIVE_ENVIRONMENT_SHA256,
    expectedDisabledEnvironmentSha256: DISABLED_ENVIRONMENT_SHA256,
    servicePrincipal: {
      uid: 1001,
      gid: 1002
    },
    artifacts: { ...ARTIFACTS },
    ...overrides
  };
}

function guardedState(activeState, identity = GUARD_IDENTITY) {
  return {
    unit: SERVICE_UNIT,
    activeState,
    loadState: "loaded",
    needDaemonReload: "no",
    mainPid: activeState === "active" ? 4242 : 0,
    runtimeConditionStartGuard: true,
    runtimeConditionStartGuardIdentity: identity
  };
}

test("deactivation envelope is an exact independent operation contract", async () => {
  const { __deactivationTransactionHarness: harness } = await loadHarness();
  assert.equal(typeof harness.exactEnvelope, "function");
  const nowMs = Date.parse("2026-08-30T18:00:00.000Z");
  const valid = deactivationEnvelope();
  assert.deepEqual(harness.exactEnvelope(valid, { nowMs }), valid);

  const activationOnlyFields = {
    ...valid,
    canaryDigestCommitmentSha256: "d".repeat(64),
    custody: {
      dbPath: "/private/control.sqlite",
      snapshotDirectory: "/private/snapshots",
      tempRoot: "/private/tmp"
    }
  };
  for (const candidate of [
    { ...valid, type: "control_plane_welcome_coins_activation_execution_envelope" },
    { ...valid, scope: "welcome-coins-activation-transaction" },
    { ...valid, retry: true },
    { ...valid, expiresAt: "2026-08-30T17:59:59.000Z" },
    { ...valid, serviceUnit: "other.service" },
    { ...valid, expectedActiveEnvironmentSha256: "A".repeat(64) },
    activationOnlyFields,
    Object.fromEntries(Object.entries(valid).reverse())
  ]) {
    assert.throws(
      () => harness.exactEnvelope(candidate, { nowMs }),
      (error) => error?.condition === "execution_envelope_invalid"
    );
  }
});

test("pre-import gate accepts the deactivation union branch before importing candidate code", async () => {
  const { __deactivationOuterHarness: harness } = await loadOuterHarness();
  const candidateRoot = "/reviewed/release-2026-08-30";
  const value = deactivationEnvelope({
    expiresAt: new Date(Date.now() + 60_000).toISOString()
  });
  const bytes = Buffer.from(`${JSON.stringify(value)}\n`, "utf8");
  const decoded = harness.decodeExecutionEnvelopeBytes(bytes, candidateRoot);
  assert.deepEqual(decoded.value, value);
  assert.match(decoded.envelopeSha256, /^[a-f0-9]{64}$/u);
  assert.throws(
    () => harness.decodeExecutionEnvelopeBytes(Buffer.from(`${JSON.stringify({
      ...value,
      scope: "welcome-coins-activation-transaction"
    })}\n`, "utf8"), candidateRoot),
    (error) => error?.condition === "execution_envelope_invalid"
  );
});

test("shared durable consumption marker binds the deactivation type and scope", async () => {
  const { __deactivationTransactionHarness: harness } = await loadHarness();
  assert.equal(typeof harness.consumeEnvelope, "function");
  const envelope = deactivationEnvelope({
    expiresAt: new Date(Date.now() + 60_000).toISOString()
  });
  let persisted;
  const events = [];
  const runtime = {
    validateConsumptionRoot(root) {
      events.push("root:validate");
      return root;
    },
    writeMarkerExclusive({ bytes }) {
      events.push("marker:create");
      persisted = Buffer.from(bytes);
      return 9;
    },
    fsyncMarker() {
      events.push("marker:fsync");
    },
    fsyncConsumptionRoot() {
      events.push("root:fsync");
    },
    readMarker() {
      events.push("marker:readback");
      return Buffer.from(persisted);
    }
  };
  const result = harness.consumeEnvelope({
    envelope,
    envelopeSha256: "e".repeat(64),
    runtime
  });

  assert.deepEqual(result, {
    consumed: true,
    approvalDigestSha256: APPROVAL_DIGEST_SHA256
  });
  assert.deepEqual(events, [
    "root:validate",
    "marker:create",
    "marker:fsync",
    "root:fsync",
    "marker:readback"
  ]);
  const marker = JSON.parse(persisted.toString("utf8"));
  assert.deepEqual(marker, {
    schemaVersion: "1",
    type: "control_plane_welcome_coins_deactivation_consumption",
    scope: "welcome-coins-deactivation-transaction",
    approvalDigestSha256: APPROVAL_DIGEST_SHA256,
    executionEnvelopeSha256: "e".repeat(64),
    retry: false,
    consumed: true
  });
  assert.equal(persisted.includes(Buffer.from(ACTIVE_ENVIRONMENT_SHA256)), false);
  assert.equal(persisted.includes(Buffer.from(DISABLED_ENVIRONMENT_SHA256)), false);
  persisted.fill(0);
});

test("transaction guard accepts and pins the real systemd runtime identity shape", async () => {
  const { __deactivationTransactionHarness: harness } = await loadHarness();
  assert.equal(typeof harness.exactGuardedState, "function");
  assert.deepEqual(
    harness.exactGuardedState(guardedState("active"), { activeState: "active" }),
    guardedState("active")
  );
  assert.throws(
    () => harness.exactGuardedState(
      guardedState("inactive", "runtime-condition-v1:55:66:77:88"), {
      activeState: "inactive",
      expectedIdentity: GUARD_IDENTITY
      }
    ),
    (error) => error?.condition === "service_start_guard_changed"
  );
});

test("deactivation stdin requires noninteractive exact EOF before approval consumption", async () => {
  const { __deactivationTransactionHarness: harness } = await loadHarness();
  assert.equal(typeof harness.requireEmptyStdin, "function");
  const directory = mkdtempSync(join(tmpdir(), "welcome-coins-deactivation-stdin-"));
  const emptyPath = join(directory, "empty");
  const bytePath = join(directory, "byte");
  let emptyDescriptor;
  let byteDescriptor;
  try {
    writeFileSync(emptyPath, Buffer.alloc(0));
    writeFileSync(bytePath, Buffer.from("\n", "ascii"));
    emptyDescriptor = openSync(emptyPath, "r");
    byteDescriptor = openSync(bytePath, "r");
    assert.equal(harness.requireEmptyStdin({
      inputDescriptor: emptyDescriptor,
      stdin: { isTTY: false }
    }), true);
    assert.throws(
      () => harness.requireEmptyStdin({
        inputDescriptor: byteDescriptor,
        stdin: { isTTY: false }
      }),
      (error) => error?.condition === "stdin_invalid"
    );
    assert.throws(
      () => harness.requireEmptyStdin({ stdin: { isTTY: true } }),
      (error) => error?.condition === "stdin_invalid"
    );
  } finally {
    if (emptyDescriptor !== undefined) closeSync(emptyDescriptor);
    if (byteDescriptor !== undefined) closeSync(byteDescriptor);
    rmSync(directory, { recursive: true, force: true });
  }
});

function operationFixture({ alreadyDisabled = false } = {}) {
  const events = [];
  const mutations = [];
  const currentSha256 = alreadyDisabled
    ? DISABLED_ENVIRONMENT_SHA256
    : ACTIVE_ENVIRONMENT_SHA256;
  const observe = (event) => events.push(event);
  const mutate = (event) => {
    events.push(event);
    mutations.push(event);
  };
  return {
    events,
    mutations,
    operations: {
      readEffectiveUid() {
        observe("uid:root");
        return 0;
      },
      validateExecutionEnvelope() {
        observe("envelope:validate");
        return {
          valid: true,
          serviceUnit: SERVICE_UNIT,
          approvalDigestSha256: APPROVAL_DIGEST_SHA256
        };
      },
      runFreshPreflight() {
        observe("deactivation:preflight");
        return {
          state: alreadyDisabled ? "already_disabled" : "deactivation_ready",
          environmentSha256: currentSha256,
          disabledEnvironmentSha256: DISABLED_ENVIRONMENT_SHA256
        };
      },
      resolveServicePrincipal() {
        observe("principal:resolve");
        return { uid: 1001, gid: 1002 };
      },
      consumeExecutionEnvelope() {
        mutate("approval:consume");
        return { consumed: true };
      },
      establishStartGuard() {
        mutate("guard:establish");
        return guardedState("active");
      },
      readGuardedServiceState({ phase }) {
        observe(`guard:${phase}`);
        return guardedState(phase === "active" ? "active" : "inactive");
      },
      stopService() {
        mutate("service:stop");
        return { stopped: true };
      },
      revalidateMutationBoundary() {
        observe("boundary:revalidate");
        return {
          valid: true,
          environmentSha256: currentSha256,
          disabledEnvironmentSha256: DISABLED_ENVIRONMENT_SHA256
        };
      },
      deactivate() {
        mutate("deactivation:apply");
        return {
          state: alreadyDisabled ? "already_disabled" : "deactivated",
          environmentSha256: DISABLED_ENVIRONMENT_SHA256
        };
      },
      verifyDisabled() {
        observe("deactivation:verify-disabled");
        return {
          state: "disabled_verified",
          environmentSha256: DISABLED_ENVIRONMENT_SHA256
        };
      }
    }
  };
}

test("deactivation consumes approval first, stops under one pinned guard, and never enters database custody", async () => {
  const { __deactivationTransactionHarness: harness } = await loadHarness();
  assert.equal(typeof harness.transactionCore, "function");
  const fixture = operationFixture();
  const result = await harness.transactionCore({
    executionEnvelope: deactivationEnvelope(),
    operations: fixture.operations
  });

  assert.deepEqual(result, {
    schemaVersion: "1",
    type: "control_plane_welcome_coins_deactivation_transaction",
    state: "deactivation_verified_guarded",
    approvalConsumed: true,
    service: {
      unit: SERVICE_UNIT,
      activeState: "inactive",
      runtimeConditionStartGuard: true
    },
    deactivation: {
      state: "deactivated",
      environmentSha256: DISABLED_ENVIRONMENT_SHA256
    }
  });
  assert.deepEqual(fixture.mutations, [
    "approval:consume",
    "guard:establish",
    "service:stop",
    "deactivation:apply"
  ]);
  assert.deepEqual(fixture.events, [
    "uid:root",
    "envelope:validate",
    "deactivation:preflight",
    "principal:resolve",
    "approval:consume",
    "guard:establish",
    "guard:active",
    "service:stop",
    "guard:inactive",
    "boundary:revalidate",
    "deactivation:apply",
    "deactivation:verify-disabled",
    "guard:terminal"
  ]);
  for (const forbidden of [
    "inspectExternalHolders",
    "runSchemaCustody",
    "startService",
    "removeStartGuard",
    "runCanary",
    "restoreDatabase"
  ]) {
    assert.equal(Object.hasOwn(fixture.operations, forbidden), false, forbidden);
  }
});

test("a fresh approval for the exact already-disabled identity remains a guarded no-op", async () => {
  const { __deactivationTransactionHarness: harness } = await loadHarness();
  assert.equal(typeof harness.transactionCore, "function");
  const fixture = operationFixture({ alreadyDisabled: true });
  const result = await harness.transactionCore({
    executionEnvelope: deactivationEnvelope({
      expectedActiveEnvironmentSha256: DISABLED_ENVIRONMENT_SHA256
    }),
    operations: fixture.operations
  });

  assert.equal(result.state, "deactivation_verified_guarded");
  assert.deepEqual(result.deactivation, {
    state: "already_disabled",
    environmentSha256: DISABLED_ENVIRONMENT_SHA256
  });
  assert.equal(result.approvalConsumed, true);
  assert.equal(fixture.mutations[0], "approval:consume");
});

test("post-publication verification uncertainty is attention-only and records consumed approval", async () => {
  const { __deactivationTransactionHarness: harness } = await loadHarness();
  const fixture = operationFixture();
  fixture.operations.verifyDisabled = () => {
    fixture.events.push("deactivation:verify-disabled");
    throw new Error("private-post-publication-fault");
  };
  let caught;
  try {
    await harness.transactionCore({
      executionEnvelope: deactivationEnvelope(),
      operations: fixture.operations
    });
  } catch (error) {
    caught = error;
  }
  assert.equal(caught?.message, "attention_required");
  assert.deepEqual(harness.failureReceipt(caught, { approvalConsumed: true }), {
    schemaVersion: "1",
    type: "control_plane_welcome_coins_deactivation_transaction",
    state: "attention_required",
    condition: "attention_required",
    approvalConsumed: true
  });
  const serialized = JSON.stringify(harness.failureReceipt(caught, { approvalConsumed: true }));
  for (const privateValue of [
    ACTIVE_ENVIRONMENT_SHA256,
    DISABLED_ENVIRONMENT_SHA256,
    GUARD_IDENTITY,
    "private-post-publication-fault"
  ]) {
    assert.equal(serialized.includes(privateValue), false, privateValue);
  }
});

test("disabled identity drift is fail-closed on both mutation and verification boundaries", async () => {
  const { __deactivationTransactionHarness: harness } = await loadHarness();
  for (const [alreadyDisabled, phase, expectedCondition] of [
    [false, "deactivate", "attention_required"],
    [false, "verify", "attention_required"],
    [true, "deactivate", "env_identity_mismatch"]
  ]) {
    const fixture = operationFixture({ alreadyDisabled });
    if (phase === "deactivate") {
      fixture.operations.deactivate = () => ({
        state: alreadyDisabled ? "already_disabled" : "deactivated",
        environmentSha256: "f".repeat(64)
      });
    } else {
      fixture.operations.verifyDisabled = () => ({
        state: "disabled_verified",
        environmentSha256: "f".repeat(64)
      });
    }
    await assert.rejects(
      harness.transactionCore({
        executionEnvelope: deactivationEnvelope({
          ...(alreadyDisabled
            ? { expectedActiveEnvironmentSha256: DISABLED_ENVIRONMENT_SHA256 }
            : {})
        }),
        operations: fixture.operations
      }),
      (error) => error?.condition === expectedCondition
        || error?.message === expectedCondition
    );
  }
});

test("a completed transaction Receipt write failure is attention-only and aggregate-only", async () => {
  const { __deactivationTransactionHarness: harness } = await loadHarness();
  assert.equal(typeof harness.writeCompletedReceipt, "function");
  assert.throws(
    () => harness.writeCompletedReceipt({
      write() {
        throw new Error("private-output-failure");
      }
    }, {
      schemaVersion: "1",
      type: "control_plane_welcome_coins_deactivation_transaction",
      state: "deactivation_verified_guarded",
      privateEnvironmentSha256: DISABLED_ENVIRONMENT_SHA256,
      privateGuardIdentity: GUARD_IDENTITY
    }),
    (error) => error?.message === "attention_required"
  );
  const attentionReceipt = harness.failureReceipt(
    (() => {
      try {
        harness.writeCompletedReceipt({ write() { throw new Error("private-output-failure"); } }, {});
      } catch (error) {
        return error;
      }
    })(),
    { approvalConsumed: true }
  );
  assert.deepEqual(attentionReceipt, {
    schemaVersion: "1",
    type: "control_plane_welcome_coins_deactivation_transaction",
    state: "attention_required",
    condition: "attention_required",
    approvalConsumed: true
  });
  const serialized = JSON.stringify(attentionReceipt);
  for (const privateValue of [
    DISABLED_ENVIRONMENT_SHA256,
    GUARD_IDENTITY,
    "private-output-failure"
  ]) {
    assert.equal(serialized.includes(privateValue), false, privateValue);
  }
  const productionSource = readFileSync(LIBRARY_PATH, "utf8");
  assert.equal(
    productionSource.match(
      /writeWelcomeCoinsCompletedTransactionReceipt\(stdout, result\);/gu
    )?.length,
    2,
    "both closed mutation runners must classify completed-output failure as attention"
  );
});

test("private production composition revalidates artifacts after stop and keeps schema and custody unreachable", async () => {
  const { __deactivationTransactionHarness: harness } = await loadHarness();
  assert.equal(typeof harness.productionTransaction, "function");
  const envelope = deactivationEnvelope({
    expiresAt: new Date(Date.now() + 60_000).toISOString()
  });
  const events = [];
  let markerBytes;
  const productionRuntime = {
    readEffectiveUid() {
      events.push("uid:root");
      return 0;
    },
    validateArtifacts() {
      events.push("artifacts:validate");
      return true;
    },
    resolveServicePrincipal() {
      events.push("principal:resolve");
      return { uid: 1001, gid: 1002 };
    },
    preflightDeactivation() {
      events.push("deactivation:preflight");
      return {
        state: "deactivation_ready",
        environmentSha256: ACTIVE_ENVIRONMENT_SHA256,
        disabledEnvironmentSha256: DISABLED_ENVIRONMENT_SHA256
      };
    },
    deactivate(options) {
      events.push("deactivation:apply");
      options.guardReader();
      return {
        state: "deactivated",
        environment: { sha256: DISABLED_ENVIRONMENT_SHA256 }
      };
    },
    verifyDeactivation(options) {
      events.push("deactivation:verify-disabled");
      options.guardReader();
      return {
        state: "disabled_verified",
        environment: { sha256: DISABLED_ENVIRONMENT_SHA256 }
      };
    },
    readGuardedServiceState({ phase }) {
      events.push(`guard:${phase}`);
      return guardedState(phase === "active" ? "active" : "inactive");
    },
    consumptionRuntime: {
      validateConsumptionRoot(root) {
        events.push("marker:root");
        return root;
      },
      writeMarkerExclusive({ bytes }) {
        events.push("marker:create");
        markerBytes = Buffer.from(bytes);
        return 9;
      },
      fsyncMarker() {
        events.push("marker:fsync");
      },
      fsyncConsumptionRoot() {
        events.push("marker:root-fsync");
      },
      readMarker() {
        events.push("marker:readback");
        return Buffer.from(markerBytes);
      }
    },
    startGuardRuntime: {
      createBlockExclusive() {
        events.push("guard:block-excl");
      },
      fsyncBlock() {
        events.push("guard:block-fsync");
      },
      createDropInExclusive() {
        events.push("guard:dropin-excl");
      },
      fsyncDropIn() {
        events.push("guard:dropin-fsync");
      },
      fsyncGuardDirectories() {
        events.push("guard:dirs-fsync");
      },
      daemonReload() {
        events.push("guard:daemon-reload");
      },
      readGuardedServiceState() {
        events.push("guard:established-active");
        return guardedState("active");
      },
      stopService() {
        events.push("service:stop");
      },
      readStoppedGuardedServiceState() {
        events.push("guard:stopped-inactive");
        return guardedState("inactive");
      }
    }
  };

  const result = await harness.productionTransaction({
    executionEnvelope: envelope,
    envelopeSha256: "e".repeat(64),
    productionRuntime
  });
  assert.equal(result.state, "deactivation_verified_guarded");
  assert.equal(events.filter((event) => event === "artifacts:validate").length, 2);
  assert.equal(events.indexOf("marker:create") < events.indexOf("guard:block-excl"), true);
  assert.equal(events.indexOf("service:stop") < events.lastIndexOf("artifacts:validate"), true);
  assert.equal(events.lastIndexOf("artifacts:validate") < events.indexOf("deactivation:apply"), true);
  for (const forbidden of ["holder", "schema", "custody", "canary", "service:start", "guard:remove"] ) {
    assert.equal(events.some((event) => event.includes(forbidden)), false, forbidden);
  }
  markerBytes.fill(0);
});

test("post-stop artifact binding drift blocks before deactivation while retaining the consumed guard", async () => {
  const { __deactivationTransactionHarness: harness } = await loadHarness();
  const envelope = deactivationEnvelope({
    expiresAt: new Date(Date.now() + 60_000).toISOString()
  });
  const events = [];
  let validationCount = 0;
  let markerBytes;
  const productionRuntime = {
    readEffectiveUid: () => 0,
    validateArtifacts() {
      validationCount += 1;
      events.push(`artifacts:${validationCount}`);
      return productionArtifactBinding(validationCount === 1 ? "3" : "4");
    },
    resolveServicePrincipal: () => ({ uid: 1001, gid: 1002 }),
    preflightDeactivation: () => ({
      state: "deactivation_ready",
      environmentSha256: ACTIVE_ENVIRONMENT_SHA256,
      disabledEnvironmentSha256: DISABLED_ENVIRONMENT_SHA256
    }),
    deactivate() { events.push("deactivation:apply"); },
    verifyDeactivation() { events.push("deactivation:verify"); },
    readGuardedServiceState: ({ phase }) => guardedState(phase === "active" ? "active" : "inactive"),
    consumptionRuntime: {
      validateConsumptionRoot: (root) => root,
      writeMarkerExclusive({ bytes }) { markerBytes = Buffer.from(bytes); events.push("marker:create"); return 9; },
      fsyncMarker() {},
      fsyncConsumptionRoot() {},
      readMarker: () => Buffer.from(markerBytes)
    },
    startGuardRuntime: {
      createBlockExclusive() { events.push("guard:establish"); },
      fsyncBlock() {},
      createDropInExclusive() {},
      fsyncDropIn() {},
      fsyncGuardDirectories() {},
      daemonReload() {},
      readGuardedServiceState: () => guardedState("active"),
      stopService() { events.push("service:stop"); },
      readStoppedGuardedServiceState: () => guardedState("inactive")
    }
  };
  await assert.rejects(
    harness.productionTransaction({
      executionEnvelope: envelope,
      envelopeSha256: "e".repeat(64),
      productionRuntime
    }),
    (error) => error?.condition === "execution_envelope_invalid"
  );
  assert.deepEqual(events, [
    "artifacts:1",
    "marker:create",
    "guard:establish",
    "service:stop",
    "artifacts:2"
  ]);
  assert.equal(events.includes("deactivation:apply"), false);
  assert.equal(events.includes("deactivation:verify"), false);
  markerBytes.fill(0);
});

test("only the reviewed read-only gate and two closed mutation runners are exported", async () => {
  const production = await import(pathToFileURL(LIBRARY_PATH).href);
  assert.deepEqual(
    Object.keys(production).sort(),
    [
      "runWelcomeCoinsActivationGateCli",
      "runWelcomeCoinsActivationTransactionCli",
      "runWelcomeCoinsDeactivationTransactionCli"
    ]
  );
  for (const privateName of [
    "runWelcomeCoinsDeactivationTransactionCore",
    "runWelcomeCoinsDeactivationProductionTransaction",
    "deactivateWelcomeCoins",
    "verifyWelcomeCoinsDeactivation"
  ]) {
    assert.equal(Object.hasOwn(production, privateName), false, privateName);
  }
  let injected = false;
  let stderr = "";
  const status = await production.runWelcomeCoinsDeactivationTransactionCli({
    argv: ["--mode", "deactivate"],
    stdout: { write() { injected = true; } },
    stderr: { write(value) { stderr += value; } },
    operations: { deactivate() { injected = true; } },
    productionRuntime: { deactivate() { injected = true; } }
  });
  assert.equal(status, 1);
  assert.equal(injected, false);
  assert.deepEqual(JSON.parse(stderr), {
    schemaVersion: "1",
    type: "control_plane_welcome_coins_deactivation_transaction",
    state: "blocked",
    condition: "invalid_input"
  });

  const cli = readFileSync(TRANSACTION_CLI_PATH, "utf8");
  assert.match(cli, /control_plane_welcome_coins_deactivation_execution_envelope/u);
  assert.match(cli, /welcome-coins-deactivation-transaction/u);
  assert.match(cli, /runWelcomeCoinsDeactivationTransactionCli/u);
  assert.doesNotMatch(cli, /process\.env\.[A-Z0-9_]*OPERATION|--(?:operation|mode)/u);

  const nativeSource = readFileSync(OUTER_WRAPPER_SOURCE_PATH, "utf8");
  assert.match(nativeSource, /welcome-coins-activation-transaction-cli\.mjs/u);
  assert.doesNotMatch(nativeSource, /welcome-coins-deactivation-(?:outer-wrapper|transaction-cli)\.mjs/u);

  const packageJson = JSON.parse(readFileSync(PACKAGE_JSON_PATH, "utf8"));
  assert.deepEqual(
    Object.keys(packageJson.scripts).filter((name) => (
      /^welcome-coins:deactivation:/u.test(name)
      || /^welcome-coins:activation:(?:transaction|apply|deactivate)$/u.test(name)
    )),
    []
  );
});
