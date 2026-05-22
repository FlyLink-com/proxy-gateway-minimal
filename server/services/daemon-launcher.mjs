import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { resolveConsoleToken } from "./console-token.mjs";

export function createDaemonLauncher({
  rootDir,
  nodePath = process.execPath,
  env = process.env,
  spawnFn = spawn,
  tokenStorePath,
  tokenFactory,
  log = console.log
}) {
  return {
    start() {
      const tokenInfo = resolveConsoleToken({ rootDir, env, tokenStorePath, tokenFactory });
      const token = tokenInfo.token;
      const serverEntry = resolve(rootDir, "server", "index.mjs");
      const child = spawnFn(nodePath, [serverEntry], {
        cwd: rootDir,
        detached: true,
        stdio: "ignore",
        windowsHide: true,
        env: { ...env, CONSOLE_TOKEN: token }
      });

      child.unref?.();

      log(`Proxy Gateway daemon started (PID: ${child.pid})`);
      if (tokenInfo.source !== "env") {
        log(`Token stored in: ${tokenInfo.tokenStorePath}`);
      }

      return { pid: child.pid, token, generatedToken: tokenInfo.generated };
    }
  };
}
