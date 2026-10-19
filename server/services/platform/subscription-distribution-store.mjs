import { createHash } from "node:crypto";
import Database from "better-sqlite3";
import { createNodeRegistry } from "../subscriptions/node-registry.mjs";
import { proxyDisplayName, validateProxyDisplayNames } from "../proxy-display-name.mjs";
import { applyThirdPartyCountryFlag, isThirdPartyCountryCode } from "./third-party-node-country.mjs";
import { decorateThirdPartyServers, safeThirdPartyDisplayLabel } from "./third-party-subscription-render.mjs";
import { resolveThirdPartyPlanIdForTenant, THIRD_PARTY_PLAN_IDS } from "./third-party-subscription-tier.mjs";
import {
  inspectSubscriptionDistributionSchema,
  isFullyQualifiedSubscriptionDistributionPath,
  SUBSCRIPTION_DISTRIBUTION_POLICY_TABLE as POLICY,
  SUBSCRIPTION_DISTRIBUTION_ROUTES_TABLE as ROUTES,
  SUBSCRIPTION_DISTRIBUTION_OWNED_TABLE as OWNED
} from "./subscription-distribution-migrations.mjs";

const PLANS = new Set(THIRD_PARTY_PLAN_IDS);
const PROTOCOLS = new Set(["ss", "vless", "hysteria2", "tuic"]);
const RESERVED = new Set(["DIRECT", "REJECT", "REJECT-DROP", "PASS", "COMPATIBLE", "GLOBAL", "AUTO", "STABLE", "WEAK-NETWORK", "FALLBACK"]);
const UNSAFE = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f]/u;
const ERROR_CODES = new Set(["invalid_input", "revision_conflict", "distribution_unavailable", "empty_source", "invalid_node_name", "duplicate_node_name"]);
const failure = code => Object.assign(new Error("Subscription distribution operation rejected"), { code });
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object"
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const digest = value => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
const ownedId = name => `ownnode_${createHash("sha256").update(name).digest("hex").slice(0, 32)}`;

function exactObject(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== keys.length
    || !keys.every(key => Object.hasOwn(value, key))) throw failure("invalid_input");
}
function revision(value) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) throw failure("invalid_input");
}
function alias(value) {
  if (value === null) return null;
  if (typeof value !== "string" || value.length > 128 || UNSAFE.test(value) || /[\ud800-\udfff]/u.test(value)) throw failure("invalid_node_name");
  const label = value.trim();
  if (!label || RESERVED.has(label.toUpperCase())) throw failure("invalid_node_name");
  return label;
}
function country(value) {
  if (value === null) return null;
  if (typeof value !== "string" || value.length !== 2 || !isThirdPartyCountryCode(value)) throw failure("invalid_input");
  return value;
}
function protocol(server) {
  const value = String(server.protocol || server.clashType || server.type || "ss").trim().toLowerCase();
  if (value === "hy2") return "hysteria2";
  if (["shadowsocks", "shadowsocks-libev", "shadowsocks-rust"].includes(value)) return "ss";
  return PROTOCOLS.has(value) ? value : "ss";
}
function countryOf(server) {
  for (const value of [server.countryCode, server.region]) {
    const normalized = String(value || "").toUpperCase();
    if (isThirdPartyCountryCode(normalized)) return normalized;
  }
  return "OTHER";
}
function uniqueLabels(nodes) {
  const used = new Set();
  for (const node of nodes) {
    const label = node.displayName.toUpperCase();
    if (!label || RESERVED.has(label)) throw failure("invalid_node_name");
    if (used.has(label)) throw failure("duplicate_node_name");
    used.add(label);
  }
}

export function createSqliteSubscriptionDistributionStore({ dbPath, database, proxyConfig, thirdPartyStore, controlStore, nowFn = () => new Date() } = {}) {
  const ownsDatabase = !database;
  let db = database;
  let available = false;
  try {
    if (!db) {
      if (!isFullyQualifiedSubscriptionDistributionPath(dbPath)) throw failure("distribution_unavailable");
      db = new Database(dbPath, { fileMustExist: true, timeout: 0 });
    }
    available = inspectSubscriptionDistributionSchema({ database: db }).ok && !!proxyConfig;
  } catch { available = false; }
  function close() { if (ownsDatabase) { try { db?.close(); } catch { /* sanitized unavailable store */ } } }
  function guarded(action) {
    return (...args) => {
      if (!available) throw failure("distribution_unavailable");
      try { return action(...args); } catch (error) { throw failure(ERROR_CODES.has(error?.code) ? error.code : "distribution_unavailable"); }
    };
  }
  if (!available) {
    const unavailable = guarded(() => {});
    return { available: false, close, getSnapshot: unavailable, writeRoutes: unavailable, writeOwned: unavailable, resolveProxyConfig: unavailable };
  }
  const getPolicy = db.prepare(`select * from ${POLICY} order by id`);
  const getRoutes = db.prepare(`select * from ${ROUTES} order by plan_id`);
  const getOwned = db.prepare(`select * from ${OWNED} order by node_id`);
  // Encrypted materials remain in this process and contribute only to the revision.
  const getSources = db.prepare("select * from platform_third_party_sources order by id");
  const getSourceNodes = db.prepare("select * from platform_third_party_nodes order by source_id, id");
  const getTiers = db.prepare("select * from platform_third_party_source_tiers order by source_id, plan_id");
  const getRoute = db.prepare(`select * from ${ROUTES} where plan_id = ?`);
  const selectedMembership = db.prepare(`select n.id from platform_third_party_nodes n
    join platform_third_party_sources s on s.id = n.source_id
    join platform_third_party_source_tiers t on t.source_id = n.source_id
    where n.id in (select value from json_each(?)) and n.active = 1
      and s.enabled = 1 and s.status = 'ready' and t.plan_id = ? order by n.id`);

  function nativeInventory() {
    const current = typeof proxyConfig === "function" ? proxyConfig() : proxyConfig;
    if (!current || !Array.isArray(current.servers)) throw failure("distribution_unavailable");
    const registry = createNodeRegistry({ proxyConfig: current });
    const raw = registry.namedServers();
    const safe = registry.listSafeNodes();
    if (raw.length > 256) throw failure("distribution_unavailable");
    const ids = new Set();
    const items = raw.map((server, index) => {
      const id = ownedId(server.name);
      if (ids.has(id)) throw failure("distribution_unavailable");
      ids.add(id);
      const originalName = safeThirdPartyDisplayLabel(server.name);
      const defaultName = safeThirdPartyDisplayLabel(proxyDisplayName(server, index));
      if (!originalName || !defaultName) throw failure("distribution_unavailable");
      return { id, originalName, defaultName, protocol: protocol(server), countryCode: countryOf(server), available: safe[index].subscriptionEligible, safe: safe[index] };
    });
    return items;
  }
  function ownedProjection(native, policy, rows) {
    const overrides = new Map(rows.map(row => [row.node_id, row]));
    const owned = { enabled: policy.length ? policy[0].owned_enabled === 1 : true,
      items: native.map(({ safe: _safe, ...item }) => {
        const row = overrides.get(item.id);
        const customName = row ? alias(row.custom_name) : null;
        const customCountryCode = row ? country(row.custom_country_code) : null;
        const label = customName ?? item.defaultName;
        return { ...item, customName, displayName: customCountryCode ? safeThirdPartyDisplayLabel(applyThirdPartyCountryFlag(label, customCountryCode)) : label,
          enabled: row ? row.enabled === 1 : true, ...(customCountryCode ? { customCountryCode } : {}) };
      }) };
    uniqueLabels(owned.items);
    return owned;
  }
  function routeProjection(planId, row) {
    if (!row) return { planId, mode: "owned", nodeIds: [] };
    if (typeof row.node_ids_json !== "string" || row.node_ids_json.length > 13000) throw failure("distribution_unavailable");
    const nodeIds = JSON.parse(row.node_ids_json);
    if (!Array.isArray(nodeIds) || nodeIds.length > 256 || new Set(nodeIds).size !== nodeIds.length
      || !nodeIds.every(value => typeof value === "string" && /^tpnode_[a-f0-9]{32}$/.test(value))
      || !["owned", "third-party"].includes(row.mode) || (row.mode === "owned" && nodeIds.length) || (row.mode === "third-party" && !nodeIds.length)) throw failure("distribution_unavailable");
    return { planId, mode: row.mode, nodeIds };
  }
  function read() {
    if (db.prepare("select count(*) as n from platform_third_party_nodes").get().n > 4096
      || db.prepare("select count(*) as n from platform_third_party_sources").get().n > 256) throw failure("distribution_unavailable");
    const stored = { policy: getPolicy.all(), routes: getRoutes.all(), owned: getOwned.all() };
    const native = nativeInventory();
    const external = { sources: getSources.all(), nodes: getSourceNodes.all(), tiers: getTiers.all() };
    const owned = ownedProjection(native, stored.policy, stored.owned);
    const routes = THIRD_PARTY_PLAN_IDS.map(planId => {
      const row = stored.routes.find(value => value.plan_id === planId);
      return routeProjection(planId, row);
    });
    const candidates = [];
    const sourceSnapshots = [];
    if (external.sources.length && thirdPartyStore?.available !== true) throw failure("distribution_unavailable");
    const sources = thirdPartyStore?.available === true ? thirdPartyStore.listSources() : [];
    for (const source of sources) {
      if (source.sourceKind !== "inline-yaml") continue;
      const snapshot = thirdPartyStore.listSourceNodes(source.id);
      sourceSnapshots.push({ source, snapshot });
      for (const item of snapshot.items) {
        if (candidates.length >= 4096) throw failure("distribution_unavailable");
        candidates.push({ id: item.id, sourceId: source.id, sourceName: source.name, displayName: item.displayName,
          protocol: item.protocol, countryCode: item.customCountryCode ?? item.countryCode,
          enabled: item.enabled === true, sourceEnabled: source.enabled === true && source.status === "ready", tiers: [...source.tiers] });
      }
    }
    return { revision: digest({ stored, native, external, sourceSnapshots }), owned, routes, candidates };
  }
  function timestamp() {
    const at = new Date(nowFn());
    if (Number.isNaN(at.getTime())) throw failure("invalid_input");
    return at.toISOString();
  }
  const getSnapshot = guarded(() => db.transaction(read).deferred());
  const writeRoutes = guarded(input => db.transaction(() => {
    exactObject(input, ["revision", "routes"]);
    revision(input.revision);
    const snapshot = read();
    if (snapshot.revision !== input.revision) throw failure("revision_conflict");
    if (!Array.isArray(input.routes) || input.routes.length !== THIRD_PARTY_PLAN_IDS.length) throw failure("invalid_input");
    const seen = new Set();
    const at = timestamp();
    const rows = input.routes.map(route => {
      exactObject(route, ["planId", "mode", "nodeIds"]);
      if (!PLANS.has(route.planId) || seen.has(route.planId) || !["owned", "third-party"].includes(route.mode)
        || !Array.isArray(route.nodeIds) || route.nodeIds.length > 256 || new Set(route.nodeIds).size !== route.nodeIds.length
        || !route.nodeIds.every(id => typeof id === "string" && /^tpnode_[a-f0-9]{32}$/.test(id))) throw failure("invalid_input");
      seen.add(route.planId);
      if (route.mode === "owned" && route.nodeIds.length) throw failure("invalid_input");
      if (route.mode === "third-party") {
        if (!route.nodeIds.length) throw failure("empty_source");
        if (route.nodeIds.some(id => !snapshot.candidates.some(candidate => candidate.id === id && candidate.enabled && candidate.sourceEnabled && candidate.tiers.includes(route.planId)))) throw failure("invalid_input");
      }
      return { ...route, nodeIds: [...route.nodeIds].sort() };
    });
    const upsert = db.prepare(`insert into ${ROUTES}(plan_id, mode, node_ids_json, updated_at) values (?, ?, ?, ?) on conflict(plan_id) do update set mode = excluded.mode, node_ids_json = excluded.node_ids_json, updated_at = excluded.updated_at`);
    for (const row of rows) upsert.run(row.planId, row.mode, JSON.stringify(row.nodeIds), at);
    return read();
  }).immediate());
  const writeOwned = guarded(input => db.transaction(() => {
    exactObject(input, ["revision", "enabled", "nodes"]);
    revision(input.revision);
    const snapshot = read();
    if (snapshot.revision !== input.revision) throw failure("revision_conflict");
    if (typeof input.enabled !== "boolean" || !Array.isArray(input.nodes) || input.nodes.length !== snapshot.owned.items.length) throw failure("invalid_input");
    const seen = new Set();
    const proposed = input.nodes.map(node => {
      exactObject(node, ["id", "enabled", "customName", "customCountryCode"]);
      if (typeof node.id !== "string" || !/^ownnode_[a-f0-9]{32}$/.test(node.id) || seen.has(node.id) || typeof node.enabled !== "boolean") throw failure("invalid_input");
      seen.add(node.id);
      const current = snapshot.owned.items.find(item => item.id === node.id);
      if (!current) throw failure("invalid_input");
      const customName = alias(node.customName);
      const customCountryCode = country(node.customCountryCode);
      const base = customName ?? current.defaultName;
      return { ...node, customName, customCountryCode, displayName: customCountryCode ? safeThirdPartyDisplayLabel(applyThirdPartyCountryFlag(base, customCountryCode)) : base };
    });
    uniqueLabels(proposed);
    const at = timestamp();
    db.prepare(`insert into ${POLICY}(id, owned_enabled, updated_at) values (1, ?, ?) on conflict(id) do update set owned_enabled = excluded.owned_enabled, updated_at = excluded.updated_at`).run(Number(input.enabled), at);
    const upsert = db.prepare(`insert into ${OWNED}(node_id, enabled, custom_name, custom_country_code, updated_at) values (?, ?, ?, ?, ?) on conflict(node_id) do update set enabled = excluded.enabled, custom_name = excluded.custom_name, custom_country_code = excluded.custom_country_code, updated_at = excluded.updated_at`);
    for (const node of proposed) upsert.run(node.id, Number(node.enabled), node.customName, node.customCountryCode, at);
    return read();
  }).immediate());

  const resolveProxyConfig = guarded(({ tenant, baseProxyConfig, resolveOwnedProxyConfig } = {}) => db.transaction(() => {
    const planId = resolveThirdPartyPlanIdForTenant(controlStore, tenant, { at: timestamp() });
    const route = planId ? routeProjection(planId, getRoute.get(planId)) : null;
    if (route?.mode === "third-party") {
      const selected = new Set(route.nodeIds);
      const permitted = selectedMembership.all(JSON.stringify(route.nodeIds), planId);
      if (thirdPartyStore?.available !== true || permitted.length !== selected.size || selected.size === 0) throw failure("distribution_unavailable");
      const active = thirdPartyStore.listActiveServersForPlan(planId).filter(item => selected.has(item.id));
      if (active.length !== selected.size || new Set(active.map(item => item.id)).size !== selected.size) throw failure("distribution_unavailable");
      return { proxyConfig: { ...baseProxyConfig, servers: decorateThirdPartyServers(active) }, distributionManaged: true };
    }
    if (typeof resolveOwnedProxyConfig !== "function") throw failure("distribution_unavailable");
    // Preserve the existing native entitlement, material, runtime and AUTO rules.
    const original = resolveOwnedProxyConfig();
    const owned = ownedProjection(nativeInventory(), getPolicy.all(), getOwned.all());
    if (!original || !Array.isArray(original.servers) || !owned.enabled) throw failure("empty_source");
    const byId = new Map(owned.items.map(item => [item.id, item]));
    const servers = original.servers.filter(server => {
      const item = byId.get(ownedId(server.name));
      return item?.enabled === true && item.available === true;
    }).map(server => ({ ...server, subscriptionDisplayName: byId.get(ownedId(server.name)).displayName }));
    if (!servers.length) throw failure("empty_source");
    validateProxyDisplayNames(servers);
    return { proxyConfig: { ...original, servers }, distributionManaged: true };
  }).immediate());
  return { available: true, close, getSnapshot, writeRoutes, writeOwned, resolveProxyConfig };
}
