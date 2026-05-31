import { Router } from "express";

function sendPortalError(res, error) {
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
  const subscriptions = options.userPortalSubscriptions || state.platform?.userPortalSubscriptions;

  router.post("/api/portal/entry/enroll", (req, res) => {
    try {
      const enrollment = auth.enrollTotpCredential({
        entryToken: req.body?.entryToken,
        encryptedTotpSecret: req.body?.encryptedTotpSecret
      });
      res.json({ enrollment: enrollment.summary });
    } catch (error) {
      sendPortalError(res, error);
    }
  });

  router.post("/api/portal/session", (req, res) => {
    try {
      const session = auth.verifyTotpAndCreateSession({
        accountId: req.body?.accountId,
        code: req.body?.code
      });
      res.json({ session: session.session });
    } catch (error) {
      sendPortalError(res, error);
    }
  });

  router.post("/api/portal/subscriptions/summary", (req, res) => {
    try {
      if (!subscriptions) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      const summary = subscriptions.getSubscriptionSummary({
        sessionRef: req.body?.sessionRef
      });
      res.json({ summary });
    } catch (error) {
      sendPortalError(res, error);
    }
  });

  router.post("/api/portal/subscriptions/refresh", (req, res) => {
    try {
      if (!subscriptions) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      const refresh = subscriptions.requestSubscriptionRefresh({
        sessionRef: req.body?.sessionRef,
        entitlementId: req.body?.entitlementId
      });
      res.json({ refresh });
    } catch (error) {
      sendPortalError(res, error);
    }
  });

  return router;
}
