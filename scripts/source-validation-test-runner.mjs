import { accessSync, constants, lstatSync, mkdtempSync, readdirSync, realpathSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const MODULE_DIRECTORY = dirname(fileURLToPath(import.meta.url));

export const SOURCE_VALIDATION_PROXY_CONFIG_RELATIVE_PATH =
  "config/proxy-servers.vultr-multichannel.template.json";
export const SOURCE_VALIDATION_EMPTY_ENV_RELATIVE_PATH =
  "server/tests/fixtures/source-validation-empty.env.fixture";

const SOURCE_VALIDATION_SYNTHETIC_ENVIRONMENT = Object.freeze({
  VULTR_TUIC_HOST: "tuic.example.test",
  VULTR_TUIC_UUID: "11111111-1111-4111-8111-111111111111",
  VULTR_TUIC_PASSWORD: "synthetic-tuic-password",
  VULTR_TUIC_SNI: "tuic.example.test",
  VULTR_VLESS_REALITY_HOST: "vless.example.test",
  VULTR_VLESS_REALITY_UUID: "22222222-2222-4222-8222-222222222222",
  VULTR_VLESS_REALITY_SNI: "www.example.test",
  VULTR_VLESS_REALITY_PUBLIC_KEY: "synthetic-public-key",
  VULTR_VLESS_REALITY_SHORT_ID: "synthetic-short-id",
  VULTR_HY2_HOST: "hy2.example.test",
  VULTR_HY2_PASSWORD: "synthetic-hy2-password",
  VULTR_HY2_SNI: "hy2.example.test",
  SGP_TUIC_STATIC_UUID: "33333333-3333-4333-8333-333333333333",
  SGP_TUIC_STATIC_PASSWORD: "synthetic-sgp-tuic-password",
  SGP_TUIC_HOST: "sgp.example.test",
  SGP_TUIC_SNI: "sgp.example.test",
  SGP_VLESS_REALITY_HOST: "sgp.example.test",
  SGP_VLESS_STATIC_UUID: "44444444-4444-4444-8444-444444444444",
  SGP_XRAY_VLESS_REALITY_PUBLIC_KEY: "synthetic-sgp-public-key",
  SGP_XRAY_VLESS_REALITY_SHORT_ID: "synthetic-short-id",
  SGP_HY2_HOST: "sgp.example.test",
  SGP_HY2_SNI: "sgp.example.test",
  SGP_HY2_STATIC_PASSWORD: "synthetic-sgp-hy2-password",
  SS_PASSWORD: "synthetic-source-validation-password"
});

function environmentValue(environment, expectedKey) {
  const matches = Object.keys(environment).filter(
    (key) => key.toUpperCase() === expectedKey
  );
  if (matches.length !== 1) return undefined;
  const value = environment[matches[0]];
  return typeof value === "string" ? value : undefined;
}

function physicalDirectory(path) {
  try {
    const stat = lstatSync(path);
    return stat.isDirectory()
      && !stat.isSymbolicLink()
      && resolve(realpathSync(path)).toLowerCase() === resolve(path).toLowerCase();
  } catch {
    return false;
  }
}

function trustedWindowsSystemRoot(environment) {
  const candidate = environmentValue(environment, "SYSTEMROOT")
    || environmentValue(environment, "WINDIR");
  if (!candidate || !isAbsolute(candidate) || !physicalDirectory(candidate)) return null;
  const systemRoot = realpathSync(candidate);
  const commandProcessor = resolve(systemRoot, "System32", "cmd.exe");
  return executableFile(commandProcessor) ? systemRoot : null;
}

function executableFile(path) {
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() && !stat.isSymbolicLink()) return false;
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function sourceValidationPath(environment, platform, execPath) {
  const nodeDirectory = dirname(execPath);
  if (platform !== "win32") {
    return [
      nodeDirectory,
      "/usr/bin",
      "/bin",
      "/usr/sbin",
      "/sbin",
      "/usr/local/bin",
      "/usr/local/sbin"
    ].join(":");
  }

  const directories = [nodeDirectory];
  const systemRoot = trustedWindowsSystemRoot(environment);
  if (systemRoot) {
    directories.push(
      resolve(systemRoot, "System32"),
      resolve(systemRoot),
      resolve(systemRoot, "System32", "WindowsPowerShell", "v1.0")
    );
  }
  const inheritedPath = environmentValue(environment, "PATH");
  for (const directory of inheritedPath?.split(";") || []) {
    const candidate = directory.replace(/^"|"$/gu, "");
    if (physicalDirectory(candidate) && executableFile(resolve(candidate, "git.exe"))) {
      directories.push(candidate);
    }
  }
  return [...new Set(directories.filter(Boolean))].join(";");
}

export function sanitizeSourceValidationChildEnvironment(
  environment = process.env,
  { platform = process.platform, execPath = process.execPath } = {}
) {
  if (!environment || typeof environment !== "object" || Array.isArray(environment)) {
    throw new TypeError("source_validation_environment_invalid");
  }
  const isolated = {
    LANG: "C",
    LC_ALL: "C",
    PATH: sourceValidationPath(environment, platform, execPath),
    TZ: "UTC"
  };
  if (platform === "win32") {
    const systemRoot = trustedWindowsSystemRoot(environment);
    if (systemRoot) {
      isolated.COMSPEC = resolve(systemRoot, "System32", "cmd.exe");
      isolated.PATHEXT = ".COM;.EXE;.BAT;.CMD";
      isolated.SYSTEMROOT = systemRoot;
      isolated.WINDIR = systemRoot;
    }
  }
  return isolated;
}

export function buildSourceValidationTestEnvironment(
  environment = process.env,
  {
    repositoryRoot = resolve(MODULE_DIRECTORY, ".."),
    temporaryDirectory,
    secureTemporaryDirectory
  } = {}
) {
  if ([temporaryDirectory, secureTemporaryDirectory].some((value) => value !== undefined && (
    typeof value !== "string" || !isAbsolute(value)
  ))) {
    throw new TypeError("source_validation_temporary_directory_invalid");
  }
  const isolated = sanitizeSourceValidationChildEnvironment(environment);
  Object.assign(isolated, SOURCE_VALIDATION_SYNTHETIC_ENVIRONMENT);
  isolated.NODE_ENV = "test";
  isolated.DOTENV_CONFIG_QUIET = "true";
  isolated.DOTENV_CONFIG_PATH = resolve(
    repositoryRoot,
    SOURCE_VALIDATION_EMPTY_ENV_RELATIVE_PATH
  );
  isolated.GIT_CONFIG_NOSYSTEM = "1";
  isolated.GIT_CONFIG_GLOBAL = isolated.DOTENV_CONFIG_PATH;
  isolated.GIT_TERMINAL_PROMPT = "0";
  isolated.PYTHONDONTWRITEBYTECODE = "1";
  isolated.PYTHONNOUSERSITE = "1";
  isolated.PYTHONHASHSEED = "0";
  if (temporaryDirectory !== undefined) {
    isolated.TEMP = temporaryDirectory;
    isolated.TMP = temporaryDirectory;
    isolated.TMPDIR = temporaryDirectory;
  }
  if (secureTemporaryDirectory !== undefined) {
    isolated.SOURCE_VALIDATION_SECURE_TMPDIR = secureTemporaryDirectory;
  }
  isolated.SUBSCRIPTION_PROXY_CONFIG_PATH = resolve(
    repositoryRoot,
    SOURCE_VALIDATION_PROXY_CONFIG_RELATIVE_PATH
  );
  return isolated;
}

function secureWritableTemporaryParent(path) {
  if (process.platform === "win32") return false;
  let current = resolve(path);
  let leafOwner;
  try {
    const leaf = lstatSync(current);
    if (!leaf.isDirectory() || leaf.isSymbolicLink()) return false;
    leafOwner = Number(leaf.uid);
    if (!Number.isSafeInteger(leafOwner) || leafOwner < 0) return false;
    accessSync(current, constants.W_OK | constants.X_OK);
    while (true) {
      const stat = lstatSync(current);
      if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o022) !== 0) return false;
      if (stat.uid !== 0 && stat.uid !== leafOwner) return false;
      if (resolve(realpathSync(current)) !== current) return false;
      const parent = dirname(current);
      if (parent === current) return true;
      current = parent;
    }
  } catch {
    return false;
  }
}

function sourceValidationTemporaryParent(repositoryRoot) {
  const uid = process.geteuid?.();
  const candidates = [dirname(repositoryRoot)];
  if (Number.isSafeInteger(uid) && uid >= 0) candidates.push(`/run/user/${uid}`);
  if (uid === 0) candidates.push("/run");
  candidates.push(tmpdir());
  for (const candidate of [...new Set(candidates.map((value) => resolve(value)))]) {
    if (secureWritableTemporaryParent(candidate)) return Object.freeze({ path: candidate, secure: true });
  }
  return Object.freeze({ path: tmpdir(), secure: false });
}

export function listSourceValidationTestFiles({
  repositoryRoot = resolve(MODULE_DIRECTORY, ".."),
  readDirectory = readdirSync
} = {}) {
  const testRoot = resolve(repositoryRoot, "server/tests");
  return readDirectory(testRoot, { encoding: "utf8" })
    .filter((name) => name.endsWith(".test.mjs"))
    .sort()
    .map((name) => join("server", "tests", name));
}

export function runSourceValidationTests({
  argv = process.argv.slice(2),
  repositoryRoot = resolve(MODULE_DIRECTORY, ".."),
  environment = process.env,
  spawn = spawnSync,
  stderr = process.stderr
} = {}) {
  if (!Array.isArray(argv) || !argv.every((value) => typeof value === "string")) {
    stderr.write("source_validation_test_arguments_invalid\n");
    return 2;
  }
  let files;
  try {
    files = listSourceValidationTestFiles({ repositoryRoot });
  } catch {
    stderr.write("source_validation_test_inventory_invalid\n");
    return 1;
  }
  if (files.length === 0) {
    stderr.write("source_validation_test_inventory_invalid\n");
    return 1;
  }
  let temporaryDirectory;
  let result;
  try {
    const temporaryParent = sourceValidationTemporaryParent(repositoryRoot);
    temporaryDirectory = mkdtempSync(join(temporaryParent.path, "gccgw-source-validation-"));
    result = spawn(process.execPath, [
      "--test",
      "--test-concurrency=4",
      ...argv,
      ...files
    ], {
      cwd: repositoryRoot,
      env: buildSourceValidationTestEnvironment(environment, {
        repositoryRoot,
        temporaryDirectory,
        ...(temporaryParent.secure ? { secureTemporaryDirectory: temporaryDirectory } : {})
      }),
      stdio: "inherit",
      windowsHide: true
    });
  } catch {
    stderr.write("source_validation_test_runner_failed\n");
    return 1;
  } finally {
    if (temporaryDirectory !== undefined) {
      rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  }
  if (result.error || !Number.isInteger(result.status)) {
    stderr.write("source_validation_test_runner_failed\n");
    return 1;
  }
  return result.status;
}

function isDirectExecution() {
  if (typeof process.argv[1] !== "string") return false;
  return pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
}

if (isDirectExecution()) {
  process.exitCode = runSourceValidationTests();
}
