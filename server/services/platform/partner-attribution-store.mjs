import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const SAFE_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_:/-]{0,127}$/;
const SAFE_ROUTE_PATTERN = /^\/[A-Za-z0-9/_-]{0,127}$/;
const SAFE_PARAM_NAME_PATTERN = /^[A-Za-z0-9_:-]{1,64}$/;
const PARTNER_STATUSES = new Set(["draft", "active", "paused", "disabled", "review_required"]);
const CAMPAIGN_STATUSES = new Set(["draft", "active", "paused", "disabled"]);
const RISK_TIERS = new Set(["low", "standard", "elevated", "high", "blocked"]);
const TOUCH_TYPES = new Set([
  "first_touch",
  "last_touch",
  "session_touch",
  "provider_callback",
  "manual_adjustment"
]);
const UNSAFE_FIELD_PARTS = [
  "email",
  "phone",
  "url",
  "token",
  "secret",
  "password",
  "credential",
  "private",
  "raw",
  "contact",
  "payment_account"
];
const UNSAFE_VALUE_PATTERN =
  /https?:|token=|secret|credential|password|private|customer|@|\/sub\/|(?:\d{1,3}\.){3}\d{1,3}|[a-z0-9-]+\.[a-z]{2,}/i;

function attributionError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function ensureParentDirectory(dbPath) {
  if (dbPath && dbPath !== ":memory:") {
    mkdirSync(dirname(dbPath), { recursive: true });
  }
}

function text(value) {
  return String(value ?? "").trim();
}

function requiredText(value, field) {
  const normalized = text(value);
  if (!normalized) {
    throw attributionError("validation_error", `${field} is required`);
  }
  return normalized;
}

function optionalText(value) {
  const normalized = text(value);
  return normalized || null;
}

function safeRef(value, field) {
  const normalized = requiredText(value, field);
  if (!SAFE_REF_PATTERN.test(normalized) || UNSAFE_VALUE_PATTERN.test(normalized)) {
    throw attributionError("validation_error", `${field} must be a safe reference`);
  }
  return normalized;
}

function optionalSafeRef(value, field) {
  const normalized = optionalText(value);
  return normalized ? safeRef(normalized, field) : null;
}

function enumValue(value, field, allowed, fallback = null) {
  const normalized = optionalText(value) || fallback;
  if (!normalized || !allowed.has(normalized)) {
    throw attributionError("validation_error", `${field} is invalid`);
  }
  return normalized;
}

function positiveInteger(value, field, fallback) {
  const candidate = value == null || value === "" ? fallback : Number(value);
  if (!Number.isInteger(candidate) || candidate <= 0) {
    throw attributionError("validation_error", `${field} must be a positive integer`);
  }
  return candidate;
}

function isoText(value, field, fallback = null) {
  const raw = optionalText(value) || fallback;
  const date = new Date(requiredText(raw, field));
  if (Number.isNaN(date.getTime())) {
    throw attributionError("validation_error", `${field} must be a valid ISO timestamp`);
  }
  return date.toISOString();
}

function safeRoute(value, field) {
  const normalized = requiredText(value, field);
  if (!SAFE_ROUTE_PATTERN.test(normalized) || UNSAFE_VALUE_PATTERN.test(normalized)) {
    throw attributionError("validation_error", `${field} must be a safe route`);
  }
  return normalized;
}

function assertSafeObject(value, label) {
  if (value == null) return;
  if (Array.isArray(value) || typeof value !== "object") {
    throw attributionError("validation_error", `${label} must be an object`);
  }
  for (const [key, nested] of Object.entries(value)) {
    const normalizedKey = String(key).toLowerCase();
    if (UNSAFE_FIELD_PARTS.some((part) => normalizedKey.includes(part))) {
      throw attributionError("validation_error", "unsafe field is not allowed in partner attribution metadata");
    }
    assertSafeValue(nested, label);
  }
}

function assertSafeValue(value, label) {
  if (value == null) return;
  if (Array.isArray(value)) {
    value.forEach((item) => assertSafeValue(item, label));
    return;
  }
  if (typeof value === "object") {
    assertSafeObject(value, label);
    return;
  }
  if (typeof value === "string" && UNSAFE_VALUE_PATTERN.test(value)) {
    throw attributionError("validation_error", "unsafe value is not allowed in partner attribution metadata");
  }
}

function jsonObject(value, field) {
  if (value == null) {
    return "{}";
  }
  assertSafeObject(value, field);
  return JSON.stringify(value);
}

function parseJsonObject(value) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function jsonArray(value, field) {
  if (value == null) return "[]";
  if (!Array.isArray(value)) {
    throw attributionError("validation_error", `${field} must be an array`);
  }
  return JSON.stringify(value);
}

function parseJsonArray(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeAllowedParams(value = []) {
  if (!Array.isArray(value)) {
    throw attributionError("validation_error", "allowedParams must be an array");
  }
  const seen = new Set();
  const normalized = [];
  for (const item of value) {
    const param = requiredText(item, "allowedParams").toLowerCase();
    if (!SAFE_PARAM_NAME_PATTERN.test(param) || UNSAFE_FIELD_PARTS.some((part) => param.includes(part))) {
      throw attributionError("validation_error", "allowedParams contains an unsafe parameter");
    }
    if (seen.has(param)) continue;
    seen.add(param);
    normalized.push(param);
  }
  return normalized;
}

function normalizeParams(input = {}, allowedParams = []) {
  assertSafeObject(input, "params");
  const allowed = new Set(allowedParams);
  const normalized = {};
  for (const [key, value] of Object.entries(input || {})) {
    const param = String(key || "").trim().toLowerCase();
    if (!allowed.has(param)) continue;
    if (!SAFE_PARAM_NAME_PATTERN.test(param)) continue;
    const normalizedValue = text(value);
    if (!normalizedValue) continue;
    assertSafeValue(normalizedValue, "params");
    normalized[param] = normalizedValue;
  }
  return normalized;
}

function touchRefFor(idempotencyKey) {
  return `touch_${createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 16)}`;
}

function plusDays(iso, days) {
  const date = new Date(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function mapPartner(row) {
  if (!row) return null;
  return {
    partnerRef: row.partner_ref,
    status: row.status,
    riskTier: row.risk_tier,
    payoutPolicyRef: row.payout_policy_ref,
    defaultAttributionWindowDays: row.default_attribution_window_days,
    safeDisplayName: row.safe_display_name,
    metadataSummary: parseJsonObject(row.metadata_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapCampaign(row) {
  if (!row) return null;
  return {
    campaignRef: row.campaign_ref,
    partnerRef: row.partner_ref,
    status: row.status,
    provider: row.provider,
    providerCampaignId: row.provider_campaign_id,
    landingRoute: row.landing_route,
    allowedParams: parseJsonArray(row.allowed_params_json),
    attributionWindowDays: row.attribution_window_days,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapTouch(row) {
  if (!row) return null;
  return {
    touchRef: row.touch_ref,
    provider: row.provider,
    partnerRef: row.partner_ref,
    campaignRef: row.campaign_ref,
    visitorRef: row.visitor_ref,
    sessionRef: row.session_ref,
    providerClickRef: row.provider_click_ref,
    landingRoute: row.landing_route,
    touchType: row.touch_type,
    observedAt: row.observed_at,
    expiresAt: row.expires_at,
    idempotencyKey: row.idempotency_key,
    normalizedParams: parseJsonObject(row.normalized_params_json),
    metadataSummary: parseJsonObject(row.metadata_json),
    isFirstTouch: row.is_first_touch === 1,
    isLastTouch: row.is_last_touch === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function ensureSchema(db) {
  db.exec(`
    create table if not exists platform_partners (
      partner_ref text primary key,
      status text not null,
      risk_tier text not null,
      payout_policy_ref text not null,
      default_attribution_window_days integer not null,
      safe_display_name text not null,
      metadata_json text not null default '{}',
      created_at text not null,
      updated_at text not null
    );

    create table if not exists platform_partner_campaigns (
      campaign_ref text primary key,
      partner_ref text not null references platform_partners(partner_ref),
      status text not null,
      provider text not null,
      provider_campaign_id text,
      landing_route text not null,
      allowed_params_json text not null default '[]',
      attribution_window_days integer not null,
      created_at text not null,
      updated_at text not null
    );

    create table if not exists platform_attribution_touches (
      touch_ref text primary key,
      provider text not null,
      partner_ref text not null references platform_partners(partner_ref),
      campaign_ref text not null references platform_partner_campaigns(campaign_ref),
      visitor_ref text not null,
      session_ref text not null,
      provider_click_ref text,
      landing_route text not null,
      touch_type text not null,
      observed_at text not null,
      expires_at text not null,
      idempotency_key text not null unique,
      normalized_params_json text not null default '{}',
      metadata_json text not null default '{}',
      is_first_touch integer not null default 0,
      is_last_touch integer not null default 0,
      created_at text not null,
      updated_at text not null
    );

    create index if not exists idx_platform_attribution_touches_visitor
      on platform_attribution_touches(visitor_ref, observed_at, touch_ref);
    create index if not exists idx_platform_attribution_touches_campaign
      on platform_attribution_touches(campaign_ref, observed_at, touch_ref);
  `);
}

export function createPartnerAttributionStore({ dbPath = ":memory:", database } = {}) {
  ensureParentDirectory(dbPath);
  const db = database || new Database(dbPath);
  const ownsDatabase = !database;
  db.pragma("foreign_keys = ON");
  ensureSchema(db);

  function getPartner(partnerRef) {
    return mapPartner(db.prepare(`
      select * from platform_partners where partner_ref = ?
    `).get(safeRef(partnerRef, "partnerRef")));
  }

  function getCampaign(campaignRef) {
    return mapCampaign(db.prepare(`
      select * from platform_partner_campaigns where campaign_ref = ?
    `).get(safeRef(campaignRef, "campaignRef")));
  }

  function upsertPartner(input = {}) {
    const now = new Date().toISOString();
    const partner = {
      partnerRef: safeRef(input.partnerRef || input.partner_ref, "partnerRef"),
      status: enumValue(input.status, "status", PARTNER_STATUSES, "draft"),
      riskTier: enumValue(input.riskTier || input.risk_tier, "riskTier", RISK_TIERS, "standard"),
      payoutPolicyRef: safeRef(input.payoutPolicyRef || input.payout_policy_ref, "payoutPolicyRef"),
      defaultAttributionWindowDays: positiveInteger(
        input.defaultAttributionWindowDays || input.default_attribution_window_days,
        "defaultAttributionWindowDays",
        30
      ),
      safeDisplayName: requiredText(input.safeDisplayName || input.safe_display_name, "safeDisplayName"),
      metadataJson: jsonObject(input.metadataSummary || input.metadata_summary, "metadataSummary"),
      createdAt: isoText(input.createdAt || input.created_at, "createdAt", now),
      updatedAt: isoText(input.updatedAt || input.updated_at, "updatedAt", now)
    };
    assertSafeValue(partner.safeDisplayName, "safeDisplayName");
    db.prepare(`
      insert into platform_partners (
        partner_ref, status, risk_tier, payout_policy_ref,
        default_attribution_window_days, safe_display_name, metadata_json,
        created_at, updated_at
      ) values (
        @partnerRef, @status, @riskTier, @payoutPolicyRef,
        @defaultAttributionWindowDays, @safeDisplayName, @metadataJson,
        @createdAt, @updatedAt
      )
      on conflict(partner_ref) do update set
        status = excluded.status,
        risk_tier = excluded.risk_tier,
        payout_policy_ref = excluded.payout_policy_ref,
        default_attribution_window_days = excluded.default_attribution_window_days,
        safe_display_name = excluded.safe_display_name,
        metadata_json = excluded.metadata_json,
        updated_at = excluded.updated_at
    `).run(partner);
    return getPartner(partner.partnerRef);
  }

  function upsertCampaign(input = {}) {
    const now = new Date().toISOString();
    const partnerRef = safeRef(input.partnerRef || input.partner_ref, "partnerRef");
    const allowedParams = normalizeAllowedParams(input.allowedParams || input.allowed_params || []);
    const landingRoute = safeRoute(input.landingRoute || input.landing_route, "landingRoute");
    const partner = getPartner(partnerRef);
    if (!partner) {
      throw attributionError("not_found", "partner not found");
    }
    const campaign = {
      campaignRef: safeRef(input.campaignRef || input.campaign_ref, "campaignRef"),
      partnerRef: partner.partnerRef,
      status: enumValue(input.status, "status", CAMPAIGN_STATUSES, "draft"),
      provider: safeRef(input.provider, "provider"),
      providerCampaignId: optionalSafeRef(input.providerCampaignId || input.provider_campaign_id, "providerCampaignId"),
      landingRoute,
      allowedParamsJson: jsonArray(allowedParams, "allowedParams"),
      attributionWindowDays: positiveInteger(
        input.attributionWindowDays || input.attribution_window_days,
        "attributionWindowDays",
        partner.defaultAttributionWindowDays
      ),
      createdAt: isoText(input.createdAt || input.created_at, "createdAt", now),
      updatedAt: isoText(input.updatedAt || input.updated_at, "updatedAt", now)
    };
    db.prepare(`
      insert into platform_partner_campaigns (
        campaign_ref, partner_ref, status, provider, provider_campaign_id,
        landing_route, allowed_params_json, attribution_window_days,
        created_at, updated_at
      ) values (
        @campaignRef, @partnerRef, @status, @provider, @providerCampaignId,
        @landingRoute, @allowedParamsJson, @attributionWindowDays,
        @createdAt, @updatedAt
      )
      on conflict(campaign_ref) do update set
        partner_ref = excluded.partner_ref,
        status = excluded.status,
        provider = excluded.provider,
        provider_campaign_id = excluded.provider_campaign_id,
        landing_route = excluded.landing_route,
        allowed_params_json = excluded.allowed_params_json,
        attribution_window_days = excluded.attribution_window_days,
        updated_at = excluded.updated_at
    `).run(campaign);
    return getCampaign(campaign.campaignRef);
  }

  function recalculateTouchMarkers(visitorRef) {
    const rows = db.prepare(`
      select touch_ref
      from platform_attribution_touches
      where visitor_ref = ?
      order by observed_at asc, touch_ref asc
    `).all(visitorRef);
    if (rows.length === 0) return;
    const firstRef = rows[0].touch_ref;
    const lastRef = rows[rows.length - 1].touch_ref;
    db.prepare(`
      update platform_attribution_touches
      set is_first_touch = case when touch_ref = @firstRef then 1 else 0 end,
          is_last_touch = case when touch_ref = @lastRef then 1 else 0 end
      where visitor_ref = @visitorRef
    `).run({ firstRef, lastRef, visitorRef });
  }

  function recordAttributionTouch(input = {}) {
    const idempotencyKey = safeRef(input.idempotencyKey || input.idempotency_key, "idempotencyKey");
    const existing = mapTouch(db.prepare(`
      select * from platform_attribution_touches where idempotency_key = ?
    `).get(idempotencyKey));
    if (existing) {
      return { ...existing, duplicate: true };
    }

    const campaign = getCampaign(input.campaignRef || input.campaign_ref);
    if (!campaign) {
      throw attributionError("not_found", "campaign not found");
    }
    const partner = getPartner(input.partnerRef || input.partner_ref);
    if (!partner || partner.partnerRef !== campaign.partnerRef) {
      throw attributionError("validation_error", "campaign does not belong to partner");
    }
    if (campaign.status !== "active" || partner.status !== "active") {
      throw attributionError("validation_error", "partner and campaign must be active");
    }

    const now = new Date().toISOString();
    const observedAt = isoText(input.observedAt || input.observed_at, "observedAt", now);
    const params = normalizeParams(input.params || input.normalizedParams || input.normalized_params, campaign.allowedParams);
    const touch = {
      touchRef: optionalSafeRef(input.touchRef || input.touch_ref, "touchRef") || touchRefFor(idempotencyKey),
      provider: safeRef(input.provider || campaign.provider, "provider"),
      partnerRef: partner.partnerRef,
      campaignRef: campaign.campaignRef,
      visitorRef: safeRef(input.visitorRef || input.visitor_ref, "visitorRef"),
      sessionRef: safeRef(input.sessionRef || input.session_ref, "sessionRef"),
      providerClickRef: optionalSafeRef(input.providerClickRef || input.provider_click_ref, "providerClickRef"),
      landingRoute: safeRoute(input.landingRoute || input.landing_route || campaign.landingRoute, "landingRoute"),
      touchType: enumValue(input.touchType || input.touch_type, "touchType", TOUCH_TYPES, "session_touch"),
      observedAt,
      expiresAt: isoText(input.expiresAt || input.expires_at, "expiresAt", plusDays(observedAt, campaign.attributionWindowDays)),
      idempotencyKey,
      normalizedParamsJson: jsonObject(params, "params"),
      metadataJson: jsonObject(input.metadataSummary || input.metadata_summary, "metadataSummary"),
      createdAt: isoText(input.createdAt || input.created_at, "createdAt", now),
      updatedAt: isoText(input.updatedAt || input.updated_at, "updatedAt", now)
    };

    db.prepare(`
      insert into platform_attribution_touches (
        touch_ref, provider, partner_ref, campaign_ref, visitor_ref, session_ref,
        provider_click_ref, landing_route, touch_type, observed_at, expires_at,
        idempotency_key, normalized_params_json, metadata_json,
        created_at, updated_at
      ) values (
        @touchRef, @provider, @partnerRef, @campaignRef, @visitorRef, @sessionRef,
        @providerClickRef, @landingRoute, @touchType, @observedAt, @expiresAt,
        @idempotencyKey, @normalizedParamsJson, @metadataJson,
        @createdAt, @updatedAt
      )
    `).run(touch);
    recalculateTouchMarkers(touch.visitorRef);
    return mapTouch(db.prepare(`
      select * from platform_attribution_touches where touch_ref = ?
    `).get(touch.touchRef));
  }

  function listAttributionTouches(filters = {}) {
    const clauses = [];
    const params = {};
    if (filters.visitorRef || filters.visitor_ref) {
      clauses.push("visitor_ref = @visitorRef");
      params.visitorRef = safeRef(filters.visitorRef || filters.visitor_ref, "visitorRef");
    }
    if (filters.sessionRef || filters.session_ref) {
      clauses.push("session_ref = @sessionRef");
      params.sessionRef = safeRef(filters.sessionRef || filters.session_ref, "sessionRef");
    }
    if (filters.campaignRef || filters.campaign_ref) {
      clauses.push("campaign_ref = @campaignRef");
      params.campaignRef = safeRef(filters.campaignRef || filters.campaign_ref, "campaignRef");
    }
    const where = clauses.length ? `where ${clauses.join(" and ")}` : "";
    return db.prepare(`
      select * from platform_attribution_touches
      ${where}
      order by observed_at asc, touch_ref asc
    `).all(params).map(mapTouch);
  }

  return {
    upsertPartner,
    getPartner,
    upsertCampaign,
    getCampaign,
    recordAttributionTouch,
    listAttributionTouches,
    close() {
      if (ownsDatabase) {
        db.close();
      }
    }
  };
}
