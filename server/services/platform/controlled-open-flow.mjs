import { createPlatformAccountEntitlementShell } from "./account-entitlement-shell.mjs";
import { createPlatformLeadReviewQueue } from "./lead-review-queue.mjs";
import { buildPlatformResourcePackage } from "./resource-package.mjs";
import { createPlatformSubscriptionAccessShell } from "./subscription-access-shell.mjs";

function text(value) {
  return String(value ?? "").trim();
}

function generatedAtFor(input) {
  const raw = text(input.generatedAt);
  if (!raw) {
    return new Date().toISOString();
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw new Error("generatedAt must be a valid date");
  }
  return date.toISOString();
}

function requireAccessReference(accessGrant = {}) {
  if (!text(accessGrant.entryRef) && !text(accessGrant.artifactRef)) {
    throw new Error("accessGrant requires entryRef or artifactRef");
  }
}

function safeOperator(input = {}) {
  return {
    source: "platform-controlled-open",
    requestedBy: input.operator?.requestedBy
  };
}

export function buildPlatformControlledOpenPackage(input = {}) {
  const generatedAt = generatedAtFor(input);
  requireAccessReference(input.accessGrant);

  const nowFn = () => new Date(generatedAt);
  const leadQueue = createPlatformLeadReviewQueue({ nowFn });
  const accountShell = createPlatformAccountEntitlementShell({ nowFn });
  const accessShell = createPlatformSubscriptionAccessShell({ accountShell, nowFn });

  const leadSummary = leadQueue.enqueueLead(input.lead || {});
  leadQueue.updateLeadStatus(leadSummary.id, { status: "reviewing" });
  const lead = leadQueue.getLead(leadSummary.id);

  const accountSummary = accountShell.createAccountFromLead(lead, {
    ...(input.account || {}),
    status: input.account?.status || "active"
  });
  leadQueue.updateLeadStatus(lead.id, { status: "converted" });
  const account = accountShell.getAccount(accountSummary.id);

  const entitlementSummary = accountShell.createEntitlement(account.id, {
    ...(input.entitlement || {}),
    status: input.entitlement?.status || "active"
  });
  const entitlement = accountShell.getEntitlement(entitlementSummary.id);

  const accessSummary = accessShell.issueDynamicEntry(account.id, entitlement.id, input.accessGrant || {});
  const resourcePackage = buildPlatformResourcePackage({
    generatedAt,
    account,
    entitlement,
    accessGrant: {
      id: accessSummary.id,
      accountId: accessSummary.accountId,
      entitlementId: accessSummary.entitlementId,
      status: accessSummary.status,
      delivery: accessSummary.delivery,
      entryRef: input.accessGrant?.entryRef,
      artifactRef: input.accessGrant?.artifactRef,
      visibleOnce: input.accessGrant?.visibleOnce,
      issuedAt: accessSummary.issuedAt,
      updatedAt: accessSummary.updatedAt
    },
    activationPackage: input.activationPackage,
    operator: safeOperator(input)
  });

  return {
    ...resourcePackage,
    mode: "platform-controlled-open",
    flow: {
      leadAccepted: true,
      leadReviewed: true,
      leadConverted: true,
      accountProvisioned: true,
      entitlementCreated: true,
      accessIssued: true,
      operatorControlled: true
    },
    audit: {
      ...resourcePackage.audit,
      recordType: "platform_controlled_open_summary",
      evidenceKinds: [
        ...resourcePackage.audit.evidenceKinds,
        "lead_review_queue_summary",
        "controlled_open_flow_summary"
      ]
    },
    safety: {
      ...resourcePackage.safety,
      noPublicAdmin: true,
      noPersistence: true,
      noPaymentActivation: true,
      noProductionMutation: true,
      operatorControlledOnly: true,
      requiresSeparateRiskAApprovalForRuntime: true
    }
  };
}
