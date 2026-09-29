import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createDataPackHysteriaTransport, DATA_PACK_TRANSPORT_LIMITS,
  assertDataPackTransportNamespace, assertDataPackTransportPaths
} from "../../scripts/lib/data-pack-hysteria-transport.mjs";

function credential(password = "synthetic-private-password") {
  const material = { uuid: "11111111-1111-4111-8111-111111111111", password };
  const materialDigest = `sha256:${createHash("sha256").update(material.uuid).update("\0").update(password).digest("hex")}`;
  return { credentialRef: "edgecred_pack_a", materialDigest, material };
}

function fixture(t, changes = {}) {
  const runDir = mkdtempSync(join(tmpdir(), "gccgw-data-pack-wsl."));
  for (const name of ["hysteria-linux-amd64", "server.crt", "server.key"]) writeFileSync(join(runDir, name), "synthetic", { mode: 0o600 });
  t.after(() => rmSync(runDir, { recursive: true, force: true }));
  const identities = new Map(), listeners = [], children = [], launches = [];
  let pid = 500, bytesRequests = 0;
  const dependencies = {
    verifyBoundary() { assertDataPackTransportPaths({ runDir }); },
    spawn(binary, args, options) {
      launches.push({ binary, args, options });
      const child = Object.assign(new EventEmitter(), { pid: ++pid, exitCode: null });
      const config = readFileSync(args[args.indexOf("-c") + 1], "utf8");
      const client = args.includes("client");
      identities.set(child.pid, { token: `${child.pid}:10`, executable: binary, state: "S" });
      const ports = client ? [Number(/listen: "127\.0\.0\.1:(2610[123])"/.exec(config)[1])] : [25443, 26080];
      for (const port of ports) listeners.push({ port, protocol: port === 25443 ? "udp" : "tcp", loopback: true, pid: child.pid });
      child.kill = (signal) => {
        child.signals = [...(child.signals || []), signal];
        identities.delete(child.pid);
        for (let i = listeners.length - 1; i >= 0; i--) if (listeners[i].pid === child.pid) listeners.splice(i, 1);
        return true;
      };
      children.push(child);
      return child;
    },
    readIdentity: (childPid) => identities.get(childPid) || null,
    readListeners: () => listeners.map((entry) => ({ ...entry })),
    async createTarget() {
      listeners.push({ port: 26081, protocol: "tcp", loopback: true, pid: process.pid });
      return { async close() { listeners.splice(listeners.findIndex((entry) => entry.port === 26081), 1); } };
    },
    async requestBytes({ bytes }) { bytesRequests += 1; return { statusCode: 200, body: Buffer.alloc(bytes, 0x61) }; },
    ...changes
  };
  const transport = createDataPackHysteriaTransport({ runDir }, dependencies);
  t.after(async () => { try { await transport.close(); } catch { /* Tests also exercise refused cleanup. */ } });
  const state = (entry = credential()) => ({ desiredStateRef: "state_1", generation: 1,
    credentials: [entry], materialDigests: [{ edgeCredentialRef: entry.credentialRef, digest: entry.materialDigest }] });
  return { transport, runDir, identities, listeners, children, launches, state, bytesRequests: () => bytesRequests };
}

test("namespace admission refuses host identity, interfaces and non-loopback addresses", () => {
  const input = { platform: "linux", ownNamespace: "net:[20]", hostNamespace: "net:[10]",
    interfaces: { lo: [{ address: "127.0.0.1", internal: true }, { address: "::1", internal: true }] } };
  assert.equal(assertDataPackTransportNamespace(input), true);
  for (const bad of [ { ...input, ownNamespace: input.hostNamespace },
    { ...input, platform: "win32" }, { ...input, interfaces: { eth0: [] } },
    { ...input, interfaces: { lo: [{ address: "192.0.2.1", internal: true }] } } ]) {
    assert.throws(() => assertDataPackTransportNamespace(bad), { code: "namespace_boundary_invalid" });
  }
});

test("private paths reject escape and linked artifacts before any process launch", (t) => {
  const f = fixture(t);
  assert.throws(() => assertDataPackTransportPaths({ runDir: f.runDir, binaryPath: join(f.runDir, "..", "other") }), { code: "private_path_invalid" });
  const linked = join(f.runDir, "linked.key");
  try { symlinkSync(join(f.runDir, "server.key"), linked); } catch (error) {
    if (error.code === "EPERM") { t.diagnostic("Windows symlink privilege unavailable; escape guard remains checked"); return; }
    throw error;
  }
  assert.throws(() => assertDataPackTransportPaths({ runDir: f.runDir, privateKeyPath: linked }), { code: "private_path_invalid" });
  assert.equal(f.launches.length, 0);
});

test("real renderer applies exact digest state using bounded candidate and active launches", async (t) => {
  const f = fixture(t);
  await f.transport.start();
  const receipt = await f.transport.applyState(f.state());
  assert.equal(f.transport.evidenceMode, "synthetic_transport");
  assert.equal(receipt.status, "applied");
  assert.equal(receipt.configTest, true);
  assert.equal(receipt.serviceActive, true);
  assert.equal(receipt.listenerPresent, true);
  assert.equal(receipt.credentialCount, 1);
  assert.deepEqual(receipt.materialDigests, [credential().materialDigest]);
  assert.equal(f.launches.length, 2);
  assert.match(readFileSync(join(f.runDir, "transport", "active.yaml"), "utf8"), /auth:\n  type: userpass/);
  assert.match(readFileSync(join(f.runDir, "transport", "active.yaml"), "utf8"), /listen: "127\.0\.0\.1:25443"/);
  assert.match(readFileSync(join(f.runDir, "transport", "active.yaml"), "utf8"), /trafficStats:\n  listen: "127\.0\.0\.1:26080"/);
  for (const { args, options } of f.launches) {
    assert.equal(options.shell, false);
    assert.equal(options.stdio, "ignore");
    assert.deepEqual(options.env, {});
    assert.ok(args.includes("--disable-update-check"));
  }
  assert.doesNotMatch(JSON.stringify(receipt), /synthetic-private-password|11111111|auth:/);
});

test("probe uses a fresh owned client every time and enforces slots/bytes/time bounds", async (t) => {
  const f = fixture(t);
  await f.transport.start(); await f.transport.applyState(f.state());
  const first = await f.transport.transferCredential(credential(), { slot: 1, bytes: 16384 });
  const second = await f.transport.probeCredential(credential(), { slot: 1 });
  assert.equal(first.transferredBytes, 16384); assert.equal(second.allowed, true);
  assert.equal(f.launches.filter((entry) => entry.args.includes("client")).length, 2);
  for (const entry of f.launches.filter((entry) => entry.args.includes("client"))) {
    const config = readFileSync(entry.args[entry.args.indexOf("-c") + 1], "utf8");
    assert.match(config, /sni: "127\.0\.0\.1"/);
    assert.match(config, /insecure: false/);
    assert.match(config, /remote: "127\.0\.0\.1:26081"/);
  }
  assert.equal(f.listeners.some((entry) => entry.port === 26102), false);
  for (const options of [{ bytes: 262145 }, { bytes: 0 }, { timeoutMs: 5001 }, { slot: 3 }, { url: "https://example.com" }]) {
    await assert.rejects(f.transport.transferCredential(credential(), options), { code: "probe_bounds_invalid" });
  }
  assert.equal(f.bytesRequests(), 2);
  assert.ok(DATA_PACK_TRANSPORT_LIMITS.maxTransferBytes <= 256 * 1024);
});

test("malformed material, digest mismatch, external controls and occupied ports fail before spawn", async (t) => {
  const f = fixture(t);
  await f.transport.start();
  for (const input of [{ ...f.state(), credentials: [{ ...credential(), materialDigest: `sha256:${"0".repeat(64)}` }] },
    { ...f.state(), credentials: [{ ...credential(), material: { password: "secret\nlisten: :443" } }] },
    { ...f.state(), config: "server: example.com" }, { ...f.state(), env: { HTTPS_PROXY: "http://example.com" } }]) {
    await assert.rejects(f.transport.applyState(input), { code: "credential_state_invalid" });
  }
  assert.equal(f.launches.length, 0);
  f.listeners.push({ port: 25443, protocol: "udp", loopback: true, pid: 9000 });
  await assert.rejects(f.transport.applyState(f.state()), { code: "test_port_occupied" });
  assert.equal(f.launches.length, 0);
});

test("cleanup never kills a reused PID and reports readback failure without raw error material", async (t) => {
  const f = fixture(t);
  await f.transport.start(); await f.transport.applyState(f.state());
  const active = f.children.at(-1);
  f.identities.set(active.pid, { token: `${active.pid}:99`, executable: f.launches[0].binary, state: "S" });
  await assert.rejects(f.transport.close(), { code: "owned_process_identity_changed" });
  assert.equal(active.signals, undefined);
});

test("live request failures are redacted, stats require clear=true, and recovery is owned", async (t) => {
  const f = fixture(t, { async requestBytes() { throw new Error("secret-password https://private-subscription/"); } });
  await f.transport.start(); await f.transport.applyState(f.state());
  assert.deepEqual(await f.transport.probeCredential(credential()), { allowed: false, transferredBytes: 0, category: "protocol_probe_failed" });
  await assert.rejects(f.transport.readStats({ clear: false }), { code: "stats_bounds_invalid" });
  await assert.rejects(f.transport.readStats({ clear: true }), { code: "stats_read_failed" });
  const recovery = await f.transport.recover();
  assert.equal(recovery.interrupted, true); assert.equal(recovery.recovered, true);
  const stopped = await f.transport.close();
  assert.equal(stopped.processesStopped, true); assert.equal(stopped.listenersClear, true);
});

test("stats preserve bounded real counters for the collector and reject redirected/non-numeric responses", async (t) => {
  const requests = [];
  let response = { statusCode: 200, body: Buffer.from('{"edgecred_pack_a":{"tx":100,"rx":200}}') };
  const f = fixture(t, { async requestBytes(input) { requests.push(input); return response; } });
  await f.transport.start(); await f.transport.applyState(f.state());
  assert.deepEqual(await f.transport.readStats({ clear: true, channelRef: "channel_wsl" }), { edgecred_pack_a: { tx: 100, rx: 200 } });
  assert.deepEqual(requests.map(({ port, path }) => ({ port, path })), [{ port: 26080, path: "/traffic?clear=1" }]);
  for (const bad of [{ statusCode: 302, body: Buffer.from("secret https://example.com") },
    { statusCode: 200, body: Buffer.from('{"edgecred_pack_a":{"tx":"secret","rx":0}}') },
    { statusCode: 200, body: Buffer.alloc(DATA_PACK_TRANSPORT_LIMITS.maxStatsBytes + 1) }]) {
    response = bad;
    await assert.rejects(f.transport.readStats({ clear: true }), { code: "stats_read_failed" });
  }
});

test("cleanup escalates only an owned identity and verifies absence of every test listener", async (t) => {
  const f = fixture(t);
  await f.transport.start(); await f.transport.applyState(f.state());
  const active = f.children.at(-1), originalKill = active.kill;
  active.kill = (signal) => {
    if (signal === "SIGTERM") { active.signals = [signal]; return true; }
    return originalKill(signal);
  };
  assert.equal((await f.transport.close()).listenersClear, true);
  assert.deepEqual(active.signals, ["SIGTERM", "SIGKILL"]);
  f.listeners.push({ port: 26103, protocol: "tcp", loopback: true, pid: 9000 });
  await assert.rejects(f.transport.close(), { code: "listener_cleanup_unverified" });
});

test("constructor rejects external URLs, commands and caller environment without doing work", () => {
  for (const option of [{ env: { HTTPS_PROXY: "http://example.com" } }, { command: "sh" },
    { statsUrl: "https://example.com" }, { serverUrl: "127.0.0.2:25443" }]) {
    assert.throws(() => createDataPackHysteriaTransport(option), { code: "transport_options_invalid" });
  }
});
