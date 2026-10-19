import * as nativeFs from "node:fs";
import { dirname } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { assertNoDuplicateObjectKeys } from "../../server/services/deployment/strict-json-scan.mjs";
import { SUBSCRIPTION_DISTRIBUTION_SUPPLY_UNITS as UNITS,
  SUBSCRIPTION_DISTRIBUTION_SUPPLY_GUARD as GUARD } from "./bwh-supply-constants.mjs";

export const BWH_SUPPLY_ROOT_PATHS = Object.freeze({ config: "/etc/gccgw-bwh-supply-control.json",
  directory: "/var/lib/gccgw-bwh-supply-control", status: "/var/lib/gccgw-bwh-supply-control/status.json",
  operation: "/var/lib/gccgw-bwh-supply-control/operation.json", lock: "/var/lib/gccgw-bwh-supply-control/lock",
  verifier: "/usr/local/libexec/gccgw-bwh-supply-verify" });
const P = BWH_SUPPLY_ROOT_PATHS;
const ENV = Object.freeze({ PATH: "/usr/bin:/bin", LC_ALL: "C", TZ: "UTC" });
const hash = value => createHash("sha256").update(value).digest("hex");
const need = (condition, code = "host_unverified") => { if (!condition) throw Object.assign(new Error("BWH supply host rejected"), { code }); };
const json = text => { assertNoDuplicateObjectKeys(text); return JSON.parse(text); };
const sameKeys = (value, keys) => value && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const unavailable = () => ({ revision: "0".repeat(64), state: "unavailable", protocolsRunning: 0, collectorState: "unknown",
  nativeDistributionEnabled: false, observedAt: null, canPause: false, canEnable: false });

/** Real Linux host IO; fs/runner injection exists solely for isolated tests. */
export function createSubscriptionDistributionSystemdHost({ fs = nativeFs, runner = spawnSync,
  nowFn = () => new Date(), isRoot = () => process.geteuid?.() === 0,
  sleep = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms) } = {}) {
  function trust(path, { directory = false, maxBytes = 1024 * 1024, mode } = {}) {
    let current = path, first;
    while (true) {
      const info = fs.lstatSync(current);
      need(info.uid === 0 && !(info.mode & 0o022) && !info.isSymbolicLink(), "unsafe_host_path");
      if (current === path) {
        need(directory ? info.isDirectory() : info.isFile() && info.nlink === 1 && info.size <= maxBytes, "unsafe_host_path");
        if (mode !== undefined) need((info.mode & 0o777) === mode, "unsafe_host_path"); first = info;
      } else need(info.isDirectory(), "unsafe_host_path");
      if (current === "/") break; current = dirname(current);
    }
    return first;
  }
  function absent(path) { try { fs.lstatSync(path); return false; } catch (error) { if (error?.code === "ENOENT") return true; throw error; } }
  function read(path, options) {
    const before = trust(path, options), value = fs.readFileSync(path, "utf8"), after = trust(path, options);
    need(before.dev === after.dev && before.ino === after.ino && before.size === after.size && before.mtimeMs === after.mtimeMs, "host_file_changed");
    return value;
  }
  function directory(path, mode = 0o755) {
    if (absent(path)) { trust(dirname(path), { directory: true }); fs.mkdirSync(path, { mode }); }
    trust(path, { directory: true, mode });
  }
  function atomic(path, content, mode) {
    trust(dirname(path), { directory: true });
    if (!absent(path)) trust(path, { mode });
    const temporary = `${path}.tmp-${randomUUID()}`;
    let descriptor;
    try {
      descriptor = fs.openSync(temporary, (fs.constants || nativeFs.constants).O_WRONLY | (fs.constants || nativeFs.constants).O_CREAT
        | (fs.constants || nativeFs.constants).O_EXCL | (fs.constants || nativeFs.constants).O_NOFOLLOW, mode);
      fs.writeFileSync(descriptor, content, "utf8"); fs.fchmodSync(descriptor, mode); fs.fsyncSync(descriptor); fs.closeSync(descriptor); descriptor = undefined;
      trust(temporary, { mode }); fs.renameSync(temporary, path);
      const parent = fs.openSync(dirname(path), (fs.constants || nativeFs.constants).O_RDONLY | (fs.constants || nativeFs.constants).O_DIRECTORY);
      try { fs.fsyncSync(parent); } finally { fs.closeSync(parent); }
    } finally {
      if (descriptor !== undefined) fs.closeSync(descriptor);
      if (!absent(temporary)) fs.unlinkSync(temporary);
    }
  }
  function run(command, args, { timeout = 5000, maxBuffer = 512 * 1024 } = {}) {
    const result = runner(command, args, { encoding: "utf8", shell: false, env: ENV, timeout, maxBuffer, stdio: ["ignore", "pipe", "ignore"] });
    need(result && result.status === 0 && !result.error && typeof result.stdout === "string" && Buffer.byteLength(result.stdout) <= maxBuffer, "host_command_failed");
    return result.stdout;
  }
  function config() {
    need(isRoot(), "root_required");
    const cfg = json(read(P.config, { mode: 0o600, maxBytes: 32 * 1024 }));
    need(sameKeys(cfg, ["version", "target", "sourceCommit", "hostIdentityDigest", "verifierSha256", "verification"])
      && cfg.version === 1 && cfg.target === "bwh-us" && /^[a-f0-9]{40}$/.test(cfg.sourceCommit)
      && [cfg.hostIdentityDigest, cfg.verifierSha256].every(value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value))
      && cfg.verification && typeof cfg.verification === "object" && !Array.isArray(cfg.verification), "config_invalid");
    const info = trust(P.verifier, { maxBytes: 8 * 1024 * 1024 }); need(info.mode & 0o100, "verifier_unverified");
    need(hash(fs.readFileSync(P.verifier)) === cfg.verifierSha256, "verifier_unverified");
    return cfg;
  }
  function metadata(unit) {
    need([...Object.values(UNITS.protocols), UNITS.collectorTimer, UNITS.collectorService].includes(unit), "unit_not_allowed");
    const timer = unit === UNITS.collectorTimer;
    // Timers do not implement the service MainPID property. Do not require a
    // fabricated MainPID=0 from systemctl for a real timer unit.
    const output = run("/usr/bin/systemctl", ["show", unit, "--property=ActiveState", "--property=SubState",
      ...(!timer ? ["--property=MainPID"] : []), "--property=LoadState"]);
    const fields = {};
    for (const line of output.trim().split("\n")) {
      const index = line.indexOf("="); need(index > 0 && !Object.hasOwn(fields, line.slice(0, index)), "service_unverified");
      fields[line.slice(0, index)] = line.slice(index + 1);
    }
    need(sameKeys(fields, ["ActiveState", "SubState", ...(!timer ? ["MainPID"] : []), "LoadState"]) && fields.LoadState === "loaded"
      && (timer || /^\d+$/.test(fields.MainPID)), "service_unverified");
    return { activeState: fields.ActiveState, subState: fields.SubState, mainPid: timer ? 0 : Number(fields.MainPID) };
  }
  const collectorIdle = row => ["inactive", "failed"].includes(row.activeState) && row.mainPid === 0;
  function loadedGuard(unit) {
    const objectPath = `/org/freedesktop/systemd1/unit/${unit.replace(/[^a-zA-Z0-9]/g, value => `_${value.charCodeAt(0).toString(16).padStart(2, "0")}`)}`;
    // Unit.Conditions is the documented a(sbbsi) D-Bus property: type,
    // trigger, negate, parameter, last result. Read the loaded manager state,
    // not systemctl cat (which only shows files on disk).
    const value = json(run("/usr/bin/busctl", ["--json=short", "get-property", "org.freedesktop.systemd1", objectPath, "org.freedesktop.systemd1.Unit", "Conditions"]));
    need(value.type === "a(sbbsi)" && Array.isArray(value.data), "loaded_guard_unverified");
    const matching = value.data.filter(row => Array.isArray(row) && row[0] === "ConditionPathExists" && row[3] === GUARD.markerPath);
    need(matching.length <= 1 && matching.every(row => row.length === 5 && row[1] === false && row[2] === true), "loaded_guard_unverified");
    return matching.length === 1;
  }
  function guard(changeDigest) {
    let marker = null;
    if (!absent(GUARD.markerPath)) {
      const value = json(read(GUARD.markerPath, { mode: 0o600, maxBytes: 256 }));
      need(sameKeys(value, ["changeDigest"]) && value.changeDigest === changeDigest, "foreign_guard");
      marker = { path: GUARD.markerPath, ownerUid: 0, mode: 0o600, fileType: "regular", nlink: 1, changeDigest };
    }
    const dropins = [], loaded = [];
    for (const spec of GUARD.dropins) {
      if (!absent(spec.path)) {
        need(read(spec.path, { mode: 0o644, maxBytes: 1024 }) === GUARD.content && marker, "foreign_guard");
        dropins.push({ ...spec, ownerUid: 0, mode: 0o644, fileType: "regular", nlink: 1, content: GUARD.content });
      }
      if (loadedGuard(spec.unit)) { need(marker && dropins.some(row => row.unit === spec.unit), "loaded_guard_unverified"); loaded.push({ unit: spec.unit, conditionPath: GUARD.markerPath, inverted: true }); }
    }
    return { marker, dropins, loaded };
  }
  function verifier(mode, cfg) {
    need(["inspect", "resume"].includes(mode), "verifier_mode_invalid");
    // Revalidate executable ownership/hash at every invocation; config remains
    // fixed and root-owned. No request/body/environment reaches the verifier.
    const current = config(); need(JSON.stringify(current) === JSON.stringify(cfg), "config_changed");
    const proof = json(run(P.verifier, [mode], { timeout: 20_000, maxBuffer: 256 * 1024 }));
    need(proof?.version === 1 && proof.target === cfg.target && proof.sourceCommit === cfg.sourceCommit
      && proof.hostIdentityDigest === cfg.hostIdentityDigest && Array.isArray(proof.runtimeEvidence) && proof.runtimeEvidence.length === 3, "verifier_unverified");
    return proof;
  }
  function storedStatus() { return json(read(P.status, { mode: 0o644, maxBytes: 16 * 1024 })); }
  function storedOperation() { return json(read(P.operation, { mode: 0o600, maxBytes: 64 * 1024 })); }
  function writeStatus(state, physical, nonce) {
    const body = { state, protocolsRunning: physical?.protocolsRunning ?? 0, collectorState: physical?.collectorState ?? "unknown",
      nativeDistributionEnabled: state === "enabled", canPause: state === "enabled", canEnable: state === "paused" };
    const dto = { revision: hash(JSON.stringify({ nonce, ...body })), ...body, observedAt: nowFn().toISOString() };
    atomic(P.status, JSON.stringify(dto), 0o644); return dto;
  }
  function physical() {
    const rows = Object.values(UNITS.protocols).map(metadata), timer = metadata(UNITS.collectorTimer), collector = metadata(UNITS.collectorService);
    const protocolsRunning = rows.filter(row => row.activeState === "active" && row.subState === "running" && row.mainPid > 0).length;
    const collectorState = timer.activeState === "active" ? "running" : timer.activeState === "inactive" && collectorIdle(collector) ? "paused" : "unknown";
    return { protocolsRunning, collectorState };
  }
  function status() {
    try {
      config(); const persisted = storedStatus(), observed = physical();
      need(sameKeys(persisted, ["revision", "state", "protocolsRunning", "collectorState", "nativeDistributionEnabled", "canPause", "canEnable", "observedAt"])
        && ["enabled", "paused", "transitioning", "failed"].includes(persisted.state) && /^[a-f0-9]{64}$/.test(persisted.revision), "status_invalid");
      let coherent = true;
      if (persisted.state === "enabled") coherent = observed.protocolsRunning === 3 && observed.collectorState === "running" && absent(GUARD.markerPath);
      if (persisted.state === "paused") {
        const operation = storedOperation(), observedGuard = guard(operation.guardDigest);
        coherent = observed.protocolsRunning === 0 && observed.collectorState === "paused" && observedGuard.dropins.length === 3 && observedGuard.loaded.length === 3;
      }
      const dto = { revision: persisted.revision, state: persisted.state, ...observed,
        nativeDistributionEnabled: persisted.state === "enabled", canPause: persisted.state === "enabled", canEnable: persisted.state === "paused",
        observedAt: nowFn().toISOString() };
      if (!coherent) Object.assign(dto, { revision: hash(`${persisted.revision}:physical-mismatch`), state: "failed", nativeDistributionEnabled: false, canPause: false, canEnable: false });
      return dto;
    } catch { return unavailable(); }
  }
  function buildAdapter(cfg, operation, mode) {
    const expectedChange = () => operation.guardDigest;
    const assertMarker = changeDigest => need(read(GUARD.markerPath, { mode: 0o600, maxBytes: 256 }) === JSON.stringify({ changeDigest }), "foreign_guard");
    const writeMarker = changeDigest => {
      if (!absent(GUARD.markerPath)) assertMarker(changeDigest);
      else { directory(dirname(GUARD.markerPath)); atomic(GUARD.markerPath, JSON.stringify({ changeDigest }), 0o600); }
    };
    const writeDropin = spec => {
      need(GUARD.dropins.some(row => row.unit === spec.unit && row.path === spec.path), "unit_not_allowed");
      if (!absent(spec.path)) need(read(spec.path, { mode: 0o644, maxBytes: 1024 }) === GUARD.content, "foreign_guard");
      else { directory(dirname(spec.path)); atomic(spec.path, GUARD.content, 0o644); }
    };
    return {
      readSnapshot(readMode = mode) {
        const proof = verifier(readMode, cfg), sockets = run("/usr/bin/ss", ["-H", "-lntup"]), rows = [];
        need(proof.controlPlaneAvailable === true && proof.subscriptionAvailable === true
          && proof.contextDigest === operation.contextDigest, "host_context_changed");
        for (const [protocol, unit] of Object.entries(UNITS.protocols)) {
          const before = metadata(unit), evidence = proof.runtimeEvidence.find(row => row.unit === unit);
          need(evidence && evidence.mainPid === before.mainPid && sameKeys(evidence.listener, ["transport", "port"])
            && ["tcp", "udp"].includes(evidence.listener.transport) && Number.isInteger(evidence.listener.port)
            && evidence.listener.port > 0 && evidence.listener.port <= 65535, "runtime_unverified");
          const socketRows = sockets.trim().split("\n").filter(Boolean).filter(line => {
            const fields = line.trim().split(/\s+/);
            return fields[0] === evidence.listener.transport && fields[4]?.endsWith(`:${evidence.listener.port}`);
          });
          if (before.mainPid > 0) need(socketRows.length > 0 && socketRows.every(line => {
            const pids = [...line.matchAll(/pid=(\d+)(?=,|\))/g)].map(match => Number(match[1]));
            return pids.length > 0 && pids.every(pid => pid === before.mainPid);
          }), "runtime_listener_unverified");
          need(JSON.stringify(before) === JSON.stringify(metadata(unit)), "runtime_changed");
          rows.push({ protocol, unit, ...before, generation: evidence.generation, configDigest: evidence.configDigest,
            startedAt: evidence.startedAt, listenersPresent: socketRows.length > 0 });
        }
        const timer = metadata(UNITS.collectorTimer), collector = metadata(UNITS.collectorService);
        return { ...proof, capturedAt: nowFn().toISOString(), protocols: rows,
          collector: { timerUnit: UNITS.collectorTimer, serviceUnit: UNITS.collectorService,
            timerActive: timer.activeState === "active", serviceActive: !collectorIdle(collector) },
          guard: guard(expectedChange()) };
      },
      stopCollectorTimer(unit) { need(unit === UNITS.collectorTimer); run("/usr/bin/systemctl", ["stop", unit], { timeout: 20_000 }); },
      waitForCollectorIdle({ service, timeoutMs, pollIntervalMs }) {
        need(service === UNITS.collectorService && timeoutMs === 15_000 && pollIntervalMs === 100);
        for (let elapsed = 0; elapsed < timeoutMs; elapsed += pollIntervalMs) {
          if (collectorIdle(metadata(service))) return; sleep(pollIntervalMs);
        }
      },
      installStartGuard(spec) {
        need(spec.changeDigest === expectedChange()); writeMarker(spec.changeDigest);
        for (const item of GUARD.dropins) writeDropin(item); run("/usr/bin/systemctl", ["daemon-reload"]);
      },
      stopProtocol(unit) { need(Object.values(UNITS.protocols).includes(unit)); run("/usr/bin/systemctl", ["stop", unit], { timeout: 20_000 }); },
      startProtocol(unit) { need(Object.values(UNITS.protocols).includes(unit)); run("/usr/bin/systemctl", ["start", unit], { timeout: 20_000 }); },
      removeProtocolStartGuard(spec) {
        need(spec.changeDigest === expectedChange() && GUARD.dropins.some(row => row.unit === spec.unit && row.path === spec.path));
        assertMarker(spec.changeDigest);
        if (absent(spec.path)) { need(!loadedGuard(spec.unit), "loaded_guard_unverified"); return; }
        need(read(spec.path, { mode: 0o644, maxBytes: 1024 }) === GUARD.content, "foreign_guard");
        fs.unlinkSync(spec.path); run("/usr/bin/systemctl", ["daemon-reload"]);
      },
      restoreProtocolStartGuard(spec) { need(spec.changeDigest === expectedChange()); writeMarker(spec.changeDigest); writeDropin(spec); run("/usr/bin/systemctl", ["daemon-reload"]); },
      removePausedMarker(spec) {
        need(spec.path === GUARD.markerPath && spec.changeDigest === expectedChange() && GUARD.dropins.every(row => absent(row.path)));
        assertMarker(spec.changeDigest); fs.unlinkSync(GUARD.markerPath);
      },
      restorePausedMarker(spec) { need(spec.path === GUARD.markerPath && spec.changeDigest === expectedChange()); writeMarker(spec.changeDigest); },
      startCollectorTimer(unit) { need(unit === UNITS.collectorTimer); run("/usr/bin/systemctl", ["start", unit], { timeout: 20_000 }); }
    };
  }
  async function change(action, expectedRevision) {
    need(["pause", "enable"].includes(action) && /^[a-f0-9]{64}$/.test(expectedRevision), "command_invalid");
    const cfg = config(); trust(P.directory, { directory: true, mode: 0o755 });
    // Never delete a stale/foreign lock automatically. Root must inspect it.
    fs.mkdirSync(P.lock, { mode: 0o700 }); let operation, nonce;
    try {
      const current = status(); need(current.revision === expectedRevision, "revision_conflict");
      // HTTP service refuses canPause/canEnable=false states. A root operator
      // can nevertheless inspect the private stage and explicitly continue the
      // same failed operation without deleting its marker/journal evidence.
      const continuing = current.state === "failed";
      let previousOperation;
      if (continuing) {
        previousOperation = storedOperation();
        need(previousOperation.action === action && previousOperation.sourceCommit === cfg.sourceCommit
          && previousOperation.hostIdentityDigest === cfg.hostIdentityDigest, "state_not_eligible");
      } else need(action === "pause" ? current.state === "enabled" : current.state === "paused", "state_not_eligible");
      nonce = randomUUID();
      // Persist fail-closed intent before ANY timer, protocol or guard change.
      writeStatus("transitioning", { ...current, collectorState: current.collectorState }, nonce);
      const proof = verifier(action === "enable" ? "resume" : "inspect", cfg);
      need(/^[a-f0-9]{64}$/.test(proof.contextDigest) && proof.controlPlaneAvailable === true && proof.subscriptionAvailable === true, "host_context_unverified");
      if (action === "enable") {
        operation = storedOperation(); need(operation.sourceCommit === cfg.sourceCommit && operation.hostIdentityDigest === cfg.hostIdentityDigest
          && operation.contextDigest === proof.contextDigest && /^[a-f0-9]{64}$/.test(operation.guardDigest), "source_changed");
      } else if (continuing) {
        operation = previousOperation; need(operation.contextDigest === proof.contextDigest && /^[a-f0-9]{64}$/.test(operation.guardDigest), "source_changed");
      } else operation = { version: 1, sourceCommit: cfg.sourceCommit, hostIdentityDigest: cfg.hostIdentityDigest,
        contextDigest: proof.contextDigest, guardDigest: hash(JSON.stringify({ nonce, source: cfg.sourceCommit, host: cfg.hostIdentityDigest, context: proof.contextDigest })) };
      operation.action = action; operation.stage = "preflight"; atomic(P.operation, JSON.stringify(operation), 0o600);
      const adapter = buildAdapter(cfg, operation, action === "enable" ? "resume" : "inspect");
      const stage = value => { operation.stage = value; operation.observedAt = nowFn().toISOString(); atomic(P.operation, JSON.stringify(operation), 0o600); };
      const pausedCollector = snapshot => need(!snapshot.collector.timerActive && !snapshot.collector.serviceActive, "collector_busy");
      const stopped = row => row.activeState === "inactive" && row.subState === "dead" && row.mainPid === 0 && !row.listenersPresent;
      const running = row => row.activeState === "active" && row.subState === "running" && row.mainPid > 0 && row.listenersPresent;
      const readBack = () => adapter.readSnapshot();
      if (action === "pause") {
        stage("pause-collector"); adapter.stopCollectorTimer(UNITS.collectorTimer);
        let snapshot = readBack(); need(!snapshot.collector.timerActive, "timer_not_paused");
        if (snapshot.collector.serviceActive) adapter.waitForCollectorIdle({ service: UNITS.collectorService, timeoutMs: 15_000, pollIntervalMs: 100 });
        snapshot = readBack(); pausedCollector(snapshot);
        stage("install-start-guard"); adapter.installStartGuard({ changeDigest: operation.guardDigest }); snapshot = readBack();
        need(snapshot.guard.dropins.length === 3 && snapshot.guard.loaded.length === 3, "guard_unverified");
        for (const unit of Object.values(UNITS.protocols)) {
          stage(`stop-${unit}`); snapshot = readBack(); pausedCollector(snapshot);
          need(snapshot.guard.dropins.length === 3 && snapshot.guard.loaded.length === 3, "guard_unverified");
          adapter.stopProtocol(unit); snapshot = readBack(); need(stopped(snapshot.protocols.find(row => row.unit === unit)), "protocol_not_stopped");
        }
        stage("verify-paused"); snapshot = readBack(); pausedCollector(snapshot);
        need(snapshot.protocols.every(stopped) && snapshot.guard.dropins.length === 3 && snapshot.guard.loaded.length === 3, "pause_unverified");
      } else {
        let snapshot = readBack(); pausedCollector(snapshot);
        for (const spec of GUARD.dropins) {
          stage(`resume-${spec.unit}`);
          try {
            adapter.removeProtocolStartGuard({ ...spec, changeDigest: operation.guardDigest });
            snapshot = readBack(); need(!snapshot.guard.loaded.some(row => row.unit === spec.unit), "guard_unverified");
            adapter.startProtocol(spec.unit); snapshot = readBack(); pausedCollector(snapshot);
            need(running(snapshot.protocols.find(row => row.unit === spec.unit)), "protocol_not_running");
          } catch {
            let guardRestored = false;
            try { adapter.restoreProtocolStartGuard({ ...spec, changeDigest: operation.guardDigest });
              guardRestored = readBack().guard.loaded.some(row => row.unit === spec.unit); } catch { /* preserve fail-closed latch */ }
            operation.guardRestored = guardRestored; atomic(P.operation, JSON.stringify(operation), 0o600);
            throw Object.assign(new Error("Protocol resume stopped"), { code: "protocol_resume_failed" });
          }
        }
        stage("verify-resume-identity-and-continuity"); snapshot = readBack(); pausedCollector(snapshot);
        const verifyAdmission = value => {
          need(value.protocols.every(running) && value.guard.loaded.length === 0 && value.guard.dropins.length === 0, "resume_unverified");
          const admission = value.resumeAdmission;
          need(admission && Number.isFinite(Date.parse(admission.capturedAt)) && Date.parse(admission.capturedAt) <= nowFn().getTime()
            && nowFn().getTime() - Date.parse(admission.capturedAt) <= 60_000 && admission.contextDigest === operation.contextDigest
            && admission.checkpointContinuity === true && admission.pendingWriterCount === 0
            && [admission.missing, admission.changed, admission.missingMaterial, admission.unknown, admission.stale].every(count => count === 0)
            && Array.isArray(admission.protocols) && admission.protocols.length === 3, "resume_identity_unverified");
          const seen = new Set();
          for (const row of admission.protocols) {
            const actual = value.protocols.find(item => item.unit === row.unit);
            need(actual && !seen.has(row.unit) && actual.generation === row.generation && actual.configDigest === row.configDigest
              && Date.parse(admission.capturedAt) >= Date.parse(actual.startedAt), "resume_identity_unverified"); seen.add(row.unit);
          }
        };
        verifyAdmission(snapshot); stage("resume-collector");
        let admittedRuntime = null;
        const verifyPostflight = value => {
          // The timer may immediately start a normal collection. The two idle
          // journal/identity admissions are PRE-start gates, not post-start
          // requirements: inspect here must not reject that legitimate writer.
          need(admittedRuntime && value.contextDigest === operation.contextDigest
            && value.controlPlaneAvailable === true && value.subscriptionAvailable === true
            && value.guard.marker === null && value.guard.dropins.length === 0 && value.guard.loaded.length === 0
            && value.collector.timerActive && value.protocols.every(running), "collector_postflight_unverified");
          for (const actual of value.protocols) {
            const admitted = admittedRuntime.find(row => row.unit === actual.unit);
            need(admitted && admitted.generation === actual.generation && admitted.configDigest === actual.configDigest
              && admitted.mainPid === actual.mainPid && admitted.startedAt === actual.startedAt, "collector_postflight_unverified");
          }
        };
        try {
          adapter.removePausedMarker({ path: GUARD.markerPath, changeDigest: operation.guardDigest }); snapshot = readBack(); pausedCollector(snapshot); verifyAdmission(snapshot);
          admittedRuntime = snapshot.protocols.map(({ unit, mainPid, generation, configDigest, startedAt }) => ({ unit, mainPid, generation, configDigest, startedAt }));
          adapter.startCollectorTimer(UNITS.collectorTimer); snapshot = adapter.readSnapshot("inspect"); verifyPostflight(snapshot);
        } catch {
          let confirmed = false;
          try { snapshot = adapter.readSnapshot("inspect"); verifyPostflight(snapshot); confirmed = true; } catch { /* still unknown */ }
          if (!confirmed) {
            try { adapter.restorePausedMarker({ path: GUARD.markerPath, changeDigest: operation.guardDigest }); operation.markerRestored = adapter.readSnapshot("inspect").guard.marker !== null; }
            catch { operation.markerRestored = false; }
            atomic(P.operation, JSON.stringify(operation), 0o600); throw Object.assign(new Error("Collector resume stopped"), { code: "timer_not_resumed" });
          }
        }
      }
      stage(action === "pause" ? "intentionally-paused" : "enabled-pending-natural-collection");
      const observed = physical(); need(action === "pause" ? observed.protocolsRunning === 0 && observed.collectorState === "paused"
        : observed.protocolsRunning === 3 && observed.collectorState === "running", "final_readback_failed");
      return writeStatus(action === "pause" ? "paused" : "enabled", observed, nonce);
    } catch (error) {
      if (nonce) {
        let observed; try { observed = physical(); } catch { observed = null; }
        writeStatus("failed", observed, nonce);
      }
      throw Object.assign(new Error("BWH supply change stopped; inspect root-private operation stage"), { code: error?.code === "revision_conflict" ? "revision_conflict" : "supply_change_failed" });
    } finally { fs.rmdirSync(P.lock); }
  }
  function initialize() {
    const cfg = config(); trust(P.directory, { directory: true, mode: 0o755 }); need(absent(P.status) && absent(P.operation) && absent(GUARD.markerPath), "already_initialized");
    const proof = verifier("inspect", cfg); need(proof.controlPlaneAvailable === true && proof.subscriptionAvailable === true
      && /^[a-f0-9]{64}$/.test(proof.contextDigest), "initial_context_unverified");
    const observed = physical(); need(observed.protocolsRunning === 3 && observed.collectorState === "running", "initial_state_unverified");
    need(GUARD.dropins.every(row => absent(row.path)), "foreign_guard");
    return writeStatus("enabled", observed, randomUUID());
  }
  return { status, change, initialize, buildAdapter };
}
