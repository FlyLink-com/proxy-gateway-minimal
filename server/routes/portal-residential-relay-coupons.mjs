import { Router } from "express";

// Buyer-side, owner-only coupon listing. The account is taken exclusively from
// the authenticated Portal session; no query/body account selector exists.
const SESSION_REFERENCE = /^[a-z][a-z0-9_]{2,95}$/;
const PATH = "/api/portal/residential-relay-packs/coupons";

function sendError(res, status, code) {
  res.set("Cache-Control", "no-store");
  res.status(status).json({ error: code });
}

function sessionHeader(req) {
  const raw = Array.isArray(req.rawHeaders) ? req.rawHeaders : [];
  let value = null;
  let count = 0;
  for (let i = 0; i + 1 < raw.length; i += 2) {
    if (typeof raw[i] === "string" && raw[i].toLowerCase() === "x-portal-session") { count += 1; value = raw[i + 1]; }
  }
  return count === 1 && typeof value === "string" ? value : null;
}

function storeOf(state) {
  const feature = state?.residentialRelayPack;
  if (!feature?.enabled || feature.available !== true || !feature.store
    || typeof feature.store.listAccountCoupons !== "function") return null;
  return feature.store;
}

export function portalResidentialRelayCouponRoutes(state, { browserSessions } = {}) {
  const router = Router();
  router.get(PATH, (req, res) => {
    res.set("Cache-Control", "no-store");
    const store = storeOf(state);
    const auth = state?.platform?.userPortalAuth;
    if (!store || typeof auth?.requireSession !== "function") { sendError(res, 503, "residential_relay_unavailable"); return; }
    if (Object.keys(req.query || {}).length > 0) { sendError(res, 400, "invalid_input"); return; }
    let session;
    try {
      const browser = browserSessions?.session?.(req) ?? null;
      if (browser) session = browser;
      else {
        const header = sessionHeader(req);
        if (!header || !SESSION_REFERENCE.test(header)) { sendError(res, 401, "invalid_session"); return; }
        session = auth.requireSession({ sessionRef: header });
        if (!session || session.sessionRef !== header) throw new Error("session mismatch");
      }
    } catch { sendError(res, 401, "invalid_session"); return; }
    const accountRef = session?.accountId;
    if (typeof accountRef !== "string" || !accountRef) { sendError(res, 401, "invalid_session"); return; }
    try {
      res.json(store.listAccountCoupons({ accountRef }));
    } catch (error) {
      sendError(res, error?.code === "invalid_account" ? 401 : 503,
        error?.code === "invalid_account" ? "invalid_session" : "residential_relay_unavailable");
    }
  });
  return router;
}
