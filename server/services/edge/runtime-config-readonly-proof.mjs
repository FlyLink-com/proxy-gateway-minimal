import { closeSync, constants, fstatSync, lstatSync, openSync, readSync } from "node:fs";

// Same bounded file and systemd start-time proof as the existing Xray adapter.
const MAX_BYTES = 4 * 1024 * 1024;
const sameFile = (left, right) => ["dev", "ino", "size", "mtimeMs", "ctimeMs"].every(key => left[key] === right[key]);
const invalid = () => { throw new Error("active_config_unverified"); };

export function readActiveConfigFile(path) {
  let before;
  try { before = lstatSync(path); } catch (error) { if (error.code === "ENOENT") return null; throw error; }
  if (!before.isFile() || before.size > MAX_BYTES) invalid();
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try {
    const opened = fstatSync(fd);
    if (!opened.isFile() || !sameFile(before, opened)) invalid();
    const bytes = Buffer.alloc(opened.size + 1);
    let size = 0;
    while (size < bytes.length) {
      const count = readSync(fd, bytes, size, bytes.length - size, null);
      if (!count) break;
      size += count;
    }
    if (size !== opened.size || !sameFile(opened, fstatSync(fd)) || !sameFile(opened, lstatSync(path))) invalid();
    return bytes.subarray(0, size).toString("utf8");
  } finally { closeSync(fd); }
}

export function validateRunningConfigFile(path, serviceName, commandRunner) {
  const before = lstatSync(path);
  const result = commandRunner("systemctl", ["show", serviceName, "--property=ActiveState", "--property=MainPID", "--property=ExecMainStartTimestamp", "--timestamp=us+utc"]) || {};
  const after = lstatSync(path);
  if (!sameFile(before, after) || !after.isFile() || result.exitCode !== 0) invalid();
  const fields = {};
  for (const line of String(result.stdout || "").trim().split("\n")) {
    const split = line.indexOf("="), key = line.slice(0, split);
    if (split < 1 || !["ActiveState", "MainPID", "ExecMainStartTimestamp"].includes(key) || Object.hasOwn(fields, key)) invalid();
    fields[key] = line.slice(split + 1).trim();
  }
  if (["inactive", "failed", "activating", "deactivating"].includes(fields.ActiveState)) return {loaded:false};
  const stamp = /^\w{3} (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})\.(\d{6}) UTC$/.exec(fields.ExecMainStartTimestamp || "");
  if (fields.ActiveState !== "active" || !/^[1-9]\d*$/.test(fields.MainPID || "") || !stamp) invalid();
  const startedMs = Date.parse(`${stamp[1]}T${stamp[2]}Z`) + Number(stamp[3]) / 1000;
  if (!Number.isFinite(startedMs)) invalid();
  return {loaded:startedMs >= Math.max(after.mtimeMs, after.ctimeMs), processRef:`${fields.MainPID}:${fields.ExecMainStartTimestamp}`};
}

function sameManagedYaml(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  // Only line endings and the generated, top-level diagnostic comment differ.
  // Never parse/rewrite YAML or ignore any functional setting or user material.
  const normalize = value => value.replaceAll("\r\n", "\n").replace(/^# desired-state-ref: [^\n]*\n/gm, "");
  return normalize(left) === normalize(right);
}

export function inspectUnchangedUdpConfig({candidateConfig, readActiveConfig, validateRunningConfig, validateService, validateListener, runConfigTest}) {
  const active = typeof readActiveConfig === "function" ? readActiveConfig() : null;
  if (!sameManagedYaml(active, candidateConfig) || typeof validateRunningConfig !== "function"
    || typeof validateService !== "function" || typeof validateListener !== "function") return {status:"apply"};
  const healthy = () => {
    const service = validateService({readOnly:true}) || {}, listener = validateListener({readOnly:true}) || {};
    if (typeof service.active !== "boolean" || typeof listener.udp443 !== "boolean") invalid();
    return service.active && listener.udp443;
  };
  if (!healthy()) return {status:"apply"};
  const running = validateRunningConfig() || {};
  if (typeof running.loaded !== "boolean") invalid();
  if (!running.loaded) return {status:"apply"};
  if (typeof running.processRef !== "string" || !running.processRef) invalid();
  const configTest = runConfigTest({active:true}) || {};
  const exitCode = Number.isInteger(configTest.exitCode) ? configTest.exitCode : 1;
  if (exitCode !== 0) return {status:"failed", exitCode};
  if (!healthy()) return {status:"failed"};
  const after = validateRunningConfig() || {};
  if (!after.loaded || after.processRef !== running.processRef || readActiveConfig() !== active) return {status:"failed"};
  return {status:"unchanged", exitCode, skipped:configTest.skipped === true};
}
