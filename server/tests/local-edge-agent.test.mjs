import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLocalClashSubscription,
  createLocalEdgeAgentApp,
  normalizeAgentConfig,
  redactedDiagnostics
} from "../../agent/local-edge-agent.mjs";
import { listen } from "./helpers/listen.mjs";

function sampleConfig(overrides = {}) {
  return {
    bindHost: "127.0.0.1",
    subscriptionPort: 19090,
    proxyPort: 19080,
    profileName: "GlobalCircle Local Edge",
    localNodeName: "Local Edge Adapter",
    activeEdge: {
      id: "prod-edge-a",
      host: "ss-sg.globalcirclecat.com",
      credential: "edge-secret"
    },
    ...overrides
  };
}

test("normalizeAgentConfig accepts loopback-only local listener config", () => {
  const config = normalizeAgentConfig(sampleConfig({ subscriptionPort: "19091", proxyPort: "19081" }));

  assert.equal(config.bindHost, "127.0.0.1");
  assert.equal(config.subscriptionPort, 19091);
  assert.equal(config.proxyPort, 19081);
  assert.equal(config.profileName, "GlobalCircle Local Edge");
  assert.equal(config.localNodeName, "Local Edge Adapter");
  assert.equal(config.activeEdge.id, "prod-edge-a");
});

test("normalizeAgentConfig rejects public listener hosts", () => {
  assert.throws(
    () => normalizeAgentConfig(sampleConfig({ bindHost: "0.0.0.0" })),
    /bindHost must be loopback-only/
  );
  assert.throws(
    () => normalizeAgentConfig(sampleConfig({ bindHost: "192.168.1.10" })),
    /bindHost must be loopback-only/
  );
});

test("buildLocalClashSubscription emits only loopback local proxy details", () => {
  const yaml = buildLocalClashSubscription(sampleConfig());

  assert.match(yaml, /mixed-port: 7897/);
  assert.match(yaml, /allow-lan: false/);
  assert.match(yaml, /name: "Local Edge Adapter"/);
  assert.match(yaml, /type: socks5/);
  assert.match(yaml, /server: "127\.0\.0\.1"/);
  assert.match(yaml, /port: 19080/);
  assert.match(yaml, /- "Local Edge Adapter"/);
  assert.doesNotMatch(yaml, /ss-sg\.globalcirclecat\.com|edge-secret|prod-edge-a/);
});

test("redactedDiagnostics removes credentials, tokens, URLs, and raw targets", () => {
  const summary = redactedDiagnostics({
    activeEdge: {
      id: "prod-edge-a",
      host: "ss-sg.globalcirclecat.com",
      credential: "edge-secret"
    },
    counters: {
      connectOk: 4,
      connectTimeout: 1
    },
    lastFailure: {
      class: "timeout",
      targetUrl: "https://example.test/path?secret=value",
      token: "tenant-token",
      artifactUrl: "https://sub.example.test/sub/a/local-artifact"
    }
  });

  const serialized = JSON.stringify(summary);
  assert.equal(summary.activeEdge.id, "prod-edge-a");
  assert.equal(summary.activeEdge.host, "[redacted]");
  assert.equal(summary.counters.connectOk, 4);
  assert.equal(summary.lastFailure.class, "timeout");
  assert.doesNotMatch(serialized, /edge-secret|tenant-token|local-artifact|secret=value|example\.test/);
});

test("createLocalEdgeAgentApp exposes health, local YAML, and redacted diagnostics", async () => {
  const app = createLocalEdgeAgentApp({
    config: sampleConfig(),
    diagnostics: {
      activeEdge: {
        id: "prod-edge-a",
        host: "ss-sg.globalcirclecat.com",
        credential: "edge-secret"
      },
      counters: { connectOk: 1, connectTimeout: 0 }
    }
  });
  const { server, baseUrl } = await listen(app);
  try {
    const health = await fetch(`${baseUrl}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), {
      ok: true,
      bindHost: "127.0.0.1",
      subscriptionPort: 19090,
      proxyPort: 19080,
      proxyImplemented: false
    });

    const subscription = await fetch(`${baseUrl}/clash.yaml`);
    assert.equal(subscription.status, 200);
    assert.match(subscription.headers.get("content-type"), /application\/x-yaml/);
    const yaml = await subscription.text();
    assert.match(yaml, /server: "127\.0\.0\.1"/);
    assert.doesNotMatch(yaml, /ss-sg\.globalcirclecat\.com|edge-secret/);

    const diagnostics = await fetch(`${baseUrl}/diagnostics`);
    assert.equal(diagnostics.status, 200);
    const body = await diagnostics.json();
    assert.equal(body.activeEdge.id, "prod-edge-a");
    assert.equal(body.activeEdge.host, "[redacted]");
    assert.doesNotMatch(JSON.stringify(body), /edge-secret|ss-sg\.globalcirclecat\.com/);
  } finally {
    server.close();
  }
});
