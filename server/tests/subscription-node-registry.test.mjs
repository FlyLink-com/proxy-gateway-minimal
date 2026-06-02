import assert from "node:assert/strict";
import test from "node:test";
import { createNodeRegistry } from "../services/subscriptions/node-registry.mjs";

function proxyConfig() {
  return {
    servers: [
      {
        id: "node_stable_a",
        name: "stable-a",
        role: "primary",
        region: "Singapore",
        host: "203.0.113.10",
        port: 18388,
        method: "aes-256-gcm",
        password: "stable-a-secret",
        strategyPriority: 20
      },
      {
        id: "node_stable_b",
        name: "stable-b",
        role: "secondary",
        region: "Tokyo",
        host: "203.0.113.11",
        port: 18389,
        method: "aes-256-gcm",
        password: "stable-b-secret",
        strategyPriority: 10
      },
      {
        id: "node_canary",
        name: "tuic-canary",
        role: "canary",
        region: "Tokyo",
        host: "203.0.113.12",
        port: 443,
        method: "tuic",
        password: "canary-secret"
      },
      {
        id: "node_maintenance",
        name: "maintenance-node",
        role: "canary",
        region: "Tokyo",
        host: "203.0.113.13",
        port: 443,
        method: "tuic",
        password: "maintenance-secret",
        maintenance: true,
        maintenanceReason: "provider patch window"
      },
      {
        id: "node_disabled",
        name: "legacy-blue",
        role: "legacy",
        region: "Singapore",
        host: "203.0.113.14",
        port: 18390,
        method: "aes-256-gcm",
        password: "disabled-secret",
        disabled: true,
        disabledReason: "retired"
      }
    ]
  };
}

test("node registry exposes safe summaries without runtime endpoints or credentials", () => {
  const registry = createNodeRegistry({ proxyConfig: proxyConfig() });

  const nodes = registry.listSafeNodes();

  assert.deepEqual(nodes[0], {
    id: "node_stable_a",
    name: "stable-a",
    role: "primary",
    region: "Singapore",
    channelPool: "stable",
    strategyPriority: 20,
    canaryWeight: 0,
    credentialMode: "shared-node",
    status: "online",
    maintenance: false,
    subscriptionEligible: true,
    reason: ""
  });
  assert.doesNotMatch(JSON.stringify(nodes), /203\.0\.113|18388|aes-256-gcm|secret/);
});

test("node registry keeps renderable material separate from safe summaries", () => {
  const registry = createNodeRegistry({ proxyConfig: proxyConfig() });

  const nodes = registry.listRenderableNodes();

  assert.equal(nodes[0].host, "203.0.113.10");
  assert.equal(nodes[0].port, 18388);
  assert.equal(nodes[0].method, "aes-256-gcm");
  assert.doesNotMatch(JSON.stringify(nodes), /stable-a-secret|canary-secret|maintenance-secret/);
});

test("node registry preserves default stable-pool and explicit canary assignment behavior", () => {
  const registry = createNodeRegistry({ proxyConfig: proxyConfig() });

  assert.deepEqual(registry.defaultSubscriptionServers().map((server) => server.name), [
    "stable-b",
    "stable-a"
  ]);
  assert.deepEqual(registry.cloneProxyConfigForSubscriptionOutput("stable-b").servers.map((server) => server.name), [
    "stable-b",
    "stable-a"
  ]);
  assert.deepEqual(registry.cloneProxyConfigForSubscriptionOutput("node_canary").servers.map((server) => server.name), [
    "tuic-canary"
  ]);
});

test("node registry fails closed for maintenance and disabled assignment targets", () => {
  const registry = createNodeRegistry({ proxyConfig: proxyConfig() });

  assert.equal(registry.resolveAssignableNode("maintenance-node"), null);
  assert.equal(registry.resolveAssignableNode("legacy-blue"), null);
  assert.deepEqual(registry.cloneProxyConfigForSubscriptionOutput("maintenance-node").servers, []);
  assert.deepEqual(registry.cloneProxyConfigForSubscriptionOutput("legacy-blue").servers, []);
});
