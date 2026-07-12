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
  const store = options.store;
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
    const normalizedId = String(id || "").trim();
    const lead = store?.getLead ? store.getLead(normalizedId) : leads.get(normalizedId);
    if (!lead) {
      throw platformError("not_found", "lead not found");
    }
    return lead;
  }

  function saveLead(lead) {
    if (store?.upsertLead) {
      return store.upsertLead(lead);
    }
    leads.set(lead.id, lead);
    return lead;
  }

  function recordLeadEvent(lead, eventType) {
    if (!store?.recordOperationsEvent) return;
    store.recordOperationsEvent({
      eventRef: `opsevt_${eventType}_${lead.id}`,
      eventType,
      idempotencyKey: `${eventType}:${lead.id}`,
      leadRef: lead.id,
      occurredAt: lead.updatedAt
    });
  }

  return {
    enqueueLead(payload) {
      const lead = normalizeForInsert(payload);
      saveLead(lead);
      recordLeadEvent(lead, "lead_created");
      return createPlatformLeadReviewSummary(lead);
    },

    listLeads(filters = {}) {
      const status = String(filters.status || "").trim();
      const storedLeads = store?.listLeads ? store.listLeads({ status }) : [...leads.values()];
      return storedLeads
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
      saveLead(updated);
      if (updated.status === "reviewing") recordLeadEvent(updated, "lead_review_started");
      if (updated.status === "converted") recordLeadEvent(updated, "lead_converted");
      return createPlatformLeadReviewSummary(updated);
    }
  };
}
