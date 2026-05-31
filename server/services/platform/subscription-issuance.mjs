import { createHash } from "node:crypto";
import { normalizeNote } from "../subscriptions/validation.mjs";

function safeRef(prefix, value) {
  return `${prefix}ref_${createHash("sha256").update(String(value)).digest("hex").slice(0, 16)}`;
}

export function validateIssuanceInput(input) {
  if (!input) throw new Error("input is required");
  if (!String(input.nodeId || "").trim()) {
    throw new Error("nodeId is mandatory for real issuance. Implicit default node assignment is forbidden.");
  }
  if (input.artifact?.create !== true) {
    throw new Error("artifact.create must be true. Production issuance must deliver opaque artifacts, not legacy query-token URLs.");
  }
  normalizeNote(input.note);

  const control = input.control || {};
  const requiredControlFields = [
    "accountId",
    "ownerRef",
    "entitlementId",
    "requestId",
    "requestedByRef",
    "purpose"
  ];
  for (const field of requiredControlFields) {
    if (!String(control[field] || "").trim()) {
      throw new Error(`control.${field} is mandatory for real issuance.`);
    }
  }
  return input;
}

/**
 * executeSubscriptionIssuance orchestrates the creation of a runtime tenant/artifact
 * and the corresponding business control records.
 *
 * Safety Constraints:
 * - It DOES NOT access filesystem, process.argv, or process.env.
 * - It DOES NOT perform HTTP request/response operations.
 * - `handoffMaterial` contains raw secrets and MUST NOT be leaked to public API responses.
 * - `summary` is safe and contains NO raw URLs, tokens, or email fields.
 */
export function executeSubscriptionIssuance({ controlStore, runtimeCore, input, approvalRef, now }) {
  if (!controlStore) throw new Error("controlStore is required");
  if (!runtimeCore) throw new Error("runtimeCore is required");
  if (!approvalRef) throw new Error("approvalRef is required");
  if (!now) throw new Error("now is required");

  validateIssuanceInput(input);
  const control = input.control;

  // Account
  if (!controlStore.getAccount(control.accountId)) {
    controlStore.createAccount({
      id: control.accountId,
      ownerRef: control.ownerRef,
      status: control.accountStatus || "active",
      createdAt: now,
      updatedAt: now,
      metadata: {
        source: "platform-issue-subscription",
        approvalRef
      }
    });
  }

  // Entitlement
  if (!controlStore.getEntitlement(control.entitlementId)) {
    controlStore.createEntitlement({
      id: control.entitlementId,
      accountId: control.accountId,
      plan: control.plan || "pilot",
      status: control.entitlementStatus || "active",
      validFrom: control.validFrom || now,
      validUntil: input.expiresAt,
      maxArtifacts: control.maxArtifacts ?? 1,
      maxDevices: control.maxDevices ?? 1,
      trafficLimitBytes: control.trafficLimitBytes ?? 0,
      createdAt: now,
      updatedAt: now
    });
  }

  // Issuance request
  controlStore.createIssuanceRequest({
    id: control.requestId,
    accountId: control.accountId,
    entitlementId: control.entitlementId,
    approvalRef,
    status: "planned",
    quantity: 1,
    nodeId: input.nodeId,
    purpose: control.purpose,
    requestedByRef: control.requestedByRef,
    createdAt: now,
    updatedAt: now,
    metadata: {
      cli: "platform:issue-subscription"
    }
  });

  // 1. Create Tenant (Runtime)
  const tenantResult = runtimeCore.createTenant({
    displayName: input.displayName,
    nodeId: input.nodeId,
    expiresAt: input.expiresAt,
    note: ""
  });

  // 2. Create Artifact (Runtime)
  const artifactResult = runtimeCore.createSubscriptionArtifact(tenantResult.tenant.id);
  const tenantRef = safeRef("tenant", tenantResult.tenant.id);
  const artifactRef = safeRef("artifact", artifactResult.artifact.id);
  const issuedAt = now;

  controlStore.linkIssuedSubscription({
    id: `${control.requestId}_link_1`,
    requestId: control.requestId,
    tenantRef,
    artifactRef,
    status: "active",
    createdAt: issuedAt,
    updatedAt: issuedAt
  });
  controlStore.setIssuanceRequestStatus(control.requestId, {
    status: "issued",
    updatedAt: issuedAt
  });
  controlStore.upsertQuotaCounter({
    accountId: control.accountId,
    entitlementId: control.entitlementId,
    metric: "artifact_issuance",
    period: issuedAt.slice(0, 7),
    amount: 1,
    updatedAt: issuedAt
  });
  controlStore.recordAuditEvent({
    id: `${control.requestId}_audit_issued`,
    entityType: "issuance_request",
    entityRef: control.requestId,
    action: "issued",
    actorRef: control.requestedByRef,
    createdAt: issuedAt,
    metadata: {
      source: "platform:issue-subscription"
    }
  });

  // 3. Prepare separated materials
  const handoffMaterial = {
    approvalRef,
    tenantId: tenantResult.tenant.id,
    artifactId: artifactResult.artifact.id,
    subscriptionUrl: artifactResult.subscriptionUrl,
    issuedAt
  };

  const summary = {
    ok: true,
    mode: "platform-issue-subscription",
    accountRef: safeRef("account", control.accountId),
    issuanceRequestRef: control.requestId,
    tenantRef,
    artifactRef,
    nodeId: tenantResult.tenant.nodeId,
    expiresAt: tenantResult.tenant.expiresAt,
    handoffRequired: true,
    rawUrlReturned: false,
    dbMutated: true,
    controlDbMutated: true,
    approvalRef
  };

  return { summary, handoffMaterial };
}
