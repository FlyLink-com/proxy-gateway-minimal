import assert from "node:assert/strict";
import test from "node:test";
import { parse } from "yaml";
import {
  generateClashSubscription,
  generateMihomoRenderTemplate
} from "../services/clash-subscription.mjs";

const RENDERERS = [
  ["Clash", generateClashSubscription],
  ["Mihomo", generateMihomoRenderTemplate]
];
const BUILTIN_TARGETS = new Set(["DIRECT", "REJECT", "REJECT-DROP", "PASS", "COMPATIBLE"]);
const THIRD_PARTY_NAME = "[3P] HK 1";

function owned(name = "synthetic-owned", overrides = {}) {
  return { name, protocol: "ss", host: "192.0.2.10", port: 8388,
    method: "aes-256-gcm", password: "synthetic-only", qualityClass: "stable", ...overrides };
}

function thirdParty() {
  // Deliberately claim own-group metadata: thirdParty must still isolate it.
  return owned(THIRD_PARTY_NAME, { host: "203.0.113.10", thirdParty: true,
    countryCode: "HK", autoEligible: true, qualityClass: "stable" });
}

function renderStable(render, config) {
  const input = structuredClone(config);
  const yaml = render(config);
  assert.equal(render(config), yaml, "identical input must render identically");
  assert.deepEqual(config, input, "rendering must not mutate input names or flags");
  return parse(yaml);
}

function assertGroupIntegrity(document) {
  const proxies = document.proxies || [];
  const groups = document["proxy-groups"] || [];
  const names = [...proxies, ...groups].map(item => item.name);
  assert.equal(new Set(names).size, names.length, "proxy and group names share one unique namespace");
  const available = new Set([...names, ...BUILTIN_TARGETS]);
  for (const group of groups) {
    assert.ok(Array.isArray(group.proxies), `group ${group.name} must have explicit members`);
    for (const target of group.proxies) {
      assert.ok(available.has(target), `group ${group.name} references missing target ${target}`);
      assert.notEqual(target, group.name, `group ${group.name} must not reference itself`);
    }
  }
}

function assertThirdPartyIsolation(document, ownNames) {
  const proxies = document.proxies.map(proxy => proxy.name);
  for (const name of ownNames) assert.ok(proxies.includes(name), "owned proxy names must not be renamed");
  assert.ok(proxies.includes(THIRD_PARTY_NAME));
  const groups = document["proxy-groups"];
  for (const name of ["AUTO", "STABLE", "WEAK-NETWORK", "FALLBACK"]) {
    const group = groups.find(item => item.name === name);
    if (group) {
      assert.equal(group.proxies.includes(THIRD_PARTY_NAME), false, `third-party node must stay out of ${name}`);
      assert.ok(group.proxies.every(target => ownNames.includes(target)));
    }
  }
  const countryGroups = groups.filter(group => group.type === "url-test" && group.proxies.includes(THIRD_PARTY_NAME));
  assert.equal(countryGroups.length, 1, "third-party node keeps its country-specific test group");
  assert.equal(ownNames.includes(countryGroups[0].name), false);
  assert.ok(groups.find(group => group.name === "GLOBAL").proxies.includes(countryGroups[0].name));
}

for (const [label, render] of RENDERERS) {
  test(`${label} third-party country group avoids an owned 3P-HK proxy name`, () => {
    const ownNames = ["3P-HK", "3P-HK~2", "3P-HK-2"];
    const document = renderStable(render, { servers: [
      owned(ownNames[0]), owned(ownNames[1], { host: "192.0.2.11" }),
      owned(ownNames[2], { host: "192.0.2.12" }), thirdParty()
    ] });
    assertGroupIntegrity(document);
    assertThirdPartyIsolation(document, ownNames);
  });

  test(`${label} mixed output has no dangling AUTO when every owned proxy is auto-ineligible`, () => {
    const document = renderStable(render, { servers: [owned("synthetic-owned", { autoEligible: false }), thirdParty()] });
    assertGroupIntegrity(document);
    assertThirdPartyIsolation(document, ["synthetic-owned"]);
    assert.equal(document["proxy-groups"].some(group => group.name === "AUTO"), false);
    assert.equal(document["proxy-groups"].find(group => group.name === "GLOBAL").proxies.includes("AUTO"), false);
  });
}

// Frozen non-third-party output from the existing renderer contract. The mixed
// profile fixes must not rename existing own proxies or change the own profile.
const OWNED_BODY = `proxies:
  - name: "synthetic-owned"
    type: ss
    server: "192.0.2.10"
    port: 8388
    cipher: "aes-256-gcm"
    password: "synthetic-only"
proxy-groups:
  - name: AUTO
    type: url-test
    url: "https://www.gstatic.com/generate_204"
    interval: 300
    proxies:
      - "synthetic-owned"
  - name: STABLE
    type: fallback
    url: "https://www.gstatic.com/generate_204"
    interval: 300
    proxies:
      - "synthetic-owned"
  - name: FALLBACK
    type: fallback
    url: "https://www.gstatic.com/generate_204"
    interval: 300
    proxies:
      - "synthetic-owned"
  - name: GLOBAL
    type: select
    proxies:
      - AUTO
      - STABLE
      - FALLBACK
      - "synthetic-owned"
rules:
  - MATCH,GLOBAL
`;
const HEADERS = {
  Clash: "mixed-port: 7897\nallow-lan: false\nmode: global\n",
  Mihomo: "mixed-port: 7897\nallow-lan: false\nmode: rule\nlog-level: warning\nunified-delay: true\ntcp-concurrent: true\nglobal-client-fingerprint: chrome\nprofile:\n  store-selected: true\n"
};

for (const [label, render] of RENDERERS) {
  test(`${label} non-third-party output remains byte-for-byte unchanged`, () => {
    const config = { servers: [owned()] };
    assert.equal(render(config), HEADERS[label] + OWNED_BODY);
    const document = renderStable(render, config);
    assertGroupIntegrity(document);
    assert.deepEqual(document.proxies.map(proxy => proxy.name), ["synthetic-owned"]);
    assert.equal(document["proxy-groups"].some(group => group.name.startsWith("3P-")), false);
  });
}
