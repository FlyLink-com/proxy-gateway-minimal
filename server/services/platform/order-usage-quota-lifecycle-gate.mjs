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

function trafficSupplySummary(decision = {}) {
  const source = decision.trafficSupply && typeof decision.trafficSupply === "object"
    ? decision.trafficSupply
    : {};
  const status = text(source.status || (
    decision.lifecycleAction === "traffic_supply_suspend_required"
      ? "suspend_required"
      : ""
  ));
  if (!status) {
    return null;
  }
  return {
    status,
    scope: text(source.scope || "order_resource"),
    reason: text(source.reason || "quota_exhausted"),
    accountMutationRequired: source.accountMutationRequired === true
  };
}

function baseResult(decision = {}) {
  const trafficSupply = trafficSupplySummary(decision);
  return {
    type: "order_usage_quota_lifecycle_gate_result",
    requestRef: safeRef(decision.requestId),
    portalUserRef: safeRef(decision.portalUserRef),
    accountId: safeRef(decision.accountId),
    entitlementId: safeRef(decision.entitlementId),
    channelRef: safeRef(decision.channelRef),
    edgeCredentialRef: safeRef(decision.edgeCredentialRef),
    quota: quotaSummary(decision),
    ...(trafficSupply ? { trafficSupply } : {}),
    safety: {
      noSubscriptionUrl: true,
      noRuntimeSecretMaterial: true,
      noRawRuntimePayload: true,
      noDirectRuntimeMutation: true,
      noAccountDisable: true
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

function requiresTrafficSupplySuspend(decision = {}) {
  return decision?.status === "over_quota_disable_required"
    || decision?.lifecycleAction === "traffic_supply_suspend_required"
    || decision?.trafficSupply?.status === "suspend_required";
}

export function createOrderUsageQuotaLifecycleGate({
  orderLifecycleService
} = {}) {
  if (
    !orderLifecycleService
    || (
      typeof orderLifecycleService.suspendTrafficSupply !== "function"
      && typeof orderLifecycleService.disableSubscription !== "function"
    )
  ) {
    throw gateError("validation_error", "orderLifecycleService.suspendTrafficSupply is required");
  }
  const suspendTrafficSupply = typeof orderLifecycleService.suspendTrafficSupply === "function"
    ? orderLifecycleService.suspendTrafficSupply.bind(orderLifecycleService)
    : orderLifecycleService.disableSubscription.bind(orderLifecycleService);

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

    if (!requiresTrafficSupplySuspend(decision)) {
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
        nextAction: "resolve_order_owner_before_traffic_supply_suspend",
        mutation: false,
        blockers: [
          {
            code: "order_owner_resolution_required"
          }
        ]
      };
    }

    const executeTrafficSupplySuspend = options.executeControlledTrafficSupplySuspend === true
      || options.executeControlledDisable === true;
    if (executeTrafficSupplySuspend !== true) {
      return {
        ...resultBase,
        portalUserRef,
        ok: true,
        status: "controlled_traffic_supply_suspend_required",
        nextAction: "request_controlled_traffic_supply_suspend_approval",
        mutation: false,
        execution: {
          trafficSupplySuspendRequired: true,
          trafficSupplySuspendExecuted: false,
          accountMutationRequired: false
        }
      };
    }

    const suspendedOrder = suspendTrafficSupply({
      requestRef,
      portalUserRef,
      reviewedByRef: safeRef(options.reviewedByRef) || "usage_quota_gate"
    });
    const runtimeEnforcementState = text(suspendedOrder?.runtimeEnforcement?.state);
    const runtimeEnforcementApplied = runtimeEnforcementState === "applied";
    const runtimeEnforcementFailed = runtimeEnforcementState === "failed";

    return {
      ...resultBase,
      portalUserRef,
      ok: !runtimeEnforcementFailed,
      status: runtimeEnforcementFailed
        ? "controlled_traffic_supply_suspend_failed"
        : runtimeEnforcementApplied
          ? "controlled_traffic_supply_suspend_completed"
          : "controlled_traffic_supply_suspend_pending",
      nextAction: runtimeEnforcementApplied
        ? "traffic_supply_suspended_review_edge_lifecycle"
        : runtimeEnforcementFailed
          ? "review_edge_runtime_enforcement_failure"
          : "wait_for_edge_runtime_enforcement",
      mutation: runtimeEnforcementApplied,
      execution: {
        trafficSupplySuspendRequired: true,
        trafficSupplySuspendExecuted: runtimeEnforcementApplied,
        accountMutationRequired: false
      },
      ...(runtimeEnforcementFailed ? {
        blockers: [{ code: "edge_runtime_enforcement_failed" }]
      } : {}),
      suspendedOrder: summarizeOrder(suspendedOrder)
    };
  }

  return {
    handleUsageDecision
  };
}
