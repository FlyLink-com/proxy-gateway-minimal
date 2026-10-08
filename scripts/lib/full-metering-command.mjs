import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import Database from "better-sqlite3";
import { assertNoDuplicateObjectKeys } from "../../server/services/deployment/strict-json-scan.mjs";
import { createSqliteSubscriptionControlStore } from "../../server/services/platform/subscription-control-db.mjs";
import { readFullMeteringBindings } from "./traffic-vless-recovery-baseline.mjs";
import { runFullMeteringCollection } from "./full-metering-collection.mjs";
import { FULL_METERING_SCOPE, LOCAL_METERING_SCOPE, fullMeteringChannels } from "./full-metering-scope.mjs";
import { fullMeteringDigest } from "./full-metering-journal.mjs";
import { createFullMeteringSampleWriter } from "./full-metering-sample-writer.mjs";
import { createFullMeteringSourceDriver, validateFullMeteringSources } from "./full-metering-source-driver.mjs";

const fail = code => { throw Object.assign(new Error(code), { code }); };
const exactKeys = (object, keys) => object && typeof object === "object" && !Array.isArray(object) && Object.keys(object).sort().join(",") === [...keys].sort().join(",");
const linuxPath = path => typeof path === "string" && /^\/[A-Za-z0-9_./-]+$/.test(path) && !path.split("/").includes("..") && !path.split("/").includes(".");
export function parseFullMeteringCommand(argv) {
  const continuation = argv?.[0] === "--continue-material" ? "material"
    : argv?.[0] === "--continue-billing-window" ? "billing-window" : null;
  if (!Array.isArray(argv) || !["--preflight", "--initialize", "--collect", "--continue-material", "--continue-billing-window"].includes(argv[0])
    || argv.length !== (continuation ? 9 : 5)
    || argv[1] !== "--config" || !linuxPath(argv[2]) || argv[3] !== "--config-sha256" || !/^[a-f0-9]{64}$/.test(argv[4])) fail("full_metering_command_invalid");
  if (continuation === "material") {
    if (argv[5] !== "--material-approval" || !linuxPath(argv[6]) || argv[7] !== "--material-approval-sha256" || !/^[a-f0-9]{64}$/.test(argv[8])) fail("full_metering_command_invalid");
    return { mode: "continue-material", configPath: argv[2], configSha256: argv[4], materialApprovalPath: argv[6], materialApprovalSha256: argv[8] };
  }
  if (continuation === "billing-window") {
    if (argv[5] !== "--billing-window-approval" || !linuxPath(argv[6]) || argv[7] !== "--billing-window-approval-sha256" || !/^[a-f0-9]{64}$/.test(argv[8])) fail("full_metering_command_invalid");
    return { mode: "continue-billing-window", configPath: argv[2], configSha256: argv[4], billingWindowApprovalPath: argv[6], billingWindowApprovalSha256: argv[8] };
  }
  return { mode: argv[0].slice(2), configPath: argv[2], configSha256: argv[4] };
}
export function validateFullMeteringConfig(config) {
  const explicit = config && Object.hasOwn(config, "meteringScope");
  const meteringScope = explicit ? config.meteringScope : FULL_METERING_SCOPE;
  fullMeteringChannels(meteringScope);
  // An explicit undefined is invalid too; only an absent field is legacy mode.
  if (explicit && ![FULL_METERING_SCOPE, LOCAL_METERING_SCOPE].includes(meteringScope)) fail("full_metering_scope_invalid");
  if (!exactKeys(config, ["version", "activationId", "dbPath", "journalDirectory", "materialPath", "sources", "backup", "sgp", ...(explicit ? ["meteringScope"] : [])])
    || config.version !== 1 || !/^[A-Za-z0-9._:-]{1,128}$/.test(config.activationId)
    || ![config.dbPath, config.journalDirectory, config.materialPath].every(linuxPath) || !Array.isArray(config.sources)
    || !exactKeys(config.backup, ["path", "sha256"]) || !linuxPath(config.backup.path) || !/^[a-f0-9]{64}$/.test(config.backup.sha256)) fail("full_metering_config_invalid");
  if (meteringScope === LOCAL_METERING_SCOPE) {
    if (!exactKeys(config.sgp, ["status", "usage"]) || config.sgp.status !== "paused" || config.sgp.usage !== "unknown") fail("full_metering_config_invalid");
    validateFullMeteringSources(config.sources, meteringScope);
  } else if (!exactKeys(config.sgp, ["target", "identityFile", "knownHostsFile", "readerScript"])
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
  const meteringScope = config.meteringScope ?? FULL_METERING_SCOPE;
  const channels = fullMeteringChannels(meteringScope);
  // Validate the complete exact scope before opening a database or considering
  // a pending intent. Local mode never resolves or reads an SGP SSH path.
  validateFullMeteringSources(config.sources, meteringScope);
  const readApproval = path => sha => {
    const approvalBytes = protectedBytes(path, { requireOwner: true, maxBytes: 64 * 1024 });
    if (createHash("sha256").update(approvalBytes).digest("hex") !== sha) fail(options.mode === "continue-billing-window" ? "full_metering_billing_window_approval_digest_changed" : "full_metering_material_approval_digest_changed");
    return privateJson(approvalBytes);
  };
  const materialApproval = options.mode === "continue-material" ? readApproval(options.materialApprovalPath)(options.materialApprovalSha256) : null;
  const billingWindowApproval = options.mode === "continue-billing-window" ? readApproval(options.billingWindowApprovalPath)(options.billingWindowApprovalSha256) : null;
  const writesSamples = options.mode === "collect" || options.mode === "continue-material" || options.mode === "continue-billing-window";
  const databaseIdentityDigest = fullMeteringDigest(fileIdentity(config.dbPath));
  const context = { scopeDigest: options.configSha256, databaseIdentityDigest,
    ...(meteringScope === LOCAL_METERING_SCOPE ? { meteringScope } : {}) };
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
      if (materialApproval) readApproval(options.materialApprovalPath)(options.materialApprovalSha256);
      if (billingWindowApproval) readApproval(options.billingWindowApprovalPath)(options.billingWindowApprovalSha256);
    };
    const readBindings = () => {
      assertInputs();
      return readFullMeteringBindings({ db, databaseIdentityDigest, channelRefs: channels.map(source => source.channelRef), now: new Date() });
    };
    const readInventory = () => db.transaction(readBindings)();
    const { readFullMeteringLocalSource } = await import("./full-metering-local-source.mjs");
    const readSources = createFullMeteringSourceDriver({ sources: config.sources, meteringScope,
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
    let applySamples;
    if (writesSamples) {
      const controlStore = createSqliteSubscriptionControlStore({ database: db, initializeSchema: false });
      const writer = createFullMeteringSampleWriter({ database: db, controlStore, readBindings, meteringScope, activationId: config.activationId });
      applySamples = samples => { assertInputs(); return writer(samples); };
    }
    return await runFullMeteringCollection({ ...options, directory: config.journalDirectory, context, activationId: config.activationId, meteringScope,
      readInventory, readSources, applySamples, materialApproval, billingWindowApproval });
  } finally { db.close(); }
}
