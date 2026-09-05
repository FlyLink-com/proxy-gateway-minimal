import { createHash, randomUUID } from "node:crypto";
import { closeSync, constants, fstatSync, fsyncSync, lstatSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

export const recoveryDigest = (bytes) => createHash("sha256").update(bytes).digest("hex");
export function recoveryReject() { throw new Error("recovery_boundary_invalid"); }
export function recoveryAbsolutePath(path) {
  if (typeof path !== "string" || !path || path !== path.trim() || path.includes("\0") || !isAbsolute(path) || resolve(path) !== path) recoveryReject();
  return path;
}
function identity(a, b) { return a.dev === b.dev && a.ino === b.ino; }
export function assertRecoveryDirectory(path) {
  recoveryAbsolutePath(path);
  let current = path;
  let child;
  for (;;) {
    const stat = lstatSync(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) recoveryReject();
    if (process.platform !== "win32") {
      if (stat.uid !== 0 && stat.uid !== process.getuid()) recoveryReject();
      if (current === path && (stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o700)) recoveryReject();
      if ((stat.mode & 0o022) && !((stat.mode & 0o1000) && child?.uid === process.getuid())) recoveryReject();
    }
    const parent = dirname(current);
    if (parent === current) return lstatSync(path);
    child = stat;
    current = parent;
  }
}
function assertFile(stat) {
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) recoveryReject();
  if (process.platform !== "win32" && (stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o600)) recoveryReject();
}
function syncDirectory(path) {
  if (process.platform === "win32") return;
  const fd = openSync(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try { fsyncSync(fd); } finally { closeSync(fd); }
}
export function readRecoveryJson(path, maxBytes = 8 * 1024 * 1024) {
  recoveryAbsolutePath(path);
  const parentBefore = assertRecoveryDirectory(dirname(path));
  const before = lstatSync(path);
  assertFile(before);
  if (before.size > maxBytes) recoveryReject();
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try {
    const opened = fstatSync(fd);
    if (!identity(before, opened)) recoveryReject();
    const bytes = readFileSync(fd);
    const after = fstatSync(fd);
    if (!identity(after, lstatSync(path)) || after.size !== opened.size || after.mtimeMs !== opened.mtimeMs
      || !identity(parentBefore, assertRecoveryDirectory(dirname(path)))) recoveryReject();
    return { value: JSON.parse(bytes.toString("utf8")), sha256: recoveryDigest(bytes) };
  } finally { closeSync(fd); }
}
export function writeRecoveryJson(path, value, { replace = false } = {}) {
  recoveryAbsolutePath(path);
  const parent = dirname(path);
  const parentBefore = assertRecoveryDirectory(parent);
  let old;
  if (replace) {
    try { old = lstatSync(path); assertFile(old); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  const destination = replace ? `${path}.${randomUUID()}.partial` : path;
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  const fd = openSync(destination, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW || 0), 0o600);
  try {
    const created = fstatSync(fd);
    assertFile(created);
    writeFileSync(fd, bytes);
    fsyncSync(fd);
    if (!identity(created, lstatSync(destination)) || !identity(parentBefore, assertRecoveryDirectory(parent))) recoveryReject();
    if (replace) {
      if (old) { if (!identity(old, lstatSync(path))) recoveryReject(); }
      else { try { lstatSync(path); recoveryReject(); } catch (error) { if (error.code !== "ENOENT") throw error; } }
      renameSync(destination, path);
    }
    syncDirectory(parent);
    return recoveryDigest(bytes);
  } finally { closeSync(fd); }
}
