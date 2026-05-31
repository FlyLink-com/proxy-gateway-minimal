import { createHash } from "node:crypto";

const BILLING_PROVIDERS = new Set([
  "paypal",
  "stripe",
  "paddle",
  "lemonsqueezy",
  "alipay",
  "wechatpay",
  "manual",
  "mock"
]);
const PROVIDER_ALIASES = {
  paypal: "paypal",
  stripe: "stripe",
  paddle: "paddle",
  lemonsqueezy: "lemonsqueezy",
  lemon: "lemonsqueezy",
  alipay: "alipay",
  wechat: "wechatpay",
  wechatpay: "wechatpay",
  weixin: "wechatpay",
  weixinpay: "wechatpay",
  manual: "manual",
  mock: "mock"
};
const RECHARGE_STATUSES = new Set(["pending", "paid", "failed", "refunded", "cancelled"]);
const EVENT_TYPES = new Set([
  "payment_pending",
  "payment_succeeded",
  "payment_failed",
  "payment_refunded",
  "payment_chargeback"
]);

function contractError(message) {
  const error = new Error(message);
  error.code = "validation_error";
  return error;
}

function cleanString(value, maxLength = 120) {
  if (typeof value !== "string" && typeof value !== "number") {
    return "";
  }
  return String(value).trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function requiredString(value, field, maxLength = 120) {
  const normalized = cleanString(value, maxLength);
  if (!normalized) {
    throw contractError(`${field} is required`);
  }
  return normalized;
}

function normalizeProvider(value) {
  const normalized = requiredString(value, "provider", 60).toLowerCase().replace(/[-_\s]/g, "");
  const provider = PROVIDER_ALIASES[normalized];
  if (!provider || !BILLING_PROVIDERS.has(provider)) {
    throw contractError("provider is invalid");
  }
  return provider;
}

function normalizeEnum(value, allowed, field, fallback) {
  const normalized = requiredString(value ?? fallback, field, 60).toLowerCase();
  if (!allowed.has(normalized)) {
    throw contractError(`${field} is invalid`);
  }
  return normalized;
}

function normalizeIso(value, field, fallback) {
  const raw = value ?? fallback;
  const date = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw contractError(`${field} must be a valid ISO timestamp`);
  }
  return date.toISOString();
}

function nonNegativeInteger(value, field) {
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized < 0) {
    throw contractError(`${field} must be an integer >= 0`);
  }
  return normalized;
}

function positiveInteger(value, field) {
  const normalized = nonNegativeInteger(value, field);
  if (normalized <= 0) {
    throw contractError(`${field} must be greater than 0`);
  }
  return normalized;
}

function normalizeCurrency(value) {
  const currency = requiredString(value, "currency", 12).toUpperCase();
  if (!/^[A-Z]{3,8}$/.test(currency)) {
    throw contractError("currency is invalid");
  }
  return currency;
}

function ref(prefix, ...parts) {
  const source = parts.map((part) => cleanString(part, 160)).filter(Boolean).join("|") || prefix;
  const digest = createHash("sha256").update(source).digest("hex").slice(0, 16);
  return `${prefix}_${digest}`;
}

function safety() {
  return {
    summaryOnly: true,
    noRawProviderPayload: true,
    noCustomerEmail: true,
    noPaymentCredential: true,
    noSubscriptionUrl: true,
    noSubscriptionMutation: true,
    requiresControlledIssuance: true
  };
}

export function normalizeRechargeOrder(payload = {}, options = {}) {
  const timestamp = normalizeIso(options.now, "now", new Date());
  return {
    id: requiredString(payload.id ?? options.idFactory?.(), "id", 80),
    type: "billing_recharge_order",
    provider: normalizeProvider(payload.provider),
    providerOrderRef: requiredString(payload.providerOrderRef, "providerOrderRef", 120),
    accountRef: requiredString(payload.accountRef, "accountRef", 120),
    packageRef: requiredString(payload.packageRef, "packageRef", 80),
    amountMinor: positiveInteger(payload.amountMinor, "amountMinor"),
    currency: normalizeCurrency(payload.currency),
    creditTrafficMb: positiveInteger(payload.creditTrafficMb, "creditTrafficMb"),
    status: normalizeEnum(payload.status, RECHARGE_STATUSES, "status", "pending"),
    createdAt: normalizeIso(payload.createdAt, "createdAt", timestamp),
    updatedAt: normalizeIso(payload.updatedAt, "updatedAt", timestamp)
  };
}

export function normalizeBillingPaymentEvent(payload = {}, options = {}) {
  const timestamp = normalizeIso(options.now, "now", new Date());
  const signatureStatus = requiredString(payload.signatureStatus, "signatureStatus", 40).toLowerCase();
  if (signatureStatus !== "verified") {
    throw contractError("billing event requires verified signature");
  }

  const idempotencyKey = requiredString(payload.idempotencyKey, "idempotencyKey", 160);
  if (options.seenIdempotencyKeys?.has?.(idempotencyKey)) {
    throw contractError("duplicate billing event idempotency key");
  }

  return {
    id: requiredString(payload.id ?? options.idFactory?.(), "id", 80),
    type: "billing_payment_event",
    provider: normalizeProvider(payload.provider),
    providerEventRef: requiredString(payload.providerEventRef, "providerEventRef", 120),
    idempotencyKey,
    orderId: requiredString(payload.orderId, "orderId", 80),
    eventType: normalizeEnum(payload.eventType, EVENT_TYPES, "eventType"),
    signatureStatus: "verified",
    receivedAt: normalizeIso(payload.receivedAt, "receivedAt", timestamp),
    createdAt: normalizeIso(payload.createdAt, "createdAt", timestamp)
  };
}

export function buildRechargeCreditDecision({ order, event, balanceBeforeMb, actorRef } = {}, options = {}) {
  if (!order || order.type !== "billing_recharge_order") {
    throw contractError("order is required");
  }
  if (!event || event.type !== "billing_payment_event") {
    throw contractError("event is required");
  }
  if (event.orderId !== order.id) {
    throw contractError("billing event does not match recharge order");
  }
  if (event.provider !== order.provider) {
    throw contractError("billing provider mismatch");
  }
  if (event.eventType !== "payment_succeeded" || order.status !== "paid") {
    throw contractError("paid recharge order and payment_succeeded event are required");
  }

  const timestamp = normalizeIso(options.now, "now", new Date());
  const before = nonNegativeInteger(balanceBeforeMb, "balanceBeforeMb");
  const amount = positiveInteger(order.creditTrafficMb, "creditTrafficMb");
  const ledgerId = ref("ledger", order.id, event.id, order.accountRef, "credit");

  return {
    ok: true,
    type: "billing_recharge_credit_decision",
    status: "credit_ready",
    accountRef: order.accountRef,
    orderRef: order.id,
    eventRef: event.id,
    balanceBeforeMb: before,
    balanceAfterMb: before + amount,
    ledgerEntry: {
      id: ledgerId,
      accountRef: order.accountRef,
      direction: "credit",
      amountTrafficMb: amount,
      balanceBeforeMb: before,
      balanceAfterMb: before + amount,
      source: "payment_recharge",
      sourceOrderRef: order.id,
      sourceEventRef: event.id,
      actorRef: requiredString(actorRef, "actorRef", 120),
      createdAt: timestamp
    },
    execution: {
      subscriptionCreated: false,
      issuanceRequestCreated: false,
      nextAction: "store_credit_then_allow_controlled_subscription_request"
    },
    safety: safety()
  };
}

export function buildUsageDebitDecision({
  accountRef,
  usageRef,
  artifactRef,
  balanceBeforeMb,
  trafficUsedMb,
  actorRef
} = {}, options = {}) {
  const timestamp = normalizeIso(options.now, "now", new Date());
  const account = requiredString(accountRef, "accountRef", 120);
  const usage = requiredString(usageRef, "usageRef", 120);
  const artifact = requiredString(artifactRef, "artifactRef", 120);
  const actor = requiredString(actorRef, "actorRef", 120);
  const before = nonNegativeInteger(balanceBeforeMb, "balanceBeforeMb");
  const amount = positiveInteger(trafficUsedMb, "trafficUsedMb");

  if (before < amount) {
    return {
      ok: false,
      type: "billing_usage_debit_decision",
      status: "blocked_insufficient_balance",
      accountRef: account,
      usageRef: usage,
      artifactRef: artifact,
      balanceBeforeMb: before,
      balanceAfterMb: before,
      ledgerEntry: null,
      nextAction: "disable_or_revoke_through_controlled_gate",
      execution: {
        subscriptionMutationRequired: false,
        directRuntimeMutationAllowed: false
      },
      safety: safety()
    };
  }

  const after = before - amount;
  return {
    ok: true,
    type: "billing_usage_debit_decision",
    status: "debit_ready",
    accountRef: account,
    usageRef: usage,
    artifactRef: artifact,
    balanceBeforeMb: before,
    balanceAfterMb: after,
    ledgerEntry: {
      id: ref("ledger", account, usage, artifact, "debit"),
      accountRef: account,
      artifactRef: artifact,
      direction: "debit",
      amountTrafficMb: amount,
      balanceBeforeMb: before,
      balanceAfterMb: after,
      source: "traffic_usage",
      sourceUsageRef: usage,
      actorRef: actor,
      createdAt: timestamp
    },
    execution: {
      subscriptionMutationRequired: false,
      directRuntimeMutationAllowed: false
    },
    safety: safety()
  };
}
