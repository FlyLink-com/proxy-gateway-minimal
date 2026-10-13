import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { createApp } from "../app.mjs";
import { createPortalTotpSecretProtector } from "../services/platform/portal-totp-verifier.mjs";
import {
  REQUIRED_THIRD_PARTY_SUBSCRIPTION_DDL_CHECKSUM,
  REQUIRED_THIRD_PARTY_SUBSCRIPTION_MIGRATION_ID,
  applyThirdPartySubscriptionMigrations
} from "../services/platform/third-party-subscription-migrations.mjs";
import { createSqliteThirdPartySubscriptionStore } from "../services/platform/third-party-subscription-store.mjs";
import { listen } from "./helpers/listen.mjs";

const ROOT = "/api/admin/third-party-subscriptions";
const MISSING_SOURCE = `tpsrc_${"0".repeat(32)}`;
const REVISION = "0".repeat(64);
const PRIVATE_MARKER = "synthetic-private-node-material";
const YAML = [
  "proxies:",
  "  - name: Japan sample",
  "    type: ss",
  "    server: 203.0.113.10",
  "    port: 8388",
  "    cipher: aes-256-gcm",
  `    password: ${PRIVATE_MARKER}`,
  "  - name: Singapore sample",
  "    type: ss",
  "    server: 203.0.113.11",
  "    port: 8388",
  "    cipher: aes-256-gcm",
  `    password: ${PRIVATE_MARKER}`
].join("\n");

async function fixture(t, { enabled = true, cidrs = ["127.0.0.1", "::1"], yamlContent = YAML } = {}) {
  const database = new Database(":memory:");
  applyThirdPartySubscriptionMigrations({
    database,
    expectedMigrationId: REQUIRED_THIRD_PARTY_SUBSCRIPTION_MIGRATION_ID,
    expectedDdlChecksum: REQUIRED_THIRD_PARTY_SUBSCRIPTION_DDL_CHECKSUM,
    nowFn: () => new Date("2026-10-13T00:00:00.000Z")
  });
  const network = { calls: 0 };
  const store = createSqliteThirdPartySubscriptionStore({
    database,
    secretProtector: createPortalTotpSecretProtector({ key: "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff" }),
    fetchFn: async () => { network.calls += 1; throw new Error(PRIVATE_MARKER); },
    resolveFn: async () => { network.calls += 1; throw new Error(PRIVATE_MARKER); },
    nowFn: () => new Date("2026-10-13T00:00:00.000Z")
  });
  const source = store.createInlineSource({ name: "synthetic-source", yamlContent, tiers: ["monthly_basic"] });
  const state = {
    rootDir: new URL("../../", import.meta.url).pathname,
    host: "127.0.0.1",
    ports: { console: 3456, socks: 1080, httpProxy: 18180 },
    consoleToken: "secret",
    proxyConfig: { servers: [], pingHosts: [], nginx: {} },
    services: {
      ssLocal: { status: () => ({ running: false }), start: async () => ({ ok: true }), stop: async () => ({ ok: true }) },
      httpProxy: { status: () => ({ running: false }), start: async () => ({ ok: true }), stop: async () => ({ ok: true }) }
    },
    isPortListening: async () => false,
    runCommand: async () => ({ ok: true, stdout: "", stderr: "", code: 0, timedOut: false }),
    thirdPartySubscriptions: { enabled, available: enabled && store.available, store },
    security: { adminAllowedCidrs: cidrs }
  };
  const { server, baseUrl } = await listen(createApp(state));
  t.after(() => { server.closeAllConnections(); server.close(); database.close(); });
  async function request(path, { method = "GET", body, token = "secret", raw = false, headers = {} } = {}) {
    const response = await fetch(`${baseUrl}${ROOT}${path}`, {
      method,
      headers: { "content-type": "application/json", ...(token === null ? {} : { authorization: `Bearer ${token}` }), ...headers },
      body: body === undefined ? undefined : raw ? body : JSON.stringify(body)
    });
    const text = await response.text();
    return { response, raw: text, body: response.headers.get("content-type")?.includes("application/json") ? JSON.parse(text) : text };
  }
  return { database, source, store, network, state, request, nodesPath: `/sources/${source.id}/nodes`, enablePath: `/sources/${source.id}/enable` };
}

function noStore(result) {
  assert.equal(result.response.headers.get("cache-control"), "no-store");
  assert.equal(result.raw.includes(PRIVATE_MARKER), false);
  assert.equal(result.raw.includes("203.0.113."), false);
}

function publicNodes(result) {
  assert.equal(result.response.status, 200);
  noStore(result);
  assert.deepEqual(Object.keys(result.body).sort(), ["enabled", "items", "revision", "sourceId"]);
  assert.match(result.body.revision, /^[0-9a-f]{64}$/);
  for (const node of result.body.items) {
    assert.deepEqual(Object.keys(node).sort(), ["countryCode", "customName", "defaultName", "displayName", "id", "originalName", "protocol"]);
    assert.match(node.id, /^tpnode_[0-9a-f]{32}$/);
  }
}

function saveBody(result) {
  return { revision: result.body.revision, nodes: result.body.items.map(({ id, customName }) => ({ id, customName })) };
}

test("node admin read/save/enable require real application auth and stay uncached", async (t) => {
  const f = await fixture(t);
  for (const token of [null, "wrong-token"]) {
    for (const [path, method, body] of [[f.nodesPath, "GET"], [f.nodesPath, "PUT", { revision: REVISION, nodes: [] }], [f.enablePath, "POST", { revision: REVISION }]]) {
      const result = await f.request(path, { method, body, token });
      assert.equal(result.response.status, 401);
      assert.deepEqual(result.body, { error: "Unauthorized" });
      noStore(result);
    }
  }
});

test("node admin routes honor the existing CIDR restriction", async (t) => {
  const f = await fixture(t, { cidrs: ["192.0.2.5/32"] });
  for (const [path, method, body] of [[f.nodesPath, "GET"], [f.nodesPath, "PUT", { revision: REVISION, nodes: [] }], [f.enablePath, "POST", { revision: REVISION }]]) {
    const result = await f.request(path, { method, body });
    assert.equal(result.response.status, 403);
    noStore(result);
  }
});

test("node list, save rename/delete and explicit enable expose only public fields", async (t) => {
  const f = await fixture(t);
  const listed = await f.request(f.nodesPath);
  publicNodes(listed);
  assert.equal(listed.body.sourceId, f.source.id);
  assert.equal(listed.body.enabled, false);
  assert.equal(listed.body.items.length, 2);
  const saved = await f.request(f.nodesPath, {
    method: "PUT", body: { revision: listed.body.revision, nodes: [{ id: listed.body.items[0].id, customName: "Friendly node" }] }
  });
  publicNodes(saved);
  assert.equal(saved.body.items.length, 1);
  assert.equal(saved.body.items[0].customName, "Friendly node");
  assert.notEqual(saved.body.revision, listed.body.revision);
  assert.equal(f.store.listActiveServersForPlan("monthly_basic").length, 0, "save is not publication");
  const enabled = await f.request(f.enablePath, { method: "POST", body: { revision: saved.body.revision } });
  publicNodes(enabled);
  assert.equal(enabled.body.enabled, true);
  assert.equal(f.store.listActiveServersForPlan("monthly_basic").length, 1);
  const alreadyEnabled = await f.request(f.nodesPath, { method: "PUT", body: saveBody(enabled) });
  assert.equal(alreadyEnabled.response.status, 409);
  assert.deepEqual(alreadyEnabled.body, { error: "source_enabled" });
  noStore(alreadyEnabled);
  assert.equal(f.network.calls, 0);
});

test("node save requires exact revision and node-list shapes before invoking the store", async (t) => {
  const f = await fixture(t);
  let writes = 0;
  f.state.thirdPartySubscriptions.store = {
    saveSourceNodes() { writes += 1; throw new Error(PRIVATE_MARKER); },
    enableSourceNodes() { writes += 1; throw new Error(PRIVATE_MARKER); }
  };
  const validNode = { id: `tpnode_${"1".repeat(32)}`, customName: null };
  const badSaves = [
    null, [], "bad", {}, { nodes: [] }, { revision: REVISION },
    { revision: null, nodes: [] }, { revision: 1, nodes: [] }, { revision: "A".repeat(64), nodes: [] },
    { revision: "0".repeat(63), nodes: [] }, { revision: REVISION, nodes: null },
    { revision: REVISION, nodes: {} }, { revision: REVISION, nodes: [null] },
    { revision: REVISION, nodes: [[]] }, { revision: REVISION, nodes: [{}] },
    { revision: REVISION, nodes: [{ id: validNode.id }] },
    { revision: REVISION, nodes: [{ ...validNode, id: "invalid" }] },
    { revision: REVISION, nodes: [{ ...validNode, customName: 3 }] },
    { revision: REVISION, nodes: [{ ...validNode, customName: {} }] },
    { revision: REVISION, nodes: [{ ...validNode, password: PRIVATE_MARKER }] },
    { revision: REVISION, nodes: [], sourceId: f.source.id },
    { revision: REVISION, nodes: Array.from({ length: 257 }, () => validNode) }
  ];
  for (const body of badSaves) {
    const result = await f.request(f.nodesPath, { method: "PUT", body });
    assert.equal(result.response.status, 400);
    assert.deepEqual(result.body, { error: "invalid_input" });
    noStore(result);
  }
  for (const body of [null, [], {}, { revision: null }, { revision: REVISION, enabled: true }, { revision: REVISION, nodes: [] }]) {
    const result = await f.request(f.enablePath, { method: "POST", body });
    assert.equal(result.response.status, 400);
    assert.deepEqual(result.body, { error: "invalid_input" });
    noStore(result);
  }
  assert.equal(writes, 0);
});

test("node admin rejects malformed JSON without reflecting private request data", async (t) => {
  const f = await fixture(t);
  for (const [path, method] of [[f.nodesPath, "PUT"], [f.enablePath, "POST"]]) {
    const result = await f.request(path, { method, raw: true, body: `{"revision":${PRIVATE_MARKER}}` });
    assert.equal(result.response.status, 400);
    assert.deepEqual(result.body, { error: "invalid_input" });
    noStore(result);
  }
});

test("node save accepts exactly 256 structurally valid items and rejects malformed source ids before dispatch", async (t) => {
  const f = await fixture(t);
  const nodes = Array.from({ length: 256 }, (_, index) => ({ id: `tpnode_${index.toString(16).padStart(32, "0")}`, customName: null }));
  const calls = [];
  f.state.thirdPartySubscriptions.store = {
    saveSourceNodes(id, body) {
      calls.push({ id, body });
      return { sourceId: id, revision: REVISION, enabled: false, items: [] };
    },
    listSourceNodes() { calls.push("read"); },
    enableSourceNodes() { calls.push("enable"); }
  };
  const result = await f.request(f.nodesPath, { method: "PUT", body: { revision: REVISION, nodes } });
  publicNodes(result);
  assert.deepEqual(calls, [{ id: f.source.id, body: { revision: REVISION, nodes } }]);
  for (const [suffix, method, body] of [["nodes", "GET"], ["nodes", "PUT", { revision: REVISION, nodes }], ["enable", "POST", { revision: REVISION }]]) {
    const rejected = await f.request(`/sources/tpsrc_invalid/${suffix}`, { method, body });
    assert.equal(rejected.response.status, 404);
    assert.deepEqual(rejected.body, { error: "not_found" });
    noStore(rejected);
  }
  assert.equal(calls.length, 1);
});

function maximumNodeYaml() {
  return `proxies:\n${Array.from({ length: 256 }, (_, index) => [
    `  - name: Japan sample ${index}`,
    "    type: ss",
    "    server: 203.0.113.10",
    `    port: ${10000 + index}`,
    "    cipher: aes-256-gcm",
    `    password: ${PRIVATE_MARKER}`
  ].join("\n")).join("\n")}`;
}

test("real node saves support 256 maximum-length Chinese names in UTF-8 and escaped JSON", async (t) => {
  const f = await fixture(t, { yamlContent: maximumNodeYaml() });
  let listed = await f.request(f.nodesPath);
  publicNodes(listed);
  assert.equal(listed.body.items.length, 256);
  for (const [path, character, escaped] of [[f.nodesPath, "中", false], [`/SoUrCeS/${f.source.id}/NoDeS/`, "文", true]]) {
    const nodes = listed.body.items.map(({ id }, index) => ({ id, customName: character.repeat(125) + String(index).padStart(3, "0") }));
    assert.equal(nodes.every(node => node.customName.length === 128), true);
    let raw = JSON.stringify({ revision: listed.body.revision, nodes });
    if (escaped) raw = raw.replace(/[\u0080-\uffff]/g, ch => `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`);
    assert.ok(Buffer.byteLength(raw) > 100 * 1024);
    assert.ok(Buffer.byteLength(raw) < 256 * 1024);
    const saved = await f.request(path, { method: "PUT", body: raw, raw: true });
    publicNodes(saved);
    assert.equal(saved.body.items.length, 256);
    assert.deepEqual(saved.body.items.map(node => node.customName).sort(), nodes.map(node => node.customName).sort());
    assert.equal(saved.body.enabled, false);
    listed = saved;
  }
  assert.equal(f.network.calls, 0);
});

test("node save parser has a fixed 256KiB ceiling without private body reflection", async (t) => {
  const f = await fixture(t);
  const before = f.store.listSourceNodes(f.source.id);
  const raw = JSON.stringify({ revision: before.revision, nodes: [], padding: `${PRIVATE_MARKER}${"x".repeat(256 * 1024)}` });
  for (const path of [f.nodesPath, `/SoUrCeS/${f.source.id}/NoDeS/`]) {
    const result = await f.request(path, { method: "PUT", body: raw, raw: true });
    assert.equal(result.response.status, 413);
    assert.deepEqual(result.body, { error: "input_too_large" });
    noStore(result);
  }
  assert.deepEqual(f.store.listSourceNodes(f.source.id), before);
});

test("node parser increase cannot be borrowed by adjacent paths, malformed ids or other methods", async (t) => {
  const f = await fixture(t);
  const before = f.store.listSourceNodes(f.source.id);
  const raw = JSON.stringify({ revision: before.revision, nodes: [], padding: `${PRIVATE_MARKER}${"x".repeat(110 * 1024)}` });
  assert.ok(Buffer.byteLength(raw) < 256 * 1024);
  const targets = [
    [f.nodesPath, "POST"], [f.nodesPath, "PATCH"],
    [`${f.nodesPath}/extra`, "PUT"], [`${f.nodesPath}-extra`, "PUT"], [`${f.nodesPath}//`, "PUT"],
    [`/sources/${f.source.id}/enable`, "PUT"], [`/sources/${f.source.id}/enable`, "POST"],
    ["/sources/tpsrc_invalid/nodes", "PUT"], ["/sources", "POST"], ["/sources/preview", "POST"]
  ];
  for (const [path, method] of targets) {
    const result = await f.request(path, { method, body: raw, raw: true });
    assert.equal(result.response.status, 413, `${method} ${path}`);
    assert.deepEqual(result.body, { error: "input_too_large" });
    noStore(result);
  }
  assert.deepEqual(f.store.listSourceNodes(f.source.id), before);
});

test("node mutations reject stale revisions and only one concurrent editor can save", async (t) => {
  const f = await fixture(t);
  const listed = await f.request(f.nodesPath);
  publicNodes(listed);
  const body = saveBody(listed);
  const results = await Promise.all(["Editor one", "Editor two"].map(customName => f.request(f.nodesPath, {
    method: "PUT", body: { ...body, nodes: body.nodes.map((node, index) => index === 0 ? { ...node, customName } : node) }
  })));
  assert.deepEqual(results.map(result => result.response.status).sort(), [200, 409]);
  for (const result of results) noStore(result);
  assert.deepEqual(results.find(result => result.response.status === 409).body, { error: "revision_conflict" });
  const staleEnable = await f.request(f.enablePath, { method: "POST", body: { revision: listed.body.revision } });
  assert.equal(staleEnable.response.status, 409);
  assert.deepEqual(staleEnable.body, { error: "revision_conflict" });
  noStore(staleEnable);
});

test("empty saved source cannot be enabled and unknown source ids stay fixed 404", async (t) => {
  const f = await fixture(t);
  for (const id of [MISSING_SOURCE, "not-a-source"]) {
    for (const [suffix, method, body] of [["nodes", "GET"], ["nodes", "PUT", { revision: REVISION, nodes: [] }], ["enable", "POST", { revision: REVISION }]]) {
      const result = await f.request(`/sources/${id}/${suffix}`, { method, body });
      assert.equal(result.response.status, 404);
      assert.deepEqual(result.body, { error: "not_found" });
      noStore(result);
    }
  }
  const listed = await f.request(f.nodesPath);
  const emptied = await f.request(f.nodesPath, { method: "PUT", body: { revision: listed.body.revision, nodes: [] } });
  publicNodes(emptied);
  assert.equal(emptied.body.items.length, 0);
  const enabled = await f.request(f.enablePath, { method: "POST", body: { revision: emptied.body.revision } });
  assert.equal(enabled.response.status, 400);
  assert.deepEqual(enabled.body, { error: "empty_source" });
  noStore(enabled);
});

test("node-route feature-off responses stay unavailable without contacting upstreams", async (t) => {
  const f = await fixture(t, { enabled: false });
  for (const [path, method, body] of [[f.nodesPath, "GET"], [f.nodesPath, "PUT", { revision: REVISION, nodes: [] }], [f.enablePath, "POST", { revision: REVISION }]]) {
    const result = await f.request(path, { method, body });
    assert.equal(result.response.status, 503);
    assert.deepEqual(result.body, { error: "third_party_unavailable" });
    noStore(result);
  }
  assert.equal(f.network.calls, 0);
});

test("node admin errors use fixed codes and remote import remains closed", async (t) => {
  const f = await fixture(t);
  const realStore = f.store;
  const logs = [];
  const originalConsole = { log: console.log, warn: console.warn, error: console.error };
  for (const name of Object.keys(originalConsole)) console[name] = (...args) => logs.push(args);
  t.after(() => { Object.assign(console, originalConsole); });
  for (const [code, status] of [["invalid_node_name", 400], ["duplicate_node_name", 400], ["revision_conflict", 409], ["source_enabled", 409], ["empty_source", 400], ["unsupported_source_kind", 400], ["third_party_unavailable", 503], [PRIVATE_MARKER, 503]]) {
    const fail = () => { throw Object.assign(new Error(PRIVATE_MARKER), { code }); };
    f.state.thirdPartySubscriptions.store = { listSourceNodes: fail, saveSourceNodes: fail, enableSourceNodes: fail };
    for (const [path, method, body] of [[f.nodesPath, "GET"], [f.nodesPath, "PUT", { revision: REVISION, nodes: [] }], [f.enablePath, "POST", { revision: REVISION }]]) {
      const result = await f.request(path, { method, body });
      assert.equal(result.response.status, status);
      assert.deepEqual(result.body, { error: code === PRIVATE_MARKER ? "third_party_unavailable" : code });
      noStore(result);
    }
  }
  f.state.thirdPartySubscriptions.store = realStore;
  const remote = await f.request("/sources", { method: "POST", body: { name: "synthetic-source", subscriptionUrl: "https://example.invalid/private", tiers: ["monthly_basic"] } });
  assert.equal(remote.response.status, 400);
  assert.deepEqual(remote.body, { error: "remote_import_disabled" });
  noStore(remote);
  assert.equal(f.network.calls, 0);
  assert.deepEqual(logs, [], "route errors must not log request bodies or private store errors");
});
