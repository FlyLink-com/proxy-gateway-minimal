import { createHash } from "node:crypto";
import { Router, json, raw } from "express";

const SESSION_REFERENCE = /^[a-z][a-z0-9_]{2,95}$/;
const SAFE_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const PAYPAL_HEADERS = Object.freeze([
  "paypal-auth-algo",
  "paypal-cert-url",
  "paypal-transmission-id",
  "paypal-transmission-sig",
  "paypal-transmission-time",
]);
const CALLBACKS = Object.freeze({
  paypal_sandbox: Object.freeze({
    path: "/api/platform/payments/paypal/callback",
    prefix: "paypal_callback",
  }),
  xsd: Object.freeze({
    path: "/api/platform/payments/xsd/callback",
    prefix: "xsd_callback",
    contentTypes: Object.freeze([
      "application/x-www-form-urlencoded; charset=utf-8",
    ]),
  }),
  chaojipay: Object.freeze({
    path: "/api/platform/payments/chaojipay/callback",
    prefix: "chaojipay_callback",
    contentTypes: Object.freeze([
      "application/form",
      "application/form; charset=utf-8",
      "application/x-www-form-urlencoded",
      "application/x-www-form-urlencoded; charset=utf-8",
    ]),
  }),
});
const ORDER_FIELDS = Object.freeze([
  "orderRef",
  "offerRef",
  "quoteVersion",
  "expectedPaidCoinUnits",
  "amountMinor",
  "currency",
  "currencyExponent",
  "adapterKey",
  "paymentMethod",
  "status",
  "providerOrderRef",
  "nextAction",
  "walletOperationRef",
  "walletLotRef",
  "expiresAt",
  "createdAt",
  "updatedAt",
]);
const OFFER_V1_FIELDS = Object.freeze([
  "offerRef", "quoteVersion", "paidCoinUnits", "amountMinor", "currency", "currencyExponent",
]);

function sendError(res, status, code, retryable = false) {
  res.status(status).json({ error: { code, retryable } });
}

function readRawHeader(req, expectedName) {
  if (!Array.isArray(req.rawHeaders) || req.rawHeaders.length % 2 !== 0) return null;
  let value = null;
  for (let index = 0; index < req.rawHeaders.length; index += 2) {
    const name = req.rawHeaders[index];
    const candidate = req.rawHeaders[index + 1];
    if (typeof name !== "string" || typeof candidate !== "string") return null;
    if (name.toLowerCase() !== expectedName) continue;
    if (value !== null) return null;
    value = candidate;
  }
  return value;
}

function hasRawHeader(req, expectedName) {
  if (!Array.isArray(req.rawHeaders) || req.rawHeaders.length % 2 !== 0) return true;
  for (let index = 0; index < req.rawHeaders.length; index += 2) {
    const name = req.rawHeaders[index];
    const value = req.rawHeaders[index + 1];
    if (typeof name !== "string" || typeof value !== "string") return true;
    if (name.toLowerCase() === expectedName) return true;
  }
  return false;
}

function exactObject(value, fields) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
  const keys = Object.keys(value);
  if (keys.length !== fields.length || fields.some((field) => !Object.hasOwn(value, field))) {
    throw new Error();
  }
  return value;
}

function safeReference(value) {
  if (typeof value !== "string" || !SAFE_REFERENCE.test(value)) throw new Error();
  return value;
}

function projectOffer(value, version) {
  const result = {};
  for (const field of OFFER_V1_FIELDS) result[field] = value[field];
  if (version === 2) result.paymentMethods = value.paymentMethods;
  return result;
}

function offerProjectionVersion(req) {
  if (!Array.isArray(req.rawHeaders) || req.rawHeaders.length % 2 !== 0) throw new Error();
  let value = null;
  for (let index = 0; index < req.rawHeaders.length; index += 2) {
    const name = req.rawHeaders[index];
    const candidate = req.rawHeaders[index + 1];
    if (typeof name !== "string" || typeof candidate !== "string") throw new Error();
    if (name.toLowerCase() !== "x-portal-recharge-offers-version") continue;
    if (value !== null) throw new Error();
    value = candidate;
  }
  if (value === null) return 1;
  if (value === "2") return 2;
  throw new Error();
}

function projectOrder(value) {
  if (!value || typeof value !== "object") throw new Error();
  const result = {};
  for (const field of ORDER_FIELDS) result[field] = value[field];
  return result;
}

function sessionMiddleware(auth) {
  return function requireSession(req, res, next) {
    const sessionRef = readRawHeader(req, "x-portal-session");
    if (sessionRef === null || !SESSION_REFERENCE.test(sessionRef)) {
      sendError(res, 401, "payment_recharge_session_invalid");
      return;
    }
    try {
      const session = exactObject(auth.requireSession({ sessionRef }), ["sessionRef", "accountId"]);
      if (session.sessionRef !== sessionRef) throw new Error();
      res.locals.paymentRechargeAccountId = safeReference(session.accountId);
      next();
    } catch {
      sendError(res, 401, "payment_recharge_session_invalid");
    }
  };
}

function withoutQuery(req, res, next) {
  if ((req.originalUrl || req.url || "").includes("?")) {
    sendError(res, 400, "payment_recharge_request_invalid");
    return;
  }
  next();
}

function requireJsonContentType(req, res, next) {
  const contentType = readRawHeader(req, "content-type");
  if (
    contentType === null
    || !/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(contentType)
  ) {
    sendError(res, 415, "payment_recharge_content_type_invalid");
    return;
  }
  next();
}

function requireFormContentType(contentTypes) {
  return function validateFormContentType(req, res, next) {
    const contentType = readRawHeader(req, "content-type");
    if (
      contentType === null
      || !contentTypes.includes(contentType)
      || hasRawHeader(req, "content-encoding")
    ) {
      sendError(res, 415, "payment_recharge_content_type_invalid");
      return;
    }
    res.locals.paymentRechargeContentType = contentType;
    next();
  };
}

const formRawBody = raw({
  limit: 16_384,
  inflate: false,
  type: () => true,
});

function parseFormRawBody(req, res, next) {
  formRawBody(req, res, (error) => {
    if (!error) {
      next();
      return;
    }
    if (error?.type === "entity.too.large") {
      sendError(res, 413, "payment_recharge_body_too_large");
      return;
    }
    sendError(res, 400, "payment_recharge_request_invalid");
  });
}

function requireValidFormBytes(req, res, next) {
  if (!Buffer.isBuffer(req.body)) {
    sendError(res, 400, "payment_recharge_request_invalid");
    return;
  }
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(req.body);
  } catch {
    sendError(res, 400, "payment_recharge_request_invalid");
    return;
  }
  next();
}

function asyncHandler(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch {
      sendError(res, 503, "payment_recharge_unavailable", true);
    }
  };
}

function paypalCallbackHeaders(req) {
  return PAYPAL_HEADERS.map((name) => {
    const value = readRawHeader(req, name);
    if (value === null || value.length === 0) throw new Error();
    return Object.freeze({ name, value });
  });
}

function paypalCallbackReference(transmissionId, body) {
  const digest = createHash("sha256")
    .update(transmissionId, "utf8")
    .update("\0", "utf8")
    .update(body)
    .digest("hex");
  return `paypal_callback_${digest}`;
}

function cnyCallbackReference(prefix, body) {
  return `${prefix}_${createHash("sha256").update(body).digest("hex")}`;
}

function selectedPath(req) {
  const target = req.originalUrl || req.url || "";
  const query = target.indexOf("?");
  return query === -1 ? target : target.slice(0, query);
}

function isSelectedRoute(method, pathname, callbackPath) {
  if (method === "POST" && pathname === callbackPath) return true;
  if (method === "GET" && pathname === "/api/portal/coins/recharge/offers") return true;
  if (method === "POST" && pathname === "/api/portal/coins/recharge/orders") return true;
  if (method === "GET" && pathname === "/api/portal/coins/recharge/orders") return true;
  return /^\/api\/portal\/coins\/recharge\/orders\/[^/]+(?:\/capture)?$/u.test(pathname)
    && (method === "GET" || method === "POST");
}

export function createPortalCoinRechargeRouter({
  coordinator,
  auth,
  paymentRechargeProvider,
  nowFn = () => new Date(),
}) {
  if (!coordinator || !auth || typeof auth.requireSession !== "function") {
    throw new TypeError("Portal recharge dependencies unavailable");
  }
  if (!Object.hasOwn(CALLBACKS, paymentRechargeProvider)) {
    throw new TypeError("Portal recharge provider unavailable");
  }
  const callback = CALLBACKS[paymentRechargeProvider];
  const router = Router({ caseSensitive: true, strict: true });
  const requireSession = sessionMiddleware(auth);
  const jsonBody = json({ limit: "32kb", strict: true, type: "application/json" });

  router.get("/api/portal/coins/recharge/offers", withoutQuery, requireSession, asyncHandler(
    async (req, res) => {
      const version = offerProjectionVersion(req);
      res.json({ offers: coordinator.listOffers().map((offer) => projectOffer(offer, version)) });
    },
  ));
  router.post("/api/portal/coins/recharge/orders", withoutQuery, requireSession, jsonBody, asyncHandler(
    async (req, res) => {
      const body = exactObject(req.body, ["offerRef", "idempotencyKey"]);
      const result = await coordinator.createRechargeOrder({
        accountId: res.locals.paymentRechargeAccountId,
        offerRef: safeReference(body.offerRef),
        idempotencyKey: safeReference(body.idempotencyKey),
      });
      res.status(201).json({ recharge: { order: projectOrder(result.order) } });
    },
  ));
  router.get("/api/portal/coins/recharge/orders", withoutQuery, requireSession, asyncHandler(
    async (_req, res) => {
      const orders = coordinator.listRechargeOrders({
        accountId: res.locals.paymentRechargeAccountId,
        limit: 50,
        cursor: null,
      });
      res.json({ recharges: orders.map(projectOrder) });
    },
  ));
  router.get("/api/portal/coins/recharge/orders/:orderRef", withoutQuery, requireSession, asyncHandler(
    async (req, res) => {
      const order = coordinator.getRechargeOrder({
        accountId: res.locals.paymentRechargeAccountId,
        orderRef: safeReference(req.params.orderRef),
      });
      if (order === null) {
        sendError(res, 404, "payment_recharge_order_not_found");
        return;
      }
      res.json({ recharge: { order: projectOrder(order) } });
    },
  ));
  router.post(
    "/api/portal/coins/recharge/orders/:orderRef/capture",
    withoutQuery,
    requireSession,
    jsonBody,
    asyncHandler(async (req, res) => {
      const body = exactObject(req.body, ["idempotencyKey"]);
      const result = await coordinator.captureRechargeOrder({
        accountId: res.locals.paymentRechargeAccountId,
        orderRef: safeReference(req.params.orderRef),
        idempotencyKey: safeReference(body.idempotencyKey),
      });
      res.json({ recharge: { order: projectOrder(result.order) } });
    }),
  );
  if (paymentRechargeProvider === "paypal_sandbox") {
    router.post(
      callback.path,
      withoutQuery,
      requireJsonContentType,
      raw({ limit: "1mb", type: "application/json" }),
      asyncHandler(async (req, res) => {
        if (!Buffer.isBuffer(req.body)) throw new Error();
        const headerEntries = paypalCallbackHeaders(req);
        const transmissionId = headerEntries.find(
          ({ name }) => name === "paypal-transmission-id",
        ).value;
        const received = nowFn();
        const receivedAt = received instanceof Date ? received.toISOString() : received;
        if (typeof receivedAt !== "string" || new Date(receivedAt).toISOString() !== receivedAt) {
          throw new Error();
        }
        const result = await coordinator.acceptProviderCallback({
          callbackRequestRef: paypalCallbackReference(transmissionId, req.body),
          receivedAt,
          bodyBase64: req.body.toString("base64"),
          headerEntries,
        });
        const acknowledgement = result.acknowledgement;
        res.status(acknowledgement.statusCode);
        res.type(acknowledgement.contentType);
        res.send(acknowledgement.body);
      }),
    );
  } else {
    router.post(
      callback.path,
      withoutQuery,
      requireFormContentType(callback.contentTypes),
      parseFormRawBody,
      requireValidFormBytes,
      asyncHandler(async (req, res) => {
        const received = nowFn();
        const receivedAt = received instanceof Date ? received.toISOString() : received;
        if (typeof receivedAt !== "string" || new Date(receivedAt).toISOString() !== receivedAt) {
          throw new Error();
        }
        const result = await coordinator.acceptProviderCallback({
          callbackRequestRef: cnyCallbackReference(callback.prefix, req.body),
          receivedAt,
          bodyBase64: req.body.toString("base64"),
          headerEntries: [Object.freeze({
            name: "content-type",
            value: res.locals.paymentRechargeContentType,
          })],
        });
        const acknowledgement = result.acknowledgement;
        res.status(acknowledgement.statusCode);
        res.type(acknowledgement.contentType);
        res.send(acknowledgement.body);
      }),
    );
  }

  return function portalCoinRechargeDispatcher(req, res, next) {
    if (!isSelectedRoute(req.method, selectedPath(req), callback.path)) {
      next();
      return;
    }
    router(req, res, next);
  };
}
