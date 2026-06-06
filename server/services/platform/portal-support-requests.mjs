const CATEGORIES = new Set([
  "subscription",
  "client_import",
  "account_security",
  "other"
]);

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

function normalizeCategory(category) {
  const normalized = text(category, "category");
  if (!CATEGORIES.has(normalized)) {
    throw platformError("validation_error", "category is invalid");
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

function normalizeMessage(message) {
  const normalized = text(message, "message").replace(/\s+/g, " ");
  if (normalized.length < 6 || normalized.length > 1200) {
    throw platformError("validation_error", "message length is invalid");
  }
  return normalized;
}

function nextRequestId(now, sequence) {
  return `psup_${new Date(now).getTime().toString(36)}_${sequence.toString(36)}`;
}

function summaryFor(record) {
  return {
    id: record.id,
    type: "portal_support_request_summary",
    portalUserRef: record.portalUserRef,
    category: record.category,
    clientTarget: record.clientTarget,
    subscriptionRequestRef: record.subscriptionRequestRef,
    status: record.status,
    messageProvided: true,
    messageLength: record.message.length,
    submittedAt: record.submittedAt,
    updatedAt: record.updatedAt,
    safety: {
      noSubscriptionUrl: true,
      noRawMessageReturned: true,
      noRawCustomerData: true,
      noPaymentActivation: true,
      noRuntimeMutation: true,
      noProductionMutation: true
    }
  };
}

export function createPortalSupportRequestService(options = {}) {
  const nowFn = options.nowFn || (() => new Date());
  const requestIdFactory = options.requestIdFactory;
  const requests = new Map();
  let sequence = 0;

  return {
    submitRequest(input = {}) {
      const now = isoNow(nowFn);
      const message = normalizeMessage(input.message);
      sequence += 1;
      const record = {
        id: text(input.requestRef || requestIdFactory?.() || nextRequestId(now, sequence), "requestRef"),
        portalUserRef: text(input.portalUserRef, "portalUserRef"),
        category: normalizeCategory(input.category),
        clientTarget: normalizeClientTarget(input.clientTarget),
        subscriptionRequestRef: optionalText(input.subscriptionRequestRef),
        status: "submitted",
        message,
        submittedAt: now,
        updatedAt: now
      };
      requests.set(record.id, record);
      return summaryFor(record);
    },

    listRequests(filters = {}) {
      const portalUserRef = String(filters.portalUserRef || "").trim();
      return [...requests.values()]
        .filter((request) => !portalUserRef || request.portalUserRef === portalUserRef)
        .map(summaryFor);
    }
  };
}
