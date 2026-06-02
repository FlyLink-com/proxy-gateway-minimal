import { Router } from "express";
import {
  generateClashProviderSubscription,
  generateClashProxyProvider,
  generateClashSubscription,
  subscriptionSummary
} from "../services/clash-subscription.mjs";
import {
  bearerToken,
  createSubscriptionRouteResolver,
  publicBaseUrl
} from "../services/subscriptions/subscription-route-resolver.mjs";

export function subscriptionRoutes(state) {
  const router = Router();
  const resolver = createSubscriptionRouteResolver(state);

  async function resolveArtifact(req, res) {
    const resolved = await resolver.resolveArtifact({
      artifact: req.params.artifact,
      ip: req.ip || req.socket?.remoteAddress || "",
      userAgent: req.get("user-agent") || ""
    });
    if (!resolved.ok) {
      res.status(resolved.status).json({ error: resolved.error });
      return null;
    }
    return resolved;
  }

  router.get("/sub/a/:artifact/profile.yaml", async (req, res) => {
    const resolved = await resolveArtifact(req, res);
    if (!resolved) {
      return;
    }

    const providerUrl = `${publicBaseUrl({
      configuredBaseUrl: state.subscriptions?.publicSubscriptionBaseUrl,
      protocol: req.protocol,
      host: req.get("host")
    })}/sub/a/${encodeURIComponent(resolved.rawArtifact)}/provider.yaml`;
    res
      .type("application/x-yaml; charset=utf-8")
      .send(generateClashProviderSubscription(resolved.result.proxyConfig, { providerUrl }));
  });

  router.get("/sub/a/:artifact/provider.yaml", async (req, res) => {
    const resolved = await resolveArtifact(req, res);
    if (!resolved) {
      return;
    }

    res
      .type("application/x-yaml; charset=utf-8")
      .send(generateClashProxyProvider(resolved.result.proxyConfig));
  });

  router.get("/sub/a/:artifact", async (req, res) => {
    const resolved = await resolveArtifact(req, res);
    if (!resolved) {
      return;
    }

    res
      .type("application/x-yaml; charset=utf-8")
      .send(generateClashSubscription(resolved.result.proxyConfig));
  });

  router.get("/sub/clash.yaml", async (req, res) => {
    const token = typeof req.query.token === "string" ? req.query.token : "";
    const bearer = bearerToken(req.get("authorization") || "");

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

    const result = await resolver.resolveToken(token);
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    res
      .type("application/x-yaml; charset=utf-8")
      .send(generateClashSubscription(result.result.proxyConfig));
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
