import { normalizePlatformLead } from "./control-plane-contract.mjs";

export const PLATFORM_LEAD_RETENTION_DAYS = 90;

const PLATFORM_LEAD_RETENTION_MS = PLATFORM_LEAD_RETENTION_DAYS * 24 * 60 * 60 * 1000;

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

function retentionUntil(updatedAt) {
  return new Date(new Date(updatedAt).getTime() + PLATFORM_LEAD_RETENTION_MS).toISOString();
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
  const store = options.store || null;
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

  function purgeStoredLeads(now) {
    if (!store) {
      return 0;
    }
    return store.purgeExpiredLeads({ now });
  }

  function getStoredLead(id) {
    const normalizedId = String(id || "").trim();
    const lead = store ? store.getLead(normalizedId) : leads.get(normalizedId);
    if (!lead) {
      throw platformError("not_found", "lead not found");
    }
    return lead;
  }

  return {
    enqueueLead(payload) {
      const lead = normalizeForInsert(payload);
      if (store) {
        purgeStoredLeads(lead.updatedAt);
        store.upsertLead(lead, { expiresAt: retentionUntil(lead.updatedAt) });
      } else {
        leads.set(lead.id, lead);
      }
      return createPlatformLeadReviewSummary(lead);
    },

    listLeads(filters = {}) {
      const status = String(filters.status || "").trim();
      if (store) {
        purgeStoredLeads(isoNow(nowFn));
      }
      const storedLeads = store ? store.listLeads({ status }) : [...leads.values()];
      return storedLeads
        .filter((lead) => !status || lead.status === status)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
        .map(createPlatformLeadReviewSummary);
    },

    getLead(id) {
      if (store) {
        purgeStoredLeads(isoNow(nowFn));
      }
      return { ...getStoredLead(id) };
    },

    updateLeadStatus(id, payload = {}) {
      if (!Object.hasOwn(payload, "status")) {
        throw platformError("validation_error", "status is required");
      }
      const updatedAt = isoNow(nowFn);
      if (store) {
        purgeStoredLeads(updatedAt);
      }
      const existing = getStoredLead(id);
      const updated = normalizePlatformLead({
        ...existing,
        status: payload.status,
        updatedAt
      }, { now: existing.createdAt });
      if (store) {
        store.upsertLead(updated, { expiresAt: retentionUntil(updated.updatedAt) });
      } else {
        leads.set(updated.id, updated);
      }
      return createPlatformLeadReviewSummary(updated);
    },

    purgeExpiredLeads() {
      return purgeStoredLeads(isoNow(nowFn));
    }
  };
}
