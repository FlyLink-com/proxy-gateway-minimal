import {
  closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync, readFileSync,
  readlinkSync, readdirSync, renameSync, writeFileSync
} from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { networkInterfaces } from "node:os";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer, request } from "node:http";
import { createHysteria2ExplicitRestartAdapter } from "../../server/services/edge/hysteria2-runtime-adapter.mjs";

// Vendor digest is also pinned independently by the preparation-only script.
const HYSTERIA_SHA256 = "66dbdb0608f25f3057b433afe975a9fc1af2ca8e512479e294988b3ef363d6c1";
const PORTS = Object.freeze({ server: 25443, stats: 26080, target: 26081, clients: [26101, 26102, 26103] });
const ALL_PORTS = [PORTS.server, PORTS.stats, PORTS.target, ...PORTS.clients];
const SAFE_USER = /^[a-z0-9._-]{1,128}$/;
const SAFE_REF = /^[A-Za-z0-9._:-]{1,128}$/;
export const DATA_PACK_TRANSPORT_LIMITS = Object.freeze({
  maxTransferBytes: 255 * 1024, maxProbeTimeoutMs: 5000,
  maxCredentials: 3, maxRequests: 48, maxStatsBytes: 64 * 1024, ports: PORTS
});
const fail = (code) => { throw Object.assign(new Error(code), { code }); };
const plain = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const exactKeys = (value, keys) => plain(value) && Object.keys(value).every((key) => keys.includes(key));
const scalar = (value) => JSON.stringify(value);
const sameFile = (a, b) => ["dev", "ino", "size", "mtimeMs", "ctimeMs"].every((key) => a[key] === b[key]);
const pause = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

export function assertDataPackTransportNamespace({ platform, ownNamespace, hostNamespace, interfaces } = {}) {
  if (platform !== "linux" || !/^net:\[\d+\]$/.test(ownNamespace || "")
    || !/^net:\[\d+\]$/.test(hostNamespace || "") || ownNamespace === hostNamespace
    || !plain(interfaces) || Object.keys(interfaces).length !== 1 || !Array.isArray(interfaces.lo)
    || !interfaces.lo.length || !interfaces.lo.some((entry) => entry.address === "127.0.0.1")
    || interfaces.lo.some((entry) => entry.internal !== true || !["127.0.0.1", "::1"].includes(entry.address))) {
    fail("namespace_boundary_invalid");
  }
  return true;
}

function directPath(runDir, filePath, { directory = false, absent = false } = {}) {
  if (typeof filePath !== "string" || !isAbsolute(filePath) || resolve(filePath) !== filePath) fail("private_path_invalid");
  const inside = relative(runDir, filePath);
  if (inside === ".." || inside.startsWith(`..${sep}`) || isAbsolute(inside)) fail("private_path_invalid");
  const components = inside ? inside.split(sep) : [];
  let current = runDir;
  for (let i = -1; i < components.length; i++) {
    if (i >= 0) current = join(current, components[i]);
    let info;
    try { info = lstatSync(current); } catch (error) {
      if (absent && error.code === "ENOENT" && i === components.length - 1) return null;
      fail("private_path_invalid");
    }
    const requireDirectory = i === -1 || i < components.length - 1 || directory;
    if (info.isSymbolicLink() || (requireDirectory ? !info.isDirectory() : !info.isFile())) fail("private_path_invalid");
    if (process.platform !== "win32" && ((info.mode & 0o077) !== 0 || info.uid !== process.getuid())) fail("private_path_invalid");
  }
  return lstatSync(filePath);
}

export function assertDataPackTransportPaths({ runDir, binaryPath = join(runDir || "", "hysteria-linux-amd64"),
  certificatePath = join(runDir || "", "server.crt"), privateKeyPath = join(runDir || "", "server.key") } = {}) {
  if (typeof runDir !== "string" || !isAbsolute(runDir) || resolve(runDir) !== runDir
    || !/^gccgw-data-pack-wsl\.[A-Za-z0-9]{6,8}$/.test(basename(runDir))) fail("private_path_invalid");
  directPath(runDir, runDir, { directory: true });
  for (const filePath of [binaryPath, certificatePath, privateKeyPath]) directPath(runDir, filePath);
  if (new Set([binaryPath, certificatePath, privateKeyPath]).size !== 3
    || basename(binaryPath) !== "hysteria-linux-amd64") fail("private_path_invalid");
  return true;
}

function protectedRead(runDir, filePath, maxBytes) {
  const before = directPath(runDir, filePath);
  if (before.size > maxBytes) fail("private_file_invalid");
  const fd = openSync(filePath, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try {
    if (!sameFile(before, fstatSync(fd))) fail("private_file_invalid");
    const bytes = readFileSync(fd);
    if (!sameFile(before, fstatSync(fd)) || !sameFile(before, directPath(runDir, filePath))) fail("private_file_invalid");
    return bytes;
  } finally { closeSync(fd); }
}

function nativeBoundary(paths) {
  if (dirname(paths.runDir) !== "/tmp" || !/^gccgw-data-pack-wsl\.[A-Za-z0-9]{8}$/.test(basename(paths.runDir))
    || !lstatSync("/tmp").isDirectory() || lstatSync("/tmp").isSymbolicLink()) fail("private_path_invalid");
  assertDataPackTransportPaths(paths);
  assertDataPackTransportNamespace({ platform: process.platform,
    ownNamespace: readlinkSync("/proc/self/ns/net"), hostNamespace: paths.parentNetworkNamespace, interfaces: networkInterfaces() });
  if (createHash("sha256").update(protectedRead(paths.runDir, paths.binaryPath, 128 * 1024 * 1024)).digest("hex") !== HYSTERIA_SHA256) {
    fail("binary_digest_mismatch");
  }
}

function readProcessIdentity(pid) {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    const fields = stat.slice(stat.lastIndexOf(")") + 2).trim().split(/\s+/);
    if (["Z", "X"].includes(fields[0])) return null;
    if (!/^\d+$/.test(fields[19] || "")) fail("process_readback_failed");
    return { token: `${pid}:${fields[19]}`, executable: readlinkSync(`/proc/${pid}/exe`), state: fields[0] };
  } catch (error) { if (["ENOENT", "ESRCH"].includes(error.code)) return null; fail("process_readback_failed"); }
}

function readProcessListeners(pid) {
  const inodes = new Set();
  if (pid) {
    try {
      for (const fd of readdirSync(`/proc/${pid}/fd`)) {
        try { const match = /^socket:\[(\d+)\]$/.exec(readlinkSync(`/proc/${pid}/fd/${fd}`)); if (match) inodes.add(match[1]); }
        catch (error) { if (error.code !== "ENOENT") fail("listener_readback_failed"); }
      }
    } catch (error) { if (error.code !== "ENOENT") fail("listener_readback_failed"); }
  }
  const result = [];
  for (const protocol of ["tcp", "tcp6", "udp", "udp6"]) {
    const content = readFileSync(`/proc/self/net/${protocol}`, "utf8");
    if (content.length > 1024 * 1024) fail("listener_readback_failed");
    for (const line of content.trim().split("\n").slice(1)) {
      const fields = line.trim().split(/\s+/), [address, rawPort] = (fields[1] || "").split(":");
      const port = Number.parseInt(rawPort, 16);
      if (!ALL_PORTS.includes(port) || !(protocol.startsWith("tcp") ? fields[3] === "0A" : fields[3] === "07")) continue;
      result.push({ port, protocol: protocol.startsWith("tcp") ? "tcp" : "udp",
        loopback: address === "0100007F" || address === "00000000000000000000000001000000",
        ...(pid && inodes.has(fields[9]) ? { pid } : {}) });
    }
  }
  return result;
}

function poll(check, deadline) {
  do { if (check()) return true; if (Date.now() >= deadline) return false; pause(Math.min(20, deadline - Date.now())); } while (true);
}

function requestBytes({ port, path, bytes, timeoutMs }) {
  return new Promise((accept, reject) => {
    const req = request({ host: "127.0.0.1", port, method: "GET", path, agent: false,
      headers: { Connection: "close" }, maxHeaderSize: 1024 }, (res) => {
      const chunks = []; let count = 0;
      res.on("data", (chunk) => { count += chunk.length; if (count > bytes) req.destroy(new Error("response_limit")); else chunks.push(chunk); });
      res.on("error", reject); res.on("end", () => accept({ statusCode: res.statusCode, body: Buffer.concat(chunks) }));
    });
    const timer = setTimeout(() => req.destroy(new Error("request_timeout")), timeoutMs);
    req.on("close", () => clearTimeout(timer)); req.on("error", reject); req.end();
  });
}

async function createTarget() {
  let requests = 0;
  const server = createServer({ maxHeaderSize: 1024, requestTimeout: 4000, headersTimeout: 4000 }, (req, res) => {
    const match = /^\/bytes\/([1-9]\d{0,5})$/.exec(req.url || "");
    const bytes = Number(match?.[1]);
    if (++requests > DATA_PACK_TRANSPORT_LIMITS.maxRequests || req.method !== "GET" || !match
      || bytes > DATA_PACK_TRANSPORT_LIMITS.maxTransferBytes) { res.writeHead(400, { Connection: "close" }); res.end(); return; }
    res.writeHead(200, { "Content-Length": bytes, Connection: "close" }); res.end(Buffer.alloc(bytes, 0x61));
  });
  server.maxConnections = 4;
  server.on("connection", (socket) => socket.setTimeout(4000, () => socket.destroy()));
  await new Promise((accept, reject) => { server.once("error", reject); server.listen(PORTS.target, "127.0.0.1", accept); });
  return { close: () => new Promise((accept, reject) => {
    const timer = setTimeout(() => reject(new Error("target_stop_timeout")), 1000);
    server.close((error) => { clearTimeout(timer); error ? reject(error) : accept(); }); server.closeAllConnections();
  }) };
}

function normalizedCredential(input) {
  if (!exactKeys(input, ["credentialRef", "materialDigest", "material"]) || !SAFE_USER.test(input.credentialRef || "")
    || !exactKeys(input.material, ["uuid", "password"]) || !/^[0-9a-f-]{36}$/.test(input.material.uuid || "")
    || typeof input.material.password !== "string" || !/^[\x21-\x7e]{8,256}$/.test(input.material.password)) fail("credential_state_invalid");
  const digest = `sha256:${createHash("sha256").update(input.material.uuid).update("\0").update(input.material.password).digest("hex")}`;
  if (input.materialDigest !== undefined && input.materialDigest !== digest) fail("credential_state_invalid");
  return { credentialRef: input.credentialRef, materialDigest: digest, material: { ...input.material } };
}

/** Explicit opt-in transport; construction never binds a socket or starts a process. */
export function createDataPackHysteriaTransport(options = {}, dependencies = {}) {
  if (!exactKeys(options, ["runDir", "binaryPath", "certificatePath", "privateKeyPath", "parentNetworkNamespace"])) fail("transport_options_invalid");
  const runDir = options.runDir;
  const paths = { runDir, binaryPath: options.binaryPath || join(runDir || "", "hysteria-linux-amd64"),
    certificatePath: options.certificatePath || join(runDir || "", "server.crt"), privateKeyPath: options.privateKeyPath || join(runDir || "", "server.key"),
    parentNetworkNamespace: options.parentNetworkNamespace };
  const runtime = { verifyBoundary: nativeBoundary, spawn, readIdentity: readProcessIdentity,
    readListeners: readProcessListeners, requestBytes, createTarget, ...dependencies };
  const evidenceMode = Object.keys(dependencies).length ? "synthetic_transport" : "physical_process";
  let started = false, closed = false, target = null, server = null, candidate = null, activeMaterials = new Map(), requests = 0;
  let sequence = 0;
  const owned = new Set();
  const runtimeDir = join(runDir || "", "transport"), activePath = join(runtimeDir, "active.yaml"), candidatePath = join(runtimeDir, "candidate.yaml");
  function boundary() {
    try { runtime.verifyBoundary(paths); } catch (error) {
      if (["namespace_boundary_invalid", "private_path_invalid", "binary_digest_mismatch"].includes(error.code)) throw error;
      fail("transport_boundary_failed");
    }
  }
  function ready() { if (!started || closed) fail("transport_not_started"); boundary(); }
  function writeProtected(filePath, content) {
    directPath(runDir, dirname(filePath), { directory: true }); directPath(runDir, filePath, { absent: true });
    const temporary = join(runtimeDir, `write-${++sequence}.tmp`);
    writeFileSync(temporary, content, { flag: "wx", mode: 0o600 });
    directPath(runDir, temporary); directPath(runDir, filePath, { absent: true }); renameSync(temporary, filePath);
  }
  function unoccupied(ports) {
    if (runtime.readListeners().some((entry) => ports.includes(entry.port))) fail("test_port_occupied");
  }
  function launch(mode, configPath) {
    boundary(); directPath(runDir, configPath);
    let child;
    try { child = runtime.spawn(paths.binaryPath, [mode, "-c", configPath, "--disable-update-check", "--log-level", "error"],
      { cwd: runDir, env: {}, shell: false, stdio: "ignore", windowsHide: true }); }
    catch { fail("owned_process_start_failed"); }
    child.on("error", () => {});
    if (!Number.isSafeInteger(child.pid) || child.pid <= 0 || typeof child.kill !== "function") fail("owned_process_start_failed");
    const record = { child, token: null, stopped: false };
    owned.add(record);
    const verified = poll(() => {
      const identity = runtime.readIdentity(child.pid);
      if (identity) {
        if (record.token && record.token !== identity.token) fail("owned_process_identity_changed");
        record.token = identity.token;
      }
      return identity?.executable === paths.binaryPath;
    }, Date.now() + 500);
    if (!verified) { stop(record); fail("owned_process_start_failed"); }
    return record;
  }
  function alive(record) {
    const identity = record && runtime.readIdentity(record.child.pid);
    if (!identity) return false;
    if (!record.token || identity.token !== record.token || identity.executable !== paths.binaryPath) fail("owned_process_identity_changed");
    return true;
  }
  function listenerPresent(record, ports) {
    if (!alive(record)) return false;
    const listeners = runtime.readListeners(record.child.pid);
    return ports.every((port) => listeners.some((entry) => entry.port === port && entry.loopback === true
      && entry.pid === record.child.pid && entry.protocol === (port === PORTS.server ? "udp" : "tcp")));
  }
  function stop(record, signal = "SIGTERM") {
    if (!record || record.stopped) return;
    if (!alive(record)) { record.stopped = true; return; }
    record.child.kill(signal);
    if (!poll(() => !alive(record), Date.now() + 250)) {
      if (alive(record)) record.child.kill("SIGKILL");
      if (!poll(() => !alive(record), Date.now() + 250)) fail("owned_process_stop_failed");
    }
    record.stopped = true;
  }
  function startServer(filePath) {
    unoccupied([PORTS.server, PORTS.stats]);
    const record = launch("server", filePath);
    if (!poll(() => listenerPresent(record, [PORTS.server, PORTS.stats]), Date.now() + 2500)) {
      stop(record); fail("server_listener_unverified");
    }
    return record;
  }
  const adapter = createHysteria2ExplicitRestartAdapter({
    serviceName: "data-pack-private-hysteria", listener: { listen: "127.0.0.1:25443", certificate: paths.certificatePath,
      privateKey: paths.privateKeyPath, trafficStatsListen: "127.0.0.1:26080" },
    resolveCredentialMaterial: (ref) => activeMaterials.get(ref),
    writeCandidateConfig: (content) => writeProtected(candidatePath, content),
    runConfigTest() {
      // v2.9.3 has no --check. An owned candidate startup verifies parsing/TLS/listeners.
      stop(server); server = null;
      try { candidate = startServer(candidatePath); stop(candidate); candidate = null; return { exitCode: 0 }; }
      catch { return { exitCode: 1 }; }
    },
    backupActiveConfig() {
      if (directPath(runDir, activePath, { absent: true })) writeProtected(join(runtimeDir, "previous.yaml"), protectedRead(runDir, activePath, 65536));
      return { backupRef: "private-config-backup" };
    },
    replaceActiveConfig: () => writeProtected(activePath, protectedRead(runDir, candidatePath, 65536)),
    restartService() { server = startServer(activePath); return { ok: true }; },
    validateService: () => ({ active: alive(server) }),
    validateListener: () => ({ udp443: listenerPresent(server, [PORTS.server, PORTS.stats]) })
  });

  async function transferCredential(input, probe = {}) {
    ready();
    if (!exactKeys(probe, ["slot", "bytes", "timeoutMs", "expectedAllowed"])) fail("probe_bounds_invalid");
    const slot = probe.slot ?? 0, bytes = probe.bytes ?? 1024, timeoutMs = probe.timeoutMs ?? 5000;
    if (!Number.isInteger(slot) || slot < 0 || slot > 2 || !Number.isSafeInteger(bytes) || bytes < 1
      || bytes > DATA_PACK_TRANSPORT_LIMITS.maxTransferBytes || !Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 5000
      || ++requests > DATA_PACK_TRANSPORT_LIMITS.maxRequests) fail("probe_bounds_invalid");
    const entry = normalizedCredential(input), port = PORTS.clients[slot], deadline = Date.now() + timeoutMs - 600;
    unoccupied([port]);
    const configPath = join(runtimeDir, `client-${++sequence}.yaml`);
    writeProtected(configPath, `server: "127.0.0.1:25443"\nauth: ${scalar(`${entry.credentialRef}:${entry.material.password}`)}\n`
      + `tls:\n  sni: "127.0.0.1"\n  ca: ${scalar(paths.certificatePath)}\n  insecure: false\n`
      + `tcpForwarding:\n  - listen: "127.0.0.1:${port}"\n    remote: "127.0.0.1:26081"\n`);
    let client;
    try {
      client = launch("client", configPath);
      if (!poll(() => listenerPresent(client, [port]), deadline)) return { allowed: false, transferredBytes: 0, category: "protocol_probe_failed" };
      const result = await runtime.requestBytes({ port, path: `/bytes/${bytes}`, bytes, timeoutMs: Math.max(1, deadline - Date.now()) });
      const allowed = result.statusCode === 200 && Buffer.isBuffer(result.body) && result.body.length === bytes
        && result.body.every((value) => value === 0x61);
      return { allowed, transferredBytes: allowed ? bytes : 0, ...(allowed ? {} : { category: "protocol_probe_failed" }) };
    } catch (error) {
      if (error.code === "owned_process_identity_changed") throw error;
      return { allowed: false, transferredBytes: 0, category: "protocol_probe_failed" };
    } finally { stop(client); if (runtime.readListeners().some((entry) => entry.port === port)) fail("client_cleanup_unverified"); }
  }

  return {
    evidenceMode,
    async start() {
      if (started || closed) fail("transport_already_started"); boundary(); unoccupied(ALL_PORTS);
      if (directPath(runDir, runtimeDir, { directory: true, absent: true })) fail("private_path_invalid");
      mkdirSync(runtimeDir, { mode: 0o700 });
      try { target = await runtime.createTarget(); started = true; }
      catch { fail("target_start_failed"); }
      if (!runtime.readListeners(process.pid).some((entry) => entry.port === PORTS.target && entry.protocol === "tcp"
        && entry.loopback === true && entry.pid === process.pid)) fail("target_listener_unverified");
      return { started: true, privateLoopback: true };
    },
    async applyState(state) {
      ready();
      if (!exactKeys(state, ["desiredStateRef", "generation", "credentials", "materialDigests"])
        || !SAFE_REF.test(state.desiredStateRef || "") || !Number.isSafeInteger(state.generation) || state.generation < 0
        || !Array.isArray(state.credentials) || state.credentials.length < 1 || state.credentials.length > 3
        || !Array.isArray(state.materialDigests)) fail("credential_state_invalid");
      const credentials = state.credentials.map(normalizedCredential);
      if (state.credentials.some((entry) => entry.materialDigest === undefined)
        || new Set(credentials.map((entry) => entry.credentialRef)).size !== credentials.length
        || state.materialDigests.length !== credentials.length || credentials.some((entry) => !state.materialDigests.some((item) =>
          exactKeys(item, ["edgeCredentialRef", "digest"]) && item.edgeCredentialRef === entry.credentialRef && item.digest === entry.materialDigest))) {
        fail("credential_state_invalid");
      }
      const existing = runtime.readListeners(server?.child.pid).filter((entry) => [PORTS.server, PORTS.stats].includes(entry.port));
      if (existing.some((entry) => !server || entry.pid !== server.child.pid || !entry.loopback)) fail("test_port_occupied");
      if (server) alive(server);
      activeMaterials = new Map(credentials.map((entry) => [entry.credentialRef, entry.material]));
      let receipt;
      try { receipt = adapter.applyCredentialReconciliation({ activationSurface: "explicit-restart", runtime: "hysteria2",
        actions: credentials.map((entry) => ({ action: "add", credentialRef: entry.credentialRef })) }); }
      catch (error) { if (["test_port_occupied", "owned_process_identity_changed"].includes(error.code)) throw error; fail("runtime_apply_failed"); }
      if (receipt.status !== "applied") fail("runtime_apply_failed");
      return { status: "applied", desiredStateRef: state.desiredStateRef, generation: state.generation,
        materialDigests: credentials.map((entry) => entry.materialDigest), credentialCount: credentials.length,
        configTest: receipt.configTest?.ok === true, serviceActive: receipt.service?.active === true,
        listenerPresent: receipt.listener?.udp443 === true, restarted: receipt.service?.restarted === true };
    },
    probeCredential: transferCredential, transferCredential,
    async readStats(input = {}) {
      ready();
      if (!exactKeys(input, ["clear", "channelRef"]) || input.clear !== true) fail("stats_bounds_invalid");
      if (!listenerPresent(server, [PORTS.server, PORTS.stats])) fail("stats_read_failed");
      await new Promise((accept) => setTimeout(accept, 100));
      try {
        const response = await runtime.requestBytes({ port: PORTS.stats, path: "/traffic?clear=1", bytes: DATA_PACK_TRANSPORT_LIMITS.maxStatsBytes, timeoutMs: 2000 });
        if (response.statusCode !== 200 || !Buffer.isBuffer(response.body) || response.body.length > DATA_PACK_TRANSPORT_LIMITS.maxStatsBytes) fail("stats_read_failed");
        const map = JSON.parse(response.body.toString("utf8"));
        if (!plain(map) || Object.keys(map).length > 3 || Object.entries(map).some(([ref, stat]) => !SAFE_USER.test(ref)
          || !exactKeys(stat, ["tx", "rx"]) || !Number.isSafeInteger(stat.tx) || stat.tx < 0 || !Number.isSafeInteger(stat.rx) || stat.rx < 0)) fail("stats_read_failed");
        return map;
      } catch { fail("stats_read_failed"); }
    },
    async recover() {
      ready(); if (!alive(server)) fail("recovery_precondition_failed");
      stop(server, "SIGKILL"); server = startServer(activePath);
      const recovered = alive(server) && listenerPresent(server, [PORTS.server, PORTS.stats]);
      return { interrupted: true, recovered, serviceActive: recovered, listenerPresent: recovered };
    },
    async close() {
      closed = true;
      let cleanupError;
      for (const record of owned) { try { stop(record); } catch (error) { cleanupError ||= error; } }
      if (target) { try { await target.close(); target = null; } catch { cleanupError ||= Object.assign(new Error("target_cleanup_unverified"), { code: "target_cleanup_unverified" }); } }
      if (cleanupError) throw cleanupError;
      try { if (runtime.readListeners().some((entry) => ALL_PORTS.includes(entry.port))) fail("listener_cleanup_unverified"); }
      catch { fail("listener_cleanup_unverified"); }
      return { processesStopped: true, listenersClear: true, ownedProcessCount: owned.size };
    }
  };
}
