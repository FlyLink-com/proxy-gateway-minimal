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
  const accessRequests = options.portalAccessRequests || state.platform?.portalAccessRequests;

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

  router.post("/api/portal/access-requests", (req, res) => {
    try {
      if (!accessRequests) {
        const error = new Error("portal access request service is not configured");
        error.code = "validation_error";
        throw error;
      }
      res.status(201).json({
        request: accessRequests.submitRequest(req.body ?? {})
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
      const portalUserRef = String(req.query.portalUserRef || "").trim();
      res.json({ items: accessRequests.listRequests({ portalUserRef }) });
    } catch (error) {
      sendPortalError(res, error);
    }
  });

  return router;
}
