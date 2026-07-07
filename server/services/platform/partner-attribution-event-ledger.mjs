import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const SAFE_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_:/-]{0,127}$/;
const EVENT_TYPES = new Set([
  "visit",
  "registration_success",
  "checkout_started",
  "payment_success",
  "entitlement_delivered",
  "refund",
  "chargeback",
  "risk_rejected",
  "settlement_candidate_created",
  "settlement_reversed"
]);
const EVENT_STATUSES = new Set(["recorded", "ignored", "rejected", "reversed"]);
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
  "payment_account",
  "subscription",
  "runtime"
];
const UNSAFE_VALUE_PATTERN =
  /https?:|token=|secret|credential|password|private|customer|@|\/sub\/|(?:\d{1,3}\.){3}\d{1,3}|[a-z0-9-]+\.[a-z]{2,}/i;

function ledgerError(code, message) {
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
    throw ledgerError("validation_error", `${field} is required`);
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
    throw ledgerError("validation_error", `${field} must be a safe reference`);
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
    throw ledgerError("validation_error", `${field} is invalid`);
  }
  return normalized;
}

function isoText(value, field, fallback = null) {
  const raw = optionalText(value) || fallback;
  const date = new Date(requiredText(raw, field));
  if (Number.isNaN(date.getTime())) {
    throw ledgerError("validation_error", `${field} must be a valid ISO timestamp`);
  }
  return date.toISOString();
}

function assertSafeObject(value, label) {
  if (value == null) return;
  if (Array.isArray(value) || typeof value !== "object") {
    throw ledgerError("validation_error", `${label} must be an object`);
  }
  for (const [key, nested] of Object.entries(value)) {
    const normalizedKey = String(key).toLowerCase();
    if (UNSAFE_FIELD_PARTS.some((part) => normalizedKey.includes(part))) {
      throw ledgerError("validation_error", "unsafe field is not allowed in partner attribution event metadata");
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
    throw ledgerError("validation_error", "unsafe value is not allowed in partner attribution event metadata");
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

function hashText(prefix, value, length = 16) {
  return `${prefix}_${createHash("sha256").update(value).digest("hex").slice(0, length)}`;
}

function deterministicIdempotencyKey(event) {
  return hashText(
    "idem",
    JSON.stringify({
      eventType: event.eventType,
      source: event.source,
      accountRef: event.accountRef,
      orderRef: event.orderRef,
      paymentRef: event.paymentRef,
      entitlementRef: event.entitlementRef,
      partnerRef: event.partnerRef,
      campaignRef: event.campaignRef,
      touchRef: event.touchRef,
      occurredAt: event.occurredAt
    }),
    20
  );
}

function eventRefFor(idempotencyKey) {
  return hashText("event", idempotencyKey, 16);
}

function mapEvent(row) {
  if (!row) return null;
  return {
    eventRef: row.event_ref,
    eventType: row.event_type,
    source: row.source,
    accountRef: row.account_ref,
    orderRef: row.order_ref,
    paymentRef: row.payment_ref,
    entitlementRef: row.entitlement_ref,
    partnerRef: row.partner_ref,
    campaignRef: row.campaign_ref,
    touchRef: row.touch_ref,
    occurredAt: row.occurred_at,
    recordedAt: row.recorded_at,
    idempotencyKey: row.idempotency_key,
    status: row.status,
    metadataSummary: parseJsonObject(row.metadata_json),
    providerEvidence: parseJsonObject(row.provider_evidence_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapSettlementSafeEvent(row) {
  const event = mapEvent(row);
  if (!event) return null;
  return {
    eventRef: event.eventRef,
    eventType: event.eventType,
    status: event.status,
    source: event.source,
    accountRef: event.accountRef,
    orderRef: event.orderRef,
    paymentRef: event.paymentRef,
    entitlementRef: event.entitlementRef,
    partnerRef: event.partnerRef,
    campaignRef: event.campaignRef,
    touchRef: event.touchRef,
    occurredAt: event.occurredAt,
    recordedAt: event.recordedAt,
    metadataSummary: event.metadataSummary,
    providerEvidenceSummary: event.providerEvidence
  };
}

function ensureSchema(db) {
  db.exec(`
    create table if not exists platform_attribution_events (
      event_ref text primary key,
      event_type text not null,
      source text not null,
      account_ref text,
      order_ref text,
      payment_ref text,
      entitlement_ref text,
      partner_ref text,
      campaign_ref text,
      touch_ref text,
      occurred_at text not null,
      recorded_at text not null,
      idempotency_key text not null unique,
      status text not null,
      metadata_json text not null default '{}',
      provider_evidence_json text not null default '{}',
      created_at text not null,
      updated_at text not null
    );

    create index if not exists idx_platform_attribution_events_account
      on platform_attribution_events(account_ref, occurred_at, event_ref);
    create index if not exists idx_platform_attribution_events_order
      on platform_attribution_events(order_ref, occurred_at, event_ref);
    create index if not exists idx_platform_attribution_events_partner
      on platform_attribution_events(partner_ref, occurred_at, event_ref);
    create index if not exists idx_platform_attribution_events_type
      on platform_attribution_events(event_type, occurred_at, event_ref);
  `);
}

export function createPartnerAttributionEventLedger({ dbPath = ":memory:", database } = {}) {
  ensureParentDirectory(dbPath);
  const db = database || new Database(dbPath);
  const ownsDatabase = !database;
  db.pragma("foreign_keys = ON");
  ensureSchema(db);

  function getEvent(eventRef) {
    return mapEvent(db.prepare(`
      select * from platform_attribution_events where event_ref = ?
    `).get(safeRef(eventRef, "eventRef")));
  }

  function normalizeEventInput(input = {}) {
    const now = new Date().toISOString();
    const event = {
      eventType: enumValue(input.eventType || input.event_type, "eventType", EVENT_TYPES),
      source: safeRef(input.source, "source"),
      accountRef: optionalSafeRef(input.accountRef || input.account_ref, "accountRef"),
      orderRef: optionalSafeRef(input.orderRef || input.order_ref, "orderRef"),
      paymentRef: optionalSafeRef(input.paymentRef || input.payment_ref, "paymentRef"),
      entitlementRef: optionalSafeRef(input.entitlementRef || input.entitlement_ref, "entitlementRef"),
      partnerRef: optionalSafeRef(input.partnerRef || input.partner_ref, "partnerRef"),
      campaignRef: optionalSafeRef(input.campaignRef || input.campaign_ref, "campaignRef"),
      touchRef: optionalSafeRef(input.touchRef || input.touch_ref, "touchRef"),
      occurredAt: isoText(input.occurredAt || input.occurred_at, "occurredAt", now),
      recordedAt: isoText(input.recordedAt || input.recorded_at, "recordedAt", now),
      status: enumValue(input.status, "status", EVENT_STATUSES, "recorded"),
      metadataJson: jsonObject(input.metadataSummary || input.metadata_summary, "metadataSummary"),
      providerEvidenceJson: jsonObject(input.providerEvidence || input.provider_evidence, "providerEvidence"),
      createdAt: isoText(input.createdAt || input.created_at, "createdAt", now),
      updatedAt: isoText(input.updatedAt || input.updated_at, "updatedAt", now)
    };
    event.idempotencyKey =
      optionalSafeRef(input.idempotencyKey || input.idempotency_key, "idempotencyKey") ||
      deterministicIdempotencyKey(event);
    event.eventRef =
      optionalSafeRef(input.eventRef || input.event_ref, "eventRef") || eventRefFor(event.idempotencyKey);
    return event;
  }

  function recordEvent(input = {}) {
    const event = normalizeEventInput(input);
    const existing = mapEvent(db.prepare(`
      select * from platform_attribution_events where idempotency_key = ?
    `).get(event.idempotencyKey));
    if (existing) {
      return { ...existing, duplicate: true };
    }

    db.prepare(`
      insert into platform_attribution_events (
        event_ref, event_type, source, account_ref, order_ref, payment_ref,
        entitlement_ref, partner_ref, campaign_ref, touch_ref, occurred_at,
        recorded_at, idempotency_key, status, metadata_json,
        provider_evidence_json, created_at, updated_at
      ) values (
        @eventRef, @eventType, @source, @accountRef, @orderRef, @paymentRef,
        @entitlementRef, @partnerRef, @campaignRef, @touchRef, @occurredAt,
        @recordedAt, @idempotencyKey, @status, @metadataJson,
        @providerEvidenceJson, @createdAt, @updatedAt
      )
    `).run(event);
    return getEvent(event.eventRef);
  }

  function listEventRows(filters = {}) {
    const clauses = [];
    const params = {};
    const refFilters = [
      ["accountRef", "account_ref"],
      ["orderRef", "order_ref"],
      ["paymentRef", "payment_ref"],
      ["entitlementRef", "entitlement_ref"],
      ["partnerRef", "partner_ref"],
      ["campaignRef", "campaign_ref"],
      ["touchRef", "touch_ref"]
    ];
    for (const [field, column] of refFilters) {
      if (filters[field] || filters[column]) {
        clauses.push(`${column} = @${field}`);
        params[field] = safeRef(filters[field] || filters[column], field);
      }
    }
    if (filters.eventType || filters.event_type) {
      clauses.push("event_type = @eventType");
      params.eventType = enumValue(filters.eventType || filters.event_type, "eventType", EVENT_TYPES);
    }
    if (filters.status) {
      clauses.push("status = @status");
      params.status = enumValue(filters.status, "status", EVENT_STATUSES);
    }
    const where = clauses.length ? `where ${clauses.join(" and ")}` : "";
    return db.prepare(`
      select * from platform_attribution_events
      ${where}
      order by occurred_at asc, event_ref asc
    `).all(params);
  }

  function listEvents(filters = {}) {
    return listEventRows(filters).map(mapEvent);
  }

  function listSettlementSafeEvents(filters = {}) {
    return listEventRows(filters).map(mapSettlementSafeEvent);
  }

  return {
    recordEvent,
    getEvent,
    listEvents,
    listSettlementSafeEvents,
    close() {
      if (ownsDatabase) {
        db.close();
      }
    }
  };
}
