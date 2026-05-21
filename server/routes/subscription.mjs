import { Router } from "express";
import { generateClashSubscription, subscriptionSummary } from "../services/clash-subscription.mjs";

export function subscriptionRoutes(state) {
  const router = Router();

  router.get("/sub/clash.yaml", (_req, res) => {
    res
      .type("application/x-yaml; charset=utf-8")
      .send(generateClashSubscription(state.proxyConfig));
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
