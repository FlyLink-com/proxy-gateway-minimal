import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  activateWelcomeCoins,
  deactivateWelcomeCoins,
  preflightWelcomeCoinsActivation,
  verifyWelcomeCoinsActivation,
  verifyWelcomeCoinsDeactivation
} from "../../scripts/control-plane-welcome-coins-activation-gate.mjs";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SCRIPT_PATH = resolve(
  REPOSITORY_ROOT,
  "scripts/control-plane-welcome-coins-activation-gate.mjs"
);
const RELEASE = "control-plane-welcome-coins-gate-test";
const DIGEST = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const BASE_ENVIRONMENT = [
  "USER_PORTAL_ROUTES_ENABLED=true",
  "COINS_WALLET_ENABLED=true",
  "COINS_COMMERCE_ENABLED=true",
  "UNRELATED_PRESERVED_VALUE=still-private"
].join("\n") + "\n";

function guardedState(identity = "test-guard-1") {
  return {
    activeState: "inactive",
    loadState: "loaded",
    needDaemonReload: "no",
    runtimeConditionStartGuard: true,
    runtimeConditionStartGuardIdentity: identity
  };
}

function fixture(t, environment = BASE_ENVIRONMENT) {
  const root = mkdtempSync(join(tmpdir(), "gccgw-welcome-coins-gate-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const releasePath = join(root, "releases", RELEASE);
  const currentLink = join(root, "current");
  const environmentPath = join(releasePath, ".env");
  mkdirSync(releasePath, { recursive: true, mode: 0o700 });
  writeFileSync(environmentPath, environment, { mode: 0o600 });
  chmodSync(environmentPath, 0o600);
  try {
    symlinkSync(releasePath, currentLink, process.platform === "win32" ? "junction" : "dir");
  } catch {
    t.skip("current symlink creation is unavailable");
    return null;
  }
  return { root, releasePath, currentLink, environmentPath };
}

function preflightArgs(paths) {
  return {
    currentLink: paths.currentLink,
    deploymentRoot: paths.root,
    expectedRelease: RELEASE
  };
}

function runCli(args, input = "") {
  return spawnSync(process.execPath, [SCRIPT_PATH, ...args], {
    cwd: REPOSITORY_ROOT,
    encoding: "utf8",
    input
  });
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

test("preflight accepts an unconfigured current environment without exposing its content or path", (t) => {
  const paths = fixture(t);
  if (!paths) return;

  const report = preflightWelcomeCoinsActivation(preflightArgs(paths));

  assert.equal(report.mode, "preflight");
  assert.equal(report.state, "ready");
  assert.equal(report.applied, false);
  assert.equal(report.release, RELEASE);
  assert.equal(report.currentPointerMatchesExpected, true);
  if (process.platform !== "win32") {
    assert.equal(report.environment.mode, "0600");
  }
  assert.equal(report.basePrerequisitesReady, true);
  assert.equal(report.safetyFlagsDefaultOff, true);
  assert.equal(report.canaryDigestAccepted, false);
  const serialized = JSON.stringify(report);
  assert.equal(serialized.includes(paths.root), false);
  assert.equal(serialized.includes("still-private"), false);
  assert.equal(serialized.includes(DIGEST), false);
  assert.equal(readFileSync(paths.environmentPath, "utf8"), BASE_ENVIRONMENT);
});

test("activate atomically appends only the two allowlisted keys, preserves non-target bytes, and verifies", (t) => {
  const paths = fixture(t);
  if (!paths) return;
  const preflight = preflightWelcomeCoinsActivation(preflightArgs(paths));
  const before = readFileSync(paths.environmentPath);

  const activated = activateWelcomeCoins({
    ...preflightArgs(paths),
    expectedEnvSha256: preflight.environment.sha256,
    canaryDigest: DIGEST,
    apply: true,
    guardReader: () => guardedState()
  });
  const after = readFileSync(paths.environmentPath);

  assert.equal(activated.mode, "activate");
  assert.equal(activated.state, "activated");
  assert.equal(activated.applied, true);
  assert.equal(activated.startGuarded, true);
  assert.equal(activated.serviceState, "inactive");
  assert.equal(activated.canaryDigestAccepted, true);
  assert.deepEqual(after.subarray(0, before.length), before);
  assert.equal(
    after.toString("utf8"),
    BASE_ENVIRONMENT
      + "USER_PORTAL_REGISTRATION_WELCOME_COINS_ENABLED=true\n"
      + "USER_PORTAL_REGISTRATION_WELCOME_COINS_CANARY_EMAIL_HASHES=" + DIGEST + "\n"
  );
  assert.equal(JSON.stringify(activated).includes(DIGEST), false);
  assert.equal(JSON.stringify(activated).includes("still-private"), false);
  if (process.platform !== "win32") {
    assert.equal(statSync(paths.environmentPath).mode & 0o777, 0o600);
  }

  const verified = verifyWelcomeCoinsActivation({
    ...preflightArgs(paths),
    expectedEnvSha256: activated.environment.sha256,
    guardReader: () => guardedState()
  });
  assert.equal(verified.state, "verified");
  assert.equal(verified.applied, false);
  assert.equal(verified.canaryDigestAccepted, true);
  assert.equal(JSON.stringify(verified).includes(DIGEST), false);

  const idempotent = activateWelcomeCoins({
    ...preflightArgs(paths),
    expectedEnvSha256: activated.environment.sha256,
    canaryDigest: DIGEST,
    apply: true,
    guardReader: () => guardedState()
  });
  assert.equal(idempotent.state, "already_active");
  assert.equal(idempotent.applied, false);

  writeFileSync(paths.environmentPath, Buffer.concat([
    after,
    Buffer.from("UNRELATED_DRIFT=true\n", "utf8")
  ]));
  chmodSync(paths.environmentPath, 0o600);
  const drifted = readFileSync(paths.environmentPath);
  assert.throws(
    () => activateWelcomeCoins({
      ...preflightArgs(paths),
      expectedEnvSha256: activated.environment.sha256,
      canaryDigest: DIGEST,
      apply: true,
      guardReader: () => guardedState()
    }),
    (error) => error?.condition === "env_identity_mismatch"
  );
  assert.deepEqual(readFileSync(paths.environmentPath), drifted);
});

test("activation rejects stale environment identity and leaves the protected environment unchanged", (t) => {
  const paths = fixture(t);
  if (!paths) return;
  const preflight = preflightWelcomeCoinsActivation(preflightArgs(paths));
  writeFileSync(paths.environmentPath, BASE_ENVIRONMENT + "UNRELATED_CHANGE=true\n");
  chmodSync(paths.environmentPath, 0o600);
  const before = readFileSync(paths.environmentPath);

  assert.throws(
    () => activateWelcomeCoins({
      ...preflightArgs(paths),
      expectedEnvSha256: preflight.environment.sha256,
      canaryDigest: DIGEST,
      apply: true,
      guardReader: () => guardedState()
    }),
    (error) => error?.condition === "env_identity_mismatch"
  );
  assert.deepEqual(readFileSync(paths.environmentPath), before);
});

test("activation preserves an existing CRLF environment prefix and its line-ending convention", (t) => {
  const original = BASE_ENVIRONMENT.replace(/\n/gu, "\r\n");
  const paths = fixture(t, original);
  if (!paths) return;
  const preflight = preflightWelcomeCoinsActivation(preflightArgs(paths));

  activateWelcomeCoins({
    ...preflightArgs(paths),
    expectedEnvSha256: preflight.environment.sha256,
    canaryDigest: DIGEST,
    apply: true,
    guardReader: () => guardedState()
  });

  assert.equal(
    readFileSync(paths.environmentPath, "utf8"),
    original
      + "USER_PORTAL_REGISTRATION_WELCOME_COINS_ENABLED=true\r\n"
      + "USER_PORTAL_REGISTRATION_WELCOME_COINS_CANARY_EMAIL_HASHES=" + DIGEST + "\r\n"
  );
});

test("deactivation restores the exact preflight bytes for LF, CRLF, and no-final-newline environments", (t) => {
  const originals = [
    BASE_ENVIRONMENT,
    BASE_ENVIRONMENT.replace(/\n/gu, "\r\n"),
    BASE_ENVIRONMENT.slice(0, -1)
  ];

  for (const original of originals) {
    const paths = fixture(t, original);
    if (!paths) return;
    const preflight = preflightWelcomeCoinsActivation(preflightArgs(paths));
    const activated = activateWelcomeCoins({
      ...preflightArgs(paths),
      expectedEnvSha256: preflight.environment.sha256,
      canaryDigest: DIGEST,
      apply: true,
      guardReader: () => guardedState()
    });

    const deactivated = deactivateWelcomeCoins({
      ...preflightArgs(paths),
      expectedEnvSha256: activated.environment.sha256,
      expectedDisabledEnvSha256: preflight.environment.sha256,
      apply: true,
      guardReader: () => guardedState()
    });

    assert.equal(deactivated.mode, "deactivate");
    assert.equal(deactivated.state, "deactivated");
    assert.equal(deactivated.applied, true);
    assert.equal(deactivated.canaryDigestAccepted, false);
    assert.equal(deactivated.environment.sha256, preflight.environment.sha256);
    assert.deepEqual(readFileSync(paths.environmentPath), Buffer.from(original));
    assert.equal(JSON.stringify(deactivated).includes(DIGEST), false);

    const verified = verifyWelcomeCoinsDeactivation({
      ...preflightArgs(paths),
      expectedEnvSha256: preflight.environment.sha256,
      guardReader: () => guardedState()
    });
    assert.equal(verified.mode, "verify-disabled");
    assert.equal(verified.state, "disabled_verified");
    assert.equal(verified.applied, false);

    const idempotent = deactivateWelcomeCoins({
      ...preflightArgs(paths),
      expectedEnvSha256: preflight.environment.sha256,
      expectedDisabledEnvSha256: preflight.environment.sha256,
      apply: true,
      guardReader: () => guardedState()
    });
    assert.equal(idempotent.state, "already_disabled");
    assert.equal(idempotent.applied, false);
  }
});

test("deactivation rejects stale or noncanonical active state without rewriting it", (t) => {
  const paths = fixture(t);
  if (!paths) return;
  const preflight = preflightWelcomeCoinsActivation(preflightArgs(paths));
  const activated = activateWelcomeCoins({
    ...preflightArgs(paths),
    expectedEnvSha256: preflight.environment.sha256,
    canaryDigest: DIGEST,
    apply: true,
    guardReader: () => guardedState()
  });
  const activeBytes = readFileSync(paths.environmentPath);

  assert.throws(
    () => deactivateWelcomeCoins({
      ...preflightArgs(paths),
      expectedEnvSha256: "b".repeat(64),
      expectedDisabledEnvSha256: preflight.environment.sha256,
      apply: true,
      guardReader: () => guardedState()
    }),
    (error) => error?.condition === "env_identity_mismatch"
  );
  assert.deepEqual(readFileSync(paths.environmentPath), activeBytes);

  assert.throws(
    () => deactivateWelcomeCoins({
      ...preflightArgs(paths),
      expectedEnvSha256: activated.environment.sha256,
      expectedDisabledEnvSha256: "c".repeat(64),
      apply: true,
      guardReader: () => guardedState()
    }),
    (error) => error?.condition === "env_identity_mismatch"
  );
  assert.deepEqual(readFileSync(paths.environmentPath), activeBytes);

  const drifted = Buffer.concat([activeBytes, Buffer.from("# appended drift\n")]);
  writeFileSync(paths.environmentPath, drifted);
  chmodSync(paths.environmentPath, 0o600);
  assert.throws(
    () => deactivateWelcomeCoins({
      ...preflightArgs(paths),
      expectedEnvSha256: sha256(drifted),
      expectedDisabledEnvSha256: preflight.environment.sha256,
      apply: true,
      guardReader: () => guardedState()
    }),
    (error) => error?.condition === "target_key_conflict"
  );
  assert.deepEqual(readFileSync(paths.environmentPath), drifted);
  assert.notEqual(activated.environment.sha256, sha256(drifted));
});

test("deactivation rejects partial, duplicate, reordered, or truncated active suffixes", (t) => {
  const activeFlag = "USER_PORTAL_REGISTRATION_WELCOME_COINS_ENABLED=true\n";
  const activeDigest = "USER_PORTAL_REGISTRATION_WELCOME_COINS_CANARY_EMAIL_HASHES=" + DIGEST + "\n";
  const cases = [
    activeFlag,
    activeDigest,
    activeFlag + activeDigest + activeDigest,
    activeDigest + activeFlag,
    activeFlag + activeDigest.slice(0, -1),
    activeFlag.replace("=true", "=false") + activeDigest
  ];

  for (const suffix of cases) {
    const current = BASE_ENVIRONMENT + suffix;
    const paths = fixture(t, current);
    if (!paths) return;
    const before = readFileSync(paths.environmentPath);
    assert.throws(
      () => deactivateWelcomeCoins({
        ...preflightArgs(paths),
        expectedEnvSha256: sha256(before),
        expectedDisabledEnvSha256: sha256(Buffer.from(BASE_ENVIRONMENT)),
        apply: true,
        guardReader: () => guardedState()
      }),
      (error) => error?.condition === "target_key_conflict"
    );
    assert.deepEqual(readFileSync(paths.environmentPath), before);
  }
});

test("deactivation refuses pre-publication environment or guard CAS drift without rewriting", (t) => {
  const paths = fixture(t);
  if (!paths) return;
  const preflight = preflightWelcomeCoinsActivation(preflightArgs(paths));
  const activated = activateWelcomeCoins({
    ...preflightArgs(paths),
    expectedEnvSha256: preflight.environment.sha256,
    canaryDigest: DIGEST,
    apply: true,
    guardReader: () => guardedState()
  });
  const activeBytes = readFileSync(paths.environmentPath);
  const drifted = Buffer.concat([activeBytes, Buffer.from("UNRELATED_CAS_DRIFT=true\n")]);
  let envCalls = 0;

  assert.throws(
    () => deactivateWelcomeCoins({
      ...preflightArgs(paths),
      expectedEnvSha256: activated.environment.sha256,
      expectedDisabledEnvSha256: preflight.environment.sha256,
      apply: true,
      guardReader: () => {
        envCalls += 1;
        if (envCalls === 1) {
          writeFileSync(paths.environmentPath, drifted);
          chmodSync(paths.environmentPath, 0o600);
        }
        return guardedState();
      }
    }),
    (error) => error?.condition === "env_identity_mismatch"
  );
  assert.deepEqual(readFileSync(paths.environmentPath), drifted);

  writeFileSync(paths.environmentPath, activeBytes);
  chmodSync(paths.environmentPath, 0o600);
  let guardCalls = 0;
  assert.throws(
    () => deactivateWelcomeCoins({
      ...preflightArgs(paths),
      expectedEnvSha256: activated.environment.sha256,
      expectedDisabledEnvSha256: preflight.environment.sha256,
      apply: true,
      guardReader: () => {
        guardCalls += 1;
        return guardedState(guardCalls >= 2 ? "changed-guard" : "original-guard");
      }
    }),
    (error) => error?.condition === "service_start_guard_changed"
  );
  assert.deepEqual(readFileSync(paths.environmentPath), activeBytes);
});

test("deactivation requires a stable inactive start guard and leaves a published disabled state for attention", (t) => {
  const paths = fixture(t);
  if (!paths) return;
  const preflight = preflightWelcomeCoinsActivation(preflightArgs(paths));
  const activated = activateWelcomeCoins({
    ...preflightArgs(paths),
    expectedEnvSha256: preflight.environment.sha256,
    canaryDigest: DIGEST,
    apply: true,
    guardReader: () => guardedState()
  });
  const activeBytes = readFileSync(paths.environmentPath);

  assert.throws(
    () => deactivateWelcomeCoins({
      ...preflightArgs(paths),
      expectedEnvSha256: activated.environment.sha256,
      expectedDisabledEnvSha256: preflight.environment.sha256,
      apply: true,
      guardReader: () => ({ ...guardedState(), activeState: "active" })
    }),
    (error) => error?.condition === "service_start_guard_invalid"
  );
  assert.deepEqual(readFileSync(paths.environmentPath), activeBytes);

  let calls = 0;
  assert.throws(
    () => deactivateWelcomeCoins({
      ...preflightArgs(paths),
      expectedEnvSha256: activated.environment.sha256,
      expectedDisabledEnvSha256: preflight.environment.sha256,
      apply: true,
      guardReader: () => {
        calls += 1;
        return guardedState(calls >= 3 ? "changed-guard" : "original-guard");
      }
    }),
    (error) => error?.message === "attention_required"
  );
  assert.deepEqual(readFileSync(paths.environmentPath), Buffer.from(BASE_ENVIRONMENT));
});

test("disabled verification rejects active state, stale identity, and missing guard without writes", (t) => {
  const paths = fixture(t);
  if (!paths) return;
  const preflight = preflightWelcomeCoinsActivation(preflightArgs(paths));
  const original = readFileSync(paths.environmentPath);

  assert.throws(
    () => verifyWelcomeCoinsDeactivation({
      ...preflightArgs(paths),
      expectedEnvSha256: "d".repeat(64),
      guardReader: () => guardedState()
    }),
    (error) => error?.condition === "env_identity_mismatch"
  );
  assert.throws(
    () => verifyWelcomeCoinsDeactivation({
      ...preflightArgs(paths),
      expectedEnvSha256: preflight.environment.sha256,
      guardReader: () => ({ ...guardedState(), runtimeConditionStartGuard: false })
    }),
    (error) => error?.condition === "service_start_guard_invalid"
  );
  assert.deepEqual(readFileSync(paths.environmentPath), original);

  const activated = activateWelcomeCoins({
    ...preflightArgs(paths),
    expectedEnvSha256: preflight.environment.sha256,
    canaryDigest: DIGEST,
    apply: true,
    guardReader: () => guardedState()
  });
  const activeBytes = readFileSync(paths.environmentPath);
  assert.throws(
    () => verifyWelcomeCoinsDeactivation({
      ...preflightArgs(paths),
      expectedEnvSha256: activated.environment.sha256,
      guardReader: () => guardedState()
    }),
    (error) => error?.condition === "target_key_conflict"
  );
  assert.deepEqual(readFileSync(paths.environmentPath), activeBytes);
});

test("target-key drift, duplicate definitions, and noncanonical disabled values fail closed", (t) => {
  const cases = [
    "USER_PORTAL_REGISTRATION_WELCOME_COINS_ENABLED=false\n",
    "USER_PORTAL_REGISTRATION_WELCOME_COINS_CANARY_EMAIL_HASHES=\n",
    "USER_PORTAL_REGISTRATION_WELCOME_COINS_ENABLED=true\n"
      + "USER_PORTAL_REGISTRATION_WELCOME_COINS_ENABLED=false\n",
    "export USER_PORTAL_REGISTRATION_WELCOME_COINS_CANARY_EMAIL_HASHES=raw@example.test\n"
  ];
  for (const addition of cases) {
    const paths = fixture(t, BASE_ENVIRONMENT + addition);
    if (!paths) return;
    assert.throws(
      () => preflightWelcomeCoinsActivation(preflightArgs(paths)),
      (error) => error?.condition === "target_key_conflict"
    );
  }
});

test("activation checks base prerequisites and the four unrelated safety flags without changing the environment", (t) => {
  const cases = [
    ["base", BASE_ENVIRONMENT.replace("COINS_WALLET_ENABLED=true", "COINS_WALLET_ENABLED=false"), "base_prerequisites_not_ready"],
    ["wallet-first", BASE_ENVIRONMENT + "USER_PORTAL_WALLET_FIRST_MODEL_ENABLED=true\n", "safety_flags_not_default_off"],
    ["deferred", BASE_ENVIRONMENT + "COINS_COMMERCE_DEFERRED_TRANSITION_RUNTIME_ENABLED=true\n", "safety_flags_not_default_off"],
    ["setup", BASE_ENVIRONMENT + "USER_PORTAL_WALLET_FIRST_SETUP_DELIVERY_ENABLED=true\n", "safety_flags_not_default_off"],
    ["authority", BASE_ENVIRONMENT + "COINS_COMMERCE_ACCOUNT_RESOURCE_AUTHORITY_ENABLED=true\n", "safety_flags_not_default_off"]
  ];
  for (const [, environment, condition] of cases) {
    const paths = fixture(t, environment);
    if (!paths) return;
    const before = readFileSync(paths.environmentPath);
    assert.throws(
      () => preflightWelcomeCoinsActivation(preflightArgs(paths)),
      (error) => error?.condition === condition
    );
    assert.deepEqual(readFileSync(paths.environmentPath), before);
  }
});

test("activation refuses an inactive-service guard failure before writing", (t) => {
  const paths = fixture(t);
  if (!paths) return;
  const preflight = preflightWelcomeCoinsActivation(preflightArgs(paths));
  const before = readFileSync(paths.environmentPath);

  assert.throws(
    () => activateWelcomeCoins({
      ...preflightArgs(paths),
      expectedEnvSha256: preflight.environment.sha256,
      canaryDigest: DIGEST,
      apply: true,
      guardReader: () => ({ ...guardedState(), activeState: "active" })
    }),
    (error) => error?.condition === "service_start_guard_invalid"
  );
  assert.deepEqual(readFileSync(paths.environmentPath), before);
});

test("a guard identity change after atomic publication requires attention instead of an automatic rewrite", (t) => {
  const paths = fixture(t);
  if (!paths) return;
  const preflight = preflightWelcomeCoinsActivation(preflightArgs(paths));
  let calls = 0;

  assert.throws(
    () => activateWelcomeCoins({
      ...preflightArgs(paths),
      expectedEnvSha256: preflight.environment.sha256,
      canaryDigest: DIGEST,
      apply: true,
      guardReader: () => {
        calls += 1;
        return guardedState(calls >= 3 ? "changed-guard" : "original-guard");
      }
    }),
    (error) => error?.message === "attention_required"
  );
  assert.match(
    readFileSync(paths.environmentPath, "utf8"),
    /USER_PORTAL_REGISTRATION_WELCOME_COINS_ENABLED=true/
  );
});

test("verify rejects a malformed or changed activation state without writing", (t) => {
  const paths = fixture(
    t,
    BASE_ENVIRONMENT
      + "USER_PORTAL_REGISTRATION_WELCOME_COINS_ENABLED=true\n"
      + "USER_PORTAL_REGISTRATION_WELCOME_COINS_CANARY_EMAIL_HASHES=not-a-digest\n"
  );
  if (!paths) return;
  const before = readFileSync(paths.environmentPath);
  const arbitraryHash = "b".repeat(64);

  assert.throws(
    () => verifyWelcomeCoinsActivation({
      ...preflightArgs(paths),
      expectedEnvSha256: arbitraryHash,
      guardReader: () => guardedState()
    }),
    (error) => error?.condition === "target_key_conflict"
  );
  assert.deepEqual(readFileSync(paths.environmentPath), before);
});

test("gate rejects a non-link current path and a symlinked environment without writes", {
  skip: process.platform === "win32" ? "symlink checks are not portable on Windows" : false
}, (t) => {
  const paths = fixture(t);
  if (!paths) return;
  const before = readFileSync(paths.environmentPath);
  const plainCurrent = join(paths.root, "plain-current");
  mkdirSync(plainCurrent);
  assert.throws(
    () => preflightWelcomeCoinsActivation({
      currentLink: plainCurrent,
      deploymentRoot: paths.root,
      expectedRelease: RELEASE
    }),
    (error) => error?.condition === "current_release_mismatch"
  );

  const externalEnvironment = join(paths.root, "external.env");
  writeFileSync(externalEnvironment, "external-private-content\n");
  rmSync(paths.environmentPath);
  symlinkSync(externalEnvironment, paths.environmentPath);
  assert.equal(lstatSync(paths.environmentPath).isSymbolicLink(), true);
  assert.throws(
    () => preflightWelcomeCoinsActivation(preflightArgs(paths)),
    (error) => error?.condition === "env_boundary_invalid"
  );
  assert.equal(readFileSync(externalEnvironment, "utf8"), "external-private-content\n");
  assert.notDeepEqual(readFileSync(externalEnvironment), before);
});

test("activation refuses a current pointer that leaves the trusted releases layout after preflight", {
  skip: process.platform === "win32" ? "symlink checks are not portable on Windows" : false
}, (t) => {
  const paths = fixture(t);
  if (!paths) return;
  const preflight = preflightWelcomeCoinsActivation(preflightArgs(paths));
  const expectedBefore = readFileSync(paths.environmentPath);
  const alternateRelease = join(paths.root, "outside", RELEASE);
  const alternateEnvironment = join(alternateRelease, ".env");
  mkdirSync(alternateRelease, { recursive: true, mode: 0o700 });
  writeFileSync(alternateEnvironment, BASE_ENVIRONMENT, { mode: 0o600 });
  chmodSync(alternateEnvironment, 0o600);
  rmSync(paths.currentLink);
  symlinkSync(alternateRelease, paths.currentLink);
  const alternateBefore = readFileSync(alternateEnvironment);

  assert.throws(
    () => activateWelcomeCoins({
      ...preflightArgs(paths),
      expectedEnvSha256: preflight.environment.sha256,
      canaryDigest: DIGEST,
      apply: true,
      guardReader: () => guardedState()
    }),
    (error) => error?.condition === "current_release_mismatch"
  );
  assert.deepEqual(readFileSync(paths.environmentPath), expectedBefore);
  assert.deepEqual(readFileSync(alternateEnvironment), alternateBefore);
});

test("CLI has a closed argument surface and never accepts a current pointer or canary digest in argv", () => {
  const result = runCli([
    "--mode", "activate",
    "--current-link", "/not-used/current",
    "--expected-release", RELEASE,
    "--expected-env-sha256", "c".repeat(64),
    "--canary-digest", DIGEST,
    "--apply"
  ]);

  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.deepEqual(JSON.parse(result.stderr), {
    schemaVersion: "1",
    type: "control_plane_welcome_coins_activation_gate",
    state: "blocked",
    condition: "invalid_input"
  });
  assert.equal(result.stderr.includes(DIGEST), false);
  assert.equal(result.stderr.includes("/not-used/current"), false);
});

test("package and runbook expose the narrow activation gate after snapshot and schema work", () => {
  const packageJson = JSON.parse(readFileSync(resolve(REPOSITORY_ROOT, "package.json"), "utf8"));
  const runbook = readFileSync(resolve(REPOSITORY_ROOT, "docs/GITHUB_DEPLOYMENT_RUNBOOK.md"), "utf8");

  assert.equal(
    packageJson.scripts["welcome-coins:activation:preflight"],
    "node scripts/control-plane-welcome-coins-activation-gate.mjs --mode preflight"
  );
  assert.equal(
    packageJson.scripts["welcome-coins:activation:apply"],
    "node scripts/control-plane-welcome-coins-activation-gate.mjs --mode activate --apply"
  );
  assert.equal(
    packageJson.scripts["welcome-coins:activation:verify"],
    "node scripts/control-plane-welcome-coins-activation-gate.mjs --mode verify"
  );
  assert.equal(
    packageJson.scripts["welcome-coins:activation:deactivate"],
    "node scripts/control-plane-welcome-coins-activation-gate.mjs --mode deactivate --apply"
  );
  assert.equal(
    packageJson.scripts["welcome-coins:activation:verify-disabled"],
    "node scripts/control-plane-welcome-coins-activation-gate.mjs --mode verify-disabled"
  );
  const activationIndex = runbook.indexOf("### Welcome Coins Admission Activation Gate");
  const snapshotIndex = runbook.indexOf("### Control-Plane Database Snapshot Gate");
  assert.ok(snapshotIndex >= 0);
  assert.ok(activationIndex > snapshotIndex);
  assert.match(runbook, /stdin-only/i);
  assert.match(runbook, /does not.*wallet-first.*deferred.*Authority.*payment/is);
  assert.match(runbook, /does not.*create.*snapshot.*apply.*schema.*start.*service/is);
  assert.match(runbook, /deactivate --apply.*verify-disabled/is);
});
