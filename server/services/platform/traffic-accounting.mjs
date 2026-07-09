import { createHash } from "node:crypto";
import {
  summarizeUsageSamples,
  usageCycleFiltersForBinding
} from "./usage-billing-cycle.mjs";

function trafficError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function text(value) {
  return String(value ?? "").trim();
}

function requiredText(value, field) {
  const normalized = text(value);
  if (!normalized) {
    throw trafficError("validation_error", `${field} is required`);
  }
  return normalized;
}

function integer(value, field, { min = 0 } = {}) {
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized < min) {
    throw trafficError("validation_error", `${field} must be an integer >= ${min}`);
  }
  return normalized;
}

function isoText(value, field) {
  const raw = requiredText(value, field);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw trafficError("validation_error", `${field} must be a valid ISO timestamp`);
  }
  return date.toISOString();
}

function isoNow(nowFn) {
  const value = typeof nowFn === "function" ? nowFn() : new Date();
  return isoText(value instanceof Date ? value.toISOString() : value, "now");
}

function defaultSampleDigest(record) {
  const digest = createHash("sha256")
    .update(record.sourceRef)
    .update("\0")
    .update(record.channelRef)
    .update("\0")
    .update(record.edgeCredentialRef)
    .update("\0")
    .update(record.observedAt)
    .update("\0")
    .update(record.intervalStartedAt)
    .update("\0")
    .update(record.intervalEndedAt)
    .update("\0")
    .update(String(record.uploadBytes))
    .update("\0")
    .update(String(record.downloadBytes))
    .digest("hex");
  return `sha256:${digest}`;
}

function defaultSampleRefFactory({ sampleDigest }) {
  return `usage_${sampleDigest.replace(/^sha256:/, "").slice(0, 24)}`;
}

function quotaDecision({ binding, usage }) {
  const trafficLimitBytes = Number(binding?.trafficLimitBytes ?? 0);
  const usedBytes = Number(usage?.totalBytes ?? 0);
  if (!trafficLimitBytes) {
    return {
      status: "unmetered_no_limit",
      nextAction: "continue_metering_without_quota_disable"
    };
  }
  if (usedBytes >= trafficLimitBytes) {
    return {
      status: "over_quota_disable_required",
      nextAction: "suspend_traffic_supply_through_controlled_gate",
      lifecycleAction: "traffic_supply_suspend_required",
      trafficSupply: {
        status: "suspend_required",
        scope: "order_resource",
        reason: "quota_exhausted",
        accountMutationRequired: false
      }
    };
  }
  return {
    status: "within_quota",
    nextAction: "continue_metering"
  };
}

export function createTrafficAccountingService({
  controlStore,
  nowFn = () => new Date(),
  usageSampleRefFactory = defaultSampleRefFactory,
  sampleDigestFactory = defaultSampleDigest
} = {}) {
  if (
    !controlStore
    || typeof controlStore.findIssuedSubscriptionBindingByEdgeCredentialRef !== "function"
    || typeof controlStore.recordUsageSample !== "function"
  ) {
    throw trafficError("validation_error", "controlStore with usage methods is required");
  }

  function recordUsageObservation(input = {}) {
    const normalized = {
      sourceRef: requiredText(input.sourceRef, "sourceRef"),
      channelRef: requiredText(input.channelRef, "channelRef"),
      edgeCredentialRef: requiredText(input.edgeCredentialRef, "edgeCredentialRef"),
      observedAt: isoText(input.observedAt, "observedAt"),
      intervalStartedAt: isoText(input.intervalStartedAt, "intervalStartedAt"),
      intervalEndedAt: isoText(input.intervalEndedAt, "intervalEndedAt"),
      uploadBytes: integer(input.uploadBytes ?? 0, "uploadBytes", { min: 0 }),
      downloadBytes: integer(input.downloadBytes ?? 0, "downloadBytes", { min: 0 })
    };
    const binding = controlStore.findIssuedSubscriptionBindingByEdgeCredentialRef(normalized.edgeCredentialRef);
    if (!binding || binding.nodeId !== normalized.channelRef) {
      return {
        ok: false,
        status: "unresolved_binding",
        sourceRef: normalized.sourceRef,
        channelRef: normalized.channelRef,
        edgeCredentialRef: normalized.edgeCredentialRef,
        sampleInserted: false,
        sample: null,
        rollup: null,
        quota: null,
        nextAction: "review_collector_mapping_before_quota_decision",
        execution: {
          directRuntimeMutationAllowed: false,
          subscriptionMutationRequired: false
        },
        safety: {
          noRawRuntimePayload: true,
          noSecretMaterialReturned: true
        }
      };
    }

    const sampleDigest = requiredText(sampleDigestFactory(normalized), "sampleDigest");
    const sampleId = requiredText(usageSampleRefFactory({
      ...normalized,
      binding,
      sampleDigest
    }), "usageSampleRef");
    const usage = controlStore.recordUsageSample({
      id: sampleId,
      ...normalized,
      accountId: binding.accountId,
      entitlementId: binding.entitlementId,
      requestId: binding.requestId,
      sampleDigest,
      createdAt: isoNow(nowFn)
    });
    const currentCycleUsage = currentCycleUsageFor({
      controlStore,
      binding,
      observedAt: normalized.observedAt,
      fallbackRollup: usage.rollup
    });
    const decision = quotaDecision({
      binding,
      usage: currentCycleUsage
    });

    return {
      ok: true,
      status: decision.status,
      sourceRef: normalized.sourceRef,
      channelRef: normalized.channelRef,
      edgeCredentialRef: normalized.edgeCredentialRef,
      requestId: binding.requestId,
      accountId: binding.accountId,
      portalUserRef: binding.portalUserRef,
      entitlementId: binding.entitlementId,
      sampleInserted: usage.inserted,
      sample: usage.sample,
      rollup: usage.rollup,
      quota: {
        trafficLimitBytes: binding.trafficLimitBytes,
        usedBytes: currentCycleUsage.totalBytes
      },
      nextAction: decision.nextAction,
      execution: {
        directRuntimeMutationAllowed: false,
        subscriptionMutationRequired: decision.status === "over_quota_disable_required",
        trafficSupplyMutationRequired: decision.status === "over_quota_disable_required",
        accountMutationRequired: false
      },
      lifecycleAction: decision.lifecycleAction,
      trafficSupply: decision.trafficSupply,
      safety: {
        noRawRuntimePayload: true,
        noSecretMaterialReturned: true
      }
    };
  }

  return {
    recordUsageObservation
  };
}

function currentCycleUsageFor({ controlStore, binding, observedAt, fallbackRollup }) {
  if (typeof controlStore?.listUsageSamples !== "function") {
    return {
      uploadBytes: Number(fallbackRollup?.uploadBytes ?? 0),
      downloadBytes: Number(fallbackRollup?.downloadBytes ?? 0),
      totalBytes: Number(fallbackRollup?.totalBytes ?? 0)
    };
  }
  const samples = controlStore.listUsageSamples({
    requestId: binding.requestId,
    ...usageCycleFiltersForBinding(binding, observedAt)
  });
  const summary = summarizeUsageSamples(samples);
  return {
    uploadBytes: summary.uploadBytes,
    downloadBytes: summary.downloadBytes,
    totalBytes: summary.totalBytes
  };
}
