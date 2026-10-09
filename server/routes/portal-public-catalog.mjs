import { createHash } from "node:crypto";
import { isIP } from "node:net";

import { normalizeCoinCommerceOffer } from "../services/platform/coin-commerce-domain.mjs";
import { resolveClientIp } from "../services/ip-address.mjs";

export const PUBLIC_CATALOG_PATH = "/api/portal/public/catalog";
export const PUBLIC_CATALOG_SCHEMA_VERSION = "portal-public-catalog/v1";

const CACHE_TTL_MS = 60_000;
const CACHE_MAX_AGE_SECONDS = 60;
const RATE_WINDOW_MS = 60_000;
const RATE_WINDOW_MAX = 10;
const RATE_BUCKET_CAPACITY = 1_024;
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

function createRateLimiter(nowFn, resolveClientIpFn) {
  const buckets = new Map();
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
    if (typeof clientIp !== "string" || isIP(clientIp) === 0) {
      sendError(res, 503, "public_catalog_unavailable", true);
      return false;
    }
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
    const existing = buckets.get(clientIp);
    if (existing) {
      if (existing.count >= RATE_WINDOW_MAX) {
        const retryAfter = Math.max(
          1,
          Math.ceil((existing.resetAt - now) / 1_000)
        );
        res.set("Retry-After", String(retryAfter));
        sendError(res, 429, "public_catalog_rate_limited", true);
        return false;
      }
      existing.count += 1;
      return true;
    }
    if (buckets.size >= RATE_BUCKET_CAPACITY) {
      res.set("Retry-After", String(Math.ceil(RATE_WINDOW_MS / 1_000)));
      sendError(res, 429, "public_catalog_rate_limited", true);
      return false;
    }
    buckets.set(clientIp, { count: 1, resetAt: now + RATE_WINDOW_MS });
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
