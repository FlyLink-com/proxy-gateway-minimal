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

  function subscriptionLifecycle(result) {
    const tenant = result?.tenant;
    if (!tenant || !tenant.expiresAt) {
      return null;
    }
    return {
      status: tenant.status,
      expiresAt: tenant.expiresAt,
      validUntil: tenant.expiresAt
    };
  }

  function applySubscriptionLifecycleHeaders(res, lifecycle) {
    if (!lifecycle?.expiresAt) {
      return;
    }

    const expiresAt = new Date(lifecycle.expiresAt);
    if (Number.isNaN(expiresAt.getTime())) {
      return;
    }

    const expireSeconds = Math.floor(expiresAt.getTime() / 1000);
    res.set("Subscription-Userinfo", `upload=0; download=0; total=0; expire=${expireSeconds}`);
    res.set("X-Subscription-Expires-At", expiresAt.toISOString());
    res.set("X-Subscription-Valid-Until", expiresAt.toISOString());
    res.set("Cache-Control", "no-cache, no-store, must-revalidate");
    res.set("Pragma", "no-cache");
  }

  function sendSubscriptionYaml(res, lifecycle, yaml) {
    applySubscriptionLifecycleHeaders(res, lifecycle);
    res
      .type("application/x-yaml; charset=utf-8")
      .send(yaml);
  }

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
    const lifecycle = subscriptionLifecycle(resolved.result);
    sendSubscriptionYaml(
      res,
      lifecycle,
      generateClashProviderSubscription(resolved.result.proxyConfig, { providerUrl, lifecycle })
    );
  });

  router.get("/sub/a/:artifact/provider.yaml", async (req, res) => {
    const resolved = await resolveArtifact(req, res);
    if (!resolved) {
      return;
    }

    const lifecycle = subscriptionLifecycle(resolved.result);
    sendSubscriptionYaml(
      res,
      lifecycle,
      generateClashProxyProvider(resolved.result.proxyConfig, { lifecycle })
    );
  });

  router.get("/sub/a/:artifact", async (req, res) => {
    const resolved = await resolveArtifact(req, res);
    if (!resolved) {
      return;
    }

    const lifecycle = subscriptionLifecycle(resolved.result);
    sendSubscriptionYaml(
      res,
      lifecycle,
      generateClashSubscription(resolved.result.proxyConfig, { lifecycle })
    );
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

    const lifecycle = subscriptionLifecycle(result.result);
    sendSubscriptionYaml(
      res,
      lifecycle,
      generateClashSubscription(result.result.proxyConfig, { lifecycle })
    );
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
