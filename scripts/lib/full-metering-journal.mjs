// Protected write-ahead intent, not a second accounting ledger. The database
// adapter MUST atomically insert deterministic, collision-checked sample IDs.
// A durable intent is replayed before any new observation; there is no implicit
// initialization after missing/corrupt state and no automatic stale-lock removal.
import { createHash, randomUUID } from "node:crypto";
import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

const MAX_BYTES = 32 * 1024 * 1024;
const fail = code => { throw Object.assign(new Error(code), { code }); };
export function fullMeteringDigest(value) {
  const canonical = item => Array.isArray(item) ? `[${item.map(canonical).join(",")}]`
    : item && typeof item === "object" ? `{${Object.keys(item).sort().map(key => `${JSON.stringify(key)}:${canonical(item[key])}`).join(",")}}`
      : JSON.stringify(item);
  const serialized = canonical(value);
  if (!serialized || serialized.length > MAX_BYTES) fail("full_metering_payload_invalid");
  return createHash("sha256").update(serialized).digest("hex");
}
function protectedPath(path, directory = false) {
  if (!isAbsolute(path)) fail("full_metering_path_invalid");
  const info = lstatSync(path);
  const norm = value => process.platform === "win32" ? value.toLowerCase() : value;
  if (info.isSymbolicLink() || (directory ? !info.isDirectory() : !info.isFile())
    || norm(realpathSync(path)) !== norm(resolve(path))) fail("full_metering_path_invalid");
  if (process.platform !== "win32" && ((info.mode & 0o077) !== 0 || info.uid !== process.getuid())) fail("full_metering_permissions_invalid");
  if (!directory && (info.nlink !== 1 || info.size > MAX_BYTES)) fail("full_metering_file_invalid");
}
function syncDirectory(directory) {
  // Windows cannot fsync a directory handle; privileged Linux validation must
  // exercise this branch before promotion. File fsync is required everywhere.
  if (process.platform === "win32") return;
  const fd = openSync(directory, "r");
  try { fsyncSync(fd); } finally { closeSync(fd); }
}
function checkContext(context) {
  if (!context || Object.keys(context).sort().join(",") !== "databaseIdentityDigest,scopeDigest"
    || Object.values(context).some(value => !/^[a-f0-9]{64}$/.test(value))) fail("full_metering_context_invalid");
}
function envelope(context, payload) {
  checkContext(context);
  const body = { version: 1, context, payload };
  return { ...body, digest: fullMeteringDigest(body) };
}
function read(directory, name, context) {
  protectedPath(directory, true);
  const path = join(directory, name);
  protectedPath(path);
  let data;
  try { data = JSON.parse(readFileSync(path, "utf8")); } catch { fail("full_metering_json_invalid"); }
  if (data?.version !== 1 || Object.keys(data).sort().join(",") !== "context,digest,payload,version"
    || data.digest !== fullMeteringDigest({ version: data.version, context: data.context, payload: data.payload })) fail("full_metering_digest_invalid");
  if (fullMeteringDigest(data.context) !== fullMeteringDigest(context)) fail("full_metering_context_changed");
  return data.payload;
}
function write(directory, name, context, payload, exclusive = false) {
  protectedPath(directory, true);
  const target = join(directory, name);
  if (existsSync(target)) {
    protectedPath(target);
    if (exclusive) fail("full_metering_pending_recovery_required");
  }
  const temporary = join(directory, `.${name}.${randomUUID()}.tmp`);
  const fd = openSync(temporary, "wx", 0o600);
  try { writeFileSync(fd, JSON.stringify(envelope(context, payload))); fsyncSync(fd); }
  finally { closeSync(fd); }
  renameSync(temporary, target);
  syncDirectory(directory);
}
function removePending(directory) {
  protectedPath(join(directory, "pending.json"));
  unlinkSync(join(directory, "pending.json"));
  syncDirectory(directory);
}
function applySynchronously(applySamples, samples) {
  const result = applySamples(samples);
  if (result && typeof result.then === "function") fail("full_metering_async_writer_unsupported");
  return result;
}
export function initializeFullMeteringJournal({ directory, context, checkpoint }) {
  checkContext(context);
  if (!isAbsolute(directory)) fail("full_metering_path_invalid");
  // Parent is an existing operator-owned directory; never recursively create
  // paths or overwrite an old/missing checkpoint under an existing activation.
  const parent = dirname(directory);
  if (realpathSync(parent).toLowerCase() !== resolve(parent).toLowerCase()) fail("full_metering_path_invalid");
  mkdirSync(directory, { mode: 0o700 });
  write(directory, "checkpoint.json", context, checkpoint, true);
  syncDirectory(parent);
}
export function readFullMeteringJournal({ directory, context }) {
  checkContext(context);
  return read(directory, "checkpoint.json", context);
}
export function commitFullMeteringJournal({ directory, context, previousCheckpoint, nextCheckpoint, samples, applySamples, onStage = () => {} }) {
  if (typeof applySamples !== "function" || !Array.isArray(samples)) fail("full_metering_batch_invalid");
  if (existsSync(join(directory, "pending.json"))) fail("full_metering_pending_recovery_required");
  if (fullMeteringDigest(readFullMeteringJournal({ directory, context })) !== fullMeteringDigest(previousCheckpoint)) fail("full_metering_checkpoint_changed");
  const payload = { previousDigest: fullMeteringDigest(previousCheckpoint), nextCheckpoint, samples };
  write(directory, "pending.json", context, payload, true);
  onStage("pending_durable");
  applySynchronously(applySamples, samples);
  onStage("samples_committed");
  write(directory, "checkpoint.json", context, nextCheckpoint);
  onStage("checkpoint_durable");
  removePending(directory);
  return { committed: true, sampleCount: samples.length };
}
export function recoverFullMeteringJournal({ directory, context, applySamples }) {
  const checkpoint = readFullMeteringJournal({ directory, context });
  if (!existsSync(join(directory, "pending.json"))) return { recovered: false };
  const pending = read(directory, "pending.json", context);
  if (!pending || Object.keys(pending).sort().join(",") !== "nextCheckpoint,previousDigest,samples"
    || !Array.isArray(pending.samples) || !/^[a-f0-9]{64}$/.test(pending.previousDigest)) fail("full_metering_intent_invalid");
  const current = fullMeteringDigest(checkpoint);
  if (current !== pending.previousDigest && current !== fullMeteringDigest(pending.nextCheckpoint)) fail("full_metering_checkpoint_changed");
  // Replaying the SAME identifiers is safe both before and after DB COMMIT.
  // A collision or partial prior DB transaction must fail in applySamples.
  applySynchronously(applySamples, pending.samples);
  write(directory, "checkpoint.json", context, pending.nextCheckpoint);
  removePending(directory);
  return { recovered: true, sampleCount: pending.samples.length };
}
export async function withFullMeteringJournalLock({ directory }, callback) {
  protectedPath(directory, true);
  const lock = join(directory, "writer.lock");
  try { mkdirSync(lock, { mode: 0o700 }); } catch { fail("full_metering_locked"); }
  try { return await callback(); } finally { rmdirSync(lock); }
}
