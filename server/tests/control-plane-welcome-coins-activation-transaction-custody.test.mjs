import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const SNAPSHOT_GATE_SOURCE = new URL(
  "../../scripts/control-plane-db-snapshot-gate-lib.mjs",
  import.meta.url
);
const LEGACY_SCHEMA_CUSTODY_SOURCE = new URL(
  "../../scripts/control-plane-welcome-coins-schema-custody-gate-lib.mjs",
  import.meta.url
);
const CHILD_CLI_PATH = fileURLToPath(new URL(
  "../../scripts/control-plane-welcome-coins-activation-transaction-custody-cli.mjs",
  import.meta.url
));

const CHILD_RUNNER = "runWelcomeCoinsSchemaCustodyChildCli";
const CHILD_CORE = "runWelcomeCoinsSchemaCustodyChildCore";
const CHILD_CHANNEL_FACTORY = "createWelcomeCoinsSchemaCustodyChildChannel";
const CHILD_FAILURE_RECEIPT = "welcomeCoinsSchemaCustodyChildFailureReceipt";
const AUTHORIZATION_CHALLENGE = "a1".repeat(32);
const AUTHORIZATION_CHALLENGE_SHA256 = createHash("sha256")
  .update(Buffer.from(AUTHORIZATION_CHALLENGE, "hex"))
  .digest("hex");
const ACQUISITION_PROOF_SHA256 = "7".repeat(64);
const ACQUIRED_CHANNEL_IDENTITY_SHA256 = "e".repeat(64);
const AUTHORIZATION_CHANNEL_IDENTITY_SHA256 = "f".repeat(64);
const PARENT_PROCESS_IDENTITY = Object.freeze({
  pid: 4000,
  startTimeTicks: "987650000",
  uid: 0,
  gid: 0
});
const CHILD_PROCESS_IDENTITY = Object.freeze({
  pid: 4242,
  startTimeTicks: "987654321",
  uid: 1001,
  euid: 1001,
  suid: 1001,
  fsuid: 1001,
  gid: 1002,
  egid: 1002,
  sgid: 1002,
  fsgid: 1002,
  supplementaryGids: Object.freeze([1002]),
  capInh: "0000000000000000",
  capEff: "0000000000000000",
  capPrm: "0000000000000000",
  capBnd: "0000000000000000",
  capAmb: "0000000000000000",
  noNewPrivs: 1,
  tracerPid: 0,
  procSelfOwnerUid: 0,
  procSelfOwnerGid: 0,
  parentIdentity: PARENT_PROCESS_IDENTITY
});

function sha256Canonical(value) {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

function childProcessIdentity(overrides = {}) {
  return Object.freeze({
    ...CHILD_PROCESS_IDENTITY,
    ...overrides,
    supplementaryGids: Object.freeze([
      ...(overrides.supplementaryGids ?? CHILD_PROCESS_IDENTITY.supplementaryGids)
    ])
  });
}

function publicChildIdentity(identity = CHILD_PROCESS_IDENTITY) {
  return Object.freeze({
    pid: identity.pid,
    startTimeTicks: identity.startTimeTicks,
    uid: identity.uid,
    gid: identity.gid
  });
}

function channelBinding(overrides = {}) {
  return Object.freeze({
    parentIdentity: PARENT_PROCESS_IDENTITY,
    childIdentity: publicChildIdentity(),
    acquiredChannelIdentitySha256: ACQUIRED_CHANNEL_IDENTITY_SHA256,
    authorizationChannelIdentitySha256: AUTHORIZATION_CHANNEL_IDENTITY_SHA256,
    ...overrides
  });
}

function expectedAcquiredFrame({
  processSecurityContext = CHILD_PROCESS_IDENTITY,
  binding = channelBinding()
} = {}) {
  return Object.freeze({
    type: "welcome_coins_schema_custody_acquired",
    acquisitionProofSha256: ACQUISITION_PROOF_SHA256,
    childIdentity: publicChildIdentity(processSecurityContext),
    channelBinding: binding
  });
}

function parentAuthorization({
  acquiredFrame = expectedAcquiredFrame(),
  authorizationChallenge = AUTHORIZATION_CHALLENGE,
  overrides = {}
} = {}) {
  return Object.freeze({
    type: "authorize_schema_apply",
    authorizationChallenge,
    acquiredFrameSha256: sha256Canonical(acquiredFrame),
    ...overrides
  });
}

function schemaReadyResult(overrides = {}) {
  return Object.freeze({
    schemaVersion: "1",
    type: "control_plane_welcome_coins_schema_custody_gate",
    state: "schema_ready",
    databaseCustody: "exclusive",
    guardIdentitySha256: "5".repeat(64),
    snapshot: Object.freeze({
      id: "6".repeat(64),
      sizeBytes: 4096,
      quickCheck: true,
      foreignKeys: true,
      schemaVersion: 1
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
    }),
    ...overrides
  });
}

function expectedHeldFrame({
  result = schemaReadyResult(),
  binding = channelBinding()
} = {}) {
  return Object.freeze({
    type: "schema_ready_custody_held",
    schemaResult: result,
    childIdentity: publicChildIdentity(),
    channelBinding: binding
  });
}

function parentRelease({ heldFrame = expectedHeldFrame(), type = "release_after_activation_verified" } = {}) {
  return Object.freeze({
    type,
    heldFrameSha256: sha256Canonical(heldFrame)
  });
}

function sourceDataUrl(source) {
  return `data:text/javascript;base64,${Buffer.from(source, "utf8").toString("base64")}`;
}

function replaceOptionalModuleSpecifier(source, specifier, replacement) {
  const needle = JSON.stringify(specifier);
  const count = source.split(needle).length - 1;
  assert.ok(count === 0 || count === 1, `${specifier} occurs at most once`);
  return count === 1 ? source.replace(needle, JSON.stringify(replacement)) : source;
}

function declaredFunctionSource(source, name) {
  const declaration = new RegExp(
    `^(?:export\\s+)?(?:async\\s+)?function\\s+${name}\\s*\\(`,
    "mu"
  );
  const match = declaration.exec(source);
  assert.ok(match, `${name} declaration exists`);
  const openingBrace = source.indexOf("{", match.index + match[0].length);
  assert.notEqual(openingBrace, -1, `${name} body starts`);

  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = openingBrace; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (character === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (character === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote !== null) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (character === "/" && next === "/") {
      lineComment = true;
      index += 1;
      continue;
    }
    if (character === "/" && next === "*") {
      blockComment = true;
      index += 1;
      continue;
    }
    if (character === "\"" || character === "'" || character === "`") {
      quote = character;
      continue;
    }
    if (character === "{") depth += 1;
    if (character === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(match.index, index + 1);
    }
  }
  assert.fail(`${name} body closes`);
}

function fixedDescriptorConstant(source, purpose, descriptor) {
  const declaration = new RegExp(
    `^const\\s+([A-Z][A-Z0-9_]*${purpose}[A-Z0-9_]*_FD)\\s*=\\s*${descriptor}\\s*;`,
    "mu"
  );
  const match = declaration.exec(source);
  assert.ok(match, `${purpose} uses fixed fd ${descriptor}`);
  return match[1];
}

async function loadPrivateChildHarness() {
  let source = readFileSync(SNAPSHOT_GATE_SOURCE, "utf8");
  assert.equal(
    new RegExp(`^async function ${CHILD_CORE}\\(`, "mu").test(source),
    true,
    `${CHILD_CORE} remains module-private`
  );
  source = replaceOptionalModuleSpecifier(
    source,
    "better-sqlite3",
    import.meta.resolve("better-sqlite3")
  );
  source = replaceOptionalModuleSpecifier(
    source,
    "../server/services/platform/portal-registration-welcome-bonus-migrations.mjs",
    new URL(
      "../services/platform/portal-registration-welcome-bonus-migrations.mjs",
      import.meta.url
    ).href
  );
  source += `\nexport { ${CHILD_CORE} as __childCoreForHarness, ${CHILD_FAILURE_RECEIPT} as __childFailureReceiptForHarness };\n`;
  return import(sourceDataUrl(source));
}

function executionEnvelope(overrides = {}) {
  return Object.freeze({
    type: "control_plane_welcome_coins_schema_custody_child",
    schemaVersion: "1",
    serviceUid: 1001,
    serviceGid: 1002,
    initialExternalHolderCount: 0,
    authorizationChallengeSha256: AUTHORIZATION_CHALLENGE_SHA256,
    parentIdentity: PARENT_PROCESS_IDENTITY,
    childIdentity: publicChildIdentity(),
    acquiredChannelIdentitySha256: ACQUIRED_CHANNEL_IDENTITY_SHA256,
    authorizationChannelIdentitySha256: AUTHORIZATION_CHANNEL_IDENTITY_SHA256,
    custody: Object.freeze({
      serviceUnit: "proxy-gateway-candidate.service",
      expectedServiceState: "inactive",
      dbPath: "/srv/proxy-gateway/state/subscription-control.sqlite",
      snapshotDirectory: "/srv/proxy-gateway/snapshots",
      tempRoot: "/srv/proxy-gateway/schema-dry-run",
      createdAt: "2026-08-30T12:00:00.000Z",
      expectedRuntimeConditionStartGuardIdentity: "runtime-condition-v1:11:12:21:22",
      expectedDatabaseBoundary: Object.freeze({
        logicalSha256: "b".repeat(64),
        objectIdentitySha256: "c".repeat(64),
        parentIdentitySha256: "d".repeat(64)
      })
    }),
    ...overrides
  });
}

function capabilityChannel({
  envelope = executionEnvelope(),
  binding = channelBinding(),
  authorization,
  release
} = {}) {
  const events = [];
  const acquiredFrames = [];
  const heldFrames = [];
  return {
    events,
    acquiredFrames,
    heldFrames,
    channel: Object.freeze({
      async readExecutionEnvelope() {
        events.push("read_execution_envelope");
        return envelope;
      },
      async readBoundChannelIdentity() {
        events.push("read_bound_channel_identity");
        return binding;
      },
      async writeCustodyAcquired(frame) {
        events.push("write_custody_acquired");
        acquiredFrames.push(frame);
      },
      async readParentAuthorization() {
        events.push("read_parent_authorization");
        if (typeof authorization === "function") {
          return authorization({ acquiredFrames, binding });
        }
        return authorization === undefined
          ? parentAuthorization({ acquiredFrame: acquiredFrames[0] })
          : authorization;
      },
      async writeSchemaReadyCustodyHeld(frame) {
        events.push("write_schema_ready_custody_held");
        heldFrames.push(frame);
      },
      async readParentRelease() {
        events.push("read_parent_release");
        if (typeof release === "function") {
          return release({ acquiredFrames, heldFrames, binding });
        }
        return release === undefined
          ? parentRelease({ heldFrame: heldFrames[0] })
          : release;
      }
    })
  };
}

function childCoreOptions({
  channel,
  processSecurityContext = CHILD_PROCESS_IDENTITY,
  exclusiveCustody,
  schemaOperation
}) {
  return {
    capabilityChannel: channel,
    // Retain the old probes while the red test proves they are insufficient.
    getuid: () => processSecurityContext.uid,
    getgid: () => processSecurityContext.gid,
    readProcessSecurityContext: () => processSecurityContext,
    createAcquisitionProofSha256: () => ACQUISITION_PROOF_SHA256,
    exclusiveCustody,
    schemaOperation
  };
}

test("production snapshot module exports only the closed child CLI runner, never child or database mutator cores", async () => {
  const productionModule = await import(SNAPSHOT_GATE_SOURCE);

  assert.equal(typeof productionModule[CHILD_RUNNER], "function");
  assert.equal(productionModule[CHILD_RUNNER].length, 0, "production runner accepts no injected selector");
  for (const forbidden of [
    CHILD_CORE,
    "createWelcomeCoinsSchemaCustodyChildChannel",
    "applyWelcomeCoinsSchemaUnderCustodyCore",
    "applyWelcomeCoinsSchemaUnderCustody",
    "withControlPlaneDatabaseExclusiveCustody",
    "snapshotControlPlaneDatabase",
    "restoreControlPlaneDatabase"
  ]) {
    assert.equal(Object.hasOwn(productionModule, forbidden), false, forbidden);
  }
});

test("child runner, schema core, and exclusive custody primitive are private and co-located in the snapshot module", () => {
  const snapshotSource = readFileSync(SNAPSHOT_GATE_SOURCE, "utf8");
  const legacyCustodySource = readFileSync(LEGACY_SCHEMA_CUSTODY_SOURCE, "utf8");

  assert.equal(new RegExp(`^async function ${CHILD_CORE}\\(`, "mu").test(snapshotSource), true);
  assert.equal(/^async function applyWelcomeCoinsSchemaUnderCustodyCore\(/mu.test(snapshotSource), true);
  assert.equal(/^async function withControlPlaneDatabaseExclusiveCustody\(/mu.test(snapshotSource), true);
  assert.doesNotMatch(snapshotSource, /^export\s+async function (?:runWelcomeCoinsSchemaCustodyChildCore|applyWelcomeCoinsSchemaUnderCustodyCore|withControlPlaneDatabaseExclusiveCustody)\(/mu);
  assert.doesNotMatch(
    snapshotSource,
    /from\s+["']\.\/control-plane-welcome-coins-schema-custody-gate-lib\.mjs["']/u,
    "the closed path cannot import a separately callable schema mutator"
  );
  assert.doesNotMatch(
    legacyCustodySource,
    /^async function applyWelcomeCoinsSchemaUnderCustodyCore\(/mu,
    "there is one private schema mutator implementation, not a drifting duplicate"
  );
});

test("closed child runner uses root-owned unlinked FD3 plus fixed acquired/authorize pipes and no argv or env path selector", () => {
  const source = readFileSync(SNAPSHOT_GATE_SOURCE, "utf8");
  const capabilityFd = fixedDescriptorConstant(source, "CAPABILITY", 3);
  const acquiredFd = fixedDescriptorConstant(source, "ACQUIRED", 4);
  const authorizationFd = fixedDescriptorConstant(source, "AUTHORIZ", 5);
  const runnerSource = declaredFunctionSource(source, CHILD_RUNNER);
  const channelSource = declaredFunctionSource(source, CHILD_CHANNEL_FACTORY);

  assert.match(runnerSource, new RegExp(`\\b${CHILD_CORE}\\b`, "u"));
  assert.match(runnerSource, new RegExp(`\\b${CHILD_CHANNEL_FACTORY}\\b`, "u"));
  assert.doesNotMatch(runnerSource, /process\.(?:argv|env)\b/u);
  assert.doesNotMatch(channelSource, /process\.(?:argv|env)\b/u);
  for (const descriptorName of [capabilityFd, acquiredFd, authorizationFd]) {
    assert.match(channelSource, new RegExp(`\\b${descriptorName}\\b`, "u"));
  }
  assert.match(channelSource, /fstatSync\s*\(/u);
  assert.match(channelSource, /\.isFile\s*\(\s*\)/u);
  assert.match(channelSource, /\.uid\b/u);
  assert.match(channelSource, /\.nlink\b/u);
  assert.match(channelSource, /0o077/u);
  assert.match(channelSource, /readSync\s*\(/u);
  assert.match(channelSource, /writeSync\s*\(/u);
});

test("FD3 carries only a challenge commitment and FD4/FD5 expose exact bound endpoint identities", () => {
  const source = readFileSync(SNAPSHOT_GATE_SOURCE, "utf8");
  const envelopeSource = declaredFunctionSource(
    source,
    "exactWelcomeCoinsSchemaCustodyChildEnvelope"
  );
  const channelSource = declaredFunctionSource(source, CHILD_CHANNEL_FACTORY);

  assert.doesNotMatch(
    envelopeSource,
    /authorizationNonceSha256/u,
    "an FD3 value accepted verbatim on FD5 is replayable authorization"
  );
  assert.match(envelopeSource, /authorizationChallengeSha256/u);
  assert.match(envelopeSource, /parentIdentity/u);
  assert.match(envelopeSource, /childIdentity/u);
  assert.match(envelopeSource, /acquiredChannelIdentitySha256/u);
  assert.match(envelopeSource, /authorizationChannelIdentitySha256/u);
  assert.match(channelSource, /readBoundChannelIdentity/u);
  assert.match(channelSource, /parentIdentity/u);
  assert.match(channelSource, /childIdentity/u);
  assert.match(channelSource, /acquiredChannelIdentitySha256/u);
  assert.match(channelSource, /authorizationChannelIdentitySha256/u);
  assert.match(source, /randomBytes\s*\(/u, "the acquired proof is created after custody from fresh entropy");
  assert.match(source, /acquisitionProofSha256/u);
});

test("closed child builds an exact processSecurityContext from real and effective Linux credentials", () => {
  const source = readFileSync(SNAPSHOT_GATE_SOURCE, "utf8");
  const coreSource = declaredFunctionSource(source, CHILD_CORE);
  const runnerSource = declaredFunctionSource(source, CHILD_RUNNER);

  assert.match(coreSource, /readProcessSecurityContext/u);
  for (const field of [
    "euid",
    "suid",
    "fsuid",
    "egid",
    "sgid",
    "fsgid",
    "supplementaryGids",
    "capInh",
    "capEff",
    "capPrm",
    "capBnd",
    "capAmb",
    "noNewPrivs",
    "tracerPid",
    "procSelfOwnerUid",
    "procSelfOwnerGid",
    "parentIdentity",
    "startTimeTicks"
  ]) {
    assert.match(source, new RegExp(`\\b${field}\\b`, "u"), field);
  }
  assert.match(runnerSource, /readProcessSecurityContext/u);
  assert.match(source, /process\.geteuid\s*\(/u);
  assert.match(source, /process\.getegid\s*\(/u);
  assert.match(source, /process\.getgroups\s*\(/u);
  assert.match(source, /CapEff/u);
  assert.match(source, /CapPrm/u);
  assert.match(source, /CapInh/u);
  assert.match(source, /CapBnd/u);
  assert.match(source, /CapAmb/u);
  assert.match(source, /NoNewPrivs/u);
  assert.match(source, /TracerPid/u);
  assert.match(source, /statSync\s*\(\s*["']\/proc\/self["']/u);
});

test("direct child launcher cannot mint a capability from argv or environment", () => {
  const privateSelector = "/private/state/subscription-control.sqlite";
  const result = spawnSync(process.execPath, [
    CHILD_CLI_PATH,
    "--db-path",
    privateSelector,
    "--token",
    "private-token"
  ], {
    encoding: "utf8",
    env: {
      ...process.env,
      SUBSCRIPTION_CONTROL_DB_PATH: privateSelector,
      WELCOME_COINS_SCHEMA_CUSTODY_TOKEN: "private-token"
    }
  });

  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.deepEqual(JSON.parse(result.stderr), {
    schemaVersion: "1",
    type: "control_plane_welcome_coins_schema_custody_child",
    state: "blocked",
    condition: "execution_envelope_required"
  });
  assert.equal(result.stderr.includes(privateSelector), false);
  assert.equal(result.stderr.includes("private-token"), false);
});

test("child failure receipt preserves aggregate mutation uncertainty without leaking details", async () => {
  const {
    __childFailureReceiptForHarness: failureReceipt,
    ControlPlaneDatabaseSnapshotGateError
  } = await loadPrivateChildHarness();
  assert.deepEqual(failureReceipt(new ControlPlaneDatabaseSnapshotGateError("database_custody_failed")), {
    schemaVersion: "1",
    type: "control_plane_welcome_coins_schema_custody_child",
    state: "blocked",
    condition: "database_custody_failed"
  });
  assert.deepEqual(failureReceipt(new ControlPlaneDatabaseSnapshotGateError("database_custody_failed", { mutationPossible: true })), {
    schemaVersion: "1",
    type: "control_plane_welcome_coins_schema_custody_child",
    state: "attention_required",
    condition: "database_custody_failed",
    mutationPossible: true
  });
  const unexpected = failureReceipt(Object.assign(new Error("private path /secret"), { mutationPossible: true }));
  assert.deepEqual(unexpected, {
    schemaVersion: "1",
    type: "control_plane_welcome_coins_schema_custody_child",
    state: "attention_required",
    condition: "unexpected_execution_failure",
    mutationPossible: true
  });
  assert.equal(JSON.stringify(unexpected).includes("/secret"), false);
});

test("child core requires the exact non-root service UID and GID before entering exclusive custody", async () => {
  const { __childCoreForHarness: runChildCore } = await loadPrivateChildHarness();
  const invalidIdentities = [
    { uid: 0 },
    { gid: 0 },
    { uid: 1000 },
    { gid: 1003 },
    { uid: undefined },
    { gid: undefined }
  ];

  for (const overrides of invalidIdentities) {
    let custodyCalls = 0;
    let schemaCalls = 0;
    const { channel } = capabilityChannel();
    const processSecurityContext = childProcessIdentity(overrides);
    await assert.rejects(
      () => runChildCore(childCoreOptions({
        channel,
        processSecurityContext,
        exclusiveCustody: async () => {
          custodyCalls += 1;
        },
        schemaOperation: async () => {
          schemaCalls += 1;
        }
      })),
      /service_principal_identity_invalid/u
    );
    assert.equal(custodyCalls, 0, `${JSON.stringify(overrides)} never acquires custody`);
    assert.equal(schemaCalls, 0, `${JSON.stringify(overrides)} never enters schema core`);
  }
});

test("child rejects effective root, foreign supplementary groups, capabilities, or missing no-new-privileges before custody", async () => {
  const { __childCoreForHarness: runChildCore } = await loadPrivateChildHarness();
  const invalidSecurityStates = [
    ["effective_uid_root", { euid: 0 }],
    ["saved_uid_root", { suid: 0 }],
    ["filesystem_uid_root", { fsuid: 0 }],
    ["effective_gid_root", { egid: 0 }],
    ["saved_gid_root", { sgid: 0 }],
    ["filesystem_gid_root", { fsgid: 0 }],
    ["supplementary_root_group", { supplementaryGids: [0, 1002] }],
    ["supplementary_foreign_group", { supplementaryGids: [1002, 2000] }],
    ["inheritable_capability", { capInh: "0000000000000001" }],
    ["effective_capability", { capEff: "0000000000000001" }],
    ["permitted_capability", { capPrm: "0000000000000001" }],
    ["bounding_capability", { capBnd: "0000000000000001" }],
    ["ambient_capability", { capAmb: "0000000000000001" }],
    ["no_new_privileges_disabled", { noNewPrivs: 0 }],
    ["traced", { tracerPid: 99 }],
    ["dumpable_proc_owner", { procSelfOwnerUid: 1001, procSelfOwnerGid: 1002 }],
    ["parent_pid_reused", {
      parentIdentity: { ...PARENT_PROCESS_IDENTITY, startTimeTicks: "987650001" }
    }]
  ];

  for (const [label, overrides] of invalidSecurityStates) {
    let custodyCalls = 0;
    let schemaCalls = 0;
    const { channel } = capabilityChannel();
    await assert.rejects(
      () => runChildCore(childCoreOptions({
        channel,
        processSecurityContext: childProcessIdentity(overrides),
        exclusiveCustody: async () => {
          custodyCalls += 1;
        },
        schemaOperation: async () => {
          schemaCalls += 1;
        }
      })),
      (error) => error?.condition === "service_principal_identity_invalid",
      label
    );
    assert.equal(custodyCalls, 0, `${label} never acquires custody`);
    assert.equal(schemaCalls, 0, `${label} never enters schema core`);
  }
});

test("child revalidates the same hardened process context after exclusive acquisition and after parent authorization", async () => {
  const { __childCoreForHarness: runChildCore } = await loadPrivateChildHarness();
  for (const driftAtRead of [2, 3]) {
    const fixture = capabilityChannel();
    let securityReads = 0;
    let schemaApplyCalls = 0;
    const options = childCoreOptions({
      channel: fixture.channel,
      exclusiveCustody: async ({ operation }) => {
        fixture.events.push("exclusive_custody_acquired");
        return operation({ database: Object.freeze({}), snapshotPath: "/proc/self/fd/99" });
      },
      schemaOperation: async ({ exclusiveCustody }) => exclusiveCustody({
        operation: async () => {
          schemaApplyCalls += 1;
        }
      })
    });
    options.readProcessSecurityContext = () => {
      securityReads += 1;
      return securityReads === driftAtRead
        ? childProcessIdentity({ euid: 0 })
        : CHILD_PROCESS_IDENTITY;
    };

    await assert.rejects(
      () => runChildCore(options),
      (error) => error?.condition === "service_principal_identity_invalid",
      `runtime drift at security read ${driftAtRead}`
    );
    assert.equal(securityReads, driftAtRead);
    assert.equal(schemaApplyCalls, 0);
  }
});

test("child core requires an initial aggregate holder-zero claim before custody", async () => {
  const { __childCoreForHarness: runChildCore } = await loadPrivateChildHarness();
  for (const initialExternalHolderCount of [undefined, -1, 1, 2, 0.5, "0"]) {
    let custodyCalls = 0;
    let schemaCalls = 0;
    const envelope = executionEnvelope({ initialExternalHolderCount });
    const { channel } = capabilityChannel({ envelope });
    await assert.rejects(
      () => runChildCore(childCoreOptions({
        channel,
        exclusiveCustody: async () => {
          custodyCalls += 1;
        },
        schemaOperation: async () => {
          schemaCalls += 1;
        }
      })),
      /execution_envelope_invalid/u
    );
    assert.equal(custodyCalls, 0);
    assert.equal(schemaCalls, 0);
  }
});

test("wrong FD4 or FD5 endpoint identity fails before exclusive custody", async () => {
  const { __childCoreForHarness: runChildCore } = await loadPrivateChildHarness();
  const cases = [
    ["wrong_acquired_endpoint", {
      acquiredChannelIdentitySha256: "8".repeat(64)
    }],
    ["wrong_authorization_endpoint", {
      authorizationChannelIdentitySha256: "9".repeat(64)
    }],
    ["wrong_parent_pid", {
      parentIdentity: { ...PARENT_PROCESS_IDENTITY, pid: PARENT_PROCESS_IDENTITY.pid + 1 }
    }],
    ["wrong_parent_start_time", {
      parentIdentity: { ...PARENT_PROCESS_IDENTITY, startTimeTicks: "987650001" }
    }],
    ["wrong_child_pid", {
      childIdentity: { ...publicChildIdentity(), pid: CHILD_PROCESS_IDENTITY.pid + 1 }
    }],
    ["wrong_child_start_time", {
      childIdentity: { ...publicChildIdentity(), startTimeTicks: "987654322" }
    }]
  ];

  for (const [label, overrides] of cases) {
    let custodyCalls = 0;
    let schemaCalls = 0;
    const { channel, events } = capabilityChannel({
      binding: channelBinding(overrides)
    });
    await assert.rejects(
      () => runChildCore(childCoreOptions({
        channel,
        exclusiveCustody: async () => {
          custodyCalls += 1;
        },
        schemaOperation: async () => {
          schemaCalls += 1;
        }
      })),
      (error) => error?.condition === "execution_envelope_invalid",
      label
    );
    assert.deepEqual(events, ["read_execution_envelope", "read_bound_channel_identity"], label);
    assert.equal(custodyCalls, 0, label);
    assert.equal(schemaCalls, 0, label);
  }
});

test("child holds post-commit custody through an exact held/release exchange", async () => {
  const { __childCoreForHarness: runChildCore } = await loadPrivateChildHarness();
  const { channel, events, acquiredFrames, heldFrames } = capabilityChannel();
  const result = await runChildCore(childCoreOptions({
    channel,
    exclusiveCustody: async ({ operation, postCommitCustody }) => {
      events.push("exclusive_custody_acquired");
      const operationResult = await operation({
        database: Object.freeze({}),
        snapshotPath: "/proc/self/fd/99"
      });
      events.push("schema_commit");
      await postCommitCustody(schemaReadyResult());
      events.push("post_commit_custody_release");
      return operationResult;
    },
    schemaOperation: async ({ exclusiveCustody }) => exclusiveCustody({
      operation: async () => {
        events.push("schema_apply");
        return Object.freeze({ condition: "schema_ready" });
      }
    })
  }));

  assert.deepEqual(result, { condition: "schema_ready" });
  assert.deepEqual(acquiredFrames, [expectedAcquiredFrame()]);
  assert.deepEqual(heldFrames, [expectedHeldFrame()]);
  assert.deepEqual(events, [
    "read_execution_envelope",
    "read_bound_channel_identity",
    "exclusive_custody_acquired",
    "write_custody_acquired",
    "read_parent_authorization",
    "schema_apply",
    "schema_commit",
    "write_schema_ready_custody_held",
    "read_parent_release",
    "post_commit_custody_release"
  ]);
});

test("release-after-attention frees the hold but remains mutation-possible attention", async () => {
  const { __childCoreForHarness: runChildCore } = await loadPrivateChildHarness();
  const fixture = capabilityChannel({
    release: ({ heldFrames }) => parentRelease({
      heldFrame: heldFrames[0],
      type: "release_after_attention"
    })
  });
  let holdReleased = false;

  await assert.rejects(
    () => runChildCore(childCoreOptions({
      channel: fixture.channel,
      exclusiveCustody: async ({ operation, postCommitCustody }) => {
        const operationResult = await operation({
          database: Object.freeze({}),
          snapshotPath: "/proc/self/fd/99"
        });
        try {
          await postCommitCustody(schemaReadyResult());
        } finally {
          holdReleased = true;
        }
        return operationResult;
      },
      schemaOperation: async ({ exclusiveCustody }) => exclusiveCustody({
        operation: async () => Object.freeze({ condition: "schema_ready" })
      })
    })),
    (error) => error?.condition === "database_custody_failed"
      && error?.mutationPossible === true
  );
  assert.equal(holdReleased, true);
  assert.deepEqual(fixture.events.slice(-2), [
    "write_schema_ready_custody_held",
    "read_parent_release"
  ]);
});

test("missing, reordered, duplicate, unbound, or extended release frames fail closed after commit", async () => {
  const { __childCoreForHarness: runChildCore } = await loadPrivateChildHarness();
  const invalidReleases = [
    ["missing", null],
    ["wrong_type", ({ heldFrames }) => parentRelease({
      heldFrame: heldFrames[0],
      type: "authorize_schema_apply"
    })],
    ["unbound", ({ heldFrames }) => ({
      ...parentRelease({ heldFrame: heldFrames[0] }),
      heldFrameSha256: "0".repeat(64)
    })],
    ["duplicate", ({ heldFrames }) => {
      const frame = parentRelease({ heldFrame: heldFrames[0] });
      return [frame, frame];
    }],
    ["extended", ({ heldFrames }) => ({
      ...parentRelease({ heldFrame: heldFrames[0] }),
      selector: "/private/forbidden"
    })]
  ];

  for (const [label, release] of invalidReleases) {
    const fixture = capabilityChannel({ release });
    let holdReleased = false;
    await assert.rejects(
      () => runChildCore(childCoreOptions({
        channel: fixture.channel,
        exclusiveCustody: async ({ operation, postCommitCustody }) => {
          const operationResult = await operation({
            database: Object.freeze({}),
            snapshotPath: "/proc/self/fd/99"
          });
          try {
            await postCommitCustody(schemaReadyResult());
          } finally {
            holdReleased = true;
          }
          return operationResult;
        },
        schemaOperation: async ({ exclusiveCustody }) => exclusiveCustody({
          operation: async () => Object.freeze({ condition: "schema_ready" })
        })
      })),
      (error) => error?.condition === "parent_authorization_invalid"
        && error?.mutationPossible === true,
      label
    );
    assert.equal(holdReleased, true, label);
  }
});

test("held schemaResult rejects any non-aggregate field before FD4 publication", async () => {
  const { __childCoreForHarness: runChildCore } = await loadPrivateChildHarness();
  const fixture = capabilityChannel();
  let holdReleased = false;

  await assert.rejects(
    () => runChildCore(childCoreOptions({
      channel: fixture.channel,
      exclusiveCustody: async ({ operation, postCommitCustody }) => {
        const operationResult = await operation({
          database: Object.freeze({}),
          snapshotPath: "/proc/self/fd/99"
        });
        try {
          await postCommitCustody(schemaReadyResult({ privatePath: "/private/forbidden" }));
        } finally {
          holdReleased = true;
        }
        return operationResult;
      },
      schemaOperation: async ({ exclusiveCustody }) => exclusiveCustody({
        operation: async () => Object.freeze({ condition: "schema_ready" })
      })
    })),
    (error) => error?.condition === "database_custody_failed"
      && error?.mutationPossible === true
  );
  assert.equal(holdReleased, true);
  assert.deepEqual(fixture.heldFrames, []);
});

test("the private FD4 and FD5 channel is an exact two-frame state machine", () => {
  const source = readFileSync(SNAPSHOT_GATE_SOURCE, "utf8");
  const channelSource = declaredFunctionSource(source, CHILD_CHANNEL_FACTORY);

  assert.match(channelSource, /acquiredFramesWritten\s*!==\s*0/u);
  assert.match(channelSource, /acquiredFramesWritten\s*!==\s*1/u);
  assert.match(channelSource, /acquiredFramesWritten\s*!==\s*2/u);
  assert.match(channelSource, /authorizationFramesRead\s*!==\s*0/u);
  assert.match(channelSource, /authorizationFramesRead\s*!==\s*1/u);
  assert.match(channelSource, /assertCanonicalChannelEof/u);
  assert.match(channelSource, /count\s*===\s*0\)\s*fail\(condition\)/u);
  assert.match(channelSource, /bytes\[total\s*-\s*1\]\s*!==\s*0x0a/u);
  assert.match(channelSource, /text\.includes\("\\r"\)/u);
  assert.match(channelSource, /writeSchemaReadyCustodyHeld/u);
  assert.match(channelSource, /readParentRelease/u);
});

test("closed child pins the outer runtime start-guard identity before exclusive custody", async () => {
  const { __childCoreForHarness: runChildCore } = await loadPrivateChildHarness();
  const base = executionEnvelope();
  const expectedRuntimeConditionStartGuardIdentity = "runtime-condition-v1:11:12:21:22";
  const { channel } = capabilityChannel({
    envelope: Object.freeze({
      ...base,
      custody: Object.freeze({
        ...base.custody,
        expectedRuntimeConditionStartGuardIdentity
      })
    })
  });
  let observedGuardIdentity;

  const result = await runChildCore(childCoreOptions({
    channel,
    exclusiveCustody: async ({ operation, postCommitCustody, ...options }) => {
      observedGuardIdentity = options.expectedRuntimeConditionStartGuardIdentity;
      const operationResult = await operation({
        database: Object.freeze({}),
        snapshotPath: "/proc/self/fd/99"
      });
      await postCommitCustody(schemaReadyResult());
      return operationResult;
    },
    schemaOperation: async ({ exclusiveCustody }) => exclusiveCustody({
      operation: async () => Object.freeze({ condition: "schema_ready" })
    })
  }));

  assert.deepEqual(result, { condition: "schema_ready" });
  assert.equal(observedGuardIdentity, expectedRuntimeConditionStartGuardIdentity);
  const invalidBase = executionEnvelope();
  const invalid = capabilityChannel({
    envelope: Object.freeze({
      ...invalidBase,
      custody: Object.freeze({
        ...invalidBase.custody,
        expectedRuntimeConditionStartGuardIdentity: "7".repeat(64)
      })
    })
  });
  await assert.rejects(
    runChildCore(childCoreOptions({
      channel: invalid.channel,
      exclusiveCustody: async () => assert.fail("invalid guard reached custody"),
      schemaOperation: async () => assert.fail("invalid guard reached schema")
    })),
    (error) => error?.condition === "execution_envelope_invalid"
  );
  const snapshotSource = readFileSync(SNAPSHOT_GATE_SOURCE, "utf8");
  assert.match(
    snapshotSource,
    /entryGuard\.runtimeConditionStartGuardIdentity\s*!==\s*expectedRuntimeConditionStartGuardIdentity/u
  );
});

test("missing, malformed, replayed, or cross-child authorization fails inside custody before schema apply", async () => {
  const { __childCoreForHarness: runChildCore } = await loadPrivateChildHarness();
  const invalidAuthorizations = [
    ["missing", null],
    ["empty", {}],
    ["missing_challenge", { type: "authorize_schema_apply" }],
    ["wrong_type", ({ acquiredFrames }) => ({
      ...parentAuthorization({ acquiredFrame: acquiredFrames[0] }),
      type: "wrong"
    })],
    ["legacy_replayable_digest", ({ acquiredFrames }) => ({
      type: "authorize_schema_apply",
      authorizationNonceSha256: AUTHORIZATION_CHALLENGE_SHA256,
      acquiredFrameSha256: sha256Canonical(acquiredFrames[0])
    })],
    ["wrong_challenge", ({ acquiredFrames }) => parentAuthorization({
      acquiredFrame: acquiredFrames[0],
      authorizationChallenge: "b2".repeat(32)
    })],
    ["cross_child_replay", ({ acquiredFrames }) => parentAuthorization({
      acquiredFrame: {
        ...acquiredFrames[0],
        childIdentity: {
          ...acquiredFrames[0].childIdentity,
          pid: acquiredFrames[0].childIdentity.pid + 1
        }
      }
    })],
    ["cross_child_start_time", ({ acquiredFrames }) => parentAuthorization({
      acquiredFrame: {
        ...acquiredFrames[0],
        childIdentity: {
          ...acquiredFrames[0].childIdentity,
          startTimeTicks: "987654322"
        }
      }
    })],
    ["cross_child_uid", ({ acquiredFrames }) => parentAuthorization({
      acquiredFrame: {
        ...acquiredFrames[0],
        childIdentity: {
          ...acquiredFrames[0].childIdentity,
          uid: 1003
        }
      }
    })],
    ["cross_child_gid", ({ acquiredFrames }) => parentAuthorization({
      acquiredFrame: {
        ...acquiredFrames[0],
        childIdentity: {
          ...acquiredFrames[0].childIdentity,
          gid: 1004
        }
      }
    })],
    ["cross_endpoint_replay", ({ acquiredFrames }) => parentAuthorization({
      acquiredFrame: {
        ...acquiredFrames[0],
        channelBinding: channelBinding({
          authorizationChannelIdentitySha256: "9".repeat(64)
        })
      }
    })],
    ["duplicate_authorization_frame", ({ acquiredFrames }) => {
      const frame = parentAuthorization({ acquiredFrame: acquiredFrames[0] });
      return [frame, frame];
    }],
    ["duplicate_acquired_replay", ({ acquiredFrames }) => parentAuthorization({
      acquiredFrame: [acquiredFrames[0], acquiredFrames[0]]
    })],
    ["extra_selector", ({ acquiredFrames }) => ({
      ...parentAuthorization({ acquiredFrame: acquiredFrames[0] }),
      dbPath: "/untrusted/selector.sqlite"
    })]
  ];

  for (const [label, authorization] of invalidAuthorizations) {
    const events = [];
    let schemaApplyCalls = 0;
    const fixture = capabilityChannel({ authorization });
    const channel = Object.freeze({
      async readExecutionEnvelope() {
        const value = await fixture.channel.readExecutionEnvelope();
        events.push(fixture.events.at(-1));
        return value;
      },
      async readBoundChannelIdentity() {
        const value = await fixture.channel.readBoundChannelIdentity();
        events.push(fixture.events.at(-1));
        return value;
      },
      async writeCustodyAcquired(frame) {
        await fixture.channel.writeCustodyAcquired(frame);
        events.push(fixture.events.at(-1));
      },
      async readParentAuthorization() {
        const value = await fixture.channel.readParentAuthorization();
        events.push(fixture.events.at(-1));
        return value;
      },
      async writeSchemaReadyCustodyHeld(frame) {
        await fixture.channel.writeSchemaReadyCustodyHeld(frame);
        events.push(fixture.events.at(-1));
      },
      async readParentRelease() {
        const value = await fixture.channel.readParentRelease();
        events.push(fixture.events.at(-1));
        return value;
      }
    });
    await assert.rejects(
      () => runChildCore(childCoreOptions({
        channel,
        exclusiveCustody: async ({ operation }) => {
          events.push("exclusive_custody_acquired");
          return operation({ database: Object.freeze({}), snapshotPath: "/proc/self/fd/99" });
        },
        schemaOperation: async ({ exclusiveCustody }) => exclusiveCustody({
          operation: async () => {
            schemaApplyCalls += 1;
          }
        })
      })),
      (error) => error?.condition === "parent_authorization_invalid",
      label
    );
    assert.equal(schemaApplyCalls, 0, label);
    assert.deepEqual(events, [
      "read_execution_envelope",
      "read_bound_channel_identity",
      "exclusive_custody_acquired",
      "write_custody_acquired",
      "read_parent_authorization"
    ], label);
  }
});
