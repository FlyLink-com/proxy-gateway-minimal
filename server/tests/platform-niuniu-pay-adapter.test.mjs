import assert from "node:assert/strict";
import test from "node:test";
import {
  buildNiuniuPaySignature,
  createNiuniuPayAdapter,
  verifyNiuniuPaySignature
} from "../services/platform/niuniu-pay-adapter.mjs";

test("Niuniu Pay signature sorts fields and excludes signature metadata", () => {
  const sign = buildNiuniuPaySignature({
    pid: "1001",
    name: "VIP",
    money: "1.00",
    sign: "old-sign",
    sign_type: "MD5",
    empty: ""
  }, "test_key");

  assert.equal(sign, "739435d9b7485676731e9b93c71d3c75");
});

test("Niuniu Pay adapter queries merchant info without exposing returned sensitive fields", async () => {
  let capturedUrl;
  const adapter = createNiuniuPayAdapter({
    apiBaseUrl: "https://niuniuapi.example.test",
    merchantId: "1001",
    merchantKey: "test_key",
    fetchFn: async (url) => {
      capturedUrl = new URL(url);
      return {
        ok: true,
        json: async () => ({
          code: 1,
          pid: 1001,
          key: "returned-secret-key",
          active: 1,
          money: "12.34",
          type: 1,
          account: "settlement-account",
          username: "settlement-name",
          orders: 7,
          order_today: 2,
          order_lastday: 3
        })
      };
    }
  });

  const result = await adapter.queryMerchant();

  assert.equal(capturedUrl.origin, "https://niuniuapi.example.test");
  assert.equal(capturedUrl.pathname, "/api.php");
  assert.equal(capturedUrl.searchParams.get("act"), "query");
  assert.equal(capturedUrl.searchParams.get("pid"), "1001");
  assert.equal(capturedUrl.searchParams.get("key"), "test_key");
  assert.deepEqual(result, {
    provider: "niuniu-pay",
    code: 1,
    pidMatched: true,
    active: 1,
    money: "12.34",
    settlementType: 1,
    orders: 7,
    orderToday: 2,
    orderLastday: 3,
    safety: {
      noRawMerchantKey: true,
      noSettlementAccount: true,
      noSettlementName: true
    }
  });
  assert.doesNotMatch(JSON.stringify(result), /returned-secret-key|settlement-account|settlement-name/);
});

test("Niuniu Pay adapter creates signed order payload through injected fetch", async () => {
  let captured;
  const adapter = createNiuniuPayAdapter({
    apiBaseUrl: "https://niuniuapi.example.test",
    merchantId: "1001",
    merchantKey: "test_key",
    fetchFn: async (url, init) => {
      captured = { url, init };
      return {
        ok: true,
        json: async () => ({
          code: 1,
          trade_no: "provider_trade_001",
          payurl: "https://niuniupay.example.test/pay/provider_trade_001"
        })
      };
    }
  });

  const result = await adapter.createPaymentOrder({
    type: "alipay",
    outTradeNo: "gcc_order_001",
    notifyUrl: "https://portal.gccwebos.com/api/portal/payments/notify",
    returnUrl: "https://portal.gccwebos.com/",
    name: "GCC WebOS Monthly Basic",
    money: "20.00",
    clientIp: "203.0.113.10",
    device: "pc",
    param: "plan_monthly_basic"
  });

  assert.equal(captured.url, "https://niuniuapi.example.test/mapi.php");
  assert.equal(captured.init.method, "POST");
  assert.equal(captured.init.headers["Content-Type"], "application/x-www-form-urlencoded");
  const body = new URLSearchParams(captured.init.body);
  assert.equal(body.get("pid"), "1001");
  assert.equal(body.get("type"), "alipay");
  assert.equal(body.get("out_trade_no"), "gcc_order_001");
  assert.equal(body.get("sign_type"), "MD5");
  assert.match(body.get("sign"), /^[a-f0-9]{32}$/);
  assert.deepEqual(result, {
    provider: "niuniu-pay",
    code: 1,
    providerOrderRef: "provider_trade_001",
    checkoutUrl: "https://niuniupay.example.test/pay/provider_trade_001",
    qrCode: null,
    urlScheme: null,
    safety: {
      noRawMerchantKey: true,
      noRawProviderPayload: true
    }
  });
});

test("Niuniu Pay adapter preserves alternate QR and URL scheme fields", async () => {
  const adapter = createNiuniuPayAdapter({
    apiBaseUrl: "https://niuniuapi.example.test",
    merchantId: "1001",
    merchantKey: "test_key",
    fetchFn: async () => ({
      ok: true,
      json: async () => ({
        code: 1,
        trade_no: "provider_trade_wx_001",
        payurl: "https://niuniupay.example.test/pay/provider_trade_wx_001",
        code_url: "weixin://wxpay/bizpayurl?pr=safeSynthetic",
        qr_url: "weixin://wxpay/bizpayurl?pr=safeQrUrl",
        url_scheme: "weixin://pay/provider_trade_wx_001"
      })
    })
  });

  const result = await adapter.createPaymentOrder({
    type: "wxpay",
    outTradeNo: "gcc_order_wx_001",
    notifyUrl: "https://portal.gccwebos.com/api/portal/payments/notify",
    returnUrl: "https://portal.gccwebos.com/",
    name: "GCC WebOS Monthly Basic",
    money: "20.00",
    clientIp: "203.0.113.10",
    device: "pc",
    param: "plan_monthly_basic"
  });

  assert.equal(result.providerOrderRef, "provider_trade_wx_001");
  assert.equal(result.checkoutUrl, "https://niuniupay.example.test/pay/provider_trade_wx_001");
  assert.equal(result.qrCode, "weixin://wxpay/bizpayurl?pr=safeSynthetic");
  assert.equal(result.urlScheme, "weixin://pay/provider_trade_wx_001");
});

test("Niuniu Pay adapter submits refund requests without exposing merchant material", async () => {
  let captured;
  const adapter = createNiuniuPayAdapter({
    apiBaseUrl: "https://niuniuapi.example.test",
    merchantId: "1001",
    merchantKey: "test_key",
    fetchFn: async (url, init) => {
      captured = { url, init };
      return {
        ok: true,
        json: async () => ({
          code: 0,
          msg: "refund accepted",
          trade_no: "provider_trade_001"
        })
      };
    }
  });

  const result = await adapter.refundPaymentOrder({
    outTradeNo: "gcc_order_001",
    providerOrderRef: "provider_trade_001",
    money: "12.34"
  });

  assert.equal(captured.url, "https://niuniuapi.example.test/api.php?act=refund");
  assert.equal(captured.init.method, "POST");
  assert.equal(captured.init.headers["Content-Type"], "application/x-www-form-urlencoded");
  const body = new URLSearchParams(captured.init.body);
  assert.equal(body.get("pid"), "1001");
  assert.equal(body.get("key"), "test_key");
  assert.equal(body.get("money"), "12.34");
  assert.equal(body.get("trade_no"), "provider_trade_001");
  assert.equal(body.get("out_trade_no"), "gcc_order_001");
  assert.deepEqual(result, {
    provider: "niuniu-pay",
    code: 0,
    success: true,
    providerRefundRef: "provider_trade_001",
    message: "refund accepted",
    safety: {
      noRawMerchantKey: true,
      noRawProviderPayload: true
    }
  });
  assert.doesNotMatch(JSON.stringify(result), /test_key|settlement|rawPayload/i);
});

test("Niuniu Pay notification signature verification returns safe payment facts", () => {
  const payload = {
    pid: "1001",
    trade_no: "provider_trade_001",
    out_trade_no: "gcc_order_001",
    type: "alipay",
    money: "20.00",
    trade_status: "TRADE_SUCCESS",
    sign_type: "MD5"
  };
  const sign = buildNiuniuPaySignature(payload, "test_key");
  const verified = verifyNiuniuPaySignature({ ...payload, sign }, {
    merchantId: "1001",
    merchantKey: "test_key",
    receivedAt: "2026-07-03T00:00:00.000Z"
  });

  assert.deepEqual(verified, {
    provider: "niuniu-pay",
    providerEventRef: "provider_trade_001",
    orderId: "gcc_order_001",
    eventType: "payment_succeeded",
    amount: "20.00",
    channel: "alipay",
    signatureStatus: "verified",
    receivedAt: "2026-07-03T00:00:00.000Z",
    safety: {
      noRawMerchantKey: true,
      noRawProviderPayload: true
    }
  });

  assert.throws(() => verifyNiuniuPaySignature({ ...payload, sign: "bad" }, {
    merchantId: "1001",
    merchantKey: "test_key"
  }), /signature is invalid/);
});
