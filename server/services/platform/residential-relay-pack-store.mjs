// SQLite store for admin-managed residential relay SKUs and upstream bindings.
// Mirrors the third-party node workspace: inline YAML import (same format as
// #762/#771), per-row enable/pause, delete only after pause, revision checks.
// Upstream configs are encrypted at rest and never leave the server in
// admin/public projections; only the relay config generator reads them.
import { createHash, randomBytes } from "node:crypto";
import Database from "better-sqlite3";
import { isAbsolute } from "node:path";
import { parseThirdPartyYaml } from "./third-party-subscription-yaml.mjs";
import { inspectResidentialRelayPackSchema } from "./residential-relay-pack-migrations.mjs";
import {
  RESIDENTIAL_RELAY_PACK_TERMS, RESIDENTIAL_RELAY_SKU_SIZE_CODES, RESIDENTIAL_RELAY_SKU_SIZE_DEFAULTS,
  assertResidentialRelaySkuInput, isResidentialRelaySkuSizeCode, residentialRelaySkuPublicView
} from "./residential-relay-pack-product.mjs";
import { buildResidentialPool } from "../edge/residential-relay-pool.mjs";

const PROTECTED_PREFIX = "v2:aes-256-gcm:";
const SKU_ID = /^rrsku_[0-9a-f]{32}$/;
const UPSTREAM_ID = /^rrup_[0-9a-f]{32}$/;
const REVISION = /^[0-9a-f]{64}$/;
const MAX_YAML_BYTES = 64 * 1024;
export const RESIDENTIAL_RELAY_MAX_UPSTREAMS_PER_SKU = 64;
const MAX_BATCH = 256;

export const RESIDENTIAL_RELAY_STORE_CODES = new Set([
  "invalid_input", "invalid_sku_size", "invalid_buyer_protocol", "invalid_duration", "invalid_quota", "invalid_price",
  "invalid_enabled", "invalid_yaml", "parse_no_valid_nodes", "upstream_limit", "revision_conflict", "not_found",
  "upstream_enabled", "sku_not_ready", "no_enabled_upstream", "protected_value_invalid", "residential_relay_unavailable"
]);

function failure(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function newId(prefix) { return `${prefix}${randomBytes(16).toString("hex")}`; }

function exactKeys(value, required, optional = []) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw failure("invalid_input");
  const keys = Object.keys(value);
  if (required.some(key => !Object.hasOwn(value, key)) || keys.some(key => !required.includes(key) && !optional.includes(key))) throw failure("invalid_input");
}

function idList(value, pattern) {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_BATCH) throw failure("invalid_input");
  if (value.some(item => typeof item !== "string" || !pattern.test(item)) || new Set(value).size !== value.length) throw failure("invalid_input");
  return value;
}

function unavailableStore(extra = {}) {
  const unavailable = () => { throw failure("residential_relay_unavailable"); };
  return {
    available: false, listSkus: unavailable, getSku: unavailable, saveSku: unavailable, setSkuEnabled: unavailable,
    previewUpstreams: unavailable, importUpstreams: unavailable, listUpstreams: unavailable,
    setUpstreamsEnabled: unavailable, deleteUpstreams: unavailable, resolveRelayPool: unavailable, close() {}, ...extra
  };
}

export function createSqliteResidentialRelayPackStore(options = {}) {
  const secretProtector = options.secretProtector;
  const nowFn = options.nowFn || (() => new Date());
  const owns = !options.database;
  let database = options.database || null;
  if (!database) {
    if (!options.dbPath || (options.dbPath !== ":memory:" && !isAbsolute(options.dbPath))) return unavailableStore();
    try {
      database = new Database(options.dbPath, options.dbPath === ":memory:" ? {} : { fileMustExist: true });
      database.pragma("journal_mode = WAL");
      database.pragma("busy_timeout = 2000");
    } catch { return unavailableStore(); }
  }
  const close = () => { if (owns) try { database.close(); } catch { /* best effort */ } };
  let available = false;
  try {
    database.pragma("foreign_keys = ON");
    available = typeof secretProtector?.protect === "function" && typeof secretProtector?.unprotect === "function"
      && inspectResidentialRelayPackSchema({ database }).ok === true;
  } catch { available = false; }
  if (!available) return unavailableStore({ close });

  const q = {
    skus: database.prepare("select * from platform_residential_relay_skus order by quota_bytes asc, id asc"),
    skuById: database.prepare("select * from platform_residential_relay_skus where id = ?"),
    skuBySize: database.prepare("select * from platform_residential_relay_skus where size_code = ?"),
    insertSku: database.prepare(`insert into platform_residential_relay_skus
      (id, size_code, buyer_protocol, quota_bytes, duration_days, base_coin_units, enabled, created_at, updated_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?)`),
    updateSku: database.prepare(`update platform_residential_relay_skus
      set buyer_protocol = ?, quota_bytes = ?, duration_days = ?, base_coin_units = ?, enabled = ?, updated_at = ? where id = ?`),
    setSkuEnabled: database.prepare("update platform_residential_relay_skus set enabled = ?, updated_at = ? where id = ?"),
    touchSku: database.prepare("update platform_residential_relay_skus set updated_at = ? where id = ?"),
    upstreams: database.prepare(`select * from platform_residential_relay_upstreams where sku_id = ? and active = 1
      order by created_at asc, id asc`),
    upstreamCounts: database.prepare(`select sku_id, count(*) as total, sum(enabled) as enabled
      from platform_residential_relay_upstreams where active = 1 group by sku_id`),
    upstreamByFingerprint: database.prepare("select id, active from platform_residential_relay_upstreams where sku_id = ? and fingerprint = ?"),
    insertUpstream: database.prepare(`insert into platform_residential_relay_upstreams
      (id, sku_id, fingerprint, display_name, country_code, protocol, protected_config, enabled, active, created_at, updated_at)
      values (?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?)`),
    reviveUpstream: database.prepare(`update platform_residential_relay_upstreams
      set display_name = ?, country_code = ?, protocol = ?, protected_config = ?, enabled = 0, active = 1, updated_at = ? where id = ?`),
    setUpstreamEnabled: database.prepare("update platform_residential_relay_upstreams set enabled = ?, updated_at = ? where sku_id = ? and id = ? and active = 1"),
    deactivateUpstream: database.prepare("update platform_residential_relay_upstreams set active = 0, updated_at = ? where sku_id = ? and id = ? and active = 1 and enabled = 0")
  };

  const now = () => {
    const date = new Date(nowFn());
    if (Number.isNaN(date.getTime())) throw failure("invalid_input");
    return date.toISOString();
  };
  const protect = value => {
    const wrapped = secretProtector.protect(JSON.stringify(value));
    if (typeof wrapped !== "string" || !wrapped.startsWith(PROTECTED_PREFIX)) throw failure("protected_value_invalid");
    return wrapped;
  };
  const unprotect = value => {
    try { return JSON.parse(secretProtector.unprotect(value)); } catch { throw failure("protected_value_invalid"); }
  };

  function counts() {
    return new Map(q.upstreamCounts.all().map(row => [row.sku_id, { total: Number(row.total) || 0, enabled: Number(row.enabled) || 0 }]));
  }

  function skuView(row, countMap = counts()) {
    const c = countMap.get(row.id) || { total: 0, enabled: 0 };
    return residentialRelaySkuPublicView({
      id: row.id, sizeCode: row.size_code, buyerProtocol: row.buyer_protocol, quotaBytes: row.quota_bytes,
      durationDays: row.duration_days, baseCoinUnits: row.base_coin_units, enabled: row.enabled === 1,
      upstreamCount: c.total, enabledUpstreamCount: c.enabled
    });
  }

  function requireSku(id) {
    if (typeof id !== "string" || !SKU_ID.test(id)) throw failure("invalid_input");
    const row = q.skuById.get(id);
    if (!row) throw failure("not_found");
    return row;
  }

  // Revision covers the SKU row and every active upstream's id/enabled/fingerprint.
  function revisionOf(skuRow, rows) {
    return createHash("sha256").update(JSON.stringify([skuRow.id, skuRow.updated_at, skuRow.enabled,
      rows.map(row => [row.id, row.enabled, row.fingerprint, row.updated_at])])).digest("hex");
  }

  function upstreamSnapshot(skuRow) {
    const rows = q.upstreams.all(skuRow.id);
    return {
      sku: skuView(skuRow),
      revision: revisionOf(skuRow, rows),
      items: rows.map(row => ({ id: row.id, displayName: row.display_name, countryCode: row.country_code,
        protocol: row.protocol, enabled: row.enabled === 1 }))
    };
  }

  function guarded(fn) {
    return (...args) => {
      try { return fn(...args); } catch (error) {
        throw failure(RESIDENTIAL_RELAY_STORE_CODES.has(error?.code) ? error.code : "residential_relay_unavailable");
      }
    };
  }

  function parseYaml(yamlContent, regionOverride) {
    if (typeof yamlContent !== "string" || Buffer.byteLength(yamlContent, "utf8") > MAX_YAML_BYTES) throw failure("invalid_yaml");
    let parsed;
    try { parsed = parseThirdPartyYaml(yamlContent, { regionOverride: regionOverride ?? null }); } catch { throw failure("invalid_yaml"); }
    if (!parsed.nodes.length) throw failure("parse_no_valid_nodes");
    // Reject entries the relay generator could not render; fail before any write.
    try { buildResidentialPool({ importedNodes: parsed.nodes, requireCountry: null }); } catch { throw failure("invalid_yaml"); }
    return parsed.nodes;
  }

  function checkRevision(skuRow, revision) {
    if (typeof revision !== "string" || !REVISION.test(revision)) throw failure("invalid_input");
    if (revisionOf(skuRow, q.upstreams.all(skuRow.id)) !== revision) throw failure("revision_conflict");
  }

  const listSkus = guarded(() => {
    const countMap = counts();
    const rows = new Map(q.skus.all().map(row => [row.size_code, row]));
    // Every size is always listed; unconfigured sizes show defaults and are not sellable.
    return RESIDENTIAL_RELAY_SKU_SIZE_CODES.map(sizeCode => rows.has(sizeCode)
      ? { configured: true, ...skuView(rows.get(sizeCode), countMap) }
      : { configured: false, id: null, sizeCode, buyerProtocol: null,
        quotaBytes: RESIDENTIAL_RELAY_SKU_SIZE_DEFAULTS[sizeCode].defaultQuotaBytes,
        durationDays: null, baseCoinUnits: null, enabled: false, upstreamCount: 0, enabledUpstreamCount: 0,
        purchasable: false, terms: RESIDENTIAL_RELAY_PACK_TERMS });
  });

  const getSku = guarded(id => upstreamSnapshot(requireSku(id)));

  // Create or edit the SKU for a size. Enabling requires at least one enabled upstream.
  const saveSku = guarded(input => {
    exactKeys(input, ["sizeCode", "buyerProtocol", "durationDays", "quotaBytes", "baseCoinUnits"], ["enabled", "revision"]);
    const values = assertResidentialRelaySkuInput(input);
    return database.transaction(() => {
      const at = now();
      const existing = q.skuBySize.get(values.sizeCode);
      if (!existing) {
        if (values.enabled) throw failure("no_enabled_upstream");
        const id = newId("rrsku_");
        q.insertSku.run(id, values.sizeCode, values.buyerProtocol, values.quotaBytes, values.durationDays, values.baseCoinUnits, 0, at, at);
        return upstreamSnapshot(q.skuById.get(id));
      }
      checkRevision(existing, input.revision);
      if (values.enabled && (counts().get(existing.id)?.enabled ?? 0) < 1) throw failure("no_enabled_upstream");
      q.updateSku.run(values.buyerProtocol, values.quotaBytes, values.durationDays, values.baseCoinUnits, values.enabled ? 1 : 0, at, existing.id);
      return upstreamSnapshot(q.skuById.get(existing.id));
    }).immediate();
  });

  const setSkuEnabled = guarded((id, input) => {
    exactKeys(input, ["revision", "enabled"]);
    if (typeof input.enabled !== "boolean") throw failure("invalid_enabled");
    return database.transaction(() => {
      const row = requireSku(id);
      checkRevision(row, input.revision);
      if (input.enabled && (counts().get(row.id)?.enabled ?? 0) < 1) throw failure("no_enabled_upstream");
      q.setSkuEnabled.run(input.enabled ? 1 : 0, now(), row.id);
      return upstreamSnapshot(q.skuById.get(row.id));
    }).immediate();
  });

  const previewUpstreams = guarded(input => {
    exactKeys(input, ["yamlContent"], ["regionOverride"]);
    const nodes = parseYaml(input.yamlContent, input.regionOverride);
    const byProtocol = {}, byCountry = {};
    for (const node of nodes) {
      byProtocol[node.protocol] = (byProtocol[node.protocol] || 0) + 1;
      byCountry[node.countryCode] = (byCountry[node.countryCode] || 0) + 1;
    }
    return { valid: nodes.length, byProtocol, byCountry };
  });

  // Import binds N upstreams to one SKU. Imported rows start paused; they never
  // become normal third-party nodes and are never published to subscriptions.
  const importUpstreams = guarded((id, input) => {
    exactKeys(input, ["revision", "yamlContent"], ["regionOverride"]);
    const nodes = parseYaml(input.yamlContent, input.regionOverride);
    return database.transaction(() => {
      const row = requireSku(id);
      checkRevision(row, input.revision);
      const at = now();
      for (const node of nodes) {
        const config = { ...node };
        delete config.dedupKey;
        const existing = q.upstreamByFingerprint.get(row.id, node.dedupKey);
        if (existing?.active === 1) continue;
        if (existing) q.reviveUpstream.run(node.displayName, node.countryCode, node.protocol, protect(config), at, existing.id);
        else q.insertUpstream.run(newId("rrup_"), row.id, node.dedupKey, node.displayName, node.countryCode, node.protocol, protect(config), at, at);
      }
      if (q.upstreams.all(row.id).length > RESIDENTIAL_RELAY_MAX_UPSTREAMS_PER_SKU) throw failure("upstream_limit");
      q.touchSku.run(at, row.id);
      return upstreamSnapshot(q.skuById.get(row.id));
    }).immediate();
  });

  const listUpstreams = guarded(id => upstreamSnapshot(requireSku(id)));

  // Multi-select enable / pause. Pausing the last enabled upstream of an
  // enabled SKU also pauses the SKU so it cannot be sold without capacity.
  const setUpstreamsEnabled = guarded((id, input) => {
    exactKeys(input, ["revision", "upstreamIds", "enabled"]);
    if (typeof input.enabled !== "boolean") throw failure("invalid_enabled");
    const ids = idList(input.upstreamIds, UPSTREAM_ID);
    return database.transaction(() => {
      const row = requireSku(id);
      checkRevision(row, input.revision);
      const active = new Set(q.upstreams.all(row.id).map(item => item.id));
      if (ids.some(item => !active.has(item))) throw failure("not_found");
      const at = now();
      for (const upstreamId of ids) q.setUpstreamEnabled.run(input.enabled ? 1 : 0, at, row.id, upstreamId);
      if (!input.enabled && row.enabled === 1 && (counts().get(row.id)?.enabled ?? 0) < 1) q.setSkuEnabled.run(0, at, row.id);
      q.touchSku.run(at, row.id);
      return upstreamSnapshot(q.skuById.get(row.id));
    }).immediate();
  });

  // Multi-select delete. Same rule as third-party nodes: pause before delete.
  const deleteUpstreams = guarded((id, input) => {
    exactKeys(input, ["revision", "upstreamIds"]);
    const ids = idList(input.upstreamIds, UPSTREAM_ID);
    return database.transaction(() => {
      const row = requireSku(id);
      checkRevision(row, input.revision);
      const rows = new Map(q.upstreams.all(row.id).map(item => [item.id, item]));
      if (ids.some(item => !rows.has(item))) throw failure("not_found");
      if (ids.some(item => rows.get(item).enabled === 1)) throw failure("upstream_enabled");
      const at = now();
      for (const upstreamId of ids) q.deactivateUpstream.run(at, row.id, upstreamId);
      q.touchSku.run(at, row.id);
      return upstreamSnapshot(q.skuById.get(row.id));
    }).immediate();
  });

  // Server-internal: enabled upstreams of an enabled SKU as a relay pool.
  const resolveRelayPool = guarded(id => {
    const row = requireSku(id);
    if (row.enabled !== 1) throw failure("sku_not_ready");
    const rows = q.upstreams.all(row.id).filter(item => item.enabled === 1);
    if (!rows.length) throw failure("no_enabled_upstream");
    const nodes = rows.map(item => ({ ...unprotect(item.protected_config), tag: item.id.slice("rrup_".length, "rrup_".length + 16) }));
    return { sku: skuView(row), pool: buildResidentialPool({ importedNodes: nodes, requireCountry: null }) };
  });

  return { available: true, listSkus, getSku, saveSku, setSkuEnabled, previewUpstreams, importUpstreams,
    listUpstreams, setUpstreamsEnabled, deleteUpstreams, resolveRelayPool, close };
}

export { isResidentialRelaySkuSizeCode };
