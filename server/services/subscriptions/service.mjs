import { randomUUID } from "node:crypto";
import { computeSubscriptionStatus } from "./status.mjs";
import {
  createSubscriptionToken,
  hashSubscriptionToken,
  verifySubscriptionToken
} from "./tokens.mjs";

const DEFAULT_EXPIRING_DAYS = 7;
const SHARED_NODE_MODE = "shared-node";
const ISO_DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

function serviceError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function validationError(message) {
  return serviceError(message, "validation_error");
}

function notFoundError(id) {
  return serviceError(`Subscription tenant not found: ${id}`, "not_found");
}

function isoNow(nowFn) {
  const now = nowFn();
  return now instanceof Date ? now.toISOString() : new Date(now).toISOString();
}

function normalizeDisplayName(displayName) {
  const normalized = String(displayName ?? "").trim();
  if (!normalized) {
    throw validationError("displayName is required");
  }
  if (normalized.length > 80) {
    throw validationError("displayName must be at most 80 characters");
  }
  return normalized;
}

function normalizeExpiresAt(expiresAt) {
  const match = ISO_DATE_TIME_PATTERN.exec(String(expiresAt || ""));
  if (!match) {
    throw validationError("expiresAt must be a valid ISO date");
  }
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  if (
    month < 1 || month > 12 ||
    day < 1 || day > daysInMonth ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    throw validationError("expiresAt must be a valid ISO date");
  }

  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) {
    throw validationError("expiresAt must be a valid ISO date");
  }
  return date.toISOString();
}

function normalizeNote(note = "") {
  const normalized = String(note ?? "").trim();
  if (normalized.length > 500) {
    throw validationError("note must be at most 500 characters");
  }
  return normalized;
}

function namedServers(proxyConfig) {
  return (proxyConfig.servers || []).filter((server) => String(server.name || "").trim());
}

function firstNamedServer(proxyConfig) {
  const [server] = namedServers(proxyConfig);
  if (!server) {
    throw new Error("At least one named proxy server is required");
  }
  return server;
}

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function normalizePublicSubscriptionBaseUrl(value) {
  const normalized = trimTrailingSlash(String(value || "").trim());
  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    throw validationError("publicSubscriptionBaseUrl must be a valid URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw validationError("publicSubscriptionBaseUrl must be a valid URL");
  }
  return normalized;
}

function makeSubscriptionUrl(publicSubscriptionBaseUrl, rawToken) {
  return `${trimTrailingSlash(publicSubscriptionBaseUrl)}/sub/clash.yaml?token=${encodeURIComponent(rawToken)}`;
}

function cloneProxyConfigForNode(proxyConfig, nodeName) {
  return {
    ...proxyConfig,
    servers: (proxyConfig.servers || []).filter((server) => server.name === nodeName)
  };
}

export function createSubscriptionService({
  repository,
  proxyConfig,
  publicSubscriptionBaseUrl,
  nowFn = () => new Date(),
  tokenFactory = () => createSubscriptionToken(),
  idFactory = () => `tenant_${randomUUID()}`,
  expiringDays = DEFAULT_EXPIRING_DAYS
}) {
  if (!repository) {
    throw new Error("repository is required");
  }
  if (!proxyConfig) {
    throw new Error("proxyConfig is required");
  }

  firstNamedServer(proxyConfig);
  const normalizedPublicSubscriptionBaseUrl = normalizePublicSubscriptionBaseUrl(publicSubscriptionBaseUrl);

  function computeStatus(tenant) {
    return computeSubscriptionStatus({
      storedStatus: tenant.status,
      expiresAt: tenant.expiresAt,
      now: nowFn(),
      expiringDays
    });
  }

  function serializeTenant(tenant) {
    if (!tenant) return null;
    return {
      id: tenant.id,
      displayName: tenant.displayName,
      status: computeStatus(tenant),
      expiresAt: tenant.expiresAt,
      note: tenant.note,
      nodeName: tenant.nodeId,
      tokenPrefix: tenant.tokenPrefix,
      lastUsedAt: tenant.lastUsedAt,
      credentialMode: tenant.credentialMode
    };
  }

  function createTenant(input) {
    const now = isoNow(nowFn);
    const token = tokenFactory();
    const node = firstNamedServer(proxyConfig);

    const tenant = repository.createTenant({
      id: idFactory(),
      displayName: normalizeDisplayName(input.displayName),
      status: "active",
      expiresAt: normalizeExpiresAt(input.expiresAt),
      note: normalizeNote(input.note),
      nodeId: node.name,
      credentialMode: SHARED_NODE_MODE,
      tokenHash: token.tokenHash,
      tokenPrefix: token.tokenPrefix,
      now
    });

    return {
      tenant: serializeTenant(tenant),
      subscriptionUrl: makeSubscriptionUrl(normalizedPublicSubscriptionBaseUrl, token.rawToken)
    };
  }

  function listTenants() {
    return repository.listTenants().map(serializeTenant);
  }

  function getTenant(id) {
    const tenant = repository.getTenant(id);
    if (!tenant) {
      throw notFoundError(id);
    }
    return serializeTenant(tenant);
  }

  function renewTenant(id, input) {
    const tenant = repository.renewTenant(id, {
      expiresAt: normalizeExpiresAt(input.expiresAt),
      now: isoNow(nowFn)
    });
    if (!tenant) {
      throw notFoundError(id);
    }
    return serializeTenant(tenant);
  }

  function disableTenant(id) {
    const tenant = repository.setTenantStatus(id, {
      status: "disabled",
      now: isoNow(nowFn)
    });
    if (!tenant) {
      throw notFoundError(id);
    }
    return serializeTenant(tenant);
  }

  function enableTenant(id) {
    const tenant = repository.setTenantStatus(id, {
      status: "active",
      now: isoNow(nowFn)
    });
    if (!tenant) {
      throw notFoundError(id);
    }
    return serializeTenant(tenant);
  }

  function resetToken(id) {
    const token = tokenFactory();
    const tenant = repository.resetTenantToken(id, {
      tokenHash: token.tokenHash,
      tokenPrefix: token.tokenPrefix,
      now: isoNow(nowFn)
    });

    if (!tenant) {
      throw notFoundError(id);
    }

    return {
      tenant: serializeTenant(tenant),
      subscriptionUrl: makeSubscriptionUrl(normalizedPublicSubscriptionBaseUrl, token.rawToken)
    };
  }

  function resolveSubscriptionToken(rawToken) {
    const tenantAuth = repository.findTenantByTokenHash(hashSubscriptionToken(rawToken));
    if (!tenantAuth || !verifySubscriptionToken(rawToken, tenantAuth.tokenHash)) {
      return { ok: false, status: 401, error: "Unauthorized" };
    }

    const status = computeStatus(tenantAuth);
    if (status === "disabled") {
      return { ok: false, status: 403, error: "Subscription disabled" };
    }
    if (status === "expired") {
      return { ok: false, status: 403, error: "Subscription expired" };
    }

    const scopedProxyConfig = cloneProxyConfigForNode(proxyConfig, tenantAuth.nodeId);
    if (scopedProxyConfig.servers.length === 0) {
      return { ok: false, status: 403, error: "Subscription node unavailable" };
    }

    const tenant = repository.markLastUsed(tenantAuth.id, { now: isoNow(nowFn) });
    return {
      ok: true,
      tenant: serializeTenant(tenant),
      proxyConfig: scopedProxyConfig
    };
  }

  function nodes() {
    return namedServers(proxyConfig).map((server) => ({
      id: server.id || server.name,
      name: server.name,
      region: server.region || "",
      host: server.host,
      port: server.port,
      method: server.method,
      credentialMode: SHARED_NODE_MODE,
      status: "online"
    }));
  }

  function overview() {
    const tenants = repository.listTenants().map(serializeTenant);
    const counts = {
      total: tenants.length,
      active: 0,
      expiring: 0,
      disabledOrExpired: 0
    };

    for (const tenant of tenants) {
      if (tenant.status === "active") counts.active += 1;
      if (tenant.status === "expiring") counts.expiring += 1;
      if (tenant.status === "disabled" || tenant.status === "expired") counts.disabledOrExpired += 1;
    }

    return {
      ok: true,
      counts,
      nodes: nodes()
    };
  }

  return {
    createTenant,
    listTenants,
    getTenant,
    renewTenant,
    disableTenant,
    enableTenant,
    resetToken,
    resolveSubscriptionToken,
    nodes,
    overview
  };
}
