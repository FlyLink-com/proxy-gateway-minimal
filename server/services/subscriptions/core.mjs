import { randomUUID } from "node:crypto";
import {
  TEMP_SUBSCRIPTION_TOKEN_PREFIX,
  createSubscriptionToken,
  hashSubscriptionToken,
  verifySubscriptionToken
} from "./tokens.mjs";
import { assertSubscriptionStore } from "./store-contract.mjs";
import {
  cloneProxyConfigForSubscriptionOutput,
  createSubscriptionSerializer,
  firstNamedServer,
  namedServers,
  resolveNamedServer,
  serializeNode
} from "./serializer.mjs";
import {
  DEFAULT_EXPIRING_DAYS,
  SHARED_NODE_MODE,
  isoNow,
  makeSubscriptionUrl,
  normalizeDisplayName,
  normalizeExpiresAt,
  normalizeNodeId,
  normalizeNote,
  normalizePublicSubscriptionBaseUrl,
  notFoundError,
  validationError
} from "./validation.mjs";

export function createSubscriptionCore({
  store,
  repository,
  proxyConfig,
  publicSubscriptionBaseUrl,
  nowFn = () => new Date(),
  tokenFactory = () => createSubscriptionToken(),
  tempTokenFactory = () => createSubscriptionToken({ prefix: TEMP_SUBSCRIPTION_TOKEN_PREFIX }),
  idFactory = () => `tenant_${randomUUID()}`,
  tempLinkIdFactory = () => `temp_${randomUUID()}`,
  tempLinkTtlMinutes = 24 * 60,
  expiringDays = DEFAULT_EXPIRING_DAYS,
  lastUsedWriteIntervalMs = 15 * 60 * 1000,
  lastUsedWriteCache = new Map()
}) {
  const subscriptionStore = store || repository;
  assertSubscriptionStore(subscriptionStore);
  if (!proxyConfig) {
    throw new Error("proxyConfig is required");
  }

  firstNamedServer(proxyConfig);
  const normalizedPublicSubscriptionBaseUrl = normalizePublicSubscriptionBaseUrl(publicSubscriptionBaseUrl);
  const { computeStatus, serializeTenant, serializeTempLink } = createSubscriptionSerializer({ nowFn, expiringDays });

  function expiresAtFromNow() {
    const ttlMs = Number(tempLinkTtlMinutes) * 60 * 1000;
    return new Date(nowFn().getTime() + ttlMs).toISOString();
  }

  function shouldWriteLastUsed(tenantId, nowMs) {
    const intervalMs = Number(lastUsedWriteIntervalMs);
    if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
      return true;
    }

    const previousWriteAt = lastUsedWriteCache.get(tenantId);
    return previousWriteAt === undefined || nowMs - previousWriteAt >= intervalMs;
  }

  function resolveTenantAccess(tenantAuth, { markTempLinkId } = {}) {
    const status = computeStatus(tenantAuth);
    if (status === "disabled") {
      return { ok: false, status: 403, error: "Subscription disabled" };
    }
    if (status === "expired") {
      return { ok: false, status: 403, error: "Subscription expired" };
    }

    const scopedProxyConfig = cloneProxyConfigForSubscriptionOutput(proxyConfig, tenantAuth.nodeId);
    if (scopedProxyConfig.servers.length === 0) {
      return { ok: false, status: 403, error: "Subscription node unavailable" };
    }

    const now = isoNow(nowFn);
    const nowMs = new Date(now).getTime();
    let tenant = tenantAuth;
    if (shouldWriteLastUsed(tenantAuth.id, nowMs)) {
      const markedTenant = subscriptionStore.markLastUsed(tenantAuth.id, { now });
      if (markedTenant) {
        tenant = markedTenant;
        lastUsedWriteCache.set(tenantAuth.id, nowMs);
      }
    }
    if (markTempLinkId) {
      subscriptionStore.markTempLinkUsed(markTempLinkId, { now });
    }
    return {
      ok: true,
      tenant: serializeTenant(tenant),
      proxyConfig: scopedProxyConfig
    };
  }

  function selectTenantNode(nodeId, { allowDefault = false } = {}) {
    if (nodeId === undefined || nodeId === null || String(nodeId).trim() === "") {
      if (!allowDefault) {
        throw validationError("nodeId is required");
      }
      return firstNamedServer(proxyConfig);
    }

    const normalizedNodeId = normalizeNodeId(nodeId);
    const node = resolveNamedServer(proxyConfig, normalizedNodeId);
    if (!node) {
      throw validationError("nodeId does not match an available node");
    }
    return node;
  }

  function createTenant(input) {
    const now = isoNow(nowFn);
    const node = selectTenantNode(input.nodeId, { allowDefault: true });
    const token = tokenFactory();

    const tenant = subscriptionStore.createTenant({
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
    return subscriptionStore.listTenants().map(serializeTenant);
  }

  function getTenant(id) {
    const tenant = subscriptionStore.getTenant(id);
    if (!tenant) {
      throw notFoundError(id);
    }
    return serializeTenant(tenant);
  }

  function renewTenant(id, input) {
    const tenant = subscriptionStore.renewTenant(id, {
      expiresAt: normalizeExpiresAt(input.expiresAt),
      now: isoNow(nowFn)
    });
    if (!tenant) {
      throw notFoundError(id);
    }
    return serializeTenant(tenant);
  }

  function setTenantNode(id, input) {
    const node = selectTenantNode(input.nodeId);
    const tenant = subscriptionStore.setTenantNode(id, {
      nodeId: node.name,
      now: isoNow(nowFn)
    });
    if (!tenant) {
      throw notFoundError(id);
    }
    return serializeTenant(tenant);
  }

  function disableTenant(id) {
    const tenant = subscriptionStore.setTenantStatus(id, {
      status: "disabled",
      now: isoNow(nowFn)
    });
    if (!tenant) {
      throw notFoundError(id);
    }
    return serializeTenant(tenant);
  }

  function enableTenant(id) {
    const tenant = subscriptionStore.setTenantStatus(id, {
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
    const tenant = subscriptionStore.resetTenantToken(id, {
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
    const tenant = subscriptionStore.getTenant(id);
    if (!tenant) {
      throw notFoundError(id);
    }

    const token = tempTokenFactory();
    const link = subscriptionStore.createTempLink({
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
    const tenantAuth = subscriptionStore.findTenantByTokenHash(tokenHash);
    if (tenantAuth && verifySubscriptionToken(rawToken, tenantAuth.tokenHash)) {
      return resolveTenantAccess(tenantAuth);
    }

    const tempLink = subscriptionStore.findTempLinkByTokenHash(tokenHash);
    if (!tempLink || !verifySubscriptionToken(rawToken, tempLink.tokenHash)) {
      return { ok: false, status: 401, error: "Unauthorized" };
    }

    if (new Date(tempLink.expiresAt).getTime() <= nowFn().getTime()) {
      return { ok: false, status: 403, error: "Subscription link expired" };
    }

    return resolveTenantAccess(tempLink.tenant, { markTempLinkId: tempLink.id });
  }

  function listNodes() {
    return namedServers(proxyConfig).map(serializeNode);
  }

  function nodes() {
    return listNodes();
  }

  function overview() {
    const tenants = subscriptionStore.listTenants().map(serializeTenant);
    const counts = {
      total: tenants.length,
      active: 0,
      expiring: 0,
      disabled: 0,
      expired: 0,
      disabledOrExpired: 0
    };

    for (const tenant of tenants) {
      if (tenant.status === "active") counts.active += 1;
      if (tenant.status === "expiring") counts.expiring += 1;
      if (tenant.status === "disabled") counts.disabled += 1;
      if (tenant.status === "expired") counts.expired += 1;
      if (tenant.status === "disabled" || tenant.status === "expired") counts.disabledOrExpired += 1;
    }

    return {
      ok: true,
      total: counts.total,
      active: counts.active,
      expiring: counts.expiring,
      disabled: counts.disabled,
      expired: counts.expired,
      counts: {
        total: counts.total,
        active: counts.active,
        expiring: counts.expiring,
        disabledOrExpired: counts.disabledOrExpired
      },
      nodes: listNodes()
    };
  }

  return {
    createTenant,
    listTenants,
    getTenant,
    renewTenant,
    setTenantNode,
    disableTenant,
    enableTenant,
    resetToken,
    createTempLink,
    resolveSubscriptionToken,
    listNodes,
    nodes,
    overview
  };
}
