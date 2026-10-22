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
  router.put("/api/admin/user-commerce/settlement-rate", usersRead, walletRead, (req, res) => {
    sendCommerce(res, () => service().updateRate(req.body));
  });
  router.post("/api/admin/user-commerce/reward-clawbacks", usersRead, walletRead, (req, res) => {
    sendCommerce(res, () => service().clawback(req.body));
  });
  return router;
}
