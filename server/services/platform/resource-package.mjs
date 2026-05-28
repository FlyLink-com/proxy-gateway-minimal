import { createHash } from "node:crypto";
import {
  isEntitlementUsable,
  normalizePlatformAccount,
  normalizePlatformEntitlement
} from "./control-plane-contract.mjs";

const ACCESS_STATUSES = new Set(["pending", "issued", "revoked", "expired"]);
const ACCESS_DELIVERIES = new Set(["operator_issued", "config_file", "artifact"]);

function text(value) {
  return String(value ?? "").trim();
}

function bool(value) {
  return value === true;
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function unique(items) {
  return [...new Set(list(items).map(text).filter(Boolean))];
}

function safeStatus(value, allowed, fallback) {
  const normalized = text(value || fallback);
  return allowed.has(normalized) ? normalized : fallback;
}

function hashRef(prefix, ...parts) {
  const input = parts.map(text).filter(Boolean).join("|") || prefix;
  const digest = createHash("sha256").update(input).digest("hex").slice(0, 16);
  return `${prefix}_${digest}`;
}

function safeIso(value) {
  const raw = text(value);
  if (!raw) {
    return "";
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function normalizeAccessGrant(payload = {}) {
  return {
    id: text(payload.id),
    accountId: text(payload.accountId),
    entitlementId: text(payload.entitlementId),
    status: safeStatus(payload.status, ACCESS_STATUSES, "pending"),
    delivery: safeStatus(payload.delivery, ACCESS_DELIVERIES, "operator_issued"),
    hasDynamicEntry: Boolean(text(payload.entryRef)),
    hasArtifact: Boolean(text(payload.artifactRef)),
    visibleOnce: payload.visibleOnce !== false,
    issuedAt: safeIso(payload.issuedAt),
    updatedAt: safeIso(payload.updatedAt)
  };
}

function activationSummary(activationPackage) {
  if (!activationPackage) {
    return {
      included: false,
      status: "not_included",
      approvalRequestReady: false,
      executionAuthority: "not_granted",
      renderedProxyCount: 0,
      protocolCounts: {},
      risk: "",
      gate: ""
    };
  }

  return {
    included: true,
    status: text(activationPackage.status),
    approvalRequestReady: activationPackage.package?.approvalRequestReady === true
      || activationPackage.gate?.approvalRequestReady === true,
    executionAuthority: text(activationPackage.package?.executionAuthority || activationPackage.gate?.executionAuthority)
      || "not_granted",
    renderedProxyCount: Number(activationPackage.renderProof?.renderedProxyCount ?? 0),
    protocolCounts: activationPackage.renderProof?.protocolCounts ?? {},
    risk: text(activationPackage.gate?.risk),
    gate: text(activationPackage.gate?.gate)
  };
}

function safetyFlags() {
  return {
    advisoryOnly: true,
    summaryOnly: true,
    cliPackageOnly: true,
    noRawCustomerData: true,
    noSecrets: true,
    noSubscriptionUrls: true,
    noRuntimeMutation: true,
    noProductionMutation: true,
    noApprovalSubmission: true,
    noTrafficMovement: true,
    noSubscriptionOutputMutation: true,
    requiresSeparateRiskAApprovalForRuntime: true,
    omittedFields: [
      "organization",
      "email",
      "displayName",
      "entryRef",
      "artifactRef",
      "hosts",
      "ports",
      "urls",
      "credentials",
      "tokens",
      "subscriptionUrls",
      "yaml"
    ]
  };
}

function buildStatus({ accessReady, activation }) {
  if (!accessReady) {
    return "blocked_before_operator_delivery";
  }
  if (activation.included && !activation.approvalRequestReady) {
    return "blocked_before_operator_delivery";
  }
  return "ready_for_operator_delivery";
}

function buildBlockers({ entitlementUsable, access, activation }) {
  return unique([
    ...(!entitlementUsable ? ["entitlement_not_usable"] : []),
    ...(access.status !== "issued" ? ["access_not_issued"] : []),
    ...(!access.hasDynamicEntry && !access.hasArtifact ? ["access_reference_missing"] : []),
    ...(activation.included && !activation.approvalRequestReady ? ["activation_package_not_ready"] : [])
  ]);
}

export function buildPlatformResourcePackage(input = {}) {
  const generatedAt = safeIso(input.generatedAt) || new Date().toISOString();
  const account = normalizePlatformAccount(input.account || {}, { now: generatedAt });
  const entitlement = normalizePlatformEntitlement(input.entitlement || {}, { now: generatedAt });
  const access = normalizeAccessGrant(input.accessGrant || {});
  const entitlementUsable = entitlement.accountId === account.id
    && isEntitlementUsable(entitlement, { now: generatedAt });
  const accessBelongsToEntitlement = access.accountId === account.id
    && access.entitlementId === entitlement.id;
  const activation = activationSummary(input.activationPackage);
  const accessReady = entitlementUsable
    && accessBelongsToEntitlement
    && access.status === "issued"
    && (access.hasDynamicEntry || access.hasArtifact);
  const blockers = unique([
    ...buildBlockers({ entitlementUsable, access, activation }),
    ...(!accessBelongsToEntitlement ? ["access_grant_mismatch"] : [])
  ]);
  const status = buildStatus({ accessReady, activation });
  const accountRef = hashRef("acct", account.id, account.email, account.organization);
  const entitlementRef = hashRef("ent", entitlement.id, account.id);
  const accessRef = hashRef("access", access.id, entitlement.id, account.id);

  return {
    ok: true,
    mode: "platform-resource-package",
    generatedAt,
    status,
    blockers,
    package: {
      packageId: hashRef("pkg", account.id, entitlement.id, access.id, generatedAt),
      accountRef,
      entitlementRef,
      accessRef,
      plan: entitlement.plan,
      accessReady: status === "ready_for_operator_delivery",
      activationPackageReady: activation.included ? activation.approvalRequestReady : false,
      riskBoundary: "operator_delivery_only",
      requiredNextAction: status === "ready_for_operator_delivery"
        ? "deliver_visible_once_resource_package"
        : "fix_resource_package_before_delivery"
    },
    identity: {
      accountRef,
      customerRef: hashRef("cust", account.email, account.organization, account.displayName),
      hasOrganization: Boolean(account.organization),
      hasEmail: Boolean(account.email),
      rawCustomerDataReturned: false
    },
    entitlement: {
      entitlementRef,
      accountRef,
      plan: entitlement.plan,
      status: entitlement.status,
      usable: entitlementUsable,
      validUntil: entitlement.validUntil,
      quota: entitlement.quota
    },
    access: {
      accessRef,
      entitlementRef,
      status: access.status,
      delivery: access.delivery,
      hasDynamicEntry: access.hasDynamicEntry,
      hasArtifact: access.hasArtifact,
      visibleOnce: access.visibleOnce,
      issuedAt: access.issuedAt,
      updatedAt: access.updatedAt
    },
    activation,
    audit: {
      recordType: "platform_resource_package_summary",
      source: text(input.operator?.source) || "cli",
      requestedByRef: hashRef("operator", input.operator?.requestedBy || "operator"),
      evidenceKinds: unique([
        "account_summary",
        "entitlement_summary",
        "access_grant_summary",
        ...(activation.included ? ["channel_activation_package_summary"] : [])
      ])
    },
    safety: safetyFlags()
  };
}
