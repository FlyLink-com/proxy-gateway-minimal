import { randomBytes } from "node:crypto";
import { isAbsolute } from "node:path";
import Database from "better-sqlite3";

import {
  inspectThirdPartySubscriptionSchema
} from "./third-party-subscription-migrations.mjs";
import {
  fetchAndSplitSubscription,
  parseHttpsUrl
} from "./third-party-subscription-fetch.mjs";

export const THIRD_PARTY_PLAN_IDS = Object.freeze([
  "monthly_basic",
  "monthly_plus",
  "yearly"
]);
export const THIRD_PARTY_PROTECTED_PREFIX = "v2:aes-256-gcm:";

const PLAN_ID_SET = new Set(THIRD_PARTY_PLAN_IDS);

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
  // The fingerprint column is the internal dedup key. A legacy protected
  // config stored that same key on fingerprint; it is not a certificate pin.
  delete server.dedupKey;
  if (server.fingerprint === row.fingerprint) {
    delete server.fingerprint;
  }
  return server;
}

function publicSource(row, tiers, nodeStats) {
  return {
    id: row.id,
    name: row.name,
    enabled: row.enabled === 1,
    tiers,
    regionOverride: row.region_override,
    status: row.status,
    lastRefreshAt: row.last_refresh_at,
    lastErrorCode: row.last_error_code,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    nodes: nodeStats
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
  const fetchFn = options.fetchFn;
  const resolveFn = options.resolveFn;
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
  const markFailureStmt = database.prepare(`
    update platform_third_party_sources
       set status = 'error', last_error_code = ?, updated_at = ?
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
    return publicSource(row, tiers, nodes);
  }

  function createSource({ name, subscriptionUrl, regionOverride, tiers, enabled } = {}) {
    const normalizedName = normalizeName(name);
    const url = parseHttpsUrl(subscriptionUrl).toString();
    const protectedUrl = protectRequired(secretProtector, url);
    const normalizedTiers = normalizeTiers(tiers);
    const normalizedEnabled = asBoolean(enabled, true);
    const normalizedRegion = normalizeRegionOverride(regionOverride);
    const region = normalizedRegion === undefined ? null : normalizedRegion;
    const id = newId("tpsrc_");
    const at = nowIso(nowFn);
    const tx = database.transaction(() => {
      insertSource.run(
        id,
        normalizedName,
        protectedUrl,
        region,
        normalizedEnabled ? 1 : 0,
        at,
        at
      );
      for (const planId of normalizedTiers) insertTier.run(id, planId);
    });
    tx();
    return sourceProjection(requireSource(id));
  }

  function patchSource(id, patch = {}) {
    const row = requireSource(id);
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
    const fingerprints = nodes.map((node) => node.fingerprint);
    const fingerprintJson = JSON.stringify(fingerprints);
    const tx = database.transaction(() => {
      for (const node of nodes) {
        const protectedConfig = protectRequired(secretProtector, JSON.stringify(node.config));
        const existing = selectNodeByFingerprint.get(sourceId, node.fingerprint);
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
            node.fingerprint,
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
    let url;
    try {
      url = unprotectRequired(secretProtector, row.protected_url);
    } catch (error) {
      const code = typeof error?.code === "string" ? error.code : "protected_value_invalid";
      markFailureStmt.run(code, nowIso(nowFn), id);
      return {
        id,
        ok: false,
        status: "error",
        lastErrorCode: code,
        counts: { valid: 0, unsupported: 0, malformed: 0, active: 0 }
      };
    }
    let parsed;
    try {
      parsed = await fetchAndSplitSubscription(url, {
        fetchFn,
        resolveFn,
        regionOverride: row.region_override
      });
    } catch (error) {
      const code = typeof error?.code === "string" ? error.code : "fetch_failed";
      markFailureStmt.run(code, nowIso(nowFn), id);
      return {
        id,
        ok: false,
        status: "error",
        lastErrorCode: code,
        counts: { valid: 0, unsupported: 0, malformed: 0, active: 0 }
      };
    }
    if (!parsed.nodes.length) {
      const code = "parse_no_valid_nodes";
      markFailureStmt.run(code, nowIso(nowFn), id);
      return {
        id,
        ok: false,
        status: "error",
        lastErrorCode: code,
        counts: parsed.counts
      };
    }
    const at = nowIso(nowFn);
    replaceSourceNodes(id, parsed.nodes.map((node) => ({
      fingerprint: node.dedupKey,
      displayName: node.displayName,
      countryCode: node.countryCode,
      region: node.region,
      protocol: node.protocol,
      config: node
    })), at);
    const projection = sourceProjection(requireSource(id));
    return {
      id,
      ok: true,
      status: projection.status,
      lastErrorCode: null,
      counts: {
        ...parsed.counts,
        active: projection.nodes.active,
        total: projection.nodes.total
      }
    };
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

  return {
    available: true,
    close,
    createSource,
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
    patchSource: unavailable,
    listSources: unavailable,
    getSummary: unavailable,
    refreshSource: unavailable,
    listActiveServersForPlan: () => [],
    inspect: extra.inspect || (() => ({ ok: false, schemaState: "blocked" }))
  };
}
