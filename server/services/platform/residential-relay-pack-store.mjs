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
import { assertPriceAdjustment, computeResidentialPrice, maxCouponDeduction } from "./residential-relay-pricing.mjs";

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
  "invalid_coupon", "coupon_not_found", "coupon_inactive", "coupon_not_applicable", "coupon_not_voidable",
  "redeem_failed", "redeem_rate_limited", "sku_price_unset", "order_already_priced", "invalid_account"
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
    listCoupons: unavailable, generateCoupons: unavailable, voidCoupons: unavailable, quote: unavailable,
    redeemCoupon: unavailable, listAccountCoupons: unavailable,
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
    coupons: database.prepare("select * from platform_residential_relay_coupons order by issued_at desc, id asc limit 5000"),
    couponById: database.prepare("select * from platform_residential_relay_coupons where id = ?"),
    couponByCode: database.prepare("select * from platform_residential_relay_coupons where code = ?"),
    couponSkus: database.prepare("select sku_id from platform_residential_relay_coupon_skus where coupon_id = ? order by sku_id"),
    insertCoupon: database.prepare(`insert into platform_residential_relay_coupons
      (id, code, batch_id, kind, value, all_skus, expires_at, issued_at, issued_by) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`),
    insertCouponSku: database.prepare("insert into platform_residential_relay_coupon_skus (coupon_id, sku_id) values (?, ?)"),
    voidCoupon: database.prepare(`update platform_residential_relay_coupons set voided_at = ?, voided_by = ?
      where id = ? and voided_at is null and redeemed_at is null`),
    redeemCoupon: database.prepare(`update platform_residential_relay_coupons set redeemed_by = ?, redeemed_at = ?
      where id = ? and voided_at is null and redeemed_at is null and expires_at > ?`),
    consumeCoupon: database.prepare(`update platform_residential_relay_coupons
      set consumed_by = ?, consumed_order_ref = ?, consumed_amount = ?, consumed_at = ?
      where id = ? and redeemed_by = ? and consumed_at is null and voided_at is null and expires_at > ?`),
    accountCoupons: database.prepare(`select * from platform_residential_relay_coupons where redeemed_by = ?
      order by redeemed_at desc, id asc`),
    insertAttempt: database.prepare(`insert into platform_residential_relay_redeem_attempts
      (account_ref, client_key, input_hash, outcome, attempted_at) values (?, ?, ?, ?, ?)`),
    accountFailures: database.prepare(`select count(*) as n from platform_residential_relay_redeem_attempts
      where account_ref = ? and outcome != 'redeemed' and attempted_at > ?`),
    clientFailures: database.prepare(`select count(*) as n from platform_residential_relay_redeem_attempts
      where client_key = ? and outcome != 'redeemed' and attempted_at > ?`),
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


  // ---- Coupons: one redeem code per coupon ----
  // Codes avoid ambiguous characters (0/O, 1/I/L) and are case-insensitive;
  // hyphens and spaces are ignored on input. Stored normalized (12 chars).
  const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const CODE_LENGTH = 12;
  const CODE = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);
  const COUPON_ID = /^rrcpn_[0-9a-f]{32}$/;
  const ACTOR = /^[A-Za-z0-9._:@-]{1,128}$/;
  const ACCOUNT_REF = /^[A-Za-z0-9._:-]{1,128}$/;
  const MAX_GENERATE = 500;
  const REDEEM_WINDOW_MS = 15 * 60 * 1000;
  const REDEEM_MAX_ACCOUNT_FAILURES = 5;
  const REDEEM_MAX_CLIENT_FAILURES = 20;

  function normalizeCode(value) {
    if (typeof value !== "string" || value.length > 64) return null;
    const normalized = value.replace(/[\s-]/g, "").toUpperCase();
    return CODE.test(normalized) ? normalized : null;
  }
  function displayCode(code) { return `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8)}`; }
  function newCode() {
    let out = "";
    while (out.length < CODE_LENGTH) {
      for (const byte of randomBytes(16)) {
        if (byte < 248 && out.length < CODE_LENGTH) out += CODE_ALPHABET[byte % CODE_ALPHABET.length];
      }
    }
    return out;
  }
  // Short, non-reversible fingerprint of a redeem input (never the raw text).
  function inputHash(value) {
    const text = typeof value === "string" ? value.slice(0, 64).replace(/[\s-]/g, "").toUpperCase() : "";
    return createHash("sha256").update(`rr-redeem:${text}`, "utf8").digest("hex").slice(0, 12);
  }

  function couponStatus(row, at) {
    if (row.consumed_at) return "consumed";
    if (row.voided_at) return "voided";
    if (Date.parse(row.expires_at) <= Date.parse(at)) return "expired";
    return row.redeemed_at ? "redeemed" : "issued";
  }

  function couponSkuList(row, skuMap) {
    const ids = row.all_skus === 1 ? [...skuMap.keys()] : q.couponSkus.all(row.id).map(item => item.sku_id);
    return ids.map(id => skuMap.get(id)).filter(Boolean)
      .map(sku => ({ skuId: sku.id, sizeCode: sku.size_code, durationDays: sku.duration_days }));
  }

  function adminCouponView(row, at, skuMap) {
    return {
      id: row.id, code: displayCode(row.code), batchId: row.batch_id, kind: row.kind, value: row.value,
      allSkus: row.all_skus === 1, skus: couponSkuList(row, skuMap), status: couponStatus(row, at),
      issuedAt: row.issued_at, issuedBy: row.issued_by, expiresAt: row.expires_at,
      voidedAt: row.voided_at, voidedBy: row.voided_by,
      redeemedBy: row.redeemed_by, redeemedAt: row.redeemed_at,
      consumedBy: row.consumed_by, consumedOrderRef: row.consumed_order_ref,
      consumedAmount: row.consumed_amount, consumedAt: row.consumed_at
    };
  }
  const skuMapNow = () => new Map(q.skus.all().map(row => [row.id, row]));

  const listCoupons = guarded(() => {
    const at = now();
    const skuMap = skuMapNow();
    return { asOf: at, items: q.coupons.all().map(row => adminCouponView(row, at, skuMap)) };
  });

  // Admin generates 1..500 single-use codes sharing one definition.
  const generateCoupons = guarded(input => {
    exactKeys(input, ["count", "kind", "value", "expiresAt", "issuedBy"], ["allSkus", "skuIds"]);
    if (!Number.isSafeInteger(input.count) || input.count < 1 || input.count > MAX_GENERATE) throw failure("invalid_coupon");
    if (typeof input.issuedBy !== "string" || !ACTOR.test(input.issuedBy)) throw failure("invalid_input");
    const adjustment = assertPriceAdjustment({ kind: input.kind, value: input.value }, "invalid_coupon");
    if (input.allSkus !== undefined && typeof input.allSkus !== "boolean") throw failure("invalid_coupon");
    const allSkus = input.allSkus === true;
    const skuIds = allSkus ? [] : (input.skuIds ?? []);
    if (!Array.isArray(skuIds) || skuIds.some(item => typeof item !== "string" || !SKU_ID.test(item))
      || new Set(skuIds).size !== skuIds.length || (!allSkus && skuIds.length === 0)) throw failure("invalid_coupon");
    const at = now();
    const expires = typeof input.expiresAt === "string" ? Date.parse(input.expiresAt) : NaN;
    if (!Number.isFinite(expires) || expires <= Date.parse(at)) throw failure("invalid_coupon");
    const expiresAt = new Date(expires).toISOString();
    return database.transaction(() => {
      const skuRows = allSkus ? q.skus.all() : skuIds.map(id => q.skuById.get(id));
      if (skuRows.some(row => !row)) throw failure("invalid_coupon");
      // Fixed Coins may never deduct more than 20% of any applicable priced pack.
      if (adjustment.kind === "fixed") {
        const prices = skuRows.map(row => row.base_coin_units).filter(Number.isSafeInteger);
        if (prices.length === 0 || prices.some(price => adjustment.value > maxCouponDeduction(price))) throw failure("invalid_coupon");
      }
      const batchId = newId("rrbat_");
      const ids = [];
      for (let i = 0; i < input.count; i += 1) {
        const id = newId("rrcpn_");
        let code = newCode();
        while (q.couponByCode.get(code)) code = newCode();
        q.insertCoupon.run(id, code, batchId, adjustment.kind, adjustment.value, allSkus ? 1 : 0, expiresAt, at, input.issuedBy);
        for (const skuId of skuIds) q.insertCouponSku.run(id, skuId);
        ids.push(id);
      }
      const skuMap = skuMapNow();
      return { batchId, items: ids.map(id => adminCouponView(q.couponById.get(id), at, skuMap)) };
    }).immediate();
  });

  // Void is only possible before redemption.
  const voidCoupons = guarded(input => {
    exactKeys(input, ["couponIds", "voidedBy"]);
    const ids = idList(input.couponIds, COUPON_ID);
    if (typeof input.voidedBy !== "string" || !ACTOR.test(input.voidedBy)) throw failure("invalid_input");
    return database.transaction(() => {
      const rows = ids.map(id => q.couponById.get(id));
      if (rows.some(row => !row)) throw failure("coupon_not_found");
      if (rows.some(row => row.voided_at || row.redeemed_at)) throw failure("coupon_not_voidable");
      const at = now();
      for (const id of ids) if (q.voidCoupon.run(at, input.voidedBy, id).changes !== 1) throw failure("coupon_not_voidable");
      return { voided: ids.length };
    }).immediate();
  });

  // Binds a code to the caller's account. Exactly-once: the conditional update
  // only succeeds while unredeemed, unvoided and unexpired. Every attempt is
  // logged with a 12-hex fingerprint only. Failures (unknown, used, voided,
  // expired, malformed) share one generic error. Per-account and per-client
  // failure budgets lock out brute force for a rolling window.
  const redeemCoupon = guarded(input => {
    exactKeys(input, ["accountRef", "clientKey", "code"]);
    if (typeof input.accountRef !== "string" || !ACCOUNT_REF.test(input.accountRef)) throw failure("invalid_account");
    const clientKey = typeof input.clientKey === "string" && input.clientKey ? input.clientKey.slice(0, 128) : "unknown";
    const at = now();
    const since = new Date(Date.parse(at) - REDEEM_WINDOW_MS).toISOString();
    const hash = inputHash(input.code);
    const result = database.transaction(() => {
      if (q.accountFailures.get(input.accountRef, since).n >= REDEEM_MAX_ACCOUNT_FAILURES
        || q.clientFailures.get(clientKey, since).n >= REDEEM_MAX_CLIENT_FAILURES) {
        q.insertAttempt.run(input.accountRef, clientKey, hash, "rate_limited", at);
        return { error: "redeem_rate_limited" };
      }
      const code = normalizeCode(input.code);
      const row = code ? q.couponByCode.get(code) : null;
      if (!row || q.redeemCoupon.run(input.accountRef, at, row.id, at).changes !== 1) {
        q.insertAttempt.run(input.accountRef, clientKey, hash, "failed", at);
        return { error: "redeem_failed" };
      }
      q.insertAttempt.run(input.accountRef, clientKey, hash, "redeemed", at);
      return { row: q.couponById.get(row.id) };
    }).immediate();
    if (result.error) throw failure(result.error);
    return { coupon: accountCouponView(result.row, at, skuMapNow()) };
  });

  function accountCouponView(row, at, skuMap) {
    const status = couponStatus(row, at);
    return {
      code: displayCode(row.code), kind: row.kind, value: row.value, allSkus: row.all_skus === 1,
      skus: couponSkuList(row, skuMap), expiresAt: row.expires_at, redeemedAt: row.redeemed_at,
      status: status === "consumed" ? "used" : status === "expired" ? "expired" : "available",
      consumedAt: row.consumed_at, consumedOrderRef: row.consumed_order_ref, consumedAmount: row.consumed_amount
    };
  }

  // Owner-only listing: the account ref always comes from the caller's session.
  const listAccountCoupons = guarded(input => {
    exactKeys(input, ["accountRef"]);
    if (typeof input.accountRef !== "string" || !ACCOUNT_REF.test(input.accountRef)) throw failure("invalid_account");
    const at = now();
    const skuMap = skuMapNow();
    return { asOf: at, items: q.accountCoupons.all(input.accountRef).map(row => accountCouponView(row, at, skuMap)) };
  });

  // ---- Pricing / quote ----
  // With an accountRef the coupon must be redeemed by that account; without one
  // (admin preview) it only has to be live. Unknown and foreign codes look alike.
  function resolveCoupon(code, skuRow, accountRef, at) {
    if (code === undefined || code === null || code === "") return null;
    const normalized = normalizeCode(code);
    const row = normalized ? q.couponByCode.get(normalized) : null;
    if (!row || (accountRef && row.redeemed_by !== accountRef)) throw failure("coupon_not_found");
    const status = couponStatus(row, at);
    if (accountRef ? status !== "redeemed" : status !== "redeemed" && status !== "issued") throw failure("coupon_inactive");
    if (row.all_skus !== 1 && !q.couponSkus.all(row.id).some(item => item.sku_id === skuRow.id)) throw failure("coupon_not_applicable");
    return row;
  }

  function priceFor(skuId, couponCode, accountRef) {
    const skuRow = requireSku(skuId);
    if (accountRef !== undefined && accountRef !== null && (typeof accountRef !== "string" || !ACCOUNT_REF.test(accountRef))) throw failure("invalid_account");
    if (skuRow.base_coin_units === null) throw failure("sku_price_unset");
    const at = now();
    const coupon = resolveCoupon(couponCode, skuRow, accountRef, at);
    const breakdown = computeResidentialPrice({
      listPrice: skuRow.base_coin_units,
      coupon: coupon ? { code: displayCode(coupon.code), kind: coupon.kind, value: coupon.value } : null
    });
    return { skuRow, coupon, at, breakdown: { skuId: skuRow.id, sizeCode: skuRow.size_code, purchasable: skuView(skuRow).purchasable, quotedAt: at, ...breakdown } };
  }

  const quote = guarded(input => {
    exactKeys(input, ["skuId"], ["couponCode", "accountRef"]);
    return priceFor(input.skuId, input.couponCode, input.accountRef).breakdown;
  });

  // Order flow hook (#753): recompute and consume the coupon atomically with the
  // recorded price. The consume update is conditional (unconsumed, owned, live)
  // and coupon_id is unique on order prices, so concurrent orders cannot both
  // spend one coupon. Idempotent per orderRef. Fulfillment is not wired.
  const recordOrderPrice = guarded(input => {
    exactKeys(input, ["orderRef", "accountRef", "skuId"], ["couponCode"]);
    if (typeof input.orderRef !== "string" || !ACCOUNT_REF.test(input.orderRef)) throw failure("invalid_input");
    if (typeof input.accountRef !== "string" || !ACCOUNT_REF.test(input.accountRef)) throw failure("invalid_account");
    return database.transaction(() => {
      const existing = q.orderPrice.get(input.orderRef);
      if (existing) {
        const recorded = JSON.parse(existing.breakdown);
        const wanted = input.couponCode ? normalizeCode(input.couponCode) : null;
        const sameCoupon = (recorded.coupon?.code ? recorded.coupon.code.replace(/-/g, "") : null) === wanted;
        if (existing.account_ref !== input.accountRef || existing.sku_id !== input.skuId || !sameCoupon) throw failure("order_already_priced");
        return recorded;
      }
      const { skuRow, coupon, at, breakdown } = priceFor(input.skuId, input.couponCode, input.accountRef);
      if (!breakdown.purchasable) throw failure("sku_not_ready");
      if (coupon && q.consumeCoupon.run(input.accountRef, input.orderRef, breakdown.deduction, at, coupon.id, input.accountRef, at).changes !== 1) {
        throw failure("coupon_inactive");
      }
      const recorded = { ...breakdown, orderRef: input.orderRef };
      q.insertOrderPrice.run(input.orderRef, input.accountRef, skuRow.id, coupon?.id ?? null, breakdown.listPrice, breakdown.finalPrice, JSON.stringify(recorded), at);
      return recorded;
    }).immediate();
  });

  return { available: true, listSkus, getSku, saveSku, setSkuEnabled, previewUpstreams, importUpstreams,
    listUpstreams, setUpstreamsEnabled, deleteUpstreams, resolveRelayPool,
    listCoupons, generateCoupons, voidCoupons, redeemCoupon, listAccountCoupons, quote, recordOrderPrice, close };
}

export { isResidentialRelaySkuSizeCode };
