import express, { Router } from "express";
import { createHash } from "node:crypto";
import { resolveClientIp } from "../services/ip-address.mjs";

// Buyer-side, owner-only coupon listing. The account is taken exclusively from
// the authenticated Portal session; no query/body account selector exists.
const SESSION_REFERENCE = /^[a-z][a-z0-9_]{2,95}$/;
const PATH = "/api/portal/residential-relay-packs/coupons";
const REDEEM_PATH = `${PATH}/redeem`;
const SKUS_PATH = "/api/portal/residential-relay-packs/skus";
const QUOTE_PATH = "/api/portal/residential-relay-packs/checkout/quote";
const SKU_ID = /^rrsku_[0-9a-f]{32}$/;
const COUPON_ID = /^rrcpn_[0-9a-f]{32}$/;
// In-memory burst limit in front of the store's persistent failure budget.
const BURST_WINDOW_MS = 60_000;
const BURST_MAX_PER_ACCOUNT = 10;
const BURST_MAX_PER_CLIENT = 30;

function sendError(res, status, code) {
  res.set("Cache-Control", "no-store");
  res.status(status).json({ error: code });
}

function sessionHeader(req) {
  const raw = Array.isArray(req.rawHeaders) ? req.rawHeaders : [];
  let value = null;
  let count = 0;
  for (let i = 0; i + 1 < raw.length; i += 2) {
    if (typeof raw[i] === "string" && raw[i].toLowerCase() === "x-portal-session") { count += 1; value = raw[i + 1]; }
  }
  return count === 1 && typeof value === "string" ? value : null;
}

function storeOf(state) {
  const feature = state?.residentialRelayPack;
  if (!feature?.enabled || feature.available !== true || !feature.store
    || typeof feature.store.listAccountCoupons !== "function") return null;
  return feature.store;
}

function createBurstLimiter(nowFn) {
  const buckets = new Map();
  return (key, max) => {
    const now = nowFn();
    for (const [k, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(k);
    const bucket = buckets.get(key) ?? { count: 0, resetAt: now + BURST_WINDOW_MS };
    bucket.count += 1;
    buckets.set(key, bucket);
    return bucket.count <= max;
  };
}

function resolveSession(req, res, state, browserSessions) {
  const auth = state?.platform?.userPortalAuth;
  let session;
  try {
    const browser = browserSessions?.session?.(req) ?? null;
    if (browser) session = browser;
    else {
      const header = sessionHeader(req);
      if (!header || !SESSION_REFERENCE.test(header)) { sendError(res, 401, "invalid_session"); return null; }
      session = auth.requireSession({ sessionRef: header });
      if (!session || session.sessionRef !== header) throw new Error("session mismatch");
    }
  } catch { sendError(res, 401, "invalid_session"); return null; }
  const accountRef = session?.accountId;
  if (typeof accountRef !== "string" || !accountRef) { sendError(res, 401, "invalid_session"); return null; }
  return accountRef;
}

export function portalResidentialRelayCouponRoutes(state, { browserSessions, clientIpResolver, nowFn = () => Date.now() } = {}) {
  const router = Router();
  const allow = createBurstLimiter(nowFn);
  const clientIp = clientIpResolver || (req => resolveClientIp(req));
  const ready = (res) => {
    res.set("Cache-Control", "no-store");
    const store = storeOf(state);
    if (!store || typeof state?.platform?.userPortalAuth?.requireSession !== "function") {
      sendError(res, 503, "residential_relay_unavailable");
      return null;
    }
    return store;
  };
  router.post(REDEEM_PATH, express.json({ limit: "2kb" }), (req, res) => {
    const store = ready(res);
    if (!store) return;
    if (Object.keys(req.query || {}).length > 0) { sendError(res, 400, "invalid_input"); return; }
    const accountRef = resolveSession(req, res, state, browserSessions);
    if (!accountRef) return;
    // The client key is a hash of the resolved IP; raw IPs are not stored.
    const clientKey = createHash("sha256").update(`rr-client:${clientIp(req) || "unknown"}`).digest("hex").slice(0, 16);
    if (!allow(`a:${accountRef}`, BURST_MAX_PER_ACCOUNT) || !allow(`c:${clientKey}`, BURST_MAX_PER_CLIENT)) {
      res.set("Retry-After", "60");
      sendError(res, 429, "redeem_rate_limited");
      return;
    }
    const input = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : null;
    const keys = input ? Object.keys(input) : [];
    if (!input || keys.length !== 1 || keys[0] !== "code" || typeof input.code !== "string") {
      sendError(res, 400, "redeem_failed");
      return;
    }
    try {
      res.json(store.redeemCoupon({ accountRef, clientKey, code: input.code }));
    } catch (error) {
      if (error?.code === "redeem_rate_limited") { res.set("Retry-After", "900"); sendError(res, 429, "redeem_rate_limited"); return; }
      if (error?.code === "redeem_daily_limit") { sendError(res, 429, "redeem_daily_limit"); return; }
      if (error?.code === "redeem_failed") { sendError(res, 400, "redeem_failed"); return; }
      if (error?.code === "invalid_account") { sendError(res, 401, "invalid_session"); return; }
      sendError(res, 503, "residential_relay_unavailable");
    }
  });
  // Buyer catalogue: purchasable SKUs only, without upstream details.
  router.get(SKUS_PATH, (req, res) => {
    const store = ready(res);
    if (!store) return;
    if (Object.keys(req.query || {}).length > 0) { sendError(res, 400, "invalid_input"); return; }
    if (!resolveSession(req, res, state, browserSessions)) return;
    try {
      const items = store.listSkus().filter(sku => sku.purchasable).map(sku => ({
        id: sku.id, sizeCode: sku.sizeCode, quotaBytes: sku.quotaBytes, durationDays: sku.durationDays, listPrice: sku.baseCoinUnits }));
      res.json({ items });
    } catch { sendError(res, 503, "residential_relay_unavailable"); }
  });
  // Checkout quote: the server auto-applies the buyer's best eligible coupon;
  // couponId null opts out, an id switches. Never returns redeem codes.
  router.post(QUOTE_PATH, express.json({ limit: "2kb" }), (req, res) => {
    const store = ready(res);
    if (!store || typeof store.checkoutQuote !== "function") { if (store) sendError(res, 503, "residential_relay_unavailable"); return; }
    if (Object.keys(req.query || {}).length > 0) { sendError(res, 400, "invalid_input"); return; }
    const accountRef = resolveSession(req, res, state, browserSessions);
    if (!accountRef) return;
    const input = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : null;
    const keys = input ? Object.keys(input) : [];
    if (!input || keys.some(key => key !== "skuId" && key !== "couponId") || typeof input.skuId !== "string" || !SKU_ID.test(input.skuId)
      || (input.couponId !== undefined && input.couponId !== null && (typeof input.couponId !== "string" || !COUPON_ID.test(input.couponId)))) {
      sendError(res, 400, "invalid_input");
      return;
    }
    try {
      res.json(store.checkoutQuote({ accountRef, skuId: input.skuId, ...("couponId" in input ? { couponId: input.couponId } : {}) }));
    } catch (error) {
      const code = error?.code;
      if (code === "invalid_account") { sendError(res, 401, "invalid_session"); return; }
      if (code === "not_found") { sendError(res, 404, "not_found"); return; }
      if (["coupon_inactive", "coupon_not_found", "sku_price_unset"].includes(code)) { sendError(res, 409, code === "sku_price_unset" ? code : "coupon_inactive"); return; }
      sendError(res, 503, "residential_relay_unavailable");
    }
  });
  router.get(PATH, (req, res) => {
    const store = ready(res);
    if (!store) return;
    if (Object.keys(req.query || {}).length > 0) { sendError(res, 400, "invalid_input"); return; }
    const accountRef = resolveSession(req, res, state, browserSessions);
    if (!accountRef) return;
    try {
      res.json(store.listAccountCoupons({ accountRef }));
    } catch (error) {
      sendError(res, error?.code === "invalid_account" ? 401 : 503,
        error?.code === "invalid_account" ? "invalid_session" : "residential_relay_unavailable");
    }
  });
  return router;
}
