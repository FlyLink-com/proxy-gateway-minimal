import { Router } from "express";
import {
  generateClashProviderSubscription,
  generateClashProxyProvider,
  generateClashSubscription,
  subscriptionSummary
} from "../services/clash-subscription.mjs";

function bearerToken(req) {
  const authorization = req.get("authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  return match ? match[1] : "";
}

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function publicBaseUrl(req, state) {
  const configured = trimTrailingSlash(state.subscriptions?.publicSubscriptionBaseUrl);
  if (configured) {
    return configured;
  }
  return `${req.protocol}://${req.get("host")}`;
}

function artifactSecret(value) {
  return String(value || "").replace(/\.yaml$/i, "").trim();
}

async function resolveArtifact(req, res, state) {
  const core = state.subscriptions?.core || state.subscriptions?.service;
  if (!core?.resolveSubscriptionArtifact) {
    res.status(404).json({ error: "Not found" });
    return null;
  }

  const rawArtifact = artifactSecret(req.params.artifact);
  if (!rawArtifact) {
    res.status(404).json({ error: "Not found" });
    return null;
  }

  let result;
  try {
    result = await core.resolveSubscriptionArtifact(rawArtifact, {
      ip: req.ip || req.socket?.remoteAddress || "",
      userAgent: req.get("user-agent") || ""
    });
  } catch {
    res.status(500).json({ error: "internal_error" });
    return null;
  }

  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return null;
  }

  return { rawArtifact, result };
}

export function subscriptionRoutes(state) {
  const router = Router();

  router.get("/sub/a/:artifact/profile.yaml", async (req, res) => {
    const resolved = await resolveArtifact(req, res, state);
    if (!resolved) {
      return;
    }

    const providerUrl = `${publicBaseUrl(req, state)}/sub/a/${encodeURIComponent(resolved.rawArtifact)}/provider.yaml`;
    res
      .type("application/x-yaml; charset=utf-8")
      .send(generateClashProviderSubscription(resolved.result.proxyConfig, { providerUrl }));
  });

  router.get("/sub/a/:artifact/provider.yaml", async (req, res) => {
    const resolved = await resolveArtifact(req, res, state);
    if (!resolved) {
      return;
    }

    res
      .type("application/x-yaml; charset=utf-8")
      .send(generateClashProxyProvider(resolved.result.proxyConfig));
  });

  router.get("/sub/a/:artifact", async (req, res) => {
    const resolved = await resolveArtifact(req, res, state);
    if (!resolved) {
      return;
    }

    res
      .type("application/x-yaml; charset=utf-8")
      .send(generateClashSubscription(resolved.result.proxyConfig));
  });

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
