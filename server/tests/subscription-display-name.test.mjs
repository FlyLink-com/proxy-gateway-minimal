import assert from "node:assert/strict";
import test from "node:test";
import {
  generateClashSubscription,
  generateMihomoRenderTemplate,
  generateClashProxyProvider,
  subscriptionSummary
} from "../services/clash-subscription.mjs";
import { validateProxyConfig } from "../services/config.mjs";

function fixture() {
  return { servers: [
    { name: "channel-vultr-a-vless-reality-tcp", protocol: "vless",
      host: "203.0.113.10", port: 8443, uuid: "synthetic-vless",
      tls: true, serverName: "front.example.test", qualityClass: "stable" },
    { name: "channel-vultr-a-tuic", protocol: "tuic",
      host: "203.0.113.10", port: 443, uuid: "synthetic-tuic",
      password: "synthetic-tuic-password", sni: "node.example.test", qualityClass: "weak-network" },
    { name: "channel-vultr-a-hy2", protocol: "hy2",
      host: "203.0.113.10", port: 10443, password: "synthetic-hy2-password",
      sni: "node.example.test", autoEligible: false },
    { name: "channel-sgp-a-hy2", protocol: "hy2",
      host: "sgp.example.test", port: 10443, password: "synthetic-sgp-password" }
  ] };
}
const aliases = ["US-专线优化-vless", "US-专线优化-tuic", "US-专线优化-hy2"];
function withAliases() {
  const config = fixture();
  for (let i = 0; i < aliases.length; i++) config.servers[i].subscriptionDisplayName = aliases[i];
  return config;
}
const renderers = [generateClashSubscription, generateMihomoRenderTemplate, generateClashProxyProvider];

for (const render of renderers) {
  test(`${render.name}: aliases update every node/group reference and nothing else`, () => {
    const config = withAliases();
    const before = structuredClone(config);
    const rendered = render(config);
    for (let i = 0; i < aliases.length; i++) {
      assert.ok(rendered.includes(JSON.stringify(aliases[i])));
      assert.ok(!rendered.includes(JSON.stringify(config.servers[i].name)));
    }
    assert.ok(rendered.includes('"channel-sgp-a-hy2"'));
    // Replacing only serialized alias tokens yields the byte-exact original.
    const restored = aliases.reduce((output, alias, i) =>
      output.replaceAll(JSON.stringify(alias), JSON.stringify(config.servers[i].name)), rendered);
    assert.equal(restored, render(fixture()));
    assert.deepEqual(config, before, "internal name, credential, endpoint and metadata are immutable");
  });
}

test("summary exposes aliases while internal channel names remain unchanged", () => {
  const config = withAliases();
  assert.deepEqual(subscriptionSummary({ proxyConfig: config }).servers.map(s => s.name),
    [...aliases, "channel-sgp-a-hy2"]);
  assert.deepEqual(config.servers.map(s => s.name), fixture().servers.map(s => s.name));
});

test("no alias or blank alias preserves legacy rendering and fallback", () => {
  const config = fixture();
  config.servers[0].subscriptionDisplayName = "  ";
  config.servers[1].subscriptionDisplayName = null;
  for (const render of renderers) assert.equal(render(config), render(fixture()));
  const unnamed = { servers: [{ ...fixture().servers[0], name: "", subscriptionDisplayName: "" }] };
  assert.match(generateClashSubscription(unnamed), /name: "proxy-1"/);
});

test("existing displayName metadata never opts legacy nodes into subscription aliases", () => {
  const config = fixture();
  config.servers[0].displayName = "Existing operator metadata";
  config.servers[1].displayName = "Vultr Tokyo TUIC canary";
  for (const render of renderers) assert.equal(render(config), render(fixture()));
});

test("aliases are trimmed and safely YAML quoted", () => {
  const config = fixture();
  config.servers[0].subscriptionDisplayName = '  US: "专线" #1  ';
  const yaml = generateClashSubscription(config);
  assert.ok(yaml.includes(JSON.stringify('US: "专线" #1')));
});

test("invalid aliases fail safely at config loading and direct rendering", () => {
  for (const value of [true, 42, {}, [], "x".repeat(129), "line\nbreak", "\u0000x", "x\u202ey"]) {
    const config = fixture();
    config.servers[0].subscriptionDisplayName = value;
    for (const run of [validateProxyConfig, ...renderers]) {
      assert.throws(() => run(config), { message: "proxy subscriptionDisplayName is invalid" });
    }
  }
});

test("duplicate aliases and aliases colliding with internal names are rejected", () => {
  for (const collision of [aliases[0], "channel-sgp-a-hy2"]) {
    const config = withAliases();
    config.servers[1].subscriptionDisplayName = collision;
    for (const run of [validateProxyConfig, ...renderers]) {
      assert.throws(() => run(config), { message: "proxy display names must be unique" });
    }
  }
});

test("aliases cannot shadow built-in proxies or generated groups", () => {
  for (const name of ["DIRECT", "REJECT", "GLOBAL", "AUTO", "WEAK-NETWORK", "STABLE", "FALLBACK"]) {
    const config = fixture();
    config.servers[0].subscriptionDisplayName = name;
    for (const run of [validateProxyConfig, ...renderers]) {
      assert.throws(() => run(config), { message: "proxy display name is reserved" });
    }
  }
});
