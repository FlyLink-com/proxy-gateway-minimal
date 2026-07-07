import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createPartnerAttributionEventLedger } from "./partner-attribution-event-ledger.mjs";
import { createPartnerAttributionStore } from "./partner-attribution-store.mjs";

const SAFE_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_:/-]{0,127}$/;
const SAFE_ROUTE_PATTERN = /^\/[A-Za-z0-9/_-]{0,127}$/;
const UNSAFE_VALUE_PATTERN =
  /https?:|token=|secret|credential|password|private|customer|@|\/sub\/|(?:\d{1,3}\.){3}\d{1,3}|[a-z0-9-]+\.[a-z]{2,}/i;
const DEFAULT_APPROVED_LANDING_ROUTES = new Set(["/portal/register", "/portal"]);
const CAPTURE_PARAM_NAMES = new Set([
  "partner_ref",
  "campaign_ref",
  "pid",
  "c",
  "af_sub1",
  "af_sub2",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term"
]);

function bindingError(code, message) {
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
    throw bindingError("validation_error", `${field} is required`);
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
    throw bindingError("validation_error", `${field} must be a safe reference`);
  }
  return normalized;
}

function optionalSafeRef(value, field) {
  const normalized = optionalText(value);
  return normalized ? safeRef(normalized, field) : null;
}

function safeRoute(value, field) {
  const normalized = requiredText(value, field);
  if (!SAFE_ROUTE_PATTERN.test(normalized) || UNSAFE_VALUE_PATTERN.test(normalized)) {
    throw bindingError("validation_error", `${field} must be a safe route`);
  }
  return normalized;
}

function isoText(value, field, fallback = null) {
  const raw = optionalText(value) || fallback;
  const date = new Date(requiredText(raw, field));
  if (Number.isNaN(date.getTime())) {
    throw bindingError("validation_error", `${field} must be a valid ISO timestamp`);
  }
  return date.toISOString();
}

function hashText(prefix, value, length = 20) {
  return `${prefix}_${createHash("sha256").update(value).digest("hex").slice(0, length)}`;
}

function normalizeCaptureParams(input = {}) {
  const params = input instanceof URLSearchParams
    ? Object.fromEntries(input.entries())
    : { ...(input || {}) };
  const normalized = {};
  const strippedParams = [];
  for (const [rawKey, rawValue] of Object.entries(params)) {
    const key = String(rawKey || "").trim().toLowerCase();
    if (!CAPTURE_PARAM_NAMES.has(key)) {
      if (key) strippedParams.push(key);
      continue;
    }
    const value = text(Array.isArray(rawValue) ? rawValue[0] : rawValue);
    if (value) {
      normalized[key] = value;
    }
  }
  return {
    normalized,
    strippedParams
  };
}

function assertApprovedLandingRoute(route, approvedLandingRoutes) {
  const landingRoute = safeRoute(route, "landingRoute");
  if (!approvedLandingRoutes.has(landingRoute)) {
    throw bindingError("validation_error", "landingRoute is not approved for attribution capture");
  }
  return landingRoute;
}

function ensureSchema(db) {
  db.exec(`
    create table if not exists platform_attribution_account_bindings (
      account_ref text primary key,
      visitor_ref text not null,
      first_touch_ref text not null,
      last_touch_ref text not null,
      session_touch_ref text,
      selected_touch_ref text not null,
      partner_ref text not null,
      campaign_ref text not null,
      registered_at text not null,
      created_at text not null,
      updated_at text not null
    );

    create table if not exists platform_attribution_order_bindings (
      order_ref text primary key,
      account_ref text not null,
      selected_touch_ref text not null,
      partner_ref text not null,
      campaign_ref text not null,
      checkout_started_at text not null,
      created_at text not null,
      updated_at text not null
    );

    create index if not exists idx_platform_attribution_order_bindings_account
      on platform_attribution_order_bindings(account_ref, checkout_started_at, order_ref);
  `);
}

function mapAccountBinding(row) {
  if (!row) return null;
  return {
    accountRef: row.account_ref,
    visitorRef: row.visitor_ref,
    firstTouchRef: row.first_touch_ref,
    lastTouchRef: row.last_touch_ref,
    sessionTouchRef: row.session_touch_ref,
    selectedTouchRef: row.selected_touch_ref,
    partnerRef: row.partner_ref,
    campaignRef: row.campaign_ref,
    registeredAt: row.registered_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapOrderBinding(row) {
  if (!row) return null;
  return {
    orderRef: row.order_ref,
    accountRef: row.account_ref,
    selectedTouchRef: row.selected_touch_ref,
    partnerRef: row.partner_ref,
    campaignRef: row.campaign_ref,
    checkoutStartedAt: row.checkout_started_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function createPortalAttributionBindingService({
  dbPath = ":memory:",
  database,
  attributionStore,
  eventLedger,
  approvedLandingRoutes = DEFAULT_APPROVED_LANDING_ROUTES
} = {}) {
  ensureParentDirectory(dbPath);
  const db = database || new Database(dbPath);
  const ownsDatabase = !database;
  const partnerAttribution = attributionStore || createPartnerAttributionStore({ database: db });
  const ledger = eventLedger || createPartnerAttributionEventLedger({ database: db });
  const approvedRoutes = new Set(Array.from(approvedLandingRoutes, (route) => safeRoute(route, "approvedLandingRoutes")));
  db.pragma("foreign_keys = ON");
  ensureSchema(db);

  function getAccountBinding(accountRef) {
    return mapAccountBinding(db.prepare(`
      select * from platform_attribution_account_bindings where account_ref = ?
    `).get(safeRef(accountRef, "accountRef")));
  }

  function getOrderBinding(orderRef) {
    return mapOrderBinding(db.prepare(`
      select * from platform_attribution_order_bindings where order_ref = ?
    `).get(safeRef(orderRef, "orderRef")));
  }

  function captureLandingAttribution(input = {}) {
    const now = new Date().toISOString();
    const landingRoute = assertApprovedLandingRoute(input.landingRoute || input.landing_route, approvedRoutes);
    const visitorRef = safeRef(input.visitorRef || input.visitor_ref, "visitorRef");
    const sessionRef = safeRef(input.sessionRef || input.session_ref, "sessionRef");
    const observedAt = isoText(input.observedAt || input.observed_at, "observedAt", now);
    const { normalized, strippedParams } = normalizeCaptureParams(input.params || input.query || {});
    const partnerRef = safeRef(normalized.partner_ref || normalized.pid, "partnerRef");
    const campaignRef = safeRef(normalized.campaign_ref || normalized.c, "campaignRef");
    const captureId = hashText("touch", [visitorRef, sessionRef, landingRoute, observedAt, partnerRef, campaignRef].join("|"));
    const touch = partnerAttribution.recordAttributionTouch({
      provider: "portal",
      partnerRef,
      campaignRef,
      visitorRef,
      sessionRef,
      providerClickRef: optionalSafeRef(normalized.af_sub1, "providerClickRef"),
      landingRoute,
      touchType: "session_touch",
      observedAt,
      idempotencyKey: captureId,
      params: normalized,
      metadataSummary: {
        captureSurface: "portal"
      }
    });
    ledger.recordEvent({
      eventType: "visit",
      source: "portal",
      partnerRef,
      campaignRef,
      touchRef: touch.touchRef,
      occurredAt: observedAt,
      idempotencyKey: hashText("visit", touch.idempotencyKey),
      metadataSummary: {
        landingRoute
      },
      providerEvidence: {
        provider: "portal",
        capturedParamCount: Object.keys(touch.normalizedParams).length
      }
    });
    return {
      touch,
      strippedParams
    };
  }

  function selectedTouchesForRegistration({ visitorRef, sessionRef }) {
    const touches = partnerAttribution.listAttributionTouches({ visitorRef });
    if (touches.length === 0) {
      throw bindingError("not_found", "attribution touch not found for visitor");
    }
    const firstTouch = touches[0];
    const lastTouch = touches[touches.length - 1];
    const sessionTouch = [...touches].reverse().find((touch) => touch.sessionRef === sessionRef) || null;
    const selectedTouch = sessionTouch || lastTouch;
    return {
      firstTouch,
      lastTouch,
      sessionTouch,
      selectedTouch
    };
  }

  function bindRegistration(input = {}) {
    const now = new Date().toISOString();
    const accountRef = safeRef(input.accountRef || input.account_ref, "accountRef");
    const visitorRef = safeRef(input.visitorRef || input.visitor_ref, "visitorRef");
    const sessionRef = safeRef(input.sessionRef || input.session_ref, "sessionRef");
    const registeredAt = isoText(input.occurredAt || input.occurred_at || input.registeredAt || input.registered_at, "occurredAt", now);
    const touches = selectedTouchesForRegistration({ visitorRef, sessionRef });
    const binding = {
      accountRef,
      visitorRef,
      firstTouchRef: touches.firstTouch.touchRef,
      lastTouchRef: touches.lastTouch.touchRef,
      sessionTouchRef: touches.sessionTouch?.touchRef || null,
      selectedTouchRef: touches.selectedTouch.touchRef,
      partnerRef: touches.selectedTouch.partnerRef,
      campaignRef: touches.selectedTouch.campaignRef,
      registeredAt,
      createdAt: now,
      updatedAt: now
    };
    db.prepare(`
      insert into platform_attribution_account_bindings (
        account_ref, visitor_ref, first_touch_ref, last_touch_ref,
        session_touch_ref, selected_touch_ref, partner_ref, campaign_ref,
        registered_at, created_at, updated_at
      ) values (
        @accountRef, @visitorRef, @firstTouchRef, @lastTouchRef,
        @sessionTouchRef, @selectedTouchRef, @partnerRef, @campaignRef,
        @registeredAt, @createdAt, @updatedAt
      )
      on conflict(account_ref) do update set
        visitor_ref = excluded.visitor_ref,
        first_touch_ref = excluded.first_touch_ref,
        last_touch_ref = excluded.last_touch_ref,
        session_touch_ref = excluded.session_touch_ref,
        selected_touch_ref = excluded.selected_touch_ref,
        partner_ref = excluded.partner_ref,
        campaign_ref = excluded.campaign_ref,
        registered_at = excluded.registered_at,
        updated_at = excluded.updated_at
    `).run(binding);
    ledger.recordEvent({
      eventType: "registration_success",
      source: "portal",
      accountRef,
      partnerRef: binding.partnerRef,
      campaignRef: binding.campaignRef,
      touchRef: binding.selectedTouchRef,
      occurredAt: registeredAt,
      idempotencyKey: hashText("registration", accountRef),
      metadataSummary: {
        binding: "portal_attribution"
      }
    });
    return getAccountBinding(accountRef);
  }

  function bindOrder(input = {}) {
    const now = new Date().toISOString();
    const accountRef = safeRef(input.accountRef || input.account_ref, "accountRef");
    const orderRef = safeRef(input.orderRef || input.order_ref, "orderRef");
    const checkoutStartedAt = isoText(input.occurredAt || input.occurred_at || input.checkoutStartedAt || input.checkout_started_at, "occurredAt", now);
    const accountBinding = getAccountBinding(accountRef);
    if (!accountBinding) {
      throw bindingError("not_found", "account attribution binding not found");
    }
    const binding = {
      orderRef,
      accountRef,
      selectedTouchRef: accountBinding.selectedTouchRef,
      partnerRef: accountBinding.partnerRef,
      campaignRef: accountBinding.campaignRef,
      checkoutStartedAt,
      createdAt: now,
      updatedAt: now
    };
    db.prepare(`
      insert into platform_attribution_order_bindings (
        order_ref, account_ref, selected_touch_ref, partner_ref, campaign_ref,
        checkout_started_at, created_at, updated_at
      ) values (
        @orderRef, @accountRef, @selectedTouchRef, @partnerRef, @campaignRef,
        @checkoutStartedAt, @createdAt, @updatedAt
      )
      on conflict(order_ref) do update set
        account_ref = excluded.account_ref,
        selected_touch_ref = excluded.selected_touch_ref,
        partner_ref = excluded.partner_ref,
        campaign_ref = excluded.campaign_ref,
        checkout_started_at = excluded.checkout_started_at,
        updated_at = excluded.updated_at
    `).run(binding);
    ledger.recordEvent({
      eventType: "checkout_started",
      source: "portal",
      accountRef,
      orderRef,
      partnerRef: binding.partnerRef,
      campaignRef: binding.campaignRef,
      touchRef: binding.selectedTouchRef,
      occurredAt: checkoutStartedAt,
      idempotencyKey: hashText("checkout", orderRef),
      metadataSummary: {
        binding: "portal_attribution"
      }
    });
    return getOrderBinding(orderRef);
  }

  function recordBackendPaymentSuccess(input = {}) {
    const orderRef = safeRef(input.orderRef || input.order_ref, "orderRef");
    const paymentRef = safeRef(input.paymentRef || input.payment_ref, "paymentRef");
    const binding = getOrderBinding(orderRef);
    if (!binding) {
      throw bindingError("not_found", "order attribution binding not found");
    }
    return ledger.recordEvent({
      eventType: "payment_success",
      source: "payment_backend",
      accountRef: binding.accountRef,
      orderRef,
      paymentRef,
      partnerRef: binding.partnerRef,
      campaignRef: binding.campaignRef,
      touchRef: binding.selectedTouchRef,
      occurredAt: isoText(input.occurredAt || input.occurred_at, "occurredAt", new Date().toISOString()),
      idempotencyKey: hashText("payment", [orderRef, paymentRef].join("|")),
      metadataSummary: input.metadataSummary || input.metadata_summary || {}
    });
  }

  function recordBackendEntitlementDelivered(input = {}) {
    const orderRef = safeRef(input.orderRef || input.order_ref, "orderRef");
    const paymentRef = optionalSafeRef(input.paymentRef || input.payment_ref, "paymentRef");
    const entitlementRef = safeRef(input.entitlementRef || input.entitlement_ref, "entitlementRef");
    const binding = getOrderBinding(orderRef);
    if (!binding) {
      throw bindingError("not_found", "order attribution binding not found");
    }
    return ledger.recordEvent({
      eventType: "entitlement_delivered",
      source: "entitlement_service",
      accountRef: binding.accountRef,
      orderRef,
      paymentRef,
      entitlementRef,
      partnerRef: binding.partnerRef,
      campaignRef: binding.campaignRef,
      touchRef: binding.selectedTouchRef,
      occurredAt: isoText(input.occurredAt || input.occurred_at, "occurredAt", new Date().toISOString()),
      idempotencyKey: hashText("entitlement", [orderRef, entitlementRef].join("|")),
      metadataSummary: input.metadataSummary || input.metadata_summary || {}
    });
  }

  return {
    captureLandingAttribution,
    bindRegistration,
    bindOrder,
    recordBackendPaymentSuccess,
    recordBackendEntitlementDelivered,
    getAccountBinding,
    getOrderBinding,
    close() {
      if (ownsDatabase) {
        db.close();
      }
    }
  };
}
