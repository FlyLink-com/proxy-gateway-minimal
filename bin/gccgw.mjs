#!/usr/bin/env node
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import {
  buildBackupPreflightReport,
  buildPackageScriptSpawn,
  buildCliHelp,
  buildGccgwSelfCheckReport,
  buildInstallConfigurePlan,
  buildInstallPreflightReport,
  buildPackageImportDryRunReport,
  buildPackageInspectReport,
  buildReleaseStatusReport,
  redactNetworkStatus,
  runProxyGatewayCli
} from "../server/services/cli/router.mjs";
import { installProcessHandlers, startProxyGateway } from "../server/start.mjs";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGE_INSPECT_FILES = [
  "package-manifest.json",
  "topology.json",
  "public-boundary.json",
  "plans.json",
  "nodes.json",
  "env.required.json",
  "runbook.md"
];

async function runNodeScript(script, args) {
  const result = spawnSync(process.execPath, [resolve(rootDir, script), ...args], {
    cwd: rootDir,
    env: process.env,
    stdio: "inherit"
  });
  if (result.error) {
    throw result.error;
  }
  return result.status ?? 1;
}

async function runPackageScript(script) {
  const { command, args } = buildPackageScriptSpawn(script);
  const result = spawnSync(command, args, {
    cwd: rootDir,
    env: process.env,
    stdio: "inherit"
  });
  if (result.error) {
    throw result.error;
  }
  return result.status ?? 1;
}

async function runGitDiffCheck() {
  const result = spawnSync("git", ["diff", "--check", "origin/master...HEAD"], {
    cwd: rootDir,
    env: process.env,
    stdio: "inherit"
  });
  if (result.error) {
    throw result.error;
  }
  return result.status ?? 1;
}

async function runNetworkStatus() {
  const result = spawnSync("powershell", [
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    resolve(rootDir, "scripts/network-doctor.ps1"),
    "status",
    "-Json"
  ], {
    cwd: rootDir,
    env: process.env,
    encoding: "utf8"
  });
  if (result.error) {
    throw result.error;
  }
  try {
    const status = JSON.parse(result.stdout || "{}");
    process.stdout.write(`${JSON.stringify(redactNetworkStatus(status), null, 2)}\n`);
  } catch {
    process.stderr.write("network status returned unreadable output\n");
    return 1;
  }
  if (result.stderr) {
    process.stderr.write("network status completed with redacted diagnostics\n");
  }
  return result.status ?? 1;
}

async function runEnvCheck() {
  const required = [
    "CONSOLE_TOKEN",
    "SS_PASSWORD",
    "SUBSCRIPTION_DB_PATH",
    "PUBLIC_SUBSCRIPTION_BASE_URL"
  ];
  const summary = required.map((name) => {
    const value = process.env[name] || "";
    const configured = value.trim() !== "";
    const placeholder = /replace_with|example|placeholder/i.test(value);
    return {
      name,
      configured,
      placeholder
    };
  });
  process.stdout.write(`${JSON.stringify({ ok: summary.every((item) => item.configured && !item.placeholder), variables: summary }, null, 2)}\n`);
  return summary.every((item) => item.configured && !item.placeholder) ? 0 : 1;
}

function packageJsonFacts() {
  try {
    const packageJson = JSON.parse(readFileSync(resolve(rootDir, "package.json"), "utf8"));
    return {
      npmCliScriptConfigured: packageJson?.scripts?.cli === "node bin/gccgw.mjs",
      packageBinConfigured: packageJson?.bin?.gccgw === "./bin/gccgw.mjs"
    };
  } catch {
    return {
      npmCliScriptConfigured: false,
      packageBinConfigured: false
    };
  }
}

function globalGccgwCommandAvailable() {
  return commandAvailable("gccgw");
}

function commandAvailable(command) {
  const result = process.platform === "win32"
    ? spawnSync("where.exe", [command], { cwd: rootDir, env: process.env, encoding: "utf8" })
    : spawnSync("sh", ["-lc", `command -v ${command} >/dev/null 2>&1`], { cwd: rootDir, env: process.env, encoding: "utf8" });
  return result.status === 0;
}

async function runSelfCheck() {
  const facts = packageJsonFacts();
  const report = buildGccgwSelfCheckReport({
    nodeVersion: process.version,
    npmCliScriptConfigured: facts.npmCliScriptConfigured,
    localBinExists: existsSync(resolve(rootDir, "bin/gccgw.mjs")),
    packageBinConfigured: facts.packageBinConfigured,
    globalCommandAvailable: globalGccgwCommandAvailable()
  });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return report.ok ? 0 : 1;
}

function writeReport(report, format) {
  if (format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

function pathInsideRoot(targetPath) {
  const relativePath = targetPath.startsWith(rootDir)
    ? targetPath.slice(rootDir.length)
    : "";
  return relativePath === "" || /^[\\/]/.test(relativePath);
}

async function runPackageInspect(command) {
  const files = readPackageInputFiles(command, "package inspect");
  if (!files) return 1;

  const report = buildPackageInspectReport({
    packageName: packageNameFromDir(command.packageDir),
    files
  });
  writeReport(report, command.format);
  return report.ok ? 0 : 1;
}

async function runPackageImportDryRun(command) {
  const files = readPackageInputFiles(command, "package import --dry-run");
  if (!files) return 1;

  const report = buildPackageImportDryRunReport({
    packageName: packageNameFromDir(command.packageDir),
    files
  });
  writeReport(report, command.format);
  return report.ok ? 0 : 1;
}

async function runInstallConfigure(command) {
  const report = buildInstallConfigurePlan({
    domain: command.domain,
    installDir: command.installDir,
    managementSource: command.managementSource,
    consolePort: command.consolePort,
    targetRole: command.targetRole
  });
  writeReport(report, command.format);
  return report.ok ? 0 : 1;
}

function packageNameFromDir(packageDir) {
  return packageDir?.split(/[\\/]/).filter(Boolean).at(-1) || "unknown";
}

function readPackageInputFiles(command, label) {
  if (!command.packageDir) {
    process.stderr.write(`${label} requires a package directory\n`);
    return null;
  }
  const packageRoot = resolve(rootDir, command.packageDir);
  if (!pathInsideRoot(packageRoot)) {
    process.stderr.write(`${label} only accepts package directories inside the repository\n`);
    return null;
  }

  const files = {};
  for (const file of PACKAGE_INSPECT_FILES) {
    const filePath = resolve(packageRoot, file);
    if (!pathInsideRoot(filePath) || !existsSync(filePath)) {
      continue;
    }
    files[file] = readFileSync(filePath, "utf8");
  }
  return files;
}

async function runInstallPreflight(command) {
  const report = buildInstallPreflightReport({
    platform: process.platform,
    files: {
      packageJson: existsSync(resolve(rootDir, "package.json")),
      bootstrap: existsSync(resolve(rootDir, "ops/edge-node/bootstrap.sh")),
      consoleUnit: existsSync(resolve(rootDir, "ops/edge-node/systemd/proxy-gateway-console.service")),
      ssUnit: existsSync(resolve(rootDir, "ops/edge-node/systemd/proxy-gateway-ss.service")),
      nginxTemplate: existsSync(resolve(rootDir, "ops/edge-node/nginx/proxy-gateway-public.conf")),
      envTemplate: existsSync(resolve(rootDir, "ops/edge-node/templates/env.example"))
    },
    commands: {
      node: commandAvailable("node"),
      npm: commandAvailable("npm"),
      git: commandAvailable("git"),
      bash: commandAvailable("bash"),
      systemctl: commandAvailable("systemctl"),
      nginx: commandAvailable("nginx")
    },
    isRoot: typeof process.getuid === "function" && process.getuid() === 0
  });
  writeReport(report, command.format);
  return report.ok ? 0 : 1;
}

async function runBackupPreflight(command) {
  const report = buildBackupPreflightReport({
    mode: command.mode,
    platform: process.platform,
    files: {
      backupScript: existsSync(resolve(rootDir, "scripts/backup-subscriptions.sh")),
      restoreScript: existsSync(resolve(rootDir, "scripts/restore-subscriptions.sh"))
    },
    commands: {
      bash: commandAvailable("bash"),
      sqlite3: commandAvailable("sqlite3"),
      systemctl: commandAvailable("systemctl")
    }
  });
  writeReport(report, command.format);
  return report.ok ? 0 : 1;
}

function gitFact(args) {
  const result = spawnSync("git", args, {
    cwd: rootDir,
    env: process.env,
    encoding: "utf8"
  });
  if (result.status !== 0) {
    return "unknown";
  }
  return String(result.stdout || "").trim() || "unknown";
}

async function runReleaseStatus(command) {
  const report = buildReleaseStatusReport({
    platform: process.platform,
    files: {
      packageJson: existsSync(resolve(rootDir, "package.json")),
      releaseJson: existsSync(resolve(rootDir, "RELEASE.json"))
    },
    git: {
      branch: gitFact(["branch", "--show-current"]),
      head: gitFact(["rev-parse", "--short=12", "HEAD"])
    }
  });
  writeReport(report, command.format);
  return report.ok ? 0 : 1;
}

function serviceActive(serviceName) {
  if (process.platform !== "linux") {
    return {
      supported: false,
      active: false
    };
  }
  const result = spawnSync("systemctl", ["is-active", serviceName], {
    cwd: rootDir,
    env: process.env,
    encoding: "utf8"
  });
  return {
    supported: true,
    active: result.status === 0
  };
}

function commandStatus(command, args) {
  if (process.platform !== "linux") {
    return {
      supported: false,
      ok: false
    };
  }
  const result = spawnSync(command, args, {
    cwd: rootDir,
    env: process.env,
    encoding: "utf8"
  });
  return {
    supported: true,
    ok: result.status === 0
  };
}

async function runServiceStatus(command) {
  const report = {
    type: "gccgw_service_status",
    generatedBy: "gccgw service status",
    ok: false,
    platform: process.platform,
    services: {
      console: serviceActive("proxy-gateway-console.service"),
      shadowsocks: serviceActive("proxy-gateway-ss.service"),
      nginx: serviceActive("nginx.service")
    },
    checks: {
      nginxConfig: commandStatus("nginx", ["-t"]),
      localHealth: commandStatus("curl", ["-fsS", "http://127.0.0.1:3456/api/health"])
    },
    redacted: true
  };
  report.ok = Object.values(report.services).every((service) => service.supported && service.active)
    && Object.values(report.checks).every((check) => check.supported && check.ok);
  writeReport(report, command.format);
  return report.ok ? 0 : 1;
}

async function startServer() {
  const handle = await startProxyGateway();
  installProcessHandlers(handle);
  return 0;
}

async function confirmRiskAExecution(approval) {
  const phrase = `EXECUTE ${approval.command}`;
  process.stderr.write([
    "",
    "Risk A execution approval required.",
    `Command: ${approval.command}`,
    `Mode: ${approval.mode}`,
    `Docs: ${approval.sourceDocs.join(", ")}`,
    "This prompt appears before the underlying script is dispatched.",
    `Type exactly: ${phrase}`,
    ""
  ].join("\n"));

  if (!process.stdin.isTTY) {
    process.stderr.write("Non-interactive stdin; refusing Risk A execution.\n");
    return false;
  }

  const readline = createInterface({
    input: process.stdin,
    output: process.stderr
  });
  try {
    const answer = await readline.question("> ");
    return answer.trim() === phrase;
  } finally {
    readline.close();
  }
}

try {
  const exitCode = await runProxyGatewayCli(process.argv.slice(2), {
    runNodeScript,
    runPackageScript,
    runGitDiffCheck,
    runEnvCheck,
    runSelfCheck,
    runInstallPreflight,
    runBackupPreflight,
    runReleaseStatus,
    runServiceStatus,
    runNetworkStatus,
    runPackageImportDryRun,
    runPackageInspect,
    runInstallConfigure,
    startServer,
    confirmRiskAExecution
  });
  if (Number.isInteger(exitCode)) {
    process.exitCode = exitCode;
  }
} catch (error) {
  process.stderr.write(`${error.message}\n\n${buildCliHelp()}`);
  process.exitCode = 1;
}
