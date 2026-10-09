import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import {
  generateClashProxyProvider,
  generateClashSubscription,
  generateMihomoRenderTemplate
} from "../services/clash-subscription.mjs";
import { createSubscriptionCore } from "../services/subscriptions/core.mjs";
import { createSubscriptionRepository } from "../services/subscriptions/repository.mjs";
import { hashSubscriptionToken } from "../services/subscriptions/tokens.mjs";

const TENANT_ID = "tenant_display_name_fixture";
const TOKEN = "pgsub_display_name_fixture_only";
const ARTIFACT = "display_name_artifact_fixture_only";
const NOW = "2026-10-09T00:00:00.000Z";

function fixtureConfig() {
  return {
    servers: ["jp", "sgp"].flatMap((region, regionIndex) => ["vless", "tuic", "hy2"].map((label, index) => ({
      id: `fixture_${region}_${label}`,
      name: `channel-fixture-${region}-${label}`,
      ...(region === "jp" ? { subscriptionDisplayName: `US-专线优化-${label}` } : {}),
      protocol: label === "hy2" ? "hysteria2" : label,
      credentialMode: "per-order",
      subscriptionBundleRef: "display-name-fixture-bundle",
      channelPool: "stable",
      status: "online",
      qualityClass: "stable",
      host: `192.0.2.${regionIndex + 1}`,
      port: 24000 + index,
      uuid: "00000000-0000-4000-8000-000000000001",
      password: "fixture-template-password",
      tls: true,
      sni: "fixture.example.invalid"
    }))),
    pingHosts: [],
    nginx: {}
  };
}

function materialFor(index) {
  return {
    uuid: `11111111-1111-4111-8111-${String(index + 1).padStart(12, "0")}`,
    password: `fixture-order-password-${index}`,
    credentialRef: `edgecred_fixture_${index}`
  };
}

for (const access of ["token", "artifact"]) {
  test(`display aliases preserve internal identity through per-order ${access} resolution and rendering`, () => {
    const database = new Database(":memory:");
    const store = createSubscriptionRepository({ database });
    try {
      const proxyConfig = fixtureConfig();
      const originalConfig = structuredClone(proxyConfig);
      const internalNames = proxyConfig.servers.map((server) => server.name);
      const materials = new Map(internalNames.map((name, index) => [name, materialFor(index)]));
      const resolverCalls = [];
      const gateCalls = [];
      const core = createSubscriptionCore({
        store,
        proxyConfig,
        publicSubscriptionBaseUrl: "https://fixture.example.invalid",
        nowFn: () => new Date(NOW),
        tokenFactory: () => ({
          rawToken: TOKEN,
          tokenHash: hashSubscriptionToken(TOKEN),
          tokenPrefix: TOKEN.slice(0, 14)
        }),
        idFactory: () => TENANT_ID,
        artifactSecretFactory: () => ARTIFACT,
        artifactIdFactory: () => "artifact_display_name_fixture",
        tenantCredentialMaterialResolver({ tenantId, nodeId }) {
          resolverCalls.push({ tenantId, nodeId });
          return materials.get(nodeId) || null;
        },
        subscriptionChannelGate({ tenantId, nodeId, channelRef, server }) {
          gateCalls.push({ tenantId, nodeId, channelRef, serverName: server.name, subscriptionDisplayName: server.subscriptionDisplayName });
          return true;
        }
      });

      core.createTenant({
        displayName: "Synthetic fixture account",
        nodeId: internalNames[0],
        expiresAt: "2026-11-09T00:00:00.000Z"
      });
      assert.equal(store.getTenant(TENANT_ID).nodeId, internalNames[0]);
      if (access === "artifact") core.createSubscriptionArtifact(TENANT_ID);
      const result = access === "artifact"
        ? core.resolveSubscriptionArtifact(ARTIFACT)
        : core.resolveSubscriptionToken(TOKEN);

      assert.equal(result.ok, true);
      assert.deepEqual(resolverCalls, internalNames.map((nodeId) => ({ tenantId: TENANT_ID, nodeId })));
      assert.deepEqual(gateCalls, proxyConfig.servers.map((server) => ({
        tenantId: TENANT_ID,
        nodeId: internalNames[0],
        channelRef: server.name,
        serverName: server.name,
        subscriptionDisplayName: server.subscriptionDisplayName
      })));
      assert.equal(store.getTenant(TENANT_ID).nodeId, internalNames[0]);
      assert.equal(result.tenant.nodeName, internalNames[0]);
      assert.deepEqual(core.listNodes().map((node) => node.name), internalNames);
      assert.deepEqual(result.proxyConfig.servers.map((server) => server.name), internalNames);
      assert.deepEqual(result.proxyConfig.servers.map((server) => server.id), proxyConfig.servers.map((server) => server.id));
      assert.deepEqual(result.proxyConfig.servers.map((server) => server.subscriptionDisplayName), proxyConfig.servers.map((server) => server.subscriptionDisplayName));

      for (const [index, server] of result.proxyConfig.servers.entries()) {
        const material = materialFor(index);
        const expected = { ...proxyConfig.servers[index] };
        if (server.protocol === "vless") expected.uuid = material.uuid;
        if (server.protocol === "tuic") Object.assign(expected, { uuid: material.uuid, password: material.password });
        if (server.protocol === "hysteria2") expected.password = `${material.credentialRef}:${material.password}`;
        assert.deepEqual(server, expected);
      }

      const withoutAliases = {
        ...result.proxyConfig,
        servers: result.proxyConfig.servers.map((server) => {
          const originalNameServer = { ...server };
          delete originalNameServer.subscriptionDisplayName;
          return originalNameServer;
        })
      };
      for (const render of [generateClashSubscription, generateMihomoRenderTemplate, generateClashProxyProvider]) {
        const rendered = render(result.proxyConfig);
        let normalized = rendered;
        for (const server of proxyConfig.servers) {
          if (server.subscriptionDisplayName) {
            assert.ok(rendered.includes(`name: ${JSON.stringify(server.subscriptionDisplayName)}`), `${render.name} must render the alias`);
            assert.equal(rendered.includes(JSON.stringify(server.name)), false, `${render.name} must not render the renamed internal key`);
            normalized = normalized.split(JSON.stringify(server.subscriptionDisplayName)).join(JSON.stringify(server.name));
          } else {
            assert.ok(rendered.includes(`name: ${JSON.stringify(server.name)}`), `${render.name} must retain SGP names`);
          }
        }
        assert.equal(normalized, render(withoutAliases), `${render.name} changes names and group references only`);
      }
      assert.deepEqual(proxyConfig, originalConfig);
    } finally {
      store.close();
      database.close();
    }
  });
}
