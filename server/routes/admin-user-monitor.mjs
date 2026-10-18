import { Router } from "express";
import { requireAdminCapability } from "../middleware/admin-authorization.mjs";
import { createAdminUserMonitorService } from "../services/platform/admin-user-monitor.mjs";

function sendMonitor(res, action) {
  res.set("Cache-Control", "no-store");
  try {
    res.json(action());
  } catch (error) {
    const code = error && error.code;
    if (code === "invalid_query") {
      res.status(400).json({ error: "invalid_query" });
      return;
    }
    if (code === "account_not_found") {
      res.status(404).json({ error: "account_not_found" });
      return;
    }
    res.status(503).json({ error: "source_unavailable" });
  }
}

export function adminUserMonitorRoutes(state) {
  const router = Router();
  const usersRead = requireAdminCapability("users.read");
  const walletRead = requireAdminCapability("wallet.read");
  const runtimeRead = requireAdminCapability("runtime.read");

  function service() {
    return createAdminUserMonitorService({
      controlStore: state.platform?.controlStore ?? null,
      coinsWalletStore: state.platform?.coinsWalletStore ?? null
    });
  }

  router.use("/api/admin/platform/user-monitor", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    try {
      decodeURIComponent(req.originalUrl.split("?")[0]);
    } catch {
      res.status(400).json({ error: "invalid_query" });
      return;
    }
    next();
  });

  router.get(
    "/api/admin/platform/user-monitor/growth",
    usersRead,
    (req, res) => sendMonitor(res, () => service().readGrowth(req.query))
  );
  router.all(
    "/api/admin/platform/user-monitor/usage-ledger-summary",
    usersRead,
    runtimeRead,
    async (req, res) => {
      // A fixed manual read, not a caller-configurable SQL/report endpoint.
      // Express treats HEAD as GET unless explicitly excluded here.
      if (req.method !== "GET") {
        res.set("Allow", "GET").status(405).json({ error: "method_not_allowed" });
        return;
      }
      if (req.originalUrl.includes("?") || req.headers["transfer-encoding"]
        || (req.headers["content-length"] && req.headers["content-length"] !== "0")) {
        res.status(400).json({ error: "invalid_query" });
        return;
      }
      const controller = new AbortController();
      const abort = () => controller.abort();
      const onClose = () => { if (!res.writableEnded) abort(); };
      req.once("aborted", abort);
      res.once("close", onClose);
      if (req.aborted || res.destroyed) abort();
      try {
        const reader = state.platform?.adminUsageLedger;
        if (!reader || typeof reader.read !== "function") throw new Error("unavailable");
        const summary = await reader.read({ signal: controller.signal });
        if (!controller.signal.aborted && !res.destroyed) res.json(summary);
      } catch {
        if (!controller.signal.aborted && !res.destroyed) {
          res.status(503).json({ error: "source_unavailable" });
        }
      } finally {
        req.removeListener("aborted", abort);
        res.removeListener("close", onClose);
      }
    }
  );
  router.get(
    "/api/admin/platform/user-monitor/accounts",
    usersRead,
    (req, res) => sendMonitor(res, () => service().readAccounts(req.query))
  );
  router.get(
    "/api/admin/platform/user-monitor/accounts/:accountId/coins",
    usersRead,
    walletRead,
    (req, res) => sendMonitor(res, () => service().readCoins(req.params.accountId, req.query))
  );
  router.get(
    "/api/admin/platform/user-monitor/accounts/:accountId/traffic",
    usersRead,
    runtimeRead,
    (req, res) => sendMonitor(res, () => service().readTraffic(req.params.accountId, req.query))
  );
  return router;
}
