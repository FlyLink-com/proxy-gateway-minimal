import assert from "node:assert/strict";
import test from "node:test";

import { fingerprintNode } from "../services/platform/third-party-subscription-fetch.mjs";
import {
  THIRD_PARTY_YAML_MAX_BYTES,
  THIRD_PARTY_YAML_MAX_DEPTH,
  THIRD_PARTY_YAML_MAX_NODES,
  THIRD_PARTY_YAML_MAX_PROXIES,
  parseThirdPartyYaml
} from "../services/platform/third-party-subscription-yaml.mjs";

// Synthetic fixtures only: example.invalid, 203.0.113.0/24, and 2001:db8::/32.
const PUBLIC_KEY = "A".repeat(43);
const PIN = "0123456789abcdef".repeat(4);
const MESSAGES = Object.freeze({
  yaml_invalid_input: "Invalid YAML input",
  yaml_oversize: "YAML input exceeds the UTF-8 byte limit",
  yaml_syntax: "Invalid YAML syntax",
  yaml_unsupported_construct: "Unsupported YAML construct",
  yaml_multiple_documents: "YAML input contains multiple documents",
  yaml_limit: "YAML document exceeds safety limits",
  yaml_structure: "YAML root must be a map containing proxies",
  yaml_empty: "YAML proxies sequence is empty",
  yaml_remote_rejected: "Remote YAML providers are not allowed",
  yaml_proxy_invalid: "Invalid proxy item",
  yaml_conflict: "Conflicting proxy configuration"
});

function assertRedacted(error, secret) {
  const own = {};
  for (const key of Object.getOwnPropertyNames(error)) {
    if (key === "stack") continue;
    own[key] = error[key];
  }
  assert.equal(JSON.stringify(own).includes(secret), false);
}

function expectCode(raw, code, secret) {
  assert.throws(() => parseThirdPartyYaml(raw), (error) => {
    assert.equal(error.code, code);
    assert.equal(error.message, MESSAGES[code]);
    if (secret) assertRedacted(error, secret);
    return true;
  });
}

function expectItem(raw, code, itemIndex, secret) {
  assert.throws(() => parseThirdPartyYaml(raw), (error) => {
    assert.equal(error.code, code);
    assert.equal(error.message, MESSAGES[code]);
    assert.equal(error.itemIndex, itemIndex);
    if (secret) assertRedacted(error, secret);
    return true;
  });
}

function withDedup(node) {
  return { ...node, dedupKey: fingerprintNode(node) };
}

function assertSuccess(parsed, valid) {
  assert.equal(parsed.encoding, "yaml");
  assert.deepEqual(parsed.counts, {
    valid,
    unsupported: 0,
    malformed: 0,
    skippedBlank: 0
  });
  assert.equal(parsed.nodes.length, valid);
}

function yamlLines(lines) {
  return lines.join("\n");
}

test("exports approved yaml safety limits", () => {
  assert.equal(THIRD_PARTY_YAML_MAX_BYTES, 65536);
  assert.equal(THIRD_PARTY_YAML_MAX_PROXIES, 256);
  assert.equal(THIRD_PARTY_YAML_MAX_DEPTH, 8);
  assert.equal(THIRD_PARTY_YAML_MAX_NODES, 4096);
});

test("parses minimal ss vless hysteria2 and tuic nodes", () => {
  const parsed = parseThirdPartyYaml(yamlLines([
    "proxies:",
    "  - name: HK ss",
    "    type: ss",
    "    server: 203.0.113.10",
    "    port: 8388",
    "    cipher: aes-256-gcm",
    "    password: synthetic-password",
    "  - name: 日本",
    "    type: vless",
    "    server: 203.0.113.11",
    "    port: 443",
    "    uuid: 11111111-1111-4111-8111-111111111111",
    "    udp: true",
    "    tls: true",
    "    servername: www.example.invalid",
    "    network: tcp",
    "    flow: xtls-rprx-vision",
    "    packet-encoding: xudp",
    "    client-fingerprint: chrome",
    "    reality-opts:",
    `      public-key: ${PUBLIC_KEY}`,
    "      short-id: abcd",
    "    skip-cert-verify: false",
    "  - name: 新加坡",
    "    type: hysteria2",
    "    server: 203.0.113.12",
    "    port: 443",
    "    password: synthetic-hy2",
    "    sni: hy2.example.invalid",
    "    alpn:",
    "      - h3",
    "    obfs: salamander",
    "    obfs-password: synthetic-obfs",
    `    fingerprint: ${PIN}`,
    "    skip-cert-verify: false",
    "  - name: 美国",
    "    type: tuic",
    "    server: 203.0.113.13",
    "    port: 443",
    "    uuid: 22222222-2222-4222-8222-222222222222",
    "    password: synthetic-tuic",
    "    sni: tuic.example.invalid",
    "    alpn:",
    "      - h3",
    "    congestion-controller: bbr",
    "    udp-relay-mode: native",
    "    skip-cert-verify: false",
    "    disable-sni: false"
  ]));
  assertSuccess(parsed, 4);
  assert.deepEqual(parsed.nodes[0], withDedup({
    protocol: "ss",
    host: "203.0.113.10",
    port: 8388,
    name: "HK ss",
    displayName: "HK ss",
    countryCode: "HK",
    region: "HK",
    cipher: "aes-256-gcm",
    password: "synthetic-password"
  }));
  assert.deepEqual(parsed.nodes[1], withDedup({
    protocol: "vless",
    host: "203.0.113.11",
    port: 443,
    name: "日本",
    displayName: "日本",
    countryCode: "JP",
    region: "JP",
    uuid: "11111111-1111-4111-8111-111111111111",
    udp: true,
    tls: true,
    serverName: "www.example.invalid",
    network: "tcp",
    flow: "xtls-rprx-vision",
    packetEncoding: "xudp",
    clientFingerprint: "chrome",
    realityOpts: { publicKey: PUBLIC_KEY, shortId: "abcd" }
  }));
  assert.deepEqual(parsed.nodes[2], withDedup({
    protocol: "hysteria2",
    host: "203.0.113.12",
    port: 443,
    name: "新加坡",
    displayName: "新加坡",
    countryCode: "SG",
    region: "SG",
    password: "synthetic-hy2",
    sni: "hy2.example.invalid",
    alpn: ["h3"],
    obfs: "salamander",
    obfsPassword: "synthetic-obfs",
    fingerprint: PIN
  }));
  assert.deepEqual(parsed.nodes[3], withDedup({
    protocol: "tuic",
    host: "203.0.113.13",
    port: 443,
    name: "美国",
    displayName: "美国",
    countryCode: "US",
    region: "US",
    uuid: "22222222-2222-4222-8222-222222222222",
    password: "synthetic-tuic",
    sni: "tuic.example.invalid",
    alpn: ["h3"],
    congestionController: "bbr",
    udpRelayMode: "native"
  }));
  for (const node of parsed.nodes) {
    assert.equal(node.dedupKey, fingerprintNode(node));
    assert.match(node.dedupKey, /^[0-9a-f]{64}$/);
  }
  assert.equal(Object.hasOwn(parsed.nodes[0], "fingerprint"), false);
  assert.equal(Object.hasOwn(parsed.nodes[1], "fingerprint"), false);
  assert.equal(Object.hasOwn(parsed.nodes[3], "fingerprint"), false);
  assert.equal(parsed.nodes[2].fingerprint, PIN);
  assert.notEqual(parsed.nodes[2].fingerprint, parsed.nodes[2].dedupKey);
  assert.equal(Object.hasOwn(parsed.nodes[2], "skipCertVerify"), false);
  assert.equal(Object.hasOwn(parsed.nodes[3], "disableSni"), false);
});

test("accepts documented cipher fingerprint congestion and relay allowlists", () => {
  for (const cipher of [
    "aes-128-gcm",
    "aes-192-gcm",
    "aes-256-gcm",
    "chacha20-ietf-poly1305",
    "xchacha20-ietf-poly1305",
    "2022-blake3-aes-128-gcm",
    "2022-blake3-aes-256-gcm",
    "2022-blake3-chacha20-poly1305"
  ]) {
    const parsed = parseThirdPartyYaml(yamlLines([
      "proxies:",
      "  - name: HK",
      "    type: ss",
      "    server: 203.0.113.30",
      "    port: 1",
      `    cipher: ${cipher}`,
      "    password: short"
    ]));
    assert.equal(parsed.nodes[0].cipher, cipher);
    assert.equal(parsed.nodes[0].password, "short");
  }
  for (const clientFingerprint of ["chrome", "firefox", "safari", "ios", "android", "edge", "random", "randomized"]) {
    const parsed = parseThirdPartyYaml(yamlLines([
      "proxies:",
      "  - name: 日本",
      "    type: vless",
      "    server: 203.0.113.31",
      "    port: 443",
      "    uuid: 11111111-1111-4111-8111-111111111111",
      `    client-fingerprint: ${clientFingerprint}`
    ]));
    assert.equal(parsed.nodes[0].clientFingerprint, clientFingerprint);
    assert.equal(parsed.nodes[0].network, "tcp");
  }
  for (const packetEncoding of ["xudp", "packetaddr"]) {
    const parsed = parseThirdPartyYaml(yamlLines([
      "proxies:",
      "  - name: 日本",
      "    type: vless",
      "    server: 203.0.113.31",
      "    port: 443",
      "    uuid: 11111111-1111-4111-8111-111111111111",
      `    packet-encoding: ${packetEncoding}`
    ]));
    assert.equal(parsed.nodes[0].packetEncoding, packetEncoding);
  }
  for (const congestionController of ["bbr", "cubic", "new_reno"]) {
    const parsed = parseThirdPartyYaml(yamlLines([
      "proxies:",
      "  - name: 美国",
      "    type: tuic",
      "    server: 203.0.113.32",
      "    port: 443",
      "    uuid: 22222222-2222-4222-8222-222222222222",
      "    password: synthetic-tuic",
      `    congestion-controller: ${congestionController}`
    ]));
    assert.equal(parsed.nodes[0].congestionController, congestionController);
  }
  for (const udpRelayMode of ["native", "quic"]) {
    const parsed = parseThirdPartyYaml(yamlLines([
      "proxies:",
      "  - name: 美国",
      "    type: tuic",
      "    server: 203.0.113.32",
      "    port: 443",
      "    uuid: 22222222-2222-4222-8222-222222222222",
      "    password: synthetic-tuic",
      `    udp-relay-mode: ${udpRelayMode}`
    ]));
    assert.equal(parsed.nodes[0].udpRelayMode, udpRelayMode);
  }
});

test("strips name controls and accepts documentation ipv6 with region override", () => {
  const parsed = parseThirdPartyYaml(yamlLines([
    "proxies:",
    "  - name: \"HK\\u0007\\u202E node\"",
    "    type: ss",
    "    server: \"2001:db8::20\"",
    "    port: 443",
    "    cipher: aes-128-gcm",
    "    password: synthetic-password"
  ]), { regionOverride: "JP" });
  assertSuccess(parsed, 1);
  assert.equal(parsed.nodes[0].name, "HK node");
  assert.equal(parsed.nodes[0].displayName, "HK node");
  assert.equal(parsed.nodes[0].host, "2001:db8::20");
  assert.equal(parsed.nodes[0].countryCode, "JP");
  assert.equal(parsed.nodes[0].region, "JP");
  assert.equal(Object.hasOwn(parsed.nodes[0], "fingerprint"), false);
});

test("ignores imported clash settings and does not publish them on nodes", () => {
  const parsed = parseThirdPartyYaml(yamlLines([
    "mixed-port: 7890",
    "allow-lan: false",
    "mode: rule",
    "log-level: info",
    "ipv6: false",
    "unified-delay: true",
    "tcp-concurrent: true",
    "global-client-fingerprint: firefox",
    "profile:",
    "  store-selected: true",
    "dns:",
    "  enable: true",
    "  nameserver:",
    "    - 203.0.113.53",
    "tun:",
    "  enable: false",
    "ports:",
    "  mixed: 7890",
    "proxy-groups:",
    "  - name: LEAKED-GROUP",
    "    type: select",
    "    proxies:",
    "      - HK",
    "rules:",
    "  - MATCH,LEAKED-GROUP",
    "proxies:",
    "  - name: HK",
    "    type: ss",
    "    server: 203.0.113.10",
    "    port: 8388",
    "    cipher: aes-256-gcm",
    "    password: synthetic-password"
  ]));
  assertSuccess(parsed, 1);
  assert.deepEqual(parsed.nodes[0], withDedup({
    protocol: "ss",
    host: "203.0.113.10",
    port: 8388,
    name: "HK",
    displayName: "HK",
    countryCode: "HK",
    region: "HK",
    cipher: "aes-256-gcm",
    password: "synthetic-password"
  }));
  const serialized = JSON.stringify(parsed);
  for (const marker of ["LEAKED-GROUP", "203.0.113.53", "store-selected", "nameserver", "firefox", "mixed-port", "proxy-groups"]) {
    assert.equal(serialized.includes(marker), false, marker);
  }
});

test("deduplicates equivalent nodes without treating property order as a conflict", () => {
  const reordered = parseThirdPartyYaml(yamlLines([
    "proxies:",
    "  - password: synthetic-password",
    "    port: 8388",
    "    cipher: aes-256-gcm",
    "    server: Example.Invalid",
    "    type: ss",
    "    name: HK one",
    "  - name: HK two",
    "    type: ss",
    "    server: example.invalid",
    "    port: 8388",
    "    cipher: aes-256-gcm",
    "    password: synthetic-password"
  ]));
  assertSuccess(reordered, 1);
  assert.equal(reordered.nodes[0].name, "HK one");
  assert.equal(reordered.nodes[0].host, "example.invalid");
  assert.equal(reordered.nodes[0].cipher, "aes-256-gcm");
  assert.equal(Object.hasOwn(reordered.nodes[0], "fingerprint"), false);
  assert.equal(reordered.nodes[0].dedupKey, fingerprintNode(reordered.nodes[0]));

  const colon = PIN.match(/../g).join(":");
  const pins = parseThirdPartyYaml(yamlLines([
    "proxies:",
    "  - name: SG one",
    "    type: hysteria2",
    "    server: 203.0.113.20",
    "    port: 443",
    "    password: synthetic-hy2",
    `    fingerprint: "${colon}"`,
    "  - name: SG two",
    "    type: hysteria2",
    "    server: 203.0.113.20",
    "    port: 443",
    "    password: synthetic-hy2",
    `    fingerprint: ${PIN}`
  ]));
  assertSuccess(pins, 1);
  assert.equal(pins.nodes[0].name, "SG one");
  assert.equal(pins.nodes[0].fingerprint, colon);
  assert.notEqual(pins.nodes[0].fingerprint, pins.nodes[0].dedupKey);
  assert.equal(pins.nodes[0].dedupKey, fingerprintNode(pins.nodes[0]));

  const vless = parseThirdPartyYaml(yamlLines([
    "proxies:",
    "  - name: 日本",
    "    type: vless",
    "    server: 203.0.113.21",
    "    port: 443",
    "    uuid: AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA",
    "    reality-opts:",
    "      short-id: ABCD",
    `      public-key: ${PUBLIC_KEY}`,
    "  - name: 大阪",
    "    network: tcp",
    "    type: vless",
    "    server: 203.0.113.21",
    "    port: 443",
    "    uuid: aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    "    reality-opts:",
    `      public-key: ${PUBLIC_KEY}`,
    "      short-id: abcd"
  ]));
  assertSuccess(vless, 1);
  assert.equal(vless.nodes[0].name, "日本");
  assert.equal(vless.nodes[0].uuid, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  assert.equal(vless.nodes[0].network, "tcp");
  assert.deepEqual(vless.nodes[0].realityOpts, { publicKey: PUBLIC_KEY, shortId: "abcd" });
  assert.equal(Object.hasOwn(vless.nodes[0], "fingerprint"), false);
});

test("preserves explicit vless booleans and rejects shadowsocks udp", () => {
  const parsed = parseThirdPartyYaml(yamlLines([
    "proxies:",
    "  - name: 日本",
    "    type: vless",
    "    server: 203.0.113.41",
    "    port: 443",
    "    uuid: 11111111-1111-4111-8111-111111111111",
    "    udp: true",
    "    tls: true",
    "  - name: 大阪",
    "    type: vless",
    "    server: 203.0.113.42",
    "    port: 443",
    "    uuid: 22222222-2222-4222-8222-222222222222",
    "    udp: false",
    "    tls: false",
    "  - name: 京都",
    "    type: vless",
    "    server: 203.0.113.43",
    "    port: 443",
    "    uuid: 33333333-3333-4333-8333-333333333333"
  ]));
  assertSuccess(parsed, 3);
  assert.equal(parsed.nodes[0].udp, true);
  assert.equal(parsed.nodes[0].tls, true);
  assert.equal(parsed.nodes[1].udp, false);
  assert.equal(parsed.nodes[1].tls, false);
  assert.equal(Object.hasOwn(parsed.nodes[2], "udp"), false);
  assert.equal(Object.hasOwn(parsed.nodes[2], "tls"), false);
  expectItem(yamlLines([
    "proxies:",
    "  - name: 日本",
    "    type: vless",
    "    server: 203.0.113.44",
    "    port: 443",
    "    uuid: 11111111-1111-4111-8111-111111111111",
    "    tls: false",
    "    reality-opts:",
    `      public-key: ${PUBLIC_KEY}`,
    "      short-id: abcd"
  ]), "yaml_proxy_invalid", 0);
  for (const udp of ["true", "false"]) {
    expectItem(yamlLines([
      "proxies:",
      "  - name: HK",
      "    type: ss",
      "    server: 203.0.113.10",
      "    port: 8388",
      "    cipher: aes-256-gcm",
      "    password: synthetic-password",
      `    udp: ${udp}`
    ]), "yaml_proxy_invalid", 0);
  }
});

test("rejects conflicting protocol config for one credential identity", () => {
  expectItem(yamlLines([
    "proxies:",
    "  - name: SG",
    "    type: hysteria2",
    "    server: 203.0.113.12",
    "    port: 443",
    "    password: synthetic-hy2",
    `    fingerprint: ${"aa".repeat(32)}`,
    "  - name: SG",
    "    type: hysteria2",
    "    server: 203.0.113.12",
    "    port: 443",
    "    password: synthetic-hy2",
    `    fingerprint: ${"bb".repeat(32)}`
  ]), "yaml_conflict", 1, "synthetic-hy2");
  expectItem(yamlLines([
    "proxies:",
    "  - name: 日本",
    "    type: vless",
    "    server: 203.0.113.40",
    "    port: 443",
    "    uuid: 11111111-1111-4111-8111-111111111111",
    "    client-fingerprint: chrome",
    "  - name: 日本",
    "    type: vless",
    "    server: 203.0.113.40",
    "    port: 443",
    "    uuid: 11111111-1111-4111-8111-111111111111",
    "    client-fingerprint: firefox"
  ]), "yaml_conflict", 1);
});

test("rejects unsafe yaml constructs and redacts source text", () => {
  expectCode("proxies: [ name: \"syntax-secret-value\"", "yaml_syntax", "syntax-secret-value");
  expectCode(yamlLines([
    "proxies:",
    "  - name: HK",
    "    name: JP",
    "    type: ss",
    "    server: 203.0.113.10",
    "    port: 1",
    "    cipher: aes-128-gcm",
    "    password: duplicate-secret-value"
  ]), "yaml_unsupported_construct", "duplicate-secret-value");
  expectCode(yamlLines([
    "proxies: &pool",
    "  - name: HK",
    "    type: ss",
    "    server: 203.0.113.10",
    "    port: 1",
    "    cipher: aes-128-gcm",
    "    password: anchor-secret-value"
  ]), "yaml_unsupported_construct", "anchor-secret-value");
  expectCode(yamlLines([
    "servers:",
    "  host: &target 203.0.113.10",
    "proxies:",
    "  - name: HK",
    "    type: ss",
    "    server: *target",
    "    port: 1",
    "    cipher: aes-128-gcm",
    "    password: alias-secret-value"
  ]), "yaml_unsupported_construct", "alias-secret-value");
  expectCode(yamlLines([
    "proxies:",
    "  - name: HK",
    "    type: ss",
    "    server: 203.0.113.10",
    "    port: 1",
    "    cipher: aes-256-gcm",
    "    password: merge-secret-value",
    "    <<:",
    "      udp: true"
  ]), "yaml_unsupported_construct", "merge-secret-value");
  assert.throws(() => parseThirdPartyYaml(yamlLines([
    "proxies:",
    "  - name: !leakmarker HK",
    "    type: ss",
    "    server: 203.0.113.10",
    "    port: 1",
    "    cipher: aes-128-gcm",
    "    password: custom-tag-secret"
  ])), (error) => {
    assert.equal(error.code, "yaml_unsupported_construct");
    assert.equal(error.message, MESSAGES.yaml_unsupported_construct);
    assertRedacted(error, "custom-tag-secret");
    assertRedacted(error, "leakmarker");
    return true;
  });
  expectCode(yamlLines([
    "proxies:",
    "  - name: HK",
    "    type: ss",
    "    server: 203.0.113.10",
    "    port: 1",
    "    cipher: aes-128-gcm",
    "    password: !!str tag-secret-value"
  ]), "yaml_unsupported_construct", "tag-secret-value");
  expectCode(yamlLines([
    "proxies:",
    "  - name: HK",
    "    type: ss",
    "    server: 203.0.113.10",
    "    port: 1",
    "    cipher: aes-128-gcm",
    "    password: !!binary c2VjcmV0LWJpbmFyeQ=="
  ]), "yaml_unsupported_construct", "c2VjcmV0LWJpbmFyeQ==");
  expectCode(yamlLines([
    "__proto__:",
    "  polluted: true",
    "constructor:",
    "  prototype:",
    "    polluted: true",
    "proxies:",
    "  - name: HK",
    "    type: ss",
    "    server: 203.0.113.10",
    "    port: 1",
    "    cipher: aes-128-gcm",
    "    password: proto-secret-value",
    "    prototype: nested"
  ]), "yaml_unsupported_construct", "proto-secret-value");
  assert.equal(Object.prototype.polluted, undefined);
  assert.equal(Object.hasOwn({}, "polluted"), false);
  expectCode(yamlLines([
    "proxies:",
    "  - name: HK",
    "    type: ss",
    "    server: 203.0.113.10",
    "    port: 1",
    "    cipher: aes-128-gcm",
    "    password: numeric-key-secret",
    "    1: hidden-numeric"
  ]), "yaml_unsupported_construct", "hidden-numeric");
  expectCode(yamlLines([
    "proxies:",
    "  - name: HK",
    "    type: ss",
    "    server: 203.0.113.10",
    "    port: 1",
    "    cipher: aes-128-gcm",
    "    password: first-doc-secret",
    "---",
    "proxies:",
    "  - name: JP",
    "    type: ss",
    "    server: 203.0.113.11",
    "    port: 1",
    "    cipher: aes-128-gcm",
    "    password: second-doc-secret"
  ]), "yaml_multiple_documents", "second-doc-secret");
  expectCode(yamlLines([
    "%YAML 1.1",
    "---",
    "proxies:",
    "  - name: HK",
    "    type: ss",
    "    server: 203.0.113.10",
    "    port: 1",
    "    cipher: aes-128-gcm",
    "    password: yaml11-secret",
    "    udp: yes"
  ]), "yaml_unsupported_construct", "yaml11-secret");
});

test("rejects malformed proxy items atomically", () => {
  expectCode("", "yaml_structure");
  expectCode("mode: rule\n", "yaml_structure");
  expectCode("- 1\n", "yaml_structure");
  expectCode("proxies: {}\n", "yaml_structure");
  expectCode("proxies: []\n", "yaml_empty");
  expectCode(null, "yaml_invalid_input");
  expectCode(1, "yaml_invalid_input");
  expectCode({ proxies: [] }, "yaml_invalid_input");
  const base = [
    "proxies:",
    "  - name: HK",
    "    type: ss",
    "    server: 203.0.113.10"
  ];
  expectItem(yamlLines([...base, "    port: 0", "    cipher: aes-256-gcm", "    password: synthetic-password"]), "yaml_proxy_invalid", 0);
  expectItem(yamlLines([...base, "    port: 65536", "    cipher: aes-256-gcm", "    password: synthetic-password"]), "yaml_proxy_invalid", 0);
  expectItem(yamlLines([...base, "    port: \"8388\"", "    cipher: aes-256-gcm", "    password: synthetic-password"]), "yaml_proxy_invalid", 0);
  expectItem(yamlLines([...base, "    port: 8388.0", "    cipher: aes-256-gcm", "    password: synthetic-password"]), "yaml_proxy_invalid", 0);
  expectItem(yamlLines([...base, "    port: 1", "    cipher: rc4-md5", "    password: synthetic-password"]), "yaml_proxy_invalid", 0);
  expectItem(yamlLines([...base, "    port: 1", "    cipher: aes-128-gcm", "    password: synthetic-password", "    plugin: obfs"]), "yaml_proxy_invalid", 0);
  expectItem(yamlLines([
    "proxies:",
    "  - name: \"\\u0007\\u202E\"",
    "    type: ss",
    "    server: 203.0.113.10",
    "    port: 1",
    "    cipher: aes-128-gcm",
    "    password: synthetic-password"
  ]), "yaml_proxy_invalid", 0);
  expectItem(yamlLines([
    "proxies:",
    `  - name: ${"n".repeat(129)}`,
    "    type: ss",
    "    server: 203.0.113.10",
    "    port: 1",
    "    cipher: aes-128-gcm",
    "    password: synthetic-password"
  ]), "yaml_proxy_invalid", 0);
  const longName = parseThirdPartyYaml(yamlLines([
    "proxies:",
    `  - name: ${"a".repeat(128)}`,
    "    type: ss",
    "    server: example.invalid",
    "    port: 1",
    "    cipher: aes-128-gcm",
    "    password: synthetic-password"
  ]));
  assert.equal(longName.nodes[0].name.length, 128);
  expectItem(yamlLines([
    "proxies:",
    "  - name: 日本",
    "    type: vless",
    "    server: 203.0.113.11",
    "    port: 443",
    "    uuid: 11111111-1111-4111-1111-111111111111"
  ]), "yaml_proxy_invalid", 0);
  for (const type of ["vmess", "trojan", "hy2", "ssr"]) {
    expectItem(yamlLines([
      "proxies:",
      "  - name: HK",
      `    type: ${type}`,
      "    server: 203.0.113.10",
      "    port: 1"
    ]), "yaml_proxy_invalid", 0);
  }
  for (const extra of [
    "    network: ws",
    "    network: grpc",
    "    flow: xtls-rprx-direct",
    "    packet-encoding: none",
    "    client-fingerprint: curl",
    "    skip-cert-verify: true"
  ]) {
    expectItem(yamlLines([
      "proxies:",
      "  - name: 日本",
      "    type: vless",
      "    server: 203.0.113.11",
      "    port: 443",
      "    uuid: 11111111-1111-4111-8111-111111111111",
      extra
    ]), "yaml_proxy_invalid", 0);
  }
  expectItem(yamlLines([
    "proxies:",
    "  - name: 日本",
    "    type: vless",
    "    server: 203.0.113.11",
    "    port: 443",
    "    uuid: 11111111-1111-4111-8111-111111111111",
    "    ws-opts:",
    "      path: /secret-path"
  ]), "yaml_proxy_invalid", 0, "secret-path");
  for (const extra of [
    "    skip-cert-verify: true",
    "    up: \"100\"",
    "    obfs: chrome",
    "    obfs: salamander",
    "    obfs-password: only-obfs-secret",
    "    fingerprint: abcd",
    "    alpn: h3",
    "    alpn: []"
  ]) {
    expectItem(yamlLines([
      "proxies:",
      "  - name: 新加坡",
      "    type: hysteria2",
      "    server: 203.0.113.12",
      "    port: 443",
      "    password: synthetic-hy2",
      extra
    ]), "yaml_proxy_invalid", 0, extra.includes("only-obfs-secret") ? "only-obfs-secret" : undefined);
  }
  expectItem(yamlLines([
    "proxies:",
    "  - name: 新加坡",
    "    type: hysteria2",
    "    server: 203.0.113.12",
    "    port: 443",
    "    password: synthetic-hy2",
    "    alpn:",
    ...Array.from({ length: 9 }, () => "      - h3")
  ]), "yaml_proxy_invalid", 0);
  expectItem(yamlLines([
    "proxies:",
    "  - name: 美国",
    "    type: tuic",
    "    server: 203.0.113.13",
    "    port: 443",
    "    uuid: 22222222-2222-4222-8222-222222222222",
    "    password: synthetic-tuic",
    "    skip-cert-verify: true"
  ]), "yaml_proxy_invalid", 0);
  expectItem(yamlLines([
    "proxies:",
    "  - name: 美国",
    "    type: tuic",
    "    server: 203.0.113.13",
    "    port: 443",
    "    uuid: 22222222-2222-4222-8222-222222222222",
    "    password: synthetic-tuic",
    "    disable-sni: true"
  ]), "yaml_proxy_invalid", 0);
  expectItem(yamlLines([
    "proxies:",
    "  - name: 美国",
    "    type: tuic",
    "    server: 203.0.113.13",
    "    port: 443",
    "    uuid: 22222222-2222-4222-8222-222222222222",
    "    password: synthetic-tuic",
    "    congestion-controller: reno"
  ]), "yaml_proxy_invalid", 0);
  expectItem(yamlLines([
    "proxies:",
    "  - name: HK",
    "    type: ss",
    "    server: 203.0.113.10",
    "    port: 8388",
    "    cipher: aes-256-gcm",
    "    password: synthetic-password",
    "  - name: bad",
    "    type: ss",
    "    server: \"https://example.invalid/secret-path\"",
    "    port: 1",
    "    cipher: aes-256-gcm",
    "    password: synthetic-password"
  ]), "yaml_proxy_invalid", 1, "secret-path");
});

test("rejects remote providers and scripts even when proxies are present", () => {
  const secret = "https://example.invalid/secret-provider.yaml";
  for (const key of ["proxy-providers", "rule-providers", "script", "Proxy-Providers"]) {
    expectCode(yamlLines([
      `${key}:`,
      `  leak: ${secret}`,
      "proxies:",
      "  - name: HK",
      "    type: ss",
      "    server: 203.0.113.10",
      "    port: 1",
      "    cipher: aes-128-gcm",
      "    password: synthetic-password"
    ]), "yaml_remote_rejected", secret);
  }
  expectCode(yamlLines([
    "proxy-providers: {}",
    "proxies:",
    "  - name: HK",
    "    type: ss",
    "    server: 203.0.113.10",
    "    port: 1",
    "    cipher: aes-128-gcm",
    "    password: synthetic-password"
  ]), "yaml_remote_rejected");
});

test("enforces utf8 node depth and proxy limits", () => {
  expectCode(`${"oversize-secret-value"}${"a".repeat(THIRD_PARTY_YAML_MAX_BYTES)}`, "yaml_oversize", "oversize-secret-value");
  const rules = Array.from({ length: 5000 }, (_, index) => `  - r${index}`);
  expectCode(yamlLines([
    "proxies:",
    "  - name: HK",
    "    type: ss",
    "    server: 203.0.113.10",
    "    port: 1",
    "    cipher: aes-128-gcm",
    "    password: node-limit-secret",
    "rules:",
    ...rules
  ]), "yaml_limit", "node-limit-secret");
  expectCode(yamlLines([
    "proxies:",
    "  - name: n",
    "    type: ss",
    "    server: example.invalid",
    "    port: 1",
    "    cipher: aes-128-gcm",
    "    password: depth-limit-secret",
    "    nested:",
    "      a:",
    "        b:",
    "          c:",
    "            d:",
    "              e: 1"
  ]), "yaml_limit", "depth-limit-secret");
  const proxies = [];
  for (let index = 0; index < 256; index += 1) {
    proxies.push(
      `  - name: n${index}`,
      "    type: ss",
      "    server: 203.0.113.10",
      `    port: ${index + 1}`,
      "    cipher: aes-128-gcm",
      "    password: proxy-limit-secret"
    );
  }
  const accepted = parseThirdPartyYaml(yamlLines(["proxies:", ...proxies]));
  assertSuccess(accepted, 256);
  assert.equal(accepted.nodes[0].port, 1);
  assert.equal(accepted.nodes[255].port, 256);
  assert.equal(accepted.nodes[255].dedupKey, fingerprintNode(accepted.nodes[255]));
  assert.equal(Object.hasOwn(accepted.nodes[255], "fingerprint"), false);
  proxies.push(
    "  - name: n256",
    "    type: ss",
    "    server: 203.0.113.10",
    "    port: 257",
    "    cipher: aes-128-gcm",
    "    password: proxy-limit-secret"
  );
  expectCode(yamlLines(["proxies:", ...proxies]), "yaml_limit", "proxy-limit-secret");
});
