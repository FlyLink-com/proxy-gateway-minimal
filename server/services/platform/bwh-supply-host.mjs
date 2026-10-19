import { lstatSync, readFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { parseBwhSupplyHostStatus, BWH_SUPPLY_MAX_BYTES } from "./bwh-supply-status.mjs";
export { parseBwhSupplyHostStatus } from "./bwh-supply-status.mjs";

export const BWH_SUPPLY_CLIENT_PATH = "/opt/gccgw-bwh-supply-control/scripts/bwh-supply-client.mjs";
export const BWH_SUPPLY_STATUS_PATH = "/var/lib/gccgw-bwh-supply-control/status.json";
export const BWH_SUPPLY_MARKER_PATH = "/var/lib/gccgw-bwh-supply-control/native-supply-paused";
const ENV = Object.freeze({ PATH: "/usr/bin:/bin", LC_ALL: "C", TZ: "UTC" });
const MAX_BYTES = BWH_SUPPLY_MAX_BYTES;
const failure = () => Object.assign(new Error("BWH supply host unavailable"), { code: "bwh_supply_host_unavailable" });
const unavailable = () => ({ revision: "0".repeat(64), state: "unavailable", protocolsRunning: 0,
  collectorState: "unknown", nativeDistributionEnabled: false, observedAt: null, canPause: false, canEnable: false });

function trustedStatusFile({ lstat, readFile }) {
  // Root-owned, non-writable parents and no symlinks; public sanitized status
  // may be readable by the app but never writable by its unprivileged account.
  let path = BWH_SUPPLY_STATUS_PATH;
  while (true) {
    const info = lstat(path);
    if (info.uid !== 0 || (info.mode & 0o022) !== 0 || info.isSymbolicLink()
      || (path === BWH_SUPPLY_STATUS_PATH ? !info.isFile() || info.nlink !== 1 || info.size > MAX_BYTES : !info.isDirectory())) throw failure();
    if (path === "/") break; path = dirname(path);
  }
  const before = lstat(BWH_SUPPLY_STATUS_PATH), text = readFile(BWH_SUPPLY_STATUS_PATH, "utf8"), after = lstat(BWH_SUPPLY_STATUS_PATH);
  if (before.dev !== after.dev || before.ino !== after.ino || before.mtimeMs !== after.mtimeMs || before.size !== after.size) throw failure();
  return text;
}
function asyncRunner(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, windowsHide: true, env: ENV, stdio: ["pipe", "pipe", "ignore"] });
    let output = "", settled = false;
    const finish = (error, exitCode) => {
      if (settled) return; settled = true; clearTimeout(timer);
      if (error) reject(failure()); else resolve({ status: exitCode, stdout: output });
    };
    const timer = setTimeout(() => { child.kill("SIGKILL"); finish(true); }, options.timeout);
    child.stdout.on("data", chunk => {
      output += String(chunk);
      if (Buffer.byteLength(output) > MAX_BYTES) { child.kill("SIGKILL"); finish(true); }
    });
    child.on("error", () => finish(true)); child.on("close", code => finish(false, code));
    child.stdin.on("error", () => finish(true)); child.stdin.end(options.input);
  });
}

/** Fixed unprivileged AF_UNIX client; it inherits the application's NNP policy. */
export function createBwhSupplyHost({ env: _env, commandRunnerSync = spawnSync, commandRunner = asyncRunner,
  readFile = readFileSync, lstat = lstatSync, nowFn = () => new Date() } = {}) {
  const options = { encoding: "utf8", shell: false, windowsHide: true, env: ENV, maxBuffer: MAX_BYTES, stdio: ["pipe", "pipe", "ignore"] };
  const decode = result => {
    if (!result || result.status !== 0 || result.error) throw failure();
    return parseBwhSupplyHostStatus(String(result.stdout || ""), { now: nowFn().getTime() });
  };
  return {
    durableIntent: true,
    readStatus() {
      try { return decode(commandRunnerSync(process.execPath, [BWH_SUPPLY_CLIENT_PATH, "status"], { ...options, timeout: 5000, input: "" })); }
      catch { return unavailable(); }
    },
    allowsNativeDistribution() {
      try {
        const status = parseBwhSupplyHostStatus(trustedStatusFile({ lstat, readFile }), { fresh: false });
        // A durable enable decision is not invalidated merely by age. Admin
        // physical status is refreshed separately, never via a per-YAML spawn.
        if (status.state !== "enabled" || !status.nativeDistributionEnabled) return false;
        const parent = lstat(dirname(BWH_SUPPLY_MARKER_PATH));
        if (parent.uid !== 0 || (parent.mode & 0o022) !== 0 || parent.isSymbolicLink() || !parent.isDirectory()) return false;
        try { lstat(BWH_SUPPLY_MARKER_PATH); return false; } catch (error) { return error?.code === "ENOENT"; }
      } catch { return false; }
    },
    async setEnabled(input) {
      if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).length !== 2
        || typeof input.enabled !== "boolean" || typeof input.expectedRevision !== "string" || !/^[a-f0-9]{64}$/.test(input.expectedRevision)) throw failure();
      try {
        return decode(await commandRunner(process.execPath, [BWH_SUPPLY_CLIENT_PATH, input.enabled ? "enable" : "pause"],
          { ...options, timeout: 120_000, input: `${input.expectedRevision}\n` }));
      } catch { throw failure(); }
    }
  };
}
