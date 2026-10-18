// Relay-side config for the residential traffic pack.
// - Only listed residential users are routed to the residential pool; every
//   other user keeps the normal default outbound.
// - Residential users never fall back to direct: if no pool rule matches they
//   hit `resi-block`.
// - Per-user and per-outbound-tag counters are enabled for metering and for
//   reconciliation against the upstream panel.
// Users whose quota is exhausted (or whose period is unpaid) are simply not
// rendered, which is how the credential is disabled on the relay.
import { assertPoolSupportedBy } from "./residential-relay-pool.mjs";

export const RESIDENTIAL_BALANCER_TAG = "resi-us-pool";
export const RESIDENTIAL_BLOCK_TAG = "resi-block";
export const RESIDENTIAL_DEFAULT_TAG = "direct";
const REF_RE = /^[A-Za-z0-9._:-]{1,128}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function checkUsers(users, field) {
  if (!Array.isArray(users) || users.length === 0) throw fail("residential_relay_users_empty");
  const refs = new Set(), secrets = new Set();
  for (const user of users) {
    if (!REF_RE.test(user?.edgeCredentialRef || "")) throw fail("residential_relay_user_invalid");
    const secret = user[field];
    if (typeof secret !== "string" || (field === "uuid" ? !UUID_RE.test(secret) : secret.length < 16)) throw fail("residential_relay_user_invalid");
    if (refs.has(user.edgeCredentialRef) || secrets.has(secret)) throw fail("residential_relay_user_duplicate");
    refs.add(user.edgeCredentialRef); secrets.add(secret);
  }
  return [...refs];
}

function checkPort(value, code) {
  if (!Number.isInteger(value) || value < 1 || value > 65535) throw fail(code);
  return value;
}

function xrayOutbound(entry) {
  const base = { tag: entry.tag, protocol: entry.protocol === "ss" ? "shadowsocks" : entry.protocol };
  if (entry.protocol === "ss") return { ...base, settings: { servers: [{ address: entry.host, port: entry.port, method: entry.method, password: entry.password }] } };
  if (entry.protocol === "vless") {
    const out = { ...base, settings: { vnext: [{ address: entry.host, port: entry.port, users: [{ id: entry.uuid, encryption: "none", ...(entry.flow ? { flow: entry.flow } : {}) }] }] } };
    const stream = { network: entry.network || "tcp" };
    if (entry.reality) stream.security = "reality", stream.realitySettings = { serverName: entry.serverName || "", publicKey: entry.reality.publicKey, shortId: entry.reality.shortId, fingerprint: entry.clientFingerprint || "chrome" };
    else if (entry.tls) stream.security = "tls", stream.tlsSettings = { serverName: entry.serverName || entry.host };
    out.streamSettings = stream;
    return out;
  }
  const server = { address: entry.host, port: entry.port };
  if (entry.username) server.users = [{ user: entry.username, pass: entry.password }];
  return { ...base, settings: { servers: [server] } };
}

function normalizeGroups(groups, field, target) {
  if (!Array.isArray(groups) || groups.length === 0) throw fail("residential_relay_groups_empty");
  const seenTags = new Set(), seenRefs = new Set(), seenSecrets = new Set(), seenGroups = new Set();
  return groups.map((group) => {
    if (!/^[a-z0-9-]{1,32}$/.test(group?.groupId || "") || seenGroups.has(group.groupId)) throw fail("residential_relay_group_invalid");
    seenGroups.add(group.groupId);
    assertPoolSupportedBy(group.pool, target);
    if (!group.pool.length) throw fail("residential_pool_empty");
    for (const entry of group.pool) {
      if (seenTags.has(entry.tag)) throw fail("residential_pool_tag_duplicate");
      seenTags.add(entry.tag);
    }
    const refs = checkUsers(group.users, field);
    for (const user of group.users) {
      if (seenRefs.has(user.edgeCredentialRef) || seenSecrets.has(user[field])) throw fail("residential_relay_user_duplicate");
      seenRefs.add(user.edgeCredentialRef); seenSecrets.add(user[field]);
    }
    return { groupId: group.groupId, balancerTag: `${RESIDENTIAL_BALANCER_TAG}-${group.groupId}`, refs, users: group.users, pool: group.pool };
  });
}

// Xray relay with a VLESS inbound. Each group (one per SKU) binds only its own
// buyers to its own bound upstream outbounds.
export function buildResidentialXrayRelayConfig({ groups, inbound, apiPort = 10085, balancerStrategy = "random" }) {
  const normalized = normalizeGroups(groups, "uuid", "xray");
  checkPort(inbound?.port, "residential_relay_inbound_invalid");
  checkPort(apiPort, "residential_relay_api_port_invalid");
  if (!["random", "roundRobin"].includes(balancerStrategy)) throw fail("residential_relay_balancer_invalid");
  const allRefs = normalized.flatMap(group => group.refs);
  const allUsers = normalized.flatMap(group => group.users);
  return {
    log: { loglevel: "warning", access: "none" },
    api: { tag: "api", services: ["StatsService"] },
    stats: {},
    policy: {
      levels: { 0: { statsUserUplink: true, statsUserDownlink: true } },
      system: { statsOutboundUplink: true, statsOutboundDownlink: true }
    },
    inbounds: [
      { tag: "api-in", listen: "127.0.0.1", port: apiPort, protocol: "dokodemo-door", settings: { address: "127.0.0.1" } },
      {
        tag: "resi-in", listen: inbound.listen || "0.0.0.0", port: inbound.port, protocol: "vless",
        settings: { clients: allUsers.map(user => ({ id: user.uuid, email: user.edgeCredentialRef, level: 0 })), decryption: "none" },
        streamSettings: inbound.streamSettings || { network: "tcp" },
        sniffing: { enabled: true, destOverride: ["http", "tls", "quic"], routeOnly: true }
      }
    ],
    outbounds: [
      { tag: RESIDENTIAL_DEFAULT_TAG, protocol: "freedom" },
      ...normalized.flatMap(group => group.pool.map(xrayOutbound)),
      { tag: RESIDENTIAL_BLOCK_TAG, protocol: "blackhole" }
    ],
    routing: {
      domainStrategy: "AsIs",
      balancers: normalized.map(group => ({ tag: group.balancerTag, selector: group.pool.map(entry => entry.tag), strategy: { type: balancerStrategy } })),
      rules: [
        { type: "field", inboundTag: ["api-in"], outboundTag: "api" },
        { type: "field", user: allRefs, ip: ["geoip:private"], outboundTag: RESIDENTIAL_BLOCK_TAG },
        ...normalized.map(group => ({ type: "field", user: group.refs, balancerTag: group.balancerTag })),
        { type: "field", inboundTag: ["resi-in"], outboundTag: RESIDENTIAL_BLOCK_TAG }
      ]
    }
  };
}

function singBoxOutbound(entry) {
  const base = { tag: entry.tag, server: entry.host, server_port: entry.port };
  switch (entry.protocol) {
    case "ss": return { type: "shadowsocks", ...base, method: entry.method, password: entry.password };
    case "vless": {
      const out = { type: "vless", ...base, uuid: entry.uuid, ...(entry.flow ? { flow: entry.flow } : {}) };
      if (entry.reality || entry.tls) out.tls = { enabled: true, server_name: entry.serverName || entry.host,
        ...(entry.reality ? { reality: { enabled: true, public_key: entry.reality.publicKey, short_id: entry.reality.shortId } } : {}) };
      return out;
    }
    case "hysteria2": return { type: "hysteria2", ...base, password: entry.password, tls: { enabled: true, server_name: entry.sni || entry.host } };
    case "tuic": return { type: "tuic", ...base, uuid: entry.uuid, password: entry.password, tls: { enabled: true, server_name: entry.sni || entry.host } };
    default: return { type: entry.protocol, ...base, ...(entry.username ? { username: entry.username, password: entry.password } : {}) };
  }
}

// sing-box relay with a Hysteria2 inbound (Hysteria2's own server cannot route
// per user). Each group binds only its own buyers to its own upstreams.
export function buildResidentialSingBoxHy2RelayConfig({ groups, inbound, apiPort = 10086 }) {
  const normalized = normalizeGroups(groups, "password", "sing-box");
  checkPort(inbound?.port, "residential_relay_inbound_invalid");
  checkPort(apiPort, "residential_relay_api_port_invalid");
  if (!inbound.tls || typeof inbound.tls !== "object") throw fail("residential_relay_inbound_invalid");
  const allRefs = normalized.flatMap(group => group.refs);
  const allUsers = normalized.flatMap(group => group.users);
  const poolTags = normalized.flatMap(group => group.pool.map(entry => entry.tag));
  return {
    log: { level: "warn" },
    inbounds: [{ type: "hysteria2", tag: "resi-in", listen: inbound.listen || "::", listen_port: inbound.port,
      users: allUsers.map(user => ({ name: user.edgeCredentialRef, password: user.password })), tls: inbound.tls }],
    outbounds: [
      { type: "direct", tag: RESIDENTIAL_DEFAULT_TAG },
      ...normalized.flatMap(group => group.pool.map(singBoxOutbound)),
      ...normalized.map(group => ({ type: "urltest", tag: group.balancerTag, outbounds: group.pool.map(entry => entry.tag) })),
      { type: "block", tag: RESIDENTIAL_BLOCK_TAG }
    ],
    route: {
      rules: [
        { auth_user: allRefs, ip_is_private: true, outbound: RESIDENTIAL_BLOCK_TAG },
        ...normalized.map(group => ({ auth_user: group.refs, outbound: group.balancerTag })),
        { inbound: ["resi-in"], outbound: RESIDENTIAL_BLOCK_TAG }
      ],
      final: RESIDENTIAL_DEFAULT_TAG
    },
    experimental: { v2ray_api: { listen: `127.0.0.1:${apiPort}`, stats: { enabled: true, users: allRefs, outbounds: poolTags } } }
  };
}

// What a buyer receives: relay endpoint + own credential. Never pool details.
export function residentialClientEndpoint({ relay, user, protocol }) {
  if (!relay?.host || !Number.isInteger(relay?.port)) throw fail("residential_relay_endpoint_invalid");
  if (protocol === "vless") return { protocol, server: relay.host, port: relay.port, uuid: user.uuid, ...(relay.client || {}) };
  if (protocol === "hysteria2") return { protocol, server: relay.host, port: relay.port, password: user.password, ...(relay.client || {}) };
  throw fail("residential_relay_endpoint_invalid");
}
