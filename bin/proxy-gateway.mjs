#!/usr/bin/env node
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildCliHelp,
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

async function startServer() {
  const handle = await startProxyGateway();
  installProcessHandlers(handle);
  return 0;
}

try {
  const exitCode = await runProxyGatewayCli(process.argv.slice(2), {
    runNodeScript,
    startServer
  });
  if (Number.isInteger(exitCode)) {
    process.exitCode = exitCode;
  }
} catch (error) {
  process.stderr.write(`${error.message}\n\n${buildCliHelp()}`);
  process.exitCode = 1;
}
