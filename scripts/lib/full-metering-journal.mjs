// Protected write-ahead intent, not a second accounting ledger. The database
// adapter MUST atomically insert deterministic, collision-checked sample IDs.
// A durable intent is replayed before any new observation; there is no implicit
// initialization after missing/corrupt state and no automatic stale-lock removal.
import { createHash, randomUUID } from "node:crypto";
import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";

// Storage v2 keeps the logical v1 envelope/digest and replay ordering. Bound
// compressed storage and decoded data independently; never inflate unbounded data.
const LEGACY_MAX_BYTES = 32 * 1024 * 1024;
const MAX_FILE_BYTES = 128 * 1024 * 1024;
const MAX_DECODED_BYTES = 256 * 1024 * 1024;
const COMPRESS_AT_BYTES = 1024 * 1024;
const MAGIC = Buffer.from("GCCFMJ2\n");
const fail = code => { throw Object.assign(new Error(code), { code }); };
export function fullMeteringDigest(value) {
  const hash = createHash("sha256");
  let bytes = 0;
  const emit = text => {
    if (typeof text !== "string") fail("full_metering_payload_invalid");
    bytes += Buffer.byteLength(text);
    if (bytes > MAX_DECODED_BYTES) fail("full_metering_payload_invalid");
    hash.update(text);
  };
  const canonical = item => {
    if (Array.isArray(item)) {
      emit("["); item.forEach((entry, index) => { if (index) emit(","); canonical(entry); }); emit("]");
    } else if (item && typeof item === "object") {
      emit("{"); Object.keys(item).sort().forEach((key, index) => {
        if (index) emit(","); emit(JSON.stringify(key)); emit(":"); canonical(item[key]);
      }); emit("}");
    } else emit(JSON.stringify(item));
  };
  canonical(value);
  if (!bytes) fail("full_metering_payload_invalid");
  return hash.digest("hex");
}
function protectedPath(path, directory = false) {
  if (!isAbsolute(path)) fail("full_metering_path_invalid");
  const info = lstatSync(path);
  const norm = value => process.platform === "win32" ? value.toLowerCase() : value;
  if (info.isSymbolicLink() || (directory ? !info.isDirectory() : !info.isFile())
    || norm(realpathSync(path)) !== norm(resolve(path))) fail("full_metering_path_invalid");
  if (process.platform !== "win32" && ((info.mode & 0o077) !== 0 || info.uid !== process.getuid())) fail("full_metering_permissions_invalid");
  if (!directory && (info.nlink !== 1 || info.size > MAX_FILE_BYTES)) fail("full_metering_file_invalid");
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
function encode(context, payload) {
  const bytes = Buffer.from(JSON.stringify(envelope(context, payload)));
  if (bytes.length > MAX_DECODED_BYTES) fail("full_metering_payload_invalid");
  if (bytes.length < COMPRESS_AT_BYTES) return bytes;
  const header = Buffer.alloc(16);
  MAGIC.copy(header); header.writeBigUInt64LE(BigInt(bytes.length), 8);
  const compressed = gzipSync(bytes, { level: 1 });
  if (compressed.length + header.length > MAX_FILE_BYTES) fail("full_metering_payload_invalid");
  return Buffer.concat([header, compressed]);
}
function decode(bytes) {
  if (!bytes.subarray(0, MAGIC.length).equals(MAGIC)) {
    if (bytes.length > LEGACY_MAX_BYTES) fail("full_metering_file_invalid");
    return bytes.toString("utf8");
  }
  if (bytes.length <= 16) fail("full_metering_encoding_invalid");
  const declared = bytes.readBigUInt64LE(8);
  if (declared < 1n || declared > BigInt(MAX_DECODED_BYTES)) fail("full_metering_decode_limit");
  let decoded;
  try { decoded = gunzipSync(bytes.subarray(16), { maxOutputLength: Number(declared) }); }
  catch { fail("full_metering_encoding_invalid"); }
  if (decoded.length !== Number(declared)) fail("full_metering_encoding_invalid");
  return decoded.toString("utf8");
}
function read(directory, name, context) {
  protectedPath(directory, true);
  const path = join(directory, name);
  protectedPath(path);
  let data;
  const decoded = decode(readFileSync(path));
  try { data = JSON.parse(decoded); } catch { fail("full_metering_json_invalid"); }
  if (data?.version !== 1 || Object.keys(data).sort().join(",") !== "context,digest,payload,version"
    || data.digest !== fullMeteringDigest({ version: data.version, context: data.context, payload: data.payload })) fail("full_metering_digest_invalid");
  if (fullMeteringDigest(data.context) !== fullMeteringDigest(context)) fail("full_metering_context_changed");
  return data.payload;
}
function write(directory, name, context, payload, exclusive = false, encoded = null) {
  protectedPath(directory, true);
  const target = join(directory, name);
  if (existsSync(target)) {
    protectedPath(target);
    if (exclusive) fail("full_metering_pending_recovery_required");
  }
  // Complete bounded serialization before creating a temporary or mutating data.
  const bytes = encoded ?? encode(context, payload);
  const temporary = join(directory, `.${name}.${randomUUID()}.tmp`);
  const fd = openSync(temporary, "wx", 0o600);
  try { writeFileSync(fd, bytes); fsyncSync(fd); }
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
export function assertFullMeteringJournalNoPending({ directory }) {
  protectedPath(directory, true);
  if (existsSync(join(directory, "pending.json"))) fail("full_metering_pending_recovery_required");
}
// Retain the exact logical preimage before a material transition creates a WAL
// intent. Never overwrite it. This is private audit evidence, not a rollback DB.
export function archiveFullMeteringMaterialCheckpoint({ directory, context, checkpoint, namePrefix = "material-before" }) {
  const digest = fullMeteringDigest(checkpoint), name = `${namePrefix}-${digest}.json`;
  if (fullMeteringDigest(readFullMeteringJournal({ directory, context })) !== digest) fail("full_metering_checkpoint_changed");
  if (existsSync(join(directory, name))) {
    if (fullMeteringDigest(read(directory, name, context)) !== digest) fail("full_metering_material_archive_changed");
  } else write(directory, name, context, checkpoint, true);
  return name;
}
export function commitFullMeteringJournal({ directory, context, previousCheckpoint, nextCheckpoint, samples, applySamples, onStage = () => {} }) {
  if (typeof applySamples !== "function" || !Array.isArray(samples)) fail("full_metering_batch_invalid");
  if (existsSync(join(directory, "pending.json"))) fail("full_metering_pending_recovery_required");
  if (fullMeteringDigest(readFullMeteringJournal({ directory, context })) !== fullMeteringDigest(previousCheckpoint)) fail("full_metering_checkpoint_changed");
  const payload = { previousDigest: fullMeteringDigest(previousCheckpoint), nextCheckpoint, samples };
  const pendingBytes = encode(context, payload);
  const checkpointBytes = encode(context, nextCheckpoint);
  write(directory, "pending.json", context, payload, true, pendingBytes);
  onStage("pending_durable");
  applySynchronously(applySamples, samples);
  onStage("samples_committed");
  write(directory, "checkpoint.json", context, nextCheckpoint, false, checkpointBytes);
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
