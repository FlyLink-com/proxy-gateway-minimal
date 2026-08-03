import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import Database from "better-sqlite3";

import { createApp } from "../app.mjs";
import {
  applyCoinWalletMigrations,
  COIN_WALLET_MIGRATIONS,
  REQUIRED_COIN_WALLET_MIGRATION_ID,
} from "../services/platform/coin-wallet-migrations.mjs";
import { createSqliteCoinWalletStore } from
  "../services/platform/coin-wallet-store.mjs";
import { createChaoJiPayPaymentRuntime } from
  "../services/platform/chaojipay-payment-runtime.mjs";
import { createPaymentRechargeCoordinator } from
  "../services/platform/payment-recharge-coordinator.mjs";
import { createPaymentRechargeOfferCatalog } from
  "../services/platform/payment-recharge-offer-catalog.mjs";
import { createStaticPaymentProviderAdapterRegistry } from
  "../services/platform/payment-provider-adapter-registry.mjs";
import { applyPaymentStoreMigrations } from
  "../services/platform/payment-store-migrations.mjs";
import { createSqlitePaymentStore } from
  "../services/platform/payment-store.mjs";
import { createProductionCnyPaymentRechargeOffers } from
  "../services/platform/production-cny-payment-recharge-price-book.mjs";
import { createXsdPaymentRuntime } from
  "../services/platform/xsd-payment-runtime.mjs";
import { listen } from "./helpers/listen.mjs";

const NOW = "2026-08-03T00:00:00.000Z";
const ACCOUNT_ID = "account_cny_recharge_1";
const SESSION_REF = "session_cny_recharge_1";
const ACTION_ORIGIN = "https://cashier.example.test";
const XSD_ACTION_ORIGIN = "https://www.xsd8866.com";
const XSD_SECRET = "synthetic-xsd-settlement-secret";
const CHAOJIPAY_SECRET = "synthetic-chaojipay-settlement-secret";

const PROVIDERS = Object.freeze([
  Object.freeze({
    provider: "xsd",
    adapterKey: "xsd_v1",
    profileRef: "xsd_production_primary",
    credentialProfileRef: "xsd_production_primary",
    merchantBindingRef: "xsd_production_primary",
    paymentMethod: "alipay",
    callbackPath: "/api/platform/payments/xsd/callback",
    contentType: "application/x-www-form-urlencoded; charset=utf-8",
    acknowledgementBody: "SUCCESS",
  }),
  Object.freeze({
    provider: "chaojipay",
    adapterKey: "chaojipay_v1",
    profileRef: "chaojipay_production_primary",
    credentialProfileRef: "chaojipay_production_primary",
    merchantBindingRef: "chaojipay_production_primary",
    paymentMethod: "wechat_pay",
    callbackPath: "/api/platform/payments/chaojipay/callback",
    contentType: "application/x-www-form-urlencoded; charset=utf-8",
    acknowledgementBody: "success",
  }),
]);

function refFactory(prefix) {
  const counts = new Map();
  return (kind) => {
    const next = (counts.get(kind) ?? 0) + 1;
    counts.set(kind, next);
    return `${prefix}_${kind}_${next}`;
  };
}

function createDatabase() {
  const database = new Database(":memory:");
  database.pragma("foreign_keys = on");
  database.exec(`
    create table platform_accounts (
      id text primary key,
      owner_ref text not null,
      status text not null check (status in ('active', 'suspended', 'disabled')),
      created_at text not null,
      updated_at text not null,
      metadata_json text not null default '{}'
    );
    insert into platform_accounts (
      id, owner_ref, status, created_at, updated_at, metadata_json
    ) values (
      '${ACCOUNT_ID}', 'owner_cny_recharge_1', 'active',
      '${NOW}', '${NOW}', '{}'
    );
  `);
  applyCoinWalletMigrations({
    database,
    expectedMigrationId: REQUIRED_COIN_WALLET_MIGRATION_ID,
    expectedDdlChecksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum,
    nowFn: () => new Date(NOW),
  });
  applyPaymentStoreMigrations({ database, nowFn: () => NOW });
  return database;
}

function providerJsonResponse(url, body) {
  const standard = new Response(JSON.stringify(body), { status: 200 });
  return Object.freeze({
    status: standard.status,
    headers: standard.headers,
    body: standard.body,
    redirected: false,
    url,
  });
}

function signXsd(fields, secret) {
  const canonical = Object.keys(fields)
    .filter((key) => key !== "sign" && key !== "format" && fields[key] !== "")
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join("&");
  return createHash("md5").update(`${canonical}${secret}`, "utf8").digest("hex");
}

function signChaoJiPay(fields, secret) {
  const canonical = Object.keys(fields)
    .filter((key) => key !== "sign" && fields[key] !== "")
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join("&");
  return createHash("md5")
    .update(`${canonical}&key=${secret}`, "utf8")
    .digest("hex")
    .toUpperCase();
}

function createRuntime(providerCase) {
  if (providerCase.provider === "xsd") {
    const apiOrigin = "https://www.xsd8866.com";
    return createXsdPaymentRuntime({
      credential: {
        merchantId: "merchant_xsd_demo",
        merchantSecret: XSD_SECRET,
        merchantScopeDigest: "a".repeat(64),
      },
      async fetchFn(url) {
        assert.equal(url, `${apiOrigin}/api/gaia/unifiedorder`);
        return providerJsonResponse(url, {
          code: "200",
          error: "请求成功",
          datas: { code_url: `${XSD_ACTION_ORIGIN}/pay/synthetic` },
        });
      },
      apiOrigin,
      allowedActionOrigins: [XSD_ACTION_ORIGIN],
      routeMap: {
        portal_payment_callback_v1:
          `https://portal.example.test${providerCase.callbackPath}`,
        portal_wallet_return_v1: "https://portal.example.test/wallet",
      },
      profileRef: providerCase.profileRef,
      credentialProfileRef: providerCase.credentialProfileRef,
      nowFn: () => NOW,
    });
  }

  const apiOrigin = "https://payment.chaojipay.me";
  return createChaoJiPayPaymentRuntime({
    credential: {
      merchantId: "merchant_chaojipay_demo",
      merchantSecret: CHAOJIPAY_SECRET,
      merchantScopeDigest: "b".repeat(64),
    },
    async fetchFn(url) {
      assert.equal(url, `${apiOrigin}/api/order/create`);
      return providerJsonResponse(url, {
        data: { payUrl: `${ACTION_ORIGIN}/pay/synthetic` },
      });
    },
    apiOrigin,
    allowedActionOrigins: [ACTION_ORIGIN],
    routeMap: {
      portal_payment_callback_v1:
        `https://portal.example.test${providerCase.callbackPath}`,
    },
    profileRef: providerCase.profileRef,
    credentialProfileRef: providerCase.credentialProfileRef,
    createRequestIp: "8.8.8.8",
    nowFn: () => NOW,
  });
}

function declaredCapabilities(providerCase) {
  return {
    createRechargeOrder: true,
    queryPayment: providerCase.provider === "xsd",
    capturePayment: false,
    verifyCallback: true,
    refund: false,
    reconcile: false,
    repeatCreateIdempotent: false,
    repeatCaptureIdempotent: false,
  };
}

function appState(provider, coordinator) {
  return {
    rootDir: new URL("../../", import.meta.url).pathname,
    consoleToken: "console-synthetic",
    proxyConfig: { servers: [], pingHosts: [], nginx: {} },
    services: {
      ssLocal: { status: () => ({ running: false }) },
      httpProxy: { status: () => ({ running: false }) },
    },
    subscriptions: {},
    security: {
      adminAllowedCidrs: ["127.0.0.1/32"],
      subRateLimit: { windowMs: 60_000, max: 30 },
    },
    platform: {
      coinRechargeEnabled: true,
      paymentRechargeProvider: provider,
      paymentRechargeCoordinator: coordinator,
      userPortalRoutesEnabled: true,
      userPortalAuth: {
        requireSession({ sessionRef }) {
          assert.equal(sessionRef, SESSION_REF);
          return { sessionRef, accountId: ACCOUNT_ID };
        },
      },
    },
  };
}

function createSystem(providerCase, {
  failWalletOnce = false,
  failCloseOnce = false,
} = {}) {
  const database = createDatabase();
  const walletStore = createSqliteCoinWalletStore({
    database,
    nowFn: () => new Date(NOW),
    refFactory: refFactory(`${providerCase.provider}_wallet`),
  });
  const rawPaymentStore = createSqlitePaymentStore({
    database,
    nowFn: () => NOW,
    refFactory: refFactory(`${providerCase.provider}_payment`),
  });

  let shouldFailWallet = failWalletOnce;
  const coordinatorWallet = Object.freeze({
    ...walletStore,
    creditCoins(input) {
      if (shouldFailWallet) {
        shouldFailWallet = false;
        throw new Error("injected_wallet_failure");
      }
      return walletStore.creditCoins(input);
    },
  });

  let shouldFailClose = failCloseOnce;
  const coordinatorStore = Object.freeze({
    ...rawPaymentStore,
    markOrderCredited(input) {
      if (shouldFailClose) {
        shouldFailClose = false;
        throw new Error("injected_order_close_failure");
      }
      return rawPaymentStore.markOrderCredited(input);
    },
  });

  const offerCatalog = createPaymentRechargeOfferCatalog({
    environment: "production",
    offers: createProductionCnyPaymentRechargeOffers().map((offer) => ({
      ...offer,
      paymentMethods: [providerCase.paymentMethod],
    })),
  });
  const runtime = createRuntime(providerCase);
  const registry = createStaticPaymentProviderAdapterRegistry({
    credentialLoader: runtime.credentialLoader,
    transports: { [providerCase.adapterKey]: runtime.transport },
    nowFn: () => NOW,
  });
  const resolvedAdapter = registry.resolve({
    adapterKey: providerCase.adapterKey,
    profileRef: providerCase.profileRef,
    contractVersion: "v1",
    credentialProfileRef: providerCase.credentialProfileRef,
    declaredCapabilities: declaredCapabilities(providerCase),
  });
  assert.equal(resolvedAdapter.adapterKey, providerCase.adapterKey);
  assert.deepEqual(
    resolvedAdapter.supportedPaymentMethods,
    providerCase.provider === "xsd" ? ["alipay", "wechat_pay"] : ["wechat_pay"],
  );
  const adapter = Object.freeze({
    ...resolvedAdapter,
    paymentMethod: providerCase.paymentMethod,
    merchantBindingRef: providerCase.merchantBindingRef,
  });
  const coordinator = createPaymentRechargeCoordinator({
    store: coordinatorStore,
    walletStore: coordinatorWallet,
    offerCatalog,
    adapter,
    nowFn: () => new Date(NOW),
    refFactory: refFactory(`${providerCase.provider}_coordinator`),
  });

  return Object.freeze({
    app: createApp(appState(providerCase.provider, coordinator), {
      paymentNowFn: () => new Date(NOW),
    }),
    database,
    paymentStore: rawPaymentStore,
    walletStore,
  });
}

function callbackFields(providerCase, orderRef, overrides = {}) {
  if (providerCase.provider === "xsd") {
    return {
      mch_order_no: orderRef,
      partnerorderid: "xsd_capture_synthetic_1",
      status: "1",
      mchId: "merchant_xsd_demo",
      amount: "30.00",
      ...overrides,
    };
  }
  return {
    orderId: "chao_capture_synthetic_1",
    orderStatus: "1",
    outTradeId: orderRef,
    amount: "30.00",
    ...overrides,
  };
}

function signedCallbackBody(providerCase, orderRef, overrides = {}) {
  const fields = callbackFields(providerCase, orderRef, overrides);
  const sign = providerCase.provider === "xsd"
    ? signXsd(fields, XSD_SECRET)
    : signChaoJiPay(fields, CHAOJIPAY_SECRET);
  return new URLSearchParams({ ...fields, sign }).toString();
}

async function createOrder(baseUrl) {
  const response = await fetch(`${baseUrl}/api/portal/coins/recharge/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Portal-Session": SESSION_REF,
    },
    body: JSON.stringify({
      offerRef: "coins_30",
      idempotencyKey: "create_cny_1",
    }),
  });
  assert.equal(response.status, 201);
  const payload = await response.json();
  const orderRef = payload?.recharge?.order?.orderRef;
  assert.match(orderRef, /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u);
  return orderRef;
}

function postCallback(baseUrl, providerCase, body) {
  return fetch(`${baseUrl}${providerCase.callbackPath}`, {
    method: "POST",
    headers: { "Content-Type": providerCase.contentType },
    body,
  });
}

async function closeServer(server) {
  await new Promise((resolve, reject) => server.close((error) => (
    error ? reject(error) : resolve()
  )));
}

async function closeSystem(server, system) {
  await closeServer(server);
  system.walletStore.close();
  system.paymentStore.close();
  system.database.close();
}

function settlementRefs(database) {
  return Object.freeze({
    receipts: database.prepare(`
      select receipt_ref
        from platform_payment_receipts
       where receipt_type = 'callback'
         and verification_result = 'verified'
       order by receipt_ref
    `).all().map(({ receipt_ref: ref }) => ref),
    operations: database.prepare(`
      select operation_ref
        from platform_coin_operation_receipts
       order by operation_ref
    `).all().map(({ operation_ref: ref }) => ref),
    lots: database.prepare(`
      select lot_ref
        from platform_coin_lots
       where coin_type = 'paid_coins'
       order by lot_ref
    `).all().map(({ lot_ref: ref }) => ref),
    origins: database.prepare(`
      select credit_origin_ref
        from platform_coin_credit_origins
       order by credit_origin_ref
    `).all().map(({ credit_origin_ref: ref }) => ref),
  });
}

function assertSettlementCounts(database, expected) {
  const refs = settlementRefs(database);
  assert.equal(refs.receipts.length, expected.receipts);
  assert.equal(refs.operations.length, expected.operations);
  assert.equal(refs.lots.length, expected.lots);
  assert.equal(refs.origins.length, expected.origins);
  return refs;
}

function paymentOrder(database, orderRef) {
  return database.prepare(`
    select status, wallet_operation_ref, wallet_lot_ref
      from platform_payment_orders
     where payment_order_ref = ?
  `).get(orderRef);
}

function assertPaidBalance(system, expected) {
  assert.equal(
    system.walletStore.getWalletProjection({ accountId: ACCOUNT_ID })
      .totals.paid_coins,
    expected,
  );
}

async function assertGeneric503(response) {
  assert.equal(response.status, 503);
  const body = await response.text();
  assert.deepEqual(JSON.parse(body), {
    error: { code: "payment_recharge_unavailable", retryable: true },
  });
  assert.doesNotMatch(body, /signature|merchant|order|internal/iu);
}

for (const providerCase of PROVIDERS) {
  test(`${providerCase.provider} signed callback settles once and byte-identical replay reuses durable refs`, async () => {
    const system = createSystem(providerCase);
    const { server, baseUrl } = await listen(system.app);
    try {
      const orderRef = await createOrder(baseUrl);
      const body = signedCallbackBody(providerCase, orderRef);

      const first = await postCallback(baseUrl, providerCase, body);
      assert.equal(first.status, 200);
      assert.equal(await first.text(), providerCase.acknowledgementBody);
      const firstRefs = assertSettlementCounts(system.database, {
        receipts: 1, operations: 1, lots: 1, origins: 1,
      });
      const firstOrder = paymentOrder(system.database, orderRef);
      assert.equal(firstOrder.status, "credited");
      assert.notEqual(firstOrder.wallet_operation_ref, null);
      assert.notEqual(firstOrder.wallet_lot_ref, null);
      assertPaidBalance(system, 30);

      const replay = await postCallback(baseUrl, providerCase, body);
      assert.equal(replay.status, 200);
      assert.equal(await replay.text(), providerCase.acknowledgementBody);
      assert.deepEqual(settlementRefs(system.database), firstRefs);
      assert.deepEqual(paymentOrder(system.database, orderRef), firstOrder);
      assertPaidBalance(system, 30);
    } finally {
      await closeSystem(server, system);
    }
  });

  test(`${providerCase.provider} signed non-settlement acknowledges with zero Wallet writes`, async () => {
    const system = createSystem(providerCase);
    const { server, baseUrl } = await listen(system.app);
    try {
      const orderRef = await createOrder(baseUrl);
      const overrides = providerCase.provider === "xsd"
        ? { status: "-1" }
        : { orderStatus: "0" };
      const response = await postCallback(
        baseUrl,
        providerCase,
        signedCallbackBody(providerCase, orderRef, overrides),
      );
      assert.equal(response.status, 200);
      assert.equal(await response.text(), providerCase.acknowledgementBody);
      assertSettlementCounts(system.database, {
        receipts: 0, operations: 0, lots: 0, origins: 0,
      });
      assert.equal(paymentOrder(system.database, orderRef).status, "entry_ready");
      assertPaidBalance(system, 0);
    } finally {
      await closeSystem(server, system);
    }
  });

  test(`${providerCase.provider} rejected callbacks return generic 503 and mint zero Coins`, async (t) => {
    const cases = [
      {
        name: "bad signature",
        body(orderRef) {
          const valid = signedCallbackBody(providerCase, orderRef);
          const fields = new URLSearchParams(valid);
          const sign = fields.get("sign");
          fields.set("sign", `${sign[0] === "0" ? "1" : "0"}${sign.slice(1)}`);
          return fields.toString();
        },
      },
      {
        name: "payment order mismatch",
        body(orderRef) {
          const overrides = providerCase.provider === "xsd"
            ? { mch_order_no: `${orderRef}_other` }
            : { outTradeId: `${orderRef}_other` };
          return signedCallbackBody(providerCase, orderRef, overrides);
        },
      },
      {
        name: "amount mismatch",
        body(orderRef) {
          return signedCallbackBody(providerCase, orderRef, { amount: "31.00" });
        },
      },
      ...(providerCase.provider === "xsd" ? [{
        name: "merchant mismatch",
        body(orderRef) {
          return signedCallbackBody(providerCase, orderRef, {
            mchId: "merchant_other",
          });
        },
      }] : []),
    ];

    for (const rejection of cases) {
      await t.test(rejection.name, async () => {
        const system = createSystem(providerCase);
        const { server, baseUrl } = await listen(system.app);
        try {
          const orderRef = await createOrder(baseUrl);
          const response = await postCallback(
            baseUrl,
            providerCase,
            rejection.body(orderRef),
          );
          await assertGeneric503(response);
          assertSettlementCounts(system.database, {
            receipts: 0, operations: 0, lots: 0, origins: 0,
          });
          assertPaidBalance(system, 0);
        } finally {
          await closeSystem(server, system);
        }
      });
    }
  });

  test(`${providerCase.provider} Wallet fail-once retries one verified settlement`, async () => {
    const system = createSystem(providerCase, { failWalletOnce: true });
    const { server, baseUrl } = await listen(system.app);
    try {
      const orderRef = await createOrder(baseUrl);
      const body = signedCallbackBody(providerCase, orderRef);

      await assertGeneric503(await postCallback(baseUrl, providerCase, body));
      const failedRefs = assertSettlementCounts(system.database, {
        receipts: 1, operations: 0, lots: 0, origins: 0,
      });
      assert.equal(paymentOrder(system.database, orderRef).status, "payment_verified");
      assertPaidBalance(system, 0);

      const retry = await postCallback(baseUrl, providerCase, body);
      assert.equal(retry.status, 200);
      assert.equal(await retry.text(), providerCase.acknowledgementBody);
      const recoveredRefs = assertSettlementCounts(system.database, {
        receipts: 1, operations: 1, lots: 1, origins: 1,
      });
      assert.deepEqual(recoveredRefs.receipts, failedRefs.receipts);
      assert.equal(paymentOrder(system.database, orderRef).status, "credited");
      assertPaidBalance(system, 30);
    } finally {
      await closeSystem(server, system);
    }
  });

  test(`${providerCase.provider} post-credit close fail-once retries without minting`, async () => {
    const system = createSystem(providerCase, { failCloseOnce: true });
    const { server, baseUrl } = await listen(system.app);
    try {
      const orderRef = await createOrder(baseUrl);
      const body = signedCallbackBody(providerCase, orderRef);

      await assertGeneric503(await postCallback(baseUrl, providerCase, body));
      const firstRefs = assertSettlementCounts(system.database, {
        receipts: 1, operations: 1, lots: 1, origins: 1,
      });
      assert.notEqual(paymentOrder(system.database, orderRef).status, "credited");
      assertPaidBalance(system, 30);

      const retry = await postCallback(baseUrl, providerCase, body);
      assert.equal(retry.status, 200);
      assert.equal(await retry.text(), providerCase.acknowledgementBody);
      assert.deepEqual(settlementRefs(system.database), firstRefs);
      const recovered = paymentOrder(system.database, orderRef);
      assert.equal(recovered.status, "credited");
      assert.equal(recovered.wallet_operation_ref, firstRefs.operations[0]);
      assert.equal(recovered.wallet_lot_ref, firstRefs.lots[0]);
      assertPaidBalance(system, 30);
    } finally {
      await closeSystem(server, system);
    }
  });
}
