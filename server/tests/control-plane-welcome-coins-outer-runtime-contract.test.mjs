import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const REPOSITORY_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const TRANSACTION_CLI_PATH = resolve(
  REPOSITORY_ROOT,
  "scripts/control-plane-welcome-coins-activation-transaction-cli.mjs"
);
const OUTER_WRAPPER_SOURCE_PATH = resolve(
  REPOSITORY_ROOT,
  "scripts/native/welcome-coins-activation-outer-wrapper.c"
);
const OUTER_BOOTSTRAP_SOURCE_PATH = resolve(
  REPOSITORY_ROOT,
  "scripts/native/welcome-coins-outer-post-exec-bootstrap.c"
);

function requiredSource(path, label) {
  assert.equal(existsSync(path), true, `${label} source must exist`);
  return readFileSync(path, "utf8");
}

test("package scripts do not expose a production transaction entry", () => {
  const packageJson = JSON.parse(
    readFileSync(resolve(REPOSITORY_ROOT, "package.json"), "utf8")
  );
  assert.equal(
    Object.hasOwn(packageJson.scripts, "welcome-coins:activation:transaction"),
    false
  );
});

test("transaction CLI defers candidate imports until its read-only outer pre-import gate", () => {
  const cli = readFileSync(TRANSACTION_CLI_PATH, "utf8");

  const staticSpecifiers = [...cli.matchAll(
    /^\s*import(?:[\s\S]*?\sfrom\s*)?["']([^"']+)["'];/gmu
  )].map((match) => match[1]);
  assert.equal(staticSpecifiers.length > 0, true, "the pre-gate may use reviewed Node builtins");
  assert.equal(
    staticSpecifiers.every((specifier) => specifier.startsWith("node:")),
    true,
    "no local or third-party static import may run before the outer gate"
  );
  assert.doesNotMatch(cli, /^#!.*(?:\/usr\/bin\/env|\bnode\b)/mu);

  const preImportGate = /await\s+verifyWelcomeCoinsOuterRuntimeBeforeImport\s*\(/u.exec(cli);
  const candidateImport = /await\s+import\s*\(\s*["']\.\/scripts\/control-plane-welcome-coins-activation-gate-lib\.mjs["']\s*\)/u.exec(cli);
  assert.notEqual(preImportGate, null, "the inner CLI must run its read-only outer gate");
  assert.notEqual(candidateImport, null, "the activation library must be a dynamic import");
  assert.equal(
    preImportGate.index < candidateImport.index,
    true,
    "root/executable/envelope/artifact checks must finish before candidate import"
  );
});

test("static outer wrapper is a fixed no-argument root execve broker with a synthesized environment", () => {
  const source = requiredSource(OUTER_WRAPPER_SOURCE_PATH, "outer wrapper");

  assert.match(source, /int\s+main\s*\(\s*int\s+argc\s*,\s*char\s*\*\*\s*argv\s*\)/u);
  assert.match(source, /argc\s*!=\s*1/u);
  assert.match(source, /getresuid\s*\(/u);
  assert.match(source, /getresgid\s*\(/u);
  assert.match(source, /PR_SET_DUMPABLE/u);
  assert.match(source, /PR_SET_NO_NEW_PRIVS/u);
  assert.match(source, /\/proc\/self\/exe/u);
  assert.match(source, /fchdir\s*\(/u, "the eval module base must be the verified candidate root");
  assert.match(source, /#define\s+WELCOME_COINS_NODE_PATH\s+"\/usr\/bin\/node"/u);
  assert.match(
    source,
    /control-plane-welcome-coins-activation-transaction-cli\.mjs/u
  );
  assert.match(source, /WELCOME_COINS_EXECUTION_ENVELOPE_FD\s+3/u);
  assert.match(source, /transactionCliSha256/u);
  assert.match(source, /outerWrapperSha256/u);
  assert.match(source, /outerPostExecBootstrapSha256/u);
  assert.match(source, /nodeSha256/u);
  assert.match(source, /reject_environment_pollution/u);
  assert.match(source, /(?:clearenv\s*\(|clean_environment)/u);

  for (const name of [
    "LD_AUDIT",
    "LD_LIBRARY_PATH",
    "LD_DEBUG",
    "LD_PRELOAD",
    "NODE_OPTIONS",
    "NODE_PATH"
  ]) {
    assert.match(source, new RegExp(name, "u"), name);
  }

  assert.match(
    source,
    /SYS_execveat/u,
    "the wrapper must exec the already-opened and hash-verified Node executable"
  );
  assert.doesNotMatch(
    source,
    /\b(?:system|popen|execvp|execvpe|execlp|posix_spawnp)\s*\(|\/bin\/(?:ba)?sh/u,
    "no shell or PATH-searching launch primitive is permitted"
  );
  assert.doesNotMatch(source, /argv\s*\[\s*[1-9]/u);
});

test("shared native pre-import failures are operation-neutral for activation and deactivation", () => {
  const wrapper = requiredSource(OUTER_WRAPPER_SOURCE_PATH, "outer wrapper");
  const cli = readFileSync(TRANSACTION_CLI_PATH, "utf8");

  assert.match(
    wrapper,
    /\\"type\\":\\"control_plane_welcome_coins_production_transaction\\"/u
  );
  assert.doesNotMatch(
    wrapper,
    /welcome_coins_(?:activation|deactivation)_outer_wrapper/u
  );
  assert.match(
    cli,
    /control_plane_welcome_coins_activation_execution_envelope/u
  );
  assert.match(
    cli,
    /control_plane_welcome_coins_deactivation_execution_envelope/u
  );
  assert.match(
    cli,
    /type:\s*"control_plane_welcome_coins_production_transaction"/u
  );
});

test("outer and JS pre-import gates share the exact ordered artifact closure and preserve FD3", () => {
  const wrapper = requiredSource(OUTER_WRAPPER_SOURCE_PATH, "outer wrapper");
  const cli = readFileSync(TRANSACTION_CLI_PATH, "utf8");
  const keys = [
    "candidateRootSha256",
    "transactionCliSha256",
    "activationLibrarySha256",
    "snapshotLibrarySha256",
    "holderObserverSha256",
    "welcomeBonusMigrationsSha256",
    "coinWalletMigrationsSha256",
    "custodyCliSha256",
    "outerWrapperSha256",
    "nativeLauncherSha256",
    "postExecBootstrapSha256",
    "outerPostExecBootstrapSha256",
    "nativeBuildReceiptSha256",
    "nodeModulesTreeSha256",
    "nodeSha256"
  ];
  for (const source of [wrapper, cli]) {
    let previous = -1;
    for (const key of keys) {
      const index = source.indexOf(`"${key}"`);
      assert.equal(index > previous, true, `${key} must retain canonical order`);
      previous = index;
    }
  }
  assert.match(cli, /readSync\([\s\S]*?EXECUTION_ENVELOPE_FD[\s\S]*?offset\s*\)/u);
  assert.match(cli, /requireFd3PositionZero\s*\(\s*\)/u);
  assert.match(cli, /encodedExecutionEnvelope:\s*verified\.encodedExecutionEnvelope/u);
  assert.match(cli, /process\.cwd\s*\(\s*\)\s*!==\s*candidateRoot/u);
  assert.match(cli, /0o7022n/u, "writable and all special-bit tree entries must fail closed");
  assert.equal(
    cli.includes("/[:\\uFFFD\\0\\r\\n]/u"),
    true,
    "tree delimiters must be unambiguous"
  );
});

test("outer post-exec constructor makes the exact root Node image non-dumpable before releasing the JS boot gate", () => {
  const source = requiredSource(OUTER_BOOTSTRAP_SOURCE_PATH, "outer post-exec bootstrap");

  assert.match(source, /__attribute__\s*\(\s*\(\s*constructor\s*\)\s*\)/u);
  assert.match(source, /PR_SET_DUMPABLE/u);
  assert.match(source, /PR_GET_DUMPABLE/u);
  assert.match(source, /PR_GET_NO_NEW_PRIVS/u);
  assert.match(source, /\/proc\/self\/exe/u);
  assert.match(source, /\/proc\/self\/cmdline/u);
  assert.match(source, /getcwd\s*\(/u);
  assert.match(source, /\/usr\/bin\/node/u);
  assert.match(source, /st_dev/u);
  assert.match(source, /st_ino/u);
  assert.match(source, /getresuid\s*\(/u);
  assert.match(source, /getresgid\s*\(/u);
  assert.match(source, /getgroups\s*\(/u);
  assert.match(source, /unsetenv\s*\(\s*"LD_PRELOAD"\s*\)/u);
  assert.match(source, /WELCOME_COINS_OUTER_BOOTSTRAPPED/u);

  for (const name of [
    "LD_AUDIT",
    "LD_LIBRARY_PATH",
    "LD_DEBUG",
    "NODE_OPTIONS",
    "NODE_PATH"
  ]) {
    assert.match(source, new RegExp(name, "u"), name);
  }

  const dumpable = source.indexOf("PR_SET_DUMPABLE");
  const release = source.indexOf("WELCOME_COINS_OUTER_BOOTSTRAPPED");
  assert.equal(dumpable >= 0 && release > dumpable, true);
});
