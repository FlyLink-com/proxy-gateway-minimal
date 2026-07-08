import { createHash } from "node:crypto";
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
import {
  summarizeUsageSamples,
  usageCycleFiltersForBinding
} from "../services/platform/usage-billing-cycle.mjs";

function safeRef(prefix, value) {
  return `${prefix}ref_${createHash("sha256").update(String(value)).digest("hex").slice(0, 16)}`;
}

function nonNegativeInteger(value) {
  const normalized = Number(value);
  return Number.isInteger(normalized) && normalized >= 0 ? normalized : 0;
}

function usageNowIso(state) {
  const nowFn = state.platform?.usageNowFn;
  const value = typeof nowFn === "function" ? nowFn() : new Date();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

export function subscriptionRoutes(state) {
  const router = Router();
  const resolver = createSubscriptionRouteResolver(state);

  function subscriptionTrafficUsage(result) {
    const controlStore = state.platform?.controlStore;
    if (
      !controlStore
      || typeof controlStore.findUsageBindingByTenantRef !== "function"
      || typeof controlStore.getUsageRollupByEdgeCredentialRef !== "function"
    ) {
      return null;
    }

    const tenantId = String(result?.tenant?.id || "").trim();
    if (!tenantId) {
      return null;
    }

    const tenantRefs = [tenantId, safeRef("tenant", tenantId)];
    try {
      for (const tenantRef of tenantRefs) {
        const binding = controlStore.findUsageBindingByTenantRef(tenantRef);
        if (!binding?.edgeCredentialRef) {
          continue;
        }
        const rollup = controlStore.getUsageRollupByEdgeCredentialRef(binding.edgeCredentialRef);
        const currentCycleUsage = currentCycleUsageFor({
          controlStore,
          binding,
          at: usageNowIso(state),
          fallbackRollup: rollup
        });
        return {
          uploadBytes: nonNegativeInteger(currentCycleUsage.uploadBytes),
          downloadBytes: nonNegativeInteger(currentCycleUsage.downloadBytes),
          totalBytes: nonNegativeInteger(binding.trafficLimitBytes)
        };
      }
    } catch {
      return null;
    }
    return null;
  }

  function subscriptionLifecycle(result) {
    const tenant = result?.tenant;
    if (!tenant || !tenant.expiresAt) {
      return null;
    }
    return {
      status: tenant.status,
      expiresAt: tenant.expiresAt,
      validUntil: tenant.expiresAt,
      usage: subscriptionTrafficUsage(result)
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
    const usage = lifecycle.usage || {};
    res.set(
      "Subscription-Userinfo",
      `upload=${nonNegativeInteger(usage.uploadBytes)}; download=${nonNegativeInteger(usage.downloadBytes)}; total=${nonNegativeInteger(usage.totalBytes)}; expire=${expireSeconds}`
    );
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

function currentCycleUsageFor({ controlStore, binding, at, fallbackRollup }) {
  if (typeof controlStore?.listUsageSamples !== "function") {
    return {
      uploadBytes: nonNegativeInteger(fallbackRollup?.uploadBytes),
      downloadBytes: nonNegativeInteger(fallbackRollup?.downloadBytes)
    };
  }
  const summary = summarizeUsageSamples(controlStore.listUsageSamples({
    requestId: binding.requestId,
    ...usageCycleFiltersForBinding(binding, at)
  }));
  return {
    uploadBytes: summary.uploadBytes,
    downloadBytes: summary.downloadBytes
  };
}
