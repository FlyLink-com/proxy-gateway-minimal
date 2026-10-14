// Residential outbound pool for the relay. Sources: nodes normalized by the
// third-party URI/YAML import (#762/#771) or static config entries. Upstream
// node details only ever land in the relay config; never in client output.

const TAG_PREFIX = "resi-us-";
const TAG_RE = /^[a-z0-9-]{1,48}$/;
const XRAY_PROTOCOLS = new Set(["socks", "http", "ss", "vless"]);
const SINGBOX_PROTOCOLS = new Set(["socks", "http", "ss", "vless", "hysteria2", "tuic"]);
export const RESIDENTIAL_POOL_MAX = 64;

function fail(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function text(value) { return typeof value === "string" ? value.trim() : ""; }

function port(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 65535) throw fail("residential_pool_entry_invalid");
  return n;
}

export function normalizeResidentialPoolEntry(raw, index) {
  if (!raw || typeof raw !== "object") throw fail("residential_pool_entry_invalid");
  const protocol = text(raw.protocol).toLowerCase() === "shadowsocks" ? "ss" : text(raw.protocol).toLowerCase();
  if (!SINGBOX_PROTOCOLS.has(protocol)) throw fail("residential_pool_protocol_unsupported");
  const host = text(raw.host || raw.server);
  if (!host || /\s/.test(host)) throw fail("residential_pool_entry_invalid");
  const suffix = text(raw.tag) || `${index}`;
  const tag = suffix.startsWith(TAG_PREFIX) ? suffix : `${TAG_PREFIX}${suffix}`;
  if (!TAG_RE.test(tag)) throw fail("residential_pool_tag_invalid");
  const entry = { tag, protocol, host, port: port(raw.port) };
  if (protocol === "ss") {
    entry.method = text(raw.method || raw.cipher);
    entry.password = text(raw.password);
    if (!entry.method || !entry.password) throw fail("residential_pool_entry_invalid");
  } else if (protocol === "vless") {
    entry.uuid = text(raw.uuid);
    if (!entry.uuid) throw fail("residential_pool_entry_invalid");
    for (const key of ["flow", "network", "serverName", "clientFingerprint"]) if (text(raw[key])) entry[key] = text(raw[key]);
    if (raw.tls === true) entry.tls = true;
    if (raw.realityOpts && text(raw.realityOpts.publicKey)) entry.reality = { publicKey: text(raw.realityOpts.publicKey), shortId: text(raw.realityOpts.shortId) };
  } else if (protocol === "hysteria2" || protocol === "tuic") {
    entry.password = text(raw.password);
    if (!entry.password) throw fail("residential_pool_entry_invalid");
    if (protocol === "tuic") { entry.uuid = text(raw.uuid); if (!entry.uuid) throw fail("residential_pool_entry_invalid"); }
    if (text(raw.sni)) entry.sni = text(raw.sni);
  } else {
    const username = text(raw.username), password = text(raw.password);
    if (Boolean(username) !== Boolean(password)) throw fail("residential_pool_entry_invalid");
    if (username) { entry.username = username; entry.password = password; }
  }
  return entry;
}

// `nodes`: third-party import output (`{ nodes }` from parseThirdPartyYaml /
// parseSubscriptionNodes) and/or static entries. Only explicitly selected
// imports belong here; the caller filters (e.g. countryCode === "US").
export function buildResidentialPool({ importedNodes = [], staticEntries = [], requireCountry = "US" } = {}) {
  const imported = importedNodes.filter(node => !requireCountry || node?.countryCode === requireCountry)
    .map((node, i) => ({ ...node, tag: node.tag || `imp-${i}` }));
  const all = [...imported, ...staticEntries.map((entry, i) => ({ ...entry, tag: entry.tag || `static-${i}` }))];
  if (!all.length) throw fail("residential_pool_empty");
  if (all.length > RESIDENTIAL_POOL_MAX) throw fail("residential_pool_limit");
  const pool = all.map(normalizeResidentialPoolEntry);
  const tags = new Set(pool.map(entry => entry.tag));
  if (tags.size !== pool.length) throw fail("residential_pool_tag_duplicate");
  if (tags.has("resi-us-pool")) throw fail("residential_pool_tag_reserved");
  return Object.freeze(pool.map(entry => Object.freeze(entry)));
}

export function assertPoolSupportedBy(pool, target) {
  const allowed = target === "xray" ? XRAY_PROTOCOLS : SINGBOX_PROTOCOLS;
  if (pool.some(entry => !allowed.has(entry.protocol))) throw fail(`residential_pool_protocol_unsupported_${target}`);
}
