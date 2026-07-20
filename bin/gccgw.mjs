#!/usr/bin/env node
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import {
  buildBackupPreflightReport,
  buildPackageApplyPlan,
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
import { createFileBackedEdgeCredentialMaterialStore } from "../server/services/edge/credential-material-store.mjs";
import { buildProtectedMaterialHandoffPreflight } from "../server/services/edge/material-handoff-preflight.mjs";
import { createReadOnlyMaterialHandoffControlStore } from "../server/services/edge/material-handoff-readonly-control-store.mjs";
import { createSqliteSubscriptionControlStore } from "../server/services/platform/subscription-control-db.mjs";
import { createSqliteSubscriptionStore } from "../server/services/subscriptions/repository.mjs";

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
    "SUBSCRIPTION_CONTROL_DB_PATH",
    "HANDOFF_DIR",
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
  const relativePath = relative(rootDir, targetPath);
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
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

function readJsonPlanFile(planPath, label) {
  if (!planPath) {
    throw new Error(`${label} is required`);
  }
  const resolved = resolve(rootDir, planPath);
  if (!pathInsideRoot(resolved)) {
    throw new Error(`${label} must be inside the repository`);
  }
  return JSON.parse(readFileSync(resolved, "utf8"));
}

function readJsonFileInsideRoot(inputPath) {
  if (!inputPath) {
    throw new Error("JSON input path is required");
  }
  const resolved = resolve(rootDir, inputPath);
  if (!pathInsideRoot(resolved)) {
    throw new Error("JSON input path must be inside the repository");
  }
  return JSON.parse(readFileSync(resolved, "utf8"));
}

function requiredExistingPath(inputPath, label) {
  if (!inputPath) {
    throw new Error(`${label} is required`);
  }
  if (!existsSync(inputPath)) {
    throw new Error(`${label} does not exist`);
  }
  return inputPath;
}

async function runEdgeMaterialHandoffPreflight(command) {
  const controlDbPath = requiredExistingPath(command.controlDbPath, "--control-db");
  const materialFilePath = requiredExistingPath(command.materialFilePath, "--material-file");
  const controlStore = createReadOnlyMaterialHandoffControlStore({ dbPath: controlDbPath });
  try {
    const credentialMaterialStore = createFileBackedEdgeCredentialMaterialStore({ filePath: materialFilePath });
    return buildProtectedMaterialHandoffPreflight({
      controlStore,
      credentialMaterialStore,
      nodeRef: command.nodeRef
    });
  } finally {
    controlStore.close?.();
  }
}

function renderEnvSkeleton({ configurePlan, importPlan }) {
  const skeleton = [];
  skeleton.push("# Generated by gccgw package apply.");
  skeleton.push("# Fill secret values on the host only. Do not commit this file.");
  skeleton.push("NODE_ENV=production");
  skeleton.push(`PUBLIC_SUBSCRIPTION_BASE_URL=${configurePlan.publicBaseUrl?.configured ? `https://${configurePlan.publicBaseUrl.host}` : "__SET_PUBLIC_BASE_URL__"}`);
  skeleton.push(`SUBSCRIPTION_DB_PATH=${configurePlan.derivedPaths.runtimeDbPath}`);
  skeleton.push(`SUBSCRIPTION_CONTROL_DB_PATH=${configurePlan.derivedPaths.controlDbPath}`);
  skeleton.push(`HANDOFF_DIR=${configurePlan.derivedPaths.handoffDir}`);
  skeleton.push(`CONSOLE_PORT=${configurePlan.install?.consolePort || 3456}`);
  const cidrs = configurePlan.management?.adminAllowedCidrs || [];
  skeleton.push(`ADMIN_ALLOWED_CIDRS=${cidrs.join(",")}`);
  skeleton.push("TRUSTED_PROXY_CIDRS=");
  skeleton.push("SUB_RATE_LIMIT_WINDOW_MS=60000");
  skeleton.push("SUB_RATE_LIMIT_MAX=30");
  skeleton.push("SUBSCRIPTION_TEMP_LINK_TTL_MINUTES=1440");
  for (const envItem of importPlan?.plannedOperations || []) {
    if (envItem.id === "prepare-env-requirements") {
      skeleton.push("# Required runtime env count is recorded in the reviewed package import plan.");
    }
  }
  skeleton.push("CONSOLE_TOKEN=__SET_ON_HOST__");
  skeleton.push("SS_PASSWORD=__SET_ON_HOST__");
  skeleton.push("USER_PORTAL_PAYMENT_CHECKOUT_ENABLED=");
  skeleton.push("PAYMENT_PROVIDER=");
  skeleton.push("PAYMENT_MODE=");
  skeleton.push("PAYMENT_PROVIDER_CURRENCY=");
  skeleton.push("PAYMENT_PROVIDER_BRAND_NAME=");
  skeleton.push("PAYMENT_PLAN_MONTHLY_BASIC_AMOUNT_MINOR=");
  skeleton.push("PAYMENT_PLAN_MONTHLY_PLUS_AMOUNT_MINOR=");
  skeleton.push("PAYMENT_PLAN_YEARLY_AMOUNT_MINOR=");
  skeleton.push("PAYMENT_PROVIDER_API_KEY=");
  skeleton.push("PAYMENT_PROVIDER_API_SECRET=");
  skeleton.push("PAYMENT_PROVIDER_WEBHOOK_SECRET=");
  skeleton.push("PAYMENT_PROVIDER_CLIENT_ID=");
  skeleton.push("PAYMENT_PROVIDER_MERCHANT_ID=");
  skeleton.push("PAYMENT_PROVIDER_APP_ID=");
  skeleton.push("PAYMENT_PROVIDER_CERT_SERIAL=");
  skeleton.push("PAYMENT_PROVIDER_PRIVATE_KEY_PATH=");
  skeleton.push("PAYMENT_PROVIDER_PLATFORM_PUBLIC_KEY_PATH=");
  skeleton.push("PAYMENT_RETURN_URL=");
  skeleton.push("PAYMENT_CANCEL_URL=");
  skeleton.push("PAYMENT_PUBLIC_BASE_URL=");
  skeleton.push("CHANNEL_LAB_B_TUIC_HOST=");
  skeleton.push("CHANNEL_LAB_B_TUIC_UUID=");
  skeleton.push("CHANNEL_LAB_B_TUIC_PASSWORD=");
  skeleton.push("CHANNEL_LAB_B_TUIC_CERT=");
  return `${skeleton.join("\n")}\n`;
}

function writeIfAbsent(path, content) {
  if (existsSync(path)) {
    return "exists";
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, { mode: 0o600 });
  return "written";
}

function applyReviewedPackagePlan({ applyPlan, configurePlan, importPlan }) {
  const serviceDir = configurePlan.derivedPaths.serviceWorkingDirectory;
  const metadataDir = resolve(serviceDir, ".proxy-gateway");
  mkdirSync(metadataDir, { recursive: true });
  mkdirSync(applyPlan.materialTargets.handoffDir, { recursive: true, mode: 0o700 });

  const envStatus = writeIfAbsent(
    applyPlan.materialTargets.envSkeletonPath,
    renderEnvSkeleton({ configurePlan, importPlan })
  );

  const runtimeStore = createSqliteSubscriptionStore({ dbPath: applyPlan.materialTargets.runtimeDbPath });
  runtimeStore.close();
  const controlStore = createSqliteSubscriptionControlStore({ dbPath: applyPlan.materialTargets.controlDbPath });
  controlStore.close();

  const metadataPath = resolve(metadataDir, "package-apply-summary.json");
  writeIfAbsent(metadataPath, JSON.stringify({
    type: "gccgw_package_apply_summary",
    packageName: applyPlan.packageName,
    packageKind: applyPlan.packageKind,
    environment: applyPlan.environment,
    materialTargets: applyPlan.materialTargets,
    redacted: true
  }, null, 2));

  return {
    envSkeleton: envStatus,
    runtimeSqlite: "initialized",
    controlSqlite: "initialized",
    handoffDir: "prepared",
    metadata: existsSync(metadataPath) ? "present" : "unknown"
  };
}

async function runPackageApply(command) {
  if (!command.executeProductionMutation) {
    process.stderr.write("--execute-production-mutation is required for package apply.\n");
    return 1;
  }
  if (!command.apply) {
    process.stderr.write("--apply is required for package apply.\n");
    return 1;
  }
  if (process.platform !== "linux") {
    process.stderr.write("gccgw package apply can only run on a Linux target host.\n");
    return 1;
  }
  const files = readPackageInputFiles(command, "package apply");
  if (!files) return 1;

  let importPlan;
  let configurePlan;
  try {
    importPlan = readJsonPlanFile(command.importPlanPath, "--import-plan");
    configurePlan = readJsonPlanFile(command.configPlanPath, "--config-plan");
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    return 1;
  }

  const packageName = packageNameFromDir(command.packageDir);
  const freshImportPlan = buildPackageImportDryRunReport({ packageName, files });
  if (!freshImportPlan.ok) {
    writeReport(freshImportPlan, command.format);
    return 1;
  }
  if (importPlan.packageName !== packageName) {
    process.stderr.write("reviewed import plan does not match package directory.\n");
    return 1;
  }

  const applyPlan = buildPackageApplyPlan({
    packageName,
    importPlan,
    configurePlan
  });
  if (!applyPlan.ok) {
    writeReport(applyPlan, command.format);
    return 1;
  }

  const applied = applyReviewedPackagePlan({ applyPlan, configurePlan, importPlan });
  writeReport({
    ...applyPlan,
    applied
  }, command.format);
  return 0;
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
    runPackageApply,
    runPackageInspect,
    runInstallConfigure,
    runEdgeMaterialHandoffPreflight,
    readJsonFile: readJsonFileInsideRoot,
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
