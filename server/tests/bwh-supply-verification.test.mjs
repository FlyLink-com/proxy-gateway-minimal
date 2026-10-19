import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, posix } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { createBwhSupplyVerifier } from "../../scripts/lib/bwh-supply-verification.mjs";
import { runBwhSupplyVerify } from "../../scripts/bwh-supply-verify.mjs";
import { runIdentityGateCli } from "../../scripts/identity-gate-check.mjs";
import { runFullMeteringCollection } from "../../scripts/lib/full-metering-collection.mjs";
import { fullMeteringDigest, readFullMeteringJournal } from "../../scripts/lib/full-metering-journal.mjs";
import { fullMeteringChannels, LOCAL_METERING_SCOPE } from "../../scripts/lib/full-metering-scope.mjs";
import { readFullMeteringBindings } from "../../scripts/lib/traffic-vless-recovery-baseline.mjs";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import { serializeControlPlaneReleaseIdentity } from "../services/platform/control-plane-release-identity.mjs";

const sha = value => createHash("sha256").update(value).digest("hex");
const NOW = "2026-10-19T08:00:00.000Z";
const BEFORE = "2026-10-19T07:59:00.000Z";
const SOURCE = "a".repeat(40);
const BOOT = "22222222-2222-4222-8222-222222222222";
const APP = "proxy-gateway-candidate.service";
const ROOT = "/etc/gccgw-bwh-supply-control.json";
const RELEASE = "/opt/gccgw/releases/synthetic/release-identity.json";
const METERING = "/etc/gccgw/full-metering.json";
const MATERIAL = "/var/lib/gccgw/protected-material.json";
const DB = "/var/lib/gccgw/control.sqlite";
const JOURNAL = "/var/lib/gccgw/metering-journal";
const SECRET = "synthetic-private-password-never-return";
const kinds = ["xray", "hy2", "tuic"];
const units = ["xray-vless-reality.service", "hysteria2.service", "mihomo-tuic.service"];
const configPaths = ["/etc/gccgw/xray.json", "/etc/gccgw/hy2.yaml", "/etc/gccgw/tuic.yaml"];
const binaries = ["/opt/gccgw/bin/xray", "/opt/gccgw/bin/hysteria", "/opt/gccgw/bin/mihomo"];
const ports = [443, 8443, 9443];
const statsPorts = [10085, 9999, 9090];
const channels = fullMeteringChannels(LOCAL_METERING_SCOPE);

function cloneStat(info, options, { directory = false, mode = 0o600 } = {}) {
  const bigint = options?.bigint === true;
  const number = value => bigint ? BigInt(value) : Number(value);
  return Object.assign(Object.create(Object.getPrototypeOf(info)), info, {
    uid: number(0), gid: number(0), mode: number((directory ? 0o040000 : 0o100000) | mode),
    nlink: number(1), mtimeMs: bigint ? 1792281600000n : 1792281600000, ctimeMs: bigint ? 1792281600000n : 1792281600000,
    isFile: () => !directory, isDirectory: () => directory, isSymbolicLink: () => false
  });
}

async function fixture(t) {
  // The real identity-gate CLI enables SQLite URI handling before loading the
  // addon. This test process builds its synthetic DB before invoking that CLI,
  // so establish the same startup setting before the first native connection.
  process.env.SQLITE_USE_URI = "1";
  const directory = fs.mkdtempSync(join(tmpdir(), "bwh-supply-verifier-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 25 }));
  const paths = new Map(), descriptors = new Map(), links = new Map(), calls = [], requests = [], gateCalls = [], gateOutputs = [], openedDatabases = [];
  const state = { pids: [601, 602, 603], ticks: [1001, 1002, 1003], stopped: new Set(), counter: 40,
    machineId: "0123456789abcdef0123456789abcdef", source: SOURCE, appCwd: posix.dirname(RELEASE),
    errorBody: null, afterFetch: null, gateTransform: null, varyingProc: false, procReads: 0, changingTicks: false };
  function put(path, content, mode = 0o600) {
    const physical = paths.get(path)?.physical ?? join(directory, "files", ...path.split("/").filter(Boolean));
    fs.mkdirSync(dirname(physical), { recursive: true });
    if (fs.existsSync(physical)) fs.chmodSync(physical, 0o600);
    fs.writeFileSync(physical, content, { mode: 0o600 });
    fs.utimesSync(physical, new Date("2026-10-18T00:00:00.000Z"), new Date("2026-10-18T00:00:00.000Z"));
    paths.set(path, { physical, mode });
    return physical;
  }
  function mapped(path) {
    const item = paths.get(path);
    assert(item, `Unexpected fixture file access: ${path}`);
    return item.physical;
  }
  const rootDirectory = fs.statSync(directory);
  const fsOps = { ...fs,
    lstatSync(path, options) {
      if (paths.has(path)) return cloneStat(fs.lstatSync(mapped(path), options), options, { mode: paths.get(path).mode });
      if (path === `${JOURNAL}/pending.json` || path === `${JOURNAL}/writer.lock`) {
        const physical = join(directory, "journal", posix.basename(path));
        const info = fs.lstatSync(physical, options);
        return cloneStat(info, options, { directory: posix.basename(path) === "writer.lock", mode: 0o600 });
      }
      if (links.has(path)) {
        const value = cloneStat(rootDirectory, options);
        value.isSymbolicLink = () => true;
        return value;
      }
      if (["/", "/etc", "/etc/gccgw", "/var", "/var/lib", "/var/lib/gccgw", "/opt", "/opt/gccgw", "/opt/gccgw/releases", posix.dirname(RELEASE), "/opt/gccgw/bin", JOURNAL].includes(path)) {
        return cloneStat(rootDirectory, options, { directory: true, mode: path === JOURNAL ? 0o700 : 0o755 });
      }
      throw Object.assign(new Error("fixture missing path"), { code: "ENOENT" });
    },
    realpathSync(path) { if (paths.has(path) || path.startsWith("/")) return path; throw Error("fixture realpath"); },
    readFileSync(path, options) {
      if (typeof path === "number") return fs.readFileSync(path, options);
      if (path === "/etc/machine-id") return options ? state.machineId + "\n" : Buffer.from(state.machineId + "\n");
      if (path === "/proc/601/stat" && state.varyingProc) {
        state.procReads += 1;
        const fields = ["S", ...Array(18).fill("0"), String(state.ticks[0] + (state.changingTicks ? state.procReads : 0)), "0"];
        fields[11] = String(state.procReads); fields[12] = String(state.procReads * 2);
        return Buffer.from(`601 (synthetic) ${fields.join(" ")}\n`);
      }
      return fs.readFileSync(mapped(path), options);
    },
    openSync(path, flags) {
      assert.equal(flags & (fs.constants.O_WRONLY | fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_TRUNC), 0, "Verifier must never open for write");
      const fd = fs.openSync(mapped(path), flags & ~fs.constants.O_NOFOLLOW);
      descriptors.set(fd, path); return fd;
    },
    fstatSync(fd, options) { return cloneStat(fs.fstatSync(fd, options), options, { mode: paths.get(descriptors.get(fd)).mode }); },
    closeSync(fd) { descriptors.delete(fd); fs.closeSync(fd); },
    readlinkSync(path) { assert(links.has(path), `Unexpected fixture readlink: ${path}`); return typeof links.get(path) === "function" ? links.get(path)() : links.get(path); }
  };
  put("/etc/machine-id", state.machineId + "\n", 0o644);
  put("/proc/sys/kernel/random/boot_id", BOOT + "\n", 0o444);
  const people = kinds.map((kind, index) => {
    const material = { uuid: `${String(index + 1).padStart(8, "0")}-1111-4111-8111-111111111111`, password: SECRET + index };
    return { credentialRef: `edgecred_private_${kind}`, material,
      materialDigest: `sha256:${createHash("sha256").update(material.uuid).update("\0").update(material.password).digest("hex")}` };
  });
  put(MATERIAL, JSON.stringify({ version: 1, records: people }));
  put(configPaths[0], JSON.stringify({ api: { tag: "api", services: ["StatsService"] }, policy: { levels: { 0: { statsUserUplink: true, statsUserDownlink: true } } },
    inbounds: [{ tag: "client", listen: "0.0.0.0", port: ports[0], protocol: "vless", settings: { clients: [{ id: people[0].material.uuid, email: people[0].credentialRef }] } },
      { tag: "api", listen: "127.0.0.1", port: statsPorts[0], protocol: "dokodemo-door" }] }));
  put(configPaths[1], `listen: :${ports[1]}\nauth:\n  type: userpass\n  userpass:\n    ${people[1].credentialRef}: "${people[1].material.password}"\ntrafficStats:\n  listen: "127.0.0.1:${statsPorts[1]}"\n`);
  put(configPaths[2], `external-controller: "127.0.0.1:${statsPorts[2]}"\nlisteners:\n  - name: "private-listener"\n    type: tuic\n    port: ${ports[2]}\n    users:\n      "${people[2].material.uuid}": "${people[2].material.password}"\n`);
  binaries.forEach((binary, index) => put(binary, `synthetic-protocol-binary-${index}`, 0o755));
  put("/usr/bin/node", "synthetic-node-binary", 0o755);
  function generation(index) { return sha(JSON.stringify([BOOT, String(state.pids[index]), String(state.ticks[index]), sha(fs.readFileSync(mapped(binaries[index])))])); }
  function refreshProc() {
    kinds.forEach((_kind, index) => {
      const pid = state.pids[index];
      put(`/proc/${pid}/stat`, `${pid} (synthetic) S ${Array(18).fill("0").join(" ")} ${state.ticks[index]} 0\n`, 0o444);
      put(`/proc/${pid}/cmdline`, `${binaries[index]}\0-c\0${configPaths[index]}\0`, 0o444);
      links.set(`/proc/${pid}/exe`, binaries[index]);
    });
    put("/proc/500/stat", `500 (node) S ${Array(18).fill("0").join(" ")} 5000 0\n`, 0o444);
    put("/proc/500/cmdline", `/usr/bin/node\0${posix.dirname(RELEASE)}/server/index.mjs\0`, 0o444);
    put("/proc/500/status", "Name:\tnode\nUid:\t0\t0\t0\t0\n", 0o444);
    links.set("/proc/500/cwd", () => state.appCwd);
    links.set("/proc/500/exe", "/usr/bin/node");
  }
  refreshProc();
  const release = { schemaVersion: "1", type: "control_plane_release_identity", state: "verified", releaseUnit: "control-plane-app", sourceCommit: SOURCE,
    artifactRelease: "synthetic", artifactManifestSha256: "b".repeat(64), sourceArtifactSha256: "c".repeat(64), dependencyArtifactManifestSha256: "d".repeat(64), dependencyArchiveSha256: "e".repeat(64) };
  put(RELEASE, serializeControlPlaneReleaseIdentity(release));
  const dbPath = put(DB, "");
  const database = new Database(dbPath);
  const store = createSqliteSubscriptionControlStore({ dbPath, database });
  people.forEach((person, index) => {
    const id = `private-account-${index}`, ent = `private-entitlement-${index}`, req = `private-request-${index}`, channel = channels[index].channelRef;
    store.createAccount({ id, ownerRef: `private-owner-${index}`, status: "active", createdAt: BEFORE, updatedAt: BEFORE });
    store.createEntitlement({ id: ent, accountId: id, plan: "yearly", status: "active", validFrom: "2026-01-01T00:00:00.000Z", validUntil: "2027-01-01T00:00:00.000Z", trafficLimitBytes: 1000000, createdAt: BEFORE, updatedAt: BEFORE });
    store.createIssuanceRequest({ id: req, accountId: id, entitlementId: ent, approvalRef: `private-approval-${index}`, status: "issued", quantity: 1, nodeId: channel, purpose: "portal_auto_issuance", requestedByRef: "synthetic", createdAt: BEFORE, updatedAt: BEFORE });
    store.linkIssuedSubscription({ id: `private-link-${index}`, requestId: req, tenantRef: `private-tenant-${index}`, artifactRef: `private-artifact-${index}`, status: "active", createdAt: BEFORE, updatedAt: BEFORE });
    store.upsertPortalAccessRequest({ id: req, portalUserRef: id, plan: "yearly", clientTarget: "clash", durationDays: 365, quantity: 1, status: "delivered", nextAction: "user_can_use_access", noteProvided: false, priorTrialState: "not_applicable", submittedAt: BEFORE, updatedAt: BEFORE, validUntil: "2027-01-01T00:00:00.000Z", entitlementRef: ent, accessGrantRef: `private-grant-${index}`, tenantId: `private-tenant-${index}`, artifactId: `private-artifact-${index}`, edgeChannelRef: channel, edgeCredentialRef: person.credentialRef, edgeMaterialDigest: person.materialDigest });
  });
  database.pragma("wal_checkpoint(TRUNCATE)"); database.close();
  const metering = { version: 1, meteringScope: LOCAL_METERING_SCOPE, activationId: "synthetic-activation", dbPath: DB, journalDirectory: JOURNAL, materialPath: MATERIAL,
    sources: kinds.map((kind, index) => ({ channelRef: channels[index].channelRef, host: "local", kind, runtimeUnit: units[index], configPath: configPaths[index] })),
    backup: { path: "/var/lib/gccgw/pre-activation.sqlite", sha256: "f".repeat(64) }, sgp: { status: "paused", usage: "unknown" } };
  put(METERING, JSON.stringify(metering));
  const root = { version: 1, target: "bwh-us", sourceCommit: SOURCE, hostIdentityDigest: sha(state.machineId), verifierSha256: "f".repeat(64),
    verification: { version: 1, releaseIdentityPath: RELEASE, releaseIdentitySha256: sha(fs.readFileSync(mapped(RELEASE))), meteringConfigPath: METERING, meteringConfigSha256: sha(fs.readFileSync(mapped(METERING))), controlPlanePort: 3456 } };
  put(ROOT, JSON.stringify(root));
  function inventory() {
    const info = fsOps.lstatSync(DB);
    const digest = fullMeteringDigest({ path: DB, dev: String(info.dev), ino: String(info.ino) });
    const db = new Database(dbPath, { readonly: true, fileMustExist: true });
    try { return db.transaction(() => readFullMeteringBindings({ db, databaseIdentityDigest: digest, channelRefs: channels.map(channel => channel.channelRef), now: NOW }))(); }
    finally { db.close(); }
  }
  const journalDirectory = join(directory, "journal");
  const info = fsOps.lstatSync(DB);
  const context = { scopeDigest: root.verification.meteringConfigSha256, databaseIdentityDigest: fullMeteringDigest({ path: DB, dev: String(info.dev), ino: String(info.ino) }), meteringScope: LOCAL_METERING_SCOPE };
  await runFullMeteringCollection({ directory: journalDirectory, context, activationId: metering.activationId, meteringScope: LOCAL_METERING_SCOPE, mode: "initialize", nowFn: () => BEFORE,
    readInventory: inventory, readSources: async () => channels.map((channel, index) => ({ ...channel, generation: generation(index), observedAt: BEFORE,
      observations: [{ edgeCredentialRef: people[index].credentialRef, uploadBytes: 10, downloadBytes: 20, ...(channel.mode === "connections" ? { connectionId: "synthetic-connection" } : {}) }] })) });
  function runtime(index) { return { unit: units[index], kind: kinds[index], pid: state.pids[index], active: !state.stopped.has(units[index]) }; }
  function commandRunner(command, args, options) {
    calls.push({ command, args: [...args], options });
    assert.equal(options?.shell, false);
    const result = stdout => ({ status: 0, exitCode: 0, stdout, stderr: "" });
    if (command === "/usr/bin/systemctl") {
      assert.equal(args[0], "show", "Verifier may inspect systemd but never mutate it");
      const unit = args[1], index = units.indexOf(unit), row = index >= 0 ? runtime(index) : { active: true, pid: 500 };
      const collector = unit === "gccgw-full-metering-collect.service";
      assert(index >= 0 || unit === APP || collector, `Unexpected inspected unit: ${unit}`);
      const values = { ActiveState: !collector && row.active ? "active" : "inactive", SubState: !collector && row.active ? "running" : "dead", MainPID: String(!collector && row.active ? row.pid : 0), ControlPID: "0", Job: "", NRestarts: "0", LoadState: "loaded", NeedDaemonReload: "no", ExecMainStartTimestamp: "Mon 2026-10-19 07:00:00.000000 UTC", ExecMainStartTimestampMonotonic: "1000000", InvocationID: "1".repeat(32), WorkingDirectory: state.appCwd };
      return result(args.filter(arg => arg.startsWith("--property=")).map(arg => arg.slice(11)).flatMap(key => key.split(",")).map(key => { assert(Object.hasOwn(values, key), `Unexpected property ${key}`); return `${key}=${values[key]}`; }).join("\n") + "\n");
    }
    if (command === "/usr/bin/cat") return result(fsOps.readFileSync(args.at(-1), "utf8"));
    if (command === "/usr/bin/readlink") return result(fsOps.readlinkSync(args.at(-1)) + "\n");
    if (command === "/usr/bin/sha256sum") return result(sha(fs.readFileSync(mapped(args.at(-1)))) + "  " + args.at(-1) + "\n");
    if (command === "/usr/bin/stat") return result(`8180|${fs.statSync(mapped(args.at(-1))).size}|2026-10-18 00:00:00.000000000 +0000|2026-10-18 00:00:00.000000000 +0000|1|123\n`);
    if (command === "/usr/bin/ss") {
      const udp = args.some(arg => arg.includes("u"));
      const rows = kinds.flatMap((_kind, index) => {
        if (state.stopped.has(units[index])) return [];
        const pid = state.pids[index], line = (address, transport) => `${transport === "tcp" ? "LISTEN" : "UNCONN"} 0 4096 ${address} 0.0.0.0:* users:(("synthetic",pid=${pid},fd=3))`;
        return [...(!udp ? [line(`127.0.0.1:${statsPorts[index]}`, "tcp")] : []), ...((udp && index > 0) || (!udp && index === 0) ? [line(`0.0.0.0:${ports[index]}`, udp ? "udp" : "tcp")] : [])];
      });
      if (!udp) rows.push('LISTEN 0 511 127.0.0.1:3456 0.0.0.0:* users:(("node",pid=500,fd=1))');
      return result(rows.join("\n") + "\n");
    }
    if (command === binaries[0]) {
      assert(args.includes("-reset=false") || args.includes("--reset=false"), "Statistics must not clear counters");
      return result(JSON.stringify({ stat: [{ name: `user>>>${people[0].credentialRef}>>>traffic>>>uplink`, value: state.counter }, { name: `user>>>${people[0].credentialRef}>>>traffic>>>downlink`, value: state.counter }] }));
    }
    throw Error(`Unexpected fixture command: ${command}`);
  }
  const options = { fsOps, commandRunner, nowFn: () => new Date(NOW),
    fetchFn: async (url, request) => {
      requests.push({ url: String(url), request }); state.afterFetch?.(String(url));
      assert.equal(request.redirect, "error");
      const path = new URL(url).pathname;
      if (path === "/api/health") return new Response(JSON.stringify({ ok: true }), { status: 200 });
      if (path === "/sub/clash.yaml") return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
      if (path === "/traffic") return new Response(JSON.stringify({ [people[1].credentialRef]: { tx: state.counter, rx: state.counter } }), { status: 200 });
      if (path === "/connections") return new Response(JSON.stringify({ connections: [{ id: "synthetic-connection", metadata: { inboundUser: people[2].material.uuid }, upload: state.counter, download: state.counter }] }), { status: 200 });
      throw Error("Unexpected endpoint");
    },
    databaseFactory(path, databaseOptions = { readonly: true, fileMustExist: true }) {
      assert.equal(path, DB); assert.equal(databaseOptions.readonly, true); assert.equal(databaseOptions.fileMustExist, true);
      openedDatabases.push(databaseOptions); return new Database(mapped(path), databaseOptions);
    },
    async identityGateRunner(input) {
      gateCalls.push(input);
      const argv = Array.isArray(input) ? input : input.argv;
      const mappedArgs = argv.map(value => paths.has(value) ? mapped(value) : value);
      let text = "";
      const status = await runIdentityGateCli({ argv: mappedArgs, stdout: { write(value) { text += value; } } });
      const value = JSON.parse(text);
      gateOutputs.push(value);
      const output = state.gateTransform ? state.gateTransform(value) : value;
      input.stdout.write(JSON.stringify(output) + "\n");
      return status;
    },
    readJournal({ directory: path, context: journalContext }) {
      assert.equal(path, JOURNAL); return readFullMeteringJournal({ directory: journalDirectory, context: journalContext });
    }
  };
  return { options, state, root, release, metering, paths, calls, requests, gateCalls, gateOutputs, openedDatabases, put, mapped, people, refreshProc, context, journalDirectory,
    verifier: () => ({ verify: createBwhSupplyVerifier(options) }), generation,
    rewriteRoot() { put(ROOT, JSON.stringify(root)); },
    rewriteMetering() { put(METERING, JSON.stringify(metering)); root.verification.meteringConfigSha256 = sha(fs.readFileSync(mapped(METERING))); put(ROOT, JSON.stringify(root)); }
  };
}

function assertNoPrivateData(value) {
  const text = JSON.stringify(value);
  for (const privateText of [SECRET, "edgecred_private_", "private-account-", "private-owner-", "private-request-", "private-entitlement-", "1111-4111-8111-111111111111", "private-listener"]) assert.equal(text.includes(privateText), false, privateText);
}

test("inspect derives fixed local runtime and safe public endpoint evidence without reading a ledger", async t => {
  const f = await fixture(t), result = await f.verifier().verify("inspect");
  assert.equal(result.version, 1); assert.equal(result.target, "bwh-us"); assert.equal(result.sourceCommit, SOURCE);
  assert.equal(result.controlPlaneAvailable, true); assert.equal(result.subscriptionAvailable, true); assert.equal(result.resumeAdmission, null);
  assert.match(result.contextDigest, /^[a-f0-9]{64}$/); assert.equal(result.runtimeEvidence.length, 3);
  assert.equal(f.openedDatabases.length, 0); assert.equal(f.gateCalls.length, 0);
  assert.deepEqual(f.requests.map(request => request.url), ["http://127.0.0.1:3456/api/health", "http://127.0.0.1:3456/sub/clash.yaml"]);
  result.runtimeEvidence.forEach((row, index) => { assert.equal(row.unit, units[index]); assert.equal(row.generation, f.generation(index)); assert.equal(row.configDigest, sha(fs.readFileSync(f.mapped(configPaths[index])))); });
  assertNoPrivateData(result);
});

test("context ignores normal counter, checkpoint bytes, database growth and process generations", async t => {
  const f = await fixture(t), first = await f.verifier().verify("inspect");
  f.state.counter = 99999; f.state.pids[0] = 701; f.state.ticks[0] += 999; f.refreshProc();
  const db = new Database(f.mapped(DB)); db.exec("CREATE TABLE unrelated_growth (payload BLOB)"); db.prepare("INSERT INTO unrelated_growth VALUES (?)").run(Buffer.alloc(16384)); db.close();
  fs.appendFileSync(join(f.journalDirectory, "checkpoint.json"), "\n");
  const second = await f.verifier().verify("inspect");
  assert.equal(second.contextDigest, first.contextDigest); assert.notEqual(second.runtimeEvidence[0].generation, first.runtimeEvidence[0].generation);
});

test("partially stopped protocol inspection never produces resume admission", async t => {
  const f = await fixture(t); f.state.stopped.add(units[1]);
  const result = await f.verifier().verify("inspect");
  assert.equal(result.resumeAdmission, null); assert.equal(result.runtimeEvidence[1].mainPid, 0); assert.equal(result.runtimeEvidence[1].generation, null);
  assert.equal((await f.verifier().verify("resume")).resumeAdmission, null);
  assert.equal(f.openedDatabases.length, 0); assert.equal(f.gateCalls.length, 0);
});

test("resume combines real read-only SQLite bindings, real journal and identity checks", async t => {
  const f = await fixture(t), before = sha(fs.readFileSync(f.mapped(DB))), journalBefore = sha(fs.readFileSync(join(f.journalDirectory, "checkpoint.json")));
  const result = await f.verifier().verify("resume");
  assert(result.resumeAdmission); assert.equal(f.gateCalls.length, 3); assert(f.openedDatabases.length > 0, JSON.stringify({ admission: result.resumeAdmission, gates: f.gateOutputs }));
  for (const field of ["missing", "changed", "missingMaterial", "unknown", "stale", "pendingWriterCount"]) assert.equal(result.resumeAdmission[field], 0, JSON.stringify({ admission: result.resumeAdmission, gates: f.gateOutputs }));
  assert.equal(result.resumeAdmission.checkpointContinuity, true); assert.equal(result.resumeAdmission.contextDigest, result.contextDigest);
  assert.equal(result.resumeAdmission.protocols.length, 3); assert.equal(sha(fs.readFileSync(f.mapped(DB))), before);
  assert.equal(sha(fs.readFileSync(join(f.journalDirectory, "checkpoint.json"))), journalBefore); assertNoPrivateData(result);
});

for (const field of ["missing", "changed", "missing_material", "stale"]) {
  test(`resume rejects aggregate identity ${field} even when CLI status is success`, async t => {
    const f = await fixture(t); f.state.gateTransform = value => ({ ...value, state: "degraded", [field]: 1 });
    const result = await f.verifier().verify("resume");
    assert(result.resumeAdmission.unknown > 0 || result.resumeAdmission[field === "missing_material" ? "missingMaterial" : field] > 0); assertNoPrivateData(result);
  });
}

for (const name of ["pending.json", "writer.lock"]) {
  test(`resume never recovers or clears existing ${name}`, async t => {
    const f = await fixture(t), path = join(f.journalDirectory, name);
    if (name === "writer.lock") fs.mkdirSync(path); else fs.writeFileSync(path, "synthetic-private-pending");
    const result = await f.verifier().verify("resume");
    assert.equal(result.resumeAdmission.checkpointContinuity, false); assert(result.resumeAdmission.unknown > 0); assert(result.resumeAdmission.pendingWriterCount > 0); assert(fs.existsSync(path));
  });
}

test("corrupt checkpoint fails without baseline initialization or private error leakage", async t => {
  const f = await fixture(t), path = join(f.journalDirectory, "checkpoint.json");
  fs.writeFileSync(path, '{"private-account-id":"bad"}');
  const result = await f.verifier().verify("resume");
  assert.equal(result.resumeAdmission.checkpointContinuity, false); assert(result.resumeAdmission.unknown > 0); assertNoPrivateData(result);
  assert.equal(fs.readFileSync(path, "utf8"), '{"private-account-id":"bad"}');
});

for (const drift of ["machine", "release", "metering-digest", "app-cwd", "runtime-config-argument", "scope"]) {
  test(`verifier rejects ${drift} drift before reporting healthy`, async t => {
    const f = await fixture(t);
    if (drift === "machine") { f.state.machineId = "changed-private-machine-id"; f.put("/etc/machine-id", f.state.machineId, 0o644); }
    if (drift === "release") { f.release.sourceCommit = "f".repeat(40); f.put(RELEASE, serializeControlPlaneReleaseIdentity(f.release)); }
    if (drift === "metering-digest") f.put(METERING, JSON.stringify({ ...f.metering, activationId: "different" }));
    if (drift === "app-cwd") f.state.appCwd = "/opt/gccgw/releases/different";
    if (drift === "runtime-config-argument") f.put("/proc/601/cmdline", `${binaries[0]}\0-c\0/etc/gccgw/unrelated.json\0`, 0o444);
    if (drift === "scope") { f.metering.meteringScope = "full-five-v1"; f.rewriteMetering(); }
    await assert.rejects(f.verifier().verify("inspect"), error => { assertNoPrivateData({ message: error.message, code: error.code }); return true; });
  });
}

test("read-only endpoint failure and mid-read configuration drift cannot yield healthy evidence", async t => {
  const f = await fixture(t), original = f.options.fetchFn;
  f.options.fetchFn = async (url, request) => String(url).endsWith("/sub/clash.yaml") ? new Response("sensitive-private-error", { status: 302, headers: { location: "https://example.invalid/private" } }) : original(url, request);
  await assert.rejects(f.verifier().verify("inspect"));
  f.options.fetchFn = original;
  f.state.afterFetch = () => f.put(MATERIAL, JSON.stringify({ version: 1, records: [] }));
  await assert.rejects(f.verifier().verify("inspect"));
});

test("invalid mode cannot access files, commands or network", async t => {
  const f = await fixture(t);
  await assert.rejects(f.verifier().verify("reset"));
  assert.equal(f.calls.length, 0); assert.equal(f.requests.length, 0); assert.equal(f.openedDatabases.length, 0);
});

test("normal proc CPU and RSS changes preserve a stable process start identity", async t => {
  const f = await fixture(t); f.state.varyingProc = true;
  const result = await f.verifier().verify("inspect");
  assert.equal(result.runtimeEvidence[0].generation, f.generation(0)); assert(f.state.procReads > 1);
});

test("process start ticks changing during inspection reject reused process identity", async t => {
  const f = await fixture(t); f.state.varyingProc = true; f.state.changingTicks = true;
  await assert.rejects(f.verifier().verify("inspect"));
});

test("resume validates actual protected material instead of accepting matching labels", async t => {
  const f = await fixture(t);
  const records = structuredClone(f.people); records[0].material.password += "-replaced";
  f.put(MATERIAL, JSON.stringify({ version: 1, records }));
  const result = await f.verifier().verify("resume");
  assert(result.resumeAdmission.unknown > 0 || result.resumeAdmission.missingMaterial > 0);
  assert.equal(result.resumeAdmission.checkpointContinuity, false); assertNoPrivateData(result);
});

test("replacing the database file during an otherwise read-only inspect is detected", async t => {
  const f = await fixture(t); let replaced = false;
  f.state.afterFetch = () => {
    if (replaced) return; replaced = true;
    fs.renameSync(f.mapped(DB), f.mapped(DB) + ".retained"); f.put(DB, "synthetic replacement");
  };
  await assert.rejects(f.verifier().verify("inspect"));
});

test("private root configuration with group write permission is rejected before commands", async t => {
  const f = await fixture(t); f.paths.get(ROOT).mode = 0o620;
  await assert.rejects(f.verifier().verify("inspect")); assert.equal(f.calls.length, 0); assert.equal(f.requests.length, 0);
});

test("privileged verifier CLI enables immutable SQLite URI support before opening the verifier", async () => {
  const previous = process.env.SQLITE_USE_URI;
  delete process.env.SQLITE_USE_URI;
  const outputs = [];
  try {
    const status = await runBwhSupplyVerify({ argv: ["inspect"], input: "", isRoot: () => true,
      verify: async mode => { assert.equal(mode, "inspect"); assert.equal(process.env.SQLITE_USE_URI, "1"); return { verified: true }; },
      write: value => outputs.push(value) });
    assert.equal(status, 0); assert.deepEqual(outputs, [{ verified: true }]);
  } finally {
    if (previous === undefined) delete process.env.SQLITE_USE_URI; else process.env.SQLITE_USE_URI = previous;
  }
});
