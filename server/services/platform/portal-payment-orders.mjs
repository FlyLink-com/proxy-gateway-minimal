import { createHash } from "node:crypto";

const DEFAULT_PLANS = Object.freeze({
  monthly_basic: {
    plan: "monthly_basic",
    planLabel: "monthly basic",
    productName: "GCC WebOS monthly basic",
    amountMinor: 2000,
    money: "20.00",
    currency: "CNY",
    durationDays: 30,
    trafficGbPerMonth: 50
  },
  monthly_plus: {
    plan: "monthly_plus",
    planLabel: "monthly plus",
    productName: "GCC WebOS monthly plus",
    amountMinor: 3000,
    money: "30.00",
    currency: "CNY",
    durationDays: 30,
    trafficGbPerMonth: 100
  },
  yearly: {
    plan: "yearly",
    planLabel: "yearly",
    productName: "GCC WebOS yearly",
    amountMinor: 20000,
    money: "200.00",
    currency: "CNY",
    durationDays: 365,
    trafficGbPerMonth: 200
  }
});

const SUPPORTED_CHANNELS = new Set(["alipay", "wxpay", "qqpay", "bank", "jdpay"]);
const SUPPORTED_CLIENT_TARGETS = new Set(["clash", "karing"]);
const SUPPORTED_PAYMENT_DEVICES = new Set(["pc", "mobile"]);
const ACCESS_DELIVERED_STATUSES = new Set(["delivered", "issued"]);
const DELIVERY_RETRY_STATUSES = new Set(["paid_pending_admin_review", "paid_delivery_blocked"]);
const REFUNDABLE_PAYMENT_STATUSES = new Set([
  "paid_pending_admin_review",
  "paid_access_delivered",
  "paid_delivery_blocked",
  "paid_account_credited"
]);
const NON_RETRYABLE_REFUND_STATUSES = new Set([
  "refund_approved",
  "refund_pending_provider",
  "refund_succeeded",
  "refund_rejected"
]);
const DEFAULT_CHECKOUT_TTL_SECONDS = 10 * 60;
const DAY_MS = 24 * 60 * 60 * 1000;

function paymentError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function text(value, field, maxLength = 160) {
  const normalized = String(value || "").trim().replace(/\s+/g, " ").slice(0, maxLength);
  if (!normalized) {
    throw paymentError("validation_error", `${field} is required`);
  }
  return normalized;
}

function optionalText(value, maxLength = 160) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function isoNow(nowFn) {
  const value = typeof nowFn === "function" ? nowFn() : new Date().toISOString();
  return new Date(value).toISOString();
}

function addSecondsIso(value, seconds) {
  return new Date(new Date(value).getTime() + seconds * 1000).toISOString();
}

function normalizePlan(value, plans) {
  const plan = text(value, "plan", 80);
  const entry = plans[plan];
  if (!entry) {
    throw paymentError("validation_error", "plan is not purchasable");
  }
  return entry;
}

function normalizeChannel(value) {
  const channel = optionalText(value || "alipay", 40).toLowerCase();
  if (!SUPPORTED_CHANNELS.has(channel)) {
    throw paymentError("validation_error", "payment channel is invalid");
  }
  return channel;
}

function normalizeClientTarget(value) {
  const clientTarget = optionalText(value || "clash", 40).toLowerCase();
  if (!SUPPORTED_CLIENT_TARGETS.has(clientTarget)) {
    throw paymentError("validation_error", "client target is invalid");
  }
  return clientTarget;
}

function normalizePaymentDevice(value) {
  const device = optionalText(value || "pc", 40).toLowerCase();
  if (!SUPPORTED_PAYMENT_DEVICES.has(device)) {
    throw paymentError("validation_error", "payment device is invalid");
  }
  return device;
}

function safeOrderIdentity(order, orderStore) {
  if (!orderStore || typeof orderStore.getAccount !== "function") {
    return {};
  }
  try {
    const account = orderStore.getAccount(order.portalUserRef);
    const metadata = account?.metadata && typeof account.metadata === "object" ? account.metadata : {};
    const loginRef = optionalText(metadata.loginRef, 200);
    const displayRef = optionalText(metadata.displayRef || loginRef, 200);
    const identity = {};
    if (loginRef) identity.loginRef = loginRef;
    if (displayRef) identity.displayRef = displayRef;
    return identity;
  } catch {
    return {};
  }
}

function safeOrderSummary(order, options = {}) {
  const summary = {
    orderRef: order.orderRef,
    plan: order.plan,
    planLabel: order.planLabel,
    amountMinor: order.amountMinor,
    currency: order.currency,
    status: order.status,
    createdAt: order.createdAt
  };
  if (order.channel) summary.channel = order.channel;
  Object.assign(summary, safeOrderIdentity(order, options.orderStore));
  if (order.providerOrderRef) summary.providerOrderRef = order.providerOrderRef;
  if (order.checkoutUrl) summary.checkoutUrl = order.checkoutUrl;
  if (options.includePaymentArtifacts && order.urlScheme) summary.urlScheme = order.urlScheme;
  if (options.includePaymentArtifacts && order.qrCode) summary.qrCode = order.qrCode;
  if (order.checkoutExpiresAt) summary.checkoutExpiresAt = order.checkoutExpiresAt;
  if (order.accessRequestRef) summary.accessRequestRef = order.accessRequestRef;
  if (order.accessRequestStatus) summary.accessRequestStatus = order.accessRequestStatus;
  if (order.accountCreditStatus) summary.accountCreditStatus = order.accountCreditStatus;
  if (order.accountCreditRef) summary.accountCreditRef = order.accountCreditRef;
  if (order.paidAt) summary.paidAt = order.paidAt;
  if (order.refundStatus) {
    summary.refund = {
      status: order.refundStatus
    };
    if (order.refundRequestedAt) summary.refund.requestedAt = order.refundRequestedAt;
    if (order.refundApprovedAt) summary.refund.approvedAt = order.refundApprovedAt;
    if (Number.isInteger(order.refundAmountMinor)) summary.refund.amountMinor = order.refundAmountMinor;
    if (Number.isInteger(order.refundRemainingDays)) summary.refund.remainingDays = order.refundRemainingDays;
    if (order.refundReasonCode) summary.refund.reasonCode = order.refundReasonCode;
    if (order.refundProviderRef) summary.refund.providerRefundRef = order.refundProviderRef;
    if (order.refundFailedReason) summary.refund.failedReason = order.refundFailedReason;
  }
  return summary;
}

function auditDigest(value) {
  return createHash("sha256").update(String(value)).digest("hex").slice(0, 24);
}

function fullDigest(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function normalizeIdentity(value) {
  return optionalText(value, 320).toLowerCase();
}

function moneyFromMinorUnits(amountMinor) {
  return (amountMinor / 100).toFixed(2);
}

function normalizeIsoInput(value, field, nowFn) {
  if (value == null || value === "") return isoNow(nowFn);
  const parsed = new Date(text(value, field, 80));
  if (Number.isNaN(parsed.getTime())) {
    throw paymentError("validation_error", `${field} is invalid`);
  }
  return parsed.toISOString();
}

function calculateRemainingDayRefund(order, approvedAt) {
  const durationDays = positiveInteger(order.durationDays, "durationDays");
  const amountMinor = positiveInteger(order.amountMinor, "amountMinor");
  const startedAt = new Date(order.paidAt || order.createdAt);
  const effectiveAt = new Date(approvedAt);
  if (Number.isNaN(startedAt.getTime()) || Number.isNaN(effectiveAt.getTime())) {
    throw paymentError("validation_error", "refund calculation time is invalid");
  }
  const elapsedMs = Math.max(0, effectiveAt.getTime() - startedAt.getTime());
  const usedDays = Math.min(durationDays, Math.ceil(elapsedMs / DAY_MS));
  const remainingDays = Math.max(0, durationDays - usedDays);
  return {
    durationDays,
    usedDays,
    remainingDays,
    refundAmountMinor: Math.floor((amountMinor * remainingDays) / durationDays),
    calculatedAt: effectiveAt.toISOString()
  };
}

function validateNotificationOrderBinding(order, notification, nowFn) {
  const providerEventRef = optionalText(notification.providerEventRef, 120);
  if (providerEventRef && order.providerOrderRef && providerEventRef !== order.providerOrderRef) {
    order.status = "payment_provider_order_mismatch";
    order.updatedAt = isoNow(nowFn);
    return paymentError("validation_error", "payment provider order does not match order");
  }

  const notificationChannel = optionalText(notification.channel, 40).toLowerCase();
  if (notificationChannel && order.channel && notificationChannel !== order.channel) {
    order.status = "payment_channel_mismatch";
    order.updatedAt = isoNow(nowFn);
    return paymentError("validation_error", "payment channel does not match order");
  }

  return null;
}

function positiveInteger(value, field) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw paymentError("validation_error", `${field} is invalid`);
  }
  return number;
}

function normalizeCheckoutTtlSeconds(value) {
  if (value == null || value === "") return DEFAULT_CHECKOUT_TTL_SECONDS;
  return positiveInteger(value, "checkout ttl seconds");
}

function normalizeTestPaymentOverride(input = {}) {
  const accountDigest = optionalText(input.accountDigest || input.accountSha256, 128).toLowerCase();
  if (!accountDigest) return null;
  if (!/^[a-f0-9]{64}$/.test(accountDigest)) {
    throw paymentError("validation_error", "test payment account digest is invalid");
  }
  const amountMinor = positiveInteger(input.amountMinor ?? 1, "test payment amount");
  return {
    accountDigest,
    amountMinor,
    money: optionalText(input.money, 40) || moneyFromMinorUnits(amountMinor),
    channel: optionalText(input.channel, 40).toLowerCase(),
    plan: optionalText(input.plan, 80)
  };
}

function accountDigestForPaymentOverride(portalUserRef, orderStore) {
  if (!orderStore || typeof orderStore.getAccount !== "function") return null;
  try {
    const account = orderStore.getAccount(portalUserRef);
    const metadata = account?.metadata && typeof account.metadata === "object" ? account.metadata : {};
    const identity = normalizeIdentity(metadata.loginRef || metadata.displayRef || account?.ownerRef || portalUserRef);
    return identity ? fullDigest(identity) : null;
  } catch {
    return null;
  }
}

function normalizeProviderCheckoutResult(result = {}) {
  const code = Number(result.code);
  const providerOrderRef = optionalText(result.providerOrderRef, 120);
  const checkoutUrl = optionalText(result.checkoutUrl, 500);
  const urlScheme = optionalText(result.urlScheme, 500);
  const qrCode = optionalText(result.qrCode, 2000);
  if (Number.isFinite(code) && code !== 1) {
    throw paymentError("payment_provider_checkout_unavailable", "payment provider did not accept checkout request");
  }
  if (!providerOrderRef || (!checkoutUrl && !urlScheme && !qrCode)) {
    throw paymentError("payment_provider_checkout_unavailable", "payment provider did not return checkout material");
  }
  return {
    provider: optionalText(result.provider, 80) || "niuniu-pay",
    providerOrderRef,
    checkoutUrl,
    urlScheme,
    qrCode
  };
}

export function createPortalPaymentOrderService(options = {}) {
  const providerAdapter = options.providerAdapter;
  const portalAccessRequests = options.portalAccessRequests;
  const accountEntitlements = options.accountEntitlements;
  const orderStore = options.orderStore;
  const requireAutomaticDelivery = options.requireAutomaticDelivery === true;
  const testPaymentOverride = normalizeTestPaymentOverride(options.testPaymentOverride);
  const checkoutTtlSeconds = normalizeCheckoutTtlSeconds(options.checkoutTtlSeconds);
  const nowFn = options.nowFn;
  const notifyUrl = text(options.notifyUrl, "notifyUrl", 500);
  const returnUrl = text(options.returnUrl, "returnUrl", 500);
  const orderIdFactory = typeof options.orderIdFactory === "function"
    ? options.orderIdFactory
    : () => `pay_${Date.now().toString(36)}`;
  const plans = Object.freeze({
    ...DEFAULT_PLANS,
    ...(options.plans || {})
  });
  const byOrderRef = new Map();
  let auditSequence = 0;

  const summarizeOrder = (order, summaryOptions = {}) => safeOrderSummary(order, {
    orderStore,
    ...summaryOptions
  });

  function persistOrder(order) {
    order.updatedAt = order.updatedAt || order.createdAt;
    if (orderStore && typeof orderStore.upsertPaymentOrder === "function") {
      const stored = orderStore.upsertPaymentOrder(order);
      byOrderRef.set(stored.orderRef, { ...order, ...stored });
      return stored;
    }
    byOrderRef.set(order.orderRef, order);
    return order;
  }

  function getOrder(orderRef) {
    let order = byOrderRef.get(orderRef);
    if (!order && orderStore && typeof orderStore.getPaymentOrder === "function") {
      order = orderStore.getPaymentOrder(orderRef);
      if (order) {
        byOrderRef.set(orderRef, order);
      }
    }
    if (!order) {
      throw paymentError("not_found", "payment order was not found");
    }
    return order;
  }

  function recordPaymentAudit({ order, action, previousStatus, input, createdAt }) {
    const actorRef = text(input.actorRef || input.operatorRef, "actorRef", 160);
    const reasonCode = text(input.reasonCode, "reasonCode", 160);
    const approvalRef = text(input.approvalRef, "approvalRef", 160);
    if (!orderStore || typeof orderStore.recordAuditEvent !== "function") {
      return {
        action,
        actorRef,
        recordedAt: createdAt,
        safety: {
          auditStoreConfigured: false,
          noRawProviderPayload: true
        }
      };
    }
    auditSequence += 1;
    const event = orderStore.recordAuditEvent({
      id: `audit_pay_${auditDigest([
        action,
        order.orderRef,
        actorRef,
        approvalRef,
        createdAt,
        auditSequence
      ].join("|"))}`,
      entityType: "payment_order",
      entityRef: order.orderRef,
      action,
      actorRef,
      createdAt,
      metadata: {
        reasonCode,
        approvalRef,
        previousStatus,
        nextStatus: order.status,
        refundStatus: order.refundStatus || null,
        refundAmountMinor: Number.isInteger(order.refundAmountMinor) ? order.refundAmountMinor : null,
        refundRemainingDays: Number.isInteger(order.refundRemainingDays) ? order.refundRemainingDays : null,
        accessRequestRef: order.accessRequestRef || null,
        accessRequestStatus: order.accessRequestStatus || null
      }
    });
    return {
      action: event.action,
      actorRef: event.actorRef,
      recordedAt: event.createdAt,
      safety: {
        auditStoreConfigured: true,
        noRawProviderPayload: true
      }
    };
  }

  return {
    plans,

    async createCheckout(input = {}) {
      if (!providerAdapter || typeof providerAdapter.createPaymentOrder !== "function") {
        throw paymentError("validation_error", "payment provider adapter is not configured");
      }
      const plan = normalizePlan(input.plan, plans);
      const orderRef = text(input.orderRef || orderIdFactory(), "orderRef", 120);
      const portalUserRef = text(input.portalUserRef, "portalUserRef", 160);
      const clientTarget = normalizeClientTarget(input.clientTarget);
      const channel = normalizeChannel(input.channel);
      const createdAt = isoNow(nowFn);
      const testOverrideMatches = Boolean(
        testPaymentOverride
        && (!testPaymentOverride.channel || testPaymentOverride.channel === channel)
        && (!testPaymentOverride.plan || testPaymentOverride.plan === plan.plan)
        && accountDigestForPaymentOverride(portalUserRef, orderStore) === testPaymentOverride.accountDigest
      );
      const providerMoney = testOverrideMatches ? testPaymentOverride.money : plan.money;
      const providerAmountMinor = testOverrideMatches ? testPaymentOverride.amountMinor : plan.amountMinor;
      const providerResult = await providerAdapter.createPaymentOrder({
        type: channel,
        outTradeNo: orderRef,
        notifyUrl,
        returnUrl,
        name: plan.productName,
        money: providerMoney,
        clientIp: optionalText(input.clientIp, 80) || "127.0.0.1",
        device: normalizePaymentDevice(input.device),
        param: plan.plan
      });
      const providerCheckout = normalizeProviderCheckoutResult(providerResult);
      const checkoutExpiresAt = addSecondsIso(createdAt, checkoutTtlSeconds);
      const order = {
        orderRef,
        portalUserRef,
        plan: plan.plan,
        planLabel: plan.planLabel,
        amountMinor: providerAmountMinor,
        money: providerMoney,
        currency: plan.currency,
        durationDays: plan.durationDays,
        trafficGbPerMonth: plan.trafficGbPerMonth,
        clientTarget,
        channel,
        status: "pending_payment",
        provider: providerCheckout.provider,
        providerOrderRef: providerCheckout.providerOrderRef,
        checkoutUrl: providerCheckout.checkoutUrl,
        urlScheme: providerCheckout.urlScheme,
        qrCode: providerCheckout.qrCode,
        checkoutExpiresAt,
        createdAt,
        updatedAt: createdAt,
        paidAt: null,
        accessRequestRef: null,
        accessRequestStatus: null
      };
      persistOrder(order);
      return {
        provider: providerCheckout.provider,
        order: summarizeOrder(order, { includePaymentArtifacts: true }),
        safety: {
          noRawMerchantKey: true,
          noRawProviderPayload: true,
          noSubscriptionIssued: true,
          ...(testOverrideMatches ? { testPaymentAmountOverride: true } : {})
        }
      };
    },

    handleNotification(payload = {}) {
      if (!providerAdapter || typeof providerAdapter.verifyNotification !== "function") {
        throw paymentError("validation_error", "payment provider adapter is not configured");
      }
      const notification = providerAdapter.verifyNotification(payload, {
        receivedAt: isoNow(nowFn)
      });
      const order = getOrder(notification.orderId);
      const bindingError = validateNotificationOrderBinding(order, notification, nowFn);
      if (bindingError) {
        persistOrder(order);
        throw bindingError;
      }
      if (notification.amount !== order.money) {
        order.status = "payment_amount_mismatch";
        order.updatedAt = isoNow(nowFn);
        persistOrder(order);
        throw paymentError("validation_error", "payment amount does not match order");
      }
      if (notification.eventType !== "payment_succeeded") {
        order.status = "payment_failed";
        order.updatedAt = notification.receivedAt || isoNow(nowFn);
        persistOrder(order);
        return {
          order: summarizeOrder(order),
          notification,
          safety: {
            noRawMerchantKey: true,
            noRawProviderPayload: true
          }
        };
      }
      order.paidAt = notification.receivedAt || isoNow(nowFn);
      order.updatedAt = order.paidAt;
      if (accountEntitlements && typeof accountEntitlements.creditPurchasedPlan === "function") {
        if (order.accountCreditStatus !== "credited") {
          const plan = normalizePlan(order.plan, plans);
          const credit = accountEntitlements.creditPurchasedPlan(order.portalUserRef, {
            orderRef: order.orderRef,
            plan: order.plan,
            paidAt: order.paidAt,
            amountMinor: order.amountMinor,
            currency: order.currency,
            durationDays: plan.durationDays,
            trafficGbPerMonth: plan.trafficGbPerMonth
          });
          order.accountCreditStatus = "credited";
          order.accountCreditRef = credit?.entitlement?.id || null;
        }
        order.status = orderStore ? "paid_access_delivered" : "paid_account_credited";
        persistOrder(order);
        return {
          order: summarizeOrder(order),
          notification,
          safety: {
            noRawMerchantKey: true,
            noRawProviderPayload: true,
            noSubscriptionIssued: true
          }
        };
      }
      if (!order.accessRequestRef && portalAccessRequests && typeof portalAccessRequests.submitRequest === "function") {
        const request = portalAccessRequests.submitRequest({
          portalUserRef: order.portalUserRef,
          plan: order.plan,
          clientTarget: order.clientTarget,
          quantity: 1,
          durationDays: order.durationDays,
          note: `paid_order:${order.orderRef}`
        });
        order.accessRequestRef = request.id;
        order.accessRequestStatus = request.status;
      }
      const delivered = ACCESS_DELIVERED_STATUSES.has(order.accessRequestStatus);
      order.status = delivered ? "paid_access_delivered" : "paid_pending_admin_review";
      if (requireAutomaticDelivery && !delivered) {
        order.status = "paid_delivery_blocked";
        persistOrder(order);
        throw paymentError("payment_delivery_blocked", "paid order was not automatically delivered");
      }
      persistOrder(order);
      return {
        order: summarizeOrder(order),
        notification,
        safety: {
          noRawMerchantKey: true,
          noRawProviderPayload: true
        }
      };
    },

    listOrders(filters = {}) {
      if (orderStore && typeof orderStore.listPaymentOrders === "function") {
        return orderStore.listPaymentOrders(filters).map(summarizeOrder);
      }
      const portalUserRef = optionalText(filters.portalUserRef, 160);
      const status = optionalText(filters.status, 80);
      const plan = optionalText(filters.plan, 80);
      return [...byOrderRef.values()]
        .filter((order) => !portalUserRef || order.portalUserRef === portalUserRef)
        .filter((order) => !status || order.status === status)
        .filter((order) => !plan || order.plan === plan)
        .sort((left, right) => String(left.createdAt).localeCompare(String(right.createdAt)) || left.orderRef.localeCompare(right.orderRef))
        .map((order) => summarizeOrder(order, { includePaymentArtifacts: filters.includePaymentArtifacts === true }));
    },

    quoteRefund(orderRef, input = {}) {
      const order = getOrder(text(orderRef, "orderRef", 120));
      if (!REFUNDABLE_PAYMENT_STATUSES.has(order.status)) {
        throw paymentError("validation_error", "payment order is not eligible for refund");
      }
      if (order.refundStatus && NON_RETRYABLE_REFUND_STATUSES.has(order.refundStatus)) {
        throw paymentError("validation_error", "payment order refund is not retryable");
      }
      const approvedAt = normalizeIsoInput(input.approvedAt, "approvedAt", nowFn);
      const quote = calculateRemainingDayRefund(order, approvedAt);
      return {
        order: summarizeOrder(order),
        refund: {
          status: order.refundStatus || "not_requested",
          amountMinor: quote.refundAmountMinor,
          money: moneyFromMinorUnits(quote.refundAmountMinor),
          currency: order.currency,
          durationDays: quote.durationDays,
          usedDays: quote.usedDays,
          remainingDays: quote.remainingDays,
          calculatedAt: quote.calculatedAt,
          basis: "remaining_days"
        },
        safety: {
          noRawMerchantKey: true,
          noRawProviderPayload: true,
          noPaymentMutation: true,
          noSubscriptionMutation: true
        }
      };
    },

    async approveRefund(orderRef, input = {}) {
      const order = getOrder(text(orderRef, "orderRef", 120));
      if (!REFUNDABLE_PAYMENT_STATUSES.has(order.status)) {
        throw paymentError("validation_error", "payment order is not eligible for refund");
      }
      if (order.refundStatus && NON_RETRYABLE_REFUND_STATUSES.has(order.refundStatus)) {
        throw paymentError("validation_error", "payment order refund is not retryable");
      }

      const actorRef = text(input.actorRef || input.operatorRef, "actorRef", 160);
      const reasonCode = text(input.reasonCode || "admin_approved_refund", "reasonCode", 160);
      const approvalRef = text(input.approvalRef, "approvalRef", 160);
      const approvedAt = normalizeIsoInput(input.approvedAt, "approvedAt", nowFn);
      const quote = calculateRemainingDayRefund(order, approvedAt);
      if (quote.refundAmountMinor <= 0) {
        throw paymentError("validation_error", "refund amount is zero");
      }

      const previousStatus = order.status;
      order.refundRequestedAt = order.refundRequestedAt || approvedAt;
      order.refundApprovedAt = approvedAt;
      order.refundAmountMinor = quote.refundAmountMinor;
      order.refundRemainingDays = quote.remainingDays;
      order.refundReasonCode = reasonCode;
      order.refundFailedReason = null;
      order.updatedAt = approvedAt;

      const canSubmitProviderRefund = providerAdapter && typeof providerAdapter.refundPaymentOrder === "function";
      order.refundStatus = canSubmitProviderRefund ? "refund_pending_provider" : "refund_approved";
      persistOrder(order);

      let providerRefund = null;
      if (canSubmitProviderRefund) {
        try {
          providerRefund = await providerAdapter.refundPaymentOrder({
            outTradeNo: order.orderRef,
            providerOrderRef: order.providerOrderRef,
            money: moneyFromMinorUnits(quote.refundAmountMinor)
          });
          if (!providerRefund.success) {
            order.refundStatus = "refund_failed";
            order.refundFailedReason = optionalText(providerRefund.message, 240) || "provider_refund_failed";
            order.updatedAt = isoNow(nowFn);
            persistOrder(order);
            throw paymentError("payment_refund_failed", "payment provider refund was not accepted");
          }
          order.refundStatus = "refund_succeeded";
          order.refundProviderRef = optionalText(providerRefund.providerRefundRef, 120);
          order.updatedAt = isoNow(nowFn);
        } catch (error) {
          if (order.refundStatus !== "refund_failed") {
            order.refundStatus = "refund_failed";
            order.refundFailedReason = optionalText(error.code || error.message, 240) || "provider_refund_failed";
            order.updatedAt = isoNow(nowFn);
            persistOrder(order);
          }
          throw error;
        }
      }

      let disabledAccess = null;
      let accessDisableError = null;
      if (
        order.refundStatus === "refund_succeeded"
        && order.accessRequestRef
        && portalAccessRequests
        && typeof portalAccessRequests.disableSubscription === "function"
      ) {
        try {
          disabledAccess = portalAccessRequests.disableSubscription({
            portalUserRef: order.portalUserRef,
            requestRef: order.accessRequestRef
          });
          order.accessRequestStatus = disabledAccess.status;
          order.updatedAt = isoNow(nowFn);
        } catch (error) {
          accessDisableError = optionalText(error.code || error.message, 120) || "access_disable_failed";
        }
      }

      const stored = persistOrder(order);
      const audit = recordPaymentAudit({
        order: stored,
        action: "payment_order_refund_approved",
        previousStatus,
        input: { actorRef, reasonCode, approvalRef },
        createdAt: approvedAt
      });
      return {
        order: summarizeOrder(stored),
        refund: {
          status: stored.refundStatus,
          amountMinor: quote.refundAmountMinor,
          money: moneyFromMinorUnits(quote.refundAmountMinor),
          currency: stored.currency,
          durationDays: quote.durationDays,
          usedDays: quote.usedDays,
          remainingDays: quote.remainingDays,
          calculatedAt: quote.calculatedAt,
          basis: "remaining_days",
          providerSubmitted: canSubmitProviderRefund,
          ...(providerRefund ? {
            provider: providerRefund.provider,
            providerRefundRef: providerRefund.providerRefundRef
          } : {}),
          ...(disabledAccess ? { accessRequestStatus: disabledAccess.status } : {}),
          ...(accessDisableError ? { accessDisableError } : {})
        },
        audit,
        safety: {
          noRawMerchantKey: true,
          noRawProviderPayload: true,
          noPaymentAmountMutation: true,
          noPlanMutation: true,
          subscriptionDisabledOnlyAfterProviderSuccess: true
        }
      };
    },

    retryDelivery(orderRef, input = {}) {
      const order = getOrder(text(orderRef, "orderRef", 120));
      if (!DELIVERY_RETRY_STATUSES.has(order.status)) {
        throw paymentError("validation_error", "payment order is not eligible for delivery retry");
      }
      const previousStatus = order.status;
      const now = isoNow(nowFn);
      let request = null;
      if (
        order.accessRequestRef
        && portalAccessRequests
        && typeof portalAccessRequests.getRequest === "function"
      ) {
        request = portalAccessRequests.getRequest(order.accessRequestRef);
        order.accessRequestStatus = request.status;
      }
      if (!order.accessRequestRef) {
        if (!portalAccessRequests || typeof portalAccessRequests.submitRequest !== "function") {
          throw paymentError("validation_error", "portal access request service is not configured");
        }
        request = portalAccessRequests.submitRequest({
          portalUserRef: order.portalUserRef,
          plan: order.plan,
          clientTarget: order.clientTarget,
          quantity: 1,
          durationDays: order.durationDays,
          note: `paid_order_retry:${order.orderRef}`
        });
        order.accessRequestRef = request.id;
        order.accessRequestStatus = request.status;
      }
      order.status = ACCESS_DELIVERED_STATUSES.has(order.accessRequestStatus)
        ? "paid_access_delivered"
        : "paid_delivery_blocked";
      order.updatedAt = now;
      const stored = persistOrder(order);
      const audit = recordPaymentAudit({
        order: stored,
        action: "payment_order_delivery_retry",
        previousStatus,
        input,
        createdAt: now
      });
      return {
        order: summarizeOrder(stored),
        audit,
        safety: {
          noRawMerchantKey: true,
          noRawProviderPayload: true,
          noPaymentAmountMutation: true,
          noPlanMutation: true
        }
      };
    }
  };
}
