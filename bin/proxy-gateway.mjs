#!/usr/bin/env node
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildPackageScriptSpawn,
  buildCliHelp,
  redactNetworkStatus,
  runProxyGatewayCli
} from "../server/services/cli/router.mjs";
import { installProcessHandlers, startProxyGateway } from "../server/start.mjs";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

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

async function startServer() {
  const handle = await startProxyGateway();
  installProcessHandlers(handle);
  return 0;
}

try {
  const exitCode = await runProxyGatewayCli(process.argv.slice(2), {
    runNodeScript,
    runPackageScript,
    runGitDiffCheck,
    runEnvCheck,
    runNetworkStatus,
    startServer
  });
  if (Number.isInteger(exitCode)) {
    process.exitCode = exitCode;
  }
} catch (error) {
  process.stderr.write(`${error.message}\n\n${buildCliHelp()}`);
  process.exitCode = 1;
}
