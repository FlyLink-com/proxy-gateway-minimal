const PLANS = {
  trial: { durationDays: 7, label: "7-day trial" },
  monthly: { durationDays: 30, label: "monthly" },
  yearly: { durationDays: 365, label: "yearly" }
};
const CLIENT_TARGETS = new Set(["clash", "karing"]);

function platformError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function text(value, field) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    throw platformError("validation_error", `${field} is required`);
  }
  return normalized;
}

function optionalText(value) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function isoNow(nowFn) {
  const value = nowFn();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw platformError("validation_error", "now must be a valid date");
  }
  return date.toISOString();
}

function isoText(value, field) {
  const normalized = text(value, field);
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    throw platformError("validation_error", `${field} is invalid`);
  }
  return date.toISOString();
}

function expiresAtFromDuration(baseIso, durationDays) {
  const base = new Date(baseIso);
  if (Number.isNaN(base.getTime())) {
    throw platformError("validation_error", "base date is invalid");
  }
  return new Date(base.getTime() + durationDays * 24 * 60 * 60 * 1000).toISOString();
}

function normalizePlan(plan) {
  const normalized = text(plan, "plan");
  if (!Object.hasOwn(PLANS, normalized)) {
    throw platformError("validation_error", "plan is invalid");
  }
  return normalized;
}

function normalizeClientTarget(clientTarget) {
  const normalized = String(clientTarget || "clash").trim();
  if (!CLIENT_TARGETS.has(normalized)) {
    throw platformError("validation_error", "clientTarget is invalid");
  }
  return normalized;
}

function normalizeQuantity(quantity) {
  const normalized = Number(quantity ?? 1);
  if (!Number.isInteger(normalized) || normalized < 1 || normalized > 12) {
    throw platformError("validation_error", "quantity is invalid");
  }
  return normalized;
}

function nextRequestId(now, sequence) {
  return `pareq_${new Date(now).getTime().toString(36)}_${sequence.toString(36)}`;
}

function summaryFor(record) {
  return {
    id: record.id,
    type: "portal_access_request_summary",
    portalUserRef: record.portalUserRef,
    plan: record.plan,
    planLabel: PLANS[record.plan].label,
    clientTarget: record.clientTarget,
    durationDays: record.durationDays,
    quantity: record.quantity,
    status: record.status,
    nextAction: record.status === "pending_admin_review" ? "admin_review_required" : record.nextAction,
    submittedAt: record.submittedAt,
    updatedAt: record.updatedAt,
    reviewedAt: record.reviewedAt,
    reviewedByRef: record.reviewedByRef,
    safeReasonCode: record.safeReasonCode,
    priorTrialState: record.priorTrialState,
    expiresAt: record.expiresAt,
    validUntil: record.validUntil,
    entitlementRef: record.entitlementRef,
    accessGrantRef: record.accessGrantRef,
    subscriptionUrl: record.status === "disabled" || !record.subscriptionUrl ? undefined : record.subscriptionUrl,
    event: record.event,
    safety: {
      noSubscriptionUrl: !record.subscriptionUrl,
      noRawCustomerData: true,
      noRawHandoffMaterial: true,
      noEntitlementCreated: !record.entitlementRef,
      noRuntimeMutation: true,
      noProductionMutation: true
    }
  };
}

function edgeOrderSummaryFor(record) {
  return {
    id: record.id,
    portalUserRef: record.portalUserRef,
    plan: record.plan,
    clientTarget: record.clientTarget,
    durationDays: record.durationDays,
    quantity: record.quantity,
    status: record.status,
    submittedAt: record.submittedAt,
    updatedAt: record.updatedAt,
    expiresAt: record.expiresAt,
    validUntil: record.validUntil,
    entitlementRef: record.entitlementRef,
    accessGrantRef: record.accessGrantRef
  };
}

export function createPortalAccessRequestService(options = {}) {
  const nowFn = options.nowFn || (() => new Date());
  const requestIdFactory = options.requestIdFactory;
  const runtimeCore = options.runtimeCore;
  const edgeLifecycleService = options.edgeLifecycleService;
  const requests = new Map();
  let sequence = 0;

  function getRecord(id) {
    const request = requests.get(text(id, "requestRef"));
    if (!request) {
      throw platformError("not_found", "portal access request not found");
    }
    return request;
  }

  function requireRuntimeMethod(method) {
    if (!runtimeCore || typeof runtimeCore[method] !== "function") {
      throw platformError("validation_error", "portal order lifecycle service is not configured");
    }
    return runtimeCore[method].bind(runtimeCore);
  }

  function notifyEdgeLifecycle(reason, request) {
    if (!edgeLifecycleService) {
      return null;
    }
    if (typeof edgeLifecycleService.reconcileOrderLifecycle !== "function") {
      throw platformError("validation_error", "edge lifecycle service is not configured");
    }
    const result = edgeLifecycleService.reconcileOrderLifecycle({
      reason,
      order: edgeOrderSummaryFor(request)
    });
    if (result?.ok === false) {
      throw platformError("edge_lifecycle_failed", "edge lifecycle reconciliation failed");
    }
    return result;
  }

  function getOwnedDeliveredRecord(input = {}) {
    const request = getRecord(input.requestRef);
    const portalUserRef = text(input.portalUserRef, "portalUserRef");
    if (request.portalUserRef !== portalUserRef) {
      throw platformError("not_found", "portal access request not found");
    }
    if (!["delivered", "issued"].includes(request.status)) {
      throw platformError("validation_error", "subscription order is not active");
    }
    return request;
  }

  function hasPriorTrial(portalUserRef) {
    return [...requests.values()].some((request) =>
      request.portalUserRef === portalUserRef
      && request.plan === "trial"
    );
  }

  return {
    submitRequest(input = {}) {
      const now = isoNow(nowFn);
      const plan = normalizePlan(input.plan);
      const portalUserRef = text(input.portalUserRef, "portalUserRef");
      if (plan === "trial" && hasPriorTrial(portalUserRef)) {
        throw platformError("validation_error", "trial request already exists for this account");
      }
      sequence += 1;
      const record = {
        id: text(input.requestRef || requestIdFactory?.() || nextRequestId(now, sequence), "requestRef"),
        portalUserRef,
        plan,
        clientTarget: normalizeClientTarget(input.clientTarget),
        durationDays: PLANS[plan].durationDays,
        quantity: normalizeQuantity(input.quantity),
        status: "pending_admin_review",
        nextAction: "admin_review_required",
        noteProvided: Boolean(String(input.note || "").trim()),
        priorTrialState: plan === "trial" ? "none" : "not_applicable",
        submittedAt: now,
        updatedAt: now,
        reviewedAt: null,
        reviewedByRef: null,
        safeReasonCode: null,
        expiresAt: null,
        validUntil: null,
        entitlementRef: null,
        accessGrantRef: null,
        tenantId: null,
        artifactId: null,
        subscriptionUrl: null,
        event: null
      };
      requests.set(record.id, record);
      return summaryFor(record);
    },

    listRequests(filters = {}) {
      const status = String(filters.status || "").trim();
      const portalUserRef = String(filters.portalUserRef || "").trim();
      return [...requests.values()]
        .filter((request) => !status || request.status === status)
        .filter((request) => !portalUserRef || request.portalUserRef === portalUserRef)
        .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt) || a.id.localeCompare(b.id))
        .map(summaryFor);
    },

    getRequest(id) {
      return summaryFor(getRecord(id));
    },

    rejectRequest(id, input = {}) {
      const now = isoNow(nowFn);
      const request = getRecord(id);
      request.status = "rejected";
      request.nextAction = "request_closed";
      request.reviewedAt = now;
      request.reviewedByRef = text(input.reviewedByRef, "reviewedByRef");
      request.safeReasonCode = text(input.reasonCode, "reasonCode");
      request.updatedAt = now;
      return summaryFor(request);
    },

    previewApproval(id, input = {}) {
      const request = getRecord(id);
      const reviewedByRef = text(input.reviewedByRef, "reviewedByRef");
      const approvalRef = text(input.approvalRef, "approvalRef");
      const nodeId = text(input.nodeId, "nodeId");
      const reviewedAt = isoNow(nowFn);
      const expiresAt = expiresAtFromDuration(reviewedAt, request.durationDays);
      return {
        ok: true,
        mode: "portal-access-request-approval-preview",
        status: "approved_pending_delivery",
        request: summaryFor({
          ...request,
          status: "approved_pending_delivery",
          nextAction: "admin_delivery_required",
          reviewedAt,
          reviewedByRef,
          expiresAt,
          validUntil: expiresAt
        }),
        issuanceInput: {
          displayName: request.portalUserRef,
          expiresInDays: request.durationDays,
          expiresAt,
          validUntil: expiresAt,
          plan: request.plan,
          nodeId,
          note: `portal-access-request:${request.id}`,
          artifact: { create: true },
          control: {
            accountId: request.portalUserRef,
            ownerRef: request.portalUserRef,
            entitlementId: `ent_${request.id}`,
            requestId: request.id,
            requestedByRef: reviewedByRef,
            purpose: "portal_access_request",
            plan: request.plan
          }
        },
        approvalRef,
        safety: {
          previewOnly: true,
          noSubscriptionUrl: true,
          noRawHandoffMaterial: true,
          noRuntimeMutation: true,
          noProductionMutation: true,
          requiresSeparateIssuanceExecution: true
        }
      };
    },

    markDelivered(id, input = {}) {
      const now = isoNow(nowFn);
      const request = getRecord(id);
      const expiresAt = input.expiresAt || input.validUntil
        ? isoText(input.expiresAt || input.validUntil, "expiresAt")
        : expiresAtFromDuration(now, request.durationDays);
      request.status = "delivered";
      request.nextAction = "user_can_use_access";
      request.reviewedByRef = request.reviewedByRef || text(input.reviewedByRef, "reviewedByRef");
      request.reviewedAt = request.reviewedAt || now;
      request.expiresAt = expiresAt;
      request.validUntil = expiresAt;
      request.entitlementRef = text(input.entitlementRef, "entitlementRef");
      request.accessGrantRef = text(input.accessGrantRef, "accessGrantRef");
      request.tenantId = optionalText(input.tenantId);
      request.artifactId = optionalText(input.artifactId);
      request.subscriptionUrl = optionalText(input.subscriptionUrl);
      request.event = null;
      request.updatedAt = now;
      return summaryFor(request);
    },

    refreshSubscription(input = {}) {
      const now = isoNow(nowFn);
      const request = getOwnedDeliveredRecord(input);
      if (!request.artifactId) {
        throw platformError("validation_error", "subscription artifact is not available");
      }

      const rotateArtifact = requireRuntimeMethod("rotateSubscriptionArtifact");
      const rotated = rotateArtifact(request.artifactId);
      request.artifactId = text(rotated?.replacement?.id, "artifactId");
      request.subscriptionUrl = text(rotated?.subscriptionUrl, "subscriptionUrl");
      request.clientTarget = normalizeClientTarget(input.clientTarget || request.clientTarget);
      request.event = {
        type: "old_link_invalidated",
        occurredAt: now
      };
      request.updatedAt = now;
      notifyEdgeLifecycle("order_refreshed", request);
      return summaryFor(request);
    },

    disableSubscription(input = {}) {
      const now = isoNow(nowFn);
      const request = getOwnedDeliveredRecord(input);

      if (request.artifactId) {
        requireRuntimeMethod("revokeSubscriptionArtifact")(request.artifactId);
      }
      if (request.tenantId) {
        requireRuntimeMethod("disableTenant")(request.tenantId);
      }

      request.status = "disabled";
      request.nextAction = "subscription_disabled";
      request.subscriptionUrl = null;
      request.event = null;
      request.updatedAt = now;
      notifyEdgeLifecycle("order_disabled", request);
      return summaryFor(request);
    }
  };
}
