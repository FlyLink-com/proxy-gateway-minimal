import { recordReferralRegistration } from './portal-referral-contract.mjs';
import { createPortalSubscriptionLinkResetStore, verifyPortalSubscriptionLinkResetLineage } from "./portal-subscription-link-reset-store.mjs";
import Database from "better-sqlite3";
import { createHash, randomBytes } from "node:crypto";
import { types as utilTypes } from "node:util";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  usageCycleForBinding,
  summarizeUsageSamples,
  isLifetimeDataPackBinding,
  lifetimeDataPackQuotaBytesFor,
  DATA_PACK_TECHNICAL_VALID_UNTIL
} from "./usage-billing-cycle.mjs";
import {
  createAccountResourceAuthorityStore
} from "./account-resource-authority.mjs";
import { readDataPackDesiredStateRows } from "../edge/data-pack-desired-state-rows.mjs";
import { assertNoDuplicateObjectKeys } from "../deployment/strict-json-scan.mjs";
import {
  commerceModeFromMetadata,
  countAccountAuthorityRows,
  deliverScheduledPlanDowngrade,
  listDueScheduledPlanSwitchRows,
  markScheduledPlanSwitchApplied,
  markScheduledPlanSwitchApplying,
  readOpenScheduledPlanSwitch,
  readPlanSwitchQuoteForOrder,
  readScheduledPlanSwitchByRef,
  supersedeScheduledPlanSwitch
} from "./coin-commerce-plan-switch-runtime.mjs";
import {
  coinCommerceSubscriptionFulfillmentMetadataJson,
  portalAccessEventJson
} from "./control-json-contracts.mjs";

const UNSAFE_FIELD_PARTS = [
  "email",
  "phone",
  "url",
  "token",
  "secret",
  "password",
  "credential",
  "raw",
  "yaml",
  "sspassword"
];
const SAFE_CONTROL_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_:/-]{0,127}$/;
const SAFE_EDGE_GENERATION_PATTERN = /^(?:gen_[a-f0-9]{24}|gen_scoped_[a-f0-9]{32})$/;
const PORTAL_SECOND_FACTOR_TYPES = new Set(["totp", "passkey"]);
const SAFE_AUTHORITY_REF_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const AUTHORITY_SECRET_LIKE_PATTERN =
  /^(?:https?:|mailto:|bearer[ .:_-]|sk[-_]|eyj[a-z0-9_-]{10,})/i;
const UNSAFE_CONTROL_VALUE_PATTERN =
  /https?:|token=|secret|credential|password|private|customer|@|\/sub\/clash\.yaml|(?:\d{1,3}\.){3}\d{1,3}|[a-z0-9-]+\.[a-z]{2,}/i;
const TRAFFIC_LIFECYCLE_PENDING_ACTIONS = new Set([
  "traffic_supply_expiry_cleanup_pending",
  "traffic_supply_resume_pending",
  "traffic_supply_resume_rollback_pending"
]);
const PORTAL_REGISTRATION_WELCOME_COIN_GRANT_TYPE = "bonus_coins";
const PORTAL_REGISTRATION_WELCOME_COIN_GRANT_AMOUNT_UNITS = 10;
const PORTAL_REGISTRATION_WELCOME_COIN_GRANT_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const PORTAL_REGISTRATION_WELCOME_COIN_GRANT_LEASE_TOKEN_PATTERN = /^[a-f0-9]{64}$/;
const MAX_PORTAL_REGISTRATION_WELCOME_COIN_GRANT_LEASE_MS = 24 * 60 * 60 * 1000;
const WALLET_FIRST_RESOURCE_EFFECT_COMMERCIAL_MODEL = "wallet_first_unique_v1";
const WALLET_FIRST_RESOURCE_CHAIN_MODEL = "wallet_first_resource_chain_v1";
const WALLET_FIRST_RESOURCE_EFFECT_AUDIT_ENTITY_TYPE =
  "wallet_first_deferred_resource_transition";
const WALLET_FIRST_RESOURCE_EFFECT_ACTOR_REF = "wallet_first_deferred_effect";
const WALLET_FIRST_RESOURCE_EFFECT_VERSION = 1;
const WALLET_FIRST_RESOURCE_EFFECT_RUNTIME_CLAIMS_TABLE =
  "platform_wallet_first_resource_effect_runtime_claims";
const WALLET_FIRST_RESOURCE_EFFECT_RUNTIME_LEASE_TOKEN_PATTERN = /^[a-f0-9]{64}$/;
const MAX_WALLET_FIRST_RESOURCE_EFFECT_RUNTIME_LEASE_MS = 10 * 60 * 1000;
const WALLET_FIRST_SETUP_DELIVERY_HANDOFFS_TABLE =
  "platform_wallet_first_setup_delivery_handoffs";
const WALLET_FIRST_SETUP_DELIVERY_HASH_PATTERN = /^[a-f0-9]{64}$/;
const WALLET_FIRST_SETUP_DELIVERY_HANDOFF_REF_PATTERN = /^wfxsetup_[a-f0-9]{48}$/;
const MAX_WALLET_FIRST_SETUP_DELIVERY_LEASE_MS = 10 * 60 * 1000;
const WALLET_FIRST_RESOURCE_EFFECT_SUPPORTED_OFFERS = Object.freeze({
  offerv_plan_30d_50gb_monthly_v1: Object.freeze({
    durationDays: 30,
    monthlyTrafficGb: 50,
    portalPlan: "monthly"
  }),
  offerv_plan_30d_100gb_monthly_v1: Object.freeze({
    durationDays: 30,
    monthlyTrafficGb: 100,
    portalPlan: "monthly"
  }),
  offerv_plan_365d_200gb_monthly_v1: Object.freeze({
    durationDays: 365,
    monthlyTrafficGb: 200,
    portalPlan: "yearly"
  })
});
const WALLET_FIRST_RESOURCE_EFFECT_PUBLIC_PLAN_IDS = Object.freeze({
  offerv_plan_30d_50gb_monthly_v1: "monthly_30d_50gb",
  offerv_plan_30d_100gb_monthly_v1: "monthly_30d_100gb",
  offerv_plan_365d_200gb_monthly_v1: "yearly_365d_200gb"
});

function platformError(code, message) {
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
    throw platformError("validation_error", `${field} is required`);
  }
  return normalized;
}

function safeControlRef(value, field) {
  const normalized = requiredText(value, field);
  if (!SAFE_CONTROL_REF_PATTERN.test(normalized) || UNSAFE_CONTROL_VALUE_PATTERN.test(normalized)) {
    throw platformError("validation_error", `${field} must be a safe control-plane reference`);
  }
  return normalized;
}

function safeEdgeGeneration(value) {
  if (typeof value !== "string" || !SAFE_EDGE_GENERATION_PATTERN.test(value)) {
    throw platformError("validation_error", "generation must match a supported desired-state generation");
  }
  return value;
}

function portalSecondFactorAllowedFactors(value) {
  const factors = JSON.parse(jsonArray(value ?? [], "allowedFactors"));
  if (
    factors.length === 0
    || factors.some((factor) => typeof factor !== "string" || !PORTAL_SECOND_FACTOR_TYPES.has(factor))
    || new Set(factors).size !== factors.length
  ) {
    throw platformError("validation_error", "allowedFactors must contain unique supported factors");
  }
  return JSON.stringify(factors);
}

function safeAuthorityRef(value, field) {
  if (
    typeof value !== "string"
    || !SAFE_AUTHORITY_REF_PATTERN.test(value)
    || AUTHORITY_SECRET_LIKE_PATTERN.test(value)
  ) {
    throw platformError(
      "validation_error",
      `${field} must be a safe Authority reference`
    );
  }
  return value;
}

function safeControlRefList(value, field) {
  if (!Array.isArray(value)) {
    throw platformError("validation_error", `${field} must be an array`);
  }
  const result = [];
  const seen = new Set();
  for (const item of value) {
    const ref = safeControlRef(item, field);
    if (seen.has(ref)) continue;
    seen.add(ref);
    result.push(ref);
  }
  if (result.length === 0) {
    throw platformError("validation_error", `${field} must contain at least one item`);
  }
  return result;
}

function optionalText(value) {
  const normalized = text(value);
  return normalized || null;
}

function exactObject(input, { allowed, required = allowed, name = "input" } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw platformError("validation_error", `${name} must be an object`);
  }
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) {
    throw platformError("validation_error", `${name} must be a plain object`);
  }
  const allowedFields = new Set(allowed);
  for (const field of Object.keys(input)) {
    if (!allowedFields.has(field)) {
      throw platformError("validation_error", `${name}.${field} is not allowed`);
    }
  }
  for (const field of required) {
    if (!Object.prototype.hasOwnProperty.call(input, field)) {
      throw platformError("validation_error", `${name}.${field} is required`);
    }
  }
  return input;
}

function integer(value, field, { min = 0 } = {}) {
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized < min) {
    throw platformError("validation_error", `${field} must be an integer >= ${min}`);
  }
  return normalized;
}

function isoText(value, field) {
  const raw = requiredText(value, field);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw platformError("validation_error", `${field} must be a valid ISO timestamp`);
  }
  return date.toISOString();
}

function walletFirstResourceEffectRef(prefix, transitionRef) {
  const normalized = safeControlRef(transitionRef, "transitionRef");
  return `${prefix}_${createHash("sha256")
    .update(`gccwebos:wallet-first-resource-effect:v1:${normalized}`)
    .digest("hex")}`;
}

function walletFirstResourceEffectBindingRef(prefix, value) {
  const normalized = safeControlRef(value, "runtimeBinding");
  return `${prefix}ref_${createHash("sha256")
    .update(normalized)
    .digest("hex")
    .slice(0, 16)}`;
}

function walletFirstResourceEffectAccountDigest(accountId) {
  return createHash("sha256")
    .update(`gccwebos:wallet-first-account:v1:${safeControlRef(accountId, "accountId")}`)
    .digest("hex");
}

function walletFirstResourceEffectTargetValidUntil(activationAt, durationDays) {
  const startMs = Date.parse(isoText(activationAt, "activationAt"));
  const targetMs = startMs + durationDays * 24 * 60 * 60 * 1000;
  if (!Number.isSafeInteger(targetMs) || Math.abs(targetMs) > 8.64e15) {
    throw platformError("validation_error", "wallet-first resource-effect target is outside the safe Date range");
  }
  return new Date(targetMs).toISOString();
}

function portalRegistrationWelcomeCoinGrantExpiresAt(issuedAt) {
  const issuedAtMs = Date.parse(isoText(issuedAt, "now"));
  const expiresAtMs = issuedAtMs + PORTAL_REGISTRATION_WELCOME_COIN_GRANT_DURATION_MS;
  if (!Number.isSafeInteger(expiresAtMs) || Math.abs(expiresAtMs) > 8.64e15) {
    throw platformError("validation_error", "welcome coin grant expiry is outside the safe Date range");
  }
  return new Date(expiresAtMs).toISOString();
}

function optionalIsoText(value, field) {
  const raw = optionalText(value);
  if (!raw) {
    return null;
  }
  return isoText(raw, field);
}

function addMillisecondsToIso(iso, milliseconds, field) {
  const startedAt = Date.parse(iso);
  const target = startedAt + milliseconds;
  if (!Number.isSafeInteger(target) || Math.abs(target) > 8.64e15) {
    throw platformError("validation_error", `${field} is outside the safe Date range`);
  }
  return new Date(target).toISOString();
}

function assertNoUnsafeFields(value, path = []) {
  if (value == null || typeof value !== "object") {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoUnsafeFields(item, [...path, String(index)]));
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    const normalizedKey = String(key).toLowerCase();
    if (UNSAFE_FIELD_PARTS.some((part) => normalizedKey.includes(part))) {
      throw platformError("validation_error", "unsafe field is not allowed in subscription control database input");
    }
    assertNoUnsafeFields(nested, [...path, key]);
  }
}

function assertNoUnsafeControlValues(value) {
  if (value == null) {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => assertNoUnsafeControlValues(item));
    return;
  }
  if (typeof value === "object") {
    Object.values(value).forEach((nested) => assertNoUnsafeControlValues(nested));
    return;
  }
  if (typeof value === "string" && UNSAFE_CONTROL_VALUE_PATTERN.test(value)) {
    throw platformError("validation_error", "unsafe value is not allowed in edge registered node metadata");
  }
}

function listenerReadyFlag(input = {}) {
  return (
    input.listenerUdp443 === true
    || input.listenerTcp === true
    || input.listenerPresent === true
  ) ? 1 : 0;
}

function edgeNodeMetadataJson(value) {
  if (
    !value
    || typeof value !== "object"
    || Array.isArray(value)
    || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
  ) {
    throw platformError("validation_error", "edge node metadata must be a plain object");
  }

  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== "string")) {
    throw platformError("validation_error", "edge node metadata keys must be strings");
  }
  const snapshot = {};
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor)) {
      throw platformError("validation_error", "edge node metadata must contain data properties only");
    }
    snapshot[key] = descriptor.value;
  }

  const allowed = new Set([
    "source",
    "receiptGateRequired",
    "imageSafeConfirmed",
    "artifactHashRecorded",
    "wireguardPlanRef",
    "wireguardPublicKeyFingerprint",
    "agentAuthFingerprint"
  ]);
  if (Object.keys(snapshot).some((key) => !allowed.has(key))) {
    throw platformError("validation_error", "edge node metadata contains an unknown field");
  }
  if (
    snapshot.source !== "node-image-first-boot-packet"
    || snapshot.receiptGateRequired !== true
    || typeof snapshot.imageSafeConfirmed !== "boolean"
    || typeof snapshot.artifactHashRecorded !== "boolean"
    || typeof snapshot.wireguardPlanRef !== "string"
    || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(snapshot.wireguardPlanRef)
    || /https?:|token=|secret|credential|password|private|customer|@|\/sub\/clash\.yaml|(?:\d{1,3}\.){3}\d{1,3}|[a-z0-9-]+\.[a-z]{2,}/i.test(snapshot.wireguardPlanRef)
  ) {
    throw platformError("validation_error", "edge node metadata does not match the first-boot contract");
  }

  const normalized = {
    source: snapshot.source,
    receiptGateRequired: snapshot.receiptGateRequired,
    imageSafeConfirmed: snapshot.imageSafeConfirmed,
    artifactHashRecorded: snapshot.artifactHashRecorded,
    wireguardPlanRef: snapshot.wireguardPlanRef
  };
  for (const field of ["wireguardPublicKeyFingerprint", "agentAuthFingerprint"]) {
    if (Object.prototype.hasOwnProperty.call(snapshot, field)) {
      if (typeof snapshot[field] !== "string" || !/^sha256:[0-9a-f]{64}$/.test(snapshot[field])) {
        throw platformError("validation_error", "edge node metadata fingerprint is invalid");
      }
      normalized[field] = snapshot[field];
    }
  }
  return JSON.stringify(normalized);
}

function issuanceMetadataJson(value) {
  const metadata = value == null ? {} : value;
  if (
    !metadata
    || typeof metadata !== "object"
    || Array.isArray(metadata)
    || (Object.getPrototypeOf(metadata) !== Object.prototype && Object.getPrototypeOf(metadata) !== null)
  ) {
    throw platformError("validation_error", "issuance metadata must be a plain object");
  }

  const keys = Reflect.ownKeys(metadata);
  if (keys.some((key) => typeof key !== "string")) {
    throw platformError("validation_error", "issuance metadata keys must be strings");
  }
  const snapshot = {};
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(metadata, key);
    if (!descriptor || !("value" in descriptor)) {
      throw platformError("validation_error", "issuance metadata must contain data properties only");
    }
    snapshot[key] = descriptor.value;
  }

  const fields = Object.keys(snapshot);
  if (fields.length === 0) return "{}";

  if (fields.length === 1 && fields[0] === "cli") {
    if (snapshot.cli !== "platform:issue-subscription") {
      throw platformError("validation_error", "issuance metadata CLI source is not allowed");
    }
    return JSON.stringify(snapshot);
  }

  const chainFields = [
    "commercialModel",
    "resourceModel",
    "resourceModelVersion",
    "initialTransitionRef",
    "lastTransitionRef"
  ];
  if (
    fields.length !== chainFields.length
    || chainFields.some((field) => !Object.prototype.hasOwnProperty.call(snapshot, field))
    || snapshot.commercialModel !== WALLET_FIRST_RESOURCE_EFFECT_COMMERCIAL_MODEL
    || snapshot.resourceModel !== WALLET_FIRST_RESOURCE_CHAIN_MODEL
    || snapshot.resourceModelVersion !== WALLET_FIRST_RESOURCE_EFFECT_VERSION
  ) {
    throw platformError("validation_error", "issuance metadata does not match a supported versioned contract");
  }

  const normalized = {
    commercialModel: snapshot.commercialModel,
    resourceModel: snapshot.resourceModel,
    resourceModelVersion: snapshot.resourceModelVersion,
    initialTransitionRef: safeControlRef(snapshot.initialTransitionRef, "initialTransitionRef"),
    lastTransitionRef: safeControlRef(snapshot.lastTransitionRef, "lastTransitionRef")
  };
  return JSON.stringify(normalized);
}

function snapshotControlJsonObject(value, field) {
  try {
    if (
      !value
      || typeof value !== "object"
      || Array.isArray(value)
      || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
    ) {
      throw new Error("invalid object");
    }
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key !== "string")) throw new Error("invalid key");
    const snapshot = {};
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
        throw new Error("invalid property");
      }
      snapshot[key] = descriptor.value;
    }
    return snapshot;
  } catch {
    throw platformError("validation_error", field + " must be a plain data object");
  }
}

function jsonObject(value, field) {
  if (value == null) {
    return "{}";
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    throw platformError("validation_error", `${field} must be an object`);
  }
  return JSON.stringify(value);
}

function parseJsonObject(value) {
  if (!value) {
    return {};
  }
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function jsonArray(value, field) {
  if (value == null) {
    return "[]";
  }
  if (!Array.isArray(value)) {
    throw platformError("validation_error", `${field} must be an array`);
  }
  return JSON.stringify(value);
}

function parseJsonArray(value) {
  if (!value) {
    return [];
  }
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function desiredStateLifecycleRevision(row) {
  const event = parseJsonObject(row.event_json);
  const candidate = text(event.lifecycleRevisionRef);
  const lifecycleRevisionRef = (
    SAFE_CONTROL_REF_PATTERN.test(candidate)
    && !UNSAFE_CONTROL_VALUE_PATTERN.test(candidate)
  ) ? candidate : "";
  const required = TRAFFIC_LIFECYCLE_PENDING_ACTIONS.has(text(row.next_action));
  return {
    fingerprint: lifecycleRevisionRef
      ? {
        requestRef: row.request_id,
        lifecycleRevisionRef
      }
      : {
        requestRef: row.request_id,
        updatedAt: row.updated_at
      },
    safe: !required || Boolean(lifecycleRevisionRef)
  };
}

function sqliteRun(statement, input) {
  try {
    return statement.run(input);
  } catch (error) {
    if (String(error.code || "").startsWith("SQLITE_CONSTRAINT")) {
      throw platformError("constraint_error", "subscription control database constraint failed");
    }
    throw error;
  }
}

function ensureTableColumns(db, tableName, columns) {
  const existing = new Set(db.prepare(`pragma table_info(${tableName})`).all().map((column) => column.name));
  for (const column of columns) {
    if (!existing.has(column.name)) {
      db.exec(`alter table ${tableName} add column ${column.definition}`);
      existing.add(column.name);
    }
  }
}

function mapLead(row) {
  if (!row) return null;
  return {
    id: row.id,
    type: "platform_lead",
    status: row.status,
    organization: row.organization,
    email: row.email,
    direction: row.direction,
    stage: row.stage,
    message: row.message,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapAccount(row) {
  if (!row) return null;
  return {
    id: row.id,
    ownerRef: row.owner_ref,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    metadata: parseJsonObject(row.metadata_json)
  };
}

function mapPortalRegistrationWelcomeCoinGrant(row) {
  if (!row) return null;
  const grant = {
    grantRef: row.grant_ref,
    accountId: row.account_id,
    coinType: row.coin_type,
    amountUnits: row.amount_units,
    sourceType: row.source_type,
    sourceRef: row.source_ref,
    sourceDigest: row.source_digest,
    actorScope: row.actor_scope,
    idempotencyKey: row.idempotency_key,
    expiresAt: row.expires_at,
    status: row.status,
    nextAttemptAt: row.next_attempt_at,
    attemptCount: row.attempt_count,
    leaseGeneration: row.lease_generation,
    leaseUntil: row.lease_until,
    lastSafeCode: row.last_safe_code,
    creditedLotRef: row.credited_lot_ref,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    creditedAt: row.credited_at
  };
  return grant;
}

function mapPortalRegistrationWelcomeCoinGrantClaim(row) {
  if (!row) return null;
  return {
    grantRef: row.grant_ref,
    accountId: row.account_id,
    coinType: row.coin_type,
    amountUnits: row.amount_units,
    sourceType: row.source_type,
    sourceRef: row.source_ref,
    sourceDigest: row.source_digest,
    actorScope: row.actor_scope,
    idempotencyKey: row.idempotency_key,
    expiresAt: row.expires_at,
    leaseGeneration: row.lease_generation,
    leaseToken: row.lease_token
  };
}

function normalizedPortalLoginRef(value) {
  return text(value).toLowerCase();
}

function portalLoginRefsFromMetadata(metadata) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return [];
  }
  return ["loginRef", "displayRef"]
    .map((field) => text(metadata[field]))
    .filter(Boolean);
}

function mapEntitlement(row) {
  if (!row) return null;
  const now = new Date();
  const validUntil = new Date(row.valid_until);
  return {
    id: row.id,
    accountId: row.account_id,
    plan: row.plan,
    status: row.status,
    validFrom: row.valid_from,
    validUntil: row.valid_until,
    maxArtifacts: row.max_artifacts,
    maxDevices: row.max_devices,
    trafficLimitBytes: row.traffic_limit_bytes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    usable: row.status === "active" && validUntil >= now
  };
}

function mapIssuanceRequest(row) {
  if (!row) return null;
  return {
    id: row.id,
    accountId: row.account_id,
    entitlementId: row.entitlement_id,
    approvalRef: row.approval_ref,
    status: row.status,
    quantity: row.quantity,
    nodeId: row.node_id,
    purpose: row.purpose,
    requestedByRef: row.requested_by_ref,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    metadata: parseJsonObject(row.metadata_json)
  };
}

function mapIssuedLink(row) {
  if (!row) return null;
  return {
    id: row.id,
    requestId: row.request_id,
    tenantRef: row.tenant_ref,
    artifactRef: row.artifact_ref,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapIssuedSubscriptionBinding(row) {
  if (!row) return null;
  return {
    id: row.link_id,
    linkId: row.link_id,
    requestId: row.request_id,
    accountId: row.account_id,
    entitlementId: row.entitlement_id,
    tenantRef: row.tenant_ref,
    artifactRef: row.artifact_ref,
    status: row.link_status,
    requestStatus: row.request_status,
    entitlementStatus: row.entitlement_status,
    nodeId: row.node_id,
    plan: row.plan,
    validFrom: row.valid_from,
    validUntil: row.valid_until,
    trafficLimitBytes: row.traffic_limit_bytes,
    createdAt: row.link_created_at,
    updatedAt: row.link_updated_at
  };
}

function mapQuotaCounter(row) {
  if (!row) return null;
  return {
    accountId: row.account_id,
    entitlementId: row.entitlement_id,
    metric: row.metric,
    period: row.period,
    amount: row.amount,
    updatedAt: row.updated_at
  };
}

function mapUsageBinding(row) {
  if (!row) return null;
  return {
    id: row.link_id,
    linkId: row.link_id,
    requestId: row.request_id,
    accountId: row.account_id,
    entitlementId: row.entitlement_id,
    tenantRef: row.tenant_ref,
    artifactRef: row.artifact_ref,
    status: row.link_status,
    requestStatus: row.request_status,
    entitlementStatus: row.entitlement_status,
    nodeId: row.node_id,
    plan: row.plan,
    validFrom: row.valid_from,
    validUntil: row.valid_until,
    trafficLimitBytes: row.traffic_limit_bytes,
    edgeCredentialRef: row.edge_credential_ref || `edgecred_${row.request_id}`,
    portalUserRef: row.portal_user_ref,
    createdAt: row.link_created_at,
    updatedAt: row.link_updated_at
  };
}

function mapUsageSample(row) {
  if (!row) return null;
  return {
    id: row.id,
    sourceRef: row.source_ref,
    channelRef: row.channel_ref,
    edgeCredentialRef: row.edge_credential_ref,
    accountId: row.account_id,
    entitlementId: row.entitlement_id,
    requestId: row.request_id,
    observedAt: row.observed_at,
    intervalStartedAt: row.interval_started_at,
    intervalEndedAt: row.interval_ended_at,
    uploadBytes: row.upload_bytes,
    downloadBytes: row.download_bytes,
    totalBytes: row.total_bytes,
    sampleDigest: row.sample_digest,
    createdAt: row.created_at
  };
}

function mapUsageRollup(row) {
  if (!row) return null;
  return {
    edgeCredentialRef: row.edge_credential_ref,
    accountId: row.account_id,
    entitlementId: row.entitlement_id,
    requestId: row.request_id,
    channelRef: row.channel_ref,
    uploadBytes: row.upload_bytes,
    downloadBytes: row.download_bytes,
    totalBytes: row.total_bytes,
    lastObservedAt: row.last_observed_at,
    updatedAt: row.updated_at
  };
}

function mapUsageCounterCursor(row) {
  if (!row) return null;
  return {
    sourceRef: row.source_ref,
    channelRef: row.channel_ref,
    edgeCredentialRef: row.edge_credential_ref,
    uploadBytes: row.upload_bytes,
    downloadBytes: row.download_bytes,
    observedAt: row.observed_at,
    epoch: row.epoch,
    updatedAt: row.updated_at
  };
}

function mapDeviceBinding(row) {
  if (!row) return null;
  return {
    id: row.id,
    accountId: row.account_id,
    artifactRef: row.artifact_ref,
    deviceRef: row.device_ref,
    status: row.status,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at
  };
}

function mapRevocationEvent(row) {
  if (!row) return null;
  return {
    id: row.id,
    requestId: row.request_id,
    issuedLinkId: row.issued_link_id,
    tenantRef: row.tenant_ref,
    artifactRef: row.artifact_ref,
    reasonCode: row.reason_code,
    revokedByRef: row.revoked_by_ref,
    createdAt: row.created_at
  };
}

function mapAuditEvent(row) {
  if (!row) return null;
  return {
    id: row.id,
    entityType: row.entity_type,
    entityRef: row.entity_ref,
    action: row.action,
    actorRef: row.actor_ref,
    createdAt: row.created_at,
    metadata: parseJsonObject(row.metadata_json)
  };
}

function mapEdgeRegisteredNode(row) {
  if (!row) return null;
  return {
    nodeRef: row.node_ref,
    providerRef: row.provider_ref,
    regionRef: row.region_ref,
    roleRef: row.role_ref,
    channelRefs: parseJsonArray(row.channel_refs_json),
    imageManifestRef: row.image_manifest_ref,
    releaseRef: row.release_ref,
    lifecycle: row.lifecycle,
    status: row.status,
    firstBootPacketRef: row.first_boot_packet_ref,
    registeredAt: row.registered_at,
    updatedAt: row.updated_at,
    metadata: parseJsonObject(row.metadata_json)
  };
}

function mapEdgeApplyReceipt(row) {
  if (!row) return null;
  return {
    id: row.id,
    channelRef: row.channel_ref,
    desiredStateRef: row.desired_state_ref,
    status: row.status,
    actionCounts: {
      add: row.add_count,
      revoke: row.revoke_count,
      rotate: row.rotate_count,
      unchanged: row.unchanged_count
    },
    configTestOk: row.config_test_ok === 1,
    serviceActive: row.service_active === 1,
    listenerUdp443: row.listener_udp443 === 1,
    backupRef: row.backup_ref,
    rollbackRef: row.rollback_ref,
    appliedAt: row.applied_at,
    createdAt: row.created_at
  };
}

function mapEdgeDesiredStateNotification(row) {
  if (!row) return null;
  return {
    id: row.id,
    nodeRef: row.node_ref,
    channelRef: row.channel_ref,
    desiredStateRef: row.desired_state_ref,
    generation: row.generation,
    reason: row.reason,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapEdgeAgentLease(row) {
  if (!row) return null;
  return {
    leaseRef: row.lease_ref,
    agentRef: row.agent_ref,
    nodeRef: row.node_ref,
    channelRef: row.channel_ref,
    desiredStateRef: row.desired_state_ref,
    status: row.status,
    acquiredAt: row.acquired_at,
    renewedAt: row.renewed_at,
    expiresAt: row.expires_at
  };
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function portalEdgeCredentialScopeDigest(edgeCredentialRef) {
  return `sha256:${sha256(`gccgw:scoped-tombstone-lineage:v1:${edgeCredentialRef}`)}`;
}

function mapPortalAccessRequest(row) {
  if (!row) return null;
  const event = parseJsonObject(row.event_json);
  return {
    id: row.id,
    portalUserRef: row.portal_user_ref,
    plan: row.plan,
    clientTarget: row.client_target,
    durationDays: row.duration_days,
    quantity: row.quantity,
    status: row.status,
    nextAction: row.next_action,
    noteProvided: row.note_provided === 1,
    priorTrialState: row.prior_trial_state,
    submittedAt: row.submitted_at,
    updatedAt: row.updated_at,
    reviewedAt: row.reviewed_at,
    reviewedByRef: row.reviewed_by_ref,
    safeReasonCode: row.safe_reason_code,
    expiresAt: row.expires_at,
    validUntil: row.valid_until,
    entitlementRef: row.entitlement_ref,
    accessGrantRef: row.access_grant_ref,
    tenantId: row.tenant_id,
    artifactId: row.artifact_id,
    subscriptionUrl: row.subscription_url,
    edgeChannelRef: row.edge_channel_ref,
    edgeCredentialRef: row.edge_credential_ref,
    edgeMaterialDigest: row.edge_material_digest,
    edgeLifecycleMutation: row.edge_lifecycle_mutation === 1,
    event: Object.keys(event).length > 0 ? event : null
  };
}

function mapPortalEdgeCredential(row) {
  if (!row) return null;
  return {
    edgeChannelRef: row.edge_channel_ref,
    edgeCredentialRef: row.edge_credential_ref,
    edgeMaterialDigest: row.edge_material_digest
  };
}

function mapPortalEntry(row) {
  if (!row) return null;
  return {
    id: row.id,
    accountId: row.account_id,
    entitlementId: row.entitlement_id,
    tokenHash: row.token_hash,
    status: row.status,
    expiresAt: row.expires_at,
    maxUses: row.max_uses,
    useCount: row.use_count,
    issuedByRef: row.issued_by_ref,
    approvalRef: row.approval_ref,
    usedAt: row.used_at,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapPortalTotpCredential(row) {
  if (!row) return null;
  return {
    id: row.id,
    accountId: row.account_id,
    encryptedTotpSecret: row.encrypted_totp_secret,
    status: row.status,
    failureCount: row.failure_count,
    lockedUntil: row.locked_until,
    enrolledAt: row.enrolled_at,
    lastVerifiedAt: row.last_verified_at,
    revokedAt: row.revoked_at,
    updatedAt: row.updated_at
  };
}

function mapPortalPasswordCredential(row) {
  if (!row) return null;
  return {
    id: row.id,
    accountId: row.account_id,
    passwordHash: row.password_hash,
    status: row.status,
    failureCount: row.failure_count,
    lockedUntil: row.locked_until,
    mustRotate: row.must_rotate === 1,
    createdAt: row.created_at,
    lastVerifiedAt: row.last_verified_at,
    revokedAt: row.revoked_at,
    updatedAt: row.updated_at
  };
}

function mapPortalPasskeyCredential(row) {
  if (!row) return null;
  return {
    id: row.id,
    accountId: row.account_id,
    credentialId: row.credential_id,
    credentialIdHash: row.credential_id_hash,
    publicKeyJwk: parseJsonObject(row.public_key_jwk_json),
    signCount: row.sign_count,
    transports: parseJsonArray(row.transports_json),
    status: row.status,
    createdAt: row.created_at,
    lastVerifiedAt: row.last_verified_at,
    revokedAt: row.revoked_at,
    updatedAt: row.updated_at
  };
}

function mapPortalSecondFactorChallenge(row) {
  if (!row) return null;
  let payload;
  try {
    payload = JSON.parse(row.allowed_factors_json);
    if (Array.isArray(payload)) payload = { version: 1, allowedFactors: payload, rememberMe: false };
    if (!payload || typeof payload !== "object"
      || Object.keys(payload).sort().join(",") !== "allowedFactors,rememberMe,version"
      || payload.version !== 1 || typeof payload.rememberMe !== "boolean"
      || !Array.isArray(payload.allowedFactors)
      || payload.allowedFactors.some((factor) => factor !== "totp" && factor !== "passkey")) throw new Error();
  } catch {
    throw platformError("validation_error", "portal second-factor challenge payload is invalid");
  }
  return {
    id: row.id,
    accountId: row.account_id,
    challengeHash: row.challenge_hash,
    allowedFactors: payload.allowedFactors,
    rememberMe: payload.rememberMe,
    status: row.status,
    failureCount: row.failure_count,
    expiresAt: row.expires_at,
    usedAt: row.used_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapPortalSession(row) {
  if (!row) return null;
  return {
    sessionRef: row.id,
    accountId: row.account_id,
    entryId: row.entry_id,
    authMethod: row.auth_method,
    status: row.status,
    issuedAt: row.issued_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    updatedAt: row.updated_at
  };
}

export function createSqliteSubscriptionControlStore({
  dbPath,
  database,
  initializeSchema = true
} = {}) {
  if (!database && !dbPath) {
    throw new Error("dbPath or database is required");
  }
  if (typeof initializeSchema !== "boolean") {
    throw new Error("initializeSchema must be boolean");
  }

  if (initializeSchema) ensureParentDirectory(dbPath);
  const ownsDatabase = !database;
  const db = database ?? (initializeSchema
    ? new Database(dbPath)
    : new Database(dbPath, { fileMustExist: true }));
  db.pragma("busy_timeout = 2000");
  db.pragma("foreign_keys = ON");
  if (initializeSchema) db.pragma("journal_mode = WAL");
  if (initializeSchema) db.exec(`
    create table if not exists platform_leads (
      id text primary key,
      status text not null check (status in ('new', 'reviewing', 'converted', 'rejected')),
      organization text not null,
      email text not null,
      direction text not null,
      stage text not null default '',
      message text not null,
      source text not null,
      created_at text not null,
      updated_at text not null,
      expires_at text not null
    );

    create index if not exists platform_leads_status_created_idx
      on platform_leads(status, created_at);
    create index if not exists platform_leads_expires_at_idx
      on platform_leads(expires_at);

    create table if not exists platform_accounts (
      id text primary key,
      owner_ref text not null,
      status text not null check (status in ('active', 'suspended', 'disabled')),
      created_at text not null,
      updated_at text not null,
      metadata_json text not null default '{}'
    );

    create index if not exists platform_accounts_status_idx
      on platform_accounts(status);

    create table if not exists platform_entitlements (
      id text primary key,
      account_id text not null references platform_accounts(id) on delete cascade,
      plan text not null,
      status text not null check (status in ('active', 'expired', 'revoked', 'suspended')),
      valid_from text not null,
      valid_until text not null,
      max_artifacts integer not null default 1,
      max_devices integer not null default 1,
      traffic_limit_bytes integer not null default 0,
      created_at text not null,
      updated_at text not null
    );

    create index if not exists platform_entitlements_account_id_idx
      on platform_entitlements(account_id);
    create index if not exists platform_entitlements_status_idx
      on platform_entitlements(status);

    create table if not exists platform_issuance_requests (
      id text primary key,
      account_id text not null references platform_accounts(id) on delete cascade,
      entitlement_id text not null references platform_entitlements(id) on delete cascade,
      approval_ref text not null,
      status text not null check (status in ('planned', 'issued', 'failed', 'revoked', 'cancelled')),
      quantity integer not null check (quantity > 0),
      node_id text not null,
      purpose text not null,
      requested_by_ref text not null,
      created_at text not null,
      updated_at text not null,
      metadata_json text not null default '{}'
    );

    create index if not exists platform_issuance_requests_account_id_idx
      on platform_issuance_requests(account_id);
    create index if not exists platform_issuance_requests_entitlement_id_idx
      on platform_issuance_requests(entitlement_id);
    create index if not exists platform_issuance_requests_status_idx
      on platform_issuance_requests(status);

    create table if not exists platform_issued_subscription_links (
      id text primary key,
      request_id text not null references platform_issuance_requests(id) on delete cascade,
      tenant_ref text not null,
      artifact_ref text not null,
      status text not null check (status in ('active', 'revoked', 'rotated', 'disabled')),
      created_at text not null,
      updated_at text not null
    );

    create index if not exists platform_issued_subscription_links_request_id_idx
      on platform_issued_subscription_links(request_id);
    create index if not exists platform_issued_subscription_links_status_idx
      on platform_issued_subscription_links(status);

    create table if not exists platform_data_pack_resources (
      order_ref text primary key,
      command_ref text not null unique,
      account_id text not null references platform_accounts(id) on delete cascade,
      request_ref text not null unique references platform_issuance_requests(id),
      entitlement_ref text not null unique references platform_entitlements(id),
      offer_version_ref text not null,
      quota_bytes integer not null check (quota_bytes > 0),
      commercial_never_expires integer not null check (commercial_never_expires = 1),
      technical_valid_until text not null,
      created_at text not null
    );

    create index if not exists platform_data_pack_resources_account_idx
      on platform_data_pack_resources(account_id, created_at);

    create table if not exists platform_data_pack_artifact_rotations (
      rotation_ref text primary key,
      order_ref text not null references platform_data_pack_resources(order_ref),
      account_id text not null references platform_accounts(id),
      link_ref text not null references platform_issued_subscription_links(id),
      old_artifact_ref text not null,
      replacement_artifact_ref text,
      attempt integer not null default 1 check (attempt between 1 and 16),
      status text not null check (status in ('prepared', 'escrowed', 'switched', 'complete')),
      lease_ref text,
      lease_until text,
      created_at text not null,
      updated_at text not null
    );
    create unique index if not exists platform_data_pack_rotation_pending_idx
      on platform_data_pack_artifact_rotations(order_ref) where status != 'complete';

    create table if not exists platform_data_pack_edge_credentials (
      request_ref text not null references platform_issuance_requests(id),
      entitlement_ref text not null references platform_entitlements(id),
      edge_channel_ref text not null,
      edge_credential_ref text not null unique,
      edge_material_digest text not null,
      status text not null check (status in ('active', 'rotated', 'disabled')),
      created_at text not null,
      updated_at text not null,
      primary key (request_ref, edge_credential_ref)
    );
    create unique index if not exists platform_data_pack_edge_active_request_idx
      on platform_data_pack_edge_credentials(request_ref) where status = 'active';

    create table if not exists platform_data_pack_credential_resets (
      rotation_ref text primary key,
      order_ref text not null references platform_data_pack_resources(order_ref),
      account_id text not null references platform_accounts(id),
      request_ref text not null references platform_issuance_requests(id),
      entitlement_ref text not null references platform_entitlements(id),
      edge_channel_ref text not null,
      edge_credential_ref text not null,
      old_edge_material_digest text not null,
      new_edge_material_digest text,
      status text not null check (status in
        ('prepared', 'staged', 'control_switched', 'material_committed',
         'edge_applied', 'complete')),
      lease_ref text,
      lease_until text,
      created_at text not null,
      updated_at text not null
    );
    create unique index if not exists platform_data_pack_credential_reset_pending_idx
      on platform_data_pack_credential_resets(order_ref) where status != 'complete';

    create table if not exists platform_quota_counters (
      account_id text not null references platform_accounts(id) on delete cascade,
      entitlement_id text not null references platform_entitlements(id) on delete cascade,
      metric text not null,
      period text not null,
      amount integer not null default 0,
      updated_at text not null,
      primary key (account_id, entitlement_id, metric, period)
    );

    create table if not exists platform_usage_samples (
      id text primary key,
      source_ref text not null,
      channel_ref text not null,
      edge_credential_ref text not null,
      account_id text not null references platform_accounts(id) on delete cascade,
      entitlement_id text not null references platform_entitlements(id) on delete cascade,
      request_id text not null references platform_issuance_requests(id) on delete cascade,
      observed_at text not null,
      interval_started_at text not null,
      interval_ended_at text not null,
      upload_bytes integer not null default 0 check (upload_bytes >= 0),
      download_bytes integer not null default 0 check (download_bytes >= 0),
      total_bytes integer not null default 0 check (total_bytes >= 0),
      sample_digest text not null unique,
      created_at text not null
    );

    create index if not exists platform_usage_samples_edge_credential_idx
      on platform_usage_samples(edge_credential_ref, observed_at);
    create index if not exists platform_usage_samples_account_entitlement_idx
      on platform_usage_samples(account_id, entitlement_id, observed_at);

    create table if not exists platform_usage_rollups (
      edge_credential_ref text primary key,
      account_id text not null references platform_accounts(id) on delete cascade,
      entitlement_id text not null references platform_entitlements(id) on delete cascade,
      request_id text not null references platform_issuance_requests(id) on delete cascade,
      channel_ref text not null,
      upload_bytes integer not null default 0 check (upload_bytes >= 0),
      download_bytes integer not null default 0 check (download_bytes >= 0),
      total_bytes integer not null default 0 check (total_bytes >= 0),
      last_observed_at text not null,
      updated_at text not null
    );

    create index if not exists platform_usage_rollups_account_entitlement_idx
      on platform_usage_rollups(account_id, entitlement_id);
    create index if not exists platform_usage_rollups_channel_idx
      on platform_usage_rollups(channel_ref);

    create table if not exists platform_usage_counter_cursors (
      source_ref text not null,
      channel_ref text not null,
      edge_credential_ref text not null,
      upload_bytes integer not null default 0 check (upload_bytes >= 0),
      download_bytes integer not null default 0 check (download_bytes >= 0),
      observed_at text not null,
      epoch integer not null default 0 check (epoch >= 0),
      updated_at text not null,
      primary key (source_ref, channel_ref, edge_credential_ref)
    );

    create table if not exists platform_device_bindings (
      id text primary key,
      account_id text not null references platform_accounts(id) on delete cascade,
      artifact_ref text not null,
      device_ref text not null,
      status text not null check (status in ('active', 'blocked', 'released')),
      first_seen_at text not null,
      last_seen_at text not null
    );

    create index if not exists platform_device_bindings_account_id_idx
      on platform_device_bindings(account_id);
    create index if not exists platform_device_bindings_artifact_ref_idx
      on platform_device_bindings(artifact_ref);

    create table if not exists platform_revocation_events (
      id text primary key,
      request_id text not null references platform_issuance_requests(id) on delete cascade,
      issued_link_id text references platform_issued_subscription_links(id) on delete set null,
      tenant_ref text not null,
      artifact_ref text not null,
      reason_code text not null,
      revoked_by_ref text not null,
      created_at text not null
    );

    create index if not exists platform_revocation_events_request_id_idx
      on platform_revocation_events(request_id);

    create table if not exists platform_audit_events (
      id text primary key,
      entity_type text not null,
      entity_ref text not null,
      action text not null,
      actor_ref text not null,
      created_at text not null,
      metadata_json text not null default '{}'
    );

    create index if not exists platform_audit_events_entity_ref_idx
      on platform_audit_events(entity_ref);

    create table if not exists platform_edge_registered_nodes (
      node_ref text primary key,
      provider_ref text not null,
      region_ref text not null,
      role_ref text not null,
      channel_refs_json text not null default '[]',
      image_manifest_ref text not null,
      release_ref text not null,
      lifecycle text not null,
      status text not null check (status in ('active', 'inactive', 'disabled', 'maintenance', 'retired')),
      first_boot_packet_ref text not null,
      registered_at text not null,
      updated_at text not null,
      metadata_json text not null default '{}'
    );

    create index if not exists platform_edge_registered_nodes_provider_region_idx
      on platform_edge_registered_nodes(provider_ref, region_ref);
    create index if not exists platform_edge_registered_nodes_status_idx
      on platform_edge_registered_nodes(status, updated_at);

    create table if not exists platform_edge_apply_receipts (
      id text primary key,
      channel_ref text not null,
      desired_state_ref text not null,
      status text not null check (status in ('pending', 'applied', 'failed', 'rolled_back', 'drift_detected')),
      add_count integer not null default 0,
      revoke_count integer not null default 0,
      rotate_count integer not null default 0,
      unchanged_count integer not null default 0,
      config_test_ok integer not null default 0 check (config_test_ok in (0, 1)),
      service_active integer not null default 0 check (service_active in (0, 1)),
      listener_udp443 integer not null default 0 check (listener_udp443 in (0, 1)),
      backup_ref text,
      rollback_ref text,
      applied_at text,
      created_at text not null
    );

    create index if not exists platform_edge_apply_receipts_channel_idx
      on platform_edge_apply_receipts(channel_ref, created_at);
    create index if not exists platform_edge_apply_receipts_desired_state_idx
      on platform_edge_apply_receipts(desired_state_ref);

    create table if not exists platform_edge_desired_state_notifications (
      id text primary key,
      node_ref text not null,
      channel_ref text not null,
      desired_state_ref text not null,
      generation text not null,
      reason text not null,
      status text not null check (status in ('pending', 'acknowledged', 'applied', 'failed')),
      created_at text not null,
      updated_at text not null
    );

    create index if not exists platform_edge_desired_state_notifications_node_idx
      on platform_edge_desired_state_notifications(node_ref, created_at);
    create index if not exists platform_edge_desired_state_notifications_channel_idx
      on platform_edge_desired_state_notifications(channel_ref, created_at);
    create index if not exists platform_edge_desired_state_notifications_state_idx
      on platform_edge_desired_state_notifications(desired_state_ref);

    create table if not exists platform_edge_agent_leases (
      lease_ref text primary key,
      agent_ref text not null,
      node_ref text not null,
      channel_ref text not null,
      desired_state_ref text,
      status text not null check (status in ('active', 'released', 'expired')),
      acquired_at text not null,
      renewed_at text not null,
      expires_at text not null
    );

    create index if not exists platform_edge_agent_leases_channel_idx
      on platform_edge_agent_leases(channel_ref, renewed_at);
    create index if not exists platform_edge_agent_leases_node_idx
      on platform_edge_agent_leases(node_ref, renewed_at);

    create table if not exists platform_portal_access_requests (
      id text primary key,
      portal_user_ref text not null,
      plan text not null check (plan in ('trial', 'monthly', 'yearly')),
      client_target text not null check (client_target in ('clash', 'karing')),
      duration_days integer not null check (duration_days > 0),
      quantity integer not null check (quantity > 0),
      status text not null check (status in (
        'pending_admin_review',
        'approved_pending_delivery',
        'delivered',
        'issued',
        'rejected',
        'disabled'
      )),
      next_action text not null,
      note_provided integer not null default 0 check (note_provided in (0, 1)),
      prior_trial_state text not null,
      submitted_at text not null,
      updated_at text not null,
      reviewed_at text,
      reviewed_by_ref text,
      safe_reason_code text,
      expires_at text,
      valid_until text,
      entitlement_ref text,
      access_grant_ref text,
      tenant_id text,
      artifact_id text,
      subscription_url text,
      edge_channel_ref text,
      edge_credential_ref text,
      edge_material_digest text,
      edge_lifecycle_mutation integer not null default 0 check (edge_lifecycle_mutation in (0, 1)),
      event_json text not null default '{}'
    );

    create index if not exists platform_portal_access_requests_user_idx
      on platform_portal_access_requests(portal_user_ref, submitted_at);
    create index if not exists platform_portal_access_requests_status_idx
      on platform_portal_access_requests(status);
    create index if not exists platform_portal_access_requests_plan_idx
      on platform_portal_access_requests(plan);

    create table if not exists platform_portal_edge_credentials (
      request_id text not null references platform_portal_access_requests(id) on delete cascade,
      edge_channel_ref text not null,
      edge_credential_ref text not null,
      edge_material_digest text not null,
      ordinal integer not null default 0 check (ordinal >= 0),
      primary key (request_id, edge_channel_ref)
    );

    create unique index if not exists platform_portal_edge_credentials_ref_idx
      on platform_portal_edge_credentials(edge_credential_ref);
    create index if not exists platform_portal_edge_credentials_request_idx
      on platform_portal_edge_credentials(request_id, ordinal);

    create table if not exists platform_portal_entries (
      id text primary key,
      account_id text not null references platform_accounts(id) on delete cascade,
      entitlement_id text not null references platform_entitlements(id) on delete cascade,
      token_hash text not null unique,
      status text not null check (status in ('active', 'used', 'revoked', 'expired')),
      expires_at text not null,
      max_uses integer not null check (max_uses > 0),
      use_count integer not null default 0 check (use_count >= 0),
      issued_by_ref text not null,
      approval_ref text not null,
      used_at text,
      revoked_at text,
      created_at text not null,
      updated_at text not null
    );

    create index if not exists platform_portal_entries_account_id_idx
      on platform_portal_entries(account_id);
    create index if not exists platform_portal_entries_token_hash_idx
      on platform_portal_entries(token_hash);
    create index if not exists platform_portal_entries_status_idx
      on platform_portal_entries(status);

    create table if not exists platform_portal_totp_credentials (
      id text primary key,
      account_id text not null references platform_accounts(id) on delete cascade,
      encrypted_totp_secret text not null,
      status text not null check (status in ('active', 'revoked', 'locked')),
      failure_count integer not null default 0 check (failure_count >= 0),
      locked_until text,
      enrolled_at text not null,
      last_verified_at text,
      revoked_at text,
      updated_at text not null
    );

    create index if not exists platform_portal_totp_credentials_account_id_idx
      on platform_portal_totp_credentials(account_id);
    create index if not exists platform_portal_totp_credentials_status_idx
      on platform_portal_totp_credentials(status);

    create table if not exists platform_portal_password_credentials (
      id text primary key,
      account_id text not null references platform_accounts(id) on delete cascade,
      password_hash text not null,
      status text not null check (status in ('active', 'revoked', 'locked')),
      failure_count integer not null default 0 check (failure_count >= 0),
      locked_until text,
      must_rotate integer not null default 0 check (must_rotate in (0, 1)),
      created_at text not null,
      last_verified_at text,
      revoked_at text,
      updated_at text not null
    );

    create index if not exists platform_portal_password_credentials_account_id_idx
      on platform_portal_password_credentials(account_id);
    create index if not exists platform_portal_password_credentials_status_idx
      on platform_portal_password_credentials(status);

    create table if not exists platform_portal_passkey_credentials (
      id text primary key,
      account_id text not null references platform_accounts(id) on delete cascade,
      credential_id text not null unique,
      credential_id_hash text not null unique,
      public_key_jwk_json text not null,
      sign_count integer not null default 0 check (sign_count >= 0),
      transports_json text not null default '[]',
      status text not null check (status in ('active', 'revoked', 'locked')),
      created_at text not null,
      last_verified_at text,
      revoked_at text,
      updated_at text not null
    );

    create index if not exists platform_portal_passkey_credentials_account_id_idx
      on platform_portal_passkey_credentials(account_id);
    create index if not exists platform_portal_passkey_credentials_status_idx
      on platform_portal_passkey_credentials(status);

    create table if not exists platform_portal_second_factor_challenges (
      id text primary key,
      account_id text not null references platform_accounts(id) on delete cascade,
      challenge_hash text not null,
      allowed_factors_json text not null,
      status text not null check (status in ('active', 'used', 'expired', 'locked')),
      failure_count integer not null default 0 check (failure_count >= 0),
      expires_at text not null,
      used_at text,
      created_at text not null,
      updated_at text not null
    );

    create index if not exists platform_portal_second_factor_account_id_idx
      on platform_portal_second_factor_challenges(account_id);
    create index if not exists platform_portal_second_factor_status_idx
      on platform_portal_second_factor_challenges(status);

    create table if not exists platform_portal_sessions (
      id text primary key,
      account_id text not null references platform_accounts(id) on delete cascade,
      entry_id text references platform_portal_entries(id) on delete set null,
      auth_method text not null,
      status text not null check (status in ('active', 'revoked', 'expired')),
      issued_at text not null,
      expires_at text not null,
      revoked_at text,
      updated_at text not null
    );

    create index if not exists platform_portal_sessions_account_id_idx
      on platform_portal_sessions(account_id);
    create index if not exists platform_portal_sessions_status_idx
      on platform_portal_sessions(status);
  `);

  if (initializeSchema) ensureTableColumns(db, "platform_portal_access_requests", [
    { name: "client_target", definition: "client_target text not null default 'clash'" },
    { name: "duration_days", definition: "duration_days integer not null default 30" },
    { name: "quantity", definition: "quantity integer not null default 1" },
    { name: "note_provided", definition: "note_provided integer not null default 0" },
    { name: "expires_at", definition: "expires_at text" },
    { name: "valid_until", definition: "valid_until text" },
    { name: "tenant_id", definition: "tenant_id text" },
    { name: "artifact_id", definition: "artifact_id text" },
    { name: "subscription_url", definition: "subscription_url text" },
    { name: "edge_channel_ref", definition: "edge_channel_ref text" },
    { name: "edge_credential_ref", definition: "edge_credential_ref text" },
    { name: "edge_material_digest", definition: "edge_material_digest text" },
    { name: "edge_lifecycle_mutation", definition: "edge_lifecycle_mutation integer not null default 0" },
    { name: "event_json", definition: "event_json text not null default '{}'" }
  ]);

  function upsertLead(input, { expiresAt } = {}) {
    const record = {
      id: requiredText(input.id, "id"),
      status: requiredText(input.status || "new", "status"),
      organization: requiredText(input.organization, "organization"),
      email: requiredText(input.email, "email"),
      direction: requiredText(input.direction, "direction"),
      stage: text(input.stage),
      message: requiredText(input.message, "message"),
      source: requiredText(input.source || "company-site", "source"),
      createdAt: isoText(input.createdAt, "createdAt"),
      updatedAt: isoText(input.updatedAt, "updatedAt"),
      expiresAt: isoText(expiresAt, "expiresAt")
    };
    sqliteRun(db.prepare(`
      insert into platform_leads (
        id, status, organization, email, direction, stage, message, source,
        created_at, updated_at, expires_at
      ) values (
        @id, @status, @organization, @email, @direction, @stage, @message, @source,
        @createdAt, @updatedAt, @expiresAt
      )
      on conflict(id) do update set
        status = excluded.status,
        organization = excluded.organization,
        email = excluded.email,
        direction = excluded.direction,
        stage = excluded.stage,
        message = excluded.message,
        source = excluded.source,
        updated_at = excluded.updated_at,
        expires_at = excluded.expires_at
    `), record);
    return getLead(record.id);
  }

  function getLead(id) {
    return mapLead(db.prepare("select * from platform_leads where id = ?").get(requiredText(id, "id")));
  }

  function listLeads(filters = {}) {
    const status = optionalText(filters.status);
    const rows = status
      ? db.prepare(`
          select * from platform_leads
          where status = ?
          order by created_at asc, id asc
        `).all(status)
      : db.prepare(`
          select * from platform_leads
          order by created_at asc, id asc
        `).all();
    return rows.map(mapLead);
  }

  function purgeExpiredLeads({ now } = {}) {
    return db.prepare("delete from platform_leads where expires_at <= ?")
      .run(isoText(now, "now")).changes;
  }

  function createAccount(input) {
    assertNoUnsafeFields(input);
    const record = {
      id: requiredText(input.id, "id"),
      ownerRef: requiredText(input.ownerRef, "ownerRef"),
      status: requiredText(input.status || "active", "status"),
      createdAt: isoText(input.createdAt, "createdAt"),
      updatedAt: isoText(input.updatedAt, "updatedAt"),
      metadataJson: issuanceMetadataJson(input.metadata)
    };
    sqliteRun(db.prepare(`
      insert into platform_accounts (
        id, owner_ref, status, created_at, updated_at, metadata_json
      ) values (
        @id, @ownerRef, @status, @createdAt, @updatedAt, @metadataJson
      )
    `), record);
    return getAccount(record.id);
  }

  function getAccount(id) {
    return mapAccount(db.prepare("select * from platform_accounts where id = ?").get(requiredText(id, "id")));
  }

  function listAccounts(filters = {}) {
    const status = optionalText(filters.status);
    const rows = status
      ? db.prepare(`
          select * from platform_accounts
          where status = ?
          order by created_at asc, id asc
        `).all(status)
      : db.prepare(`
          select * from platform_accounts
          order by created_at asc, id asc
        `).all();
    return rows.map(mapAccount);
  }

  function monitorCount(value) {
    if (typeof value === "bigint") {
      if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw platformError("source_unavailable", "integer overflow");
      }
      return Number(value);
    }
    if (!Number.isSafeInteger(value) || value < 0) {
      throw platformError("source_unavailable", "integer overflow");
    }
    return value;
  }

  const USER_MONITOR_REGISTRATION_SOURCE_SQL = `
    case
      when json_valid(metadata_json)
       and json_extract(metadata_json, '$.registrationSource') = 'self_service_portal'
      then 'self_service_portal'
      else 'other'
    end`;

  function listUserMonitorGrowthDays(input = {}) {
    const from = requiredText(input.from, "from");
    const to = requiredText(input.to, "to");
    const rows = db.prepare(`
      select substr(created_at, 1, 10) || 'T00:00:00.000Z' as day_at,
             sum(case when ${USER_MONITOR_REGISTRATION_SOURCE_SQL} = 'self_service_portal' then 1 else 0 end) as registered_count,
             sum(case when ${USER_MONITOR_REGISTRATION_SOURCE_SQL} = 'self_service_portal' then 0 else 1 end) as other_created_count
        from platform_accounts
       where created_at >= ? and created_at < ?
       group by day_at
       order by day_at
    `).all(from, to);
    return rows.map((row) => ({
      at: row.day_at,
      registeredCount: monitorCount(row.registered_count),
      otherCreatedCount: monitorCount(row.other_created_count)
    }));
  }

  function listUserMonitorAccountDirectory(input = {}) {
    const accountId = text(input.accountId) || null;
    const status = text(input.status) || null;
    const afterCreatedAt = input.afterCreatedAt == null ? null : requiredText(input.afterCreatedAt, "afterCreatedAt");
    const afterId = text(input.afterId) || null;
    const limit = integer(input.limit, "limit", { min: 1 });
    if ((afterCreatedAt == null) !== (afterId == null)) {
      throw platformError("validation_error", "cursor is invalid");
    }
    const rows = db.prepare(`
      select id,
             status,
             created_at,
             ${USER_MONITOR_REGISTRATION_SOURCE_SQL} as registration_source
        from platform_accounts
       where (? is null or id = ?)
         and (? is null or status = ?)
         and (
           ? is null
           or created_at < ?
           or (created_at = ? and id < ?)
         )
       order by created_at desc, id desc
       limit ?
    `).all(
      accountId,
      accountId,
      status,
      status,
      afterCreatedAt,
      afterCreatedAt,
      afterCreatedAt,
      afterId,
      limit
    );
    return rows.map((row) => ({
      id: row.id,
      status: row.status,
      createdAt: row.created_at,
      registrationSource: row.registration_source
    }));
  }

  function summarizeUserMonitorTraffic(input = {}) {
    const accountId = requiredText(input.accountId, "accountId");
    const from = requiredText(input.from, "from");
    const to = requiredText(input.to, "to");
    const bucket = requiredText(input.bucket, "bucket");
    if (bucket !== "day" && bucket !== "hour") {
      throw platformError("validation_error", "bucket is invalid");
    }
    const bucketSql = bucket === "hour"
      ? "substr(observed_at, 1, 13) || ':00:00.000Z'"
      : "substr(observed_at, 1, 10) || 'T00:00:00.000Z'";
    return db.transaction(() => {
      const totals = db.prepare(`
        select count(*) as sample_count,
               max(observed_at) as last_observed_at,
               sum(upload_bytes) as upload_bytes,
               sum(download_bytes) as download_bytes,
               sum(total_bytes) as total_bytes
          from platform_usage_samples
         where account_id = ? and observed_at >= ? and observed_at < ?
      `).get(accountId, from, to);
      const sampleCount = monitorCount(totals?.sample_count ?? 0);
      if (sampleCount === 0) {
        return {
          sampleCount: 0,
          lastObservedAt: null,
          uploadBytes: null,
          downloadBytes: null,
          totalBytes: null,
          points: []
        };
      }
      const points = db.prepare(`
        select ${bucketSql} as bucket_at,
               count(*) as sample_count,
               sum(upload_bytes) as upload_bytes,
               sum(download_bytes) as download_bytes,
               sum(total_bytes) as total_bytes
          from platform_usage_samples
         where account_id = ? and observed_at >= ? and observed_at < ?
         group by bucket_at
         order by bucket_at
      `).all(accountId, from, to);
      return {
        sampleCount,
        lastObservedAt: totals.last_observed_at,
        uploadBytes: monitorCount(totals.upload_bytes),
        downloadBytes: monitorCount(totals.download_bytes),
        totalBytes: monitorCount(totals.total_bytes),
        points: points.map((row) => ({
          at: row.bucket_at,
          sampleCount: monitorCount(row.sample_count),
          uploadBytes: monitorCount(row.upload_bytes),
          downloadBytes: monitorCount(row.download_bytes),
          totalBytes: monitorCount(row.total_bytes)
        }))
      };
    })();
  }

  function normalizePortalRegistrationWelcomeCoinGrantEnqueue(input) {
    exactObject(input, {
      allowed: [
        "grantRef",
        "accountId",
        "coinType",
        "amountUnits",
        "expiresAt",
        "sourceType",
        "sourceRef",
        "sourceDigest",
        "actorScope",
        "idempotencyKey",
        "now"
      ],
      name: "welcomeCoinGrant"
    });
    const record = {
      grantRef: safeControlRef(input.grantRef, "grantRef"),
      accountId: safeControlRef(input.accountId, "accountId"),
      coinType: requiredText(input.coinType, "coinType"),
      amountUnits: integer(input.amountUnits, "amountUnits", { min: 1 }),
      expiresAt: isoText(input.expiresAt, "expiresAt"),
      sourceType: safeControlRef(input.sourceType, "sourceType"),
      sourceRef: safeControlRef(input.sourceRef, "sourceRef"),
      sourceDigest: safeControlRef(input.sourceDigest, "sourceDigest"),
      actorScope: safeControlRef(input.actorScope, "actorScope"),
      idempotencyKey: safeAuthorityRef(input.idempotencyKey, "idempotencyKey"),
      now: isoText(input.now, "now")
    };
    if (record.coinType !== PORTAL_REGISTRATION_WELCOME_COIN_GRANT_TYPE) {
      throw platformError("validation_error", "coinType is not supported");
    }
    if (record.amountUnits !== PORTAL_REGISTRATION_WELCOME_COIN_GRANT_AMOUNT_UNITS) {
      throw platformError("validation_error", "amountUnits is not supported");
    }
    return record;
  }

  function getPortalRegistrationWelcomeCoinGrant(input) {
    exactObject(input, {
      allowed: ["accountId", "grantRef"],
      required: [],
      name: "welcomeCoinGrantLookup"
    });
    const hasAccountId = Object.prototype.hasOwnProperty.call(input, "accountId");
    const hasGrantRef = Object.prototype.hasOwnProperty.call(input, "grantRef");
    if (hasAccountId === hasGrantRef) {
      throw platformError(
        "validation_error",
        "welcomeCoinGrantLookup must contain exactly one lookup key"
      );
    }
    const row = hasAccountId
      ? db.prepare(`
          select * from platform_portal_registration_welcome_coin_grants
          where account_id = ?
        `).get(safeControlRef(input.accountId, "accountId"))
      : db.prepare(`
          select * from platform_portal_registration_welcome_coin_grants
          where grant_ref = ?
        `).get(safeControlRef(input.grantRef, "grantRef"));
    return mapPortalRegistrationWelcomeCoinGrant(row);
  }

  function samePortalRegistrationWelcomeCoinGrantImmutableFields(existing, record) {
    return (
      existing.grantRef === record.grantRef
      && existing.accountId === record.accountId
      && existing.coinType === record.coinType
      && existing.amountUnits === record.amountUnits
      && existing.expiresAt === record.expiresAt
      && existing.sourceType === record.sourceType
      && existing.sourceRef === record.sourceRef
      && existing.sourceDigest === record.sourceDigest
      && existing.actorScope === record.actorScope
      && existing.idempotencyKey === record.idempotencyKey
    );
  }

  function findPortalRegistrationWelcomeCoinGrantsByImmutableUniqueFields(record) {
    return db.prepare(`
      select *
      from platform_portal_registration_welcome_coin_grants
      where grant_ref = @grantRef
        or account_id = @accountId
        or source_ref = @sourceRef
        or (actor_scope = @actorScope and idempotency_key = @idempotencyKey)
      order by grant_ref asc
    `).all(record).map(mapPortalRegistrationWelcomeCoinGrant);
  }

  function enqueuePortalRegistrationWelcomeCoinGrant(input) {
    const record = normalizePortalRegistrationWelcomeCoinGrantEnqueue(input);
    const existing = findPortalRegistrationWelcomeCoinGrantsByImmutableUniqueFields(record);
    if (existing.length > 0) {
      if (
        existing.length !== 1
        || !samePortalRegistrationWelcomeCoinGrantImmutableFields(existing[0], record)
      ) {
        throw platformError("idempotency_conflict", "welcome coin grant immutable fields conflict");
      }
      return existing[0];
    }
    if (record.expiresAt !== portalRegistrationWelcomeCoinGrantExpiresAt(record.now)) {
      throw platformError("validation_error", "expiresAt must be exactly seven days after now");
    }
    sqliteRun(db.prepare(`
      insert into platform_portal_registration_welcome_coin_grants (
        grant_ref, account_id, coin_type, amount_units,
        source_type, source_ref, source_digest, actor_scope, idempotency_key,
        expires_at, status, next_attempt_at, attempt_count, lease_generation,
        lease_token, lease_until, last_safe_code, credited_lot_ref,
        created_at, updated_at, credited_at
      ) values (
        @grantRef, @accountId, @coinType, @amountUnits,
        @sourceType, @sourceRef, @sourceDigest, @actorScope, @idempotencyKey,
        @expiresAt, 'pending', @now, 0, 0,
        null, null, null, null,
        @now, @now, null
      )
      on conflict do nothing
    `), record);
    const created = findPortalRegistrationWelcomeCoinGrantsByImmutableUniqueFields(record);
    if (created.length !== 1) {
      throw platformError("state_conflict", "welcome coin grant was not created safely");
    }
    if (!samePortalRegistrationWelcomeCoinGrantImmutableFields(created[0], record)) {
      throw platformError("idempotency_conflict", "welcome coin grant immutable fields conflict");
    }
    return created[0];
  }

  function expireDuePortalRegistrationWelcomeCoinGrantsAt(now) {
    const expiredPending = db.prepare(`
      update platform_portal_registration_welcome_coin_grants
      set status = 'expired',
          lease_token = null,
          lease_until = null,
          last_safe_code = 'welcome_coin_grant_expired',
          updated_at = ?
      where status = 'pending' and expires_at <= ?
    `).run(now, now).changes;
    const reconciliationsRequired = db.prepare(`
      update platform_portal_registration_welcome_coin_grants
      set status = 'reconciliation_required',
          lease_token = null,
          lease_until = null,
          last_safe_code = 'welcome_coin_grant_expired_while_processing',
          updated_at = ?
      where status = 'processing'
        and expires_at <= ?
        and lease_until <= ?
    `).run(now, now, now).changes;
    return expiredPending + reconciliationsRequired;
  }

  function expireDuePortalRegistrationWelcomeCoinGrants(input) {
    exactObject(input, {
      allowed: ["now"],
      name: "welcomeCoinGrantExpiry"
    });
    const now = isoText(input.now, "now");
    return db.transaction(() => expireDuePortalRegistrationWelcomeCoinGrantsAt(now))
      .immediate();
  }

  function claimNextPortalRegistrationWelcomeCoinGrant(input) {
    exactObject(input, {
      allowed: ["now", "leaseMs"],
      name: "welcomeCoinGrantClaim"
    });
    const now = isoText(input.now, "now");
    const leaseMs = integer(input.leaseMs, "leaseMs", { min: 1 });
    if (leaseMs > MAX_PORTAL_REGISTRATION_WELCOME_COIN_GRANT_LEASE_MS) {
      throw platformError("validation_error", "leaseMs exceeds the maximum welcome coin grant lease");
    }
    const requestedLeaseUntil = addMillisecondsToIso(now, leaseMs, "leaseMs");
    const claim = db.transaction(() => {
      expireDuePortalRegistrationWelcomeCoinGrantsAt(now);
      const candidate = db.prepare(`
        select *
        from platform_portal_registration_welcome_coin_grants
        where expires_at > ? and (
          (status = 'pending' and next_attempt_at <= ?)
          or (status = 'processing' and lease_until <= ?)
        )
        order by
          case status
            when 'pending' then next_attempt_at
            else lease_until
          end asc,
          expires_at asc,
          grant_ref asc
        limit 1
      `).get(now, now, now);
      if (!candidate) return null;
      const leaseUntil = requestedLeaseUntil < candidate.expires_at
        ? requestedLeaseUntil
        : candidate.expires_at;
      const leaseToken = randomBytes(32).toString("hex");
      const claimed = db.prepare(`
        update platform_portal_registration_welcome_coin_grants
        set status = 'processing',
            attempt_count = attempt_count + 1,
            lease_generation = lease_generation + 1,
            lease_token = ?,
            lease_until = ?,
            updated_at = ?
        where grant_ref = ?
          and expires_at > ?
          and (
            (status = 'pending' and next_attempt_at <= ?)
            or (status = 'processing' and lease_until <= ?)
          )
      `).run(leaseToken, leaseUntil, now, candidate.grant_ref, now, now, now);
      if (claimed.changes !== 1) {
        throw platformError("claim_lost", "welcome coin grant claim is no longer current");
      }
      return mapPortalRegistrationWelcomeCoinGrantClaim(
        db.prepare(`
          select * from platform_portal_registration_welcome_coin_grants
          where grant_ref = ?
        `).get(candidate.grant_ref)
      );
    });
    return claim.immediate();
  }

  function normalizePortalRegistrationWelcomeCoinGrantLease(input, name, fields) {
    exactObject(input, { allowed: fields, name });
    const record = {
      grantRef: safeControlRef(input.grantRef, "grantRef"),
      leaseGeneration: integer(input.leaseGeneration, "leaseGeneration", { min: 1 }),
      leaseToken: requiredText(input.leaseToken, "leaseToken")
    };
    if (!PORTAL_REGISTRATION_WELCOME_COIN_GRANT_LEASE_TOKEN_PATTERN.test(record.leaseToken)) {
      throw platformError("validation_error", "leaseToken is invalid");
    }
    return record;
  }

  function updateClaimedPortalRegistrationWelcomeCoinGrant({
    record,
    setSql,
    values,
    guardSql = "",
    guardValues = [],
    notCurrentMessage
  }) {
    const updated = db.prepare(`
      update platform_portal_registration_welcome_coin_grants
      set ${setSql}
      where grant_ref = ?
        and status = 'processing'
        and lease_generation = ?
        and lease_token = ?
        ${guardSql}
    `).run(
      ...values,
      record.grantRef,
      record.leaseGeneration,
      record.leaseToken,
      ...guardValues
    );
    if (updated.changes !== 1) {
      throw platformError("claim_lost", notCurrentMessage);
    }
    return getPortalRegistrationWelcomeCoinGrant({ grantRef: record.grantRef });
  }

  function completePortalRegistrationWelcomeCoinGrant(input) {
    const lease = normalizePortalRegistrationWelcomeCoinGrantLease(
      input,
      "welcomeCoinGrantCompletion",
      ["grantRef", "leaseGeneration", "leaseToken", "lotRef", "completedAt"]
    );
    const lotRef = safeControlRef(input.lotRef, "lotRef");
    const completedAt = isoText(input.completedAt, "completedAt");
    return updateClaimedPortalRegistrationWelcomeCoinGrant({
      record: lease,
      setSql: `
        status = 'credited',
        lease_token = null,
        lease_until = null,
        last_safe_code = null,
        credited_lot_ref = ?,
        credited_at = ?,
        updated_at = ?
      `,
      values: [lotRef, completedAt, completedAt],
      guardSql: "and expires_at > ? and lease_until >= ?",
      guardValues: [completedAt, completedAt],
      notCurrentMessage: "welcome coin grant completion is no longer current"
    });
  }

  function deferPortalRegistrationWelcomeCoinGrant(input) {
    const lease = normalizePortalRegistrationWelcomeCoinGrantLease(
      input,
      "welcomeCoinGrantDeferral",
      [
        "grantRef",
        "leaseGeneration",
        "leaseToken",
        "safeCode",
        "nextAttemptAt",
        "updatedAt"
      ]
    );
    const safeCode = safeControlRef(input.safeCode, "safeCode");
    const nextAttemptAt = isoText(input.nextAttemptAt, "nextAttemptAt");
    const updatedAt = isoText(input.updatedAt, "updatedAt");
    return updateClaimedPortalRegistrationWelcomeCoinGrant({
      record: lease,
      setSql: `
        status = 'pending',
        lease_token = null,
        lease_until = null,
        last_safe_code = ?,
        next_attempt_at = ?,
        updated_at = ?
      `,
      values: [safeCode, nextAttemptAt, updatedAt],
      notCurrentMessage: "welcome coin grant deferral is no longer current"
    });
  }

  function markPortalRegistrationWelcomeCoinGrantReconciliationRequired(input) {
    const lease = normalizePortalRegistrationWelcomeCoinGrantLease(
      input,
      "welcomeCoinGrantReconciliation",
      ["grantRef", "leaseGeneration", "leaseToken", "safeCode", "updatedAt"]
    );
    const safeCode = safeControlRef(input.safeCode, "safeCode");
    const updatedAt = isoText(input.updatedAt, "updatedAt");
    return updateClaimedPortalRegistrationWelcomeCoinGrant({
      record: lease,
      setSql: `
        status = 'reconciliation_required',
        lease_token = null,
        lease_until = null,
        last_safe_code = ?,
        updated_at = ?
      `,
      values: [safeCode, updatedAt],
      notCurrentMessage: "welcome coin grant reconciliation is no longer current"
    });
  }

  function nextPortalRegistrationWelcomeCoinGrantWakeAt() {
    const row = db.prepare(`
      select min(wake_at) as wake_at
      from (
        select case
          when next_attempt_at < expires_at then next_attempt_at
          else expires_at
        end as wake_at
        from platform_portal_registration_welcome_coin_grants
        where status = 'pending'
        union all
        select lease_until as wake_at
        from platform_portal_registration_welcome_coin_grants
        where status = 'processing'
      )
    `).get();
    return row?.wake_at ? isoText(row.wake_at, "wakeAt") : null;
  }

  function resolvePortalLoginAccount(loginRef) {
    const normalizedInput = requiredText(loginRef, "loginRef");
    const exact = getAccount(normalizedInput);
    if (exact) {
      return {
        status: "resolved",
        account: exact
      };
    }

    const normalized = normalizedPortalLoginRef(normalizedInput);
    const matches = new Map();
    const accounts = db.prepare(`
      select * from platform_accounts
      where status = 'active'
      order by created_at asc, id asc
    `).all().map(mapAccount);
    for (const account of accounts) {
      for (const candidate of portalLoginRefsFromMetadata(account.metadata)) {
        if (normalizedPortalLoginRef(candidate) === normalized) {
          matches.set(account.id, account);
        }
      }
    }

    if (matches.size === 1) {
      return {
        status: "resolved",
        account: [...matches.values()][0]
      };
    }
    if (matches.size > 1) {
      return {
        status: "ambiguous",
        account: null
      };
    }
    return {
      status: "not_found",
      account: null
    };
  }

  // Wallet-first deferred resource effects are deliberately kept outside the
  // ordinary Commerce fulfillment and Account Resource Authority paths.  The
  // transition reference is the only idempotency key and the audit rows below
  // are durable, namespaced receipts; they do not represent Commerce orders.
  function walletFirstResourceEffectPreparationRef(transitionRef) {
    return walletFirstResourceEffectRef("wfprep", transitionRef);
  }

  function walletFirstResourceEffectRuntimeReceiptRef(transitionRef) {
    return walletFirstResourceEffectRef("wfruntime", transitionRef);
  }

  function walletFirstResourceEffectReceiptRef(transitionRef) {
    return walletFirstResourceEffectRef("wfeffect", transitionRef);
  }

  function walletFirstResourceEffectSuccessorRef(prefix, transitionRef) {
    return walletFirstResourceEffectRef(prefix, transitionRef);
  }

  function walletFirstResourceEffectExactKeys(value, keys) {
    return (
      value
      && typeof value === "object"
      && !Array.isArray(value)
      && Object.keys(value).length === keys.length
      && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
    );
  }

  function walletFirstResourceEffectSafeRuntimeId(value, field) {
    const normalized = requiredText(value, field);
    if (!/^[A-Za-z0-9_-]{3,128}$/.test(normalized)) {
      throw platformError("validation_error", `${field} must be a safe runtime identifier`);
    }
    return normalized;
  }

  function walletFirstResourceEffectOffer(value) {
    exactObject(value, {
      allowed: ["offerVersionRef", "durationDays", "monthlyTrafficGb"],
      name: "walletFirstResourceEffectOffer"
    });
    const offerVersionRef = safeControlRef(value.offerVersionRef, "offerVersionRef");
    const supported = WALLET_FIRST_RESOURCE_EFFECT_SUPPORTED_OFFERS[offerVersionRef];
    if (
      !supported
      || integer(value.durationDays, "durationDays", { min: 1 }) !== supported.durationDays
      || integer(value.monthlyTrafficGb, "monthlyTrafficGb", { min: 1 })
        !== supported.monthlyTrafficGb
    ) {
      throw platformError("validation_error", "wallet-first resource-effect offer is not supported");
    }
    return Object.freeze({
      offerVersionRef,
      durationDays: supported.durationDays,
      monthlyTrafficGb: supported.monthlyTrafficGb,
      portalPlan: supported.portalPlan
    });
  }

  function walletFirstResourceEffectExpectedChain(value) {
    exactObject(value, {
      allowed: ["entitlementId", "requestId", "issuedLinkId", "validUntil"],
      name: "walletFirstResourceEffectExpectedChain"
    });
    return Object.freeze({
      entitlementId: safeControlRef(value.entitlementId, "expectedEntitlementId"),
      requestId: safeControlRef(value.requestId, "expectedRequestId"),
      issuedLinkId: safeControlRef(value.issuedLinkId, "expectedIssuedLinkId"),
      validUntil: isoText(value.validUntil, "expectedValidUntil")
    });
  }

  function walletFirstResourceEffectAccountRecord(accountId) {
    const normalizedAccountId = safeControlRef(accountId, "accountId");
    const account = getAccount(normalizedAccountId);
    if (!account) {
      throw platformError("not_found", "wallet-first account was not found");
    }
    if (
      account.status !== "active"
      || !account.metadata
      || typeof account.metadata !== "object"
      || Array.isArray(account.metadata)
      || account.metadata.commercialModel !== WALLET_FIRST_RESOURCE_EFFECT_COMMERCIAL_MODEL
    ) {
      throw platformError("validation_error", "account is not a wallet-first account");
    }
    return account;
  }

  function walletFirstResourceEffectRows(accountId) {
    return db.prepare(`
      select
        e.id as entitlement_id,
        e.account_id as entitlement_account_id,
        e.plan as entitlement_plan,
        e.status as entitlement_status,
        e.valid_from as entitlement_valid_from,
        e.valid_until as entitlement_valid_until,
        e.max_artifacts as entitlement_max_artifacts,
        e.max_devices as entitlement_max_devices,
        e.traffic_limit_bytes as entitlement_traffic_limit_bytes,
        r.id as request_id,
        r.account_id as request_account_id,
        r.entitlement_id as request_entitlement_id,
        r.status as request_status,
        r.node_id as request_node_id,
        r.metadata_json as request_metadata_json,
        l.id as issued_link_id,
        l.request_id as issued_link_request_id,
        l.tenant_ref as link_tenant_ref,
        l.artifact_ref as link_artifact_ref,
        l.status as link_status,
        p.id as portal_id,
        p.portal_user_ref,
        p.plan as portal_plan,
        p.duration_days as portal_duration_days,
        p.status as portal_status,
        p.expires_at as portal_expires_at,
        p.valid_until as portal_valid_until,
        p.entitlement_ref as portal_entitlement_ref,
        p.access_grant_ref as portal_access_grant_ref,
        p.tenant_id as portal_tenant_id,
        p.artifact_id as portal_artifact_id,
        p.subscription_url as portal_subscription_url,
        p.edge_channel_ref as portal_edge_channel_ref,
        p.edge_credential_ref as portal_edge_credential_ref,
        p.edge_material_digest as portal_edge_material_digest,
        p.edge_lifecycle_mutation as portal_edge_lifecycle_mutation,
        (
          select count(*)
          from platform_portal_edge_credentials pec
          where pec.request_id = r.id
        ) as portal_edge_credential_count
      from platform_entitlements e
      left join platform_issuance_requests r
        on r.account_id = e.account_id and r.entitlement_id = e.id
      left join platform_issued_subscription_links l on l.request_id = r.id
      left join platform_portal_access_requests p on p.id = r.id
      where e.account_id = ?
      order by e.id asc, r.id asc, l.id asc
    `).all(accountId);
  }

  function walletFirstResourceEffectResourceRowCounts(accountId) {
    return db.prepare(`
      select
        (select count(*) from platform_entitlements where account_id = @accountId) as entitlement_count,
        (select count(*) from platform_issuance_requests where account_id = @accountId) as request_count,
        (
          select count(*)
          from platform_issued_subscription_links l
          join platform_issuance_requests r on r.id = l.request_id
          where r.account_id = @accountId
        ) as issued_link_count,
        (
          select count(*)
          from platform_portal_access_requests
          where portal_user_ref = @accountId
        ) as portal_request_count
    `).get({ accountId });
  }

  function walletFirstResourceEffectChainMetadata(value) {
    const metadata = parseJsonObject(value);
    if (
      !walletFirstResourceEffectExactKeys(metadata, [
        "commercialModel",
        "resourceModel",
        "resourceModelVersion",
        "initialTransitionRef",
        "lastTransitionRef"
      ])
      || metadata.commercialModel !== WALLET_FIRST_RESOURCE_EFFECT_COMMERCIAL_MODEL
      || metadata.resourceModel !== WALLET_FIRST_RESOURCE_CHAIN_MODEL
      || metadata.resourceModelVersion !== WALLET_FIRST_RESOURCE_EFFECT_VERSION
      || !safeControlRef(metadata.initialTransitionRef, "initialTransitionRef")
      || !safeControlRef(metadata.lastTransitionRef, "lastTransitionRef")
    ) {
      throw platformError("validation_error", "wallet-first resource chain marker is invalid");
    }
    return Object.freeze({
      commercialModel: metadata.commercialModel,
      resourceModel: metadata.resourceModel,
      resourceModelVersion: metadata.resourceModelVersion,
      initialTransitionRef: metadata.initialTransitionRef,
      lastTransitionRef: metadata.lastTransitionRef
    });
  }

  function walletFirstResourceEffectExactChain(accountId) {
    const counts = walletFirstResourceEffectResourceRowCounts(accountId);
    const countValues = [
      counts.entitlement_count,
      counts.request_count,
      counts.issued_link_count,
      counts.portal_request_count
    ].map((value) => Number(value));
    if (countValues.every((value) => value === 0)) return null;
    if (countValues.some((value) => value !== 1)) {
      throw platformError("validation_error", "wallet-first resource chain is ambiguous");
    }
    const rows = walletFirstResourceEffectRows(accountId);
    if (rows.length !== 1) {
      throw platformError("validation_error", "wallet-first resource chain is ambiguous");
    }
    const row = rows[0];
    const validFrom = isoText(row.entitlement_valid_from, "entitlementValidFrom");
    const validUntil = isoText(row.entitlement_valid_until, "entitlementValidUntil");
    const offer = walletFirstResourceEffectOffer({
      offerVersionRef: row.entitlement_plan,
      durationDays: row.portal_duration_days,
      monthlyTrafficGb: Number(row.entitlement_traffic_limit_bytes) / (1024 ** 3)
    });
    if (
      row.entitlement_account_id !== accountId
      || row.request_account_id !== accountId
      || row.entitlement_status !== "active"
      || row.request_status !== "issued"
      || row.link_status !== "active"
      || row.request_entitlement_id !== row.entitlement_id
      || row.issued_link_request_id !== row.request_id
      || row.portal_id !== row.request_id
      || row.portal_user_ref !== accountId
      || row.portal_entitlement_ref !== row.entitlement_id
      || !["issued", "delivered"].includes(row.portal_status)
      || row.portal_expires_at !== validUntil
      || row.portal_valid_until !== validUntil
      || validFrom >= validUntil
      || row.entitlement_max_artifacts !== 1
      || row.entitlement_max_devices !== 1
      || Number(row.entitlement_traffic_limit_bytes) !== offer.monthlyTrafficGb * (1024 ** 3)
      || row.portal_plan !== offer.portalPlan
      || walletFirstResourceEffectBindingRef("tenant", row.portal_tenant_id) !== row.link_tenant_ref
      || walletFirstResourceEffectBindingRef("artifact", row.portal_artifact_id) !== row.link_artifact_ref
      || row.portal_subscription_url !== null
      || row.portal_edge_channel_ref !== null
      || row.portal_edge_credential_ref !== null
      || row.portal_edge_material_digest !== null
      || row.portal_edge_lifecycle_mutation !== 0
      || Number(row.portal_edge_credential_count) !== 0
    ) {
      throw platformError("validation_error", "wallet-first resource chain is not exact");
    }
    const metadata = walletFirstResourceEffectChainMetadata(row.request_metadata_json);
    return Object.freeze({
      entitlementId: safeControlRef(row.entitlement_id, "entitlementId"),
      requestId: safeControlRef(row.request_id, "requestId"),
      issuedLinkId: safeControlRef(row.issued_link_id, "issuedLinkId"),
      validFrom,
      validUntil,
      offerVersionRef: offer.offerVersionRef,
      monthlyTrafficGb: offer.monthlyTrafficGb,
      portalPlan: offer.portalPlan,
      portalStatus: requiredText(row.portal_status, "portalStatus"),
      durationDays: offer.durationDays,
      tenantId: walletFirstResourceEffectSafeRuntimeId(row.portal_tenant_id, "tenantId"),
      artifactId: walletFirstResourceEffectSafeRuntimeId(row.portal_artifact_id, "artifactId"),
      tenantRef: safeControlRef(row.link_tenant_ref, "tenantRef"),
      artifactRef: safeControlRef(row.link_artifact_ref, "artifactRef"),
      nodeId: safeControlRef(row.request_node_id, "nodeId"),
      accessGrantRef: safeControlRef(row.portal_access_grant_ref, "accessGrantRef"),
      metadata: Object.freeze({
        commercialModel: metadata.commercialModel,
        resourceModel: metadata.resourceModel,
        resourceModelVersion: metadata.resourceModelVersion,
        initialTransitionRef: metadata.initialTransitionRef,
        lastTransitionRef: metadata.lastTransitionRef
      })
    });
  }

  function walletFirstResourceEffectPreparedMetadata(input) {
    return Object.freeze({
      version: WALLET_FIRST_RESOURCE_EFFECT_VERSION,
      transitionRef: input.transitionRef,
      accountId: input.accountId,
      flowKind: input.flowKind,
      offerVersionRef: input.offer.offerVersionRef,
      durationDays: input.offer.durationDays,
      monthlyTrafficGb: input.offer.monthlyTrafficGb,
      portalPlan: input.offer.portalPlan,
      scheduledFor: input.scheduledFor,
      activationAt: input.activationAt,
      validUntil: input.validUntil,
      effectRef: input.effectRef,
      entitlementId: input.successor.entitlementId,
      requestId: input.successor.requestId,
      issuedLinkId: input.successor.issuedLinkId,
      nodeId: input.nodeId,
      accountDigest: input.accountDigest,
      expectedEntitlementId: input.expectedChain?.entitlementId ?? null,
      expectedRequestId: input.expectedChain?.requestId ?? null,
      expectedIssuedLinkId: input.expectedChain?.issuedLinkId ?? null,
      expectedValidUntil: input.expectedChain?.validUntil ?? null,
      currentTenantRef: input.currentChain?.tenantRef ?? null,
      currentArtifactRef: input.currentChain?.artifactRef ?? null,
      currentInitialTransitionRef: input.currentChain?.initialTransitionRef ?? null
    });
  }

  const walletFirstResourceEffectPreparedMetadataKeys = Object.freeze([
    "version", "transitionRef", "accountId", "flowKind", "offerVersionRef",
    "durationDays", "monthlyTrafficGb", "portalPlan", "scheduledFor", "activationAt",
    "validUntil", "effectRef", "entitlementId", "requestId", "issuedLinkId",
    "nodeId", "accountDigest", "expectedEntitlementId", "expectedRequestId",
    "expectedIssuedLinkId", "expectedValidUntil", "currentTenantRef", "currentArtifactRef",
    "currentInitialTransitionRef"
  ]);

  const walletFirstResourceEffectRuntimeMetadataKeys = Object.freeze([
    "version", "transitionRef", "effectRef", "flowKind", "entitlementId", "requestId",
    "issuedLinkId", "validUntil", "tenantId", "artifactId", "tenantRef", "artifactRef",
    "nodeId", "initialTransitionRef", "runtimeReceiptRef"
  ]);

  const walletFirstResourceEffectReceiptMetadataKeys = Object.freeze([
    "version", "transitionRef", "effectRef", "flowKind", "accountId", "entitlementId",
    "requestId", "issuedLinkId", "validUntil", "runtimeReceiptRef"
  ]);

  function walletFirstResourceEffectPreparedFromAudit(audit) {
    const metadata = audit?.metadata;
    if (
      !audit
      || audit.entityType !== WALLET_FIRST_RESOURCE_EFFECT_AUDIT_ENTITY_TYPE
      || audit.action !== "resource_effect_prepared"
      || audit.actorRef !== WALLET_FIRST_RESOURCE_EFFECT_ACTOR_REF
      || !walletFirstResourceEffectExactKeys(metadata, walletFirstResourceEffectPreparedMetadataKeys)
      || metadata.version !== WALLET_FIRST_RESOURCE_EFFECT_VERSION
      || !["initial_activation", "scheduled_switch"].includes(metadata.flowKind)
    ) {
      throw platformError("validation_error", "wallet-first resource-effect preparation is invalid");
    }
    const offer = walletFirstResourceEffectOffer({
      offerVersionRef: metadata.offerVersionRef,
      durationDays: metadata.durationDays,
      monthlyTrafficGb: metadata.monthlyTrafficGb
    });
    if (metadata.portalPlan !== offer.portalPlan) {
      throw platformError("validation_error", "wallet-first resource-effect preparation offer is invalid");
    }
    const result = {
      transitionRef: safeControlRef(metadata.transitionRef, "transitionRef"),
      accountId: safeControlRef(metadata.accountId, "accountId"),
      flowKind: metadata.flowKind,
      offer,
      scheduledFor: isoText(metadata.scheduledFor, "scheduledFor"),
      activationAt: isoText(metadata.activationAt, "activationAt"),
      validUntil: isoText(metadata.validUntil, "validUntil"),
      effectRef: safeControlRef(metadata.effectRef, "effectRef"),
      successor: Object.freeze({
        entitlementId: safeControlRef(metadata.entitlementId, "entitlementId"),
        requestId: safeControlRef(metadata.requestId, "requestId"),
        issuedLinkId: safeControlRef(metadata.issuedLinkId, "issuedLinkId"),
        validUntil: isoText(metadata.validUntil, "validUntil")
      }),
      nodeId: safeControlRef(metadata.nodeId, "nodeId"),
      accountDigest: requiredText(metadata.accountDigest, "accountDigest"),
      expectedChain: null,
      currentChain: null
    };
    if (!/^[a-f0-9]{64}$/.test(result.accountDigest)) {
      throw platformError("validation_error", "wallet-first resource-effect account digest is invalid");
    }
    if (
      result.accountDigest !== walletFirstResourceEffectAccountDigest(result.accountId)
      || result.effectRef !== walletFirstResourceEffectReceiptRef(result.transitionRef)
    ) {
      throw platformError("validation_error", "wallet-first resource-effect preparation binding is invalid");
    }
    if (result.flowKind === "initial_activation") {
      if (
        result.scheduledFor > result.activationAt
        || [
          metadata.expectedEntitlementId,
          metadata.expectedRequestId,
          metadata.expectedIssuedLinkId,
          metadata.expectedValidUntil,
          metadata.currentTenantRef,
          metadata.currentArtifactRef,
          metadata.currentInitialTransitionRef
        ].some((value) => value !== null)
      ) {
        throw platformError("validation_error", "wallet-first initial preparation is invalid");
      }
      if (
        result.successor.entitlementId
          !== walletFirstResourceEffectSuccessorRef("wfxent", result.transitionRef)
        || result.successor.requestId
          !== walletFirstResourceEffectSuccessorRef("wfxreq", result.transitionRef)
        || result.successor.issuedLinkId
          !== walletFirstResourceEffectSuccessorRef("wfxlink", result.transitionRef)
      ) {
        throw platformError("validation_error", "wallet-first initial successor is invalid");
      }
    } else {
      result.expectedChain = walletFirstResourceEffectExpectedChain({
        entitlementId: metadata.expectedEntitlementId,
        requestId: metadata.expectedRequestId,
        issuedLinkId: metadata.expectedIssuedLinkId,
        validUntil: metadata.expectedValidUntil
      });
      if (result.scheduledFor !== result.expectedChain.validUntil) {
        throw platformError("validation_error", "wallet-first scheduled preparation is invalid");
      }
      result.currentChain = Object.freeze({
        tenantRef: safeControlRef(metadata.currentTenantRef, "currentTenantRef"),
        artifactRef: safeControlRef(metadata.currentArtifactRef, "currentArtifactRef"),
        initialTransitionRef: safeControlRef(
          metadata.currentInitialTransitionRef,
          "currentInitialTransitionRef"
        )
      });
      if (
        result.successor.entitlementId !== result.expectedChain.entitlementId
        || result.successor.requestId !== result.expectedChain.requestId
        || result.successor.issuedLinkId !== result.expectedChain.issuedLinkId
      ) {
        throw platformError("validation_error", "wallet-first scheduled successor is invalid");
      }
    }
    if (
      result.validUntil
        !== walletFirstResourceEffectTargetValidUntil(result.activationAt, result.offer.durationDays)
      || result.validUntil <= result.activationAt
    ) {
      throw platformError("validation_error", "wallet-first resource-effect target is invalid");
    }
    return Object.freeze(result);
  }

  function walletFirstResourceEffectRuntimeReceiptFromAudit(audit) {
    const metadata = audit?.metadata;
    if (
      !audit
      || audit.entityType !== WALLET_FIRST_RESOURCE_EFFECT_AUDIT_ENTITY_TYPE
      || audit.action !== "resource_runtime_applied"
      || audit.actorRef !== WALLET_FIRST_RESOURCE_EFFECT_ACTOR_REF
      || !walletFirstResourceEffectExactKeys(metadata, walletFirstResourceEffectRuntimeMetadataKeys)
      || metadata.version !== WALLET_FIRST_RESOURCE_EFFECT_VERSION
      || !["initial_activation", "scheduled_switch"].includes(metadata.flowKind)
    ) {
      throw platformError("validation_error", "wallet-first runtime receipt is invalid");
    }
    const transitionRef = safeControlRef(metadata.transitionRef, "transitionRef");
    const runtimeReceiptRef = safeControlRef(metadata.runtimeReceiptRef, "runtimeReceiptRef");
    if (runtimeReceiptRef !== walletFirstResourceEffectRuntimeReceiptRef(transitionRef)) {
      throw platformError("validation_error", "wallet-first runtime receipt reference is invalid");
    }
    return Object.freeze({
      transitionRef,
      effectRef: safeControlRef(metadata.effectRef, "effectRef"),
      flowKind: metadata.flowKind,
      successor: Object.freeze({
        entitlementId: safeControlRef(metadata.entitlementId, "entitlementId"),
        requestId: safeControlRef(metadata.requestId, "requestId"),
        issuedLinkId: safeControlRef(metadata.issuedLinkId, "issuedLinkId"),
        validUntil: isoText(metadata.validUntil, "validUntil")
      }),
      tenantId: walletFirstResourceEffectSafeRuntimeId(metadata.tenantId, "tenantId"),
      artifactId: walletFirstResourceEffectSafeRuntimeId(metadata.artifactId, "artifactId"),
      tenantRef: safeControlRef(metadata.tenantRef, "tenantRef"),
      artifactRef: safeControlRef(metadata.artifactRef, "artifactRef"),
      nodeId: safeControlRef(metadata.nodeId, "nodeId"),
      initialTransitionRef: safeControlRef(
        metadata.initialTransitionRef,
        "initialTransitionRef"
      ),
      runtimeReceiptRef
    });
  }

  function walletFirstResourceEffectReceiptFromAudit(audit) {
    const metadata = audit?.metadata;
    if (
      !audit
      || audit.entityType !== WALLET_FIRST_RESOURCE_EFFECT_AUDIT_ENTITY_TYPE
      || audit.action !== "resource_effect_applied"
      || audit.actorRef !== WALLET_FIRST_RESOURCE_EFFECT_ACTOR_REF
      || !walletFirstResourceEffectExactKeys(metadata, walletFirstResourceEffectReceiptMetadataKeys)
      || metadata.version !== WALLET_FIRST_RESOURCE_EFFECT_VERSION
      || !["initial_activation", "scheduled_switch"].includes(metadata.flowKind)
    ) {
      throw platformError("validation_error", "wallet-first effect receipt is invalid");
    }
    const transitionRef = safeControlRef(metadata.transitionRef, "transitionRef");
    const effectRef = safeControlRef(metadata.effectRef, "effectRef");
    if (effectRef !== walletFirstResourceEffectReceiptRef(transitionRef)) {
      throw platformError("validation_error", "wallet-first effect receipt reference is invalid");
    }
    return Object.freeze({
      transitionRef,
      accountId: safeControlRef(metadata.accountId, "accountId"),
      flowKind: metadata.flowKind,
      effectRef,
      successor: Object.freeze({
        entitlementId: safeControlRef(metadata.entitlementId, "entitlementId"),
        requestId: safeControlRef(metadata.requestId, "requestId"),
        issuedLinkId: safeControlRef(metadata.issuedLinkId, "issuedLinkId"),
        validUntil: isoText(metadata.validUntil, "validUntil")
      }),
      runtimeReceiptRef: safeControlRef(metadata.runtimeReceiptRef, "runtimeReceiptRef")
    });
  }

  function walletFirstResourceEffectPreparedOutput(prepared) {
    return Object.freeze({
      transitionRef: prepared.transitionRef,
      effectRef: prepared.effectRef,
      successor: prepared.successor,
      runtimeRequest: Object.freeze({
        kind: "wallet_first_resource_effect_v1",
        accountDigest: prepared.accountDigest,
        nodeId: prepared.nodeId,
        scheduledFor: prepared.scheduledFor,
        activationAt: prepared.activationAt,
        validUntil: prepared.validUntil,
        ...(prepared.flowKind === "scheduled_switch" ? {
          tenantRef: prepared.currentChain.tenantRef,
          artifactRef: prepared.currentChain.artifactRef,
          initialTransitionRef: prepared.currentChain.initialTransitionRef
        } : {})
      })
    });
  }

  // The exact runtime chain is captured only when a scheduled transition is
  // first prepared.  A retry reconstructs the immutable caller intent, not
  // that captured runtime binding: after a crash following Core renewal the
  // control chain deliberately still has the old valid-until until completion.
  // Comparing a retry's absent `currentChain` to the persisted one therefore
  // turned a safe recovery into an idempotency conflict.  The persisted
  // preparation remains the authority for the runtime binding; this helper
  // compares only the externally supplied immutable transition intent.
  function walletFirstResourceEffectSamePreparationIntent(left, right) {
    return (
      left.transitionRef === right.transitionRef
      && left.accountId === right.accountId
      && left.flowKind === right.flowKind
      && left.offer.offerVersionRef === right.offer.offerVersionRef
      && left.offer.durationDays === right.offer.durationDays
      && left.offer.monthlyTrafficGb === right.offer.monthlyTrafficGb
      && left.scheduledFor === right.scheduledFor
      && left.effectRef === right.effectRef
      && left.nodeId === right.nodeId
      && left.accountDigest === right.accountDigest
      && left.expectedChain?.entitlementId === right.expectedChain?.entitlementId
      && left.expectedChain?.requestId === right.expectedChain?.requestId
      && left.expectedChain?.issuedLinkId === right.expectedChain?.issuedLinkId
      && left.expectedChain?.validUntil === right.expectedChain?.validUntil
    );
  }

  function walletFirstResourceEffectSameRuntimeReceipt(left, right) {
    return (
      left.transitionRef === right.transitionRef
      && left.effectRef === right.effectRef
      && left.flowKind === right.flowKind
      && left.successor.entitlementId === right.successor.entitlementId
      && left.successor.requestId === right.successor.requestId
      && left.successor.issuedLinkId === right.successor.issuedLinkId
      && left.successor.validUntil === right.successor.validUntil
      && left.tenantId === right.tenantId
      && left.artifactId === right.artifactId
      && left.tenantRef === right.tenantRef
      && left.artifactRef === right.artifactRef
      && left.nodeId === right.nodeId
      && left.initialTransitionRef === right.initialTransitionRef
      && left.runtimeReceiptRef === right.runtimeReceiptRef
    );
  }

  function walletFirstResourceEffectSameReceipt(left, right) {
    return (
      left.transitionRef === right.transitionRef
      && left.accountId === right.accountId
      && left.flowKind === right.flowKind
      && left.effectRef === right.effectRef
      && left.successor.entitlementId === right.successor.entitlementId
      && left.successor.requestId === right.successor.requestId
      && left.successor.issuedLinkId === right.successor.issuedLinkId
      && left.successor.validUntil === right.successor.validUntil
      && left.runtimeReceiptRef === right.runtimeReceiptRef
    );
  }

  function getWalletFirstAccountForDeferredTransition(input) {
    exactObject(input, {
      allowed: ["accountId"],
      name: "walletFirstAccountLookup"
    });
    const accountId = safeControlRef(input.accountId, "accountId");
    const account = getAccount(accountId);
    if (!account) {
      return Object.freeze({
        accountId,
        status: "missing",
        commercialModel: "missing"
      });
    }
    return Object.freeze({
      accountId,
      status: account.status,
      commercialModel: account.metadata?.commercialModel || "missing"
    });
  }

  function resolveExactWalletFirstResourceChainForDeferredTransition(input) {
    exactObject(input, {
      allowed: ["accountId"],
      name: "walletFirstResourceChainLookup"
    });
    const account = walletFirstResourceEffectAccountRecord(input.accountId);
    const chain = walletFirstResourceEffectExactChain(account.id);
    if (!chain) {
      return Object.freeze({ state: "none", activeChainCount: 0 });
    }
    return Object.freeze({
      state: "current",
      activeChainCount: 1,
      entitlementId: chain.entitlementId,
      requestId: chain.requestId,
      issuedLinkId: chain.issuedLinkId,
      validUntil: chain.validUntil
    });
  }

  // This is deliberately a narrower, separate read boundary than the
  // checkout resolver above. It never returns entitlement, request, issued
  // link, runtime, transition, access-grant, or subscription material.
  function readWalletFirstCurrentResourceProjection(input) {
    exactObject(input, {
      allowed: ["accountId"],
      name: "walletFirstCurrentResourceProjection"
    });
    const accountId = safeControlRef(input.accountId, "accountId");
    // Classify the account model before entering the resource-chain recovery
    // boundary. A legacy or malformed account must not be mislabeled as a
    // wallet-first reconciliation state merely because it has no matching
    // chain; callers will fail closed instead.
    const account = walletFirstResourceEffectAccountRecord(accountId);
    try {
      const chain = walletFirstResourceEffectExactChain(account.id);
      if (!chain) {
        return Object.freeze({ state: "none" });
      }
      // The shape-only chain is not enough for a Portal claim. Re-read it
      // through the durable prepared/runtime/effect receipt proof so a
      // partial, stale, or divergent chain becomes reconciliation-required.
      const verified = walletFirstResourceEffectCurrentPreparedTransition(account.id);
      const verifiedChain = verified.chain;
      const planId = WALLET_FIRST_RESOURCE_EFFECT_PUBLIC_PLAN_IDS[
        verifiedChain.offerVersionRef
      ];
      if (!planId) {
        throw platformError("validation_error", "wallet-first public plan is invalid");
      }
      return Object.freeze({
        state: "available",
        plan: Object.freeze({
          id: planId,
          durationDays: verifiedChain.durationDays,
          monthlyTrafficGb: verifiedChain.monthlyTrafficGb
        }),
        validUntil: verifiedChain.validUntil,
        // There is intentionally no setup/reveal endpoint in this source
        // slice. The read projection must not advertise hidden delivery.
        setupAvailable: false
      });
    } catch (error) {
      if (error?.code === "validation_error" || error?.code === "not_found") {
        return Object.freeze({ state: "reconciliation_required" });
      }
      throw error;
    }
  }

  // One read snapshot joins the verified current resource to its own cycle.
  // The public resourceRef is a correlation key, never an access credential.
  function readWalletFirstCurrentResourceOverview(input) {
    exactObject(input, { allowed: ["accountId", "now"], name: "walletFirstCurrentResourceOverview" });
    const accountId = safeControlRef(input.accountId, "accountId");
    const now = isoText(input.now, "now");
    return db.transaction(() => {
      const resource = readWalletFirstCurrentResourceProjection({ accountId });
      if (resource.state !== "available") return resource;
      const { chain, prepared } = walletFirstResourceEffectCurrentPreparedTransition(accountId);
      const entitlement = getEntitlement(chain.entitlementId);
      const cycle = usageCycleForBinding(entitlement, now);
      if (!cycle) throw platformError("validation_error", "current resource cycle is invalid");
      const samples = listUsageSamples({
        accountId, entitlementId: chain.entitlementId, requestId: chain.requestId,
        observedFrom: cycle.startedAt,
        observedTo: new Date(Math.min(Date.parse(cycle.endedAt), Date.parse(now) + 1)).toISOString()
      });
      const summary = summarizeUsageSamples(samples);
      const totalBytes = entitlement.trafficLimitBytes;
      const usedBytes = samples.length ? summary.totalBytes : null;
      const collectionStatus = !samples.length ? "pending"
        : Date.parse(now) - Date.parse(summary.lastObservedAt) > 300_000 ? "stale"
          : usedBytes === 0 ? "measured_zero" : "measured";
      return Object.freeze({
        ...resource,
        resourceRef: `resource_${createHash("sha256").update(JSON.stringify([accountId, chain.requestId, prepared.transitionRef])).digest("hex")}`,
        usage: Object.freeze({
          totalBytes, usedBytes,
          remainingBytes: usedBytes === null ? null : Math.max(0, totalBytes - usedBytes),
          collectionStatus, updatedAt: summary.lastObservedAt,
          cycleStartedAt: cycle.startedAt, cycleEndsAt: cycle.endedAt
        })
      });
    })();
  }

  // Read-only compatibility projection for accounts that still use the
  // original issued-link/access-request path.  This intentionally shares the
  // entitlement resolver and usage cycle with the wallet-first projection, but
  // never enters the deferred-resource tables or performs a write.
  function readLegacyPortalCurrentResourceBindingRecord(input) {
    exactObject(input, {
      allowed: ["accountId", "now"],
      name: "legacyPortalCurrentResourceBinding"
    });
    const accountId = safeControlRef(input.accountId, "accountId");
    const now = isoText(input.now, "now");
    const account = getAccount(accountId);
    if (!account || account.status !== "active") return Object.freeze({ state: "none" });

    const entitlement = resolveAccountServiceEntitlement({ accountId, now });
    if (!entitlement) {
      const current = listEntitlements({ accountId, status: "active" })
        .filter((candidate) => !isLifetimeDataPackBinding(candidate)
          && candidate.validFrom <= now && candidate.validUntil > now);
      return Object.freeze({ state: current.length === 0 ? "none" : "reconciliation_required" });
    }
    if (!(entitlement.validFrom <= now && entitlement.validUntil > now)) {
      return Object.freeze({ state: "none" });
    }

    const bindings = listIssuedSubscriptionBindings({ accountId }).filter((binding) => (
      binding.accountId === accountId
      && binding.entitlementId === entitlement.id
      && binding.status === "active"
      && binding.requestStatus === "issued"
      && binding.entitlementStatus === "active"
      && binding.plan === entitlement.plan
      && binding.validFrom === entitlement.validFrom
      && binding.validUntil === entitlement.validUntil
      && binding.trafficLimitBytes === entitlement.trafficLimitBytes
    ));
    if (bindings.length !== 1) return Object.freeze({ state: "reconciliation_required" });
    const [binding] = bindings;
    const request = getPortalAccessRequest(binding.requestId);
    if (!request
      || request.id !== binding.requestId
      || request.portalUserRef !== accountId
      || request.entitlementRef !== entitlement.id
      || request.validUntil !== entitlement.validUntil
      || !["issued", "delivered"].includes(request.status)
      || !Number.isSafeInteger(request.durationDays)
      || request.durationDays < 1
      || !request.tenantId || !request.artifactId
      || binding.tenantRef !== `tenantref_${sha256(request.tenantId).slice(0, 16)}`
    ) return Object.freeze({ state: "reconciliation_required" });

    const tenantBindings = listIssuedSubscriptionBindings({ tenantRef: binding.tenantRef });
    if (tenantBindings.length !== 1
      || tenantBindings[0].id !== binding.id
      || tenantBindings[0].accountId !== accountId
      || tenantBindings[0].entitlementId !== entitlement.id
      || tenantBindings[0].requestId !== request.id
    ) return Object.freeze({ state: "reconciliation_required" });

    // Before PR #419, Portal refresh rotated the runtime artifact and updated
    // the request while the issued link retained its original artifact hash.
    // Only this mismatch may proceed to a separate read-only runtime proof.
    // This marker stays outside the public resource DTO.
    const artifactLineageNeeded = binding.artifactRef === `artifactref_${sha256(request.artifactId).slice(0, 16)}`
      ? undefined
      : Object.freeze({
        tenantId: request.tenantId,
        currentArtifactId: request.artifactId,
        issuedArtifactRef: binding.artifactRef
      });

    const monthlyTrafficGb = Number(entitlement.trafficLimitBytes) / (1024 ** 3);
    if (!Number.isSafeInteger(entitlement.trafficLimitBytes) || entitlement.trafficLimitBytes < 0) {
      return Object.freeze({ state: "reconciliation_required" });
    }
    const resourceRef = `resource_${createHash("sha256")
      .update(JSON.stringify([accountId, entitlement.id, binding.requestId, binding.id, request.artifactId]))
      .digest("hex")}`;
    return Object.freeze({
      state: "available",
      accountId,
      entitlement,
      binding,
      request,
      resourceRef,
      ...(artifactLineageNeeded ? { artifactLineageNeeded } : {}),
      plan: Object.freeze({
        id: entitlement.plan,
        durationDays: request.durationDays,
        monthlyTrafficGb
      })
    });
  }

  function readLegacyPortalCurrentResourceBinding(input) {
    const record = readLegacyPortalCurrentResourceBindingRecord(input);
    if (record.state !== "available") return record;
    return Object.freeze({
      state: "available",
      requestRef: record.request.id,
      resourceRef: record.resourceRef,
      tenantId: record.request.tenantId,
      artifactId: record.request.artifactId,
      ...(record.artifactLineageNeeded ? { artifactLineageNeeded: record.artifactLineageNeeded } : {})
    });
  }

  function readLegacyPortalCurrentResource(input) {
    exactObject(input, {
      allowed: ["accountId", "now"],
      name: "legacyPortalCurrentResource"
    });
    const accountId = safeControlRef(input.accountId, "accountId");
    const now = isoText(input.now, "now");
    const account = getAccount(accountId);
    const commercialModel = account?.metadata?.commercialModel;
    const model = commercialModel === WALLET_FIRST_RESOURCE_EFFECT_COMMERCIAL_MODEL
      ? "wallet_first"
      : commercialModel === undefined || commercialModel === "legacy_v1"
        ? "legacy"
        : null;
    if (!model) throw platformError("validation_error", "account commercial model is invalid");
    if (model === "wallet_first") return Object.freeze({ model: "wallet_first" });
    return db.transaction(() => {
      const binding = readLegacyPortalCurrentResourceBindingRecord({ accountId, now });
      if (binding.state === "none" || binding.state === "reconciliation_required") {
        return Object.freeze({ model: "legacy", resource: binding, requestRef: null });
      }
      const { entitlement, request, plan, resourceRef } = binding;
      const cycle = usageCycleForBinding(entitlement, now);
      if (!cycle) return Object.freeze({ model: "legacy", resource: { state: "reconciliation_required" }, requestRef: null });
      const samples = listUsageSamples({
        accountId, entitlementId: entitlement.id, requestId: request.id,
        observedFrom: cycle.startedAt,
        observedTo: new Date(Math.min(Date.parse(cycle.endedAt), Date.parse(now) + 1)).toISOString()
      });
      const summary = summarizeUsageSamples(samples);
      const totalBytes = entitlement.trafficLimitBytes;
      const usedBytes = samples.length ? summary.totalBytes : null;
      const collectionStatus = !samples.length ? "pending"
        : Date.parse(now) - Date.parse(summary.lastObservedAt) > 300_000 ? "stale"
          : usedBytes === 0 ? "measured_zero" : "measured";
      const resource = Object.freeze({
        state: "available",
        plan,
        validUntil: entitlement.validUntil,
        setupAvailable: Boolean(request.subscriptionUrl),
        resourceRef,
        usage: Object.freeze({
          totalBytes,
          usedBytes,
          // Zero is the legacy unset/no-enforced-quota sentinel, not proof of
          // an exhausted or commercially unlimited plan. Preserve measured use.
          remainingBytes: usedBytes === null || totalBytes === 0 ? null : Math.max(0, totalBytes - usedBytes),
          collectionStatus,
          updatedAt: summary.lastObservedAt,
          cycleStartedAt: cycle.startedAt,
          cycleEndsAt: cycle.endedAt
        })
      });
      return Object.freeze({
        model: "legacy", resource, requestRef: request.id,
        ...(binding.artifactLineageNeeded ? { artifactLineageNeeded: binding.artifactLineageNeeded } : {})
      });
    })();
  }

  function getWalletFirstTransitionEffectForDeferredTransition(input) {
    exactObject(input, {
      allowed: ["transitionRef"],
      name: "walletFirstTransitionEffectLookup"
    });
    const transitionRef = safeControlRef(input.transitionRef, "transitionRef");
    const audit = getAuditEvent(walletFirstResourceEffectReceiptRef(transitionRef));
    if (!audit) return null;
    const receipt = walletFirstResourceEffectReceiptFromAudit(audit);
    const prepared = walletFirstResourceEffectExistingPreparation(transitionRef);
    const runtimeReceipt = getWalletFirstRuntimeReceiptForDeferredTransition({ transitionRef });
    if (!prepared || !runtimeReceipt || receipt.transitionRef !== transitionRef) {
      throw platformError("validation_error", "wallet-first effect receipt transition mismatch");
    }
    walletFirstResourceEffectAssertReceiptMatchesPreparation(prepared, runtimeReceipt, receipt);
    walletFirstResourceEffectCurrentPreparedTransition(prepared.accountId);
    return walletFirstResourceEffectOutput(receipt);
  }

  function walletFirstResourceEffectPreparationInput(input, flowKind) {
    const fields = flowKind === "initial_activation"
      ? ["transitionRef", "accountId", "offer", "scheduledFor", "activationAt", "nodeId", "now"]
      : ["transitionRef", "accountId", "offer", "scheduledFor", "activationAt", "expectedChain", "nodeId", "now"];
    exactObject(input, {
      allowed: fields,
      name: "walletFirstResourceEffectPreparation"
    });
    const transitionRef = safeControlRef(input.transitionRef, "transitionRef");
    const accountId = safeControlRef(input.accountId, "accountId");
    const offer = walletFirstResourceEffectOffer(input.offer);
    const scheduledFor = isoText(input.scheduledFor, "scheduledFor");
    const activationAt = isoText(input.activationAt, "activationAt");
    const expectedChain = flowKind === "scheduled_switch"
      ? walletFirstResourceEffectExpectedChain(input.expectedChain)
      : null;
    if (
      (flowKind === "initial_activation" && scheduledFor > activationAt)
      || (flowKind === "scheduled_switch" && scheduledFor !== expectedChain.validUntil)
    ) {
      throw platformError("validation_error", "wallet-first resource-effect schedule is invalid");
    }
    const successor = flowKind === "initial_activation"
      ? Object.freeze({
        entitlementId: walletFirstResourceEffectSuccessorRef("wfxent", transitionRef),
        requestId: walletFirstResourceEffectSuccessorRef("wfxreq", transitionRef),
        issuedLinkId: walletFirstResourceEffectSuccessorRef("wfxlink", transitionRef),
        validUntil: walletFirstResourceEffectTargetValidUntil(activationAt, offer.durationDays)
      })
      : Object.freeze({
        entitlementId: expectedChain.entitlementId,
        requestId: expectedChain.requestId,
        issuedLinkId: expectedChain.issuedLinkId,
        validUntil: walletFirstResourceEffectTargetValidUntil(activationAt, offer.durationDays)
      });
    return Object.freeze({
      transitionRef,
      accountId,
      flowKind,
      offer,
      scheduledFor,
      activationAt,
      validUntil: walletFirstResourceEffectTargetValidUntil(activationAt, offer.durationDays),
      effectRef: walletFirstResourceEffectReceiptRef(transitionRef),
      successor,
      nodeId: safeControlRef(input.nodeId, "nodeId"),
      accountDigest: walletFirstResourceEffectAccountDigest(accountId),
      expectedChain,
      currentChain: null,
      now: isoText(input.now, "now")
    });
  }

  function walletFirstResourceEffectExistingPreparation(transitionRef) {
    const audit = getAuditEvent(walletFirstResourceEffectPreparationRef(transitionRef));
    if (!audit) return null;
    const prepared = walletFirstResourceEffectPreparedFromAudit(audit);
    if (prepared.transitionRef !== transitionRef) {
      throw platformError("validation_error", "wallet-first preparation transition mismatch");
    }
    return prepared;
  }

  function persistWalletFirstResourceEffectPreparation(input) {
    const existing = walletFirstResourceEffectExistingPreparation(input.transitionRef);
    if (existing) {
      if (!walletFirstResourceEffectSamePreparationIntent(existing, input)) {
        throw platformError("validation_error", "wallet-first preparation idempotency conflict");
      }
      return walletFirstResourceEffectPreparedOutput(existing);
    }
    const account = walletFirstResourceEffectAccountRecord(input.accountId);
    const currentChain = walletFirstResourceEffectExactChain(account.id);
    if (
      (input.flowKind === "initial_activation" && currentChain !== null)
      || (
        input.flowKind === "scheduled_switch"
        && (
          !currentChain
          || currentChain.entitlementId !== input.expectedChain.entitlementId
          || currentChain.requestId !== input.expectedChain.requestId
          || currentChain.issuedLinkId !== input.expectedChain.issuedLinkId
          || currentChain.validUntil !== input.expectedChain.validUntil
          || currentChain.nodeId !== input.nodeId
        )
      )
    ) {
      throw platformError("validation_error", "wallet-first resource chain changed before preparation");
    }
    const prepared = Object.freeze({
      ...input,
      currentChain: input.flowKind === "scheduled_switch"
        ? Object.freeze({
          tenantRef: currentChain.tenantRef,
          artifactRef: currentChain.artifactRef,
          initialTransitionRef: currentChain.metadata.initialTransitionRef
        })
        : null
    });
    const metadata = walletFirstResourceEffectPreparedMetadata(prepared);
    try {
      recordAuditEvent({
        id: walletFirstResourceEffectPreparationRef(prepared.transitionRef),
        entityType: WALLET_FIRST_RESOURCE_EFFECT_AUDIT_ENTITY_TYPE,
        entityRef: prepared.transitionRef,
        action: "resource_effect_prepared",
        actorRef: WALLET_FIRST_RESOURCE_EFFECT_ACTOR_REF,
        createdAt: prepared.now,
        metadata
      });
    } catch (error) {
      const raced = walletFirstResourceEffectExistingPreparation(prepared.transitionRef);
      if (!raced || !walletFirstResourceEffectSamePreparationIntent(raced, prepared)) {
        throw error;
      }
      return walletFirstResourceEffectPreparedOutput(raced);
    }
    return walletFirstResourceEffectPreparedOutput(prepared);
  }

  function prepareWalletFirstInitialActivationForDeferredTransition(input) {
    return persistWalletFirstResourceEffectPreparation(
      walletFirstResourceEffectPreparationInput(input, "initial_activation")
    );
  }

  function prepareWalletFirstScheduledSwitchForDeferredTransition(input) {
    return persistWalletFirstResourceEffectPreparation(
      walletFirstResourceEffectPreparationInput(input, "scheduled_switch")
    );
  }

  function walletFirstResourceEffectRuntimeMetadata(input) {
    return Object.freeze({
      version: WALLET_FIRST_RESOURCE_EFFECT_VERSION,
      transitionRef: input.transitionRef,
      effectRef: input.effectRef,
      flowKind: input.flowKind,
      entitlementId: input.successor.entitlementId,
      requestId: input.successor.requestId,
      issuedLinkId: input.successor.issuedLinkId,
      validUntil: input.successor.validUntil,
      tenantId: input.tenantId,
      artifactId: input.artifactId,
      tenantRef: input.tenantRef,
      artifactRef: input.artifactRef,
      nodeId: input.nodeId,
      initialTransitionRef: input.initialTransitionRef,
      runtimeReceiptRef: input.runtimeReceiptRef
    });
  }

  function walletFirstResourceEffectReceiptMetadata(input) {
    return Object.freeze({
      version: WALLET_FIRST_RESOURCE_EFFECT_VERSION,
      transitionRef: input.transitionRef,
      effectRef: input.effectRef,
      flowKind: input.flowKind,
      accountId: input.accountId,
      entitlementId: input.successor.entitlementId,
      requestId: input.successor.requestId,
      issuedLinkId: input.successor.issuedLinkId,
      validUntil: input.successor.validUntil,
      runtimeReceiptRef: input.runtimeReceiptRef
    });
  }

  function walletFirstResourceEffectRuntimeReceiptOutput(receipt) {
    return Object.freeze({
      transitionRef: receipt.transitionRef,
      runtimeReceiptRef: receipt.runtimeReceiptRef
    });
  }

  function walletFirstResourceEffectOutput(receipt) {
    return Object.freeze({
      status: "applied",
      effectRef: receipt.effectRef,
      nextEntitlementId: receipt.successor.entitlementId,
      nextRequestId: receipt.successor.requestId,
      nextIssuedLinkId: receipt.successor.issuedLinkId,
      nextValidUntil: receipt.successor.validUntil
    });
  }

  function walletFirstResourceEffectAssertRuntimeReceiptMatchesPreparation(prepared, receipt) {
    if (
      receipt.transitionRef !== prepared.transitionRef
      || receipt.effectRef !== prepared.effectRef
      || receipt.flowKind !== prepared.flowKind
      || receipt.successor.entitlementId !== prepared.successor.entitlementId
      || receipt.successor.requestId !== prepared.successor.requestId
      || receipt.successor.issuedLinkId !== prepared.successor.issuedLinkId
      || receipt.successor.validUntil !== prepared.successor.validUntil
      || receipt.nodeId !== prepared.nodeId
      || receipt.initialTransitionRef !== (
        prepared.flowKind === "initial_activation"
          ? prepared.transitionRef
          : prepared.currentChain.initialTransitionRef
      )
      || receipt.runtimeReceiptRef !== walletFirstResourceEffectRuntimeReceiptRef(prepared.transitionRef)
      || receipt.tenantRef !== walletFirstResourceEffectBindingRef("tenant", receipt.tenantId)
      || receipt.artifactRef !== walletFirstResourceEffectBindingRef("artifact", receipt.artifactId)
    ) {
      throw platformError("validation_error", "wallet-first runtime receipt does not match preparation");
    }
  }

  function walletFirstResourceEffectAssertReceiptMatchesPreparation(prepared, runtimeReceipt, receipt) {
    if (
      receipt.transitionRef !== prepared.transitionRef
      || receipt.accountId !== prepared.accountId
      || receipt.flowKind !== prepared.flowKind
      || receipt.effectRef !== prepared.effectRef
      || receipt.successor.entitlementId !== prepared.successor.entitlementId
      || receipt.successor.requestId !== prepared.successor.requestId
      || receipt.successor.issuedLinkId !== prepared.successor.issuedLinkId
      || receipt.successor.validUntil !== prepared.successor.validUntil
      || receipt.runtimeReceiptRef !== runtimeReceipt.runtimeReceiptRef
    ) {
      throw platformError("validation_error", "wallet-first effect receipt does not match preparation");
    }
    walletFirstResourceEffectAssertRuntimeReceiptMatchesPreparation(prepared, runtimeReceipt);
  }

  function walletFirstResourceEffectChainMatchesPreparation(chain, prepared, runtimeReceipt) {
    return Boolean(
      chain
      && chain.entitlementId === prepared.successor.entitlementId
      && chain.requestId === prepared.successor.requestId
      && chain.issuedLinkId === prepared.successor.issuedLinkId
      && chain.validFrom === prepared.activationAt
      && chain.validUntil === prepared.successor.validUntil
      && chain.offerVersionRef === prepared.offer.offerVersionRef
      && chain.monthlyTrafficGb === prepared.offer.monthlyTrafficGb
      && chain.portalPlan === prepared.offer.portalPlan
      && chain.durationDays === prepared.offer.durationDays
      && chain.nodeId === prepared.nodeId
      && chain.tenantId === runtimeReceipt.tenantId
      && chain.artifactId === runtimeReceipt.artifactId
      && chain.tenantRef === runtimeReceipt.tenantRef
      && chain.artifactRef === runtimeReceipt.artifactRef
      && chain.accessGrantRef === prepared.effectRef
      && chain.metadata.lastTransitionRef === prepared.transitionRef
      && (
        prepared.flowKind !== "initial_activation"
        || chain.metadata.initialTransitionRef === prepared.transitionRef
      )
    );
  }

  function walletFirstResourceEffectCurrentPreparedTransition(accountId) {
    const account = walletFirstResourceEffectAccountRecord(accountId);
    const chain = walletFirstResourceEffectExactChain(account.id);
    if (!chain) {
      throw platformError("validation_error", "wallet-first current resource chain is missing");
    }
    const prepared = walletFirstResourceEffectExistingPreparation(
      chain.metadata.lastTransitionRef
    );
    const runtimeAudit = getAuditEvent(
      walletFirstResourceEffectRuntimeReceiptRef(chain.metadata.lastTransitionRef)
    );
    const effectAudit = getAuditEvent(
      walletFirstResourceEffectReceiptRef(chain.metadata.lastTransitionRef)
    );
    if (!prepared || !runtimeAudit || !effectAudit) {
      throw platformError("validation_error", "wallet-first current resource chain receipt is missing");
    }
    const runtimeReceipt = walletFirstResourceEffectRuntimeReceiptFromAudit(runtimeAudit);
    const effectReceipt = walletFirstResourceEffectReceiptFromAudit(effectAudit);
    walletFirstResourceEffectAssertRuntimeReceiptMatchesPreparation(prepared, runtimeReceipt);
    walletFirstResourceEffectAssertReceiptMatchesPreparation(
      prepared,
      runtimeReceipt,
      effectReceipt
    );
    if (!walletFirstResourceEffectChainMatchesPreparation(chain, prepared, runtimeReceipt)) {
      throw platformError("validation_error", "wallet-first current resource chain drifted");
    }
    return Object.freeze({ chain, prepared, runtimeReceipt, effectReceipt });
  }

  function getWalletFirstRuntimeReceiptForDeferredTransition(input) {
    exactObject(input, {
      allowed: ["transitionRef"],
      name: "walletFirstRuntimeReceiptLookup"
    });
    const transitionRef = safeControlRef(input.transitionRef, "transitionRef");
    const audit = getAuditEvent(walletFirstResourceEffectRuntimeReceiptRef(transitionRef));
    if (!audit) return null;
    const receipt = walletFirstResourceEffectRuntimeReceiptFromAudit(audit);
    const prepared = walletFirstResourceEffectExistingPreparation(transitionRef);
    if (!prepared || receipt.transitionRef !== transitionRef) {
      throw platformError("validation_error", "wallet-first runtime receipt transition mismatch");
    }
    walletFirstResourceEffectAssertRuntimeReceiptMatchesPreparation(prepared, receipt);
    return receipt;
  }

  // A historical transition receipt may remain valid after a later, in-place
  // scheduled renewal.  This is intentionally not a loose "expiry is later"
  // check: the current exact control chain must still be a descendant of the
  // same initial marker and must bind the very same runtime tenant/artifact.
  // The runtime adapter consumes this narrow proof before accepting a replay.
  function verifyWalletFirstRuntimeTransitionForDeferredTransition(input) {
    exactObject(input, {
      allowed: ["transitionRef", "effectRef", "successor"],
      name: "walletFirstRuntimeVerification"
    });
    const transitionRef = safeControlRef(input.transitionRef, "transitionRef");
    const effectRef = safeControlRef(input.effectRef, "effectRef");
    const successor = walletFirstResourceEffectExpectedChain(input.successor);
    const prepared = walletFirstResourceEffectExistingPreparation(transitionRef);
    const runtimeReceipt = getWalletFirstRuntimeReceiptForDeferredTransition({ transitionRef });
    const effectAudit = getAuditEvent(walletFirstResourceEffectReceiptRef(transitionRef));
    if (!prepared || !runtimeReceipt || !effectAudit) {
      throw platformError("validation_error", "wallet-first runtime verification dependencies are missing");
    }
    const effectReceipt = walletFirstResourceEffectReceiptFromAudit(effectAudit);
    walletFirstResourceEffectAssertReceiptMatchesPreparation(
      prepared,
      runtimeReceipt,
      effectReceipt
    );
    if (
      effectRef !== effectReceipt.effectRef
      || successor.entitlementId !== effectReceipt.successor.entitlementId
      || successor.requestId !== effectReceipt.successor.requestId
      || successor.issuedLinkId !== effectReceipt.successor.issuedLinkId
      || successor.validUntil !== effectReceipt.successor.validUntil
    ) {
      throw platformError("validation_error", "wallet-first runtime verification receipt mismatch");
    }
    const current = walletFirstResourceEffectCurrentPreparedTransition(prepared.accountId);
    if (
      current.chain.metadata.initialTransitionRef !== runtimeReceipt.initialTransitionRef
      || current.runtimeReceipt.tenantRef !== runtimeReceipt.tenantRef
      || current.runtimeReceipt.artifactRef !== runtimeReceipt.artifactRef
      || current.runtimeReceipt.nodeId !== runtimeReceipt.nodeId
      || current.runtimeReceipt.initialTransitionRef !== runtimeReceipt.initialTransitionRef
    ) {
      throw platformError("validation_error", "wallet-first runtime verification chain drifted");
    }
    return Object.freeze({
      transitionRef,
      effectRef,
      tenantRef: runtimeReceipt.tenantRef,
      artifactRef: runtimeReceipt.artifactRef,
      nodeId: runtimeReceipt.nodeId,
      initialTransitionRef: runtimeReceipt.initialTransitionRef,
      validUntil: current.chain.validUntil
    });
  }

  function walletFirstResourceEffectRequireRuntimeClaimSchema() {
    const table = db.prepare(`
      select name from sqlite_master
       where type = 'table' and name = ?
    `).get(WALLET_FIRST_RESOURCE_EFFECT_RUNTIME_CLAIMS_TABLE);
    if (!table) {
      throw platformError(
        "validation_error",
        "wallet-first runtime claim schema is not ready"
      );
    }
  }

  function walletFirstResourceEffectClaimRow(row) {
    if (!row) return null;
    const status = requiredText(row.status, "runtimeClaim.status");
    if (!["claimed", "recorded", "reconciliation_required"].includes(status)) {
      throw platformError("validation_error", "wallet-first runtime claim status is invalid");
    }
    const claim = {
      transitionRef: safeControlRef(row.transition_ref, "runtimeClaim.transitionRef"),
      effectRef: safeControlRef(row.effect_ref, "runtimeClaim.effectRef"),
      flowKind: requiredText(row.flow_kind, "runtimeClaim.flowKind"),
      successor: Object.freeze({
        entitlementId: safeControlRef(row.entitlement_id, "runtimeClaim.entitlementId"),
        requestId: safeControlRef(row.request_id, "runtimeClaim.requestId"),
        issuedLinkId: safeControlRef(row.issued_link_id, "runtimeClaim.issuedLinkId"),
        validUntil: isoText(row.valid_until, "runtimeClaim.validUntil")
      }),
      nodeId: safeControlRef(row.node_id, "runtimeClaim.nodeId"),
      status,
      leaseGeneration: integer(row.lease_generation, "runtimeClaim.leaseGeneration", { min: 0 }),
      leaseToken: row.lease_token === null ? null : requiredText(row.lease_token, "runtimeClaim.leaseToken"),
      leaseUntil: row.lease_until === null ? null : isoText(row.lease_until, "runtimeClaim.leaseUntil"),
      safeCode: row.safe_code === null ? null : safeControlRef(row.safe_code, "runtimeClaim.safeCode"),
      recordedAt: row.recorded_at === null ? null : isoText(row.recorded_at, "runtimeClaim.recordedAt")
    };
    if (
      !["initial_activation", "scheduled_switch"].includes(claim.flowKind)
      || (claim.status === "claimed" && (
        claim.leaseGeneration < 1
        || !WALLET_FIRST_RESOURCE_EFFECT_RUNTIME_LEASE_TOKEN_PATTERN.test(claim.leaseToken || "")
        || claim.leaseUntil === null
        || claim.safeCode !== null
        || claim.recordedAt !== null
      ))
      || (claim.status === "recorded" && (
        claim.leaseToken !== null || claim.leaseUntil !== null
        || claim.safeCode !== null || claim.recordedAt === null
      ))
      || (claim.status === "reconciliation_required" && (
        claim.leaseToken !== null || claim.leaseUntil !== null
        || claim.safeCode === null || claim.recordedAt !== null
      ))
    ) {
      throw platformError("validation_error", "wallet-first runtime claim row is invalid");
    }
    return Object.freeze(claim);
  }

  function walletFirstResourceEffectClaimMatchesPreparation(prepared, claim) {
    return (
      claim.transitionRef === prepared.transitionRef
      && claim.effectRef === prepared.effectRef
      && claim.flowKind === prepared.flowKind
      && claim.successor.entitlementId === prepared.successor.entitlementId
      && claim.successor.requestId === prepared.successor.requestId
      && claim.successor.issuedLinkId === prepared.successor.issuedLinkId
      && claim.successor.validUntil === prepared.successor.validUntil
      && claim.nodeId === prepared.nodeId
    );
  }

  function walletFirstResourceEffectClaimInput(input, { leaseRequired = false } = {}) {
    const fields = leaseRequired
      ? [
        "transitionRef", "flowKind", "successor", "nodeId", "now", "leaseGeneration",
        "leaseToken"
      ]
      : ["transitionRef", "flowKind", "successor", "nodeId", "now", "leaseMs"];
    exactObject(input, { allowed: fields, name: "walletFirstRuntimeClaim" });
    const transitionRef = safeControlRef(input.transitionRef, "transitionRef");
    const prepared = walletFirstResourceEffectExistingPreparation(transitionRef);
    if (!prepared) {
      throw platformError("validation_error", "wallet-first runtime claim preparation is missing");
    }
    const claim = {
      transitionRef,
      effectRef: prepared.effectRef,
      flowKind: requiredText(input.flowKind, "flowKind"),
      successor: walletFirstResourceEffectExpectedChain(input.successor),
      nodeId: safeControlRef(input.nodeId, "nodeId"),
      now: isoText(input.now, "now")
    };
    if (!["initial_activation", "scheduled_switch"].includes(claim.flowKind)
      || !walletFirstResourceEffectClaimMatchesPreparation(prepared, claim)) {
      throw platformError("validation_error", "wallet-first runtime claim does not match preparation");
    }
    if (leaseRequired) {
      claim.leaseGeneration = integer(input.leaseGeneration, "leaseGeneration", { min: 1 });
      claim.leaseToken = requiredText(input.leaseToken, "leaseToken");
      if (!WALLET_FIRST_RESOURCE_EFFECT_RUNTIME_LEASE_TOKEN_PATTERN.test(claim.leaseToken)) {
        throw platformError("validation_error", "wallet-first runtime lease token is invalid");
      }
    } else {
      claim.leaseMs = integer(input.leaseMs, "leaseMs", { min: 1 });
      if (claim.leaseMs > MAX_WALLET_FIRST_RESOURCE_EFFECT_RUNTIME_LEASE_MS) {
        throw platformError("validation_error", "wallet-first runtime lease is too long");
      }
    }
    return Object.freeze({ ...claim, prepared });
  }

  function walletFirstResourceEffectClaimLeaseOutput(claim) {
    return Object.freeze({
      status: "claimed",
      leaseGeneration: claim.leaseGeneration,
      leaseToken: claim.leaseToken
    });
  }

  function walletFirstResourceEffectSelectRuntimeClaim(transitionRef) {
    return walletFirstResourceEffectClaimRow(db.prepare(`
      select * from ${WALLET_FIRST_RESOURCE_EFFECT_RUNTIME_CLAIMS_TABLE}
       where transition_ref = ?
    `).get(transitionRef));
  }

  function claimWalletFirstRuntimeEffectForDeferredTransition(input) {
    const requested = walletFirstResourceEffectClaimInput(input);
    return db.transaction(() => {
      walletFirstResourceEffectRequireRuntimeClaimSchema();
      const completed = getWalletFirstRuntimeReceiptForDeferredTransition({
        transitionRef: requested.transitionRef
      });
      const existing = walletFirstResourceEffectSelectRuntimeClaim(requested.transitionRef);
      if (existing && !walletFirstResourceEffectClaimMatchesPreparation(requested.prepared, existing)) {
        throw platformError("validation_error", "wallet-first runtime claim binding drifted");
      }
      if (completed) {
        if (!existing || existing.status !== "recorded") {
          throw platformError("validation_error", "wallet-first runtime receipt claim state is missing");
        }
        return Object.freeze({ status: "completed" });
      }
      if (!existing) {
        const leaseToken = randomBytes(32).toString("hex");
        const leaseUntil = addMillisecondsToIso(requested.now, requested.leaseMs, "leaseMs");
        sqliteRun(db.prepare(`
          insert into ${WALLET_FIRST_RESOURCE_EFFECT_RUNTIME_CLAIMS_TABLE} (
            transition_ref, effect_ref, flow_kind, entitlement_id, request_id,
            issued_link_id, valid_until, node_id, status, lease_generation,
            lease_token, lease_until, safe_code, created_at, updated_at, recorded_at
          ) values (
            @transitionRef, @effectRef, @flowKind, @entitlementId, @requestId,
            @issuedLinkId, @validUntil, @nodeId, 'claimed', 1,
            @leaseToken, @leaseUntil, null, @now, @now, null
          )
        `), {
          transitionRef: requested.transitionRef,
          effectRef: requested.effectRef,
          flowKind: requested.flowKind,
          entitlementId: requested.successor.entitlementId,
          requestId: requested.successor.requestId,
          issuedLinkId: requested.successor.issuedLinkId,
          validUntil: requested.successor.validUntil,
          nodeId: requested.nodeId,
          leaseToken,
          leaseUntil,
          now: requested.now
        });
        return walletFirstResourceEffectClaimLeaseOutput(
          walletFirstResourceEffectSelectRuntimeClaim(requested.transitionRef)
        );
      }
      if (existing.status === "recorded") {
        throw platformError("validation_error", "wallet-first recorded claim has no runtime receipt");
      }
      if (existing.status === "reconciliation_required") {
        return Object.freeze({ status: "reconciliation_required" });
      }
      if (existing.leaseUntil > requested.now) {
        return Object.freeze({ status: "blocked" });
      }
      const nextToken = randomBytes(32).toString("hex");
      const nextUntil = addMillisecondsToIso(requested.now, requested.leaseMs, "leaseMs");
      const taken = db.prepare(`
        update ${WALLET_FIRST_RESOURCE_EFFECT_RUNTIME_CLAIMS_TABLE}
           set lease_generation = lease_generation + 1,
               lease_token = ?,
               lease_until = ?,
               updated_at = ?
         where transition_ref = ?
           and status = 'claimed'
           and lease_generation = ?
           and lease_token = ?
           and lease_until = ?
           and lease_until <= ?
      `).run(
        nextToken,
        nextUntil,
        requested.now,
        requested.transitionRef,
        existing.leaseGeneration,
        existing.leaseToken,
        existing.leaseUntil,
        requested.now
      );
      if (taken.changes !== 1) {
        throw platformError("claim_lost", "wallet-first runtime claim is no longer current");
      }
      return walletFirstResourceEffectClaimLeaseOutput(
        walletFirstResourceEffectSelectRuntimeClaim(requested.transitionRef)
      );
    }).immediate();
  }

  function walletFirstResourceEffectMarkRuntimeClaimReconciliation(input) {
    const requested = walletFirstResourceEffectClaimInput({
      transitionRef: input.transitionRef,
      flowKind: input.flowKind,
      successor: input.successor,
      nodeId: input.nodeId,
      now: input.now,
      leaseGeneration: input.leaseGeneration,
      leaseToken: input.leaseToken
    }, { leaseRequired: true });
    const safeCode = safeControlRef(input.safeCode, "safeCode");
    const updated = db.prepare(`
      update ${WALLET_FIRST_RESOURCE_EFFECT_RUNTIME_CLAIMS_TABLE}
         set status = 'reconciliation_required',
             lease_token = null,
             lease_until = null,
             safe_code = ?,
             updated_at = ?
       where transition_ref = ?
         and status = 'claimed'
         and lease_generation = ?
         and lease_token = ?
         and lease_until >= ?
    `).run(
      safeCode,
      requested.now,
      requested.transitionRef,
      requested.leaseGeneration,
      requested.leaseToken,
      requested.now
    );
    if (updated.changes !== 1) {
      throw platformError("claim_lost", "wallet-first runtime reconciliation claim is no longer current");
    }
    return Object.freeze({ status: "reconciliation_required" });
  }

  function markWalletFirstRuntimeEffectReconciliationRequiredForDeferredTransition(input) {
    exactObject(input, {
      allowed: [
        "transitionRef", "flowKind", "successor", "nodeId", "now", "leaseGeneration",
        "leaseToken", "safeCode"
      ],
      name: "walletFirstRuntimeReconciliation"
    });
    return db.transaction(() => {
      walletFirstResourceEffectRequireRuntimeClaimSchema();
      return walletFirstResourceEffectMarkRuntimeClaimReconciliation(input);
    }).immediate();
  }

  function recordWalletFirstRuntimeReceiptForDeferredTransition(input) {
    exactObject(input, {
      allowed: [
        "transitionRef", "flowKind", "successor", "tenantId", "artifactId", "nodeId", "now",
        "leaseGeneration", "leaseToken"
      ],
      name: "walletFirstRuntimeReceipt"
    });
    const requested = walletFirstResourceEffectClaimInput({
      transitionRef: input.transitionRef,
      flowKind: input.flowKind,
      successor: input.successor,
      nodeId: input.nodeId,
      now: input.now,
      leaseGeneration: input.leaseGeneration,
      leaseToken: input.leaseToken
    }, { leaseRequired: true });
    const record = Object.freeze({
      transitionRef: requested.transitionRef,
      effectRef: requested.effectRef,
      flowKind: requested.flowKind,
      successor: requested.successor,
      tenantId: walletFirstResourceEffectSafeRuntimeId(input.tenantId, "tenantId"),
      artifactId: walletFirstResourceEffectSafeRuntimeId(input.artifactId, "artifactId"),
      tenantRef: walletFirstResourceEffectBindingRef("tenant", input.tenantId),
      artifactRef: walletFirstResourceEffectBindingRef("artifact", input.artifactId),
      nodeId: requested.nodeId,
      initialTransitionRef: requested.prepared.flowKind === "initial_activation"
        ? requested.prepared.transitionRef
        : requested.prepared.currentChain.initialTransitionRef,
      runtimeReceiptRef: walletFirstResourceEffectRuntimeReceiptRef(requested.transitionRef),
      now: requested.now
    });
    walletFirstResourceEffectAssertRuntimeReceiptMatchesPreparation(requested.prepared, record);
    return db.transaction(() => {
      walletFirstResourceEffectRequireRuntimeClaimSchema();
      const existingClaim = walletFirstResourceEffectSelectRuntimeClaim(record.transitionRef);
      if (!existingClaim || !walletFirstResourceEffectClaimMatchesPreparation(requested.prepared, existingClaim)) {
        throw platformError("validation_error", "wallet-first runtime receipt claim binding is missing");
      }
      const existing = getWalletFirstRuntimeReceiptForDeferredTransition({
        transitionRef: record.transitionRef
      });
      if (existing) {
        if (
          existingClaim.status !== "recorded"
          || !walletFirstResourceEffectSameRuntimeReceipt(existing, record)
        ) {
          throw platformError("validation_error", "wallet-first runtime receipt idempotency conflict");
        }
        return walletFirstResourceEffectRuntimeReceiptOutput(existing);
      }
      if (
        existingClaim.status !== "claimed"
        || existingClaim.leaseGeneration !== requested.leaseGeneration
        || existingClaim.leaseToken !== requested.leaseToken
        || existingClaim.leaseUntil < requested.now
      ) {
        throw platformError("claim_lost", "wallet-first runtime receipt lease is no longer current");
      }
      recordAuditEvent({
        id: record.runtimeReceiptRef,
        entityType: WALLET_FIRST_RESOURCE_EFFECT_AUDIT_ENTITY_TYPE,
        entityRef: record.transitionRef,
        action: "resource_runtime_applied",
        actorRef: WALLET_FIRST_RESOURCE_EFFECT_ACTOR_REF,
        createdAt: record.now,
        metadata: walletFirstResourceEffectRuntimeMetadata(record)
      });
      const recorded = db.prepare(`
        update ${WALLET_FIRST_RESOURCE_EFFECT_RUNTIME_CLAIMS_TABLE}
           set status = 'recorded',
               lease_token = null,
               lease_until = null,
               safe_code = null,
               recorded_at = ?,
               updated_at = ?
         where transition_ref = ?
           and status = 'claimed'
           and lease_generation = ?
           and lease_token = ?
           and lease_until >= ?
      `).run(
        record.now,
        record.now,
        record.transitionRef,
        requested.leaseGeneration,
        requested.leaseToken,
        record.now
      );
      if (recorded.changes !== 1) {
        throw platformError("claim_lost", "wallet-first runtime receipt completion lost its lease");
      }
      return walletFirstResourceEffectRuntimeReceiptOutput(record);
    }).immediate();
  }

  function walletFirstResourceEffectInsertInitialChain(prepared, runtimeReceipt, now) {
    const requestMetadata = Object.freeze({
      commercialModel: WALLET_FIRST_RESOURCE_EFFECT_COMMERCIAL_MODEL,
      resourceModel: WALLET_FIRST_RESOURCE_CHAIN_MODEL,
      resourceModelVersion: WALLET_FIRST_RESOURCE_EFFECT_VERSION,
      initialTransitionRef: prepared.transitionRef,
      lastTransitionRef: prepared.transitionRef
    });
    const trafficLimitBytes = prepared.offer.monthlyTrafficGb * (1024 ** 3);
    sqliteRun(db.prepare(`
      insert into platform_entitlements (
        id, account_id, plan, status, valid_from, valid_until,
        max_artifacts, max_devices, traffic_limit_bytes, created_at, updated_at
      ) values (
        @id, @accountId, @plan, 'active', @validFrom, @validUntil,
        1, 1, @trafficLimitBytes, @now, @now
      )
    `), {
      id: prepared.successor.entitlementId,
      accountId: prepared.accountId,
      plan: prepared.offer.offerVersionRef,
      validFrom: prepared.activationAt,
      validUntil: prepared.successor.validUntil,
      trafficLimitBytes,
      now
    });
    sqliteRun(db.prepare(`
      insert into platform_issuance_requests (
        id, account_id, entitlement_id, approval_ref, status, quantity, node_id,
        purpose, requested_by_ref, created_at, updated_at, metadata_json
      ) values (
        @id, @accountId, @entitlementId, @approvalRef, 'issued', 1, @nodeId,
        'wallet_first_deferred_transition', @requestedByRef, @now, @now, @metadataJson
      )
    `), {
      id: prepared.successor.requestId,
      accountId: prepared.accountId,
      entitlementId: prepared.successor.entitlementId,
      approvalRef: walletFirstResourceEffectSuccessorRef("wfxapproval", prepared.transitionRef),
      nodeId: prepared.nodeId,
      requestedByRef: WALLET_FIRST_RESOURCE_EFFECT_ACTOR_REF,
      now,
      metadataJson: issuanceMetadataJson(requestMetadata)
    });
    sqliteRun(db.prepare(`
      insert into platform_issued_subscription_links (
        id, request_id, tenant_ref, artifact_ref, status, created_at, updated_at
      ) values (
        @id, @requestId, @tenantRef, @artifactRef, 'active', @now, @now
      )
    `), {
      id: prepared.successor.issuedLinkId,
      requestId: prepared.successor.requestId,
      tenantRef: runtimeReceipt.tenantRef,
      artifactRef: runtimeReceipt.artifactRef,
      now
    });
    sqliteRun(db.prepare(`
      insert into platform_portal_access_requests (
        id, portal_user_ref, plan, client_target, duration_days, quantity,
        status, next_action, note_provided, prior_trial_state, submitted_at,
        updated_at, reviewed_at, reviewed_by_ref, safe_reason_code, expires_at,
        valid_until, entitlement_ref, access_grant_ref, tenant_id, artifact_id,
        subscription_url, edge_channel_ref, edge_credential_ref,
        edge_material_digest, edge_lifecycle_mutation, event_json
      ) values (
        @id, @portalUserRef, @plan, 'clash', @durationDays, 1,
        'issued', 'subscription_active', 0, 'wallet_first_no_trial', @submittedAt,
        @now, @now, @reviewedByRef, 'wallet_first_deferred_transition', @validUntil,
        @validUntil, @entitlementRef, @accessGrantRef, @tenantId, @artifactId,
        null, null, null, null, 0, @eventJson
      )
    `), {
      id: prepared.successor.requestId,
      portalUserRef: prepared.accountId,
      plan: prepared.offer.portalPlan,
      durationDays: prepared.offer.durationDays,
      submittedAt: prepared.activationAt,
      now,
      reviewedByRef: WALLET_FIRST_RESOURCE_EFFECT_ACTOR_REF,
      validUntil: prepared.successor.validUntil,
      entitlementRef: prepared.successor.entitlementId,
      accessGrantRef: prepared.effectRef,
      tenantId: runtimeReceipt.tenantId,
      artifactId: runtimeReceipt.artifactId,
      eventJson: portalAccessEventJson({
        type: "wallet_first_resource_effect_applied",
        transitionRef: prepared.transitionRef,
        effectRef: prepared.effectRef,
        occurredAt: now
      }, "walletFirstResourceEffectEvent")
    });
  }

  function walletFirstResourceEffectSwitchCurrentChain(prepared, runtimeReceipt, now) {
    const current = walletFirstResourceEffectExactChain(prepared.accountId);
    if (
      !current
      || prepared.flowKind !== "scheduled_switch"
      || !prepared.expectedChain
      || current.entitlementId !== prepared.expectedChain.entitlementId
      || current.requestId !== prepared.expectedChain.requestId
      || current.issuedLinkId !== prepared.expectedChain.issuedLinkId
      || current.validUntil !== prepared.expectedChain.validUntil
      || current.nodeId !== prepared.nodeId
      || current.tenantId !== runtimeReceipt.tenantId
      || current.artifactId !== runtimeReceipt.artifactId
      || current.tenantRef !== runtimeReceipt.tenantRef
      || current.artifactRef !== runtimeReceipt.artifactRef
    ) {
      throw platformError("validation_error", "wallet-first resource chain changed before switch");
    }
    const trafficLimitBytes = prepared.offer.monthlyTrafficGb * (1024 ** 3);
    const entitlementUpdate = db.prepare(`
      update platform_entitlements
      set plan = @plan,
          valid_from = @validFrom,
          valid_until = @validUntil,
          max_artifacts = 1,
          max_devices = 1,
          traffic_limit_bytes = @trafficLimitBytes,
          updated_at = @now
      where id = @id
        and account_id = @accountId
        and status = 'active'
        and valid_from = @previousValidFrom
        and valid_until = @previousValidUntil
        and plan = @previousPlan
        and max_artifacts = 1
        and max_devices = 1
        and traffic_limit_bytes = @previousTrafficLimitBytes
    `).run({
      id: current.entitlementId,
      accountId: prepared.accountId,
      plan: prepared.offer.offerVersionRef,
      validFrom: prepared.activationAt,
      validUntil: prepared.successor.validUntil,
      trafficLimitBytes,
      now,
      previousValidFrom: current.validFrom,
      previousValidUntil: current.validUntil,
      previousPlan: current.offerVersionRef,
      previousTrafficLimitBytes: current.monthlyTrafficGb * (1024 ** 3)
    });
    if (entitlementUpdate.changes !== 1) {
      throw platformError("validation_error", "wallet-first entitlement switch drifted");
    }
    const previousMetadata = Object.freeze({
      commercialModel: current.metadata.commercialModel,
      resourceModel: current.metadata.resourceModel,
      resourceModelVersion: current.metadata.resourceModelVersion,
      initialTransitionRef: current.metadata.initialTransitionRef,
      lastTransitionRef: current.metadata.lastTransitionRef
    });
    const nextMetadata = Object.freeze({
      ...previousMetadata,
      lastTransitionRef: prepared.transitionRef
    });
    const requestUpdate = db.prepare(`
      update platform_issuance_requests
      set metadata_json = @metadataJson,
          updated_at = @now
      where id = @id
        and account_id = @accountId
        and entitlement_id = @entitlementId
        and status = 'issued'
        and node_id = @nodeId
        and metadata_json = @previousMetadataJson
    `).run({
      id: current.requestId,
      accountId: prepared.accountId,
      entitlementId: current.entitlementId,
      nodeId: prepared.nodeId,
      metadataJson: issuanceMetadataJson(nextMetadata),
      previousMetadataJson: issuanceMetadataJson(previousMetadata),
      now
    });
    if (requestUpdate.changes !== 1) {
      throw platformError("validation_error", "wallet-first request switch drifted");
    }
    const portalUpdate = db.prepare(`
      update platform_portal_access_requests
      set plan = @plan,
          duration_days = @durationDays,
          updated_at = @now,
          reviewed_at = @now,
          reviewed_by_ref = @reviewedByRef,
          safe_reason_code = 'wallet_first_deferred_transition',
          expires_at = @validUntil,
          valid_until = @validUntil,
          access_grant_ref = @accessGrantRef,
          event_json = @eventJson
      where id = @id
        and portal_user_ref = @portalUserRef
        and entitlement_ref = @entitlementRef
        and status = @previousStatus
        and plan = @previousPlan
        and duration_days = @previousDurationDays
        and expires_at = @previousValidUntil
        and valid_until = @previousValidUntil
        and access_grant_ref = @previousAccessGrantRef
        and tenant_id = @tenantId
        and artifact_id = @artifactId
        and subscription_url is null
        and edge_channel_ref is null
        and edge_credential_ref is null
        and edge_material_digest is null
        and edge_lifecycle_mutation = 0
    `).run({
      id: current.requestId,
      portalUserRef: prepared.accountId,
      entitlementRef: current.entitlementId,
      plan: prepared.offer.portalPlan,
      durationDays: prepared.offer.durationDays,
      now,
      reviewedByRef: WALLET_FIRST_RESOURCE_EFFECT_ACTOR_REF,
      validUntil: prepared.successor.validUntil,
      accessGrantRef: prepared.effectRef,
      eventJson: portalAccessEventJson({
        type: "wallet_first_resource_effect_applied",
        transitionRef: prepared.transitionRef,
        effectRef: prepared.effectRef,
        occurredAt: now
      }, "walletFirstResourceEffectEvent"),
      previousStatus: current.portalStatus,
      previousPlan: current.portalPlan,
      previousDurationDays: current.durationDays,
      previousValidUntil: current.validUntil,
      previousAccessGrantRef: current.accessGrantRef,
      tenantId: runtimeReceipt.tenantId,
      artifactId: runtimeReceipt.artifactId
    });
    if (portalUpdate.changes !== 1) {
      throw platformError("validation_error", "wallet-first portal switch drifted");
    }
  }

  function completeWalletFirstTransitionEffectForDeferredTransition(input) {
    exactObject(input, {
      allowed: [
        "transitionRef", "effectRef", "successor", "runtimeReceiptRef", "now",
        "setupDeliveryHandoffRef"
      ],
      required: ["transitionRef", "effectRef", "successor", "runtimeReceiptRef", "now"],
      name: "walletFirstTransitionEffectCompletion"
    });
    const transitionRef = safeControlRef(input.transitionRef, "transitionRef");
    const completion = Object.freeze({
      transitionRef,
      effectRef: safeControlRef(input.effectRef, "effectRef"),
      successor: walletFirstResourceEffectExpectedChain(input.successor),
      runtimeReceiptRef: safeControlRef(input.runtimeReceiptRef, "runtimeReceiptRef"),
      setupDeliveryHandoffRef: input.setupDeliveryHandoffRef === undefined
        ? null
        : walletFirstSetupDeliveryHandoffRef(
          input.setupDeliveryHandoffRef,
          "setupDeliveryHandoffRef"
        ),
      now: isoText(input.now, "now")
    });
    if (completion.effectRef !== walletFirstResourceEffectReceiptRef(transitionRef)) {
      throw platformError("validation_error", "wallet-first completion effect reference is invalid");
    }
    if (
      completion.runtimeReceiptRef
      !== walletFirstResourceEffectRuntimeReceiptRef(transitionRef)
    ) {
      throw platformError("validation_error", "wallet-first completion runtime receipt is invalid");
    }
    const complete = db.transaction(() => {
      const existingAudit = getAuditEvent(walletFirstResourceEffectReceiptRef(transitionRef));
      if (existingAudit) {
        const existing = walletFirstResourceEffectReceiptFromAudit(existingAudit);
        const prepared = walletFirstResourceEffectExistingPreparation(transitionRef);
        const runtimeReceipt = getWalletFirstRuntimeReceiptForDeferredTransition({ transitionRef });
        if (!prepared || !runtimeReceipt) {
          throw platformError("validation_error", "wallet-first effect receipt dependencies are missing");
        }
        if (
          completion.setupDeliveryHandoffRef !== null
          && prepared.flowKind !== "initial_activation"
        ) {
          throw platformError("validation_error", "wallet-first setup-delivery handoff is initial-only");
        }
        walletFirstResourceEffectAssertReceiptMatchesPreparation(prepared, runtimeReceipt, existing);
        if (
          !walletFirstResourceEffectSameReceipt(existing, {
            ...completion,
            accountId: prepared.accountId,
            flowKind: prepared.flowKind
          })
        ) {
          throw platformError("validation_error", "wallet-first effect receipt idempotency conflict");
        }
        walletFirstResourceEffectCurrentPreparedTransition(prepared.accountId);
        if (completion.setupDeliveryHandoffRef !== null) {
          // A replay must prove the original transaction atomically wrote the
          // matching handoff. It must not silently heal a historical gap.
          walletFirstSetupDeliveryAssertExistingHandoff({
            accountId: prepared.accountId,
            handoffRef: completion.setupDeliveryHandoffRef
          });
        }
        return walletFirstResourceEffectOutput(existing);
      }

      const prepared = walletFirstResourceEffectExistingPreparation(transitionRef);
      const runtimeReceipt = getWalletFirstRuntimeReceiptForDeferredTransition({ transitionRef });
      if (!prepared || !runtimeReceipt) {
        throw platformError("validation_error", "wallet-first effect completion dependencies are missing");
      }
      if (
        completion.setupDeliveryHandoffRef !== null
        && prepared.flowKind !== "initial_activation"
      ) {
        throw platformError("validation_error", "wallet-first setup-delivery handoff is initial-only");
      }
      walletFirstResourceEffectAssertRuntimeReceiptMatchesPreparation(prepared, runtimeReceipt);
      if (
        completion.effectRef !== prepared.effectRef
        || completion.successor.entitlementId !== prepared.successor.entitlementId
        || completion.successor.requestId !== prepared.successor.requestId
        || completion.successor.issuedLinkId !== prepared.successor.issuedLinkId
        || completion.successor.validUntil !== prepared.successor.validUntil
      ) {
        throw platformError("validation_error", "wallet-first effect completion does not match preparation");
      }
      walletFirstResourceEffectAccountRecord(prepared.accountId);
      if (prepared.flowKind === "initial_activation") {
        if (walletFirstResourceEffectExactChain(prepared.accountId) !== null) {
          throw platformError("validation_error", "wallet-first initial resource chain changed before completion");
        }
        walletFirstResourceEffectInsertInitialChain(prepared, runtimeReceipt, completion.now);
      } else {
        walletFirstResourceEffectSwitchCurrentChain(prepared, runtimeReceipt, completion.now);
      }
      const chain = walletFirstResourceEffectExactChain(prepared.accountId);
      if (!walletFirstResourceEffectChainMatchesPreparation(chain, prepared, runtimeReceipt)) {
        throw platformError("validation_error", "wallet-first effect completion did not converge");
      }
      const receipt = Object.freeze({
        transitionRef,
        accountId: prepared.accountId,
        flowKind: prepared.flowKind,
        effectRef: prepared.effectRef,
        successor: prepared.successor,
        runtimeReceiptRef: runtimeReceipt.runtimeReceiptRef
      });
      recordAuditEvent({
        id: walletFirstResourceEffectReceiptRef(transitionRef),
        entityType: WALLET_FIRST_RESOURCE_EFFECT_AUDIT_ENTITY_TYPE,
        entityRef: transitionRef,
        action: "resource_effect_applied",
        actorRef: WALLET_FIRST_RESOURCE_EFFECT_ACTOR_REF,
        createdAt: completion.now,
        metadata: walletFirstResourceEffectReceiptMetadata(receipt)
      });
      if (completion.setupDeliveryHandoffRef !== null) {
        // The effect receipt and its delivery handoff share this immediate
        // transaction. Any schema/binding failure rolls the resource-chain
        // mutation and receipt back together, leaving no settled orphan.
        walletFirstSetupDeliveryCreateInTransaction({
          accountId: prepared.accountId,
          handoffRef: completion.setupDeliveryHandoffRef,
          now: completion.now
        });
      }
      return walletFirstResourceEffectOutput(receipt);
    });
    return complete.immediate();
  }

  // Setup delivery is intentionally separated from the resource projection.
  // The handoff ledger persists only opaque references and one-way bindings;
  // raw subscription material never traverses this control-store boundary.
  function walletFirstSetupDeliveryRequireSchema() {
    const table = db.prepare(`
      select name from sqlite_master
       where type = 'table' and name = ?
    `).get(WALLET_FIRST_SETUP_DELIVERY_HANDOFFS_TABLE);
    if (!table) {
      throw platformError(
        "validation_error",
        "wallet-first setup-delivery handoff schema is not ready"
      );
    }
  }

  function walletFirstSetupDeliveryHash(value, field) {
    const normalized = requiredText(value, field);
    if (!WALLET_FIRST_SETUP_DELIVERY_HASH_PATTERN.test(normalized)) {
      throw platformError("validation_error", `${field} must be a SHA-256 hash`);
    }
    return normalized;
  }

  function walletFirstSetupDeliveryHandoffRef(value, field) {
    const normalized = safeControlRef(value, field);
    if (!WALLET_FIRST_SETUP_DELIVERY_HANDOFF_REF_PATTERN.test(normalized)) {
      throw platformError("validation_error", `${field} must be a deterministic setup-delivery handoff reference`);
    }
    return normalized;
  }

  function walletFirstSetupDeliveryHandoffRow(row) {
    if (!row) return null;
    const status = requiredText(row.status, "setupDeliveryHandoff.status");
    if (![
      "pending",
      "claimed",
      "delivered",
      "reconciliation_required"
    ].includes(status)) {
      throw platformError("validation_error", "wallet-first setup-delivery handoff status is invalid");
    }
    const handoff = {
      handoffRef: walletFirstSetupDeliveryHandoffRef(
        row.handoff_ref,
        "setupDeliveryHandoff.handoffRef"
      ),
      accountId: safeControlRef(row.account_id, "setupDeliveryHandoff.accountId"),
      initialTransitionRef: safeControlRef(
        row.initial_transition_ref,
        "setupDeliveryHandoff.initialTransitionRef"
      ),
      effectRef: safeControlRef(row.effect_ref, "setupDeliveryHandoff.effectRef"),
      tenantRef: safeControlRef(row.tenant_ref, "setupDeliveryHandoff.tenantRef"),
      artifactRef: safeControlRef(row.artifact_ref, "setupDeliveryHandoff.artifactRef"),
      idempotencyKeyHash: row.idempotency_key_hash === null
        ? null
        : walletFirstSetupDeliveryHash(
          row.idempotency_key_hash,
          "setupDeliveryHandoff.idempotencyKeyHash"
        ),
      sessionBindingHash: row.session_binding_hash === null
        ? null
        : walletFirstSetupDeliveryHash(
          row.session_binding_hash,
          "setupDeliveryHandoff.sessionBindingHash"
        ),
      status,
      claimGeneration: integer(
        row.claim_generation,
        "setupDeliveryHandoff.claimGeneration",
        { min: 0 }
      ),
      leaseUntil: row.lease_until === null
        ? null
        : isoText(row.lease_until, "setupDeliveryHandoff.leaseUntil"),
      claimedAt: row.claimed_at === null
        ? null
        : isoText(row.claimed_at, "setupDeliveryHandoff.claimedAt"),
      deliveredAt: row.delivered_at === null
        ? null
        : isoText(row.delivered_at, "setupDeliveryHandoff.deliveredAt"),
      safeCode: row.safe_code === null
        ? null
        : safeControlRef(row.safe_code, "setupDeliveryHandoff.safeCode")
    };
    const hashBound = handoff.idempotencyKeyHash !== null
      && handoff.sessionBindingHash !== null;
    if (
      handoff.claimGeneration > 2147483647
      || (handoff.status === "pending" && (
        handoff.claimGeneration !== 0 || handoff.idempotencyKeyHash !== null
        || handoff.sessionBindingHash !== null || handoff.leaseUntil !== null
        || handoff.claimedAt !== null || handoff.deliveredAt !== null || handoff.safeCode !== null
      ))
      || (handoff.status === "claimed" && (
        handoff.claimGeneration < 1 || !hashBound || handoff.leaseUntil === null
        || handoff.claimedAt === null || handoff.deliveredAt !== null || handoff.safeCode !== null
      ))
      || (handoff.status === "delivered" && (
        handoff.claimGeneration < 1 || !hashBound || handoff.leaseUntil !== null
        || handoff.claimedAt === null || handoff.deliveredAt === null || handoff.safeCode !== null
      ))
      || (handoff.status === "reconciliation_required" && (
        hashBound || handoff.idempotencyKeyHash !== null || handoff.sessionBindingHash !== null
        || handoff.leaseUntil !== null || handoff.claimedAt !== null
        || handoff.deliveredAt !== null || handoff.safeCode === null
      ))
    ) {
      throw platformError("validation_error", "wallet-first setup-delivery handoff row is invalid");
    }
    return Object.freeze(handoff);
  }

  function walletFirstSetupDeliveryCurrentBinding(accountId) {
    const account = walletFirstResourceEffectAccountRecord(accountId);
    const chain = walletFirstResourceEffectExactChain(account.id);
    if (!chain) return null;
    walletFirstResourceEffectRequireRuntimeClaimSchema();
    const current = walletFirstResourceEffectCurrentPreparedTransition(account.id);
    const initialTransitionRef = chain.metadata.initialTransitionRef;
    const initialPrepared = walletFirstResourceEffectExistingPreparation(initialTransitionRef);
    const initialRuntimeReceipt = getWalletFirstRuntimeReceiptForDeferredTransition({
      transitionRef: initialTransitionRef
    });
    const initialEffectAudit = getAuditEvent(
      walletFirstResourceEffectReceiptRef(initialTransitionRef)
    );
    if (!initialPrepared || !initialRuntimeReceipt || !initialEffectAudit) {
      throw platformError("validation_error", "wallet-first setup-delivery initial receipt is missing");
    }
    const initialEffectReceipt = walletFirstResourceEffectReceiptFromAudit(initialEffectAudit);
    walletFirstResourceEffectAssertReceiptMatchesPreparation(
      initialPrepared,
      initialRuntimeReceipt,
      initialEffectReceipt
    );
    const runtimeClaim = walletFirstResourceEffectSelectRuntimeClaim(
      initialTransitionRef
    );
    if (
      initialPrepared.flowKind !== "initial_activation"
      || !runtimeClaim
      || runtimeClaim.status !== "recorded"
      || !walletFirstResourceEffectClaimMatchesPreparation(initialPrepared, runtimeClaim)
      || initialRuntimeReceipt.initialTransitionRef !== initialTransitionRef
      || initialEffectReceipt.effectRef !== initialPrepared.effectRef
      || initialEffectReceipt.runtimeReceiptRef !== initialRuntimeReceipt.runtimeReceiptRef
      || current.chain.metadata.initialTransitionRef !== initialTransitionRef
      || current.chain.metadata.lastTransitionRef !== current.prepared.transitionRef
      || current.prepared.effectRef !== current.effectReceipt.effectRef
      || current.runtimeReceipt.tenantId !== initialRuntimeReceipt.tenantId
      || current.runtimeReceipt.artifactId !== initialRuntimeReceipt.artifactId
      || current.runtimeReceipt.tenantRef !== initialRuntimeReceipt.tenantRef
      || current.runtimeReceipt.artifactRef !== initialRuntimeReceipt.artifactRef
      || current.chain.tenantId !== initialRuntimeReceipt.tenantId
      || current.chain.artifactId !== initialRuntimeReceipt.artifactId
      || current.chain.tenantRef !== initialRuntimeReceipt.tenantRef
      || current.chain.artifactRef !== initialRuntimeReceipt.artifactRef
      || chain.tenantId !== initialRuntimeReceipt.tenantId
      || chain.artifactId !== initialRuntimeReceipt.artifactId
      || chain.tenantRef !== initialRuntimeReceipt.tenantRef
      || chain.artifactRef !== initialRuntimeReceipt.artifactRef
    ) {
      throw platformError("validation_error", "wallet-first setup-delivery binding drifted");
    }
    return Object.freeze({
      accountId: account.id,
      initialTransitionRef,
      transitionRef: initialPrepared.transitionRef,
      effectRef: initialPrepared.effectRef,
      tenantId: initialRuntimeReceipt.tenantId,
      artifactId: initialRuntimeReceipt.artifactId,
      tenantRef: initialRuntimeReceipt.tenantRef,
      artifactRef: initialRuntimeReceipt.artifactRef
    });
  }

  function walletFirstSetupDeliverySelectForBinding(binding) {
    return walletFirstSetupDeliveryHandoffRow(db.prepare(`
      select * from ${WALLET_FIRST_SETUP_DELIVERY_HANDOFFS_TABLE}
       where account_id = ? and effect_ref = ?
    `).get(binding.accountId, binding.effectRef));
  }

  function walletFirstSetupDeliveryMatchesBinding(handoff, binding) {
    return Boolean(
      handoff
      && handoff.accountId === binding.accountId
      && handoff.initialTransitionRef === binding.initialTransitionRef
      && handoff.effectRef === binding.effectRef
      && handoff.tenantRef === binding.tenantRef
      && handoff.artifactRef === binding.artifactRef
    );
  }

  function walletFirstSetupDeliveryPrivateBinding(handoff, binding) {
    return Object.freeze({
      handoffRef: handoff.handoffRef,
      initialTransitionRef: binding.initialTransitionRef,
      transitionRef: binding.transitionRef,
      effectRef: binding.effectRef,
      tenantId: binding.tenantId,
      artifactId: binding.artifactId,
      tenantRef: binding.tenantRef,
      artifactRef: binding.artifactRef
    });
  }

  function walletFirstSetupDeliveryClaimOutput(handoff, binding) {
    return Object.freeze({
      state: "claimed",
      handoffRef: handoff.handoffRef,
      claimGeneration: handoff.claimGeneration,
      binding: walletFirstSetupDeliveryPrivateBinding(handoff, binding)
    });
  }

  function walletFirstSetupDeliveryReadAvailability(accountId, now) {
    const binding = walletFirstSetupDeliveryCurrentBinding(accountId);
    if (!binding) return Object.freeze({ state: "none" });
    const handoff = walletFirstSetupDeliverySelectForBinding(binding);
    if (!handoff || !walletFirstSetupDeliveryMatchesBinding(handoff, binding)) {
      return Object.freeze({ state: "reconciliation_required" });
    }
    if (handoff.status === "pending") {
      return Object.freeze({
        state: "available",
        handoffRef: handoff.handoffRef,
        binding: walletFirstSetupDeliveryPrivateBinding(handoff, binding)
      });
    }
    if (handoff.status === "claimed") {
      return Object.freeze({
        state: handoff.leaseUntil <= now ? "available" : "claimed",
        handoffRef: handoff.handoffRef,
        binding: walletFirstSetupDeliveryPrivateBinding(handoff, binding)
      });
    }
    return Object.freeze({ state: handoff.status });
  }

  // This is a private server-side reader. The caller must never serialize its
  // opaque binding into a Portal response; it only lets the escrow adapter
  // prove release capability before any mutable claim is attempted.
  function readWalletFirstSetupDeliveryAvailabilityBinding(input) {
    exactObject(input, {
      allowed: ["accountId", "now"],
      name: "walletFirstSetupDeliveryAvailability"
    });
    const accountId = safeControlRef(input.accountId, "accountId");
    const now = isoText(input.now, "now");
    try {
      walletFirstSetupDeliveryRequireSchema();
      return walletFirstSetupDeliveryReadAvailability(accountId, now);
    } catch (error) {
      if (error?.code === "validation_error" || error?.code === "not_found") {
        return Object.freeze({ state: "reconciliation_required" });
      }
      throw error;
    }
  }

  // Status-only facade for the Portal projection. It intentionally strips
  // all opaque runtime and handoff references from the result.
  function readWalletFirstSetupDeliveryHandoff(input) {
    const availability = readWalletFirstSetupDeliveryAvailabilityBinding(input);
    return Object.freeze({ state: availability.state });
  }

  function walletFirstSetupDeliveryCreateInTransaction({ accountId, handoffRef, now }) {
    walletFirstSetupDeliveryRequireSchema();
    const normalizedHandoffRef = walletFirstSetupDeliveryHandoffRef(handoffRef, "handoffRef");
    const binding = walletFirstSetupDeliveryCurrentBinding(accountId);
    if (!binding) {
      throw platformError("validation_error", "wallet-first setup-delivery resource is missing");
    }
    const existing = walletFirstSetupDeliverySelectForBinding(binding);
    if (existing) {
      if (
        !walletFirstSetupDeliveryMatchesBinding(existing, binding)
        || existing.handoffRef !== normalizedHandoffRef
      ) {
        throw platformError("validation_error", "wallet-first setup-delivery handoff binding drifted");
      }
      return Object.freeze({ state: existing.status });
    }
    sqliteRun(db.prepare(`
      insert into ${WALLET_FIRST_SETUP_DELIVERY_HANDOFFS_TABLE} (
        handoff_ref, account_id, initial_transition_ref, effect_ref,
        tenant_ref, artifact_ref, idempotency_key_hash, session_binding_hash,
        status, claim_generation, lease_until, created_at, updated_at,
        claimed_at, delivered_at, safe_code
      ) values (
        @handoffRef, @accountId, @initialTransitionRef, @effectRef,
        @tenantRef, @artifactRef, null, null,
        'pending', 0, null, @now, @now,
        null, null, null
      )
    `), { ...binding, handoffRef: normalizedHandoffRef, now });
    return Object.freeze({ state: "pending" });
  }

  function walletFirstSetupDeliveryAssertExistingHandoff({ accountId, handoffRef }) {
    walletFirstSetupDeliveryRequireSchema();
    const normalizedHandoffRef = walletFirstSetupDeliveryHandoffRef(handoffRef, "handoffRef");
    const binding = walletFirstSetupDeliveryCurrentBinding(accountId);
    if (!binding) {
      throw platformError("validation_error", "wallet-first setup-delivery resource is missing");
    }
    const existing = walletFirstSetupDeliverySelectForBinding(binding);
    if (
      !existing
      || !walletFirstSetupDeliveryMatchesBinding(existing, binding)
      || existing.handoffRef !== normalizedHandoffRef
    ) {
      throw platformError("validation_error", "wallet-first setup-delivery receipt handoff is missing");
    }
    return existing;
  }

  // Internal effect-adapter proof only: a durable runtime/escrow receipt is
  // insufficient on its own.  A resolved initial effect may be treated as
  // settled only when the exact control-database handoff row that was written
  // with its original completion still exists and binds the current chain.
  // It deliberately returns no binding or material.
  function assertWalletFirstSetupDeliveryHandoffForDeferredTransition(input) {
    exactObject(input, {
      allowed: ["transitionRef", "effectRef", "handoffRef"],
      name: "walletFirstSetupDeliveryEffectHandoffAssertion"
    });
    const transitionRef = safeControlRef(input.transitionRef, "transitionRef");
    const effectRef = safeControlRef(input.effectRef, "effectRef");
    const handoffRef = walletFirstSetupDeliveryHandoffRef(input.handoffRef, "handoffRef");
    const prepared = walletFirstResourceEffectExistingPreparation(transitionRef);
    if (
      !prepared
      || prepared.flowKind !== "initial_activation"
      || prepared.effectRef !== effectRef
    ) {
      throw platformError("validation_error", "wallet-first setup-delivery assertion is initial-only");
    }
    const existing = walletFirstSetupDeliveryAssertExistingHandoff({
      accountId: prepared.accountId,
      handoffRef
    });
    if (existing.initialTransitionRef !== transitionRef) {
      throw platformError("validation_error", "wallet-first setup-delivery assertion transition drifted");
    }
    return Object.freeze({});
  }

  // Recovery-only entrypoint for an explicitly audited legacy effect. The
  // normal runtime path invokes the same helper from effect completion's
  // immediate transaction, so it cannot create a post-settlement gap.
  function createWalletFirstSetupDeliveryHandoff(input) {
    exactObject(input, {
      allowed: ["accountId", "handoffRef", "now"],
      name: "walletFirstSetupDeliveryCreate"
    });
    const accountId = safeControlRef(input.accountId, "accountId");
    const handoffRef = walletFirstSetupDeliveryHandoffRef(input.handoffRef, "handoffRef");
    const now = isoText(input.now, "now");
    return db.transaction(() => (
      walletFirstSetupDeliveryCreateInTransaction({ accountId, handoffRef, now })
    )).immediate();
  }

  function walletFirstSetupDeliveryClaimInput(input) {
    exactObject(input, {
      allowed: ["accountId", "idempotencyKeyHash", "sessionBindingHash", "now", "leaseMs"],
      name: "walletFirstSetupDeliveryClaim"
    });
    const leaseMs = integer(input.leaseMs, "leaseMs", { min: 1 });
    if (leaseMs > MAX_WALLET_FIRST_SETUP_DELIVERY_LEASE_MS) {
      throw platformError("validation_error", "wallet-first setup-delivery lease is too long");
    }
    return Object.freeze({
      accountId: safeControlRef(input.accountId, "accountId"),
      idempotencyKeyHash: walletFirstSetupDeliveryHash(
        input.idempotencyKeyHash,
        "idempotencyKeyHash"
      ),
      sessionBindingHash: walletFirstSetupDeliveryHash(
        input.sessionBindingHash,
        "sessionBindingHash"
      ),
      now: isoText(input.now, "now"),
      leaseMs
    });
  }

  function claimWalletFirstSetupDeliveryHandoff(input) {
    const requested = walletFirstSetupDeliveryClaimInput(input);
    return db.transaction(() => {
      walletFirstSetupDeliveryRequireSchema();
      const binding = walletFirstSetupDeliveryCurrentBinding(requested.accountId);
      if (!binding) return Object.freeze({ state: "reconciliation_required" });
      const existing = walletFirstSetupDeliverySelectForBinding(binding);
      if (!existing || !walletFirstSetupDeliveryMatchesBinding(existing, binding)) {
        return Object.freeze({ state: "reconciliation_required" });
      }
      if (existing.status === "reconciliation_required") {
        return Object.freeze({ state: "reconciliation_required" });
      }
      const sameClaim = existing.idempotencyKeyHash === requested.idempotencyKeyHash
        && existing.sessionBindingHash === requested.sessionBindingHash;
      if (existing.status === "delivered") {
        if (sameClaim) return Object.freeze({ state: "delivered" });
        throw platformError("claim_lost", "wallet-first setup-delivery handoff is already delivered");
      }
      if (existing.status === "claimed" && sameClaim && existing.leaseUntil > requested.now) {
        return walletFirstSetupDeliveryClaimOutput(existing, binding);
      }
      if (existing.status === "claimed" && existing.leaseUntil > requested.now) {
        throw platformError("claim_lost", "wallet-first setup-delivery handoff is claimed by another session");
      }
      const nextGeneration = existing.claimGeneration + 1;
      const leaseUntil = addMillisecondsToIso(requested.now, requested.leaseMs, "leaseMs");
      const updated = existing.status === "pending"
        ? db.prepare(`
            update ${WALLET_FIRST_SETUP_DELIVERY_HANDOFFS_TABLE}
               set idempotency_key_hash = ?,
                   session_binding_hash = ?,
                   status = 'claimed',
                   claim_generation = 1,
                   lease_until = ?,
                   claimed_at = ?,
                   updated_at = ?
             where account_id = ? and effect_ref = ?
               and status = 'pending' and claim_generation = 0
          `).run(
          requested.idempotencyKeyHash,
          requested.sessionBindingHash,
          leaseUntil,
          requested.now,
          requested.now,
          binding.accountId,
          binding.effectRef
        )
        : db.prepare(`
            update ${WALLET_FIRST_SETUP_DELIVERY_HANDOFFS_TABLE}
               set idempotency_key_hash = ?,
                   session_binding_hash = ?,
                   claim_generation = ?,
                   lease_until = ?,
                   claimed_at = ?,
                   updated_at = ?
             where account_id = ? and effect_ref = ?
               and status = 'claimed'
               and claim_generation = ?
               and idempotency_key_hash = ?
               and session_binding_hash = ?
               and lease_until <= ?
          `).run(
          requested.idempotencyKeyHash,
          requested.sessionBindingHash,
          nextGeneration,
          leaseUntil,
          requested.now,
          requested.now,
          binding.accountId,
          binding.effectRef,
          existing.claimGeneration,
          existing.idempotencyKeyHash,
          existing.sessionBindingHash,
          requested.now
        );
      if (updated.changes !== 1) {
        throw platformError("claim_lost", "wallet-first setup-delivery handoff is no longer current");
      }
      const claimed = walletFirstSetupDeliverySelectForBinding(binding);
      if (!claimed || !walletFirstSetupDeliveryMatchesBinding(claimed, binding)) {
        throw platformError("claim_lost", "wallet-first setup-delivery handoff disappeared");
      }
      return walletFirstSetupDeliveryClaimOutput(claimed, binding);
    }).immediate();
  }

  function readWalletFirstSetupDeliveryBinding(input) {
    exactObject(input, {
      allowed: ["accountId", "handoffRef", "sessionBindingHash", "now"],
      name: "walletFirstSetupDeliveryBinding"
    });
    const accountId = safeControlRef(input.accountId, "accountId");
    const handoffRef = walletFirstSetupDeliveryHandoffRef(input.handoffRef, "handoffRef");
    const sessionBindingHash = walletFirstSetupDeliveryHash(
      input.sessionBindingHash,
      "sessionBindingHash"
    );
    const now = isoText(input.now, "now");
    walletFirstSetupDeliveryRequireSchema();
    const binding = walletFirstSetupDeliveryCurrentBinding(accountId);
    if (!binding) return Object.freeze({ state: "reconciliation_required" });
    const handoff = walletFirstSetupDeliverySelectForBinding(binding);
    if (
      !handoff
      || !walletFirstSetupDeliveryMatchesBinding(handoff, binding)
      || handoff.handoffRef !== handoffRef
    ) {
      return Object.freeze({ state: "reconciliation_required" });
    }
    if (
      handoff.status !== "claimed"
      || handoff.sessionBindingHash !== sessionBindingHash
      || handoff.leaseUntil <= now
    ) {
      throw platformError("claim_lost", "wallet-first setup-delivery handoff claim is not current");
    }
    return walletFirstSetupDeliveryClaimOutput(handoff, binding);
  }

  // This narrower reader is for acknowledgement/escrow cleanup only. Unlike
  // the release reader above it permits an expired claim from the same session
  // only while the durable claim generation has not been replaced. Callers
  // must never use it to release configuration material.
  function readWalletFirstSetupDeliveryAcknowledgementBinding(input) {
    exactObject(input, {
      allowed: ["accountId", "handoffRef", "sessionBindingHash", "now"],
      name: "walletFirstSetupDeliveryAcknowledgementBinding"
    });
    const accountId = safeControlRef(input.accountId, "accountId");
    const handoffRef = walletFirstSetupDeliveryHandoffRef(input.handoffRef, "handoffRef");
    const sessionBindingHash = walletFirstSetupDeliveryHash(
      input.sessionBindingHash,
      "sessionBindingHash"
    );
    // Validate time at the boundary even though acknowledgement deliberately
    // does not use it to invalidate an unreplaced same-session claim.
    isoText(input.now, "now");
    walletFirstSetupDeliveryRequireSchema();
    const binding = walletFirstSetupDeliveryCurrentBinding(accountId);
    if (!binding) throw platformError("claim_lost", "wallet-first setup-delivery resource is missing");
    const handoff = walletFirstSetupDeliverySelectForBinding(binding);
    if (
      !handoff
      || !walletFirstSetupDeliveryMatchesBinding(handoff, binding)
      || handoff.handoffRef !== handoffRef
      || handoff.sessionBindingHash !== sessionBindingHash
    ) {
      throw platformError("claim_lost", "wallet-first setup-delivery acknowledgement is not current");
    }
    if (handoff.status === "delivered") {
      return Object.freeze({
        state: "delivered",
        handoffRef: handoff.handoffRef,
        binding: walletFirstSetupDeliveryPrivateBinding(handoff, binding)
      });
    }
    if (handoff.status !== "claimed") {
      throw platformError("claim_lost", "wallet-first setup-delivery acknowledgement is unavailable");
    }
    return walletFirstSetupDeliveryClaimOutput(handoff, binding);
  }

  function acknowledgeWalletFirstSetupDeliveryHandoff(input) {
    exactObject(input, {
      allowed: ["accountId", "handoffRef", "sessionBindingHash", "now"],
      name: "walletFirstSetupDeliveryAcknowledge"
    });
    const requested = Object.freeze({
      accountId: safeControlRef(input.accountId, "accountId"),
      handoffRef: walletFirstSetupDeliveryHandoffRef(input.handoffRef, "handoffRef"),
      sessionBindingHash: walletFirstSetupDeliveryHash(
        input.sessionBindingHash,
        "sessionBindingHash"
      ),
      now: isoText(input.now, "now")
    });
    return db.transaction(() => {
      walletFirstSetupDeliveryRequireSchema();
      const binding = walletFirstSetupDeliveryCurrentBinding(requested.accountId);
      if (!binding) throw platformError("claim_lost", "wallet-first setup-delivery resource is missing");
      const handoff = walletFirstSetupDeliverySelectForBinding(binding);
      if (
        !handoff
        || !walletFirstSetupDeliveryMatchesBinding(handoff, binding)
        || handoff.handoffRef !== requested.handoffRef
        || handoff.sessionBindingHash !== requested.sessionBindingHash
      ) {
        throw platformError("claim_lost", "wallet-first setup-delivery handoff is not owned by this session");
      }
      if (handoff.status === "delivered") return Object.freeze({ state: "delivered" });
      if (handoff.status !== "claimed") {
        throw platformError("claim_lost", "wallet-first setup-delivery handoff cannot be acknowledged");
      }
      const delivered = db.prepare(`
        update ${WALLET_FIRST_SETUP_DELIVERY_HANDOFFS_TABLE}
           set status = 'delivered',
               lease_until = null,
               delivered_at = ?,
               updated_at = ?
         where account_id = ? and effect_ref = ?
           and handoff_ref = ?
           and status = 'claimed'
           and claim_generation = ?
           and session_binding_hash = ?
      `).run(
        requested.now,
        requested.now,
        binding.accountId,
        binding.effectRef,
        requested.handoffRef,
        handoff.claimGeneration,
        requested.sessionBindingHash
      );
      if (delivered.changes !== 1) {
        throw platformError("claim_lost", "wallet-first setup-delivery acknowledgement lost its claim");
      }
      return Object.freeze({ state: "delivered" });
    }).immediate();
  }

  function markWalletFirstSetupDeliveryHandoffReconciliationRequired(input) {
    exactObject(input, {
      allowed: ["accountId", "handoffRef", "sessionBindingHash", "safeCode", "now"],
      name: "walletFirstSetupDeliveryReconciliation"
    });
    const requested = Object.freeze({
      accountId: safeControlRef(input.accountId, "accountId"),
      handoffRef: walletFirstSetupDeliveryHandoffRef(input.handoffRef, "handoffRef"),
      sessionBindingHash: walletFirstSetupDeliveryHash(
        input.sessionBindingHash,
        "sessionBindingHash"
      ),
      safeCode: safeControlRef(input.safeCode, "safeCode"),
      now: isoText(input.now, "now")
    });
    return db.transaction(() => {
      walletFirstSetupDeliveryRequireSchema();
      const binding = walletFirstSetupDeliveryCurrentBinding(requested.accountId);
      if (!binding) throw platformError("claim_lost", "wallet-first setup-delivery resource is missing");
      const updated = db.prepare(`
        update ${WALLET_FIRST_SETUP_DELIVERY_HANDOFFS_TABLE}
           set idempotency_key_hash = null,
               session_binding_hash = null,
               status = 'reconciliation_required',
               lease_until = null,
               claimed_at = null,
               delivered_at = null,
               safe_code = ?,
               updated_at = ?
         where account_id = ? and effect_ref = ?
           and handoff_ref = ?
           and status in ('claimed', 'delivered')
           and session_binding_hash = ?
      `).run(
        requested.safeCode,
        requested.now,
        binding.accountId,
        binding.effectRef,
        requested.handoffRef,
        requested.sessionBindingHash
      );
      if (updated.changes !== 1) {
        throw platformError("claim_lost", "wallet-first setup-delivery reconciliation lost its claim");
      }
      return Object.freeze({ state: "reconciliation_required" });
    }).immediate();
  }

  function createEntitlement(input) {
    assertNoUnsafeFields(input);
    const record = {
      id: requiredText(input.id, "id"),
      accountId: requiredText(input.accountId, "accountId"),
      plan: requiredText(input.plan, "plan"),
      status: requiredText(input.status || "active", "status"),
      validFrom: isoText(input.validFrom, "validFrom"),
      validUntil: isoText(input.validUntil, "validUntil"),
      maxArtifacts: integer(input.maxArtifacts ?? 1, "maxArtifacts", { min: 1 }),
      maxDevices: integer(input.maxDevices ?? 1, "maxDevices", { min: 1 }),
      trafficLimitBytes: integer(input.trafficLimitBytes ?? 0, "trafficLimitBytes", { min: 0 }),
      createdAt: isoText(input.createdAt, "createdAt"),
      updatedAt: isoText(input.updatedAt, "updatedAt")
    };
    if (record.validFrom >= record.validUntil) {
      throw platformError("validation_error", "validFrom must be before validUntil");
    }
    sqliteRun(db.prepare(`
      insert into platform_entitlements (
        id, account_id, plan, status, valid_from, valid_until,
        max_artifacts, max_devices, traffic_limit_bytes, created_at, updated_at
      ) values (
        @id, @accountId, @plan, @status, @validFrom, @validUntil,
        @maxArtifacts, @maxDevices, @trafficLimitBytes, @createdAt, @updatedAt
      )
    `), record);
    return getEntitlement(record.id);
  }

  function getEntitlement(id) {
    return mapEntitlement(db.prepare("select * from platform_entitlements where id = ?").get(requiredText(id, "id")));
  }

  function listEntitlements(filters = {}) {
    assertNoUnsafeFields(filters);
    const clauses = [];
    const params = [];
    const accountId = optionalText(filters.accountId);
    const status = optionalText(filters.status);
    if (accountId) {
      clauses.push("account_id = ?");
      params.push(accountId);
    }
    if (status) {
      clauses.push("status = ?");
      params.push(status);
    }
    const where = clauses.length ? `where ${clauses.join(" and ")}` : "";
    return db.prepare(`
      select * from platform_entitlements
      ${where}
      order by valid_until desc, id asc
    `).all(...params).map(mapEntitlement);
  }

  let accountResourceAuthorityStore = null;

  function resolveCommerceAuthority(input = {}) {
    assertNoUnsafeFields(input);
    if (!accountResourceAuthorityStore) {
      accountResourceAuthorityStore = createAccountResourceAuthorityStore({
        database: db
      });
    }
    return accountResourceAuthorityStore.resolveCommerceAuthority(input);
  }

  const coinCommerceFulfillmentMetadataKeys = Object.freeze([
    "version",
    "commandRef",
    "orderRef",
    "accountId",
    "requestRef",
    "entitlementRef",
    "issuedLinkRef",
    "tenantRef",
    "artifactRef",
    "offerVersionRef",
    "portalPlan",
    "durationDays",
    "monthlyTrafficGb",
    "trafficLimitBytes",
    "validFrom",
    "previousValidUntil",
    "targetValidUntil"
  ]);

  const sameKeys = (value, expectedKeys) => (
    value
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.keys(value).sort().join("\0") === [...expectedKeys].sort().join("\0")
  );

  function coinCommerceFulfillmentMetadataShape(metadata) {
    if (sameKeys(metadata, coinCommerceFulfillmentMetadataKeys)) {
      return { switchKind: null };
    }
    if (
      sameKeys(metadata, [...coinCommerceFulfillmentMetadataKeys, "switchKind"])
      && (
        metadata.switchKind === "upgrade_inplace"
        || metadata.switchKind === "upgrade_restart"
      )
    ) {
      return { switchKind: metadata.switchKind };
    }
    return null;
  }

  const effectRefForCommand = (commandRef) => `effect_coin_commerce_${sha256(
    `GCCWEBOS:COIN_COMMERCE_SUBSCRIPTION_FULFILLMENT:v1\0${commandRef}`
  )}`;

  function parseCoinCommerceFulfillmentEffect(candidate, { accountId, entitlementRef }) {
    const metadata = candidate?.metadata;
    if (
      !candidate
      || candidate.entityType !== "coin_commerce_subscription_fulfillment"
      || candidate.entityRef !== entitlementRef
      || candidate.action !== "subscription_fulfillment_applied"
      || candidate.actorRef !== "coin_commerce_fulfillment"
      || !coinCommerceFulfillmentMetadataShape(metadata)
      || metadata.version !== 1
      || metadata.accountId !== accountId
      || metadata.entitlementRef !== entitlementRef
      || !Number.isSafeInteger(metadata.durationDays)
      || metadata.durationDays < 1
      || !Number.isSafeInteger(metadata.monthlyTrafficGb)
      || metadata.monthlyTrafficGb < 1
      || metadata.trafficLimitBytes !== metadata.monthlyTrafficGb * (1024 ** 3)
      || (metadata.portalPlan !== "monthly" && metadata.portalPlan !== "yearly")
    ) {
      return null;
    }
    let validFrom;
    let previousValidUntil;
    let targetValidUntil;
    let createdAt;
    try {
      for (const key of [
        "commandRef",
        "orderRef",
        "accountId",
        "tenantRef",
        "artifactRef",
        "offerVersionRef"
      ]) {
        safeControlRef(metadata[key], key);
      }
      for (const key of [
        "requestRef",
        "entitlementRef",
        "issuedLinkRef"
      ]) {
        safeAuthorityRef(metadata[key], key);
      }
      validFrom = isoText(metadata.validFrom, "validFrom");
      previousValidUntil = isoText(metadata.previousValidUntil, "previousValidUntil");
      targetValidUntil = isoText(metadata.targetValidUntil, "targetValidUntil");
      createdAt = isoText(candidate.createdAt, "createdAt");
    } catch {
      return null;
    }
    const switchKind = coinCommerceFulfillmentMetadataShape(metadata)?.switchKind;
    if (
      candidate.id !== effectRefForCommand(metadata.commandRef)
      || previousValidUntil > targetValidUntil
      || (
        previousValidUntil === targetValidUntil
        && switchKind !== "upgrade_inplace"
      )
      || validFrom >= targetValidUntil
    ) {
      return null;
    }
    return Object.freeze({
      id: candidate.id,
      createdAt,
      ...metadata,
      validFrom,
      previousValidUntil,
      targetValidUntil
    });
  }

  function resolveLiveCoinCommerceFulfillmentEffect({ accountId, entitlement }) {
    const accessRequests = listPortalAccessRequests({
      portalUserRef: accountId
    }).filter((request) => (
      (request.status === "delivered" || request.status === "issued")
      && request.entitlementRef === entitlement.id
    ));
    if (accessRequests.length !== 1) return null;
    const [accessRequest] = accessRequests;
    if (
      accessRequest.portalUserRef !== accountId
      || !optionalText(accessRequest.tenantId)
      || !optionalText(accessRequest.artifactId)
      || accessRequest.expiresAt !== entitlement.validUntil
      || accessRequest.validUntil !== entitlement.validUntil
    ) {
      return null;
    }
    const issuanceRequest = getIssuanceRequest(accessRequest.id);
    const bindings = listIssuedSubscriptionBindings()
      .filter((binding) => binding.requestId === accessRequest.id);
    if (
      !issuanceRequest
      || issuanceRequest.status !== "issued"
      || issuanceRequest.accountId !== accountId
      || issuanceRequest.entitlementId !== entitlement.id
      || bindings.length !== 1
    ) {
      return null;
    }
    const [binding] = bindings;
    if (
      binding.accountId !== accountId
      || binding.entitlementId !== entitlement.id
      || binding.tenantRef !== `tenantref_${sha256(accessRequest.tenantId).slice(0, 16)}`
      || (binding.artifactRef !== `artifactref_${sha256(accessRequest.artifactId).slice(0, 16)}`
        && !verifyPortalSubscriptionLinkResetLineage(db, { requestRef: accessRequest.id, ownerRef: accountId,
          tenantId: accessRequest.tenantId, originalArtifactRef: binding.artifactRef, currentArtifactId: accessRequest.artifactId }))
    ) {
      return null;
    }
    const audits = db.prepare(`
      select * from platform_audit_events
      where entity_type = 'coin_commerce_subscription_fulfillment'
        and entity_ref = ?
        and action = 'subscription_fulfillment_applied'
        and actor_ref = 'coin_commerce_fulfillment'
      order by created_at asc, id asc
    `).all(entitlement.id).map(mapAuditEvent);
    if (audits.length === 0) return null;
    const effects = [];
    for (const audit of audits) {
      const effect = parseCoinCommerceFulfillmentEffect(audit, {
        accountId,
        entitlementRef: entitlement.id
      });
      if (
        !effect
        || effect.requestRef !== accessRequest.id
        || effect.issuedLinkRef !== binding.id
        || effect.tenantRef !== binding.tenantRef
        || effect.artifactRef !== binding.artifactRef
      ) {
        return null;
      }
      effects.push(effect);
    }
    const starts = effects.filter((candidate) => (
      !effects.some((other) => (
        other.id !== candidate.id
        && other.targetValidUntil === candidate.previousValidUntil
      ))
    ));
    if (starts.length !== 1) return null;
    let terminalEffect = starts[0];
    const visited = new Set([terminalEffect.id]);
    const chainHasSwitch = effects.some((effect) => (
      effect.switchKind === "upgrade_inplace"
      || effect.switchKind === "upgrade_restart"
    ));
    if (!chainHasSwitch) {
      while (true) {
        const nextEffects = effects.filter(
          (candidate) => candidate.previousValidUntil === terminalEffect.targetValidUntil
        );
        if (nextEffects.length === 0) break;
        if (nextEffects.length !== 1) return null;
        const [nextEffect] = nextEffects;
        if (
          visited.has(nextEffect.id)
          || nextEffect.targetValidUntil <= terminalEffect.targetValidUntil
          || (
            nextEffect.offerVersionRef === terminalEffect.offerVersionRef
              ? nextEffect.validFrom !== terminalEffect.validFrom
              : nextEffect.validFrom !== nextEffect.createdAt
          )
        ) {
          return null;
        }
        visited.add(nextEffect.id);
        terminalEffect = nextEffect;
      }
    } else {
      while (visited.size < effects.length) {
        const candidates = effects
          .filter((candidate) => (
            !visited.has(candidate.id)
            && candidate.previousValidUntil === terminalEffect.targetValidUntil
          ))
          .sort((left, right) => (
            left.createdAt.localeCompare(right.createdAt)
            || left.id.localeCompare(right.id)
          ));
        if (candidates.length === 0) return null;
        const inplace = candidates.filter((candidate) => (
          candidate.switchKind === "upgrade_inplace"
          && candidate.targetValidUntil === terminalEffect.targetValidUntil
          && candidate.validFrom === terminalEffect.validFrom
        ));
        const others = candidates.filter((candidate) => !inplace.includes(candidate));
        let nextEffect;
        if (inplace.length > 0 && candidates[0].id === inplace[0].id) {
          nextEffect = inplace[0];
        } else if (inplace.length === 0 && others.length === 1) {
          nextEffect = others[0];
          if (nextEffect.targetValidUntil <= terminalEffect.targetValidUntil) return null;
          if (
            nextEffect.switchKind === "upgrade_inplace"
            || nextEffect.switchKind === "upgrade_restart"
          ) {
            if (nextEffect.validFrom !== terminalEffect.validFrom) return null;
          } else if (nextEffect.offerVersionRef === terminalEffect.offerVersionRef) {
            if (nextEffect.validFrom !== terminalEffect.validFrom) return null;
          } else if (nextEffect.validFrom !== nextEffect.createdAt) {
            return null;
          }
        } else {
          return null;
        }
        visited.add(nextEffect.id);
        terminalEffect = nextEffect;
      }
    }
    if (
      visited.size !== effects.length
      || entitlement.plan !== terminalEffect.offerVersionRef
      || entitlement.validFrom !== terminalEffect.validFrom
      || entitlement.validUntil !== terminalEffect.targetValidUntil
      || entitlement.trafficLimitBytes !== terminalEffect.trafficLimitBytes
      || accessRequest.plan !== terminalEffect.portalPlan
      || accessRequest.durationDays !== terminalEffect.durationDays
      || accessRequest.expiresAt !== terminalEffect.targetValidUntil
      || accessRequest.validUntil !== terminalEffect.targetValidUntil
    ) {
      return null;
    }
    return Object.freeze({
      effects: Object.freeze(effects),
      terminalEffect
    });
  }

  function resolveAccountServiceEntitlement(input = {}) {
    assertNoUnsafeFields(input);
    const accountId = requiredText(input.accountId, "accountId");
    const now = isoText(input.now, "now");
    const account = getAccount(accountId);
    if (!account || account.status !== "active") return null;
    const entitlements = listEntitlements({
      accountId,
      status: "active"
    }).filter((entitlement) => (
      entitlement.accountId === accountId
      && entitlement.validFrom < entitlement.validUntil
    ));
    const selectServiceEntitlement = (candidates) => {
      const current = candidates.filter((entitlement) => (
        entitlement.validFrom <= now
        && entitlement.validUntil > now
      ));
      if (current.length > 1) return null;
      if (current.length === 1) return current[0];
      const effectBackedFuture = candidates.filter((entitlement) => (
        entitlement.validFrom > now
        && entitlement.validUntil > now
        && Boolean(resolveLiveCoinCommerceFulfillmentEffect({ accountId, entitlement }))
      ));
      if (effectBackedFuture.length > 1) return null;
      if (effectBackedFuture.length === 1) return effectBackedFuture[0];
      const lapsed = candidates.filter((entitlement) => (
        entitlement.validFrom <= now
        && entitlement.validUntil <= now
      ));
      if (lapsed.length === 0) return null;
      const latestValidUntil = lapsed.reduce(
        (latest, entitlement) => (
          entitlement.validUntil > latest ? entitlement.validUntil : latest
        ),
        lapsed[0].validUntil
      );
      const latest = lapsed.filter(
        (entitlement) => entitlement.validUntil === latestValidUntil
      );
      return latest.length === 1 ? latest[0] : null;
    };

    const resourceBindings = listIssuedSubscriptionBindings({ accountId });
    if (resourceBindings.length > 0) {
      const boundEntitlements = [];
      for (const binding of resourceBindings) {
        const entitlement = entitlements.find(
          (candidate) => candidate.id === binding.entitlementId
        );
        if (
          !entitlement
          || binding.accountId !== accountId
          || binding.entitlementStatus !== "active"
          || binding.requestStatus !== "issued"
          || binding.status !== "active"
          || binding.plan !== entitlement.plan
          || binding.validFrom !== entitlement.validFrom
          || binding.validUntil !== entitlement.validUntil
          || binding.trafficLimitBytes !== entitlement.trafficLimitBytes
        ) {
          return null;
        }
        if (!isLifetimeDataPackBinding(entitlement)) {
          boundEntitlements.push(entitlement);
        }
      }
      return selectServiceEntitlement(boundEntitlements);
    }
    return selectServiceEntitlement(entitlements.filter(
      (entitlement) => !isLifetimeDataPackBinding(entitlement)
    ));
  }

  function updateEntitlementTrafficLimit(id, { trafficLimitBytes, updatedAt }) {
    assertNoUnsafeFields({ trafficLimitBytes, updatedAt });
    const result = db.prepare(`
      update platform_entitlements
      set traffic_limit_bytes = ?, updated_at = ?
      where id = ?
    `).run(
      integer(trafficLimitBytes ?? 0, "trafficLimitBytes", { min: 0 }),
      isoText(updatedAt, "updatedAt"),
      requiredText(id, "id")
    );
    if (result.changes !== 1) {
      throw platformError("not_found", "entitlement not found");
    }
    return getEntitlement(id);
  }

  function readPlanSwitchAccountFacts(input = {}) {
    assertNoUnsafeFields(input);
    const accountId = requiredText(input.accountId, "accountId");
    const now = isoText(input.now, "now");
    const account = getAccount(accountId);
    if (!account || account.status !== "active") return null;
    let scheduledSwitch;
    try {
      scheduledSwitch = readOpenScheduledPlanSwitch(db, accountId);
    } catch (error) {
      if (String(error?.message || "").includes("no such table")) {
        scheduledSwitch = { ok: true, row: null };
      } else {
        throw error;
      }
    }
    return {
      commerceMode: commerceModeFromMetadata(account.metadata),
      authorityRowCount: countAccountAuthorityRows(db, accountId),
      entitlement: resolveAccountServiceEntitlement({ accountId, now }),
      scheduledSwitch
    };
  }

  function readPlanSwitchQuoteForOrderRef(input = {}) {
    assertNoUnsafeFields(input);
    return readPlanSwitchQuoteForOrder(
      db,
      safeControlRef(input.orderRef, "orderRef")
    );
  }

  function readScheduledPlanSwitch(input = {}) {
    assertNoUnsafeFields(input);
    const row = readScheduledPlanSwitchByRef(
      db,
      safeControlRef(input.switchRef, "switchRef")
    );
    if (!row) return null;
    return {
      switchRef: row.switch_ref,
      accountId: row.account_id,
      entitlementId: row.entitlement_id,
      fromOfferVersionRef: row.from_offer_version_ref,
      toOfferVersionRef: row.to_offer_version_ref,
      effectiveAt: row.effective_at,
      paidUnits: row.paid_units,
      status: row.status,
      createdAt: row.created_at
    };
  }

  function deliverPlanSwitchDowngrade(input = {}) {
    assertNoUnsafeFields(input);
    const row = {
      switchRef: safeControlRef(input.switchRef, "switchRef"),
      accountId: safeControlRef(input.accountId, "accountId"),
      entitlementId: safeControlRef(input.entitlementId, "entitlementId"),
      fromOfferVersionRef: safeControlRef(
        input.fromOfferVersionRef,
        "fromOfferVersionRef"
      ),
      toOfferVersionRef: safeControlRef(
        input.toOfferVersionRef,
        "toOfferVersionRef"
      ),
      effectiveAt: isoText(input.effectiveAt, "effectiveAt"),
      paidUnits: integer(input.paidUnits, "paidUnits", { min: 1 }),
      createdAt: isoText(input.createdAt, "createdAt")
    };
    return db.transaction(() => deliverScheduledPlanDowngrade(db, row)).immediate();
  }

  function listDueScheduledPlanSwitches(input = {}) {
    assertNoUnsafeFields(input);
    const now = isoText(input.now, "now");
    return listDueScheduledPlanSwitchRows(db, now).map((row) => ({
      switchRef: row.switch_ref,
      accountId: row.account_id,
      toOfferVersionRef: row.to_offer_version_ref,
      effectiveAt: row.effective_at
    }));
  }

  function completeScheduledPlanSwitch(input = {}) {
    assertNoUnsafeFields(input);
    return markScheduledPlanSwitchApplied(db, {
      switchRef: safeControlRef(input.switchRef, "switchRef"),
      accountId: safeControlRef(input.accountId, "accountId"),
      resolvedAt: isoText(input.now, "now")
    });
  }

  function applyCoinCommerceSubscriptionFulfillment(input) {
    assertNoUnsafeFields(input);
    let authority = null;
    if (input.authority !== undefined) {
      const expectedAuthorityFields = [
        "authorityRef",
        "authorityVersion",
        "resourceRequestId",
        "entitlementId",
        "issuedLinkId"
      ];
      if (!sameKeys(input.authority, expectedAuthorityFields)) {
        throw platformError("validation_error", "authority must be an exact snapshot");
      }
      authority = {
        authorityRef: safeAuthorityRef(
          input.authority.authorityRef,
          "authorityRef"
        ),
        authorityVersion: integer(
          input.authority.authorityVersion,
          "authorityVersion",
          { min: 1 }
        ),
        resourceRequestId: safeAuthorityRef(
          input.authority.resourceRequestId,
          "resourceRequestId"
        ),
        entitlementId: safeAuthorityRef(
          input.authority.entitlementId,
          "entitlementId"
        ),
        issuedLinkId: safeAuthorityRef(
          input.authority.issuedLinkId,
          "issuedLinkId"
        )
      };
    }
    const fulfillmentResourceRef = authority
      ? safeAuthorityRef
      : safeControlRef;
    let planSwitch = null;
    if (input.planSwitch !== undefined) {
      const fields = [
        "kind",
        "cancelsSwitchRef",
        "switchRef",
        "expectedPlan",
        "expectedValidFrom",
        "expectedValidUntil"
      ];
      if (!sameKeys(input.planSwitch, fields)) {
        throw platformError("validation_error", "planSwitch must be an exact snapshot");
      }
      const kind = input.planSwitch.kind;
      if (![
        "renewal",
        "upgrade_inplace",
        "upgrade_restart",
        "apply_due"
      ].includes(kind)) {
        throw platformError("validation_error", "planSwitch.kind is invalid");
      }
      const optionalRef = (value, field) => {
        if (value === null) return null;
        return safeControlRef(value, field);
      };
      planSwitch = {
        kind,
        cancelsSwitchRef: optionalRef(
          input.planSwitch.cancelsSwitchRef,
          "cancelsSwitchRef"
        ),
        switchRef: optionalRef(input.planSwitch.switchRef, "switchRef"),
        expectedPlan: safeControlRef(input.planSwitch.expectedPlan, "expectedPlan"),
        expectedValidFrom: isoText(
          input.planSwitch.expectedValidFrom,
          "expectedValidFrom"
        ),
        expectedValidUntil: isoText(
          input.planSwitch.expectedValidUntil,
          "expectedValidUntil"
        )
      };
      if (kind === "apply_due" && !planSwitch.switchRef) {
        throw platformError("validation_error", "planSwitch.switchRef is required");
      }
      if (kind !== "apply_due" && planSwitch.switchRef) {
        throw platformError("validation_error", "planSwitch.switchRef is not allowed");
      }
      if (kind === "apply_due" && planSwitch.cancelsSwitchRef) {
        throw platformError("validation_error", "planSwitch.cancelsSwitchRef is not allowed");
      }
    }
    const record = {
      commandRef: safeControlRef(input.commandRef, "commandRef"),
      orderRef: safeControlRef(input.orderRef, "orderRef"),
      accountId: safeControlRef(input.accountId, "accountId"),
      requestRef: fulfillmentResourceRef(input.requestRef, "requestRef"),
      entitlementRef: fulfillmentResourceRef(
        input.entitlementRef,
        "entitlementRef"
      ),
      issuedLinkRef: fulfillmentResourceRef(
        input.issuedLinkRef,
        "issuedLinkRef"
      ),
      tenantRef: safeControlRef(input.tenantRef, "tenantRef"),
      artifactRef: safeControlRef(input.artifactRef, "artifactRef"),
      offerVersionRef: safeControlRef(input.offerVersionRef, "offerVersionRef"),
      portalPlan: requiredText(input.portalPlan, "portalPlan"),
      durationDays: integer(input.durationDays, "durationDays", { min: 1 }),
      monthlyTrafficGb: integer(input.monthlyTrafficGb, "monthlyTrafficGb", { min: 1 }),
      initialIssuance: input.initialIssuance === true,
      requireExistingEffect: input.requireExistingEffect === true,
      recoveryOnly: input.recoveryOnly === true,
      authority,
      planSwitch,
      now: isoText(input.now, "now")
    };
    if (
      input.initialIssuance !== undefined
      && input.initialIssuance !== true
      && input.initialIssuance !== false
    ) {
      throw platformError("validation_error", "initialIssuance must be boolean");
    }
    if (
      input.requireExistingEffect !== true
      && input.requireExistingEffect !== false
    ) {
      throw platformError("validation_error", "requireExistingEffect must be boolean");
    }
    if (input.recoveryOnly !== true && input.recoveryOnly !== false) {
      throw platformError("validation_error", "recoveryOnly must be boolean");
    }
    if (record.portalPlan !== "monthly" && record.portalPlan !== "yearly") {
      throw platformError("validation_error", "portalPlan must be monthly or yearly");
    }
    const trafficLimitBytes = record.monthlyTrafficGb * (1024 ** 3);
    if (!Number.isSafeInteger(trafficLimitBytes)) {
      throw platformError("validation_error", "trafficLimitBytes is outside the safe integer range");
    }
    const durationMs = record.durationDays * 24 * 60 * 60 * 1000;
    if (!Number.isSafeInteger(durationMs)) {
      throw platformError("validation_error", "durationDays is outside the safe Date range");
    }
    const effectRef = effectRefForCommand(record.commandRef);

    const failDrift = () => {
      throw platformError(
        "coin_commerce_subscription_fulfillment_drift",
        "Coin Commerce subscription fulfillment state is inconsistent"
      );
    };
    const apply = db.transaction(() => {
      const account = getAccount(record.accountId);
      if (!account || account.status !== "active") failDrift();
      if (record.authority) {
        let currentAuthority;
        try {
          currentAuthority = resolveCommerceAuthority({
            accountId: record.accountId,
            expectedAuthorityVersion: record.authority.authorityVersion
          });
        } catch {
          failDrift();
        }
        if (
          currentAuthority?.ok !== true
          || currentAuthority.authorityRef !== record.authority.authorityRef
          || currentAuthority.resourceRequestId
            !== record.authority.resourceRequestId
          || currentAuthority.entitlementId !== record.authority.entitlementId
          || currentAuthority.issuedLinkId !== record.authority.issuedLinkId
          || record.requestRef !== record.authority.resourceRequestId
          || record.entitlementRef !== record.authority.entitlementId
          || record.issuedLinkRef !== record.authority.issuedLinkId
        ) {
          failDrift();
        }
      }
      const serviceEntitlement = record.authority
        ? getEntitlement(record.entitlementRef)
        : resolveAccountServiceEntitlement({
          accountId: record.accountId,
          now: record.now
        });
      if (!serviceEntitlement || serviceEntitlement.id !== record.entitlementRef) {
        failDrift();
      }
      const activeAccessRequests = record.authority
        ? [getPortalAccessRequest(record.requestRef)].filter((request) => (
          request
          && (request.status === "delivered" || request.status === "issued")
          && request.entitlementRef === record.entitlementRef
        ))
        : listPortalAccessRequests({
          portalUserRef: record.accountId
        }).filter((request) => (
          (request.status === "delivered" || request.status === "issued")
          && request.entitlementRef === record.entitlementRef
        ));
      if (activeAccessRequests.length !== 1) failDrift();
      const [accessRequest] = activeAccessRequests;
      if (
        accessRequest.id !== record.requestRef
        || accessRequest.portalUserRef !== record.accountId
        || accessRequest.entitlementRef !== record.entitlementRef
        || !optionalText(accessRequest.tenantId)
        || !optionalText(accessRequest.artifactId)
      ) {
        failDrift();
      }

      const issuanceRequest = getIssuanceRequest(record.requestRef);
      const entitlement = getEntitlement(record.entitlementRef);
      const bindings = listIssuedSubscriptionBindings()
        .filter((binding) => binding.requestId === record.requestRef);
      if (
        !issuanceRequest
        || issuanceRequest.status !== "issued"
        || issuanceRequest.accountId !== record.accountId
        || issuanceRequest.entitlementId !== record.entitlementRef
        || !entitlement
        || entitlement.status !== "active"
        || entitlement.accountId !== record.accountId
        || accessRequest.expiresAt !== entitlement.validUntil
        || accessRequest.validUntil !== entitlement.validUntil
        || bindings.length !== 1
      ) {
        failDrift();
      }
      const [binding] = bindings;
      if (
        binding.id !== record.issuedLinkRef
        || binding.accountId !== record.accountId
        || binding.entitlementId !== record.entitlementRef
        || binding.tenantRef !== record.tenantRef
        || binding.artifactRef !== record.artifactRef
        || record.tenantRef !== `tenantref_${sha256(accessRequest.tenantId).slice(0, 16)}`
        || (record.artifactRef !== `artifactref_${sha256(accessRequest.artifactId).slice(0, 16)}`
          && !verifyPortalSubscriptionLinkResetLineage(db, { requestRef: accessRequest.id, ownerRef: record.accountId,
            tenantId: accessRequest.tenantId, originalArtifactRef: record.artifactRef, currentArtifactId: accessRequest.artifactId }))
      ) {
        failDrift();
      }

      const identityMetadata = {
        version: 1,
        commandRef: record.commandRef,
        orderRef: record.orderRef,
        accountId: record.accountId,
        requestRef: record.requestRef,
        entitlementRef: record.entitlementRef,
        issuedLinkRef: record.issuedLinkRef,
        tenantRef: record.tenantRef,
        artifactRef: record.artifactRef,
        offerVersionRef: record.offerVersionRef,
        portalPlan: record.portalPlan,
        durationDays: record.durationDays,
        monthlyTrafficGb: record.monthlyTrafficGb,
        trafficLimitBytes
      };
      const audit = getAuditEvent(effectRef);
      if (audit) {
        const metadata = audit.metadata;
        if (
          !coinCommerceFulfillmentMetadataShape(metadata)
          || Object.entries(identityMetadata).some(([key, value]) => metadata[key] !== value)
        ) {
          failDrift();
        }
        const liveFulfillment = resolveLiveCoinCommerceFulfillmentEffect({
          accountId: record.accountId,
          entitlement
        });
        const originalEffect = liveFulfillment?.effects.find(
          (candidate) => candidate.id === effectRef
        );
        if (!originalEffect) failDrift();
        return Object.freeze({
          effectRef,
          targetValidUntil: originalEffect.targetValidUntil,
          runtimeTargetValidUntil: liveFulfillment.terminalEffect.targetValidUntil
        });
      }
      const hasExistingFulfillmentHistory = Boolean(db.prepare(`
        select 1
        from platform_audit_events
        where entity_type = 'coin_commerce_subscription_fulfillment'
          and entity_ref = ?
          and action = 'subscription_fulfillment_applied'
          and actor_ref = 'coin_commerce_fulfillment'
        limit 1
      `).get(record.entitlementRef));
      if (
        hasExistingFulfillmentHistory
        && !resolveLiveCoinCommerceFulfillmentEffect({
          accountId: record.accountId,
          entitlement
        })
      ) {
        failDrift();
      }
      if (record.requireExistingEffect) failDrift();
      if (record.recoveryOnly) failDrift();

      const previousValidFrom = isoText(entitlement.validFrom, "validFrom");
      const storedValidUntil = isoText(entitlement.validUntil, "validUntil");
      if (previousValidFrom >= storedValidUntil) failDrift();
      // Confirmation may run after issuance (including after a transient
      // failure). Preserve the original entitlement period, not the retry time.
      const initialIssuedAt = record.initialIssuance
        ? isoText(accessRequest.submittedAt, "submittedAt")
        : null;
      // Keep this deterministic contract aligned with commerceProductRef in
      // the issuer without expanding the immutable database-tool import closure.
      const initialDigest = sha256(record.commandRef);
      const initialRequestRef = `pareq_commerce_${initialDigest}`;
      const expectedInitialTargetMs = Date.parse(initialIssuedAt) + durationMs;
      const expectedInitialTarget = Number.isSafeInteger(expectedInitialTargetMs)
        && Math.abs(expectedInitialTargetMs) <= 8.64e15
        ? new Date(expectedInitialTargetMs).toISOString()
        : null;
      if (
        record.initialIssuance
        && (
          record.requestRef !== initialRequestRef
          || record.entitlementRef !== `ent_commerce_${initialDigest}`
          || record.issuedLinkRef !== `${initialRequestRef}_link_1`
          || accessRequest.accessGrantRef !== `grant_commerce_${initialDigest}`
          || issuanceRequest.approvalRef
            !== `approval_commerce_${sha256(`${record.commandRef}\0${record.orderRef}`)}`
          || issuanceRequest.purpose !== "coin_commerce_product_fulfillment"
          || initialIssuedAt > record.now
          || entitlement.plan !== record.offerVersionRef
          || entitlement.validFrom !== initialIssuedAt
          || entitlement.createdAt !== initialIssuedAt
          || entitlement.trafficLimitBytes !== trafficLimitBytes
          || accessRequest.plan !== record.portalPlan
          || accessRequest.durationDays !== record.durationDays
          || accessRequest.submittedAt !== initialIssuedAt
          || storedValidUntil !== expectedInitialTarget
        )
      ) {
        failDrift();
      }
      let validFrom = entitlement.plan === record.offerVersionRef
        ? previousValidFrom
        : record.now;
      const previousValidUntil = record.initialIssuance
        ? initialIssuedAt
        : storedValidUntil;
      let targetMs = record.initialIssuance
        ? Date.parse(storedValidUntil)
        : Math.max(Date.parse(record.now), Date.parse(storedValidUntil)) + durationMs;
      if (
        !Number.isSafeInteger(targetMs)
        || Math.abs(targetMs) > 8.64e15
      ) {
        throw platformError("validation_error", "durationDays is outside the safe Date range");
      }
      let targetValidUntil = new Date(targetMs).toISOString();
      let switchKind = null;
      if (record.planSwitch) {
        if (
          record.initialIssuance
          || entitlement.plan !== record.planSwitch.expectedPlan
          || previousValidFrom !== record.planSwitch.expectedValidFrom
          || storedValidUntil !== record.planSwitch.expectedValidUntil
        ) {
          failDrift();
        }
        if (record.planSwitch.kind === "apply_due") {
          // Confirmation reserves a scheduled switch's credit before its
          // cancellation window ends. Check under this same BEGIN IMMEDIATE
          // lock, not in the earlier due-list snapshot: another worker may
          // have confirmed/captured a consumer since that snapshot was read.
          // A released, correctly bound hold is the only proof that a confirmed
          // consumer no longer owns the credit. Expiry alone is not a release,
          // and captured/reconciliation work must retain its recovery path.
          const reservedCredit = db.prepare(`
            select 1
              from platform_coin_commerce_plan_switch_quotes q
              join platform_coin_commerce_orders o on o.quote_ref = q.quote_ref
              left join platform_coin_holds h on h.hold_ref = o.hold_ref
              left join platform_coin_wallets w on w.wallet_ref = h.wallet_ref
             where q.cancels_switch_ref = ?
               and (h.hold_ref is null or w.account_id is null or h.status <> 'released'
                 or w.account_id <> o.account_id or h.amount_units <> o.amount_units
                 or h.purpose <> 'product_purchase' or h.purpose_ref <> o.order_ref)
             limit 1
          `).get(record.planSwitch.switchRef);
          if (reservedCredit) {
            throw platformError(
              "coin_commerce_subscription_fulfillment_pending",
              "Confirmed plan switch credit must settle before due application"
            );
          }
        }
        if (record.planSwitch.kind === "upgrade_inplace") {
          validFrom = previousValidFrom;
          targetValidUntil = storedValidUntil;
          switchKind = "upgrade_inplace";
        } else if (record.planSwitch.kind === "upgrade_restart") {
          validFrom = previousValidFrom;
          targetMs = Date.parse(record.now) + durationMs;
          if (!Number.isSafeInteger(targetMs) || Math.abs(targetMs) > 8.64e15) {
            throw platformError("validation_error", "durationDays is outside the safe Date range");
          }
          targetValidUntil = new Date(targetMs).toISOString();
          if (targetValidUntil <= storedValidUntil) failDrift();
          switchKind = "upgrade_restart";
        }
      }
      const metadata = {
        ...identityMetadata,
        validFrom,
        previousValidUntil,
        targetValidUntil,
        ...(switchKind ? { switchKind } : {})
      };

      const entitlementUpdate = db.prepare(`
        update platform_entitlements
        set plan = ?, valid_from = ?, valid_until = ?,
            traffic_limit_bytes = ?, updated_at = ?
        where id = ? and account_id = ? and status = 'active'
          and plan = ? and valid_from = ? and valid_until = ?
          and traffic_limit_bytes = ?
      `).run(
        record.offerVersionRef,
        validFrom,
        targetValidUntil,
        trafficLimitBytes,
        record.now,
        record.entitlementRef,
        record.accountId,
        entitlement.plan,
        entitlement.validFrom,
        entitlement.validUntil,
        entitlement.trafficLimitBytes
      );
      if (entitlementUpdate.changes !== 1) failDrift();

      const requestUpdate = db.prepare(`
        update platform_portal_access_requests
        set plan = ?, duration_days = ?, expires_at = ?, valid_until = ?,
            updated_at = ?
        where id = ? and portal_user_ref = ?
          and status in ('delivered', 'issued')
          and entitlement_ref = ? and tenant_id = ? and artifact_id = ?
          and plan = ? and duration_days = ?
          and expires_at = ? and valid_until = ?
      `).run(
        record.portalPlan,
        record.durationDays,
        targetValidUntil,
        targetValidUntil,
        record.now,
        record.requestRef,
        record.accountId,
        record.entitlementRef,
        accessRequest.tenantId,
        accessRequest.artifactId,
        accessRequest.plan,
        accessRequest.durationDays,
        accessRequest.expiresAt,
        accessRequest.validUntil
      );
      if (requestUpdate.changes !== 1) failDrift();
      if (record.planSwitch?.cancelsSwitchRef) {
        if (!supersedeScheduledPlanSwitch(db, {
          switchRef: record.planSwitch.cancelsSwitchRef,
          accountId: record.accountId,
          supersededByOrderRef: record.orderRef,
          resolvedAt: record.now
        })) {
          failDrift();
        }
      }
      if (record.planSwitch?.kind === "apply_due") {
        if (!markScheduledPlanSwitchApplying(db, {
          switchRef: record.planSwitch.switchRef,
          accountId: record.accountId
        })) {
          failDrift();
        }
      }

      recordAuditEvent({
        id: effectRef,
        entityType: "coin_commerce_subscription_fulfillment",
        entityRef: record.entitlementRef,
        action: "subscription_fulfillment_applied",
        actorRef: "coin_commerce_fulfillment",
        createdAt: record.now,
        metadata
      });
      return Object.freeze({
        effectRef,
        targetValidUntil,
        runtimeTargetValidUntil: targetValidUntil
      });
    });

    return apply.immediate();
  }

  function createIssuanceRequest(input) {
    assertNoUnsafeFields(input);
    const record = {
      id: requiredText(input.id, "id"),
      accountId: requiredText(input.accountId, "accountId"),
      entitlementId: requiredText(input.entitlementId, "entitlementId"),
      approvalRef: requiredText(input.approvalRef, "approvalRef"),
      status: requiredText(input.status || "planned", "status"),
      quantity: integer(input.quantity ?? 1, "quantity", { min: 1 }),
      nodeId: requiredText(input.nodeId, "nodeId"),
      purpose: requiredText(input.purpose, "purpose"),
      requestedByRef: requiredText(input.requestedByRef, "requestedByRef"),
      createdAt: isoText(input.createdAt, "createdAt"),
      updatedAt: isoText(input.updatedAt, "updatedAt"),
      metadataJson: jsonObject(input.metadata, "metadata")
    };
    sqliteRun(db.prepare(`
      insert into platform_issuance_requests (
        id, account_id, entitlement_id, approval_ref, status, quantity, node_id,
        purpose, requested_by_ref, created_at, updated_at, metadata_json
      ) values (
        @id, @accountId, @entitlementId, @approvalRef, @status, @quantity, @nodeId,
        @purpose, @requestedByRef, @createdAt, @updatedAt, @metadataJson
      )
    `), record);
    return getIssuanceRequest(record.id);
  }

  function getIssuanceRequest(id) {
    return mapIssuanceRequest(db.prepare("select * from platform_issuance_requests where id = ?").get(requiredText(id, "id")));
  }

  function setIssuanceRequestStatus(id, { status, updatedAt }) {
    assertNoUnsafeFields({ status, updatedAt });
    const result = db.prepare(`
      update platform_issuance_requests
      set status = ?, updated_at = ?
      where id = ?
    `).run(requiredText(status, "status"), isoText(updatedAt, "updatedAt"), requiredText(id, "id"));
    if (result.changes !== 1) {
      throw platformError("not_found", "issuance request not found");
    }
    return getIssuanceRequest(id);
  }

  function linkIssuedSubscription(input) {
    assertNoUnsafeFields(input);
    const record = {
      id: requiredText(input.id, "id"),
      requestId: requiredText(input.requestId, "requestId"),
      tenantRef: requiredText(input.tenantRef, "tenantRef"),
      artifactRef: requiredText(input.artifactRef, "artifactRef"),
      status: requiredText(input.status || "active", "status"),
      createdAt: isoText(input.createdAt, "createdAt"),
      updatedAt: isoText(input.updatedAt, "updatedAt")
    };
    sqliteRun(db.prepare(`
      insert into platform_issued_subscription_links (
        id, request_id, tenant_ref, artifact_ref, status, created_at, updated_at
      ) values (
        @id, @requestId, @tenantRef, @artifactRef, @status, @createdAt, @updatedAt
      )
    `), record);
    return getIssuedLink(record.id);
  }

  function getIssuedLink(id) {
    return mapIssuedLink(db.prepare("select * from platform_issued_subscription_links where id = ?").get(requiredText(id, "id")));
  }

  function setIssuedLinkStatus(id, { status, updatedAt }) {
    assertNoUnsafeFields({ status, updatedAt });
    const result = db.prepare(`
      update platform_issued_subscription_links
      set status = ?, updated_at = ?
      where id = ?
    `).run(requiredText(status, "status"), isoText(updatedAt, "updatedAt"), requiredText(id, "id"));
    if (result.changes !== 1) {
      throw platformError("not_found", "issued link not found");
    }
    return getIssuedLink(id);
  }

  function listIssuedSubscriptionBindings(filters = {}) {
    assertNoUnsafeFields(filters);
    const clauses = [
      "l.status = 'active'",
      "r.status = 'issued'",
      "e.status = 'active'"
    ];
    const params = [];
    const accountId = optionalText(filters.accountId);
    const nodeId = optionalText(filters.nodeId);
    const tenantRef = optionalText(filters.tenantRef);
    if (accountId) {
      clauses.push("r.account_id = ?");
      params.push(accountId);
    }
    if (nodeId) {
      clauses.push("r.node_id = ?");
      params.push(nodeId);
    }
    if (tenantRef) {
      clauses.push("l.tenant_ref = ?");
      params.push(tenantRef);
    }

    return db.prepare(`
      select
        l.id as link_id,
        l.request_id,
        l.tenant_ref,
        l.artifact_ref,
        l.status as link_status,
        l.created_at as link_created_at,
        l.updated_at as link_updated_at,
        r.account_id,
        r.entitlement_id,
        r.status as request_status,
        r.node_id,
        e.plan,
        e.status as entitlement_status,
        e.valid_from,
        e.valid_until,
        e.traffic_limit_bytes
      from platform_issued_subscription_links l
      join platform_issuance_requests r on r.id = l.request_id
      join platform_entitlements e on e.id = r.entitlement_id
      where ${clauses.join(" and ")}
      order by l.created_at asc, l.id asc
    `).all(...params).map(mapIssuedSubscriptionBinding);
  }

  function findIssuedSubscriptionBindingByTenantRef(tenantRef) {
    const [binding] = listIssuedSubscriptionBindings({
      tenantRef: requiredText(tenantRef, "tenantRef")
    }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id));
    return binding || null;
  }

  function findIssuedSubscriptionBindingByEdgeCredentialRef(edgeCredentialRef) {
    const safeEdgeCredentialRef = requiredText(edgeCredentialRef, "edgeCredentialRef");
    const packRows = db.prepare(`
      select
        l.id as link_id, l.request_id, l.tenant_ref, l.artifact_ref,
        l.status as link_status, l.created_at as link_created_at,
        l.updated_at as link_updated_at, r.account_id, r.entitlement_id,
        r.status as request_status, c.edge_channel_ref as node_id,
        e.plan, e.status as entitlement_status, e.valid_from, e.valid_until,
        e.traffic_limit_bytes, c.edge_credential_ref,
        c.edge_material_digest, null as portal_user_ref
      from platform_data_pack_edge_credentials c
      join platform_issuance_requests r on r.id = c.request_ref
      join platform_entitlements e on e.id = r.entitlement_id
      join platform_issued_subscription_links l on l.request_id = r.id
      where c.edge_credential_ref = ? and c.status = 'active'
        and c.entitlement_ref = e.id
        and r.purpose = 'coin_commerce_data_pack_fulfillment'
        and r.status = 'issued' and e.status = 'active' and l.status = 'active'
      limit 2
    `).all(safeEdgeCredentialRef);
    if (packRows.length > 1 || (packRows.length === 1 && (
      packRows[0].node_id !== getIssuanceRequest(packRows[0].request_id)?.nodeId
      || lifetimeDataPackQuotaBytesFor(packRows[0]) !== packRows[0].traffic_limit_bytes
      || packRows[0].valid_until !== DATA_PACK_TECHNICAL_VALID_UNTIL
      || !/^sha256:[a-f0-9]{64}$/.test(packRows[0].edge_material_digest)
    ))) {
      throw platformError("reconciliation_required", "data pack edge binding drifted");
    }
    const packBinding = mapUsageBinding(packRows[0]);
    const durableCredential = mapUsageBinding(db.prepare(`
      select
        l.id as link_id,
        l.request_id,
        l.tenant_ref,
        l.artifact_ref,
        l.status as link_status,
        l.created_at as link_created_at,
        l.updated_at as link_updated_at,
        r.account_id,
        r.entitlement_id,
        r.status as request_status,
        c.edge_channel_ref as node_id,
        e.plan,
        e.status as entitlement_status,
        e.valid_from,
        e.valid_until,
        e.traffic_limit_bytes,
        c.edge_credential_ref,
        p.portal_user_ref
      from platform_issued_subscription_links l
      join platform_issuance_requests r on r.id = l.request_id
      join platform_entitlements e on e.id = r.entitlement_id
      join platform_portal_edge_credentials c on c.request_id = r.id
      left join platform_portal_access_requests p on p.id = r.id
      where l.status = 'active'
        and r.status = 'issued'
        and e.status = 'active'
        and r.purpose <> 'coin_commerce_data_pack_fulfillment'
        and c.edge_credential_ref = ?
      order by l.created_at desc, c.ordinal asc, l.id desc
      limit 1
    `).get(safeEdgeCredentialRef));
    if (durableCredential && packBinding) {
      throw platformError("reconciliation_required", "edge credential lineage is ambiguous");
    }
    if (durableCredential) {
      return durableCredential;
    }

    const direct = mapUsageBinding(db.prepare(`
      select
        l.id as link_id,
        l.request_id,
        l.tenant_ref,
        l.artifact_ref,
        l.status as link_status,
        l.created_at as link_created_at,
        l.updated_at as link_updated_at,
        r.account_id,
        r.entitlement_id,
        r.status as request_status,
        r.node_id,
        e.plan,
        e.status as entitlement_status,
        e.valid_from,
        e.valid_until,
        e.traffic_limit_bytes,
        p.edge_credential_ref,
        p.portal_user_ref
      from platform_issued_subscription_links l
      join platform_issuance_requests r on r.id = l.request_id
      join platform_entitlements e on e.id = r.entitlement_id
      left join platform_portal_access_requests p on p.id = r.id
      where l.status = 'active'
        and r.status = 'issued'
        and e.status = 'active'
        and r.purpose <> 'coin_commerce_data_pack_fulfillment'
        and coalesce(p.edge_credential_ref, 'edgecred_' || r.id) = ?
      order by l.created_at desc, l.id desc
      limit 1
    `).get(safeEdgeCredentialRef));
    if (direct && packBinding) {
      throw platformError("reconciliation_required", "edge credential lineage is ambiguous");
    }
    if (direct) {
      return direct;
    }

    const derivedRows = db.prepare(`
      select
        l.id as link_id,
        l.request_id,
        l.tenant_ref,
        l.artifact_ref,
        l.status as link_status,
        l.created_at as link_created_at,
        l.updated_at as link_updated_at,
        r.account_id,
        r.entitlement_id,
        r.status as request_status,
        r.node_id,
        e.plan,
        e.status as entitlement_status,
        e.valid_from,
        e.valid_until,
        e.traffic_limit_bytes,
        p.edge_credential_ref,
        p.portal_user_ref
      from platform_issued_subscription_links l
      join platform_issuance_requests r on r.id = l.request_id
      join platform_entitlements e on e.id = r.entitlement_id
      left join platform_portal_access_requests p on p.id = r.id
      where l.status = 'active'
        and r.status = 'issued'
        and e.status = 'active'
        and r.purpose <> 'coin_commerce_data_pack_fulfillment'
      order by l.created_at desc, l.id desc
    `).all();

    for (const row of derivedRows) {
      const prefix = `edgecred_${row.request_id}_`;
      if (!safeEdgeCredentialRef.startsWith(prefix)) {
        continue;
      }
      const channelRef = safeEdgeCredentialRef.slice(prefix.length);
      if (!channelRef) {
        continue;
      }
      const explicitCredentials = db.prepare(`
        select edge_channel_ref, edge_credential_ref
        from platform_portal_edge_credentials
        where request_id = ?
        order by ordinal asc, edge_channel_ref asc
      `).all(row.request_id);
      const onlyLegacyDirectCredential = explicitCredentials.length === 1
        && explicitCredentials[0]?.edge_credential_ref === row.edge_credential_ref;
      const explicitChannelRefs = new Set(explicitCredentials
        .map((credential) => credential.edge_channel_ref)
        .filter(Boolean));
      if (explicitCredentials.length > 0 && !onlyLegacyDirectCredential && !explicitChannelRefs.has(channelRef)) {
        continue;
      }
      if (packBinding) {
        throw platformError("reconciliation_required", "edge credential lineage is ambiguous");
      }
      return mapUsageBinding({
        ...row,
        node_id: channelRef,
        edge_credential_ref: safeEdgeCredentialRef
      });
    }
    return packBinding;
  }

  function findUsageBindingByTenantRef(tenantRef) {
    return mapUsageBinding(db.prepare(`
      select
        l.id as link_id,
        l.request_id,
        l.tenant_ref,
        l.artifact_ref,
        l.status as link_status,
        l.created_at as link_created_at,
        l.updated_at as link_updated_at,
        r.account_id,
        r.entitlement_id,
        r.status as request_status,
        r.node_id,
        e.plan,
        e.status as entitlement_status,
        e.valid_from,
        e.valid_until,
        e.traffic_limit_bytes,
        p.edge_credential_ref,
        p.portal_user_ref
      from platform_issued_subscription_links l
      join platform_issuance_requests r on r.id = l.request_id
      join platform_entitlements e on e.id = r.entitlement_id
      left join platform_portal_access_requests p on p.id = r.id
      where l.status = 'active'
        and r.status = 'issued'
        and e.status = 'active'
        and l.tenant_ref = ?
      order by l.created_at desc, l.id desc
      limit 1
    `).get(requiredText(tenantRef, "tenantRef")));
  }

  // Unlike a usage lookup, legacy distribution must distinguish missing history
  // from withdrawn or broken history. Never filter inactive rows out in SQL:
  // doing so would turn a revoked binding into an unbound fallback candidate.
  function getThirdPartySubscriptionEligibilityByTenantRefs(tenantRefs, { at = new Date().toISOString() } = {}) {
    if (!Array.isArray(tenantRefs) || tenantRefs.length < 1 || tenantRefs.length > 2
      || tenantRefs.some(ref => typeof ref !== "string" || !ref.trim() || ref.length > 512)) {
      throw platformError("validation_error", "one or two tenant references are required");
    }
    const refs = [...new Set(tenantRefs.map(ref => ref.trim()))];
    const atMs = Date.parse(isoText(at, "at"));
    const placeholders = refs.map(() => "?").join(", ");
    // The read-only transaction gives both alias forms and the portal-history
    // guard a single snapshot. Query errors intentionally propagate to callers.
    return db.transaction(() => {
      const rows = db.prepare(`
        select l.id, l.tenant_ref, l.status as link_status,
          r.account_id, r.entitlement_id, r.status as request_status,
          e.account_id as entitlement_account_id, e.status as entitlement_status,
          e.plan, e.traffic_limit_bytes, e.valid_from, e.valid_until,
          a.status as account_status, p.status as portal_status
        from platform_issued_subscription_links l
        left join platform_issuance_requests r on r.id = l.request_id
        left join platform_entitlements e on e.id = r.entitlement_id
        left join platform_accounts a on a.id = r.account_id
        left join platform_portal_access_requests p on p.id = r.id
        where l.tenant_ref in (${placeholders})
        order by l.created_at desc, l.id desc
      `).all(...refs);
      if (!rows.length) {
        const portalHistory = db.prepare(`
          select 1 as present from platform_portal_access_requests
          where tenant_id in (${placeholders}) limit 1
        `).get(...refs);
        return { state: portalHistory ? "denied" : "unbound" };
      }
      function valid(row) {
        const fromMs = Date.parse(row.valid_from);
        const untilMs = Date.parse(row.valid_until);
        return row.link_status === "active" && row.request_status === "issued"
          && row.entitlement_status === "active" && row.account_status === "active"
          && row.account_id === row.entitlement_account_id
          && (row.portal_status == null || ["delivered", "issued"].includes(row.portal_status))
          && Number.isFinite(fromMs) && Number.isFinite(untilMs)
          && fromMs <= atMs && atMs < untilMs;
      }
      const latest = new Map();
      for (const row of rows) {
        if (!latest.has(row.tenant_ref)) latest.set(row.tenant_ref, row);
      }
      if ([...latest.values()].some(row => !valid(row))) return { state: "denied" };
      const binding = latest.values().next().value;
      // An older rotated link may legitimately coexist with its replacement.
      // Concurrent live bindings must not silently pick a different owner/tier.
      if (rows.some(row => valid(row) && (row.account_id !== binding.account_id
        || row.entitlement_id !== binding.entitlement_id))) return { state: "denied" };
      return { state: "bound", binding: {
        plan: binding.plan,
        trafficLimitBytes: binding.traffic_limit_bytes,
        validFrom: binding.valid_from,
        validUntil: binding.valid_until
      } };
    })();
  }

  function getUsageSampleByDigest(sampleDigest) {
    return mapUsageSample(db.prepare(`
      select * from platform_usage_samples
      where sample_digest = ?
    `).get(requiredText(sampleDigest, "sampleDigest")));
  }

  function getUsageRollupByEdgeCredentialRef(edgeCredentialRef) {
    return mapUsageRollup(db.prepare(`
      select * from platform_usage_rollups
      where edge_credential_ref = ?
    `).get(requiredText(edgeCredentialRef, "edgeCredentialRef")));
  }

  function getUsageCounterCursor({ sourceRef, channelRef, edgeCredentialRef } = {}) {
    return mapUsageCounterCursor(db.prepare(`
      select * from platform_usage_counter_cursors
      where source_ref = ? and channel_ref = ? and edge_credential_ref = ?
    `).get(
      requiredText(sourceRef, "sourceRef"),
      requiredText(channelRef, "channelRef"),
      requiredText(edgeCredentialRef, "edgeCredentialRef")
    ));
  }

  function listUsageRollupsByRequestId(requestId) {
    return db.prepare(`
      select * from platform_usage_rollups
      where request_id = ?
      order by updated_at asc, edge_credential_ref asc
    `).all(requiredText(requestId, "requestId")).map(mapUsageRollup);
  }

  function listUsageSamples(filters = {}) {
    const clauses = [];
    const params = [];
    const edgeCredentialRef = optionalText(filters.edgeCredentialRef);
    const accountId = optionalText(filters.accountId);
    const entitlementId = optionalText(filters.entitlementId);
    const requestId = optionalText(filters.requestId);
    const observedFrom = optionalIsoText(filters.observedFrom, "observedFrom");
    const observedTo = optionalIsoText(filters.observedTo, "observedTo");
    if (edgeCredentialRef) {
      clauses.push("edge_credential_ref = ?");
      params.push(edgeCredentialRef);
    }
    if (requestId) {
      clauses.push("request_id = ?");
      params.push(requestId);
    }
    if (accountId) {
      clauses.push("account_id = ?");
      params.push(accountId);
    }
    if (entitlementId) {
      clauses.push("entitlement_id = ?");
      params.push(entitlementId);
    }
    if (observedFrom) {
      clauses.push("observed_at >= ?");
      params.push(observedFrom);
    }
    if (observedTo) {
      clauses.push("observed_at < ?");
      params.push(observedTo);
    }
    const where = clauses.length ? `where ${clauses.join(" and ")}` : "";
    return db.prepare(`
      select * from platform_usage_samples
      ${where}
      order by observed_at asc, id asc
    `).all(...params).map(mapUsageSample);
  }

  function mapDataPackResource(row) {
    if (!row) return null;
    return Object.freeze({
      orderRef: row.order_ref,
      commandRef: row.command_ref,
      accountId: row.account_id,
      requestRef: row.request_ref,
      entitlementRef: row.entitlement_ref,
      offerVersionRef: row.offer_version_ref,
      quotaBytes: row.quota_bytes,
      technicalValidUntil: row.technical_valid_until,
      commercialNeverExpires: row.commercial_never_expires === 1,
      createdAt: row.created_at
    });
  }

  // Reservation follows a captured Commerce claim. It persists safe control
  // references only; runtime identity and handoff material are not created.
  // The order determines both IDs, so replay cannot allocate another quota.
  function reserveCoinCommerceDataPackIssuance(input = {}) {
    exactObject(input, {
      allowed: ["commandRef", "orderRef", "accountId", "offerVersionRef",
        "quotaBytes", "nodeId", "now"],
      name: "dataPackIssuanceReservation"
    });
    const commandRef = safeControlRef(input.commandRef, "commandRef");
    const orderRef = safeControlRef(input.orderRef, "orderRef");
    const accountId = safeControlRef(input.accountId, "accountId");
    const offerVersionRef = safeControlRef(input.offerVersionRef, "offerVersionRef");
    const nodeId = safeControlRef(input.nodeId, "nodeId");
    const now = isoText(input.now, "now");
    const quotaBytes = lifetimeDataPackQuotaBytesFor({ plan: offerVersionRef });
    if (quotaBytes === null || input.quotaBytes !== quotaBytes
      || now >= DATA_PACK_TECHNICAL_VALID_UNTIL) {
      throw platformError("validation_error", "data pack issuance terms are invalid");
    }
    const digest = sha256(orderRef);
    const requestRef = `pareq_pack_${digest}`;
    const entitlementRef = `ent_pack_${digest}`;
    const approvalRef = `approval_pack_${digest}`;
    const metadata = {
      version: 1, kind: "data_pack", commandRef, orderRef,
      offerVersionRef, quotaBytes, nodeId, commercialNeverExpires: true,
      technicalValidUntil: DATA_PACK_TECHNICAL_VALID_UNTIL
    };
    return db.transaction(() => {
      const account = getAccount(accountId);
      if (!account || account.status !== "active") {
        throw platformError("not_found", "data pack account not available");
      }
      let entitlement = getEntitlement(entitlementRef);
      let request = getIssuanceRequest(requestRef);
      if (entitlement || request) {
        if (!entitlement || !request
          || entitlement.accountId !== accountId
          || entitlement.plan !== offerVersionRef
          || entitlement.status !== "active"
          || entitlement.validFrom !== request.createdAt
          || entitlement.validUntil !== DATA_PACK_TECHNICAL_VALID_UNTIL
          || entitlement.maxArtifacts !== 1 || entitlement.maxDevices !== 1
          || entitlement.trafficLimitBytes !== quotaBytes
          || request.accountId !== accountId
          || request.entitlementId !== entitlementRef
          || request.approvalRef !== approvalRef
          || !["planned", "issued"].includes(request.status)
          || request.quantity !== 1 || request.nodeId !== nodeId
          || request.purpose !== "coin_commerce_data_pack_fulfillment"
          || request.requestedByRef !== "coin_commerce_fulfillment"
          || JSON.stringify(request.metadata) !== JSON.stringify(metadata)) {
          throw platformError("reconciliation_required", "data pack issuance reservation drifted");
        }
      } else {
        createEntitlement({
          id: entitlementRef, accountId, plan: offerVersionRef,
          status: "active", validFrom: now,
          validUntil: DATA_PACK_TECHNICAL_VALID_UNTIL,
          maxArtifacts: 1, maxDevices: 1, trafficLimitBytes: quotaBytes,
          createdAt: now, updatedAt: now
        });
        request = createIssuanceRequest({
          id: requestRef, accountId, entitlementId: entitlementRef,
          approvalRef, status: "planned", quantity: 1, nodeId,
          purpose: "coin_commerce_data_pack_fulfillment",
          requestedByRef: "coin_commerce_fulfillment",
          createdAt: now, updatedAt: now, metadata
        });
      }
      return Object.freeze({
        commandRef, orderRef, requestRef, entitlementRef,
        status: request.status, reservedAt: request.createdAt
      });
    }).immediate();
  }

  // Finalize the control half after the runtime tenant, artifact and their
  // material bindings have been independently verified by the issuer. A
  // partial control write rolls back; replay cannot swap runtime identity.
  function completeCoinCommerceDataPackIssuance(input = {}) {
    exactObject(input, {
      allowed: ["commandRef", "orderRef", "accountId", "requestRef",
        "entitlementRef", "nodeId", "tenantRef", "artifactRef", "now"],
      name: "dataPackIssuanceFinalization"
    });
    const commandRef = safeControlRef(input.commandRef, "commandRef");
    const orderRef = safeControlRef(input.orderRef, "orderRef");
    const accountId = safeControlRef(input.accountId, "accountId");
    const requestRef = safeControlRef(input.requestRef, "requestRef");
    const entitlementRef = safeControlRef(input.entitlementRef, "entitlementRef");
    const nodeId = safeControlRef(input.nodeId, "nodeId");
    const tenantRef = safeControlRef(input.tenantRef, "tenantRef");
    const artifactRef = safeControlRef(input.artifactRef, "artifactRef");
    const now = isoText(input.now, "now");
    const digest = sha256(orderRef);
    const issuedLinkRef = `${requestRef}_link_1`;
    return db.transaction(() => {
      const request = getIssuanceRequest(requestRef);
      const entitlement = getEntitlement(entitlementRef);
      const existingLink = getIssuedLink(issuedLinkRef);
      const expectedMetadata = request && entitlement ? {
        version: 1, kind: "data_pack", commandRef, orderRef,
        offerVersionRef: entitlement.plan,
        quotaBytes: entitlement.trafficLimitBytes,
        nodeId, commercialNeverExpires: true,
        technicalValidUntil: DATA_PACK_TECHNICAL_VALID_UNTIL
      } : null;
      if (requestRef !== `pareq_pack_${digest}`
        || entitlementRef !== `ent_pack_${digest}`
        || !request || !entitlement
        || request.accountId !== accountId
        || request.entitlementId !== entitlementRef
        || request.approvalRef !== `approval_pack_${digest}`
        || request.purpose !== "coin_commerce_data_pack_fulfillment"
        || request.requestedByRef !== "coin_commerce_fulfillment"
        || request.quantity !== 1
        || request.nodeId !== nodeId
        || JSON.stringify(request.metadata) !== JSON.stringify(expectedMetadata)
        || entitlement.accountId !== accountId
        || entitlement.status !== "active"
        || entitlement.validFrom !== request.createdAt
        || entitlement.validUntil !== DATA_PACK_TECHNICAL_VALID_UNTIL
        || lifetimeDataPackQuotaBytesFor(entitlement) !== entitlement.trafficLimitBytes
        || entitlement.maxArtifacts !== 1 || entitlement.maxDevices !== 1
        || now < request.createdAt
        || !["planned", "issued"].includes(request.status)) {
        throw platformError("reconciliation_required", "data pack issuance state drifted");
      }
      if (request.status === "planned") {
        if (existingLink || db.prepare(`
          select 1 from platform_issued_subscription_links where request_id = ? limit 1
        `).get(requestRef)) {
          throw platformError("reconciliation_required", "data pack issuance link drifted");
        }
        linkIssuedSubscription({
          id: issuedLinkRef, requestId: requestRef,
          tenantRef, artifactRef, status: "active",
          createdAt: now, updatedAt: now
        });
        setIssuanceRequestStatus(requestRef, { status: "issued", updatedAt: now });
      } else if (!existingLink
        || existingLink.requestId !== requestRef
        || existingLink.tenantRef !== tenantRef
        || existingLink.artifactRef !== artifactRef
        || !["active", "rotated"].includes(existingLink.status)) {
        throw platformError("reconciliation_required", "data pack issued link drifted");
      }
      return Object.freeze({
        commandRef, orderRef, requestRef, entitlementRef,
        issuedLinkRef, status: "issued"
      });
    }).immediate();
  }

  function mapDataPackArtifactRotation(row) {
    return row ? Object.freeze({
      rotationRef: row.rotation_ref, orderRef: row.order_ref,
      accountId: row.account_id, linkRef: row.link_ref,
      oldArtifactRef: row.old_artifact_ref,
      replacementArtifactRef: row.replacement_artifact_ref,
      attempt: row.attempt,
      status: row.status,
      leaseRef: row.lease_ref,
      leaseUntil: row.lease_until
    }) : null;
  }

  // A short durable lease excludes a second process while runtime and escrow
  // effects occur outside SQLite. An interrupted worker may be taken over only
  // after expiry, using the same replayable intent and deterministic artifact.
  function claimCoinCommerceDataPackArtifactRotation(input = {}) {
    exactObject(input, { allowed: ["rotationRef", "orderRef", "accountId", "leaseRef", "now"],
      required: ["rotationRef", "orderRef", "accountId", "leaseRef", "now"],
      name: "dataPackArtifactRotationClaim" });
    const rotationRef = safeControlRef(input.rotationRef, "rotationRef");
    const orderRef = safeControlRef(input.orderRef, "orderRef");
    const accountId = safeControlRef(input.accountId, "accountId");
    const leaseRef = safeControlRef(input.leaseRef, "leaseRef");
    const now = isoText(input.now, "now");
    const leaseUntil = new Date(Date.parse(now) + 5 * 60_000).toISOString();
    return db.transaction(() => {
      const changed = db.prepare(`
        update platform_data_pack_artifact_rotations
        set lease_ref = ?, lease_until = ?, updated_at = ?
        where rotation_ref = ? and order_ref = ? and account_id = ?
          and (lease_ref is null or lease_until <= ?)
      `).run(leaseRef, leaseUntil, now, rotationRef, orderRef, accountId, now);
      if (changed.changes !== 1) {
        throw platformError("reconciliation_required", "data pack rotation lease held");
      }
      return mapDataPackArtifactRotation(db.prepare(`
        select * from platform_data_pack_artifact_rotations where rotation_ref = ?
      `).get(rotationRef));
    }).immediate();
  }

  function releaseCoinCommerceDataPackArtifactRotation(input = {}) {
    exactObject(input, { allowed: ["rotationRef", "orderRef", "accountId", "leaseRef"],
      required: ["rotationRef", "orderRef", "accountId", "leaseRef"],
      name: "dataPackArtifactRotationRelease" });
    const rotationRef = safeControlRef(input.rotationRef, "rotationRef");
    const orderRef = safeControlRef(input.orderRef, "orderRef");
    const accountId = safeControlRef(input.accountId, "accountId");
    const leaseRef = safeControlRef(input.leaseRef, "leaseRef");
    const changed = db.prepare(`
      update platform_data_pack_artifact_rotations
      set lease_ref = null, lease_until = null
      where rotation_ref = ? and order_ref = ? and account_id = ? and lease_ref = ?
    `).run(rotationRef, orderRef, accountId, leaseRef);
    if (changed.changes !== 1) {
      throw platformError("reconciliation_required", "data pack rotation lease changed");
    }
  }

  function listPendingCoinCommerceDataPackArtifactRotations(input = {}) {
    exactObject(input, { allowed: ["limit", "now"], required: ["limit", "now"],
      name: "dataPackArtifactRotationPending" });
    if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 20) {
      throw platformError("validation_error", "invalid data pack rotation recovery limit");
    }
    const now = isoText(input.now, "now");
    return Object.freeze(db.prepare(`
      select account_id, order_ref, rotation_ref
      from platform_data_pack_artifact_rotations
      where status != 'complete' and (lease_ref is null or lease_until <= ?)
      order by created_at, rotation_ref limit ?
    `).all(now, input.limit).map((row) => Object.freeze({
      accountId: row.account_id, orderRef: row.order_ref, rotationRef: row.rotation_ref
    })));
  }

  // The control DB owns the durable intent. Runtime artifact creation and
  // protected material capture occur outside this transaction; each stage is
  // replayable and no stage touches usage or the purchased quota.
  function beginCoinCommerceDataPackArtifactRotation(input = {}) {
    exactObject(input, { allowed: ["rotationRef", "orderRef", "accountId", "now"],
      name: "dataPackArtifactRotation" });
    const rotationRef = safeControlRef(input.rotationRef, "rotationRef");
    const orderRef = safeControlRef(input.orderRef, "orderRef");
    const accountId = safeControlRef(input.accountId, "accountId");
    const now = isoText(input.now, "now");
    return db.transaction(() => {
      const existing = mapDataPackArtifactRotation(db.prepare(`
        select * from platform_data_pack_artifact_rotations where rotation_ref = ?
      `).get(rotationRef));
      if (existing) {
        if (existing.orderRef !== orderRef || existing.accountId !== accountId) {
          throw platformError("reconciliation_required", "data pack rotation scope drifted");
        }
        return existing;
      }
      const pendingCredentialReset = db.prepare(`
        select rotation_ref, status from platform_data_pack_credential_resets
        where order_ref = ? and status != 'complete' limit 1
      `).get(orderRef);
      if (pendingCredentialReset
        && (pendingCredentialReset.rotation_ref !== rotationRef
          || pendingCredentialReset.status !== "edge_applied")) {
        throw platformError("reconciliation_required", "data pack credential reset is pending");
      }
      const resource = db.prepare(`
        select * from platform_data_pack_resources
        where order_ref = ? and account_id = ?
      `).get(orderRef, accountId);
      if (!resource) throw platformError("reconciliation_required", "data pack rotation scope unavailable");
      const links = listIssuedSubscriptionBindings({ accountId })
        .filter((link) => link.requestId === resource.request_ref);
      if (links.length !== 1 || links[0].entitlementId !== resource.entitlement_ref) {
        throw platformError("reconciliation_required", "data pack rotation link drifted");
      }
      const pending = db.prepare(`
        select 1 from platform_data_pack_artifact_rotations
        where order_ref = ? and status != 'complete' limit 1
      `).get(orderRef);
      if (pending) throw platformError("reconciliation_required", "data pack rotation already pending");
      const link = links[0];
      db.prepare(`
        insert into platform_data_pack_artifact_rotations
          (rotation_ref, order_ref, account_id, link_ref, old_artifact_ref,
           replacement_artifact_ref, status, created_at, updated_at)
        values (?, ?, ?, ?, ?, null, 'prepared', ?, ?)
      `).run(rotationRef, orderRef, accountId, link.id, link.artifactRef, now, now);
      return mapDataPackArtifactRotation(db.prepare(`
        select * from platform_data_pack_artifact_rotations where rotation_ref = ?
      `).get(rotationRef));
    }).immediate();
  }

  function advanceCoinCommerceDataPackArtifactRotation(input = {}) {
    exactObject(input, { allowed: ["rotationRef", "orderRef", "accountId", "leaseRef", "stage",
      "replacementArtifactRef", "attempt", "now"], required: ["rotationRef", "orderRef", "accountId",
      "leaseRef", "stage", "now"], name: "dataPackArtifactRotationAdvance" });
    const rotationRef = safeControlRef(input.rotationRef, "rotationRef");
    const orderRef = safeControlRef(input.orderRef, "orderRef");
    const accountId = safeControlRef(input.accountId, "accountId");
    const leaseRef = safeControlRef(input.leaseRef, "leaseRef");
    const stage = input.stage;
    const now = isoText(input.now, "now");
    if (!["retry", "escrowed", "switched", "complete"].includes(stage)) {
      throw platformError("validation_error", "invalid data pack rotation stage");
    }
    const replacementRef = input.replacementArtifactRef === undefined ? null
      : safeControlRef(input.replacementArtifactRef, "replacementArtifactRef");
    return db.transaction(() => {
      const current = mapDataPackArtifactRotation(db.prepare(`
        select * from platform_data_pack_artifact_rotations where rotation_ref = ?
      `).get(rotationRef));
      if (!current || current.orderRef !== orderRef || current.accountId !== accountId) {
        throw platformError("reconciliation_required", "data pack rotation intent unavailable");
      }
      if (current.leaseRef !== leaseRef || current.leaseUntil <= now) {
        throw platformError("reconciliation_required", "data pack rotation lease expired or changed");
      }
      if (stage === "retry") {
        if (current.status !== "prepared" || current.attempt !== input.attempt
          || current.attempt >= 16) {
          throw platformError("reconciliation_required", "data pack rotation retry drifted");
        }
        db.prepare(`
          update platform_data_pack_artifact_rotations
          set attempt = attempt + 1, updated_at = ? where rotation_ref = ?
        `).run(now, rotationRef);
        return mapDataPackArtifactRotation(db.prepare(`
          select * from platform_data_pack_artifact_rotations where rotation_ref = ?
        `).get(rotationRef));
      }
      if (current.status === stage || current.status === "complete") {
        if (replacementRef && replacementRef !== current.replacementArtifactRef) {
          throw platformError("reconciliation_required", "data pack rotation replacement drifted");
        }
        return current;
      }
      if (stage === "escrowed" && current.status === "prepared") {
        if (!replacementRef || replacementRef === current.oldArtifactRef) {
          throw platformError("reconciliation_required", "data pack rotation replacement invalid");
        }
        db.prepare(`
          update platform_data_pack_artifact_rotations
          set replacement_artifact_ref = ?, status = 'escrowed', updated_at = ?
          where rotation_ref = ?
        `).run(replacementRef, now, rotationRef);
      } else if (stage === "switched" && current.status === "escrowed") {
        const link = getIssuedLink(current.linkRef);
        if (link?.status !== "active" || link.artifactRef !== current.oldArtifactRef) {
          throw platformError("reconciliation_required", "data pack rotation link drifted");
        }
        const changed = db.prepare(`
          update platform_issued_subscription_links set artifact_ref = ?, updated_at = ?
          where id = ? and artifact_ref = ? and status = 'active'
        `).run(current.replacementArtifactRef, now, current.linkRef, current.oldArtifactRef);
        if (changed.changes !== 1) {
          throw platformError("reconciliation_required", "data pack rotation link changed");
        }
        db.prepare(`
          update platform_data_pack_artifact_rotations
          set status = 'switched', updated_at = ? where rotation_ref = ?
        `).run(now, rotationRef);
      } else if (stage === "complete" && current.status === "switched") {
        const link = getIssuedLink(current.linkRef);
        if (link?.status !== "active" || link.artifactRef !== current.replacementArtifactRef) {
          throw platformError("reconciliation_required", "data pack rotation link drifted");
        }
        db.prepare(`
          update platform_data_pack_artifact_rotations
          set status = 'complete', updated_at = ? where rotation_ref = ?
        `).run(now, rotationRef);
      } else {
        throw platformError("reconciliation_required", "data pack rotation stage drifted");
      }
      return mapDataPackArtifactRotation(db.prepare(`
        select * from platform_data_pack_artifact_rotations where rotation_ref = ?
      `).get(rotationRef));
    }).immediate();
  }

  function mapDataPackCredentialReset(row) {
    return row ? Object.freeze({
      rotationRef: row.rotation_ref, orderRef: row.order_ref,
      accountId: row.account_id, requestRef: row.request_ref,
      entitlementRef: row.entitlement_ref,
      edgeChannelRef: row.edge_channel_ref,
      edgeCredentialRef: row.edge_credential_ref,
      oldEdgeMaterialDigest: row.old_edge_material_digest,
      newEdgeMaterialDigest: row.new_edge_material_digest,
      status: row.status, leaseRef: row.lease_ref, leaseUntil: row.lease_until
    }) : null;
  }

  function readDataPackCredentialReset(rotationRef) {
    return mapDataPackCredentialReset(db.prepare(`
      select * from platform_data_pack_credential_resets where rotation_ref = ?
    `).get(rotationRef));
  }

  // The collector owns journal admission. These APIs bind its private receipt
  // to a revalidated, order-owned reset; no material, counters or schema change.
  function meteringResetInvalid() {
    return platformError("reconciliation_required", "data pack metering reset proof is invalid");
  }

  function meteringResetObject(value, fields) {
    if (!value || typeof value !== "object" || Array.isArray(value) || utilTypes.isProxy(value)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw meteringResetInvalid();
    const keys = Reflect.ownKeys(value);
    if (keys.length !== fields.length || keys.some((key) => !fields.includes(key)
      || !Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), "value")
      || !Object.getOwnPropertyDescriptor(value, key).enumerable)) throw meteringResetInvalid();
  }

  function meteringResetTime(value) {
    if (typeof value !== "string" || !Number.isFinite(Date.parse(value))
      || new Date(value).toISOString() !== value) throw meteringResetInvalid();
    return value;
  }

  function meteringResetCanonical(value) {
    if (value && typeof value === "object") {
      return `{${Object.keys(value).sort().map((key) =>
        `${JSON.stringify(key)}:${meteringResetCanonical(value[key])}`).join(",")}}`;
    }
    return JSON.stringify(value);
  }

  function validateMeteringResetProof(proof) {
    const refs = ["rotationRef", "orderRef", "accountId", "requestRef", "entitlementRef",
      "edgeChannelRef", "edgeCredentialRef"];
    meteringResetObject(proof, ["version", ...refs, "oldEdgeMaterialDigest",
      "newEdgeMaterialDigest", "billingBinding", "quotaBytes", "exhausted"]);
    meteringResetObject(proof.billingBinding, ["plan", "validFrom", "validUntil"]);
    if (proof.version !== 1 || refs.some((field) => typeof proof[field] !== "string"
      || safeControlRef(proof[field], field) !== proof[field])
      || typeof proof.billingBinding.plan !== "string"
      || safeControlRef(proof.billingBinding.plan, "plan") !== proof.billingBinding.plan
      || ![proof.oldEdgeMaterialDigest, proof.newEdgeMaterialDigest].every((value) =>
        typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value))
      || proof.oldEdgeMaterialDigest === proof.newEdgeMaterialDigest
      || !Number.isSafeInteger(proof.quotaBytes) || proof.quotaBytes <= 0
      || typeof proof.exhausted !== "boolean") throw meteringResetInvalid();
    if (meteringResetTime(proof.billingBinding.validFrom)
      >= meteringResetTime(proof.billingBinding.validUntil)) throw meteringResetInvalid();
  }

  function validateMeteringResetContinuation(continuation, proof, now) {
    meteringResetObject(continuation, ["version", "activationId", "context", "previousSequence",
      "sequence", "previousCheckpointDigest", "identityDigest", "proofDigest", "archiveName", "completedAt"]);
    if (utilTypes.isProxy(continuation.context)) throw meteringResetInvalid();
    const scoped = continuation.context && typeof continuation.context === "object"
      && Object.hasOwn(continuation.context, "meteringScope");
    // Preserve the legacy full-five shape; local-three is the only explicit
    // discriminator. Keep this store boundary independent of CLI modules.
    meteringResetObject(continuation.context, ["databaseIdentityDigest", "scopeDigest", ...(scoped ? ["meteringScope"] : [])]);
    if (continuation.version !== 1 || typeof continuation.activationId !== "string"
      || !SAFE_AUTHORITY_REF_PATTERN.test(continuation.activationId)
      || scoped && continuation.context.meteringScope !== "local-three-v1"
      || !Number.isSafeInteger(continuation.previousSequence) || continuation.previousSequence < 0
      || !Number.isSafeInteger(continuation.sequence)
      || continuation.sequence !== continuation.previousSequence + 1
      || ![continuation.previousCheckpointDigest, continuation.identityDigest, continuation.proofDigest,
        continuation.context.databaseIdentityDigest, continuation.context.scopeDigest].every((value) =>
        typeof value === "string" && /^[a-f0-9]{64}$/.test(value))
      || continuation.proofDigest !== sha256(meteringResetCanonical(proof))
      || continuation.archiveName !== `material-before-${continuation.previousCheckpointDigest}.json`
      || meteringResetTime(continuation.completedAt) > now) throw meteringResetInvalid();
  }

  function meteringResetReceiptRef(rotationRef) {
    return `pack_metering_reset_${sha256(`GCCWEBOS:DATA_PACK_METERING_RESET_RECEIPT:v1\0${rotationRef}`)}`;
  }

  function assertDataPackResetEdgeApplied(current, now, resourceUsage) {
    const createdAt = db.prepare(`select created_at from platform_data_pack_credential_resets
      where rotation_ref = ?`).get(current.rotationRef)?.created_at;
    if (!createdAt || meteringResetTime(createdAt) > now) throw meteringResetInvalid();
    const notifications = db.prepare(`
      select n.node_ref, n.desired_state_ref, n.generation
      from platform_edge_desired_state_notifications n
      join platform_edge_apply_receipts r
        on r.channel_ref = n.channel_ref and r.desired_state_ref = n.desired_state_ref
      where n.channel_ref = ? and n.reason = ? and n.status = 'applied'
        and n.created_at >= ? and n.created_at <= ? and r.status = 'applied'
        and r.config_test_ok = 1 and r.service_active = 1 and r.listener_udp443 = 1
        and r.applied_at >= ? and r.applied_at <= ?
      order by n.created_at desc, n.rowid desc limit 20
    `).all(current.edgeChannelRef, "coin_commerce_data_pack_credential_reset", createdAt, now, createdAt, now);
    if (!notifications.some((notification) => {
      const desired = getLatestEdgeDesiredStateForChannel(current.edgeChannelRef, { nodeRef: notification.node_ref });
      const credentialPresent = desired?.edgeCredentialRefs.includes(current.edgeCredentialRef);
      const materialPresent = desired?.materialDigests.some((item) => (
        item.edgeCredentialRef === current.edgeCredentialRef && item.channelRef === current.edgeChannelRef
        && item.digest === current.newEdgeMaterialDigest));
      return desired?.desiredStateRef === notification.desired_state_ref
        && desired.generation === notification.generation
        && (resourceUsage.usage.exhausted === true
          ? !credentialPresent && !desired.materialDigests.some((item) => item.edgeCredentialRef === current.edgeCredentialRef)
          : credentialPresent && materialPresent);
    })) throw platformError("reconciliation_required", "data pack reset edge not applied");
  }

  function currentMeteringResetProof(current, now, { allowComplete = false, acknowledgedProof = null } = {}) {
    if (!current || !(current.status === "edge_applied" || allowComplete && current.status === "complete")) {
      throw meteringResetInvalid();
    }
    const resourceUsage = readDataPackResourceUsage({ accountId: current.accountId, orderRef: current.orderRef,
      requestRef: current.requestRef, entitlementRef: current.entitlementRef, now });
    const request = getIssuanceRequest(current.requestRef), entitlement = getEntitlement(current.entitlementRef);
    const resource = db.prepare("select * from platform_data_pack_resources where order_ref=?").get(current.orderRef);
    const orderDigest = sha256(current.orderRef);
    const expectedMetadata = { version: 1, kind: "data_pack", commandRef: resource.command_ref,
      orderRef: current.orderRef, offerVersionRef: entitlement.plan, quotaBytes: resourceUsage.usage.totalBytes,
      nodeId: current.edgeChannelRef, commercialNeverExpires: true, technicalValidUntil: DATA_PACK_TECHNICAL_VALID_UNTIL };
    try {
      assertNoDuplicateObjectKeys(db.prepare("select metadata_json from platform_issuance_requests where id=?")
        .get(current.requestRef).metadata_json);
    } catch { throw meteringResetInvalid(); }
    if (current.requestRef !== `pareq_pack_${orderDigest}` || current.entitlementRef !== `ent_pack_${orderDigest}`
      || request.approvalRef !== `approval_pack_${orderDigest}` || request.quantity !== 1
      || request.requestedByRef !== "coin_commerce_fulfillment" || entitlement.maxArtifacts !== 1
      || entitlement.maxDevices !== 1 || entitlement.validFrom !== request.createdAt
      || meteringResetCanonical(request.metadata) !== meteringResetCanonical(expectedMetadata)) throw meteringResetInvalid();
    const credentials = db.prepare(`select * from platform_data_pack_edge_credentials
      where request_ref = ? limit 2`).all(current.requestRef);
    const credential = credentials[0];
    if (credentials.length !== 1 || credential.status !== "active"
      || credential.entitlement_ref !== current.entitlementRef
      || credential.edge_credential_ref !== current.edgeCredentialRef
      || credential.edge_channel_ref !== current.edgeChannelRef || request.nodeId !== current.edgeChannelRef
      || credential.edge_material_digest !== current.newEdgeMaterialDigest) throw meteringResetInvalid();
    if (db.prepare("select count(*) as count from platform_data_pack_edge_credentials where edge_credential_ref=?")
      .get(current.edgeCredentialRef).count !== 1
      || db.prepare("select 1 from platform_portal_edge_credentials where edge_credential_ref=? or request_id=? limit 1")
        .get(current.edgeCredentialRef, current.requestRef)
      || db.prepare("select 1 from platform_portal_access_requests where edge_credential_ref=? or id=? limit 1")
        .get(current.edgeCredentialRef, current.requestRef)) throw meteringResetInvalid();
    // Once the boundary was durably acknowledged, later quota exhaustion is
    // normal forward progress. Its newly empty desired state belongs to quota
    // convergence, not a second material continuation. Other apply drift still
    // fails; a new receipt never receives this narrow historical-proof allowance.
    if (!(acknowledgedProof?.exhausted === false && resourceUsage.usage.exhausted === true)) {
      assertDataPackResetEdgeApplied(current, now, resourceUsage);
    }
    const proof = { version: 1, rotationRef: current.rotationRef, orderRef: current.orderRef,
      accountId: current.accountId, requestRef: current.requestRef, entitlementRef: current.entitlementRef,
      edgeChannelRef: current.edgeChannelRef, edgeCredentialRef: current.edgeCredentialRef,
      oldEdgeMaterialDigest: current.oldEdgeMaterialDigest, newEdgeMaterialDigest: current.newEdgeMaterialDigest,
      billingBinding: Object.freeze({ plan: entitlement.plan, validFrom: entitlement.validFrom, validUntil: entitlement.validUntil }),
      quotaBytes: resourceUsage.usage.totalBytes, exhausted: resourceUsage.usage.exhausted === true };
    validateMeteringResetProof(proof);
    return Object.freeze(proof);
  }

  function readCoinCommerceDataPackMeteringResetProofs(input = {}) {
    meteringResetObject(input, ["now"]);
    const now = meteringResetTime(input.now);
    return db.transaction(() => {
      const rows = db.prepare(`select * from platform_data_pack_credential_resets
        where status = 'edge_applied' order by created_at, rotation_ref limit 33`).all();
      if (rows.length > 32) throw meteringResetInvalid();
      return Object.freeze(rows.map((row) => {
        const current = mapDataPackCredentialReset(row);
        const receipt = getCoinCommerceDataPackMeteringResetReceipt({ rotationRef: current.rotationRef,
          orderRef: current.orderRef, accountId: current.accountId, now });
        return receipt?.proof || currentMeteringResetProof(current, now);
      }));
    })();
  }

  function getCoinCommerceDataPackMeteringResetReceipt(input = {}) {
    meteringResetObject(input, ["rotationRef", "orderRef", "accountId", "now"]);
    const now = meteringResetTime(input.now);
    for (const field of ["rotationRef", "orderRef", "accountId"]) {
      if (typeof input[field] !== "string" || safeControlRef(input[field], field) !== input[field]) throw meteringResetInvalid();
    }
    return db.transaction(() => {
      const current = readDataPackCredentialReset(input.rotationRef);
      if (!current || current.accountId !== input.accountId || current.orderRef !== input.orderRef) throw meteringResetInvalid();
      const receipt = getAuditEvent(meteringResetReceiptRef(input.rotationRef));
      if (!receipt) return null;
      try {
        assertNoDuplicateObjectKeys(db.prepare("select metadata_json from platform_audit_events where id = ?")
          .get(receipt.id).metadata_json);
      } catch { throw meteringResetInvalid(); }
      meteringResetObject(receipt.metadata, ["version", "proof", "continuation"]);
      const { proof, continuation } = receipt.metadata;
      validateMeteringResetProof(proof);
      validateMeteringResetContinuation(continuation, proof, now);
      const createdAt = db.prepare(`select created_at from platform_data_pack_credential_resets
        where rotation_ref = ?`).get(current.rotationRef).created_at;
      if (receipt.entityType !== "coin_commerce_data_pack_metering_reset"
        || receipt.entityRef !== current.rotationRef || receipt.action !== "data_pack_metering_reset_completed"
        || receipt.actorRef !== "full_metering_collector" || receipt.createdAt !== continuation.completedAt
        || receipt.metadata.version !== 1 || continuation.completedAt < createdAt) {
        throw meteringResetInvalid();
      }
      const currentProof = currentMeteringResetProof(current, now, { allowComplete: true, acknowledgedProof: proof });
      const comparable = !proof.exhausted && currentProof.exhausted
        ? { ...currentProof, exhausted: false } : currentProof;
      if (meteringResetCanonical(proof) !== meteringResetCanonical(comparable)) throw meteringResetInvalid();
      return Object.freeze({ version: 1, proof: Object.freeze({ ...proof, billingBinding: Object.freeze(proof.billingBinding) }),
        continuation: Object.freeze({ ...continuation, context: Object.freeze(continuation.context) }) });
    })();
  }

  function recordCoinCommerceDataPackMeteringResetReceipt(input = {}) {
    meteringResetObject(input, ["proof", "continuation", "now"]);
    const now = meteringResetTime(input.now), { proof, continuation } = input;
    validateMeteringResetProof(proof);
    validateMeteringResetContinuation(continuation, proof, now);
    return db.transaction(() => {
      const scope = { rotationRef: proof.rotationRef, orderRef: proof.orderRef, accountId: proof.accountId, now };
      const existing = getCoinCommerceDataPackMeteringResetReceipt(scope);
      const metadata = { version: 1, proof, continuation };
      if (existing) {
        if (meteringResetCanonical(existing) !== meteringResetCanonical(metadata)) throw meteringResetInvalid();
        return existing;
      }
      const current = readDataPackCredentialReset(proof.rotationRef);
      if (meteringResetCanonical(proof) !== meteringResetCanonical(currentMeteringResetProof(current, now))) throw meteringResetInvalid();
      // The generic audit input filter rejects any field named "credential".
      // This exact private shape contains only validated references and digests,
      // never credential material; do not relax that generic audit API.
      db.prepare(`insert into platform_audit_events
        (id, entity_type, entity_ref, action, actor_ref, created_at, metadata_json)
        values (?, ?, ?, ?, ?, ?, ?)`).run(meteringResetReceiptRef(proof.rotationRef),
        "coin_commerce_data_pack_metering_reset", proof.rotationRef, "data_pack_metering_reset_completed",
        "full_metering_collector", continuation.completedAt, JSON.stringify(metadata));
      return getCoinCommerceDataPackMeteringResetReceipt(scope);
    }).immediate();
  }

  // One order-owned intent spans protected staging, the control digest CAS,
  // edge apply and artifact rotation. It never stores material or usage rows.
  function beginCoinCommerceDataPackCredentialReset(input = {}) {
    exactObject(input, { allowed: ["rotationRef", "orderRef", "accountId", "now"],
      required: ["rotationRef", "orderRef", "accountId", "now"],
      name: "dataPackCredentialReset" });
    const rotationRef = safeControlRef(input.rotationRef, "rotationRef");
    const orderRef = safeControlRef(input.orderRef, "orderRef");
    const accountId = safeControlRef(input.accountId, "accountId");
    const now = isoText(input.now, "now");
    return db.transaction(() => {
      const existing = readDataPackCredentialReset(rotationRef);
      if (existing) {
        if (existing.orderRef !== orderRef || existing.accountId !== accountId) {
          throw platformError("reconciliation_required", "data pack reset scope drifted");
        }
        return existing;
      }
      if (db.prepare(`
        select 1 from platform_data_pack_credential_resets
        where order_ref = ? and status != 'complete' limit 1
      `).get(orderRef)) {
        throw platformError("reconciliation_required", "data pack reset already pending");
      }
      const resource = db.prepare(`
        select * from platform_data_pack_resources
        where order_ref = ? and account_id = ?
      `).get(orderRef, accountId);
      if (!resource) throw platformError("reconciliation_required", "data pack reset resource absent");
      readDataPackResourceUsage({ accountId, orderRef,
        requestRef: resource.request_ref, entitlementRef: resource.entitlement_ref, now });
      const credentials = db.prepare(`
        select * from platform_data_pack_edge_credentials
        where request_ref = ? and status = 'active'
      `).all(resource.request_ref);
      if (credentials.length !== 1
        || credentials[0].entitlement_ref !== resource.entitlement_ref
        || !/^sha256:[a-f0-9]{64}$/.test(credentials[0].edge_material_digest)) {
        throw platformError("reconciliation_required", "data pack reset credential drifted");
      }
      const pendingArtifact = db.prepare(`
        select rotation_ref from platform_data_pack_artifact_rotations
        where order_ref = ? and status != 'complete'
      `).get(orderRef);
      if (pendingArtifact && pendingArtifact.rotation_ref !== rotationRef) {
        throw platformError("reconciliation_required", "another artifact rotation is pending");
      }
      db.prepare(`
        insert into platform_data_pack_credential_resets
          (rotation_ref, order_ref, account_id, request_ref, entitlement_ref,
           edge_channel_ref, edge_credential_ref, old_edge_material_digest,
           status, created_at, updated_at)
        values (?, ?, ?, ?, ?, ?, ?, ?, 'prepared', ?, ?)
      `).run(rotationRef, orderRef, accountId, resource.request_ref,
        resource.entitlement_ref, credentials[0].edge_channel_ref,
        credentials[0].edge_credential_ref, credentials[0].edge_material_digest,
        now, now);
      return readDataPackCredentialReset(rotationRef);
    }).immediate();
  }

  function claimCoinCommerceDataPackCredentialReset(input = {}) {
    exactObject(input, { allowed: ["rotationRef", "orderRef", "accountId", "leaseRef", "now"],
      required: ["rotationRef", "orderRef", "accountId", "leaseRef", "now"],
      name: "dataPackCredentialResetClaim" });
    const rotationRef = safeControlRef(input.rotationRef, "rotationRef");
    const orderRef = safeControlRef(input.orderRef, "orderRef");
    const accountId = safeControlRef(input.accountId, "accountId");
    const leaseRef = safeControlRef(input.leaseRef, "leaseRef");
    const now = isoText(input.now, "now");
    const leaseUntil = new Date(Date.parse(now) + 5 * 60_000).toISOString();
    return db.transaction(() => {
      const changed = db.prepare(`
        update platform_data_pack_credential_resets
        set lease_ref = ?, lease_until = ?, updated_at = ?
        where rotation_ref = ? and order_ref = ? and account_id = ?
          and (lease_ref is null or lease_until <= ?)
      `).run(leaseRef, leaseUntil, now, rotationRef, orderRef, accountId, now);
      if (changed.changes !== 1) {
        throw platformError("reconciliation_required", "data pack reset lease held");
      }
      return readDataPackCredentialReset(rotationRef);
    }).immediate();
  }

  function releaseCoinCommerceDataPackCredentialReset(input = {}) {
    exactObject(input, { allowed: ["rotationRef", "orderRef", "accountId", "leaseRef"],
      required: ["rotationRef", "orderRef", "accountId", "leaseRef"],
      name: "dataPackCredentialResetRelease" });
    const rotationRef = safeControlRef(input.rotationRef, "rotationRef");
    const orderRef = safeControlRef(input.orderRef, "orderRef");
    const accountId = safeControlRef(input.accountId, "accountId");
    const leaseRef = safeControlRef(input.leaseRef, "leaseRef");
    const changed = db.prepare(`
      update platform_data_pack_credential_resets
      set lease_ref = null, lease_until = null
      where rotation_ref = ? and order_ref = ? and account_id = ? and lease_ref = ?
    `).run(rotationRef, orderRef, accountId, leaseRef);
    if (changed.changes !== 1) {
      throw platformError("reconciliation_required", "data pack reset lease changed");
    }
  }

  function listPendingCoinCommerceDataPackCredentialResets(input = {}) {
    exactObject(input, { allowed: ["limit", "now"], required: ["limit", "now"],
      name: "dataPackCredentialResetPending" });
    if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 20) {
      throw platformError("validation_error", "invalid data pack reset recovery limit");
    }
    const now = isoText(input.now, "now");
    return Object.freeze(db.prepare(`
      select account_id, order_ref, rotation_ref
      from platform_data_pack_credential_resets
      where status != 'complete' and (lease_ref is null or lease_until <= ?)
      order by created_at, rotation_ref limit ?
    `).all(now, input.limit).map((row) => Object.freeze({
      accountId: row.account_id, orderRef: row.order_ref, rotationRef: row.rotation_ref
    })));
  }

  function advanceCoinCommerceDataPackCredentialReset(input = {}) {
    exactObject(input, { allowed: ["rotationRef", "orderRef", "accountId", "leaseRef",
      "stage", "newEdgeMaterialDigest", "now"],
      required: ["rotationRef", "orderRef", "accountId", "leaseRef", "stage", "now"],
      name: "dataPackCredentialResetAdvance" });
    const rotationRef = safeControlRef(input.rotationRef, "rotationRef");
    const orderRef = safeControlRef(input.orderRef, "orderRef");
    const accountId = safeControlRef(input.accountId, "accountId");
    const leaseRef = safeControlRef(input.leaseRef, "leaseRef");
    const stage = input.stage;
    const now = isoText(input.now, "now");
    if (!["staged", "control_switched", "material_committed",
      "edge_applied", "complete"].includes(stage)) {
      throw platformError("validation_error", "invalid data pack reset stage");
    }
    return db.transaction(() => {
      const current = readDataPackCredentialReset(rotationRef);
      if (!current || current.orderRef !== orderRef || current.accountId !== accountId
        || current.leaseRef !== leaseRef || current.leaseUntil <= now) {
        throw platformError("reconciliation_required", "data pack reset lease or scope changed");
      }
      if (current.status === stage) {
        if (input.newEdgeMaterialDigest !== undefined
          && input.newEdgeMaterialDigest !== current.newEdgeMaterialDigest) {
          throw platformError("reconciliation_required", "data pack reset material changed");
        }
        if (stage === "complete" && !getCoinCommerceDataPackMeteringResetReceipt({ rotationRef, orderRef, accountId, now })) {
          throw meteringResetInvalid();
        }
        return current;
      }
      if (stage === "staged" && current.status === "prepared") {
        const digest = requiredText(input.newEdgeMaterialDigest, "newEdgeMaterialDigest");
        if (!/^sha256:[a-f0-9]{64}$/.test(digest)
          || digest === current.oldEdgeMaterialDigest) {
          throw platformError("validation_error", "data pack reset candidate invalid");
        }
        db.prepare(`
          update platform_data_pack_credential_resets
          set new_edge_material_digest = ?, status = 'staged', updated_at = ?
          where rotation_ref = ?
        `).run(digest, now, rotationRef);
      } else if (stage === "control_switched" && current.status === "staged") {
        rotateCoinCommerceDataPackEdgeCredential({ requestRef: current.requestRef,
          entitlementRef: current.entitlementRef, edgeChannelRef: current.edgeChannelRef,
          edgeCredentialRef: current.edgeCredentialRef,
          oldEdgeMaterialDigest: current.oldEdgeMaterialDigest,
          newEdgeMaterialDigest: current.newEdgeMaterialDigest, now });
        db.prepare(`
          update platform_data_pack_credential_resets
          set status = 'control_switched', updated_at = ? where rotation_ref = ?
        `).run(now, rotationRef);
      } else if (stage === "material_committed" && current.status === "control_switched") {
        const active = db.prepare(`
          select edge_material_digest from platform_data_pack_edge_credentials
          where request_ref = ? and edge_credential_ref = ? and status = 'active'
        `).get(current.requestRef, current.edgeCredentialRef);
        if (active?.edge_material_digest !== current.newEdgeMaterialDigest) {
          throw platformError("reconciliation_required", "data pack reset control material drifted");
        }
        // The caller must first verify the protected file's active summary.
        db.prepare(`
          update platform_data_pack_credential_resets
          set status = 'material_committed', updated_at = ? where rotation_ref = ?
        `).run(now, rotationRef);
      } else if (stage === "edge_applied" && current.status === "material_committed") {
        const resourceUsage = readDataPackResourceUsage({ accountId, orderRef,
          requestRef: current.requestRef, entitlementRef: current.entitlementRef, now });
        assertDataPackResetEdgeApplied(current, now, resourceUsage);
        db.prepare(`
          update platform_data_pack_credential_resets
          set status = 'edge_applied', updated_at = ? where rotation_ref = ?
        `).run(now, rotationRef);
      } else if (stage === "complete" && current.status === "edge_applied") {
        if (!getCoinCommerceDataPackMeteringResetReceipt({ rotationRef, orderRef, accountId, now })) throw meteringResetInvalid();
        const artifact = db.prepare(`
          select * from platform_data_pack_artifact_rotations
          where rotation_ref = ? and order_ref = ? and account_id = ? and status = 'complete'
        `).get(rotationRef, orderRef, accountId);
        const link = artifact ? getIssuedLink(artifact.link_ref) : null;
        if (!artifact || link?.status !== "active"
          || link.artifactRef !== artifact.replacement_artifact_ref) {
          throw platformError("reconciliation_required", "data pack reset artifact not complete");
        }
        db.prepare(`
          update platform_data_pack_credential_resets
          set status = 'complete', updated_at = ? where rotation_ref = ?
        `).run(now, rotationRef);
      } else {
        throw platformError("reconciliation_required", "data pack reset stage drifted");
      }
      return readDataPackCredentialReset(rotationRef);
    }).immediate();
  }

  // A pack cannot inherit the legacy edgecred_<request> naming convention:
  // only a credential whose protected material has been separately issued
  // may become a metering identity. This is source-only registration; it does
  // not apply a desired runtime state or assert collector convergence.
  function registerCoinCommerceDataPackEdgeCredential(input = {}) {
    exactObject(input, {
      allowed: ["requestRef", "entitlementRef", "edgeChannelRef",
        "edgeCredentialRef", "edgeMaterialDigest", "now"],
      name: "dataPackEdgeCredential"
    });
    const requestRef = safeControlRef(input.requestRef, "requestRef");
    const entitlementRef = safeControlRef(input.entitlementRef, "entitlementRef");
    const edgeChannelRef = safeControlRef(input.edgeChannelRef, "edgeChannelRef");
    const edgeCredentialRef = safeControlRef(input.edgeCredentialRef, "edgeCredentialRef");
    const edgeMaterialDigest = requiredText(input.edgeMaterialDigest, "edgeMaterialDigest");
    const now = isoText(input.now, "now");
    if (!/^sha256:[a-f0-9]{64}$/.test(edgeMaterialDigest)) {
      throw platformError("validation_error", "data pack material digest is invalid");
    }
    return db.transaction(() => {
      const request = getIssuanceRequest(requestRef);
      const entitlement = getEntitlement(entitlementRef);
      const activeLinks = db.prepare(`
        select count(*) as count from platform_issued_subscription_links
        where request_id = ? and status = 'active'
      `).get(requestRef).count;
      if (!request || !entitlement
        || request.entitlementId !== entitlementRef
        || request.purpose !== "coin_commerce_data_pack_fulfillment"
        || request.status !== "issued"
        || request.nodeId !== edgeChannelRef
        || request.accountId !== entitlement.accountId
        || request.metadata?.kind !== "data_pack"
        || entitlement.status !== "active"
        || lifetimeDataPackQuotaBytesFor(entitlement) !== entitlement.trafficLimitBytes
        || entitlement.validUntil !== DATA_PACK_TECHNICAL_VALID_UNTIL
        || activeLinks !== 1) {
        throw platformError("reconciliation_required", "data pack edge lineage is not issued");
      }
      const portalCollision = db.prepare(`
        select 1 from platform_portal_edge_credentials
        where edge_credential_ref = ? limit 1
      `).get(edgeCredentialRef);
      const existing = db.prepare(`
        select * from platform_data_pack_edge_credentials
        where edge_credential_ref = ?
      `).get(edgeCredentialRef);
      const active = db.prepare(`
        select * from platform_data_pack_edge_credentials
        where request_ref = ? and status = 'active'
      `).get(requestRef);
      if (portalCollision || (existing && (
        existing.request_ref !== requestRef
        || existing.entitlement_ref !== entitlementRef
        || existing.edge_channel_ref !== edgeChannelRef
        || existing.edge_material_digest !== edgeMaterialDigest
        || existing.status !== "active"
      )) || (active && active.edge_credential_ref !== edgeCredentialRef)) {
        throw platformError("reconciliation_required", "data pack edge credential drifted");
      }
      if (!existing) {
        db.prepare(`
          insert into platform_data_pack_edge_credentials
            (request_ref, entitlement_ref, edge_channel_ref, edge_credential_ref,
             edge_material_digest, status, created_at, updated_at)
          values (?, ?, ?, ?, ?, 'active', ?, ?)
        `).run(requestRef, entitlementRef, edgeChannelRef, edgeCredentialRef,
          edgeMaterialDigest, now, now);
      }
      return Object.freeze({ requestRef, entitlementRef, edgeChannelRef,
        edgeCredentialRef, edgeMaterialDigest, status: "active" });
    }).immediate();
  }

  // Source-only material transition on a stable metering principal. The
  // caller must prepare replacement protected material and later verify an
  // applied edge receipt; this database operation alone revokes no client.
  function rotateCoinCommerceDataPackEdgeCredential(input = {}) {
    exactObject(input, {
      allowed: ["requestRef", "entitlementRef", "edgeChannelRef",
        "edgeCredentialRef", "oldEdgeMaterialDigest", "newEdgeMaterialDigest", "now"],
      name: "dataPackEdgeCredentialRotation"
    });
    const requestRef = safeControlRef(input.requestRef, "requestRef");
    const entitlementRef = safeControlRef(input.entitlementRef, "entitlementRef");
    const edgeChannelRef = safeControlRef(input.edgeChannelRef, "edgeChannelRef");
    const edgeCredentialRef = safeControlRef(input.edgeCredentialRef, "edgeCredentialRef");
    const oldDigest = requiredText(input.oldEdgeMaterialDigest, "oldEdgeMaterialDigest");
    const newDigest = requiredText(input.newEdgeMaterialDigest, "newEdgeMaterialDigest");
    const now = isoText(input.now, "now");
    if (!/^sha256:[a-f0-9]{64}$/.test(oldDigest)
      || !/^sha256:[a-f0-9]{64}$/.test(newDigest) || oldDigest === newDigest) {
      throw platformError("validation_error", "data pack replacement material is invalid");
    }
    return db.transaction(() => {
      const request = getIssuanceRequest(requestRef);
      const entitlement = getEntitlement(entitlementRef);
      const active = db.prepare(`
        select * from platform_data_pack_edge_credentials
        where request_ref = ? and edge_credential_ref = ? and status = 'active'
      `).get(requestRef, edgeCredentialRef);
      const activeCount = db.prepare(`
        select count(*) as count from platform_data_pack_edge_credentials
        where request_ref = ? and status = 'active'
      `).get(requestRef).count;
      if (!request || !entitlement || !active || activeCount !== 1
        || request.entitlementId !== entitlementRef
        || request.accountId !== entitlement.accountId
        || request.purpose !== "coin_commerce_data_pack_fulfillment"
        || request.status !== "issued" || request.nodeId !== edgeChannelRef
        || request.metadata?.kind !== "data_pack"
        || entitlement.status !== "active"
        || entitlement.validUntil !== DATA_PACK_TECHNICAL_VALID_UNTIL
        || lifetimeDataPackQuotaBytesFor(entitlement) !== entitlement.trafficLimitBytes
        || active.entitlement_ref !== entitlementRef
        || active.edge_channel_ref !== edgeChannelRef) {
        throw platformError("reconciliation_required", "data pack edge rotation lineage drifted");
      }
      const resource = db.prepare(`
        select account_id, order_ref from platform_data_pack_resources
        where request_ref = ? and entitlement_ref = ?
      `).get(requestRef, entitlementRef);
      if (!resource || resource.account_id !== request.accountId) {
        throw platformError("reconciliation_required", "data pack resource is absent");
      }
      readDataPackResourceUsage({ accountId: request.accountId,
        orderRef: resource.order_ref, requestRef, entitlementRef, now });
      if (active.edge_material_digest === newDigest) {
        return Object.freeze({ requestRef, entitlementRef, edgeChannelRef,
          edgeCredentialRef, edgeMaterialDigest: newDigest, status: "active" });
      }
      if (active.edge_material_digest !== oldDigest) {
        throw platformError("reconciliation_required", "data pack edge material changed");
      }
      const updated = db.prepare(`
        update platform_data_pack_edge_credentials
        set edge_material_digest = ?, updated_at = ?
        where request_ref = ? and edge_credential_ref = ?
          and edge_material_digest = ? and status = 'active'
      `).run(newDigest, now, requestRef, edgeCredentialRef, oldDigest);
      if (updated.changes !== 1) {
        throw platformError("reconciliation_required", "data pack edge material changed");
      }
      return Object.freeze({ requestRef, entitlementRef, edgeChannelRef,
        edgeCredentialRef, edgeMaterialDigest: newDigest, status: "active" });
    }).immediate();
  }

  // Internal fulfillment fact, not an Order payment fact or public material
  // endpoint. The exact captured Order must be checked by the Commerce store
  // before a caller uses this binding for a customer handoff.
  function createDataPackResource(input = {}) {
    exactObject(input, {
      allowed: ["orderRef", "commandRef", "accountId", "requestRef", "entitlementRef",
        "offerVersionRef", "quotaBytes", "technicalValidUntil",
        "commercialNeverExpires", "createdAt"],
      name: "dataPackResource"
    });
    const record = {
      orderRef: safeControlRef(input.orderRef, "orderRef"),
      commandRef: safeControlRef(input.commandRef, "commandRef"),
      accountId: safeControlRef(input.accountId, "accountId"),
      requestRef: safeControlRef(input.requestRef, "requestRef"),
      entitlementRef: safeControlRef(input.entitlementRef, "entitlementRef"),
      offerVersionRef: safeControlRef(input.offerVersionRef, "offerVersionRef"),
      quotaBytes: integer(input.quotaBytes, "quotaBytes", { min: 1 }),
      technicalValidUntil: isoText(input.technicalValidUntil, "technicalValidUntil"),
      commercialNeverExpires: input.commercialNeverExpires,
      createdAt: isoText(input.createdAt, "createdAt")
    };
    if (record.commercialNeverExpires !== true
      || record.technicalValidUntil !== DATA_PACK_TECHNICAL_VALID_UNTIL
      || lifetimeDataPackQuotaBytesFor({ plan: record.offerVersionRef }) !== record.quotaBytes) {
      throw platformError("validation_error", "data pack commercial lifetime is invalid");
    }
    return db.transaction(() => {
      const account = getAccount(record.accountId);
      const request = getIssuanceRequest(record.requestRef);
      const entitlement = getEntitlement(record.entitlementRef);
      const activeLinks = db.prepare(`
        select count(*) as count from platform_issued_subscription_links
        where request_id = ? and status = 'active'
      `).get(record.requestRef).count;
      if (!account || account.status !== "active"
        || !request || request.accountId !== record.accountId
        || request.entitlementId !== record.entitlementRef
        || request.status !== "issued"
        || request.purpose !== "coin_commerce_data_pack_fulfillment"
        || !entitlement || entitlement.accountId !== record.accountId
        || entitlement.status !== "active"
        || entitlement.plan !== record.offerVersionRef
        || entitlement.trafficLimitBytes !== record.quotaBytes
        || entitlement.validUntil !== record.technicalValidUntil
        || activeLinks !== 1) {
        throw platformError("reconciliation_required", "data pack issuance is invalid");
      }
      db.prepare(`
        insert or ignore into platform_data_pack_resources (
          order_ref, command_ref, account_id, request_ref, entitlement_ref,
          offer_version_ref, quota_bytes, commercial_never_expires,
          technical_valid_until, created_at
        ) values (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      `).run(record.orderRef, record.commandRef, record.accountId, record.requestRef,
        record.entitlementRef, record.offerVersionRef, record.quotaBytes,
        record.technicalValidUntil, record.createdAt);
      const stored = mapDataPackResource(db.prepare(`
        select * from platform_data_pack_resources where order_ref = ?
      `).get(record.orderRef));
      if (JSON.stringify(stored) !== JSON.stringify(record)) {
        throw platformError("reconciliation_required", "data pack order binding drifted");
      }
      return stored;
    }).immediate();
  }

  // Internal fulfillment effect only. A Commerce captured-order claim and a
  // separately verified runtime handoff are still required before the Order
  // may be marked delivered or any subscription material may be exposed.
  function applyCoinCommerceDataPackFulfillment(input = {}) {
    exactObject(input, {
      allowed: ["orderRef", "commandRef", "accountId", "requestRef",
        "entitlementRef", "issuedLinkRef", "offerVersionRef", "quotaBytes",
        "technicalValidUntil", "commercialNeverExpires", "createdAt"],
      name: "dataPackFulfillment"
    });
    const issuedLinkRef = safeControlRef(input.issuedLinkRef, "issuedLinkRef");
    const resourceInput = {
      orderRef: input.orderRef,
      commandRef: input.commandRef,
      accountId: input.accountId,
      requestRef: input.requestRef,
      entitlementRef: input.entitlementRef,
      offerVersionRef: input.offerVersionRef,
      quotaBytes: input.quotaBytes,
      technicalValidUntil: input.technicalValidUntil,
      commercialNeverExpires: input.commercialNeverExpires,
      createdAt: input.createdAt
    };
    const effectRef = effectRefForCommand(
      safeControlRef(resourceInput.commandRef, "commandRef")
    );
    return db.transaction(() => {
      const resource = createDataPackResource(resourceInput);
      const link = getIssuedLink(issuedLinkRef);
      const metadata = {
        version: 1,
        kind: "data_pack",
        commandRef: resource.commandRef,
        orderRef: resource.orderRef,
        accountId: resource.accountId,
        requestRef: resource.requestRef,
        entitlementRef: resource.entitlementRef,
        issuedLinkRef,
        offerVersionRef: resource.offerVersionRef,
        quotaBytes: resource.quotaBytes,
        commercialNeverExpires: true,
        technicalValidUntil: resource.technicalValidUntil
      };
      const existing = getAuditEvent(effectRef);
      if (!link || link.requestId !== resource.requestRef
        || (existing ? !["active", "rotated"].includes(link.status)
          : link.status !== "active")
        || (existing && (
          existing.entityType !== "coin_commerce_data_pack_fulfillment"
          || existing.entityRef !== resource.entitlementRef
          || existing.action !== "data_pack_fulfillment_applied"
          || existing.actorRef !== "coin_commerce_fulfillment"
          || existing.createdAt !== resource.createdAt
          || JSON.stringify(existing.metadata) !== JSON.stringify(metadata)
        ))) {
        throw platformError("reconciliation_required", "data pack fulfillment drifted");
      }
      if (!existing) {
        recordAuditEvent({
          id: effectRef,
          entityType: "coin_commerce_data_pack_fulfillment",
          entityRef: resource.entitlementRef,
          action: "data_pack_fulfillment_applied",
          actorRef: "coin_commerce_fulfillment",
          createdAt: resource.createdAt,
          metadata
        });
      }
      return Object.freeze({
        effectRef, orderRef: resource.orderRef,
        requestRef: resource.requestRef,
        entitlementRef: resource.entitlementRef, issuedLinkRef
      });
    }).immediate();
  }

  // This read never resolves an account-wide "current" entitlement. A buyer
  // may own a timed plan and several independent packs at once; only the
  // exact issued request/entitlement pair is eligible for this projection.
  function readDataPackResourceUsage(input = {}) {
    exactObject(input, {
      allowed: ["accountId", "orderRef", "requestRef", "entitlementRef", "now"],
      name: "dataPackResourceUsage"
    });
    const accountId = safeControlRef(input.accountId, "accountId");
    const orderRef = safeControlRef(input.orderRef, "orderRef");
    const requestRef = safeControlRef(input.requestRef, "requestRef");
    const entitlementRef = safeControlRef(input.entitlementRef, "entitlementRef");
    const now = isoText(input.now, "now");
    return db.transaction(() => {
      const account = getAccount(accountId);
      const request = getIssuanceRequest(requestRef);
      const entitlement = getEntitlement(entitlementRef);
      if (!account || !request || !entitlement
        || request.accountId !== accountId || entitlement.accountId !== accountId) {
        throw platformError("not_found", "data pack resource not found");
      }
      const quotaBytes = lifetimeDataPackQuotaBytesFor(entitlement);
      const resource = db.prepare(`
        select * from platform_data_pack_resources
        where account_id = ? and order_ref = ? and request_ref = ? and entitlement_ref = ?
      `).get(accountId, orderRef, requestRef, entitlementRef);
      const effect = resource
        ? getAuditEvent(effectRefForCommand(resource.command_ref)) : null;
      const issuedLinkRef = effect?.metadata?.issuedLinkRef;
      const effectLink = issuedLinkRef ? getIssuedLink(issuedLinkRef) : null;
      const expectedEffectMetadata = resource && effect ? {
        version: 1,
        kind: "data_pack",
        commandRef: resource.command_ref,
        orderRef,
        accountId,
        requestRef,
        entitlementRef,
        issuedLinkRef,
        offerVersionRef: resource.offer_version_ref,
        quotaBytes: resource.quota_bytes,
        commercialNeverExpires: true,
        technicalValidUntil: resource.technical_valid_until
      } : null;
      const activeLinks = db.prepare(`
        select count(*) as count from platform_issued_subscription_links
        where request_id = ? and status = 'active'
      `).get(requestRef).count;
      if (account.status !== "active"
        || request.entitlementId !== entitlementRef
        || request.status !== "issued"
        || request.purpose !== "coin_commerce_data_pack_fulfillment"
        || entitlement.status !== "active"
        || !resource || resource.offer_version_ref !== entitlement.plan
        || resource.commercial_never_expires !== 1
        || resource.technical_valid_until !== DATA_PACK_TECHNICAL_VALID_UNTIL
        || resource.quota_bytes !== quotaBytes
        || !effect
        || effect.entityType !== "coin_commerce_data_pack_fulfillment"
        || effect.entityRef !== entitlementRef
        || effect.action !== "data_pack_fulfillment_applied"
        || effect.actorRef !== "coin_commerce_fulfillment"
        || effect.createdAt !== resource.created_at
        || JSON.stringify(effect.metadata) !== JSON.stringify(expectedEffectMetadata)
        || !effectLink || effectLink.requestId !== requestRef
        || !["active", "rotated"].includes(effectLink.status)
        || quotaBytes === null
        || entitlement.trafficLimitBytes !== quotaBytes
        || entitlement.validFrom > now
        || entitlement.validUntil <= now
        || activeLinks !== 1) {
        throw platformError("reconciliation_required", "data pack resource binding is invalid");
      }
      const measured = db.prepare(`
        select count(*) as sample_count, sum(total_bytes) as used_bytes,
               max(observed_at) as last_observed_at
          from platform_usage_samples
         where account_id = ? and entitlement_id = ? and request_id = ?
           and observed_at >= ? and observed_at <= ?
      `).get(accountId, entitlementRef, requestRef, entitlement.validFrom, now);
      const usedBytes = measured.sample_count === 0 ? null : measured.used_bytes;
      if (usedBytes !== null && (!Number.isSafeInteger(usedBytes) || usedBytes < 0)) {
        throw platformError("reconciliation_required", "data pack usage is invalid");
      }
      const lastObservedAt = measured.last_observed_at;
      return Object.freeze({
        orderRef,
        requestRef,
        entitlementRef,
        usage: Object.freeze({
          totalBytes: quotaBytes,
          usedBytes,
          remainingBytes: usedBytes === null ? null : Math.max(0, quotaBytes - usedBytes),
          collectionStatus: usedBytes === null ? "pending"
            : Date.parse(now) - Date.parse(lastObservedAt) > 300_000 ? "stale"
              : usedBytes === 0 ? "measured_zero" : "measured",
          updatedAt: lastObservedAt,
          exhausted: usedBytes === null ? null : usedBytes >= quotaBytes
        })
      });
    })();
  }

  function usageSampleRecord(input) {
    const uploadBytes = integer(input.uploadBytes ?? 0, "uploadBytes", { min: 0 });
    const downloadBytes = integer(input.downloadBytes ?? 0, "downloadBytes", { min: 0 });
    const totalBytes = integer(input.totalBytes ?? uploadBytes + downloadBytes, "totalBytes", { min: 0 });
    return {
      id: requiredText(input.id, "id"),
      sourceRef: requiredText(input.sourceRef, "sourceRef"),
      channelRef: requiredText(input.channelRef, "channelRef"),
      edgeCredentialRef: requiredText(input.edgeCredentialRef, "edgeCredentialRef"),
      accountId: requiredText(input.accountId, "accountId"),
      entitlementId: requiredText(input.entitlementId, "entitlementId"),
      requestId: requiredText(input.requestId, "requestId"),
      observedAt: isoText(input.observedAt, "observedAt"),
      intervalStartedAt: isoText(input.intervalStartedAt, "intervalStartedAt"),
      intervalEndedAt: isoText(input.intervalEndedAt, "intervalEndedAt"),
      uploadBytes,
      downloadBytes,
      totalBytes,
      sampleDigest: requiredText(input.sampleDigest, "sampleDigest"),
      createdAt: isoText(input.createdAt, "createdAt")
    };
  }

  function insertUsageSampleRecord(record) {
    const result = db.prepare(`
      insert or ignore into platform_usage_samples (
        id, source_ref, channel_ref, edge_credential_ref, account_id,
        entitlement_id, request_id, observed_at, interval_started_at,
        interval_ended_at, upload_bytes, download_bytes, total_bytes,
        sample_digest, created_at
      ) values (
        @id, @sourceRef, @channelRef, @edgeCredentialRef, @accountId,
        @entitlementId, @requestId, @observedAt, @intervalStartedAt,
        @intervalEndedAt, @uploadBytes, @downloadBytes, @totalBytes,
        @sampleDigest, @createdAt
      )
    `).run(record);
    if (result.changes === 0) {
      return false;
    }
    sqliteRun(db.prepare(`
      insert into platform_usage_rollups (
        edge_credential_ref, account_id, entitlement_id, request_id, channel_ref,
        upload_bytes, download_bytes, total_bytes, last_observed_at, updated_at
      ) values (
        @edgeCredentialRef, @accountId, @entitlementId, @requestId, @channelRef,
        @uploadBytes, @downloadBytes, @totalBytes, @observedAt, @createdAt
      )
      on conflict(edge_credential_ref)
      do update set
        upload_bytes = platform_usage_rollups.upload_bytes + excluded.upload_bytes,
        download_bytes = platform_usage_rollups.download_bytes + excluded.download_bytes,
        total_bytes = platform_usage_rollups.total_bytes + excluded.total_bytes,
        last_observed_at = excluded.last_observed_at,
        updated_at = excluded.updated_at
    `), record);
    return true;
  }

  function recordUsageSample(input) {
    const record = usageSampleRecord(input);
    const inserted = db.transaction(() => insertUsageSampleRecord(record))();
    return {
      inserted,
      sample: getUsageSampleByDigest(record.sampleDigest),
      rollup: getUsageRollupByEdgeCredentialRef(record.edgeCredentialRef)
    };
  }

  function upsertUsageCounterCursor(record) {
    sqliteRun(db.prepare(`
      insert into platform_usage_counter_cursors (
        source_ref, channel_ref, edge_credential_ref, upload_bytes,
        download_bytes, observed_at, epoch, updated_at
      ) values (
        @sourceRef, @channelRef, @edgeCredentialRef, @uploadBytes,
        @downloadBytes, @observedAt, @epoch, @updatedAt
      )
      on conflict(source_ref, channel_ref, edge_credential_ref)
      do update set
        upload_bytes = excluded.upload_bytes,
        download_bytes = excluded.download_bytes,
        observed_at = excluded.observed_at,
        epoch = excluded.epoch,
        updated_at = excluded.updated_at
    `), record);
  }

  function recordCumulativeUsageSample(input) {
    const current = {
      sourceRef: requiredText(input.sourceRef, "sourceRef"),
      channelRef: requiredText(input.channelRef, "channelRef"),
      edgeCredentialRef: requiredText(input.edgeCredentialRef, "edgeCredentialRef"),
      accountId: requiredText(input.accountId, "accountId"),
      entitlementId: requiredText(input.entitlementId, "entitlementId"),
      requestId: requiredText(input.requestId, "requestId"),
      observedAt: isoText(input.observedAt, "observedAt"),
      intervalEndedAt: isoText(input.intervalEndedAt, "intervalEndedAt"),
      uploadBytes: integer(input.uploadBytes ?? 0, "uploadBytes", { min: 0 }),
      downloadBytes: integer(input.downloadBytes ?? 0, "downloadBytes", { min: 0 }),
      createdAt: isoText(input.createdAt, "createdAt")
    };

    return db.transaction(() => {
      const cursor = getUsageCounterCursor(current);
      if (!cursor) {
        upsertUsageCounterCursor({
          ...current,
          epoch: 0,
          updatedAt: current.createdAt
        });
        return {
          status: "cursor_initialized",
          inserted: false,
          sample: null,
          rollup: getUsageRollupByEdgeCredentialRef(current.edgeCredentialRef)
        };
      }

      if (Date.parse(current.observedAt) <= Date.parse(cursor.observedAt)) {
        return {
          status: "stale_observation",
          inserted: false,
          sample: null,
          rollup: getUsageRollupByEdgeCredentialRef(current.edgeCredentialRef)
        };
      }

      if (current.uploadBytes < cursor.uploadBytes || current.downloadBytes < cursor.downloadBytes) {
        upsertUsageCounterCursor({
          ...current,
          epoch: cursor.epoch + 1,
          updatedAt: current.createdAt
        });
        return {
          status: "counter_reset_detected",
          inserted: false,
          sample: null,
          rollup: getUsageRollupByEdgeCredentialRef(current.edgeCredentialRef)
        };
      }

      const uploadBytes = current.uploadBytes - cursor.uploadBytes;
      const downloadBytes = current.downloadBytes - cursor.downloadBytes;
      if (uploadBytes === 0 && downloadBytes === 0) {
        upsertUsageCounterCursor({
          ...current,
          epoch: cursor.epoch,
          updatedAt: current.createdAt
        });
        return {
          status: "no_delta",
          inserted: false,
          sample: null,
          rollup: getUsageRollupByEdgeCredentialRef(current.edgeCredentialRef)
        };
      }

      const sampleDigest = `sha256:${sha256([
        current.sourceRef,
        current.channelRef,
        current.edgeCredentialRef,
        current.requestId,
        cursor.epoch,
        current.uploadBytes,
        current.downloadBytes
      ].join("\0"))}`;
      const record = usageSampleRecord({
        ...current,
        id: `usage_${sampleDigest.slice("sha256:".length, "sha256:".length + 24)}`,
        intervalStartedAt: cursor.observedAt,
        uploadBytes,
        downloadBytes,
        sampleDigest
      });
      const inserted = insertUsageSampleRecord(record);
      upsertUsageCounterCursor({
        ...current,
        epoch: cursor.epoch,
        updatedAt: current.createdAt
      });
      return {
        status: inserted ? "calculated" : "already_recorded",
        inserted,
        sample: getUsageSampleByDigest(sampleDigest),
        rollup: getUsageRollupByEdgeCredentialRef(current.edgeCredentialRef)
      };
    })();
  }

  function upsertQuotaCounter(input) {
    assertNoUnsafeFields(input);
    const record = {
      accountId: requiredText(input.accountId, "accountId"),
      entitlementId: requiredText(input.entitlementId, "entitlementId"),
      metric: requiredText(input.metric, "metric"),
      period: requiredText(input.period, "period"),
      amount: integer(input.amount ?? 0, "amount", { min: 0 }),
      updatedAt: isoText(input.updatedAt, "updatedAt")
    };
    sqliteRun(db.prepare(`
      insert into platform_quota_counters (
        account_id, entitlement_id, metric, period, amount, updated_at
      ) values (
        @accountId, @entitlementId, @metric, @period, @amount, @updatedAt
      )
      on conflict(account_id, entitlement_id, metric, period)
      do update set
        amount = platform_quota_counters.amount + excluded.amount,
        updated_at = excluded.updated_at
    `), record);
    return mapQuotaCounter(db.prepare(`
      select * from platform_quota_counters
      where account_id = ? and entitlement_id = ? and metric = ? and period = ?
    `).get(record.accountId, record.entitlementId, record.metric, record.period));
  }

  function bindDevice(input) {
    assertNoUnsafeFields(input);
    const record = {
      id: requiredText(input.id, "id"),
      accountId: requiredText(input.accountId, "accountId"),
      artifactRef: requiredText(input.artifactRef, "artifactRef"),
      deviceRef: requiredText(input.deviceRef, "deviceRef"),
      status: requiredText(input.status || "active", "status"),
      firstSeenAt: isoText(input.firstSeenAt, "firstSeenAt"),
      lastSeenAt: isoText(input.lastSeenAt, "lastSeenAt")
    };
    sqliteRun(db.prepare(`
      insert into platform_device_bindings (
        id, account_id, artifact_ref, device_ref, status, first_seen_at, last_seen_at
      ) values (
        @id, @accountId, @artifactRef, @deviceRef, @status, @firstSeenAt, @lastSeenAt
      )
    `), record);
    return getDeviceBinding(record.id);
  }

  function getDeviceBinding(id) {
    return mapDeviceBinding(db.prepare("select * from platform_device_bindings where id = ?").get(requiredText(id, "id")));
  }

  function recordRevocation(input) {
    assertNoUnsafeFields(input);
    const record = {
      id: requiredText(input.id, "id"),
      requestId: requiredText(input.requestId, "requestId"),
      issuedLinkId: optionalText(input.issuedLinkId),
      tenantRef: requiredText(input.tenantRef, "tenantRef"),
      artifactRef: requiredText(input.artifactRef, "artifactRef"),
      reasonCode: requiredText(input.reasonCode, "reasonCode"),
      revokedByRef: requiredText(input.revokedByRef, "revokedByRef"),
      createdAt: isoText(input.createdAt, "createdAt")
    };
    sqliteRun(db.prepare(`
      insert into platform_revocation_events (
        id, request_id, issued_link_id, tenant_ref, artifact_ref,
        reason_code, revoked_by_ref, created_at
      ) values (
        @id, @requestId, @issuedLinkId, @tenantRef, @artifactRef,
        @reasonCode, @revokedByRef, @createdAt
      )
    `), record);
    return getRevocationEvent(record.id);
  }

  function getRevocationEvent(id) {
    return mapRevocationEvent(db.prepare("select * from platform_revocation_events where id = ?").get(requiredText(id, "id")));
  }

  function auditMetadataJson(input) {
    const entityType = requiredText(input.entityType, "entityType");
    const action = requiredText(input.action, "action");
    const metadata = snapshotControlJsonObject(input.metadata, "audit metadata");
    const entityRef = safeControlRef(input.entityRef, "entityRef");
    const actorRef = safeControlRef(input.actorRef, "actorRef");
    const id = safeControlRef(input.id, "id");
    const createdAt = isoText(input.createdAt, "createdAt");

    if (entityType === "issuance_request" && action === "issued") {
      exactObject(metadata, {
        allowed: ["source"],
        required: ["source"],
        name: "issuanceAuditMetadata"
      });
      if (metadata.source !== "platform:issue-subscription") {
        throw platformError("validation_error", "issuance audit source is not allowed");
      }
      return JSON.stringify(metadata);
    }

    if (entityType === "issuance_request" && action === "issuance_failed_compensated") {
      exactObject(metadata, {
        allowed: ["compensation"],
        required: ["compensation"],
        name: "issuanceCompensationAuditMetadata"
      });
      const compensation = snapshotControlJsonObject(metadata.compensation, "compensation");
      exactObject(compensation, {
        allowed: ["artifactRevoked", "tenantDisabled"],
        required: ["artifactRevoked", "tenantDisabled"],
        name: "issuanceCompensation"
      });
      if (
        typeof compensation.artifactRevoked !== "boolean"
        || typeof compensation.tenantDisabled !== "boolean"
      ) {
        throw platformError("validation_error", "issuance compensation audit flags are invalid");
      }
      return JSON.stringify({ compensation });
    }

    if (entityType === "entitlement" && action === "traffic_limit_updated") {
      exactObject(metadata, {
        allowed: ["requestRef", "reasonCode", "previousTrafficLimitBytes", "trafficLimitBytes"],
        required: ["requestRef", "reasonCode", "previousTrafficLimitBytes", "trafficLimitBytes"],
        name: "trafficLimitAuditMetadata"
      });
      safeControlRef(metadata.requestRef, "requestRef");
      if (
        typeof metadata.reasonCode !== "string"
        || !/^[A-Za-z0-9][A-Za-z0-9_:-]{0,79}$/.test(metadata.reasonCode)
        || /https?:|token|secret|credential|password|private|customer|@|\//i.test(metadata.reasonCode)
      ) {
        throw platformError("validation_error", "traffic-limit audit reason code is invalid");
      }
      if (!Number.isSafeInteger(metadata.previousTrafficLimitBytes) || metadata.previousTrafficLimitBytes < 0
        || !Number.isSafeInteger(metadata.trafficLimitBytes) || metadata.trafficLimitBytes < 0) {
        throw platformError("validation_error", "traffic-limit audit byte values are invalid");
      }
      return JSON.stringify(metadata);
    }

    if (entityType === WALLET_FIRST_RESOURCE_EFFECT_AUDIT_ENTITY_TYPE) {
      const audit = { entityType, action, actorRef, metadata };
      if (action === "resource_effect_prepared") {
        const prepared = walletFirstResourceEffectPreparedFromAudit(audit);
        if (
          !prepared
          || entityRef !== prepared.transitionRef
          || id !== walletFirstResourceEffectPreparationRef(prepared.transitionRef)
        ) {
          throw platformError("validation_error", "wallet-first preparation audit binding is invalid");
        }
      } else if (action === "resource_runtime_applied") {
        const runtime = walletFirstResourceEffectRuntimeReceiptFromAudit(audit);
        if (!runtime || entityRef !== runtime.transitionRef || id !== runtime.runtimeReceiptRef) {
          throw platformError("validation_error", "wallet-first runtime audit binding is invalid");
        }
      } else if (action === "resource_effect_applied") {
        const receipt = walletFirstResourceEffectReceiptFromAudit(audit);
        if (!receipt || entityRef !== receipt.transitionRef || id !== receipt.effectRef) {
          throw platformError("validation_error", "wallet-first receipt audit binding is invalid");
        }
      } else {
        throw platformError("validation_error", "wallet-first audit action is not allowed");
      }
      return JSON.stringify(metadata);
    }

    if (
      entityType === "coin_commerce_subscription_fulfillment"
      && action === "subscription_fulfillment_applied"
    ) {
      const metadataJson = coinCommerceSubscriptionFulfillmentMetadataJson(metadata);
      const parsed = parseCoinCommerceFulfillmentEffect({
        id,
        entityType,
        entityRef,
        action,
        actorRef,
        createdAt,
        metadata
      }, {
        accountId: metadata.accountId,
        entitlementRef: metadata.entitlementRef
      });
      if (!parsed) throw platformError("validation_error", "subscription fulfillment audit metadata is invalid");
      return metadataJson;
    }

    if (
      entityType === "coin_commerce_data_pack_fulfillment"
      && action === "data_pack_fulfillment_applied"
    ) {
      const fields = [
        "version", "kind", "commandRef", "orderRef", "accountId", "requestRef",
        "entitlementRef", "issuedLinkRef", "offerVersionRef", "quotaBytes",
        "commercialNeverExpires", "technicalValidUntil"
      ];
      exactObject(metadata, {
        allowed: fields,
        required: fields,
        name: "dataPackFulfillmentAuditMetadata"
      });
      if (
        metadata.version !== 1
        || metadata.kind !== "data_pack"
        || actorRef !== "coin_commerce_fulfillment"
        || entityRef !== safeControlRef(metadata.entitlementRef, "entitlementRef")
        || id !== effectRefForCommand(safeControlRef(metadata.commandRef, "commandRef"))
        || metadata.commercialNeverExpires !== true
      ) {
        throw platformError("validation_error", "data-pack fulfillment audit binding is invalid");
      }
      for (const field of [
        "orderRef", "accountId", "requestRef", "issuedLinkRef", "offerVersionRef"
      ]) safeControlRef(metadata[field], field);
      if (!Number.isSafeInteger(metadata.quotaBytes) || metadata.quotaBytes < 1
        || isoText(metadata.technicalValidUntil, "technicalValidUntil") !== metadata.technicalValidUntil) {
        throw platformError("validation_error", "data-pack fulfillment audit values are invalid");
      }
      return JSON.stringify(metadata);
    }

    throw platformError("validation_error", "audit entity/action JSON contract is not registered");
  }

  function recordAuditEvent(input) {
    const snapshot = snapshotControlJsonObject(input, "audit event");
    const metadataJson = auditMetadataJson(snapshot);
    assertNoUnsafeFields({
      ...snapshot,
      metadata: JSON.parse(metadataJson)
    });
    const record = {
      id: safeControlRef(snapshot.id, "id"),
      entityType: requiredText(snapshot.entityType, "entityType"),
      entityRef: safeControlRef(snapshot.entityRef, "entityRef"),
      action: requiredText(snapshot.action, "action"),
      actorRef: safeControlRef(snapshot.actorRef, "actorRef"),
      createdAt: isoText(snapshot.createdAt, "createdAt"),
      metadataJson
    };
    sqliteRun(db.prepare(`
      insert into platform_audit_events (
        id, entity_type, entity_ref, action, actor_ref, created_at, metadata_json
      ) values (
        @id, @entityType, @entityRef, @action, @actorRef, @createdAt, @metadataJson
      )
    `), record);
    return getAuditEvent(record.id);
  }

  function getAuditEvent(id) {
    return mapAuditEvent(db.prepare("select * from platform_audit_events where id = ?").get(requiredText(id, "id")));
  }

  function edgeRegisteredNodeRecord(input) {
    assertNoUnsafeFields(input);
    assertNoUnsafeControlValues(input.metadata);
    const now = isoText(input.updatedAt || input.registeredAt, "updatedAt");
    return {
      nodeRef: safeControlRef(input.nodeRef, "nodeRef"),
      providerRef: safeControlRef(input.providerRef, "providerRef"),
      regionRef: safeControlRef(input.regionRef, "regionRef"),
      roleRef: safeControlRef(input.roleRef, "roleRef"),
      channelRefsJson: jsonArray(safeControlRefList(input.channelRefs, "channelRefs"), "channelRefs"),
      imageManifestRef: safeControlRef(input.imageManifestRef, "imageManifestRef"),
      releaseRef: safeControlRef(input.releaseRef, "releaseRef"),
      lifecycle: safeControlRef(input.lifecycle || "registered", "lifecycle"),
      status: safeControlRef(input.status || "active", "status"),
      firstBootPacketRef: safeControlRef(input.firstBootPacketRef, "firstBootPacketRef"),
      registeredAt: isoText(input.registeredAt || now, "registeredAt"),
      updatedAt: now,
      metadataJson: edgeNodeMetadataJson(input.metadata)
    };
  }

  // Boundary note: this store's record methods are ungated persistence
  // primitives. The registration execution gate and the no-overwrite
  // identity-binding rule live at the registration service layer
  // (node-registration-ingestion / node-registration-execution);
  // registration writes must go through that layer and use
  // insertEdgeRegisteredNodeIfAbsent. This upsert remains for
  // non-registration callers and test fixtures and must never be used to
  // overwrite an established registration identity binding.
  function upsertEdgeRegisteredNode(input) {
    const record = edgeRegisteredNodeRecord(input);
    sqliteRun(db.prepare(`
      insert into platform_edge_registered_nodes (
        node_ref, provider_ref, region_ref, role_ref, channel_refs_json,
        image_manifest_ref, release_ref, lifecycle, status, first_boot_packet_ref,
        registered_at, updated_at, metadata_json
      ) values (
        @nodeRef, @providerRef, @regionRef, @roleRef, @channelRefsJson,
        @imageManifestRef, @releaseRef, @lifecycle, @status, @firstBootPacketRef,
        @registeredAt, @updatedAt, @metadataJson
      )
      on conflict(node_ref) do update set
        provider_ref = excluded.provider_ref,
        region_ref = excluded.region_ref,
        role_ref = excluded.role_ref,
        channel_refs_json = excluded.channel_refs_json,
        image_manifest_ref = excluded.image_manifest_ref,
        release_ref = excluded.release_ref,
        lifecycle = excluded.lifecycle,
        status = excluded.status,
        first_boot_packet_ref = excluded.first_boot_packet_ref,
        updated_at = excluded.updated_at,
        metadata_json = excluded.metadata_json
    `), record);
    return getEdgeRegisteredNode(record.nodeRef);
  }

  // Insert-only counterpart of upsertEdgeRegisteredNode: the single
  // statement either lands the new row or leaves an existing row for the
  // same node_ref completely untouched, so race-safe registration flows
  // can build on it (attempt the insert, then compare the read-back
  // record) instead of a check-then-upsert sequence that two concurrent
  // writers could interleave into a silent overwrite.
  function insertEdgeRegisteredNodeIfAbsent(input) {
    const record = edgeRegisteredNodeRecord(input);
    const info = sqliteRun(db.prepare(`
      insert into platform_edge_registered_nodes (
        node_ref, provider_ref, region_ref, role_ref, channel_refs_json,
        image_manifest_ref, release_ref, lifecycle, status, first_boot_packet_ref,
        registered_at, updated_at, metadata_json
      ) values (
        @nodeRef, @providerRef, @regionRef, @roleRef, @channelRefsJson,
        @imageManifestRef, @releaseRef, @lifecycle, @status, @firstBootPacketRef,
        @registeredAt, @updatedAt, @metadataJson
      )
      on conflict(node_ref) do nothing
    `), record);
    return {
      inserted: info.changes > 0,
      record: getEdgeRegisteredNode(record.nodeRef)
    };
  }

  function getEdgeRegisteredNode(nodeRef) {
    return mapEdgeRegisteredNode(db.prepare(`
      select * from platform_edge_registered_nodes where node_ref = ?
    `).get(safeControlRef(nodeRef, "nodeRef")));
  }

  function listEdgeRegisteredNodes(filters = {}) {
    assertNoUnsafeFields(filters);
    const status = optionalText(filters.status);
    const providerRef = optionalText(filters.providerRef);
    const regionRef = optionalText(filters.regionRef);
    const clauses = [];
    const params = [];
    if (status) {
      clauses.push("status = ?");
      params.push(safeControlRef(status, "status"));
    }
    if (providerRef) {
      clauses.push("provider_ref = ?");
      params.push(safeControlRef(providerRef, "providerRef"));
    }
    if (regionRef) {
      clauses.push("region_ref = ?");
      params.push(safeControlRef(regionRef, "regionRef"));
    }
    const where = clauses.length > 0 ? `where ${clauses.join(" and ")}` : "";
    return db.prepare(`
      select * from platform_edge_registered_nodes
      ${where}
      order by registered_at asc, node_ref asc
    `).all(...params).map(mapEdgeRegisteredNode);
  }

  function getLatestEdgeDesiredStateForChannel(channelRef, filters = {}) {
    assertNoUnsafeFields(filters);
    const safeChannelRef = requiredText(channelRef, "channelRef");
    const nodeRef = requiredText(filters.nodeRef || safeChannelRef, "nodeRef");
    const portalRows = db.prepare(`
      select
        r.id as request_id,
        r.status as request_status,
        r.next_action,
        coalesce(r.valid_until, r.expires_at) as valid_until,
        r.updated_at,
        r.event_json,
        c.edge_channel_ref,
        c.edge_credential_ref,
        c.edge_material_digest
      from platform_portal_access_requests r
      join platform_portal_edge_credentials c on c.request_id = r.id
      where c.edge_channel_ref = ?
      order by c.edge_credential_ref asc, r.updated_at asc, r.id asc
    `).all(safeChannelRef);
    const nowMs = Date.now();
    const pack = readDataPackDesiredStateRows(db, safeChannelRef, nowMs);
    const rows = [...portalRows, ...pack.rows];
    if (rows.length === 0) {
      return null;
    }
    const activeRows = [...portalRows
      .map((row) => ({
        ...row,
        validUntilMs: Date.parse(row.valid_until)
      }))
      .filter((row) => (
        ["delivered", "issued"].includes(row.request_status)
        || (
          row.request_status === "disabled"
          && row.next_action === "traffic_supply_resume_pending"
        )
      ))
      .filter((row) => row.edge_credential_ref && row.edge_material_digest)
      .filter((row) => row.valid_until && !Number.isNaN(row.validUntilMs) && row.validUntilMs > nowMs),
      ...pack.activeRows];
    if (new Set(activeRows.map((row) => row.edge_credential_ref)).size !== activeRows.length) {
      throw platformError("reconciliation_required", "edge desired state credential collision");
    }
    const edgeCredentialRefs = [...new Set(activeRows.map((row) => row.edge_credential_ref))].sort((a, b) => a.localeCompare(b));
    const materialDigests = activeRows
      .map((row) => ({
        channelRef: row.edge_channel_ref,
        edgeCredentialRef: row.edge_credential_ref,
        digest: row.edge_material_digest
      }))
      .sort((a, b) => a.edgeCredentialRef.localeCompare(b.edgeCredentialRef));
    const lifecycleRevisionStates = rows.map(desiredStateLifecycleRevision);
    const lifecycleRevisions = lifecycleRevisionStates
      .map(({ fingerprint }) => fingerprint)
      .sort((left, right) => (
        left.requestRef.localeCompare(right.requestRef)
        || String(left.lifecycleRevisionRef || left.updatedAt)
          .localeCompare(String(right.lifecycleRevisionRef || right.updatedAt))
      ));
    const lifecycleRevisionSafe = lifecycleRevisionStates.every(({ safe }) => safe);
    const lifecycleTimes = rows
      .flatMap((row) => [Date.parse(row.valid_until), Date.parse(row.updated_at)])
      .filter((value) => !Number.isNaN(value));
    const validUntil = activeRows.length > 0
      ? new Date(Math.min(...activeRows.map((row) => row.validUntilMs))).toISOString()
      : new Date(Math.max(...lifecycleTimes)).toISOString();
    const fingerprint = sha256(JSON.stringify({
      nodeRef,
      channelRef: safeChannelRef,
      edgeCredentialRefs,
      materialDigests,
      lifecycleRevisions,
      validUntil
    })).slice(0, 24);
    const generation = `gen_${fingerprint}`;
    return {
      desiredStateRef: `desired_state_${safeChannelRef}_${fingerprint}`,
      nodeRef,
      generation,
      channelRefs: [safeChannelRef],
      edgeCredentialRefs,
      materialDigests,
      validUntil,
      lifecycleRevisionSafe,
      redacted: true
    };
  }

  function recordEdgeApplyReceipt(input) {
    assertNoUnsafeFields(input);
    const actionCounts = input.actionCounts ?? {};
    const record = {
      id: requiredText(input.id, "id"),
      channelRef: requiredText(input.channelRef, "channelRef"),
      desiredStateRef: requiredText(input.desiredStateRef, "desiredStateRef"),
      status: requiredText(input.status, "status"),
      addCount: integer(actionCounts.add ?? 0, "actionCounts.add", { min: 0 }),
      revokeCount: integer(actionCounts.revoke ?? 0, "actionCounts.revoke", { min: 0 }),
      rotateCount: integer(actionCounts.rotate ?? 0, "actionCounts.rotate", { min: 0 }),
      unchangedCount: integer(actionCounts.unchanged ?? 0, "actionCounts.unchanged", { min: 0 }),
      configTestOk: input.configTestOk === true ? 1 : 0,
      serviceActive: input.serviceActive === true ? 1 : 0,
      listenerUdp443: listenerReadyFlag(input),
      backupRef: optionalText(input.backupRef),
      rollbackRef: optionalText(input.rollbackRef),
      appliedAt: optionalIsoText(input.appliedAt, "appliedAt"),
      createdAt: isoText(input.createdAt, "createdAt")
    };
    sqliteRun(db.prepare(`
      insert into platform_edge_apply_receipts (
        id, channel_ref, desired_state_ref, status, add_count, revoke_count,
        rotate_count, unchanged_count, config_test_ok, service_active,
        listener_udp443, backup_ref, rollback_ref, applied_at, created_at
      ) values (
        @id, @channelRef, @desiredStateRef, @status, @addCount, @revokeCount,
        @rotateCount, @unchangedCount, @configTestOk, @serviceActive,
        @listenerUdp443, @backupRef, @rollbackRef, @appliedAt, @createdAt
      )
      on conflict(id) do update set
        channel_ref = excluded.channel_ref,
        desired_state_ref = excluded.desired_state_ref,
        status = excluded.status,
        add_count = excluded.add_count,
        revoke_count = excluded.revoke_count,
        rotate_count = excluded.rotate_count,
        unchanged_count = excluded.unchanged_count,
        config_test_ok = excluded.config_test_ok,
        service_active = excluded.service_active,
        listener_udp443 = excluded.listener_udp443,
        backup_ref = coalesce(excluded.backup_ref, platform_edge_apply_receipts.backup_ref),
        rollback_ref = coalesce(excluded.rollback_ref, platform_edge_apply_receipts.rollback_ref),
        applied_at = excluded.applied_at,
        created_at = excluded.created_at
    `), record);
    syncEdgeDesiredStateNotificationFromReceipt(record);
    return getEdgeApplyReceipt(record.id);
  }

  function syncEdgeDesiredStateNotificationFromReceipt(record) {
    const notificationStatus = (
      record.status === "applied"
      && record.configTestOk === 1
      && record.serviceActive === 1
      && record.listenerUdp443 === 1
    )
      ? "applied"
      : (record.status === "failed" ? "failed" : "");
    if (!notificationStatus) {
      return;
    }
    sqliteRun(db.prepare(`
      update platform_edge_desired_state_notifications
      set status = @status,
          updated_at = @updatedAt
      where channel_ref = @channelRef
        and desired_state_ref = @desiredStateRef
        and status in ('pending', 'acknowledged')
    `), {
      status: notificationStatus,
      updatedAt: record.appliedAt || record.createdAt,
      channelRef: record.channelRef,
      desiredStateRef: record.desiredStateRef
    });
  }

  function getEdgeApplyReceipt(id) {
    return mapEdgeApplyReceipt(db.prepare("select * from platform_edge_apply_receipts where id = ?").get(requiredText(id, "id")));
  }

  function listEdgeApplyReceipts(filters = {}) {
    const channelRef = optionalText(filters.channelRef);
    if (channelRef) {
      return db.prepare(`
        select * from platform_edge_apply_receipts
        where channel_ref = ?
        order by created_at asc, id asc
      `).all(channelRef).map(mapEdgeApplyReceipt);
    }
    return db.prepare(`
      select * from platform_edge_apply_receipts
      order by created_at asc, id asc
    `).all().map(mapEdgeApplyReceipt);
  }

  function recordEdgeDesiredStateNotification(input) {
    assertNoUnsafeFields(input);
    const now = isoText(input.updatedAt || input.createdAt, "updatedAt");
    const record = {
      id: safeControlRef(input.id, "id"),
      nodeRef: safeControlRef(input.nodeRef, "nodeRef"),
      channelRef: safeControlRef(input.channelRef, "channelRef"),
      desiredStateRef: safeControlRef(input.desiredStateRef, "desiredStateRef"),
      generation: safeEdgeGeneration(input.generation),
      reason: requiredText(input.reason, "reason"),
      status: requiredText(input.status || "pending", "status"),
      preserveApplied: input.lifecycleRevisionSafe === false ? 0 : 1,
      createdAt: isoText(input.createdAt || now, "createdAt"),
      updatedAt: now
    };
    sqliteRun(db.prepare(`
      insert into platform_edge_desired_state_notifications (
        id, node_ref, channel_ref, desired_state_ref, generation, reason,
        status, created_at, updated_at
      ) values (
        @id, @nodeRef, @channelRef, @desiredStateRef, @generation, @reason,
        @status, @createdAt, @updatedAt
      )
      on conflict(id) do update set
        node_ref = excluded.node_ref,
        channel_ref = excluded.channel_ref,
        desired_state_ref = excluded.desired_state_ref,
        generation = excluded.generation,
        reason = excluded.reason,
        status = case
          when platform_edge_desired_state_notifications.status = 'applied'
            and @preserveApplied = 1
            and platform_edge_desired_state_notifications.node_ref = excluded.node_ref
            and platform_edge_desired_state_notifications.channel_ref = excluded.channel_ref
            and platform_edge_desired_state_notifications.desired_state_ref = excluded.desired_state_ref
            and platform_edge_desired_state_notifications.generation = excluded.generation
            and platform_edge_desired_state_notifications.reason = excluded.reason
          then platform_edge_desired_state_notifications.status
          else excluded.status
        end,
        updated_at = case
          when platform_edge_desired_state_notifications.status = 'applied'
            and @preserveApplied = 1
            and platform_edge_desired_state_notifications.node_ref = excluded.node_ref
            and platform_edge_desired_state_notifications.channel_ref = excluded.channel_ref
            and platform_edge_desired_state_notifications.desired_state_ref = excluded.desired_state_ref
            and platform_edge_desired_state_notifications.generation = excluded.generation
            and platform_edge_desired_state_notifications.reason = excluded.reason
          then platform_edge_desired_state_notifications.updated_at
          else excluded.updated_at
        end
    `), record);
    return getEdgeDesiredStateNotification(record.id);
  }

  function getEdgeDesiredStateNotification(id) {
    return mapEdgeDesiredStateNotification(db.prepare(`
      select * from platform_edge_desired_state_notifications where id = ?
    `).get(requiredText(id, "id")));
  }

  function listEdgeDesiredStateNotifications(filters = {}) {
    assertNoUnsafeFields(filters);
    const nodeRef = optionalText(filters.nodeRef);
    const channelRef = optionalText(filters.channelRef);
    const status = optionalText(filters.status);
    const clauses = [];
    const params = [];
    if (nodeRef) {
      clauses.push("node_ref = ?");
      params.push(nodeRef);
    }
    if (channelRef) {
      clauses.push("channel_ref = ?");
      params.push(channelRef);
    }
    if (status) {
      clauses.push("status = ?");
      params.push(status);
    }
    const where = clauses.length > 0 ? `where ${clauses.join(" and ")}` : "";
    return db.prepare(`
      select * from platform_edge_desired_state_notifications
      ${where}
      order by created_at asc, id asc
    `).all(...params).map(mapEdgeDesiredStateNotification);
  }

  function acquireEdgeAgentLease(input) {
    assertNoUnsafeFields(input);
    const record = {
      leaseRef: requiredText(input.leaseRef, "leaseRef"),
      agentRef: requiredText(input.agentRef, "agentRef"),
      nodeRef: requiredText(input.nodeRef, "nodeRef"),
      channelRef: requiredText(input.channelRef, "channelRef"),
      desiredStateRef: optionalText(input.desiredStateRef),
      status: requiredText(input.status || "active", "status"),
      acquiredAt: isoText(input.acquiredAt, "acquiredAt"),
      renewedAt: isoText(input.renewedAt, "renewedAt"),
      expiresAt: isoText(input.expiresAt, "expiresAt")
    };
    sqliteRun(db.prepare(`
      insert into platform_edge_agent_leases (
        lease_ref, agent_ref, node_ref, channel_ref, desired_state_ref,
        status, acquired_at, renewed_at, expires_at
      ) values (
        @leaseRef, @agentRef, @nodeRef, @channelRef, @desiredStateRef,
        @status, @acquiredAt, @renewedAt, @expiresAt
      )
      on conflict(lease_ref) do update set
        agent_ref = excluded.agent_ref,
        node_ref = excluded.node_ref,
        channel_ref = excluded.channel_ref,
        desired_state_ref = excluded.desired_state_ref,
        status = excluded.status,
        renewed_at = excluded.renewed_at,
        expires_at = excluded.expires_at
    `), record);
    return mapEdgeAgentLease(db.prepare("select * from platform_edge_agent_leases where lease_ref = ?").get(record.leaseRef));
  }

  function listPortalEdgeCredentials(requestId) {
    return db.prepare(`
      select edge_channel_ref, edge_credential_ref, edge_material_digest
      from platform_portal_edge_credentials
      where request_id = ?
      order by ordinal asc, edge_channel_ref asc
    `).all(requiredText(requestId, "requestId")).map(mapPortalEdgeCredential);
  }

  function getPortalEdgeCredentialChannelRef(edgeCredentialRef) {
    const rows = db.prepare(`
      select distinct edge_channel_ref
      from platform_portal_edge_credentials
      where edge_credential_ref = ?
      order by edge_channel_ref asc
    `).all(requiredText(edgeCredentialRef, "edgeCredentialRef"));
    return rows.length === 1 ? rows[0].edge_channel_ref : null;
  }

  function getPortalEdgeCredentialChannelRefByScopeDigest(scopeCredentialDigest) {
    const safeDigest = requiredText(scopeCredentialDigest, "scopeCredentialDigest");
    if (!/^sha256:[a-f0-9]{64}$/.test(safeDigest)) {
      return null;
    }
    const matches = db.prepare(`
      select edge_channel_ref, edge_credential_ref
      from platform_portal_edge_credentials
      order by edge_credential_ref asc
    `).all().filter((row) => portalEdgeCredentialScopeDigest(row.edge_credential_ref) === safeDigest);
    return matches.length === 1 ? matches[0].edge_channel_ref : null;
  }

  // The Agent scopes tombstones across legacy and pack principals. Keep the
  // legacy-only lookup above intact for callers that explicitly require it.
  function getEdgeCredentialChannelRef(edgeCredentialRef) {
    const safeRef = requiredText(edgeCredentialRef, "edgeCredentialRef");
    const rows = db.prepare(`
      select edge_channel_ref from platform_portal_edge_credentials
      where edge_credential_ref = ?
      union all
      select edge_channel_ref from platform_data_pack_edge_credentials
      where edge_credential_ref = ?
    `).all(safeRef, safeRef);
    return rows.length === 1 ? rows[0].edge_channel_ref : null;
  }

  function getEdgeCredentialChannelRefByScopeDigest(scopeCredentialDigest) {
    const safeDigest = requiredText(scopeCredentialDigest, "scopeCredentialDigest");
    if (!/^sha256:[a-f0-9]{64}$/.test(safeDigest)) return null;
    const rows = db.prepare(`
      select edge_channel_ref, edge_credential_ref from platform_portal_edge_credentials
      union all
      select edge_channel_ref, edge_credential_ref from platform_data_pack_edge_credentials
    `).all().filter((row) => portalEdgeCredentialScopeDigest(row.edge_credential_ref) === safeDigest);
    return rows.length === 1 ? rows[0].edge_channel_ref : null;
  }

  function attachPortalEdgeCredentials(record) {
    if (!record) {
      return null;
    }
    const edgeCredentials = listPortalEdgeCredentials(record.id);
    return edgeCredentials.length > 0 ? { ...record, edgeCredentials } : record;
  }

  function normalizePortalEdgeCredentials(input, record) {
    const rawCredentials = Array.isArray(input.edgeCredentials) ? input.edgeCredentials : [];
    const seen = new Set();
    const credentials = [];
    for (const credential of rawCredentials) {
      const edgeChannelRef = requiredText(credential?.edgeChannelRef, "edgeChannelRef");
      const edgeCredentialRef = requiredText(credential?.edgeCredentialRef, "edgeCredentialRef");
      const edgeMaterialDigest = requiredText(credential?.edgeMaterialDigest, "edgeMaterialDigest");
      const key = `${edgeChannelRef}\u0000${edgeCredentialRef}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      credentials.push({ edgeChannelRef, edgeCredentialRef, edgeMaterialDigest });
    }
    if (credentials.length === 0 && record.edgeChannelRef && record.edgeCredentialRef && record.edgeMaterialDigest) {
      credentials.push({
        edgeChannelRef: record.edgeChannelRef,
        edgeCredentialRef: record.edgeCredentialRef,
        edgeMaterialDigest: record.edgeMaterialDigest
      });
    }
    return credentials;
  }

  function upsertPortalAccessRequest(input) {
    const record = {
      id: requiredText(input.id, "id"),
      portalUserRef: requiredText(input.portalUserRef, "portalUserRef"),
      plan: requiredText(input.plan, "plan"),
      clientTarget: requiredText(input.clientTarget || "clash", "clientTarget"),
      durationDays: integer(input.durationDays, "durationDays", { min: 1 }),
      quantity: integer(input.quantity ?? 1, "quantity", { min: 1 }),
      status: requiredText(input.status, "status"),
      nextAction: requiredText(input.nextAction, "nextAction"),
      noteProvided: input.noteProvided ? 1 : 0,
      priorTrialState: requiredText(input.priorTrialState, "priorTrialState"),
      submittedAt: isoText(input.submittedAt, "submittedAt"),
      updatedAt: isoText(input.updatedAt, "updatedAt"),
      reviewedAt: optionalIsoText(input.reviewedAt, "reviewedAt"),
      reviewedByRef: optionalText(input.reviewedByRef),
      safeReasonCode: optionalText(input.safeReasonCode),
      expiresAt: optionalIsoText(input.expiresAt, "expiresAt"),
      validUntil: optionalIsoText(input.validUntil, "validUntil"),
      entitlementRef: optionalText(input.entitlementRef),
      accessGrantRef: optionalText(input.accessGrantRef),
      tenantId: optionalText(input.tenantId),
      artifactId: optionalText(input.artifactId),
      subscriptionUrl: optionalText(input.subscriptionUrl),
      edgeChannelRef: optionalText(input.edgeChannelRef),
      edgeCredentialRef: optionalText(input.edgeCredentialRef),
      edgeMaterialDigest: optionalText(input.edgeMaterialDigest),
      edgeLifecycleMutation: input.edgeLifecycleMutation ? 1 : 0,
      eventJson: portalAccessEventJson(input.event)
    };
    const edgeCredentials = normalizePortalEdgeCredentials(input, record);
    db.transaction(() => {
      sqliteRun(db.prepare(`
        insert into platform_portal_access_requests (
          id, portal_user_ref, plan, client_target, duration_days, quantity,
          status, next_action, note_provided, prior_trial_state, submitted_at,
          updated_at, reviewed_at, reviewed_by_ref, safe_reason_code, expires_at,
          valid_until, entitlement_ref, access_grant_ref, tenant_id, artifact_id,
          subscription_url, edge_channel_ref, edge_credential_ref,
          edge_material_digest, edge_lifecycle_mutation, event_json
        ) values (
          @id, @portalUserRef, @plan, @clientTarget, @durationDays, @quantity,
          @status, @nextAction, @noteProvided, @priorTrialState, @submittedAt,
          @updatedAt, @reviewedAt, @reviewedByRef, @safeReasonCode, @expiresAt,
          @validUntil, @entitlementRef, @accessGrantRef, @tenantId, @artifactId,
          @subscriptionUrl, @edgeChannelRef, @edgeCredentialRef,
          @edgeMaterialDigest, @edgeLifecycleMutation, @eventJson
        )
        on conflict(id) do update set
          portal_user_ref = excluded.portal_user_ref,
          plan = excluded.plan,
          client_target = excluded.client_target,
          duration_days = excluded.duration_days,
          quantity = excluded.quantity,
          status = excluded.status,
          next_action = excluded.next_action,
          note_provided = excluded.note_provided,
          prior_trial_state = excluded.prior_trial_state,
          submitted_at = excluded.submitted_at,
          updated_at = excluded.updated_at,
          reviewed_at = excluded.reviewed_at,
          reviewed_by_ref = excluded.reviewed_by_ref,
          safe_reason_code = excluded.safe_reason_code,
          expires_at = excluded.expires_at,
          valid_until = excluded.valid_until,
          entitlement_ref = excluded.entitlement_ref,
          access_grant_ref = excluded.access_grant_ref,
          tenant_id = excluded.tenant_id,
          artifact_id = excluded.artifact_id,
          subscription_url = excluded.subscription_url,
          edge_channel_ref = excluded.edge_channel_ref,
          edge_credential_ref = excluded.edge_credential_ref,
          edge_material_digest = excluded.edge_material_digest,
          edge_lifecycle_mutation = excluded.edge_lifecycle_mutation,
          event_json = excluded.event_json
      `), record);
      db.prepare("delete from platform_portal_edge_credentials where request_id = ?").run(record.id);
      const insertEdgeCredential = db.prepare(`
        insert into platform_portal_edge_credentials (
          request_id, edge_channel_ref, edge_credential_ref, edge_material_digest, ordinal
        ) values (
          @requestId, @edgeChannelRef, @edgeCredentialRef, @edgeMaterialDigest, @ordinal
        )
      `);
      edgeCredentials.forEach((credential, ordinal) => {
        sqliteRun(insertEdgeCredential, {
          requestId: record.id,
          edgeChannelRef: credential.edgeChannelRef,
          edgeCredentialRef: credential.edgeCredentialRef,
          edgeMaterialDigest: credential.edgeMaterialDigest,
          ordinal
        });
      });
    })();
    return getPortalAccessRequest(record.id);
  }

  function getPortalAccessRequest(id) {
    return attachPortalEdgeCredentials(mapPortalAccessRequest(db.prepare(`
      select * from platform_portal_access_requests
      where id = ?
    `).get(requiredText(id, "id"))));
  }

  function listPortalAccessRequests(filters = {}) {
    const clauses = [];
    const params = [];
    const status = optionalText(filters.status);
    const portalUserRef = optionalText(filters.portalUserRef);
    const plan = optionalText(filters.plan);
    if (status) {
      clauses.push("status = ?");
      params.push(status);
    }
    if (portalUserRef) {
      clauses.push("portal_user_ref = ?");
      params.push(portalUserRef);
    }
    if (plan) {
      clauses.push("plan = ?");
      params.push(plan);
    }
    const where = clauses.length ? `where ${clauses.join(" and ")}` : "";
    return db.prepare(`
      select * from platform_portal_access_requests
      ${where}
      order by submitted_at asc, id asc
    `).all(...params).map(mapPortalAccessRequest).map(attachPortalEdgeCredentials);
  }

  function createPortalEntry(input) {
    const record = {
      id: requiredText(input.id, "id"),
      accountId: requiredText(input.accountId, "accountId"),
      entitlementId: requiredText(input.entitlementId, "entitlementId"),
      tokenHash: requiredText(input.tokenHash, "tokenHash"),
      status: requiredText(input.status || "active", "status"),
      expiresAt: isoText(input.expiresAt, "expiresAt"),
      maxUses: integer(input.maxUses ?? 1, "maxUses", { min: 1 }),
      useCount: integer(input.useCount ?? 0, "useCount", { min: 0 }),
      issuedByRef: requiredText(input.issuedByRef, "issuedByRef"),
      approvalRef: requiredText(input.approvalRef, "approvalRef"),
      usedAt: optionalIsoText(input.usedAt, "usedAt"),
      revokedAt: optionalIsoText(input.revokedAt, "revokedAt"),
      createdAt: isoText(input.createdAt, "createdAt"),
      updatedAt: isoText(input.updatedAt, "updatedAt")
    };
    sqliteRun(db.prepare(`
      insert into platform_portal_entries (
        id, account_id, entitlement_id, token_hash, status, expires_at, max_uses,
        use_count, issued_by_ref, approval_ref, used_at, revoked_at, created_at, updated_at
      ) values (
        @id, @accountId, @entitlementId, @tokenHash, @status, @expiresAt, @maxUses,
        @useCount, @issuedByRef, @approvalRef, @usedAt, @revokedAt, @createdAt, @updatedAt
      )
    `), record);
    return getPortalEntry(record.id);
  }

  function getPortalEntry(id) {
    return mapPortalEntry(db.prepare("select * from platform_portal_entries where id = ?").get(requiredText(id, "id")));
  }

  function findPortalEntryByTokenHash(tokenHash) {
    return mapPortalEntry(db.prepare("select * from platform_portal_entries where token_hash = ?").get(requiredText(tokenHash, "tokenHash")));
  }

  function markPortalEntryUsed(id, { usedAt, updatedAt }) {
    const result = db.prepare(`
      update platform_portal_entries
      set status = 'used', use_count = use_count + 1, used_at = ?, updated_at = ?
      where id = ? and status = 'active'
    `).run(isoText(usedAt, "usedAt"), isoText(updatedAt, "updatedAt"), requiredText(id, "id"));
    if (result.changes !== 1) {
      throw platformError("validation_error", "portal entry is not active");
    }
    return getPortalEntry(id);
  }

  function createPortalTotpCredential(input) {
    const record = {
      id: requiredText(input.id, "id"),
      accountId: requiredText(input.accountId, "accountId"),
      encryptedTotpSecret: requiredText(input.encryptedTotpSecret, "encryptedTotpSecret"),
      status: requiredText(input.status || "active", "status"),
      failureCount: integer(input.failureCount ?? 0, "failureCount", { min: 0 }),
      lockedUntil: optionalIsoText(input.lockedUntil, "lockedUntil"),
      enrolledAt: isoText(input.enrolledAt, "enrolledAt"),
      lastVerifiedAt: optionalIsoText(input.lastVerifiedAt, "lastVerifiedAt"),
      revokedAt: optionalIsoText(input.revokedAt, "revokedAt"),
      updatedAt: isoText(input.updatedAt, "updatedAt")
    };
    sqliteRun(db.prepare(`
      insert into platform_portal_totp_credentials (
        id, account_id, encrypted_totp_secret, status, failure_count, locked_until,
        enrolled_at, last_verified_at, revoked_at, updated_at
      ) values (
        @id, @accountId, @encryptedTotpSecret, @status, @failureCount, @lockedUntil,
        @enrolledAt, @lastVerifiedAt, @revokedAt, @updatedAt
      )
    `), record);
    return getPortalTotpCredential(record.id);
  }

  function getPortalTotpCredential(id) {
    return mapPortalTotpCredential(db.prepare("select * from platform_portal_totp_credentials where id = ?").get(requiredText(id, "id")));
  }

  function getActivePortalTotpCredential(accountId) {
    return mapPortalTotpCredential(db.prepare(`
      select * from platform_portal_totp_credentials
      where account_id = ? and status = 'active'
      order by enrolled_at desc, id desc
      limit 1
    `).get(requiredText(accountId, "accountId")));
  }

  function recordPortalTotpVerificationFailure(id, { lockedUntil = null, updatedAt } = {}) {
    const nextLockedUntil = optionalIsoText(lockedUntil, "lockedUntil");
    const result = db.prepare(`
      update platform_portal_totp_credentials
      set failure_count = failure_count + 1,
          locked_until = coalesce(?, locked_until),
          updated_at = ?
      where id = ? and status = 'active'
    `).run(
      nextLockedUntil,
      isoText(updatedAt, "updatedAt"),
      requiredText(id, "id")
    );
    if (result.changes !== 1) {
      throw platformError("not_found", "active portal TOTP credential not found");
    }
    return getPortalTotpCredential(id);
  }

  function markPortalTotpVerified(id, { verifiedAt, updatedAt }) {
    const result = db.prepare(`
      update platform_portal_totp_credentials
      set failure_count = 0, locked_until = null, last_verified_at = ?, updated_at = ?
      where id = ? and status = 'active'
    `).run(isoText(verifiedAt, "verifiedAt"), isoText(updatedAt, "updatedAt"), requiredText(id, "id"));
    if (result.changes !== 1) {
      throw platformError("not_found", "active portal TOTP credential not found");
    }
    return getPortalTotpCredential(id);
  }

  function createPortalPasswordCredential(input) {
    const record = {
      id: requiredText(input.id, "id"),
      accountId: requiredText(input.accountId, "accountId"),
      passwordHash: requiredText(input.passwordHash, "passwordHash"),
      status: requiredText(input.status || "active", "status"),
      failureCount: integer(input.failureCount ?? 0, "failureCount", { min: 0 }),
      lockedUntil: optionalIsoText(input.lockedUntil, "lockedUntil"),
      mustRotate: input.mustRotate ? 1 : 0,
      createdAt: isoText(input.createdAt, "createdAt"),
      lastVerifiedAt: optionalIsoText(input.lastVerifiedAt, "lastVerifiedAt"),
      revokedAt: optionalIsoText(input.revokedAt, "revokedAt"),
      updatedAt: isoText(input.updatedAt, "updatedAt")
    };
    sqliteRun(db.prepare(`
      insert into platform_portal_password_credentials (
        id, account_id, password_hash, status, failure_count, locked_until,
        must_rotate, created_at, last_verified_at, revoked_at, updated_at
      ) values (
        @id, @accountId, @passwordHash, @status, @failureCount, @lockedUntil,
        @mustRotate, @createdAt, @lastVerifiedAt, @revokedAt, @updatedAt
      )
    `), record);
    return getPortalPasswordCredential(record.id);
  }

  function getPortalPasswordCredential(id) {
    return mapPortalPasswordCredential(db.prepare("select * from platform_portal_password_credentials where id = ?").get(requiredText(id, "id")));
  }

  function getActivePortalPasswordCredential(accountId) {
    return mapPortalPasswordCredential(db.prepare(`
      select * from platform_portal_password_credentials
      where account_id = ? and status = 'active'
      order by created_at desc, id desc
      limit 1
    `).get(requiredText(accountId, "accountId")));
  }

  function recordPortalPasswordVerificationFailure(id, { updatedAt, lockedUntil } = {}) {
    const nextLockedUntil = optionalIsoText(lockedUntil, "lockedUntil");
    const result = db.prepare(`
      update platform_portal_password_credentials
      set failure_count = failure_count + 1,
        status = case when ? is not null then 'locked' else status end,
        locked_until = coalesce(?, locked_until),
        updated_at = ?
      where id = ? and status in ('active', 'locked')
    `).run(
      nextLockedUntil,
      nextLockedUntil,
      isoText(updatedAt, "updatedAt"),
      requiredText(id, "id")
    );
    if (result.changes !== 1) {
      throw platformError("not_found", "active portal password credential not found");
    }
    return getPortalPasswordCredential(id);
  }

  function markPortalPasswordVerified(id, { verifiedAt, updatedAt }) {
    const result = db.prepare(`
      update platform_portal_password_credentials
      set failure_count = 0, status = 'active', locked_until = null,
        last_verified_at = ?, updated_at = ?
      where id = ? and status in ('active', 'locked')
    `).run(
      isoText(verifiedAt, "verifiedAt"),
      isoText(updatedAt, "updatedAt"),
      requiredText(id, "id")
    );
    if (result.changes !== 1) {
      throw platformError("not_found", "active portal password credential not found");
    }
    return getPortalPasswordCredential(id);
  }

  function createPortalPasskeyCredential(input) {
    const record = {
      id: requiredText(input.id, "id"),
      accountId: requiredText(input.accountId, "accountId"),
      credentialId: requiredText(input.credentialId, "credentialId"),
      credentialIdHash: requiredText(input.credentialIdHash, "credentialIdHash"),
      publicKeyJwkJson: jsonObject(input.publicKeyJwk, "publicKeyJwk"),
      signCount: integer(input.signCount ?? 0, "signCount", { min: 0 }),
      transportsJson: jsonArray(input.transports ?? [], "transports"),
      status: requiredText(input.status || "active", "status"),
      createdAt: isoText(input.createdAt, "createdAt"),
      lastVerifiedAt: optionalIsoText(input.lastVerifiedAt, "lastVerifiedAt"),
      revokedAt: optionalIsoText(input.revokedAt, "revokedAt"),
      updatedAt: isoText(input.updatedAt, "updatedAt")
    };
    sqliteRun(db.prepare(`
      insert into platform_portal_passkey_credentials (
        id, account_id, credential_id, credential_id_hash, public_key_jwk_json,
        sign_count, transports_json, status, created_at, last_verified_at,
        revoked_at, updated_at
      ) values (
        @id, @accountId, @credentialId, @credentialIdHash, @publicKeyJwkJson,
        @signCount, @transportsJson, @status, @createdAt, @lastVerifiedAt,
        @revokedAt, @updatedAt
      )
    `), record);
    return getPortalPasskeyCredential(record.id);
  }

  function getPortalPasskeyCredential(id) {
    return mapPortalPasskeyCredential(db.prepare("select * from platform_portal_passkey_credentials where id = ?").get(requiredText(id, "id")));
  }

  function getPortalPasskeyCredentialByCredentialId(credentialId) {
    return mapPortalPasskeyCredential(db.prepare("select * from platform_portal_passkey_credentials where credential_id = ?").get(requiredText(credentialId, "credentialId")));
  }

  function listActivePortalPasskeyCredentials(accountId) {
    return db.prepare(`
      select * from platform_portal_passkey_credentials
      where account_id = ? and status = 'active'
      order by created_at asc, id asc
    `).all(requiredText(accountId, "accountId")).map(mapPortalPasskeyCredential);
  }

  function markPortalPasskeyVerified(id, { verifiedAt, signCount, updatedAt }) {
    const result = db.prepare(`
      update platform_portal_passkey_credentials
      set sign_count = ?, last_verified_at = ?, updated_at = ?
      where id = ? and status = 'active'
    `).run(
      integer(signCount, "signCount", { min: 0 }),
      isoText(verifiedAt, "verifiedAt"),
      isoText(updatedAt, "updatedAt"),
      requiredText(id, "id")
    );
    if (result.changes !== 1) {
      throw platformError("not_found", "active portal passkey credential not found");
    }
    return getPortalPasskeyCredential(id);
  }

  function createPortalSecondFactorChallenge(input) {
    if (input.rememberMe !== undefined && typeof input.rememberMe !== "boolean") {
      throw platformError("validation_error", "rememberMe must be a boolean");
    }
    const factorsJson = portalSecondFactorAllowedFactors(input.allowedFactors);
    const record = {
      id: requiredText(input.id, "id"),
      accountId: requiredText(input.accountId, "accountId"),
      challengeHash: requiredText(input.challengeHash, "challengeHash"),
      // Reuse the existing TEXT column; readers still accept historical arrays.
      allowedFactorsJson: input.rememberMe === undefined ? factorsJson : JSON.stringify({
        version: 1, allowedFactors: JSON.parse(factorsJson), rememberMe: input.rememberMe
      }),
      status: requiredText(input.status || "active", "status"),
      failureCount: integer(input.failureCount ?? 0, "failureCount", { min: 0 }),
      expiresAt: isoText(input.expiresAt, "expiresAt"),
      usedAt: optionalIsoText(input.usedAt, "usedAt"),
      createdAt: isoText(input.createdAt, "createdAt"),
      updatedAt: isoText(input.updatedAt, "updatedAt")
    };
    sqliteRun(db.prepare(`
      insert into platform_portal_second_factor_challenges (
        id, account_id, challenge_hash, allowed_factors_json, status,
        failure_count, expires_at, used_at, created_at, updated_at
      ) values (
        @id, @accountId, @challengeHash, @allowedFactorsJson, @status,
        @failureCount, @expiresAt, @usedAt, @createdAt, @updatedAt
      )
    `), record);
    return getPortalSecondFactorChallenge(record.id);
  }

  function getPortalSecondFactorChallenge(id) {
    return mapPortalSecondFactorChallenge(db.prepare("select * from platform_portal_second_factor_challenges where id = ?").get(requiredText(id, "id")));
  }

  function markPortalSecondFactorChallengeUsed(id, { usedAt, updatedAt }) {
    const result = db.prepare(`
      update platform_portal_second_factor_challenges
      set status = 'used', used_at = ?, updated_at = ?
      where id = ? and status = 'active'
    `).run(
      isoText(usedAt, "usedAt"),
      isoText(updatedAt, "updatedAt"),
      requiredText(id, "id")
    );
    if (result.changes !== 1) {
      throw platformError("validation_error", "portal second-factor challenge is not active");
    }
    return getPortalSecondFactorChallenge(id);
  }

  function recordPortalSecondFactorChallengeFailure(id, { locked = false, updatedAt } = {}) {
    const result = db.prepare(`
      update platform_portal_second_factor_challenges
      set failure_count = failure_count + 1,
          status = case when ? = 1 then 'locked' else status end,
          updated_at = ?
      where id = ? and status = 'active'
    `).run(locked ? 1 : 0, isoText(updatedAt, "updatedAt"), requiredText(id, "id"));
    if (result.changes !== 1) {
      throw platformError("not_found", "active portal second-factor challenge not found");
    }
    return getPortalSecondFactorChallenge(id);
  }

  function createPortalSession(input) {
    const record = {
      id: requiredText(input.id, "id"),
      accountId: requiredText(input.accountId, "accountId"),
      entryId: optionalText(input.entryId),
      authMethod: requiredText(input.authMethod, "authMethod"),
      status: requiredText(input.status || "active", "status"),
      issuedAt: isoText(input.issuedAt, "issuedAt"),
      expiresAt: isoText(input.expiresAt, "expiresAt"),
      revokedAt: optionalIsoText(input.revokedAt, "revokedAt"),
      updatedAt: isoText(input.updatedAt, "updatedAt")
    };
    sqliteRun(db.prepare(`
      insert into platform_portal_sessions (
        id, account_id, entry_id, auth_method, status, issued_at, expires_at, revoked_at, updated_at
      ) values (
        @id, @accountId, @entryId, @authMethod, @status, @issuedAt, @expiresAt, @revokedAt, @updatedAt
      )
    `), record);
    return getPortalSession(record.id);
  }

  function getPortalSession(id) {
    return mapPortalSession(db.prepare("select * from platform_portal_sessions where id = ?").get(requiredText(id, "id")));
  }

  function revokePortalSession(id, { revokedAt, updatedAt } = {}) {
    const sessionId = requiredText(id, "id");
    // A repeated logout does not alter the first revocation timestamp. Expired
    // or already-revoked rows cannot be moved back into an active state.
    db.prepare(`
      update platform_portal_sessions
      set status = 'revoked', revoked_at = ?, updated_at = ?
      where id = ? and status = 'active' and revoked_at is null
    `).run(isoText(revokedAt, "revokedAt"), isoText(updatedAt, "updatedAt"), sessionId);
    return getPortalSession(sessionId);
  }

  function listPortalSessions({ accountId }) {
    return db.prepare(`
      select * from platform_portal_sessions
      where account_id = ?
      order by issued_at asc, id asc
    `).all(requiredText(accountId, "accountId")).map(mapPortalSession);
  }

  function getAccountControlSummary(accountId) {
    const account = getAccount(accountId);
    if (!account) {
      throw platformError("not_found", "account not found");
    }
    const entitlements = db.prepare(`
      select * from platform_entitlements
      where account_id = ?
      order by created_at asc, id asc
    `).all(account.id).map(mapEntitlement);
    const issuanceRequests = db.prepare(`
      select * from platform_issuance_requests
      where account_id = ?
      order by created_at asc, id asc
    `).all(account.id).map(mapIssuanceRequest);
    const requestIds = issuanceRequests.map((request) => request.id);
    const issuedLinks = requestIds.length
      ? db.prepare(`
          select * from platform_issued_subscription_links
          where request_id in (${requestIds.map(() => "?").join(",")})
          order by created_at asc, id asc
        `).all(...requestIds).map(mapIssuedLink)
      : [];
    const quotaCounters = db.prepare(`
      select * from platform_quota_counters
      where account_id = ?
      order by period asc, metric asc
    `).all(account.id).map(mapQuotaCounter);
    const deviceBindings = db.prepare(`
      select * from platform_device_bindings
      where account_id = ?
      order by first_seen_at asc, id asc
    `).all(account.id).map(mapDeviceBinding);
    const revocationEvents = requestIds.length
      ? db.prepare(`
          select * from platform_revocation_events
          where request_id in (${requestIds.map(() => "?").join(",")})
          order by created_at asc, id asc
        `).all(...requestIds).map(mapRevocationEvent)
      : [];
    const entityRefs = [
      account.id,
      ...entitlements.map((entitlement) => entitlement.id),
      ...requestIds,
      ...issuedLinks.map((link) => link.id),
      ...revocationEvents.map((event) => event.id)
    ];
    const auditEvents = entityRefs.length
      ? db.prepare(`
          select * from platform_audit_events
          where entity_ref in (${entityRefs.map(() => "?").join(",")})
            and entity_type != 'coin_commerce_data_pack_metering_reset'
          order by created_at asc, id asc
        `).all(...entityRefs).map(mapAuditEvent)
      : [];

    return {
      type: "subscription_control_account_summary",
      account,
      entitlements,
      issuanceRequests,
      issuedLinks,
      quotaCounters,
      deviceBindings,
      revocationEvents,
      auditEvents,
      safety: {
        summaryOnly: true,
        rawCustomerDataReturned: false,
        rawDeliveryLinkReturned: false,
        rawSecretReturned: false
      }
    };
  }

  function close() {
    if (ownsDatabase) {
      db.close();
    }
  }

  function runInTransaction(callback) {
    if (typeof callback !== "function") {
      throw platformError("validation_error", "transaction callback is required");
    }
    return db.transaction(callback)();
  }

  return {
    recordPortalReferralRegistration(input) { return recordReferralRegistration(db, input); },
    getPortalSubscriptionLinkResetStore(options = {}) {
      return createPortalSubscriptionLinkResetStore({ database: db, nowFn: options.nowFn });
    },
    verifyPortalSubscriptionLinkResetLineage(input) {
      return verifyPortalSubscriptionLinkResetLineage(db, input);
    },
    runInTransaction,
    upsertLead,
    getLead,
    listLeads,
    purgeExpiredLeads,
    createAccount,
    getAccount,
    listAccounts,
    listUserMonitorGrowthDays,
    listUserMonitorAccountDirectory,
    summarizeUserMonitorTraffic,
    getPortalRegistrationWelcomeCoinGrant,
    enqueuePortalRegistrationWelcomeCoinGrant,
    claimNextPortalRegistrationWelcomeCoinGrant,
    completePortalRegistrationWelcomeCoinGrant,
    deferPortalRegistrationWelcomeCoinGrant,
    markPortalRegistrationWelcomeCoinGrantReconciliationRequired,
    expireDuePortalRegistrationWelcomeCoinGrants,
    nextPortalRegistrationWelcomeCoinGrantWakeAt,
    resolvePortalLoginAccount,
    getWalletFirstAccountForDeferredTransition,
    resolveExactWalletFirstResourceChainForDeferredTransition,
    readWalletFirstCurrentResourceProjection,
    readWalletFirstCurrentResourceOverview,
    readLegacyPortalCurrentResourceBinding,
    readLegacyPortalCurrentResource,
    readWalletFirstSetupDeliveryAvailabilityBinding,
    readWalletFirstSetupDeliveryHandoff,
    createWalletFirstSetupDeliveryHandoff,
    assertWalletFirstSetupDeliveryHandoffForDeferredTransition,
    claimWalletFirstSetupDeliveryHandoff,
    readWalletFirstSetupDeliveryBinding,
    readWalletFirstSetupDeliveryAcknowledgementBinding,
    acknowledgeWalletFirstSetupDeliveryHandoff,
    markWalletFirstSetupDeliveryHandoffReconciliationRequired,
    getWalletFirstTransitionEffectForDeferredTransition,
    prepareWalletFirstInitialActivationForDeferredTransition,
    prepareWalletFirstScheduledSwitchForDeferredTransition,
    getWalletFirstRuntimeReceiptForDeferredTransition,
    verifyWalletFirstRuntimeTransitionForDeferredTransition,
    claimWalletFirstRuntimeEffectForDeferredTransition,
    markWalletFirstRuntimeEffectReconciliationRequiredForDeferredTransition,
    recordWalletFirstRuntimeReceiptForDeferredTransition,
    completeWalletFirstTransitionEffectForDeferredTransition,
    createEntitlement,
    getEntitlement,
    resolveCommerceAuthority,
    resolveAccountServiceEntitlement,
    updateEntitlementTrafficLimit,
    readPlanSwitchAccountFacts,
    readPlanSwitchQuoteForOrderRef,
    readScheduledPlanSwitch,
    deliverPlanSwitchDowngrade,
    listDueScheduledPlanSwitches,
    completeScheduledPlanSwitch,
    applyCoinCommerceSubscriptionFulfillment,
    createIssuanceRequest,
    getIssuanceRequest,
    setIssuanceRequestStatus,
    linkIssuedSubscription,
    getIssuedLink,
    setIssuedLinkStatus,
    listIssuedSubscriptionBindings,
    findIssuedSubscriptionBindingByTenantRef,
    findIssuedSubscriptionBindingByEdgeCredentialRef,
    findUsageBindingByTenantRef,
    getThirdPartySubscriptionEligibilityByTenantRefs,
    recordUsageSample,
    recordCumulativeUsageSample,
    getUsageSampleByDigest,
    getUsageRollupByEdgeCredentialRef,
    getUsageCounterCursor,
    listUsageRollupsByRequestId,
    listUsageSamples,
    reserveCoinCommerceDataPackIssuance,
    completeCoinCommerceDataPackIssuance,
    beginCoinCommerceDataPackArtifactRotation,
    claimCoinCommerceDataPackArtifactRotation,
    releaseCoinCommerceDataPackArtifactRotation,
    listPendingCoinCommerceDataPackArtifactRotations,
    advanceCoinCommerceDataPackArtifactRotation,
    beginCoinCommerceDataPackCredentialReset,
    claimCoinCommerceDataPackCredentialReset,
    releaseCoinCommerceDataPackCredentialReset,
    listPendingCoinCommerceDataPackCredentialResets,
    advanceCoinCommerceDataPackCredentialReset,
    readCoinCommerceDataPackMeteringResetProofs,
    recordCoinCommerceDataPackMeteringResetReceipt,
    getCoinCommerceDataPackMeteringResetReceipt,
    registerCoinCommerceDataPackEdgeCredential,
    rotateCoinCommerceDataPackEdgeCredential,
    createDataPackResource,
    applyCoinCommerceDataPackFulfillment,
    readDataPackResourceUsage,
    upsertQuotaCounter,
    bindDevice,
    getDeviceBinding,
    recordRevocation,
    getRevocationEvent,
    recordAuditEvent,
    getAuditEvent,
    upsertEdgeRegisteredNode,
    insertEdgeRegisteredNodeIfAbsent,
    getEdgeRegisteredNode,
    listEdgeRegisteredNodes,
    getLatestEdgeDesiredStateForChannel,
    recordEdgeApplyReceipt,
    getEdgeApplyReceipt,
    listEdgeApplyReceipts,
    recordEdgeDesiredStateNotification,
    getEdgeDesiredStateNotification,
    listEdgeDesiredStateNotifications,
    acquireEdgeAgentLease,
    getPortalEdgeCredentialChannelRef,
    getPortalEdgeCredentialChannelRefByScopeDigest,
    getEdgeCredentialChannelRef,
    getEdgeCredentialChannelRefByScopeDigest,
    upsertPortalAccessRequest,
    getPortalAccessRequest,
    listPortalAccessRequests,
    createPortalEntry,
    getPortalEntry,
    findPortalEntryByTokenHash,
    markPortalEntryUsed,
    createPortalTotpCredential,
    getPortalTotpCredential,
    getActivePortalTotpCredential,
    recordPortalTotpVerificationFailure,
    markPortalTotpVerified,
    createPortalPasswordCredential,
    getPortalPasswordCredential,
    getActivePortalPasswordCredential,
    recordPortalPasswordVerificationFailure,
    markPortalPasswordVerified,
    createPortalPasskeyCredential,
    getPortalPasskeyCredential,
    getPortalPasskeyCredentialByCredentialId,
    listActivePortalPasskeyCredentials,
    markPortalPasskeyVerified,
    createPortalSecondFactorChallenge,
    getPortalSecondFactorChallenge,
    markPortalSecondFactorChallengeUsed,
    recordPortalSecondFactorChallengeFailure,
    createPortalSession,
    getPortalSession,
    revokePortalSession,
    listPortalSessions,
    getAccountControlSummary,
    close
  };
}
