import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  closeSync,
  constants as fsConstants,
  fstatSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import {
  WELCOME_COINS_NATIVE_BUILD_PROFILE,
  WELCOME_COINS_NATIVE_COMMON_FLAGS,
  WELCOME_COINS_NATIVE_LAUNCHER_FLAGS,
  WELCOME_COINS_NATIVE_OUTER_POST_EXEC_FLAGS,
  WELCOME_COINS_NATIVE_OUTER_WRAPPER_FLAGS,
  WELCOME_COINS_NATIVE_OUTPUTS,
  WELCOME_COINS_NATIVE_POST_EXEC_FLAGS,
  WELCOME_COINS_NATIVE_SOURCE_PATHS
} from "./control-plane-welcome-coins-native-contract.mjs";

export {
  WELCOME_COINS_NATIVE_BUILD_PROFILE,
  WELCOME_COINS_NATIVE_OUTPUTS
} from "./control-plane-welcome-coins-native-contract.mjs";

const SCHEMA_VERSION = "1";
const TYPE = "welcome_coins_native_build";
const HASH = /^[a-f0-9]{64}$/u;
const GCC_PATH = "/usr/bin/gcc";
const READELF_PATH = "/usr/bin/readelf";
const MAX_NATIVE_BYTES = 4 * 1024 * 1024;
const CLEAN_ENV = Object.freeze({
  PATH: "/usr/bin:/bin",
  LANG: "C",
  LC_ALL: "C",
  SOURCE_DATE_EPOCH: "0",
  TZ: "UTC",
  ZERO_AR_DATE: "1"
});

const COMMON_FLAGS = WELCOME_COINS_NATIVE_COMMON_FLAGS;
const LAUNCHER_FLAGS = WELCOME_COINS_NATIVE_LAUNCHER_FLAGS;
const POST_EXEC_FLAGS = WELCOME_COINS_NATIVE_POST_EXEC_FLAGS;
const OUTER_WRAPPER_FLAGS = WELCOME_COINS_NATIVE_OUTER_WRAPPER_FLAGS;
const OUTER_POST_EXEC_FLAGS = WELCOME_COINS_NATIVE_OUTER_POST_EXEC_FLAGS;
const NATIVE_SOURCE_PATHS = WELCOME_COINS_NATIVE_SOURCE_PATHS;

export class WelcomeCoinsNativeBuildError extends Error {
  constructor(condition) {
    super(condition);
    this.name = "WelcomeCoinsNativeBuildError";
    this.condition = condition;
  }
}

const fail = (condition) => {
  throw new WelcomeCoinsNativeBuildError(condition);
};
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const exactOrderedKeys = (value, expected) => Boolean(
  value
  && typeof value === "object"
  && !Array.isArray(value)
  && Object.keys(value).join("\0") === expected.join("\0")
);
const exactKeySet = (value, expected) => Boolean(
  value
  && typeof value === "object"
  && !Array.isArray(value)
  && Object.keys(value).length === expected.length
  && expected.every((key) => Object.hasOwn(value, key))
);
const digestRecord = (bytes) => Object.freeze({
  sha256: sha256(bytes),
  sizeBytes: bytes.length
});
const flagDigest = (flags) => sha256(Buffer.from(JSON.stringify(flags)));
const LAUNCHER_FLAGS_SHA256 = flagDigest([...COMMON_FLAGS, ...LAUNCHER_FLAGS]);
const POST_EXEC_FLAGS_SHA256 = flagDigest([...COMMON_FLAGS, ...POST_EXEC_FLAGS]);
const OUTER_WRAPPER_FLAGS_SHA256 = flagDigest([...COMMON_FLAGS, ...OUTER_WRAPPER_FLAGS]);
const OUTER_POST_EXEC_FLAGS_SHA256 = flagDigest([
  ...COMMON_FLAGS,
  ...OUTER_POST_EXEC_FLAGS
]);

function exactDigest(value) {
  return exactOrderedKeys(value, ["path", "sha256", "sizeBytes"])
    && typeof value.path === "string"
    && !isAbsolute(value.path)
    && !value.path.includes("\\")
    && !value.path.includes("\0")
    && HASH.test(value.sha256)
    && Number.isSafeInteger(value.sizeBytes)
    && value.sizeBytes > 0;
}

function exactOutput(value, { path, mode, kind }) {
  return exactOrderedKeys(value, ["path", "sha256", "sizeBytes", "mode", "kind"])
    && value.path === path
    && HASH.test(value.sha256 ?? "")
    && Number.isSafeInteger(value.sizeBytes)
    && value.sizeBytes > 0
    && value.mode === mode
    && value.kind === kind;
}

function exactReceipt(value) {
  if (
    !exactOrderedKeys(value, [
      "schemaVersion",
      "type",
      "profile",
      "sources",
      "compiler",
      "flags",
      "outputs"
    ])
    || value.schemaVersion !== SCHEMA_VERSION
    || value.type !== TYPE
    || value.profile !== WELCOME_COINS_NATIVE_BUILD_PROFILE.id
    || !exactOrderedKeys(value.sources, [
      "outerWrapper",
      "outerPostExecBootstrap",
      "launcher",
      "postExecBootstrap"
    ])
    || !exactDigest(value.sources.outerWrapper)
    || value.sources.outerWrapper.path !== NATIVE_SOURCE_PATHS.outerWrapper
    || !exactDigest(value.sources.outerPostExecBootstrap)
    || value.sources.outerPostExecBootstrap.path !== NATIVE_SOURCE_PATHS.outerPostExecBootstrap
    || !exactDigest(value.sources.launcher)
    || value.sources.launcher.path !== NATIVE_SOURCE_PATHS.launcher
    || !exactDigest(value.sources.postExecBootstrap)
    || value.sources.postExecBootstrap.path !== NATIVE_SOURCE_PATHS.postExecBootstrap
    || !exactOrderedKeys(value.compiler, ["identitySha256"])
    || !HASH.test(value.compiler.identitySha256 ?? "")
    || !exactOrderedKeys(value.flags, [
      "outerWrapperSha256",
      "outerPostExecBootstrapSha256",
      "launcherSha256",
      "postExecBootstrapSha256"
    ])
    || value.flags.outerWrapperSha256 !== OUTER_WRAPPER_FLAGS_SHA256
    || value.flags.outerPostExecBootstrapSha256 !== OUTER_POST_EXEC_FLAGS_SHA256
    || value.flags.launcherSha256 !== LAUNCHER_FLAGS_SHA256
    || value.flags.postExecBootstrapSha256 !== POST_EXEC_FLAGS_SHA256
    || !exactOrderedKeys(value.outputs, [
      "outerWrapper",
      "outerPostExecBootstrap",
      "launcher",
      "postExecBootstrap"
    ])
    || !exactOutput(value.outputs.outerWrapper, {
      path: WELCOME_COINS_NATIVE_OUTPUTS.outerWrapper,
      mode: "0755",
      kind: "static-pie"
    })
    || !exactOutput(value.outputs.outerPostExecBootstrap, {
      path: WELCOME_COINS_NATIVE_OUTPUTS.outerPostExecBootstrap,
      mode: "0644",
      kind: "shared-object"
    })
    || !exactOutput(value.outputs.launcher, {
      path: WELCOME_COINS_NATIVE_OUTPUTS.launcher,
      mode: "0755",
      kind: "pie"
    })
    || !exactOutput(value.outputs.postExecBootstrap, {
      path: WELCOME_COINS_NATIVE_OUTPUTS.postExecBootstrap,
      mode: "0644",
      kind: "shared-object"
    })
  ) {
    fail("native_build_receipt_invalid");
  }
  return value;
}

export function canonicalWelcomeCoinsNativeBuildReceipt(value) {
  exactReceipt(value);
  return Buffer.from(`${JSON.stringify(value)}\n`, "utf8");
}

function readBoundedFile(path, condition) {
  let bytes;
  let metadata;
  try {
    metadata = statSync(path);
    bytes = readFileSync(path);
  } catch {
    fail(condition);
  }
  if (
    !metadata.isFile()
    || metadata.size <= 0
    || metadata.size > MAX_NATIVE_BYTES
    || bytes.length !== metadata.size
  ) {
    fail(condition);
  }
  return bytes;
}

const fileIdentity = (metadata) => Object.freeze({
  dev: String(metadata.dev),
  ino: String(metadata.ino),
  size: String(metadata.size),
  nlink: String(metadata.nlink),
  mode: String(metadata.mode),
  mtimeNs: String(metadata.mtimeNs),
  ctimeNs: String(metadata.ctimeNs)
});
const sameIdentity = (left, right) => Boolean(
  left
  && right
  && ["dev", "ino", "size", "nlink", "mode", "mtimeNs", "ctimeNs"]
    .every((key) => left[key] === right[key])
);

function captureSource(root, path, changedCondition = "native_source_invalid") {
  const absolute = resolve(root, path);
  const rootAbsolute = resolve(root);
  const relativePath = relative(rootAbsolute, absolute);
  if (!relativePath || relativePath === ".." || relativePath.startsWith("..\\")
    || relativePath.startsWith("../") || isAbsolute(relativePath)) {
    fail("native_build_invalid");
  }
  let descriptor;
  try {
    const before = lstatSync(absolute, { bigint: true });
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n
      || before.size <= 0n || before.size > BigInt(MAX_NATIVE_BYTES)
      || realpathSync(absolute) !== absolute) fail(changedCondition);
    descriptor = openSync(
      absolute,
      fsConstants.O_RDONLY | (process.platform === "linux" ? fsConstants.O_NOFOLLOW : 0)
    );
    const opened = fstatSync(descriptor, { bigint: true });
    if (!sameIdentity(fileIdentity(before), fileIdentity(opened))) fail(changedCondition);
    const size = Number(opened.size);
    const bytes = Buffer.alloc(size);
    let offset = 0;
    while (offset < size) {
      const count = readSync(descriptor, bytes, offset, size - offset, offset);
      if (count <= 0) fail(changedCondition);
      offset += count;
    }
    const after = fstatSync(descriptor, { bigint: true });
    const current = lstatSync(absolute, { bigint: true });
    if (!sameIdentity(fileIdentity(opened), fileIdentity(after))
      || !sameIdentity(fileIdentity(after), fileIdentity(current))) fail(changedCondition);
    return Object.freeze({
      path,
      absolute,
      identity: fileIdentity(opened),
      bytes,
      record: Object.freeze({ path, ...digestRecord(bytes) })
    });
  } catch (error) {
    if (error instanceof WelcomeCoinsNativeBuildError) throw error;
    fail(changedCondition);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function assertCapturedUnchanged(root, expected, condition) {
  const current = captureSource(root, expected.path, condition);
  if (!sameIdentity(current.identity, expected.identity)
    || current.record.sha256 !== expected.record.sha256
    || current.record.sizeBytes !== expected.record.sizeBytes) fail(condition);
}

function assertSourceUnchanged(root, expected) {
  assertCapturedUnchanged(root, expected, "native_source_changed");
}

function validateElfHeader(bytes) {
  if (
    !Buffer.isBuffer(bytes)
    || bytes.length < 64
    || bytes[0] !== 0x7f
    || bytes[1] !== 0x45
    || bytes[2] !== 0x4c
    || bytes[3] !== 0x46
    || bytes[4] !== 2
    || bytes[5] !== 1
    || bytes[6] !== 1
    || bytes.readUInt16LE(16) !== 3
    || bytes.readUInt16LE(18) !== 62
  ) {
    fail("native_elf_invalid");
  }
}

function inspectElf(path, runtime, kind) {
  const result = runtime.spawnSync(
    READELF_PATH,
    ["--file-header", "--program-headers", "--dynamic", "--notes", "--wide", path],
    {
      cwd: "/",
      env: CLEAN_ENV,
      encoding: "utf8",
      timeout: 15_000,
      maxBuffer: 1024 * 1024,
      windowsHide: true
    }
  );
  const output = String(result?.stdout ?? "");
  if (
    result?.error
    || result?.status !== 0
    || String(result?.stderr ?? "").trim() !== ""
    || !/Class:\s+ELF64/u.test(output)
    || !/Data:\s+2's complement, little endian/u.test(output)
    || !/Machine:\s+Advanced Micro Devices X86-64/u.test(output)
    || !/GNU_STACK[^\n]*\sRW\s/u.test(output)
    || /GNU_STACK[^\n]*RWE/u.test(output)
    || !/GNU_RELRO/u.test(output)
    || !/BIND_NOW/u.test(output)
    || /\b(?:RPATH|RUNPATH)\b/u.test(output)
    || /Build ID:/u.test(output)
  ) {
    fail("native_elf_invalid");
  }
  const hasInterpreter = /^\s*INTERP\s/mu.test(output);
  const hasPieFlag = /\(FLAGS_1\)[^\n]*\bPIE\b/u.test(output);
  if (kind === "pie") {
    if (!/Type:\s+DYN \(Position-Independent Executable file\)/u.test(output)
      || !hasInterpreter || !hasPieFlag) fail("native_elf_invalid");
  } else if (kind === "static-pie") {
    if (!/Type:\s+DYN \(Position-Independent Executable file\)/u.test(output)
      || hasInterpreter || !hasPieFlag || /\(NEEDED\)/u.test(output)) {
      fail("native_elf_invalid");
    }
  } else if (kind === "shared-object") {
    if (!/Type:\s+DYN \(Shared object file\)/u.test(output)
      || hasInterpreter || hasPieFlag) fail("native_elf_invalid");
  } else fail("native_elf_invalid");
}

function compileTarget({ root, sourcePath, outputPath, flags, kind, runtime }) {
  const args = [...COMMON_FLAGS, ...flags, sourcePath, "-o", outputPath];
  const result = runtime.spawnSync(GCC_PATH, args, {
    cwd: root,
    env: CLEAN_ENV,
    encoding: "utf8",
    timeout: 60_000,
    maxBuffer: 1024 * 1024,
    windowsHide: true
  });
  if (
    result?.error
    || result?.status !== 0
    || String(result?.stdout ?? "").trim() !== ""
    || String(result?.stderr ?? "").trim() !== ""
  ) {
    fail("native_compile_failed");
  }
  const bytes = readBoundedFile(outputPath, "native_compile_failed");
  validateElfHeader(bytes);
  inspectElf(outputPath, runtime, kind);
  return bytes;
}

function buildPass({ root, directory, sources, compilerIdentitySha256, runtime }) {
  const outerWrapperPath = join(directory, "welcome-coins-activation-outer-wrapper");
  const outerBootstrapPath = join(directory, "welcome-coins-outer-post-exec-bootstrap.so");
  const launcherPath = join(directory, "welcome-coins-custody-launcher");
  const preloadPath = join(directory, "welcome-coins-post-exec-bootstrap.so");
  const outerWrapperBytes = compileTarget({
    root,
    sourcePath: sources.outerWrapper.path,
    outputPath: outerWrapperPath,
    flags: OUTER_WRAPPER_FLAGS,
    kind: "static-pie",
    runtime
  });
  const outerPostExecBootstrapBytes = compileTarget({
    root,
    sourcePath: sources.outerPostExecBootstrap.path,
    outputPath: outerBootstrapPath,
    flags: OUTER_POST_EXEC_FLAGS,
    kind: "shared-object",
    runtime
  });
  const launcherBytes = compileTarget({
    root,
    sourcePath: sources.launcher.path,
    outputPath: launcherPath,
    flags: LAUNCHER_FLAGS,
    kind: "pie",
    runtime
  });
  const postExecBootstrapBytes = compileTarget({
    root,
    sourcePath: sources.postExecBootstrap.path,
    outputPath: preloadPath,
    flags: POST_EXEC_FLAGS,
    kind: "shared-object",
    runtime
  });
  const outerWrapperDigest = digestRecord(outerWrapperBytes);
  const outerBootstrapDigest = digestRecord(outerPostExecBootstrapBytes);
  const launcherDigest = digestRecord(launcherBytes);
  const preloadDigest = digestRecord(postExecBootstrapBytes);
  const receipt = Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    type: TYPE,
    profile: WELCOME_COINS_NATIVE_BUILD_PROFILE.id,
    sources: Object.freeze({
      outerWrapper: sources.outerWrapper.record,
      outerPostExecBootstrap: sources.outerPostExecBootstrap.record,
      launcher: sources.launcher.record,
      postExecBootstrap: sources.postExecBootstrap.record
    }),
    compiler: Object.freeze({ identitySha256: compilerIdentitySha256 }),
    flags: Object.freeze({
      outerWrapperSha256: OUTER_WRAPPER_FLAGS_SHA256,
      outerPostExecBootstrapSha256: OUTER_POST_EXEC_FLAGS_SHA256,
      launcherSha256: LAUNCHER_FLAGS_SHA256,
      postExecBootstrapSha256: POST_EXEC_FLAGS_SHA256
    }),
    outputs: Object.freeze({
      outerWrapper: Object.freeze({
        path: WELCOME_COINS_NATIVE_OUTPUTS.outerWrapper,
        ...outerWrapperDigest,
        mode: "0755",
        kind: "static-pie"
      }),
      outerPostExecBootstrap: Object.freeze({
        path: WELCOME_COINS_NATIVE_OUTPUTS.outerPostExecBootstrap,
        ...outerBootstrapDigest,
        mode: "0644",
        kind: "shared-object"
      }),
      launcher: Object.freeze({
        path: WELCOME_COINS_NATIVE_OUTPUTS.launcher,
        ...launcherDigest,
        mode: "0755",
        kind: "pie"
      }),
      postExecBootstrap: Object.freeze({
        path: WELCOME_COINS_NATIVE_OUTPUTS.postExecBootstrap,
        ...preloadDigest,
        mode: "0644",
        kind: "shared-object"
      })
    })
  });
  return Object.freeze({
    outerWrapperBytes,
    outerPostExecBootstrapBytes,
    launcherBytes,
    postExecBootstrapBytes,
    receipt,
    receiptBytes: canonicalWelcomeCoinsNativeBuildReceipt(receipt)
  });
}

function publish(path, bytes, mode) {
  try {
    writeFileSync(path, bytes, { flag: "wx", mode });
    chmodSync(path, mode);
    const metadata = statSync(path);
    if (
      !metadata.isFile()
      || metadata.size !== bytes.length
      || (process.platform === "linux" && (metadata.mode & 0o777) !== mode)
    ) {
      fail("native_publish_failed");
    }
  } catch (error) {
    if (error instanceof WelcomeCoinsNativeBuildError) throw error;
    fail("native_publish_failed");
  }
}

function defaultRuntime() {
  return Object.freeze({
    platform: process.platform,
    spawnSync
  });
}

function compilerIdentity(runtime) {
  let bytes;
  try {
    bytes = runtime.compilerIdentityBytes === undefined
      ? readBoundedFile(GCC_PATH, "native_compiler_invalid")
      : Buffer.from(runtime.compilerIdentityBytes);
  } catch {
    fail("native_compiler_invalid");
  }
  if (bytes.length === 0 || bytes.length > 64 * 1024 * 1024) {
    fail("native_compiler_invalid");
  }
  return sha256(bytes);
}

function runtimeFor(options) {
  const runtime = options.runtime ?? defaultRuntime();
  if (runtime?.platform !== "linux" || typeof runtime.spawnSync !== "function") {
    fail(runtime?.platform === "linux" ? "native_build_invalid" : "unsupported_platform");
  }
  return runtime;
}

function readPublishedOutput(root, expected, runtime) {
  const path = resolve(root, expected.path);
  const captured = captureSource(root, expected.path, "native_build_receipt_invalid");
  if (process.platform === "linux"
    && Number(BigInt(captured.identity.mode) & 0o7777n).toString(8).padStart(4, "0") !== expected.mode) {
    fail("native_build_receipt_invalid");
  }
  const bytes = captured.bytes;
  validateElfHeader(bytes);
  inspectElf(path, runtime, expected.kind);
  const digest = digestRecord(bytes);
  if (digest.sha256 !== expected.sha256 || digest.sizeBytes !== expected.sizeBytes) {
    fail("native_build_receipt_invalid");
  }
  return captured;
}

function parsePublishedReceipt(bytes) {
  let value;
  try { value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { fail("native_build_receipt_invalid"); }
  exactReceipt(value);
  if (!bytes.equals(canonicalWelcomeCoinsNativeBuildReceipt(value))) {
    fail("native_build_receipt_invalid");
  }
  return value;
}

export function buildWelcomeCoinsNativeBootstrap(options = {}) {
  if (!exactKeySet(options, ["root", ...(Object.hasOwn(options, "runtime") ? ["runtime"] : [])])
    || typeof options.root !== "string" || !options.root) {
    fail("native_build_invalid");
  }
  const root = resolve(options.root);
  const runtime = runtimeFor(options);
  const nodeModules = resolve(root, "node_modules");
  let nodeModulesMetadata;
  try {
    nodeModulesMetadata = statSync(nodeModules);
  } catch {
    fail("native_build_invalid");
  }
  if (!nodeModulesMetadata.isDirectory()) fail("native_build_invalid");

  const sources = Object.freeze({
    outerWrapper: captureSource(root, NATIVE_SOURCE_PATHS.outerWrapper),
    outerPostExecBootstrap: captureSource(root, NATIVE_SOURCE_PATHS.outerPostExecBootstrap),
    launcher: captureSource(root, NATIVE_SOURCE_PATHS.launcher),
    postExecBootstrap: captureSource(root, NATIVE_SOURCE_PATHS.postExecBootstrap)
  });
  const compilerIdentitySha256 = compilerIdentity(runtime);
  const temporaryRoot = mkdtempSync(join(tmpdir(), "welcome-coins-native-build-"));
  const passA = join(temporaryRoot, "a");
  const passB = join(temporaryRoot, "b");
  const frozenSourceRoot = join(temporaryRoot, "sources");
  mkdirSync(passA);
  mkdirSync(passB);
  mkdirSync(frozenSourceRoot, { mode: 0o700 });
  try {
    const frozenSources = Object.freeze({
      outerWrapper: Object.freeze({
        ...sources.outerWrapper,
        path: join(frozenSourceRoot, "welcome-coins-activation-outer-wrapper.c")
      }),
      outerPostExecBootstrap: Object.freeze({
        ...sources.outerPostExecBootstrap,
        path: join(frozenSourceRoot, "welcome-coins-outer-post-exec-bootstrap.c")
      }),
      launcher: Object.freeze({
        ...sources.launcher,
        path: join(frozenSourceRoot, "welcome-coins-custody-launcher.c")
      }),
      postExecBootstrap: Object.freeze({
        ...sources.postExecBootstrap,
        path: join(frozenSourceRoot, "welcome-coins-post-exec-bootstrap.c")
      })
    });
    writeFileSync(frozenSources.outerWrapper.path, sources.outerWrapper.bytes, {
      flag: "wx",
      mode: 0o400
    });
    writeFileSync(
      frozenSources.outerPostExecBootstrap.path,
      sources.outerPostExecBootstrap.bytes,
      { flag: "wx", mode: 0o400 }
    );
    writeFileSync(frozenSources.launcher.path, sources.launcher.bytes, { flag: "wx", mode: 0o400 });
    writeFileSync(frozenSources.postExecBootstrap.path, sources.postExecBootstrap.bytes, {
      flag: "wx",
      mode: 0o400
    });
    const first = buildPass({ root, directory: passA, sources: frozenSources, compilerIdentitySha256, runtime });
    const second = buildPass({ root, directory: passB, sources: frozenSources, compilerIdentitySha256, runtime });
    assertSourceUnchanged(root, sources.outerWrapper);
    assertSourceUnchanged(root, sources.outerPostExecBootstrap);
    assertSourceUnchanged(root, sources.launcher);
    assertSourceUnchanged(root, sources.postExecBootstrap);
    if (
      !first.outerWrapperBytes.equals(second.outerWrapperBytes)
      || !first.outerPostExecBootstrapBytes.equals(second.outerPostExecBootstrapBytes)
      || !first.launcherBytes.equals(second.launcherBytes)
      || !first.postExecBootstrapBytes.equals(second.postExecBootstrapBytes)
      || !first.receiptBytes.equals(second.receiptBytes)
    ) {
      fail("native_build_not_reproducible");
    }
    const outputRoot = resolve(root, "node_modules", ".gccgw-native");
    try {
      mkdirSync(outputRoot, { mode: 0o755 });
    } catch {
      fail("native_publish_failed");
    }
    publish(
      resolve(root, WELCOME_COINS_NATIVE_OUTPUTS.outerWrapper),
      first.outerWrapperBytes,
      0o755
    );
    publish(
      resolve(root, WELCOME_COINS_NATIVE_OUTPUTS.outerPostExecBootstrap),
      first.outerPostExecBootstrapBytes,
      0o644
    );
    publish(resolve(root, WELCOME_COINS_NATIVE_OUTPUTS.launcher), first.launcherBytes, 0o755);
    publish(
      resolve(root, WELCOME_COINS_NATIVE_OUTPUTS.postExecBootstrap),
      first.postExecBootstrapBytes,
      0o644
    );
    publish(resolve(root, WELCOME_COINS_NATIVE_OUTPUTS.receipt), first.receiptBytes, 0o644);
    return Object.freeze({
      receipt: first.receipt,
      receiptBytes: first.receiptBytes,
      receiptSha256: sha256(first.receiptBytes),
      outputs: first.receipt.outputs
    });
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

export function verifyWelcomeCoinsNativeBootstrap(options = {}) {
  if (!exactKeySet(options, ["root", ...(Object.hasOwn(options, "runtime") ? ["runtime"] : [])])
    || typeof options.root !== "string" || !options.root) {
    fail("native_build_invalid");
  }
  const root = resolve(options.root);
  const runtime = runtimeFor(options);
  const receiptFile = captureSource(
    root,
    WELCOME_COINS_NATIVE_OUTPUTS.receipt,
    "native_build_receipt_invalid"
  );
  if (process.platform === "linux"
    && Number(BigInt(receiptFile.identity.mode) & 0o7777n).toString(8).padStart(4, "0") !== "0644") {
    fail("native_build_receipt_invalid");
  }
  const receiptBytes = receiptFile.bytes;
  const receipt = parsePublishedReceipt(receiptBytes);
  const outerWrapperSource = captureSource(root, NATIVE_SOURCE_PATHS.outerWrapper);
  const outerPostExecBootstrapSource = captureSource(
    root,
    NATIVE_SOURCE_PATHS.outerPostExecBootstrap
  );
  const launcherSource = captureSource(root, NATIVE_SOURCE_PATHS.launcher);
  const postExecSource = captureSource(root, NATIVE_SOURCE_PATHS.postExecBootstrap);
  if (receipt.sources.outerWrapper.sha256 !== outerWrapperSource.record.sha256
    || receipt.sources.outerWrapper.sizeBytes !== outerWrapperSource.record.sizeBytes
    || receipt.sources.outerPostExecBootstrap.sha256
      !== outerPostExecBootstrapSource.record.sha256
    || receipt.sources.outerPostExecBootstrap.sizeBytes
      !== outerPostExecBootstrapSource.record.sizeBytes
    || receipt.sources.launcher.sha256 !== launcherSource.record.sha256
    || receipt.sources.launcher.sizeBytes !== launcherSource.record.sizeBytes
    || receipt.sources.postExecBootstrap.sha256 !== postExecSource.record.sha256
    || receipt.sources.postExecBootstrap.sizeBytes !== postExecSource.record.sizeBytes
    || receipt.compiler.identitySha256 !== compilerIdentity(runtime)) {
    fail("native_build_receipt_invalid");
  }
  const outerWrapperFile = readPublishedOutput(root, receipt.outputs.outerWrapper, runtime);
  const outerPostExecBootstrapFile = readPublishedOutput(
    root,
    receipt.outputs.outerPostExecBootstrap,
    runtime
  );
  const launcherFile = readPublishedOutput(root, receipt.outputs.launcher, runtime);
  const postExecBootstrapFile = readPublishedOutput(
    root,
    receipt.outputs.postExecBootstrap,
    runtime
  );
  assertCapturedUnchanged(root, receiptFile, "native_build_receipt_invalid");
  assertCapturedUnchanged(root, outerWrapperFile, "native_build_receipt_invalid");
  assertCapturedUnchanged(root, outerPostExecBootstrapFile, "native_build_receipt_invalid");
  assertCapturedUnchanged(root, launcherFile, "native_build_receipt_invalid");
  assertCapturedUnchanged(root, postExecBootstrapFile, "native_build_receipt_invalid");
  return Object.freeze({
    receipt,
    receiptBytes,
    receiptSha256: sha256(receiptBytes),
    outputs: receipt.outputs
  });
}
