import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

export function createSsLocalService({
  ssPath,
  templatePath,
  tempDir = tmpdir(),
  env = process.env,
  socksPort = 1080,
  spawnFn,
  isPortListeningFn,
  startupDelayMs = 2000,
  logger = console
}) {
  let child = null;
  let starting = false;
  const tempFiles = new Set();

  function cleanupTempFile(path) {
    try {
      unlinkSync(path);
    } catch {
      return;
    } finally {
      tempFiles.delete(path);
    }
  }

  function generateConfig() {
    const raw = readFileSync(templatePath, "utf8");
    const config = JSON.parse(raw.replace(/\$\{SS_PASSWORD\}/g, env.SS_PASSWORD || ""));
    const path = join(tempDir, `ss-local-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
    writeFileSync(path, JSON.stringify(config));
    tempFiles.add(path);
    return path;
  }

  async function start() {
    if (child && !child.killed) {
      return { ok: false, msg: "already running" };
    }
    if (starting) {
      return { ok: false, msg: "already starting" };
    }

    starting = true;
    try {
      if (await isPortListeningFn(socksPort)) {
        return { ok: false, msg: `Port ${socksPort} already in use by another process` };
      }

      const configPath = generateConfig();
      child = spawnFn(ssPath, ["-c", configPath, "-U"], {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true
      });

      child.stdout?.on("data", (data) => logger.log("[sslocal]", data.toString().trim()));
      child.stderr?.on("data", (data) => logger.log("[sslocal]", data.toString().trim()));

      child.on("exit", (code) => {
        logger.log(`[sslocal] exit ${code}`);
        cleanupTempFile(configPath);
        child = null;
        starting = false;
      });

      setTimeout(() => cleanupTempFile(configPath), 3000).unref?.();
      await new Promise((resolve) => setTimeout(resolve, startupDelayMs));

      if (!child || child.killed) {
        return { ok: false, msg: "ss-local process exited unexpectedly" };
      }

      return { ok: true, msg: "ss-local starting...", pid: child.pid };
    } finally {
      starting = false;
    }
  }

  async function stop() {
    if (child && !child.killed) {
      child.kill("SIGTERM");
      try {
        child.kill("SIGKILL");
      } catch {
        return { ok: true };
      }
    }
    child = null;
    return { ok: true };
  }

  function status() {
    return {
      running: Boolean(child && !child.killed),
      starting,
      pid: child && !child.killed ? child.pid : null
    };
  }

  function cleanupAllTempFiles() {
    for (const file of tempFiles) {
      cleanupTempFile(file);
    }
  }

  return { start, stop, status, cleanupAllTempFiles };
}
