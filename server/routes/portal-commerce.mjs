import { Router } from "express";
import { isCoinsCommerceReplayResult } from "../services/platform/coins-commerce-service.mjs";

function sendError(res, error) {
  const code = error?.code;
  const status = code === "invalid_session" ? 401
    : code === "not_found" ? 404
      : code === "idempotency_conflict" || code === "insufficient_coins" || code === "payment_switch_blocked" ? 409
        : code === "validation_error" ? 400 : 500;
  const body = { error: code && status !== 500 ? code : "internal_error" };
  if (code === "insufficient_coins" && error.details?.shortfallCoins !== undefined) {
    body.recovery = { type: "go_to_recharge", shortfallCoins: error.details.shortfallCoins };
  }
  res.status(status).json(body);
}

function requireIdempotency(req) {
  const value = req.get("idempotency-key");
  if (!value) { const error = new Error("missing idempotency key"); error.code = "validation_error"; throw error; }
  return value;
}

export function portalCommerceRoutes(state, options = {}) {
  const router = Router();
  const auth = options.userPortalAuth || state.platform?.userPortalAuth;
  const service = options.platformCoinsCommerceService || state.platform?.coinsCommerceService;

  function account(req) {
    if (!auth?.requireSession) { const error = new Error("portal auth unavailable"); error.code = "invalid_session"; throw error; }
    if (req.body && ["accountRef", "userRef", "portalUserRef", "sessionRef"].some((key) => Object.hasOwn(req.body, key))) {
      const error = new Error("account ownership is session-scoped"); error.code = "validation_error"; throw error;
    }
    if (["accountRef", "userRef", "portalUserRef", "sessionRef"].some((key) => Object.hasOwn(req.query ?? {}, key))) {
      const error = new Error("account ownership is session-scoped"); error.code = "validation_error"; throw error;
    }
    const session = auth.requireSession({ sessionRef: req.get("x-portal-session") });
    if (!session?.accountId) { const error = new Error("invalid session"); error.code = "invalid_session"; throw error; }
    return session.accountId;
  }
  function call(method, input) {
    if (!service || typeof service[method] !== "function") { const error = new Error("commerce unavailable"); error.code = "validation_error"; throw error; }
    return service[method](input);
  }
  async function write(req, res, { method, input }) {
    const accountRef = account(req);
    const idempotencyKey = requireIdempotency(req);
    const result = await call(method, input({ accountRef, idempotencyKey }));
    res.status(isCoinsCommerceReplayResult(result) ? 200 : 201).json(result);
  }
  const get = (method) => (req, res) => { try { res.json(call(method, { accountRef: account(req) })); } catch (e) { sendError(res, e); } };
  router.get("/api/portal/commerce/wallet", get("getWallet"));
  router.get("/api/portal/commerce/catalog", get("getCatalog"));
  router.get("/api/portal/commerce/orders", get("listOrders"));
  router.get("/api/portal/commerce/referral", get("getReferralSummary"));
  router.post("/api/portal/commerce/orders", async (req, res) => { try { await write(req, res, { method: "createProductOrder", input: ({ accountRef, idempotencyKey }) => ({ accountRef, offerVersionRef: req.body?.offerVersionRef, idempotencyKey }) }); } catch (e) { sendError(res, e); } });
  router.post("/api/portal/commerce/recharge-orders", async (req, res) => { try { await write(req, res, { method: "createRechargeOrder", input: ({ accountRef, idempotencyKey }) => ({ accountRef, rechargeOfferRef: req.body?.rechargeOfferRef, preferredProviderId: req.body?.preferredProviderId ?? null, idempotencyKey }) }); } catch (e) { sendError(res, e); } });
  router.get("/api/portal/commerce/payment-attempts/:attemptRef", async (req, res) => { try { res.json(await call("getPaymentAttempt", { accountRef: account(req), attemptRef: req.params.attemptRef })); } catch (e) { sendError(res, e); } });
  router.post("/api/portal/commerce/payment-attempts/:attemptRef/switch", async (req, res) => { try { await write(req, res, { method: "switchPaymentAttempt", input: ({ accountRef, idempotencyKey }) => ({ accountRef, attemptRef: req.params.attemptRef, targetProviderId: req.body?.targetProviderId, idempotencyKey }) }); } catch (e) { sendError(res, e); } });
  return router;
}
