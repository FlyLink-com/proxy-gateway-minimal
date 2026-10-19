import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { requestBwhSupplyStatus, runBwhSupplyClient } from "../../scripts/bwh-supply-client.mjs";
import { BWH_SUPPLY_SOCKET_PATH } from "../../scripts/lib/bwh-supply-wire.mjs";

const NOW = "2026-10-19T12:00:00.000Z";
const status = { revision: "a".repeat(64), state: "enabled", protocolsRunning: 3, collectorState: "running",
  nativeDistributionEnabled: true, observedAt: NOW, canPause: true, canEnable: false };
const reply = value => `${JSON.stringify({ version: 1, ok: true, status: value })}\n`;
function fixture({ response = reply(status), mode = "reply", unsafe, swappedAt } = {}) {
  const calls = [], reads = []; let socketReads = 0, socket;
  const lstat = path => {
    reads.push(path); const isSocket = path === BWH_SUPPLY_SOCKET_PATH;
    if (isSocket) socketReads += 1;
    const info = { uid: 0, gid: isSocket ? 992 : 0, mode: isSocket ? 0o140660 : 0o40755,
      dev: 1, ino: isSocket && swappedAt && socketReads >= swappedAt ? 99 : 2,
      isSymbolicLink: () => false, isSocket: () => isSocket, isDirectory: () => !isSocket };
    unsafe?.(path, info); return info;
  };
  const connect = options => {
    calls.push(options); socket = new EventEmitter(); socket.destroyed = false;
    socket.destroy = () => { socket.destroyed = true; };
    socket.end = text => {
      calls.push(text);
      queueMicrotask(() => {
        if (mode === "reply") { socket.emit("data", Buffer.from(response)); socket.emit("end"); }
        else if (mode === "chunks") { for (const c of response) socket.emit("data", Buffer.from(c)); socket.emit("end"); }
        else if (mode === "close") socket.emit("close");
        else if (mode === "error") socket.emit("error", new Error("private detail"));
        else if (mode === "no-eof") socket.emit("data", Buffer.from(response));
      });
    };
    queueMicrotask(() => socket.emit("connect")); return socket;
  };
  return { options: { connect, lstat, getegid: () => 992, nowFn: () => new Date(NOW) }, calls, reads,
    get socket() { return socket; } };
}
test("fixed AF_UNIX destination sends exact one-frame status request and waits for response EOF", async () => {
  const f = fixture({ mode: "chunks" });
  assert.deepEqual(await requestBwhSupplyStatus({ action: "status" }, f.options), status);
  assert.deepEqual(f.calls, [{ path: BWH_SUPPLY_SOCKET_PATH, allowHalfOpen: true }, '{"version":1,"action":"status"}\n']);
  assert.equal(f.socket.destroyed, true); assert.ok(f.reads.includes("/"));
});
test("mutations send only action and exact revision without a proof, path or command", async () => {
  for (const action of ["pause", "enable"]) {
    const f = fixture(); await requestBwhSupplyStatus({ action, revision: "b".repeat(64) }, f.options);
    assert.equal(f.calls[1], `${JSON.stringify({ version: 1, action, revision: "b".repeat(64) })}\n`);
  }
  for (const input of [{ action: "status", revision: "a".repeat(64) }, { action: "initialize" },
    { action: "pause", revision: "b".repeat(64), proof: true }, { action: "enable", revision: "$(secret)" }]) {
    const f = fixture(); await assert.rejects(requestBwhSupplyStatus(input, f.options), /unavailable/); assert.equal(f.calls.length, 0);
  }
});
test("root ownership, exact socket group and mode, secure ancestors and socket type are mandatory", async () => {
  const cases = [
    (p, i) => { if (p === BWH_SUPPLY_SOCKET_PATH) i.uid = 999; },
    (p, i) => { if (p === BWH_SUPPLY_SOCKET_PATH) i.gid = 993; },
    (p, i) => { if (p === BWH_SUPPLY_SOCKET_PATH) i.mode = 0o140666; },
    (p, i) => { if (p === BWH_SUPPLY_SOCKET_PATH) i.isSocket = () => false; },
    (p, i) => { if (p === "/run") i.mode |= 0o020; },
    (p, i) => { if (p === "/run") i.uid = 999; },
    (p, i) => { if (p === "/run") i.isSymbolicLink = () => true; },
    (p, i) => { if (p === "/run") i.isDirectory = () => false; }
  ];
  for (const unsafe of cases) {
    const f = fixture({ unsafe }); await assert.rejects(requestBwhSupplyStatus({ action: "status" }, f.options)); assert.equal(f.calls.length, 0);
  }
});
test("socket identity replacement during connect or before reply EOF rejects without retry", async () => {
  for (const swappedAt of [2, 3]) {
    const f = fixture({ swappedAt }); await assert.rejects(requestBwhSupplyStatus({ action: "status" }, f.options));
    assert.equal(f.calls.filter(v => typeof v === "object").length, 1); assert.equal(f.socket.destroyed, true);
    if (swappedAt === 2) assert.equal(f.calls.length, 1);
  }
});
test("malformed, duplicate, trailing, multiple, empty or oversized replies never become a status", async () => {
  for (const response of ["", reply(status).trimEnd(), `${reply(status)}\n`, `${reply(status)}${reply(status)}`,
    reply(status).replace('"ok":true', '"ok":true,"ok":true'), '{"version":1,"ok":false}\n',
    `${JSON.stringify({ version: 1, ok: true, status, extra: true })}\n`, "x".repeat(16385), `\uFEFF${reply(status)}`,
    Buffer.concat([Buffer.from([0xff]), Buffer.from(reply(status))]), reply({ ...status, observedAt: "2026-10-19T11:58:00.000Z" })]) {
    const f = fixture({ response }); await assert.rejects(requestBwhSupplyStatus({ action: "status" }, f.options));
    assert.equal(f.calls.filter(v => typeof v === "object").length, 1);
  }
});
test("no response, transport close and errors fail safely and destroy the sole connection", async () => {
  for (const mode of ["none", "close", "error", "no-eof"]) {
    const f = fixture({ mode }); let deadline;
    const pending = requestBwhSupplyStatus({ action: "pause", revision: "b".repeat(64) },
      { ...f.options, setTimer(callback, ms) { assert.equal(ms, 120000); deadline = callback; return 1; }, clearTimer() {} });
    const rejected = assert.rejects(pending, error => error.message === "BWH supply host unavailable");
    await new Promise(resolve => setImmediate(resolve)); if (["none", "no-eof"].includes(mode)) deadline();
    await rejected;
    assert.equal(f.calls.filter(v => typeof v === "object").length, 1); assert.equal(f.socket.destroyed, true);
  }
});
test("status has a five-second deadline and never treats a valid frame without EOF as success", async () => {
  const f = fixture({ mode: "no-eof" }); let deadline, ms;
  const pending = requestBwhSupplyStatus({ action: "status" }, { ...f.options,
    setTimer(callback, duration) { deadline = callback; ms = duration; return 1; }, clearTimer() {} });
  const rejected = assert.rejects(pending);
  await new Promise(resolve => setImmediate(resolve)); assert.equal(ms, 5000); deadline(); await rejected;
});
test("CLI accepts exact fixed actions and bounded revision only, emitting DTO without the envelope", async () => {
  const f = fixture(), written = [];
  assert.equal(await runBwhSupplyClient({ argv: ["status"], input: "", requestOptions: f.options, write: text => written.push(text) }), 0);
  assert.deepEqual(written, [status]);
  for (const [argv, input] of [[["status"], "\n"], [["pause"], "b".repeat(66)], [["enable"], `${"b".repeat(64)}\n\n`],
    [["enable"], "B".repeat(64)], [["pause", "--path", "/other"], ""], [["initialize"], ""]]) {
    const g = fixture(); assert.equal(await runBwhSupplyClient({ argv, input, requestOptions: g.options, write() { assert.fail(); } }), 64);
    assert.equal(g.calls.length, 0);
  }
});
test("CLI reads revision through EOF and limits incoming stdin before socket contact", async () => {
  for (const input of [`${"b".repeat(64)}\n`, "b".repeat(66)]) {
    const f = fixture(), inputStream = new PassThrough(), written = [];
    const pending = runBwhSupplyClient({ argv: ["pause"], inputStream, requestOptions: f.options, write: text => written.push(text) });
    inputStream.end(input); const code = await pending;
    assert.equal(code, input.length === 65 ? 0 : 64); assert.equal(written.length, input.length === 65 ? 1 : 0);
    assert.equal(f.calls.length, input.length === 65 ? 2 : 0);
  }
});
test("CLI converts transport errors to an empty fixed failure rather than exposing private details", async () => {
  const f = fixture({ mode: "error" }), written = [];
  assert.equal(await runBwhSupplyClient({ argv: ["status"], input: "", requestOptions: f.options, write: text => written.push(text) }), 2);
  assert.deepEqual(written, []);
});
