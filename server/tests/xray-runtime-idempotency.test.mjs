import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import test from "node:test";
import { buildCredentialReconciliationApplyPlan } from "../services/edge/credential-reconciliation-gateway.mjs";
import {
  createXrayVlessRealityExplicitRestartAdapter,
  createXrayVlessRealityHostRuntimeAdapter
} from "../services/edge/xray-vless-reality-runtime-adapter.mjs";

const CHANNEL = "channel-synthetic-vless-reality";
const CREDENTIAL_A = "edgecred_synthetic_a";
const CREDENTIAL_B = "edgecred_synthetic_b";
const MUTATION_HOOKS = ["writeCandidate", "configTest", "backup", "replace", "restart"];
const listenerConfig = () => ({
  name: CHANNEL,
  listen: "127.0.0.1",
  port: 18443,
  dest: "example.invalid:443",
  serverNames: ["example.invalid"],
  privateKey: "synthetic-private-key-not-production",
  shortIds: ["abcd1234"],
  usageStats: { statsServer: "127.0.0.1:10085" },
  validationAttempts: 1,
  validationRetryDelayMs: 0
});

function syntheticSystemdStartAfterFile(path) {
  const file = statSync(path);
  // The mocked systemd clock advances after the real disposable file write.
  const started = new Date(Math.ceil(Math.max(file.mtimeMs, file.ctimeMs)) + 1000);
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][started.getUTCDay()];
  return `${weekday} ${started.toISOString().replace("T", " ").replace(/\.(\d{3})Z$/, ".$1000 UTC")}`;
}

function removeOwnedFixture(root) {
  assert.equal(dirname(resolve(root)), resolve(tmpdir()));
  assert(basename(root).startsWith("xray-idempotency-test-"));
  rmSync(root, { recursive: true, force: true });
}

function payload(refs = [CREDENTIAL_A], revoked = []) {
  return {
    channelRef: CHANNEL,
    desiredStateRef: "synthetic_desired_state_same_generation",
    runtime: "xray-vless-reality",
    activationSurface: "explicit-restart",
    actions: [
      ...refs.map((credentialRef) => ({ action: "add", credentialRef })),
      ...revoked.map((credentialRef) => ({ action: "revoke", credentialRef }))
    ]
  };
}

function harness({ includeReader = true, includeRunningProof = true } = {}) {
  const state = {
    active: null,
    candidate: null,
    calls: [],
    service: true,
    tcp: true,
    configExitCode: 0,
    activeConfigExitCode: 0,
    readError: null,
    readNull: false,
    loaded: true,
    processRef: "test-process-1",
    proofSequence: null,
    afterActiveConfigTest: null,
    materials: new Map([
      [CREDENTIAL_A, { uuid: "11111111-1111-4111-8111-111111111111" }],
      [CREDENTIAL_B, { uuid: "22222222-2222-4222-8222-222222222222" }]
    ])
  };
  const options = {
    serviceName: "synthetic-xray.service",
    listener: listenerConfig(),
    resolveCredentialMaterial: (ref) => state.materials.get(ref),
    writeCandidateConfig(content) {
      state.calls.push("writeCandidate");
      state.candidate = content;
    },
    runConfigTest(context) {
      if (context?.active === true) {
        state.calls.push("activeConfigTest");
        state.afterActiveConfigTest?.();
        return { exitCode: state.activeConfigExitCode };
      }
      state.calls.push("configTest");
      return { exitCode: state.configExitCode };
    },
    backupActiveConfig() {
      state.calls.push("backup");
      return { backupRef: "synthetic_backup" };
    },
    replaceActiveConfig() {
      state.calls.push("replace");
      state.active = state.candidate;
    },
    restartService() {
      state.calls.push("restart");
      state.service = true;
      state.tcp = true;
      state.loaded = true;
      return { ok: true };
    },
    validateService() {
      state.calls.push("service");
      return state.service === undefined ? {} : { active: state.service };
    },
    validateListener() {
      state.calls.push("listener");
      return state.tcp === undefined ? {} : { tcp: state.tcp };
    },
    now: () => new Date("2026-09-08T02:00:00.000Z")
  };
  if (includeReader) {
    options.readActiveConfig = () => {
      state.calls.push("readActive");
      if (state.readError) throw state.readError;
      return state.readNull ? null : state.active;
    };
  }
  if (includeRunningProof) {
    options.validateRunningConfig = () => {
      state.calls.push("runningProof");
      return state.proofSequence?.shift() ?? { loaded: state.loaded, processRef: state.processRef };
    };
  }
  return { state, adapter: createXrayVlessRealityExplicitRestartAdapter(options) };
}

function warmup(fixture, initial = payload()) {
  assert.equal(fixture.adapter.applyCredentialReconciliation(initial).status, "applied");
  fixture.state.calls.length = 0;
}

function assertAppliedOnce(fixture, value = payload()) {
  const receipt = fixture.adapter.applyCredentialReconciliation(value);
  assert.equal(receipt.status, "applied");
  assert.equal(receipt.mutation, true);
  assert.deepEqual(fixture.state.calls.filter((call) => MUTATION_HOOKS.includes(call)), MUTATION_HOOKS);
  return receipt;
}

test("Xray idempotency applies normally when no active config exists", () => {
  const fixture = harness();
  assertAppliedOnce(fixture);
  assert.equal(fixture.state.active, fixture.state.candidate);
});

test("Xray idempotency skips all writes and restart on second identical healthy apply", () => {
  const fixture = harness();
  warmup(fixture);
  const before = fixture.state.active;
  const receipt = fixture.adapter.applyCredentialReconciliation(payload());
  assert.equal(receipt.status, "unchanged");
  assert.equal(receipt.mutation, false);
  assert.equal(receipt.service.active, true);
  assert.equal(receipt.service.restarted, false);
  assert.equal(receipt.listener.tcp, true);
  assert.equal(fixture.state.active, before);
  assert.deepEqual(fixture.state.calls.filter((call) => MUTATION_HOOKS.includes(call)), []);
  assert(fixture.state.calls.includes("readActive"));
  assert(fixture.state.calls.includes("service"));
  assert(fixture.state.calls.includes("listener"));
  assert.equal(fixture.state.calls.filter((call) => call === "activeConfigTest").length, 1);
  assert.equal(receipt.configTest.ok, true);
  assert.doesNotMatch(JSON.stringify(receipt), /synthetic-private-key|11111111|edgecred_synthetic/);
});

test("Xray idempotency unchanged receipt remains successful through the actual reconciliation gateway", () => {
  const fixture = harness();
  const input = {
    desiredState: {
      channelRef: CHANNEL,
      runtime: "xray-vless-reality",
      activationSurface: "explicit-restart",
      desiredStateRef: "synthetic_desired_state_same_generation",
      desiredCredentials: [{
        credentialRef: CREDENTIAL_A,
        orderRef: "synthetic_order_a",
        userRef: "synthetic_user_a",
        expiresAt: "2027-09-08T02:00:00.000Z",
        materialDigest: "sha256:synthetic_digest_a"
      }],
      currentCredentials: []
    },
    inputPath: "runtime:synthetic-idempotency",
    executeProductionMutation: true,
    runtimeAdapter: fixture.adapter
  };
  assert.equal(buildCredentialReconciliationApplyPlan(input).ok, true);
  fixture.state.calls.length = 0;
  const report = buildCredentialReconciliationApplyPlan(input);
  assert.equal(report.ok, true);
  assert.equal(report.runtimeReceipt.status, "unchanged");
  assert.equal(report.runtimeReceipt.mutation, false);
  assert.equal(report.mutation, false);
  assert.equal(report.nextAction, "validate_runtime_state");
  assert.deepEqual(fixture.state.calls.filter((call) => MUTATION_HOOKS.includes(call)), []);
});

test("Xray idempotency does not mistake a reused desired state reference for unchanged clients", () => {
  const fixture = harness();
  warmup(fixture);
  assertAppliedOnce(fixture, payload([CREDENTIAL_A, CREDENTIAL_B]));
  assert.equal(JSON.parse(fixture.state.active).inbounds[0].settings.clients.length, 2);
});

test("Xray idempotency applies changed material behind the same credential reference", () => {
  const fixture = harness();
  warmup(fixture);
  fixture.state.materials.set(CREDENTIAL_A, { uuid: "33333333-3333-4333-8333-333333333333" });
  assertAppliedOnce(fixture);
  assert.equal(JSON.parse(fixture.state.active).inbounds[0].settings.clients[0].id, "33333333-3333-4333-8333-333333333333");
});

test("Xray idempotency applies revocation and then leaves the identical empty state unchanged", () => {
  const fixture = harness();
  warmup(fixture);
  const empty = payload([], [CREDENTIAL_A]);
  assertAppliedOnce(fixture, empty);
  assert.deepEqual(JSON.parse(fixture.state.active).inbounds[0].settings.clients, []);
  fixture.state.calls.length = 0;
  const receipt = fixture.adapter.applyCredentialReconciliation(empty);
  assert.equal(receipt.status, "unchanged");
  assert.equal(receipt.mutation, false);
  assert.deepEqual(fixture.state.calls.filter((call) => MUTATION_HOOKS.includes(call)), []);
});

test("Xray idempotency repairs active config drift instead of trusting previous success", () => {
  const fixture = harness();
  warmup(fixture);
  const drifted = JSON.parse(fixture.state.active);
  drifted.inbounds[0].port = 19443;
  fixture.state.active = JSON.stringify(drifted, null, 2);
  assertAppliedOnce(fixture);
  assert.equal(JSON.parse(fixture.state.active).inbounds[0].port, 18443);
});

test("Xray idempotency compares the complete config including additional fields", () => {
  const fixture = harness();
  warmup(fixture);
  const drifted = JSON.parse(fixture.state.active);
  drifted.log.access = "synthetic-drift.log";
  fixture.state.active = JSON.stringify(drifted, null, 2);
  assertAppliedOnce(fixture);
  assert.equal(JSON.parse(fixture.state.active).log.access, undefined);
});

for (const [name, field, value] of [
  ["inactive service", "service", false],
  ["missing TCP listener", "tcp", false],
  ["unknown service state", "service", undefined],
  ["unknown listener state", "tcp", undefined],
  ["non-boolean service health", "service", "true"],
  ["non-boolean listener health", "tcp", "true"]
]) {
  test(`Xray idempotency does not skip recovery for ${name}`, () => {
    const fixture = harness();
    warmup(fixture);
    fixture.state[field] = value;
    assertAppliedOnce(fixture);
  });
}

test("Xray idempotency preserves apply behavior when readActiveConfig is omitted", () => {
  const fixture = harness({ includeReader: false });
  warmup(fixture);
  assertAppliedOnce(fixture);
});

test("Xray idempotency does not skip when active config read returns null", () => {
  const fixture = harness();
  warmup(fixture);
  fixture.state.readNull = true;
  assertAppliedOnce(fixture);
});

test("Xray idempotency refuses mutation when active config read throws", () => {
  const fixture = harness();
  warmup(fixture);
  fixture.state.readError = new Error("synthetic active read failure");
  const receipt = fixture.adapter.applyCredentialReconciliation(payload());
  assert.equal(receipt.status, "failed");
  assert.equal(receipt.mutation, false);
  assert.deepEqual(fixture.state.calls.filter((call) => MUTATION_HOOKS.includes(call)), []);
});

test("Xray idempotency treats object key order and JSON whitespace as equal", () => {
  const fixture = harness();
  warmup(fixture);
  const active = JSON.parse(fixture.state.active);
  fixture.state.active = JSON.stringify(Object.fromEntries(Object.entries(active).reverse())) + "\n";
  const before = fixture.state.active;
  const receipt = fixture.adapter.applyCredentialReconciliation(payload());
  assert.equal(receipt.status, "unchanged");
  assert.equal(receipt.mutation, false);
  assert.equal(fixture.state.active, before);
  assert.deepEqual(fixture.state.calls.filter((call) => MUTATION_HOOKS.includes(call)), []);
  assert.equal(fixture.state.calls.filter((call) => call === "activeConfigTest").length, 1);
});

test("Xray idempotency retains array order significance", () => {
  const fixture = harness();
  warmup(fixture, payload([CREDENTIAL_A, CREDENTIAL_B]));
  const active = JSON.parse(fixture.state.active);
  active.inbounds[0].settings.clients.reverse();
  fixture.state.active = JSON.stringify(active);
  assertAppliedOnce(fixture, payload([CREDENTIAL_A, CREDENTIAL_B]));
});

for (const [name, configure] of [
  ["running config is not loaded", (fixture) => { fixture.state.loaded = false; }],
  ["running process reference is missing", (fixture) => { fixture.state.processRef = ""; }]
]) {
  test(`Xray idempotency uses the apply path when ${name}`, () => {
    const fixture = harness();
    warmup(fixture);
    configure(fixture);
    assertAppliedOnce(fixture);
  });
}

test("Xray idempotency does not skip without a running config proof callback", () => {
  const fixture = harness({ includeRunningProof: false });
  warmup(fixture);
  assertAppliedOnce(fixture);
});

test("Xray idempotency requires a stable running process before reporting unchanged", () => {
  const fixture = harness();
  warmup(fixture);
  fixture.state.proofSequence = [
    { loaded: true, processRef: "test-process-1" },
    { loaded: true, processRef: "test-process-2" }
  ];
  const receipt = fixture.adapter.applyCredentialReconciliation(payload());
  assert.equal(receipt.status, "failed");
  assert.equal(receipt.mutation, false);
  assert.deepEqual(fixture.state.calls.filter((call) => MUTATION_HOOKS.includes(call)), []);
});

test("Xray idempotency refuses stale unchanged evidence if the active file changes during validation", () => {
  const fixture = harness();
  warmup(fixture);
  fixture.state.afterActiveConfigTest = () => { fixture.state.active = "{}\n"; };
  const receipt = fixture.adapter.applyCredentialReconciliation(payload());
  assert.equal(receipt.status, "failed");
  assert.equal(receipt.mutation, false);
  assert.deepEqual(fixture.state.calls.filter((call) => MUTATION_HOOKS.includes(call)), []);
});

for (const [name, field] of [["service", "service"], ["listener", "tcp"]]) {
  test(`Xray idempotency refuses unchanged if ${name} becomes unhealthy during active config test`, () => {
    const fixture = harness();
    warmup(fixture);
    const activeBefore = fixture.state.active;
    fixture.state.afterActiveConfigTest = () => { fixture.state[field] = false; };
    const receipt = fixture.adapter.applyCredentialReconciliation(payload());
    assert.equal(receipt.status, "failed");
    assert.equal(receipt.mutation, false);
    assert.equal(fixture.state.active, activeBefore);
    assert.equal(fixture.state.processRef, "test-process-1");
    assert.equal(fixture.state.calls.filter((call) => call === "activeConfigTest").length, 1);
    assert.deepEqual(fixture.state.calls.filter((call) => MUTATION_HOOKS.includes(call)), []);
  });
}

test("Xray idempotency cannot claim configTest success when the active config test fails", () => {
  const fixture = harness();
  warmup(fixture);
  fixture.state.activeConfigExitCode = 1;
  const receipt = fixture.adapter.applyCredentialReconciliation(payload());
  assert.equal(receipt.status, "failed");
  assert.equal(receipt.mutation, false);
  assert.equal(receipt.configTest.ok, false);
  assert.deepEqual(fixture.state.calls.filter((call) => MUTATION_HOOKS.includes(call)), []);
});

test("Xray idempotency retries a real restart after an earlier replace was not loaded", () => {
  const fixture = harness();
  warmup(fixture);
  // Simulate a prior successful disk replace with the old process still active.
  fixture.state.loaded = false;
  assertAppliedOnce(fixture);
  fixture.state.calls.length = 0;
  const receipt = fixture.adapter.applyCredentialReconciliation(payload());
  assert.equal(receipt.status, "unchanged");
  assert.equal(receipt.mutation, false);
  assert.deepEqual(fixture.state.calls.filter((call) => MUTATION_HOOKS.includes(call)), []);
});

test("Xray idempotency preserves the config-test failure gate for actual changes", () => {
  const fixture = harness();
  warmup(fixture);
  const before = fixture.state.active;
  fixture.state.configExitCode = 1;
  const receipt = fixture.adapter.applyCredentialReconciliation(payload([CREDENTIAL_A, CREDENTIAL_B]));
  assert.equal(receipt.status, "failed");
  assert.equal(receipt.mutation, false);
  assert.equal(fixture.state.active, before);
  assert.deepEqual(fixture.state.calls.filter((call) => MUTATION_HOOKS.includes(call)), ["writeCandidate", "configTest"]);
});

test("Xray host idempotency reads active disk config even after constructing a new adapter", () => {
  const root = mkdtempSync(join(tmpdir(), "xray-idempotency-test-"));
  const activeConfigPath = join(root, "config.json");
  const candidateConfigPath = join(root, "candidate.json");
  const backupDir = join(root, "backups");
  const calls = [];
  let startedAt;
  function createAdapter() {
    return createXrayVlessRealityHostRuntimeAdapter({
      activeConfigPath, candidateConfigPath, backupDir,
      listener: listenerConfig(),
      resolveCredentialMaterial: () => ({ uuid: "11111111-1111-4111-8111-111111111111" }),
      commandRunner(command, args) {
        calls.push([command, ...args]);
        if (command === "systemctl" && args[0] === "restart") {
          startedAt = syntheticSystemdStartAfterFile(activeConfigPath);
          return { exitCode: 0 };
        }
        if (command === "systemctl" && args[0] === "show") {
          assert(args.includes("--timestamp=us+utc"));
          return { exitCode: 0, stdout: `ActiveState=active\nMainPID=4321\nExecMainStartTimestamp=${startedAt}\n` };
        }
        if (command === "xray" || command === "systemctl") return { exitCode: 0 };
        if (command === "ss") return { exitCode: 0, stdout: "LISTEN 0 4096 127.0.0.1:18443 0.0.0.0:*" };
        throw new Error("unexpected synthetic command");
      },
      now: () => new Date("2026-09-08T02:00:00.000Z")
    });
  }
  try {
    assert.equal(createAdapter().applyCredentialReconciliation(payload()).status, "applied");
    assert(existsSync(activeConfigPath));
    const before = readFileSync(activeConfigPath);
    const activeIdentity = statSync(activeConfigPath);
    const candidateIdentity = statSync(candidateConfigPath);
    const backupNames = readdirSync(backupDir);
    calls.length = 0;
    const receipt = createAdapter().applyCredentialReconciliation(payload());
    assert.equal(receipt.status, "unchanged");
    assert.equal(receipt.mutation, false);
    assert.equal(receipt.service.restarted, false);
    assert.deepEqual(readFileSync(activeConfigPath), before);
    assert.equal(statSync(activeConfigPath).ino, activeIdentity.ino);
    assert.equal(statSync(candidateConfigPath).ino, candidateIdentity.ino);
    for (const field of ["mtimeMs", "ctimeMs", "size"]) {
      assert.equal(statSync(activeConfigPath)[field], activeIdentity[field]);
      assert.equal(statSync(candidateConfigPath)[field], candidateIdentity[field]);
    }
    assert.deepEqual(readdirSync(backupDir), backupNames);
    assert.deepEqual(calls.filter(([command]) => command === "xray"), [["xray", "run", "-test", "-config", activeConfigPath]]);
    assert.equal(calls.some(([command, action]) => command === "systemctl" && action === "restart"), false);
    assert(calls.some(([command, action]) => command === "systemctl" && action === "is-active"));
    assert(calls.some(([command]) => command === "ss"));
  } finally {
    removeOwnedFixture(root);
  }
});

test("Xray host idempotency rejects a directory in place of active config without mutation", () => {
  const root = mkdtempSync(join(tmpdir(), "xray-idempotency-test-"));
  const activeConfigPath = join(root, "config.json");
  const candidateConfigPath = join(root, "candidate.json");
  const backupDir = join(root, "backups");
  try {
    mkdirSync(activeConfigPath);
    const adapter = createXrayVlessRealityHostRuntimeAdapter({
      activeConfigPath, candidateConfigPath, backupDir,
      listener: listenerConfig(),
      resolveCredentialMaterial: () => ({ uuid: "11111111-1111-4111-8111-111111111111" }),
      commandRunner() { throw new Error("invalid active path must not reach commands"); }
    });
    const receipt = adapter.applyCredentialReconciliation(payload());
    assert.equal(receipt.status, "failed");
    assert.equal(receipt.mutation, false);
    assert.equal(statSync(activeConfigPath).isDirectory(), true);
    assert.equal(existsSync(candidateConfigPath), false);
    assert.equal(existsSync(backupDir), false);
  } finally {
    removeOwnedFixture(root);
  }
});

test("Xray host idempotency does not treat disk replacement plus a failed restart as loaded", () => {
  const root = mkdtempSync(join(tmpdir(), "xray-idempotency-test-"));
  const activeConfigPath = join(root, "config.json");
  const candidateConfigPath = join(root, "candidate.json");
  const backupDir = join(root, "backups");
  let restartCount = 0;
  let startedAt = "Thu 1970-01-01 00:00:01.000000 UTC";
  try {
    const adapter = createXrayVlessRealityHostRuntimeAdapter({
      activeConfigPath, candidateConfigPath, backupDir,
      listener: listenerConfig(),
      resolveCredentialMaterial: () => ({ uuid: "11111111-1111-4111-8111-111111111111" }),
      commandRunner(command, args) {
        if (command === "systemctl" && args[0] === "restart") {
          restartCount += 1;
          if (restartCount === 1) return { exitCode: 1 };
          startedAt = syntheticSystemdStartAfterFile(activeConfigPath);
          return { exitCode: 0 };
        }
        if (command === "systemctl" && args[0] === "show") {
          return { exitCode: 0, stdout: `ActiveState=active\nMainPID=4321\nExecMainStartTimestamp=${startedAt}\n` };
        }
        if (command === "xray" || command === "systemctl") return { exitCode: 0 };
        if (command === "ss") return { exitCode: 0, stdout: "LISTEN 0 4096 127.0.0.1:18443 0.0.0.0:*" };
        throw new Error("unexpected synthetic command");
      }
    });
    const first = adapter.applyCredentialReconciliation(payload());
    assert.equal(first.status, "failed");
    assert.equal(first.mutation, true);
    const replacedContent = readFileSync(activeConfigPath, "utf8");
    const second = adapter.applyCredentialReconciliation(payload());
    assert.equal(second.status, "applied");
    assert.equal(second.mutation, true);
    assert.equal(restartCount, 2);
    assert.equal(readFileSync(activeConfigPath, "utf8"), replacedContent);
    const third = adapter.applyCredentialReconciliation(payload());
    assert.equal(third.status, "unchanged");
    assert.equal(third.mutation, false);
    assert.equal(restartCount, 2);
  } finally {
    removeOwnedFixture(root);
  }
});

for (const [name, show, expectedStatus] of [
  ["show command fails", () => ({ exitCode: 1, stdout: "" }), "failed"],
  ["show identity fields are missing", () => ({ exitCode: 0, stdout: "ActiveState=active\n" }), "failed"],
  ["show timestamp format is unsupported", () => ({ exitCode: 0, stdout: "ActiveState=active\nMainPID=4321\nExecMainStartTimestamp=2099-01-01\n" }), "failed"],
  ["show timestamp is not a valid date", () => ({ exitCode: 0, stdout: "ActiveState=active\nMainPID=4321\nExecMainStartTimestamp=Tue 2099-99-99 00:00:00.000001 UTC\n" }), "failed"],
  ["show reports an older process", () => ({ exitCode: 0, stdout: "ActiveState=active\nMainPID=4321\nExecMainStartTimestamp=Thu 1970-01-01 00:00:01.000000 UTC\n" }), "applied"],
  ["show reports a known inactive state", () => ({ exitCode: 0, stdout: "ActiveState=inactive\nMainPID=0\nExecMainStartTimestamp=\n" }), "applied"],
  ["show proves a newer stable process", (path) => ({ exitCode: 0, stdout: `ActiveState=active\nMainPID=4321\nExecMainStartTimestamp=${syntheticSystemdStartAfterFile(path)}\n` }), "unchanged"]
]) {
  test(`Xray host idempotency handles ${name} without assuming loaded state`, () => {
    const root = mkdtempSync(join(tmpdir(), "xray-idempotency-test-"));
    const activeConfigPath = join(root, "config.json");
    const candidateConfigPath = join(root, "candidate.json");
    const backupDir = join(root, "backups");
    const calls = [];
    let proof;
    try {
      const adapter = createXrayVlessRealityHostRuntimeAdapter({
        activeConfigPath, candidateConfigPath, backupDir,
        listener: listenerConfig(),
        resolveCredentialMaterial: () => ({ uuid: "11111111-1111-4111-8111-111111111111" }),
        commandRunner(command, args) {
          calls.push([command, ...args]);
          if (command === "systemctl" && args[0] === "show") return proof;
          if (command === "xray" || command === "systemctl") return { exitCode: 0 };
          if (command === "ss") return { exitCode: 0, stdout: "LISTEN 0 4096 127.0.0.1:18443 0.0.0.0:*" };
          throw new Error("unexpected synthetic command");
        }
      });
      assert.equal(adapter.applyCredentialReconciliation(payload()).status, "applied");
      const before = statSync(activeConfigPath);
      const candidateBefore = statSync(candidateConfigPath);
      const backupsBefore = readdirSync(backupDir);
      proof = show(activeConfigPath);
      calls.length = 0;
      const receipt = adapter.applyCredentialReconciliation(payload());
      assert.equal(receipt.status, expectedStatus);
      if (expectedStatus === "applied") {
        assert.equal(receipt.mutation, true);
        assert.equal(calls.filter(([command, action]) => command === "systemctl" && action === "restart").length, 1);
        assert.deepEqual(calls.filter(([command]) => command === "xray"), [["xray", "run", "-test", "-config", candidateConfigPath]]);
      } else {
        assert.equal(receipt.mutation, false);
        assert.equal(calls.some(([command, action]) => command === "systemctl" && action === "restart"), false);
        for (const field of ["ino", "mtimeMs", "ctimeMs", "size"]) {
          assert.equal(statSync(activeConfigPath)[field], before[field]);
          assert.equal(statSync(candidateConfigPath)[field], candidateBefore[field]);
        }
        assert.deepEqual(readdirSync(backupDir), backupsBefore);
        assert.deepEqual(calls.filter(([command]) => command === "xray"), expectedStatus === "unchanged"
          ? [["xray", "run", "-test", "-config", activeConfigPath]] : []);
      }
    } finally {
      removeOwnedFixture(root);
    }
  });
}

test("Xray host idempotency fails without writes if config changes inside the first process proof", () => {
  const root = mkdtempSync(join(tmpdir(), "xray-idempotency-test-"));
  const activeConfigPath = join(root, "config.json");
  const candidateConfigPath = join(root, "candidate.json");
  const backupDir = join(root, "backups");
  const calls = [];
  let simulateRace = false;
  try {
    const adapter = createXrayVlessRealityHostRuntimeAdapter({
      activeConfigPath, candidateConfigPath, backupDir,
      listener: listenerConfig(),
      resolveCredentialMaterial: () => ({ uuid: "11111111-1111-4111-8111-111111111111" }),
      commandRunner(command, args) {
        calls.push([command, ...args]);
        if (command === "systemctl" && args[0] === "show") {
          const startedAt = syntheticSystemdStartAfterFile(activeConfigPath);
          if (simulateRace) writeFileSync(activeConfigPath, "{}\n");
          return { exitCode: 0, stdout: `ActiveState=active\nMainPID=4321\nExecMainStartTimestamp=${startedAt}\n` };
        }
        if (command === "xray" || command === "systemctl") return { exitCode: 0 };
        if (command === "ss") return { exitCode: 0, stdout: "LISTEN 0 4096 127.0.0.1:18443 0.0.0.0:*" };
        throw new Error("unexpected synthetic command");
      }
    });
    assert.equal(adapter.applyCredentialReconciliation(payload()).status, "applied");
    const candidateBefore = statSync(candidateConfigPath);
    const backupsBefore = readdirSync(backupDir);
    simulateRace = true;
    calls.length = 0;
    const receipt = adapter.applyCredentialReconciliation(payload());
    assert.equal(receipt.status, "failed");
    assert.equal(receipt.mutation, false);
    assert.equal(readFileSync(activeConfigPath, "utf8"), "{}\n", "the adapter must not overwrite the simulated concurrent writer");
    for (const field of ["ino", "mtimeMs", "ctimeMs", "size"]) {
      assert.equal(statSync(candidateConfigPath)[field], candidateBefore[field]);
    }
    assert.deepEqual(readdirSync(backupDir), backupsBefore);
    assert.equal(calls.some(([command]) => command === "xray"), false);
    assert.equal(calls.some(([command, action]) => command === "systemctl" && action === "restart"), false);
  } finally {
    removeOwnedFixture(root);
  }
});

for (const [name, commandToFail, healthExitCode, expectedStatus] of [
  ["service probe exit 1", "service", 1, "failed"],
  ["service probe exit 4", "service", 4, "failed"],
  ["listener probe exit 1", "listener", 1, "failed"],
  ["service is explicitly inactive", "service", 3, "applied"]
]) {
  test(`Xray host idempotency handles ${name} without turning uncertainty into a restart`, () => {
    const root = mkdtempSync(join(tmpdir(), "xray-idempotency-test-"));
    const activeConfigPath = join(root, "config.json");
    const candidateConfigPath = join(root, "candidate.json");
    const backupDir = join(root, "backups");
    const calls = [];
    let simulateHealthFailure = false;
    let startedAt;
    try {
      const adapter = createXrayVlessRealityHostRuntimeAdapter({
        activeConfigPath, candidateConfigPath, backupDir,
        listener: listenerConfig(),
        resolveCredentialMaterial: () => ({ uuid: "11111111-1111-4111-8111-111111111111" }),
        commandRunner(command, args) {
          calls.push([command, ...args]);
          if (command === "systemctl" && args[0] === "restart") {
            simulateHealthFailure = false;
            startedAt = syntheticSystemdStartAfterFile(activeConfigPath);
            return { exitCode: 0 };
          }
          if (command === "systemctl" && args[0] === "show") {
            return { exitCode: 0, stdout: `ActiveState=active\nMainPID=4321\nExecMainStartTimestamp=${startedAt}\n` };
          }
          if (command === "systemctl" && args[0] === "is-active") {
            return { exitCode: simulateHealthFailure && commandToFail === "service" ? healthExitCode : 0 };
          }
          if (command === "ss") {
            return simulateHealthFailure && commandToFail === "listener"
              ? { exitCode: healthExitCode }
              : { exitCode: 0, stdout: "LISTEN 0 4096 127.0.0.1:18443 0.0.0.0:*" };
          }
          if (command === "xray") return { exitCode: 0 };
          throw new Error("unexpected synthetic command");
        }
      });
      assert.equal(adapter.applyCredentialReconciliation(payload()).status, "applied");
      const before = statSync(activeConfigPath);
      const candidateBefore = statSync(candidateConfigPath);
      const backupsBefore = readdirSync(backupDir);
      simulateHealthFailure = true;
      calls.length = 0;
      const receipt = adapter.applyCredentialReconciliation(payload());
      assert.equal(receipt.status, expectedStatus);
      assert.equal(receipt.mutation, expectedStatus === "applied");
      if (expectedStatus === "failed") {
        assert.equal(calls.some(([command]) => command === "xray"), false);
        assert.equal(calls.some(([command, action]) => command === "systemctl" && action === "restart"), false);
        for (const field of ["ino", "mtimeMs", "ctimeMs", "size"]) {
          assert.equal(statSync(activeConfigPath)[field], before[field]);
          assert.equal(statSync(candidateConfigPath)[field], candidateBefore[field]);
        }
        assert.deepEqual(readdirSync(backupDir), backupsBefore);
      } else {
        assert.equal(calls.filter(([command, action]) => command === "systemctl" && action === "restart").length, 1);
        assert.equal(calls.some(([command, action]) => command === "systemctl" && action === "show"), false);
      }
    } finally {
      removeOwnedFixture(root);
    }
  });
}
