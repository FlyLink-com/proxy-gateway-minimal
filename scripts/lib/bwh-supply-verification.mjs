import * as nativeFs from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { posix } from "node:path";
import Database from "better-sqlite3";
import { parseCanonicalJsonBytes } from "../../server/services/deployment/canonical-json.mjs";
import { CONTROL_PLANE_RELEASE_IDENTITY_CONTRACT } from "../../server/services/platform/control-plane-release-identity.mjs";
import { assertNoDuplicateObjectKeys } from "../../server/services/deployment/strict-json-scan.mjs";
import { inspectFullMeteringRuntimeConfig } from "./full-metering-local-source.mjs";
import { validateFullMeteringConfig } from "./full-metering-command.mjs";
import { fullMeteringChannels, LOCAL_METERING_SCOPE, assertFullMeteringCheckpointScope } from "./full-metering-scope.mjs";
import { fullMeteringDigest, readFullMeteringJournal } from "./full-metering-journal.mjs";
import { fullMeteringBindingIdentity } from "./full-metering-sample-writer.mjs";
import { readFullMeteringBindings } from "./traffic-vless-recovery-baseline.mjs";
import { createFullMeteringSourceDriver } from "./full-metering-source-driver.mjs";
import { planSwitchContinuationHistory, admitFullMeteringPlanSwitches } from "./full-metering-plan-switch-continuation.mjs";
import { readFullMeteringPlanSwitchProof } from "./full-metering-plan-switch-proof.mjs";
import { reconcileVerifiedFullMeteringScope, advanceVerifiedFullMeteringGeneration } from "../../server/services/edge/full-metering-counter-transition.mjs";
import { runIdentityGateCli } from "../identity-gate-check.mjs";

export const BWH_SUPPLY_VERIFICATION_CONFIG = "/etc/gccgw-bwh-supply-control.json";
const UNITS = Object.freeze({ xray: "xray-vless-reality.service", hy2: "hysteria2.service", tuic: "mihomo-tuic.service" });
const APP = "proxy-gateway-candidate.service";
const COLLECTOR = "gccgw-full-metering-collect.service";
const ENV = Object.freeze({ PATH: "/usr/bin:/bin", LC_ALL: "C", TZ: "UTC" });
const HASH = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const hash = value => createHash("sha256").update(value).digest("hex");
const need = (value, code = "verification_unavailable") => { if (!value) throw Object.assign(new Error("BWH supply verification rejected"), { code }); };
const exact = (value, keys) => value && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const linuxPath = value => typeof value === "string" && /^\/[A-Za-z0-9_./-]+$/.test(value) && value !== "/" && posix.normalize(value) === value;
const json = bytes => { const text = bytes.toString("utf8"); assertNoDuplicateObjectKeys(text); return JSON.parse(text); };
const signature = row => [row.dev, row.ino, row.uid, row.gid, row.mode, row.nlink, row.size, row.mtimeMs, row.ctimeMs].join(":");
function startTicks(stat) {
  const close = stat.lastIndexOf(") "); need(close > 0, "verification_proc_invalid");
  const value = stat.slice(close + 2).trim().split(/\s+/)[19];
  need(/^[1-9][0-9]*$/.test(value || ""), "verification_proc_invalid"); return value;
}

export function validateBwhSupplyVerificationConfig(value) {
  need(exact(value, ["version", "releaseIdentityPath", "releaseIdentitySha256", "meteringConfigPath", "meteringConfigSha256", "controlPlanePort"])
    && value.version === 1 && [value.releaseIdentityPath, value.meteringConfigPath].every(linuxPath)
    && [value.releaseIdentitySha256, value.meteringConfigSha256].every(item => typeof item === "string" && HASH.test(item))
    && Number.isInteger(value.controlPlanePort) && value.controlPlanePort > 0 && value.controlPlanePort <= 65535, "verification_config_invalid");
  return value;
}

function publicListener(kind, configText) {
  let port;
  if (kind === "xray") {
    const config = json(Buffer.from(configText));
    const rows = config.inbounds?.filter(row => row.protocol === "vless");
    need(rows?.length === 1, "verification_listener_invalid"); port = rows[0].port;
  } else {
    const rows = configText.split(/\r?\n/).filter(line => kind === "hy2" ? /^listen:/.test(line) : /^    port:/.test(line));
    need(rows.length === 1, "verification_listener_invalid");
    let value = rows[0].slice(rows[0].indexOf(":") + 1).trim();
    if (value.startsWith('"')) value = JSON.parse(value);
    else if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
    const match = kind === "hy2" ? /^(?:(?:\[[0-9a-fA-F:]+\]|[A-Za-z0-9.]+)?):([1-9][0-9]{0,4})$/.exec(value) : /^([1-9][0-9]{0,4})$/.exec(value);
    need(match, "verification_listener_invalid"); port = Number(match[1]);
  }
  need(Number.isInteger(port) && port > 0 && port <= 65535, "verification_listener_invalid");
  return { transport: kind === "xray" ? "tcp" : "udp", port };
}

/** Real read-only Linux verifier. Injected IO exists for isolated source tests. */
export function createBwhSupplyVerifier({ fsOps = nativeFs, commandRunner = spawnSync, fetchFn = globalThis.fetch,
  nowFn = () => new Date(), databaseFactory = path => new Database(path, { readonly: true, fileMustExist: true, timeout: 2000 }),
  identityGateRunner = runIdentityGateCli, readJournal = readFullMeteringJournal } = {}) {
  const fs = fsOps;
  function trusted(path, { owners = [0], privateFile = false, directory = false, maxBytes = 8 * 1024 * 1024 } = {}) {
    need(linuxPath(path), "verification_path_invalid");
    let current = path, first;
    while (true) {
      const info = fs.lstatSync(current);
      need(owners.includes(info.uid) && !(info.mode & 0o022) && !info.isSymbolicLink(), "verification_path_untrusted");
      if (current === path) {
        need(directory ? info.isDirectory() : info.isFile() && info.nlink === 1 && info.size <= maxBytes
          && (!privateFile || !(info.mode & 0o077)), "verification_file_untrusted"); first = info;
      } else need(info.isDirectory(), "verification_path_untrusted");
      if (current === "/") break; current = posix.dirname(current);
    }
    need(fs.realpathSync(path) === path, "verification_path_untrusted");
    return first;
  }
  function read(path, options = {}) {
    const before = trusted(path, options);
    const fd = fs.openSync(path, (fs.constants || nativeFs.constants).O_RDONLY | (fs.constants || nativeFs.constants).O_NOFOLLOW);
    try {
      need(signature(fs.fstatSync(fd)) === signature(before), "verification_file_changed");
      const bytes = fs.readFileSync(fd);
      need(Buffer.isBuffer(bytes) && bytes.length <= (options.maxBytes ?? 8 * 1024 * 1024)
        && signature(fs.fstatSync(fd)) === signature(before) && signature(trusted(path, options)) === signature(before), "verification_file_changed");
      return { bytes, digest: hash(bytes), metadata: before };
    } finally { fs.closeSync(fd); }
  }
  function proc(path, maxBytes = 64 * 1024) {
    need(/^\/proc\/(?:sys\/kernel\/random\/boot_id|[1-9][0-9]*\/(?:stat|cmdline|status))$/.test(path), "verification_proc_invalid");
    const bytes = fs.readFileSync(path); need(Buffer.isBuffer(bytes) && bytes.length <= maxBytes, "verification_proc_invalid"); return bytes.toString("utf8");
  }
  function absent(path) { try { fs.lstatSync(path); return false; } catch (error) { if (error.code === "ENOENT") return true; throw error; } }
  function metadata(unit) {
    need([APP, COLLECTOR, ...Object.values(UNITS)].includes(unit), "verification_unit_invalid");
    const fields = ["LoadState", "ActiveState", "SubState", "MainPID", "ControlPID", "Job", "WorkingDirectory", "ExecMainStartTimestamp"];
    const result = commandRunner("/usr/bin/systemctl", ["show", unit, "--no-pager", "--timestamp=us+utc", `--property=${fields.join(",")}`],
      { encoding: "utf8", shell: false, env: ENV, timeout: 3000, maxBuffer: 32 * 1024, stdio: ["ignore", "pipe", "ignore"] });
    need(result?.status === 0 && !result.error && typeof result.stdout === "string" && Buffer.byteLength(result.stdout) <= 32 * 1024, "verification_service_unavailable");
    const row = {};
    for (const line of result.stdout.trimEnd().split("\n")) {
      const at = line.indexOf("="); const key = line.slice(0, at);
      need(at > 0 && fields.includes(key) && !Object.hasOwn(row, key), "verification_service_invalid"); row[key] = line.slice(at + 1);
    }
    need(exact(row, fields) && row.LoadState === "loaded" && /^\d+$/.test(row.MainPID) && /^\d+$/.test(row.ControlPID), "verification_service_invalid");
    return row;
  }
  function appSocket(port, pid) {
    const result = commandRunner("/usr/bin/ss", ["-H", "-lntp"],
      { encoding: "utf8", shell: false, env: ENV, timeout: 3000, maxBuffer: 128 * 1024, stdio: ["ignore", "pipe", "ignore"] });
    need(result?.status === 0 && !result.error && typeof result.stdout === "string" && Buffer.byteLength(result.stdout) <= 128 * 1024, "verification_app_socket_unavailable");
    const authorities = new Set([`127.0.0.1:${port}`, `0.0.0.0:${port}`, `*:${port}`, `[::]:${port}`, `:::${port}`]);
    const rows = result.stdout.trim().split("\n").filter(Boolean).filter(line => authorities.has(line.trim().split(/\s+/)[3]));
    need(rows.length > 0 && rows.every(line => {
      const pids = [...line.matchAll(/pid=(\d+)(?=,|\))/g)].map(match => match[1]);
      return pids.length > 0 && pids.every(value => value === pid);
    }), "verification_app_socket_unverified");
  }
  function runtime(source, file, appUid) {
    const before = metadata(source.runtimeUnit), mainPid = Number(before.MainPID);
    need(Number.isSafeInteger(mainPid) && mainPid >= 0, "verification_service_invalid");
    const privateView = inspectFullMeteringRuntimeConfig({ kind: source.kind, configText: file.bytes.toString("utf8") });
    const listener = publicListener(source.kind, file.bytes.toString("utf8"));
    if (mainPid === 0) {
      need(["inactive", "failed"].includes(before.ActiveState) && before.ControlPID === "0" && before.Job === "", "verification_service_transitioning");
      return { evidence: { unit: source.runtimeUnit, mainPid: 0, generation: null, configDigest: file.digest, startedAt: null, listener }, privateView, processIdentity: null };
    }
    need(before.ActiveState === "active" && before.SubState === "running" && before.ControlPID === "0" && before.Job === "", "verification_service_transitioning");
    const pid = String(mainPid), ticks = startTicks(proc(`/proc/${pid}/stat`));
    const args = proc(`/proc/${pid}/cmdline`).split("\0").filter(Boolean), configs = [];
    for (let index = 1; index < args.length; index += 1) {
      if (["-c", "-config", "--config", "-f"].includes(args[index])) configs.push(args[++index]);
      else if (/^(--config|-config)=/.test(args[index])) configs.push(args[index].slice(args[index].indexOf("=") + 1));
    }
    need(configs.length === 1 && configs[0] === source.configPath, "verification_runtime_config_changed");
    const boot = proc("/proc/sys/kernel/random/boot_id").trim();
    need(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(boot), "verification_proc_invalid");
    const binary = fs.readlinkSync(`/proc/${pid}/exe`);
    const binaryProof = read(binary, { owners: [0], maxBytes: 200 * 1024 * 1024 });
    const match = /^\w{3} (\d{4}-\d\d-\d\d) (\d\d:\d\d:\d\d)\.(\d{6}) UTC$/.exec(before.ExecMainStartTimestamp);
    need(match, "verification_runtime_start_invalid");
    const startedAt = new Date(`${match[1]}T${match[2]}.${match[3].slice(0, 3)}Z`).toISOString();
    const startedNs = BigInt(Date.parse(`${match[1]}T${match[2]}Z`)) * 1_000_000n + BigInt(match[3]) * 1000n;
    const fileChangedNs = BigInt(Math.ceil(Math.max(file.metadata.mtimeMs, file.metadata.ctimeMs) * 1_000_000));
    need(startedNs >= fileChangedNs, "verification_runtime_config_not_loaded");
    need(JSON.stringify(metadata(source.runtimeUnit)) === JSON.stringify(before) && startTicks(proc(`/proc/${pid}/stat`)) === ticks
      && read(source.configPath, { owners: [0, appUid], privateFile: true, maxBytes: 4 * 1024 * 1024 }).digest === file.digest, "verification_runtime_changed");
    return { evidence: { unit: source.runtimeUnit, mainPid, generation: hash(JSON.stringify([boot, pid, ticks, binaryProof.digest])), configDigest: file.digest, startedAt, listener }, privateView,
      processIdentity: { metadata: before, ticks, binary, binaryDigest: binaryProof.digest } };
  }
  async function endpoint(port, path, expectedStatus, field, expected) {
    const url = `http://127.0.0.1:${port}${path}`;
    const result = await fetchFn(url, { method: "GET", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(2000), headers: { Accept: "application/json" } });
    need(result?.status === expectedStatus && !result.redirected && result.body?.getReader, "verification_endpoint_unavailable");
    const reader = result.body.getReader(); const chunks = []; let bytes = 0;
    try {
      while (true) { const next = await reader.read(); if (next.done) break; bytes += next.value.length; need(bytes <= 4096, "verification_endpoint_invalid"); chunks.push(Buffer.from(next.value)); }
    } finally { await reader.cancel().catch(() => {}); }
    const value = json(Buffer.concat(chunks)); need(value?.[field] === expected, "verification_endpoint_invalid"); return true;
  }
  return async function verify(mode) {
    need(["inspect", "resume"].includes(mode), "verification_mode_invalid");
    const rootFile = read(BWH_SUPPLY_VERIFICATION_CONFIG, { privateFile: true, maxBytes: 32 * 1024 });
    const root = json(rootFile.bytes);
    need(exact(root, ["version", "target", "sourceCommit", "hostIdentityDigest", "verifierSha256", "verification"])
      && root.version === 1 && root.target === "bwh-us" && typeof root.sourceCommit === "string" && COMMIT.test(root.sourceCommit)
      && [root.hostIdentityDigest, root.verifierSha256].every(value => typeof value === "string" && HASH.test(value)), "verification_config_invalid");
    const cfg = validateBwhSupplyVerificationConfig(root.verification);
    const machine = read("/etc/machine-id", { maxBytes: 256 }).bytes.toString("utf8").trim();
    need(/^[a-f0-9]{32}$/i.test(machine) && hash(machine) === root.hostIdentityDigest, "verification_host_changed");
    const releaseFile = read(cfg.releaseIdentityPath, { maxBytes: 4096 });
    const release = parseCanonicalJsonBytes(releaseFile.bytes, CONTROL_PLANE_RELEASE_IDENTITY_CONTRACT);
    need(releaseFile.digest === cfg.releaseIdentitySha256 && release.sourceCommit === root.sourceCommit, "verification_source_changed");
    const app = metadata(APP);
    need(app.ActiveState === "active" && app.SubState === "running" && /^[1-9][0-9]*$/.test(app.MainPID)
      && app.ControlPID === "0" && app.Job === "" && fs.readlinkSync(`/proc/${app.MainPID}/cwd`) === posix.dirname(cfg.releaseIdentityPath), "verification_app_unavailable");
    const uid = /^Uid:\s+\d+\s+(\d+)\s+/m.exec(proc(`/proc/${app.MainPID}/status`));
    need(uid && Number.isSafeInteger(Number(uid[1])), "verification_app_unavailable"); const appUid = Number(uid[1]);
    appSocket(cfg.controlPlanePort, app.MainPID);
    const meteringFile = read(cfg.meteringConfigPath, { privateFile: true, maxBytes: 64 * 1024 });
    need(meteringFile.digest === cfg.meteringConfigSha256, "verification_metering_changed");
    const metering = validateFullMeteringConfig(json(meteringFile.bytes));
    need(metering.meteringScope === LOCAL_METERING_SCOPE, "verification_scope_unsupported");
    const databaseBefore = trusted(metering.dbPath, { owners: [0, appUid], privateFile: true, maxBytes: 1024 ** 4 });
    const databaseIdentity = { path: metering.dbPath, dev: String(databaseBefore.dev), ino: String(databaseBefore.ino) };
    const context = { scopeDigest: meteringFile.digest, databaseIdentityDigest: fullMeteringDigest(databaseIdentity), meteringScope: LOCAL_METERING_SCOPE };
    const materialFile = read(metering.materialPath, { owners: [0, appUid], privateFile: true, maxBytes: 16 * 1024 * 1024 });
    const materials = json(materialFile.bytes);
    const files = metering.sources.map(source => read(source.configPath, { owners: [0, appUid], privateFile: true, maxBytes: 4 * 1024 * 1024 }));
    const runtimes = metering.sources.map((source, index) => runtime(source, files[index], appUid));
    const contextDigest = fullMeteringDigest({ version: 1, sourceCommit: root.sourceCommit, hostIdentityDigest: root.hostIdentityDigest,
      releaseIdentityDigest: releaseFile.digest, meteringConfigDigest: meteringFile.digest, materialDigest: materialFile.digest,
      databaseIdentity, context, activationId: metering.activationId,
      protocolConfigs: metering.sources.map((source, index) => ({ unit: source.runtimeUnit, configPath: source.configPath, configDigest: files[index].digest })) });
    const controlPlaneAvailable = await endpoint(cfg.controlPlanePort, "/api/health", 200, "ok", true);
    const subscriptionAvailable = await endpoint(cfg.controlPlanePort, "/sub/clash.yaml", 401, "error", "Unauthorized");
    let resumeAdmission = null;
    if (mode === "resume" && runtimes.every(value => value.evidence.mainPid > 0)) {
      const totals = { missing: 0, changed: 0, missingMaterial: 0, unknown: 0, stale: 0 };
      const collector = metadata(COLLECTOR);
      const pendingWriterCount = Number(!absent(posix.join(metering.journalDirectory, "writer.lock")))
        + Number(!absent(posix.join(metering.journalDirectory, "pending.json")))
        + Number(collector.MainPID !== "0" || collector.ControlPID !== "0" || collector.Job !== "" || !["inactive", "failed"].includes(collector.ActiveState));
      const capturedAt = new Date(nowFn()).toISOString();
      for (const source of metering.sources) {
        let output = "";
        const result = await identityGateRunner({ argv: ["--surface", `bwh-${source.kind}`, "--runtime-kind", source.kind === "tuic" ? "mihomo" : source.kind,
          "--runtime-config", source.configPath, "--db", metering.dbPath, "--material", metering.materialPath],
        stdout: { write: text => { output += text; need(Buffer.byteLength(output) <= 8192, "verification_identity_invalid"); } } });
        const gate = json(Buffer.from(output));
        for (const [key, field] of [["missing", "missing"], ["changed", "changed"], ["missingMaterial", "missing_material"], ["stale", "stale"]]) {
          need(Number.isSafeInteger(gate[field]) && gate[field] >= 0 && gate[field] <= 5000, "verification_identity_invalid"); totals[key] += gate[field];
        }
        if (result !== 0 || gate.state !== "verified" || gate.equalities?.runtime_eq !== true || gate.equalities?.map_eq !== true) totals.unknown += 1;
      }
      let checkpointContinuity = false;
      let db;
      try {
        need(pendingWriterCount === 0, "verification_journal_pending");
        const checkpoint = readJournal({ directory: metering.journalDirectory, context });
        assertFullMeteringCheckpointScope(checkpoint, LOCAL_METERING_SCOPE);
        need(checkpoint.version === 1 && checkpoint.activationId === metering.activationId && Number.isSafeInteger(checkpoint.sequence) && checkpoint.sequence >= 0, "verification_checkpoint_invalid");
        planSwitchContinuationHistory(checkpoint);
        const checkpointDigest = fullMeteringDigest(checkpoint);
        db = databaseFactory(metering.dbPath);
        db.pragma("query_only = ON"); db.pragma("trusted_schema = OFF");
        need(db.readonly === true && db.pragma("query_only", { simple: true }) === 1, "verification_database_not_readonly");
        const channels = fullMeteringChannels(LOCAL_METERING_SCOPE).map(source => source.channelRef);
        const inventory = db.transaction(() => readFullMeteringBindings({ db, databaseIdentityDigest: context.databaseIdentityDigest, channelRefs: channels, now: capturedAt }))();
        const driver = createFullMeteringSourceDriver({ sources: metering.sources, meteringScope: LOCAL_METERING_SCOPE,
          readMaterial: () => materials, readSource: async source => {
            const value = runtimes.find(item => item.evidence.unit === source.runtimeUnit);
            return { generation: value.evidence.generation, configDigest: value.evidence.configDigest, runtimeUsers: value.privateView.runtimeUsers, observedAt: capturedAt, observations: [] };
          } });
        await driver(inventory);
        const entries = inventory.entries.map(fullMeteringBindingIdentity), retained = inventory.retainedBindings.map(entry => ({ channelRef: entry.channelRef, edgeCredentialRef: entry.edgeCredentialRef, materialDigest: entry.materialDigest }));
        const admission = db.transaction(() => admitFullMeteringPlanSwitches({ checkpoint, identities: { entries, retained }, now: capturedAt,
          readPlanSwitchProof: args => readFullMeteringPlanSwitchProof({ db, ...args }) }))();
        for (const source of checkpoint.sources) {
          const current = entries.filter(entry => entry.channelRef === source.channelRef), old = retained.filter(entry => entry.channelRef === source.channelRef);
          for (const identity of source.identities) {
            need(fullMeteringDigest(fullMeteringBindingIdentity(identity)) === fullMeteringDigest(identity), "verification_checkpoint_invalid");
            const next = current.find(entry => entry.edgeCredentialRef === identity.edgeCredentialRef), historical = old.find(entry => entry.edgeCredentialRef === identity.edgeCredentialRef);
            need(next ? fullMeteringDigest(next) === fullMeteringDigest(identity) || admission.changes.has(`${identity.channelRef}\0${identity.edgeCredentialRef}`)
              : historical?.materialDigest === identity.materialDigest, "verification_checkpoint_changed");
          }
          const reconciled = reconcileVerifiedFullMeteringScope({ state: source.counterState, eligibleRefs: current.map(entry => entry.edgeCredentialRef), retainedRefs: old.map(entry => entry.edgeCredentialRef) });
          const generation = runtimes.find(item => item.evidence.unit === metering.sources.find(item => item.channelRef === source.channelRef).runtimeUnit).evidence.generation;
          if (reconciled.nextState.generation !== generation) advanceVerifiedFullMeteringGeneration({ state: reconciled.nextState, generation, verifiedAt: capturedAt });
        }
        const afterInventory = db.transaction(() => readFullMeteringBindings({ db, databaseIdentityDigest: context.databaseIdentityDigest, channelRefs: channels, now: capturedAt }))();
        need(fullMeteringDigest(inventory) === fullMeteringDigest(afterInventory) && fullMeteringDigest(readJournal({ directory: metering.journalDirectory, context })) === checkpointDigest
          && absent(posix.join(metering.journalDirectory, "writer.lock")) && absent(posix.join(metering.journalDirectory, "pending.json")), "verification_snapshot_changed");
        checkpointContinuity = true;
      } catch { totals.unknown += 1; }
      finally { if (db?.open) db.close(); }
      resumeAdmission = { capturedAt, contextDigest, ...totals, checkpointContinuity, pendingWriterCount,
        protocols: runtimes.map(value => ({ unit: value.evidence.unit, generation: value.evidence.generation, configDigest: value.evidence.configDigest })) };
    }
    const databaseAfter = trusted(metering.dbPath, { owners: [0, appUid], privateFile: true, maxBytes: 1024 ** 4 });
    need(String(databaseAfter.dev) === databaseIdentity.dev && String(databaseAfter.ino) === databaseIdentity.ino
      && read(BWH_SUPPLY_VERIFICATION_CONFIG, { privateFile: true, maxBytes: 32 * 1024 }).digest === rootFile.digest
      && hash(read("/etc/machine-id", { maxBytes: 256 }).bytes.toString("utf8").trim()) === root.hostIdentityDigest
      && read(cfg.releaseIdentityPath, { maxBytes: 4096 }).digest === releaseFile.digest
      && read(cfg.meteringConfigPath, { privateFile: true, maxBytes: 64 * 1024 }).digest === meteringFile.digest
      && read(metering.materialPath, { owners: [0, appUid], privateFile: true, maxBytes: 16 * 1024 * 1024 }).digest === materialFile.digest
      && JSON.stringify(metadata(APP)) === JSON.stringify(app), "verification_context_changed");
    for (let index = 0; index < metering.sources.length; index += 1) {
      const after = runtime(metering.sources[index], read(metering.sources[index].configPath, { owners: [0, appUid], privateFile: true, maxBytes: 4 * 1024 * 1024 }), appUid);
      need(fullMeteringDigest(after.evidence) === fullMeteringDigest(runtimes[index].evidence), "verification_runtime_changed");
    }
    appSocket(cfg.controlPlanePort, app.MainPID);
    return { version: 1, target: "bwh-us", sourceCommit: root.sourceCommit, hostIdentityDigest: root.hostIdentityDigest,
      contextDigest, controlPlaneAvailable, subscriptionAvailable, runtimeEvidence: runtimes.map(value => value.evidence), resumeAdmission };
  };
}
