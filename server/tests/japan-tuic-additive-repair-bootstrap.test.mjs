import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, posix, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createContext, SourceTextModule, SyntheticModule } from "node:vm";

const SCRIPTS_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../scripts");
const BOOTSTRAP_SOURCE_PATH = resolve(SCRIPTS_ROOT, "japan-tuic-additive-repair-bootstrap.mjs");
const BOOTSTRAP_PATH = "/usr/local/libexec/gccgw/japan-tuic-additive-repair-bootstrap.mjs";
const BINDING_PATH = "/etc/gccgw/japan-tuic-additive-repair-binding.json";
const ENTRYPOINT_PATH = "/usr/local/libexec/gccgw/japan-tuic-additive-repair-entrypoint";
const APPLICATION_PATHS = Object.freeze({
  contract: "/usr/local/libexec/gccgw/japan-tuic-additive-repair-contract.mjs",
  frame: "/usr/local/libexec/gccgw/japan-tuic-additive-repair-frame.mjs",
  runner: "/usr/local/libexec/gccgw/japan-tuic-additive-repair-runner.mjs",
  state: "/usr/local/libexec/gccgw/japan-tuic-additive-repair-state.mjs"
});
const CODE_ROLES = Object.freeze(["bootstrap", "contract", "entrypoint", "frame", "runner", "state"]);
const TOP_LEVEL_KEYS = Object.freeze([
  "schemaVersion", "gateId", "expectedEuid", "expectedWorkflowCommit",
  "expectedNonceSha256", "expectedClaimSha256", "codeManifest", "toolManifest",
  "sshAuthorization", "sudoAuthorization", "paths", "pathPolicies", "units",
  "writerFreeze", "authorizationMarker"
]);
const LINUX_FLAGS = Object.freeze({
  O_RDONLY: 0x00000,
  O_DIRECTORY: 0x10000,
  O_NOFOLLOW: 0x20000,
  O_CLOEXEC: 0x80000
});

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function sourceBytes(role, increment = 1) {
  const imports = role === "runner"
    ? 'import "./contract.mjs";\nimport "./frame.mjs";\nimport "./state.mjs";\n'
    : "";
  return Buffer.from(`${imports}globalThis.sentinels.${role} += ${increment};\n`, "utf8");
}

function applicationBytes() {
  return Object.fromEntries(Object.keys(APPLICATION_PATHS).map((role) => [role, sourceBytes(role)]));
}

function codeEntry(path, bytes, mode, overrides = {}) {
  return {
    path,
    sizeBytes: bytes.length,
    sha256: sha256(bytes),
    type: "file",
    uid: 0,
    gid: 0,
    mode,
    nlink: 1,
    ...overrides
  };
}

function canonicalBinding(manifestBytes = applicationBytes(), roleOverrides = {}) {
  const bootstrapBytes = Buffer.from("bootstrap-install-readback", "utf8");
  const entrypointBytes = Buffer.from("#!/usr/bin/dash\n", "ascii");
  const entries = {
    bootstrap: codeEntry(BOOTSTRAP_PATH, bootstrapBytes, 0o644),
    contract: codeEntry(APPLICATION_PATHS.contract, manifestBytes.contract, 0o644),
    entrypoint: codeEntry(ENTRYPOINT_PATH, entrypointBytes, 0o755),
    frame: codeEntry(APPLICATION_PATHS.frame, manifestBytes.frame, 0o644),
    runner: codeEntry(APPLICATION_PATHS.runner, manifestBytes.runner, 0o644),
    state: codeEntry(APPLICATION_PATHS.state, manifestBytes.state, 0o644)
  };
  for (const role of CODE_ROLES) entries[role] = { ...entries[role], ...roleOverrides[role] };
  return {
    schemaVersion: "3",
    gateId: "github-actions-japan-tuic-additive-repair-20260717-001",
    expectedEuid: 0,
    expectedWorkflowCommit: "d".repeat(40),
    expectedNonceSha256: "a".repeat(64),
    expectedClaimSha256: "b".repeat(64),
    codeManifest: Object.fromEntries(CODE_ROLES.map((role) => [role, entries[role]])),
    toolManifest: {},
    sshAuthorization: {},
    sudoAuthorization: {},
    paths: {},
    pathPolicies: {},
    units: {},
    writerFreeze: {},
    authorizationMarker: "github-actions-japan-tuic-additive-repair-20260717-001"
  };
}

function bigintStat({
  type = "file",
  uid = 0n,
  gid = 0n,
  mode = type === "directory" ? 0o755n : 0o644n,
  nlink = type === "directory" ? 2n : 1n,
  dev = 1n,
  ino = 2n,
  size = 0n
} = {}) {
  const typeBits = type === "directory" ? 0o040000n : 0o100000n;
  return {
    uid,
    gid,
    mode: typeBits | mode,
    nlink,
    dev,
    ino,
    size,
    isDirectory: () => type === "directory",
    isFile: () => type === "file",
    isSymbolicLink: () => false
  };
}

function makeFixture({
  manifestBytes = applicationBytes(),
  actualBytes = manifestBytes,
  binding = canonicalBinding(manifestBytes),
  bindingBytes = null,
  processOverrides = {},
  ancestorDriftPath = null,
  inodeDriftPath = null,
  earlyEofPath = null,
  trailingBytePath = null,
  postReadDriftPath = null,
  closeFailurePath = null
} = {}) {
  const serializedBinding = bindingBytes ?? Buffer.from(`${JSON.stringify(binding)}\n`, "utf8");
  const files = new Map([[BINDING_PATH, { bytes: serializedBinding, mode: 0o600n }]]);
  for (const [role, path] of Object.entries(APPLICATION_PATHS)) {
    files.set(path, { bytes: actualBytes[role], mode: 0o644n });
  }
  const calls = [];
  const openFiles = new Map();
  const fstatCounts = new Map();
  let nextFd = 40;
  const inodeFor = (path) => BigInt(1000 + [...path].reduce((sum, character) => sum + character.codePointAt(0), 0));
  const statFor = (path) => {
    if (files.has(path)) {
      const file = files.get(path);
      return bigintStat({ mode: file.mode, size: BigInt(file.bytes.length), ino: inodeFor(path) });
    }
    const drift = path === ancestorDriftPath;
    return bigintStat({
      type: "directory",
      uid: drift ? 1n : 0n,
      mode: drift ? 0o777n : 0o755n,
      nlink: 2n,
      size: 4096n,
      ino: inodeFor(path)
    });
  };
  const operations = {
    constants: LINUX_FLAGS,
    lstatSync(path, options) {
      calls.push(["lstat", path, options]);
      assert.equal(options?.bigint, true);
      return statFor(path);
    },
    openSync(path, flags) {
      assert.equal(flags, 0xA0000);
      if (!files.has(path)) throw new Error("unexpected-open");
      const fd = nextFd;
      nextFd += 1;
      openFiles.set(fd, path);
      calls.push(["open", path, flags, fd]);
      return fd;
    },
    fstatSync(fd, options) {
      calls.push(["fstat", fd, options]);
      assert.equal(options?.bigint, true);
      const path = openFiles.get(fd);
      if (!path) throw new Error("wrong-fd");
      const count = (fstatCounts.get(fd) ?? 0) + 1;
      fstatCounts.set(fd, count);
      const base = statFor(path);
      if (path === inodeDriftPath && count === 1) return { ...base, ino: base.ino + 1n };
      if (path === postReadDriftPath && count > 1) return { ...base, mode: 0o100600n };
      return base;
    },
    readSync(fd, buffer, offset, length, position) {
      const path = openFiles.get(fd);
      calls.push(["read", fd, offset, length, position]);
      if (!path || !Buffer.isBuffer(buffer)) throw new Error("wrong-fd");
      const bytes = files.get(path).bytes;
      if (path === earlyEofPath && position >= Math.max(1, Math.floor(bytes.length / 2))) return 0;
      if (path === trailingBytePath && position >= bytes.length) {
        buffer[offset] = 0x78;
        return 1;
      }
      if (position >= bytes.length) return 0;
      const count = Math.min(length, bytes.length - position, 7);
      bytes.copy(buffer, offset, position, position + count);
      return count;
    },
    closeSync(fd) {
      const path = openFiles.get(fd);
      calls.push(["close", fd]);
      if (!path) throw new Error("wrong-fd");
      openFiles.delete(fd);
      if (path === closeFailurePath) throw new Error("protected-close-detail");
    }
  };
  const fakeProcess = {
    platform: "linux",
    execPath: "/usr/bin/node",
    argv: [
      "/usr/bin/node",
      "/usr/local/libexec/gccgw/japan-tuic-additive-repair-runner.mjs",
      "--binding",
      BINDING_PATH
    ],
    env: {},
    geteuid: () => 0,
    ...processOverrides
  };
  return {
    actualBytes,
    binding,
    calls,
    mainEvaluations: 0,
    operations,
    process: fakeProcess,
    sentinels: { contract: 0, frame: 0, runner: 0, state: 0 }
  };
}

function syntheticModule(context, identifier, exports) {
  return new SyntheticModule(Object.keys(exports), function initialize() {
    for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
  }, { context, identifier });
}

async function evaluateBootstrap(fixture, { evaluateMain = false } = {}) {
  const context = createContext({
    Buffer,
    TextDecoder,
    process: fixture.process,
    sentinels: fixture.sentinels,
    mainEvaluations: fixture.mainEvaluations
  });
  const bootstrapUrl = pathToFileURL(BOOTSTRAP_PATH).href;
  const module = new SourceTextModule(readFileSync(BOOTSTRAP_SOURCE_PATH, "utf8"), {
    context,
    identifier: bootstrapUrl,
    initializeImportMeta(meta) {
      meta.url = bootstrapUrl;
    }
  });
  const builtins = new Map([
    ["node:crypto", syntheticModule(context, "node:crypto", { createHash })],
    ["node:fs", syntheticModule(context, "node:fs", fixture.operations)],
    ["node:path", syntheticModule(context, "node:path", { posix })],
    ["node:url", syntheticModule(context, "node:url", {
      fileURLToPath: (url) => url === bootstrapUrl ? BOOTSTRAP_PATH : fileURLToPath(url)
    })]
  ]);
  await module.link((specifier) => {
    const dependency = builtins.get(specifier);
    if (!dependency) throw new Error(`unreviewed-bootstrap-import:${specifier}`);
    return dependency;
  });
  await module.evaluate();
  if (evaluateMain) {
    const applicationModules = new Map(Object.entries(APPLICATION_PATHS).map(([role]) => [
      `./${role}.mjs`,
      new SourceTextModule(fixture.actualBytes[role].toString("utf8"), {
        context,
        identifier: `file:///application/${role}.mjs`
      })
    ]));
    const main = new SourceTextModule(
      'import "./runner.mjs";\n' + "globalThis.mainEvaluations += 1;\n",
      { context, identifier: "file:///application/main.mjs" }
    );
    await main.link((specifier) => applicationModules.get(specifier));
    await main.evaluate();
  }
  fixture.mainEvaluations = context.mainEvaluations;
  return { mainEvaluations: context.mainEvaluations, sentinels: context.sentinels };
}

async function rejectsRestricted(fixture) {
  await assert.rejects(
    evaluateBootstrap(fixture, { evaluateMain: true }),
    (error) => error?.code === "restricted_identity_rejected"
      && error?.message === "restricted_identity_rejected"
      && !String(error?.stack).includes("protected-close-detail")
  );
}

function stripCommentsAndQuotedStrings(source) {
  let output = "";
  let state = "code";
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (state === "line") {
      if (character === "\n") {
        state = "code";
        output += "\n";
      } else output += " ";
      continue;
    }
    if (state === "block") {
      if (character === "*" && next === "/") {
        output += "  ";
        index += 1;
        state = "code";
      } else output += character === "\n" ? "\n" : " ";
      continue;
    }
    if (state === "single" || state === "double") {
      const quote = state === "single" ? "'" : '"';
      if (character === "\\") {
        output += "  ";
        index += 1;
      } else if (character === quote) {
        output += " ";
        state = "code";
      } else output += character === "\n" ? "\n" : " ";
      continue;
    }
    if (character === "/" && next === "/") {
      output += "  ";
      index += 1;
      state = "line";
    } else if (character === "/" && next === "*") {
      output += "  ";
      index += 1;
      state = "block";
    } else if (character === "'") {
      output += " ";
      state = "single";
    } else if (character === '"') {
      output += " ";
      state = "double";
    } else output += character;
  }
  return output;
}

function dynamicImportCount(source) {
  return stripCommentsAndQuotedStrings(source).match(/\bimport\s*\(/g)?.length ?? 0;
}

test("bootstrap graph is syntax-valid, builtin-only, and has no loader or dynamic-code escape", () => {
  const source = readFileSync(BOOTSTRAP_SOURCE_PATH, "utf8");
  assert.doesNotMatch(source, /`/);
  const module = new SourceTextModule(source, { identifier: pathToFileURL(BOOTSTRAP_PATH).href });
  const requests = module.moduleRequests?.map((request) => request.specifier)
    ?? module.dependencySpecifiers;
  assert.deepEqual([...requests].sort(), ["node:crypto", "node:fs", "node:path", "node:url"]);
  assert.ok(requests.every((specifier) => specifier.startsWith("node:")));
  const tokens = stripCommentsAndQuotedStrings(source);
  assert.equal(dynamicImportCount(source), 0);
  assert.doesNotMatch(tokens, /\b(?:require|createRequire|eval|Function)\b|\bregister\s*\(/);
  assert.doesNotMatch(source, /node:module/);
});

test("bootstrap plus application closure has exactly one reviewed JavaScript import callsite", () => {
  const sources = [readFileSync(BOOTSTRAP_SOURCE_PATH, "utf8")];
  for (const name of [
    "japan-tuic-additive-repair-runner.mjs",
    "japan-tuic-additive-repair-contract.mjs",
    "japan-tuic-additive-repair-frame.mjs",
    "japan-tuic-additive-repair-state.mjs"
  ]) sources.push(readFileSync(resolve(SCRIPTS_ROOT, name), "utf8"));
  assert.equal(sources.reduce((total, source) => total + dynamicImportCount(source), 0), 1);
  assert.equal(dynamicImportCount(sources[0]), 0);
  assert.equal(dynamicImportCount(sources[1]), 1);
});

test("bootstrap rejects every application drift before any top-level or main evaluation", async () => {
  const manifestBytes = applicationBytes();
  for (const role of Object.keys(APPLICATION_PATHS)) {
    const actualBytes = { ...manifestBytes, [role]: sourceBytes(role, 2) };
    const fixture = makeFixture({ manifestBytes, actualBytes });
    await rejectsRestricted(fixture);
    assert.deepEqual(fixture.sentinels, { contract: 0, frame: 0, runner: 0, state: 0 });
    assert.equal(fixture.mainEvaluations, 0);
    assert.deepEqual(fixture.calls.filter(([name]) => name === "close").length >= 1, true);
  }
});

test("clean bootstrap returns before the application graph evaluates", async () => {
  const result = await evaluateBootstrap(makeFixture(), { evaluateMain: true });
  assert.equal(result.mainEvaluations, 1);
  assert.deepEqual(result.sentinels, { contract: 1, frame: 1, runner: 1, state: 1 });
});

test("bootstrap rejects wrong root invocation before opening the binding", async () => {
  for (const processOverrides of [
    { geteuid: () => 1 },
    { platform: "win32" },
    { execPath: "/alternate/node" },
    { argv: ["/usr/bin/node", "/alternate/main.mjs", "--binding", BINDING_PATH] },
    { argv: ["/usr/bin/node", "/usr/local/libexec/gccgw/japan-tuic-additive-repair-runner.mjs", "--binding", BINDING_PATH, "extra"] },
    { env: { NODE_OPTIONS: "" } },
    { env: { NODE_PATH: "" } },
    { env: { SSH_ORIGINAL_COMMAND: " " } }
  ]) {
    const fixture = makeFixture({ processOverrides });
    await rejectsRestricted(fixture);
    assert.equal(fixture.calls.some(([name]) => name === "open"), false);
  }
});

test("bootstrap rejects noncanonical, malformed, and non-UTF-8 binding bytes", async () => {
  const binding = canonicalBinding();
  const canonical = JSON.stringify(binding);
  const variants = [
    Buffer.from(canonical, "utf8"),
    Buffer.from(`${canonical}\r\n`, "utf8"),
    Buffer.from(`${JSON.stringify(binding, null, 2)}\n`, "utf8"),
    Buffer.from(`\ufeff${canonical}\n`, "utf8"),
    Buffer.from(`${canonical}\nextra`, "utf8"),
    Buffer.from(`{"schemaVersion":"3","schemaVersion":"3",${canonical.slice(1)}\n`, "utf8"),
    Buffer.from([0xff, 0x0a])
  ];
  for (const [index, bindingBytes] of variants.entries()) {
    await assert.rejects(
      evaluateBootstrap(makeFixture({ bindingBytes })),
      (error) => error?.code === "restricted_identity_rejected",
      `binding variant ${index} must reject`
    );
  }
});

test("bootstrap rejects wrong six-role order, path, metadata, ceiling, and digest", async () => {
  const manifestBytes = applicationBytes();
  const base = canonicalBinding(manifestBytes);
  const reorderedCode = { ...base.codeManifest };
  const runner = reorderedCode.runner;
  delete reorderedCode.runner;
  reorderedCode.runner = runner;
  const oldFiveRole = { ...base.codeManifest };
  delete oldFiveRole.bootstrap;
  const failures = [
    { ...base, codeManifest: reorderedCode },
    { ...base, codeManifest: oldFiveRole },
    { ...base, codeManifest: { ...base.codeManifest, bootstrap: { ...base.codeManifest.bootstrap, path: "/tmp/bootstrap.mjs" } } },
    { ...base, codeManifest: { ...base.codeManifest, bootstrap: { ...base.codeManifest.bootstrap, mode: 0o600 } } },
    { ...base, codeManifest: { ...base.codeManifest, bootstrap: { ...base.codeManifest.bootstrap, sizeBytes: 65537 } } },
    { ...base, codeManifest: { ...base.codeManifest, runner: { ...base.codeManifest.runner, sizeBytes: 0 } } },
    { ...base, codeManifest: { ...base.codeManifest, state: { ...base.codeManifest.state, sha256: "f".repeat(64) } } }
  ];
  for (const binding of failures) await rejectsRestricted(makeFixture({ manifestBytes, binding }));
});

test("bootstrap same-fd checks reject ancestor, inode, EOF, trailing-byte, post-read, and close drift", async () => {
  const cases = [
    { ancestorDriftPath: "/usr/local/libexec" },
    { inodeDriftPath: APPLICATION_PATHS.runner },
    { earlyEofPath: APPLICATION_PATHS.contract },
    { trailingBytePath: APPLICATION_PATHS.frame },
    { postReadDriftPath: APPLICATION_PATHS.state },
    { closeFailurePath: APPLICATION_PATHS.runner }
  ];
  for (const options of cases) await rejectsRestricted(makeFixture(options));
});

test("bootstrap reads each application role from one trusted descriptor and closes it once", async () => {
  const fixture = makeFixture();
  await evaluateBootstrap(fixture);
  for (const path of Object.values(APPLICATION_PATHS)) {
    const open = fixture.calls.filter(([name, value]) => name === "open" && value === path);
    assert.equal(open.length, 1);
    const fd = open[0][3];
    assert.equal(fixture.calls.filter(([name, value]) => name === "fstat" && value === fd).length, 2);
    assert.ok(fixture.calls.filter(([name, value]) => name === "read" && value === fd).length >= 2);
    assert.equal(fixture.calls.filter(([name, value]) => name === "close" && value === fd).length, 1);
  }
  const openedFds = fixture.calls.filter(([name]) => name === "open").map(([, , , fd]) => fd);
  const closedFds = fixture.calls.filter(([name]) => name === "close").map(([, fd]) => fd);
  assert.equal(openedFds.length, 5);
  assert.equal(closedFds.length, 5);
  assert.equal(new Set(closedFds).size, 5);
});
