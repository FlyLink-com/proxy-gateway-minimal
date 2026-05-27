import { generateClashSubscription } from "../clash-subscription.mjs";

function platformError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function protocolForSummary(server) {
  const raw = String(server?.protocol || server?.clashType || server?.type || "ss").trim().toLowerCase();
  if (raw === "shadowsocks" || raw === "shadowsocks-libev" || raw === "shadowsocks-rust") {
    return "ss";
  }
  if (raw === "hy2") {
    return "hysteria2";
  }
  return raw || "unknown";
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function safeAccountSummary(account) {
  return {
    id: account.id,
    status: account.status,
    entitlementCount: account.entitlementCount,
    usableEntitlementCount: account.usableEntitlementCount
  };
}

function safeEntitlementSummary(entitlement) {
  return {
    id: entitlement.id,
    accountId: entitlement.accountId,
    status: entitlement.status,
    plan: entitlement.plan,
    usable: entitlement.usable,
    validUntil: entitlement.validUntil,
    quota: entitlement.quota
  };
}

function safeAccessSummary(accessGrant) {
  return {
    id: accessGrant.id,
    accountId: accessGrant.accountId,
    entitlementId: accessGrant.entitlementId,
    status: accessGrant.status,
    delivery: accessGrant.delivery,
    hasDynamicEntry: accessGrant.hasDynamicEntry,
    hasArtifact: accessGrant.hasArtifact,
    visibleOnce: accessGrant.visibleOnce,
    issuedAt: accessGrant.issuedAt,
    updatedAt: accessGrant.updatedAt
  };
}

function renderableServers(proxyConfig = {}) {
  return (proxyConfig.servers || []).filter((server) => server?.host && server?.port);
}

function privateRenderingDryRun(proxyConfig = {}) {
  const servers = renderableServers(proxyConfig);
  const protocols = unique(servers.map(protocolForSummary));
  if (servers.length === 0) {
    return {
      status: "blocked",
      mode: "metadata_only",
      nodeCount: 0,
      protocols,
      generatedYamlBytes: 0,
      redacted: true,
      checks: ["clash-render", "sensitive-output-redaction"]
    };
  }

  try {
    const yaml = generateClashSubscription(proxyConfig);
    return {
      status: "ready",
      mode: "metadata_only",
      nodeCount: servers.length,
      protocols,
      generatedYamlBytes: Buffer.byteLength(yaml, "utf8"),
      redacted: true,
      checks: ["clash-render", "sensitive-output-redaction"]
    };
  } catch {
    return {
      status: "blocked",
      mode: "metadata_only",
      nodeCount: servers.length,
      protocols,
      generatedYamlBytes: 0,
      redacted: true,
      checks: ["clash-render", "sensitive-output-redaction"],
      blocker: "subscription rendering dry-run failed"
    };
  }
}

export function createCleanStartControlPlanePackage({
  accountShell,
  accessShell,
  proxyConfig = {},
  now
} = {}) {
  if (!accountShell?.listAccounts || !accountShell?.listEntitlements) {
    throw platformError("validation_error", "accountShell is required");
  }
  if (!accessShell?.listAccessGrants) {
    throw platformError("validation_error", "accessShell is required");
  }

  const accounts = accountShell.listAccounts();
  const entitlements = accountShell.listEntitlements();
  const accessGrants = accessShell.listAccessGrants();
  const usableEntitlements = entitlements.filter((entitlement) => entitlement.usable);
  const issuedAccessGrants = accessGrants.filter((accessGrant) => accessGrant.status === "issued");
  const rendering = privateRenderingDryRun(proxyConfig);

  const blockers = [];
  if (accounts.length === 0) {
    blockers.push("no account");
  }
  if (usableEntitlements.length === 0) {
    blockers.push("no usable entitlement");
  }
  if (issuedAccessGrants.length === 0) {
    blockers.push("no issued access grant");
  }
  if (rendering.nodeCount === 0) {
    blockers.push("no renderable subscription node");
  } else if (rendering.status !== "ready") {
    blockers.push("subscription rendering dry-run failed");
  }

  return {
    type: "aliyun_clean_start_control_plane_package",
    authorityMode: "clean_start",
    status: blockers.length === 0 ? "ready_for_private_validation" : "blocked",
    generatedAt: now ? new Date(now).toISOString() : new Date().toISOString(),
    historicalState: {
      copied: false,
      source: "none",
      requiresStatePreservingGate: false
    },
    counts: {
      accounts: accounts.length,
      entitlements: entitlements.length,
      usableEntitlements: usableEntitlements.length,
      accessGrants: accessGrants.length,
      dynamicEntries: accessGrants.filter((accessGrant) => accessGrant.hasDynamicEntry).length,
      artifacts: accessGrants.filter((accessGrant) => accessGrant.hasArtifact).length,
      renderableNodes: rendering.nodeCount
    },
    blockers,
    summaries: {
      accounts: accounts.map(safeAccountSummary),
      entitlements: entitlements.map(safeEntitlementSummary),
      accessGrants: accessGrants.map(safeAccessSummary)
    },
    privateRenderingDryRun: rendering,
    nextGates: [
      "Aliyun clean-start private validation",
      "Aliyun provider-firewall hardening",
      "public-boundary dry run",
      "DNS promotion"
    ]
  };
}
