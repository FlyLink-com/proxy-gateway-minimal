// Simple startup script — runs forever, outputs to log
import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { appendFileSync, mkdirSync } from "node:fs";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)));
const logDir = resolve(rootDir, ".proxy-gateway");
const consolePort = Number.parseInt(process.env.CONSOLE_PORT, 10) || 3456;

mkdirSync(logDir, { recursive: true });

const child = spawn(process.execPath, [resolve(rootDir, "server", "index.mjs")], {
  cwd: rootDir,
  detached: true,
  stdio: "ignore",
  windowsHide: true,
  env: { ...process.env }
});

// Write PID so we can find it
appendFileSync(resolve(logDir, "daemon.pid"), `${child.pid}\n`);

child.unref();

console.log(`Proxy Gateway daemon started`);
console.log(`  PID: ${child.pid}`);
console.log(`  Token stored in: ${rootDir}/.proxy-gateway/console-token`);
console.log(`  Console: http://127.0.0.1:${consolePort}/`);
