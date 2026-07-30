import { createHash } from "node:crypto";
import { normalizeNote } from "../subscriptions/validation.mjs";
import { trafficLimitBytesForPlan } from "./subscription-package-policy.mjs";

function safeRef(prefix, value) {
  return `${prefix}ref_${createHash("sha256").update(String(value)).digest("hex").slice(0, 16)}`;
}

function validationError(msg) {
  const err = new Error(msg);
  err.code = "validation_error";
  return err;
}

function canonicalTimestamp(value, field) {
  const raw = String(value ?? "").trim();
  const date = new Date(raw);
  if (!raw || Number.isNaN(date.getTime())) {
    throw validationError(`${field} must be a valid ISO timestamp`);
  }
  return date.toISOString();
}

function bestEffort(step) {
  try {
    step();
    return true;
  } catch {
    return false;
  }
}

function compensateRuntimeMutation({ runtimeCore, tenantResult, artifactResult }) {
  const result = {
    artifactRevoked: false,
    tenantDisabled: false
  };

  if (artifactResult?.artifact?.id && typeof runtimeCore.revokeSubscriptionArtifact === "function") {
    result.artifactRevoked = bestEffort(() => runtimeCore.revokeSubscriptionArtifact(artifactResult.artifact.id));
  }

  if (tenantResult?.tenant?.id && typeof runtimeCore.disableTenant === "function") {
    result.tenantDisabled = bestEffort(() => runtimeCore.disableTenant(tenantResult.tenant.id));
  }

  return result;
}

function recordCompensatedFailure({ controlStore, control, tenantRef, artifactRef, issuedAt, compensation }) {
  bestEffort(() => controlStore.setIssuanceRequestStatus(control.requestId, {
    status: "failed",
    updatedAt: issuedAt
  }));

  if (tenantRef && artifactRef && typeof controlStore.recordRevocation === "function") {
    bestEffort(() => controlStore.recordRevocation({
      id: `${control.requestId}_compensation_revocation`,
      requestId: control.requestId,
      issuedLinkId: null,
      tenantRef,
      artifactRef,
      reasonCode: "issuance_compensation",
      revokedByRef: control.requestedByRef,
      createdAt: issuedAt
    }));
  }

  bestEffort(() => controlStore.recordAuditEvent({
    id: `${control.requestId}_audit_failed`,
    entityType: "issuance_request",
    entityRef: control.requestId,
    action: "issuance_failed_compensated",
    actorRef: control.requestedByRef,
    createdAt: issuedAt,
    metadata: {
      compensation
    }
  }));
}

function runControlFinalization(controlStore, finalize) {
  if (typeof controlStore.runInTransaction === "function") {
    return controlStore.runInTransaction(finalize);
  }
  return finalize();
}

export function validateIssuanceInput(input, { now = null } = {}) {
  function throwError(msg) {
    throw validationError(msg);
  }

  if (!input) throwError("input is required");
  if (!String(input.nodeId || "").trim()) {
    throwError("nodeId is mandatory for real issuance. Implicit default node assignment is forbidden.");
  }
  if (input.artifact?.create !== true) {
    throwError("artifact.create must be true. Production issuance must deliver opaque artifacts, not legacy query-token URLs.");
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
      throwError(`control.${field} is mandatory for real issuance.`);
    }
  }
  const validUntil = canonicalTimestamp(input.expiresAt, "expiresAt");
  const effectiveValidFrom = control.validFrom || now;
  if (effectiveValidFrom) {
    const validFrom = canonicalTimestamp(effectiveValidFrom, "validFrom");
    if (validFrom >= validUntil) {
      throwError("validFrom must be before expiresAt");
    }
  }
  return input;
}

/**
 * previewSubscriptionIssuance validates the input and returns an execution plan
 * without performing any mutation.
 */
export function previewSubscriptionIssuance({ input, now = new Date().toISOString() }) {
  validateIssuanceInput(input, { now });
  const control = input.control;

  return {
    ok: true,
    action: "issuance_preview",
    nodeId: input.nodeId,
    accountRef: safeRef("account", control.accountId),
    requestId: control.requestId,
    plan: control.plan || "pilot",
    safety: {
      runtimeDbMutated: false,
      controlDbMutated: false,
      rawUrlReturned: false,
      tenantCreated: false
    }
  };
}

/**
 * planSubscriptionIssuance persists the issuance intent into the control database
 * in a 'planned' state. It DOES NOT create a runtime tenant or artifact.
 */
export function planSubscriptionIssuance({ controlStore, input, approvalRef, now }) {
  if (!controlStore) throw new Error("controlStore is required");
  if (!approvalRef) throw validationError("approvalRef is mandatory for planned issuance request.");
  if (!now) throw new Error("now is required");

  validateIssuanceInput(input, { now });
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
        source: "platform-plan-subscription",
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
      trafficLimitBytes: trafficLimitBytesForPlan(
        control.plan,
        control.trafficLimitBytes ?? 0
      ),
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

  return {
    ok: true,
    action: "issuance_planned",
    requestId: control.requestId,
    accountRef: safeRef("account", control.accountId),
    nodeId: input.nodeId,
    fulfillment: {
      required: true,
      executor: "operator-cli",
      requestId: control.requestId,
      status: "pending_cli_fulfill_request_support",
      nextCapability: "CLI fulfillment by planned request is intentionally out of scope for this API PR."
    },
    safety: {
      runtimeDbMutated: false,
      controlDbMutated: true,
      rawUrlReturned: false,
      tenantCreated: false
    }
  };
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

  validateIssuanceInput(input, { now });
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
      trafficLimitBytes: trafficLimitBytesForPlan(
        control.plan,
        control.trafficLimitBytes ?? 0
      ),
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

  let tenantResult;
  let artifactResult;
  let tenantRef;
  let artifactRef;
  const issuedAt = now;

  try {
    // 1. Create Tenant (Runtime)
    tenantResult = runtimeCore.createTenant({
      displayName: input.displayName,
      nodeId: input.nodeId,
      expiresAt: input.expiresAt,
      note: ""
    });

    // 2. Create Artifact (Runtime)
    artifactResult = runtimeCore.createSubscriptionArtifact(tenantResult.tenant.id);
    tenantRef = safeRef("tenant", tenantResult.tenant.id);
    artifactRef = safeRef("artifact", artifactResult.artifact.id);

    runControlFinalization(controlStore, () => {
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
    });
  } catch (error) {
    if (tenantResult?.tenant?.id || artifactResult?.artifact?.id) {
      const compensation = compensateRuntimeMutation({ runtimeCore, tenantResult, artifactResult });
      recordCompensatedFailure({ controlStore, control, tenantRef, artifactRef, issuedAt, compensation });
      const compensatedError = new Error("issuance failed after runtime mutation; runtime changes were compensated");
      compensatedError.code = "issuance_compensated";
      compensatedError.cause = error;
      compensatedError.compensation = compensation;
      throw compensatedError;
    }
    throw error;
  }

  // 3. Prepare separated materials
  const handoffMaterial = {
    approvalRef,
    tenantId: tenantResult.tenant.id,
    artifactId: artifactResult.artifact.id,
    subscriptionUrl: artifactResult.subscriptionUrl,
    issuedAt,
    expiresAt: tenantResult.tenant.expiresAt,
    validUntil: tenantResult.tenant.expiresAt
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
