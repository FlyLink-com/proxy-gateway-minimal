import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverEntry = resolve(__dirname, "server", "index.mjs");

const child = spawn("node", [serverEntry], {
  cwd: __dirname,
  detached: true,
  stdio: "ignore",
  windowsHide: true
});

child.unref();

console.log("Proxy Gateway daemon started (PID:", child.pid, ")");
process.exit(0);
