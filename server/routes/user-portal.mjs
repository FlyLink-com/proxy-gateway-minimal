import { readReferralCookie } from './portal-referral.mjs';
import { Router } from "express";
import { types as utilTypes } from "node:util";
import { createPortalBrowserSessionTransport } from "../services/platform/portal-browser-session-transport.mjs";
import { snapshotPortalCurrentResourceService } from "../services/platform/portal-current-resource.mjs";
import {
  snapshotWalletFirstCurrentResourceProjection
} from "../services/platform/wallet-first-current-resource-projection.mjs";
import {
  snapshotWalletFirstCurrentResourceSetupDelivery
} from "../services/platform/wallet-first-current-resource-setup-delivery.mjs";

function sendPortalError(res, error) {
  if (["subscription_link_reset_conflict", "subscription_link_reset_state_changed"].includes(error.code)) {
    res.status(409).json({ error: error.code });
    return;
  }
  if (["subscription_link_reset_unavailable", "subscription_link_reset_reconciliation_required"].includes(error.code)) {
    res.status(503).json({ error: error.code });
    return;
  }
  if (error.code === "subscription_link_reset_rate_limited") {
    if (Number.isSafeInteger(error.retryAfterSeconds) && error.retryAfterSeconds >= 1 && error.retryAfterSeconds <= 86400) {
      res.set("Retry-After", String(error.retryAfterSeconds));
    }
    res.status(429).json({ error: error.code });
    return;
  }
  if (error.code === "portal_current_resource_unavailable" || error.code === "portal_current_resource_reconciliation_required") {
    res.status(error.code === "portal_current_resource_unavailable" ? 503 : 409).json({ error: error.code });
    return;
  }
  if (["portal_browser_request_invalid", "portal_browser_unavailable"].includes(error.code)) {
    res.status(error.status || 503).json({ error: error.code });
    return;
  }
  if (error.code === "human_verification_failed") {
    res.status(400).json({ error: "human_verification_failed" });
    return;
  }
  if (error.code === "email_verification_required") {
    res.status(400).json({ error: "email_verification_required" });
    return;
  }
  if (error.code === "email_verification_failed") {
    res.status(400).json({ error: "email_verification_failed" });
    return;
  }
  if (error.code === "email_verification_unavailable") {
    res.status(503).json({ error: "email_verification_unavailable" });
    return;
  }
  if (error.code === "email_verification_rate_limited") {
    res.status(429).json({ error: "email_verification_rate_limited" });
    return;
  }
  if (error.code === "registration_rate_limited") {
    res.status(429).json({ error: "registration_rate_limited" });
    return;
  }
  if (error.code === "subscription_refresh_rate_limited") {
    res.status(429).json({ error: "subscription_refresh_rate_limited" });
    return;
  }
  if (error.code === "legal_agreement_required") {
    res.status(400).json({ error: "legal_agreement_required" });
    return;
  }
  if (error.code === "account_already_exists") {
    res.status(409).json({ error: "account_already_exists" });
    return;
  }
  if (error.code === "wallet_first_deferred_required") {
    res.status(409).json({ error: "wallet_first_deferred_required" });
    return;
  }
  if (error.code === "wallet_first_access_request_unavailable") {
    res.status(503).json({ error: "wallet_first_access_request_unavailable" });
    return;
  }
  if (error.code === "wallet_first_current_resource_unavailable") {
    res.status(503).json({ error: "wallet_first_current_resource_unavailable" });
    return;
  }
  if (error.code === "wallet_first_setup_delivery_unavailable") {
    res.status(503).json({ error: "wallet_first_setup_delivery_unavailable" });
    return;
  }
  if (error.code === "wallet_first_setup_delivery_reconciliation_required") {
    res.status(409).json({ error: "wallet_first_setup_delivery_reconciliation_required" });
    return;
  }
  if (error.code === "invalid_session") {
    res.status(401).json({ error: "invalid_session" });
    return;
  }
  if (error.code === "invalid_login") {
    res.status(401).json({ error: "invalid_login" });
    return;
  }
  if (error.code === "validation_error") {
    res.status(400).json({ error: "validation_error" });
    return;
  }
  if (error.code === "not_found") {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.status(500).json({ error: "internal_error" });
}

export function userPortalRoutes(state, options = {}) {
  const router = Router();
  const auth = options.userPortalAuth || state.platform?.userPortalAuth;
  const browserSessions = options.browserSessions || createPortalBrowserSessionTransport({auth});
  router.use(browserSessions.middleware);
  const accessRequests = options.portalAccessRequests || state.platform?.portalAccessRequests;
  const registrations = options.portalRegistrations || state.platform?.portalRegistrations;
  const registrationEmailVerifications = options.portalRegistrationEmailVerifications
    || state.platform?.portalRegistrationEmailVerifications;
  const supportRequests = options.portalSupportRequests || state.platform?.portalSupportRequests;
  const humanChallenges = options.portalHumanChallenges || state.platform?.portalHumanChallenges;
  const currentResourceProjection = options.walletFirstCurrentResourceProjection
    || state.platform?.walletFirstCurrentResourceProjection;
  const currentResourceSetupDelivery = options.walletFirstCurrentResourceSetupDelivery
    || state.platform?.walletFirstCurrentResourceSetupDelivery;
  const currentResourceService = options.portalCurrentResourceService || state.platform?.portalCurrentResourceService;
  const resourceReader = () => currentResourceService
    ? snapshotPortalCurrentResourceService(currentResourceService)
    : snapshotWalletFirstCurrentResourceProjection(currentResourceProjection);
  const resourceDelivery = () => currentResourceService
    ? snapshotPortalCurrentResourceService(currentResourceService)
    : snapshotWalletFirstCurrentResourceSetupDelivery(currentResourceSetupDelivery);

  function requestContext(req) {
    return {
      sourceIp: req.ip,
      userAgent: req.get("user-agent") || ""
    };
  }

  function requireAuthService() {
    if (!auth) {
      const error = new Error("user portal auth service is not configured");
      error.code = "validation_error";
      throw error;
    }
  }

  function verifyHumanChallenge(req, scope = "portal_login", options = {}) {
    if (!humanChallenges) {
      if (options.required) {
        const error = new Error("portal human challenge service is not configured");
        error.code = "validation_error";
        throw error;
      }
      return;
    }
    const humanVerification = req.body?.humanVerification ?? {};
    humanChallenges.verifyChallenge({
      challengeRef: humanVerification.challengeRef ?? humanVerification.challengeId,
      answer: humanVerification.answer ?? humanVerification.challengeAnswer,
      scope,
      requestContext: requestContext(req)
    });
  }

  function portalSessionRef(req) {
    const browser = browserSessions?.session(req);
    if (browser) return browser.sessionRef;
    return req.get("x-portal-session") || req.body?.sessionRef || req.query?.sessionRef;
  }

  function requirePortalSession(req) {
    requireAuthService();
    const browser = browserSessions?.session(req);
    if (browser) return browser;
    if (typeof auth.requireSession !== "function") {
      const error = new Error("portal session service is not configured");
      error.code = "validation_error";
      throw error;
    }
    return auth.requireSession({ sessionRef: portalSessionRef(req) });
  }

  function requirePortalHeaderSession(req) {
    requireAuthService();
    const browser = browserSessions?.session(req);
    if (browser) return browser;
    if (typeof auth.requireSession !== "function") {
      const error = new Error("portal session service is not configured");
      error.code = "validation_error";
      throw error;
    }
    return auth.requireSession({ sessionRef: req.get("x-portal-session") });
  }

  function requireNoQuery(req) {
    const requestUrl = String(req.originalUrl || req.url || "");
    if (requestUrl.includes("?")) {
      const error = new Error("current resource route does not accept query parameters");
      error.code = "validation_error";
      throw error;
    }
  }

  function requireExactBody(req, fields) {
    try {
      const body = req.body;
      if (
        !body
        || typeof body !== "object"
        || Array.isArray(body)
        || utilTypes.isProxy(body)
        || Object.getPrototypeOf(body) !== Object.prototype
      ) {
        throw new Error("invalid request body");
      }
      const expected = new Set(fields);
      const keys = Reflect.ownKeys(body);
      if (keys.length !== fields.length) throw new Error("invalid request body");
      const snapshot = {};
      for (const key of keys) {
        if (typeof key !== "string" || !expected.has(key)) {
          throw new Error("invalid request body");
        }
        const descriptor = Object.getOwnPropertyDescriptor(body, key);
        if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
          throw new Error("invalid request body");
        }
        snapshot[key] = descriptor.value;
      }
      for (const field of fields) {
        if (!Object.hasOwn(snapshot, field)) throw new Error("invalid request body");
      }
      return snapshot;
    } catch {
      const error = new Error("setup delivery body must be exact");
      error.code = "validation_error";
      throw error;
    }
  }

  function setSetupDeliveryResponseHeaders(res) {
    res.set("Cache-Control", "no-store");
    res.set("Referrer-Policy", "no-referrer");
  }

  function sessionScopedBody(req) {
    const session = requirePortalSession(req);
    return {
      ...(req.body ?? {}),
      portalUserRef: session.accountId
    };
  }

  router.get("/api/portal/browser-session", (req, res) => {
    try {
      if (!browserSessions) { res.status(503).json({error:"portal_browser_unavailable"}); return; }
      browserSessions.bootstrap(req, res);
    } catch (error) { sendPortalError(res, error); }
  });
  router.post("/api/portal/browser-session/logout", (req, res) => {
    try {
      if (!browserSessions) { res.status(503).json({error:"portal_browser_unavailable"}); return; }
      browserSessions.logout(req, res);
    } catch (error) { sendPortalError(res, error); }
  });

  function completedSession(req, res, session, rememberMe = false) {
    return browserSessions ? browserSessions.completeLogin(req, res, session, rememberMe) : session;
  }

  router.post("/api/portal/human-challenges", (req, res) => {
    try {
      if (!humanChallenges) {
        const error = new Error("portal human challenge service is not configured");
        error.code = "validation_error";
        throw error;
      }
      const issued = humanChallenges.issueChallenge({
        scope: req.body?.scope,
        requestContext: requestContext(req)
      });
      res.status(201).json({ challenge: issued.challenge });
    } catch (error) {
      sendPortalError(res, error);
    }
  });

  router.post("/api/portal/password/session", (req, res) => {
    try {
      requireAuthService();
      verifyHumanChallenge(req, "portal_login", { required: true });
      const result = auth.verifyPasswordAndMaybeChallenge({
        accountId: req.body?.accountId,
        plainPassword: req.body?.plainPassword ?? req.body?.password,
        rememberMe: req.body?.rememberMe ?? false,
        requestContext: requestContext(req)
      });
      if (result.session) {
        res.json({ session: completedSession(req, res, result.session, result.rememberMe === true) });
        return;
      }
      if (result.result?.status === "second_factor_required") {
        res.status(202).json({ challenge: result.result });
        return;
      }
      res.json(result);
    } catch (error) {
      sendPortalError(res, error);
    }
  });

  router.post("/api/portal/password/second-factor", (req, res) => {
    try {
      requireAuthService();
      const factor = req.body?.factor === "authenticator" ? "totp" : req.body?.factor;
      const result = auth.completeSecondFactor({
        challengeRef: req.body?.challengeRef,
        factor,
        code: req.body?.code ?? req.body?.totpCode,
        passkeyProof: req.body?.passkeyProof
      });
      res.json({ session: completedSession(req, res, result.session, result.rememberMe === true) });
    } catch (error) {
      sendPortalError(res, error);
    }
  });

  router.get("/api/portal/security/current", (req, res) => {
    try {
      requireAuthService();
      res.json(auth.getSecurityState({
        sessionRef: requirePortalSession(req).sessionRef
      }));
    } catch (error) {
      sendPortalError(res, error);
    }
  });

  router.post("/api/portal/security/totp/enrollment", (req, res) => {
    try {
      requireAuthService();
      res.status(201).json(auth.startTotpEnrollment({
        sessionRef: requirePortalSession(req).sessionRef
      }));
    } catch (error) {
      sendPortalError(res, error);
    }
  });

  router.post("/api/portal/security/totp/enrollment/confirm", (req, res) => {
    try {
      requireAuthService();
      res.json(auth.confirmTotpEnrollment({
        sessionRef: requirePortalSession(req).sessionRef,
        enrollmentRef: req.body?.enrollmentRef,
        code: req.body?.code
      }));
    } catch (error) {
      sendPortalError(res, error);
    }
  });

  router.post("/api/portal/entry/enroll", (req, res) => {
    try {
      requireAuthService();
      verifyHumanChallenge(req);
      const enrollment = auth.enrollTotpCredential({
        entryToken: req.body?.entryToken,
        encryptedTotpSecret: req.body?.encryptedTotpSecret
      });
      res.json({ enrollment: enrollment.summary });
    } catch (error) {
      sendPortalError(res, error);
    }
  });

  router.post("/api/portal/registration/email-verification", async (req, res) => {
    try {
      if (
        !registrationEmailVerifications
        || typeof registrationEmailVerifications.issueVerification !== "function"
      ) {
        const error = new Error("portal registration email verification service is not configured");
        error.code = "email_verification_unavailable";
        throw error;
      }
      const issued = await registrationEmailVerifications.issueVerification({
        email: req.body?.email,
        purpose: "portal_registration",
        requestContext: requestContext(req)
      });
      res.status(201).json(issued);
    } catch (error) {
      sendPortalError(res, error);
    }
  });

  router.post("/api/portal/registration", (req, res) => {
    try {
      if (!registrations || typeof registrations.submitRegistration !== "function") {
        const error = new Error("portal registration service is not configured");
        error.code = "validation_error";
        throw error;
      }
      if (
        !registrationEmailVerifications
        || typeof registrationEmailVerifications.verifyVerification !== "function"
      ) {
        const error = new Error("portal registration email verification service is not configured");
        error.code = "email_verification_unavailable";
        throw error;
      }
      registrationEmailVerifications.verifyVerification({
        email: req.body?.email,
        purpose: "portal_registration",
        emailVerification: req.body?.emailVerification,
        requestContext: requestContext(req)
      });
      const result = registrations.submitRegistration({
        ...(req.body ?? {}),
        requestContext: requestContext(req)
      }, { referralToken: readReferralCookie(req) });
      res.status(201).json({ ...result,
        ...(result.session ? {session:completedSession(req, res, result.session)} : {})
      });
    } catch (error) {
      sendPortalError(res, error);
    }
  });

  router.post("/api/portal/session", (req, res) => {
    try {
      requireAuthService();
      verifyHumanChallenge(req);
      const session = auth.verifyTotpAndCreateSession({
        accountId: req.body?.accountId,
        code: req.body?.code
      });
      res.json({ session: completedSession(req, res, session.session) });
    } catch (error) {
      sendPortalError(res, error);
    }
  });

  router.post("/api/portal/access-requests", (req, res) => {
    try {
      if (!accessRequests) {
        const error = new Error("portal access request service is not configured");
        error.code = "validation_error";
        throw error;
      }
      res.status(201).json({
        request: accessRequests.submitRequest(sessionScopedBody(req))
      });
    } catch (error) {
      sendPortalError(res, error);
    }
  });

  router.get("/api/portal/access-requests/current", (req, res) => {
    try {
      if (!accessRequests) {
        const error = new Error("portal access request service is not configured");
        error.code = "validation_error";
        throw error;
      }
      const session = requirePortalSession(req);
      const portalUserRef = session.accountId;
      const items = accessRequests.listRequests({ portalUserRef }).sort((a, b) =>
        String(a.submittedAt || a.updatedAt || "").localeCompare(String(b.submittedAt || b.updatedAt || ""))
        || String(a.id || "").localeCompare(String(b.id || ""))
      );
      res.json({ items });
    } catch (error) {
      sendPortalError(res, error);
    }
  });

  router.get("/api/portal/resources/current", (req, res) => {
    try {
      requireNoQuery(req);
      const session = requirePortalHeaderSession(req);
      const projection = resourceReader();
      const resource = projection.getCurrentResource({ accountId: session.accountId });
      res.set("Cache-Control", "no-store");
      res.json({ resource });
    } catch (error) {
      sendPortalError(res, error);
    }
  });

  router.get("/api/portal/resources/current/overview", (req, res) => {
    res.set("Cache-Control", "no-store");
    res.set("Referrer-Policy", "no-referrer");
    try {
      requireNoQuery(req);
      const session = requirePortalHeaderSession(req);
      const projection = resourceReader();
      res.json({ resource: projection.getCurrentOverview({ accountId: session.accountId }) });
    } catch (error) {
      sendPortalError(res, error);
    }
  });

  router.post("/api/portal/resources/current/setup", (req, res) => {
    try {
      setSetupDeliveryResponseHeaders(res);
      requireNoQuery(req);
      const session = requirePortalHeaderSession(req);
      const body = requireExactBody(req, ["idempotencyKey"]);
      const delivery = resourceDelivery();
      const result = delivery.deliverSetup({
        accountId: session.accountId,
        sessionRef: session.sessionRef,
        idempotencyKey: body.idempotencyKey
      });
      res.status(200).json(result);
    } catch (error) {
      sendPortalError(res, error);
    }
  });

  router.post("/api/portal/resources/current/setup/ack", (req, res) => {
    try {
      setSetupDeliveryResponseHeaders(res);
      requireNoQuery(req);
      const session = requirePortalHeaderSession(req);
      const body = requireExactBody(req, ["handoffRef"]);
      const delivery = resourceDelivery();
      delivery.acknowledgeSetup({
        accountId: session.accountId,
        sessionRef: session.sessionRef,
        handoffRef: body.handoffRef
      });
      res.status(204).end();
    } catch (error) {
      sendPortalError(res, error);
    }
  });

  router.post("/api/portal/access-requests/reveal", (req, res) => {
    try {
      if (!accessRequests || typeof accessRequests.revealSubscription !== "function") {
        const error = new Error("portal order reveal service is not configured");
        error.code = "validation_error";
        throw error;
      }
      res.json({
        request: accessRequests.revealSubscription(sessionScopedBody(req))
      });
    } catch (error) {
      sendPortalError(res, error);
    }
  });

  router.post("/api/portal/access-requests/refresh", (req, res) => {
    try {
      if (!accessRequests || typeof accessRequests.refreshSubscription !== "function") {
        const error = new Error("portal order lifecycle service is not configured");
        error.code = "validation_error";
        throw error;
      }
      res.json({
        request: accessRequests.refreshSubscription(sessionScopedBody(req))
      });
    } catch (error) {
      sendPortalError(res, error);
    }
  });

  router.post("/api/portal/access-requests/reset-link", async (req, res) => {
    setSetupDeliveryResponseHeaders(res);
    try {
      requireNoQuery(req);
      const session = requirePortalHeaderSession(req);
      const body = requireExactBody(req, ["requestRef", "idempotencyKey", "confirmed"]);
      if (
        body.confirmed !== true
        || typeof body.requestRef !== "string"
        || body.requestRef !== body.requestRef.trim()
        || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(body.requestRef)
        || typeof body.idempotencyKey !== "string"
        || body.idempotencyKey !== body.idempotencyKey.trim()
        || !/^[A-Za-z0-9][A-Za-z0-9_-]{15,127}$/.test(body.idempotencyKey)
      ) {
        const error = new Error("subscription link reset requires exact confirmed input");
        error.code = "validation_error";
        throw error;
      }
      if (typeof accessRequests?.resetSubscriptionLink !== "function") {
        const error = new Error("portal subscription link reset service is unavailable");
        error.code = "subscription_link_reset_unavailable";
        throw error;
      }
      const request = await accessRequests.resetSubscriptionLink({
        portalUserRef: session.accountId,
        requestRef: body.requestRef,
        idempotencyKey: body.idempotencyKey,
        confirmed: true
      });
      res.json({ request });
    } catch (error) {
      sendPortalError(res, error && typeof error === "object" ? error : {});
    }
  });

  router.post("/api/portal/access-requests/disable", (req, res) => {
    try {
      if (!accessRequests || typeof accessRequests.disableSubscription !== "function") {
        const error = new Error("portal order lifecycle service is not configured");
        error.code = "validation_error";
        throw error;
      }
      res.json({
        request: accessRequests.disableSubscription(sessionScopedBody(req))
      });
    } catch (error) {
      sendPortalError(res, error);
    }
  });

  router.post("/api/portal/support-requests", (req, res) => {
    try {
      if (!supportRequests) {
        const error = new Error("portal support request service is not configured");
        error.code = "validation_error";
        throw error;
      }
      res.status(201).json({
        request: supportRequests.submitRequest(req.body ?? {})
      });
    } catch (error) {
      sendPortalError(res, error);
    }
  });

  return router;
}
