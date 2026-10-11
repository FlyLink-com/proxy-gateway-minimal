import { createHash, createHmac, randomBytes } from "node:crypto";
import { isIP } from "node:net";

import { normalizeCoinCommerceOffer } from "../services/platform/coin-commerce-domain.mjs";
import { resolveClientIp } from "../services/ip-address.mjs";

export const PUBLIC_CATALOG_PATH = "/api/portal/public/catalog";
export const PUBLIC_CATALOG_SCHEMA_VERSION = "portal-public-catalog/v1";

const CACHE_TTL_MS = 60_000;
const CACHE_MAX_AGE_SECONDS = 60;
const RATE_WINDOW_MS = 60_000;
const RATE_WINDOW_MAX = 10;
const RATE_COUNTER_ROWS = 4;
const RATE_COUNTER_WIDTH = 4_096;
const OFFER_FIELDS = [
  "offerRef",
  "offerVersionRef",
  "version",
  "category",
  "title",
  "summary",
  "importantNotices",
  "baseCoinUnits",
  "referencePrice",
  "acceptedCoinTypes",
  "delivery"
];
const DELIVERY_FIELDS = [
  "kind",
  "durationDays",
  "monthlyTrafficGb",
  "trafficGb",
  "neverExpires",
  "discountBasisPoints"
];

function sendError(res, status, code, retryable) {
  const body = JSON.stringify({
    error: { code, retryable }
  });
  res.status(status);
  res.set("Cache-Control", "no-store");
  res.set("Content-Type", "application/json; charset=utf-8");
  res.removeHeader("ETag");
  res.end(body);
}

function rawTarget(req) {
  return typeof req.originalUrl === "string" ? req.originalUrl : req.url;
}

function rawPathname(req) {
  const target = rawTarget(req);
  if (typeof target !== "string") return "";
  const queryIndex = target.indexOf("?");
  return queryIndex === -1 ? target : target.slice(0, queryIndex);
}

function hasQuery(req) {
  const target = rawTarget(req);
  return typeof target === "string" && target.includes("?");
}

function readOwn(value, field) {
  if (!value || (typeof value !== "object" && typeof value !== "function")) {
    return undefined;
  }
  const descriptor = Object.getOwnPropertyDescriptor(value, field);
  if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
    return undefined;
  }
  return descriptor.value;
}

function copyKnown(value, fields) {
  const result = {};
  for (const field of fields) result[field] = readOwn(value, field);
  return result;
}

function copyList(value) {
  if (!Array.isArray(value)) return value;
  return value.slice();
}

function commerceOfferInput(input) {
  const value = copyKnown(input, OFFER_FIELDS);
  value.title = copyKnown(value.title, ["zh", "en"]);
  value.summary = copyKnown(value.summary, ["zh", "en"]);
  const notices = copyKnown(value.importantNotices, ["zh", "en"]);
  value.importantNotices = {
    zh: copyList(notices.zh),
    en: copyList(notices.en)
  };
  value.referencePrice = copyKnown(value.referencePrice, [
    "currency",
    "amountMinor"
  ]);
  value.acceptedCoinTypes = copyList(value.acceptedCoinTypes);
  value.delivery = copyKnown(value.delivery, DELIVERY_FIELDS);
  return value;
}

function projectTier(input) {
  const normalized = normalizeCoinCommerceOffer(commerceOfferInput(input));
  const plan = normalized.category === "plan";
  return {
    tierRef: normalized.offerRef,
    displayName: {
      zh: normalized.title.zh,
      en: normalized.title.en
    },
    traffic: {
      gigabytes: plan
        ? normalized.delivery.monthlyTrafficGb
        : normalized.delivery.trafficGb,
      period: plan ? "month" : "pack"
    },
    validity: {
      durationDays: plan ? normalized.delivery.durationDays : null,
      neverExpires: !plan
    },
    listPrice: {
      coinUnits: normalized.baseCoinUnits,
      currency: normalized.referencePrice.currency,
      amountMinor: normalized.referencePrice.amountMinor
    }
  };
}

function readPublishedCatalog(store) {
  if (
    !store
    || (typeof store !== "object" && typeof store !== "function")
    || typeof store.listPublishedCatalogOffers !== "function"
  ) {
    throw new Error("public catalog reader is unavailable");
  }
  const offers = store.listPublishedCatalogOffers();
  if (!Array.isArray(offers)) {
    throw new Error("public catalog reader returned a non-array");
  }
  return {
    schemaVersion: PUBLIC_CATALOG_SCHEMA_VERSION,
    tiers: offers.map(projectTier)
  };
}

function etagMatches(header, etag) {
  if (typeof header !== "string" || header.length === 0 || header.length > 2_048) {
    return false;
  }
  if (header.trim() === "*") return true;
  return header.split(",").some((part) => {
    let token = part.trim();
    if (token.startsWith("W/")) token = token.slice(2).trim();
    return token === etag;
  });
}

function readClock(nowFn) {
  const now = nowFn();
  if (
    !Number.isSafeInteger(now)
    || now < 0
    || now > Number.MAX_SAFE_INTEGER - CACHE_TTL_MS
  ) {
    throw new Error("public catalog clock is unavailable");
  }
  return now;
}

function rateIdentity(ip) {
  if (typeof ip !== "string") return null;
  const family = isIP(ip);
  if (family === 4) return `v4:${ip}`;
  if (family !== 6) return null;
  // URL's IPv6 parser canonicalizes case, compression and embedded IPv4.
  // Zone-qualified addresses are deliberately rejected, not truncated.
  let normalized;
  try {
    normalized = new URL(`http://[${ip}]/`).hostname.slice(1, -1);
  } catch {
    return null;
  }
  const [left, right] = normalized.split("::");
  const first = left ? left.split(":") : [];
  const last = right ? right.split(":") : [];
  const words = right === undefined ? first : [
    ...first, ...Array(8 - first.length - last.length).fill("0"), ...last
  ];
  const values = words.map(word => Number.parseInt(word, 16));
  if (values.slice(0, 5).every(word => word === 0) && values[5] === 0xffff) {
    return `v4:${values[6] >>> 8}.${values[6] & 255}.${values[7] >>> 8}.${values[7] & 255}`;
  }
  return `v6:${values.slice(0, 4).map(word => word.toString(16).padStart(4, "0")).join(":")}/64`;
}

function createRateLimiter(nowFn, resolveClientIpFn) {
  // A keyed count-min structure has fixed 16 KiB counter storage and no
  // client-admission/eviction boundary. Collisions can only over-count: they
  // may reject an unrelated source early, never clear a hot source's quota.
  // The key is process-local and cannot be chosen by an HTTP caller.
  const counters = new Uint8Array(RATE_COUNTER_ROWS * RATE_COUNTER_WIDTH);
  const key = randomBytes(32);
  let window = -1;
  let lastNow = -1;
  return function allow(req, res) {
    let now;
    try {
      now = readClock(nowFn);
    } catch {
      sendError(res, 503, "public_catalog_unavailable", true);
      return false;
    }
    let clientIp;
    try {
      clientIp = resolveClientIpFn(req);
    } catch {
      sendError(res, 503, "public_catalog_unavailable", true);
      return false;
    }
    const identity = rateIdentity(clientIp);
    if (!identity || now < lastNow) {
      sendError(res, 503, "public_catalog_unavailable", true);
      return false;
    }
    lastNow = now;
    const nextWindow = Math.floor(now / RATE_WINDOW_MS);
    if (nextWindow > window) {
      counters.fill(0);
      window = nextWindow;
    }
    const digest = createHmac("sha256", key).update(identity).digest();
    const slots = Array.from({ length: RATE_COUNTER_ROWS }, (_, row) => (
      row * RATE_COUNTER_WIDTH + digest.readUInt16BE(row * 2) % RATE_COUNTER_WIDTH
    ));
    if (Math.min(...slots.map(slot => counters[slot])) >= RATE_WINDOW_MAX) {
      res.set("Retry-After", String(Math.max(1,
        Math.ceil(((window + 1) * RATE_WINDOW_MS - now) / 1_000))));
      sendError(res, 429, "public_catalog_rate_limited", true);
      return false;
    }
    for (const slot of slots) counters[slot] = Math.min(RATE_WINDOW_MAX, counters[slot] + 1);
    return true;
  };
}

export function portalPublicCatalogRoutes(state, options = {}) {
  const store = state.platform?.coinCommerceStore;
  const nowFn = options.nowFn || Date.now;
  const resolveClientIpFn = options.resolveClientIpFn || ((req) => resolveClientIp(req, {
    trustedProxyCidrs: state.security?.trustedProxyCidrs
  }));
  const allowRequest = createRateLimiter(nowFn, resolveClientIpFn);
  let cache = null;

  return function portalPublicCatalogDispatcher(req, res, next) {
    if (rawPathname(req) !== PUBLIC_CATALOG_PATH) {
      next();
      return;
    }
    if (req.method !== "GET") {
      res.set("Allow", "GET");
      sendError(res, 405, "public_catalog_method_not_allowed", false);
      return;
    }
    if (!allowRequest(req, res)) return;
    if (hasQuery(req)) {
      sendError(res, 400, "public_catalog_request_invalid", false);
      return;
    }
    let now;
    try {
      now = readClock(nowFn);
    } catch {
      sendError(res, 503, "public_catalog_unavailable", true);
      return;
    }
    if (!cache || cache.expiresAt <= now) {
      let payload;
      try {
        payload = readPublishedCatalog(store);
      } catch {
        sendError(res, 503, "public_catalog_unavailable", true);
        return;
      }
      const body = JSON.stringify(payload);
      cache = {
        body,
        etag: `"${createHash("sha256").update(body).digest("hex")}"`,
        expiresAt: now + CACHE_TTL_MS
      };
    }
    res.set("Cache-Control", `public, max-age=${CACHE_MAX_AGE_SECONDS}`);
    res.set("ETag", cache.etag);
    const validator = req.headers["if-none-match"];
    if (etagMatches(validator, cache.etag)) {
      res.status(304).end();
      return;
    }
    res.type("application/json").send(cache.body);
  };
}
