import { Router } from "express";

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
  if (error.code === "not_found") {
    res.status(404).json({ error: "not_found" });
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
    return {
      ...(req.body ?? {}),
      portalUserRef: session.accountId
    };
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
