import { randomUUID } from "node:crypto";

function platformError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function requiredText(value, field) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    throw platformError("validation_error", `${field} is required`);
  }
  return normalized;
}

function isActiveAt({ status, validFrom, validUntil }, now) {
  const current = new Date(now).getTime();
  return status === "active"
    && new Date(validFrom).getTime() <= current
    && new Date(validUntil).getTime() >= current;
}

function assertActiveSession(controlStore, sessionRef, now) {
  const session = controlStore.getPortalSession(requiredText(sessionRef, "sessionRef"));
  if (!session) {
    throw platformError("not_found", "portal session not found");
  }
  if (session.status !== "active") {
    throw platformError("validation_error", "portal session is not active");
  }
  if (new Date(session.expiresAt).getTime() < new Date(now).getTime()) {
    throw platformError("validation_error", "portal session is expired");
  }
  return session;
}

function buildIssuedLinkSummaries({ summary, now }) {
  const requestsById = new Map(summary.issuanceRequests.map((request) => [request.id, request]));
  const entitlementsById = new Map(summary.entitlements.map((entitlement) => [entitlement.id, entitlement]));

  return summary.issuedLinks.map((link) => {
    const request = requestsById.get(link.requestId);
    const entitlement = request ? entitlementsById.get(request.entitlementId) : null;
    return {
      issuedLinkId: link.id,
      entitlementId: request?.entitlementId || null,
      requestId: link.requestId,
      artifactRef: link.artifactRef,
      status: link.status,
      refreshAllowed: link.status === "active"
        && request?.status === "issued"
        && Boolean(entitlement)
        && isActiveAt(entitlement, now),
      createdAt: link.createdAt,
      updatedAt: link.updatedAt
    };
  });
}

function buildSafeSummary({ accountSummary, now }) {
  return {
    type: "user_portal_subscription_summary",
    account: {
      accountId: accountSummary.account.id,
      status: accountSummary.account.status
    },
    entitlements: accountSummary.entitlements.map((entitlement) => ({
      entitlementId: entitlement.id,
      plan: entitlement.plan,
      status: entitlement.status,
      validFrom: entitlement.validFrom,
      validUntil: entitlement.validUntil,
      maxArtifacts: entitlement.maxArtifacts,
      maxDevices: entitlement.maxDevices,
      trafficLimitBytes: entitlement.trafficLimitBytes,
      usable: isActiveAt(entitlement, now)
    })),
    issuedLinks: buildIssuedLinkSummaries({ summary: accountSummary, now }),
    quotaCounters: accountSummary.quotaCounters.map((counter) => ({
      entitlementId: counter.entitlementId,
      metric: counter.metric,
      period: counter.period,
      amount: counter.amount,
      updatedAt: counter.updatedAt
    })),
    refresh: {
      mode: "existing_artifact_route",
      operatorRequired: false,
      rawUrlReturned: false
    },
    safety: {
      summaryOnly: true,
      rawCustomerDataReturned: false,
      rawUrlReturned: false,
      rawDeliveryMaterialReturned: false,
      runtimeDbMutated: false,
      operatorRequiredForRefresh: false
    }
  };
}

function latestRefreshableLink({ accountSummary, entitlementId, now }) {
  const requests = accountSummary.issuanceRequests
    .filter((request) => request.entitlementId === entitlementId && request.status === "issued");
  const requestIds = new Set(requests.map((request) => request.id));
  return accountSummary.issuedLinks
    .filter((link) => link.status === "active" && requestIds.has(link.requestId))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)) || String(b.id).localeCompare(String(a.id)))
    .find((link) => {
      const entitlement = accountSummary.entitlements.find((item) => item.id === entitlementId);
      return entitlement && isActiveAt(entitlement, now);
    });
}

export function createUserPortalSubscriptionService({
  controlStore,
  nowFn = () => new Date().toISOString(),
  auditRefFactory = () => `audit_${randomUUID()}`
} = {}) {
  if (!controlStore) {
    throw new Error("controlStore is required");
  }

  function getSubscriptionSummary({ sessionRef }) {
    const now = nowFn();
    const session = assertActiveSession(controlStore, sessionRef, now);
    const accountSummary = controlStore.getAccountControlSummary(session.accountId);
    return buildSafeSummary({ accountSummary, now });
  }

  function requestSubscriptionRefresh({ sessionRef, entitlementId }) {
    const now = nowFn();
    const session = assertActiveSession(controlStore, sessionRef, now);
    const normalizedEntitlementId = requiredText(entitlementId, "entitlementId");
    const accountSummary = controlStore.getAccountControlSummary(session.accountId);
    const entitlement = accountSummary.entitlements.find((item) => item.id === normalizedEntitlementId);
    if (!entitlement || !isActiveAt(entitlement, now)) {
      throw platformError("validation_error", "active entitlement not found");
    }
    const link = latestRefreshableLink({
      accountSummary,
      entitlementId: normalizedEntitlementId,
      now
    });
    if (!link) {
      throw platformError("validation_error", "active issued subscription link not found");
    }

    const audit = controlStore.recordAuditEvent({
      id: auditRefFactory(),
      entityType: "issued_subscription_link",
      entityRef: link.id,
      action: "portal_subscription_refresh_requested",
      actorRef: session.accountId,
      createdAt: now,
      metadata: {
        source: "user_portal",
        mode: "existing_artifact_route"
      }
    });

    return {
      ok: true,
      action: "portal_subscription_refresh_ready",
      accountId: session.accountId,
      entitlementId: normalizedEntitlementId,
      issuedLink: {
        issuedLinkId: link.id,
        requestId: link.requestId,
        artifactRef: link.artifactRef,
        status: link.status
      },
      refresh: {
        mode: "existing_artifact_route",
        operatorRequired: false,
        userAction: "refresh_client_subscription"
      },
      auditRef: audit.id,
      safety: {
        runtimeDbMutated: false,
        controlDbMutated: true,
        auditOnlyMutation: true,
        rawUrlReturned: false,
        rawDeliveryMaterialReturned: false,
        operatorRequired: false
      }
    };
  }

  return {
    getSubscriptionSummary,
    requestSubscriptionRefresh
  };
}
