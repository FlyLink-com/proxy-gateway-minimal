import { normalizePlatformLead } from "./control-plane-contract.mjs";

function platformError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function isoNow(nowFn) {
  const value = nowFn();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw platformError("validation_error", "now must be a valid date");
  }
  return date.toISOString();
}

function nextLeadId(now, sequence) {
  return `lead_${new Date(now).getTime().toString(36)}_${sequence.toString(36)}`;
}

export function createPlatformLeadReviewSummary(lead) {
  return {
    id: lead.id,
    type: "platform_lead_summary",
    status: lead.status,
    organization: lead.organization,
    email: lead.email,
    direction: lead.direction,
    stage: lead.stage,
    source: lead.source,
    hasMessage: Boolean(lead.message),
    createdAt: lead.createdAt,
    updatedAt: lead.updatedAt
  };
}

export function createPlatformLeadReviewQueue(options = {}) {
  const nowFn = options.nowFn || (() => new Date());
  const idFactory = options.idFactory;
  const leads = new Map();
  let sequence = 0;

  function normalizeForInsert(payload) {
    const now = isoNow(nowFn);
    sequence += 1;
    return normalizePlatformLead(payload, {
      now,
      idFactory: () => idFactory?.() || nextLeadId(now, sequence)
    });
  }

  function getStoredLead(id) {
    const lead = leads.get(String(id || "").trim());
    if (!lead) {
      throw platformError("not_found", "lead not found");
    }
    return lead;
  }

  return {
    enqueueLead(payload) {
      const lead = normalizeForInsert(payload);
      leads.set(lead.id, lead);
      return createPlatformLeadReviewSummary(lead);
    },

    listLeads(filters = {}) {
      const status = String(filters.status || "").trim();
      return [...leads.values()]
        .filter((lead) => !status || lead.status === status)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
        .map(createPlatformLeadReviewSummary);
    },

    getLead(id) {
      return { ...getStoredLead(id) };
    },

    updateLeadStatus(id, payload = {}) {
      if (!Object.hasOwn(payload, "status")) {
        throw platformError("validation_error", "status is required");
      }
      const existing = getStoredLead(id);
      const updatedAt = isoNow(nowFn);
      const updated = normalizePlatformLead({
        ...existing,
        status: payload.status,
        updatedAt
      }, { now: existing.createdAt });
      leads.set(updated.id, updated);
      return createPlatformLeadReviewSummary(updated);
    }
  };
}
