import assert from "node:assert/strict";
import test from "node:test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "../app.mjs";
import { listen } from "./helpers/listen.mjs";

function fakeState(overrides = {}) {
  return {
    rootDir: resolve(fileURLToPath(new URL("../../", import.meta.url))),
    host: "127.0.0.1",
    ports: { console: 3456, socks: 1080, httpProxy: 18180 },
    consoleToken: "secret",
    releaseIdentity: Object.freeze({ state: "unavailable" }),
    proxyConfig: { servers: [], pingHosts: [], nginx: { host: "127.0.0.1", ports: [] } },
    services: {
      ssLocal: {
        start: async () => ({ ok: true, msg: "ss-local starting...", pid: 111 }),
        stop: async () => ({ ok: true }),
        status: () => ({ running: true, starting: false, pid: 111 })
      },
      httpProxy: {
        start: async () => ({ ok: true, msg: "http-proxy starting..." }),
        stop: async () => ({ ok: true }),
        status: () => ({ running: true, starting: false, port: 18180, host: "127.0.0.1" })
      }
    },
    isPortListening: async (port) => port === 1080 || port === 18180,
    ...overrides
  };
}

test("static console loads without token while control routes stay protected", async () => {
  const { server, baseUrl } = await listen(createApp(fakeState()));
  try {
    const page = await fetch(`${baseUrl}/`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Proxy Gateway/);

    const control = await fetch(`${baseUrl}/api/status`);
    assert.equal(control.status, 401);
    assert.deepEqual(await control.json(), { error: "Unauthorized" });
  } finally {
    server.close();
  }
});

test("local proxy control compatibility routes keep existing paths", async () => {
  const { server, baseUrl } = await listen(createApp(fakeState()));
  try {
    const start = await fetch(`${baseUrl}/api/proxy/start`, {
      method: "POST",
      headers: { authorization: "Bearer secret" }
    });
    assert.equal(start.status, 200);
    assert.deepEqual(await start.json(), { socks5: true, http: true, ok: true });

    const overview = await fetch(`${baseUrl}/api/proxy/overview`, {
      headers: { authorization: "Bearer secret" }
    });
    assert.equal(overview.status, 200);
    const body = await overview.json();
    assert.equal(body.socks5.port, 1080);
    assert.equal(body.httpProxy.port, 18180);
    assert.equal(body.ssRunning, true);
  } finally {
    server.close();
  }
});

test("local proxy control routes can be disabled while diagnostics stay mounted", async () => {
  const { server, baseUrl } = await listen(createApp(fakeState({
    localProxyControl: { routesEnabled: false }
  })));
  try {
    const start = await fetch(`${baseUrl}/api/proxy/start`, {
      method: "POST",
      headers: { authorization: "Bearer secret" }
    });
    assert.equal(start.status, 404);

    const overview = await fetch(`${baseUrl}/api/proxy/overview`, {
      headers: { authorization: "Bearer secret" }
    });
    assert.equal(overview.status, 404);

    const diagnostics = await fetch(`${baseUrl}/api/proxy/status`, {
      headers: { authorization: "Bearer secret" }
    });
    assert.equal(diagnostics.status, 200);
    assert.deepEqual((await diagnostics.json()).results, []);
  } finally {
    server.close();
  }
});

test("/api/status returns aggregate state for new UI", async () => {
  const { server, baseUrl } = await listen(createApp(fakeState()));
  try {
    const query = await fetch(`${baseUrl}/api/status?token=secret`);
    assert.equal(query.status, 401);
    assert.deepEqual(await query.json(), { error: "Unauthorized" });

    const response = await fetch(`${baseUrl}/api/status`, {
      headers: { authorization: "Bearer secret" }
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.ports.socks5.ok, true);
    assert.equal(body.runtime.ssLocal.running, true);
    assert.equal(body.runtime.httpProxy.running, true);
    assert.deepEqual(body.releaseIdentity, { state: "unavailable" });
  } finally {
    server.close();
  }
});

test("release identity is exposed only by bearer-protected status", async () => {
  const releaseIdentity = Object.freeze({
    schemaVersion: "1",
    type: "control_plane_release_identity",
    state: "verified",
    releaseUnit: "control-plane-app",
    sourceCommit: "a".repeat(40),
    artifactRelease: "ci-20260830",
    artifactManifestSha256: "b".repeat(64),
    sourceArtifactSha256: "c".repeat(64),
    dependencyArtifactManifestSha256: "d".repeat(64),
    dependencyArchiveSha256: "e".repeat(64),
    identitySha256: "f".repeat(64)
  });
  const state = fakeState({ releaseIdentity });
  const app = createApp(state);
  state.releaseIdentity = Object.freeze({ state: "unavailable" });
  const { server, baseUrl } = await listen(app);
  try {
    const health = await fetch(`${baseUrl}/api/health`);
    assert.equal(health.status, 200);
    const healthBody = await health.json();
    assert.deepEqual(Object.keys(healthBody).sort(), ["authRequired", "ok", "ts"]);
    assert.equal(JSON.stringify(healthBody).includes(releaseIdentity.sourceCommit), false);
    assert.equal(JSON.stringify(healthBody).includes(releaseIdentity.identitySha256), false);

    const query = await fetch(`${baseUrl}/api/status?token=secret`);
    assert.equal(query.status, 401);

    const unauthorized = await fetch(`${baseUrl}/api/status`);
    assert.equal(unauthorized.status, 401);

    const status = await fetch(`${baseUrl}/api/status`, {
      headers: { authorization: "Bearer secret" }
    });
    assert.equal(status.status, 200);
    assert.deepEqual((await status.json()).releaseIdentity, releaseIdentity);
  } finally {
    server.close();
  }
});
