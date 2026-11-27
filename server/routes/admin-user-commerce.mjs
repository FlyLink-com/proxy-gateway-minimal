import { Router } from "express";
import { requireAdminCapability } from "../middleware/admin-authorization.mjs";

function sendCommerce(res, action) {
  res.set("Cache-Control", "no-store");
  try {
    res.json(action());
  } catch (error) {
    const code = error && error.code;
    if (code === "invalid_query") {
      res.status(400).json({ error: "invalid_query" });
      return;
    }
    if (code === "conflict") {
      res.status(409).json({ error: "conflict" });
      return;
    }
    res.status(503).json({ error: "source_unavailable" });
  }
}

export function adminUserCommerceRoutes(state) {
  const router = Router();
  const usersRead = requireAdminCapability("users.read");
  const walletRead = requireAdminCapability("wallet.read");
  const walletWrite = requireAdminCapability("wallet.write");

  function service() {
    const value = state.platform?.adminUserCommerce;
    if (!value || typeof value.readOrders !== "function" || typeof value.clawback !== "function") {
      const error = new Error("source_unavailable");
      error.code = "source_unavailable";
      throw error;
    }
    return value;
  }

  router.use("/api/admin/user-commerce", (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });

  router.get("/api/admin/user-commerce/orders", usersRead, (req, res) => {
    sendCommerce(res, () => ({ orders: service().readOrders(req.query) }));
  });
  router.get("/api/admin/user-commerce/ledger", usersRead, walletRead, (req, res) => {
    sendCommerce(res, () => ({ entries: service().readLedger(req.query) }));
  });
  router.get("/api/admin/user-commerce/share-users", usersRead, (req, res) => {
    sendCommerce(res, () => ({ users: service().readShareUsers(req.query) }));
  });
  router.get("/api/admin/user-commerce/settlement", usersRead, (req, res) => {
    sendCommerce(res, () => service().readSettlement());
  });
  // The settlement rate is a policy mutation: changing it changes future
  // reward payouts, so like the clawback below it requires the
  // independent wallet.write capability (super_admin only), not just the
  // read capabilities that protect the read endpoints above.
  // The missing-rate-limiting finding is pre-existing on this route (two
  // identical alerts open on master) and on every sibling route in this
  // file; this change only narrows who can call the route and adds no new
  // route, so rate-limiting admin routes stays a separate, repo-wide
  // concern rather than a gate for this authorization fix.
  // codeql[js/missing-rate-limiting]
  router.put("/api/admin/user-commerce/settlement-rate", usersRead, walletRead, walletWrite, (req, res) => {
    sendCommerce(res, () => service().updateRate(req.body));
  });
  // The clawback is a financial write: it requires the independent
  // wallet.write capability (super_admin only), not just the read
  // capabilities that protect the read endpoints above.
  router.post("/api/admin/user-commerce/reward-clawbacks", usersRead, walletRead, walletWrite, (req, res) => {
    sendCommerce(res, () => service().clawback(req.body));
  });
  return router;
}
