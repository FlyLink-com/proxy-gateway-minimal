import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import Database from "better-sqlite3";
import { assertNoDuplicateObjectKeys } from "../../server/services/deployment/strict-json-scan.mjs";
import { createSqliteSubscriptionControlStore } from "../../server/services/platform/subscription-control-db.mjs";
import { readFullMeteringBindings } from "./traffic-vless-recovery-baseline.mjs";
import { FULL_METERING_CHANNELS, runFullMeteringCollection } from "./full-metering-collection.mjs";
import { fullMeteringDigest } from "./full-metering-journal.mjs";
import { createFullMeteringSampleWriter } from "./full-metering-sample-writer.mjs";
import { createFullMeteringSourceDriver } from "./full-metering-source-driver.mjs";

const fail = code => { throw Object.assign(new Error(code), { code }); };
const exactKeys = (object, keys) => object && typeof object === "object" && !Array.isArray(object) && Object.keys(object).sort().join(",") === [...keys].sort().join(",");
const linuxPath = path => typeof path === "string" && /^\/[A-Za-z0-9_./-]+$/.test(path) && !path.split("/").includes("..") && !path.split("/").includes(".");
export function parseFullMeteringCommand(argv) {
  if (!Array.isArray(argv) || !["--preflight", "--initialize", "--collect", "--continue-material", "--collect-pack-resets"].includes(argv[0])
    || argv.length !== (argv[0] === "--continue-material" ? 9 : 5)
    || argv[1] !== "--config" || !linuxPath(argv[2]) || argv[3] !== "--config-sha256" || !/^[a-f0-9]{64}$/.test(argv[4])) fail("full_metering_command_invalid");
  if (argv[0] === "--continue-material") {
    if (argv[5] !== "--material-approval" || !linuxPath(argv[6]) || argv[7] !== "--material-approval-sha256" || !/^[a-f0-9]{64}$/.test(argv[8])) fail("full_metering_command_invalid");
    return { mode: "continue-material", configPath: argv[2], configSha256: argv[4], materialApprovalPath: argv[6], materialApprovalSha256: argv[8] };
  }
  return { mode: argv[0].slice(2), configPath: argv[2], configSha256: argv[4] };
}
export function validateFullMeteringConfig(config) {
  if (!exactKeys(config, ["version", "activationId", "dbPath", "journalDirectory", "materialPath", "sources", "backup", "sgp"])
    || config.version !== 1 || !/^[A-Za-z0-9._:-]{1,128}$/.test(config.activationId)
    || ![config.dbPath, config.journalDirectory, config.materialPath].every(linuxPath) || !Array.isArray(config.sources)
    || !exactKeys(config.backup, ["path", "sha256"]) || !linuxPath(config.backup.path) || !/^[a-f0-9]{64}$/.test(config.backup.sha256)
    || !exactKeys(config.sgp, ["target", "identityFile", "knownHostsFile", "readerScript"])
    || !/^[A-Za-z0-9][A-Za-z0-9._@:-]{0,253}$/.test(config.sgp.target)
    || ![config.sgp.identityFile, config.sgp.knownHostsFile, config.sgp.readerScript].every(linuxPath)) fail("full_metering_config_invalid");
  return config;
}
function fileIdentity(path) {
  if (!isAbsolute(path) || realpathSync(path) !== resolve(path)) fail("full_metering_file_invalid");
  const info = lstatSync(path, { bigint: true });
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1n) fail("full_metering_file_invalid");
  return { path, dev: String(info.dev), ino: String(info.ino) };
}
export function assertFullMeteringSshFileMetadata(info, { expectedUid, privateFile = false }) {
  if (!info?.isFile() || info.isSymbolicLink() || info.nlink !== 1n || info.uid !== expectedUid
    || (info.mode & (privateFile ? 0o077n : 0o022n)) !== 0n) fail("full_metering_ssh_file_untrusted");
}
export function assertFullMeteringSshFileUnchanged(before, after) {
  if (!["uid", "gid", "mode", "dev", "ino", "nlink", "size", "mtimeNs", "ctimeNs"].every(key => before[key] === after[key])) fail("full_metering_ssh_file_changed");
}
function sshFileProof(path, privateFile = false) {
  fileIdentity(path);
  const info = lstatSync(path, { bigint: true });
  assertFullMeteringSshFileMetadata(info, { expectedUid: BigInt(process.getuid()), privateFile });
  return info;
}
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
    if (![opened, after, named].every(row => ["dev", "ino", "size", "mtimeNs", "ctimeNs"].every(key => row[key] === before[key]))) fail("full_metering_file_changed");
    return bytes;
  } finally { closeSync(fd); }
}
function privateJson(bytes) {
  const string = bytes.toString("utf8");
  assertNoDuplicateObjectKeys(string);
  return JSON.parse(string);
}
export async function runFullMeteringCommand(argv) {
  const options = parseFullMeteringCommand(argv);
  if (process.platform !== "linux") fail("full_metering_linux_required");
  const bytes = protectedBytes(options.configPath, { requireOwner: true });
  if (createHash("sha256").update(bytes).digest("hex") !== options.configSha256) fail("full_metering_config_digest_changed");
  const config = validateFullMeteringConfig(privateJson(bytes));
  const readApproval = () => {
    const approvalBytes = protectedBytes(options.materialApprovalPath, { requireOwner: true, maxBytes: 64 * 1024 });
    if (createHash("sha256").update(approvalBytes).digest("hex") !== options.materialApprovalSha256) fail("full_metering_material_approval_digest_changed");
    return privateJson(approvalBytes);
  };
  const materialApproval = options.mode === "continue-material" ? readApproval() : null;
  const writesSamples = ["collect", "continue-material", "collect-pack-resets"].includes(options.mode);
  const databaseIdentityDigest = fullMeteringDigest(fileIdentity(config.dbPath));
  const context = { scopeDigest: options.configSha256, databaseIdentityDigest };
  if (options.mode === "initialize") {
    const backup = protectedBytes(config.backup.path, { maxBytes: 1024 * 1024 * 1024 });
    if (config.backup.path === config.dbPath || createHash("sha256").update(backup).digest("hex") !== config.backup.sha256) fail("full_metering_backup_invalid");
    const backupDb = new Database(config.backup.path, { readonly: true, fileMustExist: true });
    try {
      backupDb.pragma("query_only = ON");
      if (backupDb.pragma("quick_check", { simple: true }) !== "ok") fail("full_metering_backup_invalid");
    } finally { backupDb.close(); }
  }
  const db = new Database(config.dbPath, { readonly: !writesSamples, fileMustExist: true, timeout: 5000 });
  try {
    db.pragma("trusted_schema = OFF");
    if (!writesSamples) db.pragma("query_only = ON");
    else { db.pragma("synchronous = FULL"); if (db.pragma("synchronous", { simple: true }) !== 2) fail("full_metering_database_durability_unproven"); }
    const assertInputs = () => {
      if (fullMeteringDigest(fileIdentity(config.dbPath)) !== databaseIdentityDigest
        || createHash("sha256").update(protectedBytes(options.configPath, { requireOwner: true })).digest("hex") !== options.configSha256) fail("full_metering_input_changed");
      if (materialApproval) readApproval();
    };
    const readBindings = () => {
      assertInputs();
      return readFullMeteringBindings({ db, databaseIdentityDigest, channelRefs: FULL_METERING_CHANNELS.map(source => source.channelRef), now: new Date() });
    };
    const readInventory = () => db.transaction(readBindings)();
    const { readFullMeteringLocalSource } = await import("./full-metering-local-source.mjs");
    const readSources = createFullMeteringSourceDriver({ sources: config.sources,
      readMaterial: () => privateJson(protectedBytes(config.materialPath)),
      readSource: async source => {
        const request = { kind: source.kind, runtimeUnit: source.runtimeUnit, configPath: source.configPath, credentialRefByRuntimeUser: source.credentialRefByRuntimeUser };
        if (source.host === "local") return readFullMeteringLocalSource(request);
        // Reuse the existing host-bound SSH identity. Do not inspect agent keys,
        // fall back to password auth, copy credentials or forward local agents.
        // Metadata only: the SSH process owns private-key reading. Both files
        // must be operator-owned and stable across the bounded remote request.
        const keyProof = sshFileProof(config.sgp.identityFile, true);
        const hostProof = sshFileProof(config.sgp.knownHostsFile);
        const args = ["-F", "/dev/null", "-T", "-i", config.sgp.identityFile,
          "-o", `UserKnownHostsFile=${config.sgp.knownHostsFile}`, "-o", "GlobalKnownHostsFile=/dev/null",
          "-o", "BatchMode=yes", "-o", "IdentitiesOnly=yes", "-o", "StrictHostKeyChecking=yes", "-o", "UpdateHostKeys=no",
          "-o", "ProxyCommand=none", "-o", "ProxyJump=none", "-o", "ForwardAgent=no", "-o", "ForwardX11=no",
          "-o", "IdentityAgent=none", "-o", "ClearAllForwardings=yes", "-o", "ControlMaster=no", "-o", "ControlPath=none",
          "-o", "ConnectTimeout=10", "-o", "ConnectionAttempts=1", config.sgp.target,
          `/usr/bin/node ${config.sgp.readerScript} --read-stdin`];
        const result = spawnSync("/usr/bin/ssh", args, { input: JSON.stringify(request), encoding: "utf8", timeout: 45000, maxBuffer: 8 * 1024 * 1024,
          shell: false, env: { PATH: "/usr/bin:/bin", LANG: "C", LC_ALL: "C" }, windowsHide: true });
        assertFullMeteringSshFileUnchanged(keyProof, sshFileProof(config.sgp.identityFile, true));
        assertFullMeteringSshFileUnchanged(hostProof, sshFileProof(config.sgp.knownHostsFile));
        if (result.status !== 0 || result.error || result.stderr) fail("full_metering_remote_source_failed");
        const response = privateJson(Buffer.from(result.stdout));
        if (!response?.ok || !response.privateSnapshot) fail("full_metering_remote_source_failed");
        return response.privateSnapshot;
      } });
    let applySamples, dataPackResetStore;
    if (writesSamples) {
      const controlStore = createSqliteSubscriptionControlStore({ database: db, initializeSchema: false });
      if (options.mode === "collect-pack-resets") dataPackResetStore = controlStore;
      const writer = createFullMeteringSampleWriter({ database: db, controlStore, readBindings });
      applySamples = samples => { assertInputs(); return writer(samples); };
    }
    return await runFullMeteringCollection({ ...options, directory: config.journalDirectory, context, activationId: config.activationId,
      readInventory, readSources, applySamples, materialApproval, dataPackResetStore });
  } finally { db.close(); }
}
