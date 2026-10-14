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
import { assertPriceAdjustment, computeResidentialPrice, isWithinWindow } from "./residential-relay-pricing.mjs";

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
  "upstream_enabled", "sku_not_ready", "no_enabled_upstream", "protected_value_invalid", "residential_relay_unavailable",
  "invalid_coupon", "duplicate_coupon_code", "coupon_enabled", "coupon_not_found", "coupon_inactive",
  "coupon_not_applicable", "coupon_exhausted", "coupon_user_limit", "sku_price_unset", "order_already_priced", "invalid_account"
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
    setUpstreamsEnabled: unavailable, deleteUpstreams: unavailable, resolveRelayPool: unavailable,
    listCoupons: unavailable, createCoupon: unavailable,
    updateCoupon: unavailable, setCouponsEnabled: unavailable, deleteCoupons: unavailable, quote: unavailable, grantCoupon: unavailable, listAccountCoupons: unavailable,
    recordOrderPrice: unavailable, close() {}, ...extra
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
    deactivateUpstream: database.prepare("update platform_residential_relay_upstreams set active = 0, updated_at = ? where sku_id = ? and id = ? and active = 1 and enabled = 0"),
    coupons: database.prepare("select * from platform_residential_relay_coupons where active = 1 order by created_at asc, id asc"),
    couponById: database.prepare("select * from platform_residential_relay_coupons where id = ? and active = 1"),
    couponByCode: database.prepare("select * from platform_residential_relay_coupons where code = ? and active = 1"),
    couponCodeTaken: database.prepare("select id from platform_residential_relay_coupons where code = ?"),
    couponSkus: database.prepare("select sku_id from platform_residential_relay_coupon_skus where coupon_id = ? order by sku_id"),
    insertCoupon: database.prepare(`insert into platform_residential_relay_coupons
      (id, code, kind, value, all_skus, starts_at, ends_at, total_limit, per_user_limit, enabled, active, redemption_count, created_at, updated_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, 0, ?, ?)`),
    updateCoupon: database.prepare(`update platform_residential_relay_coupons set kind = ?, value = ?, all_skus = ?, starts_at = ?, ends_at = ?,
      total_limit = ?, per_user_limit = ?, updated_at = ? where id = ? and active = 1`),
    clearCouponSkus: database.prepare("delete from platform_residential_relay_coupon_skus where coupon_id = ?"),
    insertCouponSku: database.prepare("insert into platform_residential_relay_coupon_skus (coupon_id, sku_id) values (?, ?)"),
    setCouponEnabled: database.prepare("update platform_residential_relay_coupons set enabled = ?, updated_at = ? where id = ? and active = 1"),
    deactivateCoupon: database.prepare("update platform_residential_relay_coupons set active = 0, updated_at = ? where id = ? and active = 1 and enabled = 0"),
    userRedemptions: database.prepare("select count(*) as n from platform_residential_relay_coupon_redemptions where coupon_id = ? and account_ref = ?"),
    insertRedemption: database.prepare("insert into platform_residential_relay_coupon_redemptions (order_ref, coupon_id, account_ref, redeemed_at) values (?, ?, ?, ?)"),
    insertGrant: database.prepare("insert or ignore into platform_residential_relay_coupon_grants (coupon_id, account_ref, granted_at) values (?, ?, ?)"),
    accountCoupons: database.prepare(`select c.*, g.granted_at as granted_at from platform_residential_relay_coupon_grants g
      join platform_residential_relay_coupons c on c.id = g.coupon_id where g.account_ref = ? and c.active = 1
      order by g.granted_at desc, c.id asc`),
    bumpRedemption: database.prepare("update platform_residential_relay_coupons set redemption_count = redemption_count + 1 where id = ?"),
    orderPrice: database.prepare("select * from platform_residential_relay_order_prices where order_ref = ?"),
    insertOrderPrice: database.prepare(`insert into platform_residential_relay_order_prices
      (order_ref, account_ref, sku_id, coupon_id, list_price, final_price, breakdown, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)`)
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
      if (values.enabled && values.baseCoinUnits === null) throw failure("sku_price_unset");
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
      if (input.enabled && row.base_coin_units === null) throw failure("sku_price_unset");
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


  // ---- Coupons ----
  const CODE = /^[A-Z0-9][A-Z0-9_-]{2,31}$/;
  const COUPON_ID = /^rrcpn_[0-9a-f]{32}$/;

  function couponView(row) {
    return {
      id: row.id, code: row.code, kind: row.kind, value: row.value, allSkus: row.all_skus === 1,
      skuIds: q.couponSkus.all(row.id).map(item => item.sku_id), startsAt: row.starts_at, endsAt: row.ends_at,
      totalLimit: row.total_limit, perUserLimit: row.per_user_limit,
      enabled: row.enabled === 1, redemptionCount: row.redemption_count
    };
  }

  function couponsSnapshot() {
    const rows = q.coupons.all();
    const revision = createHash("sha256").update(JSON.stringify(rows.map(row => [row.id, row.updated_at, row.enabled, row.redemption_count]))).digest("hex");
    return { revision, items: rows.map(couponView) };
  }

  function checkCouponsRevision(revision) {
    if (typeof revision !== "string" || !REVISION.test(revision)) throw failure("invalid_input");
    if (couponsSnapshot().revision !== revision) throw failure("revision_conflict");
  }

  function couponFields(input) {
    const adjustment = assertPriceAdjustment(input, "invalid_coupon");
    const limit = value => {
      if (value === null || value === undefined) return null;
      if (!Number.isSafeInteger(value) || value <= 0) throw failure("invalid_coupon");
      return value;
    };
    if (input.allSkus !== undefined && typeof input.allSkus !== "boolean") throw failure("invalid_coupon");
    const skuIds = input.skuIds ?? [];
    if (!Array.isArray(skuIds) || skuIds.length > 8 || skuIds.some(item => typeof item !== "string" || !SKU_ID.test(item))
      || new Set(skuIds).size !== skuIds.length) throw failure("invalid_coupon");
    if (input.allSkus !== true && skuIds.length === 0) throw failure("invalid_coupon");
    for (const skuId of skuIds) if (!q.skuById.get(skuId)) throw failure("invalid_coupon");
    return { ...adjustment, allSkus: input.allSkus === true, skuIds: input.allSkus === true ? [] : skuIds,
      totalLimit: limit(input.totalLimit), perUserLimit: limit(input.perUserLimit) };
  }

  const listCoupons = guarded(() => couponsSnapshot());

  const createCoupon = guarded(input => {
    exactKeys(input, ["revision", "code", "kind", "value"], ["allSkus", "skuIds", "startsAt", "endsAt", "totalLimit", "perUserLimit"]);
    const code = typeof input.code === "string" ? input.code.trim().toUpperCase() : "";
    if (!CODE.test(code)) throw failure("invalid_coupon");
    return database.transaction(() => {
      checkCouponsRevision(input.revision);
      const fields = couponFields(input);
      if (q.couponCodeTaken.get(code)) throw failure("duplicate_coupon_code");
      const id = newId("rrcpn_"), at = now();
      q.insertCoupon.run(id, code, fields.kind, fields.value, fields.allSkus ? 1 : 0, fields.startsAt, fields.endsAt,
        fields.totalLimit, fields.perUserLimit, at, at);
      for (const skuId of fields.skuIds) q.insertCouponSku.run(id, skuId);
      return couponsSnapshot();
    }).immediate();
  });

  const updateCoupon = guarded((couponId, input) => {
    if (typeof couponId !== "string" || !COUPON_ID.test(couponId)) throw failure("invalid_input");
    exactKeys(input, ["revision", "kind", "value"], ["allSkus", "skuIds", "startsAt", "endsAt", "totalLimit", "perUserLimit"]);
    return database.transaction(() => {
      checkCouponsRevision(input.revision);
      const row = q.couponById.get(couponId);
      if (!row) throw failure("coupon_not_found");
      if (row.enabled === 1) throw failure("coupon_enabled");
      const fields = couponFields(input);
      const at = now();
      q.updateCoupon.run(fields.kind, fields.value, fields.allSkus ? 1 : 0, fields.startsAt, fields.endsAt,
        fields.totalLimit, fields.perUserLimit, at, couponId);
      q.clearCouponSkus.run(couponId);
      for (const skuId of fields.skuIds) q.insertCouponSku.run(couponId, skuId);
      return couponsSnapshot();
    }).immediate();
  });

  const setCouponsEnabled = guarded(input => {
    exactKeys(input, ["revision", "couponIds", "enabled"]);
    if (typeof input.enabled !== "boolean") throw failure("invalid_enabled");
    const ids = idList(input.couponIds, COUPON_ID);
    return database.transaction(() => {
      checkCouponsRevision(input.revision);
      if (ids.some(item => !q.couponById.get(item))) throw failure("coupon_not_found");
      const at = now();
      for (const item of ids) q.setCouponEnabled.run(input.enabled ? 1 : 0, at, item);
      return couponsSnapshot();
    }).immediate();
  });

  // Pause before delete. Redemption history and recorded order prices are kept.
  const deleteCoupons = guarded(input => {
    exactKeys(input, ["revision", "couponIds"]);
    const ids = idList(input.couponIds, COUPON_ID);
    return database.transaction(() => {
      checkCouponsRevision(input.revision);
      const rows = ids.map(item => q.couponById.get(item));
      if (rows.some(row => !row)) throw failure("coupon_not_found");
      if (rows.some(row => row.enabled === 1)) throw failure("coupon_enabled");
      const at = now();
      for (const item of ids) q.deactivateCoupon.run(at, item);
      return couponsSnapshot();
    }).immediate();
  });

  // ---- Pricing / quote ----
  const ACCOUNT_REF = /^[A-Za-z0-9._:-]{1,128}$/;

  function resolveCoupon(code, skuRow, accountRef, at) {
    if (code === undefined || code === null || code === "") return null;
    const normalized = typeof code === "string" ? code.trim().toUpperCase() : "";
    if (!CODE.test(normalized)) throw failure("coupon_not_found");
    const row = q.couponByCode.get(normalized);
    if (!row) throw failure("coupon_not_found");
    if (row.enabled !== 1 || !isWithinWindow({ startsAt: row.starts_at, endsAt: row.ends_at }, at)) throw failure("coupon_inactive");
    if (row.all_skus !== 1 && !q.couponSkus.all(row.id).some(item => item.sku_id === skuRow.id)) throw failure("coupon_not_applicable");
    if (row.total_limit !== null && row.redemption_count >= row.total_limit) throw failure("coupon_exhausted");
    if (accountRef && row.per_user_limit !== null && q.userRedemptions.get(row.id, accountRef).n >= row.per_user_limit) throw failure("coupon_user_limit");
    return row;
  }

  function priceFor(skuId, couponCode, accountRef) {
    const skuRow = requireSku(skuId);
    if (accountRef !== undefined && accountRef !== null && !ACCOUNT_REF.test(accountRef)) throw failure("invalid_account");
    if (skuRow.base_coin_units === null) throw failure("sku_price_unset");
    const at = now();
    const coupon = resolveCoupon(couponCode, skuRow, accountRef, at);
    const breakdown = computeResidentialPrice({
      listPrice: skuRow.base_coin_units,
      coupon: coupon ? { code: coupon.code, kind: coupon.kind, value: coupon.value } : null
    });
    return { skuRow, coupon, breakdown: { skuId: skuRow.id, sizeCode: skuRow.size_code, purchasable: isPurchasableRow(skuRow), quotedAt: at, ...breakdown } };
  }

  function isPurchasableRow(skuRow) { return skuView(skuRow).purchasable; }

  // Read-only quote: SKU + optional coupon (+ optional account for per-user limits).
  const quote = guarded(input => {
    exactKeys(input, ["skuId"], ["couponCode", "accountRef"]);
    return priceFor(input.skuId, input.couponCode, input.accountRef).breakdown;
  });

  // For the #753 order flow: atomically recompute, redeem the coupon and record
  // the priced breakdown on the order. Idempotent per orderRef (same inputs
  // return the recorded row; different inputs fail). Fulfillment is not wired.
  const recordOrderPrice = guarded(input => {
    exactKeys(input, ["orderRef", "accountRef", "skuId"], ["couponCode"]);
    if (typeof input.orderRef !== "string" || !ACCOUNT_REF.test(input.orderRef)) throw failure("invalid_input");
    if (typeof input.accountRef !== "string" || !ACCOUNT_REF.test(input.accountRef)) throw failure("invalid_account");
    return database.transaction(() => {
      const existing = q.orderPrice.get(input.orderRef);
      if (existing) {
        const recorded = JSON.parse(existing.breakdown);
        const sameCoupon = (recorded.coupon?.code ?? null) === (input.couponCode ? String(input.couponCode).trim().toUpperCase() : null);
        if (existing.account_ref !== input.accountRef || existing.sku_id !== input.skuId || !sameCoupon) throw failure("order_already_priced");
        return recorded;
      }
      const { skuRow, coupon, breakdown } = priceFor(input.skuId, input.couponCode, input.accountRef);
      if (!breakdown.purchasable) throw failure("sku_not_ready");
      const at = now();
      const couponUsed = coupon && breakdown.coupon?.applied ? coupon : null;
      if (couponUsed) {
        q.insertRedemption.run(input.orderRef, couponUsed.id, input.accountRef, at);
        q.bumpRedemption.run(couponUsed.id);
      }
      const recorded = { ...breakdown, orderRef: input.orderRef };
      q.insertOrderPrice.run(input.orderRef, input.accountRef, skuRow.id, couponUsed?.id ?? null, breakdown.listPrice, breakdown.finalPrice, JSON.stringify(recorded), at);
      return recorded;
    }).immediate();
  });

  // ---- Account-owned coupons (buyer side) ----
  // Grants an existing coupon to accounts. Idempotent per (coupon, account).
  const grantCoupon = guarded(input => {
    exactKeys(input, ["couponId", "accountRefs"]);
    if (typeof input.couponId !== "string" || !COUPON_ID.test(input.couponId)) throw failure("invalid_input");
    if (!Array.isArray(input.accountRefs) || input.accountRefs.length < 1 || input.accountRefs.length > 500
      || input.accountRefs.some(item => typeof item !== "string" || !ACCOUNT_REF.test(item))) throw failure("invalid_account");
    return database.transaction(() => {
      if (!q.couponById.get(input.couponId)) throw failure("coupon_not_found");
      const at = now();
      let granted = 0;
      for (const ref of new Set(input.accountRefs)) granted += q.insertGrant.run(input.couponId, ref, at).changes;
      return { couponId: input.couponId, granted };
    }).immediate();
  });

  // Owner-only listing: the account ref always comes from the caller's session.
  // Status: used (account redeemed it and no uses remain) > expired (ended, paused or
  // globally exhausted) > available (incl. not-yet-started, flagged upcoming).
  const listAccountCoupons = guarded(input => {
    exactKeys(input, ["accountRef"]);
    if (typeof input.accountRef !== "string" || !ACCOUNT_REF.test(input.accountRef)) throw failure("invalid_account");
    const at = now();
    const atMs = Date.parse(at);
    const skuMap = new Map(q.skus.all().map(row => [row.id, row]));
    const items = q.accountCoupons.all(input.accountRef).map(row => {
      const usedCount = q.userRedemptions.get(row.id, input.accountRef).n;
      const userLeft = row.per_user_limit === null ? null : Math.max(0, row.per_user_limit - usedCount);
      const totalLeft = row.total_limit === null ? null : Math.max(0, row.total_limit - row.redemption_count);
      const remainingUses = userLeft === null ? totalLeft : totalLeft === null ? userLeft : Math.min(userLeft, totalLeft);
      const ended = row.ends_at !== null && Date.parse(row.ends_at) <= atMs;
      const upcoming = row.starts_at !== null && Date.parse(row.starts_at) > atMs;
      let status = "available";
      let reason = upcoming ? "upcoming" : null;
      if (usedCount > 0 && remainingUses === 0) { status = "used"; reason = null; }
      else if (ended) { status = "expired"; reason = "ended"; }
      else if (row.enabled !== 1) { status = "expired"; reason = "paused"; }
      else if (totalLeft === 0) { status = "expired"; reason = "exhausted"; }
      const skuIds = row.all_skus === 1 ? [...skuMap.keys()] : q.couponSkus.all(row.id).map(item => item.sku_id);
      const skus = skuIds.map(id => skuMap.get(id)).filter(Boolean)
        .map(sku => ({ skuId: sku.id, sizeCode: sku.size_code, durationDays: sku.duration_days }));
      return { code: row.code, kind: row.kind, value: row.value, allSkus: row.all_skus === 1, skus,
        startsAt: row.starts_at, endsAt: row.ends_at, remainingUses, usedCount,
        status, reason, grantedAt: row.granted_at };
    });
    return { asOf: at, items };
  });

  return { available: true, grantCoupon, listAccountCoupons, listSkus, getSku, saveSku, setSkuEnabled, previewUpstreams, importUpstreams,
    listUpstreams, setUpstreamsEnabled, deleteUpstreams, resolveRelayPool,
    listCoupons, createCoupon, updateCoupon, setCouponsEnabled, deleteCoupons, quote, recordOrderPrice, close };
}

export { isResidentialRelaySkuSizeCode };
