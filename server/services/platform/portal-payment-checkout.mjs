import { createHash } from "node:crypto";

const SUPPORTED_PLANS = Object.freeze({
  monthly: {
    canonical: "monthly_basic",
    label: "monthly basic",
    amountEnv: "PAYMENT_PLAN_MONTHLY_BASIC_AMOUNT_MINOR"
  },
  monthly_basic: {
    canonical: "monthly_basic",
    label: "monthly basic",
    amountEnv: "PAYMENT_PLAN_MONTHLY_BASIC_AMOUNT_MINOR"
  },
  monthly_plus: {
    canonical: "monthly_plus",
    label: "monthly plus",
    amountEnv: "PAYMENT_PLAN_MONTHLY_PLUS_AMOUNT_MINOR"
  },
  yearly: {
    canonical: "yearly",
    label: "yearly",
    amountEnv: "PAYMENT_PLAN_YEARLY_AMOUNT_MINOR"
  }
});
const CLIENT_TARGETS = new Set(["clash", "karing"]);

function paymentError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function text(value, field, maxLength = 160) {
  const normalized = String(value ?? "").trim().replace(/\s+/g, " ").slice(0, maxLength);
  if (!normalized) {
    throw paymentError("validation_error", `${field} is required`);
  }
  return normalized;
}

function optionalText(value, maxLength = 160) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, maxLength) || null;
}

function normalizePlan(value) {
  const normalized = text(value, "plan", 80).toLowerCase();
  const plan = SUPPORTED_PLANS[normalized];
  if (!plan) {
    throw paymentError("validation_error", "plan is invalid");
  }
  return plan;
}

function normalizeClientTarget(value) {
  const normalized = String(value || "clash").trim();
  if (!CLIENT_TARGETS.has(normalized)) {
    throw paymentError("validation_error", "clientTarget is invalid");
  }
  return normalized;
}

function normalizeChannel(value) {
  const normalized = String(value || "paypal").trim().toLowerCase();
  if (normalized !== "paypal") {
    throw paymentError("validation_error", "payment channel is invalid");
  }
  return normalized;
}

function normalizeCurrency(value) {
  const currency = String(value || "USD").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw paymentError("validation_error", "payment currency is invalid");
  }
  return currency;
}

function amountFromEnv(env, amountEnv) {
  const raw = String(env[amountEnv] ?? "").trim();
  if (!raw) {
    throw paymentError("payment_provider_checkout_unavailable", `${amountEnv} amount env is required`);
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw paymentError("payment_provider_checkout_unavailable", `${amountEnv} amount env must be an integer > 0`);
  }
  return parsed;
}

function isoNow(nowFn) {
  const value = nowFn();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw paymentError("validation_error", "now must be a valid timestamp");
  }
  return date.toISOString();
}

function defaultOrderRef(input) {
  const digest = createHash("sha256")
    .update([
      input.accountRef,
      input.plan,
      input.clientTarget,
      input.createdAt,
      Math.random().toString(36)
    ].join("|"))
    .digest("hex")
    .slice(0, 18);
  return `pay_${digest}`;
}

function paymentExpiresAt(createdAt) {
  return new Date(new Date(createdAt).getTime() + 10 * 60 * 1000).toISOString();
}

function safeCheckout(order, provider = "paypal") {
  return {
    provider,
    order,
    safety: {
      noRawMerchantKey: true,
      noRawProviderPayload: true,
      noSubscriptionIssued: true
    }
  };
}

export function createPortalPaymentCheckoutService(options = {}) {
  const env = options.env || {};
  const providerAdapter = options.providerAdapter;
  if (!providerAdapter || providerAdapter.provider !== "paypal") {
    throw paymentError("payment_provider_checkout_unavailable", "PayPal provider adapter is required");
  }
  const nowFn = options.nowFn || (() => new Date());
  const orderRefFactory = options.orderRefFactory;
  const orders = new Map();
  const orderRefsByAccount = new Map();

  function remember(order) {
    orders.set(order.orderRef, order);
    const accountOrders = orderRefsByAccount.get(order.accountRef) || [];
    if (!accountOrders.includes(order.orderRef)) {
      orderRefsByAccount.set(order.accountRef, [order.orderRef, ...accountOrders]);
    }
  }

  function visibleOrder(order) {
    const {
      accountRef: _accountRef,
      ...safe
    } = order;
    return safe;
  }

  function requireOrder(accountRef, orderRef) {
    const account = text(accountRef, "accountRef", 120);
    const ref = text(orderRef, "orderRef", 120);
    const order = orders.get(ref);
    if (!order || order.accountRef !== account) {
      throw paymentError("payment_order_not_found", "payment order not found");
    }
    return order;
  }

  return {
    provider: "paypal",

    async createCheckout(input = {}) {
      const accountRef = text(input.accountRef, "accountRef", 120);
      const plan = normalizePlan(input.plan);
      const clientTarget = normalizeClientTarget(input.clientTarget);
      const channel = normalizeChannel(input.channel);
      const createdAt = isoNow(nowFn);
      const orderRef = orderRefFactory?.({ accountRef, plan: plan.canonical, clientTarget, createdAt })
        || defaultOrderRef({ accountRef, plan: plan.canonical, clientTarget, createdAt });
      const currency = normalizeCurrency(env.PAYMENT_PROVIDER_CURRENCY || env.PAYMENT_CURRENCY);
      const amountMinor = amountFromEnv(env, plan.amountEnv);
      const providerOrder = await providerAdapter.createCheckoutOrder({
        orderRef,
        accountRef,
        packageRef: plan.canonical,
        amountMinor,
        currency,
        description: `GCC WebOS ${plan.canonical}`
      });
      const order = {
        accountRef,
        orderRef,
        provider: "paypal",
        providerOrderRef: providerOrder.providerOrderRef,
        planId: plan.canonical,
        planLabel: plan.label,
        amountMinor,
        currency,
        channel,
        status: providerOrder.status || "pending_payment",
        checkoutUrl: providerOrder.checkoutUrl,
        createdAt: providerOrder.createdAt || createdAt,
        paymentExpiresAt: paymentExpiresAt(providerOrder.createdAt || createdAt),
        safety: {
          noRawMerchantKey: true,
          noRawProviderPayload: true,
          noSubscriptionIssued: true
        }
      };
      remember(order);
      return safeCheckout(visibleOrder(order));
    },

    listOrders(input = {}) {
      const accountRef = text(input.accountRef, "accountRef", 120);
      const status = optionalText(input.status, 80);
      const requestedPlan = optionalText(input.plan, 80);
      const plan = requestedPlan ? normalizePlan(requestedPlan).canonical : "";
      return (orderRefsByAccount.get(accountRef) || [])
        .map((orderRef) => orders.get(orderRef))
        .filter(Boolean)
        .filter((order) => !status || order.status === status)
        .filter((order) => !plan || order.planId === plan)
        .map((order) => visibleOrder(order));
    },

    async captureCheckout(input = {}) {
      const order = requireOrder(input.accountRef, input.orderRef);
      const captured = await providerAdapter.capturePayment({
        orderRef: order.orderRef,
        providerOrderRef: order.providerOrderRef
      });
      const next = {
        ...order,
        status: captured.status || order.status,
        paidAt: captured.paidAt || order.paidAt,
        providerCaptureRef: captured.providerCaptureRef || order.providerCaptureRef,
        checkedAt: captured.checkedAt
      };
      remember(next);
      return safeCheckout(visibleOrder(next));
    }
  };
}
