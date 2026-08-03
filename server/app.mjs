import { createHash } from "node:crypto";
import express from "express";
import { join } from "node:path";
import { types as utilTypes } from "node:util";
import { createAdminAllowlistMiddleware } from "./middleware/admin-allowlist.mjs";
import { createAuthMiddleware } from "./middleware/auth.mjs";
import { createRateLimitMiddleware } from "./middleware/rate-limit.mjs";
import {
  localProxyControlRoutes,
  localProxyControlRoutesEnabled
} from "./routes/local-proxy-control.mjs";
import { statusRoutes } from "./routes/status.mjs";
import { diagnosticsRoutes } from "./routes/diagnostics.mjs";
import { systemProxyRoutes } from "./routes/system-proxy.mjs";
import { networkRoutes } from "./routes/network.mjs";
import { adminSubscriptionRoutes } from "./routes/admin-subscriptions.mjs";
import { adminPlatformRoutes } from "./routes/admin-platform.mjs";
import {
  ADMIN_AUTH_PUBLIC_PATHS,
  adminAuthRoutes,
  createAdminSessionGatewayMiddleware
} from "./routes/admin-auth.mjs";
import { subscriptionRoutes } from "./routes/subscription.mjs";
import { publicLeadRoutes } from "./routes/public-leads.mjs";
import { userPortalRoutes } from "./routes/user-portal.mjs";
import { portalCoinCommerceRoutes } from "./routes/portal-coin-commerce.mjs";
import { createPortalCoinWalletRouter } from "./routes/portal-coin-wallet.mjs";
import { createPortalCoinRechargeRouter } from "./routes/portal-coin-recharge.mjs";
import { dataPlaneAgentRoutes } from "./routes/data-plane-agent.mjs";
import { resolveClientIp } from "./services/ip-address.mjs";

const PUBLIC_PATHS = ["/api/health", "/api/public/leads", "/proxy.pac", "/sub/clash.yaml"];
const PUBLIC_PATH_PREFIXES = ["/sub/a/"];
const PAYMENT_CALLBACK_PATHS = Object.freeze([
  "/api/platform/payments/paypal/callback",
  "/api/platform/payments/xsd/callback",
  "/api/platform/payments/chaojipay/callback",
]);
const ADMIN_CAPABILITY_PROTECTED_PATHS = [
  "/api/admin/overview",
  "/api/admin/operations/overview"
];
const USER_PORTAL_PUBLIC_PATHS = [
  "/api/portal/human-challenges",
  "/api/portal/registration",
  "/api/portal/registration/email-verification",
  "/api/portal/password/session",
  "/api/portal/password/second-factor",
  "/api/portal/entry/enroll",
  "/api/portal/session",
  "/api/portal/access-requests",
  "/api/portal/access-requests/current",
  "/api/portal/access-requests/reveal",
  "/api/portal/access-requests/refresh",
  "/api/portal/access-requests/disable",
  "/api/portal/security/current",
  "/api/portal/security/totp/enrollment",
  "/api/portal/security/totp/enrollment/confirm",
  "/api/portal/support-requests"
];

function hashRateLimitValue(value) {
  return createHash("sha256")
    .update(String(value || ""))
    .digest("hex")
    .slice(0, 24);
}

function trimYamlSuffix(value) {
  return String(value || "").replace(/\.ya?ml$/i, "");
}

function subscriptionCredentialRateLimitKey(req, fallbackKeyFn) {
  const fallbackKey = () => `ip:${hashRateLimitValue(
    fallbackKeyFn(req) || req.ip || req.socket?.remoteAddress || "unknown"
  )}`;
  let url;
  try {
    url = new URL(req.originalUrl || req.url || "", "http://127.0.0.1");
  } catch {
    return fallbackKey();
  }

  const artifactPrefix = "/sub/a/";
  if (url.pathname.startsWith(artifactPrefix)) {
    const [artifactSegment] = url.pathname.slice(artifactPrefix.length).split("/");
    const artifact = trimYamlSuffix(artifactSegment);
    if (artifact) {
      return `artifact:${hashRateLimitValue(artifact)}`;
    }
  }

  if (url.pathname === "/sub/clash.yaml") {
    const token = url.searchParams.get("token") || "";
    if (token) {
      return `token:${hashRateLimitValue(token)}`;
    }
  }

  return fallbackKey();
}

function matchesProtectedPortalCoinNamespace(pathname) {
  return (
    pathname === "/api/portal/catalog"
    || pathname.startsWith("/api/portal/catalog/")
    || pathname === "/api/portal/commerce"
    || pathname.startsWith("/api/portal/commerce/")
    || pathname === "/api/portal/coins/wallet"
    || pathname.startsWith("/api/portal/coins/wallet/")
  );
}

function decodeAsciiPercentLayer(value) {
  return value.replace(
    /%([0-7][0-9a-f])/gi,
    (_match, hex) => String.fromCharCode(Number.parseInt(hex, 16))
  );
}

function isProtectedPortalCoinNamespace(req) {
  const target = typeof req.originalUrl === "string"
    ? req.originalUrl
    : req.url;
  if (typeof target !== "string") return false;
  const queryIndex = target.indexOf("?");
  let candidate = queryIndex === -1 ? target : target.slice(0, queryIndex);
  for (let layer = 0; layer <= 3; layer += 1) {
    if (matchesProtectedPortalCoinNamespace(candidate.toLowerCase())) return true;
    if (layer === 3) break;
    const decoded = decodeAsciiPercentLayer(candidate);
    if (decoded === candidate) break;
    candidate = decoded;
  }
  return false;
}

function resemblesKnownPaymentCallback(pathname) {
  const withoutTrailingSlash = pathname.endsWith("/")
    ? pathname.slice(0, -1)
    : pathname;
  const normalized = withoutTrailingSlash.toLowerCase();
  return PAYMENT_CALLBACK_PATHS.includes(normalized);
}

function ownEnumerableDataValue(value, field) {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    if (
      !descriptor
      || !descriptor.enumerable
      || !("value" in descriptor)
    ) {
      return undefined;
    }
    return descriptor.value;
  } catch {
    return undefined;
  }
}

function hasCallableOwnSurface(value, fields) {
  if (!value || (typeof value !== "object" && typeof value !== "function")) {
    return false;
  }
  return fields.every(
    (field) => typeof ownEnumerableDataValue(value, field) === "function"
  );
}

function hasCallableSafeDescriptorChain(value, fields) {
  try {
    if (
      !value
      || (typeof value !== "object" && typeof value !== "function")
      || Array.isArray(value)
      || utilTypes.isProxy(value)
    ) {
      return false;
    }
    return fields.every((field) => {
      const seen = new Set();
      let current = value;
      for (let depth = 0; current !== null && depth < 32; depth += 1) {
        if (seen.has(current) || utilTypes.isProxy(current)) return false;
        seen.add(current);
        const descriptor = Object.getOwnPropertyDescriptor(current, field);
        if (descriptor) {
          return (
            "value" in descriptor
            && typeof descriptor.value === "function"
            && !utilTypes.isProxy(descriptor.value)
          );
        }
        current = Object.getPrototypeOf(current);
      }
      return false;
    });
  } catch {
    return false;
  }
}

function portalCoinCommerceRoutesEnabled(state) {
  const platform = state.platform;
  if (!platform || typeof platform !== "object") return false;
  if (
    ownEnumerableDataValue(platform, "coinsCommerceEnabled") !== true
    || ownEnumerableDataValue(platform, "userPortalRoutesEnabled") !== true
  ) {
    return false;
  }
  const store = ownEnumerableDataValue(platform, "coinCommerceStore");
  const auth = ownEnumerableDataValue(platform, "userPortalAuth");
  const coordinator = ownEnumerableDataValue(
    platform,
    "coinCommerceCoordinator"
  );
  return (
    hasCallableOwnSurface(store, [
      "listPublishedOffers",
      "getPublishedOffer",
      "createCheckoutQuote",
      "confirmOrder",
      "cancelOrder",
      "getOrder",
      "listOrders"
    ])
    && hasCallableSafeDescriptorChain(auth, ["requireSession"])
    && hasCallableOwnSurface(coordinator, ["start", "stop"])
  );
}

function portalCoinWalletRoutesEnabled(state) {
  const platform = state.platform;
  if (!platform || typeof platform !== "object") return false;
  if (
    ownEnumerableDataValue(platform, "coinsWalletEnabled") !== true
    || ownEnumerableDataValue(platform, "userPortalRoutesEnabled") !== true
  ) {
    return false;
  }
  const store = ownEnumerableDataValue(platform, "coinsWalletStore");
  const auth = ownEnumerableDataValue(platform, "userPortalAuth");
  return (
    hasCallableOwnSurface(store, [
      "getWalletProjection",
      "listLedgerEntries"
    ])
    && hasCallableSafeDescriptorChain(auth, ["requireSession"])
  );
}

function portalCoinRechargeRoutesEnabled(state) {
  const platform = state.platform;
  if (!platform || typeof platform !== "object") return false;
  if (
    ownEnumerableDataValue(platform, "coinRechargeEnabled") !== true
    || ownEnumerableDataValue(platform, "userPortalRoutesEnabled") !== true
  ) return false;
  const provider = ownEnumerableDataValue(platform, "paymentRechargeProvider");
  if (!["paypal_sandbox", "xsd", "chaojipay"].includes(provider)) return false;
  const coordinator = ownEnumerableDataValue(platform, "paymentRechargeCoordinator");
  const auth = ownEnumerableDataValue(platform, "userPortalAuth");
  return hasCallableOwnSurface(coordinator, [
    "acceptProviderCallback",
    "captureRechargeOrder",
    "createRechargeOrder",
    "getRechargeOrder",
    "listOffers",
    "listRechargeOrders",
  ]) && hasCallableSafeDescriptorChain(auth, ["requireSession"]);
}

export function createApp(state, options = {}) {
  const app = express();
  const rechargeRoutesEnabled = portalCoinRechargeRoutesEnabled(state);
  if (rechargeRoutesEnabled) {
    app.use(createPortalCoinRechargeRouter({
      coordinator: ownEnumerableDataValue(state.platform, "paymentRechargeCoordinator"),
      auth: ownEnumerableDataValue(state.platform, "userPortalAuth"),
      paymentRechargeProvider: ownEnumerableDataValue(
        state.platform,
        "paymentRechargeProvider"
      ),
      nowFn: options.paymentNowFn,
    }));
  }
  app.use((req, res, next) => {
    const pathname = (req.originalUrl || req.url || "").split("?", 1)[0];
    if (
      resemblesKnownPaymentCallback(pathname)
      || (
        !rechargeRoutesEnabled
        && (
          pathname === "/api/portal/coins/recharge"
          || pathname.startsWith("/api/portal/coins/recharge/")
        )
      )
    ) {
      res.status(404).end();
      return;
    }
    next();
  });
  if (portalCoinCommerceRoutesEnabled(state)) {
    app.use(portalCoinCommerceRoutes(state, {
      nowFn: options.rateLimitNowFn
    }));
  }
  if (portalCoinWalletRoutesEnabled(state)) {
    app.use(createPortalCoinWalletRouter({
      store: ownEnumerableDataValue(state.platform, "coinsWalletStore"),
      auth: ownEnumerableDataValue(state.platform, "userPortalAuth")
    }));
  }
  const protectedPortalCoinConsoleAuth = createAuthMiddleware({
    token: state.consoleToken,
    publicPaths: [],
    publicPathPrefixes: []
  });
  app.use((req, res, next) => {
    if (isProtectedPortalCoinNamespace(req)) {
      protectedPortalCoinConsoleAuth(req, res, next);
      return;
    }
    next();
  });
  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, ts: Date.now(), authRequired: true });
  });
  app.use(express.static(join(state.rootDir, "public")));
  const security = state.security || {};
  const userPortalRoutesEnabled = Boolean(
    state.platform?.userPortalRoutesEnabled
    && (
      state.platform?.userPortalAuth
      || state.platform?.portalAccessRequests
      || state.platform?.portalRegistrations
      || state.platform?.portalRegistrationEmailVerifications
      || state.platform?.portalSupportRequests
    )
  );
  const dataPlaneAgentRoutesEnabled = Boolean(
    state.platform?.dataPlaneAgentRoutesEnabled
    && state.platform?.dataPlaneAgentService
  );
  const adminAuthRoutesEnabled = Boolean(
    state.platform?.adminAuthRoutesEnabled
    && state.platform?.adminAuth
  );
  const authPublicPaths = [
    ...PUBLIC_PATHS,
    ...(userPortalRoutesEnabled ? USER_PORTAL_PUBLIC_PATHS : []),
    ...(adminAuthRoutesEnabled ? ADMIN_AUTH_PUBLIC_PATHS : []),
    ...(
      adminAuthRoutesEnabled
      && state.platform?.adminAuthorizationEnabled === true
        ? ADMIN_CAPABILITY_PROTECTED_PATHS
        : []
    )
  ];
  const clientIpResolver = options.clientIpResolver || ((req) => resolveClientIp(req, {
    trustedProxyCidrs: security.trustedProxyCidrs
  }));
  app.use("/api/admin", createAdminAllowlistMiddleware({
    allowedCidrs: security.adminAllowedCidrs,
    resolveClientIpFn: clientIpResolver
  }));
  if (adminAuthRoutesEnabled) {
    app.use("/api/admin-auth", createAdminAllowlistMiddleware({
      allowedCidrs: security.adminAllowedCidrs,
      resolveClientIpFn: clientIpResolver
    }));
    app.use(adminAuthRoutes(state));
    app.use("/api/admin", createAdminSessionGatewayMiddleware({
      adminAuth: state.platform.adminAuth,
      consoleToken: state.consoleToken,
      role: state.platform.adminRole || "admin"
    }));
  }
  if (dataPlaneAgentRoutesEnabled) {
    app.use(dataPlaneAgentRoutes(state, {
      resolveClientIpFn: clientIpResolver
    }));
  }
  app.use(createAuthMiddleware({
    token: state.consoleToken,
    publicPaths: authPublicPaths,
    publicPathPrefixes: PUBLIC_PATH_PREFIXES
  }));
  app.use(publicLeadRoutes(state));
  if (userPortalRoutesEnabled) {
    app.use(userPortalRoutes(state));
  }
  app.get("/api/status", statusRoutes(state));
  if (localProxyControlRoutesEnabled(state)) {
    app.use(localProxyControlRoutes(state));
  }
  app.use(systemProxyRoutes(state));
  app.use(networkRoutes(state));
  if (state.subscriptions?.core || state.subscriptions?.service) {
    app.use(adminSubscriptionRoutes(state));
  }
  if (
    state.platform?.leadQueue
    || state.platform?.accountShell
    || state.platform?.accessShell
    || state.platform?.portalAccessRequests
    || state.platform?.controlStore
    || state.platform?.edgeUsageAccounting
    || state.platform?.trafficCollectorStatusStore
    || state.platform?.dataPlaneHandoffQueue
    || state.platform?.partnerAttributionStore
    || state.platform?.partnerAttributionEventLedger
    || state.platform?.partnerSettlementCandidateEngine
  ) {
    app.use(adminPlatformRoutes(state));
  }
  app.use("/sub", createRateLimitMiddleware({
    windowMs: security.subRateLimit?.windowMs,
    max: security.subRateLimit?.max,
    nowFn: options.rateLimitNowFn,
    keyFn: clientIpResolver
  }));
  if (security.subCredentialRateLimit) {
    app.use("/sub", createRateLimitMiddleware({
      windowMs: security.subCredentialRateLimit.windowMs,
      max: security.subCredentialRateLimit.max,
      nowFn: options.rateLimitNowFn,
      keyFn: (req) => subscriptionCredentialRateLimitKey(req, clientIpResolver)
    }));
  }
  app.use(subscriptionRoutes(state, {
    resolveClientIpFn: clientIpResolver
  }));
  app.use(diagnosticsRoutes(state));

  return app;
}
