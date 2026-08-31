import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
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
const PACKAGE_JSON_PATH = resolve(REPOSITORY_ROOT, "package.json");
const OUTER_WRAPPER_SOURCE_PATH = resolve(
  REPOSITORY_ROOT,
  "scripts/native/welcome-coins-activation-outer-wrapper.c"
);
const SERVICE_UNIT = "proxy-gateway-candidate.service";
const CANARY_DIGEST = "a".repeat(64);
const ENVIRONMENT_SHA256 = "b".repeat(64);
const APPROVAL_DIGEST_SHA256 = "c".repeat(64);
const SHA256 = Object.freeze({
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

function replaceExactModuleSpecifier(source, specifier, replacement) {
  const needle = JSON.stringify(specifier);
  assert.equal(source.split(needle).length - 1, 1, specifier);
  return source.replace(needle, JSON.stringify(replacement));
}

function sourceDataUrl(source) {
  return `data:text/javascript;base64,${Buffer.from(source, "utf8").toString("base64")}`;
}

let wrapperHarnessPromise;
let outerEnvelopeHarnessPromise;

function loadPrivateOuterEnvelopeHarness() {
  if (outerEnvelopeHarnessPromise) return outerEnvelopeHarnessPromise;
  let source = readFileSync(TRANSACTION_CLI_PATH, "utf8");
  const mainInvocation = "process.exitCode = await main();";
  assert.equal(source.split(mainInvocation).length - 1, 1);
  source = source.replace(mainInvocation, "");
  source += `
export const __outerEnvelopeHarness = Object.freeze({
  decodeExecutionEnvelopeBytes,
  validateFd3PositionInfo
});
`;
  outerEnvelopeHarnessPromise = import(sourceDataUrl(source));
  return outerEnvelopeHarnessPromise;
}

function loadPrivateWrapperHarness() {
  if (wrapperHarnessPromise) return wrapperHarnessPromise;
  let source = readFileSync(LIBRARY_PATH, "utf8");
  source = replaceExactModuleSpecifier(source, "dotenv", import.meta.resolve("dotenv"));
  source = replaceExactModuleSpecifier(
    source,
    "./control-plane-db-snapshot-gate-lib.mjs",
    pathToFileURL(resolve(REPOSITORY_ROOT, "scripts/control-plane-db-snapshot-gate-lib.mjs")).href
  );
  if (source.includes('"./control-plane-welcome-coins-holder-observer-lib.mjs"')) {
    source = replaceExactModuleSpecifier(
      source,
      "./control-plane-welcome-coins-holder-observer-lib.mjs",
      pathToFileURL(resolve(
        REPOSITORY_ROOT,
        "scripts/control-plane-welcome-coins-holder-observer-lib.mjs"
      )).href
    );
  }
  source += `
const __productionWrapperHarness = Object.freeze({
  exactExecutionEnvelope:
    typeof exactWelcomeCoinsActivationExecutionEnvelope === "function"
      ? exactWelcomeCoinsActivationExecutionEnvelope
      : undefined,
  consumeExecutionEnvelope:
    typeof consumeWelcomeCoinsActivationExecutionEnvelope === "function"
      ? consumeWelcomeCoinsActivationExecutionEnvelope
      : undefined,
  establishStartGuard:
    typeof establishWelcomeCoinsActivationStartGuard === "function"
      ? establishWelcomeCoinsActivationStartGuard
      : undefined,
  stopService:
    typeof stopWelcomeCoinsActivationService === "function"
      ? stopWelcomeCoinsActivationService
      : undefined,
  productionTransaction:
    typeof runWelcomeCoinsActivationProductionTransaction === "function"
      ? runWelcomeCoinsActivationProductionTransaction
      : undefined,
  schemaCustodyResult:
    typeof exactProductionSchemaCustodyResult === "function"
      ? exactProductionSchemaCustodyResult
      : undefined,
  failureReceipt:
    typeof welcomeCoinsActivationTransactionFailureReceipt === "function"
      ? welcomeCoinsActivationTransactionFailureReceipt
      : undefined
});
export { __productionWrapperHarness };
`;
  wrapperHarnessPromise = import(sourceDataUrl(source));
  return wrapperHarnessPromise;
}

async function loadHolderCompositionHarness() {
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
    sourceDataUrl(`
export function inspectWelcomeCoinsExternalHolders(options) {
  globalThis.__welcomeCoinsObservedHolderOptions = options;
  return Object.freeze({ externalHolderCount: 0, databaseBoundary: Object.freeze({
    logicalSha256: "8".repeat(64),
    objectIdentitySha256: "9".repeat(64),
    parentIdentitySha256: "a".repeat(64)
  }) });
}
`)
  );
  source += `
export const __holderCompositionHarness = Object.freeze({
  inspectExternalHolders: WELCOME_COINS_PRODUCTION_RUNTIME.inspectExternalHolders
});
`;
  return import(sourceDataUrl(source));
}

function canaryCommitment() {
  return createHash("sha256").update(CANARY_DIGEST, "ascii").digest("hex");
}

function executionEnvelope(overrides = {}) {
  return {
    schemaVersion: "1",
    type: "control_plane_welcome_coins_activation_execution_envelope",
    scope: "welcome-coins-activation-transaction",
    approvalDigestSha256: APPROVAL_DIGEST_SHA256,
    expiresAt: "2026-09-30T18:00:00.000Z",
    retry: false,
    serviceUnit: SERVICE_UNIT,
    expectedRelease: "release-2026-08-30",
    expectedEnvironmentSha256: ENVIRONMENT_SHA256,
    canaryDigestCommitmentSha256: canaryCommitment(),
    servicePrincipal: {
      uid: 1001,
      gid: 1002
    },
    artifacts: { ...SHA256 },
    custody: {
      dbPath: "/private/state/subscription-control.sqlite",
      snapshotDirectory: "/private/snapshots/welcome-coins",
      tempRoot: "/private/tmp/welcome-coins"
    },
    ...overrides
  };
}

test("package scripts expose no welcome-coins mutation entry and the candidate wrapper is the direct execution boundary", () => {
  const packageJson = JSON.parse(readFileSync(PACKAGE_JSON_PATH, "utf8"));
  const mutationEntries = Object.entries(packageJson.scripts).filter(([name, command]) => (
    /^welcome-coins:activation:(?:transaction|apply|deactivate)$/u.test(name)
      || /control-plane-welcome-coins-activation-transaction(?:-cli)?\.mjs|welcome-coins-activation-outer-wrapper/u.test(command)
  ));

  assert.deepEqual(mutationEntries, []);

  const source = readFileSync(OUTER_WRAPPER_SOURCE_PATH, "utf8");
  assert.match(
    source,
    /#define\s+WELCOME_COINS_OUTER_WRAPPER_SUFFIX\s+\\\s*\n\s*"\/node_modules\/\.gccgw-native\/welcome-coins-activation-outer-wrapper"/u
  );
  assert.match(source, /readlink\("\/proc\/self\/exe"/u);
  assert.match(source, /executable\[0\]\s*!=\s*'\/'/u);
  assert.match(source, /strcmp\(wrapper, executable\)\s*!=\s*0/u);
  assert.match(source, /SYS_execveat/u);
});

test("production wrapper private implementation surfaces exist without becoming production exports", async () => {
  const production = await import(pathToFileURL(LIBRARY_PATH).href);
  const { __productionWrapperHarness: harness } = await loadPrivateWrapperHarness();

  for (const [name, value] of Object.entries(harness)) {
    assert.equal(typeof value, "function", name);
    assert.equal(Object.hasOwn(production, value.name), false, value.name);
  }
  assert.deepEqual(
    Object.keys(production).filter((name) => name.includes("ActivationTransaction")),
    ["runWelcomeCoinsActivationTransactionCli"]
  );
});

test("outer execution envelope is exact, fresh, single-use, fixed-scope, and bound to the stdin canary", async () => {
  const { __productionWrapperHarness: harness } = await loadPrivateWrapperHarness();
  const nowMs = Date.parse("2026-08-30T18:00:00.000Z");
  const valid = executionEnvelope();

  assert.deepEqual(
    harness.exactExecutionEnvelope(valid, { canaryDigest: CANARY_DIGEST, nowMs }),
    valid
  );
  const { holderObserverSha256: _omittedHolder, ...missingArtifact } = SHA256;

  const invalid = [
    { ...valid, unexpected: true },
    executionEnvelope({ retry: true }),
    executionEnvelope({ expiresAt: "2026-08-30T17:59:59.999Z" }),
    executionEnvelope({ serviceUnit: "other.service" }),
    executionEnvelope({ expectedRelease: "../escape" }),
    executionEnvelope({ canaryDigestCommitmentSha256: "d".repeat(64) }),
    executionEnvelope({ servicePrincipal: { uid: 0, gid: 1002 } }),
    executionEnvelope({ servicePrincipal: { uid: 1001, gid: 0 } }),
    executionEnvelope({ artifacts: { ...SHA256, nodeSha256: "invalid" } }),
    executionEnvelope({ artifacts: missingArtifact }),
    executionEnvelope({ artifacts: Object.fromEntries(Object.entries(SHA256).reverse()) }),
    executionEnvelope({ custody: { ...valid.custody, dbPath: "relative.sqlite" } }),
    executionEnvelope({ custody: { ...valid.custody, unexpected: true } }),
    Object.fromEntries(Object.entries(valid).reverse())
  ];

  for (const candidate of invalid) {
    assert.throws(
      () => harness.exactExecutionEnvelope(candidate, {
        canaryDigest: CANARY_DIGEST,
        nowMs
      }),
      (error) => error?.condition === "execution_envelope_invalid",
      JSON.stringify(candidate)
    );
  }
});

test("zero-argv public CLI accepts only canonical FD3 plus stdin digest and blocks before consumption when native runtime is absent", () => {
  const directory = mkdtempSync(join(tmpdir(), "welcome-coins-production-envelope-"));
  const path = join(directory, "envelope.json");
  let descriptor;
  try {
    writeFileSync(path, `${JSON.stringify(executionEnvelope())}\n`, { mode: 0o400 });
    descriptor = openSync(path, "r");
    const result = spawnSync(process.execPath, [TRANSACTION_CLI_PATH], {
      cwd: REPOSITORY_ROOT,
      encoding: "utf8",
      input: `${CANARY_DIGEST}\n`,
      stdio: ["pipe", "pipe", "pipe", descriptor]
    });

    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.deepEqual(JSON.parse(result.stderr), {
      schemaVersion: "1",
      type: "control_plane_welcome_coins_production_transaction",
      state: "blocked",
      condition: process.platform === "linux" && process.geteuid?.() === 0
        ? "execution_envelope_invalid"
        : "invoker_not_root"
    });
    for (const privateValue of [
      executionEnvelope().custody.dbPath,
      executionEnvelope().custody.snapshotDirectory,
      CANARY_DIGEST
    ]) {
      assert.equal(result.stderr.includes(privateValue), false);
    }
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    rmSync(directory, { recursive: true, force: true });
  }
});

test("non-canonical FD3 bytes fail before stdin or any durable consumption", async () => {
  const { __outerEnvelopeHarness: harness } = await loadPrivateOuterEnvelopeHarness();
  assert.throws(
    () => harness.decodeExecutionEnvelopeBytes(
      Buffer.from(`${JSON.stringify(executionEnvelope(), null, 2)}\n`, "utf8"),
      "/reviewed/release-2026-08-30"
    ),
    (error) => error?.condition === "execution_envelope_invalid"
  );
});

test("FD3 canonical binding covers the whole file from offset zero", async () => {
  const { __outerEnvelopeHarness: harness } = await loadPrivateOuterEnvelopeHarness();
  assert.doesNotThrow(() => harness.validateFd3PositionInfo("pos:\t0\nflags:\t0100000\n"));
  assert.throws(
    () => harness.validateFd3PositionInfo("pos:\t17\nflags:\t0100000\n"),
    (error) => error?.condition === "execution_envelope_invalid"
  );
});

test("FD3 rejects non-UTF-8 bytes instead of hashing a replacement-decoded envelope", async () => {
  const { __outerEnvelopeHarness: harness } = await loadPrivateOuterEnvelopeHarness();
  const bytes = Buffer.from(`${JSON.stringify(executionEnvelope())}\n`, "utf8");
  const target = Buffer.from("welcome-coins", "ascii");
  const offset = bytes.lastIndexOf(target);
  assert.notEqual(offset, -1);
  bytes[offset] = 0xff;
  assert.throws(
    () => harness.decodeExecutionEnvelopeBytes(bytes, "/reviewed/release-2026-08-30"),
    (error) => error?.condition === "execution_envelope_invalid"
  );
});

test("durable consumption is the first mutation, uses an exact readback, and never overwrites a consumed marker", async () => {
  const { __productionWrapperHarness: harness } = await loadPrivateWrapperHarness();
  const events = [];
  let marker = null;
  const runtime = Object.freeze({
    validateConsumptionRoot() {
      events.push("marker:root");
      return "/fixed/root";
    },
    writeMarkerExclusive({ bytes }) {
      events.push("marker:open-excl");
      if (marker !== null) {
        const error = new Error("exists");
        error.code = "EEXIST";
        throw error;
      }
      marker = Buffer.from(bytes);
    },
    fsyncMarker() {
      events.push("marker:fsync-file");
    },
    fsyncConsumptionRoot() {
      events.push("marker:fsync-dir");
    },
    readMarker() {
      events.push("marker:readback");
      return Buffer.from(marker);
    }
  });
  const envelope = executionEnvelope();
  const envelopeSha256 = "e".repeat(64);

  assert.deepEqual(
    harness.consumeExecutionEnvelope({ envelope, envelopeSha256, runtime }),
    { consumed: true, approvalDigestSha256: APPROVAL_DIGEST_SHA256 }
  );
  assert.deepEqual(events, [
    "marker:root",
    "marker:open-excl",
    "marker:fsync-file",
    "marker:fsync-dir",
    "marker:readback"
  ]);
  const serialized = marker.toString("utf8");
  assert.equal(serialized.includes(envelope.custody.dbPath), false);
  assert.equal(serialized.includes(CANARY_DIGEST), false);

  assert.throws(
    () => harness.consumeExecutionEnvelope({ envelope, envelopeSha256, runtime }),
    (error) => error?.condition === "execution_envelope_consumed"
  );
  assert.equal(events.filter((event) => event === "marker:open-excl").length, 2);
});

test("an envelope that expires during read-only preflight cannot reach the marker mutation", async () => {
  const { __productionWrapperHarness: harness } = await loadPrivateWrapperHarness();
  const events = [];
  let marker;
  const runtime = Object.freeze({
    validateConsumptionRoot() {
      events.push("marker:root");
      return "/fixed/root";
    },
    writeMarkerExclusive({ bytes }) {
      events.push("marker:open-excl");
      marker = Buffer.from(bytes);
    },
    fsyncMarker() {
      events.push("marker:fsync-file");
    },
    fsyncConsumptionRoot() {
      events.push("marker:fsync-dir");
    },
    readMarker() {
      events.push("marker:readback");
      return Buffer.from(marker);
    }
  });

  assert.throws(
    () => harness.consumeExecutionEnvelope({
      envelope: executionEnvelope({ expiresAt: "2020-01-01T00:00:00.000Z" }),
      envelopeSha256: "e".repeat(64),
      runtime
    }),
    (error) => error?.condition === "execution_envelope_invalid"
  );
  assert.deepEqual(events, []);
});

test("a partial marker attempt produces only aggregate unknown-or-consumed evidence", async () => {
  const { __productionWrapperHarness: harness } = await loadPrivateWrapperHarness();
  const executionState = {
    approvalConsumed: false,
    approvalConsumptionState: "not_started"
  };
  let failure;
  try {
    harness.consumeExecutionEnvelope({
      envelope: executionEnvelope(),
      envelopeSha256: "e".repeat(64),
      runtime: {
        validateConsumptionRoot: () => "/fixed/root",
        writeMarkerExclusive: () => undefined,
        fsyncMarker: () => { throw new Error("private fsync path"); },
        fsyncConsumptionRoot: () => assert.fail("must stop after fsync failure"),
        readMarker: () => assert.fail("must stop after fsync failure")
      },
      onMarkerAttempted() {
        executionState.approvalConsumptionState = "unknown_or_consumed";
      }
    });
    assert.fail("partial marker attempt must fail");
  } catch (error) {
    failure = error;
  }

  const receipt = harness.failureReceipt(failure, executionState);
  assert.deepEqual(receipt, {
    schemaVersion: "1",
    type: "control_plane_welcome_coins_activation_transaction",
    state: "blocked",
    condition: "execution_envelope_consumption_failed",
    approvalConsumptionState: "unknown_or_consumed"
  });
  assert.equal(JSON.stringify(receipt).includes("private fsync path"), false);
});

test("schema custody attention and guard drift remain attention before activation", async () => {
  const { __productionWrapperHarness: harness } = await loadPrivateWrapperHarness();
  const expectedGuardIdentitySha256 = createHash("sha256")
    .update("fixed-guard-identity", "utf8")
    .digest("hex");
  const schemaReady = {
    schemaVersion: "1",
    type: "control_plane_welcome_coins_schema_custody_gate",
    state: "schema_ready",
    databaseCustody: "exclusive",
    guardIdentitySha256: expectedGuardIdentitySha256,
    snapshot: {
      id: "1".repeat(64),
      sizeBytes: 8192,
      quickCheck: true,
      foreignKeys: true,
      schemaVersion: 7
    },
    schema: {
      state: "ready",
      sourceChanged: false,
      checks: {
        foundationDependency: true,
        schemaExact: true,
        quickCheck: true,
        foreignKeys: true
      },
      reasonCodes: [],
      appliedMigrationIds: [],
      pendingMigrationIds: []
    }
  };

  assert.deepEqual(
    harness.schemaCustodyResult(schemaReady, expectedGuardIdentitySha256),
    { state: "schema_ready", schemaState: "ready", schemaExact: true, snapshotCreated: true }
  );
  assert.throws(
    () => harness.schemaCustodyResult(
      { ...schemaReady, guardIdentitySha256: "f".repeat(64) },
      expectedGuardIdentitySha256
    ),
    (error) => error?.message === "attention_required"
  );
  assert.throws(
    () => harness.schemaCustodyResult(
      { ...schemaReady, rawDatabasePath: "/private/database.sqlite" },
      expectedGuardIdentitySha256
    ),
    (error) => error?.condition === "database_custody_failed"
  );
  assert.throws(
    () => harness.schemaCustodyResult({
      schemaVersion: "1",
      type: "control_plane_welcome_coins_schema_custody_child",
      state: "attention_required",
      condition: "snapshot_unavailable",
      mutationPossible: true
    }, expectedGuardIdentitySha256),
    (error) => error?.message === "attention_required"
  );
});

test("production holder adapter imports the reviewed observer and forwards only its exact phase contract", async () => {
  const { __holderCompositionHarness: harness } = await loadHolderCompositionHarness();
  const expectedDatabaseBoundary = {
    logicalSha256: "b".repeat(64),
    objectIdentitySha256: "c".repeat(64),
    parentIdentitySha256: "d".repeat(64)
  };
  const expectedCustodyChildProcessIdentitySha256 = "e".repeat(64);
  const expectedCustodyChildChannelBindingSha256 = "f".repeat(64);
  try {
    harness.inspectExternalHolders({
      phase: "exclusive_pre_commit",
      serviceUnit: SERVICE_UNIT,
      dbPath: "/must-be-replaced-by-envelope.sqlite",
      expectedDatabaseBoundary,
      expectedCustodyChildProcessIdentitySha256,
      expectedCustodyChildChannelBindingSha256
    });
    assert.deepEqual(globalThis.__welcomeCoinsObservedHolderOptions, {
      dbPath: "/must-be-replaced-by-envelope.sqlite",
      phase: "exclusive_pre_commit",
      expectedDatabaseBoundary,
      expectedCustodyChildProcessIdentitySha256,
      expectedCustodyChildChannelBindingSha256
    });
  } finally {
    delete globalThis.__welcomeCoinsObservedHolderOptions;
  }
});

test("start guard is established while active and stop requires inactive MainPID zero with stable identity", async () => {
  const { __productionWrapperHarness: harness } = await loadPrivateWrapperHarness();
  const events = [];
  const guardIdentity = "runtime-condition-v1:11:22:33:44";
  const guardedState = (activeState, mainPid) => ({
    unit: SERVICE_UNIT,
    activeState,
    loadState: "loaded",
    needDaemonReload: "no",
    mainPid,
    runtimeConditionStartGuard: true,
    runtimeConditionStartGuardIdentity: guardIdentity
  });
  const runtime = Object.freeze({
    createBlockExclusive() {
      events.push("guard:block-excl");
    },
    fsyncBlock() {
      events.push("guard:fsync-block");
    },
    createDropInExclusive() {
      events.push("guard:dropin-excl");
    },
    fsyncDropIn() {
      events.push("guard:fsync-dropin");
    },
    fsyncGuardDirectories() {
      events.push("guard:fsync-dirs");
    },
    daemonReload() {
      events.push("guard:daemon-reload");
    },
    readGuardedServiceState() {
      events.push("guard:active-readback");
      return guardedState("active", 4242);
    },
    stopService() {
      events.push("service:stop");
    },
    readStoppedGuardedServiceState() {
      events.push("guard:inactive-readback");
      return guardedState("inactive", 0);
    }
  });

  const established = harness.establishStartGuard({ runtime });
  const stopped = harness.stopService({ runtime, expectedGuardIdentity: established.runtimeConditionStartGuardIdentity });

  assert.equal(stopped.stopped, true);
  assert.deepEqual(events, [
    "guard:block-excl",
    "guard:fsync-block",
    "guard:dropin-excl",
    "guard:fsync-dropin",
    "guard:fsync-dirs",
    "guard:daemon-reload",
    "guard:active-readback",
    "service:stop",
    "guard:inactive-readback"
  ]);

  assert.throws(
    () => harness.stopService({
      runtime: {
        ...runtime,
        readStoppedGuardedServiceState: () => guardedState("inactive", 99)
      },
      expectedGuardIdentity: guardIdentity
    }),
    (error) => error?.condition === "service_state_mismatch"
  );
});

test("production implementation composes the existing transaction core and returns only aggregate receipt fields", () => {
  const source = readFileSync(LIBRARY_PATH, "utf8");
  assert.match(source, /runWelcomeCoinsActivationProductionTransaction/u);
  assert.match(source, /runWelcomeCoinsActivationTransactionCore\s*\(/u);
  assert.match(source, /consumeWelcomeCoinsActivationExecutionEnvelope/u);
  assert.match(source, /establishWelcomeCoinsActivationStartGuard/u);
  assert.match(source, /stopWelcomeCoinsActivationService/u);
  assert.match(source, /activation_verified_guarded/u);
  assert.doesNotMatch(source, /(?:startWelcomeCoinsService|runWelcomeCoinsCanary|restoreWelcomeCoinsDatabase)\s*\(/u);
});
