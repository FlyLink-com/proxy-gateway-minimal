import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createPartnerAttributionEventLedger } from "./partner-attribution-event-ledger.mjs";

const SAFE_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_:/-]{0,127}$/;
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
const POLICY_STATUSES = new Set(["draft", "active", "paused", "disabled"]);
const POLICY_MODELS = new Set([
  "first_payment_cpa",
  "order_percentage",
  "renewal_share",
  "tiered"
]);
const CANDIDATE_STATUSES = new Set([
  "frozen",
  "payable_review",
  "reversed",
  "rejected"
]);
const REVERSAL_REASON_CODES = new Set([
  "refund",
  "chargeback",
  "risk_rejected",
  "duplicate_payment",
  "manual_rejection",
  "entitlement_rollback"
]);

function settlementError(code, message) {
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
    throw settlementError("validation_error", `${field} is required`);
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
    throw settlementError("validation_error", `${field} must be a safe reference`);
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
    throw settlementError("validation_error", `${field} is invalid`);
  }
  return normalized;
}

function integerValue(value, field, fallback = null, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const candidate = value == null || value === "" ? fallback : Number(value);
  if (!Number.isInteger(candidate) || candidate < min || candidate > max) {
    throw settlementError("validation_error", `${field} must be an integer between ${min} and ${max}`);
  }
  return candidate;
}

function optionalInteger(value, field, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (value == null || value === "") return null;
  return integerValue(value, field, null, { min, max });
}

function isoText(value, field, fallback = null) {
  const raw = optionalText(value) || fallback;
  const date = new Date(requiredText(raw, field));
  if (Number.isNaN(date.getTime())) {
    throw settlementError("validation_error", `${field} must be a valid ISO timestamp`);
  }
  return date.toISOString();
}

function plusDays(iso, days) {
  const date = new Date(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function hashText(prefix, value, length = 20) {
  return `${prefix}_${createHash("sha256").update(value).digest("hex").slice(0, length)}`;
}

function assertSafeObject(value, label) {
  if (value == null) return;
  if (Array.isArray(value) || typeof value !== "object") {
    throw settlementError("validation_error", `${label} must be an object`);
  }
  for (const [key, nested] of Object.entries(value)) {
    const normalizedKey = String(key).toLowerCase();
    if (UNSAFE_FIELD_PARTS.some((part) => normalizedKey.includes(part))) {
      throw settlementError("validation_error", "unsafe field is not allowed in settlement metadata");
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
    throw settlementError("validation_error", "unsafe value is not allowed in settlement metadata");
  }
}

function jsonObject(value, field) {
  if (value == null) return "{}";
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
  if (!Array.isArray(value)) {
    throw settlementError("validation_error", `${field} must be an array`);
  }
  value.forEach((item) => {
    if (typeof item === "string") {
      safeRef(item, field);
    } else {
      assertSafeValue(item, field);
    }
  });
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

function mapPolicy(row) {
  if (!row) return null;
  return {
    policyRef: row.policy_ref,
    status: row.status,
    model: row.model,
    freezeDays: row.freeze_days,
    currency: row.currency,
    amountCents: row.amount_cents,
    rateBps: row.rate_bps,
    metadataSummary: parseJsonObject(row.metadata_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapCandidate(row) {
  if (!row) return null;
  return {
    candidateRef: row.candidate_ref,
    orderRef: row.order_ref,
    accountRef: row.account_ref,
    paymentRef: row.payment_ref,
    entitlementRef: row.entitlement_ref,
    partnerRef: row.partner_ref,
    campaignRef: row.campaign_ref,
    touchRef: row.touch_ref,
    policyRef: row.policy_ref,
    model: row.model,
    currency: row.currency,
    basisAmountCents: row.basis_amount_cents,
    amountCents: row.amount_cents,
    rateBps: row.rate_bps,
    freezeUntil: row.freeze_until,
    status: row.status,
    reasonCode: row.reason_code,
    sourceEventRefs: parseJsonArray(row.source_event_refs_json),
    reversalEventRef: row.reversal_event_ref,
    idempotencyKey: row.idempotency_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    payableAt: row.payable_at,
    reversedAt: row.reversed_at
  };
}

function mapAuditEntry(row) {
  if (!row) return null;
  return {
    auditRef: row.audit_ref,
    candidateRef: row.candidate_ref,
    action: row.action,
    reasonCode: row.reason_code,
    eventRef: row.event_ref,
    occurredAt: row.occurred_at,
    metadataSummary: parseJsonObject(row.metadata_json),
    createdAt: row.created_at
  };
}

function ensureSchema(db) {
  db.exec(`
    create table if not exists platform_settlement_policies (
      policy_ref text primary key,
      status text not null,
      model text not null,
      freeze_days integer not null,
      currency text not null,
      amount_cents integer,
      rate_bps integer,
      metadata_json text not null default '{}',
      created_at text not null,
      updated_at text not null
    );

    create table if not exists platform_settlement_candidates (
      candidate_ref text primary key,
      order_ref text not null,
      account_ref text,
      payment_ref text not null,
      entitlement_ref text not null,
      partner_ref text not null,
      campaign_ref text not null,
      touch_ref text,
      policy_ref text not null,
      model text not null,
      currency text not null,
      basis_amount_cents integer not null,
      amount_cents integer not null,
      rate_bps integer,
      freeze_until text not null,
      status text not null,
      reason_code text,
      source_event_refs_json text not null default '[]',
      reversal_event_ref text,
      idempotency_key text not null unique,
      created_at text not null,
      updated_at text not null,
      payable_at text,
      reversed_at text
    );

    create index if not exists idx_platform_settlement_candidates_order
      on platform_settlement_candidates(order_ref, created_at, candidate_ref);
    create index if not exists idx_platform_settlement_candidates_status
      on platform_settlement_candidates(status, freeze_until, candidate_ref);
    create index if not exists idx_platform_settlement_candidates_partner
      on platform_settlement_candidates(partner_ref, created_at, candidate_ref);

    create table if not exists platform_settlement_candidate_audit_entries (
      audit_ref text primary key,
      candidate_ref text not null,
      action text not null,
      reason_code text,
      event_ref text,
      occurred_at text not null,
      metadata_json text not null default '{}',
      created_at text not null
    );

    create index if not exists idx_platform_settlement_candidate_audit_candidate
      on platform_settlement_candidate_audit_entries(candidate_ref, occurred_at, audit_ref);
  `);
}

function policyAmount(policy, paymentEvent) {
  const basisAmountCents = integerValue(
    paymentEvent.metadataSummary?.amountCents,
    "payment amountCents",
    null,
    { min: 1 }
  );
  const paymentCurrency = optionalSafeRef(paymentEvent.metadataSummary?.currency, "payment currency");
  if (paymentCurrency && paymentCurrency !== policy.currency) {
    throw settlementError("validation_error", "payment currency does not match settlement policy currency");
  }

  if (policy.model === "first_payment_cpa") {
    return {
      basisAmountCents,
      amountCents: integerValue(policy.amountCents, "amountCents", null, { min: 1 })
    };
  }
  if (policy.model === "order_percentage" || policy.model === "renewal_share") {
    const rateBps = integerValue(policy.rateBps, "rateBps", null, { min: 1, max: 10000 });
    return {
      basisAmountCents,
      amountCents: Math.round((basisAmountCents * rateBps) / 10000)
    };
  }
  if (policy.model === "tiered") {
    const tiers = Array.isArray(policy.metadataSummary.tiers) ? policy.metadataSummary.tiers : [];
    const tier = [...tiers]
      .filter((item) => Number.isInteger(item?.minAmountCents) && item.minAmountCents <= basisAmountCents)
      .sort((a, b) => b.minAmountCents - a.minAmountCents)[0];
    if (!tier) {
      throw settlementError("validation_error", "tiered policy requires a matching tier");
    }
    const amountCents = Number.isInteger(tier.amountCents)
      ? tier.amountCents
      : Math.round((basisAmountCents * integerValue(tier.rateBps, "tier rateBps", null, { min: 1, max: 10000 })) / 10000);
    return {
      basisAmountCents,
      amountCents: integerValue(amountCents, "tier amountCents", null, { min: 1 })
    };
  }
  throw settlementError("validation_error", "unsupported settlement policy model");
}

function firstByOccurrence(events, eventType) {
  return events.find((event) => event.eventType === eventType && event.status === "recorded") || null;
}

function eventsByType(events, eventType) {
  return events.filter((event) => event.eventType === eventType && event.status === "recorded");
}

function blockingReasons(events) {
  const reasons = [];
  if (eventsByType(events, "refund").length > 0) reasons.push("refund");
  if (eventsByType(events, "chargeback").length > 0) reasons.push("chargeback");
  if (eventsByType(events, "risk_rejected").length > 0) reasons.push("risk_rejected");
  if (eventsByType(events, "payment_success").length > 1) reasons.push("duplicate_payment");
  return reasons;
}

export function createPartnerSettlementCandidateEngine({
  dbPath = ":memory:",
  database,
  eventLedger
} = {}) {
  ensureParentDirectory(dbPath);
  const db = database || new Database(dbPath);
  const ownsDatabase = !database;
  const ledger = eventLedger || createPartnerAttributionEventLedger({ database: db });
  db.pragma("foreign_keys = ON");
  ensureSchema(db);

  function getSettlementPolicy(policyRef) {
    return mapPolicy(db.prepare(`
      select * from platform_settlement_policies where policy_ref = ?
    `).get(safeRef(policyRef, "policyRef")));
  }

  function upsertSettlementPolicy(input = {}) {
    const now = new Date().toISOString();
    const policy = {
      policyRef: safeRef(input.policyRef || input.policy_ref, "policyRef"),
      status: enumValue(input.status, "status", POLICY_STATUSES, "draft"),
      model: enumValue(input.model, "model", POLICY_MODELS),
      freezeDays: integerValue(input.freezeDays || input.freeze_days, "freezeDays", 0, { min: 0, max: 365 }),
      currency: safeRef(input.currency || "USD", "currency"),
      amountCents: optionalInteger(input.amountCents || input.amount_cents, "amountCents", { min: 1 }),
      rateBps: optionalInteger(input.rateBps || input.rate_bps, "rateBps", { min: 1, max: 10000 }),
      metadataJson: jsonObject(input.metadataSummary || input.metadata_summary, "metadataSummary"),
      createdAt: isoText(input.createdAt || input.created_at, "createdAt", now),
      updatedAt: isoText(input.updatedAt || input.updated_at, "updatedAt", now)
    };
    if (policy.model === "first_payment_cpa" && !policy.amountCents) {
      throw settlementError("validation_error", "amountCents is required for first_payment_cpa policy");
    }
    if ((policy.model === "order_percentage" || policy.model === "renewal_share") && !policy.rateBps) {
      throw settlementError("validation_error", "rateBps is required for percentage settlement policies");
    }
    db.prepare(`
      insert into platform_settlement_policies (
        policy_ref, status, model, freeze_days, currency, amount_cents,
        rate_bps, metadata_json, created_at, updated_at
      ) values (
        @policyRef, @status, @model, @freezeDays, @currency, @amountCents,
        @rateBps, @metadataJson, @createdAt, @updatedAt
      )
      on conflict(policy_ref) do update set
        status = excluded.status,
        model = excluded.model,
        freeze_days = excluded.freeze_days,
        currency = excluded.currency,
        amount_cents = excluded.amount_cents,
        rate_bps = excluded.rate_bps,
        metadata_json = excluded.metadata_json,
        updated_at = excluded.updated_at
    `).run(policy);
    return getSettlementPolicy(policy.policyRef);
  }

  function getSettlementCandidate(candidateRef) {
    return mapCandidate(db.prepare(`
      select * from platform_settlement_candidates where candidate_ref = ?
    `).get(safeRef(candidateRef, "candidateRef")));
  }

  function getCandidateByIdempotencyKey(idempotencyKey) {
    return mapCandidate(db.prepare(`
      select * from platform_settlement_candidates where idempotency_key = ?
    `).get(idempotencyKey));
  }

  function listSettlementCandidates(filters = {}) {
    const clauses = [];
    const params = {};
    if (filters.orderRef || filters.order_ref) {
      clauses.push("order_ref = @orderRef");
      params.orderRef = safeRef(filters.orderRef || filters.order_ref, "orderRef");
    }
    if (filters.status) {
      clauses.push("status = @status");
      params.status = enumValue(filters.status, "status", CANDIDATE_STATUSES);
    }
    if (filters.partnerRef || filters.partner_ref) {
      clauses.push("partner_ref = @partnerRef");
      params.partnerRef = safeRef(filters.partnerRef || filters.partner_ref, "partnerRef");
    }
    const where = clauses.length ? `where ${clauses.join(" and ")}` : "";
    return db.prepare(`
      select * from platform_settlement_candidates
      ${where}
      order by created_at asc, candidate_ref asc
    `).all(params).map(mapCandidate);
  }

  function addAuditEntry({ candidateRef, action, reasonCode = null, eventRef = null, occurredAt, metadataSummary = {} }) {
    const audit = {
      auditRef: hashText("audit", [candidateRef, action, reasonCode || "", eventRef || "", occurredAt].join("|"), 20),
      candidateRef: safeRef(candidateRef, "candidateRef"),
      action: safeRef(action, "action"),
      reasonCode: optionalSafeRef(reasonCode, "reasonCode"),
      eventRef: optionalSafeRef(eventRef, "eventRef"),
      occurredAt: isoText(occurredAt, "occurredAt"),
      metadataJson: jsonObject(metadataSummary, "metadataSummary"),
      createdAt: new Date().toISOString()
    };
    db.prepare(`
      insert or ignore into platform_settlement_candidate_audit_entries (
        audit_ref, candidate_ref, action, reason_code, event_ref,
        occurred_at, metadata_json, created_at
      ) values (
        @auditRef, @candidateRef, @action, @reasonCode, @eventRef,
        @occurredAt, @metadataJson, @createdAt
      )
    `).run(audit);
    return mapAuditEntry(db.prepare(`
      select * from platform_settlement_candidate_audit_entries where audit_ref = ?
    `).get(audit.auditRef));
  }

  function listCandidateAudit(filters = {}) {
    const candidateRef = safeRef(filters.candidateRef || filters.candidate_ref, "candidateRef");
    return db.prepare(`
      select * from platform_settlement_candidate_audit_entries
      where candidate_ref = ?
      order by occurred_at asc, audit_ref asc
    `).all(candidateRef).map(mapAuditEntry);
  }

  function evaluateOrderSettlement(input = {}) {
    const orderRef = safeRef(input.orderRef || input.order_ref, "orderRef");
    const policyRef = safeRef(input.policyRef || input.policy_ref, "policyRef");
    const evaluatedAt = isoText(input.evaluatedAt || input.evaluated_at, "evaluatedAt", new Date().toISOString());
    const policy = getSettlementPolicy(policyRef);
    if (!policy || policy.status !== "active") {
      throw settlementError("not_found", "active settlement policy not found");
    }

    const events = ledger.listSettlementSafeEvents({ orderRef });
    const payment = firstByOccurrence(events, "payment_success");
    const entitlement = firstByOccurrence(events, "entitlement_delivered");
    const blockedReasons = blockingReasons(events);
    if (!payment) blockedReasons.push("missing_payment_success");
    if (!entitlement) blockedReasons.push("missing_entitlement_delivered");
    if (blockedReasons.length > 0) {
      return {
        candidate: null,
        created: false,
        duplicate: false,
        blockedReasons
      };
    }

    const idempotencyKey = hashText("settlement", [orderRef, payment.paymentRef, entitlement.entitlementRef, policyRef].join("|"), 24);
    const existing = getCandidateByIdempotencyKey(idempotencyKey);
    if (existing) {
      return {
        candidate: existing,
        created: false,
        duplicate: true,
        blockedReasons: []
      };
    }

    const amount = policyAmount(policy, payment);
    const candidate = {
      candidateRef: hashText("candidate", idempotencyKey, 20),
      orderRef,
      accountRef: optionalSafeRef(payment.accountRef || entitlement.accountRef, "accountRef"),
      paymentRef: safeRef(payment.paymentRef, "paymentRef"),
      entitlementRef: safeRef(entitlement.entitlementRef, "entitlementRef"),
      partnerRef: safeRef(payment.partnerRef || entitlement.partnerRef, "partnerRef"),
      campaignRef: safeRef(payment.campaignRef || entitlement.campaignRef, "campaignRef"),
      touchRef: optionalSafeRef(payment.touchRef || entitlement.touchRef, "touchRef"),
      policyRef: policy.policyRef,
      model: policy.model,
      currency: policy.currency,
      basisAmountCents: amount.basisAmountCents,
      amountCents: amount.amountCents,
      rateBps: policy.rateBps,
      freezeUntil: plusDays(entitlement.occurredAt, policy.freezeDays),
      status: "frozen",
      reasonCode: null,
      sourceEventRefsJson: jsonArray([payment.eventRef, entitlement.eventRef], "sourceEventRefs"),
      reversalEventRef: null,
      idempotencyKey,
      createdAt: evaluatedAt,
      updatedAt: evaluatedAt,
      payableAt: null,
      reversedAt: null
    };
    db.prepare(`
      insert into platform_settlement_candidates (
        candidate_ref, order_ref, account_ref, payment_ref, entitlement_ref,
        partner_ref, campaign_ref, touch_ref, policy_ref, model, currency,
        basis_amount_cents, amount_cents, rate_bps, freeze_until, status,
        reason_code, source_event_refs_json, reversal_event_ref, idempotency_key,
        created_at, updated_at, payable_at, reversed_at
      ) values (
        @candidateRef, @orderRef, @accountRef, @paymentRef, @entitlementRef,
        @partnerRef, @campaignRef, @touchRef, @policyRef, @model, @currency,
        @basisAmountCents, @amountCents, @rateBps, @freezeUntil, @status,
        @reasonCode, @sourceEventRefsJson, @reversalEventRef, @idempotencyKey,
        @createdAt, @updatedAt, @payableAt, @reversedAt
      )
    `).run(candidate);
    const stored = getSettlementCandidate(candidate.candidateRef);
    addAuditEntry({
      candidateRef: stored.candidateRef,
      action: "candidate_created",
      occurredAt: evaluatedAt,
      metadataSummary: {
        policyRef: stored.policyRef,
        amountCents: stored.amountCents,
        currency: stored.currency
      }
    });
    ledger.recordEvent({
      eventType: "settlement_candidate_created",
      source: "settlement_engine",
      accountRef: stored.accountRef,
      orderRef: stored.orderRef,
      paymentRef: stored.paymentRef,
      entitlementRef: stored.entitlementRef,
      partnerRef: stored.partnerRef,
      campaignRef: stored.campaignRef,
      touchRef: stored.touchRef,
      occurredAt: evaluatedAt,
      idempotencyKey: hashText("settlement_create", stored.idempotencyKey, 24),
      metadataSummary: {
        candidateRef: stored.candidateRef,
        policyRef: stored.policyRef,
        model: stored.model,
        amountCents: stored.amountCents,
        currency: stored.currency,
        status: stored.status
      }
    });
    return {
      candidate: stored,
      created: true,
      duplicate: false,
      blockedReasons: []
    };
  }

  function promotePayableCandidates(input = {}) {
    const evaluatedAt = isoText(input.evaluatedAt || input.evaluated_at, "evaluatedAt", new Date().toISOString());
    const rows = db.prepare(`
      select * from platform_settlement_candidates
      where status = 'frozen' and freeze_until <= ?
      order by freeze_until asc, candidate_ref asc
    `).all(evaluatedAt);
    const promoted = [];
    for (const row of rows) {
      const current = mapCandidate(row);
      const fact = reversalFactForCandidate(current);
      if (fact) {
        recordSettlementReversal({
          candidateRef: current.candidateRef,
          reasonCode: fact.reasonCode,
          source: fact.event.source,
          eventRef: fact.event.eventRef,
          occurredAt: fact.event.occurredAt || evaluatedAt
        });
        continue;
      }
      db.prepare(`
        update platform_settlement_candidates
        set status = 'payable_review',
            payable_at = @evaluatedAt,
            updated_at = @evaluatedAt
        where candidate_ref = @candidateRef and status = 'frozen'
      `).run({ candidateRef: row.candidate_ref, evaluatedAt });
      const candidate = getSettlementCandidate(row.candidate_ref);
      if (candidate?.status === "payable_review") {
        addAuditEntry({
          candidateRef: candidate.candidateRef,
          action: "candidate_payable",
          occurredAt: evaluatedAt,
          metadataSummary: {
            status: "payable_review"
          }
        });
        promoted.push(candidate);
      }
    }
    return { promoted };
  }

  function recordSettlementReversal(input = {}) {
    const candidateRef = safeRef(input.candidateRef || input.candidate_ref, "candidateRef");
    const reasonCode = enumValue(input.reasonCode || input.reason_code, "reasonCode", REVERSAL_REASON_CODES);
    const source = safeRef(input.source || "settlement_engine", "source");
    const eventRef = optionalSafeRef(input.eventRef || input.event_ref, "eventRef");
    const occurredAt = isoText(input.occurredAt || input.occurred_at, "occurredAt", new Date().toISOString());
    const candidate = getSettlementCandidate(candidateRef);
    if (!candidate) {
      throw settlementError("not_found", "settlement candidate not found");
    }
    if (candidate.status === "reversed") {
      return { ...candidate, duplicate: true };
    }
    if (candidate.status !== "frozen" && candidate.status !== "payable_review") {
      return { ...candidate, duplicate: true };
    }
    db.prepare(`
      update platform_settlement_candidates
      set status = 'reversed',
          reason_code = @reasonCode,
          reversal_event_ref = @eventRef,
          reversed_at = @occurredAt,
          updated_at = @occurredAt
      where candidate_ref = @candidateRef and status in ('frozen', 'payable_review')
    `).run({
      candidateRef,
      reasonCode,
      eventRef,
      occurredAt
    });
    const reversed = getSettlementCandidate(candidateRef);
    addAuditEntry({
      candidateRef,
      action: "candidate_reversed",
      reasonCode,
      eventRef,
      occurredAt,
      metadataSummary: {
        status: "reversed"
      }
    });
    ledger.recordEvent({
      eventType: "settlement_reversed",
      source,
      accountRef: reversed.accountRef,
      orderRef: reversed.orderRef,
      paymentRef: reversed.paymentRef,
      entitlementRef: reversed.entitlementRef,
      partnerRef: reversed.partnerRef,
      campaignRef: reversed.campaignRef,
      touchRef: reversed.touchRef,
      occurredAt,
      idempotencyKey: hashText("settlement_reverse", [candidateRef, reasonCode, eventRef || occurredAt].join("|"), 24),
      metadataSummary: {
        candidateRef,
        policyRef: reversed.policyRef,
        reasonCode
      }
    });
    return reversed;
  }

  function reversalFactForCandidate(candidate) {
    const events = ledger.listSettlementSafeEvents({ orderRef: candidate.orderRef });
    const refund = firstByOccurrence(events, "refund");
    if (refund) return { reasonCode: "refund", event: refund };
    const chargeback = firstByOccurrence(events, "chargeback");
    if (chargeback) return { reasonCode: "chargeback", event: chargeback };
    const risk = firstByOccurrence(events, "risk_rejected");
    if (risk) return { reasonCode: "risk_rejected", event: risk };
    const payments = eventsByType(events, "payment_success");
    if (payments.length > 1) {
      return { reasonCode: "duplicate_payment", event: payments[1] };
    }
    return null;
  }

  function applyReversalEvents(input = {}) {
    const evaluatedAt = isoText(input.evaluatedAt || input.evaluated_at, "evaluatedAt", new Date().toISOString());
    const candidates = listSettlementCandidates()
      .filter((candidate) => candidate.status === "frozen" || candidate.status === "payable_review");
    const reversed = [];
    for (const candidate of candidates) {
      const fact = reversalFactForCandidate(candidate);
      if (!fact) continue;
      reversed.push(recordSettlementReversal({
        candidateRef: candidate.candidateRef,
        reasonCode: fact.reasonCode,
        source: fact.event.source,
        eventRef: fact.event.eventRef,
        occurredAt: fact.event.occurredAt || evaluatedAt
      }));
    }
    return { reversed };
  }

  return {
    upsertSettlementPolicy,
    getSettlementPolicy,
    evaluateOrderSettlement,
    promotePayableCandidates,
    applyReversalEvents,
    recordSettlementReversal,
    getSettlementCandidate,
    listSettlementCandidates,
    listCandidateAudit,
    close() {
      if (ownsDatabase) {
        db.close();
      }
    }
  };
}
