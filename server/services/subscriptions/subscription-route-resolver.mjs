function text(value) {
  return String(value || "").trim();
}

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function artifactSecret(value) {
  return text(value).replace(/\.yaml$/i, "");
}

function subscriptionCore(state) {
  return state.subscriptions?.core || state.subscriptions?.service;
}

function denied(result) {
  return {
    ok: false, status: result.status, error: result.error,
    ...(result.status === 403 && result.denialReason === "subscription_expired"
      ? { denialReason: "subscription_expired" } : {})
  };
}

export function bearerToken(authorization) {
  const match = /^Bearer\s+(.+)$/i.exec(String(authorization || ""));
  return match ? match[1] : "";
}

export function publicBaseUrl({ configuredBaseUrl, protocol, host }) {
  const configured = trimTrailingSlash(configuredBaseUrl);
  if (configured) {
    return configured;
  }
  return `${protocol}://${host}`;
}

export function createSubscriptionRouteResolver(state) {
  const resolveArtifact = async ({ artifact, ip = "", userAgent = "" }) => {
    const core = subscriptionCore(state);
    if (!core?.resolveSubscriptionArtifact) {
      return { ok: false, status: 404, error: "Not found" };
    }

    const rawArtifact = artifactSecret(artifact);
    if (!rawArtifact) {
      return { ok: false, status: 404, error: "Not found" };
    }

    let result;
    try {
      result = await core.resolveSubscriptionArtifact(rawArtifact, {
        ip,
        userAgent
      });
    } catch {
      return { ok: false, status: 500, error: "internal_error" };
    }

    if (!result.ok) {
      return denied(result);
    }

    return { ok: true, rawArtifact, result, proxyConfig: result.proxyConfig };
  };

  const resolveToken = async (token) => {
    const core = subscriptionCore(state);
    if (!core) {
      return { ok: false, status: 401, error: "Unauthorized" };
    }

    let result;
    try {
      result = await core.resolveSubscriptionToken(token);
    } catch {
      return { ok: false, status: 500, error: "internal_error" };
    }

    if (!result.ok) {
      return denied(result);
    }

    return { ok: true, result, proxyConfig: result.proxyConfig };
  };

  return {
    resolveArtifact,
    resolveToken
  };
}
