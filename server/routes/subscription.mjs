import { createHash } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { Router } from "express";
import {
  generateClashProviderSubscription,
  generateClashProxyProvider,
  generateClashSubscription,
  subscriptionSummary
} from "../services/clash-subscription.mjs";
import {
  createSubscriptionRouteResolver,
  publicBaseUrl
} from "../services/subscriptions/subscription-route-resolver.mjs";
import {
  summarizeUsageSamples,
  usageCycleFiltersForBinding
} from "../services/platform/usage-billing-cycle.mjs";
import {
  generateSubscriptionExpiryNotice,
  SUBSCRIPTION_RENEWAL_URL
} from "../services/subscription-expiry-notice.mjs";
import { applyThirdPartyProxyConfig } from "../services/platform/third-party-subscription-render.mjs";

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

export function subscriptionRoutes(state, options = {}) {
  const router = Router();
  const resolver = createSubscriptionRouteResolver(state);
  const resolveClientIpFn = typeof options.resolveClientIpFn === "function"
    ? options.resolveClientIpFn
    : (req) => req.ip || req.socket?.remoteAddress || "";

  async function subscriptionTrafficUsage(result) {
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
    let at;
    try {
      at = usageNowIso(state);
    } catch {
      return null;
    }
    if (options.d1UsageRead === true
      && controlStore.d1SubscriptionUsageReadAvailable === true
      && typeof controlStore.findUsageBindingByTenantRefAsync === "function"
      && typeof controlStore.getUsageRollupByEdgeCredentialRefAsync === "function") {
      // Bound the optional lookup for the whole response, not per query.
      const controller = new AbortController();
      const timer = new AbortController();
      const deadline = sleep(500, null, { signal: timer.signal }).then(() => {
        controller.abort();
        return null;
      }, () => null);
      try {
        const usage = await Promise.race([
          readD1Usage(controlStore, tenantRefs, at, controller.signal),
          deadline
        ]);
        if (usage) return usage;
      } catch {
        // Keep delivery on its established BWH path if a staged D1 read fails.
      } finally {
        timer.abort();
        controller.abort();
      }
    }
    try {
      const selected = preferredUsageBinding(controlStore, tenantRefs);
      if (!selected) return null;
      const { binding } = selected;
      const rollup = controlStore.getUsageRollupByEdgeCredentialRef(binding.edgeCredentialRef);
      const currentCycleUsage = currentCycleUsageFor({
        controlStore, binding, at, fallbackRollup: rollup
      });
      return {
        uploadBytes: nonNegativeInteger(currentCycleUsage.uploadBytes),
        downloadBytes: nonNegativeInteger(currentCycleUsage.downloadBytes),
        totalBytes: nonNegativeInteger(binding.trafficLimitBytes)
      };
    } catch {
      return null;
    }
    return null;
  }

  async function subscriptionLifecycle(result) {
    const tenant = result?.tenant;
    if (!tenant || !tenant.expiresAt) {
      return null;
    }
    return {
      status: tenant.status,
      expiresAt: tenant.expiresAt,
      validUntil: tenant.expiresAt,
      usage: await subscriptionTrafficUsage(result)
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
      .set("Profile-Web-Page-Url", "https://www.gccwebos.com/")
      .type("application/x-yaml; charset=utf-8")
      .send(yaml);
  }

  function sendResolutionFailure(res, resolved, { providerOnly = false } = {}) {
    if (resolved.status === 403 && resolved.denialReason === "subscription_expired") {
      res
        .set("Cache-Control", "no-cache, no-store, must-revalidate")
        .set("Pragma", "no-cache")
        .set("Profile-Web-Page-Url", SUBSCRIPTION_RENEWAL_URL)
        .set("X-Subscription-Status", "expired")
        .type("application/x-yaml; charset=utf-8")
        .send(generateSubscriptionExpiryNotice({ providerOnly }));
      return;
    }
    res.status(resolved.status).json({ error: resolved.error });
  }

  async function resolveArtifact(req, res, options) {
    const resolved = await resolver.resolveArtifact({
      artifact: req.params.artifact,
      ip: resolveClientIpFn(req),
      userAgent: req.get("user-agent") || ""
    });
    if (!resolved.ok) {
      sendResolutionFailure(res, resolved, options);
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
    const lifecycle = await subscriptionLifecycle(resolved.result);
    const proxyConfig = applyThirdPartyProxyConfig(state, resolved.result);
    sendSubscriptionYaml(
      res,
      lifecycle,
      generateClashProviderSubscription(proxyConfig, { providerUrl, lifecycle })
    );
  });

  router.get("/sub/a/:artifact/provider.yaml", async (req, res) => {
    const resolved = await resolveArtifact(req, res, { providerOnly: true });
    if (!resolved) {
      return;
    }

    const lifecycle = await subscriptionLifecycle(resolved.result);
    const proxyConfig = applyThirdPartyProxyConfig(state, resolved.result);
    sendSubscriptionYaml(
      res,
      lifecycle,
      generateClashProxyProvider(proxyConfig, { lifecycle })
    );
  });

  router.get("/sub/a/:artifact", async (req, res) => {
    const resolved = await resolveArtifact(req, res);
    if (!resolved) {
      return;
    }

    const lifecycle = await subscriptionLifecycle(resolved.result);
    const proxyConfig = applyThirdPartyProxyConfig(state, resolved.result);
    sendSubscriptionYaml(
      res,
      lifecycle,
      generateClashSubscription(proxyConfig, { lifecycle })
    );
  });

  router.get("/sub/clash.yaml", async (req, res) => {
    const token = typeof req.query.token === "string" ? req.query.token : "";

    if (!token) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const result = await resolver.resolveToken(token);
    if (!result.ok) {
      sendResolutionFailure(res, result);
      return;
    }

    const lifecycle = await subscriptionLifecycle(result.result);
    const proxyConfig = applyThirdPartyProxyConfig(state, result.result);
    sendSubscriptionYaml(
      res,
      lifecycle,
      generateClashSubscription(proxyConfig, { lifecycle })
    );
  });

  router.get("/api/subscription/status", (_req, res) => {
    res.json(subscriptionSummary({
      proxyConfig: state.proxyConfig
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


function preferredUsageBinding(controlStore, tenantRefs) {
  for (const tenantRef of tenantRefs) {
    const binding = controlStore.findUsageBindingByTenantRef(tenantRef);
    if (binding?.edgeCredentialRef) return { tenantRef, binding };
  }
  return null;
}

function usageBindingsMatch(local, remote) {
  return local && [
    "tenantRef", "linkId", "requestId", "accountId", "entitlementId", "edgeCredentialRef",
    "plan", "validFrom", "validUntil", "trafficLimitBytes"
  ].every(key => local[key] === remote[key]);
}

async function readD1Usage(controlStore, tenantRefs, at, signal) {
  // The serving path keeps BWH's alias precedence. A staged D1 miss
  // on that binding must not lead to a different tenant alias.
  const selected = preferredUsageBinding(controlStore, tenantRefs);
  if (!selected) return null;
  signal.throwIfAborted();
  const { tenantRef } = selected;
  const binding = await controlStore.findUsageBindingByTenantRefAsync(tenantRef, { signal });
  signal.throwIfAborted();
  if (!binding?.edgeCredentialRef || !binding.requestId || !binding.entitlementId
    || binding.tenantRef !== tenantRef || binding.requestStatus !== "issued"
    || binding.entitlementStatus !== "active" || !usageBindingsMatch(selected.binding, binding)) {
    return null;
  }

  let usage;
  const useCycleSamples = typeof controlStore.listUsageSamples === "function";
  if (!useCycleSamples) {
    usage = await controlStore.getUsageRollupByEdgeCredentialRefAsync(
      binding.edgeCredentialRef, { signal }
    );
    signal.throwIfAborted();
    if (!usage || usage.requestId !== binding.requestId
      || usage.edgeCredentialRef !== binding.edgeCredentialRef) return null;
  }
  // Recheck BWH after the await so a concurrent change in local preference
  // or billing fields does not turn a previously matching comparison stale.
  const current = preferredUsageBinding(controlStore, tenantRefs);
  if (current?.tenantRef !== tenantRef || !usageBindingsMatch(current.binding, binding)) return null;
  if (useCycleSamples) usage = currentCycleUsageFor({ controlStore, binding: current.binding, at });
  return {
    uploadBytes: nonNegativeInteger(usage.uploadBytes),
    downloadBytes: nonNegativeInteger(usage.downloadBytes),
    totalBytes: nonNegativeInteger(current.binding.trafficLimitBytes)
  };
}
