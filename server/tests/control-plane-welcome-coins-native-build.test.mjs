import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  WELCOME_COINS_NATIVE_BUILD_PROFILE,
  WELCOME_COINS_NATIVE_OUTPUTS,
  buildWelcomeCoinsNativeBootstrap,
  canonicalWelcomeCoinsNativeBuildReceipt,
  verifyWelcomeCoinsNativeBootstrap
} from "../../scripts/control-plane-welcome-coins-native-build-lib.mjs";
import * as nativeContract from "../../scripts/control-plane-welcome-coins-native-contract.mjs";

const REPOSITORY_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const CLI_SOURCE_PATH = resolve(
  REPOSITORY_ROOT,
  "scripts/control-plane-welcome-coins-native-build-cli.mjs"
);
const SOURCE_NAMES = [
  "welcome-coins-activation-outer-wrapper.c",
  "welcome-coins-outer-post-exec-bootstrap.c",
  "welcome-coins-custody-launcher.c",
  "welcome-coins-post-exec-bootstrap.c"
];

test("native producer re-exports one side-effect-free frozen contract module", () => {
  assert.strictEqual(WELCOME_COINS_NATIVE_BUILD_PROFILE, nativeContract.WELCOME_COINS_NATIVE_BUILD_PROFILE);
  assert.strictEqual(WELCOME_COINS_NATIVE_OUTPUTS, nativeContract.WELCOME_COINS_NATIVE_OUTPUTS);
  for (const value of Object.values(nativeContract)) assert.equal(Object.isFrozen(value), true);
  const source = readFileSync(
    resolve(REPOSITORY_ROOT, "scripts/control-plane-welcome-coins-native-contract.mjs"),
    "utf8"
  );
  assert.doesNotMatch(source, /^\s*import\s/mu);
  assert.doesNotMatch(source, /(?:node:|\bprocess\.|\b(?:spawn|exec|readFile|writeFile|fetch)Sync?\s*\()/u);
});

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "welcome-coins-native-build-"));
  const sourceRoot = join(root, "scripts", "native");
  mkdirSync(sourceRoot, { recursive: true });
  mkdirSync(join(root, "node_modules"));
  for (const name of SOURCE_NAMES) {
    const sourcePath = join(REPOSITORY_ROOT, "scripts", "native", name);
    const targetPath = join(sourceRoot, name);
    if (existsSync(sourcePath)) {
      copyFileSync(sourcePath, targetPath);
    } else {
      // The source-existence contract lives in the focused outer-runtime test.
      // Keeping the synthetic builder fixture complete lets this file expose
      // the independent output/profile/receipt failures in the initial RED run.
      writeFileSync(targetPath, `/* pending native contract: ${name} */\n`);
    }
  }
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function elfBytes(label = "same") {
  const bytes = Buffer.alloc(256);
  bytes.set([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1, 0], 0);
  bytes.writeUInt16LE(3, 16);
  bytes.writeUInt16LE(62, 18);
  Buffer.from(label).copy(bytes, 64);
  return bytes;
}

const GOOD_LAUNCHER_READELF = [
  "ELF Header:",
  "  Class:                             ELF64",
  "  Data:                              2's complement, little endian",
  "  Type:                              DYN (Position-Independent Executable file)",
  "  Machine:                           Advanced Micro Devices X86-64",
  "Program Headers:",
  "  INTERP         0x000000 0x000000 0x000000 0x000000 0x000000 R   0x1",
  "  GNU_STACK      0x000000 0x000000 0x000000 0x000000 0x000000 RW  0x10",
  "  GNU_RELRO      0x000000 0x000000 0x000000 0x000000 0x000000 R   0x1",
  "Dynamic section:",
  " 0x000000000000001e (FLAGS)              BIND_NOW",
  " 0x000000006ffffffb (FLAGS_1)            Flags: PIE",
  "There is no dynamic section in this file.",
  ""
].join("\n");

const GOOD_BOOTSTRAP_READELF = GOOD_LAUNCHER_READELF
  .replace("DYN (Position-Independent Executable file)", "DYN (Shared object file)")
  .replace(/^\s*INTERP[^\n]*\n/mu, "")
  .replace(/^.*\(FLAGS_1\).*\bPIE\b.*\n/mu, "");

const GOOD_STATIC_PIE_READELF = GOOD_LAUNCHER_READELF
  .replace(/^\s*INTERP[^\n]*\n/mu, "");

function fakeRuntime({ drift = false, readelf, beforeCompile } = {}) {
  const calls = [];
  let compile = 0;
  return {
    calls,
    platform: "linux",
    compilerIdentityBytes: Buffer.from("gcc-fixed-identity-v1\n"),
    spawnSync(file, args, options) {
      calls.push({ file, args: [...args], options });
      if (file === "/usr/bin/gcc") {
        compile += 1;
        beforeCompile?.({ args, compile });
        const output = args[args.indexOf("-o") + 1];
        writeFileSync(output, elfBytes(drift && compile === 2 ? "drift" : "same"));
        chmodSync(output, args.includes("-shared") ? 0o644 : 0o755);
        return { status: 0, stdout: "", stderr: "" };
      }
      if (file === "/usr/bin/readelf") {
        const outputPath = args.at(-1);
        const output = readelf ?? (
          outputPath.endsWith(".so")
            ? GOOD_BOOTSTRAP_READELF
            : outputPath.endsWith("welcome-coins-activation-outer-wrapper")
              ? GOOD_STATIC_PIE_READELF
              : GOOD_LAUNCHER_READELF
        );
        return { status: 0, stdout: output, stderr: "" };
      }
      throw new Error(`unexpected executable ${file}`);
    }
  };
}

test("native build CLI exposes exact build and read-only verify modes", () => {
  const source = readFileSync(CLI_SOURCE_PATH, "utf8");
  assert.match(source, /--mode/u);
  assert.match(source, /\bbuild\b/u);
  assert.match(source, /\bverify\b/u);
  assert.match(source, /verifyWelcomeCoinsNativeBootstrap/u);
});

test("build profile and output paths are closed constants", () => {
  assert.equal(WELCOME_COINS_NATIVE_BUILD_PROFILE.id, "hardened-linux-x86_64-gcc-v2");
  assert.deepEqual(Object.keys(WELCOME_COINS_NATIVE_OUTPUTS).sort(), [
    "launcher",
    "outerPostExecBootstrap",
    "outerWrapper",
    "postExecBootstrap",
    "receipt"
  ]);
  assert.equal(
    WELCOME_COINS_NATIVE_OUTPUTS.outerWrapper,
    "node_modules/.gccgw-native/welcome-coins-activation-outer-wrapper"
  );
  assert.equal(
    WELCOME_COINS_NATIVE_OUTPUTS.outerPostExecBootstrap,
    "node_modules/.gccgw-native/welcome-coins-outer-post-exec-bootstrap.so"
  );
  assert.equal(
    WELCOME_COINS_NATIVE_OUTPUTS.launcher,
    "node_modules/.gccgw-native/welcome-coins-custody-launcher"
  );
  assert.equal(
    WELCOME_COINS_NATIVE_OUTPUTS.postExecBootstrap,
    "node_modules/.gccgw-native/welcome-coins-post-exec-bootstrap.so"
  );
  assert.equal(
    WELCOME_COINS_NATIVE_OUTPUTS.receipt,
    "node_modules/.gccgw-native/welcome-coins-native-build.json"
  );
  for (const token of [
    "-std=c17",
    "-fstack-protector-strong",
    "-D_FORTIFY_SOURCE=3",
    "-Werror",
    "-Wl,-z,relro",
    "-Wl,-z,now",
    "-Wl,-z,noexecstack",
    "-Wl,--build-id=none"
  ]) {
    assert.equal(
      WELCOME_COINS_NATIVE_BUILD_PROFILE.commonFlags.includes(token),
      true,
      token
    );
  }
  assert.equal(
    WELCOME_COINS_NATIVE_BUILD_PROFILE.outerWrapperFlags.includes("-static-pie"),
    true,
    "the root-facing wrapper must not run a dynamic loader before main()"
  );
  assert.equal(
    WELCOME_COINS_NATIVE_BUILD_PROFILE.outerPostExecBootstrapFlags.includes("-shared"),
    true
  );
  assert.equal(
    WELCOME_COINS_NATIVE_BUILD_PROFILE.outerPostExecBootstrapFlags.includes(
      "-Wl,-z,initfirst"
    ),
    true,
    "the approved constructor must run before the Node program image"
  );
});

test("builder compiles all four targets twice, compares bytes, inspects ELF, and publishes canonical receipt", (t) => {
  const root = fixture(t);
  const runtime = fakeRuntime();
  const result = buildWelcomeCoinsNativeBootstrap({ root, runtime });
  const publishedRoot = join(root, "node_modules", ".gccgw-native");

  assert.equal(runtime.calls.filter(({ file }) => file === "/usr/bin/gcc").length, 8);
  assert.equal(runtime.calls.filter(({ file }) => file === "/usr/bin/readelf").length, 8);
  assert.equal(
    readFileSync(join(root, WELCOME_COINS_NATIVE_OUTPUTS.outerWrapper)).equals(elfBytes()),
    true
  );
  assert.equal(
    readFileSync(join(root, WELCOME_COINS_NATIVE_OUTPUTS.outerPostExecBootstrap))
      .equals(elfBytes()),
    true
  );
  assert.equal(readFileSync(join(root, WELCOME_COINS_NATIVE_OUTPUTS.launcher)).equals(elfBytes()), true);
  assert.equal(readFileSync(join(root, WELCOME_COINS_NATIVE_OUTPUTS.postExecBootstrap)).equals(elfBytes()), true);
  if (process.platform === "linux") {
    assert.equal(statSync(join(root, WELCOME_COINS_NATIVE_OUTPUTS.outerWrapper)).mode & 0o777, 0o755);
    assert.equal(
      statSync(join(root, WELCOME_COINS_NATIVE_OUTPUTS.outerPostExecBootstrap)).mode & 0o777,
      0o644
    );
    assert.equal(statSync(join(root, WELCOME_COINS_NATIVE_OUTPUTS.launcher)).mode & 0o777, 0o755);
    assert.equal(statSync(join(root, WELCOME_COINS_NATIVE_OUTPUTS.postExecBootstrap)).mode & 0o777, 0o644);
    assert.equal(statSync(join(root, WELCOME_COINS_NATIVE_OUTPUTS.receipt)).mode & 0o777, 0o644);
  }
  assert.equal(readFileSync(join(root, WELCOME_COINS_NATIVE_OUTPUTS.receipt)).equals(result.receiptBytes), true);
  assert.equal(result.receiptBytes.equals(canonicalWelcomeCoinsNativeBuildReceipt(result.receipt)), true);
  assert.equal(result.receiptBytes.at(-1), 0x0a);
  assert.equal(JSON.stringify(result.receipt).includes(root), false);
  assert.equal(Object.hasOwn(result.receipt, "createdAt"), false);
  assert.equal(Object.hasOwn(result.receipt, "timestamp"), false);
  assert.equal(result.receipt.schemaVersion, "1");
  assert.equal(result.receipt.type, "welcome_coins_native_build");
  assert.equal(result.receipt.profile, WELCOME_COINS_NATIVE_BUILD_PROFILE.id);
  assert.match(result.receipt.compiler.identitySha256, /^[a-f0-9]{64}$/u);
  assert.deepEqual(Object.keys(result.receipt.sources).sort(), [
    "launcher",
    "outerPostExecBootstrap",
    "outerWrapper",
    "postExecBootstrap"
  ]);
  assert.deepEqual(Object.keys(result.receipt.outputs).sort(), [
    "launcher",
    "outerPostExecBootstrap",
    "outerWrapper",
    "postExecBootstrap"
  ]);
  assert.equal(result.receipt.outputs.outerWrapper.mode, "0755");
  assert.equal(result.receipt.outputs.outerWrapper.kind, "static-pie");
  assert.equal(result.receipt.outputs.outerPostExecBootstrap.mode, "0644");
  assert.equal(result.receipt.outputs.outerPostExecBootstrap.kind, "shared-object");
  assert.equal(result.receipt.outputs.launcher.mode, "0755");
  assert.equal(result.receipt.outputs.launcher.kind, "pie");
  assert.equal(result.receipt.outputs.postExecBootstrap.mode, "0644");
  assert.equal(result.receipt.outputs.postExecBootstrap.kind, "shared-object");
  assert.equal(
    createHash("sha256").update(result.receiptBytes).digest("hex"),
    result.receiptSha256
  );
  assert.equal(statSync(publishedRoot).isDirectory(), true);
});

test("native build and verify options are exact but insensitive to property order", (t) => {
  const root = fixture(t);
  const buildRuntime = fakeRuntime();
  const built = buildWelcomeCoinsNativeBootstrap({ runtime: buildRuntime, root });

  assert.match(built.receiptSha256, /^[a-f0-9]{64}$/u);
  assert.equal(
    verifyWelcomeCoinsNativeBootstrap({ runtime: fakeRuntime(), root }).receiptSha256,
    built.receiptSha256
  );

  for (const options of [
    { runtime: fakeRuntime() },
    { root, runtime: fakeRuntime(), compiler: "/tmp/cc" }
  ]) {
    assert.throws(
      () => buildWelcomeCoinsNativeBootstrap(options),
      (error) => error?.condition === "native_build_invalid"
    );
    assert.throws(
      () => verifyWelcomeCoinsNativeBootstrap(options),
      (error) => error?.condition === "native_build_invalid"
    );
  }
});

test("canonical native receipt rejects reordered contract keys at every nested boundary", (t) => {
  const root = fixture(t);
  const { receipt } = buildWelcomeCoinsNativeBootstrap({ root, runtime: fakeRuntime() });
  const reorderFirstTwo = (value) => Object.fromEntries([
    ...Object.entries(value).slice(1, 2),
    ...Object.entries(value).slice(0, 1),
    ...Object.entries(value).slice(2)
  ]);
  const mutations = [
    reorderFirstTwo(receipt),
    { ...receipt, sources: reorderFirstTwo(receipt.sources) },
    { ...receipt, flags: reorderFirstTwo(receipt.flags) },
    { ...receipt, outputs: reorderFirstTwo(receipt.outputs) },
    {
      ...receipt,
      outputs: {
        ...receipt.outputs,
        outerWrapper: reorderFirstTwo(receipt.outputs.outerWrapper)
      }
    }
  ];
  for (const value of mutations) {
    assert.throws(
      () => canonicalWelcomeCoinsNativeBuildReceipt(value),
      (error) => error?.condition === "native_build_receipt_invalid"
    );
  }
});

test("builder rejects non-reproducible output before publication", (t) => {
  const root = fixture(t);
  assert.throws(
    () => buildWelcomeCoinsNativeBootstrap({ root, runtime: fakeRuntime({ drift: true }) }),
    (error) => error?.condition === "native_build_not_reproducible"
  );
  assert.equal(statSync(join(root, "node_modules")).isDirectory(), true);
});

test("builder rejects source drift between provenance capture and compiler consumption", (t) => {
  const root = fixture(t);
  const launcherSource = join(
    root,
    "scripts",
    "native",
    "welcome-coins-custody-launcher.c"
  );
  assert.throws(
    () => buildWelcomeCoinsNativeBootstrap({
      root,
      runtime: fakeRuntime({
        beforeCompile({ compile }) {
          if (compile === 1) writeFileSync(launcherSource, "int changed_source(void) { return 1; }\n");
        }
      })
    }),
    (error) => error?.condition === "native_source_changed"
  );
});

test("builder proves launcher and preload ELF kinds independently", (t) => {
  const root = fixture(t);
  assert.throws(
    () => buildWelcomeCoinsNativeBootstrap({
      root,
      runtime: fakeRuntime({
        readelf: GOOD_LAUNCHER_READELF.replace(
          "Position-Independent Executable file",
          "Shared object file"
        )
      })
    }),
    (error) => error?.condition === "native_elf_invalid"
  );
});

test("builder rejects RPATH or RUNPATH ELF evidence", (t) => {
  const root = fixture(t);
  assert.throws(
    () => buildWelcomeCoinsNativeBootstrap({
      root,
      runtime: fakeRuntime({ readelf: `${GOOD_LAUNCHER_READELF} 0x1d (RUNPATH) Library runpath: [/tmp]\n` })
    }),
    (error) => error?.condition === "native_elf_invalid"
  );
});

test("verify mode proves the published receipt and native bundle without mutation", (t) => {
  const root = fixture(t);
  const runtime = fakeRuntime();
  const built = buildWelcomeCoinsNativeBootstrap({ root, runtime });
  const paths = Object.values(WELCOME_COINS_NATIVE_OUTPUTS).map((path) => join(root, path));
  const before = paths.map((path) => ({
    bytes: readFileSync(path),
    size: statSync(path).size,
    mtimeMs: statSync(path).mtimeMs
  }));

  const verified = verifyWelcomeCoinsNativeBootstrap({ root, runtime });

  assert.equal(verified.receiptSha256, built.receiptSha256);
  for (const [index, path] of paths.entries()) {
    assert.equal(readFileSync(path).equals(before[index].bytes), true);
    assert.equal(statSync(path).size, before[index].size);
    assert.equal(statSync(path).mtimeMs, before[index].mtimeMs);
  }
});

test("builder rejects non-Linux and caller-selected compiler or output surfaces", (t) => {
  const root = fixture(t);
  assert.throws(
    () => buildWelcomeCoinsNativeBootstrap({ root, runtime: { ...fakeRuntime(), platform: "win32" } }),
    (error) => error?.condition === "unsupported_platform"
  );
  assert.throws(
    () => buildWelcomeCoinsNativeBootstrap({ root, compiler: "/tmp/cc", runtime: fakeRuntime() }),
    (error) => error?.condition === "native_build_invalid"
  );
  assert.throws(
    () => buildWelcomeCoinsNativeBootstrap({ root, output: "/tmp/out", runtime: fakeRuntime() }),
    (error) => error?.condition === "native_build_invalid"
  );
});
