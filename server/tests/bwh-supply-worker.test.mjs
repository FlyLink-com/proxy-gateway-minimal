import test from "node:test";
import assert from "node:assert/strict";
import { PassThrough, Writable } from "node:stream";
import { readFileSync } from "node:fs";
import { parseBwhSupplyWireRequest, encodeBwhSupplyWireRequest,
  parseBwhSupplyWireResponse, encodeBwhSupplyWireResponse,
  BWH_SUPPLY_SOCKET_PATH, BWH_SUPPLY_WIRE_MAX_REQUEST_BYTES,
  BWH_SUPPLY_WIRE_MAX_RESPONSE_BYTES } from "../../scripts/lib/bwh-supply-wire.mjs";
import { runBwhSupplyWorker } from "../../scripts/bwh-supply-worker.mjs";

const REVISION = "a".repeat(64);
const STATUS = Object.freeze({ revision: REVISION, state: "paused", protocolsRunning: 0,
  collectorState: "paused", nativeDistributionEnabled: false, observedAt: "2026-10-19T12:00:00.000Z",
  canPause: false, canEnable: true });
const line = value => `${JSON.stringify(value)}\n`;
function fixture(options = {}) {
  const input = new PassThrough(), output = new PassThrough(), calls = [], chunks = [];
  output.on("data", value => chunks.push(value));
  const host = { status() { calls.push(["status"]); return { ...STATUS }; },
    async change(action, revision) { calls.push([action, revision]); return { ...STATUS }; },
    initialize() { assert.fail("initialize is never socket-callable"); } };
  return { input, output, host, calls, result: () => Buffer.concat(chunks).toString("utf8"),
    run: overrides => runBwhSupplyWorker({ input, output, host, isRoot: () => true, ...options, ...overrides }) };
}

test("wire accepts only fixed status/pause/enable single-line frames", () => {
  assert.equal(BWH_SUPPLY_SOCKET_PATH, "/run/gccgw-bwh-supply-control/control.sock");
  assert.equal(BWH_SUPPLY_WIRE_MAX_REQUEST_BYTES, 256);
  assert.equal(BWH_SUPPLY_WIRE_MAX_RESPONSE_BYTES, 16 * 1024);
  for (const action of ["status", "pause", "enable"]) {
    const request = { version: 1, action, ...(action === "status" ? {} : { revision: REVISION }) };
    assert.deepEqual(parseBwhSupplyWireRequest(encodeBwhSupplyWireRequest(request)), request);
  }
  const reply = { version: 1, ok: true, status: STATUS };
  assert.deepEqual(parseBwhSupplyWireResponse(encodeBwhSupplyWireResponse(reply)), reply);
  assert.deepEqual(parseBwhSupplyWireResponse(encodeBwhSupplyWireResponse({ version: 1, ok: false })), { version: 1, ok: false });
});

test("wire rejects duplicate keys, hidden commands, multiple frames, extras and noncanonical boundary", () => {
  const invalid = ["", line({ version: 1, action: "initialize" }), line({ version: 1, action: "status", revision: REVISION }),
    line({ version: 1, action: "pause" }), line({ version: 1, action: "enable", revision: REVISION.toUpperCase() }),
    line({ version: 1, action: "pause", revision: REVISION, unit: "other.service" }),
    '{"version":1,"action":"status","action":"pause"}\n',
    '{"version":1,"action":"status","\\u0061ction":"status"}\n',
    `${line({ version: 1, action: "status" })}${line({ version: 1, action: "status" })}`,
    '{\n"version":1,"action":"status"}\n', '{"version":1,"action":"status"}',
    '{"version":1,"action":"status"}\r\n', '{"version":1,"action":"status"}\n ',
    `${" ".repeat(256)}\n`, line({ version: "1", action: "status" }), line(["status"])];
  for (const value of invalid) assert.throws(() => parseBwhSupplyWireRequest(value), undefined, value);
  assert.throws(() => encodeBwhSupplyWireRequest({ version: 1, action: "initialize" }));
});

test("wire response only exposes exact sanitized DTO and rejects invalid state combinations", () => {
  for (const response of [{ version: 1, ok: false, error: "private" }, { version: 1, ok: true, status: { ...STATUS, detail: "private" } },
    { version: 1, ok: true, status: { ...STATUS, nativeDistributionEnabled: true } },
    { version: 1, ok: true, status: { ...STATUS, state: "enabled" } },
    { version: 1, ok: true, status: { ...STATUS, revision: 1 } }]) {
    assert.throws(() => parseBwhSupplyWireResponse(line(response)));
    assert.throws(() => encodeBwhSupplyWireResponse(response));
  }
  assert.throws(() => parseBwhSupplyWireResponse('{"version":1,"ok":false,"ok":true}\n'));
  assert.throws(() => parseBwhSupplyWireResponse(`${line({ version: 1, ok: false })}\n`));
});

test("worker waits for EOF then invokes exactly one fixed operation", async () => {
  for (const action of ["status", "pause", "enable"]) {
    const f = fixture(), running = f.run();
    f.input.write(line({ version: 1, action, ...(action === "status" ? {} : { revision: REVISION }) }));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.calls.length, 0, "newline alone is not authorization before EOF");
    f.input.end(); assert.equal(await running, 0);
    assert.deepEqual(f.calls, action === "status" ? [["status"]] : [[action, REVISION]]);
    assert.deepEqual(parseBwhSupplyWireResponse(f.result()), { version: 1, ok: true, status: STATUS });
  }
});

test("worker root/argv/request boundaries never call host and return no diagnostics", async () => {
  const cases = [
    { overrides: { isRoot: () => false }, request: line({ version: 1, action: "status" }), code: 77 },
    { overrides: { argv: ["initialize"] }, request: line({ version: 1, action: "status" }), code: 64 },
    { request: line({ version: 1, action: "initialize" }), code: 64 },
    { request: Buffer.from([0xff, 0x0a]), code: 64 },
    { request: Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(line({ version: 1, action: "status" }))]), code: 64 },
    { request: "x".repeat(257), code: 64 },
    { request: `${line({ version: 1, action: "status" })}${line({ version: 1, action: "status" })}`, code: 64 }
  ];
  for (const item of cases) {
    const f = fixture(), running = f.run(item.overrides); f.input.end(item.request);
    assert.equal(await running, item.code); assert.deepEqual(f.calls, []);
    assert.deepEqual(parseBwhSupplyWireResponse(f.result()), { version: 1, ok: false });
  }
});

test("worker enforces byte limits over multiple chunks and never treats a partial first frame as a command", async () => {
  const f = fixture(), running = f.run();
  f.input.write(line({ version: 1, action: "pause", revision: REVISION }));
  f.input.write(" ".repeat(256));
  assert.equal(await running, 64); assert.deepEqual(f.calls, []);
  assert.equal(f.result(), line({ version: 1, ok: false }));
  const request = line({ version: 1, action: "status" });
  const exact = `${request.slice(0, -1)}${" ".repeat(256 - Buffer.byteLength(request))}\n`;
  assert.equal(Buffer.byteLength(exact), 256);
  assert.deepEqual(parseBwhSupplyWireRequest(exact), { version: 1, action: "status" });
  assert.throws(() => parseBwhSupplyWireRequest(` ${exact}`));
  const response = line({ version: 1, ok: false });
  const bounded = `${response.slice(0, -1)}${" ".repeat(16 * 1024 - Buffer.byteLength(response))}\n`;
  assert.equal(Buffer.byteLength(bounded), 16 * 1024);
  assert.deepEqual(parseBwhSupplyWireResponse(bounded), { version: 1, ok: false });
  assert.throws(() => parseBwhSupplyWireResponse(` ${bounded}`));
});

test("worker request read deadline is fixed at five seconds and does not execute an incomplete frame", async () => {
  let expired, cleared = false, deadline;
  const f = fixture({ setTimer(callback, ms) { expired = callback; deadline = ms; return 123; }, clearTimer(id) { assert.equal(id, 123); cleared = true; } });
  const running = f.run(); f.input.write(line({ version: 1, action: "pause", revision: REVISION }));
  assert.equal(deadline, 5000); expired(); assert.equal(await running, 64);
  assert.equal(cleared, true); assert.deepEqual(f.calls, []);
  assert.deepEqual(parseBwhSupplyWireResponse(f.result()), { version: 1, ok: false });
});

test("worker catches pre-dispatch input errors and all host failures without leaking content", async () => {
  const f = fixture(), running = f.run(); f.input.emit("error", new Error("PRIVATE_INPUT"));
  assert.equal(await running, 64); assert.deepEqual(f.calls, []);
  const g = fixture(); g.host.change = async () => { throw new Error("PRIVATE_CONFIG_AND_TOKEN"); };
  const operation = g.run(); g.input.end(line({ version: 1, action: "enable", revision: REVISION }));
  assert.equal(await operation, 2);
  assert.equal(g.result(), line({ version: 1, ok: false }));
});

test("worker continues a dispatched root operation after client input/output disconnect", async () => {
  const f = fixture(); let finish, began, persisted = false;
  const started = new Promise(resolve => { began = resolve; });
  f.host.change = async (action, revision) => { f.calls.push([action, revision]); began();
    await new Promise(resolve => { finish = resolve; }); persisted = true; return { ...STATUS }; };
  const brokenOutput = new Writable({ write(_chunk, _encoding, callback) { callback(Object.assign(new Error("peer gone"), { code: "EPIPE" })); } });
  const running = f.run({ output: brokenOutput }); f.input.end(line({ version: 1, action: "pause", revision: REVISION }));
  await started; f.input.emit("error", Object.assign(new Error("peer gone"), { code: "ECONNRESET" }));
  brokenOutput.emit("error", Object.assign(new Error("peer gone"), { code: "EPIPE" })); finish();
  assert.equal(await running, 0); assert.equal(persisted, true); assert.deepEqual(f.calls, [["pause", REVISION]]);
});

test("worker refuses malformed host output instead of forwarding root internals", async () => {
  const f = fixture(); f.host.status = () => ({ ...STATUS, rawConfig: "PRIVATE" });
  const running = f.run(); f.input.end(line({ version: 1, action: "status" }));
  assert.equal(await running, 2); assert.equal(f.result(), line({ version: 1, ok: false }));
});

test("socket and worker templates are fixed local-only, hardened and do not weaken the app unit", () => {
  const base = new URL("../../ops/bwh-supply-control/", import.meta.url);
  const socket = readFileSync(new URL("gccgw-bwh-supply-control.socket", base), "utf8");
  const service = readFileSync(new URL("gccgw-bwh-supply-control@.service", base), "utf8");
  const launcher = readFileSync(new URL("gccgw-bwh-supply-worker", base), "utf8");
  for (const entry of [`ListenStream=${BWH_SUPPLY_SOCKET_PATH}`, "Accept=yes", "SocketMode=0660", "SocketUser=root", "SocketGroup=__APP_SERVICE_GROUP__",
    "DirectoryMode=0755", "MaxConnections=4", "MaxConnectionsPerSource=4", "TriggerLimitIntervalSec=30s", "TriggerLimitBurst=20", "RemoveOnStop=yes"]) assert.ok(socket.includes(entry), entry);
  assert.equal(/Listen(?:Stream|Datagram|SequentialPacket)=(?!\/run\/gccgw-bwh-supply-control\/control\.sock)[^\n]+/.test(socket), false);
  for (const entry of ["User=root", "Group=root", "NoNewPrivileges=yes", "Restart=no", "RuntimeMaxSec=150s", "KillMode=control-group", "StandardInput=socket", "StandardOutput=socket",
    "ProtectSystem=strict", "PrivateTmp=yes", "ProtectHome=yes", "RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6 AF_NETLINK", "ExecStart=/usr/local/libexec/gccgw-bwh-supply-worker"])
    assert.ok(service.includes(entry), entry);
  assert.equal(/(?:sudo|initialize|NoNewPrivileges=no|\$@|%i)/.test(launcher + service), false);
  assert.ok(launcher.includes("/opt/gccgw-bwh-supply-control/scripts/bwh-supply-worker.mjs"));
  assert.ok(service.includes("ReadWritePaths=/var/lib/gccgw-bwh-supply-control"));
  assert.ok(service.includes("__SQLITE_COORDINATION_DIRECTORY__"));
  assert.equal(/ReadWritePaths=\/(?:etc|var|opt)\s*(?:\n|$)/.test(service), false);
  const writable = service.split(/\r?\n/).filter(value => value.startsWith("ReadWritePaths="));
  assert.deepEqual(writable, ["ReadWritePaths=/var/lib/gccgw-bwh-supply-control",
    "ReadWritePaths=/etc/systemd/system/xray-vless-reality.service.d", "ReadWritePaths=/etc/systemd/system/hysteria2.service.d",
    "ReadWritePaths=/etc/systemd/system/mihomo-tuic.service.d", "ReadWritePaths=__SQLITE_COORDINATION_DIRECTORY__"]);
  assert.equal(/(?:PrivateNetwork=yes|ProtectProc=|ProcSubset=|MemoryDenyWriteExecute=yes)/.test(service), false,
    "verifier needs host loopback/proc and Node defaults must not be silently made incompatible");
});
