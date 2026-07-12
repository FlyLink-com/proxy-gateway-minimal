const EVENT_FIELDS = {
  lead_created: "leadCreated",
  lead_review_started: "leadReviewStarted",
  lead_converted: "leadConverted",
  registration_completed: "registrationCompleted",
  access_requested: "accessRequested",
  access_approved: "accessApproved",
  delivery_completed: "deliveryCompleted",
  first_usage_observed: "firstUsageObserved",
  entitlement_expired: "entitlementExpired",
  renewal_completed: "renewalCompleted"
};

export function createOperationsFoundationSummary({ leadQueue, controlStore } = {}) {
  const leads = leadQueue?.listLeads?.() || [];
  const events = controlStore?.listOperationsEvents?.() || [];
  const leadCounts = {
    total: leads.length,
    new: 0,
    reviewing: 0,
    converted: 0,
    rejected: 0
  };
  for (const lead of leads) {
    if (Object.hasOwn(leadCounts, lead.status)) leadCounts[lead.status] += 1;
  }
  const eventCounts = Object.fromEntries(Object.values(EVENT_FIELDS).map((field) => [field, 0]));
  for (const event of events) {
    const field = EVENT_FIELDS[event.eventType];
    if (field) eventCounts[field] += 1;
  }
  const requestRefs = new Set(controlStore?.listPortalAccessRequests?.().map((request) => request.id) || []);
  const accountRefs = new Set(controlStore?.listAccounts?.().map((account) => account.id) || []);
  return {
    type: "operations_foundation_summary",
    leads: leadCounts,
    events: eventCounts,
    dataQuality: {
      missingLeadRefs: events.filter((event) => event.leadRef && !leads.some((lead) => lead.id === event.leadRef)).length,
      missingAccountRefs: events.filter((event) => event.accountRef && !accountRefs.has(event.accountRef)).length,
      missingRequestRefs: events.filter((event) => event.requestRef && !requestRefs.has(event.requestRef)).length
    },
    safety: {
      summaryOnly: true,
      rawCustomerDataReturned: false,
      rawCredentialReturned: false,
      rawSubscriptionUrlReturned: false
    }
  };
}
