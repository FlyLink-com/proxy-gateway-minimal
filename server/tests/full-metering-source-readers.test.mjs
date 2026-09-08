import test from "node:test";
import assert from "node:assert/strict";
import {
  createFullMeteringHy2SnapshotReader,
  createFullMeteringTuicConnectionSnapshotReader
} from "../services/edge/full-metering-source-readers.mjs";

const NOW = "2026-09-08T06:00:00.000Z";
const PRIVATE = "synthetic-private-value";
const MAP = { "runtime-a": "credential-a", "runtime-b": "credential-b" };
const json = (value, options = {}) => new Response(JSON.stringify(value), {
  headers: { "Content-Type": "application/json" }, ...options
});
const hy2Payload = () => ({ "runtime-a": { tx: 12, rx: 34 }, "runtime-b": { tx: 0, rx: 0 } });
const connection = (overrides = {}) => ({ id: "connection-a", metadata: { inboundUser: "runtime-a" }, upload: 12, download: 34, ...overrides });
function fixture(kind = "hy2", options = {}) {
  const calls = [];
  const factory = kind === "hy2" ? createFullMeteringHy2SnapshotReader : createFullMeteringTuicConnectionSnapshotReader;
  const read = factory({
    url: `http://127.0.0.1:12345/${kind === "hy2" ? "traffic" : "connections"}`,
    secret: PRIVATE, credentialRefByRuntimeUser: MAP, nowFn: () => new Date(NOW),
    fetchFn: async (...args) => {
      calls.push(args);
      return json(kind === "hy2" ? hy2Payload() : { connections: [connection()] });
    }, ...options
  });
  return { read, calls };
}
function safeError(error, code) {
  assert.equal(error.name, "FullMeteringSourceError");
  assert.equal(error.message, error.code);
  assert.match(error.code, /^full_metering_source_[a-z_]+$/);
  if (code) assert.equal(error.code, code);
  assert.doesNotMatch(JSON.stringify(error) + error.stack, /synthetic-private-value|runtime-a|credential-a|127\.0\.0\.1:12345/);
  assert.equal(error.cause, undefined);
  return true;
}

test("Hy2 reads cumulative raw tx/rx once without clear and preserves true zero counters", async () => {
  const f = fixture();
  assert.deepEqual(await f.read(), { observedAt: NOW, observations: [
    { edgeCredentialRef: "credential-a", uploadBytes: 12, downloadBytes: 34 },
    { edgeCredentialRef: "credential-b", uploadBytes: 0, downloadBytes: 0 }
  ] });
  assert.equal(f.calls.length, 1);
  const [url, request] = f.calls[0];
  assert.equal(url, "http://127.0.0.1:12345/traffic");
  assert.equal(request.method, "GET");
  assert.equal(request.redirect, "error");
  assert.deepEqual(request.headers, { Accept: "application/json", Authorization: PRIVATE });
  assert.equal(request.body, undefined);
  assert.ok(request.signal instanceof AbortSignal);
});

test("TUIC returns individual native connections, no state or credential aggregation", async () => {
  const payload = { observedAt: PRIVATE, connections: [connection(), connection({ id: "connection-b", upload: 5 })] };
  let request;
  const f = fixture("tuic", { fetchFn: async (url, options) => { request = { url, options }; return json(payload); } });
  assert.deepEqual(await f.read(), { observedAt: NOW, connections: [
    { connectionId: "connection-a", edgeCredentialRef: "credential-a", uploadBytes: 12, downloadBytes: 34 },
    { connectionId: "connection-b", edgeCredentialRef: "credential-a", uploadBytes: 5, downloadBytes: 34 }
  ] });
  assert.equal(request.url, "http://127.0.0.1:12345/connections");
  assert.equal(request.options.method, "GET");
  assert.equal(request.options.redirect, "error");
  assert.deepEqual(request.options.headers, { Accept: "application/json", Authorization: `Bearer ${PRIVATE}` });
});

for (const url of ["http://localhost:12345/traffic", "http://127.1:12345/traffic", "http://2130706433:12345/traffic", "https://127.0.0.1:12345/traffic", "http://example.com/traffic", "http://127.0.0.1:12345/traffic?clear=0", "http://127.0.0.1:12345/traffic?clear=1", "http://127.0.0.1:12345/traffic#x", "http://user:pass@127.0.0.1:12345/traffic", "http://127.0.0.1:12345/x/../traffic", "http://127.0.0.1:12345/connections", "http://127.0.0.1:65536/traffic"]) {
  test(`rejects unsafe endpoint shape ${url.replace(/user:pass/, "userinfo")}`, () => {
    assert.throws(() => fixture("hy2", { url }), (error) => safeError(error, "full_metering_source_config_invalid"));
  });
}

test("literal IPv6 loopback and empty secret are supported without Authorization", async () => {
  let request;
  const f = fixture("hy2", { url: "http://[::1]:12345/traffic", secret: "", fetchFn: async (url, options) => { request = { url, options }; return json({}); } });
  assert.deepEqual(await f.read(), { observedAt: NOW, observations: [] });
  assert.deepEqual(request.options.headers, { Accept: "application/json" });
});

for (const options of [{ timeoutMs: 0 }, { timeoutMs: 60001 }, { maxResponseBytes: 0 }, { maxResponseBytes: 64 * 1024 * 1024 }, { secret: "bad\nsecret" }, { credentialRefByRuntimeUser: undefined }, { credentialRefByRuntimeUser: { "runtime-a": "bad ref" } }, { credentialRefByRuntimeUser: { "bad\nuser": "credential-a" } }]) {
  test(`rejects invalid bounded reader configuration ${Object.keys(options)[0]}`, () => {
    assert.throws(() => fixture("hy2", options), (error) => safeError(error, "full_metering_source_config_invalid"));
  });
}

for (const invalid of [null, [], { traffic: hy2Payload() }, { "runtime-a": { tx: 1 } }, { "runtime-a": { rx: 1 } }, { [PRIVATE]: { tx: 1, rx: 2 } }]) {
  test("Hy2 rejects malformed, wrapped, unknown or partial snapshots as a whole", async () => {
    await assert.rejects(fixture("hy2", { fetchFn: async () => json(invalid) }).read, safeError);
  });
}
for (const invalid of ["12", null, -1, 0.25, Number.MAX_SAFE_INTEGER + 1]) {
  test(`rejects invalid integer ${JSON.stringify(invalid)} in either protocol`, async () => {
    await assert.rejects(fixture("hy2", { fetchFn: async () => json({ "runtime-a": { tx: invalid, rx: 0 } }) }).read, safeError);
    await assert.rejects(fixture("tuic", { fetchFn: async () => json({ connections: [connection({ download: invalid })] }) }).read, safeError);
  });
}
test("byte sums outside safe integer range are rejected", async () => {
  await assert.rejects(fixture("hy2", { fetchFn: async () => json({ "runtime-a": { tx: Number.MAX_SAFE_INTEGER, rx: 1 } }) }).read, safeError);
});
test("map is copied at construction and duplicate observed credential bindings are rejected", async () => {
  const map = new Map(Object.entries(MAP));
  const f = fixture("hy2", { credentialRefByRuntimeUser: map });
  map.set("runtime-a", PRIVATE);
  assert.equal((await f.read()).observations[0].edgeCredentialRef, "credential-a");
  await assert.rejects(fixture("hy2", { credentialRefByRuntimeUser: { "runtime-a": "credential-a", "runtime-b": "credential-a" } }).read, safeError);
});

for (const bad of [null, {}, { connections: {} }, { connections: [null] }, { connections: [connection({ id: undefined })] }, { connections: [connection({ id: PRIVATE + " bad" })] }, { connections: [connection({ upload: undefined })] }, { connections: [connection({ metadata: {} })] }, { connections: [connection({ metadata: { inboundUser: PRIVATE } })] }, { connections: [connection({ metadata: {}, edgeCredentialRef: "credential-a" })] }, { connections: [connection(), connection()] }, { connections: [connection({ inboundUser: "runtime-b" })] }]) {
  test("TUIC rejects invalid/missing identity, counters, id or duplicate connection without partial output", async () => {
    await assert.rejects(fixture("tuic", { fetchFn: async () => json(bad) }).read, safeError);
  });
}
test("TUIC accepts empty connection array and consistent runtime identity aliases", async () => {
  assert.deepEqual(await fixture("tuic", { fetchFn: async () => json({ connections: [] }) }).read(), { observedAt: NOW, connections: [] });
  const f = fixture("tuic", { fetchFn: async () => json({ connections: [connection({ inboundUser: "runtime-a" })] }) });
  assert.equal((await f.read()).connections.length, 1);
});

for (const status of [301, 401, 403, 500]) {
  test(`HTTP ${status} returns safe fixed error without reading error body`, async () => {
    let read = false;
    const response = { status, ok: false, body: { getReader() { read = true; throw new Error(PRIVATE); } } };
    await assert.rejects(fixture("hy2", { fetchFn: async () => response }).read, safeError);
    assert.equal(read, false);
  });
}
test("network, body, JSON and clock errors never leak original details", async () => {
  for (const options of [
    { fetchFn: async () => { throw new Error(PRIVATE); } },
    { fetchFn: async () => new Response(PRIVATE, { headers: { "Content-Type": "application/json" } }) },
    { fetchFn: async () => new Response(new ReadableStream({ start(controller) { controller.error(new Error(PRIVATE)); } }), { headers: { "Content-Type": "application/json" } }) },
    { nowFn: () => { throw new Error(PRIVATE); } }
  ]) await assert.rejects(fixture("hy2", options).read, safeError);
});
test("limits body bytes both from Content-Length and actual streamed UTF-8 bytes", async () => {
  for (const response of [json(hy2Payload(), { headers: { "Content-Length": "9999", "Content-Type": "application/json" } }), json(hy2Payload())]) {
    await assert.rejects(fixture("hy2", { maxResponseBytes: 16, fetchFn: async () => response }).read, (error) => safeError(error, "full_metering_source_response_too_large"));
  }
});
test("rejects redirects even if an injected fetch followed one and rejects non-JSON media", async () => {
  for (const response of [{ status: 200, ok: true, redirected: true }, new Response("{}", { headers: { "Content-Type": "text/plain" } })]) {
    await assert.rejects(fixture("hy2", { fetchFn: async () => response }).read, safeError);
  }
});
test("duplicate JSON keys cannot hide malformed or unknown observations", async () => {
  for (const source of [
    '{"runtime-a":{"tx":"bad","tx":1,"rx":2}}',
    '{"runtime-a":{"tx":1,"rx":2},"runtime-\\u0061":{"tx":3,"rx":4}}'
  ]) await assert.rejects(fixture("hy2", { fetchFn: async () => new Response(source, { headers: { "Content-Type": "application/json" } }) }).read, safeError);
});
test("elapsed deadline is enforced even when synchronous normalization delays the timer", async () => {
  const nowFn = () => {
    const deadline = performance.now() + 20;
    while (performance.now() < deadline) { /* deterministic event-loop stall */ }
    return new Date(NOW);
  };
  await assert.rejects(fixture("hy2", { timeoutMs: 5, nowFn }).read, (error) => safeError(error, "full_metering_source_timeout"));
});
test("one deadline covers stalled fetch and stalled response body without retry", async () => {
  for (const bodyStall of [false, true]) {
    let calls = 0;
    let signal;
    const fetchFn = async (_url, options) => {
      calls += 1;
      signal = options.signal;
      if (!bodyStall) return new Promise(() => {});
      return new Response(new ReadableStream({ start() {} }), { headers: { "Content-Type": "application/json" } });
    };
    await assert.rejects(fixture("hy2", { timeoutMs: 20, fetchFn }).read, (error) => safeError(error, "full_metering_source_timeout"));
    assert.equal(signal.aborted, true);
    assert.equal(calls, 1);
  }
});
