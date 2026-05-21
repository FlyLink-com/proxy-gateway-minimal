import { spawn } from "node:child_process";

const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_MAX_OUTPUT = 16_000;

export function runCommand(command, args = [], options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxOutput = options.maxOutput ?? DEFAULT_MAX_OUTPUT;
  const env = options.env ?? process.env;

  return new Promise((resolve) => {
    const child = spawn(command, args, {
      env,
      shell: false,
      windowsHide: true
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 1500).unref();
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout = (stdout + chunk.toString()).slice(-maxOutput);
    });

    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk.toString()).slice(-maxOutput);
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({
        ok: false,
        code: -1,
        stdout: stdout.trim(),
        stderr: `${stderr.trim()}${stderr.trim() ? "\n" : ""}${error.message}`,
        timedOut
      });
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        ok: code === 0 && !timedOut,
        code: code ?? -1,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        timedOut
      });
    });
  });
}

export function createCommandRunner(commandSpecs) {
  return async function runKnownCommand(name, overrides = {}) {
    const spec = commandSpecs[name];
    if (!spec) {
      return {
        ok: false,
        code: -1,
        stdout: "",
        stderr: `Command not allowed: ${name}`,
        timedOut: false
      };
    }

    return runCommand(spec.command, spec.args, {
      timeoutMs: spec.timeoutMs,
      maxOutput: spec.maxOutput,
      env: spec.env,
      ...overrides
    });
  };
}
