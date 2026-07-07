const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const LEAD_STATUSES = new Set(["new", "reviewing", "converted", "rejected"]);
const ACCOUNT_STATUSES = new Set(["pending_review", "active", "suspended", "disabled"]);
const ENTITLEMENT_STATUSES = new Set(["pending", "active", "expired", "disabled", "suspended"]);
const ENTITLEMENT_PLANS = new Set(["pilot", "growth", "enterprise", "research"]);
const ACCESS_STATUSES = new Set(["pending", "issued", "revoked", "expired"]);
const ACCESS_DELIVERIES = new Set(["operator_issued", "config_file", "artifact"]);

function contractError(message) {
  const error = new Error(message);
  error.code = "validation_error";
  return error;
}

function nowIso(now) {
  const value = now instanceof Date ? now : new Date(now ?? Date.now());
  if (Number.isNaN(value.getTime())) {
    throw contractError("now must be a valid date");
  }
  return value.toISOString();
}

function cleanString(value, maxLength) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function requiredString(value, field, maxLength = 120) {
  const normalized = cleanString(value, maxLength);
  if (!normalized) {
    throw contractError(`${field} is required`);
  }
  return normalized;
}

function optionalString(value, maxLength = 120) {
  return cleanString(value, maxLength);
}

function normalizeEmail(value) {
  const email = requiredString(value, "email", 160).toLowerCase();
  if (!EMAIL_PATTERN.test(email)) {
    throw contractError("email is invalid");
  }
  return email;
}

function normalizeStatus(value, allowed, field, fallback) {
  const normalized = String(value || fallback).trim();
  if (!allowed.has(normalized)) {
    throw contractError(`${field} is invalid`);
  }
  return normalized;
}

function normalizeIsoDate(value, field, fallback) {
  const raw = value ?? fallback;
  if (!raw) {
    return "";
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw contractError(`${field} must be a valid ISO date`);
  }
  return date.toISOString();
}

function normalizeQuota(value = {}) {
  const quota = {};
  if (value.trafficGb !== undefined) {
    const trafficGb = Number(value.trafficGb);
    if (!Number.isFinite(trafficGb) || trafficGb < 0) {
      throw contractError("quota.trafficGb is invalid");
    }
    quota.trafficGb = trafficGb;
  }
  return quota;
}

export function normalizePlatformLead(payload = {}, options = {}) {
  const timestamp = nowIso(options.now);
  return {
    id: requiredString(payload.id ?? options.idFactory?.(), "id", 80),
    type: "platform_lead",
    status: normalizeStatus(payload.status, LEAD_STATUSES, "status", "new"),
    organization: requiredString(payload.organization, "organization", 120),
    email: normalizeEmail(payload.email),
    direction: requiredString(payload.direction, "direction", 120),
    stage: optionalString(payload.stage, 120),
    message: requiredString(payload.message, "message", 1200),
    source: optionalString(payload.source, 80) || "company-site",
    createdAt: normalizeIsoDate(payload.createdAt, "createdAt", timestamp),
    updatedAt: normalizeIsoDate(payload.updatedAt, "updatedAt", timestamp)
  };
}

export function normalizePlatformAccount(payload = {}, options = {}) {
  const timestamp = nowIso(options.now);
  const organization = requiredString(payload.organization, "organization", 120);
  return {
    id: requiredString(payload.id ?? options.idFactory?.(), "id", 80),
    type: "platform_account",
    leadId: optionalString(payload.leadId, 80),
    organization,
    email: normalizeEmail(payload.email),
    displayName: optionalString(payload.displayName, 120) || organization,
    status: normalizeStatus(payload.status, ACCOUNT_STATUSES, "status", "pending_review"),
    createdAt: normalizeIsoDate(payload.createdAt, "createdAt", timestamp),
    updatedAt: normalizeIsoDate(payload.updatedAt, "updatedAt", timestamp)
  };
}

export function normalizePlatformEntitlement(payload = {}, options = {}) {
  const timestamp = nowIso(options.now);
  const plan = requiredString(payload.plan, "plan", 40);
  if (!ENTITLEMENT_PLANS.has(plan)) {
    throw contractError("plan is invalid");
  }
  return {
    id: requiredString(payload.id ?? options.idFactory?.(), "id", 80),
    type: "platform_entitlement",
    accountId: requiredString(payload.accountId, "accountId", 80),
    plan,
    status: normalizeStatus(payload.status, ENTITLEMENT_STATUSES, "status", "pending"),
    validFrom: normalizeIsoDate(payload.validFrom, "validFrom", timestamp),
    validUntil: normalizeIsoDate(payload.validUntil, "validUntil"),
    quota: normalizeQuota(payload.quota),
    createdAt: normalizeIsoDate(payload.createdAt, "createdAt", timestamp),
    updatedAt: normalizeIsoDate(payload.updatedAt, "updatedAt", timestamp)
  };
}

export function isEntitlementUsable(entitlement, options = {}) {
  if (!entitlement || entitlement.status !== "active") {
    return false;
  }
  const now = new Date(options.now ?? Date.now());
  const validFrom = entitlement.validFrom ? new Date(entitlement.validFrom) : null;
  const validUntil = entitlement.validUntil ? new Date(entitlement.validUntil) : null;
  if (Number.isNaN(now.getTime()) || !validUntil || Number.isNaN(validUntil.getTime())) {
    return false;
  }
  if (validFrom && !Number.isNaN(validFrom.getTime()) && validFrom.getTime() > now.getTime()) {
    return false;
  }
  return validUntil.getTime() > now.getTime();
}

export function normalizeSubscriptionAccessGrant(payload = {}, options = {}) {
  const timestamp = nowIso(options.now);
  const entryRef = optionalString(payload.entryRef, 120);
  const artifactRef = optionalString(payload.artifactRef, 120);
  const status = normalizeStatus(payload.status, ACCESS_STATUSES, "status", "pending");
  if (status === "issued" && !entryRef && !artifactRef) {
    throw contractError("issued access requires entryRef or artifactRef");
  }
  return {
    id: requiredString(payload.id ?? options.idFactory?.(), "id", 80),
    type: "subscription_access_grant",
    accountId: requiredString(payload.accountId, "accountId", 80),
    entitlementId: requiredString(payload.entitlementId, "entitlementId", 80),
    status,
    delivery: normalizeStatus(payload.delivery, ACCESS_DELIVERIES, "delivery", "operator_issued"),
    entryRef,
    artifactRef,
    visibleOnce: payload.visibleOnce !== false,
    issuedAt: normalizeIsoDate(payload.issuedAt, "issuedAt", timestamp),
    updatedAt: normalizeIsoDate(payload.updatedAt, "updatedAt", timestamp)
  };
}

export function createPlatformControlSummary({
  lead,
  account,
  entitlement,
  accessGrant,
  now
} = {}) {
  return {
    lead: lead ? {
      id: lead.id,
      status: lead.status,
      organization: lead.organization,
      email: lead.email,
      direction: lead.direction,
      source: lead.source,
      createdAt: lead.createdAt
    } : null,
    account: account ? {
      id: account.id,
      status: account.status,
      organization: account.organization,
      email: account.email,
      displayName: account.displayName
    } : null,
    entitlement: entitlement ? {
      id: entitlement.id,
      status: entitlement.status,
      plan: entitlement.plan,
      usable: isEntitlementUsable(entitlement, { now }),
      validUntil: entitlement.validUntil,
      quota: entitlement.quota
    } : null,
    access: accessGrant ? {
      id: accessGrant.id,
      status: accessGrant.status,
      delivery: accessGrant.delivery,
      hasDynamicEntry: Boolean(accessGrant.entryRef),
      hasArtifact: Boolean(accessGrant.artifactRef),
      visibleOnce: accessGrant.visibleOnce,
      issuedAt: accessGrant.issuedAt
    } : null
  };
}
