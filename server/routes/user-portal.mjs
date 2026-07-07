import { Router } from "express";

const PAID_PORTAL_PLANS = new Set(["monthly", "monthly_basic", "monthly_plus", "yearly"]);

function optionalText(value) {
  const normalized = String(value || "").trim();
  return normalized || "";
}

function entitlementRefFor(entitlement) {
  return optionalText(entitlement?.id || entitlement?.entitlementRef);
}

function entitlementTrafficGb(entitlement) {
  const rawValue = entitlement?.quota?.trafficGb ?? entitlement?.trafficGb;
  const value = Number(rawValue);
  return Number.isFinite(value) ? value : 0;
}

function entitlementValidUntil(entitlement) {
  const validUntil = optionalText(entitlement?.validUntil);
  if (!validUntil) {
    return "";
  }
  const date = new Date(validUntil);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function isUsablePortalEntitlement(entitlement, plan, now = new Date()) {
  if (!entitlementRefFor(entitlement)) {
    return false;
  }
  if (optionalText(entitlement?.status) !== "active" || entitlement?.usable !== true) {
    return false;
  }
  const entitlementPlan = optionalText(entitlement?.plan);
  if (entitlementPlan && entitlementPlan !== plan) {
    return false;
  }
  if (entitlementTrafficGb(entitlement) <= 0) {
    return false;
  }
  const validUntil = entitlementValidUntil(entitlement);
  return validUntil ? new Date(validUntil).getTime() > now.getTime() : false;
}

function sendPortalError(res, error) {
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
  if (error.code === "legal_agreement_required") {
    res.status(400).json({ error: "legal_agreement_required" });
    return;
  }
  if (error.code === "account_already_exists") {
    res.status(409).json({ error: "account_already_exists" });
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
  if (error.code === "payment_provider_checkout_unavailable") {
    res.status(503).json({ error: "payment_provider_checkout_unavailable" });
    return;
  }
  if (error.code === "not_found") {
    res.status(404).json({ error: "not_found" });
    return;
  }
  if (error.code === "subscription_limit_exceeded") {
    res.status(409).json({ error: "subscription_limit_exceeded" });
    return;
  }
  res.status(500).json({ error: "internal_error" });
}

export function userPortalRoutes(state, options = {}) {
  const router = Router();
  const auth = options.userPortalAuth || state.platform?.userPortalAuth;
  const accessRequests = options.portalAccessRequests || state.platform?.portalAccessRequests;
  const registrations = options.portalRegistrations || state.platform?.portalRegistrations;
  const registrationEmailVerifications = options.portalRegistrationEmailVerifications
    || state.platform?.portalRegistrationEmailVerifications;
  const supportRequests = options.portalSupportRequests || state.platform?.portalSupportRequests;
  const humanChallenges = options.portalHumanChallenges || state.platform?.portalHumanChallenges;
  const portalPayments = options.portalPayments || state.platform?.portalPayments;
  const accountEntitlements = options.accountEntitlements || state.platform?.accountShell;

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
    return req.get("x-portal-session") || req.body?.sessionRef || req.query?.sessionRef;
  }

  function requirePortalSession(req) {
    requireAuthService();
    if (typeof auth.requireSession !== "function") {
      const error = new Error("portal session service is not configured");
      error.code = "validation_error";
      throw error;
    }
    return auth.requireSession({ sessionRef: portalSessionRef(req) });
  }

  function sessionScopedBody(req) {
    const session = requirePortalSession(req);
    const {
      accessGrantRef,
      artifactId,
      entitlementId,
      entitlementRef,
      entitlementValidUntil,
      expiresAt,
      nextAction,
      reviewedAt,
      reviewedByRef,
      status,
      subscriptionUrl,
      tenantId,
      validUntil,
      ...body
    } = req.body ?? {};
    return {
      ...body,
      portalUserRef: session.accountId
    };
  }

  function paidSetupEntitlementFor(portalUserRef, plan) {
    const normalizedPlan = optionalText(plan);
    if (!PAID_PORTAL_PLANS.has(normalizedPlan)) {
      return null;
    }
    if (!accountEntitlements || typeof accountEntitlements.listEntitlements !== "function") {
      return null;
    }
    return (accountEntitlements.listEntitlements({ accountId: portalUserRef }) || [])
      .filter((entitlement) => isUsablePortalEntitlement(entitlement, normalizedPlan))
      .sort((a, b) =>
        entitlementValidUntil(b).localeCompare(entitlementValidUntil(a))
        || entitlementRefFor(b).localeCompare(entitlementRefFor(a))
      )[0] || null;
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
        requestContext: requestContext(req)
      });
      if (result.session) {
        res.json({ session: result.session });
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
      res.json({ session: result.session });
    } catch (error) {
      sendPortalError(res, error);
    }
  });

  router.get("/api/portal/security/current", (req, res) => {
    try {
      requireAuthService();
      res.json(auth.getSecurityState({
        sessionRef: portalSessionRef(req)
      }));
    } catch (error) {
      sendPortalError(res, error);
    }
  });

  router.post("/api/portal/security/totp/enrollment", (req, res) => {
    try {
      requireAuthService();
      res.status(201).json(auth.startTotpEnrollment({
        sessionRef: portalSessionRef(req)
      }));
    } catch (error) {
      sendPortalError(res, error);
    }
  });

  router.post("/api/portal/security/totp/enrollment/confirm", (req, res) => {
    try {
      requireAuthService();
      res.json(auth.confirmTotpEnrollment({
        sessionRef: portalSessionRef(req),
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
      res.status(201).json(registrations.submitRegistration({
        ...(req.body ?? {}),
        requestContext: requestContext(req)
      }));
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
      res.json({ session: session.session });
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
      const scopedBody = sessionScopedBody(req);
      const entitlement = paidSetupEntitlementFor(scopedBody.portalUserRef, scopedBody.plan);
      const entitlementRef = entitlementRefFor(entitlement);
      res.status(201).json({
        request: accessRequests.submitRequest({
          ...scopedBody,
          ...(entitlementRef
            ? {
                entitlementRef,
                entitlementValidUntil: entitlementValidUntil(entitlement)
              }
            : {})
        })
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
      res.json({
        items,
        accountEntitlements: accountEntitlements && typeof accountEntitlements.listEntitlements === "function"
          ? accountEntitlements.listEntitlements({ accountId: portalUserRef })
          : []
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

  router.post("/api/portal/access-requests/reveal", (req, res) => {
    try {
      if (!accessRequests || typeof accessRequests.revealSubscription !== "function") {
        const error = new Error("portal order lifecycle service is not configured");
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

  router.post("/api/portal/payments/checkout", async (req, res) => {
    try {
      if (!portalPayments || typeof portalPayments.createCheckout !== "function") {
        const error = new Error("portal payment service is not configured");
        error.code = "validation_error";
        throw error;
      }
      const session = requirePortalSession(req);
      const checkout = await portalPayments.createCheckout({
        ...(req.body ?? {}),
        portalUserRef: session.accountId,
        clientIp: req.ip
      });
      res.status(201).json({ checkout });
    } catch (error) {
      sendPortalError(res, error);
    }
  });

  router.get("/api/portal/payments/current", (req, res) => {
    try {
      if (!portalPayments || typeof portalPayments.listOrders !== "function") {
        const error = new Error("portal payment service is not configured");
        error.code = "validation_error";
        throw error;
      }
      const session = requirePortalSession(req);
      res.json({
        payments: {
          orders: portalPayments.listOrders({
            portalUserRef: session.accountId,
            status: req.query.status,
            plan: req.query.plan,
            includePaymentArtifacts: true
          }),
          safety: {
            sessionScoped: true,
            noRawMerchantKey: true,
            noRawProviderPayload: true
          }
        }
      });
    } catch (error) {
      sendPortalError(res, error);
    }
  });

  router.post("/api/portal/payments/notify", (req, res) => {
    try {
      if (!portalPayments || typeof portalPayments.handleNotification !== "function") {
        const error = new Error("portal payment service is not configured");
        error.code = "validation_error";
        throw error;
      }
      portalPayments.handleNotification(req.body ?? {});
      res.type("text/plain").send("success");
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
