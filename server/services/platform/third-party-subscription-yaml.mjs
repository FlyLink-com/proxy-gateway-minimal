import { isIP } from "node:net";
import { Parser, isAlias, isMap, isPair, isScalar, isSeq, parseDocument } from "yaml";

import { detectCountryCode, fingerprintNode } from "./third-party-subscription-fetch.mjs";

// Restricted Clash YAML subset for third-party subscription import.
export const THIRD_PARTY_YAML_MAX_BYTES = 65536;
export const THIRD_PARTY_YAML_MAX_PROXIES = 256;
export const THIRD_PARTY_YAML_MAX_DEPTH = 8;
export const THIRD_PARTY_YAML_MAX_NODES = 4096;

const PARSE_OPTIONS = Object.freeze({
  strict: true,
  uniqueKeys: true,
  version: "1.2",
  prettyErrors: false,
  logLevel: "silent",
  merge: false
});

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

const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const REMOTE_TOP_LEVEL = new Set(["proxy-providers", "rule-providers", "script"]);
const UNSUPPORTED_PARSE_CODES = new Set([
  "ALIAS_PROPS",
  "BAD_ALIAS",
  "BAD_COLLECTION_TYPE",
  "BAD_DIRECTIVE",
  "DUPLICATE_KEY",
  "MULTIPLE_ANCHORS",
  "MULTIPLE_TAGS",
  "NON_STRING_KEY",
  "TAG_RESOLVE_FAILED"
]);
const SS_CIPHERS = new Set([
  "aes-128-gcm",
  "aes-192-gcm",
  "aes-256-gcm",
  "chacha20-ietf-poly1305",
  "xchacha20-ietf-poly1305",
  "2022-blake3-aes-128-gcm",
  "2022-blake3-aes-256-gcm",
  "2022-blake3-chacha20-poly1305"
]);
const CLIENT_FINGERPRINTS = new Set([
  "chrome",
  "firefox",
  "safari",
  "ios",
  "android",
  "edge",
  "random",
  "randomized"
]);
const TUIC_CONGESTION = new Set(["bbr", "cubic", "new_reno"]);
const TUIC_UDP_RELAY = new Set(["native", "quic"]);
const NAME_STRIP = /[\u0000-\u001F\u007F-\u009F\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;
const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F]/;
const DECIMAL_PORT = /^[+]?(?:0|[1-9][0-9]*)$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PUBLIC_KEY_PATTERN = /^[A-Za-z0-9+/_=-]{16,256}$/;
const SHORT_ID_PATTERN = /^[0-9a-fA-F]{2,16}$/;
const CERT_HEX_PATTERN = /^[0-9a-fA-F]{64}$/;
const CERT_COLON_PATTERN = /^[0-9a-fA-F]{2}(?::[0-9a-fA-F]{2}){31}$/;

function allowKeys(...keys) {
  return new Set(["name", "type", "server", "port", ...keys]);
}

const PROTOCOL_KEYS = new Map([
  ["ss", allowKeys("cipher", "password")],
  ["vless", allowKeys(
    "uuid",
    "udp",
    "tls",
    "servername",
    "network",
    "flow",
    "packet-encoding",
    "client-fingerprint",
    "reality-opts",
    "skip-cert-verify"
  )],
  ["hysteria2", allowKeys(
    "password",
    "sni",
    "alpn",
    "obfs",
    "obfs-password",
    "fingerprint",
    "skip-cert-verify"
  )],
  ["tuic", allowKeys(
    "uuid",
    "password",
    "sni",
    "alpn",
    "congestion-controller",
    "udp-relay-mode",
    "skip-cert-verify",
    "disable-sni"
  )]
]);

function fail(code, itemIndex) {
  const error = new Error(MESSAGES[code]);
  error.code = code;
  if (Number.isInteger(itemIndex) && itemIndex >= 0 && itemIndex <= THIRD_PARTY_YAML_MAX_PROXIES) {
    error.itemIndex = itemIndex;
  }
  return error;
}

function assertSingleDocument(source) {
  // parseDocument omits MULTIPLE_DOCS when logLevel is silent.
  let documents = 0;
  try {
    for (const token of new Parser().parse(source)) {
      if (token && token.type === "document") {
        documents += 1;
        if (documents > 1) throw fail("yaml_multiple_documents");
      }
    }
  } catch (error) {
    if (error && error.code === "yaml_multiple_documents") throw error;
    throw fail("yaml_syntax");
  }
}

function rejectDiagnostics(doc) {
  const diagnostic = (doc.errors && doc.errors[0]) || (doc.warnings && doc.warnings[0]);
  if (!diagnostic) return;
  if (diagnostic.code === "MULTIPLE_DOCS") throw fail("yaml_multiple_documents");
  if (diagnostic.code === "KEY_OVER_1024_CHARS" || diagnostic.code === "RESOURCE_EXHAUSTION") {
    throw fail("yaml_limit");
  }
  if (UNSUPPORTED_PARSE_CODES.has(diagnostic.code)) throw fail("yaml_unsupported_construct");
  throw fail("yaml_syntax");
}

function assertDirectives(doc) {
  const directives = doc.directives;
  if (!directives) return;
  const version = directives.yaml && directives.yaml.version;
  if (version && version !== "1.2") throw fail("yaml_unsupported_construct");
  const tags = directives.tags || {};
  const handles = Object.keys(tags);
  if (handles.length !== 1 || handles[0] !== "!!" || tags["!!"] !== "tag:yaml.org,2002:") {
    throw fail("yaml_unsupported_construct");
  }
}

function assertSafeAst(root) {
  let count = 0;
  const stack = [{ node: root, depth: 1 }];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current.depth > THIRD_PARTY_YAML_MAX_DEPTH) throw fail("yaml_limit");
    count += 1;
    if (count > THIRD_PARTY_YAML_MAX_NODES) throw fail("yaml_limit");
    const node = current.node;
    if (node == null) continue;
    // Implicit scalars leave tag unset. Explicit and custom tags set it.
    if (isAlias(node) || typeof node.anchor === "string" || node.tag) {
      throw fail("yaml_unsupported_construct");
    }
    if (isMap(node)) {
      for (let index = node.items.length - 1; index >= 0; index -= 1) {
        const pair = node.items[index];
        if (!isPair(pair)) throw fail("yaml_unsupported_construct");
        const key = pair.key;
        if (!isScalar(key) || typeof key.value !== "string" || key.value === "<<" || FORBIDDEN_KEYS.has(key.value)) {
          throw fail("yaml_unsupported_construct");
        }
        stack.push({ node: pair.value, depth: current.depth + 1 });
        stack.push({ node: key, depth: current.depth + 1 });
      }
      continue;
    }
    if (isSeq(node)) {
      for (let index = node.items.length - 1; index >= 0; index -= 1) {
        stack.push({ node: node.items[index], depth: current.depth + 1 });
      }
      continue;
    }
    if (!isScalar(node)) throw fail("yaml_unsupported_construct");
  }
}

function readBoundedString(node, itemIndex, max) {
  if (!isScalar(node) || typeof node.value !== "string") throw fail("yaml_proxy_invalid", itemIndex);
  const value = node.value;
  if (value.length < 1 || value.length > max || CONTROL_CHARS.test(value)) {
    throw fail("yaml_proxy_invalid", itemIndex);
  }
  return value;
}

function readSecret(node, itemIndex) {
  const value = readBoundedString(node, itemIndex, 4096);
  // Reject rather than trim: shared rendering trims secret edges and would change the credential.
  if (value !== value.trim()) throw fail("yaml_proxy_invalid", itemIndex);
  return value;
}

function readName(node, itemIndex) {
  if (!isScalar(node) || typeof node.value !== "string") throw fail("yaml_proxy_invalid", itemIndex);
  const name = node.value.replace(NAME_STRIP, "").trim();
  if (name.length < 1 || name.length > 128) throw fail("yaml_proxy_invalid", itemIndex);
  return name;
}

function readBool(node, itemIndex) {
  if (!isScalar(node) || typeof node.value !== "boolean") throw fail("yaml_proxy_invalid", itemIndex);
  return node.value;
}

function readPort(node, itemIndex) {
  if (!isScalar(node) || typeof node.value !== "number" || !Number.isInteger(node.value)) {
    throw fail("yaml_proxy_invalid", itemIndex);
  }
  if (typeof node.source !== "string" || !DECIMAL_PORT.test(node.source)) {
    throw fail("yaml_proxy_invalid", itemIndex);
  }
  if (node.value < 1 || node.value > 65535) throw fail("yaml_proxy_invalid", itemIndex);
  return node.value;
}

function isStrictIpv4(value) {
  const parts = value.split(".");
  if (parts.length !== 4) return false;
  return parts.every((part) => {
    if (!/^(?:0|[1-9][0-9]{0,2})$/.test(part)) return false;
    const octet = Number(part);
    return octet >= 0 && octet <= 255;
  });
}

function isHostname(value) {
  if (value.length < 1 || value.length > 253 || value.includes("..") || value.startsWith(".") || value.endsWith(".")) {
    return false;
  }
  return value.split(".").every((label) => /^(?:[a-z0-9]|[a-z0-9][a-z0-9-]{0,61}[a-z0-9])$/.test(label));
}

function readServer(node, itemIndex) {
  const value = readBoundedString(node, itemIndex, 253);
  if (!/^[\x21-\x7E]+$/.test(value) || /[\/\\?#@]/.test(value) || value.includes("://")) {
    throw fail("yaml_proxy_invalid", itemIndex);
  }
  if (/^(?:\d+\.){3}\d+$/.test(value)) {
    if (!isStrictIpv4(value)) throw fail("yaml_proxy_invalid", itemIndex);
    return value;
  }
  if (isIP(value) === 6) return value.toLowerCase();
  const host = value.toLowerCase();
  if (!isHostname(host)) throw fail("yaml_proxy_invalid", itemIndex);
  return host;
}

function readUuid(node, itemIndex) {
  const value = readBoundedString(node, itemIndex, 36);
  if (!UUID_PATTERN.test(value)) throw fail("yaml_proxy_invalid", itemIndex);
  return value.toLowerCase();
}

function readAlpn(node, itemIndex) {
  if (!isSeq(node) || node.items.length < 1 || node.items.length > 8) {
    throw fail("yaml_proxy_invalid", itemIndex);
  }
  return node.items.map((item) => {
    const value = readBoundedString(item, itemIndex, 256);
    if (!/^[\x21-\x7E]+$/.test(value)) throw fail("yaml_proxy_invalid", itemIndex);
    return value;
  });
}

function readCertFingerprint(node, itemIndex) {
  const value = readBoundedString(node, itemIndex, 256);
  if (!CERT_HEX_PATTERN.test(value) && !CERT_COLON_PATTERN.test(value)) {
    throw fail("yaml_proxy_invalid", itemIndex);
  }
  return value;
}

function readEntries(mapNode, itemIndex) {
  if (!isMap(mapNode)) throw fail("yaml_proxy_invalid", itemIndex);
  const fields = new Map();
  for (const pair of mapNode.items) {
    if (!isPair(pair) || !isScalar(pair.key) || typeof pair.key.value !== "string") {
      throw fail("yaml_proxy_invalid", itemIndex);
    }
    if (fields.has(pair.key.value)) throw fail("yaml_proxy_invalid", itemIndex);
    fields.set(pair.key.value, pair.value);
  }
  return fields;
}

function assertAllowedKeys(fields, allowed, itemIndex) {
  for (const key of fields.keys()) {
    if (!allowed.has(key)) throw fail("yaml_proxy_invalid", itemIndex);
  }
}

function rejectEnabledBypass(fields, key, itemIndex) {
  if (!fields.has(key)) return;
  if (readBool(fields.get(key), itemIndex) === true) throw fail("yaml_proxy_invalid", itemIndex);
}

function readReality(node, itemIndex) {
  const fields = readEntries(node, itemIndex);
  assertAllowedKeys(fields, new Set(["public-key", "short-id"]), itemIndex);
  const publicKey = readBoundedString(fields.get("public-key"), itemIndex, 256);
  if (!PUBLIC_KEY_PATTERN.test(publicKey)) throw fail("yaml_proxy_invalid", itemIndex);
  const realityOpts = { publicKey };
  if (fields.has("short-id")) {
    const shortId = readBoundedString(fields.get("short-id"), itemIndex, 256);
    if (!SHORT_ID_PATTERN.test(shortId) || shortId.length % 2 !== 0) {
      throw fail("yaml_proxy_invalid", itemIndex);
    }
    realityOpts.shortId = shortId.toLowerCase();
  }
  return realityOpts;
}

function readProtocolFields(type, fields, itemIndex) {
  if (type === "ss") {
    const cipher = readBoundedString(fields.get("cipher"), itemIndex, 256);
    if (!SS_CIPHERS.has(cipher)) throw fail("yaml_proxy_invalid", itemIndex);
    return {
      cipher,
      password: readSecret(fields.get("password"), itemIndex)
    };
  }

  if (type === "vless") {
    rejectEnabledBypass(fields, "skip-cert-verify", itemIndex);
    const protocolFields = {
      uuid: readUuid(fields.get("uuid"), itemIndex),
      network: "tcp"
    };
    if (fields.has("network")) {
      const network = readBoundedString(fields.get("network"), itemIndex, 256);
      if (network !== "tcp") throw fail("yaml_proxy_invalid", itemIndex);
    }
    if (fields.has("udp")) protocolFields.udp = readBool(fields.get("udp"), itemIndex);
    if (fields.has("tls")) protocolFields.tls = readBool(fields.get("tls"), itemIndex);
    if (fields.has("servername")) protocolFields.serverName = readServer(fields.get("servername"), itemIndex);
    if (fields.has("flow")) {
      const flow = readBoundedString(fields.get("flow"), itemIndex, 256);
      if (flow !== "xtls-rprx-vision") throw fail("yaml_proxy_invalid", itemIndex);
      protocolFields.flow = flow;
    }
    if (fields.has("packet-encoding")) {
      const packetEncoding = readBoundedString(fields.get("packet-encoding"), itemIndex, 256);
      if (packetEncoding !== "xudp" && packetEncoding !== "packetaddr") {
        throw fail("yaml_proxy_invalid", itemIndex);
      }
      protocolFields.packetEncoding = packetEncoding;
    }
    if (fields.has("client-fingerprint")) {
      const clientFingerprint = readBoundedString(fields.get("client-fingerprint"), itemIndex, 256);
      if (!CLIENT_FINGERPRINTS.has(clientFingerprint)) throw fail("yaml_proxy_invalid", itemIndex);
      protocolFields.clientFingerprint = clientFingerprint;
    }
    if (fields.has("reality-opts")) {
      if (protocolFields.tls === false) throw fail("yaml_proxy_invalid", itemIndex);
      protocolFields.realityOpts = readReality(fields.get("reality-opts"), itemIndex);
    }
    return protocolFields;
  }

  if (type === "hysteria2") {
    rejectEnabledBypass(fields, "skip-cert-verify", itemIndex);
    const protocolFields = {
      password: readSecret(fields.get("password"), itemIndex)
    };
    if (fields.has("sni")) protocolFields.sni = readServer(fields.get("sni"), itemIndex);
    if (fields.has("alpn")) protocolFields.alpn = readAlpn(fields.get("alpn"), itemIndex);
    if (fields.has("obfs") || fields.has("obfs-password")) {
      if (!fields.has("obfs") || !fields.has("obfs-password")) throw fail("yaml_proxy_invalid", itemIndex);
      const obfs = readBoundedString(fields.get("obfs"), itemIndex, 256);
      if (obfs !== "salamander") throw fail("yaml_proxy_invalid", itemIndex);
      protocolFields.obfs = obfs;
      protocolFields.obfsPassword = readSecret(fields.get("obfs-password"), itemIndex);
    }
    if (fields.has("fingerprint")) {
      protocolFields.fingerprint = readCertFingerprint(fields.get("fingerprint"), itemIndex);
    }
    return protocolFields;
  }

  rejectEnabledBypass(fields, "skip-cert-verify", itemIndex);
  rejectEnabledBypass(fields, "disable-sni", itemIndex);
  const protocolFields = {
    uuid: readUuid(fields.get("uuid"), itemIndex),
    password: readSecret(fields.get("password"), itemIndex)
  };
  if (fields.has("sni")) protocolFields.sni = readServer(fields.get("sni"), itemIndex);
  if (fields.has("alpn")) protocolFields.alpn = readAlpn(fields.get("alpn"), itemIndex);
  if (fields.has("congestion-controller")) {
    const congestionController = readBoundedString(fields.get("congestion-controller"), itemIndex, 256);
    if (!TUIC_CONGESTION.has(congestionController)) throw fail("yaml_proxy_invalid", itemIndex);
    protocolFields.congestionController = congestionController;
  }
  if (fields.has("udp-relay-mode")) {
    const udpRelayMode = readBoundedString(fields.get("udp-relay-mode"), itemIndex, 256);
    if (!TUIC_UDP_RELAY.has(udpRelayMode)) throw fail("yaml_proxy_invalid", itemIndex);
    protocolFields.udpRelayMode = udpRelayMode;
  }
  return protocolFields;
}

function buildNode(protocol, host, port, name, regionOverride, protocolFields) {
  const countryCode = detectCountryCode(name, regionOverride);
  const dedupKey = fingerprintNode({
    protocol,
    host,
    port,
    name,
    ...protocolFields
  });
  return {
    protocol,
    host,
    port,
    name,
    displayName: name,
    countryCode,
    region: countryCode,
    dedupKey,
    ...protocolFields
  };
}

function normalizeProxy(node, itemIndex, regionOverride) {
  const fields = readEntries(node, itemIndex);
  const typeNode = fields.get("type");
  if (!isScalar(typeNode) || typeof typeNode.value !== "string" || !PROTOCOL_KEYS.has(typeNode.value)) {
    throw fail("yaml_proxy_invalid", itemIndex);
  }
  const type = typeNode.value;
  assertAllowedKeys(fields, PROTOCOL_KEYS.get(type), itemIndex);
  return buildNode(
    type,
    readServer(fields.get("server"), itemIndex),
    readPort(fields.get("port"), itemIndex),
    readName(fields.get("name"), itemIndex),
    regionOverride,
    readProtocolFields(type, fields, itemIndex)
  );
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(",")}]`;
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function canonicalProtocol(node) {
  const copy = { ...node };
  delete copy.name;
  delete copy.displayName;
  delete copy.countryCode;
  delete copy.region;
  delete copy.dedupKey;
  if (typeof copy.fingerprint === "string") {
    copy.fingerprint = copy.fingerprint.replace(/:/g, "").toLowerCase();
  }
  return stableJson(copy);
}

function dedupeNodes(entries) {
  const seen = new Map();
  const nodes = [];
  for (const entry of entries) {
    const canon = canonicalProtocol(entry.node);
    const previous = seen.get(entry.node.dedupKey);
    if (previous === undefined) {
      seen.set(entry.node.dedupKey, canon);
      nodes.push(entry.node);
      continue;
    }
    if (previous !== canon) throw fail("yaml_conflict", entry.itemIndex);
  }
  return nodes;
}

export function parseThirdPartyYaml(raw, options = {}) {
  if (typeof raw !== "string") throw fail("yaml_invalid_input");
  if (Buffer.byteLength(raw, "utf8") > THIRD_PARTY_YAML_MAX_BYTES) throw fail("yaml_oversize");
  const regionOverride = options && typeof options === "object" && typeof options.regionOverride === "string"
    ? options.regionOverride
    : null;

  assertSingleDocument(raw);
  let doc;
  try {
    doc = parseDocument(raw, PARSE_OPTIONS);
  } catch {
    throw fail("yaml_syntax");
  }
  if (!doc) throw fail("yaml_syntax");
  rejectDiagnostics(doc);
  assertDirectives(doc);
  if (doc.contents == null) throw fail("yaml_structure");
  assertSafeAst(doc.contents);
  if (!isMap(doc.contents)) throw fail("yaml_structure");

  let proxies = null;
  let sawProxies = false;
  for (const pair of doc.contents.items) {
    if (!isPair(pair) || !isScalar(pair.key) || typeof pair.key.value !== "string") {
      throw fail("yaml_unsupported_construct");
    }
    if (REMOTE_TOP_LEVEL.has(pair.key.value.toLowerCase())) throw fail("yaml_remote_rejected");
    if (pair.key.value === "proxies") {
      proxies = pair.value;
      sawProxies = true;
    }
  }
  if (!sawProxies || !isSeq(proxies)) throw fail("yaml_structure");
  if (proxies.items.length === 0) throw fail("yaml_empty");
  if (proxies.items.length > THIRD_PARTY_YAML_MAX_PROXIES) throw fail("yaml_limit");

  const normalized = [];
  for (let itemIndex = 0; itemIndex < proxies.items.length; itemIndex += 1) {
    normalized.push({
      itemIndex,
      node: normalizeProxy(proxies.items[itemIndex], itemIndex, regionOverride)
    });
  }
  const nodes = dedupeNodes(normalized);
  return {
    encoding: "yaml",
    counts: {
      valid: nodes.length,
      unsupported: 0,
      malformed: 0,
      skippedBlank: 0
    },
    nodes
  };
}
