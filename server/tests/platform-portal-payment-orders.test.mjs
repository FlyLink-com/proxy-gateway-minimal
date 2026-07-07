import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { createPortalPaymentOrderService } from "../services/platform/portal-payment-orders.mjs";

function fakeAdapter() {
  const createCalls = [];
  return {
    createCalls,
    async createPaymentOrder(input) {
      createCalls.push(structuredClone(input));
      return {
        provider: "niuniu-pay",
        code: 1,
        providerOrderRef: `provider_${input.outTradeNo}`,
        checkoutUrl: `https://pay.example.test/${input.outTradeNo}`,
        qrCode: null,
        urlScheme: null,
        safety: {
          noRawMerchantKey: true,
          noRawProviderPayload: true
        }
      };
    },
    verifyNotification(payload) {
      if (payload.sign !== "valid") {
        const error = new Error("signature is invalid");
        error.code = "niuniu_pay_adapter_error";
        throw error;
      }
      return {
        provider: "niuniu-pay",
        providerEventRef: payload.trade_no,
        orderId: payload.out_trade_no,
        eventType: payload.trade_status === "TRADE_SUCCESS" ? "payment_succeeded" : "payment_failed",
        amount: payload.money,
        channel: payload.type,
        signatureStatus: "verified",
        receivedAt: "2026-07-02T10:05:00.000Z",
        safety: {
          noRawMerchantKey: true,
          noRawProviderPayload: true
        }
      };
    }
  };
}

function fakeRefundAdapter() {
  const adapter = fakeAdapter();
  const refundCalls = [];
  return {
    ...adapter,
    refundCalls,
    async refundPaymentOrder(input) {
      refundCalls.push(structuredClone(input));
      return {
        provider: "niuniu-pay",
        code: 0,
        success: true,
        providerRefundRef: `refund_${input.outTradeNo}`,
        safety: {
          noRawMerchantKey: true,
          noRawProviderPayload: true
        }
      };
    }
  };
}

function fakeAccessRequests(status = "pending_admin_review") {
  const submissions = [];
  return {
    submissions,
    submitRequest(input) {
      submissions.push(structuredClone(input));
      return {
        id: `pareq_${input.plan}`,
        portalUserRef: input.portalUserRef,
        plan: input.plan,
        clientTarget: input.clientTarget,
        durationDays: input.durationDays,
        quantity: input.quantity,
        status,
        submittedAt: "2026-07-02T10:06:00.000Z",
        subscriptionUrl: status === "delivered" ? "https://sub.example.test/sub/a/visible-once" : undefined
      };
    }
  };
}

function fakeRetryableAccessRequests(status = "pending_admin_review") {
  const submissions = [];
  const requests = new Map();
  return {
    submissions,
    setStatus(id, nextStatus) {
      const record = requests.get(id);
      requests.set(id, { ...record, status: nextStatus });
    },
    submitRequest(input) {
      submissions.push(structuredClone(input));
      const record = {
        id: `pareq_retry_${submissions.length}`,
        portalUserRef: input.portalUserRef,
        plan: input.plan,
        clientTarget: input.clientTarget,
        durationDays: input.durationDays,
        quantity: input.quantity,
        status,
        submittedAt: "2026-07-02T10:06:00.000Z"
      };
      requests.set(record.id, record);
      return structuredClone(record);
    },
    getRequest(id) {
      const record = requests.get(id);
      if (!record) {
        const error = new Error("request was not found");
        error.code = "not_found";
        throw error;
      }
      return structuredClone(record);
    }
  };
}

function fakeAccountEntitlements() {
  const credits = [];
  return {
    credits,
    creditPurchasedPlan(accountId, input) {
      credits.push({ accountId, ...structuredClone(input) });
      return {
        account: { id: accountId },
        entitlement: {
          id: `ent_${input.plan}`,
          accountId,
          plan: input.plan,
          validUntil: "2026-08-01T10:05:00.000Z",
          quota: { trafficGb: input.trafficGbPerMonth }
        },
        plan: {
          plan: input.plan,
          durationDays: input.durationDays,
          trafficGbPerMonth: input.trafficGbPerMonth
        }
      };
    }
  };
}

function digestIdentity(value) {
  return createHash("sha256").update(String(value).trim().toLowerCase()).digest("hex");
}

test("portal payment service creates a Niuniu checkout for paid plans only", async () => {
  const adapter = fakeAdapter();
  const payments = createPortalPaymentOrderService({
    providerAdapter: adapter,
    nowFn: () => "2026-07-02T10:00:00.000Z",
    orderIdFactory: () => "pay_order_001",
    notifyUrl: "https://portal.gccwebos.com/api/portal/payments/notify",
    returnUrl: "https://portal.gccwebos.com/"
  });

  const checkout = await payments.createCheckout({
    portalUserRef: "user_safe_ref",
    plan: "monthly_basic",
    clientTarget: "clash",
    channel: "alipay",
    clientIp: "203.0.113.10"
  });

  assert.equal(adapter.createCalls.length, 1);
  assert.deepEqual(adapter.createCalls[0], {
    type: "alipay",
    outTradeNo: "pay_order_001",
    notifyUrl: "https://portal.gccwebos.com/api/portal/payments/notify",
    returnUrl: "https://portal.gccwebos.com/",
    name: "GCC WebOS monthly basic",
    money: "20.00",
    clientIp: "203.0.113.10",
    device: "pc",
    param: "monthly_basic"
  });
  assert.deepEqual(checkout, {
    provider: "niuniu-pay",
    order: {
      orderRef: "pay_order_001",
      plan: "monthly_basic",
      planLabel: "monthly basic",
      amountMinor: 2000,
      currency: "CNY",
      channel: "alipay",
      status: "pending_payment",
      providerOrderRef: "provider_pay_order_001",
      checkoutUrl: "https://pay.example.test/pay_order_001",
      checkoutExpiresAt: "2026-07-02T10:10:00.000Z",
      createdAt: "2026-07-02T10:00:00.000Z"
    },
    safety: {
      noRawMerchantKey: true,
      noRawProviderPayload: true,
      noSubscriptionIssued: true
    }
  });

  await assert.rejects(() => payments.createCheckout({
    portalUserRef: "user_safe_ref",
    plan: "trial",
    clientTarget: "clash",
    channel: "alipay",
    clientIp: "203.0.113.10"
  }), /plan is not purchasable/);
});

test("portal payment service does not persist placeholder orders without provider checkout facts", async () => {
  const cases = [
    {
      name: "rejected provider code",
      result: {
        provider: "niuniu-pay",
        code: 0,
        providerOrderRef: null,
        checkoutUrl: null
      }
    },
    {
      name: "missing checkout URL",
      result: {
        provider: "niuniu-pay",
        code: 1,
        providerOrderRef: "provider_missing_url",
        checkoutUrl: null
      }
    }
  ];

  for (const entry of cases) {
    const payments = createPortalPaymentOrderService({
      providerAdapter: {
        async createPaymentOrder() {
          return entry.result;
        }
      },
      nowFn: () => "2026-07-02T10:00:00.000Z",
      orderIdFactory: () => `pay_${entry.name.replace(/\s+/g, "_")}`,
      notifyUrl: "https://portal.gccwebos.com/api/portal/payments/notify",
      returnUrl: "https://portal.gccwebos.com/"
    });

    await assert.rejects(() => payments.createCheckout({
      portalUserRef: "user_safe_ref",
      plan: "monthly_basic",
      clientTarget: "clash",
      channel: "wxpay",
      clientIp: "203.0.113.10"
    }), /payment provider did not/);

    assert.deepEqual(payments.listOrders(), []);
  }
});

test("portal payment service preserves mobile payment artifacts without requiring checkout URL", async () => {
  const createCalls = [];
  const payments = createPortalPaymentOrderService({
    providerAdapter: {
      async createPaymentOrder(input) {
        createCalls.push(structuredClone(input));
        return {
          provider: "niuniu-pay",
          code: 1,
          providerOrderRef: "provider_mobile_001",
          checkoutUrl: null,
          qrCode: "wxpay_qr_payload_safe",
          urlScheme: "weixin://pay/provider_mobile_001"
        };
      }
    },
    nowFn: () => "2026-07-02T10:00:00.000Z",
    orderIdFactory: () => "pay_mobile_001",
    notifyUrl: "https://portal.gccwebos.com/api/portal/payments/notify",
    returnUrl: "https://portal.gccwebos.com/"
  });

  const checkout = await payments.createCheckout({
    portalUserRef: "user_safe_ref",
    plan: "monthly_basic",
    clientTarget: "clash",
    channel: "wxpay",
    clientIp: "203.0.113.10",
    device: "mobile"
  });

  assert.equal(createCalls[0].device, "mobile");
  assert.equal(checkout.order.providerOrderRef, "provider_mobile_001");
  assert.equal(checkout.order.urlScheme, "weixin://pay/provider_mobile_001");
  assert.equal(checkout.order.qrCode, "wxpay_qr_payload_safe");
  assert.equal("checkoutUrl" in checkout.order, false);

  const portalOrders = payments.listOrders({ portalUserRef: "user_safe_ref", includePaymentArtifacts: true });
  assert.equal(portalOrders[0].urlScheme, "weixin://pay/provider_mobile_001");
  assert.equal(portalOrders[0].qrCode, "wxpay_qr_payload_safe");

  const adminOrders = payments.listOrders({ portalUserRef: "user_safe_ref" });
  assert.equal("urlScheme" in adminOrders[0], false);
  assert.equal("qrCode" in adminOrders[0], false);
});

test("portal payment service limits 0.01 test checkout to the configured account digest", async () => {
  const adapter = fakeAdapter();
  let sequence = 0;
  const payments = createPortalPaymentOrderService({
    providerAdapter: adapter,
    portalAccessRequests: fakeAccessRequests("delivered"),
    requireAutomaticDelivery: true,
    orderStore: {
      getAccount(accountId) {
        if (accountId === "acct_test") {
          return {
            id: "acct_test",
            ownerRef: "acct_test",
            metadata: {
              loginRef: "test-account@example.test",
              displayRef: "test-account@example.test"
            }
          };
        }
        return {
          id: accountId,
          ownerRef: accountId,
          metadata: {
            loginRef: "other-account@example.test",
            displayRef: "other-account@example.test"
          }
        };
      }
    },
    testPaymentOverride: {
      accountDigest: digestIdentity("test-account@example.test"),
      amountMinor: 1,
      channel: "wxpay",
      plan: "monthly_basic"
    },
    nowFn: () => "2026-07-02T10:00:00.000Z",
    orderIdFactory: () => `pay_test_${++sequence}`,
    notifyUrl: "https://portal.gccwebos.com/api/portal/payments/notify",
    returnUrl: "https://portal.gccwebos.com/"
  });

  const checkout = await payments.createCheckout({
    portalUserRef: "acct_test",
    plan: "monthly_basic",
    clientTarget: "clash",
    channel: "wxpay",
    clientIp: "203.0.113.10"
  });

  assert.equal(adapter.createCalls[0].money, "0.01");
  assert.equal(checkout.order.amountMinor, 1);
  assert.equal(checkout.order.checkoutExpiresAt, "2026-07-02T10:10:00.000Z");
  assert.equal(checkout.safety.testPaymentAmountOverride, true);
  assert.equal(checkout.order.loginRef, "test-account@example.test");

  const paid = payments.handleNotification({
    sign: "valid",
    trade_no: "provider_pay_test_1",
    out_trade_no: "pay_test_1",
    trade_status: "TRADE_SUCCESS",
    money: "0.01",
    type: "wxpay"
  });
  assert.equal(paid.order.status, "paid_access_delivered");

  const regular = await payments.createCheckout({
    portalUserRef: "acct_other",
    plan: "monthly_basic",
    clientTarget: "clash",
    channel: "wxpay",
    clientIp: "203.0.113.10"
  });

  assert.equal(adapter.createCalls[1].money, "20.00");
  assert.equal(regular.order.amountMinor, 2000);
  assert.equal(regular.safety.testPaymentAmountOverride, undefined);
});

test("portal payment service verifies notification and auto-delivers paid access once", async () => {
  const accessRequests = fakeAccessRequests("delivered");
  const payments = createPortalPaymentOrderService({
    providerAdapter: fakeAdapter(),
    portalAccessRequests: accessRequests,
    requireAutomaticDelivery: true,
    nowFn: () => "2026-07-02T10:00:00.000Z",
    orderIdFactory: () => "pay_order_002",
    notifyUrl: "https://portal.gccwebos.com/api/portal/payments/notify",
    returnUrl: "https://portal.gccwebos.com/"
  });
  await payments.createCheckout({
    portalUserRef: "user_safe_ref",
    plan: "yearly",
    clientTarget: "karing",
    channel: "alipay",
    clientIp: "203.0.113.10"
  });

  const result = payments.handleNotification({
    sign: "valid",
    trade_no: "provider_pay_order_002",
    out_trade_no: "pay_order_002",
    trade_status: "TRADE_SUCCESS",
    type: "alipay",
    money: "200.00"
  });

  assert.equal(accessRequests.submissions.length, 1);
  assert.deepEqual(accessRequests.submissions[0], {
    portalUserRef: "user_safe_ref",
    plan: "yearly",
    clientTarget: "karing",
    quantity: 1,
    durationDays: 365,
    note: "paid_order:pay_order_002"
  });
  assert.equal(result.order.status, "paid_access_delivered");
  assert.equal(result.order.accessRequestRef, "pareq_yearly");
  assert.equal(result.order.accessRequestStatus, "delivered");
  assert.equal(result.notification.signatureStatus, "verified");
  assert.equal(JSON.stringify(result).includes("merchant"), false);
  assert.equal(JSON.stringify(result).includes("visible-once"), false);

  const repeated = payments.handleNotification({
    sign: "valid",
    trade_no: "provider_pay_order_002",
    out_trade_no: "pay_order_002",
    trade_status: "TRADE_SUCCESS",
    type: "alipay",
    money: "200.00"
  });
  assert.equal(accessRequests.submissions.length, 1);
  assert.equal(repeated.order.accessRequestRef, "pareq_yearly");
  assert.equal(repeated.order.status, "paid_access_delivered");
});

test("portal payment service credits account balance without creating subscription access", async () => {
  const accessRequests = fakeAccessRequests("delivered");
  const accountEntitlements = fakeAccountEntitlements();
  const payments = createPortalPaymentOrderService({
    providerAdapter: fakeAdapter(),
    portalAccessRequests: accessRequests,
    accountEntitlements,
    nowFn: () => "2026-07-02T10:00:00.000Z",
    orderIdFactory: () => "pay_order_account_credit",
    notifyUrl: "https://portal.gccwebos.com/api/portal/payments/notify",
    returnUrl: "https://portal.gccwebos.com/"
  });
  await payments.createCheckout({
    portalUserRef: "user_safe_ref",
    plan: "monthly_plus",
    clientTarget: "karing",
    channel: "alipay",
    clientIp: "203.0.113.10"
  });

  const result = payments.handleNotification({
    sign: "valid",
    trade_no: "provider_pay_order_account_credit",
    out_trade_no: "pay_order_account_credit",
    trade_status: "TRADE_SUCCESS",
    type: "alipay",
    money: "30.00"
  });

  assert.deepEqual(accountEntitlements.credits, [{
    accountId: "user_safe_ref",
    amountMinor: 3000,
    currency: "CNY",
    durationDays: 30,
    orderRef: "pay_order_account_credit",
    paidAt: "2026-07-02T10:05:00.000Z",
    plan: "monthly_plus",
    trafficGbPerMonth: 100
  }]);
  assert.equal(accessRequests.submissions.length, 0);
  assert.equal(result.order.status, "paid_account_credited");
  assert.equal(result.order.accountCreditStatus, "credited");
  assert.equal(result.order.accessRequestRef, undefined);
  assert.equal(result.order.accessRequestStatus, undefined);
  assert.equal(result.safety.noSubscriptionIssued, true);
});

test("portal payment service rejects callbacks when provider trade reference does not match checkout order", async () => {
  const accessRequests = fakeAccessRequests("delivered");
  const payments = createPortalPaymentOrderService({
    providerAdapter: fakeAdapter(),
    portalAccessRequests: accessRequests,
    requireAutomaticDelivery: true,
    nowFn: () => "2026-07-02T10:00:00.000Z",
    orderIdFactory: () => "pay_order_provider_mismatch",
    notifyUrl: "https://portal.gccwebos.com/api/portal/payments/notify",
    returnUrl: "https://portal.gccwebos.com/"
  });
  await payments.createCheckout({
    portalUserRef: "user_safe_ref",
    plan: "monthly_plus",
    clientTarget: "clash",
    channel: "alipay",
    clientIp: "203.0.113.10"
  });

  assert.throws(() => payments.handleNotification({
    sign: "valid",
    trade_no: "provider_other_trade",
    out_trade_no: "pay_order_provider_mismatch",
    trade_status: "TRADE_SUCCESS",
    type: "alipay",
    money: "30.00"
  }), (error) => error.code === "validation_error" && /provider order/i.test(error.message));

  assert.equal(accessRequests.submissions.length, 0);
  assert.equal(payments.listOrders()[0].status, "payment_provider_order_mismatch");
});

test("portal payment service rejects callbacks when payment channel does not match checkout order", async () => {
  const accessRequests = fakeAccessRequests("delivered");
  const payments = createPortalPaymentOrderService({
    providerAdapter: fakeAdapter(),
    portalAccessRequests: accessRequests,
    requireAutomaticDelivery: true,
    nowFn: () => "2026-07-02T10:00:00.000Z",
    orderIdFactory: () => "pay_order_channel_mismatch",
    notifyUrl: "https://portal.gccwebos.com/api/portal/payments/notify",
    returnUrl: "https://portal.gccwebos.com/"
  });
  await payments.createCheckout({
    portalUserRef: "user_safe_ref",
    plan: "monthly_plus",
    clientTarget: "clash",
    channel: "alipay",
    clientIp: "203.0.113.10"
  });

  assert.throws(() => payments.handleNotification({
    sign: "valid",
    trade_no: "provider_pay_order_channel_mismatch",
    out_trade_no: "pay_order_channel_mismatch",
    trade_status: "TRADE_SUCCESS",
    type: "wxpay",
    money: "30.00"
  }), (error) => error.code === "validation_error" && /payment channel/i.test(error.message));

  assert.equal(accessRequests.submissions.length, 0);
  assert.equal(payments.listOrders()[0].status, "payment_channel_mismatch");
});

test("portal payment service blocks paid callbacks when automatic delivery is required but not completed", async () => {
  const payments = createPortalPaymentOrderService({
    providerAdapter: fakeAdapter(),
    portalAccessRequests: fakeAccessRequests("pending_admin_review"),
    requireAutomaticDelivery: true,
    nowFn: () => "2026-07-02T10:00:00.000Z",
    orderIdFactory: () => "pay_order_003",
    notifyUrl: "https://portal.gccwebos.com/api/portal/payments/notify",
    returnUrl: "https://portal.gccwebos.com/"
  });
  await payments.createCheckout({
    portalUserRef: "user_safe_ref",
    plan: "monthly_plus",
    clientTarget: "clash",
    channel: "wxpay",
    clientIp: "203.0.113.10"
  });

  assert.throws(() => payments.handleNotification({
    sign: "valid",
    trade_no: "provider_pay_order_003",
    out_trade_no: "pay_order_003",
    trade_status: "TRADE_SUCCESS",
    type: "wxpay",
    money: "30.00"
  }), (error) => error.code === "payment_delivery_blocked");

  assert.deepEqual(payments.listOrders(), [{
    orderRef: "pay_order_003",
    plan: "monthly_plus",
    planLabel: "monthly plus",
    amountMinor: 3000,
    currency: "CNY",
    channel: "wxpay",
    status: "paid_delivery_blocked",
    providerOrderRef: "provider_pay_order_003",
    checkoutUrl: "https://pay.example.test/pay_order_003",
    checkoutExpiresAt: "2026-07-02T10:10:00.000Z",
    accessRequestRef: "pareq_monthly_plus",
    accessRequestStatus: "pending_admin_review",
    createdAt: "2026-07-02T10:00:00.000Z",
    paidAt: "2026-07-02T10:05:00.000Z"
  }]);
});

test("portal payment service resumes persisted checkout orders for provider callbacks", async () => {
  const storedOrders = new Map();
  const orderStore = {
    upsertPaymentOrder(input) {
      const record = structuredClone(input);
      storedOrders.set(record.orderRef, record);
      return structuredClone(record);
    },
    getPaymentOrder(orderRef) {
      const record = storedOrders.get(orderRef);
      return record ? structuredClone(record) : null;
    },
    listPaymentOrders() {
      return [...storedOrders.values()].map((record) => structuredClone(record));
    }
  };
  const firstProcess = createPortalPaymentOrderService({
    providerAdapter: fakeAdapter(),
    orderStore,
    nowFn: () => "2026-07-02T10:00:00.000Z",
    orderIdFactory: () => "pay_order_persisted",
    notifyUrl: "https://portal.gccwebos.com/api/portal/payments/notify",
    returnUrl: "https://portal.gccwebos.com/"
  });
  await firstProcess.createCheckout({
    portalUserRef: "user_safe_ref",
    plan: "monthly_basic",
    clientTarget: "clash",
    channel: "wxpay",
    clientIp: "203.0.113.10"
  });

  const accessRequests = fakeAccessRequests("delivered");
  const secondProcess = createPortalPaymentOrderService({
    providerAdapter: fakeAdapter(),
    orderStore,
    portalAccessRequests: accessRequests,
    requireAutomaticDelivery: true,
    nowFn: () => "2026-07-02T10:05:00.000Z",
    notifyUrl: "https://portal.gccwebos.com/api/portal/payments/notify",
    returnUrl: "https://portal.gccwebos.com/"
  });

  const result = secondProcess.handleNotification({
    sign: "valid",
    trade_no: "provider_pay_order_persisted",
    out_trade_no: "pay_order_persisted",
    trade_status: "TRADE_SUCCESS",
    type: "wxpay",
    money: "20.00"
  });

  assert.equal(result.order.status, "paid_access_delivered");
  assert.equal(result.order.accessRequestRef, "pareq_monthly_basic");
  assert.deepEqual(secondProcess.listOrders({ portalUserRef: "user_safe_ref" }), [{
    orderRef: "pay_order_persisted",
    plan: "monthly_basic",
    planLabel: "monthly basic",
    amountMinor: 2000,
    currency: "CNY",
    channel: "wxpay",
    status: "paid_access_delivered",
    providerOrderRef: "provider_pay_order_persisted",
    checkoutUrl: "https://pay.example.test/pay_order_persisted",
    checkoutExpiresAt: "2026-07-02T10:10:00.000Z",
    accessRequestRef: "pareq_monthly_basic",
    accessRequestStatus: "delivered",
    createdAt: "2026-07-02T10:00:00.000Z",
    paidAt: "2026-07-02T10:05:00.000Z"
  }]);
});

test("portal payment service exposes public login refs from account metadata only", async () => {
  const storedOrders = new Map();
  const orderStore = {
    upsertPaymentOrder(input) {
      const record = structuredClone(input);
      storedOrders.set(record.orderRef, record);
      return structuredClone(record);
    },
    getPaymentOrder(orderRef) {
      const record = storedOrders.get(orderRef);
      return record ? structuredClone(record) : null;
    },
    listPaymentOrders() {
      return [...storedOrders.values()].map((record) => structuredClone(record));
    },
    getAccount(id) {
      if (id !== "acct_safe_public_ref") {
        return null;
      }
      return {
        id,
        metadata: {
          loginRef: "buyer@example.test",
          displayRef: "buyer@example.test"
        }
      };
    }
  };
  const payments = createPortalPaymentOrderService({
    providerAdapter: fakeAdapter(),
    orderStore,
    nowFn: () => "2026-07-02T11:00:00.000Z",
    orderIdFactory: () => "pay_order_public_ref",
    notifyUrl: "https://portal.gccwebos.com/api/portal/payments/notify",
    returnUrl: "https://portal.gccwebos.com/"
  });

  await payments.createCheckout({
    portalUserRef: "acct_safe_public_ref",
    plan: "monthly_plus",
    clientTarget: "clash",
    channel: "wxpay",
    clientIp: "203.0.113.10"
  });

  const [order] = payments.listOrders();
  assert.equal(order.loginRef, "buyer@example.test");
  assert.equal(order.displayRef, "buyer@example.test");
  assert.equal(order.portalUserRef, undefined);
  assert.equal(JSON.stringify(order).includes("acct_safe_public_ref"), false);
  assert.equal(JSON.stringify(order).includes("merchant"), false);
  assert.equal(JSON.stringify(order).includes("rawPayload"), false);
});

test("portal payment service retries blocked delivery with auditable admin context", async () => {
  const storedOrders = new Map();
  const auditEvents = [];
  const orderStore = {
    upsertPaymentOrder(input) {
      const record = structuredClone(input);
      storedOrders.set(record.orderRef, record);
      return structuredClone(record);
    },
    getPaymentOrder(orderRef) {
      const record = storedOrders.get(orderRef);
      return record ? structuredClone(record) : null;
    },
    listPaymentOrders() {
      return [...storedOrders.values()].map((record) => structuredClone(record));
    },
    recordAuditEvent(input) {
      auditEvents.push(structuredClone(input));
      return structuredClone(input);
    }
  };
  const accessRequests = fakeRetryableAccessRequests("pending_admin_review");
  const payments = createPortalPaymentOrderService({
    providerAdapter: fakeAdapter(),
    orderStore,
    portalAccessRequests: accessRequests,
    requireAutomaticDelivery: true,
    nowFn: () => "2026-07-02T10:00:00.000Z",
    orderIdFactory: () => "pay_order_retry_001",
    notifyUrl: "https://portal.gccwebos.com/api/portal/payments/notify",
    returnUrl: "https://portal.gccwebos.com/"
  });
  await payments.createCheckout({
    portalUserRef: "user_safe_ref",
    plan: "monthly_plus",
    clientTarget: "clash",
    channel: "wxpay",
    clientIp: "203.0.113.10"
  });
  assert.throws(() => payments.handleNotification({
    sign: "valid",
    trade_no: "provider_pay_order_retry_001",
    out_trade_no: "pay_order_retry_001",
    trade_status: "TRADE_SUCCESS",
    type: "wxpay",
    money: "30.00"
  }), (error) => error.code === "payment_delivery_blocked");

  assert.throws(() => payments.retryDelivery("pay_order_retry_001", {
    actorRef: "operator_001",
    reasonCode: "payment_delivery_retry"
  }), /approvalRef is required/);

  accessRequests.setStatus("pareq_retry_1", "delivered");
  const result = payments.retryDelivery("pay_order_retry_001", {
    actorRef: "operator_001",
    reasonCode: "payment_delivery_retry",
    approvalRef: "approval_retry_001"
  });

  assert.equal(result.order.status, "paid_access_delivered");
  assert.equal(result.order.accessRequestRef, "pareq_retry_1");
  assert.equal(result.order.accessRequestStatus, "delivered");
  assert.equal(result.audit.action, "payment_order_delivery_retry");
  assert.equal(auditEvents.length, 1);
  assert.equal(auditEvents[0].entityType, "payment_order");
  assert.equal(auditEvents[0].entityRef, "pay_order_retry_001");
  assert.equal(auditEvents[0].metadata.previousStatus, "paid_delivery_blocked");
  assert.equal(auditEvents[0].metadata.nextStatus, "paid_access_delivered");
  assert.equal(JSON.stringify(result).includes("merchant"), false);
  assert.equal(JSON.stringify(result).includes("raw"), false);
});

test("portal payment service approves refunds by remaining subscription days", async () => {
  const storedOrders = new Map();
  const auditEvents = [];
  const orderStore = {
    upsertPaymentOrder(input) {
      const record = structuredClone(input);
      storedOrders.set(record.orderRef, record);
      return structuredClone(record);
    },
    getPaymentOrder(orderRef) {
      const record = storedOrders.get(orderRef);
      return record ? structuredClone(record) : null;
    },
    listPaymentOrders() {
      return [...storedOrders.values()].map((record) => structuredClone(record));
    },
    recordAuditEvent(input) {
      auditEvents.push(structuredClone(input));
      return structuredClone(input);
    }
  };
  const accessRequests = fakeAccessRequests("delivered");
  const disableCalls = [];
  accessRequests.disableSubscription = (input) => {
    disableCalls.push(structuredClone(input));
    return {
      id: input.requestRef,
      portalUserRef: input.portalUserRef,
      status: "disabled"
    };
  };
  const adapter = fakeRefundAdapter();
  let currentNow = "2026-07-02T10:00:00.000Z";
  const payments = createPortalPaymentOrderService({
    providerAdapter: adapter,
    portalAccessRequests: accessRequests,
    requireAutomaticDelivery: true,
    orderStore,
    nowFn: () => currentNow,
    orderIdFactory: () => "pay_order_refund_001",
    notifyUrl: "https://portal.gccwebos.com/api/portal/payments/notify",
    returnUrl: "https://portal.gccwebos.com/"
  });

  await payments.createCheckout({
    portalUserRef: "user_safe_ref",
    plan: "monthly_plus",
    clientTarget: "clash",
    channel: "alipay",
    clientIp: "203.0.113.10"
  });
  payments.handleNotification({
    sign: "valid",
    trade_no: "provider_pay_order_refund_001",
    out_trade_no: "pay_order_refund_001",
    trade_status: "TRADE_SUCCESS",
    type: "alipay",
    money: "30.00"
  });
  currentNow = "2026-07-12T10:05:00.000Z";

  const quote = payments.quoteRefund("pay_order_refund_001", {
    approvedAt: "2026-07-12T10:05:00.000Z"
  });
  assert.equal(quote.refund.remainingDays, 20);
  assert.equal(quote.refund.amountMinor, 2000);
  assert.equal(quote.refund.money, "20.00");
  assert.throws(() => payments.quoteRefund("pay_order_refund_001", {
    approvedAt: "not-a-date"
  }), /approvedAt is invalid/);

  const result = await payments.approveRefund("pay_order_refund_001", {
    actorRef: "operator_001",
    reasonCode: "customer_requested_refund",
    approvalRef: "approval_refund_001",
    approvedAt: "2026-07-12T10:05:00.000Z"
  });

  assert.deepEqual(adapter.refundCalls, [{
    outTradeNo: "pay_order_refund_001",
    providerOrderRef: "provider_pay_order_refund_001",
    money: "20.00"
  }]);
  assert.deepEqual(disableCalls, [{
    portalUserRef: "user_safe_ref",
    requestRef: "pareq_monthly_plus"
  }]);
  assert.equal(result.order.refund.status, "refund_succeeded");
  assert.equal(result.order.refund.amountMinor, 2000);
  assert.equal(result.order.refund.remainingDays, 20);
  assert.equal(result.order.accessRequestStatus, "disabled");
  assert.equal(result.refund.providerSubmitted, true);
  assert.equal(result.audit.action, "payment_order_refund_approved");
  assert.equal(auditEvents.length, 1);
  assert.equal(auditEvents[0].metadata.refundStatus, "refund_succeeded");
  assert.equal(auditEvents[0].metadata.refundAmountMinor, 2000);
  assert.equal(JSON.stringify(result).includes("merchant"), false);
  assert.equal(JSON.stringify(result).includes("raw"), false);

  await assert.rejects(() => payments.approveRefund("pay_order_refund_001", {
    actorRef: "operator_001",
    reasonCode: "customer_requested_refund",
    approvalRef: "approval_refund_repeat_001"
  }), /payment order refund is not retryable/);
});
