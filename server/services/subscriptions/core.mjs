import { createHash, randomBytes, randomUUID } from "node:crypto";
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
  firstEligibleNamedServer,
  firstNamedServer,
  namedServers,
  resolveEligibleNamedServer,
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
  serviceError,
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
  artifactSecretFactory = () => randomBytes(32).toString("base64url"),
  idFactory = () => `tenant_${randomUUID()}`,
  tempLinkIdFactory = () => `temp_${randomUUID()}`,
  artifactIdFactory = () => `artifact_${randomUUID()}`,
  tempLinkTtlMinutes = 24 * 60,
  expiringDays = DEFAULT_EXPIRING_DAYS,
  lastUsedWriteIntervalMs = 15 * 60 * 1000,
  lastUsedWriteCache = new Map(),
  tenantCredentialMaterialResolver = null,
  subscriptionChannelGate = null
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

  function artifactPrefix(rawArtifact) {
    return String(rawArtifact).slice(0, 12);
  }

  function makeArtifactUrl(rawArtifact) {
    return `${normalizedPublicSubscriptionBaseUrl.replace(/\/+$/, "")}/sub/a/${encodeURIComponent(rawArtifact)}.yaml`;
  }

  function hashSignal(value) {
    if (!value) return null;
    return createHash("sha256").update(String(value)).digest("hex");
  }

  function artifactBindingFromMetadata(metadata = {}) {
    return {
      ipPrefixHash: hashSignal(ipPrefix(metadata.ip)),
      userAgentHash: hashSignal(metadata.userAgent)
    };
  }

  const tenantCredentialMaterials = new Map();

  function requiredText(value, field) {
    const normalized = String(value ?? "").trim();
    if (!normalized) {
      throw validationError(`${field} is required`);
    }
    return normalized;
  }

  function optionalText(value) {
    return String(value ?? "").trim();
  }

  function normalizeCredentialMaterial(material = {}) {
    const uuid = requiredText(material.uuid, "material.uuid");
    const password = requiredText(material.password, "material.password");
    const credentialRef = optionalText(material.credentialRef);
    return {
      uuid,
      password,
      ...(credentialRef ? { credentialRef } : {})
    };
  }

  function tenantCredentialKey(tenantId, nodeName) {
    return `${tenantId}\0${nodeName}`;
  }

  function protocolFor(server) {
    const raw = String(server.protocol || server.clashType || server.type || "ss").trim().toLowerCase();
    if (raw === "ss" || raw === "shadowsocks" || raw === "shadowsocks-libev" || raw === "shadowsocks-rust") {
      return "ss";
    }
    if (raw === "hysteria2" || raw === "hy2") {
      return "hysteria2";
    }
    return raw;
  }

  function credentialModeFor(server) {
    return String(server.credentialMode || server.dataPlaneCredentialMode || "").trim().toLowerCase();
  }

  function requiresTenantCredentialMaterial(server) {
    const credentialMode = credentialModeFor(server).replace(/[\s_]+/g, "-");
    if (
      credentialMode !== "per-order" &&
      credentialMode !== "per-order-credential" &&
      credentialMode !== "per-user" &&
      credentialMode !== "per-user-credential" &&
      credentialMode !== "dedicated"
    ) {
      return false;
    }
    return new Set(["ss", "vless", "hysteria2", "tuic"]).has(protocolFor(server));
  }

  function applyCredentialMaterialToServer(server, material) {
    const protocol = protocolFor(server);
    if (protocol === "vless") {
      return {
        ...server,
        uuid: material.uuid
      };
    }
    if (protocol === "hysteria2") {
      const credentialRef = optionalText(material.credentialRef);
      return {
        ...server,
        password: credentialRef ? `${credentialRef}:${material.password}` : material.password
      };
    }
    if (protocol === "ss") {
      const serverPassword = optionalText(server.serverPassword || server["server-password"]);
      return {
        ...server,
        password: serverPassword
          ? `${serverPassword}:${material.password}`
          : material.password
      };
    }
    return {
      ...server,
      uuid: material.uuid,
      password: material.password
    };
  }

  function resolveTenantCredentialMaterial(tenantAuth, server) {
    const inMemory = tenantCredentialMaterials.get(tenantCredentialKey(tenantAuth.id, server.name));
    if (inMemory) {
      return inMemory;
    }
    if (typeof tenantCredentialMaterialResolver !== "function") {
      return null;
    }
    const resolved = tenantCredentialMaterialResolver({
      tenantId: tenantAuth.id,
      nodeId: server.name
    });
    return resolved ? normalizeCredentialMaterial(resolved) : null;
  }

  function applyTenantCredentialMaterial(scopedProxyConfig, tenantAuth) {
    return {
      ...scopedProxyConfig,
      servers: (scopedProxyConfig.servers || []).flatMap((server) => {
        if (!requiresTenantCredentialMaterial(server)) {
          return [server];
        }
        const material = resolveTenantCredentialMaterial(tenantAuth, server);
        if (!material) {
          return [];
        }
        return [applyCredentialMaterialToServer(server, material)];
      })
    };
  }

  function applySubscriptionChannelGate(scopedProxyConfig, tenantAuth) {
    if (typeof subscriptionChannelGate !== "function") {
      return scopedProxyConfig;
    }
    return {
      ...scopedProxyConfig,
      servers: (scopedProxyConfig.servers || []).filter((server) => {
        try {
          return subscriptionChannelGate({
            tenant: tenantAuth,
            tenantId: tenantAuth.id,
            nodeId: tenantAuth.nodeId,
            channelRef: server.name,
            server
          }) !== false;
        } catch {
          return false;
        }
      })
    };
  }

  function ipPrefix(value) {
    const text = String(value || "").trim();
    const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/.exec(text);
    if (ipv4) {
      return `${ipv4[1]}.${ipv4[2]}.${ipv4[3]}.0/24`;
    }
    if (text.includes(":")) {
      return `${text.toLowerCase().split(":").slice(0, 4).join(":")}::/64`;
    }
    return text;
  }

  function normalizeArtifactSecret(rawArtifact) {
    const normalized = String(rawArtifact || "").trim();
    if (!normalized) {
      throw validationError("artifact is required");
    }
    return normalized;
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

    const scopedProxyConfig = applyTenantCredentialMaterial(
      applySubscriptionChannelGate(
        cloneProxyConfigForSubscriptionOutput(proxyConfig, tenantAuth.nodeId),
        tenantAuth
      ),
      tenantAuth
    );
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
      try {
        return firstEligibleNamedServer(proxyConfig);
      } catch {
        throw validationError("nodeId does not match an available node");
      }
    }

    const normalizedNodeId = normalizeNodeId(nodeId);
    const node = resolveEligibleNamedServer(proxyConfig, normalizedNodeId);
    if (!node) {
      throw validationError("nodeId does not match an available node");
    }
    return node;
  }

  function bindTenantCredentialMaterial(input = {}) {
    const tenantId = requiredText(input.tenantId, "tenantId");
    const tenant = subscriptionStore.getTenant(tenantId);
    if (!tenant) {
      throw notFoundError(tenantId);
    }
    const node = selectTenantNode(input.nodeId);
    const normalizedMaterial = normalizeCredentialMaterial({
      ...input.material,
      credentialRef: input.credentialRef || input.material?.credentialRef
    });
    tenantCredentialMaterials.set(tenantCredentialKey(tenantId, node.name), normalizedMaterial);
    return {
      ok: true,
      tenantId,
      nodeId: node.name
    };
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
    const expiresAt = normalizeExpiresAt(input.expiresAt);
    subscriptionStore.renewTenant(id, {
      expiresAt,
      now: isoNow(nowFn)
    });

    const tenant = subscriptionStore.getTenant(id);
    if (!tenant) {
      throw notFoundError(id);
    }
    if (tenant.status !== "active") {
      throw serviceError(
        `Subscription tenant is not active: ${id}`,
        "subscription_not_active"
      );
    }
    const storedExpiryMs = new Date(tenant.expiresAt).getTime();
    const targetExpiryMs = new Date(expiresAt).getTime();
    if (
      !Number.isFinite(storedExpiryMs)
      || storedExpiryMs < targetExpiryMs
    ) {
      throw serviceError(
        `Subscription renewal did not converge: ${id}`,
        "subscription_renewal_not_converged"
      );
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

  function createSubscriptionArtifact(id) {
    const tenant = subscriptionStore.getTenant(id);
    if (!tenant) {
      throw notFoundError(id);
    }

    const rawArtifact = normalizeArtifactSecret(artifactSecretFactory());
    const now = isoNow(nowFn);
    const artifact = subscriptionStore.createArtifact({
      id: artifactIdFactory(),
      tenantId: id,
      artifactHash: hashSubscriptionToken(rawArtifact),
      artifactPrefix: artifactPrefix(rawArtifact),
      status: "active",
      now
    });

    return {
      artifact,
      subscriptionUrl: makeArtifactUrl(rawArtifact)
    };
  }

  function listSubscriptionArtifacts(id) {
    const tenant = subscriptionStore.getTenant(id);
    if (!tenant) {
      throw notFoundError(id);
    }
    return subscriptionStore.listArtifactsByTenant(id);
  }

  function revokeSubscriptionArtifact(id) {
    const artifact = subscriptionStore.revokeArtifact(id, { now: isoNow(nowFn) });
    if (!artifact) {
      throw notFoundError(id);
    }
    return artifact;
  }

  function rotateSubscriptionArtifact(id) {
    const rawArtifact = normalizeArtifactSecret(artifactSecretFactory());
    const rotated = subscriptionStore.rotateArtifact(id, {
      id: artifactIdFactory(),
      artifactHash: hashSubscriptionToken(rawArtifact),
      artifactPrefix: artifactPrefix(rawArtifact),
      now: isoNow(nowFn)
    });
    if (!rotated) {
      throw notFoundError(id);
    }
    return {
      ...rotated,
      subscriptionUrl: makeArtifactUrl(rawArtifact)
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

  function resolveSubscriptionArtifact(rawArtifact, metadata = {}) {
    const normalizedArtifact = normalizeArtifactSecret(rawArtifact);
    const artifact = subscriptionStore.findArtifactBySecretHash(hashSubscriptionToken(normalizedArtifact));
    if (!artifact) {
      return { ok: false, status: 404, error: "Not found" };
    }

    if (artifact.status === "revoked") {
      return { ok: false, status: 410, error: "Subscription artifact revoked" };
    }
    if (artifact.status === "rotated") {
      return { ok: false, status: 410, error: "Subscription artifact rotated" };
    }

    const result = resolveTenantAccess(artifact.tenant);
    if (!result.ok) {
      return result;
    }

    const binding = artifactBindingFromMetadata(metadata);
    subscriptionStore.markArtifactRefreshed(artifact.id, {
      now: isoNow(nowFn),
      ipPrefixHash: binding.ipPrefixHash,
      userAgentHash: binding.userAgentHash
    });

    return result;
  }

  function listNodes() {
    return namedServers(proxyConfig).map(serializeNode);
  }

  function nodes() {
    return listNodes();
  }

  function summarizeDistribution(nodes) {
    const eligibleNodes = nodes.filter(
      (node) => node.subscriptionEligible && node.channelPool === "stable"
    ).length;
    const blockedNodes = nodes.length - eligibleNodes;
    const blockers = [];

    if (eligibleNodes === 0) {
      blockers.push("no_subscription_eligible_nodes");
    }

    return {
      mode: "subscription-v2",
      ready: blockers.length === 0,
      eligibleNodes,
      blockedNodes,
      blockers
    };
  }

  function overview() {
    const tenants = subscriptionStore.listTenants().map(serializeTenant);
    const nodeSummaries = listNodes();
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
      nodes: nodeSummaries,
      distribution: summarizeDistribution(nodeSummaries)
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
    createSubscriptionArtifact,
    listSubscriptionArtifacts,
    revokeSubscriptionArtifact,
    rotateSubscriptionArtifact,
    resolveSubscriptionToken,
    resolveSubscriptionArtifact,
    bindTenantCredentialMaterial,
    listNodes,
    nodes,
    overview
  };
}
