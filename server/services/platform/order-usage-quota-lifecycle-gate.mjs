const SAFE_REF_PATTERN = /^[A-Za-z0-9._:-]{1,160}$/;

function gateError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function text(value) {
  return String(value ?? "").trim();
}

function safeRef(value) {
  const normalized = text(value);
  return SAFE_REF_PATTERN.test(normalized) ? normalized : "";
}

function safeNumber(value) {
  const normalized = Number(value ?? 0);
  return Number.isFinite(normalized) && normalized >= 0 ? normalized : 0;
}

function quotaSummary(decision = {}) {
  return {
    trafficLimitBytes: safeNumber(decision.quota?.trafficLimitBytes),
    usedBytes: safeNumber(decision.quota?.usedBytes)
  };
}

function baseResult(decision = {}) {
  return {
    type: "order_usage_quota_lifecycle_gate_result",
    requestRef: safeRef(decision.requestId),
    portalUserRef: safeRef(decision.portalUserRef),
    accountId: safeRef(decision.accountId),
    entitlementId: safeRef(decision.entitlementId),
    channelRef: safeRef(decision.channelRef),
    edgeCredentialRef: safeRef(decision.edgeCredentialRef),
    quota: quotaSummary(decision),
    safety: {
      noSubscriptionUrl: true,
      noRuntimeSecretMaterial: true,
      noRawRuntimePayload: true,
      noDirectRuntimeMutation: true
    }
  };
}

function summarizeOrder(order = {}) {
  return {
    id: safeRef(order.id),
    status: text(order.status),
    nextAction: text(order.nextAction),
    edgeChannelRef: safeRef(order.edgeChannelRef),
    edgeCredentialRef: safeRef(order.edgeCredentialRef),
    safety: {
      noSubscriptionUrl: true
    }
  };
}

export function createOrderUsageQuotaLifecycleGate({
  orderLifecycleService
} = {}) {
  if (!orderLifecycleService || typeof orderLifecycleService.disableSubscription !== "function") {
    throw gateError("validation_error", "orderLifecycleService.disableSubscription is required");
  }

  function handleUsageDecision(decision = {}, options = {}) {
    const resultBase = baseResult(decision);

    if (decision?.execution?.directRuntimeMutationAllowed === true) {
      return {
        ...resultBase,
        ok: false,
        status: "blocked",
        nextAction: "review_unsafe_runtime_mutation_flag",
        mutation: false,
        blockers: [
          {
            code: "direct_runtime_mutation_not_allowed"
          }
        ]
      };
    }

    if (decision?.ok === false || decision?.status === "unresolved_binding") {
      return {
        ...resultBase,
        ok: false,
        status: "blocked",
        nextAction: "review_collector_mapping_before_quota_decision",
        mutation: false,
        blockers: [
          {
            code: "usage_binding_unresolved"
          }
        ]
      };
    }

    if (decision?.status !== "over_quota_disable_required") {
      return {
        ...resultBase,
        ok: true,
        status: "no_action_required",
        nextAction: decision?.nextAction || "continue_metering",
        mutation: false
      };
    }

    const requestRef = resultBase.requestRef;
    const portalUserRef = safeRef(options.portalUserRef) || resultBase.portalUserRef;
    if (!requestRef || !portalUserRef) {
      return {
        ...resultBase,
        portalUserRef,
        ok: false,
        status: "blocked",
        nextAction: "resolve_order_owner_before_disable",
        mutation: false,
        blockers: [
          {
            code: "order_owner_resolution_required"
          }
        ]
      };
    }

    if (options.executeControlledDisable !== true) {
      return {
        ...resultBase,
        portalUserRef,
        ok: true,
        status: "controlled_disable_required",
        nextAction: "request_controlled_disable_approval",
        mutation: false,
        execution: {
          controlledDisableRequired: true,
          controlledDisableExecuted: false
        }
      };
    }

    const disabledOrder = orderLifecycleService.disableSubscription({
      requestRef,
      portalUserRef,
      reviewedByRef: safeRef(options.reviewedByRef) || "usage_quota_gate"
    });

    return {
      ...resultBase,
      portalUserRef,
      ok: true,
      status: "controlled_disable_completed",
      nextAction: "order_disabled_review_edge_lifecycle",
      mutation: true,
      execution: {
        controlledDisableRequired: true,
        controlledDisableExecuted: true
      },
      disabledOrder: summarizeOrder(disabledOrder)
    };
  }

  return {
    handleUsageDecision
  };
}

