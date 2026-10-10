import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { promises as dns } from "node:dns";

export const THIRD_PARTY_MAX_BODY_BYTES = 2 * 1024 * 1024;
export const THIRD_PARTY_FETCH_TIMEOUT_MS = 15_000;
export const THIRD_PARTY_MAX_REDIRECTS = 5;
export const SUPPORTED_SHARE_PROTOCOLS = Object.freeze(["ss", "vless", "hysteria2", "tuic"]);

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.google.com",
  "metadata"
]);

function shortError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function text(value) {
  return String(value ?? "").trim();
}

function stripBom(value) {
  return String(value ?? "").replace(/^\uFEFF/, "");
}

function decodeUriComponentSafe(value) {
  try {
    return decodeURIComponent(String(value ?? ""));
  } catch {
    return String(value ?? "");
  }
}

function decodeBase64Text(value) {
  const raw = text(value).replace(/\s+/g, "");
  if (!raw || raw.length % 4 === 1) return null;
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(raw)) return null;
  try {
    const padded = raw.replace(/-/g, "+").replace(/_/g, "/");
    const buf = Buffer.from(padded, "base64");
    if (buf.length === 0) return null;
    return buf.toString("utf8");
  } catch {
    return null;
  }
}

function ipv4ToInt(ip) {
  if (isIP(ip) !== 4) return null;
  const parts = ip.split(".").map((part) => Number.parseInt(part, 10));
  if (parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return parts.reduce((acc, part) => ((acc << 8) | part) >>> 0, 0);
}

function ipv4InCidr(ip, cidr) {
  const [base, prefixText] = cidr.split("/");
  const prefix = Number.parseInt(prefixText, 10);
  const ipInt = ipv4ToInt(ip);
  const baseInt = ipv4ToInt(base);
  if (ipInt === null || baseInt === null || !Number.isInteger(prefix)) return false;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

export function isBlockedIpv4(ip) {
  const normalized = text(ip);
  if (isIP(normalized) !== 4) return false;
  return (
    ipv4InCidr(normalized, "0.0.0.0/8")
    || ipv4InCidr(normalized, "10.0.0.0/8")
    || ipv4InCidr(normalized, "127.0.0.0/8")
    || ipv4InCidr(normalized, "169.254.0.0/16")
    || ipv4InCidr(normalized, "172.16.0.0/12")
    || ipv4InCidr(normalized, "192.168.0.0/16")
    || ipv4InCidr(normalized, "100.64.0.0/10")
    || ipv4InCidr(normalized, "192.0.0.0/24")
    || ipv4InCidr(normalized, "198.18.0.0/15")
    || ipv4InCidr(normalized, "224.0.0.0/4")
    || ipv4InCidr(normalized, "240.0.0.0/4")
    || ipv4InCidr(normalized, "255.255.255.255/32")
  );
}

export function isBlockedIpv6(ip) {
  const normalized = text(ip).toLowerCase();
  if (isIP(normalized) !== 6) return false;
  if (normalized === "::1" || normalized === "::") return true;
  if (normalized.startsWith("::ffff:")) {
    const mapped = normalized.slice("::ffff:".length);
    if (isIP(mapped) === 4) return isBlockedIpv4(mapped);
    // WHATWG URL normalizes mapped addresses to hex groups, e.g. ::ffff:7f00:1.
    const hex = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(mapped);
    if (hex) {
      const high = Number.parseInt(hex[1], 16);
      const low = Number.parseInt(hex[2], 16);
      return isBlockedIpv4(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
    }
  }
  if (/^fe[89ab][0-9a-f]:/i.test(normalized)) return true;
  if (/^f[cd][0-9a-f]{2}:/i.test(normalized)) return true;
  if (normalized === "fd00:ec2::254") return true;
  return false;
}

export function isBlockedAddress(value) {
  const ip = text(value).replace(/^\[|\]$/g, "");
  if (isIP(ip) === 4) return isBlockedIpv4(ip);
  if (isIP(ip) === 6) return isBlockedIpv6(ip);
  return false;
}

function hostnameFromUrl(url) {
  return String(url.hostname || "").replace(/^\[|\]$/g, "").toLowerCase();
}

export function parseHttpsUrl(value) {
  let url;
  try {
    url = new URL(text(value));
  } catch {
    throw shortError("invalid_url");
  }
  if (url.protocol !== "https:") throw shortError("invalid_url");
  if (url.username || url.password) throw shortError("invalid_url");
  const host = hostnameFromUrl(url);
  if (!host) throw shortError("invalid_url");
  if (BLOCKED_HOSTNAMES.has(host) || host.endsWith(".localhost") || host.endsWith(".internal")) {
    throw shortError("invalid_url");
  }
  if (isBlockedAddress(host)) throw shortError("invalid_url");
  return url;
}

export async function assertSafeFetchTarget(url, { resolveFn } = {}) {
  const parsed = url instanceof URL ? url : parseHttpsUrl(url);
  const host = hostnameFromUrl(parsed);
  if (isIP(host)) {
    if (isBlockedAddress(host)) throw shortError("fetch_blocked_address");
    return parsed;
  }
  const resolver = typeof resolveFn === "function"
    ? resolveFn
    : async (hostname) => {
      const records = await dns.lookup(hostname, { all: true, verbatim: true });
      return records.map((record) => record.address);
    };
  let addresses;
  try {
    addresses = await resolver(host);
  } catch {
    throw shortError("fetch_blocked_address");
  }
  const list = Array.isArray(addresses) ? addresses : [addresses];
  if (list.length === 0 || list.some((address) => isBlockedAddress(address) || !isIP(String(address).replace(/^\[|\]$/g, "")))) {
    throw shortError("fetch_blocked_address");
  }
  return parsed;
}

const COUNTRY_RULES = Object.freeze([
  { code: "HK", tokens: ["hk", "hong kong", "hongkong", "香港", "🇭🇰"] },
  { code: "JP", tokens: ["jp", "japan", "日本", "东京", "東京", "大阪", "🇯🇵"] },
  { code: "US", tokens: ["us", "usa", "united states", "america", "美国", "美國", "洛杉矶", "纽约", "🇺🇸"] },
  { code: "SG", tokens: ["sg", "singapore", "新加坡", "🇸🇬"] },
  { code: "TW", tokens: ["tw", "taiwan", "台湾", "台灣", "台北", "🇹🇼"] },
  { code: "KR", tokens: ["kr", "korea", "韩国", "韓國", "首尔", "首爾", "🇰🇷"] },
  { code: "GB", tokens: ["gb", "uk", "britain", "england", "英国", "英國", "伦敦", "🇬🇧"] },
  { code: "DE", tokens: ["de", "germany", "德国", "德國", "frankfurt", "🇩🇪"] },
  { code: "AU", tokens: ["au", "australia", "澳大利亚", "澳洲", "🇦🇺"] },
  { code: "CA", tokens: ["ca", "canada", "加拿大", "🇨🇦"] }
]);

function tokenBoundaryMatch(haystack, token) {
  if (/^\p{Extended_Pictographic}/u.test(token) || /[\u4e00-\u9fff]/.test(token)) {
    return haystack.includes(token);
  }
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, "i").test(haystack);
}

export function detectCountryCode(displayName, regionOverride = null) {
  const override = text(regionOverride).toUpperCase();
  if (override) {
    if (/^[A-Z]{2}$/.test(override)) return override;
    const fromOverride = detectCountryCode(override, null);
    if (fromOverride !== "OTHER") return fromOverride;
    return "OTHER";
  }
  const haystack = text(displayName);
  if (!haystack) return "OTHER";
  for (const rule of COUNTRY_RULES) {
    if (rule.tokens.some((token) => tokenBoundaryMatch(haystack, token))) {
      return rule.code;
    }
  }
  return "OTHER";
}

function parseHostPort(value) {
  const raw = text(value);
  if (!raw) return null;
  if (raw.startsWith("[")) {
    const end = raw.indexOf("]");
    if (end < 0) return null;
    const host = raw.slice(1, end);
    const portText = raw.slice(end + 1);
    if (!portText.startsWith(":")) return null;
    const port = Number(portText.slice(1));
    if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
    return { host, port };
  }
  const colon = raw.lastIndexOf(":");
  if (colon <= 0) return null;
  const host = raw.slice(0, colon);
  const port = Number(raw.slice(colon + 1));
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) return null;
  return { host, port };
}

function splitOnce(value, delimiter) {
  const index = String(value).indexOf(delimiter);
  if (index < 0) return [String(value), ""];
  return [String(value).slice(0, index), String(value).slice(index + delimiter.length)];
}

function queryMap(search) {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const out = {};
  for (const [key, value] of params.entries()) {
    out[key.toLowerCase()] = value;
  }
  return out;
}

function fragmentName(raw) {
  const index = raw.indexOf("#");
  if (index < 0) return "";
  return decodeUriComponentSafe(raw.slice(index + 1)).trim();
}

function withoutFragment(raw) {
  const index = raw.indexOf("#");
  return index < 0 ? raw : raw.slice(0, index);
}

function parseSsLink(raw) {
  const name = fragmentName(raw);
  const body = withoutFragment(raw).slice("ss://".length);
  const qIndex = body.indexOf("?");
  const main = qIndex >= 0 ? body.slice(0, qIndex) : body;
  let method = "";
  let password = "";
  let hostPort = null;
  if (main.includes("@")) {
    const at = main.lastIndexOf("@");
    const userinfo = decodeUriComponentSafe(main.slice(0, at));
    const decodedUser = decodeBase64Text(userinfo) || userinfo;
    [method, password] = splitOnce(decodedUser, ":");
    hostPort = parseHostPort(main.slice(at + 1));
  } else {
    const decoded = decodeBase64Text(main);
    if (!decoded || !decoded.includes("@")) return null;
    const at = decoded.lastIndexOf("@");
    [method, password] = splitOnce(decoded.slice(0, at), ":");
    hostPort = parseHostPort(decoded.slice(at + 1));
  }
  if (!method || !password || !hostPort) return null;
  return {
    protocol: "ss",
    host: hostPort.host,
    port: hostPort.port,
    method,
    cipher: method,
    password,
    name: name || hostPort.host
  };
}

function parseVlessLink(raw) {
  const name = fragmentName(raw);
  let url;
  try {
    url = new URL(withoutFragment(raw));
  } catch {
    return null;
  }
  if (url.protocol !== "vless:") return null;
  const uuid = decodeUriComponentSafe(url.username);
  const host = hostnameFromUrl(url);
  const port = Number(url.port);
  if (!uuid || !host || !Number.isInteger(port) || port < 1 || port > 65535) return null;
  const query = queryMap(url.search);
  const security = text(query.security).toLowerCase();
  const node = {
    protocol: "vless",
    host,
    port,
    uuid,
    udp: true,
    name: name || host
  };
  const network = text(query.type || query.network);
  if (network) node.network = network;
  const flow = text(query.flow);
  if (flow) node.flow = flow;
  const sni = text(query.sni || query.servername);
  if (sni) node.serverName = sni;
  const packetEncoding = text(query["packet-encoding"] || query.packetencoding);
  if (packetEncoding) node.packetEncoding = packetEncoding;
  const fingerprint = text(query.fp || query.fingerprint);
  if (fingerprint) node.clientFingerprint = fingerprint;
  if (security === "tls" || security === "reality") node.tls = true;
  const publicKey = text(query.pbk || query["public-key"]);
  const shortId = text(query.sid || query["short-id"]);
  if (publicKey || shortId) {
    node.realityOpts = { publicKey, shortId };
  }
  return node;
}

function parseHysteria2Link(raw) {
  const name = fragmentName(raw);
  const normalized = raw.replace(/^hy2:\/\//i, "hysteria2://");
  let url;
  try {
    url = new URL(withoutFragment(normalized));
  } catch {
    return null;
  }
  if (url.protocol !== "hysteria2:") return null;
  const password = decodeUriComponentSafe(url.username || url.password ? `${url.username}${url.password ? `:${url.password}` : ""}` : "");
  const host = hostnameFromUrl(url);
  const port = Number(url.port);
  if (!password || !host || !Number.isInteger(port) || port < 1 || port > 65535) return null;
  const query = queryMap(url.search);
  const node = {
    protocol: "hysteria2",
    host,
    port,
    password,
    name: name || host
  };
  const sni = text(query.sni || query.servername);
  if (sni) node.sni = sni;
  const obfs = text(query.obfs);
  if (obfs) node.obfs = obfs;
  const obfsPassword = text(query["obfs-password"] || query.obfspassword);
  if (obfsPassword) node.obfsPassword = obfsPassword;
  const alpn = text(query.alpn);
  if (alpn) node.alpn = alpn.split(",").map((item) => item.trim()).filter(Boolean);
  return node;
}

function parseTuicLink(raw) {
  const name = fragmentName(raw);
  let url;
  try {
    url = new URL(withoutFragment(raw));
  } catch {
    return null;
  }
  if (url.protocol !== "tuic:") return null;
  const user = decodeUriComponentSafe(url.username);
  const passFromUrl = decodeUriComponentSafe(url.password);
  const host = hostnameFromUrl(url);
  const port = Number(url.port);
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) return null;
  const query = queryMap(url.search);
  let uuid = user;
  let password = passFromUrl || text(query.password);
  if (user.includes(":")) {
    [uuid, password] = splitOnce(user, ":");
  }
  if (!uuid || !password) return null;
  const node = {
    protocol: "tuic",
    host,
    port,
    uuid,
    password,
    name: name || host
  };
  const sni = text(query.sni || query.servername);
  if (sni) node.sni = sni;
  const alpn = text(query.alpn);
  if (alpn) node.alpn = alpn.split(",").map((item) => item.trim()).filter(Boolean);
  const congestion = text(query.congestion_control || query["congestion-controller"]);
  if (congestion) node.congestionController = congestion;
  const udpRelay = text(query.udp_relay_mode || query["udp-relay-mode"]);
  if (udpRelay) node.udpRelayMode = udpRelay;
  return node;
}

const PROTOCOL_PARSERS = Object.freeze({
  "ss://": parseSsLink,
  "vless://": parseVlessLink,
  "hysteria2://": parseHysteria2Link,
  "hy2://": parseHysteria2Link,
  "tuic://": parseTuicLink
});

const UNSUPPORTED_PREFIXES = [
  "vmess://",
  "trojan://",
  "ssr://",
  "http://",
  "https://",
  "socks://",
  "socks5://",
  "wireguard://"
];

function lineProtocolPrefix(line) {
  const lower = line.toLowerCase();
  for (const prefix of Object.keys(PROTOCOL_PARSERS)) {
    if (lower.startsWith(prefix)) return prefix;
  }
  return null;
}

export function fingerprintNode(node) {
  const canonical = {
    protocol: node.protocol,
    host: String(node.host || "").toLowerCase(),
    port: Number(node.port),
    method: node.method || node.cipher || "",
    uuid: node.uuid || "",
    password: node.password || "",
    network: node.network || "",
    flow: node.flow || "",
    sni: node.sni || node.serverName || "",
    realityPublicKey: node.realityOpts?.publicKey || "",
    realityShortId: node.realityOpts?.shortId || ""
  };
  return createHash("sha256").update(JSON.stringify(canonical), "utf8").digest("hex");
}

export function decodeSubscriptionBody(raw) {
  const source = stripBom(String(raw ?? "")).trim();
  if (!source) return { text: "", encoding: "empty" };
  const lines = source.split(/\r?\n/);
  if (lines.some((line) => lineProtocolPrefix(text(line)))) {
    return { text: source, encoding: "plain" };
  }
  const decoded = decodeBase64Text(source);
  if (decoded) return { text: decoded, encoding: "base64" };
  return { text: source, encoding: "plain" };
}

export function parseSubscriptionNodes(raw, { regionOverride = null } = {}) {
  const decoded = decodeSubscriptionBody(raw);
  const counts = {
    valid: 0,
    unsupported: 0,
    malformed: 0,
    skippedBlank: 0
  };
  const nodes = [];
  const seen = new Set();
  for (const originalLine of decoded.text.split(/\r?\n/)) {
    const line = text(originalLine);
    if (!line) {
      counts.skippedBlank += 1;
      continue;
    }
    const prefix = lineProtocolPrefix(line);
    if (!prefix) {
      const lower = line.toLowerCase();
      if (UNSUPPORTED_PREFIXES.some((item) => lower.startsWith(item))) {
        counts.unsupported += 1;
      } else {
        counts.malformed += 1;
      }
      continue;
    }
    let node;
    try {
      node = PROTOCOL_PARSERS[prefix](line);
    } catch {
      node = null;
    }
    if (!node) {
      counts.malformed += 1;
      continue;
    }
    const countryCode = detectCountryCode(node.name, regionOverride);
    const fingerprint = fingerprintNode(node);
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    counts.valid += 1;
    nodes.push({
      ...node,
      fingerprint,
      countryCode,
      region: countryCode,
      displayName: node.name
    });
  }
  return {
    encoding: decoded.encoding,
    counts,
    nodes
  };
}

async function readCappedBody(response, maxBytes) {
  const declared = Number(response.headers?.get?.("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw shortError("fetch_oversize");
  }
  if (!response.body || typeof response.body.getReader !== "function") {
    const buf = Buffer.from(await response.arrayBuffer());
    if (buf.length > maxBytes) throw shortError("fetch_oversize");
    return buf;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      try {
        await reader.cancel();
      } catch {
        // Ignore cancel failure; the oversize code is the recorded outcome.
      }
      throw shortError("fetch_oversize");
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

function resolveRedirect(currentUrl, locationHeader) {
  const location = text(locationHeader);
  if (!location) throw shortError("fetch_failed");
  try {
    return new URL(location, currentUrl);
  } catch {
    throw shortError("fetch_failed");
  }
}

export async function fetchAndSplitSubscription(targetUrl, options = {}) {
  const fetchFn = options.fetchFn || globalThis.fetch;
  const resolveFn = options.resolveFn;
  const timeoutMs = Number.isInteger(options.timeoutMs) ? options.timeoutMs : THIRD_PARTY_FETCH_TIMEOUT_MS;
  const maxBytes = Number.isInteger(options.maxBytes) ? options.maxBytes : THIRD_PARTY_MAX_BODY_BYTES;
  const maxRedirects = Number.isInteger(options.maxRedirects) ? options.maxRedirects : THIRD_PARTY_MAX_REDIRECTS;
  if (typeof fetchFn !== "function") throw shortError("fetch_failed");

  let current = parseHttpsUrl(targetUrl);
  await assertSafeFetchTarget(current, { resolveFn });
  let hops = 0;
  while (true) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetchFn(current, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: { accept: "text/plain, */*" }
      });
    } catch (error) {
      if (error?.name === "AbortError" || error?.code === "ABORT_ERR") {
        throw shortError("fetch_timeout");
      }
      throw shortError("fetch_failed");
    } finally {
      clearTimeout(timer);
    }
    const status = Number(response?.status);
    if (status >= 300 && status < 400) {
      hops += 1;
      if (hops > maxRedirects) throw shortError("fetch_redirect_limit");
      current = resolveRedirect(current, response.headers?.get?.("location"));
      if (current.protocol !== "https:") throw shortError("fetch_blocked_address");
      if (current.username || current.password) throw shortError("fetch_blocked_address");
      await assertSafeFetchTarget(current, { resolveFn });
      continue;
    }
    if (!Number.isInteger(status) || status < 200 || status >= 300) {
      throw shortError("fetch_failed");
    }
    const body = await readCappedBody(response, maxBytes);
    const parsed = parseSubscriptionNodes(body.toString("utf8"), {
      regionOverride: options.regionOverride
    });
    return parsed;
  }
}
