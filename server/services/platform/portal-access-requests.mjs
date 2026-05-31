const PLANS = {
  trial: { durationDays: 7, label: "7-day trial" },
  monthly: { durationDays: 30, label: "monthly" },
  yearly: { durationDays: 365, label: "yearly" }
};

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

function isoNow(nowFn) {
  const value = nowFn();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw platformError("validation_error", "now must be a valid date");
  }
  return date.toISOString();
}

function safeEmail(value) {
  const email = text(value, "email").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw platformError("validation_error", "email is invalid");
  }
  return email;
}

function safeTelegram(value) {
  const normalized = text(value, "telegram");
  if (/\s/.test(normalized) || normalized.length > 64) {
    throw platformError("validation_error", "telegram is invalid");
  }
  return normalized.startsWith("@") || normalized.startsWith("https://t.me/")
    ? normalized
    : `@${normalized}`;
}

function safePhone(value) {
  const normalized = text(value, "phone").replace(/\s+/g, " ");
  if (!/^[+\d][\d ()-]{5,31}$/.test(normalized)) {
    throw platformError("validation_error", "phone is invalid");
  }
  return normalized;
}

function normalizePlan(plan) {
  const normalized = text(plan, "plan");
  if (!Object.hasOwn(PLANS, normalized)) {
    throw platformError("validation_error", "plan is invalid");
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
    displayName: record.displayName,
    email: record.email,
    plan: record.plan,
    planLabel: PLANS[record.plan].label,
    durationDays: record.durationDays,
    status: record.status,
    nextAction: record.status === "pending_admin_review" ? "admin_review_required" : record.nextAction,
    submittedAt: record.submittedAt,
    updatedAt: record.updatedAt,
    reviewedAt: record.reviewedAt,
    reviewedByRef: record.reviewedByRef,
    safeReasonCode: record.safeReasonCode,
    contactComplete: record.contactComplete,
    priorTrialState: record.priorTrialState,
    entitlementRef: record.entitlementRef,
    accessGrantRef: record.accessGrantRef,
    safety: {
      noSubscriptionUrl: true,
      noRawContactNote: true,
      noRawHandoffMaterial: true,
      noEntitlementCreated: !record.entitlementRef,
      noRuntimeMutation: true,
      noProductionMutation: true
    }
  };
}

export function createPortalAccessRequestService(options = {}) {
  const nowFn = options.nowFn || (() => new Date());
  const requestIdFactory = options.requestIdFactory;
  const requests = new Map();
  let sequence = 0;

  function getRecord(id) {
    const request = requests.get(text(id, "requestRef"));
    if (!request) {
      throw platformError("not_found", "portal access request not found");
    }
    return request;
  }

  function hasPriorTrial(portalUserRef) {
    return [...requests.values()].some((request) =>
      request.portalUserRef === portalUserRef
      && request.plan === "trial"
      && !["rejected", "cancelled"].includes(request.status)
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
      const contact = input.contact || {};
      const record = {
        id: text(input.requestRef || requestIdFactory?.() || nextRequestId(now, sequence), "requestRef"),
        portalUserRef,
        displayName: text(input.displayName, "displayName").slice(0, 80),
        email: safeEmail(input.email),
        plan,
        durationDays: PLANS[plan].durationDays,
        status: "pending_admin_review",
        nextAction: "admin_review_required",
        contact: {
          email: safeEmail(contact.email),
          phone: safePhone(contact.phone),
          telegram: safeTelegram(contact.telegram)
        },
        contactComplete: true,
        noteProvided: Boolean(String(input.note || "").trim()),
        priorTrialState: plan === "trial" ? "none" : "not_applicable",
        submittedAt: now,
        updatedAt: now,
        reviewedAt: null,
        reviewedByRef: null,
        safeReasonCode: null,
        entitlementRef: null,
        accessGrantRef: null
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
      return {
        ok: true,
        mode: "portal-access-request-approval-preview",
        status: "approved_pending_delivery",
        request: summaryFor({
          ...request,
          status: "approved_pending_delivery",
          nextAction: "admin_delivery_required",
          reviewedAt: isoNow(nowFn),
          reviewedByRef
        }),
        issuanceInput: {
          displayName: request.displayName,
          expiresInDays: request.durationDays,
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
      request.status = "delivered";
      request.nextAction = "user_can_use_access";
      request.reviewedByRef = request.reviewedByRef || text(input.reviewedByRef, "reviewedByRef");
      request.reviewedAt = request.reviewedAt || now;
      request.entitlementRef = text(input.entitlementRef, "entitlementRef");
      request.accessGrantRef = text(input.accessGrantRef, "accessGrantRef");
      request.updatedAt = now;
      return summaryFor(request);
    }
  };
}
