import { createHash, randomBytes } from "node:crypto";
import {
  closeSync,
  existsSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmdirSync,
  rmSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { createServer, request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL, fileURLToPath } from "node:url";
import { types as utilTypes } from "node:util";
import Database from "better-sqlite3";

import { createApp } from "../server/app.mjs";
import { createRuntimeState } from "../server/state.mjs";
import { createLocalCnyRechargeCatalogReadonlyProfile } from "./lib/local-cny-recharge-catalog-readonly.mjs";
import {
  applyCoinCommerceMigrations,
  COIN_COMMERCE_MIGRATIONS,
  REQUIRED_COIN_COMMERCE_MIGRATION_ID
} from "../server/services/platform/coin-commerce-migrations.mjs";
import {
  applyCoinWalletMigrations,
  COIN_WALLET_MIGRATIONS,
  REQUIRED_COIN_WALLET_MIGRATION_ID
} from "../server/services/platform/coin-wallet-migrations.mjs";
import {
  createSqliteSubscriptionControlStore
} from "../server/services/platform/subscription-control-db.mjs";
import {
  applyPaymentStoreMigrations
} from "../server/services/platform/payment-store-migrations.mjs";
import {
  createSqliteSubscriptionStore
} from "../server/services/subscriptions/repository.mjs";

const OWNED_PREFIX = "coin-commerce-local-validation-";
const MARKER_NAME = "ownership-marker";
const FAILURE_STAGES = new Set([
  "after_base_schema",
  "after_wallet_migration",
  "after_commerce_migration",
  "after_seed",
  "after_listen",
  "after_coordinator_start"
]);
const ROOT_DIR = resolve(fileURLToPath(new URL("../", import.meta.url)));
const SYNTHETIC_NOW = "2026-07-27T00:00:00.000Z";
const FUNDED_ACCOUNT_ID = "acct_local_commerce_funded";
const EMPTY_ACCOUNT_ID = "acct_local_commerce_empty";
const OFFER_REF = "offer_local_monthly_plan";
const UI_ACCOUNT_ID = "acct_local_ui_validation";
const UI_LOGIN_REF = "local-ui-validation@example.test";
const UI_PASSWORD =
  "local-only-synthetic-portal-ui-validation-password-v1";
const UI_PORT = 3457;
const TASK7_PROFILE = "task7";
const UI_PROFILE = "ui";
const CNY_CATALOG_READONLY_PROFILE = "cny-catalog-readonly";
const CNY_CATALOG_READONLY_UI_PROFILE = "cny-catalog-readonly-ui";
const UI_SEED_SOURCE_REF = "source_local_ui_validation_paid_coins_v1";
const UI_SEED_SOURCE_DIGEST = createHash("sha256")
  .update("local-ui-validation-paid-coins-v1", "utf8")
  .digest("hex");
const UI_SEED_IDEMPOTENCY_KEY =
  "credit_local_ui_validation_paid_coins_v1";
const UI_SEED_EVIDENCE = Object.freeze({
  coinType: "paid_coins",
  amountUnits: 1_000,
  availability: "available",
  sourceRef: UI_SEED_SOURCE_REF,
  sourceDigest: UI_SEED_SOURCE_DIGEST,
  idempotencyKey: UI_SEED_IDEMPOTENCY_KEY
});
const UI_RECHARGE_NOW = "2026-08-01T00:00:00.000Z";
const UI_RECHARGE_MERCHANT_DIGEST = createHash("sha256")
  .update("local-ui-validation-paypal-sandbox-merchant-v1", "utf8")
  .digest("hex");
const HANDLE_INTERNALS = new WeakMap();
const DISABLED_SUBSCRIPTION_CORE = Object.freeze({});

function localPayPalResponse(status, body) {
  return Object.freeze({
    status,
    async text() {
      return JSON.stringify(body);
    }
  });
}

function createLocalPayPalSandboxFetch() {
  const orders = new Map();
  return async (url, init = {}) => {
    if (url === "https://api-m.sandbox.paypal.com/v1/oauth2/token") {
      return localPayPalResponse(200, {
        access_token: "local-synthetic-access-token",
        token_type: "Bearer",
        expires_in: 3600
      });
    }
    if (url === "https://api-m.sandbox.paypal.com/v2/checkout/orders") {
      const body = JSON.parse(init.body);
      const purchaseUnit = body.purchase_units[0];
      const providerOrderRef = `paypal_order_${createHash("sha256")
        .update(purchaseUnit.custom_id, "utf8")
        .digest("hex")
        .slice(0, 24)}`;
      orders.set(providerOrderRef, {
        paymentOrderRef: purchaseUnit.custom_id,
        currency: purchaseUnit.amount.currency_code,
        value: purchaseUnit.amount.value
      });
      return localPayPalResponse(201, {
        id: providerOrderRef,
        status: "CREATED",
        links: [{
          rel: "approve",
          href: `https://www.sandbox.paypal.com/checkoutnow?token=${providerOrderRef}`
        }]
      });
    }
    const captureMatch = url.match(
      /^https:\/\/api-m\.sandbox\.paypal\.com\/v2\/checkout\/orders\/([^/]+)\/capture$/u
    );
    if (captureMatch) {
      const providerOrderRef = decodeURIComponent(captureMatch[1]);
      const order = orders.get(providerOrderRef);
      if (!order) return localPayPalResponse(404, { name: "RESOURCE_NOT_FOUND" });
      return localPayPalResponse(201, {
        id: providerOrderRef,
        status: "COMPLETED",
        purchase_units: [{
          custom_id: order.paymentOrderRef,
          payments: {
            captures: [{
              id: `paypal_capture_${providerOrderRef.slice(-24)}`,
              status: "COMPLETED",
              amount: {
                currency_code: order.currency,
                value: order.value
              }
            }]
          }
        }]
      });
    }
    return localPayPalResponse(404, { name: "RESOURCE_NOT_FOUND" });
  };
}

const UI_OFFERS = Object.freeze([
  Object.freeze({
    offerRef: "offer_local_ui_monthly_50gb",
    offerVersionRef: "offerv_local_ui_monthly_50gb_v1",
    version: 1,
    category: "plan",
    title: Object.freeze({
      zh: "50 GB 月度套餐",
      en: "50 GB monthly plan"
    }),
    summary: Object.freeze({
      zh: "有效期 30 天，每月 50 GB 流量。",
      en: "50 GB per month, valid for 30 days."
    }),
    importantNotices: Object.freeze({
      zh: Object.freeze(["套餐有效期为 30 天。"]),
      en: Object.freeze(["The plan is valid for 30 days."])
    }),
    baseCoinUnits: 20,
    referencePrice: Object.freeze({ currency: "CNY", amountMinor: 2_000 }),
    acceptedCoinTypes: Object.freeze([
      "bonus_coins",
      "paid_coins",
      "reward_coins"
    ]),
    delivery: Object.freeze({
      kind: "subscription_plan",
      durationDays: 30,
      monthlyTrafficGb: 50,
      trafficGb: null,
      neverExpires: false,
      discountBasisPoints: 0
    })
  }),
  Object.freeze({
    offerRef: "offer_local_ui_monthly_100gb",
    offerVersionRef: "offerv_local_ui_monthly_100gb_v1",
    version: 1,
    category: "plan",
    title: Object.freeze({
      zh: "100 GB 月度套餐",
      en: "100 GB monthly plan"
    }),
    summary: Object.freeze({
      zh: "有效期 30 天，每月 100 GB 流量。",
      en: "100 GB per month, valid for 30 days."
    }),
    importantNotices: Object.freeze({
      zh: Object.freeze(["套餐有效期为 30 天。"]),
      en: Object.freeze(["The plan is valid for 30 days."])
    }),
    baseCoinUnits: 30,
    referencePrice: Object.freeze({ currency: "CNY", amountMinor: 3_000 }),
    acceptedCoinTypes: Object.freeze([
      "bonus_coins",
      "paid_coins",
      "reward_coins"
    ]),
    delivery: Object.freeze({
      kind: "subscription_plan",
      durationDays: 30,
      monthlyTrafficGb: 100,
      trafficGb: null,
      neverExpires: false,
      discountBasisPoints: 0
    })
  }),
  Object.freeze({
    offerRef: "offer_local_ui_annual_200gb",
    offerVersionRef: "offerv_local_ui_annual_200gb_v1",
    version: 1,
    category: "plan",
    title: Object.freeze({
      zh: "200 GB 年度套餐",
      en: "200 GB annual plan"
    }),
    summary: Object.freeze({
      zh: "有效期 365 天，每月 200 GB 流量。",
      en: "200 GB per month, valid for 365 days."
    }),
    importantNotices: Object.freeze({
      zh: Object.freeze(["套餐有效期为 365 天。"]),
      en: Object.freeze(["The plan is valid for 365 days."])
    }),
    baseCoinUnits: 200,
    referencePrice: Object.freeze({ currency: "CNY", amountMinor: 20_000 }),
    acceptedCoinTypes: Object.freeze([
      "bonus_coins",
      "paid_coins",
      "reward_coins"
    ]),
    delivery: Object.freeze({
      kind: "subscription_plan",
      durationDays: 365,
      monthlyTrafficGb: 200,
      trafficGb: null,
      neverExpires: false,
      discountBasisPoints: 0
    })
  }),
  Object.freeze({
    offerRef: "offer_local_ui_data_100gb",
    offerVersionRef: "offerv_local_ui_data_100gb_v1",
    version: 1,
    category: "data_pack",
    title: Object.freeze({
      zh: "100 GB 流量包",
      en: "100 GB data pack"
    }),
    summary: Object.freeze({
      zh: "100 GB 流量，不限使用期限。",
      en: "100 GB of data with no expiry date."
    }),
    importantNotices: Object.freeze({
      zh: Object.freeze(["流量包没有到期日。"]),
      en: Object.freeze(["The data pack has no expiry date."])
    }),
    baseCoinUnits: 30,
    referencePrice: Object.freeze({ currency: "CNY", amountMinor: 3_000 }),
    acceptedCoinTypes: Object.freeze([
      "bonus_coins",
      "paid_coins",
      "reward_coins"
    ]),
    delivery: Object.freeze({
      kind: "data_pack",
      durationDays: null,
      monthlyTrafficGb: null,
      trafficGb: 100,
      neverExpires: true,
      discountBasisPoints: null
    })
  }),
  Object.freeze({
    offerRef: "offer_local_ui_data_200gb",
    offerVersionRef: "offerv_local_ui_data_200gb_v1",
    version: 1,
    category: "data_pack",
    title: Object.freeze({
      zh: "200 GB 流量包",
      en: "200 GB data pack"
    }),
    summary: Object.freeze({
      zh: "200 GB 流量，不限使用期限。",
      en: "200 GB of data with no expiry date."
    }),
    importantNotices: Object.freeze({
      zh: Object.freeze(["流量包没有到期日。"]),
      en: Object.freeze(["The data pack has no expiry date."])
    }),
    baseCoinUnits: 50,
    referencePrice: Object.freeze({ currency: "CNY", amountMinor: 5_000 }),
    acceptedCoinTypes: Object.freeze([
      "bonus_coins",
      "paid_coins",
      "reward_coins"
    ]),
    delivery: Object.freeze({
      kind: "data_pack",
      durationDays: null,
      monthlyTrafficGb: null,
      trafficGb: 200,
      neverExpires: true,
      discountBasisPoints: null
    })
  })
]);

function validationFailure() {
  const error = new Error("Local coin commerce validation failed");
  error.code = "coin_commerce_local_validation_failed";
  return error;
}

function exactOptions(options) {
  if (
    options === undefined
    || (
      options
      && typeof options === "object"
      && !Array.isArray(options)
      && !utilTypes.isProxy(options)
      && Object.getPrototypeOf(options) === Object.prototype
      && Reflect.ownKeys(options).length === 0
    )
  ) {
    return { failureStage: null };
  }
  if (
    !options
    || typeof options !== "object"
    || Array.isArray(options)
    || utilTypes.isProxy(options)
    || Object.getPrototypeOf(options) !== Object.prototype
  ) {
    throw validationFailure();
  }
  const keys = Reflect.ownKeys(options);
  const descriptor = Object.getOwnPropertyDescriptor(options, "failureStage");
  if (
    keys.length !== 1
    || keys[0] !== "failureStage"
    || !descriptor
    || !descriptor.enumerable
    || !("value" in descriptor)
    || !FAILURE_STAGES.has(descriptor.value)
  ) {
    throw validationFailure();
  }
  return { failureStage: descriptor.value };
}

function exactPlainObject(value, fields) {
  if (
    !value
    || typeof value !== "object"
    || Array.isArray(value)
    || utilTypes.isProxy(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw validationFailure();
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (
    keys.length !== fields.length
    || keys.some((key) => typeof key !== "string" || !fields.includes(key))
    || fields.some((field) => {
      const descriptor = descriptors[field];
      return !descriptor?.enumerable || !("value" in descriptor);
    })
  ) {
    throw validationFailure();
  }
  return Object.fromEntries(fields.map((field) => [
    field,
    descriptors[field].value
  ]));
}

function exactPayPalSandboxUiOptions(options) {
  const input = exactPlainObject(options, [
    "credential",
    "callbackUrl",
    "returnUrl",
    "fetchFn",
    "nowFn"
  ]);
  const credential = exactPlainObject(input.credential, [
    "clientId",
    "clientSecret",
    "webhookId",
    "merchantScopeDigest"
  ]);
  let callbackUrl;
  let returnUrl;
  try {
    callbackUrl = new URL(input.callbackUrl);
    returnUrl = new URL(input.returnUrl);
  } catch {
    throw validationFailure();
  }
  if (
    typeof credential.clientId !== "string"
    || credential.clientId.length < 1
    || credential.clientId.length > 4096
    || /[\0\r\n]/u.test(credential.clientId)
    || typeof credential.clientSecret !== "string"
    || credential.clientSecret.length < 1
    || credential.clientSecret.length > 4096
    || /[\0\r\n]/u.test(credential.clientSecret)
    || typeof credential.webhookId !== "string"
    || !/^[A-Za-z0-9_-]{1,128}$/u.test(credential.webhookId)
    || typeof credential.merchantScopeDigest !== "string"
    || !/^[a-f0-9]{64}$/u.test(credential.merchantScopeDigest)
    || callbackUrl.protocol !== "https:"
    || callbackUrl.username !== ""
    || callbackUrl.password !== ""
    || callbackUrl.pathname !== "/api/platform/payments/paypal/callback"
    || callbackUrl.search !== ""
    || callbackUrl.hash !== ""
    || returnUrl.protocol !== "https:"
    || returnUrl.username !== ""
    || returnUrl.password !== ""
    || returnUrl.hash !== ""
    || typeof input.fetchFn !== "function"
    || typeof input.nowFn !== "function"
  ) {
    throw validationFailure();
  }
  return Object.freeze({
    credential: Object.freeze(credential),
    callbackUrl: callbackUrl.href,
    returnUrl: returnUrl.href,
    fetchFn: input.fetchFn,
    nowFn: input.nowFn
  });
}

function randomText(bytes = 24) {
  return randomBytes(bytes).toString("base64url");
}

function failAt(actual, expected) {
  if (actual === expected) throw validationFailure();
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

function settlesWithin(promise, timeoutMs) {
  let timer;
  return Promise.race([
    Promise.resolve(promise).then(() => true),
    new Promise((resolveSettled) => {
      timer = setTimeout(() => resolveSettled(false), timeoutMs);
    })
  ]).finally(() => clearTimeout(timer));
}

function frozenPortalHeaders(fundedSession, emptySession) {
  return Object.freeze({
    funded: Object.freeze({ "X-Portal-Session": fundedSession }),
    emptyWallet: Object.freeze({ "X-Portal-Session": emptySession })
  });
}

function createPortalAuth(fundedSession, emptySession) {
  const sessions = new Map([
    [fundedSession, FUNDED_ACCOUNT_ID],
    [emptySession, EMPTY_ACCOUNT_ID]
  ]);
  return {
    requireSession({ sessionRef }) {
      const accountId = sessions.get(sessionRef);
      if (!accountId) throw validationFailure();
      return { sessionRef, accountId };
    },
    createPasswordSetupSession() {
      return null;
    }
  };
}

function createFulfillmentHandler(
  effects,
  fulfillmentActivity,
  effectNamespace
) {
  return {
    idempotencyContract: "deduplicate_by_command_ref",
    async execute(command) {
      let effectRef = effects.get(command.commandRef);
      if (!effectRef) {
        effectRef = `effect_${createHash("sha256")
          .update(effectNamespace, "utf8")
          .update("\0", "utf8")
          .update(command.commandRef, "utf8")
          .digest("hex")
          .slice(0, 48)}`;
        effects.set(command.commandRef, effectRef);
      }
      if (!Number.isSafeInteger(fulfillmentActivity.inFlight)) {
        throw validationFailure();
      }
      fulfillmentActivity.inFlight += 1;
      if (!Number.isSafeInteger(fulfillmentActivity.inFlight)) {
        fulfillmentActivity.inFlight -= 1;
        throw validationFailure();
      }
      try {
        await delay(50);
        return {
          status: "delivered",
          effectRef
        };
      } finally {
        fulfillmentActivity.inFlight -= 1;
      }
    }
  };
}

function exactOwnedRootLocation(root) {
  const canonicalTemp = resolve(tmpdir());
  const target = resolve(root);
  if (
    dirname(target) !== canonicalTemp
    || !basename(target).startsWith(OWNED_PREFIX)
    || target === canonicalTemp
  ) {
    throw validationFailure();
  }
  return target;
}

function assertOwnedRoot(root, markerPath, nonce) {
  const target = exactOwnedRootLocation(root);
  if (
    resolve(markerPath) !== resolve(target, MARKER_NAME)
    || !existsSync(markerPath)
    || readFileSync(markerPath, "utf8") !== nonce
  ) {
    throw validationFailure();
  }
  return target;
}

function removeOwnedRoot(root, markerPath, nonce) {
  const target = assertOwnedRoot(root, markerPath, nonce);
  rmSync(target, {
    recursive: true,
    force: true,
    maxRetries: 20,
    retryDelay: 50
  });
  if (existsSync(target)) throw validationFailure();
}

async function recoverIncompleteMarkerRoot(root, markerPath) {
  const target = exactOwnedRootLocation(root);
  if (resolve(markerPath) !== resolve(target, MARKER_NAME)) {
    throw validationFailure();
  }
  for (let attempt = 0; attempt <= 20; attempt += 1) {
    try {
      if (existsSync(markerPath)) unlinkSync(markerPath);
      rmdirSync(target);
      return;
    } catch (error) {
      if (
        attempt >= 20
        || !["EPERM", "EBUSY", "ENOTEMPTY"].includes(error?.code)
      ) {
        throw error;
      }
      await delay(50);
    }
  }
  throw validationFailure();
}

function monotonicClock() {
  return {
    wallStartedAt: Date.now(),
    monotonicStartedAt: performance.now()
  };
}

function monotonicElapsed(clock) {
  const elapsed = performance.now() - clock.monotonicStartedAt;
  if (!Number.isFinite(elapsed) || elapsed < 0) throw validationFailure();
  const expectedWall = clock.wallStartedAt + elapsed;
  if (Math.abs(Date.now() - expectedWall) > 250) throw validationFailure();
  return elapsed;
}

async function waitThroughCancelUntil(cancelUntil) {
  if (
    typeof cancelUntil !== "string"
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(cancelUntil)
  ) {
    throw validationFailure();
  }
  const target = Date.parse(cancelUntil);
  const clock = monotonicClock();
  const initialWait = target - clock.wallStartedAt + 1;
  if (
    !Number.isFinite(target)
    || !Number.isFinite(initialWait)
    || initialWait < 0
    || initialWait > 2_000
  ) {
    throw validationFailure();
  }
  for (;;) {
    const elapsed = monotonicElapsed(clock);
    const remaining = initialWait - elapsed;
    if (remaining <= 0) return;
    if (elapsed > 2_500) throw validationFailure();
    await delay(Math.min(50, Math.max(1, Math.ceil(remaining))));
  }
}

async function pollDeliveredOrder(request, path, headers) {
  const clock = monotonicClock();
  for (;;) {
    if (monotonicElapsed(clock) > 4_000) throw validationFailure();
    const response = await request({ path, headers });
    if (
      response.status === 200
      && response.json?.order?.paymentStatus === "captured"
      && response.json?.order?.fulfillment?.status === "delivered"
    ) {
      return response;
    }
    if (monotonicElapsed(clock) > 4_000) throw validationFailure();
    await delay(25);
  }
}

function isExactInsufficientBalanceError(response) {
  const body = response?.json;
  const error = body?.error;
  return response?.status === 423
    && body
    && Object.getPrototypeOf(body) === Object.prototype
    && Reflect.ownKeys(body).length === 1
    && Reflect.ownKeys(body)[0] === "error"
    && error
    && Object.getPrototypeOf(error) === Object.prototype
    && Reflect.ownKeys(error).length === 2
    && Reflect.ownKeys(error).includes("code")
    && Reflect.ownKeys(error).includes("retryable")
    && error.code === "insufficient_coins"
    && error.retryable === false;
}

function listen(server, port = 0) {
  return new Promise((resolveListen, reject) => {
    const onError = (error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolveListen();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen({ host: "127.0.0.1", port, exclusive: true });
  });
}

async function closeListener(server, sockets) {
  if (!server) return;
  const closed = new Promise((resolveClose, rejectClose) => {
    if (!server.listening) {
      resolveClose();
      return;
    }
    try {
      server.close((error) => {
        if (error) {
          rejectClose(error);
          return;
        }
        resolveClose();
      });
    } catch (error) {
      rejectClose(error);
    }
  });
  if (await settlesWithin(closed, 200)) return;
  for (const socket of sockets) socket.destroy();
  if (!await settlesWithin(closed, 1_000)) {
    throw validationFailure();
  }
}

function requestJson(baseUrl, ownedRequests, {
  method = "GET",
  path,
  headers = {},
  body
}) {
  const target = new URL(baseUrl);
  return new Promise((resolveRequest, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      ownedRequests.delete(req);
      callback(value);
    };
    const req = httpRequest({
      host: target.hostname,
      port: target.port,
      method,
      path,
      headers: {
        Connection: "close",
        ...headers
      },
      agent: false
    }, (res) => {
      const chunks = [];
      res.once("error", (error) => finish(reject, error));
      res.once("aborted", () => finish(reject, validationFailure()));
      res.once("close", () => {
        if (!res.complete) finish(reject, validationFailure());
      });
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try {
          json = text ? JSON.parse(text) : null;
        } catch {
          finish(reject, validationFailure());
          return;
        }
        finish(resolveRequest, { status: res.statusCode, json });
      });
    });
    const timer = setTimeout(() => {
      req.destroy(validationFailure());
    }, 4_000);
    ownedRequests.add(req);
    req.once("error", (error) => finish(reject, error));
    if (body === undefined) {
      req.end();
    } else {
      req.setHeader("Content-Type", "application/json");
      req.end(JSON.stringify(body));
    }
  });
}

async function startLocalCoinCommerceValidationInternal(
  options,
  beforeRootRemovalHook = null,
  profile = TASK7_PROFILE,
  payPalSandboxUiOptions = null
) {
  const { failureStage } = exactOptions(options);
  if (![TASK7_PROFILE, UI_PROFILE, CNY_CATALOG_READONLY_PROFILE, CNY_CATALOG_READONLY_UI_PROFILE].includes(profile)) {
    throw validationFailure();
  }
  const isUiProfile = profile === UI_PROFILE || profile === CNY_CATALOG_READONLY_UI_PROFILE;
  const readonlyRecharge = [CNY_CATALOG_READONLY_PROFILE, CNY_CATALOG_READONLY_UI_PROFILE].includes(profile)
    ? createLocalCnyRechargeCatalogReadonlyProfile() : null;
  const livePayPalSandbox = payPalSandboxUiOptions !== null;
  if (livePayPalSandbox && (!isUiProfile || readonlyRecharge)) throw validationFailure();
  if (
    beforeRootRemovalHook !== null
    && typeof beforeRootRemovalHook !== "function"
  ) {
    throw validationFailure();
  }
  const markerNonce = randomText(32);
  const consoleToken = `console_${randomText(32)}`;
  const fundedSession = `session_${readonlyRecharge ? randomBytes(24).toString("hex") : randomText(24)}`;
  const emptySession = `session_${readonlyRecharge ? randomBytes(24).toString("hex") : randomText(24)}`;
  const effectNamespace = randomBytes(32).toString("hex");
  const portalHeaders = frozenPortalHeaders(fundedSession, emptySession);
  const effects = new Map();
  const fulfillmentActivity = { inFlight: 0 };
  const sockets = new Set();
  const ownedRequests = new Set();
  const beforeRootRemovalHooks = new Set(
    beforeRootRemovalHook ? [beforeRootRemovalHook] : []
  );
  let runtimeState = null;
  let subscriptionStore = null;
  let server = null;
  let cleanupPromise = null;

  const canonicalTemp = resolve(tmpdir());
  const ownedTempRoot = resolve(mkdtempSync(
    join(canonicalTemp, `${OWNED_PREFIX}p${process.pid}-`)
  ));
  const markerPath = join(ownedTempRoot, MARKER_NAME);
  let markerHandle;
  let markerError = null;
  try {
    markerHandle = openSync(markerPath, "wx", 0o600);
    writeFileSync(markerHandle, markerNonce, "utf8");
  } catch (error) {
    markerError = error;
  } finally {
    if (markerHandle !== undefined) {
      try {
        closeSync(markerHandle);
      } catch (error) {
        markerError ||= error;
      }
    }
  }
  if (markerError) {
    for (const hook of beforeRootRemovalHooks) {
      try {
        await hook();
      } catch {
        // Preserve the closed acquisition failure.
      }
    }
    beforeRootRemovalHooks.clear();
    try {
      await recoverIncompleteMarkerRoot(ownedTempRoot, markerPath);
    } catch {
      // The exclusive marker was not established, so recovery stays exact
      // and non-recursive even when the incomplete root cannot be removed.
    }
    throw validationFailure();
  }

  const controlDbPath = join(ownedTempRoot, "control.sqlite");
  const subscriptionDbPath = join(ownedTempRoot, "subscriptions.sqlite");
  const proxyConfigPath = join(ownedTempRoot, "proxy-config.json");

  function cleanup() {
    if (cleanupPromise) return cleanupPromise;
    cleanupPromise = (async () => {
      let firstError;
      const listenerClose = closeListener(server, sockets);
      for (const request of ownedRequests) request.destroy(validationFailure());
      try {
        await listenerClose;
      } catch (error) {
        firstError ||= error;
      }
      try {
        await Promise.resolve(runtimeState?.close());
      } catch (error) {
        firstError ||= error;
      }
      try {
        subscriptionStore?.close();
      } catch (error) {
        firstError ||= error;
      }
      for (const hook of beforeRootRemovalHooks) {
        try {
          await hook();
        } catch (error) {
          firstError ||= error;
        }
      }
      beforeRootRemovalHooks.clear();
      try {
        removeOwnedRoot(ownedTempRoot, markerPath, markerNonce);
      } catch (error) {
        firstError ||= error;
      }
      if (firstError) throw firstError;
    })();
    return cleanupPromise;
  }

  try {
    writeFileSync(proxyConfigPath, "{\"servers\":[],\"pingHosts\":[],\"nginx\":{}}\n", {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600
    });

    const baseStore = createSqliteSubscriptionControlStore({
      dbPath: controlDbPath
    });
    try {
      const accounts = isUiProfile
        ? [[UI_ACCOUNT_ID, "owner_local_ui_validation"]]
        : [
            [FUNDED_ACCOUNT_ID, "owner_local_commerce_funded"],
            [EMPTY_ACCOUNT_ID, "owner_local_commerce_empty"]
          ];
      for (const [id, ownerRef] of accounts) {
        baseStore.createAccount({
          id,
          ownerRef,
          status: "active",
          createdAt: SYNTHETIC_NOW,
          updatedAt: SYNTHETIC_NOW,
          metadata: isUiProfile
            ? {
                source: "local_synthetic_ui_validation",
                loginRef: UI_LOGIN_REF,
                displayRef: UI_LOGIN_REF
              }
            : { source: "local_synthetic_validation" }
        });
      }
    } finally {
      baseStore.close();
    }
    failAt(failureStage, "after_base_schema");

    applyCoinWalletMigrations({
      dbPath: controlDbPath,
      expectedMigrationId: REQUIRED_COIN_WALLET_MIGRATION_ID,
      expectedDdlChecksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum
    });
    failAt(failureStage, "after_wallet_migration");

    applyCoinCommerceMigrations({
      dbPath: controlDbPath,
      expectedMigrationId: REQUIRED_COIN_COMMERCE_MIGRATION_ID,
      expectedDdlChecksum: COIN_COMMERCE_MIGRATIONS[0].ddlChecksum
    });
    failAt(failureStage, "after_commerce_migration");
    if (isUiProfile || readonlyRecharge) {
      const paymentDatabase = new Database(controlDbPath);
      try {
        paymentDatabase.pragma("foreign_keys = on");
        applyPaymentStoreMigrations({
          database: paymentDatabase,
          nowFn: livePayPalSandbox
            ? payPalSandboxUiOptions.nowFn
            : () => UI_RECHARGE_NOW
        });
      } finally {
        paymentDatabase.close();
      }
    }

    const env = {
      CONSOLE_TOKEN: consoleToken,
      USER_PORTAL_ROUTES_ENABLED: "true",
      COINS_WALLET_ENABLED: "true",
      COINS_COMMERCE_ENABLED: "true",
      COINS_COMMERCE_CANCEL_WINDOW_MS: isUiProfile ? "3000" : "1000",
      ...(readonlyRecharge
        ? { ...readonlyRecharge.env, ...(isUiProfile ? { USER_PORTAL_ALLOW_PASSWORD_ONLY_SETUP_SESSION: "true" } : {}) }
        : isUiProfile
        ? {
            USER_PORTAL_ALLOW_PASSWORD_ONLY_SETUP_SESSION: "true",
            PLATFORM_COIN_RECHARGE_ENABLED: "true",
            PLATFORM_PAYPAL_SANDBOX_ENABLED: "true",
            PLATFORM_COIN_RECHARGE_USD_OFFERS_JSON: JSON.stringify([{
              offerRef: "coins_30",
              quoteVersion: 1,
              paidCoinUnits: 30,
              amountMinor: 100,
              currency: "USD",
              currencyExponent: 2,
              enabled: true
            }]),
            PLATFORM_PAYPAL_SANDBOX_CLIENT_ID: livePayPalSandbox
              ? payPalSandboxUiOptions.credential.clientId
              : "local-synthetic-client-id",
            PLATFORM_PAYPAL_SANDBOX_CLIENT_SECRET: livePayPalSandbox
              ? payPalSandboxUiOptions.credential.clientSecret
              : "local-synthetic-client-secret",
            PLATFORM_PAYPAL_SANDBOX_WEBHOOK_ID: livePayPalSandbox
              ? payPalSandboxUiOptions.credential.webhookId
              : "local-synthetic-webhook-id",
            PLATFORM_PAYPAL_SANDBOX_MERCHANT_SCOPE_DIGEST:
              livePayPalSandbox
                ? payPalSandboxUiOptions.credential.merchantScopeDigest
                : UI_RECHARGE_MERCHANT_DIGEST,
            PLATFORM_PAYPAL_CALLBACK_URL:
              livePayPalSandbox
                ? payPalSandboxUiOptions.callbackUrl
                : "https://portal.example.test/api/platform/payments/paypal/callback",
            PLATFORM_PAYPAL_RETURN_URL: livePayPalSandbox
              ? payPalSandboxUiOptions.returnUrl
              : "https://portal.example.test/wallet"
          }
        : {}),
      LOCAL_PROXY_CONTROL_ROUTES_ENABLED: "false"
    };
    subscriptionStore = createSqliteSubscriptionStore({
      dbPath: subscriptionDbPath
    });
    const runtimeOptions = {
      rootDir: ROOT_DIR,
      env,
      controlDbPath,
      subscriptionDbPath,
      proxyConfigPath,
      autoStartHttpProxy: false,
      subscriptionStore,
      subscriptionCore: DISABLED_SUBSCRIPTION_CORE,
      coinCommerceFulfillmentHandler: createFulfillmentHandler(
        effects,
        fulfillmentActivity,
        effectNamespace
      ),
      ...(readonlyRecharge
        ? { ...readonlyRecharge.runtimeOptions, paymentNowFn: () => UI_RECHARGE_NOW }
        : isUiProfile
        ? {
            paypalFetchFn: livePayPalSandbox
              ? payPalSandboxUiOptions.fetchFn
              : createLocalPayPalSandboxFetch(),
            paymentNowFn: livePayPalSandbox
              ? payPalSandboxUiOptions.nowFn
              : () => UI_RECHARGE_NOW
          }
        : {}),
      ...(isUiProfile
        ? {}
        : {
            platformUserPortalAuth: createPortalAuth(
              fundedSession,
              emptySession
            )
          })
    };
    runtimeState = createRuntimeState(runtimeOptions);

    const seedCreditCount = readonlyRecharge ? 5 : 1;
    for (let index = 0; index < seedCreditCount; index += 1) {
      const suffix = readonlyRecharge ? `_part_${index + 1}` : "";
      runtimeState.platform.coinsWalletStore.creditCoins({
        accountId: isUiProfile ? UI_ACCOUNT_ID : FUNDED_ACCOUNT_ID,
        coinType: "paid_coins",
        amountUnits: (isUiProfile ? 1_000 : 60) / seedCreditCount,
        availability: "available",
        sourceType: "synthetic_seed",
        sourceRef: (isUiProfile
          ? UI_SEED_SOURCE_REF
          : "source_local_commerce_funds") + suffix,
        sourceDigest: isUiProfile
          ? UI_SEED_SOURCE_DIGEST
          : "a".repeat(64),
        policyRef: null,
        policyVersion: null,
        expiresAt: null,
        operation: {
          actorScope: isUiProfile
            ? "system:local-ui-validation"
            : "system:local-commerce-validation",
          idempotencyKey: (isUiProfile
            ? UI_SEED_IDEMPOTENCY_KEY
            : "credit_local_commerce_funds") + suffix,
          actorType: "system",
          actorRef: isUiProfile
            ? "local_ui_validation_v1"
            : "local_validation"
        }
      });
    }
    if (isUiProfile) {
      runtimeState.platform.portalPasswordCredentialService
        .issueInitialPasswordCredential({
          accountId: UI_ACCOUNT_ID,
          credentialRef: "portal_pwd_local_ui_validation_v1",
          plainPassword: UI_PASSWORD,
          issuedByRef: "system_local_ui_validation",
          approvalRef: "local_ui_validation_v1",
          mustRotate: true
        });
      for (const offer of UI_OFFERS) {
        runtimeState.platform.coinCommerceStore.publishOfferVersion(offer);
      }
    } else {
      runtimeState.platform.coinCommerceStore.publishOfferVersion({
        offerRef: OFFER_REF,
        offerVersionRef: "offerv_local_monthly_plan_v1",
        version: 1,
        category: "plan",
        title: { zh: "本地合成月卡", en: "Local synthetic monthly plan" },
        summary: { zh: "本地合成验证", en: "Local synthetic validation" },
        importantNotices: {
          zh: ["仅用于本地合成验证"],
          en: ["Local synthetic validation only"]
        },
        baseCoinUnits: 20,
        referencePrice: { currency: "CNY", amountMinor: 2_000 },
        acceptedCoinTypes: ["bonus_coins", "paid_coins", "reward_coins"],
        delivery: {
          kind: "subscription_plan",
          durationDays: 30,
          monthlyTrafficGb: 50,
          trafficGb: null,
          neverExpires: false,
          discountBasisPoints: 0
        }
      });
    }
    failAt(failureStage, "after_seed");

    const app = createApp(runtimeState, isUiProfile ? {
      portalBrowserOrigin: "http://127.0.0.1:5175",
      allowInsecureLoopbackPortalCookie: true,
    } : {});
    server = createServer(readonlyRecharge ? readonlyRecharge.wrapRequestHandler(app) : app);
    server.on("connection", (socket) => {
      sockets.add(socket);
      socket.once("close", () => sockets.delete(socket));
    });
    await listen(server, isUiProfile ? UI_PORT : 0);
    const address = server.address();
    if (
      !address
      || typeof address === "string"
      || address.address !== "127.0.0.1"
      || !["IPv4", 4].includes(address.family)
      || !Number.isInteger(address.port)
      || address.port < 1
    ) {
      throw validationFailure();
    }
    const baseUrl = `http://127.0.0.1:${address.port}`;
    if (isUiProfile && address.port !== UI_PORT) {
      throw validationFailure();
    }
    failAt(failureStage, "after_listen");

    await runtimeState.platform.coinCommerceCoordinator.start();
    failAt(failureStage, "after_coordinator_start");

    const handle = {
      baseUrl,
      ...(isUiProfile ? {} : { portalHeaders }),
      ownedTempRoot,
      runCoordinatorOnce: () => runtimeState.platform.coinCommerceCoordinator.runOnce(),
      inspect: () => {
        const funds = runtimeState.platform.coinsWalletStore
          .getWalletProjection({
            accountId: isUiProfile ? UI_ACCOUNT_ID : FUNDED_ACCOUNT_ID
          });
        return Object.freeze({
          effectCount: effects.size,
          fulfillmentInFlight: fulfillmentActivity.inFlight,
          funds: Object.freeze({
            status: funds.status,
            spendableUnits: funds.spendableUnits,
            heldUnits: funds.heldUnits,
            pendingUnits: funds.pendingUnits
          }),
          ...(isUiProfile ? { seed: readonlyRecharge
            ? Object.freeze({ coinType: "paid_coins", amountUnits: 1_000, availability: "available", creditCount: seedCreditCount })
            : UI_SEED_EVIDENCE } : {}),
          ...(readonlyRecharge ? { rechargeBoundary: readonlyRecharge.inspect() } : {})
        });
      },
      stop: cleanup
    };
    const frozenHandle = Object.freeze(handle);
    HANDLE_INTERNALS.set(frozenHandle, Object.freeze({
      request: (requestOptions) => requestJson(
        baseUrl,
        ownedRequests,
        requestOptions
      )
    }));
    return frozenHandle;
  } catch {
    await cleanup().catch(() => {});
    throw validationFailure();
  }
}

export async function startLocalCoinCommerceValidation(options) {
  return startLocalCoinCommerceValidationInternal(options);
}

export async function startLocalCoinCommerceUiValidation() {
  if (arguments.length !== 0) throw validationFailure();
  return startLocalCoinCommerceValidationInternal(
    undefined,
    null,
    UI_PROFILE
  );
}

// Separate closed entries preserve the existing PayPal UI profile. The first
// uses the harness's random loopback test listener; the UI entry stays on 3457.
export async function startLocalCoinCommerceCnyCatalogReadonlyValidation() {
  if (arguments.length !== 0) throw validationFailure();
  return startLocalCoinCommerceValidationInternal(undefined, null, CNY_CATALOG_READONLY_PROFILE);
}

export async function startLocalCoinCommerceCnyCatalogReadonlyUiValidation() {
  if (arguments.length !== 0) throw validationFailure();
  return startLocalCoinCommerceValidationInternal(undefined, null, CNY_CATALOG_READONLY_UI_PROFILE);
}

export async function startLocalPayPalSandboxUiValidation(options) {
  if (arguments.length !== 1) throw validationFailure();
  return startLocalCoinCommerceValidationInternal(
    undefined,
    null,
    UI_PROFILE,
    exactPayPalSandboxUiOptions(options)
  );
}

async function runClosedProof(lifecycle = null) {
  const handle = await startLocalCoinCommerceValidationInternal(
    undefined,
    lifecycle?.beforeRootRemoval || null
  );
  let stopped = false;
  try {
    const internals = HANDLE_INTERNALS.get(handle);
    if (lifecycle) {
      lifecycle.handle = handle;
      if (lifecycle.signalReceived) {
        lifecycle.cleanupPromise ||= handle.stop();
        await lifecycle.cleanupPromise;
        stopped = true;
        throw validationFailure();
      }
    }
    const request = internals?.request;
    if (typeof request !== "function") throw validationFailure();

    const catalog = await request({
      path: "/api/portal/catalog/offers",
      headers: handle.portalHeaders.funded
    });
    const offerRef = catalog.json?.offers?.[0]?.offerRef;
    const preview = await request({
      method: "POST",
      path: "/api/portal/commerce/checkout-preview",
      headers: handle.portalHeaders.funded,
      body: { offerRef }
    });
    const held = await request({
      method: "POST",
      path: "/api/portal/commerce/orders",
      headers: {
        ...handle.portalHeaders.funded,
        "Idempotency-Key": "cli_capture_order"
      },
      body: { quoteRef: preview.json?.quote?.quoteRef }
    });
    await waitThroughCancelUntil(held.json?.order?.cancelUntil);
    await handle.runCoordinatorOnce();
    const delivered = await pollDeliveredOrder(
      request,
      `/api/portal/commerce/orders/${held.json?.order?.orderRef}`,
      handle.portalHeaders.funded
    );

    const cancelPreview = await request({
      method: "POST",
      path: "/api/portal/commerce/checkout-preview",
      headers: handle.portalHeaders.funded,
      body: { offerRef }
    });
    const cancelHeld = await request({
      method: "POST",
      path: "/api/portal/commerce/orders",
      headers: {
        ...handle.portalHeaders.funded,
        "Idempotency-Key": "cli_cancel_order_create"
      },
      body: { quoteRef: cancelPreview.json?.quote?.quoteRef }
    });
    const cancelled = await request({
      method: "POST",
      path: `/api/portal/commerce/orders/${cancelHeld.json?.order?.orderRef}/cancel`,
      headers: {
        ...handle.portalHeaders.funded,
        "Idempotency-Key": "cli_cancel_order"
      },
      body: {}
    });
    const emptyPreview = await request({
      method: "POST",
      path: "/api/portal/commerce/checkout-preview",
      headers: handle.portalHeaders.emptyWallet,
      body: { offerRef }
    });
    const insufficient = await request({
      method: "POST",
      path: "/api/portal/commerce/orders",
      headers: {
        ...handle.portalHeaders.emptyWallet,
        "Idempotency-Key": "cli_empty_confirm"
      },
      body: { quoteRef: emptyPreview.json?.quote?.quoteRef }
    });

    const inspection = handle.inspect();
    if (
      catalog.status !== 200
      || !Array.isArray(catalog.json?.offers)
      || catalog.json.offers.length !== 1
      || offerRef !== OFFER_REF
      || preview.status !== 200
      || preview.json?.quote?.purchaseAvailability !== "available"
      || held.status !== 201
      || held.json?.order?.paymentStatus !== "held"
      || cancelPreview.status !== 200
      || cancelPreview.json?.quote?.purchaseAvailability !== "available"
      || cancelHeld.status !== 201
      || cancelHeld.json?.order?.paymentStatus !== "held"
      || cancelled.status !== 200
      || cancelled.json?.order?.paymentStatus !== "cancelled"
      || emptyPreview.status !== 200
      || emptyPreview.json?.quote?.purchaseAvailability !== "insufficient_balance"
      || !isExactInsufficientBalanceError(insufficient)
      || delivered.status !== 200
      || delivered.json?.order?.paymentStatus !== "captured"
      || delivered.json?.order?.fulfillment?.status !== "delivered"
      || inspection.effectCount !== 1
      || inspection.fulfillmentInFlight !== 0
    ) {
      throw validationFailure();
    }
    await handle.stop();
    stopped = true;
    if (existsSync(handle.ownedTempRoot)) throw validationFailure();
    return {
      type: "coin_commerce_local_validation",
      ok: true,
      loopback: true,
      temporary: true,
      checks: {
        catalog: true,
        quote: true,
        hold: true,
        capture: true,
        fulfillment: true,
        cancellation: true,
        insufficientBalance: true,
        cleanup: true
      }
    };
  } finally {
    if (!stopped) await handle.stop();
    if (lifecycle) lifecycle.handle = null;
  }
}

async function runCli() {
  if (process.argv.length !== 2) throw validationFailure();
  let signalListenersRemoved = false;
  const lifecycle = {
    handle: null,
    signalReceived: false,
    cleanupPromise: null,
    beforeRootRemoval: () => {
      if (signalListenersRemoved) return;
      signalListenersRemoved = true;
      process.removeListener("SIGINT", onSignal);
      process.removeListener("SIGTERM", onSignal);
    }
  };
  const onSignal = () => {
    lifecycle.signalReceived = true;
    if (lifecycle.handle) {
      lifecycle.cleanupPromise ||= lifecycle.handle.stop();
    }
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);
  try {
    const proof = await runClosedProof(lifecycle);
    if (lifecycle.signalReceived) throw validationFailure();
    process.stdout.write(`${JSON.stringify(proof)}\n`);
  } finally {
    if (lifecycle.cleanupPromise) {
      await lifecycle.cleanupPromise.catch(() => {});
    }
    lifecycle.beforeRootRemoval();
  }
}

const direct = process.argv[1]
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (direct) {
  runCli().catch(() => {
    process.stderr.write(`${JSON.stringify({
      type: "coin_commerce_local_validation",
      ok: false,
      error: "local_validation_failed"
    })}\n`);
    process.exitCode = 1;
  });
}
