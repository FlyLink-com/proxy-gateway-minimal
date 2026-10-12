import { createHash } from "node:crypto";
import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync, readSync, realpathSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import Database from "better-sqlite3";
import { assertNoDuplicateObjectKeys } from "../../server/services/deployment/strict-json-scan.mjs";
import { readFullMeteringBindings } from "./traffic-vless-recovery-baseline.mjs";
import { validateFullMeteringConfig } from "./full-metering-command.mjs";
import { fullMeteringDigest } from "./full-metering-journal.mjs";
import { LOCAL_METERING_SCOPE, fullMeteringChannels } from "./full-metering-scope.mjs";
import { createFullMeteringSourceDriver, validateFullMeteringSources } from "./full-metering-source-driver.mjs";
import { readFullMeteringPlanSwitchProof } from "./full-metering-plan-switch-proof.mjs";
import {
  parseFullMeteringNewActivationRecoveryCommand, validateFullMeteringNewActivationRecoveryRequest,
  runFullMeteringNewActivationRecovery
} from "./full-metering-new-activation-recovery.mjs";

const fail = code => { throw Object.assign(new Error(code), { code }); };

function fileIdentity(path) {
  if (!isAbsolute(path) || realpathSync(path) !== resolve(path)) fail("full_metering_file_invalid");
  const info = lstatSync(path, { bigint: true });
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1n) fail("full_metering_file_invalid");
  return { path, dev: String(info.dev), ino: String(info.ino) };
}

const SHA_CHUNK_BYTES = 1024 * 1024;
const BACKUP_MAX_BYTES = 1024 * 1024 * 1024;
const boundKeys = ["dev", "ino", "size", "mtimeNs", "ctimeNs"];
const sameBound = (row, before) => boundKeys.every(key => row[key] === before[key]);

function protectedBytes(path, { maxBytes = 8 * 1024 * 1024, requireOwner = false } = {}) {
  fileIdentity(path);
  const before = lstatSync(path, { bigint: true });
  if ((before.mode & 0o077n) !== 0n || before.size > BigInt(maxBytes)
    || (requireOwner && before.uid !== BigInt(process.getuid()))) fail("full_metering_permissions_invalid");
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = fstatSync(fd, { bigint: true });
    const bytes = readFileSync(fd);
    const after = fstatSync(fd, { bigint: true }), named = lstatSync(path, { bigint: true });
    if (![opened, after, named].every(row => sameBound(row, before))) fail("full_metering_file_changed");
    return bytes;
  } finally { closeSync(fd); }
}

// Windows stat mode always includes group/other bits, so the POSIX 0o077 gate
// is applied on Linux, where this command is allowed to open the backup.
export function protectedSha256(path, { maxBytes = BACKUP_MAX_BYTES, onBound = null } = {}) {
  fileIdentity(path);
  const before = lstatSync(path, { bigint: true });
  if ((process.platform !== "win32" && (before.mode & 0o077n) !== 0n) || before.size > BigInt(maxBytes)) fail("full_metering_permissions_invalid");
  const fd = openSync(path, constants.O_RDONLY | (Number.isSafeInteger(constants.O_NOFOLLOW) ? constants.O_NOFOLLOW : 0));
  try {
    const opened = fstatSync(fd, { bigint: true });
    if (!sameBound(opened, before)) fail("full_metering_file_changed");
    if (typeof onBound === "function") onBound(path);
    const hash = createHash("sha256");
    const chunk = Buffer.allocUnsafe(SHA_CHUNK_BYTES);
    let remaining = opened.size;
    while (remaining > 0n) {
      const want = remaining > BigInt(chunk.length) ? chunk.length : Number(remaining);
      const count = readSync(fd, chunk, 0, want, null);
      if (count <= 0) fail("full_metering_file_changed");
      hash.update(chunk.subarray(0, count));
      remaining -= BigInt(count);
    }
    const after = fstatSync(fd, { bigint: true }), named = lstatSync(path, { bigint: true });
    if (![opened, after, named].every(row => sameBound(row, before))) fail("full_metering_file_changed");
    return hash.digest("hex");
  } finally { closeSync(fd); }
}

function privateJson(bytes) {
  const string = bytes.toString("utf8");
  assertNoDuplicateObjectKeys(string);
  return JSON.parse(string);
}

export { parseFullMeteringNewActivationRecoveryCommand, validateFullMeteringNewActivationRecoveryRequest };

export async function runFullMeteringNewActivationRecoveryCommand(argv) {
  const options = parseFullMeteringNewActivationRecoveryCommand(argv);
  if (process.platform !== "linux") fail("full_metering_linux_required");
  const requestBytes = protectedBytes(options.requestPath, { requireOwner: true, maxBytes: 64 * 1024 });
  if (createHash("sha256").update(requestBytes).digest("hex") !== options.requestSha256) fail("full_metering_recovery_request_digest_changed");
  const request = validateFullMeteringNewActivationRecoveryRequest(privateJson(requestBytes));
  const configBytes = protectedBytes(request.newConfigPath, { requireOwner: true });
  if (createHash("sha256").update(configBytes).digest("hex") !== request.newConfigSha256) fail("full_metering_config_digest_changed");
  const config = validateFullMeteringConfig(privateJson(configBytes));
  if ((config.meteringScope ?? null) !== LOCAL_METERING_SCOPE || config.activationId !== request.newActivationId) fail("full_metering_config_invalid");
  validateFullMeteringSources(config.sources, LOCAL_METERING_SCOPE);
  if (options.mode === "initialize") {
    if (config.backup.path === config.dbPath || protectedSha256(config.backup.path) !== config.backup.sha256) fail("full_metering_backup_invalid");
    const backupDb = new Database(config.backup.path, { readonly: true, fileMustExist: true });
    try {
      backupDb.pragma("query_only = ON");
      if (backupDb.pragma("quick_check", { simple: true }) !== "ok") fail("full_metering_backup_invalid");
    } finally { backupDb.close(); }
  }
  const databaseIdentityDigest = fullMeteringDigest(fileIdentity(config.dbPath));
  if (databaseIdentityDigest !== request.oldContext.databaseIdentityDigest) fail("full_metering_database_identity_changed");
  const newContext = { scopeDigest: request.newConfigSha256, databaseIdentityDigest, meteringScope: LOCAL_METERING_SCOPE };
  const db = new Database(config.dbPath, { readonly: true, fileMustExist: true, timeout: 5000 });
  try {
    db.pragma("trusted_schema = OFF");
    db.pragma("query_only = ON");
    const assertInputs = () => {
      if (fullMeteringDigest(fileIdentity(config.dbPath)) !== databaseIdentityDigest
        || createHash("sha256").update(protectedBytes(request.newConfigPath, { requireOwner: true })).digest("hex") !== request.newConfigSha256
        || createHash("sha256").update(protectedBytes(options.requestPath, { requireOwner: true, maxBytes: 64 * 1024 })).digest("hex") !== options.requestSha256) fail("full_metering_input_changed");
    };
    const readInventory = () => db.transaction(() => {
      assertInputs();
      return readFullMeteringBindings({
        db, databaseIdentityDigest, channelRefs: fullMeteringChannels(LOCAL_METERING_SCOPE).map(source => source.channelRef),
        now: new Date()
      });
    })();
    const readPlanSwitchProof = input => db.transaction(() => {
      assertInputs();
      return readFullMeteringPlanSwitchProof({ ...input, db });
    })();
    const { readFullMeteringLocalSource } = await import("./full-metering-local-source.mjs");
    const readSources = createFullMeteringSourceDriver({
      sources: config.sources, meteringScope: LOCAL_METERING_SCOPE,
      readMaterial: () => privateJson(protectedBytes(config.materialPath)),
      readSource: async source => {
        if (source.host !== "local") fail("full_metering_source_scope_invalid");
        return readFullMeteringLocalSource({
          kind: source.kind, runtimeUnit: source.runtimeUnit, configPath: source.configPath,
          credentialRefByRuntimeUser: source.credentialRefByRuntimeUser
        });
      }
    });
    return await runFullMeteringNewActivationRecovery({
      mode: options.mode,
      oldDirectory: request.oldJournalDirectory,
      oldContext: request.oldContext,
      oldActivationId: request.oldActivationId,
      newDirectory: config.journalDirectory,
      newContext,
      newActivationId: request.newActivationId,
      meteringScope: LOCAL_METERING_SCOPE,
      oldWriterStopped: request.oldWriterStopped,
      activationUnused: request.activationUnused,
      knownActivationIds: request.knownActivationIds,
      readInventory, readSources, readPlanSwitchProof
    });
  } finally { db.close(); }
}
