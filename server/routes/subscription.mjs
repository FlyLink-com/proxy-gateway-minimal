import { Router } from "express";
import { generateClashSubscription, subscriptionSummary } from "../services/clash-subscription.mjs";

function bearerToken(req) {
  const authorization = req.get("authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  return match ? match[1] : "";
}

export function subscriptionRoutes(state) {
  const router = Router();

  router.get("/sub/clash.yaml", async (req, res) => {
    const token = typeof req.query.token === "string" ? req.query.token : "";
    const bearer = bearerToken(req);

    if (token === state.consoleToken || bearer === state.consoleToken) {
      res
        .type("application/x-yaml; charset=utf-8")
        .send(generateClashSubscription(state.proxyConfig));
      return;
    }

    if (!token) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const core = state.subscriptions?.core || state.subscriptions?.service;
    if (!core) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    let result;
    try {
      result = await core.resolveSubscriptionToken(token);
    } catch {
      res.status(500).json({ error: "internal_error" });
      return;
    }

    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    res
      .type("application/x-yaml; charset=utf-8")
      .send(generateClashSubscription(result.proxyConfig));
  });

  router.get("/api/subscription/status", (_req, res) => {
    res.json(subscriptionSummary({
      proxyConfig: state.proxyConfig,
      host: state.host,
      consolePort: state.ports.console,
      consoleToken: state.consoleToken
    }));
  });

  return router;
}
