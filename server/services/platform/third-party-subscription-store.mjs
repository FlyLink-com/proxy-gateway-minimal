import { randomBytes } from "node:crypto";
import { isAbsolute } from "node:path";
import Database from "better-sqlite3";

import {
  inspectThirdPartySubscriptionSchema
} from "./third-party-subscription-migrations.mjs";
import { parseThirdPartyYaml } from "./third-party-subscription-yaml.mjs";
import { createThirdPartyNodeManagement } from "./third-party-subscription-node-management.mjs";
import { safeThirdPartyDisplayLabel } from "./third-party-subscription-render.mjs";

export const THIRD_PARTY_PLAN_IDS = Object.freeze([
  "monthly_basic",
  "monthly_plus",
  "yearly"
]);
export const THIRD_PARTY_PROTECTED_PREFIX = "v2:aes-256-gcm:";

const PLAN_ID_SET = new Set(THIRD_PARTY_PLAN_IDS);
const MAX_INLINE_YAML_BYTES = 64 * 1024;
const MAX_INLINE_NODES = 1024;
const INLINE_PROTOCOLS = new Set(["ss", "vless", "hysteria2", "tuic"]);
const INLINE_INPUT_KEYS = new Set(["name", "yamlContent", "regionOverride", "tiers", "enabled"]);
const PREVIEW_INPUT_KEYS = new Set(["yamlContent", "regionOverride"]);
const DEDUP_KEY_PATTERN = /^[a-f0-9]{64}$/;
const COUNTRY_PATTERN = /^[A-Z]{2}$/;

function storeError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function text(value) {
  return String(value ?? "").trim();
}

function nowIso(nowFn) {
  const value = typeof nowFn === "function" ? nowFn() : new Date();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw storeError("invalid_now");
  return date.toISOString();
}

function newId(prefix) {
  return `${prefix}${randomBytes(16).toString("hex")}`;
}

function asBoolean(value, fallback = true) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "boolean") return value;
  if (value === 0 || value === "0" || value === "false") return false;
  if (value === 1 || value === "1" || value === "true") return true;
  throw storeError("invalid_enabled");
}

function normalizeTiers(value) {
  if (!Array.isArray(value) || value.length === 0) throw storeError("invalid_tiers");
  const unique = [];
  for (const item of value) {
    const planId = text(item);
    if (!PLAN_ID_SET.has(planId)) throw storeError("invalid_tiers");
    if (!unique.includes(planId)) unique.push(planId);
  }
  if (unique.length === 0) throw storeError("invalid_tiers");
  return unique;
}

function normalizeName(value) {
  const name = text(value);
  if (!name || name.length > 128) throw storeError("invalid_name");
  if (/[\u0000-\u001f\u007f]/.test(name)) throw storeError("invalid_name");
  return name;
}

function normalizeRegionOverride(value, { required = false } = {}) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const normalized = text(value).toUpperCase();
  if (!normalized) return null;
  if (normalized.length > 32) throw storeError("invalid_region");
  if (required && !normalized) throw storeError("invalid_region");
  return normalized;
}

function protectRequired(protector, plaintext) {
  if (!protector || typeof protector.protect !== "function") {
    throw storeError("third_party_unavailable");
  }
  const wrapped = protector.protect(plaintext);
  if (typeof wrapped !== "string" || !wrapped.startsWith(THIRD_PARTY_PROTECTED_PREFIX)) {
    throw storeError("protected_value_invalid");
  }
  return wrapped;
}

function unprotectRequired(protector, wrapped) {
  if (!protector || typeof protector.unprotect !== "function") {
    throw storeError("third_party_unavailable");
  }
  const raw = String(wrapped || "");
  if (!raw.startsWith(THIRD_PARTY_PROTECTED_PREFIX)) {
    throw storeError("protected_value_invalid");
  }
  const plain = protector.unprotect(raw);
  if (plain == null || typeof plain !== "string" || plain.length === 0) {
    throw storeError("protected_value_invalid");
  }
  return plain;
}

function inlineDescriptorJson() {
  return JSON.stringify({ version: 1, kind: "inline-yaml" });
}

function classifyDescriptor(plain) {
  if (typeof plain !== "string") return "unknown";
  const trimmed = plain.trim();
  if (trimmed.startsWith("https://") || trimmed.startsWith("http://")) return "remote";
  try {
    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return "unknown";
    const keys = Object.keys(parsed);
    if (keys.length === 2 && parsed.version === 1 && parsed.kind === "inline-yaml") {
      return "inline-yaml";
    }
  } catch {
    return "unknown";
  }
  return "unknown";
}

function assertExactOwnKeys(value, allowed) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw storeError("invalid_input");
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw storeError("invalid_input");
  }
}

function assertInlineYaml(value) {
  if (typeof value !== "string" || value.length === 0) throw storeError("invalid_yaml");
  if (Buffer.byteLength(value, "utf8") > MAX_INLINE_YAML_BYTES) throw storeError("invalid_yaml");
}

function parseYamlOrThrow(yamlContent, regionOverride) {
  let parsed;
  try {
    parsed = parseThirdPartyYaml(yamlContent, { regionOverride });
  } catch (error) {
    const code = error?.code === "parse_no_valid_nodes" ? "parse_no_valid_nodes" : "invalid_yaml";
    throw storeError(code);
  }
  if (!parsed || parsed.encoding !== "yaml" || !Array.isArray(parsed.nodes)) {
    throw storeError("invalid_yaml");
  }
  if (parsed.nodes.length > MAX_INLINE_NODES) throw storeError("invalid_yaml");
  if (parsed.nodes.length === 0) throw storeError("parse_no_valid_nodes");
  return parsed;
}

function dedupKeyOf(node) {
  const key = text(node?.dedupKey).toLowerCase();
  if (!DEDUP_KEY_PATTERN.test(key)) throw storeError("invalid_node");
  return key;
}

function copyLabel(value, max, { required = false } = {}) {
  if (value === undefined || value === null || value === "") {
    if (required) throw storeError("invalid_node");
    return undefined;
  }
  if (typeof value !== "string") throw storeError("invalid_node");
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max || /[\u0000-\u001f\u007f]/.test(trimmed)) {
    throw storeError("invalid_node");
  }
  return trimmed;
}

function optionalLabel(value, max) {
  if (value === undefined || value === null || value === "") return undefined;
  return copyLabel(value, max, { required: true });
}

function copySecret(value, max) {
  if (typeof value !== "string" || value.length < 1 || value.length > max || value.includes("\u0000")) {
    throw storeError("invalid_node");
  }
  return value;
}

function optionalSecret(value, max) {
  if (value === undefined || value === null || value === "") return undefined;
  return copySecret(value, max);
}

function optionalBool(value) {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw storeError("invalid_node");
  return value;
}

function optionalStringList(value) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 8) throw storeError("invalid_node");
  return value.map((item) => copyLabel(item, 255, { required: true }));
}

function copyHost(value) {
  if (typeof value !== "string") throw storeError("invalid_node");
  const host = value.trim();
  if (!host || host.length > 255 || /[\s\u0000-\u001f\u007f]/.test(host) || host.includes("://")) {
    throw storeError("invalid_node");
  }
  return host;
}

function copyPort(value) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 65535) {
    throw storeError("invalid_node");
  }
  return value;
}

function normalizeCountry(value) {
  if (typeof value !== "string") throw storeError("invalid_node");
  const country = value.trim().toUpperCase();
  if (country === "OTHER" || COUNTRY_PATTERN.test(country)) return country;
  throw storeError("invalid_node");
}

function assignField(target, key, value) {
  if (value !== undefined) target[key] = value;
}

function copyCertPin(node) {
  if (node.fingerprint === undefined || node.fingerprint === null || node.fingerprint === "") return undefined;
  if (typeof node.fingerprint !== "string") throw storeError("invalid_node");
  return copyLabel(node.fingerprint, 128, { required: true });
}

function copyReality(value) {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw storeError("invalid_node");
  const publicKey = optionalLabel(value.publicKey, 256);
  const shortId = optionalLabel(value.shortId, 64);
  if (!publicKey && !shortId) return undefined;
  return {
    ...(publicKey ? { publicKey } : {}),
    ...(shortId ? { shortId } : {})
  };
}

function normalizeImportedNode(node) {
  if (!node || typeof node !== "object" || Array.isArray(node)) throw storeError("invalid_node");
  const protocol = text(node.protocol).toLowerCase();
  if (!INLINE_PROTOCOLS.has(protocol)) throw storeError("invalid_node");
  const dedupKey = dedupKeyOf(node);
  const name = copyLabel(node.name, 128, { required: true });
  const displayName = copyLabel(node.displayName, 128, { required: true });
  const countryCode = normalizeCountry(node.countryCode);
  const region = normalizeCountry(node.region);
  const config = {
    protocol,
    host: copyHost(node.host),
    port: copyPort(node.port),
    name,
    displayName,
    countryCode,
    region,
    dedupKey
  };
  assignField(config, "fingerprint", copyCertPin(node));
  if (protocol === "ss") {
    const method = optionalLabel(node.method, 64) || optionalLabel(node.cipher, 64);
    if (!method) throw storeError("invalid_node");
    config.method = method;
    config.cipher = optionalLabel(node.cipher, 64) || method;
    config.password = copySecret(node.password, 4096);
  } else if (protocol === "vless") {
    config.uuid = copyLabel(node.uuid, 128, { required: true });
    assignField(config, "udp", optionalBool(node.udp));
    assignField(config, "network", optionalLabel(node.network, 32));
    assignField(config, "flow", optionalLabel(node.flow, 64));
    assignField(config, "serverName", optionalLabel(node.serverName, 255));
    assignField(config, "packetEncoding", optionalLabel(node.packetEncoding, 64));
    assignField(config, "clientFingerprint", optionalLabel(node.clientFingerprint, 64));
    assignField(config, "tls", optionalBool(node.tls));
    assignField(config, "realityOpts", copyReality(node.realityOpts));
  } else if (protocol === "hysteria2") {
    config.password = copySecret(node.password, 4096);
    assignField(config, "sni", optionalLabel(node.sni, 255));
    assignField(config, "obfs", optionalLabel(node.obfs, 64));
    assignField(config, "obfsPassword", optionalSecret(node.obfsPassword, 4096));
    assignField(config, "alpn", optionalStringList(node.alpn));
  } else {
    config.uuid = copyLabel(node.uuid, 128, { required: true });
    config.password = copySecret(node.password, 4096);
    assignField(config, "sni", optionalLabel(node.sni, 255));
    assignField(config, "alpn", optionalStringList(node.alpn));
    assignField(config, "congestionController", optionalLabel(node.congestionController, 64));
    assignField(config, "udpRelayMode", optionalLabel(node.udpRelayMode, 64));
  }
  return { dedupKey, displayName, countryCode, region, protocol, config };
}

function normalizeImportedNodes(nodes) {
  const normalized = [];
  const seen = new Set();
  for (const node of nodes) {
    const imported = normalizeImportedNode(node);
    if (seen.has(imported.dedupKey)) throw storeError("invalid_node");
    seen.add(imported.dedupKey);
    normalized.push(imported);
  }
  return normalized;
}

function normalizedRegionOrNull(value) {
  const normalized = normalizeRegionOverride(value);
  return normalized === undefined ? null : normalized;
}

function readInlineDocument(yamlContent, regionOverride) {
  const region = normalizedRegionOrNull(regionOverride);
  assertInlineYaml(yamlContent);
  const parsed = parseYamlOrThrow(yamlContent, region);
  return { region, parsed, nodes: normalizeImportedNodes(parsed.nodes) };
}

function publicParseSummary(nodes, parsed) {
  const byProtocol = { ss: 0, vless: 0, hysteria2: 0, tuic: 0 };
  const byCountry = {};
  for (const node of nodes) {
    byProtocol[node.protocol] += 1;
    byCountry[node.countryCode] = (byCountry[node.countryCode] || 0) + 1;
  }
  const counts = {};
  const sourceCounts = parsed.counts && typeof parsed.counts === "object" ? parsed.counts : {};
  for (const key of ["valid", "unsupported", "malformed", "skippedBlank"]) {
    const value = sourceCounts[key];
    if (Number.isInteger(value) && value >= 0 && value <= MAX_INLINE_NODES) counts[key] = value;
  }
  return { encoding: "yaml", counts, byProtocol, byCountry };
}

function protocolServerFromStoredNode(config, row) {
  const server = {
    ...config,
    id: row.id,
    sourceId: row.source_id,
    name: row.display_name,
    countryCode: row.country_code,
    region: row.region,
    protocol: row.protocol,
    thirdParty: true,
    autoEligible: false,
    qualityClass: ""
  };
  // Legacy rows stored the internal dedup key on fingerprint and have no own
  // dedupKey. New inline pins keep dedupKey and may equal that key.
  const legacyDedupFingerprint = !Object.hasOwn(config, "dedupKey")
    && server.fingerprint === row.fingerprint;
  delete server.dedupKey;
  // This encrypted administrative label affects rendering only, never the
  // upstream name, protocol material, identity or accounting attribution.
  delete server.adminDisplayName;
  if (Object.hasOwn(config, "adminDisplayName")) server.thirdPartyDisplayAlias = config.adminDisplayName;
  if (legacyDedupFingerprint) delete server.fingerprint;
  return server;
}

function publicSource(row, tiers, nodeStats, sourceKind = "unknown") {
  return {
    id: row.id,
    name: safeThirdPartyDisplayLabel(row.name) || "未命名来源",
    enabled: row.enabled === 1,
    tiers,
    regionOverride: row.region_override,
    status: row.status,
    lastRefreshAt: row.last_refresh_at,
    lastErrorCode: row.last_error_code,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    nodes: nodeStats,
    sourceKind
  };
}

function nodeStatsFromRows(rows) {
  const byCountry = {};
  let total = 0;
  let active = 0;
  for (const row of rows) {
    total += 1;
    if (row.active === 1) {
      active += 1;
      const country = row.country_code || "OTHER";
      byCountry[country] = (byCountry[country] || 0) + 1;
    }
  }
  return { total, active, byCountry };
}

export function createSqliteThirdPartySubscriptionStore(options = {}) {
  const secretProtector = options.secretProtector;
  const nowFn = options.nowFn || (() => new Date());
  // Phase one ignores options.fetchFn and options.resolveFn. No option re-enables
  // remote import or refresh, including values passed by production state.
  const ownsDatabase = !options.database;
  let database = options.database || null;

  if (!database) {
    const dbPath = options.dbPath;
    if (!dbPath || (dbPath !== ":memory:" && !isAbsolute(dbPath))) {
      return createUnavailableStore();
    }
    try {
      database = dbPath === ":memory:"
        ? new Database(dbPath)
        : new Database(dbPath, { fileMustExist: true });
      database.pragma("journal_mode = WAL");
      database.pragma("busy_timeout = 2000");
      database.pragma("foreign_keys = ON");
    } catch {
      return createUnavailableStore({ close() {} });
    }
  } else {
    try {
      database.pragma("foreign_keys = ON");
    } catch {
      return createUnavailableStore();
    }
  }

  let available = false;
  try {
    available = inspectThirdPartySubscriptionSchema({ database }).ok === true
      && Boolean(secretProtector);
  } catch {
    available = false;
  }

  function close() {
    if (ownsDatabase) {
      try {
        database.close();
      } catch {
        // Best-effort close.
      }
    }
  }

  if (!available) {
    return createUnavailableStore({ close });
  }

  const selectSource = database.prepare("select * from platform_third_party_sources where id = ?");
  const selectSources = database.prepare("select * from platform_third_party_sources order by created_at asc, id asc");
  const selectTiers = database.prepare(
    "select plan_id from platform_third_party_source_tiers where source_id = ? order by plan_id asc"
  );
  const selectNodes = database.prepare(
    "select country_code, active from platform_third_party_nodes where source_id = ?"
  );
  const insertSource = database.prepare(`
    insert into platform_third_party_sources (
      id, name, protected_url, region_override, enabled, status,
      last_refresh_at, last_error_code, created_at, updated_at
    ) values (?, ?, ?, ?, ?, 'pending', null, null, ?, ?)
  `);
  const insertTier = database.prepare(
    "insert into platform_third_party_source_tiers (source_id, plan_id) values (?, ?)"
  );
  const deleteTiers = database.prepare(
    "delete from platform_third_party_source_tiers where source_id = ?"
  );
  const updateSource = database.prepare(`
    update platform_third_party_sources
       set name = ?, region_override = ?, enabled = ?, updated_at = ?
     where id = ?
  `);
  const markReadyStmt = database.prepare(`
    update platform_third_party_sources
       set status = 'ready', last_refresh_at = ?, last_error_code = null, updated_at = ?
     where id = ?
  `);
  const selectNodeByFingerprint = database.prepare(`
    select id from platform_third_party_nodes where source_id = ? and fingerprint = ?
  `);
  const insertNode = database.prepare(`
    insert into platform_third_party_nodes (
      id, source_id, fingerprint, display_name, country_code, region,
      protocol, protected_config, last_seen_at, active
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);
  const updateNode = database.prepare(`
    update platform_third_party_nodes
       set display_name = ?, country_code = ?, region = ?, protocol = ?,
           protected_config = ?, last_seen_at = ?, active = 1
     where id = ?
  `);
  const deactivateMissing = database.prepare(`
    update platform_third_party_nodes
       set active = 0
     where source_id = ? and fingerprint not in (select value from json_each(?))
  `);
  const listActiveForPlan = database.prepare(`
    select n.id, n.source_id, n.fingerprint, n.display_name, n.country_code,
           n.region, n.protocol, n.protected_config
      from platform_third_party_nodes n
      join platform_third_party_sources s on s.id = n.source_id
      join platform_third_party_source_tiers t on t.source_id = n.source_id
     where n.active = 1
       and s.enabled = 1
       and t.plan_id = ?
     order by n.country_code asc, n.fingerprint asc
  `);
  const countActiveByPlan = database.prepare(`
    select t.plan_id as plan_id, count(*) as active_nodes
      from platform_third_party_nodes n
      join platform_third_party_sources s on s.id = n.source_id
      join platform_third_party_source_tiers t on t.source_id = n.source_id
     where n.active = 1 and s.enabled = 1
     group by t.plan_id
  `);

  function requireSource(id) {
    const row = selectSource.get(id);
    if (!row) throw storeError("not_found");
    return row;
  }

  function sourceProjection(row) {
    const tiers = selectTiers.all(row.id).map((item) => item.plan_id);
    const nodes = nodeStatsFromRows(selectNodes.all(row.id));
    let sourceKind = "unknown";
    try {
      sourceKind = classifyDescriptor(unprotectRequired(secretProtector, row.protected_url));
    } catch {
      sourceKind = "unknown";
    }
    return publicSource(row, tiers, nodes, sourceKind);
  }

  function createSource() {
    // Remote URL import is disabled. Do not parse, resolve, protect, or write.
    throw storeError("remote_import_disabled");
  }

  function createInlineSource(input = {}) {
    assertExactOwnKeys(input, INLINE_INPUT_KEYS);
    const normalizedName = normalizeName(input.name);
    const normalizedTiers = normalizeTiers(input.tiers);
    // Omitted enabled stays disabled. enabled true is an explicit publication
    // request from the caller; import does not publish on its own.
    const normalizedEnabled = asBoolean(input.enabled, false);
    const { region, nodes } = readInlineDocument(input.yamlContent, input.regionOverride);
    const id = newId("tpsrc_");
    const at = nowIso(nowFn);
    const tx = database.transaction(() => {
      insertSource.run(
        id,
        normalizedName,
        protectRequired(secretProtector, inlineDescriptorJson()),
        region,
        normalizedEnabled ? 1 : 0,
        at,
        at
      );
      for (const planId of normalizedTiers) insertTier.run(id, planId);
      replaceSourceNodes(id, nodes, at);
    });
    tx();
    return sourceProjection(requireSource(id));
  }

  function previewInlineYaml(input = {}) {
    assertExactOwnKeys(input, PREVIEW_INPUT_KEYS);
    const { parsed, nodes } = readInlineDocument(input.yamlContent, input.regionOverride);
    return publicParseSummary(nodes, parsed);
  }

  function patchSource(id, patch = {}) {
    const row = requireSource(id);
    if (Object.hasOwn(patch, "regionOverride")) throw storeError("invalid_input");
    const nextName = patch.name === undefined ? row.name : normalizeName(patch.name);
    const nextEnabled = patch.enabled === undefined ? row.enabled === 1 : asBoolean(patch.enabled, row.enabled === 1);
    const nextRegion = patch.regionOverride === undefined
      ? row.region_override
      : normalizeRegionOverride(patch.regionOverride);
    const nextTiers = patch.tiers === undefined
      ? selectTiers.all(id).map((item) => item.plan_id)
      : normalizeTiers(patch.tiers);
    const at = nowIso(nowFn);
    const tx = database.transaction(() => {
      updateSource.run(nextName, nextRegion ?? null, nextEnabled ? 1 : 0, at, id);
      if (patch.tiers !== undefined) {
        deleteTiers.run(id);
        for (const planId of nextTiers) insertTier.run(id, planId);
      }
    });
    tx();
    return sourceProjection(requireSource(id));
  }

  function listSources() {
    return selectSources.all().map((row) => sourceProjection(row));
  }

  function getSummary() {
    const sources = listSources();
    const byTier = Object.fromEntries(THIRD_PARTY_PLAN_IDS.map((planId) => [planId, { activeNodes: 0 }]));
    for (const row of countActiveByPlan.all()) {
      if (byTier[row.plan_id]) {
        byTier[row.plan_id] = { activeNodes: Number(row.active_nodes) || 0 };
      }
    }
    return {
      sourceCount: sources.length,
      sources,
      byTier
    };
  }

  function replaceSourceNodes(sourceId, nodes, at) {
    // SQL column name remains fingerprint. The value is the in-memory dedupKey.
    const dedupKeys = nodes.map((node) => dedupKeyOf(node));
    const fingerprintJson = JSON.stringify(dedupKeys);
    const tx = database.transaction(() => {
      for (let index = 0; index < nodes.length; index += 1) {
        const node = nodes[index];
        const dedupKey = dedupKeys[index];
        const protectedConfig = protectRequired(secretProtector, JSON.stringify(node.config));
        const existing = selectNodeByFingerprint.get(sourceId, dedupKey);
        if (existing) {
          updateNode.run(
            node.displayName,
            node.countryCode,
            node.region,
            node.protocol,
            protectedConfig,
            at,
            existing.id
          );
        } else {
          insertNode.run(
            newId("tpnode_"),
            sourceId,
            dedupKey,
            node.displayName,
            node.countryCode,
            node.region,
            node.protocol,
            protectedConfig,
            at
          );
        }
      }
      deactivateMissing.run(sourceId, fingerprintJson);
      markReadyStmt.run(at, at, sourceId);
    });
    tx();
  }

  async function refreshSource(id) {
    const row = requireSource(id);
    void row;
    // Stop before descriptor decrypt, DNS, and fetch. Status and last-good nodes
    // stay unchanged. An inline descriptor is never a fetch URL.
    throw storeError("remote_refresh_disabled");
  }

  function listActiveServersForPlan(planId) {
    if (!PLAN_ID_SET.has(planId)) return [];
    const rows = listActiveForPlan.all(planId);
    const servers = [];
    for (const row of rows) {
      let config;
      try {
        config = JSON.parse(unprotectRequired(secretProtector, row.protected_config));
      } catch {
        continue;
      }
      if (!config || typeof config !== "object") continue;
      servers.push(protocolServerFromStoredNode(config, row));
    }
    return servers;
  }

  const nodeManagement = createThirdPartyNodeManagement({ database, secretProtector, nowFn });
  return {
    available: true,
    ...nodeManagement,
    close,
    createSource,
    createInlineSource,
    previewInlineYaml,
    patchSource,
    listSources,
    getSummary,
    refreshSource,
    listActiveServersForPlan,
    inspect: () => inspectThirdPartySubscriptionSchema({ database })
  };
}

function createUnavailableStore(extra = {}) {
  const unavailable = () => {
    throw storeError("third_party_unavailable");
  };
  return {
    available: false,
    close: extra.close || (() => {}),
    createSource: unavailable,
    createInlineSource: unavailable,
    previewInlineYaml: unavailable,
    patchSource: unavailable,
    listSources: unavailable,
    getSummary: unavailable,
    refreshSource: unavailable,
    listSourceNodes: unavailable,
    saveSourceNodes: unavailable,
    enableSourceNodes: unavailable,
    listActiveServersForPlan: () => [],
    inspect: extra.inspect || (() => ({ ok: false, schemaState: "blocked" }))
  };
}
