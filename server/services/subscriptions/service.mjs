import { randomUUID } from "node:crypto";
import { computeSubscriptionStatus } from "./status.mjs";
import {
  TEMP_SUBSCRIPTION_TOKEN_PREFIX,
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
  tempTokenFactory = () => createSubscriptionToken({ prefix: TEMP_SUBSCRIPTION_TOKEN_PREFIX }),
  idFactory = () => `tenant_${randomUUID()}`,
  tempLinkIdFactory = () => `temp_${randomUUID()}`,
  tempLinkTtlMinutes = 24 * 60,
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

  function serializeTempLink(link, tenant) {
    return {
      id: link.id,
      tenant: serializeTenant(tenant),
      tokenPrefix: link.tokenPrefix,
      expiresAt: link.expiresAt,
      usedAt: link.usedAt,
      createdAt: link.createdAt
    };
  }

  function expiresAtFromNow() {
    const ttlMs = Number(tempLinkTtlMinutes) * 60 * 1000;
    return new Date(nowFn().getTime() + ttlMs).toISOString();
  }

  function resolveTenantAccess(tenantAuth, { markTempLinkId } = {}) {
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

    const now = isoNow(nowFn);
    const tenant = repository.markLastUsed(tenantAuth.id, { now });
    if (markTempLinkId) {
      repository.markTempLinkUsed(markTempLinkId, { now });
    }
    return {
      ok: true,
      tenant: serializeTenant(tenant),
      proxyConfig: scopedProxyConfig
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

  function createTempLink(id) {
    const tenant = repository.getTenant(id);
    if (!tenant) {
      throw notFoundError(id);
    }

    const token = tempTokenFactory();
    const link = repository.createTempLink({
      id: tempLinkIdFactory(),
      tenantId: id,
      tokenHash: token.tokenHash,
      tokenPrefix: token.tokenPrefix,
      expiresAt: expiresAtFromNow(),
      now: isoNow(nowFn)
    });

    return {
      ...serializeTempLink(link, tenant),
      subscriptionUrl: makeSubscriptionUrl(normalizedPublicSubscriptionBaseUrl, token.rawToken)
    };
  }

  function resolveSubscriptionToken(rawToken) {
    const tokenHash = hashSubscriptionToken(rawToken);
    const tenantAuth = repository.findTenantByTokenHash(tokenHash);
    if (tenantAuth && verifySubscriptionToken(rawToken, tenantAuth.tokenHash)) {
      return resolveTenantAccess(tenantAuth);
    }

    const tempLink = repository.findTempLinkByTokenHash(tokenHash);
    if (!tempLink || !verifySubscriptionToken(rawToken, tempLink.tokenHash)) {
      return { ok: false, status: 401, error: "Unauthorized" };
    }

    if (new Date(tempLink.expiresAt).getTime() <= nowFn().getTime()) {
      return { ok: false, status: 403, error: "Subscription link expired" };
    }

    return resolveTenantAccess(tempLink.tenant, { markTempLinkId: tempLink.id });
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
    createTempLink,
    resolveSubscriptionToken,
    nodes,
    overview
  };
}
