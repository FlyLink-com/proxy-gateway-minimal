import test from "node:test";
import assert from "node:assert/strict";
import { constants } from "node:fs";
import { dirname } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createSubscriptionDistributionSystemdHost, BWH_SUPPLY_ROOT_PATHS as PATHS } from "../../scripts/lib/subscription-distribution-systemd-adapter.mjs";
import { SUBSCRIPTION_DISTRIBUTION_SUPPLY_UNITS as UNITS, SUBSCRIPTION_DISTRIBUTION_SUPPLY_GUARD as GUARD } from "../../scripts/lib/bwh-supply-constants.mjs";
import { runBwhSupplyHost, isBwhSupplyHostEntrypoint } from "../../scripts/bwh-supply-host.mjs";
const NOW = "2026-10-19T12:00:00.000Z", HASH = "a".repeat(64);
const enoent = () => Object.assign(new Error("missing"), { code: "ENOENT" });
function memoryFs() {
  const entries = new Map(), descriptors = new Map(); let sequence = 1, nextFd = 10;
  const put = (path, content, mode = 0o600, kind = "file") => entries.set(path, { content: Buffer.from(content), mode, kind, uid: 0, nlink: 1, ino: sequence++, mtimeMs: sequence });
  for (const path of ["/", "/etc", "/etc/gccgw", "/etc/systemd", "/etc/systemd/system", "/var", "/var/lib", "/var/lib/gccgw", PATHS.directory,
    "/var/lib/gccgw/subscription-distribution", "/usr", "/usr/local", "/usr/local/libexec"]) put(path, "", 0o755, "directory");
  const entry = path => { if (!entries.has(path)) throw enoent(); return entries.get(path); };
  return { constants, entries, put,
    lstatSync(path) { const row = entry(path); return { ...row, dev: 1, size: row.content.length,
      isDirectory: () => row.kind === "directory", isFile: () => row.kind === "file", isSymbolicLink: () => row.kind === "symlink" }; },
    readFileSync(path, encoding) { const value = entry(path).content; return encoding ? value.toString(encoding) : Buffer.from(value); },
    mkdirSync(path, { mode }) { if (entries.has(path)) throw Object.assign(new Error("exists"), { code: "EEXIST" }); entry(dirname(path)); put(path, "", mode, "directory"); },
    rmdirSync(path) { needDirectory(path); if ([...entries.keys()].some(key => key.startsWith(`${path}/`))) throw new Error("not empty"); entries.delete(path); },
    openSync(path, flags, mode) {
      if (flags & constants.O_CREAT) { if ((flags & constants.O_EXCL) && entries.has(path)) throw new Error("exists"); entry(dirname(path)); put(path, "", mode); }
      entry(path); const fd = nextFd++; descriptors.set(fd, path); return fd;
    },
    writeFileSync(fd, content) { const row = entry(descriptors.get(fd)); row.content = Buffer.from(content); row.mtimeMs = sequence++; },
    fchmodSync(fd, mode) { entry(descriptors.get(fd)).mode = mode; }, fsyncSync() {}, closeSync(fd) { descriptors.delete(fd); },
    renameSync(from, to) { const row = entry(from); entries.set(to, row); entries.delete(from); },
    unlinkSync(path) { entry(path); entries.delete(path); }
  };
  function needDirectory(path) { if (entry(path).kind !== "directory") throw new Error("not directory"); }
}
function fixture() {
  const fs = memoryFs(), calls = [], loaded = new Set(), units = new Map();
  for (const unit of Object.values(UNITS.protocols)) units.set(unit, { activeState: "active", subState: "running", mainPid: 500 + units.size });
  units.set(UNITS.collectorTimer, { activeState: "active", subState: "waiting", mainPid: 0 });
  units.set(UNITS.collectorService, { activeState: "inactive", subState: "dead", mainPid: 0 });
  const faults = {};
  const cfg = { version: 1, target: "bwh-us", sourceCommit: "b".repeat(40), hostIdentityDigest: HASH,
    verifierSha256: createHash("sha256").update("verifier fixture source").digest("hex"), verification: {} };
  fs.put(PATHS.config, JSON.stringify(cfg)); fs.put(PATHS.verifier, "verifier fixture source", 0o755);
  const runtimeEvidence = () => Object.entries(UNITS.protocols).map(([protocol, unit]) => ({ unit, mainPid: units.get(unit).mainPid,
    generation: units.get(unit).mainPid ? (faults.generationChanged && protocol === "vless" ? "d".repeat(64) : HASH) : null,
    configDigest: faults.configChanged && protocol === "vless" ? "d".repeat(64) : HASH, startedAt: units.get(unit).mainPid ? "2026-10-19T11:00:00.000Z" : null,
    listener: { transport: protocol === "vless" ? "tcp" : "udp", port: protocol === "hy2" ? 8443 : 443 } }));
  const proof = mode => ({ version: 1, target: cfg.target, sourceCommit: cfg.sourceCommit, hostIdentityDigest: cfg.hostIdentityDigest,
    contextDigest: faults.contextChanged ? "c".repeat(64) : HASH, controlPlaneAvailable: !faults.endpoint,
    subscriptionAvailable: true, runtimeEvidence: runtimeEvidence(),
    resumeAdmission: mode === "resume" && runtimeEvidence().every(row => row.mainPid > 0) ? { capturedAt: NOW, contextDigest: HASH,
      missing: 0, changed: 0, missingMaterial: 0, unknown: 0, stale: faults.stale ? 1 : 0,
      checkpointContinuity: !faults.continuity && !faults.naturalWriterActive, pendingWriterCount: faults.naturalWriterActive ? 1 : 0,
      protocols: runtimeEvidence().map(({ unit, generation, configDigest }) => ({ unit, generation, configDigest })) } : null });
  const runner = (command, args, options) => {
    calls.push({ command, args: [...args], options });
    const okay = stdout => ({ status: 0, stdout });
    if (command === PATHS.verifier) {
      if (faults.readAfterMarker && args[0] === "resume" && !fs.entries.has(GUARD.markerPath)) {
        faults.readAfterMarker = false; return { status: 1, stdout: "" };
      }
      return okay(JSON.stringify(proof(args[0])));
    }
    if (command === "/usr/bin/systemctl") {
      const [verb, unit] = args;
      if (verb === "show") { const row = units.get(unit); assert.ok(row, unit); return okay(`ActiveState=${row.activeState}\nSubState=${row.subState}\n${args.includes("--property=MainPID") ? `MainPID=${row.mainPid}\n` : ""}LoadState=loaded\n`); }
      // The real durable native latch must precede every mutation.
      assert.equal(JSON.parse(fs.readFileSync(PATHS.status, "utf8")).nativeDistributionEnabled, false);
      if (verb === "daemon-reload") {
        loaded.clear(); for (const spec of GUARD.dropins) if (fs.entries.has(spec.path)) loaded.add(spec.unit);
        if (faults.removeGuardAfter && !fs.entries.has(GUARD.dropins[0].path)) { faults.removeGuardAfter = false; return { status: 1, stdout: "" }; }
        return okay("");
      }
      if (verb === "stop") {
        if (faults.timerStop && unit === UNITS.collectorTimer) return { status: 1, stdout: "" };
        if (faults.stopUnit === unit) return { status: 1, stdout: "" };
        units.set(unit, { activeState: "inactive", subState: "dead", mainPid: 0 }); return okay("");
      }
      if (verb === "start") {
        if (faults.startUnit === unit || loaded.has(unit)) return { status: 1, stdout: "" };
        if (unit === UNITS.collectorTimer) {
          if (!faults.timerBefore) units.set(unit, { activeState: "active", subState: "waiting", mainPid: 0 });
          if (faults.immediateCollection && !faults.timerBefore) {
            units.set(UNITS.collectorService, { activeState: "active", subState: "running", mainPid: 999 });
            faults.naturalWriterActive = true;
          }
          if (faults.postStartDrift === "context") faults.contextChanged = true;
          if (faults.postStartDrift === "generation") faults.generationChanged = true;
          if (faults.postStartDrift === "config") faults.configChanged = true;
          if (faults.postStartDrift === "pid") units.set(UNITS.protocols.vless, { activeState: "active", subState: "running", mainPid: 601 });
          if (faults.timerBefore || faults.timerAfter) return { status: 1, stdout: "" };
        } else units.set(unit, { activeState: "active", subState: "running", mainPid: 600 });
        return okay("");
      }
    }
    if (command === "/usr/bin/busctl") {
      const objectPath = args[3]; const unit = Object.values(UNITS.protocols).find(value => objectPath.endsWith(value.replace(/[^a-zA-Z0-9]/g, part => `_${part.charCodeAt(0).toString(16)}`)));
      // Actual WSL busctl non-empty a(sbbsi) shape observed read-only from
      // systemd-firstboot.service: data is the direct array of tuples.
      assert.ok(unit); const data = [["ConditionFirstBoot", false, false, "yes", -1], ["ConditionPathIsReadWrite", false, false, "/etc", 0]];
      if (loaded.has(unit)) data.push(["ConditionPathExists", false, true, GUARD.markerPath, 0]);
      return okay(JSON.stringify({ type: "a(sbbsi)", data }));
    }
    if (command === "/usr/bin/ss") return okay(runtimeEvidence().filter(row => row.mainPid).map(row => `${row.listener.transport} LISTEN 0 0 0.0.0.0:${row.listener.port} *:* users:(("native",pid=${row.mainPid},fd=1))`).join("\n"));
    assert.fail(`unapproved command ${command}`);
  };
  const host = createSubscriptionDistributionSystemdHost({ fs, runner, nowFn: () => new Date(NOW), isRoot: () => true, sleep() {} });
  return { host, fs, calls, loaded, units, faults, cfg };
}

test("real adapter initializes only verified fixed services, then global pause and enable use durable intent and exact units", async () => {
  const f = fixture(); const initial = f.host.initialize(); assert.equal(initial.state, "enabled");
  const paused = await f.host.change("pause", initial.revision);
  assert.equal(paused.state, "paused"); assert.equal(paused.protocolsRunning, 0); assert.equal(f.loaded.size, 3);
  const repeated = f.host.status(); assert.equal(repeated.revision, paused.revision);
  const enabled = await f.host.change("enable", paused.revision);
  assert.equal(enabled.state, "enabled"); assert.equal(enabled.nativeDistributionEnabled, true); assert.equal(f.loaded.size, 0);
  assert.equal(f.fs.entries.has(GUARD.markerPath), false);
  assert.equal(f.fs.entries.has(PATHS.lock), false);
  assert.equal(f.calls.some(call => call.args.includes("nginx.service") || call.args.includes("proxy-gateway-candidate.service")), false);
  assert.equal(f.calls.every(call => call.options.shell === false && call.options.env.HTTP_PROXY === undefined), true);
});

test("wrong revision, nonallowlisted action and concurrent root lock perform zero host mutations", async () => {
  const f = fixture(); const initial = f.host.initialize(); const before = f.calls.length;
  await assert.rejects(() => f.host.change("pause", "c".repeat(64)));
  await assert.rejects(() => f.host.change("restart-nginx", initial.revision));
  assert.equal(f.calls.slice(before).some(call => ["start", "stop", "daemon-reload"].includes(call.args[0])), false);
  f.fs.mkdirSync(PATHS.lock, { mode: 0o700 }); await assert.rejects(() => f.host.change("pause", initial.revision));
  assert.equal(f.fs.entries.has(PATHS.lock), true);
});

test("verifier pin/ownership/config drift fail closed before timer or protocol mutation", async () => {
  for (const fault of ["hash", "writable", "symlink", "config"]) {
    const f = fixture(); const initial = f.host.initialize();
    if (fault === "hash") f.fs.put(PATHS.verifier, "modified", 0o755);
    if (fault === "writable") f.fs.entries.get(PATHS.verifier).mode = 0o777;
    if (fault === "symlink") f.fs.entries.get(PATHS.config).kind = "symlink";
    if (fault === "config") f.fs.put(PATHS.config, JSON.stringify({ ...f.cfg, command: "/bin/sh" }));
    const before = f.calls.length; await assert.rejects(() => f.host.change("pause", initial.revision));
    assert.equal(f.calls.slice(before).some(call => ["start", "stop", "daemon-reload"].includes(call.args[0])), false);
  }
});

test("timer failure and busy collector preserve failed native-off latch and never kill writer", async () => {
  for (const fault of ["timerStop", "busy"]) {
    const f = fixture(); const initial = f.host.initialize();
    if (fault === "timerStop") f.faults.timerStop = true;
    else f.units.set(UNITS.collectorService, { activeState: "active", subState: "running", mainPid: 999 });
    await assert.rejects(() => f.host.change("pause", initial.revision));
    const status = JSON.parse(f.fs.readFileSync(PATHS.status, "utf8"));
    assert.equal(status.state, "failed"); assert.equal(status.nativeDistributionEnabled, false);
    assert.equal(f.calls.some(call => call.args[0] === "stop" && call.args[1] === UNITS.collectorService), false);
    assert.equal(f.calls.some(call => call.args[0] === "stop" && Object.values(UNITS.protocols).includes(call.args[1])), false);
  }
});

test("real timer metadata without MainPID and failed idle collector are supported", async () => {
  const f = fixture(); const initial = f.host.initialize();
  f.units.set(UNITS.collectorService, { activeState: "failed", subState: "failed", mainPid: 0 });
  assert.equal((await f.host.change("pause", initial.revision)).state, "paused");
  for (const call of f.calls.filter(call => call.command === "/usr/bin/systemctl" && call.args[0] === "show" && call.args[1] === UNITS.collectorTimer)) {
    assert.equal(call.args.includes("--property=MainPID"), false);
  }
});

test("partial protocol failure retains guards/failed native-off state and precise stage", async () => {
  const f = fixture(); const initial = f.host.initialize(); f.faults.stopUnit = UNITS.protocols.hy2;
  await assert.rejects(() => f.host.change("pause", initial.revision));
  assert.equal(f.loaded.size, 3); assert.equal(JSON.parse(f.fs.readFileSync(PATHS.status, "utf8")).state, "failed");
  assert.equal(JSON.parse(f.fs.readFileSync(PATHS.operation, "utf8")).stage, `stop-${UNITS.protocols.hy2}`);
  const priorGuard = f.fs.readFileSync(GUARD.markerPath, "utf8");
  f.faults.stopUnit = null;
  assert.equal((await f.host.change("pause", f.host.status().revision)).state, "paused");
  assert.equal(f.fs.readFileSync(GUARD.markerPath, "utf8"), priorGuard);
});

test("private failed enable can be explicitly continued without deleting evidence or resetting ledger", async () => {
  const f = fixture(); const initial = f.host.initialize(); const paused = await f.host.change("pause", initial.revision);
  f.faults.startUnit = UNITS.protocols.hy2;
  await assert.rejects(() => f.host.change("enable", paused.revision));
  const failed = f.host.status(); assert.equal(failed.canEnable, false);
  f.faults.startUnit = null;
  assert.equal((await f.host.change("enable", failed.revision)).state, "enabled");
});

test("after-effect guard removal failure re-arms the exact guard and keeps native off", async () => {
  const f = fixture(); const initial = f.host.initialize(); const paused = await f.host.change("pause", initial.revision);
  f.faults.removeGuardAfter = true;
  await assert.rejects(() => f.host.change("enable", paused.revision));
  assert.equal(f.loaded.size, 3);
  assert.equal(JSON.parse(f.fs.readFileSync(PATHS.operation, "utf8")).guardRestored, true);
  assert.equal(JSON.parse(f.fs.readFileSync(PATHS.status, "utf8")).nativeDistributionEnabled, false);
});

test("readback failure after marker removal restores marker for later explicit recovery", async () => {
  const f = fixture(); const initial = f.host.initialize(); const paused = await f.host.change("pause", initial.revision);
  f.faults.readAfterMarker = true;
  await assert.rejects(() => f.host.change("enable", paused.revision));
  assert.equal(f.fs.entries.has(GUARD.markerPath), true);
  assert.equal(JSON.parse(f.fs.readFileSync(PATHS.operation, "utf8")).markerRestored, true);
  assert.equal(JSON.parse(f.fs.readFileSync(PATHS.status, "utf8")).nativeDistributionEnabled, false);
});

test("unexpected fields in durable status are never reflected to stdout", () => {
  const f = fixture(); const initial = f.host.initialize();
  f.fs.put(PATHS.status, JSON.stringify({ ...initial, secret: "private value" }), 0o644);
  const status = f.host.status(); assert.equal(status.state, "unavailable");
  assert.equal(JSON.stringify(status).includes("private"), false);
});

test("resume enforces real identity/context/checkpoint conditions before native distribution or collector", async () => {
  for (const fault of ["stale", "continuity", "contextChanged"]) {
    const f = fixture(); const initial = f.host.initialize(); const paused = await f.host.change("pause", initial.revision); f.faults[fault] = true;
    await assert.rejects(() => f.host.change("enable", paused.revision));
    assert.equal(JSON.parse(f.fs.readFileSync(PATHS.status, "utf8")).nativeDistributionEnabled, false);
    assert.equal(f.units.get(UNITS.collectorTimer).activeState, "inactive");
    assert.equal(f.fs.entries.has(GUARD.markerPath), true);
  }
});

test("timer resume failures distinguish effects and restore marker if start did not happen", async () => {
  for (const fault of ["timerBefore", "timerAfter"]) {
    const f = fixture(); const initial = f.host.initialize(); const paused = await f.host.change("pause", initial.revision); f.faults[fault] = true;
    if (fault === "timerBefore") {
      await assert.rejects(() => f.host.change("enable", paused.revision));
      assert.equal(f.fs.entries.has(GUARD.markerPath), true);
      assert.equal(JSON.parse(f.fs.readFileSync(PATHS.operation, "utf8")).markerRestored, true);
    } else assert.equal((await f.host.change("enable", paused.revision)).state, "enabled");
  }
});

test("timer immediately triggering a natural writer uses inspect postflight, not another idle-journal admission", async () => {
  for (const afterEffectException of [false, true]) {
    const f = fixture(); const initial = f.host.initialize(); const paused = await f.host.change("pause", initial.revision);
    f.faults.immediateCollection = true; f.faults.timerAfter = afterEffectException;
    const enabled = await f.host.change("enable", paused.revision);
    assert.equal(enabled.state, "enabled"); assert.equal(enabled.nativeDistributionEnabled, true);
    assert.equal(f.units.get(UNITS.collectorService).activeState, "active"); assert.equal(f.faults.naturalWriterActive, true);
    const startIndex = f.calls.findLastIndex(call => call.command === "/usr/bin/systemctl" && call.args[0] === "start" && call.args[1] === UNITS.collectorTimer);
    const beforeVerifiers = f.calls.slice(0, startIndex).filter(call => call.command === PATHS.verifier);
    assert.ok(beforeVerifiers.length >= 2); assert.equal(beforeVerifiers.at(-1).args[0], "resume");
    assert.equal(beforeVerifiers.at(-2).args[0], "resume");
    assert.ok(f.calls.slice(startIndex + 1).some(call => call.command === PATHS.verifier && call.args[0] === "inspect"));
    assert.equal(f.calls.slice(startIndex + 1).some(call => call.command === PATHS.verifier && call.args[0] === "resume"), false);
    assert.equal(JSON.parse(f.fs.readFileSync(PATHS.operation, "utf8")).stage, "enabled-pending-natural-collection");
  }
});

test("natural-writer postflight still rejects runtime or context drift with native output off", async () => {
  for (const drift of ["context", "generation", "config", "pid"]) {
    const f = fixture(); const initial = f.host.initialize(); const paused = await f.host.change("pause", initial.revision);
    f.faults.immediateCollection = true; f.faults.postStartDrift = drift;
    await assert.rejects(() => f.host.change("enable", paused.revision));
    const status = JSON.parse(f.fs.readFileSync(PATHS.status, "utf8"));
    assert.equal(status.state, "failed"); assert.equal(status.nativeDistributionEnabled, false);
    assert.equal(f.fs.entries.has(GUARD.markerPath), true);
  }
});

test("root CLI rejects arbitrary arguments and never accepts caller proof/paths/initialize via sudo", async () => {
  const calls = [], host = { status: () => ({ safe: true }), initialize: () => { calls.push("init"); },
    async change(...args) { calls.push(args); return { safe: true }; } };
  assert.equal(await runBwhSupplyHost({ argv: ["pause", "other"], host }), 64);
  assert.equal(await runBwhSupplyHost({ argv: ["pause"], input: "{\"proof\":true}", host }), 64);
  assert.equal(await runBwhSupplyHost({ argv: ["pause"], input: `${HASH}\nextra`, host }), 64);
  assert.equal(await runBwhSupplyHost({ argv: ["initialize"], host, isSudo: () => true }), 64);
  assert.deepEqual(calls, []);
  assert.equal(await runBwhSupplyHost({ argv: ["pause"], input: `${HASH}\n`, host, write() {} }), 0);
  assert.deepEqual(calls, [["pause", HASH]]);
});

test("fixed broker symlink resolves the actual module entrypoint", () => {
  const modulePath = fileURLToPath(new URL("../../scripts/bwh-supply-host.mjs", import.meta.url));
  const broker = `${dirname(modulePath)}/broker-link`, other = `${dirname(modulePath)}/other`;
  const resolve = path => path === broker ? modulePath : path;
  assert.equal(isBwhSupplyHostEntrypoint({ argv1: broker, moduleUrl: pathToFileURL(modulePath).href, realpath: resolve }), true);
  assert.equal(isBwhSupplyHostEntrypoint({ argv1: other, moduleUrl: pathToFileURL(modulePath).href, realpath: resolve }), false);
});
